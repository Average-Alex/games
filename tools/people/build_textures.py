"""Textures for the Wheelie City pedestrians (Quaternius Universal Base Characters, CC0), resized to web JPGs.

  games-tools-venv/Scripts/python.exe tools/people/build_textures.py <unzipped packs folder>
"""
import os, sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else 'C:/Users/alexd/games-osm/human-dl'
T = os.path.join(SRC, 'base', 'Universal Base Characters[Standard]', 'Base Characters', 'Textures')
GL = os.path.join(T, 'Normals Unity - Godot')        # OpenGL-style normal maps (what three.js expects)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'wheelie-city', 'assets', 'people')
os.makedirs(OUT, exist_ok=True)

JOBS = [
    ('male_light_c', T, 'T_Superhero_Male_Ligh.png', 1024),
    ('male_dark_c', T, 'T_Superhero_Male_Dark.png', 1024),
    ('female_light_c', T, 'T_Superhero_Female_Light_BaseColor.png', 1024),
    ('female_dark_c', T, 'T_Superhero_Female_Dark_BaseColor.png', 1024),
    ('male_n', GL, 'T_Superhero_Male_Normal.png', 1024),
    ('female_n', GL, 'T_Superhero_Female_Normal.png', 1024),
    ('hair1_c', T, 'T_Hair_1_BaseColor.png', 512),
    ('hair2_c', T, 'T_Hair_2_BaseColor.png', 512),
    ('eye_c', T, 'T_Eye_Brown.png', 256),
]
for name, d, f, size in JOBS:
    im = Image.open(os.path.join(d, f)).convert('RGB').resize((size, size), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.jpg'), quality=85 if not name.endswith('_n') else 90, optimize=True)
    print(name, os.path.getsize(os.path.join(OUT, name + '.jpg')) // 1024, 'KB')
