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
  const db = new Store(resolve(process.env.APP_DATA_DIR || 'var'));
  try {
    const dimensions = ['抓重点', '排顺序', '展开内容', '衔接与恢复', '口头禅与语气垫词'].map(name => ({ name, finding: '测试观察' }));
    const themes = ['测试样本：向同事说明项目调整的原因', '测试样本：先检查数据，再决定是否重跑', '测试样本：准备明天的客户沟通'];
    for (let index = 0; index < themes.length; index++) {
      const { practice } = await (await page.request.post('/api/practices', { headers })).json(); ids.push(practice.id);
      await page.request.patch(`/api/practices/${practice.id}`, { headers, data: { title: themes[index] } });
      if (index === 2) continue;
      const upload = await page.request.post(`/api/practices/${practice.id}/attempts`, { headers, multipart: { audio: { name: 'sample.wav', mimeType: 'audio/wav', buffer: readFileSync('outputs/omni-audio-samples/audio/05.wav') } } });
      expect(upload.status()).toBe(201); const { attempt } = await upload.json();
      const analysis = parseAnalysis(JSON.stringify({ transcript: '然后，然后，我想说的是先检查数据。我还有很多想法。', dimensions,
        issues: index === 0 ? [
          { dimension: '抓重点', evidence: '我还有很多想法', impact: '没有明确最希望听众记住的结论。', suggestion: '先用一句话说出本次建议，再说明原因。' },
          { dimension: '展开内容', evidence: '先检查数据', impact: '建议缺少具体依据。', suggestion: '补充一次检查发现问题的具体例子。' },
        ] : [{ dimension: '口头禅与语气垫词', evidence: '然后，然后', impact: '重复的连接词打断主线。', suggestion: '删掉重复的然后，停顿后直接说下一句。' }], uncertainty: '自动化测试的受控反馈，不是真实模型结论。' }));
      db.db.prepare("UPDATE attempts SET status='done',analysis=?,transcript=? WHERE id=?").run(JSON.stringify(analysis), analysis.transcript, attempt.id);
    }
    await page.reload();
    await expect(page.locator('.practice-row')).toHaveCount(3);
    await expect(page.locator('.workspace-issue')).toHaveCount(3);
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
    await page.getByRole('link', { name: '针对这个问题重练', exact: true }).click();
    await expect(page.getByRole('heading', { name: '本次重练目标' })).toBeVisible();
    await expect(page.locator('.retry-target')).toContainText('先用一句话说出本次建议');
    await page.reload();
    await expect(page.locator('.retry-target')).toContainText('先用一句话说出本次建议');
    await page.getByRole('button', { name: '开始录音', exact: true }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: '结束录音', exact: true }).click();
    await expect(page.locator('audio')).toHaveCount(1);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('link', { name: '返回练习记录', exact: true }).click();
    await page.getByRole('button', { name: /^展开内容/ }).click();
    await page.getByRole('link', { name: '针对这个问题重练', exact: true }).click();
    await expect(page.getByRole('heading', { name: '还有一段未保存的录音' })).toBeVisible();
    await expect(page.locator('audio')).toHaveCount(1);
    await page.getByRole('button', { name: '继续上次录音', exact: true }).click();
    await expect(page.locator('.retry-target')).toContainText('先用一句话说出本次建议');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('link', { name: '返回练习记录', exact: true }).click();
    await page.getByRole('button', { name: /^展开内容/ }).click();
    await page.getByRole('link', { name: '针对这个问题重练', exact: true }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '放弃草稿，练所选问题', exact: true }).click();
    await expect(page.locator('.retry-target')).toContainText('补充一次检查发现问题的具体例子');
    await expect(page.locator('audio')).toHaveCount(0);
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
  } finally {
    for (const id of ids) { try { db.deletePractice(user.id, id); } catch { /* Already deleted by the UI. */ } }
    db.close();
  }
});
