// Browser (and Node test) ES module for MOONK multiplayer.
// Usable from a Three.js / WebXR game loop: sendPose() is throttled, remotes
// are sampled through an interpolation buffer (~100 ms delay, slerp, extrap cap).
//
// Conventions borrowed from Iceberg (blockworld/src/net/realtime.js and
// src/mp/multiplayer.js): injectable WebSocket impl, heartbeat with a reply
// check, reconnect with backoff, server-clock offset (EMA of RTT/2), compact
// message types, and a delayed interpolation buffer.

import { MSG, POSE_SEND_HZ, HEARTBEAT_MS, RENDER_DELAY_MS, r3, r4 } from '../shared/protocol.js';
import { parsePose, partToArr } from '../shared/math.js';
import { DEFAULT_COSMETICS } from '../shared/cosmetics.js';
import { InterpBuffer, poseFromSnapshotRow } from './interpolate.js';

function compactPart(part) {
  const a = partToArr(part);
  // partToArr already rounds; keep the same shape the server accepts.
  return a.map((v, i) => (i < 3 ? r3(v) : r4(v)));
}

export class NetClient {
  /**
   * @param {object} opts
   * @param {string} [opts.url]  WebSocket url, e.g. ws://localhost:8787
   * @param {typeof WebSocket} [opts.WebSocketImpl]
   * @param {string} [opts.name]
   * @param {object} [opts.cosmetics]
   * @param {string} [opts.mode]  'transfer' | 'infection'
   */
  constructor(opts = {}) {
    this.url = opts.url || '';
    this.WS = opts.WebSocketImpl || globalThis.WebSocket;
    this.name = opts.name || 'Player';
    this.cosmetics = opts.cosmetics || { ...DEFAULT_COSMETICS };
    this.mode = opts.mode;
    this._handlers = new Map();
    this._ws = null;
    this._open = null;
    this._closed = true;
    this._backoff = 500;
    this._hb = null;
    this._hbPending = null;
    this._clockOffset = 0;
    this._clockSamples = 0;
    this._lastJoin = null;
    this._lastPoseSent = 0;
    this._poseMinGap = 1000 / POSE_SEND_HZ;
    this.localId = null;
    this.room = null;
    this.players = new Map(); // id -> { id, name, cosmetics, it, buf }
    this.connected = false;
    this.modeState = null;
    this.it = [];
  }

