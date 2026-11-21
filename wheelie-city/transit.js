// Wheelie City — transit you actually use: trains with doors, seats and windows on the real lines, stations with a
// street-level hall, fare gates and an escalator up to the platform (or down to it underground), and riding inside.
'use strict';

// ---------------------------------------------------------------- trains
const CAR_LEN = 17.2, CAR_GAP = 0.6, CAR_PITCH = CAR_LEN + CAR_GAP;
const LIVERY = {
  van: { body: '#f2f4f5', band: '#0057b8', band2: '#ffd200', seat: '#24529b', pole: '#d8dcdf', cars: 4, v: 22, card: 'Compass Card' },
  la: { body: '#c9ccd0', band: '#c9a227', band2: '#0072bc', seat: '#3a4a6a', pole: '#c9a227', cars: 3, v: 20, card: 'TAP card' },
  vegas: { body: '#2b6cb0', band: '#f2f2f2', band2: '#ffcc00', seat: '#2a3a7a', pole: '#d8dcdf', cars: 4, v: 18, card: 'Monorail pass' },
  miami: { body: '#d9dcdf', band: '#f47b20', band2: '#2a9d4a', seat: '#3a6a4a', pole: '#d8dcdf', cars: 4, v: 20, card: 'EASY Card' },
  nyc: { body: '#b8bcc0', band: '#2a2d33', band2: '#e04040', seat: '#6a7480', pole: '#d8dcdf', cars: 6, v: 17, card: 'OMNY' },
};
const trains = [];
const trainHalf = (t) => (t.cars.length - 1) * CAR_PITCH / 2;
// Trains stop with their middle at the station, so every car is beside the platform
const stopAt = (t, st) => clamp(st.s + t.dir * trainHalf(t), 5, MAP.lines[t.line].len - 5);
// Door centres along a car (local z) and the size of the opening
const DOOR_Z = [-4.3, 4.3], DOOR_W = 1.4, DOOR_TOP = 2.95, FLOOR_Y = 1.0;

// One car: an outer shell with real door openings and window glass, a furnished inside (floor, ceiling, seats, poles),
// light strips, and sliding door leaves. Local axes: +z towards the front, +x across, y up from the rail.
function carGeometry(L) {
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const shell = [], glass = [], inside = [], lights = [], leaves = { minus: [], plus: [] };
  const X = 1.32, T = 0.06, ZE = CAR_LEN / 2;
  // stretches of side wall between the door openings
  const solid = [[-ZE, DOOR_Z[0] - DOOR_W / 2], [DOOR_Z[0] + DOOR_W / 2, DOOR_Z[1] - DOOR_W / 2], [DOOR_Z[1] + DOOR_W / 2, ZE]];
  for (const s of [-1, 1]) {
    for (const [z0, z1] of solid) {
      const len = z1 - z0, zc = (z0 + z1) / 2;
      shell.push([box(T, 1.35, len, s * X, 1.075, zc), L.body]);                 // below the windows
      shell.push([box(T + 0.012, 0.3, len, s * X, 1.2, zc), L.band]);            // livery stripe
      shell.push([box(T, 0.55, len, s * X, 3.025, zc), L.body]);                 // above the windows
      shell.push([box(T + 0.012, 0.1, len, s * X, 3.1, zc), L.band2]);
      // windows: panes of glass between slim pillars
      const nW = Math.max(1, Math.round(len / 1.55)), pw = len / nW;
      for (let k = 0; k <= nW; k++) shell.push([box(T, 1.0, k === 0 || k === nW ? 0.12 : 0.2, s * X, 2.25, z0 + k * pw), '#1d2228']);
      for (let k = 0; k < nW; k++) glass.push([box(0.02, 0.98, pw - 0.18, s * X, 2.25, z0 + (k + 0.5) * pw), '#ffffff']);
      // inside lining
      inside.push([box(0.012, 0.75, len, s * (X - 0.04), 1.375, zc), '#d9dde0']);
      inside.push([box(0.012, 0.52, len, s * (X - 0.04), 3.0, zc), '#e6e8ea']);
    }
    for (const zc of DOOR_Z) {
      shell.push([box(T, FLOOR_Y - 0.4, DOOR_W, s * X, (0.4 + FLOOR_Y) / 2, zc), L.body]);                 // sill
      shell.push([box(T, 3.3 - DOOR_TOP, DOOR_W, s * X, (DOOR_TOP + 3.3) / 2, zc), L.body]);                // lintel
      inside.push([box(0.03, 0.05, DOOR_W, s * (X - 0.03), FLOOR_Y + 0.02, zc), '#ffd200']);                 // yellow edge on the step
      // two leaves per door, sliding apart; a tall window in each
      for (const [side, zl] of [['minus', zc - DOOR_W / 4], ['plus', zc + DOOR_W / 4]]) {
        leaves[side].push([box(0.04, DOOR_TOP - FLOOR_Y, DOOR_W / 2 - 0.02, s * (X - 0.045), (FLOOR_Y + DOOR_TOP) / 2, zl), L.body]);
        leaves[side].push([box(0.05, 0.9, DOOR_W / 2 - 0.22, s * (X - 0.045), 2.3, zl), '#1d2228']);
      }
    }
  }
  // roof, underframe, ends
  shell.push([box(2.7, 0.14, CAR_LEN, 0, 3.37, 0), L.body]);
  shell.push([box(2.2, 0.45, CAR_LEN - 2, 0, 0.35, 0), '#2a2c30']);
  shell.push([box(2.7, 0.2, CAR_LEN, 0, 0.5, 0), L.body]);
  for (const s of [-1, 1]) {
    shell.push([box(2.64, 2.9, 0.06, 0, 1.85, s * (ZE - 0.03)), L.body]);
    inside.push([box(0.9, 1.9, 0.02, 0, 1.95, s * (ZE - 0.07)), '#5d6670']);      // end door
    inside.push([box(0.6, 0.7, 0.025, 0, 2.3, s * (ZE - 0.075)), '#1d2228']);
  }
  // floor, ceiling and two light strips
  inside.push([box(2.58, 0.08, CAR_LEN - 0.1, 0, FLOOR_Y - 0.04, 0), '#3d4752']);
  inside.push([box(2.58, 0.03, CAR_LEN - 0.1, 0, 3.27, 0), '#eceef0']);
  for (const x of [-0.6, 0.6]) lights.push([box(0.2, 0.02, CAR_LEN - 1.2, x, 3.25, 0), '#ffffff']);
  // transverse seats in facing pairs: [cushion z, facing +1/-1]
  const SEATS = [[-3.0, 1], [-1.4, -1], [1.4, 1], [3.0, -1], [-8.15, 1], [-5.65, -1], [5.65, 1], [8.15, -1]];
  for (const s of [-1, 1]) for (const [zc, f] of SEATS) {
    const x = s * 0.82;
    inside.push([box(0.9, 0.12, 0.46, x, FLOOR_Y + 0.44, zc), L.seat]);
    inside.push([box(0.9, 0.64, 0.09, x, FLOOR_Y + 0.82, zc - f * 0.24), L.seat]);
    inside.push([box(0.9, 0.06, 0.1, x, FLOOR_Y + 1.15, zc - f * 0.26), '#2a2c30']);      // grab handle on the seat back
    inside.push([box(0.7, 0.38, 0.06, x, FLOOR_Y + 0.19, zc), '#2a2c30']);
  }
  // poles at the doors and down the middle, rails along the ceiling
  const pole = (x, z) => inside.push([new THREE.CylinderGeometry(0.022, 0.022, 3.25 - FLOOR_Y, 8).translate(x, (FLOOR_Y + 3.25) / 2, z), L.pole]);
  for (const s of [-1, 1]) for (const zc of DOOR_Z) { pole(s * 0.95, zc - DOOR_W / 2 - 0.15); pole(s * 0.95, zc + DOOR_W / 2 + 0.15); }
  pole(0, 0); pole(0, -6.9); pole(0, 6.9);
  for (const x of [-0.5, 0.5]) inside.push([new THREE.CylinderGeometry(0.02, 0.02, CAR_LEN - 1, 8).rotateX(Math.PI / 2).translate(x, 2.9, 0), L.pole]);
  // front of the lead car: big dark windscreen and headlights
  const nose = [[box(2.5, 1.3, 0.1, 0, 2.3, 0), '#12161c'], [box(0.5, 0.15, 0.08, 0.8, 1.4, 0), '#fff4d6'], [box(0.5, 0.15, 0.08, -0.8, 1.4, 0), '#fff4d6']];
  return { shell: mergeColored(shell), glass: mergeColored(glass), inside: mergeColored(inside), lights: mergeColored(lights),
    minus: mergeColored(leaves.minus), plus: mergeColored(leaves.plus), nose: mergeColored(nose) };
}

