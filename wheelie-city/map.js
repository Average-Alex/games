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
const CURB = 0.16;      // raised sidewalk height

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

// a short pause between unpacking stages, so the page still answers clicks while a big city unpacks
const yieldUI = () => new Promise((r) => setTimeout(r, 0));
async function decodeMap(meta, b64) {
  const T0 = performance.now(), lap = (k) => { if (typeof LOAD_MS !== 'undefined') LOAD_MS['map_' + k] = Math.round(performance.now() - T0); };
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  lap('b64');
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
  lap('s1'); await yieldUI();
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
  lap('s2'); await yieldUI();
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
  lap('s3'); await yieldUI();
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
  const BS = meta.version >= 2 ? 7 : 5;
  const bI = sec('buildings'), bp = sec('bPts'), nB = bI.length / BS;
  m.B = nB; m.bOff = new Int32Array(nB + 1); m.bH = new Float32Array(nB); m.bKind = new Uint8Array(nB);
  m.bName = new Uint16Array(nB); m.bMat = new Uint8Array(nB); m.bFlags = new Uint8Array(nB); m.bCol = new Int32Array(nB).fill(-1);
  m.bBox = new Float32Array(nB * 4);
  let bt = 0; for (let b = 0; b < nB; b++) { m.bOff[b] = bt; bt += bI[BS * b + 3] + 1; } m.bOff[nB] = bt;
  m.bx = new Float32Array(bt); m.bz = new Float32Array(bt);
  for (let b = 0; b < nB; b++) {
    let x = bI[BS * b] * u, z = bI[BS * b + 1] * u, o = m.bOff[b];
    const st = bI[BS * b + 2], cnt = bI[BS * b + 3], hk = bI[BS * b + 4];
    m.bH[b] = (hk & 0xffff) / 4; m.bKind[b] = hk >>> 16;
    if (BS === 7) { const ex = bI[BS * b + 5]; m.bName[b] = ex & 0xffff; m.bMat[b] = (ex >>> 16) & 255; m.bFlags[b] = (ex >>> 24) & 255; m.bCol[b] = bI[BS * b + 6]; }
    let x0 = x, x1 = x, z0 = z, z1 = z;
    m.bx[o] = x; m.bz[o] = z;
    for (let k = 0; k < cnt; k++) { x += bp[2 * (st + k)] * u; z += bp[2 * (st + k) + 1] * u; o++; m.bx[o] = x; m.bz[o] = z; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    m.bBox.set([x0, z0, x1, z1], b * 4);
  }
  lap('s4'); await yieldUI();
  m.bGrid = csr(nB, (add, setCur) => {
    for (let b = 0; b < nB; b++) {
      if (setCur) setCur(b);
      const x0 = cellIx(m.bBox[4 * b]), x1 = cellIx(m.bBox[4 * b + 2]), z0 = cellIz(m.bBox[4 * b + 1]), z1 = cellIz(m.bBox[4 * b + 3]);
      for (let a = x0; a <= x1; a++) for (let c = z0; c <= z1; c++) add(c * m.GW + a);
    }
  });

  lap('s5'); await yieldUI();
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

  // rapid transit lines: points flagged ground / elevated / underground, with a height profile and stations along them
  m.lines = [];
  if (meta.secs.transit) {
    const tI = sec('transit'), tP = sec('tPts'), tF = sec('tFlag');
    for (let k = 0; k < tI.length; k += 2) {
      const st = tI[k], cnt = tI[k + 1], xs = new Float32Array(cnt), zs = new Float32Array(cnt), cs = new Float32Array(cnt), fl = new Uint8Array(cnt), hs = new Float32Array(cnt);
      for (let i = 0; i < cnt; i++) { xs[i] = tP[2 * (st + i)] * u; zs[i] = tP[2 * (st + i) + 1] * u; fl[i] = tF[st + i]; if (i) cs[i] = cs[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]); }
      // Stations and short stretches between bridges are often not tagged as bridge or tunnel in OSM, which made the
      // track dip to the ground and climb back up. Fill gaps under 600 m that have the same level on both sides.
      for (let i = 0; i < cnt;) {
        if (fl[i] !== 0) { i++; continue; }
        let j = i; while (j < cnt && fl[j] === 0) j++;
        const before = i > 0 ? fl[i - 1] : -1, after = j < cnt ? fl[j] : -1, len = cs[Math.min(j, cnt - 1)] - cs[Math.max(0, i - 1)];
        if (before > 0 && before === after && len < 600) for (let k = i; k < j; k++) fl[k] = before;
        i = j;
      }
      // height: elevated 7.5 m, underground -9 m; ramps on the elevated/tunnel side of each change, ground stays at 0
      const dGround = new Float32Array(cnt).fill(1e9);
      let last = -1e9; for (let i = 0; i < cnt; i++) { if (fl[i] === 0) last = cs[i]; dGround[i] = cs[i] - last; }
      last = 1e9; for (let i = cnt - 1; i >= 0; i--) { if (fl[i] === 0) last = cs[i]; dGround[i] = Math.min(dGround[i], last - cs[i]); }
      for (let i = 0; i < cnt; i++) hs[i] = fl[i] === 1 ? 7.5 * clamp(dGround[i] / 90, 0, 1) : fl[i] === 2 ? -9 * clamp(dGround[i] / 70, 0, 1) : 0;
      m.lines.push({ xs, zs, cs, fl, hs, len: cs[cnt - 1], stations: [] });
    }
    // snap each station to the lines that pass it
    const skip = /bus (loop|exchange|bay)|terminal|pacific central|amtrak|greyhound|via rail|park ?& ?ride/i;
    for (const [nm0, x, z] of meta.stations || []) {
      if (skip.test(nm0)) continue;
      const nm = nm0.replace(/\s+(Station|Stn\.?)$/i, '').trim();
      m.lines.forEach((ln, li) => {
        let bd = 160, bs = -1;
        for (let i = 0; i < ln.xs.length - 1; i++) {
          const ax = ln.xs[i], az = ln.zs[i], dx = ln.xs[i + 1] - ax, dz = ln.zs[i + 1] - az, L2 = dx * dx + dz * dz || 1e-6, t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
          const d = Math.hypot(x - ax - dx * t, z - az - dz * t); if (d < bd) { bd = d; bs = ln.cs[i] + t * Math.sqrt(L2); }
        }
        // one stop per 150 m of line: the same station is often mapped twice (node and area, or "X" and "X Station")
        if (bs >= 0 && !ln.stations.some((s) => s.name === nm || Math.abs(s.s - bs) < 150)) ln.stations.push({ name: nm, s: bs, x, z, line: li });
      });
    }
    for (const ln of m.lines) ln.stations.sort((a, b) => a.s - b.s);
    m.lines = m.lines.filter((ln) => ln.stations.length >= 2);
    m.lines.forEach((ln, i) => { ln.id = i; for (const s of ln.stations) s.line = i; });
  }
  m.pois = meta.pois || [];
  m.stops = meta.stops || [];
  m.shops = meta.shops || [];

  // landcover raster (RLE) and municipalities
  m.W = meta.W; m.H = meta.H; m.res = meta.res;
  const rle = sec('land'); m.land = new Uint8Array(m.W * m.H);
  for (let k = 0, o = 0; k < rle.length; k += 2) { const v = rle[k], n = rle[k + 1]; if (v) m.land.fill(v, o, o + n); o += n; }
  m.muni = sec('muni'); m.MW = meta.MW; m.MH = meta.MH; m.mres = meta.mres;

  lap('s6'); await yieldUI();
  // tile indexes: what each 160 m tile builds
  const tkey = (x, z) => (Math.floor(x / TILE) + 2048) * 4096 + (Math.floor(z / TILE) + 2048);
  m.tkey = tkey;
  const tIdx = (len) => { const mp = new Map(); return { mp, add(k, v) { let a = mp.get(k); if (!a) mp.set(k, a = []); a.push(v); } }; };
  const tSeg = tIdx(), tNode = tIdx(), tBld = tIdx(), tTree = tIdx(), tRail = tIdx();
  for (let i = 0; i < tot - 1; i++) if (m.pE[i] === m.pE[i + 1]) tSeg.add(tkey((m.px[i] + m.px[i + 1]) / 2, (m.pz[i] + m.pz[i + 1]) / 2), i);
  for (let n = 0; n < N; n++) tNode.add(tkey(m.nx[n], m.nz[n]), n);
  // each building is built by the tile at the middle of its footprint (not its first corner): a mall 600 m long
  // otherwise only appeared once you were near one end of it
  for (let b = 0; b < nB; b++) tBld.add(tkey((m.bBox[4 * b] + m.bBox[4 * b + 2]) / 2, (m.bBox[4 * b + 1] + m.bBox[4 * b + 3]) / 2), b);
  for (let i = 0; i < m.T; i++) tTree.add(tkey(m.tx[i], m.tz[i]), i);
  // transit track pieces, bus stops, landmarks and stations by tile (heavy-rail viaducts are left out: they floated over streets)
  m.lines.forEach((r, ri) => { for (let i = 0; i < r.xs.length - 1; i++) tRail.add(tkey((r.xs[i] + r.xs[i + 1]) / 2, (r.zs[i] + r.zs[i + 1]) / 2), ri * 65536 + i); });
  const tStop = tIdx(), tPoi = tIdx(), tSta = tIdx(), tShop = tIdx();
  m.stops.forEach((s, i) => tStop.add(tkey(s[0], s[1]), i));
  m.shops.forEach((s, i) => tShop.add(tkey(s[2], s[3]), i));
  m.pois.forEach((p, i) => tPoi.add(tkey(p[2], p[3]), i));
  m.lines.forEach((ln) => ln.stations.forEach((s) => { linePoint(ln, s.s, s); tSta.add(tkey(s.px, s.pz), s); }));
  m.tSeg = tSeg.mp; m.tNode = tNode.mp; m.tBld = tBld.mp; m.tTree = tTree.mp; m.tRail = tRail.mp; m.tStop = tStop.mp; m.tPoi = tPoi.mp; m.tSta = tSta.mp; m.tShop = tShop.mp;
  m.names = meta.names; m.munis = meta.munis;
  m.places = meta.places.filter((p) => ['neighbourhood', 'suburb', 'quarter', 'borough', 'village'].includes(p[1]));
  m.towns = meta.places.filter((p) => p[1] === 'city' || p[1] === 'town');
  lap('end');
  MAP = m;
  return m;
}

