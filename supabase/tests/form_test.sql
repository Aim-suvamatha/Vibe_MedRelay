-- =============================================================
-- form_test.sql — พิสูจน์ schema ที่เพิ่มจากแบบฟอร์มกระดาษ (migration 0012–0014)
-- อ้างอิงเอกสารต้นฉบับใน supabase/Report/
--
-- ต้องรัน migration + seed.sql + seed_profiles.sql + seed_demo_cases.sql ก่อน
-- ทั้งไฟล์อยู่ใน transaction ที่ปิดท้ายด้วย rollback จึงไม่ทิ้งอะไรไว้
--
-- คำถามที่ไฟล์นี้ตอบ
--   G  เวลาเกิดจากระบบ ไม่ใช่จาก client แม้ client จะพยายามยัดค่ามา
--   H  constraint ปฏิเสธข้อมูลที่ผิดรูปจริง
--   I  บันทึกการรักษาแก้ไม่ได้ ยกเว้นเวลาคลายสายรัด — และแก้ได้แค่ครั้งเดียว
--   J  บัญชีสิ่งของแก้ได้เฉพาะเจ้าของบันทึก
--   K  ปลายทางบันทึกผลการจำหน่ายได้ตาม policy ใหม่
--   L  create_evac_request เปิดเคสได้ครบ 3 ตาราง และ rollback ทั้งก้อนเมื่อพลาด
-- =============================================================

begin;

create table public._form_result (seq int, test text, result text, note text);
-- เหตุผลเดียวกับ rls_test.sql — Supabase มี event trigger rls_auto_enable
alter table public._form_result disable row level security;
grant all on public._form_result to public;

-- ผู้ใช้ที่จะสวมบทบาทในไฟล์นี้
--   9900000001 sender/transporter/receiver @ DEMO-BN-A  (ผู้สร้างเคสในชุด seed)
--   9900000003 receiver/sender             @ DEMO-HOSP  (ปลายทาง)
create table public._who as
select
  (select id from public.profile where service_number = '9900000001') as p1,
  (select id from public.profile where service_number = '9900000003') as p3,
  (select id from public."case"  where patient_alias = 'ผู้ป่วย ก')   as c_id;

-- เหตุผลเดียวกับ _form_result — ต้องอ่านได้หลังสวมบทบาท authenticated
alter table public._who disable row level security;
grant all on public._who to public;

-- =============================================================
-- S — ตรวจโครงสร้างที่ลงไปจริงบน Supabase (เพิ่มเฉพาะสคริปต์ตรวจนี้)
--     ข้อ S5 กับ S6 คือสองข้อที่สำคัญที่สุด เพราะเป็นสิทธิ์ระดับคอลัมน์
--     ซึ่ง PGlite ในเครื่องพิสูจน์แทน Supabase จริงไม่ได้
-- =============================================================
insert into public._form_result
select -8, 'S1 มีตารางครบ 11 ตาราง',
       case when count(*) = 11 then 'PASS' else 'FAIL' end, count(*) || ' ตาราง'
from pg_tables where schemaname = 'public'
  and tablename not in ('_form_result', '_who');

insert into public._form_result
select -7, 'S2 เปิด RLS ครบทุกตาราง',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       coalesce(string_agg(tablename, ', '), 'ครบทุกตาราง')
from pg_tables where schemaname = 'public' and not rowsecurity
  and tablename not in ('_form_result', '_who');

insert into public._form_result
select -6, 'S3 ตารางใหม่ครบ (treatment · property_item · pickup_point)',
       case when count(*) = 3 then 'PASS' else 'FAIL' end, count(*) || '/3'
from pg_tables where schemaname = 'public'
  and tablename in ('treatment', 'property_item', 'pickup_point');

insert into public._form_result
select -5, 'S4 enum ใหม่ครบ 10 ตัว',
       case when count(*) = 10 then 'PASS' else 'FAIL' end, count(*) || '/10'
from pg_type t join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typtype = 'e' and t.typname in
  ('rank_group','report_category','case_outcome','disposition_route','avpu_level',
   'transport_mode','patient_mobility','security_status','nbc_status','tx_code');

