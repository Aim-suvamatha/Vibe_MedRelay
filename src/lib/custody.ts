/**
 * "ตอนนี้ผู้ป่วยอยู่ในมือใคร" — ตัวตัดสินว่าใครบันทึกการดูแลได้
 *
 * ★ ปัญหาที่ไฟล์นี้แก้ (เจ้าของโครงการเจอ 9 ก.ย. 2569)
 *   ปลายทางเปิดหน้า /track ของเคสที่รถยังไม่ออกจากต้นทางด้วยซ้ำ
 *   แล้วลงสัญญาณชีพ · ยืนยันสี · บันทึกการรักษา · กดคลายสายรัดได้หมด
 *   ทั้งที่ยังไม่เคยเห็นตัวผู้ป่วย เวชระเบียนจึงบันทึกสิ่งที่ไม่ได้เกิดขึ้น
 *   และเวลาที่ได้ไหลลงแดชบอร์ดตรงๆ ซึ่งขัดกับเหตุผลทั้งข้อของ Prompt 04
 *
 * ★ เส้นแบ่งคือ handover_at ของทอดที่ยังเดินอยู่ ไม่ใช่สถานะหรือบทบาท
 *   ทอดจะปิดก็ต่อเมื่อผู้รับกด "รับผู้ป่วยเข้ารักษา" (ฝ่ายที่สองของ 0022)
 *   ก่อนหน้านั้นผู้ป่วยยังอยู่กับชุดลำเลียงเสมอ ต่อให้รถจอดหน้าตึกแล้วก็ตาม
 *
 * ★ กันด้วย "ตัวตน" ไม่ใช่ "บทบาท" — บทเรียนเดียวกับบั๊กข้อ 2 เมื่อ 8 ก.ย.
 *   บัญชี 9900000001 ถือทั้ง sender · transporter · receiver
 *   ถ้าล็อกด้วย hasAnyRole(['receiver']) เขาจะโดนล็อกตอนเป็นเขตหน้าของตัวเองด้วย
 *   ซึ่งผิด — คนที่ต้องโดนล็อกคือ "คนของหน่วยปลายทางที่ยังไม่ได้รับตัว" เท่านั้น
 *
 * ★ ไฟล์นี้ต้องเป็น plain module ห้ามมี "use server"
 *   ทั้ง server component (page.tsx) และ server action (reassess-actions.ts)
 *   import ไปใช้ ถ้าอยู่ในไฟล์ "use server" ทุก export จะถูกบังคับเป็น async function
 *   แล้วพังตอน render โดยที่ typecheck ผ่านสบาย (กับดักข้อ 4 · HANDOFF)
 *
 * ⚠ นี่คือ "กติกาการทำงาน" ไม่ใช่ "ชั้นความปลอดภัย"
 *   ด่านความปลอดภัยจริงยังเป็น RLS ใน 0010/0013/0014/0022/0023 เหมือนเดิม
 *   ฟังก์ชันนี้กันการบันทึกที่ผิดลำดับหน้างาน ไม่ได้กันคนที่ไม่มีสิทธิ์เห็นเคส
 */

import type { LegStatus } from "@/lib/enums";
/**
 * นำเข้าแบบ relative พร้อมนามสกุล .ts โดยเจตนา ไม่ใช่ "@/lib/leg-flow"
 *
 * ชุดทดสอบรันด้วย `node --test` ตรงๆ ตามที่โครงการเลือกไว้ (ไม่มี test runner
 * และไม่มี dependency เพิ่ม) ซึ่งแปลว่า Node เป็นคนแปลง path เอง และ Node
 * ไม่รู้จัก alias "@/" ของ tsconfig — value import ที่ใช้ alias จะพังทันที
 * ส่วน `import type` ไม่พัง เพราะถูกลบทิ้งตอน strip types จึงยังใช้ alias ได้
 *
 * ★ ยังต้องดึง isLegOpen มาใช้ ห้ามเขียนเงื่อนไข "ทอดยังเดินอยู่" ซ้ำที่นี่
 *   ถ้ามีสถานะที่เจ็ดในอนาคต สองที่จะเพี้ยนกันแล้วหาไม่เจอว่าที่ไหนผิด
 */
import { isLegOpen } from "./leg-flow.ts";

/** ทอดเท่าที่ custodyOf ต้องรู้ — รับ shape กว้างๆ เพื่อให้ query ไหนก็ส่งมาได้ */
export type CustodyLeg = {
  status: string;
  to_unit_id: string;
  transporter_id: string | null;
  handover_at: string | null;
};

export type CustodyState = {
  /** บันทึกผลประเมิน · สัญญาณชีพ · การรักษา · คลายสายรัด ได้หรือไม่ */
  canRecordCare: boolean;
  /**
   * เหตุผลที่ยังบันทึกไม่ได้ — null เมื่อบันทึกได้
   * ใช้ข้อความเดียวกันทั้งบนหน้าจอและใน error ของ server action
   * เพื่อไม่ให้ผู้ใช้เจอคำอธิบายคนละชุดจากที่เดียวกัน
   */
  blockedReason: string | null;
};

const ALLOWED: CustodyState = { canRecordCare: true, blockedReason: null };

/**
 * ตัดสินจากทอดที่ยังเดินอยู่เทียบกับตัวตนของผู้ใช้
 *
 * ล็อกเมื่อครบสามข้อพร้อมกันเท่านั้น
 *   1. ผู้ใช้สังกัดหน่วยปลายทางของทอดที่ยังเดินอยู่
 *   2. ทอดนั้นยังไม่มี handover_at (ยังไม่มีใครกดรับผู้ป่วย)
 *   3. ผู้ใช้ไม่ใช่ผู้ลำเลียงที่ถือทอดนั้น
 *
 * ข้อ 3 จำเป็นเพราะหน่วยเล็กบางแห่งคนเดียวทำทั้งขับรถและรับผู้ป่วย
 * ชุดลำเลียงที่ถือทอดอยู่กับตัวผู้ป่วยจริงระหว่างทาง ต้องบันทึกได้เสมอ
 */
export function custodyOf(
  profile: { id: string; unitId: string } | null,
  legs: readonly CustodyLeg[],
): CustodyState {
  if (!profile) return ALLOWED;

  const openLeg = legs.find((l) => isLegOpen(l.status as LegStatus));
  if (!openLeg) return ALLOWED; // ทุกทอดปิดแล้ว — ผู้ป่วยถึงมือปลายทางเรียบร้อย

  if (profile.unitId !== openLeg.to_unit_id) return ALLOWED;
  if (openLeg.handover_at !== null) return ALLOWED;
  if (openLeg.transporter_id === profile.id) return ALLOWED;

  return {
    canRecordCare: false,
    blockedReason:
      "ผู้ป่วยยังไม่อยู่ในความดูแลของหน่วยนี้ — กด “รับผู้ป่วยเข้ารักษา” ก่อน จึงจะบันทึกได้",
  };
}
