-- =============================================================
-- seed.sql — ข้อมูลจำลองพื้นฐาน (หน่วยและรถ)
-- อ้างอิง DATABASE.md §8
--
-- ⚠ กติกาที่ห้ามละเมิด
--   - ข้อมูลทุกแถวในไฟล์นี้เป็นข้อมูลสมมติทั้งหมด
--   - ห้ามใส่ชื่อหน่วยจริง ทะเบียนรถราชการจริง หรือพิกัดที่ตั้งหน่วยจริง
--     (AI_RULES.md §2 — ห้ามวางรายชื่อกำลังพลจริง ทะเบียนรถราชการจริง)
--   - ห้าม commit ไฟล์ seed ที่มาจากข้อมูลจริงแม้จะถอดตัวระบุแล้ว
--     ให้ตั้งชื่อ seed-real-*.sql ซึ่ง .gitignore กันไว้แล้ว
--
-- ไฟล์นี้ไม่พึ่ง auth.users จึงรันได้ทันทีหลัง migration
-- ข้อมูลผู้ใช้และเคสอยู่ใน seed_profiles.sql และ seed_demo_cases.sql
-- =============================================================

-- -------------------------------------------------------------
-- หน่วย — สมมติทั้งหมด ไล่ตาม Role of care 1 -> 3
-- -------------------------------------------------------------
insert into public.unit (code, name_th, name_en, role_level) values
  ('DEMO-CCP-1',  'จุดรวบรวมผู้ป่วย ก (สมมติ)',      'Casualty Collection Point A', 'role_1'),
  ('DEMO-BN-A',   'ที่พยาบาลกองพัน ก (สมมติ)',        'Battalion Aid Station A',     'role_1'),
  ('DEMO-BN-B',   'ที่พยาบาลกองพัน ข (สมมติ)',        'Battalion Aid Station B',     'role_1'),
  ('DEMO-BDE',    'ที่พยาบาลกองพล (สมมติ)',           'Brigade Medical Company',     'role_2'),
  ('DEMO-HOSP',   'โรงพยาบาลค่ายสมมติ',               'Demo Camp Hospital',          'role_3'),
  ('DEMO-CTRL',   'ศูนย์สั่งการส่งกลับ (สมมติ)',       'Evacuation Control Center',   'role_2')
on conflict (code) do nothing;

-- ผูกสายการบังคับบัญชา
update public.unit u set parent_id = p.id
  from public.unit p
 where p.code = 'DEMO-BDE' and u.code in ('DEMO-CCP-1','DEMO-BN-A','DEMO-BN-B');

update public.unit u set parent_id = p.id
  from public.unit p
 where p.code = 'DEMO-HOSP' and u.code = 'DEMO-BDE';


