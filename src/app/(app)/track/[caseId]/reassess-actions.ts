"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getProfile, hasAnyRole } from "@/lib/auth/profile";
import { ASSESSOR_ROLES, isLegOpen } from "@/lib/leg-flow";
import { createClient } from "@/lib/supabase/server";
import type { AssessmentKind, TriageColor } from "@/lib/enums";
import { TreatmentRow, VITALS_SHAPE, bpOrderRefine, jsonArray } from "../../sender/schema";

/**
 * ประเมินซ้ำระหว่างสายส่งกลับ (คำสั่งเจ้าของโครงการ 8 ก.ย. 2569)
 *
 * เวลาผ่านไประหว่างเดินทาง ผู้ป่วยแย่ลงได้ สีที่เขตหน้าให้ไว้ตอนเปิดคำขอ
 * จึงไม่ใช่สีที่ถูกต้องเสมอไป และชุดลำเลียงยังให้การรักษาเพิ่มระหว่างทางด้วย
 * ทั้งสองอย่างไม่เคยมีที่ลงในระบบมาก่อน
 *
 * ★ สามเมนู สามปุ่มบันทึก สามเวลา
 *   เจ้าของโครงการสั่งไว้ว่า "เมนูที่ทำจะ update ฐานข้อมูลในเวลาที่ต่างกัน"
 *   ยืนยันสีตอนหนึ่ง วัด V/S อีกตอนหนึ่ง ให้ยาอีกตอนหนึ่ง — ถ้ารวมเป็นปุ่มเดียว
 *   ทั้งสามจะได้เวลาเดียวกันหมด ซึ่งไม่ตรงกับสิ่งที่เกิดขึ้นจริงหน้างาน
 *
 * ★ เวลาทุกตัวมาจาก now() ของฐานข้อมูล ไม่มีช่องกรอกเวลาที่ใดในไฟล์นี้
 *   assessment.assessed_at และ treatment.given_at มี default now() อยู่แล้ว
 *   จึงไม่ส่งค่าไปเลย (ข้อยกเว้นเดียวคือเวลารัดสายห้ามเลือด ซึ่ง TreatmentList
 *   ส่งมาเองตามเหตุผลใน 0020 — สายรัดถูกรัดก่อนที่จะได้หยิบเครื่องขึ้นมากรอก)
 *
 * ★ ห้ามใช้ .insert().select() กับ assessment และ treatment (HANDOFF §5 ข้อ 10)
 *   can_see_case() เป็น stable จึงมองไม่เห็นแถวที่คำสั่งเดียวกันเพิ่งสร้าง
 *
 * ★ สีของเคสไม่ได้ถูกแก้จากที่นี่
 *   ไฟล์นี้ insert assessment เท่านั้น แล้ว trigger sync_case_triage ใน 0022
 *   เป็นคนไล่สีลงตาราง case ให้ — ชุดลำเลียงไม่มีสิทธิ์ update ตาราง case
 *   ถ้ายิง update ตรงๆ จะแก้ 0 แถวเงียบๆ (HANDOFF §5 ข้อ 13)
 */

export type ReassessState = {
  error?: string;
  /** ข้อความยืนยันสั้นๆ หลังบันทึกสำเร็จ */
  ok?: string;
  fieldErrors?: Record<string, string>;
};

const TriageInput = z.object({
  triage: z.enum(["black", "red", "yellow", "green"], {
    message: "กรุณาเลือกระดับความรุนแรง",
  }),
});

const VitalsInput = z.object(VITALS_SHAPE).refine(bpOrderRefine.check, {
  message: bpOrderRefine.message,
  path: ["dbp"],
});

const TreatmentsInput = z.object({
  treatments: jsonArray(TreatmentRow),
});

