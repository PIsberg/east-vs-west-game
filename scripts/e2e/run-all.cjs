/**
 * Headless e2e suite — runs every smoke test in this directory in sequence
 * against a dev server and reports a summary.
 *
 * Usage:
 *   npm run dev                       # in another terminal, port 3000
 *   node scripts/e2e/run-all.cjs
 *
 * Requires `puppeteer-core` on the resolve path (intentionally not a game
 * dependency) and Edge at its standard Windows install path — each test
 * hardcodes both, mirroring scripts/balance-harness.js.
 *
 * Coverage: layout fit across viewports (smoke9), minimap rendering
 * (smoke10), hotkeys + stat tooltips (smoke12), viewport bracket + weather
 * forecast (smoke13), minimap click-to-pan + volume slider (smoke14),
 * FX auto-detection (smoke15), challenges incl. handicap + completion
 * (smoke16), unit movement — obstacle avoidance + APC deployment (smoke17),
 * suppression — fires, foot units only, wears off (smoke18), the Winter
 * frozen river — infantry cross the ice, armor doesn't, gunboats vetoed,
 * no rain (smoke19), vehicle wrecks — appear, cap, decay, despawn (smoke20),
 * and the victory-screen battle timeline (timeline-test).
 *
 * Notes for writing new tests (hard-won):
 *  - Pin localStorage 'ewv-fx' to 'high' unless testing the auto-drop — the
 *    FX auto-detect remounts the 3D canvas ~7-10s into the first battle.
 *  - Non-spectate play is frame-locked: headless ~8fps x speed 8 is roughly
 *    realtime. Use window.__ewDebug.winTeam('WEST') to end matches.
 *  - __ewDebug.unitList and .typeStats are snapshot PROPERTIES, not functions.
 *  - Never screenshot while paused (the overlay darkens everything), and
 *    remember weather starts rolling ~10s in.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const tests = fs.readdirSync(dir).filter(f => f.endsWith('.cjs') && f !== 'run-all.cjs').sort();
let failed = 0;

for (const t of tests) {
  process.stdout.write(`${t.padEnd(20)} `);
  try {
    execFileSync(process.execPath, [path.join(dir, t)], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
    console.log('PASS');
  } catch (e) {
    failed++;
    const out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
    console.log('FAIL');
    console.log(out.split('\n').slice(-6).join('\n'));
  }
}

console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
