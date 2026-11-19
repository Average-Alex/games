// Wheelie City — core: utilities, cities, bikes, renderer, shared materials.
// Classic scripts: top-level declarations are shared between the wheelie-city/*.js files.
'use strict';
const $ = (s) => document.querySelector(s);
const TAU = Math.PI * 2, G = 9.81;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = (a) => a - TAU * Math.round(a / TAU);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
function mulberry(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash2 = (x, z, s = 0) => { let h = Math.imul(x | 0, 73856093) ^ Math.imul(z | 0, 19349663) ^ Math.imul(s | 0, 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// ---------------------------------------------------------------- cities (look and feel; the streets come from the map files)
const CITIES = {
  van: {
    name: 'Vancouver', region: 'Vancouver · Burnaby · Richmond · New West · North Shore',
    blurb: 'Rain on glass towers. Real streets from Kits to Metrotown; take Hwy 1 or a bridge to the next city.', swatch: 'linear-gradient(180deg,#56646f,#8a9aa3 60%,#3f5a52)',
    skyTop: '#4d5964', skyMid: '#808f98', fog: '#8d9ba3', fogNear: 60, fogFar: 430, sun: null, night: false, rain: true, wet: true,
    hemi: ['#c9d6dd', '#3d4a44', 0.95], dir: ['#dfe7ec', 0.6], sunDir: [0.3, 0.8, 0.4],
    land: { none: '#6b706c', yard: '#62775a', grass: '#4f7a4b', forest: '#2f5236', sand: '#b8ab8a', paved: '#7a7c7c', water: '#33505e' },
    road: '#34373b', concrete: '#5a5d60', walk: '#8f9496', path: '#9a9488',
    walls: { house: ['#d8d2c4', '#a9b5b8', '#6f7f86', '#c2b39b', '#e4e0d6', '#8d6e5a', '#53626b'], mid: ['#b9c3c6', '#8a959a', '#c8bfae', '#a59a8c', '#d5d3cc'], glass: ['#7fa3a8', '#5f8a96', '#9cb8bd', '#6c8f99', '#8fb0b8', '#4f6f7a'] },
    trees: 'pnw', backdrop: 'mountains', traffic: 26, cars: ['#e8e4dc', '#1f2226', '#9aa1a8', '#3c6e5a', '#2d4f7a', '#c7c9cb', '#6b1f24', '#2b2d30'],
    cop: { body: '#f4f4f2', panel: '#14305e', stripe: '#f2c230', text: 'POLICE' },
    signs: [['SUSHI', '#ff5c8a'], ['COFFEE', '#ffcf5c'], ['RAMEN', '#5ce1ff'], ['PHO', '#7dff8a'], ['DIM SUM', '#ff7a3d']],
  },
  la: {
    name: 'Los Angeles', region: 'Hollywood · Downtown · Beverly Hills · Santa Monica · Venice',
    blurb: 'Golden hour. Palms, stucco and the 101, 10 and 110 freeways.', swatch: 'linear-gradient(180deg,#3b4a8c,#f08a5d 60%,#f6c08a)',
    skyTop: '#33417f', skyMid: '#e9845f', fog: '#f1b07c', fogNear: 90, fogFar: 480, sun: '#ffd7a6', sunDir: [0.25, 0.14, 1], night: false,
    hemi: ['#ffd9b8', '#6a5444', 0.85], dir: ['#ffc58f', 1.05],
    land: { none: '#8c806e', yard: '#7d8658', grass: '#6f8a45', forest: '#55663a', sand: '#c8b893', paved: '#968b7a', water: '#3f7f9e' },
    road: '#3b3a3f', concrete: '#8c8780', walk: '#b9ab93', path: '#b8a886',
    walls: { house: ['#ead8bb', '#dcbb9b', '#f2e4cb', '#c9ab8c', '#e7cfc0', '#f4efe6', '#b98c6e'], mid: ['#ead8bb', '#d9c3a5', '#cfc6bb', '#e3d5c2'], glass: ['#6e8ba3', '#8aa3b5', '#5a7690', '#a0b4c2'] },
    trees: 'palms', streetTrees: true, backdrop: 'hills', traffic: 30, cars: ['#e8e4dc', '#1f2226', '#9aa1a8', '#b3262e', '#2d4f7a', '#d9c7a1', '#f2f2f2', '#3b3f45'],
    cop: { body: '#111317', panel: '#f4f4f2', stripe: '#111317', text: 'POLICE' },
    signs: [['TACOS', '#ff5c8a'], ['MOTEL', '#ffcf5c'], ['DONUTS', '#5ce1ff'], ['LIQUOR', '#ff7a3d'], ['BURGERS', '#ffcf5c']],
  },
  vegas: {
    name: 'Las Vegas', region: 'The Strip · Downtown · Paradise · Chinatown',
    blurb: 'Neon after midnight. Ride the Strip, jump on I-15, hit Fremont St.', swatch: 'linear-gradient(180deg,#0b0820,#3a1450 60%,#ff3d7f)',
    skyTop: '#07061a', skyMid: '#2a1240', fog: '#2b1640', fogNear: 70, fogFar: 460, sun: '#f4eedd', sunDir: [-0.4, 0.35, 1], night: true,
    hemi: ['#6b5aa8', '#2a1a2e', 0.55], dir: ['#b9b4ff', 0.3],
    land: { none: '#4a3f40', yard: '#4b4a3c', grass: '#3c5a3e', forest: '#2f4532', sand: '#6a5a4a', paved: '#4f4848', water: '#1f3250' },
    road: '#26252b', concrete: '#47454c', walk: '#5b5258', path: '#5f5650',
    walls: { house: ['#d9c3a5', '#c8b28f', '#e0d2bd', '#b9a38a'], mid: ['#e0c27a', '#c8c3d6', '#d9b7c9', '#9fa7b6'], glass: ['#7d6aa8', '#c9a14a', '#8a93a8', '#b07a9e', '#5e7fb0'] },
    trees: 'palms', streetTrees: true, backdrop: 'desert', traffic: 30, cars: ['#f2f2f2', '#121214', '#b3262e', '#d6b25e', '#5b2d8a', '#2a6cb3', '#9aa1a8'],
    cop: { body: '#f4f4f2', panel: '#141518', stripe: '#1c5e3a', text: 'POLICE' }, neon: true,
    signs: [['CASINO', '#ff3d7f'], ['WEDDINGS', '#5ce1ff'], ['BUFFET', '#ffcf5c'], ['JACKPOT', '#b06bff'], ['OPEN 24H', '#ff7a3d'], ['SLOTS', '#7dff8a']],
  },
  miami: {
    name: 'Miami', region: 'South Beach · Downtown · Brickell · Little Havana · Wynwood',
    blurb: 'Pastel deco and palms. Cross the MacArthur Causeway, take I-95.', swatch: 'linear-gradient(180deg,#3d9be9,#9fd8ff 60%,#ffd2e1)',
    skyTop: '#3a8fdc', skyMid: '#a8dcff', fog: '#cdeaff', fogNear: 100, fogFar: 500, sun: '#fff6d8', sunDir: [0.5, 0.55, 0.6], night: false,
    hemi: ['#ffffff', '#a99c84', 0.78], dir: ['#fff3dc', 0.85],
    land: { none: '#9d927b', yard: '#7f9a55', grass: '#729a48', forest: '#4c7438', sand: '#cdbf98', paved: '#9b9384', water: '#2f8fb4' },
    road: '#46464b', concrete: '#8a867e', walk: '#c9bfae', path: '#c4b89e',
    walls: { house: ['#ffc7d6', '#b8f0dc', '#d9c8ff', '#fff0b8', '#a8e4f5', '#ffffff'], mid: ['#ffffff', '#ffd9e4', '#c9f2e6', '#fff3c9'], glass: ['#5fb3d0', '#7fc9e0', '#a8d8e8', '#4f9ac0'] },
    trees: 'palms', streetTrees: true, backdrop: 'none', traffic: 26, cars: ['#ffffff', '#ff8fb1', '#38c6d9', '#1f2226', '#f5d36b', '#9aa1a8'],
    cop: { body: '#f4f4f2', panel: '#f4f4f2', stripe: '#1f7a4a', text: 'POLICE' },
    signs: [['HOTEL', '#ff5c8a'], ['CAFE', '#38c6d9'], ['SURF', '#ffb347'], ['CUBANO', '#ffcf5c']],
  },
  nyc: {
    name: 'New York', region: 'Manhattan · Brooklyn · Queens · Jersey City · Hoboken',
    blurb: 'Canyons of steel at dusk. Take the FDR, cross the Williamsburg Bridge.', swatch: 'linear-gradient(180deg,#1f2840,#6f6f86 60%,#ffb36b)',
    skyTop: '#1e263d', skyMid: '#6c6b84', fog: '#7a7787', fogNear: 60, fogFar: 430, sun: '#ffcf96', sunDir: [0, 0.08, 1], night: false, dusk: true,
    hemi: ['#b9b6c9', '#3a3433', 0.8], dir: ['#ffb985', 0.65],
    land: { none: '#5a5856', yard: '#5d6a4c', grass: '#5c7a48', forest: '#3f5a36', sand: '#a89c84', paved: '#64615e', water: '#2f4652' },
    road: '#303034', concrete: '#6a6866', walk: '#8a8682', path: '#8c8478',
    walls: { house: ['#8c5a46', '#a0806a', '#7a4a3a', '#b8a48e', '#6f6a66'], mid: ['#8c7f73', '#6f6a66', '#a39484', '#9a6a52', '#b0a495'], glass: ['#5c6f80', '#6f8090', '#4a5866', '#8a96a0', '#3e4a55'] },
    trees: 'deciduous', backdrop: 'none', traffic: 34, cars: ['#f2c230', '#f2c230', '#f2c230', '#1f2226', '#9aa1a8', '#e8e4dc', '#2d4f7a'], taxi: true,
    cop: { body: '#f4f4f2', panel: '#f4f4f2', stripe: '#1d3d8f', text: 'NYPD' },
    signs: [['DELI', '#ff5c8a'], ['PIZZA', '#ffcf5c'], ['BAGELS', '#5ce1ff'], ['BODEGA', '#7dff8a']],
  },
};

// ---------------------------------------------------------------- bikes
// Physics: peak power (W), dry mass (kg, plus a 75 kg rider), top speed (m/s), traction-limited accel,
// wheelie lift gain, pitch inertia, tyre grip (g). Gas bikes add an engine: stroke, idle/redline rpm, gears.
// Visual: wheel radii, wheelbase, seat height, colours, style. Stats are approximate.
const BIKES = {
  lbx:   { brand: 'Sur-Ron', name: 'Light Bee X', type: 'e', blurb: 'The one everyone has. Light, flickable, easy to lift.',
           power: 6000, mass: 57, vmax: 20.8, traction: 8.2, ka: 2.75, inertia: 1.0, grip: 0.9,
           R: 0.33, Rf: 0.33, L: 1.26, seat: 0.83, knobby: true, color: '#3a3d42', accent: '#d9dde0', frame: '#202226', style: 'surron', motor: { ratio: 9.2, poles: 7, mesh: 11.3, chain: 58 } },
  rtr:   { brand: 'Electro & Co', name: 'ETM RTR', type: 'e', blurb: 'Pit-bike size, Sur-Ron punch. Short and twitchy, pops up instantly.',
           power: 8000, mass: 59, vmax: 20.1, traction: 8.4, ka: 2.95, inertia: 0.85, grip: 0.9,
           R: 0.3, Rf: 0.31, L: 1.16, seat: 0.78, knobby: true, color: '#e9edf0', accent: '#19c3c9', frame: '#1c1d21', style: 'rtr', motor: { ratio: 8.4, poles: 8, mesh: 12.5, chain: 54 } },
  sting: { brand: 'Talaria', name: 'Sting R MX4', type: 'e', blurb: 'More power and range than the Light Bee, a touch heavier.',
           power: 8000, mass: 66, vmax: 23.6, traction: 8.6, ka: 2.7, inertia: 1.05, grip: 0.9,
           R: 0.33, Rf: 0.34, L: 1.28, seat: 0.86, knobby: true, color: '#5d6770', accent: '#ff6a1a', frame: '#1e2024', style: 'talaria', motor: { ratio: 8.8, poles: 6, mesh: 10.1, chain: 56 } },
  ultra: { brand: 'Sur-Ron', name: 'Ultra Bee', type: 'e', blurb: 'Big battery, big torque. Pulls up anywhere, heavier to save.',
           power: 12500, mass: 85, vmax: 25.5, traction: 9.0, ka: 2.65, inertia: 1.2, grip: 0.92,
           R: 0.35, Rf: 0.36, L: 1.38, seat: 0.92, knobby: true, color: '#23262b', accent: '#ffd23a', frame: '#9aa3ab', style: 'surron', motor: { ratio: 8.1, poles: 8, mesh: 9.6, chain: 52 } },
  storm: { brand: 'Sur-Ron', name: 'Storm Bee', type: 'e', blurb: 'Full-size electric enduro. Violent torque, needs a strong lean.',
           power: 22500, mass: 119, vmax: 30.5, traction: 9.6, ka: 2.55, inertia: 1.45, grip: 0.95,
           R: 0.36, Rf: 0.37, L: 1.47, seat: 0.94, knobby: true, color: '#1b1d21', accent: '#38e0a0', frame: '#3a3f46', style: 'surron', motor: { ratio: 7.4, poles: 8, mesh: 9.1, chain: 50 } },
  varg:  { brand: 'Stark', name: 'Varg MX', type: 'e', blurb: '80 hp electric motocrosser. Fastest thing here off the line.',
           power: 60000, mass: 118, vmax: 37, traction: 9.9, ka: 2.45, inertia: 1.5, grip: 0.95,
           R: 0.34, Rf: 0.37, L: 1.48, seat: 0.95, knobby: true, color: '#e8ecee', accent: '#1f8f5a', frame: '#2a2d33', style: 'varg', motor: { ratio: 6.8, poles: 10, mesh: 7.3, chain: 50 } },
  grom:  { brand: 'Honda', name: 'Grom 125', type: 'gas', stroke: 4, blurb: 'Little 125 four-stroke. The classic street wheelie bike.',
           power: 7400, mass: 102, vmax: 25.5, traction: 8.0, ka: 2.8, inertia: 1.05, grip: 1.05,
           R: 0.27, Rf: 0.27, L: 1.2, seat: 0.76, knobby: false, color: '#c8102e', accent: '#f2f2f2', frame: '#1a1b1e', style: 'grom',
           engine: { idle: 1500, redline: 9500, gears: 5, curve: 'four', pipe: 175, muffle: 1100, cyl: 1 } },
  sx125: { brand: 'KTM', name: '125 SX', type: 'gas', stroke: 2, blurb: 'Screaming 125 two-stroke. Dead below the powerband, then it rips.',
           power: 28000, mass: 90, vmax: 31, traction: 8.8, ka: 2.85, inertia: 0.95, grip: 0.9,
           R: 0.33, Rf: 0.36, L: 1.47, seat: 0.95, knobby: true, color: '#ff6a00', accent: '#1e2a5a', frame: '#ff6a00', style: 'mx2',
           engine: { idle: 1800, redline: 12800, gears: 6, curve: 'two', pipe: 300, muffle: 3600, cyl: 1 } },
  yz250: { brand: 'Yamaha', name: 'YZ250', type: 'gas', stroke: 2, blurb: 'The legendary 250 two-stroke. Light, angry, wheelies in third.',
           power: 34000, mass: 103, vmax: 33, traction: 9.2, ka: 2.7, inertia: 1.05, grip: 0.92,
           R: 0.33, Rf: 0.36, L: 1.48, seat: 0.97, knobby: true, color: '#1f3fa8', accent: '#f2f2f2', frame: '#1f3fa8', style: 'mx2',
           engine: { idle: 1600, redline: 10500, gears: 5, curve: 'two', pipe: 235, muffle: 3000, cyl: 1 } },
  crf450:{ brand: 'Honda', name: 'CRF450R', type: 'gas', stroke: 4, blurb: 'Big-bore four-stroke thumper. Torque everywhere, heavy front end.',
           power: 41000, mass: 111, vmax: 36, traction: 9.5, ka: 2.55, inertia: 1.3, grip: 0.95,
           R: 0.33, Rf: 0.36, L: 1.48, seat: 0.96, knobby: true, color: '#d71920', accent: '#f2f2f2', frame: '#c9ccd0', style: 'mx4',
           engine: { idle: 1800, redline: 12000, gears: 5, curve: 'four', pipe: 105, muffle: 1900, cyl: 1 } },
  smc:   { brand: 'KTM', name: '690 SMC R', type: 'gas', stroke: 4, blurb: 'Street supermoto, 74 hp single. Highway speed, sticky slicks.',
           power: 55000, mass: 147, vmax: 50, traction: 9.8, ka: 2.45, inertia: 1.55, grip: 1.12,
           R: 0.31, Rf: 0.31, L: 1.48, seat: 0.92, knobby: false, color: '#ff6a00', accent: '#1b1c20', frame: '#ff6a00', style: 'smc',
           engine: { idle: 1500, redline: 8800, gears: 6, curve: 'four', pipe: 82, muffle: 1500, cyl: 1 } },
};
for (const b of Object.values(BIKES)) {
  const m = b.mass + 75; b.drag = b.power / m / (b.vmax ** 3);
  if (b.engine) {
    // Overall ratios: top gear hits the redline at top speed, first gear ~2.7x taller
    const e = b.engine, wheelRpmTop = b.vmax / (TAU * b.R) * 60, top = e.redline / wheelRpmTop;
    e.ratios = Array.from({ length: e.gears }, (_, g) => top * (2.7 ** ((e.gears - 1 - g) / (e.gears - 1))));
  }
  b.bars = { power: clamp(Math.log(b.power / 4000) / Math.log(16), 0.08, 1), speed: clamp((b.vmax - 18) / 32, 0.08, 1), weight: clamp((b.mass - 50) / 100, 0.05, 1), ease: clamp(1.25 - b.inertia * 0.6 - b.power / 120000, 0.1, 1) };
}

const POVS = [
  ['chase', 'Chase'], ['far', 'Far chase'], ['first', 'Helmet cam'], ['chest', 'Chest mount'],
  ['bars', 'Bar cam (facing you)'], ['side', 'Side tracking'], ['drone', 'Drone'], ['tv', 'Roadside TV'],
];

let cityKey = store.get('wc-city', 'van'); if (!CITIES[cityKey]) cityKey = 'van';
let bikeKey = store.get('wc-bike2', 'lbx'); if (!BIKES[bikeKey]) bikeKey = 'lbx';
let pov = store.get('wc-pov2', 'chase'); if (!POVS.some((p) => p[0] === pov)) pov = 'chase';
let sens = store.get('wc-sens', 1);
let quality = store.get('wc-quality', 'med'); if (!['low', 'med', 'high'].includes(quality)) quality = 'med';
let C = CITIES[cityKey];

// ---------------------------------------------------------------- renderer and stage
const canvas = $('#game'), stage = $('#stage');
let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true }); } catch (e) { renderer = null; }
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#000', 50, 300);
const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.08, 2500);
function applyQuality() {
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'med' ? 1.5 : 1));
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  dirL.castShadow = quality !== 'low';
  const sz = quality === 'high' ? 2048 : 1024;
  if (dirL.shadow.mapSize.x !== sz) { dirL.shadow.mapSize.set(sz, sz); if (dirL.shadow.map) { dirL.shadow.map.dispose(); dirL.shadow.map = null; } }
  scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) m.needsUpdate = true; } });
}
function resize() {
  if (!renderer) return;
  const w = Math.max(1, stage.clientWidth), hgt = Math.max(1, stage.clientHeight);
  renderer.setSize(w, hgt, false); camera.aspect = w / hgt; camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- geometry helpers
function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
const Yv = new THREE.Vector3(0, 1, 0), Xv = new THREE.Vector3(1, 0, 0);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function seg(parent, a, b, r1, r2, mat, n = 10) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, n), mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(Yv, d.normalize());
  parent.add(m); return m;
}
function beam(parent, a, b, w, h, mat) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, h), mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(Yv, d.normalize());
  parent.add(m); return m;
}
function blob(parent, p, r, mat, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
  m.position.copy(p); m.scale.set(sx, sy, sz); parent.add(m); return m;
}
function cube(parent, p, w, h, d, mat, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.copy(p); m.rotation.x = rx; parent.add(m); return m;
}
function axle(parent, p, r, len, mat, n = 16) {
  const g = new THREE.CylinderGeometry(r, r, len, n); g.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.copy(p); parent.add(m); return m;
}
const M = (color, roughness = 0.7, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

// Simple triangle soup builder: positions, normals, optional colours and uvs
class GeoBuf {
  constructor(colors = false, uvs = false) { this.p = []; this.n = []; this.c = colors ? [] : null; this.u = uvs ? [] : null; }
  v(x, y, z, nx, ny, nz, col, u, w) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz);
    if (this.c) this.c.push(col ? col.r : 1, col ? col.g : 1, col ? col.b : 1);
    if (this.u) this.u.push(u || 0, w || 0);
  }
  // flat quad on the ground (y up), corners in order a b c d
  flat(ax, az, bx, bz, cx, cz, dx, dz, y, col, uvScale) {
    const s = uvScale || 0;
    this.v(ax, y, az, 0, 1, 0, col, ax * s, az * s); this.v(cx, y, cz, 0, 1, 0, col, cx * s, cz * s); this.v(bx, y, bz, 0, 1, 0, col, bx * s, bz * s);
    this.v(ax, y, az, 0, 1, 0, col, ax * s, az * s); this.v(dx, y, dz, 0, 1, 0, col, dx * s, dz * s); this.v(cx, y, cz, 0, 1, 0, col, cx * s, cz * s);
  }
  // vertical wall from (x0,z0) to (x1,z1), y0..y1, outward normal (nx,nz); uv u along the wall, v up
  wall(x0, z0, x1, z1, y0, y1, nx, nz, col, u0, u1, v0, v1) {
    this.v(x0, y0, z0, nx, 0, nz, col, u0, v0); this.v(x1, y0, z1, nx, 0, nz, col, u1, v0); this.v(x1, y1, z1, nx, 0, nz, col, u1, v1);
    this.v(x0, y0, z0, nx, 0, nz, col, u0, v0); this.v(x1, y1, z1, nx, 0, nz, col, u1, v1); this.v(x0, y1, z0, nx, 0, nz, col, u0, v1);
  }
  get empty() { return this.p.length === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.u) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- sky, lights, backdrop, rain
