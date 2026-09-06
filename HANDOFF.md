# HANDOFF.md — สถานะโครงการและวิธีทำงานต่อ

> **อัปเดตล่าสุด 6 ก.ย. 2569** · เขียนไว้ให้ session ถัดไป (ไม่ว่าจะเป็นคนหรือ AI) อ่านก่อนเริ่มงาน
> เส้นตายส่ง Working Prototype **13 ก.ย. 2569 — เหลือ 7 วัน**

---

## 1. อ่านอะไรก่อน

| ลำดับ | ไฟล์ | เพราะอะไร |
|---|---|---|
| 1 | ไฟล์นี้ | สถานะปัจจุบันและสิ่งที่ต้องทำต่อ |
| 2 | [AI_RULES.md](./AI_RULES.md) | ข้อห้ามที่ละเมิดไม่ได้ — อ่านก่อนเขียนโค้ดบรรทัดแรก |
| 3 | [PROJECT.md](./PROJECT.md) | ปัญหา ผู้ใช้ ฟีเจอร์ ผลลัพธ์ |
| 4 | [supabase/README.md](./supabase/README.md) | ฐานข้อมูลและวิธีทดสอบ |
| 5 | [docs/CLAUDE-PROMPTS.md](./docs/CLAUDE-PROMPTS.md) | แผน 10 ขั้นของทั้งโครงการ |

---

## 2. เสร็จแล้ว — Prompt 01–07 ครบ

### โครงการ Next.js
Next.js 16.3.4 (App Router, Turbopack) · React 19.2.8 · Tailwind 4 · TypeScript
dependency: `@supabase/supabase-js` `@supabase/ssr` `zod` `date-fns` · shadcn/ui (style `radix-nova`)
`npm run build` · `npm run typecheck` · `npm run lint` **ผ่านทั้งหมด**

ตรวจแล้วด้วยว่า `grep -r 'sb_secret_' .next/static` **ไม่พบ** — secret key ไม่หลุดลง bundle ที่ส่งให้ browser

### Design system (Prompt 02)

เปิดดูของจริงได้ที่ **`/design`** — หน้ารวม component ทั้งหมดไว้ตรวจด้วยตาในที่เดียว

| ไฟล์ | หน้าที่ |
|---|---|
| `src/app/globals.css` | design token ทั้งหมด · จานสีตรวจด้วยสูตร WCAG แล้ว |
| `src/lib/enums.ts` | union type ของ enum ใน `0001_enums.sql` (ไม่ใช่ type ของตาราง) |
| `src/lib/triage.ts` | สเกลสีเดียวของทั้งระบบ + การแปลง precedence → สี triage |
| `src/lib/nav.ts` | นิยาม 4 tab และ `visibleTabs()` |
| `src/components/medrelay/triage-dot.tsx` | `TriageDot` · `TriageChip` |
| `src/components/medrelay/precedence-badge.tsx` | `PrecedenceBadge` |
| `src/components/medrelay/relative-time.tsx` | `RelativeTime` · `formatElapsed` · `formatAgo` |
| `src/components/medrelay/bottom-nav.tsx` | `BottomNav` |
| `src/components/medrelay/app-shell.tsx` | `AppShell` · `AppHeader` |

**การตัดสินใจ 3 ข้อที่เจ้าของโครงการชี้ขาดไว้ (5 ก.ย. 2569)**

1. **bottom nav ใช้ชื่อบทบาทเป็นป้าย** — Sender / Transporter / Receiver / Monitor ตาม wireframe
   ตรงกับ enum `app_role` หนึ่งต่อหนึ่ง · คำอธิบายไทยอยู่ใน `aria-label` และ `title`
2. **ใช้ภาษาสีชุดเดียวทั้งระบบ** — precedence แปลงเป็นสี triage
   `urgent → แดง · priority → เหลือง · routine → เขียว` ส่วนดำ (เกินเยียวยา) มีเฉพาะฝั่ง triage
   แยกสองค่านี้ออกจากกันด้วย **รูปทรง** ไม่ใช่สี — TriageDot เป็นรูปทรงเรขาคณิต PrecedenceBadge เป็นแคปซูลมีข้อความ
3. **ยึด AI_RULES §3.1 เรื่องข้อมูลผู้ป่วย** — ใช้ `case_code` + `patient_alias` เท่านั้น
   ไม่ทำช่องชื่อจริง หมู่เลือด แพ้ยา หรือเลขอาวุธ ที่ wireframe 02–05 วาดไว้

**จานสี — ตรวจแล้ว ไม่ได้กะด้วยตา**

| | สีพื้น | ตัวอักษร | contrast | ความสว่าง |
|---|---|---|---|---|
| ดำ | `#16181a` | ขาว | 17.8 | 0.009 |
| แดง | `#a81c18` | ขาว | 7.38 | 0.092 |
| เขียว | `#168838` | ขาว | 4.55 | 0.181 |
| เหลือง | `#e8a317` | `#231a00` | 7.94 | 0.434 |

เหลืองเป็นสีเดียวที่ต้องใช้ **ตัวอักษรสีเข้ม** — ตัวอักษรขาวบนพื้นเหลืองได้แค่ 2.2:1 ตกเกณฑ์ AA
และพื้นเหลืองต่างจากการ์ดสีขาวแค่ 2.2:1 จึงต้องมีขอบ `#8a5d00` กำกับเสมอ **อย่าถอดขอบออก**

