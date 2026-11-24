'use strict';
// Walk-in interiors beyond the plain store and home (foot.js builds the room shell and runs the people):
// restaurants and cafés, bars and clubs, banks, clothes shops and casinos. Each is built from the shop's OSM kind,
// with "spots" (E) for the things to do there: eat, drink, gamble, try on clothes, rob the till, drill the vault.

function interiorKind(k) {
  k = k || '';
  if (/^(cafe|restaurant|fast_food|ice_cream|bakery|food_court|coffee|deli|pastry|confectionery)$/.test(k)) return 'eatery';
  if (/^(bar|pub|nightclub|biergarten|wine|alcohol)$/.test(k)) return k === 'wine' || k === 'alcohol' ? 'store' : 'bar';
  if (k === 'bank') return 'bank';
  if (/^(clothes|shoes|boutique|fashion|fashion_accessories|bag|jewelry|department_store|sports)$/.test(k)) return 'clothes';
  if (k === 'casino') return 'casino';
  return 'store';
}

// ---------------------------------------------------------------- small helpers
function ixBox(w, h, d, col, x, y, z, solid = true, glow = 0.3) {
  const me = roomAdd(new THREE.BoxGeometry(w, h, d), roomMat(col, glow), x, y, z,
    solid ? { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 } : null);
  return me;
}
function ixCyl(r0, r1, h, col, x, y, z, solid = false, glow = 0.3, seg = 18) {
  return roomAdd(new THREE.CylinderGeometry(r0, r1, h, seg), roomMat(col, glow), x, y, z,
    solid ? { x0: x - r1, x1: x + r1, z0: z - r1, z1: z + r1 } : null);
}
function ixGlowMat(col) { const m = new THREE.MeshBasicMaterial({ color: col, toneMapped: false }); ROOM.disp.push(m); return m; }
// a lit sign or menu board, drawn on a canvas
function ixSign(lines, w, h, bg, fg, x, y, z, ry = Math.PI) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * h / w); const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  const n = lines.length, lh = cv.height / (n + 0.6);
  lines.forEach((t, i) => { c.font = `${i ? 600 : 800} ${Math.round(lh * (i ? 0.55 : 0.75))}px system-ui, sans-serif`; c.fillText(t, cv.width / 2, lh * (i + 0.8)); });
  const tx = new THREE.CanvasTexture(cv); tx.encoding = THREE.sRGBEncoding; ROOM.disp.push(tx);
  const m = new THREE.MeshBasicMaterial({ map: tx, toneMapped: false }); ROOM.disp.push(m);
  const me = roomAdd(new THREE.PlaneGeometry(w, h), m, x, y, z); me.rotation.y = ry; me.userData.sign = true; return me;
}
const ixHeatTo = (n) => { if (heat < n) addHeat(Math.max(0.05, n + 0.05 - heat)); };
const ixArmed = () => FOOT.weapon !== 'fists';
function ixPay(price) {
  if (cash < price) { popup(`Not enough cash ($${price})`, 'bad'); return false; }
  addCash(-price); sfx.cash && sfx.cash(); return true;
}
const ixWorker = (role) => ROOM.people.find((q) => q.role === role);
const ixServing = (role) => () => { const w = ixWorker(role); return !!w && !w.dead && !w.cower; };
// hold someone up at a till: needs a weapon out; they hand it over; the alarm goes
function ixRob(key, role, lo, hi, stars, what) {
  if (robbedTills.has(key)) { popup('Already emptied'); return; }
  if (!ixArmed()) { popup('Pull out a weapon first (2–5)'); return; }
  const w = ROOM.people.filter((q) => q.role === role && !q.dead);
  if (!w.length) { popup('Nobody here to open it'); return; }
  for (const p of w) { p.cower = true; p.model.cur = null; personPlay(p.model, 'Interact', 0.1); }
  say(w[0], pick(Math.random, ["Don't shoot!", 'Take it, take it!', 'OK! OK! Just stay calm!']), false);
  robbedTills.add(key);
  const amt = Math.round(lo + Math.random() * (hi - lo));
  addCash(amt); sfx.cash && sfx.cash();
  popup(`${what} +$${amt.toLocaleString()}`, 'good');
  roomPanic(); if (ROOM.people.some((q) => q.role === 'guard' && !q.dead)) ROOM.alarm = true;
  popup('The alarm is going off', 'cop'); ixHeatTo(stars);
}
// a guard carries a pistol
function ixArmGuard(p) {
  const hand = p.model.root.getObjectByName('hand_r'); if (!hand) return;
  const gm = roomMat('#1c1d20', 0.1), g = new THREE.Group();
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.17), gm); s1.position.set(0, 0.02, 0.05); g.add(s1);
  const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.09, 0.035), gm); s2.position.set(0, -0.03, -0.01); g.add(s2);
  p.model.root.updateMatrixWorld(true);
  const s = 1 / (hand.getWorldScale(new THREE.Vector3()).x || 1); g.scale.setScalar(s); g.position.set(0, 0.08 * s, 0.03 * s); g.rotation.set(Math.PI / 2, 0, 0);
  hand.add(g);
}
// a table with chairs round it, and maybe people sitting at it
function ixTable(x, z, seed, opts = {}) {
  const r = mulberry(seed), top = opts.top || '#6a4a30', round = opts.round ?? true;
  if (round) { ixCyl(0.5, 0.5, 0.05, top, x, 0.76, z, false); ixCyl(0.06, 0.06, 0.74, '#2a2a2e', x, 0.37, z, false); }
  else { ixBox(1.0, 0.05, 0.8, top, x, 0.76, z, false); for (const [a, b] of [[-0.42, -0.32], [0.42, -0.32], [-0.42, 0.32], [0.42, 0.32]]) ixBox(0.05, 0.74, 0.05, '#2a2a2e', x + a, 0.37, z + b, false); }
  ROOM.solids.push({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.45, z1: z + 0.45 });
  for (const side of [-1, 1]) {
    const cx = x + side * 0.78;
    ixBox(0.42, 0.05, 0.42, opts.chair || '#3a2a20', cx, 0.45, z, false);
    ixBox(0.05, 0.5, 0.42, opts.chair || '#3a2a20', cx + side * 0.2, 0.72, z, false);
    for (const [a, b] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) ixBox(0.03, 0.45, 0.03, '#202022', cx + a, 0.22, z + b, false);
    if (r() < (opts.busy ?? 0.55)) addRoomPerson(seed * 7 + side * 3 + 11, cx + side * 0.05, z, side < 0 ? Math.PI / 2 : -Math.PI / 2, 'diner', r() < 0.5 ? 'Sitting_Talking_Loop' : 'Sitting_Idle_Loop');
  }
  // a plate or two, a glass
  ixCyl(0.13, 0.13, 0.015, '#f2f0ea', x - 0.2, 0.79, z, false, 0.5); ixCyl(0.035, 0.03, 0.12, opts.glass || '#c8e0f0', x + 0.18, 0.84, z + 0.1, false, 0.5, 8);
}
function ixPlant(x, z) { ixCyl(0.22, 0.17, 0.42, '#5a4030', x, 0.21, z, true); roomAdd(new THREE.SphereGeometry(0.42, 10, 8), roomMat('#3a6a32', 0.3), x, 0.85, z).scale.set(1, 1.3, 1); }

