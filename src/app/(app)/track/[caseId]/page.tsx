import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { PrecedenceBadge } from "@/components/medrelay/precedence-badge";
import { RelativeTime } from "@/components/medrelay/relative-time";
import { TourniquetStrip } from "@/components/medrelay/tourniquet-strip";
import { TriageChip } from "@/components/medrelay/triage-dot";
import { getProfile } from "@/lib/auth/profile";
import {
  groupByStation,
  stationsOf,
  type CareStation,
} from "@/lib/care-timeline";
import { custodyOf } from "@/lib/custody";
import { createClient } from "@/lib/supabase/server";
import { getTourniquets } from "@/lib/tourniquet";
import { AVPU_LABEL, vitalsLine } from "@/lib/vitals";
import type {
  AvpuLevel,
  CaseOutcome,
  CaseStatus,
  LegStatus,
  PrecedenceLevel,
  TriageColor,
} from "@/lib/enums";
import { isLegOpen, nextStep } from "@/lib/leg-flow";
import {
  LegCard,
  type LegView,
  type PersonOption,
  type VehicleOption,
} from "./leg-card";
import {
  DispositionSummary,
  SendPatientForm,
  type NextLegUnitOption,
} from "./send-patient-form";
import { AssessPanel, TreatmentsPanel } from "./reassess-forms";
import { TX_LABEL } from "../../sender/schema";

/**
 * หน้า /track/[caseId] — F3 ติดตามสถานะ (Prompt 08)
 *
 * ★ หน้านี้คือที่มาของตัวเลขทุกตัวบนแดชบอร์ด
 *   response time ที่โครงการนี้อ้างว่าวัดได้ เกิดจากปุ่มในหน้านี้ล้วนๆ
 *   ถ้าปุ่มกดไม่ได้ ตัวเลขก็ไม่มี — จึงเป็นหน้าที่สำคัญที่สุดของทั้งระบบ
 *
 * ★ ไม่ต้องเช็คสิทธิ์เองที่นี่ RLS ทำให้แล้ว
 *   เคสที่ผู้ใช้ไม่มีสิทธิ์เห็นจะคืน 0 แถว ซึ่งกลายเป็น notFound() พอดี
 *   — ไม่บอกด้วยว่า "มีเคสนี้อยู่แต่คุณดูไม่ได้" ซึ่งเองก็เป็นการรั่วข้อมูล
 *
 * ★ ปุ่มจัดรถอยู่ในหน้านี้ด้วยโดยเจตนา (HANDOFF §3)
 *   ทำให้เดิน pending → completed ครบวงจรได้จากหน้าเดียว
 *   สาธิตได้ตั้งแต่ต้นทางถึงปลายทางโดยยังไม่ต้องมี /dispatch
 */

const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  requested: "รอจัดรถ",
  active: "กำลังส่งกลับ",
  completed: "ส่งกลับเสร็จแล้ว",
  cancelled: "ยกเลิก",
};

const MOBILITY_LABEL: Record<string, string> = {
  litter_dependent: "นอนเปล ช่วยเหลือตัวเองไม่ได้",
  litter_assisted: "นอนเปล ช่วยเหลือตัวเองได้บ้าง",
  ambulatory: "เดินได้",
  psych_escort: "ผู้ป่วยจิตเวช ต้องมีผู้ควบคุม",
  psych_no_escort: "ผู้ป่วยจิตเวช ไม่ต้องมีผู้ควบคุม",
};

const TRANSPORT_LABEL: Record<string, string> = {
  ground: "ทางบก",
  rotary: "เฮลิคอปเตอร์",
  fixed_wing: "อากาศยานปีกตรึง",
  watercraft: "ทางน้ำ",
};

/** PostgREST คืน relation แบบ many-to-one เป็น object แต่บาง query คืนเป็น array — รับไว้ทั้งสองทาง */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** ชื่อที่แสดงบนหน้าจอ — ยศนำหน้าชื่อถ้ามี */
function personName(
  p: { full_name: string; rank_th: string | null } | null,
): string | null {
  if (!p) return null;
  return p.rank_th ? `${p.rank_th} ${p.full_name}` : p.full_name;
}

/* -------------------------------------------------------------
 * รูปร่างของรายการบนเส้นเวลา — ประกาศไว้เพราะ component อยู่นอก Page
 * จึง infer จากผลของ query ตรงๆ ไม่ได้ ต้องตรงกับ select ด้านล่างเสมอ
 * ----------------------------------------------------------- */
type MaybePerson =
  | { full_name: string; rank_th: string | null }
  | { full_name: string; rank_th: string | null }[]
  | null;

type TimelineAssessment = {
  id: string;
  gcs: number | null;
  sbp: number | null;
  dbp: number | null;
  pulse: number | null;
  resp_rate: number | null;
  spo2: number | null;
  temperature: number | null;
  avpu: string | null;
  triage: string | null;
  findings: string | null;
  treatment: string | null;
  assessed_at: string;
  assessor: MaybePerson;
};

