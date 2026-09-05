/**
 * ⚠️⚠️ Supabase client ด้วย service_role key — ข้ามทุก RLS policy ⚠️⚠️
 *
 * ห้าม import ไฟล์นี้จาก Client Component โดยเด็ดขาด
 * ห้าม import จากไฟล์ที่มี "use client" อยู่บนสุด
 * ห้าม import จากไฟล์ที่ถูก import ต่อโดย Client Component
 *
 * ใช้ได้เฉพาะใน Server Action และ Route Handler และเฉพาะงานที่ต้องข้าม RLS จริงๆ
 * เช่น map service_number -> phone ตอน login ซึ่งผู้ใช้ยังไม่มี session
 *
 * ถ้าเผลอ deploy ไฟล์นี้ลง browser ข้อมูลทั้งฐานจะเปิดให้ทุกคนที่เปิด DevTools
 * ถ้าสงสัยว่าหลุด ให้ rotate service_role key ที่ Supabase Dashboard ทันที
 * แล้วค่อยตามลบ history (AI_RULES.md §5.1)
 *
 * ก่อนเขียนโค้ดที่ import ไฟล์นี้ ให้ถามตัวเองก่อนว่า
 * "งานนี้ทำด้วย ./server ที่บังคับ RLS แทนได้หรือไม่" — ส่วนใหญ่คำตอบคือได้
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'

export function createAdminClient() {
  // ตาข่ายชั้นสุดท้าย ไม่ใช่ชั้นแรก
  // ชั้นแรกคือการไม่ import ไฟล์นี้เข้ามาใน client bundle ตั้งแต่ต้น
  if (typeof window !== 'undefined') {
    throw new Error(
      '[medrelay] createAdminClient ถูกเรียกจากฝั่ง browser — ' +
        'service_role key ข้ามทุก RLS policy ห้ามใช้นอกฝั่ง server เด็ดขาด'
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      '[medrelay] ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ใน environment'
    )
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      // ไม่เก็บและไม่ต่ออายุ session — client ตัวนี้ไม่ได้แทนผู้ใช้คนใด
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