// ---------------------------------------------------------------- queries
const RQ = { e: -1, i: -1, t: 0, d: 1e9, s: 0, side: 0, hw: 0, in: false }, RQB = { ...RQ };
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
// Point on a transit line at distance s: position (px,pz), height h, direction (dx,dz)
function linePoint(ln, s, out) {
  s = clamp(s, 0, ln.len);
  let lo = 0, hi = ln.cs.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ln.cs[mid] <= s) lo = mid; else hi = mid; }
  const i = lo, j = Math.min(ln.cs.length - 1, i + 1), L = (ln.cs[j] - ln.cs[i]) || 1e-6, t = clamp((s - ln.cs[i]) / L, 0, 1);
  out.px = ln.xs[i] + (ln.xs[j] - ln.xs[i]) * t; out.pz = ln.zs[i] + (ln.zs[j] - ln.zs[i]) * t;
  out.h = ln.hs[i] + (ln.hs[j] - ln.hs[i]) * t;
  const dx = ln.xs[j] - ln.xs[i], dz = ln.zs[j] - ln.zs[i], d = Math.hypot(dx, dz) || 1;
  out.dx = dx / d; out.dz = dz / d; out.under = ln.fl[i] === 2 && ln.fl[j] === 2;
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
  if (t && t.obs) for (const o of t.obs) {
    if (o.length === 4) { const dx = o[0] - x, dz = o[1] - z, r = o[2] + pad; if (dx * dx + dz * dz < r * r) return o[3]; }
    else {
      // line obstacle [x0, z0, x1, z1, label, halfWidth]: barriers, railings, parked cars
      const dx = o[2] - o[0], dz = o[3] - o[1], L2 = dx * dx + dz * dz || 1e-6, tt = clamp(((x - o[0]) * dx + (z - o[1]) * dz) / L2, 0, 1);
      if (Math.hypot(x - o[0] - dx * tt, z - o[1] - dz * tt) < o[5] + pad) return o[4];
    }
  }
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
const WALL_DEFAULTS = {
  brick: ['#8c4a38', '#a0583f', '#7a3e30', '#b0705a', '#6e3a2e', '#9a6a52'],
  industrial: ['#9aa0a6', '#b8bcc0', '#7f868c', '#c9c2b0', '#5f6a72'],
  stone: ['#d8d0bc', '#c8bea8', '#e4ddcc', '#b8ae98'],
  shop: ['#c8102e', '#1f5f9a', '#2a7a4a', '#e0a020', '#3a3a3a', '#7a3a8a', '#d8d8d8', '#a05a2a', '#1a8a8a'],
};
const TRANSIT = { van: 'SkyTrain', la: 'Metro', vegas: 'Monorail', miami: 'Metrorail', nyc: 'Subway' };
const signTexCache = new Map();   // street name sign textures, ref-counted
function setupMapMaterials() {
  for (const k of Object.keys(MM)) { const v = MM[k]; if (Array.isArray(v)) v.forEach((x) => x.dispose && x.dispose()); else if (v && v.dispose) v.dispose(); delete MM[k]; }
  for (const v of signTexCache.values()) { v.tex.dispose(); v.mat.dispose(); }
  signTexCache.clear();
  const night = C.night || C.dusk, low = quality === 'low';
  // photo surfaces (world.js loads them); canvas fallbacks if they failed to load
  MM.asphalt = TEX.asphalt_c || noiseTexture('#9a9a9a', 0.35, 256, 3, 0.04);
  MM.concreteTex = TEX.sidewalk_c || paverTexture();
  const asphaltAvg = TEX.asphalt_c ? texAverage(TEX.asphalt_c) : new THREE.Color(0.5, 0.5, 0.5);
  MM.roadTint = 1 / Math.max(0.05, (asphaltAvg.r + asphaltAvg.g + asphaltAvg.b) / 3);
  MM.road = low ? new THREE.MeshLambertMaterial({ map: MM.asphalt, vertexColors: true })
    : new THREE.MeshStandardMaterial({ map: MM.asphalt, normalMap: TEX.asphalt_n || null, roughnessMap: TEX.asphalt_r || null, vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.8 });
  if (!low) addWetRoad(MM.road);
  // the road colours in CITIES are dark tints; scale so the photo keeps its own brightness: real dry asphalt is a
  // mid-dark grey (about 10% reflectance), not black
  MM.road.color.setScalar(Math.min(8, MM.roadTint * 2.6));
  MM.walk = low ? new THREE.MeshLambertMaterial({ map: MM.concreteTex, vertexColors: true, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ map: MM.concreteTex, normalMap: TEX.sidewalk_n || null, roughnessMap: TEX.sidewalk_r || null, vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0, envMapIntensity: 0.6 });
  if (!low) addWetRoad(MM.walk);
  MM.curb = low ? new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ map: TEX.sidewalk_c || null, vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  MM.mark = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#222222' });
  MM.water = new THREE.MeshStandardMaterial({ color: C.land.water, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.93 });
  // pitched house roofs: real roof tiles (tinted per house: slate grey and brown, terracotta in the sunny cities)
  MM.tiles = low ? new THREE.MeshLambertMaterial({ map: TEX.rooftiles_c || null, vertexColors: true, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ map: TEX.rooftiles_c || null, normalMap: TEX.rooftiles_n || null, vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, envMapIntensity: 0.5 });
  MM.roof = low ? new THREE.MeshLambertMaterial({ map: TEX.roofgravel_c || null, vertexColors: true, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ map: TEX.roofgravel_c || null, normalMap: TEX.roofgravel_n || null, vertexColors: true, side: THREE.DoubleSide, roughness: 0.92, metalness: 0.02, envMapIntensity: 0.5 });
  // facades: real photographed towers, and composed photo walls with windows for everything lower (world.js)
  const fm = facadeMaterials();
  MM.walls = fm.mats;
  MM.wallTex = fm.disp;
  MM.concrete = new THREE.MeshLambertMaterial({ color: '#a8a49c', side: THREE.DoubleSide });
  MM.dome = new THREE.MeshLambertMaterial({ color: '#eceae4', side: THREE.DoubleSide });
  MM.glass = new THREE.MeshLambertMaterial({ color: '#a8c8d8', transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  MM.busSign = new THREE.MeshLambertMaterial({ color: '#1f5fbf' });
  MM.parkedPaint = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.4, vertexColors: true });
  MM.track = new THREE.MeshLambertMaterial({ vertexColors: true });
  MM.tunnel = new THREE.MeshLambertMaterial({ color: '#3b3d41', side: THREE.DoubleSide, emissive: '#101113' });
  MM.tunnelLamp = new THREE.MeshBasicMaterial({ color: '#fff1c8', side: THREE.DoubleSide });
  MM.platform = new THREE.MeshLambertMaterial({ color: '#b9b6ae' });
  MM.stationFloor = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  MM.stationMetal = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 });
  MM.stationDark = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: '#0a1a33' });
  MM.canopy = new THREE.MeshLambertMaterial({ color: '#d8dbdf' });
  MM.metal = new THREE.MeshLambertMaterial({ color: '#8d949a', side: THREE.DoubleSide });
  MM.pole = new THREE.MeshLambertMaterial({ color: '#3c3f45' });
  MM.lamp = new THREE.MeshBasicMaterial({ color: night ? '#ffe2a8' : '#d9d4c6', toneMapped: !night }); if (night) MM.lamp.color.multiplyScalar(2.2);   // glowing at night (bloom)
  MM.trunk = low ? new THREE.MeshLambertMaterial({ map: TEX.bark_c || null, color: '#c8b8a8' }) : new THREE.MeshStandardMaterial({ map: TEX.bark_c || null, normalMap: TEX.bark_n || null, color: '#c8b8a8', roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  MM.palmTrunk = low ? new THREE.MeshLambertMaterial({ map: TEX.palmbark_c || null }) : new THREE.MeshStandardMaterial({ map: TEX.palmbark_c || null, normalMap: TEX.palmbark_n || null, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  // foliage from real scanned leaves, tinted per tree (instance colour)
  MM.leafTex = leafClusterTex(cityKey === 'van' || cityKey === 'nyc' ? 'maple' : 'round'); MM.needleTex = needleTex(); MM.frondTex = frondTex();
  MM.leaf = foliageMaterial(MM.leafTex);
  MM.conifer = foliageMaterial(MM.needleTex);
  MM.frond = foliageMaterial(MM.frondTex);
  for (const k of ['leaf', 'conifer', 'frond']) MM[k + 'Depth'] = MM[k].userData.depth;
  // front yards: hedges (leafy core plus the leaf cards), stucco garden walls
  MM.hedge = low ? new THREE.MeshLambertMaterial({ map: hedgeTexture(MM.leafTex) }) : new THREE.MeshStandardMaterial({ map: hedgeTexture(MM.leafTex), roughness: 0.9, metalness: 0, envMapIntensity: 0.5 });
  MM.gardenWall = low ? new THREE.MeshLambertMaterial({ map: TEX.plaster_c || null }) : new THREE.MeshStandardMaterial({ map: TEX.plaster_c || null, normalMap: TEX.plaster_n || null, roughness: 0.92, metalness: 0 });
  MM.sigBox = new THREE.MeshLambertMaterial({ color: '#1d1f22' });
  MM.sigOff = new THREE.MeshLambertMaterial({ color: '#262626' });
  MM.sigR = new THREE.MeshBasicMaterial({ color: '#ff2a1a' }); MM.sigY = new THREE.MeshBasicMaterial({ color: '#ffb000' }); MM.sigG = new THREE.MeshBasicMaterial({ color: '#2dff8a' });
  MM.signs = C.signs.map(([t, c]) => { const tex = signTexture(t, c); return new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }); });
  // neon tubes (vertex colour per building), bright enough to bloom
  MM.neon = C.neon ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) }) : null;
  MM.landCol = Object.fromEntries(Object.entries(C.land).map(([k, v]) => [k, new THREE.Color(v)]));
  applyWetness();
}
// Rain: roads and pavements darken and turn glossy, with standing water in the low spots (from a noise mask)
const NEON_COL = ['#ff2d8a', '#36e0ff', '#ffc23a', '#b45cff', '#ff5a2a', '#4dff8a', '#ffffff'].map((c) => new THREE.Color(c));
const WET = { value: 0 };
function addWetRoad(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.wetK = WET; sh.uniforms.detailMap = { value: detailTex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWetUV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWetUV = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float wetK; uniform sampler2D detailMap; varying vec2 vWetUV;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nfloat puddle = smoothstep(0.52, 0.6, texture2D(detailMap, vWetUV * 0.035).g) * wetK;\nroughnessFactor = mix(0.8 + 0.2 * roughnessFactor, mix(0.32, 0.04, puddle), wetK);\ndiffuseColor.rgb *= 1.0 - 0.38 * wetK - 0.2 * puddle;')
      // dry asphalt and concrete barely mirror the sky; wet ones do
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#if defined( RE_IndirectSpecular )\nradiance *= mix(0.22, 0.6, wetK) + 0.4 * puddle;\n#endif');
  };
  mat.customProgramCacheKey = () => 'wet-road';
}
function applyWetness() { WET.value = WX.wet; }
function acquireSign(key, makeTex, lit) {
  let v = signTexCache.get(key);
  if (!v) {
    const tex = makeTex();
    const mat = lit ? new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: C.night || C.dusk ? 0.75 : 0.12 })
      : new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    v = { tex, mat, refs: 0 }; signTexCache.set(key, v);
  }
  v.refs++;
  return v.mat;
}
const streetSignMat = (text) => acquireSign(text, () => streetSignTexture(text), false);
// Real business names over the shop door, coloured by what kind of place it is
const SHOP_COL = { cafe: '#5a3a28', restaurant: '#8a1c2a', fast_food: '#c8102e', bar: '#4a2a6a', pub: '#2a4a2a', bank: '#1f3f7a', pharmacy: '#1f7a4a',
  supermarket: '#2a7a3a', convenience: '#1f5f9a', clothes: '#222226', casino: '#8a1c6a', cinema: '#6a1a1a', ice_cream: '#d84a8a', bakery: '#a0682a', fuel: '#c8102e', nightclub: '#3a1a5a' };
const shopSignMat = (name, kind) => { const col = SHOP_COL[kind] || ['#1f5f9a', '#2a2a2e', '#7a3a2a', '#2a6a6a', '#5a2a5a', '#3a4a2a'][Math.floor(hash2(name.length, name.charCodeAt(0) || 0, 3) * 6)]; return [acquireSign(`shop|${name}|${col}`, () => shopSignTexture(name, col), true), `shop|${name}|${col}`]; };
function releaseSign(text) {
  const v = signTexCache.get(text); if (!v) return;
  if (--v.refs <= 0) { v.tex.dispose(); v.mat.dispose(); signTexCache.delete(text); }
}

