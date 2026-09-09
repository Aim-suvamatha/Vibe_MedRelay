import type { AppRole, LegStatus } from "@/lib/enums";

/**
 * ลำดับ 6 ขั้นของหนึ่งทอด — แหล่งความจริงเดียวของทั้ง UI และ Server Action
 *
 * ★ ลำดับนี้ไม่ใช่การตกแต่งหน้าจอ แต่เป็นภาพสะท้อนของ constraint leg_time_order
 *   ใน supabase/migrations/0006_transfer_leg.sql ซึ่งบังคับว่าเวลาขั้นถัดไป
 *   ตั้งได้ก็ต่อเมื่อขั้นก่อนหน้าถูกตั้งแล้ว การข้ามขั้นจะถูก database ปฏิเสธ
 *   ถ้าแก้ constraint ต้องแก้ไฟล์นี้ให้ตรงกันด้วย มิฉะนั้น UI จะยื่นปุ่มที่กดแล้วพัง
 *
 * ★ ไม่มี timestamp ตัวใดถูกส่งมาจากไฟล์นี้ — trigger set_leg_timestamps ใน 0009
 *   เป็นคนตั้งเวลาจากการเปลี่ยน status เท่านั้น (Prompt 04 ห้ามช่องกรอกเวลา)
 *   ที่นี่เก็บชื่อคอลัมน์ไว้เพื่อ "อ่าน" มาแสดงบนเส้นเวลาอย่างเดียว
 *
 * ★ "ใครกดขั้นนี้ได้" อยู่ในไฟล์นี้ด้วย ไม่ใช่กระจายอยู่ตาม RoleGate ในแต่ละหน้า
 *   สิทธิ์ของขั้นเป็นข้อมูลชุดเดียวกับลำดับของขั้น ถ้าแยกไปเขียนที่หน้าจอ
 *   วันหนึ่งสองที่จะเพี้ยนกันแล้วหาไม่เจอว่าหน้าไหนผิด
 *
 *   ⚠ roles ในไฟล์นี้เป็น UX ล้วน — บอกว่าจะ "วาดปุ่ม" ให้ใครเห็น
 *     ด่านจริงคือ policy leg_update ใน 0010/0022 ซึ่งอยู่ที่ฐานข้อมูล
 *     แก้ที่นี่อย่างเดียวไม่ได้เปิดสิทธิ์ให้ใครเพิ่ม และแก้ที่นี่ให้แคบลง
 *     ก็ไม่ได้กันใครออก ต้องแก้ทั้งสองที่เสมอ
 */

export type LegTimeColumn =
  | "requested_at"
  | "dispatched_at"
  | "on_scene_at"
  | "departed_at"
  | "arrived_at"
  | "handover_at";

export type LegStep = {
  /** สถานะของทอดเมื่อผ่านขั้นนี้แล้ว */
  readonly status: Exclude<LegStatus, "cancelled">;
  /** คอลัมน์เวลาที่คู่กับขั้นนี้ */
  readonly timeKey: LegTimeColumn;
  /** ป้ายบนเส้นเวลา — เล่าว่า "เกิดอะไรขึ้นแล้ว" */
  readonly label: string;
  /** ข้อความบนปุ่มที่พาไปขั้นนี้ — เล่าว่า "กำลังจะทำอะไร" */
  readonly action: string;
  /** ใครเป็นคนกดตามขั้นตอนจริง ใช้เป็นคำอธิบายใต้ปุ่ม ไม่ใช่การบังคับสิทธิ์ */
  readonly actor: string;
  /**
   * บทบาทที่จะได้เห็นปุ่มของขั้นนี้ — ว่างแปลว่าไม่มีปุ่ม (ระบบตั้งให้เอง)
   * admin ผ่านทุกขั้นเสมอ เพราะ RoleGate ให้ผ่านอยู่แล้ว
   */
  readonly roles: readonly AppRole[];
};

export const LEG_FLOW: readonly LegStep[] = [
  {
    status: "pending",
    timeKey: "requested_at",
    label: "รับคำขอเข้าระบบ",
    action: "รับคำขอ",
    actor: "ระบบตั้งให้เองตอนเปิดเคส",
    // ไม่มีปุ่ม — ขั้นนี้เกิดพร้อมการเปิดเคส
    roles: [],
  },
  {
    status: "dispatched",
    timeKey: "dispatched_at",
    label: "จัดรถแล้ว",
    action: "จัดรถ",
    actor: "ชุดลำเลียงหรือศูนย์สั่งการ",
    // ชุดลำเลียงจัดรถเองได้ตั้งแต่ 0022 — หน้างานเขารู้ก่อนใครว่ารถคันไหนว่าง
    roles: ["transporter", "monitor"],
  },
  {
    status: "on_scene",
    timeKey: "on_scene_at",
    label: "ถึงจุดรับแล้ว",
    action: "ถึงจุดรับแล้ว",
    actor: "ชุดลำเลียง",
    roles: ["transporter"],
  },
  {
    status: "in_transit",
    timeKey: "departed_at",
    label: "ออกเดินทางจากจุดรับแล้ว",
    action: "ออกเดินทางจากจุดรับ",
    actor: "ชุดลำเลียง",
    roles: ["transporter"],
  },
  {
    status: "arrived",
    timeKey: "arrived_at",
    label: "ถึงปลายทางส่งกลับแล้ว",
    action: "ถึงปลายทางส่งกลับแล้ว",
    actor: "ชุดลำเลียง",
    roles: ["transporter"],
  },
  {
    status: "completed",
    timeKey: "handover_at",
    label: "ส่งมอบแล้ว",
    action: "ส่งมอบผู้ป่วย",
    actor: "ชุดลำเลียงร่วมกับผู้รับปลายทาง",
    // ขั้นเดียวที่ต้องกดสองฝ่าย — ดู HANDOVER_* ท้ายไฟล์
    roles: ["transporter", "receiver"],
  },
] as const;

