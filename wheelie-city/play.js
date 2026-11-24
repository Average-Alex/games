// Wheelie City — gameplay: menus, riding physics, crashes, police, cameras, HUD, main loop.
'use strict';

// ---------------------------------------------------------------- menu UI
const bikeCat = (bk) => bk.type !== 'gas' ? 'e' : bk.street ? 'street' : 'gas';
let bikeTab = bikeCat(BIKES[bikeKey]);
function buildCards() {
  const cc = $('#cityCards'); cc.innerHTML = '';
  for (const [k, c] of Object.entries(CITIES)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'card'; b.setAttribute('aria-pressed', String(k === cityKey));
    b.innerHTML = `<div class="sw" style="background:${c.swatch}"></div><div class="nm">${c.name}</div><div class="br2">${c.region}</div><div class="sub">${c.blurb}</div>`;
    b.addEventListener('click', () => { if (k === cityKey && mapReady) return; cityKey = k; store.set('wc-city', k); buildCards(); loadCity(k); });
    cc.appendChild(b);
  }
  const bc = $('#bikeCards'); bc.innerHTML = '';
  $('#tabE').setAttribute('aria-pressed', String(bikeTab === 'e'));
  $('#tabG').setAttribute('aria-pressed', String(bikeTab === 'gas'));
  $('#tabS').setAttribute('aria-pressed', String(bikeTab === 'street'));
  for (const [k, bk] of Object.entries(BIKES)) {
    if (bikeCat(bk) !== bikeTab) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'card'; b.setAttribute('aria-pressed', String(k === bikeKey));
    const bar = (lbl, v) => `<div class="stat">${lbl}<span><i style="width:${Math.round(v * 100)}%"></i></span></div>`;
    const spec = `${Math.round(bk.power / 1000 * 1.341)} hp · ${Math.round(bk.vmax * 3.6)} km/h · ${bk.mass} kg${bk.type === 'gas' ? ` · ${bk.stroke}-stroke` : ''}`;
    b.innerHTML = `<div class="br2">${bk.brand}</div><div class="nm">${bk.name}</div><div class="sub">${bk.blurb}</div><div class="sub">${spec}</div><div class="stats">${bar('Power', bk.bars.power)}${bar('Top speed', bk.bars.speed)}${bar('Weight', bk.bars.weight)}${bar('Easy lift', bk.bars.ease)}</div>`;
    b.addEventListener('click', () => { bikeKey = k; store.set('wc-bike2', k); buildCards(); buildBike(); sfx.setBike(); if (MAP) placeRig(0); });
    bc.appendChild(b);
  }
}
function buildRiderOpts() {
  const box = $('#riderOpts'); box.innerHTML = '';
  for (const [k, opts] of Object.entries(RIDER_OPTS)) {
    const row = document.createElement('div'); row.className = 'opt-row';
    row.innerHTML = `<span>${RIDER_LABEL[k]}</span>`;
    const sws = document.createElement('div'); sws.className = 'sws'; sws.setAttribute('role', 'group'); sws.setAttribute('aria-label', RIDER_LABEL[k]);
    for (const c of opts) {
      const b = document.createElement('button'); b.type = 'button';
      const stock = c === 'bike' || c === 'stock';
      if (stock) { b.className = 'stock'; b.title = 'Match the bike'; b.setAttribute('aria-label', `${RIDER_LABEL[k]}: match the bike`); }
      else { b.style.background = c; b.setAttribute('aria-label', `${RIDER_LABEL[k]} ${c}`); }
      b.setAttribute('aria-pressed', String(riderLook[k] === c));
      b.addEventListener('click', () => { riderLook[k] = c; store.set('wc-rider', riderLook); buildRiderOpts(); buildBike(); if (MAP) placeRig(0); });
      sws.appendChild(b);
    }
    row.appendChild(sws); box.appendChild(row);
  }
}
buildRiderOpts();
$('#tabE').addEventListener('click', () => { bikeTab = 'e'; buildCards(); });
$('#tabG').addEventListener('click', () => { bikeTab = 'gas'; buildCards(); });
$('#tabS').addEventListener('click', () => { bikeTab = 'street'; buildCards(); });
const povSel = $('#povSel');
for (const [k, label] of POVS) { const o = document.createElement('option'); o.value = k; o.textContent = label; povSel.appendChild(o); }
function setPov(p) {
  pov = p; store.set('wc-pov2', p); povSel.value = p;
  $('#povLabel').textContent = `V · ${POVS.find((x) => x[0] === p)[1]}`;
  S.tv = null; camSnap = true;
}
povSel.addEventListener('change', () => setPov(povSel.value));
$('#sens').value = sens;
$('#sens').addEventListener('input', (e) => { sens = parseFloat(e.target.value); store.set('wc-sens', sens); });
const qualSel = $('#quality'); qualSel.value = quality;
qualSel.addEventListener('change', () => { quality = qualSel.value; store.set('wc-quality3', quality); applyQuality(); setupSky(); if (MAP) { clearTiles(); setupMapMaterials(); setupWorld(); applyWeather(0, true); updateTiles(S.x, S.z, true); } });
const wxSel = $('#weatherSel'); wxSel.value = WX.mode;
wxSel.addEventListener('change', () => { WX.mode = wxSel.value; store.set('wc-weather', WX.mode); if (WX.mode !== 'auto') { WX.from = WX.to = WX.mode; WX.t = 1; WX.wet = WX.mode === 'rain' ? 1 : 0; applyWeather(0, true); } });
const respSel = $('#respawnMode'); respSel.value = store.get('wc-respawn', 'crash');
respSel.addEventListener('change', () => store.set('wc-respawn', respSel.value));
for (const [id, mode] of [['#clickDest', 'dest'], ['#clickSpawn', 'spawn']]) $(id).addEventListener('click', () => {
  NAV.clickMode = mode; $('#clickDest').setAttribute('aria-pressed', String(mode === 'dest')); $('#clickSpawn').setAttribute('aria-pressed', String(mode === 'spawn'));
  $('#bmHint').textContent = mode === 'spawn' ? 'Click where you want to start and respawn' : 'Click to set a destination · scroll to zoom · drag to pan';
});
const sizeSel = $('#size');
sizeSel.value = String(store.get('wc-size', 1280)); if (!sizeSel.value) sizeSel.value = '1280';
function applySize() { stage.style.setProperty('--stage-w', `${sizeSel.value}px`); resize(); }
sizeSel.addEventListener('change', () => { store.set('wc-size', +sizeSel.value); applySize(); });

// ---------------------------------------------------------------- city loading
let mapReady = false, loadingKey = null;
const mapStatus = (t, bad) => { const el = $('#mapStatus'); el.textContent = t; el.style.color = bad ? 'var(--danger)' : ''; };
async function loadCity(key) {
  loadingKey = key; mapReady = false; $('#go').disabled = true;
  mapStatus(`Loading the ${CITIES[key].name} map…`);
  clearTiles();
  clearRoute(); NAV.entries = null; NAV.view = null;
  for (const u of units) deactivate(u);
  if (MAP && MAP.key !== key) MAP = null;
  try {
    // streets, photo textures, skies and the terrain round the city all load together
    const [m] = await Promise.all([loadMap(key, mapStatus), loadTextures(), loadSkies(key), loadTerrain(key)]);
    if (loadingKey !== key) return;
    C = CITIES[key];
    setupCity();
    // the first frame compiles every shader (several seconds on laptop graphics, and the page can't take clicks
    // meanwhile): keep Ride off and say so until it has drawn
    mapStatus('Preparing graphics…');
    const tf = performance.now();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    LOAD_MS.firstFrame = Math.round(performance.now() - tf);
    if (loadingKey !== key) return;
    mapReady = true; $('#go').disabled = false;
    mapStatus(`${C.name}: ${m.E.toLocaleString()} street segments · ${m.B.toLocaleString()} buildings · ${m.N.toLocaleString()} junctions`);
  } catch (e) {
    console.error(e);
    if (loadingKey === key) mapStatus(e.message || String(e), true);
  }
}
const LOAD_MS = {};      // how long each setup step took (for finding load-time stalls)
function setupCity() {
  const step = (name, f) => { const t = performance.now(); f(); LOAD_MS[name] = Math.round(performance.now() - t); };
  step('sky', setupSky);
  step('materials', setupMapMaterials);
  step('world', setupWorld);
  step('weather', () => applyWeather(0, true));
  step('units', buildUnitPools);
  step('peds', buildPeds);
  step('trains', buildTrains);
  endTransit();
  cityMapCv = null;
  step('reset', resetWorld);
}
// Your chosen spawn point for this city (set from the city map), or the city's default
function spawnPoint() {
  const sp = store.get(`wc-spawn-${cityKey}`, null);
  return sp && Number.isFinite(sp[0]) ? sp : MAP.meta.spawn;
}

// ---------------------------------------------------------------- state
const S = { x: 0, z: 0, psi: 0, v: 0, y: 0, theta: 0, rpm: 0 };
let state = 'menu', bails = 3, banked = 0, longest = 0, topSpeed = 0, nearMisses = 0, maxStarsRun = 0;
let W = { active: false };
let heat = 0, unseenT = 0, chaseMax = 0, mapOpen = false;
const stars = () => Math.min(5, Math.floor(heat));

const PHI0 = 0.45, LOOP = 1.95, SWEET = [1.35, 1.75];
const TRICKS = [
  { key: 'nohand', code: 'Digit1', name: 'No-hander', rate: 240, wobble: 0.9, hands: true },
  { key: 'knee', code: 'Digit2', name: 'Knee knocker', rate: 170, wobble: 0.5 },
  { key: 'stand', code: 'Digit3', name: 'Seat stander', rate: 270, wobble: 0.8 },
  { key: 'high', code: 'Digit4', name: 'High chair', rate: 330, wobble: 1.0 },
  { key: 'nofoot', code: 'Digit5', name: 'No-footer', rate: 210, wobble: 0.6 },
];
const freshTricks = () => Object.fromEntries(TRICKS.map((t) => [t.key, { on: false, cur: 0, rel: -9 }]));
const freshVis = () => Object.fromEntries(TRICKS.map((t) => [t.key, 0]));

function resetRider(x, z, psi, v) {
  if (rig && rig.ragdoll) restoreRider();
  Object.assign(S, {
    x, z, psi, v, y: 0, theta: 0, omega: 0, thr: 0, lean: 0, leanIn: 0, steer: 0, steerMouse: 0, popCd: 0,
    crashed: false, crashT: 0, crashReason: '', cpsi: psi, cb: null, cr: null,
    tricks: freshTricks(), vis: freshVis(), wob: 0, thrLock: 0, offenseT: 0, slideT: 0, alat: 0, roll: 0,
    gear: 1, rpm: BIKES[bikeKey].engine ? BIKES[bikeKey].engine.idle : 0, shiftT: 0, limiter: false, clutchDump: 0,
    skid: 0, scrape: 0, bodySlide: 0, hitStop: 0, shake: 0, roadE: -1, onRoad: true, surface: 'road', bridgeE: -1,
    muniT: 0, tv: null, skidDist: 0, susp: 0, spawnGrace: 1.5, redCd: 0, lastJunction: -1, riding: false,
  });
  W = { active: false };
  if (rig) rig.root.visible = true;
  endTransit();
}
// Put the rider on the nearest road, in a lane, at a spot that is clear of trees, poles and walls for 12 m ahead
function placeOnRoad(x, z, heading, v, allowHwy) {
  let q = roadQuery(x, z, 400, (e) => drivable(e) && (allowHwy || !RC[MAP.eCls[e]].hwy));
  if (q.e < 0) q = roadQuery(x, z, 4000, drivable);             // far out (at sea, in a forest): find any road
  if (q.e < 0) { const sp = MAP.meta.spawn; q = roadQuery(sp[0], sp[1], 4000, drivable); }
  if (q.e < 0) { resetRider(x, z, heading, v); return; }
  const e = q.e, s0 = q.s, L = MAP.eLen[e];
  edgePoint(e, s0, EP);
  let dir = EP.tx * Math.sin(heading) + EP.tz * Math.cos(heading) >= 0 ? 1 : -1;
  if (MAP.eFlag[e] & F_ONEWAY) dir = 1;
  updateTiles(EP.x, EP.z, true);         // make sure the trees and poles here exist before checking
  const lanes = lanesPerDir(e), laneTry = [lanes - 1, 0, Math.floor(lanes / 2)];
  let best = null;
  outer: for (const ds of [0, 10, -10, 20, -20, 30, -30, 45, -45, 60, -60]) {
    const s = clamp(s0 + ds, 2, L - 2);
    edgePoint(e, s, EP);
    const fx = EP.tx * dir, fz = EP.tz * dir;
    for (const ln of laneTry) {
      const off = laneOffset(e, ln), px = EP.x - fz * off, pz = EP.z + fx * off;
      let clear = true;
      for (let k = -2; k <= 12 && clear; k += 1) if (hitAt(px + fx * k, pz + fz * k, 0.9) || landAt(px + fx * k, pz + fz * k) === 1 && !roadQuery(px + fx * k, pz + fz * k, 6).in) clear = false;
      for (const u of units) if (u.on && Math.hypot(u.x - px, u.z - pz) < 12) clear = false;
      if (clear) { best = [px, pz, Math.atan2(fx, fz)]; break outer; }
      if (!best) best = [px, pz, Math.atan2(fx, fz)];
    }
  }
  resetRider(best[0], best[1], best[2], v);
}
function resetWorld() {
  if (FOOT.on) { if (FOOT.store) leaveStore(); hopOn(); }
  if (typeof clearFootCops === 'function') clearFootCops();
  clearTiles();
  for (const u of units) deactivate(u);
  if (heli) { heli.on = false; heli.g.visible = false; heli.beam.visible = false; heli.spot.intensity = 0; }
  const sp = spawnPoint();
  placeOnRoad(sp[0], sp[1], 0, 0, false);
  heat = 0; unseenT = 0; chaseMax = 0;
  clearFX();
  if (rig) placeRig(0);
  camPos.set(S.x + 3, 1.8, S.z - 5); lookAt.set(S.x, 1, S.z + 2);
  updateTiles(S.x, S.z, true);
  S.muni = muniAt(S.x, S.z);
}
function startRide() {
  buildBike(); sfx.setBike();
  // a fresh ride starts clean: no wanted level, no cops already on your tail, no helicopter
  heat = 0; unseenT = 0; chaseMax = 0;
  for (const u of units) deactivate(u);
  if (heli) { heli.on = false; heli.g.visible = false; heli.beam.visible = false; heli.spot.intensity = 0; }
  clearFX();
  const sp = spawnPoint();
  placeOnRoad(sp[0], sp[1], S.psi, 4, false);
  bails = 3; banked = 0; longest = 0; topSpeed = 0; nearMisses = 0; maxStarsRun = 0;
  renderBails();
  updateTiles(S.x, S.z, true);
  for (const u of units) if (u.kind === 'car' && units.filter((x) => x.on && x.kind === 'car').length < C.traffic * 0.7) activate(u, true);
  let patrols = 0; for (const u of units) if (u.kind === 'cop' && patrols < 2 && activate(u, false)) patrols++;
  $('#where').innerHTML = '';
  $('#feed').innerHTML = '';
  S.muni = muniAt(S.x, S.z);
  hintUntil = performance.now() + 10000;
}
function renderBails() {
  const el = $('#bails'); el.innerHTML = '';
  for (let i = 0; i < 3; i++) { const b = document.createElement('i'); b.className = i < bails ? 'on' : 'lost'; el.appendChild(b); }
}

