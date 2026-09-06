import { cn } from "@/lib/utils";

/**
 * AppHeader — แถบหัวเรื่องสีเขียวเข้มตาม WireframeV3
 *
 * บอกสองอย่างเสมอ: กำลังอยู่หน้าไหน และเคส/หน่วยไหน
 * ผู้ใช้สลับไปมาระหว่างหลายเคสในกะเดียว ถ้าไม่มีบรรทัดที่สองจะส่งข้อมูลผิดเคสได้
 */
export function AppHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** ปุ่มหรือสถานะมุมขวา เช่น ป้าย MASCAL ในหน้าศูนย์สั่งการ */
  actions?: React.ReactNode;
}) {
  return (
    <header className="bg-header text-header-foreground">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 pt-4 pb-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl leading-tight font-bold text-balance">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-header-muted">{subtitle}</p>
          )}
        </div>
        {actions && <div className="shrink-0 pt-1">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * AppShell — กล่องเนื้อหาหลักของหน้า
 *
 * mobile-first: ความกว้างพื้นฐานคุมไว้ที่ขนาดมือถือ
 * หน้าศูนย์สั่งการ (wireframe 05) เป็นหน้าเดียวที่ออกแบบมาสำหรับจอกว้าง จึงใช้ width="wide"
 *
 * ตั้งใจไม่วาด BottomNav ไว้ในนี้ — layout ของกลุ่ม (app) เป็นเจ้าของแถบล่าง
 * ถ้าวาดที่นี่ด้วย แถบจะซ้อนกันสองอันทันทีที่หน้าไหนใช้ AppShell ซ้อนกัน
 */
export function AppShell({
  width = "mobile",
  className,
  children,
}: {
  width?: "mobile" | "wide";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full flex-1 px-4 py-5",
        width === "wide" ? "max-w-6xl" : "max-w-3xl",
        className,
      )}
    >
      {children}
    </main>
  );
}
