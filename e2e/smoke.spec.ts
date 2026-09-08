import { expect, test } from "@playwright/test";

import { hasCredentials, login } from "./helpers/auth";

/**
 * ชุดทดสอบเบื้องต้น — ตอบคำถามเดียวว่า "แอปยังเปิดได้อยู่ไหม"
 * ไม่ใช่การทดสอบครบตามรายการใน HANDOFF.md §"สิ่งที่ต้องทดสอบทีละขั้น"
 */
test.describe("หน้าที่เปิดได้โดยไม่ต้องล็อกอิน", () => {
  test("หน้าล็อกอินขึ้นครบ", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "ระบบส่งกลับสายแพทย์" })).toBeVisible();
    await expect(page.locator("#serviceNumber")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });

  test("หน้าที่ต้องล็อกอินเด้งไป /login พร้อม next", async ({ page }) => {
    await page.goto("/sender");
    await expect(page).toHaveURL(/\/login\?.*next=/);
  });
});

test.describe("หลังล็อกอิน", () => {
  // ข้ามทั้งกลุ่มถ้ายังไม่ได้ตั้งบัญชีทดสอบ จะได้ไม่พังแบบงงๆ บนเครื่องคนอื่น
  test.skip(
    !hasCredentials,
    "ยังไม่ได้ตั้ง E2E_SERVICE_NUMBER / E2E_PASSWORD ใน .env.local",
  );

  test("เปิด /sender ได้ และไม่มี error จาก console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await login(page, "/sender");
    await page.goto("/sender");

    // ถ้า PostgREST ยังไม่ reload schema cache จะเจอข้อความนี้ — ดู HANDOFF.md
    await expect(page.getByText("Could not find a relationship")).toHaveCount(0);
    expect(errors, `เจอ error บนหน้า:\n${errors.join("\n")}`).toEqual([]);
  });
});
