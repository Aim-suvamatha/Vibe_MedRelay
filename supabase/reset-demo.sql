-- =============================================================
-- reset-demo.sql — คืนข้อมูลให้พร้อมสาธิตอีกรอบ
--
--   node supabase/scripts/sql.mjs supabase/reset-demo.sql
--
-- ทำไมต้องมีไฟล์นี้
--   การซ้อม demo หนึ่งรอบจะ "กิน" ข้อมูลที่เตรียมไว้ไปเสมอ
--     · เคสที่รอจัดรถถูกจัดรถไปแล้ว รอบต่อไปคิวศูนย์สั่งการจะว่าง
--     · เคสที่กำลังเดินทางถูกเดินจนส่งมอบ รอบต่อไปหน้า Receiver จะว่าง
--     · เคสใหม่ที่สร้างระหว่างซ้อมค้างอยู่ในระบบ ทำให้ตัวเลขแดชบอร์ดขยับทุกรอบ
--   ถ้าไม่มีไฟล์นี้ จะซ้อมได้รอบเดียวแล้วต้อง seed ใหม่ทั้งหมด
--   ซึ่งเป็นเหตุผลที่คนส่วนใหญ่ซ้อม demo แค่รอบเดียวแล้วไปพลาดบนเวที
--
-- ปลอดภัยแค่ไหน
--   ★ ลบเฉพาะเคสที่ "ไม่ใช่" 11 เคสของชุดข้อมูลจำลอง — ระบุรหัสไว้ตรงๆ ด้านล่าง
--     เคสที่คุณสร้างระหว่างซ้อมจะถูกลบ เคสของชุดจำลองจะไม่ถูกแตะ
--   ★ ทั้งไฟล์อยู่ใน transaction เดียว (sql.mjs ห่อ begin/commit ให้)
--     ถ้าพังกลางทางจะ rollback ทั้งก้อน ไม่มีสถานะครึ่งๆ ค้าง
--   ★ ไม่แตะตาราง profile และไม่แตะรหัสผ่านใดๆ
--
-- ⚠ ห้ามรันบนระบบที่มีข้อมูลจริง — ไฟล์นี้ลบข้อมูลถาวร
--   เฟส prototype ไม่มีข้อมูลจริงอยู่แล้ว (RLS บังคับ is_synthetic = true)
-- =============================================================

-- -------------------------------------------------------------
-- 1. ลบเคสที่เกิดจากการซ้อม — ทุกเคสที่ไม่ใช่ 11 เคสของชุดจำลอง
--
--    ต้องลบ event_log ก่อนเพราะ FK ไม่ได้ตั้ง on delete cascade
--    (ตั้งใจ — audit log ไม่ควรหายไปเงียบๆ พร้อมเคส)
--    ส่วน transfer_leg / assessment / treatment / property_item
--    ตั้ง on delete cascade ไว้แล้ว จึงหายไปพร้อมเคสเอง
-- -------------------------------------------------------------
create temp table _keep (case_code text primary key);
insert into _keep values
  ('MR-2569-0001'), ('MR-2569-0002'), ('MR-2569-0003'), ('MR-2569-0004'),
  ('MR-2569-0005'), ('MR-2569-0006'), ('MR-2569-0007'), ('MR-2569-0008'),
  ('MR-2569-0009'), ('MR-2569-0010'), ('MR-2569-0011');

delete from public.event_log e
 where e.case_id in (
   select c.id from public."case" c
    where c.case_code not in (select case_code from _keep)
 );

delete from public."case" c
 where c.case_code not in (select case_code from _keep);


-- -------------------------------------------------------------
-- 2. คืนเคส MR-2569-0010 ให้กลับไปรอจัดรถ
--    เป็นเคสที่ศูนย์สั่งการจะเห็นในคิวตอนเริ่ม demo
--    urgent + triage แดง จึงอยู่บนสุดและสื่อความเร่งด่วนได้ทันที
--
--    ต้องล้างเวลาทุกช่องพร้อมกันในคำสั่งเดียว
--    constraint leg_time_order ตรวจทั้งแถวหลัง update จึงยอมให้ล้างทีเดียวได้
--    แต่ถ้าล้างทีละช่องจะติด constraint กลางทาง
-- -------------------------------------------------------------
update public.transfer_leg l
   set status         = 'pending',
       requested_at   = now() - interval '6 minutes',
       dispatched_at  = null,
       on_scene_at    = null,
       departed_at    = null,
       arrived_at     = null,
       handover_at    = null,
       vehicle_id     = null,
       transporter_id = null,
       receiver_id    = null,
       docs_ok        = null,
       property_ok    = null,
       missing_note   = null,
       delay_reason   = null
 from public."case" c
