import { expect, test } from "@playwright/test";

import { hasCredentials, login } from "./helpers/auth";

/**
 * ศูนย์สั่งการอนุมัติ/ไม่อนุมัติการส่งกลับทางอากาศ (0025)
 *
 * ★ ทำไมต้องเดินด้วยเบราว์เซอร์จริง ทั้งที่ db:test พิสูจน์ RLS ไปแล้ว
 *   db:test พิสูจน์ว่า "ฐานข้อมูลยอมหรือไม่ยอม" แต่ไม่ได้พิสูจน์ว่าปุ่มบนจอ
 *   ส่งค่าถูกช่อง และไม่ได้พิสูจน์ว่า server action คืนข้อความไทยที่อ่านรู้เรื่อง
 *   บั๊กที่แพงที่สุดของโครงการนี้สองตัวหลุด typecheck มาได้ทั้งคู่
 *   เจอเพราะเปิดเบราว์เซอร์จริงเท่านั้น (ASSESSOR_ROLES · เส้นแบ่ง server/client)
 *
 * ★ ข้อที่สำคัญที่สุดคือ "ไม่อนุมัติโดยไม่ใส่เหตุผลต้องไม่ผ่าน"
 *   ถ้าหลุด หน่วยที่ถูกปฏิเสธจะไม่มีวันรู้ว่าติดขัดที่อะไร แล้วขอซ้ำด้วยคำขอเดิม
 *
 * ⚠ สเปคนี้กินคำขอที่รออนุมัติในคิวไป — รันซ้ำต้อง `npm run demo:reset` ก่อน
 *   (กติกาเดียวกับ setup-demo-receiver ที่ค้างรถไว้)
 */

const MONITOR = "9900000004"; // พ.ต. สมศักดิ์ — monitor + commander (DEMO-CTRL)
const TRANSPORTER = "9900000002"; // ส.อ. สมหมาย — transporter อย่างเดียว (DEMO-BN-A)

test.describe("การอนุมัติส่งกลับทางอากาศ", () => {
  test.skip(!hasCredentials, "ยังไม่ได้ตั้ง E2E_* ใน .env.local");
  test.setTimeout(240_000);

  test("ศูนย์สั่งการเห็นทรัพยากรครบ และตัดสินคำขอทางอากาศได้", async ({ page }) => {
    await login(page, "/monitor", MONITOR);

    // ① ทรัพยากรทั้งห้าอย่างที่บทบาทนี้จัดสรร ต้องอยู่บนหน้าเดียวกัน
    await expect(page.getByRole("heading", { name: "ทรัพยากรที่จ่ายได้ตอนนี้" })).toBeVisible();
    await expect(page.getByText("นายสิบพยาบาลบนรถที่ว่าง")).toBeVisible();
    await expect(page.getByText("เตียงว่างรวม")).toBeVisible();
    await expect(page.getByRole("heading", { name: /จุดส่งกลับ/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "เส้นทางการส่งกลับ" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /กระดานรถ/ })).toBeVisible();

    // ผังสายส่งกลับต้องไม่นับศูนย์สั่งการเป็นจุดส่งกลับ (0026)
    const chain = page.locator("section", { has: page.getByRole("heading", { name: /จุดส่งกลับ/ }) });
    await expect(chain.getByText("ศูนย์สั่งการส่งกลับ (สมมติ)")).toHaveCount(0);

    // ② คำขอทางอากาศที่รอตัดสิน
    const pendingCard = page.locator("li", { hasText: "MR-2569-0010" }).first();
    await expect(pendingCard).toBeVisible();
    await expect(pendingCard.getByText("เฮลิคอปเตอร์").first()).toBeVisible();

    // ★ ไม่อนุมัติโดยไม่ใส่เหตุผล ต้องถูกปฏิเสธพร้อมข้อความที่บอกว่าต้องทำอะไร
    await pendingCard.getByRole("button", { name: "ไม่อนุมัติ" }).click();
    await expect(pendingCard.getByRole("alert")).toContainText("เหตุผล");

    // ใส่เหตุผลแล้วอนุมัติให้ไปทางรถแทน — คำตอบที่พบบ่อยที่สุดหน้างาน
    await pendingCard.getByLabel(/เหตุผล/).fill("ทัศนวิสัยต่ำกว่าเกณฑ์ (ทดสอบอัตโนมัติ)");
    await pendingCard.getByLabel("ยานพาหนะที่อนุมัติให้ใช้").selectOption("ground");
    await pendingCard.getByRole("button", { name: "ไม่อนุมัติ" }).click();

    // ③ ผลต้องไหลลงครึ่งล่างของก้อน พร้อมชื่อผู้ตัดสินและเหตุผล
    const decided = page.locator("li", { hasText: "MR-2569-0010" }).first();
    await expect(decided.getByText("ทัศนวิสัยต่ำกว่าเกณฑ์ (ทดสอบอัตโนมัติ)")).toBeVisible();
    await expect(decided.getByText(/ให้ใช้ รถพยาบาล/)).toBeVisible();
    await expect(decided.getByText("สมศักดิ์ สั่งการ (สมมติ)", { exact: false })).toBeVisible();

    // ตัดสินแล้วต้องไม่เหลือปุ่มให้กดซ้ำ
    await expect(decided.getByRole("button", { name: "อนุมัติ" })).toHaveCount(0);
  });

  test("★ ชุดลำเลียงเปิดหน้าศูนย์สั่งการไม่ได้เลย", async ({ page }) => {
    /**
     * เช็คบทบาท "ก่อน" ยิง query ไม่ใช่หลัง — ถ้ากลับลำดับ รถของหน่วยอื่น
     * จะถูกส่งไปถึงเครื่องเขาแล้วทั้งที่จอไม่แสดง (คอมเมนต์หัวไฟล์ monitor/page.tsx)
     */
    await login(page, "/monitor", TRANSPORTER);

    await expect(page.getByText("ทรัพยากรที่จ่ายได้ตอนนี้")).toHaveCount(0);
    await expect(page.getByText("DEMO-AIR-1")).toHaveCount(0);
  });
});
