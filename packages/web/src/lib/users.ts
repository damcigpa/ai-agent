import {
  PutCommand,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "./dynamodb";

export interface User {
  userId: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
}

// Shape returned to callers — never includes the password hash
export type SafeUser = Omit<User, "passwordHash">;

const TABLE_NAME = "Users";
const EMAIL_INDEX = "EmailIndex";

function toSafeUser(user: User): SafeUser {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

// --- Create a new user (signup) ---

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<SafeUser> {
  const existing = await getUserByEmail(input.email);
  if (existing) {
    throw new Error("A user with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const user: User = {
    userId: randomUUID(),
    email: input.email.toLowerCase(),
    passwordHash,
    name: input.name,
    createdAt: new Date().toISOString(),
  };

  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: user,
    })
  );

  return toSafeUser(user);
}

// --- Get a user by their userId (the stable identifier) ---

export async function getUserById(userId: string): Promise<SafeUser | null> {
  const result = await db.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { userId },
    })
  );

  return result.Item ? toSafeUser(result.Item as User) : null;
}

// --- Get a user by email, via the GSI — used for login lookup ---

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: EMAIL_INDEX,
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": email.toLowerCase(),
      },
    })
  );

  return (result.Items?.[0] as User) ?? null;
}

// --- Verify credentials at login time ---

export async function verifyCredentials(
  email: string,
  password: string
): Promise<SafeUser | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) return null;

  return toSafeUser(user);
}
