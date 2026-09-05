-- =============================================================
-- rls_test.sql — พิสูจน์ว่า RLS บังคับจริง ไม่ใช่แค่ประกาศไว้
-- อ้างอิง Prompt 05 · docs/testing.md §B1
--
-- ต้องรัน migration + seed.sql + seed_profiles.sql + seed_demo_cases.sql ก่อน
-- รันทั้งไฟล์ใน Supabase SQL Editor ครั้งเดียว — ทุกอย่างอยู่ใน transaction
-- ที่ปิดท้ายด้วย rollback จึงไม่ทิ้งอะไรไว้ในฐานข้อมูล
--
-- ทำไมต้อง set local role authenticated
--   SQL Editor รันด้วย role postgres ซึ่งเป็นเจ้าของตาราง และเจ้าของตาราง
--   ได้รับการยกเว้น RLS โดยปริยาย ถ้าไม่สลับ role การทดสอบจะผ่านหมด
--   ทั้งที่ policy อาจผิด — เป็นกับดักที่พบบ่อยที่สุดในการทดสอบ RLS
-- =============================================================

begin;

-- -------------------------------------------------------------
-- ส่วนที่ 0 — ตรวจว่าเปิด RLS ครบทุกตาราง (ต้องไม่มีแถวไหนเป็น false)
-- -------------------------------------------------------------
select
  'T0 เปิด RLS ครบทุกตาราง' as test,
  case when count(*) filter (where not rowsecurity) = 0 then 'PASS' else 'FAIL' end as result,
  coalesce(string_agg(tablename, ', ') filter (where not rowsecurity), '-') as tables_without_rls
from pg_tables
where schemaname = 'public';


-- -------------------------------------------------------------
-- ส่วนที่ 1 — สวมบทบาทเป็น transporter (เลข 9900000002 สังกัด DEMO-BN-A)
--             ผู้ใช้คนนี้ถือบทบาท {transporter} อย่างเดียว
--             ไม่ใช่ monitor ไม่ใช่ commander ไม่ใช่ admin
-- -------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',  (select id::text from public.profile where service_number = '9900000002'),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

-- 1.1 เห็นเคสที่ตนเป็นผู้ขนส่ง
select
  'T1 transporter เห็นเคสที่ตนถือทอดอยู่' as test,
  case when count(*) > 0 then 'PASS' else 'FAIL' end as result,
  count(*) as visible_rows
from public."case"
where patient_alias = 'ผู้ป่วย ก';

-- 1.2 มองไม่เห็นเคสของหน่วยอื่นที่ตนไม่เกี่ยวข้อง
--     'ผู้ป่วย ญ' ต้นทาง DEMO-BN-B ปลายทาง DEMO-HOSP ยังไม่จัดรถ
--     ผู้ใช้คนนี้ไม่ใช่ผู้เปิดเคส ไม่ใช่ผู้ขนส่ง ไม่ใช่ผู้รับ และหน่วยไม่เกี่ยว
select
  'T2 transporter มองไม่เห็นเคสข้ามหน่วยที่ไม่เกี่ยวข้อง' as test,
  case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
  count(*) as visible_rows
from public."case"
where patient_alias = 'ผู้ป่วย ญ';

-- 1.3 assessment ของเคสที่มองไม่เห็น ก็ต้องมองไม่เห็นด้วย
select
  'T3 มองไม่เห็น assessment ของเคสที่มองไม่เห็น' as test,
  case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
  count(*) as visible_rows
from public.assessment a
join public."case" c on c.id = a.case_id
where c.patient_alias = 'ผู้ป่วย ญ';

reset role;


-- -------------------------------------------------------------
-- ส่วนที่ 2 — sender เปลี่ยน roles ของตัวเองเป็น admin ไม่ได้
-- -------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',  (select id::text from public.profile where service_number = '9900000001'),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $$
declare
  n int;
  blocked boolean := false;
begin
  begin
    update public.profile
      set roles = '{admin}'::public.app_role[]
      where id = auth.uid();
    get diagnostics n = row_count;
    -- ถ้า with check ทำงาน จะโยน error ไม่ถึงบรรทัดนี้
    -- ถ้าไม่โยน error แต่แก้ไม่ติด (n = 0) ก็ถือว่ากันได้เหมือนกัน
    blocked := (n = 0);
  exception when others then
    blocked := true;
  end;

  raise notice '%', format('T4 sender ยกระดับตัวเองเป็น admin ไม่ได้ : %s',
    case when blocked then 'PASS' else 'FAIL — ช่องโหว่ร้ายแรง' end);

  if not blocked then
    raise exception 'T4 FAIL — sender เปลี่ยน roles ตัวเองเป็น admin ได้ ห้าม deploy';
  end if;
