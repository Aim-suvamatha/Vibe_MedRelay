"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";

import { RelativeTime } from "@/components/medrelay/relative-time";
import { RoleGate } from "@/components/medrelay/role-gate";
import type { LegStatus } from "@/lib/enums";
import { LEG_FLOW, LEG_STATUS_LABEL, nextStep, stepIndex } from "@/lib/leg-flow";
import { cn } from "@/lib/utils";
import { advanceLeg, dispatchLeg, type LegActionState } from "./actions";

/**
 * การ์ดหนึ่งทอด — เส้นเวลา 6 ขั้น + ปุ่มของขั้นถัดไปหนึ่งปุ่ม (F3 · Prompt 08)
 *
 * ★ แสดงปุ่มของขั้นถัดไป "ขั้นเดียว" เสมอ ไม่ใช่ทั้ง 6 ปุ่ม
 *   constraint leg_time_order ปฏิเสธการข้ามขั้นอยู่แล้ว ปุ่มที่กดแล้วพังแน่ๆ
 *   จึงไม่ควรมีอยู่บนหน้าจอตั้งแต่แรก — ผู้ใช้ในสนามไม่มีเวลามาเดาว่าปุ่มไหนกดได้
 *
 * ★ ไม่มีช่องกรอกเวลาที่ใดในไฟล์นี้ (Prompt 04)
 *   เวลาที่เห็นบนเส้นเวลาเป็นค่าที่อ่านมาจาก database ล้วนๆ
 *
 * ★ ขนาดปุ่มใช้ h-14 กับ h-12 เท่านั้น ห้ามสร้าง token h-touch (HANDOFF §5 ข้อ 8)
 */

export type LegView = {
  id: string;
  legNo: number;
  status: LegStatus;
  fromUnit: string;
  toUnit: string;
  vehicle: { callSign: string; type: string } | null;
  transporter: string | null;
  receiver: string | null;
  times: Partial<Record<(typeof LEG_FLOW)[number]["timeKey"], string | null>>;
  docsOk: boolean | null;
  propertyOk: boolean | null;
  missingNote: string | null;
  delayReason: string | null;
  note: string | null;
};

export type VehicleOption = {
  id: string;
  callSign: string;
  type: string;
  unitName: string;
};

export type PersonOption = {
  id: string;
  name: string;
  unitName: string;
};

const VEHICLE_TYPE_LABEL: Record<string, string> = {
  bls: "กู้ชีพพื้นฐาน",
  als: "กู้ชีพขั้นสูง",
  utility: "รถอเนกประสงค์",
  rotary: "เฮลิคอปเตอร์",
  fixed_wing: "อากาศยานปีกตรึง",
};

/** select ของ shadcn เป็น Radix ซึ่งไม่ส่งค่าเข้า FormData เอง — ใช้ select จริงตรงกว่า */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-12 w-full rounded-lg border border-border bg-background px-3 text-base",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function SubmitButton({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "quiet";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "h-14 w-full rounded-lg text-base font-semibold",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-60",
        variant === "primary"
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-background",
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

/* -------------------------------------------------------------
 * เส้นเวลา — ขั้นที่ผ่านแล้วมีเวลากำกับ ขั้นที่ยังไม่ถึงเป็นสีจาง
 * แยกสองสถานะด้วยรูปทรง (จุดทึบ/จุดกลวง) และข้อความ ไม่พึ่งสีอย่างเดียว
 * ----------------------------------------------------------- */
