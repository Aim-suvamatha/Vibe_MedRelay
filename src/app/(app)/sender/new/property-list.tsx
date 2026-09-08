"use client";

import { useState } from "react";

import { Field, NumInput, TextInput } from "./fields";

/**
 * บัญชีสิ่งของคนไข้ (ทบ.466-903)
 *
 * ★ ทำไมต้องมี: เมื่อผู้ป่วยถูกส่งกลับ อาวุธประจำกายและของมีค่าต้องเดินทางไปด้วย
 *   และต้องมีผู้ลงนามรับส่งทุกทอด ของหายระหว่างทางเป็นปัญหาทางวินัยและทางคดี
 *
 * ★ รายการมาตรฐาน 18 รายการเก็บเป็นค่าคงที่ใน TypeScript ไม่ใช่ตารางในฐานข้อมูล
 *   มันคือรายการที่พิมพ์ไว้บนกระดาษแล้ว ไม่ได้เปลี่ยนตามหน่วยหรือตามเวลา
 *   การทำเป็นตารางจะเพิ่ม query หนึ่งครั้งทุกครั้งที่เปิดฟอร์ม โดยไม่ได้อะไรกลับมา
 *   ถ้าวันหนึ่งแต่ละหน่วยต้องมีรายการของตัวเอง ค่อยย้ายลงฐานข้อมูลตอนนั้น
 */

/**
 * ชื่อรายการอาวุธถูกอ้างถึงสามที่ (payload · เติมจำนวนอัตโนมัติ · คำเตือน)
 * ต้องเป็นค่าคงที่ตัวเดียว ถ้าแยกพิมพ์แล้วสะกดต่างกันแม้แต่วรรคเดียว
 * เลขทะเบียนจะหายเงียบโดยไม่มี error — ซึ่งเป็นบั๊กที่กำลังแก้อยู่นี่เอง
 */
const WEAPON_ITEM = "อาวุธประจำกาย";

const STANDARD: readonly { name: string; unit: string }[] = [
  { name: WEAPON_ITEM, unit: "กระบอก" },
  { name: "ชุดเครื่องยิงเรเซอร์ไมด์", unit: "ชุด" },
  { name: "ซองกระสุน", unit: "ซอง" },
  { name: "เสื้อชุดบรรจุกระสุน", unit: "ผืน" },
  { name: "ชุดสายโยงบ่า เข็มขัดสนาม", unit: "ชุด" },
  { name: "กระติกน้ำ พร้อมซอง", unit: "ชุด" },
  { name: "กระสุนฝึกหัดบรรจุ", unit: "นัด" },
  { name: "ชุดฝึกพราง", unit: "ชุด" },
  { name: "รองในหมวกเหล็ก หมวกเหล็ก ผ้าพราง ตาข่าย", unit: "ชุด" },
  { name: "ผ้าพันคอสีพราง", unit: "ชุด" },
  { name: "รองเท้าเดินป่า", unit: "คู่" },
  { name: "รองเท้าผ้าใบ", unit: "คู่" },
  { name: "ถุงเท้า", unit: "คู่" },
  { name: "พลั่วสนาม พร้อมซอง", unit: "ชุด" },
  { name: "เป้สนาม", unit: "ใบ" },
  { name: "หม้อข้าวสนาม พร้อมซอง", unit: "ชุด" },
  { name: "เสื้อยืด", unit: "ตัว" },
  { name: "เสื้อเกราะ", unit: "ตัว" },
];

type Extra = { key: string; itemName: string; qty: string; note: string };