คู่สีที่ติดกันในสเกลห่างกันอย่างน้อย 1.63:1 จึงยังแยกออกในภาพขาวดำ
และยังมีรูปทรงกับตัวอักษรกำกับซ้ำอีกสองชั้น — `/design` หัวข้อ 6 บังคับให้เป็นเฉดเทาไว้ทดสอบ

**ไม่มี dark mode โดยเจตนา** ผู้ใช้ทำงานกลางแดด พื้นสว่างอ่านง่ายกว่า
ถ้าจะทำโหมดกลางคืน ให้ทำเป็นโหมดสีแดงแยก ไม่ใช่ dark mode ทั่วไป

**ตัวอักษร** IBM Plex Sans Thai (400/500/600/700) + IBM Plex Mono สำหรับ `case_code` สัญญาณชีพ เวลา และพิกัด

### Authentication (Prompt 06)

| ไฟล์ | หน้าที่ |
|---|---|
| `src/proxy.ts` | ต่ออายุ session + กันคนที่ยังไม่ล็อกอิน |
| `src/app/(auth)/login/actions.ts` | Server Action `login` และ `logout` |
| `src/app/(auth)/login/login-form.tsx` | ฟอร์ม (client) |
| `src/lib/auth/rate-limit.ts` | ตัวนับกันไล่เดาเลขทหาร |
| `src/lib/auth/profile.ts` | `getProfile()` ฝั่ง server ห่อด้วย `cache()` |
| `src/hooks/use-profile.ts` | `useProfile()` · `useHasRole()` |
| `src/components/medrelay/role-gate.tsx` | `RoleGate` |
| `src/app/(app)/layout.tsx` | เช็ค profile + ProfileProvider + BottomNav |

**⚠ Next.js 16 เปลี่ยนชื่อ `middleware.ts` เป็น `proxy.ts` แล้ว**
export ต้องชื่อ `proxy` และตั้ง `runtime` เองไม่ได้ (จะ throw) — **ห้ามสร้าง `middleware.ts` ขึ้นมาใหม่**

**ช่องทางล็อกอินตอนนี้คือรหัสผ่าน ไม่ใช่ OTP** (เจ้าของโครงการตัดสินใจ 6 ก.ย. 2569)
โครงสร้างอื่นทำตามสเปค Prompt 06 ครบ — กรอกเลขทหาร 10 หลัก · แปลงเป็นบัญชีฝั่ง server
· ข้อความผิดพลาดกลางๆ กัน enumerate · rate limit สองชั้น
จะเปลี่ยนเป็น phone OTP ทีหลังก็แก้แค่บรรทัด `signInWithPassword` ใน `actions.ts`
แต่ต้องต่อ SMS provider และเติม `profile.phone` ให้ครบก่อน

**ทดสอบ login จริงผ่านครบแล้ว 6 ก.ย. 2569**
- ล็อกอินสำเร็จด้วยเลขประจำตัวทหาร + รหัสผ่าน
- `visibleTabs()` ซ่อน tab ถูกต้องตามบทบาทจริง (9900000001 เห็น 3 tab · 9900000004 เห็น Monitor อย่างเดียว)
- กรอกเลขที่ไม่มีในระบบ ได้ข้อความเดียวกับกรอกรหัสผิดเป๊ะๆ — กัน enumerate ได้จริง

รหัสผ่านของ 4 บัญชีตั้งด้วย `supabase/scripts/set-demo-passwords.mjs`
ถ้าลืมรหัส ให้รันสคริปต์นั้นใหม่ ตั้งใหม่ได้ทันที

**สองจุดที่กันไว้แล้ว อย่าถอดออก**
- `safeNext()` ใน `actions.ts` กัน open redirect ที่พารามิเตอร์ `?next=`
- เมื่อไม่พบเลขทหาร ยังต้องยิง `signInWithPassword` ด้วยอีเมลปลอม
  ไม่งั้นผู้โจมตีจับเวลาตอบกลับแล้วแยกออกว่าเลขไหนมีอยู่จริง ทั้งที่ข้อความเหมือนกัน

### ฐานข้อมูลบน Supabase

migration `0001`–`0015` รันบนโปรเจกต์จริงเรียบร้อย (`0015` + seed จุดรับ รันเมื่อ 6 ก.ย. 2569)

| | บน Supabase จริง | ในเครื่อง (PGlite) |
|---|---|---|
| migration | 0001–0015 | 0001–0015 |
| ตาราง | 11 | 11 |
| ผลทดสอบ | **36/36 PASS** (`form_test.sql`) | 11 + 14 + 36 = **61/61 PASS** |

ของจริงกับในเครื่องตรงกันแล้ว ไม่มีส่วนต่างค้างอยู่

ข้อมูลจำลอง หน่วย 6 · รถ 5 · ผู้ใช้ 4 · เคส 11 · PostgreSQL 17 (รองรับ `security_invoker`)
`assessment` `treatment` `event_log` ไม่มี policy DELETE โดยเจตนา

`form_test.sql` ข้อ S5/S6 ยืนยันแล้วว่าสิทธิ์ระดับคอลัมน์ของ `treatment` ทำงานบน Supabase จริง
ไม่ใช่แค่บน PGlite — `authenticated` แก้ `dose` ไม่ได้ แต่ยังปิด `tourniquet_off` ได้

### migration 0012–0014 — schema จากแบบฟอร์มกระดาษ (6 ก.ย. 2569)

ถอดจากเอกสารต้นฉบับใน `supabase/Report/` — ทบ.466-900 ถึง 466-904 และ `field_casualty_db_schema.pdf`

