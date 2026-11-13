// Tuning: enemies and the schedule they arrive on.

// `armor` blunts physical damage and `ward` magic damage, as the hero's armor does: a hit does
// 100 / (100 + armor) of its damage, so 100 armor halves it. `grow` adds armor and ward every
// minute past `from`. Tanks (`tank: true`) come late and need the right kind of damage, or
// burning and penetration. Stalkers are faster than the hero on purpose: running away must
// not be enough to win a run.
//
// An enemy with `keep: [near, far]` does not walk into the hero: it comes up to `far`, backs
// off inside `near`, and sidesteps in between. `attacks` are what it does from a distance,
// each `every` seconds while the hero is within `range`; `mark: 'dot'` shows such an enemy.
//   shot    one shot at the hero                      fan     `count` shots, `spread` apart
//   lob     a strike where the hero will be in `lead` seconds: a circle warns for `delay`
//   slam    a strike around the enemy itself, warned the same way; it stands still meanwhile
//   charge  after `delay` it dashes `distance` in a straight line: a line warns
//   nova    `count` shots in a circle, and every `orbEvery`-th time a slow `orb` that homes in
//   spiral  `count` shots one after another, `gap` seconds and `twist` radians apart
// Shot damage grows with the minutes of the run exactly as contact damage does.
const ENEMIES = {
  mite: { name: 'Mite', shape: 'circle', pen: 'ink-muted', r: 9, hp: 12, speed: 58, damage: 14, armor: 0, ward: 0, xp: 1 },
  runner: { name: 'Runner', shape: 'triangle', pen: 'ink', r: 8, hp: 8, speed: 120, damage: 10, armor: 0, ward: 0, xp: 1 },
  stalker: { name: 'Stalker', shape: 'triangle', pen: 'red-pencil', r: 11, hp: 40, speed: 165, damage: 16, armor: 33, ward: 33, xp: 6 },
  ironclad: { name: 'Ironclad', shape: 'square', pen: 'ink-muted', r: 13, hp: 45, speed: 46, damage: 28, armor: 150, ward: 0, xp: 3 },
  warded: { name: 'Warded', shape: 'diamond', pen: 'ink-muted', r: 13, hp: 36, speed: 54, damage: 25, armor: 0, ward: 150, xp: 3 },

  slinger: { name: 'Slinger', shape: 'circle', mark: 'dot', pen: 'ink-muted', r: 10, hp: 18, speed: 70, damage: 10, armor: 0, ward: 0, xp: 2,
    keep: [180, 260],
    attacks: [{ type: 'shot', every: 2.6, range: 330, kind: 'phys', speed: 190, damage: 16, r: 5 }] },
  hexer: { name: 'Hexer', shape: 'diamond', mark: 'dot', pen: 'ink-muted', r: 12, hp: 26, speed: 55, damage: 10, armor: 0, ward: 100, xp: 3,
    keep: [220, 300],
    attacks: [{ type: 'fan', every: 4, range: 360, kind: 'magic', speed: 160, damage: 14, r: 5, count: 3, spread: 0.21 }] },
  mortar: { name: 'Mortar', shape: 'square', mark: 'dot', pen: 'ink-muted', r: 13, hp: 40, speed: 35, damage: 12, armor: 67, ward: 0, xp: 4,
    keep: [240, 380],
    attacks: [{ type: 'lob', every: 5, range: 430, kind: 'phys', damage: 40, radius: 55, delay: 1.1, lead: 0.8 }] },

  // Tanks. Iron and Ward Tanks gain 10 armor (ward) a minute from minute 20; the Colossus has
  // modest armor and a lot of health, so burning and flat penetration work best on it.
  irontank: { name: 'Iron Tank', shape: 'square', pen: 'ink-muted', r: 18, hp: 112, speed: 38, damage: 40, armor: 300, ward: 50, xp: 10, tank: true,
    grow: { from: 20, armor: 10, ward: 0 } },
  wardtank: { name: 'Ward Tank', shape: 'diamond', pen: 'ink-muted', r: 18, hp: 90, speed: 44, damage: 36, armor: 50, ward: 300, xp: 10, tank: true,
    grow: { from: 20, armor: 0, ward: 10 } },
  colossus: { name: 'Colossus', shape: 'circle', pen: 'ink-muted', r: 24, hp: 270, speed: 32, damage: 50, armor: 60, ward: 60, xp: 14, tank: true },

  hulk: { name: 'Iron Hulk', shape: 'square', pen: 'ink-muted', r: 28, hp: 400, speed: 40, damage: 65, armor: 150, ward: 11, xp: 25, elite: true, grow: { from: 0, armor: 3, ward: 3 },
    attacks: [
      { type: 'slam', every: 6, range: 150, kind: 'phys', radius: 110, delay: 0.8, damage: 50 },
      { type: 'charge', every: 9, range: 330, delay: 0.6, distance: 280, speed: 520 },
    ] },
  warden: { name: 'Spell Warden', shape: 'diamond', pen: 'ink-muted', r: 28, hp: 350, speed: 46, damage: 56, armor: 11, ward: 150, xp: 25, elite: true, grow: { from: 0, armor: 3, ward: 3 },
    attacks: [{ type: 'nova', every: 5, range: 400, kind: 'magic', count: 12, speed: 150, damage: 16, r: 5, orbEvery: 2,
      orb: { kind: 'magic', speed: 75, damage: 26, r: 9, life: 4, turn: 1.6 } }] },
  siege: { name: 'Siege Engine', shape: 'square', mark: 'dot', pen: 'ink-muted', r: 30, hp: 480, speed: 28, damage: 60, armor: 54, ward: 54, xp: 30, elite: true, grow: { from: 0, armor: 3, ward: 3 },
    attacks: [{ type: 'spiral', every: 3, range: 440, kind: 'phys', count: 10, gap: 0.08, twist: 0.5, speed: 140, damage: 14, r: 5 }] },
};
const ENEMY_LIST = Object.values(ENEMIES);

