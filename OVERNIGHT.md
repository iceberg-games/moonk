# MOONK! overnight log (Nov 9–10, 2026)

Coordinator: Jojo (hourly routine). Do NOT publish/push/deploy. Keep `npm test` passing. Screenshots -> screenshots/overnight/. Backups -> /workspace/backups/moonk/.

## Top priority (Colin, 11:08 PM): movement, wardrobe, lobbies
- (a) Movement too slow -> owner: MOONK Game Maker. Status: **DONE 23:20** (see LOCO table below)
- (b) Wardrobe not visible -> owners: MOONK Cosmetics + Game Maker. Status: **DONE 11:44 PM**; buy/inv adapter added **12:19 AM Arizona / America/Phoenix**. Details in section (b) below.
- (c) Lobbies don't work -> owner: MOONK Netcode. Status: **dev fixed 23:27 MST** (public quick-join + private create/join-by-code work through the lobby computer; offline/Retry UI added). Live site still has no hosted server (baked Render URL 404s); host needs Colin's choice in the morning. Details in section (c) below.

## Killers (existing: Locust, Yeti)
| Hour | Name | Look | Ability | Owner | Status | Screenshot |
|---|---|---|---|---|---|---|
| 23:00 | **Gulper** | lopsided blob, huge hinged jaw, ~40 teeth, cyclops-ish eyes | **Lunge**: 0.5 s jaw-open tell, 0.45 s dash 10.5 m/s, cooldown 8 s (server enforced). Walk 3.0 m/s | Game Maker | **done**, tested (monster-test) | screenshots/overnight/killers-dark-lineup.png, g1.png |
| 00:00 | **Burrower** (planned) | segmented gray-pink worm, ring mouth of inward teeth, no legs | **Burrow**: dives underground ~2.5 s, fast and hidden (dirt-ripple tell), erupts with a snap; cooldown ~14 s server enforced | Game Maker | assigned 00:17 | |
| 00:00 | **Mimic** (planned) | passes as a gray monkey; unmasks into a split-open face full of teeth | **Disguise**: ~6 s looks like a normal monkey with a fake name tag, attacking or ending reveals it; cooldown ~20 s server enforced | Game Maker | assigned 00:17 | |
| 23:00 | **Grinner** | tall wobbly body, giant swivelling head, huge toothy crescent grin | **Blackout**: 0.6 s giggle tell, 3 s fog+dim within 12 m, cooldown 15 s (server enforced). Walk 2.4 m/s, reach 2.0 m | Game Maker | **done**, tested | screenshots/overnight/n1.png, killers-dark-lineup.png, blackout-monkey-view.png |
| 00:20 | **Burrower** | segmented gray-pink worm, no legs, bulbous lopsided head with a ring mouth of ~35 inward-pointing teeth (3 rings, one crooked fang), 3 mismatched eyes | **Burrow**: 0.45 s dive tell (rumble + dirt churn + sinking), 2.5 s underground (hidden body, moving dirt-ripple ring, 7 m/s, cannot tag), then a 0.5 s erupt (jaw snap, 2.2 m/0.02-0.08 s catch). Cooldown 14 s. Walk 2.6 m/s, reach 1.3 | Game Maker | **done**, tested | screenshots/overnight/burrower-lineup.png (ab 0/1/2/3), burrower-closeup.png |
| 01:25 | **Dangler** | long rubbery neck up to a hook on a tall iron rig it carries (pole rises past its head), blind drooping ovoid head with sewn-shut seams, hinged lower jaw with ~9 hooked fangs + two big tusks, two thin arms, no legs, ragged hem | **Reel**: 0.5 s throat-swell tell (bulge runs down the neck, jaw opens), then the SERVER ray-tests the facing line once (9 m, 0.55 m capsule, nearest runner wins); a hit runner is flung ~4 m toward the Dangler (via the existing `fling` path, now with `stun`) and its hands cannot grab for 0.5 s; the barbed tongue is drawn for everyone from the `abgo` event; cooldown 12 s (server). Walk 2.4 m/s, reach 1.3 m | Game Maker | **done**, tested (monster-test + killers-client-test) | screenshots/overnight/dangler-lineup.png, dangler-closeup.png, dangler-reel-closeup.png, dangler-ingame-*.png |
| 01:25 | **Wailer** | floating ragged shroud (narrow hooded skull, pale slit eyes, tall torso, torn hem and rags), ONE vertical mouth from skull to hem with ~30 needle teeth, thin clawed arms, no legs | **Shriek**: 0.6 s inhale tell (maw cracks open, body swells and quivers), then runners within 10 m get `{t:'shr'}`: push-off gain x0.5 for 2.5 s (client `loco.gain`, purple murk + caption + haptic) and ONLY the Wailer gets `{t:'ping', ids, ms:1500}` (red ring + beam markers visible through walls); expanding shockwave rings for everyone else; cooldown 16 s (server). Walk 2.9 m/s, reach 1.7 m | Game Maker | **done**, tested | screenshots/overnight/wailer-lineup.png, wailer-closeup.png, wailer-shriek-closeup.png, wailer-ingame-*.png |
| 02:15 | **Lurker** | flat wide legless pale slab (manta/flatworm), lid-like mouth along the whole front edge with long needle teeth, cluster of small mismatched glowing eyes on top, four long bony multi-jointed arms it drags itself with (merged geometry, a handful of draw calls). Scale 1.3 | **Cling**: 0.5 s tell (claw scrape sound, grit falls), then 4 s stuck to walls/ceilings (client `LOCO.cling`: gravity off, surface-following crawl, 3.0 m/s). Cannot tag while clinging (server `noTag` [1,2]). Button or timeout releases into a 0.4 s POUNCE window (state 3) with the bigger catch (2.0 m, ~0.05 s). Cooldown 14 s (server). Walk 2.5 m/s, reach 1.4 m | Game Maker | **done**, tested (monster-test, loco-test, killers-client-test) | screenshots/overnight/lurker-lineup.png, lurker-closeup.png, lurker-ingame.png |
| 02:15 | **Stringman** | cracked ventriloquist-doll torso + head dangling by strings from a floating wooden cross-bar, hinged dummy jaw of jagged teeth, too-wide painted eyes, limp arms, no legs. Scale 1.25 | **Tether**: 0.5 s tell (strings glow and creak, cross-bar jerks), then the SERVER picks the nearest runner within 8 m in a 35 deg cone of the facing line. Hit runner gets `{t:'tether', o, r:2.5, ms:2500}` (client soft leash: head cannot stray more than 2.5 m from the hit point for 2.5 s) and everyone sees the string (from `abgo`). A miss still burns the cooldown. Cooldown 15 s (server). Float 2.6 m/s, reach 1.5 m | Game Maker | **done**, tested (monster-test, loco-test, killers-client-test) | screenshots/overnight/stringman-lineup.png, stringman-closeup.png, stringman-ingame.png, stringman-ingame-monster.png |
| 00:20 | **Mimic** | the (new, improved) gray monkey model; face splits open: red throat, teeth on both lips, glowing orange eyes. Scale 1.0 | **Disguise**: 0.3 s shimmer tell, 6 s as a plain monkey wearing a REAL player's name and loadout (server sends everyone else `ro:monkey`, fake `n`, no `ab/fo/xf/ac`; start/go events go only to the Mimic; the Mimic's own snapshot carries `dg`=fake name, shown in its HUD). A tag or the timeout unmasks it (0.8 s, loud, visible to all). Cooldown 20 s. Walk 2.8 m/s (3.6 disguised), reach 1.5 | Game Maker | **done**, tested (identity-leak check in monster-test) | screenshots/overnight/mimic-lineup-c.png |

