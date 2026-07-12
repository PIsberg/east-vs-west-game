/** Minimap click pans the camera to the clicked world x; volume slider persists to localStorage. */
const puppeteer = require('puppeteer-core');

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.setViewport({ width: 1280, height: 800 });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('ewv-hint-troopctl', '1'); localStorage.setItem('ewv-music', '0'); localStorage.setItem('ewv-fx', 'high'); localStorage.setItem('ewv-prefs', JSON.stringify({ playerSide: 'WEST', cpuLevel: 'off', gameMode: 'points', mapType: 'COUNTRYSIDE' })); });
  await p.goto('http://localhost:3000/east-vs-west-game/', { waitUntil: 'networkidle2', timeout: 60000 });
  await p.evaluate(() => { Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('DEPLOY FORCES')).click(); });
  await new Promise(r => setTimeout(r, 1500));

  const txBefore = await p.evaluate(() => window.__ewCam.state().tx);
  // Click the left quarter of the minimap → camera should jump to ~world x 200
  const mm = await p.evaluate(() => { const r = document.querySelector('[data-testid="minimap"]').getBoundingClientRect(); return { x: r.left + r.width * 0.25, y: r.top + r.height / 2 }; });
  await p.mouse.click(mm.x, mm.y);
  await new Promise(r => setTimeout(r, 400));
  const txAfter = await p.evaluate(() => window.__ewCam.state().tx);

  // Volume slider: drag to a low value, confirm persistence + gain applied
  const vol = await p.evaluate(() => {
    const slider = document.querySelector('input[type="range"][title="Master volume"]');
    if (!slider) return { found: false };
    const setVal = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setVal.call(slider, '30');
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    return { found: true, stored: localStorage.getItem('ewv-volume') };
  });

  console.log(JSON.stringify({ txBefore: Math.round(txBefore), txAfter: Math.round(txAfter), vol }));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  const ok = Math.abs(txAfter - 200) < 30 && Math.abs(txBefore - 400) < 30 && vol.found && vol.stored === '0.3' && errors.length === 0;
  console.log(ok ? 'PASS' : 'FAIL');
  await b.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('SMOKE14 FAILED:', e.message); process.exit(1); });
