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
       -- 0022 · ล้างรอยส่งมอบฝ่ายแรกด้วย ไม่งั้นค้างอยู่โดยไม่มี arrived_at
       -- แล้วชน leg_time_order ตอน update (constraint ตรวจทั้งแถวหลัง update)
       handover_ready_at = null,
       handover_ready_by = null,
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
       -- 0022 · ล้างรอยส่งมอบฝ่ายแรกด้วย ไม่งั้นค้างอยู่โดยไม่มี arrived_at
       -- แล้วชน leg_time_order ตอน update (constraint ตรวจทั้งแถวหลัง update)
       handover_ready_at = null,
       handover_ready_by = null,
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
update public.vehicle set status = 'available'   where call_sign in ('DEMO-02','DEMO-03','DEMO-05','DEMO-06','DEMO-07','DEMO-08','DEMO-09','DEMO-10','DEMO-AIR-1');
update public.vehicle set status = 'dispatched'  where call_sign = 'DEMO-01';
update public.vehicle set status = 'maintenance' where call_sign = 'DEMO-04';


-- -------------------------------------------------------------
-- 4.5 คืนคำขอส่งกลับทางอากาศให้พร้อมสาธิตอีกรอบ (0025)
--
-- ศูนย์สั่งการต้องเห็นทั้งสองครึ่งของก้อน "คำขอทางอากาศ" ตอนขึ้นเวที
--   ครึ่งบน  · คำขอที่ยังไม่ตัดสิน — มีปุ่มให้กด
--   ครึ่งล่าง · คำขอที่ตัดสินไปแล้ว — เห็นว่าใครตัดสิน เมื่อไร เพราะอะไร
-- ถ้ามีแต่ครึ่งบน คนดูจะไม่เห็นว่าระบบเก็บเหตุผลของการปฏิเสธไว้ด้วย
--
-- ⚠ ต้องล้างให้หมดก่อนแล้วค่อยตั้งใหม่ ไม่ใช่ update ทับ
--   trigger set_case_form_timestamps ตั้ง air_decision_at ให้เฉพาะตอนที่
--   ค่าเดิมเป็น null เท่านั้น (ตัดสินไปแล้วเวลาเดิมห้ามขยับ — เจตนาของ 0025)
--   ถ้าไม่ล้างก่อน การซ้อมรอบที่สองจะได้เวลาของรอบแรกติดมาด้วย
-- -------------------------------------------------------------
update public."case"
   set air_decision      = null,
       air_decision_by   = null,
       air_decision_note = null,
       air_mode_granted  = null,
       transport_mode    = 'ground';

-- เคสที่ศูนย์สั่งการต้องตัดสินตอนเริ่ม demo — urgent/แดง และรอจัดรถอยู่ในคิวพอดี
update public."case" set transport_mode = 'rotary' where case_code = 'MR-2569-0010';

-- ตัวอย่างที่อนุมัติแล้ว และตัวอย่างที่ปฏิเสธพร้อมเหตุผล
update public."case"
   set transport_mode    = 'rotary',
       air_decision      = 'approved',
       air_decision_by   = (select id from public.profile where service_number = '9900000004'),
       air_mode_granted  = 'rotary',
       air_decision_note = 'ลานจอดที่กองพลพร้อม ทัศนวิสัยเกินเกณฑ์'
 where case_code = 'MR-2569-0011';

update public."case"
   set transport_mode    = 'fixed_wing',
       air_decision      = 'denied',
       air_decision_by   = (select id from public.profile where service_number = '9900000004'),
       -- ปฏิเสธ ฮ. แต่ยังอนุมัติให้ไปได้ทางรถ ซึ่งเป็นคำตอบที่พบบ่อยที่สุดหน้างาน
       -- transport_mode ยังเป็น fixed_wing อยู่ — เวชระเบียนต้องตอบได้ว่าหน่วยขออะไรมา
       air_mode_granted  = 'ground',
       air_decision_note = 'ทัศนวิสัยต่ำกว่าเกณฑ์ · อนุมัติให้ใช้เส้นทางพื้นดินแทน'
 where case_code = 'MR-2569-0009';


