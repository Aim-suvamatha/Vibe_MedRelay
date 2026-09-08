"use client";

import { useId, useState } from "react";

import {
  BODY_REGION_LABEL,
  INJURY_TYPE_LABEL,
  INJURY_TYPE_VALUES,
} from "../schema";
import { Field, NativeSelect, TextInput } from "./fields";

/**
 * แผนภาพร่างกายสำหรับทำเครื่องหมายตำแหน่งบาดเจ็บ (ทบ.466-901 ด้านหลัง)
 *
 * ★ กดที่ตัวคนแล้วเปลี่ยนจากขาวเป็นแดง ตามที่เจ้าของโครงการกำหนด (8 ก.ย. 2569)
 *   รูปทรงจงใจให้เรียบง่ายกว่ารูปในกระดาษ เพราะบนจอมือถือกว้าง ~130px
 *   ส่วนที่เล็กกว่านิ้วโป้งจะกดพลาด การแบ่งเป็นบริเวณใหญ่ 17 ส่วนต่อด้าน
 *   ให้ความละเอียดพอสำหรับการส่งกลับ และช่องรายละเอียดรับส่วนที่ละเอียดกว่านั้น
 *
 * ★ ทุกส่วนต้องกดด้วยคีย์บอร์ดได้
 *   เป็น touch device ก็จริง แต่หน้าศูนย์สั่งการเปิดบนเครื่องตั้งโต๊ะด้วย
 *   และเกณฑ์ accessibility ของโครงการไม่ได้ยกเว้นหน้าไหน
 *
 * ★ ค่าเก็บเป็น jsonb [{"site":"thigh_r","type":"laceration","detail":"..."}]
 *   ตรงตามรูปแบบที่ comment ใน migration 0013 ระบุไว้
 *   คีย์เป็นอังกฤษเพราะต้อง query ได้ ป้ายไทยอยู่ใน BODY_REGION_LABEL
 */

type Site = { site: string; type?: string; detail?: string };

/** ด้านหน้า — ชื่อ region ต้องตรงกับคีย์ใน BODY_REGION_LABEL */
const FRONT: readonly { id: string; el: React.ReactNode }[] = [
  { id: "head", el: <ellipse cx="60" cy="20" rx="14" ry="17" /> },
  { id: "neck", el: <rect x="52" y="35" width="16" height="10" rx="3" /> },
  { id: "chest", el: <path d="M38 46 Q60 41 82 46 L82 78 L38 78 Z" /> },
  { id: "abdomen", el: <rect x="41" y="79" width="38" height="26" rx="3" /> },
  { id: "pelvis", el: <path d="M41 106 L79 106 L74 126 L46 126 Z" /> },
  { id: "upper_arm_r", el: <rect x="23" y="48" width="13" height="36" rx="6" /> },
  { id: "upper_arm_l", el: <rect x="84" y="48" width="13" height="36" rx="6" /> },
  { id: "forearm_r", el: <rect x="21" y="85" width="12" height="32" rx="6" /> },
  { id: "forearm_l", el: <rect x="87" y="85" width="12" height="32" rx="6" /> },
  { id: "hand_r", el: <ellipse cx="27" cy="126" rx="7" ry="9" /> },
  { id: "hand_l", el: <ellipse cx="93" cy="126" rx="7" ry="9" /> },
  { id: "thigh_r", el: <rect x="43" y="127" width="16" height="48" rx="7" /> },
  { id: "thigh_l", el: <rect x="61" y="127" width="16" height="48" rx="7" /> },
  { id: "shin_r", el: <rect x="45" y="176" width="13" height="44" rx="6" /> },
  { id: "shin_l", el: <rect x="62" y="176" width="13" height="44" rx="6" /> },
  { id: "foot_r", el: <rect x="42" y="221" width="17" height="12" rx="5" /> },
  { id: "foot_l", el: <rect x="61" y="221" width="17" height="12" rx="5" /> },
];

/** ด้านหลัง — รูปทรงเดียวกัน แต่ชื่อบริเวณต่างกัน */
const BACK: readonly { id: string; el: React.ReactNode }[] = [
  { id: "occiput", el: <ellipse cx="60" cy="20" rx="14" ry="17" /> },
  { id: "nape", el: <rect x="52" y="35" width="16" height="10" rx="3" /> },
  { id: "upper_back", el: <path d="M38 46 Q60 41 82 46 L82 78 L38 78 Z" /> },
  { id: "lower_back", el: <rect x="41" y="79" width="38" height="26" rx="3" /> },
  { id: "buttock", el: <path d="M41 106 L79 106 L74 126 L46 126 Z" /> },
  { id: "upper_arm_rb", el: <rect x="23" y="48" width="13" height="36" rx="6" /> },
  { id: "upper_arm_lb", el: <rect x="84" y="48" width="13" height="36" rx="6" /> },
  { id: "forearm_rb", el: <rect x="21" y="85" width="12" height="32" rx="6" /> },
  { id: "forearm_lb", el: <rect x="87" y="85" width="12" height="32" rx="6" /> },
  { id: "hand_rb", el: <ellipse cx="27" cy="126" rx="7" ry="9" /> },
  { id: "hand_lb", el: <ellipse cx="93" cy="126" rx="7" ry="9" /> },
  { id: "thigh_rb", el: <rect x="43" y="127" width="16" height="48" rx="7" /> },
  { id: "thigh_lb", el: <rect x="61" y="127" width="16" height="48" rx="7" /> },
  { id: "calf_r", el: <rect x="45" y="176" width="13" height="44" rx="6" /> },
  { id: "calf_l", el: <rect x="62" y="176" width="13" height="44" rx="6" /> },
  { id: "heel_r", el: <rect x="42" y="221" width="17" height="12" rx="5" /> },
  { id: "heel_l", el: <rect x="61" y="221" width="17" height="12" rx="5" /> },
];

