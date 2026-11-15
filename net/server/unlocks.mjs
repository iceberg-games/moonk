// In-session unlock progress. Persistent identity does not exist yet, so
// everything here lives on the socket/player object and is lost on disconnect.
// 'hub_visits_5' (Visit the Hub on 5 different days) cannot be granted here.

import { isUnlockOnly } from '../shared/cosmetics.js';

export function initUnlockState(player) {
  player.unlocks = player.unlocks instanceof Set ? player.unlocks : new Set();
  player.catches = player.catches || 0;       // session tag catches
  player.lifeTags = player.lifeTags || 0;     // tags since last time this player was tagged
  player.nightWins = player.nightWins || 0;
}

export function grantUnlock(player, token) {
  initUnlockState(player);
  if (!token) return false;
  if (player.unlocks.has(token)) return false;
  player.unlocks.add(token);
  return true;
}

function met(unlock, player) {
  const catches = /^tag_catches_(\d+)$/.exec(unlock);
  if (catches) return player.catches >= Number(catches[1]);
  const streak = /^tag_streak_(\d+)$/.exec(unlock);
  if (streak) return player.lifeTags >= Number(streak[1]);
  if (unlock === 'night_lobby_win') return (player.nightWins || 0) >= 1;
  // hub_visits_N needs a stable player id and a clock across days — not available yet.
  return false;
}

export function evaluateUnlocks(player, catalog, reason) {
  initUnlockState(player);
  if (!catalog) return [];
  const newly = [];
  for (const item of catalog.items) {
    if (!isUnlockOnly(item)) continue;
    if (player.unlocks.has(item.id) || (item.unlock && player.unlocks.has(item.unlock))) continue;
    if (!met(item.unlock, player)) continue;
    player.unlocks.add(item.id);
    if (item.unlock) player.unlocks.add(item.unlock);
    newly.push({ id: item.id, unlock: item.unlock, name: item.name });
  }
  return newly.map((item) => ({ ...item, reason }));
}

export function recordCatch(player, catalog) {
  initUnlockState(player);
  player.catches += 1;
  player.lifeTags += 1;
  return evaluateUnlocks(player, catalog, 'catch');
}

/** The player was tagged / caught: the "one life" streak resets. */
export function recordTagged(player) {
  initUnlockState(player);
  player.lifeTags = 0;
}

export function recordLobbyWin(player, { night = false } = {}, catalog) {
  initUnlockState(player);
  if (night) player.nightWins += 1;
  return evaluateUnlocks(player, catalog, 'lobby_win');
}

export function unlockEvent(player, items, reason) {
  return {
    t: 'unlock',
    id: player.id,
    items,
    reason,
    progress: { catches: player.catches || 0, lifeTags: player.lifeTags || 0, nightWins: player.nightWins || 0 },
  };
}
