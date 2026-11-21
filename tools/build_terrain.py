"""Real terrain and satellite imagery around each Wheelie City map.

The streets are flat (the game world is at y = 0), but past the edge of the map the real landscape rises: the North
Shore mountains over Vancouver, the Santa Monica and San Gabriel mountains round LA, the Spring Mountains behind
Vegas. Far away from the player the ground is drawn from real satellite imagery, so the city keeps its real shape and
colours (parks, water, rooftops) past the streamed streets.

Sources:
  Elevation: AWS Terrain Tiles (Mapzen terrarium encoding; SRTM, GMTED, NRCan CDEM, USGS NED ...).
  Imagery:   US cities: USGS The National Map orthoimagery (public domain).
             Vancouver: Sentinel-2 cloudless 2024 by EOX IT Services GmbH (CC BY-NC-SA 4.0), contains modified
             Copernicus Sentinel data 2024. Gaps outside the US: Sentinel-2 cloudless 2016 (CC BY 4.0).

Output: wheelie-city/terrain/<city>.js  (WC_TERRAIN(key, meta, base64 gzip Int16 heights))
        wheelie-city/terrain/<city>_far.jpg (imagery of the whole terrain box)
        wheelie-city/terrain/<city>_near.jpg (sharper imagery of the map itself)

  games-tools-venv/Scripts/python.exe tools/build_terrain.py [city ...]
"""
import base64, gzip, io, json, math, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wheelie-city', 'terrain')
CACHE = os.path.join(os.path.expanduser('~'), 'games-osm', 'terrain-cache')
UA = {'User-Agent': 'wheelie-city-terrain/1.0'}

# map bbox (same as build_maps.py), how far past it the terrain reaches (deg lon, deg lat), whether it has relief
CITIES = {
    'van':   ((-123.27, 49.115, -122.88, 49.33), (0.34, 0.26), True),
    'la':    ((-118.498, 33.98, -118.22, 34.13), (0.32, 0.26), True),
    'vegas': ((-115.25, 36.07, -115.10, 36.20), (0.36, 0.28), True),
    'miami': ((-80.30, 25.70, -80.12, 25.855), (0.14, 0.12), False),
    'nyc':   ((-74.05, 40.68, -73.90, 40.83), (0.16, 0.12), True),
}
STEP = 200.0          # height grid spacing (m)
RAMP = 1500.0         # heights fade to 0 over this distance outside the map, so the flat city meets the hills


def get(url):
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, url.split('://')[1].replace('/', '_'))
    if os.path.exists(fn):
        return open(fn, 'rb').read()
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                d = r.read()
            open(fn, 'wb').write(d)
            return d
        except Exception as e:
            err = e
    raise err


def merc(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def mosaic(url_fmt, z, lon0, lat0, lon1, lat1, decode):
    x0, y0 = merc(lon0, lat1, z); x1, y1 = merc(lon1, lat0, z)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    jobs = [(tx, ty) for ty in range(ty0, ty1 + 1) for tx in range(tx0, tx1 + 1)]
    with ThreadPoolExecutor(8) as ex:
        datas = list(ex.map(lambda j: get(url_fmt.format(z=z, x=j[0], y=j[1])), jobs))
    first = decode(datas[0]); ts = first.shape[0]
    img = np.zeros(((ty1 - ty0 + 1) * ts, (tx1 - tx0 + 1) * ts) + first.shape[2:], first.dtype)
    for (tx, ty), d in zip(jobs, datas):
        a = decode(d)
        img[(ty - ty0) * ts:(ty - ty0 + 1) * ts, (tx - tx0) * ts:(tx - tx0 + 1) * ts] = a
    return img, tx0, ty0, ts


def sampler(img, tx0, ty0, ts, z):
    """Sample a mercator mosaic at arrays of lon/lat (bilinear)."""
    def f(lon, lat, order=1):
        n = 2 ** z
        x = (lon + 180) / 360 * n
        y = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / np.pi) / 2 * n
        px = (x - tx0) * ts - 0.5; py = (y - ty0) * ts - 0.5
        if img.ndim == 2:
            return map_coordinates(img, [py, px], order=order, mode='nearest')
        return np.stack([map_coordinates(img[..., c], [py, px], order=order, mode='nearest') for c in range(img.shape[2])], -1)
    return f


def dec_terrarium(d):
    a = np.asarray(Image.open(io.BytesIO(d)).convert('RGB')).astype(np.float32)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def dec_rgb(d):
    return np.asarray(Image.open(io.BytesIO(d)).convert('RGB'))


