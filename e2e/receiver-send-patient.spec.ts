import { expect, test, type Page } from "@playwright/test";

import { hasCredentials, login } from "./helpers/auth";

/**
 * หน้าที่ที่สองของผู้รับ — ส่งผู้ป่วยออกจากหน่วย (คำสั่งเจ้าของโครงการ 9 ก.ย. 2569)
 *
 * มีสองทางที่ต่างกันคนละเรื่อง และต้องพิสูจน์ทั้งคู่ในรอบเดียวกัน
 *   ก. รักษาต่อไม่ไหว   → ส่งต่อชั้นสูงกว่า  → **เปิดทอดใหม่** เคสกลับมา active
 *   ข. อาการดีขึ้น      → ส่งคืนหน่วยต้นสังกัด → **ไม่เปิดทอด** บันทึกจำหน่าย เคสปิด
 *
 * ★ ต้องใช้คนละเคส เพราะทางเดียวกันเดินสองครั้งบนเคสเดียวไม่ได้
 *   (ทาง ข ปิดเคสไปแล้ว ทาง ก จะไม่มีที่ให้เปิดทอด)
 *
 * ★ ตรวจ "ผลที่ฐานข้อมูล" ผ่านหน้าจอ ไม่ใช่แค่ว่าฟอร์มกดได้
 *   ทาง ก ดูว่าทอดที่ 2 โผล่และเคสกลับเป็น "กำลังส่งกลับ"
 *   ทาง ข ดูว่าการ์ดกลายเป็นสรุปผลจำหน่ายและไม่มีทอดใหม่
 */

const SENDER = "9900000001"; // จ.ส.อ. สมชาย — sender · transporter (DEMO-BN-A)
const RECEIVER = "9900000003"; // ร.ท. สมหญิง — receiver (DEMO-HOSP)

/** เปิดเคสหนึ่งใบแล้วพาไปจนผู้รับกดรับผู้ป่วยเรียบร้อย คืน caseId */
async function caseInReceiverHands(page: Page, complaint: string): Promise<string> {
  await login(page, "/sender/new", SENDER);
  await page.goto("/sender/new");

  const next = page.getByRole("button", { name: "ถัดไป →" });

  await page.fill('textarea[name="chiefComplaint"]', complaint);
  await next.click();

  await page.locator('input[name="precedence"][value="routine"]').check({ force: true });
  await next.click();

  const toUnit = page.locator('select[name="toUnitId"]');
  const hosp = await toUnit
    .locator("option", { hasText: "โรงพยาบาลค่าย" })
    .first()
    .getAttribute("value");
  await toUnit.selectOption(hosp!);
  await page.locator('select[name="pickupPointId"]').selectOption({ index: 1 });
  await next.click();

  await page.fill('input[name="sbp"]', "120");
  await page.fill('input[name="pulse"]', "84");
  await next.click();
  await next.click(); // ขั้น 5 ข้าม
  await next.click(); // ขั้น 6 ไม่ใส่หัตถการ

  await page.getByRole("button", { name: "ส่งคำขอ" }).click();
  await page.waitForURL(/\/sender\?sent=/, { timeout: 60_000 });
  const caseId = new URL(page.url()).searchParams.get("sent")!;

  // ชุดลำเลียงพาถึงปลายทางแล้วกดส่งมอบ
  await page.goto(`/track/${caseId}`);
  await page.locator('select[name="vehicleId"]').selectOption({ index: 1 });
  const tr = page.locator('select[name="transporterId"]');
  const me = await tr
    .locator("option", { hasText: "สมชาย" })
    .first()
    .getAttribute("value");
  await tr.selectOption(me!);
  await page.getByRole("button", { name: "จัดรถ", exact: true }).click();

  for (const [click, wait] of [
    ["ถึงจุดรับแล้ว", "ออกเดินทางจากจุดรับ"],
    ["ออกเดินทางจากจุดรับ", "ถึงปลายทางส่งกลับแล้ว"],
    ["ถึงปลายทางส่งกลับแล้ว", "ส่งมอบผู้ป่วย"],
  ] as const) {
    await page.getByRole("button", { name: click }).click();
    await expect(page.getByRole("button", { name: wait })).toBeVisible({
      timeout: 30_000,
    });
  }
  await page.getByRole("button", { name: "ส่งมอบผู้ป่วย" }).click();
  await expect(page.getByText("ชุดลำเลียงส่งมอบแล้ว")).toBeVisible({ timeout: 30_000 });

  // ผู้รับรับตัวเข้ารักษา
  await login(page, `/track/${caseId}`, RECEIVER);
  await page.goto(`/track/${caseId}`);
  await page.getByRole("button", { name: "รับผู้ป่วยเข้ารักษา" }).click();
  await expect(page.getByText("ส่งกลับเสร็จแล้ว")).toBeVisible({ timeout: 30_000 });

  return caseId;
}

