'use strict';
// Wheelie City — helicopters and planes you can steal.
// Where they are: small planes and helicopters parked at the real airports inside each map (YVR, Santa Monica,
// Harry Reid, MIA), helicopters at New York's real heliports, and a helicopter on the helipad of some high-rises
// (take the elevator to the Roof). On foot, F next to one gets in; F again on the ground (landed, stopped) gets out.
//   Helicopter: W/S tilt forward/back, A/D (or the mouse) turn, Space up, Shift down.
//   Plane: W/S throttle up/down, A/D (or the mouse) bank to turn, Space/Shift (or the mouse up/down) pitch.
//   Take off at ~130 km/h with the nose up; land gently, wings level. Hit a building or the ground hard and it's over.

const AIR = { mx: 0, my: 0, snd: { f: 0, thr: 0 } };
const AIRCRAFT = [];
const PADS = [];                     // real helipads (with or without a helicopter): { x, y, z, bi (building, roof pads) }                 // parked or flying: { kind, x, y, z, yaw, g, body, rotor, tail, prop, site, hp }
const AIR_SITES = {
  van: [{ name: 'YVR', lat: 49.1950, lon: -123.1790, planes: 4, helis: 2 }],
  la: [{ name: 'Santa Monica Airport', lat: 34.0158, lon: -118.4513, planes: 4, helis: 1 }],
  vegas: [{ name: 'Harry Reid Airport', lat: 36.0840, lon: -115.1537, planes: 4, helis: 2 }],
  miami: [{ name: 'Miami International', lat: 25.7959, lon: -80.2870, planes: 4, helis: 1 }],
  nyc: [{ name: 'Downtown Manhattan Heliport', lat: 40.7012, lon: -74.0091, planes: 0, helis: 3 }, { name: 'West 30th Street Heliport', lat: 40.7545, lon: -74.0076, planes: 0, helis: 2 }],
};
// lat/lon to the map's metres (x west, z north: the same projection the map builder uses)
function geoToMap(lat, lon) {
  const [lat0, lon0] = MAP.meta.center;
  return [-(lon - lon0) * 111320 * Math.cos(lat0 * Math.PI / 180), (lat - lat0) * 110540];
}

