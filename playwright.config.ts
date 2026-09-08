import { defineConfig, devices } from "@playwright/test";

/**
 * ตั้งค่า Playwright สำหรับ MedRelay
 *
 *   npx playwright test              รันทุกไฟล์ใน e2e/
 *   npx playwright test --ui         เปิดหน้าจอไล่ดูทีละขั้น
 *   npx playwright show-report       เปิดรายงานรอบล่าสุด
 *
 * ⚠ baseURL ต้องเป็น localhost ห้ามใช้เลข IP
 *   ขั้นที่ 3 ของฟอร์มผู้ส่งมีปุ่มดึงพิกัด ซึ่งเบราว์เซอร์ยอมเฉพาะ HTTPS หรือ localhost
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // แชร์ฐานข้อมูล Supabase ตัวเดียวกัน รันขนานแล้วข้อมูลชนกัน
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    // เก็บหลักฐานเฉพาะตอนพัง จะได้ไม่ถมดิสก์ตอนรันผ่าน
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // ระบบนี้ใช้งานจริงบนมือถือ ทดสอบด้วยขนาดมือถือเป็นหลัก
        viewport: { width: 390, height: 844 },
        // ขั้นที่ 3 กดปุ่มดึงพิกัด ถ้าไม่อนุญาตไว้ เบราว์เซอร์จะค้างรอ dialog
        permissions: ["geolocation"],
        geolocation: { latitude: 13.7563, longitude: 100.5018 }, // กรุงเทพฯ
      },
    },
  ],

  // ถ้ามี dev server เปิดอยู่แล้วก็ใช้ตัวเดิม ไม่งั้นเปิดให้เอง
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
