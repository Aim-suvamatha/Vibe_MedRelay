-- =============================================================
-- 0008_event_log.sql — Audit trail
-- อ้างอิง DATABASE.md §3.7
--
-- insert ได้อย่างเดียว ไม่มี policy สำหรับ UPDATE และ DELETE
-- แม้แต่ admin ก็แก้ไม่ได้ — audit trail ที่แก้ได้ไม่ใช่ audit trail
-- =============================================================

create table public.event_log (
  id          bigserial primary key,
  case_id     uuid references public."case"(id) on delete cascade,
  leg_id      uuid references public.transfer_leg(id) on delete cascade,
  actor_id    uuid references public.profile(id),   -- null ได้ เช่น การกระทำจาก SQL Editor หรือ seed
  action      text not null,                        -- 'case.created', 'leg.status_changed', ...
  from_value  text,
  to_value    text,
  payload     jsonb,                                -- เก็บ context เพิ่มโดยไม่ต้อง migrate schema
  created_at  timestamptz not null default now()
);

create index event_case_idx  on public.event_log(case_id, created_at desc);
create index event_actor_idx on public.event_log(actor_id, created_at desc);

comment on column public.event_log.payload is
  'ห้ามบันทึกเนื้อหา prompt หรือข้อมูลผู้ป่วยลงในฟิลด์นี้ (AI_RULES.md §4.3)';
