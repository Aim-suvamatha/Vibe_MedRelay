-- =============================================================
-- 0011_views.sql — Views สำหรับแดชบอร์ด (F4)
-- อ้างอิง DATABASE.md §6
--
-- ★ security_invoker = on เป็นข้อบังคับ ไม่ใช่ทางเลือก
--   view ที่ไม่ตั้งค่านี้จะรันด้วยสิทธิ์ของเจ้าของ view (postgres)
--   ซึ่งข้าม RLS ทั้งหมด — แดชบอร์ดจะกลายเป็นช่องรั่วที่ใหญ่ที่สุดในระบบ
--   ต้องใช้ PostgreSQL 15 ขึ้นไป (Supabase ปัจจุบันเป็น 15+)
--
-- ตัวเลขทุกตัวคำนวณจาก timestamp ที่มีอยู่แล้ว
-- ผู้ใช้ไม่ต้องกรอกอะไรเพิ่มแม้แต่ช่องเดียวเพื่อให้ได้แดชบอร์ดนี้
-- =============================================================


-- ระยะเวลาแต่ละช่วงของทุกทอดที่ส่งมอบเสร็จแล้ว
create or replace view public.v_leg_metrics
with (security_invoker = on) as
select
  l.id,
  l.case_id,
  l.leg_no,
  l.from_unit_id,
  l.to_unit_id,
  l.role_level,
  c.precedence,
  c.triage,
  l.dispatched_at - l.requested_at  as request_to_dispatch,
  l.on_scene_at   - l.dispatched_at as dispatch_to_scene,
  l.handover_at   - l.on_scene_at   as scene_to_handover,
  l.handover_at   - l.requested_at  as leg_total,
  (l.requested_at at time zone 'Asia/Bangkok')::date as service_date
from public.transfer_leg l
join public."case" c on c.id = l.case_id
where l.status = 'completed';


-- ระยะเวลารวมของทั้งเคส (ทอดแรกถึงทอดสุดท้าย)
create or replace view public.v_case_metrics
with (security_invoker = on) as
select
  c.id,
  c.case_code,
  c.precedence,
  c.triage,
  c.status,
  c.origin_unit_id,
  count(l.id)                              as leg_count,
  min(l.requested_at)                      as first_requested_at,
  max(l.handover_at)                       as last_handover_at,
  max(l.handover_at) - min(l.requested_at) as total_evacuation_time
from public."case" c
left join public.transfer_leg l on l.case_id = c.id
group by c.id;


-- F7 — Export รายงานสรุปกำลังพลบาดเจ็บ
-- คอลัมน์ตามรายงานที่หน่วยใช้จริง (PROJECT.md §5.1)
--   สย.1-3 · ชื่อ-สกุล · สังกัด · เหตุการณ์ · ประเภทยุทธการ · อาการ
--   · สถานพยาบาลแรกรับ · สถานส่งต่อ · ระดับการบาดเจ็บ
--
-- ⚠ ช่อง "ชื่อ-สกุล" คืนค่า patient_alias เท่านั้น
--   เฟส prototype ไม่มีชื่อจริงในระบบให้คืน (AI_RULES.md §3.1)
create or replace view public.v_casualty_report
with (security_invoker = on) as
select
  c.case_code,
  c.patient_alias                       as patient_name,
  origin.name_th                        as origin_unit,
  c.mechanism                           as incident,
  c.operation_type,
  c.chief_complaint                     as symptoms,
  first_dest.name_th                    as first_receiving_facility,
  last_dest.name_th                     as final_receiving_facility,
  c.triage                              as injury_level,
  c.precedence,
  c.status,
  c.requested_at,
  c.closed_at,
  (c.requested_at at time zone 'Asia/Bangkok')::date as service_date
from public."case" c
join public.unit origin on origin.id = c.origin_unit_id
left join lateral (
  select u.name_th
  from public.transfer_leg l join public.unit u on u.id = l.to_unit_id
  where l.case_id = c.id and l.status <> 'cancelled'
  order by l.leg_no asc limit 1
) first_dest on true
left join lateral (
  select u.name_th
  from public.transfer_leg l join public.unit u on u.id = l.to_unit_id
  where l.case_id = c.id and l.status <> 'cancelled'
  order by l.leg_no desc limit 1
) last_dest on true;


-- -------------------------------------------------------------
-- Grant — Supabase ตั้ง default privileges ให้ authenticated อยู่แล้ว
-- แต่ระบุชัดเพื่อไม่ให้ขึ้นกับการตั้งค่าของโปรเจกต์
-- ความปลอดภัยยังอยู่ที่ RLS ของตารางต้นทางผ่าน security_invoker
-- -------------------------------------------------------------
grant select on public.v_leg_metrics      to authenticated;
grant select on public.v_case_metrics     to authenticated;
grant select on public.v_casualty_report  to authenticated;
