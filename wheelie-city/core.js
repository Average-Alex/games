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

// ---------------------------------------------------------------- colour management
// Every colour in this game is written as an sRGB hex. Lighting maths needs linear light, and the screen wants sRGB
// again: so colours are converted to linear as they're set, canvas textures are marked sRGB, and the renderer
// outputs sRGB. (three r128 has no built-in colour management.) Reading a colour back (getStyle, getHex) gives sRGB.
(() => {
  const P = THREE.Color.prototype; if (P.__wcSRGB) return; P.__wcSRGB = true;
  let depth = 0;
  const wrapIn = (fn) => function (...a) { depth++; try { fn.apply(this, a); } finally { depth--; } if (depth === 0) this.convertSRGBToLinear(); return this; };
  const tmpC = new THREE.Color();
  const wrapOut = (fn) => function (...a) { const r = this.r, g = this.g, b = this.b; tmpC.r = r; tmpC.g = g; tmpC.b = b; tmpC.convertLinearToSRGB(); return fn.apply(tmpC, a); };
  P.setHex = wrapIn(P.setHex); P.setStyle = wrapIn(P.setStyle); P.setHSL = wrapIn(P.setHSL);
  P.getHex = wrapOut(P.getHex); P.getHexString = wrapOut(P.getHexString); P.getStyle = wrapOut(P.getStyle); P.getHSL = wrapOut(P.getHSL);
  const CT = THREE.CanvasTexture;
  THREE.CanvasTexture = function (...a) { const t = new CT(...a); t.encoding = THREE.sRGBEncoding; return t; };
  THREE.CanvasTexture.prototype = CT.prototype;
})();

