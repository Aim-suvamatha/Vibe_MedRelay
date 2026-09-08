import { expect, test } from "@playwright/test";

import { hasCredentials, login } from "./helpers/auth";

/**
 * ทอดที่จ่ายให้คนอื่นแล้ว คนที่ไม่ได้ถือทอดต้องกดไม่ได้ (0023)
 *
 * เจ้าของโครงการเจอเองเมื่อ 8 ก.ย. 2569 — สมชาย (9900000001) จัดรถแล้วจ่ายทอด
 * ให้สมหมาย (9900000002) แต่ยังกด "ออกเดินทางจากจุดรับ" ต่อได้เอง
 *
 * สาเหตุคือกันด้วย "บทบาท" อย่างเดียว ทั้งที่บัญชีสาธิตใบเดียวถือสามบทบาท
 * เทสต์นี้จึงล็อกไว้ว่าต้องกันด้วย "ตัวตน" — ต้องเป็นผู้ลำเลียงที่ถูกจ่ายทอดจริง
 */

const SOMCHAI = "9900000001"; // sender · transporter · receiver — คนจัดรถ
const SOMMAI = "9900000002"; // transporter — คนที่ถูกจ่ายทอด


test.describe("สิทธิ์เดินสถานะผูกกับผู้ที่ถือทอด", () => {
  test.skip(!hasCredentials, "ยังไม่ได้ตั้ง E2E_* ใน .env.local");
  test.setTimeout(180_000);

  test("จัดรถให้คนอื่นแล้ว ตัวเองต้องกดขั้นถัดไปไม่ได้", async ({ page }) => {
    // ── สมชายเปิดเคสและจัดรถ โดยจ่ายทอดให้สมหมาย ──────────────
    await login(page, "/sender/new", SOMCHAI);
    await page.goto("/sender/new");

    const next = page.getByRole("button", { name: "ถัดไป →" });
    await page.fill('textarea[name="chiefComplaint"]', "ทดสอบสิทธิ์หลังจ่ายทอด");
    await next.click();
    await page.locator('input[name="precedence"][value="urgent"]').check({ force: true });
    await next.click();

    const toUnit = page.locator('select[name="toUnitId"]');
    const hosp = await toUnit
      .locator("option", { hasText: "โรงพยาบาลค่าย" })
      .first()
      .getAttribute("value");
    await toUnit.selectOption(hosp!);
    await page.locator('select[name="pickupPointId"]').selectOption({ index: 1 });
    await next.click();
    await next.click();
    await next.click();
    await next.click();

    await page.getByRole("button", { name: "ส่งคำขอ" }).click();
    await page.waitForURL(/\/sender\?sent=/, { timeout: 60_000 });
    const caseId = new URL(page.url()).searchParams.get("sent")!;

    await page.goto(`/track/${caseId}`);
    await page.locator('select[name="vehicleId"]').selectOption({ index: 1 });
    const tr = page.locator('select[name="transporterId"]');
    const sommai = await tr
      .locator("option", { hasText: "สมหมาย" })
      .first()
      .getAttribute("value");
    await tr.selectOption(sommai!);
    await page.getByRole("button", { name: "จัดรถ", exact: true }).click();

    /**
     * ★ ข้อที่ต้องพิสูจน์ — สมชายต้องไม่มีปุ่มขั้นถัดไป
     *
     * ⚠ ต้องรอให้ทอด "จัดรถแล้ว" จริงก่อน ห้ามสลับบัญชีทันทีหลังกด
     *   Server Action ยังวิ่งอยู่ การล้าง cookie ทับจะตัดมันกลางคัน
     *   แล้วทอดค้างเป็น pending โดยที่เทสต์ไม่รู้ตัว (พลาดมาแล้วรอบหนึ่ง)
     *
     * ⚠ ใช้ regex ที่ปิดหัวปิดท้าย (^...$) เพื่อให้แมตช์เฉพาะย่อหน้านั้นจริงๆ
     *   getByText แบบหลวมจะไปแมตช์กล่องใหญ่ที่มีคำว่า "รอ" กับ "สมหมาย" ปนกัน
     *   แล้วผ่านทั้งที่ยังไม่ได้จัดรถเลย
     */
    await expect(
      page.getByText(/^รอ.*สมหมาย.*กด “ถึงจุดรับแล้ว”$/),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "ถึงจุดรับแล้ว" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "ส่งมอบผู้ป่วย" })).toHaveCount(0);
    console.log("\n>>> สมชายจัดรถแล้วแต่ไม่มีปุ่มเดินสถานะ (ถูกต้อง)\n");

    // ── สมหมายซึ่งถือทอดจริง ต้องกดได้ ────────────────────────
    await login(page, `/track/${caseId}`, SOMMAI);
    await page.goto(`/track/${caseId}`);

    await expect(page.getByRole("button", { name: "ถึงจุดรับแล้ว" })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "ถึงจุดรับแล้ว" }).click();
    await expect(
      page.getByRole("button", { name: "ออกเดินทางจากจุดรับ" }),
    ).toBeVisible({ timeout: 30_000 });
    console.log("\n>>> สมหมายซึ่งถือทอดกดได้ตามปกติ\n");
  });
});
