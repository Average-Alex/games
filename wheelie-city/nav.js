// Wheelie City — GPS: pick a destination on the city map, route it over the real road graph, guide the rider there.
'use strict';

let route = null;   // { pts: [x,z,...], cum: [], man: [{dist, text, kind, angle}], dest: {x,z,name}, total }
const NAV = { idx: 0, prog: 0, off: 0, offT: 0, cd: 0, ribbonT: 0, entries: null, view: null, layer: null, layerKey: '', drag: null, hover: '' };

// ---------------------------------------------------------------- routing (A* over the junction graph)
const routable = (e) => MAP.eCls[e] <= 13;
const edgeCost = (e) => MAP.eLen[e] / Math.max(4, RC[MAP.eCls[e]].v || 4) * (MAP.eCls[e] === 8 ? 2.5 : MAP.eCls[e] === 7 ? 1.6 : 1);
const VMAX = 27;

function findRoute(sx, sz, heading, tx, tz) {
  const m = MAP;
  const q0 = roadQuery(sx, sz, 400, routable); if (q0.e < 0) return null;
  const e0 = q0.e, s0 = q0.s;
  const q1 = roadQuery(tx, tz, 800, routable); if (q1.e < 0) return null;
  const e1 = q1.e, s1 = q1.s;
  const N = m.N, g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-2);
  const v0 = Math.max(4, RC[m.eCls[e0]].v || 4), v1 = Math.max(4, RC[m.eCls[e1]].v || 4);
  const one0 = m.eFlag[e0] & F_ONEWAY, one1 = m.eFlag[e1] & F_ONEWAY;
  // binary heap of [f, node]
  const hf = [], hn = [];
  const push = (n, f) => { let i = hf.length; hf.push(f); hn.push(n); while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [hf[p], hf[i]] = [hf[i], hf[p]]; [hn[p], hn[i]] = [hn[i], hn[p]]; i = p; } };
  const pop = () => { const f = hf[0], n = hn[0], lf = hf.pop(), ln = hn.pop(); if (hf.length) { hf[0] = lf; hn[0] = ln; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < hf.length && hf[l] < hf[s]) s = l; if (r < hf.length && hf[r] < hf[s]) s = r; if (s === i) break; [hf[s], hf[i]] = [hf[i], hf[s]]; [hn[s], hn[i]] = [hn[i], hn[s]]; i = s; } } return [f, n]; };
  const h = (n) => Math.hypot(m.nx[n] - tx, m.nz[n] - tz) / VMAX;
  // start: leave the current edge towards b (always) or towards a (two-way only); a small penalty for turning around
  const fwd = edgePoint(e0, s0, { x: 0, z: 0, tx: 0, tz: 0 }), facing = fwd.tx * Math.sin(heading) + fwd.tz * Math.cos(heading);
  const startDir = new Map();
  const seed = (n, cost, dir) => { if (cost < g[n]) { g[n] = cost; prev[n] = -1; startDir.set(n, dir); push(n, cost + h(n)); } };
  seed(m.eB[e0], (m.eLen[e0] - s0) / v0 + (facing < 0 ? 4 : 0), 1);
  if (!one0) seed(m.eA[e0], s0 / v0 + (facing > 0 ? 4 : 0), -1);
  // goal: reach the destination edge's ends, then ride along it to the point
  const goals = new Map();
  goals.set(m.eA[e1], { extra: s1 / v1, dir: 1 });
  if (!one1) { const ex = (m.eLen[e1] - s1) / v1, cur = goals.get(m.eB[e1]); if (!cur || ex < cur.extra) goals.set(m.eB[e1], { extra: ex, dir: -1 }); }
  let best = Infinity, bestN = -1, guard = 0;
  while (hf.length && guard++ < 400000) {
    const [f, n] = pop();
    if (f >= best) break;
    if (f > g[n] + h(n) + 1e-6) continue;
    const gl = goals.get(n);
    if (gl && g[n] + gl.extra < best) { best = g[n] + gl.extra; bestN = n; }
    for (let k = m.adjS[n]; k < m.adjS[n + 1]; k++) {
      const ent = m.adj[k], e = ent >> 1, rev = ent & 1;
      if (!routable(e) || ((m.eFlag[e] & F_ONEWAY) && rev)) continue;
      const nb = rev ? m.eA[e] : m.eB[e], ng = g[n] + edgeCost(e);
      if (ng < g[nb]) { g[nb] = ng; prev[nb] = ent; push(nb, ng + h(nb)); }
    }
  }
  // same edge, straight there?
  let direct = null;
  if (e0 === e1) {
    if (s1 >= s0) direct = { cost: (s1 - s0) / v0, dir: 1 };
    else if (!one0) direct = { cost: (s0 - s1) / v0, dir: -1 };
  }
  // build the polyline and the list of legs (edge, direction, first point index)
  const pts = [], legs = [];
  const add = (x, z) => { const n = pts.length; if (n && Math.hypot(x - pts[n - 2], z - pts[n - 1]) < 0.4) return; pts.push(x, z); };
  const EPq = { x: 0, z: 0, tx: 0, tz: 0 };
  const slice = (e, a, b) => {
    const o0 = m.eOff[e], o1 = m.eOff[e + 1] - 1;
    legs.push({ e, at: Math.max(0, pts.length / 2 - 1) });
    edgePoint(e, a, EPq); add(EPq.x, EPq.z);
    if (b > a) { for (let i = o0; i <= o1; i++) if (m.pc[i] > a && m.pc[i] < b) add(m.px[i], m.pz[i]); }
    else for (let i = o1; i >= o0; i--) if (m.pc[i] < a && m.pc[i] > b) add(m.px[i], m.pz[i]);
    edgePoint(e, b, EPq); add(EPq.x, EPq.z);
  };
  add(sx, sz);
  if (direct && direct.cost <= best) slice(e0, s0, s1);
  else {
    if (bestN < 0) return null;
    const ents = [];
    let n = bestN;
    while (prev[n] >= 0) { const ent = prev[n]; ents.push(ent); n = ent & 1 ? m.eB[ent >> 1] : m.eA[ent >> 1]; }
    ents.reverse();
    const sd = startDir.get(n);
    slice(e0, s0, sd > 0 ? m.eLen[e0] : 0);
    for (const ent of ents) { const e = ent >> 1; slice(e, ent & 1 ? m.eLen[e] : 0, ent & 1 ? 0 : m.eLen[e]); }
    const gd = goals.get(bestN);
    slice(e1, gd.dir > 0 ? 0 : m.eLen[e1], s1);
  }
  add(tx, tz);
  const cum = [0];
  for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
  return { pts, cum, legs, total: cum[cum.length - 1] };
}

