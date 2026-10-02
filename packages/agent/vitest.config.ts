import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // client.ts calls `new Anthropic()` at module load, which throws without a key.
    // A fake key lets modules load in tests; any call that slips past a mock
    // fails with 401 instead of spending real credits.
    env: {
      ANTHROPIC_API_KEY: "test-key-not-real",
      TAVILY_API_KEY: "test-key-not-real",
      VOYAGEAI_API_KEY: "test-key-not-real",
    },
  },
});