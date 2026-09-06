import type { LegStatus } from "@/lib/enums";

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
};

export const LEG_FLOW: readonly LegStep[] = [
  {
    status: "pending",
    timeKey: "requested_at",
    label: "รับคำขอเข้าระบบ",
    action: "รับคำขอ",
    actor: "ระบบตั้งให้เองตอนเปิดเคส",
  },
  {
    status: "dispatched",
    timeKey: "dispatched_at",
    label: "จัดรถแล้ว",
    action: "จัดรถ",
    actor: "ศูนย์สั่งการ",
  },
  {
    status: "on_scene",
    timeKey: "on_scene_at",
    label: "ถึงจุดรับแล้ว",
    action: "ถึงจุดรับแล้ว",
    actor: "ชุดลำเลียง",
  },
  {
    status: "in_transit",
    timeKey: "departed_at",
    label: "ออกเดินทางแล้ว",
    action: "ออกเดินทาง",
    actor: "ชุดลำเลียง",
  },
  {
    status: "arrived",
    timeKey: "arrived_at",
    label: "ถึงปลายทางแล้ว",
    action: "ถึงปลายทางแล้ว",
    actor: "ชุดลำเลียง",
  },
  {
    status: "completed",
    timeKey: "handover_at",
    label: "ส่งมอบแล้ว",
    action: "ส่งมอบผู้ป่วย",
    actor: "ชุดลำเลียงร่วมกับผู้รับปลายทาง",
  },
] as const;

export const LEG_STATUS_LABEL: Record<LegStatus, string> = {
  pending: "รอจัดรถ",
  dispatched: "จัดรถแล้ว",
  on_scene: "ถึงจุดรับแล้ว",
  in_transit: "กำลังเดินทาง",
  arrived: "ถึงปลายทางแล้ว",
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
