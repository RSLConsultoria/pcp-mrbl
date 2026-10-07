import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173/pcp-mrbl/', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:e2e && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/pcp-mrbl/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
