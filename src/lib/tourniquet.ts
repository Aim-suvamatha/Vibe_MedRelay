import { createClient } from "@/lib/supabase/server";

/**
 * สายรัดห้ามเลือดที่เดินทางไปกับผู้ป่วย
 *
 * ★ ทำไมต้องเป็น query แยก ไม่ฝังใน SELECT ของ leg-queries
 *   PostgREST ฝัง treatment เข้าไปใน embed สองชั้นได้ก็จริง แต่การกรอง
 *   tx_code ของ resource ที่ฝังอยู่ต้องเขียนเป็น filter บนเส้นทางเต็ม
 *   ซึ่งเปลี่ยนความหมายของ join ไปด้วยในบางกรณี — ยิงแยกหนึ่งครั้งอ่านง่ายกว่ามาก
 *   และหน้าที่ต้องใช้มีไม่กี่หน้า
 *
 * ★ การเรียงต้องมีตัวตัดสินเสมอกันเสมอ ห้ามเรียงด้วย given_at อย่างเดียว
 *   ช่องเวลาที่รัดเป็น datetime-local ซึ่งละเอียดแค่ระดับนาที และสายรัดหลายเส้น
 *   ของเคสเดียวกันมักถูกบันทึกพร้อมกันในคำสั่งเดียว created_at จึงเท่ากันด้วย
 *   (มาจาก now() ของทรานแซกชันเดียวกัน) เมื่อคีย์เรียงเสมอกันสนิท
 *   Postgres คืนลำดับแบบไม่รับประกัน และเปลี่ยนได้ระหว่างการ query แต่ละครั้ง
 *
 *   ผลที่เคยเกิดจริง (8 ก.ย. 2569) — ป้าย "เส้นที่ 1 / เส้นที่ 2" เป็นเลขตามตำแหน่ง
 *   ในรายการ พอกดคลายเส้นที่ 1 แล้วหน้า re-render ลำดับสลับ เส้นที่เพิ่งคลาย
 *   ไปโผล่เป็นเส้นที่ 2 ส่วนเส้นที่ 1 ยังแดงอยู่ ดูเหมือนกดผิดเส้นทั้งที่ข้อมูลถูก
 *   ในสถานการณ์ที่คนกำลังนับเวลาขาดเลือด ความสับสนแบบนี้อันตรายมาก
 *
 *   id เป็นตัวตัดสินสุดท้ายเพราะไม่ซ้ำแน่นอน ลำดับที่ได้จึงคงที่ทุกครั้ง
 *
 * ★ ไม่มีการเช็คสิทธิ์ในไฟล์นี้เลย
 *   policy treatment_select ใช้ can_see_case() อยู่แล้ว ทุกคนในสายส่งกลับ
 *   จึงเห็นสายรัดของเคสที่ตัวเองเห็น — ซึ่งเป็นเหตุผลทั้งหมดที่ข้อมูลนี้
 *   "ติดไปกับผู้ป่วยทุกกระบวนการ" ได้โดยไม่ต้องเขียนอะไรเพิ่ม
 */

export type TourniquetItem = {
  id: string;
  caseId: string;
  /** ตำแหน่งที่รัด — บังคับมีเสมอจาก zod เพราะคนที่รับต่อต้องรู้ว่าไปคลายตรงไหน */
  site: string | null;
  /** เวลาที่รัดจริง อาจเป็นเวลาก่อนที่ผู้ใช้จะกดบันทึก */
  givenAt: string;
  /** null = ยังรัดอยู่ */
  releasedAt: string | null;
  releasedBy: string | null;
};

const SELECT = "id, case_id, site, given_at, tourniquet_off, released_by";

type Raw = {
  id: string;
  case_id: string;
  site: string | null;
  given_at: string;
  tourniquet_off: string | null;
  released_by: string | null;
};

function toItem(t: Raw): TourniquetItem {
  return {
    id: t.id,
    caseId: t.case_id,
    site: t.site,
    givenAt: t.given_at,
    releasedAt: t.tourniquet_off,
    releasedBy: t.released_by,
  };
}

/** สายรัดของเคสเดียว เรียงตามเวลาที่รัด — เส้นที่ 1 คือเส้นที่รัดก่อน */
export async function getTourniquets(caseId: string): Promise<TourniquetItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("treatment")
    .select(SELECT)
    .eq("case_id", caseId)
    .eq("tx_code", "tourniquet")
    .order("given_at", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  return ((data ?? []) as Raw[]).map(toItem);
}

/**
 * สายรัดของหลายเคสในคำขอเดียว — ใช้กับหน้ารายการที่มีหลายการ์ด
 * คืนเป็น Map เพื่อให้หน้าเรียกหยิบตาม caseId ได้โดยไม่ต้องวนซ้ำ
 */
export async function getTourniquetsByCase(
  caseIds: readonly string[],
): Promise<Map<string, TourniquetItem[]>> {
  const out = new Map<string, TourniquetItem[]>();
  if (caseIds.length === 0) return out;

  const supabase = await createClient();
  const { data } = await supabase
    .from("treatment")
    .select(SELECT)
    .in("case_id", [...new Set(caseIds)])
    .eq("tx_code", "tourniquet")
    .order("given_at", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  for (const row of (data ?? []) as Raw[]) {
    const list = out.get(row.case_id);
    if (list) list.push(toItem(row));
    else out.set(row.case_id, [toItem(row)]);
  }
  return out;
}
