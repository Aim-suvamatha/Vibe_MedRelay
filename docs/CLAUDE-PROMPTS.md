# CLAUDE-PROMPTS.md — Prompt 10 ชุดสำหรับสร้าง MedRelay

Prompt ชุดนี้ออกแบบให้ผู้เรียนสร้าง MedRelay ได้ตั้งแต่ศูนย์จนถึง deploy โดย**เรียงลำดับตามการพึ่งพากัน — ห้ามข้ามขั้น** เพราะ prompt แต่ละชุดสมมติว่าชุดก่อนหน้าทำเสร็จแล้ว

## วิธีใช้

1. เปิด Claude แล้ววาง **Context Block** ด้านล่างเป็นข้อความแรกของบทสนทนา
2. วาง Prompt ทีละชุด ตั้งแต่ 01 ถึง 10
3. หลังได้โค้ดมาแล้ว **อ่านก่อน commit** โดยเฉพาะไฟล์ที่แตะ auth, RLS หรือ query ที่มีข้อมูลผู้ป่วย
4. ทุกครั้งที่ AI สร้างตารางใหม่ **ต้องถามต่อทันทีว่า RLS policy ของตารางนี้คืออะไร**

## กฎที่ห้ามละเมิดขณะใช้ prompt เหล่านี้

- ❌ ห้ามวางข้อมูลผู้ป่วยจริงลงในช่องแชท
- ❌ ห้ามวาง API key หรือ connection string จริงลงในช่องแชท — ใช้ค่าสมมติจาก `.env.example`
- ❌ ห้ามคัดลอกโค้ดเข้าโปรเจกต์โดยไม่อ่าน
- ✅ ให้ AI เห็น schema ได้เต็มที่ — schema ไม่ใช่ข้อมูล

---

## Context Block — วางเป็นข้อความแรกเสมอ

```
คุณเป็น senior full-stack engineer ที่ช่วยแพทย์ทหารสร้างระบบ MedRelay

บริบทโครงการ:
- MedRelay = ระบบส่งกลับสายแพทย์ (Medical Evacuation Relay System)
- ปัญหา: การส่งกลับผู้ป่วยเดินเป็นทอด (2-4 ทอด) แต่ข้อมูลประเมินแรกรับตกหล่นทุกรอยต่อ
  เพราะส่งมอบด้วยวิทยุ กระดาษ และ LINE
- หลักการออกแบบ: ไม่เพิ่มภาระการบันทึก แต่ย้ายการบันทึกที่ทำอยู่แล้วมาไว้ที่เดียวกัน
- ผู้ใช้ 4 บทบาท: Sender (เสนารักษ์ต้นทาง) / Transporter (ผู้ขนส่ง) /
  Receiver (แพทย์ปลายทาง) / Monitor (ศูนย์สั่งการ)
  หนึ่งคนถือได้หลายบทบาท

Tech stack ที่ล็อกไว้แล้ว (ห้ามเสนอเปลี่ยน):
- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (PostgreSQL + Auth + RLS + Storage)
- Deploy บน Vercel

ข้อจำกัดที่ห้ามละเมิด:
1. ห้ามมีข้อมูลผู้ป่วยจริงในระบบ ใช้ case_code และ patient_alias เท่านั้น
2. ไม่เก็บเลขบัตรประชาชน 13 หลัก
3. ทุก timestamp ต้องเกิดจากการกดปุ่มที่ผู้ใช้ต้องกดอยู่แล้ว ห้ามมีช่องกรอกเวลาด้วยมือ
4. ทุกตารางต้องเปิด RLS และมี policy
5. service_role key และ LLM API key ใช้ฝั่ง server เท่านั้น ห้ามขึ้นต้นด้วย NEXT_PUBLIC_
6. AI ในแอปห้ามวินิจฉัย ห้ามแนะนำ triage ห้ามแนะนำการรักษา

ผู้ใช้ปลายทางคือนายสิบพยาบาลอายุ 37 ใช้สมาร์ทโฟนเป็นหลัก ต้องการระบบที่ใช้ง่าย ไม่ซับซ้อน
บางครั้งใช้งานขณะสวมถุงมือ → UI ต้อง mobile-first ปุ่มใหญ่ ฟิลด์น้อย กรอกได้ด้วยมือเดียว

ตอบเป็นภาษาไทย ใช้ศัพท์เทคนิคอังกฤษได้ตามบริบท
อธิบายเหตุผลของการตัดสินใจสั้นๆ ก่อนให้โค้ด และถ้ามีทางเลือกที่ดีกว่าให้แย้งได้ตรงๆ
```

