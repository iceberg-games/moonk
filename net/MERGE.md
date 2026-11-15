# Merging moonk-net with the MOONK game server

The game v1 server (`/workspace/vrtag/server/server.mjs`) already owns **round flow, voting, monster forms, auto tag-detect, and generators**. This package should not replace that logic. A merge should keep those functions as they are, and only change how they are **encoded on the wire** so they ride next to moonk-net's compact pose snapshots, validation, and `NetClient`.

Nothing in this file is a deploy step. Field names below are taken from DESIGN.md §4 and the current game tick.

## Snapshot: keep poses compact, park game fields beside them

Today the game broadcasts one fat `snap` per tick:

```
{ t: 'snap', ts, gp, left,
  ps: [{ id, n, it, ro, fo, cg, c, tg, sv, w, tl,
         xf, xt, fc,
         h, q, l, r }] }
```

moonk-net already sends:

```
{ t: 's', ts, p: [[id, ...21 pose floats], ...] }
```

On merge, **do not fold monster/round fields into the 21-float pose array**. Add a sibling envelope so `detectTags`, form switching, and the phase machine can keep writing the same properties on the player/room objects:

```
{ t: 's',
  ts,                    // server timestamp (already in net)
  pe: room.phaseEnds,    // epoch ms, 0 if no clock (Classic 180s / Horror 120s)
  left: Math.max(0, Math.ceil((room.phaseEnds - ts) / 1000)),
  gp: room.gens.map(...),// omit or [] while GEN_ENABLED is false
  p:  [[id, ...21], ...],
  g:  [[id, xf, xt, fc, fo, ro], ...] }
```

| Game field | Meaning (DESIGN.md §4 / server tick) | net mapping |
|---|---|---|
| `xf` | ms left on the transform tell, `0` if none (`p.xfEnd ? max(1, p.xfEnd - t) : 0`) | `g[i][1]` on the snapshot, same number |
| `xt` | form being switched to (`p.xfTo`), or `null` | `g[i][2]` (`null` or `0` if idle) |
| `fc` | seconds until the monster may switch again | `g[i][3]` (keep their 0.1 s rounding) |
| `fo` / `ro` | current form and role | `g[i][4]`, `g[i][5]` — needed to render the Yeti/Locust without waiting for a rarer state message |
| `phaseEnds` | end of the current phase, including the new Classic 180 s clock | `pe` on the `s` envelope **and** on `st` (see below) |
| `left` | seconds remaining, already computed from `phaseEnds` | `left` on the `s` envelope (convenience; clients should prefer `pe`) |
| `n`, `it`, `c`, `tg`, `sv`, `w`, `tl`, `cg` | name, It, cosmetics, scores, tool, caught | **not** every pose tick: name / cosmetics on `welcome` / `join` / `cos`; `it` / caught / scores on `st` (and the `tag` event) |

`NetClient` already interpolates from `p`. After merge it should pass `g`, `pe`, and `left` through on the existing `snapshot` event so the game loop can drive tells and the clock without reading poses from the game server format.

## Events: keep the game's names

Do not rename these. The net client should surface `{ t: 'ev', ... }` as an `event` callback (already stubbed). The game server continues to emit:

| Game event | When | net |
|---|---|---|
| `{ t:'ev', k:'formstart', by, to, ms }` | a form switch **begins** (0.4 s tell) | unchanged; send as `t: 'ev'` |
| `{ t:'ev', k:'form', by, form }` | the form **actually flips** when `t >= p.xfEnd` | unchanged |
| `{ t:'ev', k:'formdenied' }` | switch rejected (cooldown / already telling) | unchanged (unicast to the monster) |
| `{ t:'ev', k:'start'\|'tag'\|'over'\|'map' }` | round / catch / result / vote | unchanged; moonk-net's own `{ t:'tag', from, to, it, mode }` can wrap or sit beside `k:'tag'` |

Round and monster code paths (`startRound`, `detectTags`, the `form` handler, the `xfEnd` tick, voting, `setPhase`) stay in the game module. The net tick only **serializes** `phaseEnds` / `xf` / `xt` / `fc` after those functions have run.

## Room state

Extend moonk-net's `{ t: 'st', mode, it, players }` rather than inventing a second lobby channel:

```
{ t: 'st',
  mode,                  // game keys are `normal` | `horror` (display: Classic Tag / Be the Monster)
  phase,                 // lobby | vote | countdown | play | over
  phaseEnds,             // same clock as snapshot `pe`
  left,
  map, monster, host, msg, mType, round, votes,
  it, players }
```

## What already changed in net (so the merge is smaller)

- Cosmetics allowlist is the launch kit at `/workspace/moonk-cosmetics/cosmetics.json` (loaded at server start). Wire loadout is `{ v:1, hat, face, fur, hand }`. `hand` is one id for both arms. Unlock-only ids need an in-session `player.unlocks` entry.
- Anti-cheat hand reach is **per-role**: monkeys 1.45 m; **Yeti form 3.5 m** (`armLength` 3.2 + 0.3), matching `shared/defs.mjs` and the game server's `dist(hand, head) <= armLength + 0.3` check.
- Unlock progress hooks: `recordCatch` (session catches + one-life streak), `recordTagged` (resets the streak), `recordLobbyWin({ night })`. These emit `{ t: 'unlock', id, items, reason, progress }` to that player.

## Unlock that still cannot ship

**`hub_visits_5`** ("Visit the Hub on 5 different days", item `hat_antenna`) needs **persistent player identity** and a clock that survives reconnects and process restarts. moonk-net only has anonymous, server-assigned socket ids and an in-session `unlocks` set. The hook will not grant this item. A merge should keep rejecting it until accounts (or an equivalent stable id + stored visit days) exist.

`tag_catches_25`, `tag_streak_3`, and `night_lobby_win` can be granted in-session from the hooks above; they still reset if the player disconnects, until identity exists.

## Conflicts to resolve at merge time (do not silently pick)

- **Tag path:** the game **auto-detects** catches every tick; net accepts an explicit `tag` request. Keep auto-detect for gameplay; reuse net's distance / history / cooldown helpers inside `detectTags`.
- **Mode keys:** game `normal` / `horror` vs net `transfer` / `infection`. Classic Tag in the design doc is infection (tagger stays It). Net's default is still `transfer`.
- **Cosmetics on the snapshot:** the game still embeds `c: p.cos` every tick and does not broadcast a `cos` event. Prefer net's `welcome` / `join` / `cos` so late joiners get loadouts without waiting for a pose.
- **Pose shape:** the game still sends head+hand *positions* and a single head quaternion. Net sends 7-vectors for head and both hands. Add hand quaternions in the game client; keep the compact `p` array.
- **Both default to port 8787.**
- Two catalogs: this package reads `/workspace/moonk-cosmetics/cosmetics.json` live; the game has a copy in `shared/cosmetics.mjs`. Keep them identical or have the game server load the same file.
