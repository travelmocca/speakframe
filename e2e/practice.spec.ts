import { chooseScenario } from './helpers';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ actionTimeout: 15000 });

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

test('three real recording rounds, automatic comprehensive comparisons, text and voice reflections, persistence and deletion', async ({ page }) => {
  test.setTimeout(420000);
  await page.goto('/auth'); await page.getByRole('button', { name: '注册新账号' }).click();
  await page.getByLabel('手机号', { exact: true }).fill('139' + Date.now().toString().slice(-8));
  await page.getByLabel('密码', { exact: true }).fill('Expression-test-2026'); await page.getByLabel('确认密码', { exact: true }).fill('Expression-test-2026');
  await page.getByRole('button', { name: '创建账号' }).click(); await page.getByRole('button', { name: '新建练习', exact: true }).click(); await chooseScenario(page);
  const practiceUrl = page.url(), id = new URL(practiceUrl).pathname.split('/').at(-1);
  await page.getByLabel('表达主题').fill('端到端验证：先检查数据再决定重跑');
  for (let round = 1; round <= 3; round++) {
    if (round > 1) { await page.getByRole('button', { name: '再练一次', exact: true }).click(); await expect(page.getByRole('heading', { name: '本轮综合练习' })).toBeVisible(); }
    await page.getByRole('button', { name: '开始录音', exact: true }).click();
    await expect(page.getByText('正在录音', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '本次表达框架' })).toBeVisible();
    const liveWave = page.getByRole('img', { name: '实时录音音量' }); await expect(liveWave).toBeVisible();
    const initial = await liveWave.locator('i').evaluateAll(bars => bars.map(b => (b as HTMLElement).style.transform));
    await expect.poll(() => liveWave.locator('i').evaluateAll(bars => bars.map(b => (b as HTMLElement).style.transform))).not.toEqual(initial);
    await page.waitForTimeout(8200); await page.getByRole('button', { name: '结束录音', exact: true }).click();
    await page.getByRole('button', { name: '保存并分析', exact: true }).click();
    await expect(page.getByRole('heading', { name: `第 ${round} 次表达`, exact: true })).toBeVisible();
    await expect(page.getByTestId('transcript')).toBeVisible({ timeout: 180000 });
    await expect(page.getByTestId('transcript')).not.toBeEmpty();
    await expect(page.getByRole('button', { name: '针对这个问题重练' })).toHaveCount(0);
    if (round > 1) {
      await expect(page.getByTestId('comparison-result')).toBeVisible({ timeout: 180000 });
      await expect(page.locator('.dimension-changes > section')).toHaveCount(5);
    }
  }
  const { practice } = await (await page.request.get(`/api/practices/${id}`)).json();
  expect(practice.attempts).toHaveLength(3); expect(practice.comparisons).toHaveLength(2);
  expect(practice.attempts[1].sourceId).toBe(practice.attempts[0].id); expect(practice.attempts[2].sourceId).toBe(practice.attempts[1].id);
  await page.getByRole('button', { name: '前后对比', exact: true }).click(); await expect(page.locator('audio')).toHaveCount(2);
  for (const audio of await page.locator('audio').all()) { const source = await audio.getAttribute('src'); expect((await page.request.get(source!, { headers: { Range: 'bytes=0-1023' } })).status()).toBe(206); }
  await page.screenshot({ path: 'outputs/uat/comprehensive-comparison-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'outputs/uat/comprehensive-comparison-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '退出练习', exact: true }).click();
  await page.getByLabel('本次练习感悟', { exact: true }).fill('这次要先说结论，再给具体例子。');
  await page.getByRole('button', { name: '保存感悟并退出', exact: true }).click(); await expect(page).toHaveURL(/\/practices$/);
  await page.locator('.practice-title').filter({ hasText: '端到端验证：先检查数据再决定重跑' }).click();
  await page.getByText('查看练习感悟（1）', { exact: true }).click(); await expect(page.getByText('这次要先说结论，再给具体例子。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出练习', exact: true }).click();
  await page.getByLabel('本次练习感悟', { exact: true }).fill('我发现：');
  await page.getByRole('button', { name: '语音输入感悟', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存感悟并退出', exact: true })).toBeDisabled();
  await page.waitForTimeout(8000); await page.getByRole('button', { name: '结束并转文字', exact: true }).click();
  await expect(page.getByLabel('本次练习感悟', { exact: true })).toHaveValue(/我发现：[\s\S]*数据/, { timeout: 180000 });
  await expect(page.getByRole('button', { name: '保存感悟并退出', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'outputs/uat/exit-reflection-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '保存感悟并退出', exact: true }).click(); await expect(page).toHaveURL(/\/practices$/);
  await page.locator('.practice-title').filter({ hasText: '端到端验证：先检查数据再决定重跑' }).click();
  await expect(page).toHaveURL(new RegExp(`/practices/${id}`));
  await page.reload(); await page.getByText('查看练习感悟（2）', { exact: true }).click();
  await expect(page.locator('.reflection-history article')).toHaveCount(2);
  await page.getByRole('link', { name: '练习记录', exact: true }).click();
  await page.getByRole('button', { name: '删除练习', exact: true }).click(); await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByText('还没有练习记录')).toBeVisible();
  expect((await page.request.get(`/api/practices/${id}`)).status()).toBe(404);
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
  await chooseScenario(page);
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
  await chooseScenario(page);
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
