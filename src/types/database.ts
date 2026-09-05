/**
 * Type ของ schema — ไฟล์นี้เป็น placeholder ชั่วคราว
 *
 * ของจริง generate จาก schema ที่รันอยู่ใน Supabase จริงเท่านั้น
 * ห้ามเขียน type ตารางด้วยมือ เพราะจะหลุดจาก schema จริงทันทีที่มี migration ใหม่
 *
 *   npx supabase gen types typescript --project-id <your-project-ref> > src/types/database.ts
 *
 * ทำหลังรัน migration 0001–0011 ครบแล้ว (ดู supabase/README.md)
 * แล้วลบ eslint-disable บรรทัดล่างทิ้ง
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]