| ไฟล์ | เพิ่มอะไร |
|---|---|
| `0012_form_enums.sql` | enum 10 ตัว: `report_category` `rank_group` `case_outcome` `disposition_route` `avpu_level` `transport_mode` `patient_mobility` `security_status` `nbc_status` `tx_code` |
| `0013_form_fields.sql` | คอลัมน์ใน `case` 22 ช่อง · `transfer_leg` 4 ช่อง · `assessment` 1 ช่อง · `unit` 2 ช่อง · trigger `case_form_timestamps` · แก้ policy `case_update` |
| `0014_treatment_property.sql` | ตาราง `treatment` และ `property_item` พร้อม RLS ครบ |

**สามจุดที่ต้องรู้ก่อนแก้ไฟล์เหล่านี้**

1. **`treatment` แก้ไม่ได้ ยกเว้นเวลาคลายสายรัด** — กันสองชั้น
   ชั้นแถวคือ policy `treatment_release` ชั้นคอลัมน์คือ `grant update (tourniquet_off, released_by)`
   **ถ้าลบบรรทัด `revoke update ... from authenticated` ออก ผู้ใช้จะแก้ `dose` ของเวชระเบียนได้ทันที**
   ข้อ I4 ใน `form_test.sql` จับเรื่องนี้โดยเฉพาะ
2. **`property_item` แก้ได้โดยเจตนา** ต่างจาก `treatment` เพราะบัญชีสิ่งของไม่ใช่เวชระเบียน
   นับผิดต้องแก้ให้ตรงของจริงได้ ไม่งั้นผู้ใช้จะเลี่ยงไปจดกระดาษ
3. **`disposed_at` และ `approved_at` เขียนทับค่าจาก client เสมอ** ไม่ใช่แค่ตอนค่าเดิมเป็น null
   เหตุผลเดียวกับ Prompt 04 ทั้งข้อ — ถ้า client ยัดเวลาได้ ตัวเลขบนแดชบอร์ดจะเชื่อไม่ได้

**สิ่งที่ตั้งใจไม่ทำ**
ตาราง `PERSONNEL` (ชื่อจริง หมู่เลือด แพ้ยา) — ขัด AI_RULES §3.1 โดยตรง
ตาราง `DEATH_RECORD` (ทบ.466-904 ใบชันสูตรพลิกศพ) — เป็นเอกสารที่มีผลทางกฎหมาย
ต้องผ่านนายทหารพระธรรมนูญก่อน เฟสนี้บันทึกแค่ `outcome = 'died'`

### Prompt 07 — เสร็จแล้วทั้งฐานข้อมูลและ UI (6 ก.ย. 2569)

| ไฟล์ | สถานะ |
|---|---|
| `migrations/0015_evac_request.sql` | ✅ รันบน Supabase จริงแล้ว |
| `seed_pickup_points.sql` | ✅ รันแล้ว — จุดนัดรับจำลอง 8 จุด |
| `tests/form_test.sql` หมวด L | ✅ 8 ข้อ · **36/36 PASS บนของจริง** |
| `src/app/(app)/sender/schema.ts` | ✅ กติกา zod ใช้ร่วมกันทั้ง client และ server |
| `src/app/(app)/sender/actions.ts` | ✅ Server Action ยิง RPC ครั้งเดียว |
| `src/app/(app)/sender/sender-form.tsx` | ✅ ฟอร์ม 4 ก้อน เรียงตามลำดับที่ผู้ใช้คิดจริง |
| `src/app/(app)/sender/page.tsx` | ✅ ดึงหน่วยปลายทางและจุดรับฝั่ง server |
| `src/app/(app)/track/[caseId]/page.tsx` | ⚠️ **ฉบับย่อ** — มีไว้ให้ redirect หลังส่งไม่ตกหน้า 404 · F3 ตัวเต็มอยู่ใน Prompt 08 |

**ตรวจจริงแล้วด้วย session ของ `demo.sender` บนฐานข้อมูลจริง** (สร้างเคสแล้วลบทิ้ง)

- กดครั้งเดียวได้ `case` 1 + `transfer_leg` 1 (`pending`, `leg_no=1`) + `assessment` 1 (`initial`) ✅
- `requested_at` ตั้งโดยฐานข้อมูล ไม่ใช่ client ✅ · `is_synthetic = true` ✅
- `pickup_grid` คัดลอกจากจุดที่เลือก (`QA 000 000`) ไม่ได้มาจาก GPS ✅
- ยิงซ้ำด้วย `client_uuid` เดิม → ถูกปฏิเสธด้วย `23505` ไม่เกิดเคสซ้ำ ✅
- หน้า `/sender` เรนเดอร์ครบ และ **ไม่มี** `geolocation` · `h-touch` · ช่องชื่อจริง ในผลลัพธ์ ✅

**สามจุดที่ต้องรู้ก่อนแก้หน้านี้**

1. **กันส่งซ้ำด้วย `client_uuid` ไม่ใช่ด้วยการ disable ปุ่ม**
   ฟอร์มสร้าง uuid ครั้งเดียวตอนเปิดหน้า แล้วคงค่าเดิมไว้แม้ submit ไม่ผ่าน
   ตาราง `case` มี `UNIQUE (client_uuid)` เมื่อเจอ `23505` แปลว่า "ส่งไปแล้ว" ไม่ใช่ error
   `actions.ts` จึงไปหาเคสเดิมแล้ว redirect ไปหน้านั้น — **อย่าเปลี่ยนเป็นแจ้ง error**
