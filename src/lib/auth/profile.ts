import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/enums";

/**
 * อ่าน profile ของผู้ใช้ที่ล็อกอินอยู่ — ฝั่ง server เท่านั้น
 *
 * ห่อด้วย cache() ของ React เพื่อให้เรียกกี่ครั้งใน render เดียวก็ยิง query แค่ครั้งเดียว
 * layout กับหลาย component เรียกซ้ำกันได้โดยไม่ต้องส่ง prop ต่อกันเป็นทอดๆ
 *
 * query นี้ผ่าน RLS ปกติ (policy profile_select ใน 0010) ไม่ได้ใช้ service_role
 * ถ้าคืน null แปลว่าไม่มี session หรือ session หมดอายุ
 */

export type CurrentProfile = {
  id: string;
  serviceNumber: string;
  fullName: string;
  rankTh: string | null;
  unitId: string;
  unitCode: string;
  unitName: string;
  roles: AppRole[];
};

export const getProfile = cache(async (): Promise<CurrentProfile | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profile")
    .select("id, service_number, full_name, rank_th, unit_id, roles, unit:unit_id (code, name_th)")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;

  // unit เป็น object เมื่อ join แบบ many-to-one แต่ PostgREST คืน array ได้ในบางรูปแบบ query
  // จึงรับไว้ทั้งสองทาง ไม่งั้นหน้าจะพังเงียบๆ เมื่อรูปแบบเปลี่ยน
  const unit = (Array.isArray(data.unit) ? data.unit[0] : data.unit) ?? null;

  return {
    id: data.id,
    serviceNumber: data.service_number,
    fullName: data.full_name,
    rankTh: data.rank_th ?? null,
    unitId: data.unit_id,
    unitCode: unit?.code ?? "",
    unitName: unit?.name_th ?? "",
    roles: (data.roles ?? []) as AppRole[],
  };
});

/**
 * ผู้ใช้คนนี้ถือบทบาทใดบทบาทหนึ่งในรายการหรือไม่ — ฝั่ง server
 *
 * ★ ต่างจาก RoleGate โดยสิ้นเชิง อย่าสับสนกัน
 *   RoleGate รันบน browser จึงแค่ "ไม่วาด" ของที่ถูกส่งไปถึงเครื่องแล้ว
 *   function นี้รันบน server จึงใช้ตัดสินใจได้ว่า **จะยิง query หรือไม่ยิง**
 *
 *   หน้าไหนที่ดึงข้อมูลมาแล้วค่อยเอา RoleGate ครอบ = ข้อมูลถูกส่งไปถึงเครื่อง
 *   ของคนที่ไม่ควรเห็นเรียบร้อยแล้ว ต่อให้จอไม่แสดงก็ตาม
 *   ซึ่งเป็นสิ่งที่คอมเมนต์ใน role-gate.tsx ห้ามไว้ตรงๆ
 *
 * ยังไม่ใช่ชั้นความปลอดภัยสุดท้ายอยู่ดี — RLS ใน 0010 เป็นชั้นนั้น
 * function นี้แค่ทำให้ไม่ต้องส่งข้อมูลออกไปโดยไม่จำเป็น
 */
export function hasAnyRole(
  profile: CurrentProfile | null,
  roles: readonly AppRole[],
): boolean {
  if (!profile) return false;
  if (profile.roles.includes("admin")) return true;
  return roles.some((r) => profile.roles.includes(r));
}