// ---------------------------------------------------------------- restaurant, café, fast food
function buildEatery(shop) {
  ROOM.kind = 'eatery';
  const r = mulberry(shop.bi * 17 + 3), fast = shop.kind === 'fast_food', cafe = /cafe|coffee|bakery|pastry|ice_cream/.test(shop.kind);
  // every place is decorated its own way
  ROOM.box = { x0: -7, x1: 7, z0: -5, z1: 5 + Math.floor(r() * 3) };
  const { x0, x1, z1 } = ROOM.box, P = (a) => a[Math.floor(r() * a.length)];
  const floorC = fast ? P(['#e8e4dc', '#d8d0c0', '#c8ccd0', '#f0e0c0']) : cafe ? P(['#a8865c', '#8a6a4a', '#c8b090', '#6a5a4a']) : P(['#6e5038', '#4a3424', '#8a6a4a', '#5a4a3a']);
  const wallC = fast ? P(['#f2e6c8', '#e8f0f2', '#f8d8c8', '#fff4d8']) : cafe ? P(['#efe4d2', '#dfe8e0', '#2a3a34', '#e8d8c8', '#c8d8e0']) : P(['#8a3a2a', '#2a3a4a', '#e8dcc8', '#3a4a32', '#5a2a3a']);
  const accent = fast ? P(['#c8282a', '#e8a020', '#2a6ad8', '#2a9d4a']) : P(['#4a3424', '#2a2a2e', '#6a4a30', '#3a4a5a']);
  roomShell(shop.bi, floorC, wallC, { floor: fast ? P(['checker', 'tiles']) : cafe ? P(['planks', 'tiles']) : P(['planks', 'carpet']), glow: fast ? 0.45 : 0.3 + r() * 0.1, lights: fast ? '#ffffff' : P(['#ffe6b8', '#ffd89a', '#fff4e0']) });
  // the counter across the back right, the kitchen behind it
  const cz = z1 - 1.7;
  ixBox(5.6, 1.05, 0.8, accent, 3.2, 0.52, cz);
  ixBox(5.7, 0.05, 0.9, '#2a2a2e', 3.2, 1.07, cz, false);
  ROOM.solids.push({ x0: 0.35, x1: 0.45, z0: cz, z1: z1 });             // the end of the counter: you can't walk behind it
  ixBox(5.5, 0.9, 0.6, '#b8bcc0', 3.6, 0.45, z1 - 0.35, false, 0.4);      // the kitchen line
  ixBox(1.2, 0.08, 0.5, '#2a2a2e', 2.6, 0.95, z1 - 0.35, false);          // the grill
  ixBox(0.7, 1.9, 0.6, '#d8dcdf', 6.4, 0.95, z1 - 0.4, false, 0.45);      // fridge
  ixBox(0.4, 0.25, 0.3, '#202226', 5.2, 1.22, cz);                        // the register
  if (cafe) { ixBox(0.5, 0.45, 0.4, '#8a8e94', 1.6, 1.32, cz, false, 0.5); ixBox(1.6, 0.4, 0.5, '#e8f0f4', 3.2, 1.3, cz, false, 0.6); }   // espresso machine, cake case
  const menu = fast ? [shop.name, 'Burger meal  $12', 'Fries  $4', 'Shake  $5'] : cafe ? [shop.name, 'Coffee  $4', 'Sandwich  $9', 'Cake  $6'] : [shop.name, "Today's special  $12", 'Pasta  $16', 'Steak  $28'];
  ixSign(menu, 3.6, 1.3, fast ? '#1a1a1a' : '#20241e', fast ? '#ffd24a' : '#f2efe6', 3.2, 2.35, z1 - 0.02);
  // staff: someone at the till, a cook in the kitchen
  addRoomPerson(5100 + shop.bi, 3.0, cz + 0.85, Math.PI, 'cashier');
  addRoomPerson(5200 + shop.bi, 2.6, z1 - 1.0, 0, 'cook');
  // tables on the left and in front
  // tables: a random number of them, round or square, in a loose grid on the left and in front
  let k = 0;
  const round = !fast && r() < 0.6, top = fast ? P(['#d8d4cc', '#f2f2f0', '#c8282a']) : cafe ? P(['#c8b08a', '#f2efe6', '#3a3a3e']) : P(['#5a3a24', '#f2efe6', '#2a2a2e']);
  const chair = fast ? accent : P(['#3a2a20', '#1a1a1a', '#6a4a30', '#8a1a2a', '#2a4a3a']), busy = 0.3 + r() * 0.45;
  const rows = []; for (let z = -2.6; z <= z1 - 3; z += 2.6 + r() * 0.4) rows.push(z);
  for (const tx of [-5.2, -2.6]) for (const tz of rows) if (r() < 0.85) ixTable(tx + (r() - 0.5) * 0.3, tz, shop.bi * 10 + k++, { round, top, chair, busy });
  if (r() < 0.7) ixTable(3.6, -2.4, shop.bi * 10 + k++, { round, top, chair, busy });
  if (r() < 0.5) ixTable(1.0, -2.0, shop.bi * 10 + k++, { round, top, chair, busy });
  ixPlant(x1 - 0.5, -4.3); if (r() < 0.6) ixPlant(x0 + 0.5, -4.3); if (r() < 0.5) ixPlant(x0 + 0.5, z1 - 0.6);
  // order a meal (heals you), or rob the register
  const price = fast ? 12 : cafe ? 9 : 16;
  addSpot(2.2, cz - 0.9, `Order food $${price} (+40 health)`, () => {
    if (FOOT.hp >= 100) { popup("You're not hungry"); return; }
    if (!ixPay(price)) return;
    FOOT.hp = Math.min(100, FOOT.hp + 40);
    say(ixWorker('cashier'), pick(Math.random, ['Enjoy your meal!', 'Here you go!', 'Thanks, come again!']), false);
    popup(`Ate well · +40 health`, 'good');
  }, ixServing('cashier'));
  addSpot(5.2, cz - 0.9, () => robbedTills.has(shop.bi) ? 'Already emptied' : 'Rob the register', () => ixRob(shop.bi, 'cashier', 250, 800, 2, 'Robbed the register'), () => !!ixWorker('cashier'));
}

