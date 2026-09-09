import { expect, test, type Page } from "@playwright/test";

import { hasCredentials, login } from "./helpers/auth";

/**
 * สคริปต์ "ตั้งของให้พร้อมลองเอง" ฝั่งผู้รับ — ไม่ใช่ชุดทดสอบ
 *
 *   npm run demo:reset
 *   SETUP_DEMO=1 npx playwright test e2e/setup-demo-receiver.spec.ts
 *
 * ★ ข้ามเองเมื่อไม่มี SETUP_DEMO ด้วยเหตุผลเดียวกับ setup-demo-transport.spec.ts
 *   ไฟล์นี้ "สร้างข้อมูล" ถ้าปล่อยรันปนทุกครั้งจะมีเคสงอกและแย่งรถกับสเปคอื่น
 *
 * สร้างห้าใบให้เจ้าของโครงการเปิดหน้า /receiver แล้วเห็นครบทุกระยะของการส่งกลับ
 *   ใบที่ 1  จัดรถแล้ว          → ปลายทางเพิ่งรู้ว่าจะมีคนมา รถยังไม่ถึงจุดรับ
 *   ใบที่ 2  กำลังเดินทาง        → อยู่บนรถแล้ว มีผลประเมินซ้ำระหว่างทาง (สีเปลี่ยนเป็นแดง)
 *   ใบที่ 3  ถึงปลายทาง + ชุดลำเลียงกดส่งมอบแล้ว → ค้างรอผู้รับกด "รับผู้ป่วยเข้ารักษา"
 *   ใบที่ 4  รับผู้ป่วยแล้ว       → ไว้ลองการ์ด ⑦ "ส่งต่อชั้นการรักษาที่สูงกว่า"
 *   ใบที่ 5  รับผู้ป่วยแล้ว       → ไว้ลองการ์ด ⑦ "ส่งคืนหน่วยต้นสังกัด"
 *
 * ★ ทำไมใบ 4 กับ 5 ต้องแยกกัน
 *   ทางออกทั้งสองของผู้รับเป็นทางเดียว กดแล้วกดซ้ำไม่ได้ — ส่งคืนหน่วยจะบันทึก
 *   ผลจำหน่ายแล้วการ์ด ⑦ กลายเป็นสรุป ส่วนส่งต่อจะเปิดทอดที่ 2 แล้วเคสกลับมาเดิน
 *   ถ้ามีใบเดียวจะลองได้ทางเดียวแล้วต้องรันสคริปต์ใหม่ทั้งชุด
 *
 * ★ ปลายทางต้องเป็นโรงพยาบาลค่ายสมมติ (หน่วยของ 9900000003) เท่านั้น
 *   /receiver กรองด้วย to_unit_id = หน่วยของคนที่ล็อกอิน และ can_see_case()
 *   ก็ให้เห็นเฉพาะเคสของหน่วยต้นทาง/ปลายทาง ปลายทางผิดหน่วย = ไม่เห็นอะไรเลย
 *
 * ★ ใช้ 9900000001 ล็อกอินครั้งเดียวเดินทั้งสามใบ เพราะเขาถือทั้ง sender และ
 *   transporter และตั้งตัวเองเป็นผู้ลำเลียงได้ — 0023 บังคับว่าเฉพาะผู้ที่ถูกจ่ายทอด
 *   เท่านั้นที่เดินสถานะต่อได้ ถ้าจ่ายให้คนอื่นจะต้องสลับบัญชีเพิ่มอีกหลายรอบ
 *   และแอปจำกัดล็อกอิน 10 ครั้งต่อ IP ต่อ 10 นาที
 */

const SENDER = "9900000001"; // จ.ส.อ. สมชาย ใจกล้า — sender · transporter · receiver (DEMO-BN-A)
const RECEIVER = "9900000003"; // ร.ท. สมหญิง รับส่ง — receiver (DEMO-HOSP)

type Vitals = { sbp: string; dbp: string; pulse: string; rr: string };