---

## Prompt 01 — Scaffold โครงการ

**เป้าหมาย:** ได้โครงการ Next.js ที่รันได้ พร้อมโครงสร้างโฟลเดอร์ตามเอกสาร

```
สร้างคำสั่งและไฟล์เริ่มต้นของโครงการ MedRelay

1. คำสั่ง create-next-app พร้อม flag ที่เหมาะสม (TypeScript, Tailwind, App Router, src directory)
2. คำสั่งติดตั้ง shadcn/ui และ component ที่จะใช้แน่ๆ:
   button, input, select, textarea, card, badge, table, dialog, form, sonner, tabs
3. คำสั่งติดตั้ง dependency: @supabase/supabase-js, @supabase/ssr, zod, date-fns
4. ไฟล์ src/lib/supabase/client.ts (browser client ใช้ anon key)
5. ไฟล์ src/lib/supabase/server.ts (server client อ่าน session จาก cookie)
6. ไฟล์ src/lib/supabase/admin.ts (service_role) พร้อม comment เตือนว่าห้าม import
   จาก client component และใส่ guard ที่ throw ถ้าถูกเรียกฝั่ง browser

อธิบายด้วยว่าทำไมต้องแยก client เป็น 3 ไฟล์ และไฟล์ไหนใช้ที่ไหน
```

**เช็คก่อนไปต่อ:** `npm run dev` ขึ้นหน้าแรกได้ · `admin.ts` มี guard ป้องกันการเรียกฝั่ง browser

---

## Prompt 02 — Design system และ Layout

**เป้าหมาย:** ได้ layout mobile-first และ component พื้นฐานที่ใช้ซ้ำได้ทุกหน้า

```
สร้าง design system และ layout ของ MedRelay

1. app layout ที่เป็น mobile-first มี bottom navigation 4 tab
   ตามบทบาท: ขอส่งกลับ / ศูนย์สั่งการ / รับผู้ป่วย / แดชบอร์ด
   ซ่อน tab ที่ผู้ใช้ไม่มีบทบาทนั้น
2. component PrecedenceBadge แสดง urgent / priority / routine
   ด้วยสีที่แยกกันชัดในที่แสงจ้า
3. component TriageDot แสดง black / red / yellow / green
   ต้องไม่พึ่งสีอย่างเดียว ให้มีตัวอักษรกำกับด้วย เพราะมีผู้ใช้ที่ตาบอดสี
4. component RelativeTime แสดงเวลาแบบ "3 นาทีที่แล้ว"
   พร้อม title เป็นเวลาเต็ม และ auto-refresh ทุก 30 วินาที
5. ตั้ง font ภาษาไทยที่อ่านง่ายบนมือถือ

ข้อกำหนด UI:
- ปุ่มหลักสูงอย่างน้อย 48px กดได้ด้วยนิ้วโป้งขณะสวมถุงมือ
- contrast ต้องผ่าน WCAG AA เพราะใช้กลางแดด
- ห้ามใช้ hover เป็นทางเดียวในการเข้าถึงฟังก์ชัน เพราะเป็น touch device
```

**เช็คก่อนไปต่อ:** ย่อหน้าจอเหลือ 375px แล้วยังใช้งานได้ · TriageDot อ่านออกแม้เป็นภาพขาวดำ

---

## Prompt 03 — Database Schema

**เป้าหมาย:** ได้ SQL migration ที่รันบน Supabase ได้จริง

