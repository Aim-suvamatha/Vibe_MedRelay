/**
 * รัน SQL บนโปรเจกต์ Supabase จริง จากเครื่องนี้โดยตรง
 *
 *   node supabase/scripts/sql.mjs supabase/migrations/0015_evac_request.sql
 *   node supabase/scripts/sql.mjs --no-tx supabase/tests/form_test.sql
 *   echo "select count(*) from unit" | node supabase/scripts/sql.mjs -
 *
 * ทำไมถึงมีไฟล์นี้
 *   HANDOFF §5 ข้อ 5 เคยระบุว่า "ไม่มีทางเชื่อมต่อ database ตรงจากเครื่องนี้"
 *   จึงต้องส่ง SQL เข้าคลิปบอร์ดแล้วให้คนวางใน SQL Editor ทีละครั้ง
 *   ตอนนี้ .env.local มี DATABASE_PASSWORD แล้ว จึงต่อผ่าน pooler ได้เลย ไม่ต้องมี Docker หรือ psql
 *
 * ⚠ ต่อในฐานะ superuser `postgres` ซึ่งข้ามทุก RLS policy
 *   ใช้สำหรับ migration และการตรวจสอบเท่านั้น ห้ามให้โค้ดของแอปเรียกไฟล์นี้
 *
 * ค่าปริยายห่อคำสั่งทั้งไฟล์ด้วย begin/commit — ถ้าพังกลางทางจะ rollback ทั้งก้อน
 * ไม่มีตารางครึ่งๆ ค้าง (PostgreSQL รองรับ transactional DDL)
 * ไฟล์ที่จัดการ transaction เองอยู่แล้ว เช่น form_test.sql ที่ปิดท้ายด้วย rollback ให้ใส่ --no-tx
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

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

function readStdin() {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (buf += d));
    process.stdin.on("end", () => resolve(buf));
  });
}

const args = process.argv.slice(2);
const noTx = args.includes("--no-tx");
const target = args.find((a) => !a.startsWith("--"));

if (!target) {
  console.error("ใช้: node supabase/scripts/sql.mjs [--no-tx] <ไฟล์.sql | ->");
  process.exit(1);
}

const env = readEnvLocal();
const password = env.DATABASE_PASSWORD;
const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL;

if (!password || !projectUrl) {
  console.error(
    "❌ .env.local ต้องมี DATABASE_PASSWORD และ NEXT_PUBLIC_SUPABASE_URL",
  );
  process.exit(1);
}

const ref = new URL(projectUrl).hostname.split(".")[0];

/**
 * ลองหลายโฮสต์เพราะ Supabase ย้ายชื่อ pooler มาแล้วหลายรอบ
 * และ direct connection (db.<ref>.supabase.co) เป็น IPv6 อย่างเดียวในบางแพลน
 * ต้องใช้ session mode (5432) ไม่ใช่ transaction mode (6543) เพราะ DDL ต้องอยู่ใน session เดียว
 */
const HOSTS = [
  `aws-1-ap-southeast-1.pooler.supabase.com`,
  `aws-0-ap-southeast-1.pooler.supabase.com`,
  `db.${ref}.supabase.co`,
];

async function connect() {
  const errors = [];
  for (const host of HOSTS) {
    const direct = host.startsWith("db.");
    const client = new Client({
      host,
      port: 5432,
      database: "postgres",
      user: direct ? "postgres" : `postgres.${ref}`,
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      // งาน migration บางตัวสร้าง index ใหญ่ ปล่อยให้รันได้นานกว่าค่าปริยาย
      statement_timeout: 120000,
    });
    try {
      await client.connect();
      console.log(`🔌 ต่อแล้ว: ${host}`);
      return client;
    } catch (e) {
      errors.push(`   ${host}: ${e.message}`);
      try {
        await client.end();
      } catch {}
    }
  }
  console.error("❌ ต่อฐานข้อมูลไม่ได้ทุกโฮสต์ที่ลอง:");
  console.error(errors.join("\n"));
  process.exit(1);
}

const sql = target === "-" ? await readStdin() : readFileSync(target, "utf8");
const client = await connect();

try {
  // pg ส่งทั้งก้อนเป็น simple query ได้ จึงรันหลาย statement ในคำขอเดียว
  // และคืนผลลัพธ์มาเป็น array เรียงตามลำดับคำสั่ง
  const body = noTx ? sql : `begin;\n${sql}\n;commit;`;
  const result = await client.query(body);
  const sets = Array.isArray(result) ? result : [result];

  for (const r of sets) {
    if (r.command === "SELECT" && r.rows.length > 0) {
      console.table(r.rows);
    } else if (r.rowCount != null && r.command !== "SELECT") {
      console.log(`${r.command} ${r.rowCount}`);
    }
  }
  console.log(`\n✅ สำเร็จ — ${sets.length} คำสั่ง`);
} catch (e) {
  // ไม่ต้อง rollback เอง Postgres ยกเลิก transaction ให้แล้วตอนคำสั่งล้ม
  console.error(`\n❌ SQL ล้มเหลว: ${e.message}`);
  if (e.position) console.error(`   ตำแหน่ง: ${e.position}`);
  if (e.hint) console.error(`   คำแนะนำ: ${e.hint}`);
  if (e.where) console.error(`   ที่: ${e.where}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
