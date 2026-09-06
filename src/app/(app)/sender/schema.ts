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
  type AvpuLevel,
  type PatientMobility,
  type PrecedenceLevel,
  type TransportMode,
  type TriageColor,
} from "@/lib/enums";

const PRECEDENCE_VALUES = ["urgent", "priority", "routine"] as const;
const TRIAGE_VALUES = ["black", "red", "yellow", "green"] as const;
const AVPU_VALUES = ["alert", "voice", "pain", "unresponsive"] as const;
const MOBILITY_VALUES = [
  "litter_dependent",
  "litter_assisted",
  "ambulatory",
  "psych_escort",
  "psych_no_escort",
] as const;
const TRANSPORT_VALUES = ["ground", "rotary", "fixed_wing", "watercraft"] as const;

/** ช่องที่ผู้ใช้เว้นว่างมาเป็น "" — แปลงเป็น undefined ก่อน ไม่งั้น enum จะไม่ผ่าน */
const blankToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

/** ช่องตัวเลขที่เว้นว่างได้ — "" ต้องกลายเป็น undefined ไม่ใช่ NaN หรือ 0 */
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

/**
 * ★ ใช้ z.guid() ไม่ใช่ z.uuid() กับทุก id ที่รับมาจากฐานข้อมูล
 *
 * zod 4 ทำให้ z.uuid() ตรวจ variant bits ตาม RFC 9562 ด้วย
 * มันจึงปฏิเสธสตริงที่หน้าตาเป็น uuid แต่ variant ไม่เข้าเกณฑ์
 * เช่น '11111111-1111-1111-1111-111111111111' ซึ่งใช้เป็น id ใน seed ได้ตามปกติ
 *
 * id เหล่านี้เป็นค่าทึบที่ฐานข้อมูลออกให้ เราไม่ได้เป็นคนสร้างรูปแบบเอง
 * หน้าที่ของการตรวจตรงนี้คือกันสตริงมั่วก่อนส่งเข้า query เท่านั้น ไม่ใช่บังคับเวอร์ชันของ uuid
 * z.guid() ตรวจแค่รูปทรง ซึ่งตรงกับเจตนามากกว่า
 */
export const EvacRequestInput = z
  .object({
    // ── ผู้ป่วยเป็นอย่างไร ────────────────────────────────────
    patientCount: z.coerce
      .number({ message: "จำนวนผู้ป่วยต้องเป็นตัวเลข" })
      .int("จำนวนผู้ป่วยต้องเป็นจำนวนเต็ม")
      .min(1, "จำนวนผู้ป่วยต้องอยู่ระหว่าง 1–50")
      .max(50, "จำนวนผู้ป่วยต้องอยู่ระหว่าง 1–50"),

    /**
     * นามสมมติเท่านั้น ห้ามชื่อจริง (AI_RULES §3.1)
     * ตัวเลข 13 หลักติดกันคือรูปแบบเลขบัตรประชาชน — ปฏิเสธตั้งแต่ที่นี่
     * ฐานข้อมูลก็มี constraint case_alias_no_national_id กันไว้อีกชั้น
     */
    patientAlias: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .max(80, "นามสมมติยาวเกิน 80 ตัวอักษร")
        .refine(
          (v) => !/\d{13}/.test(v),
          "ห้ามกรอกเลขบัตรประชาชน — ช่องนี้ใช้นามสมมติเท่านั้น",
        )
        .optional(),
    ),

    chiefComplaint: z
      .string()
      .trim()
      .min(1, "กรุณากรอกอาการสำคัญ")
      .max(500, "อาการสำคัญยาวเกิน 500 ตัวอักษร"),

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

    // ── เร่งด่วนแค่ไหน ────────────────────────────────────────
    precedence: z.enum(PRECEDENCE_VALUES, {
      message: "กรุณาเลือกระดับความเร่งด่วน",
    }),
    triage: optionalEnum(TRIAGE_VALUES),

    // ── ส่งไปไหน ─────────────────────────────────────────────
    toUnitId: z.guid("กรุณาเลือกหน่วยปลายทาง"),
    /** จุดที่กำหนดไว้ล่วงหน้าเท่านั้น ไม่มีการอ่านพิกัดจากเครื่อง (AI_RULES §3.1) */
    pickupPointId: z.preprocess(blankToUndefined, z.guid().optional()),
    pickupMarking: optionalText(200, "จุดสังเกต"),
    transportMode: optionalEnum(TRANSPORT_VALUES),
    patientMobility: optionalEnum(MOBILITY_VALUES),

    // ── ประเมินแรกรับ (ไม่บังคับทุกช่อง) ──────────────────────
    avpu: optionalEnum(AVPU_VALUES),
    gcs: optionalInt(3, 15, "GCS"),
    sbp: optionalInt(0, 300, "ความดันตัวบน"),
    dbp: optionalInt(0, 200, "ความดันตัวล่าง"),
    pulse: optionalInt(0, 300, "ชีพจร"),
    respRate: optionalInt(0, 80, "อัตราหายใจ"),
    spo2: optionalInt(0, 100, "SpO₂"),
    findings: optionalText(1000, "สิ่งที่ตรวจพบ"),

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
  });

export type EvacRequestValues = z.infer<typeof EvacRequestInput>;

/** ค่าที่ฟอร์มส่งกลับมาเมื่อ submit ไม่ผ่าน จะได้ไม่ต้องกรอกใหม่ทั้งหน้า */
export type EvacRequestState = {
  error?: string;
  /** ข้อความผิดพลาดรายช่อง key คือชื่อ field ใน EvacRequestInput */
  fieldErrors?: Partial<Record<keyof EvacRequestValues, string>>;
};

export const PRECEDENCE_VALUES_RO: readonly PrecedenceLevel[] = PRECEDENCE_VALUES;
export const TRIAGE_VALUES_RO: readonly TriageColor[] = TRIAGE_VALUES;

/** ป้ายภาษาไทยของ enum ที่ใช้เฉพาะหน้านี้ — ไม่ได้อยู่ใน triage.ts เพราะยังไม่มีหน้าอื่นใช้ */
export const AVPU_LABEL: Record<AvpuLevel, string> = {
  alert: "ตื่นดี",
  voice: "เรียกตื่น",
  pain: "เจ็บตื่น",
  unresponsive: "ไม่ตื่น",
};

export const TRANSPORT_LABEL: Record<TransportMode, string> = {
  ground: "รถพยาบาล",
  rotary: "เฮลิคอปเตอร์",
  fixed_wing: "เครื่องบินปีกตรึง",
  watercraft: "เรือ",
};

export const MOBILITY_LABEL: Record<PatientMobility, string> = {
  litter_dependent: "นอนเปล ช่วยเหลือตัวเองไม่ได้",
  litter_assisted: "นอนเปล ช่วยเหลือตัวเองได้บ้าง",
  ambulatory: "เดินได้",
  psych_escort: "ผู้ป่วยจิตเวช ต้องมีผู้ควบคุม",
  psych_no_escort: "ผู้ป่วยจิตเวช ไม่ต้องมีผู้ควบคุม",
};