```
สร้าง SQL migration ทั้งหมดของ MedRelay ตาม spec นี้

Enum:
- precedence_level: urgent, priority, routine
- triage_color: black, red, yellow, green
- role_of_care: role_1..role_4
- case_status: requested, active, completed, cancelled
- leg_status: pending, dispatched, on_scene, in_transit, arrived, completed, cancelled
- app_role: sender, transporter, receiver, monitor, commander, admin
- vehicle_type: bls, als, utility, rotary, fixed_wing
- vehicle_status: available, dispatched, busy, maintenance, offline
- assessment_kind: initial, enroute, handover

ตาราง:
1. unit (หน่วย) — code, name_th, role_level, parent_id self-reference
2. profile — ต่อจาก auth.users, service_number 10 หลัก, unit_id, roles เป็น app_role[]
3. vehicle — call_sign, type, unit_id, status
4. case — case_code, patient_alias, precedence, triage, chief_complaint,
   symptom_onset_at, status, created_by, requested_at, is_synthetic default true
5. transfer_leg — case_id, leg_no, from_unit_id, to_unit_id, role_level, vehicle_id,
   transporter_id, receiver_id, evac_director (text), status
   และ timestamp 6 ตัว: requested_at, dispatched_at, on_scene_at, departed_at,
   arrived_at, handover_at
6. assessment — case_id, leg_id (nullable), kind, gcs, sbp, dbp, pulse, resp_rate,
   spo2, temperature, triage, findings, treatment, assessed_by, assessed_at
7. event_log — case_id, leg_id, actor_id, action, from_value, to_value, payload jsonb

ข้อกำหนดสำคัญ:
- transfer_leg ต้องมี check constraint บังคับลำดับเวลา
  (dispatched >= requested >= ..., handover >= arrived) เพื่อให้ response time ติดลบไม่ได้
- transfer_leg unique (case_id, leg_no)
- assessment ผูกกับ case_id เสมอ ผูกกับ leg_id เมื่อเกิดในทอดนั้น
  เพราะผลประเมินแรกรับต้องเปิดดูได้จากทุกทอดถัดไปโดยไม่ต้องคัดลอกข้อมูล
- ใส่ index ที่จำเป็นต่อ query ของหน้าศูนย์สั่งการและแดชบอร์ด
- เรียง migration ตามลำดับ dependency ของ foreign key

อธิบายด้วยว่าทำไม case กับ transfer_leg ต้องแยกตาราง และถ้ารวมเป็นตารางเดียวจะพังตรงไหน
```

**เช็คก่อนไปต่อ:** รันบน SQL Editor ผ่านทุกไฟล์ · ลองใส่ `handover_at` ก่อน `arrived_at` แล้ว database ต้องปฏิเสธ

---

## Prompt 04 — Triggers และ Auto Timestamp

**เป้าหมาย:** เวลาเกิดขึ้นเองจากการกดปุ่ม ไม่มีช่องกรอกเวลา

```
สร้าง PostgreSQL function และ trigger สำหรับ MedRelay

1. set_leg_timestamps — BEFORE UPDATE on transfer_leg
   เมื่อ status เปลี่ยน ให้ตั้ง timestamp ที่ตรงกับ status นั้นเป็น now()
   ใช้ coalesce เพื่อไม่ทับค่าเดิมถ้ามีอยู่แล้ว
   dispatched -> dispatched_at, on_scene -> on_scene_at, in_transit -> departed_at,
   arrived -> arrived_at, completed -> handover_at

2. close_case_when_last_leg_done — AFTER UPDATE on transfer_leg
   เมื่อทอดใดเป็น completed และไม่เหลือทอดอื่นที่ยังไม่จบ
   ให้ปิด case: status = completed, closed_at = now()

3. log_leg_status — AFTER UPDATE on transfer_leg
   เขียน event_log ทุกครั้งที่ status เปลี่ยน พร้อม auth.uid() เป็น actor

4. auto-generate case_code รูปแบบ MR-2569-0001 โดยเลขรันตามปี พ.ศ.
   ต้องกันการชนกันเมื่อมีการสร้างพร้อมกันหลาย request

อธิบายว่าทำไมต้องใช้ trigger แทนการให้ frontend ส่งเวลามา
และถ้าให้ frontend ส่งเวลามาจะเกิดปัญหาอะไรกับตัวเลข response time บนแดชบอร์ด
```

**เช็คก่อนไปต่อ:** อัปเดต status ผ่าน SQL Editor แล้ว timestamp ขึ้นเอง · `event_log` มีแถวเพิ่ม

---

## Prompt 05 — Row Level Security

**เป้าหมาย:** สิทธิ์ถูกบังคับที่ชั้น database ไม่ใช่ชั้น UI