/** เปิดคำขอหนึ่งใบผ่านฟอร์ม 7 ขั้นจริง คืน caseId */
async function createCase(
  page: Page,
  opts: {
    complaint: string;
    lastName: string;
    precedence: "urgent" | "priority" | "routine";
    vitals: Vitals;
    sites?: [string, string];
  },
): Promise<string> {
  await page.goto("/sender/new");
  const next = page.getByRole("button", { name: "ถัดไป →" });

  // ขั้น 1 · อาการสำคัญ + ชื่อผู้ป่วย (การ์ดจะได้ไม่ขึ้นว่า "ยังไม่ได้บันทึกชื่อ")
  await page.fill('textarea[name="chiefComplaint"]', opts.complaint);
  await page.locator("summary", { hasText: "ข้อมูลผู้ป่วย" }).click();
  await page.fill('[name="rankTh"]', "ส.อ.");
  await page.fill('[name="firstName"]', "ทดสอบ");
  await page.fill('[name="lastName"]', opts.lastName);
  await page.fill('[name="affiliation"]', "ร้อย.ร.1 พัน.1");
  await next.click();

  // ขั้น 2 · ความเร่งด่วน
  await page
    .locator(`input[name="precedence"][value="${opts.precedence}"]`)
    .check({ force: true });
  await next.click();

  // ขั้น 3 · ปลายทางต้องเป็นโรงพยาบาลค่าย = หน่วยของผู้รับ
  const toUnit = page.locator('select[name="toUnitId"]');
  const hosp = await toUnit
    .locator("option", { hasText: "โรงพยาบาลค่าย" })
    .first()
    .getAttribute("value");
  await toUnit.selectOption(hosp!);
  await page.locator('select[name="pickupPointId"]').selectOption({ index: 1 });
  await next.click();

  // ขั้น 4 · สัญญาณชีพแรกรับ ไว้ให้ปลายทางเทียบกับตอนประเมินซ้ำ
  await page.fill('input[name="sbp"]', opts.vitals.sbp);
  await page.fill('input[name="dbp"]', opts.vitals.dbp);
  await page.fill('input[name="pulse"]', opts.vitals.pulse);
  await page.fill('input[name="respRate"]', opts.vitals.rr);
  await next.click();

  await next.click(); // ขั้น 5 ข้าม

  // ขั้น 6 · สายรัดห้ามเลือด — ข้อมูลชุดเดียวในเคสที่มีนาฬิกาเดินอยู่
  // ปลายทางต้องเห็นก่อนรถถึง เพราะมีผลต่อการเตรียมทีมรับ
  if (opts.sites) {
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
  }
  await next.click();

  // ขั้น 7 · ส่งคำขอ
  await page.getByRole("button", { name: "ส่งคำขอ" }).click();
  await page.waitForURL(/\/sender\?sent=/, { timeout: 60_000 });
  return new URL(page.url()).searchParams.get("sent")!;
}

/** จัดรถให้ทอดแรก โดยตั้งตัวเองเป็นผู้ลำเลียง (0023 ให้เฉพาะผู้ถือทอดเดินสถานะต่อ) */
async function dispatchToSelf(page: Page, caseId: string) {
  await page.goto(`/track/${caseId}`);
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
}

