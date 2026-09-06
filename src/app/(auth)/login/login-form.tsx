"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { login, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="mt-2 h-14 w-full text-base font-semibold"
    >
      {pending ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
    </Button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});

  return (
    <main className="flex flex-1 flex-col">
      <div className="bg-header px-4 pt-10 pb-8 text-header-foreground">
        <div className="mx-auto max-w-md">
          <p className="font-mono text-sm text-header-muted">MedRelay</p>
          <h1 className="mt-1 text-3xl font-bold">ระบบส่งกลับสายแพทย์</h1>
          <p className="mt-2 text-sm text-header-muted">
            เข้าสู่ระบบด้วยเลขประจำตัวทหาร
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
        <form action={formAction} className="space-y-5">
          {/* proxy.ts ใส่ ?next= มาเมื่อผู้ใช้พยายามเปิดหน้าที่ต้องล็อกอิน
              พาเขากลับไปหน้านั้นหลังล็อกอินเสร็จ แทนที่จะทิ้งไว้ที่หน้าแรก */}
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <label
              htmlFor="serviceNumber"
              className="block text-sm font-semibold"
            >
              เลขประจำตัวทหาร
            </label>
            <Input
              id="serviceNumber"
              name="serviceNumber"
              defaultValue={state.serviceNumber}
              required
              autoComplete="username"
              // เปิดแป้นตัวเลขบนมือถือ และกันคีย์บอร์ดภาษาไทยเด้งขึ้นมา
              inputMode="numeric"
              pattern="\d{10}"
              maxLength={10}
              placeholder="10 หลัก"
              className="h-14 font-mono text-lg tracking-widest"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-semibold">
              รหัสผ่าน
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="h-14 text-lg"
            />
          </div>

          {state.error && (
            <p
              // role=alert ทำให้ screen reader อ่านทันทีโดยไม่ต้องย้าย focus
              role="alert"
              className="rounded-lg border border-destructive bg-red-50 px-3 py-2.5 text-sm font-medium text-destructive"
            >
              {state.error}
            </p>
          )}

          <SubmitButton />
        </form>

        <p className="mt-8 text-sm text-muted-foreground">
          ระบบนี้อยู่ในระหว่างทดสอบ ข้อมูลทั้งหมดเป็นข้อมูลจำลอง
          ห้ามบันทึกข้อมูลผู้ป่วยจริง
        </p>
      </div>
    </main>
  );
}
