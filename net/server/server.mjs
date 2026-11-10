// MOONK multiplayer server: rooms, 20 Hz pose snapshots, server-authoritative tagging.
// Real humans only — no bot or AI players.
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import {
  TICK_MS, MAX_MESSAGE_BYTES, TIMEOUT_MS, POSE_HISTORY_MS, MSG, MAX_PLAYERS,
  DEFAULT_TAG_MODE, newBucket, take, sanitizeName,
} from '../shared/protocol.js';
import { parsePose, partToArr, clonePose } from '../shared/math.js';
import { validateCosmetics, DEFAULT_COSMETICS, cosmeticsEqual } from '../shared/cosmetics.js';
import { RoomManager } from './room.mjs';
import { checkPose } from './anticheat.mjs';
import { tryTag, publicState } from './tag.mjs';

function encode(obj) {
  return JSON.stringify(obj);
}

export function startServer(options = {}) {
  const host = options.host || process.env.HOST || '0.0.0.0';
  const port = options.port ?? (process.env.PORT ? Number(process.env.PORT) : 8787);
  const maxPlayers = options.maxPlayers ?? MAX_PLAYERS;
  const defaultMode = options.defaultMode ?? DEFAULT_TAG_MODE;
  const tickMs = options.tickMs ?? TICK_MS;

  const rooms = new RoomManager({ maxPlayers, defaultMode, maxRooms: options.maxRooms });
  let nextId = 1;
  const sockets = new Set();

  const now = () => Date.now();

  const send = (ws, obj) => {
    if (ws.readyState === 1) {
      try { ws.send(encode(obj)); } catch { /* closed */ }
    }
  };

  const bcast = (room, obj, except = null) => {
    const s = encode(obj);
    for (const p of room.players.values()) {
      if (p.ws !== except && p.ws.readyState === 1) {
        try { p.ws.send(s); } catch { /* closed */ }
      }
    }
  };

  function reject(ws, reason, kind) {
    send(ws, { t: MSG.REJ, reason, for: kind });
  }

  function error(ws, reason) {
    send(ws, { t: MSG.ERR, reason });
  }

  function leave(conn) {
    if (!conn.player) return;
    const player = conn.player;
    const result = rooms.leave(player);
    conn.player = null;
    if (result?.room) {
      bcast(result.room, { t: MSG.LEFT, id: player.id });
      bcast(result.room, { t: MSG.STATE, ...publicState(result.room), at: now() });
    }
  }

  function attachPlayer(conn, name, cosmetics, mode) {
    leave(conn);
    const player = {
      id: nextId++,           // server-assigned; client-chosen ids are ignored
      name: sanitizeName(name),
      cosmetics,
      ws: conn.ws,
      room: null,
      pose: null,
      at: 0,
      history: [],
      it: false,
      coolUntil: 0,
      immuneUntil: 0,
      tags: 0,
      joinedAt: 0,
      modeHint: mode,
    };
    conn.player = player;
    return player;
  }

  function recordPose(player, pose, at) {
    player.pose = pose;
    player.at = at;
    player.history.push({ at, pose: clonePose(pose) });
    const cut = at - POSE_HISTORY_MS;
    while (player.history.length > 1 && player.history[0].at < cut) player.history.shift();
  }

  function handleJoin(conn, kind, msg) {
    if (!take(conn.buckets.join)) return reject(conn.ws, 'rate_limited', 'join');
    const cos = validateCosmetics(msg.cosmetics ?? msg.cos);
    if (!cos.ok) return error(conn.ws, cos.reason);
    const player = attachPlayer(conn, msg.name, cos.cosmetics, msg.mode);
    let result;
    if (kind === MSG.QJ) result = rooms.quickJoin(player, msg.mode);
    else if (kind === MSG.CP) result = rooms.createPrivate(player, msg.mode);
    else result = rooms.joinCode(player, msg.code);
    if (!result.ok) {
      conn.player = null;
      return error(conn.ws, result.reason);
    }
    const t = now();
    send(conn.ws, rooms.welcomePayload(player, result.room, t));
    bcast(result.room, { t: MSG.JOIN, ...rooms.playerView(player) }, conn.ws);
    bcast(result.room, { t: MSG.STATE, ...publicState(result.room), at: t }, conn.ws);
  }

  function handlePose(conn, msg) {
    const player = conn.player;
    if (!player?.room) return reject(conn.ws, 'not_in_room', 'pose');
    if (!take(conn.buckets.pose)) return reject(conn.ws, 'rate_limited', 'pose');
    const pose = parsePose(msg.h ?? msg.head, msg.l ?? msg.left ?? msg.lh, msg.r ?? msg.right ?? msg.rh);
    if (!pose) return reject(conn.ws, 'schema', 'pose');
    const t = now();
    const check = checkPose({ pose: player.pose, at: player.at }, pose, t);
    if (!check.ok) return reject(conn.ws, check.reason, 'pose');
    recordPose(player, check.pose, t);
  }

  function handleTag(conn, msg) {
    const player = conn.player;
    if (!player?.room) return reject(conn.ws, 'not_in_room', 'tag');
    if (!take(conn.buckets.tag)) return reject(conn.ws, 'rate_limited', 'tag');
    // Never trust a client-chosen "from" id; only the socket's player may tag.
    const targetId = Number(msg.id ?? msg.to ?? msg.targetId);
    if (!Number.isInteger(targetId) || targetId <= 0) return reject(conn.ws, 'schema', 'tag');
    const result = tryTag(player.room, player, targetId, now());
    if (!result.ok) return reject(conn.ws, result.reason, 'tag');
    bcast(player.room, result.event);
    bcast(player.room, { t: MSG.STATE, ...publicState(player.room), at: now() });
  }

  function handleCosmetics(conn, msg) {
    const player = conn.player;
    if (!player?.room) return reject(conn.ws, 'not_in_room', 'cos');
    if (!take(conn.buckets.cos)) return reject(conn.ws, 'rate_limited', 'cos');
    const cos = validateCosmetics(msg.cosmetics ?? msg.cos, player.cosmetics || DEFAULT_COSMETICS);
    if (!cos.ok) return reject(conn.ws, cos.reason, 'cos');
    if (cosmeticsEqual(player.cosmetics, cos.cosmetics)) return;
    player.cosmetics = cos.cosmetics;
    bcast(player.room, { t: MSG.COS, id: player.id, cosmetics: player.cosmetics });
  }

  function onMessage(conn, raw) {
    conn.last = now();
    const bytes = typeof raw === 'string' ? Buffer.byteLength(raw) : (raw?.byteLength ?? raw?.length ?? 0);
    if (bytes > MAX_MESSAGE_BYTES) {
      reject(conn.ws, 'too_large', 'msg');
      try { conn.ws.close(1009, 'too_large'); } catch { /* */ }
      return;
    }
    if (!take(conn.buckets.all)) return reject(conn.ws, 'rate_limited', 'msg');
    let msg;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()); } catch { return reject(conn.ws, 'schema', 'msg'); }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return reject(conn.ws, 'schema', 'msg');

    const t = msg.t;
    if (t === MSG.QJ || t === MSG.CP || t === MSG.JC) return handleJoin(conn, t, msg);
    if (t === MSG.HB) return send(conn.ws, { t: MSG.HB, ts: now(), ping: msg.ts ?? null });
    if (t === MSG.LEAVE) { leave(conn); try { conn.ws.close(); } catch { /* */ } return; }
    if (t === MSG.POSE) return handlePose(conn, msg);
    if (t === MSG.TAG) return handleTag(conn, msg);
    if (t === MSG.COS) return handleCosmetics(conn, msg);
    return reject(conn.ws, 'unknown', 'msg');
  }

  function tick() {
    const ts = now();
    for (const room of rooms.rooms.values()) {
      if (!room.players.size) continue;
      const p = [];
      for (const pl of room.players.values()) {
        if (!pl.pose) continue;
        p.push([pl.id, ...partToArr(pl.pose.h), ...partToArr(pl.pose.l), ...partToArr(pl.pose.r)]);
      }
      bcast(room, { t: MSG.SNAP, ts, p });
    }
  }

  const http = createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/health' || url.startsWith('/health?')) {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({
        ok: true,
        service: 'moonk-net',
        rooms: rooms.rooms.size,
        players: [...rooms.rooms.values()].reduce((n, r) => n + r.players.size, 0),
      }));
      return;
    }
    if (url === '/rooms' || url.startsWith('/rooms?')) {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(rooms.snapshotInfo()));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('MOONK multiplayer');
  });

  const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE_BYTES });

  wss.on('connection', (ws) => {
    const conn = {
      ws,
      player: null,
      last: now(),
      buckets: {
        all: newBucket('all'),
        pose: newBucket('pose'),
        tag: newBucket('tag'),
        cos: newBucket('cos'),
        join: newBucket('join'),
      },
    };
    sockets.add(conn);
    ws.on('message', (raw) => {
      try { onMessage(conn, raw); } catch (err) { console.warn('[moonk-net]', err); }
    });
    ws.on('close', () => { sockets.delete(conn); leave(conn); });
    ws.on('error', () => {});
    ws.on('pong', () => { conn.last = now(); });
  });

  const tickIv = setInterval(tick, tickMs);
  const hbIv = setInterval(() => {
    const t = now();
    for (const conn of [...sockets]) {
      if (t - conn.last > TIMEOUT_MS) {
        try { conn.ws.terminate(); } catch { /* */ }
        sockets.delete(conn);
        leave(conn);
        continue;
      }
      if (conn.ws.readyState === 1) {
        try { conn.ws.ping(); } catch { /* */ }
      }
    }
  }, 5000);

  let closed = false;
  const close = () => new Promise((ok) => {
    if (closed) return ok();
    closed = true;
    clearInterval(tickIv);
    clearInterval(hbIv);
    for (const conn of sockets) try { conn.ws.terminate(); } catch { /* */ }
    sockets.clear();
    wss.close();
    http.close(() => ok());
  });

  return new Promise((ok, bad) => {
    http.listen(port, host, () => {
      const bound = http.address();
      const actualPort = typeof bound === 'object' && bound ? bound.port : port;
      ok({ port: actualPort, host, close, wss, http, rooms });
    });
    http.on('error', bad);
  });
}
