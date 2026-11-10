// Tuning: enemies and the schedule they arrive on.

// `armor` cuts physical damage, `ward` cuts magic damage, as fractions. Stalkers are
// faster than the hero on purpose: running away must not be enough to win a run.
const ENEMIES = {
  mite: { name: 'Mite', shape: 'circle', pen: 'ink-muted', r: 9, hp: 12, speed: 58, damage: 14, armor: 0, ward: 0, xp: 1 },
  runner: { name: 'Runner', shape: 'triangle', pen: 'ink', r: 8, hp: 8, speed: 120, damage: 10, armor: 0, ward: 0, xp: 1 },
  stalker: { name: 'Stalker', shape: 'triangle', pen: 'red-pencil', r: 11, hp: 40, speed: 165, damage: 16, armor: 0.25, ward: 0.25, xp: 6 },
  ironclad: { name: 'Ironclad', shape: 'square', pen: 'ink-muted', r: 13, hp: 45, speed: 46, damage: 28, armor: 0.6, ward: 0, xp: 3 },
  warded: { name: 'Warded', shape: 'diamond', pen: 'ink-muted', r: 13, hp: 36, speed: 54, damage: 25, armor: 0, ward: 0.6, xp: 3 },
  hulk: { name: 'Iron Hulk', shape: 'square', pen: 'ink-muted', r: 28, hp: 400, speed: 40, damage: 65, armor: 0.6, ward: 0.1, xp: 25, elite: true },
  warden: { name: 'Spell Warden', shape: 'diamond', pen: 'ink-muted', r: 28, hp: 350, speed: 46, damage: 56, armor: 0.1, ward: 0.6, xp: 25, elite: true },
};
const ENEMY_LIST = Object.values(ENEMIES);

// From `at` on: enemies per second and their mix (relative weights).
const WAVES = [
  { at: 0, rate: 1.4, mix: { mite: 1 } },
  { at: 40, rate: 2.2, mix: { mite: 4, runner: 1 } },
  { at: 100, rate: 3, mix: { mite: 4, runner: 2, ironclad: 1 } },
  { at: 200, rate: 3.5, mix: { mite: 3, runner: 2, ironclad: 1, warded: 1 } },
  { at: 330, rate: 4.5, mix: { mite: 3, runner: 2, ironclad: 2, warded: 2 } },
  { at: 420, rate: 5, mix: { mite: 3, runner: 2, ironclad: 2, warded: 2, stalker: 0.15 } },
  { at: 540, rate: 5.5, mix: { mite: 2, runner: 3, ironclad: 3, warded: 3, stalker: 0.3 } },
  { at: 660, rate: 7, mix: { mite: 2, runner: 3, ironclad: 4, warded: 4, stalker: 0.6 } },
  { at: 900, rate: 8, mix: { mite: 1, runner: 3, ironclad: 4, warded: 4, stalker: 1 } },
  { at: 1200, rate: 9, mix: { runner: 3, ironclad: 4, warded: 4, stalker: 1.5 } },
  { at: 1500, rate: 10, mix: { runner: 3, ironclad: 4, warded: 4, stalker: 2 } },
  { at: 1800, rate: 12, mix: { runner: 2, ironclad: 4, warded: 4, stalker: 3 } },
];

// Elites come every `every` seconds and drop a chest. The last wave listed repeats for good.
const ELITES = { every: 180, waves: [['hulk'], ['warden'], ['hulk', 'warden']] };

// Rings around the hero. They have gaps to slip through at first; once they close, cut your
// way out, or use Flash or Ghost. After the table, one of RING_LOOP every so often, for good.
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
    { type: 'runner', count: 70 },
    { type: 'ironclad', count: 40 },
    { type: 'stalker', count: 24 },
  ],
};
