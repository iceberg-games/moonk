// Shared by client and server. Data-driven: add a new monster/map/mode by adding an entry here
// (plus art in src/avatar.js LOOKS and, for maps, a builder in src/maps/).
// Players vote on one of these (3 maps) in the lobby before every round.
export const MAPS = {
  forest: { name: 'Canopy Forest', blurb: 'Climb the giant trees' },
  crypt:  { name: 'Haunted Crypt', blurb: 'Horror: fog, tombs, a long dark hall', horror: true },
  marsh:  { name: 'Hollow Marsh', blurb: 'Horror: dead trees, a creepy cabin, thick fog', horror: true },
  carnival: { name: 'Rusted Carnival', blurb: 'Horror: dead fair, Ferris wheel, funhouse maze', horror: true },
  mine: { name: 'Hollow Shaft', blurb: 'Horror: abandoned mine, deep pit, timber trestle', horror: true },
  lighthouse: { name: 'Drowned Lighthouse', blurb: 'Horror: storm island, leaning tower, rope bridges', horror: true },
  trainyard: { name: 'Frozen Yard', blurb: 'Horror: snowed-in rail yard, boxcar roofs, water tower', horror: true },
};
export const MODES = {
  normal: { name: 'Classic Tag', blurb: 'Infection: tagged players become taggers. Survive the clock to win.', round: 180 },
  horror: { name: 'Be the Monster', blurb: '2-minute rounds. One monster hunts the monkeys; survive until the timer ends.', round: 120, intermission: 30 },
};
// Each monster has named forms. A form sets how the monster moves, whether/how far it can tag, and its look.
//   move.type: 'arms' = normal monkey hand push-off locomotion; 'stick' = smooth thumbstick walking (legs) + snap/smooth turn, speed in m/s.
//   Monkeys ALWAYS use 'arms': no legs, they only move by pushing off surfaces with their hands (top speed ~6.5 m/s, see LOCO in src/physics.js).
//   canTag/reach/tagCooldown: server-checked catch. reach = metres from the monster's head AND hands to a monkey's head
//     (forms with handOnly: from the hands only, measured to the monkey's head).
//   Catch time ("dwell"): a monkey must stay inside reach for need(d) seconds, where need is nearT at distance <= near and rises
//     linearly to farT at the edge of reach. That is "tags faster up close". Progress decays when a monkey leaves.
//   armGain/armLength (long-arm forms): the client multiplies hand offset from the head by armGain, capped at armLength metres.
//   The server rejects hands further than armLength+0.3 m from the head, so the long reach can not be spoofed.
//   switchCooldown (per monster): seconds between form switches, counted from the START of a switch.  tell: seconds of "transforming" before the form flips (cannot tag, cannot move).
export const FORM_TELL = 0.4;
export const MONSTERS = {
  locust: {
    name: 'Locust', startForm: 'main', switchCooldown: 0, blurb: 'Has legs and walks with the thumbstick. Slower than monkeys, but a very fast catch up close.',
    forms: { main: { label: 'Locust', look: 'locust', move: { type: 'stick', speed: 2.2 }, canTag: true, reach: 2.2, near: 1.0, nearT: 0.05, farT: 0.6, tagCooldown: 0.3, scale: 1.45 } },
  },
  yeti: {
    name: 'Yeti', startForm: 'human', switchCooldown: 6, blurb: 'Walks around as a harmless human, then transforms into a huge yeti with very long grabbing arms that barely moves.',
    forms: {
      human: { label: 'Human form', look: 'human', move: { type: 'stick', speed: 3.5 }, canTag: false, reach: 0, tagCooldown: 0, scale: 1.0, switchTo: 'yeti' },
      yeti:  { label: 'Yeti form',  look: 'yeti',  move: { type: 'stick', speed: 0.3 }, canTag: true, handOnly: true, reach: 0.9, near: 0.5, nearT: 0.12, farT: 0.35, tagCooldown: 0.6, scale: 2.6, armGain: 4.5, armLength: 3.2, legs: false, switchTo: 'human' },
    },
  },
};
// Signature abilities (overnight killers). monster.ability = { id, name, cooldown, tell, active, ... }. Client sends {t:'ab'} (controller A/B/X/Y); the SERVER enforces
// the cooldown (counted from the START of the last use), the tell (monster frozen + cannot tag, everyone gets an 'abstart' event) and the active window.
//   lunge    (Gulper):   after the tell the client dashes forward at `speed` m/s for `active` s; during the dash the catch uses the larger `lunge` reach/dwell of the form.
//   burrow   (Burrower): state 1 tell (dirt churns, sinking), state 2 UNDERGROUND `active` s (fast `speed`, hidden, cannot tag: `noTag`), state 3 erupt `post` s (jaw snap, bigger `erupt` catch).
//   disguise (Mimic):    state 2 = disguised `active` s: the server sends everyone else a plain monkey snapshot with a real player's name; a tag or the timeout unmasks (state 3, `post` s, loud, visible to all).
//   reel     (Dangler):  tell 0.5 s (throat swell), then the server ray-tests the facing line `range` m (capsule `radius`) once; the first runner hit gets a 'fling' toward the Dangler (`yank` m) + `stun` s. Everyone sees the tongue (abgo carries from/dir/len/hit).
//   shriek   (Wailer):   tell 0.6 s inhale, then runners within `radius` m get {t:'shr'} (push-off gain x`gain` for `active` s) and the Wailer alone gets {t:'ping', ids} for `ping` s.
//   cling    (Lurker):   tell 0.5 s (claw scrape, grit falls), then `active` s clinging: the CLIENT turns gravity off and crawls along walls/ceilings at `speed` m/s (LOCO.cling). Cannot tag while clinging (`noTag` [1,2]).
//                        The monster can end it early with the ability button (`release`); then state 3 = POUNCE window `post` s with the bigger `erupt` catch (2.0 m, ~0.05 s).
//   tether   (Stringman): tell 0.5 s (strings glow), then the server picks the nearest runner within `range` m inside a `cone` degree half-angle of the facing direction. Hit: {t:'tether', o, r, ms} to the victim
//                        (client LOCO leash: head may not stray more than `leash` m from the anchor `o` for `active` s) and abgo carries {o, hit} so everyone sees the string. A miss still burns the cooldown.
//   blackout (Grinner):  for `active` s every monkey within `radius` m of the Grinner has its vision/lights dimmed (client-side fog); no effect on the monster.
/** Seconds a monkey at distance d must stay in reach before the server counts the catch. */
export const dwellFor = (def, d) => { const near = def.near ?? 0, k = d <= near ? 0 : Math.min(1, (d - near) / Math.max(1e-6, def.reach - near)); return def.nearT + (def.farT - def.nearT) * k; };
MONSTERS.gulper = {
  name: 'Gulper', startForm: 'main', switchCooldown: 0, blurb: 'A hunched knuckle-runner with an oversized hinged jaw. Opens wide, then lunges.',
  ability: { id: 'lunge', name: 'Lunge', cooldown: 8, tell: 0.5, active: 0.45, speed: 10.5 },
  forms: { main: { label: 'Gulper', look: 'gulper', move: { type: 'stick', speed: 3.0 }, canTag: true, reach: 1.4, near: 0.7, nearT: 0.08, farT: 0.3, tagCooldown: 0.4, scale: 1.3,
    lunge: { reach: 2.0, near: 1.2, nearT: 0.03, farT: 0.1 } } },
};
MONSTERS.grinner = {
  name: 'Grinner', startForm: 'main', switchCooldown: 0, blurb: 'Tall, thin, a smile too wide for its face. Giggles, and then the lights go out around you.',
  ability: { id: 'blackout', name: 'Blackout', cooldown: 15, tell: 0.6, active: 3, radius: 12 },
  forms: { main: { label: 'Grinner', look: 'grinner', move: { type: 'stick', speed: 2.4 }, canTag: true, reach: 2.0, near: 1.0, nearT: 0.1, farT: 0.45, tagCooldown: 0.5, scale: 1.5 } },
};
MONSTERS.burrower = {
  name: 'Burrower', startForm: 'main', switchCooldown: 0, blurb: 'A segmented worm with a ring of inward-pointing teeth. Dives underground, then erupts under your feet.',
  ability: { id: 'burrow', name: 'Burrow', cooldown: 14, tell: 0.45, active: 2.5, post: 0.5, speed: 7.0, noTag: [1, 2] },   // post = erupt window (state 3): jaw snap with the bigger `erupt` catch
  forms: { main: { label: 'Burrower', look: 'burrower', move: { type: 'stick', speed: 2.6 }, canTag: true, reach: 1.3, near: 0.6, nearT: 0.08, farT: 0.3, tagCooldown: 0.5, scale: 1.25,
    erupt: { reach: 2.2, near: 1.5, nearT: 0.02, farT: 0.08 } } },
};
MONSTERS.mimic = {
  name: 'Mimic', startForm: 'main', switchCooldown: 0, blurb: 'Looks like any other monkey with a real player\'s name tag. Tag someone, or run out the clock, and the face splits open.',
  ability: { id: 'disguise', name: 'Disguise', cooldown: 20, tell: 0.3, active: 6, post: 0.8, speed: 3.6, private: true, revealOnTag: true, noTag: [1] },   // private: only the Mimic hears abstart/abgo; the SERVER sends everyone else a monkey snapshot
  forms: { main: { label: 'Mimic', look: 'mimic', move: { type: 'stick', speed: 2.8 }, canTag: true, reach: 1.5, near: 0.7, nearT: 0.1, farT: 0.35, tagCooldown: 0.5, scale: 1.0 } },
};
MONSTERS.dangler = {
  name: 'Dangler', startForm: 'main', switchCooldown: 0, blurb: 'Hangs from a hook on its own rubbery neck. Its throat swells, and a barbed tongue reels you in.',
  ability: { id: 'reel', name: 'Reel', cooldown: 12, tell: 0.5, active: 0.35, range: 9, radius: 0.55, yank: 4, stun: 0.5 },   // state 2 = tongue out; the SERVER ray-tests it once, at the start of state 2
  forms: { main: { label: 'Dangler', look: 'dangler', move: { type: 'stick', speed: 2.4 }, canTag: true, reach: 1.3, near: 0.6, nearT: 0.08, farT: 0.3, tagCooldown: 0.5, scale: 1.2 } },
};
MONSTERS.wailer = {
  name: 'Wailer', startForm: 'main', switchCooldown: 0, blurb: 'A floating ragged shroud split by one tall mouth. Its shriek weakens your arms and marks you for it.',
  ability: { id: 'shriek', name: 'Shriek', cooldown: 16, tell: 0.6, active: 2.5, radius: 10, gain: 0.5, ping: 1.5 },   // runners within radius: push-off gain x`gain` for `active` s (client LOCO multiplier), pinged to the Wailer only for `ping` s
  forms: { main: { label: 'Wailer', look: 'wailer', move: { type: 'stick', speed: 2.9 }, canTag: true, reach: 1.7, near: 0.8, nearT: 0.1, farT: 0.4, tagCooldown: 0.5, scale: 1.3 } },
};
MONSTERS.lurker = {
  name: 'Lurker', startForm: 'main', switchCooldown: 0, blurb: 'A flat pale slab with a mouth along its whole front edge. Clings to walls and ceilings, then drops on you.',
  ability: { id: 'cling', name: 'Cling', cooldown: 14, tell: 0.5, active: 4, post: 0.4, speed: 3.0, noTag: [1, 2], release: true },   // state 2 = clinging (client crawls surfaces), state 3 = pounce window
  forms: { main: { label: 'Lurker', look: 'lurker', move: { type: 'stick', speed: 2.5 }, canTag: true, reach: 1.4, near: 0.7, nearT: 0.08, farT: 0.3, tagCooldown: 0.5, scale: 1.3,
    erupt: { reach: 2.0, near: 1.4, nearT: 0.02, farT: 0.05 } } },   // erupt = the pounce catch (state 3)
};
MONSTERS.stringman = {
  name: 'Stringman', startForm: 'main', switchCooldown: 0, blurb: 'A cracked ventriloquist doll on strings. It ties a string to you and you cannot run far.',
  ability: { id: 'tether', name: 'Tether', cooldown: 15, tell: 0.5, active: 2.5, range: 8, cone: 35, leash: 2.5 },   // nearest runner within range m and cone deg of the facing line is leashed to where it was hit for `active` s
  forms: { main: { label: 'Stringman', look: 'stringman', move: { type: 'stick', speed: 2.6 }, canTag: true, reach: 1.5, near: 0.7, nearT: 0.08, farT: 0.3, tagCooldown: 0.5, scale: 1.25 } },
};
export const CLASSIC_REACH = 0.6;   // hand (or 0.8 head) to victim head
export const formDef = (type, form) => MONSTERS[type]?.forms[form] || null;

