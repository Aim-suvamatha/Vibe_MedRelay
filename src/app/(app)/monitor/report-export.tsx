import { MAX_RANGE_DAYS, REPORT_ERROR_TEXT, type ReportError } from "@/lib/casualty-report-format";
import { cn } from "@/lib/utils";

/**
 * ฟอร์มดาวน์โหลดรายงานสรุปกำลังพลบาดเจ็บ (F7)
 *
 * ★ เป็น server component และฟอร์ม GET ธรรมดา ไม่มี JavaScript ฝั่ง client
 *   การดาวน์โหลดไฟล์ไม่ต้องการ state ใดๆ ยิ่งน้อยชิ้นยิ่งพังยาก
 *   ปุ่มสองปุ่มส่ง name="format" คนละค่า ฟอร์มเดียวจึงได้ทั้ง Excel และ CSV
 *
 * ★ ข้อความเตือนเรื่องชื่อผู้ป่วยต้องอยู่ติดปุ่ม ไม่ใช่ซ่อนในหน้าคู่มือ
 *   คนกดดาวน์โหลดคือคนที่ต้องรู้ว่าไฟล์นี้ออกไปอยู่นอกการคุมสิทธิ์ของระบบแล้ว
 */

const INPUT =
  "mt-1 h-14 w-full rounded-lg border border-border bg-background px-3 text-base focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
const BUTTON =
  "h-14 flex-1 rounded-lg border text-base font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

export function ReportExportSection({
  from,
  to,
  error,
}: {
  from: string;
  to: string;
  error: ReportError | null;
}) {
  return (
    <section id="report" aria-labelledby="report-heading" className="scroll-mt-6">
      <h2 id="report-heading" className="mb-3 text-lg font-semibold">
        รายงานสรุปกำลังพลบาดเจ็บ
      </h2>

      <form
        action="/monitor/report"
        method="get"
        className="space-y-3 rounded-xl border border-border bg-card p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="report-from" className="text-sm font-semibold">
              ตั้งแต่
            </label>
            <input
              id="report-from"
              type="datetime-local"
              name="from"
              defaultValue={from}
              required
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="report-to" className="text-sm font-semibold">
              ถึง
            </label>
            <input
              id="report-to"
              type="datetime-local"
              name="to"
              defaultValue={to}
              required
              className={INPUT}
            />
          </div>
        </div>

        <p className="text-sm text-muted-foreground text-balance">
          เวลาไทย · นับเคสที่เปิดคำขอตั้งแต่เวลาเริ่ม จนถึงก่อนเวลาสิ้นสุด · ยาวสุด {MAX_RANGE_DAYS} วัน
          · ช่อง สย. เว้นว่างไว้ให้ส่วนแยกกรอกเอง
        </p>

        {error && (
          <p role="alert" className="rounded-lg border border-triage-red p-3 text-sm text-triage-red">
            {REPORT_ERROR_TEXT[error]}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            name="format"
            value="xlsx"
            className={cn(BUTTON, "border-triage-green bg-emerald-50 text-triage-green")}
          >
            ดาวน์โหลด Excel
          </button>
          <button type="submit" name="format" value="csv" className={cn(BUTTON, "border-border bg-background")}>
            ดาวน์โหลด CSV
          </button>
        </div>

        <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground text-balance">
          <span className="font-semibold text-foreground">ไฟล์มียศ ชื่อ และสกุลของผู้ป่วย</span> ·
          ทุกครั้งที่ดาวน์โหลด ระบบบันทึกว่าใครดาวน์โหลดเคสใดเมื่อไร · เมื่อไฟล์ออกจากระบบแล้ว
          ไม่มีการคุมสิทธิ์อีกต่อไป เก็บและส่งต่อตามระเบียบของหน่วย
        </p>
      </form>
    </section>
  );
}