def build(key):
    (lon0, lat0, lon1, lat1), (elon, elat), relief = CITIES[key]
    clon, clat = (lon0 + lon1) / 2, (lat0 + lat1) / 2
    klon = 111320.0 * math.cos(math.radians(clat)); klat = 110540.0
    # game coordinates: x = west+, z = north+ (metres from the map centre)
    gx = lambda lon: -(lon - clon) * klon
    gz = lambda lat: (lat - clat) * klat
    L0, A0, L1, A1 = lon0 - elon, lat0 - elat, lon1 + elon, lat1 + elat
    xs_w, xs_e = gx(L0), gx(L1)          # west edge has the larger x
    z_s, z_n = gz(A0), gz(A1)
    nx = int(math.ceil((xs_w - xs_e) / STEP)) + 1; nz = int(math.ceil((z_n - z_s) / STEP)) + 1
    X = xs_e + np.arange(nx) * STEP; Z = z_s + np.arange(nz) * STEP
    XX, ZZ = np.meshgrid(X, Z)
    LON = clon - XX / klon; LAT = clat + ZZ / klat
    # distance outside the map box (0 inside)
    bx_e, bx_w, bz_s, bz_n = gx(lon1), gx(lon0), gz(lat0), gz(lat1)
    dx = np.maximum(np.maximum(bx_e - XX, XX - bx_w), 0); dz = np.maximum(np.maximum(bz_s - ZZ, ZZ - bz_n), 0)
    dout = np.hypot(dx, dz)
    if relief:
        img, tx0, ty0, ts = mosaic('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', 11, L0, A0, L1, A1, dec_terrarium)
        H = sampler(img, tx0, ty0, ts, 11)(LON, LAT)
        H = np.maximum(H, 0)
        t = np.clip(dout / RAMP, 0, 1); H = H * t * t * (3 - 2 * t)
    else:
        H = np.zeros_like(XX)
    print(f'[{key}] heights {nx}x{nz}, max {H.max():.0f} m', flush=True)

    os.makedirs(OUT, exist_ok=True)
    # imagery: the whole box, and the map itself sharper. US cities: USGS National Map imagery (public domain,
    # aerial, cloud free). Vancouver: Sentinel-2 cloudless 2024 (the 2016 mosaic, CC BY, still has cloud patches).
    src = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg' if key == 'van' else \
        'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'
    def render(lo0, la0, lo1, la1, z, size, fn):
        img, tx0, ty0, ts = mosaic(src, z, lo0, la0, lo1, la1, dec_rgb)
        img = img.astype(np.float32)
        if key != 'van':
            # USGS has no tiles outside the US: fill the gaps from Sentinel-2 cloudless 2016 (CC BY 4.0)
            hole = img.sum(-1) < 6
            if hole.any():
                fb, _, _, _ = mosaic('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg', z, lo0, la0, lo1, la1, dec_rgb)
                img[hole] = fb.astype(np.float32)[hole] * 0.9
        f = sampler(img, tx0, ty0, ts, z)
        w = (gx(lo0) - gx(lo1)); h = (gz(la1) - gz(la0))
        W_ = size if w >= h else int(size * w / h); H_ = size if h >= w else int(size * h / w)
        # pixel (i, j): column i from the east edge (x small) to the west (x large), row j from north to south
        ii, jj = np.meshgrid(np.arange(W_), np.arange(H_))
        x = gx(lo1) + (ii + 0.5) / W_ * w; zz = gz(la1) - (jj + 0.5) / H_ * h
        rgb = f(clon - x / klon, clat + zz / klat)
        # Sentinel-2 cloudless is a little dark and flat for a sunlit scene: lift it gently
        if key == 'van': rgb = (rgb / 255.0) ** 0.92 * 1.04 * 255
        rgb = np.clip(rgb, 0, 255).astype(np.uint8)
        Image.fromarray(rgb).save(os.path.join(OUT, fn), quality=84, optimize=True, progressive=True)
        print(f'[{key}] {fn} {W_}x{H_} ({w / W_:.1f} m/px)', flush=True)
        return {'x0': gx(lo1), 'x1': gx(lo0), 'z0': gz(la0), 'z1': gz(la1)}
    far = render(L0, A0, L1, A1, 12, 2048, f'{key}_far.jpg')
    m = 0.02
    near = render(lon0 - m, lat0 - m, lon1 + m, lat1 + m, 14, 4096, f'{key}_near.jpg')
    fa = np.asarray(Image.open(os.path.join(OUT, f'{key}_far.jpg')).convert('RGB').resize((16, 16), Image.BOX)) / 255.0
    far['avg'] = [round(float(v), 4) for v in fa.reshape(-1, 3).mean(0)]
    meta = {'x0': float(X[0]), 'z0': float(Z[0]), 'step': STEP, 'nx': nx, 'nz': nz, 'far': far, 'near': near,
            'box': {'x0': bx_e, 'x1': bx_w, 'z0': bz_s, 'z1': bz_n}}
    q = np.clip(np.round(H), 0, 32767).astype('<i2')
    b64 = base64.b64encode(gzip.compress(q.tobytes(), 9)).decode()
    with open(os.path.join(OUT, f'{key}.js'), 'w') as f:
        f.write(f'WC_TERRAIN({json.dumps(key)},{json.dumps(meta)},"{b64}");\n')
    print(f'[{key}] terrain js {len(b64) // 1024} KB', flush=True)


if __name__ == '__main__':
    for k in sys.argv[1:] or list(CITIES):
        build(k)