// ---------------------------------------------------------------- cities (look and feel; the streets come from the map files)
const CITIES = {
  van: {
    name: 'Vancouver', region: 'Vancouver · Burnaby · Richmond · New West · North Shore',
    blurb: 'Rain on glass towers. Real streets from Kits to Metrotown; take Hwy 1 or a bridge to the next city.', swatch: 'linear-gradient(180deg,#56646f,#8a9aa3 60%,#3f5a52)',
    skyTop: '#3f72ad', skyMid: '#a6c6dd', fog: '#bccdd8', fogNear: 70, fogFar: 520, sun: '#fff2d8', night: false,
    hemi: ['#dfe8ee', '#3d4a44', 0.95], dir: ['#fff0dc', 0.95], sunDir: [0.35, 0.45, 0.6],
    wx: { clear: 0.3, cloudy: 0.3, rain: 0.32, fog: 0.08 }, brick: 0.2,
    land: { none: '#6e716c', yard: '#5f6e4f', grass: '#55703f', forest: '#344a30', sand: '#b8ab8a', paved: '#7a7c7c', water: '#33505e' },
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
    wx: { clear: 0.72, cloudy: 0.18, fog: 0.1 }, brick: 0.08,
    hemi: ['#ffd9b8', '#6a5444', 0.85], dir: ['#ffc58f', 1.05],
    land: { none: '#786e60', yard: '#6c7050', grass: '#62743e', forest: '#4e5836', sand: '#b0a07e', paved: '#807868', water: '#3f7f9e' },
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
    wx: { clear: 0.9, cloudy: 0.06, rain: 0.04 }, brick: 0.03,
    hemi: ['#8a72c8', '#5a3a40', 1.05], dir: ['#c9c0ff', 0.32],
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
    wx: { clear: 0.55, cloudy: 0.2, rain: 0.25 },
    hemi: ['#ffffff', '#a99c84', 0.78], dir: ['#fff3dc', 0.85],
    land: { none: '#857c6a', yard: '#6e7e4a', grass: '#62803f', forest: '#466034', sand: '#b8aa86', paved: '#858072', water: '#2f8fb4' },
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
    wx: { clear: 0.45, cloudy: 0.3, rain: 0.2, fog: 0.05 }, brick: 0.55,
    hemi: ['#b9b6c9', '#3a3433', 0.8], dir: ['#ffb985', 0.65],
    land: { none: '#5a5856', yard: '#5b6649', grass: '#566e42', forest: '#3d5234', sand: '#a89c84', paved: '#64615e', water: '#2f4652' },
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
  scooter: { brand: 'Segway', name: 'Ninebot Max G2', type: 'e', blurb: 'Stand-up e-scooter. Grab one off the sidewalk and scoot.',
           power: 900, mass: 24, vmax: 9.7, traction: 4.5, ka: 1.6, inertia: 0.8, grip: 0.8,
           R: 0.14, Rf: 0.14, L: 0.86, seat: 0.88, knobby: false, color: '#2a2c30', accent: '#37e0cf', frame: '#1a1b1e', style: 'scooter', motor: { ratio: 1, poles: 15, mesh: 1, chain: 1 } },
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
  // Street motorcycles: full fairings or naked roadsters, road tyres, heavier to lift but much faster
  ninja250: { brand: 'Kawasaki', name: 'Ninja 250R', type: 'gas', street: true, stroke: 4, blurb: 'The first sport bike everyone learns on. Revvy little twin, light and easy.',
           power: 24600, mass: 152, vmax: 47, traction: 9.4, ka: 2.55, inertia: 1.55, grip: 1.12,
           R: 0.3, Rf: 0.29, L: 1.4, seat: 0.78, knobby: false, color: '#5fbf2a', accent: '#14151a', frame: '#1a1b1e', style: 'sport',
           engine: { idle: 1300, redline: 13000, gears: 6, curve: 'four', pipe: 140, muffle: 1700, cyl: 2 } },
  ninja400: { brand: 'Kawasaki', name: 'Ninja 400', type: 'gas', street: true, stroke: 4, blurb: 'The 250 grown up. More torque, sharper fairing, still easy to ride.',
           power: 33400, mass: 160, vmax: 53, traction: 9.6, ka: 2.5, inertia: 1.6, grip: 1.14,
           R: 0.3, Rf: 0.29, L: 1.37, seat: 0.79, knobby: false, color: '#62c21f', accent: '#1c1d21', frame: '#1c1d21', style: 'sport',
           engine: { idle: 1300, redline: 12500, gears: 6, curve: 'four', pipe: 132, muffle: 1800, cyl: 2 } },
  r3:    { brand: 'Yamaha', name: 'YZF-R3', type: 'gas', street: true, stroke: 4, blurb: 'Small twin with race-bike looks. Loves to be held at the top of the rev range.',
           power: 30900, mass: 160, vmax: 50, traction: 9.5, ka: 2.5, inertia: 1.6, grip: 1.14,
           R: 0.3, Rf: 0.29, L: 1.38, seat: 0.78, knobby: false, color: '#1f3fa8', accent: '#f2f2f2', frame: '#1a1b1e', style: 'sport',
           engine: { idle: 1300, redline: 12500, gears: 6, curve: 'four', pipe: 128, muffle: 1900, cyl: 2 } },
  duke390: { brand: 'KTM', name: '390 Duke', type: 'gas', street: true, stroke: 4, blurb: 'Light naked single. Punchy down low, the easiest street bike here to loop.',
           power: 32000, mass: 150, vmax: 46, traction: 9.5, ka: 2.65, inertia: 1.45, grip: 1.12,
           R: 0.3, Rf: 0.29, L: 1.36, seat: 0.82, knobby: false, color: '#ff6a00', accent: '#1b1c20', frame: '#ff6a00', style: 'naked',
           engine: { idle: 1400, redline: 10500, gears: 6, curve: 'four', pipe: 90, muffle: 1600, cyl: 1 } },
  z900:  { brand: 'Kawasaki', name: 'Z900', type: 'gas', street: true, stroke: 4, blurb: '125 hp inline four, no fairing. Power wheelies in first and second.',
           power: 92000, mass: 210, vmax: 66, traction: 10.0, ka: 2.4, inertia: 1.85, grip: 1.16,
           R: 0.31, Rf: 0.3, L: 1.45, seat: 0.8, knobby: false, color: '#2b2e33', accent: '#5fbf2a', frame: '#5fbf2a', style: 'naked',
           engine: { idle: 1100, redline: 11000, gears: 6, curve: 'four', pipe: 70, muffle: 2400, cyl: 4 } },
  cbr600: { brand: 'Honda', name: 'CBR600RR', type: 'gas', street: true, stroke: 4, blurb: 'Supersport screamer. 15,000 rpm, flat out past 250 km/h.',
           power: 88000, mass: 194, vmax: 72, traction: 10.0, ka: 2.35, inertia: 1.9, grip: 1.18,
           R: 0.31, Rf: 0.3, L: 1.38, seat: 0.82, knobby: false, color: '#c8102e', accent: '#f2f2f2', frame: '#1f3fa8', style: 'sport',
           engine: { idle: 1300, redline: 15000, gears: 6, curve: 'four', pipe: 62, muffle: 2800, cyl: 4 } },
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

// Rider and paint customisation ('bike' / 'stock' = match the bike's own colours)
const RIDER_OPTS = {
  helmet: ['bike', '#f2f2f0', '#14151a', '#c8102e', '#1f5fbf', '#ffd200', '#ff6a00', '#2a9d4a', '#ff3d7f', '#8a5cf5'],
  jersey: ['#f0e8da', '#14151a', '#c8102e', '#1f3fa8', '#ff6a00', '#2a9d4a', '#ffd200', '#ff3d7f', '#5d6770', '#37e0cf'],
  pants: ['#262b33', '#14151a', '#3a4a6a', '#5a4a3a', '#7a7466', '#c8c8c8', '#1f3fa8', '#8a1c2a'],
  gloves: ['bike', '#14151a', '#f2f2f0', '#c8102e', '#ffd200', '#ff6a00', '#37e0cf'],
  skin: ['#f1c9a5', '#e0ac85', '#c99375', '#9a6440', '#6e4428'],
  bike: ['stock', '#f2f2f0', '#14151a', '#c8102e', '#1f3fa8', '#ff6a00', '#2a9d4a', '#ffd200', '#ff3d7f', '#8a5cf5', '#5d6770'],
};
const RIDER_LABEL = { helmet: 'Helmet', jersey: 'Jersey', pants: 'Pants', gloves: 'Gloves', skin: 'Skin', bike: 'Bike paint' };
const riderLook = Object.assign({ helmet: 'bike', jersey: '#f0e8da', pants: '#262b33', gloves: 'bike', skin: '#c99375', bike: 'stock' }, store.get('wc-rider', {}));
let cityKey = store.get('wc-city', 'van'); if (!CITIES[cityKey]) cityKey = 'van';
let bikeKey = store.get('wc-bike2', 'lbx'); if (!BIKES[bikeKey]) bikeKey = 'lbx';
let pov = store.get('wc-pov2', 'chase'); if (!POVS.some((p) => p[0] === pov)) pov = 'chase';
let sens = store.get('wc-sens', 1);
// Default graphics level from the GPU: Ultra only on a real graphics card; laptop chips (Intel Iris / UHD, Chromebooks,
// phones) get High or Medium, which they can hold at a playable frame rate. Your own choice is remembered.
function autoQuality() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return 'low';
    const d = gl.getExtension('WEBGL_debug_renderer_info'), r = d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : '';
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    if (/swiftshader|llvmpipe|software|microsoft basic/i.test(r)) return 'low';
    if (/mali|adreno|powervr|uhd|hd graphics|apple gpu/i.test(r) || /CrOS/.test(navigator.userAgent)) return 'med';
    if (/intel|iris|radeon\(tm\) graphics|vega \d+ graphics/i.test(r)) return 'high';
    return 'ultra';
  } catch { return 'high'; }
}
let quality = store.get('wc-quality3', null); if (!['low', 'med', 'high', 'ultra'].includes(quality)) quality = autoQuality();
let C = CITIES[cityKey];

