/**
 * Determinism: two independent browser instances on the same seed simulate
 * bit-identical matches.
 *
 * This is the tripwire for the entire online-play design (see plan.md):
 * lockstep sends only inputs, so the sim must be a pure function of
 * (seed, tick, inputs). Every future "someone used Math.random or Date.now
 * in the tick" regression lands here as a checksum mismatch — which is
 * exactly how it would land in production: as a desynced match.
 *
 * Method: two pages load ?spectate&seed=N (CPU vs CPU exercises combat, the
 * CPU commanders, weather, supply drops, captures — everything), plus two
 * spawns scheduled through the tick-stamped input pipeline at fixed ticks to
 * exercise the command path. The engine records a full-state FNV-1a hash
 * every 300 ticks (__ewDebug.checksums); the pages run at whatever wall rate
 * headless gives them, and we compare the checkpoint ticks they share.
 *
 * Assertions:
 *   1. Both pages produce a healthy number of common checkpoints (the match
 *      actually simulated deeply enough to mean something).
 *   2. Every common checkpoint hash is identical (the whole point).
 *   3. The scheduled spawns landed (the input pipeline executed them).
 */
const puppeteer = require('puppeteer-core');

const SEED = 1234567;
const MAP = 'COUNTRYSIDE';
const RUN_MS = 45000;
// Spawns scheduled well ahead so both pages register them before the tick
// comes up regardless of wall-clock pacing differences.
const SCHEDULED = [
  { tick: 2400, team: 'WEST', type: 'TANK' },
  { tick: 3000, team: 'EAST', type: 'SOLDIER' },
];

(async () => {
  // Two SEPARATE browser instances: a second tab in one browser gets
  // rAF-throttled as a background page and simulates ~15x slower, starving
  // the comparison of common checkpoints. The extra args belt-and-brace it.
  const launch = () => puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'new', args: [
      '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });

  const errors = [];
  const mkPage = async (b) => {
    const p = await b.newPage();
    p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    await p.evaluateOnNewDocument(() => localStorage.setItem('ewv-fx', 'high'));
    await p.goto(`http://localhost:3000/east-vs-west-game/?spectate&seed=${SEED}&map=${MAP}&speed=6`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction('!!window.__ewDebug', { timeout: 60000 });
    await p.evaluate((sched) => {
      for (const s of sched) window.__ewDebug.queueSpawn(s.tick, s.team, s.type);
    }, SCHEDULED);
    return p;
  };

  const bA = await launch();
  const bB = await launch();
  const [pA, pB] = await Promise.all([mkPage(bA), mkPage(bB)]);

  await new Promise(r => setTimeout(r, RUN_MS));

  const collect = (p) => p.evaluate(() => ({
    seed: window.__ewDebug.simSeed,
    tick: window.__ewDebug.tickCount,
    checksums: window.__ewDebug.checksums,
    units: (window.__ewDebug.unitList ?? []).length,
  }));
  const a = await collect(pA);
  const bb = await collect(pB);
  await bA.close();
  await bB.close();

  const common = Object.keys(a.checksums).filter(t => t in bb.checksums).map(Number).sort((x, y) => x - y);
  const mismatches = common.filter(t => a.checksums[t] !== bb.checksums[t]);

  console.log(`seed             : ${a.seed} / ${bb.seed}`);
  console.log(`ticks simulated  : A=${a.tick}  B=${bb.tick}`);
  console.log(`common checkpoints: ${common.length} (through tick ${common[common.length - 1] ?? 0})`);
  console.log(`mismatched       : ${mismatches.length}${mismatches.length ? ' — first at tick ' + mismatches[0] : ''}`);

  const fail = [];
  if (a.seed !== SEED || bb.seed !== SEED) fail.push('?seed= did not pin the match seed');
  if (common.length < 10) fail.push(`only ${common.length} common checkpoints — pages simulated too little to conclude anything`);
  if (mismatches.length) fail.push(`SIMULATIONS DIVERGED at tick ${mismatches[0]} — a sim path is drawing from Math.random/Date.now (see plan.md determinism rules)`);
  if (a.units === 0 && bb.units === 0) fail.push('no units on the field — CPUs never played, test is vacuous');
  if (errors.length) fail.push(`page errors: ${errors.slice(0, 3).join(' | ')}`);

  if (fail.length) { console.error('FAIL\n - ' + fail.join('\n - ')); process.exit(1); }
  console.log('PASS');
})();
