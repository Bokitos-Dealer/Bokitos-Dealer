# Bike the World (Roblox) 🚲🌍

A kid-friendly Roblox game where you ride bikes through famous cities. You start on a hub island and ride through a glowing portal into **Amsterdam**, **Paris** or **New York**. You earn coins by riding, collecting spinning coins, finding landmarks and doing delivery jobs. Coins buy new bikes, colours and extras. Robux buy Game Passes and coin packs, which is how the game makes money.

## What's in the game

**Cities** (each one is built by code when the server starts):
- **Hub island:** a practice loop with coins, a big globe, the Bike Shop kiosk and one portal per city.
- **Amsterdam:** the canal ring (Singel, Herengracht, Keizersgracht, Prinsengracht) with hump bridges, canal houses with gables, the Dam, the Royal Palace, the National Monument, Centraal Station, Westerkerk, Munttoren, the Flower Market and a windmill.
- **Paris:** the Seine with its quays and bridges, Haussmann buildings, the Champs-Élysées, the Eiffel Tower (it sparkles at night), the Arc de Triomphe, the Louvre pyramid, Notre-Dame, Place de la Concorde, the Tuileries and a carousel.
- **New York:** a Manhattan grid with Broadway, Central Park, Times Square with neon signs, the Empire State and Flatiron buildings, the Brooklyn Bridge and the Statue of Liberty.

**Riding:** the physics model includes pedal power, air drag, rolling resistance that depends on the surface (cobblestones are slower than asphalt), hills on bridges, brakes, steering and lean. Shift gives a boost that uses stamina. If you ride into a canal you get a splash and land back on the street, so you never die. Each player also has a bell.

**City life:** cyclists, people walking, cars, taxis and tour boats. They wait for you if you are in the way, so nobody crashes. There is a day/night cycle with street lights and glowing windows, and rain in some cities.

**Ways to earn coins:**

| What | Coins |
|---|---|
| Riding | 12 per km |
| A spinning coin | 5 (each one comes back after 40 s) |
| A new landmark | 50 (plus a fun fact card) |
| A delivery job (ride into a green ring at a café, bakery or pizza place) | 30, plus up to 37 more for being quick |
| Daily bonus | 75 |

**Shop:** 6 bikes (Dutch city bike, BMX, cargo bike, racing bike, e-bike and the Golden Bike), 8 colours, and extras: a helmet, a flower basket, streamers, a rainbow trail and a puppy in the basket.

**Controls:**
- **Computer:** W/S pedal and brake, A/D steer, Shift boost, Space bell, C camera. Hold the right mouse button to look around.
- **Phone:** the thumbstick steers and pedals, with big ⚡ boost and 🔔 bell buttons.
- **Gamepad:** the left stick steers, RT pedals, LT brakes, X boosts and Y rings the bell.

## Open it in Roblox Studio

