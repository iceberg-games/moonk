import {
  MAX_PLAYERS, MAX_ROOMS, CODE_LENGTH, DEFAULT_TAG_MODE, TAG_MODES,
  makeCode, isCodeShape, normalizeCode, sanitizeName,
} from '../shared/protocol.js';
import { DEFAULT_COSMETICS, validateCosmetics } from '../shared/cosmetics.js';
import { ensureIt, publicState } from './tag.mjs';

export class RoomManager {
  constructor({ maxPlayers = MAX_PLAYERS, maxRooms = MAX_ROOMS, defaultMode = DEFAULT_TAG_MODE } = {}) {
    this.maxPlayers = maxPlayers;
    this.maxRooms = maxRooms;
    this.defaultMode = TAG_MODES.includes(defaultMode) ? defaultMode : DEFAULT_TAG_MODE;
    this.rooms = new Map(); // code -> room
  }

  _mode(raw) {
    return TAG_MODES.includes(raw) ? raw : this.defaultMode;
  }

  _newRoom({ isPrivate, mode }) {
    if (this.rooms.size >= this.maxRooms) return { ok: false, reason: 'server_full' };
    const code = makeCode(this.rooms);
    const room = {
      code,
      isPrivate: !!isPrivate,
      mode: this._mode(mode),
      maxPlayers: this.maxPlayers,
      players: new Map(),
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    return { ok: true, room };
  }

  _fullestPublic() {
    let best = null;
    for (const room of this.rooms.values()) {
      if (room.isPrivate) continue;
      if (room.players.size >= room.maxPlayers) continue;
      if (!best || room.players.size > best.players.size) best = room;
    }
    return best;
  }

  place(player, room) {
    room.players.set(player.id, player);
    player.room = room;
    player.joinedAt = Date.now();
    ensureIt(room);
    return room;
  }

  quickJoin(player, mode) {
    let room = this._fullestPublic();
    if (!room) {
      const made = this._newRoom({ isPrivate: false, mode });
      if (!made.ok) return made;
      room = made.room;
    }
    if (room.players.size >= room.maxPlayers) return { ok: false, reason: 'room_full' };
    this.place(player, room);
    return { ok: true, room };
  }

  createPrivate(player, mode) {
    const made = this._newRoom({ isPrivate: true, mode });
    if (!made.ok) return made;
    this.place(player, made.room);
    return { ok: true, room: made.room };
  }

  joinCode(player, rawCode) {
    const code = normalizeCode(rawCode);
    if (!isCodeShape(code) || code.length !== CODE_LENGTH) return { ok: false, reason: 'bad_code' };
    const room = this.rooms.get(code);
    if (!room) return { ok: false, reason: 'not_found' };
    if (room.players.size >= room.maxPlayers) return { ok: false, reason: 'room_full' };
    this.place(player, room);
    return { ok: true, room };
  }

  leave(player) {
    const room = player.room;
    if (!room) return;
    const wasIt = !!player.it;
    room.players.delete(player.id);
    player.room = null;
    player.it = false;
    if (room.players.size === 0) {
      this.rooms.delete(room.code);
      return { room: null, wasIt };
    }
    if (wasIt) ensureIt(room);
    return { room, wasIt };
  }

  snapshotInfo() {
    return [...this.rooms.values()].map((r) => ({
      code: r.code,
      public: !r.isPrivate,
      mode: r.mode,
      players: r.players.size,
    }));
  }

  playerView(p) {
    return { id: p.id, name: p.name, cosmetics: p.cosmetics, it: !!p.it, joinedAt: p.joinedAt };
  }

  welcomePayload(player, room, serverTime) {
    return {
      t: 'welcome',
      id: player.id,
      serverTime,
      tickHz: 20,
      room: {
        code: room.code,
        public: !room.isPrivate,
        mode: room.mode,
        maxPlayers: room.maxPlayers,
      },
      you: this.playerView(player),
      ...publicState(room),
    };
  }
}

export { sanitizeName, validateCosmetics, DEFAULT_COSMETICS };