const trainMats = {};
function buildTrains() {
  for (const t of trains) scene.remove(t.g);
  trains.length = 0;
  const L = LIVERY[cityKey] || LIVERY.van, geo = carGeometry(L);
  trainMats.shell = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45 });
  trainMats.glass = new THREE.MeshStandardMaterial({ color: '#1c2a33', roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  trainMats.inside = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#2a2a2a' });
  trainMats.lights = new THREE.MeshBasicMaterial({ vertexColors: true });
  for (let k = 0; k < 6; k++) {
    const g = new THREE.Group(), cars = [];
    for (let c = 0; c < L.cars; c++) {
      const cg = new THREE.Group();
      const shell = new THREE.Mesh(geo.shell, trainMats.shell); shell.castShadow = true; cg.add(shell);
      const ins = new THREE.Mesh(geo.inside, trainMats.inside); cg.add(ins);
      cg.add(new THREE.Mesh(geo.lights, trainMats.lights));
      const gl = new THREE.Mesh(geo.glass, trainMats.glass); gl.renderOrder = 2; cg.add(gl);
      const minus = new THREE.Mesh(geo.minus, trainMats.shell), plus = new THREE.Mesh(geo.plus, trainMats.shell); cg.add(minus, plus);
      cg.userData = { minus, plus, open: 0 };
      if (c === 0 || c === L.cars - 1) { const nose = new THREE.Mesh(geo.nose, trainMats.shell); nose.position.z = (c === 0 ? 1 : -1) * (CAR_LEN / 2 + 0.03); if (c !== 0) nose.rotation.y = Math.PI; cg.add(nose); }
      g.add(cg); cars.push(cg);
    }
    g.visible = false; scene.add(g);
    trains.push({ g, cars, on: false, line: -1, s: 0, dir: 1, v: 0, dwell: 0, nextSt: null, mine: false, hold: false });
  }
}
const TP = { px: 0, pz: 0, h: 0, dx: 0, dz: 1 };
function placeTrain(t) {
  const ln = MAP.lines[t.line];
  for (let c = 0; c < t.cars.length; c++) {
    const sc = t.s - t.dir * c * CAR_PITCH;
    linePoint(ln, sc, TP);
    // aim along the chord from the car's rear to its front so it follows curves
    const f = linePoint(ln, sc + t.dir * CAR_LEN / 2, {}), b = linePoint(ln, sc - t.dir * CAR_LEN / 2, {});
    const cg = t.cars[c];
    cg.position.set(TP.px, TP.h + 0.05, TP.pz);
    cg.rotation.set(0, Math.atan2(f.px - b.px, f.pz - b.pz), 0);
    cg.rotation.x = -Math.atan2(f.h - b.h, CAR_LEN);
  }
  linePoint(ln, t.s, TP); t.x = TP.px; t.z = TP.pz; t.h = TP.h;
}
// Doors slide open about a second after the train stops and close a couple of seconds before it leaves
function updateDoors(t, d) {
  const want = t.atSt && t.dwell > 0 && (t.hold || t.dwell > 2) && t.stopT > 0.9 ? 1 : 0;
  for (const cg of t.cars) {
    const u = cg.userData;
    const was = u.open;
    u.open = want ? Math.min(1, u.open + d * 1.4) : Math.max(0, u.open - d * 1.2);
    if (u.open !== was) { u.minus.position.z = -u.open * (DOOR_W / 2 - 0.04); u.plus.position.z = u.open * (DOOR_W / 2 - 0.04); }
  }
  if (t.mine && want && !t.chimed) { t.chimed = true; sfx.chime(); }
  if (!want) t.chimed = false;
}
// Next station ahead of the train in its direction of travel
function nextStation(t) {
  const st = MAP.lines[t.line].stations;
  return t.dir > 0 ? st.find((s) => stopAt(t, s) > t.s + 1) : [...st].reverse().find((s) => stopAt(t, s) < t.s - 1);
}
function updateTrains(d) {
  if (!MAP || !MAP.lines.length) return;
  const L = LIVERY[cityKey] || LIVERY.van;
  // keep a train running on each line that passes near you
  for (const ln of MAP.lines) {
    if (trains.some((t) => t.on && t.line === ln.id)) continue;
    let near = 1e9; for (let i = 0; i < ln.xs.length; i += 3) near = Math.min(near, Math.hypot(ln.xs[i] - S.x, ln.zs[i] - S.z));
    if (near > 700) continue;
    const t = trains.find((x) => !x.on); if (!t) break;
    // start it a little way off so you see it pull in
    let s0 = 0, bd = 1e9; for (let i = 0; i < ln.xs.length; i++) { const dd = Math.hypot(ln.xs[i] - S.x, ln.zs[i] - S.z); if (dd < bd) { bd = dd; s0 = ln.cs[i]; } }
    const dir = Math.random() < 0.5 ? 1 : -1;
    Object.assign(t, { on: true, line: ln.id, dir, s: clamp(s0 - dir * (300 + Math.random() * 300), 40, ln.len - 40), v: L.v * 0.8, dwell: 0, mine: false, hold: false, atSt: null, nextSt: null });
    t.g.visible = true;
  }
  for (const t of trains) {
    if (!t.on) continue;
    const ln = MAP.lines[t.line];
    if (!t.mine && Math.hypot(t.x - S.x, t.z - S.z) > 1100) { t.on = false; t.g.visible = false; continue; }
    if (t.dwell > 0) {
      t.stopT = (t.stopT || 0) + d;
      if (!t.hold) { t.dwell -= d; if (t.dwell <= 0) t.nextSt = null; }
      updateDoors(t, d); placeTrain(t); continue;
    }
    t.stopT = 0;
    if (t.nextSt && t.dir * (stopAt(t, t.nextSt) - t.s) < -1) t.nextSt = null;     // went past it (teleport or line change)
    // the train you called runs straight to your station
    if (!t.nextSt) t.nextSt = t.call && t.dir * (stopAt(t, t.call) - t.s) > 0 ? t.call : nextStation(t);
    const ns = t.nextSt;
    let target = L.v;
    if (ns) {
      const rem = Math.abs(stopAt(t, ns) - t.s);
      target = Math.min(target, Math.sqrt(2 * 1.1 * Math.max(0, rem - 1)) + 0.3);
      if (rem < 1.2) { t.s = stopAt(t, ns); t.v = 0; t.dwell = t.mine ? 9 : 12; t.atSt = ns; t.nextSt = null; placeTrain(t); continue; }
    }
    // end of the line: reverse
    if (!ns && ((t.dir > 0 && t.s > ln.len - 30) || (t.dir < 0 && t.s < 30))) { t.dir = -t.dir; t.v = 0; t.dwell = 8; t.nextSt = null; t.atSt = null; }
    t.v += clamp(target - t.v, -1.4 * d, 1.0 * d);
    t.s = clamp(t.s + t.v * t.dir * d, 0, ln.len);
    t.atSt = null;
    updateDoors(t, d);
    placeTrain(t);
    // ground-level trains crossing the street will flatten you
    if (!S.riding && !S.crashed && Math.abs(t.h) < 0.6 && t.v > 2) {
      for (const cg of t.cars) {
        const dx = S.x - cg.position.x, dz = S.z - cg.position.z, a = cg.rotation.y, lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
        if (Math.abs(lx) < 1.6 && Math.abs(lz) < CAR_LEN / 2) { crash('Hit by a train', 'car', null, t.v + S.v); break; }
      }
    }
  }
}

// ---------------------------------------------------------------- stations
// Each station is laid out in its own frame: u along the track (direction of increasing distance), v across it towards
// the platform. The platform runs beside the track; an escalator lane outside it climbs (or drops) from the street hall,
// where the fare gates are, to a landing at platform level.
const PLAT_V0 = 1.9, PLAT_V1 = 5.5, PLAT_LEN = 76, LANE_V0 = 7.9, LANE_V1 = 9.2, ESC_V = (LANE_V0 + LANE_V1) / 2, HALL_V0 = 6.2, HALL_V1 = 11.4, GATE_LANE_V = 8.0;
const GATE_V = [6.5, 7.4, 8.6, 9.8, 11.0];
function stationFrame(st, su) {
  const ln = MAP.lines[st.line], P = linePoint(ln, st.s, {});
  const ux = P.dx, uz = P.dz, vx = -P.dz, vz = P.dx, h = P.h, yP = h + FLOOR_Y, flat = Math.abs(yP) < 2.2;
  const W = (u, v, y) => new THREE.Vector3(P.px + ux * u + vx * v, y, P.pz + uz * u + vz * v);
  // su: which way along the track the escalator and street hall go (+1 or -1). Chosen once per station: the way with
  // fewer streets and buildings in the hall's footprint.
  if (su === undefined) {
    if (st._su === undefined) {
      const score = (k) => { let n = 0; for (let u = 12; u <= 48; u += 4) for (let v = HALL_V0; v <= HALL_V1; v += 1.3) { const p = W(-k * u, v, 0); if (buildingAt(p.x, p.z, 0) >= 0) n += 2; else { const q = roadQuery(p.x, p.z, 10, drivable, RQB); if (q.e >= 0 && q.in) n++; } } return n; };
      st._su = score(-1) < score(1) ? -1 : 1;
    }
    su = st._su;
  }
  const run = flat ? 8 : Math.abs(yP) * 1.73;          // escalators climb at 30 degrees; a short ramp at ground-level stations
  const eTop = -12 * su, eBot = eTop - su * run, hallEnd = eBot - su * 1.5, gateU = hallEnd - su * 7, hallStart = hallEnd - su * 15;
  // height of the escalator floor at u
  const escY = (u) => yP * clamp((u - eBot) * su / run, 0, 1);
  return { st, P, su, ux, uz, vx, vz, h, yP, flat, under: h < -1, run, eTop, eBot, hallEnd, gateU, hallStart, W, escY, ang: Math.atan2(ux, uz) };
}
const stationKey = (st) => `${st.line}|${st.name}`;
const STATION_GATES = new Map();      // station key -> the paddles of the lane you walk through, while its tile is loaded

// Built with the station's tile. Group-local coordinates: z = u, x = -v (the group is turned to face along the track).
function buildStationHall(st, g, disp, lineObs) {
  const F = stationFrame(st), grp = new THREE.Group();
  grp.position.set(F.P.px, 0, F.P.pz); grp.rotation.y = F.ang; g.add(grp);
  const meshes = { floor: new GeoBuf(true), metal: new GeoBuf(true), glass: new GeoBuf(), roof: new GeoBuf(true), steps: new GeoBuf(true), dark: new GeoBuf(true) };
  const C_ = (hex) => new THREE.Color(hex);
  const colFloor = C_('#b9b6ae'), colMetal = C_('#9aa1a8'), colDark = C_('#24272b'), colRoof = C_('#d8dbdf'), colStep = C_('#5b6066'), colBlue = C_('#1f5fbf'), colYel = C_('#ffd200');
  // axis-aligned box in group space from u0..u1, v0..v1, y0..y1
  const boxUV = (gb, u0, u1, v0, v1, y0, y1, col) => {
    const x0 = -v1, x1 = -v0;
    gb.flat(x0, u0, x1, u0, x1, u1, x0, u1, y1, col, 0);
    gb.flat(x0, u1, x1, u1, x1, u0, x0, u0, y0, col, 0);
    gb.wall(x0, u0, x1, u0, y0, y1, 0, -1, col); gb.wall(x1, u1, x0, u1, y0, y1, 0, 1, col);
    gb.wall(x1, u0, x1, u1, y0, y1, 1, 0, col); gb.wall(x0, u1, x0, u0, y0, y1, -1, 0, col);
  };
  // a slab that slopes along u: top surface from (u0, ya) to (u1, yb), thickness th, across v0..v1
  const slope = (gb, u0, u1, v0, v1, ya, yb, th, col) => {
    const x0 = -v1, x1 = -v0;
    gb.v(x0, ya, u0, 0, 1, 0, col); gb.v(x1, yb, u1, 0, 1, 0, col); gb.v(x1, ya, u0, 0, 1, 0, col);
    gb.v(x0, ya, u0, 0, 1, 0, col); gb.v(x0, yb, u1, 0, 1, 0, col); gb.v(x1, yb, u1, 0, 1, 0, col);
    gb.v(x0, ya - th, u0, 0, -1, 0, col); gb.v(x1, ya - th, u0, 0, -1, 0, col); gb.v(x1, yb - th, u1, 0, -1, 0, col);
    gb.v(x0, ya - th, u0, 0, -1, 0, col); gb.v(x1, yb - th, u1, 0, -1, 0, col); gb.v(x0, yb - th, u1, 0, -1, 0, col);
  };
  // sloped side wall at v from (u0, ya0..ya1) to (u1, yb0..yb1)
  const sideWall = (gb, v, u0, u1, ya0, ya1, yb0, yb1, col) => {
    const x = -v;
    gb.v(x, ya0, u0, 1, 0, 0, col); gb.v(x, yb0, u1, 1, 0, 0, col); gb.v(x, yb1, u1, 1, 0, 0, col);
    gb.v(x, ya0, u0, 1, 0, 0, col); gb.v(x, yb1, u1, 1, 0, 0, col); gb.v(x, ya1, u0, 1, 0, 0, col);
  };

  // street hall: floor, glass side walls on posts, roof, and a sign over the entrance
  const { hallStart: h0, hallEnd: h1, eBot, eTop, yP, run, su } = F;
  boxUV(meshes.floor, h0, eBot + su * 0.2, HALL_V0, HALL_V1, -0.05, 0.03, colFloor);
  const roofEnd = F.under ? eBot + su * 3 : h1;
  boxUV(meshes.roof, h0 - su, roofEnd, HALL_V0 - 0.4, HALL_V1 + 0.4, 3.4, 3.65, colRoof);
  for (const v of [HALL_V0, HALL_V1]) {
    const nP = Math.max(1, Math.round(Math.abs(roofEnd - h0) / 3.5));
    for (let k = 0; k <= nP; k++) { const u = h0 + (roofEnd - h0) * k / nP; boxUV(meshes.metal, u - 0.07, u + 0.07, v - 0.07, v + 0.07, 0, 3.4, colMetal); }
    boxUV(meshes.glass, h0, roofEnd, v - 0.02, v + 0.02, 0.05, 3.35, null);
    const a = F.W(h0, v, 0), b = F.W(roofEnd, v, 0); lineObs.push([a.x, a.z, b.x, b.z, 'Hit the station', 0.15]);
  }
  boxUV(meshes.dark, h0 - su * 1.05, h0 - su * 0.95, HALL_V0 - 0.4, HALL_V1 + 0.4, 3.0, 3.4, colBlue);
  // fare gates: cabinets with a blue light on top; the paddles of the walk-through lane swing open when you tap
  for (const v of GATE_V) { boxUV(meshes.metal, F.gateU - 0.75, F.gateU + 0.75, v - 0.14, v + 0.14, 0, 1.02, C_('#c9ced3')); boxUV(meshes.dark, F.gateU - 0.6, F.gateU + 0.6, v - 0.1, v + 0.1, 1.02, 1.06, colBlue); boxUV(meshes.dark, F.gateU - su * 0.6, F.gateU - su * 0.55, v - 0.08, v + 0.08, 0.8, 1.0, colYel); }
  const paddleMat = new THREE.MeshStandardMaterial({ color: '#bfe0f0', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55, side: THREE.DoubleSide }); disp.push(paddleMat);
  const padGeo = new THREE.BoxGeometry(0.5, 0.75, 0.03).translate(0.25, 0.85, 0); disp.push(padGeo);
  const pads = [];
  for (let k = 0; k < GATE_V.length - 1; k++) {
    const vA = GATE_V[k] + 0.14, vB = GATE_V[k + 1] - 0.14, mine = Math.abs((vA + vB) / 2 - GATE_LANE_V) < 0.3;
    for (const [v, sgn] of [[vA, -1], [vB, 1]]) {
      // hinge on the cabinet face; the panel reaches into the lane
      const piv = new THREE.Group(); piv.position.set(-v, 0, F.gateU); piv.rotation.y = sgn > 0 ? 0 : Math.PI;
      const m = new THREE.Mesh(padGeo, paddleMat); m.scale.x = (vB - vA) / 2 / 0.5; piv.add(m); grp.add(piv);
      if (mine) pads.push({ piv, closed: piv.rotation.y, sgn });
    }
  }
  STATION_GATES.set(stationKey(st), { pads, open: 0, want: 0 });

  // escalator (or a ramp at ground-level stations): steps, sloped truss sides, handrails on glass balustrades
  if (F.flat) slope(meshes.floor, eBot, eTop, LANE_V0, LANE_V1, 0.03, yP, 0.3, colFloor);
  else {
    const n = Math.ceil(run / 0.4), dy = yP / n, du = su * run / n;
    for (let k = 0; k < n; k++) {
      const ua = eBot + k * du, ub = ua + du, y = (k + 1) * dy;
      boxUV(meshes.steps, ua, ub, LANE_V0 + 0.12, LANE_V1 - 0.12, Math.min(y, y - dy) - 0.02, Math.max(y, y - dy), colStep);
    }
    for (const v of [LANE_V0, LANE_V1]) {
      sideWall(meshes.metal, v, eBot, eTop, -0.6, 0.15, yP - 0.6, yP + 0.15, colMetal);
      sideWall(meshes.glass, v, eBot, eTop, 0.15, 1.0, yP + 0.15, yP + 1.0, null);
      slope(meshes.dark, eBot - su * 0.4, eTop + su * 0.4, v - 0.05, v + 0.05, 1.05, yP + 1.05, 0.08, colDark);    // handrail
    }
    if (!F.under) {
      // the escalator truss underneath, on two legs
      slope(meshes.metal, eBot, eTop, LANE_V0, LANE_V1, -0.1, yP - 0.1, 0.8, colMetal);
      for (const f of [0.35, 0.75]) { const u = eBot + su * run * f; boxUV(meshes.metal, u - 0.25, u + 0.25, ESC_V - 0.25, ESC_V + 0.25, 0, F.escY(u) - 0.9, colMetal); }
      const a = F.W(eBot, LANE_V0, 0), b = F.W(eBot + su * run * 0.45, LANE_V0, 0), c = F.W(eBot, LANE_V1, 0), dd = F.W(eBot + su * run * 0.45, LANE_V1, 0);
      lineObs.push([a.x, a.z, b.x, b.z, 'Hit the escalator', 0.2], [c.x, c.z, dd.x, dd.z, 'Hit the escalator', 0.2]);
    }
  }
  // landing at platform level joining the escalator to the platform, with a railing round its outer edge
  boxUV(meshes.floor, eTop - su * 0.2, eTop + su * 4.5, PLAT_V1 - 0.1, LANE_V1, yP - 0.6, yP, colFloor);
  if (!F.under) boxUV(meshes.metal, eTop + su * 4.4, eTop + su * 4.5, PLAT_V1, LANE_V1, yP, yP + 1.05, colMetal);
  if (!F.under) boxUV(meshes.metal, eTop - su * 0.2, eTop + su * 4.5, LANE_V1 - 0.05, LANE_V1 + 0.05, yP, yP + 1.05, colMetal);

  // underground: a shaft round the escalator (walls and a sloping ceiling), and the station box's roof over the lane
  if (F.under) {
    const shaft = new GeoBuf(true), colT = C_('#4a4d52');
    for (const v of [LANE_V0 - 0.05, LANE_V1 + 0.05]) sideWall(shaft, v, eBot, eTop, -0.7, 3.1, yP - 0.7, yP + 3.1, colT);
    slope(shaft, eBot, eTop, LANE_V0 - 0.05, LANE_V1 + 0.05, 3.15, yP + 3.15, 0.1, colT);
    const cTop = F.h + 5.4;
    boxUV(shaft, eTop - 0.05, eTop + 0.05, LANE_V0, LANE_V1, yP + 3.1, cTop, colT);
    boxUV(shaft, -45, Math.min(eBot, eTop), LANE_V0 - 0.05, LANE_V1 + 0.05, cTop - 0.1, cTop, colT);
    boxUV(shaft, Math.max(eBot, eTop), 45, LANE_V0 - 0.05, LANE_V1 + 0.05, cTop - 0.1, cTop, colT);
    // strip lights down the shaft ceiling
    const lamp = new GeoBuf(); slope(lamp, eBot + su * 0.5, eTop - su * 0.5, ESC_V - 0.12, ESC_V + 0.12, 3.03, yP + 3.03, 0.02, null);
    const lm = new THREE.Mesh(lamp.build(), MM.tunnelLamp); grp.add(lm); disp.push(lm.geometry);
    const sm = new THREE.Mesh(shaft.build(), MM.tunnel); grp.add(sm); disp.push(sm.geometry);
  }
  const mats = { floor: MM.stationFloor, metal: MM.stationMetal, glass: MM.glass, roof: MM.stationFloor, steps: MM.stationMetal, dark: MM.stationDark };
  for (const [k, gb] of Object.entries(meshes)) {
    if (gb.empty) continue;
    const me = new THREE.Mesh(gb.build(), mats[k]); me.receiveShadow = true; if (k !== 'glass') me.castShadow = k !== 'floor'; grp.add(me); disp.push(me.geometry);
  }
  // name board over the entrance
  const tex = shopSignTexture(`${TRANSIT[cityKey] || 'Transit'} · ${st.name}`, '#0d3b8c'), sm = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(HALL_V1 - HALL_V0 + 0.6, 0.38), sm);
  sign.position.set(-(HALL_V0 + HALL_V1) / 2, 3.2, h0 - su * 1.07); sign.rotation.y = su > 0 ? Math.PI : 0; grp.add(sign); disp.push(tex, sm, sign.geometry);

  // the platform itself: a screen along its back edge (glass up top, a tiled wall underground) with the station's name
  // on it every 18 m, strip lights overhead, and benches
  const lo = Math.min(eTop - su * 0.2, eTop + su * 4.5), hi = Math.max(eTop - su * 0.2, eTop + su * 4.5), half = PLAT_LEN / 2 - 1;
  const nameTex = shopSignTexture(st.name, '#0d3b8c'), nameMat = new THREE.MeshBasicMaterial({ map: nameTex, side: THREE.DoubleSide }), nameGeo = new THREE.PlaneGeometry(3.2, 0.6);
  disp.push(nameTex, nameMat, nameGeo);
  const back = new GeoBuf(true), lamps = new GeoBuf(), glass2 = new GeoBuf(), colWall = C_(F.under ? '#c9ccc4' : '#9aa1a8');
  for (const [u0, u1] of [[-half, lo], [hi, half]]) {
    if (u1 - u0 < 1) continue;
    if (F.under) boxUV(back, u0, u1, PLAT_V1 - 0.02, PLAT_V1 + 0.08, yP - 0.2, F.h + 5.4, colWall);
    else {
      boxUV(back, u0, u1, PLAT_V1 - 0.08, PLAT_V1, yP, yP + 0.25, colWall);
      boxUV(glass2, u0, u1, PLAT_V1 - 0.06, PLAT_V1 - 0.02, yP + 0.25, yP + 2.3, null);
      boxUV(back, u0, u1, PLAT_V1 - 0.08, PLAT_V1, yP + 2.3, yP + 2.42, colWall);
    }
  }
  for (let u = -30; u <= 30; u += 18) {
    if (u > lo - 2 && u < hi + 2) continue;
    const n1 = new THREE.Mesh(nameGeo, nameMat); n1.position.set(-(PLAT_V1 - 0.12), yP + 1.7, u); n1.rotation.y = Math.PI / 2; grp.add(n1);
    if (F.under) { const n2 = new THREE.Mesh(nameGeo, nameMat); n2.position.set(2.5, yP + 1.7, u + 9); n2.rotation.y = -Math.PI / 2; grp.add(n2); }
    boxUV(back, u + 5, u + 7.4, 4.85, 5.3, yP, yP + 0.45, C_('#5d6670'));      // bench
  }
  const lampY = F.under ? F.h + 5.3 : yP + 4.1;
  boxUV(lamps, -half, half, 3.55, 3.85, lampY - 0.04, lampY, null);
  if (!back.empty) { const me = new THREE.Mesh(back.build(), MM.stationFloor); me.receiveShadow = true; grp.add(me); disp.push(me.geometry); }
  const lm2 = new THREE.Mesh(lamps.build(), MM.tunnelLamp); grp.add(lm2); disp.push(lm2.geometry);
  if (!glass2.empty) { const gm = new THREE.Mesh(glass2.build(), MM.glass); grp.add(gm); disp.push(gm.geometry); }
}

