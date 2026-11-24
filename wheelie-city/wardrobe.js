// Wheelie City — the wardrobe: a dressing room (from the menu) where you pick your character's body, skin, hair, top,
// bottoms and shoes, turning on a platform in front of the mirror. The look is saved, and used on foot and on the bike.
'use strict';

const LOOK_DEFAULT = { sex: 'male', tone: 1, hair: 'hair_simpleparted', hairCol: '#2a1d14', beard: false, top: 'long', topCol: '#f0e8da', legs: 'trousers', legsCol: '#262b33', shoes: '#e8e8e4' };
const LOOK = Object.assign({}, LOOK_DEFAULT, store.get('wc-look', {}));
const WARDROBE_OPTS = {
  top: [['tee', 'T-shirt'], ['long', 'Long sleeve']],
  legs: [['trousers', 'Trousers'], ['shorts', 'Shorts']],
  cols: ['#f0e8da', '#f2f2f0', '#14151a', '#2c3e66', '#1f3fa8', '#8a1c2a', '#c8102e', '#3f6b3a', '#2a9d4a', '#d8a028', '#ff6a00', '#6a3a7a', '#e05a8a', '#7d8590', '#5a4a3a', '#c8bfa8'],
  legCols: ['#262b33', '#14151a', '#1f2a44', '#2a3a5a', '#3a3a3e', '#5a4a3a', '#7a7466', '#c8bfa8', '#8a1c2a', '#3f6b3a'],
  shoes: ['#e8e8e4', '#14151a', '#6a4a2a', '#c8102e', '#1f3fa8', '#ffd200'],
};
const SKIN_SWATCH = ['#f2d2bc', '#e8c0a0', '#d4a888', '#9a6440', '#7a4c30', '#5a3622'];     // (how each of SKIN_TONES looks)
const hairChoices = () => (LOOK.sex === 'male' ? ['hair_simpleparted', 'hair_buzzed', 'hair_long', 'none'] : ['hair_long', 'hair_buns', 'hair_buzzedfemale', 'hair_simpleparted', 'none']);
const HAIR_NAMES = { hair_simpleparted: 'Side part', hair_buzzed: 'Buzz cut', hair_long: 'Long', hair_buns: 'Buns', hair_buzzedfemale: 'Short', none: 'Bald' };
function saveLook() {
  store.set('wc-look', LOOK);
  // the rider on the bike wears the same: top as the jersey, bottoms as the pants, same skin
  riderLook.jersey = LOOK.topCol; riderLook.pants = LOOK.legsCol; riderLook.skin = SKIN_SWATCH[LOOK.tone] || '#c99375';
  store.set('wc-rider', riderLook);
}

// A figure dressed in a look: the body, clothes, hair (and beard), with an animation mixer
function makeFigure(look) {
  if (!PEOPLE.ready) return null;
  const kind = look.sex === 'female' ? 'female' : 'male';
  const root = THREE.SkeletonUtils.clone(PEOPLE[kind].scene);
  let body = null; const extras = [];
  root.traverse((o) => { if (o.isSkinnedMesh) { if (o.name === PEOPLE[kind].bodyName) body = o; else extras.push(o); } });
  const [tone, tint] = SKIN_TONES[look.tone] || SKIN_TONES[1];
  body.material = skinMat(kind, tone, tint);
  for (const o of extras) o.material = /eye/i.test(o.name) || (o.material && /eye/i.test(o.material.name)) ? peopleMat('eye', () => new THREE.MeshStandardMaterial({ map: PEOPLE.tex.eye, roughness: 0.25 })) : hairMat('hair' + (kind === 'male' ? 1 : 2), look.hairCol);
  const G = PEOPLE.garments[kind], parent = body.parent;
  const bindTo = (geo, mat) => { const m = new THREE.SkinnedMesh(geo, mat); m.bind(body.skeleton, body.bindMatrix); m.position.copy(body.position); m.quaternion.copy(body.quaternion); m.scale.copy(body.scale); parent.add(m); return m; };
  bindTo(look.top === 'tee' ? G.tee : G.longTop, clothMat(look.topCol, 'jersey', 0.85));
  bindTo(look.legs === 'shorts' ? G.shorts : G.trousers, clothMat(look.legsCol, look.legsCol === '#c8bfa8' ? 'jersey' : 'denim', 0.85));
  bindTo(G.shoes, clothMat(look.shoes, 'leather', 0.5));
  const styles = []; if (look.hair && look.hair !== 'none') styles.push(look.hair); if (kind === 'male' && look.beard) styles.push('hair_beard');
  for (const s of styles) {
    const src = PEOPLE.hair[s]; if (!src) continue;
    const bones = src.skeleton.bones.map((b) => root.getObjectByName(b.name) || b);
    const h = new THREE.SkinnedMesh(src.geometry, hairMat(s === 'hair_long' || s === 'hair_buns' ? 'hair2' : 'hair1', look.hairCol));
    h.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses), src.bindMatrix); parent.add(h);
  }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(root), actions = {};
  for (const [k, c] of Object.entries(PEOPLE.clips)) actions[k] = mixer.clipAction(c);
  for (const k of ['Punch_Jab', 'Punch_Cross', 'Sword_Attack', 'Pistol_Shoot', 'Hit_Chest', 'Hit_Head', 'Death01', 'Interact', 'Roll']) if (actions[k]) { actions[k].setLoop(THREE.LoopOnce); actions[k].clampWhenFinished = true; }
  return { root, mixer, actions, cur: null };
}

