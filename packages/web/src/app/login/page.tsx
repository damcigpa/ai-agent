"use client";

import { useRouter } from "next/navigation";
import { LoginForm } from "../../components/LoginForm";

export default function LoginPage() {
  const router = useRouter();

  return (
    <main className="flex items-center justify-center h-screen">
      <LoginForm onSuccess={() => router.push("/")} />
    </main>
  );
}
