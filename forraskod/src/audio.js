// Szintetizált hangok: patadobogás, szél, prüszkölés, nyihogás, csilingelés, madarak.
export class Sound {
  constructor() { this.ctx = null; this.on = true; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.on ? 0.9 : 0; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2; this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // szél
      const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      this.windF = this.ctx.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.frequency.value = 400;
      this.windG = this.ctx.createGain(); this.windG.gain.value = 0.02;
      src.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master); src.start();
      // vízcsobogás (vízesés, patak)
      const ws = this.ctx.createBufferSource(); ws.buffer = this.noise; ws.loop = true; ws.playbackRate.value = 0.7;
      const wf = this.ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 900; wf.Q.value = 0.4;
      this.waterG = this.ctx.createGain(); this.waterG.gain.value = 0;
      ws.connect(wf); wf.connect(this.waterG); this.waterG.connect(this.master); ws.start();
    } catch (e) { this.ctx = null; }
  }
  setOn(v) { this.on = v; if (this.master) this.master.gain.value = v ? 0.9 : 0; }
  t() { return this.ctx.currentTime; }
  burst({ f = 1000, q = 1, type = 'bandpass', dur = 0.08, vol = 0.3, at = 0 }) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = this.ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = this.ctx.createGain(); const t = this.t() + at;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone({ f = 440, f2 = null, dur = 0.2, vol = 0.2, type = 'sine', at = 0 }) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = type; const g = this.ctx.createGain(); const t = this.t() + at;
    o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  water(level) { if (this.waterG) this.waterG.gain.setTargetAtTime(Math.min(0.35, level), this.t(), 0.4); }
  hoof(surface, speed, vol = 1) {
    if (!this.ctx) return;
    const v = Math.min(1, 0.25 + speed / 10) * vol;
    if (surface === 'hard') { this.burst({ f: 1500 + Math.random() * 500, q: 2.5, dur: 0.05, vol: 0.32 * v }); this.burst({ f: 700, q: 1.5, dur: 0.07, vol: 0.2 * v }); }
    else if (surface === 'sand') { this.burst({ f: 900, q: 0.8, type: 'lowpass', dur: 0.09, vol: 0.28 * v }); }
    else if (surface === 'water') { this.burst({ f: 1800, q: 0.6, dur: 0.18, vol: 0.25 * v }); this.burst({ f: 500, q: 1, dur: 0.12, vol: 0.2 * v }); }
    else { this.burst({ f: 380, q: 1.2, dur: 0.07, vol: 0.32 * v }); this.burst({ f: 1100, q: 1.5, dur: 0.03, vol: 0.06 * v }); }
    this.tone({ f: 95 + Math.random() * 20, f2: 55, dur: 0.07, vol: 0.18 * v });
  }
  wind(speed) { if (this.windG) { const t = this.t(); this.windG.gain.setTargetAtTime(0.015 + Math.min(speed / 13, 1) * 0.12, t, 0.3); this.windF.frequency.setTargetAtTime(300 + speed * 70, t, 0.3); } }
  snort() { this.burst({ f: 700, q: 0.8, dur: 0.18, vol: 0.25 }); this.burst({ f: 500, q: 0.8, dur: 0.22, vol: 0.22, at: 0.2 }); }
  nicker() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; const lf = this.ctx.createOscillator(); lf.frequency.value = 14;
    const lg = this.ctx.createGain(); lg.gain.value = 0.5; const g = this.ctx.createGain(); g.gain.value = 0;
    const fl = this.ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 600;
    const t = this.t(); o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(110, t + 0.7);
    const am = this.ctx.createGain(); am.gain.value = 0.5; lf.connect(lg); lg.connect(am.gain);
    o.connect(fl); fl.connect(am); am.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.08); g.gain.linearRampToValueAtTime(0.15, t + 0.5); g.gain.linearRampToValueAtTime(0, t + 0.8);
    o.start(t); lf.start(t); o.stop(t + 0.85); lf.stop(t + 0.85);
  }
  neigh(vol = 1) {
    if (!this.ctx || vol < 0.03) return;
    const t = this.t(); const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    const vib = this.ctx.createOscillator(); vib.frequency.value = 9; const vg = this.ctx.createGain(); vg.gain.value = 40; vib.connect(vg); vg.connect(o.frequency);
    o.frequency.setValueAtTime(500, t); o.frequency.linearRampToValueAtTime(950, t + 0.25); o.frequency.linearRampToValueAtTime(620, t + 0.9); o.frequency.linearRampToValueAtTime(300, t + 1.3);
    const f1 = this.ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1100; f1.Q.value = 2;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * vol, t + 0.1); g.gain.setValueAtTime(0.14 * vol, t + 0.9); g.gain.linearRampToValueAtTime(0, t + 1.35);
    o.connect(f1); f1.connect(g); g.connect(this.master); o.start(t); vib.start(t); o.stop(t + 1.4); vib.stop(t + 1.4);
  }
  bleat(vol = 1) {
    if (!this.ctx || vol < 0.03) return;
    const t = this.t(), o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(330, t); o.frequency.linearRampToValueAtTime(300, t + 0.6);
    const lf = this.ctx.createOscillator(); lf.frequency.value = 22; const lg = this.ctx.createGain(); lg.gain.value = 0.45; const am = this.ctx.createGain(); am.gain.value = 0.55; lf.connect(lg); lg.connect(am.gain);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.5; const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12 * vol, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 0.65);
    o.connect(f); f.connect(am); am.connect(g); g.connect(this.master); o.start(t); lf.start(t); o.stop(t + 0.7); lf.stop(t + 0.7);
  }
  quack(vol = 1) {
    if (!this.ctx || vol < 0.03) return;
    for (let i = 0; i < 2; i++) { const t = this.t() + i * 0.18, o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.12);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 3; const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.1 * vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.16); }
  }
  coin() { this.tone({ f: 988, dur: 0.12, vol: 0.18, type: 'triangle' }); this.tone({ f: 1319, dur: 0.3, vol: 0.18, type: 'triangle', at: 0.09 }); }
  success() { [523, 659, 784, 1047].forEach((f, i) => this.tone({ f, dur: 0.25, vol: 0.15, type: 'triangle', at: i * 0.1 })); }
  fail() { this.tone({ f: 300, f2: 180, dur: 0.35, vol: 0.15, type: 'square' }); }
  thud() { this.tone({ f: 120, f2: 40, dur: 0.18, vol: 0.3 }); this.burst({ f: 300, q: 0.7, dur: 0.15, vol: 0.25 }); }
  pole() { this.tone({ f: 420, f2: 300, dur: 0.12, vol: 0.2, type: 'triangle' }); this.tone({ f: 380, f2: 260, dur: 0.15, vol: 0.18, type: 'triangle', at: 0.18 }); }
  brush() { this.burst({ f: 3500, q: 0.7, dur: 0.12, vol: 0.06 }); }
  munch() { for (let i = 0; i < 3; i++) this.burst({ f: 2000, q: 1, dur: 0.05, vol: 0.12, at: i * 0.16 }); }
  splash() { this.burst({ f: 1200, q: 0.5, dur: 0.35, vol: 0.2 }); }
  // motor: fűrészfog + négyszög alhang, aluláteresztő szűrővel; a fordulat a sebességgel nő
  engine(level, speed = 0, thr = 0) {
    if (!this.ctx) return;
    if (!this.engO) {
      if (level <= 0) return;
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 45;
      const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 22;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 2.5;
      const g2 = this.ctx.createGain(); g2.gain.value = 0.45; const g = this.ctx.createGain(); g.gain.value = 0;
      o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(this.master); o.start(); o2.start();
      this.engO = o; this.engO2 = o2; this.engF = f; this.engG = g;
    }
    const t = this.t(), rpm = 40 + speed * 5.5 + thr * 12;
    this.engO.frequency.setTargetAtTime(rpm, t, 0.15); this.engO2.frequency.setTargetAtTime(rpm / 2, t, 0.15);
    this.engF.frequency.setTargetAtTime(240 + speed * 26 + thr * 110, t, 0.2);
    this.engG.gain.setTargetAtTime(level * (0.055 + thr * 0.035), t, level > 0 ? 0.12 : 0.25);
  }
  engineStart() { this.burst({ f: 260, q: 0.7, type: 'lowpass', dur: 0.55, vol: 0.3 }); this.tone({ f: 40, f2: 70, dur: 0.5, vol: 0.12, type: 'sawtooth' }); }
  horn() {
    if (!this.ctx) return;
    const t = this.t(), f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1600;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.14, t + 0.02); g.gain.setValueAtTime(0.14, t + 0.42); g.gain.linearRampToValueAtTime(0, t + 0.5);
    f.connect(g); g.connect(this.master);
    for (const fr of [392, 494]) { const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr; o.connect(f); o.start(t); o.stop(t + 0.52); }
  }
  door() { this.burst({ f: 220, q: 0.8, type: 'lowpass', dur: 0.16, vol: 0.45 }); this.tone({ f: 95, f2: 50, dur: 0.12, vol: 0.25 }); }
  ramp() { this.tone({ f: 130, f2: 60, dur: 0.28, vol: 0.28 }); this.burst({ f: 420, q: 0.8, dur: 0.2, vol: 0.28, at: 0.04 }); }
  bird() { const b = 2400 + Math.random() * 1500; for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone({ f: b, f2: b * 1.35, dur: 0.07, vol: 0.035, at: i * 0.12 }); }
}
