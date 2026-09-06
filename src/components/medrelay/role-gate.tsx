"use client";

import { useProfile } from "@/hooks/use-profile";
import type { AppRole } from "@/lib/enums";

/**
 * RoleGate — ซ่อน UI ที่ผู้ใช้บทบาทนั้นไม่ได้ใช้
 *
 * ⚠⚠ นี่คือเรื่อง UX ล้วนๆ ไม่ใช่ความปลอดภัย ⚠⚠
 *
 *   component นี้แค่ "ไม่วาด" ปุ่มบางปุ่มเพื่อให้หน้าจอไม่รก
 *   มันไม่ได้กันอะไรเลย เพราะทุกอย่างที่นี่รันในเครื่องของผู้ใช้
 *   ใครก็เปิด DevTools แก้ state แล้วทำให้ปุ่มโผล่มาได้ภายในสิบวินาที
 *
 *   สิ่งที่กันจริงคือ RLS policy ใน supabase/migrations/0010_rls.sql
 *   ซึ่งบังคับที่ชั้น database ต่อให้กดปุ่มที่ไม่ควรเห็นได้ query ก็ถูกปฏิเสธอยู่ดี
 *
 *   ❌ ห้ามใช้ RoleGate เป็นเหตุผลในการไม่เขียน RLS policy
 *   ❌ ห้ามใช้ RoleGate ซ่อนข้อมูลที่ผู้ใช้ไม่ควรเห็น
 *      เพราะข้อมูลนั้นถูกส่งมาถึงเครื่องเขาแล้วก่อนจะถูกซ่อน
 *      ถ้าไม่ควรเห็น ต้องไม่ถูกส่งมาตั้งแต่แรก — แก้ที่ policy หรือที่ query
 *   ✅ ใช้ซ่อน "ทางลัดไปยังงานที่ไม่ใช่หน้าที่ของเขา" เท่านั้น
 */
export function RoleGate({
  roles,
  fallback = null,
  children,
}: {
  /** แสดง children เมื่อผู้ใช้ถือบทบาทใดบทบาทหนึ่งในรายการนี้ */
  roles: readonly AppRole[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const profile = useProfile();

  const allowed =
    profile.roles.includes("admin") ||
    roles.some((r) => profile.roles.includes(r));

  return <>{allowed ? children : fallback}</>;
}
