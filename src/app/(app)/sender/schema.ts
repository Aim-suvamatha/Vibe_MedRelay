import { z } from "zod";

/**
 * กติกาการตรวจฟอร์มขอส่งกลับ — ไฟล์เดียวใช้ทั้งสองฝั่ง
 *
 * ฝั่ง client เรียกเพื่อบอกผู้ใช้ทันทีว่าช่องไหนผิด จะได้ไม่ต้องรอ round-trip
 * ฝั่ง server เรียกซ้ำอีกครั้งเพราะ **การตรวจฝั่ง client ไม่ใช่ความปลอดภัย**
 * ใครก็ยิง POST ตรงมาที่ Server Action ได้โดยไม่ผ่านฟอร์มเลย
 *
 * ชั้นที่สามคือ CHECK constraint และ RLS policy ในฐานข้อมูล ซึ่งเป็นชั้นที่เชื่อถือได้จริง
 * zod ที่นี่มีไว้ให้ "ข้อความผิดพลาดอ่านรู้เรื่อง" ไม่ได้มีไว้แทน constraint
 */

import {
  type AirwayStatus,
  type ArmedBranch,
  type AvpuLevel,
  type ChestStatus,
  type PatientCategory,
  type PrecedenceLevel,
  type RankGroup,
  type ReportCategory,
  type TransportMode,
  type TxCode,
  type WoundStatus,
} from "@/lib/enums";

/* ────────────────────────────────────────────────────────────
 * รายการค่าของแต่ละ enum — ต้องตรงกับ 0001 และ 0018
 * ──────────────────────────────────────────────────────────── */
const PRECEDENCE_VALUES = ["urgent", "priority", "routine", "died"] as const;
const AVPU_VALUES = ["alert", "voice", "pain", "unresponsive"] as const;
const TRANSPORT_VALUES = ["ground", "rotary", "fixed_wing", "watercraft"] as const;
const BRANCH_VALUES = ["army", "navy", "air_force", "police", "civilian", "other"] as const;
const BLOOD_VALUES = ["O", "A", "B", "AB"] as const;
const RH_VALUES = ["positive", "negative"] as const;
const CATEGORY_VALUES = ["combat", "admin", "other"] as const;
const RANK_GROUP_VALUES = ["officer", "nco", "enlisted", "volunteer"] as const;
const AIRWAY_VALUES = ["normal", "oral_airway", "nasal_airway", "cricothyrotomy"] as const;
const CHEST_VALUES = ["normal", "occlusive_dressing", "needle_decompression", "chest_tube"] as const;
const WOUND_VALUES = ["normal", "dressing", "tourniquet", "windlass"] as const;
const SECURITY_VALUES = ["secure", "possible_contact", "active_contact"] as const;
const NBC_VALUES = ["none", "suspected", "confirmed"] as const;
const REPORT_VALUES = [
  "combat_gunshot",
  "combat_explosive",
  "combat_mine",
  "combat_other",
  "combat_accident",
  "noncombat_injury",
  "illness_respiratory",
  "illness_gi",
  "illness_malaria",
  "illness_std",
  "illness_other",
] as const;
const TX_VALUES = [
  "tourniquet",
  "hemostatic",
  "wound_dressing",
  "splint",
  "airway",
  "chest_seal",
  "needle_decompression",
  "chest_tube",
  "oxygen",
  "iv_fluid",
  "analgesic",
  "antibiotic",
  "txa",
  "tetanus_serum",
  "tetanus_toxoid",
  "blood_product",
  "other",
] as const;

export const GEAR_VALUES = [
  "helmet",
  "eyewear",
  "earplug",
  "body_armor",
  "arm_guard",
  "leg_guard",
  "other",
] as const;

export const INJURY_TYPE_VALUES = [
  "fracture",
  "open_fracture",
  "burn",
  "laceration",
  "abrasion",
] as const;

/* ────────────────────────────────────────────────────────────
 * helper
 * ──────────────────────────────────────────────────────────── */

/** ช่องที่ผู้ใช้เว้นว่างมาเป็น "" — แปลงเป็น undefined ก่อน ไม่งั้น enum จะไม่ผ่าน */
const blankToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

