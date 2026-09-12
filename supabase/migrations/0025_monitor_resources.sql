-- =============================================================
-- 0025_monitor_resources.sql — ทรัพยากรของศูนย์สั่งการ และการอนุมัติส่งกลับทางอากาศ
--
-- เจ้าของโครงการนิยามบทบาท monitor ว่าเป็นผู้ควบคุมกระบวนการส่งกลับทั้งหมด
-- โดยไม่เกี่ยวกับการรักษา หน้าที่คือจัดสรรทรัพยากร 5 อย่าง
--   นายสิบพยาบาล · รถพยาบาล · จุดส่งกลับ · เส้นทาง · และการอนุมัติใช้อากาศยาน
--
-- schema เดิมรองรับไปแล้วสามอย่างครึ่ง
--   รถ            → ตาราง vehicle (0004)
--   จุดส่งกลับ     → ตาราง unit + unit.bed_available/grid_ref (0002 + 0013)
--   เส้นทาง        → transfer_leg.from_unit_id → to_unit_id + view v_leg_metrics (0011/0017)
--   คำขอทางอากาศ  → case.transport_mode มีค่า 'rotary'/'fixed_wing' อยู่แล้ว (0012/0013)
--
-- ไฟล์นี้เติมสองส่วนที่ยังไม่มีจริง
--   1. การ "ตัดสิน" คำขอทางอากาศ — เดิมมีแต่คำขอ ไม่มีใครอนุมัติหรือปฏิเสธได้
--   2. จำนวนกำลังพลสายแพทย์เป็นตัวเลข — เดิมมีแต่ vehicle.crew_note ที่เป็นข้อความอิสระ
--      ('พลขับ 1 · นายสิบพยาบาล 1 · พลเปล 2') ซึ่งรวมยอดไม่ได้
--
-- ⚠ ทำไมประกาศ enum ในไฟล์เดียวกับที่ใช้ได้ — ต่างจากกฎใน 0018
--   ข้อห้ามใน 0018 คือ **alter type ... add value** ซึ่งห้ามใช้ค่าที่เพิ่งเพิ่ม
--   ภายใน transaction เดียวกัน (sql.mjs ห่อทั้งไฟล์ด้วย begin/commit)
--   ไฟล์นี้ใช้ **create type** ซึ่งเป็น type ใหม่ทั้งตัว PostgreSQL ยอมให้ใช้ได้ทันที
--   จึงไม่ต้องแยกไฟล์ ถ้าวันหน้าต้องเพิ่มค่าให้ air_decision ต้องแยกไฟล์ตามกฎ 0018
--
-- ⚠ ไฟล์นี้ backward compatible โดยเจตนา
--   คอลัมน์ใหม่ทุกตัวเป็น nullable หรือมี default และ constraint ใหม่ทุกข้อ
--   ผ่านสำหรับแถวที่มีอยู่แล้วทั้งหมด → รัน migration ก่อน push ได้โดยไม่ทำ production เดิมพัง
-- =============================================================


-- -------------------------------------------------------------
-- 1. การตัดสินใจส่งกลับทางอากาศ
--
-- ★ ทำไมไม่มีค่า 'pending' ใน enum
--   "รออนุมัติ" คำนวณได้จากข้อเท็จจริงที่มีอยู่แล้ว —
--     transport_mode เป็นอากาศยาน  และ  air_decision is null  และ  เคสยังไม่ปิด
--   ถ้าเก็บเป็นค่าในคอลัมน์ด้วย จะมีแหล่งความจริงสองที่สำหรับข้อเท็จจริงเดียวกัน
--   แล้วต้องคอยไล่ sync กับ transport_mode ทุกครั้งที่มีคนแก้คำขอ
--   (เหตุผลชุดเดียวกับที่ 0013 ไม่แตกตาราง EVAC_REQUEST ออกมา)
--
-- ★ ทำไม air_mode_granted แยกจาก transport_mode
--   หลักการเดียวกับที่ 0012 แยก transport_mode (สิ่งที่หน่วย "ขอ")
--   ออกจาก vehicle_type (สิ่งที่ศูนย์สั่งการ "จ่ายจริง")
--   ศูนย์สั่งการปฏิเสธ ฮ. แล้วอนุมัติให้ไปทางรถแทนได้ ซึ่งเป็นคำตอบที่พบบ่อยที่สุด
--   ถ้าทับ transport_mode ทิ้ง เวชระเบียนจะตอบไม่ได้ว่าหน่วยหน้าขออะไรมาตอนแรก
-- -------------------------------------------------------------
create type public.air_decision as enum ('approved', 'denied');

