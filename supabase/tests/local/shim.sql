-- shim.sql — จำลองสิ่งที่ Supabase มีให้อยู่แล้ว แต่ PostgreSQL เปล่าๆ ไม่มี
--
-- ⚠ ใช้กับ PGlite ในเครื่องเท่านั้น ห้ามรันไฟล์นี้บน Supabase จริงเด็ดขาด
--   Supabase มี auth schema, auth.uid() และ role เหล่านี้ของจริงอยู่แล้ว
--   การรันทับจะทำให้ auth ของโปรเจกต์พัง
--
-- ไฟล์นี้ไม่ได้อยู่ใน supabase/migrations/ โดยเจตนา

create schema if not exists auth;

-- ตาราง auth.users แบบย่อ เอาเฉพาะคอลัมน์ที่ profile และ seed อ้างถึง
create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);

-- auth.uid() ตามพฤติกรรมจริงของ Supabase — อ่านจาก GUC request.jwt.*
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

-- role ที่ Supabase สร้างมาให้
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin;          end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;

-- Supabase ตั้ง default privileges ไว้ ตารางที่สร้างหลังจากนี้จะได้สิทธิ์อัตโนมัติ
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
