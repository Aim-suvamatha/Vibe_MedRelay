"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TriageDot } from "@/components/medrelay/triage-dot";
import { PRECEDENCE, PRECEDENCE_ORDER, TRIAGE, TRIAGE_ORDER } from "@/lib/triage";
import { cn } from "@/lib/utils";
import { createEvacRequest } from "./actions";
import {
  AVPU_LABEL,
  MOBILITY_LABEL,
  TRANSPORT_LABEL,
  type EvacRequestState,
} from "./schema";

/**
 * ฟอร์มขอส่งกลับ (F1 · Prompt 07)
 *
 * ลำดับช่องเรียงตามลำดับที่ผู้ใช้คิดจริง ไม่ใช่ตามลำดับคอลัมน์ในฐานข้อมูล
 *   1. ผู้ป่วยเป็นอย่างไร  2. เร่งด่วนแค่ไหน  3. ส่งไปไหน  4. วัดอะไรได้บ้าง
 * เสนารักษ์ที่หน้างานเห็นผู้ป่วยก่อน แล้วค่อยตัดสินความเร่งด่วน แล้วค่อยคิดเรื่องปลายทาง
 * ถ้าเรียงกลับกันเขาจะต้องเลื่อนขึ้นลงหลายรอบระหว่างกรอก
 *
 * ⚠ ขนาดปุ่มและช่องกรอกใช้ h-14 (56px) กับ h-12 (48px) เท่านั้น
 *   ห้ามสร้าง token ชื่อ h-touch ใหม่ — shadcn import cn จาก "cn" ตรงๆ
 *   คลาสที่มันไม่รู้จักจะไม่ถูกตัดทิ้ง แล้ว h-8 เดิมจะหลุดออกมาปนกัน (HANDOFF §5 ข้อ 8)
 */

export type UnitOption = {
  id: string;
  code: string;
  nameTh: string;
  roleLevel: string;
};

export type PickupPointOption = {
  id: string;
  name: string;
  gridRef: string | null;
  note: string | null;
};

const ROLE_LEVEL_LABEL: Record<string, string> = {
  role_1: "ชั้น 1",
  role_2: "ชั้น 2",
  role_3: "ชั้น 3",
  role_4: "ชั้น 4",
};

/** หัวข้อย่อยของแต่ละก้อน — ตัวเลขนำหน้าช่วยให้พูดกันรู้เรื่องว่า "ติดอยู่ข้อ 3" */
function Section({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-baseline gap-2">
        <span className="font-mono text-sm font-semibold text-muted-foreground">
          {step}
        </span>
        <h2 className="text-lg leading-tight font-semibold">{title}</h2>
      </div>
      {hint && <p className="-mt-2 mb-4 text-sm text-muted-foreground">{hint}</p>}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** select ของ shadcn เป็น Radix ซึ่งไม่ส่งค่าเข้า FormData เอง — ใช้ select จริงจะตรงไปตรงมากว่า */
function NativeSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "h-14 w-full rounded-lg text-base font-semibold",
        "bg-primary text-primary-foreground",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-60",
      )}
    >
      {/* กันกดซ้ำชั้นแรก — ชั้นที่กันได้จริงคือ UNIQUE (client_uuid) ในฐานข้อมูล */}
      {pending ? "กำลังส่งคำขอ…" : "ส่งคำขอ"}
    </button>
  );
}

