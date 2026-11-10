// Shared by client and server. Data-driven: add a new monster/map/mode by adding an entry here
// (plus art in src/avatar.js LOOKS and, for maps, a builder in src/maps/).
// Players vote on one of these (3 maps) in the lobby before every round.
export const MAPS = {
  forest: { name: 'Canopy Forest', blurb: 'Climb the giant trees' },
  crypt:  { name: 'Haunted Crypt', blurb: 'Horror: fog, tombs, a long dark hall', horror: true },
  marsh:  { name: 'Hollow Marsh', blurb: 'Horror: dead trees, a creepy cabin, thick fog', horror: true },
};
export const MODES = {
  normal: { name: 'Normal Tag', blurb: 'Infection: tagged players become taggers' },
  horror: { name: 'Horror: Be the Monster', blurb: '2-min rounds. One monster hunts the monkeys.', round: 120, intermission: 30 },
};
// Each monster has named forms. A form sets how the monster moves, whether/how far it can tag, and its look.
//   move.type: 'stick' = smooth thumbstick locomotion + snap/smooth turn (speed m/s)
//   Monkeys never use this: no legs, they move only by pushing off surfaces with their hands (Gorilla Tag-style locomotion).
//   reach: metres from the monster's head/hands to a monkey's head that counts as a catch (needs canTag)
//   tagCooldown: seconds between catches.   switchCooldown: seconds between form switches.
export const MONSTERS = {
  locust: {
    name: 'Locust', startForm: 'main', switchCooldown: 0, blurb: 'Full-body with legs, thumbstick walker. Slow, but a wide, very fast grab up close.',
    forms: { main: { label: 'Locust', look: 'locust', move: { type: 'stick', speed: 1.9 }, canTag: true, reach: 2.2, tagCooldown: 0.3, scale: 1.45 } },
  },
  yeti: {
    name: 'Yeti', startForm: 'human', switchCooldown: 6, blurb: 'Fast human form to sneak up; yeti form barely moves but has very long arms.',
    forms: {
      human: { label: 'Human form', look: 'human', move: { type: 'stick', speed: 7.5 }, canTag: false, reach: 0, tagCooldown: 0, scale: 1.0, switchTo: 'yeti' },
      yeti:  { label: 'Yeti form',  look: 'yeti',  move: { type: 'stick', speed: 0.3 }, canTag: true, reach: 4.2, tagCooldown: 0.6, scale: 2.6, armLength: 4.2, switchTo: 'human' },
    },
  },
};
export const CLASSIC_REACH = 0.6;   // hand (or 0.8 head) to victim head
export const formDef = (type, form) => MONSTERS[type]?.forms[form] || null;

// Generators (horror mode objective). Runners turn a VALVE wheel with a VR hand: clockwise raises progress, counter-clockwise lowers it.
// Each map has 5 spawn points [x, y, z]; the server picks a few per round. Generators face the map centre.
export const GEN_SPOTS = {
  forest: [[9, 0, 9], [-11, 0, 6], [3, 0, -15], [-7, 0, -19], [17, 0, -3]],
  crypt:  [[-4, 0, -22], [19, 0, 11], [-20, 0, 13], [5, 0, -10], [14, 0, -24]],
  marsh:  [[8, 0, -8], [-5, 0, 14], [20, 0, -4], [-22, 0, 2], [9, 0, 23]],
};
export const GEN_TURNS = 2;            // full clockwise turns of the valve to finish one generator
export const GEN_MAX_RATE = 9;         // rad/s the server will credit (anti-cheat)
export const GEN_GRAB_RANGE = 1.3;     // m, hand to valve for the server to accept turns
export const genCountFor = (players) => (players >= 6 ? 4 : 3);
