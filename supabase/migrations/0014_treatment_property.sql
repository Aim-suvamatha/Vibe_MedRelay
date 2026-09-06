-- =============================================================
-- 0014_treatment_property.sql — สองตารางใหม่จากแบบฟอร์มกระดาษ
--
--   treatment      ← ทบ.466-901 ด้านหลัง (น้ำเกลือ · ยาแก้ปวด · ยาฆ่าเชื้อ · เวลารัดขันชะเนาะ)
--   property_item  ← ทบ.466-903 บัตรส่งสิ่งของคนไข้
--
-- ทำไม treatment ต้องเป็นตาราง ไม่ใช่ช่องข้อความใน assessment
--   assessment.treatment เดิมเป็น text ก้อนเดียว ค้นไม่ได้และนับไม่ได้
--   แต่แบบฟอร์มกระดาษบันทึกการรักษาเป็น "รายการที่มีเวลากำกับทีละรายการ"
--   และมีเรื่องที่ text ทำไม่ได้เลยคือ **การนับเวลาสายรัดห้ามเลือด**
--   แบบฟอร์มมีช่อง "เวลารัด/ขันชะเนาะ" แยกไว้ต่างหากเพราะรัดนานเกิน 2 ชม.
--   เสี่ยงต่อการสูญเสียอวัยวะ ระบบต้องเตือนได้เอง ซึ่งต้องมีคอลัมน์เวลาที่ query ได้
-- =============================================================

create table public.treatment (
  id             uuid primary key default gen_random_uuid(),
  case_id        uuid not null references public."case"(id) on delete cascade,
  -- ผูกกับทอดที่ให้การรักษา ถ้าให้ตั้งแต่ก่อนขึ้นรถจะเป็น null
  leg_id         uuid references public.transfer_leg(id) on delete set null,

  tx_code        public.tx_code not null,
  detail         text,   -- ชื่อยา หรือรายละเอียด เช่น 'NSS'
  dose           text,   -- ขนาด เช่น '500 ml' · '4 mg' (เก็บเป็น text เพราะหน่วยไม่เหมือนกัน)
  route          text,   -- ช่องทาง เช่น 'IV' · 'IM' · 'PO'
  site           text,   -- ตำแหน่ง เช่น 'แขนขวา' — จำเป็นมากสำหรับ tourniquet

  -- ⏱ เวลาที่ให้การรักษา ตั้งอัตโนมัติตอนกดปุ่ม
  given_at       timestamptz not null default now(),
  -- ⏱ เวลาคลายสายรัด — ช่องเดียวในตารางนี้ที่แก้ทีหลังได้ (ดู RLS ด้านล่าง)
  tourniquet_off timestamptz,

  given_by       uuid not null references public.profile(id),
  released_by    uuid references public.profile(id),
  created_at     timestamptz not null default now(),

  -- คลายได้เฉพาะสิ่งที่รัดไว้
  constraint treatment_release_only_tourniquet
    check (tourniquet_off is null or tx_code = 'tourniquet'),
  -- คลายหลังรัดเสมอ กันเวลาติดลบบนแดชบอร์ด (เหตุผลเดียวกับ leg_time_order ใน 0006)
  constraint treatment_release_order
    check (tourniquet_off is null or tourniquet_off >= given_at),
  -- มีเวลาคลายต้องมีคนคลาย
  constraint treatment_release_pair
    check ((tourniquet_off is null) = (released_by is null))
);

create index treatment_case_idx on public.treatment(case_id, given_at);
create index treatment_leg_idx  on public.treatment(leg_id);

-- index สำหรับคำถามเดียวที่ต้องตอบได้เร็วที่สุด: "ตอนนี้มีสายรัดเส้นไหนยังไม่ถูกคลายบ้าง"
-- partial index จึงเล็กมากและตอบได้ทันทีแม้ตารางโตขึ้นเป็นหมื่นแถว
create index treatment_open_tourniquet_idx
  on public.treatment(given_at)
  where tx_code = 'tourniquet' and tourniquet_off is null;

comment on table public.treatment is
  'การรักษาที่ให้ทีละรายการพร้อมเวลา ถอดจาก ทบ.466-901 ด้านหลัง · แก้ไขไม่ได้ยกเว้นเวลาคลายสายรัด';