where c.id = l.case_id and c.case_code = 'MR-2569-0010';

-- ต้องตั้งสถานะเคสเองหลังแก้ทอด
-- trigger sync_case_status ไม่แตะเคสเมื่อทอดกลับไปเป็น pending โดยเจตนา
update public."case"
   set status = 'requested', closed_at = null
 where case_code = 'MR-2569-0010';


-- -------------------------------------------------------------
-- 3. คืนเคส MR-2569-0011 ให้กำลังเดินทาง
--    เป็นเคสที่ทำให้หน้า Receiver ไม่ว่างเปล่าตอนเปิดให้ดู
--    และเป็นตัวสำรองถ้าการสร้างเคสสดบนเวทีไม่สำเร็จ
--
--    เวลาอิงจาก now() ทุกช่อง ผู้ชมจะเห็นว่า "ออกเดินทางเมื่อ 12 นาทีที่แล้ว"
--    ซึ่งสมจริงกว่าเวลาที่ค้างจากวันที่ seed
-- -------------------------------------------------------------
update public.transfer_leg l
   set status         = 'in_transit',
       requested_at   = now() - interval '38 minutes',
       dispatched_at  = now() - interval '30 minutes',
       on_scene_at    = now() - interval '18 minutes',
       departed_at    = now() - interval '12 minutes',
       arrived_at     = null,
       handover_at    = null,
       vehicle_id     = (select id from public.vehicle where call_sign = 'DEMO-01'),
       transporter_id = (select id from public.profile where service_number = '9900000002'),
       receiver_id    = (select id from public.profile where service_number = '9900000003'),
       docs_ok        = null,
       property_ok    = null,
       missing_note   = null
 from public."case" c
where c.id = l.case_id and c.case_code = 'MR-2569-0011';

update public."case"
   set status = 'active', closed_at = null
 where case_code = 'MR-2569-0011';


-- -------------------------------------------------------------
-- 4. คืนสถานะรถให้สอดคล้องกับทอดที่ค้างอยู่
--    DEMO-01 ติดภารกิจ MR-2569-0011 จึงต้องเป็น dispatched
--    ที่เหลือว่าง ยกเว้น DEMO-04 ที่ชุดจำลองตั้งเป็นซ่อมบำรุงไว้แต่แรก
--    (ตั้งใจให้มีรถที่จัดไม่ได้อย่างน้อยหนึ่งคัน จะได้เห็นว่ากระดานแยกสถานะจริง)
-- -------------------------------------------------------------
update public.vehicle set status = 'available'   where call_sign in ('DEMO-02','DEMO-03','DEMO-05');
update public.vehicle set status = 'dispatched'  where call_sign = 'DEMO-01';
update public.vehicle set status = 'maintenance' where call_sign = 'DEMO-04';


-- -------------------------------------------------------------
-- 5. รายงานสภาพหลังคืนค่า — ต้องตรงกับตารางนี้ก่อนขึ้นเวที
-- -------------------------------------------------------------
select
  (select count(*) from public."case")                                         as เคสทั้งหมด,
  (select count(*) from public.transfer_leg)                                   as ทอดทั้งหมด,
  (select count(*) from public.transfer_leg where status = 'pending')          as รอจัดรถ,
  (select count(*) from public.transfer_leg
     where status in ('dispatched','on_scene','in_transit','arrived'))         as กำลังเดินทาง,
  (select count(*) from public.v_leg_metrics)                                  as ทอดที่วัดเวลาได้,
  (select count(*) from public.vehicle where status = 'available')             as รถว่าง;

select
  case when (select count(*) from public.transfer_leg where status = 'pending') >= 1
        and (select count(*) from public.transfer_leg where status = 'in_transit') >= 1
        and (select count(*) from public.vehicle where status = 'available') >= 1
       then '✅ พร้อมสาธิต — มีเคสรอจัดรถ มีเคสกำลังเดินทาง และมีรถว่าง'
       else '🛑 ยังไม่พร้อม ตรวจตารางด้านบน' end as สถานะ;
