/**
 * Match point / last stand: a side reaching 85% of a win is announced once,
 * the side about to lose gets a free rally surge, and the march goes tense.
 *
 * What each assertion would have to see to fail:
 *   - 80 points must NOT trip it (threshold drifting down turns every mid-game
 *     lead into a free rally for the loser).
 *   - 85 points must trip it: event in the feed, banner on screen.
 *   - The DEFENDER (East) gets the surge for LAST_STAND_MS, free: its rally
 *     cooldown (readyAt) stays untouched and its money is not charged. The
 *     attacker gets nothing.
 *   - Music tension goes on. Before this test existed, points mode tested
 *     min(score) >= 90, so a one-sided finish never got the tension layer.
 *   - It fires once per side: pushing the score further must not re-announce.
 *   - The banner clears after its 5s of sim time.
 */
const puppeteer = require('puppeteer-core');

const LAST_STAND_MS = 12000; // keep in step with constants.ts

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
  await p.waitForFunction(() => window.__ewDebug && window.__ewDebug.music && window.__ewDebug.music.calls > 3, { timeout: 60000 });

  const dbg = () => p.evaluate(() => ({
    mp: __ewDebug.matchPoint, rallyUntil: __ewDebug.rallyUntil, rallyReadyAt: __ewDebug.rallyReadyAt,
    now: __ewDebug.simNowMs, music: __ewDebug.music,
    events: __ewDebug.lastEvents.filter(t => t.startsWith('MATCH POINT')),
    banner: !!document.querySelector('[data-testid="matchpoint-banner"]'),
  }));
  // Snapshot props refresh on the 10fps UI tick: wait until a fresh one lands
  const nextSnapshot = async () => {
    const c = await p.evaluate(() => __ewDebug.music.calls);
    await p.waitForFunction(c0 => __ewDebug.music.calls > c0 + 1, { timeout: 20000 }, c);
  };

  const fails = [];
  const check = (ok, msg) => { if (!ok) fails.push(msg); };

  // 1. Below the threshold: nothing
  await p.evaluate(() => __ewDebug.setScore('WEST', 80));
  await nextSnapshot(); await nextSnapshot();
  const below = await dbg();
  check(below.mp.WEST == null && below.mp.EAST == null, `80 points tripped match point: ${JSON.stringify(below.mp)}`);
  check(!below.music.tension, '80 points turned music tension on');
  check(!below.banner, 'banner showed below the threshold');

  // 2. At the threshold: announced, defender surges for free
  await p.evaluate(() => __ewDebug.setScore('WEST', 85));
  await p.waitForFunction(() => __ewDebug.matchPoint.WEST != null, { timeout: 20000 }).catch(() => {});
  await nextSnapshot();
  const at = await dbg();
  check(at.mp.WEST != null, 'match point never fired at 85 points');
  check(at.mp.EAST == null, 'the trailing side was also flagged at match point');
  check(at.rallyUntil.EAST === at.mp.WEST + LAST_STAND_MS, `defender surge: until=${at.rallyUntil.EAST}, expected ${at.mp.WEST + LAST_STAND_MS}`);
  check(at.rallyReadyAt.EAST === 0, `last stand touched the defender's rally cooldown (readyAt=${at.rallyReadyAt.EAST})`);
  check(at.rallyUntil.WEST === 0, `the attacker got a surge too (until=${at.rallyUntil.WEST})`);
  check(at.events.length === 1, `expected one MATCH POINT event, got ${at.events.length}`);
  check(at.music.tension, 'music tension stayed off at match point');
  check(at.banner, 'match-point banner did not render');

  // 3. Fires once: more score, no second announcement or reset of the surge
  await p.evaluate(() => __ewDebug.setScore('WEST', 90));
  await nextSnapshot(); await nextSnapshot();
  const again = await dbg();
  check(again.mp.WEST === at.mp.WEST, 'match point re-fired');
  check(again.events.length === 1, `MATCH POINT announced ${again.events.length} times`);

  // 4. Banner clears after 5s of sim time
  await p.waitForFunction(() => !document.querySelector('[data-testid="matchpoint-banner"]'), { timeout: 60000 }).catch(() => {});
  const later = await dbg();
  check(!later.banner, `banner still up ${later.now - at.mp.WEST}ms of sim time after match point`);

  check(errors.length === 0, `page errors: ${errors.join(' | ')}`);
  await b.close();

  console.log(JSON.stringify({ mpAt: at.mp.WEST, surgeUntil: at.rallyUntil.EAST, tension: at.music.tension, events: again.events.length }));
  if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