// ---------------------------------------------------------------- riding: walking through the station, then the train
const RIDE = { on: false, train: null, car: 0, seat: null, view: 'seat', yaw: 0, pitch: 0, near: null, screenT: 0 };
// Walking on a set path through a station (in to the train, or out to the street)
const WALK = { on: false, pts: [], i: 0, f: 0, yaw: 0, pitch: 0, bob: 0, st: null, F: null, dir: 1, stage: '', train: null, lookT: 0 };
function stationNear(x, z, r) {
  let best = null, bd = r;
  for (const ln of MAP.lines) for (const st of ln.stations) {
    const F = stationFrame(st), door = F.W(F.hallStart - 3, GATE_LANE_V, 0);
    const d = Math.min(Math.hypot(st.x - x, st.z - z), Math.hypot(st.px - x, st.pz - z), Math.hypot(door.x - x, door.z - z));
    if (d < bd) { bd = d; best = st; }
  }
  return best;
}
// Ends of the line a station's trains run to: +1 towards the last station, -1 towards the first
function lineEnds(st) {
  const ln = MAP.lines[st.line], first = ln.stations[0], last = ln.stations[ln.stations.length - 1];
  return { plus: st === last || st.s > ln.len - 120 ? null : last, minus: st === first || st.s < 120 ? null : first };
}
const canLeave = (t) => t.atSt && t.dwell > 0 && (t.departed || t.atSt !== t.boardSt) && t.stopT > 1.2;

