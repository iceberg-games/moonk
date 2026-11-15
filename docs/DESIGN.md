# MOONK design notes (lead designer)

VR only (Meta Quest Browser, WebXR). No bots, no AI players, ever. Server authoritative for roles, forms, catches, votes.
Nothing here has been tested on a real headset. See "Untested" at the end.

## 1. Locomotion (src/physics.js, `LOCO` + `Locomotion`)

Monkeys have no legs and no thumbstick. Everything is hands pushing off surfaces.

How a frame works (`Locomotion.step`):
1. Each hand is a 0.1 m sphere. Its path from last frame to this frame is **swept** (a sample every <= 5 cm, then a 6-step bisection), so a 20+ m/s swing can not tunnel through a 4 cm wall.
2. If the hand touches (sphere + 1 cm skin) it **sticks at the contact point**. The part of the hand's move that the surface blocked is applied to the body **negated** (hand pushes down, you go up; hand pulls down a wall, you climb).
3. While any hand holds, the body is kinematic (no gravity, no drift). Wall climbing, hanging from branches and ceilings all fall out of this one rule.
4. When the last hand lets go, velocity = average hand-driven body velocity over the last 65 ms x `jumpMultiplier`, capped at `maxJumpSpeed`. The window is time based, so 72/90/120 Hz give the same jump (checked in `scripts/loco-test.mjs`: apex differs by < 2 cm).
5. In the air: exact constant-gravity integration, exponential drag. No fixed-step accumulator needed.
6. Body: a head sphere (0.2 m) and a torso sphere (0.2 m, 0.45 m below the head). Both push the whole play space out of walls. Resting head height is 0.65 m, so hands hanging at hip height reach the floor (the Gorilla Tag stance).
7. Visual/sent hands (`loco.vis`) are pushed out of surfaces and clamped to 1.0 m from the head.

| Constant | Value | Why |
|---|---|---|
| `handRadius` | 0.10 m | Forgiving on thin ledges and branches, small enough to poke a button. |
| `skin` | 0.01 m | Contact margin so a hand held still does not flicker touch/release. |
| `armLength` | 1.0 m | Only clamps tracking glitches / blocked bodies; real arms are ~0.7 m. |
| `maxHandSpeed` | 30 m/s | Faster frames are treated as tracking loss and ignored (no free launches). |
| `sweepStep` | 0.05 m | Half a hand radius: no tunnelling. |
| `velWindow` | 0.085 s (was 0.065) | Time window, so 72/90/120 Hz match. |
| `peakWeight` | 2 (new) | Release velocity = mean of per-frame velocities weighted by speed^2 x dt (peak-weighted), never above the fastest single frame: a hard swing that slows before release still counts at ~peak. |
| `jumpMultiplier` | 1.4 (was 1.2) | Snappier. Both hands add (sum), so a hard two-hand stroke reaches the cap. |
| `wallPushBonus` / `wallNormalY` | 1.2 / 0.35 (new) | Launching away from a near-vertical surface (|normal.y| < 0.35) gets +20%: wall kicks and climb-flings feel strong. Climbing itself stays 1:1 with the hands, no lag. |
| `maxJumpSpeed` | 9.0 m/s (was 6.5) | The monkey speed ceiling that all monster speeds are balanced against (Locust 2.2 and Yeti 3.5 still cannot catch a monkey in a straight line). |
| `minReleaseSpeed` | 0.35 m/s | Below this you just drop. |
| `maxSpeed` / `maxFall` | 9.5 (was 9.0) / 25 m/s | Horizontal and upward air cap; falls are capped separately so a drop does not bleed sideways speed. |
| `gravity` | 9.8 m/s^2 | Real gravity; the 6.5 m/s cap gives the floaty feel, not a low g. |
| `airDrag` | 0.02 /s (was 0.12) | Almost none: 6 m/s -> 5.88 m/s after 1 s. |
| `headRadius` / `bodyRadius` / `bodyDrop` | 0.2 / 0.2 / 0.45 m | You cannot put your head or torso through geometry. |
| `slideNormalY` | 0.6 (~53 deg) | Body resting on a steeper surface slides down it. |
| `groundFriction` / `slideFriction` | 2.2 (was 7) / 0.4 per s | You skid ~2.6 m from 6 m/s instead of stopping dead. |
| collider `slip` (optional, 0..1) | 0 | Per-collider slipperiness, e.g. ice: hand grip loses its sideways part and the body skids. **Map Builder: add `slip: 0.9` to a collider to make it icy**, nothing else is needed. |

