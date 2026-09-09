"use server";

import { revalidatePath } from "next/cache";

import { getProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import type {
  CaseOutcome,
  LegStatus,
  PrecedenceLevel,
  TransportMode,
} from "@/lib/enums";
import type { Database } from "@/types/database";
import {
  LEG_FLOW,
  LEG_STATUS_LABEL,
  nextStep,
  previousStatusOf,
} from "@/lib/leg-flow";
import { PRECEDENCE } from "@/lib/triage";
import { OUTCOME_VALUES, PRECEDENCE_VALUES_RO } from "../../sender/schema";

/**
 * Server Action ของหน้าติดตามสถานะ (F3 · Prompt 08)
 *
 * ★ ไม่มีที่ใดในไฟล์นี้ส่งค่าเวลาเข้า database เลยแม้แต่ตัวเดียว
 *   ทุก timestamp เกิดจาก trigger set_leg_timestamps ใน 0009 ตอน status เปลี่ยน
 *   ตัวเลขบนแดชบอร์ดจึงเป็นเวลาที่ "เหตุการณ์ถูกบันทึก" ไม่ใช่เวลาที่ผู้ใช้พิมพ์
 *
 * ★ ใช้ client ที่ผูกกับ session ของผู้ใช้ ไม่มี service_role ที่นี่
 *   คนที่ไม่ใช่ผู้ถือทอดจะถูก RLS policy leg_update ใน 0010 ปฏิเสธ
 *   การเช็คสถานะก่อน update ในไฟล์นี้เป็นเรื่องข้อความ error ที่อ่านรู้เรื่อง
 *   ไม่ใช่ชั้นความปลอดภัย — ชั้นที่กันจริงอยู่ที่ database
 *
 * ★ ห้ามใช้ .insert().select() กับ transfer_leg (HANDOFF §5 ข้อ 10)
 *   RETURNING บังคับให้ policy ฝั่ง SELECT ตรวจแถวที่คำสั่งเดียวกันเพิ่งสร้าง
 *   can_see_case() เป็น stable จึงมองไม่เห็นแถวนั้นแล้วตอบว่าไม่มีสิทธิ์
 *
 *   ⚠ ข้อห้ามนั้นใช้กับ INSERT เท่านั้น — กับ UPDATE ต้องใช้ .select() เสมอ
 *     UPDATE ที่ policy ปฏิเสธจะแก้ 0 แถว "โดยไม่มี error" (HANDOFF §5 ข้อ 13)
 *     ถ้าดูแต่ error ปุ่มจะรายงานว่าสำเร็จทั้งที่ไม่มีอะไรเปลี่ยน ซึ่งอันตราย
 *     กว่าปุ่มที่กดไม่ได้เลย เพราะผู้ใช้เดินต่อไปโดยเชื่อว่าบันทึกแล้ว
 *     แถวที่ UPDATE แตะมีอยู่ก่อนแล้ว can_see_case() จึงมองเห็นตามปกติ
 */

export type LegActionState = {
  error?: string;
  /** id ของทอดที่เพิ่งทำสำเร็จ ใช้เลื่อนหน้าจอกลับไปที่ทอดนั้น */
  okLegId?: string;
};

/** ข้อความจาก Postgres อ่านไม่รู้เรื่องสำหรับผู้ใช้ทั่วไป แปลงเป็นภาษาที่ทำอะไรต่อได้ */
function humanize(code: string | undefined, fallback: string): string {
  switch (code) {
    case "42501": // insufficient_privilege — RLS ปฏิเสธ
      return "บัญชีของคุณไม่มีสิทธิ์ทำรายการนี้ในทอดนี้ กรุณาให้ผู้ที่ถือทอดเป็นผู้กด";
    case "23514": // check_violation — เกือบทุกครั้งคือ leg_time_order
      return "ข้ามขั้นตอนไม่ได้ ระบบบันทึกเวลาได้เฉพาะเมื่อขั้นก่อนหน้าถูกบันทึกแล้ว";
    case "23503": // foreign_key_violation
      return "รถ หน่วยปลายทาง หรือผู้ใช้ที่เลือกไม่มีอยู่ในระบบแล้ว กรุณาเลือกใหม่";
    case "23505": // unique_violation — leg_unique_per_case
      return "มีทอดถัดไปในเคสนี้อยู่แล้ว กรุณารีเฟรชหน้าจอ";
    default:
      return fallback;
  }
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** checkbox ที่ไม่ติ๊กจะไม่ถูกส่งมาใน FormData เลย ค่าที่ได้จึงเป็น boolean เสมอ */
function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

/** อ่านทอดพร้อมข้อมูลที่ต้องใช้ตรวจ — คืน null เมื่อผู้ใช้ไม่มีสิทธิ์เห็นเคสนี้ */
async function loadLeg(legId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transfer_leg")
    .select(
      "id, case_id, leg_no, status, to_unit_id, from_unit_id, handover_ready_at, handover_ready_by",
    )
    .eq("id", legId)
    .maybeSingle();
  return data;
}

/* =============================================================
 * 1. จัดรถ — pending -> dispatched
 *
 * ขั้นนี้ต่างจากขั้นอื่นตรงที่ไม่ได้เปลี่ยนแค่ status แต่ผูก "ใครและคันไหน" เข้ากับทอดด้วย
 * transporter_id สำคัญที่สุด เพราะ policy leg_update ยอมให้คนที่เป็น transporter_id
 * เดินสถานะต่อได้ ถ้าไม่ตั้งไว้ ชุดลำเลียงจะกดขั้นถัดไปไม่ได้เลย
 * ============================================================= */
export async function dispatchLeg(
  _prev: LegActionState,
  formData: FormData,
): Promise<LegActionState> {
  const legId = str(formData, "legId");
  const vehicleId = str(formData, "vehicleId");
  const transporterId = str(formData, "transporterId");

  if (!legId) return { error: "ไม่พบทอดที่ต้องการจัดรถ" };
  if (!vehicleId) return { error: "กรุณาเลือกรถที่จะจัดให้ทอดนี้" };
  if (!transporterId) return { error: "กรุณาเลือกผู้ลำเลียงที่รับผิดชอบทอดนี้" };

  const leg = await loadLeg(legId);
  if (!leg) return { error: "ไม่พบทอดนี้ หรือบัญชีของคุณไม่มีสิทธิ์เห็นเคสนี้" };
  if (leg.status !== "pending") {
    return {
      error: `ทอดนี้ผ่านขั้นจัดรถไปแล้ว (สถานะปัจจุบัน: ${LEG_STATUS_LABEL[leg.status as LegStatus]})`,
    };
  }

  const supabase = await createClient();
  const { data: changed, error } = await supabase
    .from("transfer_leg")
    .update({
      status: "dispatched",
      vehicle_id: vehicleId,
      transporter_id: transporterId,
    })
    .eq("id", legId)
    // กันการกดพร้อมกันสองเครื่อง — ถ้าอีกคนจัดรถไปแล้วเงื่อนไขนี้จะไม่ตรงและไม่มีแถวถูกแก้
    .eq("status", "pending")
    .select("id");

  if (error) return { error: humanize(error.code, "จัดรถไม่สำเร็จ กรุณาลองอีกครั้ง") };
  if (!changed || changed.length === 0) {
    return { error: humanize("42501", "จัดรถไม่สำเร็จ กรุณาลองอีกครั้ง") };
  }

  // สถานะรถเปลี่ยนเป็น 'dispatched' เองโดย trigger sync_vehicle_status ใน 0016
  // ห้ามยิง update ตาราง vehicle จากที่นี่ — policy vehicle_update ยอมเฉพาะ monitor/admin
  // ซึ่งจะทำให้ผู้กดที่ไม่ใช่ศูนย์สั่งการได้ผลลัพธ์ครึ่งๆ โดยไม่มีอะไรบอก

  revalidatePath(`/track/${leg.case_id}`);
  return { okLegId: legId };
}

/* =============================================================
 * 2. เดินสถานะหนึ่งขั้น — on_scene / in_transit / arrived / completed
 *
 * รับ "สถานะเป้าหมาย" มาจากฟอร์มแทนที่จะให้ action คิดเอง
 * เพราะถ้าผู้ใช้เปิดหน้าค้างไว้แล้วมีคนอื่นเดินสถานะไปก่อน การกดปุ่มเดิม
 * จะต้องล้มเหลวพร้อมข้อความที่บอกว่าเกิดอะไรขึ้น ไม่ใช่กระโดดข้ามไปขั้นอื่นเงียบๆ
 * ============================================================= */
export async function advanceLeg(
  _prev: LegActionState,
  formData: FormData,
): Promise<LegActionState> {
  const legId = str(formData, "legId");
  const target = str(formData, "target") as LegStatus;

  if (!legId) return { error: "ไม่พบทอดที่ต้องการอัปเดต" };

  const step = LEG_FLOW.find((s) => s.status === target);
  if (!step || target === "pending") {
    return { error: "สถานะที่ส่งมาไม่ถูกต้อง" };
  }

  const leg = await loadLeg(legId);
  if (!leg) return { error: "ไม่พบทอดนี้ หรือบัญชีของคุณไม่มีสิทธิ์เห็นเคสนี้" };

  const required = previousStatusOf(target);
  if (leg.status !== required) {
    const expected = nextStep(leg.status as LegStatus);
    return {
      error: expected
        ? `สถานะบนหน้าจอไม่ตรงกับในระบบแล้ว ตอนนี้ทอดนี้อยู่ที่ "${LEG_STATUS_LABEL[leg.status as LegStatus]}" ขั้นถัดไปคือ "${expected.action}" กรุณารีเฟรชหน้าจอ`
        : `ทอดนี้ปิดแล้ว (${LEG_STATUS_LABEL[leg.status as LegStatus]})`,
    };
  }

  type LegPatch = Database["public"]["Tables"]["transfer_leg"]["Update"];
  const patch: LegPatch = { status: target };

  if (target === "completed") {
    /**
     * ตั้งแต่ 0022 ขั้นนี้คือ "ฝ่ายที่สองยืนยันรับมอบ" ไม่ใช่การส่งมอบทั้งกระบวนการ
     * รายการตรวจ ทบ.466-903 ถูกเก็บไปแล้วตอนฝ่ายแรกกด (ดู offerHandover ข้อ 2.5)
     *
     * constraint leg_time_order ปฏิเสธการปิดทอดที่ไม่มี handover_ready_at อยู่แล้ว
     * แต่ดักที่นี่ด้วยเพื่อให้ได้ข้อความที่บอกว่าต้องรอใคร ไม่ใช่ error ของ database
     */
    if (!leg.handover_ready_at) {
      return {
        error:
          "ชุดลำเลียงยังไม่ได้กดส่งมอบ การรับมอบต้องเกิดหลังฝ่ายส่งลงบันทึกแล้วเท่านั้น",
      };
    }

    /**
     * ผู้รับปลายทางคือคนที่สังกัดหน่วยปลายทางของทอดนี้
     * ถ้าคนกดเป็นชุดลำเลียง (คนละหน่วย) ปล่อย receiver_id ว่างไว้ดีกว่าใส่ผิดคน
     * — ช่องลงนามผู้รับในแบบฟอร์มกระดาษก็เว้นว่างได้ถ้ายังไม่มีใครเซ็น
     */
    const profile = await getProfile();
    if (profile && profile.unitId === leg.to_unit_id) {
      patch.receiver_id = profile.id;
    }
  }

  const delay = str(formData, "delayReason");
  if (delay) patch.delay_reason = delay.slice(0, 500);

  const supabase = await createClient();
  const { data: changed, error } = await supabase
    .from("transfer_leg")
    .update(patch)
    .eq("id", legId)
    // กันสองเครื่องกดพร้อมกัน — เดินได้จากสถานะที่เห็นตอนตรวจเท่านั้น
    .eq("status", required)
    .select("id");

  if (error) {
    return { error: humanize(error.code, "บันทึกสถานะไม่สำเร็จ กรุณาลองอีกครั้ง") };
  }
  if (!changed || changed.length === 0) {
    return { error: humanize("42501", "บันทึกสถานะไม่สำเร็จ กรุณาลองอีกครั้ง") };
  }

  // รถถูกคืนเข้ากระดานเองโดย trigger sync_vehicle_status ใน 0016
  // คนที่กดส่งมอบคือชุดลำเลียงหรือผู้รับปลายทาง ซึ่งไม่มีสิทธิ์แก้ตาราง vehicle ตาม RLS
  // ถ้าทำที่นี่ รถจะค้างสถานะ 'dispatched' ตลอดไปโดยไม่มี error ให้เห็น

  revalidatePath(`/track/${leg.case_id}`);
  return { okLegId: legId };
}

/* =============================================================
 * 2.5 ส่งมอบผู้ป่วย (ฝ่ายแรก) — ชุดลำเลียงลงบันทึก แต่ทอดยังไม่ปิด
 *
 * ทำไมต้องแยกเป็นสองปุ่มแทนที่จะให้คนเดียวกดจบ (คำสั่งเจ้าของโครงการ 8 ก.ย. 2569)
 *   การส่งมอบผู้ป่วยคือการเปลี่ยนมือผู้รับผิดชอบ ถ้าฝ่ายเดียวกดปิดได้
 *   ระบบจะบันทึกว่า "ส่งมอบแล้ว" ทั้งที่ปลายทางอาจยังไม่มีใครรับรู้
 *   ซึ่งเป็นช่วงที่ผู้ป่วยไม่มีเจ้าของ — จุดที่อันตรายที่สุดของทั้งสายส่งกลับ
 *
 * ขั้นนี้ไม่เปลี่ยน status (ยังเป็น 'arrived') เปลี่ยนแค่ handover_ready_by
 * เวลา handover_ready_at ถูก trigger set_leg_timestamps ตีตราให้เอง
 * ============================================================= */
export async function offerHandover(
  _prev: LegActionState,
  formData: FormData,
): Promise<LegActionState> {
  const legId = str(formData, "legId");
  if (!legId) return { error: "ไม่พบทอดที่ต้องการส่งมอบ" };

  const leg = await loadLeg(legId);
  if (!leg) return { error: "ไม่พบทอดนี้ หรือบัญชีของคุณไม่มีสิทธิ์เห็นเคสนี้" };

  if (leg.status !== "arrived") {
    return {
      error: `ส่งมอบได้เมื่อถึงปลายทางแล้วเท่านั้น (สถานะปัจจุบัน: ${LEG_STATUS_LABEL[leg.status as LegStatus]})`,
    };
  }
  if (leg.handover_ready_at) {
    return { error: "ทอดนี้ถูกส่งมอบไปแล้ว กำลังรอผู้รับปลายทางยืนยัน" };
  }

  const profile = await getProfile();
  if (!profile) return { error: "ไม่พบบัญชีผู้ใช้ กรุณาเข้าสู่ระบบใหม่" };

  /**
   * ช่องตรวจก่อนส่งมอบจาก ทบ.466-903 — เอกสารครบ · สิ่งของครบ · ถ้าไม่ครบขาดอะไร
   * เก็บทุกครั้งแม้ติ๊กครบ เพราะ "ตรวจแล้วครบ" กับ "ไม่เคยตรวจ" ต่างกันในทางคดี
   */
  const docsOk = checked(formData, "docsOk");
  const propertyOk = checked(formData, "propertyOk");
  const missing = str(formData, "missingNote");

  if ((!docsOk || !propertyOk) && !missing) {
    return { error: "มีรายการที่ยังไม่ครบ กรุณาระบุว่าขาดอะไรก่อนกดส่งมอบ" };
  }

  const supabase = await createClient();
  const { data: changed, error } = await supabase
    .from("transfer_leg")
    .update({
      handover_ready_by: profile.id,
      docs_ok: docsOk,
      property_ok: propertyOk,
      missing_note: missing === "" ? null : missing.slice(0, 500),
    })
    .eq("id", legId)
    // กันสองเครื่องกดพร้อมกัน — ฝ่ายแรกลงบันทึกได้ครั้งเดียว
    .eq("status", "arrived")
    .is("handover_ready_at", null)
    .select("id");

  if (error) return { error: humanize(error.code, "ส่งมอบไม่สำเร็จ กรุณาลองอีกครั้ง") };
  if (!changed || changed.length === 0) {
    return { error: humanize("42501", "ส่งมอบไม่สำเร็จ กรุณาลองอีกครั้ง") };
  }

  revalidatePath(`/track/${leg.case_id}`);
  return { okLegId: legId };
}

/* =============================================================
 * 3. ส่งทอดถัดไป — สร้าง transfer_leg ใบใหม่ต่อจากทอดที่เพิ่งส่งมอบ
 *
 * ต้นทางของทอดใหม่คือปลายทางของทอดเดิมเสมอ ผู้ใช้จึงเลือกแค่ปลายทาง
 * ห้ามให้เลือกต้นทางเอง มิฉะนั้นสายส่งกลับจะขาดตอนโดยไม่มีใครสังเกต
 * ============================================================= */
export async function startNextLeg(
  _prev: LegActionState,
  formData: FormData,
): Promise<LegActionState> {
  const caseId = str(formData, "caseId");
  const toUnitId = str(formData, "toUnitId");
  const precedence = str(formData, "precedence") as PrecedenceLevel | "";
  const transportMode = str(formData, "transportMode");
  const reason = str(formData, "reason");
  const diagnosis = str(formData, "diagnosis");
  const icd10 = str(formData, "icd10").toUpperCase();

  if (!caseId) return { error: "ไม่พบเคสที่ต้องการส่งทอดถัดไป" };
  if (!toUnitId) return { error: "กรุณาเลือกหน่วยปลายทางของทอดถัดไป" };
  if (!precedence || !PRECEDENCE_VALUES_RO.includes(precedence)) {
    return { error: "กรุณาเลือกความเร่งด่วนของการส่งต่อ" };
  }
  const icdBad = icd10Error(icd10);
  if (icdBad) return { error: icdBad };

  const supabase = await createClient();

  const { data: legs } = await supabase
    .from("transfer_leg")
    .select("leg_no, status, to_unit_id")
    .eq("case_id", caseId)
    .order("leg_no", { ascending: false })
    .limit(1);

  const last = legs?.[0];
  if (!last) return { error: "ไม่พบทอดเดิมของเคสนี้ หรือบัญชีของคุณไม่มีสิทธิ์เห็นเคสนี้" };
  if (last.status !== "completed") {
    return {
      error: `เปิดทอดถัดไปได้เมื่อทอดที่ ${last.leg_no} ส่งมอบเสร็จแล้วเท่านั้น (ตอนนี้ ${LEG_STATUS_LABEL[last.status as LegStatus]})`,
    };
  }
  if (last.to_unit_id === toUnitId) {
    return { error: "หน่วยปลายทางของทอดถัดไปต้องไม่ใช่หน่วยที่ผู้ป่วยอยู่ตอนนี้" };
  }

  // role_level ของทอดคือชั้นการรักษาของ "ปลายทาง" ทอดนั้น อ่านจากตาราง unit ไม่ให้ผู้ใช้กรอก
  const { data: dest } = await supabase
    .from("unit")
    .select("role_level, name_th")
    .eq("id", toUnitId)
    .maybeSingle();
  if (!dest) return { error: "ไม่พบหน่วยปลายทางที่เลือก กรุณาเลือกใหม่" };

  /**
   * ★ ทำไมต้องอ่าน precedence เดิมก่อนทับ
   *
   *   ความเร่งด่วนเก็บอยู่ที่ตาราง case ไม่ใช่ที่ทอด การส่งต่อจึงทับของเดิมเสมอ
   *   ซึ่งถูกในแง่ "ตอนนี้ขออะไรอยู่" แต่ทำให้คำขอเดิมของเขตหน้าหายไปเงียบๆ
   *   จึงเขียนค่าเดิมลง note ของทอดใหม่ไว้ เวชระเบียนจะได้ยังตอบได้ว่า
   *   ตอนเปิดเคสเขาขอมาเป็นอะไร และใครเปลี่ยนเป็นอะไรตอนไหนเพราะอะไร
   *
   *   (ทางที่สะอาดกว่าคือเพิ่มคอลัมน์ precedence ที่ transfer_leg แต่ต้องแก้
   *    SELECT กลางใน leg-queries.ts ซึ่งใช้ร่วมกันสามหน้า — ไว้รอบหน้า)
   */
  const { data: caseRow } = await supabase
    .from("case")
    .select("precedence")
    .eq("id", caseId)
    .maybeSingle();

  const before = caseRow?.precedence as PrecedenceLevel | undefined;
  const noteParts = [
    `ส่งต่อไป ${dest.name_th}`,
    before && before !== precedence
      ? `ความเร่งด่วน ${PRECEDENCE[before].label} → ${PRECEDENCE[precedence].label}`
      : `ความเร่งด่วน ${PRECEDENCE[precedence].label}`,
    reason ? `เหตุผล: ${reason.slice(0, 400)}` : null,
  ].filter(Boolean);

  // สร้าง id เองแล้ว insert เปล่าๆ — ห้าม .select() ต่อท้าย (HANDOFF §5 ข้อ 10)
  const { error } = await supabase.from("transfer_leg").insert({
    id: crypto.randomUUID(),
    case_id: caseId,
    leg_no: last.leg_no + 1,
    from_unit_id: last.to_unit_id,
    to_unit_id: toUnitId,
    role_level: dest.role_level,
    note: noteParts.join(" · ").slice(0, 500),
  });

  if (error) {
    return { error: humanize(error.code, "เปิดทอดถัดไปไม่สำเร็จ กรุณาลองอีกครั้ง") };
  }

  /**
   * อัปเดตคำขอระดับเคสให้ตรงกับทอดใหม่
   *
   * แยกเป็นคำสั่งที่สองโดยเจตนา — ทอดใหม่คือสิ่งที่ขาดไม่ได้ ถ้าขั้นนี้ล้ม
   * (เช่นบัญชี monitor ที่ไม่ใช่ receiver โดน case_update ปฏิเสธ) การส่งต่อ
   * ก็ยังเกิดขึ้นแล้ว ไม่ควรย้อนทั้งหมดเพราะช่องประกอบเขียนไม่ได้
   * ★ UPDATE ต้องมี .select() เสมอ ไม่งั้น RLS ปฏิเสธแล้วเงียบ (HANDOFF §5 ข้อ 13)
   */
  const { data: touched } = await supabase
    .from("case")
    .update({
      precedence,
      disposition_route: "evac_chain",
      dest_unit_id: toUnitId,
      // วินิจฉัยของแพทย์ปลายทางเดินทางไปกับเคส ปลายทางถัดไปจะได้ไม่ต้องเริ่มจากศูนย์
      ...(diagnosis ? { diagnosis: diagnosis.slice(0, 500) } : {}),
      ...(icd10 ? { icd10 } : {}),
      ...(transportMode ? { transport_mode: transportMode as TransportMode } : {}),
    })
    .eq("id", caseId)
    .select("id");

  revalidatePath(`/track/${caseId}`);

  if (!touched || touched.length === 0) {
    return {
      error:
        "เปิดทอดถัดไปแล้ว แต่บันทึกความเร่งด่วนใหม่ไม่สำเร็จ — บัญชีของคุณอาจไม่มีสิทธิ์แก้ข้อมูลเคส",
    };
  }

  return {};
}

/**
 * ตรวจรูปแบบ ICD-10 ให้ตรงกับ constraint case_icd10_format ใน 0013
 * คืน error เป็นข้อความไทยแทนที่จะปล่อยให้ฐานข้อมูลปฏิเสธด้วย 23514
 * ซึ่งผู้ใช้อ่านแล้วไม่รู้ว่าต้องแก้ช่องไหน
 */
function icd10Error(code: string): string | null {
  if (!code) return null;
  return /^[A-TV-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/.test(code)
    ? null
    : "รูปแบบรหัส ICD-10 ไม่ถูกต้อง เช่น S72.3 — เว้นว่างได้ถ้าจำไม่ได้";
}

/* =============================================================
 * ส่งคืนหน่วยต้นสังกัด — ทางออกที่สองของผู้รับ
 *
 * ★ ทำไมไม่เปิดทอดใหม่ (คำสั่งเจ้าของโครงการ 9 ก.ย. 2569)
 *   ผู้ป่วยที่อาการดีขึ้นจนกลับหน่วยได้ไม่ใช่ภารกิจส่งกลับอีกต่อไป
 *   เขารอรถเที่ยวหน้าที่หน่วยต้นทางส่งคนมารักษาแล้วติดกลับไปด้วย
 *   ถ้าเปิดทอดให้ ระบบจะมีทอดค้างที่ไม่มีใครจัดรถให้ตลอดกาล
 *   และตัวเลข response time บนแดชบอร์ดจะเพี้ยนเพราะนับเวลาที่ไม่มีใครวิ่ง
 *
 * ★ ปิดเคสอย่างไร — ไม่ต้องปิดเอง
 *   sync_case_status ใน 0009 ปิดให้แล้วตอนทอดสุดท้ายเป็น completed
 *   ที่นี่จึงเขียนเฉพาะผลการจำหน่าย ซึ่งเป็นข้อมูลของ ทบ.466-900
 *
 * ★ disposed_at ห้ามส่งมาจากที่นี่
 *   trigger set_case_form_timestamps ใน 0013 เขียนทับค่าที่ client ส่งมาเสมอ
 *   ตั้งให้เองจาก now() ตอน outcome เปลี่ยนจาก null เป็นค่าจริง
 *   (เหตุผลเดียวกับ timestamp ทุกตัวในระบบ — Prompt 04)
 * ============================================================= */
export async function dischargeToUnit(
  _prev: LegActionState,
  formData: FormData,
): Promise<LegActionState> {
  const caseId = str(formData, "caseId");
  const outcome = str(formData, "outcome") as CaseOutcome | "";
  const diagnosis = str(formData, "diagnosis");
  const icd10 = str(formData, "icd10").toUpperCase();
  const feedbackNote = str(formData, "feedbackNote");

  if (!caseId) return { error: "ไม่พบเคสที่ต้องการบันทึกการส่งคืน" };
  if (!outcome || !OUTCOME_VALUES.includes(outcome)) {
    return { error: "กรุณาเลือกผลการรักษาก่อนบันทึกการส่งคืน" };
  }

  const supabase = await createClient();

  const { data: legs } = await supabase
    .from("transfer_leg")
    .select("leg_no, status")
    .eq("case_id", caseId)
    .order("leg_no", { ascending: false })
    .limit(1);

  const last = legs?.[0];
  if (!last) return { error: "ไม่พบทอดของเคสนี้ หรือบัญชีของคุณไม่มีสิทธิ์เห็นเคสนี้" };
  if (last.status !== "completed") {
    return {
      error: `บันทึกการส่งคืนได้เมื่อรับผู้ป่วยเข้ารักษาแล้วเท่านั้น (ตอนนี้ทอดที่ ${last.leg_no} อยู่ที่ "${LEG_STATUS_LABEL[last.status as LegStatus]}")`,
    };
  }

  /** ส่งคืน "หน่วยที่ส่งมา" — ต้นทางของเคส ไม่ให้ผู้ใช้เลือกเพราะมีคำตอบเดียว */
  const { data: caseRow } = await supabase
    .from("case")
    .select("origin_unit_id")
    .eq("id", caseId)
    .maybeSingle();
  if (!caseRow) return { error: "ไม่พบเคสนี้ หรือบัญชีของคุณไม่มีสิทธิ์เห็นเคสนี้" };

  const icdBad = icd10Error(icd10);
  if (icdBad) return { error: icdBad };

  const { data: touched, error } = await supabase
    .from("case")
    .update({
      outcome,
      disposition_route: "returned_to_unit",
      dest_unit_id: caseRow.origin_unit_id,
      diagnosis: diagnosis ? diagnosis.slice(0, 500) : null,
      icd10: icd10 || null,
      feedback_note: feedbackNote ? feedbackNote.slice(0, 1000) : null,
    })
    .eq("id", caseId)
    .select("id");

  if (error) {
    return { error: humanize(error.code, "บันทึกการส่งคืนไม่สำเร็จ กรุณาลองอีกครั้ง") };
  }
  if (!touched || touched.length === 0) {
    return { error: "บัญชีของคุณไม่มีสิทธิ์บันทึกผลการจำหน่ายของเคสนี้" };
  }

  revalidatePath(`/track/${caseId}`);
  return {};
}
