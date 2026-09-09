"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";

import { RoleGate } from "@/components/medrelay/role-gate";
import { TriageDot } from "@/components/medrelay/triage-dot";
import type { CustodyState } from "@/lib/custody";
import type { TriageColor } from "@/lib/enums";
import { ASSESSOR_ROLES } from "@/lib/leg-flow";
import { TRIAGE } from "@/lib/triage";
import { cn } from "@/lib/utils";
import { TreatmentList } from "../../sender/new/treatment-list";
import { VitalsFields } from "../../sender/new/vitals-fields";
import {
  saveTreatments,
  saveTriage,
  saveVitals,
  type ReassessState,
} from "./reassess-actions";

/**
 * ประเมินซ้ำระหว่างสายส่งกลับ — สามฟอร์มแยกกัน สามปุ่มบันทึก
 *
 * ★ ทำไมแยกสามฟอร์ม ไม่รวมเป็นฟอร์มเดียว
 *   เจ้าของโครงการสั่งไว้ว่าแต่ละเมนู "update ฐานข้อมูลในเวลาที่ต่างกัน"
 *   นายสิบพยาบาลยืนยันสีตอนหนึ่ง วัดความดันอีกตอนหนึ่ง ให้ยาอีกตอนหนึ่ง
 *   ถ้ารวมเป็นปุ่มเดียวทั้งสามจะได้เวลาเดียวกันหมด ซึ่งไม่ตรงกับหน้างาน
 *   และเวลาคือสิ่งเดียวที่บอกได้ว่าอาการเดินไปทางไหนระหว่างทาง
 *
 * ★ ไม่มีช่องกรอกเวลาที่ใดในไฟล์นี้ เวลามาจาก now() ของฐานข้อมูลตอนกดบันทึก
 *   ข้อยกเว้นเดียวคือช่องเวลารัดสายห้ามเลือดที่ฝังมากับ TreatmentList อยู่แล้ว
 *
 * ★ RoleGate ที่นี่เป็น UX ล้วน ด่านจริงอยู่ใน reassess-actions.ts
 *   ซึ่งเช็ค hasAnyRole() ฝั่ง server ก่อนเขียนทุกครั้ง
 *
 * ★ แยกเป็นสอง export ตั้งแต่ 9 ก.ย. 2569 (คำสั่งเจ้าของโครงการ)
 *   AssessPanel (สี + V/S) กับ TreatmentsCard (การรักษา) ไม่ได้อยู่ติดกันแล้ว
 *   เพราะการ์ดสายรัดห้ามเลือดคั่นกลาง ตามลำดับที่ปลายทางทำงานจริง —
 *   ประเมินก่อน แล้วดูสายรัดที่ติดตัวมา แล้วจึงลงว่าให้การรักษาอะไรเพิ่ม
 */

/** ลำดับเดียวกับปุ่มความเร่งด่วนขั้นที่ 2 ของฟอร์มผู้ส่ง เพื่อให้มือจำตำแหน่งได้ */
const TRIAGE_CHOICES: readonly TriageColor[] = ["red", "yellow", "green", "black"];

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "h-14 w-full rounded-lg border border-border bg-background text-base font-semibold",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-60",
      )}
    >
      {pending ? "กำลังบันทึก…" : children}
    </button>
  );
}

/** ข้อความผลลัพธ์ — แยกสีความสำเร็จกับความผิดพลาด และมี role ให้ screen reader */
function Result({ state }: { state: ReassessState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-destructive bg-red-50 px-3 py-2 text-sm font-medium text-destructive"
      >
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p
        role="status"
        className="rounded-lg border border-triage-green bg-emerald-50 px-3 py-2 text-sm font-medium"
      >
        {state.ok}
      </p>
    );
  }
  return null;
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------
 * 1. ยืนยันระดับความรุนแรง
 * ----------------------------------------------------------- */
