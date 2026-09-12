import { TRIAGE } from "./triage.ts";
import type {
  CaseOutcome,
  DispositionRoute,
  LegStatus,
  PatientCategory,
  TriageColor,
} from "@/lib/enums";

/**
 * รายงานสรุปกำลังพลบาดเจ็บ (F7) — ตรรกะบริสุทธิ์ มีชุดทดสอบกำกับ
 *
 * ★ รูปแบบมาจากรายงานประจำวันที่หน่วยใช้จริง (เจ้าของโครงการส่งตัวอย่างมา 12 ก.ย. 2569)
 *   สย. · ลำดับ · ชื่อ · สกุล · สังกัด · เหตุการณ์ · ประเภท · อาการ
 *   · สถานะแรกรับ · สถานะส่งต่อ · รวม · ระดับ
 *   ตรงกับ Export spec ใน PROJECT.md §5.1 ที่วางไว้ตั้งแต่ต้นโครงการ
 *
 * ★ แยกสามไฟล์ด้วยเหตุผลคนละข้อ (แบบเดียวกับชุด monitor-view / routes / monitor-resources)
 *   ไฟล์นี้          ตรรกะล้วน ไม่แตะฐานข้อมูล · `node --test` ทดสอบได้
 *   casualty-report.ts       ดึงข้อมูลผ่าน RLS + บันทึก event_log
 *   casualty-report-xlsx.ts  สร้างไฟล์ Excel ด้วย exceljs (ฝั่ง server เท่านั้น)
 *
 * ★ กติกา import ของไฟล์ที่มีชุดทดสอบ
 *   ค่า runtime ต้อง import แบบ relative พร้อม `.ts` · `@/` ใช้ได้เฉพาะ `import type`
 *   ถ้าเผลอใช้ `@/` กับค่า runtime เทสต์จะล้มด้วย ERR_MODULE_NOT_FOUND ทั้งที่ typecheck ผ่าน
 *
 * ★ "สย." (ส่วนแยก) เว้นว่างโดยเจตนา — คำสั่งเจ้าของโครงการ 12 ก.ย. 2569
 *   ระบบยังไม่มีข้อมูลว่าเคสไหนอยู่ส่วนแยกใด การเดาจากหน่วยต้นทางหรือสถานพยาบาลแรกรับ
 *   จะได้ตัวเลขที่ดูน่าเชื่อแต่ผิด ช่องว่างที่ส่วนแยกกรอกเองดีกว่าช่องที่ระบบกรอกผิด
 */

export const BANGKOK_OFFSET = "+07:00";
const DAY_MS = 24 * 60 * 60 * 1000;
/** ยาวสุดประมาณหนึ่งไตรมาส — กันไฟล์ใหญ่จนเปิดไม่ขึ้นและกันการดึงข้อมูลชื่อทั้งระบบในคลิกเดียว */
export const MAX_RANGE_DAYS = 93;
/** เพดานจำนวนเคสต่อไฟล์ — ถ้าชนเพดานต้องบอกผู้ใช้ ห้ามตัดทิ้งเงียบๆ */
export const MAX_REPORT_ROWS = 2000;

const DASH = "-";

/* -------------------------------------------------------------
 * ชนิดข้อมูล
 * ----------------------------------------------------------- */

export type ReportLeg = { legNo: number; status: LegStatus; toUnit: string };

/** หนึ่งเคสในรูปที่ดึงมาจากฐานข้อมูลแล้ว ก่อนจัดเป็นแถวรายงาน */
export type ReportCaseInput = {
  caseCode: string;
  requestedAt: string;
  rankTh: string | null;
  firstName: string | null;
  lastName: string | null;
  affiliation: string | null;
  injuryPlace: string | null;
  category: PatientCategory | null;
  chiefComplaint: string;
  triage: TriageColor | null;
  outcome: CaseOutcome | null;
  dispositionRoute: DispositionRoute | null;
  legs: readonly ReportLeg[];
};

export type ForwardKind = "died" | "returned" | "civilian" | "chain" | "at_first" | "none";

export type ReportRow = {
  no: number;
  caseCode: string;
  requestedAt: string;
  /** สย. — ว่างไว้ให้ส่วนแยกกรอกเอง */
  sector: string;
  firstName: string;
  lastName: string;
  affiliation: string;
  incident: string;
  category: string;
  symptoms: string;
  firstFacility: string;
  forward: string;
  forwardKind: ForwardKind;
  triage: TriageColor | null;
};