// ---------------------------------------------------------------- input
const keys = new Set();
const GAME_KEYS = ['Space', 'KeyB', 'KeyT', 'KeyI', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'ShiftLeft', 'ShiftRight', 'KeyR', 'KeyM', 'KeyV', 'KeyN', 'KeyP', 'KeyE', 'KeyF', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
let noLock = false;
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;          // typing in the map search box
  if (state === 'play' && GAME_KEYS.includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (mapOpen && state === 'play') {
    if (e.code === 'KeyN' || e.code === 'Escape') toggleMap();
    return;
  }
  keys.add(e.code);
  if (e.code === 'KeyV' && state === 'play' && (WALK.on || (S.riding && RIDE.train))) { transitKey('KeyV'); }
  else if (e.code === 'KeyV' && state === 'play') { const i = POVS.findIndex((p) => p[0] === pov); setPov(POVS[(i + 1) % POVS.length][0]); popup(POVS[(i + 1) % POVS.length][1]); }
  if (state === 'play') {
    if (e.code === 'Space' && !S.crashed && S.theta < 0.45 && S.popCd <= 0 && S.v > 1.5) {
      const B = BIKES[bikeKey];
      let kick = 1.3;
      if (B.type === 'gas') { const f = S.rpm / B.engine.redline; kick = 0.8 + 1.4 * f; S.clutchDump = 1; }
      S.omega += kick / B.inertia; S.popCd = 0.9; sfx.pop();
    }
    if (e.code === 'KeyM') toggleMute();
    // on foot (foot.js) the keys are its own: F rides, E robs or enters shops, 1-3 weapons, R reloads
    if (FOOT.on) footKey(e.code);
    else if (e.code === 'KeyT' || (FOOT.menu && e.code === 'Escape')) { if (FOOT.menu) closeStoreMenu(); else openMarket(); }   // the online market, from the bike too
    else {
      if (e.code === 'KeyR' && !S.crashed) { respawn(); popup('Reset'); }
      // E / F at a station walks you in; on the train E gets off, F rides back, V changes the view; F elsewhere hops off
      if ((e.code === 'KeyE' || e.code === 'KeyF') && transitKey(e.code)) { /* handled by the station / train */ }
      else if (e.code === 'KeyF') footKey('KeyF');
    }
    if (e.code === 'KeyN') toggleMap();
    if (e.code === 'KeyP' || (e.code === 'Escape' && noLock)) pause();
  } else if (state === 'over' && e.code === 'Enter') begin(true);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); if (state === 'play') pause(); });
document.addEventListener('mousemove', (e) => {
  if (state !== 'play' || mapOpen) return;
  if (WALK.on || RIDE.on) { transitLook(e.movementX, e.movementY); return; }
  if (FOOT.on) { footMouse(e.movementX, e.movementY); return; }
  S.steerMouse = clamp(S.steerMouse + e.movementX * 0.003 * sens, -1, 1);
  S.leanIn = clamp(S.leanIn - e.movementY * 0.004 * sens, -1, 1);
});
function lockPointer() {
  if (noLock) return;
  try { const p = canvas.requestPointerLock(); if (p && typeof p.catch === 'function') p.catch(lockFailed); } catch { lockFailed(); }
}
function lockFailed() {
  noLock = true;
  const n = $('#lockNote'); n.hidden = false; n.textContent = 'Mouse capture is blocked here, so steer with A and D and lean with Shift and Q. Pause with P.';
}
document.addEventListener('pointerlockerror', lockFailed);
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas && state === 'play' && !noLock && !mapOpen && !FOOT.menu) pause(); });
canvas.addEventListener('click', () => { if (state === 'play' && !document.pointerLockElement) lockPointer(); });
// The city map frees the mouse so you can click a destination; the ride is paused while it's open
function toggleMap() {
  mapOpen = !mapOpen; $('#bigmap').hidden = !mapOpen;
  keys.clear();
  if (mapOpen) {
    openCityMap();
    if (document.pointerLockElement) document.exitPointerLock();
    $('#bmHint').textContent = route ? `${route.dest.name}: ${fmtDist(route.total - NAV.prog)} · click to change, right-click to clear` : 'Click to set a destination · scroll to zoom · drag to pan · N or Esc to ride';
  } else {
    $('#navSearch').blur();
    lockPointer();
    last = performance.now();
  }
}

