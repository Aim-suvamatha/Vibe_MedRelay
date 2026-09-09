import type { AvpuLevel } from "@/lib/enums";

/**
 * สัญญาณชีพเป็นบรรทัดเดียว — ใช้ร่วมกันระหว่างหน้าจอกับข้อความยืนยันของ action
 *
 * ★ ทำไมต้องอยู่ไฟล์กลาง ไม่ฝังใน page.tsx เหมือนเดิม
 *   ตั้งแต่ 9 ก.ย. 2569 ข้อความยืนยันหลังกดบันทึกต้องบอกค่าที่เพิ่งลงไปด้วย
 *   (เจ้าของโครงการเจอว่าต้องเลื่อนหน้าจอขึ้นไปดูว่าเข้าจริงไหม)
 *   ถ้าปล่อยให้ server action ประกอบข้อความเอง วันหนึ่งรูปแบบสองที่จะเพี้ยนกัน
 *   แล้วค่าเดียวกันจะอ่านได้คนละแบบบนหน้าจอเดียว
 *
 * ★ ข้ามค่าที่วัดไม่ได้เสมอ หน้างานมักวัดไม่ครบ
 *   ช่องว่างที่เขียนว่า "—" ไม่ได้บอกอะไรเพิ่ม มีแต่ทำให้บรรทัดยาวจนอ่านยาก
 */

export const AVPU_LABEL: Record<AvpuLevel, string> = {
  alert: "ตื่นดี",
  voice: "เรียกตื่น",
  pain: "เจ็บตื่น",
  unresponsive: "ไม่ตื่น",
};

export type VitalsRow = {
  gcs?: number | null;
  sbp?: number | null;
  dbp?: number | null;
  pulse?: number | null;
  resp_rate?: number | null;
  spo2?: number | null;
  temperature?: number | null;
};

/** คืนค่าว่างเมื่อไม่มีอะไรวัดได้เลย ผู้เรียกตัดสินเองว่าจะซ่อนบรรทัดไหม */
export function vitalsLine(a: VitalsRow): string {
  const parts: string[] = [];
  if (a.sbp != null && a.dbp != null) parts.push(`BP ${a.sbp}/${a.dbp}`);
  else if (a.sbp != null) parts.push(`SBP ${a.sbp}`);
  if (a.pulse != null) parts.push(`P ${a.pulse}`);
  if (a.resp_rate != null) parts.push(`RR ${a.resp_rate}`);
  if (a.spo2 != null) parts.push(`SpO₂ ${a.spo2}%`);
  if (a.temperature != null) parts.push(`T ${a.temperature}°C`);
  if (a.gcs != null) parts.push(`GCS ${a.gcs}`);
  return parts.join(" · ");
}