## Horror levels (existing: Crypt, Marsh, Forest)
| Hour | Name | Generators | Owner | Status | Screenshot |
|---|---|---|---|---|---|
| 23:00 | Rusted Carnival (`carnival`) | 5 | Map Builder | **done**, votable via hub portal x=14 | screenshots/overnight/carnival-*.png |
| 00:00 | Hollow Shaft (`mine`, abandoned mine) | 5 | Map Builder | **done**, votable via hub portal x=18 | screenshots/overnight/mine-*.png |
| 01:00 | Drowned Lighthouse (`lighthouse`, storm island) | 5 | Map Builder | **done** 01:35, votable via hub portal x=22 | screenshots/overnight/lighthouse-*.png |

## Model improvements (rotation: gray monkey, Locust, Yeti, shop stand/cosmetics, overnight killers)
- 23:00: gray monkey -> Game Maker (after priority + killers). Status: assigned (check result)
- 00:00: shop stand + cosmetics models -> Cosmetics. Locust -> Game Maker if time after Burrower/Mimic. Status: assigned
- 00:00: Netcode -> fix any failing `npm test` check (valve two-client assertion seen 23:46), then in-memory server-side Moons/ownership per session (server credits generator Moons, server-validated buy) without persistence or hosting.

- 01:00: Yeti model pass -> Game Maker (after Dangler + Wailer). Netcode -> full `npm test` integration pass ~01:45 + fix regressions from this hour's merges; optional night-lobby flag for `night_lobby_win`. Status: assigned

- 02:00 (Jojo, 02:10): Game Maker -> two NEW killers (no repeats of Locust, Yeti, Gulper, Grinner, Burrower, Mimic, Dangler, Wailer) + model pass on Gulper and Grinner (rotation: earlier overnight killers). Map Builder -> NEW horror map #4 (not Crypt/Marsh/Forest/Carnival/Mine/Lighthouse), portal x=26. Cosmetics -> cosmetics model pass (hats/faces/hands, fix hat_bucket float) + any new killers' look check vs shop. Netcode -> night-lobby flag so `fur_aurora`/`night_lobby_win` can be granted + full `npm test` integration pass ~02:45 on own ports. Status: assigned

## Notes
- Backup 23:10: /workspace/backups/moonk/vrtag-pre-overnight-20261109-2310.tgz
- Generators are ON again (Game Maker, 23:3x): valve you grab+turn, server-authoritative level, +1 Moon once per generator, test in monster-test.mjs; see DESIGN.md 3b. Filling all does not end the round.

## Map Builder: Rusted Carnival (23:15)
- Map: **Rusted Carnival** (`carnival`, horror / Be the Monster). `src/maps/carnival.js`, registered in `src/maps/index.js`. Status: **built + verified** (build, tests, headless budget/gameplay checks). Not yet votable: needs the `shared/defs.mjs` MAPS + GEN_SPOTS entries and a hub portal (Game Maker, diff below).
- Stats: 30 draws, ~17.3k tris, ~246 colliders (box/cyl/sph), 1 point light (amber lantern at ticket plaza) + hemisphere, no sun, no realtime shadows. Screens: `screenshots/overnight/carnival-*.png`.
- Generators: `CARNIVAL_GEN_SPOTS` exported from carnival.js = `[[-13,0,13],[14,0,17],[-10,0,-14],[3,0,-16],[28,0,4]]` as `[x, y, z]`, ground height y=0; server faces each toward the origin (`ry = atan2(-x,-z)`; the origin is the Ferris-wheel hub). All have 1.1 m clear radius at valve height 0.8-1.8 m.
- Needed from Game Maker (not applied by me):
  - `shared/defs.mjs` MAPS: `carnival: { name: 'Rusted Carnival', blurb: 'Horror: dead fair, Ferris wheel, funhouse maze', horror: true },`
  - `shared/defs.mjs` GEN_SPOTS: `carnival: [[-13, 0, 13], [14, 0, 17], [-10, 0, -14], [3, 0, -16], [28, 0, 4]],`  (server does `[...GEN_SPOTS[r.map]]`, so a missing key throws)
  - `src/hub.js` PORTALS: `{ id: 'carnival', label: 'RUSTED CARNIVAL', sub: 'Vote map', color: 0xff9a3a, x: 14, map: 'carnival' },`
  - optional `src/game.js` ZONES: `carnival: [['Ferris Wheel', (x, z) => Math.hypot(x, z) < 12], ['Funhouse', (x, z) => x > 12 && x < 24 && z > -13 && z < -3], ['Ticket Plaza', (x, z) => z > 26], ['Rusted Carnival', () => true]],`

## Game Maker hour 1 (23:10-23:5x)
**LOCO retune (src/physics.js)** old -> new: jumpMultiplier 1.2 -> **1.4**; velWindow 0.065 -> **0.085** with **peak-weighted** release (peakWeight 2); maxJumpSpeed 6.5 -> **9.0**; maxSpeed 9.0 -> **9.5** (horizontal/up; falls capped by maxFall 25); airDrag 0.12 -> **0.02**; groundFriction 7 -> **2.2** (skid ~2.6 m, not dead stop); new wallPushBonus **1.2** (near-vertical surfaces, wallNormalY 0.35), body follows hands 1:1. Frame-rate independent (72/90/120 Hz apex spread ~1.2 cm). Full table: docs/DESIGN.md section 1.
**Killers**: Gulper, Grinner (above). Server `ab` message, cooldown/tell enforced, tests in scripts/monster-test.mjs. Dev screenshot tool: `node scripts/shot-monsters.mjs <out.png> "<query>"`.
**Carnival wiring (23:2x)**: MAPS.carnival, GEN_SPOTS.carnival (+ server tolerates a missing key), hub portal at x=14, game.js ZONES. Vote offers every map in MAPS via hub portals.
**two-client blackout check made deterministic**: steps the monkey render loop by hand instead of waiting on throttled rAF.
**Item 2 (wardrobe)**: skipped by instruction. **Item 4 (gray monkey model)**: see status below.