-- ★ ถ้าข้อนี้ FAIL แปลว่าผู้ใช้แก้ dose ของเวชระเบียนได้ ห้ามใช้งานต่อ
insert into public._form_result
select -4, 'S5 ★ authenticated ไม่มีสิทธิ์ UPDATE ทั้งตาราง treatment',
       case when has_table_privilege('authenticated','public.treatment','UPDATE')
            then 'FAIL' else 'PASS' end,
       case when has_table_privilege('authenticated','public.treatment','UPDATE')
            then 'ยังมีสิทธิ์อยู่ — revoke ไม่ทำงาน'
            else 'ถูกตัดสิทธิ์แล้ว' end;

insert into public._form_result
select -3, 'S6 ★ แต่ยังปิดสายรัดได้ (สิทธิ์ระดับคอลัมน์)',
       case when has_column_privilege('authenticated','public.treatment','tourniquet_off','UPDATE')
             and has_column_privilege('authenticated','public.treatment','released_by','UPDATE')
             and not has_column_privilege('authenticated','public.treatment','dose','UPDATE')
            then 'PASS' else 'FAIL' end,
       'tourniquet_off=' || has_column_privilege('authenticated','public.treatment','tourniquet_off','UPDATE')::text
       || ' dose=' || has_column_privilege('authenticated','public.treatment','dose','UPDATE')::text;

insert into public._form_result
select -2, 'S7 trigger case_form_timestamps ติดตั้งแล้ว',
       case when count(*) = 1 then 'PASS' else 'FAIL' end, count(*) || ' ตัว'
from pg_trigger where tgname = 'case_form_timestamps' and not tgisinternal;

insert into public._form_result
select -1, 'S8 คอลัมน์ใหม่ใน case ครบ 22 ช่อง',
       case when count(*) = 22 then 'PASS' else 'FAIL' end, count(*) || '/22'
from information_schema.columns
where table_schema = 'public' and table_name = 'case' and column_name in
  ('report_category','patient_rank_group','hostile_action','on_duty','injury_place',
   'injury_grid','injury_sites','protective_gear','patient_mobility','transport_mode',
   'pickup_grid','pickup_marking','security_status','nbc_status','approved_by','approved_at',
   'outcome','disposition_route','dest_unit_id','icd10','disposed_at','feedback_note');



-- =============================================================
-- G — trigger เวลา (รันในฐานะเจ้าของตาราง เพราะทดสอบ trigger ไม่ใช่ RLS)
-- =============================================================
do $$
declare
  c        uuid := (select c_id from public._who);
  p3       uuid := (select p3 from public._who);
  t_out    timestamptz;
  t_out2   timestamptz;
  t_appr   timestamptz;
begin
  -- G1 ตั้ง outcome พร้อมยัด disposed_at ปลอมมาจากปี 2020
  update public."case"
     set outcome = 'hospitalized', disposed_at = '2020-01-01'::timestamptz
   where id = c;
  select disposed_at into t_out from public."case" where id = c;

  insert into public._form_result values (1,
    'G1 ตั้ง outcome แล้ว disposed_at ขึ้นเอง และเวลาปลอมจาก client ถูกทิ้ง',
    case when t_out > now() - interval '1 minute' then 'PASS' else 'FAIL' end,
    'ได้ ' || coalesce(t_out::text, 'null'));

  -- G2 เคสจำหน่ายไปแล้ว พยายามแก้เวลาย้อนหลัง
  update public."case" set disposed_at = '2021-01-01'::timestamptz where id = c;
  select disposed_at into t_out2 from public."case" where id = c;

  insert into public._form_result values (2,
    'G2 เคสที่จำหน่ายแล้ว แก้ disposed_at ย้อนหลังไม่ได้',
    case when t_out2 = t_out then 'PASS' else 'FAIL' end,
    'เวลาเดิมคงอยู่: ' || (t_out2 = t_out)::text);

  -- G3 ถอน outcome แล้วเวลาต้องหายไปด้วย
  update public."case" set outcome = null where id = c;
  insert into public._form_result
  select 3, 'G3 ถอน outcome แล้ว disposed_at กลับเป็น null',
         case when disposed_at is null then 'PASS' else 'FAIL' end,
         coalesce(disposed_at::text, 'null ถูกต้อง')
  from public."case" where id = c;

  -- G4 อนุมัติคำขอ
  update public."case"
     set approved_by = p3, approved_at = '2019-05-05'::timestamptz
   where id = c;
  select approved_at into t_appr from public."case" where id = c;

  insert into public._form_result values (4,
    'G4 ตั้ง approved_by แล้ว approved_at ขึ้นเอง เวลาปลอมถูกทิ้ง',
    case when t_appr > now() - interval '1 minute' then 'PASS' else 'FAIL' end,
    'ได้ ' || coalesce(t_appr::text, 'null'));

  -- คืนสภาพ
  update public."case" set approved_by = null, outcome = null where id = c;
