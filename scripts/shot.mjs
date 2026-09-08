/**
 * ถ่ายภาพหน้าจอของแอปที่รันอยู่ ให้คนหรือ AI ดูได้ว่าหน้าจอออกมาหน้าตาแบบไหน
 *
 *   node scripts/shot.mjs /sender                    ถ่ายหน้า /sender
 *   node scripts/shot.mjs /sender --full             ถ่ายทั้งหน้ายาว ไม่ใช่แค่ส่วนที่เห็น
 *   node scripts/shot.mjs /sender --text             พิมพ์ข้อความบนหน้าออกมาด้วย
 *   node scripts/shot.mjs /login --out หน้าล็อกอิน   ตั้งชื่อไฟล์เอง
 *   node scripts/shot.mjs /sender --desktop          ใช้ขนาดจอคอม (ค่าตั้งต้นคือมือถือ)
 *   node scripts/shot.mjs /sender --headed           เปิดเบราว์เซอร์ให้เห็นจริงๆ
 *
 * ต้องมี dev server เปิดอยู่ก่อน — npm run dev
 *
 * หน้าที่ต้องล็อกอินจะเข้าได้ก็ต่อเมื่อใส่สองค่านี้ไว้ใน .env.local
 *   E2E_SERVICE_NUMBER=9900000001
 *   E2E_PASSWORD=<รหัสผ่านบัญชีทดสอบ>
 * ถ้าไม่ใส่ สคริปต์จะถ่ายหน้าล็อกอินมาให้แทน แล้วบอกว่าเพราะอะไร
 *
 * ⚠ ห้ามชี้สคริปต์นี้ไปที่ระบบจริงที่มีข้อมูลผู้ป่วย ภาพที่ได้คือข้อมูลผู้ป่วยเต็มๆ (ดู AI_RULES.md)
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const path = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--out") ?? "/";
if (!path.startsWith("/")) {
  console.error("❌ ใส่ path ที่ขึ้นต้นด้วย / เช่น  node scripts/shot.mjs /sender");
  process.exit(1);
}

/** อ่าน .env.local เอง แบบเดียวกับสคริปต์อื่นในโครงการ จะได้ไม่ต้องพึ่ง dotenv */
function readEnvLocal() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const out = {};
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
const baseURL = env.E2E_BASE_URL ?? "http://localhost:3000";
const outDir = resolve(process.cwd(), "test-results/shots");
mkdirSync(outDir, { recursive: true });

const name = value("out") ?? (path.replace(/^\//, "").replace(/[/?#]/g, "_") || "home");
const file = resolve(outDir, `${name}.png`);

const browser = await chromium.launch({ headless: !flag("headed") });
const context = await browser.newContext({
  viewport: flag("desktop") ? { width: 1440, height: 900 } : { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: "th-TH",
  timezoneId: "Asia/Bangkok",
  permissions: ["geolocation"],
  geolocation: { latitude: 13.7563, longitude: 100.5018 },
});
const page = await context.newPage();

// เก็บทุกอย่างที่แอปบ่นออกมา — นี่คือส่วนที่ทำให้ debug ได้จริง ไม่ใช่แค่เห็นภาพสวยๆ
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") problems.push(`[console.${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) => problems.push(`[requestfailed] ${r.method()} ${r.url()} — ${r.failure()?.errorText}`));
page.on("response", (r) => {
  if (r.status() >= 400) problems.push(`[http ${r.status()}] ${r.request().method()} ${r.url()}`);
});

let note = "";
try {
  await page.goto(baseURL + path, { waitUntil: "networkidle", timeout: 30_000 });

  // ถูกเด้งไปหน้าล็อกอิน — ลองล็อกอินให้ถ้ามีบัญชีทดสอบใน .env.local
  // (ถ้าตั้งใจถ่ายหน้า /login เองก็ไม่ต้องล็อกอิน)
  if (page.url().includes("/login") && !path.startsWith("/login")) {
    const id = env.E2E_SERVICE_NUMBER;
    const pw = env.E2E_PASSWORD;
    if (id && pw) {
      await page.fill("#serviceNumber", id);
      await page.fill("#password", pw);
      await page.click('button[type="submit"]');
      await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30_000 }).catch(() => {});
      if (page.url().includes("/login")) {
        note = "⚠ ล็อกอินไม่ผ่าน — ตรวจ E2E_SERVICE_NUMBER / E2E_PASSWORD ใน .env.local";
      } else if (!page.url().endsWith(path)) {
        await page.goto(baseURL + path, { waitUntil: "networkidle" });
      }
    } else {
      note = "⚠ หน้านี้ต้องล็อกอิน แต่ยังไม่ได้ตั้ง E2E_SERVICE_NUMBER / E2E_PASSWORD ใน .env.local — ได้ภาพหน้าล็อกอินแทน";
    }
  }

  await page.waitForTimeout(500); // รอ animation ของ shadcn ให้นิ่งก่อนถ่าย
  await page.screenshot({ path: file, fullPage: flag("full") });

  console.log(`📸 ${file}`);
  console.log(`   URL ที่ถ่ายจริง: ${page.url()}`);
  if (note) console.log(`   ${note}`);

  if (flag("text")) {
    const text = await page.evaluate(() => document.body.innerText);
    console.log("\n--- ข้อความบนหน้า ---\n" + text.replace(/\n{3,}/g, "\n\n"));
  }

  if (problems.length) {
    console.log(`\n--- แอปบ่นมา ${problems.length} รายการ ---`);
    for (const p of [...new Set(problems)].slice(0, 40)) console.log("  " + p);
  } else {
    console.log("   ไม่มี error จาก console หรือ network");
  }
} catch (err) {
  console.error(`❌ เปิดหน้าไม่ได้: ${err.message}`);
  console.error(`   dev server เปิดอยู่ที่ ${baseURL} หรือยัง? — npm run dev`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
