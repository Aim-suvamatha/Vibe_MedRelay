/**
 * Union type ของ enum ที่ประกาศไว้ใน supabase/migrations/0001_enums.sql
 *
 * ไฟล์นี้ต่างจาก src/types/database.ts ตรงที่ **ไม่ใช่ type ของตาราง**
 * enum เป็นรายการค่าคงที่ที่ UI ต้องรู้ตั้งแต่ตอน compile เพื่อทำ exhaustive check
 * ส่วน type ของตารางยังต้อง generate จาก schema จริงเท่านั้น
 *
 * ถ้าแก้ 0001_enums.sql ต้องแก้ไฟล์นี้ให้ตรงกันด้วย
 */

/**
 * ★ "died" เป็นค่าที่สี่ที่เพิ่มใน 0018 (การตัดสินใจของเจ้าของโครงการ 8 ก.ย. 2569)
 *   มันไม่ใช่ "ความเร่งด่วน" ในความหมายเดียวกับอีกสามค่า — ผู้เสียชีวิตยังต้องส่งกลับ
 *   แต่ไม่ได้เร่งรถ เวลาส่งกลับจึงยาวกว่าปกติโดยธรรมชาติ
 *   src/lib/metrics.ts จึงกันเคสนี้ออกจากค่ามัธยฐานเวลา ไม่งั้นตัวเลขบนแดชบอร์ด
 *   จะดูแย่ลงทั้งที่ระบบทำงานปกติ
 */
export type PrecedenceLevel = "urgent" | "priority" | "routine" | "died";

export type TriageColor = "black" | "red" | "yellow" | "green";

export type RoleOfCare = "role_1" | "role_2" | "role_3" | "role_4";

export type CaseStatus = "requested" | "active" | "completed" | "cancelled";

/** ลำดับนี้คือลำดับเวลาจริง — constraint leg_time_order ใน 0006 บังคับว่าห้ามข้ามขั้น */
export type LegStatus =
  | "pending"
  | "dispatched"
  | "on_scene"
  | "in_transit"
  | "arrived"
  | "completed"
  | "cancelled";

export type AppRole =
  | "sender"
  | "transporter"
  | "receiver"
  | "monitor"
  | "commander"
  | "admin";

export type VehicleType = "bls" | "als" | "utility" | "rotary" | "fixed_wing";

export type VehicleStatus =
  | "available"
  | "dispatched"
  | "busy"
  | "maintenance"
  | "offline";

export type AssessmentKind = "initial" | "enroute" | "handover";

/* -------------------------------------------------------------
 * enum ที่เพิ่มใน 0012_form_enums.sql
 * ถอดมาจากแบบฟอร์มกระดาษของจริงใน supabase/Report/
 * ----------------------------------------------------------- */

/** ชั้นยศสำหรับนับยอดใน ทบ.466-900 — คนละเรื่องกับ profile.rank_th */
export type RankGroup = "officer" | "nco" | "enlisted" | "volunteer";

/** หมวดสาเหตุตาม ทบ.466-900 ใช้ลงยอดรายงานประจำวันโดยไม่ต้องกรอกซ้ำ */
export type ReportCategory =
  | "combat_gunshot"
  | "combat_explosive"
  | "combat_mine"
  | "combat_other"
  | "combat_accident"
  | "noncombat_injury"
  | "illness_respiratory"
  | "illness_gi"
  | "illness_malaria"
  | "illness_std"
  | "illness_other";

/** ผลการรักษาตามช่องท้ายตาราง ทบ.466-900 */
export type CaseOutcome = "recovered" | "hospitalized" | "died";

export type DispositionRoute =
  | "evac_chain"
  | "civilian_hospital"
  | "returned_to_unit";

/** ด ตื่นดี · ร เรียกตื่น · จ เจ็บตื่น · ม ไม่ตื่น (ท้าย ทบ.466-901 ด้านหลัง) */
export type AvpuLevel = "alert" | "voice" | "pain" | "unresponsive";

/** ยานพาหนะที่ "ขอ" ตาม ทบ.466-902 — ต่างจาก VehicleType ที่เป็นคันที่จัดให้จริง */
export type TransportMode = "ground" | "rotary" | "fixed_wing" | "watercraft";

/** ประเภทคนไข้ตามช่องใน ทบ.466-902 */
export type PatientMobility =
  | "litter_dependent"
  | "litter_assisted"
  | "ambulatory"
  | "psych_escort"
  | "psych_no_escort";

export type SecurityStatus = "secure" | "possible_contact" | "active_contact";

export type NbcStatus = "none" | "suspected" | "confirmed";

/** หัตถการและยาที่กดปุ่มเดียวบันทึกได้ ถอดจาก ทบ.466-901 ด้านหลัง */
export type TxCode =
  | "tourniquet"
  | "hemostatic"
  | "wound_dressing"
  | "splint"
  | "airway"
  | "chest_seal"
  | "needle_decompression"
  | "chest_tube"
  | "oxygen"
  | "iv_fluid"
  | "analgesic"
  | "antibiotic"
  | "txa"
  // เพิ่มใน 0018 — ช่อง ๒๒–๒๓ ของ ทบ.466-901 และช่อง "เลือดให้" ในตารางเฝ้าระวัง
  | "tetanus_serum"
  | "tetanus_toxoid"
  | "blood_product"
  | "other";

/* -------------------------------------------------------------
 * enum ที่เพิ่มใน 0018_form_enums_v2.sql
 * ----------------------------------------------------------- */

/** เหล่าทัพ (ทบ.466-901 ช่อง ๔) */
export type ArmedBranch =
  | "army"
  | "navy"
  | "air_force"
  | "police"
  | "civilian"
  | "other";

/** หมู่โลหิตและ Rh แยกกันเพราะกระดาษก็แยกเป็นสองบรรทัด และ Rh อาจทราบทีหลัง */
export type BloodGroup = "O" | "A" | "B" | "AB";
export type RhFactor = "positive" | "negative";

/** ประเภทผู้ป่วย — หยาบกว่า ReportCategory โดยเจตนา เพราะหน้างานต้องเลือกได้ในหนึ่งวินาที */
export type PatientCategory = "combat" | "admin" | "other";

/** สามแถวติ๊กมุมบนขวาของ ทบ.466-901 ด้านหลัง — เป็นสภาพ ไม่ใช่รายการหัตถการ */
export type AirwayStatus =
  | "normal"
  | "oral_airway"
  | "nasal_airway"
  | "cricothyrotomy";

export type ChestStatus =
  | "normal"
  | "occlusive_dressing"
  | "needle_decompression"
  | "chest_tube";

export type WoundStatus = "normal" | "dressing" | "tourniquet" | "windlass";

/* -------------------------------------------------------------
 * enum ที่เพิ่มใน 0025_monitor_resources.sql
 * ----------------------------------------------------------- */

/**
 * ผลการตัดสินคำขอส่งกลับทางอากาศโดยศูนย์สั่งการ
 *
 * ★ ไม่มีค่า "pending" โดยเจตนา — "รออนุมัติ" ไม่ใช่ผลการตัดสิน แต่เป็นการ
 *   ที่ยังไม่มีการตัดสิน ในฐานข้อมูลจึงเก็บเป็น null และคำนวณจาก
 *   transport_mode เป็นอากาศยาน + air_decision ยังว่าง (ดูหัวไฟล์ 0025)
 *   ถ้าเก็บเป็นค่าที่สาม จะมีแหล่งความจริงสองที่สำหรับข้อเท็จจริงเดียว
 */
export type AirDecision = "approved" | "denied";
