"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/enums";
import { visibleTabs } from "@/lib/nav";

/**
 * BottomNav — แถบเปลี่ยนบทบาทที่อยู่ล่างจอ
 *
 * ทำไมต้องอยู่ล่าง: ผู้ใช้ถือโทรศัพท์มือเดียวและกดด้วยนิ้วโป้ง ขอบบนจอเอื้อมไม่ถึง
 * ทุกปุ่มสูงเต็ม 64px กว้างเท่ากันหมด กดพลาดยากแม้สวมถุงมือ
 *
 * component นี้เป็น presentational ล้วน รับ roles เข้ามาเป็น prop
 * ยังไม่ผูกกับ useProfile เพราะ auth จะมาใน Prompt 06 — พอถึงตอนนั้นแค่ส่ง roles จริงเข้ามา
 */
export function BottomNav({
  roles,
  className,
}: {
  roles: readonly AppRole[] | null | undefined;
  className?: string;
}) {
  const pathname = usePathname();
  const tabs = visibleTabs(roles);

  // ผู้ใช้ที่มีบทบาทเดียวไม่ต้องมีแถบให้สลับ ให้พื้นที่จอไปกับเนื้อหาแทน
  if (tabs.length < 2) return null;

  return (
    <nav
      aria-label="สลับบทบาทการใช้งาน"
      className={cn(
        "sticky bottom-0 z-40 border-t border-border bg-card pb-safe",
        className,
      )}
    >
      <ul className="mx-auto flex max-w-3xl">
        {tabs.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                aria-label={`${tab.label} — ${tab.labelTh}`}
                title={tab.labelTh}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 px-1",
                  // สถานะปัจจุบันบอกด้วยสีและน้ำหนักตัวอักษร ไม่ใช่ hover
                  // เพราะเป็นเครื่อง touch ที่ไม่มี hover ให้ใช้ตั้งแต่แรก
                  active
                    ? "font-semibold text-primary"
                    : "font-medium text-muted-foreground",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className="size-6 shrink-0"
                  strokeWidth={active ? 2.4 : 1.9}
                />
                <span className="text-xs leading-none">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
