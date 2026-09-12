import { createClient } from "@/lib/supabase/server";
import {
  buildReportRows,
  countTriage,
  MAX_REPORT_ROWS,
  type ReportCaseInput,
  type ReportRow,
  type TriageCounts,
} from "./casualty-report-format.ts";
import type {
  CaseOutcome,
  DispositionRoute,
  LegStatus,
  PatientCategory,
  TriageColor,
} from "@/lib/enums";

/**
 * ดึงข้อมูลรายงานสรุปกำลังพลบาดเจ็บ (F7) และบันทึกประวัติการดาวน์โหลด
 *
 * ★ ไม่ใช้ view v_casualty_report ที่ 0011 เตรียมไว้ — โดยเจตนา
 *   view นั้นคืน patient_alias แทนชื่อ และห้าม join ตาราง casualty (AI_RULES §3.1)
 *   ซึ่งถูกต้องสำหรับ view สถิติ แต่รายงานนี้ต้องมีชื่อ-สกุลตามแบบที่หน่วยใช้จริง
 *   เจ้าของโครงการตัดสินให้ใส่ชื่อ พร้อมบันทึก event_log ทุกครั้ง (12 ก.ย. 2569)
 *   การ join จึงเกิดที่นี่ที่เดียว หลังเช็คบทบาทแล้ว ไม่ได้ฝังอยู่ใน view ที่ใครก็ select ได้
 *
 * ★ ใช้ client ที่ผูกกับ session ของผู้ใช้ ไม่มี service_role
 *   casualty_select กับ case_select ผ่าน can_see_case() — ผู้ใช้ได้เฉพาะเคสที่มีสิทธิ์เห็นอยู่แล้ว
 */

/** ชนเพดานจำนวนแถว — ต้องบอกผู้ใช้ ห้ามตัดทิ้งแล้วส่งรายงานที่ขาดไปเงียบๆ */
export class ReportTooLargeError extends Error {}

const REPORT_SELECT = `
  id, case_code, requested_at, triage, patient_category, injury_place,
  chief_complaint, outcome, disposition_route,
  casualty (rank_th, first_name, last_name, affiliation),
  legs:transfer_leg (leg_no, status, to_unit:to_unit_id (name_th))
`;

type Name = { name_th: string };
type RawCasualty = {
  rank_th: string | null;
  first_name: string | null;
  last_name: string | null;
  affiliation: string | null;
};
type RawReportCase = {
  id: string;
  case_code: string;
  requested_at: string;
  triage: string | null;
  patient_category: string | null;
  injury_place: string | null;
  chief_complaint: string;
  outcome: string | null;
  disposition_route: string | null;
  casualty: RawCasualty | RawCasualty[] | null;
  legs: { leg_no: number; status: string; to_unit: Name | Name[] | null }[] | null;
};

/** PostgREST คืน relation แบบ one-to-one เป็น object แต่บางรูปแบบ query คืนเป็น array */
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function toInput(c: RawReportCase): ReportCaseInput {
  const cas = one(c.casualty);
  return {
    caseCode: c.case_code,
    requestedAt: c.requested_at,
    rankTh: cas?.rank_th ?? null,
    firstName: cas?.first_name ?? null,
    lastName: cas?.last_name ?? null,
    affiliation: cas?.affiliation ?? null,
    injuryPlace: c.injury_place,
    category: (c.patient_category as PatientCategory | null) ?? null,
    chiefComplaint: c.chief_complaint,
    triage: (c.triage as TriageColor | null) ?? null,
    outcome: (c.outcome as CaseOutcome | null) ?? null,
    dispositionRoute: (c.disposition_route as DispositionRoute | null) ?? null,
    legs: (c.legs ?? []).map((l) => ({
      legNo: l.leg_no,
      status: l.status as LegStatus,
      toUnit: one(l.to_unit)?.name_th ?? "-",
    })),
  };
}

