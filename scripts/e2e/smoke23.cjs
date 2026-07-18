/**
 * Online 1v1, end to end over the loopback transport: two tabs host/join a
 * room, auto-ready, and play a real lockstep match.
 *
 * What this proves that smoke22 (two independent sims, same seed) cannot:
 *   1. The lobby handshake works (hello/welcome/lobby/ready/start) and both
 *      tabs boot engines from the SAME host-generated config+seed.
 *   2. Commands actually cross the wire: each side spawns through the real
 *      input route (__ewDebug.spawnNet), and the unit must appear in the
 *      OTHER tab's sim.
 *   3. The lockstep gate paces both sims together and the checksum exchange
 *      stays clean (no desync overlay, matching checkpoint hashes).
 *   4. A backgrounded tab keeps simulating via the hidden-tab driver — in a
 *      single browser only one page is foreground, so the whole test would
 *      deadlock if that driver broke.
 *
 * Loopback = BroadcastChannel, so both pages MUST share one browser process;
 * the throttling-disable flags keep the background page's timers honest.
 */
const puppeteer = require('puppeteer-core');

const CODE = 'EW-TEST';
const BASE = `http://localhost:3000/east-vs-west-game/?loop&netcode=${CODE}&netauto`;

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: 'new', args: [
      '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });

  const errors = [];
  const mkPage = async (role) => {
    const p = await b.newPage();
    p.on('pageerror', e => errors.push(`${role}: ${String(e).slice(0, 200)}`));
    await p.evaluateOnNewDocument(() => {
      localStorage.setItem('ewv-fx', 'high');
      localStorage.setItem('ewv-music', '0');
      localStorage.setItem('ewv-hint-troopctl', '1');
      localStorage.setItem('ewv-prefs', JSON.stringify({ playerSide: 'WEST', cpuLevel: 'off', gameMode: 'points', mapType: 'COUNTRYSIDE' }));
    });
    await p.goto(`${BASE}&netrole=${role}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    return p;
  };

  // Host first (it must be listening before the guest knocks)
  const host = await mkPage('host');
  await new Promise(r => setTimeout(r, 800));
  const guest = await mkPage('join');

  // Handshake -> auto-ready -> match boot on both pages
  const t0 = Date.now();
  for (const [name, p] of [['host', host], ['guest', guest]]) {
    await p.waitForFunction('!!window.__ewDebug', { timeout: 60000 })
      .catch(() => { throw new Error(`${name} never reached the battle (lobby handshake failed)`); });
  }
  console.log(`match booted on both tabs in ${Date.now() - t0}ms`);

  // Headless lockstep rates swing wildly with machine load (2-40 ticks/s),
  // so poll for tick milestones instead of sleeping fixed amounts. Both tabs
  // advancing past a milestone also proves the timer-backstop driver — only
  // one tab is foreground.
  const tickOf = (p) => p.evaluate(() => window.__ewDebug.tickCount);
  const bothPast = async (target, deadlineMs) => {
    const end = Date.now() + deadlineMs;
    while (Date.now() < end) {
      const [a, b2] = [await tickOf(host), await tickOf(guest)];
      if (a >= target && b2 >= target) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  };
  const advanced = await bothPast(60, 60000);
  const ticksA1 = await tickOf(host), ticksB1 = await tickOf(guest);
  console.log(`ticks after warmup: host ${ticksA1} guest ${ticksB1}`);

  // Cross-spawn through the real net input route (host=WEST, guest=EAST)
  const hostSpawn = await host.evaluate(() => window.__ewDebug.spawnNet('TANK'));
  const guestSpawn = await guest.evaluate(() => window.__ewDebug.spawnNet('SOLDIER'));
  // Run until both sims cross at least two 150-tick checksum checkpoints
  const deepEnough = await bothPast(320, 120000);
  const ticksA2 = await tickOf(host), ticksB2 = await tickOf(guest);
  console.log(`ticks at collection: host ${ticksA2} guest ${ticksB2}`);

  const armies = async (p) => p.evaluate(() => ({
    west: (window.__ewDebug.unitList ?? []).filter(u => u.team === 'WEST').map(u => u.type),
    east: (window.__ewDebug.unitList ?? []).filter(u => u.team === 'EAST').map(u => u.type),
    seed: window.__ewDebug.simSeed,
    checksums: window.__ewDebug.checksums,
    desync: !!document.querySelector('[data-testid="desync-overlay"]'),
  }));
  const A = await armies(host);
  const B = await armies(guest);
  await b.close();

  const common = Object.keys(A.checksums).filter(t => t in B.checksums).map(Number).sort((x, y) => x - y);
  const mismatched = common.filter(t => A.checksums[t] !== B.checksums[t]);

  console.log(`seeds            : ${A.seed} / ${B.seed}`);
  console.log(`host sees        : W[${A.west.join(',')}] E[${A.east.join(',')}]`);
  console.log(`guest sees       : W[${B.west.join(',')}] E[${B.east.join(',')}]`);
  console.log(`checkpoints      : ${common.length} common, ${mismatched.length} mismatched`);

  const fail = [];
  if (!advanced) fail.push(`sims never both reached tick 60 (host ${ticksA1}, guest ${ticksB1}) — lockstep gate stuck or a tab is not ticking`);
  if (!deepEnough) fail.push(`sims never both reached tick 320 (host ${ticksA2}, guest ${ticksB2})`);
  if (A.seed !== B.seed) fail.push(`seeds differ (${A.seed} vs ${B.seed}) — start config did not carry the host seed`);
  if (!hostSpawn || !guestSpawn) fail.push('spawnNet hook refused a spawn');
  if (!A.east.includes('SOLDIER')) fail.push("guest's SOLDIER never appeared in the HOST sim — guest->host commands not crossing");
  if (!B.west.includes('TANK')) fail.push("host's TANK never appeared in the GUEST sim — host->guest commands not crossing");
  if (common.length < 2) fail.push(`only ${common.length} common checkpoints — sims barely ran`);
  if (mismatched.length) fail.push(`DESYNC: checkpoint hashes differ at tick ${mismatched[0]}`);
  if (A.desync || B.desync) fail.push('desync overlay is showing');
  if (errors.length) fail.push(`page errors: ${errors.slice(0, 3).join(' | ')}`);

  if (fail.length) { console.error('FAIL\n - ' + fail.join('\n - ')); process.exit(1); }
  console.log('PASS');
})();
