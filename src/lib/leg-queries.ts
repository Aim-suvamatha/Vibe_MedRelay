import { createClient } from "@/lib/supabase/server";
import type { LegStatus, PrecedenceLevel, TriageColor } from "@/lib/enums";

/**
 * query รายการทอดที่ใช้ร่วมกันทั้งหน้า Transporter · Receiver · Monitor
 *
 * ★ ทั้งสามหน้าถามคำถามเดียวกันในมุมต่างกัน — "ทอดไหนที่ฉันต้องทำอะไรต่อ"
 *   ถ้าต่างหน้าต่างเขียน select string เอง วันหนึ่งจะเพี้ยนกันแล้วหาไม่เจอว่าหน้าไหนผิด
 *   จึงรวมไว้ที่เดียวและคืน type เดียวกันเสมอ
 *
 * ★ ไม่มีการเช็คสิทธิ์ในไฟล์นี้เลยแม้แต่บรรทัดเดียว
 *   RLS policy leg_select ใน 0010 กรองให้แล้วว่าใครเห็นทอดไหน
 *   transporter เห็นทอดที่ตัวเองถือ · หน่วยปลายทางเห็นทอดที่วิ่งเข้าหน่วยตน
 *   monitor เห็นทั้งหมด — ทุกหน้าจึงเรียก function เดียวกันได้โดยไม่ต้องกรองซ้ำ
 *   ที่กรองด้วย .eq()/.in() ในนี้คือการ "เลือกมุมมอง" ไม่ใช่การกันข้อมูล
 */

/** ทอดที่ยังต้องมีคนทำอะไรต่อ — ใช้ซ้ำหลายที่จึงตั้งชื่อไว้ */
export const OPEN_LEG_STATUSES: readonly LegStatus[] = [
  "pending",
  "dispatched",
  "on_scene",
  "in_transit",
  "arrived",
];

/** ทอดที่ผู้ป่วยอยู่บนรถหรือกำลังจะถึงปลายทางแล้ว */
export const INBOUND_LEG_STATUSES: readonly LegStatus[] = [
  "dispatched",
  "on_scene",
  "in_transit",
  "arrived",
];

export type LegListItem = {
  id: string;
  caseId: string;
  caseCode: string;
  legNo: number;
  status: LegStatus;
  precedence: PrecedenceLevel;
  triage: TriageColor | null;
  chiefComplaint: string;
  patientAlias: string | null;
  patientCount: number;
  fromUnit: string;
  toUnit: string;
  vehicle: string | null;
  transporter: string | null;
  /** เวลาที่ทอดถูกร้องขอ — ใช้คิด "รอมานานเท่าไร" */
  requestedAt: string;
  /** เวลาของขั้นล่าสุดที่เกิดขึ้นจริง ใช้แสดงว่า "อัปเดตล่าสุดเมื่อไร" */
  lastEventAt: string;
};

const SELECT = `
  id, case_id, leg_no, status, requested_at,
  dispatched_at, on_scene_at, departed_at, arrived_at, handover_at,
  from_unit:from_unit_id (name_th),
  to_unit:to_unit_id (name_th),
  vehicle:vehicle_id (call_sign),
  transporter:transporter_id (full_name, rank_th),
  case:case_id (case_code, precedence, triage, chief_complaint, patient_alias, patient_count)
`;

/** PostgREST คืน relation แบบ many-to-one เป็น object แต่บาง query คืนเป็น array */
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

type RawLeg = {
  id: string;
  case_id: string;
  leg_no: number;
  status: string;
  requested_at: string;
  dispatched_at: string | null;
  on_scene_at: string | null;
  departed_at: string | null;
  arrived_at: string | null;
  handover_at: string | null;
  from_unit: { name_th: string } | { name_th: string }[] | null;
  to_unit: { name_th: string } | { name_th: string }[] | null;
  vehicle: { call_sign: string } | { call_sign: string }[] | null;
  transporter:
    | { full_name: string; rank_th: string | null }
    | { full_name: string; rank_th: string | null }[]
    | null;
  case:
    | {
        case_code: string;
        precedence: string;
        triage: string | null;
        chief_complaint: string;
        patient_alias: string | null;
        patient_count: number;
      }
    | {
        case_code: string;
        precedence: string;
        triage: string | null;
        chief_complaint: string;
        patient_alias: string | null;
        patient_count: number;
      }[]
    | null;
};

