// Wheelie City — sound. Engines are synthesised sample by sample (AudioWorklet), everything else with Web Audio nodes.
'use strict';
let muted = false;

// ---- engine generator (runs inside the AudioWorklet, or on the main thread as a fallback)
const ENGINE_GEN = String.raw`
class EngineGen {
  constructor(sr, cfg) {
    this.sr = sr; this.cfg = cfg || { type: 'e' };
    this.p = { rpm: 1000, thr: 0, speed: 0, on: 0, lim: 0, gas: 0 };
    this.tg = Object.assign({}, this.p);
    this.ph1 = 0; this.ph2 = 0; this.ph3 = 0; this.phC = 0; this.phP = 0;
    this.f = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    this.phase = 0; this.env = 0; this.pop = 0; this.jit = 0;
    this.N = Math.ceil(sr / 30); this.dl = new Float32Array(this.N); this.di = 0; this.lpd = 0;
    this.m1 = 0; this.m2 = 0; this.dcx = 0; this.dcy = 0; this.vol = 0;
    this.seed = 22222;
  }
  rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  set(p) { for (const k in p) this.tg[k] = p[k]; }
  bp(i, x, f, Q) {           // biquad band-pass, state slot i
    const s = this.f[i], w = 6.283185 * Math.min(f, this.sr * 0.45) / this.sr, al = Math.sin(w) / (2 * Q), a0 = 1 + al;
    const y = (al * x - al * s[1] + 2 * Math.cos(w) * s[2] - (1 - al) * s[3]) / a0;
    s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y;
    return y;
  }
  render(out, n) {
    const c = this.cfg, p = this.p, tg = this.tg, sr = this.sr;
    const k = 0.25;
    for (const key in tg) p[key] += (tg[key] - p[key]) * (key === 'rpm' ? 0.35 : k);
    const volT = p.on > 0.5 ? 1 : 0;
    if (c.type === 'e') {
      const wheelRps = p.speed / (6.2832 * c.R), motorRps = wheelRps * c.ratio;
      const f1 = motorRps * c.poles, f2 = motorRps * c.mesh, fc = wheelRps * c.chain, fk = wheelRps * 36;
      const spin = Math.min(1, p.speed / 2.5), thr = p.thr;
      const a1 = spin * (0.07 + 0.36 * thr), a2 = spin * (0.025 + 0.2 * thr), aC = Math.min(1, p.speed / 6) * (0.05 + 0.05 * thr);
      const aK = (c.knobby ? 0.11 : 0.05) * Math.min(1, p.speed / 12), aP = thr * Math.max(0, 1 - spin * 0.8) * 0.03;
      for (let i = 0; i < n; i++) {
        this.vol += (volT - this.vol) * 0.0015;
        this.ph1 += 6.2832 * f1 * (1 + 0.004 * Math.sin(this.phP * 37)) / sr; if (this.ph1 > 6.2832) this.ph1 -= 6.2832;
        this.ph2 += 6.2832 * f2 / sr; if (this.ph2 > 6.2832) this.ph2 -= 6.2832;
        this.phC += 6.2832 * fc / sr; if (this.phC > 6.2832) this.phC -= 6.2832;
        this.phP += 1 / sr;
        const nz = this.rnd() * 2 - 1;
        let s = a1 * (Math.sin(this.ph1) + 0.38 * Math.sin(2 * this.ph1) + 0.14 * Math.sin(3 * this.ph1 + 0.5));
        s += a2 * (Math.sin(this.ph2) + 0.2 * Math.sin(2 * this.ph2));
        const pc = Math.max(0, Math.sin(this.phC)); const pulse = pc * pc * pc * pc * pc * pc * pc * pc;
        s += aC * 3.2 * this.bp(0, nz, 2300, 0.9) * pulse;
        s += aK * 3.5 * this.bp(1, nz, Math.max(60, fk), 5);
        s += aP * (Math.sin(this.ph3 += 6.2832 * 3150 / sr) + 0.5 * Math.sin(this.ph3 * 2));
        if (this.ph3 > 6283.2) this.ph3 -= 6283.2;
        out[i] = Math.tanh(s * 1.7) * 0.85 * this.vol;
      }
    } else {
      const two = c.stroke === 2, ff = Math.max(5, p.rpm / 60 * (two ? 1 : 0.5) * (c.cyl || 1));
      const frac = p.rpm / c.redline, thr = p.thr;
      const D = Math.max(2, Math.min(this.N - 1, Math.round(sr / c.pipe)));
      const fb = two ? 0.74 : 0.62;
      const fm = c.muffle * (0.55 + 0.9 * thr + 0.3 * frac), km = 1 - Math.exp(-6.2832 * fm / sr);
      const decay = Math.exp(-1 / (sr * Math.max(0.0006, 0.16 / ff)));
      for (let i = 0; i < n; i++) {
        this.vol += (volT - this.vol) * 0.0015;
        this.phase += ff / sr * (1 + this.jit);
        if (this.phase >= 1) {
          this.phase -= 1;
          let a = 0.2 + 0.8 * thr;
          if (p.lim > 0.5 && this.rnd() < 0.55) a = 0.04;
          if (thr < 0.06 && frac > 0.4 && this.rnd() < (two ? 0.04 : 0.09)) this.pop = 1;
          a *= 0.82 + 0.36 * this.rnd();
          this.env = a; this.jit = (this.rnd() - 0.5) * (two ? 0.03 : frac < 0.25 ? 0.12 : 0.05);
        }
        const nz = this.rnd() * 2 - 1;
        const e = this.env * (0.75 + 0.45 * nz); this.env *= decay;
        let pp = 0; if (this.pop > 0.001) { pp = this.pop * nz * 1.6; this.pop *= 0.9985; }
        const del = this.dl[(this.di - D + this.N) % this.N];
        this.lpd += (del - this.lpd) * 0.55;
        const y = e + pp + fb * this.lpd;
        this.dl[this.di] = y; this.di = (this.di + 1) % this.N;
        this.m1 += (y - this.m1) * km; this.m2 += (this.m1 - this.m2) * km;
        let s = this.m2 * 1.4 + y * (two ? 0.12 : 0.07);
        if (two) s += this.bp(0, e, 1750 + frac * 900, 18) * (0.5 - 0.35 * thr);     // ring-ding of the expansion chamber
        else s += this.bp(0, e, 480 + frac * 300, 6) * 0.25;                          // intake honk
        s += this.bp(1, nz, 700 + 900 * frac, 1.2) * 0.04 * thr * frac;               // intake roar
        if (!two) { const tick = this.phase < 0.03 ? 1 : 0; s += this.bp(2, nz, 5200, 3) * 0.015 * tick; }
        // DC blocker and saturation
        const dc = s - this.dcx + 0.995 * this.dcy; this.dcx = s; this.dcy = dc;
        out[i] = Math.tanh(dc * (c.drive || 2.2)) * 0.7 * this.vol;
      }
    }
  }
}`;
const WORKLET_SRC = ENGINE_GEN + `
registerProcessor('wc-engine', class extends AudioWorkletProcessor {
  constructor(o) { super(); this.g = new EngineGen(sampleRate, o.processorOptions); this.port.onmessage = (e) => { if (e.data.cfg) this.g = new EngineGen(sampleRate, e.data.cfg); else this.g.set(e.data); }; }
  process(inp, out) { const o = out[0]; if (!o || !o[0]) return true; this.g.render(o[0], o[0].length); for (let c = 1; c < o.length; c++) o[c].set(o[0]); return true; }
});`;

