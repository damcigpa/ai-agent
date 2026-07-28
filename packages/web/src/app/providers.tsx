"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { ModelProvider } from "../hooks/useModel";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ModelProvider>{children}</ModelProvider>
    </SessionProvider>
  );
}