end $$;

-- 2.2 sender ยังแก้ข้อมูลอื่นของตัวเองได้ตามปกติ (policy ไม่ได้ล็อกเกินจำเป็น)
do $$
declare n int;
begin
  update public.profile set rank_th = 'จ.ส.อ.' where id = auth.uid();
  get diagnostics n = row_count;
  raise notice '%', format('T5 sender แก้ข้อมูลของตัวเองได้ : %s',
    case when n = 1 then 'PASS' else 'FAIL' end);
end $$;

reset role;


-- -------------------------------------------------------------
-- ส่วนที่ 3 — assessment และ event_log ต้องไม่มี policy UPDATE/DELETE
--             แม้แต่ admin ก็ลบไม่ได้ เพราะไม่มี policy ให้ลบตั้งแต่ต้น
-- -------------------------------------------------------------
select
  'T6 assessment ไม่มี policy UPDATE/DELETE' as test,
  case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
  coalesce(string_agg(policyname || ' (' || cmd || ')', ', '), '-') as offending_policies
from pg_policies
where schemaname = 'public' and tablename = 'assessment' and cmd in ('UPDATE','DELETE','ALL');

select
  'T7 event_log ไม่มี policy UPDATE/DELETE' as test,
  case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
  coalesce(string_agg(policyname || ' (' || cmd || ')', ', '), '-') as offending_policies
from pg_policies
where schemaname = 'public' and tablename = 'event_log' and cmd in ('UPDATE','DELETE','ALL');


-- -------------------------------------------------------------
-- ส่วนที่ 4 — constraint เวลา ต้องปฏิเสธลำดับเวลาที่เป็นไปไม่ได้
--             ข้อนี้คือสิ่งที่ทำให้ตัวเลขบนแดชบอร์ดเชื่อถือได้
-- -------------------------------------------------------------
do $$
declare
  c_id  uuid;
  u_a   uuid;
  u_b   uuid;
  ok1   boolean := false;
  ok2   boolean := false;
begin
  select id into u_a from public.unit where code = 'DEMO-BN-A';
  select id into u_b from public.unit where code = 'DEMO-HOSP';
  select id into c_id from public."case" where patient_alias = 'ผู้ป่วย ก' limit 1;

  -- 4.1 ส่งมอบก่อนไปถึง ต้องถูกปฏิเสธ
  begin
    insert into public.transfer_leg
      (case_id, leg_no, from_unit_id, to_unit_id, role_level, status,
       requested_at, dispatched_at, on_scene_at, departed_at, arrived_at, handover_at)
    values
      (c_id, 90, u_a, u_b, 'role_3', 'completed',
       now(), now() + interval '1 min', now() + interval '2 min',
       now() + interval '3 min', now() + interval '9 min', now() + interval '5 min');
  exception when check_violation then
    ok1 := true;
  end;

  -- 4.2 ส่งมอบทั้งที่ยังไม่เคยไปถึง (arrived_at เป็น null) ต้องถูกปฏิเสธ
  --     ข้อนี้คือข้อที่ constraint ฉบับใน DATABASE.md §3.5 ปล่อยผ่าน
  begin
    insert into public.transfer_leg
      (case_id, leg_no, from_unit_id, to_unit_id, role_level, status,
       requested_at, handover_at)
    values
      (c_id, 91, u_a, u_b, 'role_3', 'completed', now(), now() + interval '5 min');
  exception when check_violation then
    ok2 := true;
  end;

  raise notice '%', format('T8 ปฏิเสธ handover_at ก่อน arrived_at : %s', case when ok1 then 'PASS' else 'FAIL' end);
  raise notice '%', format('T9 ปฏิเสธ handover_at ที่ไม่มี arrived_at : %s', case when ok2 then 'PASS' else 'FAIL' end);

  if not (ok1 and ok2) then
    raise exception 'T8/T9 FAIL — constraint เวลาไม่ทำงาน ตัวเลข response time บนแดชบอร์ดเชื่อถือไม่ได้';
  end if;
end $$;


-- -------------------------------------------------------------
-- ส่วนที่ 5 — ตารางเลขรัน case_code ต้องไม่มี policy ให้ client แตะ
-- -------------------------------------------------------------
select
  'T10 case_code_counter ไม่มี policy ใดๆ' as test,
  case when count(*) = 0 then 'PASS' else 'FAIL' end as result
from pg_policies
where schemaname = 'public' and tablename = 'case_code_counter';


rollback;
