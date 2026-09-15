import { describe, it, expect, vi, beforeEach } from "vitest";
import { authorize, jwt, session } from "./authCallbacks";
import { verifyCredentials } from "./users";
import type { SafeUser } from "./users";
import type { JWT } from "next-auth/jwt";
import type { Session } from "next-auth";

vi.mock("./users", () => ({
  verifyCredentials: vi.fn(),
}));

function makeSafeUser(overrides: Partial<SafeUser> = {}): SafeUser {
  return {
    userId: "user-1",
    email: "a@b.com",
    name: "A",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authorize", () => {
  it("returns null when credentials are undefined", async () => {
    const result = await authorize(undefined);

    expect(result).toBeNull();
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("returns null when email is not a valid email address", async () => {
    const result = await authorize({
      email: "not-an-email",
      password: "somepassword",
    });

    expect(result).toBeNull();
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("returns null when password is missing", async () => {
    const result = await authorize({
      email: "a@b.com",
      password: "",
    });

    expect(result).toBeNull();
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("returns null when verifyCredentials rejects the login (wrong password)", async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(null);

    const result = await authorize({
      email: "a@b.com",
      password: "wrongpassword",
    });

    expect(result).toBeNull();
    expect(verifyCredentials).toHaveBeenCalledWith("a@b.com", "wrongpassword");
  });

  it("returns the mapped user shape on successful login", async () => {
    vi.mocked(verifyCredentials).mockResolvedValue(
      makeSafeUser({ userId: "user-42", email: "a@b.com", name: "Alice" })
    );

    const result = await authorize({
      email: "a@b.com",
      password: "correctpassword",
    });

    // authorize must map userId -> id — NextAuth's User shape expects "id",
    // not "userId". A refactor that forgot this mapping would silently
    // break session.user.id downstream, since the jwt callback reads user.id.
    expect(result).toEqual({
      id: "user-42",
      email: "a@b.com",
      name: "Alice",
    });
  });
});

describe("jwt callback", () => {
  it("copies user.id onto the token on initial sign-in", async () => {
    const token = {} as JWT;
    const user = { id: "user-1", email: "a@b.com", name: "A" } as any;

    const result = await jwt({ token, user });

    expect(result.userId).toBe("user-1");
  });

  it("leaves an existing token's userId untouched on token refresh (no user present)", async () => {
    const token = { userId: "user-1" } as JWT;

    const result = await jwt({ token, user: undefined });

    expect(result.userId).toBe("user-1");
  });
});

describe("session callback", () => {
  it("exposes the token's userId on session.user.id", async () => {
    const token = { userId: "user-1" } as JWT;
    const sessionInput = {
      user: { email: "a@b.com", name: "A" },
      expires: "2026-01-01T00:00:00.000Z",
    } as unknown as Session;

    const result = await session({ session: sessionInput, token });

    expect(result.user!.id).toBe("user-1");
  });

  it("does not throw when session.user is missing", async () => {
    const token = { userId: "user-1" } as JWT;
    const sessionInput = {
      user: undefined,
      expires: "2026-01-01T00:00:00.000Z",
    } as unknown as Session;

    const result = await session({ session: sessionInput, token });

    expect(result.user).toBeUndefined();
  });
});