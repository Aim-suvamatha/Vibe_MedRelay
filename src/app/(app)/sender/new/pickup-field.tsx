"use client";

import { useState } from "react";

import { Field, NativeSelect, RadioRow, TextInput } from "./fields";

/**
 * จุดรับผู้ป่วย — เลือกจากรายการ หรืออ่านพิกัดจากเครื่อง
 *
 * ★ การอ่านพิกัดจากเครื่องเป็นการตัดสินใจของเจ้าของโครงการ (8 ก.ย. 2569)
 *   ซึ่งกลับด้าน AI_RULES §3.1 แถว "พิกัด GPS เรียลไทม์ ไม่เก็บ"
 *   เหตุผลคือเมื่อฐานที่นัดไว้เสียหาย การพิมพ์พิกัดกลางสนามทำได้ยากจริง
 *   AI_RULES ถูกแก้ให้ตรงกับความจริงข้อนี้แล้วในงวดเดียวกัน
 *
 * ★ ขอบเขตที่แคบที่สุดเท่าที่ยังใช้งานได้ — สี่ข้อนี้ห้ามผ่อน
 *   1. getCurrentPosition เท่านั้น **ห้าม watchPosition** ไม่มีการติดตามต่อเนื่อง
 *   2. ปัดเป็นพิกัดกริดก่อนเก็บ ไม่เก็บ lat/long ดิบลงฐานข้อมูล
 *   3. ผู้ใช้ต้องกด "ใช้พิกัดนี้" ก่อน ระบบถึงเขียนลงช่อง ไม่ใช่อ่านแล้วใส่ให้เลย
 *   4. ช่องพิมพ์เองต้องอยู่ต่อเสมอ — ในสนามสัญญาณดาวเทียมล้มบ่อย
 *      และ browser ต้องเป็น HTTPS พร้อมได้รับอนุญาตจากผู้ใช้ก่อนถึงจะเรียกได้
 */

export type PickupPointOption = {
  id: string;
  name: string;
  gridRef: string | null;
  note: string | null;
};

type Phase =
  | { k: "idle" }
  | { k: "locating" }
  | { k: "found"; grid: string; accuracy: number; at: Date }
  | { k: "failed"; message: string };

/**
 * แปลง lat/long เป็นสตริงพิกัดที่อ่านได้ในหน่วย
 *
 * ใช้รูปแบบองศาทศนิยม 5 ตำแหน่ง (~1 เมตร) ไม่ได้แปลงเป็น MGRS จริง
 * เพราะการแปลง MGRS ต้องใช้ไลบรารีวัดพิกัดที่ถูกต้องตามหลักภูมิสารสนเทศ
 * การเขียนสูตรเองแล้วผิดไปหนึ่งโซนคือการส่งชุดลำเลียงไปผิดที่
 * — อันตรายกว่าการให้พิกัดที่อ่านยากแต่ถูกต้อง
 * ถ้าหน่วยต้องการ MGRS ให้เพิ่มไลบรารีที่ผ่านการตรวจแล้วในรอบถัดไป
 */
function toGrid(lat: number, lon: number): string {
  const f = (n: number) => n.toFixed(5);
  return `${f(lat)}, ${f(lon)}`;
}

