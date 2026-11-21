"""Fetch building heights from Overture Maps (open data: OSM + Microsoft/Google ML + Esri community heights).

OpenStreetMap leaves most buildings in Vancouver and Las Vegas without a height, so they were drawn at a guessed
8-20 m. Overture's building layer adds estimated heights for many of them. This writes, per city, a compact table of
building centroids with height and floor count that build_maps.py joins onto OSM outlines that have no height.

  games-tools-venv/Scripts/python.exe tools/overture_heights.py C:/Users/alexd/games-osm [city ...]
"""
import os, sys, pickle, time
import duckdb

RELEASE = '2026-11-18.0'
BBOX = {
    'van': (-123.27, 49.115, -122.88, 49.33),
    'la': (-118.498, 33.98, -118.22, 34.13),
    'vegas': (-115.25, 36.07, -115.10, 36.20),
    'miami': (-80.30, 25.70, -80.12, 25.855),
    'nyc': (-74.05, 40.68, -73.90, 40.83),
}


def fetch(key, outdir):
    x0, y0, x1, y1 = BBOX[key]
    con = duckdb.connect()
    for s in ('INSTALL httpfs', 'LOAD httpfs', 'INSTALL spatial', 'LOAD spatial', "SET s3_region='us-west-2'"):
        con.execute(s)
    t = time.time()
    rows = con.execute(f"""
        SELECT ST_X(ST_Centroid(geometry)) AS lon, ST_Y(ST_Centroid(geometry)) AS lat,
               height, num_floors, roof_shape, roof_height, min_height,
               (bbox.xmax - bbox.xmin) * (bbox.ymax - bbox.ymin) AS barea
        FROM read_parquet('s3://overturemaps-us-west-2/release/{RELEASE}/theme=buildings/type=building/*', hive_partitioning=1)
        WHERE bbox.xmin > {x0} AND bbox.xmax < {x1} AND bbox.ymin > {y0} AND bbox.ymax < {y1}
          AND (height IS NOT NULL OR num_floors IS NOT NULL)
    """).fetchall()
    print(f'[{key}] {len(rows)} buildings with a height in {time.time() - t:.0f}s', flush=True)
    with open(os.path.join(outdir, f'{key}.overture.pickle'), 'wb') as f:
        pickle.dump(rows, f)


if __name__ == '__main__':
    outdir = sys.argv[1]
    for k in sys.argv[2:] or list(BBOX):
        fetch(k, outdir)
