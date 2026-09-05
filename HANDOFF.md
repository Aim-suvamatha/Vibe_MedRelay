# HANDOFF.md — สถานะโครงการและวิธีทำงานต่อ

> **อัปเดตล่าสุด 5 ก.ย. 2569** · เขียนไว้ให้ session ถัดไป (ไม่ว่าจะเป็นคนหรือ AI) อ่านก่อนเริ่มงาน
> เส้นตายส่ง Working Prototype **13 ก.ย. 2569 — เหลือ 8 วัน**

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

## 2. เสร็จแล้ว — Prompt 01, 03, 04, 05

### โครงการ Next.js
Next.js 16.3.4 (App Router, Turbopack) · React 19.2.8 · Tailwind 4 · TypeScript
dependency: `@supabase/supabase-js` `@supabase/ssr` `zod` `date-fns`
`npm run build` · `npm run typecheck` · `npm run lint` **ผ่านทั้งหมด**

ตรวจแล้วด้วยว่า `grep -r 'sb_secret_' .next/static` **ไม่พบ** — secret key ไม่หลุดลง bundle ที่ส่งให้ browser

### ฐานข้อมูลบน Supabase — ใช้งานได้จริงแล้ว
migration `0001`–`0011` รันบนโปรเจกต์จริงเรียบร้อย พร้อมข้อมูลจำลอง

| | |
|---|---|
| ตาราง | 8 · เปิด RLS ครบทุกตาราง |
| คอลัมน์ | 91 |
| policy | 18 · `assessment` และ `event_log` ไม่มี policy UPDATE/DELETE โดยเจตนา |
| enum / view / trigger / function | 9 / 3 / 7 / 12 |
| PostgreSQL | 17 (รองรับ `security_invoker`) |
| ข้อมูลจำลอง | หน่วย 6 · รถ 5 · ผู้ใช้ 4 · เคส 11 (completed 9 · active 1 · requested 1) |

**ผลทดสอบบน Supabase จริง — `rls_test.sql` 11/11 · `trigger_test.sql` 14/14 PASS**

### auth user ทดสอบ 4 บัญชี (สร้างแล้ว ไม่ได้ตั้งรหัสผ่าน)
`demo.sender@` · `demo.transporter@` · `demo.receiver@` · `demo.monitor@` — โดเมน `medrelay.invalid`
ตั้งรหัสผ่านได้ที่ Dashboard → Authentication ถ้าต้องทดสอบ UI ด้วยมือ

---

## 3. ยังไม่ได้ทำ

| Prompt | งาน | ประมาณเวลา |
|---|---|---|
| **02** | Design system — bottom nav 4 tab, `PrecedenceBadge`, `TriageDot`, `RelativeTime` | 2 ชม. |
| **06** | Authentication — login, middleware, `useProfile`, `RoleGate` | 3 ชม. |
| **07** | F1 หน้าขอส่งกลับ (Sender) | 4 ชม. |
| **08** | F2 ศูนย์สั่งการ + F3 ติดตามสถานะ | 6 ชม. |
| **09** | F4 แดชบอร์ด + F7 export | 4 ชม. |
| **10** | Deploy ขึ้น Vercel | 3 ชม. |

**ยังไม่ได้ deploy ขึ้น Vercel เลย** — ยังไม่มี live URL

### ลำดับที่แนะนำ
เริ่ม **02 ก่อน** แล้วค่อย 06 — component พื้นฐานจะทำให้หน้า login เขียนง่ายขึ้น
ถ้าเวลาไม่พอ ให้ใช้ Prompt E3 ตัด **F3** ออกก่อนตามที่ [PROJECT.md §9](./PROJECT.md) วางแผนไว้

---

## 4. เริ่มงานต่อ

```bash
cd ~/Desktop/Learning/MedExccme/Vibe_Project/Vibe_MedRelay
npm install          # ถ้า node_modules หาย
npm run dev          # http://localhost:3000
npm run db:test      # รัน migration + seed + test ทั้งหมดบน PGlite ในเครื่อง (25 ข้อ)
```

`.env.local` ตั้งค่าครบแล้วและใช้งานได้ — **ห้าม commit และห้ามวางค่าลงในแชทกับ AI**

---

## 5. ⚠️ เจ็ดข้อที่จะเสียเวลาถ้าไม่รู้ล่วงหน้า

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

