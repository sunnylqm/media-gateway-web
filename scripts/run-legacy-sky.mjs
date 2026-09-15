// Run the existing G1 assertions against the explicit legacy landing URL.
// Only bare homepage navigation changes; assertions, shader readbacks, seeds,
// motion thresholds and context-recovery checks remain the original test code.
import { readFile, writeFile, unlink } from 'node:fs/promises';
const allowed = ['verify-home.mjs', 'verify-nebula-flight.mjs', 'verify-sky-presets.mjs', 'verify-generative-sky.mjs'];
const name = process.argv[2];
if (!allowed.includes(name)) throw new Error('Unknown legacy suite');
const original = await readFile(new URL(name, import.meta.url), 'utf8');
const source = original.replaceAll('page.goto(origin)', 'page.goto(`${origin}/?engine=g1`)')
  .replaceAll('page.goto(`http://127.0.0.1:${server.address().port}`)', 'page.goto(`http://127.0.0.1:${server.address().port}/?engine=g1`)');
if (source === original) throw new Error('Legacy URL fixture no longer matches; review the suite');
const temporary = new URL(`.g1-${name}`, import.meta.url);
try { await writeFile(temporary, source); await import(temporary.href); }
finally { await unlink(temporary).catch(() => {}); }
