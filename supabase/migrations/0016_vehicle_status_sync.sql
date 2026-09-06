-- =============================================================
-- 0016_vehicle_status_sync.sql — สถานะรถเดินตามสถานะของทอด
-- อ้างอิง Prompt 08 (F3)
--
-- ปัญหาที่แก้ (เจอตอนทดสอบ end-to-end หน้า /track เมื่อ 6 ก.ย. 2569)
--   ศูนย์สั่งการจัดรถ → รถเป็น 'dispatched' ได้ เพราะ policy vehicle_update ยอม monitor
--   แต่คนที่กด "ส่งมอบผู้ป่วย" คือชุดลำเลียงหรือผู้รับปลายทาง ซึ่ง policy ไม่ยอม
--   รถจึงค้างสถานะ 'dispatched' ตลอดไปและหายจากรายการรถว่าง
--   ผลคือหลังสาธิตครบหนึ่งรอบ จะไม่มีรถให้จัดในรอบถัดไป
--
-- ทำไมแก้ด้วย trigger แทนการเปิด policy ให้กว้างขึ้น
--   การเปิดให้ทุกคนที่แก้ทอดได้แก้ตาราง vehicle ได้ด้วย คือการยอมให้คนหนึ่ง
--   เปลี่ยนสถานะรถคันไหนก็ได้ในระบบ ซึ่งกว้างเกินกว่าที่จำเป็นมาก
--   trigger ตัวนี้แก้ได้เฉพาะรถที่ผูกกับทอดที่กำลังเปลี่ยนสถานะเท่านั้น
--
-- เป็น security definer ด้วยเหตุผลเดียวกับ sync_case_status ใน 0009
--   ผู้ใช้ที่ trigger ทำงานแทนไม่มีสิทธิ์ update ตาราง vehicle ตาม RLS
-- =============================================================

create or replace function public.sync_vehicle_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- ไม่มีรถผูกกับทอดนี้ (เช่นเดินเท้าหรือยังไม่ได้จัดรถ) ก็ไม่มีอะไรให้ทำ
  if new.vehicle_id is null then
    return new;
  end if;

  if new.status = 'dispatched' then
    -- จองรถ — แตะเฉพาะรถที่ว่างอยู่จริง
    -- รถที่เป็น 'maintenance' หรือ 'offline' ต้องไม่ถูกเปลี่ยนโดยอ้อมแบบนี้
    update public.vehicle
       set status = 'dispatched'
     where id = new.vehicle_id and status = 'available';

  elsif new.status in ('completed', 'cancelled') then
    -- คืนรถ — แตะเฉพาะรถที่ถูกจองไว้ ไม่ปลุกรถที่ซ่อมอยู่ให้กลายเป็นว่าง
    update public.vehicle
       set status = 'available'
     where id = new.vehicle_id and status in ('dispatched', 'busy');
  end if;

  return new;
end $$;

create trigger trg_sync_vehicle_status
  after update on public.transfer_leg
  for each row execute function public.sync_vehicle_status();

comment on function public.sync_vehicle_status is
  'จองรถเมื่อทอดถูกจัดรถ และคืนรถเมื่อทอดจบ — ผู้กดปุ่มไม่ต้องมีสิทธิ์แก้ตาราง vehicle';
