"""Download and prepare the photo textures and skies used by Wheelie City (all CC0).

Sources: Poly Haven (polyhaven.com) and ambientCG (ambientcg.com), both CC0 / public domain.
Output: wheelie-city/assets/tex/<name>_{c,n,r,e}.jpg (colour, normal (OpenGL), roughness, night emission)
        wheelie-city/assets/sky/<name>.jpg (equirectangular, tone mapped from the HDR) + sky.json (sun direction)

  games-tools-venv/Scripts/python.exe tools/fetch_assets.py
"""
import io, json, os, sys, urllib.request, zipfile
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wheelie-city', 'assets')
CACHE = os.path.join(os.path.expanduser('~'), 'games-osm', 'asset-cache')
UA = {'User-Agent': 'wheelie-city-asset-fetch/1.0'}

# name: (source, id, size, maps). maps: c colour, n normal, r roughness
TEXTURES = {
    'asphalt':   ('acg', 'Asphalt031', 1024, 'cnr'),
    'sidewalk':  ('ph', 'concrete_pavement_02', 1024, 'cnr'),
    'grass':     ('acg', 'Grass004', 1024, 'cn'),
    'brickwall': ('ph', 'brick_wall_001', 1024, 'cn'),
    'plaster':   ('ph', 'plastered_wall_02', 512, 'cn'),
    'siding':    ('ph', 'exterior_wall_cladding_03', 512, 'cn'),
    'concwall':  ('ph', 'concrete_wall_008', 512, 'cn'),
    'corrugated': ('ph', 'corrugated_iron', 512, 'cn'),
    'roofgravel': ('ph', 'bitumen', 512, 'cn'),
    'rooftiles': ('ph', 'grey_roof_tiles', 512, 'cn'),
    'bark':      ('ph', 'bark_brown_02', 512, 'cn'),
    'palmbark':  ('ph', 'palm_bark', 512, 'cn'),
    'leaves1':   ('acg', 'LeafSet009', 1024, 'c'),
    'leaves2':   ('acg', 'LeafSet010', 1024, 'c'),
    'glass1':    ('acg', 'Facade001', 1024, 'cnr'),
    'glass2':    ('acg', 'Facade005', 1024, 'cnr'),
    'office':    ('acg', 'Facade006', 1024, 'cnr'),
    'tower':     ('acg', 'Facade019A', 1024, 'cn'),
    'brickt':    ('acg', 'Facade018A', 1024, 'cn'),
    'brickt2':   ('acg', 'Facade020A', 1024, 'cn'),
    'denim':     ('ph', 'denim_fabric', 512, 'cn'),
    'jersey':    ('ph', 'cotton_jersey', 512, 'cn'),
    'leather':   ('ph', 'fabric_leather_02', 512, 'cn'),
    'rubber':    ('ph', 'rubber_tiles', 512, 'n'),
}
# Night windows for the brick/concrete towers: the lit ("B") photo minus the daytime ("A") photo
NIGHT = {'tower': 'Facade019B', 'brickt': 'Facade018B', 'brickt2': 'Facade020B'}

SKIES = {
    'clear_van': 'kloofendal_48d_partly_cloudy_puresky',
    'cloudy': 'kloofendal_overcast_puresky',
    'storm': 'overcast_soil_puresky',
    'mist': 'kloofendal_misty_morning_puresky',
    'sunset_la': 'qwantani_sunset_puresky',
    'night_vegas': 'qwantani_night_puresky',
    'clear_miami': 'table_mountain_1_puresky',
    'dusk_nyc': 'qwantani_dusk_2_puresky',
    'day_la': 'qwantani_afternoon_puresky',      # LA in the daytime: clear blue, the sun well up
    'day_vegas': 'qwantani_noon_puresky',        # desert noon
    'day_nyc': 'kloofendal_43d_clear_puresky',   # a clear midday

}


def get(url):
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, url.replace('://', '_').replace('/', '_').replace('?', '_').replace('=', '_')[-150:])
    if os.path.exists(fn):
        return open(fn, 'rb').read()
    print('  get', url, flush=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
        d = r.read()
    open(fn, 'wb').write(d)
    return d


def save(img, name, size, q=84):
    img = img.convert('RGB')
    if img.size != (size, size):
        img = img.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(ROOT, 'tex', name + '.jpg'), quality=q, optimize=True, progressive=True)