export type TriageCounts = Record<TriageColor | "unknown", number>;

/* -------------------------------------------------------------
 * ป้าย
 * ----------------------------------------------------------- */

/** ช่อง "ประเภท" ในรายงานจริงใช้คำสั้น ต่างจากป้ายในฟอร์มผู้ส่งที่เขียนเต็ม */
export const CATEGORY_SHORT: Record<PatientCategory, string> = {
  combat: "ยุทธการ",
  admin: "ธุรการ",
  other: "อื่นๆ",
};

/** เรียงตามกล่องสรุประดับในรายงานจริง — ดำ แดง เหลือง เขียว */
export const REPORT_TRIAGE_ORDER: readonly TriageColor[] = ["black", "red", "yellow", "green"];

export function triageLabel(t: TriageColor | null): string {
  return t ? TRIAGE[t].label : "ยังไม่คัดแยก";
}

export const FORWARD_RETURNED = "รักษา/ ส่งคืนหน่วยต้นสังกัด";

function text(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s === "" ? DASH : s;
}

/* -------------------------------------------------------------
 * สถานะแรกรับ / สถานะส่งต่อ
 * ----------------------------------------------------------- */

function liveLegs(legs: readonly ReportLeg[]): ReportLeg[] {
  return legs.filter((l) => l.status !== "cancelled").sort((a, b) => a.legNo - b.legNo);
}

/** สถานพยาบาลแรกรับ = ปลายทางของทอดแรกที่ไม่ถูกยกเลิก */
export function firstFacility(legs: readonly ReportLeg[]): string {
  return liveLegs(legs)[0]?.toUnit ?? DASH;
}

/**
 * สถานะส่งต่อ — สภาพล่าสุดของผู้ป่วยในสายส่งกลับ
 *
 * ★ ลำดับการตัดสินสำคัญ ผลการจำหน่ายชนะจำนวนทอดเสมอ
 *   ผู้ป่วยที่ส่งต่อไปสองทอดแล้วรักษาหายส่งคืนหน่วย ต้องขึ้นว่า "ส่งคืนหน่วยต้นสังกัด"
 *   ไม่ใช่ "ส่งกลับ รพ.ปลายทาง" เพราะนั่นคือสถานะเมื่อวาน ไม่ใช่วันนี้
 *
 * ★ ทอดเดียวที่ยังไม่ส่งมอบขึ้น "-" ไม่ใช่ชื่อปลายทาง
 *   ผู้ป่วยยังอยู่บนรถ ถ้าเขียนชื่อสถานพยาบาลลงช่องนี้ รายงานจะบอกว่าเขาไปถึงแล้ว
 */
export function forwardStatus(
  c: Pick<ReportCaseInput, "outcome" | "dispositionRoute" | "legs">,
): { text: string; kind: ForwardKind } {
  const legs = liveLegs(c.legs);

  if (c.outcome === "died") return { text: "เสียชีวิต", kind: "died" };
  if (c.dispositionRoute === "returned_to_unit") return { text: FORWARD_RETURNED, kind: "returned" };
  if (c.dispositionRoute === "civilian_hospital") return { text: "ส่งต่อ รพ.พลเรือน", kind: "civilian" };
  if (legs.length >= 2) return { text: `ส่งกลับ ${legs[legs.length - 1].toUnit}`, kind: "chain" };
  if (legs.length === 1 && legs[0].status === "completed") return { text: legs[0].toUnit, kind: "at_first" };
  return { text: DASH, kind: "none" };
}

/* -------------------------------------------------------------
 * แถวรายงานและยอดรวม
 * ----------------------------------------------------------- */

export function buildReportRows(cases: readonly ReportCaseInput[]): ReportRow[] {
  return [...cases]
    .sort(
      (a, b) =>
        Date.parse(a.requestedAt) - Date.parse(b.requestedAt) ||
        a.caseCode.localeCompare(b.caseCode),
    )
    .map((c, i) => {
      const forward = forwardStatus(c);
      return {
        no: i + 1,
        caseCode: c.caseCode,
        requestedAt: c.requestedAt,
        sector: "",
        firstName: text([c.rankTh, c.firstName].filter((s) => s && s.trim()).join(" ")),
        lastName: text(c.lastName),
        affiliation: text(c.affiliation),
        incident: text(c.injuryPlace),
        category: c.category ? CATEGORY_SHORT[c.category] : DASH,
        symptoms: text(c.chiefComplaint),
        firstFacility: firstFacility(c.legs),
        forward: forward.text,
        forwardKind: forward.kind,
        triage: c.triage,
      };
    });
}

