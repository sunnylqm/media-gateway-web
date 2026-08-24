import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { sites } from '@openai/sites-vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// uiVersion stamps the bundle with the commit it was built from, in the same
// 2026.8.24-abcd1234 shape the Go services report. The console footer prints it
// next to the gateway's own version, so a stale CDN copy of the UI is visible
// at a glance rather than something you deduce from odd behaviour.
function uiVersion(): string {
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      encoding: 'utf8',
      // The date has to be UTC to agree with the server's version.
      env: { ...process.env, TZ: 'UTC' },
    }).trim();
  try {
    const date = git(
      'log',
      '-1',
      '--format=%cd',
      '--date=format-local:%Y.%-m.%-d',
    );
    const commit = git('rev-parse', 'HEAD').slice(0, 8);
    const dirty = git('status', '--porcelain') !== '';
    return `${date}-${commit}${dirty ? '-dirty' : ''}`;
  } catch {
    // CI checkouts without git history still know their commit.
    const commit = (
      process.env.COMMIT_REF ??
      process.env.GITHUB_SHA ??
      ''
    ).slice(0, 8);
    if (!commit) return 'dev';
    const now = new Date();
    return `${now.getUTCFullYear()}.${now.getUTCMonth() + 1}.${now.getUTCDate()}-${commit}`;
  }
}

export default defineConfig({
  plugins: [react(), sites()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  define: {
    'import.meta.env.VITE_UI_VERSION': JSON.stringify(uiVersion()),
  },
});
