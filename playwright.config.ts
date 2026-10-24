import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:3000", headless: true },
  webServer: {
    command: "npm run start",
    env: { GTM_ADMIN_TOKEN: "test-only-admin-token-000000000000000000000000", GTM_EVENTS_TOKEN: "test-only-events-token-00000000000000000000000", GTM_PUBLIC_URL: "http://127.0.0.1:3000", GTM_DATA_DIR: ".gtm-data/e2e" },
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
