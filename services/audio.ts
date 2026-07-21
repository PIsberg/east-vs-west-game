const BAR_LEN = 2.5; // seconds per music bar (4/4 at 96 BPM)
const INTENSITY_DOWNSHIFT_MS = 3000; // computed level must hold this long before the march calms

export type MusicIntensity = 0 | 1 | 2;

class SoundService {
  private ctx: AudioContext | null = null;
  private dest: AudioNode | null = null;
  private master: GainNode | null = null;
  private musicDest: GainNode | null = null;
  // Spatial buses: cracks/clicks/barks vs engines/blasts. Zoom shapes them
  // oppositely — zoomed out you hear the war's rumble, zoomed in the rifle bolts.
  private busHighIn: AudioNode | null = null; // entry (lowpass) for high-freq SFX
  private busHighGain: GainNode | null = null;
  private busHighFilter: BiquadFilterNode | null = null;
  private busLowIn: GainNode | null = null;
  private panHigh: StereoPannerNode[] = [];
  private panLow: StereoPannerNode[] = [];
  private panIdx = 0;
  private camFocusX = 400;
  private duckNode: GainNode | null = null;
  private lastPlayed: Map<string, number> = new Map();
  private muted = false;
  private musicOn = true;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicBar = 0;
  private nextBarTime = 0;
  private musicLevel: MusicIntensity = 0;
  private musicTension = false;
  private levelHeldSince = 0;

  private volume = 0.85;

