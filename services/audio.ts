const BAR_LEN = 2.5; // seconds per music bar (4/4 at 96 BPM)

class SoundService {
  private ctx: AudioContext | null = null;
  private dest: AudioNode | null = null;
  private master: GainNode | null = null;
  private musicDest: GainNode | null = null;
  private lastPlayed: Map<string, number> = new Map();
  private muted = false;
  private musicOn = true;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicBar = 0;
  private nextBarTime = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem('ewv-muted') === '1';
      this.musicOn = localStorage.getItem('ewv-music') !== '0';
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
      master.gain.value = this.muted ? 0 : 0.85;
      master.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.dest = master;
      this.master = master;
      // Music runs through its own bus so it stays quiet under the SFX
      const musicBus = this.ctx.createGain();
      musicBus.gain.value = 0.55;
      musicBus.connect(master);
      this.musicDest = musicBus;
    } catch (e) {
      console.warn("Web Audio API not supported");
    }
  }

  // ── Mute / music toggles (persisted) ─────────────────────────────────────
  public isMuted() { return this.muted; }
  public setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.02);
    try { localStorage.setItem('ewv-muted', m ? '1' : '0'); } catch { /* ignore */ }
  }
  public isMusicOn() { return this.musicOn; }
  public setMusicOn(on: boolean) {
    this.musicOn = on;
    if (on) this.startMusic(); else this.stopMusic();
    try { localStorage.setItem('ewv-music', on ? '1' : '0'); } catch { /* ignore */ }
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
      src.connect(f); f.connect(g); g.connect(this.dest);
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
  public playMortarThunk() {
    if (!this.ctx || !this.canPlay('mortar', 200)) return;
    this.ensureContext();
    const buf = this.noise(0.12, (i, n) => Math.pow(1 - i / n, 2.2));
    if (buf) this.playNoise(buf, 'bandpass', 420, 150, 0.3, 0.12);
    this.playOsc('sine', 180, 55, 0.3, 0.16);
  }

  // Drone burst — light high-pitched energy zip
  public playDroneZip() {
    if (!this.ctx || !this.canPlay('drone', 90)) return;
    this.ensureContext();
    this.playOsc('square', 1900, 700, 0.05, 0.08);
    this.playOsc('sine', 2400, 1100, 0.04, 0.06);
  }

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
  public playCrackSound() {
    if (!this.ctx || !this.canPlay('crack', 90)) return;
    this.ensureContext();
    const buf = this.noise(0.08, (i, n) => Math.pow(1 - i / n, 3));
    if (buf) this.playNoise(buf, 'bandpass', 1800, 500, 0.22, 0.08);
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
    this.nextBarTime = this.ctx.currentTime + 0.1;
    // Look-ahead scheduler: keep ~1 bar queued so tab jank never gaps the beat
    this.musicTimer = setInterval(() => {
      if (!this.ctx) return;
      while (this.nextBarTime < this.ctx.currentTime + BAR_LEN) {
        this.scheduleMusicBar(this.nextBarTime, this.musicBar++);
        this.nextBarTime += BAR_LEN;
      }
    }, 250);
  }

  public stopMusic() {
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  private scheduleMusicBar(t: number, bar: number) {
    const out = this.musicDest!;
    const ctx = this.ctx!;
    const beat = BAR_LEN / 4;

    // March percussion: kick on 1 & 3, snare on 2 & 4 with a ghost before 4
    this.kick(t, 0.34, out);
    this.kick(t + 2 * beat, 0.28, out);
    this.snare(t + beat, 0.11, out);
    this.snare(t + 3 * beat - beat * 0.25, 0.045, out);
    this.snare(t + 3 * beat, 0.12, out);
    if (bar % 4 === 3) { // little roll into the next phrase
      this.snare(t + 3.5 * beat, 0.05, out);
      this.snare(t + 3.75 * beat, 0.07, out);
    }

    // Low drone: one sustained root note per bar, walking a minor lament bass
    const roots = [65.41, 58.27, 51.91, 49.0]; // C2 Bb1 Ab1 G1
    const root = roots[Math.floor(bar / 2) % roots.length];
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = root;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.3);
    g.gain.setValueAtTime(0.05, t + BAR_LEN - 0.4);
    g.gain.linearRampToValueAtTime(0, t + BAR_LEN);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + BAR_LEN);

    // Distant bugle motif every 4th bar, rotating through three phrases
    if (bar % 4 === 2) {
      const C4 = 261.63, Eb4 = 311.13, F4 = 349.23, G4 = 392, Bb4 = 466.16, C5 = 523.25;
      const motifs: [number, number, number][][] = [
        [[C4, 0, 0.3], [Eb4, 0.35, 0.3], [G4, 0.7, 0.55]],
        [[G4, 0, 0.25], [F4, 0.3, 0.25], [Eb4, 0.6, 0.25], [C4, 0.9, 0.5]],
        [[C4, 0, 0.2], [C4, 0.25, 0.2], [G4, 0.5, 0.35], [Bb4, 0.95, 0.3], [C5, 1.3, 0.6]],
      ];
      const phrase = motifs[Math.floor(bar / 4) % motifs.length];
      phrase.forEach(([f, off, dur]) => this.trumpet(f, t + beat + off, dur, 0.085, out));
    }
  }

  // ── Scream ───────────────────────────────────────────────────────────────
  public playScreamSound() {
    if (!this.ctx || !this.canPlay('scream', 120)) return;
    this.ensureContext();
    this.playOsc('sawtooth', 650 + Math.random() * 300, 75, 0.09, 0.42);
  }
}

export const soundService = new SoundService();
