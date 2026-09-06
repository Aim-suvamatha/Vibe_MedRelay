import { redirect } from "next/navigation";

import { logout } from "@/app/(auth)/login/actions";
import { BottomNav } from "@/components/medrelay/bottom-nav";
import { ProfileProvider } from "@/components/medrelay/profile-provider";
import { getProfile } from "@/lib/auth/profile";

/**
 * layout ของทุกหน้าที่ต้องล็อกอิน
 *
 * proxy.ts กันคนที่ไม่มี session ไว้ชั้นหนึ่งแล้ว แต่ยังต้องเช็คซ้ำที่นี่
 * เพราะ proxy รู้แค่ว่า "มี session" ส่วนที่นี่รู้ว่า "มีแถวใน profile จริงไหม"
 * ผู้ใช้ที่ถูกสร้างใน auth แต่ยังไม่ถูกผูกกับหน่วย จะไม่มี profile และต้องไม่หลุดเข้ามา
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <ProfileProvider profile={profile}>
      {/* แถบบัญชีผู้ใช้ — สีเดียวกับ AppHeader ของแต่ละหน้า จึงอ่านเป็นหัวเรื่องก้อนเดียวกัน */}
      <div className="bg-header text-header-foreground">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-3">
          <p className="min-w-0 flex-1 truncate text-sm text-header-muted">
            {profile.rankTh ? `${profile.rankTh} ` : ""}
            {profile.fullName}
            {profile.unitName ? ` · ${profile.unitName}` : ""}
          </p>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md px-2 py-1.5 text-sm font-medium text-header-muted underline underline-offset-4"
            >
              ออกจากระบบ
            </button>
          </form>
        </div>
      </div>

      {children}

      <BottomNav roles={profile.roles} />
    </ProfileProvider>
  );
}
