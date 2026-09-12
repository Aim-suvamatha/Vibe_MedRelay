import ExcelJS from "exceljs";

import {
  REPORT_TRIAGE_ORDER,
  triageLabel,
  type ForwardKind,
  type ReportRow,
  type TriageCounts,
} from "./casualty-report-format.ts";
import type { TriageColor } from "@/lib/enums";

/**
 * สร้างไฟล์ Excel รายงานสรุปกำลังพลบาดเจ็บตามแบบที่หน่วยใช้จริง
 *
 * ⚠ ฝั่ง server เท่านั้น — exceljs ใหญ่และมี browser build แยก
 *   next.config.ts ตั้ง serverExternalPackages ไว้ให้ Node require ตรงๆ ไม่ bundle
 *   ห้าม import ไฟล์นี้จาก component ที่มี "use client"
 *
 * ★ ค่าในทุกเซลล์เป็นข้อความหรือตัวเลขล้วน ไม่มีสูตร
 *   exceljs เขียนสตริงเป็น shared string ไม่ตีความ "=" นำหน้าเป็นสูตร
 *   จึงไม่ต้องเติม ' แบบ CSV — ข้อความของผู้ใช้แสดงตรงตามที่พิมพ์
 *
 * ★ กล่อง "ระดับ" เขียนคำกำกับสีด้วย ไม่ใช่ตัวเลขบนพื้นสีอย่างเดียวเหมือนต้นฉบับ
 *   รายงานถูกพิมพ์ขาวดำบ่อย ตัวเลขบนพื้นสีจะแยกไม่ออกว่าช่องไหนแดงช่องไหนดำ
 */

type Col = { header: string; width: number };

const COLS: readonly Col[] = [
  { header: "สย.", width: 7 },
  { header: "ลำดับ", width: 7 },
  { header: "ชื่อ", width: 20 },
  { header: "สกุล", width: 20 },
  { header: "สังกัด", width: 24 },
  { header: "เหตุการณ์", width: 20 },
  { header: "ประเภท", width: 10 },
  { header: "อาการ", width: 42 },
  { header: "สถานะแรกรับ", width: 26 },
  { header: "สถานะส่งต่อ", width: 30 },
  { header: "รวม", width: 7 },
  { header: "ระดับ", width: 14 },
];

const COL_TOTAL = 11;
const COL_LEVEL = 12;
const FIRST_DATA_ROW = 3;

/** สีตามรายงานต้นฉบับ · ARGB */
const TRIAGE_FILL: Record<TriageColor, { bg: string; fg: string }> = {
  black: { bg: "FF000000", fg: "FFFFFFFF" },
  red: { bg: "FFFF2D2D", fg: "FFFFFFFF" },
  yellow: { bg: "FFFFFF00", fg: "FF000000" },
  green: { bg: "FF4ADE4A", fg: "FF000000" },
};
const UNKNOWN_FILL = { bg: "FFD9D9D9", fg: "FF000000" };
const HEADER_BG = "FFF2F2F2";
const FOOTER_BG = "FFB6D7A8";
const REPORTER_RED = "FFE00000";

/** "รักษา/ ส่งคืนหน่วยต้นสังกัด" — ต้นฉบับใช้ตัวอักษรสีน้ำเงินบนพื้นครีม */
const FORWARD_STYLE: Partial<Record<ForwardKind, { bg: string; fg: string }>> = {
  returned: { bg: "FFFFF6D5", fg: "FF1D4ED8" },
};

const THIN: ExcelJS.Borders = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
  diagonal: {},
};

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function box(cell: ExcelJS.Cell, center = false) {
  cell.border = THIN;
  cell.alignment = { vertical: "middle", horizontal: center ? "center" : "left", wrapText: true };
}

