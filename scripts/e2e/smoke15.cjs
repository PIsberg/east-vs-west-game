/** FX auto-detect: on a slow renderer the game drops itself to FX LOW, persists it,
 *  the canvas survives the remount (camera API re-registers), and fps improves. */
const puppeteer = require('puppeteer-core');

const measureFps = () => new Promise(res => {
  let frames = 0;
  const start = performance.now();
  const loop = () => { frames++; if (performance.now() - start < 4000) requestAnimationFrame(loop); else res(frames / 4); };
  requestAnimationFrame(loop);
});

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.setViewport({ width: 1280, height: 800 });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('ewv-hint-troopctl', '1'); localStorage.setItem('ewv-music', '0'); localStorage.setItem('ewv-prefs', JSON.stringify({ playerSide: 'WEST', cpuLevel: 'off', gameMode: 'points', mapType: 'COUNTRYSIDE' })); });
  await p.goto('http://localhost:3000/east-vs-west-game/', { waitUntil: 'networkidle2', timeout: 60000 });
  await p.evaluate(() => { Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('DEPLOY FORCES')).click(); });
  await new Promise(r => setTimeout(r, 2500));

  const fpsHigh = await p.evaluate(measureFps); // overlaps the detector's own window — fine
  await new Promise(r => setTimeout(r, 5000));  // detector: 3s delay + 4s measure

  const state = await p.evaluate(() => ({
    stored: localStorage.getItem('ewv-fx'),
    button: Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('FX '))?.textContent.trim(),
    canvasUp: !!document.querySelector('canvas'),
  }));
  await new Promise(r => setTimeout(r, 1500)); // let the remounted canvas settle
  const fpsLow = await p.evaluate(measureFps);
  const camOk = await p.evaluate(() => { const s = window.__ewCam?.state(); return !!s && s.tx === 400; });

  console.log(JSON.stringify({ fpsHigh: +fpsHigh.toFixed(1), fpsLow: +fpsLow.toFixed(1), ...state, camOk }));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  const ok = state.stored === 'low' && /FX LOW/i.test(state.button || '') && state.canvasUp && camOk && fpsLow > fpsHigh && errors.length === 0;
  console.log(ok ? 'PASS' : 'FAIL');
  await b.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('SMOKE15 FAILED:', e.message); process.exit(1); });
