// Wheelie City — taking cars. On foot, F next to any car on the road (a cop car too) pulls the driver out and puts you
// behind the wheel; F again gets you out and leaves it parked. W gas, S brake / reverse, A D steer, Space handbrake.
// You hit what you hit: walls stop you, traffic gets shunted, people get run down. Cars can be wrecked.
'use strict';

const DRIVE = { v: 0, steer: 0, yaw: 0, hp: 100, smokeT: 0, rpm: 850, gear: 1, thr: 0 };
const CAR_DRIVER_LINES = ['Hey! My car!!', 'Get out of my car!', 'Somebody stop him!', 'Are you serious?!', 'Help! Carjacking!'];

// the nearest car you could get into: close to its side, not going fast
function carToTake() {
  let best = null, bd = 3.2;
  for (const u of units) {
    if (!u.on || u.kind === 'moto' || u.player || (u.v > 14 && !u.parked)) continue;
    const d = Math.hypot(u.x - FOOT.x, u.z - FOOT.z);
    if (d < bd + (u.T.L || 4.4) / 2 - 1) { bd = d - (u.T.L || 4.4) / 2 + 1; best = u; }
  }
  // the cars parked along the curb (map instances until you take one)
  for (const pc of parkedCars) {
    const d = Math.hypot(pc.x - FOOT.x, pc.z - FOOT.z) - 1.2;
    if (d < bd) { bd = d; best = { mapCar: pc, x: pc.x, z: pc.z, parked: true, kind: 'car' }; }
  }
  return best;
}
// a parked map car becomes a real one: the instance is hidden, its hitbox removed, a car model put in its place
const OWN_CARS = [];
function realizeParked(pc) {
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  pc.body.setMatrixAt(pc.k, zero); pc.wh.setMatrixAt(pc.k, zero); pc.body.instanceMatrix.needsUpdate = true; pc.wh.instanceMatrix.needsUpdate = true;
  const oi = pc.t.obs ? pc.t.obs.indexOf(pc.ob) : -1; if (oi >= 0) pc.t.obs.splice(oi, 1);
  TAKEN_PARKED.add(parkedKey(pc.x, pc.z)); parkedCars.splice(parkedCars.indexOf(pc), 1);
  const mdl = buildCarModel(pc.type, carPaint[pc.ci % carPaint.length]); scene.add(mdl.g);
  mdl.g.position.set(pc.x, roadY(3), pc.z); mdl.g.rotation.set(0, pc.a, 0);
  const u = { g: mdl.g, body: mdl.body, T: mdl.T, kind: 'car', on: true, parked: true, own: true, x: pc.x, z: pc.z, yaw: pc.a, v: 0, mode: 'free', e: -1, honkCd: 0, nearCd: 0, blockT: 0, chasing: false, bustT: 0, hitT: 0, rock: 0 };
  units.push(u); OWN_CARS.push(u);
  // keep a few of these round; older ones you've left behind go
  while (OWN_CARS.length > 4) { const o = OWN_CARS.find((c) => !c.player); if (!o) break; OWN_CARS.splice(OWN_CARS.indexOf(o), 1); scene.remove(o.g); const ui = units.indexOf(o); if (ui >= 0) units.splice(ui, 1); }
  return u;
}
function takeCar(u) {
  const F = FOOT;
  if (u.mapCar) u = realizeParked(u.mapCar);
  // the driver is dragged out on the street side and runs
  if (!u.parked) {
    const p = peds.find((q) => !q.on);
    const lx = Math.cos(u.yaw), lz = -Math.sin(u.yaw);           // the car's left (driver's side)
    if (p) {
      p.on = true; p.dead = false; p.knock = null; p.hp = 100; p.robbed = true; p.e = -1; p.off = 0; p.dir = 1; p.v = 1.2; p.s = 0; p.side = 1; p.dodge = 0; p.idle = 0; p.g.visible = true;
      p.x = u.x + lx * 1.4; p.z = u.z + lz * 1.4; p.yaw = Math.atan2(lx, lz); p.g.position.set(p.x, 0.03, p.z);
      startFlee(p, u.x, u.z, 10); say(p, pick(Math.random, CAR_DRIVER_LINES), false);
    }
    // a police car: they know at once (it's their car). Anyone else: the driver, or whoever saw, calls it in
    if (u.kind === 'cop') addHeat(2.05); else reportCrime(u.x, u.z, 1.0, false, { outside: true });
    popup(u.kind === 'cop' ? 'Stole a police car!' : 'Carjacked!', u.kind === 'cop' ? 'cop' : 'bad');
  }
  u.player = true; u.parked = false; u.chasing = false; u.mode = 'free'; u.next = null;
  F.car = u; F.aiming = false;
  Object.assign(DRIVE, { v: 0, steer: 0, yaw: u.yaw, hp: u.carHp ?? 100, rpm: 850, gear: 1, thr: 0 });
  personPlay(F.fig, 'Driving_Loop', 0.2);
  sfx.carStart ? sfx.carStart() : sfx.thump(0.3);
  speedo.hidden = false;
  camSnap = true;
}
function leaveCar() {
  const F = FOOT, u = F.car; if (!u) return;
  if (Math.abs(DRIVE.v) > 6) { popup('Slow down to get out'); return; }
  const lx = Math.cos(u.yaw), lz = -Math.sin(u.yaw);
  let x = u.x + lx * 1.6, z = u.z + lz * 1.6;
  if (buildingAt(x, z, 0.3) >= 0) { x = u.x - lx * 1.6; z = u.z - lz * 1.6; }
  u.player = false; u.parked = true; u.v = 0; u.carHp = DRIVE.hp;
  F.car = null; speedo.hidden = true; F.x = x; F.z = z; F.yaw = u.yaw; F.camYaw = u.yaw;
  F.fig.g.visible = true; personPlay(F.fig, 'Idle_Loop', 0.2);
  camSnap = true;
}
// the car's corners and bumpers (relative to its centre) for walls
function carCorners(u, x, z, yaw) {
  const hw = (u.T.W || 1.9) / 2 - 0.05, hl = (u.T.L || 4.4) / 2 - 0.05, s = Math.sin(yaw), c = Math.cos(yaw);
  return [[hl, 0], [hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [0, hw], [0, -hw]].map(([f, l]) => [x + s * f + c * l, z + c * f - s * l]);
}
function carBlocked(u, x, z, yaw) { return carCorners(u, x, z, yaw).some(([px, pz]) => buildingAt(px, pz, 0.05) >= 0 || !!hitAt(px, pz, 0.05) || (landAt(px, pz) === 1 && !roadQuery(px, pz, 8).in)); }
function driveStep(d) {
  const F = FOOT, u = F.car, D = DRIVE, T = u.T;
  F.fire = false;
  const gas = keys.has('KeyW'), brake = keys.has('KeyS'), hb = keys.has('Space');
  const steerIn = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const top = u.kind === 'cop' ? 50 : 42, wrecked = D.hp <= 0;
  // engine, brakes, reverse
  let a = 0;
  if (!wrecked && gas) a = D.v < 0 ? 12 : 6.5 * (1 - D.v / top);
  if (brake) a = D.v > 0.5 ? -12 : wrecked ? 0 : -4.5 * (1 + D.v / 8);
  if (hb) a -= Math.sign(D.v) * 7;
  a -= D.v * Math.abs(D.v) * 0.0025 + Math.sign(D.v) * 0.4;
  D.v += a * d; if (Math.abs(D.v) < 0.05 && !gas && !brake) D.v = 0;
  D.v = clamp(D.v, -9, top);
  // revs and gear, for the engine note and the dash (an automatic: up at 6,000, down at 2,500)
  const av = Math.abs(D.v), GEARS = [0, 9, 17, 26, 35, 99];
  if (D.v < -0.3) D.gear = -1;
  else { D.gear = Math.max(1, D.gear || 1); while (D.gear < 5 && av > GEARS[D.gear]) D.gear++; while (D.gear > 1 && av < GEARS[D.gear - 1] * 0.85) D.gear--; }
  const g = Math.max(1, Math.abs(D.gear)), lo = g === 1 || D.gear < 0 ? 0 : GEARS[g - 1] * 0.75, hi = D.gear < 0 ? 9 : GEARS[g];
  const wantRpm = wrecked ? 0 : 850 + clamp((av - lo) / Math.max(1, Math.min(hi, 45) - lo), 0, 1) * 5600 + (gas && av < 1 ? 1400 : 0);
  D.rpm = (D.rpm || 850) + (wantRpm - (D.rpm || 850)) * Math.min(1, d * 8);
  D.thr += ((gas || (brake && D.v <= 0.5) ? 1 : 0) - D.thr) * Math.min(1, d * 10);
  // steering: tighter at low speed; the handbrake swings the tail
  const maxS = 0.6 / (1 + Math.abs(D.v) / 14);
  D.steer += (steerIn * maxS - D.steer) * Math.min(1, d * 5);
  let yawRate = D.v * Math.tan(D.steer) / (T.wb || 2.7);
  if (hb && Math.abs(D.v) > 6) { yawRate *= 1.6; S.skid = 0.35; } else S.skid = Math.abs(yawRate * D.v) > 9 ? 0.25 : 0;
  const nyaw = D.yaw - yawRate * d;
  const nx = u.x + Math.sin(nyaw) * D.v * d, nz = u.z + Math.cos(nyaw) * D.v * d;
  if (carBlocked(u, nx, nz, nyaw)) {
    // a wall: crunch and bounce back
    const hit = Math.abs(D.v);
    if (hit > 3) { sfx.metal(Math.min(1, hit / 20)); S.shake = Math.max(S.shake, Math.min(0.5, hit * 0.03)); D.hp -= hit * 1.6; if (hit > 10) spawnSparks(nx, 0.6, nz, 0, 0, 10); }
    D.v = -D.v * 0.2;
  } else { u.x = nx; u.z = nz; D.yaw = nyaw; }
  u.yaw = D.yaw; u.v = Math.abs(D.v);
  // traffic: shunt it, and it shunts you
  for (const o of units) {
    if (o === u || !o.on) continue;
    // (a box overlap in your car's frame, so a car waiting in the next lane doesn't count)
    const dx = o.x - u.x, dz = o.z - u.z, dd = Math.hypot(dx, dz);
    if (dd > 8) continue;
    const sY = Math.sin(D.yaw), cY = Math.cos(D.yaw), along = dx * sY + dz * cY, lat = dx * cY - dz * sY;
    const oc = Math.abs(Math.cos(o.yaw - D.yaw)), os = Math.abs(Math.sin(o.yaw - D.yaw)), oL = o.T.L || 4.4, oW = o.T.W || 1.9;
    if (Math.abs(along) > ((T.L || 4.4) + oL * oc + oW * os) / 2 * 0.92 || Math.abs(lat) > ((T.W || 1.9) + oW * oc + oL * os) / 2 * 0.92) continue;
    const rel = Math.abs(D.v - o.v * Math.cos(o.yaw - D.yaw));
    if (rel > 2) { sfx.metal(Math.min(1, rel / 18)); D.hp -= rel * 0.8; if (o.kind === 'car') { sfx.horn(o); say(o, pick(Math.random, CURSES), true); } else addHeat(0.6); }
    o.v *= 0.3; o.hitT = 2; D.v *= 0.55;
    u.x -= dx / (dd || 1) * 0.3; u.z -= dz / (dd || 1) * 0.3;
  }
  // people in the way
  const fx = Math.sin(D.yaw), fz = Math.cos(D.yaw);
  if (Math.abs(D.v) > 2.5) for (const p of peds) {
    if (!p.on || p.dead) continue;
    const dx = p.x - u.x, dz = p.z - u.z, along = dx * fx + dz * fz, lat = -dx * fz + dz * fx;
    if (Math.abs(along) < (T.L || 4.4) / 2 + 0.3 && Math.abs(lat) < (T.W || 1.9) / 2 + 0.25 && (p.hitCd || 0) <= 0) {
      p.hitCd = 1.5; hurtPed(p, Math.abs(D.v) * 9, u.x - fx * 3, u.z - fz * 3, 'car'); sfx.bodyHit(Math.min(1, Math.abs(D.v) / 12));
      if (!p.dead) startFlee(p, u.x, u.z, 8);
      reportCrime(p.x, p.z, 1.0, true, { outside: true });
    }
  }
  // a wreck smokes, and won't drive
  if (D.hp <= 0) {
    if (!u.wreckedShown) { popup('Car wrecked', 'bad'); u.wreckedShown = true; }
    D.smokeT += d; if (D.smokeT > 0.08) { D.smokeT = 0; spawnSmoke(u.x + fx * (T.L || 4.4) * 0.38, 1.0, u.z + fz * (T.L || 4.4) * 0.38, 0, 0, 0.3); }
  } else if (D.hp < 40) { D.smokeT += d; if (D.smokeT > 0.25) { D.smokeT = 0; spawnSmoke(u.x + fx * (T.L || 4.4) * 0.38, 1.0, u.z + fz * (T.L || 4.4) * 0.38, 0, 0, 0.75); } }
  // the model, and you in the driver's seat
  const q = roadQuery(u.x, u.z, 12), ry = q.in ? roadY(RC[MAP.eCls[q.e]].rank) : 0;
  u.g.position.set(u.x, ry, u.z); u.g.rotation.set(0, u.yaw, 0);
  u.body.rotation.z = -clamp(yawRate * D.v * 0.006, -0.06, 0.06); u.body.rotation.x = clamp(-a * 0.004, -0.04, 0.04);
  const lx = Math.cos(u.yaw), lz = -Math.sin(u.yaw);
  F.x = u.x + lx * 0.37; F.z = u.z + lz * 0.37; F.yaw = u.yaw; F.y = ry - 0.45;
  F.fig.mixer.update(d);
  updateSpeedo();
}
// ---------------------------------------------------------------- the dash: a speedo dial, rev bar, gear and damage
const speedo = document.createElement('div'); speedo.id = 'speedo'; speedo.hidden = true;
speedo.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true">
  <circle cx="100" cy="100" r="93" fill="rgba(10,12,18,.5)"/>
  <path d="M38 158 A80 80 0 1 1 162 158" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="12" stroke-linecap="round"/>
  <path class="rev" d="M38 158 A80 80 0 1 1 162 158" fill="none" stroke="#ff3d7f" stroke-width="12" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>
  ${Array.from({ length: 9 }, (_, i) => { const a = (-225 + i * 33.75) * Math.PI / 180; return `<line x1="${100 + Math.cos(a) * 64}" y1="${100 + Math.sin(a) * 64}" x2="${100 + Math.cos(a) * 56}" y2="${100 + Math.sin(a) * 56}" stroke="#fff" stroke-width="2" opacity=".7"/>`; }).join('')}
  <line class="needle" x1="100" y1="100" x2="100" y2="34" stroke="#ffd24a" stroke-width="3" stroke-linecap="round"/>
  <circle cx="100" cy="100" r="6" fill="#ffd24a"/></svg>
  <div class="num"><b>0</b><span>km/h</span></div><div class="gear">1</div><div class="dmg"><i></i></div>`;
// (the same dial for every vehicle, bikes and scooters too: top left, where the bike's speed readout was)
{ const tl = document.querySelector('#hud .tl'); if (tl) tl.prepend(speedo); else (document.querySelector('#stage') || document.body).append(speedo); }
{ const st = document.createElement('style'); st.textContent = `
  #speedo { position: relative; z-index: 6; width: 190px; height: 190px; margin: -18px 0 -22px -14px; pointer-events: none; color: #fff; font-family: system-ui, sans-serif; filter: drop-shadow(0 2px 6px rgba(0,0,0,.6)); }
  #hud .tl .speed, #hud #rpmBar { display: none !important; }
  @media (max-width: 640px) { #speedo { width: 140px; height: 140px; margin: -14px 0 -16px -10px; } #speedo .num { transform: scale(.74); transform-origin: 50% 0; top: 80px; } #speedo .gear { top: 44px; } #speedo .dmg { left: 40px; right: 40px; bottom: 10px; } }
  #speedo .dmg.off { visibility: hidden; }
  #speedo[hidden] { display: none; } #speedo svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  #speedo .num { position: absolute; left: 0; right: 0; top: 108px; text-align: center; } #speedo .num b { display: block; font: 800 34px/1 system-ui, sans-serif; font-variant-numeric: tabular-nums; } #speedo .num span { font-size: 11px; opacity: .7; letter-spacing: .15em; }
  #speedo .gear { position: absolute; left: 50%; top: 62px; transform: translateX(-50%); font: 800 18px/1 system-ui, sans-serif; color: #ffd24a; }
  #speedo .dmg { position: absolute; left: 55px; right: 55px; bottom: 14px; height: 5px; background: rgba(255,255,255,.18); border-radius: 3px; overflow: hidden; } #speedo .dmg i { display: block; height: 100%; background: #3dff8a; }`;
  document.head.appendChild(st); }
const speedoEls = { rev: speedo.querySelector('.rev'), needle: speedo.querySelector('.needle'), num: speedo.querySelector('.num b'), gear: speedo.querySelector('.gear'), dmg: speedo.querySelector('.dmg i') };
// the dial: speed against the vehicle's top of scale, the rev arc (0..1), the gear, and a damage bar (hp, or null for none)
function setSpeedo(kmh, max, rev, red, gear, hp) {
  const E = speedoEls;
  E.num.textContent = Math.round(kmh);
  E.needle.setAttribute('transform', `rotate(${-135 + Math.min(1, kmh / max) * 270} 100 100)`);
  E.rev.setAttribute('stroke-dasharray', `${clamp(rev * 100, 0, 100).toFixed(1)} 100`);
  E.rev.setAttribute('stroke', red ? '#ff4a3d' : '#ff3d7f');
  E.gear.textContent = gear;
  E.dmg.parentNode.classList.toggle('off', hp == null);
  if (hp != null) { const h = Math.max(0, hp); E.dmg.style.width = h + '%'; E.dmg.style.background = h > 60 ? '#3dff8a' : h > 30 ? '#ffd24a' : '#ff4a3d'; }
}
function updateSpeedo() {
  setSpeedo(Math.abs(DRIVE.v) * 3.6, 240, DRIVE.rpm / 7000, DRIVE.rpm > 6000, DRIVE.hp <= 0 ? '—' : DRIVE.gear < 0 ? 'R' : Math.abs(DRIVE.v) < 0.3 && DRIVE.thr < 0.1 ? 'N' : DRIVE.gear, DRIVE.hp);
}
// on the bike (or a scooter): the same dial, scaled to the bike's top speed; petrol bikes show revs and gear, electric
// ones the throttle
function updateBikeSpeedo(B) {
  const gas = B.type === 'gas', max = Math.max(60, Math.ceil(B.vmax * 3.6 * 1.15 / 20) * 20);
  setSpeedo(Math.abs(S.v) * 3.6, max, gas ? S.rpm / B.engine.redline : S.thr, gas && S.rpm > B.engine.redline * 0.92, gas ? (S.v < 0.3 && S.thr < 0.05 ? 'N' : String(S.gear)) : 'E', null);
}
// ---------------------------------------------------------------- bikes and scooters parked on the street
// A few rideables stand on the sidewalks round you while you're on foot. F next to one takes it; your own bike is left
// parked where it was (so you can go back for it).
const RIDE_PARK = [];
const STREET_RIDES = ['scooter', 'scooter', 'scooter', 'grom', 'duke390', 'ninja250', 'lbx', 'z900', 'sx125', 'ultra'];
let bikePropMode = false;
function makeBikeProp(key) {
  const keepRig = rig, keepKey = bikeKey;
  rig = null; bikeKey = key; bikePropMode = true;
  try { buildBike(); } finally { bikePropMode = false; }
  const prop = rig; rig = keepRig; bikeKey = keepKey;
  prop.rider.visible = false;
  return prop;
}
function disposeProp(prop) {
  scene.remove(prop.root);
  prop.root.traverse((o) => { if (o.geometry && !o.isSkinnedMesh) o.geometry.dispose(); });
}
function placeProp(r) {
  const B = BIKES[r.key];
  r.prop.root.position.set(r.x, (r.y || 0) + B.R, r.z); r.prop.root.rotation.order = 'YXZ'; r.prop.root.rotation.set(0, r.yaw, 0.12);
}
function spawnRideable() {
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * TAU, dd = 18 + Math.random() * 60, x = FOOT.x + Math.sin(a) * dd, z = FOOT.z + Math.cos(a) * dd;
    const q = roadQuery(x, z, 25, (e) => RC[MAP.eCls[e]].walk); if (q.e < 0) continue;
    const i = q.i, cx = MAP.px[i] + (MAP.px[i + 1] - MAP.px[i]) * q.t, cz = MAP.pz[i] + (MAP.pz[i + 1] - MAP.pz[i]) * q.t;
    const tx = MAP.px[i + 1] - MAP.px[i], tz = MAP.pz[i + 1] - MAP.pz[i], tl = Math.hypot(tx, tz) || 1, side = q.side || 1;
    const px = cx - tz / tl * (q.hw + 1.4) * side, pz = cz + tx / tl * (q.hw + 1.4) * side;
    if (buildingAt(px, pz, 0.8) >= 0 || hitAt(px, pz, 0.6) || RIDE_PARK.some((r) => Math.hypot(r.x - px, r.z - pz) < 6)) continue;
    const key = STREET_RIDES[Math.floor(Math.random() * STREET_RIDES.length)];
    const r = { key, x: px, z: pz, y: CURB, yaw: Math.atan2(tx, tz) + (Math.random() < 0.5 ? 0 : Math.PI), prop: makeBikeProp(key) };
    placeProp(r); RIDE_PARK.push(r);
    return;
  }
}
let rideSpawnT = 0;
function updateRideables(dt) {
  rideSpawnT -= dt;
  for (let k = RIDE_PARK.length - 1; k >= 0; k--) { const r = RIDE_PARK[k]; if (Math.hypot(r.x - S.x, r.z - S.z) > 220 && !r.mine) { disposeProp(r.prop); RIDE_PARK.splice(k, 1); } }
  if (FOOT.on && !FOOT.store && rideSpawnT <= 0 && RIDE_PARK.filter((r) => !r.mine).length < 4) { rideSpawnT = 1.5; spawnRideable(); }
}
function rideableNear() {
  let best = null, bd = 2.2;
  for (const r of RIDE_PARK) { const d = Math.hypot(r.x - FOOT.x, r.z - FOOT.z); if (d < bd) { bd = d; best = r; } }
  return best;
}
function takeRideable(r) {
  // your bike stays where it's parked, as a prop you can come back for
  const P = FOOT.park, mine = { key: bikeKey, x: P.x, z: P.z, y: P.y, yaw: P.psi, prop: rig, mine: true };
  rig.rider.visible = false; placeProp(mine); RIDE_PARK.push(mine);
  RIDE_PARK.splice(RIDE_PARK.indexOf(r), 1);
  if (r.mine) { rig = r.prop; } else { disposeProp(r.prop); rig = null; }
  bikeKey = r.key;
  if (!r.mine) buildBike();
  sfx.setBike();
  FOOT.park = { x: r.x, z: r.z, y: r.y || 0, psi: r.yaw };
  if (!r.mine) popup(`Took a ${BIKES[r.key].brand} ${BIKES[r.key].name}`, 'good');
  if (!r.mine && r.key !== 'scooter' && copNear(80)) addHeat(0.6);
  hopOn();
  rig.root.rotation.set(0, r.yaw, 0);
}
function driveCamera(dt) {
  const u = FOOT.car, back = (u.T.L || 4.4) + 2.6, high = 2.4;
  const fx = Math.sin(DRIVE.yaw), fz = Math.cos(DRIVE.yaw);
  const want = tmp2.set(u.x - fx * back, high + Math.min(1.2, Math.abs(DRIVE.v) * 0.02), u.z - fz * back);
  // keep out of walls
  for (let k = 1; k <= back; k += 0.5) { const px = u.x - fx * k, pz = u.z - fz * k; if (buildingAt(px, pz, 0.3) >= 0) { want.x = u.x - fx * Math.max(1.5, k - 0.6); want.z = u.z - fz * Math.max(1.5, k - 0.6); want.y += 1.2; break; } }
  if (camSnap) camPos.copy(want); else camPos.lerp(want, 1 - Math.exp(-dt * 6));
  camera.position.copy(camPos); camera.up.set(0, 1, 0);
  lookAt.lerp(tmp.set(u.x + fx * 6, 1.1, u.z + fz * 6), 1 - Math.exp(-dt * 10));
  if (camSnap) lookAt.set(u.x + fx * 6, 1.1, u.z + fz * 6);
  camera.lookAt(lookAt);
  camera.fov += ((62 + Math.min(16, Math.abs(DRIVE.v) * 0.4)) - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
  camSnap = false;
}
