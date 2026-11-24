// Wheelie City — the world past the streets: photo textures, real terrain and satellite ground, and a far skyline.
//   Textures: Poly Haven and ambientCG (CC0), prepared by tools/fetch_assets.py.
//   Terrain: AWS Terrain Tiles; imagery: USGS National Map (US cities), Sentinel-2 cloudless 2024 by EOX (Vancouver).
//   Built by tools/build_terrain.py.
'use strict';

// ---------------------------------------------------------------- photo textures
// name: maps (c colour, n normal, r roughness, e night windows)
const TEX_LIST = {
  asphalt: 'cnr', sidewalk: 'cnr', grass: 'cn', brickwall: 'cn', plaster: 'cn', siding: 'cn', concwall: 'cn', corrugated: 'cn',
  roofgravel: 'cn', rooftiles: 'cn', bark: 'cn', palmbark: 'cn', leaves1: 'c', leaves2: 'c',
  glass1: 'cnr', glass2: 'cnr', office: 'cnr', tower: 'cne', brickt: 'cne', brickt2: 'cne',
  denim: 'cn', jersey: 'cn', leather: 'cn', rubber: 'n',
};
const TEX = {};          // TEX.asphalt_c etc. (THREE.Texture), filled by loadTextures
let TEX_AVG = {};
let texPromise = null;
function loadTextures(onStatus) {
  if (texPromise) return texPromise;
  const loader = new THREE.TextureLoader(), jobs = [];
  const aniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
  let done = 0, total = 0;
  for (const [name, maps] of Object.entries(TEX_LIST)) for (const k of maps) {
    total++;
    const file = `wheelie-city/assets/tex/${name}_${k}.${name.startsWith('leaves') ? 'png' : 'jpg'}`;
    jobs.push(new Promise((res) => loader.load(file, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
      if (k === 'c' || k === 'e') t.encoding = THREE.sRGBEncoding;
      TEX[`${name}_${k}`] = t; done++;
      if (onStatus && done % 6 === 0) onStatus(`Loading textures… ${Math.round(done / total * 100)}%`);
      res(t);
    }, undefined, () => { console.warn('texture missing', file); res(null); })));
  }
  // average colours, worked out offline (reading pixels back from the GPU at load is very slow on low-end machines)
  jobs.push(fetch('wheelie-city/assets/tex/avg.json').then((r) => r.json()).catch(() => ({})).then((a) => { TEX_AVG = a; }));
  texPromise = Promise.all(jobs).then(() => {
    for (const [k, v] of Object.entries(TEX_AVG)) if (TEX[k]) TEX[k].wcAvg = v;
    TEX.ready = true;
  });
  return texPromise;
}
// average colour of a loaded texture (linear), for tinting and blending
function texAverage(t) {
  if (t && t.wcAvg) return new THREE.Color().setRGB(t.wcAvg[0], t.wcAvg[1], t.wcAvg[2]).convertSRGBToLinear();
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = 16;
    const g = cv.getContext('2d'); g.drawImage(t.image, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data; let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    return new THREE.Color().setRGB(r / 256 / 255, gg / 256 / 255, b / 256 / 255).convertSRGBToLinear();
  } catch { return new THREE.Color(0.5, 0.5, 0.5); }
}

// ---------------------------------------------------------------- real terrain and satellite ground
const TERR = {};
const terrWaiters = {};
window.WC_TERRAIN = (key, meta, b64) => { const w = terrWaiters[key]; if (w) { delete terrWaiters[key]; w(meta, b64); } };
function loadTerrain(key) {
  if (TERR[key]) return Promise.resolve(TERR[key]);
  const heights = new Promise((resolve) => {
    terrWaiters[key] = async (meta, b64) => {
      try {
        const bin = atob(b64), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        resolve({ meta, h: new Int16Array(buf) });
      } catch (e) { console.warn('terrain', e); resolve(null); }
    };
    const s = document.createElement('script');
    s.src = `wheelie-city/terrain/${key}.js`;
    s.onerror = () => { delete terrWaiters[key]; resolve(null); };
    s.onload = () => s.remove();
    document.head.appendChild(s);
  });
  const img = (f) => new Promise((res) => new THREE.TextureLoader().load(`wheelie-city/terrain/${f}`, (t) => {
    t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1; res(t);
  }, undefined, () => res(null)));
  return Promise.all([heights, img(`${key}_far.jpg`), img(`${key}_near.jpg`)]).then(([hd, far, near]) => {
    if (hd && far && hd.meta.far.avg) far.wcAvg = hd.meta.far.avg;
    TERR[key] = hd ? { ...hd, far, near } : null;
    return TERR[key];
  });
}

