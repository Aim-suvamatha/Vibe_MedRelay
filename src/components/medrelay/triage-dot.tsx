import { cn } from "@/lib/utils";
import type { TriageColor } from "@/lib/enums";
import { TRIAGE, type TriageShape } from "@/lib/triage";

/**
 * TriageDot — แสดงระดับ triage ดำ/แดง/เหลือง/เขียว
 *
 * เข้ารหัสความหมายซ้ำกัน 3 ชั้น ห้ามเหลือชั้นเดียว
 *   1. สี        — อ่านเร็วที่สุดสำหรับคนที่แยกสีได้
 *   2. รูปทรง    — สี่เหลี่ยม/วงกลม/ข้าวหลามตัด/สามเหลี่ยม สำหรับผู้ใช้ตาบอดสี
 *   3. ตัวอักษร  — ชื่อสีภาษาไทยกำกับ
 * และค่าความสว่างของสีทั้งสี่ห่างกันอย่างน้อย 1.6:1 จึงยังแยกออกในภาพขาวดำ
 *
 * เมื่อ showLabel = false ตัวรูปทรงยังมี aria-label และ title กำกับเสมอ
 * ไม่มีกรณีไหนที่ผู้ใช้จะได้ข้อมูลจากสีอย่างเดียว
 */

const SIZES = {
  sm: { px: 14, text: "text-xs" },
  md: { px: 18, text: "text-sm" },
  lg: { px: 24, text: "text-base" },
} as const;

function Shape({
  shape,
  fill,
  stroke,
  px,
}: {
  shape: TriageShape;
  fill: string;
  stroke: string;
  px: number;
}) {
  const common = { fill, stroke, strokeWidth: 8, vectorEffect: "none" } as const;
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {shape === "square" && <rect x="10" y="10" width="80" height="80" rx="14" {...common} />}
      {shape === "circle" && <circle cx="50" cy="50" r="41" {...common} />}
      {shape === "diamond" && <polygon points="50,7 93,50 50,93 7,50" {...common} />}
      {shape === "triangle" && <polygon points="50,9 94,88 6,88" {...common} />}
    </svg>
  );
}

export function TriageDot({
  value,
  size = "md",
  showLabel = true,
  className,
}: {
  value: TriageColor;
  size?: keyof typeof SIZES;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = TRIAGE[value];
  const { px, text } = SIZES[size];
  const name = `triage ${meta.label} — ${meta.hint}`;

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 align-middle", className)}
      role="img"
      aria-label={name}
      title={name}
    >
      <Shape shape={meta.shape} fill={meta.fill} stroke={meta.stroke} px={px} />
      {showLabel && (
        <span className={cn("font-semibold leading-none", text)}>
          {meta.label}
        </span>
      )}
    </span>
  );
}

/**
 * TriageChip — รูปแบบพื้นทึบสำหรับตารางศูนย์สั่งการ ที่ต้องกวาดตาหาเคสแดงให้เจอเร็ว
 * ใช้รูปทรงเดียวกับ TriageDot เพื่อไม่ให้ผู้ใช้ต้องจำสองระบบ
 */
export function TriageChip({
  value,
  className,
}: {
  value: TriageColor;
  className?: string;
}) {
  const meta = TRIAGE[value];
  const name = `triage ${meta.label} — ${meta.hint}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold leading-none",
        meta.solid,
        className,
      )}
      role="img"
      aria-label={name}
      title={name}
    >
      <Shape shape={meta.shape} fill="currentColor" stroke="currentColor" px={10} />
      {meta.label}
    </span>
  );
}
