const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.setViewport({ width: 1280, height: 800 });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('ewv-music', '0'); localStorage.setItem('ewv-fx', 'high'); });
  await p.goto('http://localhost:3000/east-vs-west-game/?spectate&speed=8', { waitUntil: 'domcontentloaded', timeout: 90000 });
  // A natural CPU-vs-CPU finish takes 313-387s of wall time on a dev laptop
  // (measured 2026-10-04, seeded COUNTRYSIDE), so waiting for one against a
  // 240s deadline failed whenever the match ran long. The graph only needs a
  // played-out history, so the match is staged: 60s of real fighting (~12
  // samples at one per 5s), then any side still on 0 is lifted to 1 point,
  // because a line on the zero axis draws no pixels the check below can see
  // (a forced end with West on 0 measured blue 0, red 512) and CPU sides
  // often go 3+ minutes without scoring. 12s more lands two samples on the
  // new score, then the leader is handed the win via __ewDebug.winTeam,
  // which drives the real gameOver path. A natural finish still counts.
  const started = Date.now();
  const isOver = () => p.evaluate(() => document.body.textContent.includes('WINS') && document.body.textContent.includes('Duration')).catch(() => false);
  const playFor = async ms => { const until = Date.now() + ms; while (Date.now() < until) { if (await isOver()) return true; await new Promise(r => setTimeout(r, 3000)); } return false; };
  let over = await playFor(60000);
  if (!over) {
    await p.evaluate(() => { const s = __ewDebug.score; for (const t of ['WEST', 'EAST']) if (s[t] < 1) __ewDebug.setScore(t, 1); });
    over = await playFor(12000);
  }
  if (!over) {
    await p.evaluate(() => { const s = __ewDebug.score; __ewDebug.winTeam(s.WEST >= s.EAST ? 'WEST' : 'EAST'); });
    const until = Date.now() + 30000;
    while (!over && Date.now() < until) { over = await isOver(); if (!over) await new Promise(r => setTimeout(r, 1000)); }
  }
  console.log(`ended at ${Math.round((Date.now() - started) / 1000)}s`);
  const m = await p.evaluate(() => {
    const cv = document.querySelector('[data-testid="timeline"]');
    if (!cv) return { found: false };
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let blue = 0, red = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 100) continue;
      if (d[i + 2] > 180 && d[i] < 160) blue++;
      else if (d[i] > 180 && d[i + 2] < 160) red++;
    }
    return { found: true, blue, red, caption: document.body.textContent.includes('over time') };
  });
  await p.screenshot({ path: require('os').tmpdir() + '/ewv-timeline.png' });
  console.log(JSON.stringify(m));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  const ok = m.found && m.blue > 40 && m.red > 40 && m.caption && errors.length === 0;
  console.log(ok ? 'PASS' : 'FAIL');
  await b.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
