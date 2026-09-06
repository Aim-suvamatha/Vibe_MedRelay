import Link from "next/link";

import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { NoAccessNotice } from "@/components/medrelay/no-access";
import { PrecedenceBadge } from "@/components/medrelay/precedence-badge";
import { TriageDot } from "@/components/medrelay/triage-dot";
import { getProfile, hasAnyRole } from "@/lib/auth/profile";
import type { PrecedenceLevel, TriageColor } from "@/lib/enums";
import { formatDuration, getMetrics } from "@/lib/metrics";
import { PRECEDENCE_ORDER, TRIAGE_ORDER } from "@/lib/triage";
import { cn } from "@/lib/utils";

/**
 * หน้า /dashboard — F4 ตัวเลขที่วัดผลได้ (Prompt 09)
 *
 * ★ ข้อพิสูจน์หลักของทั้งโครงการอยู่ที่หน้านี้
 *   ตัวเลขทุกตัวคำนวณจาก timestamp ที่ trigger ตั้งเองตอนผู้ใช้กดปุ่มใน /track
 *   **ไม่มีใครต้องกรอกอะไรเพิ่มแม้แต่ช่องเดียวเพื่อให้ได้หน้านี้**
 *   นั่นคือความต่างจากสมุดเวรที่ต้องมานั่งรวมยอดตอนสิ้นเดือน
 *
 * ★ ใช้ median ไม่ใช่ mean — เหตุผลเต็มอยู่ใน src/lib/metrics.ts
 *
 * ★ ไม่มีตัวเลขก็ต้องบอกว่าไม่มี ห้ามแสดง 0
 *   "0 นาที" อ่านได้ว่าจัดรถได้ทันทีทุกครั้ง ซึ่งเป็นคำโกหกที่ดูน่าเชื่อมาก
 *   การ์ดที่ไม่มีข้อมูลจึงแสดงขีดกลางพร้อมคำอธิบายเสมอ
 *
 * ★ ตัดกราฟแท่ง 2 อันออกตามแผนตัดฟีเจอร์ใน HANDOFF §3
 *   การกระจายแสดงเป็นรายการนับพร้อมป้ายสีเดิมของระบบ ซึ่งอ่านบนมือถือง่ายกว่า
 *   และไม่ต้องเพิ่ม dependency กราฟเข้ามาในสัปดาห์สุดท้ายก่อนส่ง
 */

