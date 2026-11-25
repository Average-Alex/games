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
- **On foot** (`wheelie-city/foot.js`). F hops off (the bike stays parked) and back on. WASD / Shift sprint / mouse look, over-the-shoulder camera. Fists, knife and pistol (1/2/3, click, right-click aim). People get hurt, go down and flee; robbing people (E); walk-in stores (buy weapons, ammo and first aid, sell stolen goods, shoplift, rob the till) and homes (break in, take valuables, rob the family, who call the police). Cash and the bag of stolen goods are saved. Blood sprays and pools, kept non-graphic. Interiors are built below the city at y = -800.
- **Cars, bikes and scooters** (`wheelie-city/drive.js`). On foot, F next to a traffic car (or a police car) hijacks it; F gets out and leaves it parked. Parked motorbikes and e-scooters (the new Segway Ninebot in `BIKES`) stand on the sidewalks round you; F takes one and leaves your own bike parked.
- **Key bubbles.** When something can be done, the key (E or F) floats over it with a label.
- **Online market** (T, anywhere): Glock 19, Desert Eagle, Uzi, AK-47, pump shotgun, ammo, body armour, first aid, delivered straight into your inventory (saved). Slots 1 fists, 2 knife, 3 pistols, 4 automatics, 5 shotgun; automatics fire while the button is held.
- **Wardrobe** (`wheelie-city/wardrobe.js`, button next to Ride): a dressing room with body, skin, hair, beard, top, bottoms and shoes; the look is saved and worn on foot and on the bike.
- **Interiors** (`wheelie-city/interiors.js`, `levels.js`). Restaurants/cafés/fast food (order food to heal, rob the register), bars and clubs (drinks make the view sway; lit dance floor, DJ, dancers), banks (rob the tellers, hold E to drill the vault while the armed guard shoots), clothes shops (shoplift off the racks; the changing room opens the wardrobe mid-game for $50), casinos (slots, roulette, blackjack, rob the cashier's cage). Every building's room is decorated and laid out differently (colours, furniture, half are mirrored). Doors open: a door swings open in the wall outside, and inside the double doors open as you walk up.
- **High-rises and malls.** Tall apartment and office towers have a lobby and elevators to every floor; each floor is a corridor of apartments (families) or offices (staff, laptops, a safe) to break into. Malls are a two-level concourse with eight walk-in shops (the real shops in that building where the map has them). Smaller buildings with several shops show a directory (E) to pick which one to go into; each shop is always the same room.
- **Police on foot** (`wheelie-city/footcops.js`). With a wanted level, officers come after you on foot (out of nearby police cars). Under 3 stars they arrest you if they're next to you for ~2 s (sprint away or fight); hit one, or aim a gun at one, and they shoot. If you hole up inside, they come in through the door after ~7 s. Officers can be shot.
- **Driving.** Any parked car along the curb can be taken (F), as well as traffic. Cars have a speedometer (speed, revs, gear, damage) and their own engine sound. The bike's engine is silent while you're off it.
- **On-foot controls:** A/D turn you and the camera swings round behind you (aiming keeps the old strafe). Holding people up indoors needs a weapon out, so walking into a shop is just shopping. Stolen goods sell at any store counter, or online (T) for less.
- **Blood** (kept non-graphic: no organs or dismemberment): heavier sprays that grow with repeated hits, splats where drops land, drip trails from the wounded, larger pools, red screen edges when you're hurt. It all dries up after about 35 s.
- **Burnouts.** Hold B (or S + W) while stopped: the back wheel spins with tyre smoke, rubber marks and a screech; burnout time scores on release. (Donuts were taken out.)
- **Taller malls.** Malls and big stores get 5–6 m floors instead of 3.2 m, and an outline mapped in parts now takes its biggest part's height (one small canopy had left Metropolis at Metrotown at 5 m).
- **No more grainy picture.** Film grain, lens fringing and most sharpening are off, and the auto-resolution never drops below 65%.
- **Car and cop fixes.** Cars now collide with the middle of the bike too, and slow bumps stop you instead of sliding you through. Under 3 stars, cops pace alongside you instead of ramming, and wheelies only get you noticed by a cop within 35 m (with a warning first).
- **Every shop fitted out for what it sells** (`wheelie-city/shops.js`): grocery/convenience (aisles, drink fridges, slushie machine), tech (TV wall, demo tables of phones), bike shops (bikes on the floor and wall, workbench), bookshops (bookcases, reading chair), pharmacies (white aisles, a pharmacy counter), hardware (tall racking, pegboard, plants) and gift shops. Colours, floor, aisles and fittings vary per shop, the shop's name is over the counter, and what you can pocket depends on the shop.
- **Weapons point forward** out of your hand (and guards' and police pistols), instead of following the hand bone sideways. The knife is bigger and brighter.
- **Deaths:** the dying person's previous animation now fades out, so bodies lie flat instead of half standing.
- **Hitting someone on the bike** throws you off (anything faster than walking pace), and they're hurt and bleeding; a hard hit kills them.
- **Police arrive by car:** officers on foot only come out of a police car that has pulled up near you (it stops with its lights on, the doors thump, two officers get out).
- **One speedometer for everything:** the car's dial (speed, revs or throttle, gear) is now top left on bikes, scooters and cars, scaled to each vehicle's top speed; cars also show damage.
- **The market (T) works from a car.**
- **SkyTrain robbery:** look at a passenger near your seat and press E; they hand over their wallet or phone and someone calls it in.
- **City moods:** each city keeps its own time of day and weather (LA golden hour, Vegas at night, NYC at dusk, Vancouver's rain and cloud, Miami sun). A brief all-sunny version was tried and reverted. Daytime skies for LA, Vegas and NYC were fetched for it and are still in `assets/sky` (`day_la`, `day_vegas`, `day_nyc`, Poly Haven CC0) for a future time-of-day option. Light concrete sidewalks and greyer roads were kept. `tools/fetch_assets.py skies` now only downloads skies it doesn't have yet.
- **Front yards:** streets of houses and apartments get a hedge, a stucco garden wall with pillars, or an open lawn with bushes in front of each lot (driveway gaps between), just behind the sidewalk. They're solid. Not drawn on Low quality.
- **New car models** (`vehicles.js` `carGeo`): rounded profiles, sides that tuck in under the sills and narrow at the shoulder, fenders that bulge over the wheels, door seams and chrome handles, a glasshouse with rubber seals, black window frames and B-pillars (windshield and rear window as glass, pillars painted), chrome-surround grilles and lower intakes, mirrors on stalks, headlights and tail lights that wrap round the corners (placed on the actual body surface), amber indicators, a rear light bar, dished alloy wheels with twin spokes and brake discs, black cladding on SUVs and pickups, a bed liner in pickups. Paint is less metallic and more clear-coated.
- **Leafy residential streets:** trees in most front yards and some along the curb on streets of houses, every city (palms mixed in in LA, Vegas and Miami). Not on Low.
- **House roofs:** small houses get pitched roofs (gable on plain four-cornered houses, hip roofs otherwise) with 40 cm overhanging eaves and fascia boards, real roof tiles lit by their slope, terracotta in the sunny cities and slate grey or brown elsewhere.
- **Road wear:** repaired patches, sealed crack lines and manhole covers on ordinary streets (not highways, not on Low).
- **Helicopters and planes** (`wheelie-city/air.js`). Small planes line up at the end of the runway (found automatically: the longest clear strip on the airfield) at the real airports inside each map: YVR, Santa Monica, Harry Reid, MIA. Helicopters sit near them, at New York's Downtown Manhattan and West 30th Street heliports, and on a helipad on the roof of some high-rises (elevator → Roof). F to get in/out (landed and stopped). Helicopter: W/S tilt, A/D or mouse turn, Space up, Shift down. Plane: W/S throttle, A/D or mouse bank, Space/Shift or mouse pitch; rotate at ~130 km/h, stalls below ~110. Land on roofs and walk about up there. Hitting buildings, landing hard or ditching in the water crashes. The theft gets reported after a while.
- **Aircraft only at real places** (`tools/extract_air.py` → `maps/air_<city>.json`, from the OSM extracts): a plane at the end of every real runway over 500 m, more parked on the real aprons, a helicopter on about half the real helipads and most heliports (on the roof when the pad is on a building). The elevator's Roof button only appears in buildings with a real rooftop helipad.
- **Homes by wealth** (`wheelie-city/homes.js`): every house's family is struggling, ordinary, well off or wealthy, from the real house size and neighbourhood (rich: Shaughnessy, Beverly Hills, Coral Gables, the Upper East Side...; poor: the Downtown Eastside, Skid Row, Overtown, Mott Haven...). Struggling: small, dim, crowded, an old TV and a cash jar. Well off: open plan, big TV, art, kitchen island, wine fridge, Rolex, jewellery, designer bag, a safe (hold E). Mansion: double-height marble hall, chandelier, staircase, a gallery of paintings ($3k-15k), grand piano, bar, indoor pool, gold statue, a vault (hold E), staff and an armed guard, and an alarm. Each home's style and layout comes from its own seed. Apartments: richer in rich areas and on the top floors (penthouses).
- **SkyTrain on foot:** after tapping in you walk freely (WASD and mouse) round the paid hall, the escalator and the whole platform among the people waiting; rob them (E); walk into an open train door to board; on the train stand up (W), walk the aisle, sit (E by a seat), rob anyone, and walk out of the open door at any stop. Tap out at the gates (E) to leave.
- **Witnesses:** the police only find out about a crime if a cop sees or hears it, or someone calls it in: the nearest person who saw it (or heard the gunshot) gets their phone out and takes 6–12 s to call 911; knock them out first and nobody calls. Indoors, someone inside calls unless nobody's left standing; bank alarms still go straight through.
- **Road markings:** two-way streets wider than a lane each way get solid white edge lines in from the curb.
- **Vegas neon.** The resort towers and casino roofs on the Strip now have neon bands round their tops, and the towers have light strips up their corners.

The work from the other Claude window (new street bikes, `transit.js` station walkthroughs, building parts) is included in these changes. A snapshot of it from before this update is kept at git ref `refs/backup/other-session`.

### Still to do

1. **Push it.** Nothing above is live yet.
2. **Load time.**
   - It takes about 47 s to load Vancouver in the slow software-rendered test browser.
   - I haven't measured the live version under the same conditions yet, so I don't know if that's slower than before.
   - Next: try it on the Chromebook. If it's slow, make Low/Med skip the photo facades and the far skyline.
3. **Chromebook frame rate.** Draw calls went down, but each pixel costs more (photo materials, sky, half-float post-processing). The governor lowers resolution automatically. It still needs a real Chromebook test.
4. **Time of day option.** A menu choice (or a day/night cycle) could use the daytime skies in `assets/sky` alongside each city's own mood.
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

**Before each push, bump the `?v=` on the script tags in `wheelie-city.html`** (all 19 share one value). Browsers otherwise keep running old cached copies of the game files after an update.

The headless-Chrome tests live in `C:\Users\alexd\games-test`:
- `node test.mjs <city> <bike>` runs a full gameplay pass.
- `node probe.mjs <city> <steps.mjs>` takes scripted screenshots. Set the `PORT` and `ROOT` environment variables to run several at once.
