"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { TriageDot } from "@/components/medrelay/triage-dot";
import { PRECEDENCE, PRECEDENCE_ORDER, ROLE_LEVEL_LABEL, TRIAGE } from "@/lib/triage";
import { cn } from "@/lib/utils";
import { createEvacRequest } from "../actions";
import {
  AIRWAY_LABEL,
  AVPU_LABEL,
  BRANCH_LABEL,
  CATEGORY_LABEL,
  CHEST_LABEL,
  GEAR_LABEL,
  GEAR_VALUES,
  NBC_LABEL,
  RANK_GROUP_LABEL,
  REPORT_CATEGORY_LABEL,
  REPORT_CATEGORY_ORDER,
  SECURITY_LABEL,
  TRANSPORT_LABEL,
  TRANSPORT_ORDER,
  WOUND_LABEL,
  type EvacRequestState,
  type EvacRequestValues,
} from "../schema";
import {
  CheckRow,
  Field,
  Fold,
  NativeSelect,
  NumInput,
  SubHead,
  TextArea,
  TextInput,
} from "./fields";
import { InjuryMap } from "./injury-map";
import { PickupField, type PickupPointOption } from "./pickup-field";
import { PropertyList } from "./property-list";
import { TreatmentList } from "./treatment-list";

/**
 * ฟอร์มขอส่งกลับแบบกรอกทีละขั้น 7 ขั้น (คำสั่งเจ้าของโครงการ 8 ก.ย. 2569)
 *
 * ⚠⚠ กับดักที่ทำให้ข้อมูลหกขั้นแรกหายทั้งหมด ⚠⚠
 *
 *   ระบบส่งด้วย <form action={serverAction}> ซึ่งประกอบ FormData
 *   จาก **element ที่ยังอยู่ใน DOM จริงเท่านั้น**
 *   ถ้าเขียนแบบธรรมชาติว่า {step === 3 && <Step3 />} พอกดส่งที่ขั้นที่ 7
 *   FormData จะมีแต่ช่องของขั้นที่ 7 ขั้น 1–6 หายเงียบโดยไม่มี error ใดๆ
 *
 *   ทางที่ถูกคือ **หนึ่ง <form> ครอบทั้ง 7 ขั้น ทุกขั้น mount อยู่ตลอด**
 *   ซ่อนด้วย hidden attribute ค่าทั้งหมดจึงยังอยู่ใน FormData
 *   และการส่งยังเป็น RPC ครั้งเดียวที่ atomic เหมือนเดิม
 *   ไม่ต้องเก็บ draft ลง sessionStorage หรือสร้างแถวค้างในฐานข้อมูล
 *
 *   ผลข้างเคียงสามข้อที่ตามมาและถูกจัดการไว้แล้วในไฟล์นี้
 *     1. ต้องมี noValidate บน <form> และห้ามพึ่ง required
 *        ★ ไม่ใช่แค่ required — min / max / step / type=email ก็บล็อกเหมือนกันทุกตัว
 *          ช่องที่ซ่อนอยู่ focus ไม่ได้ browser จึงเงียบสนิท ไม่มีกล่องบอกว่าช่องไหนผิด
 *          ผู้ใช้เห็นแค่ "กดปุ่มส่งแล้วไม่มีอะไรเกิดขึ้น" (บั๊กจริง 8 ก.ย. 2569)
 *        attribute พวกนี้ยังอยู่ได้ในฐานะคำใบ้ของ UI เช่นคุมปุ่มขึ้นลงของ number
 *        แต่ตัวตัดสินว่าผ่านหรือไม่ผ่านคือ zod ฝั่ง server ที่เดียว
 *     2. ปุ่ม "ถัดไป" ต้องเป็น type="button" ทุกปุ่ม
 *        มีเพียงปุ่มขั้นที่ 7 ที่เป็น submit ไม่งั้น Enter บนคีย์บอร์ดจะส่งตั้งแต่ขั้น 1
 *     3. เมื่อ server ตอบ fieldErrors ต้องเด้งไปขั้นที่มีช่องผิดเอง
 *        ไม่งั้นผู้ใช้เห็นแค่ "กรอกข้อมูลไม่ครบ" แต่หาช่องไม่เจอ
 */

