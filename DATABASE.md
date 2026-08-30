# DATABASE.md — MedRelay

Schema, keys, relationships และ Row Level Security ของฐานข้อมูล PostgreSQL บน Supabase

> **หลักการออกแบบข้อ 1** — แยก `case` ออกจาก `transfer_leg` ตั้งแต่ต้น เพราะการส่งกลับจริงมี 2–4 ทอด
> หนึ่งเคสมีได้หลายทอด ทำให้ระบบเดียวรองรับทั้งการฝึก (2 ทอด) และการรบ (4 ทอด) โดยไม่ต้องเขียนใหม่
>
> **หลักการออกแบบข้อ 2** — timestamp ทุกตัวเกิดจากการกดปุ่มที่ผู้ใช้ต้องกดอยู่แล้ว
> **ไม่มีตารางใดมีช่องให้ "กรอกเวลา" ด้วยมือ** — นี่คือสิ่งที่ทำให้แดชบอร์ดไม่เพิ่มภาระงาน
>
> **หลักการออกแบบข้อ 3** — เฟส prototype **ห้ามเก็บข้อมูลที่ระบุตัวตนผู้ป่วยจริง** ใช้ `case_code` และ `patient_alias` เท่านั้น

---

## 1. ER Diagram

```
   unit ─────┬────────────────────────────────────┐
    │        │                                    │
    │ (1:N)  │ from_unit_id / to_unit_id (1:N)    │ (1:N)
    ▼        │                                    ▼
 profile     │                                 vehicle
    │        │                                    │
    │ (1:N)  ▼                                    │ (1:N)
    │   ┌─────────┐        (1:N)        ┌──────────────┐
    └──▶│  case   │───────────────────▶ │ transfer_leg │
        └────┬────┘   case_id            └──────┬───────┘
             │                                  │
             │ (1:N)                            │ (1:N)
             ▼                                  ▼
        ┌──────────┐  ◀── leg_id (0..1) ──  assessment
        │assessment│
        └──────────┘

        event_log ──▶ (case_id, leg_id, actor_id)   audit trail อย่างเดียว เขียนแล้วแก้ไม่ได้
```

**ความสัมพันธ์สรุป**

| ความสัมพันธ์ | Cardinality | ความหมายในโลกจริง |
|---|---|---|
| `case` → `transfer_leg` | 1:N | หนึ่งเคสส่งกลับหลายทอด |
| `transfer_leg` → `assessment` | 1:N | แต่ละทอดประเมินได้หลายครั้ง (แรกรับ / ระหว่างทาง / ส่งมอบ) |
| `case` → `assessment` | 1:N | assessment ผูกกับ case เสมอ ผูกกับ leg เมื่อเกิดในทอดนั้น |
| `unit` → `transfer_leg` | 1:N สองทาง | หน่วยเป็นได้ทั้งต้นทาง (`from_unit_id`) และปลายทาง (`to_unit_id`) |
| `vehicle` → `transfer_leg` | 1:N | รถหนึ่งคันวิ่งหลายทอดตามลำดับเวลา |
| `profile` → `case` | 1:N | ผู้ใช้เปิดได้หลายเคส |

---

## 2. Enum Types

