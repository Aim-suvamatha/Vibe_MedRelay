import { expect, test, type Page } from "@playwright/test";

import { hasCredentials, login } from "./helpers/auth";

/**
 * ผู้รับปลายทางบันทึกการดูแลได้ก็ต่อเมื่อผู้ป่วยอยู่ในมือแล้ว (src/lib/custody.ts)
 *
 * เจ้าของโครงการเจอ 9 ก.ย. 2569 ว่าปลายทางเปิดเคสที่รถยังไม่ออกจากต้นทาง
 * แล้วลง V/S · ยืนยันสี · บันทึกการรักษา · กดคลายสายรัดได้หมด ทั้งที่ยังไม่เห็นตัวผู้ป่วย
 * เวชระเบียนจึงบันทึกสิ่งที่ไม่ได้เกิดขึ้น และเวลาที่ได้ไหลลงแดชบอร์ดตรงๆ
 *
 * ★ ต้องเดินด้วยสองบัญชีจริง พิสูจน์ด้วยบัญชีเดียวไม่ได้เลย
 *   9900000001 ถือทั้ง sender · transporter · receiver แต่สังกัด DEMO-BN-A
 *   เขาจึงไม่เคยเป็น "หน่วยปลายทาง" ของเคสที่ส่งเข้าโรงพยาบาล และไม่โดนล็อก
 *   คนที่โดนล็อกคือ 9900000003 ซึ่งสังกัด DEMO-HOSP เท่านั้น
 *   — บทเรียนเดียวกับบั๊กข้อ 2 เมื่อ 8 ก.ย. ที่ RoleGate มองไม่เห็นช่องโหว่
 *
 * ★ ตรวจทั้ง "ก่อน" และ "หลัง" ในเคสเดียวกัน ไม่ใช่คนละเคส
 *   ถ้าตรวจคนละเคส ความต่างอาจมาจากข้อมูลของเคส ไม่ใช่จากการกดรับผู้ป่วย
 */

const SENDER = "9900000001"; // จ.ส.อ. สมชาย — sender · transporter · receiver (DEMO-BN-A)
const RECEIVER = "9900000003"; // ร.ท. สมหญิง — receiver (DEMO-HOSP)

/** ชื่อฟอร์ม/ปุ่มที่ต้องหายไปตอนล็อก และต้องกลับมาตอนปลดล็อก */
const RELEASE_BTN = /ยังไม่คลาย/;
const TRIAGE_BTN = "บันทึกระดับความรุนแรง";
const VITALS_BTN = "บันทึกสัญญาณชีพ";
const TREATMENT_BTN = "บันทึกการรักษา";

async function careControls(page: Page) {
  return {
    release: await page.getByRole("button", { name: RELEASE_BTN }).count(),
    triage: await page.getByRole("button", { name: TRIAGE_BTN }).count(),
    vitals: await page.getByRole("button", { name: VITALS_BTN }).count(),
    treatment: await page
      .getByRole("button", { name: TREATMENT_BTN, exact: true })
      .count(),
  };
}

