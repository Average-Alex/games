// Wheelie City — real city maps (OpenStreetMap): loading, spatial queries, streamed 3D tiles, minimap and city map.
'use strict';

// ---------------------------------------------------------------- road classes
// lanes: default total lanes (one direction for one-ways), lw: lane width, v: traffic speed (m/s),
// drive: traffic may use it, rank: draw order, park: parking/gutter width each side, sh: shoulder each side
const RC = [
  { label: 'Highway', lanes: 3, lw: 3.7, v: 27, drive: true, rank: 6, park: 0, sh: 1.8, hwy: true },        // 0 motorway
  { label: 'Highway', lanes: 4, lw: 3.6, v: 21, drive: true, rank: 5, park: 0, sh: 1.2, hwy: true },        // 1 trunk
  { lanes: 4, lw: 3.4, v: 15, drive: true, rank: 4, park: 2.2, sh: 0, walk: true },                          // 2 primary
  { lanes: 2, lw: 3.4, v: 14, drive: true, rank: 3, park: 2.2, sh: 0, walk: true },                          // 3 secondary
  { lanes: 2, lw: 3.3, v: 13, drive: true, rank: 3, park: 2.2, sh: 0, walk: true },                          // 4 tertiary
  { lanes: 2, lw: 3.1, v: 11, drive: true, rank: 2, park: 1.0, sh: 0, walk: true },                          // 5 unclassified
  { lanes: 2, lw: 3.0, v: 10, drive: true, rank: 2, park: 1.2, sh: 0, walk: true },                          // 6 residential
  { lanes: 2, lw: 2.8, v: 5, drive: true, rank: 2, park: 0.6, sh: 0, walk: true },                           // 7 living street
  { label: 'Alley', lanes: 1, lw: 4.8, v: 5, drive: false, rank: 1, park: 0, sh: 0 },                        // 8 alley
  { lanes: 1, lw: 3.8, v: 19, drive: true, rank: 5, park: 0, sh: 1.2, hwy: true },                          // 9 motorway link
  { lanes: 1, lw: 3.7, v: 15, drive: true, rank: 4, park: 0, sh: 0.8, hwy: true },                          // 10 trunk link
  { lanes: 1, lw: 3.6, v: 12, drive: true, rank: 4, park: 0, sh: 0.4 },                                      // 11 primary link
  { lanes: 1, lw: 3.5, v: 11, drive: true, rank: 3, park: 0, sh: 0.4 },                                      // 12 secondary link
  { lanes: 1, lw: 3.4, v: 10, drive: true, rank: 3, park: 0, sh: 0.4 },                                      // 13 tertiary link
  { label: 'Plaza', lanes: 1, lw: 7, v: 0, drive: false, rank: 1, park: 0, sh: 0, path: true },              // 14 pedestrian
  { label: 'Bike path', lanes: 1, lw: 3.0, v: 0, drive: false, rank: 1, park: 0, sh: 0, path: true },        // 15 cycleway
  { label: 'Path', lanes: 1, lw: 2.4, v: 0, drive: false, rank: 0, park: 0, sh: 0, path: true },             // 16 footway / path
];
const F_ONEWAY = 1, F_BRIDGE = 2, F_TUNNEL = 4, F_ROUND = 8;
const TILE = 160, CELL = 32;
const roadY = (rank) => 0.05 + rank * 0.006;

let MAP = null;                       // the loaded city
const mapWaiters = {};
window.WC_MAP = (key, meta, b64) => { const w = mapWaiters[key]; if (w) { delete mapWaiters[key]; w(meta, b64); } };

function loadMap(key, onStatus) {
  if (MAP && MAP.key === key) return Promise.resolve(MAP);
  return new Promise((resolve, reject) => {
    mapWaiters[key] = async (meta, b64) => {
      try { onStatus && onStatus('Unpacking streets…'); await new Promise((r) => setTimeout(r, 30)); resolve(await decodeMap(meta, b64)); }
      catch (e) { reject(e); }
    };
    const s = document.createElement('script');
    s.src = `wheelie-city/maps/${key}.js`;
    s.onerror = () => { delete mapWaiters[key]; reject(new Error(`Couldn't load the ${CITIES[key].name} map file (wheelie-city/maps/${key}.js).`)); };
    s.onload = () => s.remove();
    document.head.appendChild(s);
  });
}