2. **เวลาที่เริ่มมีอาการแปลงเป็น ISO ที่ browser ไม่ใช่ที่ server**
   `datetime-local` ไม่มี timezone ติดมาด้วย ถ้าปล่อยให้ server แปลง
   มันจะตีความด้วย timezone ของ server (UTC บน Vercel) แล้วเวลาเพี้ยนไป 7 ชั่วโมง
3. **ใช้ `<select>` ธรรมดา ไม่ใช่ Select ของ shadcn**
   Select ของ shadcn เป็น Radix ซึ่งไม่ส่งค่าเข้า FormData เอง ต้องมี hidden input คอยตาม
   ในฟอร์มที่ใช้ Server Action ล้วนๆ การใช้ `<select>` จริงสั้นกว่าและพังยากกว่า

`0015` มีสองอย่าง

1. **ตาราง `pickup_point`** — จุดนัดรับที่กำหนดไว้ล่วงหน้า
   สเปคข้อ 1 ของ Prompt 07 บอกว่า "เลือกจากรายการ ไม่ใช้ GPS" และ AI_RULES §3.1 ห้ามเก็บพิกัดเรียลไทม์
   **อย่าต่อ Geolocation API เด็ดขาด** แม้ wireframe 01 จะเขียนว่า "บันทึกพิกัดอัตโนมัติแล้ว"
2. **function `create_evac_request()`** — เปิด case + transfer_leg + assessment ในหนึ่ง statement
   PostgREST ไม่มี API เปิด transaction คร่อมหลายคำขอ ถ้าให้เว็บยิง insert สามครั้งติดกัน
   แล้วเน็ตหลุดหลังครั้งแรก จะเหลือเคสที่ไม่มีทอดค้างในระบบ
   **เป็น `SECURITY INVOKER` ห้ามเปลี่ยนเป็น `DEFINER`** ไม่งั้นข้าม RLS ทั้งหมด (ข้อ L8 จับเรื่องนี้)

### auth user ทดสอบ 4 บัญชี — ตั้งรหัสผ่านแล้ว ล็อกอินได้จริง
`demo.sender@` · `demo.transporter@` · `demo.receiver@` · `demo.monitor@` — โดเมน `medrelay.invalid`
รหัสผ่านตั้งด้วย `supabase/scripts/set-demo-passwords.mjs` (ทั้ง 4 บัญชีใช้รหัสเดียวกัน)

---

## 3. ยังไม่ได้ทำ

| Prompt | งาน | ประมาณเวลา |
|---|---|---|
| **08** | F2 ศูนย์สั่งการ + F3 ติดตามสถานะ (ตัวเต็ม) | 6 ชม. |
| **09** | F4 แดชบอร์ด + F7 export | 4 ชม. |
| **10** | Deploy ขึ้น Vercel | 3 ชม. |

**ยังไม่ได้ deploy ขึ้น Vercel เลย** — ยังไม่มี live URL

### 🚩 ขั้นแรกที่ต้องทำเมื่อเปิดงานต่อ — **Deploy ขึ้น Vercel ก่อนเขียนฟีเจอร์เพิ่ม**

ตอนนี้ยังไม่มี live URL เลย ถ้ามีอะไรผิดพลาดในช่วงที่เหลือจะไม่มีอะไรส่งเลย
`/sender` ใช้งานได้จริงแล้ว จึง deploy ได้ทันที แล้วค่อยทยอย deploy ฟีเจอร์ที่เหลือตามไป

```bash
npm i -g vercel      # ยังไม่ได้ติดตั้งบนเครื่องนี้
```

| ตัวแปร | ขึ้นต้นด้วย `NEXT_PUBLIC_` ได้ไหม |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ ได้ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ ได้ (RLS คุมอีกชั้น) |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔴 **ห้ามเด็ดขาด** ข้ามทุก RLS |
| `DATABASE_PASSWORD` | 🔴 ไม่ต้องใส่บน Vercel ใช้เฉพาะเครื่องพัฒนา |

ต้องเพิ่ม production domain ใน Supabase → Authentication → URL Configuration
ไม่งั้นล็อกอินบน production จะเด้งกลับ localhost

**เกณฑ์ผ่าน:** เปิด live URL จากมือถือนอกเครือข่ายหน่วย ล็อกอินแล้วเปิดคำขอได้จริง

### ⏱ เวลาที่เหลือจริง — ต้องตัดฟีเจอร์แล้ว

ตารางใน `docs/CLAUDE-PROMPTS.md` ระบุเวลาที่มีจริงว่าคืนอังคาร/พฤหัส 20:00–22:00
บวกบ่ายอาทิตย์ 14:00–16:00 นับจาก 6 ก.ย. ถึงเส้นตาย 13 ก.ย. จึงเหลือราว **6–8 ชั่วโมง**
แต่งานที่เหลือตามตารางเดิม (08+09+10) รวม **13 ชั่วโมง**

ตารางนั้นเขียนกฎไว้เองว่า "ถ้าตกจากตารางนี้เกิน 1 ขั้น ให้ใช้ Prompt E3 ตัดฟีเจอร์ทันที"
— เงื่อนไขนั้นเข้าเกณฑ์แล้ว

**ลำดับที่แนะนำ**

| ลำดับ | งาน | เวลา |
|---|---|---|
| 1 | Deploy (ด้านบน) | ~1 ชม. |
| 2 | เติม `/track` ให้ครบวงจร + **ใส่ปุ่มจัดรถไว้ในหน้านี้ด้วย** | ~2 ชม. |
| 3 | `/dispatch` คิวคำขอ + กระดานรถ | ~1 ชม. |
| 4 | `/dashboard` การ์ดตัวเลข 4 ใบ | ~1 ชม. |
| 5 | README "รันระบบใน 5 นาที" + ซ้อม demo | ~1 ชม. |