export async function buildCasualtyXlsx(input: {
  rows: readonly ReportRow[];
  counts: TriageCounts;
  title: string;
  reporter: string;
}): Promise<Uint8Array> {
  const { rows, counts, title, reporter } = input;

  const wb = new ExcelJS.Workbook();
  wb.creator = "MedRelay";
  wb.created = new Date();

  const ws = wb.addWorksheet("สรุปกำลังพลบาดเจ็บ", {
    views: [{ state: "frozen", ySplit: 2 }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  COLS.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));

  // ── แถว 1 · หัวรายงาน ────────────────────────────────────────
  ws.mergeCells(1, 1, 1, COLS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = {
    richText: [
      { text: `${title} `, font: { bold: true, size: 13 } },
      { text: reporter, font: { bold: true, size: 13, color: { argb: REPORTER_RED } } },
    ],
  };
  titleCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(1).height = 36;

  // ── แถว 2 · หัวคอลัมน์ ───────────────────────────────────────
  COLS.forEach((c, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = c.header;
    cell.font = { bold: true };
    cell.fill = solid(HEADER_BG);
    box(cell, true);
  });

  // ── แถวข้อมูล ────────────────────────────────────────────────
  rows.forEach((r, i) => {
    const row = FIRST_DATA_ROW + i;
    const values = [
      r.sector,
      r.no,
      r.firstName,
      r.lastName,
      r.affiliation,
      r.incident,
      r.category,
      r.symptoms,
      r.firstFacility,
      r.forward,
    ];
    values.forEach((v, j) => {
      const cell = ws.getCell(row, j + 1);
      cell.value = v;
      box(cell, j === 0 || j === 1 || j === 6);
    });

    // ประเภท — พื้นสีตามระดับการบาดเจ็บ เหมือนต้นฉบับ
    const tone = r.triage ? TRIAGE_FILL[r.triage] : null;
    if (tone) {
      const cell = ws.getCell(row, 7);
      cell.fill = solid(tone.bg);
      cell.font = { color: { argb: tone.fg } };
    }

    const fwd = FORWARD_STYLE[r.forwardKind];
    if (fwd) {
      const cell = ws.getCell(row, 10);
      cell.fill = solid(fwd.bg);
      cell.font = { color: { argb: fwd.fg } };
    }
  });

  // ── รวม · หนึ่งช่องยาวตลอดแถวข้อมูล (ยังไม่แยกตาม สย. ตามคำสั่ง 12 ก.ย.) ──
  if (rows.length > 1) {
    ws.mergeCells(FIRST_DATA_ROW, COL_TOTAL, FIRST_DATA_ROW + rows.length - 1, COL_TOTAL);
  }
  const totalCell = ws.getCell(FIRST_DATA_ROW, COL_TOTAL);
  totalCell.value = rows.length;
  box(totalCell, true);

  // ── ระดับ · กล่องสรุปสี ──────────────────────────────────────
  const levels: { label: string; n: number; tone: { bg: string; fg: string } }[] =
    REPORT_TRIAGE_ORDER.map((t) => ({ label: triageLabel(t), n: counts[t], tone: TRIAGE_FILL[t] }));
  // เคสที่ยังไม่คัดแยกต้องมีกล่องของตัวเอง ไม่งั้นสี่สีรวมกันไม่เท่ายอดรวม
  if (counts.unknown > 0) levels.push({ label: triageLabel(null), n: counts.unknown, tone: UNKNOWN_FILL });

  levels.forEach((lv, i) => {
    const cell = ws.getCell(FIRST_DATA_ROW + i, COL_LEVEL);
    cell.value = `${lv.label} ${lv.n}`;
    cell.fill = solid(lv.tone.bg);
    cell.font = { bold: true, color: { argb: lv.tone.fg } };
    box(cell, true);
  });

  // ── แถวท้าย · รวมยอด ─────────────────────────────────────────
  const lastUsed = Math.max(
    FIRST_DATA_ROW + rows.length - 1,
    FIRST_DATA_ROW + levels.length - 1,
    FIRST_DATA_ROW,
  );
  const footer = lastUsed + 1;
  ws.mergeCells(footer, 1, footer, COL_TOTAL - 1);
  const footLabel = ws.getCell(footer, 1);
  footLabel.value = "รวมยอดที่ได้รับบาดเจ็บ และสูญเสีย";
  footLabel.font = { bold: true };
  footLabel.fill = solid(FOOTER_BG);
  box(footLabel, true);

  const footTotal = ws.getCell(footer, COL_TOTAL);
  footTotal.value = rows.length;
  footTotal.font = { bold: true };
  footTotal.fill = solid(FOOTER_BG);
  box(footTotal, true);

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