const WORLD = { group: new THREE.Group(), terrainMats: [], lodMats: [], lod: [], box: new THREE.Vector4(1e9, 1e9, -1e9, -1e9) };
scene.add(WORLD.group);
// Distant ground and mountains fade into the sky colour over tens of kilometres, not the street haze
function aerialMaterial(map) {
  const m = new THREE.MeshLambertMaterial({ map, fog: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.aerialCol = { value: scene.fog.color }; sh.uniforms.aerialK = WORLD.aerialK || (WORLD.aerialK = { value: 1 / 30000 });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDist;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDist = length(mvPosition.xyz);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 aerialCol; uniform float aerialK; varying float vDist;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, aerialCol, 1.0 - exp(-vDist * aerialK));');
  };
  m.customProgramCacheKey = () => 'aerial';
  return m;
}
// Satellite ground: physically based, with the water in the imagery (dark, blue-green) made glossy so seas, the
// inlet and rivers mirror the sky at a distance the way real water does
function groundMaterial(map, aerial) {
  const low = quality === 'low';
  const m = low ? new THREE.MeshLambertMaterial({ map, fog: !aerial }) : new THREE.MeshStandardMaterial({ map, fog: !aerial, roughness: 0.95, metalness: 0, envMapIntensity: 1 });
  m.onBeforeCompile = (sh) => {
    if (aerial) {
      sh.uniforms.aerialCol = { value: scene.fog.color }; sh.uniforms.aerialK = WORLD.aerialK || (WORLD.aerialK = { value: 1 / 30000 });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDist;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvDist = length(mvPosition.xyz);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 aerialCol; uniform float aerialK; varying float vDist;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, aerialCol, 1.0 - exp(-vDist * aerialK));');
    }
    if (!low) sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', [
      '#include <roughnessmap_fragment>',
      'vec3 gc = diffuseColor.rgb; float gl = dot(gc, vec3(0.3, 0.59, 0.11));',
      'float water = smoothstep(0.075, 0.035, gl) * smoothstep(-0.004, 0.012, gc.b - gc.r);',
      'roughnessFactor = mix(roughnessFactor, 0.06, water); diffuseColor.rgb *= 1.0 - 0.5 * water;'].join('\n'))
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#if defined( RE_IndirectSpecular )\nradiance *= mix(0.15, 1.0, water);\n#endif');
  };
  m.customProgramCacheKey = () => 'ground-' + (aerial ? 'a' : 'n') + (low ? 'l' : 's');
  return m;
}
function clearWorld() {
  for (const o of [...WORLD.group.children]) { WORLD.group.remove(o); o.geometry && o.geometry.dispose(); }
  for (const m of WORLD.terrainMats.concat(WORLD.lodMats)) m.dispose();
  WORLD.terrainMats = []; WORLD.lodMats = []; WORLD.lod = [];
}
function buildTerrain() {
  const T = TERR[cityKey];
  ground.visible = true;
  if (!T) return;
  const M = T.meta, near = M.near, far = M.far;
  // the map and a little past it: one plane of sharp imagery just under the streets
  if (T.near) {
    // (split into ~250 m cells: depth interpolated across one 30 km triangle goes wrong and the plane shows through the streets)
    const w = near.x1 - near.x0, d = near.z1 - near.z0, g = new THREE.PlaneGeometry(w, d, Math.ceil(w / 250), Math.ceil(d / 250)).rotateX(-Math.PI / 2);
    // plane uv: u along +x, v along -z after the rotation: flip so north (z1) is at the top of the image
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const mat = groundMaterial(T.near, false); WORLD.terrainMats.push(mat);
    const me = new THREE.Mesh(g, mat); me.position.set((near.x0 + near.x1) / 2, -0.45, (near.z0 + near.z1) / 2); me.receiveShadow = false;
    WORLD.group.add(me); ground.visible = false;
  }
  // the rest of the box: hills and mountains from the height grid, flat ground and sea as one big plane underneath
  const farMat = aerialMaterial(T.far), flatMat = groundMaterial(T.far, true); WORLD.terrainMats.push(farMat, flatMat);
  {
    const w = far.x1 - far.x0, d = far.z1 - far.z0, g = new THREE.PlaneGeometry(w, d, Math.ceil(w / 800), Math.ceil(d / 800)).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const me = new THREE.Mesh(g, flatMat); me.position.set((far.x0 + far.x1) / 2, -0.9, (far.z0 + far.z1) / 2);
    WORLD.group.add(me);
    // and the sea / plains beyond, to the horizon, in the average colour of the imagery's edge
    const rim = new THREE.Mesh(new THREE.RingGeometry(Math.max(w, d) * 0.45, 90000, 64, 24).rotateX(-Math.PI / 2), groundMaterial(null, true));
    rim.material.color.copy(texAverage(T.far)).multiplyScalar(0.9); WORLD.terrainMats.push(rim.material);
    rim.position.set((far.x0 + far.x1) / 2, -1.2, (far.z0 + far.z1) / 2); WORLD.group.add(rim);
  }
  const H = T.h, nx = M.nx, nz = M.nz, step = M.step, stride = quality === 'low' || quality === 'med' ? 2 : 1, CH = 48;
  const hAt = (i, j) => H[Math.min(nz - 1, j) * nx + Math.min(nx - 1, i)];
  for (let cj = 0; cj < nz - 1; cj += CH * stride) for (let ci = 0; ci < nx - 1; ci += CH * stride) {
    const pos = [], nor = [], uvs = [], idx = [];
    const vid = new Map();
    const vert = (i, j) => {
      const key = j * 100000 + i; let v = vid.get(key); if (v !== undefined) return v;
      const x = M.x0 + i * step, z = M.z0 + j * step, h = hAt(i, j);
      // normal from the neighbours
      const hx = hAt(Math.max(0, i - stride), j) - hAt(Math.min(nx - 1, i + stride), j), hz = hAt(i, Math.max(0, j - stride)) - hAt(i, Math.min(nz - 1, j + stride));
      const n = new THREE.Vector3(hx, 2 * step * stride, hz).normalize();
      v = pos.length / 3; vid.set(key, v);
      pos.push(x, h - 0.9, z); nor.push(n.x, n.y, n.z);
      uvs.push((x - far.x0) / (far.x1 - far.x0), (z - far.z0) / (far.z1 - far.z0));
      return v;
    };
    for (let j = cj; j < Math.min(nz - 1, cj + CH * stride); j += stride) for (let i = ci; i < Math.min(nx - 1, ci + CH * stride); i += stride) {
      const i1 = Math.min(nx - 1, i + stride), j1 = Math.min(nz - 1, j + stride);
      const a = hAt(i, j), b = hAt(i1, j), c = hAt(i1, j1), d = hAt(i, j1);
      if (a < 3 && b < 3 && c < 3 && d < 3) continue;          // flat: the plane underneath covers it
      const A = vert(i, j), B = vert(i1, j), Cc = vert(i1, j1), D = vert(i, j1);
      idx.push(A, D, B, B, D, Cc);
    }
    if (!idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    WORLD.group.add(new THREE.Mesh(g, farMat));
  }
}
function updateTerrainLook() {
  if (!WORLD.aerialK) WORLD.aerialK = { value: 1 / 30000 };
  // clear air: mountains 15-25 km away stay crisp but blue; rain and fog swallow them
  WORLD.aerialK.value = (1 / 45000) * (1 + 1.2 * WX.cloud) * (1 + 6 * WX.rain) * (1 + 40 * WX.fog * WX.fog) * (C.night ? 2.5 : 1);
}

// ---------------------------------------------------------------- far skyline
// Every tall building in the city as a simple extruded block, so the towers you navigate by (Harbour Centre,
// Metrotown, the Strip, Midtown) are on the horizon from anywhere. Blocks inside the streamed area are hidden
// (by their own centre, so each building is either the far block or the full detailed one, never both).
const LOD_CHUNK = 4096;
function lodMaterial(src) {
  const m = src.clone();
  m.onBeforeCompile = (sh) => {
    if (src.onBeforeCompile) src.onBeforeCompile(sh);
    sh.uniforms.lodBox = { value: WORLD.box };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCtr; uniform vec4 lodBox; varying float vHide;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHide = (aCtr.x > lodBox.x && aCtr.y > lodBox.y && aCtr.x < lodBox.z && aCtr.y < lodBox.w) ? 1.0 : 0.0;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHide;')
      .replace('void main() {', 'void main() {\n  if (vHide > 0.5) discard;');
  };
  m.customProgramCacheKey = () => 'lod-' + (src.customProgramCacheKey ? src.customProgramCacheKey() : '') + src.type;
  WORLD.lodMats.push(m);
  return m;
}
function buildSkyline() {
  const m = MAP; if (!m || !MM.walls) return;
  const minH = quality === 'low' ? 30 : quality === 'med' ? 20 : quality === 'high' ? 14 : 11;
  const chunks = new Map();
  const mats = {};
  for (let b = 0; b < m.B; b++) {
    const h = m.bH[b]; if (h < minH || (m.bHide && m.bHide[b])) continue;
    const bb = b * 4, cx = (m.bBox[bb] + m.bBox[bb + 2]) / 2, cz = (m.bBox[bb + 1] + m.bBox[bb + 3]) / 2;
    const key = Math.floor(cx / LOD_CHUNK) * 4096 + Math.floor(cz / LOD_CHUNK);
    const st0 = buildingStyle(b, h), style = PHOTO_FACADE[st0] ? st0 : 'mid';
    let ch = chunks.get(key); if (!ch) chunks.set(key, ch = {});
    let gb = ch[style]; if (!gb) ch[style] = gb = { p: [], n: [], u: [], c: [], col: [] , roof: [] };
    const o0 = m.bOff[b], o1 = m.bOff[b + 1], n = o1 - o0, stepK = Math.max(1, Math.ceil(n / 14));
    const xs = [], zs = [];
    for (let i = o0; i < o1; i += stepK) { const dx = cx - m.bx[i], dz = cz - m.bz[i], L = Math.hypot(dx, dz) || 1; xs.push(m.bx[i] + dx / L * 0.3); zs.push(m.bz[i] + dz / L * 0.3); }
    if (xs.length < 3) continue;
    let area = 0; for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) area += xs[j] * zs[i] - xs[i] * zs[j];
    const sgn = area >= 0 ? 1 : -1, [tw, th] = FACADE_SIZE[style] || [24, 24], col = buildingColor(b, style);
    let per = 0;
    for (let k = 0; k < xs.length; k++) {
      const k2 = (k + 1) % xs.length, x0 = xs[k], z0 = zs[k], x1 = xs[k2], z1 = zs[k2], L = Math.hypot(x1 - x0, z1 - z0) || 1e-3;
      const nx_ = (z1 - z0) / L * sgn, nz_ = -(x1 - x0) / L * sgn, u0 = per / tw, u1 = (per + L) / tw, v1 = h / th;
      const V = (x, y, z, u, v) => { gb.p.push(x, y, z); gb.n.push(nx_, 0, nz_); gb.u.push(u, v); gb.c.push(cx, cz); gb.col.push(col.r, col.g, col.b); };
      V(x0, 0, z0, u0, 0); V(x1, 0, z1, u1, 0); V(x1, h, z1, u1, v1); V(x0, 0, z0, u0, 0); V(x1, h, z1, u1, v1); V(x0, h, z0, u0, v1);
      per += L;
    }
    // flat roof
    try {
      const v2 = xs.map((x, i) => new THREE.Vector2(x, zs[i])), faces = THREE.ShapeUtils.triangulateShape(v2, []);
      for (const f of faces) for (const i of f) gb.roof.push(xs[i], h, zs[i], cx, cz);
    } catch { /* skip odd outlines */ }
  }
  for (const ch of chunks.values()) for (const [style, gb] of Object.entries(ch)) {
    if (!gb.p.length) continue;
    if (!mats[style]) mats[style] = lodMaterial(MM.walls[style]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(gb.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(gb.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(gb.u, 2));
    g.setAttribute('aCtr', new THREE.Float32BufferAttribute(gb.c, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(gb.col, 3));
    g.computeBoundingSphere();
    const me = new THREE.Mesh(g, mats[style]); WORLD.group.add(me); WORLD.lod.push(me); me.userData.ctr = g.boundingSphere.center; me.userData.rad = g.boundingSphere.radius;
    if (gb.roof.length) {
      if (!mats._roof) mats._roof = lodMaterial(MM.roof);
      const rp = [], rn = [], rc = [], rcol = [], ruv = [];
      for (let i = 0; i < gb.roof.length; i += 5) { rp.push(gb.roof[i], gb.roof[i + 1], gb.roof[i + 2]); rn.push(0, 1, 0); rc.push(gb.roof[i + 3], gb.roof[i + 4]); rcol.push(0.32, 0.33, 0.34); ruv.push(gb.roof[i] / 6, gb.roof[i + 2] / 6); }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('normal', new THREE.Float32BufferAttribute(rn, 3));
      rg.setAttribute('aCtr', new THREE.Float32BufferAttribute(rc, 2)); rg.setAttribute('color', new THREE.Float32BufferAttribute(rcol, 3));
      rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
      rg.computeBoundingSphere();
      const rm = new THREE.Mesh(rg, mats._roof); WORLD.group.add(rm); WORLD.lod.push(rm); rm.userData.ctr = rg.boundingSphere.center; rm.userData.rad = rg.boundingSphere.radius;
    }
  }
}
// the square of tiles that are fully built: far blocks inside it are hidden (map.js calls this after streaming)
function setStreamBox(x0, z0, x1, z1) { WORLD.box.set(x0, z0, x1, z1); }
function setupWorld() {
  clearWorld();
  buildLandmarks();       // first: it marks the plain map blocks the landmark models replace
  buildTerrain();
  buildSkyline();
  updateTerrainLook();
}
function updateWorld() {
  // keep the plain filler under the camera (used only when there is no imagery)
  if (ground.visible) { ground.position.x = camera.position.x; ground.position.z = camera.position.z; }
  // far blocks past ~9 km are lost in the haze: skip them
  const cx = camera.position.x, cz = camera.position.z, lim = 9000 + camera.position.y * 8;
  for (const m of WORLD.lod) { const c = m.userData.ctr; if (c) m.visible = Math.hypot(c.x - cx, c.z - cz) - m.userData.rad < lim; }
  updateLandmarks();
}

// ---------------------------------------------------------------- facades
// Tall buildings use real photographed facades (ambientCG). Lower ones are composed here: a photo wall (siding,
// stucco, brick, concrete, cladding) with windows painted in at real bay and floor spacing, plus matching normal,
// roughness (glass is glossy and mirrors the sky) and night-light maps.
// [width, height] in metres covered by one repeat of each facade texture
const FACADE_SIZE = {
  glass: [30, 30.4], glass2: [36, 36], office: [28, 30.4], tower: [20, 21], brickt: [21, 22.4],
  house: [32, 24], mid: [28.8, 27.2], brick: [27.2, 26.4], industrial: [48, 36], stone: [32, 33.6], shop: [24, 4.5],
};
const PHOTO_FACADE = { glass: ['glass1', [10, 8]], glass2: ['glass2', [20, 20]], office: ['office', [9, 8]], tower: ['tower', null], brickt: ['brickt', null] };
function canvasTex(cv, srgb) { const t = new THREE.CanvasTexture(cv); t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4; return t; }
// lit windows at night for a photo facade with a regular cols x rows grid
function gridNightTex(cols, rows, share, seed) {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), r = mulberry(seed);
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const cw = S / cols, rh = S / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (r() > share) continue;
    const b = 150 + Math.floor(r() * 105), warm = r() < 0.75;
    g.fillStyle = warm ? `rgb(${b},${Math.floor(b * 0.86)},${Math.floor(b * 0.6)})` : `rgb(${Math.floor(b * 0.85)},${Math.floor(b * 0.92)},${b})`;
    // a lit room: brighter toward the ceiling, often half hidden by blinds
    const x0 = x * cw + 2, y0 = y * rh + 2, w = cw - 4, h = rh - 4, blind = r() < 0.5 ? h * (0.2 + r() * 0.6) : 0;
    g.fillRect(x0, y0 + blind, w, h - blind);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x0, y0 + blind + (h - blind) * 0.55, w, (h - blind) * 0.45);
    if (blind) { g.fillStyle = `rgba(${b},${Math.floor(b * 0.8)},${Math.floor(b * 0.5)},.25)`; g.fillRect(x0, y0, w, blind); }
  }
  return canvasTex(cv, true);
}
function composedFacade(style, city, seed) {
  // canvas = 8 bays x 8 floors
  const N = 8, S = 128, W = N * S, r = mulberry(seed);
  const [fw, fh] = FACADE_SIZE[style], bayW = fw / N, flH = fh / N, pxX = S / bayW, pxY = S / flH;
  const warmCity = city.key === 'la' || city.key === 'miami' || city.key === 'vegas';
  const base = { house: warmCity ? ['plaster', 3] : ['siding', 2.4], mid: [warmCity ? 'plaster' : 'concwall', 3],
    brick: ['brickwall', 2.2], stone: ['concwall', 3], industrial: ['corrugated', 2.2] }[style];
  const col = document.createElement('canvas'), nor = document.createElement('canvas'), rgh = document.createElement('canvas'), lit = document.createElement('canvas');
  for (const c of [col, nor, rgh, lit]) { c.width = c.height = W; }
  const gc = col.getContext('2d'), gn = nor.getContext('2d'), gr = rgh.getContext('2d'), gl = lit.getContext('2d');
  // photo base, tiled at real size; washed toward grey so each building's own colour shows through
  const img = TEX[base[0] + '_c'] && TEX[base[0] + '_c'].image, nimg = TEX[base[0] + '_n'] && TEX[base[0] + '_n'].image;
  const tw = base[1] * pxX, th = base[1] * pxY;
  gc.fillStyle = '#c8c8c8'; gc.fillRect(0, 0, W, W);
  if (img) {
    if ('filter' in gc) gc.filter = style === 'brick' ? 'grayscale(0.55) brightness(1.25) contrast(1.05)' : 'grayscale(0.85) brightness(1.18) contrast(1.1)';
    for (let y = 0; y < W; y += th) for (let x = 0; x < W; x += tw) gc.drawImage(img, x, y, tw + 1, th + 1);
    gc.filter = 'none';
  }
  gn.fillStyle = 'rgb(128,128,255)'; gn.fillRect(0, 0, W, W);
  if (nimg) for (let y = 0; y < W; y += th) for (let x = 0; x < W; x += tw) gn.drawImage(nimg, x, y, tw + 1, th + 1);
  gr.fillStyle = 'rgb(225,225,225)'; gr.fillRect(0, 0, W, W);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, W, W);
  const litShare = city.night ? 0.5 : city.dusk ? 0.35 : 0;
  // window: [x, y, w, h] in metres within a bay (y from the top of the floor)
  const win = { house: [0.9, 0.7, 1.6, 1.4], mid: [0.5, 0.6, 2.6, 1.7], brick: [0.95, 0.55, 1.4, 2.0], stone: [1.1, 0.6, 1.6, 2.5], industrial: [0.4, 0.5, 5.2, 1.0] }[style];
  for (let fy = 0; fy < N; fy++) for (let bx = 0; bx < N; bx++) {
    if (style === 'house' && r() < 0.3) continue;
    if (style === 'industrial' && fy % 2) continue;
    const x = bx * S + win[0] * pxX, y = fy * S + win[1] * pxY, w = win[2] * pxX, h = win[3] * pxY;
    // frame (light), glass with a sky reflection gradient, mullions, sill shadow
    gc.fillStyle = style === 'brick' || style === 'stone' ? '#e9e4da' : '#dcdcd8'; gc.fillRect(x - 4, y - 4, w + 8, h + 8);
    const gg = gc.createLinearGradient(0, y, 0, y + h); gg.addColorStop(0, '#8fa3b3'); gg.addColorStop(0.45, '#3b4854'); gg.addColorStop(1, '#1d242c');
    gc.fillStyle = gg; gc.fillRect(x, y, w, h);
    if (r() < 0.35) { gc.fillStyle = `rgba(${200 + r() * 40},${190 + r() * 40},${170 + r() * 40},.55)`; gc.fillRect(x + 2, y + 2, w - 4, h * (0.2 + r() * 0.5)); }   // blinds
    gc.fillStyle = 'rgba(255,255,255,.75)'; gc.fillRect(x + w / 2 - 1.5, y, 3, h); if (style !== 'industrial') gc.fillRect(x, y + h * 0.42, w, 3);
    gc.fillStyle = 'rgba(0,0,0,.35)'; gc.fillRect(x - 4, y + h + 4, w + 8, 5);
    if (style === 'stone') { gc.fillStyle = '#e9e4da'; gc.beginPath(); gc.arc(x + w / 2, y, w / 2 + 4, Math.PI, 0); gc.fill(); gc.fillStyle = '#3b4854'; gc.beginPath(); gc.arc(x + w / 2, y, w / 2, Math.PI, 0); gc.fill(); }
    // normal map: recessed glass (flat), frame edges catching light from above / below
    gn.fillStyle = 'rgb(128,128,255)'; gn.fillRect(x - 4, y - 4, w + 8, h + 8);
    gn.fillStyle = 'rgb(128,70,230)'; gn.fillRect(x, y, w, 4); gn.fillStyle = 'rgb(128,186,230)'; gn.fillRect(x, y + h - 4, w, 4);
    gn.fillStyle = 'rgb(70,128,230)'; gn.fillRect(x, y, 4, h); gn.fillStyle = 'rgb(186,128,230)'; gn.fillRect(x + w - 4, y, 4, h);
    gr.fillStyle = 'rgb(18,18,18)'; gr.fillRect(x, y, w, h);
    if (r() < litShare) { const b = 140 + Math.floor(r() * 115); gl.fillStyle = `rgb(${b},${Math.floor(b * 0.85)},${Math.floor(b * 0.55)})`; gl.fillRect(x, y, w, h); }
  }
  return { map: canvasTex(col, true), normalMap: canvasTex(nor, false), roughnessMap: canvasTex(rgh, false), emissiveMap: canvasTex(lit, true) };
}
// all the facade materials for the current city
function facadeMaterials() {
  const out = {}, night = C.night || C.dusk, low = quality === 'low';
  const disp = [];
  const mk = (st, maps, look) => {
    const em = night && maps.emissiveMap ? { emissive: '#ffe2b0', emissiveMap: maps.emissiveMap, emissiveIntensity: C.night ? 0.9 : 0.6 } : {};
    if (low) out[st] = new THREE.MeshLambertMaterial({ map: maps.map, vertexColors: true, side: THREE.DoubleSide, ...em });
    else {
      out[st] = new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normalMap || null, roughnessMap: maps.roughnessMap || null, vertexColors: true, side: THREE.DoubleSide,
        roughness: look[0], metalness: look[1], envMapIntensity: look[2], ...em });
      if (out[st].normalMap) out[st].normalScale.set(0.8, 0.8);
    }
  };
  for (const [st, [tex, grid]] of Object.entries(PHOTO_FACADE)) {
    const maps = { map: TEX[tex + '_c'] || null, normalMap: TEX[tex + '_n'] || null, roughnessMap: TEX[tex + '_r'] || null, emissiveMap: TEX[tex + '_e'] || null };
    if (night && grid) { maps.emissiveMap = gridNightTex(grid[0], grid[1], C.night ? 0.28 : 0.2, st.length * 97); disp.push(maps.emissiveMap); }
    const glassy = st === 'glass' || st === 'glass2' || st === 'office';
    mk(st, maps, glassy ? [1.0, 0.55, 1.4] : [1.0, 0.0, 0.7]);
  }
  for (const [i, st] of ['house', 'mid', 'brick', 'stone', 'industrial'].entries()) {
    const maps = composedFacade(st, { ...C, key: cityKey }, 1234 + i * 77); disp.push(maps.map, maps.normalMap, maps.roughnessMap, maps.emissiveMap);
    mk(st, maps, [1.0, st === 'industrial' ? 0.3 : 0.0, 0.9]);
  }
  {
    const [tw, tl] = shopTextures(C, 1234 + 6 * 77); disp.push(tw, tl);
    mk('shop', { map: tw, emissiveMap: tl }, [0.3, 0.15, 1.0]);
  }
  return { mats: out, disp };
}

