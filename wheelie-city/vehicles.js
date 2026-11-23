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
// Smooth shading for a non-indexed mesh: average the face normals of every triangle that shares a corner position
function smoothNormals(g) {
  const p = g.attributes.position.array, n = new Float32Array(p.length), acc = new Map(), key = (i) => `${Math.round(p[i] * 1000)},${Math.round(p[i + 1] * 1000)},${Math.round(p[i + 2] * 1000)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 9) {
    a.fromArray(p, i); b.fromArray(p, i + 3); c.fromArray(p, i + 6);
    const fn = b.sub(a).cross(c.sub(a));          // area-weighted face normal
    for (let k = 0; k < 3; k++) { const kk = key(i + k * 3); const v = acc.get(kk) || [0, 0, 0]; v[0] += fn.x; v[1] += fn.y; v[2] += fn.z; acc.set(kk, v); }
  }
  for (let i = 0; i < p.length; i += 3) { const v = acc.get(key(i)), l = Math.hypot(v[0], v[1], v[2]) || 1; n[i] = v[0] / l; n[i + 1] = v[1] / l; n[i + 2] = v[2] / l; }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
}
// The highest and lowest crossing of a closed side profile [[z, y], ...] with the vertical line at z
function profileSpan(P, z) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < P.length; i++) {
    const [z0, y0] = P[i], [z1, y1] = P[(i + 1) % P.length];
    if ((z0 - z) * (z1 - z) <= 0 && z0 !== z1) { const y = y0 + (y1 - y0) * (z - z0) / (z1 - z0); lo = Math.min(lo, y); hi = Math.max(hi, y); }
  }
  return lo <= hi ? [lo, hi] : null;
}
// A car built in three draws (it was nine): one painted shell with the glass, trim, grille, plates and wheel arches as
// vertex colours (the paint colour multiplies the white parts), one set of wheels, one set of lamps. The shell is lofted:
// a rounded, slightly boxy cross-section at every slice along the car, so the sides curve like pressed panels instead
// of being one flat extrusion; the glasshouse sits on it, narrower at the roof (tumblehome).
const CAR_PAINT = [1, 1, 1], CAR_GLASS = [0.05, 0.06, 0.075], CAR_TRIM = [0.09, 0.09, 0.1], CAR_ARCH = [0.02, 0.02, 0.02], CAR_PLATE = [0.92, 0.92, 0.88];
function carGeo(type) {
  if (geoCache[type]) return geoCache[type];
  const T = CAR_TYPES[type], hw = T.W / 2, L2 = T.L / 2;
  const pos = [], col = [];
  const tri = (a, b, c, ca, cb, cc) => { pos.push(...a, ...b, ...c); col.push(...ca, ...(cb || ca), ...(cc || ca)); };
  const quad = (a, b, c, d, ca, cb, cc, cd) => { tri(a, b, c, ca, cb, cc); tri(a, c, d, ca, cc, cd); };
  // body colour at a point: dark wheel arches round each wheel, black trim along the sills and bumpers, paint elsewhere
  const bodyCol = (x, y, z) => {
    for (const wz of [T.wb / 2, -T.wb / 2]) if (Math.hypot(z - wz, y - T.r) < T.r + 0.07 && Math.abs(x) > hw - 0.3) return CAR_ARCH;
    if (y < T.r * 0.62 || (Math.abs(z) > L2 - 0.18 && y < T.r + 0.14)) return CAR_TRIM;
    return CAR_PAINT;
  };
  // superellipse cross-section (n = 4: rounded box)
  const SEG = 18, se = (t, n) => Math.sign(t) * Math.pow(Math.abs(t), 2 / n);
  const slicesZ = []; for (let k = 0; k <= 36; k++) slicesZ.push(-L2 + 0.004 + (T.L - 0.008) * k / 36);
  // lower body
  const ring = (z) => {
    const sp = profileSpan(T.body, z); if (!sp) return null;
    const [y0, y1] = sp, yc = (y0 + y1) / 2, b = (y1 - y0) / 2, endK = Math.pow(Math.abs(z) / L2, 6), a = hw * (1 - 0.1 * endK);
    const pts = [];
    for (let s = 0; s < SEG; s++) { const th = s / SEG * Math.PI * 2; pts.push([a * se(Math.cos(th), 4.5), yc + b * se(Math.sin(th), 4.5), z]); }
    return pts;
  };
  let prev = null;
  for (const z of slicesZ) {
    const cur = ring(z); if (!cur) continue;
    if (prev) for (let s = 0; s < SEG; s++) {
      const s2 = (s + 1) % SEG, A = prev[s], B = prev[s2], Cc = cur[s2], D = cur[s];
      quad(A, B, Cc, D, bodyCol(...A), bodyCol(...B), bodyCol(...Cc), bodyCol(...D));
    } else { const c = cur.reduce((m, p) => [m[0] + p[0] / SEG, m[1] + p[1] / SEG, z], [0, 0, z]); for (let s = 0; s < SEG; s++) tri(c, cur[(s + 1) % SEG], cur[s], CAR_TRIM); }
    prev = cur;
  }
  if (prev) { const z = prev[0][2], c = prev.reduce((m, p) => [m[0] + p[0] / SEG, m[1] + p[1] / SEG, z], [0, 0, z]); for (let s = 0; s < SEG; s++) tri(c, prev[s], prev[(s + 1) % SEG], CAR_TRIM); }
  // glasshouse: from the beltline up, narrowing to the roof; glass round the sides, paint on top
  const cz = T.cabin.map((p) => p[0]), cz0 = Math.min(...cz), cz1 = Math.max(...cz);
  let gPrev = null;
  for (let k = 0; k <= 20; k++) {
    const z = cz0 + 0.01 + (cz1 - cz0 - 0.02) * k / 20, sp = profileSpan(T.cabin, z), bs = profileSpan(T.body, z); if (!sp || !bs) continue;
    const yb = bs[1] - 0.01, yt = Math.max(yb + 0.01, sp[1]), aB = hw - 0.08, aT = hw - 0.3;
    const pts = [[aB, yb, z], [aT + 0.02, yt - 0.06, z], [aT * 0.7, yt, z], [-aT * 0.7, yt, z], [-aT - 0.02, yt - 0.06, z], [-aB, yb, z]];
    if (gPrev) for (let s = 0; s < pts.length - 1; s++) { const c = s === 1 || s === 2 || s === 3 ? (s === 2 ? CAR_PAINT : CAR_PAINT) : CAR_GLASS; quad(gPrev[s], gPrev[s + 1], pts[s + 1], pts[s], s === 0 || s === 4 ? CAR_GLASS : c); }
    else { tri(pts[0], pts[2], pts[1], CAR_GLASS); tri(pts[0], pts[3], pts[2], CAR_GLASS); tri(pts[0], pts[5], pts[3], CAR_GLASS); tri(pts[5], pts[4], pts[3], CAR_GLASS); }
    gPrev = pts;
  }
  if (gPrev) { const p = gPrev; tri(p[0], p[1], p[2], CAR_GLASS); tri(p[0], p[2], p[3], CAR_GLASS); tri(p[0], p[3], p[5], CAR_GLASS); tri(p[5], p[3], p[4], CAR_GLASS); }
  // grille, mirrors, plates
  const box = (w, h, d, x, y, z, c) => { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y, z); const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 3) { pos.push(a[i], a[i + 1], a[i + 2]); col.push(...c); } g.dispose(); };
  const front = profileSpan(T.body, L2 - 0.05), rear = profileSpan(T.body, -L2 + 0.05);
  if (front) box(T.W * 0.5, 0.14, 0.04, 0, (front[0] + front[1]) / 2, L2 + 0.005, CAR_TRIM);
  for (const s of [1, -1]) box(0.16, 0.1, 0.07, s * (hw + 0.06), T.cabin[0][1] + 0.06, T.cabin[0][0] - 0.12, CAR_PAINT);
  for (const s of [1, -1]) box(0.5, 0.11, 0.02, 0, T.r + 0.1, s * (L2 + 0.012), CAR_PLATE);
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); shell.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  smoothNormals(shell); shell.computeBoundingSphere();
  // wheels: a rounded tyre and an alloy face with five spokes, all four in one geometry (vertex colours)
  const wp = [], wc = [];
  const addG = (g, c, m) => { const n = g.index ? g.toNonIndexed() : g; n.applyMatrix4(m); const a = n.attributes.position.array; for (let i = 0; i < a.length; i += 3) { wp.push(a[i], a[i + 1], a[i + 2]); wc.push(...c); } if (n !== g) n.dispose(); g.dispose(); };
  const m4 = new THREE.Matrix4();
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const cx = sx * (hw - 0.12), cyz = [T.r, sz * T.wb / 2];
    const tyre = new THREE.LatheGeometry([[T.r * 0.68, -0.12], [T.r * 0.95, -0.125], [T.r, -0.09], [T.r, 0.09], [T.r * 0.95, 0.125], [T.r * 0.68, 0.12]].map(([a, b]) => new THREE.Vector2(a, b)), 20);
    tyre.rotateZ(Math.PI / 2);
    addG(tyre, [0.06, 0.06, 0.06], m4.makeTranslation(cx, cyz[0], cyz[1]));
    const face = new THREE.CircleGeometry(T.r * 0.68, 20); face.rotateY(sx * Math.PI / 2);
    addG(face, [0.62, 0.64, 0.66], m4.makeTranslation(cx + sx * 0.1, cyz[0], cyz[1]));
    const hub = new THREE.CircleGeometry(T.r * 0.2, 10); hub.rotateY(sx * Math.PI / 2);
    addG(hub, [0.3, 0.31, 0.33], m4.makeTranslation(cx + sx * 0.112, cyz[0], cyz[1]));
    for (let k = 0; k < 5; k++) { const sp = new THREE.BoxGeometry(0.02, T.r * 0.5, 0.05); sp.translate(0, T.r * 0.36, 0); sp.rotateX(k / 5 * Math.PI * 2); addG(sp, [0.2, 0.21, 0.22], m4.makeTranslation(cx + sx * 0.105, cyz[0], cyz[1])); }
  }
  const wheels = new THREE.BufferGeometry(); wheels.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wheels.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3)); wheels.computeVertexNormals();
  // lamps: headlights (warm white) at the front corners, tail lights (red) across the back
  const lp = [], lc = [];
  const lbox = (w, h, d, x, y, z, c) => { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y, z); const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 3) { lp.push(a[i], a[i + 1], a[i + 2]); lc.push(...c); } g.dispose(); };
  const fy = front ? front[1] - 0.12 : 0.7, ry = rear ? rear[1] - 0.1 : 0.8;
  for (const s of [1, -1]) { lbox(0.36, 0.1, 0.04, s * (hw - 0.32), fy, L2 - 0.01, [1, 0.96, 0.86]); lbox(0.4, 0.09, 0.04, s * (hw - 0.28), ry, -L2 + 0.01, [1, 0.12, 0.1]); }
  const lamps = new THREE.BufferGeometry(); lamps.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lamps.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
  return (geoCache[type] = { shell, wheels, lamps, T });
}
function glowMat(c, k) { const m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); m.color.multiplyScalar(k); return m; }
const carMats = {
  plate: M('#e8e8e2', 0.4, 0.2),
  // the new three-draw cars: wheels and lamps carry their colours per vertex
  wheel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.5 }),
  lamps: (() => { const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); m.color.setScalar(2.2); return m; })(),
  glass: M('#11161c', 0.04, 0.9, { envMapIntensity: 1.6 }), tire: M('#151515', 0.9, 0), hub: M('#b8bec4', 0.25, 0.9), bump: M('#1c1d20', 0.55, 0.1),
  // lamps glow past white so the bloom picks them up
  head: glowMat('#fff4d6', 2.4), tail: glowMat('#ff2a2a', 1.6), taxi: glowMat('#fff7c2', 1.3),
  red: glowMat('#ff2236', 3), blue: glowMat('#2b6bff', 3), off: new THREE.MeshLambertMaterial({ color: '#3a3a40' }),
  uniform: M('#1d2a44', 0.8), helmet: M('#f4f4f2', 0.3), copBlack: M('#141518', 0.4, 0.4),
};
function buildCarModel(type, paint, extra = {}) {
  const G_ = carGeo(type), T = G_.T, g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const add = (geo, mat, cast) => { const me = new THREE.Mesh(geo, mat); if (cast) me.castShadow = true; body.add(me); return me; };
  add(G_.shell, paint, true); add(G_.wheels, carMats.wheel, true); add(G_.lamps, carMats.lamps);
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
  // clear-coated paint: a sharp reflection of the sky over the colour, like a freshly washed car
  carPaint = C.cars.map((c) => { const m = quality === 'low' ? M(c, 0.32, 0.45) : new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.38, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.3 }); m.vertexColors = true; return m; });
  if (copMats) Object.values(copMats).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
  copMats = {
    body: (() => { const m = quality === 'low' ? M(C.cop.body, 0.32, 0.45) : new THREE.MeshPhysicalMaterial({ color: C.cop.body, roughness: 0.38, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 }); m.vertexColors = true; return m; })(), panelMat: M(C.cop.panel, 0.35, 0.4), stripeMat: new THREE.MeshLambertMaterial({ color: C.cop.stripe }),
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
  // a set aim point (behind you for a stop, your back wheel for a PIT), else just ahead of where you're going
  const tx = u.aimX != null ? u.aimX : S.x + Math.sin(S.psi) * S.v * lead, tz = u.aimX != null ? u.aimZ : S.z + Math.cos(S.psi) * S.v * lead;
  const want = Math.atan2(tx - u.x, tz - u.z), turn = u.kind === 'moto' ? 2.8 : 1.8;
  u.yaw += clamp(wrapPi(want - u.yaw), -turn * d, turn * d);
  const nx = u.x + Math.sin(u.yaw) * u.v * d, nz = u.z + Math.cos(u.yaw) * u.v * d;
  if (buildingAt(nx + Math.sin(u.yaw) * 2, nz + Math.cos(u.yaw) * 2, 0.4) >= 0 || landAt(nx, nz) === 1) { u.v *= 0.5; if (snapToGraph(u)) u.freeCd = 2; return; }
  u.x = nx; u.z = nz;
}
