import { defineConfig } from '@playwright/test';
import path from 'node:path';
export default defineConfig({
  testDir: './e2e', timeout: 240_000, workers: 1,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:3000',
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', permissions: ['microphone'], launchOptions: {
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve('outputs/omni-audio-samples/audio/05.wav')}`],
    } } }, { name: 'webkit', use: { browserName: 'webkit' } }],
  reporter: [['list'], ['html', { open: 'never' }]],
});