// The door you use: the one closest to the escalator landing. Returns the car, which door, and its u on the platform.
// (dz is the door's place along its car, in the car's own frame where +z is the front)
function pickDoor(F, dir, cars) {
  let best = null; const target = F.eTop + F.su * 1.5;
  for (let c = 0; c < cars; c++) {
    const uc = dir * ((cars - 1) * CAR_PITCH / 2 - c * CAR_PITCH);
    for (const dz of DOOR_Z) { const u = uc + dir * dz; if (!best || Math.abs(u - target) < Math.abs(best.u - target)) best = { car: c, dz, u }; }
  }
  return best;
}
// A forward-facing window seat by that door, on the given side of the car (local x sign)
// (each one looks down the length of the car, not at the end wall)
const pickSeat = (dz, side) => ({ x: side * 1.04, z: dz < 0 ? -3.0 : 1.4, f: 1 });
const node = (p, tag, extra) => ({ p, tag: tag || '', ...extra });
// Street -> gate -> escalator -> landing -> platform spot by the door
function pathIn(F, door) {
  const y = F.yP, su = F.su;
  return [
    node(F.W(F.hallStart - su * 4, GATE_LANE_V, 0)), node(F.W(F.hallStart + su * 1, GATE_LANE_V, 0)),
    node(F.W(F.gateU - su * 1.1, GATE_LANE_V, 0), 'gate'), node(F.W(F.gateU + su * 1.6, GATE_LANE_V, 0), 'gated'),
    node(F.W(F.eBot - su * 1.2, ESC_V, 0)), node(F.W(F.eBot, ESC_V, 0), 'esc'), node(F.W(F.eTop, ESC_V, y)),
    node(F.W(F.eTop + su * 1.6, ESC_V, y)), node(F.W(F.eTop + su * 1.6, 4.2, y)), node(F.W(door.u, 2.6, y), 'wait'),
  ];
}
// Platform spot by the door -> landing -> escalator -> gate (tap out) -> street
function pathOut(F, u) {
  const y = F.yP, su = F.su;
  return [
    node(F.W(u, 2.6, y), 'off'), node(F.W(F.eTop + su * 1.6, 4.2, y)), node(F.W(F.eTop + su * 1.6, ESC_V, y)), node(F.W(F.eTop, ESC_V, y), 'esc'),
    node(F.W(F.eBot, ESC_V, 0)), node(F.W(F.eBot - su * 1.2, ESC_V, 0)), node(F.W(F.gateU + su * 1.6, GATE_LANE_V, 0), 'gate'),
    node(F.W(F.gateU - su * 1.1, GATE_LANE_V, 0), 'gated'), node(F.W(F.hallStart + su * 1, GATE_LANE_V, 0)), node(F.W(F.hallStart - su * 4, GATE_LANE_V, 0)),
  ];
}
function carWorld(cg, x, y, z) { cg.updateMatrixWorld(true); return cg.localToWorld(new THREE.Vector3(x, y, z)); }

