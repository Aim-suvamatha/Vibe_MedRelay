import {
  BriefcaseMedical,
  LayoutGrid,
  Navigation,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/lib/enums";

/**
 * 4 tab ของ bottom navigation
 *
 * ใช้ชื่อบทบาทเป็นป้าย (Sender / Transporter / Receiver / Monitor) ตาม WireframeV3
 * ตามการตัดสินใจของเจ้าของโครงการ เหตุผลคือ tab แต่ละอันตรงกับค่าใน enum app_role
 * แบบหนึ่งต่อหนึ่ง คนที่ถือหลายบทบาทจึงเดาได้ทันทีว่ากดอันไหนแล้วจะเจออะไร
 * คำอธิบายภาษาไทยยังอยู่ครบใน aria-label และ title สำหรับคนที่ไม่คุ้นศัพท์อังกฤษ
 */
export type NavTab = {
  readonly href: string;
  readonly label: string;
  /** คำอธิบายภาษาไทย — ใช้เป็นชื่อที่ screen reader อ่าน */
  readonly labelTh: string;
  readonly icon: LucideIcon;
  /** บทบาทที่เห็น tab นี้ ถ้าไม่มีสักอันใน profile.roles จะถูกซ่อน */
  readonly roles: readonly AppRole[];
};

export const NAV_TABS: readonly NavTab[] = [
  {
    href: "/sender",
    label: "Sender",
    labelTh: "ขอส่งกลับ",
    icon: Navigation,
    roles: ["sender"],
  },
  {
    href: "/transporter",
    label: "Transporter",
    labelTh: "ลำเลียงผู้ป่วย",
    icon: Truck,
    roles: ["transporter"],
  },
  {
    href: "/receiver",
    label: "Receiver",
    labelTh: "รับผู้ป่วยปลายทาง",
    icon: BriefcaseMedical,
    roles: ["receiver"],
  },
  {
    href: "/monitor",
    label: "Monitor",
    labelTh: "ศูนย์สั่งการและแดชบอร์ด",
    icon: LayoutGrid,
    // commander เห็นภาพรวมได้เหมือน monitor แต่ไม่ได้ลงมือจัดรถเอง
    roles: ["monitor", "commander"],
  },
];

/**
 * กรอง tab ตามบทบาทที่ผู้ใช้ถืออยู่
 *
 * นี่เป็นแค่การจัดหน้าจอให้สะอาด **ไม่ใช่การควบคุมสิทธิ์**
 * สิทธิ์จริงบังคับที่ RLS ใน migration 0010 ผู้ใช้ที่พิมพ์ URL ตรงๆ จะเข้าหน้าได้
 * แต่ query จะไม่คืนข้อมูลที่เขาไม่มีสิทธิ์เห็น — RoleGate ใน Prompt 06 จะกันอีกชั้นที่ระดับ route
 */
export function visibleTabs(roles: readonly AppRole[] | null | undefined) {
  if (!roles?.length) return [];
  if (roles.includes("admin")) return NAV_TABS;
  return NAV_TABS.filter((tab) => tab.roles.some((r) => roles.includes(r)));
}