// ---------------------------------------------------------------- renderer and stage
const canvas = $('#game'), stage = $('#stage');
let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true }); } catch (e) { renderer = null; }
if (renderer) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82; renderer.outputEncoding = THREE.sRGBEncoding; renderer.physicallyCorrectLights = false; }
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#000', 0.0003);
const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.08, 60000);
// Graphics: Ultra by default. A governor (play.js) then trades render resolution for frame rate to hold ~30 fps.
const GOV = { pr: 1, ema: 16, t: 0, dropRadius: 0 };
function maxPixelRatio() { return Math.min(devicePixelRatio || 1, quality === 'ultra' ? 2 : quality === 'high' ? 2 : quality === 'med' ? 1.5 : 1); }
function applyQuality() {
  if (!renderer) return;
  GOV.pr = Math.min(maxPixelRatio(), quality === 'ultra' ? 1.25 : maxPixelRatio()); GOV.dropRadius = 0;
  renderer.setPixelRatio(GOV.pr);
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  dirL.castShadow = quality !== 'low';
  const sz = quality === 'ultra' ? 4096 : quality === 'high' ? 2048 : 1024, ext = quality === 'ultra' ? 70 : 45;
  dirL.shadow.camera.left = -ext; dirL.shadow.camera.right = ext; dirL.shadow.camera.top = ext; dirL.shadow.camera.bottom = -ext; dirL.shadow.camera.updateProjectionMatrix();
  if (dirL.shadow.mapSize.x !== sz) { dirL.shadow.mapSize.set(sz, sz); if (dirL.shadow.map) { dirL.shadow.map.dispose(); dirL.shadow.map = null; } }
  scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) m.needsUpdate = true; } });
  setupPost();
}
function resize() {
  if (!renderer) return;
  const w = Math.max(1, stage.clientWidth), hgt = Math.max(1, stage.clientHeight);
  renderer.setSize(w, hgt, false); camera.aspect = w / hgt; camera.updateProjectionMatrix();
  sizePost();
}
// ---- post-processing on Ultra: bloom on lights, neon and sun, a film-style grade with vignette, FXAA edges
// The grade is a cinematic one: a filmic S-curve for deep shadows and bright highlights, cool shadows and warm
// highlights (split toning), vibrance that lifts dull colours more than bright ones, a light sharpen for crisp detail,
// a touch of colour fringing toward the corners like a real lens, fine film grain, and a vignette.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, vignette: { value: 0.34 }, saturation: { value: 1.12 }, contrast: { value: 1.08 }, warmth: { value: 0.02 },
    shadowTint: { value: new THREE.Color('#1e3a52') }, lightTint: { value: new THREE.Color('#ffd7a0') }, split: { value: 0.12 },
    // (no film grain or sharpening to speak of: on a lowered render resolution both read as a grainy picture)
    texel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, sharpen: { value: 0.08 }, fringe: { value: 0.0 }, grain: { value: 0.0 }, time: { value: 0 },
    lift: { value: 0.0 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform float vignette, saturation, contrast, warmth, split, sharpen, fringe, grain, time, lift;',
    'uniform vec3 shadowTint, lightTint; uniform vec2 texel; varying vec2 vUv;',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    'vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
    'void main() {',
    '  vec2 d = vUv - 0.5; float r2 = dot(d, d);',
    '  vec2 off = d * fringe * r2 * 8.0;',
    '  vec4 c = texture2D(tDiffuse, vUv);',
    '  c.r = texture2D(tDiffuse, vUv + off).r; c.b = texture2D(tDiffuse, vUv - off).b;',
    '  vec3 blur = (texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb + texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb) * 0.25;',
    '  c.rgb = toSRGB(max(c.rgb, 0.0)); blur = toSRGB(max(blur, 0.0));',
    '  c.rgb += (c.rgb - blur) * sharpen;',
    '  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));',
    '  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), sat = mx - mn;',
    '  c.rgb = mix(vec3(l), c.rgb, saturation + (1.0 - sat) * 0.18);',
    '  vec3 s = clamp(c.rgb, 0.0, 1.0); s = s * s * (3.0 - 2.0 * s);',
    '  c.rgb = mix(c.rgb, s, clamp(contrast - 1.0, 0.0, 1.0) * 2.4);',
    '  c.rgb = mix(c.rgb, c.rgb * shadowTint * 2.2, split * (1.0 - smoothstep(0.0, 0.45, l)));',
    '  c.rgb = mix(c.rgb, c.rgb * lightTint * 1.15, split * smoothstep(0.5, 1.0, l));',
    '  c.rgb += vec3(warmth, warmth * 0.3, -warmth) * (1.0 - l);',
    '  c.rgb *= 1.0 - vignette * smoothstep(0.25, 0.85, length(d * vec2(1.25, 1.0)));',
    '  c.rgb = lift * shadowTint * 2.5 + c.rgb * (1.0 - lift);',          // smoggy lifted blacks, tinted
    '  c.rgb += (hash(vUv * 1000.0 + time) - 0.5) * grain;',
    '  gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);',
    '}'].join('\n'),
};
// Per-city grade: cool and moody in Vancouver, golden in LA, neon in Vegas, bright pastel in Miami, steely at dusk in NYC
const GRADE = {
  van: { shadowTint: '#1d3a50', lightTint: '#ffe2bf', split: 0.14, saturation: 1.1, contrast: 1.1, warmth: 0.0 },
  la: { shadowTint: '#2a2a55', lightTint: '#ffc98a', split: 0.18, saturation: 1.16, contrast: 1.1, warmth: 0.03 },
  vegas: { shadowTint: '#1e1a4a', lightTint: '#ffb0d8', split: 0.16, saturation: 1.22, contrast: 1.12, warmth: 0.0 },
  miami: { shadowTint: '#17465a', lightTint: '#ffe0b0', split: 0.14, saturation: 1.2, contrast: 1.09, warmth: 0.02 },
  nyc: { shadowTint: '#1d2a44', lightTint: '#ffc48f', split: 0.16, saturation: 1.08, contrast: 1.12, warmth: 0.02 },
};
let gradePass = null;
let composer = null, bloomPass = null, fxaaPass = null;
function setupPost() {
  composer = null;
  if (!renderer || quality !== 'ultra' || !THREE.EffectComposer || !THREE.UnrealBloomPass) return;
  try {
    // An offscreen target gets only 16-bit depth by default, far too coarse for a view that reaches 60 km (walls
    // flicker through each other): give it a 24-bit depth texture. Colour in half float, so the linear image keeps
    // its dark gradients (no banding in the sky) and its bright highlights for the bloom.
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2()), gl2 = renderer.capabilities.isWebGL2;
    const rt = new THREE.WebGLRenderTarget(Math.max(1, sz.x), Math.max(1, sz.y), { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
      type: gl2 || renderer.extensions.has('OES_texture_half_float') ? THREE.HalfFloatType : THREE.UnsignedByteType });
    if (gl2 || renderer.extensions.has('WEBGL_depth_texture')) { rt.depthTexture = new THREE.DepthTexture(Math.max(1, sz.x), Math.max(1, sz.y)); rt.depthTexture.type = THREE.UnsignedIntType; }
    composer = new THREE.EffectComposer(renderer, rt);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.55, 0.84);
    composer.addPass(bloomPass);
    gradePass = new THREE.ShaderPass(GradeShader);
    composer.addPass(gradePass);
    applyGrade();
    fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
    composer.addPass(fxaaPass);
    sizePost();
  } catch (e) { console.warn('post-processing off', e); composer = null; }
}
function sizePost() {
  if (!composer) return;
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight), pr = renderer.getPixelRatio();
  composer.setPixelRatio(pr); composer.setSize(w, h);
  bloomPass.resolution.set(w * pr / 2, h * pr / 2);
  if (gradePass) { gradePass.uniforms.texel.value.set(1 / (w * pr), 1 / (h * pr)); gradePass.uniforms.sharpen.value = pr < 0.95 ? 0 : 0.08; }
  fxaaPass.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
}
function applyGrade() {
  if (!gradePass) return;
  const g = GRADE[cityKey] || GRADE.van, u = gradePass.uniforms;
  u.shadowTint.value.set(g.shadowTint).convertLinearToSRGB(); u.lightTint.value.set(g.lightTint).convertLinearToSRGB();
  u.split.value = g.split; u.saturation.value = g.saturation; u.contrast.value = g.contrast; u.warmth.value = g.warmth;
}
function renderScene() {
  if (gradePass) {
    const u = gradePass.uniforms; u.time.value = (u.time.value + 0.37) % 100;
    // grey weather flattens the light: less split toning and contrast under cloud, rain and fog
    const g = GRADE[cityKey] || GRADE.van, dull = Math.max(WX.cloud * 0.6, WX.rain, WX.fog);
    u.split.value = g.split * (1 - 0.5 * dull); u.contrast.value = 1 + (g.contrast - 1) * (1 - 0.4 * dull);
  }
  if (composer) { bloomPass.strength = C.night ? 0.9 : C.dusk ? 0.6 : 0.4 + 0.15 * WX.wet; composer.render(); }
  else renderer.render(scene, camera);
}
// Hold the frame rate: lower the render resolution when frames run long, raise it when there's headroom,
// and as a last resort pull in the draw distance. Target ~30 fps on Ultra, ~50 fps otherwise.
function governFrame(ms, active) {
  if (!renderer) return;
  GOV.ema += (ms - GOV.ema) * 0.06;
  GOV.t += ms / 1000;
  if (!active || GOV.t < 1.2) return;
  GOV.t = 0;
  const target = quality === 'ultra' ? 33.3 : 20, maxPr = maxPixelRatio();
  let pr = GOV.pr;
  if (GOV.ema > target * 1.12) {
    // (not below 0.65: lower than that the picture turns to grain; pull in the draw distance instead)
    if (pr > 0.65) pr = Math.max(0.65, pr * 0.85);
    else if (GOV.dropRadius < 2 && GOV.ema > target * 1.35) { GOV.dropRadius++; }
  } else if (GOV.ema < target * 0.75) {
    if (GOV.dropRadius > 0 && GOV.ema < target * 0.6) GOV.dropRadius--;
    else if (pr < maxPr) pr = Math.min(maxPr, pr * 1.1);
  }
  if (Math.abs(pr - GOV.pr) > 0.01) { GOV.pr = pr; renderer.setPixelRatio(pr); resize(); }
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
// A box with rounded edges and corners (moulded plastic, a padded seat, a cast frame), cached by size.
// The box's corners are pushed out onto spheres of radius r, with the normals of the rounded surface.
const rboxCache = new Map();
function roundedBox(w, h, d, r) {
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const key = `${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)},${r.toFixed(3)}`;
  if (rboxCache.has(key)) return rboxCache.get(key);
  const S = 4, g = new THREE.BoxGeometry(w, h, d, S, S, S), p = g.attributes.position, n = g.attributes.normal;
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -ix, ix), clamp(v.y, -iy, iy), clamp(v.z, -iz, iz));
    const off = v.clone().sub(c);
    if (off.lengthSq() < 1e-12) continue;
    off.normalize(); p.setXYZ(i, c.x + off.x * r, c.y + off.y * r, c.z + off.z * r); n.setXYZ(i, off.x, off.y, off.z);
  }
  rboxCache.set(key, g);
  return g;
}
function rcube(parent, p, w, h, d, mat, rx = 0) {
  const m = new THREE.Mesh(roundedBox(w, h, d, Math.min(w, h, d) * 0.35), mat);
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
  // (optional colB: a different colour along the bottom edge, for grime / ambient occlusion at street level)
  wall(x0, z0, x1, z1, y0, y1, nx, nz, col, u0, u1, v0, v1, colB) {
    const cb = colB || col;
    this.v(x0, y0, z0, nx, 0, nz, cb, u0, v0); this.v(x1, y0, z1, nx, 0, nz, cb, u1, v0); this.v(x1, y1, z1, nx, 0, nz, col, u1, v1);
    this.v(x0, y0, z0, nx, 0, nz, cb, u0, v0); this.v(x1, y1, z1, nx, 0, nz, col, u1, v1); this.v(x0, y1, z0, nx, 0, nz, col, u0, v1);
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

// ---------------------------------------------------------------- sky, lights, haze, rain
// The sky is a real photographed sky (Poly Haven HDRIs, tone mapped to JPEG by tools/fetch_assets.py): the city's own
// sky blended with overcast, storm and mist skies as the weather turns. Light comes from the photo's own sun, turned to
// the city's sun bearing so streets keep the light they were designed with.
const SKY = { img: {}, meta: null, horizon: {}, rot: 0, ready: false };
const SUN = new THREE.Vector3(0.45, 0.55, 0.7).normalize();
const SKY_FOR = { van: 'clear_van', la: 'sunset_la', vegas: 'night_vegas', miami: 'clear_miami', nyc: 'dusk_nyc' };
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    tBase: { value: null }, tCloud: { value: null }, tStorm: { value: null }, tMist: { value: null },
    wCloud: { value: 0 }, wStorm: { value: 0 }, wMist: { value: 0 }, rotBase: { value: 0 }, dimWx: { value: 1 }, gain: { value: 1 }, has: { value: 0 },
    top: { value: new THREE.Color('#3f72ad') }, mid: { value: new THREE.Color('#a6c6dd') }, fogc: { value: new THREE.Color('#bccdd8') },
    sunDir: { value: SUN }, sunCol: { value: new THREE.Color('#fff2d8') }, sunK: { value: 1 }, haze: { value: 0 },
  },
  vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform sampler2D tBase, tCloud, tStorm, tMist; uniform float wCloud, wStorm, wMist, rotBase, dimWx, gain, has, sunK, haze;',
    'uniform vec3 top, mid, fogc, sunDir, sunCol; varying vec3 vDir;',
    'vec3 eq(sampler2D t, vec3 d, float rot) {',
    '  float a = atan(d.z, d.x) + rot;',
    '  vec2 uv = vec2(fract(a * 0.15915494 + 0.5), asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);',
    '  vec3 c = texture2D(t, uv).rgb; return c * c * (c * 0.3 + 0.7);',          // ~sRGB to linear
    '}',
    'void main() {',
    '  vec3 d = normalize(vDir), dd = normalize(vec3(d.x, max(d.y, 0.012), d.z)), c;',
    '  if (has > 0.5) {',
    '    c = min(eq(tBase, dd, rotBase), vec3(0.82)) * gain;',
    '    if (wCloud > 0.002) c = mix(c, min(eq(tCloud, dd, rotBase), vec3(0.82)) * dimWx, wCloud);',
    '    if (wStorm > 0.002) c = mix(c, eq(tStorm, dd, rotBase + 1.3) * dimWx, wStorm);',
    '    if (wMist > 0.002) c = mix(c, eq(tMist, dd, rotBase) * dimWx, wMist);',
    '  } else {',
    '    float y = max(d.y, 0.0); c = y > 0.2 ? mix(mid, top, pow(min(1.0, (y - 0.2) / 0.6), 0.8)) : mix(fogc, mid, y / 0.2);',
    '  }',
    '  float hz = pow(1.0 - clamp(d.y, 0.0, 1.0), 5.0);',
    '  c = mix(c, fogc, clamp(haze * hz, 0.0, 1.0));',
    '  if (d.y < 0.0) c = mix(c, fogc, clamp(-d.y * 6.0, 0.0, 1.0));',
    '  float s = max(dot(d, sunDir), 0.0);',
    '  c += sunCol * sunK * (pow(s, 2400.0) * 3.0 + pow(s, 120.0) * 0.06);',
    '  gl_FragColor = linearToOutputTexel(vec4(c, 1.0));',
    '}'].join('\n'),
  side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), skyMat);
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
// Reflections: a blurred environment map rendered from the current sky, used by every physically based material
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(sky.geometry, skyMat));
const pmrem = renderer ? new THREE.PMREMGenerator(renderer) : null;
let envRT = null;
function updateEnv() {
  if (!pmrem || quality === 'low') { scene.environment = null; return; }
  const rt = pmrem.fromScene(envScene, 0.02, 1, 4000);
  if (envRT) envRT.dispose();
  envRT = rt; scene.environment = rt.texture;
}
// (the photographed skies have their own clouds; kept as an empty group so camera-following code still works)
const clouds = { grp: new THREE.Group(), mats: [] };
const sun = new THREE.Object3D();
const hemi = new THREE.HemisphereLight('#fff', '#444', 1); scene.add(hemi);
const dirL = new THREE.DirectionalLight('#fff', 1); scene.add(dirL); scene.add(dirL.target);
dirL.shadow.camera.left = -45; dirL.shadow.camera.right = 45; dirL.shadow.camera.top = 45; dirL.shadow.camera.bottom = -45;
dirL.shadow.camera.near = 1; dirL.shadow.camera.far = 320; dirL.shadow.bias = -0.0005; dirL.shadow.normalBias = 0.04;
const headlight = new THREE.SpotLight('#fff2d6', 0, 70, 0.5, 0.5, 1.4); scene.add(headlight); scene.add(headlight.target);
// Far filler under everything: real satellite imagery of the city (world.js); a plain colour until it loads
const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000, 20, 20).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#777' }));
ground.position.y = -0.25; scene.add(ground);
const backdrop = new THREE.Group(); scene.add(backdrop);
let rain = null;
// How far you can see (FogExp2 density) in clear air, per city: Vancouver's air is clean, LA's hazy
const SKY_GAIN = { van: 1, la: 0.92, vegas: 0.13, miami: 1, nyc: 0.5 };
const VIS = { van: 0.00016, la: 0.00028, vegas: 0.0002, miami: 0.00017, nyc: 0.00024 };

