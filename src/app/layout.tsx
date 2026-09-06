import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/**
 * IBM Plex Sans Thai — ตัวอักษรไทยที่ไม่มีหัว ความสูง x สูง ช่องว่างในตัวอักษรกว้าง
 * อ่านออกเร็วบนจอมือถือกลางแดดและตอนมือสั่น ซึ่งเป็นสภาพใช้งานจริงของผู้ใช้
 * มีน้ำหนักครบและออกแบบมาคู่กับ IBM Plex Mono จึงผสมกันแล้วไม่ขัดตา
 */
const sans = IBM_Plex_Sans_Thai({
  variable: "--font-sans",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/**
 * ใช้เฉพาะที่ตัวเลขต้องเรียงตรงกันหรือคัดลอกไปพิมพ์ต่อ
 * เช่น case_code, สัญญาณชีพ, เวลา และพิกัด
 */
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MedRelay — ระบบส่งกลับสายแพทย์",
    template: "%s · MedRelay",
  },
  description:
    "ระบบส่งกลับสายแพทย์ ส่งต่อข้อมูลประเมินแรกรับให้เดินไปกับผู้ป่วยครบทุกทอด",
  applicationName: "MedRelay",
  formatDetection: {
    // กันไม่ให้ iOS แปลงเลขเคสหรือเลขประจำตัวเป็นลิงก์โทรออกเอง
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // ต้องยังซูมได้ ผู้ใช้บางคนสายตายาว การล็อกซูมเป็นการลดการเข้าถึง
  maximumScale: 5,
  themeColor: "#10281c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