  constructor() {
    try {
      this.muted = localStorage.getItem('ewv-muted') === '1';
      this.musicOn = localStorage.getItem('ewv-music') !== '0';
      const v = parseFloat(localStorage.getItem('ewv-volume') ?? '');
      if (!Number.isNaN(v)) this.volume = Math.max(0, Math.min(1, v));
    } catch { /* private browsing — keep defaults */ }
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 10;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.12;
      const master = this.ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      // Shell-shock duck sits between the master and the compressor: nothing
      // else ever touches it, so it can't fight the zoom listener's bus gains
      const duck = this.ctx.createGain();
      master.connect(duck);
      duck.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.dest = master;
      this.master = master;
      this.duckNode = duck;
      // Music runs through its own bus so it stays quiet under the SFX
      const musicBus = this.ctx.createGain();
      musicBus.gain.value = 0.55;
      musicBus.connect(master);
      this.musicDest = musicBus;
      // SFX buses. High: panners → shared lowpass → gain → master (the lowpass
      // is the zoom "distance" filter). Low: panners → gain → master, unfiltered.
      const highFilter = this.ctx.createBiquadFilter();
      highFilter.type = 'lowpass';
      highFilter.frequency.value = 18000;
      const highGain = this.ctx.createGain();
      highFilter.connect(highGain); highGain.connect(master);
      this.busHighIn = highFilter;
      this.busHighGain = highGain;
      this.busHighFilter = highFilter;
      const lowGain = this.ctx.createGain();
      lowGain.connect(master);
      this.busLowIn = lowGain;
      if (typeof this.ctx.createStereoPanner === 'function') {
        for (let i = 0; i < 8; i++) {
          const ph = this.ctx.createStereoPanner(); ph.connect(highFilter); this.panHigh.push(ph);
          const pl = this.ctx.createStereoPanner(); pl.connect(lowGain); this.panLow.push(pl);
        }
      }
    } catch (e) {
      console.warn("Web Audio API not supported");
    }
  }

  // ── Mute / music toggles (persisted) ─────────────────────────────────────
  public isMuted() { return this.muted; }
  public setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.02);
    try { localStorage.setItem('ewv-muted', m ? '1' : '0'); } catch { /* ignore */ }
  }
  // Silence everything for the duration of a video ad WITHOUT touching the saved
  // mute preference (setMuted persists to localStorage). Restores to the user's
  // real level when the ad ends. Used by the CrazyGames ad integration.
  public duckForAd(on: boolean) {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0 : (this.muted ? 0 : this.volume), this.ctx.currentTime, 0.05);
  }
  public getVolume() { return this.volume; }
  public setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (!this.muted && this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    try { localStorage.setItem('ewv-volume', String(this.volume)); } catch { /* ignore */ }
  }
  // ── Adaptive march ────────────────────────────────────────────────────────
  // Level 0: quiet skirmish march. 1: snare+bass firefight. 2: brass/overdrive assault.
  // Tension swaps the harmony to a desperate minor pulse (base nearly dead / match point).
  // Escalation is instant; de-escalation waits INTENSITY_DOWNSHIFT_MS so the music
  // doesn't flap on every lull. Layer changes land at bar boundaries automatically —
  // the scheduler only keeps ~1 bar queued.
  public setMusicIntensity(level: MusicIntensity, tension = false) {
    this.musicTension = tension;
    const now = Date.now();
    if (level >= this.musicLevel) {
      this.musicLevel = level;
      this.levelHeldSince = now;
    } else if (now - this.levelHeldSince > INTENSITY_DOWNSHIFT_MS) {
      this.musicLevel = level;
      this.levelHeldSince = now;
    }
  }
  public getMusicIntensity(): MusicIntensity { return this.musicLevel; }

  public isMusicOn() { return this.musicOn; }
  public setMusicOn(on: boolean) {
    this.musicOn = on;
    if (on) this.startMusic(); else this.stopMusic();
    try { localStorage.setItem('ewv-music', on ? '1' : '0'); } catch { /* ignore */ }
  }

  private ensureContext() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ── Spatial listener ──────────────────────────────────────────────────────
  // focusX: camera target in sim coordinates (0–800). dist01: 0 = fully zoomed
  // in, 1 = whole-field framing. Called from the engine's throttled UI tick.
  public setListener(focusX: number, dist01: number) {
    this.camFocusX = focusX;
    if (!this.ctx || !this.busHighFilter || !this.busHighGain || !this.busLowIn) return;
    const d = Math.max(0, Math.min(1, dist01));
    const t = this.ctx.currentTime;
    // 18 kHz close → ~2.5 kHz at full zoom-out; gains trade the buses against
    // each other so total loudness stays roughly level.
    this.busHighFilter.frequency.setTargetAtTime(18000 * Math.pow(2500 / 18000, d), t, 0.1);
    this.busHighGain.gain.setTargetAtTime(1 - 0.35 * d, t, 0.1);
    this.busLowIn.gain.setTargetAtTime(0.9 + 0.15 * d, t, 0.1);
  }

  // Route a sound: pick the bus, and when a world x is given, a pooled panner
  // plus a distance attenuation for how far the event is from the camera focus.
  private spatial(bus: 'high' | 'low', x?: number): { o: AudioNode; a: number } {
    const b = bus === 'high' ? this.busHighIn : this.busLowIn;
    if (!b) return { o: this.dest as AudioNode, a: 1 };
    if (x === undefined || !this.ctx) return { o: b, a: 1 };
    const pool = bus === 'high' ? this.panHigh : this.panLow;
    if (!pool.length) return { o: b, a: 1 };
    const rel = (x - this.camFocusX) / 400; // ±1 ≈ one half-field away
    const p = pool[this.panIdx++ % pool.length];
    p.pan.setValueAtTime(Math.max(-0.8, Math.min(0.8, rel)), this.ctx.currentTime);
    const r = Math.min(1.5, Math.abs(rel));
    return { o: p, a: 1 / (1 + 0.9 * r * r) };
  }

  private canPlay(key: string, minMs: number): boolean {
    const now = Date.now();
    if ((now - (this.lastPlayed.get(key) || 0)) < minMs) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private noise(duration: number, envelope: (i: number, n: number) => number): AudioBuffer | null {
    if (!this.ctx) return null;
    const n = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * envelope(i, n);
    return buf;
  }

  private playNoise(buf: AudioBuffer, filterType: BiquadFilterType, fStart: number, fEnd: number, gStart: number, duration: number, out?: AudioNode) {
    if (!this.ctx || !this.dest) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(fStart, t);
    if (fEnd !== fStart) f.frequency.exponentialRampToValueAtTime(Math.max(fEnd, 10), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gStart, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f); f.connect(g); g.connect(out ?? this.dest);
    src.start(t); src.stop(t + duration);
  }

  private playOsc(type: OscillatorType, fStart: number, fEnd: number, gStart: number, duration: number, delay = 0, out?: AudioNode) {
    if (!this.ctx || !this.dest) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.connect(g); g.connect(out ?? this.dest);
    osc.type = type;
    osc.frequency.setValueAtTime(fStart, t);
    if (fEnd !== fStart) osc.frequency.exponentialRampToValueAtTime(Math.max(fEnd, 8), t + duration);
    g.gain.setValueAtTime(gStart, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.start(t); osc.stop(t + duration);
  }

  // ── Spawn ────────────────────────────────────────────────────────────────
  public playSpawnSound(isEast: boolean, x?: number) {
    if (!this.ctx || !this.canPlay('spawn', 80)) return;
    this.ensureContext();
    const { o, a } = this.spatial('high', x);
    this.playOsc('square', isEast ? 440 : 523.25, isEast ? 880 : 1046.5, 0.07 * a, 0.22, 0, o);
  }

  // ── Infantry Rifle ───────────────────────────────────────────────────────
  public playRifleShot(x?: number) {
    if (!this.ctx || !this.canPlay('rifle', 45)) return;
    this.ensureContext();
    const { o, a } = this.spatial('high', x);
    const buf = this.noise(0.09, (i, n) => Math.pow(1 - i / n, 3));
    if (buf) this.playNoise(buf, 'highpass', 2800, 700, 0.22 * a, 0.09, o);
    this.playOsc('sine', 150, 35, 0.14 * a, 0.07, 0, o);
  }

  // ── Sniper ───────────────────────────────────────────────────────────────
  public playSniperShot(x?: number) {
    if (!this.ctx || !this.canPlay('sniper', 150)) return;
    this.ensureContext();
    const { o, a } = this.spatial('high', x);
    const buf = this.noise(0.06, (i, n) => Math.pow(1 - i / n, 4));
    if (buf) this.playNoise(buf, 'highpass', 4000, 1200, 0.35 * a, 0.06, o);
    this.playOsc('sine', 200, 30, 0.18 * a, 0.08, 0, o);
  }

  // ── Tank / Heavy ─────────────────────────────────────────────────────────
  public playHeavyShot(x?: number) {
    if (!this.ctx || !this.canPlay('heavy', 130)) return;
    this.ensureContext();
    const { o, a } = this.spatial('low', x);
    const buf = this.noise(0.4, (i, n) => Math.pow(1 - i / n, 1.8));
    if (buf) this.playNoise(buf, 'lowpass', 700, 80, 0.6 * a, 0.4, o);
    this.playOsc('sine', 90, 18, 0.55 * a, 0.28, 0, o);
  }

  // ── Artillery ────────────────────────────────────────────────────────────
  public playArtilleryFire(x?: number) {
    if (!this.ctx || !this.canPlay('artillery', 420)) return;
    this.ensureContext();
    const { o, a } = this.spatial('low', x);
    const buf = this.noise(0.8, (i, n) => Math.pow(1 - i / n, 2));
    if (buf) this.playNoise(buf, 'lowpass', 350, 40, 0.9 * a, 0.75, o);
    this.playOsc('sine', 65, 14, 0.65 * a, 0.65, 0, o);
  }

  // ── Rocket / AA missile ──────────────────────────────────────────────────
  // ── Helicopter rotor ambience — one shared loop while any heli is fielded ─
  private rotorSrc: AudioBufferSourceNode | null = null;
  private rotorGain: GainNode | null = null;

  public setRotorLoop(on: boolean) {
    if (!this.ctx || !this.dest) return;
    if (on && !this.rotorSrc) {
      this.ensureContext();
      // Looped noise pulsed at ~13Hz through a lowpass reads as distant rotor chop
      const dur = 2;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        const t = i / this.ctx.sampleRate;
        const chop = 0.55 + 0.45 * Math.sin(2 * Math.PI * 13 * t);
        d[i] = (Math.random() * 2 - 1) * chop;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 320;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.045, this.ctx.currentTime + 0.8);
      src.connect(f); f.connect(g); g.connect(this.busLowIn ?? this.dest);
      src.start();
      this.rotorSrc = src;
      this.rotorGain = g;
    } else if (!on && this.rotorSrc) {
      const src = this.rotorSrc, g = this.rotorGain!;
      this.rotorSrc = null;
      this.rotorGain = null;
      g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
      setTimeout(() => { try { src.stop(); } catch { /* already stopped */ } }, 600);
    }
  }

  // Mortar launch — hollow tube "thoonk", much lighter than the artillery boom
  public playMortarThunk(x?: number) {
    if (!this.ctx || !this.canPlay('mortar', 200)) return;
    this.ensureContext();
    const { o, a } = this.spatial('low', x);
    const buf = this.noise(0.12, (i, n) => Math.pow(1 - i / n, 2.2));
    if (buf) this.playNoise(buf, 'bandpass', 420, 150, 0.3 * a, 0.12, o);
    this.playOsc('sine', 180, 55, 0.3 * a, 0.16, 0, o);
  }

  // Drone burst — light high-pitched energy zip
  public playDroneZip(x?: number) {
    if (!this.ctx || !this.canPlay('drone', 90)) return;
    this.ensureContext();
    const { o, a } = this.spatial('high', x);
    this.playOsc('square', 1900, 700, 0.05 * a, 0.08, 0, o);
    this.playOsc('sine', 2400, 1100, 0.04 * a, 0.06, 0, o);
  }

  public playRocketSound(x?: number) {
    if (!this.ctx || !this.canPlay('rocket', 130)) return;
    this.ensureContext();
    const { o, a } = this.spatial('low', x);
    const buf = this.noise(0.22, (i, n) => 0.4 + 0.6 * Math.pow(1 - i / n, 2));
    if (buf) this.playNoise(buf, 'bandpass', 900, 180, 0.28 * a, 0.22, o);
    this.playOsc('sawtooth', 950, 260, 0.06 * a, 0.2, 0, o);
  }

  // ── Tesla Zap ────────────────────────────────────────────────────────────
  public playZapSound(x?: number) {
    if (!this.ctx || !this.canPlay('zap', 55)) return;
    this.ensureContext();
    const { o, a } = this.spatial('high', x);
    const buf = this.noise(0.13, (i, n) => Math.floor(Math.random() * 2)); // crackle
    if (buf) this.playNoise(buf, 'bandpass', 3200, 900, 0.25 * a, 0.13, o);
    this.playOsc('sine', 1400, 180, 0.15 * a, 0.1, 0, o);
  }

  // ── Flamethrower ─────────────────────────────────────────────────────────
  public playFlameSound(x?: number) {
    if (!this.ctx || !this.canPlay('flame', 75)) return;
    this.ensureContext();
    const { o, a } = this.spatial('high', x);
    const buf = this.noise(0.28, (i, n) => 0.5 + 0.5 * (1 - i / n));
    if (buf) this.playNoise(buf, 'bandpass', 650, 280, 0.35 * a, 0.28, o);
  }

  // ── Medic Heal ───────────────────────────────────────────────────────────
  public playHealSound(x?: number) {
    if (!this.ctx || !this.canPlay('heal', 280)) return;
    this.ensureContext();
    const { o, a } = this.spatial('high', x);
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      this.playOsc('sine', freq, freq * 1.02, 0.07 * a, 0.22, i * 0.065, o);
    });
  }

  // ── Victory fanfare — triumphant ascending bugle resolution ──────────────
  public playVictorySound() {
    if (!this.ctx || !this.canPlay('victory', 5000)) return;
    this.ensureContext();
    this.stopMusic();
    const t = this.ctx.currentTime + 0.05;
    const C5 = 523.25, E5 = 659.25, G5 = 784, C6 = 1046.5;
    this.snare(t, 0.2); this.snare(t + 0.12, 0.22); this.kick(t + 0.24);
    this.trumpet(C5, t + 0.26, 0.16, 0.36);
    this.trumpet(E5, t + 0.44, 0.16, 0.36);
    this.trumpet(G5, t + 0.62, 0.2, 0.4);
    this.kick(t + 0.9); this.snare(t + 0.9, 0.3);
    this.trumpet(C6, t + 0.92, 0.9, 0.46);
    this.trumpet(G5, t + 0.92, 0.9, 0.3);
    this.snare(t + 1.8, 0.22); this.kick(t + 1.9, 0.7);
  }

  // ── Defeat sting — slow descending minor lament ──────────────────────────
  public playDefeatSound() {
    if (!this.ctx || !this.canPlay('defeat', 5000)) return;
    this.ensureContext();
    this.stopMusic();
    const t = this.ctx.currentTime + 0.05;
    const C5 = 523.25, Ab4 = 415.3, F4 = 349.23, C4 = 261.63;
    this.kick(t, 0.6);
    this.trumpet(C5, t + 0.1, 0.5, 0.3);
    this.trumpet(Ab4, t + 0.65, 0.5, 0.3);
    this.trumpet(F4, t + 1.2, 0.55, 0.3);
    this.kick(t + 1.85, 0.7);
    this.trumpet(C4, t + 1.9, 1.4, 0.34);
  }

  // ── Rally Horn — quick ascending bugle call ──────────────────────────────
  public playRallySound() {
    if (!this.ctx || !this.canPlay('rally', 2000)) return;
    this.ensureContext();
    const t = this.ctx.currentTime + 0.02;
    const G4 = 392, C5 = 523.25, E5 = 659.25;
    this.trumpet(G4, t, 0.14, 0.3);
    this.trumpet(C5, t + 0.16, 0.14, 0.3);
    this.trumpet(E5, t + 0.32, 0.34, 0.34);
    this.snare(t, 0.16); this.snare(t + 0.16, 0.16); this.kick(t + 0.32, 0.5);
  }

  // ── Wood Crack (crates splintering) ──────────────────────────────────────
  public playCrackSound(x?: number) {
    if (!this.ctx || !this.canPlay('crack', 90)) return;
    this.ensureContext();
    const { o, a } = this.spatial('high', x);
    const buf = this.noise(0.08, (i, n) => Math.pow(1 - i / n, 3));
    if (buf) this.playNoise(buf, 'bandpass', 1800, 500, 0.22 * a, 0.08, o);
  }

  // ── Generic Impact ───────────────────────────────────────────────────────
  public playHitSound(x?: number) {
    if (!this.ctx || !this.canPlay('hit', 38)) return;
    this.ensureContext();
    const { o, a } = this.spatial('high', x);
    this.playOsc('sawtooth', 110, 18, 0.09 * a, 0.09, 0, o);
  }

  // ── Mine Explosion ───────────────────────────────────────────────────────
  public playMineExplosion(x?: number) {
    if (!this.ctx || !this.canPlay('mine', 180)) return;
    this.ensureContext();
    const { o, a } = this.spatial('low', x);
    const buf = this.noise(0.45, (i, n) => Math.pow(1 - i / n, 2.5));
    if (buf) this.playNoise(buf, 'bandpass', 1400, 180, 0.55 * a, 0.4, o);
    this.playOsc('sine', 90, 18, 0.4 * a, 0.35, 0, o);
  }

  // ── Standard Explosion ───────────────────────────────────────────────────
  public playExplosionSound(x?: number) {
    if (!this.ctx || !this.canPlay('explosion', 90)) return;
    this.ensureContext();
    const { o, a } = this.spatial('low', x);
    const buf = this.noise(0.55, (i, n) => Math.pow(1 - i / n, 2));
    if (buf) this.playNoise(buf, 'lowpass', 900, 90, 0.55 * a, 0.55, o);
    this.playOsc('sine', 85, 18, 0.45 * a, 0.42, 0, o);
  }

  // ── Large Vehicle Explosion ──────────────────────────────────────────────
  public playLargeExplosion(x?: number) {
    if (!this.ctx || !this.canPlay('bigboom', 180)) return;
    this.ensureContext();
    const { o, a } = this.spatial('low', x);
    const buf = this.noise(1.0, (i, n) => Math.pow(1 - i / n, 1.7));
    if (buf) this.playNoise(buf, 'lowpass', 650, 55, 0.85 * a, 0.9, o);
    this.playOsc('sine', 65, 12, 0.75 * a, 0.75, 0, o);
  }

  // ── Nuke ─────────────────────────────────────────────────────────────────
  public playNukeSound() {
    if (!this.ctx || !this.canPlay('nuke', 5000)) return;
    this.ensureContext();
    // A nuke is heard from anywhere — low bus, no pan, no distance falloff
    const o = this.busLowIn ?? undefined;
    const buf = this.noise(3.2, (i, n) => {
      const pct = i / n;
      return pct < 0.08 ? pct / 0.08 : Math.pow(1 - pct, 0.55);
    });
    if (buf) this.playNoise(buf, 'lowpass', 220, 28, 1.0, 3.2, o);
    this.playOsc('sine', 32, 7, 0.0, 2.6, 0.3, o);
  }

  // ── Instruments (shared by the intro jingle and the battle-music loop) ───
  // Trumpet note — sawtooth + filtered for brass timbre
  private trumpet(freq: number, start: number, dur: number, vol = 0.38, out?: AudioNode) {
    const ctx = this.ctx, dest = out ?? this.dest;
    if (!ctx || !dest) return;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const mix = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    const env = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc2.type = 'square';
    osc2.frequency.value = freq;
    const g2 = ctx.createGain(); g2.gain.value = 0.28;
    osc.connect(mix); osc2.connect(g2); g2.connect(mix);
    filt.type = 'lowpass';
    filt.frequency.value = Math.min(freq * 5, 4000);
    filt.Q.value = 1.2;
    mix.connect(filt); filt.connect(env); env.connect(dest);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(vol, start + 0.018);
    env.gain.setValueAtTime(vol * 0.82, start + dur * 0.55);
    env.gain.linearRampToValueAtTime(0, start + dur);
    osc.start(start); osc.stop(start + dur);
    osc2.start(start); osc2.stop(start + dur);
  }

  private snare(start: number, vol = 0.28, out?: AudioNode) {
    const ctx = this.ctx, dest = out ?? this.dest;
    if (!ctx || !dest) return;
    const n = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(start); src.stop(start + 0.13);
  }

  private kick(start: number, vol = 0.65, out?: AudioNode) {
    const ctx = this.ctx, dest = out ?? this.dest;
    if (!ctx || !dest) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, start); osc.frequency.exponentialRampToValueAtTime(22, start + 0.22);
    g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    osc.connect(g); g.connect(dest);
    osc.start(start); osc.stop(start + 0.23);
  }

  // ── Intro Jingle ─────────────────────────────────────────────────────────
  public playIntroJingle() {
    if (!this.ctx || !this.dest) return;
    this.ensureContext();
    const t = this.ctx.currentTime + 0.05;
    const trumpet = (f: number, s: number, d: number, v?: number) => this.trumpet(f, s, d, v);
    const snare = (s: number, v?: number) => this.snare(s, v);
    const kick = (s: number, v?: number) => this.kick(s, v);

    // ── Composition: Military Fanfare in C (bugle scale: G4 C5 E5 G5 C6) ──
    const G4 = 392, C5 = 523.25, E5 = 659.25, G5 = 784, C6 = 1046.5, E6 = 1318.5;

    // Drum intro roll (before melody)
    snare(t + 0.00, 0.18); snare(t + 0.12, 0.18); snare(t + 0.22, 0.22);
    kick(t + 0.22);

    // Phrase 1: quick ascending call — G G C E G
    trumpet(G4, t + 0.30, 0.16);
    trumpet(G4, t + 0.48, 0.16);
    trumpet(C5, t + 0.66, 0.20);
    trumpet(E5, t + 0.88, 0.20);
    trumpet(G5, t + 1.10, 0.28);
    snare(t + 1.10, 0.22);

    // Peak: C6 held — fanfare climax
    kick(t + 1.40); snare(t + 1.40, 0.28);
    trumpet(C6, t + 1.42, 0.55, 0.42);

    // Phrase 2: triumphant descent — G5 E5 C5 with dotted rhythm
    trumpet(G5, t + 2.00, 0.18);
    trumpet(E5, t + 2.20, 0.18);
    snare(t + 2.20, 0.20);
    trumpet(C5, t + 2.40, 0.18);
    trumpet(G4, t + 2.60, 0.15);

    // Final cadence: C5 long resolution
    kick(t + 2.78); snare(t + 2.78, 0.32);
    trumpet(C5, t + 2.80, 0.85, 0.44);

    // Closing snare flam
    snare(t + 3.68, 0.20); snare(t + 3.74, 0.15);
    kick(t + 3.80, 0.70);
  }

  // ── Battle music: a quiet procedural military march, scheduled bar by bar ─
  public startMusic() {
    if (!this.ctx || !this.musicDest || this.musicTimer !== null) return;
    this.ensureContext();
    this.musicBar = 0;
    this.musicLevel = 0;
    this.musicTension = false;
    this.levelHeldSince = 0;
    this.nextBarTime = this.ctx.currentTime + 0.1;
    // Look-ahead scheduler: keep ~1 bar queued so tab jank never gaps the beat
    this.musicTimer = setInterval(() => {
      if (!this.ctx) return;
      while (this.nextBarTime < this.ctx.currentTime + this.barLen()) {
        this.scheduleMusicBar(this.nextBarTime, this.musicBar++);
        // Tempo rides intensity: the next bar starts sooner at full battle pitch.
        // Advancing from the previous bar's start keeps the grid gap-free.
        this.nextBarTime += this.barLen();
      }
    }, 250);
  }

  private barLen() { return this.musicLevel === 2 ? BAR_LEN / 1.1 : BAR_LEN; }

  public stopMusic() {
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  private scheduleMusicBar(t: number, bar: number) {
    const out = this.musicDest!;
    const ctx = this.ctx!;
    const barLen = this.barLen();
    const beat = barLen / 4;
    const level = this.musicLevel;
    const tension = this.musicTension;

    // March percussion: kick on 1 & 3, snare on 2 & 4 with a ghost before 4
    this.kick(t, 0.34, out);
    this.kick(t + 2 * beat, 0.28, out);
    this.snare(t + beat, level >= 1 ? 0.16 : 0.11, out);
    this.snare(t + 3 * beat - beat * 0.25, 0.045, out);
    this.snare(t + 3 * beat, level >= 1 ? 0.17 : 0.12, out);
    if (bar % 4 === 3) { // little roll into the next phrase
      this.snare(t + 3.5 * beat, 0.05, out);
      this.snare(t + 3.75 * beat, 0.07, out);
    }
    if (level >= 2) {
      // Rapid snare rolls under the fanfare — sixteenth pickups into beats 2 and 4
      for (let i = 0; i < 3; i++) {
        this.snare(t + beat * (0.25 + i * 0.25), 0.05 + i * 0.02, out);
        this.snare(t + beat * (2.25 + i * 0.25), 0.05 + i * 0.02, out);
      }
    }

    // Low drone: one sustained root note per bar, walking a minor lament bass.
    // Tension walks a tighter, darker line that refuses to resolve.
    const roots = tension
      ? [65.41, 61.74, 65.41, 69.3] // C2 B1 C2 Db2 — chromatic unease
      : [65.41, 58.27, 51.91, 49.0]; // C2 Bb1 Ab1 G1
    const root = roots[Math.floor(bar / 2) % roots.length];
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = root;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.3);
    g.gain.setValueAtTime(0.05, t + barLen - 0.4);
    g.gain.linearRampToValueAtTime(0, t + barLen);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + barLen);

    // Firefight layer: a walking eighth-note bassline on the root
    if (level >= 1) {
      const steps = tension ? [1, 1, 1, 1, 1, 1, 1, 1] : [1, 1, 1.5, 1, 1, 2, 1.5, 1];
      for (let i = 0; i < 8; i++) {
        const b = ctx.createOscillator();
        const bg = ctx.createGain();
        b.type = 'square';
        b.frequency.value = root * 2 * steps[i];
        const s = t + i * (beat / 2);
        bg.gain.setValueAtTime(0.028, s);
        bg.gain.exponentialRampToValueAtTime(0.0001, s + beat * 0.42);
        b.connect(bg); bg.connect(out);
        b.start(s); b.stop(s + beat * 0.45);
      }
    }

    // Desperate-defense pad: a pulsing low fifth that leans on every off-beat
    if (tension) {
      [root * 3, root * 4.5].forEach((f) => {
        for (let i = 0; i < 4; i++) {
          const p = ctx.createOscillator();
          const pg = ctx.createGain();
          p.type = 'sawtooth';
          p.frequency.value = f;
          const s = t + (i + 0.5) * beat;
          pg.gain.setValueAtTime(0, s);
          pg.gain.linearRampToValueAtTime(0.022, s + 0.05);
          pg.gain.exponentialRampToValueAtTime(0.0001, s + beat * 0.5);
          p.connect(pg); pg.connect(out);
          p.start(s); p.stop(s + beat * 0.55);
        }
      });
    }

    // Distant bugle motif every 4th bar, rotating through three phrases
    if (bar % 4 === 2) {
      const C4 = 261.63, Eb4 = 311.13, F4 = 349.23, G4 = 392, Bb4 = 466.16, C5 = 523.25, B3 = 246.94;
      const motifs: [number, number, number][][] = tension
        ? [
          [[C4, 0, 0.25], [B3, 0.3, 0.25], [C4, 0.6, 0.5]],
          [[Eb4, 0, 0.2], [C4, 0.25, 0.2], [B3, 0.5, 0.45]],
        ]
        : [
          [[C4, 0, 0.3], [Eb4, 0.35, 0.3], [G4, 0.7, 0.55]],
          [[G4, 0, 0.25], [F4, 0.3, 0.25], [Eb4, 0.6, 0.25], [C4, 0.9, 0.5]],
          [[C4, 0, 0.2], [C4, 0.25, 0.2], [G4, 0.5, 0.35], [Bb4, 0.95, 0.3], [C5, 1.3, 0.6]],
        ];
      const phrase = motifs[Math.floor(bar / 4) % motifs.length];
      const vol = level >= 2 ? 0.13 : 0.085;
      phrase.forEach(([f, off, dur]) => this.trumpet(f, t + beat + off, dur, vol, out));
    }

    // Assault layer: brass fanfare stabs + an overdriven synth lead line
    if (level >= 2) {
      const C4 = 261.63, Eb4 = 311.13, G4 = 392, C5 = 523.25;
      if (bar % 2 === 0) {
        this.trumpet(tension ? Eb4 : G4, t, 0.18, 0.1, out);
        this.trumpet(tension ? C4 : C5, t + 0.2, 0.3, 0.11, out);
      }
      // Overdrive lead: detuned saw pair, one bite per beat
      const leadNotes = tension ? [C4, 246.94 /* B3 */, Eb4, C4] : [C4, Eb4, G4, Eb4];
      for (let i = 0; i < 4; i++) {
        const f = leadNotes[i] * 2;
        [f, f * 1.007].forEach((freq) => {
          const l = ctx.createOscillator();
          const lg = ctx.createGain();
          const lf = ctx.createBiquadFilter();
          l.type = 'sawtooth';
          l.frequency.value = freq;
          lf.type = 'lowpass';
          lf.frequency.value = 2200;
          lf.Q.value = 4; // resonant bite reads as overdrive without a waveshaper
          const s = t + i * beat + beat * 0.5;
          lg.gain.setValueAtTime(0.02, s);
          lg.gain.exponentialRampToValueAtTime(0.0001, s + beat * 0.4);
          l.connect(lf); lf.connect(lg); lg.connect(out);
          l.start(s); l.stop(s + beat * 0.45);
        });
      }
    }
  }

  // ── Shell shock: a high ring in deafened ears while the war ducks under it ─
  public shellShock(strength: number) {
    if (!this.ctx || !this.dest || strength < 0.15 || !this.canPlay('shock', 1500)) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 3400;
    const dur = 1.6 + strength * 1.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11 * strength, t + 0.04); // rides above the duck below
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.dest);
    osc.start(t); osc.stop(t + dur + 0.05);
    // Everything else drops away, then bleeds back in
    if (this.duckNode) {
      const d = this.duckNode.gain;
      d.cancelScheduledValues(t);
      d.setValueAtTime(d.value, t);
      d.linearRampToValueAtTime(1 - 0.7 * strength, t + 0.05);
      d.setTargetAtTime(1, t + 0.4 + 0.5 * strength, 0.5);
    }
  }

  // ── Scream ───────────────────────────────────────────────────────────────
  public playScreamSound(x?: number) {
    if (!this.ctx || !this.canPlay('scream', 120)) return;
    this.ensureContext();
    const { o, a } = this.spatial('high', x);
    this.playOsc('sawtooth', 650 + Math.random() * 300, 75, 0.09 * a, 0.42, 0, o);
  }
}

export const soundService = new SoundService();
