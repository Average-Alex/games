// Wheelie City — vehicles: car models, traffic that drives the real road graph, police, helicopter.
'use strict';

// ---------------------------------------------------------------- models
// Side profiles (z forward, y up). The body is extruded across the car's width; the cabin is extruded in glass, a bit narrower.
const CAR_TYPES = {
  sedan:  { L: 4.7, W: 1.84, wb: 2.8, r: 0.33, body: [[-2.35, 0.32], [2.35, 0.32], [2.38, 0.62], [2.25, 0.82], [1.05, 0.95], [-1.55, 0.98], [-2.3, 0.92], [-2.4, 0.6]], cabin: [[1.0, 0.93], [0.22, 1.42], [-0.95, 1.42], [-1.62, 0.96]], roof: [-0.92, 0.18, 1.42] },
  suv:    { L: 4.9, W: 1.96, wb: 2.9, r: 0.38, body: [[-2.45, 0.42], [2.45, 0.42], [2.48, 0.8], [2.35, 1.08], [1.2, 1.18], [-2.38, 1.2], [-2.47, 0.8]], cabin: [[1.15, 1.15], [0.45, 1.78], [-2.2, 1.8], [-2.36, 1.18]], roof: [-2.18, 0.42, 1.8] },
  hatch:  { L: 4.1, W: 1.78, wb: 2.55, r: 0.31, body: [[-2.05, 0.3], [2.05, 0.3], [2.08, 0.6], [1.95, 0.8], [0.95, 0.92], [-1.95, 0.95], [-2.07, 0.6]], cabin: [[0.9, 0.9], [0.15, 1.4], [-1.7, 1.42], [-1.98, 0.95]], roof: [-1.66, 0.12, 1.42] },
  pickup: { L: 5.6, W: 2.0, wb: 3.4, r: 0.4, body: [[-2.8, 0.45], [2.8, 0.45], [2.83, 0.85], [2.7, 1.12], [1.5, 1.2], [-2.8, 1.2], [-2.82, 0.85]], cabin: [[1.45, 1.17], [0.85, 1.86], [-0.5, 1.88], [-0.62, 1.2]], roof: [-0.48, 0.82, 1.88] },
  van:    { L: 5.2, W: 2.0, wb: 3.2, r: 0.36, body: [[-2.6, 0.38], [2.6, 0.38], [2.62, 0.9], [2.3, 1.25], [1.6, 1.4], [-2.6, 1.42], [-2.62, 0.9]], cabin: [[1.55, 1.38], [1.0, 2.08], [-2.55, 2.12], [-2.6, 1.4]], roof: [-2.5, 0.95, 2.12] },
};
const geoCache = {};
// Round every corner of a profile with a small arc so bodies read as pressed metal, not boxes
function roundProfile(pts, r) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]), rr = Math.min(r, la * 0.4, lb * 0.4);
    const pa = [p[0] + (a[0] - p[0]) / la * rr, p[1] + (a[1] - p[1]) / la * rr], pb = [p[0] + (b[0] - p[0]) / lb * rr, p[1] + (b[1] - p[1]) / lb * rr];
    for (let k = 0; k <= 3; k++) { const t = k / 3, u = 1 - t; out.push([u * u * pa[0] + 2 * u * t * p[0] + t * t * pb[0], u * u * pa[1] + 2 * u * t * p[1] + t * t * pb[1]]); }
  }
  return out;
}
function extrudeProfile(pts, width, bevel) {
  const sh = new THREE.Shape(roundProfile(pts, bevel > 0.04 ? 0.16 : 0.1).map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 1 });
  g.rotateY(-Math.PI / 2); g.translate(width / 2 - bevel, 0, 0);
  g.computeVertexNormals();
  return g;
}
function carGeo(type) {
  if (geoCache[type]) return geoCache[type];
  const T = CAR_TYPES[type], hw = T.W / 2;
  const body = extrudeProfile(T.body, T.W, 0.08);
  const glass = extrudeProfile(T.cabin, T.W - 0.18, 0.03);
  const roof = new THREE.BoxGeometry(T.W - 0.2, 0.05, T.roof[1] - T.roof[0]); roof.translate(0, T.roof[2] + 0.02, (T.roof[0] + T.roof[1]) / 2);
  const wheels = []; for (const sx of [1, -1]) for (const sz of [1, -1]) { const w = new THREE.CylinderGeometry(T.r, T.r, 0.26, 14); w.rotateZ(Math.PI / 2); w.translate(sx * (hw - 0.1), T.r, sz * T.wb / 2); wheels.push(w); }
  const hubs = []; for (const sx of [1, -1]) for (const sz of [1, -1]) { const w = new THREE.CylinderGeometry(T.r * 0.6, T.r * 0.6, 0.27, 10); w.rotateZ(Math.PI / 2); w.translate(sx * (hw - 0.1), T.r, sz * T.wb / 2); hubs.push(w); }
  const fy = T.body[2][1] - 0.08, ry = T.body[T.body.length - 1][1];
  const head = []; for (const x of [hw - 0.35, -(hw - 0.35)]) { const b = new THREE.BoxGeometry(0.42, 0.13, 0.05); b.translate(x, fy, T.L / 2 + 0.02); head.push(b); }
  const tail = []; for (const x of [hw - 0.3, -(hw - 0.3)]) { const b = new THREE.BoxGeometry(0.38, 0.14, 0.05); b.translate(x, ry + 0.02, -T.L / 2 - 0.02); tail.push(b); }
  const bump = []; for (const s of [1, -1]) { const b = new THREE.BoxGeometry(T.W + 0.02, 0.18, 0.16); b.translate(0, T.r + 0.05, s * (T.L / 2 - 0.02)); bump.push(b); }
  // grille, mirrors, plates, tyre sidewall shading
  const grille = new THREE.BoxGeometry(T.W * 0.55, 0.16, 0.04); grille.translate(0, fy - 0.12, T.L / 2 + 0.03); bump.push(grille);
  const glassFrontZ = T.cabin[0][0];
  for (const s of [1, -1]) { const mr = new THREE.BoxGeometry(0.2, 0.12, 0.08); mr.translate(s * (hw + 0.1), T.cabin[0][1] + 0.08, glassFrontZ - 0.15); bump.push(mr); }
  const plates = []; for (const s of [1, -1]) { const p = new THREE.BoxGeometry(0.52, 0.12, 0.02); p.translate(0, T.r + 0.08, s * (T.L / 2 + 0.07)); plates.push(p); }
  return (geoCache[type] = { body, glass, roof, wheels: merge(wheels), hubs: merge(hubs), head: merge(head), tail: merge(tail), bump: merge(bump), plates: merge(plates), T });
}
const carMats = {
  plate: new THREE.MeshLambertMaterial({ color: '#e8e8e2' }),
  glass: M('#1b2028', 0.06, 0.9), tire: new THREE.MeshLambertMaterial({ color: '#141414' }), hub: M('#9aa0a6', 0.35, 0.8), bump: new THREE.MeshLambertMaterial({ color: '#1c1d20' }),
  head: new THREE.MeshBasicMaterial({ color: '#fff4d6' }), tail: new THREE.MeshBasicMaterial({ color: '#ff2a2a' }), taxi: new THREE.MeshBasicMaterial({ color: '#fff7c2' }),
  red: new THREE.MeshBasicMaterial({ color: '#ff2236' }), blue: new THREE.MeshBasicMaterial({ color: '#2b6bff' }), off: new THREE.MeshLambertMaterial({ color: '#3a3a40' }),
  uniform: M('#1d2a44', 0.8), helmet: M('#f4f4f2', 0.3), copBlack: M('#141518', 0.4, 0.4),
};
function buildCarModel(type, paint, extra = {}) {
  const G_ = carGeo(type), T = G_.T, g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const add = (geo, mat, cast) => { const me = new THREE.Mesh(geo, mat); if (cast) me.castShadow = true; body.add(me); return me; };
  add(G_.body, paint, true); add(G_.glass, carMats.glass); add(G_.roof, paint); add(G_.wheels, carMats.tire); add(G_.hubs, carMats.hub); add(G_.bump, carMats.bump);
  add(G_.head, carMats.head); add(G_.tail, carMats.tail); add(G_.plates, carMats.plate);
  const out = { g, body, T };
  if (extra.taxi) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.28), carMats.taxi); s.position.set(0, T.roof[2] + 0.16, (T.roof[0] + T.roof[1]) / 2); body.add(s); }
  if (extra.cop) {
    const cp = extra.cop;
    // two-tone doors, roof bar, push bar, POLICE decals
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, T.wb * 0.75), cp.panelMat); p.position.set(s * (T.W / 2 + 0.03), T.body[2][1] - 0.02, 0.05); body.add(p);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, T.L * 0.9), cp.stripeMat); st.position.set(s * (T.W / 2 + 0.04), T.body[2][1] - 0.3, 0); body.add(st);
      const dc = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), cp.decalMat); dc.position.set(s * (T.W / 2 + 0.06), T.body[2][1] + 0.0, 0.05); dc.rotation.y = s * Math.PI / 2; body.add(dc);
    }
    const ry = T.roof[2] + 0.12, rz = (T.roof[0] + T.roof[1]) / 2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.32), carMats.copBlack); base.position.set(0, ry - 0.06, rz); body.add(base);
    const L = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.13, 0.28), carMats.red); L.position.set(0.32, ry + 0.04, rz); body.add(L);
    const R = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.13, 0.28), carMats.blue); R.position.set(-0.32, ry + 0.04, rz); body.add(R);
    const pb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.08), carMats.copBlack); pb.position.set(0, T.r + 0.35, T.L / 2 + 0.12); body.add(pb);
    out.lights = [L, R];
  }
  return out;
}
const motoGeo = (() => {
  const wheels = []; for (const z of [0.74, -0.74]) { const w = new THREE.TorusGeometry(0.3, 0.08, 6, 16); w.rotateY(Math.PI / 2); w.translate(0, 0.38, z); wheels.push(w); }
  const body = new THREE.BoxGeometry(0.5, 0.45, 1.3); body.translate(0, 0.8, 0.05);
  const screen = new THREE.BoxGeometry(0.6, 0.38, 0.05); screen.rotateX(-0.25); screen.translate(0, 1.22, 0.62);
  const bags = []; for (const x of [0.32, -0.32]) { const b = new THREE.BoxGeometry(0.22, 0.4, 0.5); b.translate(x, 0.75, -0.55); bags.push(b); }
  const torso = new THREE.BoxGeometry(0.46, 0.62, 0.3); torso.translate(0, 1.45, -0.1);
  const head = new THREE.SphereGeometry(0.16, 10, 8); head.translate(0, 1.9, -0.02);
  const legs = []; for (const x of [0.17, -0.17]) { const l = new THREE.BoxGeometry(0.13, 0.55, 0.3); l.translate(x, 0.95, 0.15); legs.push(l); }
  const lightL = new THREE.BoxGeometry(0.12, 0.12, 0.08); lightL.translate(0.22, 1.05, 0.72);
  const lightR = new THREE.BoxGeometry(0.12, 0.12, 0.08); lightR.translate(-0.22, 1.05, 0.72);
  return { wheels: merge(wheels), body: merge([body, screen, ...bags]), rider: merge([torso, ...legs]), head, lightL, lightR };
})();

