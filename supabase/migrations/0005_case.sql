-- =============================================================
-- 0005_case.sql — เคสผู้ป่วยหนึ่งราย
-- อ้างอิง DATABASE.md §3.4
--
-- ⚠ เฟส prototype ห้ามเก็บข้อมูลที่ระบุตัวตนผู้ป่วยจริง
--   ใช้ case_code และ patient_alias เท่านั้น (AI_RULES.md §0 ข้อ 2)
--   is_synthetic บังคับเป็น true อีกชั้นด้วย RLS policy ใน 0010
-- =============================================================

create table public."case" (
  id                uuid primary key default gen_random_uuid(),
  case_code         text not null unique,          -- 'MR-2569-0001' — เติมโดย trigger ใน 0009 (BEFORE INSERT ทำงานก่อนตรวจ not null)
  patient_alias     text,                          -- 'ผู้ป่วย ก' เท่านั้น ห้ามใส่ชื่อจริง
  patient_count     int not null default 1 check (patient_count between 1 and 50),
  origin_unit_id    uuid not null references public.unit(id),
  precedence        public.precedence_level not null,
  triage            public.triage_color,
  chief_complaint   text not null,
  mechanism         text,                          -- กลไกการบาดเจ็บ / เหตุการณ์
  operation_type    text,                          -- ประเภทยุทธการ (สำหรับ export F7)
  symptom_onset_at  timestamptz,                   -- เวลาที่เริ่มมีอาการ — ข้อมูลที่ HIS ไม่มี
  status            public.case_status not null default 'requested',
  created_by        uuid not null references public.profile(id),
  requested_at      timestamptz not null default now(),   -- ⏱ ตั้งอัตโนมัติ
  closed_at         timestamptz,                          -- ⏱ ตั้งโดย trigger ใน 0009
  client_uuid       uuid unique,                   -- offline queue (Phase 2)
  is_synthetic      boolean not null default true, -- เฟส prototype ต้องเป็น true เสมอ
  created_at        timestamptz not null default now(),

  -- ห้ามใส่เลขบัตรประชาชน 13 หลักลง alias ไม่ว่าจะโดยตั้งใจหรือพลาด
  constraint case_alias_no_national_id check (patient_alias !~ '[0-9]{13}'),
  constraint case_closed_after_requested check (closed_at is null or closed_at >= requested_at)
);

create index case_status_idx on public."case"(status, requested_at desc);
create index case_origin_idx on public."case"(origin_unit_id);
create index case_created_by_idx on public."case"(created_by);

comment on table public."case" is
  'เคสผู้ป่วยหนึ่งราย · case เป็น reserved word ของ SQL จึงต้องใส่ double quote เสมอ';
comment on column public."case".case_code is
  'เติมอัตโนมัติโดย trigger trg_case_code เมื่อ insert โดยไม่ระบุค่า — ใช้แทนตัวระบุผู้ป่วย';
