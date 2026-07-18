/** Minimap: exists, shows river+bridges, and tracks units of both teams (pixel probe). */
const puppeteer = require('puppeteer-core');

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push('C: ' + m.text().slice(0, 150)); });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('ewv-hint-troopctl', '1'); localStorage.setItem('ewv-music', '0'); localStorage.setItem('ewv-fx', 'high'); localStorage.setItem('ewv-prefs', JSON.stringify({ playerSide: 'WEST', cpuLevel: 'normal', gameMode: 'points', mapType: 'COUNTRYSIDE' })); });
  // Pinned seed: COUNTRYSIDE only rolls a river 55% of the time, and the
  // water/wood assertions need one. Seed 101 is a verified river layout.
  await p.goto('http://localhost:3000/east-vs-west-game/?seed=101', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('DEPLOY FORCES')), { timeout: 60000 });

  await p.evaluate(() => { Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('DEPLOY FORCES')).click(); });
  await new Promise(r => setTimeout(r, 1000));
  // Spawn a couple of West units incl. a heli (air-cross rendering)
  for (const t of ['SQUAD', 'TANK', 'HELI']) {
    await p.evaluate(x => { const btn = Array.from(document.querySelectorAll('button')).filter(b2 => b2.getAttribute('title') === x)[0]; if (btn) btn.click(); }, t);
    await new Promise(r => setTimeout(r, 150));
  }
  // East dots via the debug spawn hook: this test probes MINIMAP RENDERING,
  // and at headless tick rates (~10/s) the CPU fits only 1-2 buys into the
  // sample window — whether they read as >3 red pixels was pure shopping luck
  // (a 3-man squad passed, a lone artillery piece failed).
  await p.waitForFunction('!!window.__ewDebug', { timeout: 30000 });
  await p.evaluate(() => { for (let i = 0; i < 3; i++) window.__ewDebug.spawn('EAST', 'SOLDIER'); });
  // Sample repeatedly — East units come and go as the battle swings
  let m = null;
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const s2 = await p.evaluate(() => {
    const cv = document.querySelector('[data-testid="minimap"]');
    if (!cv) return { found: false };
    const r = cv.getBoundingClientRect();
    const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let blue = 0, red = 0, water = 0, wood = 0, amber = 0;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2];
      if (B > 180 && R < 140 && G > 120) blue++;              // #60a5fa units
      else if (R > 200 && G < 140 && B < 140) red++;          // #f87171 units
      else if (B > 80 && B < 140 && R < 60 && G > 60) water++; // #27546b river
      else if (R > 140 && G > 100 && B < 120 && G < R) wood++; // #a8825f bridge / #fbbf24 ring
      if (R > 220 && G > 160 && B < 80) amber++;               // capture ring
    }
    return { found: true, w: cv.width, h: cv.height, rect: { top: Math.round(r.top), right: Math.round(innerWidth - r.right) }, blue, red, water, wood, amber };
    });
    if (!m) m = s2;
    else for (const k of ['blue', 'red', 'water', 'wood', 'amber']) m[k] = Math.max(m[k], s2[k]);
    if (m.blue > 3 && m.red > 3) break;
  }
  console.log(JSON.stringify(m));
  await p.screenshot({ path: require('os').tmpdir() + '/ewv-minimap-full.png' });
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  const ok = m.found && m.blue > 3 && m.red > 3 && m.water > 8 && m.wood > 5 && m.amber > 3 && errors.length === 0;
  console.log(ok ? 'PASS' : 'FAIL');
  await b.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('SMOKE10 FAILED:', e.message); process.exit(1); });
