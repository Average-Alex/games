'use strict';
// Shops (everything that isn't a restaurant, bar, bank, clothes shop or casino: interiors.js): each is fitted out for
// what it sells (groceries, tech, bikes, books, a pharmacy, hardware, gifts) and laid out its own way from the shop's
// seed: its colours, floor, shelving, aisles and fittings differ, and its name is over the counter. The counter (buy,
// sell, rob the till) stays at the back right; what you can pocket off the shelves depends on the shop.

const SHOP_KINDS = [
  ['grocery', /^(convenience|supermarket|grocery|greengrocer|alcohol|wine|beverages|kiosk|variety_store|general|tobacco|e-cigarette|butcher|seafood|frozen_food|health_food|organic|farm|tea|coffee|chocolate|deli|cheese|dairy|spices|pasta|water|lottery)$/],
  ['tech', /^(electronics|mobile_phone|computer|hifi|video_games|games|camera|appliance|telecommunication|video|music|musical_instrument|electrical|printer_ink|vacuum_cleaner|radiotechnics)$/],
  ['bikes', /^(bicycle|motorcycle|car_parts|car|tyres|scooter|outdoor|motorcycle_repair|car_repair|fishing|hunting|ski|surf|swimming_pool|sports_equipment|golf)$/],
  ['books', /^(books|stationery|newsagent|art|craft|toys|hobby|anime|frame|model|collector|games_store|second_hand|charity|antiques|photo|copyshop)$/],
  ['pharmacy', /^(chemist|pharmacy|cosmetics|beauty|perfumery|hairdresser|medical_supply|optician|hearing_aids|herbalist|nutrition_supplements|massage|tattoo|nails|hairdresser_supply|erotic)$/],
  ['hardware', /^(hardware|doityourself|garden_centre|paint|trade|houseware|florist|pet|kitchen|lighting|furniture|interior_decoration|bed|carpet|bathroom_furnishing|tiles|window_blind|curtain|locksmith|tool_hire|storage_rental|garden_furniture|fireplace|security|energy|gas|plant_hire|agrarian)$/],
];
function shopTheme(kind) { for (const [t, re] of SHOP_KINDS) if (re.test(kind || '')) return t; return 'gift'; }
const SHELF_LOOT = {
  grocery: [['Energy drinks', 8, 20], ['Snacks', 5, 15], ['Cigarettes', 12, 30], ['Bottle of wine', 15, 45], ['Lottery tickets', 5, 40]],
  tech: [['Phone', 150, 500], ['Headphones', 30, 140], ['Smartwatch', 80, 260], ['Video game', 30, 70], ['Charger', 10, 30], ['Earbuds', 40, 160]],
  bikes: [['Bike light', 15, 50], ['Helmet', 40, 140], ['Bike lock', 20, 60], ['Cycling gloves', 15, 40], ['GoPro', 150, 380]],
  books: [['Book', 10, 30], ['Comic', 5, 25], ['Fountain pen', 20, 90], ['Notebook', 5, 15], ['Collectible figure', 20, 120]],
  pharmacy: [['Painkillers', 8, 20], ['Perfume', 40, 140], ['Makeup', 15, 50], ['Vitamins', 10, 30], ['Sunglasses', 20, 90]],
  hardware: [['Cordless drill', 60, 180], ['Tool set', 30, 90], ['Flashlight', 10, 35], ['Tape measure', 8, 20], ['Power bank', 15, 45]],
  gift: [['Souvenir', 8, 25], ['Scented candle', 10, 30], ['Sunglasses', 20, 60], ['Toy', 10, 40], ['Keyring', 4, 12]],
};
const SHOP_LOOKS = {
  grocery: { floor: ['tiles', 'checker', 'tiles'], floorC: ['#d8d6d0', '#c8ccd0', '#e4e0d4', '#d0c8b8'], wall: ['#e4dccb', '#d8e8e0', '#f2e8d0', '#e0e4ec', '#f4f0e8'], shelf: ['#9aa0a6', '#e8e8e8', '#3a6a4a', '#b83a2a', '#2a4a7a'], prods: ['#d8312a', '#2a6ad8', '#f2c230', '#2aa05a', '#e86a1a', '#f2f2f2', '#7a3ad8', '#1a1a1a'], counter: ['#6a4a32', '#2a2a2e', '#b83a2a', '#e8e4dc'] },
  tech: { floor: ['marble', 'tiles'], floorC: ['#f2f2f2', '#2a2a2e', '#e8e8ec', '#c8ccd0'], wall: ['#f4f4f6', '#1a1c22', '#e8eef4', '#20242c'], shelf: ['#f2f2f2', '#1a1a1e', '#c8ccd0'], prods: ['#1a1a1e', '#e8e8ec', '#3a6ad8', '#c8ccd0', '#d83a3a', '#2a2a2e'], counter: ['#f2f2f2', '#1a1a1e', '#8a8e94'] },
  bikes: { floor: ['planks', 'tiles'], floorC: ['#5a5e64', '#8a6a4a', '#3a3e44', '#a89a84'], wall: ['#e8e4dc', '#2a2e36', '#d8c8a8', '#c8d0d8'], shelf: ['#3a3e44', '#8a8e94', '#6a4a30'], prods: ['#e8402a', '#2a6ad8', '#1a1a1a', '#f2c230', '#2aa05a', '#f2f2f2'], counter: ['#3a3e44', '#6a4a30', '#8a8e94'] },
  books: { floor: ['carpet', 'planks'], floorC: ['#6a2a2a', '#8a6a4a', '#2a3a5a', '#5a4a3a'], wall: ['#efe4d2', '#d8c8a8', '#2a3a2a', '#e8dcc8'], shelf: ['#5a3a22', '#3a2a1a', '#8a6a4a', '#2a2a2e'], prods: ['#8a2a2a', '#2a4a6a', '#2a5a3a', '#c8a040', '#e8e4dc', '#3a2a4a', '#1a1a1a', '#c86a2a'], counter: ['#5a3a22', '#3a2a1a'] },
  pharmacy: { floor: ['tiles', 'marble'], floorC: ['#f2f2f2', '#e8eef0', '#eef0ea'], wall: ['#ffffff', '#e8f4f0', '#f4ecf4', '#eef4fa'], shelf: ['#f2f2f2', '#d8e8e4', '#e8d8e4'], prods: ['#f2f2f2', '#e86a9a', '#3ab0d8', '#2aa05a', '#f2c230', '#c83a5a', '#8a5ad8'], counter: ['#f2f2f2', '#2aa05a', '#3ab0d8'] },
  hardware: { floor: ['tiles'], floorC: ['#8a8e94', '#a8a49a', '#9a9a92'], wall: ['#e8e4dc', '#d8d4c8', '#c8ccc8'], shelf: ['#e86a1a', '#3a5a8a', '#5a5e64', '#c83a2a'], prods: ['#e86a1a', '#f2c230', '#3a3e44', '#c83a2a', '#2a6ad8', '#8a8e94', '#2aa05a'], counter: ['#5a5e64', '#e86a1a', '#3a5a8a'] },
  gift: { floor: ['planks', 'tiles', 'checker'], floorC: ['#c8a880', '#d8d6d0', '#a87a5a', '#e0d0c0'], wall: ['#f2e8d8', '#e8d8e8', '#d8e8f2', '#f4e4d4'], shelf: ['#e8e4dc', '#6a4a30', '#2a2a2e', '#a8c8d8'], prods: ['#e86a9a', '#3ab0d8', '#f2c230', '#7a3ad8', '#2aa05a', '#e8402a', '#f2f2f2'], counter: ['#6a4a30', '#e8e4dc', '#2a2a2e'] },
};

