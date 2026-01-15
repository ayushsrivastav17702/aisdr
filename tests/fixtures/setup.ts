import { beforeAll, afterAll, beforeEach, afterEach } from "vitest";

beforeAll(async () => {
  console.log("🧪 Test suite starting...");
  
  if (!process.env.DATABASE_URL) {
    console.warn("⚠️ DATABASE_URL not set. Some tests may fail.");
  }
  
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = "test-session-secret-for-testing-only";
  }
  
  process.env.NODE_ENV = "test";
  process.env.DEMO_MODE = "true";
});

afterAll(async () => {
  console.log("🧪 Test suite completed.");
});

beforeEach(() => {
});

afterEach(() => {
});

process.on("unhandledRejection", (reason: any) => {
  console.error("Unhandled rejection in test:", reason);
});

process.on("uncaughtException", (error: Error) => {
  console.error("Uncaught exception in test:", error);
});