// ---------------------------------------------------------------- units
const units = [];
let heli = null;
let carPaint = [], copMats = null;
let simTime = 0;
const copLight = new THREE.PointLight('#ff2236', 0, 30, 2); scene.add(copLight);

function buildUnitPools() {
  for (const u of units) scene.remove(u.g);
  units.length = 0;
  for (const m of carPaint) m.dispose();
  carPaint = C.cars.map((c) => M(c, 0.32, 0.45));
  if (copMats) Object.values(copMats).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
  copMats = {
    body: M(C.cop.body, 0.32, 0.45), panelMat: M(C.cop.panel, 0.35, 0.4), stripeMat: new THREE.MeshLambertMaterial({ color: C.cop.stripe }),
    decalMat: new THREE.MeshBasicMaterial({ map: decalTexture(C.cop.text, C.cop.stripe === C.cop.body ? '#111' : C.cop.stripe), transparent: true, side: THREE.DoubleSide }),
  };
  const types = ['sedan', 'sedan', 'suv', 'hatch', 'suv', 'pickup', 'van', 'sedan'];
  const nCars = quality === 'low' ? 26 : quality === 'ultra' ? 52 : 38;
  for (let i = 0; i < nCars; i++) {
    const paintIdx = i % carPaint.length, isTaxi = C.taxi && C.cars[paintIdx] === '#f2c230';
    const type = isTaxi ? 'sedan' : types[i % types.length];
    const mdl = buildCarModel(type, carPaint[paintIdx], { taxi: isTaxi });
    mdl.g.visible = false; scene.add(mdl.g);
    units.push({ g: mdl.g, body: mdl.body, T: mdl.T, kind: 'car', on: false });
  }
  for (let i = 0; i < 8; i++) {
    const mdl = buildCarModel(i % 3 === 2 ? 'suv' : 'sedan', copMats.body, { cop: copMats });
    mdl.g.visible = false; scene.add(mdl.g);
    units.push({ g: mdl.g, body: mdl.body, T: mdl.T, kind: 'cop', on: false, lights: mdl.lights });
  }
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const L = new THREE.Mesh(motoGeo.lightL, carMats.red), R = new THREE.Mesh(motoGeo.lightR, carMats.blue);
    body.add(new THREE.Mesh(motoGeo.wheels, carMats.tire), new THREE.Mesh(motoGeo.body, copMats.body), new THREE.Mesh(motoGeo.rider, carMats.uniform), new THREE.Mesh(motoGeo.head, carMats.helmet), L, R);
    g.visible = false; scene.add(g);
    units.push({ g, body, T: { L: 1.9, W: 0.8 }, kind: 'moto', on: false, lights: [L, R] });
  }
  if (!heli) heli = buildHeli();
  heli.on = false; heli.g.visible = false; heli.beam.visible = false;
}
function buildHeli() {
  const g = new THREE.Group();
  const bodyM = M('#1c2333', 0.4, 0.5), whiteM = M('#e9ecef', 0.4, 0.3);
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), bodyM); cabin.scale.set(1, 0.85, 1.6); g.add(cabin);
  const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.42, 16, 12, 0, TAU, 1.35, 0.4), whiteM); stripe.scale.set(1, 0.85, 1.6); g.add(stripe);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 4.2), bodyM); boom.position.set(0, 0.25, -3.6); g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.7), bodyM); fin.position.set(0, 0.7, -5.5); g.add(fin);
  for (const x of [0.8, -0.8]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3), whiteM); sk.position.set(x, -1.35, 0); g.add(sk); }
  const rotor = new THREE.Group(); rotor.position.y = 1.35; g.add(rotor);
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 6.2), carMats.copBlack); b.rotation.y = k * Math.PI / 4 * 2; rotor.add(b); }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 0.18), carMats.copBlack); tail.position.set(0.12, 0.7, -5.6); g.add(tail);
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), carMats.red); red.position.set(0, -0.9, 1.6); g.add(red);
  const beamGeo = new THREE.ConeGeometry(7, 40, 24, 1, true); beamGeo.translate(0, -20, 0);
  const beamM = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#fff7d6', transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(beamM);
  const spot = new THREE.SpotLight('#fff3d0', 0, 90, 0.22, 0.5, 1.2); scene.add(spot); scene.add(spot.target);
  scene.add(g);
  return { g, rotor, tail, beam: beamM, spot, on: false, x: 0, y: 40, z: 0, vx: 0, vz: 0, red };
}

