-- =============================================================
-- 0010_rls.sql — Row Level Security
-- อ้างอิง DATABASE.md §5 · Prompt 05
--
-- ทำไม policy แบบ using (true) ถึงอันตราย
--   anon key เป็นค่าที่เปิดเผยใน browser ใครก็หยิบไปได้จาก DevTools
--   สิ่งเดียวที่กั้นระหว่าง anon key กับข้อมูลทั้งตารางคือ RLS policy
--   policy ที่เขียน using (true) จึงเท่ากับเปิดตารางนั้นให้อินเทอร์เน็ตทั้งใบ
--   การซ่อนปุ่มบนหน้าจอไม่ใช่ security — การบังคับที่ชั้น database คือ security
--
-- ข้อยกเว้นเดียวที่ยอมรับในไฟล์นี้คือ event_log INSERT with check (true)
--   เพราะเป็น append-only audit log ที่ไม่มีทางอ่านย้อนได้ถ้าไม่เห็นเคส
-- =============================================================


-- -------------------------------------------------------------
-- 5.1 Helper functions
--
-- ทุกตัวเป็น security definer เพื่อสองเหตุผล
--   1. ตัดวงจร recursion — policy ของ profile เรียก function ที่อ่าน profile
--   2. ให้ policy ของ "case" ตรวจ transfer_leg ได้โดยไม่ติด policy ของ leg
-- set search_path = public กันการ hijack ด้วย schema ปลอม
-- -------------------------------------------------------------

-- หน่วยที่ผู้ใช้ปัจจุบันสังกัด
create or replace function public.current_unit_id()
returns uuid language sql stable security definer set search_path = public as $$
  select unit_id from public.profile where id = auth.uid()
$$;

-- บทบาททั้งหมดของผู้ใช้ปัจจุบัน
create or replace function public.current_roles()
returns public.app_role[] language sql stable security definer set search_path = public as $$
  select coalesce((select roles from public.profile where id = auth.uid()), '{}'::public.app_role[])
$$;

-- ผู้ใช้ปัจจุบันมีบทบาทนี้หรือไม่
create or replace function public.has_role(r public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select r = any(roles) from public.profile where id = auth.uid()), false)
$$;

-- ผู้ใช้ปัจจุบันเกี่ยวข้องกับเคสนี้หรือไม่
--   เป็นผู้เปิดเคส หรือหน่วยของตนเป็นต้นทาง/ปลายทางของทอดใดทอดหนึ่ง
--   หรือตนเป็นผู้ขนส่ง/ผู้รับของทอดใดทอดหนึ่ง หรือมีบทบาทระดับอำนวยการ
create or replace function public.can_see_case(c_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.has_role('monitor') or public.has_role('commander') or public.has_role('admin')
    or exists (select 1 from public."case" c where c.id = c_id and c.created_by = auth.uid())
    or exists (
      select 1 from public.transfer_leg l
      where l.case_id = c_id
        and (   l.from_unit_id   = public.current_unit_id()
             or l.to_unit_id     = public.current_unit_id()
             or l.transporter_id = auth.uid()
             or l.receiver_id    = auth.uid())
    )
$$;


-- -------------------------------------------------------------
-- 5.2 เปิด RLS ทุกตารางโดยไม่มีข้อยกเว้น
-- -------------------------------------------------------------
alter table public.unit         enable row level security;
alter table public.profile      enable row level security;
alter table public.vehicle      enable row level security;
alter table public."case"       enable row level security;
alter table public.transfer_leg enable row level security;
alter table public.assessment   enable row level security;
alter table public.event_log    enable row level security;
-- case_code_counter เปิดไว้แล้วใน 0009 และไม่มี policy โดยเจตนา
revoke all on public.case_code_counter from anon, authenticated;


-- -------------------------------------------------------------
-- unit — ทุกคนที่ล็อกอินอ่านได้ (จำเป็นสำหรับเลือกปลายทาง) แก้ได้เฉพาะ admin
-- -------------------------------------------------------------
create policy unit_select on public.unit
  for select to authenticated using (true);

create policy unit_write on public.unit
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));


-- -------------------------------------------------------------
-- profile — เห็นตัวเองและคนในหน่วยเดียวกัน · แก้ได้เฉพาะของตัวเอง
--           และเปลี่ยน roles ของตัวเองไม่ได้
-- -------------------------------------------------------------
create policy profile_select_self_or_unit on public.profile
  for select to authenticated
  using (id = auth.uid()
         or unit_id = public.current_unit_id()
         or public.has_role('monitor')
         or public.has_role('commander')
         or public.has_role('admin'));

