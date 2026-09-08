import { expect, test, type Page } from "@playwright/test";

import { hasCredentials, login } from "./helpers/auth";

/**
 * สคริปต์ "ตั้งของให้พร้อมลองเอง" — ไม่ใช่ชุดทดสอบ
 *
 *   SETUP_DEMO=1 npx playwright test e2e/setup-demo-transport.spec.ts
 *
 * ★ ข้ามเองเมื่อไม่มี SETUP_DEMO เพราะไฟล์นี้ "สร้างข้อมูล" ไม่ใช่ "ตรวจข้อมูล"
 *   ถ้าปล่อยให้รันปนกับ npx playwright test ทุกครั้ง จะมีเคสใหม่งอกทุกรอบ
 *   จนฐานข้อมูลสาธิตรก และแย่งรถกับสเปคอื่นที่ต้องการรถว่าง
 *
 * สร้างเคสสองใบให้เจ้าของโครงการเดินหน้า /transporter ด้วยมือ
 *   ใบที่ 1  รอจัดรถ      → ไว้ลองกดปุ่ม "จัดรถ" เองในฐานะชุดลำเลียง (ของใหม่ใน 0022)
 *   ใบที่ 2  จัดรถแล้ว     → ขึ้นหน้า /transporter ทันที เดินสถานะต่อได้เลย
 *
 * ★ ใช้บัญชีเดียวล็อกอินครั้งเดียว เพราะ 9900000001 ถือทั้ง sender · transporter · receiver
 *   และแอปจำกัดล็อกอิน 10 ครั้งต่อ IP ต่อ 10 นาที
 *
 * ★ ปลายทางต้องเป็นโรงพยาบาลค่าย ไม่ใช่ index ลอยๆ
 *   ไม่งั้นผู้รับ (9900000003) จะเปิดหน้า /track ไม่ได้เลยเพราะ can_see_case() ไม่ผ่าน
 */

const USER = "9900000001"; // จ.ส.อ. สมชาย ใจกล้า — sender · transporter · receiver


/** เปิดคำขอหนึ่งใบผ่านฟอร์ม 7 ขั้นจริง คืน caseId */
async function createCase(
  page: Page,
  opts: {
    complaint: string;
    precedence: "urgent" | "priority" | "routine";
    sites: [string, string];
  },
): Promise<string> {
  await page.goto("/sender/new");
  const next = page.getByRole("button", { name: "ถัดไป →" });

  // ขั้น 1 · อาการสำคัญ + ชื่อผู้ป่วย (การ์ดจะได้ไม่ขึ้นว่า "ยังไม่ได้บันทึกชื่อ")
  await page.fill('textarea[name="chiefComplaint"]', opts.complaint);
  await page.locator("summary", { hasText: "ข้อมูลผู้ป่วย" }).click();
  await page.fill('[name="rankTh"]', "ส.อ.");
  await page.fill('[name="firstName"]', "ทดสอบ");
  await page.fill('[name="lastName"]', opts.precedence === "urgent" ? "หนึ่ง" : "สอง");
  await page.fill('[name="affiliation"]', "ร้อย.ร.1 พัน.1");
  await next.click();

  // ขั้น 2 · ความเร่งด่วน
  await page
    .locator(`input[name="precedence"][value="${opts.precedence}"]`)
    .check({ force: true });
  await next.click();

  // ขั้น 3 · ปลายทางต้องเป็นโรงพยาบาลค่าย (หน่วยของผู้รับ)
  const toUnit = page.locator('select[name="toUnitId"]');
  const hosp = await toUnit
    .locator("option", { hasText: "โรงพยาบาลค่าย" })
    .first()
    .getAttribute("value");
  await toUnit.selectOption(hosp!);
  await page.locator('select[name="pickupPointId"]').selectOption({ index: 1 });
  await next.click();

  // ขั้น 4 · สัญญาณชีพแรกรับ ไว้ให้เทียบกับตอนประเมินซ้ำ
  await page.fill('input[name="sbp"]', "110");
  await page.fill('input[name="dbp"]', "70");
  await page.fill('input[name="pulse"]', "98");
  await page.fill('input[name="respRate"]', "20");
  await next.click();

  await next.click(); // ขั้น 5 ข้าม

  // ขั้น 6 · สายรัดห้ามเลือด 2 เส้น
  const pick = page.getByLabel("เลือกหัตถการหรือยาที่จะเพิ่ม");
  const addBtn = page.getByRole("button", { name: "+ เพิ่มรายการ" });
  const site = page.getByPlaceholder("ตำแหน่งที่รัด เช่น ต้นขาขวา");

  await pick.selectOption("tourniquet");
  await addBtn.click();
  await site.nth(0).fill(opts.sites[0]);

  await pick.selectOption("tourniquet");
  await addBtn.click();
  await site.nth(1).fill(opts.sites[1]);
  await expect(site).toHaveCount(2);
  await next.click();

  // ขั้น 7 · ส่งคำขอ
  await page.getByRole("button", { name: "ส่งคำขอ" }).click();
  await page.waitForURL(/\/sender\?sent=/, { timeout: 60_000 });
  return new URL(page.url()).searchParams.get("sent")!;
}