function enterStation(st, dir) {
  const ends = lineEnds(st);
  if (dir > 0 && !ends.plus) dir = -1;
  if (dir < 0 && !ends.minus) dir = 1;
  const F = stationFrame(st), L = LIVERY[cityKey] || LIVERY.van, door = pickDoor(F, dir, L.cars);
  Object.assign(WALK, { on: true, pts: pathIn(F, door), i: 0, f: 0, st, F, dir, door, stage: 'in', train: null, bob: 0 });
  const a = WALK.pts[0].p, b = WALK.pts[1].p; WALK.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)); WALK.pitch = -0.05;
  S.riding = true; S.v = 0; S.thr = 0; rig.root.visible = false;
  fillPlatform(F);
  if (W.active) W = { active: false };
  popup(`${st.name} · ${TRANSIT[cityKey] || 'Train'} to ${(dir > 0 ? ends.plus : ends.minus).name}`, 'place');
  if (stars()) popup('Cops can’t follow you in here', 'good');
  camSnap = true;
}
// The train for you: pulls in from up the line and waits with its doors open until you're on
function callTrain(st, dir) {
  const ln = MAP.lines[st.line], L = LIVERY[cityKey] || LIVERY.van;
  let t = trains.find((x) => x.on && x.line === ln.id && !x.mine && x.dir === dir && x.dwell <= 0 && x.dir * (stopAt(x, st) - x.s) > 60 && x.dir * (stopAt(x, st) - x.s) < 500);
  if (!t) {
    t = trains.find((x) => !x.on) || trains.find((x) => !x.mine && Math.hypot(x.x - S.x, x.z - S.z) > 300) || trains[0];
    Object.assign(t, { on: true, line: ln.id, dir, dwell: 0, nextSt: null, atSt: null, v: L.v * 0.7 });
    t.s = clamp(stopAt(t, st) - dir * 240, 5, ln.len - 5);
    t.g.visible = true;
  }
  Object.assign(t, { mine: true, hold: false, call: st, boardSt: st, departed: false });
  placeTrain(t);
  return t;
}
function startTrainRide() {
  const t = WALK.train, cg = t.cars[WALK.door.car];
  RIDE.on = true; RIDE.train = t; RIDE.car = WALK.door.car; RIDE.seat = WALK.seat; RIDE.view = 'seat';
  RIDE.yaw = WALK.seat.x > 0 ? 0.45 : -0.45; RIDE.pitch = -0.06;      // facing forward, turned a little to the window
  WALK.on = false;
  t.hold = false; t.dwell = Math.min(t.dwell, 3.5); t.call = null; t.boardSt = WALK.st; t.departed = false;
  attachScreens(cg); fillCar(cg, WALK.seat);
  camSnap = true;
}
function leaveTrain() {
  const t = RIDE.train, st = t && t.atSt;
  if (!st || !canLeave(t)) return;
  const F = stationFrame(st), cg = t.cars[RIDE.car], seat = RIDE.seat;
  // the door by your seat, then out across the platform and back to the street
  const dz = seat.z < 0 ? DOOR_Z[0] : DOOR_Z[1];
  const sidePlat = Math.sign(-t.dir) || 1;     // the platform is on this side of the car (local x)
  const seatP = carWorld(cg, seat.x * 0.75, 0, seat.z), aisle = carWorld(cg, 0, 0, dz + (seat.z > dz ? 0.9 : -0.9)), row = carWorld(cg, 0, 0, seat.z), doorIn = carWorld(cg, sidePlat * 0.5, 0, dz), doorOut = carWorld(cg, sidePlat * 1.9, 0, dz);
  const uDoor = (doorOut.x - F.P.px) * F.ux + (doorOut.z - F.P.pz) * F.uz;
  seatP.y = row.y = aisle.y = doorIn.y = F.yP;
  WALK.pts = [node(seatP, 'auto'), node(row, 'auto'), node(aisle, 'auto'), node(doorIn, 'auto'), ...pathOut(F, uDoor)];
  Object.assign(WALK, { on: true, i: 0, f: 0, st, F, dir: t.dir, stage: 'out', train: t, bob: 0 });
  const a = WALK.pts[0].p, b = WALK.pts[1].p; WALK.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)); WALK.pitch = -0.05;
  t.hold = true;
  detachScreens(); fillPlatform(F);
  RIDE.on = false; RIDE.train = null;
  popup(st.name, 'place'); camSnap = true;
}
// At a stop: stay on and ride back the other way
function reverseTrain() {
  const t = RIDE.train; if (!t || !t.atSt || t.dwell <= 0) return;
  const ends = lineEnds(t.atSt), dir = -t.dir, to = dir > 0 ? ends.plus : ends.minus;
  if (!to) { popup('End of the line'); return; }
  t.dir = dir; t.nextSt = null; t.dwell = Math.max(t.dwell, 3); t.boardSt = t.atSt; t.departed = false;
  popup(`Now heading to ${to.name}`, 'place'); camSnap = true;
}
// Back on the street with your bike
function finishWalkOut() {
  const F = WALK.F, p = F.W(F.hallStart - 6, GATE_LANE_V, 0);
  WALK.on = false; S.riding = false; rig.root.visible = true;
  disposePeople(platPeople); platPeople = null;
  if (WALK.train) { WALK.train.hold = false; WALK.train.mine = false; }
  placeOnRoad(p.x, p.z, F.ang + Math.PI, 0, false);
  camSnap = true;
}
// Leave everything (respawn, reset, back to the menu)
function endTransit() {
  if (RIDE.train) { RIDE.train.mine = false; RIDE.train.hold = false; }
  if (WALK.train) { WALK.train.mine = false; WALK.train.hold = false; }
  detachScreens(); disposePeople(carPeople); disposePeople(platPeople); carPeople = platPeople = null;
  RIDE.on = false; RIDE.train = null; WALK.on = false; WALK.train = null;
}