const sfx = (() => {
  let ctx = null, master = null, noiseBuf = null, engine = null, engineGain = null, ready = false, pendingCfg = null;
  let windG, windF, buffG, rainG, scrapeG, scrapeF, slideG, skidG, skidTone, skidF, heliG, heliP, cityG;
  const sirens = [], traffic = [];
  function engineCfg() {
    const B = BIKES[bikeKey];
    if (B.type === 'e') return { type: 'e', R: B.R, ratio: B.motor.ratio, poles: B.motor.poles, mesh: B.motor.mesh, chain: B.motor.chain, knobby: B.knobby };
    return { type: 'gas', stroke: B.stroke, redline: B.engine.redline, pipe: B.engine.pipe, muffle: B.engine.muffle, cyl: B.engine.cyl, drive: B.stroke === 2 ? 2.6 : 2.1 };
  }
  function makeNoise() {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * 2); return s; }
  function filt(type, f, Q = 1) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; }
  function gain(v = 0) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function panner() {
    const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 6; p.maxDistance = 400; p.rolloffFactor = 1.1;
    return p;
  }
  function setPos(p, x, y, z) {
    if (p.positionX) { const t = ctx.currentTime; p.positionX.setTargetAtTime(x, t, 0.03); p.positionY.setTargetAtTime(y, t, 0.03); p.positionZ.setTargetAtTime(z, t, 0.03); }
    else p.setPosition(x, y, z);
  }
  function shaper(amount) {
    const ws = ctx.createWaveShaper(), n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount); }
    ws.curve = curve; return ws;
  }
  async function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; return; }
    master = gain(muted ? 0 : 0.7);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = makeNoise();
    // wind at speed, and helmet buffeting
    { const s = noiseSrc(); windF = filt('bandpass', 500, 0.6); windG = gain(); s.connect(windF); windF.connect(windG); windG.connect(master);
      const s2 = noiseSrc(), lp = filt('lowpass', 120, 0.8); buffG = gain(); s2.connect(lp); lp.connect(buffG); buffG.connect(master); }
    { const s = noiseSrc(), hp = filt('highpass', 2600); rainG = gain(); s.connect(hp); hp.connect(rainG); rainG.connect(master); }
    // city bed: distant traffic rumble
    { const s = noiseSrc(), lp = filt('lowpass', 260, 0.5); cityG = gain(); s.connect(lp); lp.connect(cityG); cityG.connect(master); }
    // bike scraping along asphalt, rider sliding, tyre skid
    { const s = noiseSrc(); scrapeF = filt('bandpass', 2600, 1.4); const sh = shaper(3); scrapeG = gain(); s.connect(scrapeF); scrapeF.connect(sh); sh.connect(scrapeG); scrapeG.connect(master); }
    { const s = noiseSrc(), lp = filt('lowpass', 500, 0.7); slideG = gain(); s.connect(lp); lp.connect(slideG); slideG.connect(master); }
    { const s = noiseSrc(); skidF = filt('bandpass', 1500, 7); skidG = gain(); s.connect(skidF); skidF.connect(skidG);
      skidTone = ctx.createOscillator(); skidTone.type = 'sawtooth'; skidTone.frequency.value = 1450; const tf = filt('bandpass', 1500, 5); const tg = gain(0.25); skidTone.connect(tf); tf.connect(tg); tg.connect(skidG); skidTone.start();
      skidG.connect(master); }
    // police sirens: three independent units
    const real = new Float32Array([0, 1, 0.06, 0.34, 0.04, 0.2, 0.03, 0.13, 0.02, 0.09, 0.01, 0.06]), imag = new Float32Array(real.length);
    const wave = ctx.createPeriodicWave(real, imag);
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(); o.setPeriodicWave(wave); o.frequency.value = 700;
      const sh = shaper(1.8), pk = filt('peaking', 1900, 1.2); pk.gain.value = 5;
      const lp = filt('lowpass', 7000, 0.7), g = gain(0), p = panner();
      o.connect(sh); sh.connect(pk); pk.connect(lp); lp.connect(g); g.connect(p); p.connect(master); o.start();
      sirens.push({ o, g, p, lp, phase: Math.random() * 10, rate: 0.92 + Math.random() * 0.16, u: null });
    }
    // traffic: nearest cars get tyre roar + engine hum
    for (let i = 0; i < 3; i++) {
      const s = noiseSrc(), lp = filt('lowpass', 500, 0.7), hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 50;
      const hl = filt('lowpass', 220, 0.9), hg = gain(0.4), g = gain(0), p = panner();
      s.connect(lp); lp.connect(g); hum.connect(hl); hl.connect(hg); hg.connect(g); g.connect(p); p.connect(master); hum.start();
      traffic.push({ g, p, hum, lp });
    }
    // helicopter: blade slap (pulsed noise) + turbine whine
    { const s = noiseSrc(), lp = filt('lowpass', 700, 0.8), amp = gain(0);
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 11; const sh = ctx.createWaveShaper(); const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 255 * 2 - 1; c[i] = x > 0.6 ? 1 : 0.08; } sh.curve = c;
      lfo.connect(sh); sh.connect(amp.gain); s.connect(lp); lp.connect(amp);
      const tw = ctx.createOscillator(); tw.frequency.value = 4800; const twg = gain(0.015);
      tw.connect(twg); twg.connect(amp);
      heliG = gain(0); heliP = panner(); amp.connect(heliG); heliG.connect(heliP); heliP.connect(master); lfo.start(); tw.start(); }
    // engine
    engineGain = gain(0.9); engineGain.connect(master);
    const cfg = engineCfg();
    try {
      if (!ctx.audioWorklet) throw new Error('no worklet');
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      engine = new AudioWorkletNode(ctx, 'wc-engine', { numberOfInputs: 0, outputChannelCount: [1], processorOptions: pendingCfg || cfg });
      engine.post = (m) => engine.port.postMessage(m);
    } catch {
      // Fallback: run the same generator on the main thread
      const Gen = new Function(ENGINE_GEN + '; return EngineGen;')();
      const sp = ctx.createScriptProcessor(1024, 0, 1); let gen = new Gen(ctx.sampleRate, pendingCfg || cfg);
      sp.onaudioprocess = (ev) => gen.render(ev.outputBuffer.getChannelData(0), ev.outputBuffer.length);
      sp.post = (m) => { if (m.cfg) gen = new Gen(ctx.sampleRate, m.cfg); else gen.set(m); };
      engine = sp;
    }
    engine.connect(engineGain);
    ready = true;
  }
  function setBike() { const cfg = engineCfg(); pendingCfg = cfg; if (engine) engine.post({ cfg }); }
  const tmpV = new THREE.Vector3(), tmpU = new THREE.Vector3();
  function listener() {
    const L = ctx.listener, p = camera.position;
    camera.getWorldDirection(tmpV); tmpU.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if (L.positionX) {
      const t = ctx.currentTime;
      L.positionX.setTargetAtTime(p.x, t, 0.02); L.positionY.setTargetAtTime(p.y, t, 0.02); L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(tmpV.x, t, 0.02); L.forwardY.setTargetAtTime(tmpV.y, t, 0.02); L.forwardZ.setTargetAtTime(tmpV.z, t, 0.02);
      L.upX.setTargetAtTime(tmpU.x, t, 0.02); L.upY.setTargetAtTime(tmpU.y, t, 0.02); L.upZ.setTargetAtTime(tmpU.z, t, 0.02);
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(tmpV.x, tmpV.y, tmpV.z, tmpU.x, tmpU.y, tmpU.z); }
  }
  // Siren sweep: wail (slow rise and fall) far away, yelp (fast) when close
  function sirenFreq(s, t, yelp) {
    const lo = 640, hi = 1460;
    if (yelp) { const x = ((t * 3.1 * s.rate + s.phase) % 1 + 1) % 1; return lo + (hi - lo) * (x < 0.5 ? x * 2 : 2 - x * 2); }
    const per = 4.6 / s.rate, x = (((t + s.phase) % per) + per) % per / per;
    return x < 0.55 ? lo + (hi - lo) * Math.sin(x / 0.55 * Math.PI / 2) : hi - (hi - lo) * (1 - Math.cos((x - 0.55) / 0.45 * Math.PI / 2));
  }
  function update(dt) {
    if (!ctx || !ready) return;
    const t = ctx.currentTime, play = state === 'play', live = play && !S.crashed && !S.riding;
    listener();
    const v = live ? S.v : 0;
    engine.post({ rpm: S.rpm || 0, thr: live ? S.thr : 0, speed: v, on: live || (state === 'menu') ? 1 : 0, lim: S.limiter ? 1 : 0 });
    engineGain.gain.setTargetAtTime(state === 'menu' ? 0.35 : 0.9, t, 0.2);
    windG.gain.setTargetAtTime(live ? Math.min(0.5, v * v * 0.0009) : 0, t, 0.15);
    windF.frequency.setTargetAtTime(300 + v * 35, t, 0.2);
    buffG.gain.setTargetAtTime(live ? Math.min(0.5, Math.max(0, v - 14) * 0.03) * (0.6 + 0.4 * Math.random()) : 0, t, 0.05);
    rainG.gain.setTargetAtTime(play ? 0.07 * WX.rain : 0, t, 0.3);
    cityG.gain.setTargetAtTime(play ? 0.05 : 0, t, 0.5);
    scrapeG.gain.setTargetAtTime(S.scrape || 0, t, 0.04); scrapeF.frequency.setTargetAtTime(1800 + Math.random() * 1600, t, 0.02);
    slideG.gain.setTargetAtTime(S.bodySlide || 0, t, 0.05);
    skidG.gain.setTargetAtTime(S.skid || 0, t, 0.04); skidTone.frequency.setTargetAtTime(1350 + Math.random() * 220, t, 0.015);
    // sirens: assign to the nearest chasing units
    const cops = play ? units.filter((u) => u.on && u.chasing).sort((a, b) => Math.hypot(a.x - S.x, a.z - S.z) - Math.hypot(b.x - S.x, b.z - S.z)) : [];
    sirens.forEach((s, i) => {
      const u = cops[i];
      if (!u) { s.g.gain.setTargetAtTime(0, t, 0.2); return; }
      const d = Math.hypot(u.x - S.x, u.z - S.z), yelp = d < 50;
      // Doppler: closing speed along the line between cop and listener
      const vx = Math.sin(u.yaw) * u.v - Math.sin(S.psi) * S.v, vz = Math.cos(u.yaw) * u.v - Math.cos(S.psi) * S.v;
      const vr = d > 0.1 ? -(vx * (u.x - S.x) + vz * (u.z - S.z)) / d : 0;
      const f = sirenFreq(s, t, yelp) * 343 / (343 - clamp(vr, -60, 60));
      s.o.frequency.setTargetAtTime(f, t, 0.012);
      s.lp.frequency.setTargetAtTime(9000 / (1 + d / 80), t, 0.1);
      s.g.gain.setTargetAtTime(0.32, t, 0.1);
      setPos(s.p, u.x, 1.6, u.z);
    });
    // traffic near you
    const cars = play ? units.filter((u) => u.on && u.kind === 'car').sort((a, b) => Math.hypot(a.x - S.x, a.z - S.z) - Math.hypot(b.x - S.x, b.z - S.z)) : [];
    traffic.forEach((tr, i) => {
      const u = cars[i];
      if (!u) { tr.g.gain.setTargetAtTime(0, t, 0.3); return; }
      tr.g.gain.setTargetAtTime(0.06 + Math.min(0.25, u.v * 0.012), t, 0.2);
      tr.lp.frequency.setTargetAtTime(250 + u.v * 40, t, 0.2);
      tr.hum.frequency.setTargetAtTime(38 + u.v * 3.2, t, 0.2);
      setPos(tr.p, u.x, 0.6, u.z);
    });
    const hOn = play && heli && heli.on;
    heliG.gain.setTargetAtTime(hOn ? 0.9 : 0, t, 0.3);
    if (hOn) setPos(heliP, heli.x, heli.y, heli.z);
  }
  // ---- one-shots
  function env(node, peak, attack, decay, t0) { const g = gain(0); const t = t0 ?? ctx.currentTime; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay); node.connect(g); return g; }
  function noiseHit(type, f, Q, peak, attack, decay, out, t0) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const fl = filt(type, f, Q); s.connect(fl); const g = env(fl, peak, attack, decay, t0); g.connect(out || master); const t = t0 ?? ctx.currentTime; s.start(t, Math.random() * 2); s.stop(t + attack + decay + 0.05); return fl; }
  function tone(type, f0, f1, peak, attack, decay, out, t0) { const o = ctx.createOscillator(); o.type = type; const t = t0 ?? ctx.currentTime; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay); const g = env(o, peak, attack, decay, t); g.connect(out || master); o.start(t); o.stop(t + attack + decay + 0.05); }
  const can = () => ctx && ready && !muted;
  return {
    init, update, setBike,
    thump(s) { if (!can()) return; tone('sine', 90, 45, 0.35 + 0.5 * s, 0.004, 0.2); noiseHit('lowpass', 300, 0.7, 0.2 * s, 0.002, 0.08); },
    pop() { if (!can()) return; tone('sine', 160, 90, 0.18, 0.003, 0.09); },
    // on foot: a pistol shot (crack, body and a short tail off the buildings), a swing through the air, the till
    gun() {
      if (!can()) return;
      noiseHit('highpass', 2500, 0.7, 0.9, 0.001, 0.05); noiseHit('lowpass', 1400, 0.8, 1.0, 0.001, 0.22);
      tone('sine', 140, 45, 0.7, 0.001, 0.16); noiseHit('bandpass', 700, 1.2, 0.18, 0.02, 0.6);
    },
    swing() { if (!can()) return; const f = noiseHit('bandpass', 900, 1.6, 0.16, 0.03, 0.11); f.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.12); },
    cash() { if (!can()) return; const t = ctx.currentTime; tone('triangle', 1320, null, 0.12, 0.002, 0.12, null, t); tone('triangle', 1760, null, 0.12, 0.002, 0.25, null, t + 0.09); },
    shift() { if (!can()) return; noiseHit('bandpass', 900, 3, 0.05, 0.002, 0.03); },
    bodyHit(s) { if (!can()) return; tone('sine', 110, 38, 0.5 * s + 0.15, 0.003, 0.28); noiseHit('lowpass', 420, 0.8, 0.45 * s, 0.002, 0.14); },
    metal(s) {
      if (!can()) return;
      const sh = shaper(4), g = gain(0.55 * s); sh.connect(g); g.connect(master);
      for (let i = 0; i < 5; i++) noiseHit('bandpass', 600 + Math.random() * 2600, 9 + Math.random() * 8, 0.9, 0.002, 0.18 + Math.random() * 0.5, sh);
      tone('triangle', 260 + Math.random() * 160, 150, 0.25 * s, 0.002, 0.4);
      noiseHit('lowpass', 1800, 0.7, 0.7 * s, 0.002, 0.25);
    },
    plastic(s) { if (!can()) return; const t = ctx.currentTime; for (let i = 0; i < 6; i++) noiseHit('highpass', 1800 + Math.random() * 2500, 0.9, 0.35 * s, 0.001, 0.012 + Math.random() * 0.02, null, t + Math.random() * 0.16); },
    glass(s) {
      if (!can()) return;
      const t = ctx.currentTime;
      noiseHit('highpass', 3500, 0.8, 0.5 * s, 0.001, 0.22);
      for (let i = 0; i < 26; i++) { const t0 = t + Math.random() * 0.7 * Math.random(); tone('sine', 2600 + Math.random() * 5200, null, 0.05 + Math.random() * 0.08 * s, 0.001, 0.03 + Math.random() * 0.12, null, t0); }
    },
    splash() {
      if (!can()) return;
      const t = ctx.currentTime;
      const fl = noiseHit('lowpass', 3000, 0.8, 0.8, 0.01, 0.9);
      fl.frequency.setValueAtTime(3500, t); fl.frequency.exponentialRampToValueAtTime(260, t + 0.9);
      for (let i = 0; i < 14; i++) { const t0 = t + 0.1 + Math.random() * 1.2; tone('sine', 300 + Math.random() * 300, 900 + Math.random() * 700, 0.06, 0.003, 0.05, null, t0); }
    },
    crash(kind, s) {
      if (!can()) return;
      s = clamp(s, 0.25, 1.3);
      this.bodyHit(s); this.plastic(s);
      if (kind === 'car' || kind === 'wall' || kind === 'pole') this.metal(kind === 'car' ? s * 1.1 : s * 0.8);
      if (kind === 'car') this.glass(s);
    },
    horn(u) {
      if (!can()) return;
      const p = panner(); setPos(p, u.x, 1, u.z); p.connect(master);
      const sh = shaper(2.5), bp = filt('bandpass', 1300, 0.7); sh.connect(bp);
      const g = env(bp, 0.35, 0.01, 0.38); g.connect(p);
      for (const f of [415, 495]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * (0.98 + Math.random() * 0.04); o.connect(sh); o.start(); o.stop(ctx.currentTime + 0.45); }
    },
    whoop(u) {   // short siren "bloop" when a cop lights you up
      if (!can()) return;
      const p = panner(); setPos(p, u.x, 1.6, u.z); p.connect(master);
      const o = ctx.createOscillator(); o.type = 'square'; const t = ctx.currentTime;
      o.frequency.setValueAtTime(500, t); o.frequency.exponentialRampToValueAtTime(1400, t + 0.25); o.frequency.exponentialRampToValueAtTime(600, t + 0.5);
      const bp = filt('bandpass', 1500, 0.8); o.connect(bp); const g = env(bp, 0.25, 0.02, 0.5); g.connect(p); o.start(t); o.stop(t + 0.6);
    },
    // fare gate accepting your card
    beep() { if (!can()) return; const t = ctx.currentTime; tone('sine', 1760, null, 0.16, 0.004, 0.09, null, t); tone('sine', 2350, null, 0.12, 0.004, 0.12, null, t + 0.1); },
    // doors-opening chime: three falling notes
    chime() { if (!can()) return; const t = ctx.currentTime; [[988, 0], [784, 0.28], [659, 0.56]].forEach(([f, dt]) => tone('sine', f, null, 0.13, 0.01, 0.55, null, t + dt)); },
    setMuted(m) { if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ctx.currentTime, 0.05); },
    get ready() { return ready; },
  };
})();
function toggleMute() { muted = !muted; sfx.setMuted(muted); popup(muted ? 'Sound off' : 'Sound on'); }
