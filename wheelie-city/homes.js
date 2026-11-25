'use strict';
// Homes, by how well off the family is. How rich a household is comes from real things: the size of the house (its
// OpenStreetMap footprint and height) and the neighbourhood it's in (Shaughnessy, Beverly Hills, Coral Gables, the
// Upper East Side, the Scotch 80s are rich; the Downtown Eastside, Skid Row, Overtown, Mott Haven are poor), with a
// little luck either way. Four kinds of home:
//   0 struggling: a small, dim, cluttered room; an old TV, a jar of cash
//   1 ordinary:   the standard family home (foot.js buildHomeRoom)
//   2 well off:   bigger and brighter, a big TV, art, a kitchen island, a wine fridge, jewellery, a watch, a safe
//   3 mansion:    double height, marble, a chandelier, a staircase, a gallery of paintings, a grand piano, a pool,
//                 a bar, a vault to drill, staff, and an armed security guard (and an alarm that goes off)
// Every home's style (colours, floor, furniture, where things are) comes from the house's own seed, so no two match.

const RICH_AREAS = {
  van: /West Vancouver|Shaughnessy|Point Grey|Kerrisdale|Dunbar|British Properties|Southlands|Arbutus Ridge|Quilchena|Kitsilano Point|Altamont|Caulfeild|Dundarave|Ambleside|Hollyburn|Kerrisdale/i,
  la: /Beverly Hills|Bel[ -]Air|Holmby|Hancock Park|Brentwood|Pacific Palisades|Hollywood Hills|Los Feliz|Trousdale|Beverly Crest|Benedict Canyon|Bird Streets|Laurel Canyon|Windsor Square|Carthay|Cheviot Hills|Santa Monica Canyon/i,
  vegas: /Scotch 80|Rancho Circle|Country Club|Spanish Hills|Ridges|Summerlin|Southern Highlands|Rancho Bel Air|Tournament Hills|Paradise Palms/i,
  miami: /Coral Gables|Key Biscayne|Star Island|Fisher Island|Coconut Grove|Brickell Key|Bay Point|Morningside|Palm Island|Hibiscus Island|Venetian|Sunset Islands|La Gorce|Bay Harbor/i,
  nyc: /Upper East Side|Tribeca|Lenox Hill|Carnegie Hill|SoHo|Greenwich Village|West Village|Brooklyn Heights|Sutton Place|Gramercy|Central Park West|Upper West Side|Murray Hill|Chelsea|Battery Park City|DUMBO/i,
};
const POOR_AREAS = {
  van: /Downtown Eastside|Strathcona|Oppenheimer|Whalley|Victoria-Fraserview|Renfrew|Collingwood|Grandview/i,
  la: /Skid Row|Westlake|Pico-Union|Boyle Heights|South Los Angeles|Watts|Central-Alameda|MacArthur Park|Historic South Central|Vermont Square|Koreatown/i,
  vegas: /Naked City|East Las Vegas|Downtown|Huntridge|Sunrise Manor|North Las Vegas/i,
  miami: /Overtown|Little Haiti|Liberty City|Allapattah|Little Havana|Wynwood|Model City|Edison/i,
  nyc: /Mott Haven|Hunts Point|Brownsville|East New York|Port Morris|Melrose|Highbridge|Bushwick|East Harlem/i,
};
const WEALTH_NAME = ['struggling', 'ordinary', 'well-off', 'wealthy'];