async function decodeMap(meta, b64) {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (!('DecompressionStream' in window)) throw new Error('This browser is too old to unpack the map (needs DecompressionStream). Try a current Chrome, Edge, Firefox or Safari.');
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const T = { int32: Int32Array, int16: Int16Array, uint8: Uint8Array, uint16: Uint16Array };
  const sec = (n) => { const [o, len, dt] = meta.secs[n]; return new T[dt](buf, o, len); };
  const u = meta.unit;
  const m = { key: meta.key, meta, gx0: meta.bbox[0], gz0: meta.bbox[1], gx1: meta.bbox[2], gz1: meta.bbox[3] };

  // nodes
  const nI = sec('nodes'), N = nI.length / 2;
  m.N = N; m.nx = new Float32Array(N); m.nz = new Float32Array(N); m.nflag = sec('nodeFlags');
  for (let i = 0; i < N; i++) { m.nx[i] = nI[2 * i] * u; m.nz[i] = nI[2 * i + 1] * u; }

  // edges and their polylines (every edge's points start at node a and end at node b)
  const E = sec('edges'), nE = E.length / 6, dp = sec('ePts');
  m.E = nE;
  m.eA = new Int32Array(nE); m.eB = new Int32Array(nE); m.eCls = new Uint8Array(nE); m.eFlag = new Uint8Array(nE); m.eLanes = new Uint8Array(nE);
  m.eName = new Uint16Array(nE); m.eRef = new Uint16Array(nE); m.eOff = new Int32Array(nE + 1); m.eLen = new Float32Array(nE); m.eHW = new Float32Array(nE);
  let tot = 0;
  for (let e = 0; e < nE; e++) { m.eOff[e] = tot; tot += E[6 * e + 3] + 1; }
  m.eOff[nE] = tot;
  m.px = new Float32Array(tot); m.pz = new Float32Array(tot); m.pc = new Float32Array(tot); m.pE = new Int32Array(tot);
  for (let e = 0; e < nE; e++) {
    const a = E[6 * e], b = E[6 * e + 1], st = E[6 * e + 2], cnt = E[6 * e + 3], info = E[6 * e + 4], nm = E[6 * e + 5];
    m.eA[e] = a; m.eB[e] = b; m.eCls[e] = info & 255; m.eFlag[e] = (info >> 8) & 255; m.eLanes[e] = (info >> 16) & 255;
    m.eName[e] = nm & 0xffff; m.eRef[e] = (nm >>> 16) & 0xffff;
    let o = m.eOff[e], x = m.nx[a], z = m.nz[a], c = 0;
    m.px[o] = x; m.pz[o] = z; m.pc[o] = 0; m.pE[o] = e;
    for (let k = 0; k < cnt; k++) {
      const nxp = x + dp[2 * (st + k)] * u, nzp = z + dp[2 * (st + k) + 1] * u;
      c += Math.hypot(nxp - x, nzp - z); x = nxp; z = nzp;
      o++; m.px[o] = x; m.pz[o] = z; m.pc[o] = c; m.pE[o] = e;
    }
    m.eLen[e] = Math.max(0.01, c);
    const R = RC[m.eCls[e]], one = m.eFlag[e] & F_ONEWAY, lanes = m.eLanes[e] || (one && R.lanes > 2 && !R.hwy ? R.lanes / 2 : R.lanes);
    m.eHW[e] = lanes * R.lw / 2 + (one ? R.park * 0.5 : R.park) + R.sh;
  }
  // miter normals (right of a→b, scaled so offsets keep their width through bends)
  m.mx = new Float32Array(tot); m.mz = new Float32Array(tot);
  for (let e = 0; e < nE; e++) {
    const o0 = m.eOff[e], o1 = m.eOff[e + 1] - 1;
    for (let i = o0; i <= o1; i++) {
      let ax = 0, az = 0, n1x = 0, n1z = 0, n2x = 0, n2z = 0, has1 = false, has2 = false;
      if (i > o0) { const dx = m.px[i] - m.px[i - 1], dz = m.pz[i] - m.pz[i - 1], L = Math.hypot(dx, dz) || 1; n1x = -dz / L; n1z = dx / L; has1 = true; }
      if (i < o1) { const dx = m.px[i + 1] - m.px[i], dz = m.pz[i + 1] - m.pz[i], L = Math.hypot(dx, dz) || 1; n2x = -dz / L; n2z = dx / L; has2 = true; }
      if (has1 && has2) { ax = n1x + n2x; az = n1z + n2z; const L = Math.hypot(ax, az); if (L < 1e-3) { ax = n2x; az = n2z; } else { ax /= L; az /= L; const cs = ax * n2x + az * n2z; const k = 1 / Math.max(0.4, cs); ax *= k; az *= k; } }
      else if (has1) { ax = n1x; az = n1z; } else { ax = n2x; az = n2z; }
      m.mx[i] = ax; m.mz[i] = az;
    }
  }
  // adjacency: entries are e*2 (leave via a→b) or e*2+1 (leave via b→a)
  const deg = new Int32Array(N + 1);
  for (let e = 0; e < nE; e++) { deg[m.eA[e]]++; deg[m.eB[e]]++; }
  m.adjS = new Int32Array(N + 1); for (let i = 0; i < N; i++) m.adjS[i + 1] = m.adjS[i] + deg[i];
  m.adj = new Int32Array(m.adjS[N]); const fill = m.adjS.slice(0, N);
  for (let e = 0; e < nE; e++) { m.adj[fill[m.eA[e]]++] = e * 2; m.adj[fill[m.eB[e]]++] = e * 2 + 1; }
  m.nodeHW = new Float32Array(N); m.nodeRank = new Int8Array(N).fill(-1); m.nodeDeg = new Uint8Array(N);
  for (let n = 0; n < N; n++) {
    let hw = 0, rk = -1, d = 0;
    for (let k = m.adjS[n]; k < m.adjS[n + 1]; k++) { const e = m.adj[k] >> 1, R = RC[m.eCls[e]]; hw = Math.max(hw, m.eHW[e]); rk = Math.max(rk, R.rank); if (!R.path) d++; }
    m.nodeHW[n] = hw; m.nodeRank[n] = rk; m.nodeDeg[n] = Math.min(255, d);
  }

  // grid helpers
  m.GW = Math.ceil((m.gx1 - m.gx0) / CELL) + 1; m.GH = Math.ceil((m.gz1 - m.gz0) / CELL) + 1;
  const cellIx = (x) => clamp(Math.floor((x - m.gx0) / CELL), 0, m.GW - 1), cellIz = (z) => clamp(Math.floor((z - m.gz0) / CELL), 0, m.GH - 1);
  m.cellIx = cellIx; m.cellIz = cellIz;
  function csr(count, each) {
    const cnt = new Int32Array(m.GW * m.GH + 1);
    each((c) => cnt[c + 1]++);
    for (let i = 0; i < m.GW * m.GH; i++) cnt[i + 1] += cnt[i];
    const items = new Int32Array(cnt[m.GW * m.GH]), pos = cnt.slice(0, m.GW * m.GH);
    let cur = 0;
    each((c) => { items[pos[c]++] = cur; }, (i) => { cur = i; });
    return { start: cnt, items };
  }
  // road segments (index = first point of the segment)
  m.segGrid = csr(tot, (add, setCur) => {
    for (let i = 0; i < tot - 1; i++) {
      if (m.pE[i] !== m.pE[i + 1]) continue;
      if (setCur) setCur(i);
      const hw = m.eHW[m.pE[i]] + 3;
      const x0 = cellIx(Math.min(m.px[i], m.px[i + 1]) - hw), x1 = cellIx(Math.max(m.px[i], m.px[i + 1]) + hw);
      const z0 = cellIz(Math.min(m.pz[i], m.pz[i + 1]) - hw), z1 = cellIz(Math.max(m.pz[i], m.pz[i + 1]) + hw);
      for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) add(b * m.GW + a);
    }
  });

  // buildings
  const bI = sec('buildings'), bp = sec('bPts'), nB = bI.length / 5;
  m.B = nB; m.bOff = new Int32Array(nB + 1); m.bH = new Float32Array(nB); m.bKind = new Uint8Array(nB);
  m.bBox = new Float32Array(nB * 4);
  let bt = 0; for (let b = 0; b < nB; b++) { m.bOff[b] = bt; bt += bI[5 * b + 3] + 1; } m.bOff[nB] = bt;
  m.bx = new Float32Array(bt); m.bz = new Float32Array(bt);
  for (let b = 0; b < nB; b++) {
    let x = bI[5 * b] * u, z = bI[5 * b + 1] * u, o = m.bOff[b];
    const st = bI[5 * b + 2], cnt = bI[5 * b + 3], hk = bI[5 * b + 4];
    m.bH[b] = (hk & 0xffff) / 4; m.bKind[b] = hk >>> 16;
    let x0 = x, x1 = x, z0 = z, z1 = z;
    m.bx[o] = x; m.bz[o] = z;
    for (let k = 0; k < cnt; k++) { x += bp[2 * (st + k)] * u; z += bp[2 * (st + k) + 1] * u; o++; m.bx[o] = x; m.bz[o] = z; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    m.bBox.set([x0, z0, x1, z1], b * 4);
  }
  m.bGrid = csr(nB, (add, setCur) => {
    for (let b = 0; b < nB; b++) {
      if (setCur) setCur(b);
      const x0 = cellIx(m.bBox[4 * b]), x1 = cellIx(m.bBox[4 * b + 2]), z0 = cellIz(m.bBox[4 * b + 1]), z1 = cellIz(m.bBox[4 * b + 3]);
      for (let a = x0; a <= x1; a++) for (let c = z0; c <= z1; c++) add(c * m.GW + a);
    }
  });

  // trees (OSM)
  const tI = sec('trees'); m.T = tI.length / 2; m.tx = new Float32Array(m.T); m.tz = new Float32Array(m.T);
  for (let i = 0; i < m.T; i++) { m.tx[i] = tI[2 * i] * u; m.tz[i] = tI[2 * i + 1] * u; }

  // elevated rail runs
  const rI = sec('rail'), rP = sec('rPts');
  m.rails = [];
  for (let k = 0; k < rI.length; k += 2) {
    const st = rI[k], cnt = rI[k + 1], xs = new Float32Array(cnt), zs = new Float32Array(cnt), cs = new Float32Array(cnt);
    for (let i = 0; i < cnt; i++) { xs[i] = rP[2 * (st + i)] * u; zs[i] = rP[2 * (st + i) + 1] * u; if (i) cs[i] = cs[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]); }
    m.rails.push({ xs, zs, cs, len: cs[cnt - 1] });
  }

  // landcover raster (RLE) and municipalities
  m.W = meta.W; m.H = meta.H; m.res = meta.res;
  const rle = sec('land'); m.land = new Uint8Array(m.W * m.H);
  for (let k = 0, o = 0; k < rle.length; k += 2) { const v = rle[k], n = rle[k + 1]; if (v) m.land.fill(v, o, o + n); o += n; }
  m.muni = sec('muni'); m.MW = meta.MW; m.MH = meta.MH; m.mres = meta.mres;

  // tile indexes: what each 160 m tile builds
  const tkey = (x, z) => (Math.floor(x / TILE) + 2048) * 4096 + (Math.floor(z / TILE) + 2048);
  m.tkey = tkey;
  const tIdx = (len) => { const mp = new Map(); return { mp, add(k, v) { let a = mp.get(k); if (!a) mp.set(k, a = []); a.push(v); } }; };
  const tSeg = tIdx(), tNode = tIdx(), tBld = tIdx(), tTree = tIdx(), tRail = tIdx();
  for (let i = 0; i < tot - 1; i++) if (m.pE[i] === m.pE[i + 1]) tSeg.add(tkey((m.px[i] + m.px[i + 1]) / 2, (m.pz[i] + m.pz[i + 1]) / 2), i);
  for (let n = 0; n < N; n++) tNode.add(tkey(m.nx[n], m.nz[n]), n);
  for (let b = 0; b < nB; b++) tBld.add(tkey(m.bx[m.bOff[b]], m.bz[m.bOff[b]]), b);
  for (let i = 0; i < m.T; i++) tTree.add(tkey(m.tx[i], m.tz[i]), i);
  m.rails.forEach((r, ri) => { for (let i = 0; i < r.xs.length - 1; i++) tRail.add(tkey((r.xs[i] + r.xs[i + 1]) / 2, (r.zs[i] + r.zs[i + 1]) / 2), ri * 65536 + i); });
  m.tSeg = tSeg.mp; m.tNode = tNode.mp; m.tBld = tBld.mp; m.tTree = tTree.mp; m.tRail = tRail.mp;
  m.names = meta.names; m.munis = meta.munis;
  m.places = meta.places.filter((p) => ['neighbourhood', 'suburb', 'quarter', 'borough', 'village'].includes(p[1]));
  m.towns = meta.places.filter((p) => p[1] === 'city' || p[1] === 'town');
  MAP = m;
  return m;
}

