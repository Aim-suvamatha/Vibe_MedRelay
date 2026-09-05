-- =============================================================
-- 0007_assessment.sql — การประเมินผู้ป่วย
-- อ้างอิง DATABASE.md §3.6
--
-- ★ ตารางนี้คือคำตอบของ HMW หลักของโครงการ
--   assessment ผูกกับ case_id เสมอ ผูกกับ leg_id เมื่อเกิดในทอดนั้น
--   ผลประเมินแรกรับที่บันทึกในทอดที่ 1 จึงเปิดดูได้จากทุกทอดถัดไป
--   โดยไม่ต้องคัดลอกข้อมูล — ข้อมูลเดินทางไปกับผู้ป่วยจริง
--
-- แก้ไขและลบไม่ได้ (ไม่มี RLS policy สำหรับ UPDATE/DELETE ใน 0010)
-- ถ้าประเมินผิด ให้บันทึกการประเมินใหม่ เหมือนเวชระเบียนกระดาษ
-- =============================================================

create table public.assessment (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public."case"(id) on delete cascade,
  leg_id        uuid references public.transfer_leg(id) on delete set null,
  kind          public.assessment_kind not null default 'initial',

  -- สัญญาณชีพ — nullable ทั้งหมด เพราะหน้างานอาจวัดไม่ครบ
  gcs           int  check (gcs between 3 and 15),
  sbp           int  check (sbp between 0 and 300),
  dbp           int  check (dbp between 0 and 200),
  pulse         int  check (pulse between 0 and 300),
  resp_rate     int  check (resp_rate between 0 and 80),
  spo2          int  check (spo2 between 0 and 100),
  temperature   numeric(4,1) check (temperature between 20.0 and 45.0),

  triage        public.triage_color,
  findings      text,                            -- สิ่งตรวจพบ
  treatment     text,                            -- การรักษาที่ให้
  assessed_by   uuid not null references public.profile(id),
  assessed_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),

  constraint assessment_bp_order check (sbp is null or dbp is null or sbp >= dbp)
);

create index assessment_case_idx on public.assessment(case_id, assessed_at);
create index assessment_leg_idx  on public.assessment(leg_id);
