import { LoginForm } from "./login-form";

export const metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  return <LoginForm next={typeof next === "string" ? next : "/"} />;
}
