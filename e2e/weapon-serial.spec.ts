import { expect, test } from "@playwright/test";

import { hasCredentials, login } from "./helpers/auth";

/**
 * ล็อกพฤติกรรมของบั๊ก "เลขทะเบียนอาวุธหายเงียบ" (HANDOFF · บั๊กที่เพิ่งแก้ 4)
 *
 * เลขทะเบียนเดินทางไปกับรายการ "อาวุธประจำกาย" เท่านั้น และรายการมาตรฐาน
 * จะถูกส่งก็ต่อเมื่อมีจำนวนมากกว่า 0 — ผู้ใช้ที่กรอกเลขแต่ลืมใส่จำนวน
 * จึงเคยเสียเลขไปโดยไม่มีอะไรบอก เทสต์นี้จงใจ "ไม่แตะช่องจำนวน" เลย
 */
test.describe("บัญชีสิ่งของ · เลขทะเบียนอาวุธ", () => {
  test.skip(!hasCredentials, "ยังไม่ได้ตั้ง E2E_* ใน .env.local");

  test("กรอกเลขทะเบียนอย่างเดียว แล้วจำนวนอาวุธต้องขึ้นเป็น 1 เอง", async ({ page }) => {
    const serial = `E2E-${Date.now()}`;
    await login(page, "/sender/new");
    await page.goto("/sender/new");

    const next = page.getByRole("button", { name: "ถัดไป →" });

    // ขั้น 1 · อาการสำคัญเป็นช่องบังคับเพียงช่องเดียวของขั้นนี้
    await page.fill('textarea[name="chiefComplaint"]', "ทดสอบเลขทะเบียนอาวุธด้วย e2e");
    await next.click();

    // ขั้น 2 · ความเร่งด่วน
    // ไอคอน triage ใน label ทับปุ่มอยู่ ผู้ใช้จริงกดที่ label ได้ปกติ
    // แต่ Playwright ต้อง force เพราะมันเล็งที่ตัว input โดยตรง
    await page.locator('input[name="precedence"][value="urgent"]').check({ force: true });
    await next.click();

    // ขั้น 3 · หน่วยปลายทางและจุดรับ เป็นช่องบังคับทั้งคู่
    const unit = page.locator('select[name="toUnitId"]');
    await unit.selectOption({ index: 1 });
    const point = page.locator('select[name="pickupPointId"]');
    await point.selectOption({ index: 1 });
    await next.click();

    // ขั้น 4 · 5 · 6 ข้ามหมด ไม่มีช่องบังคับ
    await next.click();
    await next.click();
    await next.click();

    // ขั้น 7 · จุดที่ทดสอบจริง
    const qty = page.locator('input[id="qty-อาวุธประจำกาย"]');
    await expect(qty).toHaveValue("");

    await page.fill("#weapon-serial", serial);

    // ★ ข้อความยืนยันของบั๊กนี้ — ไม่ได้แตะช่องจำนวนเลยแต่ต้องกลายเป็น 1
    await expect(qty).toHaveValue("1");
    // และต้องไม่มีคำเตือนค้างอยู่ เพราะสถานะนี้ปลอดภัยแล้ว
    await expect(page.getByText("ไม่งั้นเลขทะเบียนจะไม่ถูกบันทึก")).toHaveCount(0);

    await page.getByRole("button", { name: "ส่งคำขอ" }).click();
    await page.waitForURL(/\/sender\?sent=/, { timeout: 30_000 });

    console.log(`\n>>> ส่งสำเร็จ · serial=${serial} · url=${page.url()}\n`);
  });

  test("ลบจำนวนอาวุธออกทีหลัง ต้องขึ้นคำเตือน ไม่ใช่หายเงียบ", async ({ page }) => {
    await login(page, "/sender/new");
    await page.goto("/sender/new");

    const next = page.getByRole("button", { name: "ถัดไป →" });
    await page.fill('textarea[name="chiefComplaint"]', "ทดสอบคำเตือน");
    for (let i = 0; i < 6; i++) await next.click();

    await page.fill("#weapon-serial", "E2E-WARN");
    const qty = page.locator('input[id="qty-อาวุธประจำกาย"]');
    await expect(qty).toHaveValue("1");

    await qty.fill("");
    await expect(page.getByText("ไม่งั้นเลขทะเบียนจะไม่ถูกบันทึก")).toBeVisible();
  });
});
