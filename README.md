# MedRelay — ระบบส่งกลับสายแพทย์

> **Medical Evacuation Relay System**
> ระบบดิจิทัลที่ทำให้ผลประเมินแรกรับเดินทางไปกับผู้ป่วยทุกทอด จนถึงมือแพทย์ปลายทาง

[![Next.js](https://img.shields.io/badge/Next.js-App_Router-000?logo=nextdotjs)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres_+_RLS-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000?logo=vercel)](https://vercel.com)

### ▶ ระบบทำงานอยู่จริงที่ **https://medrelay-five.vercel.app**

ไม่ต้องติดตั้งอะไรเพื่อดูระบบ · อยากรันเองใช้เวลา 5 นาที → [รันระบบใน 5 นาที](#-รันระบบใน-5-นาที)

---

## ปัญหาที่ระบบนี้แก้

การส่งกลับผู้ป่วยทางสายแพทย์เดินเป็น **ทอด** จากจุดเกิดเหตุ → ที่พยาบาลกองพัน → กองพล → โรงพยาบาลปลายทาง แต่การส่งมอบข้อมูลระหว่างทอดยังทำด้วยวิทยุ กระดาษ และกลุ่ม LINE ทำให้

- ผลประเมินแรกรับที่เสนารักษ์บันทึกไว้ **ไม่ถึงมือแพทย์ปลายทาง** ต้องซักประวัติและประเมินซ้ำ
- **ไม่มีเวลาที่เชื่อถือได้** วัด response time ย้อนหลังไม่ได้
- ผู้บังคับหน่วย **ติดตามกำลังพลที่บาดเจ็บของตนไม่ได้**

ระบบสารสนเทศโรงพยาบาล (HIS) เริ่มบันทึกเมื่อผู้ป่วยลงทะเบียนที่ ER แล้วเท่านั้น — **ทุกอย่างก่อนหน้านั้นไม่มีอยู่ในระบบใดเลย** MedRelay เข้าไปอุดช่องว่างชั้นนี้

> **หลักการ:** ไม่ได้เพิ่มภาระการบันทึก แต่ย้ายการบันทึกที่ทำอยู่แล้วไปไว้ที่เดียวกัน

รายละเอียดปัญหา ผู้ใช้ workflow ฟีเจอร์ และผลลัพธ์ → [PROJECT.md](./PROJECT.md)

---

## ฟีเจอร์หลัก (Phase 1)

| | ฟีเจอร์ | ใครใช้ | สถานะ |
|---|---|---|---|
| **F1** | หน้าขอส่งกลับ (ฟิลด์ออกแบบจาก 9-line MEDEVAC request) | Sender — เสนารักษ์ต้นทาง | ✅ ใช้งานได้ |
| **F2** | หน้าศูนย์สั่งการ — คิวคำขอ จัดรถและชุด กระดานรถ | Monitor — ศูนย์สั่งการ | ✅ ใช้งานได้ |
| **F3** | หน้าติดตามสถานะ — เส้นเวลา 6 ขั้นต่อทอด | ทุกบทบาท | ✅ ใช้งานได้ |
| **F4** | แดชบอร์ด — มัธยฐาน response time และการกระจาย | Monitor / ผบ.หน่วย | ✅ ใช้งานได้ |
| **F5** | หน้ารับผู้ป่วยปลายทาง — เห็นข้อมูลก่อนผู้ป่วยถึงประตู | Receiver — แพทย์/พยาบาลปลายทาง | ✅ ใช้งานได้ |
| **F6** | Auto timestamp — เวลาเกิดจากการกดปุ่มทำงานปกติ | ระบบ | ✅ ใช้งานได้ |
| **F7** | Export รายงานสรุปกำลังพลบาดเจ็บ | Monitor | ⬜ view พร้อมแล้ว ยังไม่ทำ UI |

**สิ่งที่ระบบนี้บังคับด้วยโครงสร้าง ไม่ใช่ด้วยความตั้งใจ**

- **ไม่มีช่องกรอกเวลาด้วยมือที่ใดในระบบเลยแม้แต่ช่องเดียว** — ทุก timestamp ตั้งโดย
  trigger ในฐานข้อมูลตอนสถานะเปลี่ยน นาฬิกาเครื่องผู้ใช้จึงทำให้ตัวเลขเพี้ยนไม่ได้
- **ข้ามขั้นตอนไม่ได้** — constraint `leg_time_order` ปฏิเสธการบันทึกเวลาส่งมอบ
  ผู้ป่วยที่ยังไม่เคยไปถึง หน้าจอจึงแสดงปุ่มของขั้นถัดไปเพียงขั้นเดียว
- **ข้อมูลผู้ป่วยจริงเข้าระบบไม่ได้** — RLS policy บังคับ `is_synthetic = true` ตอน insert
- **ผลประเมินผูกกับเคส ไม่ใช่กับทอด** — สิ่งที่บันทึกในทอดแรกจึงเปิดดูได้จากทุกทอดถัดไป
  โดยไม่ต้องคัดลอกข้อมูล นี่คือโจทย์หลักที่ระบบนี้แก้

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Backend / Data | Supabase (Database, Auth, Storage) |
| Database | PostgreSQL |
| Security | Supabase Row Level Security |
| Deployment | Vercel |
| Application AI | External LLM API (ปิดไว้ในเฟส 1) |

โครงสร้างเต็มและเหตุผลของการเลือกแต่ละตัว → [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 🚀 รันระบบใน 5 นาที

มีสองทาง เลือกทางเดียวพอ

### ทาง ก · ดูระบบที่ทำงานอยู่จริง — 1 นาที

**https://medrelay-five.vercel.app**

ระบบ deploy อยู่แล้วพร้อมข้อมูลจำลอง ไม่ต้องติดตั้งอะไรเลย
บัญชีทดสอบมี 4 บัญชีตามบทบาท (เลขประจำตัว `9900000001`–`9900000004`)

> **รหัสผ่านไม่ได้อยู่ใน repo นี้โดยเจตนา** — repo เป็นสาธารณะ
> การเผยแพร่รหัสผ่านที่ใช้ล็อกอินระบบที่ออนไลน์อยู่เท่ากับเปิดให้ใครก็ได้เข้ามาแก้ข้อมูล
> **ขอรหัสผ่านจากผู้พัฒนา** หรือรันในเครื่องตามทาง ข. แล้วตั้งรหัสเอง

| เลขประจำตัว | บทบาท | เห็นอะไร |
|---|---|---|
| `9900000001` | sender · transporter · receiver | เปิดคำขอได้และเดินสถานะได้ |
| `9900000002` | transporter | ภารกิจลำเลียงของตัวเอง |
| `9900000003` | receiver · sender | ผู้ป่วยที่กำลังมาถึงหน่วย |
| `9900000004` | monitor · commander | คิวคำขอ กระดานรถ และแดชบอร์ด |

### ทาง ข · รันในเครื่อง — 5 นาที

**ต้องมีก่อน** Node.js 20 ขึ้นไป (`node -v`) · git · บัญชี Supabase (free tier พอ)

```bash
# 1. ติดตั้ง (~1 นาที)
git clone https://github.com/Aim-suvamatha/Vibe_MedRelay.git
cd Vibe_MedRelay
npm install

# 2. ตรวจว่าทุกอย่างทำงาน — ยังไม่ต้องมี Supabase ด้วยซ้ำ (~1 นาที)
npm run test:unit    # สูตรคำนวณเวลา 11 ข้อ
npm run db:test      # migration + seed + ทดสอบ 77 ข้อ บน PostgreSQL ในเครื่อง
```

`npm run db:test` รัน migration ทุกไฟล์และชุดทดสอบทั้งหมดบน **PGlite**
(PostgreSQL ที่คอมไพล์เป็น WebAssembly รันในโปรเซส Node) — **ไม่ต้องมี Docker
ไม่ต้องมี PostgreSQL และไม่ต้องต่อ Supabase** ถ้าได้ `77/77 PASS` แปลว่า schema
RLS trigger และ constraint ทั้งหมดทำงานถูกต้อง เป็นวิธีตรวจงานที่เร็วที่สุดของโครงการนี้

```bash
# 3. ต่อ Supabase ของตัวเอง (~3 นาที)
cp .env.example .env.local
```

สร้างโปรเจกต์ที่ https://supabase.com/dashboard (region **Southeast Asia (Singapore)**)
แล้วใส่ค่าใน `.env.local` จาก **Settings → API Keys**

| ตัวแปร | เอามาจากไหน | เปิดเผยได้ |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → Data API → Project URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key (`sb_publishable_...`) | ✅ RLS คุมอีกชั้น |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key (`sb_secret_...`) | ❌ **server เท่านั้น** |
| `DATABASE_PASSWORD` | รหัสผ่านที่ตั้งตอนสร้างโปรเจกต์ | ❌ ใช้รัน migration |

> ⚠️ **ใช้แท็บ “Publishable and secret API keys” ไม่ใช่ “Legacy”**
> legacy key (`eyJhbGciOi...`) ถ้าหลุดต้องสร้าง JWT secret ใหม่ทั้งโปรเจกต์ key อื่นพังตามหมด
> ส่วน key แบบใหม่ rotate เฉพาะใบที่หลุดได้ — เหตุผลเต็มอยู่ใน [.env.example](./.env.example)

```bash
# 4. สร้างฐานข้อมูลและใส่ข้อมูลจำลอง
for f in supabase/migrations/*.sql; do node supabase/scripts/sql.mjs "$f"; done
node supabase/scripts/sql.mjs supabase/seed.sql
node supabase/scripts/sql.mjs supabase/seed_profiles.sql
node supabase/scripts/sql.mjs supabase/seed_demo_cases.sql
node supabase/scripts/sql.mjs supabase/seed_pickup_points.sql

# 5. ตั้งรหัสผ่านบัญชีทดสอบ (สคริปต์ถามรหัสเอง ไม่แสดงบนจอ)
node supabase/scripts/set-demo-passwords.mjs --dry-run   # ดูก่อนว่าจะแตะบัญชีไหน
node supabase/scripts/set-demo-passwords.mjs

# 6. รัน
npm run dev
```

เปิด http://localhost:3000 แล้วล็อกอินด้วยเลขประจำตัวในตารางข้างบน

<details>
<summary><b>ถ้าติดปัญหา</b></summary>

| อาการ | สาเหตุและวิธีแก้ |
|---|---|
| `command not found: node` ในสคริปต์อัตโนมัติ | Node ติดตั้งผ่าน nvm ซึ่งโหลดจาก `~/.zshrc` · สั่ง `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"` ก่อน |
| `npm run typecheck` ฟ้อง `LayoutProps` | Next.js 16 สร้าง type นี้ตอน build · รัน `npm run build` หนึ่งครั้งก่อน |
| build ค้างที่ error ของไฟล์ที่ลบไปแล้ว | ลบ cache ด้วย `rm -rf .next` แล้ว build ใหม่ |
| หน้าเว็บว่างเปล่าโดยไม่มี error | มักเป็น session หมดอายุ ทำให้ RLS ปฏิเสธทุก query · ล็อกอินใหม่ |
| `sql.mjs` ต่อฐานข้อมูลไม่ได้ | ยังไม่ได้ใส่ `DATABASE_PASSWORD` ใน `.env.local` |

รายการเต็ม 13 ข้อพร้อมเหตุผล → [HANDOFF.md §5](./HANDOFF.md)
</details>

---

## เดินดูระบบใน 3 นาที

ลำดับนี้เล่าเรื่องได้ครบตั้งแต่ต้นทางถึงปลายทาง **ทุกหน้าเข้าถึงได้จากแถบล่าง ไม่ต้องพิมพ์ URL เอง**

| # | ล็อกอินเป็น | ไปที่ | ทำอะไร | จุดที่ควรสังเกต |
|---|---|---|---|---|
| 1 | `9900000001` | **Sender** | กรอกอาการ เลือกความเร่งด่วนและปลายทาง ใส่สัญญาณชีพ แล้วกดส่ง | **ประเมินแรกรับครั้งเดียว** จำตัวเลขไว้ |
| 2 | — | ระบบพาไป **ติดตามสถานะ** เอง | ดูเส้นเวลา 6 ขั้น | ขั้นที่ยังไม่ถึงเป็นจุดกลวง ไม่ใช่แค่สีจาง |
| 3 | `9900000004` | **Monitor** | เห็นคำขอในคิว "รอจัดรถ" กดการ์ด แล้วกด **จัดรถ** | เลือกทั้งรถและผู้ลำเลียง · **ไม่มีช่องกรอกเวลา** |
| 4 | `9900000002` | **Transporter** | เห็นภารกิจของตัวเอง กดเข้าไปเดินสถานะ 3 ขั้น | ปุ่มโผล่**ทีละขั้น** ข้ามขั้นไม่ได้เพราะฐานข้อมูลปฏิเสธ |
| 5 | `9900000003` | **Receiver** | เห็นผู้ป่วยที่กำลังมาถึง **ก่อนรถจอด** | ★ **หัวใจของโครงการ** — เห็นสัญญาณชีพชุดเดียวกับข้อ 1 โดยไม่มีใครกรอกซ้ำ |
| 6 | `9900000003` | ในหน้าเดียวกัน | กด **ส่งมอบผู้ป่วย** พร้อมติ๊กรายการตรวจ | ข้อมูลชุดเดิมตามไปทอดถัดไปได้โดยไม่ต้องกรอกใหม่ |
| 7 | `9900000004` | **Monitor → แดชบอร์ด** | ดูมัธยฐานเวลาต่างๆ | **ไม่มีใครพิมพ์รายงาน** ตัวเลขคำนวณจากเวลาที่เพิ่งกดไป |

**เดินครบหนึ่งรอบแล้วอยากเริ่มใหม่** — คืนข้อมูลให้พร้อมสาธิตอีกรอบด้วยคำสั่งเดียว

```bash
node supabase/scripts/sql.mjs supabase/reset-demo.sql
```

ลบเฉพาะเคสที่สร้างระหว่างทดลอง คืนเคสที่รอจัดรถและเคสที่กำลังเดินทางให้กลับมา
พร้อมคืนสถานะรถ **ไม่แตะบัญชีผู้ใช้และรหัสผ่าน** รันซ้ำกี่ครั้งก็ได้ผลเดิม

สคริปต์นำเสนอฉบับเต็มพร้อมบทพูดและวิธีซ้อม → [docs/demo-script.md](./docs/demo-script.md)

---

## คำสั่งที่ใช้บ่อย

```bash
npm run dev          # development server
npm run build        # build production (ต้องผ่านก่อน push)
npm run lint         # ตรวจ lint
npm run typecheck    # ตรวจ TypeScript (รัน build หนึ่งครั้งก่อน)

npm run test:unit    # สูตรคำนวณเวลาและมัธยฐาน 11 ข้อ
npm run db:test      # migration + seed + ทดสอบ 77 ข้อ บน PGlite ในเครื่อง
```

**ตรวจบนฐานข้อมูลจริงก่อน deploy ทุกครั้ง** — ทุกไฟล์อยู่ใน transaction ที่ปิดท้ายด้วย
`rollback` จึงไม่ทิ้งอะไรไว้ ต้องได้ `PASS` ทุกข้อ **ถ้ามี `FAIL` ห้าม deploy**

```bash
node supabase/scripts/sql.mjs --no-tx supabase/tests/rls_test.sql         # 11 ข้อ ความปลอดภัย
node supabase/scripts/sql.mjs --no-tx supabase/tests/form_test.sql        # 36 ข้อ schema
node supabase/scripts/sql.mjs --no-tx supabase/tests/track_flow_test.sql  # 16 ข้อ วงจรการส่งกลับ
```

**แก้ schema เมื่อไร ต้อง generate type ใหม่ทุกครั้ง**

```bash
node supabase/scripts/gen-types.mjs   # ถาม Personal Access Token เอง ไม่แสดงบนจอ
```

> ⚠️ **อย่าใช้ `npx supabase gen types --db-url`** — คำสั่งนั้นต้องใช้ Docker ทุกเวอร์ชัน
> สคริปต์ข้างบนเรียก Management API ซึ่งเป็น endpoint เดียวกันแต่ไม่แตะ Docker เลย

---

## Deploy ขึ้น Vercel

```bash
npx vercel --prod
```

หรือ import repository ที่ https://vercel.com/new แล้วใส่ environment variables

> 🔴 **env var ทุกตัวต้องเป็นชนิด `Config` ห้ามเป็น `Secret`**
> Next.js 16 + Turbopack ฝังค่า `process.env.*` ลงบันเดิลตั้งแต่ตอน **build**
> ค่าที่ build อ่านไม่ได้จะกลายเป็น `undefined` ตอนรัน **ไม่ว่าจะมี `NEXT_PUBLIC_` นำหน้าหรือไม่**
> อาการคือ Internal Server Error ทั้งที่หน้า Dashboard แสดงว่าตั้งค่าครบแล้ว
>
> `vercel env add` ตั้งเป็น `Secret` ให้เองอัตโนมัติ **ต้องใส่ `--no-sensitive` ทุกครั้ง**
> ตรวจด้วย `vercel env ls | grep Secret` — ทุกบรรทัดที่เจอคือระเบิดเวลา
>
> **แก้ค่า env แล้วต้อง deploy ใหม่เสมอ** เพราะค่าถูกฝังตอน build

---

## ⚠️ ข้อกำหนดที่ต้องอ่านก่อนใช้งาน

1. **ห้ามนำข้อมูลผู้ป่วยจริงเข้าระบบในเฟส prototype** — database บังคับด้วย RLS policy (`is_synthetic = true`) และ `.env.example` ตั้ง `NEXT_PUBLIC_ALLOW_REAL_PATIENT_DATA=false` เป็นค่าเริ่มต้น
2. **ระบบนี้ไม่วินิจฉัยและไม่ตัดสินใจทางคลินิกแทนมนุษย์** — ฟีเจอร์ AI ในแอปปิดไว้ในเฟส 1 โดยเจตนา
3. **ต้องใช้วิทยุคู่ขนานเสมอ** — ระบบเป็นชั้นบันทึก ไม่ใช่ช่องทางสั่งการเดียว
4. **ห้ามวาง API key หรือข้อมูลผู้ป่วยจริงลงในช่องแชทกับ AI**

กฎเต็ม → [AI_RULES.md](./AI_RULES.md)

---

## เอกสารในโครงการ

| ไฟล์ | เนื้อหา |
|---|---|
| **[HANDOFF.md](./HANDOFF.md)** | **สถานะปัจจุบัน สิ่งที่ต้องทำต่อ และข้อควรระวัง — อ่านก่อนเริ่มงาน** |
| [PROJECT.md](./PROJECT.md) | Problem, User, Workflow, Features, Outcome |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technology และ architecture |
| [DATABASE.md](./DATABASE.md) | Schema, keys, relationships, RLS |
| [AI_RULES.md](./AI_RULES.md) | AI safety, privacy, security |
| [SETUP.md](./SETUP.md) | ขั้นตอน scaffold โครงการ Next.js (ทำก่อน `npm install`) |
| [supabase/README.md](./supabase/README.md) | ลำดับการรัน migration และการตรวจ RLS |
| [docs/CLAUDE-PROMPTS.md](./docs/CLAUDE-PROMPTS.md) | Prompt 10 ชุดสำหรับสร้างระบบนี้ |
| [docs/testing.md](./docs/testing.md) | Checklist สำหรับทดสอบระบบ |
| [docs/demo-script.md](./docs/demo-script.md) | สคริปต์นำเสนอผลงาน |

---

## สถานะโครงการ

| เส้นตาย | สิ่งที่ต้องส่ง |
|---|---|
| **13 ก.ย. 2569** | Working Prototype + Git repository + เอกสาร — ✅ ระบบใช้งานได้แล้วที่ live URL |
| **1 ต.ค. 2569** | ประกาศ 10 ผลงานที่ได้นำเสนอ |
| **25 พ.ย. 2569** | Testing & QA + Innovation Pitch |

---

## ผู้พัฒนาและสิทธิ์

ผลงานส่วนบุคคลของแพทย์ผู้พัฒนา พัฒนานอกเวลาราชการบนเครื่องและบัญชีส่วนตัว
จัดทำประกอบหลักสูตร **Workshop on Vibe Coding for Clinical Innovation** ศูนย์การศึกษาต่อเนื่องของแพทย์
ยินดีให้กองทัพนำไปใช้โดยไม่คิดค่าลิขสิทธิ์หากประสงค์จะนำไปใช้