/** ช่องตัวเลขจำนวนเต็มที่เว้นว่างได้ — "" ต้องกลายเป็น undefined ไม่ใช่ NaN หรือ 0 */
function optionalInt(min: number, max: number, label: string) {
  return z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ message: `${label} ต้องเป็นตัวเลข` })
      .int(`${label} ต้องเป็นจำนวนเต็ม`)
      .min(min, `${label} ต้องอยู่ระหว่าง ${min}–${max}`)
      .max(max, `${label} ต้องอยู่ระหว่าง ${min}–${max}`)
      .optional(),
  );
}

/**
 * ช่องตัวเลขที่มีจุดทศนิยมได้ — น้ำหนัก ส่วนสูง อุณหภูมิ
 * ต้องแยกจาก optionalInt เพราะ .int() จะปฏิเสธ 37.2 ซึ่งเป็นค่าที่ถูกต้อง
 */
function optionalNumber(min: number, max: number, label: string) {
  return z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ message: `${label} ต้องเป็นตัวเลข` })
      .min(min, `${label} ต้องอยู่ระหว่าง ${min}–${max}`)
      .max(max, `${label} ต้องอยู่ระหว่าง ${min}–${max}`)
      .optional(),
  );
}

/**
 * ค่าที่ไม่อยู่ในรายการเกิดได้เฉพาะเมื่อมีคนยิง POST ตรงมาที่ Server Action
 * ผู้ใช้ผ่านหน้าเว็บเลือกผิดไม่ได้อยู่แล้วเพราะเป็น <select>
 * แต่ข้อความยังต้องเป็นภาษาไทย เพราะมันถูกส่งกลับไปแสดงใต้ช่องนั้นจริง
 */
function optionalEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    blankToUndefined,
    z.enum(values, { message: "ค่าที่เลือกไม่อยู่ในรายการ" }).optional(),
  );
}

function optionalText(max: number, label: string) {
  return z.preprocess(
    blankToUndefined,
    z.string().trim().max(max, `${label} ยาวเกิน ${max} ตัวอักษร`).optional(),
  );
}

/** ช่องติ๊ก — FormData ส่ง "on" มาเมื่อติ๊ก และไม่ส่งคีย์เลยเมื่อไม่ติ๊ก */
const optionalBool = z.preprocess(
  (v) => (v === undefined || v === "" ? undefined : v === "on" || v === "true"),
  z.boolean().optional(),
);

/**
 * ★ ใช้ z.guid() ไม่ใช่ z.uuid() กับทุก id ที่รับมาจากฐานข้อมูล
 *
 * zod 4 ทำให้ z.uuid() ตรวจ variant bits ตาม RFC 9562 ด้วย
 * มันจึงปฏิเสธสตริงที่หน้าตาเป็น uuid แต่ variant ไม่เข้าเกณฑ์
 * เช่น '11111111-1111-1111-1111-111111111111' ซึ่งใช้เป็น id ใน seed ได้ตามปกติ
 *
 * id เหล่านี้เป็นค่าทึบที่ฐานข้อมูลออกให้ เราไม่ได้เป็นคนสร้างรูปแบบเอง
 * หน้าที่ของการตรวจตรงนี้คือกันสตริงมั่วก่อนส่งเข้า query เท่านั้น
 */

/**
 * ก้อนข้อมูลที่เป็นรายการ — ฟอร์มส่งมาเป็น JSON ในช่องซ่อน
 *
 * ทำไมไม่ใช้ input ชื่อซ้ำหลายตัวแบบ items[0][name]
 *   actions.ts ใช้ Object.fromEntries(formData) ซึ่งทิ้งค่าซ้ำของคีย์เดียวกัน
 *   และรายการเหล่านี้เป็น object ที่มีหลายช่องต่อแถว การประกอบกลับจากชื่อคีย์
 *   จะกลายเป็น parser เล็กๆ ที่พังเงียบได้ ช่องซ่อนที่เก็บ JSON ตรงไปตรงมากว่า
 *
 * ★ parse ไม่ผ่านให้คืน [] ไม่ใช่ throw
 *   ค่าในช่องนี้มาจาก state ของ React ที่เราคุมเอง ถ้ามันเพี้ยนแปลว่าโค้ดเราพัง
 *   ไม่ใช่ผู้ใช้กรอกผิด การขึ้น error ให้ผู้ใช้แก้จึงไม่ช่วยอะไร
 */
