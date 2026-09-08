import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Page } from "@playwright/test";

/**
 * อ่าน .env.local เอง แบบเดียวกับสคริปต์อื่นในโครงการ จะได้ไม่ต้องพึ่ง dotenv
 *
 * ใช้ process.cwd() ไม่ใช่ import.meta.url เพราะ Playwright แปลงไฟล์ทดสอบเป็น CommonJS
 * ซึ่งไม่มี import.meta — และ playwright test รันจากรากโครงการเสมอ
 */
function readEnvLocal(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...readEnvLocal(), ...process.env };

/**
 * บัญชีทดสอบสำหรับ e2e — ตั้งใน .env.local
 *   E2E_SERVICE_NUMBER=9900000001   (จ.ส.อ. สมชาย ใจกล้า · เป็นทั้ง sender · transporter · receiver)
 *   E2E_PASSWORD=<รหัสผ่าน>          ตั้งด้วย node supabase/scripts/set-demo-passwords.mjs
 *
 * ไม่เก็บรหัสผ่านไว้ในโค้ด เพราะ repo นี้เป็นสาธารณะ
 */
export const credentials = {
  serviceNumber: env.E2E_SERVICE_NUMBER,
  password: env.E2E_PASSWORD,
};

export const hasCredentials = Boolean(credentials.serviceNumber && credentials.password);

/**
 * ที่เก็บ cookie ของแต่ละบัญชี เพื่อไม่ต้องล็อกอินใหม่ทุกสเปค
 *
 * ⚠ เหตุผลที่ต้องมี — แอปจำกัดล็อกอิน 10 ครั้งต่อ IP และ 5 ครั้งต่อเลขทหาร
 *   ในทุก 10 นาที (ดู src/app/(auth)/login/actions.ts) ซึ่งเป็นของที่ต้องมีจริง
 *   ไม่ใช่ของที่ควรผ่อนเพื่อให้เทสต์ผ่าน การรันทั้งชุดรวดเดียวเคยชนเพดานนี้
 *   แล้วล้มสามสเปคด้วยอาการ "waitForURL timeout" ซึ่งชี้ไปผิดที่สนิท
 *
 *   วิธีแก้จึงเป็นการ "ล็อกอินให้น้อยลง" ไม่ใช่ "ปลดเพดาน" — เก็บ cookie
 *   ของบัญชีไว้ใช้ซ้ำข้ามสเปคในรอบเดียวกัน เหลือล็อกอินบัญชีละครั้งเดียว
 */
const AUTH_DIR = resolve(process.cwd(), "test-results/.auth");

/** ล็อกอินจริงผ่านหน้าจอ โยน error ถ้าไม่ผ่าน */
async function doLogin(page: Page, serviceNumber: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.fill("#serviceNumber", serviceNumber);
  await page.fill("#password", credentials.password!);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

/**
 * ล็อกอิน (หรือใช้ cookie เดิมถ้ายังใช้ได้) แล้วพาไปหน้า next
 *
 * ล้าง cookie เดิมก่อนเสมอ — /login จะเด้งกลับหน้าแรกถ้ายังมี session ค้างอยู่
 * ทำให้สลับบัญชีไม่ได้ ซึ่งเป็นกับดักที่เสียเวลาไปแล้วรอบหนึ่ง
 */
export async function login(
  page: Page,
  next = "/",
  serviceNumber = credentials.serviceNumber!,
) {
  await page.context().clearCookies();

  const file = resolve(AUTH_DIR, `${serviceNumber}.json`);
  if (existsSync(file)) {
    try {
      await page.context().addCookies(JSON.parse(readFileSync(file, "utf8")));
      await page.goto(next);
      // session เดิมยังใช้ได้ ไม่ต้องเปลืองโควตาล็อกอิน
      if (!new URL(page.url()).pathname.includes("/login")) return;
    } catch {
      // cookie เสียหรือหมดอายุ — ตกไปล็อกอินใหม่ตามปกติ
    }
    await page.context().clearCookies();
  }

  await doLogin(page, serviceNumber, next);

  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(await page.context().cookies()));
}
