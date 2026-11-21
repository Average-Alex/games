// Wheelie City â€” hand-built landmarks.
// The map data gives most buildings as extruded outlines, which is fine for a tower block but loses the shapes people
// recognise a city by: the Sphere is a sphere, the STRAT has its pod, Canada Place has its sails. Each landmark here
// finds itself in the map (the building at its real coordinates), hides that plain block, and puts a proper model in
// its place. They are always shown (not streamed), so you can steer by them from across the city.
'use strict';

const LMK = { group: new THREE.Group(), disp: [], anim: [] };
scene.add(LMK.group);

const lmNight = () => !!(C.night || C.dusk);
function lmStd(o) { const m = new THREE.MeshStandardMaterial(o); LMK.disp.push(m); return m; }
function lmGlow(hex, k = 1) { const m = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }); m.color.multiplyScalar(k); LMK.disp.push(m); return m; }
function lmMesh(geo, mat, x, y, z, parent = LMK.group, shadow = true) {
  const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.castShadow = shadow; me.receiveShadow = true; parent.add(me); LMK.disp.push(geo); return me;
}
// Many parts merged into one draw: add(geometry, matrix), then mesh(material)
class LmGeo {
  constructor() { this.p = []; this.n = []; this.u = []; }
  add(geo, mtx) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (mtx) g.applyMatrix4(mtx);
    const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv ? g.attributes.uv.array : null;
    for (let i = 0; i < p.length; i++) { this.p.push(p[i]); this.n.push(n[i]); }
    for (let i = 0; i < p.length / 3; i++) { this.u.push(u ? u[2 * i] : 0, u ? u[2 * i + 1] : 0); }
    geo.dispose(); if (g !== geo) g.dispose();
    return this;
  }
  // a round bar between two points
  beam(a, b, r, sides = 6) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return this.add(new THREE.CylinderGeometry(r, r, L, sides, 1, true), new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  }
  at(geo, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
    return this.add(geo, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz)));
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeBoundingSphere();
    return g;
  }
  mesh(mat, x = 0, y = 0, z = 0, parent, shadow) { return this.p.length ? lmMesh(this.geometry(), mat, x, y, z, parent, shadow) : null; }
}
const LV = (x, y, z) => new THREE.Vector3(x, y, z);

// Map buildings near a point (by the centre of their outline)
function lmNear(x, z, r) {
  const m = MAP, out = [];
  for (let b = 0; b < m.B; b++) {
    const bb = b * 4, cx = (m.bBox[bb] + m.bBox[bb + 2]) / 2, cz = (m.bBox[bb + 1] + m.bBox[bb + 3]) / 2, d = Math.hypot(cx - x, cz - z);
    if (d < r) out.push({ b, h: m.bH[b], cx, cz, d, w: m.bBox[bb + 2] - m.bBox[bb], dd: m.bBox[bb + 3] - m.bBox[bb + 1], fl: m.bFlags[b], name: m.bName[b] ? m.names[m.bName[b]] : '' });
  }
  return out;
}
const lmHide = (list) => { for (const o of list) MAP.bHide[o.b] = 1; };
const lmTallest = (list) => list.reduce((a, o) => (!a || o.h > a.h ? o : a), null);

