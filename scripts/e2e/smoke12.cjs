/** Hotkeys spawn units, tooltips carry statlines + hotkey badge, urban lane markings render, rotor loop crashes nothing. */
const puppeteer = require('puppeteer-core');

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const results = {};

  {
    const p = await b.newPage();
    p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    await p.setViewport({ width: 1280, height: 800 });
    await p.evaluateOnNewDocument(() => { localStorage.setItem('ewv-hint-troopctl', '1'); localStorage.setItem('ewv-music', '0'); localStorage.setItem('ewv-fx', 'high'); localStorage.setItem('ewv-prefs', JSON.stringify({ playerSide: 'WEST', cpuLevel: 'off', gameMode: 'points', mapType: 'COUNTRYSIDE' })); });
    await p.goto('http://localhost:3000/east-vs-west-game/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('DEPLOY FORCES')), { timeout: 60000 });

    await p.evaluate(() => { Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('DEPLOY FORCES')).click(); });
    await new Promise(r => setTimeout(r, 1200));

    // Tooltip content present in DOM (hidden until hover)
    results.tooltip = await p.evaluate(() => {
      const t = document.body.textContent;
      return { statline: t.includes('♥') && t.includes('⚔'), hotkeyBadge: t.includes('Hotkey:') };
    });

    // Hotkey '7' spawns a tank; '9' a helicopter (also arms the rotor loop path)
    const before = await p.evaluate(() => window.__ewDebug.unitList.length);
    await p.keyboard.press('7');
    await new Promise(r => setTimeout(r, 700));
    await p.keyboard.press('9');
    // Spawns ride the tick-stamped input pipeline (one tick of latency) and
    // headless tick rates swing with machine load — poll for the units
    // instead of trusting a fixed sleep, then let the rotor loop spin.
    await p.waitForFunction(() => {
      const l = window.__ewDebug.unitList;
      return l.some(u => u.type === 'TANK' && u.team === 'WEST') &&
             l.some(u => u.type === 'HELICOPTER' && u.team === 'WEST');
    }, { timeout: 20000 }).catch(() => { /* the assertion below reports it */ });
    await new Promise(r => setTimeout(r, 2500)); // > one rotor-interval tick
    results.spawn = await p.evaluate(() => {
      const list = window.__ewDebug.unitList;
      return {
        tank: list.some(u => u.type === 'TANK' && u.team === 'WEST'),
        heli: list.some(u => u.type === 'HELICOPTER' && u.team === 'WEST'),
        total: list.length,
      };
    });
    results.spawnDelta = results.spawn.total - before;
    await p.close();
  }

  // Urban lane markings screenshot
  {
    const p = await b.newPage();
    p.on('pageerror', e => errors.push('URBAN: ' + String(e).slice(0, 150)));
    await p.setViewport({ width: 1280, height: 800 });
    await p.evaluateOnNewDocument(() => { localStorage.setItem('ewv-hint-troopctl', '1'); localStorage.setItem('ewv-music', '0'); localStorage.setItem('ewv-fx', 'high'); });
    await p.goto('http://localhost:3000/east-vs-west-game/?map=URBAN', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('DEPLOY FORCES')), { timeout: 60000 });

    await p.evaluate(() => { Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('DEPLOY FORCES')).click(); });
    await new Promise(r => setTimeout(r, 2500));
    await p.screenshot({ path: require('os').tmpdir() + '/ewv-urban-roads.png' });
    await p.close();
  }

  await b.close();
  console.log(JSON.stringify(results, null, 1));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  const ok = results.tooltip.statline && results.tooltip.hotkeyBadge && results.spawn.tank && results.spawn.heli && errors.length === 0;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('SMOKE12 FAILED:', e.message); process.exit(1); });
