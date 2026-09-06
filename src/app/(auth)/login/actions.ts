"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hit } from "@/lib/auth/rate-limit";

/**
 * Server Action ของหน้าเข้าสู่ระบบ
 *
 * สิ่งที่ไฟล์นี้ต้องทำให้ได้ตาม Prompt 06
 *   1. รับเลขประจำตัวทหาร 10 หลัก ไม่ใช่ email — ผู้ใช้ในสนามจำเลขนี้อยู่แล้ว
 *   2. แปลงเลขทหารเป็นบัญชีผู้ใช้ "ฝั่ง server เท่านั้น" ไม่ส่งกลับไปที่ browser
 *   3. ข้อความผิดพลาดต้องเหมือนกันทุกกรณี ห้ามบอกว่าเลขนี้มีอยู่จริงหรือไม่
 *   4. rate limit กันการไล่เดาเลขทหารทีละเลข
 *
 * ⚠ ห้ามรับหรือเก็บเลขบัตรประชาชน 13 หลักในทุกจุดของ flow นี้ (AI_RULES §3.1)
 *   zod ด้านล่างบังคับ 10 หลักพอดี เลข 13 หลักจึงตกตั้งแต่ด่านแรก
 */

/**
 * ยอมรับเฉพาะเส้นทางภายในเว็บนี้เท่านั้น
 *
 * ถ้าเอาค่าจาก ?next= ไปใช้ตรงๆ ผู้โจมตีจะส่งลิงก์
 * /login?next=https://evil.example มาให้เหยื่อ พอล็อกอินเสร็จระบบจะพาไปเว็บปลอม
 * ที่หน้าตาเหมือนกันแล้วขอรหัสผ่านซ้ำ — ช่องโหว่ open redirect
 *
 * "//evil.example" ก็ต้องกัน เพราะ browser อ่านเป็น protocol-relative URL
 * และ "\\" เพราะบาง browser ตีความเป็น "/"
 */
function safeNext(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

const LoginInput = z.object({
  // \d{10} พอดีเป๊ะ ไม่ใช่ "อย่างน้อย 10" — เลข 13 หลักต้องไม่ผ่าน
  serviceNumber: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "เลขประจำตัวต้องเป็นตัวเลข 10 หลัก"),
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
});

export type LoginState = {
  error?: string;
  /** ใช้คงค่าในช่องกรอกไว้เมื่อ submit ไม่ผ่าน จะได้ไม่ต้องพิมพ์ใหม่ */
  serviceNumber?: string;
};

/**
 * ข้อความเดียวสำหรับทุกความล้มเหลวที่เกี่ยวกับตัวตน
 *
 * ถ้าแยกเป็น "ไม่พบเลขนี้" กับ "รหัสผ่านผิด" ผู้โจมตีจะไล่ยิงเลข 10 หลัก
 * แล้วอ่านจากข้อความว่าเลขไหนมีคนใช้อยู่ ซึ่งคือรายชื่อกำลังพลของหน่วย
 */
const GENERIC_ERROR = "เลขประจำตัวหรือรหัสผ่านไม่ถูกต้อง";

async function clientIp() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const raw = {
    serviceNumber: String(formData.get("serviceNumber") ?? ""),
    password: String(formData.get("password") ?? ""),
  };

  const parsed = LoginInput.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
      serviceNumber: raw.serviceNumber,
    };
  }
  const { serviceNumber, password } = parsed.data;

  // ── rate limit สองชั้น ────────────────────────────────────────
  // ชั้น IP กันคนเดียวไล่ยิงหลายเลข · ชั้นเลขทหารกันหลายเครื่องรุมเลขเดียว
  const ip = await clientIp();
  const byIp = hit(`login:ip:${ip}`, 10, 10 * 60_000);
  const byUser = hit(`login:sn:${serviceNumber}`, 5, 10 * 60_000);

  if (!byIp.ok || !byUser.ok) {
    const wait = Math.max(byIp.retryAfterSec, byUser.retryAfterSec);
    return {
      error: `พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารออีก ${Math.ceil(wait / 60)} นาที`,
      serviceNumber,
    };
  }

  // ── แปลงเลขทหารเป็นบัญชีผู้ใช้ ────────────────────────────────
  // ต้องใช้ admin client เพราะผู้ใช้ยังไม่มี session RLS จึงยังไม่ยอมให้อ่าน profile
  // ผลลัพธ์ (email/เบอร์) ไม่เคยถูกส่งกลับไปที่ browser — ใช้ต่อในโปรเซสนี้แล้วทิ้ง
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profile")
    .select("id, is_active")
    .eq("service_number", serviceNumber)
    .maybeSingle();

  let email: string | null = null;
  if (profile?.is_active) {
    const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
    email = authUser?.user?.email ?? null;
  }

  const supabase = await createClient();

  if (!email) {
    // ไม่พบเลขนี้ หรือบัญชีถูกปิด — ยังต้องยิง request ที่ใช้เวลาพอๆ กัน
    // ไม่งั้นผู้โจมตีจับเวลาตอบกลับแล้วแยกออกว่าเลขไหนมีอยู่จริง
    // ทั้งที่ข้อความบนหน้าจอเหมือนกันทุกประการ
    await supabase.auth.signInWithPassword({
      email: `no-such-user-${serviceNumber}@medrelay.invalid`,
      password,
    });
    return { error: GENERIC_ERROR, serviceNumber };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: GENERIC_ERROR, serviceNumber };

  // redirect() ทำงานด้วยการโยน error ที่ Next ดักเอง ต้องอยู่นอก try/catch เสมอ
  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
