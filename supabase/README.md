# supabase/ — ฐานข้อมูลของ MedRelay

`supabase/migrations/` คือ **source of truth ของ schema** ไม่ใช่หน้าจอ Supabase Studio
ถ้าแก้ schema ผ่าน Studio โดยไม่เขียน migration ระบบจะ deploy ซ้ำไม่ได้

---

## ลำดับการรัน (ห้ามข้ามและห้ามสลับ)

รันทีละไฟล์ใน **Supabase Dashboard → SQL Editor** ตามลำดับนี้

| # | ไฟล์ | ได้อะไร |
|---|---|---|
| 1 | `migrations/0001_enums.sql` | enum ทั้ง 9 ตัว |
| 2 | `migrations/0002_unit.sql` | หน่วย |
| 3 | `migrations/0003_profile.sql` | ผู้ใช้ระบบ |
| 4 | `migrations/0004_vehicle.sql` | รถและชุดส่งกลับ |
| 5 | `migrations/0005_case.sql` | เคส |
| 6 | `migrations/0006_transfer_leg.sql` | ทอดการส่งกลับ + constraint เวลา |
| 7 | `migrations/0007_assessment.sql` | การประเมิน |
| 8 | `migrations/0008_event_log.sql` | audit trail |
| 9 | `migrations/0009_functions_triggers.sql` | auto timestamp + case_code |
| 10 | `migrations/0010_rls.sql` | RLS + policy ทุกตาราง |
| 11 | `migrations/0011_views.sql` | view สำหรับแดชบอร์ดและ export |
| 12 | `migrations/0012_form_enums.sql` | enum ที่ถอดจากแบบฟอร์มกระดาษ (ทบ.466-900 ถึง 904) |
| 13 | `migrations/0013_form_fields.sql` | คอลัมน์จากแบบฟอร์ม + trigger เวลา + แก้ policy `case_update` |
| 14 | `migrations/0014_treatment_property.sql` | ตาราง `treatment` และ `property_item` พร้อม RLS |
| 15 | `migrations/0015_evac_request.sql` | ตาราง `pickup_point` + function `create_evac_request()` — **ยังไม่ได้รันบนของจริง** |

จากนั้นใส่ข้อมูลจำลอง

| # | ไฟล์ | หมายเหตุ |
|---|---|---|
| 12 | `seed.sql` | หน่วย + รถ · รันได้ทันที ไม่ต้องมี auth user |
| 13 | `seed_profiles.sql` | **ต้องสร้าง auth user 4 บัญชีที่ Dashboard ก่อน** (อ่านหัวไฟล์) |
| 14 | `seed_demo_cases.sql` | เคสจำลอง 11 เคสสำหรับสาธิตแดชบอร์ด |

หรือถ้าใช้ Supabase CLI

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

---

## ตรวจก่อนไปต่อทุกครั้ง

**1. RLS เปิดครบทุกตาราง — ต้องไม่มีแถวไหนเป็น `false`**

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

**2. รันชุดทดสอบ 2 ไฟล์**

```
tests/rls_test.sql       → 11 ข้อ  ความปลอดภัย
tests/trigger_test.sql   → 14 ข้อ  auto timestamp (F6)
tests/form_test.sql      → 36 ข้อ  schema จากแบบฟอร์มกระดาษ (0012–0015)
```

ทั้งสามไฟล์อยู่ใน transaction ที่ปิดท้ายด้วย `rollback` จึงไม่ทิ้งอะไรไว้
ผลออกมาเป็นตารางท้ายไฟล์พร้อมบรรทัดสรุป ต้องเป็น `PASS` ทุกแถว **ถ้ามี `FAIL` ห้าม deploy**

`rls_test.sql`

| Test | พิสูจน์อะไร |
|---|---|
| T0 | เปิด RLS ครบทุกตาราง |
| T1–T3 | ผู้ใช้เห็นเฉพาะเคสที่ตนเกี่ยวข้อง มองข้ามหน่วยไม่ได้ |
| T4 | ผู้ใช้ยกระดับ `roles` ตัวเองเป็น admin ไม่ได้ |
| T5 | policy ไม่ได้ล็อกเกินจำเป็น (ยังแก้ข้อมูลตัวเองได้) |
| T6–T7 | `assessment` และ `event_log` ไม่มี policy UPDATE/DELETE — ใครก็ลบไม่ได้ |
| T8–T9 | constraint เวลาปฏิเสธลำดับเวลาที่เป็นไปไม่ได้ |
| T10 | ตารางเลขรัน `case_code` ไม่มี policy ให้ client แตะ |

`trigger_test.sql` — เดิน status ทีละขั้นเหมือนผู้ใช้กดปุ่มจริง