// Turn-by-turn: a manoeuvre wherever the street name changes or the road bends hard at a junction
function legName(e) { const lb = roadLabel(e); return lb.name && lb.ref ? `${lb.name} (${lb.ref})` : lb.name || lb.ref || (MAP.eCls[e] === 8 ? 'the alley' : 'the road'); }
function buildManeuvers(r) {
  const m = MAP, P = r.pts, man = [];
  const heading = (i, back) => {
    // direction of travel arriving at (back) or leaving (forward) point i
    for (let k = 1; k < 30; k++) {
      const j = back ? i - k : i + k; if (j < 0 || j * 2 >= P.length) break;
      const dx = back ? P[i * 2] - P[j * 2] : P[j * 2] - P[i * 2], dz = back ? P[i * 2 + 1] - P[j * 2 + 1] : P[j * 2 + 1] - P[i * 2 + 1], L = Math.hypot(dx, dz);
      if (L > 6) return [dx / L, dz / L];
    }
    return null;
  };
  for (let k = 1; k < r.legs.length; k++) {
    const a = r.legs[k - 1], b = r.legs[k], i = b.at;
    const na = legName(a.e), nb = legName(b.e);
    const hi = heading(i, true), ho = heading(i, false);
    if (!hi || !ho) continue;
    const cross = hi[0] * ho[1] - hi[1] * ho[0], dot = clamp(hi[0] * ho[0] + hi[1] * ho[1], -1, 1);
    const ang = Math.acos(dot) * (cross > 0 ? 1 : -1);    // + is right (gx is west)
    const ca = m.eCls[a.e], cb = m.eCls[b.e], absA = Math.abs(ang);
    if (na === nb && absA < 0.6) continue;
    const side = ang > 0 ? 'right' : 'left';
    let text, kind;
    if ((cb === 9 || cb === 10) && ca !== 9 && ca !== 10) { text = absA > 0.3 ? `Take the ramp on the ${side}` : 'Take the ramp'; kind = absA > 0.3 ? (ang > 0 ? 'sright' : 'sleft') : 'straight'; }
    else if ((ca === 9 || ca === 10) && (cb === 0 || cb === 1)) { text = `Merge onto ${nb}`; kind = 'straight'; }
    else if (absA < 0.35) { text = `Continue onto ${nb}`; kind = 'straight'; }
    else if (absA < 1.0) { text = `Keep ${side} onto ${nb}`; kind = ang > 0 ? 'sright' : 'sleft'; }
    else if (absA < 2.6) { text = `Turn ${side} onto ${nb}`; kind = side; }
    else { text = `Make a U-turn onto ${nb}`; kind = 'uturn'; }
    // fold back-to-back manoeuvres onto the same street (divided-road junctions)
    const last = man[man.length - 1];
    if (last && r.cum[i] - last.dist < 25 && last.street === nb) continue;
    man.push({ dist: r.cum[i], text, kind, street: nb });
  }
  man.push({ dist: r.total, text: `Arrive at ${r.dest.name}`, kind: 'arrive' });
  r.man = man;
}
function destName(x, z) {
  const q = roadQuery(x, z, 40);
  const mu = muniAt(x, z), pl = placeAt(x, z);
  const road = q.e >= 0 && q.d < q.hw + 25 ? roadLabel(q.e).name : '';
  return [road || pl, mu].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') || C.name;
}
function setDestination(x, z, name) {
  const dest = { x, z, name: name || destName(x, z) };
  const t0 = performance.now();
  const r = findRoute(S.x, S.z, S.psi, x, z);
  if (!r) { popup('No route there', 'bad'); return false; }
  r.dest = dest; buildManeuvers(r);
  route = r; NAV.idx = 0; NAV.prog = 0; NAV.off = 0; NAV.offT = 0; NAV.cd = 2;
  NAV.ribbonT = 0; NAV.layerKey = '';
  showBeacon(true);
  if (window.WC_DEBUG) console.log('route', Math.round(performance.now() - t0), 'ms', Math.round(r.total), 'm');
  return true;
}
function clearRoute() {
  route = null; showBeacon(false);
  if (NAV.ribbon) NAV.ribbon.visible = false;
  $('#nav').hidden = true;
}
function reroute() {
  if (!route) return;
  const d = route.dest, r = findRoute(S.x, S.z, S.psi, d.x, d.z);
  if (!r) return;
  r.dest = d; buildManeuvers(r); route = r; NAV.idx = 0; NAV.offT = 0; NAV.cd = 3;
  popup('Rerouting', '');
}