// ---------------------------------------------------------------- the rider
const SURF = {
  road: { grip: 1, roll: 0.15 }, pave: { grip: 0.95, roll: 0.2 }, grass: { grip: 0.6, roll: 0.9 }, sand: { grip: 0.45, roll: 2.4 },
};
function gasPower(B, d) {
  const e = B.engine, wheelRpm = S.v / (TAU * B.R) * 60;
  if (S.shiftT > 0) S.shiftT -= d;
  let rpmW = wheelRpm * e.ratios[S.gear - 1];
  if (S.shiftT <= 0) {
    if (rpmW > e.redline * 0.965 && S.gear < e.gears && S.thr > 0.3 && S.theta < 0.6) { S.gear++; S.shiftT = 0.11; sfx.shift(); }
    else if (S.gear > 1 && rpmW < e.redline * (S.thr > 0.5 ? 0.48 : 0.32)) { S.gear--; S.shiftT = 0.07; }
    rpmW = wheelRpm * e.ratios[S.gear - 1];
  }
  S.clutchDump = Math.max(0, S.clutchDump - d * 3);
  const slip = e.idle + S.thr * (e.redline * 0.6 - e.idle);
  let rpm = S.gear === 1 ? Math.max(rpmW, slip * (S.v < 6 ? 1 : 0.6)) : Math.max(rpmW, e.idle);
  if (S.shiftT > 0) rpm = Math.max(e.idle, rpmW * 0.92);
  S.limiter = rpm >= e.redline * 0.99 && S.thr > 0.5;
  rpm = Math.min(rpm, e.redline * (S.limiter ? 0.97 + Math.random() * 0.03 : 1));
  S.rpm += (rpm - S.rpm) * Math.min(1, d * 22);
  const x = S.rpm / e.redline;
  const curve = e.curve === 'two' ? 0.16 + 0.84 * smooth(0.42, 0.86, x) - 0.15 * smooth(0.95, 1.0, x) : clamp(0.28 + 1.45 * x - 0.73 * x * x, 0, 1);
  return B.power * curve * (S.shiftT > 0 ? 0.04 : 1) * (S.limiter ? 0.35 : 1) * (1 + S.clutchDump * 0.6);
}
// ---- burnouts
function burnoutStep(B, d) {
  if (!S.burnT) { S.burnT = 0; S.burnMark = 0; S.burnSmoke = 0; popup('Burnout', ''); }
  S.burnT += d;
  // a dark patch of rubber builds up under the spinning tyre
  const fx = Math.sin(S.psi), fz = Math.cos(S.psi);
  S.burnMark += d;
  if (S.onRoad && S.burnSpin > 6 && S.burnMark > 0.25) { S.burnMark = 0; addSkid(S.x + (Math.random() - 0.5) * 0.05, S.z + (Math.random() - 0.5) * 0.05, S.psi + (Math.random() - 0.5) * 0.2, S.y); }
  // tyre smoke pours off the back wheel and drifts up and back
  S.burnSmoke += d * Math.min(1, S.burnSpin / 15) * (S.surface === 'road' || S.surface === 'pave' ? 30 : 10);
  while (S.burnSmoke >= 1) { S.burnSmoke -= 1; spawnSmoke(S.x - fx * 0.25, S.y + 0.25, S.z - fz * 0.25, -fx * 2.5, -fz * 2.5, S.surface === 'road' || S.surface === 'pave' ? 0.8 : 0.5); }
}
function endBurnout() {
  const secs = S.burnT || 0, pts = Math.round(secs * 90);
  if (secs > 1) { banked += pts; popup(`Burnout ${secs.toFixed(1)}s +${pts}`, 'good'); }
  S.burnT = 0;
}
function step(d) {
  const B = BIKES[bikeKey];
  S.steerMouse *= Math.exp(-d * 2.6);
  S.leanIn *= Math.exp(-d * 0.9);
  S.popCd -= d;
  if (S.crashed) { crashStep(d); return; }

  // Tricks
  const T = S.tricks, Vv = S.vis;
  for (const t of TRICKS) {
    const st = T[t.key], held = keys.has(t.code);
    if (held && !st.on && W.active && S.theta > 0.25) {
      st.on = true; st.cur = 0;
      W.used.add(t.key);
      if (W.time - W.lastRel < 0.35 && W.lastRel > 0) { W.trickPts += 150; popup('Switch +150', 'good'); }
      if (t.hands) S.thrLock = S.thr;
    } else if (!held && st.on) {
      st.on = false; st.rel = W.time || 0; W.lastRel = W.time || 0;
      if (st.cur > 0.4) popup(`${t.name} ${st.cur.toFixed(1)}s`, '');
    }
    Vv[t.key] += ((st.on ? 1 : 0) - Vv[t.key]) * Math.min(1, d * 10);
  }
  const handsOff = T.nohand.on;
  const anyTrick = TRICKS.some((t) => T[t.key].on);

  // Where am I: road, sidewalk, grass, sand, water
  // (roadQuery reuses one result object, so copy what we need before any other query)
  const r0 = roadQuery(S.x, S.z, 14), q = { e: r0.e, in: r0.in, d: r0.d, hw: r0.hw };
  const prevE = S.roadE;
  S.onRoad = q.in; S.roadE = q.e;
  const lc = landAt(S.x, S.z);
  S.surface = q.in ? (RC[MAP.eCls[q.e]].path ? 'pave' : 'road') : lc === 1 ? 'water' : (lc === 2 || lc === 3 || lc === 6) ? 'grass' : lc === 4 ? 'sand' : 'pave';
  if (S.surface === 'water' && S.v > 0.5) { crash('Into the water', 'water'); return; }
  const sf = SURF[S.surface] || SURF.pave;
  const wet = (S.surface === 'road' || S.surface === 'pave') ? 1 - 0.22 * WX.wet : 1;
  const grip = B.grip * sf.grip * wet * (B.knobby && (S.surface === 'grass' || S.surface === 'sand') ? 1.3 : 1);
  // bridges: you can't ride through the railing
  if (q.in && (MAP.eFlag[q.e] & F_BRIDGE)) S.bridgeE = q.e;
  else if (S.bridgeE >= 0 && !q.in) {
    const qb = roadQuery(S.x, S.z, 20, (e) => e === S.bridgeE);
    if (qb.e >= 0 && qb.d > qb.hw && qb.d < qb.hw + 3) {
      if (S.v > 4) { crash('Hit the railing', 'wall'); return; }
      S.v = 0; S.x -= Math.sin(S.psi) * 0.3; S.z -= Math.cos(S.psi) * 0.3;
    } else S.bridgeE = -1;
  }

  // Throttle, brake, lean
  // B is a burnout on one key (brake + full throttle): many laptop keyboards can't hold S + W + a steering key at once
  const burnKey = keys.has('KeyB') && !handsOff && S.v < 3;
  const want = keys.has('KeyW') || burnKey ? 1 : 0;
  if (handsOff) S.thr = S.thrLock;
  else S.thr += (want - S.thr) * Math.min(1, d * (want > S.thr ? 7 : 14));
  const brake = (keys.has('KeyS') || burnKey) && !handsOff ? 1 : 0;
  const leanKey = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
  const leanCtl = (T.nofoot.on ? 0.5 : 1) * (T.knee.on ? 0.75 : 1) * (T.high.on ? 0 : 1) * (T.stand.on ? 1.6 : 1);
  S.lean += (clamp((S.leanIn + leanKey) * leanCtl, -1, 1) - S.lean) * Math.min(1, d * 8);
  const wobble = TRICKS.reduce((sum, t) => sum + (T[t.key].on ? t.wobble : 0), 0);
  S.wob += ((Math.random() - 0.5) * 7 * wobble - S.wob * 1.5) * d;
  if (!wobble) S.wob *= Math.exp(-d * 4);

  // Burnout: brake held with the throttle pinned while (nearly) stopped. The front brake holds the bike while the back
  // wheel spins up, smokes and lays rubber; steer to swing the back round the front wheel (donuts); let go of the
  // brake to launch.
  const burning = brake && S.thr > 0.6 && S.v < 3 && S.theta < 0.05 && !anyTrick && S.surface !== 'water';
  S.burnSpin = burning ? Math.min(30, (S.burnSpin || 0) + d * 40) : Math.max(0, (S.burnSpin || 0) - d * 45);

  // Powertrain: electric is torque-limited then flat power; gas has gears, a power curve and a clutch
  const m = B.mass + 75;
  let P = B.power;
  if (B.type === 'gas') P = gasPower(B, d); else S.rpm = S.v / (TAU * B.R) * 60 * B.motor.ratio;
  if (S.burnSpin > 0.5) {
    // the engine revs with the spinning back wheel, not the stopped bike
    const spinRpm = B.type === 'gas' ? B.engine.redline * (0.55 + 0.38 * Math.min(1, S.burnSpin / 20)) * (0.97 + Math.random() * 0.03) : S.burnSpin / (TAU * B.R) * 60 * B.motor.ratio;
    S.rpm = Math.max(S.rpm, spinRpm);
  }
  if (burning) burnoutStep(B, d);
  else if (S.burnT > 0) endBurnout();
  const traction = B.traction * clamp(grip, 0.35, 1.1);
  const motor = S.thr * Math.min(traction, P / (m * Math.max(S.v, 2)));
  const engBrake = B.type === 'gas' ? 0.8 * (S.rpm / B.engine.redline) * (1 - S.thr) * (S.v > 1 ? 1 : 0) : 0.3 * (1 - S.thr) * (S.v > 1 ? 1 : 0);
  const brakeDecel = brake * (S.theta > 0.05 ? 5.5 : 9) * clamp(grip, 0.4, 1.1);
  let a = burning ? -6 : motor - B.drag * S.v * S.v - (S.v > 0.1 ? sf.roll : 0) - brakeDecel - engBrake;
  if (S.v <= 0 && a < 0) a = 0;
  S.v = Math.max(0, S.v + a * d);
  S.susp += ((-a * 0.012) - S.susp) * Math.min(1, d * 8);
  // Skid: hard braking near the grip limit (and the screech of a burnout)
  S.skid = brake && S.v > 6 && brakeDecel > 7.2 * grip ? clamp((S.v - 6) / 20, 0.1, 0.35) : 0;
  if (S.burnSpin > 2) S.skid = Math.max(S.skid, Math.min(0.4, S.burnSpin / 60));
  if (burning) a = 0;          // (no wheelie from a burnout)

  // Wheelie: pitch about the rear axle. Acceleration lifts (a·sinφ), gravity pulls down (g·cosφ).
  const phi = PHI0 + S.lean * 0.2 + S.theta + 0.08 * Vv.stand + 0.05 * Vv.high;
  let alpha = (B.ka * a * Math.sin(phi) - G * Math.cos(phi)) / (3.6 * B.inertia) - 2.4 * S.omega + S.wob * 0.6;
  if (S.theta <= 0 && alpha < 0 && S.omega <= 0) { alpha = 0; S.omega = 0; }
  S.omega += alpha * d;
  S.theta += S.omega * d;
  if (S.theta < 0) {
    if (S.omega < -3 && W.active) sfx.thump(Math.min(1, -S.omega / 6));
    S.theta = 0; S.omega = S.omega < -1.5 ? -S.omega * 0.12 : 0;
  }
  if (phi > LOOP) { crash('Looped out', 'loop'); return; }

  // Steering: bicycle model, limited by what the tyres can hold. Push past the limit for too long and it lowsides.
  const steerIn = handsOff ? 0 : clamp(S.steerMouse + (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), -1, 1) * (T.knee.on ? 0.6 : 1);
  // Full input asks for ~90% of the grip you have, so normal riding never lowsides; it takes a sudden loss of grip
  // mid-corner (onto grass or sand at speed) to wash out the front.
  S.gripSm = S.gripSm === undefined ? grip : S.gripSm + (grip - S.gripSm) * Math.min(1, d * 1.5);
  const gripSteer = Math.atan(S.gripSm * G * 0.9 * B.L / Math.max(1, S.v * S.v));
  const maxSteer = Math.min(0.55 / (1 + S.v / 9), gripSteer) * (S.theta > 0.12 ? 0.55 : 1);
  S.steer += (steerIn * maxSteer - S.steer) * Math.min(1, d * 4.5);
  const yawRate = S.v * Math.tan(S.steer) / B.L;
  S.psi -= yawRate * d;
  S.alat = S.v * yawRate;
  const over = Math.abs(S.alat) / Math.max(0.1, grip * G);
  if (over > 1.25 && S.v > 9) S.slideT += d; else S.slideT = Math.max(0, S.slideT - d * 2);
  if (over > 0.95 && S.v > 7) S.skid = Math.max(S.skid, (over - 0.95) * 1.2);
  if (S.slideT > 0.5) { crash('Lowsided', 'lowside'); return; }
  S.roll += (Math.atan(S.alat / G) - (S.roll || 0)) * Math.min(1, d * 5);
  const fx = Math.sin(S.psi), fz = Math.cos(S.psi);
  S.x += fx * S.v * d; S.z += fz * S.v * d;
  const gy = S.onRoad ? roadY(RC[MAP.eCls[q.e]].rank) : (q.e >= 0 && q.d < q.hw + 2.6 && RC[MAP.eCls[q.e]].walk) ? CURB : 0;
  S.y += (gy - S.y) * Math.min(1, d * 18);
  // skid marks
  if (S.skid > 0.12 && S.onRoad) { S.skidDist += S.v * d; if (S.skidDist > 0.35) { S.skidDist = 0; addSkid(S.x, S.z, S.psi, S.y); } }

  // Buildings, poles, trees, signals: a slow bump just stops you; anything faster is a crash
  S.spawnGrace = Math.max(0, (S.spawnGrace || 0) - d);
  let hit = hitAt(S.x + fx * B.L, S.z + fz * B.L, 0.25) || hitAt(S.x, S.z, 0.2);
  if (hit && S.spawnGrace > 0 && hit !== 'Hit a wall') hit = null;   // just respawned: ride out of anything you landed on
  if (hit) {
    if (S.v < 3.5) { S.x -= fx * 0.35; S.z -= fz * 0.35; if (S.v > 1) sfx.thump(0.4); S.v = 0; }
    else { crash(hit, /pole|light|sign|pillar|tree/i.test(hit) ? 'pole' : 'wall'); return; }
  }

  // Red lights: entering a signalised junction against the light, judged once per junction
  // (inside the junction the nearest road flips between the crossing streets, so only the approach counts)
  S.redCd = Math.max(0, (S.redCd || 0) - d);
  if (prevE >= 0 && q.e >= 0 && q.e !== prevE && S.v > 4 && S.redCd <= 0) {
    const m2 = MAP, shared = [m2.eA[prevE], m2.eB[prevE]].find((n) => n === m2.eA[q.e] || n === m2.eB[q.e]);
    if (shared !== undefined && m2.nflag[shared] && RC[m2.eCls[prevE]].drive && shared !== S.lastJunction) {
      S.lastJunction = shared;
      const ent = shared === m2.eB[prevE] ? prevE * 2 + 1 : prevE * 2;
      // must actually be heading into the junction along the approach road
      const [ax, az] = dirFromNode(shared, ent), towards = -(ax * fx + az * fz);
      if (towards > 0.6 && signalState(shared, signalGroup(shared, ent), simTime) === 2 && copNear(80)) { popup('Ran a red', 'bad'); offense(0.45); S.redCd = 8; }
    }
  }
  if (S.lastJunction !== undefined && S.lastJunction >= 0 && Math.hypot(MAP.nx[S.lastJunction] - S.x, MAP.nz[S.lastJunction] - S.z) > 40) S.lastJunction = -1;

  // Traffic and cops: collisions, close calls, angry drivers
  for (const u of units) {
    if (!u.on) continue;
    const dx = S.x - u.x, dz = S.z - u.z;
    const c = Math.cos(u.yaw), s = Math.sin(u.yaw);
    const hx = (u.T.W || 1.9) / 2 + 0.3, hz = (u.T.L || 4.4) / 2 + 0.15;
    // the bike is tested at its back wheel, its middle (the rider) and its front wheel
    let lx = 0, lz = 0, inside = false;
    for (const f of [0, 0.5, 1]) {
      const px = dx + fx * B.L * f, pz = dz + fz * B.L * f, ax = px * c - pz * s, az = px * s + pz * c;
      if (Math.abs(ax) < hx && Math.abs(az) < hz) { lx = ax; lz = az; inside = true; break; }
    }
    if (inside) {
      const rel = Math.hypot(fx * S.v - Math.sin(u.yaw) * u.v, fz * S.v - Math.cos(u.yaw) * u.v);
      // a cop pacing you in a normal pursuit only shoves you; only a ramming cop (3+ stars) or a hard hit crashes you
      const gentleCop = u.kind !== 'car' && u.chasing && !(stars() >= 3 && u.tac === 'ram') && rel < 9;
      if (rel < 3.5 || S.spawnGrace > 0 || gentleCop) {
        // a bump, not a crash: pushed out the shortest way (side, front or back) and stopped against it
        const penX = hx - Math.abs(lx), penZ = hz - Math.abs(lz);
        if (penX < penZ) { const sd = lx >= 0 ? 1 : -1; S.x += c * sd * (penX + 0.05); S.z += -s * sd * (penX + 0.05); }
        else { const sd = lz >= 0 ? 1 : -1; S.x += s * sd * (penZ + 0.05); S.z += c * sd * (penZ + 0.05); }
        // lose the speed you had going into it
        const into = -((fx * (s * Math.sign(lz || 1))) + (fz * (c * Math.sign(lz || 1))));
        S.v *= penX < penZ ? 0.55 : into > 0.3 ? 0.1 : 0.6; u.v *= 0.7;
        if ((u.bumpCd || 0) <= 0) { sfx.thump(0.5); u.bumpCd = 1; if (u.kind === 'car') { sfx.horn(u); say(u, pick(Math.random, CURSES), true); } }
        continue;
      }
      if (u.kind === 'car') { offense(0.8); say(u, pick(Math.random, CURSES_HIT), false); sfx.horn(u); }
      else if (!u.chasing) addHeat(1);               // you rode into a patrol car
      if (u.kind !== 'car' && PURSUIT.phase === 'pullover') { addHeat(Math.max(0.05, 2.05 - heat)); PURSUIT.phase = 'pursuit'; }
      crash(u.kind === 'car' ? 'Hit a car' : u.chasing ? (u.tac === 'ram' && stars() >= 3 ? 'PIT maneuver by the cops' : 'Rammed by the cops') : 'Hit a cop car', 'car', u, rel); return;
    }
    u.bumpCd = (u.bumpCd || 0) - d;
    const dist = Math.hypot(dx, dz);
    u.nearCd -= d;
    if (dist < 2.8 && S.v > 6 && u.nearCd <= 0 && u.kind === 'car') {
      u.nearCd = 3; nearMisses++;
      const pts = Math.round((W.active ? 500 : 200) * heatMult());
      banked += pts; popup(`${W.active ? 'Wheelie close call' : 'Close call'} +${pts}`, 'good');
      offense(0.12);
      if (Math.random() < 0.7) { sfx.horn(u); say(u, pick(Math.random, CURSES), Math.random() < 0.3); }
    }
  }

  // Offences a cop might see (only counts when one is close enough to see you)
  const onWalk = !S.onRoad && q.e >= 0 && q.d < q.hw + 2.8 && RC[MAP.eCls[q.e]].walk;
  // wheelies are the game: they only count if a cop is right there watching, and slowly
  if (W.active && copNear(35)) addHeat((anyTrick ? 0.12 : 0.05) * d);
  if (q.e >= 0 && RC[MAP.eCls[q.e]].v && S.v > RC[MAP.eCls[q.e]].v * 1.4 + 5) offense(0.07 * d);
  if (onWalk && S.v > 6) offense(0.05 * d);
  if ((S.surface === 'grass') && S.v > 6) offense(0.03 * d);

  // Scoring
  if (S.theta > 0.15) {
    if (!W.active) W = { active: true, dist: 0, pts: 0, sweet: 0, maxPhi: 0, time: 0, trickPts: 0, used: new Set(), lastRel: -9 };
    const ds = S.v * d, sweet = phi > SWEET[0] && phi < SWEET[1];
    W.dist += ds; W.time += d; W.maxPhi = Math.max(W.maxPhi, phi);
    if (sweet) W.sweet += d;
    W.pts += ds * 12 * (1 + (sweet ? 1 : 0) + 0.6 * S.v / B.vmax);
    for (const t of TRICKS) { const st = T[t.key]; if (st.on) { st.cur += d; W.trickPts += t.rate * d * (sweet ? 1.5 : 1); } }
  } else if (W.active && S.theta < 0.05) {
    const stuck = TRICKS.find((t) => T[t.key].on || W.time - T[t.key].rel < 0.2);
    if (stuck) { crash(stuck.hands ? 'Hands off the bars' : 'Feet off the pegs', 'loop'); return; }
    endWheelie();
  }
  topSpeed = Math.max(topSpeed, S.v);
}
const heatMult = () => 1 + 0.3 * stars();
function endWheelie() {
  const w = W; W = { active: false };
  S.tricks = freshTricks();
  if (!w.dist || w.dist < 4) return;
  let total = w.pts + (w.trickPts || 0);
  const n = w.used ? w.used.size : 0;
  if (w.sweet > 1.5) { const b = Math.round(300 * w.sweet); total += b; popup(`Balance point ${w.sweet.toFixed(1)}s +${b}`, 'good'); }
  if (w.maxPhi > 1.62) { total += 500; popup('12 o\'clock +500', 'good'); }
  if (n >= 2) { const mult = 1 + 0.5 * (n - 1); total *= mult; popup(`${n}-trick combo ×${mult.toFixed(1)}`, 'good'); }
  if (stars()) { total *= heatMult(); popup(`Wanted ×${heatMult().toFixed(1)}`, 'cop'); }
  total = Math.round(total);
  banked += total; longest = Math.max(longest, w.dist);
  popup(`Wheelie ${Math.round(w.dist)} m +${total.toLocaleString()}`, 'bank');
}

