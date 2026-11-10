# Hosting plan — MOONK multiplayer

For **MOONK Publisher**. This is a plan only. **Do not deploy and do not create accounts** until Colin asks.

MOONK's net server is a long-lived Node WebSocket process. Clients need a stable public URL such as `wss://mp.moonk.example`. HTTP `GET /health` is on the same port for platform health checks. The process must stay up; a host that sleeps on idle will drop every player.

TLS terminates at the platform or a reverse proxy. The Node process itself speaks plain `ws://` on `PORT` (default 8787) bound to `0.0.0.0`.

---

## Options

Prices below were checked on 9 Nov 2026 against vendor pages or recent comparisons. **Verify on the vendor's pricing page before paying.** Figures marked *unverified / may have changed* should be treated as order-of-magnitude only.

### 1. Fly.io — recommended to start

A single always-on Machine in one region close to players (for example `lax` or `phx`, given Colin is in Arizona), with `min_machines_running = 1` so it does not scale to zero.

- **TLS / `wss://`:** automatic on `*.fly.dev`, and on a custom domain after a DNS record is added.
- **WebSockets:** first-class. The proxy can balance by concurrent connections (useful later if you add a second Machine).
- **Cost (verify at [fly.io/docs/about/pricing](https://fly.io/docs/about/pricing)):** a `shared-cpu-1x` with 512 MB RAM is cited around **$3.69 / month** in `iad` when left running, plus roughly **$0.02 / GB** NA/EU egress (*from 2026 comparisons; confirm current regional rates*). No workspace fee. A stopped Machine still incurs a small disk charge.
- **Accounts:** a Fly.io account and a payment method; `flyctl` on a laptop; optionally a domain at any registrar (Cloudflare DNS works well).
- **Fit:** cheap, persistent, good WebSocket story, easy TLS. One Machine is enough for early playtests.

Example (do not run until asked): a Dockerfile or `fly.toml` that sets `internal_port = 8787`, `min_machines_running = 1`, and a HTTP service with auto TLS. Start with `npx / npm start` and `PORT` from the environment.

### 2. Render (paid web service)

- **TLS / `wss://`:** automatic on `*.onrender.com` and custom domains.
- **WebSockets:** documented, no fixed max connection duration. Reconnect on deploy (`SIGTERM`, ~30 s drain). The **free** instance **spins down when idle** — unsuitable for a persistent game server.
- **Cost (from [render.com/pricing](https://render.com/pricing), 9 Nov 2026):** smallest paid instance is **$7 / month** (less than 1 CPU, 512 MB). Hobby workspace is $0 with **5 GB** bandwidth then **$0.15 / GB**; Pro is $25 / month with 25 GB included. Bandwidth at 20 Hz snapshots can matter once many rooms are busy — watch this.
- **Accounts:** a Render account, payment method for a paid instance, a Git repo or Docker image, optional custom domain.
- **Fit:** simple dashboard. Use a **paid** web service only. Bandwidth pricing is less generous than Fly or a VPS.

### 3. Railway — use only after verifying the request-duration limit

- **TLS / `wss://`:** automatic on the public Railway domain / custom domain.
- **WebSockets:** easy to bind `0.0.0.0:$PORT`. **A 2026 write-up reports Railway caps request duration at 15 minutes, including WebSockets and SSE**, so clients would have to reconnect on a timer. **This is a serious concern for a VR session. Verify in current Railway docs before choosing it.** If the cap is real, Railway is a poor fit until they lift it.
- **Cost (usage-based, *verify*):** Hobby plan around **$5 / month** of included credit; a small always-on 512 MB–1 GB service is often cited in the **$5–15 / month** range depending on actual CPU/RAM/network.
- **Accounts:** a Railway account, payment method, optional domain.
- **Fit:** nice UX, but do not commit until the 15-minute question is settled.

### 4. A small VPS (DigitalOcean, Hetzner, Linode, etc.)

- **TLS / `wss://`:** you terminate TLS yourself. The straightforward setup is **Caddy** or **Caddy + systemd** in front of Node (automatic Let's Encrypt) on a hostname like `mp.moonk.example`. Nginx + Certbot also works.
- **WebSockets:** unlimited; you own the process. You also own reboots, updates, and monitoring.
- **Cost (*unverified, typical 2026 list prices — check the vendor*):** about **$4–6 / month** for a 1 vCPU / 1 GB droplet or Hetzner CX22-class box, usually with several terabytes of included transfer. This is often the best bandwidth deal.
- **Accounts:** a VPS account, a domain, and SSH. Optional: Cloudflare in front (orange-cloud can proxy `wss://` if configured correctly; grey-cloud + Caddy is simpler).
- **Fit:** best cost/bandwidth once someone is willing to do light ops. Fine for a first public test if Colin is comfortable with SSH. Put health checks and a restart policy (`systemd`) around `node server/index.mjs`.

---

## What to buy, in order

1. A host from the list above (Fly.io is the default recommendation).
2. A domain (if you want `wss://mp.…` instead of a vendor subdomain). DNS only — no extra "WebSocket add-on".
3. Nothing else at launch: no Redis, no second region, no load balancer. This server keeps room state **in memory on one process**.

A static game client (Vite build) can live on any static host (Cloudflare Pages, Netlify, GitHub Pages, or the same VPS). It is not the same service as the WebSocket server. Point the client at the `wss://` URL with a build-time env var, e.g. `VITE_MOONK_NET`.

---

## How it would scale

Rough in-memory capacity (order of magnitude, not a benchmark):

- Snapshots are ~20 Hz, compact (player id + 21 floats), sent to everyone in the room.
- A full room of 10 is on the order of **tens of KB/s** outbound. Fifty busy rooms (≤ 500 players) is still a few MB/s — comfortable on a single small VM.
- CPU is cheap at this tick rate until pose validation and tag checks are dominated by room count, which is unlikely before hundreds of concurrent players.

When one process is no longer enough:

- **Do not** blindly run two Node instances behind a random load balancer. Rooms are local memory; a reconnect might land on the other instance and "lose" the room.
- First scale vertically (more RAM/CPU on one Machine).
- Then add sticky sessions **or** a shared pub/sub (Redis) plus a room-directory, and pin each room to one worker. Fly's connection-based balancing helps but does not replace shared state.
- A second region only helps if you also shard rooms by region (friends in one room must share a server). Cross-region tick is a last resort.

Anti-cheat, rate limits, and the 10-player cap are also capacity controls.

---

## Can MOONK share a multiplayer network with Iceberg?

**Short answer: do not share Iceberg's Supabase Realtime for MOONK. Sharing a hosting account or a VPS (two processes) is practical and fine.**

### What Iceberg actually uses

Iceberg (`/workspace/blockworld`) is **not** a custom WebSocket room server today. Live multiplayer is:

- **Supabase Realtime** — Phoenix channels over WebSocket, private topics `game:<gameId>:<instance>`.
- **Supabase RPC** for placement and the trusted roster: `mp_join`, `mp_heartbeat` (every 20 s), `mp_leave`. Presence is "who is connected"; the roster is "who the server thinks belongs here".
- **Movement is a client broadcast** (`'s'` packets: position, yaw, animation, velocity hint), rate-capped at 1–10 Hz depending on a **free-tier message budget**. The server does not validate or relay poses. Iceberg's own docs note a known gap: Realtime does not stamp the sender, so a modified client in the instance can spoof another member's avatar on other screens. Movement is treated as **cosmetic only**.
- **Shared game state** (rounds, disasters) is **host-authoritative** among clients, with snapshots for late joiners — not a simulation server.
- Free-plan Realtime limits are tight (on the order of 100 messages/s project-wide, counting every delivery). A 12-player Iceberg instance is already throttled to ~1 Hz. Iceberg's README still lists a dedicated "Multiplayer server (WebSocket rooms)" as a **roadmap** item, not a shipped system.

### Why MOONK should not ride that bus

| | Iceberg Realtime | MOONK net |
|---|---|---|
| Transport | Supabase / Phoenix channels + JWT | Dedicated `ws` / `wss` server |
| Pose | Position + yaw, 1–10 Hz, peer broadcast | Head + two hands, position **and** quaternion, **20 Hz**, server snapshots |
| Authority | Clients; host for game state | Server for poses, tags, cosmetics, identity |
| Tagging | N/A (and untrusted events must not grant anything) | Server-validated hand-to-body, cooldown, mode |
| Budget | Tight free-tier fanout (`N² · Hz`) | One process, predictable bandwidth |
| Identity | Account username + roster RPC | Server-assigned ids (no client-chosen ids) |

Pushing 20 Hz, three-pose snapshots through Iceberg's Realtime would blow the free-tier budget immediately and still would not give you server-authoritative tags or anti-cheat. Paying for Supabase Pro does not fix the "movement is a client broadcast" model without writing a relay that Iceberg itself describes as future work.

### What *is* practical to share

- **Same provider or VPS:** e.g. one Fly org, or one small VM running Iceberg's stack (or its future WS server) and `moonk-net` as **separate processes** on different ports, with two hostnames (`iceberg.…`, `mp.moonk.…`) and separate TLS. That only shares the bill and the machine, not the protocol.
- **A future shared "Colin game server"** only makes sense if both games are rewritten onto the same authoritative room/snapshot layer. That is a large Iceberg change (roster, cosmetics, economy, presence, and the `mp` API all assume Supabase). Do not block MOONK on it.
- **Do not** share player identity or cosmetics catalogs casually: Iceberg cosmetics come from a server roster tied to accounts and the shop; MOONK v1 uses a different slot list (`fur/hat/face/hand`) and in-game coins. Cross-game accounts can wait.

**Recommendation:** ship MOONK on its own persistent WebSocket server (this package, or the hardened game-v1 server — see below). Host it on Fly.io or a small VPS. Leave Iceberg on Supabase until that project independently decides to move.

---

## Merge / harden notes for the game v1 server

`/workspace/vrtag/server/server.mjs` (and `shared/defs.mjs`, `shared/cosmetics.mjs`) is the game bot's live server. **moonk-net does not overwrite it.** The two should be merged deliberately.

The game server already has rules this package does not: map voting, `normal` vs `horror` modes, monster forms, auto tag-detect on the tick, survive/wins counters, a host `set` message, and the real cosmetics catalog.

### Protocol differences

| | Game v1 `server/server.mjs` | This package (`moonk-net`) |
|---|---|---|
| Join | one `join` message (`quick`, `room` code, `mode`, `monster`) | `qj` / `cp` / `jc` |
| Room codes | 4 letters (`A–Z` minus none of `O/I`, actually `ABCDEFGHJKLMNPQRSTUVWXYZ` — still no digits) | 6 chars, unambiguous alphabet including digits, public vs private |
| Quick-join | fullest room, optional mode filter; otherwise creates a room | fullest **public** room; private rooms are opt-in |
| Pose | `h,l,r` positions + one head quaternion `q`; no hand rotations | 7-vectors for head and both hands |
| Snapshots | `snap` with names, roles, cosmetics, scores in every tick | compact `s` arrays; roster/cosmetics on `welcome` / `join` / `cos` / `st` |
| Tag | **auto-detected** every tick (no client request) | client **requests**, server validates with a latency window |
| Default tag rules | `normal` = **infection** (tagger stays It) | default **`transfer`** (It moves); `infection` is a flag |
| Cosmetics | `fur/hat/face/hand` from the game catalog; sanitized; piggybacked on snapshots; change is not its own room event | placeholder `hat/face/badge/color`; validated; broadcast `cos`; late joiners get loadouts on `welcome` |
| Anti-cheat | 4 KB cap, finite coords only | rate limits, schema, speed/teleport, hand-reach, no client ids |
| Client | (game is still being written) | `NetClient` + interpolation buffer |
| Game rules | votes, horror/monster forms, phases | rooms + tag + cosmetics only |

### What to replace vs what to keep

Do **not** throw away the game server's rules. Preferred path:

1. Keep `shared/defs.mjs` and `shared/cosmetics.mjs` as the source of truth for maps, modes, monsters, and the catalog.
2. Rehome the socket/room loop onto this package (or import `checkPose`, token buckets, 6-char codes, compact snapshots, and `NetClient` into their server).
3. Align cosmetics in `moonk-net` to **their** slots and allowlist.
4. Decide tag UX with Colin: Gorilla Tag-style **auto-detect** (what v1 does) vs an explicit **request** (what the net brief asked for). Auto-detect can still use this package's distance + history + cooldown checks; just run them on the tick.
5. Raise or specialize `MAX_REACH` / `MAX_SPEED` for horror forms (the Yeti arm reach is 4.2 m — this package's 1.45 m cap would break that role).
6. Add hand quaternions to the v1 pose so remote avatars can pose fingers/arms correctly, and put `NetClient`'s interpolation in the game loop (v1 has no client interp buffer yet).
7. Point `package.json`'s `dev:server` at one server only. Both currently default to **port 8787** — only one can bind it.

Until that merge, run this package on `PORT=8787` (or another free port) for net tests, and the game server on its own port when the client is in development.
