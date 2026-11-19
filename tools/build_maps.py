"""Build Wheelie City map files from OpenStreetMap extracts.

Usage:  python tools/build_maps.py <osm-dir> [city ...]

Reads <osm-dir>/<Extract>.osm.pbf (BBBike / Geofabrik extracts) and writes
wheelie-city/maps/<city>.js, which calls WC_MAP(key, meta, base64-gzip-binary).

Game coordinates: metres, gx = west (+) / east (-), gz = north (+), around each city's centre.
Map data (c) OpenStreetMap contributors, ODbL.
"""
import base64, gzip, json, math, os, pickle, sys
import numpy as np
import osmium
from PIL import Image, ImageDraw
from scipy import ndimage

CITIES = {
    # key: extract, bbox (lon0, lat0, lon1, lat1), spawn (lat, lon, heading-ish street), admin levels
    'van':   dict(src='Vancouver.osm.pbf',  bbox=(-123.27, 49.115, -122.88, 49.33), spawn=(49.2833, -123.1207)),   # Granville & Robson
    'la':    dict(src='LosAngeles.osm.pbf', bbox=(-118.498, 33.98, -118.22, 34.13), spawn=(34.1016, -118.3387)),   # Hollywood & Highland
    'vegas': dict(src='Nevada.osm.pbf',     bbox=(-115.25, 36.07, -115.10, 36.20), spawn=(36.1147, -115.1728)),    # The Strip at Flamingo
    'miami': dict(src='Miami.osm.pbf',      bbox=(-80.30, 25.70, -80.12, 25.855), spawn=(25.7810, -80.1310)),      # Ocean Dr, South Beach
    'nyc':   dict(src='NewYork.osm.pbf',    bbox=(-74.05, 40.68, -73.90, 40.83), spawn=(40.7580, -73.9855)),       # Times Square
}

ROAD = {'motorway': 0, 'trunk': 1, 'primary': 2, 'secondary': 3, 'tertiary': 4, 'unclassified': 5, 'residential': 6,
        'living_street': 7, 'service': 8, 'motorway_link': 9, 'trunk_link': 10, 'primary_link': 11, 'secondary_link': 12,
        'tertiary_link': 13, 'pedestrian': 14, 'cycleway': 15, 'footway': 16, 'path': 16}
RES = 4.0          # landcover raster, metres per cell
MRES = 25.0        # municipality raster
U = 4              # coordinate units per metre (0.25 m)

# landcover codes
L_NONE, L_WATER, L_GRASS, L_FOREST, L_SAND, L_PAVED, L_YARD = 0, 1, 2, 3, 4, 5, 6
LANDCOVER = [
    (L_YARD,   lambda t: t.get('landuse') in ('residential',)),
    (L_PAVED,  lambda t: t.get('landuse') in ('commercial', 'retail', 'industrial', 'railway', 'construction', 'garages')
                         or t.get('amenity') in ('parking',) or t.get('place') == 'square'
                         or (t.get('highway') == 'pedestrian' and t.get('area') == 'yes')),
    (L_GRASS,  lambda t: t.get('leisure') in ('park', 'garden', 'pitch', 'golf_course', 'recreation_ground', 'playground', 'dog_park', 'common')
                         or t.get('landuse') in ('grass', 'meadow', 'cemetery', 'village_green', 'recreation_ground', 'allotments')
                         or t.get('natural') in ('grassland', 'heath')),
    (L_FOREST, lambda t: t.get('landuse') == 'forest' or t.get('natural') in ('wood', 'scrub')),
    (L_SAND,   lambda t: t.get('natural') in ('beach', 'sand')),
    (L_WATER,  lambda t: t.get('natural') == 'water' or t.get('waterway') in ('riverbank', 'dock') or t.get('landuse') in ('reservoir', 'basin')),
]


