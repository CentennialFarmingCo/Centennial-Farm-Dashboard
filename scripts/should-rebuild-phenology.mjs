// Decides whether the current Vercel build should re-run the (slow) CIMIS
// phenology fetch. Returns exit code 0 to run, 1 to skip.
//
// Why this exists: build-phenology.mjs makes serial CIMIS API calls that take
// 5–8 minutes total. The Farm-manager-bot commits public/harvest.json after
// every "Block X N bins" Telegram message, which triggers a Vercel rebuild.
// If those harvest commits also re-ran the phenology fetch, every bin you log
// would burn ~6 minutes of build time and another slice of your CIMIS API
// quota — for data that hasn't changed.
//
// Rule: skip the phenology fetch when *all* of these are true:
//   1. We're running inside Vercel (VERCEL=1).
//   2. The previous deploy already produced a phenology-summary.json (it'll
//      be restored from the build cache).
//   3. None of the files that affect phenology output changed in this commit:
//        - scripts/build-phenology.mjs           (the model itself)
//        - scripts/test-phenology-dates.mjs      (date helpers used by it)
//        - app/fields.js                          (the block list)
//        - package.json / package-lock.json      (deps that might affect it)
//
// In every other case we run the fetch — local dev, scheduled rebuilds,
// missing cache, code changes, etc.
//
// To force a rebuild regardless of this guard, set FORCE_PHENOLOGY_REBUILD=1
// in the Vercel environment for the deploy.

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SUMMARY = join(ROOT, 'public', 'phenology-summary.json');

// Files whose changes should force a phenology rebuild. Match exactly against
// `git diff --name-only` output (paths are relative to repo root).
const TRIGGERS = new Set([
  'scripts/build-phenology.mjs',
  'scripts/test-phenology-dates.mjs',
  'app/fields.js',
  'package.json',
  'package-lock.json',
]);

function log(msg) {
  console.log(`[phenology-guard] ${msg}`);
}

function run() {
  if (process.env.FORCE_PHENOLOGY_REBUILD === '1') {
    log('FORCE_PHENOLOGY_REBUILD=1 set — running fetch.');
    process.exit(0);
  }

  if (!process.env.VERCEL) {
    log('Not running on Vercel — running fetch (local dev or manual run).');
    process.exit(0);
  }

  if (!existsSync(SUMMARY)) {
    log('No cached phenology-summary.json — running fetch.');
    process.exit(0);
  }

  // Vercel exposes the commit SHA and the previous deploy's SHA. If we can't
  // figure out what changed, err on the side of running the fetch.
  const current = process.env.VERCEL_GIT_COMMIT_SHA;
  const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
  if (!current || !previous) {
    log('Missing VERCEL_GIT_* env vars — running fetch to be safe.');
    process.exit(0);
  }
  if (current === previous) {
    log('Current SHA == previous SHA — running fetch (manual redeploy).');
    process.exit(0);
  }

  // Vercel does a shallow clone. If the previous SHA isn't in our local repo,
  // try to fetch just that one commit so we can diff against it. If that
  // fails (network issue, force-push, etc.), fall back to running the fetch.
  function hasCommit(sha) {
    try {
      execSync(`git cat-file -e ${sha}^{commit}`, { cwd: ROOT, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  if (!hasCommit(previous)) {
    log(`Previous SHA ${previous.slice(0, 7)} not in shallow clone — fetching it...`);
    try {
      execSync(`git fetch --depth=1 origin ${previous}`, {
        cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      log(`git fetch failed (${err.message.split('\n')[0]}) — running fetch.`);
      process.exit(0);
    }
    if (!hasCommit(previous)) {
      log('Previous SHA still missing after fetch — running fetch.');
      process.exit(0);
    }
  }

  let changed = '';
  try {
    changed = execSync(
      `git diff --name-only ${previous} ${current}`,
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (err) {
    log(`git diff failed (${err.message.split('\n')[0]}) — running fetch.`);
    process.exit(0);
  }

  const files = changed.split('\n').map(s => s.trim()).filter(Boolean);
  const triggers = files.filter(f => TRIGGERS.has(f));

  if (triggers.length > 0) {
    log(`Triggering file(s) changed: ${triggers.join(', ')} — running fetch.`);
    process.exit(0);
  }

  log(
    `No phenology-relevant files changed (${files.length} file(s): ` +
    `${files.slice(0, 3).join(', ')}${files.length > 3 ? ', …' : ''}) — ` +
    `skipping fetch and reusing cached phenology-summary.json.`,
  );
  process.exit(1);
}

run();