alter table public."case"
  add column air_decision      public.air_decision,   -- null = ยังไม่มีใครตัดสิน
  add column air_decision_by   uuid references public.profile(id),
  add column air_decision_at   timestamptz,           -- ⏱ ตั้งโดย trigger ห้ามกรอกมือ
  add column air_decision_note text,                  -- เหตุผล — บังคับเมื่อไม่อนุมัติ
  add column air_mode_granted  public.transport_mode; -- โหมดที่อนุมัติให้ใช้จริง

alter table public."case"
  -- เวลาและผู้ตัดสินต้องมาคู่กับการตัดสินเสมอ (รูปแบบเดียวกับ case_approved_pair ใน 0013)
  add constraint case_air_decision_by_pair
    check ((air_decision is null) = (air_decision_by is null)),
  add constraint case_air_decision_at_pair
    check ((air_decision is null) = (air_decision_at is null)),
  -- ไม่อนุมัติแล้วไม่บอกเหตุผล = ข้อมูลหายเงียบ ซึ่งเป็นสิ่งที่ระบบนี้ห้ามทุกที่
  -- หน่วยที่ถูกปฏิเสธต้องรู้ว่าเพราะอะไร ไม่งั้นเขาจะขอซ้ำด้วยคำขอเดิม
  add constraint case_air_denied_needs_note
    check (air_decision is distinct from 'denied' or air_decision_note is not null);

-- คิวของศูนย์สั่งการกรองด้วยสองคอลัมน์นี้เสมอ
create index case_air_pending_idx
  on public."case"(transport_mode)
  where air_decision is null;

comment on column public."case".air_decision is
  'ผลการตัดสินคำขอส่งกลับทางอากาศโดยศูนย์สั่งการ · null = ยังไม่ตัดสิน (สถานะ "รออนุมัติ" คำนวณจาก transport_mode)';
comment on column public."case".air_mode_granted is
  'ยานพาหนะที่อนุมัติให้ใช้จริง ต่างจาก transport_mode ที่เป็นสิ่งที่หน่วยขอมา';


-- -------------------------------------------------------------
-- 2. trigger — เติมการตีตราเวลาให้ air_decision
--
-- 🔴 ฟังก์ชันนี้ประกาศครั้งแรกใน 0013 และยังดูแล approved_at กับ disposed_at อยู่
--    ฉบับนี้คัดลอกของเดิมมาทั้งดุ้นแล้วเติมบล็อกที่สาม **ห้ามเขียนใหม่จากศูนย์**
--    ถ้าสองบล็อกเดิมหายไป เวลาอนุมัติและเวลาจำหน่ายจะหยุดทำงานเงียบๆ
--    โดยไม่มี error ให้เห็น และ constraint ก็จับไม่ได้เพราะ null ผ่าน check เสมอ
--
--    trigger case_form_timestamps ที่ผูกกับฟังก์ชันนี้ไม่ต้องสร้างใหม่
--    create or replace function เปลี่ยนตัวฟังก์ชันในที่เดิม trigger ชี้ตามเอง
-- -------------------------------------------------------------
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

  -- ── ใหม่ใน 0025 ── ตัดสินคำขอส่งกลับทางอากาศ
  -- ผูกเวลากับ air_decision ไม่ใช่กับ air_decision_by เพราะ "การตัดสิน" คือเหตุการณ์
  -- ส่วนผู้ตัดสินเป็นแค่คุณสมบัติของมัน (ต่างจาก approved_by ที่ 0013 เลือกอีกทาง
  -- ซึ่งใช้ได้เหมือนกันเพราะ constraint บังคับให้ทั้งคู่มาพร้อมกันอยู่แล้ว)
  if new.air_decision is null then
    new.air_decision_at := null;
  elsif old.air_decision is null then
    new.air_decision_at := now();            -- เพิ่งตัดสิน
  else
    new.air_decision_at := old.air_decision_at; -- ตัดสินไปแล้ว เวลาเดิมห้ามขยับ
  end if;

  return new;
end;
$$;


