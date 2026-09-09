/**
 * ชุดทดสอบกติกา "ผู้ป่วยอยู่ในมือใคร"
 *
 *   npm run test:unit
 *
 * ★ ทำไมต้องเป็น unit test ไม่ใช่แค่ e2e
 *   e2e พิสูจน์ได้ว่า "ปุ่มไม่โผล่" แต่ด่านจริงคือ server action ซึ่งยิงตรงได้
 *   โดยไม่ผ่านปุ่มเลย ตรรกะที่ทั้งสามที่เรียกใช้ร่วมกันจึงต้องมีชุดทดสอบของตัวเอง
 *   และ custodyOf() เป็น pure function จึงทดสอบทุกสาขาได้ครบโดยไม่ต้องมีฐานข้อมูล
 *
 * ★ กรณีที่สำคัญที่สุดคือ "คนที่ไม่ควรโดนล็อก"
 *   บัญชีสาธิต 9900000001 ถือทั้ง sender · transporter · receiver
 *   ถ้าเผลอเขียนกติกาด้วยบทบาท เขาจะโดนล็อกตอนเป็นเขตหน้าของตัวเอง
 *   ซึ่งเป็นบั๊กชนิดเดียวกับที่เจอเมื่อ 8 ก.ย. แค่กลับด้าน
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { custodyOf, type CustodyLeg } from "./custody.ts";

const HOSP = "unit-hosp";
const BN = "unit-bn";
const RECEIVER = { id: "p-receiver", unitId: HOSP };
const SENDER = { id: "p-sender", unitId: BN };
const DRIVER = { id: "p-driver", unitId: BN };

/** ทอดหนึ่งใบที่วิ่งจากกองพันเข้าโรงพยาบาล ปรับสถานะได้ตามต้องการ */
function leg(over: Partial<CustodyLeg> = {}): CustodyLeg {
  return {
    status: "in_transit",
    to_unit_id: HOSP,
    transporter_id: DRIVER.id,
    handover_at: null,
    ...over,
  };
}

test("ปลายทางที่ยังไม่ได้รับตัว บันทึกไม่ได้ — ทุกสถานะก่อนปิดทอด", () => {
  for (const status of ["pending", "dispatched", "on_scene", "in_transit", "arrived"]) {
    const c = custodyOf(RECEIVER, [leg({ status })]);
    assert.equal(c.canRecordCare, false, `status=${status} ควรถูกล็อก`);
    assert.ok(c.blockedReason, `status=${status} ต้องมีเหตุผลกำกับเสมอ`);
  }
});

test("★ ถึงปลายทางแล้วแต่ยังไม่กดรับ ก็ยังล็อก — arrived ไม่ใช่เส้นแบ่ง", () => {
  // นี่คือ Case 2 ที่เจ้าของโครงการชี้มา รถจอดหน้าตึกแล้วแต่ผู้ป่วยยังไม่ถึงมือ
  const c = custodyOf(RECEIVER, [leg({ status: "arrived" })]);
  assert.equal(c.canRecordCare, false);
});

test("ชุดลำเลียงกดส่งมอบแล้วแต่ผู้รับยังไม่กดรับ ก็ยังล็อก", () => {
  // handover_ready_at ไม่เกี่ยว — เส้นแบ่งคือ handover_at เท่านั้น
  const c = custodyOf(RECEIVER, [leg({ status: "arrived" })]);
  assert.equal(c.canRecordCare, false);
});

test("กดรับผู้ป่วยแล้ว ปลดล็อกทันที", () => {
  const c = custodyOf(RECEIVER, [
    leg({ status: "completed", handover_at: "2026-09-09T04:00:00Z" }),
  ]);
  assert.equal(c.canRecordCare, true);
  assert.equal(c.blockedReason, null);
});

test("★ เขตหน้าไม่โดนล็อก แม้จะถือบทบาท receiver ติดตัวมาด้วย", () => {
  // custodyOf ไม่เคยเห็นบทบาทเลย ตัดสินจากหน่วยและตัวตนล้วนๆ
  const c = custodyOf(SENDER, [leg({ status: "dispatched" })]);
  assert.equal(c.canRecordCare, true);
});

test("★ ชุดลำเลียงที่ถือทอดไม่โดนล็อก แม้จะสังกัดหน่วยปลายทางเอง", () => {
  // หน่วยเล็กบางแห่งคนเดียวทั้งขับรถและรับผู้ป่วย เขาอยู่กับตัวผู้ป่วยจริงระหว่างทาง
  const both = { id: "p-both", unitId: HOSP };
  const c = custodyOf(both, [leg({ transporter_id: both.id })]);
  assert.equal(c.canRecordCare, true);
});

test("ทอดที่ยกเลิกไม่นับเป็นทอดที่เดินอยู่", () => {
  const c = custodyOf(RECEIVER, [
    leg({ status: "cancelled" }),
    leg({ status: "completed", handover_at: "2026-09-09T04:00:00Z" }),
  ]);
  assert.equal(c.canRecordCare, true);
});

test("ทอดที่สองเปิดแล้ว หน่วยที่ยังถือผู้ป่วยอยู่ยังบันทึกได้", () => {
  /**
   * หลังผู้รับส่งต่อชั้นสูงกว่า ทอดที่ 2 เกิดขึ้นและยัง pending
   * ผู้ป่วยยังนอนอยู่โรงพยาบาลจนกว่ารถคันใหม่จะมารับ — ต้องบันทึกต่อได้
   * คนที่ถูกล็อกคือ "หน่วยปลายทางของทอดใหม่" ซึ่งเป็นคนละหน่วย
   */
  const legs: CustodyLeg[] = [
    leg({ status: "completed", handover_at: "2026-09-09T04:00:00Z" }),
    leg({ status: "pending", to_unit_id: "unit-role4", transporter_id: null }),
  ];
  assert.equal(custodyOf(RECEIVER, legs).canRecordCare, true);
  assert.equal(
    custodyOf({ id: "p-r4", unitId: "unit-role4" }, legs).canRecordCare,
    false,
  );
});

test("ไม่มี profile หรือไม่มีทอด — ไม่ล็อก ปล่อยให้ RLS ตัดสิน", () => {
  assert.equal(custodyOf(null, [leg()]).canRecordCare, true);
  assert.equal(custodyOf(RECEIVER, []).canRecordCare, true);
});
