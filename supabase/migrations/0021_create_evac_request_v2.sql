-- =============================================================
-- 0021_create_evac_request_v2.sql — ขยาย create_evac_request ให้รับทั้งแบบฟอร์ม
--
-- ★ ต้อง drop ก่อน create ไม่ใช่ create or replace
--   การเพิ่มพารามิเตอร์ทำให้ signature เปลี่ยน create or replace จะได้ function
--   สองตัวซ้อนกัน แล้ว PostgREST จะเลือกไม่ถูกว่าจะเรียกตัวไหน
--
-- ★ กฎสามข้อจากหัวไฟล์ 0015 ยังใช้ทุกข้อ อย่าแก้
--   1. SECURITY INVOKER — ถ้าเปลี่ยนเป็น DEFINER ใครก็เปิดเคสในนามหน่วยอื่นได้
--   2. ห้าม INSERT ... RETURNING กับตารางที่ policy SELECT เรียก can_see_case()
--      เพราะ can_see_case เป็น stable จึงมองไม่เห็นแถวที่คำสั่งเดียวกันเพิ่งสร้าง
--      กฎนี้ใช้กับ casualty · treatment · property_item ที่เพิ่มใหม่ด้วย
--      (ในไฟล์นี้เลี่ยงได้ง่ายเพราะไม่ต้องอ่านค่ากลับจากสามตารางนั้นเลย)
--   3. ไม่รับพารามิเตอร์เวลา ยกเว้น p_symptom_onset_at และ given_at ของ treatment
--      ซึ่งเป็นข้อยกเว้นที่มีเหตุผลอธิบายไว้ใน 0020
--
-- ★ ยังเป็นหนึ่ง statement จึง atomic เหมือนเดิม
--   กดปุ่มครั้งเดียวได้ case + transfer_leg + assessment + casualty
--   + treatment หลายแถว + property_item หลายแถว หรือไม่ได้อะไรเลย
-- =============================================================

drop function if exists public.create_evac_request(
  public.precedence_level, text, uuid, text, int, text, timestamptz, uuid, text,
  public.report_category, public.patient_mobility, public.transport_mode,
  public.security_status, public.nbc_status, public.triage_color, public.avpu_level,
  int, int, int, int, int, int, text, uuid
);

