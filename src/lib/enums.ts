/**
 * Union type ของ enum ที่ประกาศไว้ใน supabase/migrations/0001_enums.sql
 *
 * ไฟล์นี้ต่างจาก src/types/database.ts ตรงที่ **ไม่ใช่ type ของตาราง**
 * enum เป็นรายการค่าคงที่ที่ UI ต้องรู้ตั้งแต่ตอน compile เพื่อทำ exhaustive check
 * ส่วน type ของตารางยังต้อง generate จาก schema จริงเท่านั้น
 *
 * ถ้าแก้ 0001_enums.sql ต้องแก้ไฟล์นี้ให้ตรงกันด้วย
 */

export type PrecedenceLevel = "urgent" | "priority" | "routine";

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
  | "other";