```
สร้าง RLS policy ทั้งหมดของ MedRelay

Helper function (security definer, set search_path = public):
- current_unit_id() — คืน unit_id ของผู้ใช้ปัจจุบัน
- has_role(r app_role) — ผู้ใช้ปัจจุบันมีบทบาทนี้หรือไม่ (roles เป็น array)
- can_see_case(c_id uuid) — true ถ้าผู้ใช้เป็นผู้สร้างเคส
  หรือหน่วยของผู้ใช้เป็นต้นทาง/ปลายทางของทอดใดทอดหนึ่ง
  หรือผู้ใช้เป็น transporter/receiver ของทอดใดทอดหนึ่ง
  หรือมีบทบาท monitor/commander/admin

Policy ที่ต้องได้:
- เปิด RLS ทุกตารางโดยไม่มีข้อยกเว้น
- unit: authenticated อ่านได้ทั้งหมด แก้ได้เฉพาะ admin
- profile: เห็นตัวเองและคนในหน่วยเดียวกัน แก้ได้เฉพาะของตัวเอง
  และต้องเปลี่ยน roles ของตัวเองไม่ได้
- vehicle: เห็นรถของหน่วยตัวเอง แก้สถานะได้เฉพาะ monitor/admin
- case: select ใช้ can_see_case
  insert ต้องมี role sender + created_by = auth.uid()
  + origin_unit_id = current_unit_id() + is_synthetic = true
- transfer_leg: select ใช้ can_see_case
  update ได้เฉพาะ transporter/receiver ของทอดนั้น หรือหน่วยปลายทาง หรือ monitor/admin
- assessment: select ใช้ can_see_case, insert ต้อง assessed_by = auth.uid()
  ห้ามมี policy สำหรับ UPDATE และ DELETE
- event_log: select ตามเคสที่เห็น, insert ได้ ห้ามมี UPDATE/DELETE

จากนั้นเขียน SQL ทดสอบ RLS ที่พิสูจน์ว่า:
- ผู้ใช้หน่วย A มองไม่เห็นเคสของหน่วย B ที่ไม่เกี่ยวข้องกัน
- sender เปลี่ยน roles ตัวเองเป็น admin ไม่ได้
- ไม่มีใครลบ assessment ได้ แม้แต่ admin

อธิบายว่าทำไม policy ที่เขียนแบบ "using (true)" ถึงอันตราย
```

**เช็คก่อนไปต่อ:** รัน `select tablename, rowsecurity from pg_tables where schemaname='public'` แล้วต้องไม่มี `false` · ทดสอบข้ามหน่วยแล้วเห็นข้อมูลไม่ได้จริง

---

## Prompt 06 — Authentication และ Profile

**เป้าหมาย:** เข้าสู่ระบบด้วยเลขทหาร 10 หลัก + ยืนยันด้วยเบอร์โทร

```
สร้างระบบ authentication ของ MedRelay

1. หน้า login ที่กรอกเลขประจำตัวทหาร 10 หลัก แล้วส่ง OTP ไปยังเบอร์โทรที่ผูกไว้
   ใช้ Supabase Auth phone OTP
   validate เลข 10 หลักด้วย zod ก่อนส่ง request
2. Server Action ที่ map service_number -> phone โดยไม่เปิดเผยเบอร์กลับไปที่ browser
   และต้อง rate limit ป้องกันการ enumerate เลขทหาร
3. middleware.ts ที่ refresh session และ redirect ผู้ที่ยังไม่ login
4. useProfile hook ที่คืน profile พร้อม roles ของผู้ใช้ปัจจุบัน
5. component RoleGate ที่ซ่อน UI ตามบทบาท
   พร้อม comment เตือนชัดเจนว่านี่เป็นเรื่อง UX เท่านั้น
   security จริงอยู่ที่ RLS ไม่ใช่ที่ component นี้

ข้อกำหนด:
- ไม่เก็บและไม่รับเลขบัตรประชาชน 13 หลักในทุกจุดของ flow
- ข้อความ error ต้องไม่บอกว่า "ไม่พบเลขทหารนี้" เพราะจะทำให้ enumerate ได้
  ให้ใช้ข้อความกลางๆ เหมือนกันทุกกรณี
```

**เช็คก่อนไปต่อ:** login สำเร็จได้ · กรอกเลขที่ไม่มีในระบบแล้วข้อความ error เหมือนกรณีปกติ

---

## Prompt 07 — F1 หน้าขอส่งกลับ (Sender)

**เป้าหมาย:** เสนารักษ์เปิดเคสและร้องขอส่งกลับได้ในหน้าจอเดียว