function StatCard({
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

function DistributionRow({
  swatch,
  label,
  count,
  total,
}: {
  swatch: React.ReactNode;
  label: string;
  count: number;
  total: number;
}) {
  // แถบสัดส่วนเป็นตัวช่วยอ่านเท่านั้น ตัวเลขจริงอยู่ข้างๆ เสมอ
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <li className="flex items-center gap-3">
      <span className="flex w-32 shrink-0 items-center gap-2">{swatch}</span>
      <span
        aria-hidden
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-20 shrink-0 text-right text-sm tabular-nums">
        <span className="font-semibold">{count}</span>
        <span className="text-muted-foreground"> · {pct}%</span>
      </span>
      <span className="sr-only">
        {label} {count} เคส คิดเป็น {pct} เปอร์เซ็นต์
      </span>
    </li>
  );
}

export default async function Page() {
  const profile = await getProfile();
  if (!profile) return null;

  // เช็คบทบาทก่อนยิง query ไม่ใช่หลัง (HANDOFF §3 บทเรียนเรื่องการกันสิทธิ์)
  if (!hasAnyRole(profile, ["monitor", "commander"])) {
    return (
      <>
        <AppHeader title="แดชบอร์ด" subtitle="ตัวเลขการส่งกลับ" />
        <AppShell width="wide">
          <NoAccessNotice />
        </AppShell>
      </>
    );
  }

  const m = await getMetrics();
  const noLegData = m.legSampleSize === 0;

  return (
    <>
      <AppHeader
        title="แดชบอร์ด"
        subtitle="ตัวเลขทั้งหมดคำนวณจากเวลาที่ระบบบันทึกเอง ไม่มีใครต้องกรอกเพิ่ม"
      />
      <AppShell width="wide">
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-lg font-semibold">ภาพรวม</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="เคสที่เปิดวันนี้"
                value={String(m.casesToday)}
                hint="นับตามวันที่ของเวลาไทย"
              />

              <StatCard
                label="เคสที่ยังไม่จบ"
                value={String(m.casesOpen)}
                hint={
                  m.casesOpen > 0
                    ? "ยังมีทอดที่ต้องเดินต่อ"
                    : "ทุกเคสส่งมอบครบแล้ว"
                }
              />

              <StatCard
                label="มัธยฐานเวลารอจัดรถ"
                value={formatDuration(m.medianWaitSec)}
                empty={m.medianWaitSec === null}
                hint={
                  m.medianWaitSec === null
                    ? "ยังไม่มีทอดที่ส่งมอบเสร็จ จึงยังวัดไม่ได้"
                    : `ตั้งแต่เปิดคำขอถึงจัดรถ · จาก ${m.legSampleSize} ทอด`
                }
              />

              <StatCard
                label="มัธยฐานเวลารวมต่อทอด"
                value={formatDuration(m.medianLegTotalSec)}
                empty={m.medianLegTotalSec === null}
                hint={
                  m.medianLegTotalSec === null
                    ? "ยังไม่มีทอดที่ส่งมอบเสร็จ จึงยังวัดไม่ได้"
                    : `ตั้งแต่เปิดคำขอถึงส่งมอบ · จาก ${m.legSampleSize} ทอด`
                }
              />
            </div>

            {!noLegData && (
              <p className="mt-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  ทำไมใช้มัธยฐานไม่ใช่ค่าเฉลี่ย ·{" "}
                </span>
                เวลาตอบสนองมีค่าสุดโต่งเสมอ ทอดเดียวที่ติดฝนหรือรอเคลียร์เส้นทาง
                สามชั่วโมงจะดึงค่าเฉลี่ยของทั้งเดือนให้เพี้ยนจนไม่สะท้อนวันปกติ
                มัธยฐานตอบคำถามว่า “ปกติแล้วนานเท่าไร” ได้ตรงกว่า
              </p>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">เวลารวมทั้งเคส</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label="มัธยฐานเวลาส่งกลับทั้งเคส"
                value={formatDuration(m.medianCaseTotalSec)}
                empty={m.medianCaseTotalSec === null}
                hint={
                  m.medianCaseTotalSec === null
                    ? "ยังไม่มีเคสที่ส่งกลับครบทุกทอด จึงยังวัดไม่ได้"
                    : `ตั้งแต่ทอดแรกถึงทอดสุดท้าย · จาก ${m.caseSampleSize} เคส`
                }
              />
              <StatCard
                label="ทอดที่วัดเวลาได้"
                value={String(m.legSampleSize)}
                empty={noLegData}
                hint={
                  noLegData
                    ? "ทอดจะเข้ามานับเมื่อกดส่งมอบครบทุกขั้นแล้ว"
                    : "ทอดที่ส่งมอบเสร็จและมีเวลาครบทั้ง 6 ขั้น"
                }
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">
              การกระจายของเคส{" "}
              <span className="font-normal text-muted-foreground">
                ({m.caseTotal} เคส)
              </span>
            </h2>

            {m.caseTotal === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-card p-4 text-muted-foreground">
                ยังไม่มีเคสในระบบที่บัญชีของคุณมองเห็น
              </p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                    ตามความเร่งด่วน
                  </h3>
                  <ul className="space-y-2.5">
                    {PRECEDENCE_ORDER.map((p: PrecedenceLevel) => (
                      <DistributionRow
                        key={p}
                        swatch={<PrecedenceBadge value={p} variant="soft" />}
                        label={p}
                        count={m.byPrecedence[p]}
                        total={m.caseTotal}
                      />
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                    ตามผลคัดแยก
                  </h3>
                  <ul className="space-y-2.5">
                    {TRIAGE_ORDER.map((t: TriageColor) => (
                      <DistributionRow
                        key={t}
                        swatch={<TriageDot value={t} />}
                        label={t}
                        count={m.byTriage[t]}
                        total={m.caseTotal}
                      />
                    ))}
                    {m.byTriage.unknown > 0 && (
                      <DistributionRow
                        swatch={
                          <span className="text-sm text-muted-foreground">
                            ยังไม่คัดแยก
                          </span>
                        }
                        label="ยังไม่คัดแยก"
                        count={m.byTriage.unknown}
                        total={m.caseTotal}
                      />
                    )}
                  </ul>
                </div>
              </div>
            )}
          </section>

          <Link
            href="/monitor"
            className="flex h-14 w-full items-center justify-center rounded-lg border border-border bg-background text-base font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            กลับไปคิวศูนย์สั่งการ
          </Link>
        </div>
      </AppShell>
    </>
  );
}
