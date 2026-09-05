-- =============================================================
-- 0006_transfer_leg.sql — ทอดการส่งกลับ (หัวใจของ schema)
-- อ้างอิง DATABASE.md §3.5
--
-- ทำไมต้องแยกจาก case: การส่งกลับจริงมี 2-4 ทอด
--   ถ้ารวมเป็นตารางเดียว จะเก็บได้แค่ทอดเดียวต่อเคส
--   การส่งกลับจากการรบ (4 ทอด) จะต้องสร้างเคสใหม่ทุกทอด
--   ทำให้ผูกผลประเมินแรกรับข้ามทอดไม่ได้ ซึ่งเป็นปัญหาหลักที่ระบบนี้แก้
--
-- ⏱ timestamp ทุกตัวตั้งโดย trigger ใน 0009 จากการเปลี่ยน status เท่านั้น
--   ไม่มีช่องให้ผู้ใช้กรอกเวลาด้วยมือที่ใดในระบบ
-- =============================================================

create table public.transfer_leg (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public."case"(id) on delete cascade,
  leg_no          int not null check (leg_no >= 1),
  from_unit_id    uuid not null references public.unit(id),
  to_unit_id      uuid not null references public.unit(id),
  role_level      public.role_of_care not null,   -- ระดับชั้นการรักษาของปลายทางทอดนี้
  vehicle_id      uuid references public.vehicle(id) on delete set null,
  transporter_id  uuid references public.profile(id) on delete set null,
  receiver_id     uuid references public.profile(id) on delete set null,
  evac_director   text,                           -- แพทย์ผู้อำนวยการส่งกลับ (field ไม่ต้อง login)
  status          public.leg_status not null default 'pending',

  -- ⏱ ตั้งโดย trigger set_leg_timestamps เท่านั้น
  requested_at    timestamptz not null default now(),
  dispatched_at   timestamptz,
  on_scene_at     timestamptz,
  departed_at     timestamptz,
  arrived_at      timestamptz,
  handover_at     timestamptz,

  note            text,
  client_uuid     uuid unique,
  created_at      timestamptz not null default now(),

  constraint leg_unique_per_case unique (case_id, leg_no),
  constraint leg_units_differ check (from_unit_id <> to_unit_id),

  -- ---------------------------------------------------------------
  -- leg_time_order — ทำให้ตัวเลข response time เชื่อถือได้เชิงโครงสร้าง
  --
  -- ⚠ ต่างจาก DATABASE.md §3.5 โดยเจตนา — ฉบับในเอกสารเขียนว่า
  --     (handover_at is null or handover_at >= arrived_at)
  --   ถ้า arrived_at เป็น NULL การเปรียบเทียบจะได้ NULL ไม่ใช่ false
  --   และ CHECK constraint ถือว่า NULL = ผ่าน
  --   ผลคือใส่ handover_at โดยไม่มี arrived_at ได้ ซึ่งขัดกับ
  --   acceptance test ของ Prompt 03 ที่ระบุว่า database ต้องปฏิเสธ
  --
  -- ฉบับนี้บังคับสองอย่าง
  --   1. เวลาต้องเรียงจากน้อยไปมาก (response time ติดลบไม่ได้)
  --   2. ขั้นถัดไปตั้งได้ก็ต่อเมื่อขั้นก่อนหน้าถูกตั้งแล้ว
  --      (ส่งมอบผู้ป่วยที่ยังไม่เคยไปถึงไม่ได้)
  --
  -- ผลข้างเคียงที่ตั้งใจ: การข้าม status เช่น pending -> completed
  -- จะถูก database ปฏิเสธ UI ต้องเดิน status ตามลำดับ
  -- ---------------------------------------------------------------
  constraint leg_time_order check (
        (dispatched_at is null or dispatched_at >= requested_at)
    and (on_scene_at   is null or (dispatched_at is not null and on_scene_at >= dispatched_at))
    and (departed_at   is null or (on_scene_at   is not null and departed_at >= on_scene_at))
    and (arrived_at    is null or (departed_at   is not null and arrived_at  >= departed_at))
    and (handover_at   is null or (arrived_at    is not null and handover_at >= arrived_at))
  )
);

create index leg_case_idx    on public.transfer_leg(case_id, leg_no);
create index leg_status_idx  on public.transfer_leg(status, requested_at desc);
create index leg_to_unit_idx on public.transfer_leg(to_unit_id, status);
-- ใช้โดย can_see_case() และหน้า "ภารกิจของฉัน" ของ transporter
create index leg_transporter_idx on public.transfer_leg(transporter_id) where transporter_id is not null;
create index leg_receiver_idx    on public.transfer_leg(receiver_id)    where receiver_id    is not null;
create index leg_from_unit_idx   on public.transfer_leg(from_unit_id);