export const LEG_STATUS_LABEL: Record<LegStatus, string> = {
  pending: "รอจัดรถ",
  dispatched: "จัดรถแล้ว",
  on_scene: "ถึงจุดรับแล้ว",
  in_transit: "กำลังเดินทาง",
  arrived: "ถึงปลายทางส่งกลับแล้ว",
  completed: "ส่งมอบแล้ว",
  cancelled: "ยกเลิก",
};

/** ตำแหน่งของสถานะในลำดับ — 'cancelled' อยู่นอกลำดับจึงคืน -1 */
export function stepIndex(status: LegStatus): number {
  return LEG_FLOW.findIndex((s) => s.status === status);
}

/**
 * ขั้นถัดไปที่กดได้จริง — คืน null เมื่อจบทอดแล้วหรือทอดถูกยกเลิก
 * UI ต้องแสดงเฉพาะปุ่มของขั้นนี้ปุ่มเดียว ไม่ใช่ทั้ง 6 ปุ่มพร้อมกัน
 */
export function nextStep(status: LegStatus): LegStep | null {
  const i = stepIndex(status);
  if (i < 0) return null; // cancelled
  return LEG_FLOW[i + 1] ?? null;
}

/** สถานะที่ต้องเป็นอยู่ "ก่อน" จะเดินไป target ได้ — ใช้ตรวจซ้ำใน Server Action */
export function previousStatusOf(
  target: LegStatus,
): Exclude<LegStatus, "cancelled"> | null {
  const i = stepIndex(target);
  if (i <= 0) return null;
  return LEG_FLOW[i - 1].status;
}

/** ทอดที่ยังเดินต่อได้ (ยังไม่ส่งมอบและไม่ถูกยกเลิก) */
export function isLegOpen(status: LegStatus): boolean {
  return status !== "completed" && status !== "cancelled";
}


/* -------------------------------------------------------------
 * ส่งมอบสองฝ่าย (0022 · คำสั่งเจ้าของโครงการ 8 ก.ย. 2569)
 *
 * ขั้นสุดท้ายต่างจากอีกห้าขั้นตรงที่ต้องมีคนกดสองคน ไม่ใช่คนเดียว
 *   ฝ่ายแรก  ชุดลำเลียง  กด "ส่งมอบผู้ป่วย" พร้อมรายการตรวจ ทบ.466-903
 *   ฝ่ายที่สอง ผู้รับปลายทาง กด "รับผู้ป่วยเข้ารักษา" แล้วทอดจึงปิด
 *
 * ระหว่างรอฝ่ายที่สอง ทอดยังมีสถานะ 'arrived' อยู่ — ไม่มีสถานะที่เจ็ด
 * เพราะ leg_time_order กับ LEG_FLOW ผูกกันแบบหนึ่งสถานะต่อหนึ่งเวลา
 * สิ่งที่บอกว่า "ฝ่ายแรกกดแล้ว" คือคอลัมน์ handover_ready_at
 *
 * ⚠ ลำดับบังคับ ฝ่ายแรกก่อนเสมอ — constraint leg_time_order ปฏิเสธ
 *   การตั้ง handover_at โดยไม่มี handover_ready_at อยู่ที่ฐานข้อมูล
 * ----------------------------------------------------------- */

/**
 * บทบาทที่กด "ส่งมอบผู้ป่วย" (ฝ่ายแรก) ได้
 *
 * ⚠ หน้าจอไม่ได้กันด้วยค่านี้ตั้งแต่ 0023 — ปุ่มส่งมอบกันด้วย "ตัวตน" แทน
 *   คือต้องเป็นผู้ลำเลียงที่ถูกจ่ายทอดนั้นจริง (leg.isAssignedTransporter)
 *   เพราะบัญชีเดียวถือได้หลายบทบาท การเช็คบทบาทอย่างเดียวจึงปล่อยผ่าน
 *   คนที่ไม่ได้ถือทอด เก็บค่านี้ไว้เป็นเอกสารว่าขั้นนี้เป็นงานของใคร
 */
export const HANDOVER_OFFER_ROLES: readonly AppRole[] = ["transporter"];

/** บทบาทที่กด "รับผู้ป่วยเข้ารักษา" (ฝ่ายที่สอง) ได้ */
export const HANDOVER_CONFIRM_ROLES: readonly AppRole[] = ["receiver"];

/**
 * บทบาทที่บันทึกผลประเมินได้ — sender · transporter · receiver
 *
 * ไม่รวม monitor โดยเจตนา ศูนย์สั่งการไม่ได้อยู่กับตัวผู้ป่วย จึงไม่มีอะไรให้ประเมิน
 * (คำสั่งเจ้าของโครงการ 8 ก.ย. 2569 — การประเมินเกิดสามครั้งตามสายส่งกลับ
 *  เขตหน้าประเมินก่อน ชุดลำเลียงประเมินซ้ำตอนมารับ ปลายทางประเมินอีกครั้งตอนรับรักษา)
 *
 * ⚠ ต้องอยู่ในไฟล์นี้ ไม่ใช่ใน reassess-actions.ts
 *   ไฟล์นั้นมี "use server" ซึ่งบังคับให้ทุก export เป็น async function
 *   ค่าคงที่ที่ export จากที่นั่นจะไม่ใช่ array เมื่อ client import ไปใช้
 *   แล้วพังตอน render ด้วย "roles.some is not a function" — typecheck จับไม่เจอ
 */
export const ASSESSOR_ROLES: readonly AppRole[] = [
  "sender",
  "transporter",
  "receiver",
];
