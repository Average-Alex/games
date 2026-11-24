'use strict';
// Police on foot. With a wanted level and you on foot, officers turn up (out of the nearest police car if there is one)
// and run you down. Under 3 stars they try to arrest you: let one stand next to you for a couple of seconds and you're
// busted (sprint away to break free). Hit an officer, or point a gun at one, and it's 3 stars: they draw and shoot.
// You can fight back; downed officers bleed like anyone else and raise your wanted level.

const FCOPS = [];
const FCOP_LINES = { arrest: ["Police! Don't move!", 'Hands behind your back!', "You're under arrest!", 'Stop right there!'], shoot: ['Drop the weapon!', 'Shots fired!', 'Officer down!', 'Take him down!'], hurt: ['Agh!', "I'm hit!", 'Officer down!'] };
let fcopSpawnT = 0, fcopArrestSaid = 0;

function fcopGround(x, z) {
  const q = roadQuery(x, z, 14);
  return q.in ? roadY(RC[MAP.eCls[q.e]].rank) : (q.e >= 0 && q.d < q.hw + 2.6 && RC[MAP.eCls[q.e]].walk) ? CURB : 0;
}
// Officers only ever come out of a police car: a chasing car pulls up near you, stops (lights still going), the doors
// thump and the driver and partner step out beside it (one off a police bike). No car close yet: nobody on foot yet.
function spawnFootCop() {
  const now = performance.now();
  const car = units.filter((u) => u.on && !u.player && !u.parked && u.kind !== 'car' && u.chasing && u.v < 7 && !(now - (u.droppedAt || -1e9) < 60000) && Math.hypot(u.x - FOOT.x, u.z - FOOT.z) < 40)
    .sort((a, b) => Math.hypot(a.x - FOOT.x, a.z - FOOT.z) - Math.hypot(b.x - FOOT.x, b.z - FOOT.z))[0];
  if (!car) return null;
  car.droppedAt = now; car.parkT = 30; car.v = 0;                      // (parked where it stopped, for a while)
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
  const doors = car.kind === 'moto' ? [0.9] : [-1.3, 1.3];
  doors.forEach((s, i) => setTimeout(() => {
    if (!car.on || !FOOT.on) return;
    let x = car.x + rx * s + fx * 0.4, z = car.z + rz * s + fz * 0.4;
    if (buildingAt(x, z, 0.3) >= 0) { x = car.x - rx * s + fx * (i ? -1.2 : 0.4); z = car.z - rz * s + fz * (i ? -1.2 : 0.4); }
    if (buildingAt(x, z, 0.3) >= 0) return;
    sfx.thump && sfx.thump(0.35);                                        // the door
    const p = makeFootCop(makeFigure(copLook()), x, z, fcopGround(x, z), false);
    if (p) { p.exitT = 0.7; p.yaw = Math.atan2(rx * Math.sign(s), rz * Math.sign(s)); p.g.rotation.y = p.yaw; if (!i) say(p, pick(Math.random, FCOP_LINES.arrest), false); }
  }, 250 + i * 650));
  return car;
}
function makeFootCop(fig, x, z, y, inRoom) {
  if (!fig) return null;
  const g = new THREE.Group(); g.add(fig.root); scene.add(g);
  const p = { isCop: true, on: true, x, z, yaw: Math.atan2(FOOT.x - x, FOOT.z - z), hp: 100, dead: false, robbed: true, model: fig, g, body: g, shotT: 1 + Math.random(), deadT: 0, leaveT: 0, hostile: false, inRoom };
  g.position.set(x, y, z);
  ixArmGuard(p);
  FCOPS.push(p);
  return p;
}
const copLook = () => { const r = Math.random, female = r() < 0.3; return { sex: female ? 'female' : 'male', tone: Math.floor(r() * 6), hair: female ? 'hair_buns' : r() < 0.6 ? 'hair_buzzed' : 'hair_simpleparted', hairCol: pick(r, ['#1a1410', '#2a1d14', '#5a3a22']), beard: !female && r() < 0.2, top: 'long', topCol: '#1a2440', legs: 'trousers', legsCol: '#141a2a', shoes: '#14151a' }; };
// holed up in a building (a home with hostages, a store you've robbed): after a while they come in through the door
function raidRoom(d) {
  const st = stars();
  if (st < 1) { ROOM.raidT = 0; return; }
  ROOM.raidT = (ROOM.raidT || 0) + d;
  const inside = FCOPS.filter((p) => p.inRoom && !p.dead).length, want = Math.min(4, 1 + st);
  if (ROOM.raidT > 7 && inside < want && (ROOM.raidNext || 0) <= ROOM.raidT) {
    ROOM.raidNext = ROOM.raidT + 1.4;
    if (!ROOM.raided) { ROOM.raided = true; popup('Police! They are coming in!', 'cop'); sfx.glass && sfx.glass(0.6); sfx.thump(0.8); }
    const side = inside % 2 ? 0.6 : -0.6;
    const p = makeFootCop(makeFigure(copLook()), side, ROOM.box.z0 + 0.5, STORE_Y, true);
    if (p) { say(p,pick(Math.random, ['POLICE! Get on the ground!', 'Hands up! Now!', 'Let the hostages go!']), false); }
  }
}
function roomBlockedAt(x, z) {
  const b = ROOM.box, r = 0.3;
  if (x < b.x0 + r || x > b.x1 - r || z < b.z0 + 0.2 || z > b.z1 - r) return true;
  return ROOM.solids.some((s) => x > s.x0 - r && x < s.x1 + r && z > s.z0 - r && z < s.z1 + r);
}
function removeFootCop(p) { scene.remove(p.g); p.model.mixer.stopAllAction(); p.on = false; FCOPS.splice(FCOPS.indexOf(p), 1); }
function clearFootCops() { while (FCOPS.length) removeFootCop(FCOPS[0]); }
// hit by you
function copHurt(p, dmg, how) {
  if (p.dead) return;
  p.hp -= dmg;
  bloodHit(p, p.g.position.y, FOOT.x, FOOT.z, how);
  // attacking an officer: everyone draws
  if (heat < 3) addHeat(Math.max(0.05, 3.05 - heat));
  for (const q of FCOPS) q.hostile = true;
  if (p.hp <= 0) {
    p.dead = true; p.deadT = 0; p.model.cur = null; personPlay(p.model, 'Death01', 0.06);
    setTimeout(() => { if (p.on) bloodPool(p.x - Math.sin(p.yaw) * 0.7, p.g.position.y, p.z - Math.cos(p.yaw) * 0.7); }, 900);
    addHeat(1.2); popup('Officer down', 'cop');
    return;
  }
  p.model.cur = null; personPlay(p.model, how === 'shot' ? 'Hit_Chest' : 'Hit_Head', 0.06);
  if (Math.random() < 0.4) say(p, pick(Math.random, FCOP_LINES.hurt), false);
}
// can the officer see you (no building in between)?
function fcopSees(p, tx, tz) {
  if (p.inRoom) return true;
  const dx = tx - p.x, dz = tz - p.z, L = Math.hypot(dx, dz);
  for (let s = 1.5; s < L - 1; s += 2) if (buildingAt(p.x + dx / L * s, p.z + dz / L * s, 0) >= 0) return false;
  return true;
}
function updateFootCops(d) {
  if (state !== 'play') return;
  const onFoot = FOOT.on && !FOOT.store, st = stars();
  // more officers the hotter you are
  const want = onFoot && !FOOT.car && st >= 1 && FOOT.downT <= 0 ? Math.min(6, 1 + st) : 0;
  fcopSpawnT -= d;
  if (FCOPS.filter((p) => !p.dead && !p.inRoom).length < want && fcopSpawnT <= 0) fcopSpawnT = spawnFootCop() ? 2.5 : 0.5;
  if (FOOT.on && FOOT.store) raidRoom(d);
  const inside = !!(FOOT.on && FOOT.store);
  // where they head: you; or, while you're inside somewhere, the officers outside cover the door
  const door = inside ? FOOT.store.door : null;
  const tx = FOOT.car ? FOOT.car.x : FOOT.x, tz = FOOT.car ? FOOT.car.z : FOOT.z;
  // pointing a gun at an officer makes them all draw
  if (FOOT.aiming && isGun(FOOT.weapon) && st < 3) {
    for (const p of FCOPS) {
      if (p.dead || p.inRoom !== inside) continue;
      const dx = p.x - FOOT.x, dz = p.z - FOOT.z, dd = Math.hypot(dx, dz);
      if (dd < 25 && (dx * Math.sin(FOOT.camYaw) + dz * Math.cos(FOOT.camYaw)) / dd > 0.95) { addHeat(Math.max(0.05, 3.05 - heat)); for (const q of FCOPS) q.hostile = true; say(p, 'Drop the weapon!', false); break; }
    }
  }
  let arresting = null;
  for (let k = FCOPS.length - 1; k >= 0; k--) {
    const p = FCOPS[k], m = p.model;
    const guarding = inside && !p.inRoom, ptx = guarding ? door.x : tx, ptz = guarding ? door.z : tz, dist = Math.hypot(ptx - p.x, ptz - p.z);
    if (p.dead) { p.deadT += d; m.mixer.update(d); if (p.deadT > 40 || (!p.inRoom && dist > 140)) removeFootCop(p); continue; }
    if (!p.inRoom && (dist > 160 || (!FOOT.on && dist > 70))) { removeFootCop(p); continue; }
    const busy = m.cur && /Hit|Shoot/.test(m.cur) && m.actions[m.cur].isRunning();
    // just out of the car: a moment stepping away from the door before they come for you
    if (p.exitT > 0) { p.exitT -= d; const a = p.yaw; p.x += Math.sin(a) * 1.2 * d; p.z += Math.cos(a) * 1.2 * d; personPlay(m, 'Walk_Loop', 0.2); p.g.position.set(p.x, p.g.position.y, p.z); m.mixer.update(d); continue; }
    let speed = 0, face = Math.atan2(ptx - p.x, ptz - p.z), anim = 'Idle_Loop';
    if (guarding) {
      // waiting outside, weapons on the door
      if (dist > 5) { speed = 4.5; anim = 'Jog_Fwd_Loop'; } else anim = st >= 3 || p.hostile ? 'Pistol_Aim_Neutral' : 'Idle_Loop';
    } else if (st === 0 || !FOOT.on || FOOT.downT > 0) {
      // lost you: walk off, then gone
      p.leaveT += d; speed = 1.4; face = Math.atan2(p.x - tx, p.z - tz); anim = 'Walk_Loop';
      if (p.leaveT > (p.inRoom ? 3 : 12)) { removeFootCop(p); continue; }
    } else {
      p.leaveT = 0;
      if (dist < 60) unseenT = 0;                 // they've got eyes on you: the wanted level won't cool off
      const shooting = st >= 3 || p.hostile, sees = dist < 45 && fcopSees(p, tx, tz);
      if (shooting) {
        // hold a firing distance and shoot
        if (dist > 13 || !sees) { speed = 5.0; anim = 'Jog_Fwd_Loop'; }
        else if (dist < 5) { speed = -1.6; anim = 'Walk_Loop'; }
        else anim = 'Pistol_Aim_Neutral';
        p.shotT -= d;
        if (sees && dist < 30 && p.shotT <= 0) {
          p.shotT = 0.9 + Math.random() * 0.9;
          m.cur = null; personPlay(m, 'Pistol_Shoot', 0.05); sfx.gun && sfx.gun();
          if (FOOT.car) { DRIVE.hp -= 3; sfx.metal(0.2); }
          else if (Math.random() < clamp(0.62 - dist * 0.022, 0.18, 0.55)) footHurt(8 + Math.random() * 7, 'Shot by the police');
          if (Math.random() < 0.15) say(p, pick(Math.random, FCOP_LINES.shoot), false);
        }
      } else if (!FOOT.car) {
        // run you down and cuff you
        if (dist > 1.3) { speed = dist > 6 ? 5.4 : 3.2; anim = dist > 6 ? 'Sprint_Loop' : 'Jog_Fwd_Loop'; }
        else { anim = 'Interact'; if (!arresting || dist < arresting.d) arresting = { p, d: dist }; }
      }
    }
    // move, round buildings
    if (speed) {
      // (a negative speed backs away from you while still facing you)
      const dir = speed < 0 ? face + Math.PI : face, sp = Math.abs(speed);
      let moved = false;
      for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
        const a = dir + off * (p.side || 1), nx = p.x + Math.sin(a) * sp * d, nz = p.z + Math.cos(a) * sp * d;
        if (p.inRoom ? !roomBlockedAt(nx, nz) : buildingAt(nx, nz, 0.3) < 0) { p.x = nx; p.z = nz; moved = true; if (off) p.side = Math.sign(off); break; }
      }
      if (!moved) p.side = -(p.side || 1);
    }
    p.yaw += wrapPi(face - p.yaw) * Math.min(1, d * 8);
    if (!busy) personPlay(m, anim, 0.2, anim === 'Sprint_Loop' ? 0.95 : anim === 'Jog_Fwd_Loop' ? 1.2 : 1);
    p.g.position.set(p.x, p.inRoom ? STORE_Y : p.g.position.y + (fcopGround(p.x, p.z) - p.g.position.y) * Math.min(1, d * 12), p.z); p.g.rotation.y = p.yaw;
    m.mixer.update(d);
  }
  // being cuffed: a couple of seconds next to an officer, unless you sprint off or knock them down
  if (arresting && FOOT.v < 4.5 && FOOT.downT <= 0) {
    FOOT.cuffT = (FOOT.cuffT || 0) + d;
    if (performance.now() - fcopArrestSaid > 4000) { fcopArrestSaid = performance.now(); say(arresting.p, pick(Math.random, FCOP_LINES.arrest), false); popup('Getting arrested: sprint away (Shift) or fight', 'cop'); }
    if (FOOT.cuffT > 2.4) { FOOT.cuffT = 0; clearFootCops(); busted(); }
  } else FOOT.cuffT = Math.max(0, (FOOT.cuffT || 0) - d * 2);
  bleedStep(FCOPS, d, (p) => p.g.position.y);
}
