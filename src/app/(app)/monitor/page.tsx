import Link from "next/link";

import { AppHeader, AppShell } from "@/components/medrelay/app-shell";
import { LegSection } from "@/components/medrelay/leg-list";
import { NoAccessNotice } from "@/components/medrelay/no-access";
import { StatCard, reportedValue } from "@/components/medrelay/stat-card";
import { getProfile, hasAnyRole } from "@/lib/auth/profile";
import {
  defaultRange,
  isLocalInput,
  isReportError,
} from "@/lib/casualty-report-format";
import { formatDuration } from "@/lib/duration";
import { getDispatchQueue } from "@/lib/leg-queries";
import {
  getAirQueue,
  getResourceSnapshot,
  getRouteStats,
} from "@/lib/monitor-resources";
import {
  AIR_VEHICLE_TYPES,
  ROLE_LEVEL_ORDER,
  VEHICLE_STATUS_LABEL,
  VEHICLE_TYPE_LABEL,
  type EvacNode,
  type VehicleRow,
} from "@/lib/monitor-view";
import type { RouteStat } from "@/lib/routes";
import { ROLE_LEVEL_LABEL } from "@/lib/triage";
import { cn } from "@/lib/utils";
import { AirApprovalSection } from "./air-approval";
import { ReportExportSection } from "./report-export";

/**
 * หน้า /monitor — ศูนย์ควบคุมการส่งกลับ (F2 · Prompt 08 · ขยายเป็นแดชบอร์ดทรัพยากร 9 ก.ย. 2569)
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
 *
 * ★ บทบาทนี้ควบคุมกระบวนการ ไม่แตะการรักษา (คำนิยามของเจ้าของโครงการ 9 ก.ย. 2569)
 *   สิ่งที่ศูนย์สั่งการจัดสรรมี 5 อย่าง — นายสิบพยาบาล · รถ · จุดส่งกลับ · เส้นทาง
 *   · และการอนุมัติใช้อากาศยาน หน้านี้เรียงตามลำดับที่เขาต้องตัดสินใจจริง
 *   คือรู้ว่ามีอะไรให้จ่ายก่อน แล้วจึงเห็นว่าใครรออยู่ แล้วจึงดูภาพรวมสายส่งกลับ
 *
 * ★ ตัวเลขทรัพยากรทั้งหมดในหน้านี้ "อ่านอย่างเดียว" โดยเจตนา
 *   เตียงว่างและนายสิบพยาบาลเข้าเวรเป็นสิ่งที่หน่วยเจ้าของต้องรายงานเอง
 *   policy unit_write ใน 0010 ยอมเฉพาะ admin — ศูนย์สั่งการแก้ตัวเลขของหน่วยอื่นไม่ได้
 *   ซึ่งถูกต้อง เพราะคนที่นับเตียงคือคนที่อยู่ที่เตียง ไม่ใช่คนที่นั่งอยู่ที่ศูนย์
 *   ถ้าวันหน้าจะให้หน่วยรายงานเอง ต้องเพิ่ม policy ที่ยอมให้แก้เฉพาะแถวของหน่วยตัวเอง
 *
 * ★ ก้อนเดียวในหน้านี้ที่กดแล้วเปลี่ยนข้อมูลคือการอนุมัติอากาศยาน
 *   และมันจำกัดตัวเองอยู่ที่ 5 คอลัมน์ air_* เท่านั้น ทั้งที่ policy case_update
 *   ยอมให้ monitor แก้ได้ทุกคอลัมน์ของทุกเคสโดยไม่ผ่าน can_see_case() ด้วยซ้ำ
 *   ขอบเขตของปุ่มจึงต้องคิดที่ฝั่งแอป RLS กว้างเกินกว่าจะเป็นด่านเดียว
 */

/* -------------------------------------------------------------
 * ⑤a ผังสายการส่งกลับ
 * ----------------------------------------------------------- */

