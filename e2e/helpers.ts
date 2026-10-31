import { expect, type Page } from '@playwright/test';
export async function chooseScenario(page: Page, title = '发表观点、回答问题') {
  await expect(page).toHaveURL(/\/practices\/new/);
  await page.getByRole('radio', { name: title, exact: true }).check();
  await page.getByRole('button', { name: '开始练习', exact: true }).click();
  await expect(page.getByLabel('表达主题', { exact: true })).toBeVisible();
}