// shared prop geometries
// Trees: lumpy clustered crowns, layered conifers, palms with curved trunks and drooping fronds
const lumpy = (geo, amt, seed) => {
  // deterministic by position, so seams that share a position move together (no cracks)
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + amt * (hash2(Math.round(x * 20), Math.round(y * 20) + seed, Math.round(z * 20)) - 0.5);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
};
const palmTrunk = (() => {
  const parts = [];
  let x = 0, z = 0;
  for (let k = 0; k < 6; k++) {
    const g = new THREE.CylinderGeometry(0.15 - k * 0.008, 0.2 - k * 0.008, 1.55, 8); g.translate(0, 0.78, 0);
    g.rotateZ(-0.03 * k); g.translate(x, k * 1.5, z); x += 0.05 * k; parts.push(g);
    const ring = new THREE.TorusGeometry(0.19 - k * 0.008, 0.025, 4, 10); ring.rotateX(Math.PI / 2); ring.translate(x, k * 1.5 + 0.2, z); parts.push(ring);
  }
  return merge(parts);
})();
const palmCrown = (() => {
  const parts = [];
  for (let i = 0; i < 12; i++) {
    const f = new THREE.PlaneGeometry(0.55, 3.4, 1, 8), p = f.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const v = (p.getY(k) + 1.7) / 3.4, w = p.getX(k);
      p.setXYZ(k, w * (1 - v * 0.7), 0.25 * Math.sin(v * Math.PI) - 1.5 * v * v, v * 3.4);    // arch up then droop
    }
    f.rotateX(-0.15 + (i % 3) * 0.12); f.rotateY(i / 12 * TAU + (i % 2) * 0.2); f.translate(0.5, 9.2, 0);
    f.computeVertexNormals(); parts.push(f);
  }
  const nut = new THREE.SphereGeometry(0.32, 8, 6); nut.translate(0.5, 9.05, 0); parts.push(nut);
  return merge(parts);
})();
const treeTrunk = (() => {
  const t = new THREE.CylinderGeometry(0.12, 0.24, 3.4, 8); t.translate(0, 1.7, 0);
  const b1 = new THREE.CylinderGeometry(0.05, 0.09, 1.6, 6); b1.rotateZ(0.8); b1.translate(0.5, 3.2, 0);
  const b2 = new THREE.CylinderGeometry(0.05, 0.08, 1.4, 6); b2.rotateZ(-0.7); b2.rotateY(1.9); b2.translate(-0.3, 3.4, 0.35);
  return merge([t, b1, b2]);
})();
const treeCrown = (() => {
  const blobs = [[0, 4.6, 0, 1.95], [1.1, 5.0, 0.4, 1.45], [-1.0, 4.9, -0.3, 1.55], [0.3, 5.9, -0.4, 1.4], [-0.4, 4.2, 1.0, 1.3]];
  return merge(blobs.map(([x, y, z, s], i) => { const g = lumpy(new THREE.SphereGeometry(s, 8, 6), 0.28, i * 7); g.scale(1, 0.85, 1); g.translate(x, y, z); return g; }));
})();
const conifer = (() => {
  const parts = [];
  for (let k = 0; k < 5; k++) {
    const r = 2.3 - k * 0.42, h = 3.0 - k * 0.25, g = new THREE.ConeGeometry(r, h, 11, 2, true), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, y - 0.25 - 0.18 * Math.sin(a * 5 + k)); } }   // ragged, drooping hem
    g.computeVertexNormals(); g.translate(0, 3.2 + k * 1.55, 0); parts.push(g);
  }
  return merge(parts);
})();
const lampPole = (() => {
  const p = new THREE.CylinderGeometry(0.08, 0.13, 8, 6); p.translate(0, 4, 0);
  const a = new THREE.BoxGeometry(2.6, 0.09, 0.09); a.translate(1.3, 7.9, 0);
  return merge([p, a]);
})();
const lampHead = (() => { const g = new THREE.BoxGeometry(0.8, 0.16, 0.36); g.translate(2.55, 7.8, 0); return g; })();
const sigPoleG = (() => { const g = new THREE.CylinderGeometry(0.11, 0.14, 6.2, 8); g.translate(0, 3.1, 0); return g; })();
const sigHeadG = new THREE.BoxGeometry(0.42, 1.25, 0.32);
const sigLampG = new THREE.CircleGeometry(0.14, 12);
const STOP_GEO = {
  roof: new THREE.BoxGeometry(3.8, 0.1, 1.6), back: new THREE.BoxGeometry(3.6, 2.2, 0.04), bench: new THREE.BoxGeometry(2.4, 0.08, 0.4),
  post: new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), sign: new THREE.BoxGeometry(0.5, 0.6, 0.04),
};

