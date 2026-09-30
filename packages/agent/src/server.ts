import "dotenv/config";
import express from "express";
import cors from "cors";
import { hub } from "./hub/index.js";
import jwt from "jsonwebtoken";
import { createUser, verifyUser } from "./users.js";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-this";
import { Request, Response, NextFunction } from "express";

const app = express();
app.use(cors());
app.use(express.json());


function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    (req as any).user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.post("/chat", requireAuth, async (req, res) => {
  const { message, model } = req.body as { message: string; model?: string };
  if (!message) return res.status(400).json({ error: "message is required" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  try {
    const stream = hub([{ role: "user", content: message }], model ?? "claude-haiku-4-5-20251001");
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(`data: ${JSON.stringify(value)}\n\n`);
    }
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: "error", data: (e as Error).message })}\n\n`);
  } finally {
    res.end();
  }
});

app.post("/register", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  try {
    const user = await createUser(email, password);
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await verifyUser(email, password);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Agent server running on http://localhost:${PORT}`));