export type UnitOption = {
  id: string;
  code: string;
  nameTh: string;
  roleLevel: string;
};

const STEPS = [
  "ผู้ป่วย",
  "ความเร่งด่วน",
  "ปลายทางและจุดรับ",
  "ประเมินแรกรับ",
  "เหตุการณ์และการบาดเจ็บ",
  "การรักษาที่ให้แล้ว",
  "บัญชีสิ่งของคนไข้",
] as const;

/**
 * ช่องไหนอยู่ขั้นไหน — ใช้เด้งกลับไปขั้นที่มีช่องผิด
 * ช่องที่ไม่อยู่ในตารางนี้ถือว่าอยู่ขั้นที่ 1 ซึ่งเป็นค่าที่ปลอดภัยที่สุด
 * เพราะผู้ใช้จะได้เดินผ่านทุกขั้นอีกรอบแทนที่จะไปโผล่ขั้นที่ไม่เกี่ยว
 */
const FIELD_STEP: Partial<Record<keyof EvacRequestValues, number>> = {
  precedence: 2,
  toUnitId: 3,
  pickupPointId: 3,
  pickupGrid: 3,
  transportMode: 3,
  patientCategory: 3,
  sbp: 4,
  dbp: 4,
  pulse: 4,
  respRate: 4,
  spo2: 4,
  temperature: 4,
  avpu: 4,
  gcs: 4,
  findings: 4,
  onDuty: 5,
  hostileAction: 5,
  reportCategory: 5,
  patientRankGroup: 5,
  operationType: 5,
  operatingBase: 5,
  injuryPlace: 5,
  protectiveGear: 5,
  injurySites: 5,
  airwayStatus: 5,
  chestStatus: 5,
  woundStatus: 5,
  securityStatus: 5,
  nbcStatus: 5,
  otherNote: 5,
  treatments: 6,
  propertyItems: 7,
};

/** ช่องของ "ข้อมูลผู้ป่วย" ที่พับไว้ — ถ้าผิดต้องกางก้อนนั้นออกด้วย */
const CASUALTY_FIELDS: readonly (keyof EvacRequestValues)[] = [
  "rankTh",
  "firstName",
  "lastName",
  "serviceNumber",
  "branch",
  "ageYears",
  "nationality",
  "ethnicity",
  "bloodGroup",
  "rh",
  "drugAllergy",
  "foodAllergy",
  "chronicConditions",
  "pastHistory",
  "regularMeds",
  "weightKg",
  "heightCm",
  "phone",
];

