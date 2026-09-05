-- =============================================================
-- 0002_unit.sql — หน่วยต้นทาง/ปลายทาง
-- อ้างอิง DATABASE.md §3.1
-- =============================================================

create table public.unit (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,           -- เช่น 'PAN-SOR-4'
  name_th       text not null,                  -- 'กองพันเสนารักษ์ที่ 4'
  name_en       text,
  role_level    public.role_of_care not null,   -- ระดับชั้นการรักษาของหน่วยนี้
  parent_id     uuid references public.unit(id) on delete set null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index unit_parent_idx on public.unit(parent_id);

comment on table public.unit is
  'หน่วยที่เป็นต้นทางหรือปลายทางของทอดการส่งกลับ · parent_id ใช้ผูกสายการบังคับบัญชา';