## (b) Wardrobe — findings and status (MOONK Cosmetics, 11:44 PM Arizona / America/Phoenix)

### Root cause
The stand **was mounted**. It was parented to the hub map, `visible: true`, scale 1, at the old `SHOP_AT` / kit `SUGGESTED_HUB_PLACEMENT` `[4.9, 0, 6.6]`, `rotationY: -1.2`. It was not hidden, culled, or limited to a mode. From spawn `[0, 0.9, 10]` looking at the terminal keyboard `[0, 1.55, 5.2]`, a 70° desktop/dev FOV has a 35° half-angle; the east pose sat ~55° to the right, so a player looking at the lobby computer only saw a sliver of the stand's side (mirror edge / back wall). Looking at the stand itself showed the wardrobe. VR's wider FOV might have caught the edge; the default spawn gaze did not.

### Fix
- Synced kit `src/shopStand.js` (loco/hand collider split, `resolveHand`, `getLocoColliders`) and Banana Cap visor (`src/kit/cosmetics/hats.js`) into `vrtag/src/kit/`.
- Moved the stand west of the plaza, open face (+Z) toward spawn: `SHOP_AT = SUGGESTED_HUB_PLACEMENT = { position: [-2.8, 0, 7.6], rotationY: 0.86 }`. Wardrobe columns (local +X) sit toward the centerline, so they fall inside the spawn→terminal view. Right edge stays clear of the terminal stump at `(0, 0, 5.2)`.
- Trimmed the back wall from 1.78 m to 1.32 m (top ≈ 1.38 m) and lowered the header, Moons sign, category rail, and tabs to match, so a spawn→terminal sightline at y≈1.56 clears the wall.
- Hand-applied the clearance-patch join/snap pieces in `src/game.js` only (shop mount/placement + cos): `serializeLoadout` on `{t:'join', cos}` and `{t:'cos', cos}`; local snap reconcile against sanitized `ps[i].c`; remotes still diff `p.c`. Did not edit `server/server.mjs`. Did not revert or commit Game Maker / Netcode hunks in `game.js`.
- Look: one brass accent (`#b08d4f`), no glow gradients, no emoji.

### Placement chosen
`[-2.8, 0, 7.6]`, `rotationY: 0.86` (faces spawn). Confirmed in a headless shot from the spawn pad looking at the keyboard: the WARDROBE sign, hat pedestals, Equip/Buy, and Banana Cap card are clearly in frame on the left; the terminal keyboard is unobstructed in the center.

### Tests
- Two-client visual test against the **live dev server on port 8830** (Vite `https://localhost:5190` `/ws` proxy; join into room `JRVF`; did not restart or replace that server): client A equipped starter `hat_banana_cap`; client B's remote read `snap` `ps[i].c` `{v:1, hat:'hat_banana_cap', face:null, fur:'fur_moonk_gray', hand:null}` and applied it. **5/5 passed.**
- `npm test` before the local commit (11:46 PM Arizona / America/Phoenix): `loco-test` ALL PASSED; `cosmetics-wire-test` ALL PASSED (5 wire checks on its own server at 8843); `monster-test` PASSED. `two-client.mjs` (own server on 8841) passed lobby computer, match, tag, Yeti, and Grinner checks; **1 failed**: `client valve turn (clockwise hand sweep) raised the server fill level` — a generator/valve assertion in the in-flight two-client script, outside the wardrobe mount/wire changes. Not patched here.

### Screenshots (read and confirmed)
- `screenshots/overnight/hub-from-spawn.png` — from the spawn point, stand visible, keyboard clear
- `screenshots/overnight/shop-stand-closeup.png` — close-up of the stand face
- `screenshots/overnight/remote-wearing-items.png` — remote player "WardA" wearing the Banana Cap, viewed from spawn

Before shots (diagnosis only, not in-repo): `/tmp/hub-spawn-before.png`, `/tmp/hub-look-shop-before.png`.

### Moons / inventory enforcement gap (needs Colin's morning hosting decision)
The server still treats any shop item as owned: `authorizeEquip(e, { owned: PAID_IDS, unlocks: {} })`. There is no server inventory. Moons live only in the client save (`save.moons`). A client can spoof a paid loadout and the server will accept it. Unlock-only ids (`hat_antenna`, `fur_nebula`, `fur_aurora`, `hand_glow_bands`) are rejected for everyone because `unlocks` is empty. Closing this needs **persistent identity plus a hosted server-side store** (balances, owned ids, unlock flags) — part of the same morning hosting decision as the live `wss://` server in section (c). Not fixed tonight; Netcode owns `server/server.mjs`.

### Open gaps
- Moons / inventory not enforced server-side (above).
- In-session unlock tracking is still empty, so unlock-only items cannot stay equipped on the wire.
- Local first-person has no body; you see your own cosmetics on the shop mirror monkey and on remotes. Mirror close-up is easier in VR / at the stand than from spawn.
- No publish, push, or deploy.


### Buy / inventory adapter (12:19 AM Arizona / America/Phoenix)
Netcode's final session-inventory wire, client-only (did not edit `server/server.mjs`):

- Buy sends `{t:'buy', id}`. The stand does not deduct Moons locally while connected; it waits for `{t:'buyres'}` and `{t:'inv'}`.
- `{t:'buyres', id, ok:true}` is followed by inv. Failures show a short sign message: `unknown` → "Not in the shop"; `not_for_sale` → "Not for sale"; `owned` → "Already yours"; `moons` → "Not enough Moons"; `rate_limited` → "One moment...".
- `{t:'inv', moons, owned, unlocks}` is the wallet truth while connected (applied with a strict owned set). No snap field is used for inventory. The session is cleared on disconnect / reconnect; the client save is not overwritten with the session wallet (session Moons reset anyway). Offline / single-player still buys against the client save.
- `{t:'cosrej', slot, id, reason}` reverts that slot to its default (`fur_moonk_gray` for fur, otherwise empty) and shows "Unknown item" / "Not owned" / "Locked". Remotes still follow sanitized `snap` `ps[i].c`.
- `{t:'unlock', id, items, reason}` then inv: the stand sign shows `Unlocked: <name>`.
- Generator +1 Moon no longer increments the client save while a session inv is active (inv should follow). Caption is unchanged.
- Module: `src/kit/shopInventory.js`. Shop API: `setStatus`, pending buy, `setWallet(..., { strict: true })`.