**5. ไม่มีทางเชื่อมต่อ database ตรงจากเครื่องนี้**
ไม่มี `psql` ไม่มี Docker และไม่มีรหัสผ่าน database ใน `.env.local`
วิธีที่ใช้ได้ผลคือส่ง SQL เข้าคลิปบอร์ดแล้วให้ผู้ใช้วางใน SQL Editor
```bash
{ echo "begin;"; cat supabase/migrations/*.sql; echo "commit;"; } | pbcopy
```
PostgreSQL รองรับ transactional DDL ทั้งหมด ห่อด้วย `begin/commit` แล้วถ้าพังจะ rollback ทั้งก้อน ไม่มีตารางครึ่งๆ ค้าง

**6. ใช้ API key แบบใหม่ของ Supabase**
`sb_publishable_...` และ `sb_secret_...` ไม่ใช่ legacy JWT (`eyJhbGciOi...`)
เหตุผลอยู่ใน [.env.example](./.env.example) — **อย่ากดปุ่ม “Disable JWT-based API keys”** ในหน้า Dashboard

**7. UI ต้องเดิน `status` ตามลำดับ**
constraint `leg_time_order` บังคับว่าขั้นถัดไปตั้งได้ต่อเมื่อขั้นก่อนหน้าถูกตั้งแล้ว
**ข้าม `pending → completed` ไม่ได้** database จะปฏิเสธ — เป็นพฤติกรรมที่ตั้งใจ ไม่ใช่ bug

---

## 6. จุดที่เขียนต่างจาก DATABASE.md โดยเจตนา

`DATABASE.md` เป็น spec ที่เขียนก่อนลงมือ ส่วน `supabase/migrations/` คือของจริงที่ผ่านการทดสอบ
**เมื่อสองไฟล์ขัดกัน ให้เชื่อ migration** ตารางเทียบทั้ง 4 จุดอยู่ใน [supabase/README.md](./supabase/README.md)

จุดที่สำคัญที่สุด: `leg_time_order` ฉบับใน spec เขียน `handover_at >= arrived_at`
ซึ่งให้ผล `NULL` เมื่อ `arrived_at` เป็น null และ CHECK ถือว่า NULL คือผ่าน
ผลคือใส่เวลาส่งมอบผู้ป่วยที่ยังไม่เคยไปถึงได้ — ฉบับใน migration แก้แล้ว

---

## 7. ไฟล์ที่ยังไม่ได้ commit — ต้องให้เจ้าของโครงการตัดสินใจ

```
WireframeV3/                            wireframe 5 หน้าจอ + field_casualty_db_schema.pdf
Image 5-9-26 at 23.07.png               ภาพหน้าจอที่หลงเหลือ
```

wireframe ทั้ง 5 ไฟล์ **มีประโยชน์มากสำหรับ Prompt 02 และ 07–09** เพราะเป็นแบบหน้าจอที่ออกแบบไว้แล้ว
แต่ยังไม่ commit เพราะ **ยังไม่มีใครตรวจว่าไฟล์ PDF มีข้อมูลผู้ป่วยจริงหรือชื่อหน่วยจริงหรือไม่**
ตาม [AI_RULES.md §5.2](./AI_RULES.md) ต้องตรวจไฟล์ข้อมูลดิบก่อน commit ทุกครั้ง

**สิ่งที่ต้องทำ:** เปิดดูทั้ง 6 ไฟล์ → ถ้าสะอาด `git add WireframeV3/` → ถ้ามีข้อมูลจริง ย้ายออกนอก repo

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
| เหลือ 8 วันแต่ยังไม่มีหน้าจอสักหน้า | ตอนนี้เป็นจริงแล้ว | ทำ 02 → 06 → 07 ให้ได้ก่อน ที่เหลือค่อยว่ากัน |
| ยังไม่ได้ deploy | ไม่มี live URL ให้ผู้ทดสอบ | deploy ตั้งแต่มีหน้าแรกที่รันได้ อย่ารอจนครบทุกฟีเจอร์ |
| ยังไม่ได้เริ่มบันทึกข้อความถึงหน่วย | [PROJECT.md §9](./PROJECT.md) ระบุว่าเป็นงานที่รอผู้อื่น เร่งเองไม่ได้ | เริ่มเดินเรื่องคู่ขนานไปกับการพัฒนา |
| ยังไม่มีผู้ทดสอบ 3–5 คน | ต้องใช้ในช่วง UAT | ทาบทามล่วงหน้า อย่ารอจนระบบเสร็จ |
