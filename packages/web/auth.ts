import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorize, jwt, session } from "./src/lib/authCallbacks";

export const { handlers, signIn, signOut } = NextAuth({
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

// Single local user, no login: every request counts as this one user.
// Every route and resolver that calls auth() keeps working unchanged.
export async function auth() {
  return {
    user: { id: "local", name: "Local user", email: "local@localhost" },
    expires: "2999-12-31T00:00:00.000Z",
  };
}