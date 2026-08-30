# ARCHITECTURE.md — MedRelay

เอกสารนี้อธิบายว่าระบบประกอบด้วยอะไร ทำไมเลือกแบบนี้ และข้อมูลเดินทางอย่างไร

---

## 1. Technology Stack

| Layer | Technology | บทบาท |
|---|---|---|
| **AI Developer Assistant** | Claude (Chat / Claude Code) | วิเคราะห์ requirement, วางแผน, เขียน/แก้ code, debug, review |
| **Frontend** | Next.js (App Router) + TypeScript | สร้าง Web Application |
| **UI** | Tailwind CSS + shadcn/ui | สร้าง UI ที่สวยและ responsive |
| **Backend / Data** | Supabase | Database, Auth, Storage, Realtime |
| **Database** | PostgreSQL | จัดเก็บข้อมูล |
| **Security** | Supabase RLS (Row Level Security) | ควบคุมสิทธิ์ระดับ row |
| **Source Control** | GitHub | เก็บ source code |
| **Deployment** | Vercel | Build และเผยแพร่ระบบ |
| **Application AI** | External LLM API | AI feature ที่ผู้ใช้งานระบบเรียกใช้ |

> **หมายเหตุความสอดคล้องกับแผนงานฉบับแรก** — แผนงานโครงการฉบับ 5 ส.ค. 2569 ระบุ Vite/React
> เอกสารนี้ยืนยันการเปลี่ยนเป็น **Next.js + TypeScript** ตาม architecture ที่ตกลงล่าสุด
> เหตุผล: ต้องการ Route Handler / Server Action ฝั่ง server เพื่อถือ `SUPABASE_SERVICE_ROLE_KEY` และ `LLM_API_KEY` ไม่ให้หลุดลง browser ซึ่ง Vite (SPA ล้วน) ทำไม่ได้โดยไม่เพิ่ม backend แยก และ Vercel deploy Next.js ได้ทันทีจาก GitHub

### แยกให้ชัด: AI 2 ตัวในระบบนี้

เป็นจุดที่กรรมการมักเข้าใจสลับกัน ต้องอธิบายให้ตรง

| | **AI Developer Assistant** | **Application AI** |
|---|---|---|
| คือ | Claude ที่ผู้พัฒนาใช้เขียนโค้ด | External LLM API ที่ระบบเรียกใช้ |
| ทำงานเมื่อไร | ตอน build (ก่อน deploy) | ตอน runtime (ผู้ใช้กดใช้งาน) |
| อยู่ใน production หรือไม่ | **ไม่อยู่** | อยู่ |
| เห็นข้อมูลเคสหรือไม่ | **ไม่เห็น** — เห็นแค่ schema และ mock data | เห็นเฉพาะข้อมูลที่ระบบส่งให้ ผ่านกฎใน AI_RULES.md |
| เฟส 1 เปิดใช้หรือไม่ | ใช้ตลอด | **ปิดไว้** (`NEXT_PUBLIC_FEATURE_AI_SUMMARY=false`) |

---

## 2. System Architecture Diagram

```
                          ┌───────────────┐
                          │    Doctor     │  ผู้พัฒนา (แพทย์)
                          └───────┬───────┘
                                  │  requirement / prompt
                                  ▼
                          ┌───────────────┐
                          │  Claude Chat  │  AI Developer Assistant
                          └───────┬───────┘  (build time เท่านั้น)
                                  │  code
                                  ▼
                          ┌───────────────┐
                          │    GitHub     │  Source Control
                          └───────┬───────┘
                                  │
                                  ▼
                    ╔═════════════════════════╗
                    ║        Next.js          ║  Frontend + Server Runtime
                    ║  (App Router + TS)      ║  Tailwind + shadcn/ui
                    ╚══════╦════════════╦═════╝
                           │            │
              ┌────────────┘            └────────────┐
              ▼                                      ▼
      ┌───────────────┐                      ┌───────────────┐
      │   Supabase    │                      │    AI API     │  External LLM
      └───────┬───────┘                      └───────────────┘  (server-side only)
              │
   ┌──────────┼──────────┐
   ▼          ▼          ▼
┌──────┐ ┌──────────┐ ┌────────┐
│ Auth │ │PostgreSQL│ │Storage │   ← RLS บังคับที่ชั้น PostgreSQL
└──────┘ └────┬─────┘ └────────┘
              │
              ▼
      ┌───────────────┐
      │    Vercel     │  Build & Deploy (จาก GitHub)
      └───────┬───────┘
              ▼
      ┌───────────────┐
      │   Live URL    │  ผู้ใช้จริงเข้าใช้งาน
      └───────────────┘
```

