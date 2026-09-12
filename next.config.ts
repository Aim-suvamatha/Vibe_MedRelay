import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * exceljs ใช้สร้างรายงานสรุปกำลังพลบาดเจ็บ (F7) ใน Route Handler เท่านั้น
   * แพ็กเกจนี้มี browser build แยก (dist/exceljs.min.js) และลาก dependency ของ Node
   * อย่าง archiver/unzipper เข้ามา ให้ Node require ตรงๆ ปลอดภัยกว่าให้ bundler แยกเอง
   */
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
