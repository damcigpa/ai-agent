import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorize, jwt, session } from "./src/lib/authCallbacks";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    jwt,
    session,
  },
  pages: {
    signIn: "/login",
  },
});