**สรุปเส้นทาง:** Next.js เรียกทั้ง Supabase (Auth / DB / Storage) และ AI API ภายนอก แล้ว deploy ผ่าน GitHub → Vercel สู่ Live URL

---

## 3. เหตุผลของการเลือกแต่ละตัว

| เลือก | เหตุผล | ทางเลือกที่พิจารณาแล้วไม่เลือก |
|---|---|---|
| **Next.js + TypeScript** | ต้องมี server runtime เพื่อถือ secret key และเรียก LLM API อย่างปลอดภัย · TypeScript จับ error ของ schema ตั้งแต่เขียน ซึ่งสำคัญมากเมื่อผู้พัฒนาเป็นแพทย์ที่มีเวลาจำกัด | Vite/React (ไม่มี server ต้องเพิ่ม backend แยก) |
| **Supabase** | ได้ Postgres + Auth + Storage + Realtime + RLS ในบริการเดียว ลดงาน backend ที่เขียนเองไม่ทันใน 5 สัปดาห์ · RLS บังคับสิทธิ์ที่ชั้น database ไม่ใช่ชั้นแอป ซึ่งเป็นข้อได้เปรียบด้าน security ที่อธิบายบนเวทีได้ | Firebase (NoSQL ไม่เหมาะกับความสัมพันธ์ case→leg), เขียน backend เอง (ไม่ทัน) |
| **PostgreSQL** | ข้อมูลมีความสัมพันธ์ชัดเจน (case → transfer_leg → assessment) และต้องทำ aggregate query สำหรับแดชบอร์ด | NoSQL |
| **Tailwind + shadcn/ui** | ได้ component ที่ accessible และ responsive โดยไม่ต้องออกแบบ CSS เอง — mobile-first ตรงกับ persona ที่ใช้สมาร์ทโฟนเป็นหลัก | Material UI (หนักและ customize ยากกว่า) |
| **Vercel** | deploy อัตโนมัติจาก GitHub ทุก push ได้ preview URL ต่อ branch ใช้ส่งให้ผู้ทดสอบได้ทันที | Netlify, self-host (ไม่มีคนดูแล) |
| **GitHub** | หลักสูตรกำหนดให้ส่ง Git repository ซึ่งคิดเป็น 20% ของวิชา 7 | — |
| **Low-code (n8n, Bubble)** | **ไม่เลือก** เพราะต้องส่ง source code repository เป็นเกณฑ์คะแนน | เป็นแผนสำรองถ้าเวลาพัฒนาต่ำกว่า 4 ชม./สัปดาห์ 2 สัปดาห์ติด |

---

## 4. โครงสร้างโฟลเดอร์ (เป้าหมาย)

