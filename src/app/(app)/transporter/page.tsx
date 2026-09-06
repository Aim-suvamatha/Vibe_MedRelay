import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { LegSection } from "@/components/medrelay/leg-list";
import { NoAccessNotice } from "@/components/medrelay/no-access";
import { getProfile, hasAnyRole } from "@/lib/auth/profile";
import { getMyTransportLegs } from "@/lib/leg-queries";

/**
 * หน้า /transporter — ภารกิจของชุดลำเลียง (F3 · Prompt 08)
 *
 * ★ แสดงเฉพาะทอดที่ผู้ใช้คนนี้ถูกตั้งเป็น transporter_id
 *   ไม่ใช่ทอดทั้งหมดของหน่วย เพราะคำถามที่เขาเปิดหน้านี้มาถามคือ
 *   "ตอนนี้ฉันต้องไปไหน" ไม่ใช่ "หน่วยฉันมีงานอะไรบ้าง"
 *   ถ้าใส่ทอดของคนอื่นมาปนจะต้องมานั่งกวาดตาหาชื่อตัวเองก่อนทุกครั้ง
 *
 * ★ ปุ่มเปลี่ยนสถานะไม่ได้อยู่ที่นี่ — อยู่ที่ /track/[caseId]
 *   เพราะการกดเปลี่ยนสถานะต้องเห็นเส้นเวลาและผลประเมินประกอบก่อนเสมอ
 *   ปุ่มลัดที่กดจากรายการโดยไม่เห็นบริบท คือปุ่มที่กดผิดเคสได้ง่ายที่สุด
 */
export default async function Page() {
  const profile = await getProfile();
  if (!profile) return null;

  /**
   * เช็คบทบาทก่อนยิง query ไม่ใช่หลัง — ห้ามใช้ RoleGate ครอบผลที่ดึงมาแล้ว
   * เพราะข้อมูลจะถูกส่งไปถึงเครื่องของคนที่ไม่ควรเห็นเรียบร้อยแล้ว (ดู role-gate.tsx)
   */
  if (!hasAnyRole(profile, ["transporter"])) {
    return (
      <>
        <AppHeader title="ภารกิจลำเลียง" subtitle="ลำเลียงผู้ป่วย" />
        <AppShell>
          <NoAccessNotice />
        </AppShell>
      </>
    );
  }

  const { open, done } = await getMyTransportLegs(profile.id);

  return (
    <>
      <AppHeader
        title="ภารกิจลำเลียง"
        subtitle={`${profile.unitName || profile.unitCode} · ค้างอยู่ ${open.length} ทอด`}
      />
      <AppShell>
        <div className="space-y-6">
          <LegSection
            title="ภารกิจที่ต้องทำต่อ"
            emptyText="ยังไม่มีภารกิจที่จ่ายให้คุณ — ศูนย์สั่งการจะจ่ายรถและผู้ลำเลียงเมื่อมีคำขอเข้ามา"
            legs={open}
          />

          <LegSection
            title="ส่งมอบไปแล้วล่าสุด"
            emptyText="ยังไม่มีภารกิจที่คุณส่งมอบเสร็จ"
            legs={done}
          />
        </div>
      </AppShell>
    </>
  );
}