function toItem(l: RawLeg): LegListItem | null {
  const c = one(l.case);
  // เคสหายไปแปลว่า RLS ไม่ให้เห็นตัวเคส — ข้ามแถวนั้นดีกว่าวาดการ์ดเปล่า
  if (!c) return null;

  const t = one(l.transporter);

  return {
    id: l.id,
    caseId: l.case_id,
    caseCode: c.case_code,
    legNo: l.leg_no,
    status: l.status as LegStatus,
    precedence: c.precedence as PrecedenceLevel,
    triage: (c.triage as TriageColor | null) ?? null,
    chiefComplaint: c.chief_complaint,
    patientAlias: c.patient_alias,
    patientCount: c.patient_count,
    fromUnit: one(l.from_unit)?.name_th ?? "—",
    toUnit: one(l.to_unit)?.name_th ?? "—",
    vehicle: one(l.vehicle)?.call_sign ?? null,
    transporter: t ? (t.rank_th ? `${t.rank_th} ${t.full_name}` : t.full_name) : null,
    requestedAt: l.requested_at,
    lastEventAt:
      l.handover_at ??
      l.arrived_at ??
      l.departed_at ??
      l.on_scene_at ??
      l.dispatched_at ??
      l.requested_at,
  };
}

function mapRows(rows: unknown): LegListItem[] {
  return ((rows ?? []) as RawLeg[])
    .map(toItem)
    .filter((x): x is LegListItem => x !== null);
}

/** ภารกิจของผู้ลำเลียงคนนี้ — ทอดที่เขาถูกตั้งเป็น transporter_id */
export async function getMyTransportLegs(profileId: string) {
  const supabase = await createClient();

  const [{ data: open }, { data: done }] = await Promise.all([
    supabase
      .from("transfer_leg")
      .select(SELECT)
      .eq("transporter_id", profileId)
      .in("status", [...OPEN_LEG_STATUSES])
      // ทอดที่ร้องขอมานานที่สุดขึ้นก่อน — คนรอนานที่สุดต้องไม่ตกหล่น
      .order("requested_at", { ascending: true }),
    supabase
      .from("transfer_leg")
      .select(SELECT)
      .eq("transporter_id", profileId)
      .eq("status", "completed")
      .order("handover_at", { ascending: false })
      .limit(5),
  ]);

  return { open: mapRows(open), done: mapRows(done) };
}

/** ผู้ป่วยที่กำลังมาถึงหน่วยนี้ และที่รับมอบไปแล้ว */
export async function getIncomingLegs(unitId: string) {
  const supabase = await createClient();

  const [{ data: inbound }, { data: done }] = await Promise.all([
    supabase
      .from("transfer_leg")
      .select(SELECT)
      .eq("to_unit_id", unitId)
      .in("status", [...INBOUND_LEG_STATUSES])
      .order("requested_at", { ascending: true }),
    supabase
      .from("transfer_leg")
      .select(SELECT)
      .eq("to_unit_id", unitId)
      .eq("status", "completed")
      .order("handover_at", { ascending: false })
      .limit(5),
  ]);

  return { inbound: mapRows(inbound), done: mapRows(done) };
}

/** คิวของศูนย์สั่งการ — รอจัดรถ กับ กำลังเดินทาง */
export async function getDispatchQueue() {
  const supabase = await createClient();

  const [{ data: waiting }, { data: moving }] = await Promise.all([
    supabase
      .from("transfer_leg")
      .select(SELECT)
      .eq("status", "pending")
      .order("requested_at", { ascending: true }),
    supabase
      .from("transfer_leg")
      .select(SELECT)
      .in("status", [...INBOUND_LEG_STATUSES])
      .order("requested_at", { ascending: true }),
  ]);

  return { waiting: mapRows(waiting), moving: mapRows(moving) };
}