export function countTriage(rows: readonly Pick<ReportRow, "triage">[]): TriageCounts {
  const counts: TriageCounts = { black: 0, red: 0, yellow: 0, green: 0, unknown: 0 };
  for (const r of rows) counts[r.triage ?? "unknown"] += 1;
  return counts;
}

/* -------------------------------------------------------------
 * ช่วงเวลา — ผู้ใช้กรอกเป็นเวลาไทยเสมอ ไม่ขึ้นกับเขตเวลาของเครื่องที่รันโค้ด
 *
 * ★ Vercel รันเป็น UTC ถ้าตีความ "2026-12-25T18:00" ด้วยเขตเวลาของเครื่อง
 *   รายงานจะเลื่อนไป 7 ชั่วโมงทั้งไฟล์ — บั๊กที่เห็นเฉพาะบน production
 * ----------------------------------------------------------- */

export type RangeError = "missing" | "invalid" | "order" | "too_long";
export type ReportError = RangeError | "too_many" | "failed" | "audit_failed";

export const REPORT_ERROR_TEXT: Record<ReportError, string> = {
  missing: "กรุณาเลือกทั้งเวลาเริ่มและเวลาสิ้นสุด",
  invalid: "รูปแบบวันเวลาไม่ถูกต้อง กรุณาเลือกใหม่",
  order: "เวลาเริ่มต้องมาก่อนเวลาสิ้นสุด",
  too_long: `ช่วงเวลายาวเกิน ${MAX_RANGE_DAYS} วัน กรุณาแบ่งดาวน์โหลดทีละช่วง`,
  too_many: "เคสในช่วงนี้มากเกินกว่าจะรวมในไฟล์เดียว กรุณาเลือกช่วงให้สั้นลง",
  failed: "ดึงข้อมูลรายงานไม่สำเร็จ ยังไม่มีไฟล์ถูกสร้าง กรุณาลองอีกครั้ง",
  audit_failed:
    "บันทึกประวัติการดาวน์โหลดไม่สำเร็จ ระบบจึงยังไม่ส่งไฟล์ที่มีชื่อผู้ป่วยออกไป กรุณาลองอีกครั้ง",
};

export function isReportError(v: unknown): v is ReportError {
  return typeof v === "string" && Object.hasOwn(REPORT_ERROR_TEXT, v);
}

const LOCAL_INPUT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function isLocalInput(v: unknown): v is string {
  return typeof v === "string" && LOCAL_INPUT_RE.test(v);
}

const BKK_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** จุดเวลา → ค่าที่ช่อง <input type="datetime-local"> ใช้ ตามเวลาไทย */
export function toLocalInput(d: Date): string {
  const p = Object.fromEntries(BKK_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function parseRange(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
): { ok: true; from: Date; to: Date } | { ok: false; error: RangeError } {
  if (!fromRaw || !toRaw) return { ok: false, error: "missing" };
  if (!isLocalInput(fromRaw) || !isLocalInput(toRaw)) return { ok: false, error: "invalid" };

  const from = new Date(`${fromRaw}:00${BANGKOK_OFFSET}`);
  const to = new Date(`${toRaw}:00${BANGKOK_OFFSET}`);

  // Date ปัดวันที่ไม่มีจริงให้เอง (30 ก.พ. → 2 มี.ค.) โดยไม่ error
  // ถ้าไม่เทียบกลับ ผู้ใช้จะได้รายงานของวันที่ตัวเองไม่ได้เลือก
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    toLocalInput(from) !== fromRaw ||
    toLocalInput(to) !== toRaw
  ) {
    return { ok: false, error: "invalid" };
  }
  if (from.getTime() >= to.getTime()) return { ok: false, error: "order" };
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) return { ok: false, error: "too_long" };
  return { ok: true, from, to };
}

/**
 * ช่วงเริ่มต้นของฟอร์ม — รอบตัดยอด 18:00 ถึง 18:00 ตามรายงานจริง
 *
 * เลือกรอบที่ "ใกล้ตอนนี้ที่สุด" คือรอบที่คนกำลังจะทำรายงานอยู่
 *   10:00 หรือ 23:00 → รอบที่จบ 18:00 วันนี้
 *   05:00            → รอบที่จบ 18:00 เมื่อวาน (ใกล้กว่ารอบวันนี้)
 * ผู้ใช้เปลี่ยนเองได้เสมอ ค่านี้แค่ประหยัดการกด
 */