// ---------------------------------------------------------------- bars, pubs and clubs
function buildBar(shop) {
  ROOM.kind = 'bar';
  const pub = shop.kind === 'pub' || shop.kind === 'biergarten', club = shop.kind === 'nightclub' || (!pub && shop.bi % 2 === 0);
  ROOM.box = { x0: -8, x1: 8, z0: -5, z1: 7 };
  const { x0, x1, z0, z1 } = ROOM.box;
  roomShell(shop.bi, pub ? '#5a3a22' : '#202026', pub ? '#5a2a20' : '#18181e', { floor: pub ? 'planks' : 'tiles', glow: pub ? 0.22 : 0.1, H: 3.6, lights: pub ? '#ffcf8a' : false, ceiling: '#141418', dark: true });
  // the bar along the right wall, bottles on the back bar, stools in front
  const bx = x1 - 2.2;
  ixBox(0.8, 1.1, 7.5, pub ? '#4a2a18' : '#101014', bx, 0.55, 2.2);
  ixBox(0.9, 0.05, 7.6, pub ? '#6a4024' : '#2a2a32', bx, 1.12, 2.2, false, 0.4);
  const strip = roomAdd(new THREE.BoxGeometry(0.04, 0.04, 7.5), ixGlowMat(club ? '#ff3d7f' : '#ffb04a'), bx - 0.42, 0.25, 2.2); void strip;
  ixBox(0.4, 2.2, 7.5, '#1a1410', x1 - 0.2, 1.1, 2.2, false, 0.2);
  const bottle = new THREE.CylinderGeometry(0.04, 0.045, 0.3, 8); ROOM.disp.push(bottle);
  const bm = new THREE.MeshBasicMaterial({ toneMapped: false }); ROOM.disp.push(bm);
  const im = new THREE.InstancedMesh(bottle, bm, 3 * 34), m4 = new THREE.Matrix4(), col = new THREE.Color(); let k = 0;
  const bc = ['#7ac84a', '#c8a04a', '#e8e8f0', '#4a8ac8', '#a84a2a', '#e8c86a'];
  for (let lvl = 0; lvl < 3; lvl++) for (let i = 0; i < 34; i++) { m4.makeTranslation(x1 - 0.42, 1.25 + lvl * 0.45, -1.4 + i * 0.21); im.setMatrixAt(k, m4); col.set(bc[(i * 5 + lvl) % bc.length]).multiplyScalar(0.7); im.setColorAt(k++, col); }
  ROOM.g.add(im);
  for (let z = -1; z <= 5.5; z += 1.1) { ixCyl(0.2, 0.2, 0.06, '#8a1a2a', bx - 0.85, 0.75, z, false); ixCyl(0.03, 0.03, 0.72, '#a8acb0', bx - 0.85, 0.36, z, false); }
  addRoomPerson(5300 + shop.bi, x1 - 1.1, 1.6, -Math.PI / 2, 'cashier');
  // neon along the walls
  const neonC = club ? ['#ff3d7f', '#3de0ff', '#a64dff'] : ['#ffb04a'];
  neonC.forEach((c, i) => { roomAdd(new THREE.BoxGeometry(0.05, 0.05, z1 - z0 - 0.5), ixGlowMat(c), x0 + 0.05, 2.6 + i * 0.25, (z0 + z1) / 2); });
  roomAdd(new THREE.BoxGeometry(x1 - x0 - 4, 0.05, 0.05), ixGlowMat(neonC[0]), -2, 3.1, z1 - 0.05);
  ixSign([shop.name], 4, 0.8, '#000000', club ? '#ff3d7f' : '#ffb04a', -2, 2.4, z1 - 0.03);
  if (club) {
    // the dance floor: lit tiles that change with the beat, dancers, the DJ
    const tiles = [], cols = ['#ff3d7f', '#3de0ff', '#a64dff', '#ffd23d', '#3dff8a'];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
      const m = new THREE.MeshBasicMaterial({ color: cols[(i + j) % 5], toneMapped: false }); ROOM.disp.push(m);
      roomAdd(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2), m, -6 + i + 0.5, 0.012, 1.4 + j);
      tiles.push(m);
    }
    let t = 0;
    ROOM.anim.push((d) => { t += d; const beat = Math.floor(t * 2.1); tiles.forEach((m, i) => { m.color.set(cols[(i * 3 + beat) % 5]).multiplyScalar(((i + beat) % 3 === 0) ? 1 : 0.35); }); });
    const r = mulberry(shop.bi * 5 + 1);
    for (let n = 0; n < 6; n++) { const p = addRoomPerson(5400 + shop.bi * 10 + n, -5.3 + r() * 3.6, 1.8 + r() * 3, r() * Math.PI * 2, 'patron', 'Dance_Loop'); p.model.actions.Dance_Loop && (p.model.actions.Dance_Loop.time = r() * 2); }
    ixBox(2.4, 1.1, 0.8, '#101014', -3.5, 0.55, z1 - 0.9);
    roomAdd(new THREE.BoxGeometry(2.4, 0.04, 0.04), ixGlowMat('#3de0ff'), -3.5, 1.05, z1 - 1.31);
    for (const sx of [-4.1, -2.9]) ixCyl(0.17, 0.17, 0.03, '#2a2a30', sx, 1.12, z1 - 0.9, false, 0.4);
    addRoomPerson(5500 + shop.bi, -3.5, z1 - 0.35, Math.PI, 'patron', 'Dance_Loop');
    // a disco ball
    const ball = roomAdd(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshStandardMaterial({ color: '#d8dce0', roughness: 0.15, metalness: 1, flatShading: true }), -3.5, 3.0, 3.0);
    ROOM.disp.push(ball.material); ROOM.anim.push((d) => { ball.rotation.y += d * 0.8; });
  } else {
    // a pub: tables, people drinking, a dartboard
    let k2 = 0;
    for (const tx of [-5.6, -2.8]) for (const tz of [-1.8, 1.2, 4.2]) ixTable(tx, tz, shop.bi * 11 + k2++, { top: '#4a2a18', chair: '#2a1a10', glass: '#e8b04a', busy: 0.6 });
    ixCyl(0.25, 0.25, 0.04, '#1a1a1a', x0 + 0.03, 1.7, 5.5, false).rotation.z = Math.PI / 2;
  }
  // a drink makes the room swim a bit
  addSpot(bx - 1.0, 0.5, 'Buy a drink $8', () => {
    if (!ixPay(8)) return;
    FOOT.drunk = Math.min(60, (FOOT.drunk || 0) + 20); FOOT.hp = Math.min(100, FOOT.hp + 5);
    say(ixWorker('cashier'), pick(Math.random, ['Cheers!', 'There you go.', 'Another one?']), false);
    popup(FOOT.drunk > 40 ? "You're pretty drunk" : 'Cheers', 'good');
  }, ixServing('cashier'));
  addSpot(bx - 1.0, 4.4, () => robbedTills.has(shop.bi) ? 'Already emptied' : 'Rob the till', () => ixRob(shop.bi, 'cashier', 200, 700, 2, 'Robbed the bar'), () => !!ixWorker('cashier'));
}