create function public.create_evac_request(
  -- ── พารามิเตอร์เดิม 24 ตัว ชื่อและลำดับไม่เปลี่ยน ────────────
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
  p_client_uuid       uuid                     default null,

  -- ── ใหม่: ช่องที่ฟอร์มเก็บเพิ่ม ───────────────────────────────
  -- พิกัดจุดรับที่พิมพ์เองหรือดึงจากเครื่อง ใช้เมื่อฐานที่นัดไว้เสียหาย
  p_pickup_grid        text                    default null,
  p_temperature        numeric                 default null,
  p_patient_rank_group public.rank_group       default null,
  p_on_duty            boolean                 default null,
  p_hostile_action     boolean                 default null,
  p_operation_type     text                    default null,
  p_operating_base     text                    default null,
  p_injury_place       text                    default null,
  p_injury_grid        text                    default null,
  p_patient_category   public.patient_category default null,
  p_airway_status      public.airway_status    default null,
  p_chest_status       public.chest_status     default null,
  p_wound_status       public.wound_status     default null,
  p_other_note         text                    default null,
  p_injury_sites       jsonb                   default '[]'::jsonb,
  p_protective_gear    jsonb                   default '[]'::jsonb,

  -- ── ใหม่: ก้อนข้อมูลที่เป็นตารางลูก ──────────────────────────
  -- ใช้ jsonb แทนการเพิ่มพารามิเตอร์อีก 20 ตัว
  -- jsonb_populate_record ให้ Postgres แปลงชนิดและตรวจ enum ให้เอง
  -- จึงยังได้ข้อความ error ระดับฐานข้อมูลเหมือนพารามิเตอร์ธรรมดา
  p_casualty           jsonb                   default null,
  p_treatments         jsonb                   default '[]'::jsonb,
  p_property_items     jsonb                   default '[]'::jsonb
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
  v_triage      public.triage_color;
  v_pickup_grid text;
  v_cas         public.casualty;
begin
  if v_unit is null then
    raise exception 'ไม่พบหน่วยต้นสังกัดของผู้ใช้ปัจจุบัน' using errcode = '42501';
  end if;

  if p_to_unit_id = v_unit then
    raise exception 'หน่วยปลายทางต้องไม่ใช่หน่วยต้นทาง' using errcode = '22023';
  end if;

  select role_level into strict v_role_level
  from public.unit where id = p_to_unit_id;

  -- ── สี triage มาจากความเร่งด่วน ไม่ใช่ช่องแยก ────────────────
  -- ฟอร์มตัดช่องเลือก triage ออกแล้ว (คำสั่งเจ้าของโครงการ 8 ก.ย. 2569)
  -- แต่คอลัมน์ยังต้องมีค่า เพราะแดชบอร์ดและการ์ดทุกใบอ่านจากมัน
  -- p_triage ยังรับอยู่เพื่อให้ชุดทดสอบเดิมและผู้เรียกเก่ายังทำงานได้
  v_triage := coalesce(
    p_triage,
    -- ต้อง cast ทุกกิ่ง เพราะ coalesce จับคู่ triage_color กับ text ไม่ได้
    case p_precedence
      when 'urgent'   then 'red'::public.triage_color
      when 'priority' then 'yellow'::public.triage_color
      when 'routine'  then 'green'::public.triage_color
      when 'died'     then 'black'::public.triage_color
    end
  );

  -- ── จุดรับ ────────────────────────────────────────────────────
  -- พิกัดที่กรอกเองมาก่อนจุดที่เลือกจากรายการ เพราะผู้ใช้จะกรอกเองก็ต่อเมื่อ
  -- จุดที่นัดไว้ใช้ไม่ได้แล้ว ค่าที่พิมพ์สดจึงเป็นค่าที่ถูกต้องกว่าเสมอ
  --
  -- ไม่ raise เมื่อไม่มีทั้งสองอย่าง — หน้างานอาจยังไม่รู้จุดรับตอนเปิดคำขอ
  -- (ชุดทดสอบ L6 · L7 ใน form_test.sql ก็เรียกโดยไม่ส่งจุดรับ)
  -- การบังคับให้ต้องมีทำที่ฝั่งฟอร์มด้วย zod ซึ่งบอกผู้ใช้ได้ตรงช่องที่ขาด
  v_pickup_grid := coalesce(
    nullif(btrim(coalesce(p_pickup_grid, '')), ''),
    (select grid_ref from public.pickup_point where id = p_pickup_point_id)
  );

  -- ── 1) เคส ───────────────────────────────────────────────────
  -- สร้าง id เองก่อน insert ด้วยเหตุผลใน ⚠ ข้อ 2 ของหัวไฟล์
  v_case_id := gen_random_uuid();

  insert into public."case" (
    id,
    patient_alias, patient_count, origin_unit_id, precedence,
    chief_complaint, mechanism, symptom_onset_at, triage,
    pickup_grid, pickup_marking, report_category, patient_mobility,
    transport_mode, security_status, nbc_status,
    patient_rank_group, on_duty, hostile_action, operation_type,
    operating_base, injury_place, injury_grid,
    patient_category, airway_status, chest_status, wound_status, other_note,
    injury_sites, protective_gear,
    created_by, client_uuid, is_synthetic
  )
  values (
    v_case_id,
    p_patient_alias, coalesce(p_patient_count, 1), v_unit, p_precedence,
    p_chief_complaint, p_mechanism, p_symptom_onset_at, v_triage,
    v_pickup_grid,
    coalesce(p_pickup_marking,
             (select name from public.pickup_point where id = p_pickup_point_id)),
    p_report_category, p_patient_mobility,
    p_transport_mode, p_security_status, coalesce(p_nbc_status, 'none'),
    p_patient_rank_group, p_on_duty, p_hostile_action, p_operation_type,
    p_operating_base, p_injury_place, p_injury_grid,
    p_patient_category, p_airway_status, p_chest_status, p_wound_status, p_other_note,
    coalesce(p_injury_sites, '[]'::jsonb), coalesce(p_protective_gear, '[]'::jsonb),
    auth.uid(), p_client_uuid, true
  );

  select c.case_code into strict v_case_code
  from public."case" c where c.id = v_case_id;

  -- ── 2) ทอดแรก ────────────────────────────────────────────────
  v_leg_id := gen_random_uuid();

  insert into public.transfer_leg (
    id, case_id, leg_no, from_unit_id, to_unit_id, role_level, status
  )
  values (v_leg_id, v_case_id, 1, v_unit, p_to_unit_id, v_role_level, 'pending');

  -- ── 3) ประวัติผู้ป่วย ────────────────────────────────────────
  -- ข้ามถ้าไม่ได้ส่งมา หรือส่งมาแต่ไม่มีช่องไหนมีค่าเลย
  -- แถวเปล่าที่มีแต่ case_id ไม่ได้ช่วยใคร และทำให้ query ที่นับ "เคสที่มีประวัติ" ผิด
  if p_casualty is not null and p_casualty <> '{}'::jsonb then
    -- ตัดคีย์ที่ระบบเป็นคนกำหนดออกก่อน ไม่เชื่อค่าที่ client ส่งมาสำหรับสี่ช่องนี้
    v_cas := jsonb_populate_record(
      null::public.casualty,
      p_casualty - 'case_id' - 'recorded_by' - 'recorded_at' - 'created_at'
    );

    if v_cas.rank_th is not null or v_cas.first_name is not null
       or v_cas.last_name is not null or v_cas.service_number is not null
       or v_cas.affiliation is not null or v_cas.branch is not null
       or v_cas.age_years is not null or v_cas.blood_group is not null
       or v_cas.drug_allergy is not null or v_cas.food_allergy is not null
       or v_cas.chronic_conditions is not null or v_cas.regular_meds is not null
       or v_cas.past_history is not null or v_cas.phone is not null
       or v_cas.weight_kg is not null or v_cas.height_cm is not null
    then
      v_cas.case_id     := v_case_id;
      v_cas.recorded_by := auth.uid();
      -- คอลัมน์เวลาสองตัวนี้เป็น not null default now() ถ้าปล่อยเป็น NULL จาก record
      -- ค่า default จะไม่ทำงาน เพราะ INSERT ... SELECT ส่งค่า NULL เข้าไปตรงๆ
      v_cas.recorded_at := now();
      v_cas.created_at  := now();
      insert into public.casualty select (v_cas).*;
    end if;
  end if;

  -- ── 4) ผลประเมินแรกรับ ───────────────────────────────────────
  --     บันทึกเฉพาะเมื่อมีค่าอย่างน้อยหนึ่งช่อง หน้างานอาจยังวัดอะไรไม่ได้เลย
  if p_avpu is not null or p_gcs is not null
     or p_sbp is not null or p_dbp is not null or p_pulse is not null
     or p_resp_rate is not null or p_spo2 is not null or p_temperature is not null
     or nullif(btrim(coalesce(p_findings, '')), '') is not null
  then
    insert into public.assessment (
      case_id, leg_id, kind, triage, avpu, gcs, sbp, dbp,
      pulse, resp_rate, spo2, temperature, findings, assessed_by
    )
    values (
      v_case_id, v_leg_id, 'initial', v_triage, p_avpu, p_gcs, p_sbp, p_dbp,
      p_pulse, p_resp_rate, p_spo2, p_temperature,
      nullif(btrim(coalesce(p_findings, '')), ''), auth.uid()
    );
  end if;

  -- ── 5) การรักษาที่ให้ไปแล้วก่อนส่ง ───────────────────────────
  -- leg_id เป็น null โดยเจตนา เพราะการรักษาชุดนี้ให้ที่จุดเกิดเหตุ ก่อนขึ้นรถ
  -- given_by บังคับเป็น auth.uid() ในโค้ด ไม่รับค่าจาก client
  -- (policy treatment_insert บังคับซ้ำอีกชั้นอยู่แล้ว แต่บังคับที่นี่ด้วยจะได้
  --  ไม่ต้องพึ่ง error ของ RLS ซึ่งอ่านไม่รู้เรื่องสำหรับผู้ใช้)
  if p_treatments is not null and jsonb_array_length(p_treatments) > 0 then
    if exists (
      select 1
      from jsonb_to_recordset(p_treatments) as t(given_at timestamptz)
      where t.given_at > now()
    ) then
      raise exception 'เวลาที่ให้การรักษาต้องไม่อยู่ในอนาคต' using errcode = '22023';
    end if;

    insert into public.treatment (
      case_id, leg_id, tx_code, detail, dose, route, site, given_at, given_by
    )
    select
      v_case_id, null, t.tx_code, t.detail, t.dose, t.route, t.site,
      coalesce(t.given_at, now()), auth.uid()
    from jsonb_to_recordset(p_treatments) as t(
      tx_code  public.tx_code,
      detail   text,
      dose     text,
      route    text,
      site     text,
      given_at timestamptz
    )
    where t.tx_code is not null;
  end if;

  -- ── 6) บัญชีสิ่งของ ──────────────────────────────────────────
  if p_property_items is not null and jsonb_array_length(p_property_items) > 0 then
    insert into public.property_item (
      case_id, item_name, qty, unit_label, weapon_serial, cash_thb, note, recorded_by
    )
    select
      v_case_id, btrim(i.item_name), coalesce(i.qty, 1),
      i.unit_label, i.weapon_serial, i.cash_thb, i.note, auth.uid()
    from jsonb_to_recordset(p_property_items) as i(
      item_name     text,
      qty           int,
      unit_label    text,
      weapon_serial text,
      cash_thb      numeric,
      note          text
    )
    where nullif(btrim(coalesce(i.item_name, '')), '') is not null;
  end if;

  return query select v_case_id, v_case_code, v_leg_id;
