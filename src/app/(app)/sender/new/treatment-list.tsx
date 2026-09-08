"use client";

import { useState } from "react";

import { TourniquetClock } from "@/components/medrelay/tourniquet-clock";
import { TX_LABEL, TX_ORDER } from "../schema";
import { Field, NativeSelect, TextInput } from "./fields";

/**
 * การรักษาที่ให้ไปแล้วก่อนส่ง (ทบ.466-901 ด้านหลัง)
 *
 * ★ สายรัดห้ามเลือดมีช่องกรอกเวลา ตัวอื่นไม่มี
 *   นี่คือข้อยกเว้นเดียวของกฎ "ไม่มีช่องกรอกเวลา" ทั้งโครงการ
 *   เหตุผลเต็มอยู่ในหัวข้อท้าย migration 0020 สรุปสั้นๆ คือ
 *   สายรัดถูกรัดก่อนที่เสนารักษ์จะได้หยิบเครื่องขึ้นมากรอก
 *   ถ้าบันทึกเวลาที่กดปุ่มแทนเวลาที่รัดจริง นาฬิกาขาดเลือดจะสั้นกว่าความจริง
 *   ซึ่งเป็นทิศทางที่อันตรายเพราะรัดเกิน 2 ชั่วโมงเสี่ยงต่อการสูญเสียอวัยวะ
 *
 * ★ ค่าเริ่มต้นของช่องเวลาคือ "ตอนนี้" ผู้ใช้เลื่อนย้อนหลังได้อย่างเดียว
 *   ปกติของการใช้งานคือรัดแล้วกรอกทันที ค่าเริ่มต้นจึงถูกอยู่แล้วเกือบทุกครั้ง
 *
 * ★ แก้ทีหลังไม่ได้ — column grant ของ treatment ไม่ให้ update given_at
 *   ต้องบอกผู้ใช้ตรงนั้น ไม่ใช่ให้ไปค้นพบเองตอนที่แก้ไม่ได้แล้ว
 */

type Row = {
  key: string;
  txCode: string;
  detail: string;
  dose: string;
  route: string;
  site: string;
  /** ค่าของ input datetime-local — เวลาท้องถิ่นของเครื่อง ไม่มี timezone ติดมา */
  givenLocal: string;
};

/** "ตอนนี้" ในรูปแบบที่ datetime-local รับได้ (เวลาท้องถิ่น ไม่ใช่ UTC) */
function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function blank(txCode: string): Row {
  return {
    key: crypto.randomUUID(),
    txCode,
    detail: "",
    dose: "",
    route: "",
    site: "",
    givenLocal: nowLocal(),
  };
}

