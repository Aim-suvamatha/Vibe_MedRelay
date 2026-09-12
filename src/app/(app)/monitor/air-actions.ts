"use server";

import { revalidatePath } from "next/cache";

import { getProfile, hasAnyRole } from "@/lib/auth/profile";
import type { AirDecision, TransportMode } from "@/lib/enums";
import { isAirMode } from "@/lib/monitor-view";
import { createClient } from "@/lib/supabase/server";

/**
 * การอนุมัติส่งกลับทางอากาศ — อำนาจของศูนย์สั่งการ (0025)
 *
 * ★ ทำไมต้องมีทั้ง "อนุมัติ" และ "ไม่อนุมัติพร้อมเหตุผล"
 *   คำสั่งเจ้าของโครงการ 9 ก.ย. 2569 — ปุ่มที่มีแต่ "อนุมัติ" ทำให้การปฏิเสธ
 *   กลายเป็นการไม่กดอะไรเลย ซึ่งแยกไม่ออกจาก "ยังไม่ได้ดู"
 *   หน่วยหน้าที่รออยู่จะไม่มีวันรู้ว่าถูกปฏิเสธแล้วหรือยังไม่มีใครอ่าน
 *
 * ★ ไม่มีที่ใดในไฟล์นี้ส่งค่าเวลาเข้า database
 *   air_decision_at ตั้งโดย trigger set_case_form_timestamps (0013 ขยายใน 0025)
 *   หลักการเดิมจาก Prompt 04 — ไม่มีช่องกรอกเวลาที่ใดในระบบ
 *
 * ★ transport_mode ห้ามถูกทับ
 *   ถ้าปฏิเสธ ฮ. แล้วให้ไปทางรถ ค่าที่เปลี่ยนคือ air_mode_granted เท่านั้น
 *   transport_mode ยังเป็นสิ่งที่หน่วยหน้า "ขอ" มา ซึ่งเวชระเบียนต้องตอบได้เสมอ
 *
 * ⚠ ห้าม export ค่าคงที่จากไฟล์นี้
 *   "use server" บังคับให้ทุก export เป็น async function ค่าคงที่ที่ export
 *   จากที่นี่จะกลายเป็น server reference เมื่อ client import ไปใช้ แล้วพังตอน render
 *   โดย typecheck ผ่านสบาย (บทเรียน ASSESSOR_ROLES 8 ก.ย. 2569)
 *   ค่าคงที่ทุกตัวอยู่ใน src/lib/monitor-resources.ts
 */

export type AirActionState = {
  error?: string;
  /** รหัสเคสที่เพิ่งตัดสินสำเร็จ ใช้ขึ้นข้อความยืนยันบนหน้าจอ */
  okCaseCode?: string;
};

