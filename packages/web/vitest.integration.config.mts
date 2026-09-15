import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    environment: "node",
    globals: true,
    include: ["src/lib/**/*.integration.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});