// ---------------------------------------------------------------- queries
const RQ = { e: -1, i: -1, t: 0, d: 1e9, s: 0, side: 0, hw: 0, in: false };
// Nearest road segment within r metres. score = distance minus half-width, so the road you are "most inside" wins.
function roadQuery(x, z, r = 12, filter = null, out = RQ) {
  const m = MAP; out.e = -1; out.d = 1e9; out.in = false;
  if (!m) return out;
  let bestScore = r;
  const a0 = m.cellIx(x - r), a1 = m.cellIx(x + r), b0 = m.cellIz(z - r), b1 = m.cellIz(z + r);
  const st = m.segGrid.start, it = m.segGrid.items;
  for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
    const c = b * m.GW + a;
    for (let k = st[c]; k < st[c + 1]; k++) {
      const i = it[k], e = m.pE[i];
      if (filter && !filter(e)) continue;
      const ax = m.px[i], az = m.pz[i], dx = m.px[i + 1] - ax, dz = m.pz[i + 1] - az, L2 = dx * dx + dz * dz || 1e-6;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), qx = ax + dx * t, qz = az + dz * t;
      const d = Math.hypot(x - qx, z - qz), sc = d - m.eHW[e] - RC[m.eCls[e]].rank * 0.05;
      if (sc < bestScore) {
        bestScore = sc; out.e = e; out.i = i; out.t = t; out.d = d; out.hw = m.eHW[e];
        out.s = m.pc[i] + t * Math.sqrt(L2);
        const L = Math.sqrt(L2); out.side = ((-dz / L) * (x - qx) + (dx / L) * (z - qz)) >= 0 ? 1 : -1;
      }
    }
  }
  out.in = out.e >= 0 && out.d <= out.hw;
  return out;
}
const drivable = (e) => RC[MAP.eCls[e]].drive;
// Point and heading along an edge at distance s from node a
function edgePoint(e, s, out) {
  const m = MAP, o0 = m.eOff[e], o1 = m.eOff[e + 1] - 1;
  s = clamp(s, 0, m.eLen[e]);
  let lo = o0, hi = o1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (m.pc[mid] <= s) lo = mid; else hi = mid; }
  const i = lo, j = Math.min(o1, i + 1), seglen = (m.pc[j] - m.pc[i]) || 1e-6, t = clamp((s - m.pc[i]) / seglen, 0, 1);
  out.x = m.px[i] + (m.px[j] - m.px[i]) * t; out.z = m.pz[i] + (m.pz[j] - m.pz[i]) * t;
  const dx = m.px[j] - m.px[i], dz = m.pz[j] - m.pz[i], L = Math.hypot(dx, dz) || 1;
  out.tx = dx / L; out.tz = dz / L;
  return out;
}
function landAt(x, z) {
  const m = MAP; if (!m) return 0;
  const c = Math.floor((x - m.gx0) / m.res), r = Math.floor((z - m.gz0) / m.res);
  if (c < 0 || r < 0 || c >= m.W || r >= m.H) return 0;
  return m.land[r * m.W + c];
}
function muniAt(x, z) {
  const m = MAP; if (!m) return '';
  const c = Math.floor((x - m.gx0) / m.mres), r = Math.floor((z - m.gz0) / m.mres);
  const v = c < 0 || r < 0 || c >= m.MW || r >= m.MH ? '' : m.munis[m.muni[r * m.MW + c]] || '';
  if (v) return v;
  // Boundaries that run off the edge of the map can't be assembled: fall back to the nearest city or town
  let best = '', bd = 7000;
  for (const p of m.towns) { const d = Math.hypot(p[2] - x, p[3] - z); if (d < bd) { bd = d; best = p[0]; } }
  return best;
}
function placeAt(x, z) {
  let best = '', bd = 2200;
  for (const p of MAP.places) { const d = Math.hypot(p[2] - x, p[3] - z) * (p[1] === 'neighbourhood' ? 0.85 : 1); if (d < bd) { bd = d; best = p[0]; } }
  return best;
}
function insideBuilding(b, x, z, pad) {
  const m = MAP, bb = b * 4;
  if (x < m.bBox[bb] - pad || x > m.bBox[bb + 2] + pad || z < m.bBox[bb + 1] - pad || z > m.bBox[bb + 3] + pad) return false;
  const o0 = m.bOff[b], o1 = m.bOff[b + 1];
  let inside = false, dmin = 1e9;
  for (let i = o0, j = o1 - 1; i < o1; j = i++) {
    const xi = m.bx[i], zi = m.bz[i], xj = m.bx[j], zj = m.bz[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    if (pad > 0) {
      const dx = xj - xi, dz = zj - zi, L2 = dx * dx + dz * dz || 1e-6, t = clamp(((x - xi) * dx + (z - zi) * dz) / L2, 0, 1);
      dmin = Math.min(dmin, Math.hypot(x - xi - dx * t, z - zi - dz * t));
    }
  }
  return inside || dmin < pad;
}
function buildingAt(x, z, pad = 0) {
  const m = MAP; if (!m) return -1;
  const c = m.cellIz(z) * m.GW + m.cellIx(x), st = m.bGrid.start, it = m.bGrid.items;
  for (let k = st[c]; k < st[c + 1]; k++) if (insideBuilding(it[k], x, z, pad)) return it[k];
  return -1;
}
// What would you hit here? buildings, poles, trees, pillars
function hitAt(x, z, pad) {
  if (!MAP) return null;
  if (buildingAt(x, z, pad) >= 0) return 'Hit a wall';
  const t = tiles.get(MAP.tkey(x, z));
  if (t && t.obs) for (const o of t.obs) { const dx = o[0] - x, dz = o[1] - z, r = o[2] + pad; if (dx * dx + dz * dz < r * r) return o[3]; }
  return null;
}
function roadLabel(e) {
  const m = MAP, nm = m.names[m.eName[e]], ref = m.names[m.eRef[e]], R = RC[m.eCls[e]];
  return { name: nm || (ref ? '' : R.label || 'Unnamed road'), ref: ref ? fmtRef(ref) : '' };
}
function fmtRef(ref) {
  const parts = ref.split(';').map((s) => s.trim()).filter(Boolean).slice(0, 2);
  return parts.map((p) => {
    if (/^I[ -]?\d/.test(p)) return 'I-' + p.replace(/^I[ -]?/, '');
    if (/^(US|CA|SR|NY|NJ|FL|NV)[ -]?\d/.test(p)) return p.replace(/\s+/, '-');
    if (/^\d+[A-Z]?$/.test(p)) return 'Hwy ' + p;
    return p;
  }).join(' / ');
}

// ---------------------------------------------------------------- materials for the streamed city
const MM = {};       // map materials
const signTexCache = new Map();   // street name sign textures, ref-counted
function setupMapMaterials() {
  for (const k of Object.keys(MM)) { const v = MM[k]; if (Array.isArray(v)) v.forEach((x) => x.dispose && x.dispose()); else if (v && v.dispose) v.dispose(); delete MM[k]; }
  for (const v of signTexCache.values()) { v.tex.dispose(); v.mat.dispose(); }
  signTexCache.clear();
  const night = C.night || C.dusk;
  MM.asphalt = noiseTexture('#9a9a9a', 0.35, 256, 3, 0.04);
  MM.concreteTex = noiseTexture('#c9c6c0', 0.18, 256, 7, 0.01);
  MM.road = new THREE.MeshStandardMaterial({ map: MM.asphalt, vertexColors: true, roughness: C.wet ? 0.38 : 0.93, metalness: C.wet ? 0.12 : 0 });
  MM.walk = new THREE.MeshLambertMaterial({ map: MM.concreteTex, vertexColors: true });
  MM.mark = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#222222' });
  MM.water = new THREE.MeshStandardMaterial({ color: C.land.water, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.93 });
  MM.roof = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  MM.walls = {};
  MM.wallTex = [];
  for (const [i, st] of ['house', 'mid', 'glass'].entries()) {
    const [tw, tl] = facadeTextures(st, C, 1234 + i * 77); MM.wallTex.push(tw, tl);
    MM.walls[st] = new THREE.MeshLambertMaterial({ map: tw, vertexColors: true, side: THREE.DoubleSide, emissive: night ? '#ffd9a0' : '#000000', emissiveMap: tl, emissiveIntensity: C.night ? 1.0 : 0.8 });
  }
  MM.concrete = new THREE.MeshLambertMaterial({ color: '#a8a49c', side: THREE.DoubleSide });
  MM.metal = new THREE.MeshLambertMaterial({ color: '#8d949a', side: THREE.DoubleSide });
  MM.pole = new THREE.MeshLambertMaterial({ color: '#3c3f45' });
  MM.lamp = new THREE.MeshBasicMaterial({ color: night || C.rain ? '#ffe2a8' : '#d9d4c6' });
  MM.trunk = new THREE.MeshLambertMaterial({ color: '#6e5238' });
  MM.leaf = new THREE.MeshLambertMaterial({ color: C.night ? '#2c4a33' : cityKey === 'van' ? '#3d6a3a' : '#4a7a3f', flatShading: true });
  MM.conifer = new THREE.MeshLambertMaterial({ color: '#2b4a33', flatShading: true });
  MM.frond = new THREE.MeshLambertMaterial({ color: C.night ? '#2f5a3a' : '#3f8a47', side: THREE.DoubleSide });
  MM.sigBox = new THREE.MeshLambertMaterial({ color: '#1d1f22' });
  MM.sigOff = new THREE.MeshLambertMaterial({ color: '#262626' });
  MM.sigR = new THREE.MeshBasicMaterial({ color: '#ff2a1a' }); MM.sigY = new THREE.MeshBasicMaterial({ color: '#ffb000' }); MM.sigG = new THREE.MeshBasicMaterial({ color: '#2dff8a' });
  MM.signs = C.signs.map(([t, c]) => { const tex = signTexture(t, c); return new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }); });
  MM.landCol = Object.fromEntries(Object.entries(C.land).map(([k, v]) => [k, new THREE.Color(v)]));
}
function streetSignMat(text) {
  let v = signTexCache.get(text);
  if (!v) { const tex = streetSignTexture(text); v = { tex, mat: new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }), refs: 0 }; signTexCache.set(text, v); }
  v.refs++;
  return v.mat;
}
function releaseSign(text) {
  const v = signTexCache.get(text); if (!v) return;
  if (--v.refs <= 0) { v.tex.dispose(); v.mat.dispose(); signTexCache.delete(text); }
}

// shared prop geometries
const palmTrunk = (() => { const g = new THREE.CylinderGeometry(0.13, 0.22, 9, 7); g.translate(0, 4.5, 0); return g; })();
const palmCrown = (() => {
  const parts = [];
  for (let i = 0; i < 10; i++) {
    const f = new THREE.BoxGeometry(0.34, 0.03, 2.8); f.translate(0, 0, 1.4); f.rotateX(0.5 + (i % 3) * 0.14); f.rotateY(i / 10 * TAU); f.translate(0, 9, 0);
    parts.push(f);
  }
  const nut = new THREE.SphereGeometry(0.3, 6, 5); nut.translate(0, 8.8, 0); parts.push(nut);
  return merge(parts);
})();
const treeTrunk = (() => { const g = new THREE.CylinderGeometry(0.14, 0.22, 3, 6); g.translate(0, 1.5, 0); return g; })();
const treeCrown = (() => { const a = new THREE.IcosahedronGeometry(2.0, 0); a.scale(1, 1.2, 1); a.translate(0, 4.4, 0); const b = new THREE.IcosahedronGeometry(1.4, 0); b.translate(0.9, 5.4, 0.3); return merge([a, b]); })();
const conifer = (() => { const a = new THREE.ConeGeometry(2.2, 5, 7); a.translate(0, 4.5, 0); const b = new THREE.ConeGeometry(1.6, 4, 7); b.translate(0, 7.2, 0); const c = new THREE.ConeGeometry(1.0, 3, 7); c.translate(0, 9.4, 0); return merge([a, b, c]); })();
const lampPole = (() => {
  const p = new THREE.CylinderGeometry(0.08, 0.13, 8, 6); p.translate(0, 4, 0);
  const a = new THREE.BoxGeometry(2.6, 0.09, 0.09); a.translate(1.3, 7.9, 0);
  return merge([p, a]);
})();
const lampHead = (() => { const g = new THREE.BoxGeometry(0.8, 0.16, 0.36); g.translate(2.55, 7.8, 0); return g; })();
const sigPoleG = (() => { const g = new THREE.CylinderGeometry(0.11, 0.14, 6.2, 8); g.translate(0, 3.1, 0); return g; })();
const sigHeadG = new THREE.BoxGeometry(0.42, 1.25, 0.32);
const sigLampG = new THREE.CircleGeometry(0.14, 12);

