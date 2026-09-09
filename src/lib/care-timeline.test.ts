/**
 * ชุดทดสอบการจัดผลประเมินเป็น "จุด" ตามสายส่งกลับ
 *
 *   npm run test:unit
 *
 * ★ ทำไมต้องเป็น unit test
 *   groupByStation เป็น pure function จึงคุมทุกสาขาได้ครบโดยไม่ต้องมีฐานข้อมูล
 *   และสาขาที่อันตรายที่สุดคือ "จุดที่ยังไม่เกิดต้องไม่โผล่" ซึ่งบน e2e
 *   ต้องเดินทั้งสายกว่าจะทดสอบได้หนึ่งกรณี แต่ที่นี่เขียนได้ในสามบรรทัด
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { groupByStation, stationsOf, type CareLeg } from "./care-timeline.ts";

const BN = "ที่พยาบาลกองพัน ก";
const HOSP = "โรงพยาบาลค่ายสมมติ";
const ROLE4 = "โรงพยาบาลศูนย์";

/** ทอดที่เดินครบแล้ว — ใช้เป็นฐานแล้วปรับเวลาตามที่แต่ละข้อต้องการ */
function leg(over: Partial<CareLeg> = {}): CareLeg {
  return {
    legNo: 1,
    fromUnit: BN,
    toUnit: HOSP,
    vehicle: "DEMO-02",
    onSceneAt: "2026-09-09T02:00:00Z",
    handoverAt: "2026-09-09T03:00:00Z",
    ...over,
  };
}

const ev = (at: string, id = at) => ({ at, id });

test("ทอดเดียวที่เดินครบ ได้สามจุดเรียงจากต้นทางไปปลายทาง", () => {
  const s = stationsOf([leg()]);
  assert.deepEqual(
    s.map((x) => x.label),
    [BN, "ระหว่างทาง · ทอด 1", HOSP],
  );
  assert.equal(s[0].startsAt, null); // จุดแรกรับทุกอย่างที่เกิดก่อนหน้า
  assert.equal(s[1].sublabel, "บนรถ DEMO-02");
});

test("★ ทอดที่ยังไม่ถึงจุดรับ ได้จุดเดียว — จุดที่ยังไม่เกิดต้องไม่โผล่", () => {
  // ทอด pending/dispatched ยังไม่มี onSceneAt ผู้ป่วยจึงยังอยู่ต้นทาง
  const s = stationsOf([leg({ onSceneAt: null, handoverAt: null })]);
  assert.deepEqual(
    s.map((x) => x.label),
    [BN],
  );
});

test("★ ถึงปลายทางแล้วแต่ยังไม่กดรับ ยังไม่มีจุดของโรงพยาบาล", () => {
  // arrived แต่ handoverAt ยังว่าง — ผู้ป่วยยังอยู่กับชุดลำเลียง
  const s = stationsOf([leg({ handoverAt: null })]);
  assert.deepEqual(
    s.map((x) => x.label),
    [BN, "ระหว่างทาง · ทอด 1"],
  );
});

test("สองทอดได้ห้าจุด และไม่มีหน่วยซ้ำ", () => {
  const legs = [
    leg(),
    leg({
      legNo: 2,
      fromUnit: HOSP,
      toUnit: ROLE4,
      vehicle: "DEMO-05",
      onSceneAt: "2026-09-09T05:00:00Z",
      handoverAt: "2026-09-09T06:00:00Z",
    }),
  ];
  assert.deepEqual(
    stationsOf(legs).map((x) => x.label),
    [BN, "ระหว่างทาง · ทอด 1", HOSP, "ระหว่างทาง · ทอด 2", ROLE4],
  );
});

test("เหตุการณ์ตกจุดตามเวลา", () => {
  const groups = groupByStation(
    [leg()],
    [
      ev("2026-09-09T01:00:00Z"), // ก่อนรถถึง → ต้นทาง
      ev("2026-09-09T02:30:00Z"), // ระหว่างทาง
      ev("2026-09-09T04:00:00Z"), // หลังรับผู้ป่วย → ปลายทาง
    ],
  );
  assert.deepEqual(
    groups.map((g) => [g.station.label, g.events.length]),
    [[BN, 1], ["ระหว่างทาง · ทอด 1", 1], [HOSP, 1]],
  );
});

