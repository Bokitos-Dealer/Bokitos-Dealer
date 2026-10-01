# Fietsen in Amsterdam 🚲

A first-person cycling simulator set in Amsterdam's canal ring. You ride a heavy Dutch *omafiets* over humped brick bridges and klinker streets, past leaning canal houses, trams and houseboats, in real Dutch weather.

**Play:** open `dist/index.html` in a browser. It is one self-contained file, so you can double-click it, host it anywhere (for example GitHub Pages) or embed it.

## What makes it feel real

**The bike**
- Physics-based pedalling: rider power (about 175 W cruising, 420 W standing on the pedals), crank torque limits, cadence and a **3-speed hub gear**.
- Rolling resistance changes with the surface: smooth red asphalt bike lanes, rumbly brick *klinkers*, sidewalk tiles, granite quay edges and grass.
- Aerodynamic drag with **real wind**, including gusts. A headwind (*tegenwind*) really slows you down, and the HUD tells you when you have one.
- Gravity on the steep humps of canal bridges: you slow down going up and roll fast coming down.
- Brakes are weaker on wet streets, and grip limits mean you can slide out in a fast corner in the rain.
- Low-speed wobble, putting a foot down when you stop, and walking the bike backwards (hold brake while stopped).
- Collisions with trees, lamp posts, *Amsterdammertjes* (the brown bollards), parked cars, rows of parked bikes, people and trams.
- **Tram rails:** cross them at too shallow an angle and your front wheel gets stuck.
- **Canals:** most quays have no railings, so you can ride straight into the gracht. Bridge parapets do stop you.

**The city**
- A procedurally generated canal ring based on the real horseshoe layout: Singel, Herengracht, Keizersgracht and Prinsengracht, plus the Amstel, the IJ and Centraal Station on its island.
- About 3,600 narrow canal houses with step, neck, bell, spout and cornice gables, hoist beams, coloured front doors and a slight lean. Windows light up at night.
- Arched brick bridges with light bulbs along the arches, elm trees, houseboats, thousands of parked bikes (including the station bike parking), parked cars and street lamps.
- Landmarks to discover: Centraal Station, the Dam with the Royal Palace and National Monument, Westerkerk with its blue crown, Munttoren, Bloemenmarkt, Blauwbrug, Magere Brug and the Rijksmuseum, including its **bike passage through the building**.

**Life on the streets**
- Locals on bikes who keep right, overtake you, ring at you when you block them and, about half the time, run red lights.
- Tourists who walk in the bike lane and stop for photos. Ring your bell and they jump aside with a "Sorry!".
- Delivery vans parked in the street with their hazard lights on, trams that ring their bells and brake for you, tour boats and small boats on the canals.
- Traffic lights, and police officers who hand out realistic fines: **€110** for running a red light or riding on the pavement, **€65** for riding without a light in the dark.
- Ride against traffic in a bike lane and you are a ***spookfietser*** (ghost cyclist).

**Weather and time**
- The sun position is computed for Amsterdam's latitude on today's date: sunrise, golden hour, dusk and night.
- Weather options: live Amsterdam weather (from Open-Meteo when the network allows it), sunny, cloudy, drizzle (*motregen*), rain, storm and mist, or "typically Dutch" weather that keeps changing. Streets get wet and shiny in the rain.
- Autumn leaves tint the trees in September to November.

**Sound** (all synthesised in the browser, no audio files)
- Bike bell, freewheel ticking, tyre noise that rumbles on klinkers and hums on asphalt, wind noise, rain, tram bells, car horns, splashes and crashes, birds and seagulls, and a carillon that plays every quarter of an hour.

## Game modes

| Mode | Goal |
|---|---|
| Free ride | Explore and discover all 10 landmarks |
| Food delivery | Pick up orders at restaurants and deliver them before they go cold. Your tip depends on speed and on not crashing or dropping the food in a canal |
| City tour | A GPS-guided route past all the landmarks, with a short fact at each one |
| Morning commute | Get from the Jordaan side to the office before 09:00, in rush hour |

Your **reputation** goes from *Lost tourist* to *Echte Amsterdammer*. It goes up for hand signals, ringing at tourists in the bike lane and riding in the rain, and goes down for crashes, fines and blocking other cyclists.

## Controls

| Key | Action |
|---|---|
| `W` / `↑` | Pedal |
| `S` / `↓` | Brake (hold while stopped to walk the bike backwards) |
| `A` `D` / `←` `→` | Steer |
| `Shift` | Stand on the pedals (sprint, uses stamina) |
| `Q` / `E` | Shift gear down / up |
| `Space` | Ring your bell |
| `Z` / `X` | Hand signal left / right |
| `L` | Bike light |
| `C` | First-person or chase camera |
| `M` | City map |
| Mouse | Look around (click to capture the mouse) |
| `R` | Reset to the last safe spot |
| `N` | New mission (tour and delivery modes) |
| `Esc` / `P` | Pause (time speed, weather, traffic density, volume, ride statistics) |

On phones and tablets, on-screen controls appear: a steering pad and buttons for pedal, brake, bell, gears, light, camera and sprint.

## Development

```bash
npm install
npm run build   # writes dist/index.html (minified, everything inlined)
npm run dev     # rebuilds dist/index.html when files in src/ change
npm start       # serves dist/ on a local web server
```

Useful URL parameters: `?q=low|medium|high` sets graphics quality, `?debug` logs draw calls and triangle counts, and `?manual` turns off the render loop so automated tests can step the simulation with `window.__game.advance(seconds, keys)`.

### Project structure

```
src/
  main.js              boot, game loop, UI wiring
  city/layout.js       the analytic map: canals, streets, bridges, height and surface queries
  city/streets.js      road, bike lane and sidewalk meshes, quay walls, arched bridges, water
  city/houses.js       canal house generator (gables, lean, doors, roofs)
  city/props.js        trees, lamps, bollards, parked bikes and cars, houseboats (with LOD)
  city/landmarks.js    Centraal, Dam, Westerkerk, Munttoren, Magere Brug, Rijksmuseum, ...
  city/textures.js     procedural canvas textures (no image files)
  models/              bike, riders and walkers (instanced), cars, trams, boats
  sim/player.js        bike physics, collisions, camera
  sim/traffic.js       AI cyclists, pedestrians, cars, trams, boats
  sim/nav.js           street graph and A* routing for AI and the GPS
  sim/environment.js   sun position, sky shader, weather, rain, wind, night lighting
  sim/audio.js         procedural WebAudio sound
  sim/game.js          traffic lights, police and fines, reputation, missions
  ui/                  HUD, minimap, keyboard, mouse and touch input
```

Built with [three.js](https://threejs.org/) and bundled with esbuild into a single HTML file.

The layout is inspired by Amsterdam but simplified: the canal ring is a regular horseshoe, and street names are borrowed from the real city without matching their real positions exactly.