def dp(pts, tol):
    """Douglas-Peucker on a list of (x, z, ...) tuples; keeps endpoints."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, az = pts[a][0], pts[a][1]; bx, bz = pts[b][0], pts[b][1]
        dx, dz = bx - ax, bz - az; L = math.hypot(dx, dz) or 1e-9
        best, bi = -1, -1
        for i in range(a + 1, b):
            d = abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L
            if d > best: best, bi = d, i
        if best > tol:
            keep[bi] = True; stack.append((a, bi)); stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def parse_m(v):
    if not v: return None
    v = v.strip().lower().replace(',', '.')
    try:
        if v.endswith('ft') or "'" in v:
            return float(v.replace('ft', '').replace("'", '').strip()) * 0.3048
        return float(v.split()[0].replace('m', ''))
    except ValueError:
        return None


class Handler(osmium.SimpleHandler):
    def __init__(self, proj, inbox):
        super().__init__()
        self.proj, self.inbox = proj, inbox
        self.ways, self.rail, self.coast = [], [], []
        self.signals, self.trees, self.places = set(), [], []
        self.buildings, self.land, self.admin = [], [], []

    def node(self, n):
        t = n.tags
        if not t: return
        hw = t.get('highway')
        if hw == 'traffic_signals':
            self.signals.add(n.id); return
        loc = n.location
        if not loc.valid(): return
        if t.get('natural') == 'tree':
            x, z = self.proj(loc.lon, loc.lat)
            if self.inbox(x, z, 0): self.trees.append((x, z))
        elif t.get('place') in ('city', 'town', 'village', 'suburb', 'neighbourhood', 'quarter', 'borough') and t.get('name'):
            x, z = self.proj(loc.lon, loc.lat)
            if self.inbox(x, z, 3000): self.places.append((t.get('name'), t.get('place'), round(x), round(z)))

    def pts(self, nodes):
        out = []
        for nd in nodes:
            loc = nd.location
            if not loc.valid(): return None
            x, z = self.proj(loc.lon, loc.lat)
            out.append((x, z, nd.ref))
        return out

    def way(self, w):
        t = w.tags
        hw = t.get('highway')
        if hw in ROAD:
            if hw == 'service' and t.get('service') not in (None, 'alley'): return
            if hw == 'footway' and t.get('footway') in ('sidewalk', 'crossing'): return
            if t.get('area') == 'yes' or t.get('access') in ('private', 'no') and hw not in ('service',): return
            p = self.pts(w.nodes)
            if not p or not any(self.inbox(x, z, 150) for x, z, _ in p): return
            ow = t.get('oneway', '')
            oneway = ow in ('yes', '1', 'true') or t.get('junction') in ('roundabout', 'circular') or (hw in ('motorway', 'motorway_link') and ow != 'no')
            if ow == '-1': p.reverse(); oneway = True
            if hw in ('footway', 'path', 'cycleway', 'pedestrian'): oneway = False
            try: lanes = max(0, min(15, int(float((t.get('lanes') or '0').split(';')[0]))))
            except ValueError: lanes = 0
            flags = (1 if oneway else 0) | (2 if t.get('bridge') not in (None, 'no') else 0) | (4 if t.get('tunnel') not in (None, 'no') else 0) \
                | (8 if t.get('junction') in ('roundabout', 'circular') else 0)
            self.ways.append((ROAD[hw], flags, lanes, t.get('name') or '', t.get('ref') or '', p))
        elif t.get('railway') in ('light_rail', 'subway', 'monorail', 'rail') and t.get('bridge') not in (None, 'no') and t.get('tunnel') in (None, 'no'):
            p = self.pts(w.nodes)
            if p and any(self.inbox(x, z, 150) for x, z, _ in p): self.rail.append(p)
        elif t.get('natural') == 'coastline':
            p = self.pts(w.nodes)
            if p: self.coast.append([(x, z) for x, z, _ in p])

    def area(self, a):
        t = a.tags
        if 'building' in t and t.get('building') not in ('no', 'roof', 'construction'):
            for ring in a.outer_rings():
                p = [self.proj(n.lon, n.lat) for n in ring]
                if len(p) < 4 or not self.inbox(p[0][0], p[0][1], 50): break
                self.buildings.append((p[:-1], dict(t)))
                break
            return
        if t.get('boundary') == 'administrative' and t.get('admin_level') in ('7', '8') and t.get('name'):
            rings = [[self.proj(n.lon, n.lat) for n in ring] for ring in a.outer_rings()]
            self.admin.append((t.get('name'), int(t.get('admin_level')), rings))
            return
        for code, test in LANDCOVER:
            if test(t):
                for outer in a.outer_rings():
                    o = [self.proj(n.lon, n.lat) for n in outer]
                    inners = [[self.proj(n.lon, n.lat) for n in inner] for inner in a.inner_rings(outer)]
                    self.land.append((code, o, inners))
                return


def build(key, osmdir):
    cfg = CITIES[key]
    lon0, lat0, lon1, lat1 = cfg['bbox']
    clon, clat = (lon0 + lon1) / 2, (lat0 + lat1) / 2
    klon = 111320.0 * math.cos(math.radians(clat)); klat = 110540.0

    def proj(lon, lat):
        return (-(lon - clon) * klon, (lat - clat) * klat)

    gx0, gx1 = sorted([proj(lon0, clat)[0], proj(lon1, clat)[0]])
    gz0, gz1 = proj(clon, lat0)[1], proj(clon, lat1)[1]

    def inbox(x, z, m):
        return gx0 - m <= x <= gx1 + m and gz0 - m <= z <= gz1 + m

    cache = os.path.join(osmdir, f'{key}.parsed.pickle')
    h = Handler(proj, inbox)
    if os.path.exists(cache) and os.path.getmtime(cache) > os.path.getmtime(os.path.join(osmdir, cfg['src'])):
        print(f'[{key}] using cached parse', flush=True)
        with open(cache, 'rb') as f:
            for k_, v_ in pickle.load(f).items(): setattr(h, k_, v_)
    else:
        print(f'[{key}] reading {cfg["src"]} ...', flush=True)
        h.apply_file(os.path.join(osmdir, cfg['src']), locations=True, idx='flex_mem')
        with open(cache, 'wb') as f:
            pickle.dump({k_: getattr(h, k_) for k_ in ('ways', 'rail', 'coast', 'signals', 'trees', 'places', 'buildings', 'land', 'admin')}, f)
    print(f'[{key}] ways {len(h.ways)} buildings {len(h.buildings)} land {len(h.land)} coast {len(h.coast)} rail {len(h.rail)} trees {len(h.trees)} places {len(h.places)} admin {len(h.admin)}', flush=True)

    # ---------- road graph: split ways at shared nodes
    use = {}
    for w in h.ways:
        p = w[5]
        for i, (_, _, nid) in enumerate(p):
            use[nid] = use.get(nid, 0) + (2 if i == 0 or i == len(p) - 1 else 1)
    gidx, nodes = {}, []
    def gnode(x, z, nid):
        if nid not in gidx:
            gidx[nid] = len(nodes); nodes.append((x, z, 1 if nid in h.signals else 0))
        return gidx[nid]
    names, nameIdx = [''], {'': 0}
    def sidx(s):
        if s not in nameIdx: nameIdx[s] = len(names); names.append(s)
        return nameIdx[s]
    edges = []      # (a, b, cls, flags, lanes, name, ref, interior pts)
    pending_sig = []
    for cls, flags, lanes, name, ref, p in h.ways:
        start = 0
        for i in range(1, len(p)):
            if use.get(p[i][2], 0) >= 2 or i == len(p) - 1:
                seg = p[start:i + 1]
                if any(inbox(x, z, 120) for x, z, _ in seg):
                    a = gnode(*seg[0]); b = gnode(*seg[-1])
                    if a != b or len(seg) > 2:
                        sigs = [q for q in seg[1:-1] if q[2] in h.signals]
                        inner = dp(seg, 0.35)[1:-1]
                        edges.append((a, b, cls, flags, lanes, sidx(name), sidx(ref), [(x, z) for x, z, _ in inner]))
                        for s in sigs: pending_sig.append((s, a, b))
                start = i
    # signals mapped on the approach rather than the junction node: move to the nearer end
    nodes = [list(n) for n in nodes]
    for (x, z, _), a, b in pending_sig:
        da = math.hypot(nodes[a][0] - x, nodes[a][1] - z); db = math.hypot(nodes[b][0] - x, nodes[b][1] - z)
        tgt, dd = (a, da) if da < db else (b, db)
        if dd < 35: nodes[tgt][2] = 1
    print(f'[{key}] graph nodes {len(nodes)} edges {len(edges)} signals {sum(n[2] for n in nodes)}', flush=True)

    # ---------- buildings
    def bkind(t):
        b = t.get('building', 'yes')
        if b in ('house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'residential', 'garage', 'garages', 'shed', 'cabin', 'hut', 'carport'): return 1
        if b in ('apartments', 'dormitory', 'hotel'): return 2
        if b in ('commercial', 'retail', 'office', 'supermarket', 'kiosk', 'mall'): return 3
        if b in ('industrial', 'warehouse', 'manufacture', 'service', 'hangar', 'storage_tank'): return 4
        if b in ('church', 'cathedral', 'school', 'university', 'college', 'hospital', 'civic', 'public', 'government', 'train_station', 'transportation', 'stadium', 'museum', 'library', 'fire_station'): return 5
        return 0
    DEF_H = {0: 8, 1: 7, 2: 14, 3: 9, 4: 9, 5: 12}
    bl = []
    for ring, t in h.buildings:
        far = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)
        if far == 0: continue
        ring = dp(ring[:far + 1], 0.5)[:-1] + dp(ring[far:] + [ring[0]], 0.5)[:-1]
        if len(ring) < 3: continue
        area = 0.5 * abs(sum(ring[i][0] * ring[i - 1][1] - ring[i - 1][0] * ring[i][1] for i in range(len(ring))))
        if area < 18: continue
        k = bkind(t)
        ht = parse_m(t.get('height'))
        if ht is None:
            lv = parse_m(t.get('building:levels'))
            ht = lv * 3.2 + 1.5 if lv else DEF_H[k] + (0 if area < 400 else min(10, area / 300))
        ht = max(2.5, min(600, ht))
        if len(ring) > 60: ring = ring[:60]
        bl.append((ring, k, ht))
    print(f'[{key}] buildings kept {len(bl)}', flush=True)

    # ---------- landcover raster
    W = int(math.ceil((gx1 - gx0) / RES)); H = int(math.ceil((gz1 - gz0) / RES))
    img = Image.new('L', (W, H), L_NONE); dr = ImageDraw.Draw(img)
    pix = lambda x, z: ((x - gx0) / RES, (z - gz0) / RES)
    order = {L_YARD: 0, L_PAVED: 1, L_GRASS: 2, L_FOREST: 3, L_SAND: 4, L_WATER: 5}
    for code, o, inners in sorted(h.land, key=lambda q: order[q[0]]):
        if len(o) < 3: continue
        dr.polygon([pix(x, z) for x, z in o], fill=code)
        for inner in inners:
            if len(inner) >= 3: dr.polygon([pix(x, z) for x, z in inner], fill=L_NONE)
    lc = np.array(img, dtype=np.uint8)
    if h.coast:
        bar = Image.new('1', (W, H), 0); bd = ImageDraw.Draw(bar)
        wseed, lseed = [], []
        for line in h.coast:
            P = [pix(x, z) for x, z in line]
            bd.line(P, fill=1, width=2)
            for (x0, z0), (x1, z1) in zip(line, line[1:]):
                dx, dz = x1 - x0, z1 - z0; L = math.hypot(dx, dz)
                if L < 1: continue
                # OSM coastline: land on the left, water on the right (in east/north terms).
                # In (gx, gz) with gx = -east, the water (right-hand) side is (-dz, dx).
                nx, nz = -dz / L, dx / L
                for s in np.arange(0, L, 12):
                    mx, mz = x0 + dx * s / L, z0 + dz * s / L
                    wseed.append(pix(mx + nx * 12, mz + nz * 12)); lseed.append(pix(mx - nx * 12, mz - nz * 12))
        barrier = np.array(bar, dtype=bool)
        lab, nlab = ndimage.label(~barrier)
        votes = np.zeros((nlab + 1, 2), dtype=np.int64)
        def vote(pts, col, wgt=1):
            for px, pz in pts:
                ix, iz = int(px), int(pz)
                if 0 <= ix < W and 0 <= iz < H: votes[lab[iz, ix], col] += wgt
        vote(wseed, 0); vote(lseed, 1)
        land_pts = []
        for e in edges:
            if e[3] & 2: continue
            for q in [nodes[e[0]][:2]] + e[7]: land_pts.append(pix(*q))
        for ring, _, _ in bl[::3]: land_pts.append(pix(*ring[0]))
        vote(land_pts, 1, 3)
        water_lab = np.where(votes[:, 0] > votes[:, 1])[0]
        water_lab = water_lab[water_lab > 0]
        sea = np.isin(lab, water_lab)
        lc[sea] = L_WATER
        print(f'[{key}] coastline components {nlab}, sea components {len(water_lab)}', flush=True)
    # RLE rows: [value, run] uint16 pairs
    rle = []
    for row in lc:
        ch = np.flatnonzero(np.diff(row.astype(np.int16))) + 1
        starts = np.concatenate(([0], ch)); ends = np.concatenate((ch, [W]))
        for s, e in zip(starts, ends):
            run = e - s
            while run > 0:
                r = min(run, 65535); rle.append((int(row[s]), r)); run -= r
    rle = np.array(rle, dtype=np.uint16).reshape(-1)

    # ---------- municipality raster
    MW = int(math.ceil((gx1 - gx0) / MRES)); MH = int(math.ceil((gz1 - gz0) / MRES))
    mimg = Image.new('L', (MW, MH), 0); md = ImageDraw.Draw(mimg)
    munis = ['']
    def ring_area(r): return 0.5 * abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r))))
    adm = sorted(h.admin, key=lambda a: -sum(ring_area(r) for r in a[2]))
    for name, lvl, rings in adm:
        if name not in munis: munis.append(name)
        for r in rings:
            if len(r) >= 3: md.polygon([((x - gx0) / MRES, (z - gz0) / MRES) for x, z in r], fill=munis.index(name))
    muni = np.array(mimg, dtype=np.uint8)

    # ---------- elevated rail: chain bridge segments into runs
    runs = [[(x, z) for x, z, _ in p] for p in h.rail]
    merged = True
    while merged:
        merged = False
        ends = {}
        for i, r in enumerate(runs):
            ends.setdefault((round(r[0][0], 1), round(r[0][1], 1)), []).append((i, 0))
            ends.setdefault((round(r[-1][0], 1), round(r[-1][1], 1)), []).append((i, 1))
        used = set()
        out = []
        for i, r in enumerate(runs):
            if i in used: continue
            used.add(i); cur = list(r)
            grew = True
            while grew:
                grew = False
                for end in (1, 0):
                    k = (round(cur[-1][0], 1), round(cur[-1][1], 1)) if end else (round(cur[0][0], 1), round(cur[0][1], 1))
                    for j, je in ends.get(k, []):
                        if j in used: continue
                        o = runs[j] if (je == 0) == bool(end) else runs[j][::-1]
                        cur = cur + o[1:] if end else o[:-1] + cur
                        used.add(j); grew = merged = True; break
            out.append(cur)
        runs = out
    runs = [dp(r, 0.6) for r in runs if len(r) >= 2]

    # ---------- spawn
    sx, sz = proj(cfg['spawn'][1], cfg['spawn'][0])

    # ---------- pack binary (all sections 4-byte aligned)
    secs, blob = {}, bytearray()
    def add(name, arr):
        nonlocal blob
        while len(blob) % 4: blob += b'\0'
        a = np.ascontiguousarray(arr)
        secs[name] = [len(blob), int(a.size), str(a.dtype)]
        blob += a.tobytes()
    q = lambda v: int(round(v * U))
    add('nodes', np.array([q(c) for n in nodes for c in n[:2]], dtype=np.int32))
    add('nodeFlags', np.array([n[2] for n in nodes], dtype=np.uint8))
    eInfo, ePts = [], []
    for a, b, cls, flags, lanes, nm, rf, inner in edges:
        prev = nodes[a][:2]; start = len(ePts) // 2
        for x, z in inner + [nodes[b][:2]]:
            dx, dz = q(x) - q(prev[0]), q(z) - q(prev[1])
            while abs(dx) > 32000 or abs(dz) > 32000:      # split giant jumps
                sx_, sz_ = int(dx / 2), int(dz / 2)
                ePts += [sx_, sz_]; dx -= sx_; dz -= sz_
            ePts += [dx, dz]; prev = (x, z)
        eInfo += [a, b, start, len(ePts) // 2 - start, cls | (flags << 8) | (lanes << 16), nm | (rf << 16)]
    add('edges', np.array(eInfo, dtype=np.int32).reshape(-1))
    add('ePts', np.array(ePts, dtype=np.int16))
    bInfo, bPts = [], []
    for ring, k, ht in bl:
        start = len(bPts) // 2
        x0, z0 = q(ring[0][0]), q(ring[0][1]); px, pz = x0, z0
        ok = True; tmp = []
        for x, z in ring[1:]:
            dx, dz = q(x) - px, q(z) - pz
            if abs(dx) > 32000 or abs(dz) > 32000: ok = False; break
            tmp += [dx, dz]; px, pz = q(x), q(z)
        if not ok: continue
        bPts += tmp
        bInfo += [x0, z0, start, len(ring) - 1, int(round(ht * 4)) | (k << 16)]
    add('buildings', np.array(bInfo, dtype=np.int32))
    add('bPts', np.array(bPts, dtype=np.int16))
    tr = sorted(h.trees)
    add('trees', np.array([q(c) for t in tr for c in t], dtype=np.int32))
    rInfo, rPts = [], []
    for r in runs:
        rInfo += [len(rPts) // 2, len(r)]
        for x, z in r: rPts += [q(x), q(z)]
    add('rail', np.array(rInfo, dtype=np.int32)); add('rPts', np.array(rPts, dtype=np.int32))
    add('land', rle)
    add('muni', muni.reshape(-1))

    meta = dict(key=key, bbox=[gx0, gz0, gx1, gz1], center=[clat, clon], res=RES, W=W, H=H, mres=MRES, MW=MW, MH=MH, unit=1 / U,
                names=names, munis=munis, places=sorted(set(h.places)), spawn=[sx, sz], secs=secs)
    gz_ = gzip.compress(bytes(blob), 9)
    b64 = base64.b64encode(gz_).decode('ascii')
    outdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wheelie-city', 'maps')
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, f'{key}.js'), 'w', encoding='utf-8') as f:
        f.write('/* Map data (c) OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright */\n')
        f.write(f'WC_MAP({json.dumps(key)},{json.dumps(meta, separators=(",", ":"), ensure_ascii=False)},"{b64}");\n')
    print(f'[{key}] raw {len(blob) / 1e6:.1f} MB, gzip {len(gz_) / 1e6:.1f} MB, file {len(b64) / 1e6:.1f} MB '
          f'(nodes {len(nodes)}, edges {len(edges)}, buildings {len(bInfo) // 5}, trees {len(tr)}, rail runs {len(runs)}, land rle {rle.size // 2})', flush=True)


if __name__ == '__main__':
    osmdir = sys.argv[1]
    for k in (sys.argv[2:] or list(CITIES)):
        build(k, osmdir)