export async function getCasualtyReport(
  from: Date,
  to: Date,
): Promise<{ rows: ReportRow[]; counts: TriageCounts; caseIds: string[] }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("case")
    .select(REPORT_SELECT)
    // ช่วงครึ่งเปิด [from, to) — รายงานวันต่อวันจะไม่นับเคสที่เปิดตรง 18:00 ซ้ำสองฉบับ
    .gte("requested_at", from.toISOString())
    .lt("requested_at", to.toISOString())
    .neq("status", "cancelled")
    .order("requested_at", { ascending: true })
    // ขอเกินเพดานหนึ่งแถว เพื่อรู้ว่าชนเพดานจริง ไม่ใช่มีพอดีเพดาน
    .limit(MAX_REPORT_ROWS + 1);

  /**
   * 🔴 ห้ามคืนรายงานว่างเมื่อ query ล้ม
   *   รายงานที่ไม่มีแถวอ่านได้ว่า "วันนี้ไม่มีผู้บาดเจ็บ" ซึ่งเป็นรายงานเท็จที่ดูน่าเชื่อที่สุด
   */
  if (error) throw new Error(`ดึงข้อมูลรายงานไม่สำเร็จ: ${error.code ?? error.message}`);

  const raw = (data ?? []) as unknown as RawReportCase[];
  if (raw.length > MAX_REPORT_ROWS) throw new ReportTooLargeError();

  const rows = buildReportRows(raw.map(toInput));
  return { rows, counts: countTriage(rows), caseIds: raw.map((c) => c.id) };
}

/**
 * บันทึกลง event_log ว่าใครดาวน์โหลดรายงานช่วงไหน — หนึ่งแถวต่อหนึ่งเคสในไฟล์
 *
 * ★ ทำไมหนึ่งแถวต่อเคส ไม่ใช่แถวเดียวต่อการดาวน์โหลด
 *   AI_RULES §3.4 สิทธิเข้าถึง — ระบบต้องตอบได้ว่า "ใครดูข้อมูลเคสใดเมื่อไร"
 *   แถวเดียวที่บอกแค่ช่วงเวลาตอบคำถามนั้นไม่ได้ เมื่อเคสถูกแก้เวลาเปิดคำขอหรือถูกลบทีหลัง
 *   export_id ผูกทุกแถวของการดาวน์โหลดครั้งเดียวกันไว้ด้วยกัน
 *
 * ★ payload ไม่มีชื่อผู้ป่วยแม้แต่ตัวเดียว (คอมเมนต์ของคอลัมน์นี้ใน 0008 ห้ามไว้)
 *
 * ★ ห้าม .select() ต่อท้าย INSERT (HANDOFF §5 ข้อ 10) — INSERT ที่ RLS ปฏิเสธโยน error เองอยู่แล้ว
 *
 * คืน false เมื่อบันทึกไม่สำเร็จ ผู้เรียกต้องไม่ส่งไฟล์ออกไป (fail closed)
 * บันทึกประวัติคือมาตรการชดเชยของการยอมให้ชื่อผู้ป่วยออกไปอยู่นอกระบบ ไม่มีบันทึก ไม่มีไฟล์
 */
export async function logReportExport(args: {
  actorId: string;
  format: "xlsx" | "csv";
  from: Date;
  to: Date;
  caseIds: readonly string[];
}): Promise<boolean> {
  const supabase = await createClient();

  const payload = {
    export_id: crypto.randomUUID(),
    format: args.format,
    from: args.from.toISOString(),
    to: args.to.toISOString(),
    row_count: args.caseIds.length,
  };

  // รายงานว่างก็ต้องบันทึก — "ดาวน์โหลดแล้วไม่มีผู้บาดเจ็บ" เป็นข้อเท็จจริงที่ต้องย้อนดูได้
  const ids: (string | null)[] = args.caseIds.length > 0 ? [...args.caseIds] : [null];

  const { error } = await supabase.from("event_log").insert(
    ids.map((caseId) => ({
      case_id: caseId,
      actor_id: args.actorId,
      action: "report.casualty_exported",
      to_value: args.format,
      payload,
    })),
  );

  return !error;
}
