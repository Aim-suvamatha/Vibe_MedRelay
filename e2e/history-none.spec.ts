import { expect, test } from "@playwright/test";

import { hasCredentials, login } from "./helpers/auth";

/**
 * ปุ่มเติม "ไม่มี" ให้ห้าช่องประวัติในขั้นที่ 1 (คำสั่งเจ้าของโครงการ 8 ก.ย. 2569)
 *
 * เว้นว่างแทน "ไม่มี" ไม่ได้ เพราะปลายทางต้องแยก "ถามแล้วไม่มี" ออกจาก "ยังไม่ได้ถาม"
 * เสนารักษ์จึงต้องพิมพ์คำเดิมห้าครั้งทุกเคสก่อนจะมีปุ่มนี้
 */
const FIELDS = [
  "drugAllergy",
  "foodAllergy",
  "chronicConditions",
  "pastHistory",
  "regularMeds",
] as const;

test.describe("ขั้น 1 · ปุ่มเติมไม่มี", () => {
  test.skip(!hasCredentials, "ยังไม่ได้ตั้ง E2E_* ใน .env.local");

  test("กดครั้งเดียวแล้วทั้งห้าช่องเป็น ไม่มี · ทับของเดิมด้วย", async ({ page }) => {
    await login(page, "/sender/new");
    await page.goto("/sender/new");

    // ห้าช่องนี้อยู่ในก้อนที่พับไว้ ต้องกางก่อนถึงจะแตะได้
    // เจาะจงที่ <summary> ไม่ใช่ getByText เพราะข้อความเตือน
    // "ห้ามกรอกข้อมูลผู้ป่วยจริง" ในขั้นเดียวกันก็มีคำว่า "ข้อมูลผู้ป่วย"
    await page.locator("summary", { hasText: "ข้อมูลผู้ป่วย" }).click();

    // ★ พิมพ์ทิ้งไว้ก่อนหนึ่งช่อง เพื่อยืนยันว่าปุ่ม "ทับ" ไม่ใช่ "เติมเฉพาะช่องว่าง"
    await page.fill('[name="drugAllergy"]', "แพ้เพนิซิลลิน");
    await page.fill('[name="pastHistory"]', "ผ่าตัดไส้ติ่ง 2565");

    await page.getByRole("button", { name: /ทั้ง 5 ช่อง/ }).click();

    for (const name of FIELDS) {
      await expect(page.locator(`[name="${name}"]`), name).toHaveValue("ไม่มี");
    }
  });
});
