-- =============================================================
-- 0022_reassessment_and_handover.sql — ประเมินซ้ำระหว่างส่งกลับ + ส่งมอบสองฝ่าย
-- คำสั่งเจ้าของโครงการ 8 ก.ย. 2569 (รอบปรับหน้า Transporter)
--
-- ไฟล์นี้ทำสี่อย่างที่แยกกันไม่ได้ เพราะทั้งสี่คือ "ด่านที่หน้าจอพึ่งไม่ได้"
--
--   1. ชุดลำเลียงจัดรถเองได้        → แก้ policy leg_update
--   2. ส่งมอบต้องกดสองฝ่ายจึงจะปิด  → คอลัมน์ + constraint ใหม่
--   3. สีของผู้ป่วยเปลี่ยนตามการประเมินล่าสุด → trigger ไล่ลงตาราง case
--   4. เวลาของทั้งสองอย่างมาจาก now() ของฐานข้อมูล ไม่ใช่จากเครื่องผู้ใช้
--
-- ⚠ ทำไมต้องอยู่ที่ฐานข้อมูล ไม่ใช่ที่หน้าจอ
--   HANDOFF §5 ข้อ 13 บันทึกไว้ว่า UPDATE ที่ RLS ปฏิเสธจะแก้ 0 แถวเงียบๆ
--   ไม่มี error ให้เห็น การกันด้วย RoleGate อย่างเดียวจึงได้ปุ่มที่กดแล้ว
--   "เหมือนสำเร็จ" แต่ไม่มีอะไรเปลี่ยน ซึ่งอันตรายกว่าปุ่มที่กดไม่ได้เลย
-- =============================================================


-- -------------------------------------------------------------
-- 1. ชุดลำเลียงจัดรถเองได้
--
--    เดิม leg_update ยอมเฉพาะ transporter_id/receiver_id ที่ถูกตั้งไว้แล้ว
--    หน่วยปลายทาง หรือ monitor — แต่ทอดที่ยัง 'pending' มี transporter_id
--    เป็น null เสมอ ชุดลำเลียงจึงจัดรถให้ตัวเองไม่ได้เลย ทั้งที่หน้างานจริง
--    เขาคือคนที่รู้ก่อนใครว่ารถคันไหนว่างและใครขับอยู่
--
--    ⚠ ต้องผูก can_see_case() ไว้ด้วยเสมอ ห้ามใช้ has_role('transporter') โดดๆ
--      USING ของ policy คือด่านอ่านของ UPDATE ด้วย ถ้าปล่อยให้ผ่านด้วยบทบาทอย่างเดียว
--      transporter คนใดก็ได้จะแก้ทอดของเคสที่ตัวเองไม่มีสิทธิ์เห็นได้ด้วยการเดา id
-- -------------------------------------------------------------
drop policy if exists leg_update on public.transfer_leg;

create policy leg_update on public.transfer_leg
  for update to authenticated
  using (transporter_id = auth.uid()
         or receiver_id = auth.uid()
         or to_unit_id = public.current_unit_id()
         or (public.has_role('transporter') and public.can_see_case(case_id))
         or public.has_role('monitor')
         or public.has_role('admin'))
  with check (transporter_id = auth.uid()
         or receiver_id = auth.uid()
         or to_unit_id = public.current_unit_id()
         or (public.has_role('transporter') and public.can_see_case(case_id))
         or public.has_role('monitor')
         or public.has_role('admin'));


-- -------------------------------------------------------------
-- 2. ส่งมอบสองฝ่าย
--
--    handover_at ยังคงแปลว่า "ทอดปิดแล้ว" เหมือนเดิมทุกที่ที่อ้างถึงมัน
--    (แดชบอร์ด · view · sync_case_status) จึงต้องมีที่เก็บ "ฝ่ายแรกกดแล้ว"
--    แยกออกมา ไม่ใช่ไปเปลี่ยนความหมายของคอลัมน์ที่มีคนใช้อยู่
--
--    ทำไมไม่เพิ่มค่าใน enum leg_status
--      leg_status ผูกกับ leg_time_order และ LEG_FLOW ใน src/lib/leg-flow.ts
--      แบบหนึ่งสถานะต่อหนึ่งเวลา การเพิ่มขั้นที่ 7 จะลามไปทุกไฟล์ที่นับ 6 ขั้น
--      ระหว่างรอฝ่ายที่สอง ทอดจึงคงสถานะ 'arrived' ไว้ตามเดิม
-- -------------------------------------------------------------
alter table public.transfer_leg
  add column handover_ready_at timestamptz,
  add column handover_ready_by uuid references public.profile(id);

comment on column public.transfer_leg.handover_ready_at is
  'เวลาที่ชุดลำเลียงกดส่งมอบ — ทอดยังไม่ปิดจนกว่าผู้รับปลายทางจะกดยืนยัน';

-- ทอดเก่าที่ปิดไปแล้วก่อนมีระบบสองฝ่าย ต้องมีค่าย้อนหลัง
-- ไม่งั้น constraint ข้อถัดไปจะปฏิเสธตอน ALTER TABLE เพราะมันตรวจแถวเดิมด้วย
update public.transfer_leg
   set handover_ready_at = handover_at,
       handover_ready_by = coalesce(transporter_id, receiver_id)
 where handover_at is not null
   and handover_ready_at is null;