// the room's stock: one instanced mesh of boxes, each with its own size and colour
function shopStock(n) {
  const geo = new THREE.BoxGeometry(1, 1, 1), mat = new THREE.MeshBasicMaterial({ color: '#d4d4d4' });   // (rooms are lit by glow, not lights: unlit, so each box shows its own colour) ROOM.disp.push(geo, mat);
  const im = new THREE.InstancedMesh(geo, mat, n); ROOM.g.add(im);
  // (the colour buffer must be sized for all n before count drops to 0: setColorAt would size it by count)
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); im.count = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  return (x, y, z, w, h, d, col) => { if (im.count >= n) return; m4.compose(v.set(x, y, z), q, s.set(w, h, d)); im.setMatrixAt(im.count, m4); im.setColorAt(im.count, c.set(col)); im.count++; };
}
// shelving: a run of shelves along z (at x) or along x (at z), stocked on one or both faces; registered for shoplifting
function shopRack(put, o) {
  const { x, z, len, along, H, col, item, sides, ledge = col, levels } = o, alongZ = along === 'z', depth = sides.length > 1 ? 0.55 : 0.35;
  if (alongZ) ixBox(depth, H, len, col, x, H / 2, z); else ixBox(len, H, depth, col, x, H / 2, z);
  ROOM.shelves.push({ x0: alongZ ? x - 0.5 : x - len / 2, x1: alongZ ? x + 0.5 : x + len / 2, z0: alongZ ? z - len / 2 : z - 0.5, z1: alongZ ? z + len / 2 : z + 0.5 });
  const lv = levels || Math.max(2, Math.floor((H - 0.1) / 0.42));
  for (let l = 0; l < lv; l++) {
    const y = 0.14 + l * (H - 0.25) / lv;
    if (alongZ) ixBox(depth + 0.5, 0.03, len, ledge, x, y, z, false); else ixBox(len, 0.03, depth + 0.5, ledge, x, y, z, false);
    for (const side of sides) {
      let t = -len / 2 + 0.08;
      while (t < len / 2 - 0.1) {
        const [w, h, d, c, gap = 0.02] = item(l, side);
        if (t + w > len / 2 - 0.06) break;
        const off = depth / 2 + d / 2 + 0.01, px = alongZ ? x + side * off : x + t + w / 2, pz = alongZ ? z + t + w / 2 : z + side * off;
        put(px, y + 0.015 + h / 2, pz, alongZ ? d : w, h, alongZ ? w : d, c);
        t += w + gap;
      }
    }
  }
}
// a display table with things laid out on it (registered for shoplifting)
function shopTable(put, x, z, w, d, col, item, n) {
  ixBox(w, 0.8, d, col, x, 0.4, z);
  ROOM.shelves.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  for (let i = 0; i < n; i++) { const [iw, ih, id, c] = item(i); const fx = (i % 3 - 1) * w / 3.4, fz = (Math.floor(i / 3) % 2 - 0.5) * d / 2.2; put(x + fx, 0.8 + ih / 2, z + fz, iw, ih, id, c); }
}
// a bike, for the bike shop floor and wall
function shopBike(x, y, z, yaw, col, r) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; ROOM.g.add(g);
  const tyre = roomMat('#1a1a1a', 0.15), frame = roomMat(col, 0.35), wr = 0.3 + r() * 0.06;
  const wheel = new THREE.TorusGeometry(wr, 0.035, 6, 18); ROOM.disp.push(wheel);
  for (const wz of [-0.52, 0.52]) { const w = new THREE.Mesh(wheel, tyre); w.position.set(0, wr, wz); w.rotation.y = Math.PI / 2; g.add(w); }
  const bar = (len, px, py, pz, rx) => { const geo = new THREE.BoxGeometry(0.04, 0.04, len); ROOM.disp.push(geo); const m = new THREE.Mesh(geo, frame); m.position.set(px, py, pz); m.rotation.x = rx; g.add(m); };
  bar(0.62, 0, wr + 0.32, 0.02, 0); bar(0.62, 0, wr + 0.12, -0.2, -0.85); bar(0.55, 0, wr + 0.12, 0.28, 0.9); bar(0.5, 0, wr + 0.06, -0.3, 0.2);
  bar(0.1, 0, wr + 0.48, -0.26, Math.PI / 2); bar(0.36, 0, wr + 0.55, 0.36, 0);
  return g;
}