-- -------------------------------------------------------------
-- 4.6 ประวัติผู้ป่วยสมมติ สำหรับรายงานสรุปกำลังพลบาดเจ็บ (F7 · 12 ก.ย. 2569)
--
-- ทำไมต้องมี
--   11 เคสของชุดจำลองถูกสร้างก่อนมีตาราง casualty (0019) และก่อนมีช่อง
--   injury_place · patient_category ในฟอร์ม ผลคือไฟล์ export ขึ้น "-" ครึ่งตาราง
--   ทั้งช่อง ชื่อ · สกุล · สังกัด · เหตุการณ์ · ประเภท ซึ่งดูเหมือนระบบพังบนเวที
--
-- ⚠ ชื่อทั้งหมดเป็นคำสมมติที่ไม่ใช่ชื่อคนทั่วไป และลงท้าย "(สมมติ)" ทุกแถว
--   ไฟล์ Excel ที่ดาวน์โหลดออกไปจะบอกได้ด้วยตาทันทีว่าเป็นข้อมูลจำลอง
--   สังกัดและสถานที่เป็นชื่อสมมติ ไม่ใช่หน่วยหรือฐานจริง (AI_RULES.md §2)
--
-- ประเภทผู้ป่วยตั้งตามกลไกที่ชุดจำลองมีอยู่แล้ว ไม่แต่งเคสยุทธการขึ้นมาใหม่
--   ฝึก / อุบัติเหตุระหว่างฝึก → อื่นๆ · เจ็บป่วยระหว่างงานปกติ → ธุรการ
--
-- รันซ้ำได้ — casualty ใช้ on conflict (case_id) do update
-- -------------------------------------------------------------
create temp table _demo_casualty (
  case_code text primary key, rank_th text, first_name text, last_name text,
  affiliation text, injury_place text, category public.patient_category
);
insert into _demo_casualty values
  ('MR-2569-0001', 'พลทหาร', 'กล้าหาญ',  'มั่นคง (สมมติ)',   'ร้อย.1 พัน.ก (สมมติ)', 'สนามฝึก ก (สมมติ)',       'other'),
  ('MR-2569-0002', 'พลทหาร', 'ยืนหยัด',  'อดทน (สมมติ)',    'ร้อย.1 พัน.ก (สมมติ)', 'สนามฝึก ก (สมมติ)',       'admin'),
  ('MR-2569-0003', 'ส.ต.',   'ภักดี',    'ว่องไว (สมมติ)',   'ร้อย.2 พัน.ก (สมมติ)', 'สนามฝึก ข (สมมติ)',       'other'),
  ('MR-2569-0004', 'พลทหาร', 'เข้มแข็ง', 'ซื่อตรง (สมมติ)',  'ร้อย.2 พัน.ก (สมมติ)', 'สนามฝึก ก (สมมติ)',       'admin'),
  ('MR-2569-0005', 'ส.ท.',   'รักชาติ',  'สามัคคี (สมมติ)',  'ร้อย.1 พัน.ก (สมมติ)', 'สนามฝึก ข (สมมติ)',       'other'),
  ('MR-2569-0006', 'ส.อ.',   'เสียสละ',  'มานะ (สมมติ)',    'กองร้อยกองบังคับการ พัน.ก (สมมติ)', 'ที่ตั้งหน่วย (สมมติ)', 'admin'),
  ('MR-2569-0007', 'พลทหาร', 'อาจหาญ',  'ทรหด (สมมติ)',    'ร้อย.3 พัน.ก (สมมติ)', 'สนามฝึก ข (สมมติ)',       'other'),
  ('MR-2569-0008', 'พลทหาร', 'องอาจ',   'แกร่งกล้า (สมมติ)', 'ร้อย.1 พัน.ก (สมมติ)', 'สนามฝึก ก (สมมติ)',       'other'),
  ('MR-2569-0009', 'จ.ส.อ.', 'ขยัน',     'ประหยัด (สมมติ)',  'กองร้อยกองบังคับการ พัน.ก (สมมติ)', 'ที่ตั้งหน่วย (สมมติ)', 'admin'),
  ('MR-2569-0010', 'ส.อ.',   'สุจริต',   'เที่ยงธรรม (สมมติ)', 'ร้อย.3 พัน.ข (สมมติ)', 'ฐานปฏิบัติการ ข (สมมติ)', 'admin'),
  ('MR-2569-0011', 'พลทหาร', 'มุ่งมั่น',  'ไม่ท้อ (สมมติ)',   'ร้อย.2 พัน.ก (สมมติ)', 'สนามฝึก ข (สมมติ)',       'other');

insert into public.casualty (case_id, rank_th, first_name, last_name, affiliation, recorded_by)
select c.id, d.rank_th, d.first_name, d.last_name, d.affiliation,
       (select id from public.profile where service_number = '9900000001')
  from _demo_casualty d
  join public."case" c on c.case_code = d.case_code
on conflict (case_id) do update
   set rank_th     = excluded.rank_th,
       first_name  = excluded.first_name,
       last_name   = excluded.last_name,
       affiliation = excluded.affiliation;

update public."case" c
   set injury_place     = d.injury_place,
       patient_category = d.category
  from _demo_casualty d
 where c.case_code = d.case_code;


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
  (select count(*) from public.vehicle where status = 'available')             as รถว่าง,
  (select count(*) from public."case"
     where transport_mode in ('rotary','fixed_wing') and air_decision is null) as คำขอทางอากาศรออนุมัติ,
  (select count(*) from public."case" where air_decision is not null)          as ตัดสินไปแล้ว;

select
  case when (select count(*) from public.transfer_leg where status = 'pending') >= 1
        and (select count(*) from public.transfer_leg where status = 'in_transit') >= 1
        and (select count(*) from public.vehicle where status = 'available') >= 1
        and (select count(*) from public."case"
               where transport_mode in ('rotary','fixed_wing') and air_decision is null) >= 1
        and (select count(*) from public."case" where air_decision is not null) >= 1
       then '✅ พร้อมสาธิต — มีเคสรอจัดรถ มีเคสกำลังเดินทาง มีรถว่าง และมีคำขอทางอากาศทั้งที่รอและที่ตัดสินแล้ว'
       else '🛑 ยังไม่พร้อม ตรวจตารางด้านบน' end as สถานะ;