// ---------------------------------------------------------------- streamed tiles
const tiles = new Map();
const liveSignals = new Set();
function tileRadius() { return quality === 'low' ? 2 : 3; }
function disposeTile(t) {
  for (const part of ['base', 'detail']) if (t[part]) disposePart(t, part);
  tiles.delete(t.key);
}
function disposePart(t, part) {
  const p = t[part]; if (!p) return;
  scene.remove(p.g);
  for (const d of p.disp) d.dispose && d.dispose();
  if (p.signs) for (const s of p.signs) releaseSign(s);
  if (p.signals) for (const s of p.signals) liveSignals.delete(s);
  if (part === 'detail') t.obs = t.baseObs ? t.baseObs.slice() : [];
  t[part] = null;
}
function clearTiles() { for (const t of [...tiles.values()]) disposeTile(t); tiles.clear(); liveSignals.clear(); }
function updateTiles(cx, cz, force) {
  if (!MAP) return;
  const ti = Math.floor(cx / TILE), tj = Math.floor(cz / TILE), RB = tileRadius(), RD = 1;
  for (const t of [...tiles.values()]) {
    const di = Math.abs(t.i - ti), dj = Math.abs(t.j - tj);
    if (di > RB + 1 || dj > RB + 1) disposeTile(t);
    else if (t.detail && (di > RD + 1 || dj > RD + 1)) disposePart(t, 'detail');
  }
  const todo = [];
  for (let a = ti - RB; a <= ti + RB; a++) for (let b = tj - RB; b <= tj + RB; b++) {
    const key = (a + 2048) * 4096 + (b + 2048), t = tiles.get(key), d = Math.hypot(a + 0.5 - cx / TILE, b + 0.5 - cz / TILE);
    if (!t || !t.base) todo.push([a, b, key, 'base', d]);
    if (Math.abs(a - ti) <= RD && Math.abs(b - tj) <= RD && (!t || !t.detail)) todo.push([a, b, key, 'detail', d + 0.01]);
  }
  todo.sort((p, q) => p[4] - q[4]);
  let budget = force ? 1e9 : 4;
  for (const [a, b, key, part] of todo) {
    let t = tiles.get(key);
    if (!t) { t = { key, i: a, j: b, base: null, detail: null, obs: [], baseObs: [] }; tiles.set(key, t); }
    if (part === 'detail' && !t.base) continue;
    const t0 = performance.now();
    if (part === 'base') buildBase(t); else buildDetail(t);
    budget -= 1 + (performance.now() - t0) / 4;
    if (budget <= 0) break;
  }
}