// ---------------------------------------------------------------- driving the real road graph
const EP = { x: 0, z: 0, tx: 0, tz: 1 };
function lanesPerDir(e) {
  const m = MAP, R = RC[m.eCls[e]], one = m.eFlag[e] & F_ONEWAY;
  const tot = m.eLanes[e] || (one && R.lanes > 2 && !R.hwy ? R.lanes / 2 : R.lanes);
  return one ? Math.max(1, tot) : Math.max(1, Math.floor(tot / 2));
}
function laneOffset(e, lane) {
  const m = MAP, R = RC[m.eCls[e]], one = m.eFlag[e] & F_ONEWAY, n = lanesPerDir(e), k = Math.min(lane, n - 1);
  const o = one ? (k - (n - 1) / 2) * R.lw : (k + 0.5) * R.lw + (n === 1 && !R.hwy ? 0.4 : 0);
  return clamp(o, -m.eHW[e] + 1.1, m.eHW[e] - 1.1);
}
function unitPlace(u) {
  const m = MAP, along = u.dir > 0 ? u.s : m.eLen[u.e] - u.s;
  edgePoint(u.e, along, EP);
  const fx = EP.tx * u.dir, fz = EP.tz * u.dir, off = laneOffset(u.e, u.lane);
  u.x = EP.x - fz * off; u.z = EP.z + fx * off; u.yaw = Math.atan2(fx, fz);
}
// Pick the next edge at the junction ahead. Traffic prefers to go straight and keep its street; chasing cops head for you.
function chooseNext(u) {
  const m = MAP, node = u.dir > 0 ? m.eB[u.e] : m.eA[u.e], back = u.dir > 0 ? u.e * 2 + 1 : u.e * 2;
  const [bx, bz] = dirFromNode(node, back), hx = -bx, hz = -bz;   // arriving heading
  const cand = [];
  let total = 0;
  for (let k = m.adjS[node]; k < m.adjS[node + 1]; k++) {
    const ent = m.adj[k], e2 = ent >> 1, dir2 = ent & 1 ? -1 : 1;
    if (ent === back) continue;
    if (!RC[m.eCls[e2]].drive) continue;
    if ((m.eFlag[e2] & F_ONEWAY) && dir2 < 0) continue;
    const [dx, dz] = dirFromNode(node, ent), turn = Math.acos(clamp(hx * dx + hz * dz, -1, 1));
    if (turn > 2.7) continue;
    let w = turn < 0.4 ? 5 : 1;
    if (m.eName[e2] && m.eName[e2] === m.eName[u.e]) w += 4;
    if (m.eCls[u.e] === 0 && m.eCls[e2] === 0) w += 12;
    if (m.eCls[e2] === 9 || m.eCls[e2] === 10) w *= 0.6;
    if (u.chasing && !S.crashed) {
      const px = m.nx[node] + dx * 40, pz = m.nz[node] + dz * 40, dd = Math.hypot(px - S.x, pz - S.z);
      w = 1 / (1 + dd * dd * 0.01) + Math.random() * 0.002;
    }
    cand.push({ e: e2, dir: dir2, turn, w }); total += w;
  }
  if (!cand.length) {
    if (!(m.eFlag[u.e] & F_ONEWAY)) return { e: u.e, dir: -u.dir, turn: Math.PI, w: 1 };
    return null;
  }
  if (u.chasing) return cand.reduce((a, b) => (b.w > a.w ? b : a));
  let r = Math.random() * total;
  for (const c of cand) { r -= c.w; if (r <= 0) return c; }
  return cand[cand.length - 1];
}
function graphTarget(u) {
  const m = MAP, R = RC[m.eCls[u.e]], L = m.eLen[u.e], rem = L - u.s;
  let tv = (R.v || 8) * u.drv * (u.chasing ? 1.35 : 1);
  if (u.next && rem < 45) {
    const turnV = 5 + 15 * Math.max(0, 1 - u.next.turn / 1.6);
    tv = Math.min(tv, lerp(turnV, tv, clamp((rem - 8) / 37, 0, 1)));
  }
  const node = u.dir > 0 ? m.eB[u.e] : m.eA[u.e];
  if (m.nflag[node] && rem < 70 && !u.chasing) {
    const ent = u.dir > 0 ? u.e * 2 + 1 : u.e * 2, st = signalState(node, signalGroup(node, ent), simTime);
    const stopAt = rem - m.nodeHW[node] - 4.5;
    if ((st === 2 || (st === 1 && stopAt > 10)) && stopAt > -2) tv = Math.min(tv, Math.max(0, stopAt * 0.55));
  }
  return tv;
}
function driveGraph(u, d, targetV) {
  const m = MAP;
  u.v += clamp(targetV - u.v, -9 * d, (u.kind === 'car' ? 3.2 : 5.5) * d);
  u.v = Math.max(0, u.v);
  u.s += u.v * d;
  if (!u.next && m.eLen[u.e] - u.s < 45) u.next = chooseNext(u);
  let guard = 0;
  while (u.s >= m.eLen[u.e] && guard++ < 8) {
    u.s -= m.eLen[u.e];
    const nx = u.next || chooseNext(u); u.next = null;
    if (!nx) { deactivate(u); return; }
    u.e = nx.e; u.dir = nx.dir; u.lane = Math.min(u.lane, lanesPerDir(u.e) - 1);
  }
  unitPlace(u);
}
function snapToGraph(u) {
  const q = roadQuery(u.x, u.z, 40, drivable);
  if (q.e < 0) return false;
  edgePoint(q.e, q.s, EP);
  const fx = Math.sin(u.yaw), fz = Math.cos(u.yaw);
  let dir = EP.tx * fx + EP.tz * fz >= 0 ? 1 : -1;
  if ((MAP.eFlag[q.e] & F_ONEWAY) && dir < 0) dir = 1;
  Object.assign(u, { mode: 'graph', e: q.e, dir, s: dir > 0 ? q.s : MAP.eLen[q.e] - q.s, lane: 0, next: null });
  return true;
}
function activate(u, near) {
  if (!MAP) return false;
  for (let tries = 0; tries < 16; tries++) {
    const a = Math.random() * TAU, dist = near ? 45 + Math.random() * 170 : 120 + Math.random() * 150;
    const x = S.x + Math.sin(a) * dist, z = S.z + Math.cos(a) * dist;
    const q = roadQuery(x, z, 30, drivable); if (q.e < 0) continue;
    const e = q.e, R = RC[MAP.eCls[e]];
    if (u.kind === 'car' && R.v < 6) continue;
    const dir = (MAP.eFlag[e] & F_ONEWAY) ? 1 : (Math.random() < 0.5 ? 1 : -1);
    Object.assign(u, { e, dir, s: dir > 0 ? q.s : MAP.eLen[e] - q.s, lane: Math.floor(Math.random() * lanesPerDir(e)), mode: 'graph', next: null });
    unitPlace(u);
    const dp = Math.hypot(u.x - S.x, u.z - S.z);
    if (dp < (near ? 35 : 90) || dp > 300) continue;
    if (units.some((o) => o !== u && o.on && Math.hypot(o.x - u.x, o.z - u.z) < 14)) continue;
    u.drv = 0.85 + Math.random() * 0.3;
    Object.assign(u, { on: true, v: (R.v || 8) * u.drv * 0.7, honkCd: 0, nearCd: 0, blockT: 0, chasing: false, bustT: 0, hitT: 0, rock: 0 });
    u.g.position.set(u.x, roadY(R.rank), u.z); u.g.rotation.set(0, u.yaw, 0); u.g.visible = true;
    return true;
  }
  return false;
}
function deactivate(u) { u.on = false; u.g.visible = false; u.chasing = false; }

// Free driving (cops closing in): steer straight at you, but never through buildings
function driveFree(u, d, targetV) {
  u.v += clamp(targetV - u.v, -9 * d, 6 * d);
  const lead = Math.min(1.2, Math.hypot(S.x - u.x, S.z - u.z) / 20);
  const tx = S.x + Math.sin(S.psi) * S.v * lead, tz = S.z + Math.cos(S.psi) * S.v * lead;
  const want = Math.atan2(tx - u.x, tz - u.z), turn = u.kind === 'moto' ? 2.8 : 1.8;
  u.yaw += clamp(wrapPi(want - u.yaw), -turn * d, turn * d);
  const nx = u.x + Math.sin(u.yaw) * u.v * d, nz = u.z + Math.cos(u.yaw) * u.v * d;
  if (buildingAt(nx + Math.sin(u.yaw) * 2, nz + Math.cos(u.yaw) * 2, 0.4) >= 0 || landAt(nx, nz) === 1) { u.v *= 0.5; if (snapToGraph(u)) u.freeCd = 2; return; }
  u.x = nx; u.z = nz;
}
