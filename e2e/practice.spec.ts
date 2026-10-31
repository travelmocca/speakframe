import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.beforeEach(async ({ page, browserName }) => {
  if (browserName !== 'webkit') return;
  // Controlled speech source, actual WebKit MediaRecorder encoder, real upload and real model.
  await page.addInitScript(({ b64 }) => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const context = new AudioContext(), destination = context.createMediaStreamDestination();
      await context.resume();
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const source = context.createBufferSource(); source.buffer = await context.decodeAudioData(bytes.buffer); source.loop = true; source.connect(destination); source.start(); await context.resume();
      for (const track of destination.stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { stop(); source.stop(); void context.close(); }; }
      return destination.stream;
    } });
  }, { b64: readFileSync('outputs/omni-audio-samples/audio/05.wav').toString('base64') });
});

test('real browser recording, real Omni analysis, retry, comparison, persistence and deletion', async ({ page }) => {
  const phone = '139' + Date.now().toString().slice(-8);
  await page.goto('/auth');
  await page.getByRole('button', { name: '注册新账号' }).click();
  await page.getByLabel('手机号', { exact: true }).fill(phone);
  await page.getByLabel('密码', { exact: true }).fill('Expression-test-2026');
  await page.getByLabel('确认密码', { exact: true }).fill('Expression-test-2026');
  await page.getByRole('button', { name: '创建账号' }).click();
  await expect(page).toHaveURL(/\/practices$/);
  await page.getByRole('button', { name: '新建练习', exact: true }).click();
  await expect(page).toHaveURL(/\/practices\/.+/);
  const practiceUrl = page.url();
  await page.getByLabel('表达主题').fill('端到端验证：先检查数据再决定重跑');
  await expect(page.getByText('这次想讲清楚什么', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByText('正在录音', { exact: true })).toBeVisible();
  const liveWave = page.getByRole('img', { name: '实时录音音量' });
  await expect(liveWave).toBeVisible();
  const initialBars = await liveWave.locator('i').evaluateAll(bars => bars.map(b => (b as HTMLElement).style.transform));
  await expect.poll(() => liveWave.locator('i').evaluateAll(bars => bars.map(b => (b as HTMLElement).style.transform))).not.toEqual(initialBars);
  // This wait records actual MediaRecorder audio; it is not a readiness delay.
  await page.waitForTimeout(8200);
  await page.getByRole('button', { name: '结束录音', exact: true }).click();
  await expect(page.getByRole('img', { name: '实时录音音量' })).toHaveCount(0);
  await expect(page.locator('audio')).toHaveCount(1);
  await page.getByRole('button', { name: '保存并分析', exact: true }).click();
  await expect(page.locator('.analysis-wait .processing-wave')).toBeVisible();
  await expect(page.getByTestId('transcript')).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('transcript')).not.toBeEmpty();
  await expect(page.getByRole('button', { name: '针对这个问题重练' }).first()).toBeVisible();
  await page.screenshot({ path: 'outputs/uat/analysis-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '针对这个问题重练' }).first().click();
  await expect(page.getByText('本次重练目标')).toBeVisible();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await page.waitForTimeout(8200);
  await page.getByRole('button', { name: '结束录音', exact: true }).click();
  await page.getByRole('button', { name: '保存并分析', exact: true }).click();
  await expect(page.getByRole('heading', { name: '第 2 次表达', exact: true })).toBeVisible();
  await expect(page.getByTestId('transcript')).toBeVisible({ timeout: 180_000 });
  await page.getByRole('button', { name: '针对这个问题重练' }).first().click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: '结束录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '前后对比', exact: true })).toBeDisabled();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '取消重练', exact: true }).click();
  await page.getByRole('button', { name: '比较两次表现', exact: true }).click();
  await expect(page.getByTestId('comparison-result')).toBeVisible({ timeout: 180_000 });
  await page.reload();
  await expect(page.getByTestId('comparison-result')).toBeVisible();
  await page.getByRole('button', { name: '前后对比', exact: true }).click();
  await expect(page.locator('audio')).toHaveCount(2);
  for (const audio of await page.locator('audio').all()) {
    const source = await audio.getAttribute('src');
    const response = await page.request.get(source!, { headers: { Range: 'bytes=0-1023' } });
    expect(response.status()).toBe(206);
  }
  await page.screenshot({ path: 'outputs/uat/comparison-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'outputs/uat/comparison-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: '练习记录', exact: true }).click();
  await expect(page.getByText('端到端验证：先检查数据再决定重跑')).toBeVisible();
  await page.getByRole('button', { name: '删除练习' }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByText('还没有练习记录')).toBeVisible();
  await page.goto(practiceUrl);
  await expect(page.getByText('练习不存在或无权访问')).toBeVisible();
});

test('microphone denial has an actionable error without fake success', async ({ browser }) => {
  const context = await browser.newContext({ permissions: [] });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) });
  });
  await page.goto('/auth');
  await page.getByRole('button', { name: '注册新账号' }).click();
  await page.getByLabel('手机号', { exact: true }).fill('137' + Date.now().toString().slice(-8));
  await page.getByLabel('密码', { exact: true }).fill('Expression-test-2026');
  await page.getByLabel('确认密码', { exact: true }).fill('Expression-test-2026');
  await page.getByRole('button', { name: '创建账号' }).click();
  await page.getByRole('button', { name: '新建练习', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('region', { name: '录音区域' }).getByRole('alert')).toContainText('麦克风');
  await expect(page.locator('audio')).toHaveCount(0);
  await context.close();
});

test('canceling navigation and logout preserves an unsaved browser recording', async ({ page }) => {
  await page.goto('/auth');
  await page.getByRole('button', { name: '注册新账号' }).click();
  await page.getByLabel('手机号', { exact: true }).fill('133' + Date.now().toString().slice(-8));
  await page.getByLabel('密码', { exact: true }).fill('Expression-test-2026');
  await page.getByLabel('确认密码', { exact: true }).fill('Expression-test-2026');
  await page.getByRole('button', { name: '创建账号' }).click();
  await page.getByRole('button', { name: '新建练习', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: '结束录音', exact: true }).click();
  await expect(page.locator('audio')).toHaveCount(1);
  const original = page.url();
  page.once('dialog', d => d.dismiss());
  await page.getByRole('link', { name: '练习记录', exact: true }).click();
  await expect(page).toHaveURL(original);
  await expect(page.locator('audio')).toHaveCount(1);
  page.once('dialog', d => d.dismiss());
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(original);
  await expect(page.locator('audio')).toHaveCount(1);
  page.once('dialog', d => d.dismiss());
  await page.goBack();
  // Some routers restore before the guard fires; returning must recover the local recording.
  if (page.url() !== original) await page.goForward();
  await expect(page).toHaveURL(original);
  await expect(page.locator('audio')).toHaveCount(1);
});