end $$;


-- =============================================================
-- H — constraint
-- =============================================================
do $$
declare c uuid := (select c_id from public._who);
begin
  begin
    update public."case" set icd10 = 'ไม่ใช่รหัส' where id = c;
    insert into public._form_result values (5, 'H1 ปฏิเสธ icd10 ที่ผิดรูปแบบ', 'FAIL', 'ผ่านเข้าไปได้');
  exception when check_violation then
    insert into public._form_result values (5, 'H1 ปฏิเสธ icd10 ที่ผิดรูปแบบ', 'PASS', 'database ปฏิเสธถูกต้อง');
  end;

  begin
    update public."case" set icd10 = 'S72.001' where id = c;
    insert into public._form_result values (6, 'H2 รับ icd10 ที่ถูกรูปแบบ (S72.001)', 'PASS', 'รับเข้าถูกต้อง');
  exception when others then
    insert into public._form_result values (6, 'H2 รับ icd10 ที่ถูกรูปแบบ (S72.001)', 'FAIL', SQLERRM);
  end;

  begin
    update public."case" set injury_sites = '{"site":"arm"}'::jsonb where id = c;
    insert into public._form_result values (7, 'H3 ปฏิเสธ injury_sites ที่ไม่ใช่ array', 'FAIL', 'ผ่านเข้าไปได้');
  exception when check_violation then
    insert into public._form_result values (7, 'H3 ปฏิเสธ injury_sites ที่ไม่ใช่ array', 'PASS', 'database ปฏิเสธถูกต้อง');
  end;

  update public."case" set icd10 = null where id = c;
end $$;


-- =============================================================
-- I — treatment  (สวมบทบาท authenticated เพื่อให้ RLS และ column grant มีผลจริง)
-- =============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', (select p1::text from public._who), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  c    uuid := (select c_id from public._who);
  p1   uuid := (select p1  from public._who);
  tq   uuid;
  n    int;
begin
  -- I1 บันทึกการรัดสายห้ามเลือด
  insert into public.treatment (case_id, tx_code, detail, site, given_by)
  values (c, 'tourniquet', 'CAT gen7', 'แขนขวา', p1)
  returning id into tq;

  insert into public._form_result values (8,
    'I1 บันทึกการรักษาได้ (tourniquet แขนขวา)', 'PASS', 'insert สำเร็จ');

  -- I2 คลายก่อนรัด
  begin
    insert into public.treatment (case_id, tx_code, given_by, given_at, tourniquet_off, released_by)
    values (c, 'tourniquet', p1, now(), now() - interval '1 hour', p1);
    insert into public._form_result values (9, 'I2 ปฏิเสธเวลาคลายที่มาก่อนเวลารัด', 'FAIL', 'ผ่านเข้าไปได้');
  exception when check_violation then
    insert into public._form_result values (9, 'I2 ปฏิเสธเวลาคลายที่มาก่อนเวลารัด', 'PASS', 'database ปฏิเสธถูกต้อง');
  end;

  -- I3 ใส่เวลาคลายให้หัตถการที่ไม่ใช่สายรัด
  begin
    insert into public.treatment (case_id, tx_code, given_by, tourniquet_off, released_by)
    values (c, 'oxygen', p1, now(), p1);
    insert into public._form_result values (10, 'I3 ปฏิเสธเวลาคลายบนหัตถการที่ไม่ใช่สายรัด', 'FAIL', 'ผ่านเข้าไปได้');
  exception when check_violation then
    insert into public._form_result values (10, 'I3 ปฏิเสธเวลาคลายบนหัตถการที่ไม่ใช่สายรัด', 'PASS', 'database ปฏิเสธถูกต้อง');
  end;

  -- I4 ★ แก้ dose ของบันทึกการรักษาไม่ได้ — ข้อสำคัญที่สุดของไฟล์นี้
  --   RLS ระดับแถวปล่อยให้แถวนี้ถูก update ได้ (เป็น tourniquet ที่ยังไม่คลาย)
  --   สิ่งที่ต้องกันคือการฉวยโอกาสแก้คอลัมน์อื่นไปด้วย ซึ่งกันด้วย column grant เท่านั้น
  begin
    update public.treatment set dose = '999 mg' where id = tq;
    insert into public._form_result values (11,
      'I4 แก้ dose ของบันทึกการรักษาไม่ได้ (column grant)', 'FAIL', 'แก้ได้ — ช่องโหว่');
  exception when insufficient_privilege then
    insert into public._form_result values (11,
      'I4 แก้ dose ของบันทึกการรักษาไม่ได้ (column grant)', 'PASS', 'ถูกปฏิเสธที่ระดับคอลัมน์');
  end;

  -- I5 คลายสายรัดได้
  update public.treatment
     set tourniquet_off = now(), released_by = p1
   where id = tq;
  get diagnostics n = row_count;
  insert into public._form_result values (12,
    'I5 คลายสายรัดได้ (แก้ได้เฉพาะสองคอลัมน์นี้)',
    case when n = 1 then 'PASS' else 'FAIL' end, 'แก้ได้ ' || n || ' แถว');

  -- I6 คลายซ้ำไม่ได้ — policy กรองด้วย tourniquet_off is null แถวจึงหลุดจากขอบเขต
  update public.treatment
     set tourniquet_off = now() + interval '5 hours', released_by = p1
   where id = tq;
  get diagnostics n = row_count;
  insert into public._form_result values (13,
    'I6 คลายซ้ำไม่ได้ เวลาคลายเดิมถูกล็อก',
    case when n = 0 then 'PASS' else 'FAIL' end, 'แก้ได้ ' || n || ' แถว (ต้องเป็น 0)');