// Other passengers: people seated in your car, a couple standing at the poles, and a few waiting on the platform
function makePerson(seed, pose) {
  const r = mulberry(seed), skin = pick(r, PED_SKIN), top = pick(r, PED_TOP), legs = pick(r, PED_LEGS), hair = pick(r, PED_HAIR);
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  body.add(new THREE.Mesh(mergeColored([[PED.torso, top], [PED.hips, legs], [PED.neck, skin], [PED.head, skin], [PED.hair, hair]]), pedMat));
  const limb = (geo, hand, hex, x, y) => { const pv = new THREE.Group(); pv.position.set(x, y, 0); pv.add(new THREE.Mesh(mergeColored([[geo, hex], [hand, hand === PED.shoe ? '#222' : skin]]), pedMat)); body.add(pv); return pv; };
  const legL = limb(PED.leg, PED.shoe, legs, 0.1, 0.9), legR = limb(PED.leg, PED.shoe, legs, -0.1, 0.9);
  const armL = limb(PED.arm, PED.hand, top, 0.245, 1.5), armR = limb(PED.arm, PED.hand, top, -0.245, 1.5);
  const P = IDLE_ARMS[pose === 'seat' ? pick(r, ['text', 'stand', 'phone', 'stand']) : pose] || IDLE_ARMS.stand;
  armL.rotation.set(P[0], 0, P[1]); armR.rotation.set(P[2], 0, P[3]);
  if (pose === 'seat') { body.position.y = -0.4; legL.rotation.x = legR.rotation.x = -1.45; }
  if (pose === 'hold') armR.rotation.set(-2.9, 0, 0.1);      // holding the overhead rail
  g.scale.setScalar(0.9 + r() * 0.18);
  return g;
}
function disposePeople(grp) { if (!grp) return; if (grp.parent) grp.parent.remove(grp); grp.traverse((o) => o.geometry && o.geometry.dispose()); }
let carPeople = null, platPeople = null;
function fillCar(cg, mySeat) {
  disposePeople(carPeople); carPeople = new THREE.Group();
  const SEATS = [[-3.0, 1], [-1.4, -1], [1.4, 1], [3.0, -1], [-8.15, 1], [-5.65, -1], [5.65, 1], [8.15, -1]], r = mulberry(Math.floor(Math.random() * 1e6));
  for (const [z, f] of SEATS) for (const s of [-1, 1]) for (const x of [0.6, 1.04]) {
    if (Math.abs(z - mySeat.z) < 0.1 && Math.sign(mySeat.x) === s) continue;      // your seat and the one beside you stay free
    if (r() > 0.32) continue;
    const p = makePerson(Math.floor(r() * 1e6), 'seat'); p.position.set(s * x, FLOOR_Y, z - f * 0.12); p.rotation.y = f > 0 ? 0 : Math.PI; carPeople.add(p);
  }
  for (const z of [-6.6, 0.4, 6.6]) {
    if (r() > 0.6) continue;
    const p = makePerson(Math.floor(r() * 1e6), r() < 0.5 ? 'hold' : 'phone'); p.position.set((r() - 0.5) * 0.6, FLOOR_Y, z); p.rotation.y = r() * TAU; carPeople.add(p);
  }
  cg.add(carPeople);
}
function fillPlatform(F) {
  disposePeople(platPeople); platPeople = new THREE.Group();
  const n = 4 + Math.floor(Math.random() * 5);
  for (let k = 0; k < n; k++) {
    const u = (Math.random() - 0.5) * 60, v = 2.9 + Math.random() * 1.6;
    if (Math.abs(u - (F.eTop + F.su * 2)) < 4) continue;          // keep the landing clear
    const p = makePerson(Math.floor(Math.random() * 1e6), pick(Math.random, ['phone', 'text', 'stand', 'fold', 'text']));
    const w = F.W(u, v, F.yP); p.position.copy(w);
    p.rotation.y = Math.atan2(-F.vx, -F.vz) + (Math.random() - 0.5) * 1.2;     // facing the track, more or less
    platPeople.add(p);
  }
  scene.add(platPeople);
}

