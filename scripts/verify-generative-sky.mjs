// Test the compiled application. The clock and GPU readbacks exist only here.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve('dist');
const out = path.resolve('home-browser-results/generated');
await mkdir(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + path.sep)) throw new Error('Invalid path');
    if (!path.extname(file)) file = path.join(root, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const ready = (page) => page.waitForFunction(() => document.querySelector('.home-galaxy')?.dataset.renderer === 'webgl2', null, { polling: 100, timeout: 30000 });
const difference = (a, b) => a.map((rgb, i) => rgb.reduce((s, v, c) => s + Math.abs(v - b[i][c]), 0) / 3);
const mean = (a) => a.reduce((s, n) => s + n, 0) / a.length;
const ensureFrame = async (page, delta) => {
  const before = await page.evaluate(() => window.__draws);
  await page.evaluate((delta) => window.__advance(delta), delta);
  const deadline = Date.now() + 30000;
  while ((await page.evaluate(() => window.__draws)) === before) {
    assert.ok(Date.now() < deadline, 'GPU frame completes');
    await page.waitForTimeout(10);
    await page.evaluate(() => window.__advance(0));
  }
};
function instrumentation() {
  localStorage.setItem('media_gateway_locale', 'zh');
  let now = 1000, key = 0;
  const callbacks = new Map();
  window.requestAnimationFrame = (f) => { callbacks.set(++key, f); return key; };
  window.cancelAnimationFrame = (i) => callbacks.delete(i);
  window.__advance = (delta) => {
    now += delta;
    for (const [i, f] of [...callbacks.entries()]) if (callbacks.delete(i)) f(now);
  };
  window.__draws = 0;
  window.__capture = true;
  const original = WebGL2RenderingContext.prototype.drawArrays;
  WebGL2RenderingContext.prototype.drawArrays = function (...args) {
    original.apply(this, args);
    if (args[0] !== this.POINTS) return;
    window.__draws++;
    if (!window.__capture) return;
    window.__capture = false;
    const w = this.drawingBufferWidth, h = this.drawingBufferHeight;
    const pixels = new Uint8Array(w * h * 4);
    this.readPixels(0, 0, w, h, this.RGBA, this.UNSIGNED_BYTE, pixels);
    const blocks = [];
    for (let by = 0; by < 18; by++) for (let bx = 0; bx < 32; bx++) {
      const sum = [0, 0, 0]; let n = 0;
      for (let y = Math.floor(by * h / 18); y < Math.floor((by + 1) * h / 18); y++)
        for (let x = Math.floor(bx * w / 32); x < Math.floor((bx + 1) * w / 32); x++) {
          for (let c = 0; c < 3; c++) sum[c] += pixels[(y * w + x) * 4 + c];
          n++;
        }
      blocks.push(sum.map((v) => v / n));
    }
    window.__blocks = blocks;
  };
}
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 960, height: 600 }, locale: 'zh-CN', reducedMotion: 'no-preference' });
  await context.addInitScript(instrumentation);
  const page = await context.newPage();
  const errors = [], unexpected = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (!url.startsWith(origin) || new URL(url).pathname.startsWith('/v1/')) {
      unexpected.push(url); return route.abort();
    }
    return route.continue();
  });
  const ids = ['cliffs', 'halo', 'pillars', 'veil'];
  const seeds = ['g1-0000002a', 'g1-5eeda11e', 'g1-f00dcafe'];
  const reports = [];
  for (const id of ids) {
    const samples = [];
    for (const seed of seeds) {
      const url = `${origin}/?sky=${id}&seed=${seed}`;
      await page.goto(url); await ready(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1300);
      assert.equal(await page.locator('.home-galaxy').getAttribute('data-seed'), seed);
      const start = await page.evaluate(() => window.__blocks);
      assert.equal(start.length, 576);
      assert.ok(mean(start.flat()) > 3, 'Generated image is not blank');
      const metrics = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight }));
      assert.ok(metrics.x <= 1 && metrics.y <= 1, JSON.stringify(metrics));
      assert.equal(await page.locator('.home-galaxy').count(), 1);
      await page.screenshot({ path: path.join(out, `${id}-${seed}.png`) });
      samples.push(start);
      if (seed === seeds[0]) {
        await ensureFrame(page, 0);
        for (let i = 1; i <= 40; i++) {
          if (i === 40) await page.evaluate(() => { window.__capture = true; });
          await ensureFrame(page, 100);
        }
        const differences = difference(start, await page.evaluate(() => window.__blocks));
        const motion = mean(differences), area = differences.filter((v) => v > 5).length / 576;
        assert.ok(motion > 3.5 && area > 0.20, `${id} generated motion ${motion}, ${area}`);
        reports.push({ id, seed, motion, area });
        await page.screenshot({ path: path.join(out, `${id}-${seed}-4s.png`) });
        await page.locator('.home-motion').click();
        const paused = await page.evaluate(() => window.__draws);
        await page.evaluate(() => { window.__canvas = document.querySelector('.home-galaxy'); window.__advance(500); });
        assert.equal(await page.evaluate(() => window.__draws), paused);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.locator('.language-toggle').click();
        assert.equal(await page.locator('.home-galaxy').getAttribute('data-seed'), seed);
        assert.equal(await page.evaluate(() => window.__canvas === document.querySelector('.home-galaxy')), true);
        await page.evaluate(() => {
          window.__lost = document.querySelector('.home-galaxy').getContext('webgl2').getExtension('WEBGL_lose_context');
          window.__lost.loseContext();
        });
        await page.locator('.home-galaxy[data-renderer="fallback"]').waitFor();
        await page.waitForTimeout(150);
        await page.evaluate(() => window.__lost.restoreContext()); await ready(page);
        assert.equal(await page.locator('.home-galaxy').getAttribute('data-seed'), seed);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        // Identical link, a fresh document and the same initial GPU pixels.
        await page.goto(url); await ready(page);
        assert.ok(mean(difference(start, await page.evaluate(() => window.__blocks))) < 0.01, 'Seed reproduces its initial image');
      }
    }
    for (let i = 0; i < samples.length; i++) for (let j = i + 1; j < samples.length; j++) {
      assert.ok(mean(difference(samples[i], samples[j])) > 2, `${id}: same-grammar seeds change cloud structure, not just stars`);
    }
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', reducedMotion: 'reduce' });
    const phone = await mobile.newPage();
    await phone.goto(`${origin}/?sky=${id}&seed=${seeds[1]}`); await ready(phone);
    await phone.evaluate(() => document.fonts.ready);
    assert.ok(await phone.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
    assert.equal(await phone.locator('.home-create').isVisible(), true);
    await phone.screenshot({ path: path.join(out, `${id}-en-mobile.png`) });
    await mobile.close();
  }
  await page.goto(origin); await ready(page);
  const firstSeed = await page.locator('.home-galaxy').getAttribute('data-seed');
  assert.match(firstSeed, /^g1-[0-9a-f]{8}$/);
  await page.reload(); await ready(page);
  assert.notEqual(await page.locator('.home-galaxy').getAttribute('data-seed'), firstSeed);
  await page.goto(`${origin}/?seed=g1-00000000`); await ready(page);
  const family = await page.locator('.home-galaxy').getAttribute('data-scene');
  await page.reload(); await ready(page);
  assert.equal(await page.locator('.home-galaxy').getAttribute('data-scene'), family);
  assert.equal(await page.locator('.home-galaxy').getAttribute('data-seed'), 'g1-00000000');
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  await context.close();
  await writeFile(path.join(out, 'report.json'), JSON.stringify({ reports, desktopSamples: 12, mobileSamples: 4, note: 'Controlled clock/SwiftShader: rendering checks, not real-device performance or a universal aesthetic guarantee.' }, null, 2));
  console.log('PASS constrained generated variants, seed replay, motion, lifecycle, fresh visits, 16 layouts and no external calls', reports);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
