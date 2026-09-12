"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";

import { PrecedenceBadge } from "@/components/medrelay/precedence-badge";
import { RelativeTime } from "@/components/medrelay/relative-time";
import { TriageDot } from "@/components/medrelay/triage-dot";
import { formatClockTh } from "@/lib/duration";
// 🔴 ดึงจาก monitor-view ไม่ใช่ monitor-resources — ตัวหลังเรียก createClient()
//    ซึ่งจะลาก next/headers เข้ามาฝั่ง client แล้ว build ล้ม (typecheck จับไม่เจอ)
import { AIR_DECISION_LABEL, type AirCase } from "@/lib/monitor-view";
import { cn } from "@/lib/utils";
import { TRANSPORT_LABEL } from "../sender/schema";
import { decideAirEvac, type AirActionState } from "./air-actions";

/**
 * คำขอส่งกลับทางอากาศ — ก้อนเดียวในหน้า /monitor ที่กดแล้วเปลี่ยนข้อมูล
 *
 * ★ ทำไมต้องเป็น component แยก ไม่ใช่ปุ่มบนการ์ดในรายการ
 *   การ์ดใน leg-list.tsx ทั้งใบเป็น <a> จะวาง <form> ซ้อนข้างในไม่ได้
 *   และ leg-list.tsx ใช้ร่วมกันสามหน้า การเติมปุ่มลงไปจะไปโผล่ที่ receiver
 *   กับ transporter ด้วยทั้งที่ทั้งสองไม่มีอำนาจอนุมัติ
 *
 * ★ canDecide คิดฝั่ง server แล้วส่งลงมา ไม่ให้ client เดาเอง
 *   commander เห็นหน้านี้ได้แต่ตัดสินไม่ได้ (policy case_update ยอมเฉพาะ monitor)
 *   เขาจึงต้องได้การ์ดที่ "ไม่มีปุ่ม" ไม่ใช่ปุ่มที่กดแล้วขึ้น error
 *   ปุ่มที่กดไม่ได้คือปุ่มที่ทำให้คนเข้าใจผิดว่าระบบพัง
 *
 * ★ ไม่มีช่องกรอกเวลา — air_decision_at ตั้งโดย trigger ตอนกดปุ่ม
 */

/** ยานพาหนะที่ศูนย์สั่งการอนุมัติให้ใช้ได้ · เรียงตามที่ใช้ตอบบ่อยที่สุด */
const GRANT_CHOICES = ["rotary", "fixed_wing", "ground", "watercraft"] as const;

function SubmitButton({
  decision,
  children,
}: {
  decision: "approved" | "denied";
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="decision"
      value={decision}
      disabled={pending}
      className={cn(
        "h-14 flex-1 rounded-lg border text-base font-semibold",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-60",
        decision === "approved"
          ? "border-triage-green bg-emerald-50 text-triage-green"
          : "border-border bg-background",
      )}
    >
      {pending ? "กำลังบันทึก…" : children}
    </button>
  );
}

/** หัวการ์ด — ใครคือผู้ป่วย ด่วนแค่ไหน และขออะไรมา (ใช้ทั้งคิวรอและรายการที่ตัดสินแล้ว) */
function CaseHead({ c }: { c: AirCase }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-muted-foreground">{c.caseCode}</span>
        <PrecedenceBadge value={c.precedence} />
        {c.triage && <TriageDot value={c.triage} size="sm" />}
      </div>

      <p className="mt-2 font-semibold">
        {c.patientName ?? c.patientAlias ?? "ยังไม่ได้บันทึกชื่อ"}
      </p>
      <p className="text-sm text-muted-foreground">{c.chiefComplaint}</p>

      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">หน่วยที่ขอ</dt>
          <dd>{c.originUnit}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">ขอมาเป็น</dt>
          <dd className="font-semibold">
            {TRANSPORT_LABEL[c.requestedMode] ?? c.requestedMode}
          </dd>
        </div>
      </dl>
    </>
  );
}