// 0..3 for a building on the map
function homeWealth(bi) {
  const m = MAP; if (!m || bi < 0 || bi >= m.bH.length) return 1;
  const bb = bi * 4, area = (m.bBox[bb + 2] - m.bBox[bb]) * (m.bBox[bb + 3] - m.bBox[bb + 1]), h = m.bH[bi];
  const cx = (m.bBox[bb] + m.bBox[bb + 2]) / 2, cz = (m.bBox[bb + 1] + m.bBox[bb + 3]) / 2;
  const where = `${placeAt(cx, cz)} ${muniAt(cx, cz)}`, key = MAP.key;
  // (area is the footprint's bounding box, m²: a typical house is 100-250, a mansion 700+)
  let s = 1;
  if (m.bKind[bi] === 1) { if (area > 900) s += 1.6; else if (area > 380) s += 0.9; else if (area < 110) s -= 0.8; }
  if (h > 10 && m.bKind[bi] === 1) s += 0.4;
  if (RICH_AREAS[key] && RICH_AREAS[key].test(where)) s += 1.1;
  if (POOR_AREAS[key] && POOR_AREAS[key].test(where)) s -= 1.2;
  s += (mulberry(bi * 71 + 5)() - 0.5) * 0.9;                     // some families are better off than their street
  return clamp(Math.round(s), 0, 3);
}