export function jsonArray<T extends z.ZodTypeAny>(item: T) {
  return z.preprocess((v) => {
    if (Array.isArray(v)) return v;
    if (typeof v !== "string" || v.trim() === "") return [];
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, z.array(item));
}

/**
 * ช่องสัญญาณชีพ — ใช้ร่วมกันสองที่ จึงต้องอยู่ที่เดียว
 *
 *   1. ขั้นที่ 4 ของฟอร์มผู้ส่ง (ประเมินแรกรับ)
 *   2. ฟอร์มประเมินซ้ำใน /track (ชุดลำเลียงและปลายทางประเมินระหว่างทาง)
 *
 * ทั้งสองเขียนลงตาราง assessment ตารางเดียวกัน ช่วงตัวเลขที่ยอมรับจึงต้องตรงกัน
 * และต้องตรงกับ CHECK constraint ใน 0007_assessment.sql ด้วย
 * คู่กับหน้าจอที่ src/app/(app)/sender/new/vitals-fields.tsx
 */
export const VITALS_SHAPE = {
  sbp: optionalInt(0, 300, "ความดันตัวบน"),
  dbp: optionalInt(0, 200, "ความดันตัวล่าง"),
  pulse: optionalInt(0, 300, "ชีพจร"),
  respRate: optionalInt(0, 80, "อัตราหายใจ"),
  spo2: optionalInt(0, 100, "SpO₂"),
  temperature: optionalNumber(20, 45, "อุณหภูมิ"),
  avpu: optionalEnum(AVPU_VALUES),
  gcs: optionalInt(3, 15, "GCS"),
  findings: optionalText(1000, "สิ่งที่ตรวจพบ"),
};

/** ความดันตัวล่างต้องไม่มากกว่าตัวบน — ตรงกับ constraint assessment_bp_order */
export const bpOrderRefine = {
  check: (v: { sbp?: number; dbp?: number }) =>
    v.dbp === undefined || v.sbp === undefined || v.dbp <= v.sbp,
  message: "ความดันตัวล่างต้องไม่มากกว่าตัวบน",
} as const;

/** ตำแหน่งบาดเจ็บที่กดจากแผนภาพร่างกาย */
const InjurySite = z.object({
  site: z.string().trim().min(1).max(60),
  type: z.enum(INJURY_TYPE_VALUES).optional(),
  detail: z.string().trim().max(200).optional(),
});

/** หนึ่งรายการการรักษาที่ให้ไปแล้วก่อนส่ง */
export const TreatmentRow = z.object({
  txCode: z.enum(TX_VALUES),
  detail: z.string().trim().max(200).optional(),
  dose: z.string().trim().max(60).optional(),
  route: z.string().trim().max(30).optional(),
  site: z.string().trim().max(60).optional(),
  /** ISO ที่ browser แปลงมาแล้ว — เหตุผลเดียวกับ symptomOnsetAt */
  givenAt: z.string().datetime({ offset: true }).optional(),
});

/** หนึ่งรายการในบัญชีสิ่งของ */
const PropertyRow = z.object({
  itemName: z.string().trim().min(1).max(120),
  qty: z.coerce.number().int().min(1).max(9999).optional(),
  unitLabel: z.string().trim().max(30).optional(),
  weaponSerial: z.string().trim().max(60).optional(),
  cashThb: z.coerce.number().min(0).max(9_999_999).optional(),
  note: z.string().trim().max(200).optional(),
});

export const EvacRequestInput = z
  .object({
    /* ── ขั้นที่ 1 ผู้ป่วย ───────────────────────────────── */
    chiefComplaint: z
      .string()
      .trim()
      .min(1, "กรุณากรอกอาการสำคัญ")
      .max(500, "อาการสำคัญยาวเกิน 500 ตัวอักษร"),

    affiliation: optionalText(120, "สังกัดหน่วย"),
    mechanism: optionalText(500, "กลไกการบาดเจ็บ"),

    /**
     * ISO string ที่ฝั่ง client แปลงมาจากช่อง datetime-local แล้ว
     *
     * ต้องแปลงที่ browser เพราะ datetime-local ไม่มี timezone ติดมาด้วย
     * ถ้าปล่อยให้ server แปลง มันจะตีความด้วย timezone ของ server (UTC บน Vercel)
     * แล้วเวลาที่บันทึกจะเพี้ยนไป 7 ชั่วโมงจากที่ผู้ใช้กรอก
     */
    symptomOnsetAt: z.preprocess(
      blankToUndefined,
      z
        .string()
        .datetime({ offset: true, message: "รูปแบบเวลาไม่ถูกต้อง" })
        .refine(
          (v) => new Date(v).getTime() <= Date.now() + 60_000,
          "เวลาที่เริ่มมีอาการต้องไม่อยู่ในอนาคต",
        )
        .optional(),
    ),

    /* ── ข้อมูลผู้ป่วย (ทบ.466-901 ช่อง ๑–๗) ────────────── */
    rankTh: optionalText(40, "ยศ"),
    firstName: optionalText(80, "ชื่อ"),
    lastName: optionalText(80, "นามสกุล"),

    /**
     * เลขประจำตัวทหาร 10 หลัก — ไม่ใช่เลขบัตรประชาชน
     * ทบ.466-901 ช่อง ๒ หมายถึงเลขนี้ ระบบไม่มีช่องเลขบัตรประชาชนเลย
     */
    serviceNumber: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .regex(/^[0-9]{10}$/, "เลขประจำตัวทหารต้องเป็นตัวเลข 10 หลัก")
        .optional(),
    ),

    branch: optionalEnum(BRANCH_VALUES),
    ageYears: optionalInt(0, 120, "อายุ"),
    nationality: optionalText(40, "สัญชาติ"),
    ethnicity: optionalText(40, "เชื้อชาติ"),
    bloodGroup: optionalEnum(BLOOD_VALUES),
    rh: optionalEnum(RH_VALUES),
    drugAllergy: optionalText(200, "แพ้ยา"),
    foodAllergy: optionalText(200, "แพ้อาหาร"),
    chronicConditions: optionalText(500, "โรคประจำตัว"),
    pastHistory: optionalText(500, "ประวัติการเจ็บป่วย"),
    regularMeds: optionalText(300, "ยาที่ใช้เป็นประจำ"),
    weightKg: optionalNumber(1, 399, "น้ำหนัก"),
    heightCm: optionalNumber(1, 299, "ส่วนสูง"),
    phone: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .regex(/^[0-9+\-\s]{6,20}$/, "หมายเลขโทรศัพท์ไม่ถูกต้อง")
        .optional(),
    ),

    /* ── ขั้นที่ 2 ความเร่งด่วน ──────────────────────────── */
    /** สี triage ไม่มีช่องให้เลือกแล้ว ฐานข้อมูลตั้งจากค่านี้เอง (0021) */
    precedence: z.enum(PRECEDENCE_VALUES, {
      message: "กรุณาเลือกระดับความเร่งด่วน",
    }),

    /* ── ขั้นที่ 3 ปลายทางและจุดรับ ──────────────────────── */
    toUnitId: z.guid("กรุณาเลือกหน่วยปลายทาง"),
    pickupPointId: z.preprocess(blankToUndefined, z.guid().optional()),
    /** พิกัดที่พิมพ์เองหรือดึงจากเครื่อง ใช้เมื่อจุดที่นัดไว้ใช้ไม่ได้ */
    pickupGrid: optionalText(120, "พิกัดจุดรับ"),
    transportMode: optionalEnum(TRANSPORT_VALUES),
    patientCategory: optionalEnum(CATEGORY_VALUES),

    /* ── ขั้นที่ 4 ประเมินแรกรับ ─────────────────────────── */
    ...VITALS_SHAPE,

    /* ── ขั้นที่ 5 เหตุการณ์และการบาดเจ็บ ────────────────── */
    onDuty: optionalBool,
    hostileAction: optionalBool,
    reportCategory: optionalEnum(REPORT_VALUES),
    patientRankGroup: optionalEnum(RANK_GROUP_VALUES),
    operationType: optionalText(120, "ยุทธการ"),
    operatingBase: optionalText(120, "ฐานปฏิบัติการ"),
    injuryPlace: optionalText(120, "สถานที่เกิดเหตุ"),
    /** กรอกด้วยมือหรือเลือกจากจุดที่กำหนดไว้ ห้ามดึงจาก GPS อัตโนมัติ */
    injuryGrid: optionalText(120, "พิกัดจุดเกิดเหตุ"),
    protectiveGear: z.preprocess(
      (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
      z.array(z.enum(GEAR_VALUES)),
    ),
    injurySites: jsonArray(InjurySite),
    airwayStatus: optionalEnum(AIRWAY_VALUES),
    chestStatus: optionalEnum(CHEST_VALUES),
    woundStatus: optionalEnum(WOUND_VALUES),
    securityStatus: optionalEnum(SECURITY_VALUES),
    nbcStatus: optionalEnum(NBC_VALUES),
    otherNote: optionalText(1000, "บันทึกอื่นๆ"),

    /* ── ขั้นที่ 6–7 ─────────────────────────────────────── */
    treatments: jsonArray(TreatmentRow),
    propertyItems: jsonArray(PropertyRow),

    /**
     * กุญแจกันส่งซ้ำ — ฝั่ง client สร้างครั้งเดียวตอนเปิดฟอร์ม
     * ตาราง case มี UNIQUE (client_uuid) จึงเป็นการกันซ้ำที่ระดับฐานข้อมูลจริง
     * ไม่ใช่แค่ disable ปุ่มซึ่งกันได้แค่การกดรัวในแท็บเดียว
     */
    clientUuid: z.guid(),
  })
  .refine((v) => v.dbp === undefined || v.sbp === undefined || v.dbp <= v.sbp, {
    message: "ความดันตัวล่างต้องไม่มากกว่าตัวบน",
    path: ["dbp"],
  })
  /**
   * ต้องรู้ว่าไปรับที่ไหน — เลือกจากรายการ หรือกรอกพิกัดเอง อย่างใดอย่างหนึ่ง
   * ฐานข้อมูลไม่บังคับข้อนี้โดยเจตนา (ดู comment ใน 0021) เพราะบางเคสเปิดคำขอ
   * ก่อนที่จะรู้จุดรับจริง แต่ฟอร์มบังคับ เพราะเป็นข้อมูลที่ชุดลำเลียงต้องใช้
   */
  .refine((v) => v.pickupPointId !== undefined || v.pickupGrid !== undefined, {
    message: "เลือกจุดรับจากรายการ หรือกรอกพิกัดเอง อย่างใดอย่างหนึ่ง",
    path: ["pickupGrid"],
  })
  /**
   * สายรัดห้ามเลือดต้องมีตำแหน่งเสมอ
   * แบบฟอร์มกระดาษมีช่อง "ตำแหน่ง" แยกไว้ เพราะรัดนานเกิน 2 ชม.
   * เสี่ยงต่อการสูญเสียอวัยวะ คนที่รับต่อต้องรู้ว่ารัดไว้ตรงไหนถึงจะไปคลายถูก
   */
  .refine(
    (v) =>
      v.treatments.every(
        (t) => t.txCode !== "tourniquet" || (t.site && t.site.length > 0),
      ),
    {
      message: "สายรัดห้ามเลือดต้องระบุตำแหน่งที่รัดเสมอ",
      path: ["treatments"],
    },
  );

