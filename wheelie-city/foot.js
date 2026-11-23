// Wheelie City — on foot: hop off the bike, walk the streets, fight, rob people, walk into stores.
// F gets off (the bike stays parked) and back on. WASD moves (camera-relative), Shift sprints, the mouse looks.
// 1 fists, 2 knife, 3 pistol; click to punch / slash / shoot, hold the right button to aim. E robs the person in front
// of you, or walks into the shop in front of you. Everyone reacts, and the police hear about it.
'use strict';

const FOOT = {
  on: false, x: 0, z: 0, y: 0, yaw: 0, camYaw: 0, camPitch: 0.18, v: 0, hp: 100, armor: 0, weapon: 'fists',
  has: { fists: true }, mag: {}, res: {}, atkCd: 0, combo: 0, aiming: false, fire: false, fireHeld: false,
  fig: null, park: null, store: null, menu: false, flashT: 0, hurtCd: 0, downT: 0,
};
// clip / ammo always mean the weapon in your hand: its magazine and the rounds you carry for it
Object.defineProperty(FOOT, 'clip', { get() { return this.mag[this.weapon] || 0; }, set(v) { this.mag[this.weapon] = v; } });
Object.defineProperty(FOOT, 'ammo', { get() { return this.res[this.weapon] || 0; }, set(v) { this.res[this.weapon] = v; } });
let cash = store.get('wc-cash', 100);
// slot: the number key; model: what's in your hand; pellets / spread for the shotgun; auto keeps firing while held
const WEAPONS = {
  fists: { name: 'Fists', slot: 1, range: 1.5, dmg: 22, cd: 0.42 },
  knife: { name: 'Knife', slot: 2, range: 1.7, dmg: 60, cd: 0.6 },
  pistol: { name: 'Pistol', slot: 3, gun: true, model: 'pistol', range: 90, dmg: 70, cd: 0.28, clipSize: 12, price: 350, ammoPrice: 40 },
  glock: { name: 'Glock 19', slot: 3, gun: true, model: 'pistol', range: 80, dmg: 55, cd: 0.17, clipSize: 15, price: 250, ammoPrice: 35 },
  deagle: { name: 'Desert Eagle', slot: 3, gun: true, model: 'pistol', range: 100, dmg: 130, cd: 0.5, clipSize: 7, price: 650, ammoPrice: 60 },
  uzi: { name: 'Uzi', slot: 4, gun: true, auto: true, model: 'smg', range: 60, dmg: 28, cd: 0.07, clipSize: 32, spread: 0.035, price: 900, ammoPrice: 70 },
  ak: { name: 'AK-47', slot: 4, gun: true, auto: true, model: 'rifle', range: 140, dmg: 45, cd: 0.1, clipSize: 30, spread: 0.015, price: 1500, ammoPrice: 90 },
  shotgun: { name: 'Pump shotgun', slot: 5, gun: true, model: 'shotgun', range: 32, dmg: 24, pellets: 7, spread: 0.07, cd: 0.85, clipSize: 6, price: 1100, ammoPrice: 50 },
};
const isGun = (w) => !!(WEAPONS[w] && WEAPONS[w].gun);
// what you own is saved: guns, rounds, armour
(() => { const s = store.get('wc-guns', null); if (s) { Object.assign(FOOT.has, s.has || {}); Object.assign(FOOT.mag, s.mag || {}); Object.assign(FOOT.res, s.res || {}); FOOT.armor = s.armor || 0; } })();
function saveGuns() { store.set('wc-guns', { has: FOOT.has, mag: FOOT.mag, res: FOOT.res, armor: FOOT.armor }); }
function giveGun(w) { FOOT.has[w] = true; FOOT.mag[w] = WEAPONS[w].clipSize; FOOT.res[w] = (FOOT.res[w] || 0) + WEAPONS[w].clipSize * 2; FOOT.weapon = w; saveGuns(); }
// the corner store sells the basics; the online market (T) has the rest
const SHOP_ITEMS = [
  { id: 'knife', label: 'Knife', price: 60, ok: () => !FOOT.has.knife, buy: () => { FOOT.has.knife = true; FOOT.weapon = 'knife'; saveGuns(); } },
  { id: 'pistol', label: 'Pistol + 24 rounds', price: 350, ok: () => !FOOT.has.pistol, buy: () => giveGun('pistol') },
  { id: 'ammo', label: 'Ammo for your gun', price: 40, ok: () => isGun(FOOT.weapon), buy: () => { FOOT.ammo += WEAPONS[FOOT.weapon].clipSize * 2; saveGuns(); } },
  { id: 'aid', label: 'First aid (full health)', price: 30, ok: () => FOOT.hp < 100, buy: () => { FOOT.hp = 100; } },
];

// ---------------------------------------------------------------- HUD: cash, health, weapon, crosshair, prompts
const footHud = document.createElement('div');
footHud.id = 'footHud';
footHud.innerHTML = '<div class="fh-cash"></div><div class="fh-hp"><i></i></div><div class="fh-wpn"></div><div class="fh-prompt"></div>';
const crosshair = document.createElement('div'); crosshair.id = 'crosshair';
const storeMenu = document.createElement('div'); storeMenu.id = 'storeMenu'; storeMenu.hidden = true;
(document.querySelector('#stage') || document.body).append(footHud, crosshair, storeMenu);
const fhStyle = document.createElement('style');
fhStyle.textContent = `
  #footHud { position: absolute; right: 18px; bottom: 18px; z-index: 6; display: none; text-align: right; font: 700 15px/1.3 system-ui, sans-serif; color: #f3efe7; text-shadow: 0 1px 2px #000; pointer-events: none; }
  #footHud.on { display: block; }
  #hud.foot .speed, #hud.foot #gauge, #hud.foot #povLabel { display: none; }
  #footHud .fh-cash { font-size: 26px; color: #7dff8a; }
  #footHud .fh-hp { width: 160px; height: 8px; margin: 6px 0 6px auto; background: rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.35); }
  #footHud .fh-hp i { display: block; height: 100%; background: #ff4a4a; }
  #footHud .fh-prompt { position: fixed; left: 50%; bottom: 22%; transform: translateX(-50%); font-size: 17px; color: #fff; background: rgba(0,0,0,.55); padding: 6px 12px; border-radius: 4px; white-space: nowrap; }
  #footHud .fh-prompt:empty { display: none; }
  #crosshair { position: absolute; left: 50%; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px; z-index: 6; display: none; pointer-events: none;
    background: radial-gradient(circle, #fff 0 1.5px, transparent 2px), linear-gradient(#fff, #fff) center/2px 6px no-repeat; opacity: .85; }
  #crosshair.on { display: block; }
  #storeMenu { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 8; min-width: 300px; padding: 18px 20px; background: rgba(16,17,25,.95); border-left: 4px solid #ff3d7f; color: #f3efe7; font: 15px/1.4 system-ui, sans-serif; }
  #storeMenu h3 { margin: 0 0 4px; font-size: 20px; } #storeMenu p { margin: 0 0 12px; opacity: .75; font-size: 13px; }
  #storeMenu button { display: flex; justify-content: space-between; gap: 18px; width: 100%; margin: 6px 0; padding: 9px 12px; background: #262836; color: #f3efe7; border: 1px solid #3a3d4c; cursor: pointer; font: inherit; }
  #storeMenu button:hover:not(:disabled) { background: #33364a; } #storeMenu button:disabled { opacity: .4; cursor: default; }
  #storeMenu button.rob { background: #5a1424; border-color: #8a1c36; }`;