// ---------------------------------------------------------------- furniture
const HM_STYLES = [
  { name: 'modern', floor: 'marble', floorC: ['#e8e6e2', '#d8d4cc', '#2a2a2e'], wall: ['#f2f0ec', '#e4e6e8', '#2e3034'], wood: '#3a2a20', soft: ['#d8d4cc', '#3a3c42', '#8a9aa8'], accent: ['#c8a040', '#1a6a7a', '#b8452a'] },
  { name: 'classic', floor: 'planks', floorC: ['#8a5a32', '#6a4228', '#a8744a'], wall: ['#efe4d2', '#e0d4bc', '#d8c8b0'], wood: '#4a2a18', soft: ['#7a2a2a', '#2a3a5a', '#4a5a3a'], accent: ['#c8a040', '#8a2a2a', '#2a4a6a'] },
  { name: 'coastal', floor: 'planks', floorC: ['#c8b494', '#d8c8a8', '#b8a07a'], wall: ['#f4f4f0', '#e4eef2', '#eef2ea'], wood: '#a88a64', soft: ['#e8e4dc', '#7aa8c8', '#c8dce4'], accent: ['#2a6a9a', '#e8b870', '#5aa8a0'] },
  { name: 'boho', floor: 'planks', floorC: ['#9a6a42', '#7a5236'], wall: ['#e8d4bc', '#d8c0a0', '#c8a890'], wood: '#5a3a22', soft: ['#b8603a', '#d8a050', '#6a7a3a'], accent: ['#c8502a', '#3a7a6a', '#e8b030'] },
  { name: 'minimal', floor: 'tiles', floorC: ['#e0ddd6', '#cfcac2'], wall: ['#f8f8f6', '#ececea'], wood: '#c8b090', soft: ['#e8e6e2', '#a8a49c', '#3a3a3e'], accent: ['#1a1a1e', '#c8a040'] },
];
function hmSofa(x, z, ry, len, col, deep = 0.95) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; ROOM.g.add(g);
  const m = roomMat(col, 0.3);
  const part = (w, h, d, px, py, pz) => { const geo = new THREE.BoxGeometry(w, h, d); ROOM.disp.push(geo); const me = new THREE.Mesh(geo, m); me.position.set(px, py, pz); g.add(me); };
  part(len, 0.42, deep, 0, 0.28, 0); part(len, 0.5, 0.22, 0, 0.7, -deep / 2 + 0.11); part(0.22, 0.6, deep, -len / 2 + 0.11, 0.42, 0); part(0.22, 0.6, deep, len / 2 - 0.11, 0.42, 0);
  for (let i = 0; i < Math.max(2, Math.round(len / 0.8)); i++) part(len / Math.max(2, Math.round(len / 0.8)) - 0.06, 0.12, deep - 0.3, -len / 2 + 0.11 + (i + 0.5) * (len - 0.22) / Math.max(2, Math.round(len / 0.8)), 0.55, 0.06);
  const c = Math.cos(ry), s = Math.sin(ry), hw = Math.abs(c) * len / 2 + Math.abs(s) * deep / 2, hd = Math.abs(s) * len / 2 + Math.abs(c) * deep / 2;
  ROOM.solids.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });
}
// a painting: an abstract canvas made from the seed (bands, circles, brush strokes), in a frame
function hmArt(x, y, z, w, h, ry, seed, frame = '#2a2018') {
  const r = mulberry(seed), cv = document.createElement('canvas'); cv.width = 256; cv.height = Math.round(256 * h / w); const c = cv.getContext('2d');
  const pal = [['#e8d8b8', '#c8502a', '#2a3a5a', '#e8b030'], ['#1a1a2e', '#e84a5a', '#f2e8d8', '#3ab0a0'], ['#d8e4e8', '#2a6a9a', '#e8c870', '#1a1a1a'], ['#f2ece0', '#8a2a2a', '#c8a040', '#3a5a3a']][Math.floor(r() * 4)];
  c.fillStyle = pal[0]; c.fillRect(0, 0, cv.width, cv.height);
  const kind = Math.floor(r() * 3);
  for (let i = 0; i < 9; i++) {
    c.fillStyle = pal[1 + Math.floor(r() * 3)]; c.globalAlpha = 0.6 + r() * 0.4;
    if (kind === 0) c.fillRect(r() * cv.width, r() * cv.height, 20 + r() * 120, 10 + r() * 80);
    else if (kind === 1) { c.beginPath(); c.arc(r() * cv.width, r() * cv.height, 10 + r() * 60, 0, Math.PI * 2); c.fill(); }
    else { c.lineWidth = 6 + r() * 18; c.strokeStyle = c.fillStyle; c.beginPath(); c.moveTo(r() * cv.width, r() * cv.height); c.bezierCurveTo(r() * cv.width, r() * cv.height, r() * cv.width, r() * cv.height, r() * cv.width, r() * cv.height); c.stroke(); }
  }
  c.globalAlpha = 1;
  const tx = new THREE.CanvasTexture(cv); tx.encoding = THREE.sRGBEncoding; ROOM.disp.push(tx);
  const mat = new THREE.MeshLambertMaterial({ map: tx, emissive: '#ffffff', emissiveMap: tx, emissiveIntensity: 0.55 }); ROOM.disp.push(mat);
  const fr = ixBox(ry === Math.PI || ry === 0 ? w + 0.12 : 0.05, h + 0.12, ry === Math.PI || ry === 0 ? 0.05 : w + 0.12, frame, x, y, z, false, 0.3);
  const me = roomAdd(new THREE.PlaneGeometry(w, h), mat, x + (ry === Math.PI / 2 ? 0.03 : ry === -Math.PI / 2 ? -0.03 : 0), y, z + (ry === Math.PI ? -0.03 : ry === 0 ? 0.03 : 0)); me.rotation.y = ry;
  return [fr, me];
}
function hmLoot(key, name, lo, hi, mesh, x, z, r) {
  if (lootedHomes.has(key)) { if (mesh) (Array.isArray(mesh) ? mesh : [mesh]).forEach((m) => { m.visible = false; }); return; }
  const value = Math.round(lo + r() * (hi - lo));
  ROOM.loot.push({ name, value, mesh: Array.isArray(mesh) ? mesh[mesh.length - 1] : mesh, x, z, key, also: Array.isArray(mesh) ? mesh : null });
}
function hmLamp(x, z, col = '#fff0d0') { ixCyl(0.03, 0.03, 1.5, '#2a2a2e', x, 0.75, z, false); roomAdd(new THREE.CylinderGeometry(0.18, 0.26, 0.3, 14, 1, true), ixGlowMat(col), x, 1.6, z); ixCyl(0.2, 0.2, 0.03, '#2a2a2e', x, 0.015, z, true); }
function hmBed(x, z, ry, w, col, wood) {
  const L = 2.1;
  const c = Math.cos(ry), s = Math.sin(ry), hw = Math.abs(c) * w / 2 + Math.abs(s) * L / 2, hd = Math.abs(s) * w / 2 + Math.abs(c) * L / 2;
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; ROOM.g.add(g);
  const add = (geo, m, px, py, pz) => { ROOM.disp.push(geo); const me = new THREE.Mesh(geo, m); me.position.set(px, py, pz); g.add(me); };
  add(new THREE.BoxGeometry(w, 0.3, L), roomMat(wood, 0.3), 0, 0.2, 0); add(new THREE.BoxGeometry(w - 0.1, 0.22, L - 0.1), roomMat('#f2f0ea', 0.45), 0, 0.46, 0);
  add(new THREE.BoxGeometry(w - 0.06, 0.08, L * 0.6), roomMat(col, 0.35), 0, 0.6, 0.35); add(new THREE.BoxGeometry(w, 1.0, 0.1), roomMat(wood, 0.3), 0, 0.6, -L / 2);
  for (const px of [-w / 4, w / 4]) add(new THREE.BoxGeometry(w / 2 - 0.15, 0.14, 0.4), roomMat('#ffffff', 0.5), px, 0.64, -L / 2 + 0.35);
  ROOM.solids.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });
}