ขั้น 2 สำคัญที่สุดรองจาก deploy เพราะ **เวลาทุกค่าที่โครงการนี้อ้างว่าวัดได้ เกิดจากปุ่มในหน้านั้น**
และถ้าใส่ปุ่มจัดรถไว้ด้วย จะเดิน `pending → completed` ครบวงจรได้จากหน้าเดียว
demo เล่าเรื่องได้ครบตั้งแต่ต้นทางถึงปลายทางโดยยังไม่ต้องมี `/dispatch`

**สิ่งที่ควรตัด**

| ตัดอะไร | ประหยัด | เหตุผล |
|---|---|---|
| Supabase Realtime ใน `/dispatch` | ~1.5 ชม. | ใช้ polling หรือปุ่มรีเฟรชแทน · realtime + fallback + reconnect พังง่ายที่สุดในสเปคทั้งหมด |
| seed 12 เคสใหม่ (Prompt 10 ข้อ 1) | ~1 ชม. | มีข้อมูลพอแล้ว ดูหัวข้อถัดไป |
| กราฟแท่ง 2 อันในแดชบอร์ด | ~45 นาที | การ์ดตัวเลขสื่อสารข้อพิสูจน์หลักได้ครบแล้ว |
| CSV export (F7) | ~1 ชม. | view พร้อมแล้ว หยิบมาทำท้ายสุดถ้าเหลือเวลา |

**ห้ามตัด** README "รันระบบใน 5 นาที" เพราะกรรมการใช้ตรงนั้นตัดสิน

### ✅ Prompt 09 เสร็จไปครึ่งหนึ่งแล้ว — view มีอยู่ครบ

ตรวจบนฐานข้อมูลจริงเมื่อ 6 ก.ย. 2569 พบว่า view ที่ Prompt 09 ข้อ 1 สั่งให้สร้าง **มีอยู่แล้วทั้งหมด**

| view | ใช้ทำอะไร |
|---|---|
| `v_leg_metrics` | `request_to_dispatch` · `dispatch_to_scene` · `scene_to_handover` · `leg_total` · `service_date` |
| `v_case_metrics` | ตัวเลขระดับเคส |
| `v_casualty_report` | ตรงกับคอลัมน์รายงานกระดาษที่ Prompt 09 ข้อ 3 ต้องการ |

และมีข้อมูลพอให้แดชบอร์ดมีตัวเลขจริงแล้ว — ทอดที่วัดได้ **12 ทอด** · **ไม่มีค่าเวลาติดลบเลย**
(เป็นเกณฑ์ "เช็คก่อนไปต่อ" ของ Prompt 09 พอดี)
มัธยฐานรอจัดรถ **8 นาที 30 วินาที** · มัธยฐานรวมต่อทอด **1 ชม. 6 นาที**

**Prompt 09 จึงเหลือแค่งาน UI** ลดจาก 4 ชม. เหลือราว 1.5 ชม. และไม่ต้อง seed ข้อมูลใหม่

⚠ ใช้ **median ไม่ใช่ mean** เพราะข้อมูลเวลาตอบสนองมี outlier เสมอ
และ empty state ต้องบอกตรงๆ ว่ายังไม่มีข้อมูล **ห้ามแสดงเลข 0** ที่ทำให้เข้าใจผิดว่าวัดแล้วได้ 0

### งานที่ไม่ใช่โค้ดแต่เร่งเองไม่ได้ — เริ่มคู่ขนานตั้งแต่วันนี้

1. **หนังสือถึงหน่วย** — PROJECT §9 ระบุว่าเป็นงานที่รอผู้อื่น
2. **ทาบทามผู้ทดสอบ 3–5 คน** สำหรับ UAT — ทาบทามได้ทันทีที่มี live URL

### สิ่งที่ต้องรู้ก่อนเขียน Prompt 08

- `/track/[caseId]` **มีอยู่แล้วแต่เป็นฉบับย่อ** — ต้องเติม timeline 6 timestamp ต่อทอด
  ปุ่มเปลี่ยนสถานะของ transporter รายการ assessment ทุกทอด และปุ่ม "ส่งทอดถัดไป"
- UI ต้องเดิน `status` ตามลำดับ ข้ามขั้นไม่ได้ — ดู §5 ข้อ 7
- **ห้ามใช้ `.insert().select()`** กับ `case` `transfer_leg` `assessment` `treatment` `property_item` — ดู §5 ข้อ 10
- component พร้อมใช้แล้ว: `TriageDot` `TriageChip` `PrecedenceBadge` `RelativeTime` `AppHeader` `AppShell` `RoleGate`
- ปุ่มใหญ่ใช้ `h-14` (56px) ปุ่มรองและช่องกรอกใช้ `h-12` (48px) — **ห้ามสร้าง token ชื่อ `h-touch` ใหม่** (ดู §5 ข้อ 8)
- ถ้าต้องมี `<select>` ให้ใช้ของ HTML จริง ไม่ใช่ Select ของ shadcn (เป็น Radix ไม่ส่งค่าเข้า FormData)

### คำสั่งที่ใช้บ่อย

ตั้งรหัสผ่านบัญชีทดสอบใหม่ (รายละเอียดบัญชีอยู่ใน §2)

```bash
node supabase/scripts/set-demo-passwords.mjs --dry-run   # ดูก่อนว่าจะแตะบัญชีไหน
node supabase/scripts/set-demo-passwords.mjs             # ตั้งจริง
```