```
Vibe_MedRelay/
├── README.md
├── PROJECT.md
├── ARCHITECTURE.md
├── DATABASE.md
├── AI_RULES.md
├── .env.example
├── .gitignore
├── docs/
│   ├── CLAUDE-PROMPTS.md
│   ├── testing.md
│   └── demo-script.md
├── src/
│   ├── app/
│   │   ├── (auth)/login/           # เข้าสู่ระบบ
│   │   ├── (app)/
│   │   │   ├── sender/             # F1 หน้าขอส่งกลับ
│   │   │   ├── dispatch/           # F2 หน้าศูนย์สั่งการ
│   │   │   ├── track/[caseId]/     # F3 หน้าติดตามสถานะ
│   │   │   ├── receiver/           # F5 หน้ารับผู้ป่วยปลายทาง
│   │   │   └── dashboard/          # F4 แดชบอร์ด
│   │   └── api/
│   │       ├── ai/summary/         # เรียก LLM (server-side เท่านั้น)
│   │       └── export/report/      # F7 export รายงาน
│   ├── components/
│   │   ├── ui/                     # shadcn/ui
│   │   └── medrelay/               # component เฉพาะระบบ (CaseCard, LegTimeline, PrecedenceBadge)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # browser client — anon key
│   │   │   ├── server.ts           # server client — anon key + session ผู้ใช้
│   │   │   └── admin.ts            # service_role — ห้าม import จาก client component
│   │   ├── validation/             # zod schema ของทุกฟอร์ม
│   │   └── metrics.ts              # คำนวณ response time
│   └── types/
│       └── database.ts             # type ที่ generate จาก Supabase
└── supabase/
    ├── migrations/                 # SQL migration (เป็น source of truth ของ schema)
    └── seed.sql                    # ข้อมูลจำลองเท่านั้น (ห้ามมีข้อมูลจริง)
```

---

## 5. Data Flow — เส้นทางข้อมูลจริง

### 5.1 เปิดเคสและร้องขอส่งกลับ (Sender)

```
มือถือเสนารักษ์
  → กรอกฟอร์ม (validate ด้วย zod ฝั่ง client)
  → Server Action ของ Next.js
  → Supabase client (session ของผู้ใช้)
  → INSERT case + transfer_leg แรก + assessment
  → RLS ตรวจ: ผู้ใช้มี role 'sender' และอยู่ในหน่วยต้นทางจริงหรือไม่
  → trigger ตั้ง requested_at = now() อัตโนมัติ
  → Realtime broadcast → หน้าศูนย์สั่งการเห็นทันทีโดยไม่ต้อง refresh
```

### 5.2 จัดรถและติดตาม (Monitor → Transporter)

```
หน้าศูนย์สั่งการ (subscribe realtime channel 'dispatch')
  → กดจัดรถ → UPDATE transfer_leg SET vehicle_id, status='dispatched'
  → trigger ตั้ง dispatched_at = now()
  → มือถือ Transporter เห็นภารกิจ
  → กด "ถึงจุดรับ" / "ออกเดินทาง" / "ส่งมอบแล้ว"
  → แต่ละปุ่มเขียน timestamp ของตัวเอง — ไม่มีช่องให้กรอกเวลาด้วยมือ
```

### 5.3 ส่งมอบและส่งทอดถัดไป (Receiver)

```
Receiver เปิดเคสด้วย case_code
  → RLS อนุญาตเพราะเป็นหน่วยปลายทางของ leg นี้
  → เห็น assessment ของทอดก่อนหน้า "ก่อนผู้ป่วยถึงประตู"
  → กดรับมอบ → handover_at = now()
  → ถ้าต้องส่งทอดถัดไป: สร้าง transfer_leg ใหม่ leg_no +1 ภายใต้ case เดิม
     (ข้อมูลเคสและ assessment เดิมตามไปเอง ไม่ต้องกรอกซ้ำ)
```

### 5.4 แดชบอร์ด

```
Postgres view คำนวณ interval จาก timestamp ที่มีอยู่แล้ว
  → ไม่มีการกรอกข้อมูลเพิ่มเพื่อทำรายงาน
  → Server Component ดึง aggregate แล้ว render
```

---

## 6. Security Architecture

**หลักการ: บังคับสิทธิ์ที่ชั้น database ไม่ใช่ชั้น UI** — การซ่อนปุ่มบนหน้าจอไม่ใช่ security

