// src/lib/users.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import {
  startDynamoDbLocal,
  stopDynamoDbLocal,
  createUsersTable,
  dropUsersTable,
} from "./__integration__/dynamoDbContainer";
import { createUser, getUserByEmail, verifyCredentials } from "./users";

beforeAll(async () => {
  await startDynamoDbLocal();
}, 30_000);

afterAll(async () => {
  await stopDynamoDbLocal();
});

beforeEach(async () => {
  await createUsersTable();
});

afterEach(async () => {
  await dropUsersTable();
});

describe("createUser (integration)", () => {
  it("actually persists the user and it's findable by email afterward", async () => {
    await createUser({ email: "a@b.com", password: "plaintext", name: "Alice" });

    const found = await getUserByEmail("a@b.com");

    expect(found).toMatchObject({ email: "a@b.com", name: "Alice" });
  });

  it("rejects a second signup with the same email", async () => {
    await createUser({ email: "a@b.com", password: "pw1", name: "Alice" });

    await expect(
      createUser({ email: "a@b.com", password: "pw2", name: "Alice Again" })
    ).rejects.toThrow("A user with this email already exists");
  });
});

describe("verifyCredentials (integration)", () => {
  it("succeeds end-to-end with the real bcrypt hash", async () => {
    await createUser({ email: "a@b.com", password: "correctpassword", name: "Alice" });

    const result = await verifyCredentials("a@b.com", "correctpassword");

    expect(result).toMatchObject({ email: "a@b.com", name: "Alice" });
  });

  it("fails end-to-end with a real bcrypt comparison against the wrong password", async () => {
    await createUser({ email: "a@b.com", password: "correctpassword", name: "Alice" });

    const result = await verifyCredentials("a@b.com", "wrongpassword");

    expect(result).toBeNull();
  });
});