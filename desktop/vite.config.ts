import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../client/src"),
      "@shared": path.resolve(import.meta.dirname, "../shared"),
    },
  },
  clearScreen: false,
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true, target: "es2021" },
});
