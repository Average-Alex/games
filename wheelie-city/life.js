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
  for (const p of peds) { scene.remove(p.g); if (p.model) p.model.mixer.stopAllAction(); else p.g.traverse((o) => o.geometry && o.geometry.dispose()); }   // (model people share their geometry)
  peds.length = 0;
  // real people (people.js) once their models are loaded; until then (or if they fail) the simple built ones
  if (typeof PEOPLE !== 'undefined' && PEOPLE.ready) {
    const N = quality === 'low' ? 10 : quality === 'ultra' ? 34 : quality === 'high' ? 26 : 16;
    for (let i = 0; i < N; i++) {
      const r = mulberry(i * 977 + 13), m = makePed(r);
      const g = new THREE.Group(), body = new THREE.Group(); g.add(body); body.add(m.root);
      const sc = 0.93 + r() * 0.12; g.scale.setScalar(sc);
      const dummy = () => new THREE.Object3D();
      g.visible = false; scene.add(g);
      peds.push({ g, body, model: m, legL: dummy(), legR: dummy(), armL: dummy(), armR: dummy(), on: false, x: 0, z: 0, yaw: 0, phase: r() * TAU, knock: null, dodge: 0, hitCd: 0 });
    }
    return;
  }
  if (typeof loadPeople === 'function' && !PEOPLE.failed) loadPeople().then((ok) => { if (ok && MAP) buildPeds(); if (ok && typeof rig !== 'undefined' && rig) attachRiderModel(rig); });
  const N = quality === 'low' ? 14 : quality === 'ultra' ? 56 : quality === 'high' ? 40 : 28;
  for (let i = 0; i < N; i++) {
    const r = mulberry(i * 977 + 13), skin = pick(r, PED_SKIN), top = pick(r, PED_TOP), legs = pick(r, PED_LEGS), hair = pick(r, PED_HAIR);
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    body.add(new THREE.Mesh(mergeColored([[PED.torso, top], [PED.hips, legs], [PED.neck, skin], [PED.head, skin], [PED.hair, hair]]), pedMat));
    const limb = (geo, hand, hex, x, y) => { const pv = new THREE.Group(); pv.position.set(x, y, 0); pv.add(new THREE.Mesh(mergeColored([[geo, hex], [hand, hand === PED.shoe ? '#222' : skin]]), pedMat)); body.add(pv); return pv; };
    const legL = limb(PED.leg, PED.shoe, legs, 0.1, 0.9), legR = limb(PED.leg, PED.shoe, legs, -0.1, 0.9);
    const armL = limb(PED.arm, PED.hand, top, 0.245, 1.5), armR = limb(PED.arm, PED.hand, top, -0.245, 1.5);
    // people come in all heights and builds
    const sc = 0.88 + r() * 0.24, wide = 0.9 + r() * 0.24; g.scale.set(sc * wide, sc, sc * (0.95 + (wide - 1) * 0.6));
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
    const idle = Math.random() < 0.22;
    Object.assign(p, { on: true, e: q.e, s: q.s, dir: Math.random() < 0.5 ? 1 : -1, side: Math.random() < 0.5 ? 1 : -1, v: 0.95 + Math.random() * 0.75, knock: null, dodge: 0,
      idle: idle ? 6 + Math.random() * 18 : 0, pose: idle ? pick(Math.random, IDLE_POSES) : 'stand', watch: null, busy: Math.random() < 0.25 ? 'phone' : '',
      dance: idle && Math.random() < (C.night ? 0.12 : 0.03) });
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
      if (p.model) {
        // a real person: thrown (tumbling), then the fall animation takes over on the ground
        p.g.position.set(p.x, k.y, p.z);
        if (k.y > 0.05) { p.body.rotation.x = k.rot * 0.4; personPlay(p.model, 'Hit_Chest', 0.1); }
        else { p.body.rotation.x = lerp(p.body.rotation.x, 0, Math.min(1, d * 8)); personPlay(p.model, 'Death01', 0.15); }
        p.model.mixer.update(d);
        if (k.down > 3) { p.knock = null; p.body.rotation.x = 0; snapPed(p); say(p, pick(Math.random, PED_CURSES), false); }
        continue;
      }
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
    // walk cycle: stride and arm swing grow with pace, hips sway and the shoulders counter-twist; standing still,
    // people are on their phone, texting, arms folded, or watching (and filming) whatever just happened
    const walking = p.idle <= 0;
    p.phase += (walking ? p.v * 5.2 : 0) * d;
    p.breath = (p.breath || 0) + d;
    const sw = walking ? Math.sin(p.phase) : 0, amp = 0.38 + p.v * 0.14;
    if (p.model) {
      // real animation clips: walking (brisk walkers jog), standing about, chatting on the phone, and the odd dancer
      const m = p.model;
      if (walking) personPlay(m, p.v > 1.55 ? 'Jog_Fwd_Loop' : p.busy === 'phone' ? 'Walk_Formal_Loop' : 'Walk_Loop', 0.3, p.v > 1.55 ? p.v / 3.2 : p.v / 1.3);
      else personPlay(m, p.pose === 'phone' || p.pose === 'text' ? 'Idle_Talking_Loop' : p.dance ? 'Dance_Loop' : 'Idle_Loop', 0.4, 1);
      // animate the ones near you every frame, the far ones less often
      p.animT = (p.animT || 0) + d;
      if (dist < 70 || p.animT > 0.1) { m.mixer.update(p.animT); p.animT = 0; }
      if (!walking && p.watch) p.yaw = Math.atan2(p.watch[0] - p.x, p.watch[1] - p.z);
      p.body.rotation.set(0, 0, 0);
      p.g.position.set(p.x, p.off > 1.5 ? CURB : 0.03, p.z);
    } else if (walking) {
      p.legL.rotation.set(sw * amp, 0, 0); p.legR.rotation.set(-sw * amp, 0, 0);
      if (p.busy === 'phone') { p.armL.rotation.set(-sw * amp * 0.8, 0, 0.06); p.armR.rotation.set(-1.2, 0, 0.3); }     // eyes on the phone while walking
      else { p.armL.rotation.set(-sw * amp * 0.85, 0, 0.07); p.armR.rotation.set(sw * amp * 0.85, 0, -0.07); }
      p.body.rotation.set(0.04, sw * 0.07, Math.cos(p.phase) * 0.025);
    } else {
      p.legL.rotation.set(0, 0, 0); p.legR.rotation.set(0, 0, 0);
      const P = IDLE_ARMS[p.pose] || IDLE_ARMS.stand, br = Math.sin(p.breath * 1.6) * 0.02;
      p.armL.rotation.set(P[0] + br, 0, P[1]); p.armR.rotation.set(P[2] + br, 0, P[3]);
      p.body.rotation.set(br * 0.5, 0, Math.sin(p.breath * 0.4) * 0.02);       // shifting weight
      if (p.watch) p.yaw = Math.atan2(p.watch[0] - p.x, p.watch[1] - p.z);
    }
    if (!p.model) p.g.position.set(p.x, (p.off > 1.5 ? CURB : 0.03) + Math.abs(Math.cos(p.phase)) * 0.035 * (walking ? 1 : 0), p.z);
    p.g.rotation.y += wrapPi(p.yaw - p.g.rotation.y) * Math.min(1, d * 8);
    if (p.idle <= 0 && p.watch) p.watch = null;
    // getting hit
    if (!S.crashed && !S.riding && p.hitCd <= 0 && S.v > 1.5) {
      const B = BIKES[bikeKey], hx = S.x + fx * B.L * 0.5, hz = S.z + fz * B.L * 0.5;
      // a car is as long and wide as a car: check along its length
      if (B.car) { const lx = (p.x - hx) * fx + (p.z - hz) * fz, ly = -(p.x - hx) * fz + (p.z - hz) * fx; if (Math.abs(lx) < B.len / 2 + 0.3 && Math.abs(ly) < B.W / 2 + 0.3) hitPed(p); }
      else if (Math.hypot(p.x - hx, p.z - hz) < 0.75) hitPed(p);
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
  if (BIKES[bikeKey].car) S.v *= 0.85;           // a car just thumps through
  else if (v > 10) crash('Hit a pedestrian', 'pole');
  else S.v *= 0.45;
}
// standing poses: [left arm forward, left arm out, right arm forward, right arm out] (radians)
const IDLE_POSES = ['phone', 'text', 'text', 'fold', 'stand', 'stand'];
const IDLE_ARMS = { stand: [0.04, 0.08, 0.04, -0.08], phone: [0.04, 0.08, -1.25, 0.32], text: [-1.15, -0.3, -1.15, 0.3], fold: [-0.75, -0.75, -0.75, 0.75], film: [-1.55, -0.15, -1.55, 0.15] };
// A crash nearby: people stop, turn to look, and some get their phones out
function pedsReact(x, z) {
  for (const p of peds) {
    if (!p.on || p.knock || Math.hypot(p.x - x, p.z - z) > 40) continue;
    p.idle = 5 + Math.random() * 5; p.watch = [x, z]; p.pose = Math.random() < 0.45 ? 'film' : Math.random() < 0.5 ? 'stand' : 'fold';
    if (Math.random() < 0.15) say(p, pick(Math.random, ['Oh my god!', 'Is he OK?!', 'Ooof.', 'Did you see that?!', 'Somebody call 911!']), false);
  }
}
const PED_DODGE = ['Whoa!', 'Hey!', 'Watch it!', 'Sidewalk, buddy!', 'Seriously?!', 'Slow down!'];
const PED_CURSES = ['My LEG!!', 'Are you insane?!', 'I\'m calling the cops!', 'You hit me!!', 'Get back here!'];

