/**
 * Supabase client สำหรับฝั่ง server — ใช้ anon key + session ของผู้ใช้จาก cookie
 *
 * นี่คือ client ที่ควรใช้เป็นค่าเริ่มต้นเสมอ
 * เพราะทุก query จะถูกบังคับด้วย RLS ในนามของผู้ใช้ที่ล็อกอินอยู่จริง
 *
 * ถ้าลืมส่ง cookie เข้ามา auth.uid() จะเป็น null
 * RLS policy ทุกข้อจะปฏิเสธ และหน้าเว็บจะว่างเปล่าโดยไม่มี error ให้เห็น
 * — เป็นอาการที่ debug ยากที่สุดของ Supabase + Next.js
 */
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

import type { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // ถูกเรียกจาก Server Component ซึ่งเขียน cookie ไม่ได้
            // ไม่เป็นไรถ้ามี middleware คอย refresh session อยู่แล้ว (Prompt 06)
          }
        },
      },
    }
  )
}
