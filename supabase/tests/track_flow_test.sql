-- =============================================================
-- track_flow_test.sql — พิสูจน์ว่าหน้า /track/[caseId] เดินได้ครบวงจรจริง
-- อ้างอิง Prompt 08 (F3) · HANDOFF §3 "งานถัดไป"
--
-- ไฟล์นี้เดินตามลำดับเดียวกับที่ Server Action ใน
-- src/app/(app)/track/[caseId]/actions.ts ยิงจริงทุกคำสั่ง
-- และสวมบทบาทเป็นบัญชีเดียวกับที่ผู้ใช้แต่ละบทบาทใช้จริง
-- ถ้าไฟล์นี้ PASS ครบ แปลว่าปุ่มบนหน้าจอกดแล้วผ่าน RLS และผ่าน constraint แน่นอน
--
-- รันด้วย
--   node supabase/scripts/sql.mjs --no-tx supabase/tests/track_flow_test.sql
--
-- ทั้งไฟล์อยู่ใน transaction ที่ปิดท้ายด้วย rollback จึงไม่ทิ้งอะไรไว้ในฐานข้อมูลจริง
--
-- ⚠ ต้อง set local role authenticated ทุกครั้งก่อนยิงคำสั่งแทนผู้ใช้
--   role postgres เป็นเจ้าของตารางซึ่งได้รับการยกเว้น RLS โดยปริยาย
--   ถ้าไม่สลับ role การทดสอบจะผ่านหมดทั้งที่ policy อาจผิด
-- =============================================================

begin;

create table public._track_result (seq int, test text, result text, note text);
-- เหตุผลเดียวกับ rls_test.sql — Supabase มี event trigger rls_auto_enable
alter table public._track_result disable row level security;
grant all on public._track_result to public;

-- บัญชีที่จะสวมบทบาทในไฟล์นี้ ตรงกับ 4 บัญชีทดสอบใน HANDOFF §2
--   p_send  9900000001 sender/transporter/receiver @ DEMO-BN-A
--   p_trans 9900000002 transporter                 @ DEMO-BN-A
--   p_recv  9900000003 receiver/sender             @ DEMO-HOSP
--   p_mon   9900000004 monitor/commander           @ DEMO-CTRL
create table public._track_ctx as
select
  (select id from public.profile where service_number = '9900000001') as p_send,
  (select id from public.profile where service_number = '9900000002') as p_trans,
  (select id from public.profile where service_number = '9900000003') as p_recv,
  (select id from public.profile where service_number = '9900000004') as p_mon,
  (select id from public.unit    where code = 'DEMO-BN-A')            as u_bn_a,
  (select id from public.unit    where code = 'DEMO-HOSP')            as u_hosp,
  (select id from public.unit    where code = 'DEMO-BDE')             as u_bde,
  (select id from public.vehicle where call_sign = 'DEMO-01')         as v_01,
  null::uuid as case_id,
  null::uuid as leg1_id,
  null::uuid as leg2_id;

alter table public._track_ctx disable row level security;
grant all on public._track_ctx to public;


-- =============================================================
-- K1 — sender เปิดคำขอ (เหมือนหน้า /sender กดส่ง)
--      ทอดที่ 1 ต้องเกิดเป็น pending และ requested_at ต้องมาจาก database
-- =============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', (select p_send::text from public._track_ctx),
                    'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  ctx record;
  r   record;
  leg record;
begin
  select * into ctx from public._track_ctx;

  select * into r from public.create_evac_request(
    p_precedence      => 'urgent',
    p_chief_complaint => 'บาดเจ็บจากการฝึก (ทดสอบ track flow)',
    p_to_unit_id      => ctx.u_hosp,
    p_patient_alias   => 'ผู้ป่วยทดสอบ K',
    p_triage          => 'red',
    p_avpu            => 'alert',
    p_pulse           => 110,
    p_client_uuid     => gen_random_uuid()
  );

  select l.* into leg from public.transfer_leg l where l.case_id = r.case_id;

  update public._track_ctx set case_id = r.case_id, leg1_id = leg.id;

  insert into public._track_result values
    (1, 'K1 sender เปิดคำขอได้ ทอดแรกเป็น pending',
     case when leg.status = 'pending'
            and leg.leg_no = 1
            and leg.requested_at is not null
            and leg.dispatched_at is null
          then 'PASS' else 'FAIL' end,
     'status=' || leg.status || ' leg_no=' || leg.leg_no);