// Generators (horror mode objective). Runners turn a VALVE wheel with a VR hand: clockwise raises progress, counter-clockwise lowers it.
// Each map has 5 spawn points [x, y, z]; the server picks a few per round. Generators face the map centre.
export const GEN_SPOTS = {
  forest: [[9, 0, 9], [-11, 0, 6], [3, 0, -15], [-7, 0, -19], [17, 0, -3]],
  crypt:  [[-4, 0, -22], [19, 0, 11], [-20, 0, 13], [5, 0, -10], [14, 0, -24]],
  marsh:  [[8, 0, -8], [-5, 0, 14], [20, 0, -4], [-22, 0, 2], [9, 0, 23]],
  carnival: [[-13, 0, 13], [14, 0, 17], [-10, 0, -14], [3, 0, -16], [28, 0, 4]],
  mine: [[12, 0, 12], [-12, 0, 13], [-13, 0, -12], [12, 0, -13], [0, 0, -31]],
  lighthouse: [[-17, 0.8, -17], [17, 0.8, -17], [17, 0.8, 17], [-8.5, 4, -4], [7, 4, -8]],
  trainyard: [[-22, 0, 22], [-3, 0, -18], [22, 0, -6], [14, 0, 24], [46, 0, -24]],
};
export const GEN_ENABLED = true;       // generators are back as a side objective in Be the Monster: fill one (valve) = +1 Moon, paid once. The round still ends only on catch-all or the 120 s timer.
export const GEN_COIN = 1;             // Moons paid to the player who completes a generator (once per generator per round)
export const GEN_TURNS = 2;            // full clockwise turns of the valve to finish one generator
export const GEN_MAX_RATE = 9;         // rad/s the server will credit (anti-cheat)
export const GEN_GRAB_RANGE = 1.3;     // m, hand to valve for the server to accept turns
export const genCountFor = (players) => (players >= 6 ? 4 : 3);
