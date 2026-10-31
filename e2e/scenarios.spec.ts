import { expect, test } from '@playwright/test';
import { SCENARIOS } from '../src/lib/scenarios';
test.use({ actionTimeout: 15000 });
test('selects among six scenarios before creating a practice and retains the chosen framework', async ({ page }) => {
  await page.goto('/auth');
  await page.getByRole('button', { name: '注册新账号' }).click();
  await page.getByLabel('手机号', { exact: true }).fill('134' + Date.now().toString().slice(-8));
  await page.getByLabel('密码', { exact: true }).fill('Scenario-test-password');
  await page.getByLabel('确认密码', { exact: true }).fill('Scenario-test-password');
  await page.getByRole('button', { name: '创建账号' }).click();
  await page.getByRole('button', { name: '新建练习', exact: true }).click();
  await expect(page).toHaveURL(/\/practices\/new$/);
  await expect(page.getByRole('radio')).toHaveCount(6);
  await expect(page.getByRole('button', { name: '开始练习', exact: true })).toBeDisabled();
  const origin = new URL(page.url()).origin, headers = { Origin: origin };
  for (const scenario of SCENARIOS) {
    await page.getByRole('radio', { name: scenario.title, exact: true }).check();
    await expect(page.locator('.scenario-preview')).toContainText(scenario.example);
  }
  expect((await (await page.request.get('/api/practices')).json()).practices).toHaveLength(0);
  expect((await page.request.post('/api/practices', { headers, data: {} })).status()).toBe(400);
  expect((await page.request.post('/api/practices', { headers, data: { scenario: 'invented' } })).status()).toBe(400);
  await page.getByRole('radio', { name: '汇报进展、说明情况', exact: true }).check();
  await page.reload();
  await expect(page.getByRole('radio', { name: '汇报进展、说明情况', exact: true })).toBeChecked();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `outputs/uat/scenario-selection-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: '开始练习', exact: true }).click();
  const guide = page.getByRole('region', { name: '本次表达框架' });
  await expect(guide).toContainText('现状'); await expect(guide).toContainText('差距或影响'); await expect(guide).toContainText('下一步');
  await guide.getByText('看一个例子', { exact: true }).click();
  await expect(guide).toContainText('开发已完成，测试还剩两项');
  const id = new URL(page.url()).pathname.split('/').at(-1);
  try {
    const { practice } = await (await page.request.get(`/api/practices/${id}`)).json(); expect(practice.scenario).toBe('update');
    await page.reload(); await expect(guide).toContainText('汇报进展、说明情况');
    await page.screenshot({ path: 'outputs/uat/scenario-recording-mobile.png', fullPage: true });
  } finally { await page.request.delete(`/api/practices/${id}`, { headers }); }
});
