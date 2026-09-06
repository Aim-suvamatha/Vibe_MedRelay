"use client";

import { use } from "react";

import { ProfileContext } from "@/components/medrelay/profile-provider";
import type { CurrentProfile } from "@/lib/auth/profile";
import type { AppRole } from "@/lib/enums";

/**
 * profile ของผู้ใช้ที่ล็อกอินอยู่ สำหรับ Client Component
 *
 * ใช้ได้เฉพาะใต้ ProfileProvider ซึ่งอยู่ใน layout ของกลุ่ม (app)
 * ถ้าเรียกนอกนั้นจะ throw ทันทีตอน dev แทนที่จะคืน null เงียบๆ
 * แล้วไปพังตอน runtime ในมือผู้ใช้
 */
export function useProfile(): CurrentProfile {
  const profile = use(ProfileContext);
  if (!profile) {
    throw new Error(
      "[medrelay] useProfile ถูกเรียกนอก ProfileProvider — " +
        "component นี้ต้องอยู่ใต้ layout ของกลุ่ม (app)",
    );
  }
  return profile;
}

/** ผู้ใช้ถือบทบาทใดบทบาทหนึ่งในรายการนี้หรือไม่ (admin ถือว่าได้ทุกบทบาท) */
export function useHasRole(...roles: AppRole[]): boolean {
  const profile = useProfile();
  if (profile.roles.includes("admin")) return true;
  return roles.some((r) => profile.roles.includes(r));
}
