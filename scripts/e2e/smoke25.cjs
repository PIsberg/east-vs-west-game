/**
 * Battle heroes: each side's top-scoring single unit is tracked through the
 * match and named on the victory screen (with its rank, and whether it lived).
 *
 * What each assertion would have to see to fail:
 *   - No hero after a minute of CPU-vs-CPU fighting: kill crediting stopped
 *     feeding heroRef (kills happen constantly in spectate).
 *   - A living unit with MORE kills than its side's hero: the "most kills"
 *     update is wrong (e.g. it only records the first killer).
 *   - Victory screen without the hero's kill count: the row isn't wired to
 *     the ref, or renders the placeholder.
 * Paratroopers' spawn-time veteran record (kills: 3) is excluded, since it was
 * never earned in this match.
 * Boarded units leave unitList (they ride in passengers), so the test never
 * requires the hero itself to be visible, only that nobody visible outranks it.
 */
const puppeteer = require('puppeteer-core');

const SAMPLES = 24;
const INTERVAL = 2500;

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const errors = [];
  const p = await b.newPage();
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.evaluateOnNewDocument(() => localStorage.setItem('ewv-fx', 'high'));
  await p.goto('http://localhost:3000/east-vs-west-game/?spectate&map=COUNTRYSIDE&speed=8&seed=7',
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction('!!(window.__ewDebug && window.__ewDebug.hero)', { timeout: 60000 });

  const fails = [];
  let seenHero = false, outranked = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const s = await p.evaluate(() => ({ hero: __ewDebug.hero, units: __ewDebug.unitList ?? [] }));
    for (const t of ['WEST', 'EAST']) {
      const h = s.hero[t];
      // Paratroopers spawn with kills: 3 (drop-in veterans) without scoring
      // them; only a kill actually credited can make a hero.
      const best = Math.max(0, ...s.units.filter(u => u.team === t && u.health > 0 && !(u.type === 'AIRBORNE' && u.kills <= 3)).map(u => u.kills));
      if (h) seenHero = true;
      // unitList and hero come from the same snapshot, so they must agree
      if (best > (h ? h.kills : 0)) { outranked++; fails.push(`${t}: living unit has ${best} kills, hero has ${h ? h.kills : 'none'}`); }
    }
    await new Promise(r => setTimeout(r, INTERVAL));
  }
  if (!seenHero) fails.push('no hero recorded after a minute of fighting');

  const final = await p.evaluate(() => __ewDebug.hero);
  await p.evaluate(() => __ewDebug.winTeam('WEST'));
  await p.waitForSelector('[data-testid="hero-WEST"]', { timeout: 30000 }).catch(() => {});
  const rows = await p.evaluate(() => ['WEST', 'EAST'].map(t => document.querySelector(`[data-testid="hero-${t}"]`)?.textContent ?? null));
  ['WEST', 'EAST'].forEach((t, i) => {
    const h = final[t];
    if (rows[i] == null) fails.push(`victory screen has no hero row for ${t}`);
    else if (h && !rows[i].includes('kills')) fails.push(`${t} hero row lacks a kill count: "${rows[i]}"`);
  });
  if (errors.length) fails.push(`page errors: ${errors.join(' | ')}`);
  await b.close();

  console.log(JSON.stringify({ hero: final, rows, outranked }));
  if (fails.length) { console.log('FAIL\n - ' + [...new Set(fails)].join('\n - ')); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