Walker (Locust, Yeti): `Locomotion.walk`, left stick relative to where the head looks, right stick snap 30 deg (or smooth turn if `save.smoothTurn`), gravity, 0.35 m step-up, 0.3 m body radius against walls.

Hand extension (Yeti form): the client multiplies the hand offset from the head by `armGain`, capped at `armLength`. The server rejects hands more than `armLength + 0.3` m from the head.

## 2. Modes

Only two modes. Casual and Freeze do not exist.

**Classic Tag** (`normal`): one random player is IT and gets 1.5 s before they can tag. A hand within 0.6 m of a runner's head (or the head within 0.8 m) infects them; a freshly infected player can not tag for 2 s. Ends when everyone is infected (message names the last tagger) or when the **180 s clock** runs out (runners who are still clean win). The clock is a stalemate guard that v1 did not have.

**Be the Monster** (`horror`): one monster per round, rotated so nobody is monster twice in a row. Monster type is `random` unless the host picked one. Round is **120 s**. The monster wins by catching every monkey; the monkeys win by surviving until the timer ends. Caught monkeys become ghosts (spectate). Generators are back as a **side objective** (`GEN_ENABLED=true`): see section 3b.

Between rounds (**~30 s**): 6 s result screen, then a 24 s map vote (Classic: 15 s vote), 3 s countdown. Three maps on the ballot, most votes wins, tie = random, no votes = same map. Fewer than 2 humans returns the room to the lobby. The monster leaving restarts the vote.

## 3. Monster balance

Monkey reference: burst 6.5 m/s off a push, realistic sustained travel on open ground 3-4.5 m/s, much slower in tight terrain, faster up and down trees.

| | Locust | Yeti, human form | Yeti, yeti form |
|---|---|---|---|
| Look | hunched rust-armoured brute on two thick legs (redesigned hour 2; no longer insect/grasshopper): wide flat skull, huge underbite with long fangs, one long crooked horn + one broken stub, mismatched amber/red eyes, spiked plated back, clawed hands, 1.45x | human with legs | huge, legless, 2.6x |
| Movement | stick walk **2.2 m/s** | stick walk **3.5 m/s** | stick walk **0.3 m/s** |
| Can tag | yes | **no** | yes |
| Reach | 2.2 m from head or hands | n/a | hands only: grab radius 0.9 m around a hand that can be up to **3.2 m** from the head (hand = 4.5x real offset). Effective reach ~4 m |
| Catch time (monkey inside reach) | **0.05 s** within 1.0 m, rising to **0.6 s** at 2.2 m | n/a | **0.12 s** within 0.5 m of a hand, **0.35 s** at 0.9 m |
| Catch cooldown | 0.3 s | n/a | 0.6 s |
| Switch | none | 6 s cooldown (from the START of the last switch), server enforced | same |
| Transform tell | none | **0.4 s**: monster swells/shakes, frozen, cannot tag; everyone gets the formstart event + sound | same |
| Counter | outrun it (it is slower than a push), stay out of its 1 m kill zone, use vertical terrain: it can only walk up 0.35 m steps | a "normal-looking" player who walks faster than a monkey drifts on the ground; watch for the tell | stay > 4 m away or put geometry between you; it cannot chase; you must go past it when it parks on a chokepoint |

Why these numbers:
- Locust 2.2 vs monkey 6.5: monkeys always win a straight chase, so the Locust wins by ambush and by the close-range speed. The catch time shrinking with distance means grazing its edge is survivable (you keep moving for 0.6 s) but being adjacent is not.
- Yeti human 3.5 m/s is about a monkey's sustained speed on open ground, so it keeps up and blends in, but it can not burst.
- Yeti form is almost a turret: 0.3 m/s. Its threat is a 4 m sphere. The 0.4 s tell lets a monkey at 6.5 m/s cover up to ~2.6 m, so a monkey that is 1.5-4 m away when the yeti starts to swell can still get out of range; one already within arm's reach cannot. The 6 s cooldown means a yeti that commits stays committed for >= 5.6 s after the flip.
- Server never trusts a client for speed, form or catch. Positions are client sent poses (as in v1); the server checks distances, long-arm clamp, cooldown and the tell.

