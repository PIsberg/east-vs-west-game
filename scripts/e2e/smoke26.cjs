/**
 * Breakthrough burst: a unit crossing the far line and scoring throws a
 * team-colored ring, sparks and signal flares, bigger for a tank's 3-point run.
 *
 * Staged with the CPU off: a West jeep and then a West tank are dropped just
 * short of the East edge and drive over it.
 * What each assertion would have to see to fail:
 *   - Score rises but no burst is recorded: the FX block is unreachable or was
 *     moved off the scoring path.
 *   - The burst is empty (0 particles): the pushes were dropped.
 *   - The tank's burst is not larger than the jeep's: the `big` branch broke,
 *     so a 3-point run reads the same as a 1-point one.
 * Counts come from __ewDebug.fxStats, which tallies particles CREATED (alive
 * particle counts decay every tick and cannot measure one event).
 */
const puppeteer = require('puppeteer-core');

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.setViewport({ width: 1280, height: 800 });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('ewv-hint-troopctl', '1'); localStorage.setItem('ewv-music', '0'); localStorage.setItem('ewv-fx', 'high'); localStorage.setItem('ewv-prefs', JSON.stringify({ playerSide: 'WEST', cpuLevel: 'off', gameMode: 'points', mapType: 'COUNTRYSIDE' })); });
  await p.goto('http://localhost:3000/east-vs-west-game/?seed=101&speed=8', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('DEPLOY FORCES')), { timeout: 60000 });
  await p.evaluate(() => { Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('DEPLOY FORCES')).click(); });
  await p.waitForFunction(() => window.__ewDebug && window.__ewDebug.fxStats && window.__ewDebug.music.calls > 3, { timeout: 60000 });

  const state = () => p.evaluate(() => ({ score: __ewDebug.score?.WEST ?? null, fx: __ewDebug.fxStats }));
  // Drive one unit over the line and return the burst it produced
  const run = async (type, y) => {
    const before = await state();
    const ok = await p.evaluate((t, yy) => __ewDebug.spawn('WEST', t, 785, yy), type, y);
    if (!ok) return { error: `spawn ${type} refused` };
    await p.waitForFunction(n => __ewDebug.fxStats.breakthroughs > n, { timeout: 60000 }, before.fx.breakthroughs).catch(() => {});
    const after = await state();
    return {
      bursts: after.fx.breakthroughs - before.fx.breakthroughs,
      particles: after.fx.breakthroughParticles - before.fx.breakthroughParticles,
    };
  };

  const fails = [];
  const jeep = await run('JEEP', 300);
  const tank = await run('TANK', 360);
  if (jeep.error || tank.error) fails.push(jeep.error || tank.error);
  else {
    if (jeep.bursts < 1) fails.push('jeep crossed the line but no breakthrough burst was recorded');
    if (tank.bursts < 1) fails.push('tank crossed the line but no breakthrough burst was recorded');
    if (jeep.particles <= 0) fails.push('jeep burst created no particles');
    if (!(tank.particles / Math.max(1, tank.bursts) > jeep.particles / Math.max(1, jeep.bursts))) fails.push(`tank burst (${tank.particles}) is not bigger than the jeep's (${jeep.particles})`);
  }
  if (errors.length) fails.push(`page errors: ${errors.join(' | ')}`);
  await b.close();

  console.log(JSON.stringify({ jeep, tank }));
  if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
