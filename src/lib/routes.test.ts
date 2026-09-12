/**
 * ชุดทดสอบสถิติเส้นทางการส่งกลับ
 *
 *   npm run test:unit
 *
 * ★ ทำไมต้องทดสอบ
 *   ตัวเลขบนแดชบอร์ดศูนย์สั่งการถูกเอาไปใช้ตัดสินใจจ่ายรถ
 *   ค่ามัธยฐานที่ต่ำกว่าความจริงจะทำให้ศูนย์สั่งการประเมินว่าเส้นทางนั้นเร็วกว่าที่เป็น
 *   แล้วจ่ายเคสด่วนไปทางที่ช้ากว่า — บั๊กที่ไม่มีใครเห็นจากหน้าจอเลย
 *
 * ★ กรณีที่สำคัญที่สุดคือ "ทอดที่ยังวิ่งอยู่ต้องไม่เข้ามัธยฐาน"
 *   ทอดที่เพิ่งออกตัวมีเวลาผ่านไปน้อย ถ้านับเข้าไปด้วยค่าจะถูกดึงลงเสมอ
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { groupRoutes, sumReported } from "./routes.ts";

const NAME: Record<string, string> = {
  bn: "ที่พยาบาลกองพัน ก",
  bde: "ที่พยาบาลกองพล",
  hosp: "โรงพยาบาลค่าย",
};
const nameOf = (id: string) => NAME[id] ?? "—";

function leg(from: string, to: string, sec: number | string | null) {
  return { from_unit_id: from, to_unit_id: to, leg_total_sec: sec };
}

test("ไม่มีทอดเลย คืนรายการว่าง ไม่ใช่แถวที่มีเลข 0", () => {
  assert.deepEqual(groupRoutes([], [], nameOf), []);
});

test("รวมทอดของเส้นทางเดียวกันเป็นแถวเดียว และคิดมัธยฐานถูก", () => {
  const [row, ...rest] = groupRoutes(
    [leg("bn", "bde", 600), leg("bn", "bde", 1200), leg("bn", "bde", 900)],
    [],
    nameOf,
  );

  assert.equal(rest.length, 0, "เส้นทางเดียวต้องได้แถวเดียว");
  assert.equal(row.fromUnit, "ที่พยาบาลกองพัน ก");
  assert.equal(row.toUnit, "ที่พยาบาลกองพล");
  assert.equal(row.completed, 3);
  assert.equal(row.medianSec, 900);
});

test("ต้นทางปลายทางสลับกันคือคนละเส้นทาง ไม่ยุบรวม", () => {
  const rows = groupRoutes([leg("bn", "bde", 600), leg("bde", "bn", 600)], [], nameOf);
  assert.equal(rows.length, 2);
});

test("★ ทอดที่กำลังวิ่งนับเป็น moving แต่ต้องไม่เข้ามัธยฐาน", () => {
  const [row] = groupRoutes(
    [leg("bn", "bde", 1000), leg("bn", "bde", 1000)],
    [
      { from_unit_id: "bn", to_unit_id: "bde" },
      { from_unit_id: "bn", to_unit_id: "bde" },
    ],
    nameOf,
  );

  assert.equal(row.moving, 2);
  assert.equal(row.completed, 2, "ทอดที่ยังวิ่งอยู่ต้องไม่ถูกนับเป็นทอดที่วัดเวลาได้");
  assert.equal(row.medianSec, 1000, "ค่ามัธยฐานต้องมาจากทอดที่จบแล้วเท่านั้น");
});

test("เส้นทางที่มีแต่ทอดกำลังวิ่ง ยังต้องขึ้นบนกระดาน แต่เวลาเป็น null", () => {
  const [row] = groupRoutes([], [{ from_unit_id: "bde", to_unit_id: "hosp" }], nameOf);

  assert.equal(row.moving, 1);
  assert.equal(row.completed, 0);
  assert.equal(row.medianSec, null, "ยังไม่มีทอดจบ ต้องเป็น null ไม่ใช่ 0");
});

test("ทอดที่เวลาไม่ครบไม่เข้ามัธยฐาน แต่เส้นทางยังต้องปรากฏ", () => {
  const [row] = groupRoutes([leg("bn", "hosp", null)], [], nameOf);

  assert.equal(row.completed, 0);
  assert.equal(row.medianSec, null);
  assert.equal(row.fromUnit, "ที่พยาบาลกองพัน ก");
});

test("PostgREST คืนวินาทีเป็นสตริงได้ ต้องแปลงเป็นตัวเลขก่อนคิด", () => {
  const [row] = groupRoutes([leg("bn", "bde", "600"), leg("bn", "bde", "800")], [], nameOf);
  assert.equal(row.medianSec, 700);
});

test("เส้นทางที่มีของวิ่งอยู่ตอนนี้ขึ้นก่อนเส้นทางที่วิ่งไปแล้วเยอะกว่า", () => {
  const rows = groupRoutes(
    [
      leg("bn", "bde", 600),
      leg("bn", "bde", 600),
      leg("bn", "bde", 600),
      leg("bde", "hosp", 600),
    ],
    [{ from_unit_id: "bde", to_unit_id: "hosp" }],
    nameOf,
  );

  assert.equal(rows[0].fromUnit, "ที่พยาบาลกองพล", "เส้นที่มีคนอยู่บนรถต้องขึ้นก่อน");
  assert.equal(rows[1].completed, 3);
});

test("หน่วยที่หาชื่อไม่เจอแสดงขีดกลาง ไม่ใช่ uuid ดิบ", () => {
  const [row] = groupRoutes([leg("ไม่รู้จัก", "bde", 600)], [], nameOf);
  assert.equal(row.fromUnit, "—");
});

test("★ sumReported คืน null เมื่อไม่มีใครรายงาน ไม่ใช่ 0", () => {
  assert.equal(sumReported([]), null);
  assert.equal(sumReported([null, null]), null, '"ยังไม่รายงาน" ต้องไม่กลายเป็น "เต็มแล้ว"');
});

test("sumReported รวมเฉพาะแถวที่รายงานมาจริง และ 0 คือค่าที่รายงานแล้ว", () => {
  assert.equal(sumReported([4, null, 8]), 12);
  assert.equal(sumReported([0]), 0, "0 ที่รายงานมาต้องคงเป็น 0 ไม่ใช่ null");
  assert.equal(sumReported([0, null]), 0);
});
