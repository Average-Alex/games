// Wheelie City — street life: pedestrians on the sidewalks, and trains on the real transit lines you can ride.
'use strict';

// ---------------------------------------------------------------- pedestrians
const PED = (() => {
  // body parts built around their pivots: legs and arms swing from hip and shoulder
  // lathe profiles [radius, height]: tapered, rounded limbs and a shaped torso instead of boxes
  const lat = (pts, seg = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const leg = merge([lat([[0.0, -0.86], [0.045, -0.85], [0.05, -0.7], [0.062, -0.55], [0.058, -0.45], [0.072, -0.38], [0.085, -0.15], [0.088, 0], [0.0, 0.02]])]);
  const shoe = new THREE.SphereGeometry(1, 10, 6); shoe.scale(0.065, 0.05, 0.13); shoe.translate(0, -0.86, 0.045);
  const arm = merge([lat([[0.0, -0.6], [0.04, -0.59], [0.045, -0.4], [0.05, -0.3], [0.056, -0.12], [0.055, 0], [0.0, 0.03]], 10)]);
  const hand = new THREE.SphereGeometry(1, 8, 6); hand.scale(0.04, 0.06, 0.035); hand.translate(0, -0.64, 0.01);
  const torso = lat([[0.165, 0.92], [0.17, 1.02], [0.18, 1.18], [0.2, 1.36], [0.205, 1.45], [0.175, 1.53], [0.08, 1.57], [0.0, 1.58]], 16); torso.scale(1.12, 1, 0.64);
  const neck = new THREE.CylinderGeometry(0.048, 0.056, 0.12, 8); neck.translate(0, 1.6, 0);
  const head = new THREE.SphereGeometry(0.115, 14, 10); head.scale(0.88, 1.08, 0.97); head.translate(0, 1.74, 0.01);
  const nose = new THREE.SphereGeometry(0.02, 6, 4); nose.scale(0.8, 1, 1.2); nose.translate(0, 1.73, 0.12);
  const hair = new THREE.SphereGeometry(0.122, 14, 8, 0, TAU, 0, Math.PI * 0.55); hair.scale(0.9, 1.05, 1); hair.translate(0, 1.76, -0.005);
  const hips = lat([[0.0, 0.84], [0.16, 0.86], [0.18, 0.95], [0.165, 1.04]], 16); hips.scale(1.15, 1, 0.7);
  return { leg, shoe, arm, hand, torso, neck, head: merge([head, nose]), hair, hips };
})();
const PED_SKIN = ['#f1c9a5', '#e0ac85', '#c68a5e', '#9a6440', '#6e4428', '#f5d6bd'];
const PED_TOP = ['#2c3e66', '#8a1c2a', '#e8e4dc', '#2a2a2e', '#3f6b3a', '#d8a028', '#6a3a7a', '#1f7a8a', '#c85a2a', '#7d8590', '#e05a8a'];
const PED_LEGS = ['#1f2533', '#3a3a3e', '#2a3a5a', '#5a4a3a', '#14161a', '#7a7466', '#28324a'];
const PED_HAIR = ['#1a1410', '#3a2618', '#6a4a2a', '#b08a4a', '#8a8a8a', '#2a1a10'];
const pedMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const peds = [];
function colorGeo(geo, hex) {
  const g = geo.clone(), c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function mergeColored(parts) {
  const geos = parts.map(([geo, hex]) => colorGeo(geo.index ? geo.toNonIndexed() : geo, hex));
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { const k = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += k; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
function buildPeds() {
  for (const p of peds) { scene.remove(p.g); p.g.traverse((o) => o.geometry && o.geometry.dispose()); }
  peds.length = 0;
  const N = quality === 'low' ? 14 : quality === 'high' ? 40 : 28;
  for (let i = 0; i < N; i++) {
    const r = mulberry(i * 977 + 13), skin = pick(r, PED_SKIN), top = pick(r, PED_TOP), legs = pick(r, PED_LEGS), hair = pick(r, PED_HAIR);
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    body.add(new THREE.Mesh(mergeColored([[PED.torso, top], [PED.hips, legs], [PED.neck, skin], [PED.head, skin], [PED.hair, hair]]), pedMat));
    const limb = (geo, hand, hex, x, y) => { const pv = new THREE.Group(); pv.position.set(x, y, 0); pv.add(new THREE.Mesh(mergeColored([[geo, hex], [hand, hand === PED.shoe ? '#222' : skin]]), pedMat)); body.add(pv); return pv; };
    const legL = limb(PED.leg, PED.shoe, legs, 0.1, 0.9), legR = limb(PED.leg, PED.shoe, legs, -0.1, 0.9);
    const armL = limb(PED.arm, PED.hand, top, 0.245, 1.5), armR = limb(PED.arm, PED.hand, top, -0.245, 1.5);
    const sc = 0.9 + r() * 0.2; g.scale.setScalar(sc);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.visible = false; scene.add(g);
    peds.push({ g, body, legL, legR, armL, armR, on: false, x: 0, z: 0, yaw: 0, phase: r() * TAU, knock: null, dodge: 0, hitCd: 0 });
  }
}
const pedEdge = (e) => { const R = RC[MAP.eCls[e]]; return R.walk || R.path; };
function spawnPed(p) {
  for (let tries = 0; tries < 10; tries++) {
    const a = Math.random() * TAU, d = 30 + Math.random() * 110, x = S.x + Math.sin(a) * d, z = S.z + Math.cos(a) * d;
    const q = roadQuery(x, z, 30, pedEdge); if (q.e < 0) continue;
    const R = RC[MAP.eCls[q.e]];
    Object.assign(p, { on: true, e: q.e, s: q.s, dir: Math.random() < 0.5 ? 1 : -1, side: Math.random() < 0.5 ? 1 : -1, v: 1.1 + Math.random() * 0.6, knock: null, dodge: 0, idle: Math.random() < 0.12 ? 4 + Math.random() * 10 : 0 });
    p.off = R.path ? (Math.random() - 0.5) * 1.2 : MAP.eHW[q.e] + 1.0 + Math.random() * 1.0;
    pedPlace(p);
    if (buildingAt(p.x, p.z, 0.3) >= 0 || hitAt(p.x, p.z, 0.3)) continue;
    p.g.visible = true; p.g.position.set(p.x, p.off > 1.5 ? CURB : 0.03, p.z); p.g.rotation.set(0, p.yaw, 0);
    return true;
  }
  return false;
}
function pedPlace(p) {
  edgePoint(p.e, p.s, EP);
  const nx = -EP.tz, nz = EP.tx, o = p.off * p.side + p.dodge;
  p.x = EP.x + nx * o; p.z = EP.z + nz * o; p.yaw = Math.atan2(EP.tx * p.dir, EP.tz * p.dir);
}
function updatePeds(d) {
  if (!MAP) return;
  const want = peds.length, bx = S.x, bz = S.z, fx = Math.sin(S.psi), fz = Math.cos(S.psi);
  let active = 0;
  for (const p of peds) {
    if (!p.on) continue;
    active++;
    const dist = Math.hypot(p.x - bx, p.z - bz);
    if (dist > 180 && !p.knock) { p.on = false; p.g.visible = false; continue; }
    p.hitCd -= d;
    if (p.knock) {
      // knocked flying: tumble, land, lie there a moment, get up angry
      const k = p.knock;
      k.vy -= G * d; p.x += k.vx * d; p.z += k.vz * d; k.y += k.vy * d;
      if (k.y < 0) { k.y = 0; if (k.vy < -2) sfx.bodyHit(Math.min(1, -k.vy / 8)); k.vy = Math.abs(k.vy) * 0.25; k.vx *= 0.55; k.vz *= 0.55; k.spin *= 0.5; if (Math.hypot(k.vx, k.vz) < 0.3) k.down += d; }
      k.rot += k.spin * d;
      p.g.position.set(p.x, k.y + 0.15, p.z);
      p.body.rotation.x = k.y > 0.05 ? k.rot : lerp(p.body.rotation.x, -Math.PI / 2, Math.min(1, d * 6));
      p.armL.rotation.x = Math.sin(k.rot * 3) * 1.4; p.armR.rotation.x = -Math.sin(k.rot * 3) * 1.4;
      if (k.down > 3) { p.knock = null; p.body.rotation.x = 0; snapPed(p); say(p, pick(Math.random, PED_CURSES), false); }
      continue;
    }
    // look out for the bike: step aside if it's coming at you
    const rx = p.x - bx, rz = p.z - bz, closing = -(rx * fx + rz * fz) < 0;
    if (!S.crashed && S.v > 3 && dist < 8 && closing) {
      const lat = -rx * fz + rz * fx, away = lat >= 0 ? 1 : -1;
      const nx = -Math.cos(p.yaw), nz = Math.sin(p.yaw);   // ped's right in world
      void nx; void nz;
      p.dodge += clamp(away * 1.8 * p.side - p.dodge, -d * 6, d * 6);
      if (!p.yelled && dist < 5) { p.yelled = true; if (Math.random() < 0.4) say(p, pick(Math.random, PED_DODGE), false); }
    } else { p.dodge *= Math.exp(-d * 0.8); if (dist > 12) p.yelled = false; }
    // walk the sidewalk, turning at junctions
    if (p.idle > 0) p.idle -= d;
    else {
      p.s += p.v * p.dir * d;
      const L = MAP.eLen[p.e];
      if (p.s > L || p.s < 0) {
        const node = p.s > L ? MAP.eB[p.e] : MAP.eA[p.e];
        const opts = [];
        for (let k = MAP.adjS[node]; k < MAP.adjS[node + 1]; k++) { const ent = MAP.adj[k], e2 = ent >> 1; if (e2 !== p.e && pedEdge(e2)) opts.push(ent); }
        if (opts.length) {
          const ent = opts[Math.floor(Math.random() * opts.length)], e2 = ent >> 1, fromA = (ent & 1) === 0;
          const keepSide = p.side * (p.dir > 0 ? 1 : -1);
          p.e = e2; p.dir = fromA ? 1 : -1; p.s = fromA ? 0.2 : MAP.eLen[e2] - 0.2;
          p.side = keepSide * p.dir;
          const R = RC[MAP.eCls[e2]]; p.off = R.path ? (Math.random() - 0.5) * 1.2 : MAP.eHW[e2] + 1.0 + Math.random();
        } else { p.dir = -p.dir; p.s = clamp(p.s, 0, L); }
      }
    }
    pedPlace(p);
    if (buildingAt(p.x, p.z, 0.15) >= 0) { p.dir = -p.dir; p.s += p.dir * 0.5; pedPlace(p); }
    // walk cycle
    const walking = p.idle <= 0;
    p.phase += (walking ? p.v * 5.2 : 0) * d;
    const sw = walking ? Math.sin(p.phase) : 0;
    p.legL.rotation.x = sw * 0.55; p.legR.rotation.x = -sw * 0.55; p.armL.rotation.x = -sw * 0.45; p.armR.rotation.x = sw * 0.45;
    p.g.position.set(p.x, (p.off > 1.5 ? CURB : 0.03) + Math.abs(Math.cos(p.phase)) * 0.03 * (walking ? 1 : 0), p.z);
    p.g.rotation.y += wrapPi(p.yaw - p.g.rotation.y) * Math.min(1, d * 8);
    // getting hit
    if (!S.crashed && !S.riding && p.hitCd <= 0 && S.v > 1.5) {
      const B = BIKES[bikeKey], hx = S.x + fx * B.L * 0.5, hz = S.z + fz * B.L * 0.5;
      if (Math.hypot(p.x - hx, p.z - hz) < 0.75) hitPed(p);
    }
  }
  if (active < want && Math.random() < d * 4) { const p = peds.find((x) => !x.on); if (p) spawnPed(p); }
}
function snapPed(p) {
  const q = roadQuery(p.x, p.z, 30, pedEdge);
  if (q.e < 0) { p.on = false; p.g.visible = false; return; }
  p.e = q.e; p.s = q.s; p.dodge = 0; p.idle = 2;
  const R = RC[MAP.eCls[q.e]]; p.off = R.path ? 0 : MAP.eHW[q.e] + 1.4; p.side = q.side;
}
function hitPed(p) {
  const fx = Math.sin(S.psi), fz = Math.cos(S.psi), v = S.v;
  p.knock = { vx: fx * v * 0.75 + (Math.random() - 0.5) * 2, vz: fz * v * 0.75 + (Math.random() - 0.5) * 2, vy: 2 + v * 0.18, y: 0.1, rot: 0, spin: -(4 + v * 0.5), down: 0 };
  p.hitCd = 4;
  sfx.bodyHit(Math.min(1.2, v / 10)); flash(0.35); S.shake = Math.max(S.shake, reduceMotion ? 0 : 0.2);
  popup('Hit a pedestrian', 'bad');
  addHeat(1.2);     // somebody always calls it in
  if (v > 10) crash('Hit a pedestrian', 'pole');
  else S.v *= 0.45;
}
const PED_DODGE = ['Whoa!', 'Hey!', 'Watch it!', 'Sidewalk, buddy!', 'Seriously?!', 'Slow down!'];
const PED_CURSES = ['My LEG!!', 'Are you insane?!', 'I\'m calling the cops!', 'You hit me!!', 'Get back here!'];

// ---------------------------------------------------------------- trains
const CAR_LEN = 17.2, CAR_GAP = 0.6;
const LIVERY = {
  van: { body: '#f2f4f5', band: '#0057b8', band2: '#ffd200', cars: 4, v: 22 },
  la: { body: '#c9ccd0', band: '#c9a227', band2: '#0072bc', cars: 3, v: 20 },
  vegas: { body: '#2b6cb0', band: '#f2f2f2', band2: '#ffcc00', cars: 4, v: 18 },
  miami: { body: '#d9dcdf', band: '#f47b20', band2: '#2a9d4a', cars: 4, v: 20 },
  nyc: { body: '#b8bcc0', band: '#2a2d33', band2: '#e04040', cars: 6, v: 17 },
};
const trains = [];
let trainGeo = null;
function buildTrains() {
  for (const t of trains) scene.remove(t.g);
  trains.length = 0;
  const L = LIVERY[cityKey] || LIVERY.van;
  trainGeo = {
    body: mergeColored([[new THREE.BoxGeometry(2.7, 2.9, CAR_LEN).translate(0, 1.85, 0), L.body],
      [new THREE.BoxGeometry(2.74, 0.35, CAR_LEN - 0.2).translate(0, 1.05, 0), L.band],
      [new THREE.BoxGeometry(2.74, 0.1, CAR_LEN - 0.2).translate(0, 3.1, 0), L.band2],
      [new THREE.BoxGeometry(2.76, 0.95, CAR_LEN - 1.4).translate(0, 2.25, 0), '#1b2129'],
      [new THREE.BoxGeometry(2.2, 0.45, CAR_LEN - 2).translate(0, 0.35, 0), '#2a2c30']]),
    nose: mergeColored([[new THREE.BoxGeometry(2.5, 1.3, 0.1).translate(0, 2.3, 0), '#12161c'], [new THREE.BoxGeometry(0.5, 0.15, 0.08).translate(0.8, 1.4, 0), '#fff4d6'], [new THREE.BoxGeometry(0.5, 0.15, 0.08).translate(-0.8, 1.4, 0), '#fff4d6']]),
  };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45 });
  for (let k = 0; k < 6; k++) {
    const g = new THREE.Group(), cars = [];
    for (let c = 0; c < L.cars; c++) {
      const cg = new THREE.Group(), me = new THREE.Mesh(trainGeo.body, mat); me.castShadow = true; cg.add(me);
      if (c === 0 || c === L.cars - 1) { const nose = new THREE.Mesh(trainGeo.nose, mat); nose.position.z = (c === 0 ? 1 : -1) * (CAR_LEN / 2 + 0.03); if (c !== 0) nose.rotation.y = Math.PI; cg.add(nose); }
      g.add(cg); cars.push(cg);
    }
    g.visible = false; scene.add(g);
    trains.push({ g, cars, on: false, line: -1, s: 0, dir: 1, v: 0, dwell: 0, nextSt: null, mine: false });
  }
}
const TP = { px: 0, pz: 0, h: 0, dx: 0, dz: 1 };
function placeTrain(t) {
  const ln = MAP.lines[t.line], L = LIVERY[cityKey] || LIVERY.van;
  for (let c = 0; c < t.cars.length; c++) {
    const sc = t.s - t.dir * c * (CAR_LEN + CAR_GAP);
    linePoint(ln, sc, TP);
    // aim along the chord from the car's rear to its front so it follows curves
    const f = linePoint(ln, sc + t.dir * CAR_LEN / 2, {}), b = linePoint(ln, sc - t.dir * CAR_LEN / 2, {});
    const cg = t.cars[c];
    cg.position.set(TP.px, TP.h + 0.05, TP.pz);
    cg.rotation.set(0, Math.atan2(f.px - b.px, f.pz - b.pz), 0);
    cg.rotation.x = -Math.atan2(f.h - b.h, CAR_LEN);
  }
  void L;
  linePoint(ln, t.s, TP); t.x = TP.px; t.z = TP.pz; t.h = TP.h;
}
// Next station ahead of the train in its direction of travel
function nextStation(t) {
  const st = MAP.lines[t.line].stations;
  return t.dir > 0 ? st.find((s) => s.s > t.s + 1) : [...st].reverse().find((s) => s.s < t.s - 1);
}
function updateTrains(d) {
  if (!MAP || !MAP.lines.length) return;
  const L = LIVERY[cityKey] || LIVERY.van;
  // keep a train running on each line that passes near you
  for (const ln of MAP.lines) {
    if (trains.some((t) => t.on && t.line === ln.id)) continue;
    let near = 1e9; for (let i = 0; i < ln.xs.length; i += 3) near = Math.min(near, Math.hypot(ln.xs[i] - S.x, ln.zs[i] - S.z));
    if (near > 700) continue;
    const t = trains.find((x) => !x.on); if (!t) break;
    // start it a little way off so you see it pull in
    let s0 = 0, bd = 1e9; for (let i = 0; i < ln.xs.length; i++) { const dd = Math.hypot(ln.xs[i] - S.x, ln.zs[i] - S.z); if (dd < bd) { bd = dd; s0 = ln.cs[i]; } }
    const dir = Math.random() < 0.5 ? 1 : -1;
    Object.assign(t, { on: true, line: ln.id, dir, s: clamp(s0 - dir * (300 + Math.random() * 300), 40, ln.len - 40), v: L.v * 0.8, dwell: 0, mine: false });
    t.g.visible = true;
  }
  for (const t of trains) {
    if (!t.on) continue;
    const ln = MAP.lines[t.line];
    if (!t.mine && Math.hypot(t.x - S.x, t.z - S.z) > 1100) { t.on = false; t.g.visible = false; continue; }
    if (t.dwell > 0) { t.dwell -= d; if (t.dwell <= 0) t.nextSt = null; placeTrain(t); continue; }
    if (t.nextSt && t.dir * (t.nextSt.s - t.s) < -1) t.nextSt = null;     // went past it (teleport or line change)
    if (!t.nextSt) t.nextSt = nextStation(t);
    const ns = t.nextSt;
    let target = L.v;
    if (ns) {
      const rem = Math.abs(ns.s - t.s);
      target = Math.min(target, Math.sqrt(2 * 1.1 * Math.max(0, rem - 1)) + 0.3);
      if (rem < 1.2) { t.s = ns.s; t.v = 0; t.dwell = t.mine ? 6 : 9; t.atSt = ns; t.nextSt = null; placeTrain(t); continue; }
    }
    // end of the line: reverse
    if ((t.dir > 0 && t.s > ln.len - 30) || (t.dir < 0 && t.s < 30)) { t.dir = -t.dir; t.v = 0; t.dwell = 8; t.nextSt = null; t.atSt = null; }
    t.v += clamp(target - t.v, -1.4 * d, 1.0 * d);
    t.s = clamp(t.s + t.v * t.dir * d, 0, ln.len);
    t.atSt = null;
    placeTrain(t);
    // ground-level trains crossing the street will flatten you
    if (!S.riding && !S.crashed && Math.abs(t.h) < 0.6 && t.v > 2) {
      for (const cg of t.cars) {
        const dx = S.x - cg.position.x, dz = S.z - cg.position.z, a = cg.rotation.y, lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
        if (Math.abs(lx) < 1.6 && Math.abs(lz) < CAR_LEN / 2) { crash('Hit by a train', 'car', null, t.v + S.v); break; }
      }
    }
  }
}

// ---------------------------------------------------------------- riding the train
const RIDE = { on: false, train: null, prompt: '' };
function stationNear(x, z, r) {
  let best = null, bd = r;
  for (const ln of MAP.lines) for (const st of ln.stations) {
    const d = Math.min(Math.hypot(st.x - x, st.z - z), Math.hypot(st.px - x, st.pz - z));
    if (d < bd) { bd = d; best = st; }
  }
  return best;
}
function boardTrain(st) {
  const ln = MAP.lines[st.line], L = LIVERY[cityKey] || LIVERY.van;
  let t = trains.find((x) => x.on && x.line === ln.id && !x.mine && Math.abs(x.s - st.s) < 400) || trains.find((x) => !x.on) || trains[0];
  // head the way you're facing (or the only way there is)
  const P = linePoint(ln, st.s, {});
  let dir = P.dx * Math.sin(S.psi) + P.dz * Math.cos(S.psi) >= 0 ? 1 : -1;
  if (st.s > ln.len - 120) dir = -1; if (st.s < 120) dir = 1;
  Object.assign(t, { on: true, line: ln.id, s: st.s, dir, v: 0, dwell: 3, mine: true, nextSt: null, atSt: st });
  t.g.visible = true; placeTrain(t);
  RIDE.on = true; RIDE.train = t; S.riding = true; S.v = 0; S.thr = 0;
  if (W.active) W = { active: false };
  rig.root.visible = false;
  popup(`${TRANSIT[cityKey] || 'Train'} · ${st.name}`, 'place');
  if (stars()) popup('Cops can\'t follow you on here', 'good');
  camSnap = true; void L;
}
function leaveTrain() {
  const t = RIDE.train, st = t && t.atSt;
  if (!st) return;
  RIDE.on = false; S.riding = false; t.mine = false; RIDE.train = null;
  rig.root.visible = true;
  placeOnRoad(st.x, st.z, Math.atan2(-(st.px - st.x), -(st.pz - st.z)) || 0, 0, false);
  popup(st.name, 'place'); camSnap = true;
}
function updateRide(d) {
  const prompt = $('#prompt');
  if (S.riding && RIDE.train) {
    const t = RIDE.train;
    S.x = t.x; S.z = t.z; S.v = t.v; S.psi = Math.atan2(TP.dx * t.dir, TP.dz * t.dir);
    linePoint(MAP.lines[t.line], t.s, TP); S.psi = Math.atan2(TP.dx * t.dir, TP.dz * t.dir);
    // nobody can see you on the train
    unseenT += d * 2;
    const ns = t.atSt || nextStation(t);
    prompt.hidden = false;
    prompt.innerHTML = t.atSt && t.dwell > 0 ? `<kbd>E</kbd> Get off at <b>${esc(t.atSt.name)}</b>` : `Next stop: <b>${esc(ns ? ns.name : 'end of the line')}</b>`;
    return;
  }
  const st = !S.crashed && S.v < 4 ? stationNear(S.x, S.z, 40) : null;
  RIDE.near = st;
  if (st) { prompt.hidden = false; prompt.innerHTML = `<kbd>E</kbd> Ride the ${TRANSIT[cityKey] || 'train'} from <b>${esc(st.name)}</b>`; }
  else prompt.hidden = true;
}
function trainCamera(dt) {
  const t = RIDE.train, ln = MAP.lines[t.line];
  const cab = pov === 'first' || pov === 'chest' || pov === 'bars';
  if (cab) {
    // driverless trains: sit right up at the front window
    const f = linePoint(ln, t.s + t.dir * (CAR_LEN / 2 + 0.5), {}), a = linePoint(ln, t.s + t.dir * (CAR_LEN / 2 + 45), {});
    camera.position.set(f.px, f.h + 2.35, f.pz); camera.up.set(0, 1, 0); camera.lookAt(a.px, a.h + 2.0, a.pz);
    camera.fov += (80 - camera.fov) * Math.min(1, dt * 3);
  } else {
    // behind the last car
    const back = t.cars.length * (CAR_LEN + CAR_GAP) - CAR_LEN / 2 + 18;
    const b = linePoint(ln, t.s - t.dir * back, {});
    const under = b.h < -2;
    tmp.set(b.px, b.h + (under ? 3.4 : 5.2), b.pz);
    camPos.lerp(tmp, camSnap ? 1 : 1 - Math.exp(-dt * 3));
    lookAt.lerp(tmp2.set(t.x, t.h + 2, t.z), camSnap ? 1 : 1 - Math.exp(-dt * 5));
    camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(lookAt);
    camera.fov += (64 - camera.fov) * Math.min(1, dt * 3);
  }
  camera.updateProjectionMatrix(); camSnap = false;
}