// ---- base: ground, water, roads, sidewalks, buildings, bridges, barriers, elevated rail
function buildBase(t) {
  const m = MAP, g = new THREE.Group(), disp = [], X0 = t.i * TILE, Z0 = t.j * TILE;
  const addMesh = (geo, mat, opts = {}) => { const me = new THREE.Mesh(geo, mat); me.receiveShadow = true; if (opts.cast) me.castShadow = true; g.add(me); disp.push(geo); return me; };

  // Ground from the landcover raster (one texel per 4 m cell, smoothed)
  {
    const S = TILE / m.res + 2, c0 = Math.floor((X0 - m.gx0) / m.res) - 1, r0 = Math.floor((Z0 - m.gz0) / m.res) - 1;
    const data = new Uint8Array(S * S * 4), cols = [MM.landCol.none, MM.landCol.water, MM.landCol.grass, MM.landCol.forest, MM.landCol.sand, MM.landCol.paved, MM.landCol.yard];
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
      const cc = c0 + c, rr = r0 + r;
      const v = cc >= 0 && rr >= 0 && cc < m.W && rr < m.H ? m.land[rr * m.W + cc] : 0;
      const col = cols[v] || cols[0], k = 0.9 + hash2(cc, rr, 5) * 0.2, o = (r * S + c) * 4;
      data[o] = clamp(col.r * 255 * k, 0, 255); data[o + 1] = clamp(col.g * 255 * k, 0, 255); data[o + 2] = clamp(col.b * 255 * k, 0, 255); data[o + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ map: tex }); disp.push(tex, mat);
    const gb = new GeoBuf(false, true), U0 = ((X0 - m.gx0) / m.res - c0) / S, V0 = ((Z0 - m.gz0) / m.res - r0) / S, dU = TILE / m.res / S;
    gb.v(X0, 0, Z0, 0, 1, 0, null, U0, V0); gb.v(X0 + TILE, 0, Z0 + TILE, 0, 1, 0, null, U0 + dU, V0 + dU); gb.v(X0 + TILE, 0, Z0, 0, 1, 0, null, U0 + dU, V0);
    gb.v(X0, 0, Z0, 0, 1, 0, null, U0, V0); gb.v(X0, 0, Z0 + TILE, 0, 1, 0, null, U0, V0 + dU); gb.v(X0 + TILE, 0, Z0 + TILE, 0, 1, 0, null, U0 + dU, V0 + dU);
    addMesh(gb.build(), mat);
    // Water surface: marching squares over the water mask (smooth shorelines)
    const wb = new GeoBuf(), n = TILE / m.res;
    const wv = (c, r) => { const cc = c0 + 1 + c, rr = r0 + 1 + r; return cc >= 0 && rr >= 0 && cc < m.W && rr < m.H && m.land[rr * m.W + cc] === 1 ? 1 : 0; };
    let any = false;
    for (let r = -1; r < n; r++) for (let c = -1; c < n; c++) {
      const a = wv(c, r), b = wv(c + 1, r), cc_ = wv(c + 1, r + 1), d = wv(c, r + 1);
      if (!(a | b | cc_ | d)) continue;
      any = true;
      const P = (fc, fr) => [m.gx0 + (c0 + 1 + c + fc + 0.5) * m.res, m.gz0 + (r0 + 1 + r + fr + 0.5) * m.res];
      const corners = [[a, 0, 0], [b, 1, 0], [cc_, 1, 1], [d, 0, 1]], poly = [];
      for (let k = 0; k < 4; k++) {
        const [v, fx, fz] = corners[k], [v2, gx, gz] = corners[(k + 1) % 4];
        if (v) poly.push(P(fx, fz));
        if (v !== v2) poly.push(P((fx + gx) / 2, (fz + gz) / 2));
      }
      for (let k = 1; k < poly.length - 1; k++) {
        const [x0, z0] = poly[0], [x1, z1] = poly[k], [x2, z2] = poly[k + 1];
        // clip to the tile: only keep triangles whose centroid is in this tile
        const cx = (x0 + x1 + x2) / 3, cz = (z0 + z1 + z2) / 3;
        if (cx < X0 || cx >= X0 + TILE || cz < Z0 || cz >= Z0 + TILE) continue;
        wb.v(x0, 0.025, z0, 0, 1, 0); wb.v(x2, 0.025, z2, 0, 1, 0); wb.v(x1, 0.025, z1, 0, 1, 0);
      }
    }
    if (any && !wb.empty) addMesh(wb.build(), MM.water);
  }

  // Roads and sidewalks
  const rb = new GeoBuf(true, true), sw = new GeoBuf(true, true), rails = new GeoBuf(), fascia = new GeoBuf(), barr = new GeoBuf();
  const colRoad = new THREE.Color(C.road), colConc = new THREE.Color(C.concrete), colWalk = new THREE.Color(C.walk), colPath = new THREE.Color(C.path), colPlaza = new THREE.Color(C.walk).lerp(new THREE.Color('#ffffff'), 0.1);
  const concreteHwy = cityKey === 'la' || cityKey === 'vegas';
  const segs = m.tSeg.get(t.key) || [];
  for (const i of segs) {
    const e = m.pE[i], R = RC[m.eCls[e]], hw = m.eHW[e], y = roadY(R.rank), fl = m.eFlag[e];
    const ax = m.px[i], az = m.pz[i], bx = m.px[i + 1], bz = m.pz[i + 1], amx = m.mx[i], amz = m.mz[i], bmx = m.mx[i + 1], bmz = m.mz[i + 1];
    const col = R.path ? (m.eCls[e] === 14 ? colPlaza : colPath) : (R.hwy && concreteHwy) ? colConc : colRoad;
    const tint = col.clone().multiplyScalar(0.92 + hash2(e, 1, 3) * 0.12);
    rb.flat(ax - amx * hw, az - amz * hw, bx - bmx * hw, bz - bmz * hw, bx + bmx * hw, bz + bmz * hw, ax + amx * hw, az + amz * hw, y, tint, 1 / 7);
    if (R.walk && !(fl & (F_BRIDGE | F_TUNNEL))) {
      const w = hw + 2.6;
      sw.flat(ax - amx * w, az - amz * w, bx - bmx * w, bz - bmz * w, bx + bmx * w, bz + bmz * w, ax + amx * w, az + amz * w, 0.03, colWalk, 1 / 5);
    }
    if (fl & F_BRIDGE) {
      for (const s of [-1, 1]) {
        const o = hw + 0.15, x0 = ax + amx * o * s, z0 = az + amz * o * s, x1 = bx + bmx * o * s, z1 = bz + bmz * o * s;
        rails.wall(x0, z0, x1, z1, y, y + 1.1, amx * s, amz * s);
        const o2 = hw + 0.3, f0x = ax + amx * o2 * s, f0z = az + amz * o2 * s, f1x = bx + bmx * o2 * s, f1z = bz + bmz * o2 * s;
        fascia.wall(f0x, f0z, f1x, f1z, -1.6, y + 0.05, amx * s, amz * s);
      }
      // deck underside
      fascia.flat(ax - amx * (hw + 0.3), az - amz * (hw + 0.3), bx - bmx * (hw + 0.3), bz - bmz * (hw + 0.3), bx + bmx * (hw + 0.3), bz + bmz * (hw + 0.3), ax + amx * (hw + 0.3), az + amz * (hw + 0.3), -1.6, null, 0);
    } else if (m.eCls[e] === 0 && !(fl & F_TUNNEL)) {
      // jersey barriers along freeways, with gaps where ramps join
      const sMid = m.pc[i] + Math.hypot(bx - ax, bz - az) / 2, L = m.eLen[e];
      const nearRampA = m.nodeDeg[m.eA[e]] >= 3 && sMid < 90, nearRampB = m.nodeDeg[m.eB[e]] >= 3 && L - sMid < 90;
      if (!nearRampA && !nearRampB) for (const s of [-1, 1]) {
        const o = hw + 0.25, x0 = ax + amx * o * s, z0 = az + amz * o * s, x1 = bx + bmx * o * s, z1 = bz + bmz * o * s;
        barr.wall(x0, z0, x1, z1, 0, 0.85, amx * s, amz * s);
      }
    }
  }
  // junction discs fill the gaps where roads meet
  for (const n of m.tNode.get(t.key) || []) {
    const k0 = m.adjS[n], k1 = m.adjS[n + 1], dg = k1 - k0;
    if (dg === 0) continue;
    let bend = 0;
    if (dg === 2) {
      const d1 = dirFromNode(n, m.adj[k0]), d2 = dirFromNode(n, m.adj[k0 + 1]);
      bend = Math.PI - Math.acos(clamp(d1[0] * d2[0] + d1[1] * d2[1], -1, 1));
      if (bend < 0.17 && m.eCls[m.adj[k0] >> 1] === m.eCls[m.adj[k0 + 1] >> 1]) continue;
    }
    let hw = 0, rk = -1, walk = false, path = true, col = colRoad, bridge = false;
    for (let k = k0; k < k1; k++) {
      const e = m.adj[k] >> 1, R = RC[m.eCls[e]];
      if (R.rank > rk) { rk = R.rank; col = R.path ? colPath : (R.hwy && concreteHwy) ? colConc : colRoad; }
      hw = Math.max(hw, m.eHW[e]); if (R.walk && !(m.eFlag[e] & (F_BRIDGE | F_TUNNEL))) walk = true; if (!R.path) path = false; if (m.eFlag[e] & F_BRIDGE) bridge = true;
    }
    if (bridge && dg === 2) continue;
    const r = dg === 1 && !path ? hw * 1.25 : hw, x = m.nx[n], z = m.nz[n], y = roadY(rk) + 0.001, SEG = 14;
    for (let k = 0; k < SEG; k++) {
      const a0 = k / SEG * TAU, a1 = (k + 1) / SEG * TAU;
      rb.v(x, y, z, 0, 1, 0, col, x / 7, z / 7);
      rb.v(x + Math.cos(a1) * r, y, z + Math.sin(a1) * r, 0, 1, 0, col, (x + Math.cos(a1) * r) / 7, (z + Math.sin(a1) * r) / 7);
      rb.v(x + Math.cos(a0) * r, y, z + Math.sin(a0) * r, 0, 1, 0, col, (x + Math.cos(a0) * r) / 7, (z + Math.sin(a0) * r) / 7);
      if (walk) {
        const w = r + 2.6;
        sw.v(x, 0.03, z, 0, 1, 0, colWalk, x / 5, z / 5);
        sw.v(x + Math.cos(a1) * w, 0.03, z + Math.sin(a1) * w, 0, 1, 0, colWalk, (x + Math.cos(a1) * w) / 5, (z + Math.sin(a1) * w) / 5);
        sw.v(x + Math.cos(a0) * w, 0.03, z + Math.sin(a0) * w, 0, 1, 0, colWalk, (x + Math.cos(a0) * w) / 5, (z + Math.sin(a0) * w) / 5);
      }
    }
  }
  if (!rb.empty) addMesh(rb.build(), MM.road);
  if (!sw.empty) addMesh(sw.build(), MM.walk);
  if (!rails.empty) addMesh(rails.build(), MM.metal);
  if (!fascia.empty) addMesh(fascia.build(), MM.concrete);
  if (!barr.empty) addMesh(barr.build(), MM.concrete);

  // Buildings: walls (three facade styles), flat roofs, gable roofs on small houses, shop signs
  const W = { house: new GeoBuf(true, true), mid: new GeoBuf(true, true), glass: new GeoBuf(true, true) }, roof = new GeoBuf(true);
  const signs = [];
  const v2 = [];
  for (const b of m.tBld.get(t.key) || []) {
    const o0 = m.bOff[b], o1 = m.bOff[b + 1], n = o1 - o0, h = m.bH[b], kind = m.bKind[b];
    let area = 0; for (let i = o0, j = o1 - 1; i < o1; j = i++) area += m.bx[j] * m.bz[i] - m.bx[i] * m.bz[j];
    area /= 2; const sgn = area >= 0 ? 1 : -1;
    const style = h >= 36 ? 'glass' : (kind === 1 && h < 12) ? 'house' : 'mid';
    const pal = C.walls[style], col = new THREE.Color(pal[Math.floor(hash2(b, 7, 1) * pal.length)]).multiplyScalar(0.88 + hash2(b, 3, 2) * 0.2);
    const bayW = style === 'house' ? 4 : style === 'mid' ? 3.6 : 3.2, flH = style === 'house' ? 3 : style === 'mid' ? 3.4 : 3.9;
    const gable = style === 'house' && n === 4 && h < 11 && Math.abs(area) < 400;
    const wallTop = gable ? h - 2.2 : h;
    let per = 0, longest = 0, li = 0;
    for (let i = o0; i < o1; i++) {
      const j = i + 1 < o1 ? i + 1 : o0, x0 = m.bx[i], z0 = m.bz[i], x1 = m.bx[j], z1 = m.bz[j], dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1e-3;
      const nx = dz / L * sgn, nz = -dx / L * sgn;
      W[style].wall(x0, z0, x1, z1, -0.3, wallTop, nx, nz, col, per / bayW / 8, (per + L) / bayW / 8, -0.3 / flH / 8, wallTop / flH / 8);
      per += L; if (L > longest) { longest = L; li = i; }
    }
    const rc = new THREE.Color(style === 'house' ? (hash2(b, 9) < 0.5 ? '#4a4a4f' : '#6b4a3c') : '#5f6165').multiplyScalar(0.85 + hash2(b, 4) * 0.3);
    if (gable) {
      // ridge along the longer axis
      const P = [0, 1, 2, 3].map((k) => [m.bx[o0 + k], m.bz[o0 + k]]);
      const l01 = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), l12 = Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1]);
      const Q = l01 >= l12 ? P : [P[1], P[2], P[3], P[0]];    // Q0-Q1 and Q2-Q3 are the long sides
      const r0 = [(Q[0][0] + Q[3][0]) / 2, (Q[0][1] + Q[3][1]) / 2], r1 = [(Q[1][0] + Q[2][0]) / 2, (Q[1][1] + Q[2][1]) / 2];
      const tri = (a, bb, c) => { roof.v(a[0], a[1], a[2], 0, 1, 0, rc); roof.v(bb[0], bb[1], bb[2], 0, 1, 0, rc); roof.v(c[0], c[1], c[2], 0, 1, 0, rc); };
      const yt = wallTop, yr = h;
      const A = (p) => [p[0], yt, p[1]], Rr = (p) => [p[0], yr, p[1]];
      tri(A(Q[0]), A(Q[1]), Rr(r1)); tri(A(Q[0]), Rr(r1), Rr(r0));
      tri(A(Q[2]), A(Q[3]), Rr(r0)); tri(A(Q[2]), Rr(r0), Rr(r1));
      // gable ends in wall colour
      const gw = W[style];
      for (const [p, q, r] of [[Q[3], Q[0], r0], [Q[1], Q[2], r1]]) {
        const ex = q[0] - p[0], ez = q[1] - p[1], el = Math.hypot(ex, ez) || 1, gnx = ez / el, gnz = -ex / el;
        gw.v(p[0], yt, p[1], gnx, 0, gnz, col, 0, 0); gw.v(q[0], yt, q[1], gnx, 0, gnz, col, 0.01, 0); gw.v(r[0], yr, r[1], gnx, 0, gnz, col, 0.005, 0.01);
      }
    } else {
      v2.length = 0;
      for (let i = o0; i < o1; i++) v2.push(new THREE.Vector2(m.bx[i], m.bz[i]));
      let faces;
      try { faces = THREE.ShapeUtils.triangulateShape(v2, []); } catch { faces = []; }
      for (const f of faces) for (const k of f) roof.v(v2[k].x, h, v2[k].y, 0, 1, 0, rc);
    }
    // shop and casino signs on the longest wall
    const shopChance = C.neon ? 0.7 : 0.33;
    if ((kind === 3 || (kind === 0 && h < 20)) && h < 40 && longest > 7 && hash2(b, 11) < shopChance) {
      const j = li + 1 < o1 ? li + 1 : o0, x0 = m.bx[li], z0 = m.bz[li], x1 = m.bx[j], z1 = m.bz[j], L = longest;
      const nx = (z1 - z0) / L * sgn, nz = -(x1 - x0) / L * sgn, w = Math.min(L - 2, C.neon ? 9 : 6);
      signs.push({ x: (x0 + x1) / 2 + nx * 0.12, z: (z0 + z1) / 2 + nz * 0.12, y: (C.neon ? 5 + hash2(b, 2) * 6 : 3.6), w, rot: Math.atan2(nx, nz), mat: Math.floor(hash2(b, 13) * MM.signs.length) });
    }
  }
  for (const st of ['house', 'mid', 'glass']) if (!W[st].empty) addMesh(W[st].build(), MM.walls[st], { cast: true });
  if (!roof.empty) addMesh(roof.build(), MM.roof, { cast: true });
  for (const s of signs) {
    const geo = new THREE.PlaneGeometry(s.w, s.w * 0.31), me = new THREE.Mesh(geo, MM.signs[s.mat]);
    me.position.set(s.x, s.y, s.z); me.rotation.y = s.rot; g.add(me); disp.push(geo);
  }

  // Elevated rail (SkyTrain, subway viaducts, monorail): deck, side walls and pillars
  const rail = new GeoBuf(), obs = [];
  for (const code of m.tRail.get(t.key) || []) {
    const rr = m.rails[code >> 16], i = code & 0xffff;
    const hAt = (s) => 7.5 * clamp(Math.min(s, rr.len - s) / 70, 0, 1);
    const x0 = rr.xs[i], z0 = rr.zs[i], x1 = rr.xs[i + 1], z1 = rr.zs[i + 1], L = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
    const h0 = hAt(rr.cs[i]), h1 = hAt(rr.cs[i + 1]), w = 4;
    if (h0 < 0.5 && h1 < 0.5) continue;
    const top = (s0x, s0z, s1x, s1z, ya, yb) => { rail.v(s0x, ya, s0z, 0, 1, 0); rail.v(s1x, yb, s1z, 0, 1, 0); rail.v(s1x - 2 * nx * w, yb, s1z - 2 * nz * w, 0, 1, 0); rail.v(s0x, ya, s0z, 0, 1, 0); rail.v(s1x - 2 * nx * w, yb, s1z - 2 * nz * w, 0, 1, 0); rail.v(s0x - 2 * nx * w, ya, s0z - 2 * nz * w, 0, 1, 0); };
    top(x0 + nx * w, z0 + nz * w, x1 + nx * w, z1 + nz * w, h0, h1);
    for (const s of [-1, 1]) {
      const ax = x0 + nx * w * s, az = z0 + nz * w * s, bx = x1 + nx * w * s, bz = z1 + nz * w * s;
      rail.v(ax, h0 - 1.4, az, nx * s, 0, nz * s); rail.v(bx, h1 - 1.4, bz, nx * s, 0, nz * s); rail.v(bx, h1 + 0.4, bz, nx * s, 0, nz * s);
      rail.v(ax, h0 - 1.4, az, nx * s, 0, nz * s); rail.v(bx, h1 + 0.4, bz, nx * s, 0, nz * s); rail.v(ax, h0 + 0.4, az, nx * s, 0, nz * s);
    }
    // pillars at every 30 m of the run
    for (let s = Math.ceil(rr.cs[i] / 30) * 30; s < rr.cs[i + 1]; s += 30) {
      const hh = hAt(s); if (hh < 2.5) continue;
      const f = (s - rr.cs[i]) / L, px = x0 + (x1 - x0) * f, pz = z0 + (z1 - z0) * f;
      const r = 0.75, SEG = 8;
      for (let k = 0; k < SEG; k++) {
        const a0 = k / SEG * TAU, a1 = (k + 1) / SEG * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        rail.wall(px + c0 * r, pz + s0 * r, px + c1 * r, pz + s1 * r, 0, hh - 1.4, (c0 + c1) / 2, (s0 + s1) / 2);
      }
      obs.push([px, pz, 0.85, 'Hit a pillar']);
    }
  }
  if (!rail.empty) addMesh(rail.build(), MM.concrete, { cast: true });

  scene.add(g);
  t.base = { g, disp };
  t.baseObs = obs; t.obs = t.detail ? t.obs.concat(obs) : obs.slice();
}
function dirFromNode(n, adjEntry) {
  const m = MAP, e = adjEntry >> 1, rev = adjEntry & 1, o0 = m.eOff[e], o1 = m.eOff[e + 1] - 1;
  const i = rev ? o1 : o0, j = rev ? o1 - 1 : o0 + 1;
  const dx = m.px[j] - m.px[i], dz = m.pz[j] - m.pz[i], L = Math.hypot(dx, dz) || 1;
  return [dx / L, dz / L];
}

