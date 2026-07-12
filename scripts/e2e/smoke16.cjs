/** Challenges: panel renders, Underdog applies half-money handicap + settings,
 *  winning First Blood vs easy CPU records completion + shows the badge. */
const puppeteer = require('puppeteer-core');

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const results = {};

  // 1. Underdog: handicap + settings applied
  {
    const p = await b.newPage();
    p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    await p.setViewport({ width: 1280, height: 800 });
    await p.evaluateOnNewDocument(() => { localStorage.setItem('ewv-hint-troopctl', '1'); localStorage.setItem('ewv-music', '0'); localStorage.setItem('ewv-fx', 'high'); });
    await p.goto('http://localhost:3000/east-vs-west-game/', { waitUntil: 'networkidle2', timeout: 90000 });
    results.panel = await p.evaluate(() => !!document.querySelector('[data-testid="challenges"]'));
    await p.evaluate(() => { Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Underdog')).click(); });
    await new Promise(r => setTimeout(r, 2000));
    results.underdog = await p.evaluate(() => ({
      money: window.__ewDebug.money,
      cpuChip: !!Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('CPU NORMAL')),
    }));
    await p.close();
  }

  // 2. First Blood: spam-spawn vs easy at speed 8 until victory, check completion
  {
    const p = await b.newPage();
    p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    await p.setViewport({ width: 1280, height: 800 });
    await p.evaluateOnNewDocument(() => { localStorage.setItem('ewv-hint-troopctl', '1'); localStorage.setItem('ewv-music', '0'); localStorage.setItem('ewv-fx', 'high'); });
    await p.goto('http://localhost:3000/east-vs-west-game/?speed=8', { waitUntil: 'networkidle2', timeout: 90000 });
    await p.evaluate(() => { Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('First Blood')).click(); });
    await new Promise(r => setTimeout(r, 1500));
    // Fight briefly, then end the match through the real gameOver path
    // (frame-locked headless play is ~1x speed — a legit win takes 30+ min)
    await p.evaluate(() => { const b2 = Array.from(document.querySelectorAll('button')).filter(x => x.getAttribute('title') === 'TANK')[0]; if (b2) b2.click(); });
    await new Promise(r => setTimeout(r, 4000));
    await p.evaluate(() => window.__ewDebug.winTeam('WEST'));
    await new Promise(r => setTimeout(r, 1500));
    const outcome = await p.evaluate(() => document.body.textContent.includes('VICTORY') ? 'win' : document.body.textContent.includes('DEFEAT') ? 'loss' : null);
    results.firstBlood = {
      outcome,
      completed: await p.evaluate(() => JSON.parse(localStorage.getItem('ewv-challenges') || '[]')),
    };
    // Reload → splash should show the ✓ badge
    if (outcome === 'win') {
      await p.goto('http://localhost:3000/east-vs-west-game/', { waitUntil: 'networkidle2', timeout: 90000 });
      results.badge = await p.evaluate(() => document.querySelector('[data-testid="challenges"]').textContent.includes('✓ First Blood'));
      await p.screenshot({ path: require('os').tmpdir() + '/ewv-challenges.png' });
    }
    await p.close();
  }

  await b.close();
  console.log(JSON.stringify(results, null, 1));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  const ok = results.panel && results.underdog.money.WEST <= 700 && results.underdog.money.EAST >= 1000 && results.underdog.cpuChip &&
    results.firstBlood.outcome === 'win' && results.firstBlood.completed.includes('first-blood') && results.badge === true && errors.length === 0;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('SMOKE16 FAILED:', e.message); process.exit(1); });