-- roles = public.current_roles() คือหัวใจของ policy นี้
-- current_roles() อ่านค่าจาก snapshot ของคำสั่ง จึงได้ค่า "ก่อนแก้" เสมอ
-- sender ที่พยายามตั้ง roles ตัวเองเป็น {admin} จะถูกปฏิเสธที่ชั้น database
create policy profile_update_self on public.profile
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and roles = public.current_roles());

create policy profile_admin_all on public.profile
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));


-- -------------------------------------------------------------
-- vehicle — เห็นรถของหน่วยตัวเอง · เปลี่ยนสถานะได้เฉพาะ monitor/admin
-- -------------------------------------------------------------
create policy vehicle_select on public.vehicle
  for select to authenticated
  using (unit_id = public.current_unit_id()
         or public.has_role('monitor')
         or public.has_role('commander')
         or public.has_role('admin'));

create policy vehicle_update on public.vehicle
  for update to authenticated
  using (public.has_role('monitor') or public.has_role('admin'))
  with check (public.has_role('monitor') or public.has_role('admin'));

create policy vehicle_admin_write on public.vehicle
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));


-- -------------------------------------------------------------
-- "case" — เห็นเฉพาะเคสที่ตนเกี่ยวข้อง · สร้างได้เฉพาะ sender ของหน่วยตน
-- -------------------------------------------------------------
create policy case_select on public."case"
  for select to authenticated
  using (public.can_see_case(id));

-- is_synthetic = true คือการบังคับข้อห้าม "ห้ามข้อมูลผู้ป่วยจริง"
-- ด้วยโครงสร้าง ไม่ใช่ด้วยความตั้งใจ (AI_RULES.md §3.2)
create policy case_insert on public."case"
  for insert to authenticated
  with check (public.has_role('sender')
              and created_by = auth.uid()
              and origin_unit_id = public.current_unit_id()
              and is_synthetic = true);

create policy case_update on public."case"
  for update to authenticated
  using (created_by = auth.uid() or public.has_role('monitor') or public.has_role('admin'))
  with check (created_by = auth.uid() or public.has_role('monitor') or public.has_role('admin'));


-- -------------------------------------------------------------
-- transfer_leg — เห็นทอดของเคสที่ตนเห็น · แก้ได้เฉพาะผู้ที่ถือทอดนั้น
-- -------------------------------------------------------------
create policy leg_select on public.transfer_leg
  for select to authenticated
  using (public.can_see_case(case_id));

create policy leg_insert on public.transfer_leg
  for insert to authenticated
  with check ((public.has_role('sender') or public.has_role('monitor') or public.has_role('receiver'))
              and public.can_see_case(case_id));

create policy leg_update on public.transfer_leg
  for update to authenticated
  using (transporter_id = auth.uid()
         or receiver_id = auth.uid()
         or to_unit_id = public.current_unit_id()
         or public.has_role('monitor')
         or public.has_role('admin'))
  with check (transporter_id = auth.uid()
         or receiver_id = auth.uid()
         or to_unit_id = public.current_unit_id()
         or public.has_role('monitor')
         or public.has_role('admin'));


-- -------------------------------------------------------------
-- assessment — อ่านได้ถ้าเห็นเคส · แก้ไขและลบไม่ได้
--
-- ไม่มี policy สำหรับ UPDATE และ DELETE โดยเจตนา แม้แต่ admin
-- ถ้าประเมินผิด ให้บันทึกการประเมินใหม่ ไม่ใช่แก้ของเดิม
-- เหมือนเวชระเบียนกระดาษที่ขีดฆ่าแล้วเซ็นกำกับ ไม่ใช่ลบทิ้ง
-- -------------------------------------------------------------
create policy assessment_select on public.assessment
  for select to authenticated
  using (public.can_see_case(case_id));

create policy assessment_insert on public.assessment
  for insert to authenticated
  with check (assessed_by = auth.uid() and public.can_see_case(case_id));


-- -------------------------------------------------------------
-- event_log — insert ได้ อ่านได้ถ้าเห็นเคส แก้ไม่ได้
-- ไม่มี policy สำหรับ UPDATE และ DELETE โดยเจตนา
-- -------------------------------------------------------------
create policy event_select on public.event_log
  for select to authenticated
  using (case_id is null or public.can_see_case(case_id));

create policy event_insert on public.event_log
  for insert to authenticated
  with check (true);
