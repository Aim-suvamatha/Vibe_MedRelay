/**
 * ชุดทดสอบรายงานสรุปกำลังพลบาดเจ็บ (F7)
 *
 *   npm run test:unit
 *
 * ★ ทำไมต้องทดสอบ
 *   รายงานนี้ถูกส่งต่อขึ้นสายบังคับบัญชา ตัวเลขผิดหนึ่งช่องคือรายงานเท็จหนึ่งฉบับ
 *   และความผิดส่วนใหญ่ของรายงานประเภทนี้มองไม่เห็นจากการเปิดไฟล์ดูด้วยตา
 *   (เวลาเลื่อน 7 ชั่วโมง · วันที่ 30 ก.พ. กลายเป็น 2 มี.ค. · สถานะส่งต่อที่ล้าสมัย)
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  buildReportRows,
  countTriage,
  csvCell,
  defaultRange,
  FORWARD_RETURNED,
  forwardStatus,
  parseRange,
  reportFileNames,
  reportTitle,
  toCsv,
  type ReportCaseInput,
  type ReportLeg,
} from "./casualty-report-format.ts";

const HOSP = "โรงพยาบาลค่ายสมมติ";
const BDE = "ที่พยาบาลกองพล (สมมติ)";

function leg(legNo: number, status: ReportLeg["status"], toUnit: string): ReportLeg {
  return { legNo, status, toUnit };
}

function caseInput(over: Partial<ReportCaseInput> = {}): ReportCaseInput {
  return {
    caseCode: "MR-2569-0001",
    requestedAt: "2026-12-26T01:00:00.000Z",
    rankTh: "ส.อ.",
    firstName: "กล้าหาญ",
    lastName: "มั่นคง (สมมติ)",
    affiliation: "ร้อย.1 พัน.ก (สมมติ)",
    injuryPlace: "ฐาน ก (สมมติ)",
    category: "combat",
    chiefComplaint: "โดนแรงอัดระเบิด ปวดหลัง",
    triage: "yellow",
    outcome: null,
    dispositionRoute: null,
    legs: [leg(1, "completed", BDE)],
    ...over,
  };
}

/* ── สถานะส่งต่อ ─────────────────────────────────────────── */

test("ทอดเดียวที่ส่งมอบแล้ว สถานะส่งต่อคือสถานพยาบาลที่ผู้ป่วยอยู่", () => {
  assert.deepEqual(forwardStatus(caseInput()), { text: BDE, kind: "at_first" });
});

test("★ ทอดเดียวที่ยังไม่ส่งมอบ ต้องขึ้น - ไม่ใช่ชื่อปลายทาง", () => {
  const r = forwardStatus(caseInput({ legs: [leg(1, "in_transit", BDE)] }));
  assert.equal(r.text, "-", "ผู้ป่วยยังอยู่บนรถ รายงานต้องไม่บอกว่าไปถึงแล้ว");
});

test("ส่งต่อหลายทอด ขึ้น ส่งกลับ + ปลายทางของทอดล่าสุด", () => {
  const r = forwardStatus(caseInput({ legs: [leg(2, "pending", HOSP), leg(1, "completed", BDE)] }));
  assert.deepEqual(r, { text: `ส่งกลับ ${HOSP}`, kind: "chain" });
});

test("ทอดที่ถูกยกเลิกไม่นับเป็นการส่งต่อ", () => {
  const r = forwardStatus(caseInput({ legs: [leg(1, "completed", BDE), leg(2, "cancelled", HOSP)] }));
  assert.equal(r.kind, "at_first");
});

test("★ ผลการจำหน่ายชนะจำนวนทอด — ส่งต่อสองทอดแล้วส่งคืนหน่วย ต้องขึ้นส่งคืน", () => {
  const r = forwardStatus(
    caseInput({
      dispositionRoute: "returned_to_unit",
      legs: [leg(1, "completed", BDE), leg(2, "completed", HOSP)],
    }),
  );
  assert.deepEqual(r, { text: FORWARD_RETURNED, kind: "returned" });
});

test("เสียชีวิตชนะทุกสถานะ", () => {
  const r = forwardStatus(caseInput({ outcome: "died", dispositionRoute: "returned_to_unit" }));
  assert.equal(r.kind, "died");
});

/* ── แถวรายงาน ─────────────────────────────────────────── */

test("เรียงตามเวลาเปิดคำขอ และลำดับเริ่มที่ 1 เสมอ", () => {
  const rows = buildReportRows([
    caseInput({ caseCode: "MR-B", requestedAt: "2026-12-26T05:00:00.000Z" }),
    caseInput({ caseCode: "MR-A", requestedAt: "2026-12-26T02:00:00.000Z" }),
  ]);
  assert.deepEqual(rows.map((r) => [r.no, r.caseCode]), [[1, "MR-A"], [2, "MR-B"]]);
});

test("ชื่อรวมยศไว้ข้างหน้า · ประเภทใช้คำสั้นแบบรายงานจริง · สย. เว้นว่าง", () => {
  const [r] = buildReportRows([caseInput()]);
  assert.equal(r.firstName, "ส.อ. กล้าหาญ");
  assert.equal(r.lastName, "มั่นคง (สมมติ)");
  assert.equal(r.category, "ยุทธการ");
  assert.equal(r.sector, "", "สย. ต้องว่างให้ส่วนแยกกรอกเอง ห้ามระบบเดา");
  assert.equal(r.firstFacility, BDE);
});

test("เคสที่ยังไม่ได้บันทึกประวัติ ขึ้น - ไม่ใช่ช่องว่างหรือ null", () => {
  const [r] = buildReportRows([
    caseInput({ rankTh: null, firstName: null, lastName: null, affiliation: null, injuryPlace: "  ", category: null }),
  ]);
  assert.deepEqual(
    [r.firstName, r.lastName, r.affiliation, r.incident, r.category],
    ["-", "-", "-", "-", "-"],
  );
});

