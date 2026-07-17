import { defineConfig } from "@playwright/test";

const e2eDatabase = `data/e2e-research-update-${Date.now()}.db`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4173", viewport: { width: 1280, height: 800 } },
  webServer: {
    command: "node --import tsx src/server/index.ts",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    timeout: 60_000,
    env: {
      NODE_ENV: "test",
      FIXTURE_MODE: "1",
      DATABASE_PATH: e2eDatabase,
      PORT: "4173",
    },
  },
});
