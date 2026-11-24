// Wheelie City — realistic pedestrians.
// Bodies, hairstyles and animations: Quaternius' Universal Base Characters and Universal Animation Library (CC0,
// quaternius.com), prepared by tools/people. The bodies come in underwear only: the clothes are made here from the
// body's own surface (the shirt is the torso and arms, the trousers the hips and legs), pushed out a little and
// smoothed so the muscles don't show through, with fabric textures and a colour per person.
'use strict';

const PEOPLE = { ready: false, failed: false, base: {}, hair: {}, clips: {}, mats: {}, garments: {} };
const PEOPLE_DIR = 'wheelie-city/assets/people/';
const HAIRS = { male: ['hair_simpleparted', 'hair_buzzed', 'hair_long', 'hair_buzzed'], female: ['hair_long', 'hair_buns', 'hair_buzzedfemale', 'hair_long', 'hair_simpleparted'] };
const SKIN_TONES = [['light', '#ffe6d6'], ['light', '#ffffff'], ['light', '#f0cdb0'], ['dark', '#ffffff'], ['dark', '#d0a080'], ['dark', '#9a7058']];
const HAIR_COLS = ['#2a1d14', '#1a1410', '#4a301c', '#7a5230', '#b8904c', '#5a5a5a', '#1c1c1c'];
const CLOTH_TOP = ['#2c3e66', '#8a1c2a', '#e8e4dc', '#2a2a2e', '#3f6b3a', '#d8a028', '#6a3a7a', '#1f7a8a', '#c85a2a', '#7d8590', '#e05a8a', '#f2f2f0', '#14161a'];
const CLOTH_LEGS = ['#1f2a44', '#2a3a5a', '#3a3a3e', '#14161a', '#5a4a3a', '#7a7466', '#4a5a6e', '#c8bfa8'];
const SHOES = ['#f0f0ee', '#1a1a1c', '#6a4a2a', '#2a2a30', '#c8c8c8'];

function loadPeople() {
  if (PEOPLE.promise) return PEOPLE.promise;
  if (!THREE.GLTFLoader || !THREE.SkeletonUtils) { PEOPLE.failed = true; return (PEOPLE.promise = Promise.resolve(false)); }
  const gl = new THREE.GLTFLoader(), tl = new THREE.TextureLoader();
  const glb = (f) => new Promise((res, rej) => gl.load(PEOPLE_DIR + f + '.glb', res, undefined, rej));
  const tex = (f, srgb) => new Promise((res) => tl.load(PEOPLE_DIR + f + '.jpg', (t) => { t.flipY = false; if (srgb) t.encoding = THREE.sRGBEncoding; res(t); }, undefined, () => res(null)));
  const hairNames = [...new Set([...HAIRS.male, ...HAIRS.female, 'hair_beard'])];
  PEOPLE.promise = Promise.all([
    glb('male'), glb('female'), glb('anims'), Promise.all(hairNames.map(glb)),
    Promise.all(['male_light_c', 'male_dark_c', 'female_light_c', 'female_dark_c', 'hair1_c', 'hair2_c', 'eye_c'].map((f) => tex(f, true))),
    Promise.all(['male_n', 'female_n'].map((f) => tex(f, false))),
  ]).then(([male, female, anims, hairs, cols, nors]) => {
    const [mlc, mdc, flc, fdc, h1, h2, eye] = cols;
    PEOPLE.tex = { male: { light: mlc, dark: mdc, n: nors[0] }, female: { light: flc, dark: fdc, n: nors[1] }, hair1: h1, hair2: h2, eye };
    for (const [k, g] of [['male', male], ['female', female]]) PEOPLE.base[k] = g.scene;
    hairNames.forEach((n, i) => { let sm = null; hairs[i].scene.traverse((o) => { if (o.isSkinnedMesh && !sm) sm = o; }); if (sm) PEOPLE.hair[n] = sm; });
    for (const c of anims.animations) PEOPLE.clips[c.name] = c;
    const t0 = performance.now();
    for (const k of ['male', 'female']) prepBody(k);
    PEOPLE.prepMs = Math.round(performance.now() - t0);
    PEOPLE.ready = true;
    return true;
  }).catch((e) => { console.warn('people models', e); PEOPLE.err = String(e && e.stack || e); PEOPLE.failed = true; return false; });
  return PEOPLE.promise;
}

