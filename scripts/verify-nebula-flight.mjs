// A controlled clock exercises the real production renderer, not a mock shader.
// Coarse framebuffer averages reject "motion" consisting only of twinkling stars.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve('dist');
const out = path.resolve('home-browser-results/flight');
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
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 960, height: 600 }, locale: 'zh-CN', reducedMotion: 'no-preference' });
  await context.addInitScript(() => {
    localStorage.setItem('media_gateway_locale', 'zh');
    let now = 1000, id = 0;
    const callbacks = new Map();
    window.requestAnimationFrame = (callback) => { callbacks.set(++id, callback); return id; };
    window.cancelAnimationFrame = (key) => callbacks.delete(key);
    window.__advanceFlight = (delta) => {
      now += delta;
      const pending = [...callbacks.entries()];
      for (const [key, callback] of pending) {
        if (callbacks.delete(key)) callback(now);
      }
    };
    const original = WebGL2RenderingContext.prototype.drawArrays;
    window.__flightCapture = true;
    window.__flightBlocks = null;
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      original.apply(this, args);
      if (!window.__flightCapture || args[0] !== this.POINTS) return;
      window.__flightCapture = false;
      const w = this.drawingBufferWidth, h = this.drawingBufferHeight;
      const pixels = new Uint8Array(w * h * 4);
      this.readPixels(0, 0, w, h, this.RGBA, this.UNSIGNED_BYTE, pixels);
      const blocks = [];
      for (let by = 0; by < 18; by++) {
        for (let bx = 0; bx < 32; bx++) {
          const sums = [0, 0, 0];
          let count = 0;
          for (let y = Math.floor(by * h / 18); y < Math.floor((by + 1) * h / 18); y++) {
            for (let x = Math.floor(bx * w / 32); x < Math.floor((bx + 1) * w / 32); x++) {
              const i = (y * w + x) * 4;
              for (let c = 0; c < 3; c++) sums[c] += pixels[i + c];
              count++;
            }
          }
          blocks.push(sums.map((n) => n / count));
        }
      }
      window.__flightBlocks = blocks;
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => document.querySelector('.home-galaxy')?.dataset.renderer === 'webgl2', null, { polling: 100, timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1400); // Let the CSS opacity reveal finish.
  await page.evaluate(() => window.__advanceFlight(0));
  const first = await page.evaluate(() => window.__flightBlocks);
  assert.ok(first?.length === 576, 'Initial real GPU frame captured');
  await page.screenshot({ path: path.join(out, 'frame-000.png') });
  let fourth;
  for (let i = 1; i <= 80; i++) {
    await page.evaluate((capture) => {
      if (capture) window.__flightCapture = true;
      window.__advanceFlight(100);
    }, i === 40);
    if (i === 40) fourth = await page.evaluate(() => window.__flightBlocks);
    if (i % 4 === 0) await page.screenshot({ path: path.join(out, `frame-${String(i).padStart(3, '0')}.png`) });
  }
  assert.ok(fourth?.length === first.length);
  const differences = first.map((rgb, i) => rgb.reduce((sum, value, c) => sum + Math.abs(value - fourth[i][c]), 0) / 3);
  const mean = differences.reduce((sum, value) => sum + value, 0) / differences.length;
  const changingArea = differences.filter((value) => value > 5).length / differences.length;
  const report = { animationSeconds: 4, coarseGrid: '32x18', meanRGBDifference: mean, changingAreaAbove5: changingArea, note: 'Deterministic animation clock; not a real-time performance benchmark.' };
  await writeFile(path.join(out, 'motion-report.json'), JSON.stringify(report, null, 2));
  assert.ok(mean > 3.5, `Nebula changes broadly, not just stars: ${mean}`);
  assert.ok(changingArea > 0.20, `At least 20% of coarse image blocks move: ${changingArea}`);
  assert.deepEqual(errors, []);
  console.log('PASS: substantive nebula motion', report);
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