```
สร้างหน้า /sender — หน้าขอส่งกลับ

ฟิลด์ออกแบบตามโครง 9-line MEDEVAC request:
1. จุดรับผู้ป่วย — เลือกจากรายการจุดรับที่กำหนดไว้ล่วงหน้า ไม่ใช้ GPS
2. จำนวนผู้ป่วย (1-50)
3. ระดับความเร่งด่วน (precedence) — urgent / priority / routine
   เป็นปุ่มใหญ่ 3 ปุ่ม ไม่ใช่ dropdown เพราะต้องกดเร็ว
4. อาการสำคัญ (chief_complaint)
5. กลไกการบาดเจ็บ / เหตุการณ์ (mechanism)
6. เวลาที่เริ่มมีอาการ (symptom_onset_at) — เลือกได้ เพราะเป็นข้อมูลอดีตที่ผู้ใช้ทราบ
7. หน่วยปลายทาง (to_unit_id)
8. ประเมินแรกรับ: GCS, ความดัน, ชีพจร, อัตราหายใจ, SpO2, triage color
   ทุกช่องเป็น optional เพราะหน้างานอาจวัดไม่ครบ

พฤติกรรมที่ต้องได้:
- กด "ส่งคำขอ" ครั้งเดียว สร้าง case + transfer_leg แรก + assessment (kind='initial')
  ใน transaction เดียว ถ้าพลาดต้อง rollback ทั้งหมด
- requested_at ตั้งโดย database ไม่ใช่ฝั่ง client
- validate ด้วย zod ทั้งฝั่ง client และ server
- หลังส่งสำเร็จ redirect ไปหน้าติดตามสถานะของเคสนั้น
- แสดงสถานะ "กำลังส่ง" และกันการกดซ้ำ

UI: mobile-first ปุ่มใหญ่ ฟิลด์เรียงตามลำดับที่ผู้ใช้คิดจริง
คือ ผู้ป่วยเป็นอย่างไร -> เร่งด่วนแค่ไหน -> ส่งไปไหน
```

**เช็คก่อนไปต่อ:** ส่งคำขอแล้วได้ 3 แถวใน 3 ตาราง · ปิดเน็ตกลางคันแล้วไม่เหลือข้อมูลค้างครึ่งๆ

---

## Prompt 08 — F2 หน้าศูนย์สั่งการ + F3 หน้าติดตามสถานะ

**เป้าหมาย:** ศูนย์สั่งการเห็นคิวและจัดรถได้ · ทุกคนติดตามเวลาได้

```
สร้าง 2 หน้า

หน้า /dispatch — ศูนย์สั่งการ
- คิวคำขอเรียงตาม precedence แล้วตาม requested_at
  urgent ขึ้นบนสุดเสมอและต้องเห็นได้ชัดจากระยะไกล
- แต่ละแถวแสดง: case_code, precedence, triage, อาการสำคัญ, ต้นทาง, ปลายทาง,
  เวลาที่รออยู่ (นับขึ้นเรื่อยๆ)
- กระดานสถานะรถ: available / dispatched / busy / maintenance
- action: จัดรถให้ทอด แล้ว transfer_leg.status เปลี่ยนเป็น dispatched
- ใช้ Supabase Realtime subscribe ให้คำขอใหม่ขึ้นเองโดยไม่ต้อง refresh
- ถ้า realtime หลุด ต้อง fallback เป็น polling และแจ้งผู้ใช้ว่ากำลัง reconnect

หน้า /track/[caseId] — ติดตามสถานะ
- timeline แนวตั้งของทุกทอด แต่ละทอดแสดง 6 timestamp พร้อมระยะเวลาระหว่างขั้น
- ทอดที่ยังไม่เกิดแสดงเป็นสีจาง
- ปุ่มเปลี่ยนสถานะสำหรับ transporter ของทอดนั้น:
  ถึงจุดรับ / ออกเดินทาง / ถึงปลายทาง / ส่งมอบแล้ว
  ปุ่มต้องแสดงเฉพาะสถานะถัดไปที่เป็นไปได้เท่านั้น
- แสดง assessment ทั้งหมดของเคสเรียงตามเวลา
  ทุกค่าต้องมี timestamp กำกับ และระบุว่าเป็น "ผลประเมินจากทอดก่อนหน้า"
  ไม่ใช่สภาพปัจจุบันของผู้ป่วย
- ปุ่ม "ส่งทอดถัดไป" สร้าง transfer_leg ใหม่ leg_no +1 ภายใต้ case เดิม
  โดยไม่ต้องกรอกข้อมูลเคสซ้ำ

ห้ามมีช่องกรอกเวลาด้วยมือในทั้งสองหน้า
```

