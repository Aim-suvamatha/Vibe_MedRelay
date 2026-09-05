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
  ('DEMO-05', 'utility', 'DEMO-BDE',  'available',  'รถอเนกประสงค์ ใช้เมื่อรถพยาบาลไม่พอ')
) as v(call_sign, type, unit_code, status, crew_note)
join public.unit u on u.code = v.unit_code
on conflict (call_sign) do nothing;
