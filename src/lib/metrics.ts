import { createClient } from "@/lib/supabase/server";
import { median } from "@/lib/duration";
import type { PrecedenceLevel, TriageColor } from "@/lib/enums";

// ส่งต่อให้หน้าที่ import จาก metrics เดิมยังใช้ได้ ตัวจริงอยู่ใน duration.ts
export { formatDuration, median } from "@/lib/duration";

/**
 * ตัวเลขของแดชบอร์ด (F4 · Prompt 09)
 *
 * ★ สูตร median กับการจัดรูปแบบเวลาอยู่ใน src/lib/duration.ts
 *   ซึ่งเป็นตรรกะบริสุทธิ์ที่มีชุดทดสอบกำกับ (npm run test:unit)
 *
 * ★ คำนวณ median ฝั่งเว็บโดยเจตนา ไม่ทำเป็น SQL function
 *   ข้อมูลระดับ prototype มีหลักสิบแถว การดึงมาคำนวณจึงถูกกว่าการเพิ่ม
 *   function ใน database ที่ต้องมาคิดเรื่อง security definer/invoker ให้ถูกอีกชั้น
 *   ทุกแถวที่ดึงมาผ่าน RLS ของ view (security_invoker) อยู่แล้ว
 *   ถ้าวันหนึ่งข้อมูลโตถึงหลักหมื่น ค่อยย้ายไปเป็น percentile_cont ใน SQL
 *
 * ★ ทุกตัวเลขคืน null เมื่อไม่มีข้อมูล ไม่ใช่ 0
 *   0 แปลว่า "วัดแล้วได้ศูนย์" ซึ่งคนละความหมายกับ "ยังไม่มีอะไรให้วัด"
 *   หน้าจอต้องแยกสองอย่างนี้ให้ออก (ข้อกำหนดของ Prompt 09)
 */

export type Metrics = {
  /** เคสที่เปิดวันนี้ตามเวลาไทย */
  casesToday: number;
  /** เคสที่ยังไม่ปิด — ตัวเลขนี้ 0 ได้จริงและมีความหมาย จึงไม่ใช่ null */
  casesOpen: number;
  /** มัธยฐานเวลารอจัดรถ (วินาที) — null เมื่อยังไม่มีทอดที่ส่งมอบเสร็จ */
  medianWaitSec: number | null;
  /** มัธยฐานเวลารวมต่อทอด (วินาที) */
  medianLegTotalSec: number | null;
  /** มัธยฐานเวลารวมทั้งเคส ตั้งแต่ทอดแรกถึงทอดสุดท้าย (วินาที) */
  medianCaseTotalSec: number | null;
  /** จำนวนทอดที่วัดได้ ใช้บอกว่าตัวเลขข้างบนคำนวณจากกี่รายการ */
  legSampleSize: number;
  /** จำนวนเคสที่วัดได้ครบวงจร */
  caseSampleSize: number;
  /** การกระจายตามความเร่งด่วน นับจากเคสทั้งหมดที่ผู้ใช้เห็น */
  byPrecedence: Record<PrecedenceLevel, number>;
  /** การกระจายตามสี triage — null คือเคสที่ยังไม่ได้คัดแยก */
  byTriage: Record<TriageColor | "unknown", number>;
  /** จำนวนเคสทั้งหมดที่ผู้ใช้คนนี้มีสิทธิ์เห็น */
  caseTotal: number;
};

const EMPTY_PRECEDENCE: Record<PrecedenceLevel, number> = {
  urgent: 0,
  priority: 0,
  routine: 0,
};

const EMPTY_TRIAGE: Record<TriageColor | "unknown", number> = {
  black: 0,
  red: 0,
  yellow: 0,
  green: 0,
  unknown: 0,
};

export async function getMetrics(): Promise<Metrics> {
  const supabase = await createClient();

  /**
   * วันนี้ตามเวลาไทย ไม่ใช่ตาม timezone ของเครื่องที่รันโค้ด
   * Vercel รันเป็น UTC ถ้าใช้ toISOString() ตรงๆ เคสที่เปิดตอนตี 1 ของไทย
   * จะถูกนับเป็นของเมื่อวาน ซึ่งเป็นบั๊กที่โผล่เฉพาะช่วงเที่ยงคืนถึงเจ็ดโมงเช้า
   */
  const todayBangkok = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [{ data: legs }, { data: cases }, { data: caseMetrics }] =
    await Promise.all([
      supabase
        .from("v_leg_metrics")
        .select("request_to_dispatch_sec, leg_total_sec"),
      supabase.from("case").select("status, precedence, triage, requested_at"),
      supabase
        .from("v_case_metrics")
        .select("total_evacuation_sec, status")
        .eq("status", "completed"),
    ]);

  const legRows = legs ?? [];
  const caseRows = cases ?? [];

  const medianWaitSec = median(
    legRows
      .map((l) => Number(l.request_to_dispatch_sec))
      .filter((n) => Number.isFinite(n)),
  );

  const medianLegTotalSec = median(
    legRows.map((l) => Number(l.leg_total_sec)).filter((n) => Number.isFinite(n)),
  );

  const caseSecs = (caseMetrics ?? [])
    .map((c) => Number(c.total_evacuation_sec))
    .filter((n) => Number.isFinite(n));

  const byPrecedence = { ...EMPTY_PRECEDENCE };
  const byTriage = { ...EMPTY_TRIAGE };

  for (const c of caseRows) {
    const p = c.precedence as PrecedenceLevel;
    if (p in byPrecedence) byPrecedence[p] += 1;

    const t = (c.triage as TriageColor | null) ?? "unknown";
    if (t in byTriage) byTriage[t] += 1;
  }

  return {
    casesToday: caseRows.filter((c) => {
      // requested_at เป็น ISO ที่มี timezone ติดมา แปลงเป็นวันที่ไทยก่อนเทียบ
      const d = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(c.requested_at));
      return d === todayBangkok;
    }).length,

    casesOpen: caseRows.filter(
      (c) => c.status === "requested" || c.status === "active",
    ).length,

    medianWaitSec,
    medianLegTotalSec,
    medianCaseTotalSec: median(caseSecs),
    legSampleSize: legRows.length,
    caseSampleSize: caseSecs.length,
    byPrecedence,
    byTriage,
    caseTotal: caseRows.length,
  };
}
