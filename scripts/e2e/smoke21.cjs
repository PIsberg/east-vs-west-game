/**
 * Air Command + AA interception: strikes are paced and counterable.
 *
 * Two mechanics, both of which fail silently if they rot:
 *  - The shared rearm clock: if the spawnUnit veto stops firing, strike
 *    chains come back (and if it fires but still charges, players lose money
 *    for nothing — the veto path must return false BEFORE any charge).
 *  - AA interception: the lead calculation encodes the double-step projectile
 *    quirk (rounds advance twice per tick). If either the quirk or the lead
 *    math changes without the other, AA quietly reverts to decorative tracer
 *    fire — every round misses behind the plane and no test that merely
 *    "fires at flyovers" would notice. So the assertion here is END TO END:
 *    a real plane must actually fall out of a real sky.
 *
 * All probes run early in the match, before the CPUs' own strike logic can
 * lock the clocks we assert on.
 */
const puppeteer = require('puppeteer-core');

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const errors = [];
  const p = await b.newPage();
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.evaluateOnNewDocument(() => localStorage.setItem('ewv-fx', 'high'));
  await p.goto('http://localhost:3000/east-vs-west-game/?spectate&map=COUNTRYSIDE&speed=4',
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction('!!(window.__ewDebug && window.__ewDebug.airOps)', { timeout: 60000 });

  // 1. Rearm clock: first launch accepted, second vetoed, clock visibly set.
  const cd = await p.evaluate(() => {
    const first = __ewDebug.spawn('WEST', 'MISSILE_STRIKE', 500, 300);
    const second = __ewDebug.spawn('WEST', 'AIRSTRIKE', 450, 280);
    return { first, second };
  });
  await new Promise(r => setTimeout(r, 400)); // let the debug snapshot refresh
  const lock0 = await p.evaluate(() => __ewDebug.airOps.WEST);

  // 2. The clock counts down (tick-based, so it runs with the sim).
  await new Promise(r => setTimeout(r, 2500));
  const lock1 = await p.evaluate(() => __ewDebug.airOps.WEST);

  // 3. Interception: an AA picket line under the flight path of an incoming
  //    EAST strike. AA damage (60) one-shots a plane (40 HP) — with a correct
  //    lead, three guns practically guarantee the kill before the drop.
  const aa = await p.evaluate(() => {
    const ok1 = __ewDebug.spawn('WEST', 'ANTI_AIR', 520, 150);
    const ok2 = __ewDebug.spawn('WEST', 'ANTI_AIR', 600, 170);
    const ok3 = __ewDebug.spawn('WEST', 'ANTI_AIR', 680, 150);
    return { ok1, ok2, ok3 };
  });
  // Launch an EAST strike over the picket. The EAST CPU shares that clock and
  // may hold it when we ask (spectate at speed 4 runs the sim ~4x wall time),
  // so wait for a free window and retry — the clock frees every ~5.5s of wall
  // time here, and any CPU plane the picket downs in the meantime counts too.
  // The feed only holds 8 entries — poll for the shoot-down DURING the retry
  // window too, or a busy feed can scroll the evidence away before we look.
  const sawShotDown = () => p.evaluate(() =>
    (__ewDebug.lastEvents ?? []).some(t => /shot down|INTERCEPTED/i.test(t)));
  let strike = false, shotDown = false;
  for (let i = 0; i < 30 && !strike; i++) {
    strike = await p.evaluate(() =>
      __ewDebug.airOps.EAST === 0 ? __ewDebug.spawn('EAST', 'MISSILE_STRIKE', 200, 300) : false);
    shotDown = shotDown || await sawShotDown();
    if (!strike) await new Promise(r => setTimeout(r, 700));
  }
  for (let i = 0; i < 20 && !shotDown; i++) {
    await new Promise(r => setTimeout(r, 1000));
    shotDown = await sawShotDown();
  }
  await b.close();

  console.log(`first strike accepted : ${cd.first}`);
  console.log(`second strike vetoed  : ${cd.second === false}`);
  console.log(`rearm ticks after use : ${lock0} -> ${lock1} (must be >0 and falling)`);
  console.log(`AA spawned ${[aa.ok1, aa.ok2, aa.ok3].filter(Boolean).length}/3, strike launched: ${strike}`);
  console.log(`plane shot down       : ${shotDown}`);

  const fail = [];
  if (!cd.first) fail.push('first strike rejected — clock started locked or spawn hook broke');
  if (cd.second !== false) fail.push('second strike accepted immediately — the shared rearm veto is dead');
  if (!(lock0 > 0)) fail.push('airOps ticks not set after a launch');
  if (!(lock1 < lock0)) fail.push('airOps ticks not counting down');
  if (!strike) fail.push('EAST strike never launched — no free clock window found in ~21s (clock stuck?)');
  if (!shotDown) fail.push('no aircraft was ever shot down over a 3-gun AA picket — interception/lead is not connecting');
  if (errors.length) fail.push(`page errors: ${errors.slice(0, 3).join(' | ')}`);

  if (fail.length) { console.error('FAIL\n - ' + fail.join('\n - ')); process.exit(1); }
  console.log('PASS');
})();