// ---------------------------------------------------------------- in-world guidance: chevron ribbon and a light beam at the destination
const navTex = (() => {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 64, 128);
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 16; g.beginPath(); g.moveTo(8, 92); g.lineTo(32, 40); g.lineTo(56, 92); g.stroke();
  g.strokeStyle = '#ff3dd1'; g.lineWidth = 10; g.beginPath(); g.moveTo(8, 92); g.lineTo(32, 40); g.lineTo(56, 92); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
})();
const navMat = new THREE.MeshBasicMaterial({ map: navTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.92 });
const beacon = (() => {
  const g = new THREE.Group();
  const col = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 400, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#ff3dd1', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  col.position.y = 200; g.add(col);
  const ring = new THREE.Mesh(new THREE.RingGeometry(5, 6.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3dd1', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  ring.position.y = 0.3; g.add(ring);
  g.visible = false; scene.add(g);
  return g;
})();
function showBeacon(on) { beacon.visible = on; if (on && route) beacon.position.set(route.dest.x, 0, route.dest.z); }
function buildRibbon() {
  if (NAV.ribbon) { scene.remove(NAV.ribbon); NAV.ribbon.geometry.dispose(); NAV.ribbon = null; }
  if (!route) return;
  const P = route.pts, cum = route.cum, n = P.length / 2, w = 0.75;
  const pos = [], uv = [];
  const end = NAV.prog + 420;
  let first = Math.max(0, NAV.idx);
  for (let i = first; i < n - 1 && cum[i] < end; i++) {
    const nrm = (j) => {
      const a = Math.max(0, j - 1), b = Math.min(n - 1, j + 1), dx = P[b * 2] - P[a * 2], dz = P[b * 2 + 1] - P[a * 2 + 1], L = Math.hypot(dx, dz) || 1;
      return [-dz / L, dx / L];
    };
    const [ax, az] = nrm(i), [bx, bz] = nrm(i + 1);
    const x0 = P[i * 2], z0 = P[i * 2 + 1], x1 = P[i * 2 + 2], z1 = P[i * 2 + 3], y = 0.22;
    const v0 = cum[i] / 3.5, v1 = cum[i + 1] / 3.5;
    pos.push(x0 - ax * w, y, z0 - az * w, x1 - bx * w, y, z1 - bz * w, x1 + bx * w, y, z1 + bz * w, x0 - ax * w, y, z0 - az * w, x1 + bx * w, y, z1 + bz * w, x0 + ax * w, y, z0 + az * w);
    uv.push(1, v0, 1, v1, 0, v1, 1, v0, 0, v1, 0, v0);
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  NAV.ribbon = new THREE.Mesh(g, navMat); NAV.ribbon.renderOrder = 5; NAV.ribbon.frustumCulled = false;
  scene.add(NAV.ribbon);
}

// ---------------------------------------------------------------- per-frame guidance
const fmtDist = (m) => (m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`);
const ARROW = { straight: 0, sright: 40, right: 90, sleft: -40, left: -90, uturn: 180, arrive: 0 };
function navTick(dt) {
  if (!route) return;
  const P = route.pts, n = P.length / 2, px = S.crashed && S.cb ? S.cb.x : S.x, pz = S.crashed && S.cb ? S.cb.z : S.z;
  // progress along the route: search a window ahead of where we were
  let best = 1e9, bi = NAV.idx, bt = 0;
  const lo = Math.max(0, NAV.idx - 4), hi = Math.min(n - 2, NAV.idx + 80);
  for (let i = lo; i <= hi; i++) {
    const ax = P[i * 2], az = P[i * 2 + 1], dx = P[i * 2 + 2] - ax, dz = P[i * 2 + 3] - az, L2 = dx * dx + dz * dz || 1e-6;
    const t = clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1), d = Math.hypot(px - ax - dx * t, pz - az - dz * t);
    if (d < best) { best = d; bi = i; bt = t; }
  }
  NAV.idx = bi; NAV.off = best;
  NAV.prog = route.cum[bi] + bt * (route.cum[bi + 1] - route.cum[bi]);
  // arrived?
  const dd = Math.hypot(route.dest.x - px, route.dest.z - pz);
  if (!S.crashed && (dd < 22 || (route.total - NAV.prog < 12 && best < 25))) {
    const bonus = Math.round(250 + route.total * 0.25);
    banked += bonus; popup(`Arrived · ${route.dest.name}`, 'place'); popup(`Delivery +${bonus.toLocaleString()}`, 'bank');
    clearRoute(); return;
  }
  // off the route for a while: work out a new one
  NAV.cd -= dt;
  if (!S.crashed && best > 28) NAV.offT += dt; else NAV.offT = 0;
  if (NAV.offT > 1.4 && NAV.cd <= 0) { reroute(); return; }
  // chevrons on the road ahead
  NAV.ribbonT -= dt;
  if (NAV.ribbonT <= 0) { NAV.ribbonT = 0.25; buildRibbon(); }
  navTex.offset.y -= dt * 0.9;
  // HUD
  const next = route.man.find((mm) => mm.dist > NAV.prog + 2) || route.man[route.man.length - 1];
  const el = $('#nav'); el.hidden = false;
  $('#navNext').innerHTML = `<b>${fmtDist(Math.max(0, next.dist - NAV.prog))}</b>${esc(next.text)}`;
  const eta = (route.total - NAV.prog) / Math.max(8, S.v || 8);
  $('#navRest').textContent = `${fmtDist(route.total - NAV.prog)} to ${route.dest.name} · ${Math.max(1, Math.round(eta / 60))} min`;
  $('#navArrow').style.transform = `rotate(${ARROW[next.kind] || 0}deg)`;
}
// Route on the minimap
function drawRouteMini(g, P) {
  if (!route) return;
  const R = route.pts;
  g.strokeStyle = '#ff3dd1'; g.lineWidth = 4; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  let started = false;
  for (let i = Math.max(0, NAV.idx); i < R.length / 2; i++) {
    const [x, y] = P(R[i * 2], R[i * 2 + 1]);
    if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
    if (route.cum[i] - NAV.prog > 600) break;
  }
  g.stroke();
  const [dx, dy] = P(route.dest.x, route.dest.z);
  g.fillStyle = '#ff3dd1'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(dx, dy, 5, 0, TAU); g.fill(); g.stroke();
}

// ---------------------------------------------------------------- the city map: zoom, pan, click to set a destination, search
const bmCv = $('#bigmapCv'), bmCtx = bmCv.getContext('2d'), BW = 1200, BH = 760;
function bmFit() { return Math.min(BW / cityMapCv.width, BH / cityMapCv.height); }
function bmCenterOn(x, z, metresWide) {
  const k = cityMapK, sc = Math.max(bmFit(), BW / (metresWide * k));
  NAV.view = { sc, ox: BW / 2 - (MAP.gx1 - x) * k * sc, oy: BH / 2 - (MAP.gz1 - z) * k * sc };
}
const bmToWorld = (px, py) => { const v = NAV.view, k = cityMapK; return [MAP.gx1 - (px - v.ox) / (v.sc * k), MAP.gz1 - (py - v.oy) / (v.sc * k)]; };
const bmToScreen = (x, z) => { const v = NAV.view, k = cityMapK; return [v.ox + (MAP.gx1 - x) * k * v.sc, v.oy + (MAP.gz1 - z) * k * v.sc]; };
function openCityMap() {
  if (!cityMapCv) renderCityMap();
  if (!NAV.entries) buildNavIndex();
  bmCenterOn(S.x, S.z, route ? Math.max(3000, Math.hypot(route.dest.x - S.x, route.dest.z - S.z) * 1.6) : 6000);
  if (route) { const v = NAV.view; const [ax, ay] = bmToScreen(S.x, S.z), [bx, by] = bmToScreen(route.dest.x, route.dest.z); v.ox += BW / 2 - (ax + bx) / 2; v.oy += BH / 2 - (ay + by) / 2; }
  NAV.layerKey = '';
}
// Vector streets for zoomed-in views, cached until the view changes
function bmLayer() {
  const v = NAV.view, key = `${v.sc.toFixed(5)},${v.ox.toFixed(1)},${v.oy.toFixed(1)}`;
  if (NAV.layerKey === key && NAV.layer) return NAV.layer;
  NAV.layerKey = key;
  if (!NAV.layer) { NAV.layer = document.createElement('canvas'); NAV.layer.width = BW; NAV.layer.height = BH; }
  const g = NAV.layer.getContext('2d'), m = MAP, mpp = 1 / (v.sc * cityMapK);
  g.clearRect(0, 0, BW, BH);
  if (mpp > 5) return NAV.layer;
  const [x0, z0] = bmToWorld(BW, BH), [x1, z1] = bmToWorld(0, 0);
  const a0 = m.cellIx(Math.min(x0, x1)), a1 = m.cellIx(Math.max(x0, x1)), b0 = m.cellIz(Math.min(z0, z1)), b1 = m.cellIz(Math.max(z0, z1));
  const seen = new Uint8Array(0);
  void seen;
  g.lineCap = 'round';
  const drawn = new Set();
  for (let pass = 0; pass < 3; pass++) {
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
      const c = b * m.GW + a;
      for (let q = m.segGrid.start[c]; q < m.segGrid.start[c + 1]; q++) {
        const i = m.segGrid.items[q], e = m.pE[i], R = RC[m.eCls[e]];
        const lvl = R.hwy ? 2 : m.eCls[e] <= 4 ? 1 : 0;
        if (lvl !== pass || drawn.has(i)) continue; drawn.add(i);
        const [sx, sy] = bmToScreen(m.px[i], m.pz[i]), [ex, ey] = bmToScreen(m.px[i + 1], m.pz[i + 1]);
        g.strokeStyle = R.hwy ? '#f0b64a' : lvl ? '#e2ded4' : R.path ? '#6a675e' : '#a9a59b';
        g.lineWidth = Math.max(R.path ? 1 : 1.6, m.eHW[e] * 2 / mpp);
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
      }
    }
  }
  // street names along longer edges when well zoomed in
  if (mpp < 2.2) {
    g.font = '700 12px "Archivo", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const used = new Set();
    for (const i of drawn) {
      const e = m.pE[i], nm = m.names[m.eName[e]];
      if (!nm || used.has(nm + (i >> 6)) || m.eLen[e] < 60 || RC[m.eCls[e]].path) continue;
      const len = m.pc[i + 1] - m.pc[i]; if (len < 50) continue;
      used.add(nm + (i >> 6));
      const [sx, sy] = bmToScreen(m.px[i], m.pz[i]), [ex, ey] = bmToScreen(m.px[i + 1], m.pz[i + 1]);
      let ang = Math.atan2(ey - sy, ex - sx); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      g.save(); g.translate((sx + ex) / 2, (sy + ey) / 2); g.rotate(ang);
      g.strokeStyle = 'rgba(12,13,19,.9)'; g.lineWidth = 3; g.strokeText(nm, 0, 0); g.fillStyle = '#f3efe7'; g.fillText(nm, 0, 0);
      g.restore();
    }
  }
  return NAV.layer;
}
function drawBigMap() {
  if (!cityMapCv || !NAV.view) return;
  const g = bmCtx, v = NAV.view, m = MAP;
  g.fillStyle = '#0c0d13'; g.fillRect(0, 0, BW, BH);
  g.imageSmoothingEnabled = true;
  g.drawImage(cityMapCv, v.ox, v.oy, cityMapCv.width * v.sc, cityMapCv.height * v.sc);
  g.drawImage(bmLayer(), 0, 0);
  // route
  if (route) {
    const R = route.pts;
    g.strokeStyle = '#ff3dd1'; g.lineWidth = 5; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
    for (let i = Math.max(0, NAV.idx); i < R.length / 2; i++) { const [x, y] = bmToScreen(R[i * 2], R[i * 2 + 1]); if (i === Math.max(0, NAV.idx)) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    const [dx, dy] = bmToScreen(route.dest.x, route.dest.z);
    g.fillStyle = '#ff3dd1'; g.strokeStyle = '#fff'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx - 9, dy - 16); g.arc(dx, dy - 20, 9.5, Math.PI * 0.8, Math.PI * 0.2); g.closePath(); g.fill(); g.stroke();
    g.font = '800 15px "Archivo", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 4;
    const label = `${route.dest.name} · ${fmtDist(route.total - NAV.prog)}`;
    g.strokeText(label, dx, dy - 36); g.fillText(label, dx, dy - 36);
  }
  // your spawn point
  const sp = store.get(`wc-spawn-${cityKey}`, null);
  if (sp) { const [sx, sy] = bmToScreen(sp[0], sp[1]); g.fillStyle = '#37e0cf'; g.strokeStyle = '#0c0d13'; g.lineWidth = 2; g.fillRect(sx - 6, sy - 6, 12, 12); g.strokeRect(sx - 6, sy - 6, 12, 12); g.font = '800 12px "Archivo", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#37e0cf'; g.fillText('SPAWN', sx, sy - 10); }
  // transit lines and stations
  if (MAP.lines.length) {
    g.lineWidth = 3; g.strokeStyle = 'rgba(43,107,255,.85)';
    for (const ln of MAP.lines) { g.beginPath(); for (let i = 0; i < ln.xs.length; i += 2) { const [x, y] = bmToScreen(ln.xs[i], ln.zs[i]); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = '#fff'; g.strokeStyle = '#2b6bff';
    for (const ln of MAP.lines) for (const st of ln.stations) { const [x, y] = bmToScreen(st.x, st.z); g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill(); g.stroke(); }
  }
  const fl = Math.floor(performance.now() / 250) % 2;
  for (const u of units) if (u.on && u.kind !== 'car') { const [px, py] = bmToScreen(u.x, u.z); g.fillStyle = fl ? '#ff2236' : '#2b6bff'; g.beginPath(); g.arc(px, py, 4, 0, TAU); g.fill(); }
  const [px, py] = bmToScreen(S.x, S.z);
  g.save(); g.translate(px, py); g.rotate(-S.psi);
  g.fillStyle = '#ff3d7f'; g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
  g.restore();
  g.fillStyle = '#f3efe7'; g.font = '800 20px "Archivo", sans-serif'; g.textAlign = 'left';
  g.fillText(`${C.name.toUpperCase()}`, 16, 32);
  if (NAV.hover) { g.font = '700 14px "Archivo", sans-serif'; g.fillStyle = '#d8d4ca'; g.fillText(NAV.hover, 16, 54); }
  void m;
}
const bmXY = (ev) => { const r = bmCv.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * BW, (ev.clientY - r.top) / r.height * BH]; };
bmCv.addEventListener('wheel', (ev) => {
  if (!NAV.view) return;
  ev.preventDefault();
  const [px, py] = bmXY(ev), v = NAV.view, f = Math.exp(-ev.deltaY * 0.0016);
  const sc = clamp(v.sc * f, bmFit(), 40 / cityMapK / 4);
  v.ox = px - (px - v.ox) * sc / v.sc; v.oy = py - (py - v.oy) * sc / v.sc; v.sc = sc;
}, { passive: false });
bmCv.addEventListener('pointerdown', (ev) => { if (!NAV.view || ev.button !== 0) return; const [px, py] = bmXY(ev); NAV.drag = { px, py, ox: NAV.view.ox, oy: NAV.view.oy, moved: false }; bmCv.setPointerCapture(ev.pointerId); });
bmCv.addEventListener('pointermove', (ev) => {
  if (!NAV.view) return;
  const [px, py] = bmXY(ev);
  if (NAV.drag) {
    const dx = px - NAV.drag.px, dy = py - NAV.drag.py;
    if (Math.hypot(dx, dy) > 4) { NAV.drag.moved = true; bmCv.classList.add('drag'); }
    if (NAV.drag.moved) { NAV.view.ox = NAV.drag.ox + dx; NAV.view.oy = NAV.drag.oy + dy; }
  }
  const [x, z] = bmToWorld(px, py);
  NAV.hoverT = (NAV.hoverT || 0) + 1;
  if (NAV.hoverT % 3 === 0) NAV.hover = destName(x, z);
});
bmCv.addEventListener('pointerup', (ev) => {
  if (!NAV.drag) return;
  const moved = NAV.drag.moved; NAV.drag = null; bmCv.classList.remove('drag');
  if (moved) return;
  const [px, py] = bmXY(ev), [x, z] = bmToWorld(px, py);
  if (x < MAP.gx0 || x > MAP.gx1 || z < MAP.gz0 || z > MAP.gz1) return;
  if (NAV.clickMode === 'spawn') {
    const q = roadQuery(x, z, 300, drivable);
    if (q.e < 0) { $('#bmHint').textContent = 'No road near there'; return; }
    edgePoint(q.e, q.s, EP);
    store.set(`wc-spawn-${cityKey}`, [EP.x, EP.z]);
    const nm = destName(EP.x, EP.z);
    popup(`Spawn point: ${nm}`, 'place'); $('#bmHint').textContent = `Spawn point set: ${nm}. You'll start here next ride.`;
    return;
  }
  if (setDestination(x, z)) popup(`Destination: ${route.dest.name}`, 'place');
});
bmCv.addEventListener('contextmenu', (ev) => { ev.preventDefault(); clearRoute(); });
$('#navClear').addEventListener('click', () => clearRoute());
$('#navMe').addEventListener('click', () => { bmCenterOn(S.x, S.z, 3000); });

// Search: municipalities, neighbourhoods and streets
function buildNavIndex() {
  const m = MAP, list = new Map();
  // municipality centres from the boundary raster
  const acc = new Map();
  for (let r = 0; r < m.MH; r += 2) for (let c = 0; c < m.MW; c += 2) { const v = m.muni[r * m.MW + c]; if (!v) continue; const a = acc.get(v) || [0, 0, 0]; a[0] += c; a[1] += r; a[2]++; acc.set(v, a); }
  for (const [v, a] of acc) if (a[2] > 60) list.set(`${m.munis[v]} (city)`, { x: m.gx0 + (a[0] / a[2] + 0.5) * m.mres, z: m.gz0 + (a[1] / a[2] + 0.5) * m.mres, name: m.munis[v] });
  for (const p of m.towns) if (![...list.keys()].some((k) => k.startsWith(p[0] + ' ('))) list.set(`${p[0]} (city)`, { x: p[2], z: p[3], name: p[0] });
  for (const p of m.places) if (p[2] > m.gx0 && p[2] < m.gx1 && p[3] > m.gz0 && p[3] < m.gz1) list.set(`${p[0]} (${p[1]})`, { x: p[2], z: p[3], name: p[0] });
  const streets = new Set();
  for (let e = 0; e < m.E; e++) { if (!routable(e)) continue; const nm = m.names[m.eName[e]]; if (nm) streets.add(nm); }
  for (const s of [...streets].sort()) list.set(`${s} (street)`, { street: s, name: s });
  NAV.entries = list;
  const dl = $('#navList'); dl.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const k of list.keys()) { const o = document.createElement('option'); o.value = k; frag.appendChild(o); }
  dl.appendChild(frag);
}
function goToEntry(text) {
  if (!NAV.entries) buildNavIndex();
  let en = NAV.entries.get(text);
  if (!en) { const low = text.trim().toLowerCase(); for (const [k, v] of NAV.entries) if (k.toLowerCase().startsWith(low)) { en = v; break; } }
  if (!en) { $('#bmHint').textContent = `Couldn't find "${text}"`; return; }
  let x = en.x, z = en.z;
  if (en.street) {
    // nearest stretch of that street to you
    const m = MAP; let bd = Infinity;
    for (let e = 0; e < m.E; e++) {
      if (m.names[m.eName[e]] !== en.street) continue;
      const i = (m.eOff[e] + m.eOff[e + 1] - 1) >> 1, d = Math.hypot(m.px[i] - S.x, m.pz[i] - S.z);
      if (d < bd) { bd = d; x = m.px[i]; z = m.pz[i]; }
    }
  }
  if (setDestination(x, z, en.name)) {
    popup(`Destination: ${route.dest.name}`, 'place');
    const v = NAV.view; if (v) { bmCenterOn((S.x + x) / 2, (S.z + z) / 2, Math.max(2500, Math.hypot(x - S.x, z - S.z) * 1.5)); }
    $('#bmHint').textContent = `${route.dest.name}: ${fmtDist(route.total)} · press N or Esc to ride`;
  }
}
$('#navSearch').addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') { goToEntry(ev.target.value); ev.target.blur(); } if (ev.key === 'Escape') ev.target.blur(); });
$('#navSearch').addEventListener('change', (ev) => { if (NAV.entries && NAV.entries.has(ev.target.value)) { goToEntry(ev.target.value); ev.target.blur(); } });
