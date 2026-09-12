import type { NextRequest } from "next/server";

import { getProfile, hasAnyRole } from "@/lib/auth/profile";
import {
  getCasualtyReport,
  logReportExport,
  ReportTooLargeError,
} from "@/lib/casualty-report";
import {
  parseRange,
  reportFileNames,
  reporterLine,
  reportTitle,
  toCsv,
  type ReportError,
} from "@/lib/casualty-report-format";
import { buildCasualtyXlsx } from "@/lib/casualty-report-xlsx";

/**
 * GET /monitor/report?format=xlsx|csv&from=YYYY-MM-DDTHH:mm&to=…
 * ดาวน์โหลดรายงานสรุปกำลังพลบาดเจ็บ (F7)
 *
 * ★ ลำดับในไฟล์นี้คือมาตรการความปลอดภัย ห้ามสลับ
 *   1. เช็คบทบาท **ก่อน** ยิง query — คนที่ไม่มีสิทธิ์ต้องไม่ทำให้เกิด query ชื่อผู้ป่วยเลย
 *   2. ดึงข้อมูลผ่าน RLS ด้วย session ของผู้ใช้
 *   3. บันทึก event_log — **ถ้าไม่สำเร็จ ไม่ส่งไฟล์** (fail closed)
 *   4. สร้างไฟล์และส่งออก
 *
 * ★ ไฟล์มีชื่อ-สกุลผู้ป่วย จึงห้าม cache ทุกชั้น (no-store)
 *   ไม่งั้น proxy หรือเบราว์เซอร์เครื่องที่ใช้ร่วมกันจะเก็บสำเนาไว้โดยไม่มีใครรู้
 *
 * ★ ข้อผิดพลาดที่ผู้ใช้แก้เองได้ พากลับไปหน้าเดิมพร้อมข้อความ ไม่ใช่หน้า error เปล่า
 *   และคงค่าช่วงเวลาที่กรอกไว้ ผู้ใช้จะได้ไม่ต้องเลือกใหม่ทั้งหมด
 */

/** บทบาทที่เห็นหน้า /monitor อยู่แล้ว — commander ดาวน์โหลดรายงานส่งผู้บังคับบัญชาได้ด้วย */
const REPORT_ROLES = ["monitor", "commander"] as const;

function backToForm(
  request: NextRequest,
  error: ReportError,
  from: string | null,
  to: string | null,
): Response {
  const url = new URL("/monitor", request.url);
  url.searchParams.set("reportError", error);
  if (from) url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);
  url.hash = "report";
  return Response.redirect(url, 303);
}

function plain(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const profile = await getProfile();
  if (!profile) return plain(401, "กรุณาเข้าสู่ระบบก่อนดาวน์โหลดรายงาน");

  // ไม่บอกว่าต้องเป็นบทบาทอะไร — การบอกชื่อบทบาทคือการยืนยันว่าบทบาทนั้นมีอยู่ (no-access.tsx)
  if (!hasAnyRole(profile, REPORT_ROLES)) {
    return plain(403, "บัญชีของคุณไม่มีสิทธิ์ดาวน์โหลดรายงานนี้");
  }

  const sp = request.nextUrl.searchParams;
  const format = sp.get("format");
  const fromRaw = sp.get("from");
  const toRaw = sp.get("to");

  if (format !== "xlsx" && format !== "csv") return backToForm(request, "invalid", fromRaw, toRaw);

  const range = parseRange(fromRaw, toRaw);
  if (!range.ok) return backToForm(request, range.error, fromRaw, toRaw);

  let report: Awaited<ReturnType<typeof getCasualtyReport>>;
  try {
    report = await getCasualtyReport(range.from, range.to);
  } catch (e) {
    return backToForm(request, e instanceof ReportTooLargeError ? "too_many" : "failed", fromRaw, toRaw);
  }

  const logged = await logReportExport({
    actorId: profile.id,
    format,
    from: range.from,
    to: range.to,
    caseIds: report.caseIds,
  });
  if (!logged) return backToForm(request, "audit_failed", fromRaw, toRaw);

  const names = reportFileNames(range.from, range.to, format);
  const body =
    format === "xlsx"
      ? await buildCasualtyXlsx({
          rows: report.rows,
          counts: report.counts,
          title: reportTitle(range.from, range.to),
          reporter: reporterLine(profile.unitName),
        })
      : new TextEncoder().encode(toCsv(report.rows));

  return new Response(body as BodyInit, {
    headers: {
      "Content-Type":
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${names.ascii}"; filename*=UTF-8''${encodeURIComponent(names.thai)}`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
