/**
 * Supabase client สำหรับ browser — ใช้ anon key
 *
 * ใช้ใน Client Component ที่ต้อง query เอง หรือ subscribe realtime
 * ถ้าเป็น Server Component / Server Action / Route Handler ให้ใช้ ./server แทน
 *
 * anon key เปิดเผยได้โดยตั้งใจ — สิ่งที่กั้นข้อมูลคือ RLS policy ที่ชั้น database
 * ไม่ใช่ความลับของ key (ดู supabase/migrations/0010_rls.sql)
 */
import { createBrowserClient } from '@supabase/ssr'

import type { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
