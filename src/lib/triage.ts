import type { PrecedenceLevel, TriageColor } from "@/lib/enums";

/**
 * สเกลสีเดียวของทั้งระบบ
 *
 * การตัดสินใจของเจ้าของโครงการ (5 ก.ย. 2569):
 * ระบบใช้ "ภาษาสีเดียว" ทั้งแอป โดย precedence แปลงเป็นสี triage
 *   urgent -> แดง · priority -> เหลือง · routine -> เขียว · ดำ = เกินเยียวยา (มีเฉพาะฝั่ง triage)
 * เหตุผลคือผู้ใช้ในสนามจำสีชุดเดียวได้ง่ายกว่าสองชุด และ wireframe ทั้ง 5 หน้าก็ใช้สี triage ล้วน
 *
 * ผลข้างเคียงที่ต้องระวัง: เคสหนึ่งอาจเป็น triage=เหลือง แต่ precedence=urgent ได้
 * (เช่นบาดเจ็บไม่หนักแต่ระยะทางไกล) ถ้าสองอย่างใช้สีเดียวกันจะแยกไม่ออกว่ากำลังดูอะไร
 * จึงแยกด้วย **รูปทรง** แทน — TriageDot เป็นรูปทรงเรขาคณิต ส่วน PrecedenceBadge เป็นแคปซูลมีข้อความ
 *
 * ค่าสีทั้งหมดอยู่ใน src/app/globals.css และผ่านการตรวจ contrast ตาม WCAG 2.1 แล้ว
 */

/** รูปทรงประจำแต่ละสี — ชั้นการเข้ารหัสที่ไม่พึ่งสี สำหรับผู้ใช้ตาบอดสีและการพิมพ์ขาวดำ */
export type TriageShape = "square" | "circle" | "diamond" | "triangle";

export type TriageMeta = {
  /** ชื่อที่แสดงให้ผู้ใช้เห็น */
  readonly label: string;
  /** คำขยายสั้นๆ ตาม wireframe 01 */
  readonly hint: string;
  readonly shape: TriageShape;
  /** พื้นทึบ — ใช้กับ badge และปุ่มที่เลือกอยู่ */
  readonly solid: string;
  /** พื้นอ่อน — ใช้กับแถวในตารางและการ์ดที่ต้องไม่แย่งสายตา */
  readonly soft: string;
  /** สีเติมของรูปทรงใน TriageDot */
  readonly fill: string;
  /** สีขอบของรูปทรง — เหลืองต้องมีขอบเข้มเพราะพื้นเหลืองกับพื้นขาวต่างกันแค่ 2.2:1 */
  readonly stroke: string;
};

/**
 * class เขียนเป็นสตริงเต็มโดยเจตนา ห้ามประกอบด้วย template string
 * เพราะ Tailwind อ่าน class จากตัวอักษรที่ปรากฏในซอร์สเท่านั้น
 */
export const TRIAGE: Record<TriageColor, TriageMeta> = {
  black: {
    label: "ดำ",
    hint: "เกินเยียวยา",
    shape: "square",
    solid: "bg-triage-black text-triage-black-fg border-triage-black",
    soft: "bg-neutral-100 text-neutral-900 border-neutral-400",
    fill: "var(--triage-black)",
    stroke: "var(--triage-black)",
  },
  red: {
    label: "แดง",
    hint: "วิกฤต",
    shape: "circle",
    solid: "bg-triage-red text-triage-red-fg border-triage-red",
    soft: "bg-red-50 text-triage-red border-triage-red",
    fill: "var(--triage-red)",
    stroke: "var(--triage-red)",
  },
  yellow: {
    label: "เหลือง",
    hint: "เร่งด่วน",
    shape: "diamond",
    solid:
      "bg-triage-yellow text-triage-yellow-fg border-triage-yellow-edge",
    soft: "bg-amber-50 text-triage-yellow-edge border-triage-yellow-edge",
    fill: "var(--triage-yellow)",
    stroke: "var(--triage-yellow-edge)",
  },
  green: {
    label: "เขียว",
    hint: "ไม่เร่งด่วน",
    shape: "triangle",
    solid: "bg-triage-green text-triage-green-fg border-triage-green",
    soft: "bg-emerald-50 text-triage-green border-triage-green",
    fill: "var(--triage-green)",
    stroke: "var(--triage-green)",
  },
};

/** เรียงจากรุนแรงที่สุดไปเบาที่สุด — ใช้กับตัวเลือกในฟอร์มให้ลำดับเหมือนกันทุกหน้า */
export const TRIAGE_ORDER: readonly TriageColor[] = [
  "black",
  "red",
  "yellow",
  "green",
];

export type PrecedenceMeta = {
  readonly label: string;
  /** คำอังกฤษตามหลักนิยม MEDEVAC — ใส่ไว้ใน title ให้คนที่คุ้นศัพท์อังกฤษ */
  readonly term: string;
  /** สี triage ที่ใช้แทนระดับนี้ */
  readonly triage: TriageColor;
};

export const PRECEDENCE: Record<PrecedenceLevel, PrecedenceMeta> = {
  urgent: { label: "ด่วนที่สุด", term: "Urgent", triage: "red" },
  priority: { label: "ด่วน", term: "Priority", triage: "yellow" },
  routine: { label: "ปกติ", term: "Routine", triage: "green" },
};

export const PRECEDENCE_ORDER: readonly PrecedenceLevel[] = [
  "urgent",
  "priority",
  "routine",
];

/** แปลง precedence เป็นสี triage ตามการตัดสินใจด้านบน */
export function precedenceTriage(p: PrecedenceLevel): TriageColor {
  return PRECEDENCE[p].triage;
}
