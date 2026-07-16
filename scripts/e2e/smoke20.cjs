/**
 * Wrecks: a destroyed ground vehicle stays on the field as a burning hulk.
 *
 * The wreck is real terrain — infantry cover behind it, vehicles steer around
 * it — and every part of that lifecycle can die silently: if the death block
 * stops pushing the terrain object the battlefield quietly reverts to
 * disappearing vehicles; if the upkeep pass stops decrementing, hulks
 * accumulate to the cap and the field clogs with obstacles forever (and the
 * wedge rate climbs); if the cap eviction breaks, terrain grows unbounded.
 * So the assertions are on the lifecycle:
 *   1. Wrecks appear during a battle (vehicles die constantly in spectate).
 *   2. The field cap holds — never more than WRECK_MAX at once.
 *   3. A wreck's timer counts down (upkeep pass is alive).
 *   4. Wrecks leave the field (despawn path works — no permanent clutter).
 * Infantry-in-cover-at-wreck is logged but not asserted: it depends on where
 * the battle happens to flow, and a flaky test is worse than a missing one.
 */
const puppeteer = require('puppeteer-core');

const SAMPLES = 30;
const INTERVAL = 2500;
const WRECK_MAX = 10; // keep in step with constants.ts
const FOOT = new Set(['SOLDIER', 'SNIPER', 'SPECIAL_FORCES', 'FLAMETHROWER',
                      'MEDIC', 'ENGINEER', 'MORTAR', 'AIRBORNE']);

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const errors = [];
  const p = await b.newPage();
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.evaluateOnNewDocument(() => localStorage.setItem('ewv-fx', 'high'));
  await p.goto('http://localhost:3000/east-vs-west-game/?spectate&map=COUNTRYSIDE&speed=8',
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction('!!(window.__ewDebug && window.__ewDebug.wrecks)', { timeout: 60000 });

  let peak = 0, coverAtWreck = 0, decayed = false, despawned = false;
  const lastHealth = new Map(); // "x,y" site -> last seen timer

  for (let i = 0; i < SAMPLES; i++) {
    const s = await p.evaluate(() => ({
      wrecks: __ewDebug.wrecks,
      units: (__ewDebug.unitList ?? []).filter(u => u.health > 0),
    }));
    peak = Math.max(peak, s.wrecks.length);
    const now = new Set();
    for (const w of s.wrecks) {
      const key = `${w.x},${w.y}`;
      now.add(key);
      if (lastHealth.has(key) && w.health < lastHealth.get(key)) decayed = true;
      lastHealth.set(key, w.health);
    }
    for (const key of lastHealth.keys()) if (!now.has(key)) despawned = true;
    for (const u of s.units) {
      if (FOOT.has(u.type) && u.isInCover &&
          s.wrecks.some(w => Math.hypot(w.x - u.position.x, w.y - u.position.y) < 30)) coverAtWreck++;
    }
    await new Promise(r => setTimeout(r, INTERVAL));
  }
  await b.close();

  console.log(`peak wrecks      : ${peak} (cap ${WRECK_MAX})`);
  console.log(`distinct sites   : ${lastHealth.size}`);
  console.log(`timer counts down: ${decayed}`);
  console.log(`wrecks despawn   : ${despawned}`);
  console.log(`infantry covering at a wreck (samples, informational): ${coverAtWreck}`);

  const fail = [];
  if (peak === 0) fail.push('no wreck ever appeared — vehicle deaths are not leaving hulks');
  if (peak > WRECK_MAX) fail.push(`${peak} wrecks at once — the field cap is broken`);
  if (!decayed) fail.push('no wreck timer ever decreased — the upkeep pass is dead');
  if (!despawned) fail.push('no wreck ever left the field — hulks are permanent clutter');
  if (errors.length) fail.push(`page errors: ${errors.slice(0, 3).join(' | ')}`);

  if (fail.length) { console.error('FAIL\n - ' + fail.join('\n - ')); process.exit(1); }
  console.log('PASS');
})();