// ---------------------------------------------------------------- trees from real leaves
// A crown is a few dozen crossed cards of a leafy-twig texture composed from scanned leaves (ambientCG LeafSet),
// lit with normals pointing out from the crown centre so the whole tree shades like a soft volume.
function leafClusterTex(kind) {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), r = mulberry(kind === 'maple' ? 11 : 23);
  const atlas = TEX[kind === 'maple' ? 'leaves2_c' : 'leaves1_c'], img = atlas && atlas.image;
  const cols = kind === 'maple' ? 2 : 3, rows = 2, cw = img ? img.width / cols : 1, ch = img ? img.height / rows : 1;
  g.clearRect(0, 0, S, S);
  g.strokeStyle = '#4a3a2a'; g.lineCap = 'round';
  const tips = [];
  for (let k = 0; k < 7; k++) {
    let x = S / 2 + (r() - 0.5) * 60, y = S - 10, a = -Math.PI / 2 + (r() - 0.5) * 1.6;
    g.lineWidth = 5; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 9; s++) { a += (r() - 0.5) * 0.35; x += Math.cos(a) * 32; y += Math.sin(a) * 32; g.lineTo(x, y); tips.push([x, y]); g.lineWidth = Math.max(1.2, 5 - s * 0.5); }
    g.stroke();
  }
  for (let i = 0; i < 150; i++) {
    const [tx, ty] = tips[Math.floor(r() * tips.length)];
    const x = tx + (r() - 0.5) * 70, y = ty + (r() - 0.5) * 70, s = 46 + r() * 34;
    if (x < 20 || y < 20 || x > S - 20 || y > S - 20) continue;
    g.save(); g.translate(x, y); g.rotate(r() * TAU);
    const shade = 0.55 + 0.45 * (1 - y / S) + (r() - 0.5) * 0.2;
    if ('filter' in g) g.filter = `brightness(${shade.toFixed(2)}) saturate(${(0.85 + r() * 0.3).toFixed(2)})`;
    if (img) { const c = Math.floor(r() * cols), rr = Math.floor(r() * rows); g.drawImage(img, c * cw, rr * ch, cw, ch, -s / 2, -s / 2, s, s); }
    else { g.fillStyle = '#4a7a3a'; g.beginPath(); g.ellipse(0, 0, s / 3, s / 5, 0, 0, TAU); g.fill(); }
    g.restore();
  }
  if ('filter' in g) g.filter = 'none';
  const t = canvasTex(cv, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function needleTex() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), r = mulberry(5);
  g.clearRect(0, 0, S, S);
  // fir boughs: a stem, sprays of needles to both sides
  for (let k = 0; k < 3; k++) {
    const y0 = S * (0.3 + k * 0.2);
    g.strokeStyle = '#3a2e22'; g.lineWidth = 3; g.beginPath(); g.moveTo(4, y0); g.lineTo(S - 8, y0 + (r() - 0.5) * 10); g.stroke();
    for (let i = 0; i < 520; i++) {
      const x = 6 + r() * (S - 16), side = r() < 0.5 ? -1 : 1, len = 10 + r() * 22 * (1 - x / S * 0.5);
      const gch = 70 + Math.floor(r() * 50), rch = 25 + Math.floor(r() * 25);
      g.strokeStyle = `rgb(${rch},${gch},${rch + 10})`; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x + len * 0.5, y0 + side * len); g.stroke();
    }
  }
  const t = canvasTex(cv, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function frondTex() {
  const W = 128, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), r = mulberry(9);
  g.clearRect(0, 0, W, H);
  g.strokeStyle = '#8a7a4a'; g.lineWidth = 4; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
  for (let y = 6; y < H - 6; y += 5) {
    const len = (W / 2 - 4) * Math.sin(Math.PI * (0.15 + 0.85 * y / H)) * (0.85 + r() * 0.15);
    for (const side of [-1, 1]) {
      const gch = 95 + Math.floor(r() * 45);
      g.strokeStyle = `rgb(${50 + Math.floor(r() * 30)},${gch},${40 + Math.floor(r() * 20)})`; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(W / 2, y); g.quadraticCurveTo(W / 2 + side * len * 0.6, y + 6, W / 2 + side * len, y + 18 + r() * 6); g.stroke();
    }
  }
  const t = canvasTex(cv, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
// merge geometries keeping uvs
function mergeUV(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
// broadleaf crown: cards scattered through an ellipsoid, normals from the centre
const leafCrownGeo = (() => {
  const r = mulberry(4), parts = [], cy = 5.0, RX = 2.6, RY = 2.1;
  for (let i = 0; i < 46; i++) {
    const th = r() * TAU, ph = Math.acos(2 * r() - 1), rad = 0.55 + 0.45 * Math.cbrt(r());
    const px = Math.sin(ph) * Math.cos(th) * RX * rad, py = Math.cos(ph) * RY * rad, pz = Math.sin(ph) * Math.sin(th) * RX * rad;
    const s = 1.7 + r() * 0.9, p = new THREE.PlaneGeometry(s, s);
    p.rotateX((r() - 0.5) * 1.2); p.rotateY(r() * Math.PI); p.rotateZ((r() - 0.5) * 0.8);
    p.translate(px, cy + py, pz);
    const pa = p.attributes.position, na = p.attributes.normal;
    for (let k = 0; k < pa.count; k++) { const nx = pa.getX(k), ny = pa.getY(k) - cy + 0.6, nz = pa.getZ(k), L = Math.hypot(nx, ny, nz) || 1; na.setXYZ(k, nx / L, ny / L, nz / L); }
    parts.push(p);
  }
  return mergeUV(parts);
})();
// fir: tiers of drooping boughs round the trunk, shorter toward the top
const firGeo = (() => {
  const r = mulberry(8), parts = [], tiers = 9;
  for (let k = 0; k < tiers; k++) {
    const y = 2.2 + k * 1.05, len = 2.6 * (1 - k / tiers) + 0.5, count = 7 - Math.floor(k / 3);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + k * 0.7 + r() * 0.4;
      const p = new THREE.PlaneGeometry(len, len * 0.7, 2, 1);
      const pa = p.attributes.position;
      for (let q = 0; q < pa.count; q++) { const x = pa.getX(q) + len / 2; pa.setXYZ(q, x, pa.getY(q), -0.35 * (x / len) ** 2 * len); }   // droop toward the tip
      p.rotateX(-Math.PI / 2 + 0.25); p.rotateY(-a); p.translate(0, y, 0);
      const na = p.attributes.normal, pp = p.attributes.position;
      for (let q = 0; q < pp.count; q++) { const nx = pp.getX(q), nz = pp.getZ(q), L = Math.hypot(nx, 0.8, nz) || 1; na.setXYZ(q, nx / L, 0.8 / L, nz / L); }
      parts.push(p);
    }
  }
  return mergeUV(parts);
})();
// palm fronds with uvs along each frond (the old crown shape, kept)
const palmFrondGeo = (() => {
  const parts = [];
  for (let i = 0; i < 14; i++) {
    const f = new THREE.PlaneGeometry(1.1, 3.6, 1, 10), p = f.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const v = (p.getY(k) + 1.8) / 3.6, w = p.getX(k);
      p.setXYZ(k, w * (1 - v * 0.5), 0.3 * Math.sin(v * Math.PI) - 1.6 * v * v, v * 3.6);
    }
    f.rotateX(-0.15 + (i % 3) * 0.12); f.rotateY(i / 14 * TAU + (i % 2) * 0.2); f.translate(0.5, 9.2, 0);
    f.computeVertexNormals();
    const na = f.attributes.normal; for (let k = 0; k < na.count; k++) { if (na.getY(k) < 0) na.setXYZ(k, -na.getX(k), -na.getY(k), -na.getZ(k)); }
    parts.push(f);
  }
  return mergeUV(parts);
})();
const barkTrunkGeo = (() => {
  const t = new THREE.CylinderGeometry(0.13, 0.26, 3.6, 10, 1, true); t.translate(0, 1.8, 0);
  const b1 = new THREE.CylinderGeometry(0.05, 0.1, 1.9, 6, 1, true); b1.rotateZ(0.75); b1.translate(0.55, 3.5, 0);
  const b2 = new THREE.CylinderGeometry(0.05, 0.09, 1.7, 6, 1, true); b2.rotateZ(-0.7); b2.rotateY(1.9); b2.translate(-0.35, 3.7, 0.4);
  const b3 = new THREE.CylinderGeometry(0.04, 0.08, 1.6, 6, 1, true); b3.rotateX(0.75); b3.rotateY(-0.8); b3.translate(0.2, 3.9, -0.5);
  const g = mergeUV([t, b1, b2, b3]); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 3);
  return g;
})();
const palmTrunkGeo = (() => {
  const parts = []; let x = 0;
  for (let k = 0; k < 6; k++) {
    const g = new THREE.CylinderGeometry(0.16 - k * 0.008, 0.21 - k * 0.008, 1.55, 10, 1, true); g.translate(0, 0.78, 0);
    g.rotateZ(-0.03 * k); g.translate(x, k * 1.5, 0); x += 0.05 * k; parts.push(g);
  }
  const g = mergeUV(parts); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 2);
  return g;
})();
const firTrunkGeo = (() => { const t = new THREE.CylinderGeometry(0.1, 0.3, 11, 8, 1, true); t.translate(0, 5.5, 0); const g = mergeUV([t]); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 6); return g; })();
// alpha-tested foliage material, with a matching depth material so leaf shadows have holes in them
// Front-yard hedges, garden walls and bushes (placed along residential streets in map.js). A hedge is built in 2 m
// modules: an opaque leafy core box with leaf cards poking out of its sides and top, so the edges read as foliage.
const hedgeCoreGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const hedgeLeafGeo = (() => {
  const r = mulberry(77), parts = [];
  for (let i = 0; i < 34; i++) {
    const f = i % 5, s = 0.38 + r() * 0.22, p = new THREE.PlaneGeometry(s, s);
    p.rotateX((r() - 0.5) * 0.9); p.rotateZ(r() * TAU);
    let x = (r() - 0.5) * 0.95, y = 0.12 + r() * 0.82, z = (r() - 0.5) * 0.9;
    if (f === 0) { p.rotateX(-Math.PI / 2); y = 1.0 + r() * 0.04; }
    else if (f === 1) z = 0.5; else if (f === 2) { p.rotateY(Math.PI); z = -0.5; }
    else if (f === 3) { p.rotateY(Math.PI / 2); x = 0.5; } else { p.rotateY(-Math.PI / 2); x = -0.5; }
    p.translate(x, y, z);
    const pa = p.attributes.position, na = p.attributes.normal;
    for (let k = 0; k < pa.count; k++) { const nx = pa.getX(k), ny = pa.getY(k) - 0.3, nz = pa.getZ(k), L = Math.hypot(nx, ny, nz) || 1; na.setXYZ(k, nx / L, ny / L, nz / L); }
    parts.push(p);
  }
  return mergeUV(parts);
})();
// garden wall: a stucco wall module, and a pillar with a cap at each end of a lot
const gardenWallGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const gardenPillarGeo = (() => { const a = new THREE.BoxGeometry(0.42, 1, 0.42).translate(0, 0.5, 0), b = new THREE.BoxGeometry(0.52, 0.08, 0.52).translate(0, 1.04, 0); return mergeUV([a, b]); })();
// the hedge's core: dark leafy green with the leaf cluster drawn all over it (opaque)
function hedgeTexture(leafTex) {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), r = mulberry(31); g.fillStyle = '#2c4422'; g.fillRect(0, 0, S, S);
  const img = leafTex && leafTex.image;
  if (img) for (let k = 0; k < 70; k++) { const s = 60 + r() * 70, x = r() * S, y = r() * S; for (const [ox, oy] of [[0, 0], [-S, 0], [0, -S], [-S, -S]]) g.drawImage(img, x + ox - s / 2, y + oy - s / 2, s, s); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
function foliageMaterial(map) {
  const low = quality === 'low';
  const m = low ? new THREE.MeshLambertMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, metalness: 0, envMapIntensity: 0.6 });
  m.userData.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.45, side: THREE.DoubleSide });
  return m;
}
