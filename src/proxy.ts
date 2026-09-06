import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * proxy.ts — เดิมคือ middleware.ts
 *
 * ⚠ Next.js 16 เปลี่ยนชื่อ convention นี้จาก `middleware` เป็น `proxy` แล้ว
 *   ไฟล์ `middleware.ts` ยัง deprecated อยู่ ห้ามสร้างขึ้นมาใหม่
 *   ดู node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 *   proxy รันบน Node.js runtime เสมอ และตั้ง `runtime` เองไม่ได้ (จะ throw)
 *
 * หน้าที่สองอย่าง
 *   1. ต่ออายุ session ของ Supabase ทุกคำขอ
 *      ถ้าไม่ทำ access token จะหมดอายุระหว่างที่ผู้ใช้เปิดหน้าค้างไว้
 *      แล้ว Server Component จะอ่าน auth.uid() ไม่ได้ RLS จะปฏิเสธทุก query
 *      หน้าจอจะว่างเปล่าโดยไม่มี error — อาการที่ debug ยากที่สุดของ Supabase + Next
 *   2. กันคนที่ยังไม่ล็อกอินออกจากหน้าที่ต้องล็อกอิน
 *
 * ⚠ ข้อ 2 เป็นเรื่อง UX ไม่ใช่ความปลอดภัย
 *   ความปลอดภัยจริงอยู่ที่ RLS ใน migration 0010 ซึ่งบังคับที่ชั้น database
 *   ต่อให้ใครข้าม proxy นี้ไปได้ query ก็ยังคืนศูนย์แถวอยู่ดี
 */

/** เส้นทางที่เปิดให้เข้าได้โดยไม่ต้องล็อกอิน */
const PUBLIC_PATHS = [
  "/login",
  "/auth", // callback ของ Supabase ในอนาคต
  "/design", // style guide ของ Prompt 02 ไม่มีข้อมูลผู้ป่วย
];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // ต้องเขียนลงทั้ง request และ response
          // request  — ให้โค้ดที่รันต่อจากนี้ในคำขอเดียวกันเห็น token ใหม่
          // response — ให้ browser เก็บ token ใหม่ไว้ใช้คำขอถัดไป
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // ต้องเป็น getUser() ไม่ใช่ getSession()
  // getSession() อ่านจาก cookie ตรงๆ โดยไม่ตรวจลายเซ็น ปลอมได้
  // getUser() ยิงไปถาม Supabase จริงและเป็นตัวที่ทำให้ token ถูกต่ออายุ
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // จำหน้าที่ตั้งใจจะไปไว้ เพื่อพากลับไปหลังล็อกอินสำเร็จ
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  /**
   * ถ้าไม่ใส่ matcher proxy จะรันกับ "ทุก" คำขอ รวมถึงไฟล์ static และรูปภาพ
   * ซึ่งจะทำให้ CSS และ JS ถูก redirect ไปหน้า login จนหน้าเว็บพัง
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