/** อ่านบริบทที่ทุก action ต้องใช้ — คืนข้อความ error แทนที่จะ throw */
async function loadContext(caseId: string) {
  if (!caseId) return { error: "ไม่พบเคสที่ต้องการประเมิน" } as const;

  const profile = await getProfile();
  if (!profile) return { error: "ไม่พบบัญชีผู้ใช้ กรุณาเข้าสู่ระบบใหม่" } as const;

  if (!hasAnyRole(profile, ASSESSOR_ROLES)) {
    return {
      error: "บัญชีของคุณไม่มีบทบาทที่บันทึกผลประเมินได้ (ต้องเป็นผู้ส่ง ผู้ลำเลียง หรือผู้รับ)",
    } as const;
  }

  const supabase = await createClient();

  /**
   * ผูกผลประเมินกับ "ทอดที่กำลังเดินอยู่" ถ้ามี ไม่งั้นใช้ทอดล่าสุด
   * ผลประเมินผูกกับ case_id เสมออยู่แล้ว leg_id เป็นข้อมูลเสริมว่าเกิดตอนไหน
   * RLS กรองให้แล้วว่าเห็นทอดไหน จึงไม่ต้องกรองซ้ำที่นี่
   */
  const { data: legs } = await supabase
    .from("transfer_leg")
    .select("id, leg_no, status, to_unit_id")
    .eq("case_id", caseId)
    .order("leg_no", { ascending: true });

  if (!legs || legs.length === 0) {
    return { error: "ไม่พบทอดของเคสนี้ หรือบัญชีของคุณไม่มีสิทธิ์เห็นเคสนี้" } as const;
  }

  const leg = legs.find((l) => isLegOpen(l.status)) ?? legs[legs.length - 1];

  /**
   * kind เลือกให้เอง ไม่ถามผู้ใช้ — คนกรอกไม่ควรต้องรู้จักคำว่า enroute
   * ใช้กติกาเดียวกับที่ advanceLeg ใช้ตัดสิน receiver_id คือดูจากหน่วยของผู้กด
   * เทียบกับหน่วยปลายทางของทอด จะได้ไม่มีตรรกะใหม่ให้จำอีกชุด
   */
  const kind: AssessmentKind =
    profile.unitId === leg.to_unit_id ? "handover" : "enroute";

  return { profile, supabase, leg, kind } as const;
}

/** แปลง error ของ Postgres เป็นข้อความที่ทำอะไรต่อได้ */
function humanize(code: string | undefined, fallback: string): string {
  switch (code) {
    case "42501":
      return "บัญชีของคุณไม่มีสิทธิ์บันทึกผลประเมินในเคสนี้";
    case "23514":
      return "ค่าที่กรอกอยู่นอกช่วงที่ระบบยอมรับ กรุณาตรวจอีกครั้ง";
    default:
      return fallback;
  }
}

/* =============================================================
 * 1. ยืนยันระดับความรุนแรง — เขียว · เหลือง · แดง · ดำ
 *
 * บันทึกเป็น assessment แถวใหม่ที่มีแค่ triage จึงได้ประวัติว่า
 * ใครยืนยันสีอะไรเมื่อไร ไม่ใช่แค่ค่าล่าสุดที่ทับของเดิมไปเงียบๆ
 *
 * ไม่แตะ case.precedence — ความเร่งด่วนคือ "สิ่งที่ขอมาตอนแรก"
 * ส่วนสีคือ "ตอนนี้ผู้ป่วยเป็นอย่างไร" สองอย่างนี้ต่างกันและต้องเก็บแยก
 * ============================================================= */
export async function saveTriage(
  _prev: ReassessState,
  formData: FormData,
): Promise<ReassessState> {
  const caseId = String(formData.get("caseId") ?? "");
  const ctx = await loadContext(caseId);
  if ("error" in ctx) return { error: ctx.error };

  const parsed = TriageInput.safeParse({ triage: formData.get("triage") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "กรุณาเลือกระดับความรุนแรง" };
  }

  const { error } = await ctx.supabase.from("assessment").insert({
    case_id: caseId,
    leg_id: ctx.leg.id,
    kind: ctx.kind,
    triage: parsed.data.triage as TriageColor,
    assessed_by: ctx.profile.id,
  });

  if (error) {
    return { error: humanize(error.code, "บันทึกระดับความรุนแรงไม่สำเร็จ กรุณาลองอีกครั้ง") };
  }

  revalidatePath(`/track/${caseId}`);
  return { ok: "บันทึกระดับความรุนแรงแล้ว" };
}

/* =============================================================
 * 2. บันทึกสัญญาณชีพ
 *
 * ทุกช่องไม่บังคับ แต่ต้องมีอย่างน้อยหนึ่งช่อง มิฉะนั้นจะได้แถวเปล่า
 * ที่ทำให้เส้นเวลาผลประเมินยาวขึ้นโดยไม่มีข้อมูลอะไรเพิ่ม
 * (กติกาเดียวกับ create_evac_request ใน 0021 ที่ไม่สร้างแถวประเมินเปล่า)
 * ============================================================= */
