"use client";

import { cn } from "@/lib/utils";

/**
 * ชิ้นส่วนหน้าตาที่ทุกขั้นใช้ร่วมกัน
 *
 * ⚠ ขนาดปุ่มและช่องกรอกใช้ h-14 (56px) กับ h-12 (48px) เท่านั้น
 *   ห้ามสร้าง token ชื่อ h-touch ใหม่ — src/lib/utils.ts re-export cn จากแพ็กเกจ "cn"
 *   ซึ่งไม่รู้จักคลาสที่เราตั้งเอง มันจึงไม่ตัด h-8 ที่ติดมากับปุ่มของ shadcn ทิ้ง
 *   แล้วปุ่มจะหดจาก 56px เหลือ 32px เงียบๆ โดยไม่มี error (HANDOFF §5 ข้อ 8)
 */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  badge,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  /** ป้ายเล็กท้ายชื่อช่อง เช่น "ไม่บังคับ" */
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {label}
        {badge}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * select ของ shadcn เป็น Radix ซึ่งไม่ส่งค่าเข้า FormData เอง
 * ในฟอร์มที่ใช้ Server Action ล้วนๆ การใช้ <select> จริงสั้นกว่าและพังยากกว่า
 */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-12 w-full rounded-lg border border-border bg-background px-3 text-base",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function TextInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-lg border border-border bg-background px-3 text-base",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function NumInput(props: React.ComponentProps<"input">) {
  return (
    <TextInput
      type="number"
      inputMode="decimal"
      {...props}
      className={cn("tabular font-mono", props.className)}
    />
  );
}

export function TextArea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base leading-relaxed",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

/**
 * ช่องติ๊กที่กดได้ทั้งแถว — ลอกรูปแบบจาก HandoverForm ใน track/[caseId]/leg-card.tsx
 * พื้นที่กดต้องเป็นทั้งแถบ ไม่ใช่แค่กล่องสี่เหลี่ยม 20px เพราะผู้ใช้สวมถุงมือ
 */
export function CheckRow({
  name,
  value,
  label,
  defaultChecked,
  onChange,
  checked,
  className,
}: {
  name: string;
  value?: string;
  label: React.ReactNode;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (next: boolean) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border bg-background px-3 py-2",
        "focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted",
        checked && "border-primary bg-accent",
        className,
      )}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
        className="size-5 accent-primary"
      />
      <span className="text-base">{label}</span>
    </label>
  );
}

/** กลุ่มปุ่มเลือกหนึ่งค่า สูง 48px ทั้งแถว */
export function RadioRow({
  name,
  value,
  label,
  checked,
  onChange,
}: {
  name: string;
  value: string;
  label: React.ReactNode;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2",
        "focus-within:ring-3 focus-within:ring-ring/50",
        checked ? "border-primary bg-accent font-semibold" : "border-border bg-background hover:bg-muted",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="size-5 accent-primary"
      />
      <span className="text-base">{label}</span>
    </label>
  );
}

/** หัวข้อย่อยคั่นภายในขั้นเดียวกัน เช่น "สัญญาณชีพ" กับ "ระดับการรู้ตัว" */
export function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t border-border pt-3 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

/** ก้อนที่พับเก็บได้ภายในขั้น — ใช้กับ "ข้อมูลผู้ป่วย" ที่มี 16 ช่อง */
export function Fold({
  title,
  count,
  open,
  children,
}: {
  title: string;
  count: string;
  /** เปิดค้างไว้เมื่อข้างในมีช่องที่กรอกผิด ไม่งั้นผู้ใช้หาไม่เจอ */
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={open}
      className="rounded-xl border border-dashed border-input bg-muted/40 open:border-solid open:border-border open:bg-card"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-primary">
          ▸
        </span>
        {title}
        <span className="tabular ml-auto rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
          {count}
        </span>
      </summary>
      <div className="space-y-4 px-3 pb-4">{children}</div>
    </details>
  );
}