// Next-stop screens above the doors inside your car
let screenMesh = null, screenCv = null, screenTex = null, screenText = '';
function attachScreens(cg) {
  if (!screenMesh) {
    screenCv = document.createElement('canvas'); screenCv.width = 512; screenCv.height = 64;
    screenTex = new THREE.CanvasTexture(screenCv);
    const mat = new THREE.MeshBasicMaterial({ map: screenTex }), geo = new THREE.PlaneGeometry(1.3, 0.16);
    screenMesh = new THREE.Group();
    for (const s of [-1, 1]) for (const dz of DOOR_Z) { const m = new THREE.Mesh(geo, mat); m.position.set(s * 1.2, DOOR_TOP + 0.13, dz); m.rotation.y = -s * Math.PI / 2; screenMesh.add(m); }
  }
  cg.add(screenMesh); screenText = '';
}
function detachScreens() { if (screenMesh && screenMesh.parent) screenMesh.parent.remove(screenMesh); }
function drawScreen(text) {
  if (!screenCv || text === screenText) return;
  screenText = text;
  const g = screenCv.getContext('2d');
  g.fillStyle = '#05070a'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#ffb000'; g.font = '700 34px "Chakra Petch", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 34, 496);
  screenTex.needsUpdate = true;
}

// Moving along the walking path. W walks (Shift to hurry); the escalator carries you; gates need a tap.
function updateWalk(d) {
  const pts = WALK.pts, prompt = $('#prompt'), L = LIVERY[cityKey] || LIVERY.van;
  const gate = STATION_GATES.get(stationKey(WALK.st));
  if (gate) {
    gate.open += clamp(gate.want - gate.open, -d * 2.2, d * 3.2);
    for (const p of gate.pads) p.piv.rotation.y = p.closed + p.sgn * gate.open * 1.45;
  }
  const cur = pts[WALK.i], nxt = pts[WALK.i + 1];
  if (!nxt) {
    if (WALK.stage === 'out') { finishWalkOut(); prompt.hidden = true; return; }
    // on the platform: wait for your train, then step on
    const t = WALK.train || (WALK.train = callTrain(WALK.st, WALK.dir));
    const ends = lineEnds(WALK.st), to = (WALK.dir > 0 ? ends.plus : ends.minus) || { name: 'end of the line' };
    prompt.hidden = false;
    if (t.atSt === WALK.st && t.dwell > 0) {
      t.hold = true;
      const cg = t.cars[WALK.door.car];
      if (cg.userData.open > 0.95) {
        prompt.innerHTML = `<kbd>E</kbd> Step on · to <b>${esc(to.name)}</b>`;
        if (keys.has('KeyE') || keys.has('KeyW')) {
          // through the door and into a seat
          // (the platform is on the car's -dir side)
          const side = Math.sign(-t.dir) || 1, dz = WALK.door.dz, seat = pickSeat(dz, side);
          WALK.seat = seat;
          const y = WALK.F.yP;
          const inDoor = carWorld(cg, side * 0.5, 0, dz), aisle = carWorld(cg, 0, 0, dz + (seat.z > dz ? 0.9 : -0.9)), row = carWorld(cg, 0, 0, seat.z), sit = carWorld(cg, seat.x * 0.75, 0, seat.z);
          inDoor.y = row.y = aisle.y = sit.y = y;
          cur.tag = 'auto';
          WALK.pts.push(node(inDoor, 'auto'), node(aisle, 'auto'), node(row, 'auto'), node(sit, 'sit'));
          keys.delete('KeyE');
        }
      } else prompt.innerHTML = `Doors opening…`;
    } else {
      const dist = Math.abs(stopAt(t, WALK.st) - t.s);
      prompt.innerHTML = `${esc(TRANSIT[cityKey] || 'Train')} to <b>${esc(to.name)}</b> · ${dist > 30 ? `arriving in ${Math.max(1, Math.round(dist / Math.max(4, t.v || 8)))} s` : 'now arriving'}`;
    }
    return;
  }
  // gate: stop in front until you tap your card
  if (cur.tag === 'gate' && WALK.f < 0.02 && gate && gate.want < 1) {
    prompt.hidden = false; prompt.innerHTML = `<kbd>E</kbd> Tap your ${esc(L.card)}`;
    if (keys.has('KeyE')) { keys.delete('KeyE'); gate.want = 1; sfx.beep(); popup(WALK.stage === 'out' ? 'Tapped out' : 'Tapped in', 'good'); }
    return;
  }
  const a = cur.p, b = nxt.p, segL = a.distanceTo(b) || 1e-3;
  const onEsc = cur.tag === 'esc', auto = cur.tag === 'auto';
  const walk = auto ? 1.3 : keys.has('KeyW') ? (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.6 : 1.45) : keys.has('KeyS') ? -1.0 : 0;
  let v = walk + (onEsc ? 0.75 : 0);
  if (WALK.i === 0 && WALK.f <= 0 && v < 0) v = 0;
  WALK.f += v * d / segL;
  if (WALK.f < 0) { if (WALK.i > 0) { WALK.i--; WALK.f = 1 + WALK.f; } else WALK.f = 0; }
  WALK.bob += Math.abs(walk) * d * (onEsc ? 0 : 1);
  if (WALK.f >= 1) {
    WALK.f -= 1; WALK.i++;
    const n = pts[WALK.i];
    if (n.tag === 'gated' && gate) gate.want = 0;
    if (n.tag === 'off') { disposePeople(carPeople); carPeople = null; }
    if (n.tag === 'off' && WALK.train) { WALK.train.hold = false; WALK.train.mine = false; WALK.train = null; }
    if (n.tag === 'sit') { startTrainRide(); prompt.hidden = true; return; }
    if (WALK.i >= pts.length - 1) WALK.f = 0;
  }
  // gently turn to face where the path goes while walking (you can still look around with the mouse)
  WALK.lookT -= d;
  if (walk > 0 && WALK.lookT <= 0) {
    const want = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    let dd = want - WALK.yaw; while (dd > Math.PI) dd -= TAU; while (dd < -Math.PI) dd += TAU;
    WALK.yaw += dd * Math.min(1, d * 2.5);
  }
  if (keys.has('KeyA')) WALK.yaw += d * 1.8;
  if (keys.has('KeyD')) WALK.yaw -= d * 1.8;
  prompt.hidden = false;
  prompt.innerHTML = onEsc ? 'Riding the escalator…' : walk ? esc(WALK.st.name) : `Hold <kbd>W</kbd> to walk · mouse to look`;
}
function walkPos(out) {
  const a = WALK.pts[WALK.i].p, b = (WALK.pts[WALK.i + 1] || WALK.pts[WALK.i]).p;
  return out.copy(a).lerp(b, clamp(WALK.f, 0, 1));
}

