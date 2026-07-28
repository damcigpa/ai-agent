"use client";

import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // browser's native email/required validation already ran by this point
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      return;
    }

    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col p-6 w-80 gap-4">
      <h1 className="text-xl font-semibold">Log in</h1>

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
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="w-full border rounded-xl px-4 py-2"
      />

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        type="submit"
        className="w-full bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600"
      >
        Log in
      </button>

      <a href="/signup" className="text-sm text-blue-500 hover:underline text-center">
        Don't have an account? Sign up
      </a>
    </form>
  );
}
