import { INBOUND_LEG_STATUSES } from "@/lib/leg-queries";
import { createClient } from "@/lib/supabase/server";
import {
  groupRoutes,
  sumReported,
  type RouteLegRow,
  type RoutePairRow,
  type RouteStat,
} from "./routes.ts";
import {
  AIR_MODES,
  type AirCase,
  type EvacNode,
  type ResourceSnapshot,
  type VehicleRow,
} from "./monitor-view.ts";
import type {
  AirDecision,
  PrecedenceLevel,
  RoleOfCare,
  TransportMode,
  TriageColor,
  VehicleStatus,
  VehicleType,
} from "@/lib/enums";

/**
 * ทรัพยากรของศูนย์สั่งการ (บทบาท monitor · 0025)
 *
 * ★ ไฟล์นี้ต้องเป็น plain module ห้ามมี "use server"
 *   ทั้ง server component (monitor/page.tsx) และ server action (air-actions.ts)
 *   import ค่าคงที่จากที่นี่ ถ้าไฟล์มี "use server" ค่าที่ export ออกไปจะกลายเป็น
 *   server reference ไม่ใช่ array/object แล้วพังตอน render โดย typecheck จับไม่เจอ
 *   (บทเรียนเดียวกับ ASSESSOR_ROLES เมื่อ 8 ก.ย. 2569 — "roles.some is not a function")
 *
 * ★ ไม่มีการเช็คสิทธิ์ในไฟล์นี้เลย เหมือน leg-queries.ts
 *   RLS เป็นด่านจริง — vehicle_select ให้เห็นเฉพาะรถหน่วยตัวเองยกเว้น monitor
 *   ที่เห็นทุกคัน · unit_select ให้ทุกคนอ่านได้ · case_select กรองตาม can_see_case()
 *   หน้าที่เรียกต้องเช็คบทบาท **ก่อน** ยิง query เสมอ ไม่ใช่เอา RoleGate ครอบผลทีหลัง
 *
 * ★ รวมยอดฝั่ง TS ไม่ทำเป็น SQL view
 *   เหตุผลเดียวกับที่ metrics.ts คิด median ฝั่งเว็บ — ข้อมูลระดับ prototype
 *   มีหลักสิบแถว การเพิ่ม view ต้องมาคิดเรื่อง security_invoker ให้ถูกอีกชั้น
 *   ซึ่งเป็นจุดที่พลาดแล้วกลายเป็นช่องรั่วที่ใหญ่ที่สุดในระบบ (ดูหัวไฟล์ 0011)
 */

/* -------------------------------------------------------------
 * helper
 * ----------------------------------------------------------- */

/** PostgREST คืน relation แบบ many-to-one เป็น object แต่บาง query คืนเป็น array */
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/* -------------------------------------------------------------
 * 1. ภาพรวมทรัพยากร — รถ · กำลังพล · จุดส่งกลับ
 * ----------------------------------------------------------- */

export async function getResourceSnapshot(): Promise<ResourceSnapshot> {
  const supabase = await createClient();

  const [{ data: rawVehicles }, { data: rawUnits }, { data: inboundLegs }] =
    await Promise.all([
    supabase
      .from("vehicle")
      .select(
        "id, call_sign, type, status, crew_note, medic_count, driver_count, litter_count, unit:unit_id (name_th)",
      )
      .order("status")
      .order("call_sign"),
    supabase
      .from("unit")
      .select("id, code, name_th, role_level, grid_ref, bed_available, medic_on_duty")
      .eq("is_active", true)
      // ศูนย์สั่งการเป็นหน่วยในระบบแต่ไม่ใช่จุดส่งกลับ ถ้าไม่กรองมันจะไปยืน
      // อยู่บนผังพร้อมป้ายเตียงว่าง ซึ่งอ่านได้ว่าเป็นปลายทางที่รับผู้ป่วยได้ (0026)
      .eq("is_evac_node", true)
      .order("role_level")
      .order("name_th"),
    supabase
      .from("transfer_leg")
      .select("to_unit_id")
      .in("status", [...INBOUND_LEG_STATUSES]),
  ]);

  const inboundByUnit = new Map<string, number>();
  for (const l of inboundLegs ?? []) {
    inboundByUnit.set(l.to_unit_id, (inboundByUnit.get(l.to_unit_id) ?? 0) + 1);
  }

  const vehicles: VehicleRow[] = (rawVehicles ?? []).map((v) => ({
    id: v.id,
    callSign: v.call_sign,
    type: v.type as VehicleType,
    status: v.status as VehicleStatus,
    unitName: one(v.unit as { name_th: string } | { name_th: string }[] | null)?.name_th ?? "—",
    crewNote: v.crew_note,
    medicCount: v.medic_count ?? 0,
    driverCount: v.driver_count ?? 0,
    litterCount: v.litter_count ?? 0,
  }));

  const nodes: EvacNode[] = (rawUnits ?? []).map((u) => ({
    id: u.id,
    code: u.code,
    nameTh: u.name_th,
    roleLevel: u.role_level as RoleOfCare,
    gridRef: u.grid_ref,
    bedAvailable: u.bed_available,
    medicOnDuty: u.medic_on_duty,
    inbound: inboundByUnit.get(u.id) ?? 0,
  }));

  const free = vehicles.filter((v) => v.status === "available");

  return {
    vehicles,
    nodes,
    vehiclesTotal: vehicles.length,
    vehiclesFree: free.length,
    medicsFree: free.reduce((n, v) => n + v.medicCount, 0),
    medicsOnVehicles: vehicles.reduce((n, v) => n + v.medicCount, 0),
    medicsOnDuty: sumReported(nodes.map((n) => n.medicOnDuty)),
    bedsAvailable: sumReported(nodes.map((n) => n.bedAvailable)),
  };
}