def acg_maps(aid, res='1K'):
    z = zipfile.ZipFile(io.BytesIO(get(f'https://ambientcg.com/get?file={aid}_{res}-JPG.zip')))
    out = {}
    for n in z.namelist():
        u = n.upper()
        for key, tag in (('c', '_COLOR'), ('n', '_NORMALGL'), ('r', '_ROUGHNESS'), ('o', '_OPACITY')):
            if tag in u and (u.endswith('.JPG') or u.endswith('.PNG')):
                out[key] = Image.open(io.BytesIO(z.read(n)))
    return out


def ph_maps(pid):
    files = json.loads(get(f'https://api.polyhaven.com/files/{pid}'))
    out = {}
    for key, names in (('c', ('Diffuse', 'diff')), ('n', ('nor_gl',)), ('r', ('Rough', 'rough'))):
        for nm in names:
            if nm in files:
                res = '1k' if '1k' in files[nm] else sorted(files[nm])[0]
                out[key] = Image.open(io.BytesIO(get(files[nm][res]['jpg']['url'])))
                break
    return out


def textures():
    os.makedirs(os.path.join(ROOT, 'tex'), exist_ok=True)
    for name, (src, aid, size, maps) in TEXTURES.items():
        print(name, aid, flush=True)
        m = acg_maps(aid) if src == 'acg' else ph_maps(aid)
        for k in maps:
            if k not in m:
                print('   missing map', k); continue
            img = m[k]
            if name.startswith('leaves') and k == 'c':
                # leaf atlas: keep the opacity in a PNG so leaves can be cut out
                op = m.get('o')
                rgba = img.convert('RGB').resize((size, size), Image.LANCZOS)
                a = (op.convert('L') if op else img.convert('L').point(lambda v: 255 if v > 12 else 0)).resize((size, size), Image.LANCZOS)
                rgba.putalpha(a)
                rgba.save(os.path.join(ROOT, 'tex', f'{name}_c.png'), optimize=True)
                continue
            save(img, f'{name}_{k}', size, 80 if k != 'c' else 84)
        if name in NIGHT:
            a = np.asarray(m['c'].convert('RGB').resize((size, size), Image.LANCZOS)).astype(np.float32)
            b = np.asarray(acg_maps(NIGHT[name])['c'].convert('RGB').resize((size, size), Image.LANCZOS)).astype(np.float32)
            lum = lambda x: x[..., 0] * 0.3 + x[..., 1] * 0.59 + x[..., 2] * 0.11
            k_ = np.clip((lum(b) - lum(a) - 18) / 60, 0, 1)[..., None]
            e = np.clip(b * k_ * 1.25, 0, 255).astype(np.uint8)
            save(Image.fromarray(e), f'{name}_e', size, 80)


def read_hdr(data):
    """Radiance .hdr (RGBE, new-style RLE) to float32 HxWx3."""
    f = io.BytesIO(data)
    while True:
        line = f.readline().strip()
        if line.startswith(b'-Y'):
            _, h, _, w = line.split(); h, w = int(h), int(w); break
    img = np.zeros((h, w, 4), np.uint8)
    buf = f.read(); p = 0
    for y in range(h):
        if buf[p] == 2 and buf[p + 1] == 2:
            p += 4
            for c in range(4):
                x = 0
                while x < w:
                    n = buf[p]; p += 1
                    if n > 128:
                        n -= 128; img[y, x:x + n, c] = buf[p]; p += 1
                    else:
                        img[y, x:x + n, c] = np.frombuffer(buf[p:p + n], np.uint8); p += n
                    x += n
        else:
            img[y] = np.frombuffer(buf[p:p + w * 4], np.uint8).reshape(w, 4); p += w * 4
    e = img[..., 3].astype(np.int32)
    scale = np.where(e == 0, 0, np.ldexp(1.0, e - 136)).astype(np.float32)
    return img[..., :3].astype(np.float32) * scale[..., None]


