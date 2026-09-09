"use server";

import { revalidatePath } from "next/cache";

import { getProfile } from "@/lib/auth/profile";
import { custodyOf } from "@/lib/custody";
import { createClient } from "@/lib/supabase/server";

/**
 * คลายสายรัดห้ามเลือด
 *
 * ★ ไม่มีการเช็ค "สิทธิ์" ในโค้ดนี้เลยแม้แต่บรรทัดเดียว โดยเจตนา
 *   policy treatment_release ใน 0014 ตัดสินเองว่าใครทำได้
 *     using       can_see_case(case_id) and tx_code = 'tourniquet' and tourniquet_off is null
 *     with check  can_see_case(case_id) and tourniquet_off is not null and released_by = auth.uid()
 *   แปลว่า **ทุกคนที่เห็นเคสนี้กดคลายได้** ไม่จำกัดว่าต้องเป็นคนที่รัด
 *   ซึ่งตรงกับความจริงหน้างาน คนที่คลายมักเป็นคนละคนกับคนที่รัด
 *   และ tourniquet_off is null ใน using ทำให้ **คลายได้ครั้งเดียว ปิดแล้วปิดเลย**
 *
 * ★ column grant จำกัดไว้แค่สองคอลัมน์
 *   revoke update ... ; grant update (tourniquet_off, released_by)
 *   ถึงจะเขียน .update() ให้แก้ dose หรือ given_at ที่นี่ ฐานข้อมูลก็ปฏิเสธ
 *   เวชระเบียนจึงยังแก้ไม่ได้ตามหลักการเดิมของโครงการ
 *
 * ★ เรียกผ่าน RPC ไม่ใช่ .update() เพราะเวลาต้องมาจาก now() ของฐานข้อมูล
 *   ไม่ใช่นาฬิกาของ Vercel ตามหลักการเดิมทั้งหมดของโครงการ (Prompt 04)
 *   เวลาคลายเป็นเวลาที่กดปุ่มจริง ต่างจากเวลาที่รัดซึ่งกรอกย้อนหลังได้
 *   เพราะคนกดปุ่มคลายคือคนที่กำลังคลายอยู่ตรงนั้น ไม่มีช่องว่างให้ต้องกรอกย้อนหลัง
 *
 * ★ สิ่งที่เพิ่มเข้ามา 9 ก.ย. 2569 คือ "กติกาการทำงาน" ไม่ใช่ "สิทธิ์"
 *
 *   เจ้าของโครงการเจอว่าปลายทางกดคลายสายรัดของผู้ป่วยที่ยังอยู่บนรถได้
 *   ซึ่งเป็นไปไม่ได้ในโลกจริง — มือยังไม่ถึงตัวผู้ป่วยจะคลายอะไรได้
 *   เวลาคลายที่ได้จึงเป็นเวลาปลอม และนาฬิกาขาดเลือดบนหน้าจอของคนอื่น
 *   จะหยุดเดินทั้งที่สายรัดยังรัดอยู่จริง — อันตรายกว่าไม่มีนาฬิกาเสียอีก
 *
 *   ⚠ ย้ำว่านี่ไม่ใช่ชั้นความปลอดภัย policy treatment_release ยังยอมเหมือนเดิม
 *     ทุกคนที่เห็นเคสยังคลายได้ในระดับฐานข้อมูล ตรงนี้แค่ปิดทางที่แอปยื่นให้
 *     ถ้าวันหนึ่งต้องการให้ฐานข้อมูลบังคับด้วย ต้องแก้ policy ไม่ใช่แก้ไฟล์นี้
 */
export async function releaseTourniquet(formData: FormData) {
  const id = String(formData.get("treatmentId") ?? "");
  const back = String(formData.get("returnTo") ?? "/");
  if (!id) return;

  const supabase = await createClient();

  /**
   * หาเคสของสายรัดเส้นนี้ก่อน แล้วถามว่าผู้ป่วยอยู่ในมือคนกดหรือยัง
   * RLS กรองให้แล้วว่าเห็นแถวไหน ถ้าไม่มีสิทธิ์เห็นจะได้ null แล้วจบตรงนี้เอง
   */
  const { data: tq } = await supabase
    .from("treatment")
    .select("case_id")
    .eq("id", id)
    .maybeSingle();
  if (!tq) return;

  const [profile, { data: legs }] = await Promise.all([
    getProfile(),
    supabase
      .from("transfer_leg")
      .select("status, to_unit_id, transporter_id, handover_at")
      .eq("case_id", tq.case_id)
      .order("leg_no", { ascending: true }),
  ]);

  if (!custodyOf(profile, legs ?? []).canRecordCare) return;

  await supabase.rpc("release_tourniquet", { p_id: id });

  revalidatePath(back);
}