end;
$$;

comment on function public.create_evac_request is
  'เปิดเคส + ทอดแรก + ประวัติผู้ป่วย + ผลประเมิน + การรักษา + บัญชีสิ่งของ ในหนึ่ง statement จึง atomic โดยอัตโนมัติ · SECURITY INVOKER จึงยังผ่าน RLS ทุกชั้น';

revoke all on function public.create_evac_request from public, anon;
grant execute on function public.create_evac_request to authenticated;


-- =============================================================
-- release_tourniquet — คลายสายรัดห้ามเลือด
--
-- ★ ทำไมต้องเป็น function ไม่ใช่ .update() จากฝั่งเว็บตรงๆ
--   เวลาต้องมาจาก now() ของฐานข้อมูล ไม่ใช่นาฬิกาของเครื่องที่รันโค้ด
--   ตามหลักการเดิมของโครงการทั้งหมด (Prompt 04)
--   supabase-js ส่งค่าเป็น literal เท่านั้น เรียก now() ใน update ไม่ได้
--   ถ้าปล่อยให้ส่งเวลาจาก Node เข้ามา นาฬิกาของ Vercel ที่คลาดจากฐานข้อมูล
--   ไม่กี่มิลลิวินาทีจะไปชน constraint treatment_release_order ได้จริง
--   ในกรณีที่รัดแล้วคลายทันที ซึ่งเป็นบั๊กที่เกิดนานๆ ครั้งและหาสาเหตุยากมาก
--
-- ★ SECURITY INVOKER (ค่าปริยายของ plpgsql) ห้ามเปลี่ยน
--   policy treatment_release เป็นคนตัดสินว่าใครคลายได้ ไม่ใช่ function นี้
--   ทุกคนที่ can_see_case() คลายได้ ไม่จำกัดว่าต้องเป็นคนที่รัด
--   และ using (tourniquet_off is null) ทำให้คลายได้ครั้งเดียวเสมอ
--
-- ★ คืนจำนวนแถวที่แก้ได้จริง ไม่โยน exception เมื่อทำไม่ได้
--   ทำไม่ได้มีสองสาเหตุที่แยกกันไม่ออกจากฝั่งเว็บอยู่แล้ว — ไม่มีสิทธิ์ หรือคลายไปแล้ว
--   ทั้งสองกรณีหน้าจอทำอย่างเดียวกันคือโหลดสถานะล่าสุดมาแสดง
-- =============================================================
create or replace function public.release_tourniquet(p_id uuid)
returns int
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  update public.treatment
     set tourniquet_off = now(),
         released_by    = auth.uid()
   where id = p_id;

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.release_tourniquet is
  'คลายสายรัดห้ามเลือด · เวลามาจาก now() ของฐานข้อมูล · SECURITY INVOKER จึงยังผ่าน policy treatment_release';

revoke all on function public.release_tourniquet from public, anon;
grant execute on function public.release_tourniquet to authenticated;