const sky = (() => {
  const g = new THREE.SphereGeometry(1800, 32, 16);
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10; scene.add(m); return m;
})();
const sun = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshBasicMaterial({ color: '#fff', fog: false, depthWrite: false }));
sun.renderOrder = -9; scene.add(sun);
const hemi = new THREE.HemisphereLight('#fff', '#444', 1); scene.add(hemi);
const dirL = new THREE.DirectionalLight('#fff', 1); scene.add(dirL); scene.add(dirL.target);
dirL.shadow.camera.left = -45; dirL.shadow.camera.right = 45; dirL.shadow.camera.top = 45; dirL.shadow.camera.bottom = -45;
dirL.shadow.camera.near = 1; dirL.shadow.camera.far = 260; dirL.shadow.bias = -0.0006; dirL.shadow.normalBias = 0.03;
const headlight = new THREE.SpotLight('#fff2d6', 0, 70, 0.5, 0.5, 1.4); scene.add(headlight); scene.add(headlight.target);
// Far filler under everything (beyond the streamed tiles)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#777' }));
ground.position.y = -0.25; scene.add(ground);
const backdrop = new THREE.Group(); scene.add(backdrop);
let rain = null;

function setupSky() {
  const fog = new THREE.Color(C.fog), topC = new THREE.Color(C.skyTop), mid = new THREE.Color(C.skyMid);
  const pos = sky.geometry.attributes.position, col = sky.geometry.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 1800;
    const c = y > 0.2 ? mid.clone().lerp(topC, Math.min(1, (y - 0.2) / 0.6)) : y > 0 ? fog.clone().lerp(mid, y / 0.2) : fog.clone();
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  scene.fog.color.copy(fog); scene.fog.near = C.fogNear; scene.fog.far = C.fogFar * (quality === 'low' ? 0.75 : quality === 'high' ? 1.25 : 1);
  if (renderer) renderer.setClearColor(fog);
  sun.visible = !!C.sun; if (C.sun) sun.material.color.set(C.sun);
  hemi.color.set(C.hemi[0]); hemi.groundColor.set(C.hemi[1]); hemi.intensity = C.hemi[2];
  dirL.color.set(C.dir[0]); dirL.intensity = C.dir[1];
  headlight.intensity = C.night || C.dusk ? 2.2 : C.rain ? 0.8 : 0;
  ground.material.color.set(C.land.none);
  buildBackdrop(); setupRain();
}
function buildBackdrop() {
  while (backdrop.children.length) { const m = backdrop.children.pop(); m.geometry.dispose(); m.material.dispose(); }
  const fog = new THREE.Color(C.fog);
  const haze = (c, t) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).lerp(fog, t), fog: false });
  const r = mulberry(99);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.renderOrder = -8; backdrop.add(m); return m; };
  if (C.backdrop === 'hills' || C.backdrop === 'desert' || C.backdrop === 'mountains') {
    const base = C.backdrop === 'hills' ? '#7d6a5c' : C.backdrop === 'desert' ? '#3a2b3e' : '#4a5a63';
    for (let i = 0; i < 44; i++) {
      // Vancouver: the North Shore mountains sit to the north; elsewhere hills all round
      let a = (i / 44) * TAU;
      if (C.backdrop === 'mountains') a = -1.2 + (i / 44) * 2.4;
      const dist = 1350 + r() * 250;
      const h = C.backdrop === 'mountains' ? 260 + r() * 330 : 90 + r() * 140, w = 260 + r() * 300;
      const g = new THREE.ConeGeometry(w, h, 5 + Math.floor(r() * 3), 1); g.translate(0, h / 2, 0);
      add(g, haze(base, 0.35 + r() * 0.2), Math.sin(a) * dist, -20, Math.cos(a) * dist);
      if (C.backdrop === 'mountains') {
        const cap = new THREE.ConeGeometry(w * 0.3, h * 0.3, 6, 1); cap.translate(0, h - h * 0.15, 0);
        add(cap, haze('#eef3f5', 0.3), Math.sin(a) * dist, -19, Math.cos(a) * dist);
      }
    }
  }
}
function setupRain() {
  if (rain) { scene.remove(rain); rain.geometry.dispose(); rain.material.dispose(); rain = null; }
  if (!C.rain) return;
  const N = 1100, pos = new Float32Array(N * 6), r = mulberry(5);
  for (let i = 0; i < N; i++) {
    const x = (r() - 0.5) * 60, y = r() * 30, z = (r() - 0.5) * 60;
    pos.set([x, y, z, x + 0.05, y + 0.8, z - 0.15], i * 6);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c9d6de', transparent: true, opacity: 0.38 }));
  rain.frustumCulled = false;
  scene.add(rain);
}

// ---------------------------------------------------------------- canvas textures
function noiseTexture(base, amount, size = 256, seed = 1, speckle = 0) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), img = g.createImageData(size, size), r = mulberry(seed);
  const c = new THREE.Color(base);
  for (let i = 0; i < size * size; i++) {
    let k = 1 + (r() - 0.5) * amount;
    if (speckle && r() < speckle) k *= 1.35;
    img.data[i * 4] = clamp(c.r * 255 * k, 0, 255); img.data[i * 4 + 1] = clamp(c.g * 255 * k, 0, 255); img.data[i * 4 + 2] = clamp(c.b * 255 * k, 0, 255); img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // a few cracks and patches
  g.globalAlpha = 0.18; g.strokeStyle = '#000';
  for (let i = 0; i < 10; i++) { g.lineWidth = 0.5 + r(); g.beginPath(); let x = r() * size, y = r() * size; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
  g.globalAlpha = 0.08; g.fillStyle = '#000';
  for (let i = 0; i < 6; i++) g.fillRect(r() * size, r() * size, 20 + r() * 60, 14 + r() * 40);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
// Facade textures: an 8 x 8 grid of window bays, white walls (tinted by vertex colour), and a lit-window mask for night
function facadeTextures(style, city, seed) {
  const r = mulberry(seed), N = 8, S = 32;
  const wall = document.createElement('canvas'); wall.width = wall.height = N * S;
  const lit = document.createElement('canvas'); lit.width = lit.height = N * S;
  const gw = wall.getContext('2d'), gl = lit.getContext('2d');
  gw.fillStyle = '#ffffff'; gw.fillRect(0, 0, N * S, N * S);
  gl.fillStyle = '#000000'; gl.fillRect(0, 0, N * S, N * S);
  const win = style === 'glass' ? [1, 2, 30, 28] : style === 'mid' ? [6, 7, 20, 18] : [9, 9, 14, 15];
  const glassC = style === 'glass' ? '#33505c' : '#2b3340';
  const litShare = city.night ? 0.5 : city.dusk ? 0.35 : 0.0;
  if (style === 'house') { gw.fillStyle = 'rgba(0,0,0,.05)'; for (let y = 0; y < N * S; y += 4) gw.fillRect(0, y, N * S, 1); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const [wx, wy, ww, wh] = win;
    if (style === 'house' && r() < 0.35) continue;
    gw.fillStyle = glassC; gw.fillRect(x * S + wx, y * S + wy, ww, wh);
    if (style === 'glass') { gw.fillStyle = 'rgba(255,255,255,.16)'; gw.fillRect(x * S + wx, y * S + wy, ww, 3); gw.fillStyle = 'rgba(0,0,0,.25)'; gw.fillRect(x * S + wx + ww / 2, y * S + wy, 1, wh); }
    else { gw.fillStyle = 'rgba(255,255,255,.12)'; gw.fillRect(x * S + wx, y * S + wy, ww, 2); gw.fillStyle = 'rgba(0,0,0,.18)'; gw.fillRect(x * S + wx - 1, y * S + wy + wh, ww + 2, 2); }
    if (r() < litShare) { const b = 140 + Math.floor(r() * 115); gl.fillStyle = `rgb(${b},${Math.floor(b * 0.85)},${Math.floor(b * 0.55)})`; gl.fillRect(x * S + wx, y * S + wy, ww, wh); }
  }
  const tw = new THREE.CanvasTexture(wall), tl = new THREE.CanvasTexture(lit);
  for (const t of [tw, tl]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return [tw, tl];
}
function signTexture(text, color) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
  const g = cv.getContext('2d');
  g.fillStyle = '#0d0b12'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = color; g.lineWidth = 6; g.shadowColor = color; g.shadowBlur = 18; g.strokeRect(12, 12, 488, 136);
  g.font = 'italic 900 88px "Archivo", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffffff'; g.shadowBlur = 26; g.fillText(text, 256, 84, 470); g.fillStyle = color; g.shadowBlur = 10; g.fillText(text, 256, 84, 470);
  return new THREE.CanvasTexture(cv);
}
function streetSignTexture(text) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const g = cv.getContext('2d');
  g.fillStyle = '#17643a'; g.fillRect(0, 0, 512, 96);
  g.strokeStyle = '#f4f4f0'; g.lineWidth = 5; g.strokeRect(6, 6, 500, 84);
  g.fillStyle = '#f4f4f0'; g.font = '700 50px "Archivo", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 52, 480);
  return new THREE.CanvasTexture(cv);
}
function decalTexture(text, color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = color; g.font = 'italic 900 46px "Archivo", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34, 240);
  return new THREE.CanvasTexture(cv);
}