function Figure({
  side,
  regions,
  picked,
  onToggle,
}: {
  side: string;
  regions: readonly { id: string; el: React.ReactNode }[];
  picked: readonly string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="text-center">
      <p className="mb-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {side}
      </p>
      <svg
        viewBox="0 0 120 250"
        role="group"
        aria-label={`แผนภาพร่างกาย${side}`}
        className="mx-auto h-auto w-full max-w-[140px]"
      >
        {regions.map((r) => {
          const on = picked.includes(r.id);
          const label = BODY_REGION_LABEL[r.id] ?? r.id;
          return (
            <g
              key={r.id}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={label}
              onClick={() => onToggle(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(r.id);
                }
              }}
              className="cursor-pointer outline-none focus-visible:[&>*]:stroke-primary focus-visible:[&>*]:stroke-[3]"
              // สีเติมต้องเป็น inline ไม่ใช่คลาส เพราะ Tailwind ไม่ได้ scan ค่า fill ของ SVG
              fill={on ? "var(--triage-red)" : "#ffffff"}
              stroke={on ? "#6d120f" : "var(--muted-foreground)"}
              strokeWidth={1.1}
            >
              {r.el}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function InjuryMap({ error }: { error?: string }) {
  const id = useId();
  const [sites, setSites] = useState<Site[]>([]);

  const picked = sites.map((s) => s.site);

  function toggle(region: string) {
    setSites((prev) =>
      prev.some((s) => s.site === region)
        ? prev.filter((s) => s.site !== region)
        : [...prev, { site: region }],
    );
  }

  function patch(region: string, next: Partial<Site>) {
    setSites((prev) =>
      prev.map((s) => (s.site === region ? { ...s, ...next } : s)),
    );
  }

  /** ส่งไปกับ FormData เป็น JSON ก้อนเดียว — เหตุผลอยู่ใน schema.ts (jsonArray) */
  const payload = JSON.stringify(
    sites.map((s) => ({
      site: BODY_REGION_LABEL[s.site] ?? s.site,
      type: s.type || undefined,
      detail: s.detail || undefined,
    })),
  );

  return (
    <Field
      label="ตำแหน่งบาดเจ็บ"
      error={error}
      hint="กดที่ตัวคนเพื่อทำเครื่องหมาย กดซ้ำเพื่อเอาออก · รหัสชนิดตามท้ายแบบฟอร์ม"
    >
      <input type="hidden" name="injurySites" value={payload} />

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/40 p-3">
        <Figure side="ด้านหน้า" regions={FRONT} picked={picked} onToggle={toggle} />
        <Figure side="ด้านหลัง" regions={BACK} picked={picked} onToggle={toggle} />
      </div>

      {sites.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input px-3 py-4 text-center text-sm text-muted-foreground">
          ยังไม่ได้ทำเครื่องหมายตำแหน่งใด
        </p>
      ) : (
        <ul className="space-y-2">
          {sites.map((s) => (
            <li
              key={s.site}
              className="space-y-2 rounded-r-lg border border-l-4 border-border border-l-triage-red bg-card p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {BODY_REGION_LABEL[s.site] ?? s.site}
                </span>
                <button
                  type="button"
                  onClick={() => toggle(s.site)}
                  aria-label={`เอาตำแหน่ง ${BODY_REGION_LABEL[s.site]} ออก`}
                  className="ml-auto size-9 rounded-lg border border-input text-muted-foreground"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NativeSelect
                  aria-label={`ชนิดการบาดเจ็บที่ ${BODY_REGION_LABEL[s.site]}`}
                  value={s.type ?? ""}
                  onChange={(e) => patch(s.site, { type: e.target.value })}
                >
                  <option value="">เลือกชนิด</option>
                  {INJURY_TYPE_VALUES.map((t) => (
                    <option key={t} value={t}>
                      {INJURY_TYPE_LABEL[t]}
                    </option>
                  ))}
                </NativeSelect>
                <TextInput
                  id={`${id}-${s.site}`}
                  aria-label={`รายละเอียดที่ ${BODY_REGION_LABEL[s.site]}`}
                  placeholder="รายละเอียด"
                  maxLength={200}
                  value={s.detail ?? ""}
                  onChange={(e) => patch(s.site, { detail: e.target.value })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}
