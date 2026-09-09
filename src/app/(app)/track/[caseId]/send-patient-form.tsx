"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";

import type { CaseOutcome, PrecedenceLevel } from "@/lib/enums";
import { PRECEDENCE, PRECEDENCE_ORDER } from "@/lib/triage";
import { cn } from "@/lib/utils";
import {
  OUTCOME_LABEL,
  OUTCOME_VALUES,
  TRANSPORT_LABEL,
  TRANSPORT_ORDER,
} from "../../sender/schema";
import { dischargeToUnit, startNextLeg, type LegActionState } from "./actions";

/**
 * ส่งผู้ป่วยออกจากหน่วยนี้ — หน้าที่ที่สองของผู้รับ (คำสั่งเจ้าของโครงการ 9 ก.ย. 2569)
 *
 * เดิมไฟล์นี้ชื่อ next-leg-form.tsx และมีทางเดียวคือ "เปิดทอดถัดไป"
 * ซึ่งครอบไม่ครบ เพราะหน้างานจริงผู้รับมีสองทางออกที่ต่างกันคนละเรื่อง
 *
 *   ก. รักษาที่นี่ต่อไม่ไหว → ส่งต่อชั้นการรักษาที่สูงกว่า
 *      เป็น "คำขอส่งกลับใบใหม่" ที่เขาเป็นผู้ขอเอง จึงต้องกรอกแบบผู้ส่ง
 *      คือเลือกปลายทาง · ความเร่งด่วน · ยานพาหนะที่ขอ · เหตุผล
 *      ไม่ต้องกรอกข้อมูลผู้ป่วยซ้ำ เพราะเดินทางมากับเคสอยู่แล้วทั้งชุด
 *
 *   ข. อาการดีขึ้นจนกลับหน่วยได้ → ส่งคืนหน่วยต้นสังกัด
 *      ไม่ใช่ภารกิจส่งกลับ จึง **ไม่เปิดทอดใหม่** เขารอรถเที่ยวหน้า
 *      ที่หน่วยต้นทางส่งคนมารักษาแล้วติดกลับไปด้วย
 *      สิ่งที่ระบบต้องเก็บคือผลการจำหน่ายตาม ทบ.466-900
 *
 * ★ กันด้วยตัวตน ไม่ใช่บทบาท — page.tsx เป็นคนตัดสินว่าจะ render ไฟล์นี้ไหม
 *   จากการเทียบ profile.unitId กับ to_unit_id ของทอดสุดท้าย
 *   ไฟล์นี้จึงไม่มี RoleGate — บัญชีเดียวถือหลายบทบาท RoleGate ไม่เคยพอ
 *   (บทเรียนบั๊กข้อ 2 เมื่อ 8 ก.ย. 2569)
 *
 * ★ ทั้งสองทางพับด้วย <details> ของ HTML แท้ ไม่ต้องพึ่ง JavaScript
 *   และเริ่มด้วยการพับไว้ทั้งคู่โดยเจตนา ผู้ป่วยจำนวนมากจบที่ทอดเดียว
 *   ถ้าฟอร์มกางค้างไว้จะชวนให้เปิดทอดหรือจำหน่ายก่อนเวลาอันควร
 */

export type NextLegUnitOption = {
  id: string;
  nameTh: string;
  roleLevel: string;
};

const ROLE_LEVEL_LABEL: Record<string, string> = {
  role_1: "ชั้น 1",
  role_2: "ชั้น 2",
  role_3: "ชั้น 3",
  role_4: "ชั้น 4",
};

/** ความเร่งด่วนที่เลือกได้ตอนส่งต่อ — ตัด 'died' ออกเพราะเป็นเรื่องของการจำหน่าย ไม่ใช่การขอรถ */
const SEND_PRECEDENCE: readonly PrecedenceLevel[] = PRECEDENCE_ORDER.filter(
  (p) => p !== "died",
);

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "h-14 w-full rounded-lg bg-primary text-base font-semibold text-primary-foreground",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-60",
      )}
    >
      {pending ? "กำลังบันทึก…" : children}
    </button>
  );
}

function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive bg-red-50 px-3 py-2 text-sm font-medium text-destructive"
    >
      {message}
    </p>
  );
}

const FIELD =
  "h-12 w-full rounded-lg border border-border bg-background px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

function Summary({ children }: { children: React.ReactNode }) {
  return (
    <summary className="flex h-12 cursor-pointer list-none items-center justify-center rounded-lg border border-border px-3 text-center text-base font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {children}
    </summary>
  );
}