```sql
-- ระดับความเร่งด่วนตามหลักนิยม MEDEVAC (ไม่กำหนดขึ้นเอง)
create type precedence_level as enum ('urgent', 'priority', 'routine');

-- ระดับการบาดเจ็บตามรายงานสรุปกำลังพลบาดเจ็บที่หน่วยใช้จริง
create type triage_color as enum ('black', 'red', 'yellow', 'green');

-- Role of care 1-4 (กองพัน / กองพล / รพ.ค่าย / เขตหลัง)
create type role_of_care as enum ('role_1', 'role_2', 'role_3', 'role_4');

-- สถานะของเคสโดยรวม
create type case_status as enum ('requested', 'active', 'completed', 'cancelled');

-- สถานะของแต่ละทอด
create type leg_status as enum (
  'pending',      -- สร้างแล้ว รอจัดรถ
  'dispatched',   -- จัดรถแล้ว รถกำลังไป
  'on_scene',     -- ถึงจุดรับผู้ป่วยแล้ว
  'in_transit',   -- ออกเดินทางแล้ว
  'arrived',      -- ถึงปลายทางแล้ว รอส่งมอบ
  'completed',    -- ส่งมอบเรียบร้อย
  'cancelled'
);

-- บทบาทผู้ใช้ (หนึ่งคนถือได้หลายบทบาท เก็บเป็น array)
create type app_role as enum ('sender', 'transporter', 'receiver', 'monitor', 'commander', 'admin');

-- ประเภทยานพาหนะ (rotary/fixed_wing เตรียมไว้สำหรับ Phase 2)
create type vehicle_type as enum ('bls', 'als', 'utility', 'rotary', 'fixed_wing');
create type vehicle_status as enum ('available', 'dispatched', 'busy', 'maintenance', 'offline');

-- จุดเวลาที่ทำการประเมิน
create type assessment_kind as enum ('initial', 'enroute', 'handover');
```

---

## 3. Tables

### 3.1 `unit` — หน่วยต้นทาง/ปลายทาง

```sql
create table public.unit (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,           -- เช่น 'PAN-SOR-4'
  name_th       text not null,                  -- 'กองพันเสนารักษ์ที่ 4'
  name_en       text,
  role_level    role_of_care not null,          -- ระดับชั้นการรักษาของหน่วยนี้
  parent_id     uuid references public.unit(id) on delete set null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index unit_parent_idx on public.unit(parent_id);
```

### 3.2 `profile` — ผู้ใช้ระบบ (ต่อจาก `auth.users`)

```sql
create table public.profile (
  id              uuid primary key references auth.users(id) on delete cascade,
  service_number  text not null unique,          -- เลขประจำตัวทหาร 10 หลัก
  full_name       text not null,
  rank_th         text,                          -- 'จ.ส.อ.'
  phone           text,                          -- ใช้ยืนยันตัวตน (OTP)
  unit_id         uuid not null references public.unit(id),
  roles           app_role[] not null default '{}',  -- หนึ่งคนถือหลายบทบาทได้
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint service_number_format check (service_number ~ '^[0-9]{10}$')
);
create index profile_unit_idx on public.profile(unit_id);
create index profile_roles_idx on public.profile using gin(roles);
```

> **ทำไม `roles` เป็น array** — กำลังพลคนเดียวสลับบทบาทได้ในแต่ละวัน นายสิบเสนารักษ์เป็นได้ทั้งผู้ส่ง ผู้ขึ้นรถ และผู้ช่วยแพทย์ที่จุดรับ การล็อกหนึ่งคนหนึ่งบทบาทจะขัดกับการทำงานจริง
>
> **ทำไมไม่มีเลขบัตรประชาชน** — ตัดออกโดยเจตนา (ดู AI_RULES.md §3)

### 3.3 `vehicle` — รถและชุดส่งกลับ

```sql
create table public.vehicle (
  id            uuid primary key default gen_random_uuid(),
  call_sign     text not null unique,           -- นามเรียกขาน
  type          vehicle_type not null default 'bls',
  unit_id       uuid not null references public.unit(id),
  status        vehicle_status not null default 'available',
  crew_note     text,                            -- ชุดที่ประจำรถ (ข้อความอิสระ)
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index vehicle_unit_status_idx on public.vehicle(unit_id, status);
```

> ตารางนี้คือ **แหล่งข้อมูลใหม่ที่ระบบเดิมไม่มี** — เดิมต้องโทรถามทีละคนว่ารถคันไหนว่าง

### 3.4 `case` — เคสผู้ป่วยหนึ่งราย

