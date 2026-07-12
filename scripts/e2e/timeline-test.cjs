const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.setViewport({ width: 1280, height: 800 });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('ewv-music', '0'); localStorage.setItem('ewv-fx', 'high'); });
  await p.goto('http://localhost:3000/east-vs-west-game/?spectate&speed=8', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const deadline = Date.now() + 240000;
  let over = false;
  while (Date.now() < deadline && !over) {
    over = await p.evaluate(() => document.body.textContent.includes('WINS') && document.body.textContent.includes('Duration')).catch(() => false);
    if (!over) await new Promise(r => setTimeout(r, 3000));
  }
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