/* -------------------------------------------------------------
 * ทาง ก · ส่งต่อชั้นการรักษาที่สูงกว่า
 * ----------------------------------------------------------- */
function EvacOnwardForm({
  caseId,
  currentUnitName,
  units,
}: {
  caseId: string;
  currentUnitName: string;
  units: NextLegUnitOption[];
}) {
  const [state, formAction] = useActionState<LegActionState, FormData>(
    startNextLeg,
    {},
  );
  const id = useId();

  return (
    <form action={formAction} className="mt-3 space-y-4">
      <input type="hidden" name="caseId" value={caseId} />

      <div className="space-y-2">
        <label htmlFor={`${id}-to`} className="block text-sm font-semibold">
          หน่วยปลายทาง
        </label>
        <select id={`${id}-to`} name="toUnitId" required defaultValue="" className={FIELD}>
          <option value="" disabled>
            เลือกหน่วยปลายทาง
          </option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nameTh} · {ROLE_LEVEL_LABEL[u.roleLevel] ?? u.roleLevel}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          ต้นทางของทอดใหม่คือ {currentUnitName} โดยอัตโนมัติ
        </p>
      </div>

      {/* ปุ่มความเร่งด่วนหน้าตาเดียวกับขั้นที่ 2 ของฟอร์มผู้ส่ง เพื่อให้มือจำตำแหน่งได้ */}
      <fieldset className="space-y-2">
        <legend className="mb-2 block text-sm font-semibold">ความเร่งด่วน</legend>
        {SEND_PRECEDENCE.map((p) => (
          <label
            key={p}
            className="flex h-14 cursor-pointer items-center gap-3 rounded-lg border-2 border-border bg-background px-4 focus-within:ring-3 focus-within:ring-ring/50 has-checked:border-primary has-checked:bg-muted"
          >
            <input
              type="radio"
              name="precedence"
              value={p}
              required
              className="size-5"
            />
            <span className="text-base font-semibold">{PRECEDENCE[p].label}</span>
            <span className="ml-auto font-mono text-sm text-muted-foreground">
              {PRECEDENCE[p].term}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor={`${id}-tm`} className="block text-sm font-semibold">
          ยานพาหนะที่ขอ
        </label>
        <select id={`${id}-tm`} name="transportMode" defaultValue="" className={FIELD}>
          <option value="">ไม่ระบุ</option>
          {TRANSPORT_ORDER.map((t) => (
            <option key={t} value={t}>
              {TRANSPORT_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${id}-reason`} className="block text-sm font-semibold">
          เหตุผลที่ส่งต่อ
        </label>
        <textarea
          id={`${id}-reason`}
          name="reason"
          rows={3}
          maxLength={400}
          placeholder="เช่น ต้องผ่าตัดซึ่งเกินขีดความสามารถของหน่วย"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        />
        <p className="text-xs text-muted-foreground">
          บันทึกไว้กับทอดใหม่ ปลายทางถัดไปจะได้รู้ว่าเขาถูกส่งมาด้วยเหตุอะไร
        </p>
      </div>

      <ErrorNote message={state.error} />
      <SubmitButton>ส่งคำขอส่งต่อ</SubmitButton>
      <p className="text-center text-xs text-muted-foreground">
        ทอดใหม่จะขึ้นคิว “รอจัดรถ” ให้ชุดลำเลียงหรือศูนย์สั่งการจัดรถต่อ
      </p>
    </form>
  );
}

/* -------------------------------------------------------------
 * ทาง ข · ส่งคืนหน่วยต้นสังกัด
 * ----------------------------------------------------------- */
function ReturnToUnitForm({
  caseId,
  originUnitName,
}: {
  caseId: string;
  originUnitName: string;
}) {
  const [state, formAction] = useActionState<LegActionState, FormData>(
    dischargeToUnit,
    {},
  );
  const id = useId();

  return (
    <form action={formAction} className="mt-3 space-y-4">
      <input type="hidden" name="caseId" value={caseId} />

      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
        <span className="font-semibold">ส่งคืน · </span>
        {originUnitName}
      </p>

      <fieldset className="space-y-2">
        <legend className="mb-2 block text-sm font-semibold">ผลการรักษา</legend>
        {OUTCOME_VALUES.map((o: CaseOutcome) => (
          <label
            key={o}
            className="flex h-14 cursor-pointer items-center gap-3 rounded-lg border-2 border-border bg-background px-4 focus-within:ring-3 focus-within:ring-ring/50 has-checked:border-primary has-checked:bg-muted"
          >
            <input type="radio" name="outcome" value={o} required className="size-5" />
            <span className="text-base font-semibold">{OUTCOME_LABEL[o]}</span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor={`${id}-icd`} className="block text-sm font-semibold">
          รหัส ICD-10 <span className="font-normal text-muted-foreground">(ถ้ามี)</span>
        </label>
        <input
          id={`${id}-icd`}
          name="icd10"
          maxLength={10}
          placeholder="เช่น S81.0"
          className={cn(FIELD, "font-mono uppercase")}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={`${id}-fb`} className="block text-sm font-semibold">
          ข้อมูลย้อนกลับถึงหน่วยต้นทาง
        </label>
        <textarea
          id={`${id}-fb`}
          name="feedbackNote"
          rows={3}
          maxLength={1000}
          placeholder="เช่น พักงานเบา 7 วัน · นัดตัดไหม 10 วัน"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        />
        <p className="text-xs text-muted-foreground">
          เขตหน้าอ่านได้จากหน้าเคสนี้ — สิ่งที่ระบบเดิมไม่มีทางส่งกลับไปเลย
        </p>
      </div>

      <ErrorNote message={state.error} />
      <SubmitButton>บันทึกการส่งคืน</SubmitButton>
      <p className="text-center text-xs text-muted-foreground">
        ไม่เปิดทอดใหม่ — ผู้ป่วยรอรถเที่ยวหน้าที่หน่วยต้นทางส่งมาแล้วกลับไปด้วยกัน
      </p>
    </form>
  );
}

/* -------------------------------------------------------------
 * การ์ดรวม
 * ----------------------------------------------------------- */
export function SendPatientForm({
  caseId,
  currentUnitName,
  originUnitName,
  units,
}: {
  caseId: string;
  /** หน่วยที่ผู้ป่วยอยู่ตอนนี้ = ต้นทางของทอดใหม่ */
  currentUnitName: string;
  /** หน่วยที่ส่งผู้ป่วยมา = ปลายทางของการส่งคืน */
  originUnitName: string;
  units: NextLegUnitOption[];
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-lg font-semibold">ส่งผู้ป่วยออกจากหน่วยนี้</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          ถ้ายังรักษาอยู่ที่ {currentUnitName} ไม่ต้องทำอะไรตรงนี้
        </p>
      </div>

      <details>
        <Summary>ส่งต่อชั้นการรักษาที่สูงกว่า</Summary>
        <EvacOnwardForm
          caseId={caseId}
          currentUnitName={currentUnitName}
          units={units}
        />
      </details>

      <details>
        <Summary>ส่งคืนหน่วยต้นสังกัด</Summary>
        <ReturnToUnitForm caseId={caseId} originUnitName={originUnitName} />
      </details>
    </section>
  );
}

/* -------------------------------------------------------------
 * สรุปผลจำหน่าย — แทนที่ฟอร์มเมื่อบันทึกไปแล้ว
 *
 * ไม่แสดงฟอร์มซ้ำ เพราะ trigger set_case_form_timestamps ใน 0013
 * ตรึง disposed_at ไว้ที่ครั้งแรกเสมอ การกดซ้ำจึงไม่ได้อะไรเพิ่ม
 * มีแต่ทำให้คนเข้าใจผิดว่าจำหน่ายได้หลายครั้ง
 * ----------------------------------------------------------- */
export function DispositionSummary({
  outcome,
  destUnitName,
  icd10,
  feedbackNote,
}: {
  outcome: CaseOutcome;
  destUnitName: string | null;
  icd10: string | null;
  feedbackNote: string | null;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-triage-green bg-emerald-50 p-4">
      <h2 className="text-lg font-semibold">จำหน่ายผู้ป่วยแล้ว</h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-muted-foreground">ผลการรักษา</dt>
          <dd className="mt-0.5">{OUTCOME_LABEL[outcome]}</dd>
        </div>
        {destUnitName && (
          <div>
            <dt className="font-semibold text-muted-foreground">ส่งคืน</dt>
            <dd className="mt-0.5">{destUnitName}</dd>
          </div>
        )}
        {icd10 && (
          <div>
            <dt className="font-semibold text-muted-foreground">ICD-10</dt>
            <dd className="mt-0.5 font-mono">{icd10}</dd>
          </div>
        )}
      </dl>
      {feedbackNote && (
        <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <span className="font-semibold">ข้อมูลย้อนกลับถึงหน่วยต้นทาง · </span>
          {feedbackNote}
        </p>
      )}
    </section>
  );
}