```sql
create table public."case" (
  id                uuid primary key default gen_random_uuid(),
  case_code         text not null unique,         -- 'MR-2569-0001' ใช้แทนตัวระบุผู้ป่วย
  patient_alias     text,                         -- 'ผู้ป่วย ก' เท่านั้น ห้ามใส่ชื่อจริงในเฟส prototype
  patient_count     int not null default 1 check (patient_count between 1 and 50),
  origin_unit_id    uuid not null references public.unit(id),
  precedence        precedence_level not null,
  triage            triage_color,
  chief_complaint   text not null,
  mechanism         text,                          -- กลไกการบาดเจ็บ / เหตุการณ์
  operation_type    text,                          -- ประเภทยุทธการ (สำหรับ export F7)
  symptom_onset_at  timestamptz,                   -- เวลาที่เริ่มมีอาการ (ข้อมูลที่ HIS ไม่มี)
  status            case_status not null default 'requested',
  created_by        uuid not null references public.profile(id),
  requested_at      timestamptz not null default now(),   -- ⏱ ตั้งอัตโนมัติ
  closed_at         timestamptz,                          -- ⏱ ตั้งโดย trigger
  client_uuid       uuid unique,                   -- สำหรับ offline queue (Phase 2)
  is_synthetic      boolean not null default true, -- เฟส prototype ต้องเป็น true เสมอ
  created_at        timestamptz not null default now()
);
create index case_status_idx on public."case"(status, requested_at desc);
create index case_origin_idx on public."case"(origin_unit_id);
```

> `case` เป็น reserved word ของ SQL จึงต้องใส่ double quote เสมอ — ถ้าไม่อยากใส่ทุกครั้ง ใช้ชื่อ `evac_case` แทนได้ แต่ต้องเปลี่ยนให้ตรงกันทุกไฟล์

### 3.5 `transfer_leg` — ทอดการส่งกลับ (หัวใจของ schema)

```sql
create table public.transfer_leg (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public."case"(id) on delete cascade,
  leg_no          int not null check (leg_no >= 1),
  from_unit_id    uuid not null references public.unit(id),
  to_unit_id      uuid not null references public.unit(id),
  role_level      role_of_care not null,        -- ระดับชั้นการรักษาของปลายทางทอดนี้
  vehicle_id      uuid references public.vehicle(id) on delete set null,
  transporter_id  uuid references public.profile(id) on delete set null,
  receiver_id     uuid references public.profile(id) on delete set null,
  evac_director   text,                          -- แพทย์ผู้อำนวยการส่งกลับ (field ไม่ต้อง login)
  status          leg_status not null default 'pending',

  -- ⏱ timestamp ทั้งหมดตั้งโดย trigger จากการเปลี่ยน status เท่านั้น
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
  constraint leg_time_order check (
    (dispatched_at is null or dispatched_at >= requested_at) and
    (on_scene_at   is null or on_scene_at   >= dispatched_at) and
    (departed_at   is null or departed_at   >= on_scene_at) and
    (arrived_at    is null or arrived_at    >= departed_at) and
    (handover_at   is null or handover_at   >= arrived_at)
  )
);
create index leg_case_idx on public.transfer_leg(case_id, leg_no);
create index leg_status_idx on public.transfer_leg(status, requested_at desc);
create index leg_to_unit_idx on public.transfer_leg(to_unit_id, status);
```

> `leg_time_order` เป็น constraint ที่ทำให้ข้อมูลเวลา **เชื่อถือได้เชิงโครงสร้าง** — ตัวเลข response time บนแดชบอร์ดจึงติดลบไม่ได้ ข้อนี้ตอบคำถามกรรมการเรื่องความน่าเชื่อถือของตัวเลขได้ทันที

### 3.6 `assessment` — การประเมินผู้ป่วย

