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


-- -------------------------------------------------------------
-- T11-T16 — การอนุมัติส่งกลับทางอากาศ (0025)
--
-- ★ ทำไมต้องทดสอบทั้งฝั่งที่ "ทำได้" และฝั่งที่ "ทำไม่ได้"
--   monitor มีสิทธิ์กว้างมากใน case_update — แก้ได้ทุกคอลัมน์ของทุกเคส
--   ไม่ผ่าน can_see_case() ด้วยซ้ำ ถ้าทดสอบแต่ฝั่งที่ทำได้ จะไม่มีวันรู้ว่า
--   คนอื่นแอบตัดสินคำขอแทนศูนย์สั่งการได้หรือเปล่า
-- -------------------------------------------------------------

-- T11-T12 · ศูนย์สั่งการ (9900000004 ถือ {monitor,commander})
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',  (select id::text from public.profile where service_number = '9900000004'),
    'role', 'authenticated'
  )::text, true);
set local role authenticated;

do $$
declare
  c_id  uuid;
  n     int;
  t_at  timestamptz;
  faked boolean := false;
begin
  select id into c_id from public."case" where patient_alias = 'ผู้ป่วย ก' limit 1;

  -- ★ ส่ง air_decision_at ปลอมมาด้วยโดยเจตนา — trigger ต้องเขียนทับเสมอ
  --   หลักการ Prompt 04 ไม่มีช่องกรอกเวลาที่ใดในระบบ ตัวเลขบนแดชบอร์ดจึงเชื่อได้
  update public."case"
     set air_decision      = 'approved',
         air_decision_by   = auth.uid(),
         air_decision_at   = timestamptz '2000-01-01 00:00:00+07',
         air_mode_granted  = 'rotary',
         air_decision_note = 'ลานจอดพร้อม ทัศนวิสัยดี'
   where id = c_id;
  get diagnostics n = row_count;

  select air_decision_at into t_at from public."case" where id = c_id;
  faked := t_at < now() - interval '1 hour';

  insert into public._rls_result values
    (11, 'T11 ศูนย์สั่งการอนุมัติคำขอทางอากาศได้',
         case when n = 1 then 'PASS' else 'FAIL' end,
         'แก้ไป ' || n || ' แถว'),
    (12, 'T12 ★ air_decision_at ตั้งโดย trigger ไม่ใช่ค่าที่ client ส่งมา',
         case when not faked then 'PASS' else 'FAIL' end,
         case when not faked then 'เวลาที่ได้ = ' || t_at
              else 'client ยัดเวลาปลอมเข้ามาได้ ห้าม deploy' end);
end $$;

-- T13 · ไม่อนุมัติแล้วไม่บอกเหตุผล = ข้อมูลหายเงียบ ต้องถูกปฏิเสธที่ฐานข้อมูล
do $$
declare
  c_id    uuid;
  blocked boolean := false;
begin
  select id into c_id from public."case" where patient_alias = 'ผู้ป่วย ข' limit 1;
  begin
    update public."case"
       set air_decision      = 'denied',
           air_decision_by   = auth.uid(),
           air_decision_note = null
     where id = c_id;
  exception when check_violation then blocked := true;
  end;

  insert into public._rls_result
  values (13, 'T13 ★ ไม่อนุมัติโดยไม่ระบุเหตุผลไม่ได้',
              case when blocked then 'PASS' else 'FAIL' end,
              case when blocked then 'database ปฏิเสธถูกต้อง'
                   else 'หน่วยที่ถูกปฏิเสธจะไม่มีวันรู้ว่าเพราะอะไร ห้าม deploy' end);
end $$;

-- T14 · trigger เดิมของ 0013 ต้องไม่หายไปตอน create or replace ใน 0025
--       ถ้าคัดลอกฟังก์ชันมาไม่ครบ เวลาจำหน่ายจะหยุดทำงานเงียบๆ โดยไม่มี error
do $$
declare
  c_id uuid;
  d_at timestamptz;
begin
  select id into c_id from public."case" where patient_alias = 'ผู้ป่วย ค' limit 1;
  update public."case" set outcome = 'recovered' where id = c_id;
  select disposed_at into d_at from public."case" where id = c_id;

  insert into public._rls_result
  values (14, 'T14 ★ trigger เดิม (disposed_at) ยังทำงานหลัง 0025 เขียนทับฟังก์ชัน',
              case when d_at is not null and d_at > now() - interval '1 minute'
                   then 'PASS' else 'FAIL' end,
              coalesce(d_at::text, 'ไม่ถูกตั้งเลย — 0025 ทำบล็อกเดิมหาย'));
end $$;

reset role;

-- T15-T16 · ชุดลำเลียง (9900000002) ตัดสินคำขอแทนศูนย์สั่งการไม่ได้
--           เขาเห็นเคส 'ผู้ป่วย ก' อยู่แล้ว (T1) แต่ไม่ได้เป็นผู้เปิดเคส
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',  (select id::text from public.profile where service_number = '9900000002'),
    'role', 'authenticated'
  )::text, true);
set local role authenticated;

do $$
declare
  c_id    uuid;
  n       int := -1;
  blocked boolean := false;
  before  public.air_decision;
  after   public.air_decision;
begin
  select id, air_decision into c_id, before
    from public."case" where patient_alias = 'ผู้ป่วย ก' limit 1;

  begin
    update public."case"
       set air_decision    = 'denied',
           air_decision_by = auth.uid(),
           air_decision_note = 'ลองแอบตัดสิน'
     where id = c_id;
    get diagnostics n = row_count;
    blocked := (n = 0);
  exception when others then
    blocked := true;
  end;

  select air_decision into after from public."case" where id = c_id;

  insert into public._rls_result values
    (15, 'T15 ★ ชุดลำเลียงตัดสินคำขอทางอากาศแทนศูนย์สั่งการไม่ได้',
         case when blocked then 'PASS' else 'FAIL' end,
         case when blocked then 'แก้ไป ' || greatest(n, 0) || ' แถว'
              else 'ใครก็ตัดสินได้ ห้าม deploy' end),
    -- อ่านค่าซ้ำอีกชั้น เพราะ row_count = 0 อาจเกิดจากเงื่อนไข where ไม่ตรงก็ได้
    -- ข้อนี้ยืนยันว่าค่าที่อยู่ในฐานข้อมูล "ไม่ได้เปลี่ยน" จริงๆ
    (16, 'T16 ผลการตัดสินเดิมไม่ถูกแก้โดยคนที่ไม่มีสิทธิ์',
         case when after is not distinct from before then 'PASS' else 'FAIL' end,
         'ก่อน=' || coalesce(before::text, 'null') || ' หลัง=' || coalesce(after::text, 'null'));
end $$;

reset role;


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