**วิธีตรวจฐานข้อมูลจริงซ้ำเมื่อไรก็ได้** — ทั้งไฟล์อยู่ใน transaction ที่ปิดท้ายด้วย rollback
จึงไม่แก้ข้อมูลจริง ต้องได้ 36/36

```bash
node supabase/scripts/sql.mjs --no-tx supabase/tests/form_test.sql
```

## 4. เริ่มงานต่อ

```bash
cd ~/Desktop/Learning/MedExccme/Vibe_Project/Vibe_MedRelay
npm install          # ถ้า node_modules หาย
npm run dev          # http://localhost:3000
npm run db:test      # รัน migration + seed + test ทั้งหมดบน PGlite ในเครื่อง (61 ข้อ)
```

`.env.local` ตั้งค่าครบแล้วและใช้งานได้ — **ห้าม commit และห้ามวางค่าลงในแชทกับ AI**

---

## 5. ⚠️ สิบเอ็ดข้อที่จะเสียเวลาถ้าไม่รู้ล่วงหน้า

> ข้อ 10 เป็นข้อที่กินเวลามากที่สุด อ่านก่อนเขียน query ตัวแรก

**1. `node` ไม่อยู่ใน PATH ของ shell แบบ non-interactive**
Node v24.20.0 ติดตั้งผ่าน nvm ซึ่งโหลดจาก `~/.zshrc` สคริปต์อัตโนมัติจะมองไม่เห็น ใส่สองบรรทัดนี้ก่อน
```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
```
ไม่ใช่อาการผิดปกติ **อย่าติดตั้ง Node ซ้ำ**

**2. `npm run typecheck` จะ error ถ้ายังไม่เคย build**
`LayoutProps` เป็น type ที่ Next.js 16 generate ตอน build รัน `npm run build` ก่อนหนึ่งครั้ง

**3. Supabase มี event trigger `rls_auto_enable`**
มันเปิด RLS ให้ทุกตารางที่สร้างใหม่ใน `public` อัตโนมัติ ตรวจโค้ดแล้วปลอดภัย (เพิ่มการป้องกันอย่างเดียว) **ปล่อยไว้**
แต่มันทำให้ตารางพักผลในไฟล์ทดสอบถูกล็อกด้วย จึงมี `alter table ... disable row level security` กำกับไว้ — **ห้ามลบบรรทัดนั้น**

**4. PGlite ไม่ใช่ของแทน Supabase**
`npm run db:test` เร็วและจับ bug ได้เยอะ แต่ไม่มี `rls_auto_enable` และไม่มี Supabase Auth จริง
**ต้องรัน `rls_test.sql` บนโปรเจกต์จริงอีกรอบก่อน deploy เสมอ**

**5. ต่อ database ตรงได้แล้ว — ไม่ต้องวางใน SQL Editor อีก** (แก้เมื่อ 6 ก.ย. 2569)

ยังไม่มี `psql` และไม่มี Docker แต่ `.env.local` มี `DATABASE_PASSWORD` อยู่
จึงต่อผ่าน pooler ด้วย `pg` (devDependency) ได้เลย

```bash
node supabase/scripts/sql.mjs supabase/migrations/0016_xxx.sql   # ห่อ begin/commit ให้เอง
node supabase/scripts/sql.mjs --no-tx supabase/tests/form_test.sql  # ไฟล์ที่จัดการ transaction เอง
```

ค่าปริยายห่อทั้งไฟล์ด้วย `begin/commit` — PostgreSQL รองรับ transactional DDL
ถ้าพังกลางทางจะ rollback ทั้งก้อน ไม่มีตารางครึ่งๆ ค้าง
สคริปต์ต่อในฐานะ superuser `postgres` ซึ่ง **ข้ามทุก RLS policy** ใช้กับ migration และการตรวจสอบเท่านั้น
ต้องใช้ session mode (พอร์ต 5432) ไม่ใช่ transaction mode (6543) เพราะ DDL ต้องอยู่ใน session เดียว

วิธีเดิม (`pbcopy` แล้ววางใน SQL Editor) ยังใช้ได้ ถ้าอยากเห็นทุกคำสั่งก่อนรัน

**6. ใช้ API key แบบใหม่ของ Supabase**
`sb_publishable_...` และ `sb_secret_...` ไม่ใช่ legacy JWT (`eyJhbGciOi...`)
เหตุผลอยู่ใน [.env.example](./.env.example) — **อย่ากดปุ่ม “Disable JWT-based API keys”** ในหน้า Dashboard

**7. UI ต้องเดิน `status` ตามลำดับ**
constraint `leg_time_order` บังคับว่าขั้นถัดไปตั้งได้ต่อเมื่อขั้นก่อนหน้าถูกตั้งแล้ว
**ข้าม `pending → completed` ไม่ได้** database จะปฏิเสธ — เป็นพฤติกรรมที่ตั้งใจ ไม่ใช่ bug

**8. อย่าตั้งชื่อ spacing token เองแล้วเอาไปทับ class ของ shadcn**
`--spacing-touch` จะสร้างคลาส `h-touch` ซึ่งแพ็กเกจ `cn` ไม่รู้จัก
มันจึงไม่ตัด `h-8` ที่ติดมากับปุ่มทิ้ง แล้วปล่อยออกมาทั้งคู่
ผลจะไปขึ้นกับลำดับใน CSS ที่ Tailwind สร้าง วันที่ลำดับสลับ ปุ่มจะหดจาก 56px เหลือ 32px เงียบๆ
**ใช้ `h-12` (48px) กับ `h-14` (56px) เท่านั้น** เคยพลาดมาแล้วตอน Prompt 06
(component ของ shadcn ทั้ง 10 ตัว import `cn` จาก `"cn"` ตรงๆ ไม่ผ่าน `@/lib/utils`
การไปตั้งค่า `cn` ใน `utils.ts` จึงไม่ช่วยอะไร และ `npx shadcn add` ครั้งหน้าจะเขียนทับกลับด้วย)

