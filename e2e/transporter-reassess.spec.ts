import { expect, test } from "@playwright/test";

import { hasCredentials, login } from "./helpers/auth";

/**
 * ประเมินซ้ำระหว่างส่งกลับ + ส่งมอบสองฝ่าย (0022)
 *
 * เดินทั้งสายด้วยสามบัญชีจริงในเบราว์เซอร์จริง เพราะกติกาใหม่สองข้อ
 * พิสูจน์ด้วยการดูหน้าจอของบัญชีเดียวไม่ได้เลย
 *   1. ชุดลำเลียงจัดรถเองได้        — ต้องเป็นบัญชีที่ไม่ใช่ศูนย์สั่งการ
 *   2. ส่งมอบต้องกดทั้งสองฝ่าย      — ต้องสลับบัญชีจริงถึงจะเห็นว่าปิดได้เมื่อไร
 *
 * ⚠ ต้องล้าง cookie ก่อนสลับบัญชีทุกครั้ง
 *   /login จะเด้งกลับหน้าแรกถ้ายังมี session เดิมค้างอยู่
 */

const SENDER = "9900000001"; // จ.ส.อ. สมชาย — sender · transporter · receiver
const TRANSPORTER = "9900000002"; // ส.อ. สมหมาย — transporter อย่างเดียว
const RECEIVER = "9900000003"; // ร.ท. สมหญิง — receiver · sender (สังกัดหน่วยปลายทาง)


