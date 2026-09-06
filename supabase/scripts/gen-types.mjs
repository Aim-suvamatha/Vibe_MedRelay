/**
 * generate src/types/database.ts จาก schema ของโปรเจกต์ Supabase จริง
 *
 *   node supabase/scripts/gen-types.mjs
 *
 * ต้องมี Personal Access Token — Dashboard → Account → Access Tokens (เลือก Read-only พอ)
 * สคริปต์จะถามเอง โดยไม่แสดงตัวอักษรบนจอและไม่ทิ้งไว้ใน shell history
 * ถ้าตั้ง SUPABASE_ACCESS_TOKEN ไว้ใน environment แล้วจะใช้ค่านั้นเลย ไม่ถามซ้ำ
 *
 * ทำไมต้องใช้ Management API แทน `supabase gen types --db-url`
 *   ลองมาแล้วทั้ง CLI 1.226 · 2.48 · 2.116 · latest — ทุกเวอร์ชันตอบเหมือนกันว่า
 *   "Cannot connect to the Docker daemon" เพราะ --db-url ถูกเปลี่ยนไปรันใน container
 *   เครื่องนี้ไม่มี Docker และไม่ควรต้องมีเพียงเพื่อ generate type
 *   endpoint นี้เป็นตัวเดียวกับที่ CLI เรียกตอนใช้ --project-id ซึ่งไม่แตะ Docker เลย
 *
 * ⚠ ต้อง generate ใหม่ทุกครั้งที่แก้ schema ไม่งั้น type จะหลุดจากของจริง
 *   แล้วโค้ดจะ compile ผ่านทั้งที่ column ไม่มีอยู่จริงในฐานข้อมูล
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

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

/** ถามโดยไม่ให้ตัวอักษรขึ้นบนจอและไม่ติดใน scrollback ของ Terminal */
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
      resolve(answer.trim());
    });
  });
}

const env = readEnvLocal();
const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL;
if (!projectUrl) {
  console.error("❌ .env.local ต้องมี NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}
const ref = new URL(projectUrl).hostname.split(".")[0];

const token =
  process.env.SUPABASE_ACCESS_TOKEN ||
  (await askHidden("Supabase Personal Access Token (ไม่แสดงบนจอ): "));

if (!token) {
  console.error("❌ ไม่ได้ใส่ token");
  process.exit(1);
}

console.log(`⏳ กำลังดึง schema ของโปรเจกต์ ${ref}…`);

const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/types/typescript?included_schemas=public`,
  { headers: { Authorization: `Bearer ${token}` } },
);

if (!res.ok) {
  console.error(`❌ Management API ตอบ ${res.status} ${res.statusText}`);
  if (res.status === 401) console.error("   token ไม่ถูกต้องหรือหมดอายุ");
  process.exit(1);
}

const body = await res.json();
const types = body.types ?? "";

if (!types.includes("export type Database")) {
  console.error("❌ คำตอบไม่ใช่ไฟล์ type ที่คาดไว้");
  process.exit(1);
}

// ตรวจว่าได้ schema ล่าสุดจริง ไม่ใช่ของที่ค้างอยู่ก่อนรัน 0015
for (const marker of ["pickup_point", "create_evac_request"]) {
  if (!types.includes(marker)) {
    console.error(`❌ ไม่พบ ${marker} ใน type ที่ได้มา — migration 0015 อาจยังไม่ถูกรันบนโปรเจกต์นี้`);
    process.exit(1);
  }
}

writeFileSync(new URL("../../src/types/database.ts", import.meta.url), types);
console.log(`✅ เขียน src/types/database.ts แล้ว — ${types.split("\n").length} บรรทัด`);
