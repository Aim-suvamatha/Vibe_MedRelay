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
```

ทั้งสองไฟล์อยู่ใน transaction ที่ปิดท้ายด้วย `rollback` จึงไม่ทิ้งอะไรไว้
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

migration ทั้ง 11 ไฟล์ · seed ทั้ง 3 ไฟล์ · test ทั้ง 25 ข้อ
รันผ่านแล้วบน **PostgreSQL 18.3** (PGlite) ด้วย `tests/local/run.mjs`

**ยังไม่ได้รันบน Supabase จริง** — ต้องรันซ้ำที่นั่นก่อน deploy เสมอ

---

## ⚠ ข้อห้ามของโฟลเดอร์นี้

- ข้อมูลใน `seed*.sql` ต้องเป็นข้อมูลสมมติทั้งหมด `is_synthetic = true` เสมอ
- ห้าม commit ไฟล์ seed ที่มาจากข้อมูลจริงแม้จะถอดตัวระบุแล้ว — ตั้งชื่อ `seed-real-*.sql` ซึ่ง `.gitignore` กันไว้แล้ว
- ทุกครั้งที่เพิ่มตารางใหม่ **ต้องเขียน RLS policy ในคอมมิตเดียวกัน** ตารางที่ลืมเปิด RLS คือตารางที่ใครก็อ่านได้ด้วย anon key