document.head.appendChild(fhStyle);
const FOOT_KEYS = 'WASD move · Shift sprint · mouse look · click attack (hold for automatics) · right-click aim · 1 fists · 2 knife · 3 pistols · 4 automatics · 5 shotgun · R reload · T market · E rob / enter / take · F ride / car · N map · Esc pause';
let bikeKeysText = null;
function updateFootHud(prompt) {
  footHud.classList.toggle('on', FOOT.on);
  // the bike's speedo, wheelie gauge and controls give way to the on-foot ones
  const hud = document.querySelector('#hud'), kh = document.querySelector('#keyhint');
  if (hud && hud.classList.contains('foot') !== FOOT.on) {
    hud.classList.toggle('foot', FOOT.on);
    if (kh) { if (bikeKeysText === null) bikeKeysText = kh.textContent; kh.textContent = FOOT.on ? FOOT_KEYS : bikeKeysText; }
  }
  crosshair.classList.toggle('on', FOOT.on && isGun(FOOT.weapon) && !FOOT.menu && !FOOT.car);
  if (!FOOT.on) return;
  footHud.querySelector('.fh-cash').textContent = '$' + Math.round(cash).toLocaleString();
  footHud.querySelector('.fh-hp i').style.width = Math.max(0, FOOT.hp) + '%';
  const w = WEAPONS[FOOT.weapon];
  footHud.querySelector('.fh-wpn').textContent = (isGun(FOOT.weapon) ? `${w.name} ${FOOT.clip} / ${FOOT.ammo}` : w.name) + (FOOT.armor > 0 ? ` · armour ${Math.round(FOOT.armor)}` : '');
  footHud.querySelector('.fh-prompt').textContent = prompt || '';
}
function addCash(n) { cash = Math.max(0, cash + n); store.set('wc-cash', Math.round(cash)); }

// ---------------------------------------------------------------- the player's figure
function buildFootFigure() {
  if (FOOT.fig || !PEOPLE.ready) return FOOT.fig;
  // dressed as you chose in the wardrobe (wardrobe.js)
  const base = makeFigure(LOOK); if (!base) return null;
  const root = base.root;
  // a pistol in the right hand (shown when it's out)
  const gun = new THREE.Group(); const gm = new THREE.MeshStandardMaterial({ color: '#1c1d20', roughness: 0.4, metalness: 0.7 });
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.17), gm); slide.position.set(0, 0.02, 0.05); gun.add(slide);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.09, 0.035), gm); grip.position.set(0, -0.03, -0.01); grip.rotation.x = 0.25; gun.add(grip);
  const knife = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.025, 0.17), new THREE.MeshStandardMaterial({ color: '#d8dde2', roughness: 0.15, metalness: 1 })); blade.position.z = 0.1; knife.add(blade);
  knife.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.028, 0.08), new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.7 })));
  // the long guns: a box-section receiver, barrel, magazine and stock (wood on the AK)
  const box = (grp, w, h, d, x, y, z, m, rx = 0) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); me.rotation.x = rx; grp.add(me); return me; };
  const wood = new THREE.MeshStandardMaterial({ color: '#6a3e1e', roughness: 0.6 });
  const smg = new THREE.Group(); box(smg, 0.04, 0.06, 0.24, 0, 0.02, 0.08, gm); box(smg, 0.025, 0.12, 0.035, 0, -0.05, 0.04, gm); box(smg, 0.015, 0.015, 0.06, 0, 0.03, 0.22, gm);
  const rifle = new THREE.Group(); box(rifle, 0.045, 0.07, 0.42, 0, 0.02, 0.16, gm); box(rifle, 0.018, 0.018, 0.34, 0, 0.035, 0.52, gm); box(rifle, 0.03, 0.15, 0.05, 0, -0.07, 0.17, gm, -0.35);
  box(rifle, 0.04, 0.07, 0.24, 0, 0.0, -0.13, wood); box(rifle, 0.04, 0.05, 0.16, 0, 0.0, 0.42, wood);
  const shotgun = new THREE.Group(); box(shotgun, 0.04, 0.06, 0.3, 0, 0.02, 0.1, gm); box(shotgun, 0.028, 0.028, 0.5, 0, 0.04, 0.48, gm); box(shotgun, 0.04, 0.04, 0.22, 0, 0.0, 0.38, wood); box(shotgun, 0.045, 0.08, 0.26, 0, -0.01, -0.16, wood);
  const guns = { pistol: gun, smg, rifle, shotgun };
  const hand = root.getObjectByName('hand_r');
  const holder = new THREE.Group(); holder.add(gun, smg, rifle, shotgun, knife);
  if (hand) { hand.add(holder); const s = 1 / (hand.getWorldScale(new THREE.Vector3()).x || 1); holder.scale.setScalar(s); holder.position.set(0, 0.08 * s, 0.03 * s); holder.rotation.set(Math.PI / 2, 0, 0); }
  // a muzzle flash at the end of each barrel
  const flashM = new THREE.MeshBasicMaterial({ color: '#ffd58a', toneMapped: false }), flashes = [];
  for (const [grp, z] of [[gun, 0.16], [smg, 0.27], [rifle, 0.72], [shotgun, 0.75]]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), flashM); f.position.set(0, 0.03, z); f.visible = false; grp.add(f); flashes.push(f); }
  const flash = { set visible(v) { for (const f of flashes) f.visible = v; } };
  const g = new THREE.Group(); g.add(root); g.visible = false; scene.add(g);
  FOOT.fig = { g, root, mixer: base.mixer, actions: base.actions, cur: null, gun, guns, knife, flash };
  return FOOT.fig;
}

// ---------------------------------------------------------------- getting off and on
function canHopOff() { return !FOOT.on && state === 'play' && !S.crashed && !S.riding && !WALK.on && S.v < 3 && S.theta < 0.1; }
function hopOff() {
  if (!PEOPLE.ready) { popup('Loading people…'); loadPeople(); return; }
  if (!buildFootFigure()) return;
  const fx = Math.sin(S.psi), fz = Math.cos(S.psi);
  FOOT.park = { x: S.x, z: S.z, y: S.y, psi: S.psi };
  // step off to the left of the bike, onto open ground
  let x = S.x + fz * 0.9 + fx * 0.6, z = S.z - fx * 0.9 + fz * 0.6;
  if (buildingAt(x, z, 0.3) >= 0) { x = S.x - fz * 0.9 + fx * 0.6; z = S.z + fx * 0.9 + fz * 0.6; }
  Object.assign(FOOT, { on: true, x, z, y: S.y, yaw: S.psi, camYaw: S.psi, camPitch: 0.18, v: 0, store: null, downT: 0 });
  S.v = 0; S.thr = 0; S.theta = 0; S.omega = 0; W = { active: false };
  rig.rider.visible = false;
  FOOT.fig.g.visible = true;
  personPlay(FOOT.fig, 'Idle_Loop', 0.1);
  camSnap = true;
  popup('On foot · F near the bike to ride · E to rob or enter shops', '');
}
function hopOn() {
  if (FOOT.car) { const u = FOOT.car; u.player = false; u.parked = true; u.v = 0; FOOT.car = null; }
  const P = FOOT.park;
  Object.assign(S, { x: P.x, z: P.z, y: P.y, psi: P.psi, v: 0, theta: 0, omega: 0, spawnGrace: 1 });
  FOOT.on = false; FOOT.aiming = false; FOOT.fig.g.visible = false;
  rig.rider.visible = true;
  camSnap = true;
  updateFootHud();
}