end $$;


-- =============================================================
-- K2 — sender กดจัดรถเองไม่ได้
--      policy leg_update ยอมเฉพาะผู้ถือทอด/หน่วยปลายทาง/transporter/monitor/admin
--      sender สังกัด DEMO-BN-A ซึ่งเป็นต้นทาง ไม่ใช่ปลายทาง จึงไม่เข้าเงื่อนไขใด
--
--      ⚠ UPDATE ที่ไม่ผ่าน USING ของ policy จะ "แก้ 0 แถว" เงียบๆ ไม่ใช่ error
--      จึงต้องวัดที่จำนวนแถวที่ถูกแก้ ไม่ใช่ที่การดัก exception
--
--      ⚠ ตั้งแต่ 0022 ต้องถอดบทบาท transporter ออกจากบัญชีสาธิตก่อนวัด
--        9900000001 ถือทั้ง sender · transporter · receiver เพื่อให้สาธิตได้คนเดียว
--        ถ้าวัดด้วยบัญชีนั้นตรงๆ ข้อนี้จะ "ผ่านเพราะบทบาทอื่น" ไม่ใช่เพราะกติกาของ sender
--        คืนค่าเดิมทันทีหลังวัดเสร็จ (ทั้งไฟล์ rollback อยู่แล้ว แต่ข้อถัดไปยังใช้บัญชีนี้)
-- =============================================================
reset role;

update public.profile set roles = '{sender}'
 where id = (select p_send from public._track_ctx);