end $$;

-- I7 หาสายรัดที่ยังไม่ถูกคลาย — คำถามที่หน้าศูนย์สั่งการต้องตอบได้ทุก 30 วินาที
--    รัดใหม่สองเส้น คลายหนึ่ง แล้วต้องเหลือค้างพอดีหนึ่งเส้น
do $$
declare
  c  uuid := (select c_id from public._who);
  p1 uuid := (select p1  from public._who);
  a  uuid;
  n  int;
begin
  insert into public.treatment (case_id, tx_code, site, given_by)
  values (c, 'tourniquet', 'ขาซ้าย', p1) returning id into a;

  insert into public.treatment (case_id, tx_code, site, given_by)
  values (c, 'tourniquet', 'ขาขวา', p1);

  update public.treatment set tourniquet_off = now(), released_by = p1 where id = a;

  select count(*) into n from public.treatment
   where tx_code = 'tourniquet' and tourniquet_off is null;

  insert into public._form_result values (14,
    'I7 นับสายรัดที่ยังไม่คลายได้ถูกต้อง (รัด 2 คลาย 1)',
    case when n = 1 then 'PASS' else 'FAIL' end,
    'ค้างอยู่ ' || n || ' เส้น (ต้องเป็น 1)');
end $$;

-- I8 ต้องไม่มี policy DELETE — บันทึกการรักษาลบไม่ได้
insert into public._form_result
select 15, 'I8 treatment ไม่มี policy DELETE',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       coalesce(string_agg(policyname, ', '), 'ไม่มี ถูกต้อง')
from pg_policies
where schemaname = 'public' and tablename = 'treatment' and cmd = 'DELETE';


-- =============================================================
-- J — property_item
-- =============================================================
do $$
declare
  c  uuid := (select c_id from public._who);
  p1 uuid := (select p1  from public._who);
  it uuid;
  n  int;
begin
  insert into public.property_item (case_id, item_name, qty, unit_label, weapon_serial, recorded_by)
  values (c, 'ปืนเล็กยาว (สมมติ)', 1, 'กระบอก', 'TEST-0000-0000', p1)
  returning id into it;

  insert into public._form_result values (16,
    'J1 บันทึกบัญชีสิ่งของได้', 'PASS', 'insert สำเร็จ');

  -- ต่างจาก treatment โดยเจตนา — นับของผิดต้องแก้ให้ตรงของจริงได้
  update public.property_item set qty = 2 where id = it;
  get diagnostics n = row_count;
  insert into public._form_result values (17,
    'J2 ผู้บันทึกแก้จำนวนของตัวเองได้',
    case when n = 1 then 'PASS' else 'FAIL' end, 'แก้ได้ ' || n || ' แถว');
end $$;

-- J3 สวมบทบาทคนอื่นแล้วแก้ของที่ไม่ใช่ของตัวเอง
select set_config('request.jwt.claims',
  json_build_object('sub', (select p3::text from public._who), 'role', 'authenticated')::text, true);