Tuning knobs, all in `shared/defs.mjs`: `move.speed`, `reach`, `near`, `nearT`, `farT`, `tagCooldown`, `armGain`, `armLength`, `switchCooldown`, `FORM_TELL`.

### 3b. New killers (overnight hour 1) and generators

Both are added through `MONSTERS` in shared/defs.mjs with a new `ability` field: `{id, name, cooldown, tell, active, ...}`. The server enforces the cooldown (counted from the START of the last use), the tell and the active window. Models are hand built from primitives in src/avatar.js (`buildGulper`, `buildGrinner`; merged cone clusters for teeth, a per-look `anim` hook).

| | **Gulper** | **Grinner** |
|---|---|---|
| Look | lopsided 1.3x blob with a huge hinged jaw, ~40 teeth, one big eye and one tiny eye, knuckle arms | 1.5x tall, wobbly body, giant swivelling head, oversized crescent grin full of teeth, glowing slit eyes |
| Move | stick walk **3.0 m/s** | stick walk **2.4 m/s** |
| Reach / catch | 1.4 m, 0.08 s near to 0.3 s far; cooldown 0.4 s | 2.0 m, 0.1 s near to 0.45 s far; cooldown 0.5 s |
| Ability | **Lunge**: 0.5 s jaw-open tell (frozen, cannot tag, chomp sound), then a **0.45 s dash at 10.5 m/s** (~4.7 m) with a much bigger catch (2.0 m, 0.03-0.1 s) | **Blackout**: 0.6 s giggle tell (cannot tag), then **3 s** where every monkey within 12 m gets fog closed in to ~3 m and the lights dimmed (client-side effect, server times it) |
| Cooldown | **8 s** | **15 s** |
| Counter | keep > 5 m away, or dodge sideways after the jaw opens (the dash is locked in a straight line) | stay out of 12 m, or move by memory and feel; the grin and giggle are loud |

Why: Gulper is a burst threat on top of a speed advantage (3.0 vs Locust 2.2), Grinner is a slow, long-armed denier of vision. Neither crawls like an insect and neither repeats Locust's distance dwell or Yeti's disguise. Honest limit: positions are still client-reported, so the server enforces timing, cooldown, tell and tag rules, not dash distance.

Protocol additions: client `{t:'ab'}` (use the signature ability, or switch form for Yeti-style monsters); snapshot player fields `ab` (0 idle, 1 tell, 2 active) and `ac` (cooldown seconds left); events `abstart {by,id,ms}`, `abgo`, `abend`, `abdenied`.

**Generators (valve)**, `src/generators.js` + `{t:'valve'}`: a monkey squeezes a grip within 0.32 m of the valve and turns the wheel; clockwise fills, anticlockwise drains. The server owns the level (`GEN_TURNS=2` full turns = full, rate capped at 9 rad/s, hand within 1.3 m of the valve), spawns 3 (or 4 with 6+ players) per horror round from `GEN_SPOTS[map]` (missing key = none) and pays `GEN_COIN=1` Moon once to whoever fills it (`gen` event with `by` and `coin`; the client adds it to its saved Moons). Filling every generator does NOT end the round; it is a side objective (the round still ends on catch-all or 120 s).

### 3c. Burrower and Mimic (hour 2)