function NodeChip({ node }: { node: EvacNode }) {
  return (
    <li className="rounded-lg border border-border bg-background p-3">
      <p className="font-semibold text-balance">{node.nameTh}</p>
      {node.gridRef && (
        <p className="font-mono text-sm text-muted-foreground">{node.gridRef}</p>
      )}

      <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
        <div className="flex gap-1">
          <dt className="text-muted-foreground">เตียงว่าง</dt>
          {/* ขีดกลาง = ยังไม่รายงาน · เลข 0 = รายงานแล้วว่าเต็ม สองอย่างนี้ต่างกัน */}
          <dd className={cn("tabular-nums", node.bedAvailable === null && "text-muted-foreground")}>
            {node.bedAvailable ?? "—"}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted-foreground">นายสิบพยาบาล</dt>
          <dd className={cn("tabular-nums", node.medicOnDuty === null && "text-muted-foreground")}>
            {node.medicOnDuty ?? "—"}
          </dd>
        </div>
      </dl>

      {node.inbound > 0 && (
        <p className="mt-1.5 rounded-full border border-triage-yellow bg-amber-50 px-2.5 py-0.5 text-sm font-semibold text-triage-yellow">
          กำลังมาถึง {node.inbound} ราย
        </p>
      )}
    </li>
  );
}

