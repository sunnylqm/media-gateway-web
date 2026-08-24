import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { sites } from '@openai/sites-vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The commit a CI build is building, named by the platform. Its presence also
// says the working tree is CI's own checkout, where "dirty" means the build
// itself touched a file rather than that someone shipped uncommitted work.
const ciCommit =
  process.env.WORKERS_CI_COMMIT_SHA ??
  process.env.CF_PAGES_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  process.env.COMMIT_REF ??
  '';
// Some builders name no commit at all, so CI itself is the second signal.
const inCI =
  ciCommit !== '' || process.env.CI === 'true' || process.env.CI === '1';

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
    // Only tracked files count, and not even those in CI: a CI workspace
    // always has installed dependencies and build artefacts lying around, and
    // the deploy pipeline may rewrite a tracked config file on its way
    // through. None of that changes which commit was compiled.
    const dirty =
      !inCI && git('status', '--porcelain', '--untracked-files=no') !== '';
    return `${date}-${commit}${dirty ? '-dirty' : ''}`;
  } catch {
    // A checkout without git history still knows its commit.
    const commit = ciCommit.slice(0, 8);
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