// ---- detail: markings, crosswalks, street lights, trees, traffic signals, street-name signs
function buildDetail(t) {
  const m = MAP, g = new THREE.Group(), disp = [], X0 = t.i * TILE, Z0 = t.j * TILE, obs = [], signNames = [], signals = [];
  const white = new THREE.Color('#e9e6df'), yellow = new THREE.Color('#e6b928');
  const mk = new GeoBuf(true);
  const segs = m.tSeg.get(t.key) || [];
  // strip along segment i between distances sa..sb (edge distances) at lateral offset o, width w
  const strip = (i, sa, sb, o, w, col, y) => {
    const s0 = m.pc[i], L = m.pc[i + 1] - s0 || 1e-6;
    const P = (s, off) => { const f = clamp((s - s0) / L, 0, 1), nx = m.mx[i] + (m.mx[i + 1] - m.mx[i]) * f, nz = m.mz[i] + (m.mz[i + 1] - m.mz[i]) * f; return [m.px[i] + (m.px[i + 1] - m.px[i]) * f + nx * off, m.pz[i] + (m.pz[i + 1] - m.pz[i]) * f + nz * off]; };
    const a = P(sa, o - w / 2), b = P(sb, o - w / 2), c = P(sb, o + w / 2), d = P(sa, o + w / 2);
    mk.flat(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1], y, col);
  };
  for (const i of segs) {
    const e = m.pE[i], cls = m.eCls[e], R = RC[cls], fl = m.eFlag[e];
    if (R.path || cls === 8 || cls === 7) continue;
    const L = m.eLen[e], y = roadY(R.rank) + 0.012, s0 = m.pc[i], s1 = m.pc[i + 1];
    const skipA = m.nodeDeg[m.eA[e]] >= 3 ? m.nodeHW[m.eA[e]] + 1.5 : 0, skipB = m.nodeDeg[m.eB[e]] >= 3 ? m.nodeHW[m.eB[e]] + 1.5 : 0;
    const lo = Math.max(s0, skipA), hi = Math.min(s1, L - skipB);
    if (hi <= lo) continue;
    const one = fl & F_ONEWAY, laneTot = m.eLanes[e] || (one && R.lanes > 2 && !R.hwy ? R.lanes / 2 : R.lanes), lw = R.lw;
    const dashes = (o) => { for (let k = Math.floor(lo / 12); k * 12 < hi; k++) { const a = Math.max(lo, k * 12), b = Math.min(hi, k * 12 + 3); if (b > a) strip(i, a, b, o, 0.13, white, y); } };
    if (one) {
      for (let k = 1; k < laneTot; k++) dashes((k - laneTot / 2) * lw);
      if (R.hwy) { strip(i, lo, hi, laneTot * lw / 2 - 0.1, 0.15, white, y); strip(i, lo, hi, -laneTot * lw / 2 + 0.1, 0.15, yellow, y); }
    } else {
      const residential = cls === 6 || (cls === 5 && !m.eLanes[e]);
      if (!residential) { strip(i, lo, hi, -0.12, 0.11, yellow, y); strip(i, lo, hi, 0.12, 0.11, yellow, y); }
      const per = Math.max(1, Math.floor(laneTot / 2));
      for (let k = 1; k < per; k++) { dashes(k * lw); dashes(-k * lw); }
    }
  }
  // crosswalks at signalised junctions
  for (const n of m.tNode.get(t.key) || []) {
    if (!m.nflag[n] || m.nodeDeg[n] < 3) continue;
    for (let k = m.adjS[n]; k < m.adjS[n + 1]; k++) {
      const e = m.adj[k] >> 1; if (!RC[m.eCls[e]].drive || RC[m.eCls[e]].hwy) continue;
      const [dx, dz] = dirFromNode(n, m.adj[k]), hw = m.eHW[e], d = m.nodeHW[n] + 1.2, y = roadY(RC[m.eCls[e]].rank) + 0.013;
      const cx = m.nx[n] + dx * (d + 1.4), cz = m.nz[n] + dz * (d + 1.4), nx = -dz, nz = dx;
      for (let o = -hw + 0.6; o < hw - 0.4; o += 1.2) {
        const px = cx + nx * o, pz = cz + nz * o, ax = dx * 1.4, az = dz * 1.4, bx = nx * 0.28, bz = nz * 0.28;
        mk.flat(px - ax - bx, pz - az - bz, px + ax - bx, pz + az - bz, px + ax + bx, pz + az + bz, px - ax + bx, pz - az + bz, y, white);
      }
      // stop line across the approach (right-hand side)
      const sx = m.nx[n] + dx * (d + 3.4), sz = m.nz[n] + dz * (d + 3.4);
      const a = [sx, sz], b = [sx - nx * hw, sz - nz * hw];
      mk.flat(a[0] - dx * 0.2, a[1] - dz * 0.2, b[0] - dx * 0.2, b[1] - dz * 0.2, b[0] + dx * 0.2, b[1] + dz * 0.2, a[0] + dx * 0.2, a[1] + dz * 0.2, y, white);
    }
  }
  if (!mk.empty) { const geo = mk.build(), me = new THREE.Mesh(geo, MM.mark); me.receiveShadow = true; g.add(me); disp.push(geo); }

  // Street lights
  const lamps = [];
  for (const i of segs) {
    const e = m.pE[i], cls = m.eCls[e], R = RC[cls];
    if (!R.drive || (m.eFlag[e] & F_TUNNEL)) continue;
    const spacing = R.hwy ? 55 : 34, hw = m.eHW[e], one = m.eFlag[e] & F_ONEWAY;
    const sides = R.hwy ? [one ? 1 : -1] : (cls <= 4 ? [-1, 1] : [hash2(e, 5) < 0.5 ? -1 : 1]);
    for (const side of sides) {
      const ph = side > 0 ? 0 : spacing / 2;
      for (let s = Math.ceil((m.pc[i] - ph) / spacing) * spacing + ph; s < m.pc[i + 1]; s += spacing) {
        if (s < m.nodeHW[m.eA[e]] + 4 || s > m.eLen[e] - m.nodeHW[m.eB[e]] - 4) continue;
        const f = (s - m.pc[i]) / (m.pc[i + 1] - m.pc[i] || 1), nx = m.mx[i] + (m.mx[i + 1] - m.mx[i]) * f, nz = m.mz[i] + (m.mz[i + 1] - m.mz[i]) * f;
        const off = hw + (R.walk ? 0.9 : 0.6), x = m.px[i] + (m.px[i + 1] - m.px[i]) * f + nx * off * side, z = m.pz[i] + (m.pz[i + 1] - m.pz[i]) * f + nz * off * side;
        const q = roadQuery(x, z, 6, (e2) => e2 !== e);
        if (q.e >= 0 && q.d < q.hw + 0.3) continue;
        if (buildingAt(x, z, 0.6) >= 0 || landAt(x, z) === 1) continue;
        lamps.push([x, z, Math.atan2(nz * side, -nx * side)]);
        obs.push([x, z, 0.22, 'Hit a lamp post']);
      }
    }
  }
  if (lamps.length) {
    const pM = new THREE.InstancedMesh(lampPole, MM.pole, lamps.length), hM = new THREE.InstancedMesh(lampHead, MM.lamp, lamps.length), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    lamps.forEach(([x, z, rot], k) => { q.setFromAxisAngle(Yv, rot); m4.compose(p.set(x, 0, z), q, one); pM.setMatrixAt(k, m4); hM.setMatrixAt(k, m4); });
    pM.castShadow = true; g.add(pM, hM); disp.push(pM, hM);
  }

  // Trees: OSM street trees, then parks, forests, yards, and palm-lined streets
  const trees = { deci: [], con: [], palm: [] };
  const style = C.trees;
  const plant = (x, z, where, salt) => {
    const h = hash2(Math.round(x * 4), Math.round(z * 4), salt);
    let kind = 'deci';
    if (style === 'pnw') kind = (where === 'forest' ? h < 0.7 : h < 0.25) ? 'con' : 'deci';
    else if (style === 'palms') kind = where === 'street' || where === 'sand' ? 'palm' : where === 'forest' ? 'deci' : h < 0.55 ? 'palm' : 'deci';
    trees[kind].push([x, z, 0.75 + hash2(Math.round(x), Math.round(z), 3) * 0.6, h * TAU]);
    obs.push([x, z, kind === 'palm' ? 0.25 : 0.32, 'Hit a tree']);
  };
  for (const ti of m.tTree.get(t.key) || []) plant(m.tx[ti], m.tz[ti], 'street', 1);
  const prob = { 3: 0.55, 2: 0.06, 6: C.trees === 'pnw' ? 0.09 : 0.05, 4: C.trees === 'palms' ? 0.02 : 0 };
  for (let a = 0; a < TILE; a += 10) for (let b = 0; b < TILE; b += 10) {
    const x = X0 + a + hash2(t.i * 37 + a, t.j * 41 + b, 1) * 9, z = Z0 + b + hash2(t.i * 37 + a, t.j * 41 + b, 2) * 9;
    const lc = landAt(x, z), p = prob[lc] || 0;
    if (!p || hash2(Math.round(x), Math.round(z), 9) > p) continue;
    const q = roadQuery(x, z, 14);
    if (q.e >= 0 && q.d < q.hw + (RC[m.eCls[q.e]].walk ? 3.4 : 1.2)) continue;
    if (buildingAt(x, z, 1.5) >= 0) continue;
    plant(x, z, lc === 3 ? 'forest' : lc === 4 ? 'sand' : 'park', 4);
  }
  if (C.streetTrees) for (const i of segs) {
    const e = m.pE[i], cls = m.eCls[e];
    if (cls < 2 || cls > 6 || (m.eFlag[e] & (F_BRIDGE | F_TUNNEL)) || hash2(e, 17) > 0.5) continue;
    const hw = m.eHW[e];
    for (let s = Math.ceil(m.pc[i] / 15) * 15; s < m.pc[i + 1]; s += 15) {
      if (s < m.nodeHW[m.eA[e]] + 6 || s > m.eLen[e] - m.nodeHW[m.eB[e]] - 6) continue;
      const f = (s - m.pc[i]) / (m.pc[i + 1] - m.pc[i] || 1), nx = m.mx[i] + (m.mx[i + 1] - m.mx[i]) * f, nz = m.mz[i] + (m.mz[i + 1] - m.mz[i]) * f;
      for (const side of [-1, 1]) {
        const x = m.px[i] + (m.px[i + 1] - m.px[i]) * f + nx * (hw + 1.6) * side, z = m.pz[i] + (m.pz[i + 1] - m.pz[i]) * f + nz * (hw + 1.6) * side;
        const q = roadQuery(x, z, 6, (e2) => e2 !== e);
        if (q.e >= 0 && q.d < q.hw + 0.5) continue;
        if (buildingAt(x, z, 0.8) >= 0) continue;
        plant(x, z, 'street', 6);
      }
    }
  }
  const inst = (geo, mat, list, cast) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    list.forEach(([x, z, s, rot], k) => { q.setFromAxisAngle(Yv, rot); m4.compose(p.set(x, 0, z), q, sc.set(s, s, s)); im.setMatrixAt(k, m4); });
    im.castShadow = cast; g.add(im); disp.push(im);
  };
  inst(treeTrunk, MM.trunk, trees.deci.concat(trees.con), false);
  inst(treeCrown, MM.leaf, trees.deci, true);
  inst(conifer, MM.conifer, trees.con, true);
  inst(palmTrunk, MM.trunk, trees.palm, false);
  inst(palmCrown, MM.frond, trees.palm, true);

  // Traffic signals: a pole and three-lamp head facing each approach
  for (const n of m.tNode.get(t.key) || []) {
    if (!m.nflag[n]) continue;
    for (let k = m.adjS[n]; k < m.adjS[n + 1]; k++) {
      const ent = m.adj[k], e = ent >> 1, R = RC[m.eCls[e]];
      if (!R.drive) continue;
      // traffic arrives along this edge towards n unless it is one-way leaving n
      const leaving = (ent & 1) === 0;   // n is node a: a→b leaves n
      if ((m.eFlag[e] & F_ONEWAY) && leaving) continue;
      const [dx, dz] = dirFromNode(n, ent), hw = m.eHW[e], d = m.nodeHW[n] + 1.5;
      // approaching traffic travels along (-dx,-dz); its right-hand side is (dz,-dx)
      const rx = dz, rz = -dx;
      const px = m.nx[n] + dx * d + rx * (hw + 0.7), pz = m.nz[n] + dz * d + rz * (hw + 0.7);
      if (buildingAt(px, pz, 0.3) >= 0) continue;
      const grp = signalGroup(n, ent);
      const pole = new THREE.Mesh(sigPoleG, MM.pole); pole.position.set(px, 0, pz); pole.castShadow = true; g.add(pole);
      const armLen = Math.min(hw * 0.9, 7), arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.12, 0.12), MM.pole); disp.push(arm.geometry);
      arm.position.set(px - rx * armLen / 2, 6.0, pz - rz * armLen / 2); arm.rotation.y = Math.atan2(rz, -rx); g.add(arm);
      const head = new THREE.Group(); head.position.set(px - rx * armLen * 0.85, 5.3, pz - rz * armLen * 0.85); head.rotation.y = Math.atan2(dx, dz); g.add(head);
      head.add(new THREE.Mesh(sigHeadG, MM.sigBox));
      const lampsM = [0.4, 0, -0.4].map((y) => { const l = new THREE.Mesh(sigLampG, MM.sigOff); l.position.set(0, y, 0.17); head.add(l); return l; });
      const sig = { n, grp, lamps: lampsM, x: px, z: pz };
      liveSignals.add(sig); signals.push(sig);
      obs.push([px, pz, 0.22, 'Hit a traffic light']);
    }
  }

  // Street-name signs at the corner of junctions where two named streets meet
  for (const n of m.tNode.get(t.key) || []) {
    if (m.nodeDeg[n] < 3) continue;
    const seen = [];
    for (let k = m.adjS[n]; k < m.adjS[n + 1] && seen.length < 2; k++) {
      const e = m.adj[k] >> 1, nm = m.names[m.eName[e]];
      if (!nm || RC[m.eCls[e]].hwy || RC[m.eCls[e]].path || seen.some((s) => s.nm === nm)) continue;
      seen.push({ nm, ent: m.adj[k], e });
    }
    if (seen.length < 2) continue;
    const [d1x, d1z] = dirFromNode(n, seen[0].ent), [d2x, d2z] = dirFromNode(n, seen[1].ent);
    const px = m.nx[n] + d1x * (m.eHW[seen[1].e] + 1.8) + d2x * (m.eHW[seen[0].e] + 1.8), pz = m.nz[n] + d1z * (m.eHW[seen[1].e] + 1.8) + d2z * (m.eHW[seen[0].e] + 1.8);
    const q = roadQuery(px, pz, 4); if (q.in) continue;
    if (buildingAt(px, pz, 0.3) >= 0) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 6), MM.pole); pole.position.set(px, 1.7, pz); g.add(pole); disp.push(pole.geometry);
    seen.forEach((s, k) => {
      const [dx, dz] = k === 0 ? [d1x, d1z] : [d2x, d2z];
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.44), streetSignMat(s.nm)); disp.push(pl.geometry); signNames.push(s.nm);
      pl.position.set(px, 3.35 - k * 0.5, pz); pl.rotation.y = Math.atan2(-dz, dx); g.add(pl);
    });
    obs.push([px, pz, 0.12, 'Hit a sign post']);
  }

  scene.add(g);
  t.detail = { g, disp, signs: signNames, signals };
  t.obs = (t.baseObs || []).concat(obs);
}

