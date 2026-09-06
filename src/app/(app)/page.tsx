import Link from "next/link";

import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { getProfile } from "@/lib/auth/profile";
import { visibleTabs } from "@/lib/nav";

export default async function HomePage() {
  // cache() ใน getProfile ทำให้บรรทัดนี้ใช้ผลเดิมจาก layout ไม่ได้ยิง query ซ้ำ
  const profile = await getProfile();
  const tabs = visibleTabs(profile?.roles);

  return (
    <>
      <AppHeader
        title="เลือกงานที่จะทำ"
        subtitle={`เลขประจำตัว ${profile?.serviceNumber ?? "—"}`}
      />
      <AppShell>
        <ul className="space-y-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className="flex min-h-14 items-center gap-4 rounded-xl border border-border bg-card px-4 py-3"
                >
                  <Icon aria-hidden="true" className="size-6 text-primary" />
                  <span className="min-w-0">
                    <span className="block font-semibold">{tab.label}</span>
                    <span className="block text-sm text-muted-foreground">
                      {tab.labelTh}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {tabs.length === 0 && (
          <p className="rounded-xl border border-border bg-card p-4 text-muted-foreground">
            บัญชีนี้ยังไม่ได้รับมอบบทบาทใดในระบบ
            กรุณาติดต่อผู้ดูแลระบบของหน่วย
          </p>
        )}
      </AppShell>
    </>
  );
}