def skies():
    os.makedirs(os.path.join(ROOT, 'sky'), exist_ok=True)
    sp = os.path.join(ROOT, 'sky', 'sky.json')
    meta = json.load(open(sp)) if os.path.exists(sp) else {}
    for name, pid in SKIES.items():
        # (only the ones not fetched yet; delete a sky's .jpg to fetch it again)
        if name in meta and os.path.exists(os.path.join(ROOT, 'sky', f'{name}.jpg')): continue
        print(name, pid, flush=True)
        files = json.loads(get(f'https://api.polyhaven.com/files/{pid}'))
        hdr = read_hdr(get(files['hdri']['4k']['hdr']['url']))
        H, W, _ = hdr.shape
        # the sun: the brightest spot, found on a blurred luminance to skip single hot pixels
        lum = hdr[..., 0] * 0.2126 + hdr[..., 1] * 0.7152 + hdr[..., 2] * 0.0722
        small = lum[: H // 2].reshape(H // 16, 8, W // 8, 8).mean(axis=(1, 3))
        sy, sx = np.unravel_index(np.argmax(small), small.shape)
        u = (sx + 0.5) / small.shape[1]; v = (sy + 0.5) / (H // 8)
        # same convention as three.js equirectUv: u = atan(z, x) / 2pi + 0.5, v (from the top) = 0.5 - elevation / pi
        az = (u - 0.5) * 2 * np.pi; el = (0.5 - v) * np.pi
        sun = [float(np.cos(az) * np.cos(el)), float(np.sin(el)), float(np.sin(az) * np.cos(el))]
        peak = float(np.percentile(lum[: H // 2], 99.9))
        # tone map for display: exposure so the sky (not the sun) sits mid-high, then filmic curve, then sRGB
        med = float(np.median(lum[: H // 2])) or 1e-3
        x = hdr * (0.42 / med)
        a, b, c, d, e_ = 2.51, 0.03, 2.43, 0.59, 0.14
        x = np.clip((x * (a * x + b)) / (x * (c * x + d) + e_), 0, 1)
        x = np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)
        img = Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8))
        img = img.resize((4096, 2048), Image.LANCZOS)
        img.save(os.path.join(ROOT, 'sky', f'{name}.jpg'), quality=86, optimize=True, progressive=True)
        meta[name] = {'sun': [round(s, 4) for s in sun], 'peak': round(peak / med, 1), 'src': pid}
        print('   sun', meta[name]['sun'], 'contrast', meta[name]['peak'], flush=True)
    json.dump(meta, open(os.path.join(ROOT, 'sky', 'sky.json'), 'w'), indent=1)


def averages():
    """Average colour (sRGB 0-1) of each colour texture and the horizon colour of each sky, so the game doesn't
    have to read pixels back from the GPU at load (slow on low-end machines)."""
    out = {}
    tdir = os.path.join(ROOT, 'tex')
    for fn in sorted(os.listdir(tdir)):
        if fn.endswith('_c.jpg') or fn.endswith('_c.png'):
            a = np.asarray(Image.open(os.path.join(tdir, fn)).convert('RGB').resize((16, 16), Image.BOX)) / 255.0
            out[fn.rsplit('.', 1)[0]] = [round(float(v), 4) for v in a.reshape(-1, 3).mean(0)]
    json.dump(out, open(os.path.join(tdir, 'avg.json'), 'w'), indent=0)
    sp = os.path.join(ROOT, 'sky', 'sky.json')
    if os.path.exists(sp):
        meta = json.load(open(sp))
        for name in meta:
            a = np.asarray(Image.open(os.path.join(ROOT, 'sky', name + '.jpg')).convert('RGB').resize((64, 32), Image.BOX)) / 255.0
            meta[name]['horizon'] = [round(float(v), 4) for v in a[13:16].reshape(-1, 3).mean(0)]
        json.dump(meta, open(sp, 'w'), indent=1)


if __name__ == '__main__':
    what = sys.argv[1:] or ['textures', 'skies']
    if 'textures' in what: textures()
    if 'skies' in what: skies()
    averages()