// ---------------------------------------------------------------- input
function footKey(code) {
  if (!FOOT.on) { if (code === 'KeyF' && canHopOff()) { hopOff(); return true; } return false; }
  if (FOOT.menu) { if (code === 'Escape' || code === 'KeyE' || code === 'KeyT') closeStoreMenu(); return true; }
  if (FOOT.downT > 0) return true;
  if (code === 'KeyF') {
    if (FOOT.car) { leaveCar(); return true; }
    if (FOOT.store) { popup('Leave the store first (walk out the door)'); return true; }
    // whatever's closest: your bike, a bike or scooter on the street, or a car
    const bikeD = Math.hypot(FOOT.x - FOOT.park.x, FOOT.z - FOOT.park.z), ride = rideableNear(), car = carToTake();
    if (bikeD < 2.6) hopOn();
    else if (ride) takeRideable(ride);
    else if (car) takeCar(car);
    else popup('Nothing to ride here: walk back to your bike');
    return true;
  }
  if (FOOT.car) return code === 'KeyE' || code.startsWith('Digit');   // (no fighting from the driver's seat)
  if (code === 'Digit1') { FOOT.weapon = 'fists'; return true; }
  if (code === 'Digit2') { if (FOOT.has.knife) FOOT.weapon = 'knife'; else popup('No knife: buy one in a store'); return true; }
  for (const slot of [3, 4, 5]) if (code === 'Digit' + slot) {
    // a slot key cycles the guns you own in that slot
    const own = Object.keys(WEAPONS).filter((k) => WEAPONS[k].slot === slot && FOOT.has[k]);
    if (!own.length) { popup(['', '', '', 'No pistol', 'No automatic', 'No shotgun'][slot] + ': press T for the market'); return true; }
    const i = own.indexOf(FOOT.weapon); FOOT.weapon = own[(i + 1) % own.length]; popup(WEAPONS[FOOT.weapon].name); return true;
  }
  if (code === 'KeyT') { openMarket(); return true; }
  if (code === 'KeyR') { reload(); return true; }
  if (code === 'KeyE') { interact(); return true; }
  return false;
}
function footMouse(dx, dy) {
  const k = 0.0025 * sens;
  FOOT.camYaw -= dx * k; FOOT.camPitch = clamp(FOOT.camPitch + dy * k, -0.5, 0.9);
}
canvas.addEventListener('mousedown', (e) => {
  if (!FOOT.on || state !== 'play' || !document.pointerLockElement || FOOT.menu) return;
  if (e.button === 0) { FOOT.fire = true; FOOT.fireHeld = true; }
  if (e.button === 2) FOOT.aiming = true;
});
addEventListener('mouseup', (e) => { if (e.button === 2) FOOT.aiming = false; if (e.button === 0) FOOT.fireHeld = false; });
canvas.addEventListener('contextmenu', (e) => { if (FOOT.on) e.preventDefault(); });
function reload() {
  if (!isGun(FOOT.weapon) || FOOT.clip >= WEAPONS[FOOT.weapon].clipSize || FOOT.ammo <= 0) return;
  const n = Math.min(WEAPONS[FOOT.weapon].clipSize - FOOT.clip, FOOT.ammo); FOOT.clip += n; FOOT.ammo -= n; FOOT.atkCd = 1.1; sfx.shift && sfx.shift(); popup('Reloading');
}

// ---------------------------------------------------------------- the step on foot
const FOOT_R = 0.32;      // body radius for walls and poles
function footBlocked(x, z) {
  if (FOOT.store) return storeBlocked(x, z);
  return buildingAt(x, z, FOOT_R) >= 0 || !!hitAt(x, z, FOOT_R - 0.15) || landAt(x, z) === 1 && !roadQuery(x, z, 6).in;
}
function footStep(d) {
  const F = FOOT, fig = F.fig;
  F.atkCd = Math.max(0, F.atkCd - d); F.hurtCd = Math.max(0, F.hurtCd - d); F.flashT = Math.max(0, F.flashT - d);
  fig.flash.visible = F.flashT > 0;
  if (F.downT > 0) {
    // knocked down / wasted
    F.downT -= d; fig.mixer.update(d);
    if (F.downT <= 0) footRecover();
    syncPlayerState(); return;
  }
  if (F.car) { driveStep(d); syncPlayerState(); return; }
  // movement, relative to where the camera looks
  const fw = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), st = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const aimed = F.aiming && isGun(F.weapon);
  let want = 0, dir = F.yaw;
  if (fw || st) {
    const cs = Math.sin(F.camYaw), cc = Math.cos(F.camYaw);
    const mx = cs * fw - cc * st, mz = cc * fw + cs * st;         // camera forward is (sin, cos); right is (-cos, sin)
    dir = Math.atan2(mx, mz);
    want = aimed ? 1.4 : sprint ? 6.2 : 3.3;
  }
  F.v += (want - F.v) * Math.min(1, d * (want > F.v ? 6 : 10));
  // face where you're going, or where you aim
  const face = aimed ? F.camYaw : want > 0.1 ? dir : F.yaw;
  F.yaw += wrapPi(face - F.yaw) * Math.min(1, d * (aimed ? 18 : 10));
  const moveDir = want > 0.1 ? dir : F.yaw;
  const nx = F.x + Math.sin(moveDir) * F.v * d, nz = F.z + Math.cos(moveDir) * F.v * d;
  // slide along walls: try the full step, then each axis
  if (!footBlocked(nx, nz)) { F.x = nx; F.z = nz; }
  else if (!footBlocked(nx, F.z)) F.x = nx;
  else if (!footBlocked(F.x, nz)) F.z = nz;
  else F.v *= 0.5;
  if (!F.store) {
    const q = roadQuery(F.x, F.z, 14), gy = q.in ? roadY(RC[MAP.eCls[q.e]].rank) : (q.e >= 0 && q.d < q.hw + 2.6 && RC[MAP.eCls[q.e]].walk) ? CURB : 0;
    F.y += (gy - F.y) * Math.min(1, d * 14);
  }
  // attacks
  if ((F.fire || (F.fireHeld && WEAPONS[F.weapon].auto)) && F.atkCd <= 0) attack();
  F.fire = false;
  // animation
  const busy = fig.cur && /Punch|Sword|Shoot|Interact|Hit/.test(fig.cur) && fig.actions[fig.cur].isRunning();
  if (!busy) {
    if (aimed) personPlay(fig, F.v > 0.3 ? 'Walk_Loop' : 'Pistol_Aim_Neutral', 0.15, F.v > 0.3 ? F.v / 1.3 : 1);
    else if (F.v > 4.5) personPlay(fig, 'Sprint_Loop', 0.2, F.v / 6.2);
    else if (F.v > 2) personPlay(fig, 'Jog_Fwd_Loop', 0.2, F.v / 3.2);
    else if (F.v > 0.3) personPlay(fig, 'Walk_Loop', 0.2, F.v / 1.3);
    else personPlay(fig, isGun(F.weapon) ? 'Pistol_Idle_Loop' : 'Idle_Loop', 0.3);
  }
  fig.mixer.update(d);
  const gm = isGun(F.weapon) ? WEAPONS[F.weapon].model : ''; for (const [k, m] of Object.entries(fig.guns)) m.visible = k === gm; fig.knife.visible = F.weapon === 'knife';
  // traffic: getting hit by a car
  if (!F.store && F.hurtCd <= 0) for (const u of units) {
    if (!u.on || u.v < 3) continue;
    const dx = F.x - u.x, dz = F.z - u.z, c = Math.cos(u.yaw), s = Math.sin(u.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < (u.T.W || 1.9) / 2 + 0.3 && Math.abs(lz) < (u.T.L || 4.4) / 2 + 0.2) {
      footHurt(u.v * 7, 'Hit by a car', Math.sin(u.yaw) * u.v, Math.cos(u.yaw) * u.v);
      if (u.kind === 'car') { sfx.horn(u); u.v *= 0.4; }
      break;
    }
  }
  syncPlayerState();
}
// the rest of the game follows "S": where you are (tiles, map, cops, people); the bike's engine is off
function syncPlayerState() {
  S.x = FOOT.store ? FOOT.store.door.x : FOOT.x; S.z = FOOT.store ? FOOT.store.door.z : FOOT.z; S.y = FOOT.store ? 0 : FOOT.y; S.psi = FOOT.yaw;
  S.v = 0; S.thr = 0; S.skid = 0; S.burnSpin = 0;
  const fig = FOOT.fig;
  if (FOOT.store) { fig.g.position.set(FOOT.x, STORE_Y, FOOT.z); }
  else fig.g.position.set(FOOT.x, FOOT.y, FOOT.z);
  fig.g.rotation.y = FOOT.yaw;
}
function footHurt(dmg, why, vx = 0, vz = 0) {
  // body armour soaks up most of a hit until it's used up
  const soak = Math.min(FOOT.armor, dmg * 0.7); FOOT.armor -= soak; dmg -= soak; if (soak) saveGuns();
  FOOT.hp -= dmg; FOOT.hurtCd = 0.8;
  sfx.bodyHit(Math.min(1, dmg / 40)); flash(0.4); S.shake = Math.max(S.shake, 0.25);
  FOOT.x += vx * 0.08; FOOT.z += vz * 0.08;
  if (FOOT.hp <= 0) {
    const lost = Math.round(cash * 0.2); addCash(-lost);
    popup(`Wasted${lost ? ` · −$${lost}` : ''}`, 'bad'); popup(why, 'bad');
    personPlay(FOOT.fig, 'Death01', 0.1); FOOT.downT = 3.2;
  } else { personPlay(FOOT.fig, 'Hit_Chest', 0.08); popup(why, 'bad'); }
}
function footRecover() {
  // wasted: back on your feet next to the bike, patched up, wanted level cleared
  FOOT.hp = 100; heat = 0; chaseMax = 0;
  const P = FOOT.park; FOOT.store = null;
  FOOT.x = P.x + 1; FOOT.z = P.z; personPlay(FOOT.fig, 'Idle_Loop', 0.2);
}
function busyAnim(name) { const fig = FOOT.fig; if (fig.actions[name]) { fig.cur = null; personPlay(fig, name, 0.08, 1.25); } }

