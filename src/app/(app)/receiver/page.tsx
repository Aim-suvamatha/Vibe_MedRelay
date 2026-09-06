import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { LegSection } from "@/components/medrelay/leg-list";
import { NoAccessNotice } from "@/components/medrelay/no-access";
import { getProfile, hasAnyRole } from "@/lib/auth/profile";
import { getIncomingLegs } from "@/lib/leg-queries";

/**
 * หน้า /receiver — ผู้ป่วยที่กำลังมาถึงหน่วยนี้ (F3 · Prompt 08)
 *
 * ★ นี่คือหน้าที่ตอบโจทย์หลักของโครงการตรงที่สุด
 *   เดิมปลายทางรู้ว่าจะมีผู้ป่วยมาก็ต่อเมื่อรถมาจอดหน้าตึกแล้ว
 *   หน้านี้ทำให้รู้ล่วงหน้าตั้งแต่รถออกจากต้นทาง พร้อมผลประเมินแรกรับที่กดเข้าไปดูได้
 *
 * ★ เรียงตาม requested_at จากเก่าไปใหม่ ไม่ใช่ตามความเร่งด่วน
 *   ความเร่งด่วนบอกด้วย PrecedenceBadge และ TriageDot บนการ์ดอยู่แล้ว
 *   แต่ลำดับการมาถึงจริงขึ้นกับว่าใครออกเดินทางก่อน ไม่ใช่ใครอาการหนักกว่า
 */
export default async function Page() {
  const profile = await getProfile();
  if (!profile) return null;

  /**
   * เช็คบทบาทก่อนยิง query ไม่ใช่หลัง — ห้ามใช้ RoleGate ครอบผลที่ดึงมาแล้ว
   * เพราะข้อมูลจะถูกส่งไปถึงเครื่องของคนที่ไม่ควรเห็นเรียบร้อยแล้ว (ดู role-gate.tsx)
   */
  if (!hasAnyRole(profile, ["receiver"])) {
    return (
      <>
        <AppHeader title="ผู้ป่วยกำลังมาถึง" subtitle="รับผู้ป่วยปลายทาง" />
        <AppShell>
          <NoAccessNotice />
        </AppShell>
      </>
    );
  }

  const { inbound, done } = await getIncomingLegs(profile.unitId);

  return (
    <>
      <AppHeader
        title="ผู้ป่วยกำลังมาถึง"
        subtitle={`${profile.unitName || profile.unitCode} · กำลังมา ${inbound.length} ราย`}
      />
      <AppShell>
        <div className="space-y-6">
          <LegSection
            title="กำลังเดินทางมาหน่วยนี้"
            emptyText="ยังไม่มีผู้ป่วยที่กำลังส่งมาหน่วยนี้"
            legs={inbound}
            showTransporter
          />

          <LegSection
            title="รับมอบไปแล้วล่าสุด"
            emptyText="ยังไม่มีผู้ป่วยที่หน่วยนี้รับมอบ"
            legs={done}
            showTransporter
          />
        </div>
      </AppShell>
    </>
  );
}