// The body's skinned mesh, eyes and brows, and the clothes made from it
function prepBody(kind) {
  const scene = PEOPLE.base[kind];
  let body = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = o; });
  const bb = new THREE.Box3().setFromBufferAttribute(body.geometry.attributes.position);
  const unit = (bb.max.y - bb.min.y) / 1.8 || 1;          // model units per metre (the bind pose stands ~1.8 m)
  // The bind pose is a T-pose, so each garment is a region by height (as a fraction of the body) and, for sleeves,
  // by how far out along the arms: y 0 = soles, 1 = top of the head; x from the middle
  const H = bb.max.y - bb.min.y, cx = (bb.max.x + bb.min.x) / 2;
  const region = (fn) => (x, y) => fn((x - cx) / H, (y - bb.min.y) / H);
  const top = (sleeve) => region((x, y) => { const ax = Math.abs(x); return ax <= sleeve && y >= 0.535 && y <= (ax < 0.075 ? 0.825 : 0.87); });
  const G = {};
  // tops: t-shirt or long sleeves (hoodie); bottoms: shorts or trousers; shoes
  G.tee = makeGarment(body, top(0.25), 0.016 * unit, 8);
  G.longTop = makeGarment(body, top(0.405), 0.02 * unit, 8);
  G.shorts = makeGarment(body, region((x, y) => y >= 0.33 && y <= 0.565), 0.013 * unit, 6);
  G.trousers = makeGarment(body, region((x, y) => y >= 0.045 && y <= 0.565), 0.013 * unit, 6);
  G.shoes = makeGarment(body, region((x, y) => y < 0.06), 0.009 * unit, 2);
  PEOPLE.garments[kind] = G;
  PEOPLE[kind] = { scene, bodyName: body.name };
}
// one component of a (possibly normalised integer) attribute; r128 has no getComponent
function attrComp(a, v, k) {
  const x = k === 0 ? a.getX(v) : k === 1 ? a.getY(v) : k === 2 ? a.getZ(v) : a.getW(v);
  if (!a.normalized) return x;
  const arr = a.array; return arr instanceof Uint8Array ? x / 255 : arr instanceof Uint16Array ? x / 65535 : x;
}
function makeGarment(body, inside, thick, smooth) {
  const g = body.geometry, pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
  const si = { getComponent: (v, k) => attrComp(g.attributes.skinIndex, v, k) }, sw = { getComponent: (v, k) => attrComp(g.attributes.skinWeight, v, k) };
  const n = pos.count, inG = new Uint8Array(n);
  for (let v = 0; v < n; v++) inG[v] = inside(pos.getX(v), pos.getY(v)) ? 1 : 0;
  // triangles wholly in the garment
  const tris = [];
  for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if (inG[a] && inG[b] && inG[c]) tris.push(a, b, c); }
  // vertices split at uv seams share a position: smooth over the welded surface so seams stay closed
  const key = new Map(), weld = new Int32Array(n).fill(-1), P = [], N = [];
  for (let v = 0; v < n; v++) {
    if (!inG[v]) continue;
    const k = Math.round(pos.getX(v) * 1e4) + ',' + Math.round(pos.getY(v) * 1e4) + ',' + Math.round(pos.getZ(v) * 1e4);
    let id = key.get(k);
    if (id === undefined) { id = P.length / 3; key.set(k, id); P.push(pos.getX(v), pos.getY(v), pos.getZ(v)); N.push(0, 0, 0); }
    weld[v] = id; N[id * 3] += nor.getX(v); N[id * 3 + 1] += nor.getY(v); N[id * 3 + 2] += nor.getZ(v);
  }
  const P0 = P.slice();          // the skin itself
  const W = P.length / 3, nb =Array.from({ length: W }, () => new Set()), edge = new Map();
  for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = weld[tris[t + e]], b = weld[tris[t + (e + 1) % 3]]; nb[a].add(b); nb[b].add(a);
    const ek = a < b ? a * W + b : b * W + a; edge.set(ek, (edge.get(ek) || 0) + 1);
  }
  const fixed = new Uint8Array(W);
  for (const [ek, c] of edge) if (c === 1) { fixed[Math.floor(ek / W)] = 1; fixed[ek % W] = 1; }     // the hem stays put
  // push out along the normal, then smooth away the muscles
  for (let i = 0; i < W; i++) { const L = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; for (let c = 0; c < 3; c++) P[i * 3 + c] += N[i * 3 + c] / L * thick; }
  for (let it = 0; it < smooth; it++) {
    const Q = P.slice();
    for (let i = 0; i < W; i++) {
      if (fixed[i] || !nb[i].size) continue;
      let x = 0, y = 0, z = 0; for (const j of nb[i]) { x += P[j * 3]; y += P[j * 3 + 1]; z += P[j * 3 + 2]; }
      const m = nb[i].size, l = 0.5;
      Q[i * 3] += (x / m - P[i * 3]) * l; Q[i * 3 + 1] += (y / m - P[i * 3 + 1]) * l; Q[i * 3 + 2] += (z / m - P[i * 3 + 2]) * l;
    }
    // smoothing shrinks a surface: put back the lost thickness
    for (let i = 0; i < W; i++) { const L = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; for (let c = 0; c < 3; c++) Q[i * 3 + c] += N[i * 3 + c] / L * thick * 0.12; }
    for (let i = 0; i < Q.length; i++) P[i] = Q[i];
  }
  // smoothing pulls the cloth in over bulges (thighs, hips, chest): never let it sink below the skin + its thickness
  for (let i = 0; i < W; i++) {
    const L = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1, nx = N[i * 3] / L, ny = N[i * 3 + 1] / L, nz = N[i * 3 + 2] / L;
    const out = (P[i * 3] - P0[i * 3]) * nx + (P[i * 3 + 1] - P0[i * 3 + 1]) * ny + (P[i * 3 + 2] - P0[i * 3 + 2]) * nz;
    if (out < thick) { const k = thick - out; P[i * 3] += nx * k; P[i * 3 + 1] += ny * k; P[i * 3 + 2] += nz * k; }
  }
  // compact into a new skinned geometry
  const map = new Int32Array(n).fill(-1), op = [], ou = [], oi = [], ow = [], tri = [];
  const uv = g.attributes.uv;
  for (const v of tris) {
    if (map[v] < 0) {
      map[v] = op.length / 3; const id = weld[v];
      op.push(P[id * 3], P[id * 3 + 1], P[id * 3 + 2]);
      ou.push(uv ? uv.getX(v) : 0, uv ? uv.getY(v) : 0);
      for (let k = 0; k < 4; k++) { oi.push(si.getComponent(v, k)); ow.push(sw.getComponent(v, k)); }
    }
    tri.push(map[v]);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(op, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(ou, 2));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(oi, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(ow, 4));
  out.setIndex(tri); out.computeVertexNormals(); out.computeBoundingSphere();
  return out;
}