export async function saveVitals(
  _prev: ReassessState,
  formData: FormData,
): Promise<ReassessState> {
  const caseId = String(formData.get("caseId") ?? "");
  const ctx = await loadContext(caseId);
  if ("error" in ctx) return { error: ctx.error };

  const raw = Object.fromEntries(formData.entries());
  const parsed = VitalsInput.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "กรอกข้อมูลไม่ถูกต้อง", fieldErrors };
  }

  const v = parsed.data;
  const hasAny = Object.values(v).some((x) => x !== undefined);
  if (!hasAny) {
    return { error: "ยังไม่ได้กรอกช่องใดเลย — กรอกอย่างน้อยหนึ่งช่องก่อนบันทึก" };
  }

  const { error } = await ctx.supabase.from("assessment").insert({
    case_id: caseId,
    leg_id: ctx.leg.id,
    kind: ctx.kind,
    assessed_by: ctx.profile.id,
    sbp: v.sbp,
    dbp: v.dbp,
    pulse: v.pulse,
    resp_rate: v.respRate,
    spo2: v.spo2,
    temperature: v.temperature,
    avpu: v.avpu,
    gcs: v.gcs,
    findings: v.findings,
  });

  if (error) {
    return { error: humanize(error.code, "บันทึกสัญญาณชีพไม่สำเร็จ กรุณาลองอีกครั้ง") };
  }

  revalidatePath(`/track/${caseId}`);
  return { ok: "บันทึกสัญญาณชีพแล้ว" };
}

/* =============================================================
 * 3. บันทึกการรักษาที่ให้ระหว่างทาง
 *
 * ใช้ TreatmentList ตัวเดียวกับขั้นที่ 6 ของฟอร์มผู้ส่ง เมนูหัตถการจึงตรงกัน
 * ทั้ง 17 รายการโดยไม่ต้องดูแลสองที่ (คำสั่งเจ้าของโครงการ)
 *
 * สายรัดที่บันทึกที่นี่จะโผล่บนแถบสายรัดของทุกหน้าทันที เพราะทุกหน้าอ่านจาก
 * ตาราง treatment เดียวกันผ่าน getTourniquets*() โดยกรอง tx_code = 'tourniquet'
 * ============================================================= */
export async function saveTreatments(
  _prev: ReassessState,
  formData: FormData,
): Promise<ReassessState> {
  const caseId = String(formData.get("caseId") ?? "");
  const ctx = await loadContext(caseId);
  if ("error" in ctx) return { error: ctx.error };

  const parsed = TreatmentsInput.safeParse({
    treatments: formData.get("treatments"),
  });
  if (!parsed.success) {
    return { error: "รายการการรักษาไม่ถูกต้อง กรุณาลองใหม่" };
  }

  const rows = parsed.data.treatments;
  if (rows.length === 0) {
    return { error: "ยังไม่ได้เพิ่มรายการใดเลย — เลือกหัตถการก่อนกดบันทึก" };
  }

  /** สายรัดห้ามเลือดต้องรู้ตำแหน่ง ไม่งั้นคนที่รับต่อไม่รู้ว่าไปคลายตรงไหน */
  const tqNoSite = rows.find((r) => r.txCode === "tourniquet" && !r.site);
  if (tqNoSite) {
    return { error: "สายรัดห้ามเลือดต้องระบุตำแหน่งที่รัดเสมอ" };
  }

  const { error } = await ctx.supabase.from("treatment").insert(
    rows.map((r) => ({
      case_id: caseId,
      leg_id: ctx.leg.id,
      tx_code: r.txCode,
      detail: r.detail ?? null,
      dose: r.dose ?? null,
      route: r.route ?? null,
      site: r.site ?? null,
      // ส่งเวลาเฉพาะสายรัด — ที่เหลือปล่อยให้ default now() ของฐานข้อมูลตั้งให้
      ...(r.txCode === "tourniquet" && r.givenAt ? { given_at: r.givenAt } : {}),
      given_by: ctx.profile.id,
    })),
  );

  if (error) {
    return { error: humanize(error.code, "บันทึกการรักษาไม่สำเร็จ กรุณาลองอีกครั้ง") };
  }

  revalidatePath(`/track/${caseId}`);
  return { ok: `บันทึกการรักษา ${rows.length} รายการแล้ว` };
}
