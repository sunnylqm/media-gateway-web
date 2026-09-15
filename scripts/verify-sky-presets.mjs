// Real compiled app and GPU pixels; test clocks do not ship in the renderer.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ids = ['cliffs', 'halo', 'pillars', 'veil'];
const out = path.resolve('home-browser-results/scenes');
const root = path.resolve('dist');
await mkdir(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + path.sep)) throw new Error('Invalid path');
    if (!path.extname(file)) file = path.join(root, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const ready = (page) => page.waitForFunction(() => document.querySelector('.home-galaxy')?.dataset.renderer === 'webgl2', null, { polling: 100, timeout: 30000 });
const sceneId = (page) => page.locator('.home-galaxy').getAttribute('data-scene');
const ensureFrame = async (page, delta, capture = false) => {
  const before = await page.evaluate(() => window.__draws);
  await page.evaluate(({ delta, capture }) => {
    window.__capture = capture;
    window.__advance(delta);
  }, { delta, capture });
  const deadline = Date.now() + 30000;
  while ((await page.evaluate(() => window.__draws)) === before) {
    assert.ok(Date.now() < deadline, 'GPU fence completes');
    await page.waitForTimeout(10);
    await page.evaluate(() => window.__advance(0));
  }
};
const layout = async (page) => {
  const metrics = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - innerWidth,
    y: document.documentElement.scrollHeight - innerHeight,
    count: document.querySelectorAll('.home-galaxy').length,
  }));
  assert.ok(metrics.x <= 1 && metrics.y <= 1, JSON.stringify(metrics));
  assert.equal(metrics.count, 1, 'Only one sky canvas');
  assert.equal(await page.locator('.home-create').isVisible(), true);
  assert.equal(await page.locator('.home-footer-copy p').count(), 0);
};
const difference = (a, b) => a.map((rgb, i) => rgb.reduce((sum, v, c) => sum + Math.abs(v - b[i][c]), 0) / 3);
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const starts = {}, reports = [];
  for (const id of ids) {
    const context = await browser.newContext({ viewport: { width: 960, height: 600 }, locale: 'zh-CN', reducedMotion: 'no-preference' });
    await context.addInitScript(() => {
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
      window.__capture = false;
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
              const i = (y * w + x) * 4;
              for (let c = 0; c < 3; c++) sum[c] += pixels[i + c];
              n++;
            }
          blocks.push(sum.map((v) => v / n));
        }
        window.__blocks = blocks;
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${origin}/?sky=${id}`);
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1300);
    assert.equal(await sceneId(page), id);
    await layout(page);
    await ensureFrame(page, 0, true);
    starts[id] = await page.evaluate(() => window.__blocks);
    assert.equal(starts[id].length, 576);
    assert.ok(starts[id].flat().reduce((a, b) => a + b, 0) > 1000, 'Non-black framebuffer');
    await page.screenshot({ path: path.join(out, `${id}-zh-desktop.png`) });
    await mkdir(path.join(out, id), { recursive: true });
    await page.screenshot({ path: path.join(out, id, 'frame-000.png') });
    for (let i = 1; i <= 40; i++) {
      await ensureFrame(page, 100, i === 40);
      if (i % 5 === 0) await page.screenshot({ path: path.join(out, id, `frame-${String(i).padStart(3, '0')}.png`) });
    }
    const fourth = await page.evaluate(() => window.__blocks);
    const diffs = difference(starts[id], fourth);
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const area = diffs.filter((v) => v > 5).length / diffs.length;
    reports.push({ id, animationSeconds: 4, meanRGBDifference: mean, changingAreaAbove5: area });
    assert.ok(mean > 3.5 && area > 0.20, `${id}: substantive motion ${mean}, ${area}`);
    await page.evaluate(() => { window.__originalSky = document.querySelector('.home-galaxy'); });
    await page.locator('.home-motion').click();
    assert.equal(await page.locator('.home-sky').getAttribute('data-moving'), 'false');
    const paused = await page.evaluate(() => window.__draws);
    for (let i = 0; i < 4; i++) await page.evaluate(() => window.__advance(100));
    assert.equal(await page.evaluate(() => window.__draws), paused, 'Pause cancels draws');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('.home-motion').disabled, null, { polling: 100 });
    await page.locator('.language-toggle').click();
    assert.equal(await sceneId(page), id);
    assert.equal(await page.evaluate(() => window.__originalSky === document.querySelector('.home-galaxy')), true, 'Locale and motion preferences retain canvas');
    await layout(page);
    await page.screenshot({ path: path.join(out, `${id}-en-desktop.png`) });
    await page.evaluate(() => {
      window.__lostSky = document.querySelector('.home-galaxy').getContext('webgl2').getExtension('WEBGL_lose_context');
      window.__lostSky.loseContext();
    });
    await page.locator('.home-galaxy[data-renderer="fallback"]').waitFor();
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__lostSky.restoreContext());
    await ready(page);
    assert.equal(await sceneId(page), id, 'Context recovery keeps selected scene');
    assert.deepEqual(errors, []);
    await context.close();

    for (const locale of ['zh', 'en']) {
      const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: locale === 'zh' ? 'zh-CN' : 'en-US' });
      await mobile.addInitScript((value) => localStorage.setItem('media_gateway_locale', value), locale);
      const phone = await mobile.newPage();
      await phone.goto(`${origin}/?sky=${id}`);
      await ready(phone);
      await phone.evaluate(() => document.fonts.ready);
      await layout(phone);
      assert.equal(await sceneId(phone), id);
      await phone.screenshot({ path: path.join(out, `${id}-${locale}-mobile.png`) });
      await mobile.close();
    }
    console.log('PASS scene', id, reports.at(-1));
  }
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const diffs = difference(starts[ids[i]], starts[ids[j]]);
    assert.ok(diffs.reduce((a, b) => a + b, 0) / diffs.length > 5, 'Scenes are visually distinct');
  }
  const random = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  await random.addInitScript(() => { Math.random = () => 0.1; });
  const page = await random.newPage();
  await page.goto(origin);
  await ready(page);
  let previous = await sceneId(page);
  for (let i = 0; i < 3; i++) {
    await page.reload(); await ready(page);
    const current = await sceneId(page);
    assert.ok(ids.includes(current));
    assert.notEqual(current, previous, 'Reload avoids immediate repeat');
    previous = current;
  }
  await page.goto(`${origin}/?sky=unknown`); await ready(page);
  assert.ok(ids.includes(await sceneId(page)), 'Invalid review scene falls back');
  await random.close();
  const blocked = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  await blocked.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new Error('Blocked'); } }));
  const denied = await blocked.newPage();
  await denied.goto(origin); await ready(denied);
  assert.ok(ids.includes(await sceneId(denied)), 'Storage access failure still renders');
  await blocked.close();
  await writeFile(path.join(out, 'report.json'), JSON.stringify({ reports, layouts: 16, note: 'Deterministic clock and SwiftShader: rendering correctness, not a real-device FPS benchmark.' }, null, 2));
  console.log('PASS four distinct scenes, motion, 16 layouts, stable choices, reload selection and blocked storage');
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
