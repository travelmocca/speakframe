import { expect, test } from '@playwright/test';

test('dictates a topic with real Omni, persists it, and does not require a separate goal', async ({ page }) => {
  await page.goto('/auth');
  await page.getByRole('button', { name: '注册新账号' }).click();
  await page.getByLabel('手机号', { exact: true }).fill('131' + Date.now().toString().slice(-8));
  await page.getByLabel('密码', { exact: true }).fill('Topic-test-password');
  await page.getByLabel('确认密码', { exact: true }).fill('Topic-test-password');
  await page.getByRole('button', { name: '创建账号' }).click();
  await page.getByRole('button', { name: '新建练习', exact: true }).click();
  await expect(page.getByLabel('表达主题', { exact: true })).toBeVisible();
  await expect(page.getByText('这次想讲清楚什么', { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let first = true;
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (first) { first = false; await new Promise(resolve => setTimeout(resolve, 2000)); throw new DOMException('Test permission rejection', 'NotAllowedError'); }
      return original(constraints);
    };
  });
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '语音输入主题', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '语音输入主题', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '语音输入主题', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '取消语音输入', exact: true }).click();
  await expect(page.getByLabel('表达主题', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '语音输入主题', exact: true }).click();
  const liveWave = page.getByRole('img', { name: '实时录音音量' });
  await expect(liveWave).toBeVisible();
  const initialBars = await liveWave.locator('i').evaluateAll(bars => bars.map(b => (b as HTMLElement).style.transform));
  await expect.poll(() => liveWave.locator('i').evaluateAll(bars => bars.map(b => (b as HTMLElement).style.transform))).not.toEqual(initialBars);
  await page.screenshot({ path: 'outputs/uat/recording-wave.png', fullPage: true });
  await page.waitForTimeout(8000);
  await page.getByRole('button', { name: '结束并转文字', exact: true }).click();
  await expect(liveWave).toHaveCount(0);
  const wave = page.getByRole('group', { name: '主题语音输入' }).locator('.processing-wave');
  await expect(wave).toBeVisible();
  expect(await wave.locator('i').first().evaluate(el => getComputedStyle(el).animationName)).toBe('processing-wave');
  await expect(page.getByLabel('表达主题', { exact: true })).toHaveValue(/数据/, { timeout: 180000 });
  await expect(page.getByRole('button', { name: '语音输入主题', exact: true })).toBeEnabled({ timeout: 15000 });
  await expect(wave).toHaveCount(0);
  const title = await page.getByLabel('表达主题', { exact: true }).inputValue();
  const url = page.url(), id = new URL(url).pathname.split('/').at(-1);
  await page.reload();
  await expect(page.getByLabel('表达主题', { exact: true })).toHaveValue(title);
  const { practice } = await (await page.request.get(`/api/practices/${id}`)).json();
  expect(practice.goal).toBe(''); expect(practice.attempts).toHaveLength(0);
  await page.screenshot({ path: 'outputs/uat/topic-voice-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'outputs/uat/topic-voice-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.request.delete(`/api/practices/${id}`, { headers: { Origin: new URL(url).origin } });
});