-- -------------------------------------------------------------
-- รถและชุดส่งกลับ — นามเรียกขานสมมติ
-- -------------------------------------------------------------
insert into public.vehicle (call_sign, type, unit_id, status, crew_note)
select v.call_sign, v.type::public.vehicle_type, u.id, v.status::public.vehicle_status, v.crew_note
from (values
  ('DEMO-01', 'als',     'DEMO-BN-A', 'available',  'พลขับ 1 · นายสิบพยาบาล 1 · พลเปล 2'),
  ('DEMO-02', 'bls',     'DEMO-BN-A', 'available',  'พลขับ 1 · พลเปล 2'),
  ('DEMO-03', 'bls',     'DEMO-BN-B', 'available',  'พลขับ 1 · พลเปล 2'),
  ('DEMO-04', 'als',     'DEMO-BDE',  'maintenance','อยู่ระหว่างซ่อมบำรุง'),
  ('DEMO-05', 'utility', 'DEMO-BDE',  'available',  'รถอเนกประสงค์ ใช้เมื่อรถพยาบาลไม่พอ'),
  -- ที่พยาบาลกองพันมีรถมากกว่าหนึ่งคันเสมอในหน่วยจริง และการมีรถว่างคันเดียว
  -- ทำให้ทั้งการสาธิตและชุดทดสอบแย่งรถกันจนติดขัด (เจอ 8 ก.ย. 2569)
  ('DEMO-06', 'bls',     'DEMO-BN-A', 'available',  'พลขับ 1 · พลเปล 2'),
  ('DEMO-07', 'als',     'DEMO-BN-A', 'available',  'พลขับ 1 · นายสิบพยาบาล 1 · พลเปล 2'),
  -- ★ เพิ่มอีกสามคัน 9 ก.ย. 2569 (รอบบ่าย) ด้วยเหตุผลเดียวกับ DEMO-06/07
  --   ชุดทดสอบฝั่งผู้รับเพิ่มมาสามสเปค แต่ละสเปคจองรถหนึ่งคันจนกว่าทอดจะปิด
  --   และสคริปต์ตั้งของสาธิต (setup-demo-receiver) ค้างรถไว้อีกสามคันโดยตั้งใจ
  --   เพราะเคสสาธิตต้องอยู่กลางทาง รถในหน่วยจึงหมดแล้วสเปคถัดไปเห็นฟอร์มจัดรถว่าง
  --   อาการคือ waitForURL/selectOption timeout ซึ่งชี้ไปผิดที่สนิท
  ('DEMO-08', 'bls',     'DEMO-BN-A', 'available',  'พลขับ 1 · พลเปล 2'),
  ('DEMO-09', 'bls',     'DEMO-BN-A', 'available',  'พลขับ 1 · พลเปล 2'),
  ('DEMO-10', 'als',     'DEMO-BN-A', 'available',  'พลขับ 1 · นายสิบพยาบาล 1 · พลเปล 2'),
  -- ★ อากาศยานลำแรกของชุดสาธิต (9 ก.ย. 2569)
  --   vehicle_type มี 'rotary' มาตั้งแต่ 0001 แต่ไม่เคยมีของจริงสักลำ
  --   ศูนย์สั่งการอนุมัติคำขอทางอากาศได้ตั้งแต่ 0025 แล้ว ถ้าไม่มี ฮ. บนกระดาน
  --   การอนุมัติจะไม่มีอะไรให้ชี้ว่าอนุมัติแล้วเอาลำไหนไป
  --
  --   ⚠ ตั้งไว้ที่ DEMO-BDE ไม่ใช่ DEMO-BN-A โดยเจตนา
  --     policy vehicle_select ให้เห็นเฉพาะรถของหน่วยตัวเอง ฟอร์มจัดรถของ
  --     ชุดลำเลียงที่ DEMO-BN-A จึงไม่เปลี่ยน และ dropdown ในชุดทดสอบ e2e ไม่เลื่อน
  --     ศูนย์สั่งการเห็นทุกคันอยู่แล้วจึงเห็นลำนี้บนกระดานตามปกติ
  ('DEMO-AIR-1', 'rotary', 'DEMO-BDE', 'available', 'นักบิน 2 · นายสิบพยาบาลเวชศาสตร์การบิน 1')
) as v(call_sign, type, unit_code, status, crew_note)
join public.unit u on u.code = v.unit_code
on conflict (call_sign) do nothing;