// ---------------------------------------------------------------- the dressing room
const WARD_Y = -1600;
const WARD = { g: null, fig: null, spin: 0, built: false };
function buildWardrobeRoom() {
  if (WARD.g) return;
  const g = new THREE.Group(); g.position.y = WARD_Y; scene.add(g); WARD.g = g;
  const L = (c, e = 0.4) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: e });
  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
  // wood floor, warm walls, ceiling with spotlights
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const c = cv.getContext('2d');
  for (let i = 0; i < 8; i++) { c.fillStyle = ['#7a5434', '#835a38', '#6f4c2e', '#8a6040'][i % 4]; c.fillRect(0, i * 32, 256, 32); c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, i * 32, 256, 2); c.fillRect((i * 97) % 256, i * 32, 2, 32); }
  const ft = new THREE.CanvasTexture(cv); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(3, 3); ft.encoding = THREE.sRGBEncoding;
  add(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: ft, emissive: '#ffffff', emissiveMap: ft, emissiveIntensity: 0.45 }), 0, 0, 0);
  add(new THREE.PlaneGeometry(10, 10).rotateX(Math.PI / 2), L('#e8e4dc', 0.5), 0, 3.2, 0);
  const wall = L('#d9cdbb', 0.45);
  add(new THREE.PlaneGeometry(10, 3.2), wall, 0, 1.6, 4.5, Math.PI); add(new THREE.PlaneGeometry(10, 3.2), wall, 0, 1.6, -4.5);
  add(new THREE.PlaneGeometry(9, 3.2), wall, 4.5, 1.6, 0, -Math.PI / 2); add(new THREE.PlaneGeometry(9, 3.2), wall, -4.5, 1.6, 0, Math.PI / 2);
  for (const [x, z] of [[-1.5, -1], [1.5, -1], [0, 1.5]]) add(new THREE.CircleGeometry(0.35, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff6e0' }), x, 3.19, z);
  // the mirror behind you, in a frame
  add(new THREE.BoxGeometry(2.2, 2.6, 0.08), L('#2a2420', 0.2), 0, 1.45, 4.42);
  add(new THREE.PlaneGeometry(2.0, 2.4), new THREE.MeshStandardMaterial({ color: '#cfd8dc', roughness: 0.03, metalness: 1 }), 0, 1.45, 4.37, Math.PI);
  // clothing racks down both sides, hung with shirts in every colour
  const rail = new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.9 });
  for (const sx of [-3.6, 3.6]) {
    add(new THREE.CylinderGeometry(0.02, 0.02, 4, 8).rotateX(Math.PI / 2), rail, sx, 1.75, 0);
    for (const z of [-2, 2]) add(new THREE.CylinderGeometry(0.02, 0.02, 1.75, 8), rail, sx, 0.875, z);
    WARDROBE_OPTS.cols.forEach((col, i) => { const sh = add(new THREE.BoxGeometry(0.06, 0.75, 0.5), L(col, 0.25), sx, 1.32, -1.8 + i * 0.24); sh.rotation.y = (i % 3 - 1) * 0.15; });
  }
  // the platform you turn on
  add(new THREE.CylinderGeometry(0.9, 0.95, 0.12, 40), L('#202226', 0.3), 0, 0.06, 0);
  add(new THREE.TorusGeometry(0.92, 0.015, 6, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3d7f' }), 0, 0.125, 0);
}
function refreshWardrobeFigure() {
  if (WARD.fig) { WARD.g.remove(WARD.fig.root); WARD.fig.mixer.stopAllAction(); }
  WARD.fig = makeFigure(LOOK);
  if (!WARD.fig) return;
  WARD.fig.root.position.set(0, 0.12, 0); WARD.g.add(WARD.fig.root);
  personPlay(WARD.fig, 'Idle_Loop', 0.1);
  // your on-foot self gets rebuilt in the new clothes next time you hop off
  if (FOOT.fig && !FOOT.on) { scene.remove(FOOT.fig.g); FOOT.fig = null; }
}

// ---------------------------------------------------------------- the panel
const wardPanel = document.createElement('section');
wardPanel.id = 'wardrobe'; wardPanel.hidden = true;
(document.querySelector('#stage') || document.body).append(wardPanel);
const wardStyle = document.createElement('style');
wardStyle.textContent = `
  #wardrobe { position: absolute; top: 0; right: 0; bottom: 0; z-index: 9; width: min(380px, 92%); overflow: auto; padding: 22px 22px 90px; background: rgba(16,17,25,.9); border-left: 4px solid #ff3d7f; color: #f3efe7; font: 14px/1.4 system-ui, sans-serif; }
  #wardrobe h2 { margin: 0 0 4px; font-size: 26px; letter-spacing: .04em; } #wardrobe .sub { opacity: .7; margin: 0 0 14px; font-size: 13px; }
  #wardrobe h4 { margin: 16px 0 8px; font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: #ff3d7f; }
  #wardrobe .opts { display: flex; flex-wrap: wrap; gap: 6px; }
  #wardrobe .opts button { padding: 7px 11px; background: #262836; color: #f3efe7; border: 1px solid #3a3d4c; cursor: pointer; font: inherit; }
  #wardrobe .opts button[aria-pressed="true"] { border-color: #ff3d7f; background: #3a2030; }
  #wardrobe .sw { width: 30px; height: 30px; padding: 0 !important; border-radius: 50%; }
  #wardrobe .sw[aria-pressed="true"] { outline: 2px solid #ff3d7f; outline-offset: 2px; }
  #wardrobe .done { position: fixed; bottom: 18px; right: 22px; width: min(336px, 80%); padding: 12px; background: #ff3d7f; color: #fff; border: 0; font: 800 16px system-ui, sans-serif; letter-spacing: .08em; cursor: pointer; }
  #wardrobe .turn { display: flex; gap: 8px; margin-top: 10px; } #wardrobe .turn button { flex: 1; }`;
document.head.appendChild(wardStyle);
function renderWardrobePanel() {
  const P = wardPanel;
  P.innerHTML = '<h2>Wardrobe</h2><p class="sub">Dress your character. You wear this on foot and on the bike.</p>';
  const group = (title, items, cur, onPick, swatch) => {
    const h = document.createElement('h4'); h.textContent = title; P.appendChild(h);
    const row = document.createElement('div'); row.className = 'opts';
    for (const [val, label] of items) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(val === cur));
      if (swatch) { b.className = 'sw'; b.style.background = label; b.title = val; } else b.textContent = label;
      b.onclick = () => { onPick(val); saveLook(); renderWardrobePanel(); refreshWardrobeFigure(); };
      row.appendChild(b);
    }
    P.appendChild(row);
  };
  group('Body', [['male', 'Male'], ['female', 'Female']], LOOK.sex, (v) => { LOOK.sex = v; if (!hairChoices().includes(LOOK.hair)) LOOK.hair = hairChoices()[0]; if (v === 'female') LOOK.beard = false; });
  group('Skin', SKIN_SWATCH.map((c, i) => [i, c]), LOOK.tone, (v) => { LOOK.tone = v; }, true);
  group('Hair', hairChoices().map((h) => [h, HAIR_NAMES[h]]), LOOK.hair, (v) => { LOOK.hair = v; });
  group('Hair colour', HAIR_COLS.map((c) => [c, c]), LOOK.hairCol, (v) => { LOOK.hairCol = v; }, true);
  if (LOOK.sex === 'male') group('Beard', [[false, 'Clean shaven'], [true, 'Beard']], LOOK.beard, (v) => { LOOK.beard = v; });
  group('Top', WARDROBE_OPTS.top, LOOK.top, (v) => { LOOK.top = v; });
  group('Top colour', WARDROBE_OPTS.cols.map((c) => [c, c]), LOOK.topCol, (v) => { LOOK.topCol = v; }, true);
  group('Bottoms', WARDROBE_OPTS.legs, LOOK.legs, (v) => { LOOK.legs = v; });
  group('Bottoms colour', WARDROBE_OPTS.legCols.map((c) => [c, c]), LOOK.legsCol, (v) => { LOOK.legsCol = v; }, true);
  group('Shoes', WARDROBE_OPTS.shoes.map((c) => [c, c]), LOOK.shoes, (v) => { LOOK.shoes = v; }, true);
  const turn = document.createElement('div'); turn.className = 'opts turn';
  for (const [lbl, d] of [['⟲ Turn', 1], ['Turn ⟳', -1]]) { const b = document.createElement('button'); b.type = 'button'; b.textContent = lbl; b.onclick = () => { WARD.spin += d * 0.8; }; turn.appendChild(b); }
  P.appendChild(turn);
  const done = document.createElement('button'); done.type = 'button'; done.className = 'done'; done.textContent = 'DONE'; done.onclick = closeWardrobe;
  P.appendChild(done);
}
// opts.fromGame: opened from a clothes shop's changing room mid-game; closing goes straight back to the shop
function openWardrobe(opts) {
  if (!PEOPLE.ready) { loadPeople().then((ok) => { if (ok) openWardrobe(opts); }); $('#mapStatus').textContent = 'Loading the wardrobe…'; return; }
  WARD.fromGame = !!(opts && opts.fromGame);
  buildWardrobeRoom(); WARD.g.visible = true;
  refreshWardrobeFigure(); renderWardrobePanel();
  state = 'wardrobe'; $('#start').hidden = true; $('#hud').hidden = true; wardPanel.hidden = false;
  if (WARD.fromGame) { setKeyBubble(); if (document.pointerLockElement) document.exitPointerLock(); }
  camSnap = true;
}
function closeWardrobe() {
  wardPanel.hidden = true; if (WARD.g) WARD.g.visible = false;
  if (WARD.fromGame) {
    // back in the shop, in the new clothes
    WARD.fromGame = false; state = 'play'; $('#hud').hidden = false;
    if (FOOT.fig) { scene.remove(FOOT.fig.g); FOOT.fig.mixer.stopAllAction(); FOOT.fig = null; }
    if (buildFootFigure()) { FOOT.fig.g.visible = true; personPlay(FOOT.fig, 'Idle_Loop', 0.1); syncPlayerState(); }
    camSnap = true; last = performance.now(); lockPointer();
    popup('New look', 'good');
    return;
  }
  state = 'menu'; show('#start');
  // the rider wears the new look too
  if (rig && !FOOT.on) { buildBike(); if (MAP) placeRig(0); }
  camSnap = true;
}
$('#wardrobeBtn') && $('#wardrobeBtn').addEventListener('click', () => openWardrobe());
addEventListener('keydown', (e) => { if (state === 'wardrobe' && (e.code === 'Escape' || e.code === 'Enter')) closeWardrobe(); });
function updateWardrobe(dt) {
  if (!WARD.fig) return;
  WARD.spin += dt * 0.35;
  WARD.fig.root.rotation.y = WARD.spin;
  WARD.fig.mixer.update(dt);
}
function wardrobeCamera() {
  // in front of the platform, aimed past it, so you stand in the left half of the screen (the panel is on the right)
  camera.position.set(-1.3, WARD_Y + 1.5, -3.2); camera.up.set(0, 1, 0);
  camera.lookAt(-1.05, WARD_Y + 1.0, 0); camera.fov = 45; camera.updateProjectionMatrix();
}
