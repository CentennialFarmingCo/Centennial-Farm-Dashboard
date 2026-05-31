// Prebuild orchestrator: decide whether to run the slow CIMIS phenology fetch.
//
// The guard script exits 0 to "run" or 1 to "skip". We translate that into a
// fetch invocation, surfacing real failures from the fetch itself but
// treating "skip" as success so the build can continue with cached data.
//
// Replaces the previous one-liner in package.json so we don't have to
// wrestle with cross-shell `&& || echo` semantics on Windows / Vercel.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUARD = join(__dirname, 'should-rebuild-phenology.mjs');
const BUILD = join(__dirname, 'build-phenology.mjs');

const guard = spawnSync(process.execPath, [GUARD], { stdio: 'inherit' });
if (guard.status === 1) {
  // Guard said skip — exit cleanly, build continues with cached JSON.
  process.exit(0);
}
if (guard.status !== 0) {
  // Anything other than 0 or 1 is an unexpected failure of the guard itself.
  console.error(`[prebuild] phenology guard exited with status ${guard.status}`);
  process.exit(guard.status ?? 1);
}

// Guard said run.
const build = spawnSync(process.execPath, [BUILD], { stdio: 'inherit' });
process.exit(build.status ?? 1);
