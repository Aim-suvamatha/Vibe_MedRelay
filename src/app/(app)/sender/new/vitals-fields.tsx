"use client";

import { AVPU_LABEL } from "../schema";
import { Field, NativeSelect, NumInput, SubHead, TextArea } from "./fields";

/**
 * ช่องสัญญาณชีพ · ระดับการรู้ตัว · สิ่งที่ตรวจพบ
 *
 * ★ ทำไมต้องแยกออกมาเป็นไฟล์ของตัวเอง
 *   ชุดช่องนี้ถูกใช้สองที่ที่ห่างกันคนละหน้า
 *     1. ขั้นที่ 4 ของฟอร์มผู้ส่ง — ประเมินแรกรับที่เขตหน้า
 *     2. ฟอร์มประเมินซ้ำใน /track — ชุดลำเลียงและปลายทางประเมินระหว่างทาง
 *   ทั้งสองที่เขียนลงตาราง assessment ตารางเดียวกันด้วยชื่อช่องเดียวกัน
 *   ถ้าคัดลอกไปวางแล้ววันหนึ่งมีคนเพิ่มช่องที่หนึ่งแต่ลืมอีกที่
 *   ข้อมูลของสองการประเมินในเคสเดียวกันจะเทียบกันไม่ได้ ซึ่งเป็นสิ่งที่
 *   ทั้งโครงการนี้ตั้งใจจะแก้ตั้งแต่แรก
 *
 * ★ ชื่อ name= ต้องตรงกับ zod ใน sender/schema.ts เป๊ะ
 *   ทั้งสองฝั่งใช้ตัวตรวจชุดเดียวกัน (sbp · dbp · pulse · respRate · spo2 ·
 *   temperature · avpu · gcs · findings)
 *
 * ★ ไม่มีช่องกรอกเวลาที่นี่โดยเจตนา
 *   เวลาที่วัดคือเวลาที่กดบันทึก มาจาก now() ของฐานข้อมูล (Prompt 04)
 *   ข้อยกเว้นเรื่องเวลาย้อนหลังมีที่เดียวคือสายรัดห้ามเลือดใน treatment-list.tsx
 */
export function VitalsFields({
  id,
  err = {},
}: {
  /** prefix ของ id ทุกช่อง — ผู้เรียกส่ง useId() ของตัวเองมา */
  id: string;
  /** ข้อความ error รายช่องจาก zod ฝั่ง server */
  err?: Partial<Record<string, string>>;
}) {
  return (
    <>
      <SubHead>สัญญาณชีพ · V/S</SubHead>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ความดันตัวบน" htmlFor={`${id}-sbp`} error={err.sbp}>
          <NumInput id={`${id}-sbp`} name="sbp" inputMode="numeric" min={0} max={300} />
        </Field>
        <Field label="ความดันตัวล่าง" htmlFor={`${id}-dbp`} error={err.dbp}>
          <NumInput id={`${id}-dbp`} name="dbp" inputMode="numeric" min={0} max={200} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="ชีพจร" htmlFor={`${id}-p`} error={err.pulse}>
          <NumInput id={`${id}-p`} name="pulse" inputMode="numeric" min={0} max={300} />
        </Field>
        <Field label="หายใจ" htmlFor={`${id}-rr`} error={err.respRate}>
          <NumInput id={`${id}-rr`} name="respRate" inputMode="numeric" min={0} max={80} />
        </Field>
        <Field label="SpO₂ (%)" htmlFor={`${id}-spo2`} error={err.spo2}>
          <NumInput id={`${id}-spo2`} name="spo2" inputMode="numeric" min={0} max={100} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="อุณหภูมิ (°C)" htmlFor={`${id}-t`} error={err.temperature}>
          <NumInput id={`${id}-t`} name="temperature" step="0.1" min={20} max={45} />
        </Field>
      </div>

      <SubHead>ระดับการรู้ตัว</SubHead>
      <Field
        label="ระดับความรู้สึกตัว"
        htmlFor={`${id}-avpu`}
        error={err.avpu}
        hint="ตามหมายเหตุท้าย ทบ.466-901 ด้านหลัง"
      >
        <NativeSelect id={`${id}-avpu`} name="avpu" defaultValue="">
          <option value="">ยังไม่ประเมิน</option>
          {Object.entries(AVPU_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="GCS" htmlFor={`${id}-gcs`} error={err.gcs}>
          <NumInput
            id={`${id}-gcs`}
            name="gcs"
            inputMode="numeric"
            min={3}
            max={15}
            placeholder="3–15"
          />
        </Field>
      </div>

      <Field label="สิ่งที่ตรวจพบเพิ่มเติม" htmlFor={`${id}-f`} error={err.findings}>
        <TextArea id={`${id}-f`} name="findings" rows={3} maxLength={1000} />
      </Field>
    </>
  );
}
