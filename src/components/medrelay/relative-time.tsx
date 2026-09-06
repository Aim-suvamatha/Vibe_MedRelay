"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * RelativeTime — แสดงเวลาเทียบกับปัจจุบัน
 *
 * ทำไมต้องมี component นี้แทนการ format ตรงๆ ในแต่ละหน้า
 *   1. ทุกหน้าใน wireframe แสดงเวลาแบบเทียบ ("44 น.", "ใกล้ถึง 6 น.", "ส่งคำขอแล้ว 10:04")
 *      ถ้าต่างคนต่าง format จะได้คำต่างกันจนผู้ใช้สับสน
 *   2. ตัวเลขบนหน้าจอต้องเดินเองโดยไม่ต้องรีเฟรช เพราะศูนย์สั่งการเปิดหน้าค้างไว้ทั้งวัน
 *   3. เวลาเต็มต้องเข้าถึงได้เสมอผ่าน title และ <time dateTime> สำหรับ screen reader
 *
 * ค่าที่รับต้องเป็นเวลาที่ database เป็นคนตั้ง (trigger ใน 0009) ไม่ใช่เวลาที่ผู้ใช้พิมพ์
 */

const REFRESH_MS = 30_000;

const FULL = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
});

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** ระยะเวลาที่ผ่านไปแบบสั้น เช่น "44 น." หรือ "1 ชม. 06 น." ตามคอลัมน์ "เวลาสะสม" ใน wireframe 05 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(total / 60);
  if (mins < 60) return `${mins} น.`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours < 24) return `${hours} ชม. ${String(rest).padStart(2, "0")} น.`;
  const days = Math.floor(hours / 24);
  return `${days} วัน ${hours % 24} ชม.`;
}

/** เวลาเทียบปัจจุบันแบบมีทิศทาง เช่น "3 นาทีที่แล้ว" หรือ "อีก 6 นาที" */
export function formatAgo(target: Date, now: number): string {
  const diff = now - target.getTime();
  const future = diff < 0;
  const secs = Math.floor(Math.abs(diff) / 1000);

  if (secs < 15) return "เมื่อสักครู่";
  if (secs < 60) {
    return future ? `อีก ${secs} วินาที` : `${secs} วินาทีที่แล้ว`;
  }

  const mins = Math.floor(secs / 60);
  if (mins < 60) {
    return future ? `อีก ${mins} นาที` : `${mins} นาทีที่แล้ว`;
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rest = mins % 60;
    const label = rest ? `${hours} ชม. ${rest} นาที` : `${hours} ชม.`;
    return future ? `อีก ${label}` : `${label}ที่แล้ว`;
  }

  const days = Math.floor(hours / 24);
  if (days < 8) {
    return future ? `อีก ${days} วัน` : `${days} วันที่แล้ว`;
  }
  // เกินหนึ่งสัปดาห์ "45 วันที่แล้ว" ไม่ช่วยอะไร บอกวันที่จริงดีกว่า
  return FULL.format(target);
}

export function RelativeTime({
  value,
  variant = "ago",
  className,
  prefix,
}: {
  value: string | number | Date;
  /** ago = "3 นาทีที่แล้ว" · elapsed = "44 น." สำหรับคอลัมน์เวลาสะสม */
  variant?: "ago" | "elapsed";
  className?: string;
  /** ข้อความนำหน้า เช่น "ส่งคำขอแล้ว" */
  prefix?: string;
}) {
  const target = toDate(value);
  const iso = Number.isNaN(target.getTime()) ? undefined : target.toISOString();

  const render = (now: number) =>
    variant === "elapsed"
      ? formatElapsed(now - target.getTime())
      : formatAgo(target, now);

  const [text, setText] = useState(() => render(Date.now()));

  useEffect(() => {
    const tick = () => setText(render(Date.now()));
    tick();

    const id = setInterval(tick, REFRESH_MS);
    // แอปถูกพับไว้เบื้องหลังแล้วเปิดกลับมา ต้องเห็นเลขที่ถูกต้องทันที ไม่ใช่รออีก 30 วินาที
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, variant]);

  if (!iso) return null;

  return (
    <time
      dateTime={iso}
      title={FULL.format(target)}
      className={cn("tabular", className)}
      // เวลาบน server กับ client ต่างกันไม่กี่วินาทีเป็นเรื่องปกติ ไม่ใช่ bug ของ markup
      suppressHydrationWarning
    >
      {prefix ? `${prefix} ${text}` : text}
    </time>
  );
}
