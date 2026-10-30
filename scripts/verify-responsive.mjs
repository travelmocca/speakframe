import { chromium, webkit } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const origin = 'http://127.0.0.1:3118';
const info = JSON.parse(readFileSync('var/qa-practice.json', 'utf8'));
const widths = [320, 375, 390, 768, 1024, 1280, 1440, 1920];
const checks = [], errors = [];
mkdirSync('outputs/uat/responsive', { recursive: true });
for (const engine of (process.env.CHECK_WEBKIT ? ['chromium', 'webkit'] : ['chromium'])) {
  let browser;
  try { browser = await (engine === 'chromium' ? chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', timeout: 15000 }) : webkit.launch({ timeout: 15000 })); }
  catch (e) { errors.push({ engine, unavailable: true, message: e.message.slice(0, 500) }); continue; }
  const context = await browser.newContext({ storageState: 'var/qa-session.json' });
  const page = await context.newPage(); page.on('pageerror', e => errors.push({ engine, message: e.message }));
  for (const [name, route] of [['auth', '/auth'], ['list', '/practices'], ['workbench', `/practices/${info.id}?attempt=${info.secondId}&view=compare`]]) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : width >= 1920 ? 1080 : 900 });
      await page.goto(origin + route);
      if (name === 'auth') await page.getByRole('heading', { name: '继续你的练习' }).waitFor();
      if (name === 'list') await page.getByText(info.title).waitFor();
      if (name === 'workbench') await page.getByTestId('comparison-result').waitFor();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const check = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, title: document.title, inputs: document.querySelectorAll('input,textarea,select').length }));
      checks.push({ engine, browserVersion: browser.version(), page: name, ...check, passed: check.documentWidth <= check.width });
      if (width === 375 || width === 1440) await page.screenshot({ path: `outputs/uat/responsive/${engine}-${name}-${width}.png`, fullPage: true });
    }
  }
  await browser.close();
}
writeFileSync('outputs/uat/responsive-checks.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks, pageErrors: errors, limitation: 'WebKit is the frozen macOS 14 Playwright engine; not a claim about current Safari or physical phones.' }, null, 2));
if (checks.some(c => !c.passed) || errors.some(e => !e.unavailable)) throw new Error('Responsive or runtime checks failed; see report');
console.log(`PASS: ${checks.length} viewport checks; unavailable engines: ${errors.filter(e => e.unavailable).map(e => e.engine).join(', ') || 'none'}. See report for exact scope.`);