// ---------------------------------------------------------------- banks: tellers behind glass, a guard, the vault
function buildBank(shop) {
  ROOM.kind = 'bank';
  ROOM.box = { x0: -9, x1: 9, z0: -5, z1: 9 };
  const { x0, x1, z1 } = ROOM.box;
  roomShell(shop.bi, '#e4e0d8', '#e8e2d2', { floor: 'marble', glow: 0.45, H: 4.6, lights: '#fffaf0', ceiling: '#f2efe8' });
  // columns, a velvet-rope queue, plants
  for (const cx of [-5.5, 5.5]) for (const cz of [-1.5, 2.5]) { ixCyl(0.4, 0.4, 4.6, '#efeae0', cx, 2.3, cz, true, 0.45, 20); ixCyl(0.55, 0.55, 0.25, '#d8d2c4', cx, 0.12, cz, false, 0.45); }
  for (const qx of [-1.8, 1.8]) for (let qz = -1; qz <= 2.2; qz += 1.6) { ixCyl(0.04, 0.04, 0.95, '#c8a040', qx, 0.47, qz, false, 0.5, 8); ixCyl(0.12, 0.14, 0.04, '#c8a040', qx, 0.02, qz, false, 0.5); }
  for (const qx of [-1.8, 1.8]) roomAdd(new THREE.BoxGeometry(0.03, 0.03, 3.2), roomMat('#8a1a24', 0.3), qx, 0.85, 0.6);
  ixPlant(x0 + 0.6, -4.3); ixPlant(x1 - 0.6, -4.3);
  // the teller counter across the room, glass above it; a gap on the left leads to the vault
  const cz = 5;
  ixBox(13, 1.15, 0.8, '#5a3a24', 0.5, 0.57, cz);
  ixBox(13.1, 0.06, 0.9, '#2a2420', 0.5, 1.17, cz, false, 0.35);
  const glass = new THREE.MeshBasicMaterial({ color: '#cfe4ee', transparent: true, opacity: 0.22 }); ROOM.disp.push(glass);
  roomAdd(new THREE.PlaneGeometry(13, 1.4), glass, 0.5, 1.9, cz);
  for (let gx = -6; gx <= 7; gx += 3.25) ixBox(0.05, 1.4, 0.05, '#a8acb0', gx, 1.9, cz, false, 0.4);
  ixSign([shop.name, 'Tellers'], 3.4, 0.9, '#1a2a44', '#f2efe6', 0.5, 3.4, z1 - 0.02);
  const tellers = [-3, 0.5, 4];
  tellers.forEach((tx, i) => { addRoomPerson(5600 + shop.bi * 5 + i, tx, cz + 0.75, Math.PI, 'teller'); ixBox(0.45, 0.3, 0.05, '#202226', tx, 1.35, cz + 0.2, false, 0.2); });
  // customers waiting in the queue
  addRoomPerson(5700 + shop.bi, 0, 0.6, 0, 'customer'); addRoomPerson(5701 + shop.bi, 0.1, -0.5, 0.2, 'customer');
  // the guard by the door, armed
  const guard = addRoomPerson(5800 + shop.bi, 4.2, -3.2, -Math.PI * 0.75, 'guard');
  guard.hp = 140; ixArmGuard(guard);
  // the vault: a round steel door in the back wall behind the counter
  const vx = -7, vz = z1 - 0.15;
  const door = new THREE.Group(); door.position.set(vx, 1.45, vz); ROOM.g.add(door);
  const steel = new THREE.MeshStandardMaterial({ color: '#9aa0a8', roughness: 0.35, metalness: 0.9 }); ROOM.disp.push(steel);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.3, 32).rotateX(Math.PI / 2), steel); disc.position.x = 1.25; door.add(disc);
  for (let a = 0; a < 3; a++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.07), steel); sp.position.set(1.25, 0, -0.22); sp.rotation.z = a * Math.PI / 3; door.add(sp); }
  door.position.x = vx - 1.25;
  ixCyl(1.42, 1.42, 0.12, '#6a7078', vx, 1.45, z1 - 0.02, false, 0.3, 32).rotation.x = Math.PI / 2;
  const vKey = 'vault' + shop.bi, tKey = 'tellers' + shop.bi;
  if (robbedTills.has(vKey)) door.rotation.y = -1.9;
  // rob the tellers (with a weapon out), or hold E at the vault to drill it while the guard shoots at you
  addSpot(0.5, cz - 1.0, () => robbedTills.has(tKey) ? 'Already emptied' : 'Rob the tellers', () => ixRob(tKey, 'teller', 2000, 5000, 3, 'Robbed the bank'), () => ROOM.people.some((q) => q.role === 'teller'));
  addSpot(vx, z1 - 1.3, () => robbedTills.has(vKey) ? 'The vault is empty' : 'Hold E: drill the vault', (s) => {
    if (robbedTills.has(vKey) || ROOM.hold) return;
    ROOM.hold = { label: 'Drilling the vault', x: s.x, z: s.z, t: 0, T: 8, done: () => {
      robbedTills.add(vKey);
      const amt = Math.round(10000 + Math.random() * 10000); addCash(amt); sfx.cash && sfx.cash();
      let a = 0; ROOM.anim.push((d) => { if (a > -1.9) { a = Math.max(-1.9, a - d * 0.9); door.rotation.y = a; } });
      popup(`Cracked the vault +$${amt.toLocaleString()}`, 'good'); ixHeatTo(4);
    } };
    roomPanic(); ROOM.alarm = true; ixHeatTo(3);
    popup('Drilling… keep holding E', 'cop'); sfx.metal && sfx.metal(0.5);
  });
  ROOM.anim.push(() => { if (ROOM.hold && Math.random() < 0.15) sfx.metal && sfx.metal(0.15); });
}

