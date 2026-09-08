import { readFileSync } from "node:fs";
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

/** ล็อกอินแล้วรอจนหลุดจากหน้า /login โยน error ถ้าล็อกอินไม่ผ่าน */
export async function login(page: Page, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.fill("#serviceNumber", credentials.serviceNumber!);
  await page.fill("#password", credentials.password!);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}