function Timeline({ leg }: { leg: LegView }) {
  const current = stepIndex(leg.status);

  return (
    <ol className="space-y-0">
      {LEG_FLOW.map((step, i) => {
        const at = leg.times[step.timeKey] ?? null;
        const done = at !== null;
        const isCurrent = i === current;
        const last = i === LEG_FLOW.length - 1;

        return (
          <li key={step.status} className="flex gap-3">
            <div className="flex w-4 shrink-0 flex-col items-center">
              <span
                aria-hidden
                className={cn(
                  "mt-1.5 size-3 shrink-0 rounded-full border-2",
                  done
                    ? "border-triage-green bg-triage-green"
                    : "border-border bg-background",
                  isCurrent && "ring-3 ring-ring/40",
                )}
              />
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    "w-0.5 flex-1",
                    done ? "bg-triage-green" : "bg-border",
                  )}
                />
              )}
            </div>

            <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-4")}>
              <p
                className={cn(
                  "text-sm leading-tight",
                  done ? "font-semibold" : "text-muted-foreground",
                )}
              >
                {step.label}
                {!done && <span className="sr-only"> — ยังไม่ถึงขั้นนี้</span>}
              </p>
              {at ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <RelativeTime value={at} />
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  รอ{step.actor}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------
 * ฟอร์มจัดรถ — ขั้นเดียวที่ต้องเลือกข้อมูลเพิ่ม ไม่ใช่แค่กดปุ่ม
 * ----------------------------------------------------------- */
function DispatchForm({
  leg,
  vehicles,
  transporters,
}: {
  leg: LegView;
  vehicles: VehicleOption[];
  transporters: PersonOption[];
}) {
  const [state, formAction] = useActionState<LegActionState, FormData>(
    dispatchLeg,
    {},
  );
  const id = useId();

  if (vehicles.length === 0 || transporters.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        ยังไม่มี{vehicles.length === 0 ? "รถว่าง" : "ผู้ลำเลียง"}
        ที่บัญชีของคุณมองเห็น การจัดรถต้องทำโดยศูนย์สั่งการ
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="legId" value={leg.id} />

      <div className="space-y-2">
        <label htmlFor={`${id}-veh`} className="block text-sm font-semibold">
          รถที่จัดให้
        </label>
        <NativeSelect id={`${id}-veh`} name="vehicleId" required defaultValue="">
          <option value="" disabled>
            เลือกรถ
          </option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.callSign} · {VEHICLE_TYPE_LABEL[v.type] ?? v.type} · {v.unitName}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${id}-tr`} className="block text-sm font-semibold">
          ผู้ลำเลียงที่รับผิดชอบ
        </label>
        <NativeSelect
          id={`${id}-tr`}
          name="transporterId"
          required
          defaultValue=""
        >
          <option value="" disabled>
            เลือกผู้ลำเลียง
          </option>
          {transporters.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.unitName}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">
          คนที่เลือกที่นี่คือคนที่จะกดขั้นถัดไปของทอดนี้ได้
        </p>
      </div>

      <ErrorNote message={state.error} />
      <SubmitButton>จัดรถ</SubmitButton>
    </form>
  );
}

/* -------------------------------------------------------------
 * ฟอร์มส่งมอบ — ขั้นสุดท้ายที่มีรายการตรวจตาม ทบ.466-903
 * ----------------------------------------------------------- */
function HandoverForm({ leg }: { leg: LegView }) {
  const [state, formAction] = useActionState<LegActionState, FormData>(
    advanceLeg,
    {},
  );
  const id = useId();
  const [docsOk, setDocsOk] = useState(true);
  const [propertyOk, setPropertyOk] = useState(true);
  const complete = docsOk && propertyOk;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="legId" value={leg.id} />
      <input type="hidden" name="target" value="completed" />

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">
          ตรวจก่อนส่งมอบ (ทบ.466-903)
        </legend>

        <label className="flex h-12 items-center gap-3 rounded-lg border border-border px-3">
          <input
            type="checkbox"
            name="docsOk"
            className="size-5"
            checked={docsOk}
            onChange={(e) => setDocsOk(e.target.checked)}
          />
          <span className="text-base">เอกสารประจำเคสครบ</span>
        </label>

        <label className="flex h-12 items-center gap-3 rounded-lg border border-border px-3">
          <input
            type="checkbox"
            name="propertyOk"
            className="size-5"
            checked={propertyOk}
            onChange={(e) => setPropertyOk(e.target.checked)}
          />
          <span className="text-base">สิ่งของและอาวุธประจำกายครบ</span>
        </label>
      </fieldset>

      {!complete && (
        <div className="space-y-2">
          <label
            htmlFor={`${id}-missing`}
            className="block text-sm font-semibold"
          >
            ขาดอะไรบ้าง
          </label>
          <textarea
            id={`${id}-missing`}
            name="missingNote"
            required
            rows={2}
            maxLength={500}
            placeholder="เช่น ไม่มีบัตรส่งสิ่งของคนไข้"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
          <p className="text-xs text-muted-foreground">
            บันทึกไว้เพื่อให้ตามของคืนได้ ไม่ได้ขัดขวางการส่งมอบ
          </p>
        </div>
      )}

      <ErrorNote message={state.error} />
      <SubmitButton>ส่งมอบผู้ป่วย</SubmitButton>
    </form>
  );
}

/* -------------------------------------------------------------
 * ปุ่มขั้นกลาง — กดปุ่มเดียวจบ ไม่ต้องกรอกอะไรเพิ่ม
 * ----------------------------------------------------------- */
function AdvanceForm({
  leg,
  target,
  label,
}: {
  leg: LegView;
  target: LegStatus;
  label: string;
}) {
  const [state, formAction] = useActionState<LegActionState, FormData>(
    advanceLeg,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="legId" value={leg.id} />
      <input type="hidden" name="target" value={target} />
      <ErrorNote message={state.error} />
      <SubmitButton>{label}</SubmitButton>
    </form>
  );
}

export function LegCard({
  leg,
  vehicles,
  transporters,
  isLast,
}: {
  leg: LegView;
  vehicles: VehicleOption[];
  transporters: PersonOption[];
  /** ทอดสุดท้ายกางเส้นเวลาไว้เลย ทอดเก่าพับไว้ให้หน้าจอไม่ยาวเกินจอมือถือ */
  isLast: boolean;
}) {
  const next = nextStep(leg.status);
  const done = leg.status === "completed";

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3">
        <span className="font-mono text-sm font-semibold text-muted-foreground">
          ทอด {leg.legNo}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {leg.fromUnit} → {leg.toUnit}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 text-sm font-semibold",
            done
              ? "border-triage-green bg-emerald-50 text-triage-green"
              : leg.status === "cancelled"
                ? "border-neutral-400 bg-neutral-100 text-neutral-900"
                : "border-triage-yellow-edge bg-amber-50 text-triage-yellow-edge",
          )}
        >
          {LEG_STATUS_LABEL[leg.status]}
        </span>
      </header>

      <div className="space-y-4 px-4 py-4">
        {(leg.vehicle || leg.transporter || leg.receiver) && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {leg.vehicle && (
              <div>
                <dt className="font-semibold text-muted-foreground">รถ</dt>
                <dd className="mt-0.5 font-mono">{leg.vehicle.callSign}</dd>
              </div>
            )}
            {leg.transporter && (
              <div>
                <dt className="font-semibold text-muted-foreground">
                  ผู้ลำเลียง
                </dt>
                <dd className="mt-0.5">{leg.transporter}</dd>
              </div>
            )}
            {leg.receiver && (
              <div>
                <dt className="font-semibold text-muted-foreground">ผู้รับ</dt>
                <dd className="mt-0.5">{leg.receiver}</dd>
              </div>
            )}
          </dl>
        )}

        {/* details ของ HTML แท้ — พับได้โดยไม่ต้องพึ่ง JavaScript
            เส้นเวลาอยู่ใน DOM เสมอ screen reader จึงหาเจอแม้ยังพับอยู่ */}
        <details open={isLast}>
          <summary className="flex h-12 cursor-pointer list-none items-center justify-center rounded-lg border border-border text-sm font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            เส้นเวลาของทอดนี้
          </summary>
          <div className="mt-3">
            <Timeline leg={leg} />
          </div>
        </details>

        {(leg.missingNote || leg.delayReason || leg.note) && (
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            {leg.missingNote && (
              <p>
                <span className="font-semibold">ของที่ขาด · </span>
                {leg.missingNote}
              </p>
            )}
            {leg.delayReason && (
              <p>
                <span className="font-semibold">เหตุที่ล่าช้า · </span>
                {leg.delayReason}
              </p>
            )}
            {leg.note && (
              <p>
                <span className="font-semibold">บันทึก · </span>
                {leg.note}
              </p>
            )}
          </div>
        )}

        {/* ปุ่มของขั้นถัดไป — ขั้นเดียวเท่านั้น */}
        {next?.status === "dispatched" && (
          <RoleGate
            roles={["monitor"]}
            fallback={
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                รอศูนย์สั่งการจัดรถ
              </p>
            }
          >
            <DispatchForm
              leg={leg}
              vehicles={vehicles}
              transporters={transporters}
            />
          </RoleGate>
        )}

        {next && next.status !== "dispatched" && next.status !== "completed" && (
          <AdvanceForm leg={leg} target={next.status} label={next.action} />
        )}

        {next?.status === "completed" && <HandoverForm leg={leg} />}

        {next && (
          <p className="text-center text-xs text-muted-foreground">
            ขั้นถัดไปคือ “{next.label}” · ผู้กดคือ{next.actor}
          </p>
        )}
      </div>
    </section>
  );
}