```sql
create table public.assessment (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public."case"(id) on delete cascade,
  leg_id        uuid references public.transfer_leg(id) on delete set null,
  kind          assessment_kind not null default 'initial',

  -- สัญญาณชีพ (nullable ทั้งหมด เพราะหน้างานอาจวัดไม่ครบ)
  gcs           int  check (gcs between 3 and 15),
  sbp           int  check (sbp between 0 and 300),
  dbp           int  check (dbp between 0 and 200),
  pulse         int  check (pulse between 0 and 300),
  resp_rate     int  check (resp_rate between 0 and 80),
  spo2          int  check (spo2 between 0 and 100),
  temperature   numeric(4,1),

  triage        triage_color,
  findings      text,                            -- สิ่งตรวจพบ
  treatment     text,                            -- การรักษาที่ให้
  assessed_by   uuid not null references public.profile(id),
  assessed_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index assessment_case_idx on public.assessment(case_id, assessed_at);
create index assessment_leg_idx on public.assessment(leg_id);
```

> **นี่คือตารางที่ตอบ HMW หลักของโครงการ** — assessment ผูกกับ `case_id` ไม่ใช่ `leg_id` เพียงอย่างเดียว ผลประเมินแรกรับที่บันทึกในทอดที่ 1 จึงเปิดดูได้จากทุกทอดถัดไปโดยไม่ต้องคัดลอกข้อมูล

### 3.7 `event_log` — Audit trail

```sql
create table public.event_log (
  id          bigserial primary key,
  case_id     uuid references public."case"(id) on delete cascade,
  leg_id      uuid references public.transfer_leg(id) on delete cascade,
  actor_id    uuid references public.profile(id),
  action      text not null,                  -- 'case.created', 'leg.dispatched', ...
  from_value  text,
  to_value    text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);
create index event_case_idx on public.event_log(case_id, created_at desc);
```

> ตารางนี้ **insert ได้อย่างเดียว** ไม่มี policy สำหรับ UPDATE และ DELETE — เพื่อให้ audit trail แก้ไม่ได้

---

## 4. Triggers — เวลาที่เกิดขึ้นเอง

```sql
-- ตั้ง timestamp ตามสถานะที่เปลี่ยน (ไม่มีทางกรอกเวลาด้วยมือ)
create or replace function public.set_leg_timestamps()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    case new.status
      when 'dispatched' then new.dispatched_at := coalesce(new.dispatched_at, now());
      when 'on_scene'   then new.on_scene_at   := coalesce(new.on_scene_at,   now());
      when 'in_transit' then new.departed_at   := coalesce(new.departed_at,   now());
      when 'arrived'    then new.arrived_at    := coalesce(new.arrived_at,    now());
      when 'completed'  then new.handover_at   := coalesce(new.handover_at,   now());
      else null;
    end case;
  end if;
  return new;
end $$;

create trigger trg_leg_timestamps
  before update on public.transfer_leg
  for each row execute function public.set_leg_timestamps();
```

```sql
-- ปิดเคสอัตโนมัติเมื่อทอดสุดท้ายส่งมอบเรียบร้อย
create or replace function public.close_case_when_last_leg_done()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and not exists (
    select 1 from public.transfer_leg
    where case_id = new.case_id and status not in ('completed','cancelled')
  ) then
    update public."case"
      set status = 'completed', closed_at = now()
      where id = new.case_id;
  end if;
  return new;
end $$;

create trigger trg_close_case
  after update on public.transfer_leg
  for each row execute function public.close_case_when_last_leg_done();
```

```sql
-- เขียน audit log ทุกครั้งที่สถานะทอดเปลี่ยน
create or replace function public.log_leg_status()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    insert into public.event_log (case_id, leg_id, actor_id, action, from_value, to_value)
    values (new.case_id, new.id, auth.uid(), 'leg.status_changed', old.status::text, new.status::text);
  end if;
  return new;
end $$;

create trigger trg_log_leg_status
  after update on public.transfer_leg
  for each row execute function public.log_leg_status();
```

---

## 5. Row Level Security (RLS)

> **เปิด RLS ทุกตารางโดยไม่มีข้อยกเว้น** — ตารางที่ลืมเปิด RLS คือตารางที่ใครก็อ่านได้ด้วย anon key
> การซ่อนปุ่มบนหน้าจอไม่ใช่ security การบังคับที่ชั้น database คือ security

### 5.1 Helper functions

