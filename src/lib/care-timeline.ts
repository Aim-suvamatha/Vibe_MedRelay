/**
 * "เหตุการณ์นี้เกิดที่จุดไหนของสายส่งกลับ" — จัดผลประเมินและการรักษาเป็นจุดๆ
 *
 * ★ ปัญหาที่ไฟล์นี้แก้ (เจ้าของโครงการเจอตอนทดสอบด้วยมือ 9 ก.ย. 2569)
 *   การ์ด "ผลประเมินตลอดสายส่งกลับ" เคยเป็นรายการยาวเรียงตามเวลาอย่างเดียว
 *   ผลของเขตหน้า · ชุดลำเลียง · โรงพยาบาล ปนกันหมดโดยไม่มีเส้นแบ่ง
 *   คนอ่านต้องไล่ดูป้าย "ทอด 1" กับ "ตอนส่งมอบ" แล้วประกอบเองในหัว
 *   แต่สิ่งที่หมอปลายทางอยากรู้คือ "จุด ก ทำอะไรมา แล้วจุด ข ทำอะไรต่อ"
 *
 * ★ "จุด" คือคนที่ถือผู้ป่วยอยู่ ณ เวลานั้น — คิดจากเวลาล้วนๆ
 *
 *     case.requested_at      leg.on_scene_at        leg.handover_at
 *             │                     │                     │
 *             ▼                     ▼                     ▼
 *      [ ต้นทาง ]           [ ระหว่างทาง ]           [ ปลายทาง ]
 *      from_unit            บนรถ · ทอด N            to_unit
 *
 *   ทอดถัดไปต่อท้ายด้วยกติกาเดียวกัน ปลายทางทอด 1 = ต้นทางทอด 2
 *   จึงไม่มีจุดซ้ำ และได้สายยาวเท่าจำนวนทอดจริงโดยอัตโนมัติ
 *
 * ★ ทำไมใช้เวลา ไม่ใช้ assessment.kind
 *   kind มีเฉพาะในตาราง assessment — ตาราง treatment ไม่มีคอลัมน์นี้เลย
 *   จึงจัดกลุ่มการรักษาไม่ได้ถ้ายึด kind และการดูจาก given_by ก็ทำไม่ได้
 *   เพราะ policy profile_select ไม่ให้ปลายทางเห็น profile ของคนเขตหน้า
 *   (นี่คือที่มาของ "บันทึกโดย ไม่ทราบผู้บันทึก" ที่ยังค้างอยู่)
 *
 *   ส่วนเวลาของทอด policy leg_select ใช้ can_see_case() ล้วน
 *   ทุกคนที่เห็นเคสจึงอ่านเวลาครบทุกขั้น — ใช้ได้กับทั้งสองตารางเท่าเทียมกัน
 *
 * ★ ไฟล์นี้ตอบคนละคำถามกับ custody.ts อย่าเอามาปนกัน
 *   custody.ts  → "ตอนนี้ใครบันทึกได้"      (สิทธิ์ · มองไปข้างหน้า)
 *   ไฟล์นี้      → "ที่บันทึกไปแล้วเกิดที่ไหน" (การอ่าน · มองย้อนหลัง)
 *
 * ★ plain module ห้ามมี "use server" — ทั้ง server component และชุดทดสอบ
 *   `node --test` เรียกใช้ (เหตุผลเต็มอยู่ในหัว custody.ts)
 */

/** ทอดเท่าที่ groupByStation ต้องรู้ — รับ shape กว้างๆ ให้ query ไหนก็ส่งมาได้ */
export type CareLeg = {
  legNo: number;
  fromUnit: string;
  toUnit: string;
  /** นามเรียกขานรถ ใช้เป็นคำอธิบายใต้หัวข้อจุดระหว่างทาง */
  vehicle: string | null;
  /** ⏱ ชุดลำเลียงถึงจุดรับแล้ว — จุดนี้เองที่ผู้ป่วยเปลี่ยนมือจากต้นทาง */
  onSceneAt: string | null;
  /** ⏱ ผู้รับกดรับผู้ป่วยเข้ารักษาแล้ว — ผู้ป่วยเปลี่ยนมือมาที่ปลายทาง */
  handoverAt: string | null;
};