**9. `npm run build` ค้างที่ error ของไฟล์ที่ลบไปแล้ว**
Next 16 สร้าง type validator ไว้ใน `.next/dev/types` ถ้าลบหรือย้ายไฟล์ route
validator เก่าจะยังอ้างถึงไฟล์เดิมแล้ว build ล้ม แก้ด้วย `rm -rf .next` แล้ว build ใหม่

**10. 🔴 `INSERT ... RETURNING` ใช้กับ `case` และ `transfer_leg` ไม่ได้**

นี่คือกับดักที่ทำให้เสียเวลามากที่สุดในโครงการนี้ เพราะ error ชี้ผิดที่อย่างสิ้นเชิง

```
new row violates row-level security policy for table "case"
```

อ่านแล้วจะนึกว่า policy ฝั่ง INSERT ผิด **แต่ policy ไม่ได้ผิดอะไรเลย** สาเหตุจริงคือ

`RETURNING` บังคับให้ Postgres เอา policy ฝั่ง **SELECT** มาตรวจแถวที่เพิ่งสร้างด้วย
policy `case_select` เรียก `can_see_case()` ซึ่งประกาศเป็น `stable` และไปอ่านตาราง `case` เอง
ฟังก์ชัน `stable` มองข้อมูลด้วย snapshot ณ ตอนเริ่มคำสั่ง
จึง **มองไม่เห็นแถวที่คำสั่งเดียวกันนั้นเพิ่งสร้าง** แล้วตอบว่าไม่มีสิทธิ์

**กระทบฝั่งเว็บโดยตรง** — `.insert().select()` ของ supabase-js คือ `INSERT ... RETURNING` เป๊ะๆ

```ts
// ❌ ล้มเสมอ
await supabase.from("case").insert(row).select().single()

// ✅ สร้าง id เองก่อน แล้วอ่านทีหลังเป็นคนละคำสั่ง
const id = crypto.randomUUID()
await supabase.from("case").insert({ id, ...row })
await supabase.from("case").select("case_code").eq("id", id).single()
```

`create_evac_request()` ใน `0015` แก้ด้วยวิธีนี้แล้ว ดูคอมเมนต์ในไฟล์
ตารางอื่นที่ policy SELECT เรียก `can_see_case()` ก็เจอปัญหาเดียวกัน —
`case` · `transfer_leg` · `assessment` · `treatment` · `property_item`

**อีกสองอย่างที่หลงทางง่ายในเรื่องเดียวกัน**
- `returns table (…, case_code, …)` ทำให้ `case_code` เป็นชื่อตัวแปรของ plpgsql
  เขียน `select case_code into …` จะได้ error `column reference is ambiguous`
  ต้อง alias ตารางแล้วเขียน `c.case_code`
- แต่ถ้าเลี่ยงด้วยการ qualify เต็มเป็น `public."case".case_code` Postgres จะตีความว่า
  อ้างถึงทั้งตาราง แล้วเด้ง error RLS อันเดิมกลับมาอีก

**11. `gen types --db-url` ต้องใช้ Docker ทุกเวอร์ชัน — ใช้ Personal Access Token แทน**

ลองมาแล้วทั้ง CLI `1.226.4` · `2.48.3` · `2.116.0` · `latest` ทุกตัวตอบเหมือนกันว่า
`Cannot connect to the Docker daemon` เพราะ `--db-url` ถูกย้ายไปรันใน container
**การต่อฐานข้อมูลตรงได้ (ข้อ 5) ไม่ได้ทำให้ข้อนี้หายไป** — คนละเส้นทางกัน

ใช้ `supabase/scripts/gen-types.mjs` แทน มันเรียก Management API ซึ่งเป็น endpoint เดียวกับ
ที่ CLI ใช้ตอน `--project-id` และไม่แตะ Docker เลย สคริปต์ถาม token เองแบบไม่แสดงบนจอ

```bash
node supabase/scripts/gen-types.mjs
```

สคริปต์เช็คให้ด้วยว่า type ที่ได้มามี `pickup_point` และ `create_evac_request` จริง
ถ้าไม่มีแปลว่ากำลังดึงจากโปรเจกต์ที่ยังไม่ได้รัน `0015`

---

## 6. จุดที่เขียนต่างจาก DATABASE.md โดยเจตนา

`DATABASE.md` เป็น spec ที่เขียนก่อนลงมือ ส่วน `supabase/migrations/` คือของจริงที่ผ่านการทดสอบ
**เมื่อสองไฟล์ขัดกัน ให้เชื่อ migration** ตารางเทียบทั้ง 4 จุดอยู่ใน [supabase/README.md](./supabase/README.md)

จุดที่สำคัญที่สุด: `leg_time_order` ฉบับใน spec เขียน `handover_at >= arrived_at`
ซึ่งให้ผล `NULL` เมื่อ `arrived_at` เป็น null และ CHECK ถือว่า NULL คือผ่าน
ผลคือใส่เวลาส่งมอบผู้ป่วยที่ยังไม่เคยไปถึงได้ — ฉบับใน migration แก้แล้ว

---

## 7. 🔴 ไฟล์ที่มีข้อมูลจริง — ห้าม commit

