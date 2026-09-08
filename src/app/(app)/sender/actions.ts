"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import {
  EvacRequestInput,
  type EvacRequestState,
  type EvacRequestValues,
} from "./schema";

/**
 * Server Action ของหน้าขอส่งกลับ (F1 · Prompt 07 · ขยายใน 0021)
 *
 * ★ ยิง RPC ครั้งเดียว ไม่ใช่ .insert() หลายครั้ง
 *   create_evac_request() เปิด case + transfer_leg + assessment + casualty
 *   + treatment + property_item ภายในหนึ่ง statement ของ Postgres
 *   จึงเป็น atomic โดยอัตโนมัติ ถ้าแตกเป็นหลาย insert แล้วเน็ตหลุดกลางทาง
 *   จะเหลือเคสที่ไม่มีทอดค้างในระบบ
 *   PostgREST ไม่มี API เปิด transaction คร่อมหลายคำขอ จึงไม่มีทางแก้ที่ฝั่งเว็บ
 *
 * ★ ไม่ส่งเวลาใดๆ เข้าไปเลย ยกเว้น symptom_onset_at และ given_at ของสายรัดห้ามเลือด
 *   requested_at มาจาก default now() ของฐานข้อมูล ตาม Prompt 04
 *   ข้อยกเว้นของสายรัดมีเหตุผลอธิบายไว้ในหัวข้อท้าย migration 0020
 *
 * ★ ไม่มี service_role ที่นี่ — ใช้ client ที่ผูกกับ session ของผู้ใช้
 *   ทุกบรรทัดจึงยังผ่าน RLS policy ตามปกติ
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

/**
 * ตัดคีย์ที่ไม่มีค่าออก เพื่อไม่ส่ง null เข้าไปทับ default ของ function
 * คืนเป็น Json เพราะค่าเหล่านี้ถูกส่งเป็นพารามิเตอร์ jsonb ของ RPC
 */
function compact(o: Record<string, Json | undefined>): { [k: string]: Json } {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as { [k: string]: Json };
}

export async function createEvacRequest(
  _prev: EvacRequestState,
  formData: FormData,
): Promise<EvacRequestState> {
  /**
   * ⚠ ห้ามใช้ Object.fromEntries(formData) เพียวๆ
   *
   * มันเก็บเฉพาะค่าสุดท้ายของคีย์ที่ซ้ำกัน ช่องติ๊กอุปกรณ์ป้องกันที่ผู้ใช้เลือก 5 ช่อง
   * จะเหลือมาถึง server แค่ช่องเดียว โดยไม่มี error ใดๆ ให้จับได้เลย
   * คีย์ที่เป็นรายการจึงต้องอ่านด้วย getAll() แล้วเขียนทับกลับเข้าไป
   */
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  raw.protectiveGear = formData.getAll("protectiveGear");

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

  /**
   * ประวัติผู้ป่วยส่งเป็นก้อน jsonb ก้อนเดียว ไม่ใช่พารามิเตอร์อีก 20 ตัว
   * ชื่อคีย์ต้องตรงกับชื่อคอลัมน์ในตาราง casualty เป๊ะๆ
   * เพราะฝั่ง SQL ใช้ jsonb_populate_record ซึ่งจับคู่ด้วยชื่อคอลัมน์
   * ถ้าสะกดผิดสักคีย์ ค่าจะหายเงียบโดยไม่มี error — เป็นจุดที่ต้องระวังที่สุดของไฟล์นี้
   */
  const casualty = compact({
    rank_th: v.rankTh,
    first_name: v.firstName,
    last_name: v.lastName,
    service_number: v.serviceNumber,
    affiliation: v.affiliation,
    branch: v.branch,
    age_years: v.ageYears,
    nationality: v.nationality,
    ethnicity: v.ethnicity,
    blood_group: v.bloodGroup,
    rh: v.rh,
    drug_allergy: v.drugAllergy,
    food_allergy: v.foodAllergy,
    chronic_conditions: v.chronicConditions,
    past_history: v.pastHistory,
    regular_meds: v.regularMeds,
    weight_kg: v.weightKg,
    height_cm: v.heightCm,
    phone: v.phone,
  });

  const treatments = v.treatments.map((t) =>
    compact({
      tx_code: t.txCode,
      detail: t.detail,
      dose: t.dose,
      route: t.route,
      site: t.site,
      given_at: t.givenAt,
    }),
  );

  const propertyItems = v.propertyItems.map((i) =>
    compact({
      item_name: i.itemName,
      qty: i.qty,
      unit_label: i.unitLabel,
      weapon_serial: i.weaponSerial,
      cash_thb: i.cashThb,
      note: i.note,
    }),
  );

  const { data, error } = await supabase.rpc("create_evac_request", {
    p_precedence: v.precedence,
    p_chief_complaint: v.chiefComplaint,
    p_to_unit_id: v.toUnitId,
    p_mechanism: v.mechanism,
    p_symptom_onset_at: v.symptomOnsetAt,
    p_pickup_point_id: v.pickupPointId,
    p_pickup_grid: v.pickupGrid,
    p_transport_mode: v.transportMode,
    p_patient_category: v.patientCategory,

    // ประเมินแรกรับ
    p_avpu: v.avpu,
    p_gcs: v.gcs,
    p_sbp: v.sbp,
    p_dbp: v.dbp,
    p_pulse: v.pulse,
    p_resp_rate: v.respRate,
    p_spo2: v.spo2,
    p_temperature: v.temperature,
    p_findings: v.findings,

    // เหตุการณ์และการบาดเจ็บ
    p_report_category: v.reportCategory,
    p_patient_rank_group: v.patientRankGroup,
    p_on_duty: v.onDuty,
    p_hostile_action: v.hostileAction,
    p_operation_type: v.operationType,
    p_operating_base: v.operatingBase,
    p_injury_place: v.injuryPlace,
    p_injury_grid: v.injuryGrid,
    p_airway_status: v.airwayStatus,
    p_chest_status: v.chestStatus,
    p_wound_status: v.woundStatus,
    p_security_status: v.securityStatus,
    p_nbc_status: v.nbcStatus,
    p_other_note: v.otherNote,
    p_injury_sites: v.injurySites,
    p_protective_gear: v.protectiveGear,

    // ตารางลูก
    p_casualty: Object.keys(casualty).length > 0 ? casualty : undefined,
    p_treatments: treatments,
    p_property_items: propertyItems,

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

      if (existing) redirect(`/sender?sent=${existing.id}`);
    }

    return { error: humanize(error.code, error.message) };
  }

  // function ประกาศเป็น returns table (…) supabase-js จึงคืนเป็น array เสมอ
  const row = data?.[0];
  if (!row) return { error: "ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง" };

  /**
   * กลับหน้ารายการคำขอ ไม่ใช่หน้าติดตามเคส (คำสั่งเจ้าของโครงการ 8 ก.ย. 2569)
   * เสนารักษ์ที่หน้างานมักเปิดหลายเคสติดกัน การพากลับมาที่รายการทำให้กดปุ่ม +
   * เปิดเคสถัดไปได้ทันที ส่วนเคสที่เพิ่งส่งจะโผล่บนสุดพร้อมแถบยืนยัน
   *
   * redirect() ทำงานด้วยการโยน error ที่ Next ดักเอง ต้องอยู่นอก try/catch เสมอ
   */
  redirect(`/sender?sent=${row.case_id}`);
}
