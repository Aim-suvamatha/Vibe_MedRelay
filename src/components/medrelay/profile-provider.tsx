"use client";

import { createContext } from "react";

import type { CurrentProfile } from "@/lib/auth/profile";

/**
 * ส่ง profile ที่อ่านมาแล้วฝั่ง server ลงไปให้ Client Component ใช้ต่อ
 *
 * ทำแบบนี้แทนการให้ browser ยิง query เองเพราะ
 *   - ไม่มีจังหวะกะพริบตอนโหลด ผู้ใช้เห็นชื่อและ tab ที่ถูกต้องตั้งแต่เฟรมแรก
 *   - ประหยัดหนึ่ง round trip ซึ่งสำคัญมากบนสัญญาณมือถือในพื้นที่ปฏิบัติการ
 */
export const ProfileContext = createContext<CurrentProfile | null>(null);

export function ProfileProvider({
  profile,
  children,
}: {
  profile: CurrentProfile;
  children: React.ReactNode;
}) {
  return (
    <ProfileContext value={profile}>{children}</ProfileContext>
  );
}