alter table public.transfer_leg
  drop constraint leg_time_order;

-- ฉบับเดิมจาก 0006 บวกสองบรรทัดท้าย — เหตุผลของรูปแบบ
-- "(x is null or (ก่อนหน้า is not null and x >= ก่อนหน้า))" อยู่ในหัว 0006
-- สรุปสั้นๆ คือ NULL >= NULL ได้ NULL ซึ่ง CHECK ถือว่าผ่าน จึงต้องเช็ค not null แยก
alter table public.transfer_leg
  add constraint leg_time_order check (
        (dispatched_at is null or dispatched_at >= requested_at)
    and (on_scene_at   is null or (dispatched_at is not null and on_scene_at >= dispatched_at))
    and (departed_at   is null or (on_scene_at   is not null and departed_at >= on_scene_at))
    and (arrived_at    is null or (departed_at   is not null and arrived_at  >= departed_at))
    and (handover_ready_at is null or (arrived_at is not null and handover_ready_at >= arrived_at))
    -- ★ หัวใจของข้อนี้ — ปิดทอดโดยไม่มีฝ่ายแรกกดไม่ได้เลยในระดับฐานข้อมูล
    --   ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ ต่อให้ยิง POST ตรงเข้ามาก็ยังถูกปฏิเสธ
    and (handover_at is null or (handover_ready_at is not null and handover_at >= handover_ready_at))
  );

-- ลงชื่อแล้วต้องมีเวลากำกับเสมอ (ทิศทางเดียว)
-- ไม่บังคับทิศกลับ เพราะทอดเก่าที่ backfill ข้างบนอาจไม่มีทั้ง transporter_id
-- และ receiver_id ให้ใส่ ซึ่งเป็นข้อมูลที่หายไปตั้งแต่ก่อนมีคอลัมน์นี้
alter table public.transfer_leg
  add constraint leg_handover_ready_pair
    check (handover_ready_by is null or handover_ready_at is not null);


-- -------------------------------------------------------------
-- 3. เวลาส่งมอบฝ่ายแรกมาจากฐานข้อมูล ไม่ใช่จากเครื่องผู้ใช้
--
--    transfer_leg ไม่มี column-level grant (ต่างจาก treatment ใน 0014)
--    ทุกคอลัมน์ที่ update ได้จึงส่งค่ามาจาก PostgREST ได้หมด รวมทั้งเวลา
--    trigger ตัวนี้จึงเขียนทับเสมอ ไม่ใช่ coalesce แบบขั้นอื่น
--    เหตุผลเดียวกับที่ release_tourniquet เป็น RPC ไม่ใช่ .update()
-- -------------------------------------------------------------
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

  -- ฝ่ายแรกเพิ่งลงชื่อส่งมอบ — ตีตราเวลาให้เอง ไม่รับค่าจากผู้ใช้
  if new.handover_ready_by is distinct from old.handover_ready_by
     and new.handover_ready_by is not null then
    new.handover_ready_at := now();
  end if;

  return new;
end $$;


-- -------------------------------------------------------------
-- 4. สีของผู้ป่วยเดินตามการประเมินล่าสุด
--
--    เวลาผ่านไประหว่างส่งกลับ ผู้ป่วยแย่ลงได้ สีที่เขตหน้าให้ไว้ตอนเปิดคำขอ
--    จึงไม่ใช่สีที่ถูกต้องเสมอไป ชุดลำเลียงและปลายทางต้องยืนยันสีใหม่ได้
--
--    ทำไมต้องเป็น trigger ไม่ใช่การเปิด policy case_update ให้ transporter
--      case_update (ฉบับใน 0013) ยอมเฉพาะเจ้าของเคส · receiver · monitor · admin
--      ถ้าเปิดให้ transporter แก้ตาราง case ได้ เขาจะแก้ได้ทั้งแถว —
--      precedence · status · closed_at — เพราะตารางนี้ไม่มี column-level grant
--      กว้างเกินกว่าที่ขอมามาก (ขอแค่ "ยืนยันสี")
--
--    ★ ผลพลอยได้ที่ตั้งใจ — สีเปลี่ยนได้ก็ต่อเมื่อมีคนลงชื่อประเมินไว้จริง
--      เพราะทางเดียวที่แตะ triage ได้คือผ่าน assessment_insert
--      ซึ่งบังคับ assessed_by = auth.uid() อยู่แล้ว
--      "สีเปลี่ยนโดยไม่มีใครรับผิดชอบ" จึงเป็นไปไม่ได้เชิงโครงสร้าง
--
--    security definer ด้วยเหตุผลเดียวกับ sync_case_status ใน 0009
-- -------------------------------------------------------------
create or replace function public.sync_case_triage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- ประเมินที่ไม่ได้ยืนยันสี (เช่นลง V/S อย่างเดียว) ต้องไม่ไปลบสีเดิมทิ้ง
  if new.triage is null then
    return null;
  end if;

  update public."case"
     set triage = new.triage
   where id = new.case_id
     and triage is distinct from new.triage;

  return null;
end $$;

create trigger trg_sync_case_triage
  after insert on public.assessment
  for each row execute function public.sync_case_triage();

comment on function public.sync_case_triage is
  'สีของเคสเดินตาม assessment ล่าสุดที่ยืนยันสี — ผู้ประเมินไม่ต้องมีสิทธิ์แก้ตาราง case';
