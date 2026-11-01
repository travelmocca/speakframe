import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Store } from '../src/lib/store';
import { parseAnalysis } from '../src/lib/analysis-schema';

test.use({ actionTimeout: 15000 });

// Controlled feedback fixtures exercise workspace states; the other E2E suite calls real Omni.
test('workspace history, issue dimensions, source retry, responsive layout and deletion', async ({ page }) => {
  await page.goto('/auth');
  await page.getByRole('button', { name: '注册新账号' }).click();
  await page.getByLabel('手机号', { exact: true }).fill('132' + Date.now().toString().slice(-8));
  await page.getByLabel('密码', { exact: true }).fill('Workspace-test-password');
  await page.getByLabel('确认密码', { exact: true }).fill('Workspace-test-password');
  await page.getByRole('button', { name: '创建账号' }).click();
  await expect(page.getByRole('heading', { name: '我的表达工作台' })).toBeVisible();
  await expect(page.getByText('还没有练习记录')).toBeVisible();
  const ids: string[] = [], origin = new URL(page.url()).origin;
  const headers = { Origin: origin };
  const { user } = await (await page.request.get('/api/me')).json();
  const { activity: initialActivity } = await (await page.request.get('/api/workspace')).json();
  const today = initialActivity.today as string, currentYear = Number(today.slice(0, 4)), oldDate = `${currentYear - 1}-01-02`;
  const db = new Store(resolve(process.env.APP_DATA_DIR || 'var'));
  try {
    const dimensions = ['抓重点', '排顺序', '展开内容', '衔接与恢复', '口头禅与语气垫词'].map(name => ({ name, finding: '测试观察' }));
    const themes = ['测试样本：向同事说明项目调整的原因', '测试样本：先检查数据，再决定是否重跑', '测试样本：准备明天的客户沟通'];
    for (let index = 0; index < themes.length; index++) {
      const { practice } = await (await page.request.post('/api/practices', { headers, data: { scenario: 'opinion' } })).json(); ids.push(practice.id);
      await page.request.patch(`/api/practices/${practice.id}`, { headers, data: { title: themes[index] } });
      if (index === 2) continue;
      const upload = await page.request.post(`/api/practices/${practice.id}/attempts`, { headers, multipart: { audio: { name: 'sample.wav', mimeType: 'audio/wav', buffer: readFileSync('outputs/omni-audio-samples/audio/05.wav') } } });
      expect(upload.status()).toBe(201); const { attempt } = await upload.json();
      const analysis = parseAnalysis(JSON.stringify({ transcript: '然后，然后，我想说的是先检查数据。我还有很多想法。', dimensions,
        issues: index === 0 ? [
          { dimension: '抓重点', evidence: '我还有很多想法', impact: '没有明确最希望听众记住的结论。', suggestion: '先用一句话说出本次建议，再说明原因。' },
          { dimension: '展开内容', evidence: '先检查数据', impact: '建议缺少具体依据。', suggestion: '补充一次检查发现问题的具体例子。' },
        ] : [{ dimension: '口头禅与语气垫词', evidence: '然后，然后', impact: '重复的连接词打断主线。', suggestion: '删掉重复的然后，停顿后直接说下一句。' }], uncertainty: '自动化测试的受控反馈，不是真实模型结论。' }));
      db.db.prepare("UPDATE attempts SET status='done',analysis=?,transcript=?,createdAt=? WHERE id=?").run(JSON.stringify(analysis), analysis.transcript, index === 0 ? Date.parse(`${oldDate}T12:00:00+08:00`) : Date.now(), attempt.id);
    }
    await page.reload();
    await expect(page.locator('.practice-row')).toHaveCount(3);
    await expect(page.locator('.workspace-issue')).toHaveCount(3);
    await expect(page.locator('.workspace-issue[open]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '每日表达记录', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: '表达记录年份', exact: true }).selectOption(String(currentYear - 1));
    await page.getByRole('button', { name: `${oldDate}：1次表达`, exact: true }).click();
    await expect(page.locator('.activity-records li')).toHaveCount(1);
    await expect(page.locator('.activity-records')).toContainText(themes[0]);
    const oldCell = page.getByRole('button', { name: `${oldDate}：1次表达`, exact: true });
    await oldCell.focus(); await page.keyboard.press('ArrowDown');
    await expect(page.locator(`[data-date="${currentYear - 1}-01-03"]`)).toBeFocused();
    await page.keyboard.press('ArrowUp'); await expect(oldCell).toBeFocused();
    let detailRequests = 0;
    await page.route('**/api/activity?date=*', async route => { detailRequests++; await new Promise(resolve => setTimeout(resolve, 6000)); await route.continue(); });
    await page.getByRole('button', { name: `${oldDate}：1次表达`, exact: true }).click();
    await expect(page.locator('.activity-records li')).toHaveCount(1);
    await page.waitForResponse(response => response.url().includes('/api/activity?date=') && response.status() === 200, { timeout: 15000 });
    expect(detailRequests).toBe(1);
    await page.unroute('**/api/activity?date=*');
    await page.reload();
    await expect(page.getByRole('combobox', { name: '表达记录年份', exact: true })).toHaveValue(String(currentYear - 1));
    await expect(page.locator('.activity-records li')).toHaveCount(1);
    await page.getByLabel('查看某一天的表达', { exact: true }).fill(today);
    await expect(page.locator('.activity-records')).toContainText(themes[1]);
    await expect(page.getByRole('combobox', { name: '表达记录年份', exact: true })).toHaveValue(String(currentYear));
    for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080], [375, 812]]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: `outputs/uat/workspace-${width}.png`, fullPage: true });
      if (width === 375) { await page.getByRole('link', { name: '当前问题分析', exact: true }).click(); await expect(page.getByRole('heading', { name: '当前问题分析', exact: true })).toBeInViewport(); }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: /^抓重点/ }).click();
    await expect(page.locator('.workspace-issue')).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole('button', { name: /^抓重点/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /^排顺序/ }).click();
    await expect(page.getByText('这个维度暂无问题反馈')).toBeVisible();
    await page.goBack();
    await expect(page.locator('.workspace-issue')).toHaveCount(1);
    await page.locator('.workspace-issue summary').first().click();
    await page.getByRole('link', { name: '参考全部问题重练', exact: true }).click();
    await expect(page.getByRole('heading', { name: '本轮综合练习' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '本次问题', exact: true })).toBeVisible();
    await expect(page.locator('.issue-parts dt')).toHaveText(['原文', '问题', '建议', '原文', '问题', '建议']);
    const issueRows = page.locator('.issue-list > details.issue');
    await expect(issueRows).toHaveCount(2);
    await expect(issueRows.nth(0)).toHaveAttribute('open', '');
    await expect(issueRows.nth(1)).not.toHaveAttribute('open');
    await expect(issueRows.nth(0).locator('.issue-parts')).toBeVisible();
    await expect(issueRows.nth(1).locator('.issue-parts')).not.toBeVisible();
    await page.getByRole('button', { name: '展开全部', exact: true }).click();
    await expect(page.locator('.issue-list > details[open]')).toHaveCount(2);
    await page.getByRole('button', { name: '收起全部', exact: true }).click();
    await expect(page.locator('.issue-list > details[open]')).toHaveCount(0);
    await issueRows.nth(1).locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(issueRows.nth(1)).toHaveAttribute('open', '');
    await page.waitForResponse(response => response.url().includes('/api/practices/') && response.request().method() === 'GET');
    await expect(issueRows.nth(0)).not.toHaveAttribute('open');
    await expect(issueRows.nth(1)).toHaveAttribute('open', '');
    await page.screenshot({ path: 'outputs/uat/issues-accordion-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'outputs/uat/issues-accordion-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.retry-target')).toContainText('全部问题');
    await page.reload();
    await expect(page.locator('.retry-target')).toContainText('全部问题');
    await page.getByRole('button', { name: '开始录音', exact: true }).click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: '结束录音', exact: true }).click();
    await expect(page.locator('audio')).toHaveCount(1);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('link', { name: '返回练习记录', exact: true }).click();
    await page.getByRole('button', { name: /^展开内容/ }).click();
    await page.locator('.workspace-issue summary').first().click();
    await page.getByRole('link', { name: '参考全部问题重练', exact: true }).click();
    await expect(page.getByRole('heading', { name: '本轮综合练习' })).toBeVisible();
    await expect(page.locator('audio')).toHaveCount(1);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '放弃录音', exact: true }).click();
    await expect(page.locator('audio')).toHaveCount(0);
    await page.getByRole('button', { name: '退出练习', exact: true }).click();
    await page.getByRole('button', { name: '不记录，直接退出', exact: true }).click();
    await page.goto('/practices');
    await expect(page.locator('.practice-row')).toHaveCount(3);
    await page.route('**/api/workspace', route => route.abort());
    await page.getByRole('button', { name: '新建练习', exact: true }).isVisible();
    await expect(page.getByText('刷新失败，暂时保留上次读取的记录与反馈。')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.practice-row')).toHaveCount(3);
    await page.unroute('**/api/workspace');
    await page.getByRole('button', { name: '重新加载', exact: true }).click();
    await page.locator('.practice-row').filter({ hasText: themes[0] }).getByRole('button', { name: '删除练习', exact: true }).click();
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(page.locator('.practice-row')).toHaveCount(2);
    await expect(page.locator('.workspace-issue')).toHaveCount(1);
    const finalActivity = (await (await page.request.get('/api/workspace')).json()).activity;
    expect(finalActivity.days.reduce((sum: number, day: { count: number }) => sum + day.count, 0)).toBe(1);
  } finally {
    for (const id of ids) { try { db.deletePractice(user.id, id); } catch { /* Already deleted by the UI. */ } }
    db.close();
  }
});