export type EvacRequestValues = z.infer<typeof EvacRequestInput>;

/** ค่าที่ฟอร์มส่งกลับมาเมื่อ submit ไม่ผ่าน จะได้ไม่ต้องกรอกใหม่ทั้งหน้า */
export type EvacRequestState = {
  error?: string;
  /** ข้อความผิดพลาดรายช่อง key คือชื่อ field ใน EvacRequestInput */
  fieldErrors?: Partial<Record<keyof EvacRequestValues, string>>;
};

export const PRECEDENCE_VALUES_RO: readonly PrecedenceLevel[] = PRECEDENCE_VALUES;

/* ────────────────────────────────────────────────────────────
 * ป้ายภาษาไทยของ enum ที่ใช้ในฟอร์มนี้
 * เรียงลำดับตามที่ปรากฏบนแบบฟอร์มกระดาษ ไม่ใช่ตามตัวอักษร
 * ──────────────────────────────────────────────────────────── */

export const AVPU_LABEL: Record<AvpuLevel, string> = {
  alert: "ด · ตื่นดี",
  voice: "ร · เรียกตื่น",
  pain: "จ · เจ็บตื่น",
  unresponsive: "ม · ไม่ตื่น",
};

/** รถพยาบาลขึ้นก่อน เพราะเป็นคำตอบที่ใช้บ่อยที่สุด (คำสั่งเจ้าของโครงการ 8 ก.ย. 2569) */
export const TRANSPORT_LABEL: Record<TransportMode, string> = {
  ground: "รถพยาบาล",
  rotary: "เฮลิคอปเตอร์",
  fixed_wing: "เครื่องบินปีกตรึง",
  watercraft: "เรือ",
};

