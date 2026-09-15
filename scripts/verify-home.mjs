// Exercise the actual Vite build, including shader compilation and GPU draws.
// SwiftShader in CI tests correctness, not real-device GPU performance.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

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
  } catch { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let cases = 0;
const ready = async (page) => {
  await page.locator('.home-galaxy[data-renderer="webgl2"]').waitFor({ timeout: 30000 });
};
const drawCount = (page) => page.evaluate(() => window.__skyDraws);
const staysStill = async (page) => {
  await page.waitForTimeout(200);
  const before = await drawCount(page);
  await page.waitForTimeout(350);
  assert.equal(await drawCount(page), before, 'No GPU draws while paused');
};
try {
  for (const locale of ['zh', 'en']) {
    const context = await browser.newContext({ locale: locale === 'zh' ? 'zh-CN' : 'en-US', reducedMotion: 'no-preference' });
    await context.addInitScript((value) => {
      localStorage.setItem('media_gateway_locale', value);
      window.__skyDraws = 0;
      window.__skyPixels = 0;
      const original = WebGL2RenderingContext.prototype.drawArrays;
      WebGL2RenderingContext.prototype.drawArrays = function (...args) {
        original.apply(this, args);
        window.__skyDraws++;
        if (args[0] === this.POINTS && !window.__skyPixels) {
          const pixels = new Uint8Array(4 * 16 * 16);
          this.readPixels(this.drawingBufferWidth >> 1, this.drawingBufferHeight >> 1, 16, 16, this.RGBA, this.UNSIGNED_BYTE, pixels);
          window.__skyPixels = pixels.reduce((sum, value, i) => sum + (i % 4 === 3 ? 0 : value), 0);
        }
      };
    }, locale);
    const page = await context.newPage();
    const errors = [], apiRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (new URL(url).pathname.startsWith('/v1/')) { apiRequests.push(url); return route.abort(); }
      if (!url.startsWith(origin)) return route.abort();
      return route.continue();
    });
    for (const [width, height] of [[1440, 900], [1366, 768], [1024, 768], [768, 1024], [390, 844], [375, 667], [320, 568], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await page.goto(origin);
      await ready(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1300);
      const metrics = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - innerWidth,
        y: document.documentElement.scrollHeight - innerHeight,
        logo: document.querySelector('.brand-mark').naturalWidth,
        pixels: window.__skyPixels,
      }));
      assert.ok(metrics.x <= 1 && metrics.y <= 1, `${locale} ${width}x${height}: ${JSON.stringify(metrics)}`);
      assert.ok(metrics.logo > 0, 'Logo loads');
      assert.ok(metrics.pixels > 1000, 'GPU framebuffer is not black');
      assert.equal(await page.locator('.home-create').getAttribute('href'), '/app/create');
      assert.equal(await page.locator('.home-image-link').getAttribute('href'), '/app/image');
      assert.equal(await page.locator('.home-explore').getAttribute('href'), '/app/plaza');
      assert.equal(await page.locator('video').count(), 0, 'No placeholder video download');
      assert.equal(await page.locator('.home-footer-copy p').count(), 0);
      assert.ok(!(await page.locator('body').innerText()).includes(locale === 'zh' ? '不必等灵感完整' : 'An unfinished thought is enough'));
      await page.screenshot({ path: path.join(out, `home-${locale}-${width}x${height}.png`) });
      cases++;
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin);
    await ready(page);
    await page.waitForTimeout(1400);
    const first = await page.locator('.home-galaxy').screenshot();
    const count = await drawCount(page);
    await page.waitForTimeout(450);
    const second = await page.locator('.home-galaxy').screenshot();
    assert.ok((await drawCount(page)) > count, 'GPU animation advances');
    assert.notDeepEqual(first, second, 'Rendered sky changes, not just a CSS flag');
    await page.locator('.home-motion').click();
    assert.equal(await page.locator('.home-sky').getAttribute('data-moving'), 'false');
    await staysStill(page);
    await page.locator('.home-motion').click();
    await page.waitForFunction((n) => window.__skyDraws > n, await drawCount(page));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('.home-motion').disabled);
    await ready(page);
    await staysStill(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await ready(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => document.querySelector('.home-sky').dataset.moving === 'false');
    await staysStill(page);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => document.querySelector('.home-sky').dataset.moving === 'true');
    // Simulate a real context loss, then recreate shaders, buffers and targets.
    await page.evaluate(() => {
      window.__lostSky = document.querySelector('.home-galaxy').getContext('webgl2').getExtension('WEBGL_lose_context');
      window.__lostSky.loseContext();
    });
    await page.locator('.home-galaxy[data-renderer="fallback"]').waitFor();
    assert.equal(await page.locator('.home-create').isVisible(), true);
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__lostSky.restoreContext());
    await ready(page);
    // First keyboard target remains the skip link; changing language keeps GPU.
    await page.goto(origin);
    await ready(page);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.home-skip').evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#home-content').evaluate((element) => element === document.activeElement), true);
    await page.locator('.language-toggle').click();
    assert.equal(await page.locator('.brand-tagline').innerText(), locale === 'zh' ? 'Here’s to now' : '敬此刻');
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
  const fallback = await browser.newContext();
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return type === 'webgl2' ? null : original.call(this, type, ...rest);
    };
  });
  const page = await fallback.newPage();
  await page.goto(origin);
  await page.locator('.home-galaxy[data-renderer="fallback"]').waitFor();
  assert.equal(await page.locator('.home-create').isVisible(), true);
  await page.locator('.home-motion').click();
  assert.equal(await page.locator('.home-sky').getAttribute('data-moving'), 'false');
  await page.screenshot({ path: path.join(out, 'home-no-webgl-fallback.png') });
  await fallback.close();
  console.log(`PASS: ${cases} full-app viewport/locale cases; real WebGL2 pixels and motion, pause, reduced motion, visibility, context recovery, no-WebGL fallback, language, keyboard and short-screen reflow.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