// ---------------------------------------------------------------- the homes
function buildHouse(home, tier) {
  if (tier === 1) { buildHomeRoom(home); ROOM.wealth = 1; return; }
  ROOM.kind = 'home'; ROOM.wealth = tier;
  const r = mulberry(home.bi * 131 + 17), P = (a) => a[Math.floor(r() * a.length)];
  if (tier === 0) return buildStrugglingHome(home, r, P);
  return tier === 2 ? buildWellOffHome(home, r, P) : buildMansion(home, r, P);
}

// a small, dim, crowded place: a mattress, an old sofa and a box TV, the kitchen in the corner, laundry and boxes
function buildStrugglingHome(home, r, P) {
  ROOM.box = { x0: -5.5, x1: 5.5, z0: -4.5, z1: 5 };
  const { x0, x1, z1 } = ROOM.box;
  roomShell(home.bi, P(['#6a5a48', '#7a6a58', '#5a4e44']), P(['#c8bca8', '#b8b4a0', '#c4b8b0', '#a8b0a8']), { floor: P(['carpet', 'planks', 'tiles']), glow: 0.3, lights: '#ffe8b8', front: home.shell && home.shell.front });
  hmSofa(-2.8, 1.4, Math.PI, 2.0, P(['#5a4a3a', '#4a4e5a', '#6a3a3a']), 0.85);
  const tv = ixBox(0.55, 0.45, 0.45, '#2a2a2e', -2.8, 0.75, -2.2, false, 0.3); ixBox(0.9, 0.5, 0.5, '#5a3a22', -2.8, 0.25, -2.2);
  hmLoot(home.bi + 'oldtv', 'Old TV', 40, 90, tv, -2.8, -1.7, r);
  // a mattress on the floor, clothes, boxes
  ixBox(1.5, 0.22, 2.0, '#d8d0c0', x1 - 1.0, 0.11, z1 - 1.2); ixBox(1.4, 0.08, 1.2, P(['#5a6a8a', '#8a4a4a', '#6a7a4a']), x1 - 1.0, 0.26, z1 - 1.0, false);
  for (let i = 0; i < 6; i++) ixBox(0.4 + r() * 0.3, 0.3 + r() * 0.4, 0.35 + r() * 0.2, P(['#b8946a', '#a8845a', '#c8a47a']), x0 + 0.5 + r() * 2.5, 0.2, z1 - 0.4 - r() * 0.6);
  for (let i = 0; i < 5; i++) ixBox(0.4, 0.05, 0.3, P(['#3a5a8a', '#8a3a3a', '#e8e4dc', '#2a2a2e']), (r() - 0.5) * 6, 0.03, (r() - 0.5) * 5, false, 0.3);
  // the kitchenette and a folding table
  ixBox(2.4, 0.9, 0.6, '#c8c0b0', 3.0, 0.45, -3.6); ixBox(0.7, 1.6, 0.65, '#d8d8d4', 4.6, 0.8, -3.6);
  ixBox(0.9, 0.04, 0.7, '#a8a098', 1.2, 0.72, 0.2, false); ixBox(0.04, 0.7, 0.04, '#5a5a5a', 1.2, 0.36, 0.2);
  const jar = ixBox(0.12, 0.18, 0.12, '#c8d8d4', 3.2, 0.99, -3.6, false, 0.5);
  hmLoot(home.bi + 'jar', 'Cash jar', 10, 70, jar, 3.2, -3.0, r);
  const ph = ixBox(0.08, 0.01, 0.15, '#141518', 1.2, 0.75, 0.2, false, 0.4);
  hmLoot(home.bi + 'phone', 'Phone', 40, 140, ph, 1.2, -0.3, r);
  // a big family in a small place
  const n = 2 + Math.floor(r() * 4), at = [[-2.8, 2.3, Math.PI], [1.0, 1.0, Math.PI * 1.2], [3.2, -2.7, 0], [-1.0, -0.5, Math.PI * 0.7], [4.2, 2.6, Math.PI * 1.5]];
  for (let i = 0; i < n; i++) addRoomPerson(home.bi * 13 + i, at[i][0], at[i][1], at[i][2], 'family');
}

