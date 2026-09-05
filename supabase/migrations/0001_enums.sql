-- =============================================================
-- 0001_enums.sql — Enum types ของ MedRelay
-- อ้างอิง DATABASE.md §2
--
-- หลักการ: ทุก enum มาจากหลักนิยมที่ใช้จริง ไม่กำหนดระดับขึ้นเอง
--   precedence_level  ← หลักนิยม MEDEVAC
--   triage_color      ← รายงานสรุปกำลังพลบาดเจ็บที่หน่วยใช้จริง
--   role_of_care      ← Role of care 1-4 (NATO/AMedP)
-- =============================================================

-- ระดับความเร่งด่วนตามหลักนิยม MEDEVAC
create type public.precedence_level as enum ('urgent', 'priority', 'routine');

-- ระดับการบาดเจ็บตามรายงานสรุปกำลังพลบาดเจ็บ (ดำ/แดง/เหลือง/เขียว)
create type public.triage_color as enum ('black', 'red', 'yellow', 'green');

-- Role of care 1-4 (กองพัน / กองพล / รพ.ค่าย / เขตหลัง)
create type public.role_of_care as enum ('role_1', 'role_2', 'role_3', 'role_4');

-- สถานะของเคสโดยรวม
create type public.case_status as enum ('requested', 'active', 'completed', 'cancelled');

-- สถานะของแต่ละทอด — ลำดับนี้คือลำดับเวลาจริง ห้ามสลับ
create type public.leg_status as enum (
  'pending',      -- สร้างแล้ว รอจัดรถ
  'dispatched',   -- จัดรถแล้ว รถกำลังไป
  'on_scene',     -- ถึงจุดรับผู้ป่วยแล้ว
  'in_transit',   -- ออกเดินทางแล้ว
  'arrived',      -- ถึงปลายทางแล้ว รอส่งมอบ
  'completed',    -- ส่งมอบเรียบร้อย
  'cancelled'
);

-- บทบาทผู้ใช้ — หนึ่งคนถือได้หลายบทบาท จึงเก็บเป็น array ใน profile.roles
create type public.app_role as enum ('sender', 'transporter', 'receiver', 'monitor', 'commander', 'admin');

-- ประเภทยานพาหนะ (rotary/fixed_wing เตรียมไว้สำหรับ Phase 2 ส่งกลับทางอากาศยาน)
create type public.vehicle_type as enum ('bls', 'als', 'utility', 'rotary', 'fixed_wing');
create type public.vehicle_status as enum ('available', 'dispatched', 'busy', 'maintenance', 'offline');

-- จุดเวลาที่ทำการประเมิน
create type public.assessment_kind as enum ('initial', 'enroute', 'handover');
