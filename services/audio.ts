class SoundService {
  private ctx: AudioContext | null = null;

  constructor() {
    try {
      // Initialize on user interaction usually, but we set it up lazily
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
    } catch (e) {
      console.warn("Web Audio API not supported");
    }
  }

  private ensureContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private shootBuffer: AudioBuffer | null = null;
  private hitBuffer: AudioBuffer | null = null;
  private explosionBuffer: AudioBuffer | null = null;

  private createShootBuffer() {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private createExplosionBuffer() {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    return buffer;
  }

  public playSpawnSound(isEast: boolean) {
    if (!this.ctx) return;
    this.ensureContext();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(isEast ? 440 : 523.25, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(isEast ? 880 : 1046.5, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  public playShootSound() {
    if (!this.ctx) return;
    this.ensureContext();
    if (!this.shootBuffer) this.shootBuffer = this.createShootBuffer();
    if (!this.shootBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.shootBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();
  }

  public playHitSound() {
    if (!this.ctx) return;
    this.ensureContext();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  public playExplosionSound() {
    if (!this.ctx) return;
    this.ensureContext();
    if (!this.explosionBuffer) this.explosionBuffer = this.createExplosionBuffer();
    if (!this.explosionBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.explosionBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.4);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();
  }

  public playScreamSound() {
    if (!this.ctx) return;
    this.ensureContext();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800 + Math.random() * 200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.4);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }
}

export const soundService = new SoundService();