do $$
declare n int;
begin
  update public.property_item set qty = 99 where item_name = 'ปืนเล็กยาว (สมมติ)';
  get diagnostics n = row_count;
  insert into public._form_result values (18,
    'J3 คนอื่นแก้บัญชีสิ่งของที่ไม่ได้บันทึกเองไม่ได้',
    case when n = 0 then 'PASS' else 'FAIL' end, 'แก้ได้ ' || n || ' แถว (ต้องเป็น 0)');
end $$;


-- =============================================================
-- K — policy ใหม่ของ case: ปลายทางบันทึกผลการจำหน่ายได้
-- ยังสวมบทบาท 9900000003 (receiver @ DEMO-HOSP) อยู่
-- =============================================================
do $$
declare
  c uuid := (select c_id from public._who);
  n int;
begin
  update public."case"
     set outcome = 'recovered', disposition_route = 'returned_to_unit'
   where id = c;
  get diagnostics n = row_count;
  insert into public._form_result values (19,
    'K1 receiver ปลายทางบันทึกผลการจำหน่ายได้',
    case when n = 1 then 'PASS' else 'FAIL' end, 'แก้ได้ ' || n || ' แถว');
end $$;

insert into public._form_result
select 20, 'K2 disposed_at ถูกตั้งให้อัตโนมัติตอน receiver จำหน่าย',
       case when disposed_at is not null then 'PASS' else 'FAIL' end,
       coalesce(disposed_at::text, 'null — ผิด')
from public."case" where id = (select c_id from public._who);


-- =============================================================
-- L — create_evac_request (Prompt 07 · migration 0015)
--     ข้อ L2 คือหัวใจ: พิสูจน์ว่า 3 insert เป็น atomic จริง
-- =============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', (select p1::text from public._who), 'role', 'authenticated')::text, true);

do $$
declare
  u_hosp uuid := (select id from public.unit where code = 'DEMO-HOSP');
  u_bn_a uuid := (select id from public.unit where code = 'DEMO-BN-A');
  pp     uuid := (select id from public.pickup_point
                   where name = 'ฐานปฏิบัติการ ก · ประตูหลัง');
  r      record;
  n_case int;
  n_leg  int;
  n_ass  int;
  before_n int;
begin
  -- L1 เปิดคำขอครบทั้ง 3 ตาราง
  select * into r from public.create_evac_request(
    p_precedence      => 'urgent',
    p_chief_complaint => 'สะเก็ดระเบิดแขนขวา (ทดสอบ)',
    p_to_unit_id      => u_hosp,
    p_patient_alias   => 'ผู้ป่วยทดสอบ L',
    p_pickup_point_id => pp,
    p_triage          => 'red',
    p_avpu            => 'alert',
    p_pulse           => 104,
    p_sbp             => 110,
    p_dbp             => 70
  );

  select count(*) into n_case from public."case" where id = r.case_id;
  select count(*) into n_leg  from public.transfer_leg where case_id = r.case_id;
  select count(*) into n_ass  from public.assessment where case_id = r.case_id;

  insert into public._form_result values (21,
    'L1 กดครั้งเดียวได้ครบ 3 แถวใน 3 ตาราง',
    case when n_case = 1 and n_leg = 1 and n_ass = 1 then 'PASS' else 'FAIL' end,
    format('case=%s leg=%s assessment=%s · %s', n_case, n_leg, n_ass, r.case_code));

  insert into public._form_result
  select 22, 'L2 ทอดแรกเป็น pending และ leg_no = 1',
         case when leg_no = 1 and status = 'pending' then 'PASS' else 'FAIL' end,
         'leg_no=' || leg_no || ' status=' || status
  from public.transfer_leg where case_id = r.case_id;

  insert into public._form_result
  select 23, 'L3 requested_at ตั้งโดย database ไม่ใช่ client',
         case when requested_at > now() - interval '1 minute' then 'PASS' else 'FAIL' end,
         requested_at::text
  from public."case" where id = r.case_id;

  insert into public._form_result
  select 24, 'L4 พิกัดจุดรับถูกคัดลอกมาจากจุดที่เลือก ไม่ใช่จาก GPS',
         case when pickup_grid = 'QA 000 000' then 'PASS' else 'FAIL' end,
         coalesce(pickup_grid, 'null')
  from public."case" where id = r.case_id;
end $$;

-- ★ L5 — ข้อสำคัญที่สุดของหมวดนี้
-- ส่ง gcs = 99 ซึ่งผิด check constraint ของ assessment
-- ถ้า function ไม่ atomic จะเหลือ case กับ transfer_leg ค้างอยู่โดยไม่มีผลประเมิน
do $$
declare
  u_hosp   uuid := (select id from public.unit where code = 'DEMO-HOSP');
  before_n int;
  after_n  int;