// bigger and brighter: an open plan with a sectional and a big TV, art, a kitchen with an island, a dining table,
// the main bedroom at the back with a dresser (watch, jewellery) and a safe in the closet
function buildWellOffHome(home, r, P) {
  ROOM.box = { x0: -9, x1: 9, z0: -5, z1: 11 };
  const { x0, x1, z1 } = ROOM.box, st = P(HM_STYLES);
  roomShell(home.bi, P(st.floorC), P(st.wall), { floor: st.floor, glow: 0.48, H: 3.4, lights: P(['#fff6e8', '#ffffff']), front: home.shell && home.shell.front });
  const soft = P(st.soft), acc = P(st.accent), side = r() < 0.5 ? -1 : 1;           // (living room left or right)
  // living room: sectional facing a big TV on the wall, coffee table, rug, lamp
  hmSofa(side * 5.2, 0.8, Math.PI, 3.2, soft); hmSofa(side * 7.4, -0.6, side * Math.PI / 2, 1.8, soft);
  roomAdd(new THREE.PlaneGeometry(4.2, 3).rotateX(-Math.PI / 2), roomMat(P(st.soft), 0.3), side * 5.4, 0.01, -1.4);
  ixBox(1.3, 0.38, 0.7, st.wood, side * 5.2, 0.19, -1.4);
  const tv = ixBox(2.2, 1.25, 0.06, '#0c0c10', side * 5.2, 1.6, -4.92, false, 0.2);
  ixBox(2.4, 0.45, 0.45, st.wood, side * 5.2, 0.23, -4.7);
  hmLoot(home.bi + 'bigtv', 'Big TV', 400, 900, tv, side * 5.2, -4.0, r);
  hmLamp(side * 8.3, 1.8);
  const [a1f, a1] = hmArt(side * 8.95, 1.8, -2.4, 1.6, 1.1, side > 0 ? -Math.PI / 2 : Math.PI / 2, home.bi * 3 + 1);
  hmLoot(home.bi + 'art1', 'Painting', 800, 3000, [a1f, a1], side * 8.3, -2.4, r);
  // kitchen: a run along the other wall with an island and stools, a wine fridge
  const kx = -side * 6.2;
  ixBox(1.0, 0.92, 6.0, P(['#e8e4dc', '#2a2a2e', '#3a4a5a', st.wood]), -side * 8.4, 0.46, 1.5);
  ixBox(2.6, 0.95, 1.1, P(['#e8e4dc', '#2a2a2e', st.wood]), kx, 0.47, 1.4); ixBox(2.8, 0.05, 1.3, P(['#f2f0ec', '#3a3a3e', '#d8d0c0']), kx, 0.97, 1.4, false, 0.5);
  for (let i = -1; i <= 1; i++) ixCyl(0.18, 0.18, 0.7, '#2a2a2e', kx + i * 0.8, 0.35, 0.5, false);
  const wf = ixBox(0.6, 0.85, 0.6, '#1a1a1e', -side * 8.4, 0.43, 5.0, false, 0.3); roomAdd(new THREE.PlaneGeometry(0.5, 0.7), ixGlowMat('#c8a070'), -side * 8.08, 0.45, 5.0).rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  hmLoot(home.bi + 'wine', 'Wine collection', 300, 900, wf, -side * 7.6, 5.0, r);
  // dining: a long table and chairs
  ixBox(2.4, 0.05, 1.0, st.wood, 0, 0.76, 3.6); ROOM.solids.push({ x0: -1.25, x1: 1.25, z0: 3.05, z1: 4.15 });
  for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) ixBox(0.45, 0.9, 0.45, st.wood, i * 0.8, 0.45, 3.6 + s * 0.85, false);
  if (r() < 0.6) { const [af, a2] = hmArt(0, 1.9, 6.4, 2.0, 1.2, Math.PI, home.bi * 3 + 2); void af; void a2; }
  // a half wall, then the bedroom at the back
  ixBox(12, 2.4, 0.15, P(st.wall), 0, 1.2, 6.5); ROOM.solids.push({ x0: -6, x1: 6, z0: 6.4, z1: 6.6 });
  hmBed(side * 4, z1 - 2.0, Math.PI, 1.8, acc, st.wood);
  ixBox(1.4, 0.85, 0.5, st.wood, -side * 4.5, 0.43, z1 - 0.4);
  const watch = ixBox(0.12, 0.03, 0.12, '#c8a040', -side * 4.8, 0.88, z1 - 0.4, false, 0.6), jb = ixBox(0.3, 0.16, 0.2, '#6a2a2a', -side * 4.2, 0.93, z1 - 0.4, false, 0.4);
  hmLoot(home.bi + 'watch', 'Rolex', 2500, 9000, watch, -side * 4.8, z1 - 1.0, r);
  hmLoot(home.bi + 'jewels', 'Jewellery', 500, 2500, jb, -side * 4.2, z1 - 1.0, r);
  const bag = ixBox(0.35, 0.26, 0.15, P(['#c8a070', '#1a1a1e', '#8a2a2a']), side * 1.6, 0.13, z1 - 0.5, false, 0.4);
  hmLoot(home.bi + 'bag', 'Designer bag', 400, 1600, bag, side * 1.6, z1 - 1.0, r);
  // the safe in the closet: hold E to get it open
  const safeX = -side * 7.8, safeZ = z1 - 0.5, sKey = home.bi + 'safe';
  ixBox(0.6, 0.75, 0.55, '#3a3e44', safeX, 0.38, safeZ);
  addSpot(safeX, safeZ - 1.0, () => lootedHomes.has(sKey) ? 'The safe is empty' : 'Hold E: crack the safe', (s) => {
    if (lootedHomes.has(sKey) || ROOM.hold) return;
    ROOM.hold = { label: 'Cracking the safe', x: s.x, z: s.z, t: 0, T: 6, done: () => { lootedHomes.add(sKey); const amt = Math.round(800 + r() * 2200); addCash(amt); sfx.cash && sfx.cash(); popup(`The safe +$${amt.toLocaleString()}`, 'good'); } };
  });
  ixPlant(-side * 0.8, -4.3); ixPlant(side * 8.4, 5.8);
  // the family
  const n = 2 + Math.floor(r() * 3), at = [[side * 5.2, 1.7, Math.PI], [kx, 0.3, 0], [0.8, 2.75, 0], [side * 3.0, z1 - 1.0, Math.PI], [-side * 3, -2, Math.PI * 0.6]];
  for (let i = 0; i < n; i++) addRoomPerson(home.bi * 13 + i, at[i][0], at[i][1], at[i][2], 'family');
}

