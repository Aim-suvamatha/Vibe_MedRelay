import { TourniquetClock } from "@/components/medrelay/tourniquet-clock";
import { releaseTourniquet } from "@/components/medrelay/tourniquet-actions";
import { formatClockTh } from "@/lib/duration";
import type { TourniquetItem } from "@/lib/tourniquet";
import { cn } from "@/lib/utils";

/**
 * แถบสายรัดห้ามเลือดที่เดินทางไปกับผู้ป่วยทุกทอด
 *
 * ★ ทำไมต้องโผล่ทุกหน้า ไม่ใช่แค่หน้าของผู้ส่ง
 *   สายรัดที่รัดนานเกิน 2 ชั่วโมงเสี่ยงต่อการสูญเสียอวัยวะ
 *   คนที่ต้องเห็นนาฬิกานี้คือคนที่กำลังอยู่กับผู้ป่วย ณ ตอนนั้น
 *   ซึ่งเปลี่ยนคนไปเรื่อยตามทอด ต้นทาง → ผู้ลำเลียง → ปลายทาง
 *   ข้อมูลจึงต้องติดตัวผู้ป่วยไป ไม่ใช่ค้างอยู่ที่หน้าของคนที่รัด
 *
 * ★ ทุกคนที่เห็นเคสกดคลายได้ ไม่ใช่แค่คนที่รัด
 *   บังคับโดย policy treatment_release ไม่ใช่โดยโค้ดนี้ (ดู tourniquet-actions.ts)
 *   ข้อยกเว้นเดียวคือ canRelease ด้านล่าง ซึ่งเป็นกติกาหน้างาน ไม่ใช่สิทธิ์
 *
 * ★ ห้ามพึ่งสีอย่างเดียว
 *   ปุ่มแดง/เขียวมีข้อความ "ยังไม่คลาย" / "คลายแล้ว" กำกับเสมอ
 *   เกณฑ์เดียวกับ TriageDot ที่ใช้รูปทรงกำกับสี — ผู้ใช้ตาบอดสีต้องแยกออก
 */

export function TourniquetStrip({
  items,
  returnTo,
  className,
  compact = false,
  canRelease = true,
}: {
  items: readonly TourniquetItem[];
  /** เส้นทางที่จะ revalidate หลังกดคลาย — ส่งมาจากหน้าที่ใช้ */
  returnTo: string;
  className?: string;
  /** ย่อสำหรับการ์ดในรายการ — ไม่มีปุ่มคลาย มีแต่สถานะ */
  compact?: boolean;
  /**
   * ผู้ป่วยอยู่ในมือคนที่กำลังดูอยู่หรือยัง (ดู src/lib/custody.ts)
   *
   * default เป็น true โดยเจตนา เพื่อไม่ให้ผู้เรียกเดิมทั้งหมดเปลี่ยนพฤติกรรม
   * เมื่อ false จะแสดงป้ายสถานะแทนปุ่ม ซึ่งเป็นเส้นทางเดียวกับ compact
   * — ไม่ใช่ปุ่ม disabled เพราะปุ่มที่กดไม่ได้ชวนให้เข้าใจว่าระบบพัง
   */
  canRelease?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section
      className={cn("space-y-2 border-t border-border pt-3", className)}
      aria-label="สายรัดห้ามเลือด"
    >
      <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        สายรัดห้ามเลือด · {items.length} เส้น
      </p>

      {items.map((t, i) => {
        const open = t.releasedAt === null;

        return (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2",
              open ? "border-border bg-muted" : "border-triage-green bg-emerald-50",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                เส้นที่ {i + 1}
                {t.site ? ` · ${t.site}` : ""}
              </p>
              <p className="tabular font-mono text-xs text-muted-foreground">
                รัดเวลา {formatClockTh(t.givenAt)} น. ·{" "}
                {open ? (
                  <TourniquetClock givenAt={t.givenAt} />
                ) : (
                  <>
                    คลาย {formatClockTh(t.releasedAt!)} น. · รวม{" "}
                    <TourniquetClock givenAt={t.givenAt} releasedAt={t.releasedAt} />
                  </>
                )}
              </p>
            </div>

            {compact || !open || !canRelease ? (
              <span
                className={cn(
                  "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold",
                  open
                    ? "border-triage-red bg-triage-red text-triage-red-fg"
                    : "border-triage-green bg-triage-green text-triage-green-fg",
                )}
              >
                {open ? "ยังไม่คลาย" : "คลายแล้ว"}
              </span>
            ) : (
              <form action={releaseTourniquet} className="shrink-0">
                <input type="hidden" name="treatmentId" value={t.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  className={cn(
                    "h-12 min-w-[7.5rem] rounded-lg border-2 px-3 text-sm font-semibold",
                    "border-triage-red bg-triage-red text-triage-red-fg",
                    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  )}
                >
                  ยังไม่คลาย
                  <span className="block text-[11px] font-normal opacity-90">
                    กดเมื่อคลาย
                  </span>
                </button>
              </form>
            )}
          </div>
        );
      })}
    </section>
  );
}