// ---------------------------------------------------------------- fighting
// Everyone you can hit: people on the street, and the people in the room you're in
function targets() { return FOOT.store ? ROOM.people : peds; }
function personPos(p) { return FOOT.store ? new THREE.Vector3(p.x, STORE_Y + 1.15, p.z) : new THREE.Vector3(p.x, (p.g.position.y || 0) + 1.15, p.z); }
function hitPerson(p, dmg, how) {
  if (FOOT.store) roomHurt(p, dmg, how); else hurtPed(p, dmg, FOOT.x, FOOT.z, how);
}
function attack() {
  const F = FOOT, w = WEAPONS[F.weapon];
  if (isGun(F.weapon)) {
    if (F.clip <= 0) { if (F.ammo > 0) reload(); else { popup('Out of ammo'); F.atkCd = 0.4; } return; }
    F.clip--; F.atkCd = w.cd; F.flashT = 0.06; busyAnim('Pistol_Shoot'); sfx.gun && sfx.gun();
    // each round (a shotgun fires a spread of pellets) goes where the crosshair points, give or take the weapon's
    // spread; whoever is closest to that line (within a small cone) is hit
    camera.updateMatrixWorld();
    const o = camera.position.clone(), aim = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const camR = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), camU = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const dmgTo = new Map();
    for (let k = 0; k < (w.pellets || 1); k++) {
      const sp = w.spread || 0, dirV = aim.clone().addScaledVector(camR, (Math.random() - 0.5) * 2 * sp).addScaledVector(camU, (Math.random() - 0.5) * 2 * sp).normalize();
      let best = null, bt = w.range;
      for (const p of targets()) {
        if (!p.on || p.dead) continue;
        const c = personPos(p), t = c.clone().sub(o).dot(dirV);
        if (t < 0.5 || t > bt) continue;
        const miss = o.clone().addScaledVector(dirV, t).distanceTo(c);
        if (miss < (w.pellets ? 0.4 : 0.5 + t * 0.03)) { bt = t; best = { p }; }
      }
      if (!F.store) {
        for (const u of units) {
          if (!u.on || u.player) continue;
          const c = new THREE.Vector3(u.x, 0.9, u.z), t = c.clone().sub(o).dot(dirV);
          if (t < 0 || t > bt) continue;
          if (o.clone().addScaledVector(dirV, t).distanceTo(c) < 1.4) { bt = t; best = { u }; }
        }
        // bullets stop at walls
        for (let s = 2; s < bt; s += 1.5) { const p = o.clone().addScaledVector(dirV, s); if (buildingAt(p.x, p.z, 0) >= 0 && p.y < 30) { best = null; break; } }
      }
      if (best && best.p) dmgTo.set(best.p, (dmgTo.get(best.p) || 0) + w.dmg);
      else if (best && best.u) { const u = best.u; u.hitT = 3; u.v *= 0.3; sfx.metal(0.3); if (u.kind !== 'car') addHeat(2); }
    }
    for (const [p, dmg] of dmgTo) hitPerson(p, dmg, 'shot');
    if (F.store) roomPanic(); else panic(F.x, F.z, 70);
    addHeat(copNear(140) || F.store ? 1.2 : 0.35);
    return;
  }
  // melee: the nearest person in front of you, in reach
  F.atkCd = w.cd;
  if (F.weapon === 'fists') busyAnim(F.combo++ % 2 ? 'Punch_Cross' : 'Punch_Jab'); else busyAnim('Sword_Attack');
  sfx.swing && sfx.swing();
  const best = nearestPersonInFront(w.range + 0.4, true);
  if (best) {
    setTimeout(() => { if (best.on && !best.dead) { hitPerson(best, w.dmg, F.weapon); sfx.bodyHit(F.weapon === 'knife' ? 0.6 : 0.45); } }, 180);
    if (F.store) { roomPanic(); addHeat(0.5); } else if (copNear(70)) addHeat(F.weapon === 'knife' ? 1.2 : 0.6); else addHeat(0.15);
  }
}
function nearestPersonInFront(maxD, any) {
  const fx = Math.sin(FOOT.yaw), fz = Math.cos(FOOT.yaw);
  let best = null, bd = maxD;
  for (const p of targets()) {
    if (!p.on || p.dead || (!any && p.robbed)) continue;
    const dx = p.x - FOOT.x, dz = p.z - FOOT.z, dd = Math.hypot(dx, dz);
    if (dd < bd && (dx * fx + dz * fz) / (dd || 1) > 0.3) { bd = dd; best = p; }
  }
  return best;
}
const nearestPedInFront = (d) => nearestPersonInFront(d, false);

// ---------------------------------------------------------------- what's in front of you outside: a shop or a home
function buildingInFront() {
  if (FOOT.store || !MAP) return null;
  const fx = Math.sin(FOOT.yaw), fz = Math.cos(FOOT.yaw);
  const bi = buildingAt(FOOT.x + fx * 1.1, FOOT.z + fz * 1.1, 0.1);
  if (bi < 0) return null;
  const m = MAP, key = m.tkey(FOOT.x, FOOT.z);
  for (const dk of [0, 1, -1, 4096, -4096, 4097, -4097, 4095, -4095]) {
    for (const si of m.tShop.get(key + dk) || []) { const sh = m.shops[si]; if (buildingAt(sh[2], sh[3], 3) === bi) return { type: 'store', name: sh[0], kind: sh[1], bi }; }
  }
  if (m.bFlags[bi] & 1) return { type: 'store', name: 'Corner Store', kind: 'convenience', bi };
  // houses and apartments (and small unmarked buildings) are homes you can break into
  const k = m.bKind[bi], bb = bi * 4, area = (m.bBox[bb + 2] - m.bBox[bb]) * (m.bBox[bb + 3] - m.bBox[bb + 1]);
  if (k === 1 || k === 2 || (k === 0 && area < 500 && m.bH[bi] < 14)) return { type: 'home', name: k === 2 ? 'Apartment' : 'House', bi };
  return null;
}
const shopInFront = () => { const b = buildingInFront(); return b && b.type === 'store' ? b : null; };
function interact() {
  if (FOOT.store) { roomInteract(); return; }
  const p = nearestPedInFront(2.2);
  if (p) { robPerson(p); return; }
  const b = buildingInFront();
  if (b) { enterRoom(b); return; }
  popup('Nothing here');
}
// a hold-up: hands up, hands over the cash, then runs
function robPerson(p) {
  const amt = 10 + Math.floor(Math.random() * (FOOT.weapon === 'fists' ? 50 : 120));
  p.robbed = true; p.idle = 2.2; p.watch = [FOOT.x, FOOT.z]; p.pose = 'film';
  if (p.model) { p.model.cur = null; personPlay(p.model, 'Interact', 0.1); }
  say(p, pick(Math.random, ['Ok ok! Take it!', "Don't hurt me!", 'Here, just take it', 'Please!']), false);
  if (FOOT.store) p.cower = true;
  else setTimeout(() => { if (p.on && !p.dead) startFlee(p, FOOT.x, FOOT.z, 12); }, 1800);
  addCash(amt); popup(`Robbed +$${amt}`, 'good'); sfx.cash && sfx.cash();
  addHeat(FOOT.store ? 0.5 : copNear(90) ? 1.2 : 0.45);
}

