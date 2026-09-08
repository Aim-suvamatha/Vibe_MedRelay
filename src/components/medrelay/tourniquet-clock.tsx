"use client";

import { useEffect, useState } from "react";

import { formatElapsed } from "@/components/medrelay/relative-time";

/**
 * นาฬิกาขาดเลือดของสายรัดห้ามเลือดหนึ่งเส้น
 *
 * ★ ทำไมต้องเป็น client component แยก
 *   ตัวเลขต้องเดินเองโดยไม่ต้องรีเฟรช เพราะคนถือเครื่องเปิดหน้าค้างไว้ระหว่างเดินทาง
 *   และการอ่านเวลาปัจจุบันตอน render เป็นการเรียกฟังก์ชันที่ไม่บริสุทธิ์
 *   ซึ่ง React จะเตือนและอาจให้ผลไม่คงที่เมื่อ component re-render เอง
 *   ค่าเวลาจึงต้องอยู่ใน state ที่เราคุมจังหวะอัปเดตเอง
 *
 * ★ ผลต่างเวลาไม่ขึ้นกับ timezone
 *   given_at เป็น timestamptz ซึ่งเป็นจุดเวลาสัมบูรณ์ ลบกันได้ผลเท่ากันทุกเครื่อง
 *   timezone มีผลเฉพาะการแสดง "เลขบนหน้าปัดนาฬิกา" ซึ่งอยู่ใน relative-time.tsx
 *
 * ★ เกณฑ์ 2 ชั่วโมงมาจากหลักการทางคลินิก ไม่ใช่ค่าที่ตั้งเอาสวย
 *   รัดนานเกินนั้นเสี่ยงต่อการสูญเสียอวัยวะ ซึ่งเป็นเหตุผลทั้งหมด
 *   ที่ตาราง treatment มีคอลัมน์เวลาแยกและมี partial index รองรับ
 */

const WARN_MS = 2 * 60 * 60 * 1000;
const TICK_MS = 30_000;

export function TourniquetClock({
  givenAt,
  releasedAt,
  showWarning = true,
}: {
  givenAt: string | number | Date;
  /** null = ยังรัดอยู่ นาฬิกาจึงเดินต่อ */
  releasedAt?: string | number | Date | null;
  showWarning?: boolean;
}) {
  const start = new Date(givenAt).getTime();
  const stop = releasedAt ? new Date(releasedAt).getTime() : null;

  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // ปิดแล้วไม่ต้องเดินต่อ ตัวเลขนิ่งอยู่ที่เวลาที่คลาย
    if (stop !== null) return;

    const tick = () => setNow(Date.now());
    tick();

    const timer = setInterval(tick, TICK_MS);
    // แอปถูกพับไว้เบื้องหลังแล้วเปิดกลับมา ต้องเห็นเลขที่ถูกต้องทันที
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [stop]);

  /**
   * ก่อน effect แรกทำงาน now ยังเป็น null — แสดงขีดกลางไว้ก่อน
   * ถ้าเดาเลขไว้ก่อนแล้วค่อยแก้ ผู้ใช้จะเห็นตัวเลขกระพริบเปลี่ยนค่า
   * ซึ่งกับนาฬิกาที่มีผลทางคลินิกไม่ควรให้เกิดเลย
   */
  const elapsed = stop !== null ? stop - start : now !== null ? now - start : null;
  const overdue = stop === null && elapsed !== null && elapsed >= WARN_MS;

  return (
    <>
      <span className="tabular">
        {elapsed === null ? "—" : formatElapsed(Math.max(0, elapsed))}
      </span>
      {showWarning && overdue && (
        <span role="alert" className="ml-2 font-semibold text-destructive">
          เกิน 2 ชั่วโมงแล้ว
        </span>
      )}
    </>
  );
}