select set_config('request.jwt.claims',
  json_build_object('sub', (select p_send::text from public._track_ctx),
                    'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  ctx record;
  n   int;
  st  public.leg_status;
begin
  select * into ctx from public._track_ctx;

  update public.transfer_leg set status = 'dispatched' where id = ctx.leg1_id;
  get diagnostics n = row_count;

  select status into st from public.transfer_leg where id = ctx.leg1_id;

  insert into public._track_result values
    (2, 'K2 sender จัดรถเองไม่ได้ (RLS ปฏิเสธ)',
     case when n = 0 and st = 'pending' then 'PASS' else 'FAIL' end,
     'แก้ไป ' || n || ' แถว · status ยังเป็น ' || coalesce(st::text, 'null'));
end $$;

reset role;

-- คืนบทบาทเดิมให้บัญชีสาธิต
update public.profile set roles = '{sender,transporter,receiver}'
 where id = (select p_send from public._track_ctx);


-- =============================================================
-- K3 — ศูนย์สั่งการจัดรถ (ปุ่ม "จัดรถ" ในหน้า /track)
--      ต้องตั้ง vehicle_id + transporter_id ไปพร้อมกัน
--      transporter_id คือกุญแจที่ทำให้ชุดลำเลียงกดขั้นถัดไปได้
-- =============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', (select p_mon::text from public._track_ctx),
                    'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  ctx record;
  leg record;
  cs  public.case_status;
begin
  select * into ctx from public._track_ctx;

  update public.transfer_leg
     set status = 'dispatched', vehicle_id = ctx.v_01, transporter_id = ctx.p_trans
   where id = ctx.leg1_id and status = 'pending';

  select l.* into leg from public.transfer_leg l where l.id = ctx.leg1_id;
  select c.status into cs from public."case" c where c.id = ctx.case_id;

  insert into public._track_result values
    (3, 'K3 ศูนย์สั่งการจัดรถได้ · dispatched_at ตั้งโดย trigger',
     case when leg.status = 'dispatched'
            and leg.dispatched_at is not null
            and leg.dispatched_at >= leg.requested_at
            and leg.transporter_id = ctx.p_trans
            and leg.vehicle_id = ctx.v_01
          then 'PASS' else 'FAIL' end,
     'dispatched_at=' || coalesce(leg.dispatched_at::text, 'null'));

  insert into public._track_result values
    (4, 'K4 เคสเลื่อนเป็น active เมื่อทอดแรกออกจาก pending',
     case when cs = 'active' then 'PASS' else 'FAIL' end,
     'case.status=' || coalesce(cs::text, 'null'));
end $$;


-- =============================================================
-- K5 — ข้ามขั้นไม่ได้ แม้ผู้กดจะมีสิทธิ์เต็ม
--      constraint leg_time_order ต้องปฏิเสธ dispatched -> completed
--      นี่คือเหตุผลที่ UI แสดงปุ่มของขั้นถัดไปเพียงขั้นเดียว
-- =============================================================
do $$
declare
  ctx record;
  ok  boolean := false;
begin
  select * into ctx from public._track_ctx;

  begin
    update public.transfer_leg set status = 'completed' where id = ctx.leg1_id;
  exception when check_violation then
    ok := true;
  end;

  insert into public._track_result values
    (5, 'K5 ข้าม dispatched -> completed ไม่ได้',
     case when ok then 'PASS' else 'FAIL' end,
     case when ok then 'database ปฏิเสธถูกต้อง'
          else 'ส่งมอบผู้ป่วยที่ยังไม่เคยขึ้นรถได้ ห้าม deploy' end);
end $$;

reset role;


-- =============================================================
-- K6-K8 — ชุดลำเลียงเดินสถานะ 3 ขั้น (on_scene -> in_transit -> arrived)
--         คนที่กดคือคนที่ถูกตั้งเป็น transporter_id ใน K3
-- =============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', (select p_trans::text from public._track_ctx),
                    'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  ctx record;
  leg record;
begin
  select * into ctx from public._track_ctx;

  update public.transfer_leg set status = 'on_scene'
   where id = ctx.leg1_id and status = 'dispatched';
  update public.transfer_leg set status = 'in_transit'
   where id = ctx.leg1_id and status = 'on_scene';
  update public.transfer_leg set status = 'arrived'
   where id = ctx.leg1_id and status = 'in_transit';

  select l.* into leg from public.transfer_leg l where l.id = ctx.leg1_id;

  insert into public._track_result values
    (6, 'K6 ชุดลำเลียงเดินได้ครบ 3 ขั้นถึง arrived',
     case when leg.status = 'arrived' then 'PASS' else 'FAIL' end,
     'status=' || leg.status);

  insert into public._track_result values
    (7, 'K7 เวลา 5 ขั้นแรกครบและเรียงจากน้อยไปมาก',
     case when leg.requested_at  is not null
           and leg.dispatched_at is not null
           and leg.on_scene_at   is not null
           and leg.departed_at   is not null
           and leg.arrived_at    is not null
           and leg.requested_at <= leg.dispatched_at
           and leg.dispatched_at <= leg.on_scene_at
           and leg.on_scene_at   <= leg.departed_at
           and leg.departed_at   <= leg.arrived_at
          then 'PASS' else 'FAIL' end,
     'ครบ 5 เวลา ไม่มีค่าติดลบ');

  -- K8 ฝ่ายแรกส่งมอบพร้อมรายการตรวจ ทบ.466-903 (ปุ่ม "ส่งมอบผู้ป่วย")
  --    ตั้งแต่ 0022 การกดของชุดลำเลียงยัง "ไม่ปิดทอด" — รอผู้รับยืนยันก่อน
  update public.transfer_leg
     set handover_ready_by = ctx.p_trans, docs_ok = true, property_ok = false,
         missing_note = 'ไม่มีบัตรส่งสิ่งของคนไข้ (ทดสอบ)'
   where id = ctx.leg1_id and status = 'arrived';

  select l.* into leg from public.transfer_leg l where l.id = ctx.leg1_id;

  insert into public._track_result values
    (8, 'K8 ชุดลำเลียงส่งมอบแล้ว · ทอดยังไม่ปิด · เก็บรายการตรวจครบ',
     case when leg.status = 'arrived'
            and leg.handover_ready_at is not null
            and leg.handover_at is null
            and leg.docs_ok = true
            and leg.property_ok = false
            and leg.missing_note is not null
          then 'PASS' else 'FAIL' end,
     'ready=' || coalesce(leg.handover_ready_at::text, 'null')
       || ' handover=' || coalesce(leg.handover_at::text, 'null'));
end $$;

reset role;


-- =============================================================
-- K8b — ผู้รับปลายทางยืนยันรับมอบ ทอดจึงปิด (0022 · ส่งมอบสองฝ่าย)
--       ★ ข้อนี้คือหลักฐานว่ากติกา "ต้องกดทั้งสองฝ่าย" ทำงานที่ฐานข้อมูลจริง
--         ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ
-- =============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', (select p_recv::text from public._track_ctx),
                    'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  ctx record;
  leg record;
begin
  select * into ctx from public._track_ctx;

  update public.transfer_leg set status = 'completed'
   where id = ctx.leg1_id and status = 'arrived';

  select l.* into leg from public.transfer_leg l where l.id = ctx.leg1_id;

  insert into public._track_result values
    (108, 'K8b ★ ผู้รับยืนยันแล้วทอดปิด · handover_at ตั้งโดย trigger · หลังเวลาฝ่ายแรก',
     case when leg.status = 'completed'
            and leg.handover_at is not null
            and leg.handover_at >= leg.handover_ready_at
            and leg.handover_ready_by = ctx.p_trans
          then 'PASS' else 'FAIL' end,
     'handover_at=' || coalesce(leg.handover_at::text, 'null'));
end $$;

reset role;


-- =============================================================
-- K9 — เคสปิดเองเมื่อทุกทอดส่งมอบครบ
-- =============================================================
do $$
declare
  ctx record;
  c   record;
begin
  select * into ctx from public._track_ctx;
  select * into c from public."case" where id = ctx.case_id;

  insert into public._track_result values
    (9, 'K9 เคสปิดเองเมื่อทอดสุดท้ายส่งมอบ',
     case when c.status = 'completed' and c.closed_at is not null
          then 'PASS' else 'FAIL' end,
     'case.status=' || c.status || ' closed_at=' || coalesce(c.closed_at::text, 'null'));
end $$;


-- =============================================================
-- K10-K11 — ผู้รับปลายทางเปิดทอดถัดไป (ปุ่ม "ส่งทอดถัดไป")
--           ต้นทางของทอดใหม่คือปลายทางของทอดเดิมเสมอ
--
--           ⚠ ห้าม insert ... returning กับ transfer_leg (HANDOFF §5 ข้อ 10)
--           สร้าง id เองก่อนแล้วอ่านทีหลังเป็นคนละคำสั่ง เหมือนที่ startNextLeg ทำ
-- =============================================================
select set_config('request.jwt.claims',
  json_build_object('sub', (select p_recv::text from public._track_ctx),
                    'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  ctx     record;
  new_id  uuid := gen_random_uuid();
  leg     record;
  cs      public.case_status;
begin
  select * into ctx from public._track_ctx;

  insert into public.transfer_leg (id, case_id, leg_no, from_unit_id, to_unit_id, role_level)
  values (new_id, ctx.case_id, 2, ctx.u_hosp, ctx.u_bde,
          (select role_level from public.unit where id = ctx.u_bde));

  update public._track_ctx set leg2_id = new_id;

  select l.* into leg from public.transfer_leg l where l.id = new_id;
  select c.status into cs from public."case" c where c.id = ctx.case_id;

  insert into public._track_result values
    (10, 'K10 ผู้รับปลายทางเปิดทอดที่ 2 ได้ · ต้นทาง = ปลายทางทอดเดิม',
     case when leg.status = 'pending'
            and leg.leg_no = 2
            and leg.from_unit_id = ctx.u_hosp
          then 'PASS' else 'FAIL' end,
     'leg_no=' || leg.leg_no || ' status=' || leg.status);

  insert into public._track_result values
    (11, 'K11 เคสที่ปิดแล้วกลับมา active เมื่อมีทอดถัดไป',
     case when cs = 'active' then 'PASS' else 'FAIL' end,
     'case.status=' || coalesce(cs::text, 'null'));
end $$;

reset role;


-- =============================================================
-- K12 — ทอดที่ส่งมอบแล้วโผล่ใน v_leg_metrics พร้อมค่าเวลาที่ไม่ติดลบ
--       นี่คือจุดที่ปุ่มในหน้า /track กลายเป็นตัวเลขบนแดชบอร์ด
-- =============================================================
do $$
declare
  ctx record;
  m   record;
begin
  select * into ctx from public._track_ctx;
  select * into m from public.v_leg_metrics where id = ctx.leg1_id;

  insert into public._track_result values
    (12, 'K12 ทอดที่เสร็จเข้า v_leg_metrics · ทุกช่วงเวลาไม่ติดลบ',
     case when m.id is not null
            and m.request_to_dispatch >= interval '0'
            and m.dispatch_to_scene   >= interval '0'
            and m.scene_to_handover   >= interval '0'
            and m.leg_total           >= interval '0'
          then 'PASS' else 'FAIL' end,
     'leg_total=' || coalesce(m.leg_total::text, 'ไม่พบแถว'));
end $$;


-- =============================================================
-- K13 — event_log บันทึกการเปลี่ยนสถานะครบทุกครั้ง (audit trail)
--       ทอดที่ 1 เปลี่ยนสถานะ 5 ครั้ง: dispatched · on_scene · in_transit · arrived · completed
-- =============================================================
do $$
declare
  ctx record;
  n   int;
begin
  select * into ctx from public._track_ctx;

  select count(*) into n from public.event_log
   where leg_id = ctx.leg1_id and action = 'leg.status_changed';

  insert into public._track_result values
    (13, 'K13 event_log บันทึกครบ 5 ครั้งที่สถานะทอดแรกเปลี่ยน',
     case when n = 5 then 'PASS' else 'FAIL' end,
     n || ' รายการ');
end $$;


-- =============================================================
-- K14-K15 — สถานะรถเดินตามทอด (trigger sync_vehicle_status ใน 0016)
--           K15 คือข้อที่จับ bug จริงตอนทดสอบ end-to-end 6 ก.ย. 2569
--           คนที่กดส่งมอบคือชุดลำเลียง/ผู้รับ ซึ่งไม่มีสิทธิ์แก้ตาราง vehicle
--           ถ้าไม่มี trigger รถจะค้าง 'dispatched' ตลอดไปและหายจากรายการรถว่าง
-- =============================================================
do $$
declare
  ctx    record;
  new_id uuid := gen_random_uuid();
  st     public.vehicle_status;
begin
  select * into ctx from public._track_ctx;

  -- ทอดที่ 2 (เปิดไว้ใน K10) จัดรถแล้วเดินจนจบ เพื่อดูสถานะรถทั้งขาไปและขากลับ
  update public.transfer_leg
     set status = 'dispatched', vehicle_id = ctx.v_01, transporter_id = ctx.p_trans
   where id = ctx.leg2_id;

  select v.status into st from public.vehicle v where v.id = ctx.v_01;

  insert into public._track_result values
    (14, 'K14 รถถูกจองเป็น dispatched เมื่อทอดถูกจัดรถ',
     case when st = 'dispatched' then 'PASS' else 'FAIL' end,
     'vehicle.status=' || coalesce(st::text, 'null'));
end $$;

-- สวมบทบาทเป็นชุดลำเลียงซึ่ง "ไม่มีสิทธิ์" แก้ตาราง vehicle ตาม policy vehicle_update
select set_config('request.jwt.claims',
  json_build_object('sub', (select p_trans::text from public._track_ctx),
                    'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  ctx record;
  st  public.vehicle_status;
begin
  select * into ctx from public._track_ctx;

  update public.transfer_leg set status = 'on_scene'   where id = ctx.leg2_id;
  update public.transfer_leg set status = 'in_transit' where id = ctx.leg2_id;
  update public.transfer_leg set status = 'arrived'    where id = ctx.leg2_id;
  -- 0022 · ต้องมีฝ่ายแรกลงชื่อก่อนจึงจะปิดทอดได้
  update public.transfer_leg set handover_ready_by = ctx.p_trans where id = ctx.leg2_id;
  update public.transfer_leg set status = 'completed'  where id = ctx.leg2_id;

  select v.status into st from public.vehicle v where v.id = ctx.v_01;

  insert into public._track_result values
    (15, 'K15 ★ รถคืนเป็น available แม้ผู้กดไม่มีสิทธิ์แก้ตาราง vehicle',
     case when st = 'available' then 'PASS' else 'FAIL' end,
     'vehicle.status=' || coalesce(st::text, 'null'));
end $$;

reset role;


-- =============================================================
-- K16 — trigger ต้องไม่ปลุกรถที่ซ่อมอยู่ให้กลายเป็นว่าง
--       DEMO-04 เป็น 'maintenance' ในข้อมูลจำลอง
-- =============================================================
do $$
declare
  ctx    record;
  new_id uuid := gen_random_uuid();
  v_mnt  uuid := (select id from public.vehicle where call_sign = 'DEMO-04');
  st     public.vehicle_status;
begin
  select * into ctx from public._track_ctx;

  insert into public.transfer_leg (id, case_id, leg_no, from_unit_id, to_unit_id, role_level, vehicle_id)
  values (new_id, ctx.case_id, 3, ctx.u_bde, ctx.u_hosp,
          (select role_level from public.unit where id = ctx.u_hosp), v_mnt);

  update public.transfer_leg set status = 'cancelled' where id = new_id;

  select v.status into st from public.vehicle v where v.id = v_mnt;

  insert into public._track_result values
    (16, 'K16 รถที่ซ่อมอยู่ไม่ถูกปลุกให้ว่างโดยอ้อม',
     case when st = 'maintenance' then 'PASS' else 'FAIL' end,
     'vehicle.status=' || coalesce(st::text, 'null'));
end $$;


-- =============================================================
-- K17 — ★ ชุดลำเลียงจัดรถเองได้ (0022 · คำสั่งเจ้าของโครงการ)
--       เดิม policy leg_update ยอมเฉพาะผู้ที่ถูกตั้งเป็น transporter_id แล้ว
--       แต่ทอดที่ยัง pending มี transporter_id เป็น null เสมอ
--       ชุดลำเลียงจึงจัดรถให้ตัวเองไม่ได้เลย ทั้งที่หน้างานจริงเขารู้ก่อนใคร
--
--       ใช้เคสใหม่แยกต่างหาก ไม่แตะ leg1 เพราะ K13 นับจำนวน event_log
--       ของทอดนั้นไว้พอดี การเดินสถานะเพิ่มจะทำให้ข้อนั้นเพี้ยน
-- =============================================================
reset role;

create table public._k17 (case_id uuid, leg_id uuid);
alter table public._k17 disable row level security;
grant all on public._k17 to public;

do $$
declare
  ctx    record;
  c2     uuid;
  l_new  uuid;
begin
  select * into ctx from public._track_ctx;

  insert into public."case"
    (patient_alias, origin_unit_id, precedence, chief_complaint, created_by, is_synthetic)
  values ('ผู้ป่วยทดสอบ K17', ctx.u_bn_a, 'urgent', 'ทดสอบสิทธิ์จัดรถของชุดลำเลียง',
          ctx.p_send, true)
  returning id into c2;

  insert into public.transfer_leg
    (case_id, leg_no, from_unit_id, to_unit_id, role_level)
  values (c2, 1, ctx.u_bn_a, ctx.u_hosp, 'role_3')
  returning id into l_new;

  insert into public._k17 values (c2, l_new);
end $$;

-- 9900000002 ถือบทบาท transporter อย่างเดียว และยังไม่ถูกตั้งเป็น transporter_id ของทอดนี้
-- สังกัด DEMO-BN-A ซึ่งเป็นต้นทาง ไม่ใช่ปลายทาง จึงไม่เข้าเงื่อนไขเดิมข้อใดเลย
select set_config('request.jwt.claims',
  json_build_object('sub', (select p_trans::text from public._track_ctx),
                    'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  ctx   record;
  k     record;
  n     int;
  st    public.leg_status;
begin
  select * into ctx from public._track_ctx;
  select * into k from public._k17;

  update public.transfer_leg
     set status = 'dispatched',
         vehicle_id = ctx.v_01,
         transporter_id = ctx.p_trans
   where id = k.leg_id and status = 'pending';
  get diagnostics n = row_count;

  select status into st from public.transfer_leg where id = k.leg_id;

  insert into public._track_result values
    (17, 'K17 ★ ชุดลำเลียงจัดรถเองได้ · ไม่ต้องรอศูนย์สั่งการ',
     case when n = 1 and st = 'dispatched' then 'PASS' else 'FAIL' end,
     'แก้ไป ' || n || ' แถว · status=' || coalesce(st::text, 'null'));
end $$;

reset role;


-- =============================================================
-- K18 — ★ ทอดที่จ่ายให้คนอื่นแล้ว transporter คนอื่นต้องกดไม่ได้ (0023)
--       เจ้าของโครงการเจอเองว่า 0022 เปิดกว้างเกินไป
--
--       ใช้ 9900000001 ซึ่งถือบทบาท transporter ด้วย และเป็นคนเปิดเคส
--       แต่ทอดถูกจ่ายให้ 9900000002 ไปแล้วใน K3 — เขาจึงต้องกดอะไรไม่ได้เลย
-- =============================================================
reset role;

do $$
declare
  ctx record;
  c3  uuid;
  l5  uuid;
begin
  select * into ctx from public._track_ctx;

  insert into public."case"
    (patient_alias, origin_unit_id, precedence, chief_complaint, created_by, is_synthetic)
  values ('ผู้ป่วยทดสอบ K18', ctx.u_bn_a, 'urgent', 'ทดสอบสิทธิ์หลังจ่ายทอด',
          ctx.p_send, true)
  returning id into c3;

  -- จ่ายทอดให้ 9900000002 ไปแล้ว และเดินถึง on_scene
  insert into public.transfer_leg
    (case_id, leg_no, from_unit_id, to_unit_id, role_level, vehicle_id, transporter_id, status)
  values (c3, 1, ctx.u_bn_a, ctx.u_hosp, 'role_3', ctx.v_01, ctx.p_trans, 'pending')
  returning id into l5;

  update public.transfer_leg set status = 'dispatched' where id = l5;
  update public.transfer_leg set status = 'on_scene'   where id = l5;

  create table public._k18 (leg_id uuid);
  alter table public._k18 disable row level security;
  grant all on public._k18 to public;
  insert into public._k18 values (l5);
end $$;

-- สวมบทบาท 9900000001 (sender + transporter + receiver · หน่วยต้นทาง)
select set_config('request.jwt.claims',
  json_build_object('sub', (select p_send::text from public._track_ctx),
                    'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  k   record;
  n   int;
  st  public.leg_status;
begin
  select * into k from public._k18;

  -- พยายามเดินขั้นถัดไปของทอดที่ไม่ใช่ของตัวเอง
  update public.transfer_leg set status = 'in_transit'
   where id = k.leg_id and status = 'on_scene';
  get diagnostics n = row_count;

  select status into st from public.transfer_leg where id = k.leg_id;

  insert into public._track_result values
    (18, 'K18 ★ ทอดที่จ่ายให้คนอื่นแล้ว คนที่ไม่ได้ถือทอดกดไม่ได้ แม้มีบทบาท transporter',
     case when n = 0 and st = 'on_scene' then 'PASS' else 'FAIL' end,
     'แก้ไป ' || n || ' แถว · status=' || coalesce(st::text,'null'));
end $$;

reset role;


-- =============================================================
-- ผลรวม — ต้องเป็น PASS ทุกแถว
-- =============================================================
select seq, test, result, note from public._track_result order by seq;

select
  count(*) filter (where result = 'PASS') || '/' || count(*) || ' PASS' as summary,
  case when count(*) filter (where result <> 'PASS') = 0
       then '✅ /track เดินครบวงจร'
       else '🛑 มี FAIL ห้าม deploy' end as verdict
from public._track_result;

rollback;