test("★ เวลาตรงขอบพอดี นับเป็นของจุดใหม่ ไม่ใช่จุดเดิม", () => {
  /**
   * ผู้รับกดรับผู้ป่วยแล้วบันทึกผลประเมินในวินาทีเดียวกันเกิดขึ้นได้จริง
   * ถ้าใช้ < แทน <= ผลนั้นจะไปโผล่ใต้ "ระหว่างทาง" ซึ่งผิดตัวคนบันทึก
   */
  const groups = groupByStation([leg()], [ev("2026-09-09T03:00:00Z")]);
  assert.deepEqual(
    groups.map((g) => g.station.label),
    [HOSP],
  );
});

test("★ เหตุการณ์ก่อนเวลาของทุกจุด ต้องตกจุดแรก ไม่ใช่หายไป", () => {
  // ผลประเมินแรกรับบันทึกก่อนทอดถูกสร้างเสร็จได้ ถ้าหายไปเวชระเบียนขาดท่อน
  const groups = groupByStation([leg()], [ev("2020-01-01T00:00:00Z")]);
  assert.deepEqual(
    groups.map((g) => [g.station.label, g.events.length]),
    [[BN, 1]],
  );
});

test("จุดที่ไม่มีเหตุการณ์ไม่ถูกคืนออกมา", () => {
  // มีสามจุด แต่ลงบันทึกไว้จุดเดียว — อีกสองจุดต้องไม่กลายเป็นหัวข้อว่าง
  const groups = groupByStation([leg()], [ev("2026-09-09T04:00:00Z")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].station.label, HOSP);
});

test("ลำดับที่ผู้เรียกเรียงมาต้องไม่ถูกสลับ", () => {
  /**
   * ผู้เรียกเรียงด้วย given_at → created_at → id มาแล้ว ซึ่งเป็นการแก้บั๊ก
   * สายรัดเรียงสลับกับการ์ดสายรัดเมื่อ 9 ก.ย. — เรียงซ้ำที่นี่จะพังของนั้น
   */
  const same = "2026-09-09T04:00:00Z";
  const groups = groupByStation(
    [leg()],
    [ev(same, "a"), ev(same, "b"), ev(same, "c")],
  );
  assert.deepEqual(
    groups[0].events.map((e) => e.id),
    ["a", "b", "c"],
  );
});

test("★ จุดปัจจุบันคือจุดสุดท้ายของ stationsOf ไม่ใช่กลุ่มสุดท้ายที่มีบันทึก", () => {
  /**
   * บั๊กที่เจอตอนดูภาพหน้าจอจริง 9 ก.ย. 2569
   *
   * รถถึงโรงพยาบาลแล้ว (มี onSceneAt) แต่ไม่มีใครบันทึกอะไรระหว่างทางเลย
   * groupByStation จึงคืนกลุ่มเดียวคือของเขตหน้า ถ้าเอา .at(-1) ของผลลัพธ์นั้น
   * ไปติดป้าย "จุดนี้" เขตหน้าจะโดนติดป้าย ทั้งที่ผู้ป่วยออกจากที่นั่นไปแล้ว
   *
   * ตัวที่ถูกคือจุดสุดท้ายของ stationsOf ซึ่งไม่กรองอะไรทิ้ง
   */
  const legs = [leg({ handoverAt: null })]; // ถึงจุดรับแล้ว ยังไม่มีใครกดรับผู้ป่วย
  const groups = groupByStation(legs, [ev("2026-09-09T01:00:00Z")]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].station.label, BN); // บันทึกเดียวอยู่ที่เขตหน้า
  // แต่จุดปัจจุบันคือบนรถ ไม่ใช่เขตหน้า
  assert.equal(stationsOf(legs).at(-1)!.label, "ระหว่างทาง · ทอด 1");
  assert.notEqual(stationsOf(legs).at(-1)!.key, groups.at(-1)!.station.key);
});

test("ไม่มีทอดเลย คืนรายการว่าง ไม่ใช่พัง", () => {
  assert.deepEqual(stationsOf([]), []);
  assert.deepEqual(groupByStation([], [ev("2026-09-09T04:00:00Z")]), []);
});
