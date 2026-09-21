import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/workspace/auth";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }) {
  if (await getCurrentUser()) redirect("/workspace");
  const sp = (await searchParams) ?? {};
  const next = typeof sp.next === "string" ? sp.next : "";
  const notice = sp.expired === "1" ? "Your session ended. Sign in again to continue." : "";
  return <LoginForm next={next} notice={notice} />;
}
