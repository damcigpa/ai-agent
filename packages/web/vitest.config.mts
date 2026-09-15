import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
  ],
  test: {
    projects: [
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "browser",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          globals: true,
          include: [
            "src/components/**/*.test.{ts,tsx}",
            "src/hooks/**/*.test.{ts,tsx}",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          globals: true,
          include: [
            "src/app/api/**/*.test.{ts,tsx}",
            "src/graphql/**/*.test.{ts,tsx}",
            "src/lib/**/*.test.{ts,tsx}",
          ],
          exclude: ["**/*.integration.test.ts"],
        },
      },
    ],
    exclude: ["node_modules", ".next"],
  },
});