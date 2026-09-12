import type {
  AirDecision,
  PrecedenceLevel,
  RoleOfCare,
  TransportMode,
  TriageColor,
  VehicleStatus,
  VehicleType,
} from "@/lib/enums";

/**
 * ป้ายและรูปร่างข้อมูลของหน้าศูนย์สั่งการ — ส่วนที่ "ไม่แตะฐานข้อมูล"
 *
 * 🔴 ไฟล์นี้ต้องไม่ import อะไรจาก @/lib/supabase/server เด็ดขาด
 *   air-approval.tsx เป็น "use client" และต้องใช้ป้ายกับ type จากที่นี่
 *   ถ้าค่าพวกนี้อยู่รวมกับฟังก์ชันที่เรียก createClient() ตัว bundler จะลาก
 *   next/headers เข้าไปฝั่ง client แล้ว build ล้มด้วย
 *   "You're importing a component that needs server-only APIs"
 *   ซึ่งเป็นกับดักเส้นแบ่ง server/client ที่ **typecheck จับไม่เจอ** — เจอตอน build เท่านั้น
 *
 *   ตัวที่ต่อฐานข้อมูลอยู่ใน monitor-resources.ts · ตรรกะเส้นทางอยู่ใน routes.ts
 *
 * ★ ไฟล์นี้ห้ามมี "use server" ด้วยเหตุผลคนละข้อกัน
 *   "use server" บังคับให้ทุก export เป็น async function ค่าคงที่ที่ export ออกไป
 *   จะกลายเป็น server reference แล้วพังตอน render โดย typecheck ผ่านสบาย
 *   (บทเรียน ASSESSOR_ROLES 8 ก.ย. 2569 — "roles.some is not a function")
 */

/* -------------------------------------------------------------
 * ค่าคงที่และป้ายภาษาไทย
 * ----------------------------------------------------------- */

/**
 * โหมดที่ถือว่าเป็น "คำขอส่งกลับทางอากาศ" ซึ่งต้องผ่านการอนุมัติของศูนย์สั่งการ
 * watercraft ไม่อยู่ในนี้ — เรือไม่ต้องขออนุมัติจากศูนย์สั่งการส่งกลับ
 */
export const AIR_MODES: readonly TransportMode[] = ["rotary", "fixed_wing"];

export function isAirMode(mode: TransportMode | null): boolean {
  return mode !== null && AIR_MODES.includes(mode);
}

/** ประเภทรถที่เป็นอากาศยาน — แยกกลุ่มบนกระดานรถเพราะจ่ายคนละเงื่อนไขกัน */
export const AIR_VEHICLE_TYPES: readonly VehicleType[] = ["rotary", "fixed_wing"];

export const VEHICLE_STATUS_LABEL: Record<string, string> = {
  available: "ว่าง",
  dispatched: "จ่ายออกแล้ว",
  busy: "ติดภารกิจ",
  maintenance: "ซ่อมบำรุง",
  offline: "งดใช้งาน",
};

export const VEHICLE_TYPE_LABEL: Record<string, string> = {
  bls: "กู้ชีพพื้นฐาน",
  als: "กู้ชีพขั้นสูง",
  utility: "อเนกประสงค์",
  rotary: "เฮลิคอปเตอร์",
  fixed_wing: "ปีกตรึง",
};

export const AIR_DECISION_LABEL: Record<AirDecision, string> = {
  approved: "อนุมัติ",
  denied: "ไม่อนุมัติ",
};

/** ลำดับชั้นการรักษาจากเขตหน้าไปเขตหลัง — ใช้วางคอลัมน์ของผังสายส่งกลับ */
export const ROLE_LEVEL_ORDER: readonly RoleOfCare[] = [
  "role_1",
  "role_2",
  "role_3",
  "role_4",
];

/* -------------------------------------------------------------
 * ชนิดข้อมูล
 * ----------------------------------------------------------- */

export type VehicleRow = {
  id: string;
  callSign: string;
  type: VehicleType;
  status: VehicleStatus;
  unitName: string;
  crewNote: string | null;
  medicCount: number;
  driverCount: number;
  litterCount: number;
};

/** จุดที่ตั้งเป็นจุดส่งกลับ — คือแถวในตาราง unit ที่มองจากมุมการจัดสรร */
export type EvacNode = {
  id: string;
  code: string;
  nameTh: string;
  roleLevel: RoleOfCare;
  gridRef: string | null;
  /** null = ยังไม่รายงาน ซึ่งต่างจาก 0 = รายงานแล้วว่าไม่มี */
  bedAvailable: number | null;
  medicOnDuty: number | null;
  /**
   * จำนวนทอดที่กำลังวิ่งเข้าจุดนี้ตอนนี้ — คือภาระที่กำลังจะมาถึงแต่ยังไม่ถึง
   * นับด้วย to_unit_id ไม่ใช่ชื่อหน่วย ชื่อซ้ำกันเมื่อไรจะนับผิดทันที
   */
  inbound: number;
};

export type ResourceSnapshot = {
  vehicles: VehicleRow[];
  nodes: EvacNode[];
  vehiclesTotal: number;
  vehiclesFree: number;
  /** นายสิบพยาบาลที่ประจำรถซึ่งยังว่างอยู่ — คือกำลังที่ "จ่ายได้อีก" */
  medicsFree: number;
  medicsOnVehicles: number;
  /** รวมนายสิบพยาบาลที่เข้าเวรตามจุดส่งกลับ — null เมื่อไม่มีหน่วยไหนรายงานเลย */
  medicsOnDuty: number | null;
  bedsAvailable: number | null;
};

export type AirCase = {
  id: string;
  caseCode: string;
  patientAlias: string | null;
  patientName: string | null;
  precedence: PrecedenceLevel;
  triage: TriageColor | null;
  chiefComplaint: string;
  requestedAt: string;
  /** โหมดที่หน่วยหน้าขอมา — ไม่ถูกทับเมื่อศูนย์สั่งการอนุมัติเป็นอย่างอื่น */
  requestedMode: TransportMode;
  originUnit: string;
  decision: AirDecision | null;
  decisionAt: string | null;
  decisionNote: string | null;
  modeGranted: TransportMode | null;
  decidedBy: string | null;
};
