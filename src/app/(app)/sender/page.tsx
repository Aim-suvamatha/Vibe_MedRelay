import Link from "next/link";

import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { PrecedenceBadge } from "@/components/medrelay/precedence-badge";
import { RelativeTime } from "@/components/medrelay/relative-time";
import { RoleGate } from "@/components/medrelay/role-gate";
import { TourniquetStrip } from "@/components/medrelay/tourniquet-strip";
import { getProfile } from "@/lib/auth/profile";
import { formatClockTh } from "@/lib/duration";
import { createClient } from "@/lib/supabase/server";
import { getTourniquetsByCase } from "@/lib/tourniquet";
import type { PrecedenceLevel } from "@/lib/enums";

/**
 * หน้า /sender — รายการคำขอที่ผู้ใช้คนนี้เปิดไว้ (F1 · ปรับ 8 ก.ย. 2569)
 *
 * เดิมหน้านี้เป็นฟอร์มยาวหน้าเดียว ตอนนี้ฟอร์มย้ายไป /sender/new
 * และหน้านี้กลายเป็นจุดตั้งต้นที่มีปุ่ม + มุมขวาบน
 *
 * ★ ทำไมต้องมีรายการ ไม่พาไปหน้าติดตามเคสหลังส่งเหมือนเดิม
 *   เสนารักษ์ที่หน้างานมักเปิดหลายเคสติดกันในเหตุการณ์เดียว
 *   การกลับมาที่รายการทำให้กดปุ่ม + เปิดเคสถัดไปได้ทันที
 *   และเห็นว่าเคสที่เพิ่งส่งไปแล้วมีอะไรบ้าง ไม่ต้องจำเอง
 *
 * ★ สายรัดห้ามเลือดโผล่บนการ์ดด้วย
 *   เป็นข้อมูลเดียวในคำขอที่มีนาฬิกาเดินอยู่และมีผลต่อการตัดสินใจทางคลินิก
 *   คนที่เปิดหน้านี้อยู่ต้องเห็นโดยไม่ต้องกดเข้าไปในเคส
 *
 * ★ ไม่มีการเช็คสิทธิ์ใน query
 *   policy case_select กรองให้แล้วว่าใครเห็นเคสไหน
 *   ที่กรองด้วย .eq("created_by") ในนี้คือการเลือกมุมมอง ไม่ใช่การกันข้อมูล
 */

type CaseRow = {
  id: string;
  case_code: string;
  precedence: PrecedenceLevel;
  chief_complaint: string;
  requested_at: string;
  status: string;
  casualty:
    | { rank_th: string | null; first_name: string | null; last_name: string | null; affiliation: string | null }
    | { rank_th: string | null; first_name: string | null; last_name: string | null; affiliation: string | null }[]
    | null;
};

/** PostgREST คืน relation แบบ one-to-one เป็น object แต่บาง query คืนเป็น array */
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

const STATUS_LABEL: Record<string, string> = {
  requested: "รอจัดรถ",
  active: "กำลังส่งกลับ",
  completed: "ส่งมอบแล้ว",
  cancelled: "ยกเลิก",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const profile = await getProfile();
  if (!profile) return null;

  const { sent } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("case")
    .select(
      "id, case_code, precedence, chief_complaint, requested_at, status, casualty (rank_th, first_name, last_name, affiliation)",
    )
    .eq("created_by", profile.id)
    .order("requested_at", { ascending: false })
    .limit(25);

  const rows = (data ?? []) as unknown as CaseRow[];
  const tourniquets = await getTourniquetsByCase(rows.map((r) => r.id));

  return (
    <>
      <AppHeader
        title="ร้องขอส่งกลับ"
        subtitle={`ต้นทาง ${profile.unitName || profile.unitCode}`}
        actions={
          <RoleGate roles={["sender"]} fallback={null}>
            <Link
              href="/sender/new"
              aria-label="เพิ่มคำขอส่งกลับ"
              className="flex size-12 items-center justify-center rounded-xl bg-background text-2xl leading-none font-semibold text-header focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              +
            </Link>
          </RoleGate>
        }
      />

      <AppShell>
        <RoleGate
          roles={["sender"]}
          fallback={
            <p className="rounded-xl border border-border bg-card p-4 text-muted-foreground">
              บัญชีของคุณไม่มีบทบาทสำหรับหน้านี้
            </p>
          }
        >
          <div className="space-y-3">
            {sent && (
              <p
                role="status"
                className="rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                ส่งคำขอแล้ว ·{" "}
                {rows.find((r) => r.id === sent)?.case_code ?? "บันทึกเรียบร้อย"}
              </p>
            )}

            {rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-input px-4 py-10 text-center">
                <p className="text-base font-semibold">ยังไม่มีคำขอในกะนี้</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  กดปุ่ม + มุมขวาบนเพื่อเปิดคำขอใหม่
                </p>
              </div>
            ) : (
              <>
                <p className="px-1 font-mono text-xs tracking-wide text-muted-foreground">
                  คำขอของคุณ · {rows.length} ราย
                </p>

                <ul className="space-y-3">
                  {rows.map((r) => {
                    const c = one(r.casualty);
                    const name = [c?.rank_th, c?.first_name, c?.last_name]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <li key={r.id}>
                        <Link
                          href={`/track/${r.id}`}
                          className="block space-y-2 rounded-xl border border-border bg-card p-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          <div className="flex items-center gap-2">
                            <span className="tabular font-mono text-xs font-medium text-muted-foreground">
                              {r.case_code}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              · {STATUS_LABEL[r.status] ?? r.status}
                            </span>
                            <PrecedenceBadge value={r.precedence} className="ml-auto" />
                          </div>

                          <p className="text-base leading-tight font-semibold">
                            {name || "ยังไม่ได้บันทึกชื่อ"}
                          </p>
                          {c?.affiliation && (
                            <p className="text-sm text-muted-foreground">{c.affiliation}</p>
                          )}

                          <p className="border-t border-border pt-2 text-sm">
                            {r.chief_complaint}
                          </p>

                          <p className="tabular flex items-center gap-2 font-mono text-xs text-muted-foreground">
                            {formatClockTh(r.requested_at)} น.
                            <RelativeTime
                              value={r.requested_at}
                              className="ml-auto font-semibold text-primary"
                            />
                          </p>

                          <TourniquetStrip
                            items={tourniquets.get(r.id) ?? []}
                            returnTo="/sender"
                            compact
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </RoleGate>
      </AppShell>
    </>
  );
}
