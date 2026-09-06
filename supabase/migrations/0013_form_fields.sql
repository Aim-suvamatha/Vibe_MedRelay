-- =============================================================
-- 0013_form_fields.sql — คอลัมน์ที่แบบฟอร์มกระดาษมี แต่ schema เดิมยังไม่มี
--
-- ทำไมเพิ่มคอลัมน์ในตารางเดิม แทนที่จะแตกตารางตาม field_casualty_db_schema.pdf
--   schema อ้างอิงแยก CASUALTY กับ EVAC_REQUEST เป็นสองตาราง
--   แต่ในทางปฏิบัติหนึ่งเคสมีคำขอส่งกลับหนึ่งใบ ความสัมพันธ์เป็น 1:1
--   การแตกตารางจึงเพิ่ม join ทุก query โดยไม่ได้อะไรกลับมา
--   และตาราง "case" เดิมมี RLS, trigger, view ที่ทดสอบผ่านแล้ว การเพิ่มคอลัมน์เสี่ยงน้อยกว่ามาก
--   ถ้าวันหนึ่งต้องรองรับ "ขอส่งกลับซ้ำหลายใบต่อหนึ่งเคส" ค่อยแตกตารางตอนนั้น
--
-- ⚠ สิ่งที่ตั้งใจ "ไม่" เพิ่ม
--   ตาราง PERSONNEL (ยศ-ชื่อ-สกุล · หมู่เลือด · แพ้ยา · โรคประจำตัว) ของผู้ป่วย
--   ขัด AI_RULES.md §3.1 โดยตรง เฟส prototype ใช้ case_code + patient_alias เท่านั้น
--   ตาราง DEATH_RECORD (ทบ.466-904 ใบชันสูตรพลิกศพ) เป็นเอกสารที่มีผลทางกฎหมาย
--   ต้องผ่านนายทหารพระธรรมนูญก่อน เฟสนี้บันทึกแค่ outcome = 'died'
-- =============================================================

-- -------------------------------------------------------------
-- case — ข้อมูลเหตุการณ์ · คำขอส่งกลับ · ผลการจำหน่าย
-- -------------------------------------------------------------
alter table public."case"
  -- ── หมวดสำหรับรายงาน ทบ.466-900 (F7 export) ─────────────────
  -- ต้องเก็บตั้งแต่ตอนสร้างเคส ไม่งั้นตอนออกรายงานต้องมานั่งจัดหมวดย้อนหลังทีละเคส
  add column report_category    public.report_category,
  add column patient_rank_group public.rank_group,

  -- ── เหตุการณ์ (ทบ.466-901 ด้านหลัง ช่องสาเหตุการบาดเจ็บ) ────
  add column hostile_action     boolean,   -- เกิดจากการกระทำของฝ่ายตรงข้ามหรือไม่
  add column on_duty            boolean,   -- ขณะปฏิบัติหน้าที่หรือไม่
  add column injury_place       text,      -- ช่อง (สถานที่) เช่น 'ฐานเนิน 350'
  add column injury_grid        text,      -- พิกัดจุดเกิดเหตุ กรอกด้วยมือ ไม่ใช่ GPS อัตโนมัติ

  -- แผนภาพร่างกายและอุปกรณ์ป้องกันในแบบฟอร์ม เก็บเป็น jsonb เพราะเป็นรายการที่ผู้ใช้ติ๊กหลายช่อง
  -- injury_sites   [{"site":"right_arm","type":"laceration"}]  type ตามรหัสท้ายแบบฟอร์ม
  --                กห=fracture · หป=open_fracture · หม=burn · ฉ=laceration · ถ=abrasion
  -- protective_gear ["helmet","body_armor"]  ตามช่องติ๊ก 7 ช่องในแบบฟอร์ม
  add column injury_sites       jsonb not null default '[]'::jsonb,
  add column protective_gear    jsonb not null default '[]'::jsonb,

  -- ── คำขอส่งกลับ (ทบ.466-902 + คำขอ MEDEVAC 9 บรรทัด) ────────
  add column patient_mobility   public.patient_mobility,
  add column transport_mode     public.transport_mode,
  add column pickup_grid        text,   -- จุดนัดรับที่กำหนดไว้ล่วงหน้า ไม่ใช่ตำแหน่งเรียลไทม์ของบุคคล
  add column pickup_marking     text,   -- วิธีแสดงจุด เช่น 'พลุควันเขียว'
  add column security_status    public.security_status,
  add column nbc_status         public.nbc_status not null default 'none',
  add column approved_by        uuid references public.profile(id),
  add column approved_at        timestamptz,   -- ⏱ ตั้งโดย trigger ห้ามกรอกมือ

  -- ── ผลการจำหน่าย (DISPOSITION) ──────────────────────────────
  add column outcome            public.case_outcome,
  add column disposition_route  public.disposition_route,
  add column dest_unit_id       uuid references public.unit(id),
  add column icd10              text,
  add column disposed_at        timestamptz,   -- ⏱ ตั้งโดย trigger ห้ามกรอกมือ
  add column feedback_note      text;          -- ข้อมูลย้อนกลับถึงหน่วยต้นทาง

alter table public."case"
  -- jsonb สองช่องนี้ต้องเป็น array เท่านั้น ไม่งั้น UI ที่ map() จะพังตอน runtime
  add constraint case_injury_sites_is_array
    check (jsonb_typeof(injury_sites) = 'array'),
  add constraint case_protective_gear_is_array
    check (jsonb_typeof(protective_gear) = 'array'),
  -- เวลาต้องมาคู่กับเหตุการณ์ที่ทำให้เกิดเวลานั้นเสมอ
  add constraint case_approved_pair
    check ((approved_by is null) = (approved_at is null)),
  add constraint case_disposed_needs_outcome
    check (disposed_at is null or outcome is not null),
  add constraint case_icd10_format
    check (icd10 is null or icd10 ~ '^[A-TV-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$');

