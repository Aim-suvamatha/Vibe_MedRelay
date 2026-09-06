/**
 * ชุดทดสอบสูตรที่ตัวเลขทั้งแดชบอร์ดออกมาจากมัน
 *
 *   npm run test:unit
 *
 * ใช้ node:test ที่ติดมากับ Node เอง และ Node 24 อ่าน TypeScript ได้โดยตรง
 * จึงไม่ต้องเพิ่ม test runner หรือ dependency ใดๆ เข้าโครงการ
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { formatDuration, median } from "./duration.ts";

test("median คืน null เมื่อไม่มีข้อมูล ไม่ใช่ 0", () => {
  // ข้อกำหนดสำคัญของ Prompt 09 — 0 อ่านได้ว่า "วัดแล้วได้ศูนย์" ซึ่งเป็นคนละเรื่อง
  assert.equal(median([]), null);
  assert.equal(median([NaN, Infinity]), null);
});

test("median คำนวณถูกทั้งจำนวนคี่และคู่", () => {
  assert.equal(median([5]), 5);
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test("median เรียงข้อมูลให้เองก่อนคำนวณ", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([9, 1, 5, 3]), 4);
});

test("median ไม่แกว่งตาม outlier — เหตุผลที่ไม่ใช้ mean", () => {
  const xs = [1, 1, 1, 1, 999999];
  assert.equal(median(xs), 1);
  // ค่าเฉลี่ยของชุดเดียวกันคือสองแสนกว่า ซึ่งไม่สะท้อนความจริงเลย
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(mean > 190000);
});

test("median ไม่แก้ไข array ต้นฉบับ", () => {
  const xs = [3, 1, 2];
  median(xs);
  assert.deepEqual(xs, [3, 1, 2]);
});

test("formatDuration คืนขีดกลางเมื่อไม่มีข้อมูล", () => {
  assert.equal(formatDuration(null), "—");
});

test("formatDuration แยก 'ศูนย์จริง' ออกจาก 'ไม่มีข้อมูล'", () => {
  assert.equal(formatDuration(0), "0 วินาที");
  assert.notEqual(formatDuration(0), formatDuration(null));
});

test("★ ไม่ปัดวินาทีทิ้งในช่วงต่ำกว่าหนึ่งชั่วโมง", () => {
  // 510 วินาที คือมัธยฐานเวลารอจัดรถของข้อมูลจริง
  // ถ้าปัดเป็นนาทีจะได้ "9 นาที" ซึ่งไม่ตรงกับ 8 นาที 30 วินาที ที่บันทึกไว้ใน HANDOFF
  assert.equal(formatDuration(510), "8 นาที 30 วินาที");
  assert.equal(formatDuration(240), "4 นาที");
});

test("★ ตัวเลขจริงบนแดชบอร์ดแสดงถูกต้อง", () => {
  assert.equal(formatDuration(3960), "1 ชม. 6 นาที");
  assert.equal(formatDuration(4560), "1 ชม. 16 นาที");
});

test("formatDuration ข้ามหน่วยได้ถูกต้อง", () => {
  assert.equal(formatDuration(59), "59 วินาที");
  assert.equal(formatDuration(3600), "1 ชม.");
  assert.equal(formatDuration(90000), "1 วัน 1 ชม.");
});

test("formatDuration ไม่คืนค่าติดลบ", () => {
  // v_leg_metrics ไม่ควรมีค่าติดลบอยู่แล้วเพราะ constraint leg_time_order
  // แต่ถ้าหลุดมาได้ ต้องไม่แสดงเป็น "-5 นาที" บนหน้าจอผู้บังคับบัญชา
  assert.equal(formatDuration(-100), "0 วินาที");
});
