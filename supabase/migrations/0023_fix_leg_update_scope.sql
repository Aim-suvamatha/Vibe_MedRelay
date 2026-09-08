-- =============================================================
-- 0023_fix_leg_update_scope.sql — ปิดช่องโหว่ที่ 0022 เปิดไว้กว้างเกินไป
-- เจ้าของโครงการทดสอบเจอเอง 8 ก.ย. 2569
--
-- อาการ
--   สมชาย (9900000001) จัดรถแล้วจ่ายทอดให้สมหมาย (9900000002)
--   แต่สมชายยังกด "ออกเดินทางจากจุดรับ" · "ถึงปลายทางส่งกลับแล้ว" · "ส่งมอบ" ได้อยู่
--   ทั้งที่ทอดนั้นไม่ใช่ของเขาแล้ว
--
-- สาเหตุ
--   0022 เพิ่ม `or (has_role('transporter') and can_see_case(case_id))` ลง leg_update
--   เพื่อให้ชุดลำเลียงจัดรถเองได้ (ทอด pending มี transporter_id เป็น null
--   จึงไม่เข้าเงื่อนไขเดิมข้อใดเลย) แต่เงื่อนไขนั้น **ไม่ได้จำกัดว่าใช้ได้ตอนไหน**
--   ผลคือมันครอบทุกการเปลี่ยนสถานะ ไม่ใช่แค่ขั้นจัดรถ
--   บัญชี 9900000001 ถือบทบาท sender · transporter · receiver พร้อมกันเพื่อให้สาธิต
--   ได้คนเดียว ช่องโหว่นี้จึงมองไม่เห็นเลยจนกว่าจะจ่ายทอดให้คนอื่นแล้วลองกด
--
-- หลักการที่ทำลายไปและต้องกู้คืน
--   `transporter_id` คือกุญแจที่ทำให้ชุดลำเลียงกดขั้นถัดไปได้ —
--   ทอดที่จ่ายให้คนอื่นแล้ว คนอื่นต้องกดไม่ได้ ไม่ว่าจะถือบทบาทอะไรก็ตาม
--   ในสนามจริงหมายถึง "ใครเป็นคนรับผิดชอบผู้ป่วยรายนี้อยู่ตอนนี้"
--   ถ้าใครก็กดได้ เวลาบนเส้นเวลาจะไม่ได้แปลว่าคนที่อยู่กับผู้ป่วยเป็นคนกด
--
-- วิธีแก้ — จำกัดเงื่อนไขของ 0022 ให้ใช้ได้เฉพาะช่วง pending -> dispatched
--   USING อ่านแถวเดิม (ก่อนแก้)  → บังคับว่าต้องยังเป็น 'pending'
--   WITH CHECK อ่านแถวใหม่       → บังคับว่าปลายทางต้องเป็น 'dispatched' เท่านั้น
--   สองข้อนี้คู่กันทำให้ transporter ที่ไม่ได้ถือทอด "จัดรถได้อย่างเดียว"
--   เดินขั้นอื่นไม่ได้เลย และย้อนสถานะกลับมาเป็น dispatched ก็ไม่ได้
-- =============================================================

drop policy if exists leg_update on public.transfer_leg;

create policy leg_update on public.transfer_leg
  for update to authenticated
  using (
    -- คนที่ถือทอดนี้อยู่จริง — เส้นทางปกติของทุกขั้นหลังจัดรถ
    transporter_id = auth.uid()
    or receiver_id = auth.uid()
    or to_unit_id = public.current_unit_id()
    -- ชุดลำเลียงจัดรถเองได้ แต่เฉพาะทอดที่ยังไม่มีใครถือเท่านั้น
    or (public.has_role('transporter')
        and status = 'pending'
        and public.can_see_case(case_id))
    or public.has_role('monitor')
    or public.has_role('admin')
  )
  with check (
    transporter_id = auth.uid()
    or receiver_id = auth.uid()
    or to_unit_id = public.current_unit_id()
    -- ปลายทางของการกดนั้นต้องเป็น 'dispatched' เท่านั้น
    -- ถ้าไม่บังคับข้อนี้ USING ที่ผ่านมาแล้วจะพาไปสถานะใดก็ได้
    or (public.has_role('transporter')
        and status = 'dispatched'
        and public.can_see_case(case_id))
    or public.has_role('monitor')
    or public.has_role('admin')
  );

comment on policy leg_update on public.transfer_leg is
  'แก้ทอดได้เฉพาะผู้ที่ถือทอดนั้น · หน่วยปลายทาง · ศูนย์สั่งการ — ส่วนชุดลำเลียงทั่วไปทำได้อย่างเดียวคือจัดรถให้ทอดที่ยังว่าง';
