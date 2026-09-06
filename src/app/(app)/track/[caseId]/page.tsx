import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { PrecedenceBadge } from "@/components/medrelay/precedence-badge";
import { RelativeTime } from "@/components/medrelay/relative-time";
import { TriageChip } from "@/components/medrelay/triage-dot";
import { createClient } from "@/lib/supabase/server";
import type { LegStatus, PrecedenceLevel, TriageColor } from "@/lib/enums";

/**
 * หน้า /track/[caseId] — ฉบับย่อสำหรับปลายทางของ Prompt 07
 *
 * ⚠ นี่ยังไม่ใช่ F3 ฉบับเต็ม
 *   Prompt 08 จะเพิ่ม timeline 6 timestamp ต่อทอด · ปุ่มเปลี่ยนสถานะของ transporter
 *   · รายการ assessment ทุกทอด · ปุ่ม "ส่งทอดถัดไป"
 *
 * ที่ต้องมีตอนนี้เพราะสเปค Prompt 07 กำหนดว่า "หลังส่งสำเร็จ redirect ไปหน้าติดตามสถานะ"
 * ถ้าไม่มีไฟล์นี้ ผู้ใช้กดส่งคำขอสำเร็จแล้วจะเจอ 404 ซึ่งอ่านได้ว่าคำขอหาย
 * ทั้งที่ข้อมูลเข้าฐานข้อมูลเรียบร้อยแล้ว — เป็นความเข้าใจผิดที่อันตรายที่สุดของหน้านี้
 *
 * ไม่ต้องเช็คสิทธิ์เองที่นี่ RLS ทำให้แล้ว
 * เคสที่ผู้ใช้ไม่มีสิทธิ์เห็นจะคืน 0 แถว ซึ่งกลายเป็น notFound() พอดี
 * — ไม่บอกด้วยว่า "มีเคสนี้อยู่แต่คุณดูไม่ได้" ซึ่งเองก็เป็นการรั่วข้อมูล
 */

const LEG_STATUS_LABEL: Record<LegStatus, string> = {
  pending: "รอจัดรถ",
  dispatched: "จัดรถแล้ว",
  on_scene: "ถึงจุดรับแล้ว",
  in_transit: "กำลังเดินทาง",
  arrived: "ถึงปลายทางแล้ว",
  completed: "ส่งมอบแล้ว",
  cancelled: "ยกเลิก",
};

export default async function Page({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("case")
    .select(
      `id, case_code, precedence, triage, chief_complaint, patient_alias,
       patient_count, requested_at, status, pickup_marking,
       origin:origin_unit_id (name_th),
       transfer_leg (id, leg_no, status, to_unit_id, unit:to_unit_id (name_th))`,
    )
    .eq("id", caseId)
    .maybeSingle();

  if (!row) notFound();

  const origin = Array.isArray(row.origin) ? row.origin[0] : row.origin;
  const legs = [...(row.transfer_leg ?? [])].sort((a, b) => a.leg_no - b.leg_no);

  return (
    <>
      <AppHeader
        title="ติดตามสถานะ"
        subtitle={
          <span className="font-mono">
            {row.case_code} · ต้นทาง {origin?.name_th ?? "—"}
          </span>
        }
      />
      <AppShell>
        <div className="space-y-4">
          {/* ยืนยันว่าคำขอเข้าระบบแล้วจริง — เป็นสิ่งแรกที่ผู้ใช้ต้องการรู้หลังกดส่ง */}
          <div className="rounded-xl border border-triage-green bg-emerald-50 px-4 py-3">
            <p className="font-semibold text-triage-green">ส่งคำขอเข้าระบบแล้ว</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <RelativeTime value={row.requested_at} prefix="ร้องขอเมื่อ" />
            </p>
          </div>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <PrecedenceBadge value={row.precedence as PrecedenceLevel} />
              {row.triage && <TriageChip value={row.triage as TriageColor} />}
            </div>

            <div>
              <p className="text-sm font-semibold text-muted-foreground">
                อาการสำคัญ
              </p>
              <p className="mt-1 text-base">{row.chief_complaint}</p>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="font-semibold text-muted-foreground">ผู้ป่วย</dt>
                <dd className="mt-0.5">
                  {row.patient_alias ?? "ไม่ระบุนามสมมติ"} · {row.patient_count} ราย
                </dd>
              </div>
              {row.pickup_marking && (
                <div>
                  <dt className="font-semibold text-muted-foreground">จุดรับ</dt>
                  <dd className="mt-0.5">{row.pickup_marking}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-lg font-semibold">ทอดการส่งกลับ</h2>
            <ol className="space-y-2">
              {legs.map((leg) => {
                const unit = Array.isArray(leg.unit) ? leg.unit[0] : leg.unit;
                return (
                  <li
                    key={leg.id}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
                  >
                    <span className="font-mono text-sm text-muted-foreground">
                      ทอด {leg.leg_no}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      ไป {unit?.name_th ?? "—"}
                    </span>
                    <span className="shrink-0 text-sm font-semibold">
                      {LEG_STATUS_LABEL[leg.status as LegStatus]}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">
              เส้นเวลาแต่ละขั้นและปุ่มเปลี่ยนสถานะจะเพิ่มใน F3 · Prompt 08
            </p>
          </section>

          <Link
            href="/sender"
            className="flex h-14 w-full items-center justify-center rounded-lg border border-border bg-background text-base font-semibold"
          >
            เปิดคำขอใหม่
          </Link>
        </div>
      </AppShell>
    </>
  );
}