export function defaultRange(now: Date = new Date()): { from: string; to: string } {
  const local = toLocalInput(now);
  const today1800 = new Date(`${local.slice(0, 10)}T18:00:00${BANGKOK_OFFSET}`);
  const hour = Number(local.slice(11, 13));
  const to = hour < 6 ? new Date(today1800.getTime() - DAY_MS) : today1800;
  return { from: toLocalInput(new Date(to.getTime() - DAY_MS)), to: toLocalInput(to) };
}

/* -------------------------------------------------------------
 * หัวรายงานและชื่อไฟล์
 * ----------------------------------------------------------- */

const DATE_TH = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "2-digit",
});

/** "18:00" → "18.00" ตามรูปเวลาในรายงานราชการ */
function clockDot(d: Date): string {
  return toLocalInput(d).slice(11).replace(":", ".");
}

export function reportTitle(from: Date, to: Date): string {
  return (
    `สรุปรายงานกำลังพลที่ได้รับบาดเจ็บจากการปะทะ ประจำวันที่ ${DATE_TH.format(to)} ` +
    `(วันที่ ${DATE_TH.format(from)} เวลา ${clockDot(from)} น. - ` +
    `วันที่ ${DATE_TH.format(to)} เวลา ${clockDot(to)} น.)`
  );
}

export function reporterLine(unitName: string): string {
  return `ผู้รายงาน : ${unitName || DASH}`;
}

function compact(d: Date): string {
  return toLocalInput(d).replace(/[-:]/g, "").replace("T", "-");
}

/** ชื่อไฟล์ ASCII สำหรับเบราว์เซอร์เก่า และชื่อไทยสำหรับ filename* */
export function reportFileNames(from: Date, to: Date, ext: "xlsx" | "csv") {
  const span = `${compact(from)}_${compact(to)}`;
  return {
    ascii: `casualty-report_${span}.${ext}`,
    thai: `รายงานกำลังพลบาดเจ็บ_${span}.${ext}`,
  };
}

/* -------------------------------------------------------------
 * CSV — ข้อมูลดิบสำหรับเอาไปใช้ต่อ
 *
 * ★ มีรหัสเคสและเวลาเปิดคำขอ ซึ่งไฟล์ Excel ไม่มี (ไฟล์ Excel ยึดรูปแบบรายงานจริง)
 *   ไม่มีรหัสเคส แถวที่ยังไม่ได้บันทึกชื่อจะย้อนกลับไปหาเคสต้นทางไม่ได้เลย
 *
 * ★ UTF-8 with BOM · ขึ้นบรรทัดด้วย CRLF — ไม่งั้น Excel ภาษาไทยเปิดแล้วเป็นตัวต่างดาว
 *   (ข้อกำหนดเดิมของ F7 ใน docs/CLAUDE-PROMPTS.md Prompt 09)
 * ----------------------------------------------------------- */

export const CSV_COLUMNS = [
  "ลำดับ",
  "รหัสเคส",
  "เวลาเปิดคำขอ",
  "สย.",
  "ชื่อ",
  "สกุล",
  "สังกัด",
  "เหตุการณ์",
  "ประเภท",
  "อาการ",
  "สถานะแรกรับ",
  "สถานะส่งต่อ",
  "ระดับ",
] as const;

/**
 * 🔴 กัน CSV/formula injection
 *   ช่องอาการเป็นข้อความที่ผู้ใช้พิมพ์เอง ค่าที่ขึ้นต้นด้วย = + - @ จะถูก Excel
 *   ตีความเป็นสูตรทันทีที่เปิดไฟล์ บนเครื่องของคนที่เปิด ไม่ใช่บน server
 *   จึงเติม ' นำหน้าให้ Excel อ่านเป็นข้อความ (ยกเว้น "-" ตัวเดียวที่เป็นช่องว่างของรายงาน)
 */
export function csvCell(value: string): string {
  let s = value;
  if (s !== DASH && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: readonly ReportRow[]): string {
  const lines = [
    CSV_COLUMNS.join(","),
    ...rows.map((r) =>
      [
        String(r.no),
        r.caseCode,
        toLocalInput(new Date(r.requestedAt)).replace("T", " "),
        r.sector,
        r.firstName,
        r.lastName,
        r.affiliation,
        r.incident,
        r.category,
        r.symptoms,
        r.firstFacility,
        r.forward,
        triageLabel(r.triage),
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
