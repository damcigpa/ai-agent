import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

const USERS_FILE = path.join(process.cwd(), "users.json");

type User = { id: string; email: string; passwordHash: string };

function loadUsers(): User[] {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}

function saveUsers(users: User[]) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

export async function createUser(email: string, password: string): Promise<User> {
  const users = loadUsers();
  if (users.find((u) => u.email === email)) {
    throw new Error("User already exists");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user: User = { id: Date.now().toString(), email, passwordHash };
  users.push(user);
  saveUsers(users);
  return user;
}

export async function verifyUser(email: string, password: string): Promise<User | null> {
  const users = loadUsers();
  const user = users.find((u) => u.email === email);
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}