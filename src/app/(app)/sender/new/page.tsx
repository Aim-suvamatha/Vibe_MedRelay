import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { RoleGate } from "@/components/medrelay/role-gate";
import { getProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { SenderForm, type UnitOption } from "./sender-form";
import type { PickupPointOption } from "./pickup-field";

/**
 * หน้า /sender/new — ฟอร์มขอส่งกลับแบบกรอกทีละขั้น (F1)
 *
 * แยกออกจาก /sender ซึ่งกลายเป็นรายการคำขอแล้ว (คำสั่งเจ้าของโครงการ 8 ก.ย. 2569)
 * เข้ามาที่นี่ได้ทางเดียวคือกดปุ่ม + บนแถบหัวเรื่องของหน้ารายการ
 *
 * ดึงตัวเลือกฝั่ง server เพราะสองรายการนี้แทบไม่เปลี่ยนระหว่างกะ
 * ถ้าดึงฝั่ง client ผู้ใช้จะเห็น dropdown ว่างค้างอยู่ตอนสัญญาณไม่ดี
 * ซึ่งเป็นช่วงเวลาที่แย่ที่สุดที่จะให้เขารอ
 */
export default async function Page() {
  const profile = await getProfile();
  if (!profile) return null;

  const supabase = await createClient();

  const [{ data: units }, { data: points }] = await Promise.all([
    supabase
      .from("unit")
      .select("id, code, name_th, role_level")
      .eq("is_active", true)
      // หน่วยปลายทางต้องไม่ใช่หน่วยต้นทาง — function ก็ปฏิเสธอยู่แล้ว
      // แต่การไม่แสดงตัวเลือกที่กดแล้วผิดแน่ๆ ดีกว่าปล่อยให้กดแล้วค่อยบอก
      .neq("id", profile.unitId)
      .order("role_level")
      .order("name_th"),
    supabase
      .from("pickup_point")
      .select("id, name, grid_ref, note")
      .eq("unit_id", profile.unitId)
      .eq("is_active", true)
      .order("name"),
  ]);

  const unitOptions: UnitOption[] = (units ?? []).map((u) => ({
    id: u.id,
    code: u.code,
    nameTh: u.name_th,
    roleLevel: u.role_level,
  }));

  const pickupOptions: PickupPointOption[] = (points ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    gridRef: p.grid_ref,
    note: p.note,
  }));

  return (
    <>
      <AppHeader
        title="คำขอใหม่"
        subtitle={`ต้นทาง ${profile.unitName || profile.unitCode}`}
      />
      <AppShell>
        <RoleGate
          roles={["sender"]}
          fallback={
            <p className="rounded-xl border border-border bg-card p-4 text-muted-foreground">
              บัญชีของคุณไม่มีบทบาทสำหรับหน้านี้
            </p>
          }
        >
          <SenderForm
            units={unitOptions}
            pickupPoints={pickupOptions}
            originUnitName={profile.unitName || profile.unitCode}
          />
        </RoleGate>
      </AppShell>
    </>
  );
}
