-- =============================================================
-- 0017_metrics_seconds.sql — เพิ่มคอลัมน์วินาทีให้ view แดชบอร์ด (F4 · Prompt 09)
--
-- ทำไมต้องมีคอลัมน์วินาทีทั้งที่มีคอลัมน์ interval อยู่แล้ว
--   PostgREST คืนค่า interval เป็นสตริงรูปแบบของ PostgreSQL เช่น
--     '00:08:30'  ·  '1 day 02:03:04'  ·  '00:00:04.638053'
--   ฝั่งเว็บต้องเขียน parser เองซึ่งพังเงียบได้หลายทาง โดยเฉพาะเมื่อข้าม 24 ชั่วโมง
--   (รูปแบบเปลี่ยนเป็น 'N days ...' ซึ่ง parser ง่ายๆ จะอ่านได้ 0)
--   แดชบอร์ดที่แสดงเลขผิดโดยไม่มีใครรู้ แย่กว่าแดชบอร์ดที่ไม่มีเลข
--   คืนเป็นตัวเลขวินาทีจึงไม่มีอะไรให้ตีความผิด
--
-- ★ ใช้ create or replace view ได้เพราะเพิ่มคอลัมน์ต่อท้ายอย่างเดียว
--   ไม่ได้แก้ชื่อ ชนิด หรือลำดับของคอลัมน์เดิม — PostgreSQL จึงยอม
--   คอลัมน์ interval เดิมยังอยู่ครบ ของเดิมที่อ่านอยู่ไม่พัง
--
-- ★ security_invoker = on ต้องระบุซ้ำทุกครั้งที่ replace
--   ถ้าลืม view จะกลับไปรันด้วยสิทธิ์เจ้าของ (postgres) ซึ่งข้าม RLS ทั้งหมด
--   แดชบอร์ดจะกลายเป็นช่องรั่วที่ใหญ่ที่สุดในระบบทันที
-- =============================================================

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
  (l.requested_at at time zone 'Asia/Bangkok')::date as service_date,
  -- ── คอลัมน์ใหม่ ตัวเลขวินาทีสำหรับแดชบอร์ด ─────────────────
  extract(epoch from (l.dispatched_at - l.requested_at))::numeric  as request_to_dispatch_sec,
  extract(epoch from (l.on_scene_at   - l.dispatched_at))::numeric as dispatch_to_scene_sec,
  extract(epoch from (l.handover_at   - l.on_scene_at))::numeric   as scene_to_handover_sec,
  extract(epoch from (l.handover_at   - l.requested_at))::numeric  as leg_total_sec
from public.transfer_leg l
join public."case" c on c.id = l.case_id
where l.status = 'completed';


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
  max(l.handover_at) - min(l.requested_at) as total_evacuation_time,
  -- ── คอลัมน์ใหม่ ─────────────────────────────────────────────
  extract(epoch from (max(l.handover_at) - min(l.requested_at)))::numeric
    as total_evacuation_sec,
  -- วันที่ตามเวลาไทย ใช้กรอง "เคสวันนี้" โดยไม่ต้องคำนวณ timezone ฝั่งเว็บ
  -- เว็บรันบน Vercel ซึ่งเป็น UTC ถ้าคิดวันที่ฝั่งนั้นจะเพี้ยนไป 7 ชั่วโมง
  (min(l.requested_at) at time zone 'Asia/Bangkok')::date as service_date
from public."case" c
left join public.transfer_leg l on l.case_id = c.id
group by c.id;


grant select on public.v_leg_metrics  to authenticated;
grant select on public.v_case_metrics to authenticated;
