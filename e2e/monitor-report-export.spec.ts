import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";

import { hasCredentials, login } from "./helpers/auth";

/**
 * รายงานสรุปกำลังพลบาดเจ็บ (F7) — ดาวน์โหลดจริงแล้วเปิดไฟล์ตรวจ
 *
 * ★ ทำไมต้องเปิดไฟล์ ไม่ใช่แค่เช็คว่าดาวน์โหลดได้
 *   ไฟล์ที่ดาวน์โหลดสำเร็จแต่คอลัมน์เลื่อนไปหนึ่งช่อง คือรายงานที่ชื่อคนไปอยู่ช่องสังกัด
 *   ปุ่มทำงานปกติ ไม่มี error ใดๆ และจะไม่มีใครรู้จนผู้บังคับบัญชาอ่าน
 *
 * ต้องรัน `npm run demo:reset` ก่อน — ชื่อสมมติของ 11 เคสมาจากไฟล์นั้น
 */

const MONITOR = "9900000004";
const TRANSPORTER = "9900000002";

/** จุดเวลา → ค่าช่อง datetime-local ตามเวลาไทย */
function bkk(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(d)
    .replace(" ", "T");
}

const DAY = 24 * 60 * 60 * 1000;

test.describe("รายงานสรุปกำลังพลบาดเจ็บ", () => {
  test.skip(!hasCredentials, "ยังไม่ได้ตั้ง E2E_* ใน .env.local");
  test.setTimeout(240_000);

  test("ศูนย์สั่งการดาวน์โหลด Excel และ CSV ได้ ข้อมูลลงช่องตรงตามแบบ", async ({ page }) => {
    await login(page, "/monitor", MONITOR);
    const section = page.locator("section#report");
    await expect(section.getByRole("heading", { name: "รายงานสรุปกำลังพลบาดเจ็บ" })).toBeVisible();

    /**
     * ⚠ วันที่ของ 11 เคสจำลองตายตัวตั้งแต่วันที่รัน seed_demo_cases (ปลายเดือน ส.ค. 2569)
     *   ไม่ได้เลื่อนตามวันนี้ — reset-demo คืนแค่สถานะ ไม่คืนวันเปิดคำขอ
     *   ช่วงสั้นๆ อย่าง "10 วันย้อนหลัง" จึงตกหล่นเคสแรกๆ (เจอจริง 12 ก.ย.)
     *   ใช้ 90 วัน ซึ่งยังอยู่ใต้เพดาน MAX_RANGE_DAYS (93) และครอบชุดจำลองได้อีกหลายสัปดาห์
     */
    await section.getByLabel("ตั้งแต่", { exact: true }).fill(bkk(new Date(Date.now() - 90 * DAY)));
    await section.getByLabel("ถึง", { exact: true }).fill(bkk(new Date(Date.now() + 60 * 60 * 1000)));

    // ── Excel ────────────────────────────────────────────────
    const [xlsx] = await Promise.all([
      page.waitForEvent("download"),
      section.getByRole("button", { name: "ดาวน์โหลด Excel" }).click(),
    ]);
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(await xlsx.path());
    const ws = wb.worksheets[0];

    expect(ws.getCell("A1").text).toContain("สรุปรายงานกำลังพลที่ได้รับบาดเจ็บ");
    expect(ws.getCell("A1").text).toContain("ผู้รายงาน : ศูนย์สั่งการส่งกลับ (สมมติ)");

    const headers = Array.from({ length: 12 }, (_, i) => ws.getCell(2, i + 1).text);
    expect(headers).toEqual([
      "สย.", "ลำดับ", "ชื่อ", "สกุล", "สังกัด", "เหตุการณ์",
      "ประเภท", "อาการ", "สถานะแรกรับ", "สถานะส่งต่อ", "รวม", "ระดับ",
    ]);

    // หาแถวของ MR-2569-0001 จากชื่อสมมติ แล้วตรวจทุกช่องว่าไม่เลื่อน
    let row = 0;
    ws.eachRow((r, n) => {
      if (r.getCell(3).text === "พลทหาร กล้าหาญ") row = n;
    });
    expect(row, "ต้องมีแถวของผู้ป่วยสมมติ กล้าหาญ — ลืมรัน demo:reset หรือเปล่า").toBeGreaterThan(2);
    const cells = Array.from({ length: 10 }, (_, i) => ws.getCell(row, i + 1).text);
    expect(cells[0]).toBe(""); // สย. เว้นว่างตามคำสั่ง
    expect(cells.slice(2, 8)).toEqual([
      "พลทหาร กล้าหาญ", "มั่นคง (สมมติ)", "ร้อย.1 พัน.ก (สมมติ)",
      "สนามฝึก ก (สมมติ)", "อื่นๆ", "หมดสติ ชักเกร็ง",
    ]);
    // triage แดง → ช่องประเภทพื้นแดง
    const fill = ws.getCell(row, 7).fill as ExcelJS.FillPattern;
    expect(fill.fgColor?.argb).toBe("FFFF2D2D");

    // แถวท้ายรวมยอดต้องเท่าจำนวนแถวข้อมูลจริง
    let footer = 0;
    ws.eachRow((r, n) => {
      if (r.getCell(1).text === "รวมยอดที่ได้รับบาดเจ็บ และสูญเสีย") footer = n;
    });
    let dataRows = 0;
    ws.eachRow((r, n) => {
      if (n > 2 && /^\d+$/.test(r.getCell(2).text)) dataRows += 1;
    });
    expect(dataRows).toBeGreaterThanOrEqual(11);
    expect(Number(ws.getCell(footer, 11).value)).toBe(dataRows);

    // ── CSV ──────────────────────────────────────────────────
    const [csv] = await Promise.all([
      page.waitForEvent("download"),
      section.getByRole("button", { name: "ดาวน์โหลด CSV" }).click(),
    ]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
    const bytes = await readFile(await csv.path());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM
    const lines = bytes.toString("utf8").slice(1).split("\r\n");
    expect(lines[0]).toBe(
      "ลำดับ,รหัสเคส,เวลาเปิดคำขอ,สย.,ชื่อ,สกุล,สังกัด,เหตุการณ์,ประเภท,อาการ,สถานะแรกรับ,สถานะส่งต่อ,ระดับ",
    );
    const first = lines.find((l) => l.includes("MR-2569-0001"));
    expect(first).toContain(",พลทหาร กล้าหาญ,มั่นคง (สมมติ),");
    expect(first?.endsWith(",แดง")).toBe(true);
    // จำนวนแถวใน CSV เท่ากับใน Excel — สองไฟล์จากคำขอเดียวกันต้องตรงกัน
    expect(lines.filter((l) => /^\d+,MR-/.test(l)).length).toBe(dataRows);
  });

  test("ช่วงเวลากลับด้าน ต้องพากลับมาพร้อมข้อความ และค่าที่กรอกยังอยู่", async ({ page }) => {
    await login(page, "/monitor", MONITOR);
    const section = page.locator("section#report");
    await section.getByLabel("ตั้งแต่", { exact: true }).fill("2026-09-10T18:00");
    await section.getByLabel("ถึง", { exact: true }).fill("2026-09-09T18:00");
    await section.getByRole("button", { name: "ดาวน์โหลด CSV" }).click();

    await expect(page).toHaveURL(/reportError=order/);
    await expect(page.locator("section#report").getByRole("alert")).toContainText("เวลาเริ่มต้องมาก่อนเวลาสิ้นสุด");
    await expect(page.locator("section#report").getByLabel("ตั้งแต่", { exact: true })).toHaveValue("2026-09-10T18:00");
  });

  test("★ ชุดลำเลียงยิง URL ดาวน์โหลดตรงๆ ไม่ได้ และไม่ได้ชื่อผู้ป่วยกลับไป", async ({ page }) => {
    await login(page, "/", TRANSPORTER);
    const from = bkk(new Date(Date.now() - 10 * DAY));
    const to = bkk(new Date(Date.now() + 60 * 60 * 1000));
    const res = await page.request.get(
      `/monitor/report?format=csv&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { maxRedirects: 0 },
    );
    expect(res.status()).toBe(403);
    const body = await res.text();
    expect(body).not.toContain("MR-2569");
    expect(body).not.toContain("กล้าหาญ");
  });
});