// ---------------------------------------------------------------- crashes: separate bike and rider bodies, debris, sparks
function crash(reason, kind = 'wall', other = null, relSpeed) {
  if (S.crashed) return;
  pedsReact(S.x, S.z);
  const B = BIKES[bikeKey], v = relSpeed ?? S.v, fx = Math.sin(S.psi), fz = Math.cos(S.psi), rx = -fz, rz = fx;
  const sev = clamp(v / 18, 0.25, 1.5), side = Math.random() < 0.5 ? -1 : 1;
  S.crashed = true; S.crashT = 0; S.crashReason = reason; S.cpsi = S.psi;
  const bvx = fx * S.v, bvz = fz * S.v;
  // bike body
  const cb = { x: S.x, y: S.y + B.R, z: S.z, vx: bvx, vy: 0, vz: bvz, rx: -S.theta, ry: S.psi, rz: S.roll, ax: 0, ay: 0, az: 0, contact: 0 };
  // rider
  rig.root.updateMatrixWorld(true);
  const hip = rig.upper.getWorldPosition(new THREE.Vector3());
  const cr = { x: hip.x, y: hip.y, z: hip.z, vx: bvx, vy: 0, vz: bvz, rx: 0, ry: S.psi, rz: 0, ax: 0, ay: 0, az: 0, contact: 0, flail: 1, thudCd: 0 };
  if (kind === 'car' || kind === 'wall' || kind === 'pole') {
    Object.assign(cb, { vx: -bvx * 0.22 + rx * side * 1.5, vz: -bvz * 0.22 + rz * side * 1.5, vy: 1.2 + sev * 1.5, ax: 3 + Math.random() * 5, ay: (Math.random() - 0.5) * 6, az: side * (2 + Math.random() * 4) });
    if (kind === 'car') Object.assign(cr, { vx: bvx * 0.7 + rx * side, vz: bvz * 0.7 + rz * side, vy: 3.2 + sev * 3, ax: 5 + sev * 5, ay: (Math.random() - 0.5) * 3, az: (Math.random() - 0.5) * 5 });
    else Object.assign(cr, { vx: -bvx * 0.18 + rx * side * 0.8, vz: -bvz * 0.18 + rz * side * 0.8, vy: 1.4 + sev, ax: -3 - Math.random() * 3, ay: (Math.random() - 0.5) * 4, az: side * 3 });
  } else if (kind === 'loop') {
    Object.assign(cb, { vx: bvx * 0.6, vz: bvz * 0.6, vy: 1.6, ax: -4.5, az: side * 1.2 });
    Object.assign(cr, { vx: bvx * 0.45, vz: bvz * 0.45, vy: 1.2, ax: -3.2, az: side * 1.5 });
  } else if (kind === 'lowside') {
    Object.assign(cb, { vx: bvx * 0.95, vz: bvz * 0.95, vy: 0.3, rz: Math.sign(S.roll || side) * 1.4, ay: (Math.random() - 0.5) * 3 });
    Object.assign(cr, { vx: bvx * 0.85 + rx * Math.sign(S.roll || side) * 1.2, vz: bvz * 0.85 + rz * Math.sign(S.roll || side) * 1.2, vy: 1.0, ax: (Math.random() - 0.5) * 4, ay: (Math.random() - 0.5) * 5, az: Math.sign(S.roll || side) * 4 });
  } else if (kind === 'water') {
    Object.assign(cb, { vx: bvx * 0.5, vz: bvz * 0.5, vy: 0.5, ax: 1 });
    Object.assign(cr, { vx: bvx * 0.6, vz: bvz * 0.6, vy: 1.5, ax: 2 });
  }
  S.cb = cb; S.cr = cr;
  detachRider(hip);
  // debris and effects
  const at = [S.x + fx * B.L * 0.7, S.y + 0.6, S.z + fz * B.L * 0.7];
  if (kind !== 'water') spawnDebris(at, [bvx * 0.4, bvz * 0.4], Math.round(6 + sev * 16), [rig.paint, rig.accent, carMats.copBlack]);
  if (kind === 'car' && other) {
    spawnDebris([at[0], 1.0, at[2]], [bvx * 0.3, bvz * 0.3], Math.round(10 + sev * 14), [FX.glassMat], true);
    other.hitT = 4; other.v = 0; other.rock = 0.06 + 0.06 * sev; other.mode === 'free' || (other.next = null);
  }
  if (kind === 'water') { spawnSplash(S.x, S.z, 120); sfx.splash(); }
  else sfx.crash(kind, sev);
  if (kind !== 'water' && kind !== 'loop') spawnSparks(at[0], 0.2, at[2], bvx * 0.5, bvz * 0.5, Math.round(20 + sev * 30));
  S.hitStop = reduceMotion ? 0 : 0.05 + 0.05 * sev;
  S.shake = reduceMotion ? 0 : 0.25 + 0.35 * sev;
  flash(0.55 + 0.35 * Math.min(1, sev));
  if (W.active) { popup('Wheelie lost', 'bad'); W = { active: false }; }
  popup(reason, 'bad');
  bails--; renderBails();
}
function detachRider(hip) {
  const wrap = new THREE.Group(); wrap.position.copy(hip);
  wrap.rotation.set(0, S.psi, 0);
  scene.add(wrap); wrap.updateMatrixWorld(true);
  wrap.attach(rig.rider);
  rig.ragdoll = wrap;
}
function restoreRider() {
  if (!rig || !rig.ragdoll) return;
  rig.body.add(rig.rider);
  rig.rider.position.copy(rig.riderHome.p); rig.rider.quaternion.copy(rig.riderHome.q);
  scene.remove(rig.ragdoll); rig.ragdoll = null;
  for (const k of ['armL', 'armR', 'legL', 'legR']) rig[k].rotation.set(0, 0, 0);
  rig.head.rotation.set(0, 0, 0); rig.upper.rotation.set(0, 0, 0);
}
function bodyPhysics(b, d, radius, rest, mu, isRider) {
  b.vy -= G * d;
  let nx = b.x + b.vx * d, nz = b.z + b.vz * d;
  // walls: bounce off buildings
  if (buildingAt(nx, nz, radius * 0.6) >= 0) {
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 2) { if (isRider) sfx.bodyHit(Math.min(1, sp / 12)); else sfx.metal(Math.min(0.8, sp / 15)); }
    b.vx *= -0.3; b.vz *= -0.3; nx = b.x; nz = b.z; b.ay += (Math.random() - 0.5) * 4;
  }
  b.x = nx; b.z = nz; b.y += b.vy * d;
  const water = landAt(b.x, b.z) === 1 && !roadQuery(b.x, b.z, 10).in;
  const floor = water ? -1.6 : radius;
  b.contact = 0;
  if (b.y < floor) {
    if (water) {
      if (b.vy < -2) spawnSplash(b.x, b.z, 30);
      b.y = Math.max(b.y, -1.6); b.vy *= 0.5; b.vx *= Math.exp(-d * 2); b.vz *= Math.exp(-d * 2);
      b.ax *= 0.95; b.ay *= 0.95; b.az *= 0.95;
      return { slide: 0, water: true };
    }
    b.y = floor;
    const impact = -b.vy;
    if (impact > 2.2) {
      if (isRider) { if (b.thudCd <= 0) { sfx.bodyHit(Math.min(1.2, impact / 7)); b.thudCd = 0.15; } }
      else { sfx.metal(Math.min(0.7, impact / 10)); sfx.plastic(Math.min(0.8, impact / 8)); spawnDebris([b.x, 0.3, b.z], [b.vx * 0.3, b.vz * 0.3], Math.round(impact), [rig.paint, carMats.copBlack]); }
      S.shake = Math.max(S.shake, reduceMotion ? 0 : Math.min(0.4, impact * 0.04));
      b.ax += (Math.random() - 0.5) * impact * 1.4; b.az += (Math.random() - 0.5) * impact * 1.4;
    }
    b.vy = impact > 1.2 ? impact * rest : 0;
    // sliding friction along the ground
    const hv = Math.hypot(b.vx, b.vz);
    if (hv > 0) { const k = Math.max(0, hv - mu * G * d) / hv; b.vx *= k; b.vz *= k; }
    b.contact = 1;
    b.ax *= Math.exp(-d * 2.5); b.ay *= Math.exp(-d * 2.5); b.az *= Math.exp(-d * 2.5);
    return { slide: hv, water: false };
  }
  return { slide: 0, water: false };
}
function crashStep(d) {
  S.crashT += d;
  const cb = S.cb, cr = S.cr;
  cr.thudCd -= d;
  // bike
  const rb = bodyPhysics(cb, d, 0.32, 0.25, 0.5, false);
  cb.rx += cb.ax * d; cb.ry += cb.ay * d; cb.rz += cb.az * d;
  if (cb.contact) {
    // lie down on a side and slide
    const sideT = Math.sign(wrapPi(cb.rz) || 1) * Math.PI / 2;
    cb.rz += (sideT - wrapPi(cb.rz)) * Math.min(1, d * 5) * (Math.abs(cb.az) < 3 ? 1 : 0.2);
    cb.rx += (0 - wrapPi(cb.rx)) * Math.min(1, d * 3) * (Math.abs(cb.ax) < 3 ? 1 : 0.2);
  }
  const hard = !rb.water && landAt(cb.x, cb.z) !== 2 && landAt(cb.x, cb.z) !== 3;
  S.scrape = rb.slide > 1 && hard ? Math.min(0.55, rb.slide * 0.045) : 0;
  if (S.scrape > 0 && Math.random() < rb.slide * d * 6) spawnSparks(cb.x, 0.1, cb.z, cb.vx * 0.8, cb.vz * 0.8, 3);
  // rider
  const rr = bodyPhysics(cr, d, 0.28, 0.35, 0.65, true);
  cr.rx += cr.ax * d; cr.ry += cr.ay * d; cr.rz += cr.az * d;
  if (cr.contact && rr.slide < 2.5) {
    // settle face-down or on the back
    const tgt = Math.abs(wrapPi(cr.rx) + Math.PI / 2) < Math.abs(wrapPi(cr.rx) - Math.PI / 2) ? -Math.PI / 2 : Math.PI / 2;
    cr.rx += (tgt - wrapPi(cr.rx)) * Math.min(1, d * 3); cr.rz += (0 - wrapPi(cr.rz)) * Math.min(1, d * 3);
  }
  cr.flail = Math.max(0.12, cr.flail - d * (cr.contact ? 1.2 : 0.2));
  S.bodySlide = rr.slide > 0.8 ? Math.min(0.4, rr.slide * 0.035) : 0;
  if (S.crashT > 3.4) { if (bails <= 0) gameOver(); else respawn(); }
}
function respawn() {
  let x = S.cr ? S.cr.x : S.x, z = S.cr ? S.cr.z : S.z;
  if (store.get('wc-respawn', 'crash') === 'spawn') { const sp = spawnPoint(); x = sp[0]; z = sp[1]; }
  placeOnRoad(x, z, S.cpsi ?? S.psi, 5, true);
  for (const u of units) if (u.on && Math.hypot(u.x - S.x, u.z - S.z) < 25) deactivate(u);
  S.scrape = 0; S.bodySlide = 0;
}