// ---------------------------------------------------------------- models
const AIR_MAT = {};
function airMat(c, rough = 0.4, metal = 0.3) { return AIR_MAT[c + rough + metal] || (AIR_MAT[c + rough + metal] = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal })); }
const AIR_GLASS = new THREE.MeshStandardMaterial({ color: '#0c1218', roughness: 0.05, metalness: 0.9, envMapIntensity: 1.6 });
const AIR_PAINTS = ['#e9ecef', '#c8202a', '#1f3f7a', '#f2c230', '#1a1a1e', '#2a6a4a'];
function airMesh(geo, mat, x, y, z, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
// a light helicopter: a rounded cabin with a glass nose, the tail boom and fin, skids, main and tail rotors
function heliModel(col) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); body.position.y = 1.5;
  const paint = airMat(col, 0.35, 0.4), dark = airMat('#1a1c20', 0.6, 0.4), metal = airMat('#9aa0a6', 0.35, 0.8);
  const cab = airMesh(new THREE.SphereGeometry(1.25, 20, 14), paint, 0, 0, 0.2, body); cab.scale.set(1, 0.95, 1.55);
  const nose = airMesh(new THREE.SphereGeometry(1.15, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), AIR_GLASS, 0, 0.05, 0.85, body); nose.rotation.x = Math.PI * 0.42; nose.scale.set(1, 1, 1.1);
  airMesh(new THREE.BoxGeometry(1.0, 0.55, 1.3), paint, 0, 0.95, -0.2, body);                                     // engine housing
  const boom = airMesh(new THREE.CylinderGeometry(0.16, 0.32, 4.6, 10), paint, 0, 0.35, -3.6, body); boom.rotation.x = Math.PI / 2;
  airMesh(new THREE.BoxGeometry(0.1, 1.2, 0.8), paint, 0, 0.95, -5.7, body);                                       // fin
  airMesh(new THREE.BoxGeometry(1.5, 0.06, 0.45), paint, 0, 0.4, -5.2, body);                                      // tailplane
  for (const x of [0.75, -0.75]) {
    airMesh(new THREE.BoxGeometry(0.09, 0.09, 3.0), metal, x, -1.45, 0.1, body);
    for (const z of [0.8, -0.6]) { const s = airMesh(new THREE.BoxGeometry(0.07, 0.6, 0.07), metal, x * 0.85, -1.15, z, body); s.rotation.z = x > 0 ? -0.25 : 0.25; }
  }
  const rotor = new THREE.Group(); rotor.position.set(0, 1.35, 0); body.add(rotor);
  airMesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 10), dark, 0, 0, 0, rotor);
  for (let k = 0; k < 2; k++) { const b = airMesh(new THREE.BoxGeometry(0.26, 0.04, 9.6), dark, 0, 0.12, 0, rotor); b.rotation.y = k * Math.PI / 2; }
  const tail = new THREE.Group(); tail.position.set(0.12, 0.95, -5.75); body.add(tail);
  for (let k = 0; k < 2; k++) { const b = airMesh(new THREE.BoxGeometry(0.03, 1.3, 0.12), dark, 0, 0, 0, tail); b.rotation.x = k * Math.PI / 2; }
  for (const x of [0.5, -0.5]) airMesh(new THREE.BoxGeometry(0.02, 0.5, 0.9), AIR_GLASS, x * 2.42, 0.15, 0.25, body);   // door windows
  return { g, body, rotor, tail };
}
// a light high-wing plane: fuselage tapering to the tail, cabin glass, wing on struts, tailplane and fin, propeller,
// fixed tricycle undercarriage
function planeModel(col) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); body.position.y = 1.3;
  const paint = airMat(col, 0.3, 0.35), white = airMat('#eef0f2', 0.3, 0.3), dark = airMat('#1a1c20', 0.6, 0.4), metal = airMat('#9aa0a6', 0.35, 0.8);
  const fus = airMesh(new THREE.CylinderGeometry(0.72, 0.62, 3.4, 16), white, 0, 0, 0.6, body); fus.rotation.x = Math.PI / 2;
  const aft = airMesh(new THREE.CylinderGeometry(0.62, 0.16, 4.0, 16), white, 0, 0.15, -2.95, body); aft.rotation.x = Math.PI / 2;
  const nose = airMesh(new THREE.SphereGeometry(0.72, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), paint, 0, 0, 2.3, body); nose.rotation.x = Math.PI / 2; nose.scale.set(1, 1, 0.8);
  const glass = airMesh(new THREE.SphereGeometry(0.7, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), AIR_GLASS, 0, 0.32, 0.9, body); glass.scale.set(1, 0.7, 1.6);
  for (const x of [1, -1]) airMesh(new THREE.BoxGeometry(0.02, 0.4, 1.4), AIR_GLASS, x * 0.71, 0.25, 0.6, body);
  airMesh(new THREE.BoxGeometry(11, 0.14, 1.55), white, 0, 0.82, 0.5, body);                                     // wing
  for (const x of [5.5, -5.5]) airMesh(new THREE.BoxGeometry(0.06, 0.15, 1.56), paint, x, 0.82, 0.5, body);     // painted tips
  for (const x of [1, -1]) { const s = airMesh(new THREE.BoxGeometry(0.06, 1.3, 0.12), metal, x * 1.6, 0.15, 0.5, body); s.rotation.z = x * -0.95; }
  airMesh(new THREE.BoxGeometry(3.6, 0.08, 0.9), white, 0, 0.25, -4.6, body);                                    // tailplane
  const fin = airMesh(new THREE.BoxGeometry(0.08, 1.3, 1.0), paint, 0, 0.85, -4.7, body); fin.rotation.x = -0.25;
  airMesh(new THREE.BoxGeometry(0.06, 0.06, 6.5), paint, 0.66, 0.05, -0.6, body); airMesh(new THREE.BoxGeometry(0.06, 0.06, 6.5), paint, -0.66, 0.05, -0.6, body);   // cheat lines
  const prop = new THREE.Group(); prop.position.set(0, 0, 2.95); body.add(prop);
  airMesh(new THREE.ConeGeometry(0.18, 0.35, 12), dark, 0, 0, 0, prop).rotation.x = Math.PI / 2;
  for (let k = 0; k < 2; k++) { const b = airMesh(new THREE.BoxGeometry(0.12, 1.9, 0.04), dark, 0, 0, -0.05, prop); b.rotation.z = k * Math.PI / 2 + 0.3; }
  // wheels: two mains under the wing struts, one at the nose
  const wheel = new THREE.CylinderGeometry(0.28, 0.28, 0.16, 14); wheel.rotateZ(Math.PI / 2);
  for (const [x, z] of [[1.25, 0.2], [-1.25, 0.2], [0, 2.0]]) { airMesh(wheel, dark, x, -1.02, z, body); airMesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), metal, x * 0.8, -0.72, z, body); }
  return { g, body, prop };
}
function airModel(rec) {
  const col = AIR_PAINTS[Math.floor(Math.abs(Math.sin(rec.x * 12.9 + rec.z * 78.2)) * 1e4) % AIR_PAINTS.length];
  const m = rec.kind === 'heli' ? heliModel(col) : planeModel(col);
  Object.assign(rec, m); scene.add(m.g);
  m.g.position.set(rec.x, rec.y, rec.z); m.g.rotation.y = rec.yaw;
}
function dropModel(rec) { if (!rec.g) return; scene.remove(rec.g); rec.g = rec.body = rec.rotor = rec.tail = rec.prop = null; }