// load the city's skies (and the shared weather skies) as images; average each one's horizon for the haze colour
function loadSkies(key) {
  const names = [SKY_FOR[key], 'cloudy', 'storm', 'mist'];
  const meta = SKY.meta ? Promise.resolve(SKY.meta) : fetch('wheelie-city/assets/sky/sky.json').then((r) => r.json()).catch(() => ({})).then((m) => (SKY.meta = m));
  // (sky.json first: it carries the horizon colours, so the images needn't be read back)
  return meta.then(() => Promise.all(names.map((n) => SKY.img[n] ? Promise.resolve(SKY.img[n]) : new Promise((res) => {
    new THREE.TextureLoader().load(`wheelie-city/assets/sky/${n}.jpg`, (t) => {
      t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = THREE.RepeatWrapping;
      // horizon colour: average a band just above the horizon all the way round (worked out offline when it can be)
      const hz = SKY.meta && SKY.meta[n] && SKY.meta[n].horizon;
      if (hz) { SKY.horizon[n] = new THREE.Color().setRGB(hz[0], hz[1], hz[2]).convertSRGBToLinear(); SKY.img[n] = t; res(t); return; }
      try {
        const im = t.image, cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
        const g = cv.getContext('2d'); g.drawImage(im, 0, 0, 64, 32);
        const d = g.getImageData(0, 13, 64, 3).data; let r = 0, gg = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        const n2 = d.length / 4; SKY.horizon[n] = new THREE.Color().setRGB(r / n2 / 255, gg / n2 / 255, b / n2 / 255).convertSRGBToLinear();
      } catch { SKY.horizon[n] = new THREE.Color('#9aa2a8'); }
      SKY.img[n] = t; res(t);
    }, undefined, () => res(null));
  }))));
}
function setupSun() {
  // turn the photographed sky so its sun sits on the city's own sun bearing; light comes from there
  const m = SKY.meta && SKY.meta[SKY_FOR[cityKey]], sd = C.sunDir || [0, 0.3, 1];
  const azC = Math.atan2(sd[2], sd[0]);
  if (m && m.sun) {
    const [sx, sy, sz] = m.sun, azS = Math.atan2(sz, sx), el = Math.asin(clamp(sy, -1, 1));
    SKY.rot = azS - azC;
    SUN.set(Math.cos(azC) * Math.cos(el), Math.sin(el), Math.sin(azC) * Math.cos(el)).normalize();
  } else { SKY.rot = 0; SUN.set(sd[0], sd[1], sd[2]).normalize(); }
  // night: the "sun" in the Vegas sky is the moon, high up: keep the moonlight but at the city's bearing
  if (C.night) SUN.set(Math.cos(azC) * 0.55, 0.8, Math.sin(azC) * 0.55).normalize();
}

