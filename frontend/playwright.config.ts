import process from 'node:process';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  retries: 0,
  outputDir: '../docs/entrega/A/e2e-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: '../docs/entrega/A/e2e-report', open: 'never' }],
    ['json', { outputFile: '../docs/entrega/A/e2e-results.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4179',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: 'on',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 960 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
