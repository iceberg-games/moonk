# moonk-net

Standalone multiplayer layer for **MOONK**, a Gorilla Tag-style WebXR game. This package is self-contained (`/workspace/vrtag/net`) so the game client and the game-v1 server in `/workspace/vrtag` can keep evolving without this tree overwriting them.

It provides:

- A Node 18+ WebSocket server: public quick-join and private 6-character room codes, ~10 players per room, 20 Hz pose snapshots, server-authoritative tagging, cosmetics sync, and basic anti-cheat.
- A browser ES module, `NetClient`, for a Three.js / WebXR game loop.
- An automated test harness (simulated test clients only — no gameplay bots or AI players).

Real humans only. The server never spawns bot or AI players.

## Run locally

```bash
cd /workspace/vrtag/net
npm install
npm start                  # ws://0.0.0.0:8787   (PORT / HOST env vars work)
npm test                   # spins up an ephemeral server, runs 34 checks, exits
```

Health check: `GET http://localhost:8787/health`  
Room list: `GET http://localhost:8787/rooms`

From a Vite / Three.js client (same origin or any host that can reach the socket):

```js
import { NetClient } from './net/client/NetClient.js';

const net = new NetClient({ url: 'ws://localhost:8787', name: 'Colin' });
net.on('tag', (ev) => console.log('tagged', ev));
net.on('cosmetics', (ev) => applyLoadout(ev.id, ev.cosmetics));
await net.quickJoin();              // or net.createPrivate() / net.joinCode('ABC23X')
net.setCosmetics({ hat: 'cap', face: 'smile', badge: 'moon', color: '#88AACC' });

function tick() {
  net.sendPose(head, leftHand, rightHand);   // each is { p:[x,y,z], q:[x,y,z,w] }; throttled to 20 Hz
  for (const [id, remote] of net.sampleRemotes()) {
    drawPlayer(id, remote.pose, net.getRemote(id).cosmetics);
  }
  requestAnimationFrame(tick);
}
```

`sendPose` arguments are `{ p, q }` in world metres / unit quaternions. `sampleRemotes()` uses a **100 ms** interpolation buffer, **slerp** for rotations, and caps extrapolation at **250 ms**.

## Protocol summary

All frames are JSON. Compact type letters follow Iceberg's habit (`s` snapshots, `st` state, short keys).

### Client → server

| `t` | Meaning | Body |
|---|---|---|
| `qj` | Quick-join the fullest non-full **public** room, or open one | `name?`, `cosmetics?`, `mode?` (`transfer` \| `infection`) |
| `cp` | Create a **private** room | same |
| `jc` | Join by code | `code` (6 chars, case-insensitive), plus name/cosmetics |
| `p` | Pose | `h`, `l`, `r`: 7-vectors `[x,y,z,qx,qy,qz,qw]` (head, left, right) |
| `tag` | **Request** to tag someone | `id` (target, server-assigned). Never a self-declared "I tagged them" |
| `cos` | Cosmetics change | `cosmetics` object |
| `hb` | Application heartbeat | `ts` (echoed back) |
| `leave` | Leave the room | |

Player ids are **server-assigned**. A client-chosen `id` is ignored.

### Server → client

| `t` | Meaning |
|---|---|
| `welcome` | Your `id`, `serverTime`, `tickHz`, `room` `{ code, public, mode, maxPlayers }`, `you`, full `players` roster (including cosmetics and who is It), `it`, `mode` |
| `join` / `left` | Someone arrived or left (`id`, name, cosmetics, `it`) |
| `s` | 20 Hz snapshot: `{ ts, p: [[id, ...21 pose floats], ...] }` |
| `tag` | Authoritative tag event: `{ from, to, mode, it, at }` |
| `st` | Room state (mode, `it` list, roster) |
| `cos` | `{ id, cosmetics }` broadcast on change; late joiners also see loadouts on `welcome` |
| `rej` | `{ reason, for }` (`pose`, `tag`, `cos`, `join`, `msg`, …) |
| `err` | Join/room-level error (`not_found`, `room_full`, `bad_code`, …) |
| `hb` | Heartbeat reply `{ ts, ping }` for clock offset |

### Rooms

