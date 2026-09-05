-- =============================================================
-- trigger_test.sql — พิสูจน์ว่า F6 (auto timestamp) ทำงานจริง
-- อ้างอิง Prompt 04 · docs/testing.md §B5
--
-- ทำไมต้องมีไฟล์นี้แยกจาก rls_test.sql
--   seed_demo_cases.sql ใส่ timestamp ลงไปตรงๆ เพื่อให้แดชบอร์ดมีตัวเลขให้ดู
--   จึง "ข้าม" trigger ไปทั้งหมด — ข้อมูลใน seed ไม่ได้พิสูจน์ว่า trigger ทำงาน
--   ไฟล์นี้เดิน status ทีละขั้นเหมือนผู้ใช้กดปุ่มจริง แล้วตรวจว่าเวลาขึ้นเอง
--
-- ต้องรัน migration + seed.sql + seed_profiles.sql ก่อน
-- ทั้งไฟล์อยู่ใน transaction ที่ปิดท้ายด้วย rollback จึงไม่ทิ้งอะไรไว้
-- =============================================================

begin;

create table public._trg_result (seq int, test text, result text, note text);

do $$
declare
  u_a       uuid;
  u_b       uuid;
  u_c       uuid;
  p_sender  uuid;
  c_id      uuid;
  l1        uuid;
  l2        uuid;
  code1     text;
  code2     text;
  rec       record;
  b         boolean;
  c_status  text;
  n_events  int;
