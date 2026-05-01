import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "hunter2",
      SESSION_SECRET: "this_is_a_test_secret_at_least_32_chars_long_seriously",
      MONGODB_URI: "mongodb://127.0.0.1:27017/utter_e2e",
      R2_ACCOUNT_ID: "test",
      R2_ACCESS_KEY_ID: "test",
      R2_SECRET_ACCESS_KEY: "test",
      R2_BUCKET: "utter",
      ANTHROPIC_API_KEY: "test",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
