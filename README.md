# MedRelay — ระบบส่งกลับสายแพทย์

> **Medical Evacuation Relay System**
> ระบบดิจิทัลที่ทำให้ผลประเมินแรกรับเดินทางไปกับผู้ป่วยทุกทอด จนถึงมือแพทย์ปลายทาง

[![Next.js](https://img.shields.io/badge/Next.js-App_Router-000?logo=nextdotjs)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres_+_RLS-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000?logo=vercel)](https://vercel.com)

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

| | ฟีเจอร์ | ใครใช้ |
|---|---|---|
| **F1** | หน้าขอส่งกลับ (ฟิลด์ออกแบบจาก 9-line MEDEVAC request) | Sender — เสนารักษ์ต้นทาง |
| **F2** | หน้าศูนย์สั่งการ — คิวคำขอ จัดรถและชุด | Monitor — ศูนย์สั่งการ |
| **F3** | หน้าติดตามสถานะ — ลำดับเวลาทุกขั้น | ทุกบทบาท |
| **F4** | แดชบอร์ด — response time, การกระจายตามความเร่งด่วน | Monitor / ผบ.หน่วย |
| **F5** | หน้ารับผู้ป่วยปลายทาง — เห็นข้อมูลก่อนผู้ป่วยถึงประตู | Receiver — แพทย์/พยาบาลปลายทาง |
| **F6** | Auto timestamp — เวลาเกิดจากการกดปุ่มทำงานปกติ | ระบบ |
| **F7** | Export รายงานสรุปกำลังพลบาดเจ็บ | Monitor |

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

## เริ่มต้นใช้งาน

### สิ่งที่ต้องมีก่อน

- **Node.js 20 LTS ขึ้นไป** — ตรวจด้วย `node -v`
- **บัญชี Supabase** (ใช้ free tier ได้) — https://supabase.com
- **บัญชี GitHub** และ **Vercel** สำหรับ deploy
- **git** — ตรวจด้วย `git --version`

### 1. Clone และติดตั้ง

```bash
git clone https://github.com/Aim-suvamatha/Vibe_MedRelay.git
cd Vibe_MedRelay
npm install
```

### 2. สร้างโปรเจกต์ Supabase

1. เข้า https://supabase.com/dashboard แล้วกด **New project**
2. ตั้งชื่อ `medrelay` เลือก region **Southeast Asia (Singapore)** เพื่อให้ latency ต่ำที่สุด
3. ตั้งรหัสผ่านฐานข้อมูลและ **เก็บไว้ในที่ปลอดภัย** (จะไม่แสดงอีก)
4. รอ provisioning ประมาณ 2 นาที

### 3. ตั้งค่า Environment Variables

```bash
cp .env.example .env.local
```

เปิด `.env.local` แล้วใส่ค่าจริงจาก **Supabase Dashboard → Project Settings → API**

| ตัวแปร | เอามาจากไหน | เปิดเผยได้ |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key | ✅ (RLS คุมอีกชั้น) |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key | ❌ **server เท่านั้น** |

> ⚠️ **`.env.local` ถูกกันไว้ใน `.gitignore` แล้ว ห้ามลบออกและห้าม commit เด็ดขาด**
> ถ้าเผลอ push key ขึ้นไป ให้ **revoke key ทันที** แล้วค่อยลบ history — ดู [AI_RULES.md §5.1](./AI_RULES.md)

### 4. สร้างฐานข้อมูล

เปิด **Supabase Dashboard → SQL Editor** แล้วรันไฟล์ใน [supabase/migrations/](./supabase/migrations/) **ตามลำดับเลขหน้าไฟล์** เท่านั้น

```
0001 enums → 0002 unit → 0003 profile → 0004 vehicle → 0005 case
→ 0006 transfer_leg → 0007 assessment → 0008 event_log
→ 0009 functions/triggers → 0010 RLS + policies → 0011 views
```

จากนั้นใส่ข้อมูลจำลอง `supabase/seed.sql` → `supabase/seed_profiles.sql` → `supabase/seed_demo_cases.sql`
รายละเอียดแต่ละไฟล์และสิ่งที่ต้องเตรียมก่อน → [supabase/README.md](./supabase/README.md)

หรือถ้าใช้ Supabase CLI

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

**ตรวจว่า RLS เปิดครบทุกตาราง** — รันคำสั่งนี้ ต้องไม่มีแถวไหนเป็น `false`

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

**แล้วรันชุดทดสอบ RLS** — [supabase/tests/rls_test.sql](./supabase/tests/rls_test.sql)
ทั้งไฟล์อยู่ใน transaction ที่ปิดท้ายด้วย `rollback` จึงไม่ทิ้งอะไรไว้
ผลต้องเป็น `PASS` ทุกข้อ **ถ้ามี `FAIL` ห้าม deploy**

### 5. รันระบบ

```bash
npm run dev
```

เปิด http://localhost:3000

### 6. Deploy ขึ้น Vercel

1. เข้า https://vercel.com/new แล้ว import repository นี้
2. ใส่ Environment Variables ทั้งหมดจาก `.env.local` ในหน้า **Settings → Environment Variables**
3. กด Deploy — ทุก push เข้า `main` จะ deploy อัตโนมัติ และทุก branch จะได้ preview URL สำหรับส่งให้ผู้ทดสอบ

---

## คำสั่งที่ใช้บ่อย

```bash
npm run dev          # รัน development server
npm run build        # build production (ต้องผ่านก่อน push)
npm run lint         # ตรวจ lint
npm run typecheck    # ตรวจ TypeScript

# generate type จาก schema จริงใน Supabase
npx supabase gen types typescript --project-id <ref> > src/types/database.ts
```

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
| **13 ก.ย. 2569** | Working Prototype + Git repository + เอกสาร |
| **1 ต.ค. 2569** | ประกาศ 10 ผลงานที่ได้นำเสนอ |
| **25 พ.ย. 2569** | Testing & QA + Innovation Pitch |

---

## ผู้พัฒนาและสิทธิ์

ผลงานส่วนบุคคลของแพทย์ผู้พัฒนา พัฒนานอกเวลาราชการบนเครื่องและบัญชีส่วนตัว
จัดทำประกอบหลักสูตร **Workshop on Vibe Coding for Clinical Innovation** ศูนย์การศึกษาต่อเนื่องของแพทย์
ยินดีให้กองทัพนำไปใช้โดยไม่คิดค่าลิขสิทธิ์หากประสงค์จะนำไปใช้
