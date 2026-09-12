import { cn } from "@/lib/utils";

/**
 * การ์ดตัวเลขหนึ่งใบ — ใช้ร่วมกันระหว่าง /dashboard และ /monitor
 *
 * เดิมประกาศอยู่ใน dashboard/page.tsx ยกขึ้นมาเมื่อหน้าศูนย์สั่งการต้องใช้แบบเดียวกัน
 * ถ้าปล่อยให้แต่ละหน้าเขียนเอง วันหนึ่งกฎเรื่อง "ไม่มีตัวเลขห้ามแสดง 0" จะเพี้ยนไปหน้าหนึ่ง
 * แล้วไม่มีใครรู้ว่าหน้าไหนผิด
 *
 * ★ prop `empty` ไม่ใช่แค่การตกแต่ง — มันคือหัวใจของการ์ดใบนี้
 *   "0 นาที" อ่านได้ว่าจัดรถได้ทันทีทุกครั้ง ซึ่งเป็นคำโกหกที่ดูน่าเชื่อมาก
 *   ส่วน "เตียงว่าง 0" อ่านได้ว่าโรงพยาบาลเต็ม ซึ่งคนละเรื่องกับ "ยังไม่มีใครรายงาน"
 *   การ์ดที่ไม่มีข้อมูลจึงต้องแสดงขีดกลางพร้อมคำอธิบายเสมอ ไม่ใช่เลข 0
 *
 * ★ hint เป็น prop บังคับโดยเจตนา
 *   ตัวเลขลอยๆ ที่ไม่บอกว่ามาจากไหน คือตัวเลขที่คนอ่านเอาไปตีความเองได้ทุกทาง
 */
export function StatCard({
  label,
  value,
  hint,
  empty,
}: {
  label: string;
  value: string;
  /** คำอธิบายว่าเลขนี้มาจากไหน หรือทำไมยังไม่มีเลข */
  hint: string;
  empty?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4",
        empty ? "border-dashed border-border" : "border-border",
      )}
    >
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-3xl font-bold tabular-nums",
          empty && "text-muted-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground text-balance">{hint}</p>
    </div>
  );
}

/**
 * จัดรูปแบบตัวเลขทรัพยากรที่ "ไม่มีข้อมูล" ต่างจาก "มีข้อมูลว่าเป็นศูนย์"
 * คืนคู่ค่าที่ยัดเข้า StatCard ได้ตรงๆ
 */
export function reportedValue(
  n: number | null,
  unit: string,
): { value: string; empty: boolean } {
  return n === null
    ? { value: "—", empty: true }
    : { value: `${n} ${unit}`, empty: false };
}
