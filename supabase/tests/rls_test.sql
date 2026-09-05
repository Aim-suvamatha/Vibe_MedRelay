-- =============================================================
-- rls_test.sql — พิสูจน์ว่า RLS บังคับจริง ไม่ใช่แค่ประกาศไว้
-- อ้างอิง Prompt 05 · docs/testing.md §B1
--
-- ต้องรัน migration + seed.sql + seed_profiles.sql + seed_demo_cases.sql ก่อน
-- รันทั้งไฟล์ใน Supabase SQL Editor ครั้งเดียว — ทุกอย่างอยู่ใน transaction
-- ที่ปิดท้ายด้วย rollback จึงไม่ทิ้งอะไรไว้ในฐานข้อมูล
--
-- ผลลัพธ์ออกมาเป็นตารางเดียวท้ายไฟล์ ต้องเป็น PASS ทุกแถว
-- ถ้ามีแถวไหน FAIL ห้าม deploy
--
-- ทำไมต้อง set local role authenticated
--   SQL Editor รันด้วย role postgres ซึ่งเป็นเจ้าของตาราง และเจ้าของตาราง
--   ได้รับการยกเว้น RLS โดยปริยาย ถ้าไม่สลับ role การทดสอบจะผ่านหมด
--   ทั้งที่ policy อาจผิด — เป็นกับดักที่พบบ่อยที่สุดในการทดสอบ RLS
-- =============================================================

begin;

-- ที่เก็บผล — เป็นตารางธรรมดาไม่ใช่ temp table เพราะต้องเขียนได้จากหลาย role
-- ถูกลบไปพร้อม rollback ท้ายไฟล์
create table public._rls_result (seq int, test text, result text, note text);

-- ⚠ ต้อง disable RLS ให้ตารางนี้โดยเฉพาะ
--   Supabase มี event trigger ชื่อ rls_auto_enable ที่เปิด RLS ให้ทุกตาราง
--   ที่ถูกสร้างใหม่ใน schema public โดยอัตโนมัติ
--   ตารางที่เปิด RLS แต่ไม่มี policy คือตารางที่ปฏิเสธทุกคน
--   การ insert ผลทดสอบตอนสวมบทบาท authenticated จะล้มทั้งไฟล์
--
--   ตารางนี้เป็นที่พักผลทดสอบชั่วคราวที่ rollback ทิ้งท้ายไฟล์ ไม่มีข้อมูลผู้ป่วย
--   จึงปิด RLS ได้โดยไม่ขัดกับกฎของโครงการ
--   (บน PostgreSQL เปล่าที่ไม่มี event trigger ตัวนี้ คำสั่งนี้ไม่มีผลอะไร)
alter table public._rls_result disable row level security;
grant all on public._rls_result to public;


-- -------------------------------------------------------------
-- T0 — เปิด RLS ครบทุกตาราง
-- -------------------------------------------------------------
insert into public._rls_result
select 0,
       'T0 เปิด RLS ครบทุกตาราง',
       case when count(*) filter (where not rowsecurity) = 0 then 'PASS' else 'FAIL' end,
       coalesce(string_agg(tablename, ', ') filter (where not rowsecurity), 'ครบทุกตาราง')
from pg_tables
where schemaname = 'public' and tablename <> '_rls_result';


-- -------------------------------------------------------------
-- T1-T3 — สวมบทบาทเป็น transporter (เลข 9900000002 สังกัด DEMO-BN-A)
--         ถือบทบาท {transporter} อย่างเดียว ไม่ใช่ monitor/commander/admin
-- -------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',  (select id::text from public.profile where service_number = '9900000002'),
    'role', 'authenticated'
  )::text, true);
set local role authenticated;

insert into public._rls_result
select 1, 'T1 transporter เห็นเคสที่ตนถือทอดอยู่',
       case when count(*) > 0 then 'PASS' else 'FAIL' end,
       'เห็น ' || count(*) || ' แถว'
from public."case" where patient_alias = 'ผู้ป่วย ก';

-- 'ผู้ป่วย ญ' ต้นทาง DEMO-BN-B ยังไม่จัดรถ ผู้ใช้คนนี้ไม่เกี่ยวข้องเลย
insert into public._rls_result
select 2, 'T2 transporter มองไม่เห็นเคสข้ามหน่วยที่ไม่เกี่ยวข้อง',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       'เห็น ' || count(*) || ' แถว (ต้องเป็น 0)'
from public."case" where patient_alias = 'ผู้ป่วย ญ';

insert into public._rls_result
select 3, 'T3 มองไม่เห็น assessment ของเคสที่มองไม่เห็น',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       'เห็น ' || count(*) || ' แถว (ต้องเป็น 0)'
from public.assessment a
join public."case" c on c.id = a.case_id
where c.patient_alias = 'ผู้ป่วย ญ';

reset role;


-- -------------------------------------------------------------
-- T4-T5 — sender เปลี่ยน roles ของตัวเองเป็น admin ไม่ได้
-- -------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',  (select id::text from public.profile where service_number = '9900000001'),
    'role', 'authenticated'
  )::text, true);
set local role authenticated;

do $$
declare
  n       int;
  blocked boolean := false;
  reason  text := 'policy โยน error ตามที่ควรเป็น';
