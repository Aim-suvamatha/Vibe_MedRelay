-- =============================================================
-- 0019_casualty.sql — ประวัติผู้ป่วยรายบุคคล (ทบ.466-901 ช่อง ๑–๗ และแถบข้อมูลด้านล่าง)
--
-- ★ ไฟล์นี้กลับด้านการตัดสินใจที่เขียนไว้ในหัวไฟล์ 0013_form_fields.sql
--   ตอนนั้นตั้งใจไม่ทำตาราง PERSONNEL เพราะขัด AI_RULES §3.1
--   เจ้าของโครงการตัดสินใจใหม่เมื่อ 7 ก.ย. 2569 ว่าให้เก็บ โดยให้เหตุผลว่า
--   แบบฟอร์มการส่งกลับที่หน่วยใช้จริงมีช่องเหล่านี้ ถ้าระบบไม่มี ผู้ใช้จะกลับไปจดกระดาษคู่กัน
--   ซึ่งแย่กว่าเพราะกระดาษไม่มี RLS ไม่มี audit log และลบไม่ได้
--   AI_RULES.md §3.1 ถูกแก้ให้ตรงกับความจริงข้อนี้แล้วในงวดเดียวกัน
--
-- ★ ทำไมแยกตาราง ไม่เพิ่มคอลัมน์ใน case เหมือนที่ 0013 ทำ
--   0013 ให้เหตุผลว่าความสัมพันธ์ 1:1 ไม่คุ้มกับการ join ซึ่งยังจริงอยู่
--   แต่ข้อมูลชุดนี้มีสามคุณสมบัติที่ข้อมูลใน case ไม่มี
--     1. ต้องลบได้เป็นก้อนเดียวตามสิทธิเจ้าของข้อมูล (AI_RULES §3.4)
--        โดยไม่แตะเวชระเบียนหรือตัวเลขบนแดชบอร์ด
--     2. ต้องไม่มีทางติดไปกับ view สถิติโดยบังเอิญ
--        v_case_metrics · v_leg_metrics · v_casualty_report อ่านจาก case โดยตรง
--        ถ้าอยู่คนละตาราง คนที่เพิ่ม select * ในอนาคตก็ยังไม่ได้ข้อมูลนี้ติดมา
--     3. AI_RULES §4.3 ห้ามส่งข้อมูลระบุตัวตนเข้า LLM
--        query ที่ป้อน LLM อ่านจาก case เป็นหลัก การอยู่คนละตารางคือการกันด้วยโครงสร้าง
--        ไม่ใช่กันด้วยความตั้งใจของคนเขียน query คนถัดไป
--
-- ★ สิ่งที่ยังไม่เก็บ และจะไม่เก็บ
--   เลขบัตรประชาชน 13 หลัก — ทบ.466-901 ช่อง ๒ คือ "เลขประจำตัว" หมายถึงเลขประจำตัวทหาร
--   10 หลัก ไม่ใช่เลขบัตรประชาชน การไม่มีช่องนั้นจึงยังตรงตามกระดาษทุกประการ
-- =============================================================