// ---------------------------------------------------------------- weather: clear, cloudy, rain, fog, blending over ~25 s
const WX = { mode: store.get('wc-weather', 'auto'), from: 'clear', to: 'clear', t: 1, timer: 200, cloud: 0, rain: 0, fog: 0, wet: 0, skyT: 0 };
const WX_LOOK = { clear: { cloud: 0, rain: 0, fog: 0 }, cloudy: { cloud: 0.8, rain: 0, fog: 0.1 }, rain: { cloud: 0.95, rain: 1, fog: 0.25 }, fog: { cloud: 0.5, rain: 0, fog: 1 } };
const WX_NAME = { clear: 'Skies clearing', cloudy: 'Clouding over', rain: 'Rain moving in', fog: 'Fog rolling in' };
function pickWeather() {
  const w = C.wx || { clear: 1 }, tot = Object.values(w).reduce((a, b) => a + b, 0);
  let r = Math.random() * tot;
  for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) return k; }
  return 'clear';
}
function setupWeather() {
  const k = WX.mode === 'auto' ? pickWeather() : WX.mode;
  Object.assign(WX, { from: k, to: k, t: 1, timer: 40 + Math.random() * 30, wet: k === 'rain' ? 1 : 0 });
  applyWeather(0, true);
}
function updateWeather(dt, announce) {
  if (WX.mode === 'auto') {
    WX.timer -= dt;
    if (WX.timer <= 0 && WX.t >= 1) {
      let n = pickWeather();
      for (let k = 0; k < 8 && n === WX.to; k++) n = pickWeather();          // always actually change
      if (n === WX.to) n = WX.to === 'clear' ? 'cloudy' : 'clear';
      WX.from = WX.to; WX.to = n; WX.t = 0; if (announce) announce(WX_NAME[n]);
      WX.timer = 70 + Math.random() * 60;
    }
  } else if (WX.to !== WX.mode && WX.t >= 1) { WX.from = WX.to; WX.to = WX.mode; WX.t = 0; }
  if (WX.t < 1) WX.t = Math.min(1, WX.t + dt / 25);
  applyWeather(dt, false);
}
const wxC = { top: new THREE.Color(), mid: new THREE.Color(), fog: new THREE.Color(), tmp: new THREE.Color(), hz: new THREE.Color() };
function applyWeather(dt, force) {
  const a = WX_LOOK[WX.from], b = WX_LOOK[WX.to], k = smooth(0, 1, WX.t);
  WX.cloud = lerp(a.cloud, b.cloud, k); WX.rain = lerp(a.rain, b.rain, k); WX.fog = lerp(a.fog, b.fog, k);
  WX.wet = force ? WX.rain : WX.rain > 0.3 ? Math.min(1, WX.wet + dt / 20) : Math.max(0, WX.wet - dt / 90);
  WX.skyT -= dt; WX.envT = (WX.envT || 0) - dt;
  if (!force && WX.skyT > 0) return;
  WX.skyT = 0.2;
  const refreshEnv = force || (WX.t < 1 && WX.envT <= 0);
  if (refreshEnv) WX.envT = 3;
  const dark = C.night ? 0.09 : C.dusk ? 0.5 : 1;
  const grey = (hex) => wxC.tmp.set(hex).multiplyScalar(dark);
  // weights of the weather skies: overcast with cloud, the storm sky with rain, mist with fog
  const wStorm = clamp(WX.rain, 0, 1), wMist = clamp(WX.fog * 1.1, 0, 1), wCloud = clamp(WX.cloud * 1.15 - wStorm * 0.3, 0, 1);
  const u = skyMat.uniforms, base = SKY_FOR[cityKey];
  const have = SKY.img[base] && SKY.img.cloudy && SKY.img.storm && SKY.img.mist;
  u.has.value = have ? 1 : 0;
  if (have) { u.tBase.value = SKY.img[base]; u.tCloud.value = SKY.img.cloudy; u.tStorm.value = SKY.img.storm; u.tMist.value = SKY.img.mist; }
  u.wCloud.value = wCloud; u.wStorm.value = wStorm; u.wMist.value = wMist; u.rotBase.value = SKY.rot; u.dimWx.value = dark;
  // the photos were all exposed for daylight: bring the night and dusk skies down to their real brightness
  u.gain.value = SKY_GAIN[cityKey] || 1;
  // haze colour: the horizon of whichever skies are showing
  if (have && SKY.horizon[base]) {
    wxC.hz.copy(SKY.horizon[base]).multiplyScalar(u.gain.value);
    wxC.hz.lerp(wxC.tmp.copy(SKY.horizon.cloudy).multiplyScalar(dark), wCloud).lerp(wxC.tmp.copy(SKY.horizon.storm).multiplyScalar(dark), wStorm).lerp(wxC.tmp.copy(SKY.horizon.mist).multiplyScalar(dark), wMist);
    wxC.fog.copy(wxC.hz);
  } else {
    wxC.fog.set(C.fog).lerp(grey('#a8afb4'), WX.cloud * 0.6).lerp(grey('#87939a'), WX.rain * 0.7).lerp(grey('#c6cacd'), WX.fog * 0.85);
  }
  wxC.top.set(C.skyTop).lerp(grey('#6c747c'), WX.cloud * 0.85).lerp(grey('#4b545c'), WX.rain * 0.7);
  wxC.mid.set(C.skyMid).lerp(grey('#9aa2a8'), WX.cloud * 0.8).lerp(grey('#78838a'), WX.rain * 0.7);
  u.top.value.copy(wxC.top); u.mid.value.copy(wxC.mid); u.fogc.value.copy(wxC.fog);
  u.haze.value = clamp(WX.rain * 0.5 + WX.fog * 0.9, 0, 1);
  u.sunDir.value.copy(SUN); u.sunCol.value.set(C.sun || '#ffffff');
  u.sunK.value = C.sun && !C.night ? clamp(1 - WX.cloud * 1.2 - WX.fog * 1.4, 0, 1) : 0;
  if (refreshEnv) updateEnv();
  scene.fog.color.copy(wxC.fog);
  const vis = (VIS[cityKey] || 0.0002) * (quality === 'low' ? 1.8 : quality === 'med' ? 1.3 : 1);
  scene.fog.density = vis * (1 + 0.5 * WX.cloud) * (1 + 3.5 * WX.rain) * (1 + 22 * WX.fog * WX.fog);
  if (renderer) renderer.setClearColor(wxC.fog);
  const sunK = 1 - 0.65 * WX.cloud - 0.25 * WX.fog;
  hemi.intensity = C.hemi[2] * 0.7 * (1 - 0.1 * WX.cloud);
  dirL.intensity = C.dir[1] * 1.15 * sunK;
  headlight.intensity = C.night || C.dusk ? 2.2 : 1.1 * Math.max(WX.rain, WX.fog, WX.cloud * 0.4);
  if (rain) { rain.visible = WX.rain > 0.03; rain.material.opacity = 0.42 * WX.rain; }
  if (typeof MM !== 'undefined' && MM.road) applyWetness();
  if (typeof updateTerrainLook === 'function') updateTerrainLook();
}
function setupSky() {
  applyGrade();
  setupSun();
  hemi.color.set(C.hemi[0]); hemi.groundColor.set(C.hemi[1]);
  dirL.color.set(C.dir[0]);
  ground.material.color.set(C.land.none);
  setupRain(); setupWeather();
}
function buildBackdrop() { /* replaced by the real terrain in world.js */ }
function setupRain() {
  if (rain) { scene.remove(rain); rain.geometry.dispose(); rain.material.dispose(); rain = null; }
  const N = 1400, pos = new Float32Array(N * 6), r = mulberry(5);
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
// Sidewalk slabs: square pavers with dark joints and a little staining
function paverTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d'), r = mulberry(31);
  g.fillStyle = '#c9c6c0'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) {
    const k = 0.93 + r() * 0.12; g.fillStyle = `rgb(${Math.round(201 * k)},${Math.round(198 * k)},${Math.round(192 * k)})`; g.fillRect(x + 1, y + 1, 62, 62);
  }
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 22; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(70,70,70,.55)'; for (let k = 0; k <= 256; k += 64) { g.fillRect(k - 1, 0, 2, 256); g.fillRect(0, k - 1, 256, 2); }
  g.globalAlpha = 0.08; g.fillStyle = '#000'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(r() * 256, r() * 256, 6 + r() * 18, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
// Fine ground detail: multiplies the blurry landcover colours so grass and dirt look like grass and dirt up close
const detailTex = (() => {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), img = g.createImageData(S, S), r = mulberry(55);
  // two octaves of value noise: R = fine grain, G = big patches
  const grid = (n) => { const a = []; for (let i = 0; i < n * n; i++) a.push(r()); return (x, y) => { const fx = x * n / S, fy = y * n / S, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, at = (i, j) => a[((j % n + n) % n) * n + ((i % n + n) % n)]; const s = (t) => t * t * (3 - 2 * t); return lerp(lerp(at(x0, y0), at(x0 + 1, y0), s(tx)), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), s(tx)), s(ty)); }; };
  const n1 = grid(64), n2 = grid(16), n3 = grid(6);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = (y * S + x) * 4, fine = n1(x, y) * 0.6 + r() * 0.4;
    img.data[o] = fine * 255; img.data[o + 1] = (n2(x, y) * 0.5 + n3(x, y) * 0.5) * 255; img.data[o + 2] = 128; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
