-- =============================================================
-- 0009_functions_triggers.sql — เวลาที่เกิดขึ้นเอง
-- อ้างอิง DATABASE.md §4 · Prompt 04
--
-- ทำไมต้องใช้ trigger แทนการให้ frontend ส่งเวลามา
--   1. นาฬิกาเครื่องผู้ใช้ตั้งเองได้และไม่ตรงกัน — เวลาจาก 4 บทบาท
--      4 เครื่องจะเทียบกันไม่ได้ ทำให้ response time บนแดชบอร์ดติดลบได้
--   2. เวลาที่ frontend ส่งมาคือเวลาที่ "กดปุ่ม" ซึ่งแก้ได้ก่อนส่ง
--      เวลาที่ database ตั้งเองคือเวลาที่ "เหตุการณ์ถูกบันทึก" ซึ่งแก้ไม่ได้
--   3. ถ้ามีช่องกรอกเวลา ผู้ใช้จะกรอกย้อนหลัง ซึ่งพาเรากลับไปที่ปัญหาเดิม
--      คือสมุดเวรที่เขียนตอนจบเวร
--
-- ทุก function ที่แก้ตารางอื่นต้องเป็น security definer
-- เพราะผู้ใช้ที่ trigger ตัวนี้ทำงานแทน (เช่น transporter ที่กดส่งมอบ)
-- ไม่มีสิทธิ์ update ตาราง "case" ตาม RLS policy ใน 0010
-- =============================================================


-- -------------------------------------------------------------
-- 1. set_leg_timestamps — ตั้ง timestamp ตามสถานะที่เปลี่ยน
--    coalesce ไว้เพื่อไม่ทับค่าเดิม ถ้าย้อน status กลับแล้วเดินหน้าใหม่
-- -------------------------------------------------------------
create or replace function public.set_leg_timestamps()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    case new.status
      when 'dispatched' then new.dispatched_at := coalesce(new.dispatched_at, now());
      when 'on_scene'   then new.on_scene_at   := coalesce(new.on_scene_at,   now());
      when 'in_transit' then new.departed_at   := coalesce(new.departed_at,   now());
      when 'arrived'    then new.arrived_at    := coalesce(new.arrived_at,    now());
      when 'completed'  then new.handover_at   := coalesce(new.handover_at,   now());
      else null;
    end case;
  end if;
  return new;
end $$;

create trigger trg_leg_timestamps
  before update on public.transfer_leg
  for each row execute function public.set_leg_timestamps();


-- -------------------------------------------------------------
-- 2. sync_case_status — สถานะของเคสตามสถานะของทอด
--
--    ต่างจาก close_case_when_last_leg_done ใน DATABASE.md §4 สองข้อ
--    (ก) เพิ่ม security definer — ฉบับในเอกสารจะล้มเหลวเมื่อผู้กดส่งมอบ
--        เป็น transporter ซึ่งไม่มีสิทธิ์ update ตาราง "case" ตาม RLS
--    (ข) เพิ่มการเลื่อนสถานะ requested -> active เมื่อทอดแรกออกเดินทาง
--        และแยกกรณีที่ทุกทอดถูก cancelled ออกจากกรณีที่ส่งมอบสำเร็จ
-- -------------------------------------------------------------
create or replace function public.sync_case_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  open_legs int;
  done_legs int;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select
    count(*) filter (where status not in ('completed','cancelled')),
    count(*) filter (where status = 'completed')
  into open_legs, done_legs
  from public.transfer_leg
  where case_id = new.case_id;

  if open_legs = 0 then
    if done_legs > 0 then
      -- ส่งมอบครบทุกทอดแล้ว
      update public."case"
        set status = 'completed', closed_at = coalesce(closed_at, now())
        where id = new.case_id and status <> 'completed';
    else
      -- ทุกทอดถูกยกเลิก
      update public."case"
        set status = 'cancelled', closed_at = coalesce(closed_at, now())
        where id = new.case_id and status <> 'cancelled';
    end if;
  elsif new.status <> 'pending' then
    update public."case"
      set status = 'active', closed_at = null
      where id = new.case_id and status = 'requested';
  end if;

  return new;
end $$;

create trigger trg_sync_case_status
  after update on public.transfer_leg
  for each row execute function public.sync_case_status();