/** กดเดินสถานะหนึ่งขั้น แล้วรอปุ่มของขั้นถัดไปโผล่ */
async function advance(page: Page, click: string, expectNext: string) {
  await page.getByRole("button", { name: click }).click();
  await expect(page.getByRole("button", { name: expectNext })).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * เดินทอดจนถึงปลายทางแล้วให้ผู้รับกดรับผู้ป่วย — ใช้กับใบที่ 4 และ 5
 *
 * ★ ต้องสลับบัญชีจริงตรงขั้นสุดท้าย ปลอมไม่ได้
 *   0023 บังคับว่าปุ่ม "รับผู้ป่วยเข้ารักษา" กดได้เฉพาะคนที่สังกัดหน่วยปลายทาง
 *   และ custody.ts ผูกสิทธิ์บันทึกทางคลินิกไว้กับ handover_at ที่ปุ่มนี้ตั้งให้
 */
async function receiveAtDestination(page: Page, caseId: string) {
  await page.goto(`/track/${caseId}`);
  await advance(page, "ถึงจุดรับแล้ว", "ออกเดินทางจากจุดรับ");
  await advance(page, "ออกเดินทางจากจุดรับ", "ถึงปลายทางส่งกลับแล้ว");
  await advance(page, "ถึงปลายทางส่งกลับแล้ว", "ส่งมอบผู้ป่วย");
  await page.getByRole("button", { name: "ส่งมอบผู้ป่วย" }).click();
  await expect(page.getByText("ชุดลำเลียงส่งมอบแล้ว")).toBeVisible({ timeout: 30_000 });

  await login(page, `/track/${caseId}`, RECEIVER);
  await page.goto(`/track/${caseId}`);
  await page.getByRole("button", { name: "รับผู้ป่วยเข้ารักษา" }).click();
  await expect(page.getByText("ส่งผู้ป่วยออกจากหน่วยนี้")).toBeVisible({
    timeout: 30_000,
  });

  // กลับมาเป็นเขตหน้า/ชุดลำเลียงเพื่อเปิดใบถัดไป
  await login(page, "/sender/new", SENDER);
}

test.describe("ตั้งเคสให้พร้อมลองหน้า Receiver", () => {
  test.skip(!hasCredentials, "ยังไม่ได้ตั้ง E2E_* ใน .env.local");
  test.skip(!process.env.SETUP_DEMO, "สคริปต์สร้างข้อมูล — สั่งด้วย SETUP_DEMO=1 เท่านั้น");
  test.setTimeout(300_000);

  test("สร้าง 5 ใบ — ครบทุกระยะ รวมใบที่รับแล้วไว้ลองส่งผู้ป่วยออก", async ({ page }) => {
    await login(page, "/sender/new", SENDER);

    /* ── ใบที่ 1 · จัดรถแล้ว — ปลายทางเพิ่งรู้ว่าจะมีคนมา ─────────── */
    const caseA = await createCase(page, {
      complaint: "ปวดท้องเฉียบพลัน สงสัยไส้ติ่งอักเสบ",
      lastName: "หนึ่ง",
      precedence: "routine",
      vitals: { sbp: "124", dbp: "78", pulse: "88", rr: "18" },
    });
    await dispatchToSelf(page, caseA);

    /* ── ใบที่ 2 · กำลังเดินทาง + ประเมินซ้ำระหว่างทาง ──────────── */
    const caseB = await createCase(page, {
      complaint: "แผลกระสุนต้นขาซ้าย เสียเลือดมาก รัดสายห้ามเลือดไว้ 2 เส้น",
      lastName: "สอง",
      precedence: "urgent",
      vitals: { sbp: "100", dbp: "60", pulse: "118", rr: "24" },
      sites: ["ต้นขาซ้าย", "แขนขวา"],
    });
    await dispatchToSelf(page, caseB);

    // ประเมินซ้ำก่อนขึ้นรถ — เวลาผ่านไปอาการแย่ลง สีที่เขตหน้าให้ไว้ไม่ใช่สีที่ถูกแล้ว
    await page.locator('input[name="triage"][value="red"]').check({ force: true });
    await page.getByRole("button", { name: "บันทึกระดับความรุนแรง" }).click();
    await expect(page.getByText("บันทึกระดับความรุนแรงแล้ว")).toBeVisible({
      timeout: 30_000,
    });

    const vitalsForm = page.locator("form").filter({ hasText: "บันทึกสัญญาณชีพ" });
    await vitalsForm.locator('input[name="sbp"]').fill("88");
    await vitalsForm.locator('input[name="dbp"]').fill("52");
    await vitalsForm.locator('input[name="pulse"]').fill("132");
    await vitalsForm.locator('select[name="avpu"]').selectOption("voice");
    await page.getByRole("button", { name: "บันทึกสัญญาณชีพ" }).click();
    await expect(page.getByText("บันทึกสัญญาณชีพแล้ว")).toBeVisible({ timeout: 30_000 });

    // ให้น้ำเกลือระหว่างทาง — ปลายทางจะได้เห็นว่าได้อะไรมาแล้วบ้าง
    const txForm = page.locator("form").filter({ hasText: "บันทึกการรักษา" });
    await txForm.getByLabel("เลือกหัตถการหรือยาที่จะเพิ่ม").selectOption("iv_fluid");
    await txForm.getByRole("button", { name: "+ เพิ่มรายการ" }).click();
    await txForm.getByPlaceholder("ชื่อยา / รายละเอียด").first().fill("NSS 1000 ml");
    await page.getByRole("button", { name: "บันทึกการรักษา", exact: true }).click();
    await expect(page.getByText(/บันทึกการรักษา 1 รายการแล้ว/)).toBeVisible({
      timeout: 30_000,
    });

    await advance(page, "ถึงจุดรับแล้ว", "ออกเดินทางจากจุดรับ");
    await advance(page, "ออกเดินทางจากจุดรับ", "ถึงปลายทางส่งกลับแล้ว");

    /* ── ใบที่ 3 · ถึงปลายทางแล้ว ชุดลำเลียงกดส่งมอบ รอผู้รับยืนยัน ── */
    const caseC = await createCase(page, {
      complaint: "สะเก็ดระเบิดหน้าแข้งขวา รู้สึกตัวดี",
      lastName: "สาม",
      precedence: "priority",
      vitals: { sbp: "118", dbp: "72", pulse: "96", rr: "20" },
      sites: ["หน้าแข้งขวา", "ต้นแขนซ้าย"],
    });
    await dispatchToSelf(page, caseC);
    await advance(page, "ถึงจุดรับแล้ว", "ออกเดินทางจากจุดรับ");
    await advance(page, "ออกเดินทางจากจุดรับ", "ถึงปลายทางส่งกลับแล้ว");
    await advance(page, "ถึงปลายทางส่งกลับแล้ว", "ส่งมอบผู้ป่วย");

    // ฝ่ายแรกกดส่งมอบ — ทอดยังไม่ปิดจนกว่าผู้รับจะกดยืนยัน (0022)
    await page.getByRole("button", { name: "ส่งมอบผู้ป่วย" }).click();
    await expect(page.getByText("ชุดลำเลียงส่งมอบแล้ว")).toBeVisible({ timeout: 30_000 });

    /* ── ใบที่ 4 · รับผู้ป่วยแล้ว — ไว้ลอง "ส่งต่อชั้นการรักษาที่สูงกว่า" ── */
    const caseD = await createCase(page, {
      complaint: "กระดูกต้นขาหักปิด ต้องผ่าตัดยึดตรึง (ใบนี้ไว้ลองส่งต่อชั้นสูงกว่า)",
      lastName: "สี่",
      precedence: "priority",
      vitals: { sbp: "112", dbp: "70", pulse: "104", rr: "20" },
    });
    await dispatchToSelf(page, caseD);
    await receiveAtDestination(page, caseD);

    /* ── ใบที่ 5 · รับผู้ป่วยแล้ว — ไว้ลอง "ส่งคืนหน่วยต้นสังกัด" ────── */
    const caseE = await createCase(page, {
      complaint: "แผลถลอกหลายแห่ง ทำแผลแล้วอาการดี (ใบนี้ไว้ลองส่งคืนหน่วย)",
      lastName: "ห้า",
      precedence: "routine",
      vitals: { sbp: "120", dbp: "76", pulse: "82", rr: "16" },
    });
    await dispatchToSelf(page, caseE);
    await receiveAtDestination(page, caseE);

    /* ── ถ่ายภาพหน้าจอฝั่งผู้รับให้ดูได้เลย ───────────────────── */
    await login(page, "/receiver", RECEIVER);
    await page.goto("/receiver");
    await expect(page.getByText("กำลังเดินทางมาหน่วยนี้")).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: "test-results/receiver-ready.png", fullPage: true });

    await page.goto(`/track/${caseC}`);
    await expect(
      page.getByRole("button", { name: "รับผู้ป่วยเข้ารักษา" }),
    ).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: "test-results/receiver-track-awaiting-confirm.png",
      fullPage: true,
    });

    console.log(`
╔═══════════════════════════════════════════════════════════════
║  พร้อมให้ดูแล้ว — ล็อกอิน ${RECEIVER} (ร.ท. สมหญิง รับส่ง · โรงพยาบาลค่ายสมมติ)
╠═══════════════════════════════════════════════════════════════
║  หน้าผู้ป่วยกำลังมาถึง   http://localhost:3000/receiver
║
║  ใบที่ 1 (จัดรถแล้ว · รถยังไม่ถึงจุดรับ)
║     http://localhost:3000/track/${caseA}
║  ใบที่ 2 (กำลังเดินทาง · ประเมินซ้ำเป็นสีแดง · สายรัด 2 เส้น)
║     http://localhost:3000/track/${caseB}
║  ใบที่ 3 (ถึงปลายทางแล้ว · รอกดปุ่ม "รับผู้ป่วยเข้ารักษา")
║     http://localhost:3000/track/${caseC}
║
║  ── รับผู้ป่วยแล้ว · ไว้ลองการ์ด "ส่งผู้ป่วยออกจากหน่วยนี้" ──
║  ใบที่ 4 (ลองทาง "ส่งต่อชั้นการรักษาที่สูงกว่า")
║     http://localhost:3000/track/${caseD}
║  ใบที่ 5 (ลองทาง "ส่งคืนหน่วยต้นสังกัด")
║     http://localhost:3000/track/${caseE}
╚═══════════════════════════════════════════════════════════════
`);
  });
});
