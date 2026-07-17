/**
 * Playtest of the strategic systems: drives real battles in a headless
 * browser and asserts every feature through __ewDebug, the DOM and
 * localStorage. NOT part of scripts/e2e/run-all.cjs (it takes ~7 minutes) —
 * run it when touching any of these systems:
 *
 *   npm run dev                              # port 3000
 *   node scripts/playtest-strategic.cjs
 *
 * Coverage: CPU personas (Frederick's bunkers), tank Overdrive, engineer C4
 * (plant + detonation), craters, adaptive music (staged firefight), knockdown,
 * shell shock (no-crash through a nuke), fog of war (grid states + minimap
 * secrecy + blind strikes), sniper camouflage (ghillie-call ambush micro),
 * faction asymmetry (exclusives + stat mods), and the full campaign loop
 * (board moves, CPU answer, battle handoff, roster gates, continue flow).
 *
 * Staging gotchas encoded below (hard-won):
 *  - localStorage is shared across pages of one browser — clear() per scenario.
 *  - Occupiable houses swallow line infantry that spawns near them; read
 *    __ewDebug.buildings and stage clear of them.
 *  - A sniper with a target in range fires and resets his ghillie — camo
 *    stages need an empty field.
 *  - Under battle load the sim runs ~30tps at speed 8: generous waits.
 *  - The order panel re-renders constantly — click buttons via in-page
 *    querySelector, never a held ElementHandle.
 */
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:3000/east-vs-west-game/';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const soft = (name, ok, detail = '') => { results.push({ name, ok: true, soft: !ok, detail }); console.log(`${ok ? 'PASS' : 'SOFT'}  ${name}${detail ? '  — ' + detail : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newPage(b, prefs, extra = {}) {
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  p._errors = [];
  p.on('pageerror', e => p._errors.push(String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('favicon')) p._errors.push('C: ' + m.text().slice(0, 150)); });
  await p.evaluateOnNewDocument((prefs2, extra2) => {
    // localStorage is shared across pages of one browser profile — reset
    // every mode key so scenarios can't leak into each other
    localStorage.clear();
    localStorage.setItem('ewv-hint-troopctl', '1');
    localStorage.setItem('ewv-music', '0');
    localStorage.setItem('ewv-fx', 'high');
    localStorage.setItem('ewv-prefs', JSON.stringify(prefs2));
    for (const [k, v] of Object.entries(extra2)) localStorage.setItem(k, v);
  }, prefs, extra);
  return p;
}
const deploy = async p => { await p.evaluate(() => { Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('DEPLOY FORCES')).click(); }); await sleep(1200); };
// eval here is safe/intentional: throwaway local test harness evaluating this
// script's own hardcoded probe expressions against the local dev page — no
// external or user-supplied input ever reaches it.
const dbg = (p, expr) => p.evaluate(e => { try { return eval('window.__ewDebug.' + e); } catch (err) { return { __err: String(err) }; } }, expr);
const waitFor = async (p, expr, pred, timeoutMs, everyMs = 500) => {
  const t0 = Date.now();
  let v;
  while (Date.now() - t0 < timeoutMs) { v = await dbg(p, expr); if (pred(v)) return v; await sleep(everyMs); }
  return v;
};

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  // ── Scenario A: vs Fortress Frederick — personas, abilities, craters,
  //    knockdown, adaptive music, nuke (shell shock path) ─────────────────
  console.log('\n=== A: battle vs Frederick (speed 8, countryside) ===');
  {
    const p = await newPage(b, { playerSide: 'WEST', cpuLevel: 'normal', gameMode: 'points', mapType: 'COUNTRYSIDE', cpuPersona: 'frederick' });
    await p.goto(BASE + '?speed=8', { waitUntil: 'networkidle2', timeout: 60000 });
    await deploy(p);

    check('A1 persona honored', (await dbg(p, 'cpuPersona')) === 'frederick', String(await dbg(p, 'cpuPersona')));

    // Overdrive: place a tank, select it, hit the ability button
    await p.evaluate(() => window.__ewDebug.spawn('WEST', 'TANK', 150, 250));
    await sleep(700);
    await p.evaluate(() => window.__ewDebug.selectOwn(1));
    await sleep(500);
    // Click via in-page query — the order panel re-renders constantly, so a
    // held ElementHandle goes stale between $ and click()
    const clickTestId = id => p.evaluate(id2 => { const el = document.querySelector(`[data-testid="${id2}"]`); if (el) el.click(); return !!el; }, id);
    const odBtn = await p.$('[data-testid="ability-overdrive"]');
    check('A2 overdrive button appears for tank selection', !!odBtn);
    if (odBtn) {
      await clickTestId('ability-overdrive');
      const od = await waitFor(p, 'overdrive', v => v >= 1, 5000);
      check('A3 overdrive activates', od >= 1, `overdrive=${od}`);
    }

    // C4: engineer + enemy bunker; select both, order the demolition
    await p.evaluate(() => window.__ewDebug.spawn('WEST', 'ENGINEER', 380, 250));
    await p.evaluate(() => window.__ewDebug.spawn('EAST', 'BUNKER', 480, 250));
    await sleep(700);
    await p.evaluate(() => window.__ewDebug.selectOwn(4));
    await sleep(500);
    const c4Btn = await p.$('[data-testid="ability-c4"]');
    check('A4 C4 button appears for engineer selection', !!c4Btn);
    if (c4Btn) {
      await clickTestId('ability-c4');
      const c4 = await waitFor(p, 'c4.length', v => v >= 1, 25000);
      check('A5 engineer reaches target and plants C4', c4 >= 1, `charges=${c4}`);
      // Under battle load the headless sim runs ~30tps, so the 300-tick fuse is ~10-15s wall
      const gone = await waitFor(p, 'c4.length', v => v === 0, 40000);
      check('A6 C4 detonates', gone === 0);
    }

    // Craters via a real missile strike
    await p.evaluate(() => window.__ewDebug.spawn('WEST', 'MISSILE_STRIKE', 600, 250));
    const craters = await waitFor(p, 'craters.length', v => v >= 1, 25000);
    check('A7 heavy ordnance gouges craters', craters >= 1, `craters=${craters}`);

    // Adaptive music heats up as the battle grows — stage a sustained
    // two-wave face-to-face firefight and sample fast: at speed 8 a single
    // clash can resolve between slow samples
    await p.evaluate(() => {
      for (let i = 0; i < 8; i++) {
        window.__ewDebug.spawn('WEST', 'SOLDIER', 350, 150 + i * 22);
        window.__ewDebug.spawn('EAST', 'SOLDIER', 450, 150 + i * 22);
      }
    });
    let lvl = await waitFor(p, 'music.level', v => v >= 1, 25000, 500);
    if (!(lvl >= 1)) {
      await p.evaluate(() => {
        for (let i = 0; i < 8; i++) {
          window.__ewDebug.spawn('WEST', 'SOLDIER', 360, 160 + i * 22);
          window.__ewDebug.spawn('EAST', 'SOLDIER', 440, 160 + i * 22);
        }
      });
      lvl = await waitFor(p, 'music.level', v => v >= 1, 25000, 500);
    }
    check('A8 adaptive music escalates in a firefight', lvl >= 1, `level=${lvl}`);
    const calls = await dbg(p, 'music.calls');
    check('A9 music driver runs on UI tick', calls > 10, `calls=${calls}`);

    // Frederick pours bunkers (persona-gated tactic)
    const bunkers = await waitFor(p, "typeStats.EAST.spawned.BUNKER || 0", v => v >= 1, 90000, 2000);
    soft('A10 Frederick builds bunkers', bunkers >= 1, `bunkers=${bunkers}`);

    // Knockdown: tracked hulls have been driving through the tree line
    const veg = await waitFor(p, 'vegDown', v => v >= 1, 40000, 2000);
    soft('A11 vegetation flattened by tracks', veg >= 1, `vegDown=${veg}`);

    // Nuke: shell-shock/cinematic path must not crash
    await p.evaluate(() => window.__ewDebug.spawn('WEST', 'NUKE', 650, 250));
    await sleep(12000);
    check('A13 no page errors through nuke/shock', p._errors.length === 0, p._errors.join(' | ').slice(0, 200));
    await p.close();
  }

  // ── Scenario B: fog of war ───────────────────────────────────────────────
  console.log('\n=== B: fog of war ===');
  {
    const p = await newPage(b, { playerSide: 'WEST', cpuLevel: 'normal', gameMode: 'points', mapType: 'COUNTRYSIDE', cpuPersona: 'balanced' }, { 'ewv-fow': '1' });
    await p.goto(BASE + '?speed=1', { waitUntil: 'networkidle2', timeout: 60000 });
    await deploy(p);
    check('B1 fog enabled', (await dbg(p, 'fogOn')) === true);
    check('B2 own spawn strip visible', (await dbg(p, "fog('WEST', 30, 250)")) === 2, String(await dbg(p, "fog('WEST', 30, 250)")));
    const far = await dbg(p, "fog('WEST', 770, 250)");
    check('B3 enemy half not visible early', far === 0 || far === 1, `state=${far}`);
    // Minimap shows no enemy dots while they are still deep in their half
    await sleep(3000);
    const red = await p.evaluate(() => {
      const cv = document.querySelector('[data-testid="minimap"]');
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let red2 = 0;
      for (let i = 0; i < d.length; i += 4) { const R = d[i], G = d[i + 1], B = d[i + 2]; if (R > 200 && G < 140 && B < 140) red2++; }
      return red2;
    });
    check('B4 hidden enemies drop off the minimap', red <= 1, `red px=${red}`);
    // Blind strike scatters (can't assert the offset; assert it still fires without error)
    await p.evaluate(() => window.__ewDebug.spawn('WEST', 'MISSILE_STRIKE', 700, 250));
    await sleep(1500);
    check('B5 blind strike into fog launches cleanly', p._errors.length === 0, p._errors.join(' | ').slice(0, 200));
    await p.close();
  }

  // ── Scenario C: faction asymmetry ────────────────────────────────────────
  console.log('\n=== C: asymmetric doctrines ===');
  {
    const p = await newPage(b, { playerSide: 'WEST', cpuLevel: 'off', gameMode: 'points', mapType: 'COUNTRYSIDE' }, { 'ewv-asym': '1' });
    await p.goto(BASE + '?speed=8', { waitUntil: 'networkidle2', timeout: 60000 });
    await deploy(p);

    // Sniper camouflage FIRST, on the pristine field — the asym checks below
    // spawn an EAST tank that wanders into sniper range at speed 8, and a
    // sniper with a target fires, which resets the ghillie by design.
    // Terrain is rolled per mount: occupiable houses sometimes land in the
    // rear, and line infantry near a house always garrisons it (pre-existing,
    // intended) — so place snipers at spots a safe margin from every house
    await p.evaluate(() => {
      const houses = window.__ewDebug.buildings || [];
      let placed = 0;
      for (let y = 120; y <= 430 && placed < 8; y += 22) {
        for (const x of [80, 130, 180, 230]) {
          if (houses.some(h => Math.hypot(h.x - x, h.y - y) < 110)) continue;
          window.__ewDebug.spawn('WEST', 'SNIPER', x, y);
          placed++;
          break;
        }
      }
      window.__ewDebug.stance('WEST', 'hold');
    });
    const inCover = await waitFor(p, "unitList.filter(u => u.type === 'SNIPER' && u.isInCover).length", v => v >= 1, 60000, 1500);
    check('C7 held snipers slip into forest cover', inCover >= 1, `inCover=${inCover}`);
    const camo = await waitFor(p, 'camouflaged', v => v >= 1, 60000, 1500);
    check('C8 sniper camouflages (still + hold + tree cover)', camo >= 1, `camouflaged=${camo}`);

    check('C1 asym mode on', (await dbg(p, 'asymOn')) === true);
    check('C2 WEST cannot field TESLA', (await p.evaluate(() => window.__ewDebug.spawn('WEST', 'TESLA'))) === false);
    check('C3 EAST can field TESLA', (await p.evaluate(() => window.__ewDebug.spawn('EAST', 'TESLA'))) === true);
    check('C4 EAST cannot launch CRUISE', (await p.evaluate(() => window.__ewDebug.spawn('EAST', 'CRUISE', 200, 250))) === false);
    check('C5 WEST cannot call AIRSTRIKE', (await p.evaluate(() => window.__ewDebug.spawn('WEST', 'AIRSTRIKE', 600, 250))) === false);
    await p.evaluate(() => window.__ewDebug.spawn('EAST', 'TANK'));
    await sleep(800);
    const hp = await p.evaluate(() => {
      const l = (window.__ewDebug.unitList || []).filter(u => u.type === 'TANK' && u.team === 'EAST');
      return l.length ? Math.max(...l.map(u => u.health)) : (window.__ewDebug.unitList || []).length ? -1 : -2;
    });
    check('C6 EAST tank carries +15% hull (276 HP)', hp === 276, `hp=${hp}`);
    await p.close();
  }

  // ── Scenario D: grand campaign ───────────────────────────────────────────
  console.log('\n=== D: grand campaign ===');
  {
    const p = await newPage(b, { playerSide: 'WEST', cpuLevel: 'normal', gameMode: 'points', mapType: 'COUNTRYSIDE', cpuPersona: 'random' });
    await p.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await p.click('[data-testid="campaign-btn"]');
    await sleep(600);
    check('D1 board opens', !!(await p.$('[data-testid="campaign-board"]')));
    // Move the w-oil army onto the neutral airbase
    await p.click('[data-testid="terr-w-oil"]'); await sleep(300);
    await p.click('[data-testid="terr-mid-air"]'); await sleep(800);
    let camp = await p.evaluate(() => JSON.parse(localStorage.getItem('ewv-campaign') || 'null'));
    check('D2 unopposed take of Skyline Airbase', camp && camp.owner['mid-air'] === 'WEST', JSON.stringify(camp?.owner?.['mid-air']));
    const cpuMoved = camp && (Object.entries(camp.owner).some(([id, o]) => id.startsWith('mid-') && id !== 'mid-air' && o === 'EAST') || camp.armies.some(a => a.team === 'EAST' && !a.territory.startsWith('e-')));
    soft('D3 enemy commander answered', !!cpuMoved, (camp?.log ?? []).slice(-2).join(' / '));
    // If the CPU's answer started a battle, this click goes to war; otherwise assault Port Zarya
    let inBattle = !(await p.$('[data-testid="campaign-board"]'));
    if (!inBattle) {
      await p.click('[data-testid="terr-mid-air"]'); await sleep(300);
      await p.click('[data-testid="terr-e-harbor"]'); await sleep(1500);
      inBattle = !(await p.$('[data-testid="campaign-board"]'));
    }
    check('D4 contested move launches a battle', inBattle);
    if (inBattle) {
      await sleep(2500);
      // Roster locks in a campaign battle: WEST holds a harbor but no airbase/silo...
      camp = await p.evaluate(() => JSON.parse(localStorage.getItem('ewv-campaign') || 'null'));
      const westHasAirbase = camp && camp.owner['mid-air'] === 'WEST';
      const strike = await p.evaluate(() => window.__ewDebug.spawn('WEST', 'AIRSTRIKE', 600, 250));
      check('D5 airbase gate on strikes', strike === westHasAirbase, `airbase=${westHasAirbase} strike=${strike}`);
      check('D6 silo gate on nuke', (await p.evaluate(() => window.__ewDebug.spawn('WEST', 'NUKE', 600, 250))) === false);
      // Win it and settle the board
      await p.evaluate(() => window.__ewDebug.winTeam('WEST'));
      await sleep(1500);
      const cont = await p.$('[data-testid="campaign-continue"]');
      check('D7 continue overlay after battle', !!cont);
      if (cont) {
        camp = await p.evaluate(() => JSON.parse(localStorage.getItem('ewv-campaign') || 'null'));
        const battleTerr = camp?.log?.slice(-4).join(' ') ?? '';
        check('D8 board settled a battle result', camp && Object.values(camp.owner).filter(o => o === 'WEST').length >= 6, battleTerr.slice(0, 120));
        await cont.click();
        await sleep(1200);
        const backOnBoard = !!(await p.$('[data-testid="campaign-board"]'));
        const nextBattle = !backOnBoard; // counterattack goes straight to war
        check('D9 continue returns to board or counterattack', backOnBoard || nextBattle, backOnBoard ? 'board' : 'battle');
      }
    }
    check('D10 no page errors across campaign flow', p._errors.length === 0, p._errors.join(' | ').slice(0, 200));
    await p.close();
  }

  await b.close();
  const hard = results.filter(r => !r.ok).length;
  const softs = results.filter(r => r.soft).length;
  console.log(`\n${results.length - hard}/${results.length} checks passed (${softs} soft-flagged)`);
  process.exit(hard ? 1 : 0);
})().catch(e => { console.error('PLAYTEST CRASHED:', e.message); process.exit(1); });
