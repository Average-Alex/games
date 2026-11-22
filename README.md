# games

Browser games, published at https://average-alex.github.io/games/

- `wheelie-city.html` + `wheelie-city/`: Wheelie City, an e-moto wheelie game on real city streets (Vancouver, LA, Las Vegas, Miami, New York).
- `ridgeline-rush.html`: Ridgeline Rush.

## Wheelie City: realism update (2026-11-20, local only, not pushed yet)

### Done

- **Real building heights.** OpenStreetMap had no height for 87% of Vancouver and 97% of Las Vegas buildings, so they were all 8–20 m. Heights now come from Overture Maps (`tools/overture_heights.py`, joined in `tools/build_maps.py`). That gave real heights to 137k more buildings in Vancouver and 61k more in Vegas, including the Strip towers. All five maps were rebuilt.
- **Photo skies** (Poly Haven HDRIs) per city, blending into real overcast, storm and mist skies as the weather changes. The sun light comes from the photo's own sun.
- **Real terrain and satellite ground** (`tools/build_terrain.py`):
  - real mountains round Vancouver (the North Shore), LA and Vegas
  - real aerial imagery past the streamed streets, with water that reflects the sky
- **Far skyline.** Every tall building in the city is drawn as a simple block in the distance, so landmarks and downtowns show from anywhere. Detailed buildings replace them as you get close.
- **Photo materials** (Poly Haven / ambientCG, all CC0; `tools/fetch_assets.py`):
  - photographed glass, office and brick tower facades with lit windows at night
  - lower buildings get photo walls (siding, stucco, brick, concrete) with windows that reflect the sky
  - real asphalt and sidewalk slabs, grass and gravel roofs
  - roads go dark and shiny in rain, with puddles
- **Trees** built from scanned real leaves, plus fir boughs and palm fronds, with leaf-shaped shadows.
- **Bikes, rider and cars:** clear-coat paint, fabric/denim/leather surface detail, and lamps and police lights that glow.
- **Correct colour handling** (sRGB) and higher-precision post-processing on Ultra, which fixed flickering walls.
- **Performance:** about 1,100 draw calls on Ultra, down from about 1,310 in the live version, at the same triangle count.
- **Credits** for all the new data sources are in the menu.
- **Hand-built landmarks** (`wheelie-city/landmarks.js`). Each one finds its building in the map, hides the plain block and puts a proper model in its place. They're always drawn, so you can steer by them from anywhere.
  - Las Vegas:
    - the Sphere, with its LED skin cycling through shows
    - the STRAT, with its legs, pod and mast
    - the High Roller wheel, with its colour-changing rim lights
  - Vancouver:
    - Harbour Centre's saucer and mast
    - Canada Place's five sails
    - Science World's geodesic dome
    - Lions Gate Bridge's towers and cables
  - New York: the Empire State Building's stepped crown and spire
- **Real people** (`wheelie-city/people.js`). Pedestrians use Quaternius' Universal Base Characters and Universal Animation Library (CC0): proper bodies, faces and hair, with real walk, jog, idle, talking, dance, hit and fall animations. The models come in underwear, so the clothes (t-shirts or long sleeves, trousers or shorts, shoes) are generated from the body surface at load. The files are built by `tools/people` (`npm install`, then `node build_people.mjs <folder with the unzipped packs>` and `build_textures.py`). If they fail to load, the old simple people are used.
- **Realistic rider.** The rider on the bike is the same human body, in your jersey and pants colours with boots and the helmet. The old built rider is kept as an invisible guide (tricks, standing and the crash ragdoll move it) and the body follows it with IK each frame.
- **Burnouts and donuts.** Hold S + W while stopped: the back wheel spins with tyre smoke, rubber marks and a screech; steer to swing round into donuts (+500 each); burnout time scores on release.
- **Taller malls.** Malls and big stores get 5–6 m floors instead of 3.2 m, and an outline mapped in parts now takes its biggest part's height (one small canopy had left Metropolis at Metrotown at 5 m).
- **No more grainy picture.** Film grain, lens fringing and most sharpening are off, and the auto-resolution never drops below 65%.
- **Car and cop fixes.** Cars now collide with the middle of the bike too, and slow bumps stop you instead of sliding you through. Under 3 stars, cops pace alongside you instead of ramming, and wheelies only get you noticed by a cop within 35 m (with a warning first).
- **Vegas neon.** The resort towers and casino roofs on the Strip now have neon bands round their tops, and the towers have light strips up their corners.

The work from the other Claude window (new street bikes, `transit.js` station walkthroughs, building parts) is included in these changes. A snapshot of it from before this update is kept at git ref `refs/backup/other-session`.

### Still to do

1. **Push it.** Nothing above is live yet.
2. **Load time.**
   - It takes about 47 s to load Vancouver in the slow software-rendered test browser.
   - I haven't measured the live version under the same conditions yet, so I don't know if that's slower than before.
   - Next: try it on the Chromebook. If it's slow, make Low/Med skip the photo facades and the far skyline.
3. **Chromebook frame rate.** Draw calls went down, but each pixel costs more (photo materials, sky, half-float post-processing). The governor lowers resolution automatically. It still needs a real Chromebook test.
4. **Vegas streets at night are still a bit dark.** The towers glow now, but the street level could use brighter casino entrances and light spilling onto the pavement.
5. **More landmarks.** Add more to `LANDMARK_SITES` in `landmarks.js` in the same way:
   - LA: Griffith Observatory, the Hollywood sign, the Capitol Records building
   - Miami: Freedom Tower
   - New York: One World Trade's spire, the Chrysler crown
   - Vegas: Paris's Eiffel tower, the Luxor pyramid
6. **Real 3D models** for the rider, bikes and cars. I found none under a free licence that I could use without an account, so these are still built from shapes with better materials.
7. **Engine upgrade** (three.js r128 → current): not done. Nothing above needed it, and it's a large, risky rewrite.
8. **Polish:**
   - NYC dusk is quite hazy.
   - Miami's asphalt looks slightly blue.
   - Trees only appear within about 250 m.
   - Far-skyline blocks have no podiums or roof detail.
9. **Licence note.** Vancouver's satellite imagery (Sentinel-2 cloudless 2024, EOX) is CC BY-NC-SA, which means non-commercial use only. That's fine for a free game. If the game ever makes money, rebuild with the 2016 imagery (CC BY) in `tools/build_terrain.py`.

### Rebuilding the data

All scripts run with the Python venv at `C:\Users\alexd\games-tools-venv`:

```
python tools/overture_heights.py C:/Users/alexd/games-osm        # building heights (Overture, via DuckDB)
python tools/build_maps.py C:/Users/alexd/games-osm [city]       # streets and buildings -> wheelie-city/maps
python tools/fetch_assets.py                                      # textures and skies -> wheelie-city/assets
python tools/build_terrain.py [city]                              # terrain and imagery -> wheelie-city/terrain
```

The headless-Chrome tests live in `C:\Users\alexd\games-test`:
- `node test.mjs <city> <bike>` runs a full gameplay pass.
- `node probe.mjs <city> <steps.mjs>` takes scripted screenshots. Set the `PORT` and `ROOT` environment variables to run several at once.
