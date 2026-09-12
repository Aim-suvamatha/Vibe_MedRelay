import { median } from "./duration.ts";

/**
 * สถิติเส้นทางการส่งกลับ — ตรรกะบริสุทธิ์ที่มีชุดทดสอบกำกับ
 *
 * ★ ทำไมแยกจาก monitor-resources.ts
 *   ไฟล์นั้นเรียก createClient() ซึ่งลาก next/headers เข้ามาทั้งก้อน
 *   `node --test` จึง import ไปทดสอบไม่ได้เลยแม้แต่ฟังก์ชันที่ไม่แตะฐานข้อมูล
 *   นี่คือการแบ่งชุดเดียวกับ duration.ts (บริสุทธิ์ มีเทสต์) กับ metrics.ts (ต่อฐานข้อมูล)
 *
 * ★ กติกา import ของไฟล์ที่มีชุดทดสอบ (แบบเดียวกับ custody.ts)
 *   - ค่า runtime ต้อง import แบบ relative พร้อมนามสกุล `.ts`
 *   - `@/` ใช้ได้เฉพาะ `import type` เพราะถูกลบทิ้งตอน strip type ไม่เหลือให้ resolve
 *   ถ้าเผลอใช้ `@/` กับค่า runtime เทสต์จะล้มด้วย ERR_MODULE_NOT_FOUND
 *   ซึ่งเป็น error ที่ชี้ไปผิดที่สนิท และ typecheck ผ่านสบาย
 */

export type RouteLegRow = {
  from_unit_id: string;
  to_unit_id: string;
  leg_total_sec: number | string | null;
};

export type RoutePairRow = {
  from_unit_id: string;
  to_unit_id: string;
};

export type RouteStat = {
  key: string;
  fromUnit: string;
  toUnit: string;
  /** ทอดที่ส่งมอบเสร็จแล้วบนเส้นทางนี้ */
  completed: number;
  /** ทอดที่กำลังวิ่งอยู่บนเส้นทางนี้ตอนนี้ */
  moving: number;
  /** มัธยฐานเวลาตั้งแต่เปิดคำขอถึงส่งมอบ — null เมื่อยังไม่มีทอดที่จบ */
  medianSec: number | null;
};

/**
 * รวมยอดเฉพาะแถวที่รายงานมาจริง — คืน null เมื่อไม่มีใครรายงานเลย
 *
 * ★ ห้ามคืน 0 ในกรณีที่ไม่มีข้อมูล
 *   "เตียงว่าง 0" อ่านได้ว่าโรงพยาบาลเต็มแล้ว ซึ่งเป็นคนละเรื่องกับ
 *   "ยังไม่มีใครรายงานว่าเหลือกี่เตียง" และเป็นคำตอบที่ทำให้จ่ายผิดที่ได้จริง
 *   (หลักการเดียวกับ /dashboard ที่ห้ามแสดง 0 นาทีเมื่อยังวัดไม่ได้)
 */
export function sumReported(values: readonly (number | null)[]): number | null {
  const reported = values.filter((v): v is number => v !== null);
  return reported.length === 0 ? null : reported.reduce((sum, v) => sum + v, 0);
}

/**
 * รวมทอดเป็นเส้นทาง (ต้นทาง → ปลายทาง)
 *
 * ★ ระบบไม่มีตาราง "เส้นทาง" และไม่ควรมี
 *   เส้นทางคือคู่หน่วยที่เกิดขึ้นจริงจากทอดที่วิ่งไปแล้ว ถ้าประกาศไว้ล่วงหน้า
 *   เป็นตารางแยก มันจะเพี้ยนจากความจริงทันทีที่มีคนส่งข้ามเส้นทางที่ไม่ได้ประกาศไว้
 *
 * ★ ทอดที่ยังไม่จบไม่เข้ามัธยฐานเวลา แต่ต้องนับเป็น "กำลังวิ่ง"
 *   ถ้านับเวลาของทอดที่ยังวิ่งอยู่เข้าไปด้วย ค่ามัธยฐานจะต่ำกว่าความจริงเสมอ
 *   เพราะทอดที่เพิ่งออกตัวดูเหมือนใช้เวลาน้อย ทั้งที่มันยังไม่ถึงที่หมาย
 *   (v_leg_metrics กรอง status = 'completed' ให้แล้ว ที่นี่จึงแค่ไม่เอาสองก้อนมาปน)
 */
export function groupRoutes(
  completed: readonly RouteLegRow[],
  moving: readonly RoutePairRow[],
  unitName: (id: string) => string,
): RouteStat[] {
  const acc = new Map<
    string,
    { fromId: string; toId: string; secs: number[]; moving: number }
  >();

  const slot = (fromId: string, toId: string) => {
    const key = fromId + "→" + toId;
    let row = acc.get(key);
    if (!row) {
      row = { fromId, toId, secs: [], moving: 0 };
      acc.set(key, row);
    }
    return row;
  };

  for (const r of completed) {
    // 🔴 ห้ามใช้ Number(x) ตรงๆ แล้วกรองด้วย Number.isFinite อย่างเดียว
    //    Number(null) และ Number("") คืน 0 ซึ่ง "ผ่าน" isFinite ไปได้สบาย
    //    ทอดที่เวลาไม่ครบจึงถูกนับเป็น 0 วินาทีแล้วดึงค่ามัธยฐานลงทั้งเส้นทาง
    //    ศูนย์สั่งการจะเห็นว่าเส้นนั้นเร็วกว่าความจริง แล้วจ่ายเคสด่วนไปทางที่ช้ากว่า
    //    (เทสต์ "ทอดที่เวลาไม่ครบไม่เข้ามัธยฐาน" จับข้อนี้ไว้ อย่าถอดออก)
    const raw = r.leg_total_sec;
    const sec = raw === null || raw === "" ? Number.NaN : Number(raw);

    // ยังต้องสร้าง slot ไว้แม้เวลาใช้ไม่ได้ เพราะเส้นทางนั้นมีของวิ่งผ่านจริง
    const row = slot(r.from_unit_id, r.to_unit_id);
    if (Number.isFinite(sec)) row.secs.push(sec);
  }

  for (const r of moving) slot(r.from_unit_id, r.to_unit_id).moving += 1;

  return [...acc.entries()]
    .map(([key, row]) => ({
      key,
      fromUnit: unitName(row.fromId),
      toUnit: unitName(row.toId),
      completed: row.secs.length,
      moving: row.moving,
      medianSec: median(row.secs),
    }))
    // เส้นทางที่มีของอยู่บนถนนตอนนี้ขึ้นก่อน แล้วจึงเรียงตามปริมาณที่วิ่งไปแล้ว
    .sort(
      (a, b) =>
        b.moving - a.moving ||
        b.completed - a.completed ||
        a.fromUnit.localeCompare(b.fromUnit, "th"),
    );
}
