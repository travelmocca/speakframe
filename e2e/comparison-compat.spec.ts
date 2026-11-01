import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Store } from '../src/lib/store';
import { parseAnalysis } from '../src/lib/analysis-schema';
import { DIMENSIONS } from '../src/lib/dimensions';
test.use({ actionTimeout: 15000 });
// Controlled analysis fixtures; comparison still calls the real model through the worker.
test('real comprehensive comparison and historical nonadjacent comparison preserve their actual scope', async ({ page }) => {
  await page.goto('/auth'); await page.getByRole('button', { name: '注册新账号' }).click();
  await page.getByLabel('手机号', { exact: true }).fill('130' + Date.now().toString().slice(-8));
  await page.getByLabel('密码', { exact: true }).fill('Comparison-test-password'); await page.getByLabel('确认密码', { exact: true }).fill('Comparison-test-password');
  await page.getByRole('button', { name: '创建账号' }).click(); await expect(page).toHaveURL(/\/practices$/);
  const headers = { Origin: new URL(page.url()).origin }, { user } = await (await page.request.get('/api/me')).json();
  const { practice } = await (await page.request.post('/api/practices', { headers, data: { scenario: 'opinion' } })).json();
  const url = `/api/practices/${practice.id}`, db = new Store(resolve(process.env.APP_DATA_DIR || 'var'));
  try {
    await page.request.patch(url, { headers, data: { title: '测试样本：对比范围与自然语言' } });
    const attempts: string[] = [];
    for (let round = 0; round < 3; round++) {
      const upload = await page.request.post(`${url}/attempts`, { headers, multipart: { audio: { name: 'sample.wav', mimeType: 'audio/wav', buffer: readFileSync('outputs/omni-audio-samples/audio/05.wav') } } });
      expect(upload.status()).toBe(201); const { attempt } = await upload.json(); attempts.push(attempt.id);
      const transcript = round === 0 ? '然后，然后，我想说的是先检查数据。' : '我建议先检查数据，因为上次报错来自数据缺失。检查后再决定是否重跑。';
      const analysis = parseAnalysis(JSON.stringify({ transcript, dimensions: DIMENSIONS.map(name => ({ name, finding: round === 0 ? '观点前有重复连接词，缺少支持理由。' : '先提出建议，再给出原因与行动。' })), issues: round === 0 ? [{ dimension: '口头禅与语气垫词', evidence: '然后，然后', impact: '重复影响简洁', suggestion: '直接说建议' }] : [], uncertainty: '受控测试样本' }));
      db.db.prepare("UPDATE attempts SET status='done',analysis=?,transcript=? WHERE id=?").run(JSON.stringify(analysis), transcript, attempt.id);
    }
    expect((await page.request.post('/api/comparisons', { headers, data: { attemptId: attempts[1] } })).status()).toBe(202);
    await page.goto(`/practices/${practice.id}?attempt=${attempts[1]}&view=compare`);
    await expect(page.getByTestId('comparison-result')).toBeVisible({ timeout: 180000 });
    await expect(page.locator('.dimension-changes > section')).toHaveCount(5);
    await expect(page.getByTestId('comparison-result')).not.toContainText(/transcript|JSON|before和after/);
    const legacy = { verdict: '有改善', summary: '单项重复减少', beforeEvidence: '然后，然后', afterEvidence: '我建议先检查数据', remaining: '继续练习', uncertainty: '', beforeEvidenceVerified: true, afterEvidenceVerified: true };
    db.db.prepare('UPDATE attempts SET sourceId=? WHERE id=?').run(attempts[0], attempts[2]);
    db.db.prepare("INSERT INTO comparisons (id,practiceId,attemptId,sourceId,target,status,result,createdAt) VALUES (?,?,?,?,?,'done',?,?)").run(randomUUID(), practice.id, attempts[2], attempts[0], JSON.stringify({ dimension: '口头禅与语气垫词' }), JSON.stringify(legacy), Date.now());
    await page.goto(`/practices/${practice.id}?attempt=${attempts[2]}&view=compare`);
    const panel = page.getByTestId('comparison-result'); await expect(panel).toContainText('第 3 次表达与第 1 次表达相比');
    await expect(panel).toContainText('历史选定问题'); await expect(panel).not.toContainText('相邻');
    await page.screenshot({ path: 'outputs/uat/legacy-comparison-scope.png', fullPage: true });
  } finally { db.deletePractice(user.id, practice.id); db.close(); }
});
