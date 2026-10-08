import { defineConfig } from '@playwright/test';

// This suite pushes a real commit to a real (disposable) DataHUB project on
// every run - no retries, so a failure is never masked by a silent re-push.
export default defineConfig({
  testDir: '.',
  timeout: 5 * 60 * 1000,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
