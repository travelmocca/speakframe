import { chromium } from '@playwright/test';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const db = new Database('var/app.sqlite', { readonly: true });
const sample = db.prepare(`SELECT a.id,a.practiceId,a.filename,u.phone FROM attempts a JOIN practices p ON p.id=a.practiceId JOIN users u ON u.id=p.userId
  WHERE a.status='failed' AND p.title='端到端验证：先检查数据再决定重跑' AND u.phone LIKE '139%' ORDER BY a.createdAt DESC LIMIT 1`).get();
db.close();
if (!sample) { console.log('No remaining historical failed fixture; no retry pass claimed.'); process.exit(0); }
const hash = () => createHash('sha256').update(readFileSync(join('var/audio', sample.filename))).digest('hex');
const before = hash();
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage();
try {
  await page.goto('http://127.0.0.1:3118/auth');
  await page.getByLabel('手机号', { exact: true }).fill(sample.phone);
  await page.getByLabel('密码', { exact: true }).fill('Expression-test-2026');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL('**/practices');
  await page.goto(`http://127.0.0.1:3118/practices/${sample.practiceId}?attempt=${sample.id}`);
  await page.getByRole('button', { name: '重新分析', exact: true }).waitFor();
  await page.screenshot({ path: 'outputs/uat/retry-before.png', fullPage: true });
  await page.getByRole('button', { name: '重新分析', exact: true }).click();
  await page.getByTestId('transcript').waitFor({ timeout: 180000 });
  await page.screenshot({ path: 'outputs/uat/retry-after.png', fullPage: true });
  const after = hash(); if (before !== after) throw new Error('Original recording changed during retry');
  writeFileSync('outputs/uat/real-failure-retry.json', JSON.stringify({ testedAt: new Date().toISOString(), attemptId: sample.id, origin: 'Earlier real Omni schema failure, not an injected failure', retryClickedInBrowser: true, realModelCompleted: true, originalAudioHashUnchanged: true }, null, 2));
  console.log('PASS: historical real model failure retried through the browser, real model completed, original recording unchanged.');
} finally { await browser.close(); }