// ---------------------------------------------------------------- where they're parked
let airSitesFor = null, AIRDATA = null;
// The real places, from OpenStreetMap (tools/extract_air.py -> maps/air_<city>.json): planes on the aprons of real
// airfields and one ready at the end of each runway; a helicopter on some of the real helipads and heliports, on the
// roof where the helipad is on a building. Only where there really is one.
function setupAirSites() {
  for (const r of AIRCRAFT) { dropModel(r); if (r.pad) scene.remove(r.pad); }
  for (const p of PADS) if (p.pad) scene.remove(p.pad);
  AIRCRAFT.length = 0; PADS.length = 0; airSitesFor = MAP.key; AIRDATA = null;
  const key = MAP.key;
  fetch(`wheelie-city/maps/air_${key}.json?v=1124b`).then((r) => r.ok ? r.json() : null).catch(() => null).then((data) => {
    if (!data || !MAP || MAP.key !== key) { if (!data && MAP && MAP.key === key) setupAirSitesGuess(); return; }
    AIRDATA = data; placeRealAircraft(data);
  });
}
const airHash = (x, z, s) => { const v = Math.sin(x * 12.9898 + z * 78.233 + s * 37.719) * 43758.5453; return v - Math.floor(v); };
function placeRealAircraft(data) {
  const clear = (x, z, r) => buildingAt(x, z, r) < 0 && landAt(x, z) !== 1 && !hitAt(x, z, r);
  // a plane ready at one end of every proper runway (long enough for a light plane), facing down it
  for (const rw of data.runways) {
    const [ax, az] = rw.a, [bx, bz] = rw.b, L = Math.hypot(bx - ax, bz - az);
    if (L < 500) continue;
    const dx = (bx - ax) / L, dz = (bz - az) / L, x = ax + dx * 70, z = az + dz * 70;
    if (clear(x, z, 6)) AIRCRAFT.push({ kind: 'plane', x, y: 0, z, yaw: Math.atan2(dx, dz), site: 'runway ' + (rw.ref || ''), hp: 100 });
  }
  // parked on the aprons near runways (not every apron: cargo and maintenance aprons stay empty)
  const runwayNear = (x, z) => data.runways.some((rw) => { const [ax, az] = rw.a, [bx, bz] = rw.b, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1); return Math.hypot(x - ax - dx * t, z - az - dz * t) < 1500; });
  let parked = 0;
  for (const ap of data.aprons) {
    const [cx, cz] = ap.c;
    if (!runwayNear(cx, cz) || parked >= 10) continue;
    // points inside the apron, 28 m apart
    const xs = ap.pts.map((p) => p[0]), zs = ap.pts.map((p) => p[1]);
    const inside = (x, z) => { let c = false; for (let i = 0, j = ap.pts.length - 1; i < ap.pts.length; j = i++) { const [xi, zi] = ap.pts[i], [xj, zj] = ap.pts[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    let here = 0;
    for (let x = Math.min(...xs) + 14; x < Math.max(...xs) - 14 && here < 3; x += 28)
      for (let z = Math.min(...zs) + 14; z < Math.max(...zs) - 14 && here < 3; z += 28) {
        if (!inside(x, z) || !clear(x, z, 7) || airHash(x, z, 1) > 0.5) continue;
        if (AIRCRAFT.some((r) => Math.hypot(r.x - x, r.z - z) < 24)) continue;
        AIRCRAFT.push({ kind: 'plane', x, y: 0, z, yaw: airHash(x, z, 2) * Math.PI * 2, site: 'apron', hp: 100 }); here++; parked++;
      }
  }
  // helicopters: on about half the real helipads (on the roof if the pad's on a building)
  for (const hp of data.helipads) {
    const bi = buildingAt(hp.x, hp.z, 0);
    const onRoof = bi >= 0;
    if (!onRoof && !clear(hp.x, hp.z, 5)) continue;
    const y = onRoof ? MAP.bH[bi] : 0, occupied = airHash(hp.x, hp.z, 3) < (hp.kind === 'heliport' ? 0.85 : 0.5);
    PADS.push({ x: hp.x, y, z: hp.z, bi: onRoof ? bi : -1, name: hp.name });
    if (occupied) AIRCRAFT.push({ kind: 'heli', x: hp.x, y, z: hp.z, yaw: airHash(hp.x, hp.z, 4) * Math.PI * 2, site: hp.name || 'helipad', roof: onRoof ? bi : undefined, hp: 100 });
  }
}
// no data file: the old guess (by airport coordinates)
function setupAirSitesGuess() {
  const clear = (x, z, r) => buildingAt(x, z, r) < 0 && landAt(x, z) !== 1 && !hitAt(x, z, r);
  for (const site of AIR_SITES[MAP.key] || []) {
    const [cx, cz] = geoToMap(site.lat, site.lon);
    if (site.planes) {
      // the runway: the longest clear straight strip across the airfield (no buildings, no water, ~25 m wide), looked
      // for from a grid of points round the site so the terminal buildings don't get in the way
      let best = null;
      for (let gx = -700; gx <= 700; gx += 140) for (let gz = -700; gz <= 700; gz += 140) {
        const ox = cx + gx, oz = cz + gz;
        if (!clear(ox, oz, 12)) continue;
        for (let deg = 0; deg < 180; deg += 6) {
          const a = deg * Math.PI / 180, dx = Math.sin(a), dz = Math.cos(a);
          const reach = (sgn) => { let s = 0; while (s < 1600 && clear(ox + dx * s * sgn, oz + dz * s * sgn, 12)) s += 20; return s; };
          const f = reach(1), b = reach(-1);
          if (!best || f + b > best.len) best = { a, dx, dz, f, b, len: f + b, ox, oz };
        }
      }
      if (best && best.len > 400) {
        // the planes line up across the start of it, all facing down the runway
        const sx = best.ox - best.dx * (best.b - 40), sz = best.oz - best.dz * (best.b - 40), lx = best.dz, lz = -best.dx;
        let n = 0;
        for (const off of [0, 22, -22, 44, -44, 66, -66]) {
          if (n >= site.planes) break;
          const x = sx + lx * off, z = sz + lz * off;
          if (clear(x, z, 7)) { AIRCRAFT.push({ kind: 'plane', x, y: 0, z, yaw: best.a, site: site.name, hp: 100 }); n++; }
        }
        site.runway = best;
      }
    }
    // helicopters: clear spots near the site (a helipad apron), off the runway
    const spots = [];
    for (let ring = 2; ring < 50 && spots.length < site.helis; ring++)
      for (let k = 0; k < 12 && spots.length < site.helis; k++) {
        const a = k / 12 * Math.PI * 2 + ring * 0.37, x = cx + Math.sin(a) * ring * 9, z = cz + Math.cos(a) * ring * 9;
        if (!clear(x, z, 8) || roadQuery(x, z, 12).in) continue;
        if (AIRCRAFT.some((r) => Math.hypot(r.x - x, r.z - z) < 25) || spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 16)) continue;
        spots.push([x, z]);
      }
    for (const [x, z] of spots) AIRCRAFT.push({ kind: 'heli', x, y: 0, z, yaw: 0.6, site: site.name, hp: 100 });
  }
}
// the real helipad on a building's roof (from the map data), or null
function roofPadOf(bi) { return PADS.find((p) => p.bi === bi) || null; }
// the pad: a painted circle with an H (made for every helipad near you, with or without a helicopter on it)
function padDecal(rec) {
  if (rec.pad) return;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#3a3c40'; c.beginPath(); c.arc(128, 128, 126, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#f2c230'; c.lineWidth = 10; c.beginPath(); c.arc(128, 128, 110, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#ffffff'; c.font = '900 150px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 128, 136);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(7, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), roughness: 0.9, transparent: true }));
  pad.position.set(rec.x, rec.y + 0.04, rec.z); scene.add(pad); rec.pad = pad;
}
// (old: a made-up rooftop pad at the centre of a tower; kept for maps without the data file)
function roofHeli(bi) {
  const ex = AIRCRAFT.find((r) => r.roof === bi); if (ex) return ex;
  const m = MAP, o0 = m.bOff[bi], o1 = m.bOff[bi + 1];
  let x = 0, z = 0; for (let i = o0; i < o1; i++) { x += m.bx[i]; z += m.bz[i]; } x /= o1 - o0; z /= o1 - o0;
  const rec = { kind: 'heli', x, y: m.bH[bi], z, yaw: 0, site: 'roof', roof: bi, hp: 100 };
  // the pad: a painted circle with an H
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#3a3c40'; c.beginPath(); c.arc(128, 128, 126, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#f2c230'; c.lineWidth = 10; c.beginPath(); c.arc(128, 128, 110, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#ffffff'; c.font = '900 150px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 128, 136);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(7, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), roughness: 0.9, transparent: true }));
  pad.position.set(x, rec.y + 0.03, z); scene.add(pad); rec.pad = pad;
  AIRCRAFT.push(rec);
  return rec;
}
// models only near you (they're a few hundred triangles each, but there's no need for them across town)
function updateParkedAir() {
  if (!MAP) return;
  if (airSitesFor !== MAP.key) setupAirSites();
  for (const p of PADS) { const d = Math.hypot(p.x - S.x, p.z - S.z); if (!p.pad && d < 900) padDecal(p); else if (p.pad && d > 1100) { scene.remove(p.pad); p.pad.geometry.dispose(); p.pad = null; } }
  for (const r of AIRCRAFT) {
    const d = Math.hypot(r.x - S.x, r.z - S.z);
    if (!r.g && d < 900) airModel(r); else if (r.g && d > 1100 && r !== FOOT.air) dropModel(r);
    // a parked helicopter's rotor winds down; a plane's prop too
    if (r.g && r !== FOOT.air) { r.spin = Math.max(0, (r.spin || 0) - 0.004); if (r.rotor) r.rotor.rotation.y += r.spin * 0.6; if (r.prop) r.prop.rotation.z += r.spin * 0.8; }
  }
}
function aircraftNear() {
  let best = null, bd = 1e9;
  for (const r of AIRCRAFT) {
    if (r === FOOT.air || Math.abs(r.y - FOOT.y) > 2.5) continue;
    const d = Math.hypot(r.x - FOOT.x, r.z - FOOT.z) - (r.kind === 'plane' ? 3.2 : 2.6);
    if (d < 1.4 && d < bd) { bd = d; best = r; }
  }
  return best;
}

// ---------------------------------------------------------------- getting in and out
function boardAir(rec) {
  const F = FOOT;
  if (!rec.g) airModel(rec);
  F.air = rec; F.roof = null; F.aiming = false; F.fig.g.visible = false;
  Object.assign(rec, { vx: 0, vy: 0, vz: 0, v: 0, pitch: 0, roll: 0, thr: 0, ground: true, spin: rec.spin || 0 });
  sfx.carStart ? sfx.carStart() : sfx.thump(0.3);
  speedo.hidden = false; camSnap = true;
  popup(rec.kind === 'heli' ? 'Helicopter · W/S tilt, A/D turn, Space up, Shift down · F to get out once landed' : 'Plane · W throttle up, A/D bank, Space/Shift (or the mouse) pitch · take off at 130 km/h', 'good');
  // somebody notices it's gone (the owner at an airfield; the building's security on a roof)
  reportCrime(rec.x, rec.z, rec.kind === 'plane' ? 2.2 : 1.8, false, { caller: 'anyone', t: rec.site === 'roof' ? 25 : 15, outside: true });
}
function leaveAir() {
  const F = FOOT, a = F.air; if (!a) return;
  const sp = Math.hypot(a.vx || 0, a.vz || 0);
  if (!a.ground || sp > 2) { popup('Land and stop first'); return; }
  const lx = Math.cos(a.yaw), lz = -Math.sin(a.yaw), off = a.kind === 'plane' ? 1.8 : 2.2;
  F.x = a.x + lx * off; F.z = a.z + lz * off; F.y = a.y; F.yaw = a.yaw; F.camYaw = a.yaw;
  // landed on a roof: you're up there on foot
  const bi = a.y > 1 ? buildingAt(a.x, a.z, 0) : -1;
  F.roof = bi >= 0 ? { bi, h: MAP.bH[bi] } : null;
  if (F.roof && !insideBuilding(bi, F.x, F.z, 0)) { F.x = a.x; F.z = a.z + 0.5; }
  a.thr = 0; F.air = null; F.fig.g.visible = true; personPlay(F.fig, 'Idle_Loop', 0.2);
  speedo.hidden = true; camSnap = true;
}
function airCrash(why) {
  const F = FOOT, a = F.air;
  flash(1); S.shake = 0.6; sfx.crash && sfx.crash('car', 1.3); sfx.metal && sfx.metal(1);
  for (let i = 0; i < 14; i++) spawnSmoke(a.x + (Math.random() - 0.5) * 4, a.y + 1 + Math.random() * 2, a.z + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.15);
  spawnSparks(a.x, a.y + 1, a.z, a.vx || 0, a.vz || 0, 40);
  const bi = buildingAt(a.x, a.z, 0);
  const floor = bi >= 0 && a.y >= MAP.bH[bi] - 0.5 ? MAP.bH[bi] : 0;
  if (a.pad) scene.remove(a.pad);
  dropModel(a); AIRCRAFT.splice(AIRCRAFT.indexOf(a), 1);
  F.air = null; F.fig.g.visible = true; speedo.hidden = true;
  F.x = a.x; F.z = a.z; F.y = floor; F.roof = floor > 0 ? { bi, h: floor } : null;
  if (!F.roof) { let k = 0; while (buildingAt(F.x, F.z, 0.4) >= 0 && k++ < 40) { F.x += Math.sin(a.yaw + Math.PI) * 1; F.z += Math.cos(a.yaw + Math.PI) * 1; } }
  footHurt(160, why);
}

// ---------------------------------------------------------------- flying
function airStep(d) {
  const F = FOOT, a = F.air, heli = a.kind === 'heli';
  F.fire = false;
  const W = keys.has('KeyW'), Sk = keys.has('KeyS'), A = keys.has('KeyA'), Dk = keys.has('KeyD'), up = keys.has('Space'), down = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const mx = AIR.mx, my = AIR.my; AIR.mx = 0; AIR.my = 0;
  a.spin = Math.min(1, a.spin + d / (heli ? 3.5 : 1.2));
  const prevY = a.y;
  if (heli) {
    // tilt to move, turn on the spot, collective up and down; it only lifts once the rotor's up to speed
    const lift = a.spin > 0.9;
    a.pitch += (((W ? -0.32 : 0) + (Sk ? 0.25 : 0)) - a.pitch) * Math.min(1, d * 3);
    a.yaw += ((A ? 1 : 0) - (Dk ? 1 : 0)) * 1.25 * d - mx * 0.0035;
    a.roll += ((((Dk ? 1 : 0) - (A ? 1 : 0)) * 0.22 + clamp(mx * 0.01, -0.2, 0.2)) - a.roll) * Math.min(1, d * 3);
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    if (lift && !a.ground) { a.vx += fx * -a.pitch * 17 * d; a.vz += fz * -a.pitch * 17 * d; }
    const drag = Math.exp(-(a.ground ? 5 : 0.42) * d); a.vx *= drag; a.vz *= drag;
    const tv = !lift ? -4 : up ? 7.5 : down ? -5.5 : 0;
    a.vy += (tv - a.vy) * Math.min(1, d * 2.2);
    if (a.ground && a.vy < 0) a.vy = 0;
    AIR.snd.f = 16 + a.spin * 7; AIR.snd.thr = a.spin * (up ? 0.85 : W || Sk ? 0.6 : 0.4);
  } else {
    // throttle and airspeed; bank to turn; below ~110 km/h it stalls and sinks
    a.thr = clamp(a.thr + ((W ? 1 : 0) - (Sk ? 1 : 0)) * d * 0.55, 0, 1);
    const pitchIn = (up ? 1 : 0) - (down ? 1 : 0) + clamp(my * 0.012, -1, 1), rollIn = (Dk ? 1 : 0) - (A ? 1 : 0) + clamp(mx * 0.012, -1, 1);
    a.v += (a.thr * a.spin * 13 - 0.0026 * a.v * a.v - 9.8 * Math.sin(a.pitch) - (a.ground && Sk && a.thr === 0 ? 7 : 0) - (a.ground ? 0.6 : 0)) * d;
    a.v = Math.max(0, a.v);
    if (a.ground) {
      a.roll *= Math.exp(-6 * d);
      a.yaw += ((A ? 1 : 0) - (Dk ? 1 : 0)) * 0.7 * d * Math.min(1, a.v / 6);
      a.pitch = a.v > 34 && pitchIn > 0 ? Math.min(0.22, a.pitch + pitchIn * 0.5 * d) : Math.max(0, a.pitch - d * 0.4);
      if (a.pitch > 0.08 && a.v > 36) a.ground = false;                   // rotate and lift off
    } else {
      a.roll = clamp(a.roll + rollIn * 1.4 * d, -1.1, 1.1); if (!rollIn) a.roll *= Math.exp(-1.2 * d);
      a.pitch = clamp(a.pitch + pitchIn * 0.85 * d, -0.6, 0.6);
      a.yaw -= Math.tan(a.roll) * 9.8 / Math.max(25, a.v) * d;
      if (a.v < 31) a.pitch -= (31 - a.v) * 0.025 * d;                     // stalling: the nose drops
    }
    const cp = Math.cos(a.pitch), sink = a.ground ? 0 : Math.max(0, 31 - a.v) * 0.35;
    a.vx = Math.sin(a.yaw) * cp * a.v; a.vz = Math.cos(a.yaw) * cp * a.v; a.vy = Math.sin(a.pitch) * a.v - sink;
    if (a.ground && a.vy < 0) a.vy = 0;
    AIR.snd.f = 22 + a.thr * 55 * a.spin; AIR.snd.thr = a.thr * a.spin;
  }
  a.x += a.vx * d; a.y += a.vy * d; a.z += a.vz * d;

  // the ground, roofs, and walls (the rotor and wings need a little room)
  let floor = 0;
  const bi = buildingAt(a.x, a.z, heli ? 2.2 : 3);
  if (bi >= 0) {
    const H = MAP.bH[bi];
    if (prevY >= H - 0.4) floor = H;
    else if (a.y < H) {
      const sp = Math.hypot(a.vx, a.vy, a.vz);
      if (sp > (heli ? 9 : a.ground ? 14 : 6)) { airCrash(heli ? 'Flew the helicopter into a building' : 'Flew into a building'); return; }
      a.x -= a.vx * d; a.z -= a.vz * d; a.vx = 0; a.vz = 0; if (!heli) a.v = 0;
    }
  }
  if (a.y <= floor) {
    const impact = -(a.vy || 0);
    a.y = floor;
    if (impact > (heli ? 7 : 6) || (!heli && Math.abs(a.roll) > 0.5) || (!heli && a.pitch < -0.15)) { airCrash(heli ? 'Crashed the helicopter' : 'Crashed the plane'); return; }
    if (landAt(a.x, a.z) === 1 && floor === 0) { airCrash('Ditched in the water'); return; }
    a.vy = 0;
    if (!a.ground && !heli) { a.pitch = 0; popup('Touchdown', 'good'); }
    a.ground = true;
  } else if (a.y > floor + 0.4) a.ground = false;

  // the model
  a.g.position.set(a.x, a.y, a.z); a.g.rotation.set(0, a.yaw, 0);
  a.body.rotation.set(-a.pitch, 0, a.roll);
  if (a.rotor) a.rotor.rotation.y += a.spin * d * 42;
  if (a.tail) a.tail.rotation.x += a.spin * d * 60;
  if (a.prop) a.prop.rotation.z += (0.15 + a.thr) * a.spin * d * 70;
  // you, along for the ride (the city streams in round you)
  F.x = a.x; F.z = a.z; F.y = a.y; F.yaw = a.yaw;
  const speed = Math.hypot(a.vx, a.vy, a.vz);
  setSpeedo(speed * 3.6, heli ? 300 : 400, heli ? a.spin : a.thr, false, `${Math.round(a.y)} m`, a.hp);
}
function airCamera(dt) {
  const a = FOOT.air, heli = a.kind === 'heli', back = heli ? 15 : 20, high = heli ? 4.5 : 4.2;
  const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
  const want = tmp2.set(a.x - fx * back, Math.max(a.y + high, 1.5), a.z - fz * back);
  // (a stiffer follow at speed, or the camera falls behind a plane doing 200 km/h)
  if (camSnap) camPos.copy(want); else camPos.lerp(want, 1 - Math.exp(-dt * (4 + Math.hypot(a.vx || 0, a.vz || 0) * 0.25)));
  camera.position.copy(camPos); camera.up.set(0, 1, 0);
  const look = tmp.set(a.x + fx * 12, a.y + 1.2 + (heli ? 0 : Math.sin(a.pitch) * 8), a.z + fz * 12);
  if (camSnap) lookAt.copy(look); else lookAt.lerp(look, 1 - Math.exp(-dt * 8));
  camera.lookAt(lookAt);
  camera.fov += (72 - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
  camSnap = false;
}