// ---------------------------------------------------------------- your bag of stolen goods
const BAG_MAX = 8;
FOOT.bag = store.get('wc-bag', []);
function bagValue() { return FOOT.bag.reduce((s, it) => s + it.value, 0); }
function takeItem(name, value) {
  if (FOOT.bag.length >= BAG_MAX) { popup('Your bag is full: sell at a store counter'); return false; }
  FOOT.bag.push({ name, value }); store.set('wc-bag', FOOT.bag);
  popup(`Took ${name} ($${value})`, 'good'); sfx.cash && sfx.cash();
  return true;
}

// ---------------------------------------------------------------- walk-in interiors: stores and homes
// Built far below the city, one at a time. A store has shelves (shoplift them), a till and a cashier (buy, sell,
// rob). A home has a living room and kitchen, valuables to take, and the family, who cower, plead and call the cops.
const STORE_Y = -800;
const ROOM = { g: null, kind: '', box: { x0: -7, x1: 7, z0: -5, z1: 5 }, solids: [], people: [], loot: [], shelves: [], door: { x: 0, z: -4.6 }, counter: { x: 4.2, z: 2.8 }, called: 0, disp: [] };
const STORE = ROOM;                                  // (the store test hooks use this name)
const robbedTills = new Set(), lootedHomes = new Set();
function roomMat(c, e = 0.35) { const m = new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: e }); ROOM.disp.push(m); return m; }
function roomAdd(geo, mat, x, y, z, solid) { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); ROOM.g.add(me); ROOM.disp.push(geo); if (solid) ROOM.solids.push(solid); return me; }
function clearRoom() {
  if (ROOM.g) { scene.remove(ROOM.g); for (const d of ROOM.disp) d.dispose && d.dispose(); }
  for (const p of ROOM.people) scene.remove(p.g);
  Object.assign(ROOM, { g: null, solids: [], people: [], loot: [], shelves: [], disp: [], called: 0 });
}
function roomShell(seed, floorCol, wallCol) {
  const g = new THREE.Group(); g.position.y = STORE_Y; scene.add(g); ROOM.g = g;
  const { x0, x1, z0, z1 } = ROOM.box, W = x1 - x0, D = z1 - z0, H = 3.2;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const tg = cv.getContext('2d');
  tg.fillStyle = floorCol; tg.fillRect(0, 0, 128, 128); tg.strokeStyle = 'rgba(0,0,0,.18)'; tg.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) { tg.beginPath(); tg.moveTo(i, 0); tg.lineTo(i, 128); if (ROOM.kind === 'store') { tg.moveTo(0, i); tg.lineTo(128, i); } tg.stroke(); }
  const ft = new THREE.CanvasTexture(cv); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(W / 1.2, D / 1.2); ft.encoding = THREE.sRGBEncoding; ROOM.disp.push(ft);
  const fm = new THREE.MeshLambertMaterial({ map: ft, emissive: '#ffffff', emissiveMap: ft, emissiveIntensity: 0.35 }); ROOM.disp.push(fm);
  roomAdd(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), fm, 0, 0, 0);
  roomAdd(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), roomMat('#ecebe6', 0.5), 0, H, 0);
  const wm = roomMat(wallCol, 0.4);
  roomAdd(new THREE.PlaneGeometry(W, H), wm, 0, H / 2, z1).rotation.y = Math.PI;
  roomAdd(new THREE.PlaneGeometry(D, H), wm, x0, H / 2, 0).rotation.y = Math.PI / 2;
  roomAdd(new THREE.PlaneGeometry(D, H), wm, x1, H / 2, 0).rotation.y = -Math.PI / 2;
  // the front wall: windows either side of the door
  const glass = new THREE.MeshBasicMaterial({ color: '#9ec4dc', transparent: true, opacity: 0.5 }); ROOM.disp.push(glass);
  for (const cx of [-4.2, 4.2]) { roomAdd(new THREE.PlaneGeometry(5.6, 1.0), wm, cx, 0.5, z0); roomAdd(new THREE.PlaneGeometry(5.6, H - 1), glass, cx, 1 + (H - 1) / 2, z0 + 0.01); }
  roomAdd(new THREE.PlaneGeometry(2.8, H - 2.3), wm, 0, 2.3 + (H - 2.3) / 2, z0);
  for (let x = -5; x <= 5; x += 2.5) roomAdd(new THREE.PlaneGeometry(1.1, 0.45).rotateX(Math.PI / 2), roomMat('#fffdf2', 1.2), x, H - 0.01, 0);
  void seed;
}
function addRoomPerson(seed, x, z, yaw, role) {
  const m = makePed(mulberry(seed));
  const g = new THREE.Group(); g.add(m.root); g.position.set(x, STORE_Y, z); g.rotation.y = yaw; scene.add(g);
  personPlay(m, 'Idle_Loop', 0.1);
  const p = { on: true, x, z, yaw, hp: 100, dead: false, robbed: false, cower: false, role, model: m, g, body: g };
  ROOM.people.push(p);
  return p;
}
function buildStoreRoom(shop) {
  ROOM.kind = 'store'; roomShell(shop.bi, '#d8d6d0', '#e4dccb');
  const shelfM = roomMat('#9aa0a6', 0.3), prod = new THREE.BoxGeometry(0.18, 0.24, 0.14); ROOM.disp.push(prod);
  const pcols = ['#d8312a', '#2a6ad8', '#f2c230', '#2aa05a', '#e86a1a', '#f2f2f2', '#7a3ad8', '#1a1a1a'];
  const N = 2 * 2 * 4 * 26, pm = new THREE.MeshLambertMaterial({ emissive: '#222' }); ROOM.disp.push(pm);
  const im = new THREE.InstancedMesh(prod, pm, N); let k = 0; const m4 = new THREE.Matrix4(), col = new THREE.Color();
  for (const sx of [-5, -2]) {
    roomAdd(new THREE.BoxGeometry(1.0, 1.8, 6), shelfM, sx, 0.9, 0.6, { x0: sx - 0.55, x1: sx + 0.55, z0: -2.45, z1: 3.65 });
    ROOM.shelves.push({ x: sx, z0: -2.4, z1: 3.6 });
    for (const side of [-1, 1]) for (let lvl = 0; lvl < 4; lvl++) for (let i = 0; i < 26 && k < N; i++) {
      m4.makeTranslation(sx + side * 0.36, 0.35 + lvl * 0.42, -2.2 + i * 0.22); im.setMatrixAt(k, m4);
      col.set(pcols[(i * 7 + lvl * 3 + (sx > -3 ? 1 : 0) + side) % pcols.length]); im.setColorAt(k, col); k++;
    }
  }
  im.count = k; ROOM.g.add(im);
  roomAdd(new THREE.BoxGeometry(5, 2.2, 0.8), roomMat('#cfe9f5', 0.8), -3.5, 1.1, ROOM.box.z1 - 0.45, { x0: -6.05, x1: -0.95, z0: ROOM.box.z1 - 0.9, z1: ROOM.box.z1 });
  const c = ROOM.counter;
  roomAdd(new THREE.BoxGeometry(3.2, 1.0, 0.8), roomMat('#6a4a32', 0.3), c.x, 0.5, c.z - 0.6, { x0: c.x - 1.65, x1: c.x + 1.65, z0: c.z - 1.05, z1: c.z - 0.15 });
  roomAdd(new THREE.BoxGeometry(0.4, 0.25, 0.3), roomMat('#202226', 0.2), c.x + 0.6, 1.13, c.z - 0.6);
  addRoomPerson(4242 + shop.bi, c.x, c.z + 0.25, Math.PI, 'cashier');
}
// a home: sofa, TV, coffee table, kitchen along the back, a bookcase; valuables to take; the family at home
const LOOT_TYPES = [['TV', 120, 260], ['Laptop', 180, 420], ['Jewellery box', 250, 700], ['Games console', 90, 220], ['Cash stash', 60, 400], ['Watch', 120, 500], ['Tablet', 90, 240]];
function buildHomeRoom(home) {
  ROOM.kind = 'home';
  const r = mulberry(home.bi * 31 + 7), pickC = (a) => a[Math.floor(r() * a.length)];
  roomShell(home.bi, pickC(['#8a6a4a', '#a8865c', '#6e5038', '#b9a88e']), pickC(['#e8e2d4', '#d8e0e4', '#efe4d2', '#e0d8e8']));
  const { x0, x1, z1 } = ROOM.box;
  // living room: sofa facing the TV, rug, coffee table
  const sofaC = pickC(['#4a5a6e', '#6e4a3a', '#3a3a3e', '#7a6a52']);
  roomAdd(new THREE.BoxGeometry(2.6, 0.45, 0.9), roomMat(sofaC, 0.3), -3.5, 0.3, 1.6, { x0: -4.85, x1: -2.15, z0: 1.1, z1: 2.1 });
  roomAdd(new THREE.BoxGeometry(2.6, 0.6, 0.25), roomMat(sofaC, 0.3), -3.5, 0.75, 2.0);
  roomAdd(new THREE.PlaneGeometry(3.2, 2.2).rotateX(-Math.PI / 2), roomMat(pickC(['#8a2a2a', '#2a4a6a', '#c8b48a']), 0.3), -3.5, 0.01, 0.2);
  roomAdd(new THREE.BoxGeometry(1.2, 0.4, 0.6), roomMat('#5a3a22', 0.3), -3.5, 0.2, 0.2, { x0: -4.15, x1: -2.85, z0: -0.15, z1: 0.55 });
  roomAdd(new THREE.BoxGeometry(1.8, 0.5, 0.45), roomMat('#2a2a2e', 0.3), -3.5, 0.25, -2.2, { x0: -4.45, x1: -2.55, z0: -2.5, z1: -1.9 });
  // kitchen along the back wall, with a table
  roomAdd(new THREE.BoxGeometry(5.5, 0.9, 0.65), roomMat('#e8e4dc', 0.35), 3.6, 0.45, z1 - 0.35, { x0: 0.8, x1: x1, z0: z1 - 0.7, z1 });
  roomAdd(new THREE.BoxGeometry(5.5, 0.04, 0.68), roomMat('#3a3a3e', 0.3), 3.6, 0.92, z1 - 0.35);
  roomAdd(new THREE.BoxGeometry(0.8, 1.9, 0.7), roomMat('#d8dcdf', 0.45), 6.4, 0.95, z1 - 0.4);
  roomAdd(new THREE.BoxGeometry(1.4, 0.05, 0.9), roomMat('#7a5232', 0.3), 3.2, 0.75, 1.0, { x0: 2.45, x1: 3.95, z0: 0.5, z1: 1.5 });
  for (const [lx, lz] of [[2.6, 0.6], [3.8, 0.6], [2.6, 1.4], [3.8, 1.4]]) roomAdd(new THREE.BoxGeometry(0.05, 0.75, 0.05), roomMat('#5a3a22', 0.2), lx, 0.37, lz);
  // bookcase on the side wall
  roomAdd(new THREE.BoxGeometry(0.4, 2.0, 1.6), roomMat('#6a4a2a', 0.3), x0 + 0.25, 1.0, -1.0, { x0, x1: x0 + 0.5, z0: -1.85, z1: -0.15 });
  // valuables: where they'd really be
  const spots = [[-3.5, 0.75, -2.2, 'TV'], [3.0, 0.8, 1.0, 'Laptop'], [x0 + 0.45, 1.35, -0.6, 'Jewellery box'], [-3.2, 0.55, -2.15, 'Games console'], [5.0, 0.98, z1 - 0.35, 'Cash stash'], [-3.2, 0.42, 0.25, 'Watch']];
  for (const [x, y, z, nm] of spots) {
    if (lootedHomes.has(home.bi + nm) || r() < 0.25) continue;
    const t = LOOT_TYPES.find((l) => l[0] === nm), value = Math.round(t[1] + r() * (t[2] - t[1]));
    const size = nm === 'TV' ? [1.3, 0.75, 0.08] : nm === 'Laptop' ? [0.35, 0.03, 0.25] : nm === 'Games console' ? [0.3, 0.07, 0.25] : [0.18, 0.1, 0.14];
    const mesh = roomAdd(new THREE.BoxGeometry(...size), roomMat(nm === 'TV' || nm === 'Laptop' || nm === 'Games console' ? '#141518' : nm === 'Cash stash' ? '#3a7a3a' : '#c8a040', 0.4), x, y + size[1] / 2 + (nm === 'TV' ? 0.12 : 0), z);
    ROOM.loot.push({ name: nm, value, mesh, x, z, key: home.bi + nm });
  }
  // the family: one to four people at home, in the living room and kitchen
  const n = 1 + Math.floor(r() * 4);
  const at = [[-2.2, 1.0, Math.PI * 1.2], [2.4, 2.6, Math.PI * 0.9], [-4.6, -0.6, Math.PI * 0.6], [4.2, 0.0, Math.PI * 1.4]];
  for (let i = 0; i < n; i++) { const [x, z, yaw] = at[i]; addRoomPerson(home.bi * 13 + i, x, z, yaw, 'family'); }
}
function roomHurt(p, dmg, how) {
  p.hp -= dmg;
  { const ax = p.x - FOOT.x, az = p.z - FOOT.z, L = Math.hypot(ax, az) || 1; spawnBlood(p.x, STORE_Y + 1.2, p.z, ax / L, az / L, how === 'fists' ? 4 : 14); }
  if (p.hp <= 0) {
    p.dead = true; p.model.cur = null; personPlay(p.model, 'Death01', 0.06); addHeat(1.4);
    setTimeout(() => bloodPool(p.x - Math.sin(p.yaw) * 0.7, STORE_Y, p.z - Math.cos(p.yaw) * 0.7), 900);
    return;
  }
  p.model.cur = null; personPlay(p.model, how === 'shot' ? 'Hit_Chest' : 'Hit_Head', 0.06);
  say(p, pick(Math.random, PED_HURT), false);
  p.cower = true;
}
function roomPanic() {
  for (const p of ROOM.people) if (!p.dead && !p.cower) { p.cower = true; if (Math.random() < 0.5) say(p, pick(Math.random, PED_SCREAM), false); }
}
function enterRoom(b) {
  clearRoom();
  if (b.type === 'store') buildStoreRoom(b); else buildHomeRoom(b);
  const fx = Math.sin(FOOT.yaw), fz = Math.cos(FOOT.yaw);
  FOOT.store = { name: b.name, kind: b.kind || 'home', type: b.type, bi: b.bi, door: { x: FOOT.x - fx * 0.6, z: FOOT.z - fz * 0.6, yaw: FOOT.yaw + Math.PI } };
  FOOT.x = 0; FOOT.z = ROOM.door.z + 0.8; FOOT.yaw = 0; FOOT.camYaw = 0;
  camSnap = true;
  if (b.type === 'store') popup(`${b.name} · E at the counter, E at a shelf to pocket something`, '');
  else {
    popup(`Broke into a ${b.name.toLowerCase()} · E to take things or rob people`, 'bad');
    sfx.glass && sfx.glass(0.5);
    // the family screams; someone calls the police unless you deal with them fast
    for (const p of ROOM.people) { p.cower = true; say(p, pick(Math.random, ['Who are you?!', 'Get out of our house!', 'Please, take anything!', "I'm calling 911!"]), false); }
    ROOM.called = 8;
  }
}
function leaveStore() {
  const D = FOOT.store.door; FOOT.store = null;
  FOOT.x = D.x; FOOT.z = D.z; FOOT.yaw = D.yaw; FOOT.camYaw = D.yaw;
  clearRoom();
  camSnap = true;
}
function storeBlocked(x, z) {
  const b = ROOM.box;
  if (x < b.x0 + FOOT_R || x > b.x1 - FOOT_R || z > b.z1 - FOOT_R) return true;
  if (z < b.z0 + FOOT_R) return Math.abs(x) > 1.2;          // the doorway
  if (ROOM.solids.some((s) => x > s.x0 - FOOT_R && x < s.x1 + FOOT_R && z > s.z0 - FOOT_R && z < s.z1 + FOOT_R)) return true;
  return ROOM.people.some((p) => !p.dead && Math.hypot(p.x - x, p.z - z) < 0.5);
}
// E inside: the counter, a shelf, a valuable, or a person
function nearCounter() { return ROOM.kind === 'store' && Math.hypot(FOOT.x - ROOM.counter.x, FOOT.z - (ROOM.counter.z - 1.3)) < 1.8; }
function nearLoot() { let best = null, bd = 1.6; for (const l of ROOM.loot) { const d = Math.hypot(l.x - FOOT.x, l.z - FOOT.z); if (d < bd) { bd = d; best = l; } } return best; }
function nearShelf() { return ROOM.kind === 'store' && ROOM.shelves.some((s) => Math.abs(FOOT.x - s.x) < 1.2 && FOOT.z > s.z0 - 0.3 && FOOT.z < s.z1 + 0.3); }
function roomInteract() {
  if (nearCounter()) { openStoreMenu(); return; }
  const p = nearestPersonInFront(1.8, false);
  if (p) { robPerson(p); return; }
  const l = nearLoot();
  if (l) {
    if (!takeItem(l.name, l.value)) return;
    l.mesh.visible = false; ROOM.loot.splice(ROOM.loot.indexOf(l), 1); lootedHomes.add(l.key);
    if (ROOM.people.some((q) => !q.dead)) addHeat(0.25);
    return;
  }
  if (nearShelf()) {
    // shoplifting: the cashier might see
    const items = [['Energy drinks', 8, 20], ['Snacks', 5, 15], ['Phone charger', 15, 40], ['Sunglasses', 20, 60], ['Headphones', 30, 90]];
    const it = items[Math.floor(Math.random() * items.length)], v = Math.round(it[1] + Math.random() * (it[2] - it[1]));
    if (!takeItem(it[0], v)) return;
    const cashier = ROOM.people.find((q) => q.role === 'cashier' && !q.dead && !q.cower);
    if (cashier && Math.random() < 0.4) { say(cashier, pick(Math.random, ['Hey! Put that back!', "I saw that!", "I'm calling the cops!"]), false); addHeat(0.9); }
    return;
  }
  popup('Nothing to take here');
}
function openStoreMenu() {
  FOOT.menu = true;
  const key = FOOT.store.bi, robbed = robbedTills.has(key), cashier = ROOM.people.find((q) => q.role === 'cashier');
  storeMenu.innerHTML = `<h3>${FOOT.store.name}</h3><p>You have $${Math.round(cash).toLocaleString()} · bag ${FOOT.bag.length}/${BAG_MAX}</p>`;
  const btn = (label, right, cls, dis, fn) => { const b = document.createElement('button'); b.type = 'button'; if (cls) b.className = cls; b.innerHTML = `<span>${label}</span><span>${right}</span>`; b.disabled = dis; b.onclick = fn; storeMenu.appendChild(b); };
  if (cashier && cashier.dead) { storeMenu.innerHTML += '<p>Nobody at the till.</p>'; }
  else {
    for (const it of SHOP_ITEMS) btn(it.label, `$${it.price}`, '', !it.ok() || cash < it.price, () => { if (cash < it.price || !it.ok()) return; addCash(-it.price); it.buy(); sfx.cash && sfx.cash(); popup(`Bought ${it.label}`, 'good'); openStoreMenu(); });
    // the shop buys your stolen goods, at a little over half what they're worth
    const offer = Math.round(bagValue() * 0.6);
    btn(`Sell your bag (${FOOT.bag.length} item${FOOT.bag.length === 1 ? '' : 's'})`, `$${offer}`, '', !FOOT.bag.length, () => { addCash(offer); FOOT.bag = []; store.set('wc-bag', []); sfx.cash && sfx.cash(); popup(`Sold for $${offer}`, 'good'); openStoreMenu(); });
  }
  const armed = Object.keys(WEAPONS).some((k) => isGun(k) && FOOT.has[k]);
  btn(robbed ? 'Already emptied' : 'Rob the till', armed ? 'gun' : FOOT.has.knife ? 'knife' : 'needs a weapon', 'rob', robbed || !(armed || FOOT.has.knife), () => robStore());
  btn('Close', 'E', '', false, closeStoreMenu);
  storeMenu.hidden = false;
  if (document.pointerLockElement) document.exitPointerLock();
}
const storeInteract = roomInteract;
// ---------------------------------------------------------------- the online market (T, anywhere)
// Order on your phone; it's delivered straight into your inventory.
function openMarket() {
  if (FOOT.store) { openStoreMenu(); return; }
  FOOT.menu = true;
  storeMenu.innerHTML = `<h3>📱 Market</h3><p>Delivered instantly · you have $${Math.round(cash).toLocaleString()}</p>`;
  const btn = (label, right, dis, fn) => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span>${label}</span><span>${right}</span>`; b.disabled = dis; b.onclick = fn; storeMenu.appendChild(b); };
  const buy = (price, fn, what) => { if (cash < price) return; addCash(-price); fn(); saveGuns(); sfx.cash && sfx.cash(); popup(`${what} delivered`, 'good'); openMarket(); };
  for (const [k, w] of Object.entries(WEAPONS)) {
    if (!w.gun) continue;
    if (!FOOT.has[k]) btn(w.name, `$${w.price}`, cash < w.price, () => buy(w.price, () => giveGun(k), w.name));
    else btn(`${w.name} ammo (${w.clipSize * 2})`, `$${w.ammoPrice}`, cash < w.ammoPrice, () => buy(w.ammoPrice, () => { FOOT.res[k] = (FOOT.res[k] || 0) + w.clipSize * 2; }, `${w.name} ammo`));
  }
  if (!FOOT.has.knife) btn('Knife', '$60', cash < 60, () => buy(60, () => { FOOT.has.knife = true; }, 'Knife'));
  btn('Body armour', '$200', cash < 200 || FOOT.armor >= 100, () => buy(200, () => { FOOT.armor = 100; }, 'Body armour'));
  btn('First aid', '$30', cash < 30 || FOOT.hp >= 100, () => buy(30, () => { FOOT.hp = 100; }, 'First aid'));
  btn('Close', 'T', false, closeStoreMenu);
  storeMenu.hidden = false;
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeStoreMenu() { FOOT.menu = false; storeMenu.hidden = true; lockPointer(); last = performance.now(); }
function robStore() {
  const gun = Object.keys(WEAPONS).find((k) => isGun(k) && FOOT.has[k]), amt = (gun ? 300 : 150) + Math.floor(Math.random() * 600);
  robbedTills.add(FOOT.store.bi);
  FOOT.weapon = isGun(FOOT.weapon) ? FOOT.weapon : gun || 'knife';
  const cashier = ROOM.people.find((q) => q.role === 'cashier');
  if (cashier && !cashier.dead) { cashier.cower = true; cashier.model.cur = null; personPlay(cashier.model, 'Interact', 0.1); say(cashier, pick(Math.random, ["Don't shoot!", 'Take it, take it!', 'OK! OK!']), false); }
  addCash(amt); sfx.cash && sfx.cash();
  popup(`Robbed the store +$${amt.toLocaleString()}`, 'good'); popup('The alarm is going off', 'cop');
  addHeat(Math.max(0.05, 2.05 - heat));
  closeStoreMenu();
}
// the people inside: idle, cowering (crouched, hands up), or down
function updateRoom(d) {
  if (!FOOT.store) return;
  for (const p of ROOM.people) {
    const m = p.model, busy = m.cur && /Hit|Death|Interact/.test(m.cur) && m.actions[m.cur].isRunning();
    if (!p.dead && !busy) personPlay(m, p.cower ? 'Crouch_Idle_Loop' in m.actions ? 'Crouch_Idle_Loop' : 'Idle_Talking_Loop' : 'Idle_Loop', 0.3);
    if (!p.dead && p.cower) { const want = Math.atan2(FOOT.x - p.x, FOOT.z - p.z); p.yaw += wrapPi(want - p.yaw) * Math.min(1, d * 4); p.g.rotation.y = p.yaw; }
    m.mixer.update(d);
  }
  // a home's family phones the police after a few seconds, unless nobody is left standing
  if (ROOM.called > 0) {
    ROOM.called -= d;
    if (ROOM.called <= 0 && ROOM.people.some((p) => !p.dead)) { popup('They called the police', 'cop'); addHeat(Math.max(0.05, 2.05 - heat)); }
  }
}

// ---------------------------------------------------------------- camera on foot
function footCamera(dt) {
  if (FOOT.car) { driveCamera(dt); return; }
  const F = FOOT, aimed = F.aiming && isGun(F.weapon);
  const baseY = F.store ? STORE_Y : F.y;
  const back = aimed ? 1.6 : F.store ? 2.4 : 3.4, side = aimed ? 0.55 : 0.25, up = aimed ? 1.55 : 1.75;
  const cy = Math.cos(F.camPitch), sy = Math.sin(F.camPitch), fx = Math.sin(F.camYaw), fz = Math.cos(F.camYaw), rx = -fz, rz = fx;
  const head = tmp.set(F.x + rx * side, baseY + up, F.z + rz * side);
  let dist = back;
  for (let k = 0.4; k <= back; k += 0.3) {
    const px = head.x - fx * k * cy, pz = head.z - fz * k * cy;
    if (F.store ? (px < ROOM.box.x0 + 0.2 || px > ROOM.box.x1 - 0.2 || pz > ROOM.box.z1 - 0.2 || (pz < ROOM.box.z0 + 0.2 && Math.abs(px) > 1.2)) : buildingAt(px, pz, 0.2) >= 0) { dist = Math.max(0.5, k - 0.3); break; }
  }
  const want = tmp2.set(head.x - fx * dist * cy, head.y + dist * sy, head.z - fz * dist * cy);
  if (camSnap) camPos.copy(want); else camPos.lerp(want, 1 - Math.exp(-dt * 14));
  camera.position.copy(camPos); camera.up.set(0, 1, 0);
  // look down the line you face (from your body, not the shoulder), so the crosshair is where shots go
  lookAt.set(F.x + fx * 25, baseY + up - 25 * Math.tan(F.camPitch) * 0.6, F.z + fz * 25);
  camera.lookAt(lookAt);
  camera.fov += ((aimed ? 50 : 66) - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix();
  camSnap = false;
}
// once a frame: prompts, the door out, the room, the HUD
// The key to press floats over the thing it works on (a person's head, a door, a car, an item, the counter)
const keyBubble = document.createElement('div'); keyBubble.id = 'keyBubble'; keyBubble.innerHTML = '<b></b><span></span>';
(document.querySelector('#stage') || document.body).append(keyBubble);
const kbStyle = document.createElement('style');
kbStyle.textContent = `
  #keyBubble { position: absolute; z-index: 7; display: none; transform: translate(-50%, -100%); pointer-events: none; text-align: center; font: 600 13px/1.2 system-ui, sans-serif; color: #fff; text-shadow: 0 1px 3px #000; }
  #keyBubble b { display: block; width: 30px; height: 30px; margin: 0 auto 4px; border-radius: 7px; background: #f3efe7; color: #111; font: 800 17px/30px system-ui, sans-serif; text-shadow: none;
    box-shadow: 0 2px 0 #9a958c, 0 4px 10px rgba(0,0,0,.45); animation: kbBob 1.1s ease-in-out infinite; }
  #keyBubble span { white-space: nowrap; background: rgba(0,0,0,.45); padding: 2px 7px; border-radius: 3px; }
  @keyframes kbBob { 50% { transform: translateY(-3px); } }`;
document.head.appendChild(kbStyle);
const _kb = new THREE.Vector3();
function setKeyBubble(key, label, pos) {
  if (!key || !pos) { keyBubble.style.display = 'none'; return; }
  _kb.copy(pos).project(camera);
  if (_kb.z > 1 || Math.abs(_kb.x) > 1.1 || Math.abs(_kb.y) > 1.1) { keyBubble.style.display = 'none'; return; }
  const host = keyBubble.parentElement, w = host.clientWidth, h = host.clientHeight;
  keyBubble.style.left = ((_kb.x + 1) / 2 * w) + 'px'; keyBubble.style.top = ((1 - _kb.y) / 2 * h) + 'px';
  keyBubble.firstChild.textContent = key; keyBubble.lastChild.textContent = label;
  keyBubble.style.display = 'block';
}
function footFrame(dt = 1 / 60) {
  updateRideables(dt);
  if (!FOOT.on) { updateFootHud(); setKeyBubble(); return; }
  let kb = null;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  if (FOOT.store) {
    updateRoom(Math.min(0.05, dt));
    if (FOOT.z < ROOM.box.z0 + 0.25) leaveStore();
    else if (!FOOT.menu) {
      const p = nearestPersonInFront(1.8, false), l = !p && nearLoot();
      if (nearCounter()) kb = ['E', 'Counter: buy · sell · rob', V(ROOM.counter.x, STORE_Y + 1.6, ROOM.counter.z - 0.6)];
      else if (p) kb = ['E', 'Rob', V(p.x, STORE_Y + 2.1, p.z)];
      else if (l) kb = ['E', `Take ${l.name} ($${l.value})`, V(l.x, STORE_Y + 1.5, l.z)];
      else if (nearShelf()) kb = ['E', 'Pocket something', V(FOOT.x + Math.sin(FOOT.yaw) * 0.8, STORE_Y + 1.5, FOOT.z + Math.cos(FOOT.yaw) * 0.8)];
    }
  } else if (FOOT.car) {
    if (Math.abs(DRIVE.v) < 6) kb = ['F', 'Get out', V(FOOT.car.x, 2.4, FOOT.car.z)];
  } else if (!FOOT.menu) {
    const p = nearestPedInFront(2.2), b = !p && buildingInFront(), fx = Math.sin(FOOT.yaw), fz = Math.cos(FOOT.yaw);
    const bikeD = FOOT.park ? Math.hypot(FOOT.x - FOOT.park.x, FOOT.z - FOOT.park.z) : 99, ride = rideableNear(), car = !ride && carToTake();
    if (bikeD < 2.6) kb = ['F', 'Ride', V(FOOT.park.x, 1.6, FOOT.park.z)];
    else if (ride) kb = ['F', `Take the ${BIKES[ride.key].name}`, V(ride.x, 1.5, ride.z)];
    else if (p) kb = ['E', 'Rob', V(p.x, (p.g.position.y || 0) + 2.15, p.z)];
    else if (car) kb = ['F', car.parked ? 'Get in' : car.kind === 'cop' ? 'Steal the police car' : 'Hijack', V(car.x, 2.3, car.z)];
    else if (b) kb = ['E', b.type === 'store' ? `Enter ${b.name}` : `Break into the ${b.name.toLowerCase()}`, V(FOOT.x + fx * 1.0, FOOT.y + 1.9, FOOT.z + fz * 1.0)];
  }
  updateFootHud('');
  if (kb) setKeyBubble(kb[0], kb[1], kb[2]); else setKeyBubble();
}
