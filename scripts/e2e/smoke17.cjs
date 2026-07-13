/**
 * Movement: vehicles round obstacles instead of wedging against them, and the
 * APC puts its squad on the ground while it's still alive.
 *
 * Samples unit positions through spectator matches and counts 3-second windows
 * in which a vehicle went nowhere (net travel < 6px). A "zero velocity" check
 * would miss the real failure — a wedged tank jitters in place — so this looks
 * at net displacement over a window instead. Before the movement overhaul the
 * fleet spent 22% of its windows wedged (worst single wedge: 16.5s).
 *
 * ARTILLERY and MORTAR are excluded: they stop to fire by design.
 */
const puppeteer = require('puppeteer-core');

const MAPS = ['COUNTRYSIDE', 'URBAN'];
const SECONDS = 45;
const VEHICLES = new Set(['TANK', 'APC', 'ANTI_AIR', 'TESLA', 'JEEP', 'TRANSPORT']);
const WINDOW = 6;         // samples of 500ms = a 3s window
const MIN_TRAVEL = 6;     // px of net travel expected in that window
const MAX_WEDGED_PCT = 12; // healthy is 1-7% depending on machine load; the old code sat at 22%
const MAX_DWELL_SEC = 6;   // no vehicle should be pinned this long

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  let windows = 0, wedged = 0, worstDwell = 0;
  let apcsSeen = 0, apcsDeployed = 0, apcsDiedLoaded = 0;
  const errors = [];

  for (const map of MAPS) {
    const p = await b.newPage();
    p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    await p.evaluateOnNewDocument(() => localStorage.setItem('ewv-fx', 'high'));
    await p.goto(`http://localhost:3000/east-vs-west-game/?spectate&map=${map}&speed=4`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction('!!window.__ewDebug', { timeout: 60000 });

    const hist = new Map();  // unit id -> recent samples
    const apcs = new Map();  // apc id -> last seen state
    const end = Date.now() + SECONDS * 1000;
    while (Date.now() < end) {
      await new Promise(r => setTimeout(r, 500));
      const units = await p.evaluate(() => (window.__ewDebug.unitList || []).map(u => ({
        id: u.id, type: u.type, x: u.position.x, y: u.position.y, deployed: !!u.deployed,
      })));

      const live = new Set(units.map(u => u.id));
      for (const u of units) {
        if (u.type === 'APC') apcs.set(u.id, { ...(apcs.get(u.id) || {}), ...u, gone: false });
        if (!VEHICLES.has(u.type)) continue;
        const h = hist.get(u.id) || { s: [], dwell: 0 };
        h.s.push({ x: u.x, y: u.y });
        if (h.s.length > WINDOW) h.s.shift();
        hist.set(u.id, h);
      }

      // Travel over the window, per vehicle with a full window of samples.
      const ready = [...hist.entries()].filter(([id, h]) => h.s.length === WINDOW && live.has(id));
      const travel = ready.map(([, h]) => Math.hypot(h.s[WINDOW - 1].x - h.s[0].x, h.s[WINDOW - 1].y - h.s[0].y));
      // A loaded machine can starve the simulation, which looks exactly like
      // every vehicle being stuck. Only judge a window when the army as a whole
      // is moving — a real wedge is one unit going nowhere while the rest advance.
      const median = travel.length ? [...travel].sort((a, b) => a - b)[Math.floor(travel.length / 2)] : 0;
      if (travel.length >= 3 && median < MIN_TRAVEL) continue; // sim stalled, not the units

      ready.forEach(([, h], i) => {
        windows++;
        if (travel[i] < MIN_TRAVEL) {
          wedged++;
          h.dwell += 0.5;
          worstDwell = Math.max(worstDwell, h.dwell);
        } else h.dwell = 0;
      });
      for (const [id, a] of apcs) {
        if (!live.has(id) && !a.gone) { a.gone = true; if (!a.deployed) apcsDiedLoaded++; }
      }
    }
    await p.close();
    for (const [, a] of apcs) { apcsSeen++; if (a.deployed) apcsDeployed++; }
  }
  await b.close();

  const pct = windows ? (100 * wedged / windows) : 0;
  console.log(`wedged ${wedged}/${windows} vehicle-windows (${pct.toFixed(1)}%), worst dwell ${worstDwell.toFixed(1)}s`);
  console.log(`APCs: seen ${apcsSeen}, deployed while alive ${apcsDeployed}, died with squad aboard ${apcsDiedLoaded}`);
  if (errors.length) console.log('page errors:', errors.slice(0, 3));

  const fail = [];
  if (!windows) fail.push('no vehicle movement sampled — did the match start?');
  if (pct > MAX_WEDGED_PCT) fail.push(`${pct.toFixed(1)}% of windows wedged (max ${MAX_WEDGED_PCT}%) — units are getting stuck on terrain`);
  if (worstDwell > MAX_DWELL_SEC) fail.push(`a vehicle was pinned for ${worstDwell.toFixed(1)}s (max ${MAX_DWELL_SEC}s)`);
  if (apcsSeen && apcsDeployed === 0) fail.push('no APC deployed its squad while alive');
  if (apcsDiedLoaded > apcsDeployed) fail.push(`${apcsDiedLoaded} APCs died with the squad still aboard (vs ${apcsDeployed} deployed)`);
  if (errors.length) fail.push(`page errors: ${errors[0]}`);

  if (fail.length) { console.log('FAIL\n- ' + fail.join('\n- ')); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.error('RUN FAILED:', e.message); process.exit(1); });
