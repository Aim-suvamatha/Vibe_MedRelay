-- =============================================================
-- seed_pickup_points.sql — จุดนัดรับผู้ป่วยจำลอง (migration 0015)
--
-- ทั้งหมดเป็นชื่อและพิกัดสมมติ ไม่ใช่ที่ตั้งหน่วยจริง
-- AI_RULES §2 ห้ามใส่พิกัดที่ตั้งหน่วยจริงลงในระบบและลงในแชทกับ AI
--
-- รันซ้ำได้ปลอดภัย — มี on conflict do nothing
-- =============================================================

insert into public.pickup_point (unit_id, name, grid_ref, note)
select u.id, d.name, d.grid_ref, d.note
from (values
  ('DEMO-BN-A', 'ฐานปฏิบัติการ ก · ประตูหลัง', 'QA 000 000', 'รถพยาบาลเข้าถึงได้ทุกสภาพอากาศ'),
  ('DEMO-BN-A', 'ลานจอด ฮ. ฐาน ก',             'QA 001 001', 'ใช้ได้เฉพาะเวลากลางวัน'),
  ('DEMO-BN-A', 'จุดนัดพบสี่แยกสมมติ',          'QA 002 002', 'รถใหญ่เข้าไม่ได้ ต้องใช้รถเล็กรับต่อ'),
  ('DEMO-BN-B', 'ฐานปฏิบัติการ ข · ประตูหน้า',  'QB 000 000', null),
  ('DEMO-BN-B', 'ลานจอด ฮ. ฐาน ข',             'QB 001 001', null),
  ('DEMO-CCP-1','จุดรวบรวมผู้ป่วย ก',           'QC 000 000', 'จุดตั้งต้นของสายการส่งกลับ'),
  ('DEMO-BDE',  'ที่พยาบาลกองพล · จุดรับส่ง',    'QD 000 000', null),
  ('DEMO-HOSP', 'โรงพยาบาลค่ายสมมติ · ห้องฉุกเฉิน', 'QE 000 000', null)
) as d(unit_code, name, grid_ref, note)
join public.unit u on u.code = d.unit_code
on conflict (unit_id, name) do nothing;

select u.code as หน่วย, p.name as จุดรับ, p.grid_ref as พิกัด
from public.pickup_point p
join public.unit u on u.id = p.unit_id
order by u.code, p.name;
