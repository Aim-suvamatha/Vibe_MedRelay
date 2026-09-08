"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * คลายสายรัดห้ามเลือด
 *
 * ★ ไม่มีการเช็คสิทธิ์ในโค้ดนี้เลยแม้แต่บรรทัดเดียว โดยเจตนา
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
 */
export async function releaseTourniquet(formData: FormData) {
  const id = String(formData.get("treatmentId") ?? "");
  const back = String(formData.get("returnTo") ?? "/");
  if (!id) return;

  const supabase = await createClient();
  await supabase.rpc("release_tourniquet", { p_id: id });

  revalidatePath(back);
}