function TriageForm({ caseId, current }: { caseId: string; current: TriageColor | null }) {
  const [state, formAction] = useActionState<ReassessState, FormData>(saveTriage, {});
  const [picked, setPicked] = useState<TriageColor | "">("");

  return (
    <Card
      title="ยืนยันระดับความรุนแรง"
      hint={
        current
          ? `สีปัจจุบันคือ ${TRIAGE[current].label} — เลือกใหม่ได้ถ้าอาการเปลี่ยนไปแล้ว`
          : "ยังไม่เคยมีการยืนยันสีในเคสนี้"
      }
    >
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="caseId" value={caseId} />

        <fieldset className="space-y-2">
          <legend className="sr-only">ระดับความรุนแรง</legend>
          {TRIAGE_CHOICES.map((c) => {
            const t = TRIAGE[c];
            const selected = picked === c;
            return (
              <label
                key={c}
                className={cn(
                  "flex h-14 cursor-pointer items-center gap-3 rounded-lg border-2 px-4",
                  "focus-within:ring-3 focus-within:ring-ring/50",
                  selected ? t.solid : "border-border bg-background hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="triage"
                  value={c}
                  checked={selected}
                  onChange={() => setPicked(c)}
                  className="sr-only"
                />
                <TriageDot value={c} size="md" showLabel={false} />
                <span className="text-base font-semibold">{t.label}</span>
                <span
                  className={cn(
                    "ml-auto text-sm",
                    selected ? "opacity-80" : "text-muted-foreground",
                  )}
                >
                  {t.hint}
                </span>
              </label>
            );
          })}
        </fieldset>

        <Result state={state} />
        <SubmitButton>บันทึกระดับความรุนแรง</SubmitButton>
        <p className="text-xs text-muted-foreground">
          บันทึกแล้วสีของเคสจะเปลี่ยนตามทุกหน้า และเก็บไว้ในผลประเมินว่าใครยืนยันเมื่อไร
        </p>
      </form>
    </Card>
  );
}

/* -------------------------------------------------------------
 * 2. สัญญาณชีพ
 * ----------------------------------------------------------- */
function VitalsForm({ caseId }: { caseId: string }) {
  const [state, formAction] = useActionState<ReassessState, FormData>(saveVitals, {});
  const id = useId();

  return (
    <Card
      title="บันทึกสัญญาณชีพ"
      hint="กรอกเท่าที่วัดได้ · เวลาที่บันทึกคือเวลาที่กดปุ่ม"
    >
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="caseId" value={caseId} />
        <VitalsFields id={id} err={state.fieldErrors} />
        <Result state={state} />
        <SubmitButton>บันทึกสัญญาณชีพ</SubmitButton>
      </form>
    </Card>
  );
}

/* -------------------------------------------------------------
 * 3. การรักษาที่ให้
 * ----------------------------------------------------------- */
function TreatmentsForm({ caseId }: { caseId: string }) {
  const [state, formAction] = useActionState<ReassessState, FormData>(
    saveTreatments,
    {},
  );

  return (
    <Card
      title="บันทึกการรักษาที่ให้"
      hint="เมนูหัตถการชุดเดียวกับที่เขตหน้าใช้ · ทุกรายการมีเวลากำกับ"
    >
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="caseId" value={caseId} />
        <TreatmentList error={undefined} />
        <Result state={state} />
        <SubmitButton>บันทึกการรักษา</SubmitButton>
      </form>
    </Card>
  );
}

/* -------------------------------------------------------------
 * กล่องบอกว่าทำไมยังบันทึกไม่ได้ — ใช้ร่วมทั้งสอง panel
 *
 * แสดงข้อความแทนที่จะวาดฟอร์มแล้ว disable ปุ่ม เพราะฟอร์มที่กรอกได้
 * แต่กดไม่ได้ทำให้คนหน้างานคิดว่าระบบพัง แล้วกดซ้ำอยู่อย่างนั้น
 * ★ ข้อความมาจาก custody.blockedReason ที่คิดฝั่ง server ที่เดียว
 *   จึงตรงกับข้อความที่ server action จะตอบกลับถ้ามีคนยิงตรงเข้ามา
 * ----------------------------------------------------------- */
function LockedNote({ reason }: { reason: string }) {
  return (
    <p className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
      🔒 {reason}
    </p>
  );
}

/* -------------------------------------------------------------
 * กล่องรวม 1 — ประเมินผู้ป่วย (สี + สัญญาณชีพ)
 *
 * พับด้วย <details> ของ HTML แท้ ด้วยเหตุผลเดียวกับ leg-card.tsx
 * คือไม่ต้องพึ่ง JavaScript และ screen reader หาเจอแม้ยังพับอยู่
 * เปิดค้างไว้เมื่อทอดยังเดินอยู่ เพราะนั่นคือตอนที่มีคนต้องใช้จริง
 * ----------------------------------------------------------- */
export function AssessPanel({
  caseId,
  currentTriage,
  open,
  custody,
}: {
  caseId: string;
  currentTriage: TriageColor | null;
  /** ทอดยังเดินอยู่หรือไม่ — ใช้ตัดสินว่าจะกางไว้เลยไหม */
  open: boolean;
  custody: CustodyState;
}) {
  return (
    <RoleGate roles={ASSESSOR_ROLES}>
      <details
        open={open}
        className="rounded-xl border border-border bg-muted/30 p-4"
      >
        <summary className="cursor-pointer text-lg font-semibold">
          ประเมินผู้ป่วย
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            เมื่อถึงจุดส่งต่อใหม่
          </span>
        </summary>

        {custody.canRecordCare ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              เวลาผ่านไปอาการเปลี่ยนได้ — บันทึกทีละอย่างตามที่ทำจริง
              แต่ละปุ่มลงเวลาแยกกัน
            </p>
            <div className="mt-3 space-y-3">
              <TriageForm caseId={caseId} current={currentTriage} />
              <VitalsForm caseId={caseId} />
            </div>
          </>
        ) : (
          <div className="mt-3">
            <LockedNote reason={custody.blockedReason!} />
          </div>
        )}
      </details>
    </RoleGate>
  );
}

/* -------------------------------------------------------------
 * กล่องรวม 2 — บันทึกการรักษา
 *
 * อยู่ใต้การ์ดสายรัดห้ามเลือดโดยเจตนา ปลายทางดูว่าติดสายรัดมากี่เส้น
 * แล้วจึงลงว่าให้อะไรเพิ่ม — ลำดับเดียวกับที่มือทำจริง
 * ----------------------------------------------------------- */
export function TreatmentsPanel({
  caseId,
  custody,
}: {
  caseId: string;
  custody: CustodyState;
}) {
  return (
    <RoleGate roles={ASSESSOR_ROLES}>
      {custody.canRecordCare ? (
        <TreatmentsForm caseId={caseId} />
      ) : (
        <Card
          title="บันทึกการรักษาที่ให้"
          hint="เมนูหัตถการชุดเดียวกับที่เขตหน้าใช้ · ทุกรายการมีเวลากำกับ"
        >
          <LockedNote reason={custody.blockedReason!} />
        </Card>
      )}
    </RoleGate>
  );
}