type TimelineTreatment = {
  id: string;
  tx_code: keyof typeof TX_LABEL;
  detail: string | null;
  dose: string | null;
  route: string | null;
  site: string | null;
  giver: MaybePerson;
};

type TimelineEntry =
  | { type: "assessment"; at: string; at2: string; row: TimelineAssessment }
  | { type: "treatment"; at: string; at2: string; row: TimelineTreatment };

/* -------------------------------------------------------------
 * การ์ดของหนึ่ง "จุด" บนสายส่งกลับ
 *
 * ★ หัวข้อจุดแทนป้าย "ทอด N" กับ "แรกรับ/ตอนส่งมอบ" ที่เคยติดรายรายการ
 *   ป้ายเดิมบอกได้แค่ว่าเกิดในทอดไหน ซึ่งไม่พอ เพราะทอดเดียวมีสามจุดดูแล
 *   (ต้นทาง · บนรถ · ปลายทาง) ผลของเขตหน้ากับของโรงพยาบาลจึงเคยปนกันอยู่
 *   ในกลุ่ม "ทอด 1" เดียวกัน — หัวข้อจุดตอบตรงคำถามที่คนอ่านถามจริง
 * ----------------------------------------------------------- */
function StationCard({
  station,
  events,
  isHere,
}: {
  station: CareStation;
  events: TimelineEntry[];
  isHere: boolean;
}) {
  return (
    <section
      className={cnStation(isHere)}
      aria-label={`บันทึกที่ ${station.label}`}
    >
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-base font-semibold">{station.label}</h3>
        {isHere && (
          // บอกด้วยข้อความ ไม่พึ่งสีขอบอย่างเดียว (เกณฑ์เดียวกับ TriageDot)
          <span className="rounded-full border border-primary bg-background px-2 py-0.5 text-xs font-semibold">
            จุดนี้
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {events.length} รายการ
        </span>
      </header>
      {station.sublabel && (
        <p className="mt-0.5 text-sm text-muted-foreground">{station.sublabel}</p>
      )}

      {events.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          ยังไม่มีบันทึกที่จุดนี้
        </p>
      ) : (
        <ol className="mt-2.5 space-y-2">
          {events.map((ev) => (
            <li key={`${ev.type}-${ev.row.id}`}>
              <TimelineEvent ev={ev} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** ขอบเน้นเฉพาะจุดที่ผู้ป่วยอยู่ตอนนี้ ที่เหลือเป็นขอบปกติ */
function cnStation(isHere: boolean): string {
  const base = "rounded-xl border p-3";
  return isHere ? `${base} border-primary bg-muted/30` : `${base} border-border`;
}

/* -------------------------------------------------------------
 * หนึ่งรายการบนเส้นเวลา — ใช้ซ้ำทั้งการ์ด ② และกล่อง "บันทึกของจุดนี้"
 * เขียนที่เดียวจึงไม่มีทางที่สองที่จะแสดงค่าเดียวกันคนละแบบ
 * ----------------------------------------------------------- */
function TimelineEvent({ ev }: { ev: TimelineEntry }) {
  if (ev.type === "treatment") {
    const t = ev.row;
    const detail = [t.detail, t.dose, t.route, t.site].filter(Boolean).join(" · ");
    return (
      <div className="rounded-lg border border-border border-l-4 border-l-border bg-background px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm font-semibold">
            การรักษา · {TX_LABEL[t.tx_code] ?? t.tx_code}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            <RelativeTime value={ev.at} />
          </span>
        </div>
        {detail && <p className="mt-1 text-sm">{detail}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          บันทึกโดย {personName(one(t.giver)) ?? "ไม่ทราบผู้บันทึก"}
        </p>
      </div>
    );
  }

  const a = ev.row;
  const vitals = vitalsLine(a);
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {/* สีที่ยืนยันไว้ในการประเมินครั้งนี้ — ตอบว่า "ตอนนั้นเป็นสีอะไร"
            ไม่ใช่แค่สีล่าสุดของเคส จึงเห็นได้ว่าสีเปลี่ยนตอนไหนที่จุดไหน */}
        {a.triage ? (
          <TriageChip value={a.triage as TriageColor} />
        ) : (
          <span className="text-sm font-semibold">ผลประเมิน</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          <RelativeTime value={a.assessed_at} />
        </span>
      </div>
      {vitals && <p className="mt-1.5 font-mono text-sm">{vitals}</p>}
      {a.avpu && (
        <p className="mt-1 text-sm">
          ระดับความรู้สึกตัว {AVPU_LABEL[a.avpu as AvpuLevel]}
        </p>
      )}
      {a.findings && <p className="mt-1 text-sm">{a.findings}</p>}
      {a.treatment && (
        <p className="mt-1 text-sm">
          <span className="font-semibold">การรักษา · </span>
          {a.treatment}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        บันทึกโดย {personName(one(a.assessor)) ?? "ไม่ทราบผู้บันทึก"}
      </p>
    </div>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const supabase = await createClient();
  const profile = await getProfile();

  const { data: row } = await supabase
    .from("case")
    .select(
      `id, case_code, precedence, triage, chief_complaint, patient_alias,
       patient_count, requested_at, closed_at, status, mechanism,
       pickup_marking, pickup_grid, patient_mobility, transport_mode,
       origin_unit_id, outcome, disposition_route, diagnosis, icd10, feedback_note,
       origin:origin_unit_id (name_th),
       dest:dest_unit_id (name_th),
       transfer_leg (
         id, leg_no, status, from_unit_id, to_unit_id,
         requested_at, dispatched_at, on_scene_at, departed_at, arrived_at, handover_at,
         handover_ready_at, transporter_id, receiver_id,
         docs_ok, property_ok, missing_note, delay_reason, note,
         from_unit:from_unit_id (name_th),
         to_unit:to_unit_id (name_th),
         vehicle:vehicle_id (call_sign, type),
         transporter:transporter_id (full_name, rank_th),
         receiver:receiver_id (full_name, rank_th),
         handover_ready:handover_ready_by (full_name, rank_th)
       )`,
    )
    .eq("id", caseId)
    .maybeSingle();

  if (!row) notFound();

  const origin = one(row.origin);
  const rawLegs = [...(row.transfer_leg ?? [])].sort((a, b) => a.leg_no - b.leg_no);
  const lastLeg = rawLegs.at(-1) ?? null;

  const legs: LegView[] = rawLegs.map((l) => ({
    id: l.id,
    legNo: l.leg_no,
    status: l.status as LegStatus,
    fromUnit: one(l.from_unit)?.name_th ?? "—",
    toUnit: one(l.to_unit)?.name_th ?? "—",
    vehicle: (() => {
      const v = one(l.vehicle);
      return v ? { callSign: v.call_sign, type: v.type } : null;
    })(),
    transporter: personName(one(l.transporter)),
    receiver: personName(one(l.receiver)),
    times: {
      requested_at: l.requested_at,
      dispatched_at: l.dispatched_at,
      on_scene_at: l.on_scene_at,
      departed_at: l.departed_at,
      arrived_at: l.arrived_at,
      handover_at: l.handover_at,
    },
    // สิทธิ์กดปุ่มคิดที่นี่ ไม่ส่ง id ของใครลง browser (0023)
    isAssignedTransporter:
      profile !== null && l.transporter_id === profile.id,
    isDestinationUnit:
      profile !== null && l.to_unit_id === profile.unitId,
    handoverReadyAt: l.handover_ready_at,
    handoverReadyBy: personName(one(l.handover_ready)),
    docsOk: l.docs_ok,
    propertyOk: l.property_ok,
    missingNote: l.missing_note,
    delayReason: l.delay_reason,
    note: l.note,
  }));

  /**
   * ผลประเมินทุกทอดของเคสนี้ — นี่คือคำตอบของ HMW หลักของโครงการ
   * assessment ผูกกับ case_id เสมอ ผลประเมินแรกรับที่บันทึกในทอดที่ 1
   * จึงเปิดดูได้จากทุกทอดถัดไปโดยไม่ต้องคัดลอกข้อมูล
   */
  const { data: rawAssessments } = await supabase
    .from("assessment")
    .select(
      `id, kind, leg_id, gcs, sbp, dbp, pulse, resp_rate, spo2, temperature, avpu, triage,
       findings, treatment, assessed_at,
       assessor:assessed_by (full_name, rank_th)`,
    )
    .eq("case_id", caseId)
    .order("assessed_at", { ascending: true });

  const assessments = rawAssessments ?? [];

  /**
   * การรักษาที่ให้ทีละรายการ — ต้องอยู่บนเส้นเวลาเดียวกับผลประเมิน
   * ไม่งั้นหัตถการที่ชุดลำเลียงลงระหว่างทางจะไม่ปรากฏที่ไหนเลยนอกจากแถบสายรัด
   * (ซึ่งแสดงเฉพาะ tx_code = 'tourniquet')
   */
  const { data: rawTreatments } = await supabase
    .from("treatment")
    .select(
      `id, tx_code, detail, dose, route, site, given_at, created_at, leg_id,
       giver:given_by (full_name, rank_th)`,
    )
    .eq("case_id", caseId)
    .order("given_at", { ascending: true });

  const treatments = rawTreatments ?? [];

  /**
   * เส้นเวลาเดียวของทั้งเคส — ผลประเมินกับการรักษาปนกันเรียงตามเวลาจริง
   *
   * ★ ทำไมต้องรวมสองตาราง ไม่แยกเป็นสองรายการ
   *   คำถามที่คนเปิดหน้านี้มาถามคือ "ระหว่างทางเกิดอะไรขึ้นบ้าง"
   *   ไม่ใช่ "มีผลประเมินกี่ครั้ง" กับ "ให้ยากี่ครั้ง" แยกกัน
   *   การให้ยาแล้วความดันขึ้นเป็นเรื่องเดียวกัน ถ้าอยู่คนละรายการจะอ่านไม่ออก
   */
  const timeline = [
    ...assessments.map((a) => ({
      type: "assessment" as const,
      at: a.assessed_at,
      at2: a.assessed_at,
      row: a,
    })),
    ...treatments.map((t) => ({
      type: "treatment" as const,
      at: t.given_at,
      /** ตัวตัดสินเสมอชั้นที่สอง — ต้องมีเพื่อให้ลำดับตรงกับ getTourniquets() */
      at2: t.created_at,
      row: t,
    })),
  ]
    /**
     * เรียงตามเวลา แล้วตัดสินเสมอด้วย id
     *
     * ★ ห้ามเรียงด้วยเวลาอย่างเดียว — บทเรียนเดียวกับ src/lib/tourniquet.ts (8 ก.ย. 2569)
     *   สายรัดหลายเส้นของเคสเดียวกันมี given_at เท่ากันสนิท เพราะช่อง datetime-local
     *   ละเอียดแค่ระดับนาที และถูก insert ในคำสั่งเดียวกัน เมื่อคีย์เรียงเสมอกัน
     *   Array.prototype.sort จะคงลำดับที่ PostgREST คืนมา ซึ่งไม่รับประกันว่าเหมือนเดิม
     *
     *   ผลที่เห็นจริงก่อนแก้ — สายรัดสองเส้นเรียงสลับกันระหว่างการ์ด "ผลประเมิน
     *   ตลอดสายส่งกลับ" กับการ์ด "สายรัดห้ามเลือด" บนหน้าจอเดียวกัน
     *   คนอ่านต้องมานั่งเดาว่าอันไหนคือเส้นที่ 1 ในสถานการณ์ที่กำลังนับเวลาขาดเลือด
     *
     *   คีย์ทั้งสามชุดนี้ต้องตรงกับ src/lib/tourniquet.ts ทุกตัว (given_at →
     *   created_at → id) ไม่งั้นสองการ์ดยังเรียงไม่เหมือนกันอยู่ดี — id ไม่ซ้ำแน่นอน
     *   ลำดับที่ได้จึงเป็น total order คงที่ทุกครั้งและตรงกันทั้งสองที่
     */
    .sort(
      (a, b) =>
        a.at.localeCompare(b.at) ||
        a.at2.localeCompare(b.at2) ||
        a.row.id.localeCompare(b.row.id),
    );

  /**
   * จัดผลประเมินและการรักษาเป็น "จุด" ตามสายส่งกลับ (src/lib/care-timeline.ts)
   *
   * ★ ต้องทำหลังเรียง timeline เสร็จเสมอ ห้ามสลับลำดับสองขั้นนี้
   *   groupByStation รักษาลำดับที่ส่งเข้าไปไว้ทั้งหมด ไม่เรียงใหม่ให้
   *   ถ้าจัดกลุ่มก่อนเรียง ลำดับสายรัดจะกลับไปสลับกับการ์ด ⑤ อีก
   */
  const careLegs = rawLegs.map((l) => ({
    legNo: l.leg_no,
    fromUnit: one(l.from_unit)?.name_th ?? "—",
    toUnit: one(l.to_unit)?.name_th ?? "—",
    vehicle: one(l.vehicle)?.call_sign ?? null,
    onSceneAt: l.on_scene_at,
    handoverAt: l.handover_at,
  }));

  const stationGroups = groupByStation(careLegs, timeline);

  /**
   * จุดที่ผู้ป่วยอยู่ "ตอนนี้" — ต้องคิดจากทอด ไม่ใช่จากกลุ่มที่มีบันทึก
   *
   * ⚠ เคยเขียนผิดเป็น stationGroups.at(-1) ซึ่งหมายถึง "จุดสุดท้ายที่มีคนลงบันทึก"
   *   คนละเรื่องกับ "จุดที่ผู้ป่วยอยู่" — เคสที่รถจอดหน้าโรงพยาบาลแล้วแต่ยังไม่มี
   *   ใครบันทึกอะไรระหว่างทาง จะเหลือกลุ่มเดียวคือของเขตหน้า แล้วเขตหน้าจะโดน
   *   ติดป้าย "จุดนี้" ทั้งที่ผู้ป่วยออกจากที่นั่นไปนานแล้ว (เจอตอนดูภาพจริง)
   *
   *   stationsOf() สร้างจุดตามเวลาที่เกิดขึ้นจริงและไม่กรองอะไรทิ้ง
   *   จุดสุดท้ายของมันจึงเป็นที่อยู่ปัจจุบันของผู้ป่วยเสมอ
   */
  const allStations = stationsOf(careLegs);
  const hereStation = allStations.at(-1) ?? null;
  const hereKey = hereStation?.key ?? null;

  /**
   * รายการที่วาดจริง — ต่อจุดปัจจุบันเข้าไปด้วยแม้ยังไม่มีใครบันทึกอะไร
   *
   * groupByStation คืนเฉพาะจุดที่มีบันทึก ซึ่งถูกแล้วสำหรับจุดที่ผ่านไปแล้ว
   * (จุดที่ผู้ป่วยแวะแล้วไม่ได้ทำอะไรไม่ต้องกินที่บนจอ) แต่กับจุด "ปัจจุบัน"
   * การหายไปทำให้อ่านไม่ออกว่าตอนนี้ผู้ป่วยอยู่ไหน และป้าย "จุดนี้" จะโผล่บ้าง
   * ไม่โผล่บ้างแล้วแต่ว่ามีคนบันทึกหรือยัง ซึ่งดูเหมือนระบบเพี้ยน
   */
  const displayGroups =
    hereStation && !stationGroups.some((g) => g.station.key === hereKey)
      ? [...stationGroups, { station: hereStation, events: [] }]
      : stationGroups;

  /** กล่อง "บันทึกของจุดนี้" — ยังไม่มีบันทึกก็ไม่ต้องวาดกล่องเปล่าใต้ฟอร์ม */
  const hereGroup =
    stationGroups.find((g) => g.station.key === hereKey) ?? null;

  /**
   * ตัวเลือกสำหรับปุ่มจัดรถ ดึงเฉพาะตอนที่มีทอดรอจัดรถอยู่จริง
   * ทั้งสอง query ผ่าน RLS ปกติ — บัญชีที่ไม่ใช่ศูนย์สั่งการจะเห็นแค่ของหน่วยตัวเอง
   * หรือไม่เห็นเลย ซึ่งฟอร์มจะขึ้นข้อความบอกแทนที่จะเป็น dropdown ว่าง
   */
  /**
   * สายรัดห้ามเลือดของเคสนี้ — หน้านี้เป็นที่เดียวที่มีปุ่มคลาย
   * เพราะการ์ดในหน้ารายการเป็น <a> ทั้งใบ วาง <form> ซ้อนใน <a> ไม่ได้
   * และทุกบทบาทเดินทางมาถึงหน้านี้ได้ในหนึ่งครั้งจากการ์ดของตัวเอง
   */
  const tourniquets = await getTourniquets(caseId);

  const needsDispatch = rawLegs.some((l) => l.status === "pending");

  let vehicles: VehicleOption[] = [];
  let transporters: PersonOption[] = [];

  if (needsDispatch) {
    const [{ data: vs }, { data: ps }] = await Promise.all([
      supabase
        .from("vehicle")
        .select("id, call_sign, type, status, unit:unit_id (name_th)")
        .eq("status", "available")
        .order("call_sign"),
      supabase
        .from("profile")
        .select("id, full_name, rank_th, unit:unit_id (name_th)")
        .contains("roles", ["transporter"])
        .eq("is_active", true)
        .order("full_name"),
    ]);

    vehicles = (vs ?? []).map((v) => ({
      id: v.id,
      callSign: v.call_sign,
      type: v.type,
      unitName: one(v.unit)?.name_th ?? "—",
    }));

    transporters = (ps ?? []).map((p) => ({
      id: p.id,
      name: personName(p) ?? p.full_name,
      unitName: one(p.unit)?.name_th ?? "—",
    }));
  }

  /**
   * ทอดถัดไปเปิดได้ก็ต่อเมื่อทอดล่าสุดส่งมอบเสร็จแล้ว
   * (เงื่อนไขเดียวกับที่ startNextLeg ตรวจซ้ำอีกชั้นก่อน insert)
   *
   * ★ ยิง query นี้เฉพาะคนที่จะได้เห็นฟอร์มจริง ไม่ใช่ยิงก่อนแล้วค่อยซ่อน
   *   รายชื่อหน่วยทั้งกองทัพไม่ควรถูกส่งไปถึงเครื่องของคนที่ไม่มีอะไรจะทำกับมัน
   *   (หลักการเดียวกับที่ role-gate.tsx ห้ามไว้ตรงๆ)
   */
  const canStartNextLeg =
    lastLeg?.status === "completed" &&
    profile !== null &&
    profile.unitId === lastLeg.to_unit_id;
  let nextLegUnits: NextLegUnitOption[] = [];

  if (canStartNextLeg && lastLeg) {
    const { data: units } = await supabase
      .from("unit")
      .select("id, name_th, role_level")
      .eq("is_active", true)
      // ปลายทางของทอดใหม่ต้องไม่ใช่หน่วยที่ผู้ป่วยอยู่ตอนนี้ (constraint leg_units_differ)
      .neq("id", lastLeg.to_unit_id)
      /**
       * เรียงชั้นสูงขึ้นก่อน เพราะฟอร์มนี้ชื่อ "ส่งต่อชั้นการรักษาที่สูงกว่า"
       * ตัวเลือกที่ตรงกับหัวข้อจึงควรอยู่บนสุด ไม่ใช่ให้เลื่อนหาเอง
       *
       * ★ ไม่ตัดหน่วยชั้นต่ำกว่าออกโดยเจตนา
       *   ถ้ากรองด้วย role_level > ของหน่วยตัวเอง โรงพยาบาลชั้น 3 จะได้ dropdown
       *   ว่างเปล่าทันทีเมื่อยังไม่มีหน่วยชั้น 4 ในระบบ ซึ่งทำให้ฟอร์มใช้ไม่ได้เลย
       *   และการส่งข้างเคียง (ชั้นเดียวกันแต่คนละขีดความสามารถ) ก็เกิดขึ้นจริง
       *   หน้าจอบอกชั้นของทุกตัวเลือกอยู่แล้ว ให้คนตัดสินดีกว่าปิดทางเงียบๆ
       */
      .order("role_level", { ascending: false })
      .order("name_th");

    nextLegUnits = (units ?? []).map((u) => ({
      id: u.id,
      nameTh: u.name_th,
      roleLevel: u.role_level,
    }));
  }

  const openLeg = rawLegs.find((l) => isLegOpen(l.status as LegStatus)) ?? null;
  const upcoming = openLeg ? nextStep(openLeg.status as LegStatus) : null;
  const caseStatus = row.status as CaseStatus;

  /**
   * ผู้ป่วยอยู่ในมือคนที่กำลังดูอยู่หรือยัง (src/lib/custody.ts)
   *
   * คิดฝั่ง server ที่นี่ที่เดียวแล้วส่งเป็น prop ลงไป — ไม่ส่ง id ของใคร
   * ลง browser และไม่ให้ component ฝั่ง client เดาเอาเองจากบทบาท
   * (หลักการเดียวกับ LegView.isAssignedTransporter ที่ 0023 วางไว้)
   */
  const custody = custodyOf(profile, rawLegs);

  /**
   * ส่งผู้ป่วยออกได้เมื่อทอดสุดท้ายปิดแล้ว และคนที่ดูอยู่คือหน่วยที่ถือผู้ป่วย
   *
   * ★ กันด้วยตัวตน ไม่ใช่ RoleGate roles={["receiver"]} อย่างของเดิม
   *   บัญชีเดียวถือหลายบทบาท เขตหน้าที่มีบทบาท receiver ติดมาด้วย
   *   ไม่ควรเห็นปุ่มส่งต่อของผู้ป่วยที่นอนอยู่โรงพยาบาลอื่น
   */
  const holdsPatient =
    profile !== null && lastLeg !== null && profile.unitId === lastLeg.to_unit_id;
  const canSendOnward = lastLeg?.status === "completed" && holdsPatient;
  const outcome = (row.outcome as CaseOutcome | null) ?? null;

  return (
    <>
      <AppHeader
        title="ติดตามสถานะ"
        subtitle={
          <span className="font-mono">
            {row.case_code} · ต้นทาง {origin?.name_th ?? "—"}
          </span>
        }
      />
      <AppShell>
        <div className="space-y-4">
          {/* สรุปสถานะปัจจุบัน — คำถามเดียวที่ผู้ใช้เปิดหน้านี้มาถาม */}
          <div
            className={cnBanner(caseStatus)}
            role="status"
            aria-live="polite"
          >
            <p className="font-semibold">{CASE_STATUS_LABEL[caseStatus]}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {upcoming ? (
                <>
                  ขั้นถัดไป “{upcoming.label}” · รอ{upcoming.actor}
                </>
              ) : caseStatus === "completed" && row.closed_at ? (
                <RelativeTime value={row.closed_at} prefix="ส่งกลับเสร็จ" />
              ) : (
                <RelativeTime value={row.requested_at} prefix="ร้องขอเมื่อ" />
              )}
            </p>
          </div>

          {/* ① ข้อมูลผู้ป่วย — คำถามแรกของทุกคนที่เปิดเคสคือ "ใครและเป็นอะไร" */}
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <PrecedenceBadge value={row.precedence as PrecedenceLevel} />
              {row.triage && <TriageChip value={row.triage as TriageColor} />}
            </div>

            <div>
              <p className="text-sm font-semibold text-muted-foreground">
                อาการสำคัญ
              </p>
              <p className="mt-1 text-base">{row.chief_complaint}</p>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="font-semibold text-muted-foreground">ผู้ป่วย</dt>
                <dd className="mt-0.5">
                  {row.patient_alias ?? "ไม่ระบุนามสมมติ"} · {row.patient_count} ราย
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-muted-foreground">
                  ร้องขอเมื่อ
                </dt>
                <dd className="mt-0.5">
                  <RelativeTime value={row.requested_at} />
                </dd>
              </div>
              {row.mechanism && (
                <div>
                  <dt className="font-semibold text-muted-foreground">
                    กลไกการบาดเจ็บ
                  </dt>
                  <dd className="mt-0.5">{row.mechanism}</dd>
                </div>
              )}
              {row.pickup_marking && (
                <div>
                  <dt className="font-semibold text-muted-foreground">จุดรับ</dt>
                  <dd className="mt-0.5">
                    {row.pickup_marking}
                    {row.pickup_grid && (
                      <span className="ml-1 font-mono text-muted-foreground">
                        ({row.pickup_grid})
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {row.patient_mobility && (
                <div>
                  <dt className="font-semibold text-muted-foreground">
                    ประเภทผู้ป่วย
                  </dt>
                  <dd className="mt-0.5">
                    {MOBILITY_LABEL[row.patient_mobility] ?? row.patient_mobility}
                  </dd>
                </div>
              )}
              {row.transport_mode && (
                <div>
                  <dt className="font-semibold text-muted-foreground">
                    ยานพาหนะที่ขอ
                  </dt>
                  <dd className="mt-0.5">
                    {TRANSPORT_LABEL[row.transport_mode] ?? row.transport_mode}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* ② ผลประเมินเดินทางไปกับผู้ป่วยข้ามทุกทอด ไม่ต้องคัดลอกข้อมูล */}
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">ผลประเมินตลอดสายส่งกลับ</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              แยกตามจุดที่ดูแล เรียงจากต้นทางไปปลายทาง —
              อ่านจากบนลงล่างจะเห็นว่าแต่ละจุดทำอะไรไปบ้าง
            </p>
            {displayGroups.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                ยังไม่มีการบันทึกผลประเมินในเคสนี้
              </p>
            ) : (
              <ol className="mt-3 space-y-3">
                {displayGroups.map((g) => (
                  <li key={g.station.key}>
                    <StationCard
                      station={g.station}
                      events={g.events}
                      /* จุดสุดท้ายคือที่ผู้ป่วยอยู่ตอนนี้ ติดป้ายให้หาเจอในหนึ่งวินาที */
                      isHere={g.station.key === hereKey}
                    />
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* ③ ทอดการส่งกลับ — ปุ่มเดินสถานะและปุ่มรับผู้ป่วยอยู่ในนี้ */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">
              ทอดการส่งกลับ{" "}
              <span className="font-normal text-muted-foreground">
                ({legs.length} ทอด)
              </span>
            </h2>
            {legs.map((leg, i) => (
              <LegCard
                key={leg.id}
                leg={leg}
                vehicles={vehicles}
                transporters={transporters}
                isLast={i === legs.length - 1}
              />
            ))}
          </div>

          {/*
            ④ ประเมินผู้ป่วย — วางใต้การ์ดทอดตามที่เจ้าของโครงการสั่ง
            นายสิบพยาบาลประจำรถประเมินก่อนขึ้นรถ ปลายทางประเมินอีกครั้งตอนรับตัว
          */}
          <AssessPanel
            caseId={caseId}
            currentTriage={(row.triage as TriageColor | null) ?? null}
            /**
             * กางจนกว่าผู้ป่วยจะถูกจำหน่ายออกจากระบบ
             *
             * ⚠ ของเดิมเขียนว่า openLeg !== undefined ซึ่งเป็นจริงเสมอ
             *   เพราะบรรทัดที่ประกาศ openLeg ปิดท้ายด้วย ?? null ค่าจึงไม่เคยเป็น undefined
             *
             * ⚠⚠ และ "ทอดยังเดินอยู่" (openLeg !== null) ก็ใช้เป็นเงื่อนไขไม่ได้
             *     เพราะจังหวะที่ผู้รับต้องประเมินมากที่สุดคือ "หลังกดรับผู้ป่วย"
             *     ซึ่งเป็นจังหวะที่ทุกทอดปิดพอดี — เงื่อนไขนั้นจะพับกล่องทิ้ง
             *     ตรงจังหวะที่ต้องใช้ที่สุด (เขียนผิดไปรอบหนึ่งแล้ว เทสต์จับได้)
             *
             * เงื่อนไขที่ถูกคือ "ผู้ป่วยยังอยู่ในระบบ" — จำหน่ายแล้วค่อยพับ
             */
            open={outcome === null}
            custody={custody}
          />

          {/*
            ⑤ สายรัดห้ามเลือด

            ★ เคยอยู่บนสุดของหน้าใต้แบนเนอร์สถานะ ด้วยเหตุผลว่าเป็นข้อมูลเดียว
              ที่มีนาฬิกาเดินอยู่และมีเส้นตายทางคลินิก — 9 ก.ย. 2569 เจ้าของโครงการ
              สั่งย้ายลงมาตรงนี้ เพราะลำดับบนหน้าจอควรเดินตามลำดับที่มือทำจริง
              ปลายทางรับตัว → ประเมิน → ดูว่าติดสายรัดมากี่เส้น → ลงการรักษาเพิ่ม
              นาฬิกาไม่ได้หายไปไหน ยังนับอยู่และยังโผล่บนการ์ดในหน้ารายการทุกหน้า

            ★ ปุ่มคลายโผล่เฉพาะเมื่อผู้ป่วยอยู่ในมือคนที่ดูอยู่ (custody.ts)
              คนอื่นเห็นเป็นป้ายสถานะ — เห็นนาฬิกาได้ แต่กดคลายไม่ได้
          */}
          {tourniquets.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4">
              <TourniquetStrip
                items={tourniquets}
                returnTo={`/track/${caseId}`}
                className="border-t-0 pt-0"
                canRelease={custody.canRecordCare}
              />
            </section>
          )}

          {/* ⑥ บันทึกการรักษา — ใต้รายการสายรัดตามลำดับที่มือทำจริง */}
          <TreatmentsPanel caseId={caseId} custody={custody} />

          {/*
            กล่อง "บันทึกของจุดนี้" — กันการเลื่อนหน้าจอกลับขึ้นไปที่การ์ด ②
            (เจ้าของโครงการเจอตอนทดสอบด้วยมือ 9 ก.ย. 2569)

            ★ ใช้ผลจาก groupByStation ตัวเดียวกับการ์ด ② เอาจุดสุดท้ายมาแสดง
              จึงไม่มีทางแสดงคนละอย่างกับข้างบน และไม่มีตรรกะชุดที่สองให้ดูแล

            ★ กล่องนี้ซ้ำกับจุดสุดท้ายของการ์ด ② โดยเจตนา ไม่ใช่ความพลาด
              การ์ด ② ตอบว่า "ก่อนหน้านี้เกิดอะไรมาบ้าง" อ่านตอนเปิดเคส
              กล่องนี้ตอบว่า "ที่เพิ่งกรอกไปเข้าจริงไหม" อ่านตอนกำลังกรอก
              คนละคำถามคนละจังหวะ จึงต้องอยู่คนละที่บนหน้าจอ
          */}
          {hereGroup && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-lg font-semibold">บันทึกของจุดนี้</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {hereGroup.station.label} · {hereGroup.events.length} รายการ
              </p>
              <ol className="mt-3 space-y-2">
                {hereGroup.events.map((ev) => (
                  <li key={`here-${ev.type}-${ev.row.id}`}>
                    <TimelineEvent ev={ev} />
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* ⑦ ส่งผู้ป่วยออก — จำหน่ายไปแล้วก็แสดงผลแทน ไม่ยื่นฟอร์มให้กดซ้ำ */}
          {outcome ? (
            <DispositionSummary
              outcome={outcome}
              destUnitName={one(row.dest)?.name_th ?? null}
              diagnosis={row.diagnosis}
              icd10={row.icd10}
              feedbackNote={row.feedback_note}
            />
          ) : (
            canSendOnward &&
            lastLeg && (
              <SendPatientForm
                caseId={row.id}
                currentUnitName={one(lastLeg.to_unit)?.name_th ?? "หน่วยปลายทาง"}
                originUnitName={origin?.name_th ?? "หน่วยต้นทาง"}
                units={nextLegUnits}
              />
            )
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/sender"
              className="flex h-14 w-full items-center justify-center rounded-lg border border-border bg-background text-base font-semibold"
            >
              เปิดคำขอใหม่
            </Link>
            <Link
              href="/"
              className="flex h-14 w-full items-center justify-center rounded-lg border border-border bg-background text-base font-semibold"
            >
              กลับหน้าหลัก
            </Link>
          </div>

          {profile && (
            <p className="text-center text-xs text-muted-foreground">
              กำลังดูในนาม{" "}
              {personName({ full_name: profile.fullName, rank_th: profile.rankTh })}
              {" · "}
              {profile.unitName || profile.unitCode}
            </p>
          )}
        </div>
      </AppShell>
    </>
  );
}

/** แถบสรุปสถานะ — สีเดินตามสเกลเดียวของระบบ และมีข้อความกำกับเสมอ ไม่พึ่งสีอย่างเดียว */
function cnBanner(status: CaseStatus): string {
  const base = "rounded-xl border px-4 py-3";
  switch (status) {
    case "completed":
      return `${base} border-triage-green bg-emerald-50`;
    case "cancelled":
      return `${base} border-neutral-400 bg-neutral-100`;
    default:
      return `${base} border-triage-yellow-edge bg-amber-50`;
  }
}
