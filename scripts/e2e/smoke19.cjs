/**
 * Winter map: the frozen river is a mechanic, not a palette swap.
 *
 * The ice changes who can cross where — and every clause of that is the kind
 * of thing that dies silently. If the terrain gen stops flagging segments
 * `frozen`, infantry quietly go back to queueing at the bridges and the map
 * plays like Countryside in white; the balance harness would never notice.
 * So the assertions are on the mechanic:
 *   1. The river exists and every segment is frozen (gen contract).
 *   2. Foot units actually cross ON the ice, away from any bridge — the
 *      bridge-detour short-circuit is alive.
 *   3. No ground vehicle is ever mid-river off-bridge — ice opens the channel
 *      to boots only, never to armor.
 *   4. A gunboat aimed at the ice is vetoed (frozen water is not open water).
 *   5. It never rains on the Winter map (both weather rolls are map-aware).
 */
const puppeteer = require('puppeteer-core');

const SAMPLES = 22;
const INTERVAL = 2000;
const FOOT = new Set(['SOLDIER', 'SNIPER', 'SPECIAL_FORCES', 'FLAMETHROWER',
                      'MEDIC', 'ENGINEER', 'MORTAR', 'AIRBORNE']);
// Flyers cross everything legitimately; boats are anchored by hand; mines and
// napalm are PLACED ordnance, not fording vehicles — the CPU may legitimately
// drop a minefield on or beside the frozen channel.
const EXEMPT = new Set([...FOOT, 'HELICOPTER', 'FIGHTER', 'DRONE', 'GUNSHIP', 'GUNBOAT',
                        'MINE_TANK', 'MINE_PERSONAL', 'NAPALM']);

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const errors = [];
  const p = await b.newPage();
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.evaluateOnNewDocument(() => localStorage.setItem('ewv-fx', 'high'));
  await p.goto('http://localhost:3000/east-vs-west-game/?spectate&map=WINTER&speed=4',
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction('!!(window.__ewDebug && window.__ewDebug.riverSegs)', { timeout: 60000 });

  const geo = await p.evaluate(() => ({
    segs: __ewDebug.riverSegs, bridges: __ewDebug.bridges,
  }));

  // 4. Gunboat veto on ice — spawn must refuse and leave no boat behind
  const veto = await p.evaluate(() => {
    const s = __ewDebug.riverSegs[Math.floor(__ewDebug.riverSegs.length / 2)];
    const ok = __ewDebug.spawn('WEST', 'GUNBOAT', s.x, s.y);
    return { ok };
  });

  let iceCrossers = 0;
  const weathers = new Set();
  // A vehicle that momentarily clips the bank while steering around bridge
  // congestion is not "fording" — only flag a vehicle seen mid-river in TWO
  // OR MORE samples (a real forder spends many seconds in the channel).
  const armorSightings = new Map(); // id -> { type, n }
  for (let i = 0; i < SAMPLES; i++) {
    const s = await p.evaluate(() => ({
      weather: __ewDebug.weather,
      boats: (__ewDebug.unitList ?? []).filter(u => u.type === 'GUNBOAT').length,
      units: (__ewDebug.unitList ?? []).filter(u => u.health > 0)
        .map(u => ({ id: u.id, type: u.type, x: u.position.x, y: u.position.y })),
      segs: __ewDebug.riverSegs, bridges: __ewDebug.bridges,
    }));
    weathers.add(s.weather);
    for (const u of s.units) {
      const seg = s.segs.find(r => Math.abs(r.y - u.y) < 11);
      if (!seg || Math.abs(u.x - seg.x) >= seg.w / 2 - 4) continue;
      const onBridge = s.bridges.some(br =>
        Math.abs(u.x - br.x) < br.w / 2 + 12 && Math.abs(u.y - br.y) < br.h / 2 + 12);
      if (onBridge) continue;
      if (FOOT.has(u.type)) iceCrossers++;
      else if (!EXEMPT.has(u.type)) {
        const rec = armorSightings.get(u.id) ?? { type: u.type, n: 0 };
        rec.n++;
        armorSightings.set(u.id, rec);
      }
    }
    await new Promise(r => setTimeout(r, INTERVAL));
  }
  const armorInRiver = [...armorSightings.values()].filter(r => r.n >= 2).map(r => r.type);
  await b.close();

  console.log(`river segs       : ${geo.segs.length} (${geo.segs.filter(s => s.frozen).length} frozen)`);
  console.log(`bridges          : ${geo.bridges.length}`);
  console.log(`ice crossings    : ${iceCrossers} (foot-unit samples mid-ice, off-bridge)`);
  console.log(`armor in river   : ${armorInRiver.length ? [...new Set(armorInRiver)].join(', ') : '(none)'}`);
  console.log(`gunboat on ice   : ${veto.ok ? 'ANCHORED (bug)' : 'vetoed'}`);
  console.log(`weathers seen    : ${[...weathers].sort().join(', ')}`);

  const fail = [];
  if (!geo.segs.length) fail.push('no river generated — Winter must always have its frozen channel');
  if (geo.segs.some(s => !s.frozen)) fail.push('unfrozen river segments on Winter — terrain gen lost the frozen flag');
  if (geo.bridges.length < 2) fail.push(`only ${geo.bridges.length} bridges — vehicles need their crossings`);
  if (iceCrossers === 0) fail.push('no foot unit ever crossed the ice off-bridge — the ice short-circuit is dead code');
  if (armorInRiver.length) fail.push(`ground vehicles found mid-river: ${[...new Set(armorInRiver)].join(', ')}`);
  if (veto.ok) fail.push('gunboat anchored in a frozen channel — the open-water veto lost its frozen check');
  if (weathers.has('rain')) fail.push('it rained on the Winter map — a weather roll is not map-aware');
  if (errors.length) fail.push(`page errors: ${errors.slice(0, 3).join(' | ')}`);

  if (fail.length) { console.error('FAIL\n - ' + fail.join('\n - ')); process.exit(1); }
  console.log('PASS');
})();
