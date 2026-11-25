// Export a Wheelie City map (wheelie-city/maps/<city>.js) to a plain binary file the Unreal version reads.
//   node tools/export_unreal.mjs <city> <out.wcm>
// Same streets, buildings and trees as the browser game. Units: centimetres. Unreal X = game x, Unreal Y = game z
// (seen from above that's a rotation, not a mirror, so the city isn't flipped).
//
// Layout (little-endian):
//   "WCM1" | u32 version=1 | f32 spawnX, spawnY
//   u32 nRoads,  then each: u8 class, u8 flags, u8 lanes, u8 0, f32 halfWidth, u32 nPts, nPts x (f32 x, f32 y)
//   u32 nBlds,   then each: u8 kind, u8 flags, u8 material, u8 0, f32 height, i32 colour (-1 none), u32 nPts, pts
//   u32 nTrees,  then nTrees x (f32 x, f32 y)
//   u32 nNames,  then each: u16 byteLen, utf8 bytes   (road names, indexed by the u16 that follows each road's flags... see below)
//   u32 nRoads again, then nRoads x u16 nameIndex
import fs from 'node:fs';
import zlib from 'node:zlib';

const [city, outPath] = process.argv.slice(2);
if (!city || !outPath) { console.error('usage: node tools/export_unreal.mjs <city> <out.wcm>'); process.exit(1); }
const src = fs.readFileSync(new URL(`../wheelie-city/maps/${city}.js`, import.meta.url), 'utf8');
// WC_MAP("key", {meta}, "base64")
const m0 = src.indexOf('WC_MAP(');
const args = src.slice(m0 + 7, src.lastIndexOf(')'));
const firstComma = args.indexOf(',');
const lastComma = args.lastIndexOf(',');
const meta = JSON.parse(args.slice(firstComma + 1, lastComma));
const b64 = JSON.parse(args.slice(lastComma + 1).trim());
const buf = zlib.gunzipSync(Buffer.from(b64, 'base64'));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const T = { int32: Int32Array, int16: Int16Array, uint8: Uint8Array, uint16: Uint16Array };
const sec = (n) => { const [o, len, dt] = meta.secs[n]; return new T[dt](ab, o, len); };
const u = meta.unit, CM = 100;

// road classes: lanes, lane width, parking, shoulder, highway (same table as map.js RC)
const RC = [
  [3, 3.7, 0, 1.8, 1], [4, 3.6, 0, 1.2, 1], [4, 3.4, 2.2, 0, 0], [2, 3.4, 2.2, 0, 0], [2, 3.3, 2.2, 0, 0], [2, 3.1, 1.0, 0, 0],
  [2, 3.0, 1.2, 0, 0], [2, 2.8, 0.6, 0, 0], [1, 4.8, 0, 0, 0], [1, 3.8, 0, 1.2, 1], [1, 3.7, 0, 0.8, 1],
];
const F_ONEWAY = 1;

const out = [];
const w = {
  u8: (v) => { const b = Buffer.alloc(1); b.writeUInt8(v & 255); out.push(b); },
  u16: (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v & 0xffff); out.push(b); },
  u32: (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); out.push(b); },
  i32: (v) => { const b = Buffer.alloc(4); b.writeInt32LE(v | 0); out.push(b); },
  f32: (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v); out.push(b); },
};
out.push(Buffer.from('WCM1', 'ascii')); w.u32(1);
w.f32(meta.spawn[0] * CM); w.f32(meta.spawn[1] * CM);

// nodes and road polylines
const nI = sec('nodes'), N = nI.length / 2, nx = new Float64Array(N), nz = new Float64Array(N);
for (let i = 0; i < N; i++) { nx[i] = nI[2 * i] * u; nz[i] = nI[2 * i + 1] * u; }
const E = sec('edges'), nE = E.length / 6, dp = sec('ePts'), roadNames = [];
w.u32(nE);
for (let e = 0; e < nE; e++) {
  const a = E[6 * e], st = E[6 * e + 2], cnt = E[6 * e + 3], info = E[6 * e + 4], nm = E[6 * e + 5];
  const cls = info & 255, fl = (info >> 8) & 255, lanesTag = (info >> 16) & 255;
  const R = RC[cls] || RC[6], one = fl & F_ONEWAY, lanes = lanesTag || (one && R[0] > 2 && !R[4] ? R[0] / 2 : R[0]);
  const hw = lanes * R[1] / 2 + (one ? R[2] * 0.5 : R[2]) + R[3];
  w.u8(cls); w.u8(fl); w.u8(lanes); w.u8(0); w.f32(hw * CM); w.u32(cnt + 1);
  let x = nx[a], z = nz[a];
  w.f32(x * CM); w.f32(z * CM);
  for (let k = 0; k < cnt; k++) { x += dp[2 * (st + k)] * u; z += dp[2 * (st + k) + 1] * u; w.f32(x * CM); w.f32(z * CM); }
  roadNames.push(nm & 0xffff);
}

// buildings
const BS = meta.version >= 2 ? 7 : 5, bI = sec('buildings'), bp = sec('bPts'), nB = bI.length / BS;
w.u32(nB);
for (let b = 0; b < nB; b++) {
  let x = bI[BS * b] * u, z = bI[BS * b + 1] * u;
  const st = bI[BS * b + 2], cnt = bI[BS * b + 3], hk = bI[BS * b + 4];
  const ex = BS === 7 ? bI[BS * b + 5] : 0, colour = BS === 7 ? bI[BS * b + 6] : -1;
  w.u8(hk >>> 16); w.u8((ex >>> 24) & 255); w.u8((ex >>> 16) & 255); w.u8(0);
  w.f32((hk & 0xffff) / 4 * CM); w.i32(colour); w.u32(cnt + 1);
  w.f32(x * CM); w.f32(z * CM);
  for (let k = 0; k < cnt; k++) { x += bp[2 * (st + k)] * u; z += bp[2 * (st + k) + 1] * u; w.f32(x * CM); w.f32(z * CM); }
}

// trees
const tI = sec('trees'), nT = tI.length / 2;
w.u32(nT);
for (let i = 0; i < nT; i++) { w.f32(tI[2 * i] * u * CM); w.f32(tI[2 * i + 1] * u * CM); }

// road names
w.u32(meta.names.length);
for (const s of meta.names) { const b = Buffer.from(s || '', 'utf8'); w.u16(b.length); out.push(b); }
w.u32(nE); for (const n of roadNames) w.u16(n);

fs.writeFileSync(outPath, Buffer.concat(out));
console.log(`${city}: ${nE} roads, ${nB} buildings, ${nT} trees -> ${outPath} (${(fs.statSync(outPath).size / 1e6).toFixed(1)} MB)`);
