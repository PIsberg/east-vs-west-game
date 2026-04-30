class SoundService {
  private ctx: AudioContext | null = null;
  private dest: AudioNode | null = null;
  private lastPlayed: Map<string, number> = new Map();

  constructor() {
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
      master.gain.value = 0.85;
      master.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.dest = master;
    } catch (e) {
      console.warn("Web Audio API not supported");
    }
  }

  private ensureContext() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
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

  private playNoise(buf: AudioBuffer, filterType: BiquadFilterType, fStart: number, fEnd: number, gStart: number, duration: number) {
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
    src.connect(f); f.connect(g); g.connect(this.dest);
    src.start(t); src.stop(t + duration);
  }

  private playOsc(type: OscillatorType, fStart: number, fEnd: number, gStart: number, duration: number, delay = 0) {
    if (!this.ctx || !this.dest) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.connect(g); g.connect(this.dest);
    osc.type = type;
    osc.frequency.setValueAtTime(fStart, t);
    if (fEnd !== fStart) osc.frequency.exponentialRampToValueAtTime(Math.max(fEnd, 8), t + duration);
    g.gain.setValueAtTime(gStart, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.start(t); osc.stop(t + duration);
  }

  // ── Spawn ────────────────────────────────────────────────────────────────
  public playSpawnSound(isEast: boolean) {
    if (!this.ctx || !this.canPlay('spawn', 80)) return;
    this.ensureContext();
    this.playOsc('square', isEast ? 440 : 523.25, isEast ? 880 : 1046.5, 0.07, 0.22);
  }

  // ── Infantry Rifle ───────────────────────────────────────────────────────
  public playRifleShot() {
    if (!this.ctx || !this.canPlay('rifle', 45)) return;
    this.ensureContext();
    const buf = this.noise(0.09, (i, n) => Math.pow(1 - i / n, 3));
    if (buf) this.playNoise(buf, 'highpass', 2800, 700, 0.22, 0.09);
    this.playOsc('sine', 150, 35, 0.14, 0.07);
  }

  // ── Sniper ───────────────────────────────────────────────────────────────
  public playSniperShot() {
    if (!this.ctx || !this.canPlay('sniper', 150)) return;
    this.ensureContext();
    const buf = this.noise(0.06, (i, n) => Math.pow(1 - i / n, 4));
    if (buf) this.playNoise(buf, 'highpass', 4000, 1200, 0.35, 0.06);
    this.playOsc('sine', 200, 30, 0.18, 0.08);
  }

  // ── Tank / Heavy ─────────────────────────────────────────────────────────
  public playHeavyShot() {
    if (!this.ctx || !this.canPlay('heavy', 130)) return;
    this.ensureContext();
    const buf = this.noise(0.4, (i, n) => Math.pow(1 - i / n, 1.8));
    if (buf) this.playNoise(buf, 'lowpass', 700, 80, 0.6, 0.4);
    this.playOsc('sine', 90, 18, 0.55, 0.28);
  }

  // ── Artillery ────────────────────────────────────────────────────────────
  public playArtilleryFire() {
    if (!this.ctx || !this.canPlay('artillery', 420)) return;
    this.ensureContext();
    const buf = this.noise(0.8, (i, n) => Math.pow(1 - i / n, 2));
    if (buf) this.playNoise(buf, 'lowpass', 350, 40, 0.9, 0.75);
    this.playOsc('sine', 65, 14, 0.65, 0.65);
  }

  // ── Rocket / AA missile ──────────────────────────────────────────────────
  public playRocketSound() {
    if (!this.ctx || !this.canPlay('rocket', 130)) return;
    this.ensureContext();
    const buf = this.noise(0.22, (i, n) => 0.4 + 0.6 * Math.pow(1 - i / n, 2));
    if (buf) this.playNoise(buf, 'bandpass', 900, 180, 0.28, 0.22);
    this.playOsc('sawtooth', 950, 260, 0.06, 0.2);
  }

  // ── Tesla Zap ────────────────────────────────────────────────────────────
  public playZapSound() {
    if (!this.ctx || !this.canPlay('zap', 55)) return;
    this.ensureContext();
    const buf = this.noise(0.13, (i, n) => Math.floor(Math.random() * 2)); // crackle
    if (buf) this.playNoise(buf, 'bandpass', 3200, 900, 0.25, 0.13);
    this.playOsc('sine', 1400, 180, 0.15, 0.1);
  }

  // ── Flamethrower ─────────────────────────────────────────────────────────
  public playFlameSound() {
    if (!this.ctx || !this.canPlay('flame', 75)) return;
    this.ensureContext();
    const buf = this.noise(0.28, (i, n) => 0.5 + 0.5 * (1 - i / n));
    if (buf) this.playNoise(buf, 'bandpass', 650, 280, 0.35, 0.28);
  }

  // ── Medic Heal ───────────────────────────────────────────────────────────
  public playHealSound() {
    if (!this.ctx || !this.canPlay('heal', 280)) return;
    this.ensureContext();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      this.playOsc('sine', freq, freq * 1.02, 0.07, 0.22, i * 0.065);
    });
  }

  // ── Generic Impact ───────────────────────────────────────────────────────
  public playHitSound() {
    if (!this.ctx || !this.canPlay('hit', 38)) return;
    this.ensureContext();
    this.playOsc('sawtooth', 110, 18, 0.09, 0.09);
  }

  // ── Mine Explosion ───────────────────────────────────────────────────────
  public playMineExplosion() {
    if (!this.ctx || !this.canPlay('mine', 180)) return;
    this.ensureContext();
    const buf = this.noise(0.45, (i, n) => Math.pow(1 - i / n, 2.5));
    if (buf) this.playNoise(buf, 'bandpass', 1400, 180, 0.55, 0.4);
    this.playOsc('sine', 90, 18, 0.4, 0.35);
  }

  // ── Standard Explosion ───────────────────────────────────────────────────
  public playExplosionSound() {
    if (!this.ctx || !this.canPlay('explosion', 90)) return;
    this.ensureContext();
    const buf = this.noise(0.55, (i, n) => Math.pow(1 - i / n, 2));
    if (buf) this.playNoise(buf, 'lowpass', 900, 90, 0.55, 0.55);
    this.playOsc('sine', 85, 18, 0.45, 0.42);
  }

  // ── Large Vehicle Explosion ──────────────────────────────────────────────
  public playLargeExplosion() {
    if (!this.ctx || !this.canPlay('bigboom', 180)) return;
    this.ensureContext();
    const buf = this.noise(1.0, (i, n) => Math.pow(1 - i / n, 1.7));
    if (buf) this.playNoise(buf, 'lowpass', 650, 55, 0.85, 0.9);
    this.playOsc('sine', 65, 12, 0.75, 0.75);
  }

  // ── Nuke ─────────────────────────────────────────────────────────────────
  public playNukeSound() {
    if (!this.ctx || !this.canPlay('nuke', 5000)) return;
    this.ensureContext();
    const buf = this.noise(3.2, (i, n) => {
      const pct = i / n;
      return pct < 0.08 ? pct / 0.08 : Math.pow(1 - pct, 0.55);
    });
    if (buf) this.playNoise(buf, 'lowpass', 220, 28, 1.0, 3.2);
    this.playOsc('sine', 32, 7, 0.0, 2.6, 0.3);
  }

  // ── Intro Jingle ─────────────────────────────────────────────────────────
  public playIntroJingle() {
    if (!this.ctx || !this.dest) return;
    this.ensureContext();
    const ctx = this.ctx;
    const dest = this.dest;
    const t = ctx.currentTime + 0.05;

    // Trumpet note helper — sawtooth + filtered for brass timbre
    const trumpet = (freq: number, start: number, dur: number, vol = 0.38) => {
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
    };

    // Snare helper
    const snare = (start: number, vol = 0.28) => {
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
    };

    // Bass drum helper
    const kick = (start: number, vol = 0.65) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, start); osc.frequency.exponentialRampToValueAtTime(22, start + 0.22);
      g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(g); g.connect(dest);
      osc.start(start); osc.stop(start + 0.23);
    };

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

  // ── Scream ───────────────────────────────────────────────────────────────
  public playScreamSound() {
    if (!this.ctx || !this.canPlay('scream', 120)) return;
    this.ensureContext();
    this.playOsc('sawtooth', 650 + Math.random() * 300, 75, 0.09, 0.42);
  }
}

export const soundService = new SoundService();