test.describe("ผู้รับส่งผู้ป่วยออกจากหน่วย", () => {
  test.skip(!hasCredentials, "ยังไม่ได้ตั้ง E2E_* ใน .env.local");
  test.setTimeout(300_000);

  test("ทาง ก · ส่งต่อชั้นสูงกว่า — เปิดทอดใหม่ เคสกลับมาเดินต่อ", async ({ page }) => {
    const caseId = await caseInReceiverHands(
      page,
      "กระดูกต้นขาหักปิด ต้องผ่าตัด (เทสต์ส่งต่อชั้นสูงกว่า)",
    );

    await page.getByText("ส่งต่อชั้นการรักษาที่สูงกว่า").click();

    /**
     * ★ ต้องล็อกขอบเขตไว้ที่ฟอร์มของทางนี้เสมอ ห้ามค้นทั้งหน้า
     *   ตั้งแต่ 9 ก.ย. 2569 ช่อง diagnosis กับ icd10 มีอยู่ทั้งสองทาง
     *   selector ที่ค้นทั้งหน้าจะเจอสองตัวแล้วไปหยิบตัวที่อยู่ใน <details>
     *   ที่ยังพับอยู่ ซึ่งมองไม่เห็น แล้ว fill ค้างจนหมดเวลา
     */
    const formA = page.locator("form").filter({ hasText: "ส่งคำขอส่งต่อ" });

    const toUnit = formA.locator('select[name="toUnitId"]');
    await expect(toUnit).toBeVisible();
    await toUnit.selectOption({ index: 1 });
    await formA
      .locator('input[name="precedence"][value="priority"]')
      .check({ force: true });
    await formA.locator('select[name="transportMode"]').selectOption("ground");
    await formA.locator('textarea[name="diagnosis"]').fill("กระดูกต้นขาขวาหักปิด");
    await formA.locator('input[name="icd10"]').fill("S72.3");
    await formA
      .locator('textarea[name="reason"]')
      .fill("ต้องผ่าตัดยึดตรึงกระดูก เกินขีดความสามารถของหน่วย");

    await page.getByRole("button", { name: "ส่งคำขอส่งต่อ" }).click();

    // ★ ผลที่ต้องเกิด — ทอดที่ 2 โผล่ และเคสกลับมาเดินต่อ ไม่ใช่ปิดค้าง
    await expect(page.getByText("ทอด 2")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("กำลังส่งกลับ").first()).toBeVisible();
    await expect(page.getByText("ทอดการส่งกลับ")).toBeVisible();
    // ความเร่งด่วนใหม่ต้องแทนที่ของเดิม (เปิดมาเป็น ปกติ)
    await expect(page.getByText("ด่วน", { exact: true }).first()).toBeVisible();
    // เหตุผลที่ส่งต่อต้องติดไปกับทอดใหม่ ปลายทางถัดไปจะได้อ่าน
    await expect(page.getByText(/เกินขีดความสามารถของหน่วย/)).toBeVisible();

    console.log(`\n>>> ทาง ก ส่งต่อชั้นสูงกว่าสำเร็จ caseId=${caseId}\n`);
  });

  test("ทาง ข · ส่งคืนหน่วยต้นสังกัด — ไม่เปิดทอด บันทึกจำหน่าย", async ({ page }) => {
    const caseId = await caseInReceiverHands(
      page,
      "แผลถลอกหลายแห่ง ทำแผลแล้วอาการดี (เทสต์ส่งคืนหน่วย)",
    );

    await page.getByText("ส่งคืนหน่วยต้นสังกัด").click();

    // เหตุผลเดียวกับทาง ก — ช่องวินิจฉัยมีทั้งสองทาง ต้องล็อกขอบเขตไว้ที่ฟอร์มนี้
    const formB = page.locator("form").filter({ hasText: "บันทึกการส่งคืน" });

    await formB
      .locator('input[name="outcome"][value="recovered"]')
      .check({ force: true });
    await formB.locator('textarea[name="diagnosis"]').fill("แผลถลอกหลายแห่ง");
    await formB.locator('input[name="icd10"]').fill("S81.0");
    await formB
      .locator('textarea[name="feedbackNote"]')
      .fill("พักงานเบา 7 วัน นัดตัดไหม 10 วัน");

    await page.getByRole("button", { name: "บันทึกการส่งคืน" }).click();

    // ★ ผลที่ต้องเกิด — การ์ดกลายเป็นสรุปผลจำหน่าย ไม่ใช่ฟอร์มให้กดซ้ำ
    await expect(page.getByText("จำหน่ายผู้ป่วยแล้ว")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/หาย · กลับปฏิบัติหน้าที่ได้/)).toBeVisible();
    await expect(page.getByText("S81.0")).toBeVisible();
    await expect(page.getByText("แผลถลอกหลายแห่ง").first()).toBeVisible();
    await expect(page.getByText(/พักงานเบา 7 วัน/)).toBeVisible();

    // ★ ต้องไม่เปิดทอดใหม่ และเคสต้องยังปิดอยู่
    await expect(page.getByText("ทอด 2")).toHaveCount(0);
    await expect(page.getByText("ส่งกลับเสร็จแล้ว")).toBeVisible();
    // ฟอร์มเดิมต้องหายไป กดจำหน่ายซ้ำไม่ได้
    await expect(page.getByText("ส่งผู้ป่วยออกจากหน่วยนี้")).toHaveCount(0);

    console.log(`\n>>> ทาง ข ส่งคืนหน่วยต้นสังกัดสำเร็จ caseId=${caseId}\n`);
  });
});