| Test | พิสูจน์อะไร |
|---|---|
| A1–A3 | `case_code` เติมเองในรูปแบบ `MR-2569-0001` และเลขรันไม่ซ้ำ |
| B1–B3 | timestamp ครบทั้ง 5 ขั้นโดยไม่มีใครกรอกเวลา และเรียงจากน้อยไปมาก |
| C1–C4 | เคสปิดเองเมื่อทอดสุดท้ายจบ · กลับมา active เมื่อมีทอดถัดไป · ปิดอีกครั้ง |
| D1–D2 | `event_log` บันทึกครบทุกการเปลี่ยนสถานะและการเปิดเคส |
| E1 | ข้าม `pending → completed` ไม่ได้ |
| F1 | ทุกทอดถูกยกเลิก เคสเป็น `cancelled` ไม่ใช่ `completed` |

> **ทำไมต้องมี `trigger_test.sql` แยก** — `seed_demo_cases.sql` ใส่ timestamp ลงไปตรงๆ
> เพื่อให้แดชบอร์ดมีตัวเลขให้ดูตอนสาธิต จึงข้าม trigger ไปทั้งหมด
> ข้อมูลใน seed ไม่ได้พิสูจน์ว่า F6 ทำงาน — ไฟล์นี้ต่างหากที่พิสูจน์

---

## รันทดสอบในเครื่องก่อนแตะ Supabase (แนะนำ)

`tests/local/run.mjs` รัน migration + seed + test ทั้งหมดบน **PGlite**
(PostgreSQL ที่คอมไพล์เป็น WASM รันในโปรเซส Node) — ไม่ต้องมี Docker ไม่ต้องมี Postgres

```bash
npm install --save-dev @electric-sql/pglite
node supabase/tests/local/run.mjs
```

ใช้จับ syntax error และ logic error ก่อนไปนั่งวางทีละไฟล์ใน SQL Editor
`tests/local/shim.sql` จำลอง `auth` schema, `auth.uid()` และ role `anon`/`authenticated`
ที่ Supabase มีให้อยู่แล้ว — **ห้ามรัน `shim.sql` บน Supabase จริงเด็ดขาด** จะทำให้ auth พัง

⚠️ ไม่ใช่ของแทน Supabase — ยังต้องรัน `rls_test.sql` บนโปรเจกต์จริงอีกรอบก่อน deploy เสมอ

---

## จุดที่เขียนต่างจาก DATABASE.md โดยเจตนา

เอกสาร `DATABASE.md` เป็น spec ที่เขียนก่อนลงมือ migration เหล่านี้แก้จุดที่ spec พลาดไว้ 4 จุด

| จุด | ปัญหาใน spec | สิ่งที่ทำแทน |
|---|---|---|
| `leg_time_order` (§3.5) | `handover_at >= arrived_at` ให้ผล `NULL` เมื่อ `arrived_at` เป็น null และ CHECK ถือว่า NULL คือผ่าน → ใส่เวลาส่งมอบทั้งที่ยังไม่เคยไปถึงได้ ซึ่งขัดกับ acceptance test ของ Prompt 03 เอง | บังคับเพิ่มว่าขั้นถัดไปตั้งได้ต่อเมื่อขั้นก่อนหน้าถูกตั้งแล้ว · **ผลข้างเคียงที่ตั้งใจ: UI ต้องเดิน status ตามลำดับ ข้าม pending → completed ไม่ได้** |
| `close_case_when_last_leg_done` (§4) | ไม่ได้เป็น `security definer` — transporter ที่กดส่งมอบไม่มีสิทธิ์ `update` ตาราง `case` ตาม RLS ของ §5.2 ทำให้ trigger ล้มทั้ง transaction | เปลี่ยนเป็น `sync_case_status` แบบ `security definer` และเพิ่มการเลื่อน `requested → active` |
| เคสที่ต้องส่งทอดถัดไป | เคสถูกปิดตั้งแต่ทอดแรกจบ พอผู้รับสร้างทอดที่ 2 เคสยังคงสถานะ `completed` | เพิ่ม trigger `reopen_case_on_new_leg` |
| `case_code` | §3.4 ประกาศ `not null` แต่ไม่มีกลไกสร้างเลข | เพิ่ม `next_case_code()` + ตารางนับที่ล็อกแถวเอง กันเลขชนเมื่อเปิดเคสพร้อมกัน |

## สถานะการทดสอบ

| สภาพแวดล้อม | ผล |
|---|---|
| **PGlite (PostgreSQL 18.3) ในเครื่อง** | ✅ migration 15 · seed 4 · test 61/61 PASS |
| **Supabase จริง (PostgreSQL 17)** | ✅ migration 14 · seed 3 · 53/53 PASS — **ยังไม่ได้รัน `0015`** |

⚠️ **`0015_evac_request.sql` และ `seed_pickup_points.sql` ยังอยู่แค่ในเครื่อง**
ต้องเอาขึ้น Supabase จริงก่อนเริ่มเขียนหน้า `/sender` (ดู [HANDOFF.md §3](../HANDOFF.md))
หลังรันแล้ว `form_test.sql` ต้องได้ 36/36 และต้อง generate type ใหม่