function buildShop(shop) {
  ROOM.kind = 'store';
  const th = shopTheme(shop.kind), L = SHOP_LOOKS[th], r = mulberry(shop.bi * 13 + 5), P = (a) => a[Math.floor(r() * a.length)];
  const lights = P(['#ffffff', '#fff4e0', '#f0f6ff']);
  roomShell(shop.bi, P(L.floorC), P(L.wall), { floor: P(L.floor), glow: th === 'tech' || th === 'pharmacy' ? 0.5 : 0.42, lights, H: th === 'hardware' ? 4.2 : 3.2 });
  ROOM.items = SHELF_LOOT[th];
  const put = shopStock(1800), shelfC = P(L.shelf), prods = L.prods, { x0, x1, z1 } = ROOM.box;
  const pc = () => prods[Math.floor(r() * prods.length)];
  // aisle positions and lengths differ shop to shop
  const aisles = P([[-5, -2], [-5.4, -3, -0.6], [-4.5, -1.5], [-5.2, -2.2, 0.6]]), az0 = -2.6 + r() * 0.8, az1 = 2.4 + r() * 0.9;
  const alen = az1 - az0, azc = (az0 + az1) / 2;

  if (th === 'grocery') {
    // aisles of packets and cans, a wall of glowing drink fridges at the back
    const sizes = [[0.18, 0.24, 0.14], [0.1, 0.16, 0.1], [0.26, 0.3, 0.18], [0.12, 0.28, 0.12]];
    for (const ax of aisles) shopRack(put, { x: ax, z: azc, len: alen, along: 'z', H: 1.7, col: shelfC, sides: [-1, 1], item: () => { const s = P(sizes); return [s[0], s[1], s[2], pc()]; } });
    const fw = 4.8 + r() * 1.2, fx = x0 + 0.3 + fw / 2;
    ixBox(fw, 2.2, 0.8, '#d8dde2', fx, 1.1, z1 - 0.45);
    for (let i = 0; i < Math.floor(fw / 0.9); i++) roomAdd(new THREE.PlaneGeometry(0.82, 1.9), ixGlowMat(P(['#cfe9f5', '#dff2ff', '#e8f6ee'])), x0 + 0.3 + 0.45 + i * 0.9, 1.1, z1 - 0.86).rotation.y = Math.PI;
    for (let i = 0; i < 40; i++) put(x0 + 0.5 + r() * (fw - 0.4), 0.3 + Math.floor(r() * 4) * 0.45, z1 - 0.95, 0.07, 0.22, 0.07, pc());
    if (r() < 0.6) { ixBox(0.6, 1.4, 0.5, P(['#e8402a', '#2a6ad8']), 1.6, 0.7, z1 - 0.4); ixBox(0.5, 0.3, 0.05, '#cfe9f5', 1.6, 1.1, z1 - 0.67, false, 0.8); }   // a slushie machine
    if (r() < 0.5) ixSign([P(['FRESH', 'OPEN 24H', 'HOT COFFEE', 'ATM INSIDE', 'LOTTO'])], 1.6, 0.4, P(['#d8312a', '#2a6ad8', '#2aa05a']), '#ffffff', x0 + 3, 2.7, z1 - 0.03);
  } else if (th === 'tech') {
    // a wall of TVs, demo tables with phones and laptops, boxed stock along the back
    const tvRows = 2 + (r() < 0.5 ? 1 : 0), tvCols = 3;
    ixBox(0.12, 2.4, 6, '#1a1a1e', x0 + 0.06, 1.4, 0.5, false);
    for (let i = 0; i < tvCols; i++) for (let j = 0; j < tvRows; j++) {
      const tv = roomAdd(new THREE.PlaneGeometry(1.7, 0.95), ixGlowMat(P(['#3a6ad8', '#2aa05a', '#d86a3a', '#8a3ad8', '#1a8ad8', '#e8e8ec'])), x0 + 0.14, 0.75 + j * 1.05, -1.5 + i * 1.9);
      tv.rotation.y = Math.PI / 2;
    }
    const tables = P([[[-2.6, -1.8], [-2.6, 1.6], [0.6, 0]], [[-2.4, 0], [0.8, -1.6], [0.8, 1.8]], [[-3, -1], [-3, 2], [0, -1], [0, 2]]]);
    const tc = P(['#f2f2f2', '#c8b090', '#2a2a2e']);
    for (const [tx, tz] of tables) {
      shopTable(put, tx, tz, 2.0, 1.0, tc, () => [0.08, 0.012, 0.15, '#1a1a1e'], 6);
      for (let i = 0; i < 6; i++) { const fx = (i % 3 - 1) * 2.0 / 3.4, fz = (Math.floor(i / 3) % 2 - 0.5) * 1.0 / 2.2; roomAdd(new THREE.PlaneGeometry(0.07, 0.13).rotateX(-Math.PI / 2), ixGlowMat(P(['#3a6ad8', '#e8eef2', '#2aa05a', '#8a3ad8'])), tx + fx, 0.818, tz + fz); }
    }
    shopRack(put, { x: -1.5, z: z1 - 0.3, len: 5.5, along: 'x', H: 2.0, col: shelfC, sides: [-1], item: () => [0.2 + r() * 0.15, 0.2 + r() * 0.12, 0.08, pc()] });
    ixSign([P(['NEW', 'SALE', '5G', 'GAMING', 'TRADE-IN'])], 1.4, 0.45, '#1a1a1e', P(['#3ab0ff', '#ff3d7f', '#3dff8a']), x0 + 0.14, 2.75, 0.5, Math.PI / 2);
  } else if (th === 'bikes') {
    // bikes in rows on the floor and hung on the wall, helmets and parts on shelves, a workbench
    const bcol = () => P(['#e8402a', '#2a6ad8', '#1a1a1a', '#f2c230', '#2aa05a', '#f2f2f2', '#8a3ad8']);
    const rows = P([[-5, -2.4], [-4.6, -1.6, 1.2], [-4.2, -0.8]]);
    for (const rx of rows) {
      for (let bz = az0 + 0.3; bz < az1 - 0.2; bz += 0.75 + r() * 0.3) shopBike(rx, 0, bz, Math.PI / 2, bcol(), r);
      ROOM.solids.push({ x0: rx - 0.65, x1: rx + 0.65, z0: az0, z1: az1 });
    }
    for (let i = 0; i < 4; i++) shopBike(x0 + 0.18, 1.35, -2.4 + i * 1.5, 0, bcol(), r).rotation.z = 0;
    shopRack(put, { x: -1.2, z: z1 - 0.25, len: 4.4, along: 'x', H: 2.0, col: shelfC, sides: [-1], item: (l) => l > 1 ? [0.26, 0.2, 0.26, bcol()] : [0.14 + r() * 0.12, 0.08 + r() * 0.12, 0.14, P(['#1a1a1a', '#3a3e44', '#e8402a', '#f2c230'])] });
    ixBox(2.2, 0.9, 0.7, '#6a4a30', 1.6, 0.45, -3.6); ixBox(1.6, 0.9, 0.04, '#3a3e44', 1.6, 1.4, -3.95, false);   // workbench and tool board
    for (let i = 0; i < 8; i++) put(1.0 + i * 0.17, 1.4 + (i % 2) * 0.25, -3.9, 0.05, 0.22, 0.03, P(['#c83a2a', '#3a3e44', '#e8e8ec']));
  } else if (th === 'books') {
    // tall bookcases round the walls, low ones in the middle, a reading corner
    const spine = () => [0.035 + r() * 0.035, 0.2 + r() * 0.12, 0.17, pc(), 0.004];
    shopRack(put, { x: x0 + 0.2, z: 0, len: 9.2, along: 'z', H: 2.5, col: shelfC, sides: [1], item: spine, levels: 6 });
    shopRack(put, { x: -2.2, z: z1 - 0.2, len: 6.5, along: 'x', H: 2.5, col: shelfC, sides: [-1], item: spine, levels: 6 });
    for (const ax of aisles.slice(1)) shopRack(put, { x: ax, z: azc - 0.4, len: alen - 0.8, along: 'z', H: 1.3, col: shelfC, sides: [-1, 1], item: spine, levels: 3 });
    const rc = P(['#8a2a2a', '#2a4a3a', '#6a4a30']);
    ixBox(0.9, 0.45, 0.9, rc, 1.6, 0.25, -3.2); ixBox(0.9, 0.5, 0.18, rc, 1.6, 0.7, -3.6, false); ixPlant(2.8, -4.3);
    if (r() < 0.6) shopTable(put, 1.4, -0.8, 1.6, 0.9, P(['#5a3a22', '#e8e4dc']), () => [0.2, 0.05, 0.28, pc()], 6);
  } else if (th === 'pharmacy') {
    // bright white aisles of small boxes, a pharmacy counter at the back with its own sign and pharmacist
    const sizes = [[0.1, 0.14, 0.06], [0.08, 0.2, 0.08], [0.14, 0.1, 0.06], [0.06, 0.16, 0.06]];
    for (const ax of aisles) shopRack(put, { x: ax, z: azc - 0.5, len: alen - 1, along: 'z', H: 1.6, col: shelfC, sides: [-1, 1], item: () => { const s = P(sizes); return [s[0], s[1], s[2], pc()]; } });
    ixBox(4.6, 1.05, 0.7, P(L.counter), -3.6, 0.52, z1 - 1.3);
    shopRack(put, { x: -3.6, z: z1 - 0.2, len: 5, along: 'x', H: 2.2, col: '#f2f2f2', sides: [-1], item: () => [0.1, 0.14, 0.06, P(['#f2f2f2', '#e8e8ec', '#3ab0d8'])] });
    ixSign([P(['PHARMACY', 'PRESCRIPTIONS', 'BEAUTY', 'HEALTH'])], 2.6, 0.45, P(['#2aa05a', '#3ab0d8', '#e86a9a']), '#ffffff', -3.6, 2.55, z1 - 0.03);
    addRoomPerson(4300 + shop.bi, -3.6, z1 - 0.8, Math.PI, 'pharmacist');
  } else if (th === 'hardware') {
    // tall orange racking with boxes up high, paint cans, a pegboard of tools, plants by the door
    for (const ax of aisles) shopRack(put, { x: ax, z: azc, len: alen, along: 'z', H: 2.9, col: '#3a3e44', ledge: shelfC, sides: [-1, 1], item: (l) => l >= 4 ? [0.5, 0.36, 0.4, P(['#b8946a', '#a8845a'])] : l === 0 ? [0.2, 0.24, 0.2, pc(), 0.03] : [0.12 + r() * 0.2, 0.1 + r() * 0.2, 0.15, pc()], levels: 6 });
    ixBox(0.05, 1.6, 4.5, '#b8946a', x0 + 0.03, 1.3, 1, false);
    for (let i = 0; i < 26; i++) put(x0 + 0.08, 0.7 + (i % 5) * 0.28, -1.0 + Math.floor(i / 5) * 0.85 + (r() - 0.5) * 0.2, 0.04, 0.06 + r() * 0.2, 0.05 + r() * 0.2, P(['#c83a2a', '#e86a1a', '#3a3e44', '#2a6ad8', '#f2c230']));
    ixPlant(-1.2, -4.2); ixPlant(0.9, -4.3); if (r() < 0.5) ixPlant(2.4, -4.2);
    ixSign([P(['TOOLS', 'PAINT', 'GARDEN', 'LUMBER', 'PLUMBING'])], 1.8, 0.45, '#e86a1a', '#ffffff', aisles[0], 3.4, azc, Math.PI / 2);
  } else {
    // a gift shop: round display tables, wall shelves, a rack of postcards
    const t = P([[[-3.5, -1.5], [-3.5, 1.8], [0, 0.2]], [[-4, 0], [-1, -1.8], [-1, 1.8]], [[-2.2, -1], [-2.2, 2]]]);
    for (const [tx, tz] of t) { ixCyl(0.75, 0.75, 0.05, P(L.shelf), tx, 0.82, tz); ixCyl(0.15, 0.25, 0.8, '#2a2a2e', tx, 0.4, tz, true); ROOM.shelves.push({ x0: tx - 0.75, x1: tx + 0.75, z0: tz - 0.75, z1: tz + 0.75 }); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; put(tx + Math.sin(a) * 0.45, 0.92, tz + Math.cos(a) * 0.45, 0.14, 0.16 + r() * 0.1, 0.14, pc()); } }
    shopRack(put, { x: x0 + 0.2, z: 0, len: 8, along: 'z', H: 2.2, col: shelfC, sides: [1], item: () => [0.12 + r() * 0.15, 0.1 + r() * 0.18, 0.14, pc(), 0.06] });
    ixBox(0.5, 1.6, 0.5, '#8a8e94', 1.6, 0.8, -3.6); for (let i = 0; i < 12; i++) put(1.6 + (i % 2 ? 0.26 : -0.26), 0.5 + Math.floor(i / 2) * 0.2, -3.6, 0.02, 0.15, 0.2, pc());
  }

  // the counter at the back right: its own colour, the till, the shop's name over it, and the cashier
  const c = ROOM.counter, cc = P(L.counter);
  ixBox(3.2, 1.0, 0.8, cc, c.x, 0.5, c.z - 0.6);
  ixBox(0.4, 0.25, 0.3, '#202226', c.x + 0.6, 1.13, c.z - 0.6, false);
  if (r() < 0.6) for (let i = 0; i < 10; i++) put(c.x - 1.2 + (i % 5) * 0.18, 1.07, c.z - 0.75 - Math.floor(i / 5) * 0.14, 0.12, 0.14, 0.04, pc());   // impulse buys
  const signBg = P(['#14151a', cc, '#f2efe6']), signFg = signBg === '#f2efe6' ? '#14151a' : '#f2efe6';
  ixSign([shop.name], 3.8, 0.55, signBg, signFg, c.x, 2.55, z1 - 0.03);
  addRoomPerson(4242 + shop.bi, c.x, c.z + 0.25, Math.PI, 'cashier');
  if (r() < 0.5) addRoomPerson(4250 + shop.bi, aisles[0] + 1.4, azc + (r() - 0.5) * 3, r() * TAU, 'shopper', 'Idle_Loop');
}
