import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { LegSection } from "@/components/medrelay/leg-list";
import { NoAccessNotice } from "@/components/medrelay/no-access";
import { getProfile, hasAnyRole } from "@/lib/auth/profile";
import { getDispatchQueue } from "@/lib/leg-queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * หน้า /monitor — คิวคำขอและกระดานรถ (F2 · Prompt 08)
 *
 * ★ ไม่ใช้ Supabase Realtime โดยเจตนา (HANDOFF §3 "สิ่งที่ควรตัด")
 *   realtime + fallback + reconnect เป็นส่วนที่พังง่ายที่สุดในสเปคทั้งหมด
 *   และพังแบบที่ผู้ใช้ไม่รู้ตัวว่าข้อมูลค้าง ซึ่งอันตรายกว่าไม่มี realtime เลย
 *   หน้านี้จึงเป็น server component ล้วน รีเฟรชหน้าจอเพื่อดูของใหม่
 *   ถ้าจะเติม realtime ทีหลัง ต้องมีตัวบอกบนจอด้วยว่าเชื่อมต่ออยู่หรือหลุดแล้ว
 *
 * ★ ปุ่มจัดรถอยู่ที่ /track/[caseId] ไม่ใช่ที่นี่
 *   การจัดรถต้องเลือกทั้งคันรถและผู้ลำเลียง โดยเห็นอาการผู้ป่วยกับปลายทางประกอบ
 *   ปุ่มลัดที่จ่ายรถได้จากรายการโดยไม่เห็นบริบท คือปุ่มที่จ่ายผิดเคสได้ง่ายที่สุด
 */

const VEHICLE_STATUS_LABEL: Record<string, string> = {
  available: "ว่าง",
  dispatched: "จ่ายออกแล้ว",
  busy: "ติดภารกิจ",
  maintenance: "ซ่อมบำรุง",
  offline: "งดใช้งาน",
};

const VEHICLE_TYPE_LABEL: Record<string, string> = {
  bls: "กู้ชีพพื้นฐาน",
  als: "กู้ชีพขั้นสูง",
  utility: "อเนกประสงค์",
  rotary: "เฮลิคอปเตอร์",
  fixed_wing: "ปีกตรึง",
};

export default async function Page() {
  const profile = await getProfile();
  if (!profile) return null;

  /**
   * เช็คบทบาทก่อนยิง query ไม่ใช่หลัง — ห้ามใช้ RoleGate ครอบผลที่ดึงมาแล้ว
   * เดิมหน้านี้ดึงกระดานรถก่อนแล้วค่อยเอา RoleGate ครอบ ผลคือ transporter
   * ที่พิมพ์ URL เข้ามาได้รถของหน่วยตัวเองส่งไปถึงเครื่องแล้ว ทั้งที่จอไม่แสดง
   * RLS กันไม่ให้เห็นรถหน่วยอื่นอยู่แล้ว แต่ที่ไม่จำเป็นก็ไม่ควรส่งออกไป
   */
  if (!hasAnyRole(profile, ["monitor", "commander"])) {
    return (
      <>
        <AppHeader
          title="ศูนย์ควบคุมการส่งกลับสายแพทย์"
          subtitle="ศูนย์สั่งการและแดชบอร์ด"
        />
        <AppShell width="wide">
          <NoAccessNotice />
        </AppShell>
      </>
    );
  }

  const { waiting, moving } = await getDispatchQueue();

  const supabase = await createClient();
  const { data: vehicles } = await supabase
    .from("vehicle")
    .select("id, call_sign, type, status, crew_note, unit:unit_id (name_th)")
    .order("status")
    .order("call_sign");

  const rows = vehicles ?? [];
  const free = rows.filter((v) => v.status === "available").length;

  return (
    <>
      <AppHeader
        title="ศูนย์ควบคุมการส่งกลับสายแพทย์"
        subtitle={`รอจัดรถ ${waiting.length} · กำลังเดินทาง ${moving.length} · รถว่าง ${free} คัน`}
      />
      <AppShell width="wide">
        <div className="space-y-6">
          <LegSection
            title="รอจัดรถ"
            emptyText="ไม่มีคำขอค้างในคิว — ทุกคำขอได้รับการจัดรถแล้ว"
            legs={waiting}
          />

          <LegSection
            title="กำลังเดินทาง"
            emptyText="ไม่มีทอดที่กำลังเดินทางอยู่ตอนนี้"
            legs={moving}
            showTransporter
          />

          <section>
            <h2 className="mb-3 text-lg font-semibold">
              กระดานรถ{" "}
              <span className="font-normal text-muted-foreground">
                (ว่าง {free} จาก {rows.length} คัน)
              </span>
            </h2>

            {rows.length === 0 ? (
              <p className="rounded-xl border border-border bg-card p-4 text-muted-foreground">
                ยังไม่มีรถที่บัญชีของคุณมองเห็น
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((v) => {
                  const unit = Array.isArray(v.unit) ? v.unit[0] : v.unit;
                  const isFree = v.status === "available";
                  return (
                    <li
                      key={v.id}
                      className={cn(
                        "rounded-xl border bg-card p-4",
                        isFree ? "border-triage-green" : "border-border",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-semibold">
                          {v.call_sign}
                        </span>
                        {/* สถานะบอกด้วยตัวอักษรเสมอ ไม่ได้พึ่งสีขอบอย่างเดียว */}
                        <span
                          className={cn(
                            "ml-auto rounded-full border px-2.5 py-0.5 text-sm font-semibold",
                            isFree
                              ? "border-triage-green bg-emerald-50 text-triage-green"
                              : "border-border bg-muted/40 text-muted-foreground",
                          )}
                        >
                          {VEHICLE_STATUS_LABEL[v.status] ?? v.status}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {VEHICLE_TYPE_LABEL[v.type] ?? v.type} ·{" "}
                        {unit?.name_th ?? "—"}
                      </p>
                      {v.crew_note && (
                        <p className="mt-1 text-sm">{v.crew_note}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </AppShell>
    </>
  );
}