```sql
-- หน่วยที่ผู้ใช้ปัจจุบันสังกัด
create or replace function public.current_unit_id()
returns uuid language sql stable security definer set search_path = public as $$
  select unit_id from public.profile where id = auth.uid()
$$;

-- ผู้ใช้ปัจจุบันมีบทบาทนี้หรือไม่
create or replace function public.has_role(r app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select r = any(roles) from public.profile where id = auth.uid()), false)
$$;

-- ผู้ใช้ปัจจุบันเกี่ยวข้องกับเคสนี้หรือไม่ (ต้นทาง ปลายทาง หรือผู้ขนส่ง ของทอดใดทอดหนึ่ง)
create or replace function public.can_see_case(c_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.transfer_leg l
    where l.case_id = c_id
      and (   l.from_unit_id   = public.current_unit_id()
           or l.to_unit_id     = public.current_unit_id()
           or l.transporter_id = auth.uid()
           or l.receiver_id    = auth.uid())
  )
  or exists (select 1 from public."case" c where c.id = c_id and c.created_by = auth.uid())
  or public.has_role('monitor') or public.has_role('commander') or public.has_role('admin')
$$;
```

### 5.2 Policies

```sql
alter table public.unit           enable row level security;
alter table public.profile        enable row level security;
alter table public.vehicle        enable row level security;
alter table public."case"         enable row level security;
alter table public.transfer_leg   enable row level security;
alter table public.assessment     enable row level security;
alter table public.event_log      enable row level security;
```

**`unit`** — ผู้ใช้ที่ล็อกอินแล้วอ่านรายการหน่วยได้ทั้งหมด (จำเป็นสำหรับเลือกปลายทาง) แต่แก้ไขได้เฉพาะ admin

```sql
create policy unit_select on public.unit
  for select to authenticated using (true);
create policy unit_write on public.unit
  for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
```

**`profile`** — เห็นตัวเองและคนในหน่วยเดียวกัน · แก้ไขได้เฉพาะของตัวเอง · **เปลี่ยน `roles` ของตัวเองไม่ได้**

```sql
create policy profile_select_self_or_unit on public.profile
  for select to authenticated
  using (id = auth.uid()
         or unit_id = public.current_unit_id()
         or public.has_role('monitor') or public.has_role('admin'));

create policy profile_update_self on public.profile
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and roles = (select roles from public.profile where id = auth.uid()));

create policy profile_admin_all on public.profile
  for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
```

**`vehicle`** — เห็นรถของหน่วยตัวเอง · เปลี่ยนสถานะได้เฉพาะ monitor/admin

```sql
create policy vehicle_select on public.vehicle
  for select to authenticated
  using (unit_id = public.current_unit_id() or public.has_role('monitor') or public.has_role('commander'));

create policy vehicle_update on public.vehicle
  for update to authenticated
  using (public.has_role('monitor') or public.has_role('admin'))
  with check (public.has_role('monitor') or public.has_role('admin'));
```

**`case`** — เห็นเฉพาะเคสที่ตนเกี่ยวข้อง · สร้างได้เฉพาะ sender และต้องเป็นหน่วยตัวเอง

```sql
create policy case_select on public."case"
  for select to authenticated using (public.can_see_case(id));

create policy case_insert on public."case"
  for insert to authenticated
  with check (public.has_role('sender')
              and created_by = auth.uid()
              and origin_unit_id = public.current_unit_id()
              and is_synthetic = true);          -- เฟส prototype บังคับข้อมูลจำลองเท่านั้น

create policy case_update on public."case"
  for update to authenticated
  using (created_by = auth.uid() or public.has_role('monitor') or public.has_role('admin'))
  with check (created_by = auth.uid() or public.has_role('monitor') or public.has_role('admin'));
```

**`transfer_leg`** — เห็นทอดที่หน่วยตนเป็นต้นทาง/ปลายทาง หรือตนเป็นผู้ขนส่ง/ผู้รับ

