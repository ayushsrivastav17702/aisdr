/**
 * Vitest global setup — starts the Express server on TEST_PORT before any test file runs,
 * then tears it down after all tests complete.
 */
import { spawn, ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

// Load test env so PORT and DATABASE_URL are available when we spawn the server
config({ path: path.resolve(__dirname, "../.env.test") });

const TEST_PORT = parseInt(process.env.PORT || "5001", 10);

let serverProcess: ChildProcess | null = null;

function waitForServer(port: number, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const http = require("http");
      const req = http.get(`http://localhost:${port}/api/csrf-token`, (res: any) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Server did not start on port ${port} within ${timeoutMs}ms`));
        } else {
          setTimeout(check, 300);
        }
      });
      req.end();
    };
    check();
  });
}

export async function setup() {
  console.log(`\n🚀 [GlobalSetup] Starting test server on port ${TEST_PORT}...`);

  const serverEnv = {
    ...process.env,
    PORT: String(TEST_PORT),
    NODE_ENV: "test",
  };

  serverProcess = spawn("npx", ["tsx", "server/index.ts"], {
    cwd: ROOT,
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  serverProcess.stdout?.on("data", (data) => {
    process.stdout.write(`[server] ${data}`);
  });
  serverProcess.stderr?.on("data", (data) => {
    process.stderr.write(`[server:err] ${data}`);
  });

  await waitForServer(TEST_PORT);
  console.log(`✅ [GlobalSetup] Test server ready on port ${TEST_PORT}`);
}

export async function teardown() {
  if (serverProcess) {
    console.log("\n🛑 [GlobalSetup] Stopping test server...");
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
}
