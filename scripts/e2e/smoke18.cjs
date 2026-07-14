/**
 * Suppression: rounds landing near a foot soldier pin him, and only him.
 *
 * This test exists because the feature shipped invisible. Suppression has no
 * score, no HUD counter and no sound — a wall of fire that pinned nobody would
 * play exactly like one that worked, and the balance harness would have called
 * it "healthy" either way, because a mechanic that does nothing changes no
 * numbers. The first probe written against it reported zero suppressed units
 * for a reason that had nothing to do with the engine: `suppressedUntil` was
 * simply not in the __ewDebug unit snapshot. A green run proved nothing.
 *
 * So the assertions are on the mechanic, not on an outcome:
 *   1. Somebody actually gets pinned in a firefight (else it is dead code).
 *   2. Only the suppressible get pinned — foot units. A pinned tank means
 *      isSuppressible() has stopped honouring MOVE_CLASS, and vehicles are
 *      quietly crawling at 0.55x.
 *   3. It wears off. suppressedUntil is an absolute timestamp; if the reload
 *      path ever refreshes it every tick a man is under fire, he never stands
 *      up again and infantry are permanently at half speed.
 */
const puppeteer = require('puppeteer-core');

const MAPS = ['COUNTRYSIDE', 'URBAN'];
const SAMPLES = 24;
const INTERVAL = 1500;

// Foot units — everything with no MOVE_CLASS entry, minus the emplacements and
// mines that isSuppressible() excludes. Keep in step with constants.ts.
const FOOT = new Set(['SOLDIER', 'SNIPER', 'SPECIAL_FORCES', 'FLAMETHROWER',
                      'MEDIC', 'ENGINEER', 'MORTAR', 'AIRBORNE']);

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  let everPinned = 0, peakAtOnce = 0, shots = 0;
  const pinnedTypes = new Set();
  const illegal = new Set();      // anything pinned that must not be
  const recovered = new Set();    // ids seen pinned, then seen free again
  const seenPinned = new Set();
  const errors = [];

  for (const map of MAPS) {
    const p = await b.newPage();
    p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    await p.evaluateOnNewDocument(() => localStorage.setItem('ewv-fx', 'high'));
    await p.goto(`http://localhost:3000/east-vs-west-game/?spectate&map=${map}&speed=4`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction('!!window.__ewDebug', { timeout: 60000 });

    for (let i = 0; i < SAMPLES; i++) {
      const s = await p.evaluate(() => {
        const d = window.__ewDebug;
        const now = Date.now();
        return {
          shots: d?.fxStats?.shots ?? 0,
          units: (d?.unitList ?? []).filter(u => u.health > 0).map(u => ({
            id: u.id, type: u.type,
            pinned: !!u.suppressedUntil && now < u.suppressedUntil,
          })),
        };
      });
      shots = Math.max(shots, s.shots);
      const pinned = s.units.filter(u => u.pinned);
      peakAtOnce = Math.max(peakAtOnce, pinned.length);
      everPinned += pinned.length;
      for (const u of pinned) {
        pinnedTypes.add(u.type);
        seenPinned.add(u.id);
        if (!FOOT.has(u.type)) illegal.add(u.type);
      }
      // Anyone previously pinned who is now free proves the timer expires.
      for (const u of s.units) if (!u.pinned && seenPinned.has(u.id)) recovered.add(u.id);
      await new Promise(r => setTimeout(r, INTERVAL));
    }
    await p.close();
  }
  await b.close();

  console.log(`shots fired      : ${shots}`);
  console.log(`peak pinned      : ${peakAtOnce}`);
  console.log(`pinned types     : ${[...pinnedTypes].sort().join(', ') || '(none)'}`);
  console.log(`recovered (unpinned again): ${recovered.size}`);

  const fail = [];
  if (shots < 50) fail.push(`only ${shots} shots fired — no firefight happened, test is inconclusive`);
  if (peakAtOnce === 0) fail.push('NOBODY was ever suppressed — the mechanic is dead code');
  if (illegal.size) fail.push(`non-foot units suppressed: ${[...illegal].join(', ')} — isSuppressible() is letting vehicles through`);
  if (seenPinned.size && recovered.size === 0) fail.push('no unit ever recovered — suppression never wears off');
  if (errors.length) fail.push(`page errors: ${errors.slice(0, 3).join(' | ')}`);

  if (fail.length) { console.error('FAIL\n - ' + fail.join('\n - ')); process.exit(1); }
  console.log('PASS');
})();