test.describe("ผู้รับบันทึกได้หลังรับผู้ป่วยเท่านั้น", () => {
  test.skip(!hasCredentials, "ยังไม่ได้ตั้ง E2E_* ใน .env.local");
  test.setTimeout(240_000);

  test("ก่อนกดรับ ล็อกทุกฟอร์ม · หลังกดรับ เปิดครบ", async ({ page }) => {
    /* ── 1. เขตหน้าเปิดเคสปลายทางโรงพยาบาล พร้อมสายรัด 1 เส้น ──── */
    await login(page, "/sender/new", SENDER);
    await page.goto("/sender/new");

    const next = page.getByRole("button", { name: "ถัดไป →" });

    await page.fill(
      'textarea[name="chiefComplaint"]',
      "แผลถูกยิงต้นขาขวา (เทสต์กติกาการถือผู้ป่วย)",
    );
    await next.click();

    await page.locator('input[name="precedence"][value="urgent"]').check({ force: true });
    await next.click();

    // ปลายทางต้องเป็นหน่วยของผู้รับ ไม่งั้น can_see_case() ไม่ผ่าน เขาเปิด /track ไม่ได้เลย
    const toUnit = page.locator('select[name="toUnitId"]');
    const hosp = await toUnit
      .locator("option", { hasText: "โรงพยาบาลค่าย" })
      .first()
      .getAttribute("value");
    await toUnit.selectOption(hosp!);
    await page.locator('select[name="pickupPointId"]').selectOption({ index: 1 });
    await next.click();

    await page.fill('input[name="sbp"]', "100");
    await page.fill('input[name="pulse"]', "120");
    await next.click();
    await next.click(); // ขั้น 5 ข้าม

    // สายรัดหนึ่งเส้น — ต้องมีของที่ "กดคลายได้" ไว้ทดสอบ
    await page.getByLabel("เลือกหัตถการหรือยาที่จะเพิ่ม").selectOption("tourniquet");
    await page.getByRole("button", { name: "+ เพิ่มรายการ" }).click();
    await page.getByPlaceholder("ตำแหน่งที่รัด เช่น ต้นขาขวา").first().fill("ต้นขาขวา");
    await next.click();

    await page.getByRole("button", { name: "ส่งคำขอ" }).click();
    await page.waitForURL(/\/sender\?sent=/, { timeout: 60_000 });
    const caseId = new URL(page.url()).searchParams.get("sent")!;

    /* ── 2. ★ ปลายทางเปิดดูตอนรถยังไม่ถึง — ต้องล็อกหมด (Case 1) ── */
    await login(page, `/track/${caseId}`, RECEIVER);
    await page.goto(`/track/${caseId}`);

    await expect(page.getByText("ประเมินผู้ป่วย").first()).toBeVisible();
    expect(await careControls(page)).toEqual({
      release: 0,
      triage: 0,
      vitals: 0,
      treatment: 0,
    });
    // ต้องบอกเหตุผลด้วย ไม่ใช่หายไปเฉยๆ แล้วปล่อยให้เดา
    await expect(
      page.getByText(/ผู้ป่วยยังไม่อยู่ในความดูแลของหน่วยนี้/).first(),
    ).toBeVisible();
    // แต่ยังต้องเห็นนาฬิกาสายรัดอยู่ — เห็นได้ แค่กดคลายไม่ได้
    await expect(page.getByText("สายรัดห้ามเลือด · 1 เส้น").first()).toBeVisible();

    /* ── 3. ชุดลำเลียงพาถึงปลายทางและกดส่งมอบ ─────────────────── */
    await login(page, `/track/${caseId}`, SENDER);
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

    /* ── 4. ★ ถึงปลายทางแล้วแต่ยังไม่กดรับ — ยังต้องล็อก (Case 2) ── */
    await login(page, `/track/${caseId}`, RECEIVER);
    await page.goto(`/track/${caseId}`);

    // ปุ่มรับผู้ป่วยต้องมาแล้ว แต่ฟอร์มการดูแลต้องยังไม่มา
    await expect(
      page.getByRole("button", { name: "รับผู้ป่วยเข้ารักษา" }),
    ).toBeVisible({ timeout: 30_000 });
    expect(await careControls(page)).toEqual({
      release: 0,
      triage: 0,
      vitals: 0,
      treatment: 0,
    });

    /* ── 5. ★ กดรับผู้ป่วย — ทุกอย่างต้องเปิด (Case 3) ─────────── */
    await page.getByRole("button", { name: "รับผู้ป่วยเข้ารักษา" }).click();
    await expect(page.getByText("ส่งกลับเสร็จแล้ว")).toBeVisible({ timeout: 30_000 });

    expect(await careControls(page)).toEqual({
      release: 1,
      triage: 1,
      vitals: 1,
      treatment: 1,
    });

    // และทางออกทั้งสองของผู้รับต้องโผล่พร้อมกัน
    await expect(page.getByText("ส่งผู้ป่วยออกจากหน่วยนี้")).toBeVisible();
    await expect(page.getByText("ส่งต่อชั้นการรักษาที่สูงกว่า")).toBeVisible();
    await expect(page.getByText("ส่งคืนหน่วยต้นสังกัด")).toBeVisible();

    // คลายสายรัดได้จริง ไม่ใช่แค่ปุ่มโผล่
    await page.getByRole("button", { name: RELEASE_BTN }).first().click();
    await expect(page.getByText("คลายแล้ว").first()).toBeVisible({ timeout: 30_000 });

    console.log(`\n>>> กติกาการถือผู้ป่วยทำงานครบสามระยะ caseId=${caseId}\n`);
  });
});