// Signal groups: approaches roughly parallel to the junction's first road share a phase
function signalGroup(n, ent) {
  const m = MAP;
  let ref = null;
  for (let k = m.adjS[n]; k < m.adjS[n + 1]; k++) if (RC[m.eCls[m.adj[k] >> 1]].drive) { ref = dirFromNode(n, m.adj[k]); break; }
  if (!ref) return 0;
  const d = dirFromNode(n, ent);
  return Math.abs(ref[0] * d[0] + ref[1] * d[1]) > 0.7071 ? 0 : 1;
}
// 0 green, 1 yellow, 2 red — 40 s cycle, offset per junction
function signalState(n, grp, time) {
  const tt = ((time + hash2(n, 99) * 40) % 40 + 40) % 40;
  if (grp === 0) return tt < 16 ? 0 : tt < 19.5 ? 1 : 2;
  return tt < 20 ? 2 : tt < 36 ? 0 : tt < 39.5 ? 1 : 2;
}
function updateSignals(time) {
  for (const s of liveSignals) {
    const st = signalState(s.n, s.grp, time);
    s.lamps[0].material = st === 2 ? MM.sigR : MM.sigOff;
    s.lamps[1].material = st === 1 ? MM.sigY : MM.sigOff;
    s.lamps[2].material = st === 0 ? MM.sigG : MM.sigOff;
  }
}

