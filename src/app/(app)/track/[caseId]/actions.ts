"use server";

import { revalidatePath } from "next/cache";

import { getProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import type { LegStatus } from "@/lib/enums";
import type { Database } from "@/types/database";
import {
  LEG_FLOW,
  LEG_STATUS_LABEL,
  nextStep,
  previousStatusOf,
} from "@/lib/leg-flow";

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
    .select("id, case_id, leg_no, status, to_unit_id, from_unit_id")
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
  const { error } = await supabase
    .from("transfer_leg")
    .update({
      status: "dispatched",
      vehicle_id: vehicleId,
      transporter_id: transporterId,
    })
    .eq("id", legId)
    // กันการกดพร้อมกันสองเครื่อง — ถ้าอีกคนจัดรถไปแล้วเงื่อนไขนี้จะไม่ตรงและไม่มีแถวถูกแก้
    .eq("status", "pending");

  if (error) return { error: humanize(error.code, "จัดรถไม่สำเร็จ กรุณาลองอีกครั้ง") };

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
     * ช่องตรวจก่อนส่งมอบจาก ทบ.466-903 — เอกสารครบ · สิ่งของครบ · ถ้าไม่ครบขาดอะไร
     * เก็บทุกครั้งแม้ติ๊กครบ เพราะ "ตรวจแล้วครบ" กับ "ไม่เคยตรวจ" ต่างกันในทางคดี
     */
    patch.docs_ok = checked(formData, "docsOk");
    patch.property_ok = checked(formData, "propertyOk");

    const missing = str(formData, "missingNote");
    patch.missing_note = missing === "" ? null : missing.slice(0, 500);

    if ((!patch.docs_ok || !patch.property_ok) && !missing) {
      return { error: "มีรายการที่ยังไม่ครบ กรุณาระบุว่าขาดอะไรก่อนกดส่งมอบ" };
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
  const { error } = await supabase
    .from("transfer_leg")
    .update(patch)
    .eq("id", legId)
    // กันสองเครื่องกดพร้อมกัน — เดินได้จากสถานะที่เห็นตอนตรวจเท่านั้น
    .eq("status", required);

  if (error) {
    return { error: humanize(error.code, "บันทึกสถานะไม่สำเร็จ กรุณาลองอีกครั้ง") };
  }

  // รถถูกคืนเข้ากระดานเองโดย trigger sync_vehicle_status ใน 0016
  // คนที่กดส่งมอบคือชุดลำเลียงหรือผู้รับปลายทาง ซึ่งไม่มีสิทธิ์แก้ตาราง vehicle ตาม RLS
  // ถ้าทำที่นี่ รถจะค้างสถานะ 'dispatched' ตลอดไปโดยไม่มี error ให้เห็น

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

  if (!caseId) return { error: "ไม่พบเคสที่ต้องการส่งทอดถัดไป" };
  if (!toUnitId) return { error: "กรุณาเลือกหน่วยปลายทางของทอดถัดไป" };

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
    .select("role_level")
    .eq("id", toUnitId)
    .maybeSingle();
  if (!dest) return { error: "ไม่พบหน่วยปลายทางที่เลือก กรุณาเลือกใหม่" };

  // สร้าง id เองแล้ว insert เปล่าๆ — ห้าม .select() ต่อท้าย (HANDOFF §5 ข้อ 10)
  const { error } = await supabase.from("transfer_leg").insert({
    id: crypto.randomUUID(),
    case_id: caseId,
    leg_no: last.leg_no + 1,
    from_unit_id: last.to_unit_id,
    to_unit_id: toUnitId,
    role_level: dest.role_level,
  });

  if (error) {
    return { error: humanize(error.code, "เปิดทอดถัดไปไม่สำเร็จ กรุณาลองอีกครั้ง") };
  }

  revalidatePath(`/track/${caseId}`);
  return {};
}