let GRASS_AVG = null;
function addGroundDetail(mat) {
  // green ground (parks, lawns, forest floor) gets the photographed grass, normalised to its average colour so the
  // landcover colour still decides the shade; everything else gets fine noise
  const grass = typeof TEX !== 'undefined' && TEX.grass_c;
  if (grass && !GRASS_AVG) GRASS_AVG = texAverage(grass);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: detailTex };
    sh.uniforms.grassMap = { value: grass || detailTex }; sh.uniforms.grassAvg = { value: GRASS_AVG || new THREE.Color(0.5, 0.5, 0.5) }; sh.uniforms.hasGrass = { value: grass ? 1 : 0 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vDetUV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDetUV = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D detailMap, grassMap; uniform vec3 grassAvg; uniform float hasGrass;\nvarying vec2 vDetUV;')
      .replace('#include <map_fragment>', [
        '#include <map_fragment>',
        'float dFine = texture2D(detailMap, vDetUV * 0.45).r, dBig = texture2D(detailMap, vDetUV * 0.012).g;',
        'vec3 noiseCol = diffuseColor.rgb * (0.88 + 0.24 * dFine) * (0.85 + 0.3 * dBig);',
        'vec3 gt = texture2D(grassMap, vDetUV / 3.0).rgb; gt = gt * gt * (gt * 0.3 + 0.7);',
        'vec3 grassCol = diffuseColor.rgb * gt / max(grassAvg, vec3(0.01)) * (0.85 + 0.3 * dBig);',
        'float green = hasGrass * smoothstep(0.0, 0.03, diffuseColor.g - max(diffuseColor.r, diffuseColor.b) * 0.9);',
        'diffuseColor.rgb = mix(noiseCol, grassCol, green);'].join('\n'));
  };
  mat.customProgramCacheKey = () => 'ground-detail';
  return mat;
}
// Facade textures: an 8 x 8 grid of window bays, white walls (tinted by vertex colour), and a lit-window mask for night
function facadeTextures(style, city, seed) {
  if (style === 'shop') return shopTextures(city, seed);
  const r = mulberry(seed), N = 8, S = 32;
  const wall = document.createElement('canvas'); wall.width = wall.height = N * S;
  const lit = document.createElement('canvas'); lit.width = lit.height = N * S;
  const gw = wall.getContext('2d'), gl = lit.getContext('2d');
  gw.fillStyle = '#ffffff'; gw.fillRect(0, 0, N * S, N * S);
  gl.fillStyle = '#000000'; gl.fillRect(0, 0, N * S, N * S);
  if (style === 'brick') {
    // brick courses, then tall sash windows with lintels
    for (let y = 0; y < N * S; y += 4) { gw.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`; gw.fillRect(0, y, N * S, 1); for (let x = (y / 4) % 2 ? 0 : 4; x < N * S; x += 8) gw.fillRect(x, y, 1, 4); }
    for (let i = 0; i < 900; i++) { gw.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.08})`; gw.fillRect(r() * N * S, r() * N * S, 7, 3); }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const wx = x * S + 9, wy = y * S + 6;
      gw.fillStyle = '#e8e2d6'; gw.fillRect(wx - 2, wy - 3, 18, 3); gw.fillRect(wx - 2, wy + 20, 18, 2);
      gw.fillStyle = '#2a2f38'; gw.fillRect(wx, wy, 14, 20);
      gw.fillStyle = '#e8e2d6'; gw.fillRect(wx, wy + 9, 14, 1); gw.fillRect(wx + 7, wy, 1, 20);
      if (r() < (city.night ? 0.45 : city.dusk ? 0.3 : 0)) { gl.fillStyle = '#e8c890'; gl.fillRect(wx, wy, 14, 20); }
    }
  } else if (style === 'industrial') {
    // corrugated cladding, a band of high windows, a roll-up door every few bays
    for (let x = 0; x < N * S; x += 4) { gw.fillStyle = 'rgba(0,0,0,.14)'; gw.fillRect(x, 0, 1, N * S); gw.fillStyle = 'rgba(255,255,255,.12)'; gw.fillRect(x + 2, 0, 1, N * S); }
    for (let y = 0; y < N; y += 2) for (let x = 0; x < N; x++) { gw.fillStyle = '#39424c'; gw.fillRect(x * S + 2, y * S + 4, S - 4, 7); }
    for (let x = 0; x < N; x += 3) { gw.fillStyle = 'rgba(0,0,0,.28)'; gw.fillRect(x * S + 4, N * S - 30, S + 10, 30); gw.fillStyle = 'rgba(0,0,0,.18)'; for (let k = 0; k < 30; k += 3) gw.fillRect(x * S + 4, N * S - 30 + k, S + 10, 1); }
  } else if (style === 'stone') {
    // ashlar blocks and tall arched windows
    for (let y = 0; y < N * S; y += 8) { gw.fillStyle = 'rgba(0,0,0,.07)'; gw.fillRect(0, y, N * S, 1); for (let x = (y / 8) % 2 ? 0 : 12; x < N * S; x += 24) gw.fillRect(x, y, 1, 8); }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const wx = x * S + 10, wy = y * S + 5;
      gw.fillStyle = '#2b3038'; gw.fillRect(wx, wy + 5, 12, 21); gw.beginPath(); gw.arc(wx + 6, wy + 5, 6, Math.PI, 0); gw.fill();
      gw.fillStyle = 'rgba(0,0,0,.15)'; gw.fillRect(wx - 3, wy + 26, 18, 2);
      if (r() < (city.night ? 0.4 : city.dusk ? 0.25 : 0)) { gl.fillStyle = '#f0d090'; gl.fillRect(wx, wy + 2, 12, 24); }
    }
  }
  if (style === 'brick' || style === 'industrial' || style === 'stone') {
    const tw = new THREE.CanvasTexture(wall), tl = new THREE.CanvasTexture(lit);
    for (const t of [tw, tl]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
    return [tw, tl];
  }
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
// Ground-floor shopfronts: one bay = big glass panes, a door, a sign band and an awning edge. Tinted per building.
function shopTextures(city, seed) {
  const r = mulberry(seed), W = 512, H = 128, bays = 4, bw = W / bays;
  const wall = document.createElement('canvas'); wall.width = W; wall.height = H;
  const lit = document.createElement('canvas'); lit.width = W; lit.height = H;
  const g = wall.getContext('2d'), gl = lit.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, W, H);
  for (let b = 0; b < bays; b++) {
    const x = b * bw;
    // sign band and awning stripe (top of the texture is the top of the ground floor)
    g.fillStyle = '#ffffff'; g.fillRect(x, 0, bw, 26);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, 26, bw, 3);
    for (let k = 0; k < bw; k += 12) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + k, 0, 6, 10); }
    // glass
    g.fillStyle = '#20262e'; g.fillRect(x + 6, 32, bw - 12, H - 40);
    g.fillStyle = 'rgba(160,190,210,.18)'; g.beginPath(); g.moveTo(x + 6, 32); g.lineTo(x + 40, 32); g.lineTo(x + 6, 80); g.fill();
    // mullions, door
    g.fillStyle = '#d9d9d9'; g.fillRect(x + bw / 2 - 2, 32, 3, H - 40);
    const dx = x + (r() < 0.5 ? 14 : bw - 44);
    g.fillStyle = '#3a2e26'; g.fillRect(dx, 40, 30, H - 48);
    g.fillStyle = '#c8c8c8'; g.fillRect(x, H - 8, bw, 8);
    // shop goods suggested by a few coloured blocks behind the glass
    for (let k = 0; k < 5; k++) { g.fillStyle = `hsl(${Math.floor(r() * 360)},45%,45%)`; g.fillRect(x + 12 + r() * (bw - 40), 70 + r() * 30, 8 + r() * 14, 10 + r() * 16); }
    gl.fillStyle = city.night || city.dusk ? '#ffe2a8' : '#000'; gl.fillRect(x + 6, 32, bw - 12, H - 40);
    gl.fillStyle = city.night || city.dusk ? '#ffffff' : '#000'; gl.fillRect(x, 0, bw, 26);
  }
  const tw = new THREE.CanvasTexture(wall), tl = new THREE.CanvasTexture(lit);
  for (const t of [tw, tl]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return [tw, tl];
}
// Floating name tag for landmarks and stations
function labelTexture(text, sub, color) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  g.font = '900 54px "Archivo", "Arial Black", sans-serif';
  const w = Math.min(500, Math.max(g.measureText(text).width, 120) + 40);
  g.fillStyle = 'rgba(12,13,19,.78)'; g.beginPath(); g.roundRect ? g.roundRect((512 - w) / 2, 8, w, sub ? 108 : 76, 14) : g.rect((512 - w) / 2, 8, w, sub ? 108 : 76); g.fill();
  g.fillStyle = color || '#ff3d7f'; g.fillRect((512 - w) / 2, 8, 8, sub ? 108 : 76);
  g.fillStyle = '#f3efe7'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 46, 460);
  if (sub) { g.font = '700 26px "Archivo", sans-serif'; g.fillStyle = '#c9c4ba'; g.fillText(sub.toUpperCase(), 256, 92, 460); }
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4;
  return t;
}
function shopSignTexture(text, bg) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, bg); grd.addColorStop(1, new THREE.Color(bg).multiplyScalar(0.7).getStyle());
  g.fillStyle = grd; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.strokeRect(3, 3, 250, 58);
  let size = 34; g.font = `800 ${size}px "Archivo", "Arial", sans-serif`;
  while (g.measureText(text).width > 236 && size > 14) { size -= 2; g.font = `800 ${size}px "Archivo", "Arial", sans-serif`; }
  g.fillStyle = '#fbf7ee'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 34, 240);
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4;
  return t;
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