**เช็คก่อนไปต่อ:** เปิด 2 browser แล้วสร้างคำขอ เห็นขึ้นอีกจอภายในไม่กี่วินาที · ปุ่มเปลี่ยนสถานะข้ามขั้นไม่ได้

---

## Prompt 09 — F4 แดชบอร์ด + F7 Export

**เป้าหมาย:** ตัวเลขที่วัดผลได้ โดยไม่เพิ่มงานกรอกให้ใคร

```
สร้างหน้า /dashboard และฟังก์ชัน export

1. PostgreSQL view:
   - v_leg_metrics: request_to_dispatch, dispatch_to_scene, scene_to_handover, leg_total
     คำนวณจาก timestamp ที่มีอยู่แล้ว เฉพาะทอดที่ status = completed
   - v_case_metrics: leg_count, total_evacuation_time ต่อเคส
   ตั้ง security_invoker = on เพื่อให้ view สืบทอด RLS ของตารางต้นทาง

2. หน้าแดชบอร์ด:
   - การ์ดตัวเลข: จำนวนเคสวันนี้, เคสที่ยังไม่จบ,
     ค่ามัธยฐานของ request-to-dispatch, ค่ามัธยฐานของ total evacuation time
   - ใช้ median ไม่ใช่ mean เพราะข้อมูลเวลาตอบสนองมี outlier เสมอ
     และอธิบายเหตุผลนี้ใน comment
   - กราฟแท่ง: การกระจายตาม precedence
   - กราฟแท่ง: การกระจายตาม triage color
   - ตัวกรองช่วงวันที่และหน่วย
   - ถ้ายังไม่มีข้อมูลพอ ต้องแสดง empty state ที่บอกตรงๆ ว่ายังไม่มีข้อมูล
     ห้ามแสดงเลข 0 ที่ทำให้เข้าใจผิดว่าวัดแล้วได้ 0

3. Export CSV ตามคอลัมน์รายงานสรุปกำลังพลบาดเจ็บที่หน่วยใช้จริง:
   สย.1-3 / ชื่อ-สกุล / สังกัด / เหตุการณ์ / ประเภทยุทธการ / อาการ /
   สถานพยาบาลแรกรับ / สถานส่งต่อ / ระดับการบาดเจ็บ
   - ทำเป็น Route Handler ฝั่ง server
   - ต้องผ่าน RLS คือ export ได้เฉพาะเคสที่ผู้ใช้คนนั้นมีสิทธิ์เห็น
   - encoding UTF-8 with BOM เพื่อให้ Excel ภาษาไทยไม่เพี้ยน
```

**เช็คก่อนไปต่อ:** ไม่มีค่า negative ในคอลัมน์เวลา · export แล้วเปิดใน Excel ภาษาไทยอ่านออก · ผู้ใช้ต่างหน่วย export ได้ข้อมูลต่างกัน

---

## Prompt 10 — Seed, Test และ Deploy

**เป้าหมาย:** ระบบขึ้น Live URL พร้อมข้อมูลจำลองสำหรับ demo

```
เตรียม MedRelay ให้พร้อม demo และ deploy

1. supabase/seed.sql ข้อมูลจำลองสำหรับ demo:
   - 4 หน่วย ครอบคลุม role_1 ถึง role_3
   - 6 profile ชื่อสมมติ (เช่น จ.ส.อ. สมชาย ใจกล้า) service_number ขึ้นต้น 99
     กระจายบทบาทให้ครบทั้ง 4 บทบาท และมีอย่างน้อย 1 คนที่ถือ 2 บทบาท
   - 4 vehicle สถานะต่างกัน
   - 12 เคสย้อนหลัง 14 วัน กระจาย precedence และ triage
     มีทั้งเคส 1 ทอด 2 ทอด และ 3 ทอด
     timestamp สมจริงพอที่แดชบอร์ดจะมีตัวเลขให้ดู
   - 1 เคสที่ยังไม่จบ ค้างที่สถานะ dispatched สำหรับ demo สด
   ทุกแถวต้อง is_synthetic = true และห้ามมีชื่อจริงของบุคคลใด

2. สคริปต์ตรวจก่อน commit ที่ grep หา secret pattern
   (eyJ..., sk-..., postgres://, service_role) ใน staged diff

3. ขั้นตอน deploy ขึ้น Vercel:
   - environment variable ที่ต้องตั้ง และอันไหนห้ามขึ้นต้นด้วย NEXT_PUBLIC_
   - การตั้ง Supabase redirect URL ให้ตรงกับ production domain
   - checklist ก่อน deploy ครั้งแรก

4. README ส่วน "รันระบบใน 5 นาที" สำหรับกรรมการที่จะลองเอง

ปิดท้ายด้วยรายการสิ่งที่ควรตรวจซ้ำก่อนส่งงาน โดยเรียงตามความเสี่ยงจากมากไปน้อย
```

