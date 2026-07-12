/** Canvas-fit precision: at multiple viewports, the battlefield should fill the space
 *  between header and command bar with only a few px of slack, and never overflow. */
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'new',
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const sizes = [
    { w: 844, h: 390, mobile: true, name: 'iPhone-landscape' },
    { w: 915, h: 412, mobile: true, name: 'Android-landscape' },
    { w: 1280, h: 800, mobile: false, name: 'desktop' },
    { w: 1000, h: 620, mobile: false, name: 'small-window' },
    { w: 1920, h: 1080, mobile: false, name: 'full-hd' },
  ];

  let pass = true;
  for (const s of sizes) {
    const p = await browser.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(String(e).slice(0, 150)));
    await p.setViewport({ width: s.w, height: s.h, isMobile: s.mobile, hasTouch: s.mobile });
    await p.evaluateOnNewDocument(() => { localStorage.setItem('ewv-hint-troopctl', '1'); localStorage.setItem('ewv-music', '0'); });
    await p.goto('http://localhost:3000/east-vs-west-game/', { waitUntil: 'networkidle2', timeout: 90000 });
    await p.evaluate(() => { Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('DEPLOY FORCES')).click(); });
    await new Promise(r => setTimeout(r, 2500));
    const m = await p.evaluate(() => {
      const header = document.querySelector('.max-w-4xl');
      const canvas = document.querySelector('canvas');
      const cmdBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.toUpperCase().includes('ECONOMY'));
      const cmdBar = cmdBtn ? cmdBtn.closest('.justify-center') : null;
      const panels = document.querySelectorAll('.overscroll-contain');
      const west = panels[0].getBoundingClientRect(), east = panels[panels.length - 1].getBoundingClientRect();
      const hr = header.getBoundingClientRect();
      const cr = canvas.getBoundingClientRect();
      const br = cmdBar ? cmdBar.getBoundingClientRect() : null;
      return {
        gapTop: Math.round(cr.top - hr.bottom),
        gapBottom: br ? Math.round(br.top - cr.bottom) : null,
        cmdBottomToViewport: br ? Math.round(window.innerHeight - br.bottom) : null,
        hSlack: Math.round((cr.left - west.right) + (east.left - cr.right)),
        canvas: { w: Math.round(cr.width), h: Math.round(cr.height) },
        hOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    // A fixed 16:9 canvas can only fill one axis: pass when nothing overflows and
    // the binding axis is tight (vertical slack small OR horizontal slack small).
    const vSlack = m.gapTop + (m.gapBottom ?? 0);
    const tight = vSlack <= 40 || m.hSlack <= 32;
    const ok = m.hOverflow <= 0 && m.gapTop >= 0 && (m.gapBottom === null || m.gapBottom >= 0) && tight && errors.length === 0;
    pass = pass && ok;
    console.log(`${s.name.padEnd(18)} canvas ${String(m.canvas.w).padStart(4)}x${String(m.canvas.h).padStart(3)} | gapTop ${m.gapTop} | gapBottom ${m.gapBottom} | hSlack ${m.hSlack} | belowCmd ${m.cmdBottomToViewport} | hOverflow ${m.hOverflow} ${ok ? 'OK' : '<<FAIL'}`);
    if (s.name === 'iPhone-landscape' || s.name === 'desktop') await p.screenshot({ path: require('os').tmpdir() + '/ewv-fit-' + s.name + '.png' });
    await p.close();
  }
  await browser.close();
  console.log(pass ? 'PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('SMOKE9 FAILED:', e.message); process.exit(1); });
