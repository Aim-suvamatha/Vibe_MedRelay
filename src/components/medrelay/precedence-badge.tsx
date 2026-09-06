import { cn } from "@/lib/utils";
import type { PrecedenceLevel } from "@/lib/enums";
import { PRECEDENCE, TRIAGE } from "@/lib/triage";

/**
 * PrecedenceBadge — ระดับความเร่งด่วนในการส่งกลับตามหลักนิยม MEDEVAC
 *
 * ใช้ "สีชุดเดียวกับ triage" ตามที่เจ้าของโครงการกำหนด
 *   urgent -> แดง · priority -> เหลือง · routine -> เขียว
 *
 * แยกจาก TriageDot ด้วยรูปทรง ไม่ใช่ด้วยสี
 *   PrecedenceBadge = แคปซูลมีข้อความเต็ม   ("ด่วนที่สุด")
 *   TriageDot       = รูปทรงเรขาคณิต + ชื่อสี ("▲ เขียว")
 * ทำให้ภาษาสีเป็นชุดเดียวทั้งระบบ แต่ยังบอกได้ว่ากำลังดูค่าไหนอยู่
 *
 * หมายเหตุ: triage มีสีดำ (เกินเยียวยา) แต่ precedence ไม่มีค่าที่ตรงกัน
 * เพราะ precedence คือ "รีบแค่ไหน" ส่วนดำแปลว่าไม่ต้องรีบส่งแล้ว
 */

export function PrecedenceBadge({
  value,
  variant = "solid",
  className,
}: {
  value: PrecedenceLevel;
  /** solid ใช้เมื่อต้องสะดุดตา · soft ใช้ในตารางยาวๆ ที่พื้นทึบจะรกเกินไป */
  variant?: "solid" | "soft";
  className?: string;
}) {
  const meta = PRECEDENCE[value];
  const tone = TRIAGE[meta.triage];
  const name = `ความเร่งด่วน ${meta.label} (${meta.term})`;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold leading-none whitespace-nowrap",
        variant === "solid" ? tone.solid : tone.soft,
        className,
      )}
      title={name}
      aria-label={name}
    >
      {meta.label}
    </span>
  );
}
