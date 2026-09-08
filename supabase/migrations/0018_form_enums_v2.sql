-- =============================================================
-- 0018_form_enums_v2.sql — enum ชุดที่สองจากแบบฟอร์มกระดาษ
--
-- ⚠ ไฟล์นี้ต้องแยกจากไฟล์ที่ "ใช้" ค่าเหล่านี้เสมอ
--   supabase/scripts/sql.mjs ห่อทั้งไฟล์ด้วย begin/commit
--   PostgreSQL ยอมให้ ALTER TYPE ... ADD VALUE อยู่ใน transaction ได้ตั้งแต่ 12
--   แต่ **ห้ามใช้ค่าที่เพิ่งเพิ่มภายใน transaction เดียวกัน**
--   ถ้ารวมกับ 0020 ที่ประกาศคอลัมน์ชนิดนี้ จะพังตอนรันบนของจริง
--
-- ที่มาเหมือนเดิม: เอกสารต้นฉบับใน supabase/Report/ ทบ.466-900 ถึง 903
-- =============================================================

-- เหล่าทัพ (ทบ.466-901 ช่อง ๔) — กระดาษเป็นช่องเขียนอิสระ แต่ค่าที่เขียนจริงมีไม่กี่ค่า
-- เก็บเป็น enum เพื่อให้รายงานรวมยอดได้ ไม่ต้องมาไล่แก้คำสะกดทีหลัง
create type public.armed_branch as enum (
  'army',      -- ทหารบก
  'navy',      -- ทหารเรือ
  'air_force', -- ทหารอากาศ
  'police',    -- ตำรวจ
  'civilian',  -- พลเรือน
  'other'
);

-- หมู่โลหิต — ช่องติ๊กในบัตรบันทึกการเจ็บป่วยในสนาม (O / A / B / AB และ Rh+ve / Rh-ve)
-- แยกเป็นสอง enum เพราะกระดาษก็แยกเป็นสองบรรทัด และ Rh อาจทราบทีหลังหมู่เลือด
create type public.blood_group as enum ('O', 'A', 'B', 'AB');
create type public.rh_factor   as enum ('positive', 'negative');

-- ประเภทผู้ป่วยตามที่เจ้าของโครงการกำหนด (8 ก.ย. 2569)
-- ไม่ใช่ช่อง "ประเภทคนไข้" 9 ช่องของ ทบ.466-902 ซึ่งละเอียดเกินกว่าที่หน้างานจะเลือกได้เร็ว
create type public.patient_category as enum (
  'combat',  -- บาดเจ็บยุทธการ
  'admin',   -- ธุรการ
  'other'    -- อื่นๆ
);

-- สามแถวติ๊กมุมบนขวาของ ทบ.466-901 ด้านหลัง
-- เป็น "สภาพ ณ ขณะส่งมอบ" ไม่ใช่รายการหัตถการ จึงอยู่ในตาราง case ไม่ใช่ treatment
-- (ค่า 'ปกติ' เป็นการบันทึกว่าตรวจแล้วไม่พบอะไร ซึ่ง treatment เก็บไม่ได้)
create type public.airway_status as enum (
  'normal',          -- ปกติ
  'oral_airway',     -- ใส่ท่อปาก
  'nasal_airway',    -- ใส่ท่อจมูก
  'cricothyrotomy'   -- เจาะคอ
);

create type public.chest_status as enum (
  'normal',                -- ปกติ
  'occlusive_dressing',    -- ปิดด้วยผ้า
  'needle_decompression',  -- เข็มระบาย
  'chest_tube'             -- ท่อระบาย
);

create type public.wound_status as enum (
  'normal',      -- ปกติ
  'dressing',    -- ผ้าแต่งแผล
  'tourniquet',  -- สายรัด
  'windlass'     -- ขันชะเนาะ
);

-- =============================================================
-- ค่าที่เพิ่มเข้า enum เดิม
-- =============================================================

-- ระดับที่ 4 ของปุ่มความเร่งด่วน (การตัดสินใจของเจ้าของโครงการ 8 ก.ย. 2569)
--
-- ⚠ ค่านี้ไม่ใช่ "ความเร่งด่วน" ในความหมายเดียวกับอีกสามค่า
--   ผู้เสียชีวิตยังต้องส่งกลับ แต่ไม่ได้เร่งรถ เวลาส่งกลับจึงยาวกว่าปกติโดยธรรมชาติ
--   src/lib/metrics.ts จึงต้องกันเคส died ออกจากค่ามัธยฐานเวลา
--   ไม่งั้นตัวเลขบนแดชบอร์ดจะดูแย่ลงทั้งที่ระบบทำงานปกติ
--   และ src/lib/triage.ts แปลงค่านี้เป็นสี triage 'black' (เกินเยียวยา)
alter type public.precedence_level add value if not exists 'died';

-- ช่อง ๒๒–๒๓ ของ ทบ.466-901 (ฉีดเซรุ่ม / ทอกซอยด์บาดทะยัก)
-- และช่อง "เลือดให้" ในตารางเฝ้าระวังของบัตรบันทึกการเจ็บป่วยในสนาม
alter type public.tx_code add value if not exists 'tetanus_serum';
alter type public.tx_code add value if not exists 'tetanus_toxoid';
alter type public.tx_code add value if not exists 'blood_product';
