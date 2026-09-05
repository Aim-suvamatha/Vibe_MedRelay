-- =============================================================
-- 0004_vehicle.sql — รถและชุดส่งกลับ
-- อ้างอิง DATABASE.md §3.3
--
-- ตารางนี้คือแหล่งข้อมูลใหม่ที่ระบบเดิมไม่มี
-- เดิมศูนย์สั่งการต้องโทรถามทีละคนว่ารถคันไหนว่าง
-- =============================================================

create table public.vehicle (
  id            uuid primary key default gen_random_uuid(),
  call_sign     text not null unique,                          -- นามเรียกขาน
  type          public.vehicle_type not null default 'bls',
  unit_id       uuid not null references public.unit(id),
  status        public.vehicle_status not null default 'available',
  crew_note     text,                                          -- ชุดที่ประจำรถ (ข้อความอิสระ)
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index vehicle_unit_status_idx on public.vehicle(unit_id, status);
