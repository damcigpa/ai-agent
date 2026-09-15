import { verifyCredentials } from "./users";
import { credentialsSchema } from "./schemas";
import type { JWT } from "next-auth/jwt";
import type { Session, User } from "next-auth";

// --- Credentials provider's authorize function ---
// Validates shape first, then verifies against stored credentials.
// Returns the minimal user shape NextAuth expects, or null on any failure.

export async function authorize(
  credentials: Record<string, unknown> | undefined
): Promise<{ id: string; email: string; name: string } | null> {
  const parsed = credentialsSchema.safeParse(credentials);
  if (!parsed.success) return null;

  const { email, password } = parsed.data;

  const user = await verifyCredentials(email, password);
  if (!user) return null;

  return {
    id: user.userId,
    email: user.email,
    name: user.name,
  };
}

// --- JWT callback ---
// Runs on sign-in (when `user` is present) and on every subsequent
// token refresh (when `user` is undefined) — only copy userId across
// on the initial sign-in, otherwise leave the existing token untouched.

export async function jwt({
  token,
  user,
}: {
  token: JWT;
  user?: User;
}): Promise<JWT> {
  if (user) {
    token.userId = user.id;
  }
  return token;
}

// --- Session callback ---
// Exposes the token's userId on session.user.id, so server code can
// read `session.user.id` directly instead of digging into the token.

export async function session({
  session,
  token,
}: {
  session: Session;
  token: JWT;
}): Promise<Session> {
  if (session.user) {
    session.user.id = token.userId as string;
  }
  return session;
}