// Shared materials (a handful per kind, so many people share a few shader programs and textures)
// (three r128: a material only follows the skeleton with skinning on)
function peopleMat(key, make) { if (!PEOPLE.mats[key]) { const m = make(); m.skinning = true; PEOPLE.mats[key] = m; } return PEOPLE.mats[key]; }
function clothMat(hex, fabric, rough) {
  return peopleMat('cloth' + hex + fabric, () => {
    const t = fabric === 'denim' ? TEX.denim_n : fabric === 'leather' ? TEX.leather_n : TEX.jersey_n;
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0, normalMap: t || null, map: fabric === 'denim' && TEX.denim_c ? TEX.denim_c : null });
    if (m.normalMap) m.normalScale.set(0.6, 0.6);
    return m;
  });
}
function skinMat(kind, tone, tint) {
  return peopleMat('skin' + kind + tone + tint, () => new THREE.MeshStandardMaterial({ map: PEOPLE.tex[kind][tone], normalMap: PEOPLE.tex[kind].n, color: tint, roughness: 0.62, metalness: 0 }));
}
function hairMat(tex, hex) {
  return peopleMat('hair' + tex + hex, () => new THREE.MeshStandardMaterial({ map: PEOPLE.tex[tex], color: hex, roughness: 0.75, metalness: 0, side: THREE.DoubleSide }));
}