test("นับระดับครบทุกสี รวมเคสที่ยังไม่คัดแยก — ยอดรวมต้องเท่าจำนวนแถวเสมอ", () => {
  const rows = buildReportRows([
    caseInput({ triage: "red" }),
    caseInput({ triage: "yellow" }),
    caseInput({ triage: "yellow" }),
    caseInput({ triage: null }),
  ]);
  const c = countTriage(rows);
  assert.deepEqual(c, { black: 0, red: 1, yellow: 2, green: 0, unknown: 1 });
  assert.equal(c.black + c.red + c.yellow + c.green + c.unknown, rows.length);
});

/* ── ช่วงเวลา ─────────────────────────────────────────── */

test("★ ตีความเวลาที่กรอกเป็นเวลาไทยเสมอ ไม่ขึ้นกับเขตเวลาของเครื่อง", () => {
  const r = parseRange("2026-12-25T18:00", "2026-12-26T18:00");
  assert.ok(r.ok);
  assert.equal(r.from.toISOString(), "2026-12-25T11:00:00.000Z");
  assert.equal(r.to.toISOString(), "2026-12-26T11:00:00.000Z");
});

test("ปฏิเสธช่วงเวลาที่ไม่ครบ · ผิดรูป · กลับด้าน · ยาวเกิน", () => {
  assert.deepEqual(parseRange(null, "2026-12-26T18:00"), { ok: false, error: "missing" });
  assert.deepEqual(parseRange("25/12/2026", "2026-12-26T18:00"), { ok: false, error: "invalid" });
  assert.deepEqual(parseRange("2026-12-26T18:00", "2026-12-26T18:00"), { ok: false, error: "order" });
  assert.deepEqual(parseRange("2026-01-01T00:00", "2026-12-31T00:00"), { ok: false, error: "too_long" });
});

test("★ วันที่ไม่มีจริงต้องถูกปฏิเสธ ไม่ใช่ถูกปัดไปวันอื่นเงียบๆ", () => {
  assert.deepEqual(parseRange("2026-02-30T18:00", "2026-03-05T18:00"), { ok: false, error: "invalid" });
});

test("ช่วงเริ่มต้นเลือกรอบตัดยอด 18:00 ที่ใกล้ตอนนี้ที่สุด", () => {
  const at = (s: string) => defaultRange(new Date(`${s}+07:00`));
  assert.deepEqual(at("2026-12-26T10:00:00"), { from: "2026-12-25T18:00", to: "2026-12-26T18:00" });
  assert.deepEqual(at("2026-12-26T23:30:00"), { from: "2026-12-25T18:00", to: "2026-12-26T18:00" });
  assert.deepEqual(at("2026-12-26T05:00:00"), { from: "2026-12-24T18:00", to: "2026-12-25T18:00" });
});

test("หัวรายงานใช้ พ.ศ. ย่อและเวลาแบบจุดตามรายงานราชการ", () => {
  const r = parseRange("2026-12-25T18:00", "2026-12-26T18:00");
  assert.ok(r.ok);
  assert.equal(
    reportTitle(r.from, r.to),
    "สรุปรายงานกำลังพลที่ได้รับบาดเจ็บจากการปะทะ ประจำวันที่ 26 ธ.ค. 69 (วันที่ 25 ธ.ค. 69 เวลา 18.00 น. - วันที่ 26 ธ.ค. 69 เวลา 18.00 น.)",
  );
});

test("ชื่อไฟล์บอกช่วงเวลา และมีรุ่น ASCII สำหรับเบราว์เซอร์ที่อ่านชื่อไทยไม่ได้", () => {
  const r = parseRange("2026-12-25T18:00", "2026-12-26T18:00");
  assert.ok(r.ok);
  const n = reportFileNames(r.from, r.to, "xlsx");
  assert.equal(n.ascii, "casualty-report_20261225-1800_20261226-1800.xlsx");
  assert.match(n.ascii, /^[\x20-\x7e]+$/);
});

/* ── CSV ─────────────────────────────────────────── */

test("★ กันสูตร Excel จากข้อความที่ผู้ใช้พิมพ์ แต่ไม่แตะขีดกลางของรายงาน", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell("+66 ปวด"), "'+66 ปวด");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("-"), "-");
  assert.equal(csvCell("ปวด, บวม"), '"ปวด, บวม"');
});

test("CSV มี BOM ขึ้นบรรทัดด้วย CRLF และมีรหัสเคสกับระดับเป็นคำไทย", () => {
  const csv = toCsv(buildReportRows([caseInput({ triage: "red" })]));
  assert.equal(csv.charCodeAt(0), 0xfeff, "ไม่มี BOM แล้ว Excel ภาษาไทยจะเพี้ยน");
  const lines = csv.slice(1).split("\r\n");
  assert.equal(
    lines[0],
    "ลำดับ,รหัสเคส,เวลาเปิดคำขอ,สย.,ชื่อ,สกุล,สังกัด,เหตุการณ์,ประเภท,อาการ,สถานะแรกรับ,สถานะส่งต่อ,ระดับ",
  );
  assert.equal(
    lines[1],
    `1,MR-2569-0001,2026-12-26 08:00,,ส.อ. กล้าหาญ,มั่นคง (สมมติ),ร้อย.1 พัน.ก (สมมติ),ฐาน ก (สมมติ),ยุทธการ,โดนแรงอัดระเบิด ปวดหลัง,${BDE},${BDE},แดง`,
  );
  assert.equal(lines[2], "", "ต้องปิดท้ายด้วย CRLF");
});