1. Install [Roblox Studio](https://create.roblox.com/).
2. Open `BikeTheWorld.rbxlx` (in this folder) with Studio: **File > Open from File**.
3. Press **Play**. The hub is built straight away. Each city takes a few seconds to build, and a message tells you when it is ready.

To test saving in Studio, publish the game first (step 1 below), then turn on **Game Settings > Security > Enable Studio Access to API Services**.

## Publish it and earn Robux

1. **Publish:** in Studio, **File > Publish to Roblox**. Give it a name and description, for example "Bike the World: ride through Amsterdam, Paris and New York!", and pick the genre and devices (computer, phone, tablet, console).
2. **Content questionnaire:** go to the [Creator Dashboard](https://create.roblox.com/dashboard/creations) > your experience > **Audience > Maturity & Compliance** and fill in the questionnaire. This game has no violence, no paid random items and no chat features of its own, so it should get the youngest age rating.
3. **Make it public:** Creator Dashboard > your experience > **Configure > Settings > Public**.
4. **Create the Game Passes** (bought once and kept forever). Go to **Monetization > Passes > Create a Pass**, upload an icon (512×512), then open the pass and turn **Item for Sale** on with a price. Suggested passes:

   | Config key | Name | Suggested price |
   |---|---|---|
   | `DoubleCoins` | 2x Coins | 199 R$ |
   | `GoldenBike` | Golden Bike | 149 R$ |
   | `RainbowTrail` | Rainbow Trail | 99 R$ |
   | `Puppy` | Puppy in Basket | 99 R$ |

5. **Create the Developer Products** (they can be bought many times). Go to **Monetization > Developer Products > Create**:

   | Config key | Coins | Suggested price |
   |---|---|---|
   | `Coins100` | 100 | 25 R$ |
   | `Coins550` | 550 | 99 R$ |
   | `Coins1500` | 1500 | 249 R$ |

6. **Paste the IDs:** copy each pass ID and product ID into `src/shared/Config.luau` (`Config.GamePasses[...].id` and `Config.Products[...].id`). If you only use Studio and not Rojo, edit the `Config` ModuleScript in **ReplicatedStorage > Shared** instead. Items with ID `0` show "Coming soon" in the shop.
7. **Republish** the game (File > Publish to Roblox).

**Getting paid:** Robux from sales go to your account, or to the group if the game belongs to a group. Roblox keeps a share of each sale, and Game Passes and Developer Products both pay out after a short holding period. To turn Robux into real money you need the [Developer Exchange (DevEx)](https://create.roblox.com/docs/production/earning-on-roblox/developer-exchange), which has requirements such as a minimum age, a minimum Robux balance and a verified account. If you are under 18, ask a parent or guardian to help you with payments and the Roblox account settings.

**Kid-friendly rules this game follows:**
- **No loot boxes.** Every Robux item says exactly what you get.
- **Nothing is pay-to-win.** Everything except the 4 Game Passes can also be earned with coins by playing.
- **The game cannot cheat.** Purchases are handled by Roblox's own purchase window, and coins are checked by the server.

## Sounds (optional)

The game uses Roblox's built-in sounds until you add your own. To use the included sounds:

1. Upload the files in `assets/` (`bell.wav`, `coin.wav`, `landmark.wav`, `purchase.wav`) in Studio with **View > Asset Manager > Import**, or in the Creator Dashboard under **Development Items > Audio**.
2. Copy each sound ID into `Config.Sounds` as `"rbxassetid://123456"`.

## For developers

The code is written in Luau and synced with [Rojo](https://rojo.space/):

```
roblox/
  default.project.json    Rojo project (where each folder goes in the game)
  BikeTheWorld.rbxlx      ready-to-open place file (built from src/)
  src/shared/             used by both server and client (ReplicatedStorage.Shared)
    Config.luau           prices, bikes, Robux IDs, cities, rewards
    Build.luau            the "build list": a city described as plain data
    Kit.luau Roads.luau Grid.luau   building blocks: houses, bridges, streets...
    Cities/               Hub, Amsterdam, Paris, NewYork generators
    BikePhysics.luau      the riding physics (pure Luau)
    BikeModel.luau        builds the bike models
  src/server/             ServerScriptService.Server
    Main.server.luau      start-up, remotes, portals, weather, day/night
    Materializer.luau     turns a build list into parts, water and lights
    DataService.luau      saving (DataStores)
    BikeService.luau      gives each player their bike
    ShopService.luau      coin shop, Game Passes, Developer Products
    RewardService.luau    coins, landmarks, deliveries, daily bonus
    Worlds.luau           where each city is and what is in it
  src/client/             StarterPlayerScripts.Client
    BikeController.luau   riding: physics, ground following, walls, splashes
    BikeCamera.luau       chase and first-person cameras
    Animator.luau         wheels, pedals and handlebars of every bike
    Hud.luau ShopUI.luau TravelUI.luau Ui.luau   the interface
    Traffic.luau          cyclists, walkers, cars and boats
    Effects.luau          night lights, coins, rain, sparkles
  tests/                  tests for the city generators and the physics
  assets/                 sounds to upload
```

**Workflow:**
- Live-sync into Studio with `rojo serve` and the Rojo Studio plugin.
- Rebuild the place file with `rojo build default.project.json -o BikeTheWorld.rbxlx`.
- Run the tests with `LUAU=/path/to/luau tests/run.sh`. This needs Node.js and the [Luau](https://github.com/luau-lang/luau/releases) command-line tool.

**How it works:**
- **Cities from code.** Each city generator returns a build list: plain data with boxes, wedges, cylinders, water, landmarks, coins, lanes, shops and doors. The server's Materializer turns that list into parts. The generators use a seeded random number generator, so every server, and every player's computer, builds exactly the same city. The client runs the same generator to get the traffic lanes, without the server having to send them.
- **Bikes.** Each player's bike belongs to their own computer (network ownership). Each frame the client runs `BikePhysics` and moves two rigid align constraints, so riding feels instant even with lag. Rewards are always checked on the server.

**Adding a city:**
1. Write `src/shared/Cities/<Name>.luau` with a `generate()` function. Copy the structure of an existing city and use `Kit`, `Roads` and `Grid`.
2. Add an entry to `Config.Cities`, with an origin at least 9,000 studs away from the other cities.
3. A portal for it appears in the hub automatically.