begin
  select count(*) into before_n from public."case";

  begin
    perform public.create_evac_request(
      p_precedence      => 'routine',
      p_chief_complaint => 'ทดสอบ rollback',
      p_to_unit_id      => u_hosp,
      p_gcs             => 99          -- ผิด constraint gcs between 3 and 15
    );
    insert into public._form_result values (25,
      'L5 ★ ผลประเมินพัง แล้วเคสต้องไม่เหลือค้าง', 'FAIL', 'ไม่มี error — ผิดคาด');
    return;
  exception when check_violation then
    null;  -- คาดว่าต้องมาทางนี้
  end;

  select count(*) into after_n from public."case";
  insert into public._form_result values (25,
    'L5 ★ ผลประเมินพัง แล้วเคสต้องไม่เหลือค้าง (atomic)',
    case when after_n = before_n then 'PASS' else 'FAIL' end,
    format('เคสก่อน %s หลัง %s (ต้องเท่ากัน)', before_n, after_n));
end $$;

do $$
declare
  u_hosp uuid := (select id from public.unit where code = 'DEMO-HOSP');
  r      record;
  n_ass  int;
begin
  -- L6 ไม่มีสัญญาณชีพเลย ต้องไม่สร้างแถว assessment เปล่า
  select * into r from public.create_evac_request(
    p_precedence      => 'routine',
    p_chief_complaint => 'ปวดท้อง (ทดสอบ)',
    p_to_unit_id      => u_hosp
  );
  select count(*) into n_ass from public.assessment where case_id = r.case_id;
  insert into public._form_result values (26,
    'L6 ไม่กรอกสัญญาณชีพเลย ไม่สร้างแถวประเมินเปล่า',
    case when n_ass = 0 then 'PASS' else 'FAIL' end, n_ass || ' แถว (ต้องเป็น 0)');

  -- L7 ปลายทางเดียวกับต้นทาง
  begin
    perform public.create_evac_request(
      p_precedence      => 'routine',
      p_chief_complaint => 'ทดสอบ',
      p_to_unit_id      => public.current_unit_id()
    );
    insert into public._form_result values (27,
      'L7 ปฏิเสธหน่วยปลายทางที่เป็นหน่วยเดียวกับต้นทาง', 'FAIL', 'ผ่านเข้าไปได้');
  exception when others then
    insert into public._form_result values (27,
      'L7 ปฏิเสธหน่วยปลายทางที่เป็นหน่วยเดียวกับต้นทาง', 'PASS', 'ถูกปฏิเสธถูกต้อง');
  end;
end $$;

-- L8 ผู้ที่ไม่มีบทบาท sender เรียก function นี้ไม่ได้ — RLS ยังบังคับแม้เรียกผ่าน function
select set_config('request.jwt.claims',
  json_build_object(
    'sub', (select id::text from public.profile where service_number = '9900000002'),
    'role', 'authenticated')::text, true);

do $$
declare u_hosp uuid := (select id from public.unit where code = 'DEMO-HOSP');
begin
  perform public.create_evac_request(
    p_precedence      => 'routine',
    p_chief_complaint => 'ทดสอบสิทธิ์',
    p_to_unit_id      => u_hosp
  );
  insert into public._form_result values (28,
    'L8 ★ transporter ที่ไม่มีบทบาท sender เปิดเคสไม่ได้', 'FAIL',
    'เปิดได้ — SECURITY INVOKER ถูกเปลี่ยนเป็น DEFINER หรือเปล่า');
exception when insufficient_privilege or others then
  insert into public._form_result values (28,
    'L8 ★ transporter ที่ไม่มีบทบาท sender เปิดเคสไม่ได้', 'PASS',
    'RLS ปฏิเสธถูกต้อง');
end $$;

reset role;

-- =============================================================
-- ผลรวม — ต้องเป็น PASS ทุกแถว
-- =============================================================
select seq, test, result, note from public._form_result order by seq;

select
  count(*) filter (where result = 'PASS') || '/' || count(*) || ' PASS' as summary,
  case when count(*) filter (where result <> 'PASS') = 0
       then '✅ schema จากแบบฟอร์มทำงานครบ'
       else '🛑 มี FAIL ห้าม deploy' end as verdict
from public._form_result;

rollback;
