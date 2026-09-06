"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";

import { RoleGate } from "@/components/medrelay/role-gate";
import { cn } from "@/lib/utils";
import { startNextLeg, type LegActionState } from "./actions";

/**
 * ปุ่ม "ส่งทอดถัดไป" (F3 · Prompt 08)
 *
 * โผล่เฉพาะเมื่อทอดล่าสุดส่งมอบเสร็จแล้ว เพราะ workflow ใน PROJECT §4.2
 * ให้ผู้รับปลายทางเป็นคนตัดสินใจ "หลัง" รับมอบเสร็จว่าต้องส่งต่อหรือไม่
 * ผู้ป่วยจำนวนมากจบที่ทอดเดียว ถ้าปุ่มนี้เด่นเกินไปจะชวนให้เปิดทอดที่ไม่จำเป็น
 * จึงเริ่มด้วยปุ่มเงียบๆ แล้วค่อยกางฟอร์มเมื่อกด
 *
 * ต้นทางของทอดใหม่คือปลายทางของทอดเดิมเสมอ — action เป็นคนคิดให้
 * ที่นี่จึงมีให้เลือกแค่ปลายทางช่องเดียว
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

function SubmitButton() {
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
      {pending ? "กำลังเปิดทอด…" : "เปิดทอดถัดไป"}
    </button>
  );
}

export function NextLegForm({
  caseId,
  currentUnitName,
  units,
}: {
  caseId: string;
  /** หน่วยที่ผู้ป่วยอยู่ตอนนี้ = ต้นทางของทอดใหม่ */
  currentUnitName: string;
  units: NextLegUnitOption[];
}) {
  const [state, formAction] = useActionState<LegActionState, FormData>(
    startNextLeg,
    {},
  );
  const id = useId();

  return (
    <RoleGate roles={["receiver", "sender", "monitor"]}>
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">ต้องส่งต่อชั้นการรักษาถัดไปหรือไม่</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          ถ้าผู้ป่วยจบการรักษาที่ {currentUnitName} แล้ว ไม่ต้องทำอะไรต่อ
        </p>

        {/* details ของ HTML แท้ — เปิดปิดได้โดยไม่ต้องพึ่ง JavaScript
            และฟอร์มยังอยู่ใน DOM เสมอ จึงทดสอบด้วยการ POST ตรงได้ */}
        <details className="mt-4 group">
          <summary className="flex h-12 cursor-pointer list-none items-center justify-center rounded-lg border border-border text-base font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            ส่งทอดถัดไป
          </summary>

          <form action={formAction} className="mt-3 space-y-3">
            <input type="hidden" name="caseId" value={caseId} />

            <div className="space-y-2">
              <label htmlFor={`${id}-to`} className="block text-sm font-semibold">
                หน่วยปลายทางของทอดถัดไป
              </label>
              <select
                id={`${id}-to`}
                name="toUnitId"
                required
                defaultValue=""
                className={cn(
                  "h-12 w-full rounded-lg border border-border bg-background px-3 text-base",
                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                )}
              >
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

            {state.error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive bg-red-50 px-3 py-2 text-sm font-medium text-destructive"
              >
                {state.error}
              </p>
            )}

            <SubmitButton />
          </form>
        </details>
      </section>
    </RoleGate>
  );
}