**Server status:** the long-running dev process on port **8830** (probed at 12:19 AM) still answered join + `{t:'buy'}` with welcome/snap only — no `buyres` or `inv` (that process had not picked up Netcode's in-flight `server/server.mjs`). The current working-tree server, started on a spare port **8851**, already speaks the final wire. The adapter was verified against it: join→inv (100 Moons, starters owned); buy `hat_moon_beanie` → `buyres ok` then inv (25 Moons, beanie owned); buy `face_hud_visor` → `moons` / "Not enough Moons"; buy beanie again → `owned` / "Already yours"; equip unowned `hat_cork_crown` → `cosrej not_owned` and the hat slot reverts to empty. Did not edit `server/server.mjs`.

**Tests:** `node scripts/shop-inventory-test.mjs` — **35/35 passed** (reason maps, revert, session lifecycle, stub join→inv, buy ok + deducted inv, all five buyres reasons, cosrej not_owned/locked, unlock then inv). `npm test` loco passed; `cosmetics-wire-test.mjs` now includes Netcode's new buy checks and reported 5 failures, all `rate_limited` from buys issued back-to-back (their script, not the adapter). Not patched here.

The Moons/inventory enforcement gap above still stands on the game server until Netcode lands this wire in `server/server.mjs` and morning hosting adds persistent identity. Until then, a connected buyer can still spoof a paid loadout on the current server, and a successful `{t:'buy'}` will not be answered.

**Netcode update (12:42 AM Arizona / America/Phoenix):** the locked buy / inv / cosrej / unlock wire is in `server/server.mjs` + `server/inventory.mjs` (see section (c)). `cosmetics-wire-test.mjs` now spaces reason/success buys so they no longer trip `rate_limited`; one explicit flood test remains. Full `npm test` is green. The 8830 dev server is restarted after the local Netcode commit so connected shop buys are answered.

### Visual polish + Paint Bucket fit + Buy debounce (1:21 AM Arizona / America/Phoenix)
Backup first (excluding `node_modules`): `/workspace/backups/moonk/vrtag-20261110-003519`. Did not edit `server/server.mjs`. Did not revert or commit Game Maker / Netcode hunks. Left `36a04c2` as-is. Cosmetic item fixes were also copied back into `/workspace/moonk-cosmetics`.

**Stand look (Quest-minded):** wood-grain, stone, and plaster canvas textures capped at 256px; matte roughness; one brass accent (`#b08d4f`); no glow, emoji, or filler copy. Beveled counter, pedestal tops, dais, mirror frame, and button faces (`RoundedBoxGeometry`). Nameless decor meshes are merged by material; named loco solids stay separate. Button faces have visible bevel and 16 mm press travel; selected / pressed state uses the accent; disabled Buy/Equip reads muted. Click sound is `sfx.tap` via `onPress` (plus `unlock()`), haptics unchanged. Signs that used to request 768/512 canvases still cap at 256px, with font sizes scaled so "WARDROBE" and labels stay legible. Mirror: thicker beveled wood frame with a thin accent lip, Reflector 384×~538, slightly dimmed (`0xb8b3aa`) so the preview monkey is readable.

**Paint Bucket and other weak items** (new gray monkey, commit `900e206`; attach points unchanged): `hat_bucket` sat high because the old narrow pail (r=0.13) only kissed a ~0.22 m skull. The pail is now wider and lower over `head_top` (bottom r=0.17, center y=0.03) with a half-torus bail and a front drip. Also refined on the new rig: `hat_leaf_halo` (lower, fuller), `face_snorkel` (sits on the bigger muzzle), `face_hud_visor` (matte smoked teal, no emissive, under the brow), `hand_glow_bands` (brass + dark rings, no cyan glow). Re-checked the hat, face, and hand lineups — banana cap, beanie, propeller, party, cork, antenna, mustache, shades, monocle, boxing gloves, and the other hand items still sit cleanly; no new brow/muzzle clips that needed a revert.

**Buy debounce:** ignore Buy while a request is pending; `shop.endBuy()` on every `{t:'buyres'}` (ok or fail) starts a 400 ms cooldown. Same 3 s pending timeout still clears a hung buy.

**Performance (shop group only, mannequins still dominate):**
- Before: 601 meshes, 25,322 tris, 122 materials, textures up to 768×128.
- After: 588 meshes, 28,142 tris, 123 materials, all canvas textures ≤256px.
Mesh count dropped (merged decor). Tris rose ~11% from the bevels on the counter, buttons, pedestal tops, dais, and frame — accepted for the sharper edges. Textures are now Quest-sized.

**Before / after shots** (same cameras; after-mirror uses the lookAt compensation + loco lock so the glass is actually in frame):
- `screenshots/overnight/before-spawn.png` / `after-spawn.png`
- `screenshots/overnight/before-stand.png` / `after-stand.png`
- `screenshots/overnight/before-buttons.png` / `after-buttons.png`
- `screenshots/overnight/before-mirror.png` / `after-mirror.png`
- Close-ups: `before-rig-cosmetic-{bucket,snorkel,hud-visor,glow-bands,leaf-halo}.png` and matching `after-rig-cosmetic-*.png`
- New-rig lineups: `before-rig-{hats,faces,hands}.png` / `after-rig-{hats,faces,hands}.png`
Pairs were read; every kept change is clearly better (readable signs, beveled EQUIP/BUY, bucket on the crown, snorkel on the muzzle, matte visor, brass bands, fuller halo, thicker mirror frame).

**Tests (1:21 AM Arizona / America/Phoenix):**
- `node scripts/shop-inventory-test.mjs` — **35/35 passed**
- Shop poke / collider harness (`shop.runColliderTest()` in the live client): **passed**. 0.1 m hand-sphere body displacement is 0 on tabs, Buy, Equip, and a pedestal plate (legacy unclipped solids still measure up to 0.18 m). Button travel 16 mm, fires once, returns to rest.
- `node scripts/loco-test.mjs` — **ALL PASSED**
- Full `npm test` (required before this commit) — **ALL PASSED**: loco, cosmetics-wire (including the rate_limited flood check), monster, two-client.

**Connected buy-and-equip on live 8830** (Vite `https://localhost:5190` `/ws` proxy, real client, private room `FDCC`; did not restart or replace that server, which is on Netcode local commit `609444b`, restarted 12:48 AM):
- Join → `inv` 100 Moons, starters `hat_banana_cap` + `fur_moonk_gray`.
- Five rapid Buy presses on `hat_moon_beanie` sent **one** `{t:'buy'}` (pending debounce). `buyres ok` then `inv` 25 Moons, beanie owned. `endBuy()` armed a ~400 ms cooldown (371 ms remaining when sampled).
- `{t:'buy', id:'face_hud_visor'}` → `buyres ok:false reason:moons`.
- Equip beanie: `{t:'cos'}` sent, preview monkey wore `hat_moon_beanie`, session loadout `{v:1, hat:'hat_moon_beanie', face:null, fur:'fur_moonk_gray', hand:null}`.

**Gap:** `fur_aurora` (`night_lobby_win`) still cannot be granted. The game has no night-lobby flag, so that unlock reason never fires. Not fixed tonight.

## (c) Lobbies — findings and status (MOONK Netcode, 11:27 PM Arizona / America/Phoenix)

### Root cause
1. **Live site has no working server.** https://iceberg-games.github.io/moonk/ loads `/moonk/assets/index-B7M-2EGE.js`. The client picks `?ws=`, then a build-time `VITE_WS_URL`, else `(wss|ws)://location.host/ws`. The live bundle hardcodes `wss://moonk-server.onrender.com`. That host returns HTTP and WebSocket **404 immediately** (not a 15-minute Render free-tier cold start). GitHub Pages cannot host the WebSocket server, so the published game cannot multiplayer until a `wss://` host exists and the client is rebuilt with `VITE_WS_URL`.
2. **Dev URL selection is fine if you use the Vite proxy.** Vite HTTPS `:5190` proxies `/ws` to `ws://127.0.0.1:8830`. `wss://127.0.0.1:5190/ws` works. Opening `ws://127.0.0.1:5190/ws` from the HTTPS page hangs (mixed content / Vite is HTTPS). The game server on **8830** is up; moonk-net on **8787** is a separate package and is not what the v1 client talks to.
3. **"New room" was not private.** `newRoom()` had no `isPrivate` flag, so a room created with **New: Classic / New: Monster** was also a candidate for **Quick play**. Private codes could leak into public matchmaking. The in-world lobby computer path (`termPress`) was also untested — `scripts/two-client.mjs` called `window.__tt.join()` directly.
4. **Failed connects failed silently on the computer.** A close before a successful join left the status as "Not connected" with no Retry. The enter-VR path had a status line, but the lobby computer did not show a clear offline state. Single-player / hub already loaded without a server.
5. Default names are random `MoonkXXX`, so **"Name taken" is unlikely the main lobby bug.** The dead live server + the untested computer path + public/private mix-up explain it better.

Game Maker claims checked: dev game server is on **8830** (yes). `shared/cosmetics.mjs` does **not** import `/workspace/moonk-cosmetics/cosmetics.json` directly — it imports the repo copy `shared/cosmetics.json`, kept in sync with `npm run sync:cosmetics`. The two copies currently match (28 ids). The game server already accepts `{v:1, hat, face, fur, hand}`.

### Fixes (no hosting, no round/monster logic changes, cosmetics wire unchanged)
- `server/server.mjs`: rooms have `isPrivate`. `roomInfo` includes `public: !r.isPrivate`. Quick-join only considers non-private rooms and, if none exist, opens a **public** lobby. **New room** (no `quick`) is **private** (join by 4-letter code). Tick, tag, Yeti form, phases, and catch rules were not touched.
- `src/net.js`: safer `connect()` — previous socket is detached so its close does not mark the new one offline; 8 s timeout; reuse an already-open or in-flight socket to the same URL.
- `src/game.js`: lobby computer shows **"Offline — multiplayer server unavailable"** plus a **Retry** button; `tryConnect()` on page load and on VR enter; close handler runs even if the player never joined; single-player / hub still works. Hidden `?dev=1` hook also exposes `term` for tests. Did **not** rename or reshape `{t:'join', cos:{v:1,hat,face,fur,hand}}`, `{t:'cos', cos:{...}}`, or `snap` `ps[i].c`. Did **not** edit client cosmetics files (`shared/cosmetics.mjs`, `shared/cosmetics.json`, shop / apply / avatar).
- `scripts/cosmetics-wire-test.mjs`: raw-WebSocket checks of that wire (unknown ids and unlock-only rejected; valid loadout appears on `snap.ps[i].c`).
- `scripts/two-client.mjs`: two headless browsers now drive **Quick play**, **New: Classic** + type the code + **Join code** via `termPress`, and the offline/Retry state. Screenshots in `net/screens/`. Existing match coverage kept.
- `package.json` `npm test` now includes the cosmetics wire test.

Backups (copy, original paths kept): `/workspace/backups/moonk/20261109-2316/`.

### Cosmetic ownership — locked inventory wire (updated 12:42 AM Arizona / America/Phoenix)
Join / `{t:'cos'}` / snapshot loadout shape is unchanged: `{t:'join', cos:{v:1,hat,face,fur,hand}}`, `{t:'cos', cos:{...}}`, `snap` `ps[i].c` is the sanitized loadout. MOONK Cosmetics' client adapter (`src/kit/shopInventory.js`, commit 36a04c2) was not reverted.

Locked server messages (use these; not a generic notice):

- Client → server: `{t:'buy', id}`
- Server → buyer, success: `{t:'buyres', id, ok:true}` followed by `{t:'inv', ...}`
- Server → buyer, failure: `{t:'buyres', id, ok:false, reason}` where `reason` is `'unknown' | 'not_for_sale' | 'owned' | 'moons' | 'rate_limited'`
- Server → that player only: `{t:'inv', moons, owned:[ids], unlocks:[ids]}`, right after the join welcome and after every change
- Equip: if any slot in join `cos` or `{t:'cos'}` is unknown or not allowed, that slot falls back to its default and the server sends that player `{t:'cosrej', slot, id, reason}` where `reason` is `'unknown' | 'not_owned' | 'locked'`. `snap` `ps[i].c` keeps showing the sanitized loadout (rejected slots become defaults, not the previous id)
- An unlock sends `{t:'unlock', id, items:[ids], reason}`, then `inv`. `id` is the item id, `items` is the granted item ids, `reason` is the catalog unlock key (`hub_visits_5`, `tag_catches_25`, `tag_streak_3`)

Server inventory is authoritative. Fresh wallets start at 100 Moons with starter ids (`hat_banana_cap`, `fur_moonk_gray`) in `owned`. Paid items must be bought; unlock-only items (`hat_antenna`, `fur_nebula`, `fur_aurora`, `hand_glow_bands`) stay in `unlocks` once granted. Wallets persist in `server/inventory.json` (gitignored), keyed by logged-in account name or client `did`. Buy burst is 3 per 2 s.

Unlock hooks (progress is persistent on the wallet; catch **rules** are unchanged). A normal tag, a horror catch, and an erupt catch (Burrower state 3 / `def.erupt`, same catch line as other horror tags in Game Maker's 900e206 hunks) all call `onCatch` / `onTagged` like any catch, so they count toward `tag_catches_25` and `tag_streak_3`. `hub_visits_5` is granted after 5 distinct America/Phoenix calendar days on that wallet. **`night_lobby_win` / `fur_aurora` is not granted yet** — there is no night-lobby flag on rooms.

Generator fills still emit `{t:'ev', k:'gen', coin}` and now also credit the server wallet and send `inv`.

Did not edit client cosmetics files. Game Maker's Burrower/Mimic server hunks (state 3/post, noTag, erupt catch, private/revealOnTag, `abpost`, Mimic snapshot masking) were kept intact; inventory hooks sit on top of HEAD `263c350`.

`scripts/cosmetics-wire-test.mjs` spaces every reason/success `{t:'buy'}` by 2.2 s so they cannot trip the burst; one explicit back-to-back test still asserts `rate_limited` on the 4th buy. Backups: `/workspace/backups/moonk/20261110-0025/`.

### Test output (11:25 PM, updated 12:42 AM Arizona / America/Phoenix)
- `/workspace/vrtag/net`: `npm test` — **44/44** moonk-net checks passed in 6 s.
- `/workspace/vrtag`: `node scripts/loco-test.mjs` — LOCO ALL PASSED; `node scripts/cosmetics-wire-test.mjs` — ALL PASSED (5 wire checks); `node scripts/monster-test.mjs` — MONSTER TESTS PASSED; `node scripts/two-client.mjs` — ALL PASSED, including:
  - offline hub + "Offline — multiplayer server unavailable" + Retry
  - two clients Quick play into the same public room (example `PPJR`) via the lobby computer
  - two clients private create + join-by-code (example `EDWA`) via the on-screen keyboard
  - existing two-client match, tag, Yeti, Grinner, duplicate-name coverage
- Screenshots: `net/screens/lobby-offline-terminal.png`, `lobby-public-quickjoin-terminal.png`, `lobby-private-code-terminal.png`, `lobby-private-code-joiner-terminal.png` (plus matching 3D views). The terminal canvases are the clear read; the 3D views show the panel from the spawn side (the mesh faces +Z, so text is mirrored there — pre-existing hub orientation, not changed tonight).

- **12:42 AM:** `/workspace/vrtag` `npm test` — **EXIT 0, ALL PASSED** (loco; cosmetics-wire including spaced buy reasons, explicit `rate_limited`, unlock+inv, snap `ps[i].c`; monster-test; two-client lobby + match). `/workspace/vrtag/net` `npm test` — **44/44** in 6 s. The earlier back-to-back buy `rate_limited` failures in `cosmetics-wire-test.mjs` are fixed.

### How to run in dev
1. Game server already default-listens on **8830**: `node server/server.mjs` (from `/workspace/vrtag`).
2. Client: `npm run dev` — Vite HTTPS on **5190**, `/ws` proxied to 8830.
3. Open `https://localhost:5190/` (or `https://<LAN-IP>:5190/` on a Quest), accept the self-signed cert. On the lobby computer: **Quick play** = public lobby; **New: Classic** / **New: Monster** = private 4-letter code; **Join code** after typing the code. If the server is down, the computer shows offline + **Retry**. Single-player still works.
4. Optional: `?ws=` overrides the socket URL. From the HTTPS dev page prefer the `/ws` proxy (`wss://<host>:5190/ws`) over a raw `ws://127.0.0.1:8830` (mixed content).
5. `npm test` in `/workspace/vrtag` and `npm test` in `/workspace/vrtag/net`. two-client needs the Vite dev server on 5190 and Chrome.

### What still needs a hosted server
The live GitHub Pages build cannot join anyone until a process is reachable at a `wss://` URL and the client is rebuilt with `VITE_WS_URL` pointing at it. Local dev (5190 + 8830) is enough to play with two browsers or two headsets on the same LAN. Nothing was deployed tonight.

### Morning options (no action, no recommendation required tonight)
1. **Render with Colin’s card** — paid starter is about **$7/mo** and stays up. This is the straightforward way to put `wss://moonk-server.onrender.com` (or a new service name) back online, then rebuild the Pages client with that `VITE_WS_URL`.
2. **A no-card host (unverified / weak):** Render’s **free** tier needs no paid plan but **spins down after ~15 minutes idle**, including when no WebSocket messages arrive — a poor fit for a VR lobby. **Fly.io** no longer has a real free tier (short trial, then a card). **Railway** card / free-tier policy is conflicting in 2026 sources — **mark unverified**. No always-on no-card host was verified tonight. GitHub Pages cannot host the WS server.
3. **Ship single-player-only for now.** The lobby computer already tells the player the multiplayer server is unavailable and leaves Retry + local play in place. Dev / LAN multiplayer still works without a public host.

No sign-ups, cards, deploys, or pushes. A local Netcode commit (`net: in-session Moons/inventory, buy/inv/cosrej wire, tests`) lands only `server/server.mjs` inventory hunks, `server/inventory.mjs`, the test scripts, and this section (c). The 8830 dev process (`npm run dev` / `node server/server.mjs` from `/workspace/vrtag`, default PORT) is restarted immediately after that commit so connected `{t:'buy'}` gets `{t:'buyres'}` and `{t:'inv'}`.


### Hour 4 (02:25 AM Arizona / America/Phoenix)

Lobby computer flows were re-verified after tonight's merges (two-client on port **8851**): Quick play public, New: Classic + Join code private, and Offline + Retry all passed. A 3D page.screenshot after the private join timed out waiting on fonts (lobby assertions had already passed). The helper now writes the terminal canvas first and treats the 3D shot as best-effort with a 5 s timeout so a screenshot hang cannot fail the lobby checks.

**Night-lobby flag** so `night_lobby_win` / `fur_aurora` can be granted. Catalog label: "Win a match in a Night lobby". There is no formal `MAPS[id].night` or lighting flag in defs yet; Drowned Lighthouse is documented as a night map in its source comments and the overnight log. Rule, evaluated when a round starts (`startRound`):

- `MOONK_NIGHT=1` forces night (tests); `MOONK_NIGHT=0` forces day.
- Else the room is night if `MAPS[map].night` is set, or the map is `lighthouse`, or the America/Phoenix clock is in **[7:00 PM, 6:00 AM)** (19:00 inclusive, 06:00 exclusive). Constants: `NIGHT_START_HOUR=19`, `NIGHT_END_HOUR=6` in `server/inventory.mjs`.
- `roomInfo` and `snap` include `night: true|false` (cheap room-level field).
- At `endRound`, winners of a night room get `nightWins++` and then `{t:'unlock', id:'fur_aurora', items:['fur_aurora'], reason:'night_lobby_win'}` followed by `inv`. Winner set matches existing `wins++` in horror (monster if the message starts with "Monster", otherwise uncaught monkeys). Classic Tag also grants to runners who survive a `Time!` ending (that path does not increment `wins` today — not changed). An all-infected Classic ending does not grant. Catch / round / monster rules were not changed. Game Maker's uncommitted Lurker/Stringman hunks (`tether`, `release`) were left unstaged.

**Dangler Reel findings (no logic rewrite):** The yank is server-authoritative. On ability go, `abEffect` ray-tests the facing capsule once (`range` 9 m, `radius` 0.55 m) using reported poses and facing from the head quaternion. A hit victim is sent a private `{t:'fling', v, stun:0.5}`; everyone else learns the tongue from the broadcast `abgo` fields `{o, f, len, hit}`. Timing, cooldown, range and who is hit are server rules (monster-test covers tell, hit, miss, off-axis, range, cooldown, fling+stun). **Stun is not server-enforced after the message:** the server stores `stunUntil` on the victim but never reads it (not in `detectTags`, pose checks, or `snap`). The 0.5 s no-grab is applied only on the victim client (`loco.stun` from the private fling). A modded client can ignore stun and keep grabbing, same class of issue Game Maker already noted for the Wailer's gain. Remotes also cannot see stun in snapshots. Suggested (not done): put remaining stun on `snap` `ps[i]` and/or have the server reject grabs/tags from a stunned player.

**Tests (02:25 AM Arizona / America/Phoenix):**
- `/workspace/vrtag` `npm test` — **EXIT 0, ALL PASSED** (~4 min). Netcode scripts use ports **8851** (two-client) and **8852** (cosmetics-wire, plus 8853 for the day-forced control). cosmetics-wire includes night-hour unit checks, `roomInfo`/`snap` `night:true`, night-win unlock+inv+equip `fur_aurora`, and `MOONK_NIGHT=0` does not grant.
- `/workspace/vrtag/net` `npm test` — **44/44** in 6 s.

**Commits (local only, never pushed):** `a357d3c` (moonk-net package) and `659c0b0` (night-lobby flag + tests + this section). Files in those commits are Netcode's only: the uncommitted `net/` package, `server/inventory.mjs`, night-flag hunks in `server/server.mjs` (Game Maker's uncommitted `tether`/`release` hunks were not staged), `scripts/cosmetics-wire-test.mjs`, `scripts/two-client.mjs`, `.gitignore` (`server/inventory.json`), and this section (c) update. Did not stage other bots' dirty files (`scripts/monster-test.mjs`, `killers-client-test.mjs`, `loco-test.mjs`, `src/maps/lighthouse.js`, screenshots, shop polish, etc.). Did not revert Cosmetics or Game Maker work. Backups: `/workspace/backups/moonk/20261110-0214/`. The 8830/`npm run dev` tree is restarted after these commits so the night flag is live on the dev server.

## Map Builder: Hollow Shaft (00:2x)
- Map: **Hollow Shaft** (`mine`, horror / Be the Monster, abandoned mine). `src/maps/mine.js`, registered in `src/maps/index.js`. Status: **done**: votable (MAPS + GEN_SPOTS in shared/defs.mjs, hub portal at x=18, ZONES in game.js), build + `npm test` pass (00:23).
- Stats: 31 draws, ~16.2k tris, 231 colliders (box/cyl/sph), 1 point light (amber lantern at the loading bay) + hemisphere, no sun, no realtime shadows. Gameplay checks pass (spawn, scoreboard, generator clearance, every perch connected, 96% of elevated perches in one network). Screens: `screenshots/overnight/mine-*.png` (`mine-ingame-*` are from the real game page).
- Layout: 10 m deep Hollow Shaft pit with 4-post headframe to 17 m and spiral wall ledges; square timber trestle at 8 m with 4 collapsed stretches (3.3 m gaps) and 4 bridges from the headframe; cart-rail ring with ore carts, timber gate frames, rubble piles (collapsed shafts), crates stepping up to the trestle, stalactites, glowing ore.
- Generators: `MINE_GEN_SPOTS` (exported from mine.js, same format as CARNIVAL_GEN_SPOTS) = `[[12,0,12],[-12,0,13],[-13,0,-12],[12,0,-13],[0,0,-31]]`; server faces them toward the origin (the pit). 1.1 m clearance verified.
- Wiring hunks (insert-only): `shared/defs.mjs` MAPS.mine + GEN_SPOTS.mine; `src/hub.js` PORTALS `{ id: 'mine', ..., x: 18 }`; `src/game.js` ZONES.mine.

## Map Builder: Drowned Lighthouse (01:2x)
- Map: **Drowned Lighthouse** (`lighthouse`, horror / Be the Monster, storm island at night). `src/maps/lighthouse.js`, registered in `src/maps/index.js`. Status: **done**: votable (MAPS + GEN_SPOTS in shared/defs.mjs, hub portal at x=22, ZONES in game.js), build + `npm test` pass.
- Stats: 19 draws, ~14.5k tris, 237 colliders (cyl/box/sph), exactly 1 dynamic light (a moving SpotLight, the lighthouse beam) + hemisphere, no sun, no realtime shadows. Gameplay checks pass (spawn, scoreboard, generator clearance, every perch connected, 95% of elevated perches in one network). Screens: `screenshots/overnight/lighthouse-*.png` (`lighthouse-ingame-*` are from the real game page via `?dev=1&place=lighthouse`).
- Layout: three rock terraces (tops 0.8/2.4/4.0 m) in a hip-deep sea, joined by 0.27 m stone steps (monsters can walk up); 24 m leaning striped tower with 17 spiral catwalk pads (about 2-3 m hops) and a gallery; keeper's cottage with two 3 m doors and a roof perch; half-sunk dock with 3 m gaps and a wrecked boat; 6 sea stacks (9-12 m) joined into a ring by rope-bridge plank paths plus two long bridges from the tower; tide pools and 4 slick (`slip 0.7`) boulders off the routes.
- Beam: maps have no per-frame update hook, so the sweep (14 s per turn) runs from the beam cone mesh's `onBeforeRender` (time based, safe for both eyes). The SpotLight and the two additive cones live inside the map group; the map returns `lights: []`. Interface wish: an optional `map.update(t, dt)` called from game.js each frame (and the measure tool counts lights in the group).
- Generators: `LIGHTHOUSE_GEN_SPOTS` (exported from lighthouse.js, `[x, y, z]` with y = floor height) = `[[-17,0.8,-17],[17,0.8,-17],[17,0.8,17],[-8.5,4,-4],[7,4,-8]]`; server faces them toward the origin (the tower). 1.1 m clearance verified (verify-maps.mjs now reads `<ID>_GEN_SPOTS` from any map file and ignores the floor a spot stands on).
- Wiring hunks (insert-only): `shared/defs.mjs` MAPS.lighthouse + GEN_SPOTS.lighthouse; `src/hub.js` PORTALS `{ id: 'lighthouse', ..., x: 22 }`; `src/game.js` ZONES.lighthouse.

## Game Maker hour 2 (00:17-)
- **Gray monkey** (src/kit/monkey.js, attach points and fields unchanged): heavy two-lobe brow ridge, wider lighter muzzle + chin + face mask, cheek tufts, bigger ears, hunched trapezius + lighter chest patch, chunkier fists with 4 knuckles and a bigger thumb, wider smile. ~14 more small meshes. Before/after: `monkey-before.png`, `monkey-after.png`; cosmetics check (hat + face + fur + gloves on two monkeys): `monkey-after-cosmetics.png`. Note: `hat_bucket` floats well above the head; that was already true before my change (Cosmetics' hat offset).
- **Burrower + Mimic**: see table. Generalised ability state machine: state 3 (`post`) after the active window, `noTag` states, `erupt` catch override, `private` + `revealOnTag` (Mimic). Events: `abpost`. See docs/DESIGN.md 3c.
- Limits: positions are client-reported, so the server enforces timing/cooldown/tag rules, not underground speed. The Mimic is a visible monster until its first disguise (the round start names it); everyone could remember who it was. The disguise hides role flags from the snapshot, not from a player's memory.
- **Locust redesign (item 3)**: hunched rust-armoured brute on two thick legs (no wings/antennae/grasshopper cues): wide flat skull, huge underbite of long fangs (2 merged cone meshes), crooked horn + broken stub, mismatched amber/red glowing eyes, plated spiked back, clawed hands; jaw flexes. Same stats (2.2 m/s, reach 2.2). Screenshots: `locust-new.png` (with Yeti for scale), `locust-closeup.png`.

## Team note (Jojo, 2026-11-10 01:24)
Concurrent `npm test` runs on the default ports 8841/8842 hang. If another bot may be testing, use your own ports, e.g. Game Maker 8841/8842, Netcode 8851/8852, Cosmetics 8861/8862, Map Builder 8871/8872 (env or flag your test harness supports), or check with `ss -ltn` first.

## Game Maker hour 3 (01:16-)
- **Dangler + Wailer** (rows above). Server: `abEffect(r, p, ab)` in server/server.mjs runs once when an ability turns active and its return value is merged into the `abgo` event. Reel: `{o, f, len, hit}` (head position, unit facing, tongue length, hit runner id or 0). Shriek: `{n}`. Reel's victim gets `{t:'fling', v, stun}` privately; Shriek's runners get `{t:'shr', gain, ms}` privately and the Wailer gets `{t:'ping', ids, ms}`. Client: `loco.stun` (no grabbing) and `loco.gain` (release multiplier) in src/physics.js; sfx inhale/shriek/thwip/snap/slurp in src/audio.js; looks `dangler`/`wailer` in src/avatar.js (tongue + rings live on the avatar root; local Wailer hides its own torso so teeth are not in its face).
- Limits: positions are client-reported, so the Dangler's hit is decided on reported positions (timing, range, cooldown and who is hit are server rules, not exact movement). A runner behind a wall can still be hit (the ray ignores walls on purpose: the tongue is a threat you dodge by sidestepping, not by cover). The Wailer's gain is applied by the client (a modded client could ignore it; the server speed cap is the real limit).
- Tests: scripts/monster-test.mjs (tell/cooldown/ray hit and miss/yank + stun/range/ping privacy), scripts/loco-test.mjs (gain halves push-off, stun blocks a stroke), new scripts/killers-client-test.mjs (two real browsers on port 8843: yank lands, shriek sets `loco.gain` 0.5 and it returns to 1). Full `npm test` green.
- **Lighthouse wiring**: Map Builder committed the wiring in 039fc23, but the `GEN_SPOTS.lighthouse` line landed AFTER the closing brace of the GEN_SPOTS object (a stray label statement, so `GEN_SPOTS.lighthouse` was undefined and the map had no generators). Fixed in my commit (moved inside the object). Hub portal x=22, MAPS and ZONES verified present.
- **Yeti model pass (item 3)**: `buildYeti` in src/avatar.js rewritten (hunched shaggy ice brute instead of a snowman): deep-set dark face under a brow shelf, two uneven glowing slit eyes, wide hinged jaw (animated) with ~17 teeth + two long lower tusks, ram horns (right one broken), swept-back mane spikes, shoulder humps + hunched back, frost-blue chest scar, ragged fur skirt over the mound, big long-clawed hands. Stats, form switch (human <-> yeti), `armGain`/`armLength`, scale 2.6, look name `yeti` and hand/head attach points unchanged. Before/after: screenshots/overnight/yeti-before.png, yeti-after.png, yeti-after-closeup.png.
- **Mimic mouth (item 3b)**: the flat red oval is now a raised red flesh rim (torus) around a dark-red well and a black throat with a wet tongue ridge, two staggered rows of teeth (~34 cones, one merged mesh), torn lip ridges, and the dark seam continues over the brow and chin; the glowing eyes moved clear of the maw. Same `m.anim` open/close hook. Before/after: screenshots/overnight/mimic-before-maw.png, mimic-after-maw.png.

## Game Maker hour 4 (02:10-)
- **Item 0**: `node scripts/loco-test.mjs` passed at the start (no regression from tonight's merges).
- **Lurker + Stringman** (rows in the Killers table). Server (server/server.mjs): new ability flag `release` (the button during state 2 ends it early; the tick then moves to state 3), and an `abEffect` branch for `tether` (cone + range pick, private `{t:'tether', o, r, ms}` to the victim, `abgo` carries `{o, hit, ms}`). Lurker `noTag` is [1,2] (no tag in the tell or while clinging); its pounce is the existing form `erupt` override on state 3 (2.0 m, 0.05 s). Client: `LOCO.cling()` (gravity off, stand-off from the surface, surface-following crawl) and `LOCO.leash` (soft spring to an anchor) in src/physics.js; string drawn in src/game.js `tetherFrame`; sfx `scrape`/`creak` in src/audio.js.
- Limits: positions are client-reported, so cling and leash movement are client-side (like Burrow/Lunge); the server enforces timing, cooldown, no-tag-while-clinging, the pounce window and who gets tethered. A modded client could ignore the leash or cling off-surface; the speed cap is the real limit.
- Tests: scripts/monster-test.mjs (tell, cooldown, noTag while clinging, release, pounce catch, tether hit/miss/cone/range, victim-only message), scripts/loco-test.mjs (cling follows wall/ceiling, leash holds at 2.5 m, lapses), scripts/killers-client-test.mjs (Stringman leash on the victim client, Lurker cling replicated + button into pounce; in-game screenshots).
- **Gulper + Grinner model pass** (stats, names, attach points unchanged): Gulper has a lopsided wet jaw (shiny Phong) with gum flesh, staggered teeth of varied sizes, knuckle-walking arms with real knuckles and fur/skin tufts. Grinner has a too-wide grin with gums and a deep dark mouth, tooth rows, corner cracks, a swivel neck with vertebra ridges, long jointed spindly fingers and a cracked pale skin palette. Shots: screenshots/overnight/gulper-before.png / gulper-after.png / gulper-after-closeup.png, grinner-before.png / grinner-after.png / grinner-after-closeup.png (grinner-before-closeup.png too).
- Unfinished / caveats: Lurker/Stringman in-game shots are third-person from the other client (no VR headset on the box). Gulper/Grinner got one polish iteration only; the Grinner mouth reads as flat gum discs from the side.
