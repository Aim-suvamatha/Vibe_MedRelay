import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { RoleGate } from "@/components/medrelay/role-gate";

/**
 * หน้าTransporter — ยังเป็นโครงเปล่า
 * เนื้อหาจริงมาใน F3 · Prompt 08 · ตอนนี้มีไว้ให้ bottom nav กดแล้วไม่ 404
 */
export default function Page() {
  return (
    <>
      <AppHeader title="ภารกิจลำเลียง" subtitle="ลำเลียงผู้ป่วย" />
      <AppShell>
        <RoleGate
          roles={["transporter"]}
          fallback={
            <p className="rounded-xl border border-border bg-card p-4 text-muted-foreground">
              บัญชีของคุณไม่มีบทบาทสำหรับหน้านี้
            </p>
          }
        >
          <p className="rounded-xl border border-border bg-card p-4 text-muted-foreground">
            หน้านี้จะสร้างใน F3 · Prompt 08
          </p>
        </RoleGate>
      </AppShell>
    </>
  );
}
