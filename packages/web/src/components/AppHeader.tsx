"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { ModelSelector } from "./ModelSelector";

function AuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") return null;

  if (session?.user) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <Link href="/history" className="text-blue-500 hover:underline">
          History
        </Link>
        <span className="text-gray-600">{session.user.name}</span>
        <button
          onClick={() => signOut()}
          className="text-blue-500 hover:underline"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <Link href="/login" className="text-sm text-blue-500 hover:underline">
      Log in
    </Link>
  );
}

// Standalone — invokes its own state (useSession) internally, takes zero props.
export function AppHeader() {
  return (
    <div className="flex items-center justify-between mb-4">
      <h1 className="text-xl font-semibold">Exam Prep Assistant</h1>
      <div className="flex items-center gap-3">
        <ModelSelector />
        <AuthButton />
      </div>
    </div>
  );
}