// ---------------------------------------------------------------- Las Vegas
// The Sphere: 157 m across, 112 m tall, its whole skin an LED screen
function lmSphere(x, z) {
  const R = 78, cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.wrapS = THREE.RepeatWrapping; LMK.disp.push(tex);
  // u = 0.5 faces +x (west, towards the Strip): the shows are centred there
  const shows = [
    () => {   // an eye looking about
      const bg = g.createRadialGradient(512, 256, 60, 512, 256, 520); bg.addColorStop(0, '#f0d2bc'); bg.addColorStop(1, '#7a4a3a'); g.fillStyle = bg; g.fillRect(0, 0, 1024, 512);
      g.fillStyle = '#fbfbf8'; g.beginPath(); g.ellipse(512, 256, 210, 128, 0, 0, TAU); g.fill();
      const ir = g.createRadialGradient(512, 256, 10, 512, 256, 100); ir.addColorStop(0, '#0b2a3a'); ir.addColorStop(0.45, '#2a7fae'); ir.addColorStop(1, '#0d3550');
      g.fillStyle = ir; g.beginPath(); g.arc(512, 256, 100, 0, TAU); g.fill();
      g.fillStyle = '#050505'; g.beginPath(); g.arc(512, 256, 42, 0, TAU); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(545, 222, 16, 0, TAU); g.fill();
      g.strokeStyle = '#4a2418'; g.lineWidth = 10; g.beginPath(); g.ellipse(512, 256, 212, 130, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    },
    () => {   // the moon
      g.fillStyle = '#9c9a96'; g.fillRect(0, 0, 1024, 512);
      const r = mulberry(7);
      for (let i = 0; i < 160; i++) { const cx = r() * 1024, cy = 40 + r() * 432, rr = 4 + r() * r() * 60; g.fillStyle = `rgba(60,58,56,${0.15 + r() * 0.3})`; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.fill(); g.strokeStyle = 'rgba(220,218,214,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(cx + 1, cy + 1, rr, Math.PI * 0.9, Math.PI * 1.7); g.stroke(); }
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(70,68,72,0.35)'; g.beginPath(); g.ellipse(r() * 1024, 120 + r() * 280, 60 + r() * 120, 40 + r() * 70, r() * 3, 0, TAU); g.fill(); }
    },
    () => {   // colour waves (scrolled round in the update)
      for (let x = 0; x < 1024; x += 8) { g.fillStyle = `hsl(${(x / 1024) * 720 % 360},95%,55%)`; g.fillRect(x, 0, 8, 512); }
      g.globalCompositeOperation = 'multiply';
      for (let y = 0; y < 512; y += 32) { g.fillStyle = y % 64 ? '#ffffff' : '#7a7a9a'; g.fillRect(0, y, 1024, 32); }
      g.globalCompositeOperation = 'source-over';
    },
    () => {   // a big smiley
      g.fillStyle = '#ffcc1a'; g.fillRect(0, 0, 1024, 512);
      g.fillStyle = '#2a1a05'; g.beginPath(); g.ellipse(450, 200, 28, 50, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(574, 200, 28, 50, 0, 0, TAU); g.fill();
      g.strokeStyle = '#2a1a05'; g.lineWidth = 26; g.lineCap = 'round'; g.beginPath(); g.arc(512, 250, 130, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
    },
  ];
  let show = -1;
  const mat = lmStd({ color: '#0a0a0c', roughness: 0.4, metalness: 0.1, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: lmNight() ? 1.5 : 0.9 });
  lmMesh(new THREE.SphereGeometry(R, 72, 40), mat, x, 111.6 - R, z);
  LMK.anim.push((t) => {
    const k = Math.floor(t / 14) % shows.length;
    if (k !== show) { show = k; g.globalCompositeOperation = 'source-over'; shows[k](); tex.needsUpdate = true; tex.offset.x = 0; }
    if (k === 2) tex.offset.x = (t * 0.02) % 1;
    else if (k === 0) tex.offset.x = Math.sin(t * 0.7) * 0.03;    // the eye glances side to side
  });
}

// The STRAT: 350 m. A tripod of concrete legs, the pod of decks near the top, and the mast
function lmStrat(x, z) {
  const conc = lmStd({ color: '#ddd8cf', roughness: 0.75 }), glass = lmStd({ color: '#1c2430', roughness: 0.12, metalness: 0.7 });
  const night = lmNight(), lit = night ? lmGlow('#ffd9a0', 1.6) : glass, white = lmStd({ color: '#eeeeea', roughness: 0.5, metalness: 0.2 });
  const tower = new LmGeo();
  tower.at(new THREE.CylinderGeometry(7.5, 9, 256, 28), 0, 128, 0);
  // three legs, flared at the foot
  for (let k = 0; k < 3; k++) {
    const fin = new THREE.BoxGeometry(1, 1, 1), p = fin.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const sx = p.getX(i), sy = p.getY(i), sz = p.getZ(i), top = sy > 0;
      const r = sx > 0 ? (top ? 10 : 21) : 6, y = top ? 246 : 0, a = k * TAU / 3;
      const t = sz * 3.2;
      p.setXYZ(i, Math.cos(a) * r - Math.sin(a) * t, y, Math.sin(a) * r + Math.cos(a) * t);
    }
    fin.computeVertexNormals();
    tower.add(fin);
  }
  tower.mesh(conc, x, 0, z);
  // the pod: decks stepping out and back
  const pod = new LmGeo(), band = new LmGeo();
  pod.at(new THREE.CylinderGeometry(22, 9, 10, 40), 0, 253, 0);
  band.at(new THREE.CylinderGeometry(23, 23, 7, 40, 1, true), 0, 261.5, 0);
  pod.at(new THREE.CylinderGeometry(25, 25, 2.2, 40), 0, 266, 0);
  band.at(new THREE.CylinderGeometry(22.5, 22.5, 6, 40, 1, true), 0, 270, 0);
  pod.at(new THREE.CylinderGeometry(23.5, 23.5, 2, 40), 0, 274, 0);
  band.at(new THREE.CylinderGeometry(19.5, 19.5, 6, 40, 1, true), 0, 278, 0);
  pod.at(new THREE.CylinderGeometry(12, 20, 8, 40), 0, 285, 0);
  pod.mesh(white, x, 0, z); band.mesh(lit, x, 0, z);
  // the mast, with the ride arms and a red light on top
  const mast = new LmGeo();
  mast.at(new THREE.CylinderGeometry(1.2, 4, 64, 12), 0, 321, 0);
  for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.5; mast.beam(LV(0, 294, 0), LV(Math.cos(a) * 18, 300, Math.sin(a) * 18), 0.9); }
  mast.mesh(white, x, 0, z);
  lmMesh(new THREE.SphereGeometry(1.4, 10, 8), lmGlow('#ff2a1a', 3), x, 353.5, z, LMK.group, false);
  if (night) {
    // purple light strips up the outer edge of each leg
    const strip = new LmGeo();
    for (let k = 0; k < 3; k++) { const a = k * TAU / 3; strip.beam(LV(Math.cos(a) * 21.4, 0, Math.sin(a) * 21.4), LV(Math.cos(a) * 10.4, 246, Math.sin(a) * 10.4), 0.45, 4); }
    strip.mesh(lmGlow('#b45cff', 2.2), x, 0, z, LMK.group, false);
  }
}

// The High Roller: a 158 m observation wheel, its rim lit in changing colours at night
function lmHighRoller(x, z) {
  const R = 79, HUB = 88, steel = lmStd({ color: '#e6e8ea', roughness: 0.35, metalness: 0.7 });
  const wheel = new THREE.Group(); wheel.position.set(x, HUB, z); LMK.group.add(wheel);
  // the wheel turns in the y-z plane (its axle runs east-west: it faces the Strip)
  const frame = new LmGeo(), cab = new LmGeo();
  const P = (r, a, dx = 0) => LV(dx, Math.cos(a) * r, Math.sin(a) * r);
  const N = 28;
  for (let k = 0; k < 64; k++) {
    const a0 = k / 64 * TAU, a1 = (k + 1) / 64 * TAU;
    for (const dx of [-2.2, 2.2]) frame.beam(P(R, a0, dx), P(R, a1, dx), 0.9);
    frame.beam(P(R - 5, a0), P(R - 5, a1), 0.6);
  }
  for (let k = 0; k < N; k++) {
    const a = k / N * TAU;
    for (const dx of [-6, 6]) frame.beam(LV(dx, 0, 0), P(R - 5, a), 0.22, 4);
    frame.beam(P(R, a, -2.2), P(R - 5, a), 0.4, 4); frame.beam(P(R, a, 2.2), P(R - 5, a), 0.4, 4);
    const c = P(R + 4.5, a);
    cab.at(new THREE.SphereGeometry(4.2, 14, 10), c.x, c.y, c.z, 0, 1, 0.8, 1.25);
  }
  frame.add(new THREE.CylinderGeometry(3.2, 3.2, 14, 16).rotateZ(Math.PI / 2));
  frame.mesh(steel, 0, 0, 0, wheel);
  cab.mesh(lmStd({ color: '#9fc8e0', roughness: 0.08, metalness: 0.4, emissive: '#bfe0ff', emissiveIntensity: lmNight() ? 0.6 : 0 }), 0, 0, 0, wheel);
  // the light rings (LED strips on the rim)
  const ring = lmGlow('#ff3dbe', lmNight() ? 2.4 : 0.9);
  for (const dx of [-2.9, 2.9]) { const tg = new THREE.TorusGeometry(R, 0.35, 4, 160).rotateY(Math.PI / 2); lmMesh(tg, ring, dx, 0, 0, wheel, false); }
  // legs: an A-frame each side down to the ground
  const legs = new LmGeo();
  for (const s of [-1, 1]) for (const sz of [-1, 1]) legs.beam(LV(s * 7, HUB, 0), LV(s * 20, 0, sz * 46), 1.6, 10);
  for (const s of [-1, 1]) legs.beam(LV(s * 14, HUB * 0.35, -0.65 * 46 * 0.35 * 2), LV(s * 14, HUB * 0.35, 0.65 * 46 * 0.35 * 2), 0.8);
  legs.mesh(steel, x, 0, z);
  LMK.anim.push((t) => {
    wheel.rotation.x = -t * TAU / 1800;                                  // one turn in 30 minutes, like the real one
    if (lmNight()) ring.color.setHSL((t * 0.04) % 1, 0.95, 0.55).multiplyScalar(2.4);
  });
}

// ---------------------------------------------------------------- Vancouver
// Harbour Centre: the "Top of Vancouver" saucer and the mast on its tower
function lmHarbourCentre(x, z, h) {
  const conc = lmStd({ color: '#d6d2c6', roughness: 0.7 }), lit = lmNight() ? lmGlow('#ffd49a', 1.5) : lmStd({ color: '#26303a', roughness: 0.1, metalness: 0.75 });
  const s = new LmGeo(), b = new LmGeo();
  s.at(new THREE.CylinderGeometry(7, 7, 8, 20), 0, h + 4, 0);                 // stem over the roof
  s.at(new THREE.CylinderGeometry(21, 9, 8, 40), 0, h + 11, 0);               // underside
  b.at(new THREE.CylinderGeometry(21.5, 21.5, 7, 40, 1, true), 0, h + 18.5, 0);
  s.at(new THREE.CylinderGeometry(22.5, 22.5, 1.8, 40), 0, h + 22.9, 0);      // the rim of the lookout
  b.at(new THREE.CylinderGeometry(19, 19, 4, 40, 1, true), 0, h + 25.8, 0);
  s.at(new THREE.CylinderGeometry(11, 19.5, 5, 40), 0, h + 30.3, 0);          // roof
  s.at(new THREE.CylinderGeometry(0.6, 2.2, 30, 10), 0, h + 47.8, 0);         // mast
  s.mesh(conc, x, 0, z); b.mesh(lit, x, 0, z);
  lmMesh(new THREE.SphereGeometry(0.9, 8, 6), lmGlow('#ff2a1a', 3), x, h + 63, z, LMK.group, false);
}
// Canada Place: five white sails along the pier
function lmCanadaPlace(list) {
  // the pier's long axis from the outline corners of its buildings
  const m = MAP, pts = [];
  for (const o of list) for (let i = m.bOff[o.b]; i < m.bOff[o.b + 1]; i++) pts.push([m.bx[i], m.bz[i]]);
  if (pts.length < 4) return;
  let mx = 0, mz = 0; for (const [px, pz] of pts) { mx += px; mz += pz; } mx /= pts.length; mz /= pts.length;
  let sxx = 0, szz = 0, sxz = 0; for (const [px, pz] of pts) { sxx += (px - mx) ** 2; szz += (pz - mz) ** 2; sxz += (px - mx) * (pz - mz); }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(ang), uz = Math.sin(ang);
  let lo = 1e9, hi = -1e9, wlo = 1e9, whi = -1e9;
  for (const [px, pz] of pts) { const s = (px - mx) * ux + (pz - mz) * uz, w = -(px - mx) * uz + (pz - mz) * ux; lo = Math.min(lo, s); hi = Math.max(hi, s); wlo = Math.min(wlo, w); whi = Math.max(whi, w); }
  const roof = Math.max(...list.map((o) => o.h)), sail = lmStd({ color: '#f6f6f2', roughness: 0.85, side: THREE.DoubleSide, emissive: '#fff4e0', emissiveIntensity: lmNight() ? 0.5 : 0 });
  const sails = new LmGeo();
  // the sails stand along the west side of the pier
  const wside = (-uz > 0 ? 1 : -1), wOff = wside > 0 ? whi * 0.35 : wlo * 0.35;
  for (let k = 0; k < 5; k++) {
    const s = lo + (hi - lo) * (0.18 + k * 0.16), cx = mx + ux * s - uz * wOff, cz = mz + uz * s + ux * wOff;
    const hgt = 24 + (k % 2) * 3;
    sails.at(new THREE.ConeGeometry(13, hgt, 6, 1, true), cx, roof + hgt / 2, cz, -ang, 1.35, 1, 0.9);
    // a lower pair either side gives each peak its ridged fabric look
    sails.at(new THREE.ConeGeometry(8, hgt * 0.6, 5, 1, true), cx + ux * 9, roof + hgt * 0.3, cz + uz * 9, -ang + 0.4, 1, 1, 1);
  }
  sails.mesh(sail, 0, 0, 0);
}
// Science World: the geodesic dome
function lmScienceWorld(x, z) {
  const mat = lmStd({ color: '#d4d8dc', roughness: 0.22, metalness: 0.9, flatShading: true });
  lmMesh(new THREE.IcosahedronGeometry(22, 3), mat, x, 25, z);
  // the ring of columns it stands on
  const legs = new LmGeo();
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; legs.beam(LV(Math.cos(a) * 10, 0, Math.sin(a) * 10), LV(Math.cos(a) * 14, 8, Math.sin(a) * 14), 0.9, 8); }
  legs.mesh(lmStd({ color: '#cfcac0', roughness: 0.7 }), x, 0, z);
}
// Lions Gate Bridge: the two green towers and the suspension cables over First Narrows
function lmLionsGate() {
  // the middle of the main span (over First Narrows); the bridge's line comes from the mapped road near there (the
  // road named Lions Gate Bridge also runs on along the curved north viaduct, so only the straight part is used)
  const m = MAP, [cx0, cz0] = latLonToWorld(49.3153, -123.1386), pts = [];
  for (let e = 0; e < m.E; e++) {
    const nm = m.names[m.eName[e]];
    if (!nm || !/lions gate/i.test(nm)) continue;
    for (let i = m.eOff[e]; i < m.eOff[e + 1]; i++) if (Math.hypot(m.px[i] - cx0, m.pz[i] - cz0) < 450) pts.push([m.px[i], m.pz[i]]);
  }
  if (pts.length < 2) return;
  let mx = 0, mz = 0; for (const [px, pz] of pts) { mx += px; mz += pz; } mx /= pts.length; mz /= pts.length;
  let sxx = 0, szz = 0, sxz = 0; for (const [px, pz] of pts) { sxx += (px - mx) ** 2; szz += (pz - mz) ** 2; sxz += (px - mx) * (pz - mz); }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(ang), uz = Math.sin(ang), nx = -uz, nz = ux;
  const mid = (cx0 - mx) * ux + (cz0 - mz) * uz, HALF = 236, TOP = 111, W = 9.5;
  const green = lmStd({ color: '#56705a', roughness: 0.55, metalness: 0.5 });
  const g = new LmGeo(), cab = new LmGeo();
  const at = (s, w, y) => LV(mx + ux * s + nx * w, y, mz + uz * s + nz * w);
  for (const ts of [mid - HALF, mid + HALF]) {
    for (const w of [-W, W]) {
      const base = at(ts, w * 1.15, -2), top = at(ts, w, TOP);
      g.beam(base, top, 2.4, 4);
    }
    for (const y of [28, 62, 92, TOP - 2]) g.beam(at(ts, -W, y), at(ts, W, y), 1.4, 4);
  }
  g.mesh(green, 0, 0, 0);
  // main cables: a sag between the towers, then down to the anchorages; hangers every 12 m
  const sag = (s) => {
    const a = mid - HALF, b = mid + HALF;
    if (s >= a && s <= b) { const f = (s - mid) / HALF; return 14 + (TOP - 14) * f * f; }
    const d = s < a ? a - s : s - b, L = 190; return TOP - (TOP - 3) * Math.min(1, d / L);
  };
  const s0 = mid - HALF - 190, s1 = mid + HALF + 190;
  for (const w of [-W, W]) {
    let prev = null;
    for (let s = s0; s <= s1 + 0.1; s += 8) {
      const p = at(s, w, sag(s)); if (prev) cab.beam(prev, p, 0.5, 4); prev = p;
      if (s > mid - HALF + 4 && s < mid + HALF - 4 && Math.round(s / 8) % 2 === 0) cab.beam(p, at(s, w, 2.2), 0.08, 3);
    }
  }
  cab.mesh(green, 0, 0, 0, LMK.group, false);
  if (lmNight()) {
    const dots = new LmGeo();
    for (const w of [-W, W]) for (let s = s0; s <= s1; s += 16) { const p = at(s, w, sag(s) + 0.8); dots.at(new THREE.SphereGeometry(0.6, 6, 4), p.x, p.y, p.z); }
    dots.mesh(lmGlow('#7dffa0', 2.5), 0, 0, 0, LMK.group, false);
  }
}

// ---------------------------------------------------------------- New York
// The Empire State Building's stepped art-deco crown and mast, lit at dusk
function lmEmpireState(x, z, h) {
  const stone = lmStd({ color: '#cbc4b4', roughness: 0.7 }), lit = lmNight() ? lmGlow('#ffe6b0', 1.8) : lmStd({ color: '#bfb8a8', roughness: 0.6 });
  const s = new LmGeo(), l = new LmGeo();
  s.at(new THREE.BoxGeometry(22, 8, 22), 0, h + 4, 0);
  l.at(new THREE.BoxGeometry(17, 10, 17), 0, h + 13, 0);
  s.at(new THREE.CylinderGeometry(6.5, 8.5, 14, 8), 0, h + 25, 0);
  l.at(new THREE.CylinderGeometry(5, 6.5, 8, 8), 0, h + 36, 0);
  s.at(new THREE.CylinderGeometry(1.0, 3.5, 62, 10), 0, h + 71, 0);
  s.mesh(stone, x, 0, z); l.mesh(lit, x, 0, z);
  lmMesh(new THREE.SphereGeometry(1.0, 8, 6), lmGlow('#ff2a1a', 3), x, h + 102, z, LMK.group, false);
}

// ---------------------------------------------------------------- set up per city
const LANDMARK_SITES = {
  vegas: [
    { lat: 36.1207, lon: -115.1622, r: 120, pick: (L) => L.find((o) => /^sphere$/i.test(o.name)) || lmTallest(L), hide: (L, a) => [a], build: (a) => lmSphere(a.cx, a.cz) },
    { lat: 36.1475, lon: -115.1557, r: 160, pick: (L) => L.filter((o) => o.h > 150).sort((p, q) => p.w * p.dd - q.w * q.dd)[0], hide: (L, a) => L.filter((o) => o.h > 150 && Math.hypot(o.cx - a.cx, o.cz - a.cz) < 30), build: (a) => lmStrat(a.cx, a.cz) },
    { lat: 36.1176, lon: -115.1683, r: 0, build: (a) => lmHighRoller(a.cx, a.cz) },
  ],
  van: [
    { lat: 49.2848, lon: -123.1120, r: 60, pick: (L) => lmTallest(L.filter((o) => o.w > 25)), hide: (L, a) => L.filter((o) => o.h > a.h && o.d < 35 + a.d), build: (a) => lmHarbourCentre(a.cx, a.cz, a.h) },
    { lat: 49.2888, lon: -123.1111, r: 170, pick: (L) => L.filter((o) => o.h >= 12 && o.h <= 30), build: (a) => lmCanadaPlace(a) },
    { lat: 49.2734, lon: -123.1038, r: 70, pick: (L) => L.find((o) => o.fl & 2) || lmTallest(L), hide: (L, a) => [a], build: (a) => lmScienceWorld(a.cx, a.cz) },
    { build: () => lmLionsGate() },
  ],
  nyc: [
    { lat: 40.7484, lon: -73.9857, r: 70, pick: (L) => lmTallest(L), build: (a) => lmEmpireState(a.cx, a.cz, a.h) },
  ],
};
function buildLandmarks() {
  for (const d of LMK.disp) d.dispose();
  LMK.disp = []; LMK.anim = [];
  while (LMK.group.children.length) LMK.group.remove(LMK.group.children[0]);
  const m = MAP; if (!m) return;
  m.bHide = new Uint8Array(m.B);
  for (const site of LANDMARK_SITES[cityKey] || []) {
    try {
      let a = null;
      if (site.lat !== undefined) {
        const [x, z] = latLonToWorld(site.lat, site.lon);
        if (site.r) {
          const L = lmNear(x, z, site.r);
          a = site.pick(L);
          if (!a || (Array.isArray(a) && !a.length)) continue;
          if (site.hide && !Array.isArray(a)) lmHide(site.hide(L, a));
        } else a = { cx: x, cz: z, h: 0 };
      }
      site.build(a);
    } catch (e) { console.warn('landmark', e); }
  }
}
function updateLandmarks() {
  if (!LMK.anim.length) return;
  const t = performance.now() / 1000;
  for (const f of LMK.anim) f(t);
}
