"use client";

import { useState } from "react";
import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { BottomNav } from "@/components/medrelay/bottom-nav";
import { PrecedenceBadge } from "@/components/medrelay/precedence-badge";
import { RelativeTime } from "@/components/medrelay/relative-time";
import { TriageChip, TriageDot } from "@/components/medrelay/triage-dot";
import { Button } from "@/components/ui/button";
import type { AppRole } from "@/lib/enums";
import { PRECEDENCE, PRECEDENCE_ORDER, TRIAGE, TRIAGE_ORDER } from "@/lib/triage";

/**
 * หน้าทดสอบ design system — ไม่ใช่ส่วนหนึ่งของแอปจริง
 * มีไว้ให้ตรวจข้อกำหนดของ Prompt 02 ได้ด้วยตาในที่เดียว
 * โดยเฉพาะข้อ "ย่อจอเหลือ 375px แล้วยังใช้งานได้" และ "TriageDot อ่านออกแม้เป็นภาพขาวดำ"
 */

const ALL_ROLES: AppRole[] = [
  "sender",
  "transporter",
  "receiver",
  "monitor",
  "commander",
  "admin",
];

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-lg font-semibold">{title}</h2>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      <div className="mt-3 rounded-xl border border-border bg-card p-4">
        {children}
      </div>
    </section>
  );
}

export default function DesignPage() {
  const [roles, setRoles] = useState<AppRole[]>(["sender", "monitor"]);
  const [now] = useState(() => Date.now());

  const toggle = (r: AppRole) =>
    setRoles((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
    );

  return (
    <>
      <AppHeader
        title="Design system"
        subtitle="Prompt 02 · ตรวจสีและ component พื้นฐานก่อนลงมือทำหน้าจริง"
      />

      <AppShell>
        <Section
          title="1 · TriageDot"
          note="สี + รูปทรง + ตัวอักษร สามชั้น เอาชั้นไหนออกก็ยังอ่านได้"
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {TRIAGE_ORDER.map((t) => (
              <TriageDot key={t} value={t} size="lg" />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
            {TRIAGE_ORDER.map((t) => (
              <span key={t} className="flex items-center gap-2 text-sm">
                <TriageDot value={t} size="sm" showLabel={false} />
                <span className="text-muted-foreground">
                  ไม่มีป้าย · ยังมี aria-label
                </span>
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            {TRIAGE_ORDER.map((t) => (
              <TriageChip key={t} value={t} />
            ))}
          </div>
        </Section>

        <Section
          title="2 · PrecedenceBadge"
          note="ใช้สีชุดเดียวกับ triage แต่เป็นแคปซูลมีข้อความ จึงแยกออกว่าคนละค่า"
        >
          <div className="flex flex-wrap gap-2">
            {PRECEDENCE_ORDER.map((p) => (
              <PrecedenceBadge key={p} value={p} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRECEDENCE_ORDER.map((p) => (
              <PrecedenceBadge key={p} value={p} variant="soft" />
            ))}
          </div>
          <table className="mt-4 w-full border-t border-border pt-4 text-sm">
            <tbody>
              {PRECEDENCE_ORDER.map((p) => (
                <tr key={p} className="border-b border-border last:border-0">
                  <td className="py-2 font-mono text-muted-foreground">{p}</td>
                  <td className="py-2">{PRECEDENCE[p].label}</td>
                  <td className="py-2 text-right">
                    <TriageDot value={PRECEDENCE[p].triage} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section
          title="3 · RelativeTime"
          note="อัปเดตเองทุก 30 วินาที และอัปเดตทันทีเมื่อสลับกลับมาที่แอป · ชี้ค้างเพื่อดูเวลาเต็ม"
        >
          <dl className="space-y-2 text-sm">
            {[
              ["เพิ่งเกิด", now - 5_000],
              ["3 นาทีที่แล้ว", now - 3 * 60_000],
              ["44 นาทีที่แล้ว", now - 44 * 60_000],
              ["เมื่อวาน", now - 26 * 3600_000],
              ["ประมาณการขาเข้า", now + 6 * 60_000],
            ].map(([label, t]) => (
              <div key={String(label)} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">
                  <RelativeTime value={t as number} />
                </dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-border pt-2">
              <dt className="text-muted-foreground">
                เวลาสะสม (variant=elapsed)
              </dt>
              <dd className="font-medium">
                <RelativeTime value={now - 66 * 60_000} variant="elapsed" />
              </dd>
            </div>
          </dl>
        </Section>

        <Section
          title="4 · ขนาดพื้นที่กด"
          note="ปุ่มหลักสูง 56px ปุ่มรองสูง 48px — กดด้วยนิ้วโป้งขณะสวมถุงมือได้"
        >
          <Button className="h-14 w-full text-base font-semibold">
            ส่งคำขอ
          </Button>
          <Button variant="outline" className="mt-3 h-12 w-full text-base">
            เติมรายละเอียดภายหลัง
          </Button>
        </Section>

        <Section
          title="5 · Bottom nav ซ่อน tab ตามบทบาท"
          note="กดสลับบทบาทแล้วดูแถบล่างจอ · เหลือบทบาทเดียวแถบจะซ่อนทั้งแถบ"
        >
          <div className="flex flex-wrap gap-2">
            {ALL_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => toggle(r)}
                aria-pressed={roles.includes(r)}
                className={
                  roles.includes(r)
                    ? "h-12 rounded-full border border-primary bg-primary px-4 font-mono text-sm font-semibold text-primary-foreground"
                    : "h-12 rounded-full border border-input px-4 font-mono text-sm text-muted-foreground"
                }
              >
                {r}
              </button>
            ))}
          </div>
        </Section>

        <Section
          title="6 · ทดสอบภาพขาวดำ"
          note="ส่วนนี้ถูกบังคับให้เป็นเฉดเทา ถ้ายังบอกได้ว่าอันไหนคืออันไหน แปลว่าไม่ได้พึ่งสีอย่างเดียว"
        >
          <div className="grayscale">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {TRIAGE_ORDER.map((t) => (
                <TriageDot key={t} value={t} size="lg" />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {TRIAGE_ORDER.map((t) => (
                <TriageChip key={t} value={t} />
              ))}
            </div>
          </div>
        </Section>

        <Section title="7 · จานสี" note="ทุกคู่ตรวจด้วยสูตร contrast ของ WCAG แล้ว">
          <ul className="space-y-2 text-sm">
            {TRIAGE_ORDER.map((t) => (
              <li
                key={t}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 font-medium ${TRIAGE[t].solid}`}
              >
                <span>{TRIAGE[t].label} · {TRIAGE[t].hint}</span>
                <span className="font-mono text-xs">{t}</span>
              </li>
            ))}
            <li className="flex items-center justify-between rounded-lg border border-primary bg-primary px-3 py-2 font-medium text-primary-foreground">
              <span>เขียวปฏิบัติการ · ปุ่มยืนยัน</span>
              <span className="font-mono text-xs">primary</span>
            </li>
            <li className="flex items-center justify-between rounded-lg border border-header bg-header px-3 py-2 font-medium text-header-foreground">
              <span>เขียวเข้ม · แถบหัวเรื่อง</span>
              <span className="font-mono text-xs">header</span>
            </li>
          </ul>
        </Section>
      </AppShell>

      <BottomNav roles={roles} />
    </>
  );
}