function PendingCard({ c, canDecide }: { c: AirCase; canDecide: boolean }) {
  const [state, action] = useActionState<AirActionState, FormData>(decideAirEvac, {});
  const noteId = useId();
  const modeId = useId();
  // เปิดช่องเหตุผลไว้เสมอ ไม่ซ่อนไว้หลังปุ่ม — คนกด "ไม่อนุมัติ" แล้วเจอ error
  // ว่าลืมกรอกเหตุผล คือคนที่ต้องกดสองรอบโดยไม่จำเป็น
  const [note, setNote] = useState("");

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <CaseHead c={c} />
      <p className="mt-1 text-sm text-muted-foreground">
        <RelativeTime value={c.requestedAt} prefix="เปิดคำขอ" />
      </p>

      {!canDecide ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          บัญชีของคุณดูคำขอนี้ได้ แต่การอนุมัติเป็นอำนาจของศูนย์สั่งการ
        </p>
      ) : (
        <form action={action} className="mt-3 space-y-3">
          <input type="hidden" name="caseId" value={c.id} />

          <div>
            <label htmlFor={modeId} className="text-sm font-semibold">
              ยานพาหนะที่อนุมัติให้ใช้
            </label>
            <select
              id={modeId}
              name="modeGranted"
              defaultValue={c.requestedMode}
              className="mt-1 h-14 w-full rounded-lg border border-border bg-background px-3 text-base focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {GRANT_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {TRANSPORT_LABEL[m]}
                  {m === c.requestedMode ? " (ตามที่ขอมา)" : ""}
                </option>
              ))}
            </select>
            {/* ปฏิเสธ ฮ. แล้วให้ไปทางรถ คือคำตอบที่พบบ่อยที่สุดหน้างาน
                จึงต้องเลือกโหมดอื่นได้แม้ตอนกดไม่อนุมัติ */}
            <p className="mt-1 text-sm text-muted-foreground">
              เลือกอย่างอื่นได้ถ้าไม่อนุมัติทางอากาศแต่ยังให้ส่งกลับได้ทางอื่น
            </p>
          </div>

          <div>
            <label htmlFor={noteId} className="text-sm font-semibold">
              เหตุผล{" "}
              <span className="font-normal text-muted-foreground">
                (บังคับเมื่อไม่อนุมัติ)
              </span>
            </label>
            <textarea
              id={noteId}
              name="note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ทัศนวิสัยต่ำกว่าเกณฑ์ · ลานจอดไม่ปลอดภัย"
              className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-base focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            />
          </div>

          {state.error && (
            <p role="alert" className="rounded-lg border border-triage-red p-3 text-sm text-triage-red">
              {state.error}
            </p>
          )}

          <div className="flex gap-3">
            <SubmitButton decision="approved">อนุมัติ</SubmitButton>
            <SubmitButton decision="denied">ไม่อนุมัติ</SubmitButton>
          </div>
        </form>
      )}
    </li>
  );
}

function DecidedCard({ c }: { c: AirCase }) {
  const approved = c.decision === "approved";
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <CaseHead c={c} />

      <div
        className={cn(
          "mt-3 rounded-lg border p-3 text-sm",
          approved ? "border-triage-green bg-emerald-50" : "border-border bg-muted/40",
        )}
      >
        <p className="font-semibold">
          {/* สถานะบอกด้วยตัวอักษรเสมอ ไม่ได้พึ่งสีอย่างเดียว */}
          {c.decision ? AIR_DECISION_LABEL[c.decision] : "—"}
          {c.modeGranted && (
            <span className="font-normal">
              {" "}
              · ให้ใช้ {TRANSPORT_LABEL[c.modeGranted] ?? c.modeGranted}
            </span>
          )}
        </p>
        <p className="mt-1 text-muted-foreground">
          {c.decidedBy ?? "ไม่ทราบผู้ตัดสิน"}
          {c.decisionAt && ` · ${formatClockTh(c.decisionAt)}`}
        </p>
        {c.decisionNote && <p className="mt-1">{c.decisionNote}</p>}
      </div>
    </li>
  );
}

export function AirApprovalSection({
  pending,
  decided,
  canDecide,
}: {
  pending: AirCase[];
  decided: AirCase[];
  canDecide: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">
        คำขอส่งกลับทางอากาศ{" "}
        <span className="font-normal text-muted-foreground">
          (รอตัดสิน {pending.length})
        </span>
      </h2>

      {pending.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-muted-foreground">
          ไม่มีคำขอทางอากาศที่รอการตัดสิน
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {pending.map((c) => (
            <PendingCard key={c.id} c={c} canDecide={canDecide} />
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <>
          <h3 className="mt-5 mb-3 text-sm font-semibold text-muted-foreground">
            ตัดสินไปแล้วล่าสุด
          </h3>
          <ul className="grid gap-3 lg:grid-cols-2">
            {decided.map((c) => (
              <DecidedCard key={c.id} c={c} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
