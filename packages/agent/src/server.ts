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

  try {
    const stream = hub([{ role: "user", content: message }], model ?? "claude-haiku-4-5-20251001");
    const reader = stream.getReader();
    let finalResult = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === "done") finalResult = value.data;
    }
    res.json({ response: finalResult });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Something went wrong" });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Agent server running on http://localhost:${PORT}`));