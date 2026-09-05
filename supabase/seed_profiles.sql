-- =============================================================
-- seed_profiles.sql — ผู้ใช้ทดสอบ (ชื่อสมมติทั้งหมด)
--
-- profile.id ผูก FK กับ auth.users จึงต้องสร้าง auth user ก่อน
-- ห้ามเขียนลง auth.users ตรงๆ ให้สร้างผ่านหน้า Dashboard เท่านั้น
--
-- ── ขั้นตอน ──────────────────────────────────────────────────
-- 1. Supabase Dashboard -> Authentication -> Users -> Add user
--    สร้าง 4 บัญชีด้วย email สมมติต่อไปนี้ (ตั้งรหัสผ่านอะไรก็ได้)
--       demo.sender@medrelay.invalid
--       demo.transporter@medrelay.invalid
--       demo.receiver@medrelay.invalid
--       demo.monitor@medrelay.invalid
--    โดเมน .invalid สงวนไว้สำหรับการทดสอบตาม RFC 2606 ส่งเมลจริงไม่ได้
-- 2. รันไฟล์นี้ใน SQL Editor
--
-- หมายเหตุ — เฟส 1 ใช้ email/password เพื่อการทดสอบเท่านั้น
-- flow จริงตาม Prompt 06 คือ phone OTP ผูกกับเลขประจำตัวทหาร
--
-- ⚠ ชื่อและเลขประจำตัวทุกแถวเป็นค่าสมมติ
--   เลข 99xxxxxxxx เลือกเพราะไม่ตรงรูปแบบเลขประจำตัวทหารจริง
--   ห้ามใช้ชื่อจริงแม้ของตนเอง (DATABASE.md §8)
-- =============================================================

do $$
declare
  v_missing text;
begin
  select string_agg(e, ', ')
    into v_missing
  from (values
    ('demo.sender@medrelay.invalid'),
    ('demo.transporter@medrelay.invalid'),
    ('demo.receiver@medrelay.invalid'),
    ('demo.monitor@medrelay.invalid')
  ) as t(e)
  where not exists (select 1 from auth.users u where u.email = t.e);

  if v_missing is not null then
    raise exception
      'ยังไม่ได้สร้าง auth user เหล่านี้: % — สร้างที่ Dashboard -> Authentication -> Users ก่อนแล้วรันไฟล์นี้ใหม่',
      v_missing;
  end if;
end $$;

insert into public.profile (id, service_number, full_name, rank_th, unit_id, roles)
select
  u.id,
  d.service_number,
  d.full_name,
  d.rank_th,
  un.id,
  d.roles::public.app_role[]
from (values
  -- persona หลักจาก PROJECT.md §2.2 — ถือ 3 บทบาทเพราะสลับหน้าที่ได้ในแต่ละวัน
  ('demo.sender@medrelay.invalid',      '9900000001', 'สมชาย ใจกล้า (สมมติ)',   'จ.ส.อ.',  'DEMO-BN-A', '{sender,transporter,receiver}'),
  ('demo.transporter@medrelay.invalid', '9900000002', 'สมหมาย ขับดี (สมมติ)',   'ส.อ.',    'DEMO-BN-A', '{transporter}'),
  ('demo.receiver@medrelay.invalid',    '9900000003', 'สมหญิง รับส่ง (สมมติ)',  'ร.ท.',    'DEMO-HOSP', '{receiver,sender}'),
  ('demo.monitor@medrelay.invalid',     '9900000004', 'สมศักดิ์ สั่งการ (สมมติ)','พ.ต.',    'DEMO-CTRL', '{monitor,commander}')
) as d(email, service_number, full_name, rank_th, unit_code, roles)
join auth.users u on u.email = d.email
join public.unit un on un.code = d.unit_code
on conflict (id) do update
  set service_number = excluded.service_number,
      full_name      = excluded.full_name,
      rank_th        = excluded.rank_th,
      unit_id        = excluded.unit_id,
      roles          = excluded.roles;

select service_number, full_name, roles from public.profile order by service_number;
