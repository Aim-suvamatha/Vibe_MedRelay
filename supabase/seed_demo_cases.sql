-- =============================================================
-- seed_demo_cases.sql — เคสจำลองสำหรับสาธิตและทดสอบแดชบอร์ด
--
-- ⚠ ทุกแถวเป็นข้อมูลสมมติ is_synthetic = true เสมอ
--   ชื่อผู้ป่วยใช้ 'ผู้ป่วย ก/ข/ค' เท่านั้น ห้ามใช้ชื่อจริงแม้ของตนเอง
--   อาการที่ใส่เป็นอาการทั่วไปที่พบในหน่วยฝึก ไม่ได้อ้างอิงเคสจริงรายใด
--
-- ต้องรัน seed.sql และ seed_profiles.sql ให้เสร็จก่อน
-- รันซ้ำได้ — จะลบเคส DEMO เดิมทิ้งแล้วสร้างใหม่
--
-- ทำไมต้อง insert timestamp ตรงๆ แทนการไล่กด status
--   trigger จะตั้งเวลาเป็น now() ทุกขั้น ทำให้ทุกเคสมี response time
--   ประมาณศูนย์ แดชบอร์ดจะไม่มีอะไรให้ดูตอนสาธิต
--   ค่าที่ใส่ในไฟล์นี้จึงเป็นค่าคงที่ที่ตั้งใจเลือก ไม่ใช่ค่าที่ระบบวัดได้จริง
--   บนเวทีต้องบอกให้ชัดว่านี่คือข้อมูลจำลอง ไม่ใช่ baseline (PROJECT.md §6.2)
-- =============================================================

do $$
declare
  u_bna uuid; u_bnb uuid; u_bde uuid; u_hosp uuid;
  p_sender uuid; p_trans uuid; p_recv uuid;
  v_als uuid; v_bls uuid;
  r         record;
  c_id      uuid;
  t0        timestamptz;
  l1_hand   timestamptz;
