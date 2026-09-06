/**
 * รัน migration + seed + test ทั้งหมดบน PostgreSQL จริงในเครื่อง
 * โดยไม่ต้องมี Docker และไม่ต้องแตะ Supabase จริง
 *
 *   npm install --save-dev @electric-sql/pglite
 *   node supabase/tests/local/run.mjs
 *
 * PGlite คือ PostgreSQL ที่คอมไพล์เป็น WASM รันในโปรเซส Node ได้เลย
 * ใช้จับ syntax error และ logic error ของ SQL ก่อนเอาไปวางใน SQL Editor
 *
 * ⚠ ไม่ใช่ของแทน Supabase — สิ่งที่ไฟล์นี้พิสูจน์ไม่ได้
 *   - พฤติกรรมของ Supabase Auth จริง (ที่นี่ใช้ shim.sql จำลอง auth.uid())
 *   - default privileges และการตั้งค่าเฉพาะของโปรเจกต์
 *   - PostgreSQL เวอร์ชันที่ Supabase ใช้จริงอาจต่างจาก PGlite
 *   ยังต้องรัน rls_test.sql บน Supabase จริงอีกรอบก่อน deploy เสมอ
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SUPA = resolve(HERE, '../..')
const db = await PGlite.create()
let failed = 0

const read = p => readFileSync(p, 'utf8')

async function run(label, sql, quiet = false) {
  try {
    const r = await db.exec(sql)
    if (!quiet) console.log(`✅ ${label}`)
    return r
  } catch (e) {
    failed++
    console.log(`❌ ${label}\n   ${e.message}`)
    for (const k of ['detail', 'hint', 'where']) if (e[k]) console.log(`   ${k}: ${e[k]}`)
    return null
  }
}

console.log('=== setup ===')
await run('shim.sql (จำลอง auth schema ของ Supabase)', read(join(HERE, 'shim.sql')))

for (const m of readdirSync(join(SUPA, 'migrations')).filter(x => x.endsWith('.sql')).sort())
  await run(`migration ${m}`, read(join(SUPA, 'migrations', m)))

await run('seed.sql', read(join(SUPA, 'seed.sql')))
await run('auth.users (แทนการกดสร้างใน Dashboard)', `
  insert into auth.users (email) values
    ('demo.sender@medrelay.invalid'), ('demo.transporter@medrelay.invalid'),
    ('demo.receiver@medrelay.invalid'), ('demo.monitor@medrelay.invalid')
  on conflict (email) do nothing;`)
await run('seed_profiles.sql', read(join(SUPA, 'seed_profiles.sql')))
await run('seed_demo_cases.sql', read(join(SUPA, 'seed_demo_cases.sql')))
await run('seed_pickup_points.sql', read(join(SUPA, 'seed_pickup_points.sql')))

if (failed) {
  console.log(`\n🛑 setup ล้ม ${failed} ไฟล์ — แก้ก่อนแล้วรันใหม่`)
  process.exit(1)
}

function report(results, title) {
  console.log(`\n=== ${title} ===`)
  for (const r of results ?? []) {
    if (!r.rows?.length) continue
    if (r.rows[0].test !== undefined) {
      for (const row of r.rows) {
        if (row.result !== 'PASS') failed++
        console.log(`   ${row.result === 'PASS' ? '✅' : '❌'} ${row.test}${row.note ? `  — ${row.note}` : ''}`)
      }
    } else if (r.rows[0].verdict !== undefined) {
      console.log(`   → ${r.rows[0].summary}  ${r.rows[0].verdict}`)
    }
  }
}

report(await run('rls_test.sql', read(join(SUPA, 'tests/rls_test.sql')), true), 'rls_test.sql')
report(await run('trigger_test.sql', read(join(SUPA, 'tests/trigger_test.sql')), true), 'trigger_test.sql')
report(await run('form_test.sql', read(join(SUPA, 'tests/form_test.sql')), true), 'form_test.sql')
report(await run('track_flow_test.sql', read(join(SUPA, 'tests/track_flow_test.sql')), true), 'track_flow_test.sql')

console.log(failed ? `\n🛑 มี ${failed} ข้อไม่ผ่าน` : '\n✅ ผ่านทั้งหมด')
process.exit(failed ? 1 : 0)