export function PropertyList() {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Extra[]>([]);
  const [weaponSerial, setWeaponSerial] = useState("");

  /**
   * เลขทะเบียนเดินทางไปกับรายการ "อาวุธประจำกาย" เท่านั้น และรายการมาตรฐาน
   * จะถูกส่งก็ต่อเมื่อมีจำนวนมากกว่า 0 ผู้ใช้ที่กรอกเลขแต่ลืมใส่จำนวน
   * จึงเคยเสียเลขไปเงียบๆ โดยไม่มีอะไรบอก (เจอตอนทดสอบ 8 ก.ย. 2569)
   *
   * แก้สองชั้น เพราะชั้นเดียวยังหลุดได้
   *   1. พอเริ่มพิมพ์เลข ให้เติมจำนวนอาวุธเป็น 1 ให้เอง — เลขทะเบียนมีได้
   *      ก็ต่อเมื่อมีอาวุธอยู่จริง การเติมให้จึงตรงกับความจริงเสมอ ไม่ใช่การเดา
   *      เติมเฉพาะตอนที่ช่องยังว่าง ถ้าผู้ใช้กรอกจำนวนเองไว้แล้วห้ามไปทับ
   *   2. ถ้าสุดท้ายยังหลุด (เช่นผู้ใช้ลบจำนวนออกทีหลัง) ต้องมีคำเตือนที่เห็นได้
   *      ห้ามปล่อยให้เงียบไม่ว่ากรณีใด
   */
  function changeWeaponSerial(next: string) {
    setWeaponSerial(next);
    if (next.trim() !== "") {
      setQty((p) => (Number(p[WEAPON_ITEM]) > 0 ? p : { ...p, [WEAPON_ITEM]: "1" }));
    }
  }

  const serialWillBeLost =
    weaponSerial.trim() !== "" && !(Number(qty[WEAPON_ITEM]) > 0);
  const [cash, setCash] = useState("");

  const payload = JSON.stringify([
    ...STANDARD.filter((s) => Number(qty[s.name]) > 0).map((s) => ({
      itemName: s.name,
      qty: Number(qty[s.name]),
      unitLabel: s.unit,
      // เลขทะเบียนอาวุธผูกกับรายการอาวุธประจำกายเท่านั้น
      weaponSerial: s.name === WEAPON_ITEM && weaponSerial ? weaponSerial : undefined,
    })),
    ...extras
      .filter((e) => e.itemName.trim() !== "")
      .map((e) => ({
        itemName: e.itemName.trim(),
        qty: Number(e.qty) > 0 ? Number(e.qty) : 1,
        note: e.note || undefined,
      })),
    // เงินสดเป็นรายการหนึ่งของบัญชี ไม่ใช่ช่องแยก เพราะกระดาษก็นับรวมอยู่ในใบเดียวกัน
    ...(Number(cash) > 0
      ? [{ itemName: "เงินสด", qty: 1, unitLabel: "รายการ", cashThb: Number(cash) }]
      : []),
  ]);

  return (
    <div className="space-y-4">
      <input type="hidden" name="propertyItems" value={payload} />

      <Field
        label="รายการมาตรฐาน"
        hint="กรอกจำนวนเฉพาะรายการที่ส่งไปด้วย เว้นว่างคือไม่มี"
      >
        <ul className="space-y-2">
          {STANDARD.map((s) => (
            <li
              key={s.name}
              className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
            >
              <label htmlFor={`qty-${s.name}`} className="min-w-0 flex-1 text-sm">
                {s.name}
                <span className="ml-1 text-xs text-muted-foreground">({s.unit})</span>
              </label>
              <NumInput
                id={`qty-${s.name}`}
                inputMode="numeric"
                min={0}
                max={9999}
                placeholder="0"
                value={qty[s.name] ?? ""}
                onChange={(e) => setQty((p) => ({ ...p, [s.name]: e.target.value }))}
                className="h-10 w-20 shrink-0 text-center"
              />
            </li>
          ))}
        </ul>
      </Field>

      <Field
        label="เลขทะเบียนอาวุธ"
        htmlFor="weapon-serial"
        hint="เฟส prototype ต้องเป็นเลขสมมติเท่านั้น — ระบุตัวบุคคลได้ทางอ้อม"
        error={
          serialWillBeLost
            ? `ใส่จำนวน "${WEAPON_ITEM}" ในรายการมาตรฐานด้วย ไม่งั้นเลขทะเบียนจะไม่ถูกบันทึก`
            : undefined
        }
      >
        <TextInput
          id="weapon-serial"
          maxLength={60}
          value={weaponSerial}
          onChange={(e) => changeWeaponSerial(e.target.value)}
        />
      </Field>

      <Field label="เงินสด (บาท)" htmlFor="cash">
        <NumInput
          id="cash"
          inputMode="decimal"
          min={0}
          value={cash}
          onChange={(e) => setCash(e.target.value)}
        />
      </Field>

      <Field label="ของใช้ส่วนตัวอื่นๆ">
        <ul className="space-y-2">
          {extras.map((e) => (
            <li key={e.key} className="flex gap-2">
              <TextInput
                aria-label="ชื่อรายการ"
                placeholder="ชื่อรายการ"
                maxLength={120}
                value={e.itemName}
                onChange={(ev) =>
                  setExtras((p) =>
                    p.map((x) =>
                      x.key === e.key ? { ...x, itemName: ev.target.value } : x,
                    ),
                  )
                }
              />
              <NumInput
                aria-label="จำนวน"
                inputMode="numeric"
                min={1}
                value={e.qty}
                onChange={(ev) =>
                  setExtras((p) =>
                    p.map((x) => (x.key === e.key ? { ...x, qty: ev.target.value } : x)),
                  )
                }
                className="w-20 shrink-0 text-center"
              />
              <button
                type="button"
                onClick={() => setExtras((p) => p.filter((x) => x.key !== e.key))}
                aria-label="เอารายการนี้ออก"
                className="size-12 shrink-0 rounded-lg border border-input text-muted-foreground"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            setExtras((p) => [
              ...p,
              { key: crypto.randomUUID(), itemName: "", qty: "1", note: "" },
            ])
          }
          className="h-12 w-full rounded-lg border border-dashed border-primary bg-accent text-base font-semibold text-primary"
        >
          + เพิ่มของใช้ส่วนตัว
        </button>
      </Field>
    </div>
  );
}
