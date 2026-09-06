import Link from "next/link";

import { PrecedenceBadge } from "@/components/medrelay/precedence-badge";
import { RelativeTime } from "@/components/medrelay/relative-time";
import { TriageDot } from "@/components/medrelay/triage-dot";
import { LEG_STATUS_LABEL, nextStep } from "@/lib/leg-flow";
import type { LegListItem } from "@/lib/leg-queries";
import { cn } from "@/lib/utils";

/**
 * รายการทอดที่ใช้ร่วมกันทั้งหน้า Transporter · Receiver · Monitor
 *
 * ★ ทุกการ์ดเป็นลิงก์ไป /track/[caseId] ทั้งใบ ไม่ใช่ปุ่มเล็กๆ มุมขวา
 *   ผู้ใช้กดด้วยนิ้วโป้งขณะสวมถุงมือ เป้าหมายเล็กกว่านี้จะกดพลาด
 *   และหน้า /track คือที่เดียวที่มีปุ่มเปลี่ยนสถานะ การพาไปที่นั่นจึงเป็นทางเดียวที่ถูก
 *
 * ★ บอก "ขั้นถัดไปคืออะไร" ไม่ใช่แค่ "สถานะตอนนี้คืออะไร"
 *   คนเปิดหน้ารายการมาถามว่าต้องทำอะไรต่อ ไม่ได้มาถามว่าตอนนี้อยู่ขั้นไหน
 *
 * ★ ไม่พึ่งสีอย่างเดียว — ทุกการ์ดมีทั้งรูปทรง (TriageDot) ข้อความ (PrecedenceBadge)
 *   และคำบอกสถานะเป็นตัวอักษร ตามข้อกำหนดใน /design หัวข้อ 6
 */

export function LegCardLink({
  leg,
  /** แสดงชื่อผู้ลำเลียงด้วย — ใช้ในหน้าศูนย์สั่งการที่ต้องรู้ว่าใครถือทอดนี้ */
  showTransporter = false,
}: {
  leg: LegListItem;
  showTransporter?: boolean;
}) {
  const next = nextStep(leg.status);
  const waiting = leg.status === "pending";

  return (
    <li>
      <Link
        href={`/track/${leg.caseId}`}
        className={cn(
          "block rounded-xl border bg-card p-4",
          "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          waiting ? "border-triage-yellow-edge" : "border-border",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <PrecedenceBadge value={leg.precedence} variant="soft" />
          {leg.triage && <TriageDot value={leg.triage} />}
          <span className="ml-auto font-mono text-sm text-muted-foreground">
            {leg.caseCode}
          </span>
        </div>

        <p className="mt-2 text-base font-semibold text-balance">
          {leg.chiefComplaint}
        </p>

        <p className="mt-1 text-sm text-muted-foreground">
          {leg.patientAlias ?? "ไม่ระบุนามสมมติ"}
          {leg.patientCount > 1 && ` · ${leg.patientCount} ราย`}
        </p>

        <p className="mt-2 text-sm">
          <span className="font-mono text-muted-foreground">ทอด {leg.legNo}</span>{" "}
          {leg.fromUnit} → {leg.toUnit}
        </p>

        {(leg.vehicle || (showTransporter && leg.transporter)) && (
          <p className="mt-1 text-sm text-muted-foreground">
            {leg.vehicle && <span className="font-mono">{leg.vehicle}</span>}
            {leg.vehicle && showTransporter && leg.transporter && " · "}
            {showTransporter && leg.transporter}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-sm">
          <span className="font-semibold">{LEG_STATUS_LABEL[leg.status]}</span>
          {next && (
            <span className="text-muted-foreground">→ {next.action}</span>
          )}
          <span className="ml-auto text-muted-foreground">
            <RelativeTime
              value={waiting ? leg.requestedAt : leg.lastEventAt}
              prefix={waiting ? "รอมา" : ""}
              variant={waiting ? "elapsed" : "ago"}
            />
          </span>
        </div>
      </Link>
    </li>
  );
}

/**
 * กลุ่มรายการหนึ่งหัวข้อ พร้อม empty state ที่บอกความจริง
 *
 * ⚠ empty state ต้องบอกตรงๆ ว่า "ไม่มี" ห้ามแสดงการ์ดหลอกหรือเลข 0
 *   หน้าจอว่างที่ไม่มีคำอธิบาย ผู้ใช้จะเดาว่าแอปพัง แล้วโทรถามด้วยเสียง
 *   ซึ่งเป็นสิ่งเดียวกับที่ระบบนี้ตั้งใจจะลด
 */
export function LegSection({
  title,
  emptyText,
  legs,
  showTransporter = false,
}: {
  title: string;
  emptyText: string;
  legs: LegListItem[];
  showTransporter?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">
        {title}{" "}
        {legs.length > 0 && (
          <span className="font-normal text-muted-foreground">
            ({legs.length})
          </span>
        )}
      </h2>

      {legs.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul className="space-y-3">
          {legs.map((leg) => (
            <LegCardLink
              key={leg.id}
              leg={leg}
              showTransporter={showTransporter}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