// ---- effects: debris, sparks, splash, skid marks, screen flash
const FX = {
  debris: [], glassMat: new THREE.MeshStandardMaterial({ color: '#bfe8ff', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.7 }),
  debrisGeo: [new THREE.BoxGeometry(0.12, 0.04, 0.09), new THREE.BoxGeometry(0.2, 0.03, 0.06), new THREE.TetrahedronGeometry(0.07), new THREE.BoxGeometry(0.06, 0.06, 0.06)],
};
for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(FX.debrisGeo[i % 4], FX.glassMat); m.visible = false; m.castShadow = true; scene.add(m); FX.debris.push({ m, life: 0, v: [0, 0, 0], av: [0, 0, 0] }); }
function makePoints(n, size, color) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, blending: color === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending }));
  p.frustumCulled = false; scene.add(p);
  return { p, pos, col, vel: new Float32Array(n * 3), life: new Float32Array(n), n, next: 0 };
}
FX.sparks = makePoints(400, 0.09, 'add');
FX.splash = makePoints(300, 0.16, 'normal');
FX.blood = makePoints(900, 0.085, 'normal');
FX.blood.floor = new Float32Array(900); FX.blood.landed = new Uint8Array(900);
// blood splats on the ground where drops land, and drip trails (instanced decals, recycled oldest first)
FX.splats = (() => {
  const N = 600, mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const im = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2), mat, N);
  im.count = 0; im.frustumCulled = false; im.renderOrder = 1; scene.add(im);
  return { im, N, next: 0, born: new Float32Array(N), size: new Float32Array(N), m4: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color(), tick: 0 };
})();
// blood dries up and is gone after a while: splats shrink away after BLOOD_LIFE seconds, pools fade
const BLOOD_LIFE = 35;
function fadeBlood(d) {
  const S2 = FX.splats, now = performance.now() / 1000;
  S2.tick -= d;
  if (S2.tick <= 0 && S2.im.count) {
    S2.tick = 0.25; let any = false;
    for (let i = 0; i < S2.im.count; i++) {
      const age = now - S2.born[i]; if (age < BLOOD_LIFE || S2.size[i] <= 0) continue;
      S2.im.getMatrixAt(i, S2.m4); S2.m4.decompose(S2.p, S2.q, S2.s);
      const k = Math.max(0, 1 - (age - BLOOD_LIFE) / 5);
      if (k <= 0) { S2.size[i] = 0; S2.s.set(0, 0, 0); } else S2.s.multiplyScalar(0.93);
      S2.im.setMatrixAt(i, S2.m4.compose(S2.p, S2.q, S2.s)); any = true;
    }
    if (any) S2.im.instanceMatrix.needsUpdate = true;
  }
  for (let i = FX.pools.length - 1; i >= 0; i--) {
    const m = FX.pools[i]; m.userData.age = (m.userData.age || 0) + d;
    if (m.userData.age > BLOOD_LIFE + 15) {
      if (!m.userData.own) { m.material = POOL_MAT.clone(); m.userData.own = true; }
      m.material.opacity -= d * 0.25;
      if (m.material.opacity <= 0) { scene.remove(m); m.material.dispose(); FX.pools.splice(i, 1); }
    }
  }
}
function bloodSplat(x, y, z, size) {
  const S2 = FX.splats, i = S2.next; S2.next = (S2.next + 1) % S2.N; S2.im.count = Math.max(S2.im.count, i + 1);
  S2.born[i] = performance.now() / 1000; S2.size[i] = size;
  S2.q.setFromAxisAngle(THREE.Object3D.DefaultUp, Math.random() * TAU);
  S2.s.set(size * (0.7 + Math.random() * 0.6), 1, size * (0.7 + Math.random() * 0.6));
  S2.im.setMatrixAt(i, S2.m4.compose(S2.p.set(x, y + 0.025, z), S2.q, S2.s));
  S2.im.setColorAt(i, S2.c.setRGB(0.28 + Math.random() * 0.12, 0.01, 0.015));
  S2.im.instanceMatrix.needsUpdate = true; S2.im.instanceColor.needsUpdate = true;
}
// a spray of blood from a hit, flying away from the attacker (y is about chest height; it lands on the floor below)
function spawnBlood(x, y, z, dx, dz, n) {
  const F = FX.blood, floor = y > -100 ? Math.max(0.02, y - 1.18) : y - 1.18;
  for (let k = 0; k < n; k++) {
    const i = F.next = (F.next + 1) % F.n, hard = Math.random() < 0.6;
    F.pos.set([x + (Math.random() - 0.5) * 0.15, y + (Math.random() - 0.5) * 0.25, z + (Math.random() - 0.5) * 0.15], i * 3);
    F.vel.set([dx * (hard ? 1.5 + Math.random() * 3.5 : 0.5) + (Math.random() - 0.5) * 2, 0.3 + Math.random() * 2.4, dz * (hard ? 1.5 + Math.random() * 3.5 : 0.5) + (Math.random() - 0.5) * 2], i * 3);
    F.life[i] = 0.7 + Math.random() * 0.8; F.floor[i] = floor; F.landed[i] = 0;
  }
}
// a dark pool spreading under someone who's down (removed with them)
const POOL_GEO = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
const POOL_MAT = new THREE.MeshBasicMaterial({ color: '#3a0306', transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
function bloodPool(x, y, z) {
  const m = new THREE.Mesh(POOL_GEO, POOL_MAT); m.position.set(x, y + 0.02, z); m.scale.setScalar(0.05); m.renderOrder = 1;
  m.userData.grow = 0; m.userData.size = 1.1 + Math.random() * 0.6; scene.add(m); FX.pools.push(m);
  if (FX.pools.length > 24) { const o = FX.pools.shift(); scene.remove(o); if (o.userData.own) o.material.dispose(); }
  return m;
}
// your own wounds: the screen edges go red when you're hit, and stay tinted while you're badly hurt
const hurtVeil = document.createElement('div'); hurtVeil.id = 'hurtVeil';
(document.querySelector('#stage') || document.body).append(hurtVeil);
{ const st = document.createElement('style'); st.textContent = '#hurtVeil { position: absolute; inset: 0; z-index: 5; pointer-events: none; opacity: 0; background: radial-gradient(ellipse at center, rgba(120,0,0,0) 45%, rgba(120,0,6,.55) 80%, rgba(70,0,0,.9) 100%); transition: opacity .15s; }'; document.head.appendChild(st); }
let hurtV = 0;
function screenBlood(s) { hurtV = Math.min(1, hurtV + s); }
function updateHurtVeil(d) {
  const low = typeof FOOT !== 'undefined' && FOOT.on && FOOT.hp < 40 ? (40 - FOOT.hp) / 70 : 0;
  hurtV = Math.max(0, hurtV - d * 0.7);
  hurtVeil.style.opacity = Math.max(hurtV, low).toFixed(2);
}
FX.pools = [];
FX.skids = (() => {
  const N = 700, im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.42).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#0b0b0c', transparent: true, opacity: 0.55, depthWrite: false }), N);
  im.count = 0; im.frustumCulled = false; scene.add(im);
  return { im, N, next: 0 };
})();
// Tyre smoke: soft puffs that grow, rise, drift and thin out
FX.smoke = (() => {
  const N = 600, g = new THREE.BufferGeometry(), pos = new Float32Array(N * 3).fill(-1000), age = new Float32Array(N), shade = new Float32Array(N);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aAge', new THREE.BufferAttribute(age, 1)); g.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 600 } }, transparent: true, depthWrite: false,
    // (the renderer uses a logarithmic depth buffer: hand-written shaders must write depth the same way)
    vertexShader: '#include <common>\n#include <logdepthbuf_pars_vertex>\nattribute float aAge; attribute float aShade; uniform float uPx; varying float vA; varying float vS;\n' +
      'void main() { vA = aAge; vS = aShade; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;\n' +
      '  gl_PointSize = aAge >= 1.0 ? 0.0 : uPx * (0.5 + 2.6 * sqrt(aAge)) / max(0.5, -mv.z);\n#include <logdepthbuf_vertex>\n}',
    fragmentShader: '#include <common>\n#include <logdepthbuf_pars_fragment>\nvarying float vA; varying float vS;\n' +
      'void main() {\n#include <logdepthbuf_fragment>\n  vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0; if (r > 1.0) discard;\n' +
      '  float a = (1.0 - r) * (1.0 - r) * (1.0 - vA) * min(1.0, vA * 12.0) * 0.24;\n' +
      '  gl_FragColor = vec4(vec3(vS), a); }',
  });
  const p = new THREE.Points(g, mat); p.frustumCulled = false; p.renderOrder = 3; scene.add(p);
  return { p, pos, age, shade, vel: new Float32Array(N * 3), life: new Float32Array(N), N, next: 0, live: 0 };
})();
function spawnSmoke(x, y, z, vx, vz, shade) {
  const F = FX.smoke, i = F.next = (F.next + 1) % F.N;
  F.pos.set([x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3], i * 3);
  F.vel.set([vx * (0.5 + Math.random()) + (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.9, vz * (0.5 + Math.random()) + (Math.random() - 0.5) * 1.2], i * 3);
  F.life[i] = 2.4 + Math.random() * 1.6; F.age[i] = 0.001; F.shade[i] = shade * (0.85 + Math.random() * 0.15);
  F.live = 4.5;
}
function updateSmoke(d) {
  const F = FX.smoke; if (F.live <= 0) return;
  F.live -= d;
  const wind = 0.6 * (WX.rain || 0) + 0.3;
  for (let i = 0; i < F.N; i++) {
    if (F.age[i] <= 0 || F.age[i] >= 1) continue;
    F.age[i] = Math.min(1, F.age[i] + d / F.life[i]);
    const k = Math.exp(-d * 1.6);
    F.vel[i * 3] *= k; F.vel[i * 3 + 2] *= k; F.vel[i * 3 + 1] = F.vel[i * 3 + 1] * Math.exp(-d * 0.6) + 0.15 * d;
    F.pos[i * 3] += (F.vel[i * 3] + wind) * d; F.pos[i * 3 + 1] += F.vel[i * 3 + 1] * d; F.pos[i * 3 + 2] += F.vel[i * 3 + 2] * d;
  }
  // points are sized in pixels: one metre at one metre away
  F.p.material.uniforms.uPx.value = renderer ? renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360)) * 0.9 : 600;
  const ga = F.p.geometry.attributes; ga.position.needsUpdate = true; ga.aAge.needsUpdate = true; ga.aShade.needsUpdate = true;
}
function spawnDebris(at, vel, n, mats, glass) {
  for (let k = 0; k < n; k++) {
    const p = FX.debris.find((x) => x.life <= 0) || FX.debris[Math.floor(Math.random() * FX.debris.length)];
    p.m.material = mats[k % mats.length]; p.m.visible = true; p.m.scale.setScalar(glass ? 0.6 + Math.random() * 0.6 : 0.7 + Math.random());
    p.m.position.set(at[0] + (Math.random() - 0.5) * 0.6, at[1] + Math.random() * 0.4, at[2] + (Math.random() - 0.5) * 0.6);
    p.v = [vel[0] + (Math.random() - 0.5) * 7, 1.5 + Math.random() * (glass ? 4 : 5), vel[1] + (Math.random() - 0.5) * 7];
    p.av = [(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30];
    p.life = 6 + Math.random() * 3;
  }
}
function spawnSparks(x, y, z, vx, vz, n) {
  const F = FX.sparks;
  for (let k = 0; k < n; k++) {
    const i = F.next = (F.next + 1) % F.n;
    F.pos.set([x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4], i * 3);
    F.vel.set([vx + (Math.random() - 0.5) * 6, 0.5 + Math.random() * 3, vz + (Math.random() - 0.5) * 6], i * 3);
    F.life[i] = 0.25 + Math.random() * 0.45;
  }
}
function spawnSplash(x, z, n) {
  const F = FX.splash;
  for (let k = 0; k < n; k++) {
    const i = F.next = (F.next + 1) % F.n, a = Math.random() * TAU, r = Math.random() * 2.5;
    F.pos.set([x + Math.cos(a) * r * 0.3, 0.1, z + Math.sin(a) * r * 0.3], i * 3);
    F.vel.set([Math.cos(a) * r * 1.5, 3 + Math.random() * 6, Math.sin(a) * r * 1.5], i * 3);
    F.life[i] = 0.8 + Math.random() * 0.8;
  }
}
function addSkid(x, z, psi, y) {
  const F = FX.skids, m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(Yv, psi);
  m4.compose(new THREE.Vector3(x, y + 0.012, z), q, new THREE.Vector3(1, 1, 1));
  F.im.setMatrixAt(F.next, m4); F.next = (F.next + 1) % F.N; F.im.count = Math.min(F.N, F.im.count + 1); F.im.instanceMatrix.needsUpdate = true;
}
function updateFX(d) {
  updateSmoke(d);
  for (const p of FX.debris) {
    if (p.life <= 0) continue;
    p.life -= d;
    p.v[1] -= G * d;
    p.m.position.x += p.v[0] * d; p.m.position.y += p.v[1] * d; p.m.position.z += p.v[2] * d;
    if (p.m.position.y < 0.08) { p.m.position.y = 0.08; p.v[1] = Math.abs(p.v[1]) * 0.3; p.v[0] *= 0.6; p.v[2] *= 0.6; p.av = p.av.map((a) => a * 0.5); }
    p.m.rotation.x += p.av[0] * d; p.m.rotation.y += p.av[1] * d; p.m.rotation.z += p.av[2] * d;
    if (p.life < 1) p.m.scale.multiplyScalar(Math.max(0.01, 1 - d * 2));
    if (p.life <= 0) p.m.visible = false;
  }
  for (const m of FX.pools) if (m.userData.grow < 1) { m.userData.grow = Math.min(1, m.userData.grow + d / 7); m.scale.setScalar((0.1 + 0.9 * Math.sqrt(m.userData.grow)) * (m.userData.size || 1)); }
  updateHurtVeil(d); fadeBlood(d);
  for (const [F, grav, hot] of [[FX.sparks, 9, true], [FX.splash, 9, false], [FX.blood, 9, 'blood']]) {
    let any = false;
    for (let i = 0; i < F.n; i++) {
      if (F.life[i] <= 0) { if (F.pos[i * 3 + 1] > -50) { F.pos[i * 3 + 1] = -100; any = true; } continue; }
      any = true;
      F.life[i] -= d; F.vel[i * 3 + 1] -= grav * d;
      F.pos[i * 3] += F.vel[i * 3] * d; F.pos[i * 3 + 1] += F.vel[i * 3 + 1] * d; F.pos[i * 3 + 2] += F.vel[i * 3 + 2] * d;
      const fl = hot === 'blood' ? F.floor[i] : 0.02;
      if (F.pos[i * 3 + 1] < fl) {
        F.pos[i * 3 + 1] = fl;
        if (hot === 'blood') {
          // blood doesn't bounce: it lands, leaves a splat and stops
          if (!F.landed[i]) { F.landed[i] = 1; if (Math.random() < 0.45) bloodSplat(F.pos[i * 3], fl, F.pos[i * 3 + 2], 0.05 + Math.random() * 0.13); }
          F.vel[i * 3] = 0; F.vel[i * 3 + 1] = 0; F.vel[i * 3 + 2] = 0; F.life[i] = Math.min(F.life[i], 0.15);
        } else { F.vel[i * 3 + 1] *= -0.3; F.vel[i * 3] *= 0.7; F.vel[i * 3 + 2] *= 0.7; }
      }
      const l = clamp(F.life[i] * 2, 0, 1);
      if (hot === 'blood') F.col.set([0.35 + 0.15 * l, 0.01, 0.02], i * 3);
      else if (hot) F.col.set([1, 0.55 + 0.45 * l, 0.15 + 0.6 * l * l], i * 3); else F.col.set([0.85 * l + 0.1, 0.92 * l + 0.05, 1 * l], i * 3);
    }
    if (any) { F.p.geometry.attributes.position.needsUpdate = true; F.p.geometry.attributes.color.needsUpdate = true; }
  }
}
function clearFX() {
  for (const p of FX.debris) { p.life = 0; p.m.visible = false; }
  for (const m of FX.pools) scene.remove(m); FX.pools.length = 0;
  FX.splats.im.count = 0; FX.splats.next = 0; hurtV = 0;
  for (const F of [FX.sparks, FX.splash, FX.blood]) { F.life.fill(0); for (let i = 0; i < F.n; i++) F.pos[i * 3 + 1] = -100; F.p.geometry.attributes.position.needsUpdate = true; }
  FX.skids.im.count = 0; FX.skids.next = 0;
  FX.smoke.age.fill(0); FX.smoke.live = 0.1;
}
let flashV = 0;
function flash(v) { flashV = Math.max(flashV, v); }

// ---------------------------------------------------------------- wanted level and police
function copNear(range) {
  for (const u of units) if (u.on && !u.player && !u.parked && u.kind !== 'car' && Math.hypot(u.x - S.x, u.z - S.z) < range) return true;
  if (typeof FCOPS !== 'undefined' && FCOPS.some((p) => !p.dead && Math.hypot(p.x - S.x, p.z - S.z) < range)) return true;
  return !!(heli && heli.on && Math.hypot(heli.x - S.x, heli.z - S.z) < 70);
}
function offense(amount) { if (copNear(70)) addHeat(amount, false); }
function addHeat(amount) {
  const before = stars();
  // a heads-up before the first star, so it never comes out of nowhere
  if (heat < 0.4 && heat + amount >= 0.4 && before === 0) popup('A cop saw that · calm down or you’ll get a star', 'cop');
  heat = Math.min(5.99, heat + amount);
  unseenT = 0;
  if (stars() > before) {
    popup(`${stars()} star${stars() > 1 ? 's' : ''}`, 'cop');
    const c = units.filter((u) => u.on && !u.player && !u.parked && u.kind !== 'car').sort((a, b) => Math.hypot(a.x - S.x, a.z - S.z) - Math.hypot(b.x - S.x, b.z - S.z))[0];
    if (c) sfx.whoop(c);
  }
  chaseMax = Math.max(chaseMax, stars()); maxStarsRun = Math.max(maxStarsRun, stars());
}
// How a stop goes, like real traffic police: first they light you up and tell you to pull over. Stop and you get a
// ticket. Keep going (or run for it) and it becomes a pursuit where they box you in; from 3 stars they ram and PIT you.
const PURSUIT = { phase: 'none', t: 0, stopT: 0, sayCd: 0 };
const MEGA_PULL = ['Pull over!', 'Rider, pull over to the right!', 'Stop the bike!', 'Pull over and stop your vehicle!', 'Pull it over, now.'];
const MEGA_CHASE = ['STOP THE BIKE!', 'You’re not getting away!', 'Pull over NOW!', 'Last warning!', 'Suspect fleeing on a motorbike!', 'Give it up!'];
const MEGA_RAM = ['Taking him out!', 'PIT, PIT, PIT!', 'Box him in!', 'Ram the bike!'];
function leadCop() {
  let best = null, bd = 1e9;
  for (const u of units) if (u.on && !u.player && !u.parked && u.kind !== 'car' && u.chasing) { const dd = Math.hypot(u.x - S.x, u.z - S.z); if (dd < bd) { bd = dd; best = u; } }
  return best ? [best, bd] : [null, 1e9];
}
function pulledOver(cop) {
  const fine = Math.min(banked, 250);
  banked -= fine;
  popup(`Pulled over · ticket${fine ? ` −${fine}` : ''}`, 'cop');
  say(cop, pick(Math.random, ['Here’s your ticket. Ride safe.', 'Slow it down out there.', 'Licence and registration… OK, you’re free to go.']), false);
  heat = 0; chaseMax = 0; PURSUIT.phase = 'none';
  for (const u of units) if (u.on && !u.player && !u.parked && u.kind !== 'car') { u.chasing = false; u.parkT = 5; }
}
function updatePursuit(d, st) {
  if (st === 0) { PURSUIT.phase = 'none'; return; }
  if (PURSUIT.phase === 'none') {
    Object.assign(PURSUIT, { phase: st >= 2 ? 'pursuit' : 'pullover', t: 0, stopT: 0, sayCd: 0.5 });
    popup(st >= 2 ? 'Police pursuit' : 'Cops are pulling you over · stop to take the ticket', 'cop');
  }
  PURSUIT.t += d; PURSUIT.sayCd -= d;
  const [lead, dist] = leadCop();
  if (PURSUIT.phase === 'pullover') {
    if (st >= 2) { PURSUIT.phase = 'pursuit'; return; }
    if (!lead) return;
    if (dist < 120) heat = Math.max(heat, 1.05);         // it doesn't fade while they're right behind you
    if (PURSUIT.sayCd <= 0 && dist < 70) { say(lead, pick(Math.random, MEGA_PULL), false); sfx.whoop(lead); PURSUIT.sayCd = 4.5; }
    if (S.v < 1.5 && dist < 75 && !S.crashed && !S.riding) { PURSUIT.stopT += d; if (PURSUIT.stopT > 3) { pulledOver(lead); return; } }
    else PURSUIT.stopT = Math.max(0, PURSUIT.stopT - d * 0.5);
    // didn't stop: failure to stop, now it's a chase
    if ((PURSUIT.t > 15 && dist < 90 && S.v > 4) || (PURSUIT.t > 5 && S.v > 22) || (PURSUIT.t > 3 && W.active && dist < 40)) {
      addHeat(Math.max(0.05, 2.05 - heat)); PURSUIT.phase = 'pursuit';
      popup('Failure to stop', 'cop'); say(lead, pick(Math.random, MEGA_CHASE), false); PURSUIT.sayCd = 3;
    }
  } else if (lead && PURSUIT.sayCd <= 0 && dist < 60) {
    say(lead, pick(Math.random, st >= 3 && lead.tac === 'ram' ? MEGA_RAM : MEGA_CHASE), false); PURSUIT.sayCd = 5 + Math.random() * 3;
  }
}
function updatePolice(d) {
  const st = stars();
  updatePursuit(d, st);
  for (const u of units) if (u.on && !u.player && !u.parked && u.kind !== 'car') {
    if (u.parkT > 0) { u.parkT -= d; continue; }
    if (st >= 1 && !u.chasing && Math.hypot(u.x - S.x, u.z - S.z) < 180) { u.chasing = true; u.next = null; u.tac = Math.random() < 0.6 ? 'ram' : 'box'; }
    if (st === 0) u.chasing = false;
  }
  const want = { cop: st >= 1 ? Math.min(5, st + 1) : 2, moto: Math.max(0, st - 2) };
  for (const kind of ['cop', 'moto']) {
    const have = units.filter((u) => u.on && u.kind === kind).length;
    if (have < want[kind] && Math.random() < d * 0.8) { const u = units.find((x) => !x.on && x.kind === kind); if (u && activate(u, false) && st >= 1) u.chasing = true; }
  }
  if (st >= 4 && !heli.on) {
    Object.assign(heli, { on: true, x: S.x - 150, y: 45, z: S.z - 150, vx: 0, vz: 0 });
    heli.g.visible = true; popup('Air support', 'cop');
  }
  if (st >= 1) {
    if (copNear(120) && !S.riding) unseenT = 0; else unseenT += d;
    if (unseenT > 6) heat = Math.max(0, heat - 0.35 * d);
    if (heat < 1 && chaseMax >= 1) {
      const bonus = 400 * chaseMax; banked += bonus; popup(`Lost them +${bonus.toLocaleString()}`, 'good');
      heat = 0; chaseMax = 0;
      for (const u of units) if (u.on && !u.player && !u.parked && u.kind !== 'car') u.chasing = false;
    }
  } else if (heat > 0 && !copNear(120)) heat = Math.max(0, heat - 0.05 * d);
  if (heli.on && st < 3 && Math.hypot(heli.x - S.x, heli.z - S.z) > 120) { heli.on = false; heli.g.visible = false; }
}
function updateUnits(d) {
  let cars = 0;
  const px = S.riding ? 1e9 : S.crashed && S.cb ? S.cb.x : S.x, pz = S.riding ? 1e9 : S.crashed && S.cb ? S.cb.z : S.z;
  for (const u of units) {
    if (!u.on || u.player) continue;               // (the car you're driving: drive.js moves it)
    const dist = Math.hypot(u.x - S.x, u.z - S.z);
    if (dist > 330) { deactivate(u); continue; }
    if (u.parked) continue;                          // a car you left: it stays put
    u.hitT -= d;
    const fx = Math.sin(u.yaw), fz = Math.cos(u.yaw);
    if (u.kind === 'car') {
      cars++;
      let target = u.hitT > 0 ? 0 : graphTarget(u);
      // you (or your wreck) in front of the bumper
      const dx = px - u.x, dz = pz - u.z, ahead = dx * fx + dz * fz, lat = Math.abs(-dx * fz + dz * fx);
      if (ahead > 1.5 && ahead < 14 && lat < 2) {
        target = Math.min(target, Math.max(0, (ahead - 5.5) * 0.9)); u.blockT += d;
        if (!S.crashed && u.blockT > 1.0 && u.honkCd <= 0) { u.honkCd = 3; sfx.horn(u); say(u, pick(Math.random, CURSES_BLOCKED), true); }
      } else u.blockT = 0;
      for (const o of units) {
        if (o === u || !o.on) continue;
        const ox = o.x - u.x, oz = o.z - u.z, a = ox * fx + oz * fz;
        if (a <= 0 || a > 24) continue;
        if (Math.abs(-ox * fz + oz * fx) > 1.8) continue;
        if (Math.sin(o.yaw) * fx + Math.cos(o.yaw) * fz < 0.3) continue;   // only cars going our way
        target = a < 7 ? 0 : Math.min(target, o.v + (a - 9) * 0.5);
      }
      u.honkCd -= d;
      driveGraph(u, d, Math.max(0, target));
    } else {
      u.freeCd = (u.freeCd || 0) - d;
      // overshot you: pull a U-turn instead of driving off round the block
      u.uturnCd = (u.uturnCd || 0) - d;
      if (u.chasing && u.mode === 'graph' && !S.crashed && u.uturnCd <= 0 && dist < 260 && (S.x - u.x) * fx + (S.z - u.z) * fz < -10) {
        u.dir = -u.dir; u.s = MAP.eLen[u.e] - u.s; u.next = null; u.yaw += Math.PI; u.v *= 0.25; u.uturnCd = 5;
      }
      const free = u.chasing && !S.crashed && dist < (u.kind === 'moto' ? 60 : 50) && u.freeCd <= 0;
      if (free && u.mode !== 'free') u.mode = 'free';
      if (!free && u.mode === 'free') { if (!snapToGraph(u)) { deactivate(u); continue; } }
      const top = Math.max((u.kind === 'moto' ? 24 : 21) + 0.8 * stars(), u.mode === 'graph' ? RC[MAP.eCls[u.e]].v * 1.35 : 0);
      // chasing cops close in and match your speed to box you in rather than ploughing into you;
      // patrols drive like traffic and brake for you
      let target = u.chasing ? (u.mode === 'free' ? Math.min(top, Math.max(0, S.v * 0.95 + (dist - 6) * 0.9)) : top) : graphTarget(u);
      // where it steers in the open: behind you to pull you over, at your back wheel to ram, else just ahead of you
      u.aimX = null;
      if (u.chasing && u.mode === 'free') {
        const bfx = Math.sin(S.psi), bfz = Math.cos(S.psi), [lead] = leadCop();
        if (PURSUIT.phase === 'pullover') {
          const back = u === lead ? 10 : 18;
          u.aimX = S.x - bfx * back; u.aimZ = S.z - bfz * back;
          target = Math.min(top, Math.max(0, S.v + (dist - back) * 0.8));
        } else if (stars() >= 3 && u.tac === 'ram' && !S.crashed) {
          // PIT: come up beside the back wheel and turn into it
          const side = ((u.x - S.x) * bfz - (u.z - S.z) * bfx) >= 0 ? 1 : -1;
          u.aimX = S.x - bfx * 0.8 + bfz * side * 0.9; u.aimZ = S.z - bfz * 0.8 - bfx * side * 0.9;
          target = Math.min(top + 4, S.v + (dist < 25 ? 7 : 12));
        } else if (!S.crashed) {
          // a normal pursuit (under 3 stars, or a boxing-in cop): come up alongside you and pace you, never into you
          const side = ((u.x - S.x) * bfz - (u.z - S.z) * bfx) >= 0 ? 1 : -1, behind = (u.x - S.x) * bfx + (u.z - S.z) * bfz < 0;
          u.aimX = S.x + bfx * 3 + bfz * side * 3.6; u.aimZ = S.z + bfz * 3 - bfx * side * 3.6;
          const gap = Math.hypot(u.aimX - u.x, u.aimZ - u.z);
          target = Math.min(top, Math.max(0, S.v + gap * 0.7));
          if (behind && dist < 7) target = Math.min(target, S.v * 0.85);     // right on your tail: back off, don't rear-end you
        }
      }
      if (u.parkT > 0) target = 0;
      if (!u.chasing) {
        const dx = S.x - u.x, dz = S.z - u.z, ahead = dx * fx + dz * fz, lat = Math.abs(-dx * fz + dz * fx);
        if (ahead > 1 && ahead < 14 && lat < 2.2) target = Math.min(target, Math.max(0, (ahead - 6) * 0.9));
      }
      if (u.hitT > 0) u.v *= Math.exp(-d * 3);
      if (u.mode === 'free') driveFree(u, d, target); else driveGraph(u, d, target);
      if (!u.on) continue;
      if (u.chasing && PURSUIT.phase !== 'pullover' && dist < 4 && S.v < 3 && !S.crashed && !S.riding) { u.bustT += d; if (u.bustT > 1.3) { busted(); return; } } else u.bustT = Math.max(0, u.bustT - d);
      const flashOn = Math.floor(performance.now() / 150) % 2 === 0;
      u.lights[0].material = u.chasing && flashOn ? carMats.red : carMats.off;
      u.lights[1].material = u.chasing && !flashOn ? carMats.blue : carMats.off;
    }
    const gp = u.g.position, k = Math.min(1, d * 12);
    gp.x += (u.x - gp.x) * k; gp.z += (u.z - gp.z) * k;
    gp.y = u.mode === 'graph' && u.e >= 0 ? roadY(RC[MAP.eCls[u.e]].rank) : 0.05;
    u.g.rotation.y += wrapPi(u.yaw - u.g.rotation.y) * Math.min(1, d * 9);
    u.rock = (u.rock || 0) * Math.exp(-d * 2.5);
    u.body.rotation.z = Math.sin(simTime * 18) * u.rock; u.body.rotation.x = Math.sin(simTime * 13) * u.rock * 0.5;
  }
  if (cars < C.traffic * (quality === 'low' ? 0.7 : quality === 'ultra' ? 1.4 : 1) && Math.random() < d * 3) { const u = units.find((x) => !x.on && x.kind === 'car'); if (u) activate(u, false); }
  if (heli.on) {
    const tx = S.x + Math.sin(S.psi) * S.v * 1.2, tz = S.z + Math.cos(S.psi) * S.v * 1.2;
    const dx = tx - heli.x, dz = tz - heli.z, dd = Math.hypot(dx, dz) || 1;
    const topv = 20 + 2 * stars(), sp = Math.min(topv, dd * 0.9);
    heli.vx += ((dx / dd) * sp - heli.vx) * Math.min(1, d * 1.2); heli.vz += ((dz / dd) * sp - heli.vz) * Math.min(1, d * 1.2);
    heli.x += heli.vx * d; heli.z += heli.vz * d; heli.y += (55 - heli.y) * Math.min(1, d);
    heli.g.position.set(heli.x, heli.y, heli.z);
    heli.g.rotation.y = Math.atan2(heli.vx, heli.vz); heli.g.rotation.x = Math.min(0.25, Math.hypot(heli.vx, heli.vz) * 0.012);
    heli.rotor.rotation.y += d * 30;
    heli.red.visible = Math.floor(performance.now() / 500) % 2 === 0;
  }
}
function busted() {
  popup('BUSTED', 'cop');
  if (FOOT.on) {
    // arrested on foot: weapons taken, a fine out of your cash, back to the bike
    if (FOOT.store) leaveStore();
    const f = Math.round(cash * 0.15); if (f) { addCash(-f); popup(`Fine −$${f}`, 'bad'); }
    if (Object.keys(FOOT.has).some((k) => k !== 'fists' && FOOT.has[k])) popup('Weapons confiscated', 'bad');
    FOOT.has = { fists: true }; FOOT.mag = {}; FOOT.res = {}; FOOT.weapon = 'fists'; saveGuns();
    hopOn();
  }
  const fine = Math.min(banked, 600 * stars());
  if (fine) { banked -= fine; popup(`Fine −${fine.toLocaleString()}`, 'bad'); }
  heat = 0; chaseMax = 0;
  for (const u of units) if (u.on && !u.player && !u.parked && u.kind !== 'car') { u.chasing = false; if (Math.hypot(u.x - S.x, u.z - S.z) < 40) deactivate(u); }
  bails--; renderBails();
  S.crashReason = 'Busted';
  if (bails <= 0) { gameOver(); return; }
  respawn();
}

// ---------------------------------------------------------------- angry drivers
const CURSES = ['WATCH IT!', 'Are you KIDDING me?!', '@#$%&!!', 'Learn to ride!', '#@!% e-bikes!', 'MOVE IT!', 'Unbelievable…', 'Two wheels, zero brains!', 'Nice wheelie, IDIOT!', 'I\'m calling the cops!'];
const CURSES_BLOCKED = ['MOVE!', 'Get off the road!', 'GREEN means GO!', 'Some of us have JOBS!', '@#$%! Move it!', 'Ride on the sidewalk, genius!'];
const CURSES_HIT = ['MY CAR!!', 'You @#$%&!!', 'That\'s coming out of your pocket!', 'Are you blind?!', 'Somebody call 911!'];
const bubbles = [];
function say(u, text, honk) {
  const el = document.createElement('div');
  el.className = `bubble${honk ? ' honk' : ''}`; el.textContent = honk ? `HONK! ${text}` : text;
  $('#bubbles').appendChild(el);
  bubbles.push({ el, u, until: performance.now() + 2300 });
  while (bubbles.length > 5) { const b = bubbles.shift(); b.el.remove(); }
}
const proj = new THREE.Vector3();
function updateBubbles() {
  const now = performance.now(), W2 = stage.clientWidth, H2 = stage.clientHeight;
  for (let k = bubbles.length - 1; k >= 0; k--) {
    const b = bubbles[k];
    if (now > b.until || !b.u.on) { b.el.remove(); bubbles.splice(k, 1); continue; }
    proj.set(b.u.g.position.x, 2.4, b.u.g.position.z).project(camera);
    if (proj.z > 1 || Math.abs(proj.x) > 1.1 || Math.abs(proj.y) > 1.1) { b.el.style.display = 'none'; continue; }
    b.el.style.display = '';
    b.el.style.left = `${(proj.x * 0.5 + 0.5) * W2}px`; b.el.style.top = `${(-proj.y * 0.5 + 0.5) * H2}px`;
    b.el.style.opacity = String(Math.min(1, (b.until - now) / 400));
  }
}
function popup(text, cls) {
  const el = document.createElement('div'); el.className = `pop ${cls || ''}`; el.textContent = text;
  const feed = $('#feed'); feed.prepend(el);
  while (feed.children.length > 4) feed.lastChild.remove();
  setTimeout(() => el.remove(), 1850);
}

// ---------------------------------------------------------------- flow
function show(id) { for (const p of ['#start', '#pause', '#over']) $(p).hidden = p !== id; }
function begin(fresh) {
  if (!mapReady) return;
  if (fresh) startRide();
  state = 'play'; show(null); $('#hud').hidden = false;
  setPov(pov);
  sfx.init().then(() => sfx.setBike()); lockPointer(); last = performance.now();
}
function pause() {
  if (state !== 'play') return;
  state = 'pause'; keys.clear(); show('#pause');
  if (document.pointerLockElement) document.exitPointerLock();
}
function toMenu() {
  state = 'menu'; show('#start'); $('#hud').hidden = true; mapOpen = false; $('#bigmap').hidden = true;
  for (const b of bubbles) b.el.remove(); bubbles.length = 0;
  if (document.pointerLockElement) document.exitPointerLock();
  buildBike(); if (MAP) resetWorld(); setPov(pov);
}
function gameOver() {
  state = 'over';
  const key = `wc-best-${cityKey}`, best = Math.max(store.get(key, 0), banked);
  store.set(key, best);
  $('#oScore').textContent = banked.toLocaleString();
  $('#oLong').textContent = `${Math.round(longest)} m`;
  $('#oStars').textContent = '★'.repeat(maxStarsRun) || '0';
  $('#oTop').textContent = `${Math.round(topSpeed * 3.6)} km/h`;
  $('#oNear').textContent = nearMisses;
  $('#oBest').textContent = best.toLocaleString();
  $('#overReason').textContent = `${S.crashReason || 'Out of bails'} · ${C.name}`;
  S.scrape = 0; S.bodySlide = 0; S.skid = 0;
  show('#over');
  if (document.pointerLockElement) document.exitPointerLock();
}
$('#go').addEventListener('click', () => begin(true));
$('#resume').addEventListener('click', () => begin(false));
$('#toMenu').addEventListener('click', toMenu);
$('#again').addEventListener('click', () => begin(true));
$('#overMenu').addEventListener('click', toMenu);

// ---------------------------------------------------------------- rig placement, dash, cameras
const camPos = new THREE.Vector3(), lookAt = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
let last = performance.now(), menuT = 0, hudT = 0, dashT = 0, hintUntil = 0, mapT = 0, camSnap = true;

function placeRig(dt) {
  const B = BIKES[bikeKey], r = rig.root;
  r.rotation.order = 'YXZ';
  if (FOOT.on && FOOT.park) {
    // parked where you left it, leaning on its stand
    const P = FOOT.park; r.position.set(P.x, P.y + B.R, P.z); r.rotation.set(0, P.psi, 0.12);
    rig.body.position.set(0, 0, 0); rig.body.rotation.set(0, 0, 0);
    return;
  }
  if (S.crashed && S.cb) {
    r.position.set(S.cb.x, S.cb.y, S.cb.z);
    r.rotation.set(S.cb.rx, S.cb.ry, S.cb.rz);
    rig.body.position.set(0, 0, 0); rig.body.rotation.set(0, 0, 0);
    if (rig.ragdoll && S.cr) {
      rig.ragdoll.position.set(S.cr.x, S.cr.y, S.cr.z);
      rig.ragdoll.rotation.order = 'YXZ'; rig.ragdoll.rotation.set(S.cr.rx, S.cr.ry, S.cr.rz);
      // limbs flail while airborne, then go limp
      const t = S.crashT * 9, f = S.cr.flail;
      rig.armL.rotation.set(-1.2 + Math.sin(t * 1.3) * 1.6 * f, Math.sin(t * 0.7) * 0.6 * f, 0.6 + Math.sin(t) * 0.9 * f);
      rig.armR.rotation.set(-1.0 + Math.sin(t * 1.1 + 2) * 1.6 * f, Math.sin(t * 0.9 + 1) * 0.6 * f, -0.6 - Math.sin(t + 1) * 0.9 * f);
      rig.legL.rotation.set(-0.6 + Math.sin(t * 0.9 + 0.5) * 1.1 * f, 0, 0.3 + Math.sin(t * 0.8) * 0.5 * f);
      rig.legR.rotation.set(-0.4 + Math.sin(t * 1.2 + 1.5) * 1.1 * f, 0, -0.3 - Math.sin(t * 0.7 + 1) * 0.5 * f);
      rig.head.rotation.set(Math.sin(t * 0.8) * 0.5 * f, Math.sin(t * 0.6) * 0.6 * f, 0);
      rig.upper.rotation.set(-0.4 + Math.sin(t * 0.5) * 0.4 * f, 0, Math.sin(t * 0.7) * 0.3 * f);
    }
  } else {
    r.position.set(S.x, S.y + B.R, S.z);
    const roll = clamp(S.roll || 0, -0.85, 0.85) * (S.theta > 0.12 ? 0.6 : 1);
    r.rotation.set(-S.theta, S.psi, roll);
    rig.body.position.y = S.theta > 0.05 ? 0 : -Math.abs(S.susp) * 0.3;
    rig.body.rotation.x = S.theta > 0.05 ? 0 : clamp(S.susp, -0.04, 0.04);
    const P = S.vis || freshVis();
    rig.upper.rotation.x = -S.lean * 0.22 + 0.2 * P.stand;
    rig.rider.position.y = rig.riderHome.p.y + 0.32 * P.stand;
    rig.armL.rotation.set(-1.9 * P.nohand, 0, 0.5 * P.nohand);
    rig.armR.rotation.set(-1.9 * P.nohand, 0, -0.5 * P.nohand);
    rig.legL.rotation.set(0.7 * P.nofoot - 1.5 * P.high + 0.35 * P.stand, 0, 0.8 * P.nofoot + 0.25 * P.high);
    rig.legR.rotation.set(0.7 * P.nofoot - 1.5 * P.high + 0.35 * P.stand - 0.9 * P.knee, 0, -0.8 * P.nofoot - 0.25 * P.high + 0.5 * P.knee);
  }
  const spin = S.crashed ? 0 : S.v * dt;
  rig.wheels[0].rotation.x += (spin + (S.crashed ? 0 : (S.burnSpin || 0) * dt)) / B.R; rig.wheels[1].rotation.x += spin / (B.Rf || B.R);
  if (rig.model) updateRiderModel(rig);        // the realistic body follows the posed guide rider (people.js)
}
function drawDash() {
  const g = rig.dashCv.getContext('2d'), B = BIKES[bikeKey];
  g.fillStyle = '#05070a'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#e8f6ff'; g.font = '700 64px "Chakra Petch", monospace'; g.textAlign = 'left';
  g.fillText(String(Math.round(S.v * 3.6)).padStart(3, ' '), 6, 70);
  g.font = '700 18px "Chakra Petch", monospace'; g.fillStyle = '#7f8c96'; g.fillText('KM/H', 14, 100);
  g.textAlign = 'right';
  if (B.type === 'gas') { g.fillStyle = '#37e0cf'; g.font = '700 44px "Chakra Petch", monospace'; g.fillText(String(S.gear), 242, 58); g.fillStyle = S.rpm > B.engine.redline * 0.9 ? '#ff5a4e' : '#ff3d7f'; g.fillRect(150, 86, 92 * S.rpm / B.engine.redline, 14); }
  else { const deg = Math.round((PHI0 + S.theta) * 180 / Math.PI); g.fillStyle = S.theta > 0.15 ? '#37e0cf' : '#7f8c96'; g.font = '700 38px "Chakra Petch", monospace'; g.fillText(`${deg}°`, 242, 62); g.fillStyle = '#ff3d7f'; g.fillRect(150, 86, 92 * S.thr, 14); }
  g.strokeStyle = '#7f8c96'; g.lineWidth = 2; g.strokeRect(150, 86, 92, 14);
  rig.dashTex.needsUpdate = true;
}
function updateCamera(dt) {
  const B = BIKES[bikeKey], fx = Math.sin(S.psi), fz = Math.cos(S.psi), rx = -fz, rz = fx;
  const inPlay = state === 'play' || state === 'pause' || state === 'over';
  const firstish = inPlay && (pov === 'first' || pov === 'chest');
  rig.head.visible = !(inPlay && pov === 'first' && !(S.crashed && reduceMotion));
  let fovT = 66 + Math.min(16, S.v * 0.45);
  let up = 0;
  if (state === 'wardrobe') {
    wardrobeCamera(); fovT = camera.fov;
  } else if (FOOT.on && state !== 'menu') {
    footCamera(dt); fovT = camera.fov;
  } else if ((WALK.on || (S.riding && RIDE.train)) && state !== 'menu') {
    transitCamera(dt); fovT = camera.fov;
  } else if (state === 'menu') {
    menuT += dt * 0.25;
    const a = S.psi + Math.PI * 0.75 + Math.sin(menuT) * 0.7;
    tmp.set(S.x + Math.sin(a) * 4.4, 1.6, S.z + 0.6 + Math.cos(a) * 4.4);
    camPos.lerp(tmp, Math.min(1, dt * 2));
    lookAt.lerp(tmp2.set(S.x + fx * 0.6, 0.8, S.z + fz * 0.6), Math.min(1, dt * 4));
    camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(lookAt);
  } else if (S.crashed && S.cr) {
    const cr = S.cr;
    if (pov === 'first' && !reduceMotion && S.crashT < 2.4) {
      // helmet cam stays in the helmet
      rig.eye.getWorldPosition(tmp); rig.eye.getWorldQuaternion(tmpQ);
      camera.position.copy(tmp); camera.quaternion.copy(tmpQ); camera.rotateY(Math.PI);
      fovT = 92;
    } else {
      lookAt.lerp(tmp.set(cr.x, Math.max(0.3, cr.y), cr.z), Math.min(1, dt * 6));
      const dx = camPos.x - cr.x, dz = camPos.z - cr.z, dl = Math.hypot(dx, dz) || 1, want = pov === 'far' || pov === 'drone' ? 11 : 6;
      tmp2.set(cr.x + dx / dl * want, Math.max(1.6, cr.y + 2.2), cr.z + dz / dl * want);
      camPos.lerp(tmp2, Math.min(1, dt * 2.5));
      camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(lookAt);
    }
  } else if (pov === 'first' || pov === 'chest') {
    rig.root.updateMatrixWorld(true);
    (pov === 'first' ? rig.eye : rig.chest).getWorldPosition(tmp);
    camera.position.copy(tmp);
    const p = S.theta * 0.6 + S.lean * 0.05 - (pov === 'chest' ? 0.28 : 0.1);
    tmp2.set(fx * Math.cos(p), Math.sin(p), fz * Math.cos(p)).add(tmp);
    camera.up.set(0, 1, 0); camera.lookAt(tmp2); camera.rotateZ(-clamp(S.roll || 0, -0.8, 0.8) * 0.8);
    camPos.copy(tmp); lookAt.copy(tmp2);
    fovT = (pov === 'first' ? 82 : 92) + Math.min(12, S.v * 0.35);
  } else if (pov === 'bars') {
    rig.root.updateMatrixWorld(true);
    rig.barCam.getWorldPosition(tmp); rig.head.getWorldPosition(tmp2);
    camera.position.copy(tmp); camera.up.set(0, 1, 0); camera.lookAt(tmp2.add(tmp.clone().sub(tmp2).multiplyScalar(-0.2)).setY(tmp2.y - 0.25));
    camPos.copy(tmp); lookAt.copy(tmp2);
    fovT = 88;
  } else if (pov === 'tv') {
    const q = S.tv;
    const d = q ? Math.hypot(q.x - S.x, q.z - S.z) : 1e9, behind = q ? (q.x - S.x) * fx + (q.z - S.z) * fz < -8 : true;
    if (!q || d > 85 || (behind && d > 30)) {
      const side = Math.random() < 0.5 ? -1 : 1, ahead = 30 + S.v * 1.6;
      let x = S.x + fx * ahead + rx * 9 * side, z = S.z + fz * ahead + rz * 9 * side;
      if (buildingAt(x, z, 1) >= 0) { x = S.x + fx * ahead + rx * 4 * side; z = S.z + fz * ahead + rz * 4 * side; }
      S.tv = { x, z, y: 1.3 + Math.random() * 3 };
    }
    camPos.set(S.tv.x, S.tv.y, S.tv.z); camera.position.copy(camPos);
    lookAt.lerp(tmp.set(S.x, S.y + 1.0, S.z), Math.min(1, dt * 8)); camera.up.set(0, 1, 0); camera.lookAt(lookAt);
    fovT = clamp(2 * Math.atan(3.2 / Math.max(1, Math.hypot(S.tv.x - S.x, S.tv.z - S.z))) * 180 / Math.PI, 8, 70);
  } else {
    let back = 5.4, high = 2.1, look = 6, lat = 0;
    if (pov === 'far') { back = 11; high = 4.2; look = 10; }
    if (pov === 'side') { back = 1.2; high = 1.25; lat = 4.6; look = 1.5; }
    if (pov === 'drone') { back = 9; high = 24; look = 8; }
    tmp.set(S.x - fx * back + rx * lat, S.y + high + S.theta * 0.5, S.z - fz * back + rz * lat);
    // keep the camera on your side of any wall: march from the rider out to where the camera wants to be
    if (pov !== 'drone') {
      const sx = S.x, sz = S.z, dx = tmp.x - sx, dz = tmp.z - sz, dist = Math.hypot(dx, dz);
      let ok = dist;
      for (let k = 0.5; k <= dist + 0.6; k += 0.5) if (buildingAt(sx + dx / dist * k, sz + dz / dist * k, 0.35) >= 0) { ok = Math.max(0.4, k - 0.7); break; }
      if (ok < dist) { tmp.x = sx + dx / dist * ok; tmp.z = sz + dz / dist * ok; tmp.y += (dist - ok) * 0.35; }
    }
    if (camSnap) { camPos.copy(tmp); lookAt.set(S.x + fx * look, S.y + 1, S.z + fz * look); }
    camPos.lerp(tmp, 1 - Math.exp(-dt * (pov === 'side' ? 8 : 5)));
    if (pov !== 'drone' && buildingAt(camPos.x, camPos.z, 0.3) >= 0) camPos.copy(tmp);
    lookAt.lerp(tmp2.set(S.x + fx * look, S.y + 1.0 + S.theta * 0.6, S.z + fz * look), 1 - Math.exp(-dt * 8));
    camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(lookAt);
    if (pov === 'side') fovT = 58;
    if (pov === 'drone') fovT = 55;
  }
  // camera shake on impacts
  if (S.shake > 0.002) {
    const s = S.shake;
    camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s * 0.7; camera.position.z += (Math.random() - 0.5) * s;
    camera.rotateZ((Math.random() - 0.5) * s * 0.15);
    S.shake *= Math.exp(-dt * 5);
  }
  camera.fov += (fovT - camera.fov) * Math.min(1, camSnap ? 1 : dt * 3); camera.updateProjectionMatrix();
  camSnap = false;
  void up; void firstish;
  // world things that follow the camera
  sky.position.copy(camera.position);
  backdrop.position.set(camera.position.x, 0, camera.position.z);
  clouds.grp.position.set(camera.position.x, 0, camera.position.z);
  // sunlight from the photographed sky's sun (a low sun still lights from low, but not from under the horizon)
  const sy = Math.max(0.12, SUN.y);
  updateWorld();
  dirL.position.set(S.x + SUN.x * 200, sy * 200, S.z + SUN.z * 200); dirL.target.position.set(S.x, 0, S.z);
  headlight.position.set(S.x + fx * 0.9, 1.0, S.z + fz * 0.9); headlight.target.position.set(S.x + fx * 25, 0, S.z + fz * 25);
  if (rain) {
    rain.position.set(camera.position.x, 0, camera.position.z);
    const pa = rain.geometry.attributes.position, arr = pa.array, fall = dt * 22;
    for (let i = 0; i < arr.length; i += 6) { arr[i + 1] -= fall; arr[i + 4] -= fall; if (arr[i + 1] < 0) { arr[i + 1] += 30; arr[i + 4] += 30; } }
    pa.needsUpdate = true;
  }
  if (heli) {
    const lit = heli.on;
    heli.beam.visible = lit;
    heli.spot.intensity = lit ? (C.night || C.dusk ? 3 : 1.2) : 0;
    if (lit) {
      heli.spot.position.set(heli.x, heli.y - 1, heli.z); heli.spot.target.position.set(S.x, 0, S.z);
      const dx = S.x - heli.x, dy = -(heli.y - 1), dz = S.z - heli.z, len = Math.hypot(dx, dy, dz);
      heli.beam.position.set(heli.x, heli.y - 1, heli.z);
      heli.beam.scale.set(1, len / 40, 1);
      heli.beam.quaternion.setFromUnitVectors(tmp.set(0, -1, 0), tmp2.set(dx / len, dy / len, dz / len));
    }
  }
  // flashing light from the nearest chasing cop, at night or dusk
  let near = null, nd = 60;
  for (const u of units) if (u.on && u.chasing) { const d = Math.hypot(u.x - S.x, u.z - S.z); if (d < nd) { nd = d; near = u; } }
  if (near && (C.night || C.dusk || WX.cloud > 0.6)) { const on = Math.floor(performance.now() / 150) % 2; copLight.color.set(on ? '#ff2236' : '#2b6bff'); copLight.intensity = 2.5; copLight.position.set(near.x, 2.2, near.z); }
  else copLight.intensity = 0;
}

// ---------------------------------------------------------------- HUD
function gaugeArc(d0, d1, r = 92) {
  const P = (deg) => { const a = (180 - deg) * Math.PI / 180; return [110 + r * Math.cos(a), 112 - r * Math.sin(a)]; };
  const [x0, y0] = P(d0), [x1, y1] = P(d1);
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
$('#gArc').setAttribute('d', gaugeArc(0, 135));
$('#gSweet').setAttribute('d', gaugeArc(SWEET[0] * 180 / Math.PI, SWEET[1] * 180 / Math.PI));
$('#gDanger').setAttribute('d', gaugeArc(103, 135));

const mapCtx = $('#minimap').getContext('2d');
function drawMinimap() {
  drawMiniMap(mapCtx, 170, 0.42, S.x, S.z, S.psi, (P) => {
    const fl = Math.floor(performance.now() / 250) % 2;
    for (const u of units) {
      if (!u.on) continue;
      const [px, py] = P(u.x, u.z);
      mapCtx.fillStyle = u.kind === 'car' ? 'rgba(243,239,231,.6)' : (fl ? '#ff2236' : '#2b6bff');
      mapCtx.beginPath(); mapCtx.arc(px, py, u.kind === 'car' ? 2 : 3.5, 0, TAU); mapCtx.fill();
    }
    if (heli && heli.on) { const [px, py] = P(heli.x, heli.z); mapCtx.strokeStyle = fl ? '#ff2236' : '#2b6bff'; mapCtx.lineWidth = 2; mapCtx.beginPath(); mapCtx.moveTo(px - 5, py); mapCtx.lineTo(px + 5, py); mapCtx.moveTo(px, py - 5); mapCtx.lineTo(px, py + 5); mapCtx.stroke(); }
    drawRouteMini(mapCtx, P);
  });
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function updateHUD(dt) {
  const B = BIKES[bikeKey];
  const phiDeg = (PHI0 + S.lean * 0.2 + S.theta) * 180 / Math.PI;
  const shown = clamp(phiDeg, 0, 135), a = (180 - shown) * Math.PI / 180;
  $('#gNeedle').setAttribute('x2', (110 + 80 * Math.cos(a)).toFixed(1));
  $('#gNeedle').setAttribute('y2', (112 - 80 * Math.sin(a)).toFixed(1));
  $('#gText').textContent = `${Math.round(S.theta * 180 / Math.PI)}°`;
  const wEl = $('#wheelie');
  if (W.active && W.dist > 1) {
    wEl.hidden = false;
    $('#wDist').textContent = Math.round(W.dist);
    const sweet = phiDeg > SWEET[0] * 180 / Math.PI && phiDeg < SWEET[1] * 180 / Math.PI;
    const live = TRICKS.filter((t) => S.tricks[t.key].on).map((t) => t.name);
    const n = W.used ? W.used.size : 0;
    $('#wPts').textContent = `+${Math.round(W.pts + (W.trickPts || 0)).toLocaleString()}${n >= 2 ? ` ×${(1 + 0.5 * (n - 1)).toFixed(1)}` : ''}`;
    $('#wTag').textContent = live.length ? live.join(' + ') : sweet ? 'Balance point ×2' : phiDeg > 100 ? 'Too far back!' : n ? 'Chain another trick for ×' + (1 + 0.5 * n).toFixed(1) : '';
  } else wEl.hidden = true;
  const hint = $('#hint');
  if (performance.now() < hintUntil && !W.active) { hint.hidden = false; hint.textContent = B.type === 'gas' ? 'Roll in first or second, lean back (pull the mouse toward you), rev it and tap Space to dump the clutch. N opens the city map.' : 'Roll slow, lean back (pull the mouse toward you) and hold W, or tap Space to pop it up. N opens the city map.'; } else hint.hidden = true;
  $('#hud').classList.toggle('transit', WALK.on || RIDE.on);
  updateBubbles();
  navTick(dt);
  mapT += dt; if (mapT > 0.1) { mapT = 0; drawMinimap(); }
  // gear / rpm
  if (B.type === 'gas') {
    $('#gear').textContent = S.v < 0.3 && S.thr < 0.05 ? 'N' : String(S.gear);
    $('#rpmBar').hidden = false;
    $('#rpmFill').style.width = `${clamp(S.rpm / B.engine.redline, 0, 1) * 100}%`;
    $('#rpmBar').classList.toggle('red', S.rpm > B.engine.redline * 0.92);
  } else { $('#gear').textContent = ''; $('#rpmBar').hidden = true; }
  hudT += dt; if (hudT < 0.12) return; hudT = 0;
  $('#spd').textContent = Math.round(S.v * 3.6);
  // street name: on a road, its name and highway shield; otherwise sidewalk / park / beach
  let street = '';
  const q = roadQuery(S.x, S.z, 10);
  if (WALK.on) {
    street = `${esc(WALK.st.name)} station<span class="shield">${esc(TRANSIT[cityKey] || 'Transit')}</span>`;
  } else if (S.riding && RIDE.train) {
    const t = RIDE.train, ln = MAP.lines[t.line], a = ln.stations[0], b = ln.stations[ln.stations.length - 1];
    street = `${esc(TRANSIT[cityKey] || 'Train')}<span class="shield">${esc((t.dir > 0 ? b : a).name)}</span>`;
  } else if (q.e >= 0 && (q.in || q.d < q.hw + 3)) {
    const lb = roadLabel(q.e);
    street = `${esc(q.in ? lb.name : 'Sidewalk · ' + (lb.name || lb.ref))}${lb.ref && q.in ? `<span class="shield">${esc(lb.ref)}</span>` : ''}`;
  } else {
    const lc = landAt(S.x, S.z);
    street = lc === 2 ? 'Park' : lc === 3 ? 'Woods' : lc === 4 ? 'Beach' : lc === 6 ? 'Front yards' : lc === 1 ? 'Water' : 'Off road';
  }
  $('#street').innerHTML = street;
  // neighbourhood and municipality; announce when you cross into a new city
  S.muniT -= 0.12;
  if (S.muniT <= 0) {
    S.muniT = 0.6;
    const mu = muniAt(S.x, S.z), pl = placeAt(S.x, S.z);
    if (mu && mu !== S.muni) { if (S.muni) popup(`Entering ${mu}`, 'place'); S.muni = mu; }
    $('#where').innerHTML = `${pl && pl !== mu ? `${esc(pl)} · ` : ''}<b>${esc(mu || C.name)}</b> · ${esc(B.brand)} ${esc(B.name)}`;
  }
  $('#score').textContent = banked.toLocaleString();
  $('#best').textContent = Math.max(store.get(`wc-best-${cityKey}`, 0), banked).toLocaleString();
  $('#longest').textContent = Math.round(longest);
  const st = stars(), starEls = $('#stars').children;
  for (let k = 0; k < 5; k++) starEls[k].className = k < st ? 'on' : '';
  $('#stars').classList.toggle('hot', st > 0 && copNear(140));
}

// ---------------------------------------------------------------- main loop
function frame(now) {
  requestAnimationFrame(frame);
  const rawMs = now - last, dt = clamp(rawMs / 1000, 0, 0.05); last = now;
  if (!MAP || !rig) { if (renderer) renderer.render(scene, camera); return; }
  governFrame(rawMs, state === 'play' && !mapOpen && rawMs < 500);
  if (state === 'play' && !mapOpen && FOOT.menu) { /* a menu (store, market) is open: the world waits */ }
  else if (state === 'play' && !mapOpen) {
    if (S.hitStop > 0) { S.hitStop -= dt; }
    else {
      const ts = S.crashed && S.crashT < 0.7 && !reduceMotion ? 0.35 : 1;
      let rem = dt * ts;
      simTime += rem;
      while (rem > 1e-6) {
        const d = Math.min(1 / 120, rem);
        if (FOOT.on) footStep(d); else if (!S.riding && !WALK.on) step(d);
        if (state !== 'play') break;
        updateUnits(d); if (state !== 'play') break;
        updatePolice(d);
        rem -= d;
      }
      updateFX(dt * ts);
      updatePeds(dt * ts);
      updateTrains(dt * ts);
      if (state === 'play') updateTransit(dt);
      updateWeather(dt, (msg) => popup(msg, ''));
    }
    const fx = S.crashed && S.cb ? S.cb.x : S.x, fz = S.crashed && S.cb ? S.cb.z : S.z;
    updateTiles(fx, fz, false);
    if (state === 'play') { updateHUD(dt); footFrame(dt); }
    dashT += dt; if (dashT > 0.1) { dashT = 0; drawDash(); }
  } else if (state === 'play' && mapOpen) { drawBigMap(); }
  else if (state === 'menu') { updateTiles(S.x, S.z, false); simTime += dt; updateWeather(dt, null); }
  else if (state === 'wardrobe') updateWardrobe(dt);
  updateSignals(simTime);
  placeRig(state === 'play' && !mapOpen ? dt : 0);
  updateCamera(dt);
  flashV *= Math.exp(-dt * 4);
  $('#flash').style.opacity = String(flashV);
  sfx.update(dt);
  renderScene();
}

// ---------------------------------------------------------------- start
if (!renderer) {
  $('#lockNote').hidden = false; $('#lockNote').textContent = 'This browser could not start WebGL, which the game needs. Try Chrome, Edge or Firefox with hardware acceleration on.';
} else {
  applyQuality(); applySize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage); else addEventListener('resize', resize);
  buildCards();
  setPov(pov);
  setupSky();
  buildBike();
  loadCity(cityKey);
  requestAnimationFrame(frame);
}
