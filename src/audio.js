// All sound is synthesized with the Web Audio API — no audio files to host.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.musicTimer = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.sfx.connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = this.musicOn ? 0.32 : 0;
    this.music.connect(this.master);

    // noise buffer shared by explosions / crashes
    const len = ctx.sampleRate * 1.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Engine: two detuned saws through a lowpass
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    this.engGain.connect(this.sfx);
    lp.connect(this.engGain);
    this.eng1 = ctx.createOscillator(); this.eng1.type = 'sawtooth';
    this.eng2 = ctx.createOscillator(); this.eng2.type = 'square';
    this.eng1.frequency.value = 55; this.eng2.frequency.value = 27;
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    this.eng1.connect(lp); this.eng2.connect(g2); g2.connect(lp);
    this.eng1.start(); this.eng2.start();

    // Siren: sine wobbled by an LFO
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenGain.connect(this.sfx);
    this.siren = ctx.createOscillator();
    this.siren.type = 'triangle';
    this.siren.frequency.value = 750;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain); lfoGain.connect(this.siren.frequency);
    this.siren.connect(this.sirenGain);
    this.siren.start(); lfo.start();

    this.startMusic();
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.05);
  }

  /** speed01: 0..1, nitro: bool, sirenLevel: 0..1, active: whether in a run */
  update(speed01, nitro, sirenLevel, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 45 + speed01 * 95 + (nitro ? 30 : 0);
    this.eng1.frequency.setTargetAtTime(f, t, 0.08);
    this.eng2.frequency.setTargetAtTime(f / 2, t, 0.08);
    this.engGain.gain.setTargetAtTime(active ? 0.06 + speed01 * 0.06 : 0, t, 0.1);
    this.sirenGain.gain.setTargetAtTime(active ? sirenLevel * 0.045 : 0, t, 0.2);
  }

  _noise(dur, freq, vol, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.15), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.05);
  }

  _tone(freq, dur, vol, type = 'square', slideTo) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  }

  explosion(vol = 1) { this._noise(1.1, 1800, 0.9 * vol); this._tone(90, 0.5, 0.4 * vol, 'sine', 30); }
  crash(vol = 1) { this._noise(0.25, 3000, 0.45 * Math.min(1, vol), 'bandpass'); }
  cash() { this._tone(988, 0.07, 0.12); setTimeout(() => this._tone(1319, 0.12, 0.12), 60); }
  powerup() { this._tone(400, 0.25, 0.14, 'square', 1200); }
  nitro() { this._noise(0.5, 6000, 0.25, 'highpass'); }
  click() { this._tone(660, 0.05, 0.1); }
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.12, 0.1), i * 80)); }
  busted() { [440, 330, 220].forEach((f, i) => setTimeout(() => this._tone(f, 0.25, 0.15, 'sawtooth'), i * 180)); }

  // Simple looping chiptune: bass line + kick + hats, scheduled ahead of time.
  startMusic() {
    const ctx = this.ctx;
    const bpm = 132, step = 60 / bpm / 4;
    const bass = [45, 0, 45, 0, 48, 0, 45, 0, 43, 0, 43, 0, 40, 0, 43, 0];
    const lead = [69, 0, 0, 72, 0, 0, 76, 0, 74, 0, 72, 0, 69, 0, 67, 0];
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    let next = ctx.currentTime + 0.1, i = 0, bar = 0;
    const play = (freq, t, dur, type, vol) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + dur + 0.02);
    };
    const hat = (t, vol) => {
      const s = ctx.createBufferSource(); s.buffer = this.noise;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      s.connect(f); f.connect(g); g.connect(this.music); s.start(t, Math.random()); s.stop(t + 0.06);
    };
    const tick = () => {
      while (next < ctx.currentTime + 0.2) {
        const k = i % 16;
        if (bass[k]) play(midi(bass[k] + (bar % 4 === 3 ? 5 : 0)), next, step * 1.8, 'square', 0.18);
        if (bar % 2 === 1 && lead[k]) play(midi(lead[k]), next, step * 1.5, 'triangle', 0.12);
        if (k % 4 === 0) play(150, next, 0.15, 'sine', 0.5); // kick
        if (k % 2 === 1) hat(next, 0.08);
        next += step; i++;
        if (i % 16 === 0) bar++;
      }
    };
    this.musicTimer = setInterval(tick, 50);
  }
}