// ---------------------------------------------------------------- clothes shops: racks, mirror, a changing room
function buildClothes(shop) {
  ROOM.kind = 'clothes';
  const { x0, x1, z1 } = ROOM.box;
  roomShell(shop.bi, '#d8cdb8', '#f2f0ec', { floor: 'planks', glow: 0.45, lights: '#ffffff' });
  const r = mulberry(shop.bi * 23 + 5);
  const cols = ['#1a1a1a', '#f2f2f2', '#8a1c2a', '#1f2a44', '#3a5a3a', '#c8a06a', '#6a6a72', '#d86a8a', '#2a6ad8', '#e8c84a'];
  // racks of clothes, hung as instanced shirts
  const shirt = new THREE.BoxGeometry(0.05, 0.7, 0.46); ROOM.disp.push(shirt);
  const sm = new THREE.MeshLambertMaterial({ emissive: '#333333' }); ROOM.disp.push(sm);
  const racks = [[-5, -1.5], [-5, 1.8], [-1.8, -1.5], [-1.8, 1.8]], im = new THREE.InstancedMesh(shirt, sm, racks.length * 14);
  const m4 = new THREE.Matrix4(), col = new THREE.Color(); let k = 0;
  racks.forEach(([rx, rz], ri) => {
    ixCyl(0.015, 0.015, 2.2, '#c8ccd0', rx, 1.45, rz, false, 0.5, 8).rotation.x = Math.PI / 2;
    for (const e of [-1.1, 1.1]) ixCyl(0.02, 0.02, 1.45, '#c8ccd0', rx, 0.72, rz + e, false, 0.5, 8);
    ROOM.solids.push({ x0: rx - 0.3, x1: rx + 0.3, z0: rz - 1.15, z1: rz + 1.15 });
    for (let i = 0; i < 14; i++) { m4.makeRotationY((r() - 0.5) * 0.3).setPosition(rx, 1.08, rz - 0.95 + i * 0.146); im.setMatrixAt(k, m4); col.set(cols[(i + ri * 3 + (r() * 3 | 0)) % cols.length]); im.setColorAt(k++, col); }
    // a quick grab off the rack: the clerk might see
    addSpot(rx + 0.6, rz, 'Grab something off the rack', () => {
      const items = [['Designer jacket', 80, 260], ['Sneakers', 60, 220], ['Jeans', 30, 90], ['Hoodie', 40, 120]];
      const it = items[Math.floor(Math.random() * items.length)];
      if (!takeItem(it[0], Math.round(it[1] + Math.random() * (it[2] - it[1])))) return;
      const c = ROOM.people.find((q) => q.role === 'cashier' && !q.dead && !q.cower);
      if (c && Math.random() < 0.45) { say(c, pick(Math.random, ['Hey! You have to pay for that!', 'Security!', "I'm calling the police!"]), false); addHeat(0.9); }
    });
  });
  ROOM.g.add(im);
  // folded tables with stacks, wall shelves of shoes
  for (const [tx, tz] of [[2.2, -1.6], [2.2, 1.2]]) {
    ixBox(1.6, 0.8, 0.9, '#e8e2d8', tx, 0.4, tz);
    for (let i = 0; i < 6; i++) ixBox(0.42, 0.08 + (i % 3) * 0.05, 0.3, cols[(i * 3 + tx | 0) % cols.length], tx - 0.55 + (i % 3) * 0.55, 0.86 + (i % 3) * 0.025, tz - 0.2 + (i > 2 ? 0.4 : 0), false, 0.25);
  }
  for (let lvl = 0; lvl < 3; lvl++) { ixBox(0.35, 0.03, 5, '#d8d2c8', x0 + 0.2, 0.6 + lvl * 0.5, 0.5, false, 0.4); for (let i = 0; i < 9; i++) ixBox(0.22, 0.1, 0.28, cols[(i + lvl * 2) % cols.length], x0 + 0.22, 0.67 + lvl * 0.5, -1.6 + i * 0.5, false, 0.25); }
  ROOM.solids.push({ x0, x1: x0 + 0.45, z0: -2.1, z1: 3.1 });
  // a big mirror and the changing room at the back
  const mirror = new THREE.MeshStandardMaterial({ color: '#cfd8dc', roughness: 0.03, metalness: 1 }); ROOM.disp.push(mirror);
  roomAdd(new THREE.PlaneGeometry(1.6, 2.2), mirror, -1.6, 1.3, z1 - 0.03).rotation.y = Math.PI;
  for (const bx of [-5.6, -4.0]) {
    ixBox(0.06, 2.3, 1.6, '#e8e4dc', bx - 0.75, 1.15, z1 - 0.8); ixBox(0.06, 2.3, 1.6, '#e8e4dc', bx + 0.75, 1.15, z1 - 0.8);
    const cur = roomAdd(new THREE.PlaneGeometry(1.2, 1.9), roomMat('#7a1c2a', 0.3), bx + 0.15, 1.15, z1 - 1.58); cur.rotation.y = Math.PI; cur.material.side = THREE.DoubleSide;
  }
  ixSign(['Fitting rooms'], 2.2, 0.35, '#1a1a1a', '#f2efe6', -4.8, 2.6, z1 - 0.03);
  addSpot(-4.8, z1 - 2.0, 'Changing room: new look $50', () => {
    if (!ixPay(50)) return;
    openWardrobe({ fromGame: true });
  }, () => state === 'play');
  // the till
  const c = { x: 4.6, z: z1 - 1.6 };
  ixBox(3, 1.0, 0.8, '#1a1a1a', c.x, 0.5, c.z); ixBox(0.4, 0.25, 0.3, '#3a3a40', c.x + 0.7, 1.13, c.z, false);
  ROOM.solids.push({ x0: c.x + 1.45, x1: x1, z0: c.z - 0.2, z1: c.z + 0.2 });
  addRoomPerson(5900 + shop.bi, c.x, c.z + 0.8, Math.PI, 'cashier');
  addRoomPerson(5910 + shop.bi, -3.4, 0.2, Math.PI / 2, 'customer');
  ixPlant(x1 - 0.5, -4.3);
  addSpot(c.x + 0.7, c.z - 0.95, () => robbedTills.has(shop.bi) ? 'Already emptied' : 'Rob the till', () => ixRob(shop.bi, 'cashier', 300, 900, 2, 'Robbed the shop'), () => !!ixWorker('cashier'));
}

