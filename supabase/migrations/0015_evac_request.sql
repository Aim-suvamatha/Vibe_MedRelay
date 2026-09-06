-- =============================================================
-- 0015_evac_request.sql — จุดรับผู้ป่วย และการเปิดคำขอส่งกลับแบบ atomic
-- รองรับ Prompt 07 (F1 หน้าขอส่งกลับ)
--
-- ไฟล์นี้ตอบสองโจทย์ที่หน้าเว็บทำเองไม่ได้
--
--   1. "เลือกจุดรับจากรายการที่กำหนดไว้ล่วงหน้า ไม่ใช้ GPS"
--      AI_RULES §3.1 ห้ามเก็บพิกัดเรียลไทม์ของบุคคล และหลักนิยมทางทหารก็ใช้
--      จุดนัดพบที่ตกลงกันไว้ก่อนอยู่แล้ว จึงต้องมีตารางให้เลือก ไม่ใช่ช่องพิมพ์อิสระ
--
--   2. "กดส่งครั้งเดียว สร้าง 3 แถวใน 3 ตาราง ถ้าพลาดต้อง rollback ทั้งหมด"
--      PostgREST ไม่มี API สำหรับเปิด transaction คร่อมหลายคำขอ
--      ถ้าให้ฝั่งเว็บยิง insert สามครั้งติดกัน แล้วเน็ตหลุดหลังครั้งแรก
--      จะเหลือเคสที่ไม่มีทอดและไม่มีผลประเมินค้างอยู่ในระบบ
--      ทางแก้เดียวคือย้ายตรรกะมาไว้ในฐานข้อมูล — ตัว function เป็นหนึ่ง statement
--      Postgres จึงรับประกัน atomic ให้เองโดยไม่ต้องเขียน begin/commit
-- =============================================================

-- -------------------------------------------------------------
-- pickup_point — จุดนัดรับผู้ป่วยที่กำหนดไว้ล่วงหน้า
-- -------------------------------------------------------------
create table public.pickup_point (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.unit(id) on delete cascade,
  name        text not null,                 -- 'ฐานร่อง 291 ประตูหลัง'
  grid_ref    text,                          -- พิกัดอ้างอิง กรอกไว้ล่วงหน้า ไม่ได้ดึงจากเครื่อง
  note        text,                          -- 'รถใหญ่เข้าไม่ได้ ต้องใช้รถเล็กรับต่อ'
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint pickup_point_unique_per_unit unique (unit_id, name)
);

create index pickup_point_unit_idx
  on public.pickup_point(unit_id) where is_active;

comment on table public.pickup_point is
  'จุดนัดรับที่กำหนดไว้ล่วงหน้า — ใช้แทนการอ่านพิกัดจากเครื่องผู้ใช้ (AI_RULES §3.1)';

alter table public.pickup_point enable row level security;

-- ทุกคนที่ล็อกอินอ่านได้ เหมือนตาราง unit
-- เพราะศูนย์สั่งการและผู้ขนส่งต้องรู้ว่าจุดนัดรับอยู่ที่ไหน แม้จะคนละหน่วยกับต้นทาง
create policy pickup_point_select on public.pickup_point
  for select to authenticated using (true);

create policy pickup_point_write on public.pickup_point
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));


