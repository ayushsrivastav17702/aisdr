import { defineConfig } from "vitest/config";
import path from "path";
import { config } from "dotenv";

// Load test environment variables before any test file imports server code
config({ path: path.resolve(__dirname, ".env.test") });

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    globalSetup: ["./tests/fixtures/global-setup.ts"],
    setupFiles: ["./tests/fixtures/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        "tests/",
        "**/*.d.ts",
        "**/*.config.*",
      ],
    },
    reporters: ["verbose", "json"],
    outputFile: {
      json: "./test-results/results.json",
    },
    pool: "forks",
    isolate: true,
    sequence: {
      shuffle: false,
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
      "@": path.resolve(__dirname, "../client/src"),
    },
  },
});