-- =============================================================
-- property_item — ทบ.466-903 บัตรส่งสิ่งของคนไข้
--
-- ทำไมต้องมี: เมื่อผู้ป่วยถูกส่งกลับ อาวุธประจำกายและของมีค่าต้องเดินทางไปด้วย
-- และต้องมีผู้ลงนามรับส่งทุกทอด ของหายระหว่างทางเป็นปัญหาทางวินัยและทางคดี
-- transfer_leg.property_ok ใน 0013 คือช่องติ๊กว่าครบ ตารางนี้คือรายการว่ามีอะไรบ้าง
-- =============================================================
create table public.property_item (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public."case"(id) on delete cascade,

  item_name     text not null,
  qty           int not null default 1 check (qty > 0),
  unit_label    text,                                   -- 'ชิ้น' · 'กระบอก' · 'ซอง'
  weapon_serial text,                                   -- เลขทะเบียนอาวุธ ถ้าเป็นอาวุธ
  cash_thb      numeric(12,2) check (cash_thb >= 0),    -- เงินสด บาท
  note          text,

  recorded_by   uuid not null references public.profile(id),
  recorded_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index property_item_case_idx on public.property_item(case_id);

comment on column public.property_item.weapon_serial is
  'เลขทะเบียนอาวุธ — ระบุตัวบุคคลได้ทางอ้อม เฟส prototype ต้องเป็นเลขสมมติเท่านั้น (AI_RULES §2)';


-- =============================================================
-- RLS — ทั้งสองตารางต้องเปิดและต้องมี policy (AI_RULES §2 · Prompt 05)
-- =============================================================
alter table public.treatment     enable row level security;
alter table public.property_item enable row level security;

-- -------------------------------------------------------------
-- treatment — อ่านได้ถ้าเห็นเคส · เพิ่มได้ · ลบไม่ได้
--
-- ไม่มี policy สำหรับ DELETE โดยเจตนา เหตุผลเดียวกับ assessment ใน 0010
-- บันทึกการรักษาคือเวชระเบียน ถ้าบันทึกผิดให้บันทึกรายการแก้ ไม่ใช่ลบของเดิม
--
-- UPDATE เปิดแคบที่สุดเท่าที่จะแคบได้ — ให้ปิดสายรัดที่ยังเปิดอยู่เท่านั้น
-- และจำกัดถึงระดับคอลัมน์ด้วย grant ด้านล่าง ไม่ใช่แค่ระดับแถว
-- -------------------------------------------------------------
create policy treatment_select on public.treatment
  for select to authenticated
  using (public.can_see_case(case_id));

create policy treatment_insert on public.treatment
  for insert to authenticated
  with check (given_by = auth.uid() and public.can_see_case(case_id));

create policy treatment_release on public.treatment
  for update to authenticated
  using (
    public.can_see_case(case_id)
    and tx_code = 'tourniquet'
    and tourniquet_off is null       -- คลายได้ครั้งเดียว ปิดแล้วปิดเลย
  )
  with check (
    public.can_see_case(case_id)
    and tourniquet_off is not null   -- ห้ามใช้ policy นี้เพื่อล้างค่ากลับเป็น null
    and released_by = auth.uid()
  );

-- ระดับแถวอย่างเดียวไม่พอ ถ้าไม่ตัดสิทธิ์ระดับคอลัมน์ ผู้ใช้จะแก้ dose หรือ given_at
-- ของแถว tourniquet ที่ยังเปิดอยู่ได้ผ่าน policy ด้านบน
revoke update on public.treatment from anon, authenticated;
grant  update (tourniquet_off, released_by) on public.treatment to authenticated;

-- -------------------------------------------------------------
-- property_item — แก้ได้จนกว่าจะส่งมอบ
--
-- ต่างจาก treatment โดยเจตนา: บัญชีสิ่งของไม่ใช่เวชระเบียน
-- นับผิดแล้วต้องแก้ให้ตรงกับของจริงได้ ไม่งั้นผู้ใช้จะเลี่ยงไปจดในกระดาษแทน
-- แต่แก้ได้เฉพาะคนที่เป็นผู้บันทึกเอง และเห็นเคสนั้นอยู่
-- -------------------------------------------------------------
create policy property_item_select on public.property_item
  for select to authenticated
  using (public.can_see_case(case_id));

create policy property_item_insert on public.property_item
  for insert to authenticated
  with check (recorded_by = auth.uid() and public.can_see_case(case_id));

create policy property_item_update on public.property_item
  for update to authenticated
  using (recorded_by = auth.uid() and public.can_see_case(case_id))
  with check (recorded_by = auth.uid() and public.can_see_case(case_id));

create policy property_item_delete on public.property_item
  for delete to authenticated
  using (recorded_by = auth.uid() and public.can_see_case(case_id));
