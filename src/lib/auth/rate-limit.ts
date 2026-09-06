/**
 * Rate limit แบบเก็บในหน่วยความจำของโปรเซส
 *
 * ⚠ ข้อจำกัดที่ต้องรู้ก่อนใช้
 *   Vercel รันหลายอินสแตนซ์พร้อมกัน ตัวนับจึงไม่ได้แชร์กันระหว่างอินสแตนซ์
 *   ผู้โจมตีที่ยิงกระจายพอจะได้โควตามากกว่าที่ตั้งไว้ตามจำนวนอินสแตนซ์
 *   สิ่งนี้ "ลด" การ enumerate ให้ช้าลงมาก แต่ไม่ได้ "ปิด" ทั้งหมด
 *
 *   ทางที่ถูกต้องสำหรับ production คือเก็บตัวนับไว้ที่เดียวกัน
 *   เช่น Upstash Redis หรือตารางใน Postgres ที่ใช้ upsert แบบ atomic
 *   เฟส prototype เลือกแบบนี้เพราะไม่เพิ่ม dependency และไม่เพิ่ม migration
 *   ถ้าจะขึ้นใช้จริงกับกำลังพลจริง ต้องเปลี่ยนก่อน
 *
 * Fluid Compute ของ Vercel ใช้อินสแตนซ์ซ้ำข้ามคำขอ ตัวนับจึงอยู่ได้นานพอจะมีผลจริง
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** กันไม่ให้ Map โตไม่จำกัดเมื่อมี key แปลกใหม่เข้ามาเรื่อยๆ */
function sweep(now: number) {
  if (buckets.size < 5_000) return;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}

export type RateLimitResult = {
  ok: boolean;
  /** วินาทีที่ต้องรอก่อนลองใหม่ — 0 เมื่อยังไม่ถูกจำกัด */
  retryAfterSec: number;
};

/**
 * นับหนึ่งครั้งสำหรับ key ที่ให้มา
 * คืน ok = false เมื่อเกินโควตาในหน้าต่างเวลานั้น
 */
export function hit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const found = buckets.get(key);
  if (!found || found.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  found.count += 1;
  if (found.count > limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((found.resetAt - now) / 1000)),
    };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** ใช้ในเทสต์เท่านั้น */
export function _reset() {
  buckets.clear();
}
