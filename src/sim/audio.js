// Procedural sound: every sound is synthesised with WebAudio at runtime.
import { clamp } from '../util/math.js';

function noiseBuffer(ctx, type, seconds = 2) {
  const n = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (type === 'white') d[i] = w;
    else if (type === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return buf;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
    this.voice = null;
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.buf = { white: noiseBuffer(ctx, 'white'), pink: noiseBuffer(ctx, 'pink'), brown: noiseBuffer(ctx, 'brown') };

    const loop = (type) => {
      const s = ctx.createBufferSource();
      s.buffer = this.buf[type];
      s.loop = true;
      s.start(0, Math.random() * 1.5);
      return s;
    };
    // rolling tyres
    this.roll = { src: loop('pink'), bp: ctx.createBiquadFilter(), am: ctx.createGain(), gain: ctx.createGain() };
    this.roll.bp.type = 'bandpass';
    this.roll.bp.Q.value = 0.7;
    this.roll.gain.gain.value = 0;
    this.roll.src.connect(this.roll.bp).connect(this.roll.am).connect(this.roll.gain).connect(this.master);
    // klinker rumble: amplitude modulation
    this.rumbleOsc = ctx.createOscillator();
    this.rumbleOsc.type = 'triangle';
    this.rumbleDepth = ctx.createGain();
    this.rumbleDepth.gain.value = 0;
    this.rumbleOsc.connect(this.rumbleDepth).connect(this.roll.am.gain);
    this.roll.am.gain.value = 1;
    this.rumbleOsc.start();
    // wind
    this.windN = { src: loop('brown'), lp: ctx.createBiquadFilter(), gain: ctx.createGain() };
    this.windN.lp.type = 'lowpass';
    this.windN.gain.gain.value = 0;
    this.windN.src.connect(this.windN.lp).connect(this.windN.gain).connect(this.master);
    // rain
    this.rainN = { src: loop('white'), hp: ctx.createBiquadFilter(), lp: ctx.createBiquadFilter(), gain: ctx.createGain() };
    this.rainN.hp.type = 'highpass';
    this.rainN.hp.frequency.value = 700;
    this.rainN.lp.type = 'lowpass';
    this.rainN.lp.frequency.value = 6500;
    this.rainN.gain.gain.value = 0;
    this.rainN.src.connect(this.rainN.hp).connect(this.rainN.lp).connect(this.rainN.gain).connect(this.master);
    // city ambience
    this.city = { src: loop('brown'), bp: ctx.createBiquadFilter(), gain: ctx.createGain() };
    this.city.bp.type = 'bandpass';
    this.city.bp.frequency.value = 220;
    this.city.bp.Q.value = 0.4;
    this.city.gain.gain.value = 0.05;
    this.city.src.connect(this.city.bp).connect(this.city.gain).connect(this.master);
    // freewheel ticking
    this.tick = { osc: ctx.createOscillator(), hp: ctx.createBiquadFilter(), gain: ctx.createGain() };
    this.tick.osc.type = 'square';
    this.tick.hp.type = 'highpass';
    this.tick.hp.frequency.value = 2500;
    this.tick.gain.gain.value = 0;
    this.tick.osc.connect(this.tick.hp).connect(this.tick.gain).connect(this.master);
    this.tick.osc.start();
    // tram rumble (positional)
    this.tramN = { src: loop('brown'), lp: ctx.createBiquadFilter(), gain: ctx.createGain() };
    this.tramN.lp.type = 'lowpass';
    this.tramN.lp.frequency.value = 160;
    this.tramN.gain.gain.value = 0;
    this.tramN.src.connect(this.tramN.lp).connect(this.tramN.gain).connect(this.master);

    this.nextBird = 2;
    this.nextGull = 6;
    this.nextDrop = 0;
    this.lastQuarter = null;
    // pick a Dutch voice for shouts
    const pickVoice = () => {
      const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
      this.voice = vs.find((v) => /nl[-_]/i.test(v.lang)) || null;
    };
    if (window.speechSynthesis) {
      pickVoice();
      speechSynthesis.onvoiceschanged = pickVoice;
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  // ---- helpers ----------------------------------------------------------------
  out(pos) {
    // returns a node to connect a one-shot to (panned if positional)
    if (!pos || !this.listener) return this.master;
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.rolloffFactor = 1.2;
    p.maxDistance = 300;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y ?? 1.5;
      p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y ?? 1.5, pos.z);
    p.connect(this.master);
    return p;
  }
  env(gainNode, t, a, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }
  tone(freq, t, dur, peak, type = 'sine', dest = this.master, attack = 0.002) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }
  noiseBurst(t, dur, peak, filterType, freq, dest = this.master, q = 0.8) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.buf.white;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.003, peak, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.1);
    return f;
  }
  metal(t, f0, peak, decay, dest) {
    for (const [k, a] of [[1, 1], [2.02, 0.5], [2.76, 0.6], [3.93, 0.35], [5.4, 0.2]]) this.tone(f0 * k, t, decay * (1.2 - k * 0.1), peak * a, 'sine', dest);
  }

  // ---- one-shots ----------------------------------------------------------------
  bell(pos = null, f0 = 2150) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dest = this.out(pos);
    // rotary bell: two quick "trrring"s, each made of rapid strikes
    for (let r = 0; r < 2; r++)
      for (let k = 0; k < 4; k++) this.metal(t + r * 0.22 + k * 0.028, f0 * (1 + (Math.random() - 0.5) * 0.004), 0.09 * (1 - k * 0.15), 0.55, dest);
  }
  tramBell(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dest = this.out(pos);
    for (let k = 0; k < 2; k++) this.metal(t + k * 0.32, 880, 0.28, 0.9, dest);
  }
  honk(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dest = this.out(pos);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(dest);
    this.tone(415, t, 0.35, 0.12, 'sawtooth', lp, 0.01);
    this.tone(520, t, 0.35, 0.1, 'sawtooth', lp, 0.01);
  }
  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.5, 0.6, 'lowpass', 900);
    this.tone(70, t, 0.4, 0.5, 'sine');
    for (let k = 0; k < 6; k++) this.metal(t + 0.05 + Math.random() * 0.4, 600 + Math.random() * 1800, 0.05, 0.25);
  }
  splash() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.35;
    const f = this.noiseBurst(t, 1.3, 0.7, 'lowpass', 3000);
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    for (let k = 0; k < 14; k++) {
      const tt = t + 0.3 + Math.random() * 1.6;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(300 + Math.random() * 500, tt);
      o.frequency.exponentialRampToValueAtTime(900 + Math.random() * 700, tt + 0.06);
      this.env(g, tt, 0.005, 0.05, 0.07);
      o.connect(g).connect(this.master);
      o.start(tt);
      o.stop(tt + 0.12);
    }
  }
  bump(strength = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(90, t, 0.12, clamp(0.1 + strength * 0.05, 0, 0.5), 'sine');
    this.noiseBurst(t, 0.06, clamp(0.05 + strength * 0.04, 0, 0.3), 'bandpass', 1200);
    this.metal(t, 1400, 0.015 * strength, 0.15);
  }
  squeal() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(3100, t);
    o.frequency.linearRampToValueAtTime(3300, t + 0.4);
    const g = this.ctx.createGain();
    this.env(g, t, 0.05, 0.025, 0.45);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.6);
  }
  click() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.03, 0.15, 'highpass', 3000);
    this.tone(1800, t, 0.03, 0.05, 'square');
  }
  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(880, t, 0.5, 0.07);
    this.tone(1318, t + 0.12, 0.7, 0.06);
  }
  coin() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(1046, t, 0.12, 0.08, 'triangle');
    this.tone(1568, t + 0.08, 0.3, 0.08, 'triangle');
  }
  fine() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(330, t, 0.3, 0.1, 'square');
    this.tone(247, t + 0.25, 0.5, 0.1, 'square');
  }
  /** Westertoren-style carillon. */
  carillon(pos, quarter, hourStrikes) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dest = this.out(pos);
    const melody = [784, 659, 698, 523, 587, 784, 698, 659, 523, 587, 659, 523];
    const n = quarter === 0 ? 12 : quarter * 3;
    for (let i = 0; i < n; i++) this.metal(t + i * 0.32, melody[i % melody.length], 0.35, 1.4, dest);
    for (let i = 0; i < hourStrikes; i++) this.metal(t + n * 0.32 + 1 + i * 1.6, 196, 0.6, 2.8, dest);
  }
  bird() {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = 2800 + Math.random() * 2500;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.11;
      o.frequency.setValueAtTime(f, tt);
      o.frequency.exponentialRampToValueAtTime(f * (1.2 + Math.random() * 0.4), tt + 0.06);
    }
    this.env(g, t, 0.01, 0.018, n * 0.11);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + n * 0.11 + 0.1);
  }
  gull() {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.28;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      const g = this.ctx.createGain();
      const lp = this.ctx.createBiquadFilter();
      lp.frequency.value = 2200;
      o.frequency.setValueAtTime(1500, tt);
      o.frequency.exponentialRampToValueAtTime(900, tt + 0.22);
      this.env(g, tt, 0.02, 0.02, 0.22);
      o.connect(lp).connect(g).connect(this.master);
      o.start(tt);
      o.stop(tt + 0.3);
    }
  }
  say(text, rate = 1.1) {
    if (!window.speechSynthesis || !this.enabled || !this.ctx) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.lang = this.voice ? this.voice.lang : 'nl-NL';
      u.rate = rate;
      u.volume = 0.55 * this.volume;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      /* speech not available */
    }
  }

  // ---- continuous ---------------------------------------------------------------
  update(dt, s) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // listener
    const L = ctx.listener;
    const c = s.camera;
    const fwd = s.camFwd;
    if (L.positionX) {
      L.positionX.setTargetAtTime(c.x, t, 0.02);
      L.positionY.setTargetAtTime(c.y, t, 0.02);
      L.positionZ.setTargetAtTime(c.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      L.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(c.x, c.y, c.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
    this.listener = true;
    const v = s.speed;
    const k = (p, val, tc = 0.08) => p.setTargetAtTime(val, t, tc);
    // tyres: brighter on asphalt, rumbly on klinkers
    const rough = s.roughness ?? 0.3;
    k(this.roll.bp.frequency, 260 + rough * 500 + v * 40);
    k(this.roll.gain.gain, s.riding ? clamp(v / 9, 0, 1) * (0.05 + rough * 0.09) * (1 + s.wet * 0.8) : 0);
    k(this.rumbleOsc.frequency, Math.max(1, v / 0.21));
    k(this.rumbleDepth.gain, rough * 0.9);
    // wind noise grows with air speed
    const air = Math.max(0, s.airSpeed);
    k(this.windN.lp.frequency, 180 + air * 70);
    k(this.windN.gain.gain, clamp((air / 12) ** 2, 0, 1) * 0.45 + s.windSpeed * 0.004);
    // rain
    k(this.rainN.gain.gain, s.rain * 0.22);
    // city ambience quieter at night
    k(this.city.gain.gain, (0.045 + s.trafficNear * 0.02) * (1 - s.night * 0.6));
    // freewheel tick when coasting
    const coasting = s.riding && !s.pedalling && v > 0.6;
    k(this.tick.osc.frequency, Math.max(1, (v / 2.2) * 24));
    k(this.tick.gain.gain, coasting ? 0.012 : 0, 0.03);
    // tram rumble
    k(this.tramN.gain.gain, clamp(1 - s.tramDist / 60, 0, 1) * 0.35);
    // random ambience
    this.nextBird -= dt;
    if (this.nextBird < 0) {
      this.nextBird = 2 + Math.random() * 7;
      if (s.night < 0.5 && s.rain < 0.3) this.bird();
    }
    this.nextGull -= dt;
    if (this.nextGull < 0) {
      this.nextGull = 8 + Math.random() * 20;
      if (s.nearIJ || Math.random() < 0.25) this.gull();
    }
    if (s.rain > 0.1) {
      this.nextDrop -= dt;
      if (this.nextDrop < 0) {
        this.nextDrop = 0.02 + Math.random() * 0.15 / s.rain;
        this.noiseBurst(t, 0.015, 0.04 * s.rain, 'bandpass', 2500 + Math.random() * 3000);
      }
    }
  }
}
