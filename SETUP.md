# SETUP.md — scaffold โครงการ Next.js

> เอกสารนี้ครอบคลุม **Prompt 01** ใน [docs/CLAUDE-PROMPTS.md](./docs/CLAUDE-PROMPTS.md)
>
> ## ✅ ขั้นตอนในเอกสารนี้ทำเสร็จแล้ว
>
> โครงการ scaffold เรียบร้อยและ commit ลง repo แล้ว **ไม่ต้องทำซ้ำ**
> ถ้า clone repo มาใหม่ ให้ข้ามไปที่ [README.md](./README.md) แล้วรัน `npm install` ได้เลย
>
> เก็บเอกสารนี้ไว้เป็นบันทึกว่า scaffold ด้วยคำสั่งอะไร และทำไมต้องแยก Supabase client เป็น 3 ไฟล์

---

## 0. Node.js

โครงการนี้ต้องใช้ **Node.js 20 LTS ขึ้นไป** ตรวจด้วย

```bash
node -v      # ต้องได้ v20 ขึ้นไป — เครื่องนี้ติดตั้ง v24.20.0 ผ่าน nvm ไว้แล้ว
npm -v
```

nvm ติดตั้งไว้ที่ `~/.nvm` และถูกเรียกใน `~/.zshrc` แล้ว จึงใช้ได้ทันทีใน terminal ปกติ

> **ถ้าสคริปต์หรือเครื่องมืออัตโนมัติมองไม่เห็น `node`**
> nvm โหลดจาก `~/.zshrc` ซึ่ง shell แบบ non-interactive ไม่ได้อ่าน
> ให้ใส่สองบรรทัดนี้ไว้ต้นสคริปต์
>
> ```bash
> export NVM_DIR="$HOME/.nvm"
> . "$NVM_DIR/nvm.sh"
> ```
>
> ไม่ใช่อาการผิดปกติ และไม่ต้องติดตั้ง Node ซ้ำ

---

## 1. Scaffold โครงการ

⚠️ **ห้ามรัน `create-next-app .` ทับโฟลเดอร์นี้ตรงๆ** — จะล้มเพราะมีไฟล์เอกสารและ `supabase/` อยู่แล้ว
ให้ scaffold ในโฟลเดอร์ชั่วคราวแล้วย้ายเข้ามาแทน

```bash
cd ..

npx create-next-app@latest medrelay-scaffold \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-npm

# หมายเหตุ — create-next-app ปัจจุบัน (Next 16) ไม่มี flag --no-turbopack แล้ว
# Turbopack เป็นค่าเริ่มต้น ถ้าใส่ flag นี้คำสั่งจะล้มทันที

# ย้ายเฉพาะสิ่งที่โครงการนี้ยังไม่มี
cd medrelay-scaffold
rsync -av --ignore-existing \
  --exclude '.git' --exclude 'README.md' --exclude '.gitignore' --exclude 'node_modules' \
  ./ ../Vibe_MedRelay/

cd ../Vibe_MedRelay
rm -rf ../medrelay-scaffold
npm install
```

ตรวจว่าได้ `package.json`, `next.config.ts`, `tsconfig.json`, `src/app/` แล้ว

---

## 2. เพิ่ม script ที่ README อ้างถึง

`create-next-app` ไม่ได้ใส่ `typecheck` มาให้ เพิ่มลงใน `package.json` → `"scripts"`

```json
"typecheck": "tsc --noEmit"
```

---

## 3. ติดตั้ง dependency

```bash
npm install @supabase/supabase-js @supabase/ssr zod date-fns
```

| แพ็กเกจ | ใช้ทำอะไร |
|---|---|
| `@supabase/supabase-js` | client หลักของ Supabase |
| `@supabase/ssr` | จัดการ session ผ่าน cookie ให้ Server Component และ middleware อ่าน session เดียวกับ browser ได้ |
| `zod` | validate ทุกฟอร์มทั้งฝั่ง client และ server — ฝั่ง server สำคัญกว่า เพราะฝั่ง client ข้ามได้ |
| `date-fns` | คำนวณและแสดงผลเวลา (RelativeTime, response time) |

---

## 4. ติดตั้ง shadcn/ui

```bash
npx shadcn@latest init
npx shadcn@latest add button input select textarea card badge table dialog form sonner tabs
```

ตอน `init` เลือก base color เป็น **Slate** และตอบ `src/app/globals.css` เมื่อถูกถามถึงไฟล์ CSS

---

## 5. ตั้งค่า environment

```bash
cp .env.example .env.local
```

แล้วใส่ค่าจริงตาม [README.md §3](./README.md)

---

## 6. ตรวจว่าใช้ได้

```bash
npm run dev        # ต้องขึ้นหน้าแรกที่ http://localhost:3000
npm run build      # ต้องผ่านก่อน push ทุกครั้ง
npm run typecheck
```

---

## ทำไมต้องแยก Supabase client เป็น 3 ไฟล์

ไฟล์ทั้งสามอยู่ใน [src/lib/supabase/](./src/lib/supabase/) และ **เขียนไว้ให้แล้ว** ก่อน scaffold

| ไฟล์ | key ที่ใช้ | รันที่ไหน | ใช้เมื่อไร |
|---|---|---|---|
| `client.ts` | `anon` | browser | Client Component ที่ต้อง query หรือ subscribe realtime |
| `server.ts` | `anon` + session ของผู้ใช้จาก cookie | server | Server Component, Server Action, Route Handler — **ค่าเริ่มต้นที่ควรใช้เสมอ** |
| `admin.ts` | `service_role` | server เท่านั้น | งานที่ต้องข้าม RLS จริงๆ เช่น map `service_number → phone` ตอน login |

**เหตุผลที่ต้องแยก ไม่ใช่เรื่องความสะอาดของโค้ด แต่เป็นเรื่องความปลอดภัย**

- `service_role` key **ข้ามทุก RLS policy** ถ้าหลุดลง browser ข้อมูลทั้งฐานเปิดให้ทุกคน
  การแยกเป็นคนละไฟล์ทำให้ `import` ผิดที่แล้วเห็นได้ทันทีตอน review diff
- `server.ts` ต้องอ่าน session จาก cookie มิฉะนั้น `auth.uid()` จะเป็น `null`
  ทำให้ RLS policy ทุกข้อ**ปฏิเสธ**และหน้าเว็บจะว่างเปล่าโดยไม่มี error ให้เห็น
- `admin.ts` มี guard ที่ `throw` ทันทีถ้าถูกเรียกฝั่ง browser
  เป็นตาข่ายชั้นสุดท้าย ไม่ใช่ชั้นแรก — ชั้นแรกคือการไม่ import มันเข้ามาตั้งแต่ต้น
