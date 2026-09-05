-- =============================================================
-- 0003_profile.sql — ผู้ใช้ระบบ (ต่อจาก auth.users)
-- อ้างอิง DATABASE.md §3.2
--
-- ไม่มีเลขบัตรประชาชน 13 หลักโดยเจตนา (AI_RULES.md §3.1)
-- roles เป็น array เพราะกำลังพลคนเดียวสลับบทบาทได้ในแต่ละวัน
-- =============================================================

create table public.profile (
  id              uuid primary key references auth.users(id) on delete cascade,
  service_number  text not null unique,               -- เลขประจำตัวทหาร 10 หลัก
  full_name       text not null,
  rank_th         text,                               -- 'จ.ส.อ.'
  phone           text,                               -- ใช้ยืนยันตัวตน (OTP)
  unit_id         uuid not null references public.unit(id),
  roles           public.app_role[] not null default '{}',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint service_number_format check (service_number ~ '^[0-9]{10}$')
);

create index profile_unit_idx  on public.profile(unit_id);
create index profile_roles_idx on public.profile using gin(roles);

comment on column public.profile.roles is
  'บทบาทที่ผู้ใช้ถืออยู่ · หนึ่งคนถือได้หลายบทบาท · ผู้ใช้เปลี่ยน roles ของตัวเองไม่ได้ (บังคับด้วย RLS ใน 0010)';