// ---------------------------------------------------------------- minimap and city map
const miniWater = document.createElement('canvas'); miniWater.width = miniWater.height = 72;
function drawMiniMap(g, Wm, k, cx, cz, heading, extra) {
  const m = MAP; if (!m) return;
  const c0 = Wm / 2;
  const P = (x, z) => [c0 - (x - cx) * k, c0 - (z - cz) * k];    // north up; west (+x) to the left
  g.save(); g.clearRect(0, 0, Wm, Wm);
  g.beginPath(); g.arc(c0, c0, Wm / 2, 0, TAU); g.clip();
  g.fillStyle = '#23252c'; g.fillRect(0, 0, Wm, Wm);
  // land / water underlay sampled from the raster
  const R = Wm / 2 / k, step = (2 * R) / 72, wg = miniWater.getContext('2d'), img = wg.createImageData(72, 72);
  const lcCol = { 1: [43, 76, 102], 2: [44, 74, 46], 3: [32, 58, 38], 4: [120, 110, 84], 5: [52, 53, 58], 6: [42, 50, 42] };
  for (let r = 0; r < 72; r++) for (let c = 0; c < 72; c++) {
    const x = cx + R - (c + 0.5) * step, z = cz + R - (r + 0.5) * step, v = landAt(x, z), col = lcCol[v] || [35, 37, 44], o = (r * 72 + c) * 4;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  wg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.drawImage(miniWater, 0, 0, Wm, Wm);
  // buildings
  const a0 = m.cellIx(cx - R), a1 = m.cellIx(cx + R), b0 = m.cellIz(cz - R), b1 = m.cellIz(cz + R);
  g.fillStyle = '#4a4b55';
  const seenB = new Set();
  for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
    const c = b * m.GW + a;
    for (let q = m.bGrid.start[c]; q < m.bGrid.start[c + 1]; q++) {
      const bi = m.bGrid.items[q]; if (seenB.has(bi)) continue; seenB.add(bi);
      g.beginPath();
      for (let i = m.bOff[bi]; i < m.bOff[bi + 1]; i++) { const [px, py] = P(m.bx[i], m.bz[i]); if (i === m.bOff[bi]) g.moveTo(px, py); else g.lineTo(px, py); }
      g.fill();
    }
  }
  // roads, by class
  g.lineCap = 'round';
  const seen = new Set();
  for (let pass = 0; pass < 2; pass++) for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
    const c = b * m.GW + a;
    for (let q = m.segGrid.start[c]; q < m.segGrid.start[c + 1]; q++) {
      const i = m.segGrid.items[q], e = m.pE[i], R2 = RC[m.eCls[e]], major = R2.hwy || m.eCls[e] <= 3;
      if ((pass === 0) === major) continue;
      const key = i * 2 + pass; if (seen.has(key)) continue; seen.add(key);
      const [x0, y0] = P(m.px[i], m.pz[i]), [x1, y1] = P(m.px[i + 1], m.pz[i + 1]);
      g.strokeStyle = R2.hwy ? '#e8b04a' : R2.path ? '#6d6a60' : major ? '#d6d2c8' : '#9a978f';
      g.lineWidth = Math.max(R2.path ? 0.8 : 1.3, m.eHW[e] * 2 * k);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  }
  if (extra) extra(P);
  g.translate(c0, c0); g.rotate(-heading);
  g.fillStyle = '#ff3d7f'; g.beginPath(); g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6); g.closePath(); g.fill();
  g.restore();
}
// Whole-city map, pre-rendered once per city
let cityMapCv = null, cityMapK = 1;
function renderCityMap() {
  const m = MAP, W = 2400, H = Math.round(W * (m.gz1 - m.gz0) / (m.gx1 - m.gx0));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), k = W / (m.gx1 - m.gx0);
  cityMapK = k;
  const P = (x, z) => [(m.gx1 - x) * k, (m.gz1 - z) * k];
  g.fillStyle = '#1d1f26'; g.fillRect(0, 0, W, H);
  // landcover at reduced resolution
  const step = Math.max(1, Math.round(1 / (k * m.res))), lw = Math.ceil(m.W / step), lh = Math.ceil(m.H / step);
  const lcv = document.createElement('canvas'); lcv.width = lw; lcv.height = lh;
  const lg = lcv.getContext('2d'), img = lg.createImageData(lw, lh);
  const lcCol = { 0: [32, 34, 41], 1: [36, 70, 98], 2: [40, 70, 44], 3: [30, 56, 36], 4: [110, 100, 78], 5: [44, 45, 51], 6: [36, 44, 38] };
  for (let r = 0; r < lh; r++) for (let c = 0; c < lw; c++) {
    const v = m.land[Math.min(m.H - 1, r * step) * m.W + Math.min(m.W - 1, c * step)], col = lcCol[v] || lcCol[0];
    // raster columns run with gx (west is +), so flip both axes to put north up and east right
    const o = ((lh - 1 - r) * lw + (lw - 1 - c)) * 4;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  lg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.drawImage(lcv, 0, 0, W, H);
  g.lineCap = 'round';
  const order = [16, 15, 14, 8, 7, 6, 5, 13, 12, 11, 4, 3, 2, 10, 9, 1, 0];
  for (const cls of order) {
    const R = RC[cls];
    g.strokeStyle = R.hwy ? '#f0b64a' : cls <= 3 ? '#d8d4ca' : R.path ? '#55534c' : '#7d7a72';
    g.lineWidth = R.hwy ? 3 : cls <= 3 ? 1.8 : R.path ? 0.6 : 0.9;
    g.beginPath();
    for (let e = 0; e < m.E; e++) {
      if (m.eCls[e] !== cls) continue;
      for (let i = m.eOff[e]; i < m.eOff[e + 1]; i++) { const [x, y] = P(m.px[i], m.pz[i]); if (i === m.eOff[e]) g.moveTo(x, y); else g.lineTo(x, y); }
    }
    g.stroke();
  }
  // municipality names at the centre of their area
  const acc = new Map();
  for (let r = 0; r < m.MH; r += 2) for (let c = 0; c < m.MW; c += 2) { const v = m.muni[r * m.MW + c]; if (!v) continue; const a = acc.get(v) || [0, 0, 0]; a[0] += c; a[1] += r; a[2]++; acc.set(v, a); }
  g.font = '800 30px "Archivo", sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(243,239,231,.6)'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 5;
  for (const [v, a] of acc) {
    if (a[2] < 400) continue;
    const x = m.gx0 + (a[0] / a[2] + 0.5) * m.mres, z = m.gz0 + (a[1] / a[2] + 0.5) * m.mres, [px, py] = P(x, z);
    g.strokeText(m.munis[v].toUpperCase(), px, py); g.fillText(m.munis[v].toUpperCase(), px, py);
  }
  cityMapCv = cv;
}