// One person: a clone of the body with its skeleton, the clothes and hair bound to it, and an animation mixer
function makePed(r) {
  const kind = r() < 0.5 ? 'male' : 'female';
  const root = THREE.SkeletonUtils.clone(PEOPLE[kind].scene);
  let body = null; const extras = [];
  root.traverse((o) => { if (o.isSkinnedMesh) { if (o.name === PEOPLE[kind].bodyName) body = o; else extras.push(o); } });
  const [tone, tint] = pick(r, SKIN_TONES), hairCol = pick(r, HAIR_COLS);
  body.material = skinMat(kind, tone, tint);
  // eyes and brows / beard stubble meshes in the body file
  for (const o of extras) o.material = /eye/i.test(o.name) || (o.material && /eye/i.test(o.material.name)) ? peopleMat('eye', () => new THREE.MeshStandardMaterial({ map: PEOPLE.tex.eye, roughness: 0.25 })) : hairMat('hair' + (kind === 'male' ? 1 : 2), hairCol);
  const G = PEOPLE.garments[kind], parent = body.parent;
  const bindTo = (geo, mat) => { const m = new THREE.SkinnedMesh(geo, mat); m.bind(body.skeleton, body.bindMatrix); m.position.copy(body.position); m.quaternion.copy(body.quaternion); m.scale.copy(body.scale); parent.add(m); return m; };
  const long = r() < 0.45, trousers = r() < (kind === 'male' ? 0.8 : 0.6);
  const top = pick(r, CLOTH_TOP), legs = pick(r, CLOTH_LEGS);
  bindTo(long ? G.longTop : G.tee, clothMat(top, 'jersey', 0.9));
  bindTo(trousers ? G.trousers : G.shorts, clothMat(legs, legs === '#c8bfa8' ? 'jersey' : 'denim', 0.85));
  bindTo(G.shoes, clothMat(pick(r, SHOES), 'leather', 0.55));
  // hair (and sometimes a beard), rebound from its own skeleton onto this person's bones by name
  const styles = [pick(r, HAIRS[kind])]; if (kind === 'male' && r() < 0.3) styles.push('hair_beard');
  for (const s of styles) {
    const src = PEOPLE.hair[s]; if (!src) continue;
    const bones = src.skeleton.bones.map((b) => root.getObjectByName(b.name) || b);
    const h = new THREE.SkinnedMesh(src.geometry, hairMat(s === 'hair_long' || s === 'hair_buns' ? 'hair2' : 'hair1', hairCol));
    h.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses), src.bindMatrix);
    h.position.copy(src.position); h.quaternion.copy(src.quaternion); h.scale.copy(src.scale);
    parent.add(h);
  }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = quality === 'ultra' || quality === 'high'; o.receiveShadow = false; } });
  const mixer = new THREE.AnimationMixer(root), actions = {};
  for (const [k, c] of Object.entries(PEOPLE.clips)) actions[k] = mixer.clipAction(c);
  for (const k of ['Hit_Chest', 'Death01']) if (actions[k]) { actions[k].setLoop(THREE.LoopOnce); actions[k].clampWhenFinished = true; }
  return { root, mixer, actions, cur: null };
}
// ---------------------------------------------------------------- the rider
// The bike's rider is a real body too. The old built rider stays as an invisible guide: its limb groups are what the
// tricks, standing, no-hands and the crash ragdoll move, and markers in them say where the hips, neck, hands, feet,
// elbows and knees should be. Each frame the body is bent to match (aiming the spine and neck, two-bone IK for arms
// and legs). The real helmet stays on the guide's head.
const _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _rc = new THREE.Vector3(), _rd = new THREE.Vector3(), _re = new THREE.Vector3();
const _rq1 = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), _rq3 = new THREE.Quaternion();
function aimBone(bone, child, target) {
  // turn a bone (in world space) so that its child joint points at target
  const p = bone.getWorldPosition(_ra), c = child.getWorldPosition(_rb);
  const from = _rc.subVectors(c, p), to = _rd.subVectors(target, p);
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  from.normalize(); to.normalize();
  const dq = _rq1.setFromUnitVectors(from, to), bq = bone.getWorldQuaternion(_rq2), pq = bone.parent.getWorldQuaternion(_rq3).invert();
  bone.quaternion.copy(pq.multiply(dq.multiply(bq)));
  bone.updateMatrixWorld(true);
}
function twoBoneIK(a, b, c, target, pole) {
  const A = a.getWorldPosition(new THREE.Vector3()), B = b.getWorldPosition(new THREE.Vector3()), Cc = c.getWorldPosition(new THREE.Vector3());
  const la = A.distanceTo(B), lb = B.distanceTo(Cc);
  const dir = new THREE.Vector3().subVectors(target, A); let d = dir.length();
  if (d < 1e-6) return;
  dir.divideScalar(d); d = Math.min(d, (la + lb) * 0.999);
  const x = (la * la - lb * lb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, la * la - x * x));
  const side = new THREE.Vector3().subVectors(pole, A); side.addScaledVector(dir, -side.dot(dir));
  if (side.lengthSq() < 1e-8) side.set(0, 1, 0).addScaledVector(dir, -dir.y);
  side.normalize();
  const elbow = A.clone().addScaledVector(dir, x).addScaledVector(side, h);
  aimBone(a, b, elbow);
  aimBone(b, c, A.clone().addScaledVector(dir, d));
}
function attachRiderModel(r) {
  if (!r || r.model || !PEOPLE.ready || !r.mk) return;
  // dressed from the wardrobe (wardrobe.js), hair under the helmet
  const look = typeof LOOK !== 'undefined' ? Object.assign({}, LOOK, { hair: 'none', beard: false }) : { sex: 'male', tone: 1, hair: 'none', top: 'long', topCol: riderLook.jersey, legs: 'trousers', legsCol: riderLook.pants, shoes: '#e8e8e4', hairCol: '#222' };
  const fig = makeFigure(look); if (!fig) return;
  const root = fig.root;
  root.traverse((o) => { if (o.isSkinnedMesh && /eye|brow/i.test(o.name + (o.material && o.material.name))) o.visible = false; });
  const bone = (n) => root.getObjectByName(n);
  const B = { pelvis: bone('pelvis'), spine: bone('spine_01'), neck: bone('neck_01'), head: bone('Head'),
    ua: [bone('upperarm_l'), bone('upperarm_r')], la: [bone('lowerarm_l'), bone('lowerarm_r')], hand: [bone('hand_l'), bone('hand_r')],
    th: [bone('thigh_l'), bone('thigh_r')], ca: [bone('calf_l'), bone('calf_r')], ft: [bone('foot_l'), bone('foot_r')] };
  const rest = []; root.traverse((o) => { if (o.isBone) rest.push([o, o.quaternion.clone(), o.position.clone()]); });
  r.rider.add(root);
  // size the body to the guide: hips to neck
  root.updateMatrixWorld(true);
  const modelSpan = B.pelvis.getWorldPosition(new THREE.Vector3()).distanceTo(B.neck.getWorldPosition(new THREE.Vector3())) / r.rider.getWorldScale(new THREE.Vector3()).x;
  const guideSpan = r.mk.hip.getWorldPosition(new THREE.Vector3()).distanceTo(r.mk.neck.getWorldPosition(new THREE.Vector3())) / r.rider.getWorldScale(new THREE.Vector3()).x;
  root.scale.setScalar(guideSpan / (modelSpan || 1));
  // the guide's own meshes go invisible, all but the helmet
  r.rider.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) { let p = o, inHead = false; while (p) { if (p === r.head) { inHead = true; break; } p = p.parent; } if (!inHead) o.visible = false; } });
  r.model = { root, B, rest };
}
function updateRiderModel(r) {
  const M = r && r.model; if (!M) return;
  const { root, B } = M, mk = r.mk;
  for (const [b, q, p] of M.rest) { b.quaternion.copy(q); b.position.copy(p); }
  r.rider.updateWorldMatrix(true, false);
  root.updateMatrixWorld(true);
  // hips onto the seat
  const hip = mk.hip.getWorldPosition(_re), pel = B.pelvis.getWorldPosition(new THREE.Vector3());
  root.position.add(r.rider.worldToLocal(hip.clone()).sub(r.rider.worldToLocal(pel)));
  root.updateMatrixWorld(true);
  // lean the body to the guide's chest, then the neck to the helmet
  aimBone(B.spine, B.neck, mk.neck.getWorldPosition(new THREE.Vector3()));
  aimBone(B.neck, B.head, mk.headBase.getWorldPosition(new THREE.Vector3()));
  // arms to the bars (or wherever a trick put the hands), legs to the pegs
  for (let s = 0; s < 2; s++) {
    twoBoneIK(B.ua[s], B.la[s], B.hand[s], mk.hand[s].getWorldPosition(new THREE.Vector3()), mk.elbow[s].getWorldPosition(new THREE.Vector3()));
    twoBoneIK(B.th[s], B.ca[s], B.ft[s], mk.foot[s].getWorldPosition(new THREE.Vector3()), mk.knee[s].getWorldPosition(new THREE.Vector3()));
  }
  // first person: no head in front of the camera
  B.head.scale.setScalar(r.head.visible ? 0.9 : 0.001);
}
// a weapon held in a hand: it moves with the hand but points the way the person faces (tilted by pitch). The hand
// bone's own axes swing about with every animation, so a fixed rotation on the bone leaves the gun sideways.
const _heldQ = new THREE.Quaternion(), _heldW = new THREE.Quaternion(), _heldE = new THREE.Euler();
function aimHeld(holder, hand, yaw, pitch) {
  hand.getWorldQuaternion(_heldQ);
  _heldW.setFromEuler(_heldE.set(pitch, yaw, 0, 'YXZ'));
  holder.quaternion.copy(_heldQ.invert()).multiply(_heldW);
}
function personPlay(m, name, fade = 0.3, speed = 1) {
  const a = m.actions[name]; if (!a) return;
  a.timeScale = speed;
  if (m.cur === name) return;
  const prev = m.cur ? m.actions[m.cur] : null;
  a.reset().play();
  if (prev) a.crossFadeFrom(prev, fade, false);
  // (no current one known, e.g. dying or a hold-up: fade out whatever was playing, or it keeps its full weight and
  // the two poses blend: a dead body half standing, floating over the ground)
  else for (const k in m.actions) { const o = m.actions[k]; if (o !== a && o.isRunning() && o.getEffectiveWeight() > 0) o.fadeOut(fade); }
  a.setEffectiveWeight(1); if (!prev) a.fadeIn(fade);
  m.cur = name;
}