  on(event, fn) {
    const list = this._handlers.get(event) || [];
    list.push(fn);
    this._handlers.set(event, list);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const list = this._handlers.get(event);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  _emit(event, payload) {
    for (const fn of this._handlers.get(event) || []) {
      try { fn(payload); } catch (e) { console.warn('[moonk-net]', e); }
    }
  }

  serverNow(localNow = Date.now()) {
    return localNow + this._clockOffset;
  }

  _syncClock(serverTs, t0, t1) {
    if (!Number.isFinite(serverTs)) return;
    const off = serverTs - (t0 + t1) / 2;
    this._clockOffset = this._clockSamples++ ? this._clockOffset * 0.7 + off * 0.3 : off;
  }

  connect(url = this.url) {
    if (url) this.url = url;
    if (!this.url) return Promise.reject(new Error('no url'));
    if (this._ws && this._ws.readyState === 1) return Promise.resolve();
    if (this._ws && this._ws.readyState === 0 && this._open) return this._open;
    this._closed = false;
    this._open = new Promise((ok, bad) => {
      let settled = false;
      const ws = this._ws = new this.WS(this.url);
      ws.onopen = () => {
        settled = true;
        this.connected = true;
        this._backoff = 500;
        this._hbPending = null;
        this._startHeartbeat();
        if (this._lastJoin) this._send(this._lastJoin);
        this._emit('open');
        ok();
      };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString()); } catch { return; }
        this._onMessage(m);
      };
      ws.onerror = () => { if (!settled) { settled = true; bad(new Error('connect failed')); } };
      ws.onclose = () => {
        this.connected = false;
        clearInterval(this._hb);
        this._hb = null;
        this._emit('close');
        if (!settled) { settled = true; bad(new Error('socket closed')); }
        if (!this._closed) {
          setTimeout(() => this.connect().catch(() => {}), this._backoff = Math.min(this._backoff * 2, 15000));
        }
      };
    });
    return this._open;
  }

  disconnect() {
    this._closed = true;
    this._lastJoin = null;
    clearInterval(this._hb);
    this._hb = null;
    try { this._ws?.close(); } catch { /* */ }
    this._ws = null;
    this.connected = false;
    this.localId = null;
    this.room = null;
    this.players.clear();
  }

  _send(obj) {
    if (!this._ws || this._ws.readyState !== 1) return false;
    try { this._ws.send(JSON.stringify(obj)); return true; } catch { return false; }
  }

  _startHeartbeat() {
    clearInterval(this._hb);
    this._hb = setInterval(() => this._beat(), HEARTBEAT_MS);
  }

  _beat() {
    const ws = this._ws;
    if (!ws || ws.readyState !== 1) return;
    if (this._hbPending) {
      this._hbPending = null;
      try { ws.close(); } catch { /* */ }   // onclose -> reconnect (Iceberg pattern)
      return;
    }
    const ts = Date.now();
    this._hbPending = ts;
    this._send({ t: MSG.HB, ts });
  }

  async quickJoin(opts = {}) {
    await this.connect();
    const msg = this._joinMsg(MSG.QJ, opts);
    this._lastJoin = msg;
    const wait = this._waitWelcome();
    this._send(msg);
    return wait;
  }

  async createPrivate(opts = {}) {
    await this.connect();
    const msg = this._joinMsg(MSG.CP, opts);
    this._lastJoin = msg;
    const wait = this._waitWelcome();
    this._send(msg);
    return wait;
  }

  async joinCode(code, opts = {}) {
    await this.connect();
    const msg = this._joinMsg(MSG.JC, { ...opts, code });
    this._lastJoin = msg;
    const wait = this._waitWelcome();
    this._send(msg);
    return wait;
  }

  _joinMsg(t, opts) {
    const msg = {
      t,
      name: opts.name ?? this.name,
      cosmetics: opts.cosmetics ?? this.cosmetics,
    };
    if (opts.mode ?? this.mode) msg.mode = opts.mode ?? this.mode;
    if (opts.code) msg.code = opts.code;
    return msg;
  }

  _waitWelcome(ms = 5000) {
    return new Promise((ok, bad) => {
      const offW = this.on('welcome', (w) => { cleanup(); ok(w); });
      const offE = this.on('error', (e) => { cleanup(); bad(Object.assign(new Error(e.reason || 'join failed'), e)); });
      const timer = setTimeout(() => { cleanup(); bad(new Error('welcome timeout')); }, ms);
      const cleanup = () => { offW(); offE(); clearTimeout(timer); };
    });
  }

  /**
   * Send local head + hand poses. Each argument is `{ p:[x,y,z], q:[x,y,z,w] }`.
   * Throttled to POSE_SEND_HZ; returns false if dropped by the throttle.
   */
  sendPose(head, lh, rh, { force = false } = {}) {
    const t = Date.now();
    if (!force && t - this._lastPoseSent < this._poseMinGap) return false;
    const pose = parsePose(head, lh, rh);
    if (!pose) return false;
    this._lastPoseSent = t;
    return this._send({ t: MSG.POSE, h: compactPart(pose.h), l: compactPart(pose.l), r: compactPart(pose.r) });
  }

  requestTag(targetId) {
    return this._send({ t: MSG.TAG, id: targetId });
  }

  setCosmetics(loadout) {
    this.cosmetics = loadout;
    return this._send({ t: MSG.COS, cosmetics: loadout });
  }

  /** Call from the game loop. Returns Map(id -> { pose, meta, player }). */
  sampleRemotes(localNow = Date.now()) {
    const t = this.serverNow(localNow);
    const out = new Map();
    for (const [id, p] of this.players) {
      if (id === this.localId) continue;
      const samp = p.buf.sample(t);
      if (!samp) continue;
      out.set(id, { id, pose: samp.pose, extrapolated: samp.extrapolated, player: p });
    }
    return out;
  }

  getRemote(id) {
    return this.players.get(id) || null;
  }

  _upsertPlayer(rec) {
    if (!rec || rec.id == null) return null;
    let p = this.players.get(rec.id);
    if (!p) {
      p = { id: rec.id, name: rec.name || 'Player', cosmetics: rec.cosmetics || { ...DEFAULT_COSMETICS }, it: !!rec.it, joinedAt: rec.joinedAt || 0, buf: new InterpBuffer({ delayMs: RENDER_DELAY_MS }) };
      this.players.set(rec.id, p);
    } else {
      if (rec.name) p.name = rec.name;
      if (rec.cosmetics) p.cosmetics = rec.cosmetics;
      if ('it' in rec) p.it = !!rec.it;
      if (rec.joinedAt) p.joinedAt = rec.joinedAt;
    }
    return p;
  }

  _onMessage(m) {
    if (!m || typeof m.t !== 'string') return;
    if (m.t === MSG.HB) {
      const t1 = Date.now();
      if (this._hbPending && (m.ping == null || m.ping === this._hbPending)) this._hbPending = null;
      if (Number.isFinite(m.ts)) this._syncClock(m.ts, m.ping || t1, t1);
      return;
    }
    if (m.t === MSG.WELCOME) {
      const t1 = Date.now();
      if (Number.isFinite(m.serverTime)) this._syncClock(m.serverTime, t1, t1);
      this.localId = m.id;
      this.room = m.room;
      this.modeState = m.mode;
      this.it = m.it || [];
      this.players.clear();
      for (const rec of m.players || []) this._upsertPlayer(rec);
      if (m.you) this._upsertPlayer(m.you);
      this._emit('welcome', m);
      this._emit('state', { mode: m.mode, it: m.it, players: m.players });
      return;
    }
    if (m.t === MSG.JOIN) {
      const p = this._upsertPlayer(m);
      this._emit('join', p);
      return;
    }
    if (m.t === MSG.LEFT) {
      const p = this.players.get(m.id);
      this.players.delete(m.id);
      this._emit('leave', { id: m.id, player: p });
      return;
    }
    if (m.t === MSG.SNAP) {
      if (Number.isFinite(m.ts)) this._syncClock(m.ts, Date.now(), Date.now());
      const rows = m.p || [];
      for (const row of rows) {
        const parsed = poseFromSnapshotRow(row);
        if (!parsed) continue;
        const p = this.players.get(parsed.id) || this._upsertPlayer({ id: parsed.id });
        if (parsed.id === this.localId) continue;
        p.buf.push(m.ts, parsed.pose);
      }
      this._emit('snapshot', m);
      return;
    }
    if (m.t === MSG.TAG) {
      this.it = m.it || this.it;
      for (const [id, p] of this.players) p.it = (m.it || []).includes(id);
      this._emit('tag', m);
      return;
    }
    if (m.t === MSG.COS) {
      const p = this._upsertPlayer({ id: m.id, cosmetics: m.cosmetics });
      if (m.id === this.localId) this.cosmetics = m.cosmetics;
      this._emit('cosmetics', { id: m.id, cosmetics: m.cosmetics, player: p });
      return;
    }
    if (m.t === MSG.STATE) {
      this.modeState = m.mode;
      this.it = m.it || [];
      for (const rec of m.players || []) this._upsertPlayer(rec);
      const live = new Set((m.players || []).map((p) => p.id));
      for (const id of [...this.players.keys()]) if (!live.has(id) && id !== this.localId) { /* keep until left */ }
      this._emit('state', m);
      return;
    }
    if (m.t === MSG.REJ) {
      this._emit('reject', m);
      return;
    }
    if (m.t === MSG.ERR) {
      this._emit('error', m);
    }
  }
}

export { InterpBuffer, poseFromSnapshotRow, MSG, DEFAULT_COSMETICS };