// ---------------------------------------------------------------- streamed tiles
const tiles = new Map();
// the parked cars along the curbs of the loaded tiles (instances), and the ones taken (so a rebuilt tile leaves them out)
const parkedCars = [], TAKEN_PARKED = new Set();
const parkedKey = (x, z) => `${Math.round(x * 2)},${Math.round(z * 2)}`;
const liveSignals = new Set();
// Streamed street tiles round you: 5 x 5 on Low/Medium/High (the far skyline shows the city beyond), 7 x 7 on Ultra.
// Laptop graphics are held back by the number of things drawn, so this matters more than resolution.
function tileRadius() { return Math.max(1, (quality === 'ultra' ? 3 : 2) - GOV.dropRadius); }
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
  if (part === 'detail') { t.obs = t.baseObs ? t.baseObs.slice() : []; for (let i = parkedCars.length - 1; i >= 0; i--) if (parkedCars[i].t === t) parkedCars.splice(i, 1); }
  t[part] = null;
}
function clearTiles() { for (const t of [...tiles.values()]) disposeTile(t); tiles.clear(); liveSignals.clear(); parkedCars.length = 0; TAKEN_PARKED.clear(); }
function updateTiles(cx, cz, force) {
  if (!MAP) return;
  const ti = Math.floor(cx / TILE), tj = Math.floor(cz / TILE), RB = tileRadius(), RD = 1;
  for (const t of [...tiles.values()]) {
    const di = Math.abs(t.i - ti), dj = Math.abs(t.j - tj);
    if (di > RB + 1 || dj > RB + 1) disposeTile(t);
    else if (t.detail && (di > RD + 1 || dj > RD + 1)) disposePart(t, 'detail');
    // the ring just outside stays built (so turning round doesn't rebuild it) but isn't drawn
    if (t.base) t.base.g.visible = di <= RB && dj <= RB;
    if (t.detail) t.detail.g.visible = di <= RD && dj <= RD;
  }
  for (const t of tiles.values()) if (t.base && t.base.near) t.base.near.visible = Math.abs(t.i - ti) <= 1 && Math.abs(t.j - tj) <= 1;
  const todo = [];
  for (let a = ti - RB; a <= ti + RB; a++) for (let b = tj - RB; b <= tj + RB; b++) {
    const key = (a + 2048) * 4096 + (b + 2048), t = tiles.get(key), d = Math.hypot(a + 0.5 - cx / TILE, b + 0.5 - cz / TILE);
    if (!t || !t.base) todo.push([a, b, key, 'base', d]);
    if (Math.abs(a - ti) <= RD && Math.abs(b - tj) <= RD && (!t || !t.detail)) todo.push([a, b, key, 'detail', d + 0.01]);
  }
  todo.sort((p, q) => p[4] - q[4]);
  // the largest square round the player whose base tiles are all built: far skyline blocks inside it are hidden
  let rb = 0;
  for (let rr = 1; rr <= RB; rr++) {
    let ok = true;
    for (let a = ti - rr; a <= ti + rr && ok; a++) for (let b = tj - rr; b <= tj + rr; b++) { const t = tiles.get((a + 2048) * 4096 + (b + 2048)); if (!t || !t.base) { ok = false; break; } }
    if (!ok) break; rb = rr;
  }
  if (typeof setStreamBox === 'function') { if (rb > 0) setStreamBox((ti - rb) * TILE, (tj - rb) * TILE, (ti + rb + 1) * TILE, (tj + rb + 1) * TILE); else setStreamBox(1e9, 1e9, -1e9, -1e9); }
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

// Building look: style from the mapped material or the building type and height; colour from OSM where mapped.
// Shared with the far skyline (world.js) so a tower looks the same near and far.
const MATSTY = { 1: 'brick', 2: 'glass', 3: 'mid', 4: 'house', 5: 'industrial', 6: 'stone', 7: 'mid' };
function buildingStyle(b, h) {
  const m = MAP, kind = m.bKind[b], hs = hash2(b, 21);
  let st = MATSTY[m.bMat[b]] || (kind === 4 ? 'industrial' : kind === 5 ? (h < 30 ? 'stone' : 'tower')
    : (kind === 1 && h < 12) ? 'house' : h >= 36 ? towerStyle(hs)
    : hs < (C.brick || 0) ? 'brick' : 'mid');
  if (st === 'house' && h >= 14) st = 'mid';
  if (st === 'brick' && h >= 24) st = 'brickt';
  if (st === 'mid' && h >= 24) st = towerStyle(hash2(b, 22));
  if (st === 'industrial' && h >= 24) st = 'office';
  return st;
}
// towers by city: Vancouver and Miami glass, NYC more masonry and office grids
function towerStyle(hs) {
  const mix = { van: [0.42, 0.72, 0.84], miami: [0.45, 0.75, 0.86], la: [0.4, 0.6, 0.85], vegas: [0.45, 0.7, 0.88], nyc: [0.28, 0.4, 0.68] }[cityKey] || [0.4, 0.6, 0.8];
  return hs < mix[0] ? 'glass' : hs < mix[1] ? 'glass2' : hs < mix[2] ? 'office' : cityKey === 'nyc' && hs > 0.86 ? 'brickt' : 'tower';
}
function buildingColor(b, style) {
  const m = MAP;
  if (PHOTO_FACADE[style]) {
    // photographed facades keep their own colour: only a light tint, and the mapped colour only faintly
    const c = new THREE.Color('#ffffff').multiplyScalar(0.82 + hash2(b, 3, 2) * 0.22);
    if (m.bCol[b] >= 0) c.lerp(new THREE.Color(m.bCol[b]), 0.25);
    return c;
  }
  const pal = C.walls[style] || WALL_DEFAULTS[style] || C.walls.mid;
  const c = m.bCol[b] >= 0 ? new THREE.Color(m.bCol[b]) : new THREE.Color(pal[Math.floor(hash2(b, 7, 1) * pal.length)]).multiplyScalar(0.88 + hash2(b, 3, 2) * 0.2);
  // the composed walls are already grey-washed photos: lift the tint toward white so they aren't too dark
  return c.lerp(new THREE.Color('#ffffff'), style === 'brick' ? 0.35 : 0.2);
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
    const mat = addGroundDetail(new THREE.MeshLambertMaterial({ map: tex })); disp.push(tex, mat);
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
  const rb = new GeoBuf(true, true), sw = new GeoBuf(true, true), rails = new GeoBuf(), fascia = new GeoBuf(), barr = new GeoBuf(), curb = new GeoBuf(true), lineObs = [];
  const colCurb = new THREE.Color(C.walk).multiplyScalar(1.08);
  const colRoad = new THREE.Color(C.road), colConc = new THREE.Color(C.concrete), colWalk = new THREE.Color(C.walk), colPath = new THREE.Color(C.path), colPlaza = new THREE.Color(C.walk).lerp(new THREE.Color('#ffffff'), 0.1);
  const concreteHwy = cityKey === 'la' || cityKey === 'vegas';
  const segs = m.tSeg.get(t.key) || [];
  for (const i of segs) {
    const e = m.pE[i], R = RC[m.eCls[e]], hw = m.eHW[e], y = roadY(R.rank), fl = m.eFlag[e];
    const ax = m.px[i], az = m.pz[i], bx = m.px[i + 1], bz = m.pz[i + 1], amx = m.mx[i], amz = m.mz[i], bmx = m.mx[i + 1], bmz = m.mz[i + 1];
    const col = R.path ? (m.eCls[e] === 14 ? colPlaza : colPath) : (R.hwy && concreteHwy) ? colConc : colRoad;
    const tint = col.clone().multiplyScalar(0.92 + hash2(e, 1, 3) * 0.12);
    // The city is flat, so a bridge is drawn at street level. Where one passes over another street (the footbridges
    // across the Strip, overpasses) its railings, side walls and, for footbridges, its deck would stand across that
    // street as a wall. Those stretches are left open.
    if (fl & F_BRIDGE) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 3));
      const under = (x, z) => { const q = roadQuery(x, z, 14, (e2) => e2 !== e && !(m.eFlag[e2] & F_BRIDGE) && !RC[m.eCls[e2]].path, RQB); return q.e >= 0 && q.d < q.hw + 0.6; };
      for (let k = 0; k < n; k++) {
        const f0 = k / n, f1 = (k + 1) / n, P = (f) => [ax + (bx - ax) * f, az + (bz - az) * f, amx + (bmx - amx) * f, amz + (bmz - amz) * f];
        const [x0, z0, m0x, m0z] = P(f0), [x1, z1, m1x, m1z] = P(f1), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cmx = (m0x + m1x) / 2, cmz = (m0z + m1z) / 2;
        const midOver = under(cx, cz);
        if (!(R.path && midOver)) rb.flat(x0 - m0x * hw, z0 - m0z * hw, x1 - m1x * hw, z1 - m1z * hw, x1 + m1x * hw, z1 + m1z * hw, x0 + m0x * hw, z0 + m0z * hw, y, tint, 1 / 7);
        for (const s of [-1, 1]) {
          const o = hw + 0.15;
          if (midOver || under(cx + cmx * o * s, cz + cmz * o * s)) continue;
          const r0x = x0 + m0x * o * s, r0z = z0 + m0z * o * s, r1x = x1 + m1x * o * s, r1z = z1 + m1z * o * s;
          rails.wall(r0x, r0z, r1x, r1z, y, y + 1.1, cmx * s, cmz * s);
          lineObs.push([r0x, r0z, r1x, r1z, 'Hit the railing', 0.12]);
          const o2 = hw + 0.3;
          fascia.wall(x0 + m0x * o2 * s, z0 + m0z * o2 * s, x1 + m1x * o2 * s, z1 + m1z * o2 * s, -1.6, y + 0.05, cmx * s, cmz * s);
        }
      }
    } else rb.flat(ax - amx * hw, az - amz * hw, bx - bmx * hw, bz - bmz * hw, bx + bmx * hw, bz + bmz * hw, ax + amx * hw, az + amz * hw, y, tint, 1 / 7);
    if (R.walk && !(fl & (F_BRIDGE | F_TUNNEL))) {
      const w = hw + 2.6;
      sw.flat(ax - amx * w, az - amz * w, bx - bmx * w, bz - bmz * w, bx + bmx * w, bz + bmz * w, ax + amx * w, az + amz * w, 0.03, colWalk, 1 / 5);
      // raised sidewalk and curb on both sides, stopping short of junctions so corners stay open
      const L = m.eLen[e], skA = m.nodeDeg[m.eA[e]] >= 3 ? m.nodeHW[m.eA[e]] + 2.8 : 0, skB = m.nodeDeg[m.eB[e]] >= 3 ? m.nodeHW[m.eB[e]] + 2.8 : 0;
      const s0 = m.pc[i], s1 = m.pc[i + 1], lo = Math.max(s0, skA), hi = Math.min(s1, L - skB);
      if (hi > lo + 0.2) {
        const P = (s, off) => { const f = clamp((s - s0) / ((s1 - s0) || 1e-6), 0, 1), nx = amx + (bmx - amx) * f, nz = amz + (bmz - amz) * f; return [ax + (bx - ax) * f + nx * off, az + (bz - az) * f + nz * off]; };
        for (const sd of [-1, 1]) {
          const a0 = P(lo, sd * hw), a1 = P(hi, sd * hw), b0 = P(lo, sd * w), b1 = P(hi, sd * w);
          sw.flat(a0[0], a0[1], a1[0], a1[1], b1[0], b1[1], b0[0], b0[1], CURB, colWalk, 1 / 5);
          const cnx = -sd * (amx + bmx) / 2, cnz = -sd * (amz + bmz) / 2;
          curb.wall(a0[0], a0[1], a1[0], a1[1], y - 0.02, CURB, cnx, cnz, colCurb);
        }
      }
    }
    if (fl & F_BRIDGE) {
      // (railings and side walls are drawn above, skipping the stretches over other streets)
      // deck underside
      if (!R.path) fascia.flat(ax - amx * (hw + 0.3), az - amz * (hw + 0.3), bx - bmx * (hw + 0.3), bz - bmz * (hw + 0.3), bx + bmx * (hw + 0.3), bz + bmz * (hw + 0.3), ax + amx * (hw + 0.3), az + amz * (hw + 0.3), -1.6, null, 0);
    } else if (m.eCls[e] === 0 && !(fl & F_TUNNEL)) {
      // a median barrier only: on the left of a one-way carriageway, and only where the other direction is right there.
      // (Ramps merge on the right, so there is never a barrier between a ramp and the freeway.)
      if (fl & F_ONEWAY) {
        const mx_ = (ax + bx) / 2 - (amx + bmx) / 2 * (hw + 6), mz_ = (az + bz) / 2 - (amz + bmz) / 2 * (hw + 6);
        const qm = roadQuery(mx_, mz_, 12, (e2) => e2 !== e && m.eCls[e2] === 0);
        const bx_ = (ax + bx) / 2 - (amx + bmx) / 2 * (hw + 1.5), bz_ = (az + bz) / 2 - (amz + bmz) / 2 * (hw + 1.5);
        const ramp = roadQuery(bx_, bz_, 10, (e2) => e2 !== e && m.eCls[e2] !== 0);   // any ramp or road alongside: leave it open
        if (qm.e >= 0 && qm.d < qm.hw + 3 && !(ramp.e >= 0 && ramp.d < ramp.hw + 2.5)) {
          const o = hw + 0.25, x0 = ax - amx * o, z0 = az - amz * o, x1 = bx - bmx * o, z1 = bz - bmz * o;
          barr.wall(x0, z0, x1, z1, 0, 0.85, -amx, -amz);
          lineObs.push([x0, z0, x1, z1, 'Hit the barrier', 0.2]);
        }
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
  if (!curb.empty) addMesh(curb.build(), MM.curb);
  if (!rails.empty) addMesh(rails.build(), MM.metal);
  if (!fascia.empty) addMesh(fascia.build(), MM.concrete);
  if (!barr.empty) addMesh(barr.build(), MM.concrete);

  // Buildings. Style comes from the mapped material or the building type; colour from OSM where it's mapped.
  const STY = Object.keys(FACADE_SIZE);
  const W = Object.fromEntries(STY.map((st) => [st, new GeoBuf(true, true)])), roof = new GeoBuf(true, true), tiles = new GeoBuf(true, true);
  const signs = [], labels = [], domes = [], shopSigns = [];
  const neon = C.neon && MM.neon ? new GeoBuf(true) : null;
  // real businesses (shop / cafe / restaurant nodes) matched to the building they're in
  const shopsIn = new Map();
  for (const si of m.tShop.get(t.key) || []) {
    const sh = m.shops[si], bi = buildingAt(sh[2], sh[3], 3);
    if (bi < 0) continue;
    let arr = shopsIn.get(bi); if (!arr) shopsIn.set(bi, arr = []);
    if (arr.length < 6 && !arr.some((o) => o[0] === sh[0])) arr.push(sh);
  }
  const v2 = [], bxs = [], bzs = [];
  const box = (cx, cz, w, d, y0, y1, ang, col) => {
    const c = Math.cos(ang), sn = Math.sin(ang), P = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b2]) => [cx + a * c - b2 * sn, cz + a * sn + b2 * c]);
    for (let k = 0; k < 4; k++) { const [x0, z0] = P[k], [x1, z1] = P[(k + 1) % 4], L = Math.hypot(x1 - x0, z1 - z0) || 1; W.mid.wall(x0, z0, x1, z1, y0, y1, (z1 - z0) / L, -(x1 - x0) / L, col, 0.001, 0.002, 0.001, 0.002); }
    for (const k of [0, 1, 2, 0, 2, 3]) roof.v(P[k][0], y1, P[k][1], 0, 1, 0, col, P[k][0] / 6, P[k][1] / 6);
  };
  for (const b of m.tBld.get(t.key) || []) {
    if (m.bHide && m.bHide[b]) continue;      // replaced by a hand-built landmark (landmarks.js)
    const o0 = m.bOff[b], o1 = m.bOff[b + 1], n = o1 - o0, h = m.bH[b] + hash2(b, 41) * 0.12, kind = m.bKind[b], fl = m.bFlags[b];
    let area = 0, cx = 0, cz = 0;
    for (let i = o0, j = o1 - 1; i < o1; j = i++) { area += m.bx[j] * m.bz[i] - m.bx[i] * m.bz[j]; cx += m.bx[i]; cz += m.bz[i]; }
    area /= 2; cx /= n; cz /= n; const sgn = area >= 0 ? 1 : -1, absA = Math.abs(area);
    // pull each corner 8 cm towards the middle: neighbours that share a wall no longer z-fight (tower parts 22 cm, so a
    // part standing on the edge of its podium does not fight the podium wall)
    bxs.length = 0; bzs.length = 0;
    const ins = fl & 16 ? 0.22 : 0.08;
    for (let i = o0; i < o1; i++) { const dx = cx - m.bx[i], dz = cz - m.bz[i], L = Math.hypot(dx, dz) || 1; bxs.push(m.bx[i] + dx / L * ins); bzs.push(m.bz[i] + dz / L * ins); }
    const style = buildingStyle(b, h), col = buildingColor(b, style);
    const [texW, texH] = FACADE_SIZE[style];
    // houses get a pitched roof: a gable over a plain four-cornered house (most of them), a hip roof otherwise
    const pitched = style === 'house' && n >= 4 && n <= 12 && h < 11 && absA < 400;
    const gable = pitched && n === 4 && hash2(b, 71) < 0.65;
    const colDark = col.clone().multiplyScalar(0.55), colMid = col.clone().multiplyScalar(0.8), colPar = col.clone().multiplyScalar(0.78);
    const parapet = !pitched && !(fl & 2) && h > 7 && style !== 'house';
    const wallTop = pitched ? h - 2.2 : h;
    const shop = !(fl & 16) && ((fl & 1) || (shopsIn.has(b) && style !== 'house' && h >= 5) || ((kind === 0 || kind === 2 || kind === 3) && h >= 6.5 && style !== 'industrial' && style !== 'house' && absA < 6000 && hash2(b, 31) < 0.55));
    const band = shop ? 4.2 : -0.3;
    const spal = C.walls.shop || WALL_DEFAULTS.shop, shopCol = new THREE.Color(spal[Math.floor(hash2(b, 33) * spal.length)]), shopDark = shopCol.clone().multiplyScalar(0.7);
    let per = 0, longest = 0, li = 0;
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n, x0 = bxs[k], z0 = bzs[k], x1 = bxs[k2], z1 = bzs[k2], dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1e-3;
      const nx = dz / L * sgn, nz = -dx / L * sgn;
      if (shop) W.shop.wall(x0, z0, x1, z1, -0.3, band, nx, nz, shopCol, per / 24, (per + L) / 24, 0, 1, shopDark);
      if (wallTop > band) {
        // darker toward the street (grime and shade), full colour higher up
        const split = Math.min(wallTop, band + 6), uA = per / texW, uB = (per + L) / texW;
        W[style].wall(x0, z0, x1, z1, band, split, nx, nz, col, uA, uB, band / texH, split / texH, shop ? colMid : colDark);
        if (wallTop > split) W[style].wall(x0, z0, x1, z1, split, wallTop, nx, nz, col, uA, uB, split / texH, wallTop / texH);
      }
      if (parapet) roof.wall(x0, z0, x1, z1, h - 0.05, h + 0.75, nx, nz, colPar, per / 4, (per + L) / 4, 0, 0.2);
      per += L; if (L > longest) { longest = L; li = k; }
    }
    // Vegas: neon bands round the crown of the resort towers and the casino roofs, light strips up tower corners
    if (neon && !pitched && style !== 'house' && (h >= 30 || (absA > 2500 && h >= 9))) {
      const nc = NEON_COL[Math.floor(hash2(b, 61) * NEON_COL.length)], tall = h >= 60;
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n, L = Math.hypot(bxs[k2] - bxs[k], bzs[k2] - bzs[k]); if (L < 2) continue;
        const nx = (bzs[k2] - bzs[k]) / L * sgn, nz = -(bxs[k2] - bxs[k]) / L * sgn, o = 0.12;
        const x0 = bxs[k] + nx * o, z0 = bzs[k] + nz * o, x1 = bxs[k2] + nx * o, z1 = bzs[k2] + nz * o;
        neon.wall(x0, z0, x1, z1, h - 1.5, h - 0.6, nx, nz, nc);
        if (tall) neon.wall(x0, z0, x1, z1, h - 4.2, h - 3.7, nx, nz, nc);
        if (!tall && h < 30) neon.wall(x0, z0, x1, z1, 5.2, 5.6, nx, nz, nc);
        if (tall && L > 6 && n <= 12) { const w = 0.7 / L; neon.wall(x0, z0, x0 + (x1 - x0) * w, z0 + (z1 - z0) * w, 6, h - 4.2, nx, nz, nc); }
      }
    }
    const rc = new THREE.Color(style === 'house' ? (C.trees === 'palms' ? (hash2(b, 9) < 0.6 ? '#d0785a' : '#9a7a66') : (hash2(b, 9) < 0.5 ? '#70727a' : '#8a6a5c')) : style === 'industrial' ? '#c8ccd0' : '#a8aaac').multiplyScalar(0.8 + hash2(b, 4) * 0.35);
    if (pitched) {
      // the roof over the footprint's box along its longest wall, with eaves overhanging 40 cm all round; tiled, lit by
      // its real slope (so the sunny side is brighter than the shady one)
      const ex = bxs[(li + 1) % n] - bxs[li], ez = bzs[(li + 1) % n] - bzs[li], el = Math.hypot(ex, ez) || 1, ux = ex / el, uz = ez / el, vx = -uz, vz = ux;
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (let k = 0; k < n; k++) { const u = bxs[k] * ux + bzs[k] * uz, v = bxs[k] * vx + bzs[k] * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      const ov = 0.4, wu0 = u0, wu1 = u1, wv0 = v0, wv1 = v1, vm = (v0 + v1) / 2, half = (v1 - v0) / 2, rise = h - wallTop;
      u0 -= ov; u1 += ov; v0 -= ov; v1 += ov;
      const yE = wallTop - rise * ov / Math.max(0.5, half);                               // the eave, a little lower than the wall top
      let ua = u0, ub = u1;
      if (!gable) { ua = u0 + half + ov; ub = u1 - half - ov; if (ub < ua) ua = ub = (u0 + u1) / 2; }
      const P = (u, v, y) => [u * ux + v * vx, y, u * uz + v * vz];
      const face = (pts) => {
        const [a, bb, c] = pts, n1 = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], n2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let nx = n1[1] * n2[2] - n1[2] * n2[1], ny = n1[2] * n2[0] - n1[0] * n2[2], nz = n1[0] * n2[1] - n1[1] * n2[0]; const L = Math.hypot(nx, ny, nz) || 1;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const tris = pts.length === 4 ? [pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]] : pts;
        for (const q of tris) tiles.v(q[0], q[1], q[2], nx / L, ny / L, nz / L, rc, (q[0] * ux + q[2] * uz) / 2.2, (Math.abs(q[0] * vx + q[2] * vz - vm) + (h - q[1])) / 2.2);
      };
      face([P(u0, v0, yE), P(u1, v0, yE), P(ub, vm, h), P(ua, vm, h)]);
      face([P(u1, v1, yE), P(u0, v1, yE), P(ua, vm, h), P(ub, vm, h)]);
      if (!gable) { face([P(u0, v1, yE), P(u0, v0, yE), P(ua, vm, h)]); face([P(u1, v0, yE), P(u1, v1, yE), P(ub, vm, h)]); }
      else {
        // the gable ends: wall triangles up to the ridge, on the end walls
        const gw = W[style];
        for (const [uE, sgnE] of [[wu0, -1], [wu1, 1]]) {
          const a = P(uE, wv0, wallTop), c = P(uE, wv1, wallTop), r = P(uE, vm, h), gnx = ux * sgnE, gnz = uz * sgnE;
          for (const q of [a, c, r]) gw.v(q[0], q[1], q[2], gnx, 0, gnz, col, 0.003, 0.003);
        }
      }
      // fascia boards under the eaves along the long sides
      for (const vv of [v0, v1]) { const a = P(u0, vv, yE), c = P(u1, vv, yE); roof.wall(a[0], a[2], c[0], c[2], yE - 0.18, yE, vx * (vv > vm ? 1 : -1), vz * (vv > vm ? 1 : -1), rc.clone().multiplyScalar(0.5), 0, 0.01, 0, 0.01); }
    } else {
      v2.length = 0;
      for (let k = 0; k < n; k++) v2.push(new THREE.Vector2(bxs[k], bzs[k]));
      let faces;
      try { faces = THREE.ShapeUtils.triangulateShape(v2, []); } catch { faces = []; }
      for (const f of faces) for (const k of f) roof.v(v2[k].x, h, v2[k].y, 0, 1, 0, rc, v2[k].x / 6, v2[k].y / 6);
      // rooftop plant on bigger flat roofs: lift housing, AC units
      if (absA > 250 && style !== 'house' && !(fl & 2) && insideBuilding(b, cx, cz, 0)) {
        const ang = Math.atan2(bzs[1] - bzs[0], bxs[1] - bxs[0]), rcol = new THREE.Color('#9a9c9e');
        box(cx, cz, 4 + hash2(b, 51) * 3, 3 + hash2(b, 52) * 3, h, h + 2.2 + hash2(b, 53) * 1.5, ang, rcol);
        if (absA > 900) box(cx + Math.cos(ang) * 6, cz + Math.sin(ang) * 6, 2.2, 1.6, h, h + 1.3, ang, rcol);
      }
    }
    // stadium and dome roofs
    if (fl & 2) {
      const bb = b * 4, rx = (m.bBox[bb + 2] - m.bBox[bb]) / 2, rz = (m.bBox[bb + 3] - m.bBox[bb + 1]) / 2;
      domes.push({ x: (m.bBox[bb] + m.bBox[bb + 2]) / 2, z: (m.bBox[bb + 1] + m.bBox[bb + 3]) / 2, rx: rx * 0.92, rz: rz * 0.92, ry: Math.min(rx, rz) * 0.42, y: h });
    }
    // landmark name tags
    const nm = m.bName[b] ? m.names[m.bName[b]] : '';
    if ((fl & 8) && nm) labels.push({ text: nm, sub: '', x: cx, z: cz, y: h + 9 + ((fl & 2) ? Math.min(40, Math.sqrt(absA) * 0.2) : 0) });
    // shop signs: real business names from the map over the street-facing wall; neon casino signs in Vegas
    const here = shopsIn.get(b) || [], bnm = m.bName[b] ? m.names[m.bName[b]] : '';
    if (!here.length && (fl & 1) && bnm && h < 40) here.push([bnm, 'shop', cx, cz]);
    if (here.length && longest > 3) {
      // the wall closest to a road is the shopfront
      let best = -1, bd = 1e9;
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n, Lk = Math.hypot(bxs[k2] - bxs[k], bzs[k2] - bzs[k]);
        if (Lk < 3) continue;
        // step 3 m out from the wall: it must be open ground (not a wall shared with the building next door)
        const onx = (bzs[k2] - bzs[k]) / Lk * sgn, onz = -(bxs[k2] - bxs[k]) / Lk * sgn;
        const mx = (bxs[k] + bxs[k2]) / 2 + onx * 3, mz = (bzs[k] + bzs[k2]) / 2 + onz * 3;
        if (buildingAt(mx, mz, 0.5) >= 0) continue;
        const q = roadQuery(mx, mz, 30, (e2) => m.eCls[e2] !== 8 && !RC[m.eCls[e2]].path); const dd = q.e >= 0 ? q.d - q.hw : 99;   // a real street, not the back lane
        if (dd < bd) { bd = dd; best = k; }
      }
      if (best >= 0) {
      const k2 = (best + 1) % n, x0 = bxs[best], z0 = bzs[best], x1 = bxs[k2], z1 = bzs[k2], L = Math.hypot(x1 - x0, z1 - z0);
      const ux = (x1 - x0) / L, uz = (z1 - z0) / L, nx = uz * sgn, nz = -ux * sgn, list = here.slice(0, Math.max(1, Math.floor(L / 3.5)));
      const w = Math.min(4.6, L / list.length - 0.4);
      list.forEach(([name, kind, sx, sz], k) => {
        let along = (sx - x0) * ux + (sz - z0) * uz;
        if (list.length > 1) along = clamp(along, (k + 0.5) * L / list.length - L / list.length * 0.4, (k + 0.5) * L / list.length + L / list.length * 0.4);
        along = clamp(along, w / 2 + 0.2, L - w / 2 - 0.2);
        shopSigns.push({ x: x0 + ux * along + nx * 0.16, z: z0 + uz * along + nz * 0.16, y: shop ? 3.55 : Math.min(h - 0.6, 3.6), w, rot: Math.atan2(nx, nz), name, kind });
      });
      }
    } else if (C.neon && (kind === 3 || kind === 0) && h < 40 && longest > 7 && hash2(b, 11) < 0.6) {
      const k2 = (li + 1) % n, x0 = bxs[li], z0 = bzs[li], x1 = bxs[k2], z1 = bzs[k2], L = longest;
      const nx = (z1 - z0) / L * sgn, nz = -(x1 - x0) / L * sgn, w = Math.min(L - 2, 9);
      signs.push({ x: (x0 + x1) / 2 + nx * 0.14, z: (z0 + z1) / 2 + nz * 0.14, y: 5 + hash2(b, 2) * 6, w, rot: Math.atan2(nx, nz), mat: Math.floor(hash2(b, 13) * MM.signs.length) });
    }
  }
  for (const st of STY) if (!W[st].empty) addMesh(W[st].build(), MM.walls[st], { cast: true });
  if (!roof.empty) addMesh(roof.build(), MM.roof, { cast: true });
  if (!tiles.empty) addMesh(tiles.build(), MM.tiles, { cast: true });
  if (neon && !neon.empty) addMesh(neon.build(), MM.neon);
  // shop and neon signs are one draw each: only shown on the tiles near you (updateTiles), unreadable further out
  const near = new THREE.Group(); g.add(near);
  for (const s of signs) {
    const geo = new THREE.PlaneGeometry(s.w, s.w * 0.31), me = new THREE.Mesh(geo, MM.signs[s.mat]);
    me.position.set(s.x, s.y, s.z); me.rotation.y = s.rot; near.add(me); disp.push(geo);
  }
  const signKeys = [];
  for (const s of shopSigns) {
    const [mat, key] = shopSignMat(s.name, s.kind); signKeys.push(key);
    const geo = new THREE.PlaneGeometry(s.w, Math.min(0.95, s.w * 0.25)), me = new THREE.Mesh(geo, mat);
    me.position.set(s.x, s.y, s.z); me.rotation.y = s.rot; near.add(me); disp.push(geo);
  }
  for (const d of domes) {
    const geo = new THREE.SphereGeometry(1, 32, 12, 0, TAU, 0, Math.PI / 2), me = new THREE.Mesh(geo, MM.dome);
    me.scale.set(d.rx, d.ry, d.rz); me.position.set(d.x, d.y - 0.2, d.z); me.castShadow = true; me.receiveShadow = true; g.add(me); disp.push(geo);
  }

  // Rapid transit: elevated guideway on pillars, track on the ground, lit concrete tunnels underground, station platforms
  const rail = new GeoBuf(), track = new GeoBuf(true), tun = new GeoBuf(), tlamp = new GeoBuf(), obs = [];
  const ballast = new THREE.Color('#4a4642'), steel = new THREE.Color('#b8bcc0');
  const quad = (gb, ax, az, bx, bz, ya0, yb0, ya1, yb1, nnx, nny, nnz) => { gb.v(ax, ya0, az, nnx, nny, nnz); gb.v(bx, yb0, bz, nnx, nny, nnz); gb.v(bx, yb1, bz, nnx, nny, nnz); gb.v(ax, ya0, az, nnx, nny, nnz); gb.v(bx, yb1, bz, nnx, nny, nnz); gb.v(ax, ya1, az, nnx, nny, nnz); };
  for (const code of m.tRail.get(t.key) || []) {
    const ln = m.lines[code >> 16], i = code & 0xffff;
    const x0 = ln.xs[i], z0 = ln.zs[i], x1 = ln.xs[i + 1], z1 = ln.zs[i + 1], L = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
    const h0 = ln.hs[i], h1 = ln.hs[i + 1];
    const atStation = ln.stations.some((s) => Math.abs(s.s - (ln.cs[i] + ln.cs[i + 1]) / 2) < 45);
    // track bed and rails, whatever the height
    const ty0 = Math.abs(h0) < 0.4 ? 0.045 : h0 + 0.03, ty1 = Math.abs(h1) < 0.4 ? 0.045 : h1 + 0.03;
    const strip = (o, w, c) => { track.v(x0 + nx * (o - w), ty0, z0 + nz * (o - w), 0, 1, 0, c); track.v(x1 + nx * (o - w), ty1, z1 + nz * (o - w), 0, 1, 0, c); track.v(x1 + nx * (o + w), ty1, z1 + nz * (o + w), 0, 1, 0, c); track.v(x0 + nx * (o - w), ty0, z0 + nz * (o - w), 0, 1, 0, c); track.v(x1 + nx * (o + w), ty1, z1 + nz * (o + w), 0, 1, 0, c); track.v(x0 + nx * (o + w), ty0, z0 + nz * (o + w), 0, 1, 0, c); };
    strip(0, 1.5, ballast); strip(0.72, 0.05, steel); strip(-0.72, 0.05, steel);
    if (h0 > 0.4 || h1 > 0.4) {
      // single-track guideway: sides and underside (the deck is the track bed above)
      // single-track box girder: sides with a parapet lip, underside
      const w = 1.9, a0 = Math.max(0, h0), a1 = Math.max(0, h1), D = 1.7;
      for (const s of [-1, 1]) quad(rail, x0 + nx * w * s, z0 + nz * w * s, x1 + nx * w * s, z1 + nz * w * s, a0 - D, a1 - D, a0 + 0.55, a1 + 0.55, nx * s, 0, nz * s);
      rail.v(x0 - nx * w, a0 - D, z0 - nz * w, 0, -1, 0); rail.v(x1 + nx * w, a1 - D, z1 + nz * w, 0, -1, 0); rail.v(x1 - nx * w, a1 - D, z1 - nz * w, 0, -1, 0);
      rail.v(x0 - nx * w, a0 - D, z0 - nz * w, 0, -1, 0); rail.v(x0 + nx * w, a0 - D, z0 + nz * w, 0, -1, 0); rail.v(x1 + nx * w, a1 - D, z1 + nz * w, 0, -1, 0);
      // round piers every 25 m with a cap under the girder (and short stubs where the ramp is low)
      for (let s = Math.ceil(ln.cs[i] / 25) * 25; s < ln.cs[i + 1]; s += 25) {
        const f = (s - ln.cs[i]) / L, hh = h0 + (h1 - h0) * f; if (hh < D + 0.3) continue;
        const px = x0 + (x1 - x0) * f, pz = z0 + (z1 - z0) * f, r = 0.9, SEG = 12, top = hh - D - 0.7;
        for (let k = 0; k < SEG; k++) { const b0 = k / SEG * TAU, b1 = (k + 1) / SEG * TAU, c0 = Math.cos(b0), s0 = Math.sin(b0), c1 = Math.cos(b1), s1 = Math.sin(b1); rail.wall(px + c0 * r, pz + s0 * r, px + c1 * r, pz + s1 * r, 0, Math.max(0.1, top), (c0 + c1) / 2, (s0 + s1) / 2); }
        // pier cap: a block across the track direction
        const ux = (x1 - x0) / L, uz = (z1 - z0) / L, cw = 2.6, cd = 0.8, C4 = [[-cw, -cd], [cw, -cd], [cw, cd], [-cw, cd]].map(([a, bb]) => [px + nx * a + ux * bb, pz + nz * a + uz * bb]);
        for (let k = 0; k < 4; k++) { const [qx0, qz0] = C4[k], [qx1, qz1] = C4[(k + 1) % 4], ql = Math.hypot(qx1 - qx0, qz1 - qz0) || 1; rail.wall(qx0, qz0, qx1, qz1, Math.max(0, top), hh - D, (qz1 - qz0) / ql, -(qx1 - qx0) / ql); }
        obs.push([px, pz, 1.0, 'Hit a pillar']);
      }
    }
    if (h0 < -0.4 || h1 < -0.4) {
      // tunnel box (wider on one side at stations for the platform); no roof where it would poke out of the ground
      // at stations the box is wide enough for the platform and the escalator lane beside it; the station adds the
      // lane's own roof (leaving the escalator shaft open to the street)
      const wl = 2.6, wr = atStation ? LANE_V1 + 0.1 : 2.6, wroof = atStation ? LANE_V0 - 0.05 : wr, c0 = h0 + 5.4, c1 = h1 + 5.4, fy = Math.min(h0, h1) - 0.15;
      for (const [s, w] of [[-1, wl], [1, wr]]) tun.wall(x0 + nx * w * s, z0 + nz * w * s, x1 + nx * w * s, z1 + nz * w * s, fy, Math.min(Math.max(c0, c1), 0.3), -nx * s, -nz * s);
      tun.flat(x0 - nx * wl, z0 - nz * wl, x1 - nx * wl, z1 - nz * wl, x1 + nx * wr, z1 + nz * wr, x0 + nx * wr, z0 + nz * wr, fy, null, 0);
      if (c0 < -0.1 && c1 < -0.1) tun.flat(x0 - nx * wl, z0 - nz * wl, x1 - nx * wl, z1 - nz * wl, x1 + nx * wroof, z1 + nz * wroof, x0 + nx * wroof, z0 + nz * wroof, Math.min(c0, c1), null, 0);
      for (let s = Math.ceil(ln.cs[i] / 18) * 18; s < ln.cs[i + 1]; s += 18) {
        const f = (s - ln.cs[i]) / L, hh = h0 + (h1 - h0) * f; if (hh > -3) continue;
        const px = x0 + (x1 - x0) * f - nx * (wl - 0.1), pz = z0 + (z1 - z0) * f - nz * (wl - 0.1), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
        tlamp.wall(px - ux * 0.6, pz - uz * 0.6, px + ux * 0.6, pz + uz * 0.6, hh + 3.4, hh + 3.6, nx, nz);
      }
    }
  }
  if (!track.empty) addMesh(track.build(), MM.track);
  if (!rail.empty) addMesh(rail.build(), MM.concrete, { cast: true });
  if (!tun.empty) addMesh(tun.build(), MM.tunnel);
  if (!tlamp.empty) addMesh(tlamp.build(), MM.tunnelLamp);
  // stations: platform beside the track, canopy above ground, name tag over the street entrance
  for (const st of m.tSta.get(t.key) || []) {
    const ln = m.lines[st.line], P = linePoint(ln, st.s, {}), rx = -P.dz, rz = P.dx;
    const y = P.h, cx = P.px + rx * 3.7, cz = P.pz + rz * 3.7, ang = Math.atan2(P.dx, P.dz);
    const plat = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.0, PLAT_LEN), MM.platform); plat.position.set(cx, y + 0.5, cz); plat.rotation.y = ang; plat.receiveShadow = true; g.add(plat); disp.push(plat.geometry);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, PLAT_LEN), MM.sigY); edge.position.set(cx - rx * 1.6, y + 1.01, cz - rz * 1.6); edge.rotation.y = ang; g.add(edge); disp.push(edge.geometry);
    if (y > -1) { const can = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.3, PLAT_LEN - 6), MM.canopy); can.position.set(P.px + rx * 1.5, y + 5.2, P.pz + rz * 1.5); can.rotation.y = ang; can.castShadow = true; g.add(can); disp.push(can.geometry); }
    // street hall with fare gates, and the escalator up (or down) to the platform
    buildStationHall(st, g, disp, lineObs);
    const F = stationFrame(st), door = F.W(F.hallStart - F.su * 2, (HALL_V0 + HALL_V1) / 2, 0);
    if (!labels.some((l) => l.text === st.name)) labels.push({ text: st.name, sub: `${TRANSIT[cityKey] || 'Transit'} · E to go in`, x: door.x, z: door.z, y: 9, col: '#2b6bff' });
  }
  // landmarks that aren't buildings (monuments, viewpoints, attractions)
  for (const pi of m.tPoi.get(t.key) || []) {
    const [nm, kind, x, z] = m.pois[pi];
    if (labels.some((l) => l.text === nm)) continue;
    const bi = buildingAt(x, z, 0);
    labels.push({ text: nm, sub: kind.replace(/_/g, ' '), x, z, y: (bi >= 0 ? m.bH[bi] : 0) + 10 });
  }
  for (const l of labels) {
    const tex = labelTexture(l.text, l.sub, l.col), mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
    const sp = new THREE.Sprite(mat); sp.scale.set(22, 5.5, 1); sp.position.set(l.x, l.y, l.z); sp.renderOrder = 4; g.add(sp); disp.push(tex, mat);
  }

  near.userData.mergeRoot = true;
  mergeStatic(g, disp);
  scene.add(g);
  t.base = { g, disp, signs: signKeys, near };
  const allObs = obs.concat(lineObs);
  t.baseObs = allObs; t.obs = t.detail ? t.obs.concat(allObs) : allObs.slice();
}
// Merge a tile's static meshes that share a material into one draw each. Laptop GPUs (and Chromebooks) are held back
// by the number of draws far more than by triangles: a tile was ~30 separate poles, signs, posts, shelters and kerbs.
// Skipped: instanced meshes, sprites, anything under an object with userData.keep (signal heads, whose lamps change),
// and meshes with their own material (shop and street-name signs). A child group with userData.mergeRoot (the near
// signs, shown and hidden as a group) is merged on its own.
function mergeStatic(root, disp) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m4 = new THREE.Matrix4();
  const buckets = new Map();
  const visit = (o) => {
    for (const c of [...o.children]) {
      if (c.userData.keep) continue;
      if (c.userData.mergeRoot) { mergeStatic(c, disp); continue; }
      if (c.isMesh && !c.isInstancedMesh && !Array.isArray(c.material) && c.geometry && c.geometry.attributes.position) {
        const a = c.geometry.attributes, sig = Object.keys(a).sort().join(',');
        const key = c.material.uuid + '|' + sig + '|' + c.castShadow + '|' + (c.customDepthMaterial ? c.customDepthMaterial.uuid : '');
        let b = buckets.get(key); if (!b) buckets.set(key, b = []);
        b.push(c);
      }
      if (c.children.length) visit(c);
    }
  };
  visit(root);
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const names = Object.keys(list[0].geometry.attributes);
    const arrays = Object.fromEntries(names.map((n) => [n, []]));
    for (const me of list) {
      m4.multiplyMatrices(inv, me.matrixWorld);
      const g = me.geometry.index ? me.geometry.toNonIndexed() : me.geometry.clone();
      g.applyMatrix4(m4);
      for (const n of names) { const at = g.attributes[n]; arrays[n].push(at); }
      me.parent.remove(me);
      if (g !== me.geometry) arrays._tmp = (arrays._tmp || []).concat([g]);
    }
    const out = new THREE.BufferGeometry();
    for (const n of names) {
      const parts = arrays[n], size = parts[0].itemSize, total = parts.reduce((s, p) => s + p.count, 0);
      const arr = new Float32Array(total * size); let o = 0;
      for (const p of parts) {
        // (integer attributes flagged normalised are scaled to 0..1, since the merged one is float)
        const sc = p.normalized ? (p.array instanceof Uint8Array ? 1 / 255 : p.array instanceof Uint16Array ? 1 / 65535 : 1) : 1;
        for (let i = 0; i < p.count; i++) for (let k = 0; k < size; k++) arr[(o + i) * size + k] = p.array[i * size + k] * sc;
        o += p.count;
      }
      out.setAttribute(n, new THREE.BufferAttribute(arr, size, false));
    }
    for (const g of arrays._tmp || []) g.dispose();
    out.computeBoundingSphere();
    const merged = new THREE.Mesh(out, list[0].material);
    merged.castShadow = list[0].castShadow; merged.receiveShadow = list[0].receiveShadow;
    if (list[0].customDepthMaterial) merged.customDepthMaterial = list[0].customDepthMaterial;
    root.add(merged); disp.push(out);
  }
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
  const wearPatch = new THREE.Color('#3a3936'), wearCrack = new THREE.Color('#151516'), wearMetal = new THREE.Color('#4a4842');
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
      // a solid white edge line in from each curb (the parking strip outside it), on anything wider than a lane each way
      const per = Math.max(1, Math.floor(laneTot / 2));
      const ew = m.eHW[e] - (residential ? 2.0 : 2.4);
      if (ew > lw * per - 0.2 && ew > 2.6) { strip(i, lo, hi, ew, 0.12, white, y); strip(i, lo, hi, -ew, 0.12, white, y); }
      for (let k = 1; k < per; k++) { dashes(k * lw); dashes(-k * lw); }
    }
    // wear: darker repaired patches, sealed cracks (thin black lines), manhole covers; a little under the paint
    if (R.hwy || quality === 'low') continue;
    const hwR = m.eHW[e] - 0.4, yw = y - 0.005;
    for (let s = Math.ceil(lo / 7) * 7; s < hi; s += 7) {
      const h1 = hash2(e * 7 + Math.round(s), 3, 41), h2 = hash2(e * 7 + Math.round(s), 5, 42), h3 = hash2(e * 7 + Math.round(s), 7, 43);
      if (h1 < 0.09) { const len = 1.2 + h2 * 3, w = 0.8 + h3 * 1.8, o = (h2 - 0.5) * 2 * Math.max(0, hwR - w / 2); strip(i, s, Math.min(hi, s + len), o, w, wearPatch, yw); }
      else if (h1 < 0.36) { const len = 2 + h3 * 5, o = (h2 - 0.5) * 2 * hwR; strip(i, s, Math.min(hi, s + len * 0.5), o, 0.035, wearCrack, yw); strip(i, s + len * 0.5, Math.min(hi, s + len), o + (h3 - 0.5) * 0.25, 0.035, wearCrack, yw); }
      else if (h1 > 0.93) {
        // a manhole cover in a lane: a ring of quads round the centre
        const o = (h2 < 0.5 ? -1 : 1) * lw * 0.5, s0 = m.pc[i], L = m.pc[i + 1] - s0 || 1e-6, f = clamp((s + 1 - s0) / L, 0, 1);
        const px = m.px[i] + (m.px[i + 1] - m.px[i]) * f + m.mx[i] * o, pz = m.pz[i] + (m.pz[i + 1] - m.pz[i]) * f + m.mz[i] * o;
        for (let a = 0; a < 8; a++) { const a0 = a / 8 * TAU, a1 = (a + 1) / 8 * TAU, r = 0.36; mk.flat(px, pz, px, pz, px + Math.cos(a1) * r, pz + Math.sin(a1) * r, px + Math.cos(a0) * r, pz + Math.sin(a0) * r, yw + 0.002, wearMetal); }
      }
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
  // Is (x,z) clear of every road surface and junction, with this much margin?
  const offRoad = (x, z, margin) => {
    const q = roadQuery(x, z, 24);
    if (q.e < 0) return true;
    if (q.d < q.hw + margin) return false;
    for (const n of [m.eA[q.e], m.eB[q.e]]) if (Math.hypot(m.nx[n] - x, m.nz[n] - z) < m.nodeHW[n] + margin + 1) return false;
    return true;
  };
  for (const ti of m.tTree.get(t.key) || []) {
    let x = m.tx[ti], z = m.tz[ti];
    // OSM street trees sit at the real curb; our roads can be a little wider, so nudge them back onto the boulevard
    const q = roadQuery(x, z, 16);
    if (q.e >= 0 && !RC[m.eCls[q.e]].path && q.d < q.hw + 0.9) {
      if (q.d < 0.6) continue;
      const i = q.i, cx = m.px[i] + (m.px[i + 1] - m.px[i]) * q.t, cz = m.pz[i] + (m.pz[i + 1] - m.pz[i]) * q.t;
      x = cx + (x - cx) / q.d * (q.hw + 1.4); z = cz + (z - cz) / q.d * (q.hw + 1.4);
    }
    if (!offRoad(x, z, 0.8) || buildingAt(x, z, 0.4) >= 0) continue;
    plant(x, z, 'street', 1);
  }
  const prob = { 3: 0.55, 2: 0.06, 6: C.trees === 'pnw' ? 0.09 : 0.05, 4: C.trees === 'palms' ? 0.02 : 0 };
  for (let a = 0; a < TILE; a += 10) for (let b = 0; b < TILE; b += 10) {
    const x = X0 + a + hash2(t.i * 37 + a, t.j * 41 + b, 1) * 9, z = Z0 + b + hash2(t.i * 37 + a, t.j * 41 + b, 2) * 9;
    const lc = landAt(x, z), p = prob[lc] || 0;
    if (!p || hash2(Math.round(x), Math.round(z), 9) > p) continue;
    const q = roadQuery(x, z, 14);
    if (q.e >= 0 && q.d < q.hw + (RC[m.eCls[q.e]].walk ? 3.4 : 1.2)) continue;
    if (!offRoad(x, z, 1.5) || buildingAt(x, z, 1.5) >= 0) continue;
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
        if (!offRoad(x, z, 0.8) || buildingAt(x, z, 0.8) >= 0) continue;
        plant(x, z, 'street', 6);
      }
    }
  }
  // Leafy streets of houses, every city: trees in most front yards and some along the curb (palms mixed in where it's
  // a palm city), only where there's a house or apartment building behind
  if (quality !== 'low') for (const i of segs) {
    const e = m.pE[i], cls = m.eCls[e];
    if (cls < 5 || cls > 7 || (m.eFlag[e] & (F_BRIDGE | F_TUNNEL))) continue;
    const hw = m.eHW[e], segL = m.pc[i + 1] - m.pc[i] || 1;
    for (let s = Math.ceil(m.pc[i] / 9) * 9; s < m.pc[i + 1]; s += 9) {
      if (s < m.nodeHW[m.eA[e]] + 7 || s > m.eLen[e] - m.nodeHW[m.eB[e]] - 7) continue;
      const f = (s - m.pc[i]) / segL, nx = m.mx[i] + (m.mx[i + 1] - m.mx[i]) * f, nz = m.mz[i] + (m.mz[i + 1] - m.mz[i]) * f;
      const cx = m.px[i] + (m.px[i + 1] - m.px[i]) * f, cz = m.pz[i] + (m.pz[i + 1] - m.pz[i]) * f;
      for (const side of [-1, 1]) {
        const k = hash2(e * 13 + Math.round(s), side + 9, 31); if (k > 0.6) continue;
        const off = k < 0.18 ? hw + 1.5 : hw + 5.2 + (k - 0.18) * 6, x = cx + nx * off * side, z = cz + nz * off * side;
        if (!offRoad(x, z, 0.9) || buildingAt(x, z, 2.0) >= 0) continue;
        const bi = buildingAt(x + nx * side * 6, z + nz * side * 6, 7);
        if (bi < 0 || (m.bKind[bi] !== 1 && m.bKind[bi] !== 2)) continue;
        plant(x, z, off > hw + 3 ? 'park' : 'street', 8);
      }
    }
  }
  // Front yards along streets of houses and apartments: each lot (12-20 m, a driveway gap at its start) gets a hedge,
  // a stucco garden wall with pillars, or an open lawn with a few bushes, just behind the sidewalk
  const yard = { hedge: [], leaf: [], wall: [], pillar: [], bush: [] };
  if (quality !== 'low') for (const i of segs) {
    const e = m.pE[i], cls = m.eCls[e];
    if (cls < 4 || cls > 7 || (m.eFlag[e] & (F_BRIDGE | F_TUNNEL))) continue;
    const hw = m.eHW[e], dx = m.px[i + 1] - m.px[i], dz = m.pz[i + 1] - m.pz[i], segL = Math.hypot(dx, dz) || 1, rot = Math.atan2(dx, dz);
    for (const side of [-1, 1]) {
      const lotL = 12 + hash2(e, side + 3, 21) * 8, phase = hash2(e, side + 5, 22) * lotL, off = hw + 3.15;
      for (let s = Math.ceil(m.pc[i] / 2) * 2 + 1; s < m.pc[i + 1]; s += 2) {
        if (s < m.nodeHW[m.eA[e]] + 6 || s > m.eLen[e] - m.nodeHW[m.eB[e]] - 6) continue;
        const ls = (s + phase) % lotL, lot = Math.floor((s + phase) / lotL);
        if (ls < 3) continue;                                                  // the driveway
        const f = (s - m.pc[i]) / segL, nx = m.mx[i] + (m.mx[i + 1] - m.mx[i]) * f, nz = m.mz[i] + (m.mz[i + 1] - m.mz[i]) * f;
        const cx = m.px[i] + dx * f, cz = m.pz[i] + dz * f, x = cx + nx * off * side, z = cz + nz * off * side;
        if (buildingAt(x, z, 0.7) >= 0 || !offRoad(x, z, 2.7)) continue;
        // only in front of homes: a house or apartment building just behind the line
        const bi = buildingAt(x + nx * side * 7, z + nz * side * 7, 5);
        if (bi < 0 || (m.bKind[bi] !== 1 && m.bKind[bi] !== 2)) continue;
        const kind = hash2(e * 31 + lot, side + 7, 23), y0 = CURB;
        if (kind < 0.5) {
          const h = 0.9 + hash2(e * 31 + lot, side, 24) * 0.8;
          yard.hedge.push([x, y0, z, rot, 2.02, h, 0.9]); yard.leaf.push([x, y0, z, rot, 2.02, h, 0.9]);
          obs.push([x, z, 0.6, 'Hit a hedge']);
        } else if (kind < (C.trees === 'palms' ? 0.78 : 0.62)) {
          const h = 0.85 + hash2(e * 31 + lot, side, 25) * 0.5;
          yard.wall.push([x, y0, z, rot, 2.0, h, 0.24, lot]);
          if (ls < 5) yard.pillar.push([x - (dx / segL) * 0.9, y0, z - (dz / segL) * 0.9, rot, 1, h + 0.25, 1, lot]);
          obs.push([x, z, 0.45, 'Hit a wall']);
        } else if (hash2(Math.round(x * 3), Math.round(z * 3), 26) < 0.3) {
          const sc = 0.22 + hash2(Math.round(x), Math.round(z), 27) * 0.14;
          yard.bush.push([x, y0 - (5 - 2.1) * sc + 0.05, z, hash2(Math.round(x), Math.round(z), 28) * TAU, sc, sc, sc]);
        }
      }
    }
  }
  {
    const wallPal = (C.walls && C.walls.house) || ['#e8e0d0'];
    const put = (geo, mat, list, cast, colOf) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
      list.forEach((o, k) => { q.setFromAxisAngle(Yv, o[3]); m4.compose(p.set(o[0], o[1], o[2]), q, sc.set(o[6], o[5], o[4])); im.setMatrixAt(k, m4); if (colOf) im.setColorAt(k, col.set(colOf(o))); });
      im.castShadow = cast; im.receiveShadow = true; if (mat.userData.depth) im.customDepthMaterial = mat.userData.depth; g.add(im); disp.push(im);
    };
    // (the module runs along the street: its length is the z scale once turned to the street's heading)
    put(hedgeCoreGeo, MM.hedge, yard.hedge.map((o) => [o[0], o[1], o[2], o[3], o[4] * 0.96, o[5] * 0.95, o[6] * 0.9]), true, (o) => ['#ffffff', '#e8f0d8', '#d8e4c4', '#f0f0dc'][Math.floor(Math.abs(o[0] * 7 + o[2] * 3)) % 4]);
    put(hedgeLeafGeo, MM.leaf, yard.leaf, true, () => '#d8e8c4');
    put(gardenWallGeo, MM.gardenWall, yard.wall, true, (o) => wallPal[o[7] % wallPal.length]);
    put(gardenPillarGeo, MM.gardenWall, yard.pillar, true, (o) => wallPal[o[7] % wallPal.length]);
    put(leafCrownGeo, MM.leaf, yard.bush, true, () => '#e0ecd0');
  }
  const inst = (geo, mat, list, cast, palette) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    list.forEach(([x, z, s, rot], k) => {
      q.setFromAxisAngle(Yv, rot); m4.compose(p.set(x, 0, z), q, sc.set(s * (0.9 + (rot % 0.2)), s, s * (0.9 + ((rot * 7) % 0.2)))); im.setMatrixAt(k, m4);
      if (palette) { col.set(palette[Math.floor((rot / TAU) * palette.length * 3) % palette.length]).multiplyScalar(C.night ? 0.55 : 0.88 + (rot % 0.18)); im.setColorAt(k, col); }
    });
    im.castShadow = cast; im.receiveShadow = true; if (mat.userData.depth) im.customDepthMaterial = mat.userData.depth; g.add(im); disp.push(im);
  };
  // tints over the real leaf colours: a little variety between trees
  const leafPal = ['#ffffff', '#e8f0d8', '#f4f0d0', '#d8e8c8', '#fff4d8', '#e0e8e0'];
  inst(barkTrunkGeo, MM.trunk, trees.deci, true);
  inst(firTrunkGeo, MM.trunk, trees.con, true);
  inst(leafCrownGeo, MM.leaf, trees.deci, true, leafPal);
  inst(firGeo, MM.conifer, trees.con, true, ['#b8c8b0', '#a8bca0', '#c8d4b8', '#9ab092']);
  inst(palmTrunkGeo, MM.palmTrunk, trees.palm, true);
  inst(palmFrondGeo, MM.frond, trees.palm, true, ['#d8e0c0', '#c8d4b0', '#e0e4c8']);

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
      head.userData.keep = true;           // (its lamps change colour: never merged away)
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

  // Bus stops: shelter (glass, roof, bench) and a sign post, pushed back onto the sidewalk
  for (const si of m.tStop.get(t.key) || []) {
    let [x, z, shelter] = m.stops[si];
    const q = roadQuery(x, z, 20);
    if (q.e < 0 || !RC[m.eCls[q.e]].walk) continue;
    const i = q.i, cx = m.px[i] + (m.px[i + 1] - m.px[i]) * q.t, cz = m.pz[i] + (m.pz[i + 1] - m.pz[i]) * q.t;
    const ox = (x - cx) / (q.d || 1), oz = (z - cz) / (q.d || 1);
    if (q.d < 0.5) continue;
    x = cx + ox * (q.hw + 1.9); z = cz + oz * (q.hw + 1.9);
    if (buildingAt(x, z, 0.8) >= 0) continue;
    const ang = Math.atan2(ox, oz), grp = new THREE.Group(); grp.position.set(x, CURB, z); grp.rotation.y = ang;
    if (shelter || hash2(si, 3) < 0.5) {
      const roofM = new THREE.Mesh(STOP_GEO.roof, MM.canopy); roofM.position.set(0, 2.5, 0.2); grp.add(roofM);
      const back = new THREE.Mesh(STOP_GEO.back, MM.glass); back.position.set(0, 1.3, 0.85); grp.add(back);
      const bench = new THREE.Mesh(STOP_GEO.bench, MM.pole); bench.position.set(0, 0.45, 0.55); grp.add(bench);
      for (const sx of [-1.6, 1.6]) { const p = new THREE.Mesh(STOP_GEO.post, MM.pole); p.position.set(sx, 1.25, 0.85); grp.add(p); }
      const a1 = [x + Math.cos(ang) * 1.7 + Math.sin(ang) * 0.85, z - Math.sin(ang) * 1.7 + Math.cos(ang) * 0.85], a2 = [x - Math.cos(ang) * 1.7 + Math.sin(ang) * 0.85, z + Math.sin(ang) * 1.7 + Math.cos(ang) * 0.85];
      obs.push([a1[0], a1[1], a2[0], a2[1], 'Hit a bus shelter', 0.25]);
    }
    const sign = new THREE.Mesh(STOP_GEO.sign, MM.busSign); sign.position.set(-2.2, 2.4, -0.4); grp.add(sign);
    const pole = new THREE.Mesh(STOP_GEO.post, MM.pole); pole.position.set(-2.2, 1.25, -0.4); grp.add(pole);
    obs.push([x - Math.cos(ang) * 2.2 - Math.sin(ang) * 0.4, z + Math.sin(ang) * 2.2 - Math.cos(ang) * 0.4, 0.12, 'Hit a bus stop sign']);
    g.add(grp);
  }

  // Parked cars along the curb of city streets (they have hitboxes)
  const parked = { sedan: [], hatch: [], suv: [] }, PT = ['sedan', 'hatch', 'suv'];
  for (const i of segs) {
    const e = m.pE[i], cls = m.eCls[e], R = RC[cls];
    if (cls < 2 || cls > 6 || (m.eFlag[e] & (F_BRIDGE | F_TUNNEL | F_ONEWAY)) || !R.park) continue;
    const hw = m.eHW[e], L = m.eLen[e];
    for (const side of [-1, 1]) {
      if (hash2(e, side + 5) < 0.25) continue;                 // some blocks have no parking
      for (let s = Math.ceil(m.pc[i] / 6.6) * 6.6; s < m.pc[i + 1]; s += 6.6) {
        if (s < m.nodeHW[m.eA[e]] + 9 || s > L - m.nodeHW[m.eB[e]] - 9) continue;
        const hh = hash2(e * 7 + side, Math.round(s), 5); if (hh > 0.55) continue;
        const f = (s - m.pc[i]) / (m.pc[i + 1] - m.pc[i] || 1), nx = m.mx[i] + (m.mx[i + 1] - m.mx[i]) * f, nz = m.mz[i] + (m.mz[i + 1] - m.mz[i]) * f;
        const off = hw - (cls <= 4 ? 1.1 : 0.95), x = m.px[i] + (m.px[i + 1] - m.px[i]) * f + nx * off * side, z = m.pz[i] + (m.pz[i + 1] - m.pz[i]) * f + nz * off * side;
        const tx = m.px[i + 1] - m.px[i], tz = m.pz[i + 1] - m.pz[i], tl = Math.hypot(tx, tz) || 1;
        if (hitAt(x, z, 1.2) || obs.some((o) => o.length === 4 && Math.hypot(o[0] - x, o[1] - z) < o[2] + 1.6)) continue;
        if (m.stops.length && (m.tStop.get(t.key) || []).some((si) => Math.hypot(m.stops[si][0] - x, m.stops[si][1] - z) < 12)) continue;
        const type = PT[Math.floor(hash2(e, Math.round(s), 7) * 3)];
        if (TAKEN_PARKED.has(parkedKey(x, z))) continue;          // (taken earlier: it's a real car now, or gone)
        const ob = [x - tx / tl * 1.7, z - tz / tl * 1.7, x + tx / tl * 1.7, z + tz / tl * 1.7, 'Hit a parked car', 0.85];
        parked[type].push([x, z, Math.atan2(tx / tl * side, tz / tl * side), Math.floor(hash2(e, Math.round(s), 9) * C.cars.length), ob]);
        obs.push(ob);
      }
    }
  }
  for (const type of PT) {
    const list = parked[type]; if (!list.length) continue;
    const G_ = carGeo(type), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), col = new THREE.Color();
    // (the painted shell carries its glass and trim as vertex colours: two draws per car type)
    const body = new THREE.InstancedMesh(G_.shell, MM.parkedPaint, list.length), wh = new THREE.InstancedMesh(G_.wheels, carMats.wheel, list.length);
    list.forEach(([x, z, a, ci, ob], k) => {
      q.setFromAxisAngle(Yv, a); m4.compose(p.set(x, roadY(3), z), q, one);
      body.setMatrixAt(k, m4); wh.setMatrixAt(k, m4);
      col.set(C.cars[ci]); body.setColorAt(k, col);
      // on foot you can get into these: drive.js swaps the instance for a real car
      parkedCars.push({ x, z, a, ci, type, body, wh, k, ob, t });
    });
    body.castShadow = true;
    g.add(body, wh); disp.push(body, wh);
  }

  mergeStatic(g, disp);
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