/* -------------------------------------------------------------
 * 2. คำขอส่งกลับทางอากาศ
 *
 * "รออนุมัติ" ไม่ได้เก็บเป็นค่าในฐานข้อมูล แต่คำนวณจากสองข้อเท็จจริงที่มีอยู่แล้ว
 * คือโหมดที่ขอเป็นอากาศยาน และยังไม่มีใครตัดสิน (เหตุผลเต็มอยู่ในหัวไฟล์ 0025)
 * ----------------------------------------------------------- */

const AIR_SELECT = `
  id, case_code, patient_alias, precedence, triage, chief_complaint, requested_at,
  transport_mode, air_decision, air_decision_at, air_decision_note, air_mode_granted,
  origin:origin_unit_id (name_th),
  decider:air_decision_by (full_name, rank_th),
  casualty (rank_th, first_name, last_name)
`;

type RawAirCase = {
  id: string;
  case_code: string;
  patient_alias: string | null;
  precedence: string;
  triage: string | null;
  chief_complaint: string;
  requested_at: string;
  transport_mode: string | null;
  air_decision: string | null;
  air_decision_at: string | null;
  air_decision_note: string | null;
  air_mode_granted: string | null;
  origin: { name_th: string } | { name_th: string }[] | null;
  decider:
    | { full_name: string; rank_th: string | null }
    | { full_name: string; rank_th: string | null }[]
    | null;
  casualty:
    | { rank_th: string | null; first_name: string | null; last_name: string | null }
    | { rank_th: string | null; first_name: string | null; last_name: string | null }[]
    | null;
};

function toAirCase(c: RawAirCase): AirCase {
  const cas = one(c.casualty);
  const name = [cas?.rank_th, cas?.first_name, cas?.last_name].filter(Boolean).join(" ");
  const d = one(c.decider);

  return {
    id: c.id,
    caseCode: c.case_code,
    patientAlias: c.patient_alias,
    patientName: name || null,
    precedence: c.precedence as PrecedenceLevel,
    triage: (c.triage as TriageColor | null) ?? null,
    chiefComplaint: c.chief_complaint,
    requestedAt: c.requested_at,
    requestedMode: c.transport_mode as TransportMode,
    originUnit: one(c.origin)?.name_th ?? "—",
    decision: (c.air_decision as AirDecision | null) ?? null,
    decisionAt: c.air_decision_at,
    decisionNote: c.air_decision_note,
    modeGranted: (c.air_mode_granted as TransportMode | null) ?? null,
    // ผู้ตัดสินอาจคืน null ถ้า policy profile_select ไม่ให้ผู้อ่านเห็นแถวนั้น
    // ซึ่งไม่เกิดกับ monitor เพราะ policy ยอมให้เขาเห็น profile ทุกแถว
    decidedBy: d ? (d.rank_th ? `${d.rank_th} ${d.full_name}` : d.full_name) : null,
  };
}

export async function getAirQueue(): Promise<{
  pending: AirCase[];
  decided: AirCase[];
}> {
  const supabase = await createClient();
  const modes = [...AIR_MODES];

  const [{ data: pending }, { data: decided }] = await Promise.all([
    supabase
      .from("case")
      .select(AIR_SELECT)
      .in("transport_mode", modes)
      .is("air_decision", null)
      // เคสที่ปิดไปแล้วไม่ต้องตัดสินอีก ผู้ป่วยถึงปลายทางหรือถูกจำหน่ายแล้ว
      .in("status", ["requested", "active"])
      // คนที่รอนานที่สุดขึ้นก่อน — หลักการเดียวกับคิวจัดรถใน leg-queries.ts
      .order("requested_at", { ascending: true }),
    supabase
      .from("case")
      .select(AIR_SELECT)
      .not("air_decision", "is", null)
      .order("air_decision_at", { ascending: false })
      .limit(5),
  ]);

  return {
    pending: ((pending ?? []) as RawAirCase[]).map(toAirCase),
    decided: ((decided ?? []) as RawAirCase[]).map(toAirCase),
  };
}

/* -------------------------------------------------------------
 * 3. เส้นทางการส่งกลับ — ตัว groupRoutes() อยู่ใน routes.ts
 * ----------------------------------------------------------- */

export async function getRouteStats(): Promise<RouteStat[]> {
  const supabase = await createClient();

  const [{ data: done }, { data: moving }, { data: units }] = await Promise.all([
    supabase.from("v_leg_metrics").select("from_unit_id, to_unit_id, leg_total_sec"),
    supabase
      .from("transfer_leg")
      .select("from_unit_id, to_unit_id")
      .in("status", [...INBOUND_LEG_STATUSES]),
    supabase.from("unit").select("id, name_th"),
  ]);

  const names = new Map((units ?? []).map((u) => [u.id, u.name_th]));

  return groupRoutes(
    (done ?? []) as RouteLegRow[],
    (moving ?? []) as RoutePairRow[],
    (id) => names.get(id) ?? "—",
  );
}