-- -------------------------------------------------------------
-- ทรัพยากรของศูนย์สั่งการ (0025) — เติมคอลัมน์ที่เพิ่มทีหลัง
--
-- 🔴 ต้องเป็นบล็อก update แยก ห้ามเติมลงใน insert ข้างบนอย่างเดียว
--    insert ทั้งสองก้อนเป็น "on conflict do nothing" ซึ่งแปลว่าแถวที่มีอยู่แล้ว
--    ในฐานข้อมูลจริงจะถูกข้ามทั้งแถว คอลัมน์ใหม่จึงไม่มีวันถูกเติม
--    อาการคือรันไฟล์นี้แล้วเหมือนไม่มีอะไรเกิดขึ้น และแดชบอร์ดขึ้น "ยังไม่รายงาน" ทั้งกระดาน
--
-- ★ crew_note ถูกล้างสำหรับรถที่ข้อความเดิม "พูดซ้ำ" กับตัวเลขทุกตัวอักษร
--   เดิมโน้ตเขียนว่า 'พลขับ 1 · พลเปล 2' ซึ่งตรงกับที่หน้าจอประกอบจากตัวเลขเป๊ะ
--   ผลคือกระดานรถขึ้นบรรทัดเดียวกันสองครั้งติดกัน (เห็นตอนเปิดเบราว์เซอร์จริง 9 ก.ย.)
--   ตอนนี้แบ่งหน้าที่ชัดเจน — ตัวเลขเล่าองค์ประกอบชุด · โน้ตเล่าสิ่งที่ตัวเลขเล่าไม่ได้
--   จึงเหลือโน้ตไว้เฉพาะคันที่มีอะไรจะบอกจริงๆ (เหตุที่ใช้ไม่ได้ · คุณสมบัติพิเศษของชุด)
-- -------------------------------------------------------------
update public.vehicle set medic_count = 1, driver_count = 1, litter_count = 2, crew_note = null
 where call_sign in ('DEMO-01','DEMO-07','DEMO-10');           -- als มีนายสิบพยาบาลประจำ

update public.vehicle set medic_count = 0, driver_count = 1, litter_count = 2, crew_note = null
 where call_sign in ('DEMO-02','DEMO-03','DEMO-06','DEMO-08','DEMO-09');  -- bls

update public.vehicle set medic_count = 1, driver_count = 1, litter_count = 2
 where call_sign = 'DEMO-04';                                  -- als ที่จอดซ่อมอยู่

update public.vehicle set medic_count = 0, driver_count = 1, litter_count = 0
 where call_sign = 'DEMO-05';                                  -- รถอเนกประสงค์

update public.vehicle set medic_count = 1, driver_count = 2, litter_count = 0
 where call_sign = 'DEMO-AIR-1';                               -- นักบิน 2 นับเป็นพลขับ

-- จุดส่งกลับ — เตียงว่าง กำลังพลเข้าเวร และพิกัดอ้างอิง
--
-- ⚠ พิกัดเป็นเลขสมมติ ไม่ใช่ที่ตั้งหน่วยจริง (AI_RULES.md §2)
--   และเป็นค่าที่คนกรอกไว้ล่วงหน้า ไม่ได้ดึงจาก GPS (AI_RULES.md §3.1)
--
-- ⚠ ศูนย์สั่งการ (DEMO-CTRL) ไม่ใช่จุดส่งกลับ แต่เป็นที่ทำงานของคนที่จัดสรรจุดส่งกลับ
--   จึงตั้ง is_evac_node = false (0026) แล้วปล่อยเตียง/กำลังพลเป็น null
--   ไม่ใช่ 0 เพราะ 0 แปลว่า "รายงานแล้วว่าเต็ม" ซึ่งไม่จริง — มันไม่เคยรับผู้ป่วยตั้งแต่ต้น
update public.unit set bed_available = 4,  medic_on_duty = 1, grid_ref = 'QA 118 874' where code = 'DEMO-CCP-1';
update public.unit set bed_available = 8,  medic_on_duty = 3, grid_ref = 'QA 132 861' where code = 'DEMO-BN-A';
update public.unit set bed_available = 6,  medic_on_duty = 2, grid_ref = 'QA 097 889' where code = 'DEMO-BN-B';
update public.unit set bed_available = 20, medic_on_duty = 6, grid_ref = 'QA 205 792' where code = 'DEMO-BDE';
update public.unit set bed_available = 45, medic_on_duty = 9, grid_ref = 'QA 331 704' where code = 'DEMO-HOSP';
update public.unit set bed_available = null, medic_on_duty = null, grid_ref = 'QA 212 788',
       is_evac_node = false where code = 'DEMO-CTRL';
update public.unit set is_evac_node = true where code <> 'DEMO-CTRL';