function EvacChain({ nodes }: { nodes: EvacNode[] }) {
  const tiers = ROLE_LEVEL_ORDER.map((level) => ({
    level,
    nodes: nodes.filter((n) => n.roleLevel === level),
  })).filter((t) => t.nodes.length > 0);

  if (tiers.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card p-4 text-muted-foreground">
        ยังไม่มีจุดส่งกลับที่บัญชีของคุณมองเห็น
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {/* ⚠ นี่คือผังชั้นการรักษา ไม่ใช่แผนที่
          ระบบไม่มีพิกัด lat/lng และ AI_RULES §3.1 ห้ามดึงตำแหน่งอัตโนมัติ
          ตัวเลขพิกัดที่เห็นเป็นค่าที่คนกรอกไว้ล่วงหน้า ต้องเขียนกำกับไว้
          ไม่งั้นคนอ่านจะเข้าใจว่าจุดบนจอสะท้อนที่ตั้งจริงตามระยะทาง */}
      <p className="mb-3 text-sm text-muted-foreground text-balance">
        เรียงตามชั้นการรักษาจากเขตหน้าไปเขตหลัง{" "}
        <span className="font-semibold text-foreground">ไม่ใช่แผนที่</span> —
        ตำแหน่งบนจอไม่ได้สะท้อนระยะทางจริง พิกัดที่แสดงเป็นค่าที่กรอกไว้ล่วงหน้า
      </p>

      <div className="grid gap-4 lg:grid-cols-4">
        {tiers.map((t, i) => (
          <div key={t.level}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <span className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5">
                {ROLE_LEVEL_LABEL[t.level] ?? t.level}
              </span>
              {/* ลูกศรบอกทิศทางของสาย ชั้นสุดท้ายไม่มีลูกศรเพราะไม่มีชั้นถัดไป */}
              {i < tiers.length - 1 && (
                <span aria-hidden className="hidden text-muted-foreground lg:inline">
                  →
                </span>
              )}
            </h3>
            <ul className="space-y-2">
              {t.nodes.map((n) => (
                <NodeChip key={n.id} node={n} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------
 * ⑤b ตารางเส้นทาง
 * ----------------------------------------------------------- */

function RouteTable({ rows }: { rows: RouteStat[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card p-4 text-muted-foreground">
        ยังไม่มีทอดใดวิ่งในระบบ จึงยังไม่มีเส้นทางให้สรุป
      </p>
    );
  }

  return (
    // ตารางกว้างต้องเลื่อนในกล่องของตัวเอง ห้ามให้ทั้งหน้าเลื่อนแนวนอน
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th scope="col" className="p-3 font-semibold">เส้นทาง</th>
            <th scope="col" className="p-3 text-right font-semibold">กำลังวิ่ง</th>
            <th scope="col" className="p-3 text-right font-semibold">ส่งมอบแล้ว</th>
            <th scope="col" className="p-3 text-right font-semibold">มัธยฐานเวลา</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-0">
              <td className="p-3">
                {r.fromUnit} <span aria-hidden>→</span>{" "}
                <span className="sr-only">ไป</span>
                {r.toUnit}
              </td>
              <td className="p-3 text-right tabular-nums">
                {r.moving > 0 ? (
                  <span className="font-semibold text-triage-yellow">{r.moving}</span>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </td>
              <td className="p-3 text-right tabular-nums">{r.completed}</td>
              {/* ยังไม่มีทอดจบ = วัดไม่ได้ ต้องขึ้นขีดกลาง ห้ามขึ้น 0 นาที
                  "0 นาที" อ่านได้ว่าส่งถึงทันที ซึ่งเป็นคำโกหกที่ดูน่าเชื่อมาก */}
              <td
                className={cn(
                  "p-3 text-right tabular-nums",
                  r.medianSec === null && "text-muted-foreground",
                )}
              >
                {formatDuration(r.medianSec)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------
 * ⑥ กระดานรถ
 * ----------------------------------------------------------- */

function VehicleCard({ v }: { v: VehicleRow }) {
  const isFree = v.status === "available";
  const crew = [
    v.driverCount > 0 ? `พลขับ ${v.driverCount}` : null,
    v.medicCount > 0 ? `นายสิบพยาบาล ${v.medicCount}` : null,
    v.litterCount > 0 ? `พลเปล ${v.litterCount}` : null,
  ].filter(Boolean);

  return (
    <li
      className={cn(
        "rounded-xl border bg-card p-4",
        isFree ? "border-triage-green" : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-base font-semibold">{v.callSign}</span>
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
        {VEHICLE_TYPE_LABEL[v.type] ?? v.type} · {v.unitName}
      </p>

      {crew.length > 0 && (
        <p className="mt-1 text-sm tabular-nums">{crew.join(" · ")}</p>
      )}
      {/* crew_note บอกสิ่งที่ตัวเลขบอกไม่ได้ เช่นเหตุที่รถคันนั้นใช้ไม่ได้ */}
      {v.crewNote && <p className="mt-1 text-sm text-muted-foreground">{v.crewNote}</p>}
    </li>
  );
}

function VehicleGroup({ title, rows }: { title: string; rows: VehicleRow[] }) {
  if (rows.length === 0) return null;
  const free = rows.filter((v) => v.status === "available").length;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
        {title} (ว่าง {free} จาก {rows.length})
      </h3>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((v) => (
          <VehicleCard key={v.id} v={v} />
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------
 * หน้าเว็บ
 * ----------------------------------------------------------- */

export default async function Page({
  searchParams,
}: {
  /** reportError/from/to มาจาก /monitor/report เมื่อพากลับมาแจ้งข้อผิดพลาดของการดาวน์โหลด */
  searchParams: Promise<{ reportError?: string; from?: string; to?: string }>;
}) {
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

  /**
   * commander เห็นทุกอย่างในหน้านี้ แต่ตัดสินคำขอไม่ได้
   * ตรงกับ policy case_update ที่ยอมเฉพาะ monitor และกับคำอธิบายใน nav.ts
   * คิดที่นี่แล้วส่งลงไปเป็น prop — ไม่ให้ client เดาจาก roles เอง
   */
  const canDecide = hasAnyRole(profile, ["monitor"]);

  // ค่าที่ผู้ใช้กรอกค้างไว้ก่อนเจอข้อผิดพลาด ชนะค่าเริ่มต้นเสมอ ไม่งั้นต้องเลือกช่วงใหม่ทุกครั้งที่พลาด
  // รับเฉพาะรูปแบบ datetime-local ที่ถูกต้อง ค่าอื่นจาก URL ทิ้งไป ไม่สะท้อนกลับขึ้นหน้าจอ
  const sp = await searchParams;
  const reportDefaults = defaultRange();
  const reportFrom = isLocalInput(sp.from) ? sp.from : reportDefaults.from;
  const reportTo = isLocalInput(sp.to) ? sp.to : reportDefaults.to;
  const reportError = isReportError(sp.reportError) ? sp.reportError : null;

  const [{ waiting, moving }, snapshot, air, routes] = await Promise.all([
    getDispatchQueue(),
    getResourceSnapshot(),
    getAirQueue(),
    getRouteStats(),
  ]);

  const beds = reportedValue(snapshot.bedsAvailable, "เตียง");
  const onDuty = reportedValue(snapshot.medicsOnDuty, "คน");

  const airVehicles = snapshot.vehicles.filter((v) =>
    AIR_VEHICLE_TYPES.includes(v.type),
  );
  const groundVehicles = snapshot.vehicles.filter(
    (v) => !AIR_VEHICLE_TYPES.includes(v.type),
  );

  return (
    <>
      <AppHeader
        title="ศูนย์ควบคุมการส่งกลับสายแพทย์"
        subtitle={`รอจัดรถ ${waiting.length} · กำลังเดินทาง ${moving.length} · รถว่าง ${snapshot.vehiclesFree} คัน · รออนุมัติทางอากาศ ${air.pending.length}`}
      />
      <AppShell width="wide">
        <div className="space-y-6">
          {/* ① สรุปทรัพยากรที่จัดสรรได้ตอนนี้ */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">ทรัพยากรที่จ่ายได้ตอนนี้</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="รถว่าง"
                value={`${snapshot.vehiclesFree} คัน`}
                hint={`จากทั้งหมด ${snapshot.vehiclesTotal} คันที่บัญชีของคุณมองเห็น`}
              />
              <StatCard
                label="นายสิบพยาบาลบนรถที่ว่าง"
                value={`${snapshot.medicsFree} คน`}
                hint={`ประจำรถทั้งหมด ${snapshot.medicsOnVehicles} คน · ที่เหลือติดภารกิจอยู่`}
              />
              <StatCard
                label="นายสิบพยาบาลเข้าเวรที่จุดส่งกลับ"
                value={onDuty.value}
                empty={onDuty.empty}
                hint={
                  onDuty.empty
                    ? "ยังไม่มีจุดส่งกลับใดรายงานยอดเข้าเวร"
                    : "รวมทุกจุดส่งกลับ · เป็นคนละกลุ่มกับที่ประจำรถ"
                }
              />
              <StatCard
                label="เตียงว่างรวม"
                value={beds.value}
                empty={beds.empty}
                hint={
                  beds.empty
                    ? "ยังไม่มีจุดส่งกลับใดรายงานจำนวนเตียง"
                    : "หน่วยเจ้าของเป็นผู้รายงาน ศูนย์สั่งการแก้เองไม่ได้"
                }
              />
            </div>
          </section>

          {/* ② อำนาจเดียวของหน้านี้ที่เปลี่ยนข้อมูลได้ */}
          <AirApprovalSection
            pending={air.pending}
            decided={air.decided}
            canDecide={canDecide}
          />

          {/* ③④ คิวเดิม — ไม่แตะ leg-list.tsx เพราะใช้ร่วมกันสามหน้า */}
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

          {/* ⑤ จุดส่งกลับและเส้นทาง */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">
              จุดส่งกลับ{" "}
              <span className="font-normal text-muted-foreground">
                ({snapshot.nodes.length} จุด)
              </span>
            </h2>
            <EvacChain nodes={snapshot.nodes} />
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">เส้นทางการส่งกลับ</h2>
            <RouteTable rows={routes} />
          </section>

          {/* ⑥ กระดานรถ — แยกอากาศยานออกเพราะจ่ายคนละเงื่อนไขกัน */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">
              กระดานรถ{" "}
              <span className="font-normal text-muted-foreground">
                (ว่าง {snapshot.vehiclesFree} จาก {snapshot.vehiclesTotal} คัน)
              </span>
            </h2>

            {snapshot.vehicles.length === 0 ? (
              <p className="rounded-xl border border-border bg-card p-4 text-muted-foreground">
                ยังไม่มีรถที่บัญชีของคุณมองเห็น
              </p>
            ) : (
              <div className="space-y-4">
                <VehicleGroup title="ยานพาหนะภาคพื้น" rows={groundVehicles} />
                <VehicleGroup title="อากาศยาน" rows={airVehicles} />
              </div>
            )}
          </section>

          {/* ⑦ รายงานประจำวัน — ไม่ใช่การตัดสินใจ จึงอยู่ท้ายหน้า (F7) */}
          <ReportExportSection from={reportFrom} to={reportTo} error={reportError} />

          {/* แดชบอร์ดไม่มี tab ของตัวเองใน bottom nav โดยเจตนา
              NAV_TABS ออกแบบให้หนึ่ง tab ตรงกับหนึ่งบทบาทใน enum app_role
              การเพิ่ม tab ที่ห้าจะทำลายกฎนั้น จึงเข้าจากที่นี่แทน
              ป้ายของ tab Monitor เขียนว่า "ศูนย์สั่งการและแดชบอร์ด" อยู่แล้ว */}
          <Link
            href="/dashboard"
            className="flex h-14 w-full items-center justify-center rounded-lg border border-border bg-card text-base font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            ดูแดชบอร์ดตัวเลขการส่งกลับ
          </Link>
        </div>
      </AppShell>
    </>
  );
}