export const TRANSPORT_ORDER: readonly TransportMode[] = [
  "ground",
  "rotary",
  "fixed_wing",
  "watercraft",
];

export const BRANCH_LABEL: Record<ArmedBranch, string> = {
  army: "ทหารบก",
  navy: "ทหารเรือ",
  air_force: "ทหารอากาศ",
  police: "ตำรวจ",
  civilian: "พลเรือน",
  other: "อื่นๆ",
};

export const CATEGORY_LABEL: Record<PatientCategory, string> = {
  combat: "บาดเจ็บยุทธการ",
  admin: "ธุรการ",
  other: "อื่นๆ",
};

export const RANK_GROUP_LABEL: Record<RankGroup, string> = {
  officer: "นายทหาร",
  nco: "นายสิบ",
  enlisted: "พลทหาร",
  volunteer: "อาสาสมัคร",
};

/** เรียงตามลำดับข้อในตาราง ทบ.466-900 เพื่อให้คนที่คุ้นกระดาษหาเจอทันที */
export const REPORT_CATEGORY_LABEL: Record<ReportCategory, string> = {
  combat_gunshot: "๑.๑ ถูกยิง",
  combat_explosive: "๑.๒ ถูกระเบิด",
  combat_mine: "๑.๓ ถูกกับระเบิด",
  combat_other: "๑.๔ บาดเจ็บจากการรบ อื่นๆ",
  combat_accident: "๒ อุบัติเหตุจากการรบ",
  noncombat_injury: "๓ การบาดเจ็บสาเหตุอื่นๆ",
  illness_respiratory: "ป่วยไข้ · โรคทางเดินหายใจ",
  illness_gi: "ป่วยไข้ · โรคทางเดินอาหาร",
  illness_malaria: "ป่วยไข้ · โรคมาลาเรีย",
  illness_std: "ป่วยไข้ · กามโรค",
  illness_other: "ป่วยไข้ · อื่นๆ",
};

