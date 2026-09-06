import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { PrecedenceBadge } from "@/components/medrelay/precedence-badge";
import { RelativeTime } from "@/components/medrelay/relative-time";
import { TriageChip } from "@/components/medrelay/triage-dot";
import { getProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import type {
  AvpuLevel,
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
import { NextLegForm, type NextLegUnitOption } from "./next-leg-form";

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

const AVPU_LABEL: Record<AvpuLevel, string> = {
  alert: "ตื่นดี",
  voice: "เรียกตื่น",
  pain: "เจ็บตื่น",
  unresponsive: "ไม่ตื่น",
};

const ASSESSMENT_KIND_LABEL: Record<string, string> = {
  initial: "แรกรับ",
  enroute: "ระหว่างเดินทาง",
  handover: "ตอนส่งมอบ",
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

/** สัญญาณชีพเป็นบรรทัดเดียว ข้ามค่าที่วัดไม่ได้ — หน้างานมักวัดไม่ครบ */
function vitalsLine(a: {
  gcs: number | null;
  sbp: number | null;
  dbp: number | null;
  pulse: number | null;
  resp_rate: number | null;
  spo2: number | null;
}): string {
  const parts: string[] = [];
  if (a.sbp !== null && a.dbp !== null) parts.push(`BP ${a.sbp}/${a.dbp}`);
  else if (a.sbp !== null) parts.push(`SBP ${a.sbp}`);
  if (a.pulse !== null) parts.push(`P ${a.pulse}`);
  if (a.resp_rate !== null) parts.push(`RR ${a.resp_rate}`);
  if (a.spo2 !== null) parts.push(`SpO₂ ${a.spo2}%`);
  if (a.gcs !== null) parts.push(`GCS ${a.gcs}`);
  return parts.join(" · ");
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
       origin:origin_unit_id (name_th),
       transfer_leg (
         id, leg_no, status, from_unit_id, to_unit_id,
         requested_at, dispatched_at, on_scene_at, departed_at, arrived_at, handover_at,
         docs_ok, property_ok, missing_note, delay_reason, note,
         from_unit:from_unit_id (name_th),
         to_unit:to_unit_id (name_th),
         vehicle:vehicle_id (call_sign, type),
         transporter:transporter_id (full_name, rank_th),
         receiver:receiver_id (full_name, rank_th)
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
      `id, kind, leg_id, gcs, sbp, dbp, pulse, resp_rate, spo2, avpu, triage,
       findings, treatment, assessed_at,
       assessor:assessed_by (full_name, rank_th)`,
    )
    .eq("case_id", caseId)
    .order("assessed_at", { ascending: true });

  const assessments = rawAssessments ?? [];
  const legNoById = new Map(rawLegs.map((l) => [l.id, l.leg_no]));

  /**
   * ตัวเลือกสำหรับปุ่มจัดรถ ดึงเฉพาะตอนที่มีทอดรอจัดรถอยู่จริง
   * ทั้งสอง query ผ่าน RLS ปกติ — บัญชีที่ไม่ใช่ศูนย์สั่งการจะเห็นแค่ของหน่วยตัวเอง
   * หรือไม่เห็นเลย ซึ่งฟอร์มจะขึ้นข้อความบอกแทนที่จะเป็น dropdown ว่าง
   */
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
   */
  const canStartNextLeg = lastLeg?.status === "completed";
  let nextLegUnits: NextLegUnitOption[] = [];

  if (canStartNextLeg && lastLeg) {
    const { data: units } = await supabase
      .from("unit")
      .select("id, name_th, role_level")
      .eq("is_active", true)
      // ปลายทางของทอดใหม่ต้องไม่ใช่หน่วยที่ผู้ป่วยอยู่ตอนนี้ (constraint leg_units_differ)
      .neq("id", lastLeg.to_unit_id)
      .order("role_level")
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

          {canStartNextLeg && lastLeg && (
            <NextLegForm
              caseId={row.id}
              currentUnitName={one(lastLeg.to_unit)?.name_th ?? "หน่วยปลายทาง"}
              units={nextLegUnits}
            />
          )}

          {/* ผลประเมินเดินทางไปกับผู้ป่วยข้ามทุกทอด ไม่ต้องคัดลอกข้อมูล */}
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">ผลประเมินตลอดสายส่งกลับ</h2>
            {assessments.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                ยังไม่มีการบันทึกผลประเมินในเคสนี้
              </p>
            ) : (
              <ol className="mt-3 space-y-3">
                {assessments.map((a) => {
                  const vitals = vitalsLine(a);
                  const legNo = a.leg_id ? legNoById.get(a.leg_id) : undefined;
                  return (
                    <li
                      key={a.id}
                      className="rounded-lg border border-border px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold">
                          {ASSESSMENT_KIND_LABEL[a.kind] ?? a.kind}
                        </span>
                        {legNo !== undefined && (
                          <span className="font-mono text-xs text-muted-foreground">
                            ทอด {legNo}
                          </span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          <RelativeTime value={a.assessed_at} />
                        </span>
                      </div>

                      {vitals && (
                        <p className="mt-1.5 font-mono text-sm">{vitals}</p>
                      )}
                      {a.avpu && (
                        <p className="mt-1 text-sm">
                          ระดับความรู้สึกตัว {AVPU_LABEL[a.avpu as AvpuLevel]}
                        </p>
                      )}
                      {a.findings && (
                        <p className="mt-1 text-sm">{a.findings}</p>
                      )}
                      {a.treatment && (
                        <p className="mt-1 text-sm">
                          <span className="font-semibold">การรักษา · </span>
                          {a.treatment}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        บันทึกโดย {personName(one(a.assessor)) ?? "ไม่ทราบผู้บันทึก"}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

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
