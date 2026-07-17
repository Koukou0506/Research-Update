import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

const port = "4173";
const databasePath = `data/e2e-research-update-${Date.now()}.db`;
const server = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
  env: { ...process.env, NODE_ENV: "test", FIXTURE_MODE: "1", DATABASE_PATH: databasePath, PORT: port },
  stdio: "ignore",
  windowsHide: true,
});

const waitForServer = async () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Test server exited with code ${server.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/status`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Timed out waiting for the test server");
};

let exitCode = 1;
try {
  await waitForServer();
  const playwright = spawn(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", ...process.argv.slice(2)], {
    env: { ...process.env, PLAYWRIGHT_REUSE_SERVER: "1" },
    stdio: "inherit",
    windowsHide: true,
  });
  [exitCode] = await once(playwright, "exit");
} finally {
  if (server.exitCode === null) {
    server.kill();
    await Promise.race([once(server, "exit"), new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000))]);
  }
}

process.exitCode = exitCode ?? 1;
