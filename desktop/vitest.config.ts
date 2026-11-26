import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  root: import.meta.dirname,
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../client/src") } },
  test: { environment: "node", include: ["src/**/*.test.ts", "tests/**/*.test.ts"] },
});
