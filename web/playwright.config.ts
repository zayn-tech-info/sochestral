import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", timezoneId: "UTC", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  webServer: {
    command: "NEXT_PUBLIC_API_URL=http://127.0.0.1:8789 npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    timeout: 120000,
    reuseExistingServer: false,
  },
});