```sql
create policy leg_select on public.transfer_leg
  for select to authenticated using (public.can_see_case(case_id));

create policy leg_insert on public.transfer_leg
  for insert to authenticated
  with check (public.has_role('sender') or public.has_role('monitor') or public.has_role('receiver'));

-- ผู้ขนส่งอัปเดตได้เฉพาะทอดที่ตนถืออยู่ · monitor จัดรถได้ · ผู้รับกดรับมอบได้
create policy leg_update on public.transfer_leg
  for update to authenticated
  using (transporter_id = auth.uid()
         or receiver_id = auth.uid()
         or to_unit_id = public.current_unit_id()
         or public.has_role('monitor') or public.has_role('admin'))
  with check (transporter_id = auth.uid()
         or receiver_id = auth.uid()
         or to_unit_id = public.current_unit_id()
         or public.has_role('monitor') or public.has_role('admin'));
```

**`assessment`** — อ่านได้ถ้าเห็นเคสนั้น · **แก้ไขและลบไม่ได้** เพราะเป็นบันทึกทางคลินิก

```sql
create policy assessment_select on public.assessment
  for select to authenticated using (public.can_see_case(case_id));

create policy assessment_insert on public.assessment
  for insert to authenticated
  with check (assessed_by = auth.uid() and public.can_see_case(case_id));

-- ไม่มี policy สำหรับ UPDATE และ DELETE โดยเจตนา
-- ถ้าประเมินผิด ให้บันทึกการประเมินใหม่ ไม่ใช่แก้ของเดิม (เหมือนเวชระเบียนกระดาษ)
```

**`event_log`** — insert ได้ อ่านได้ถ้าเห็นเคส แก้ไม่ได้

```sql
create policy event_select on public.event_log
  for select to authenticated using (case_id is null or public.can_see_case(case_id));

create policy event_insert on public.event_log
  for insert to authenticated with check (true);

-- ไม่มี policy สำหรับ UPDATE และ DELETE โดยเจตนา
```

### 5.3 ตารางสรุปสิทธิ์

| ตาราง | Sender | Transporter | Receiver | Monitor | Commander | Admin |
|---|---|---|---|---|---|---|
| `unit` | อ่าน | อ่าน | อ่าน | อ่าน | อ่าน | ทั้งหมด |
| `profile` | ตนเอง + หน่วย | ตนเอง + หน่วย | ตนเอง + หน่วย | อ่านทั้งหมด | อ่านทั้งหมด | ทั้งหมด |
| `vehicle` | อ่าน (หน่วยตน) | อ่าน (หน่วยตน) | อ่าน (หน่วยตน) | อ่าน + แก้ | อ่าน | ทั้งหมด |
| `case` | สร้าง + อ่าน/แก้ของตน | อ่าน (ทอดที่ถือ) | อ่าน (ทอดปลายทาง) | อ่าน/แก้ทั้งหมด | อ่านทั้งหมด | ทั้งหมด |
| `transfer_leg` | สร้าง + อ่าน | อ่าน + แก้ (ทอดที่ถือ) | สร้างทอดถัดไป + แก้ | อ่าน/แก้ทั้งหมด | อ่านทั้งหมด | ทั้งหมด |
| `assessment` | สร้าง + อ่าน | สร้าง + อ่าน | สร้าง + อ่าน | อ่าน | อ่าน | อ่าน |
| `event_log` | อ่าน (เคสที่เห็น) | อ่าน | อ่าน | อ่าน | อ่าน | อ่าน |

> **หมายเหตุ** — ไม่มีบทบาทใดลบ `assessment` หรือ `event_log` ได้ รวมถึง admin

---

## 6. Views สำหรับแดชบอร์ด

