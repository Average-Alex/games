// Pedestrian models for Wheelie City, from Quaternius' Universal Base Characters and Universal Animation Library
// (both CC0, https://quaternius.com). Strips them to what the game needs, as small web files:
//   wheelie-city/assets/people/{male,female}.glb   body, eyes, brows (no textures: the game adds its own)
//   wheelie-city/assets/people/hair_<name>.glb     hairstyles rigged to the head bone
//   wheelie-city/assets/people/anims.glb           the skeleton and the clips peds use (no mesh)
//   wheelie-city/assets/people/*.jpg               skin, hair and eye textures, 1024 px (see build_textures.py)
// Usage (from tools/people, after `npm install`):  node build_people.mjs <unzipped packs folder>
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample } from '@gltf-transform/functions';
import path from 'node:path';
import fs from 'node:fs';

const SRC = process.argv[2] || 'C:/Users/alexd/games-osm/human-dl';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../../wheelie-city/assets/people');
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO();
const BASE = path.join(SRC, 'base/Universal Base Characters[Standard]');

// read a .gltf without its images (some referenced texture files aren't in the pack, and the game brings its own)
async function readNoImages(file) {
  if (file.endsWith('.glb')) return io.read(file);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete json.images; delete json.textures; delete json.samplers;
  for (const m of json.materials || []) {
    const p = m.pbrMetallicRoughness || {};
    delete p.baseColorTexture; delete p.metallicRoughnessTexture;
    delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture; delete m.extensions;
  }
  const resources = {};
  for (const b of json.buffers || []) resources[b.uri] = new Uint8Array(fs.readFileSync(path.join(path.dirname(file), decodeURIComponent(b.uri))));
  return io.readJSON({ json, resources });
}
async function strip(file, out, keepAnims = null, dropMeshes = false) {
  const doc = await readNoImages(file);
  const root = doc.getRoot();
  for (const t of root.listTextures()) t.dispose();
  // (dispose the samplers and their keyframe data too, or they stay in the file)
  const drop = (a) => { for (const s of a.listSamplers()) { s.dispose(); } for (const c of a.listChannels()) c.dispose(); a.dispose(); };
  for (const a of root.listAnimations()) if (!keepAnims || !keepAnims.includes(a.getName())) drop(a);
  if (dropMeshes) for (const n of root.listNodes()) { n.setMesh(null); n.setSkin(null); }
  if (keepAnims) {
    // fingers stay in their bind pose, and only the pelvis moves (other bones just rotate): that is most of the data
    for (const a of root.listAnimations()) for (const ch of a.listChannels()) {
      const n = ch.getTargetNode(), name = n ? n.getName() : '', p = ch.getTargetPath();
      if (/^(index|middle|ring|pinky|thumb)_|_leaf/.test(name) || p === 'scale' || (p === 'translation' && name !== 'pelvis' && name !== 'root')) { const s = ch.getSampler(); s.dispose(); ch.dispose(); }
    }
  }
  await doc.transform(prune(), dedup(), ...(keepAnims ? [resample({ tolerance: 2e-4 })] : []), prune());
  await io.write(path.join(OUT, out), doc);
  console.log(out, (fs.statSync(path.join(OUT, out)).size / 1024).toFixed(0), 'KB');
}

const bodies = path.join(BASE, 'Base Characters/Godot - UE');
await strip(path.join(bodies, 'Superhero_Male_FullBody.gltf'), 'male.glb');
await strip(path.join(bodies, 'Superhero_Female_FullBody.gltf'), 'female.glb');
const hairDir = path.join(BASE, 'Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)');
for (const h of ['Hair_SimpleParted', 'Hair_Buzzed', 'Hair_Long', 'Hair_Buns', 'Hair_BuzzedFemale', 'Hair_Beard']) {
  await strip(path.join(hairDir, h + '.gltf'), h.toLowerCase() + '.glb');
}
await strip(path.join(SRC, 'anim/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb'), 'anims.glb',
  ['Walk_Loop', 'Walk_Formal_Loop', 'Idle_Loop', 'Idle_Talking_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Hit_Chest', 'Hit_Head', 'Death01', 'Dance_Loop',
    // on foot: fighting, the pistol, and the shopkeeper
    'Punch_Jab', 'Punch_Cross', 'Sword_Attack', 'Pistol_Idle_Loop', 'Pistol_Aim_Neutral', 'Pistol_Shoot', 'Interact', 'Roll', 'Crouch_Idle_Loop', 'Driving_Loop'], true);