export const REPORT_CATEGORY_ORDER: readonly ReportCategory[] = [
  "combat_gunshot",
  "combat_explosive",
  "combat_mine",
  "combat_other",
  "combat_accident",
  "noncombat_injury",
  "illness_respiratory",
  "illness_gi",
  "illness_malaria",
  "illness_std",
  "illness_other",
];

export const AIRWAY_LABEL: Record<AirwayStatus, string> = {
  normal: "ปกติ",
  oral_airway: "ใส่ท่อปาก",
  nasal_airway: "ใส่ท่อจมูก",
  cricothyrotomy: "เจาะคอ",
};

export const CHEST_LABEL: Record<ChestStatus, string> = {
  normal: "ปกติ",
  occlusive_dressing: "ปิดด้วยผ้า",
  needle_decompression: "เข็มระบาย",
  chest_tube: "ท่อระบาย",
};

export const WOUND_LABEL: Record<WoundStatus, string> = {
  normal: "ปกติ",
  dressing: "ผ้าแต่งแผล",
  tourniquet: "สายรัด",
  windlass: "ขันชะเนาะ",
};

export const SECURITY_LABEL: Record<string, string> = {
  secure: "ปลอดภัย",
  possible_contact: "อาจมีการปะทะ",
  active_contact: "มีการปะทะ",
};

export const NBC_LABEL: Record<string, string> = {
  none: "ไม่มี",
  suspected: "สงสัย",
  confirmed: "ยืนยันแล้ว",
};

/** ช่องติ๊กอุปกรณ์ป้องกัน 7 ช่องตาม ทบ.466-901 ด้านหลัง */
export const GEAR_LABEL: Record<(typeof GEAR_VALUES)[number], string> = {
  helmet: "หมวกเหล็ก",
  eyewear: "แว่นตา",
  earplug: "ที่อุดหู",
  body_armor: "เสื้อเกราะ",
  arm_guard: "เกราะแขน",
  leg_guard: "เกราะขา",
  other: "อื่นๆ",
};