-- รายงานประจำวันกรองด้วยสองคอลัมน์นี้เสมอ
create index case_report_idx on public."case"(report_category, requested_at);
create index case_outcome_idx on public."case"(outcome) where outcome is not null;

comment on column public."case".injury_grid is
  'พิกัดจุดเกิดเหตุ กรอกด้วยมือหรือเลือกจากจุดที่กำหนดไว้ ห้ามดึงจาก GPS อัตโนมัติ (AI_RULES §3.1)';
comment on column public."case".pickup_grid is
  'จุดนัดรับที่กำหนดไว้ล่วงหน้า ไม่ใช่ตำแหน่งเรียลไทม์ของบุคคล (AI_RULES §3.1)';

-- -------------------------------------------------------------
-- transfer_leg — รายการตรวจก่อนส่งมอบ (HANDOVER ใน schema อ้างอิง)
-- ทั้งสามช่องมาจาก ทบ.466-903 ที่มีช่องลงนามผู้ส่งและผู้รับ
-- ไม่แตกเป็นตาราง handover เพราะหนึ่งทอดมีการส่งมอบครั้งเดียว และ transfer_leg
-- มี handover_at กับ receiver_id อยู่แล้ว
-- -------------------------------------------------------------
alter table public.transfer_leg
  add column docs_ok      boolean,   -- เอกสารเคสครบ
  add column property_ok  boolean,   -- สิ่งของและอาวุธครบ
  add column missing_note text,      -- ถ้าไม่ครบ ขาดอะไร
  add column delay_reason text;      -- เหตุที่ล่าช้า ใช้วิเคราะห์คอขวดบนแดชบอร์ด

-- -------------------------------------------------------------
-- assessment — ระดับความรู้สึกตัว
-- แบบฟอร์มกระดาษใช้ ด/ร/จ/ม ซึ่งจดได้เร็วกว่า GCS มาก
-- เก็บทั้งสองช่อง เพราะ Role 1 มักจดแค่ AVPU ส่วน Role 2 ขึ้นไปจึงจะได้ GCS
-- -------------------------------------------------------------
alter table public.assessment
  add column avpu public.avpu_level;

-- -------------------------------------------------------------
-- unit — ข้อมูลสถานพยาบาล (FACILITY ใน schema อ้างอิง)
-- -------------------------------------------------------------
alter table public.unit
  add column grid_ref      text,
  add column bed_available int check (bed_available >= 0);

comment on column public.unit.bed_available is
  'เตียงว่าง ณ ปัจจุบัน อัปเดตด้วยมือโดยหน่วยเจ้าของ ใช้แสดงบนแดชบอร์ดศูนย์สั่งการ';

-- =============================================================
-- trigger — เวลาทุกตัวเกิดจากการกดปุ่ม ไม่มีช่องกรอกเวลา (หลักการเดิมจาก Prompt 04)
-- =============================================================
create or replace function public.set_case_form_timestamps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- เขียนทับค่าที่ client ส่งมาเสมอในทุกกรณี ไม่ใช่แค่กรณีที่ค่าเดิมเป็น null
  -- ถ้าใช้ coalesce(new.disposed_at, now()) client จะยัดเวลาปลอมเข้ามาได้
  -- และถ้าเช็คเฉพาะตอนเปลี่ยนจาก null client ก็ยังแก้เวลาของเคสที่จำหน่ายไปแล้วได้
  -- ตัวเลข response time บนแดชบอร์ดจึงต้องเชื่อไม่ได้ — นี่คือเหตุผลของ Prompt 04 ทั้งข้อ

  -- อนุมัติคำขอ
  if new.approved_by is null then
    new.approved_at := null;
  elsif old.approved_by is null then
    new.approved_at := now();          -- เพิ่งอนุมัติ
  else
    new.approved_at := old.approved_at; -- อนุมัติไปแล้ว เวลาเดิมห้ามขยับ
  end if;

  -- จำหน่ายผู้ป่วย
  if new.outcome is null then
    new.disposed_at := null;
  elsif old.outcome is null then
    new.disposed_at := now();           -- เพิ่งจำหน่าย
  else
    new.disposed_at := old.disposed_at; -- จำหน่ายไปแล้ว เวลาเดิมห้ามขยับ
  end if;

  return new;
end;
$$;

create trigger case_form_timestamps
  before update on public."case"
  for each row
  execute function public.set_case_form_timestamps();

-- =============================================================
-- RLS — ปลายทางเป็นคนบันทึกผลการจำหน่าย ไม่ใช่ต้นทาง
-- policy เดิมให้เฉพาะผู้สร้างเคส monitor และ admin แก้ได้
-- แต่คนที่รู้ว่าผู้ป่วยหายหรือคงพยาบาลคือ receiver ที่ปลายทาง
-- =============================================================
drop policy if exists case_update on public."case";

create policy case_update on public."case"
  for update to authenticated
  using (
    created_by = auth.uid()
    or public.has_role('monitor')
    or public.has_role('admin')
    -- receiver ที่มองเห็นเคสนี้อยู่แล้วตาม can_see_case (เป็นผู้รับของทอดใดทอดหนึ่ง
    -- หรืออยู่หน่วยปลายทาง) จึงบันทึกผลการจำหน่ายได้
    or (public.has_role('receiver') and public.can_see_case(id))
  )
  with check (
    created_by = auth.uid()
    or public.has_role('monitor')
    or public.has_role('admin')
    or (public.has_role('receiver') and public.can_see_case(id))
  );
