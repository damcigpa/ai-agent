"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // native required/email validation already ran by this point
    setError("");

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(
        typeof data.error === "string"
          ? data.error
          : Object.values(data.error ?? {}).flat().join(", ")
      );
      return;
    }

    router.push("/login");
  };

  return (
    <main className="flex flex-col items-center justify-center h-screen max-w-sm mx-auto p-4 gap-4">
      <h1 className="text-xl font-semibold">Sign up</h1>

      <form onSubmit={handleSubmit} className="flex flex-col w-full gap-4">
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full border rounded-xl px-4 py-2"
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full border rounded-xl px-4 py-2"
        />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="w-full border rounded-xl px-4 py-2"
        />

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          className="w-full bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600"
        >
          Sign up
        </button>
      </form>

      <a href="/login" className="text-sm text-blue-500 hover:underline">
        Already have an account? Log in
      </a>
    </main>
  );
}