ตรวจบน Supabase จริงแล้วว่า (ณ migration 0011)
ตาราง 8 · เปิด RLS ครบทุกตาราง · policy 18 · enum 9 · view 3 ตั้ง `security_invoker=on` ครบ
· trigger 7 ตัวชื่อตรงตาม migration · helper function ทั้ง 4 ตัวเป็น `SECURITY DEFINER`

`0012`–`0014` รันบนโปรเจกต์จริงแล้วเมื่อ 6 ก.ย. 2569 ตัวเลขที่ควรได้คือ
ตาราง 10 · policy 25 · enum 19 · trigger 8 · function 13 · คอลัมน์ 144

`form_test.sql` ตรวจตัวเลขเหล่านี้ให้เองในข้อ S1–S8 — วางทั้งไฟล์ใน SQL Editor แล้วต้องได้ PASS ครบ 28 ข้อ
**ยืนยันบน Supabase จริงแล้วเมื่อ 6 ก.ย. 2569 — 28/28 PASS**

ข้อ **S5 และ S6** สำคัญที่สุด เพราะตรวจสิทธิ์ระดับคอลัมน์ของ `treatment`
ซึ่ง PGlite พิสูจน์แทน Supabase จริงไม่ได้ (Supabase มี default privileges ของตัวเอง)
ผลที่ได้คือ `revoke update ... from authenticated` + `grant update (tourniquet_off, released_by)`
ทำงานบน Supabase เหมือนกับใน PGlite ทุกประการ

---

## สิ่งที่ Supabase มีเพิ่มมาเอง — `rls_auto_enable`

โปรเจกต์ Supabase มี event trigger ชื่อ `public.rls_auto_enable` ติดมาให้
มันเปิด RLS ให้ **ทุกตารางที่ถูกสร้างใหม่ใน schema `public`** โดยอัตโนมัติ

ตรวจโค้ดแล้วปลอดภัย — คำสั่งเดียวที่มันรันคือ `enable row level security`
เพิ่มการป้องกันอย่างเดียว ไม่มีคำสั่งที่ลดสิทธิ์ และตั้ง `search_path` เป็น `pg_catalog` กัน hijack
เป็นตาข่ายชั้นที่สองที่ตรงกับกฎ "ทุกตารางใหม่ต้องมี RLS" ของโครงการพอดี **ปล่อยไว้**

**ผลข้างเคียงที่ต้องรู้** — ตารางชั่วคราวที่ไฟล์ทดสอบสร้างขึ้นเพื่อพักผลลัพธ์
จะถูกเปิด RLS ไปด้วย และตารางที่เปิด RLS โดยไม่มี policy คือตารางที่ปฏิเสธทุกคน
`rls_test.sql` และ `trigger_test.sql` จึงมี `alter table ... disable row level security`
กำกับไว้หลังสร้างตารางพักผล — **ห้ามลบบรรทัดนั้นออก** มิฉะนั้นไฟล์ทดสอบจะล้มทั้งไฟล์

PGlite ไม่มี event trigger ตัวนี้ จึงจับปัญหานี้ไม่ได้ — เป็นตัวอย่างรูปธรรมว่าทำไม
ต้องรันชุดทดสอบบน Supabase จริงอีกรอบเสมอ ไม่ใช่เชื่อผลจากในเครื่องอย่างเดียว

---

## ⚠ ข้อห้ามของโฟลเดอร์นี้

- ข้อมูลใน `seed*.sql` ต้องเป็นข้อมูลสมมติทั้งหมด `is_synthetic = true` เสมอ
- ห้าม commit ไฟล์ seed ที่มาจากข้อมูลจริงแม้จะถอดตัวระบุแล้ว — ตั้งชื่อ `seed-real-*.sql` ซึ่ง `.gitignore` กันไว้แล้ว
- ทุกครั้งที่เพิ่มตารางใหม่ **ต้องเขียน RLS policy ในคอมมิตเดียวกัน** ตารางที่ลืมเปิด RLS คือตารางที่ใครก็อ่านได้ด้วย anon key
- **ห้ามใช้ `INSERT ... RETURNING` กับตารางที่ policy SELECT เรียก `can_see_case()`**
  จะได้ error `new row violates row-level security policy` ที่ชี้ผิดที่โดยสิ้นเชิง
  เหตุผลเต็มอยู่ใน [HANDOFF.md §5 ข้อ 10](../HANDOFF.md) — กระทบ `.insert().select()` ของ supabase-js ด้วย
- **`Report/` ห้าม commit** — เป็นเอกสารต้นฉบับที่มีรายงานกำลังพลบาดเจ็บของจริง
  ใส่ไว้ใน `.gitignore` แล้ว แต่ควรย้ายออกไปเก็บนอก repo (ดู [HANDOFF.md §7](../HANDOFF.md))
  แบบฟอร์มเปล่า (PDF ทบ.466-*) ไม่มีข้อมูลบุคคล แต่ถูก ignore ไปพร้อมทั้งโฟลเดอร์