begin
  select id into strict u_a from public.unit where code = 'DEMO-BN-A';
  select id into strict u_b from public.unit where code = 'DEMO-BDE';
  select id into strict u_c from public.unit where code = 'DEMO-HOSP';
  select id into strict p_sender from public.profile where service_number = '9900000001';

  -- ---------------------------------------------------------
  -- 1. เปิดเคสโดยไม่ระบุ case_code — trigger ต้องเติมให้
  -- ---------------------------------------------------------
  insert into public."case"
    (patient_alias, origin_unit_id, precedence, chief_complaint, created_by, is_synthetic)
  values ('ผู้ป่วย ทดสอบ', u_a, 'urgent', 'ทดสอบ trigger', p_sender, true)
  returning id, case_code, status into c_id, code1, c_status;

  insert into public._trg_result values
    (1, 'A1 case_code ถูกเติมอัตโนมัติในรูปแบบ MR-25xx-nnnn',
        case when code1 ~ '^MR-2[0-9]{3}-[0-9]{4}$' then 'PASS' else 'FAIL' end, code1),
    (2, 'A2 เคสใหม่มีสถานะ requested (ยังไม่เข้าคิวจัดรถ = ยังไม่ active)',
        case when c_status = 'requested' then 'PASS' else 'FAIL' end, c_status);

  -- เลขรันต้องไม่ซ้ำและต้องเดินหน้า
  insert into public."case"
    (patient_alias, origin_unit_id, precedence, chief_complaint, created_by, is_synthetic)
  values ('ผู้ป่วย ทดสอบ 2', u_a, 'routine', 'ทดสอบเลขรัน', p_sender, true)
  returning case_code into code2;

  insert into public._trg_result values
    (3, 'A3 เลขรัน case_code เดินหน้าไม่ซ้ำ',
        case when code2 <> code1
              and right(code2,4)::int = right(code1,4)::int + 1
             then 'PASS' else 'FAIL' end,
        code1 || ' -> ' || code2);

  -- ---------------------------------------------------------
  -- 2. สร้างทอดที่ 1 แล้วเดิน status ทีละขั้นเหมือนผู้ใช้กดปุ่มจริง
  -- ---------------------------------------------------------
  insert into public.transfer_leg (case_id, leg_no, from_unit_id, to_unit_id, role_level)
  values (c_id, 1, u_a, u_b, 'role_2')
  returning id into l1;

  select (dispatched_at is null and on_scene_at is null and handover_at is null)
    into b from public.transfer_leg where id = l1;
  insert into public._trg_result values
    (4, 'B1 ทอดใหม่ยังไม่มี timestamp ขั้นใดถูกตั้ง',
        case when b then 'PASS' else 'FAIL' end, 'pending');

  update public.transfer_leg set status = 'dispatched' where id = l1;
  update public.transfer_leg set status = 'on_scene'   where id = l1;
  update public.transfer_leg set status = 'in_transit' where id = l1;
  update public.transfer_leg set status = 'arrived'    where id = l1;
  update public.transfer_leg set status = 'completed'  where id = l1;

  select dispatched_at, on_scene_at, departed_at, arrived_at, handover_at
    into rec from public.transfer_leg where id = l1;

  insert into public._trg_result values
    (5, 'B2 timestamp ครบทั้ง 5 ขั้นโดยไม่มีใครกรอกเวลาเลย',
        case when rec.dispatched_at is not null and rec.on_scene_at is not null
              and rec.departed_at is not null and rec.arrived_at is not null
              and rec.handover_at is not null
             then 'PASS' else 'FAIL' end,
        'dispatched=' || (rec.dispatched_at is not null) ||
        ' on_scene='   || (rec.on_scene_at   is not null) ||
        ' departed='   || (rec.departed_at   is not null) ||
        ' arrived='    || (rec.arrived_at    is not null) ||
        ' handover='   || (rec.handover_at   is not null)),
    (6, 'B3 เวลาเรียงจากน้อยไปมาก (response time ติดลบไม่ได้)',
        case when rec.dispatched_at <= rec.on_scene_at
              and rec.on_scene_at   <= rec.departed_at
              and rec.departed_at   <= rec.arrived_at
              and rec.arrived_at    <= rec.handover_at
             then 'PASS' else 'FAIL' end, 'ลำดับถูกต้อง');

  -- ---------------------------------------------------------
  -- 3. สถานะเคสต้องเดินตามสถานะทอด
  -- ---------------------------------------------------------
  select status::text into c_status from public."case" where id = c_id;
  insert into public._trg_result values
    (7, 'C1 ทอดสุดท้ายส่งมอบแล้ว เคสปิดเอง',
        case when c_status = 'completed' then 'PASS' else 'FAIL' end, c_status);

  select (closed_at is not null) into b from public."case" where id = c_id;
  insert into public._trg_result values
    (8, 'C2 closed_at ถูกตั้งโดย trigger',
        case when b then 'PASS' else 'FAIL' end, '');

  -- ---------------------------------------------------------
  -- 4. ผู้รับปลายทางสร้างทอดถัดไป — เคสต้องกลับมา active
  -- ---------------------------------------------------------
  insert into public.transfer_leg (case_id, leg_no, from_unit_id, to_unit_id, role_level)
  values (c_id, 2, u_b, u_c, 'role_3')
  returning id into l2;

  select status::text into c_status from public."case" where id = c_id;
  insert into public._trg_result values
    (9, 'C3 สร้างทอดถัดไปแล้ว เคสที่ปิดไปกลับมา active',
        case when c_status = 'active' then 'PASS' else 'FAIL' end, c_status);

  update public.transfer_leg set status = 'dispatched' where id = l2;
  update public.transfer_leg set status = 'on_scene'   where id = l2;
  update public.transfer_leg set status = 'in_transit' where id = l2;
  update public.transfer_leg set status = 'arrived'    where id = l2;
  update public.transfer_leg set status = 'completed'  where id = l2;

  select status::text into c_status from public."case" where id = c_id;
  insert into public._trg_result values
    (10, 'C4 ทอดที่ 2 จบแล้ว เคสปิดอีกครั้ง',
         case when c_status = 'completed' then 'PASS' else 'FAIL' end, c_status);

  -- ---------------------------------------------------------
  -- 5. audit trail
  -- ---------------------------------------------------------
  select count(*)::int into n_events
  from public.event_log where case_id = c_id and action = 'leg.status_changed';
  insert into public._trg_result values
    (11, 'D1 event_log บันทึกการเปลี่ยนสถานะครบ 10 ครั้ง (2 ทอด x 5 ขั้น)',
         case when n_events = 10 then 'PASS' else 'FAIL' end, n_events || ' แถว');

  select count(*)::int into n_events
  from public.event_log where case_id = c_id and action = 'case.created';
  insert into public._trg_result values
    (12, 'D2 event_log บันทึกการเปิดเคส',
         case when n_events = 1 then 'PASS' else 'FAIL' end, n_events || ' แถว');

  -- ---------------------------------------------------------
  -- 6. ข้าม status ไม่ได้ — constraint เวลาต้องปฏิเสธ
  -- ---------------------------------------------------------
  declare
    l3 uuid;
    skipped boolean := false;
  begin
    insert into public.transfer_leg (case_id, leg_no, from_unit_id, to_unit_id, role_level)
    values (c_id, 3, u_a, u_c, 'role_3') returning id into l3;
    begin
      update public.transfer_leg set status = 'completed' where id = l3;
    exception when check_violation then skipped := true;
    end;
    insert into public._trg_result values
      (13, 'E1 ข้าม pending -> completed ไม่ได้ (ส่งมอบผู้ป่วยที่ไม่เคยไปรับ)',
           case when skipped then 'PASS' else 'FAIL' end,
           case when skipped then 'database ปฏิเสธถูกต้อง'
                else 'ข้ามขั้นได้ ตัวเลขแดชบอร์ดจะมีรูโหว่' end);
  end;

  -- ---------------------------------------------------------
  -- 7. ยกเลิกทอดต้องไม่ทำให้เคสกลายเป็น completed
  -- ---------------------------------------------------------
  declare
    c2_id uuid;
    l4    uuid;
  begin
    insert into public."case"
      (patient_alias, origin_unit_id, precedence, chief_complaint, created_by, is_synthetic)
    values ('ผู้ป่วย ทดสอบ 3', u_a, 'routine', 'ทดสอบการยกเลิก', p_sender, true)
    returning id into c2_id;

    insert into public.transfer_leg (case_id, leg_no, from_unit_id, to_unit_id, role_level)
    values (c2_id, 1, u_a, u_b, 'role_2') returning id into l4;

    update public.transfer_leg set status = 'cancelled' where id = l4;

    select status::text into c_status from public."case" where id = c2_id;
    insert into public._trg_result values
      (14, 'F1 ทุกทอดถูกยกเลิก เคสกลายเป็น cancelled ไม่ใช่ completed',
           case when c_status = 'cancelled' then 'PASS' else 'FAIL' end, c_status);
  end;
end $$;


-- =============================================================
-- ผลรวม — ต้องเป็น PASS ทุกแถว
-- =============================================================
select seq, test, result, note from public._trg_result order by seq;

select
  count(*) filter (where result = 'PASS') || '/' || count(*) || ' PASS' as summary,
  case when count(*) filter (where result <> 'PASS') = 0
       then '✅ trigger ทำงานครบ F6 ใช้งานได้จริง'
       else '🛑 มี FAIL — เวลาบนแดชบอร์ดเชื่อถือไม่ได้' end as verdict
from public._trg_result;

rollback;
