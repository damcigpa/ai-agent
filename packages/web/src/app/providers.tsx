"use client";

import { SessionProvider } from "next-auth/react";
import { ApolloProvider } from "@apollo/client/react";
import { ReactNode } from "react";
import { ModelProvider } from "../hooks/useModel";
import { apolloClient } from "../lib/apolloClient";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ApolloProvider client={apolloClient}>
        <ModelProvider>{children}</ModelProvider>
      </ApolloProvider>
    </SessionProvider>
  );
}