/** รหัสท้ายแบบฟอร์ม — กห · หป · หม · ฉ · ถ */
export const INJURY_TYPE_LABEL: Record<
  (typeof INJURY_TYPE_VALUES)[number],
  string
> = {
  fracture: "กห · กระดูกหัก",
  open_fracture: "หป · กระดูกหักเปิด",
  burn: "หม · ไหม้",
  laceration: "ฉ · ฉีกขาด",
  abrasion: "ถ · ถลอก",
};

/** หัตถการและยาที่กดปุ่มเดียวบันทึกได้ เรียงตามลำดับที่ใช้จริงหน้างาน */
export const TX_LABEL: Record<TxCode, string> = {
  tourniquet: "สายรัดห้ามเลือด",
  hemostatic: "ผงห้ามเลือด",
  wound_dressing: "ผ้าแต่งแผล",
  splint: "ดามกระดูก",
  airway: "ใส่ท่อหายใจ",
  chest_seal: "ปิดแผลทรวงอก",
  needle_decompression: "เข็มระบายลม",
  chest_tube: "ท่อระบายทรวงอก",
  oxygen: "ออกซิเจน",
  iv_fluid: "น้ำเกลือ NS/LR",
  analgesic: "ยาแก้ปวด",
  antibiotic: "ยาฆ่าเชื้อ",
  txa: "TXA",
  tetanus_serum: "เซรุ่มบาดทะยัก",
  tetanus_toxoid: "ทอกซอยด์บาดทะยัก",
  blood_product: "ให้เลือด",
  other: "อื่นๆ",
};

export const TX_ORDER: readonly TxCode[] = [
  "tourniquet",
  "hemostatic",
  "wound_dressing",
  "splint",
  "airway",
  "chest_seal",
  "needle_decompression",
  "chest_tube",
  "oxygen",
  "iv_fluid",
  "analgesic",
  "antibiotic",
  "txa",
  "tetanus_serum",
  "tetanus_toxoid",
  "blood_product",
  "other",
];

/**
 * บริเวณร่างกายบนแผนภาพ — ต้องตรงกับ data-region ของ SVG ใน injury-map.tsx
 * ชื่อคีย์เป็นอังกฤษเพราะเก็บลง jsonb ที่ต้อง query ได้ ป้ายไทยไว้แสดงอย่างเดียว
 */
export const BODY_REGION_LABEL: Record<string, string> = {
  head: "ศีรษะ",
  neck: "คอ",
  chest: "ทรวงอก",
  abdomen: "ช่องท้อง",
  pelvis: "เชิงกราน",
  upper_arm_r: "ต้นแขนขวา",
  upper_arm_l: "ต้นแขนซ้าย",
  forearm_r: "ปลายแขนขวา",
  forearm_l: "ปลายแขนซ้าย",
  hand_r: "มือขวา",
  hand_l: "มือซ้าย",
  thigh_r: "ต้นขาขวา",
  thigh_l: "ต้นขาซ้าย",
  shin_r: "หน้าแข้งขวา",
  shin_l: "หน้าแข้งซ้าย",
  foot_r: "เท้าขวา",
  foot_l: "เท้าซ้าย",
  occiput: "ท้ายทอย",
  nape: "ต้นคอ",
  upper_back: "หลังส่วนบน",
  lower_back: "หลังส่วนล่าง",
  buttock: "สะโพก",
  upper_arm_rb: "ต้นแขนขวา (หลัง)",
  upper_arm_lb: "ต้นแขนซ้าย (หลัง)",
  forearm_rb: "ปลายแขนขวา (หลัง)",
  forearm_lb: "ปลายแขนซ้าย (หลัง)",
  hand_rb: "หลังมือขวา",
  hand_lb: "หลังมือซ้าย",
  thigh_rb: "ต้นขาขวา (หลัง)",
  thigh_lb: "ต้นขาซ้าย (หลัง)",
  calf_r: "น่องขวา",
  calf_l: "น่องซ้าย",
  heel_r: "ส้นเท้าขวา",
  heel_l: "ส้นเท้าซ้าย",
};