-- -------------------------------------------------------------
-- 3. reopen_case_on_new_leg — เปิดเคสที่ปิดไปแล้วเมื่อมีทอดถัดไป
--
--    จำเป็นเพราะ workflow ใน PROJECT.md §4.2 ให้ผู้รับปลายทางเป็นคน
--    ตัดสินใจว่าต้องส่งทอดถัดไปหรือไม่ "หลัง" รับมอบเสร็จ
--    เคสจึงถูกปิดไปก่อนแล้วในจังหวะที่ทอดก่อนหน้าเป็น completed
--
--    แตะเฉพาะเคสที่ status = 'completed' เท่านั้น ห้ามรวม 'requested'
--    มิฉะนั้นเคสที่ sender เพิ่งเปิดจะกลายเป็น active ทันทีที่สร้างทอดแรก
--    และคิวคำขอของศูนย์สั่งการ (F2) จะไม่มีอะไรค้างให้จัดรถเลย
-- -------------------------------------------------------------
create or replace function public.reopen_case_on_new_leg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public."case"
    set status = 'active', closed_at = null
    where id = new.case_id and status = 'completed';
  return new;
end $$;

create trigger trg_reopen_case_on_new_leg
  after insert on public.transfer_leg
  for each row execute function public.reopen_case_on_new_leg();


-- -------------------------------------------------------------
-- 4. log_leg_status — audit trail ทุกครั้งที่สถานะทอดเปลี่ยน
--
--    actor_id ผูก FK กับ profile จึงต้องกรองก่อนว่า auth.uid()
--    มี profile จริงหรือไม่ มิฉะนั้น insert จาก SQL Editor หรือ seed
--    (ซึ่ง auth.uid() เป็น null หรือไม่มี profile) จะทำให้ trigger ล้ม
-- -------------------------------------------------------------
create or replace function public.log_leg_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.event_log (case_id, leg_id, actor_id, action, from_value, to_value, payload)
    values (
      new.case_id,
      new.id,
      (select p.id from public.profile p where p.id = auth.uid()),
      'leg.status_changed',
      old.status::text,
      new.status::text,
      jsonb_build_object('leg_no', new.leg_no, 'to_unit_id', new.to_unit_id)
    );
  end if;
  return new;
end $$;

create trigger trg_log_leg_status
  after update on public.transfer_leg
  for each row execute function public.log_leg_status();


-- -------------------------------------------------------------
-- 5. log_case_created — audit trail ของการเปิดเคส
-- -------------------------------------------------------------
create or replace function public.log_case_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.event_log (case_id, actor_id, action, to_value, payload)
  values (
    new.id,
    (select p.id from public.profile p where p.id = auth.uid()),
    'case.created',
    new.status::text,
    jsonb_build_object('case_code', new.case_code, 'precedence', new.precedence)
  );
  return new;
end $$;

create trigger trg_log_case_created
  after insert on public."case"
  for each row execute function public.log_case_created();


-- -------------------------------------------------------------
-- 6. case_code — 'MR-2569-0001' เลขรันตามปี พ.ศ.
--
--    ใช้ตารางนับแทน sequence เพราะต้องรีเซ็ตเลขทุกปี พ.ศ.
--    insert ... on conflict do update จับ row lock ให้เอง
--    การสร้างเคสพร้อมกันหลาย request จึงได้เลขไม่ซ้ำโดยไม่ต้องล็อกทั้งตาราง
--
--    ปี พ.ศ. คำนวณจากเวลาไทยเสมอ ไม่ใช่ UTC
--    มิฉะนั้นเคสที่เปิดหลังเที่ยงคืนวันปีใหม่จะได้เลขปีก่อน
-- -------------------------------------------------------------
create table public.case_code_counter (
  buddhist_year int primary key,
  last_no       int not null default 0
);

-- ไม่มี policy ใดๆ โดยเจตนา — เข้าถึงได้ผ่าน next_case_code() ที่เป็น
-- security definer เท่านั้น ผู้ใช้แก้เลขรันเองไม่ได้
alter table public.case_code_counter enable row level security;

create or replace function public.next_case_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  by_year int;
  n       int;
begin
  by_year := extract(year from (now() at time zone 'Asia/Bangkok'))::int + 543;

  insert into public.case_code_counter as c (buddhist_year, last_no)
  values (by_year, 1)
  on conflict (buddhist_year)
    do update set last_no = c.last_no + 1
  returning c.last_no into n;

  return 'MR-' || by_year::text || '-' || lpad(n::text, 4, '0');
end $$;

create or replace function public.set_case_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.case_code is null or btrim(new.case_code) = '' then
    new.case_code := public.next_case_code();
  end if;
  return new;
end $$;

create trigger trg_case_code
  before insert on public."case"
  for each row execute function public.set_case_code();


-- -------------------------------------------------------------
-- 7. touch_updated_at — ใช้กับ vehicle
-- -------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_vehicle_updated_at
  before update on public.vehicle
  for each row execute function public.touch_updated_at();