export type CareStation = {
  /** ใช้เป็น React key — ไม่ซ้ำกันแน่นอนเพราะผูกกับ legNo และชนิดของจุด */
  key: string;
  kind: "unit" | "transit";
  /** ชื่อหน่วย หรือ "ระหว่างทาง · ทอด N" */
  label: string;
  /** คำอธิบายรอง เช่น "บนรถ DEMO-02" — null เมื่อไม่มีอะไรจะบอกเพิ่ม */
  sublabel: string | null;
  /**
   * เวลาที่จุดนี้เริ่มถือผู้ป่วย
   * null เฉพาะจุดแรก ซึ่งรับทุกอย่างที่เกิดก่อนชุดลำเลียงมาถึง
   * (รวมถึงผลประเมินแรกรับที่บันทึกก่อนเปิดคำขอเสร็จด้วย)
   */
  startsAt: string | null;
};

export type StationGroup<T> = {
  station: CareStation;
  events: T[];
};

/**
 * สร้างรายชื่อจุดจากทอด เรียงจากต้นทางไปปลายทาง
 *
 * ★ จุดที่ "ยังไม่เกิด" ต้องไม่ถูกสร้าง
 *   ทอดที่ยัง pending ไม่มี onSceneAt/handoverAt ถ้าเผลอสร้างจุดไว้ล่วงหน้า
 *   ปลายทางจะเห็นหัวข้อหน่วยที่ผู้ป่วยยังไปไม่ถึง ซึ่งอ่านแล้วเข้าใจผิดทันที
 *   ว่าผู้ป่วยถึงแล้ว — บนหน้าจอที่ใช้ตัดสินใจทางคลินิก สิ่งนี้รับไม่ได้
 */
export function stationsOf(legs: readonly CareLeg[]): CareStation[] {
  if (legs.length === 0) return [];

  const ordered = [...legs].sort((a, b) => a.legNo - b.legNo);
  const stations: CareStation[] = [
    {
      key: "origin",
      kind: "unit",
      label: ordered[0].fromUnit,
      sublabel: null,
      startsAt: null,
    },
  ];

  for (const leg of ordered) {
    if (leg.onSceneAt) {
      stations.push({
        key: `transit-${leg.legNo}`,
        kind: "transit",
        label: `ระหว่างทาง · ทอด ${leg.legNo}`,
        sublabel: leg.vehicle ? `บนรถ ${leg.vehicle}` : null,
        startsAt: leg.onSceneAt,
      });
    }
    if (leg.handoverAt) {
      stations.push({
        key: `unit-${leg.legNo}`,
        kind: "unit",
        label: leg.toUnit,
        sublabel: null,
        startsAt: leg.handoverAt,
      });
    }
  }

  return stations;
}

/**
 * โยนเหตุการณ์เข้าจุดตามเวลา แล้วคืนเฉพาะจุดที่มีของจริง
 *
 * ★ เหตุการณ์เข้าจุด "สุดท้ายที่เริ่มก่อนหรือพร้อมกับเวลาของเหตุการณ์"
 *   ใช้ <= ไม่ใช่ < เพราะเวลาที่เท่ากันสนิทเกิดขึ้นได้จริง — ผู้รับกดรับผู้ป่วย
 *   แล้วบันทึกผลประเมินในวินาทีเดียวกัน ต้องนับเป็นของปลายทาง ไม่ใช่ของบนรถ
 *
 * ★ ลำดับของ events ที่ส่งเข้ามาถูกรักษาไว้ทั้งหมด ไม่เรียงใหม่ที่นี่
 *   ผู้เรียกเรียงมาแล้วด้วยคีย์ที่ตัดสินเสมอได้ (given_at → created_at → id)
 *   ซึ่งเป็นการแก้บั๊กสายรัดเรียงสลับเมื่อ 9 ก.ย. — เรียงซ้ำที่นี่จะพังของนั้น
 */
export function groupByStation<T extends { at: string }>(
  legs: readonly CareLeg[],
  events: readonly T[],
): StationGroup<T>[] {
  const stations = stationsOf(legs);
  if (stations.length === 0) return [];

  const groups: StationGroup<T>[] = stations.map((station) => ({
    station,
    events: [],
  }));

  for (const event of events) {
    // ไล่จากจุดท้ายกลับมา เจอจุดแรกที่เริ่มแล้วคือจุดของเหตุการณ์นี้
    let index = 0;
    for (let i = groups.length - 1; i >= 0; i--) {
      const startsAt = groups[i].station.startsAt;
      if (startsAt === null || startsAt <= event.at) {
        index = i;
        break;
      }
    }
    groups[index].events.push(event);
  }

  return groups.filter((g) => g.events.length > 0);
}