create table public.casualty (
  -- ★ case_id เป็น primary key ไม่ใช่คอลัมน์ธรรมดา
  --   บังคับ 1:1 ที่ระดับโครงสร้าง หนึ่งเคสมีประวัติได้ใบเดียวเท่านั้น
  --   ถ้าใช้ id แยกแล้วค่อย unique(case_id) จะได้ผลเหมือนกันแต่ต้องจำเพิ่มอีกหนึ่งอย่าง
  case_id       uuid primary key references public."case"(id) on delete cascade,

  -- ── ทบ.466-901 ช่อง ๑–๔ ─────────────────────────────────────
  rank_th       text,                    -- ยศ
  first_name    text,                    -- ชื่อ
  last_name     text,                    -- นามสกุล
  service_number text,                   -- เลขประจำตัวทหาร 10 หลัก
  affiliation   text,                    -- สังกัด
  branch        public.armed_branch,     -- เหล่าทัพ

  -- ── ช่อง ๕–๗ (ตัดศาสนาออกตามคำสั่งเจ้าของโครงการ 8 ก.ย. 2569) ──
  age_years     int check (age_years between 0 and 120),
  nationality   text,
  ethnicity     text,

  -- ── แถบข้อมูลด้านล่างของบัตร ────────────────────────────────
  blood_group   public.blood_group,
  rh            public.rh_factor,
  drug_allergy       text,   -- แพ้ยา
  food_allergy       text,   -- แพ้อาหาร
  chronic_conditions text,   -- โรคประจำตัว
  past_history       text,   -- ประวัติการเจ็บป่วยในอดีต
  regular_meds       text,   -- ยาที่ใช้เป็นประจำ

  weight_kg     numeric(5,1) check (weight_kg  > 0 and weight_kg  < 400),
  height_cm     numeric(5,1) check (height_cm  > 0 and height_cm  < 300),
  phone         text,

  recorded_by   uuid not null references public.profile(id),
  recorded_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),

  -- เลขประจำตัวทหารเป็นตัวเลข 10 หลักเท่านั้น รูปแบบเดียวกับ profile.service_number
  -- ค่าว่างยอมได้ เพราะหน้างานอาจยังไม่ทราบ แต่ถ้ากรอกมาต้องถูกรูปแบบ
  constraint casualty_service_number_format
    check (service_number is null or service_number ~ '^[0-9]{10}$'),

  -- กันเลขบัตรประชาชนหลุดเข้ามาทางช่องอื่นด้วย ไม่ใช่แค่ช่องเลขประจำตัว
  -- เหตุผลเดียวกับ case_alias_no_national_id ใน 0005
  constraint casualty_no_national_id
    check (
      coalesce(first_name, '')  !~ '[0-9]{13}' and
      coalesce(last_name, '')   !~ '[0-9]{13}' and
      coalesce(affiliation, '') !~ '[0-9]{13}'
    )
);

comment on table public.casualty is
  'ประวัติผู้ป่วยรายบุคคลตาม ทบ.466-901 · ข้อมูลระบุตัวบุคคล ห้ามส่งเข้า LLM (AI_RULES §4.3) และห้าม join เข้า view สถิติ · admin ลบได้เพื่อรองรับสิทธิขอลบข้อมูล (§3.4)';
comment on column public.casualty.service_number is
  'เลขประจำตัวทหาร 10 หลัก ตาม ทบ.466-901 ช่อง ๒ — ไม่ใช่เลขบัตรประชาชน ซึ่งระบบไม่เก็บ';

-- =============================================================
-- RLS — เข้มกว่าตารางอื่นโดยเจตนา
--
-- select/insert/update ใช้ can_see_case() เหมือนตารางลูกอื่น เพราะปลายทางต้องอ่าน
-- หมู่เลือดและประวัติแพ้ยาได้ก่อนรับตัว ไม่งั้นข้อมูลชุดนี้ก็ไม่มีประโยชน์
--
-- delete ต่างจากทุกตารางในระบบ — เปิดให้ admin เท่านั้น
-- ตารางอื่นที่เป็นเวชระเบียน (assessment · treatment · event_log) ไม่มี policy DELETE เลย
-- แต่ตารางนี้ต้องลบได้ เพราะเป็นข้อมูลส่วนบุคคลที่เจ้าของมีสิทธิ์ขอให้ลบ
-- การลบแถวนี้ไม่ทำให้เวชระเบียนหรือตัวเลขบนแดชบอร์ดเสียหาย ซึ่งเป็นเหตุผลทั้งหมดของการแยกตาราง
-- =============================================================
alter table public.casualty enable row level security;

create policy casualty_select on public.casualty
  for select to authenticated
  using (public.can_see_case(case_id));

create policy casualty_insert on public.casualty
  for insert to authenticated
  with check (recorded_by = auth.uid() and public.can_see_case(case_id));

create policy casualty_update on public.casualty
  for update to authenticated
  using (public.can_see_case(case_id))
  with check (public.can_see_case(case_id));

create policy casualty_delete on public.casualty
  for delete to authenticated
  using (public.has_role('admin'));