| | **Burrower** | **Mimic** |
|---|---|---|
| Look | segmented gray-pink worm, ring mouth of inward-pointing teeth, lopsided | the kit monkey; face splits open into a toothy maw |
| Move / reach | stick walk **2.6 m/s**, reach 1.3 m (0.08-0.3 s) | stick walk **2.8 m/s**, reach 1.5 m (0.1-0.35 s) |
| Ability | **Burrow** (state 1 tell 0.45 s, state 2 underground **2.5 s** at 7 m/s: hidden, cannot tag, dirt ripple shows where; state 3 erupt **0.5 s**: 2.2 m catch in 0.02-0.08 s) | **Disguise** (state 1 tell 0.3 s, state 2 **6 s** as a plain monkey with another player's name + loadout, can tag; state 3 unmask **0.8 s**, loud, visible to all) |
| Cooldown | **14 s** | **20 s** |
| Counter | the ripple is the tell: back away from it, climb; it surfaces where it ends | count names: two of the same name = one is the Mimic; stay near people, watch who walks like a walker |

Generic ability fields: `tell`, `active`, `post` (state 3 length), `noTag` (states that cannot tag, default [1]), `private` (start/go events only to the monster), `revealOnTag`. A form may carry `lunge` (state 2) or `erupt` (state 3) catch overrides. Snapshot state `ab`: 0 idle, 1 tell, 2 active, 3 post.

Mimic identity: the server holds it. While a Mimic is in state 2, every client except the Mimic receives its entry rewritten (`ro:'monkey'`, `n` = a real player's name, `c` = that player's loadout, `fo:null`, `ab/xf/ac:0`, `it:false`, `tg/sv/w:0`); the Mimic's own client gets the true entry plus `dg` (the fake name; shown as "DISGUISED as NAME"). `abstart`/`abgo` go only to the Mimic. Tagging or the timeout switches to state 3 and broadcasts `abpost`. Test: scripts/monster-test.mjs ("no role flag or disguise flag leaks...").

### 3d. Dangler and Wailer (hour 3)

| | **Dangler** | **Wailer** |
|---|---|---|
| Look | tall iron rig + hook, long rubbery neck, blind drooping head, hinged jaw of hooked fangs, thin arms, no legs | floating ragged shroud split by one vertical needle-toothed mouth, pale slit eyes, thin arms, no legs |
| Move / reach | stick walk **2.4 m/s**, reach 1.3 m | stick walk **2.9 m/s**, reach 1.7 m |
| Ability | **Reel**: tell 0.5 s (throat swell, frozen), then one server ray test along the facing line: 9 m, capsule 0.55 m, nearest runner. Hit = flung ~4 m toward the Dangler + 0.5 s hand stun. Miss = nothing. | **Shriek**: tell 0.6 s inhale (frozen), then every runner within 10 m: push-off gain x0.5 for 2.5 s; the Wailer is pinged to them for 1.5 s |
| Cooldown | **12 s** (from the start of the last use) | **16 s** |
| Counter | the swell is the tell: step off the facing line (cover does not help, the ray ignores walls); never hang still in front of it | the inhale is the tell: be more than 10 m away when it ends; while weakened hold and climb instead of launching, and expect it to know where you are |

Server: `abEffect(r, p, ab)` runs once when state 2 starts; its result is merged into `abgo` (`reel`: `o`, `f`, `len`, `hit`; `shriek`: `n`). Private messages: `fling` gained an optional `stun` (seconds the victim cannot grab), `shr` `{gain, ms}` (victims only), `ping` `{ids, ms}` (the Wailer only).

### 3e. Lurker and Stringman (hour 4)

| | **Lurker** | **Stringman** |
|---|---|---|
| Look | flat wide legless pale slab, mouth lid with needle teeth along the whole front edge, cluster of mismatched glowing eyes on top, four long bony multi-jointed arms | cracked ventriloquist doll hanging by strings from a floating wooden cross-bar, hinged jagged jaw, too-wide painted eyes, limp arms, no legs |
| Move / reach | stick walk **2.5 m/s**, reach 1.4 m, scale 1.3 | float **2.6 m/s**, reach 1.5 m, scale 1.25 |
| Ability | **Cling**: tell 0.5 s (claw scrape, grit), then 4 s stuck to any wall/ceiling collider: gravity off, surface-following crawl at 3.0 m/s. No tagging while clinging. Button or timeout -> 0.4 s **Pounce** window with a bigger catch (2.0 m, ~0.05 s) | **Tether**: tell 0.5 s (strings glow and creak), then the nearest runner within 8 m in a 35 deg half-angle of the facing line is tied to the hit point for 2.5 s and cannot get more than 2.5 m from it. A miss still costs the cooldown |
| Cooldown | **14 s** (from the start of the last use) | **15 s** |
| Counter | the scrape/grit is the tell: look up and away from walls; after it drops you have 0.4 s of nothing, then it is slow again | the creak is the tell: break the 35 deg cone or be more than 8 m away; once tied, climb or swing around the anchor instead of running |

Server: ability flag `release` (the button in state 2 ends the active window early, the tick then moves to state 3); `noTag: [1,2]` for Lurker; the pounce reuses the form `erupt` override that Burrower uses for state 3. `abEffect` handles `tether`: nearest runner by head distance inside range and cone, private `{t:'tether', o:[x,y,z], r, ms}` to the victim, `abgo` carries `{o, f, hit, ms}` (hit = 0 on a miss). Client: `Locomotion.cling(dt, cols, rp, headL, stick, yaw, speed)` (probe against colliders, stands off by head radius + 0.1, gravity off, `clinging` flag) and `Locomotion.leash = {o, r, t}` (soft spring applied inside `step()`, lapses after `t` s). Positions are client-reported, so the server enforces timing, cooldown and who is hit, not exact movement. Tests: monster-test, loco-test, killers-client-test.

Model pass (hour 4): Gulper and Grinner rewritten at the Yeti/Locust/Mimic level (stats, names and attach points unchanged); see OVERNIGHT.md "Game Maker hour 4".

### Map update hook

A map object returned by a `src/maps/*.js` builder (and by `buildHub()`) may define an optional `update(t, dt)`. `src/game.js` calls `S.map.update?.(t, dt)` once per rendered frame for the currently loaded place, before input and physics: `t` = seconds since that place was last loaded (reset to 0 on every `loadPlace`, even when the built map is cached), `dt` = frame seconds (clamped to 0..0.05). Maps without it are unaffected. Use it for animation that should not depend on `performance.now()` or `onBeforeRender` tricks; keep it cheap (it runs every frame, in VR on both eyes' single update).

## 4. Protocol changes (for Netcode, minimal)

- Snapshot player entries gain `xf` (ms left on the transform tell, 0 if none), `xt` (form being switched to) and `fc` (seconds until the monster may switch again).
- New event `{t:'ev', k:'formstart', by, to, ms}` when a switch begins. The existing `form` event now fires when the form actually flips (0.4 s later). `formdenied` is unchanged.
- `MODES.normal.round` (180) is new: the server now sets `phaseEnds` in Classic.
- Join/`cos` equip now passes through `authorizeEquip` (see 5).
- Hour 3: new server -> client messages `shr {gain, ms}` and `ping {ids, ms}` (private), `fling` gains an optional `stun`, and `abgo` events carry ability data (`o`, `f`, `len`, `hit` for reel). No new client -> server message.
- No client message was added or removed. Mode keys stay `normal` and `horror` on the wire; only display names changed (Classic Tag, Be the Monster).

## 5. Cosmetics and the shop stand

**Single source of ids:** `/workspace/moonk-cosmetics/cosmetics.json` (append-only; never rename or reuse an id). The client bundle can not import outside the repo, so `shared/cosmetics.json` is a synced copy, and `shared/cosmetics.mjs` loads it (28 items, `fur_moonk_brown` = 60 Moons, Moons only). Run **`npm run sync:cosmetics`** to refresh it; the same script also syncs the kit's `shopStand/loadout/geom/cosmetics/*` into `src/kit` (not `monkey.js`: vrtag's copy has the `head`/`arms` fields the avatar needs). `shared/cosmetic-ids.json` was removed. `shared/cosmetics-ids.js` re-exports the same module for the browser.

Wire loadout is `{v:1, hat, face, fur, hand}`. `sanitizeEquip` accepts the old shape without `v` and always returns `v:1`. The server has no inventory: it treats shop items as owned (Moons live in the client save) and **rejects the four unlock-only ids** (`hat_antenna`, `fur_nebula`, `fur_aurora`, `hand_glow_bands`) for everyone until unlock tracking exists. A patched client can still equip any paid item for free; fixing that needs a server wallet.

The stand sits in the hub at the kit's `SUGGESTED_HUB_PLACEMENT` ([4.9, 0, 6.6], rotation -1.2; east plaza, facing spawn, clear of the terminal). Interaction: hand poke, controller ray + trigger. Its solid parts (counter, pedestals, wall, dais) are concatenated onto the collider list each frame for `loco.step`/`loco.walk` (never pushed onto `S.cols`), and `shop.resolveHand` pushes the posed hands out of them after `shop.update`; the fingertip passed to `shop.update` is raw. The mirror renders at 512 px and only within 9 m.

Netcode's own server runs separately on :8787 (`/workspace/vrtag/net`); ours stays on :8830.

## 6. Future monsters

All fit the rules above: server authoritative, a readable tell, and a counter that uses arm locomotion.

1. **Weaver (spider).** Movement: stick walk 2.0 m/s, can walk on tree trunks (surface-attached, 1.5 m/s). Tag: catch within 1.2 m; also trigger-shoots a web strand (range 8 m, 4 s cooldown): a monkey hand that touches a web sticks for 1.2 s. Counter: pull a web with both hands to snap it, or kick off before it dries; webs do not reach through foliage. VR feel: wrist-flick to throw a web, and you can feel the hand yank tight.
2. **Swooper (bat).** Movement: flies by arm flaps (downstroke gives lift, like the monkey push but in the air), no thumbstick; stamina drains, must perch every 6 s. Tag: dive-bomb contact above 4 m/s only. Counter: duck under canopy, hold on to a wall (a hit on a gripping monkey only stuns the bat), flaps are loud and tell its direction. VR feel: flapping your whole arms is the same motion you already know, now going up.
3. **Mimic.** Movement: ordinary monkey arm locomotion at 85% jump multiplier. Tag: looks like a random monkey's cosmetics, but touch-tags only after a 0.5 s reveal (eyes flare, sound). Counter: a mimic never shows a real player's name tag (replaced by a blank), and its shadow is slightly delayed; group up and compare. VR feel: you hunt by watching how someone moves and who is standing too still.
4. **Burrower (mole).** Movement: stick walk 2.5 m/s, can sink into soft ground (button hold, 0.5 s) and travel at 3.0 m/s as a dust trail only. Tag: pops up and grabs monkeys whose hands or head are within 0.4 m of the ground. Counter: stay on trunks, branches and rock (hard surfaces mark safe), watch the trail. VR feel: makes the floor itself scary and rewards climbing instead of hugging the ground.
5. **Stalker (weeping statue).** Movement: 5 m/s when no monkey looks at it (server checks head quaternion within a 70 degree cone and line of sight), 0.2 m/s while watched. Tag: touch within 1.0 m, 0.1 s catch. Counter: keep eyes on it, one monkey watching protects the group, break line of sight with a wall means danger. VR feel: head turning is the whole game; you hold your gaze on it while pushing away backwards.
6. **Howler.** Movement: stick walk 2.8 m/s. Tag: touch within 0.9 m, 0.15 s catch; plus a trigger **howl** (1 s wind-up, 8 s cooldown) that flings every monkey within 8 m away at 9 m/s using the existing `fling` message. Counter: grab a wall or branch with a hand during the wind-up and the fling is ignored (a gripping hand zeroes velocity in `Locomotion`), so the howl rewards grip, not distance. VR feel: you feel the blast through the controllers and clinging on is a physical choice.

## 7. Untested / known gaps

- No real headset test. Untested on hardware: whether `LOCO` constants feel right (jump 1.2, 0.65 m body height, 0.1 m hand), thumbstick axis mapping on Quest, haptic strengths, snap turn, hand extension feel for the Yeti, the shop poke/ray input and the mirror's frame cost.
- Automated coverage is real code: `scripts/loco-test.mjs` (node physics: frame rate independence, tunnelling, climbing, sliding, head vs wall), `scripts/monster-test.mjs` (real server, scripted WebSocket clients), `scripts/two-client.mjs` (two headless browsers).
- The hub spawn is 0.9 m above the floor, so the body drops to its 0.65 m rest height right after loading. Map spawn heights were not re-tuned.
- The stand now has solid colliders for hands and body. A hand sphere (0.1 m) near the counter can touch a solid while poking a button, which would grip and nudge the body. Untested on a headset; if it feels bad, shrink the hand radius near the stand or drop the counter/pedestal solids from `getLocoColliders`.