// a mansion: a double-height marble hall with a chandelier and a sweeping staircase, a gallery of paintings, a grand
// piano, a bar, an indoor pool, a vault in the study, the family, staff, and an armed guard; the alarm goes off
function buildMansion(home, r, P) {
  ROOM.box = { x0: -14, x1: 14, z0: -5, z1: 20 };
  const { x0, x1, z1 } = ROOM.box, st = P(HM_STYLES.slice(0, 2).concat([HM_STYLES[4]]));
  roomShell(home.bi, P(['#ece8e0', '#e2ddd2', '#d8d4cc', '#1e1e22']), P(['#f4f0e8', '#ece4d4', '#e8ecee']), { floor: 'marble', glow: 0.55, H: 6.5, lights: '#fff8ec', front: home.shell && home.shell.front });
  const side = r() < 0.5 ? -1 : 1, gold = '#c8a040';
  // the chandelier: tiers of glowing crystal drops
  const cz = 4;
  ixCyl(0.03, 0.03, 1.2, gold, 0, 5.9, cz, false);
  for (let t = 0; t < 3; t++) for (let k = 0; k < 10 + t * 4; k++) { const a = k / (10 + t * 4) * Math.PI * 2, rad = 0.5 + t * 0.35; roomAdd(new THREE.SphereGeometry(0.07, 6, 5), ixGlowMat('#fff4d8'), Math.cos(a) * rad, 5.1 - t * 0.35, cz + Math.sin(a) * rad); }
  roomAdd(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), roomMat(P(['#8a2a2a', '#2a3a5a', '#c8b48a']), 0.35), 0, 0.01, cz);
  // the staircase up the back wall to a landing
  for (let i = 0; i < 14; i++) ixBox(3.2, 0.2, 0.42, P(['#f2efe8', '#e8e0d0']), side * 6, 0.1 + i * 0.22, z1 - 7.5 + i * 0.42, i < 2);
  ixBox(7, 0.25, 3.2, '#f2efe8', side * 6, 3.2, z1 - 1.6, false); ixBox(7, 1.0, 0.06, gold, side * 6, 3.85, z1 - 3.2, false, 0.5);
  ROOM.solids.push({ x0: side * 6 - 1.6, x1: side * 6 + 1.6, z0: z1 - 7.7, z1: z1 });
  // the gallery: paintings down the long wall, each worth a lot
  for (let i = 0; i < 3; i++) {
    const z = 0 + i * 4.5, wx = -side * 13.95;
    const [f, a] = hmArt(wx, 2.4, z, 2.2, 1.6, side > 0 ? Math.PI / 2 : -Math.PI / 2, home.bi * 5 + i, gold);
    hmLoot(home.bi + 'gallery' + i, 'Painting', 3000, 15000, [f, a], wx + side * 0.8, z, r);
  }
  // the grand piano
  const px = side * 9, pz = 3;
  ixBox(1.5, 0.3, 2.2, '#0c0c0e', px, 0.85, pz); ixBox(1.5, 0.05, 2.0, '#0c0c0e', px, 1.3, pz + 0.1, false, 0.2).rotation.x = -0.5;
  for (const [a, b] of [[-0.6, -0.9], [0.6, -0.9], [0, 0.9]]) ixBox(0.1, 0.7, 0.1, '#0c0c0e', px + a, 0.35, pz + b, false);
  ixBox(1.3, 0.04, 0.2, '#f2f2f2', px, 1.02, pz - 1.15, false, 0.5);
  // the bar with bottles, rare whisky on top
  const bx = -side * 9, bz = 13;
  ixBox(3.5, 1.1, 0.8, '#2a1a12', bx, 0.55, bz); ixBox(3.7, 0.06, 0.95, '#1a1a1e', bx, 1.12, bz, false);
  for (let i = 0; i < 14; i++) ixCyl(0.05, 0.05, 0.32, P(['#3a6a2a', '#8a4a1a', '#c8a040', '#2a2a2e', '#a83a3a']), bx - 1.6 + i * 0.24, 2.0, bz + 1.3, false, 0.5);
  ixBox(3.6, 0.04, 0.3, '#2a1a12', bx, 1.83, bz + 1.3, false);
  const wh = ixCyl(0.06, 0.06, 0.34, '#c8803a', bx + 0.8, 1.32, bz, false, 0.6);
  hmLoot(home.bi + 'whisky', 'Rare whisky', 400, 1500, wh, bx + 0.8, bz - 0.9, r);
  // the indoor pool, sunk into the floor at the front, lit from below
  const plx = -side * 7, plz = 0.5;
  roomAdd(new THREE.PlaneGeometry(7, 4).rotateX(-Math.PI / 2), ixGlowMat('#3ab0d8'), plx, 0.02, plz);
  for (const [w, d, x, z] of [[7.4, 0.2, plx, plz - 2.1], [7.4, 0.2, plx, plz + 2.1], [0.2, 4.4, plx - 3.6, plz], [0.2, 4.4, plx + 3.6, plz]]) ixBox(w, 0.08, d, '#f2f0ea', x, 0.04, z, false);
  ROOM.solids.push({ x0: plx - 3.5, x1: plx + 3.5, z0: plz - 2, z1: plz + 2 });
  // seating round the chandelier, statues, plants
  hmSofa(-2.2, cz, Math.PI / 2, 2.6, P(['#e8e4dc', '#2a3a5a', '#7a2a2a'])); hmSofa(2.2, cz, -Math.PI / 2, 2.6, P(['#e8e4dc', '#2a3a5a', '#7a2a2a']));
  const statue = ixCyl(0.25, 0.3, 1.2, gold, side * 12.5, 0.9, -3.8, true, 0.6); ixBox(0.7, 0.3, 0.7, '#f2efe8', side * 12.5, 0.15, -3.8);
  hmLoot(home.bi + 'statue', 'Gold statue', 2000, 6000, statue, side * 12.5, -2.9, r);
  ixPlant(-12.8, -4.2); ixPlant(12.8, -4.2); ixPlant(-side * 12.8, z1 - 0.6);
  // the vault in the study (hold E to drill it)
  const vx = -side * 12.5, vz = z1 - 1.2, vKey = home.bi + 'vault';
  ixBox(1.6, 2.2, 0.4, '#5a5e64', vx, 1.1, z1 - 0.2); ixCyl(0.5, 0.5, 0.1, '#8a8e94', vx, 1.1, z1 - 0.45, false, 0.5).rotation.x = Math.PI / 2;
  addSpot(vx, vz - 0.4, () => lootedHomes.has(vKey) ? 'The vault is empty' : 'Hold E: drill the vault', (s) => {
    if (lootedHomes.has(vKey) || ROOM.hold) return;
    ROOM.hold = { label: 'Drilling the vault', x: s.x, z: s.z, t: 0, T: 10, done: () => { lootedHomes.add(vKey); const amt = Math.round(5000 + r() * 15000); addCash(amt); sfx.cash && sfx.cash(); popup(`The vault +$${amt.toLocaleString()}`, 'good'); } };
    roomPanic(); ROOM.alarm = true;
  });
  // the family, the staff, and security
  const n = 2 + Math.floor(r() * 3), at = [[-2.2, cz + 0.4, Math.PI / 2], [2.2, cz - 0.4, -Math.PI / 2], [px - 1, pz - 1.6, 0], [bx, bz - 1.2, Math.PI], [side * 6, z1 - 2, Math.PI]];
  for (let i = 0; i < n; i++) addRoomPerson(home.bi * 13 + i, at[i][0], at[i][1], at[i][2], 'family', i === 0 ? 'Sitting_Idle_Loop' : 'Idle_Loop', i === 0 ? 0 : 0);
  addRoomPerson(home.bi * 13 + 9, -side * 3, 9, Math.PI * 0.8, 'staff', 'Idle_Loop');
  const guard = addRoomPerson(home.bi * 13 + 11, 0, -3.2, 0, 'guard', 'Idle_Loop'); guard.hp = 150; ixArmGuard(guard);
}
