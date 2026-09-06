import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { RoleGate } from "@/components/medrelay/role-gate";

/**
 * หน้าMonitor — ยังเป็นโครงเปล่า
 * เนื้อหาจริงมาใน F2/F4 · Prompt 08–09 · ตอนนี้มีไว้ให้ bottom nav กดแล้วไม่ 404
 */
export default function Page() {
  return (
    <>
      <AppHeader title="ศูนย์ควบคุมการส่งกลับสายแพทย์" subtitle="ศูนย์สั่งการและแดชบอร์ด" />
      <AppShell width="wide">
        <RoleGate
          roles={["monitor", "commander"]}
          fallback={
            <p className="rounded-xl border border-border bg-card p-4 text-muted-foreground">
              บัญชีของคุณไม่มีบทบาทสำหรับหน้านี้
            </p>
          }
        >
          <p className="rounded-xl border border-border bg-card p-4 text-muted-foreground">
            หน้านี้จะสร้างใน F2/F4 · Prompt 08–09
          </p>
        </RoleGate>
      </AppShell>
    </>
  );
}