-- -------------------------------------------------------------
-- create_evac_request — เปิดเคสพร้อมทอดแรกและผลประเมินแรกรับ
--
-- ★ ต้องเป็น SECURITY INVOKER (ค่าปริยายของ plpgsql) ห้ามเปลี่ยนเป็น DEFINER
--   ถ้าเปลี่ยนเป็น DEFINER ทุก insert จะรันในนามเจ้าของ function ซึ่งข้าม RLS ทั้งหมด
--   แล้วใครก็ตามที่ล็อกอินได้จะเปิดเคสในนามหน่วยอื่นได้ทันที
--   ตอนนี้ทุกบรรทัดยังผ่าน policy เดิมใน 0010 ตามปกติ
--     case_insert       บังคับ has_role('sender') · created_by = auth.uid()
--                       · origin_unit_id = current_unit_id() · is_synthetic = true
--     leg_insert        บังคับบทบาทและ can_see_case()
--     assessment_insert บังคับ assessed_by = auth.uid()
--
-- ไม่รับพารามิเตอร์เวลาใดๆ ทั้งสิ้น — requested_at มาจาก default now() ของตาราง
-- ยกเว้น symptom_onset_at ซึ่งเป็นเวลาในอดีตที่ผู้ใช้ทราบเอง (ตามสเปค Prompt 07 ข้อ 6)
-- -------------------------------------------------------------
create or replace function public.create_evac_request(
  p_precedence        public.precedence_level,
  p_chief_complaint   text,
  p_to_unit_id        uuid,
  p_patient_alias     text                     default null,
  p_patient_count     int                      default 1,
  p_mechanism         text                     default null,
  p_symptom_onset_at  timestamptz              default null,
  p_pickup_point_id   uuid                     default null,
  p_pickup_marking    text                     default null,
  p_report_category   public.report_category   default null,
  p_patient_mobility  public.patient_mobility  default null,
  p_transport_mode    public.transport_mode    default null,
  p_security_status   public.security_status   default null,
  p_nbc_status        public.nbc_status        default 'none',
  p_triage            public.triage_color      default null,
  p_avpu              public.avpu_level        default null,
  p_gcs               int                      default null,
  p_sbp               int                      default null,
  p_dbp               int                      default null,
  p_pulse             int                      default null,
  p_resp_rate         int                      default null,
  p_spo2              int                      default null,
  p_findings          text                     default null,
  p_client_uuid       uuid                     default null
)
returns table (case_id uuid, case_code text, leg_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_unit        uuid := public.current_unit_id();
  v_role_level  public.role_of_care;
  v_case_id     uuid;
  v_case_code   text;
  v_leg_id      uuid;
begin
  if v_unit is null then
    raise exception 'ไม่พบหน่วยต้นสังกัดของผู้ใช้ปัจจุบัน' using errcode = '42501';
  end if;

  if p_to_unit_id = v_unit then
    raise exception 'หน่วยปลายทางต้องไม่ใช่หน่วยต้นทาง' using errcode = '22023';
  end if;

  -- ระดับชั้นการรักษาของทอดนี้คือระดับของหน่วยปลายทาง
  select role_level into strict v_role_level
  from public.unit where id = p_to_unit_id;

  -- 1) เคส — case_code เติมโดย trigger ใน 0009 · requested_at มาจาก default now()
  --
  -- ⚠⚠ ห้ามใช้ INSERT ... RETURNING กับตารางที่ policy SELECT เรียก can_see_case() ⚠⚠
  --
  --   RETURNING บังคับให้ Postgres เอา policy ของ SELECT มาตรวจแถวที่เพิ่งสร้างด้วย
  --   แต่ can_see_case() ประกาศเป็น stable และไปอ่านตาราง "case" เอง
  --   ฟังก์ชัน stable มองข้อมูลด้วย snapshot ณ ตอนเริ่มคำสั่ง
  --   จึง **มองไม่เห็นแถวที่คำสั่งเดียวกันนั้นเพิ่งสร้าง** แล้วตอบว่าไม่มีสิทธิ์
  --   ผลคือ insert ถูกปฏิเสธด้วยข้อความ "new row violates row-level security policy"
  --   ทั้งที่ policy ของ INSERT ผ่านครบทุกเงื่อนไข — เป็นข้อความที่ชวนหลงทางมาก
  --
  --   ทางแก้: สร้าง id เองก่อน insert แล้วอ่านค่าที่ trigger เติมในคำสั่งถัดไป
  --   คำสั่งใหม่ได้ snapshot ใหม่ที่มีแถวนั้นแล้ว can_see_case จึงตอบ true ตามปกติ
  --
  --   ⚠ กฎเดียวกันนี้ใช้กับฝั่งเว็บด้วย — .insert().select() ของ supabase-js
  --     คือ INSERT ... RETURNING จะล้มแบบเดียวกัน ให้ insert แล้วค่อย select แยก
  v_case_id := gen_random_uuid();

  insert into public."case" (
    id,
    patient_alias, patient_count, origin_unit_id, precedence,
    chief_complaint, mechanism, symptom_onset_at, triage,
    pickup_grid, pickup_marking, report_category, patient_mobility,
    transport_mode, security_status, nbc_status,
    created_by, client_uuid, is_synthetic
  )
  values (
    v_case_id,
    p_patient_alias, p_patient_count, v_unit, p_precedence,
    p_chief_complaint, p_mechanism, p_symptom_onset_at, p_triage,
    (select grid_ref from public.pickup_point where id = p_pickup_point_id),
    coalesce(p_pickup_marking,
             (select name from public.pickup_point where id = p_pickup_point_id)),
    p_report_category, p_patient_mobility,
    p_transport_mode, p_security_status, coalesce(p_nbc_status, 'none'),
    auth.uid(), p_client_uuid, true
  );

  -- คำสั่งแยก จึงได้ snapshot ใหม่ที่เห็นแถวข้างบนแล้ว
  -- ต้อง alias เป็น c แล้วเขียน c.case_code เพราะ returns table (…, case_code, …)
  -- ทำให้ case_code เป็นชื่อตัวแปรของ plpgsql ไปชนกับชื่อคอลัมน์
  select c.case_code into strict v_case_code
  from public."case" c where c.id = v_case_id;

  -- 2) ทอดแรก — status = 'pending' เสมอ รอศูนย์สั่งการจัดรถ
  --    ห้ามข้ามไป dispatched เอง เพราะเวลาต้องเกิดจากการกดปุ่มจริง (Prompt 04)
  -- เหตุผลเดียวกับข้างบน — leg_select ก็เรียก can_see_case() จึงห้าม RETURNING เช่นกัน
  v_leg_id := gen_random_uuid();

  insert into public.transfer_leg (
    id, case_id, leg_no, from_unit_id, to_unit_id, role_level, status
  )
  values (v_leg_id, v_case_id, 1, v_unit, p_to_unit_id, v_role_level, 'pending');

  -- 3) ผลประเมินแรกรับ — บันทึกเฉพาะเมื่อมีค่าอย่างน้อยหนึ่งช่อง
  --    หน้างานอาจยังวัดอะไรไม่ได้เลย การบังคับให้มีแถวเปล่าไม่ได้ช่วยใคร
  if p_triage is not null or p_avpu is not null or p_gcs is not null
     or p_sbp is not null or p_dbp is not null or p_pulse is not null
     or p_resp_rate is not null or p_spo2 is not null
     or nullif(btrim(coalesce(p_findings, '')), '') is not null
  then
    insert into public.assessment (
      case_id, leg_id, kind, triage, avpu, gcs, sbp, dbp,
      pulse, resp_rate, spo2, findings, assessed_by
    )
    values (
      v_case_id, v_leg_id, 'initial', p_triage, p_avpu, p_gcs, p_sbp, p_dbp,
      p_pulse, p_resp_rate, p_spo2, nullif(btrim(coalesce(p_findings, '')), ''),
      auth.uid()
    );
  end if;

  return query select v_case_id, v_case_code, v_leg_id;
end;
$$;

comment on function public.create_evac_request is
  'เปิดเคส + ทอดแรก + ผลประเมินแรกรับในหนึ่ง statement จึง atomic โดยอัตโนมัติ · SECURITY INVOKER จึงยังผ่าน RLS ทุกชั้น';

-- ผู้ใช้ที่ล็อกอินแล้วเรียกได้ แต่ RLS ข้างในยังตัดสินอีกทีว่าทำได้จริงหรือไม่
revoke all on function public.create_evac_request from public, anon;
grant execute on function public.create_evac_request to authenticated;