begin
  select id into strict u_bna  from public.unit where code = 'DEMO-BN-A';
  select id into strict u_bnb  from public.unit where code = 'DEMO-BN-B';
  select id into strict u_bde  from public.unit where code = 'DEMO-BDE';
  select id into strict u_hosp from public.unit where code = 'DEMO-HOSP';

  select id into strict p_sender from public.profile where service_number = '9900000001';
  select id into strict p_trans  from public.profile where service_number = '9900000002';
  select id into strict p_recv   from public.profile where service_number = '9900000003';

  select id into strict v_als from public.vehicle where call_sign = 'DEMO-01';
  select id into strict v_bls from public.vehicle where call_sign = 'DEMO-02';

  -- ลบของเดิมก่อน เพื่อให้รันซ้ำได้ (ลบเฉพาะ alias ที่ขึ้นต้นด้วย 'ผู้ป่วย ')
  delete from public."case" where patient_alias like 'ผู้ป่วย %';

  for r in
    select * from (values
      -- alias, วันย้อนหลัง, ชม.ที่เปิดเคส, precedence, triage, อาการ, กลไก, ยุทธการ,
      -- จำนวนทอด, นาที: รอจัดรถ / ถึงจุดรับ / บนรถ / ส่งมอบ
      ('ผู้ป่วย ก', 6, 9,  'urgent',   'red',    'หมดสติ ชักเกร็ง',                'ล้มระหว่างฝึกกลางแดด', 'ฝึกทหารใหม่', 2,  6, 14, 22,  8),
      ('ผู้ป่วย ข', 6, 14, 'priority', 'yellow', 'ปวดท้องรุนแรง คลื่นไส้',          'เจ็บป่วยปกติ',        'ฝึกทหารใหม่', 1, 11, 19, 26,  9),
      ('ผู้ป่วย ค', 5, 8,  'routine',  'green',  'ข้อเท้าพลิก เดินลงน้ำหนักไม่ได้',  'ฝึกภาคสนาม',          'ฝึกทหารใหม่', 1, 24, 21, 18,  7),
      ('ผู้ป่วย ง', 5, 16, 'urgent',   'red',    'หายใจลำบาก ปลายมือเขียว',        'แพ้รุนแรง',           'ฝึกทหารใหม่', 2,  4, 12, 19,  6),
      ('ผู้ป่วย จ', 4, 10, 'priority', 'yellow', 'แผลฉีกขาดที่ขา เลือดออกคุมได้',   'อุบัติเหตุระหว่างฝึก',  'ฝึกทหารใหม่', 1,  9, 17, 24, 10),
      ('ผู้ป่วย ฉ', 3, 11, 'routine',  'green',  'ไข้ต่ำ ปวดศีรษะ',                'เจ็บป่วยปกติ',        'งานปกติ',     1, 31, 25, 20,  8),
      ('ผู้ป่วย ช', 3, 15, 'urgent',   'red',    'บาดเจ็บศีรษะ GCS ลดลง',          'ตกจากที่สูง',         'ฝึกภาคสนาม',  2,  5, 11, 28,  7),
      ('ผู้ป่วย ซ', 2, 9,  'priority', 'yellow', 'อ่อนเพลีย ขาดน้ำ',               'ฝึกกลางแดดจัด',       'ฝึกทหารใหม่', 1, 13, 16, 21,  9),
      ('ผู้ป่วย ฌ', 1, 13, 'routine',  'green',  'ผื่นคันทั่วตัว',                  'เจ็บป่วยปกติ',        'งานปกติ',     1, 27, 23, 17,  6)
    ) as t(alias, days_ago, at_hour, prec, tri, cc, mech, op, n_legs, m_disp, m_scene, m_transit, m_hand)
  loop
    -- คำนวณเป็นเวลาไทยแล้วแปลงกลับเป็น timestamptz ด้วย at time zone อีกครั้ง
    -- ถ้าไม่แปลงกลับ ค่าที่ได้จะถูกตีความด้วย TimeZone ของ server (Supabase = UTC)
    -- ทำให้เวลาสาธิตเพี้ยนไป 7 ชั่วโมง
    t0 := (date_trunc('day', now() at time zone 'Asia/Bangkok')
           - make_interval(days => r.days_ago)
           + make_interval(hours => r.at_hour)) at time zone 'Asia/Bangkok';

    insert into public."case"
      (patient_alias, origin_unit_id, precedence, triage, chief_complaint, mechanism,
       operation_type, symptom_onset_at, status, created_by, requested_at, is_synthetic)
    values
      (r.alias, u_bna, r.prec::public.precedence_level, r.tri::public.triage_color,
       r.cc, r.mech, r.op, t0 - interval '18 minutes', 'completed', p_sender, t0, true)
    returning id into c_id;

    -- ทอดที่ 1 — ที่พยาบาลกองพัน ก -> ที่พยาบาลกองพล
    insert into public.transfer_leg
      (case_id, leg_no, from_unit_id, to_unit_id, role_level, vehicle_id,
       transporter_id, receiver_id, evac_director, status,
       requested_at, dispatched_at, on_scene_at, departed_at, arrived_at, handover_at)
    values
      (c_id, 1, u_bna, u_bde, 'role_2', v_als, p_trans, p_recv, 'นายแพทย์สมมติ', 'completed',
       t0,
       t0 + make_interval(mins => r.m_disp),
       t0 + make_interval(mins => r.m_disp + r.m_scene),
       t0 + make_interval(mins => r.m_disp + r.m_scene + 3),
       t0 + make_interval(mins => r.m_disp + r.m_scene + 3 + r.m_transit),
       t0 + make_interval(mins => r.m_disp + r.m_scene + 3 + r.m_transit + r.m_hand));

    l1_hand := t0 + make_interval(mins => r.m_disp + r.m_scene + 3 + r.m_transit + r.m_hand);

    -- ทอดที่ 2 — ที่พยาบาลกองพล -> โรงพยาบาลค่าย (เฉพาะเคสที่ต้องส่งต่อ)
    if r.n_legs >= 2 then
      insert into public.transfer_leg
        (case_id, leg_no, from_unit_id, to_unit_id, role_level, vehicle_id,
         transporter_id, receiver_id, evac_director, status,
         requested_at, dispatched_at, on_scene_at, departed_at, arrived_at, handover_at)
      values
        (c_id, 2, u_bde, u_hosp, 'role_3', v_bls, p_trans, p_recv, 'นายแพทย์สมมติ', 'completed',
         l1_hand,
         l1_hand + interval '8 minutes',
         l1_hand + interval '20 minutes',
         l1_hand + interval '24 minutes',
         l1_hand + interval '58 minutes',
         l1_hand + interval '66 minutes');
      l1_hand := l1_hand + interval '66 minutes';
    end if;

    update public."case" set closed_at = l1_hand where id = c_id;

    -- audit trail ให้หน้า F3 มีลำดับเวลาให้แสดง
    insert into public.event_log (case_id, leg_id, actor_id, action, from_value, to_value, created_at)
    select c_id, l.id, p_trans, 'leg.status_changed', s.prev, s.next, s.at
    from public.transfer_leg l
    cross join lateral (values
      ('pending',    'dispatched', l.dispatched_at),
      ('dispatched', 'on_scene',   l.on_scene_at),
      ('on_scene',   'in_transit', l.departed_at),
      ('in_transit', 'arrived',    l.arrived_at),
      ('arrived',    'completed',  l.handover_at)
    ) as s(prev, next, at)
    where l.case_id = c_id and s.at is not null;
  end loop;

  -- ---------------------------------------------------------
  -- เคสที่ยังไม่จบ — ให้หน้าคิวศูนย์สั่งการ (F2) และหน้ารับผู้ป่วย (F5) มีของจริงให้กด
  -- ---------------------------------------------------------

  -- (1) เพิ่งร้องขอ ยังไม่จัดรถ — สถานะ requested คิวของ F2
  insert into public."case"
    (patient_alias, origin_unit_id, precedence, triage, chief_complaint, mechanism,
     operation_type, symptom_onset_at, status, created_by, requested_at, is_synthetic)
  values
    ('ผู้ป่วย ญ', u_bnb, 'urgent', 'red', 'เจ็บแน่นหน้าอก เหงื่อแตก', 'เจ็บป่วยปกติ',
     'งานปกติ', now() - interval '25 minutes', 'requested', p_sender, now() - interval '9 minutes', true)
  returning id into c_id;

  insert into public.transfer_leg
    (case_id, leg_no, from_unit_id, to_unit_id, role_level, status, requested_at)
  values (c_id, 1, u_bnb, u_hosp, 'role_3', 'pending', now() - interval '9 minutes');

  -- (2) รถกำลังเดินทางมาส่ง — สถานะ in_transit ปลายทางเห็นล่วงหน้าใน F5
  insert into public."case"
    (patient_alias, origin_unit_id, precedence, triage, chief_complaint, mechanism,
     operation_type, symptom_onset_at, status, created_by, requested_at, is_synthetic)
  values
    ('ผู้ป่วย ฎ', u_bna, 'priority', 'yellow', 'กระดูกปลายแขนหัก ผิดรูป', 'อุบัติเหตุระหว่างฝึก',
     'ฝึกทหารใหม่', now() - interval '70 minutes', 'active', p_sender, now() - interval '52 minutes', true)
  returning id into c_id;

  insert into public.transfer_leg
    (case_id, leg_no, from_unit_id, to_unit_id, role_level, vehicle_id,
     transporter_id, receiver_id, status,
     requested_at, dispatched_at, on_scene_at, departed_at)
  values
    (c_id, 1, u_bna, u_hosp, 'role_3', v_als, p_trans, p_recv, 'in_transit',
     now() - interval '52 minutes',
     now() - interval '45 minutes',
     now() - interval '31 minutes',
     now() - interval '27 minutes');

  -- ประเมินแรกรับของเคสนี้ — คือข้อมูลที่ปลายทางต้องเห็นก่อนผู้ป่วยถึงประตู
  -- นี่คือจุดที่สาธิตคำตอบของ HMW หลักของโครงการ
  insert into public.assessment
    (case_id, leg_id, kind, gcs, sbp, dbp, pulse, resp_rate, spo2, temperature,
     triage, findings, treatment, assessed_by, assessed_at)
  select
    c_id, l.id, 'initial', 15, 128, 78, 96, 20, 98, 36.8, 'yellow',
    'ปลายแขนซ้ายผิดรูป บวม กดเจ็บชัดเจน ชีพจรปลายมือคลำได้ ไม่มีแผลเปิด',
    'ดามด้วยเฝือกชั่วคราว ยกสูง ให้ยาแก้ปวด บันทึกสัญญาณชีพก่อนขึ้นรถ',
    p_sender, now() - interval '48 minutes'
  from public.transfer_leg l where l.case_id = c_id and l.leg_no = 1;

  insert into public.assessment
    (case_id, leg_id, kind, gcs, sbp, dbp, pulse, resp_rate, spo2,
     triage, findings, treatment, assessed_by, assessed_at)
  select
    c_id, l.id, 'enroute', 15, 124, 76, 88, 18, 99, 'yellow',
    'อาการคงที่ระหว่างเดินทาง ปวดลดลง ชีพจรปลายมือยังคลำได้',
    'ประเมินซ้ำทุก 10 นาที ไม่มีการรักษาเพิ่ม',
    p_trans, now() - interval '15 minutes'
  from public.transfer_leg l where l.case_id = c_id and l.leg_no = 1;

  raise notice 'seed_demo_cases เสร็จแล้ว — เคสทั้งหมด: %', (select count(*) from public."case");
end $$;

-- ตรวจผล
select case_code, patient_alias, precedence, triage, status, leg_count, total_evacuation_time
from public.v_case_metrics
order by first_requested_at desc;