export function SenderForm({
  units,
  pickupPoints,
  originUnitName,
}: {
  units: UnitOption[];
  pickupPoints: PickupPointOption[];
  originUnitName: string;
}) {
  const [state, formAction] = useActionState<EvacRequestState, FormData>(
    createEvacRequest,
    {},
  );
  const id = useId();
  const err = state.fieldErrors ?? {};

  /**
   * สร้างครั้งเดียวตอนเปิดฟอร์ม แล้วคงค่าเดิมไว้ตลอดอายุของ component
   * ถ้าส่งไม่สำเร็จแล้วผู้ใช้กดใหม่ ค่านี้ต้องเป็นค่าเดิม
   * ฐานข้อมูลจึงรู้ว่าเป็นคำขอเดียวกัน ไม่ใช่คำขอใหม่ที่บังเอิญเหมือนกัน
   */
  const [clientUuid] = useState(() => crypto.randomUUID());

  const [precedence, setPrecedence] = useState<string>("");

  /**
   * datetime-local ไม่มี timezone ติดมาด้วย — ต้องแปลงที่ browser
   * เพราะ browser รู้ timezone ของผู้ใช้จริง ส่วน server บน Vercel เป็น UTC
   * ถ้าปล่อยให้ server แปลง เวลาจะเพี้ยนไป 7 ชั่วโมงสำหรับผู้ใช้ในไทย
   */
  const [onsetLocal, setOnsetLocal] = useState("");
  const onsetIso = useMemo(() => {
    if (!onsetLocal) return "";
    const d = new Date(onsetLocal);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }, [onsetLocal]);

  // ห้ามเลือกเวลาในอนาคต — ตัดปัญหาตั้งแต่ที่ตัวเลือกของ browser
  const nowLocal = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }, []);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="clientUuid" value={clientUuid} />
      <input type="hidden" name="symptomOnsetAt" value={onsetIso} />

      {/* ── 1. ผู้ป่วยเป็นอย่างไร ─────────────────────────── */}
      <Section step={1} title="ผู้ป่วย">
        <Field
          label="อาการสำคัญ"
          htmlFor={`${id}-cc`}
          error={err.chiefComplaint}
          hint="สิ่งที่ทำให้ต้องส่งกลับ เขียนสั้นๆ ให้ปลายทางเตรียมตัวได้"
        >
          <Textarea
            id={`${id}-cc`}
            name="chiefComplaint"
            required
            rows={3}
            maxLength={500}
            placeholder="เช่น แผลกระสุนต้นขาขวา เลือดออกมาก"
            className="text-base"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="จำนวนผู้ป่วย"
            htmlFor={`${id}-count`}
            error={err.patientCount}
          >
            <Input
              id={`${id}-count`}
              name="patientCount"
              type="number"
              inputMode="numeric"
              defaultValue={1}
              min={1}
              max={50}
              required
              className="h-12 text-base"
            />
          </Field>

          <Field
            label="นามสมมติ"
            htmlFor={`${id}-alias`}
            error={err.patientAlias}
            hint="ไม่บังคับ"
          >
            <Input
              id={`${id}-alias`}
              name="patientAlias"
              maxLength={80}
              placeholder="เช่น ผู้ป่วย ก"
              className="h-12 text-base"
            />
          </Field>
        </div>

        {/* ย้ำกฎที่จุดที่ผู้ใช้กำลังจะพิมพ์ ไม่ใช่ไว้ท้ายหน้าที่ไม่มีใครอ่าน (AI_RULES §3.1) */}
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          ระบบนี้ไม่เก็บชื่อจริง เลขบัตรประชาชน หมู่เลือด หรือประวัติแพ้ยา
          ใช้นามสมมติเท่านั้น
        </p>

        <Field
          label="กลไกการบาดเจ็บ / เหตุการณ์"
          htmlFor={`${id}-mech`}
          error={err.mechanism}
          hint="ไม่บังคับ"
        >
          <Textarea
            id={`${id}-mech`}
            name="mechanism"
            rows={2}
            maxLength={500}
            placeholder="เช่น ถูกยิงขณะลาดตระเวน เวลาประมาณ 05.30 น."
            className="text-base"
          />
        </Field>

        <Field
          label="เวลาที่เริ่มมีอาการ"
          htmlFor={`${id}-onset`}
          error={err.symptomOnsetAt}
          hint="ไม่บังคับ · เป็นเวลาในอดีตที่คุณทราบเอง เวลาอื่นทั้งหมดระบบจับเองจากการกดปุ่มจริง"
        >
          <Input
            id={`${id}-onset`}
            type="datetime-local"
            value={onsetLocal}
            max={nowLocal}
            onChange={(e) => setOnsetLocal(e.target.value)}
            className="h-12 text-base"
          />
        </Field>
      </Section>

      {/* ── 2. เร่งด่วนแค่ไหน ────────────────────────────── */}
      <Section
        step={2}
        title="ความเร่งด่วน"
        hint="เป็นปุ่มใหญ่สามปุ่มเพราะต้องกดได้เร็วขณะสวมถุงมือ"
      >
        <fieldset>
          <legend className="sr-only">ระดับความเร่งด่วน</legend>
          <div className="grid gap-2">
            {PRECEDENCE_ORDER.map((p) => {
              const meta = PRECEDENCE[p];
              const t = TRIAGE[meta.triage];
              const selected = precedence === p;
              return (
                <label
                  key={p}
                  className={cn(
                    "flex h-14 cursor-pointer items-center gap-3 rounded-lg border-2 px-4",
                    "focus-within:ring-3 focus-within:ring-ring/50",
                    selected
                      ? t.solid
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="precedence"
                    value={p}
                    required
                    checked={selected}
                    onChange={() => setPrecedence(p)}
                    className="sr-only"
                  />
                  {/* รูปทรงกำกับสีเสมอ ผู้ใช้ตาบอดสีต้องแยกออกโดยไม่พึ่งสี */}
                  <TriageDot value={meta.triage} size="md" showLabel={false} />
                  <span className="text-base font-semibold">{meta.label}</span>
                  <span
                    className={cn(
                      "ml-auto font-mono text-sm",
                      selected ? "opacity-80" : "text-muted-foreground",
                    )}
                  >
                    {meta.term}
                  </span>
                </label>
              );
            })}
          </div>
          {err.precedence && (
            <p role="alert" className="mt-2 text-sm font-medium text-destructive">
              {err.precedence}
            </p>
          )}
        </fieldset>

        <Field
          label="ระดับ triage"
          htmlFor={`${id}-triage`}
          error={err.triage}
          hint="ไม่บังคับ · คนละเรื่องกับความเร่งด่วน — triage คือความหนักของอาการ"
        >
          <NativeSelect id={`${id}-triage`} name="triage" defaultValue="">
            <option value="">ยังไม่ระบุ</option>
            {TRIAGE_ORDER.map((c) => (
              <option key={c} value={c}>
                {TRIAGE[c].label} · {TRIAGE[c].hint}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </Section>

      {/* ── 3. ส่งไปไหน ──────────────────────────────────── */}
      <Section step={3} title="ปลายทางและจุดรับ">
        <Field
          label="หน่วยปลายทาง"
          htmlFor={`${id}-to`}
          error={err.toUnitId}
          hint={`ต้นทางคือ ${originUnitName} — เลือกหน่วยอื่นเท่านั้น`}
        >
          <NativeSelect id={`${id}-to`} name="toUnitId" required defaultValue="">
            <option value="" disabled>
              เลือกหน่วยปลายทาง
            </option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nameTh} · {ROLE_LEVEL_LABEL[u.roleLevel] ?? u.roleLevel}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field
          label="จุดรับผู้ป่วย"
          htmlFor={`${id}-pickup`}
          error={err.pickupPointId}
          hint="เลือกจากจุดที่กำหนดไว้ล่วงหน้า · ระบบไม่อ่านพิกัดจากเครื่องของคุณ"
        >
          <NativeSelect
            id={`${id}-pickup`}
            name="pickupPointId"
            defaultValue=""
          >
            <option value="">ยังไม่ระบุ</option>
            {pickupPoints.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.gridRef ? ` · ${p.gridRef}` : ""}
              </option>
            ))}
          </NativeSelect>
          {pickupPoints.length === 0 && (
            <p className="text-xs text-muted-foreground">
              หน่วยของคุณยังไม่มีจุดรับที่กำหนดไว้ ใช้ช่องจุดสังเกตด้านล่างแทนได้
            </p>
          )}
        </Field>

        <Field
          label="จุดสังเกตหน้างาน"
          htmlFor={`${id}-marking`}
          error={err.pickupMarking}
          hint="ไม่บังคับ · เช่น ควันสีม่วง หรือ ไฟกะพริบ"
        >
          <Input
            id={`${id}-marking`}
            name="pickupMarking"
            maxLength={200}
            className="h-12 text-base"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="ยานพาหนะที่ขอ"
            htmlFor={`${id}-transport`}
            error={err.transportMode}
            hint="ไม่บังคับ"
          >
            <NativeSelect
              id={`${id}-transport`}
              name="transportMode"
              defaultValue=""
            >
              <option value="">ให้ศูนย์สั่งการพิจารณา</option>
              {Object.entries(TRANSPORT_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field
            label="ประเภทผู้ป่วย"
            htmlFor={`${id}-mobility`}
            error={err.patientMobility}
            hint="ไม่บังคับ"
          >
            <NativeSelect
              id={`${id}-mobility`}
              name="patientMobility"
              defaultValue=""
            >
              <option value="">ยังไม่ระบุ</option>
              {Object.entries(MOBILITY_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </Section>

      {/* ── 4. ประเมินแรกรับ ─────────────────────────────── */}
      <Section
        step={4}
        title="ประเมินแรกรับ"
        hint="ทุกช่องไม่บังคับ — หน้างานอาจยังวัดอะไรไม่ได้เลย ถ้าเว้นว่างทั้งหมดระบบจะไม่สร้างแถวประเมินเปล่า"
      >
        <Field label="ระดับความรู้สึกตัว" htmlFor={`${id}-avpu`} error={err.avpu}>
          <NativeSelect id={`${id}-avpu`} name="avpu" defaultValue="">
            <option value="">ยังไม่ประเมิน</option>
            {Object.entries(AVPU_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="GCS" htmlFor={`${id}-gcs`} error={err.gcs}>
            <Input
              id={`${id}-gcs`}
              name="gcs"
              type="number"
              inputMode="numeric"
              min={3}
              max={15}
              placeholder="3–15"
              className="h-12 font-mono text-base"
            />
          </Field>
          <Field label="ชีพจร (/นาที)" htmlFor={`${id}-pulse`} error={err.pulse}>
            <Input
              id={`${id}-pulse`}
              name="pulse"
              type="number"
              inputMode="numeric"
              min={0}
              max={300}
              className="h-12 font-mono text-base"
            />
          </Field>
          <Field label="อัตราหายใจ (/นาที)" htmlFor={`${id}-rr`} error={err.respRate}>
            <Input
              id={`${id}-rr`}
              name="respRate"
              type="number"
              inputMode="numeric"
              min={0}
              max={80}
              className="h-12 font-mono text-base"
            />
          </Field>
          <Field label="ความดันตัวบน" htmlFor={`${id}-sbp`} error={err.sbp}>
            <Input
              id={`${id}-sbp`}
              name="sbp"
              type="number"
              inputMode="numeric"
              min={0}
              max={300}
              className="h-12 font-mono text-base"
            />
          </Field>
          <Field label="ความดันตัวล่าง" htmlFor={`${id}-dbp`} error={err.dbp}>
            <Input
              id={`${id}-dbp`}
              name="dbp"
              type="number"
              inputMode="numeric"
              min={0}
              max={200}
              className="h-12 font-mono text-base"
            />
          </Field>
          <Field label="SpO₂ (%)" htmlFor={`${id}-spo2`} error={err.spo2}>
            <Input
              id={`${id}-spo2`}
              name="spo2"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              className="h-12 font-mono text-base"
            />
          </Field>
        </div>

        <Field
          label="สิ่งที่ตรวจพบเพิ่มเติม"
          htmlFor={`${id}-findings`}
          error={err.findings}
        >
          <Textarea
            id={`${id}-findings`}
            name="findings"
            rows={3}
            maxLength={1000}
            className="text-base"
          />
        </Field>
      </Section>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive bg-red-50 px-3 py-2.5 text-sm font-medium text-destructive"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />

      <p className="pb-4 text-center text-xs text-muted-foreground">
        เวลาที่ร้องขอจะถูกบันทึกโดยระบบเมื่อกดปุ่มนี้
      </p>
    </form>
  );
}