/** "ตอนนี้" ในรูปแบบที่ input datetime-local รับได้ — เวลาท้องถิ่นของเครื่อง ไม่ใช่ UTC */
function currentLocalMinute(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "h-14 rounded-lg text-base font-semibold",
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
  const [step, setStep] = useState(1);

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

  /**
   * เพดานของช่องเวลาคือ "ตอนนี้" ซึ่งเดินไปเรื่อยๆ ระหว่างที่ผู้ใช้กรอกอีกหกขั้น
   * ถ้าคำนวณครั้งเดียวตอนเปิดฟอร์ม พอผู้ใช้ย้อนกลับมาเลือกเวลาปัจจุบันจริง
   * ค่าจะเกินเพดานที่ค้างอยู่ กลายเป็นช่องที่ไม่ผ่าน constraint ทั้งที่ผู้ใช้ทำถูก
   * จึงรีเฟรชตอนที่ผู้ใช้จิ้มช่อง ซึ่งเป็นจังหวะก่อนเลือกค่าเสมอ
   */
  const [nowLocal, setNowLocal] = useState(currentLocalMinute);

  /**
   * ห้าช่องประวัติที่เกือบทุกเคสตอบว่า "ไม่มี" เหมือนกันหมด
   *
   * เว้นว่างแทน "ไม่มี" ไม่ได้ — ปลายทางต้องแยกออกระหว่าง "ถามแล้วไม่มี"
   * กับ "ยังไม่ได้ถาม" (เหตุผลเต็มอยู่ใน hint ของช่องแพ้ยา)
   * เสนารักษ์จึงต้องพิมพ์คำเดิมห้าครั้งทุกเคส ปุ่มนี้ยุบเหลือกดครั้งเดียว
   *
   * ★ ต้องเป็น controlled ทั้งห้าช่อง ปุ่มถึงจะเขียนค่าลงไปได้
   *   ถ้าปล่อยเป็น uncontrolled แล้วไปยัดค่าผ่าน ref ค่าจะไม่ตรงกับสิ่งที่ React คิด
   */
  const [history, setHistory] = useState({
    drugAllergy: "",
    foodAllergy: "",
    chronicConditions: "",
    pastHistory: "",
    regularMeds: "",
  });

  /** ทับทุกช่องเสมอ ไม่ว่าจะมีข้อความอยู่ก่อนหรือไม่ (คำสั่งเจ้าของโครงการ 8 ก.ย. 2569) */
  function fillHistoryNone() {
    setHistory({
      drugAllergy: "ไม่มี",
      foodAllergy: "ไม่มี",
      chronicConditions: "ไม่มี",
      pastHistory: "ไม่มี",
      regularMeds: "ไม่มี",
    });
  }

  /**
   * เด้งไปขั้นที่มีช่องผิดทันทีที่ server ตอบกลับ
   *
   * ★ ปรับ state ระหว่าง render ไม่ใช่ใน useEffect
   *   นี่คือรูปแบบที่ React แนะนำสำหรับ "state ที่ต้องเปลี่ยนเมื่อ props เปลี่ยน"
   *   ถ้าทำใน effect ผู้ใช้จะเห็นขั้นเดิมวาบหนึ่งเฟรมก่อนจะเด้ง
   *   ซึ่งกับฟอร์มที่เพิ่งแจ้งว่ากรอกผิดจะยิ่งสับสน
   *   React จะทิ้งผลของ render รอบนี้แล้ว render ใหม่ทันทีโดยไม่วาดลงจอ
   *
   * เทียบด้วยตัว state object เอง ไม่ใช่ชื่อช่องที่ผิด
   * เพราะถ้าผู้ใช้กดส่งซ้ำแล้วผิดช่องเดิม ก็ยังต้องเด้งกลับไปขั้นนั้นอีกครั้ง
   */
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    const firstBad = Object.keys(state.fieldErrors ?? {})[0] as
      | keyof EvacRequestValues
      | undefined;
    if (firstBad) setStep(FIELD_STEP[firstBad] ?? 1);
  }

  const casualtyHasError = CASUALTY_FIELDS.some((f) => err[f]);

  return (
    // noValidate — เหตุผลอยู่ในกฎข้อ 1 ของคอมเมนต์หัวไฟล์ อย่าเอาออก
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="clientUuid" value={clientUuid} />
      <input type="hidden" name="symptomOnsetAt" value={onsetIso} />

      {/* ── แถบความคืบหน้า ─────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 flex items-baseline gap-2">
          <span className="tabular font-mono text-xs text-muted-foreground">
            ขั้นที่ {step} / {STEPS.length}
          </span>
          <span className="text-base font-semibold">{STEPS[step - 1]}</span>
        </p>
        <ol className="flex gap-1.5" aria-label="ความคืบหน้า">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i + 1 === step ? "step" : undefined}
              title={`${i + 1}. ${s}`}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i + 1 < step
                  ? "bg-primary"
                  : i + 1 === step
                    ? "bg-triage-yellow"
                    : "bg-muted",
              )}
            />
          ))}
        </ol>
      </div>

      {/* ══ ขั้นที่ 1 · ผู้ป่วย ══════════════════════════ */}
      <section hidden={step !== 1} className="space-y-4 rounded-xl border border-border bg-card p-4">
        <Field
          label="อาการสำคัญ"
          htmlFor={`${id}-cc`}
          error={err.chiefComplaint}
          hint="สิ่งที่ทำให้ต้องส่งกลับ เขียนสั้นๆ ให้ปลายทางเตรียมตัวได้"
        >
          <TextArea
            id={`${id}-cc`}
            name="chiefComplaint"
            rows={3}
            maxLength={500}
            placeholder="เช่น แผลกระสุนต้นขาขวา เลือดออกมาก"
          />
        </Field>

        <Field label="สังกัดหน่วย" htmlFor={`${id}-aff`} error={err.affiliation}>
          <TextInput
            id={`${id}-aff`}
            name="affiliation"
            maxLength={120}
            placeholder="เช่น ร้อย.ร.๔๗๓๑"
          />
        </Field>

        <Field
          label="กลไกการบาดเจ็บ / เหตุการณ์"
          htmlFor={`${id}-mech`}
          error={err.mechanism}
        >
          <TextArea
            id={`${id}-mech`}
            name="mechanism"
            rows={2}
            maxLength={500}
            placeholder="เช่น ถูกยิงขณะลาดตระเวน เวลาประมาณ 05.30 น."
          />
        </Field>

        <Field
          label="เวลาที่เริ่มมีอาการ"
          htmlFor={`${id}-onset`}
          error={err.symptomOnsetAt}
          hint="เป็นเวลาในอดีตที่คุณทราบเอง เวลาอื่นทั้งหมดระบบจับเองจากการกดปุ่มจริง"
        >
          <TextInput
            id={`${id}-onset`}
            type="datetime-local"
            value={onsetLocal}
            max={nowLocal}
            onFocus={() => setNowLocal(currentLocalMinute())}
            onChange={(e) => setOnsetLocal(e.target.value)}
            className="tabular font-mono"
          />
        </Field>

        {/* ย้ำกฎที่จุดที่ผู้ใช้กำลังจะพิมพ์ ไม่ใช่ไว้ท้ายหน้าที่ไม่มีใครอ่าน */}
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          เฟสนี้เป็นข้อมูลจำลองเท่านั้น{" "}
          <strong className="font-semibold text-destructive">
            ห้ามกรอกข้อมูลผู้ป่วยจริง
          </strong>{" "}
          ทุกเคสถูกทำเครื่องหมาย is_synthetic โดยฐานข้อมูล
        </p>

        <Fold title="ข้อมูลผู้ป่วย" count="16 ช่อง" open={casualtyHasError}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ยศ" htmlFor={`${id}-rank`} error={err.rankTh}>
              <TextInput id={`${id}-rank`} name="rankTh" maxLength={40} placeholder="ส.อ." />
            </Field>
            <Field label="ชื่อ" htmlFor={`${id}-fn`} error={err.firstName}>
              <TextInput id={`${id}-fn`} name="firstName" maxLength={80} />
            </Field>
            <Field label="นามสกุล" htmlFor={`${id}-ln`} error={err.lastName}>
              <TextInput id={`${id}-ln`} name="lastName" maxLength={80} />
            </Field>
            <Field
              label="เลขประจำตัว"
              htmlFor={`${id}-sn`}
              error={err.serviceNumber}
              hint="เลขประจำตัวทหาร 10 หลัก"
            >
              <TextInput
                id={`${id}-sn`}
                name="serviceNumber"
                inputMode="numeric"
                maxLength={10}
                className="tabular font-mono"
              />
            </Field>
            <Field label="เหล่าทัพ" htmlFor={`${id}-br`} error={err.branch}>
              <NativeSelect id={`${id}-br`} name="branch" defaultValue="">
                <option value="">ยังไม่ระบุ</option>
                {Object.entries(BRANCH_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="อายุ" htmlFor={`${id}-age`} error={err.ageYears}>
              <NumInput id={`${id}-age`} name="ageYears" inputMode="numeric" min={0} max={120} />
            </Field>
            <Field label="สัญชาติ" htmlFor={`${id}-nat`} error={err.nationality}>
              <TextInput id={`${id}-nat`} name="nationality" maxLength={40} defaultValue="ไทย" />
            </Field>
            <Field label="เชื้อชาติ" htmlFor={`${id}-eth`} error={err.ethnicity}>
              <TextInput id={`${id}-eth`} name="ethnicity" maxLength={40} />
            </Field>
            <Field label="หมู่โลหิต" htmlFor={`${id}-bg`} error={err.bloodGroup}>
              <NativeSelect id={`${id}-bg`} name="bloodGroup" defaultValue="">
                <option value="">ยังไม่ทราบ</option>
                <option value="O">O</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="AB">AB</option>
              </NativeSelect>
            </Field>
            <Field label="Rh" htmlFor={`${id}-rh`} error={err.rh}>
              <NativeSelect id={`${id}-rh`} name="rh" defaultValue="">
                <option value="">ยังไม่ทราบ</option>
                <option value="positive">Rh+ve</option>
                <option value="negative">Rh−ve</option>
              </NativeSelect>
            </Field>
          </div>

          {/* ต้องเป็น type="button" ไม่งั้น Enter จะส่งฟอร์มตั้งแต่ขั้นแรก (กฎข้อ 2 หัวไฟล์) */}
          <button
            type="button"
            onClick={fillHistoryNone}
            className="flex h-12 w-full items-center justify-center rounded-lg border border-primary bg-background text-base font-semibold text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            ทั้ง 5 ช่องด้านล่าง &ldquo;ไม่มี&rdquo;
          </button>

          <Field
            label="แพ้ยา"
            htmlFor={`${id}-da`}
            error={err.drugAllergy}
            hint="ถ้าไม่มี ให้เขียนว่า ไม่มี — ปลายทางต้องแยกออกระหว่าง ไม่แพ้ กับ ยังไม่ได้ถาม"
          >
            <TextInput
              id={`${id}-da`}
              name="drugAllergy"
              maxLength={200}
              value={history.drugAllergy}
              onChange={(e) => setHistory((p) => ({ ...p, drugAllergy: e.target.value }))}
            />
          </Field>
          <Field label="แพ้อาหาร" htmlFor={`${id}-fa`} error={err.foodAllergy}>
            <TextInput
              id={`${id}-fa`}
              name="foodAllergy"
              maxLength={200}
              value={history.foodAllergy}
              onChange={(e) => setHistory((p) => ({ ...p, foodAllergy: e.target.value }))}
            />
          </Field>
          <Field label="โรคประจำตัว" htmlFor={`${id}-cc2`} error={err.chronicConditions}>
            <TextArea
              id={`${id}-cc2`}
              name="chronicConditions"
              rows={2}
              maxLength={500}
              value={history.chronicConditions}
              onChange={(e) =>
                setHistory((p) => ({ ...p, chronicConditions: e.target.value }))
              }
            />
          </Field>
          <Field label="ประวัติการเจ็บป่วยในอดีต" htmlFor={`${id}-ph`} error={err.pastHistory}>
            <TextArea
              id={`${id}-ph`}
              name="pastHistory"
              rows={2}
              maxLength={500}
              value={history.pastHistory}
              onChange={(e) => setHistory((p) => ({ ...p, pastHistory: e.target.value }))}
            />
          </Field>
          <Field label="ยาที่ใช้เป็นประจำ" htmlFor={`${id}-rm`} error={err.regularMeds}>
            <TextInput
              id={`${id}-rm`}
              name="regularMeds"
              maxLength={300}
              value={history.regularMeds}
              onChange={(e) => setHistory((p) => ({ ...p, regularMeds: e.target.value }))}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="น้ำหนัก (กก.)" htmlFor={`${id}-w`} error={err.weightKg}>
              <NumInput id={`${id}-w`} name="weightKg" step="0.1" min={1} max={399} />
            </Field>
            <Field label="ส่วนสูง (ซม.)" htmlFor={`${id}-h`} error={err.heightCm}>
              <NumInput id={`${id}-h`} name="heightCm" step="0.1" min={1} max={299} />
            </Field>
            <Field label="โทรศัพท์" htmlFor={`${id}-ph2`} error={err.phone}>
              <TextInput
                id={`${id}-ph2`}
                name="phone"
                inputMode="tel"
                maxLength={20}
                className="tabular font-mono"
              />
            </Field>
          </div>
        </Fold>
      </section>

      {/* ══ ขั้นที่ 2 · ความเร่งด่วน ═════════════════════ */}
      <section hidden={step !== 2} className="space-y-4 rounded-xl border border-border bg-card p-4">
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
                    selected ? t.solid : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="precedence"
                    value={p}
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

        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          ระบบตั้งสี triage จากปุ่มนี้เอง ไม่มีช่องให้เลือกซ้ำ —
          ด่วนที่สุดเป็นแดง ด่วนเป็นเหลือง ปกติเป็นเขียว เสียชีวิตเป็นดำ
        </p>
      </section>

      {/* ══ ขั้นที่ 3 · ปลายทางและจุดรับ ═════════════════ */}
      <section hidden={step !== 3} className="space-y-4 rounded-xl border border-border bg-card p-4">
        <Field
          label="หน่วยปลายทาง"
          htmlFor={`${id}-to`}
          error={err.toUnitId}
          hint={`ต้นทางคือ ${originUnitName} — เลือกหน่วยอื่นเท่านั้น`}
        >
          <NativeSelect id={`${id}-to`} name="toUnitId" defaultValue="">
            <option value="">เลือกหน่วยปลายทาง</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nameTh} · {ROLE_LEVEL_LABEL[u.roleLevel] ?? u.roleLevel}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <PickupField points={pickupPoints} error={err.pickupGrid ?? err.pickupPointId} />

        <Field
          label="ยานพาหนะที่ขอ"
          htmlFor={`${id}-tm`}
          error={err.transportMode}
          hint="รถพยาบาลเป็นค่าเริ่มต้น เพราะเป็นคำตอบที่ใช้บ่อยที่สุด"
        >
          <NativeSelect id={`${id}-tm`} name="transportMode" defaultValue="ground">
            {TRANSPORT_ORDER.map((v) => (
              <option key={v} value={v}>
                {TRANSPORT_LABEL[v]}
              </option>
            ))}
            <option value="">ให้ศูนย์สั่งการพิจารณา</option>
          </NativeSelect>
        </Field>

        <Field label="ประเภทผู้ป่วย" error={err.patientCategory}>
          <div className="grid gap-2">
            {(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((v) => (
              <label
                key={v}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 focus-within:ring-3 focus-within:ring-ring/50 has-checked:border-primary has-checked:bg-accent"
              >
                <input
                  type="radio"
                  name="patientCategory"
                  value={v}
                  className="size-5 accent-primary"
                />
                <span className="text-base">{CATEGORY_LABEL[v]}</span>
              </label>
            ))}
          </div>
        </Field>
      </section>

      {/* ══ ขั้นที่ 4 · ประเมินแรกรับ ════════════════════ */}
      <section hidden={step !== 4} className="space-y-4 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          ทุกช่องไม่บังคับ — หน้างานอาจยังวัดอะไรไม่ได้เลย
          ถ้าเว้นว่างทั้งหมดระบบจะไม่สร้างแถวประเมินเปล่า
        </p>

        <SubHead>สัญญาณชีพ · V/S</SubHead>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ความดันตัวบน" htmlFor={`${id}-sbp`} error={err.sbp}>
            <NumInput id={`${id}-sbp`} name="sbp" inputMode="numeric" min={0} max={300} />
          </Field>
          <Field label="ความดันตัวล่าง" htmlFor={`${id}-dbp`} error={err.dbp}>
            <NumInput id={`${id}-dbp`} name="dbp" inputMode="numeric" min={0} max={200} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="ชีพจร" htmlFor={`${id}-p`} error={err.pulse}>
            <NumInput id={`${id}-p`} name="pulse" inputMode="numeric" min={0} max={300} />
          </Field>
          <Field label="หายใจ" htmlFor={`${id}-rr`} error={err.respRate}>
            <NumInput id={`${id}-rr`} name="respRate" inputMode="numeric" min={0} max={80} />
          </Field>
          <Field label="SpO₂ (%)" htmlFor={`${id}-spo2`} error={err.spo2}>
            <NumInput id={`${id}-spo2`} name="spo2" inputMode="numeric" min={0} max={100} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="อุณหภูมิ (°C)" htmlFor={`${id}-t`} error={err.temperature}>
            <NumInput id={`${id}-t`} name="temperature" step="0.1" min={20} max={45} />
          </Field>
        </div>

        <SubHead>ระดับการรู้ตัว</SubHead>
        <Field
          label="ระดับความรู้สึกตัว"
          htmlFor={`${id}-avpu`}
          error={err.avpu}
          hint="ตามหมายเหตุท้าย ทบ.466-901 ด้านหลัง"
        >
          <NativeSelect id={`${id}-avpu`} name="avpu" defaultValue="">
            <option value="">ยังไม่ประเมิน</option>
            {Object.entries(AVPU_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GCS" htmlFor={`${id}-gcs`} error={err.gcs}>
            <NumInput
              id={`${id}-gcs`}
              name="gcs"
              inputMode="numeric"
              min={3}
              max={15}
              placeholder="3–15"
            />
          </Field>
        </div>

        <Field label="สิ่งที่ตรวจพบเพิ่มเติม" htmlFor={`${id}-f`} error={err.findings}>
          <TextArea id={`${id}-f`} name="findings" rows={3} maxLength={1000} />
        </Field>
      </section>

      {/* ══ ขั้นที่ 5 · เหตุการณ์และการบาดเจ็บ ═══════════ */}
      <section hidden={step !== 5} className="space-y-4 rounded-xl border border-border bg-card p-4">
        <fieldset className="grid gap-2">
          <legend className="sr-only">ลักษณะของเหตุการณ์</legend>
          <CheckRow name="onDuty" label="ป่วยเจ็บขณะปฏิบัติหน้าที่" />
          <CheckRow name="hostileAction" label="เกิดจากการกระทำของฝ่ายตรงข้าม" />
        </fieldset>

        <Field
          label="หมวดสาเหตุ (รายงาน ทบ.466-900)"
          htmlFor={`${id}-rc`}
          error={err.reportCategory}
          hint="เลือกครั้งเดียว รายงานประจำวันลงยอดเองโดยไม่ต้องกรอกซ้ำ"
        >
          <NativeSelect id={`${id}-rc`} name="reportCategory" defaultValue="">
            <option value="">ยังไม่ระบุ</option>
            {REPORT_CATEGORY_ORDER.map((v) => (
              <option key={v} value={v}>
                {REPORT_CATEGORY_LABEL[v]}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ชั้นยศ" htmlFor={`${id}-rg`} error={err.patientRankGroup}>
            <NativeSelect id={`${id}-rg`} name="patientRankGroup" defaultValue="">
              <option value="">ยังไม่ระบุ</option>
              {Object.entries(RANK_GROUP_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="ยุทธการ" htmlFor={`${id}-op`} error={err.operationType}>
            <TextInput id={`${id}-op`} name="operationType" maxLength={120} />
          </Field>
          <Field label="ฐานปฏิบัติการ" htmlFor={`${id}-ob`} error={err.operatingBase}>
            <TextInput id={`${id}-ob`} name="operatingBase" maxLength={120} />
          </Field>
          <Field label="สถานที่เกิดเหตุ" htmlFor={`${id}-ip`} error={err.injuryPlace}>
            <TextInput id={`${id}-ip`} name="injuryPlace" maxLength={120} placeholder="ฐานเนิน 350" />
          </Field>
        </div>

        {/*
          ตัดช่อง "พิกัดจุดเกิดเหตุ" (injuryGrid) ออกจากหน้าจอแล้ว (8 ก.ย. 2569)
          ไม่มีใครกรอกจริงเพราะพิกัดที่ชุดลำเลียงต้องใช้คือ "จุดรับ" ในขั้นที่ 3 ไม่ใช่จุดเกิดเหตุ
          คอลัมน์ case.injury_grid · zod · พารามิเตอร์ RPC ยังอยู่ครบโดยตั้งใจ
          เพราะ form_test.sql ยังทดสอบมันอยู่ และผู้เรียก RPC รายอื่นยังส่งค่านี้ได้
          เมื่อไม่มี input ในฟอร์ม FormData ก็ไม่มีคีย์นี้ → zod ให้ undefined → RPC ได้ null
        */}

        <Field label="อุปกรณ์ป้องกันที่สวมอยู่" error={err.protectiveGear}>
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="sr-only">อุปกรณ์ป้องกัน</legend>
            {GEAR_VALUES.map((g) => (
              <CheckRow key={g} name="protectiveGear" value={g} label={GEAR_LABEL[g]} />
            ))}
          </fieldset>
        </Field>

        <InjuryMap error={err.injurySites} />

        <SubHead>สภาพทางเดินหายใจ ปอด แผล</SubHead>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="ทางเดินหายใจ" htmlFor={`${id}-aw`} error={err.airwayStatus}>
            <NativeSelect id={`${id}-aw`} name="airwayStatus" defaultValue="">
              <option value="">ยังไม่ระบุ</option>
              {Object.entries(AIRWAY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="ปอด" htmlFor={`${id}-ch`} error={err.chestStatus}>
            <NativeSelect id={`${id}-ch`} name="chestStatus" defaultValue="">
              <option value="">ยังไม่ระบุ</option>
              {Object.entries(CHEST_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="แผล" htmlFor={`${id}-wd`} error={err.woundStatus}>
            <NativeSelect id={`${id}-wd`} name="woundStatus" defaultValue="">
              <option value="">ยังไม่ระบุ</option>
              {Object.entries(WOUND_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <SubHead>ความปลอดภัยของชุดลำเลียง</SubHead>
        <div className="grid gap-3 sm:grid-cols-2">
          {/*
            ★ ช่องนี้ต้องไม่มี default — เคยลองตั้งเป็น "ปลอดภัย" แล้วถอยกลับ (8 ก.ย. 2569)
              ทุกช่องอื่นในขั้นนี้ตั้งค่าเริ่มต้นได้เพราะเดาผิดแล้วแค่กรอกเกิน
              แต่ช่องนี้บอกชุดลำเลียงว่าจุดรับปะทะอยู่หรือไม่ ถ้าเดาให้แล้วเดาผิด
              คนที่ขับรถเข้าไปคือคนรับผลของการเดานั้น
              "ยังไม่ระบุ" พูดความจริงว่ายังไม่มีใครตอบ ส่วน "ปลอดภัย" ที่ระบบใส่ให้เอง
              แยกไม่ออกจาก "ปลอดภัย" ที่คนยืนยันมาจริง — ปลายทางจึงเชื่ออะไรไม่ได้เลย
              นี่คือเหตุผลเดียวกับที่ห้าช่องประวัติในขั้น 1 ต้องมีปุ่มให้กดเอง ไม่ใช่เติมให้เงียบๆ
          */}
          <Field label="สถานการณ์จุดรับ" htmlFor={`${id}-sec`} error={err.securityStatus}>
            <NativeSelect id={`${id}-sec`} name="securityStatus" defaultValue="">
              <option value="">ยังไม่ระบุ</option>
              {Object.entries(SECURITY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="การปนเปื้อน NBC" htmlFor={`${id}-nbc`} error={err.nbcStatus}>
            <NativeSelect id={`${id}-nbc`} name="nbcStatus" defaultValue="none">
              {Object.entries(NBC_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <Field label="บันทึกอื่นๆ" htmlFor={`${id}-on`} error={err.otherNote}>
          <TextArea id={`${id}-on`} name="otherNote" rows={2} maxLength={1000} />
        </Field>
      </section>

      {/* ══ ขั้นที่ 6 · การรักษาที่ให้แล้ว ═══════════════ */}
      <section hidden={step !== 6} className="space-y-4 rounded-xl border border-border bg-card p-4">
        <TreatmentList error={err.treatments} />
      </section>

      {/* ══ ขั้นที่ 7 · บัญชีสิ่งของ ═════════════════════ */}
      <section hidden={step !== 7} className="space-y-4 rounded-xl border border-border bg-card p-4">
        <PropertyList />
      </section>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive bg-red-50 px-3 py-2.5 text-sm font-medium text-destructive"
        >
          {state.error}
        </p>
      )}

      {/* ── ปุ่มเดินขั้น ────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_2fr] gap-3 pb-4">
        <a
          href={step === 1 ? "/sender" : undefined}
          role={step === 1 ? undefined : "button"}
          onClick={step === 1 ? undefined : () => setStep((s) => s - 1)}
          className="flex h-14 cursor-pointer items-center justify-center rounded-lg border border-input bg-background text-base font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {step === 1 ? "ยกเลิก" : "← ย้อนกลับ"}
        </a>

        {step < STEPS.length ? (
          // ต้องเป็น type="button" ไม่งั้น Enter บนคีย์บอร์ดจะส่งฟอร์มตั้งแต่ขั้นแรก
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="h-14 rounded-lg bg-primary text-base font-semibold text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            ถัดไป →
          </button>
        ) : (
          <SubmitButton />
        )}
      </div>

      <p className="pb-4 text-center text-xs text-muted-foreground">
        เวลาที่ร้องขอจะถูกบันทึกโดยระบบเมื่อกดส่งคำขอ
      </p>
    </form>
  );
}