```sql
-- ระยะเวลาแต่ละช่วงของทุกทอด คำนวณจาก timestamp ที่มีอยู่แล้ว
create or replace view public.v_leg_metrics as
select
  l.id, l.case_id, l.leg_no, l.to_unit_id, l.role_level,
  c.precedence, c.triage,
  l.dispatched_at - l.requested_at  as request_to_dispatch,
  l.on_scene_at   - l.dispatched_at as dispatch_to_scene,
  l.handover_at   - l.on_scene_at   as scene_to_handover,
  l.handover_at   - l.requested_at  as leg_total,
  l.requested_at::date              as service_date
from public.transfer_leg l
join public."case" c on c.id = l.case_id
where l.status = 'completed';

-- ระยะเวลารวมของทั้งเคส (ทอดแรกถึงทอดสุดท้าย)
create or replace view public.v_case_metrics as
select
  c.id, c.case_code, c.precedence, c.triage, c.status,
  count(l.id)                                       as leg_count,
  min(l.requested_at)                               as first_requested_at,
  max(l.handover_at)                                as last_handover_at,
  max(l.handover_at) - min(l.requested_at)          as total_evacuation_time
from public."case" c
left join public.transfer_leg l on l.case_id = c.id
group by c.id;
```

> View สืบทอด RLS ของตารางต้นทางเมื่อสร้างด้วย `security_invoker = on` (PostgreSQL 15+) — ตรวจสอบให้แน่ใจว่าตั้งค่านี้ก่อน deploy

---

## 7. ลำดับการสร้าง (Migration Order)

รันตามลำดับนี้เท่านั้น เพราะมี foreign key ผูกกัน

```
1. enums
2. unit
3. profile        (ต้องมี unit ก่อน)
4. vehicle        (ต้องมี unit ก่อน)
5. case           (ต้องมี unit + profile ก่อน)
6. transfer_leg   (ต้องมี case + unit + vehicle + profile ก่อน)
7. assessment     (ต้องมี case + transfer_leg + profile ก่อน)
8. event_log
9. functions + triggers
10. RLS enable + policies
11. views
12. seed.sql      (ข้อมูลจำลองเท่านั้น)
```

เก็บทุกไฟล์ไว้ใน `supabase/migrations/` โดยตั้งชื่อ `NNNN_description.sql` — **migration คือ source of truth ของ schema ไม่ใช่หน้าจอ Supabase Studio**

---

## 8. Seed Data — กติกา

- ข้อมูล seed **ต้องเป็นข้อมูลจำลองทั้งหมด** `is_synthetic = true` เสมอ
- ชื่อผู้ป่วยใช้ `'ผู้ป่วย ก'`, `'ผู้ป่วย ข'` หรือ `case_code` เท่านั้น — **ห้ามใช้ชื่อจริงแม้ของตนเอง**
- ชื่อกำลังพลใน `profile` ให้ใช้ชื่อสมมติ เช่น `'จ.ส.อ. สมชาย ใจกล้า'` (persona)
- `service_number` ให้ใช้เลขที่ไม่มีอยู่จริง เช่น `'9900000001'`
- ห้าม commit ไฟล์ seed ที่มาจากข้อมูลจริงแม้จะถอดตัวระบุแล้ว — ให้เก็บนอก repo (`.gitignore` กัน `seed-real-*.sql` ไว้แล้ว)

---

## 9. สิ่งที่ schema นี้เตรียมไว้สำหรับ Phase 2

| ฟิลด์ / โครงสร้าง | เตรียมไว้เพื่อ |
|---|---|
| `client_uuid` ใน `case` และ `transfer_leg` | offline-first queue — client สร้าง id เองแล้ว sync ทีหลังโดยไม่ซ้ำ |
| `vehicle_type` มี `rotary`, `fixed_wing` | ส่งกลับทางอากาศยาน |
| `role_of_care` 4 ระดับ | ส่งกลับจากการรบซึ่งมี 4 ทอด |
| `transfer_leg.leg_no` ไม่จำกัดจำนวน | ภารกิจสาธารณภัยที่อาจมีทอดมากกว่าที่คาด |
| `event_log.payload jsonb` | เก็บ context เพิ่มโดยไม่ต้อง migrate schema |
| `assessment` แยกจาก `case` | export FHIR Observation ในอนาคต |