- **Public / quick-join:** fills the fullest public room that still has a seat (default cap 10). If none exist, a new public room is created.
- **Private:** `createPrivate` mints a 6-character code from the unambiguous alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0/O/1/I/L`). Private rooms are invisible to quick-join.
- Empty rooms are deleted immediately. Silent sockets are dropped after 20 s (plus WebSocket ping/pong).

### Tagging (server-authoritative)

Clients only send a **request**. The server checks, against **its own** recent pose history (about 180 ms of latency tolerance):

- the requester is currently It, and is not on cooldown (1.5 s);
- the target exists, is not already It, and is not on tag-back immunity (1 s, transfer mode);
- a tagger hand is inside the target's body sphere (chest slightly below the headset, radius 0.5 m).

**Modes** (locked when the room is created):

- `transfer` (default): It moves to the target; the previous It gets a short immunity.
- `infection`: the tagger stays It; the target becomes It too.

The first player in a room is It. If every It leaves, the longest-present remaining player becomes It.

### Anti-cheat (basics)

- Per-socket token-bucket rate limits (all messages, poses, tags, cosmetics, joins).
- 4 KB message cap (`ws` `maxPayload` + an application check).
- Schema validation (finite coordinates, unit-ish quaternions, known message types).
- Max movement speed (~18 m/s with slack); teleports rejected; last legal pose kept and **not** broadcast.
- Hand-reach cap (1.45 m from head to hand).
- No client-chosen ids.

These are heuristics, not a complete anti-cheat.

### Cosmetics

A small allowlisted loadout: `hat`, `face`, `badge`, `color` (`#RRGGBB`). Unknown keys or non-catalog ids are rejected (the previous loadout stays). Sent on join and on change, rate-limited, and included in `welcome` so late joiners see everyone. Placeholder catalog is in `shared/cosmetics.js`.

**Merge note:** the game v1 catalog in `/workspace/vrtag/shared/cosmetics.mjs` uses slots `fur`, `hat`, `face`, `hand` and a larger item list. When wiring this package to the game, adopt *that* catalog rather than the placeholders here.

## Tests

`npm test` (`tests/run.mjs`) starts a temporary server and several simulated test clients (harness only). It covers:

quick-join and fullest-room behaviour, private codes, pose sync + interpolation, a valid tag accepted, an out-of-reach tag rejected, a speed-hack / teleport rejected (and not broadcast), rate limiting, cosmetics on join / late join / change / invalid / rate-limit, and ignored client-chosen ids.

## What was reused from Iceberg

Iceberg (`/workspace/blockworld`) was studied read-only. Nothing in that repo was modified. Practical borrowings, adapted rather than copied:

- **Compact JSON message types** (`s`, `st`, short keys) like `src/mp/multiplayer.js` broadcasts.
- **Injectable `WebSocketImpl`**, **heartbeat with a reply check** (missed reply closes the socket and reconnects), and **reconnect with backoff** from `src/net/realtime.js`.
- **Token-bucket rate limits** (`take(bucket, rate, burst)`) and **server-clock offset** (EMA of `serverTs - RTT/2`) from the multiplayer client.
- **Interpolation buffer:** ~100 ms render delay, lerp positions, **250 ms extrapolation cap**. Iceberg lerps yaw; MOONK uses **quaternion slerp** because each pose has a full rotation. Iceberg also dead-reckons with an explicit velocity hint; this client derives velocity from the last two samples and holds the newest rotation (safer for VR hands).
- **Coordinate / schema bounds**, "don't trust the client with identity or loadout authority", and **keepalives** so late joiners still see people.
- **Test style:** start a local server, drive multiple clients, print `PASS`/`FAIL` lines (as in `scripts/mp-liveness-test.mjs`).

What we did **not** reuse: Iceberg's transport is **Supabase Realtime** (Phoenix channels, presence, host-authoritative *game state*, client-broadcast *movement*). Movement there is cosmetic only and is not server-validated. MOONK needs a dedicated authoritative WebSocket server for tagging and anti-cheat, at 20 Hz, with head + two-hand poses. See [HOSTING.md](./HOSTING.md) for why sharing Iceberg's Realtime network is a poor fit.

`src/backend/LocalBackend.js` is a localStorage profile/wallet store, not a network layer, so it was not used.

## Relation to the game v1 server

Another bot is building the game at `/workspace/vrtag`. As of this writing it already has `server/server.mjs` plus `shared/defs.mjs` and `shared/cosmetics.mjs`. **This package does not replace or overwrite those files.**

See the merge / harden notes at the end of [HOSTING.md](./HOSTING.md) and the "Open questions" in the report to Colin. Short version: keep their game rules (map votes, normal/horror modes, monster forms, auto tag-detect); import this package's rooms, validation, anti-cheat, interpolation client, and 20 Hz compact snapshots.

## Hosting

A hosting plan for MOONK Publisher — public `wss://`, TLS, costs, accounts, scaling, and an honest look at sharing a network with Iceberg — is in **[HOSTING.md](./HOSTING.md)**. Nothing has been deployed and no accounts have been created.