function updateTransit(d) {
  const prompt = $('#prompt');
  if (WALK.on) {
    updateWalk(d);
    if (WALK.on) { const p = walkPos(tmp); S.x = p.x; S.z = p.z; S.v = 0; }
    unseenT += d * 2;
    return;
  }
  if (S.riding && RIDE.train) {
    const t = RIDE.train;
    if (t.v > 1) t.departed = true;
    // the people left on the platform go once you're well down the line
    if (platPeople && t.departed && platPeople.children.length && platPeople.children[0].position.distanceTo(tmp.set(t.x, t.h, t.z)) > 250) { disposePeople(platPeople); platPeople = null; }
    linePoint(MAP.lines[t.line], t.s, TP);
    S.x = t.x; S.z = t.z; S.v = t.v; S.psi = Math.atan2(TP.dx * t.dir, TP.dz * t.dir);
    unseenT += d * 2;     // nobody can see you on the train
    const ends = lineEnds(t.atSt || nextStation(t) || MAP.lines[t.line].stations[0]), to = (t.dir > 0 ? ends.plus : ends.minus) || { name: 'end of the line' };
    const ns = nextStation(t);
    prompt.hidden = false;
    if (t.atSt && t.dwell > 0 && !canLeave(t)) { prompt.innerHTML = `Departing to <b>${esc(to.name)}</b>…`; drawScreen(`${t.atSt.name}`); }
    else if (t.atSt && t.dwell > 0) {
      const back = t.dir > 0 ? ends.minus : ends.plus;
      prompt.innerHTML = `<kbd>E</kbd> Get off at <b>${esc(t.atSt.name)}</b>${back ? ` &nbsp; <kbd>F</kbd> Ride back to <b>${esc(back.name)}</b>` : ''} &nbsp; <kbd>V</kbd> View`;
      drawScreen(`${t.atSt.name}`);
    } else { prompt.innerHTML = `To <b>${esc(to.name)}</b> · next stop <b>${esc(ns ? ns.name : 'end of the line')}</b> &nbsp; <kbd>V</kbd> View`; drawScreen(`Next: ${ns ? ns.name : to.name}`); }
    return;
  }
  const st = !S.crashed && S.v < 4 ? stationNear(S.x, S.z, 40) : null;
  RIDE.near = st;
  if (st) {
    const ends = lineEnds(st), opts = [];
    if (ends.plus) opts.push(`<kbd>E</kbd> to <b>${esc(ends.plus.name)}</b>`);
    if (ends.minus) opts.push(`<kbd>${ends.plus ? 'F' : 'E'}</kbd> to <b>${esc(ends.minus.name)}</b>`);
    prompt.hidden = false; prompt.innerHTML = `${esc(st.name)} station · ${opts.join(' &nbsp; ')}`;
  } else prompt.hidden = true;
}
// E / F / V while near a station, walking or riding. Returns true if the key was used.
function transitKey(code) {
  if (WALK.on) return code === 'KeyE';      // handled in updateWalk (taps, stepping on)
  const t = RIDE.train;
  if (S.riding && t) {
    if (code === 'KeyV') { RIDE.view = RIDE.view === 'seat' ? 'front' : RIDE.view === 'front' ? 'outside' : 'seat'; popup(RIDE.view === 'seat' ? 'Your seat' : RIDE.view === 'front' ? 'Front window' : 'Outside'); camSnap = true; return true; }
    if (code === 'KeyF') { reverseTrain(); return true; }
    if (code === 'KeyE') { if (canLeave(t)) leaveTrain(); else popup(t.atSt ? 'Departing…' : 'Wait for the next stop'); return true; }
    return false;
  }
  if ((code === 'KeyE' || code === 'KeyF') && RIDE.near && !S.crashed) {
    const ends = lineEnds(RIDE.near);
    enterStation(RIDE.near, code === 'KeyE' ? (ends.plus ? 1 : -1) : -1);
    return true;
  }
  return false;
}
function transitLook(dx, dy) {
  const k = 0.0024 * sens;
  if (WALK.on) { WALK.yaw -= dx * k; WALK.pitch = clamp(WALK.pitch - dy * k, -1.2, 1.2); WALK.lookT = 1.2; }
  else if (RIDE.on) { RIDE.yaw -= dx * k; RIDE.pitch = clamp(RIDE.pitch - dy * k, -1.1, 1.1); }
}
const camE = new THREE.Euler(0, 0, 0, 'YXZ'), camQ = new THREE.Quaternion();
function transitCamera(dt) {
  if (WALK.on) {
    const p = walkPos(tmp), bob = Math.sin(WALK.bob * 6.5) * 0.035;
    camera.position.set(p.x, p.y + 1.64 + bob, p.z);
    camE.set(WALK.pitch, WALK.yaw, 0); camera.quaternion.setFromEuler(camE); camera.up.set(0, 1, 0);
    camera.fov += (72 - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); camSnap = false;
    return;
  }
  const t = RIDE.train, ln = MAP.lines[t.line];
  if (RIDE.view === 'seat') {
    const cg = t.cars[RIDE.car], s = RIDE.seat;
    cg.updateMatrixWorld(true);
    camera.position.copy(cg.localToWorld(tmp.set(s.x * 0.8, FLOOR_Y + 1.22, s.z + s.f * 0.08)));
    cg.getWorldQuaternion(camQ);
    camE.set(RIDE.pitch, Math.PI + RIDE.yaw, 0); camera.quaternion.copy(camQ).multiply(tmpQ.setFromEuler(camE)); camera.up.set(0, 1, 0);
    camera.fov += (74 - camera.fov) * Math.min(1, dt * 3);
  } else if (RIDE.view === 'front') {
    // driverless trains: sit right up at the front window
    const f = linePoint(ln, t.s + t.dir * (CAR_LEN / 2 - 0.6), {}), a = linePoint(ln, t.s + t.dir * (CAR_LEN / 2 + 45), {});
    camera.position.set(f.px, f.h + 2.35, f.pz); camera.up.set(0, 1, 0); camera.lookAt(a.px, a.h + 2.0, a.pz);
    camera.fov += (80 - camera.fov) * Math.min(1, dt * 3);
  } else {
    // behind the last car
    const back = t.cars.length * CAR_PITCH - CAR_LEN / 2 + 18;
    const b = linePoint(ln, t.s - t.dir * back, {});
    const under = b.h < -2;
    tmp.set(b.px, b.h + (under ? 3.4 : 5.2), b.pz);
    camPos.lerp(tmp, camSnap ? 1 : 1 - Math.exp(-dt * 3));
    lookAt.lerp(tmp2.set(t.x, t.h + 2, t.z), camSnap ? 1 : 1 - Math.exp(-dt * 5));
    camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(lookAt);
    camera.fov += (64 - camera.fov) * Math.min(1, dt * 3);
  }
  camera.updateProjectionMatrix(); camSnap = false;
}