-- -------------------------------------------------------------
-- 3. กำลังพลประจำรถ — แปลง crew_note จากข้อความให้เป็นตัวเลขที่รวมยอดได้
--
-- ★ ไม่ลบ crew_note ทิ้ง
--   ข้อความอิสระยังบอกสิ่งที่ตัวเลขบอกไม่ได้ เช่น 'อยู่ระหว่างซ่อมบำรุง'
--   หรือชื่อชุดที่ประจำรถคันนั้น สองอย่างนี้อยู่คู่กันได้
--
-- ★ default ของ driver_count เป็น 1 ไม่ใช่ 0
--   รถที่ไม่มีพลขับไม่ใช่รถ — ค่าเริ่มต้นควรตรงกับความจริงที่พบเสมอ
--   ส่วนนายสิบพยาบาลกับพลเปลมีหรือไม่มีก็ได้ จึงเริ่มที่ 0
-- -------------------------------------------------------------
alter table public.vehicle
  add column medic_count  int not null default 0 check (medic_count  >= 0),
  add column driver_count int not null default 1 check (driver_count >= 0),
  add column litter_count int not null default 0 check (litter_count >= 0);

comment on column public.vehicle.medic_count is
  'จำนวนนายสิบพยาบาลที่ประจำรถคันนี้ · ใช้รวมยอดบนแดชบอร์ดศูนย์สั่งการ';
comment on column public.vehicle.litter_count is
  'จำนวนพลเปลที่ประจำรถคันนี้';


-- -------------------------------------------------------------
-- 4. กำลังพลประจำจุดส่งกลับ
--
-- ★ ทำไมเก็บทั้งที่รถและที่หน่วย ไม่ซ้ำซ้อนกัน
--   ศูนย์สั่งการต้องแยกให้ออกระหว่าง
--     "นายสิบพยาบาลที่ติดไปกับรถแล้ว"  (รวมจาก vehicle.medic_count)
--     "ที่ยังอยู่ประจำจุดส่งกลับ"        (unit.medic_on_duty)
--   สองเลขนี้ตอบคนละคำถามในการจัดสรร — เลขแรกบอกว่ายังจ่ายรถได้อีกกี่คัน
--   เลขที่สองบอกว่าจุดนั้นรับผู้ป่วยเพิ่มไหวไหม
--
-- ★ nullable โดยเจตนา เหมือน bed_available ที่มาก่อนหน้า
--   null = "ยังไม่รายงาน" ซึ่งต่างจาก 0 = "รายงานแล้วว่าไม่มี"
--   หลักการเดียวกับที่ /dashboard ห้ามแสดง 0 เมื่อไม่มีข้อมูล
--
-- ⚠ policy unit_write ใน 0010 เป็น admin เท่านั้น
--   monitor แก้ค่านี้เองไม่ได้ และรอบนี้แดชบอร์ด **อ่านอย่างเดียว** ตามที่ตกลงไว้
--   ค่ามาจาก seed ถ้าวันหน้าจะให้หน่วยเจ้าของรายงานเอง ต้องเพิ่ม policy ใหม่
--   ที่ยอมให้แก้เฉพาะแถวของหน่วยตัวเอง (unit_id = current_unit_id())
-- -------------------------------------------------------------
alter table public.unit
  add column medic_on_duty int check (medic_on_duty >= 0);

comment on column public.unit.medic_on_duty is
  'นายสิบพยาบาลที่เข้าเวรอยู่ที่จุดส่งกลับนี้ · null = ยังไม่รายงาน (ต่างจาก 0 = รายงานแล้วว่าไม่มี) · อัปเดตด้วยมือเหมือน bed_available';


-- =============================================================
-- ไม่มี RLS policy ใหม่ในไฟล์นี้ — ตรวจแล้วว่าของเดิมพอ
--   case   · case_update (0013) ยอม has_role('monitor') → เขียน air_decision ได้
--   vehicle· vehicle_select ยอม monitor เห็นทุกคัน (0010)
--   unit   · unit_select using (true) → อ่านได้ทุกคนที่ล็อกอิน
--
-- ⚠ ที่ต้องระวังคือ case_update ยอม monitor **ทุกคอลัมน์ของทุกเคส**
--   ไม่ผ่าน can_see_case() ด้วยซ้ำ การเปิดปุ่มให้ monitor จึงต้องคิดขอบเขตที่ฝั่งแอป
--   รอบนี้เปิดปุ่มเดียวและ server action จำกัดตัวเองไว้ที่ 5 คอลัมน์ของ air_* เท่านั้น
-- =============================================================