export function TreatmentList({ error }: { error?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [picking, setPicking] = useState("");
  /**
   * เพดาน "ห้ามเลือกเวลาอนาคต" ต้องเดินตามเวลาจริง ไม่ใช่ค้างอยู่ที่ตอนเปิดขั้นนี้
   * เพราะแถวใหม่ตั้งค่าเริ่มต้นเป็น nowLocal() ของ *ตอนกดเพิ่ม* ซึ่งช้ากว่าตอนเปิดขั้นเสมอ
   * ถ้าเพดานค้าง ค่าเริ่มต้นของแถวจะเกินเพดานทันทีที่ข้ามนาที
   * ช่องนั้นจะไม่ผ่าน constraint ทั้งที่ผู้ใช้ไม่ได้แตะอะไรเลย
   * และเพราะขั้นที่ 6 ถูกซ่อนตอนอยู่ขั้นที่ 7 browser จะบล็อกการส่งแบบเงียบสนิท
   */
  const [max, setMax] = useState(nowLocal);

  const tqCount = rows.filter((r) => r.txCode === "tourniquet").length;

  function add() {
    if (!picking) return;
    setMax(nowLocal());
    setRows((prev) => [...prev, blank(picking)]);
    setPicking("");
  }

  function patch(key: string, next: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...next } : r)));
  }

  /**
   * แปลงเป็น ISO ที่ browser ไม่ใช่ที่ server
   * datetime-local ไม่มี timezone ติดมาด้วย ถ้าปล่อยให้ server แปลง
   * มันจะตีความด้วย timezone ของ server (UTC บน Vercel) แล้วเวลาเพี้ยนไป 7 ชั่วโมง
   */
  const payload = JSON.stringify(
    rows.map((r) => {
      const d = new Date(r.givenLocal);
      /**
       * ★ ส่งเวลาไปเฉพาะสายรัดห้ามเลือดเท่านั้น
       *   ข้อยกเว้นของกฎ "ไม่มีช่องกรอกเวลา" (HANDOFF §"migration 0018-0021" ข้อ 4)
       *   สงวนไว้ให้สายรัดอย่างเดียว รายการอื่นต้องได้เวลาจาก now() ของฐานข้อมูล
       *   ผ่าน coalesce(t.given_at, now()) ใน RPC 0021 ตามที่ hint ของช่องนี้บอกผู้ใช้ไว้
       *
       *   เดิมส่งเวลาไปทุกแถว ทำให้ยาได้เวลา "ตอนที่กดเพิ่มแถว" ไม่ใช่ "ตอนกดส่ง"
       *   เจอตอนตรวจฐานข้อมูลของเคส MR-2569-0020 (8 ก.ย. 2569)
       *   ยา Cef-3 ถูกบันทึกเป็น 08:00 ทั้งที่คำขอเปิดจริง 08:07:47 — ห่างกัน 7 นาที
       */
      const givenAt =
        r.txCode === "tourniquet" && !Number.isNaN(d.getTime())
          ? d.toISOString()
          : undefined;
      return {
        txCode: r.txCode,
        detail: r.detail || undefined,
        dose: r.dose || undefined,
        route: r.route || undefined,
        site: r.site || undefined,
        givenAt,
      };
    }),
  );

  return (
    <Field
      label="การรักษาที่ให้แล้ว"
      error={error}
      hint="เวลาของรายการอื่นระบบจับเองตอนกดส่ง มีเฉพาะสายรัดห้ามเลือดที่กรอกเวลาที่รัดจริงได้"
    >
      <input type="hidden" name="treatments" value={payload} />

      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-input px-3 py-4 text-center text-sm text-muted-foreground">
          ยังไม่ได้บันทึกการรักษา
        </p>
      )}

      <ul className="space-y-3">
        {rows.map((r, i) => {
          const isTq = r.txCode === "tourniquet";
          const tqNo = isTq
            ? rows.filter((x, j) => x.txCode === "tourniquet" && j <= i).length
            : 0;
          return (
            <li
              key={r.key}
              className={
                isTq
                  ? "space-y-2 rounded-r-lg border border-l-4 border-border border-l-triage-red bg-card p-3"
                  : "space-y-2 rounded-lg border border-border bg-card p-3"
              }
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {TX_LABEL[r.txCode as keyof typeof TX_LABEL] ?? r.txCode}
                  {isTq && ` · เส้นที่ ${tqNo}`}
                </span>
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                  aria-label="เอารายการนี้ออก"
                  className="ml-auto size-9 rounded-lg border border-input text-muted-foreground"
                >
                  ×
                </button>
              </div>

              {isTq ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <TextInput
                      aria-label={`ตำแหน่งที่รัด เส้นที่ ${tqNo}`}
                      placeholder="ตำแหน่งที่รัด เช่น ต้นขาขวา"
                      maxLength={60}
                      value={r.site}
                      onChange={(e) => patch(r.key, { site: e.target.value })}
                    />
                    <TextInput
                      type="datetime-local"
                      aria-label={`เวลาที่รัด เส้นที่ ${tqNo}`}
                      max={max}
                      value={r.givenLocal}
                      onFocus={() => setMax(nowLocal())}
                      onChange={(e) => patch(r.key, { givenLocal: e.target.value })}
                      className="tabular font-mono"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    รัดมาแล้ว <TourniquetClock givenAt={r.givenLocal} /> ·
                    เตือนเมื่อครบ 2 ชั่วโมง
                  </p>
                </>
              ) : (
                <div className="grid gap-2 sm:grid-cols-3">
                  <TextInput
                    aria-label="ชื่อยาหรือรายละเอียด"
                    placeholder="ชื่อยา / รายละเอียด"
                    maxLength={200}
                    value={r.detail}
                    onChange={(e) => patch(r.key, { detail: e.target.value })}
                  />
                  <TextInput
                    aria-label="ขนาด"
                    placeholder="ขนาด เช่น 500 ml"
                    maxLength={60}
                    value={r.dose}
                    onChange={(e) => patch(r.key, { dose: e.target.value })}
                  />
                  <TextInput
                    aria-label="ช่องทาง"
                    placeholder="ช่องทาง เช่น IV"
                    maxLength={30}
                    value={r.route}
                    onChange={(e) => patch(r.key, { route: e.target.value })}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <NativeSelect
          aria-label="เลือกหัตถการหรือยาที่จะเพิ่ม"
          value={picking}
          onChange={(e) => setPicking(e.target.value)}
        >
          <option value="">เลือกหัตถการหรือยา</option>
          {TX_ORDER.map((t) => (
            <option key={t} value={t}>
              {TX_LABEL[t]}
              {t === "tourniquet" && tqCount > 0 ? ` (เส้นที่ ${tqCount + 1})` : ""}
            </option>
          ))}
        </NativeSelect>
        <button
          type="button"
          onClick={add}
          disabled={!picking}
          className="h-12 rounded-lg border border-dashed border-primary bg-accent px-4 text-base font-semibold text-primary disabled:opacity-50"
        >
          + เพิ่มรายการ
        </button>
      </div>

      <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        บันทึกแล้วแก้เวลาไม่ได้ — ถ้ากรอกผิดให้บันทึกรายการใหม่แทน
        เวชระเบียนแก้ทับของเดิมไม่ได้ตามหลักการเดียวกับผลประเมิน
      </p>
    </Field>
  );
}