/** ข้อความจาก Postgres อ่านไม่รู้เรื่องสำหรับผู้ใช้ทั่วไป แปลงเป็นภาษาที่ทำอะไรต่อได้ */
function humanize(code: string | undefined, fallback: string): string {
  switch (code) {
    case "42501": // insufficient_privilege — RLS ปฏิเสธ
      return "บัญชีของคุณไม่มีสิทธิ์ตัดสินคำขอนี้ การอนุมัติเป็นอำนาจของศูนย์สั่งการเท่านั้น";
    case "23514": // check_violation — เกือบทุกครั้งคือ case_air_denied_needs_note
      return "ไม่อนุมัติต้องระบุเหตุผลเสมอ หน่วยที่ขอมาต้องรู้ว่าติดขัดที่อะไร";
    case "23503": // foreign_key_violation
      return "ไม่พบเคสหรือบัญชีผู้ตัดสินในระบบแล้ว กรุณารีเฟรชหน้าจอ";
    default:
      return fallback;
  }
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

const DECISIONS: readonly AirDecision[] = ["approved", "denied"];
const GRANTABLE: readonly TransportMode[] = [
  "rotary",
  "fixed_wing",
  "ground",
  "watercraft",
];

export async function decideAirEvac(
  _prev: AirActionState,
  formData: FormData,
): Promise<AirActionState> {
  const caseId = str(formData, "caseId");
  const decision = str(formData, "decision") as AirDecision | "";
  const mode = str(formData, "modeGranted") as TransportMode | "";
  const note = str(formData, "note");

  if (!caseId) return { error: "ไม่พบเคสที่ต้องการตัดสิน" };
  if (!decision || !DECISIONS.includes(decision)) {
    return { error: "คำสั่งที่ส่งมาไม่ถูกต้อง กรุณากดปุ่มอนุมัติหรือไม่อนุมัติ" };
  }

  /**
   * ★ กันด้วย "บทบาท" ที่นี่ถูกต้อง ต่างจากปุ่มส่งมอบที่ต้องกันด้วยตัวตน
   *   การอนุมัติอากาศยานเป็นอำนาจของตำแหน่ง ไม่ใช่ของใครคนใดคนหนึ่งกับเคสใดเคสหนึ่ง
   *   ใครก็ตามที่ถือบทบาท monitor ตัดสินคำขอไหนก็ได้ ซึ่งตรงกับหน้างานจริง
   *
   * ⚠ commander ตัดสินไม่ได้แม้จะเห็นหน้านี้
   *   ตรงกับ policy case_update ที่ยอมเฉพาะ monitor และตรงกับคำอธิบายใน nav.ts
   *   ว่า commander เห็นภาพรวมได้เหมือน monitor แต่ไม่ได้ลงมือจัดสรรเอง
   *   ถ้าไม่ดักที่นี่ RLS จะปฏิเสธเงียบๆ แล้วผู้ใช้ได้ error ที่ไม่บอกว่าทำไม
   */
  const profile = await getProfile();
  if (!profile) return { error: "ไม่พบบัญชีผู้ใช้ กรุณาเข้าสู่ระบบใหม่" };
  if (!hasAnyRole(profile, ["monitor"])) {
    return {
      error:
        "การอนุมัติส่งกลับทางอากาศเป็นอำนาจของศูนย์สั่งการ บัญชีของคุณดูข้อมูลได้แต่ตัดสินไม่ได้",
    };
  }

  // ดักที่นี่ให้ได้ข้อความไทยที่บอกว่าต้องแก้ช่องไหน
  // ไม่ปล่อยให้ constraint case_air_denied_needs_note คืน 23514 ที่ผู้ใช้อ่านไม่รู้เรื่อง
  if (decision === "denied" && !note) {
    return {
      error:
        "กรุณาระบุเหตุผลที่ไม่อนุมัติ — หน่วยที่ขอมาต้องรู้ว่าติดขัดที่อะไรจึงจะวางแผนต่อได้",
    };
  }
  if (mode && !GRANTABLE.includes(mode)) {
    return { error: "ยานพาหนะที่เลือกไม่ถูกต้อง กรุณาเลือกใหม่" };
  }

  const supabase = await createClient();

  const { data: row } = await supabase
    .from("case")
    .select("id, case_code, transport_mode, air_decision, status")
    .eq("id", caseId)
    .maybeSingle();

  if (!row) return { error: "ไม่พบเคสนี้ หรือบัญชีของคุณไม่มีสิทธิ์เห็นเคสนี้" };
  if (!isAirMode(row.transport_mode as TransportMode | null)) {
    return { error: "เคสนี้ไม่ได้ขอส่งกลับทางอากาศ จึงไม่มีอะไรให้อนุมัติ" };
  }
  if (row.air_decision) {
    return { error: "คำขอนี้ถูกตัดสินไปแล้ว กรุณารีเฟรชหน้าจอเพื่อดูผลล่าสุด" };
  }

  const { data: changed, error } = await supabase
    .from("case")
    .update({
      air_decision: decision,
      air_decision_by: profile.id,
      air_decision_note: note ? note.slice(0, 500) : null,
      // อนุมัติแล้วไม่เลือกโหมด แปลว่าให้ไปตามที่ขอมา
      air_mode_granted:
        mode || (decision === "approved" ? (row.transport_mode as TransportMode) : null),
    })
    .eq("id", caseId)
    // กันสองเครื่องกดพร้อมกัน — ตัดสินได้ครั้งเดียว คนที่กดทีหลังต้องรู้ว่าช้าไป
    .is("air_decision", null)
    /**
     * 🔴 .select() บังคับกับ UPDATE เสมอ
     *   UPDATE ที่ RLS ปฏิเสธจะแก้ 0 แถว "โดยไม่มี error" ถ้าดูแต่ error
     *   ปุ่มจะรายงานว่าสำเร็จทั้งที่ไม่มีอะไรเปลี่ยน ซึ่งอันตรายกว่าปุ่มที่กดไม่ได้เลย
     *   เพราะศูนย์สั่งการจะเดินต่อโดยเชื่อว่าอนุมัติแล้ว (HANDOFF §5 ข้อ 13)
     *   ข้อห้าม .select() ใช้กับ INSERT เท่านั้น แถวที่ UPDATE แตะมีอยู่ก่อนแล้ว
     */
    .select("id");

  if (error) {
    return { error: humanize(error.code, "บันทึกผลการตัดสินไม่สำเร็จ กรุณาลองอีกครั้ง") };
  }
  if (!changed || changed.length === 0) {
    return {
      error: "บันทึกไม่สำเร็จ — คำขอนี้อาจถูกตัดสินไปแล้วโดยผู้อื่น กรุณารีเฟรชหน้าจอ",
    };
  }

  revalidatePath("/monitor");
  revalidatePath(`/track/${caseId}`);
  return { okCaseCode: row.case_code };
}