ตรวจเมื่อ 6 ก.ย. 2569 ตอนศึกษาเอกสารใน `supabase/Report/`

| โฟลเดอร์ | พบอะไร |
|---|---|
| `supabase/Report/6_รายงานหน่วยเหนือ_*.jpg` | **เอกสารราชการที่มีข้อมูลกำลังพลจริงรายบุคคล และข้อมูลที่ตั้งหน่วย** — ตรวจแล้วเมื่อ 6 ก.ย. 2569 · รายละเอียดไม่บันทึกไว้ที่นี่โดยเจตนา เพราะ repo นี้เป็นสาธารณะ |
| `WireframeV3/*.png` | ใช้ชื่อผู้บาดเจ็บ **จากรายงานชุดเดียวกัน** เป็นข้อมูลตัวอย่างในภาพ — ตอบคำถามที่ค้างไว้แล้วว่าไม่ใช่ชื่อสมมติ |
| `Image 5-9-26 at 23.07.png` | ภาพหน้าจอที่ยังไม่ได้ตรวจ |

**สถานะ:** ทั้งสามรายการถูกใส่ใน `.gitignore` แล้ว และตรวจ `git log` ยืนยันว่า **ไม่เคยถูก commit เลย** ประวัติสะอาด

**สิ่งที่ยังต้องทำ:** `.gitignore` เป็นแค่ตาข่ายกันพลาด ไม่ใช่ทางแก้
ควรย้าย `supabase/Report/` และ `WireframeV3/` ออกไปเก็บนอก repo แล้วอ้างถึงด้วย path
ตาม [AI_RULES.md §3.3](./AI_RULES.md) ข้อมูลจริงต้องผ่านการอนุมัติ 5 ข้อก่อนเข้าระบบ ซึ่งยังไม่มีสักข้อ

ไฟล์ PDF แบบฟอร์ม (ทบ.466-900 ถึง 904) และ `field_casualty_db_schema.pdf` เป็นแบบฟอร์มเปล่า
ไม่มีข้อมูลบุคคล ปลอดภัยที่จะ commit ถ้าต้องการ — แต่ตอนนี้ถูก ignore ไปพร้อมทั้งโฟลเดอร์

### AGENTS.md และ CLAUDE.md

เกิดจาก Next.js 16 สร้างเอง commit ลง repo แล้วเพื่อให้ tree สะอาด
ถ้าไม่ต้องการ ปิดได้ด้วย `agentRules: false` ใน `next.config.ts`

### ช่องว่างระหว่าง wireframe กับ schema — ปิดแล้ว

migration `0012`–`0014` เติมช่องที่ขาดครบแล้ว (ดู §2) เหลือจุดเดียวที่ตั้งใจไม่ทำคือ
ช่องชื่อจริง หมู่เลือด แพ้ยา และประวัติโรคประจำตัวของผู้ป่วย ตาม [AI_RULES §3.1](./AI_RULES.md)
**เวลาลอก layout จาก wireframe ให้ข้ามการ์ด "ผู้ป่วย personnel" ไป** ใช้ `case_code` + `patient_alias` แทน

จุดที่ wireframe ทำผิดกฎอีกข้อ: หน้าที่ 1 แสดงข้อความว่าระบบบันทึกพิกัดของผู้ใช้อัตโนมัติ
พร้อมพิกัดตัวอย่างที่เป็นตำแหน่งจริง (ไม่คัดลอกมาไว้ที่นี่ ดูในไฟล์ wireframe เอง)
AI_RULES §3.1 ห้ามเก็บพิกัด GPS เรียลไทม์ — `pickup_grid` ใน 0013 จึงออกแบบให้**เลือกจากจุดที่กำหนดไว้
หรือกรอกเอง** ห้ามต่อกับ Geolocation API

---

## 8. ลิงก์และทรัพยากร

| | |
|---|---|
| GitHub | `git@github.com:Aim-suvamatha/Vibe_MedRelay.git` (SSH key ตั้งค่าแล้ว push ได้เลย) |
| Supabase project ref | `ackjphisdfxqyonfsgwc` (region Singapore) |
| แผนผังฐานข้อมูล (หน้าเว็บ) | https://claude.ai/code/artifact/545587b4-72be-4ade-a6f4-7d9cc3685c41 |
| Vercel | **ยังไม่ได้ deploy** |

---

## 9. ความเสี่ยงที่ต้องเฝ้าระวัง

| ความเสี่ยง | สัญญาณ | การรับมือ |
|---|---|---|
| **เวลาเหลือน้อยกว่างานที่วางไว้เกินเท่าตัว** | เหลือ ~6–8 ชม. แต่งานตามตารางเดิม 13 ชม. | 🔴 **เป็นจริงแล้ว** — ตัดฟีเจอร์ตาม §3 ทันที อย่ารอ |
| **ยังไม่ได้ deploy** | ไม่มี live URL ให้ผู้ทดสอบและกรรมการ | 🔴 **เป็นจริงแล้ว** — `/sender` ใช้งานได้จริงแล้ว deploy ได้ทันที เป็นงานลำดับแรกใน §3 |
| ยังไม่ได้เริ่มบันทึกข้อความถึงหน่วย | [PROJECT.md §9](./PROJECT.md) ระบุว่าเป็นงานที่รอผู้อื่น เร่งเองไม่ได้ | เริ่มเดินเรื่องคู่ขนานไปกับการพัฒนา |
| ยังไม่มีผู้ทดสอบ 3–5 คน | ต้องใช้ในช่วง UAT | ทาบทามล่วงหน้า อย่ารอจนระบบเสร็จ |