test.describe("ประเมินซ้ำ + ส่งมอบสองฝ่าย", () => {
  test.skip(!hasCredentials, "ยังไม่ได้ตั้ง E2E_* ใน .env.local");
  test.setTimeout(240_000);

  test("เขตหน้าเปิดเคส → ชุดลำเลียงจัดรถเอง ประเมินซ้ำ → ส่งมอบสองฝ่าย", async ({
    page,
  }) => {
    /* ── 1. เขตหน้าเปิดคำขอ พร้อมสายรัดห้ามเลือด 2 เส้น ────────── */
    await login(page, "/sender/new", SENDER);
    await page.goto("/sender/new");

    const next = page.getByRole("button", { name: "ถัดไป →" });

    await page.fill(
      'textarea[name="chiefComplaint"]',
      "แผลกระสุนต้นขาขวาและแขนซ้าย เสียเลือดมาก",
    );
    await next.click();

    await page.locator('input[name="precedence"][value="priority"]').check({ force: true });
    await next.click();

    // ต้องเป็นหน่วยของผู้รับ (9900000003 สังกัดโรงพยาบาลค่ายสมมติ) ไม่ใช่ index ลอยๆ
    // can_see_case() ให้เห็นเคสจากหน่วยต้นทาง/ปลายทางเท่านั้น
    // ถ้าปลายทางเป็นหน่วยอื่น ผู้รับจะเปิดหน้า /track ไม่ได้เลย (404)
    const toUnit = page.locator('select[name="toUnitId"]');
    const hospValue = await toUnit
      .locator("option", { hasText: "โรงพยาบาลค่าย" })
      .first()
      .getAttribute("value");
    await toUnit.selectOption(hospValue!);
    await page.locator('select[name="pickupPointId"]').selectOption({ index: 1 });
    await next.click();

    // ขั้น 4 · V/S แรกรับ — ใช้ VitalsFields ตัวเดียวกับฟอร์มประเมินซ้ำ
    await page.fill('input[name="sbp"]', "100");
    await page.fill('input[name="dbp"]', "60");
    await page.fill('input[name="pulse"]', "120");
    await next.click();

    await next.click(); // ขั้น 5 ข้าม

    // ขั้น 6 · สายรัด 2 เส้น (ข้อ ก. และ ข. ของคำสั่ง — ต้องโผล่ทั้งสองหน้า)
    const pick = page.getByLabel("เลือกหัตถการหรือยาที่จะเพิ่ม");
    const addBtn = page.getByRole("button", { name: "+ เพิ่มรายการ" });
    const site = page.getByPlaceholder("ตำแหน่งที่รัด เช่น ต้นขาขวา");

    await pick.selectOption("tourniquet");
    await addBtn.click();
    await site.nth(0).fill("ต้นขาขวา");

    await pick.selectOption("tourniquet");
    await addBtn.click();
    await site.nth(1).fill("แขนซ้าย");

    await expect(site).toHaveCount(2);
    await next.click();

    await page.getByRole("button", { name: "ส่งคำขอ" }).click();
    await page.waitForURL(/\/sender\?sent=/, { timeout: 60_000 });
    const caseId = new URL(page.url()).searchParams.get("sent")!;
    console.log(`\n>>> เปิดเคสแล้ว caseId=${caseId}\n`);

    // ★ ข้อ ก. — การ์ดในหน้ารายการต้องโชว์สายรัดโดยไม่มีปุ่มคลาย
    await expect(page.getByText("สายรัดห้ามเลือด · 2 เส้น").first()).toBeVisible();

    /* ── 2. ชุดลำเลียงจัดรถเอง (ของใหม่ใน 0022) ────────────────── */
    await login(page, `/track/${caseId}`, TRANSPORTER);
    await page.goto(`/track/${caseId}`);

    // ★ ข้อ ข. — หน้านี้ต้องมีปุ่มคลายจริง
    await expect(page.getByRole("button", { name: /ยังไม่คลาย/ }).first()).toBeVisible();

    /**
     * ★ บั๊กที่เจ้าของโครงการเจอ 8 ก.ย. 2569 — กดคลายเส้นที่ 1 แล้วเส้นที่ 1 ยังแดง
     *   ส่วนเส้นที่เพิ่งคลายไปโผล่เป็นเส้นที่ 2
     *
     *   ข้อมูลถูกเสมอ (คลายตรงแถวที่กด) แต่ลำดับการแสดงผลสลับได้
     *   เพราะสายรัดของเคสเดียวกันมี given_at เท่ากันสนิท (datetime-local ละเอียดแค่นาที)
     *   และ created_at ก็เท่ากัน (insert ในทรานแซกชันเดียว) การเรียงจึงไม่มีตัวตัดสิน
     *
     *   เทสต์นี้ล็อกไว้ว่า "แถวที่กด ต้องอยู่ตำแหน่งเดิมและเปลี่ยนเป็นคลายแล้ว"
     */
    const tqRows = page.locator('section[aria-label="สายรัดห้ามเลือด"] > div');
    await expect(tqRows).toHaveCount(2);

    const firstLabel = (await tqRows.nth(0).locator("p").first().textContent())!.trim();
    await tqRows.nth(0).getByRole("button", { name: /ยังไม่คลาย/ }).click();

    // แถวแรกต้องเป็นเส้นเดิม (ตำแหน่งที่รัดไม่เปลี่ยน) และต้องคลายแล้ว
    await expect(tqRows.nth(0)).toContainText("คลายแล้ว", { timeout: 30_000 });
    await expect(tqRows.nth(0).locator("p").first()).toHaveText(firstLabel);
    // และเส้นที่สองต้องยังไม่ถูกแตะ
    await expect(tqRows.nth(1)).toContainText("ยังไม่คลาย");
    console.log(`\n>>> คลายเส้นที่ 1 แล้วยังอยู่ตำแหน่งเดิม: ${firstLabel}\n`);

    await page.locator('select[name="vehicleId"]').selectOption({ index: 1 });
    const tr = page.locator('select[name="transporterId"]');
    const trValue = await tr
      .locator("option", { hasText: "สมหมาย" })
      .first()
      .getAttribute("value");
    await tr.selectOption(trValue!);
    await page.getByRole("button", { name: "จัดรถ", exact: true }).click();
    await expect(page.getByText("ถึงจุดรับแล้ว").first()).toBeVisible({ timeout: 30_000 });
    console.log(`\n>>> ชุดลำเลียงจัดรถเองสำเร็จ\n`);

    /* ── 3. ประเมินซ้ำ สามเมนู สามเวลา ─────────────────────────── */
    // 3.1 ยืนยันสีใหม่ — เหลือง (priority) ต้องกลายเป็นแดง
    await page.locator('input[name="triage"][value="red"]').check({ force: true });
    await page.getByRole("button", { name: "บันทึกระดับความรุนแรง" }).click();
    await expect(page.getByText("บันทึกระดับความรุนแรงแล้ว")).toBeVisible({
      timeout: 30_000,
    });

    // 3.2 สัญญาณชีพ — ฟอร์มที่สองมีช่องชุดเดียวกับขั้น 4
    const vitalsForm = page.locator("form").filter({ hasText: "บันทึกสัญญาณชีพ" });
    await vitalsForm.locator('input[name="sbp"]').fill("85");
    await vitalsForm.locator('input[name="dbp"]').fill("50");
    await vitalsForm.locator('input[name="pulse"]').fill("134");
    await vitalsForm.locator('select[name="avpu"]').selectOption("voice");
    await page.getByRole("button", { name: "บันทึกสัญญาณชีพ" }).click();
    await expect(page.getByText("บันทึกสัญญาณชีพแล้ว")).toBeVisible({ timeout: 30_000 });

    // 3.3 หัตถการ — เมนูชุดเดียวกับขั้น 6 ของ sender
    const txForm = page.locator("form").filter({ hasText: "บันทึกการรักษา" });
    await txForm.getByLabel("เลือกหัตถการหรือยาที่จะเพิ่ม").selectOption("iv_fluid");
    await txForm.getByRole("button", { name: "+ เพิ่มรายการ" }).click();
    await txForm.getByPlaceholder("ชื่อยา / รายละเอียด").first().fill("NSS");
    await page.getByRole("button", { name: "บันทึกการรักษา", exact: true }).click();
    await expect(page.getByText(/บันทึกการรักษา 1 รายการแล้ว/)).toBeVisible({
      timeout: 30_000,
    });
    console.log(`\n>>> ประเมินซ้ำครบสามเมนู\n`);

    /* ── 4. เดินสถานะจนถึงปลายทาง ──────────────────────────────── */
    await page.getByRole("button", { name: "ถึงจุดรับแล้ว" }).click();
    await expect(
      page.getByRole("button", { name: "ออกเดินทางจากจุดรับ" }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "ออกเดินทางจากจุดรับ" }).click();
    await expect(
      page.getByRole("button", { name: "ถึงปลายทางส่งกลับแล้ว" }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "ถึงปลายทางส่งกลับแล้ว" }).click();
    await expect(page.getByRole("button", { name: "ส่งมอบผู้ป่วย" })).toBeVisible({
      timeout: 30_000,
    });

    /* ── 5. ส่งมอบฝ่ายแรก — ทอดต้องยังไม่ปิด ───────────────────── */
    await page.getByRole("button", { name: "ส่งมอบผู้ป่วย" }).click();
    // ข้อความบอกหน่วยปลายทางด้วยตั้งแต่ 0023 — ชุดลำเลียงไม่ได้อยู่หน่วยนั้น
    // จึงเห็นเป็น "รอผู้รับที่ <หน่วย> กดยืนยันรับมอบ ทอดจึงจะปิด"
    await expect(
      page.getByText(/^รอผู้รับที่ .* กดยืนยันรับมอบ ทอดจึงจะปิด$/),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("ชุดลำเลียงส่งมอบแล้ว")).toBeVisible();
    console.log(`\n>>> ฝ่ายแรกส่งมอบแล้ว ทอดยังไม่ปิด (ถูกต้อง)\n`);

    await page.screenshot({
      path: "test-results/track-after-offer.png",
      fullPage: true,
    });

    // ภาพหน้าภารกิจลำเลียง — ถ่ายตอนนี้เลยเพื่อไม่ต้องล็อกอินเป็นชุดลำเลียงซ้ำอีกรอบ
    // (แอปจำกัดการล็อกอิน 10 ครั้งต่อ IP ต่อ 10 นาที รันซ้ำสองรอบจะชนเพดาน)
    await page.goto("/transporter");
    await page.screenshot({
      path: "test-results/transporter-after.png",
      fullPage: true,
    });

    /* ── 6. ผู้รับปลายทางยืนยัน ทอดจึงปิด ──────────────────────── */
    await login(page, `/track/${caseId}`, RECEIVER);
    await page.goto(`/track/${caseId}`);

    await page.getByRole("button", { name: "ยืนยันรับมอบผู้ป่วย" }).click();
    await expect(page.getByText("ส่งกลับเสร็จ").first()).toBeVisible({
      timeout: 30_000,
    });
    console.log(`\n>>> ผู้รับยืนยันแล้ว ทอดปิด · caseId=${caseId}\n`);

    await page.screenshot({
      path: "test-results/track-completed.png",
      fullPage: true,
    });
  });
});
