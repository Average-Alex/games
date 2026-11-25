'use strict';
// Inside the big buildings. A high-rise has a lobby with elevators; each floor is a corridor of apartment (or office)
// doors you can break into. A mall is a two-storey concourse with shops along both sides, each one a walk-in interior.
// Rooms are built one at a time (foot.js); walking out of one takes you back a level (ROOM.back).

// Swap the room you're in for another, standing at spawn (or just inside its door)
function goLevel(build, spawn, back) {
  clearRoom(); build();
  ROOM.door.z = ROOM.box.z0 + 0.4; ROOM.back = back || null;
  FOOT.x = spawn ? spawn.x : 0; FOOT.z = spawn ? spawn.z : ROOM.door.z + 0.8; FOOT.yaw = spawn ? spawn.yaw : 0; FOOT.camYaw = FOOT.yaw; FOOT.v = 0;
  camSnap = true;
}
const lvPick = (r, a) => a[Math.floor(r() * a.length)];

// ---------------------------------------------------------------- high-rises
function buildLobby(b) {
  ROOM.kind = 'lobby'; ROOM.box = { x0: -8, x1: 8, z0: -5, z1: 8 };
  const r = mulberry(b.bi * 7 + 3), { x1, z1 } = ROOM.box;
  const dark = r() < 0.35;
  roomShell(b.bi, dark ? '#2a2a2e' : lvPick(r, ['#e4e0d8', '#d8d4cc', '#c8c0b0']), dark ? '#3a3a40' : lvPick(r, ['#e8e2d2', '#d8dce0', '#efe8dc']), { floor: 'marble', glow: dark ? 0.3 : 0.45, H: 4.6, lights: lvPick(r, ['#fffaf0', '#ffe8c8']) });
  // the front desk, a concierge (or a security guard in an office tower)
  ixBox(3.2, 1.1, 0.8, lvPick(r, ['#3a2a20', '#1a1a1e', '#e8e4dc']), 4.2, 0.55, 2.4);
  addRoomPerson(7000 + b.bi, 4.2, 3.2, Math.PI, b.offices ? 'guard' : 'concierge');
  if (b.offices) { const g = ROOM.people[ROOM.people.length - 1]; g.hp = 140; ixArmGuard(g); }
  // seating, plants, a rug
  ixBox(2.4, 0.45, 0.85, lvPick(r, ['#4a5a6e', '#6e4a3a', '#2a2a2e', '#8a7a62']), -4.6, 0.3, 1.2);
  ixBox(2.4, 0.6, 0.2, lvPick(r, ['#4a5a6e', '#6e4a3a', '#2a2a2e', '#8a7a62']), -4.6, 0.75, 1.55, false);
  ixPlant(-7.3, -4.3); ixPlant(7.3, -4.3); if (r() < 0.6) ixPlant(-7.3, z1 - 0.6);
  // two elevators on the back wall, with the floor counter over each
  for (const ex of [-3.2, -0.4]) {
    ixBox(1.6, 2.5, 0.1, '#5a5e64', ex, 1.25, z1 - 0.06, false);
    ixBox(0.7, 2.25, 0.06, '#a8adb4', ex - 0.36, 1.13, z1 - 0.12, false, 0.5); ixBox(0.7, 2.25, 0.06, '#a8adb4', ex + 0.36, 1.13, z1 - 0.12, false, 0.5);
    ixSign([String(1 + Math.floor(r() * b.floors))], 0.5, 0.25, '#0a0a0a', '#ff8a3a', ex, 2.75, z1 - 0.03);
    addSpot(ex, z1 - 1.2, 'Elevator', () => elevatorMenu(b, 0));
  }
  ixSign([b.name], 4.2, 0.6, '#14151a', '#f2efe6', 4.2, 3.6, z1 - 0.03);
}
// choose a floor
function elevatorMenu(b, cur) {
  FOOT.menu = true;
  storeMenu.innerHTML = `<h3>Elevator</h3><p>${b.name} · ${cur ? 'floor ' + cur : 'lobby'} · ${b.offices ? 'offices' : 'apartments'} on every floor</p>`;
  const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(6,1fr);gap:6px;max-height:46vh;overflow:auto;margin-bottom:8px';
  const btn = (label, f) => {
    const e = document.createElement('button'); e.type = 'button'; e.textContent = label; e.disabled = f === cur;
    e.style.cssText = 'justify-content:center;margin:0;padding:8px 0';
    e.onclick = () => { closeStoreMenu(); rideElevator(b, f); }; grid.appendChild(e);
  };
  btn('L', 0); for (let f = 2; f <= b.floors; f++) btn(String(f), f);
  if (towerHelipad(b)) btn('Roof 🚁', 'roof');
  storeMenu.appendChild(grid);
  const c = document.createElement('button'); c.type = 'button'; c.innerHTML = '<span>Stay here</span><span>E</span>'; c.onclick = closeStoreMenu; storeMenu.appendChild(c);
  storeMenu.hidden = false;
  if (document.pointerLockElement) document.exitPointerLock();
}
// some of the taller towers have a helipad on the roof, with a helicopter on it (air.js)
// (only where the map really has a helipad on this building's roof; a guess if the city has no aviation data)
function towerHelipad(b) { return AIRDATA ? !!roofPadOf(b.bi) : b.floors >= 10 && mulberry(b.bi * 53 + 7)() < 0.45; }
function goRoof(b) {
  const keep = FOOT.store;
  clearRoom(); FOOT.store = null;
  const rec = (AIRDATA && roofPadOf(b.bi)) || roofHeli(b.bi);
  // out of the roof access, a few metres from the pad
  const ok = (x, z) => [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].every(([a, c]) => insideBuilding(b.bi, x + a, z + c, 0));
  let x = rec.x, z = rec.z + 0.1;
  for (let r = 10; r >= 4; r -= 1) { let found = false; for (let k = 0; k < 16; k++) { const an = k / 16 * Math.PI * 2, px = rec.x + Math.sin(an) * r, pz = rec.z + Math.cos(an) * r; if (ok(px, pz)) { x = px; z = pz; found = true; break; } } if (found) break; }
  FOOT.x = x; FOOT.z = z; FOOT.y = rec.y; FOOT.roof = { bi: b.bi, h: rec.y, tower: b, store: keep };
  FOOT.yaw = Math.atan2(rec.x - x, rec.z - z); FOOT.camYaw = FOOT.yaw; FOOT.v = 0; camSnap = true;
  sfx.pop && sfx.pop();
  popup(`${b.name} · roof · F by the helicopter to take it, E for the elevator`);
}
function roofToElevator() {
  const R = FOOT.roof; FOOT.roof = null; FOOT.store = R.store;
  goLevel(() => buildLobby(R.tower), { x: -1.8, z: 6.4, yaw: Math.PI });
  popup('Lobby');
}
function rideElevator(b, f) {
  sfx.pop && sfx.pop(); setTimeout(() => sfx.pop && sfx.pop(), 160);
  if (f === 'roof') { goRoof(b); return; }
  popup(f ? `Floor ${f}` : 'Lobby');
  if (!f) goLevel(() => buildLobby(b), { x: -1.8, z: 6.4, yaw: Math.PI });
  else goLevel(() => buildHall(b, f), null, () => { FOOT.z = ROOM.box.z0 + 1.1; FOOT.yaw = 0; elevatorMenu(b, f); });
}
// a floor: a corridor from the elevator, doors down both sides
function buildHall(b, f) {
  ROOM.kind = 'hall'; ROOM.box = { x0: -2.4, x1: 2.4, z0: -5, z1: 19 };
  const r = mulberry(b.bi * 131 + f), { x0, x1, z0, z1 } = ROOM.box;
  roomShell(b.bi * 100 + f, lvPick(r, ['#5a4a5a', '#3a4a5a', '#6a5a4a', '#4a3a3a']), lvPick(r, ['#e8e2d4', '#d8d4c8', '#c8ccc8', '#e0d4c0']), { front: 'wall', door: 'steel', H: 2.9, floor: 'carpet', glow: 0.4, lights: '#fff4e0' });
  ixSign([`${f}`], 0.6, 0.4, '#14151a', '#f2efe6', 1.9, 2.2, z0 + 0.03, 0);
  // the window at the far end
  const win = new THREE.MeshBasicMaterial({ color: '#9ec4dc', toneMapped: false }); ROOM.disp.push(win);
  roomAdd(new THREE.PlaneGeometry(3.2, 1.6), win, 0, 1.6, z1 - 0.02).rotation.y = Math.PI;
  const doorCol = lvPick(r, ['#5a3e28', '#2a2a2e', '#e8e4dc', '#3a2a20', '#6a2a2a']);
  const letters = 'ABCDEF'; let i = 0;
  for (const z of [1.5, 8, 14.5]) for (const side of [-1, 1]) {
    const L = letters[i], idx = i++, wx = side * (x1 - 0.03);
    ixBox(0.06, 2.2, 1.0, doorCol, wx, 1.1, z, false, 0.35);
    ixBox(0.08, 0.05, 0.05, '#c8b060', wx - side * 0.05, 1.0, z - 0.35, false, 0.5);
    ixSign([`${f}${L}`], 0.32, 0.16, '#c8b060', '#1a1a1a', wx - side * 0.04, 1.75, z + 0.7, side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const label = b.offices ? `Office ${f}${L}` : `Apartment ${f}${L}: break in`;
    addSpot(side * (x1 - 0.9), z, label, () => enterUnit(b, f, idx, side, z, L));
  }
  ixPlant(x0 + 0.4, z1 - 0.5);
  addSpot(0, z0 + 1.1, 'Elevator', () => elevatorMenu(b, f));
  // a neighbour in the corridor now and then
  if (r() < 0.4) addRoomPerson(7100 + b.bi + f, (r() - 0.5) * 2, 4 + r() * 10, r() * 6, 'resident', r() < 0.5 ? 'Idle_Loop' : 'Idle_Talking_Loop');
}
// through an apartment or office door: a home with a family (or an office with staff), their things to take
function enterUnit(b, f, idx, side, z, L) {
  const seed = (b.bi * 997 + f * 13 + idx * 7) % 1e7;
  sfx.thump && sfx.thump(0.6);
  const back = () => goLevel(() => buildHall(b, f), { x: side * 1.2, z, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 }, () => { FOOT.z = ROOM.box.z0 + 1.1; elevatorMenu(b, f); });
  goLevel(() => {
    // (an apartment's as well off as its building's area, and the top floors are the penthouses)
    const tier = clamp((typeof homeWealth === 'function' ? homeWealth(b.bi) : 1) + (f >= b.floors - 1 ? 2 : f > b.floors * 0.7 ? 1 : 0), 0, 3);
    if (b.offices) buildOffice(seed); else if (typeof buildHouse === 'function') buildHouse({ bi: seed, shell: { front: 'wall' } }, tier); else buildHomeRoom({ bi: seed, shell: { front: 'wall' } });
    if (mulberry(seed)() < 0.5) mirrorRoom();
  }, null, back);
  if (b.offices) {
    popup(`Office ${f}${L} · E to take things, a weapon out to rob people`, 'bad');
    for (const p of ROOM.people) if (Math.random() < 0.6) { p.cower = true; say(p, pick(Math.random, ['Security!', 'Who let you in?!', 'Call the police!', 'Oh no…']), false); }
    ROOM.called = 10;
  } else homeArrive(`apartment ${f}${L}`);
}
// an office: rows of desks with screens, people at work, things worth taking
function buildOffice(seed) {
  ROOM.kind = 'home';
  const r = mulberry(seed * 3 + 1);
  roomShell(seed, lvPick(r, ['#5a5e64', '#4a4e5a', '#6a6a62']), lvPick(r, ['#eef0f2', '#e8e4dc', '#dfe6ea']), { front: 'wall', door: 'glass', floor: 'carpet', glow: 0.45, lights: '#ffffff' });
  const deskC = lvPick(r, ['#e8e4dc', '#6a4a30', '#2a2a2e', '#c8b090']);
  let k = 0;
  for (const dx of [-4.6, -1.4, 2.2, 5.0]) for (const dz of [-1.6, 1.8]) {
    if (r() < 0.15) continue;
    ixBox(1.5, 0.05, 0.75, deskC, dx, 0.74, dz, false); ixBox(0.05, 0.72, 0.7, '#2a2a2e', dx - 0.7, 0.36, dz, false); ixBox(0.05, 0.72, 0.7, '#2a2a2e', dx + 0.7, 0.36, dz, false);
    ROOM.solids.push({ x0: dx - 0.78, x1: dx + 0.78, z0: dz - 0.4, z1: dz + 0.4 });
    const scr = ixBox(0.55, 0.34, 0.03, '#101216', dx, 1.0, dz + 0.22, false, 0.2);
    roomAdd(new THREE.PlaneGeometry(0.5, 0.29), ixGlowMat(lvPick(r, ['#3a6ad8', '#e8eef2', '#2a2a40'])), dx, 1.0, dz + 0.2).rotation.y = Math.PI; void scr;
    ixBox(0.45, 0.06, 0.45, '#1a1a1e', dx, 0.46, dz - 0.65, false);
    if (r() < 0.6) addRoomPerson(seed + 50 + k, dx, dz - 0.7, 0, 'family', 'Sitting_Idle_Loop');
    if (r() < 0.5) {
      const nm = r() < 0.7 ? 'Laptop' : 'Tablet', key = seed + nm + k;
      if (!lootedHomes.has(key)) { const value = Math.round(150 + r() * 300); const mesh = ixBox(0.34, 0.03, 0.24, '#141518', dx + 0.45, 0.78, dz - 0.1, false, 0.3); ROOM.loot.push({ name: nm, value, mesh, x: dx + 0.45, z: dz - 0.4, key }); }
    }
    k++;
  }
  // the boss's office corner: a safe with petty cash
  const z1 = ROOM.box.z1, key = seed + 'safe';
  ixBox(0.7, 0.8, 0.6, '#3a3e44', 6.3, 0.4, z1 - 0.5);
  if (!lootedHomes.has(key)) { const value = Math.round(400 + r() * 1200); const mesh = ixBox(0.3, 0.12, 0.2, '#3a7a3a', 6.3, 0.86, z1 - 0.5, false, 0.4); ROOM.loot.push({ name: 'Petty cash', value, mesh, x: 6.3, z: z1 - 1.0, key }); }
  ixPlant(-6.4, z1 - 0.5); ixPlant(-6.4, -4.3);
  addRoomPerson(seed + 90, 3.6, z1 - 1.2, Math.PI, 'family', 'Idle_Talking_Loop');
}

// ---------------------------------------------------------------- malls
const mallShopCache = new Map();
function shopsInBuilding(bi) {
  if (mallShopCache.has(bi)) return mallShopCache.get(bi);
  const m = MAP, bb = bi * 4, out = [];
  for (const sh of m.shops) {
    if (sh[2] < m.bBox[bb] - 3 || sh[2] > m.bBox[bb + 2] + 3 || sh[3] < m.bBox[bb + 1] - 3 || sh[3] > m.bBox[bb + 3] + 3) continue;
    if (buildingAt(sh[2], sh[3], 3) === bi && sh[1] !== 'mall') out.push({ name: sh[0], kind: sh[1] });
  }
  mallShopCache.set(bi, out);
  return out;
}
const MALL_FILL = [['Urban Threads', 'clothes'], ['Burger Spot', 'fast_food'], ['Bean There', 'cafe'], ['Quick Mart', 'convenience'], ['Sole Mates', 'shoes'], ['Gold & Co', 'jewelry'], ['Pixel Planet', 'electronics'], ['Noodle House', 'restaurant'], ['Style Lab', 'clothes'], ['Sweet Scoops', 'ice_cream'], ['First City Bank', 'bank'], ['Sports Depot', 'sports']];
function buildMall(b) {
  ROOM.kind = 'mall'; ROOM.box = { x0: -15, x1: 15, z0: -5, z1: 31 };
  const r = mulberry(b.bi * 17 + 9), { x0, x1, z1 } = ROOM.box;
  roomShell(b.bi, lvPick(r, ['#e8e4dc', '#d8d0c4', '#c8ccd0', '#ece6da']), lvPick(r, ['#f2efe8', '#e8e4dc', '#dfe4e8']), { floor: lvPick(r, ['marble', 'tiles']), glow: 0.5, H: 9, lights: '#ffffff' });
  // the upper level: walkways along both sides with glass rails, columns, shops up there too
  for (const s of [-1, 1]) {
    ixBox(4.2, 0.35, 36, '#e8e4dc', s * 12.9, 4.6, 13, false, 0.45);
    const rail = new THREE.MeshBasicMaterial({ color: '#cfe4ee', transparent: true, opacity: 0.25 }); ROOM.disp.push(rail);
    roomAdd(new THREE.PlaneGeometry(36, 1.0), rail, s * 10.8, 5.3, 13).rotation.y = Math.PI / 2;
    for (let z = -2; z <= 28; z += 7.5) ixCyl(0.3, 0.3, 4.6, '#f2efe8', s * 10.8, 2.3, z, true, 0.45, 14);
  }
  // escalators up the middle, planters and benches
  const esc = ixBox(1.4, 0.4, 9.5, '#8a8e94', -2.2, 2.3, 14, false, 0.4); esc.rotation.x = -0.5;
  const esc2 = ixBox(1.4, 0.4, 9.5, '#8a8e94', 2.2, 2.3, 14, false, 0.4); esc2.rotation.x = 0.5;
  ROOM.solids.push({ x0: -3.0, x1: -1.4, z0: 9.8, z1: 18.2 }, { x0: 1.4, x1: 3.0, z0: 9.8, z1: 18.2 });
  for (const z of [3, 24]) { ixCyl(1.5, 1.5, 0.6, '#c8c0b0', 0, 0.3, z, true, 0.4, 20); roomAdd(new THREE.SphereGeometry(1.2, 12, 8), roomMat('#3a6a32', 0.3), 0, 1.2, z).scale.set(1, 0.7, 1); }
  for (const [bx, bz] of [[-5, 6], [5, 6], [-5, 21], [5, 21]]) ixBox(2.0, 0.45, 0.6, '#6a4a30', bx, 0.25, bz);
  // the shops: real ones from the map in this building where there are, made-up ones to fill the rest
  const seen = new Set(), real = shopsInBuilding(b.bi).filter((s) => !seen.has(s.name) && seen.add(s.name)).slice(0, 8), fill = MALL_FILL.filter((f) => !seen.has(f[0])).sort(() => r() - 0.5);
  const shops = []; for (let i = 0; i < 8; i++) { const f = fill[i % fill.length]; shops.push(real[i] || { name: f[0], kind: f[1] }); }
  let i = 0;
  for (const side of [-1, 1]) for (const z of [1.5, 9, 16.5, 24]) {
    const sh = shops[i], si = i++, wx = side * (x1 - 0.04), col = lvPick(r, ['#ffd24a', '#ff3d7f', '#3de0ff', '#3dff8a', '#ffffff', '#ff8a3a']);
    // a lit shop interior behind glass, its sign over the front
    roomAdd(new THREE.PlaneGeometry(5.6, 3.6), roomMat(lvPick(r, ['#f2e6d0', '#e8eef2', '#f2d8d8', '#d8e8d8', '#2a2a30']), 0.9), wx, 1.8, z).rotation.y = -side * Math.PI / 2;
    const gl = new THREE.MeshBasicMaterial({ color: '#cfe4ee', transparent: true, opacity: 0.18 }); ROOM.disp.push(gl);
    roomAdd(new THREE.PlaneGeometry(5.6, 3.6), gl, wx - side * 0.25, 1.8, z).rotation.y = -side * Math.PI / 2;
    ixSign([sh.name], 4.6, 0.7, '#14151a', col, wx - side * 0.27, 4.0, z, -side * Math.PI / 2);
    // and a closed shop above, for the look of it
    roomAdd(new THREE.PlaneGeometry(5.6, 3.2), roomMat(lvPick(r, ['#e8e4dc', '#f2e6d0', '#d8e0e8']), 0.7), wx, 6.6, z).rotation.y = -side * Math.PI / 2;
    const shop = { name: sh.name, kind: sh.kind, bi: (b.bi * 31 + si * 7) % 1e7 };
    addSpot(side * (x1 - 1.4), z, `Enter ${sh.name}`, () => enterMallShop(b, shop, side, z));
  }
  ixSign([b.name], 7, 1.1, '#14151a', '#f2efe6', 0, 6.4, z1 - 0.03);
  // shoppers about, a security guard by the doors
  for (let n = 0; n < 9; n++) {
    const sit = n < 2, [bx, bz] = [[-5, 6], [5, 21]][n % 2] || [0, 0];
    if (sit) addRoomPerson(7200 + b.bi + n, bx + 0.3, bz + 0.05, Math.PI, 'shopper', 'Sitting_Idle_Loop');
    else addRoomPerson(7200 + b.bi + n, (r() - 0.5) * 16, 1 + r() * 26, r() * 6.3, 'shopper', r() < 0.5 ? 'Idle_Loop' : 'Idle_Talking_Loop');
  }
  const g = addRoomPerson(7300 + b.bi, 4, -3.4, Math.PI * 0.85, 'guard'); g.hp = 140; ixArmGuard(g);
  void x0;
}
function enterMallShop(b, shop, side, z) {
  const back = () => goLevel(() => buildMall(b), { x: side * 12.6, z, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
  goLevel(() => { buildStoreRoom(shop); if (mulberry(shop.bi)() < 0.5) mirrorRoom(); }, null, back);
  popup(`${shop.name} · walk out the door to go back to the mall`, '');
}
