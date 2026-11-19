// Wheelie City — bike and rider models. One builder, styled per bike (e-moto, two-stroke, four-stroke, mini, supermoto).
'use strict';
let rig = null;

function tube(parent, pts, r, mat, seg = 40) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 10), mat);
  m.castShadow = true; parent.add(m); return m;
}

function buildBike() {
  if (rig) {
    if (rig.ragdoll) { scene.remove(rig.ragdoll); }
    scene.remove(rig.root);
    rig.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    rig.rider.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  const B = BIKES[bikeKey], R = B.R, Rf = B.Rf || R, L = B.L, ys = B.seat - R;   // ys: seat top above rear axle
  const yF = Rf - R;                                                             // front axle height relative to rear axle
  const gas = B.type === 'gas', st = B.style;
  const root = new THREE.Group();                // at the rear axle; pitches for the wheelie
  const body = new THREE.Group(); root.add(body);
  const bodyCol = riderLook.bike === 'stock' ? B.color : riderLook.bike, paint = M(bodyCol, 0.35, 0.25), accent = M(B.accent, 0.4, 0.1), frame = M(B.frame, 0.35, 0.7);
  const black = M('#141518', 0.6, 0.2), rubber = M('#121212', 0.95, 0), alloy = M('#b3bac0', 0.3, 0.85), gold = M('#d6a64f', 0.25, 0.85);
  const chrome = M('#d8dde2', 0.18, 1.0), engineM = M('#3c3f44', 0.45, 0.7), fin = M('#7d8186', 0.4, 0.8), pipeM = M(st === 'mx2' ? '#3b3632' : '#c9ccd0', 0.35, 0.9);
  const lamp = new THREE.MeshBasicMaterial({ color: '#fff6dc' }), tailLamp = new THREE.MeshBasicMaterial({ color: '#ff2a2a' });

  // Wheels: knobby spoked, or street cast wheels
  const wheels = [];
  for (const [z, r, y] of [[0, R, 0], [L, Rf, yF]]) {
    const w = new THREE.Group(); w.position.set(0, y, z);
    const fat = st === 'grom' ? 0.085 : B.knobby ? 0.065 : 0.075;
    const tire = new THREE.Mesh(new THREE.TorusGeometry(r - fat, fat, 10, 40), rubber); tire.rotation.y = Math.PI / 2; tire.castShadow = true; w.add(tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r - fat * 1.9, 0.014, 6, 40), B.knobby ? alloy : black); rim.rotation.y = Math.PI / 2; w.add(rim);
    if (B.knobby) {
      const kn = new THREE.InstancedMesh(new THREE.BoxGeometry(0.034, 0.026, 0.034), rubber, 72);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
      let n = 0;
      for (let i = 0; i < 36; i++) for (const s of [-1, 1]) { const a = (i + (s > 0 ? 0.5 : 0)) / 36 * TAU; q.setFromAxisAngle(Xv, a); p.set(s * 0.036, Math.cos(a) * (r + 0.005), Math.sin(a) * (r + 0.005)); kn.setMatrixAt(n++, m4.compose(p, q, one)); }
      w.add(kn);
      const pts = [];
      for (let i = 0; i < 32; i++) { const a = i / 32 * TAU, s = i % 2 ? 1 : -1; pts.push(s * 0.05, 0, 0, s * 0.008, Math.cos(a + 0.2 * s) * (r - 0.13), Math.sin(a + 0.2 * s) * (r - 0.13)); }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      w.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: '#c3c9ce' })));
    } else {
      const spokeM = st === 'grom' ? M('#c8102e', 0.4, 0.3) : black;
      for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, r - fat * 2 - 0.03, 0.05), spokeM); sp.geometry.translate(0, (r - fat * 2 - 0.03) / 2, 0); sp.rotation.x = i / 5 * TAU; w.add(sp); }
      if (z) { const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.006, 28), chrome); disc.rotation.z = Math.PI / 2; disc.position.x = 0.07; w.add(disc); }
    }
    axle(w, V3(0, 0, 0), 0.05, 0.16, alloy);
    if (B.knobby) axle(w, V3(0.075, 0, 0), z ? 0.14 : 0.11, 0.005, alloy, 28);
    body.add(w); wheels.push(w);
  }

  // Fork, clamps, bars
  const AX = V3(0, 0.906, -0.423);                  // 25° rake
  const onF = (t, x = 0) => V3(x, yF + AX.y * t, L + AX.z * t);
  const forkLen = st === 'grom' ? 0.78 : 0.9 + (Rf - 0.33) * 0.6;
  for (const x of [-0.09, 0.09]) {
    seg(body, onF(0, x), onF(forkLen * 0.55, x), 0.022, 0.022, st === 'grom' ? black : gold);
    seg(body, onF(forkLen * 0.45, x), onF(forkLen, x), 0.034, 0.034, st === 'grom' ? alloy : black);
  }
  const qF = new THREE.Quaternion().setFromUnitVectors(Yv, AX);
  for (const t of [forkLen * 0.8, forkLen * 0.97]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, 0.08), alloy); c.position.copy(onF(t)); c.quaternion.copy(qF); body.add(c); }
  axle(body, V3(0, yF, L), 0.016, 0.24, alloy);
  const TOP = onF(forkLen), BAR = TOP.clone().add(V3(0, st === 'grom' ? 0.06 : 0.1, -0.06));
  seg(body, BAR.clone().setX(-0.4), BAR.clone().setX(0.4), 0.016, 0.016, black);
  for (const s of [-1, 1]) seg(body, BAR.clone().setX(s * 0.31), BAR.clone().setX(s * 0.42), 0.022, 0.022, rubber);
  cube(body, TOP.clone().add(V3(0, 0.03, 0)), 0.08, 0.06, 0.07, black);
  for (const s of [-1, 1]) { const lv = seg(body, BAR.clone().setX(s * 0.28).add(V3(0, 0, 0.02)), BAR.clone().setX(s * 0.4).add(V3(0, -0.02, 0.09)), 0.007, 0.007, alloy); lv.castShadow = false; }
  // Dash
  const dashCv = document.createElement('canvas'); dashCv.width = 256; dashCv.height = 128;
  const dashTex = new THREE.CanvasTexture(dashCv);
  const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.085), new THREE.MeshBasicMaterial({ map: dashTex }));
  dash.position.copy(BAR.clone().add(V3(0, 0.045, -0.02))); dash.rotation.set(-0.65, Math.PI, 0); body.add(dash);
  // Headlight / number plate, front fender
  if (st === 'grom') {
    const cowl = blob(body, onF(forkLen * 0.75).add(V3(0, 0, 0.08)), 0.13, paint, 1.2, 1, 0.8);
    blob(body, onF(forkLen * 0.75).add(V3(0, 0, 0.17)), 0.07, lamp, 1, 0.9, 0.4);
    const fender = cube(body, V3(0, yF + Rf + 0.04, L + 0.02), 0.2, 0.03, 0.48, paint); fender.rotation.x = -0.05;
    void cowl;
  } else {
    const plate = cube(body, onF(forkLen * 0.68).add(V3(0, 0, 0.05)), 0.26, 0.3, 0.05, gas || st === 'varg' ? accent : accent); plate.quaternion.copy(qF);
    blob(body, onF(forkLen * 0.68).add(V3(0, 0.02, 0.085)), 0.06, lamp, 1, 0.8, 0.4);
    const fy = st === 'smc' ? yF + Rf + 0.05 : yF + Rf + 0.1;
    const fender = cube(body, V3(0, fy, L + 0.06), 0.17, 0.03, 0.62, gas ? M('#f2f2f2', 0.4) : paint); fender.rotation.x = -0.14;
    if (gas && st !== 'smc') fender.material = paint;
  }

  // Frame and swingarm
  const PIV = V3(0, 0.12, 0.56);
  for (const s of [-1, 1]) {
    beam(body, V3(s * 0.075, 0, 0), PIV.clone().setX(s * 0.08), 0.03, 0.07, st === 'grom' ? alloy : frame);       // swingarm
    beam(body, onF(forkLen * 0.82, s * 0.06), V3(s * 0.08, ys - 0.12, 0.72), 0.03, 0.06, frame);                   // spars
    beam(body, V3(s * 0.08, ys - 0.12, 0.72), PIV.clone().setX(s * 0.08).add(V3(0, 0.06, 0)), 0.03, 0.05, frame);
  }
  // Shock with spring
  {
    const a = V3(0, 0.16, 0.42), b = V3(0, ys - 0.1, 0.58);
    seg(body, a, b, 0.018, 0.024, black);
    const d = new THREE.Vector3().subVectors(b, a), len = d.length(), pts = [];
    for (let i = 0; i <= 100; i++) { const t = i / 100, an = t * TAU * 8; pts.push(V3(Math.cos(an) * 0.038, len * (0.15 + t * 0.6), Math.sin(an) * 0.038)); }
    const spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.006, 5), gas ? M('#d6c23a', 0.4, 0.4) : accent);
    const sg = new THREE.Group(); sg.position.copy(a); sg.quaternion.setFromUnitVectors(Yv, d.normalize()); sg.add(spring); body.add(sg);
  }
  const midY = (ys - 0.12 + 0.05) / 2 + 0.02;
  if (!gas) {
    // E-moto: battery box, motor, belt/chain; Varg gets a fake tank and shrouds
    const bw = st === 'rtr' ? 0.21 : 0.22, bl = st === 'rtr' ? 0.42 : 0.48;
    const box = cube(body, V3(0, midY, 0.86), bw, ys - 0.14, bl, st === 'varg' ? black : paint); box.castShadow = true;
    cube(body, V3(0, midY, 0.86 + bl / 2 + 0.005), bw + 0.01, 0.08, 0.02, accent);
    if (st === 'surron' || st === 'talaria') for (const s of [-1, 1]) { const p = cube(body, V3(s * (bw / 2 + 0.01), midY + 0.05, 0.86), 0.01, (ys - 0.14) * 0.55, bl * 0.8, accent); p.material = M(B.accent, 0.5, 0.1, { transparent: true, opacity: 0.85 }); }
    axle(body, V3(0, 0.08, 0.66), st === 'varg' ? 0.12 : 0.11, 0.17, st === 'varg' ? engineM : black, 20);
    beam(body, V3(-0.09, 0.14, 0.62), V3(-0.09, 0.07, 0), 0.012, 0.02, black);
    beam(body, V3(-0.09, 0.02, 0.62), V3(-0.09, -0.06, 0), 0.012, 0.02, black);
    if (st === 'varg') {
      const tank = blob(body, V3(0, ys + 0.02, 0.86), 0.16, paint, 1.0, 0.7, 1.7); tank.castShadow = true;
      for (const s of [-1, 1]) { const sh = cube(body, V3(s * 0.15, ys - 0.06, 0.98), 0.03, 0.26, 0.34, accent); sh.rotation.y = s * 0.25; }
    }
  } else {
    // Gas: engine cases, cylinder, head, tank, shrouds, exhaust
    const two = B.stroke === 2, eh = st === 'grom' ? 0.2 : 0.26;
    cube(body, V3(0, 0.1, 0.72), st === 'grom' ? 0.26 : 0.24, eh, 0.42, engineM).castShadow = true;
    const cyl = new THREE.Group(); cyl.position.set(0, 0.22, 0.84); cyl.rotation.x = -0.32; body.add(cyl);
    const cylH = st === 'grom' ? 0.18 : two ? 0.22 : 0.26;
    for (let k = 0; k < 6; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.2 - k * 0.006, 0.012, 0.2), fin); f.position.y = 0.03 + k * (cylH / 6); cyl.add(f); }
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.14, cylH, 0.14), engineM); c.position.y = cylH / 2; cyl.add(c);
    const head = new THREE.Mesh(new THREE.BoxGeometry(two ? 0.16 : 0.2, 0.07, two ? 0.16 : 0.2), two ? fin : engineM); head.position.y = cylH + 0.035; cyl.add(head);
    if (!two) { const vc = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.16), M('#a31f1f', 0.4, 0.3)); vc.position.y = cylH + 0.09; cyl.add(vc); }
    axle(body, V3(0.13, 0.08, 0.68), 0.09, 0.02, M('#5a5d62', 0.35, 0.8), 18);    // clutch cover
    // tank and shrouds (radiators on the MX bikes)
    const tank = blob(body, V3(0, ys + (st === 'grom' ? 0.0 : -0.01), 0.9), st === 'grom' ? 0.17 : 0.15, paint, 1.15, 0.75, st === 'grom' ? 1.4 : 1.65); tank.castShadow = true;
    if (st === 'mx2' || st === 'mx4' || st === 'smc') {
      for (const s of [-1, 1]) {
        const rad = cube(body, V3(s * 0.13, ys - 0.16, 0.98), 0.05, 0.24, 0.2, M('#2a2c30', 0.6, 0.5)); rad.rotation.y = s * 0.2;
        const sh = cube(body, V3(s * 0.16, ys - 0.1, 0.98), 0.02, 0.3, 0.36, paint); sh.rotation.y = s * 0.28;
        const nb = cube(body, V3(s * 0.135, ys - 0.12, 0.42), 0.02, 0.2, 0.34, M('#f2f2f2', 0.5));   // side number boards
        nb.rotation.y = s * 0.05;
      }
    } else {
      for (const s of [-1, 1]) cube(body, V3(s * 0.15, ys - 0.12, 0.82), 0.02, 0.18, 0.5, paint);
    }
    // exhaust
    const P = (x, y, z) => V3(x, y, z);
    if (two) {
      tube(body, [P(0, 0.24, 0.98), P(0, 0.08, 1.06), P(0.05, -0.08, 0.96), P(0.14, -0.06, 0.7), P(0.19, 0.04, 0.42), P(0.2, 0.16, 0.22)], 0.062, pipeM);
      seg(body, P(0.2, 0.15, 0.24), P(0.2, ys - 0.08, -0.12), 0.045, 0.05, M('#2a2b2e', 0.5, 0.6));
    } else if (st === 'grom') {
      tube(body, [P(0, 0.2, 0.95), P(0.03, 0.02, 1.0), P(0.08, -0.08, 0.8), P(0.14, -0.06, 0.55)], 0.03, chrome);
      seg(body, P(0.15, -0.06, 0.58), P(0.17, 0.02, 0.2), 0.07, 0.065, M('#2a2b2e', 0.4, 0.7));
    } else {
      tube(body, [P(0, 0.4, 1.0), P(0.04, 0.3, 1.1), P(0.1, 0.06, 1.0), P(0.17, 0.0, 0.75), P(0.2, 0.12, 0.45), P(0.2, 0.22, 0.28)], 0.035, pipeM);
      seg(body, P(0.2, 0.2, 0.32), P(0.2, ys - 0.06, -0.12), st === 'smc' ? 0.075 : 0.065, 0.06, M('#b8bcc0', 0.3, 0.9));
    }
    seg(body, V3(0.04, 0.08, 0.62), V3(0.06, 0.0, 0), 0.008, 0.008, black);   // chain
  }
  // Seat, side panels, tail
  const seatL = st === 'grom' ? 0.62 : 0.78;
  cube(body, V3(0, ys - 0.03, 0.55), st === 'grom' ? 0.27 : 0.25, 0.08, seatL, black);
  if (!gas) for (const s of [-1, 1]) { const p = cube(body, V3(s * 0.13, ys - 0.13, 0.62), 0.02, 0.16, 0.52, paint); p.rotation.y = s * 0.06; }
  const tailP = cube(body, V3(0, ys + 0.02, 0.05), 0.2, 0.03, 0.5, gas ? M(st === 'grom' || st === 'smc' ? B.color : '#f2f2f2', 0.45) : paint); tailP.rotation.x = -0.3;
  cube(body, V3(0, ys + 0.1, -0.17), 0.12, 0.05, 0.03, tailLamp);
  for (const s of [-1, 1]) cube(body, V3(s * 0.17, 0.35 - R, 0.64), 0.1, 0.025, 0.05, alloy);     // footpegs
  body.traverse((o) => { if (o.isMesh && o.castShadow === false && o.geometry && !o.isInstancedMesh) o.castShadow = true; });

  // Rider, seated on the back of the seat for wheelies. Limbs pivot at hip and shoulder for tricks.
  // Built like a person in riding gear: shaped torso and pelvis, tapered limbs with joints, MX boots, gloves, a real MX helmet.
  const gear = gas ? bodyCol : B.accent;
  const jersey = M(riderLook.jersey, 0.85), dark = M(riderLook.pants, 0.9), pads = M('#1a1d21', 0.55);
  const bootM = M('#e8e8e4', 0.55), bootSole = M('#1a1a1c', 0.9), buckle = M('#9aa0a6', 0.3, 0.8), skinM = M(riderLook.skin, 0.7);
  const glove = M(riderLook.gloves === 'bike' ? gear : riderLook.gloves, 0.8), shell = M(riderLook.helmet !== 'bike' ? riderLook.helmet : bodyCol === '#23262b' || bodyCol === '#1b1d21' || bodyCol === '#14151a' ? '#f0e8da' : bodyCol, 0.25, 0.1), lens = M('#ff9a3c', 0.05, 0.95);
  const lathe = (parent, pts, mat, a, b, sx = 1, sz = 1, seg = 18) => {
    // a lathe profile [radius, t] stretched from point a to point b
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const geo = new THREE.LatheGeometry(pts.map(([r, t]) => new THREE.Vector2(r, t * len)), seg);
    const m = new THREE.Mesh(geo, mat); m.position.copy(a); m.quaternion.setFromUnitVectors(Yv, d.normalize()); m.scale.set(sx, 1, sz);
    // scale is applied in the mesh's local frame before the rotation, so widen x / flatten z of the cross-section
    parent.add(m); return m;
  };
  const rider = new THREE.Group(); body.add(rider);
  const HIP = V3(0, ys + 0.1, 0.36);
  const upper = new THREE.Group(); upper.position.copy(HIP); rider.add(upper);
  const U = (x, y, z) => V3(x, y, z).sub(HIP);
  const HEADP = V3(0, ys + 0.87, 0.6);
  // pelvis and seat of the pants
  lathe(rider, [[0.0, 0], [0.15, 0.02], [0.175, 0.3], [0.165, 0.7], [0.0, 1]], dark, HIP.clone().add(V3(0, -0.1, -0.02)), HIP.clone().add(V3(0, 0.12, 0.02)), 1.2, 0.85);
  const limbs = {};
  for (const s of [-1, 1]) {
    const side = s > 0 ? 'L' : 'R';
    const hip = V3(s * 0.1, ys + 0.08, 0.36), foot = V3(s * 0.17, 0.37 - R, 0.66);
    const knee = hip.clone().lerp(foot, 0.5).add(V3(s * 0.1, 0.2, 0.2));
    const leg = new THREE.Group(); leg.position.copy(hip); rider.add(leg);
    const k = knee.clone().sub(hip), f = foot.clone().sub(hip);
    // thigh (muscle bulge), knee guard, shin, tall MX boot with buckles
    lathe(leg, [[0.07, 0], [0.098, 0.15], [0.094, 0.55], [0.07, 0.9], [0.062, 1]], dark, V3(0, 0, 0), k, 1, 1, 14);
    blob(leg, k.clone().add(V3(0, 0, 0.02)), 0.07, pads, 1.05, 1.25, 1.1);
    const ankle = f.clone().add(V3(0, 0.07, -0.01)), bootTop = k.clone().lerp(ankle, 0.35);
    lathe(leg, [[0.058, 0], [0.066, 0.3], [0.06, 1]], dark, k, bootTop, 1, 1, 12);
    lathe(leg, [[0.07, 0], [0.074, 0.6], [0.079, 1]], bootM, ankle, bootTop, 1, 1.05, 14);
    for (const t of [0.25, 0.5, 0.75]) { const p = ankle.clone().lerp(bootTop, t); cube(leg, p.add(V3(s * 0.07, 0, 0)), 0.012, 0.018, 0.05, buckle); }
    blob(leg, f.clone().add(V3(0, 0.035, 0.05)), 0.075, bootM, 0.85, 0.65, 1.75);
    cube(leg, f.clone().add(V3(0, -0.005, 0.05)), 0.12, 0.025, 0.28, bootSole);
    // arm: shoulder cap, upper arm, elbow guard, forearm, glove with knuckles
    const sh = U(s * 0.2, ys + 0.6, 0.52), hand = U(s * 0.37, BAR.y + 0.01, BAR.z);
    const elbow = sh.clone().lerp(hand, 0.5).add(V3(s * 0.1, -0.06, -0.06));
    blob(upper, sh, 0.078, jersey, 1.05, 0.95, 1);
    const arm = new THREE.Group(); arm.position.copy(sh); upper.add(arm);
    const e = elbow.clone().sub(sh), hd = hand.clone().sub(sh);
    lathe(arm, [[0.064, 0], [0.066, 0.3], [0.058, 0.8], [0.052, 1]], jersey, V3(0, 0, 0), e, 1, 1, 12);
    blob(arm, e, 0.05, pads, 1, 1, 1.15);
    lathe(arm, [[0.05, 0], [0.054, 0.25], [0.043, 0.85], [0.036, 1]], jersey, e, hd, 1, 0.85, 12);
    blob(arm, hd, 0.047, glove, 1.05, 0.85, 1.3);
    blob(arm, hd.clone().add(V3(0, 0.02, 0.035)), 0.03, glove, 1.4, 0.7, 0.9);
    limbs['leg' + side] = leg; limbs['arm' + side] = arm;
  }
  // torso: waist to chest to shoulders, slightly hunched over the bars; number board on the back
  const waist = U(0, ys + 0.1, 0.37), neckBase = U(0, ys + 0.68, 0.53);
  lathe(upper, [[0.15, 0], [0.155, 0.12], [0.175, 0.4], [0.19, 0.62], [0.19, 0.78], [0.15, 0.9], [0.07, 0.97], [0.0, 1]], jersey, waist, neckBase, 1.18, 0.72, 20);
  lathe(upper, [[0.158, 0], [0.16, 1]], glove, U(0, ys + 0.3, 0.42), U(0, ys + 0.36, 0.44), 1.19, 0.73, 20);
  const back = cube(upper, U(0, ys + 0.44, 0.33), 0.2, 0.18, 0.01, glove); back.rotation.x = 0.28;
  lathe(upper, [[0.055, 0], [0.05, 1]], skinM, neckBase, U(0, ys + 0.78, 0.58), 1, 1, 10);
  // MX helmet: shell, long chin bar, peak, goggles on the strap
  const head = new THREE.Group(); head.position.copy(U(HEADP.x, HEADP.y, HEADP.z)); upper.add(head);
  blob(head, V3(0, 0.01, -0.01), 0.155, shell, 0.94, 1, 1.12);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10, -Math.PI * 0.45, Math.PI * 0.9, Math.PI * 0.45, Math.PI * 0.45), shell);
  chin.scale.set(0.95, 0.85, 1.45); chin.position.set(0, -0.045, 0.06); head.add(chin);
  blob(head, V3(0, -0.095, 0.2), 0.03, black, 1.6, 0.8, 0.6);                     // mouth vent
  const peak = cube(head, V3(0, 0.125, 0.15), 0.23, 0.014, 0.16, shell, -0.32);
  cube(head, V3(0, 0.13, 0.15), 0.08, 0.016, 0.15, glove, -0.32);                  // peak stripe
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.014, 6, 28), black); strap.rotation.x = Math.PI / 2; strap.scale.set(0.95, 1.13, 1); strap.position.set(0, 0.02, -0.01); head.add(strap);
  const gog = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 18, 1, true, -0.75, 1.5), black); gog.rotation.set(Math.PI / 2, 0, 0); gog.rotation.order = 'YXZ';
  gog.position.set(0, 0.02, 0.07); gog.scale.set(1, 1, 0.55); head.add(gog);
  cube(head, V3(0, 0.02, 0.172), 0.165, 0.052, 0.008, lens);
  void peak;
  rider.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // Camera anchors
  const eye = new THREE.Object3D(); eye.position.set(0, 0.02, 0.12); head.add(eye);
  const chest = new THREE.Object3D(); chest.position.copy(U(0, ys + 0.5, 0.62)); upper.add(chest);
  const barCam = new THREE.Object3D(); barCam.position.copy(BAR.clone().add(V3(0, 0.12, 0.05))); body.add(barCam);

  scene.add(root);
  rig = { root, body, wheels, rider, upper, head, eye, chest, barCam, dashCv, dashTex, B, paint, accent, ...limbs,
    riderHome: { p: rider.position.clone(), q: rider.quaternion.clone() }, upperHome: upper.rotation.clone(), ragdoll: null };
}
