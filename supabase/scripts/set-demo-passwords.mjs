/**
 * ตั้งรหัสผ่านให้บัญชีทดสอบทั้ง 4 ของ MedRelay
 *
 *   node supabase/scripts/set-demo-passwords.mjs --dry-run   ดูว่าจะแตะบัญชีไหนบ้าง ไม่เขียนอะไร
 *   node supabase/scripts/set-demo-passwords.mjs             ตั้งจริง
 *
 * ⚠ สคริปต์นี้ใช้ SUPABASE_SERVICE_ROLE_KEY ซึ่งข้ามทุก RLS policy
 *   รันบนเครื่องผู้พัฒนาเท่านั้น ห้ามเรียกจากโค้ดของแอป และห้าม deploy ขึ้น Vercel
 *
 * ทำไมต้องมีสคริปต์แทนการคลิกใน Dashboard
 *   Dashboard ต้องคลิกทีละคน 4 รอบ และต้องทำซ้ำทุกครั้งก่อน demo ซึ่งพลาดง่าย
 *   และสคริปต์นี้มีด่านกันที่ Dashboard ไม่มี — ดู GUARD_DOMAIN ด้านล่าง
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

/**
 * ★ ด่านกันที่สำคัญที่สุดของไฟล์นี้
 *   ยอมเปลี่ยนรหัสผ่านเฉพาะบัญชีในโดเมนนี้เท่านั้น
 *   ถ้าวันหนึ่งมีผู้ใช้จริงในระบบ สคริปต์นี้จะแตะบัญชีเขาไม่ได้แม้จะรันผิด
 */
const GUARD_DOMAIN = "@medrelay.invalid";

const DEMO_USERS = [
  "demo.sender@medrelay.invalid",
  "demo.transporter@medrelay.invalid",
  "demo.receiver@medrelay.invalid",
  "demo.monitor@medrelay.invalid",
];

const dryRun = process.argv.includes("--dry-run");

/** อ่าน .env.local เอง จะได้ไม่ต้องพึ่ง dotenv และไม่ต้องแตะ environment ของ shell */
function readEnvLocal() {
  const out = {};
  let raw;
  try {
    raw = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  } catch {
    console.error("❌ ไม่พบไฟล์ .env.local ที่รากโครงการ");
    process.exit(1);
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** ถามรหัสผ่านโดยไม่ให้ตัวอักษรขึ้นบนจอและไม่ติดใน scrollback ของ Terminal */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let shown = false;
    rl._writeToOutput = () => {
      if (!shown) {
        process.stdout.write(question);
        shown = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const env = readEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "❌ .env.local ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const api = (path, init = {}) =>
  fetch(`${url}/auth/v1/admin${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

console.log(`โปรเจกต์ ${url}`);
if (dryRun) console.log("โหมด --dry-run: จะไม่เขียนอะไรทั้งสิ้น");
console.log("");

// ── หาบัญชีก่อน ────────────────────────────────────────────────
const res = await api("/users?per_page=200");
if (!res.ok) {
  console.error(
    `❌ เรียก Admin API ไม่สำเร็จ (${res.status}) — ตรวจ SUPABASE_SERVICE_ROLE_KEY`,
  );
  process.exit(1);
}
const { users } = await res.json();
const byEmail = new Map(users.map((u) => [u.email, u]));

const found = [];
for (const email of DEMO_USERS) {
  const u = byEmail.get(email);
  if (!u) {
    console.log(`  ⚠️  ไม่พบบัญชี ${email}`);
    continue;
  }
  if (!email.endsWith(GUARD_DOMAIN)) {
    console.log(`  ⛔ ข้าม ${email} — ไม่ได้อยู่ในโดเมน ${GUARD_DOMAIN}`);
    continue;
  }
  found.push(u);
  console.log(`  ✓ พบ ${email}`);
}

if (found.length === 0) {
  console.error(
    "\n❌ ไม่พบบัญชีทดสอบสักบัญชี — ยังไม่ได้สร้างใน Dashboard หรือเปล่า",
  );
  process.exit(1);
}

console.log(
  `\nพบบัญชีที่จะตั้งรหัสผ่าน ${found.length} จาก ${DEMO_USERS.length} บัญชี`,
);

if (dryRun) {
  console.log("\n(--dry-run จบแล้ว ไม่มีอะไรถูกเปลี่ยน)");
  process.exit(0);
}

// ── ถามรหัสผ่าน ────────────────────────────────────────────────
const pw = await askHidden("ตั้งรหัสผ่านสำหรับทั้ง 4 บัญชี (ไม่แสดงบนจอ): ");
if (pw.length < 8) {
  console.error("❌ รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร");
  process.exit(1);
}
const pw2 = await askHidden("พิมพ์ซ้ำอีกครั้ง: ");
if (pw !== pw2) {
  console.error("❌ รหัสผ่านสองครั้งไม่ตรงกัน");
  process.exit(1);
}

console.log("");
let failed = 0;
for (const u of found) {
  const r = await api(`/users/${u.id}`, {
    method: "PUT",
    body: JSON.stringify({ password: pw, email_confirm: true }),
  });
  if (r.ok) {
    console.log(`  ✅ ${u.email}`);
  } else {
    failed++;
    console.log(
      `  ❌ ${u.email} — ${r.status} ${(await r.text()).slice(0, 120)}`,
    );
  }
}

console.log(
  failed
    ? `\n🛑 ตั้งไม่สำเร็จ ${failed} บัญชี`
    : `\n✅ ตั้งรหัสผ่านครบ ${found.length} บัญชี — ล็อกอินด้วยเลขประจำตัวทหารได้แล้ว`,
);
process.exit(failed ? 1 : 0);
