"""Real aviation places for Wheelie City: airports (aerodromes), their runways and aprons, heliports and helipads
(rooftop ones too), from the same OpenStreetMap extracts the maps are built from. Written in map coordinates.

    python tools/extract_air.py C:/Users/alexd/games-osm [city]     -> wheelie-city/maps/air_<city>.json
"""
import json
import math
import os
import sys

import osmium

sys.path.insert(0, os.path.dirname(__file__))
from build_maps import CITIES  # noqa: E402  (same extracts and bounding boxes)

OUT = os.path.join(os.path.dirname(__file__), '..', 'wheelie-city', 'maps')


class AirHandler(osmium.SimpleHandler):
    def __init__(self, bbox):
        super().__init__()
        self.bbox = bbox
        self.aerodromes, self.runways, self.aprons, self.helipads = [], [], [], []

    def inside(self, lon, lat):
        lon0, lat0, lon1, lat1 = self.bbox
        return lon0 <= lon <= lon1 and lat0 <= lat <= lat1

    def node(self, n):
        a = n.tags.get('aeroway')
        if a not in ('helipad', 'heliport', 'aerodrome') or not n.location.valid() or not self.inside(n.location.lon, n.location.lat):
            return
        rec = {'lon': n.location.lon, 'lat': n.location.lat, 'name': n.tags.get('name', ''), 'kind': a}
        (self.aerodromes if a == 'aerodrome' else self.helipads).append(rec)

    def way(self, w):
        a = w.tags.get('aeroway')
        if a not in ('runway', 'apron', 'helipad', 'heliport', 'aerodrome'):
            return
        try:
            pts = [(nd.lon, nd.lat) for nd in w.nodes if nd.location.valid()]
        except osmium.InvalidLocationError:
            return
        if len(pts) < 2 or not any(self.inside(*p) for p in pts):
            return
        cx, cy = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
        if a == 'runway':
            # the two ends: the farthest-apart pair of points
            best = max(((p, q) for p in pts for q in pts), key=lambda pq: (pq[0][0] - pq[1][0]) ** 2 + ((pq[0][1] - pq[1][1]) * 1.5) ** 2)
            w_m = float(w.tags.get('width', '45').split()[0].replace(',', '.') or 45) if w.tags.get('width', '').replace('.', '', 1).isdigit() else 45.0
            self.runways.append({'a': best[0], 'b': best[1], 'width': w_m, 'ref': w.tags.get('ref', '')})
        elif a == 'apron':
            self.aprons.append({'lon': cx, 'lat': cy, 'pts': pts})
        elif a == 'aerodrome':
            self.aerodromes.append({'lon': cx, 'lat': cy, 'name': w.tags.get('name', ''), 'kind': a})
        else:
            self.helipads.append({'lon': cx, 'lat': cy, 'name': w.tags.get('name', ''), 'kind': a})


def run(osm_dir, key):
    cfg = CITIES[key]
    lon0, lat0, lon1, lat1 = cfg['bbox']
    clon, clat = (lon0 + lon1) / 2, (lat0 + lat1) / 2
    klon = 111320.0 * math.cos(math.radians(clat))
    klat = 110540.0

    def proj(lon, lat):                      # same as build_maps.py
        return [round(-(lon - clon) * klon, 1), round((lat - clat) * klat, 1)]

    h = AirHandler(cfg['bbox'])
    h.apply_file(os.path.join(osm_dir, cfg['src']), locations=True)
    out = {
        'aerodromes': [dict(zip(('x', 'z'), proj(r['lon'], r['lat'])), name=r['name']) for r in h.aerodromes],
        'runways': [{'a': proj(*r['a']), 'b': proj(*r['b']), 'width': r['width'], 'ref': r['ref']} for r in h.runways],
        'aprons': [{'c': proj(r['lon'], r['lat']), 'pts': [proj(*p) for p in r['pts']]} for r in h.aprons],
        'helipads': [dict(zip(('x', 'z'), proj(r['lon'], r['lat'])), name=r['name'], kind=r['kind']) for r in h.helipads],
    }
    path = os.path.join(OUT, f'air_{key}.json')
    with open(path, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f"{key}: {len(out['aerodromes'])} airfields, {len(out['runways'])} runways, {len(out['aprons'])} aprons, {len(out['helipads'])} helipads -> {path}")


if __name__ == '__main__':
    osm_dir = sys.argv[1]
    for k in (sys.argv[2:] or list(CITIES)):
        run(osm_dir, k)