// ---------------------------------------------------------------- casinos: slots, roulette, blackjack, the cashier's cage
function buildCasino(shop) {
  ROOM.kind = 'casino';
  ROOM.box = { x0: -10, x1: 10, z0: -5, z1: 10 };
  const { x0, x1, z1 } = ROOM.box;
  roomShell(shop.bi, '#5a1020', '#2a1418', { floor: 'carpet', glow: 0.2, H: 4.2, lights: '#ffd890', ceiling: '#1a0e10', dark: true });
  // gold trim and a sign
  roomAdd(new THREE.BoxGeometry(x1 - x0, 0.08, 0.05), ixGlowMat('#e8c05a'), 0, 3.6, z1 - 0.04);
  ixSign([shop.name], 5, 0.9, '#140808', '#ffd24a', 0, 2.8, z1 - 0.03);
  // slot machines down the left wall, screens that spin
  const screens = [];
  for (let i = 0; i < 9; i++) {
    const z = -2.6 + i * 1.25, x = x0 + 0.55;
    ixBox(0.8, 1.5, 0.9, '#2a2030', x, 0.75, z);
    ixBox(0.82, 0.5, 0.92, '#c8202a', x, 1.75, z, false, 0.5);
    const m = new THREE.MeshBasicMaterial({ color: '#ffd24a', toneMapped: false }); ROOM.disp.push(m); screens.push(m);
    roomAdd(new THREE.PlaneGeometry(0.6, 0.45), m, x + 0.46, 1.2, z).rotation.y = Math.PI / 2;
    ixCyl(0.2, 0.2, 0.05, '#1a1a1a', x + 0.95, 0.6, z, false);   // stool
    addSpot(x + 1.05, z, 'Play slots $10', () => {
      if (!ixPay(10)) return;
      const sym = ['🍒', '🍋', '🔔', '⭐', '7'], roll = Math.random();
      let win = 0, reels;
      if (roll < 0.01) { win = 1000; reels = ['7', '7', '7']; }
      else if (roll < 0.06) { win = 100; reels = ['⭐', '⭐', '⭐']; }
      else if (roll < 0.28) { win = 20 + Math.round(Math.random() * 2) * 10; const s = sym[Math.floor(Math.random() * 3)]; reels = [s, s, sym[Math.floor(Math.random() * 5)]]; }
      else { do reels = [0, 0, 0].map(() => sym[Math.floor(Math.random() * 5)]); while (reels[0] === reels[1] && reels[1] === reels[2]); }
      m.userData.spin = 1.2;
      if (win) { addCash(win); sfx.cash && sfx.cash(); popup(`${reels.join(' ')} · won $${win}`, 'good'); } else popup(`${reels.join(' ')} · no luck`);
    });
  }
  let t = 0;
  ROOM.anim.push((d) => { t += d; screens.forEach((m, i) => { const sp = m.userData.spin > 0; if (sp) m.userData.spin -= d; m.color.setHSL(((sp ? t * 6 : t * 0.15) + i * 0.13) % 1, 0.8, sp ? 0.6 : 0.45); }); });
  // the roulette table and wheel, a dealer
  const rx = 0.5, rz = 1.0;
  ixBox(3.0, 0.85, 1.5, '#1a5a32', rx, 0.43, rz); ixBox(3.1, 0.06, 1.6, '#4a2a18', rx, 0.86, rz, false);
  const wheel = ixCyl(0.45, 0.45, 0.08, '#3a1a10', rx + 1.0, 0.93, rz, false, 0.4, 24);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 37).rotateX(Math.PI / 2), ixGlowMat('#c8202a')); ring.position.y = 0.05; wheel.add(ring); ROOM.disp.push(ring.geometry);
  let wheelV = 0.6; ROOM.anim.push((d) => { wheel.rotation.y += d * wheelV; wheelV = Math.max(0.6, wheelV - d * 1.5); });
  addRoomPerson(6000 + shop.bi, rx, rz + 1.25, Math.PI, 'dealer');
  addRoomPerson(6001 + shop.bi, rx - 1.0, rz - 1.15, 0, 'gambler'); addRoomPerson(6002 + shop.bi, rx + 0.3, rz - 1.2, 0.2, 'gambler', 'Idle_Talking_Loop');
  const roulette = (bet, label, odds, mult) => () => {
    if (!ixPay(bet)) return;
    wheelV = 12;
    const n = Math.floor(Math.random() * 37), red = n > 0 && [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n);
    const won = label === 'red' ? red : n === 17;
    setTimeout(() => {
      if (!FOOT.store) return;
      if (won) { addCash(bet * mult); sfx.cash && sfx.cash(); popup(`${n} ${red ? 'red' : n ? 'black' : 'green'} · won $${(bet * mult).toLocaleString()}`, 'good'); }
      else popup(`${n} ${red ? 'red' : n ? 'black' : 'green'} · lost $${bet}`);
    }, 1500);
    void odds;
  };
  addSpot(rx - 0.6, rz - 1.25, 'Roulette: $100 on red', roulette(100, 'red', 18 / 37, 2), ixServing('dealer'));
  addSpot(rx + 1.4, rz - 1.25, 'Roulette: $50 on 17', roulette(50, '17', 1 / 37, 36), ixServing('dealer'));
  // blackjack: a half-round table, the dealer and two players sitting
  const bx = 5.2, bz = 4.4;
  ixCyl(1.3, 1.3, 0.06, '#1a5a32', bx, 0.82, bz, false, 0.35, 28); ixCyl(0.3, 0.4, 0.8, '#2a1a10', bx, 0.4, bz, false);
  ROOM.solids.push({ x0: bx - 1.25, x1: bx + 1.25, z0: bz - 1.0, z1: bz + 1.0 });
  addRoomPerson(6003 + shop.bi, bx, bz + 1.5, Math.PI, 'dealer');
  for (const [sx, yaw] of [[-1.0, 0.4], [1.0, -0.4]]) { ixCyl(0.22, 0.22, 0.06, '#8a1a2a', bx + sx, 0.45, bz - 1.45, false); addRoomPerson(6010 + shop.bi + sx * 3, bx + sx, bz - 1.45, yaw, 'gambler', 'Sitting_Idle_Loop'); }
  addSpot(bx, bz - 1.6, 'Blackjack: $50 hand', () => {
    if (!ixPay(50)) return;
    const you = 15 + Math.floor(Math.random() * 8), dealer = 16 + Math.floor(Math.random() * 7);
    if (you === 21 && Math.random() < 0.3) { addCash(125); sfx.cash && sfx.cash(); popup('Blackjack! +$125', 'good'); }
    else if (you > 21) popup(`Bust (${you}) · lost $50`);
    else if (dealer > 21 || you > dealer) { addCash(100); sfx.cash && sfx.cash(); popup(`${you} beats ${dealer > 21 ? 'a dealer bust' : dealer} · won $100`, 'good'); }
    else if (you === dealer) { addCash(50); popup(`Push (${you}) · money back`); }
    else popup(`${you} against ${dealer} · lost $50`);
  }, ixServing('dealer'));
  // the cashier's cage on the right: bars, a window, the cashier; and a guard
  const gx = x1 - 1.6, gz = 7.2;
  ixBox(3.2, 1.1, 0.5, '#3a2418', gx, 0.55, gz - 1.5);
  ROOM.solids.push({ x0: gx - 1.6, x1: x1, z0: gz - 1.75, z1: z1 });
  for (let i = 0; i <= 12; i++) ixCyl(0.015, 0.015, 2.1, '#c8a040', gx - 1.55 + i * 0.26, 2.15, gz - 1.5, false, 0.6, 6);
  ixSign(['Cashier'], 1.6, 0.3, '#140808', '#ffd24a', gx, 3.35, gz - 1.52);
  addRoomPerson(6020 + shop.bi, gx, gz - 0.7, Math.PI, 'cashier');
  const guard = addRoomPerson(6030 + shop.bi, -3.5, -3.6, Math.PI * 0.8, 'guard'); guard.hp = 140; ixArmGuard(guard);
  addSpot(gx - 0.4, gz - 2.3, () => robbedTills.has('cage' + shop.bi) ? 'Already emptied' : 'Rob the cashier', () => ixRob('cage' + shop.bi, 'cashier', 5000, 12000, 3, "Robbed the casino's cage"), () => !!ixWorker('cashier'));
  // a few people wandering the floor
  addRoomPerson(6040 + shop.bi, -5.6, 5.5, 1.2, 'gambler', 'Idle_Talking_Loop');
  addRoomPerson(6041 + shop.bi, -5.0, 6.0, -2.0, 'gambler');
}

const INTERIORS = { eatery: buildEatery, bar: buildBar, bank: buildBank, clothes: buildClothes, casino: buildCasino };