| ชั้น | มาตรการ |
|---|---|
| **Transport** | HTTPS ทั้งหมด (Vercel บังคับให้อยู่แล้ว) |
| **Authentication** | Supabase Auth — เฟสแรกใช้ **เลขประจำตัวทหาร 10 หลัก + ยืนยันด้วยเบอร์โทรศัพท์ (OTP)** ตัดการใช้เลขบัตรประชาชน 13 หลักออกโดยเจตนา |
| **Authorization** | RLS policy ทุกตาราง + helper function ตรวจ role และหน่วยสังกัด (ดู DATABASE.md §5) |
| **Key management** | `NEXT_PUBLIC_*` = เปิดเผยได้เท่านั้น · `SUPABASE_SERVICE_ROLE_KEY` และ `LLM_API_KEY` อยู่ฝั่ง server เท่านั้น ห้ามขึ้นต้นด้วย `NEXT_PUBLIC_` |
| **Input validation** | zod schema ทั้ง client และ server — ห้าม trust ฝั่ง client อย่างเดียว |
| **Audit trail** | ทุกการเปลี่ยนสถานะเขียน `event_log` พร้อม actor และเวลา ลบไม่ได้ |
| **Data minimisation** | ไม่เก็บชื่อ-นามสกุลผู้ป่วยจริงในเฟส prototype ใช้ `case_code` และ `patient_alias` แทน |
| **Secrets in git** | `.env*` อยู่ใน `.gitignore` · ถ้า key หลุดขึ้น repo ให้ **revoke ทันที** แล้วค่อยลบ history |

---

## 7. ข้อจำกัดที่ยอมรับในเฟส 1 (บอกตรงๆ บนเวที)

| ข้อจำกัด | ผลกระทบ | แผนรับมือ |
|---|---|---|
| ต้องมีสัญญาณอินเทอร์เน็ต | ใช้ไม่ได้ในพื้นที่ที่ถูกก่อกวนสัญญาณ | **ใช้วิทยุคู่ขนานเสมอ** ระบบเป็นชั้นบันทึก ไม่ใช่ชั้นสั่งการเดียว · offline queue อยู่ในแผนขยายผล |
| ยังไม่เชื่อม HIS | ต้องบันทึกซ้ำที่ ER | ออกแบบให้ export ตาม FHIR ได้ในอนาคต |
| ไม่มีแผนที่เรียลไทม์ | ประมาณเวลาถึงจากระยะทางไม่ได้ | ใช้จุดรับผู้ป่วยที่กำหนดไว้ล่วงหน้า ซึ่งตรงหลักนิยมทางทหารมากกว่า |
| ข้อมูลจำลองทั้งหมด | ตัวเลขบนแดชบอร์ดยังไม่ใช่ของจริง | เป็นการตัดสินใจเชิงกฎหมาย ไม่ใช่ข้อจำกัดทางเทคนิค (ดู PROJECT.md §8) |
| ผู้พัฒนาคนเดียว | bus factor = 1 | แผนความยั่งยืน 2 ชั้น (PROJECT.md §6.6) + เอกสารครบใน repo นี้ |

---

## 8. แผนขยายผล (Phase 2+)

1. **Offline-first queue** — เขียนลง IndexedDB แล้ว sync เมื่อมีสัญญาณ (schema ออกแบบรองรับแล้วด้วย `client_uuid` + `synced_at`)
2. **LINE OA เป็น entry point คู่ขนาน** — ให้ผู้ใช้ที่ยังไม่ติดตั้งแอปเปิดเคสผ่าน LINE ได้
3. **MASCAL triage allocation** — moat หลักของระบบ ต้อง validate ทางคลินิกก่อน
4. **FHIR export / HIS integration** — เชื่อม รพ.ค่าย 37 แห่งที่ใช้ HIS ต่างกัน
5. **ส่งกลับทางอากาศยาน** — เพิ่ม `vehicle.type = 'rotary' | 'fixed_wing'` (enum รองรับไว้แล้ว)