**เช็คก่อนไปต่อ:** Live URL เปิดได้จากมือถือนอกเครือข่ายหน่วย · แดชบอร์ดมีตัวเลขให้ดู · ไม่มี secret ใน repo

---

## Prompt เสริม — ใช้เมื่อจำเป็น

### E1 — Debug

```
โค้ดนี้ error ตามข้อความด้านล่าง

[วาง error message เต็ม]
[วางโค้ดส่วนที่เกี่ยวข้อง]

อย่าเพิ่งแก้ ให้อธิบายก่อนว่า error นี้เกิดจากอะไร แล้วเสนอทางแก้ 2 ทาง
พร้อมบอกว่าแต่ละทางมีข้อเสียอะไร แล้วค่อยให้โค้ด
```

### E2 — Security review

```
review โค้ดนี้เฉพาะด้าน security ตาม AI_RULES.md ของโครงการ

ตรวจ 6 ข้อ:
1. มี service_role key รั่วไปฝั่ง client หรือไม่
2. มี query ที่ข้าม RLS หรือไม่
3. validate input ฝั่ง server ครบหรือไม่
4. error message เปิดเผยข้อมูลที่ไม่ควรเปิดเผยหรือไม่
5. มีข้อมูลที่ระบุตัวตนหลุดเข้า log หรือไม่
6. มีตารางใหม่ที่ยังไม่เปิด RLS หรือไม่

ตอบเป็นรายการ พร้อมระดับความรุนแรงและวิธีแก้ที่เจาะจงบรรทัด
```

### E3 — ตัดฟีเจอร์เมื่อเวลาไม่พอ

```
เหลือเวลาพัฒนา [X] ชั่วโมงก่อนเส้นตาย และตอนนี้ทำเสร็จแล้วคือ [รายการ]

ช่วยจัดลำดับว่าควรทำอะไรต่อและควรตัดอะไรทิ้ง
โดยยึดเกณฑ์ว่าอะไรที่ทำให้ demo เล่าเรื่องได้ครบตั้งแต่ต้นทางถึงปลายทาง
และอะไรที่ตัดแล้วยังพิสูจน์แนวคิดได้อยู่

แย้งได้ถ้าคิดว่าสิ่งที่ผมกำลังจะทำต่อไม่คุ้มเวลา
```

---

## ตารางสรุปลำดับ

| # | Prompt | ผลลัพธ์ | เวลาโดยประมาณ |
|---|---|---|---|
| 01 | Scaffold | โครงการรันได้ | 1 ชม. |
| 02 | Design system | Layout + component พื้นฐาน | 2 ชม. |
| 03 | Database schema | ตารางครบใน Supabase | 3 ชม. |
| 04 | Triggers | เวลาเกิดขึ้นเอง | 2 ชม. |
| 05 | RLS | สิทธิ์บังคับที่ database | 3 ชม. |
| 06 | Authentication | login ได้ | 3 ชม. |
| 07 | F1 หน้าขอส่งกลับ | เปิดเคสได้ | 4 ชม. |
| 08 | F2 + F3 | จัดรถและติดตามได้ | 6 ชม. |
| 09 | F4 + F7 | แดชบอร์ดและ export | 4 ชม. |
| 10 | Seed + Deploy | Live URL | 3 ชม. |
| | | **รวม** | **~31 ชม.** |

> เทียบกับเวลาที่มีจริงประมาณ 35 ชั่วโมง (คืนอังคาร/พฤหัส 20:00–22:00 + บ่ายอาทิตย์ 14:00–16:00)
> **เหลือ buffer แค่ 4 ชั่วโมง** — ถ้าตกจากตารางนี้เกิน 1 ขั้น ให้ใช้ Prompt E3 ตัดฟีเจอร์ทันที อย่ารอให้ใกล้เส้นตาย
