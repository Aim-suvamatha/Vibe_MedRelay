"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  EvacRequestInput,
  type EvacRequestState,
  type EvacRequestValues,
} from "./schema";

/**
 * Server Action ของหน้าขอส่งกลับ (F1 · Prompt 07)
 *
 * ★ ยิง RPC ครั้งเดียว ไม่ใช่ .insert() สามครั้ง
 *   create_evac_request() ใน migration 0015 เปิด case + transfer_leg + assessment
 *   ภายในหนึ่ง statement ของ Postgres จึงเป็น atomic โดยอัตโนมัติ
 *   ถ้าแตกเป็นสาม insert แล้วเน็ตหลุดหลังอันแรก จะเหลือเคสที่ไม่มีทอดค้างในระบบ
 *   PostgREST ไม่มี API เปิด transaction คร่อมหลายคำขอ จึงไม่มีทางแก้ที่ฝั่งเว็บ
 *
 * ★ ไม่ส่งเวลาใดๆ เข้าไปเลย ยกเว้น symptom_onset_at
 *   requested_at มาจาก default now() ของฐานข้อมูล ตาม Prompt 04
 *   ถ้ายอมให้ client กำหนดเวลาได้ ตัวเลขบนแดชบอร์ดจะเชื่อไม่ได้ทั้งชุด
 *
 * ★ ไม่มี service_role ที่นี่ — ใช้ client ที่ผูกกับ session ของผู้ใช้
 *   ทุกบรรทัดจึงยังผ่าน RLS policy ใน 0010 ตามปกติ
 *   คนที่ไม่มีบทบาท sender จะถูกฐานข้อมูลปฏิเสธ ไม่ใช่แค่ถูกซ่อนปุ่ม
 */

/** ข้อความจาก Postgres อ่านไม่รู้เรื่องสำหรับผู้ใช้ทั่วไป แปลงเป็นภาษาที่ทำอะไรต่อได้ */
function humanize(code: string | undefined, message: string): string {
  switch (code) {
    case "42501": // insufficient_privilege — RLS ปฏิเสธ
      return "บัญชีของคุณไม่มีสิทธิ์เปิดคำขอส่งกลับ กรุณาติดต่อผู้ดูแลระบบ";
    case "22023": // invalid_parameter_value — raise จากใน function เอง
      return message;
    case "23514": // check_violation
      return "ข้อมูลบางช่องไม่ผ่านเงื่อนไขของระบบ กรุณาตรวจสอบอีกครั้ง";
    case "23503": // foreign_key_violation
      return "หน่วยปลายทางหรือจุดรับที่เลือกไม่มีอยู่ในระบบแล้ว กรุณาเลือกใหม่";
    default:
      return "ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง";
  }
}

export async function createEvacRequest(
  _prev: EvacRequestState,
  formData: FormData,
): Promise<EvacRequestState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = EvacRequestInput.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: EvacRequestState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof EvacRequestValues | undefined;
      // เก็บเฉพาะข้อความแรกของแต่ละช่อง — ผู้ใช้แก้ทีละอย่างอยู่แล้ว
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "กรอกข้อมูลไม่ครบหรือไม่ถูกต้อง", fieldErrors };
  }

  const v = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_evac_request", {
    p_precedence: v.precedence,
    p_chief_complaint: v.chiefComplaint,
    p_to_unit_id: v.toUnitId,
    p_patient_alias: v.patientAlias,
    p_patient_count: v.patientCount,
    p_mechanism: v.mechanism,
    p_symptom_onset_at: v.symptomOnsetAt,
    p_pickup_point_id: v.pickupPointId,
    p_pickup_marking: v.pickupMarking,
    p_patient_mobility: v.patientMobility,
    p_transport_mode: v.transportMode,
    p_triage: v.triage,
    p_avpu: v.avpu,
    p_gcs: v.gcs,
    p_sbp: v.sbp,
    p_dbp: v.dbp,
    p_pulse: v.pulse,
    p_resp_rate: v.respRate,
    p_spo2: v.spo2,
    p_findings: v.findings,
    p_client_uuid: v.clientUuid,
  });

  if (error) {
    /**
     * 23505 = unique_violation บน case_client_uuid_key
     *
     * แปลว่าคำขอนี้ "ส่งสำเร็จไปแล้ว" แต่ผู้ใช้ไม่เห็นผล
     * เช่นกดปุ่มแล้วเน็ตหลุดตอนรอคำตอบ แล้วกดซ้ำ หรือกด refresh แล้ว submit ใหม่
     * ต้องพาไปหน้าเคสเดิม ไม่ใช่แจ้ง error และไม่ใช่สร้างเคสที่สอง
     * — นี่คือเหตุผลที่ตาราง case มี UNIQUE (client_uuid)
     */
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("case")
        .select("id")
        .eq("client_uuid", v.clientUuid)
        .maybeSingle();

      if (existing) redirect(`/track/${existing.id}`);
    }

    return { error: humanize(error.code, error.message) };
  }

  // function ประกาศเป็น returns table (…) supabase-js จึงคืนเป็น array เสมอ
  const row = data?.[0];
  if (!row) return { error: "ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง" };

  // redirect() ทำงานด้วยการโยน error ที่ Next ดักเอง ต้องอยู่นอก try/catch เสมอ
  redirect(`/track/${row.case_id}`);
}