// From `at` on: enemies per second and their mix (relative weights).
const WAVES = [
  { at: 0, rate: 1.4, mix: { mite: 1 } },
  { at: 40, rate: 2.2, mix: { mite: 4, runner: 1 } },
  { at: 100, rate: 3, mix: { mite: 4, runner: 2, ironclad: 1 } },
  { at: 150, rate: 3.2, mix: { mite: 4, runner: 2, ironclad: 1, slinger: 0.8 } },
  { at: 200, rate: 3.5, mix: { mite: 3, runner: 2, ironclad: 1, warded: 1, slinger: 0.8 } },
  { at: 330, rate: 4.5, mix: { mite: 3, runner: 2, ironclad: 2, warded: 2, slinger: 1, hexer: 0.6 } },
  { at: 420, rate: 5, mix: { mite: 3, runner: 2, ironclad: 2, warded: 2, stalker: 0.15, slinger: 1, hexer: 0.8 } },
  { at: 480, rate: 5.2, mix: { mite: 3, runner: 2, ironclad: 2, warded: 2, stalker: 0.2, slinger: 1, hexer: 0.8, mortar: 0.5 } },
  { at: 540, rate: 5.5, mix: { mite: 2, runner: 3, ironclad: 3, warded: 3, stalker: 0.3, slinger: 1.2, hexer: 1, mortar: 0.6 } },
  { at: 660, rate: 7, mix: { mite: 2, runner: 3, ironclad: 4, warded: 4, stalker: 0.6, slinger: 1.5, hexer: 1.2, mortar: 0.8 } },
  { at: 900, rate: 8, mix: { mite: 1, runner: 3, ironclad: 4, warded: 4, stalker: 1, slinger: 1.5, hexer: 1.5, mortar: 1 } },
  // Tanks: about 3% of the flow from minute 20, 12% from 25, a quarter from 30.
  { at: 1200, rate: 9, mix: { runner: 3, ironclad: 4, warded: 4, stalker: 1.5, slinger: 1.5, hexer: 1.5, mortar: 1, irontank: 0.17, wardtank: 0.17, colossus: 0.17 } },
  { at: 1500, rate: 10, mix: { runner: 3, ironclad: 4, warded: 4, stalker: 2, slinger: 1.5, hexer: 2, mortar: 1.2, irontank: 0.8, wardtank: 0.8, colossus: 0.8 } },
  { at: 1800, rate: 12, mix: { runner: 2, ironclad: 4, warded: 4, stalker: 3, slinger: 1.5, hexer: 2, mortar: 1.5, irontank: 2, wardtank: 2, colossus: 2 } },
];

// Elites come every `every` seconds and drop a chest. The last wave listed repeats for good.
const ELITES = {
  every: 180,
  waves: [['hulk'], ['warden'], ['hulk', 'warden'], ['siege', 'hulk'], ['siege', 'warden'], ['hulk', 'warden', 'siege']],
};

// Rings around the hero. They have gaps to slip through at first; once they close, cut your
// way out, or use Flash or Ghost. After the table, one of RING_LOOP every so often, for good;
// a ring with `from` is skipped before that second.
const RINGS = [
  { at: 150, type: 'mite', count: 40 },
  { at: 300, type: 'mite', count: 50 },
  { at: 450, type: 'ironclad', count: 18 },
  { at: 600, type: 'warded', count: 22 },
  { at: 750, type: 'runner', count: 60 },
  { at: 850, type: 'ironclad', count: 30 },
];
const RING_LOOP = {
  every: 120,
  rings: [
    { type: 'warded', count: 40 },
    { type: 'slinger', count: 26 }, // standing still inside this one is not an option
    { type: 'runner', count: 70 },
    { type: 'ironclad', count: 40 },
    { type: 'stalker', count: 24 },
    { type: 'irontank', count: 12, from: 1800 },
    { type: 'wardtank', count: 12, from: 1800 },
  ],
};