export function PickupField({
  points,
  error,
}: {
  points: readonly PickupPointOption[];
  error?: string;
}) {
  // ไม่มีจุดที่กำหนดไว้เลย ก็ไม่มีอะไรให้เลือก เริ่มที่โหมดพิกัดไปเลย
  const [mode, setMode] = useState<"point" | "grid">(
    points.length > 0 ? "point" : "grid",
  );
  const [grid, setGrid] = useState("");
  const [phase, setPhase] = useState<Phase>({ k: "idle" });

  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPhase({
        k: "failed",
        message: "เครื่องนี้ไม่รองรับการอ่านพิกัด กรุณาพิมพ์พิกัดเอง",
      });
      return;
    }

    setPhase({ k: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setPhase({
          k: "found",
          grid: toGrid(pos.coords.latitude, pos.coords.longitude),
          accuracy: Math.round(pos.coords.accuracy),
          at: new Date(),
        }),
      (err) => {
        // ข้อความต้องบอกว่าทำอะไรต่อได้ ไม่ใช่แค่บอกว่าพัง
        const message =
          err.code === err.PERMISSION_DENIED
            ? "ยังไม่ได้อนุญาตให้อ่านตำแหน่ง เปิดสิทธิ์ในเบราว์เซอร์ หรือพิมพ์พิกัดเอง"
            : err.code === err.TIMEOUT
              ? "หาสัญญาณดาวเทียมไม่ทัน ลองอีกครั้งกลางแจ้ง หรือพิมพ์พิกัดเอง"
              : "หาตำแหน่งไม่ได้ในตอนนี้ กรุณาพิมพ์พิกัดเอง";
        setPhase({ k: "failed", message });
      },
      // ห้ามใช้ watchPosition · maximumAge 0 เพื่อไม่ให้ได้ตำแหน่งเก่าที่ค้างอยู่
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <Field
      label="จุดรับผู้ป่วย"
      error={error}
      hint="เลือกจากจุดที่กำหนดไว้ล่วงหน้า หรือถ้าจุดนั้นใช้ไม่ได้แล้วให้ระบุพิกัดเอง"
    >
      {/* ค่าที่ส่งจริงมีสองช่อง — ส่งเฉพาะช่องของโหมดที่เลือกอยู่ */}
      {points.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          <RadioRow
            name="pickupMode"
            value="point"
            label="เลือกจากรายการ"
            checked={mode === "point"}
            onChange={() => setMode("point")}
          />
          <RadioRow
            name="pickupMode"
            value="grid"
            label="ระบุพิกัดเอง"
            checked={mode === "grid"}
            onChange={() => setMode("grid")}
          />
        </div>
      )}

      {mode === "point" ? (
        <NativeSelect name="pickupPointId" defaultValue="" aria-label="จุดรับที่กำหนดไว้">
          <option value="">เลือกจุดรับ</option>
          {points.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.gridRef ? ` · ${p.gridRef}` : ""}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
          <button
            type="button"
            onClick={locate}
            disabled={phase.k === "locating"}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-background text-base font-semibold text-primary disabled:opacity-60"
          >
            {phase.k === "locating" ? "กำลังหาตำแหน่ง…" : "ดึงพิกัดจากเครื่อง"}
          </button>

          {phase.k === "found" && (
            <div className="rounded-lg border border-primary bg-accent p-3">
              <p className="tabular font-mono text-lg font-semibold">{phase.grid}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                ความแม่นยำ ±{phase.accuracy} เมตร · อ่านเมื่อ{" "}
                {phase.at.toLocaleTimeString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Bangkok",
                })}{" "}
                น.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={locate}
                  className="h-11 rounded-lg border border-input bg-background text-sm font-semibold"
                >
                  อ่านใหม่
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGrid(phase.grid);
                    setPhase({ k: "idle" });
                  }}
                  className="h-11 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
                >
                  ใช้พิกัดนี้
                </button>
              </div>
            </div>
          )}

          {phase.k === "failed" && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {phase.message}
            </p>
          )}

          <TextInput
            name="pickupGrid"
            aria-label="พิกัดจุดรับ"
            placeholder="หรือพิมพ์พิกัดเอง เช่น QA 114 882"
            maxLength={120}
            value={grid}
            onChange={(e) => setGrid(e.target.value)}
            className="tabular font-mono"
          />

          <p className="text-xs text-muted-foreground">
            อ่านครั้งเดียวตอนกดปุ่ม ไม่ใช่การติดตามตำแหน่งต่อเนื่อง
            และระบบบันทึกเฉพาะค่าที่คุณกดยืนยันแล้วเท่านั้น
          </p>
        </div>
      )}
    </Field>
  );
}