test.describe("ตั้งเคสให้พร้อมลองหน้า Transporter", () => {
  test.skip(!hasCredentials, "ยังไม่ได้ตั้ง E2E_* ใน .env.local");
  test.skip(!process.env.SETUP_DEMO, "สคริปต์สร้างข้อมูล — สั่งด้วย SETUP_DEMO=1 เท่านั้น");
  test.setTimeout(180_000);

  test("สร้าง 2 เคส — ใบหนึ่งรอจัดรถ ใบหนึ่งจัดรถแล้ว", async ({ page }) => {
    await login(page, "/sender/new", USER);

    const caseA = await createCase(page, {
      complaint: "แผลกระสุนต้นขาซ้าย เสียเลือดมาก (ใบนี้ไว้ลองกดจัดรถเอง)",
      precedence: "urgent",
      sites: ["ต้นขาซ้าย", "แขนขวา"],
    });

    const caseB = await createCase(page, {
      complaint: "สะเก็ดระเบิดหน้าแข้งขวา (ใบนี้จัดรถให้แล้ว เดินสถานะต่อได้เลย)",
      precedence: "priority",
      sites: ["หน้าแข้งขวา", "ต้นแขนซ้าย"],
    });

    // จัดรถให้ใบที่สอง โดยตั้งตัวเองเป็นผู้ลำเลียง จะได้ขึ้นหน้า /transporter
    await page.goto(`/track/${caseB}`);
    await page.locator('select[name="vehicleId"]').selectOption({ index: 1 });
    const tr = page.locator('select[name="transporterId"]');
    const me = await tr
      .locator("option", { hasText: "สมชาย" })
      .first()
      .getAttribute("value");
    await tr.selectOption(me!);
    await page.getByRole("button", { name: "จัดรถ", exact: true }).click();
    await expect(page.getByRole("button", { name: "ถึงจุดรับแล้ว" })).toBeVisible({
      timeout: 30_000,
    });

    await page.goto("/transporter");
    await page.screenshot({ path: "test-results/transporter-ready.png", fullPage: true });

    console.log(`
╔═══════════════════════════════════════════════════════════════
║  พร้อมให้ลองแล้ว — ล็อกอิน ${USER}
╠═══════════════════════════════════════════════════════════════
║  ใบที่ 1 (รอจัดรถ · ลองกดปุ่ม "จัดรถ" เอง)
║     http://localhost:3000/track/${caseA}
║
║  ใบที่ 2 (จัดรถแล้ว · ขึ้นหน้า /transporter · เดินสถานะต่อได้)
║     http://localhost:3000/track/${caseB}
║
║  หน้ารายการภารกิจ  http://localhost:3000/transporter
╚═══════════════════════════════════════════════════════════════
`);
  });
});