begin
  begin
    update public.profile set roles = '{admin}'::public.app_role[] where id = auth.uid();
    get diagnostics n = row_count;
    -- ถ้า with check ทำงาน จะโยน error ไม่ถึงบรรทัดนี้
    -- ถ้าไม่โยน error แต่แก้ไม่ติด (n = 0) ก็ถือว่ากันได้เหมือนกัน
    blocked := (n = 0);
    reason  := 'ไม่โยน error แต่แก้ได้ ' || n || ' แถว';
  exception when others then
    blocked := true;
  end;

  insert into public._rls_result
  values (4, 'T4 sender ยกระดับตัวเองเป็น admin ไม่ได้',
          case when blocked then 'PASS' else 'FAIL' end,
          case when blocked then reason else 'ช่องโหว่ร้ายแรง ห้าม deploy' end);
end $$;

-- policy ต้องไม่ล็อกเกินจำเป็น — ผู้ใช้ยังแก้ข้อมูลอื่นของตัวเองได้
do $$
declare n int;
begin
  update public.profile set rank_th = 'จ.ส.อ.' where id = auth.uid();
  get diagnostics n = row_count;
  insert into public._rls_result
  values (5, 'T5 sender ยังแก้ข้อมูลของตัวเองได้ตามปกติ',
          case when n = 1 then 'PASS' else 'FAIL' end, 'แก้ได้ ' || n || ' แถว');
end $$;

reset role;


-- -------------------------------------------------------------
-- T6-T7 — assessment และ event_log ต้องไม่มี policy UPDATE/DELETE
--         แม้แต่ admin ก็ลบไม่ได้ เพราะไม่มี policy ให้ลบตั้งแต่ต้น
-- -------------------------------------------------------------
insert into public._rls_result
select 6, 'T6 assessment ไม่มี policy UPDATE/DELETE',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       coalesce(string_agg(policyname || ' (' || cmd || ')', ', '), 'ไม่มี ถูกต้อง')
from pg_policies
where schemaname = 'public' and tablename = 'assessment' and cmd in ('UPDATE','DELETE','ALL');

insert into public._rls_result
select 7, 'T7 event_log ไม่มี policy UPDATE/DELETE',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       coalesce(string_agg(policyname || ' (' || cmd || ')', ', '), 'ไม่มี ถูกต้อง')
from pg_policies
where schemaname = 'public' and tablename = 'event_log' and cmd in ('UPDATE','DELETE','ALL');


-- -------------------------------------------------------------
-- T8-T9 — constraint เวลา ต้องปฏิเสธลำดับเวลาที่เป็นไปไม่ได้
--         ข้อนี้คือสิ่งที่ทำให้ตัวเลขบนแดชบอร์ดเชื่อถือได้
-- -------------------------------------------------------------
do $$
declare
  c_id uuid; u_a uuid; u_b uuid;
  ok1 boolean := false;
  ok2 boolean := false;
begin
  select id into u_a  from public.unit where code = 'DEMO-BN-A';
  select id into u_b  from public.unit where code = 'DEMO-HOSP';
  select id into c_id from public."case" where patient_alias = 'ผู้ป่วย ก' limit 1;

  -- ส่งมอบก่อนไปถึง
  begin
    insert into public.transfer_leg
      (case_id, leg_no, from_unit_id, to_unit_id, role_level, status,
       requested_at, dispatched_at, on_scene_at, departed_at, arrived_at, handover_at)
    values (c_id, 90, u_a, u_b, 'role_3', 'completed',
            now(), now() + interval '1 min', now() + interval '2 min',
            now() + interval '3 min', now() + interval '9 min', now() + interval '5 min');
  exception when check_violation then ok1 := true;
  end;

  -- ส่งมอบทั้งที่ยังไม่เคยไปถึง (arrived_at เป็น null)
  -- ข้อนี้คือข้อที่ constraint ฉบับใน DATABASE.md §3.5 ปล่อยผ่าน
  begin
    insert into public.transfer_leg
      (case_id, leg_no, from_unit_id, to_unit_id, role_level, status, requested_at, handover_at)
    values (c_id, 91, u_a, u_b, 'role_3', 'completed', now(), now() + interval '5 min');
  exception when check_violation then ok2 := true;
  end;

  insert into public._rls_result values
    (8, 'T8 ปฏิเสธ handover_at ที่มาก่อน arrived_at',
        case when ok1 then 'PASS' else 'FAIL' end,
        case when ok1 then 'database ปฏิเสธถูกต้อง' else 'response time ติดลบได้ ห้าม deploy' end),
    (9, 'T9 ปฏิเสธ handover_at ที่ไม่มี arrived_at',
        case when ok2 then 'PASS' else 'FAIL' end,
        case when ok2 then 'database ปฏิเสธถูกต้อง' else 'ส่งมอบผู้ป่วยที่ไม่เคยไปถึงได้ ห้าม deploy' end);
end $$;


-- -------------------------------------------------------------
-- T10 — ตารางเลขรัน case_code ต้องไม่มี policy ให้ client แตะ
-- -------------------------------------------------------------
insert into public._rls_result
select 10, 'T10 case_code_counter ไม่มี policy ใดๆ',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       coalesce(string_agg(policyname, ', '), 'ไม่มี ถูกต้อง')
from pg_policies
where schemaname = 'public' and tablename = 'case_code_counter';


-- =============================================================
-- ผลรวม — ต้องเป็น PASS ทุกแถว
-- =============================================================
select seq, test, result, note from public._rls_result order by seq;

select
  count(*) filter (where result = 'PASS') || '/' || count(*) || ' PASS' as summary,
  case when count(*) filter (where result <> 'PASS') = 0
       then '✅ ผ่านทั้งหมด deploy ได้'
       else '🛑 มี FAIL ห้าม deploy' end as verdict
from public._rls_result;

rollback;
