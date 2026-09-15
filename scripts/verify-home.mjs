// Browser smoke checks against the actual Vite build, not a markup mock.
// CI installs Playwright in an isolated directory: no app dependency changes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { once } from 'node:events';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve('dist');
const out = path.resolve('home-browser-results');
await mkdir(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + path.sep)) throw new Error('Invalid path');
    if (!path.extname(file)) file = path.join(root, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
let cases = 0;
try {
  for (const locale of ['zh', 'en']) {
    const context = await browser.newContext({ locale: locale === 'zh' ? 'zh-CN' : 'en-US', reducedMotion: 'no-preference' });
    await context.addInitScript((value) => localStorage.setItem('media_gateway_locale', value), locale);
    const page = await context.newPage();
    const errors = [];
    const apiRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => {
      const request = route.request();
      if (new URL(request.url()).pathname.startsWith('/v1/')) {
        apiRequests.push(request.url());
        return route.abort();
      }
      if (!request.url().startsWith(origin)) return route.abort();
      return route.continue();
    });
    for (const [width, height] of [[1440, 900], [1366, 768], [1024, 768], [768, 1024], [390, 844], [375, 667], [320, 568], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await page.goto(origin);
      await page.locator('.home-create').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - innerWidth,
        y: document.documentElement.scrollHeight - innerHeight,
        logo: document.querySelector('.brand-mark').naturalWidth,
      }));
      assert.ok(metrics.x <= 1 && metrics.y <= 1, `${locale} ${width}x${height}: ${JSON.stringify(metrics)}`);
      assert.ok(metrics.logo > 0, 'Logo loads');
      assert.equal(await page.locator('.home-create').getAttribute('href'), '/app/create');
      assert.equal(await page.locator('.home-image-link').getAttribute('href'), '/app/image');
      assert.equal(await page.locator('.home-explore').getAttribute('href'), '/app/plaza');
      assert.equal(await page.locator('video').count(), 0, 'No placeholder video download');
      await page.screenshot({ path: path.join(out, `home-${locale}-${width}x${height}.png`) });
      cases++;
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin);
    await page.locator('.home-motion').click();
    assert.equal(await page.locator('.home-sky').getAttribute('data-moving'), 'false');
    assert.equal(await page.locator('.home-stars').first().evaluate((element) => getComputedStyle(element).animationPlayState), 'paused');
    await page.locator('.home-motion').click();
    assert.equal(await page.locator('.home-sky').getAttribute('data-moving'), 'true');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('.home-motion').disabled);
    assert.equal(await page.locator('.home-sky').getAttribute('data-moving'), 'false');
    assert.equal(await page.locator('.home-stars').first().evaluate((element) => getComputedStyle(element).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => !document.querySelector('.home-motion').disabled);
    // Exercise the visibility event handler without relying on headless tab focus.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => document.querySelector('.home-sky').dataset.moving === 'false');
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => document.querySelector('.home-sky').dataset.moving === 'true');
    // The first keyboard target is a working skip link.
    await page.goto(origin);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.home-skip').evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#home-content').evaluate((element) => element === document.activeElement), true);
    await page.locator('.language-toggle').click();
    assert.equal(await page.locator('.brand-tagline').innerText(), locale === 'zh' ? 'Here’s to now' : '敬此刻');
    // At an extreme effective viewport (zoom/short landscape), allow vertical
    // reflow and check that controls remain reachable instead of clipping them.
    await page.setViewportSize({ width: 320, height: 280 });
    for (const selector of ['.home-create', '.home-image-link', '.home-motion']) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      const rect = await page.locator(selector).boundingBox();
      assert.ok(rect && rect.y >= -1 && rect.y + rect.height <= 281, `${selector} remains reachable`);
    }
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY === 'hidden'), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(apiRequests, [], 'Public home makes no gateway calls');
    await context.close();
  }
  console.log(`PASS: ${cases} full-app viewport/locale cases; pause/resume, reduced motion, visibility, language, keyboard and small-viewport reflow.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
