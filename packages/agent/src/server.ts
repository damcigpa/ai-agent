import "dotenv/config";
import express from "express";
import cors from "cors";
import { hub } from "./hub/index.js";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/chat", async (req, res) => {
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

const PORT = 3001;
app.listen(PORT, () => console.log(`Agent server running on http://localhost:${PORT}`));