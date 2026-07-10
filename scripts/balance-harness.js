/**
 * CPU-vs-CPU balance harness.
 *
 * Runs one spectator match per map against a dev server and prints per-unit
 * efficiency (kill value per dollar spent) plus final scores.
 *
 * Usage:
 *   npm run dev                      # note the port
 *   node scripts/balance-harness.js [matchSeconds] [baseUrl] [browserPath]
 *
 * Defaults: 70s per match, http://localhost:3000/east-vs-west-game/,
 * Edge at its standard Windows install path. Requires `puppeteer-core`
 * (install anywhere on the resolve path; it is intentionally not a
 * dependency of the game).
 *
 * The game exposes window.__ewDebug (score, per-type kills/kill-value/
 * losses/spawns) and hidden URL params ?spectate&map=X&speed=N — see
 * GameCanvas.tsx / App.tsx.
 */
const puppeteer = require('puppeteer-core');

const MAPS = ['COUNTRYSIDE', 'URBAN', 'DESERT', 'ARCHIPELAGO'];
const MATCH_SECONDS = Number(process.argv[2] || 70);
const BASE = process.argv[3] || 'http://localhost:3000/east-vs-west-game/';
const BROWSER = process.argv[4] || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SPEED = 6;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: BROWSER,
    headless: 'new',
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const agg = {};
  let totalScore = { WEST: 0, EAST: 0 };

  for (const map of MAPS) {
    const page = await browser.newPage();
    await page.goto(`${BASE}?spectate&map=${map}&speed=${SPEED}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('!!window.__ewDebug', { timeout: 60000 });
    await new Promise(r => setTimeout(r, MATCH_SECONDS * 1000));
    const dbg = await page.evaluate(() => window.__ewDebug);
    await page.close();

    totalScore.WEST += dbg.score.WEST; totalScore.EAST += dbg.score.EAST;
    console.log(`${map}: score W${dbg.score.WEST}-E${dbg.score.EAST} built W${dbg.stats.WEST.built}/E${dbg.stats.EAST.built} lost W${dbg.stats.WEST.lost}/E${dbg.stats.EAST.lost}`);
    for (const team of ['WEST', 'EAST']) {
      const ts = dbg.typeStats[team];
      for (const [t, n] of Object.entries(ts.spawned)) (agg[t] ||= { spawned: 0, kills: 0, killValue: 0, lost: 0 }).spawned += n;
      for (const [t, n] of Object.entries(ts.kills)) (agg[t] ||= { spawned: 0, kills: 0, killValue: 0, lost: 0 }).kills += n;
      for (const [t, n] of Object.entries(ts.killValue)) (agg[t] ||= { spawned: 0, kills: 0, killValue: 0, lost: 0 }).killValue += n;
      for (const [t, n] of Object.entries(ts.lost)) (agg[t] ||= { spawned: 0, kills: 0, killValue: 0, lost: 0 }).lost += n;
    }
  }
  await browser.close();

  // Costs mirror constants.ts; SOLDIER spawns are individual models (cost 25 per squad of 3)
  const COSTS = { TANK: 110, SOLDIER: 25 / 3, ARTILLERY: 80, RAMBO: 150, HELICOPTER: 155, SNIPER: 90, AIRBORNE: 70, MISSILE_STRIKE: 125, MINE_PERSONAL: 20, MINE_TANK: 45, DRONE: 45, ANTI_AIR: 80, TESLA: 165, FLAMETHROWER: 70, MEDIC: 45, ENGINEER: 55, APC: 95, BUNKER: 155, GUNSHIP: 225, NUKE: 2500, AIRSTRIKE: 100 };
  console.log('\ntype              spawned  kills  killVal  lost  spent$  killVal/$');
  Object.entries(agg)
    .map(([t, a]) => ({ t, ...a, spent: a.spawned * (COSTS[t] ?? 0) }))
    .map(r => ({ ...r, eff: r.spent > 0 ? r.killValue / r.spent : 0 }))
    .sort((a, b) => b.eff - a.eff)
    .forEach(r => console.log(`${r.t.padEnd(16)} ${String(r.spawned).padStart(7)} ${String(r.kills).padStart(6)} ${String(r.killValue).padStart(8)} ${String(r.lost).padStart(5)} ${String(Math.round(r.spent)).padStart(7)} ${r.eff.toFixed(2).padStart(9)}`));
  console.log(`\nTOTAL SCORE  W${totalScore.WEST} - E${totalScore.EAST}`);
})().catch(e => { console.error('BALANCE RUN FAILED:', e.message); process.exit(1); });
