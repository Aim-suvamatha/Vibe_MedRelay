import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { RoleGate } from "@/components/medrelay/role-gate";

/**
 * หน้าReceiver — ยังเป็นโครงเปล่า
 * เนื้อหาจริงมาใน F3 · Prompt 08 · ตอนนี้มีไว้ให้ bottom nav กดแล้วไม่ 404
 */
export default function Page() {
  return (
    <>
      <AppHeader title="ผู้ป่วยกำลังมาถึง" subtitle="รับผู้ป่วยปลายทาง" />
      <AppShell>
        <RoleGate
          roles={["receiver"]}
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
