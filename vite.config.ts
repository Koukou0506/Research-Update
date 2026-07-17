import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist/client" },
  server: { proxy: { "/api": "http://localhost:4173" } },
  test: { environment: "jsdom", exclude: [...configDefaults.exclude, "tests/e2e/**", ".worktrees/**"] },
});
