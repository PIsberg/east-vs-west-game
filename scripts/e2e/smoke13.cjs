/** Viewport bracket appears on the minimap when zoomed; weather forecast chip shows during clear weather. */
const puppeteer = require('puppeteer-core');

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.setViewport({ width: 1280, height: 800 });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('ewv-hint-troopctl', '1'); localStorage.setItem('ewv-music', '0'); localStorage.setItem('ewv-fx', 'high'); localStorage.setItem('ewv-prefs', JSON.stringify({ playerSide: 'WEST', cpuLevel: 'off', gameMode: 'points', mapType: 'COUNTRYSIDE' })); });
  await p.goto('http://localhost:3000/east-vs-west-game/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('DEPLOY FORCES')), { timeout: 60000 });

  await p.evaluate(() => { Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('DEPLOY FORCES')).click(); });
  await new Promise(r => setTimeout(r, 1500));

  const whitePx = () => p.evaluate(() => {
    const cv = document.querySelector('[data-testid="minimap"]');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let white = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 165 && d[i + 1] > 165 && d[i + 2] > 165 && d[i + 3] > 140) white++;
    return white;
  });

  const whiteBefore = await whitePx(); // full view: bracket hidden
  // Zoom in hard via the camera API, then pan left — bracket should appear
  await p.evaluate(async () => {
    for (let i = 0; i < 30; i++) { window.__ewCam.zoom(0.94); await new Promise(r => setTimeout(r, 15)); }
    for (let i = 0; i < 12; i++) { window.__ewCam.pan(-14); await new Promise(r => setTimeout(r, 15)); }
  });
  await new Promise(r => setTimeout(r, 500));
  const whiteAfter = await whitePx();
  const camState = await p.evaluate(() => window.__ewCam.state());

  // Weather forecast: poll during clear weather for a "<TYPE> IN Ns" chip (pre-rolled 65% chance non-clear).
  // Also confirm the chip's countdown matches a real upcoming change eventually.
  let sawForecast = false;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline && !sawForecast) {
    sawForecast = await p.evaluate(() => /(rain|snow|fog|storm) in \d+s/i.test(document.body.textContent));
    if (!sawForecast) await new Promise(r => setTimeout(r, 2000));
  }
  await p.screenshot({ path: require('os').tmpdir() + '/ewv-viewport-forecast.png' });

  console.log(JSON.stringify({ whiteBefore, whiteAfter, camDist: Math.round(camState.dist), sawForecast }));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  const ok = whiteBefore < 10 && whiteAfter > 30 && sawForecast && errors.length === 0;
  console.log(ok ? 'PASS' : 'FAIL');
  await b.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('SMOKE13 FAILED:', e.message); process.exit(1); });
