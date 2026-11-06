// Steel & Spell: a horde-survival demo in vanilla JS + canvas, no dependencies.
// Walk, collect orbs, level up. Weapons fire on their own; the one button is the
// active skill picked before the run. Weapons are physical or magic, upgrades are
// split the same way, and armored enemies blunt one of the two damage types. Pure
// damage ignores armor altogether. Two matching weapons merge into a stronger one,
// and chests hold unique items. A run never ends by itself: the horde keeps growing
// until it wins, and the time you lasted is your score.
//
// All tuning lives in the tables below, so numbers can change (or move to another
// engine) without touching the logic. Times are in seconds, distances in world units.
//
// Open with ?dev in the URL for test keys: L level up, G weapon pick, I open a chest,
// K die (with a spare life, to see the revive), R reset the active skill, T skip a minute.

const TAU = Math.PI * 2;
const DPR = Math.min(2, window.devicePixelRatio || 1);
const DEV = new URLSearchParams(location.search).has('dev');

const VIEW_SHORT = 560; // world units along the screen's short side...
const MIN_SCALE = 0.8; // ...unless that would make everything too small on a phone
const WEAPON_LEVELS = [10, 20, 40, 60]; // new weapons at these levels; the first comes before the run
const XP_BASE = 5;
const XP_PER_LEVEL = 2.7;
const HP_PER_MINUTE = 0.12; // enemy health grows this much per minute of the run...
const HP_ACCEL = 0.03; // ...and this much per minute squared, to keep up with five weapons...
const HP_WALL = { from: 13, doubling: 2.3 }; // ...and from this minute on also doubles every so many minutes, so every run ends
const DAMAGE_PER_MINUTE = 0.12;
const SPEED_PER_MINUTE = 0.03;
const AIM_RANGE = 460;
const ORB_PULL_SPEED = 340;
const WILD_ORB_EVERY = 3; // orbs also appear on the map, away from any fight
const RED_ORB = { heal: 0.15, every: 1200, eliteDrop: 3, max: 10 }; // `heal` is a share of max health, `every` a distance walked
const COOLDOWN_CAP = 0.8; // no weapon's cooldown can be cut by more than this
const BODY_SHOVE = 0.25; // share of an overlap the hero gives way on: small enemies
const ELITE_SHOVE = 0.8; // and elites, who mostly push the hero around
const SEPARATION = 0.5;
const MAX_PUSHES = 5;
const RECYCLE_MARGIN = 260; // enemies this far off screen come back ahead of the hero
const MAX_ENEMIES = 320;
const MAX_ORBS = 160;
const MAX_FX = 120;
const MAX_NUMBERS = 40;
const MAX_ENEMY_R = 30;
const STICK_RADIUS = 46;

const BEST_KEY = 'games.steelspell.best';
const LAST_KEY = 'games.steelspell.last';

// `attack` is the base attack: at 100 every weapon deals the damage listed in its table.
// `lives` are the spare lives a run starts with; items can add more.
const HERO = { hp: 300, attack: 100, speed: 150, r: 11, magnet: 72, iframes: 0.5, lives: 0 };

// Spending a spare life: full health and a blast of pure damage, `share` of max health.
const REVIVE = { share: 1, radius: 320, iframes: 2 };

const KINDS = {
  phys: { name: 'Physical', pen: 'orange-pen' },
  magic: { name: 'Magic', pen: 'violet' },
  hybrid: { name: 'Hybrid', pen: 'green-ink' },
  pure: { name: 'Pure', pen: 'ink' }, // ignores armor and ward
  hero: { name: 'Hero', pen: 'green-ink' },
};

// Character stats. Each level-up adds one `step`. A `split` stat is upgraded apart for
// physical and magic weapons; the others belong to the hero. A hybrid weapon reads both
// sets of upgrades together, so a merge never throws a build away. `off` is what a weapon
// gets if it does not list the stat in `scales` (the base value unless given).
const STATS = {
  damage: { name: 'Damage', split: true, base: 1, step: 0.15, max: 8 },
  cooldown: { name: 'Cooldown', split: true, base: 0, step: 0.05, max: 0.6 },
  size: { name: 'Size', split: true, base: 1, step: 0.08, max: 3 },
  count: { name: 'Count', split: true, base: 0, step: 1, max: 5 },
  critChance: { name: 'Crit chance', split: true, base: 0.05, step: 0.04, max: 1, off: 0 },
  critDamage: { name: 'Crit damage', split: true, base: 1.5, step: 0.2, max: 6 },
  attack: { name: 'Attack', split: false, base: 1, step: 0.05, max: 6, note: 'All damage' },
  speed: { name: 'Speed', split: false, base: 1, step: 0.06, max: 2, note: 'Move speed' },
  xp: { name: 'XP', split: false, base: 1, step: 0.1, max: 4, note: 'Value of every orb' },
};

// Active skills: one is picked before the run and sits on the Space key.
const ACTIVES = [
  { id: 'flash', name: 'Flash', group: 'Mobility', cooldown: 40, distance: 190,
    blurb: 'Blink a short way in the direction you are walking.' },
  { id: 'ghost', name: 'Ghost', group: 'Mobility', cooldown: 120, duration: 5, speedBoost: 2,
    blurb: 'For 5 s nothing can hurt you, you walk straight through enemies and move twice as fast.' },
  { id: 'berserk', name: 'Berserk', group: 'Damage', cooldown: 60, duration: 30,
    buff: { damage: 1.3, size: 1.25, cooldown: 0.2, count: 1 },
    blurb: 'For 30 s: damage +30%, size +25%, cooldown -20%, count +1, on every weapon that uses them.' },
  { id: 'ignite', name: 'Ignite', group: 'Damage', cooldown: 120, duration: 8, radius: 270, tick: 0.5, share: 0.7,
    blurb: 'Sets the ground around you on fire for 8 s. Whatever burns the whole time loses 70% of its max health, as pure damage.' },
  { id: 'stash', name: 'Stash', group: 'Economy', cooldown: 240, distance: 110,
    blurb: 'Drops a chest nearby: pick 1 of 3 items, any rarity.' },
  { id: 'inspiration', name: 'Inspiration', group: 'Economy', cooldown: 100, share: 0.8,
    blurb: 'Instantly gain 80% of the XP this level needs.' },
];
const ACTIVE_GROUPS = ['Mobility', 'Damage', 'Economy'];
const BERSERK = ACTIVES.find(a => a.id === 'berserk');

// `scales` lists the stats a weapon reads: this list is what makes a build meta.
// Weapons marked `defense` cannot be the first pick, as they barely attack.
// For later: a `duration` mechanic, for weapons such as a flamethrower, a hurricane, a laser.
const WEAPONS = [
  { id: 'fireball', name: 'Fireball', tag: 'Fb', kind: 'magic', pen: 'red-pencil',
    scales: ['damage', 'cooldown', 'size', 'count', 'critChance', 'critDamage'],
    cooldown: 1.5, damage: 20, radius: 42, speed: 320, life: 1.8,
    blurb: 'Flies at the nearest enemy and explodes. Count adds fireballs.' },
  { id: 'aura', name: 'Aura', tag: 'Au', kind: 'magic', pen: 'violet',
    scales: ['damage', 'size'],
    tick: 0.5, damage: 6, radius: 90,
    blurb: 'Hurts everything close to you, all the time.' },
  { id: 'meteor', name: 'Meteor', tag: 'Me', kind: 'magic', pen: 'red-pencil',
    scales: ['cooldown', 'damage', 'size'],
    cooldown: 6, damage: 90, radius: 88, delay: 0.7, range: 420,
    crater: { life: 5, tick: 0.5, damage: 10, share: 0.8 },
    blurb: 'Long cooldown, huge hit. Leaves a crater that keeps burning.' },
  { id: 'chain', name: 'Chain Lightning', tag: 'Ch', kind: 'magic', pen: 'highlighter',
    scales: ['damage', 'critChance', 'cooldown'],
    cooldown: 2, damage: 24, range: 340, jumps: 4, jumpRange: 130, falloff: 0.85,
    blurb: 'Strikes an enemy, then jumps to the ones next to it.' },
  { id: 'icearrow', name: 'Ice Arrow', tag: 'Ic', kind: 'magic', pen: 'blue-pen',
    scales: ['cooldown', 'damage', 'size'],
    cooldown: 2.4, damage: 38, speed: 440, life: 1.3, width: 11, widthGrowth: 3, length: 26, slow: 0.45, slowTime: 2.5,
    blurb: 'Pierces the whole line and slows everything it touches. Size makes it much wider.' },
  { id: 'phase', name: 'Phase Dash', tag: 'Ph', kind: 'magic', pen: 'violet', defense: true,
    scales: ['cooldown', 'speed', 'damage'],
    cooldown: 14, duration: 1.6, damage: 10, tick: 0.25, radius: 72, moveBoost: 1.6,
    blurb: 'On cooldown you turn into a damaging ghost. A hit triggers it early and blocks that hit, but then the cooldown is doubled.' },

  { id: 'spear', name: 'Spear', tag: 'Sp', kind: 'phys', pen: 'orange-pen',
    scales: ['speed', 'damage', 'size', 'critChance', 'critDamage'],
    tick: 0.35, damage: 18, length: 130, width: 30, turn: 10, push: 70, pushTime: 0.16,
    blurb: 'An aura in the shape of a spear, always pointing where you walk. Its first touch knocks a target back. Speed makes it strike more often.' },
  { id: 'boomerang', name: 'Boomerang', tag: 'Bo', kind: 'phys', pen: 'orange-pen',
    scales: ['cooldown', 'damage', 'size', 'count'],
    cooldown: 2.4, damage: 16, speed: 340, range: 230, r: 14, spread: 0.45, returnBoost: 1.25,
    blurb: 'Cuts through enemies on the way out and again on the way back.' },
  { id: 'pistol', name: 'Pistol', tag: 'Pi', kind: 'phys', pen: 'ink',
    scales: ['damage', 'critChance', 'cooldown'],
    cooldown: 0.55, damage: 15, range: 420,
    blurb: 'One shot, one target, the nearest. No crowd control at all.' },
  { id: 'sword', name: 'Sword', tag: 'Sw', kind: 'phys', pen: 'orange-pen',
    scales: ['damage', 'cooldown', 'size', 'count', 'critChance', 'critDamage'],
    cooldown: 1.4, damage: 28, reach: 92, arc: 2.4, swingGap: 0.14,
    blurb: 'Swings right next to you. Count adds swings, every second one behind you.' },
  { id: 'shield', name: 'Shield', tag: 'Sh', kind: 'phys', pen: 'orange-pen', defense: true,
    scales: ['cooldown', 'damage'],
    cooldown: 16, charges: 2, damage: 30, radius: 84,
    blurb: 'Stores up to 2 charges. A charge blocks one hit and blasts everything nearby.' },
  { id: 'rocket', name: 'Rocket', tag: 'Ro', kind: 'phys', pen: 'orange-pen',
    scales: ['damage', 'cooldown', 'size', 'count', 'critChance', 'critDamage'],
    cooldown: 7, damage: 50, radius: 90, range: 520, speed: 220, accel: 700, turn: 8, life: 1.6, spread: 0.35,
    blurb: 'Long cooldown, big blast. Flies over the horde at the toughest enemy around. Count adds rockets.' },
  { id: 'drone', name: 'Drone', tag: 'Dr', kind: 'phys', pen: 'orange-pen',
    scales: ['damage', 'cooldown', 'size'],
    cooldown: 3.5, damage: 34, speed: 900, span: 620, r: 20,
    blurb: 'Crosses the map on a diagonal, right through you, and hits everything on its way. Size makes its path wider.' },
];

// Owning both `needs` replaces them with this weapon, which is a weapon like any other.
const SYNERGIES = [
  { id: 'electrogun', name: 'ElectroGun', tag: 'EG', kind: 'hybrid', pen: 'green-ink', needs: ['pistol', 'chain'],
    scales: ['damage', 'critChance', 'cooldown'],
    cooldown: 0.55, damage: 16, range: 420, jumps: 4, jumpRange: 140, falloff: 0.8,
    blurb: 'Every shot chains between targets and deals physical and magic damage at once.' },
  { id: 'iceboomerang', name: 'Ice Boomerang', tag: 'IB', kind: 'hybrid', pen: 'blue-pen', needs: ['boomerang', 'icearrow'],
    scales: ['cooldown', 'damage', 'size', 'count'],
    cooldown: 2.4, damage: 22, speed: 340, range: 345, r: 15, spread: 0.45, returnBoost: 1.25, slow: 0.4, slowTime: 2,
    blurb: 'Flies further and slows what survives. Physical going out, magic coming back.' },
  { id: 'fireshield', name: 'Fire Shield', tag: 'FS', kind: 'hybrid', pen: 'red-pencil', needs: ['shield', 'aura'],
    scales: ['cooldown', 'damage', 'size'],
    cooldown: 14, charges: 2, damage: 50, radius: 100, tick: 0.5, auraDamage: 8,
    blurb: 'A burning aura. Stores up to 2 charges: a charge blocks one hit and blasts the whole aura.' },
  { id: 'clusterrocket', name: 'Cluster Rocket', tag: 'CR', kind: 'hybrid', pen: 'red-pencil', needs: ['rocket', 'fireball'],
    scales: ['damage', 'cooldown', 'size', 'count', 'critChance', 'critDamage'],
    cooldown: 6, damage: 55, radius: 90, range: 520, speed: 220, accel: 700, turn: 8, life: 1.6, spread: 0.35,
    minis: 5, miniDamage: 20, miniRadius: 38, miniRange: 300, miniSpeed: 200, miniAccel: 900, miniTurn: 12, miniLife: 0.9,
    blurb: 'Right after its blast the rocket bursts into 5 small rockets, each after an enemy of its own. Count adds rockets.' },
  { id: 'meteordrone', name: 'Meteor Drone', tag: 'MD', kind: 'hybrid', pen: 'red-pencil', needs: ['drone', 'meteor'],
    scales: ['damage', 'cooldown', 'size'],
    cooldown: 6, damage: 90, passDamage: 34, speed: 700, span: 330, r: 22, radius: 88, delay: 0.7,
    crater: { life: 5, tick: 0.5, damage: 10, share: 0.8 },
    blurb: 'The drone calls down 3 meteors on its way: where it starts, on you in the middle, and where it ends.' },
  { id: 'radiantlance', name: 'Radiant Lance', tag: 'RL', kind: 'hybrid', pen: 'blue-pen', needs: ['spear', 'aura'],
    scales: ['speed', 'damage', 'size', 'critChance', 'critDamage'],
    tick: 0.35, damage: 12, long: 125, wide: 64, shift: 65, length: 122, turn: 10, push: 70, pushTime: 0.16,
    blurb: 'The Aura shifts toward the Spear: a long oval reaching far ahead of you. Its first touch knocks a target back. Speed makes it strike more often.' },
];
const WEAPON_DEFS = [...WEAPONS, ...SYNERGIES];

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

const RARITIES = {
  grey: { name: 'Common', pen: 'ink-muted' },
  blue: { name: 'Rare', pen: 'blue-pen' },
  purple: { name: 'Epic', pen: 'violet' },
  legendary: { name: 'Legendary', pen: 'highlighter' },
};

// A chest first rolls its own rarity by CHEST_ROLL (a Stash chest skips that), then each of
// its slots rolls an item rarity by `odds` and takes an item the hero does not have yet.
const CHEST_SLOTS = 3;
const CHEST_ROLL = { common: 60, rare: 30, legendary: 10 };
const CHESTS = {
  common: { name: 'Common chest', pen: 'ink-muted', odds: { grey: 65, blue: 25, purple: 10 } },
  rare: { name: 'Rare chest', pen: 'blue-pen', odds: { grey: 25, blue: 50, purple: 20, legendary: 5 } },
  legendary: { name: 'Legendary chest', pen: 'highlighter', odds: { purple: 75, legendary: 25 } },
  stash: { name: 'Stash', pen: 'green-ink', odds: { grey: 50, blue: 30, purple: 15, legendary: 5 } },
};

// To add an item, add a row. In `gives`, the keys of STATS add to that stat, for physical
// and magic weapons alike. The other keys: hp (share of max health), baseHp, baseAttack,
// regen (share of max health per second), magnet (share of pickup radius), pureShare (share
// of all damage that turns pure), hpToAttack (share of health that turns into base attack),
// lives, levels and weapons (right away), physDamage and magicDamage (on top of everything
// else; a hybrid hit gets half of each), activeCooldown (share cut from the active skill's
// cooldown), attackPerLevel (added to Attack for each level the hero has).
const ITEMS = [
  { id: 'vest', name: 'Leather Vest', rarity: 'grey', gives: { hp: 0.15 }, text: '+15% Health' },
  { id: 'boots', name: 'Light Boots', rarity: 'grey', gives: { speed: 0.2 }, text: '+20% Speed' },
  { id: 'quiver', name: 'Spare Quiver', rarity: 'grey', gives: { count: 1 }, text: '+1 Count' },
  { id: 'coin', name: 'Lucky Coin', rarity: 'grey', gives: { critChance: 0.1 }, text: '+10% Crit chance' },
  { id: 'whetstone', name: 'Whetstone', rarity: 'grey', gives: { critDamage: 0.3 }, text: '+30% Crit damage' },
  { id: 'knuckles', name: 'Iron Knuckles', rarity: 'grey', gives: { attack: 0.3 }, text: '+30% Attack' },

  { id: 'hide', name: 'Troll Hide', rarity: 'blue', gives: { hp: 0.15, regen: 0.02 }, text: '+15% Health, +2% Health regen per second' },
  { id: 'lens', name: 'Wide Lens', rarity: 'blue', gives: { size: 0.2, cooldown: 0.1 }, text: '+20% Size, -10% Cooldown' },
  { id: 'mark', name: "Hunter's Mark", rarity: 'blue', gives: { critChance: 0.1, critDamage: 0.3 }, text: '+10% Crit chance, +30% Crit damage' },
  { id: 'banner', name: 'War Banner', rarity: 'blue', gives: { attack: 0.3, count: 1 }, text: '+30% Attack, +1 Count' },

  { id: 'bracers', name: "Giant's Bracers", rarity: 'purple', gives: { baseAttack: 50 }, text: '+50 Base attack' },
  { id: 'tome', name: "Scholar's Tome", rarity: 'purple', gives: { xp: 0.5 }, text: '+50% XP' },
  { id: 'heart', name: 'Stone Heart', rarity: 'purple', gives: { baseHp: 300 }, text: '+300 Base health' },
  { id: 'lodestone', name: 'Lodestone', rarity: 'purple', gives: { magnet: 0.5 }, text: '+50% Pickup radius' },
  { id: 'lesson', name: "Mentor's Lesson", rarity: 'purple', gives: { levels: 3 }, text: '+3 levels right away' },
  { id: 'steel', name: 'Tempered Steel', rarity: 'purple', gives: { physDamage: 0.5 }, text: '+50% to all physical damage' },
  { id: 'focus', name: 'Arcane Focus', rarity: 'purple', gives: { magicDamage: 0.5 }, text: '+50% to all magic damage' },

  { id: 'edge', name: 'Void Edge', rarity: 'legendary', gives: { pureShare: 0.3 }, text: '30% of all damage becomes pure' },
  { id: 'pact', name: 'Blood Pact', rarity: 'legendary', gives: { hpToAttack: 0.5 }, text: '50% of your Health turns into Base attack' },
  { id: 'feather', name: 'Phoenix Feather', rarity: 'legendary', gives: { lives: 1 }, text: '+1 life. Dying brings you back at full health with a blast of pure damage' },
  { id: 'hourglass', name: 'Hourglass', rarity: 'legendary', gives: { activeCooldown: 0.5 }, text: '-50% Active skill cooldown' },
  { id: 'armory', name: 'Armory Key', rarity: 'legendary', gives: { weapons: 1 }, text: 'An extra weapon right away' },
  { id: 'medal', name: "Veteran's Medal", rarity: 'legendary', gives: { attackPerLevel: 0.05 }, text: '+5% damage for each level you have' },
];

// ---- State ----

const stageEl = document.getElementById('stage');
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const overlayEl = document.getElementById('overlay');
const panelEl = document.getElementById('panel');
const statusEl = document.getElementById('status');
const pauseBtn = document.getElementById('pause-btn');
const activeBtn = document.getElementById('active-btn');
const activeNameEl = document.getElementById('active-name');
const activeTimeEl = document.getElementById('active-time');

const FONT = '"Bahnschrift SemiCondensed", "Bahnschrift", "Arial Narrow", sans-serif';
const view = { w: 0, h: 0, cssW: 0, cssH: 0, scale: 1 };
const cam = { x: 0, y: 0 };
const keys = new Set();
const stick = { active: false, id: 0, ax: 0, ay: 0, x: 0, y: 0 };
const loadout = { active: ACTIVES[0], weapon: WEAPONS[0] };

let pal = {};
let dirty = true;
let phase = 'start'; // start | playing | choosing | paused | over
let seed = 1;
let frame = 0;
let lastTime = 0;
let lastCdShare = -1;
let cardActions = [];

let hero, enemies, shots, zones, orbs, redOrbs, chests, fx, numbers, timers, queue;
let upgrades, gear, items, activeDef, activeCd, berserkLeft;
let level, xp, xpNext, elapsed, kills, spawnBudget, nextElite, nextRing, wildOrbTimer, walked, toast, toastLeft;

function zeroPicks() {
  const picks = {};
  for (const key of Object.keys(STATS)) picks[key] = 0;
  return picks;
}

function resetWorld() {
  hero = {
    x: 0, y: 0, r: HERO.r, hp: HERO.hp, maxHp: HERO.hp, baseAttack: HERO.attack, lives: HERO.lives,
    faceX: 1, faceY: 0, iframes: 0, ghostLeft: 0, phaseLeft: 0, weapons: [],
  };
  enemies = [];
  shots = [];
  zones = [];
  orbs = [];
  redOrbs = [];
  chests = [];
  fx = [];
  numbers = [];
  timers = [];
  queue = [];
  upgrades = { phys: zeroPicks(), magic: zeroPicks(), hero: zeroPicks() };
  gear = {};
  items = [];
  activeDef = ACTIVES[0];
  activeCd = 0;
  berserkLeft = 0;
  level = 1;
  xp = 0;
  xpNext = xpNeeded(1);
  elapsed = 0;
  kills = 0;
  spawnBudget = 0;
  nextElite = 0;
  nextRing = 0;
  wildOrbTimer = WILD_ORB_EVERY;
  walked = 0;
  toast = '';
  toastLeft = 0;
  frame = 0;
  rebuildGrid();
}

function startRun(activeId, weaponId, runSeed = Date.now()) {
  seed = runSeed | 0;
  resetWorld();
  activeDef = ACTIVES.find(a => a.id === activeId);
  addWeapon(weaponId);
  saveJson(LAST_KEY, { active: activeId, weapon: weaponId });
  setText(activeNameEl, activeDef.name);
  activeBtn.title = activeDef.blurb;
  lastCdShare = -1;
  activeBtn.hidden = false;
  pauseBtn.hidden = false;
  phase = 'playing';
  hideOverlay();
  dirty = true;
}

function endRun() {
  phase = 'over';
  queue = [];
  activeBtn.hidden = true;
  pauseBtn.hidden = true;
  const best = loadJson(BEST_KEY);
  const isBest = !best || elapsed > best.time;
  if (isBest) saveJson(BEST_KEY, { time: elapsed, level });
  showBest();
  showEnd(isBest);
  dirty = true;
}

// ---- Small helpers ----

// Seeded (mulberry32) so a run can be replayed while balancing.
function rand() {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pickOne(list) { return list[Math.floor(rand() * list.length)]; }
function pickWeighted(mix) {
  const names = Object.keys(mix);
  let roll = rand() * names.reduce((sum, n) => sum + mix[n], 0);
  for (const n of names) {
    roll -= mix[n];
    if (roll < 0) return n;
  }
  return names[0];
}
function sweep(list) {
  let n = 0;
  for (let i = 0; i < list.length; i++) if (!list[i].dead) list[n++] = list[i];
  list.length = n;
}
function angleDiff(a, b) {
  const d = (a - b) % TAU;
  return d > Math.PI ? d - TAU : d < -Math.PI ? d + TAU : d;
}
function angleGap(a, b) { return Math.abs(angleDiff(a, b)); }
function turnToward(a, target, step) {
  const d = angleDiff(target, a);
  return Math.abs(d) <= step ? target : a + Math.sign(d) * step;
}
function formatTime(s) {
  const whole = Math.floor(s);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}
function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
function loadJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode etc. */ }
}
function say(text) {
  toast = text;
  toastLeft = 3;
}

// ---- Stats ----

function gearValue(key) { return gear[key] || 0; }

function stat(key, kind) {
  const def = STATS[key];
  let picks = upgrades.hero[key];
  if (def.split) picks = kind === 'hybrid' ? upgrades.phys[key] + upgrades.magic[key] : upgrades[kind][key];
  return Math.min(def.max, def.base + picks * def.step + gearValue(key));
}

// What a weapon really gets: stats it does not list stay neutral, whatever the hero has.
function weaponStat(w, key) {
  const def = STATS[key];
  if (!w.def.scales.includes(key)) return def.off !== undefined ? def.off : def.base;
  const value = stat(key, w.def.kind);
  const buff = berserkLeft > 0 ? BERSERK.buff[key] : undefined;
  if (buff === undefined) return value;
  return key === 'cooldown' || key === 'count' ? value + buff : value * buff;
}

// The Attack stat, plus what the hero's level adds to it past its cap.
function attackValue() { return stat('attack') + gearValue('attackPerLevel') * level; }

// What every weapon's listed damage is multiplied by, whatever its type.
function attackMult() { return hero.baseAttack / HERO.attack * attackValue(); }

// Items that favor one damage type, on top of everything else.
function kindBonus(kind) {
  if (kind === 'phys') return 1 + gearValue('physDamage');
  if (kind === 'magic') return 1 + gearValue('magicDamage');
  if (kind === 'hybrid') return 1 + (gearValue('physDamage') + gearValue('magicDamage')) / 2;
  return 1;
}

function magnetRadius() { return HERO.magnet * (1 + gearValue('magnet')); }

function activeCooldown() { return activeDef.cooldown * (1 - gearValue('activeCooldown')); }

// Max health and base attack both depend on items, as Blood Pact moves one into the other.
// Health gained comes filled in; health lost only cuts what no longer fits.
function refreshHero() {
  const total = (HERO.hp + gearValue('baseHp')) * (1 + gearValue('hp'));
  const moved = total * gearValue('hpToAttack');
  const before = hero.maxHp;
  hero.maxHp = Math.round(total - moved);
  hero.baseAttack = HERO.attack + gearValue('baseAttack') + moved;
  hero.hp = Math.min(hero.maxHp, hero.hp + Math.max(0, hero.maxHp - before));
}

function takeItem(item) {
  items.push(item);
  for (const key of Object.keys(item.gives)) gear[key] = gearValue(key) + item.gives[key];
  hero.lives += item.gives.lives || 0;
  for (let i = 0; i < (item.gives.levels || 0); i++) addLevel();
  for (let i = 0; i < (item.gives.weapons || 0); i++) queue.push('weapon');
  activeCd = Math.min(activeCd, activeCooldown());
  refreshHero();
}

function cooldownOf(w) {
  const cut = Math.min(COOLDOWN_CAP, weaponStat(w, 'cooldown'));
  return w.def.cooldown * (1 - cut);
}

function setCooldown(w, seconds) {
  w.timer = seconds;
  w.full = seconds;
}

function formatStat(key, value) {
  if (key === 'count') return value ? `+${value}` : '0';
  if (key === 'cooldown') return value ? `-${Math.round(value * 100)}%` : '0%';
  return `${Math.round(value * 100)}%`;
}

function stepText(key) {
  const step = STATS[key].step;
  if (key === 'count') return `+${step}`;
  return `${key === 'cooldown' ? '-' : '+'}${Math.round(step * 100)}%`;
}

function owned(id) { return hero.weapons.find(w => w.def.id === id); }
function chargedWeapon() { return hero.weapons.find(w => w.def.charges); }

function newWeapon(id) {
  const def = WEAPON_DEFS.find(d => d.id === id);
  const w = { def, timer: 0.3, full: 1, dealt: 0, pulse: 0.3 };
  if (def.charges) {
    w.charges = 1;
    setCooldown(w, cooldownOf(w));
  }
  if (id === 'phase') {
    w.locked = false;
    setCooldown(w, cooldownOf(w));
  }
  if (id === 'spear' || id === 'radiantlance') {
    w.angle = Math.atan2(hero.faceY, hero.faceX);
    w.thrust = 0;
  }
  return w;
}

function addWeapon(id) {
  hero.weapons.push(newWeapon(id));
  const merge = SYNERGIES.find(s => s.needs.every(owned));
  if (!merge) return;
  const parts = merge.needs.map(owned);
  const w = newWeapon(merge.id);
  for (const part of parts) {
    w.dealt += part.dealt;
    if (part.charges !== undefined) w.charges = part.charges;
  }
  hero.weapons = hero.weapons.filter(o => !parts.includes(o));
  hero.weapons.push(w);
  say(`Synergy: ${merge.name}!`);
}

// ---- Enemy lookup ----

// A spatial hash that wraps around: enemies never stray far enough from the hero to collide.
const GRID_CELL = 48;
const grid = Array.from({ length: 4096 }, () => []);
const usedCells = [];

function gridIndex(cx, cy) { return ((cy & 63) << 6) | (cx & 63); }

function rebuildGrid() {
  for (const i of usedCells) grid[i].length = 0;
  usedCells.length = 0;
  for (const e of enemies) {
    const i = gridIndex(Math.floor(e.x / GRID_CELL), Math.floor(e.y / GRID_CELL));
    if (grid[i].length === 0) usedCells.push(i);
    grid[i].push(e);
  }
}

function eachEnemyNear(x, y, r, fn) {
  const reach = r + MAX_ENEMY_R;
  const x0 = Math.floor((x - reach) / GRID_CELL);
  const x1 = Math.floor((x + reach) / GRID_CELL);
  const y0 = Math.floor((y - reach) / GRID_CELL);
  const y1 = Math.floor((y + reach) / GRID_CELL);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const cell = grid[gridIndex(cx, cy)];
      for (let i = 0; i < cell.length; i++) {
        const e = cell[i];
        if (e.dead) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        const rr = r + e.r;
        if (dx * dx + dy * dy < rr * rr) fn(e);
      }
    }
  }
}

// Everything touching a straight lance that starts at (x, y) and points along `a`.
function eachEnemyOnLance(x, y, a, length, halfWidth, fn) {
  const cx = Math.cos(a);
  const cy = Math.sin(a);
  eachEnemyNear(x + cx * length / 2, y + cy * length / 2, length / 2 + halfWidth, e => {
    const dx = e.x - x;
    const dy = e.y - y;
    const along = dx * cx + dy * cy;
    const side = Math.abs(dy * cx - dx * cy);
    if (along > -e.r && along < length + e.r && side < halfWidth + e.r) fn(e);
  });
}

// Everything touching an oval centered on (x, y), `long` along the angle `a` and `wide` across.
function eachEnemyInOval(x, y, a, long, wide, fn) {
  const cx = Math.cos(a);
  const cy = Math.sin(a);
  eachEnemyNear(x, y, long, e => {
    const dx = e.x - x;
    const dy = e.y - y;
    const along = (dx * cx + dy * cy) / (long + e.r);
    const side = (dy * cx - dx * cy) / (wide + e.r);
    if (along * along + side * side < 1) fn(e);
  });
}

function nearestEnemies(x, y, range, n, skip) {
  const found = [];
  const limit = range * range;
  for (const e of enemies) {
    if (e.dead || (skip && skip.has(e))) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > limit) continue;
    found.push({ e, d2 });
  }
  found.sort((a, b) => a.d2 - b.d2);
  return found.slice(0, n).map(f => f.e);
}

// The toughest kind of enemy in range first, and of those the closest.
function toughestEnemies(x, y, range, n) {
  return nearestEnemies(x, y, range, MAX_ENEMIES).sort((a, b) => b.def.hp - a.def.hp).slice(0, n);
}

// ---- Damage ----

function armorFactor(e, kind) {
  if (kind === 'phys') return 1 - e.def.armor;
  if (kind === 'magic') return 1 - e.def.ward;
  if (kind === 'hybrid') return 1 - (e.def.armor + e.def.ward) / 2;
  return 1; // pure damage ignores both
}

// One hit from a weapon: base damage, then stats, crit, and the enemy's armor. `kind` only
// says which armor it meets: the upgrades it uses are always those of the weapon itself.
function hit(e, w, base, kind = w.def.kind) {
  if (e.dead) return;
  const crit = rand() < weaponStat(w, 'critChance');
  let amount = base * weaponStat(w, 'damage') * attackMult() * kindBonus(kind);
  if (crit) amount *= weaponStat(w, 'critDamage');
  hurtEnemy(e, amount, kind, crit, w);
}

function hurtEnemy(e, amount, kind, crit, w) {
  const armor = armorFactor(e, kind);
  const factor = armor + (1 - armor) * gearValue('pureShare');
  const dealt = amount * factor;
  e.hp -= dealt;
  e.flash = 0.08;
  if (w) w.dealt += dealt;
  addNumber(e, dealt, kind, crit, factor);
  if (e.hp <= 0 && !e.dead) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  kills++;
  dropOrb(e.x, e.y, e.def.xp);
  if (!e.def.elite) return;
  chests.push({ x: e.x, y: e.y, type: pickWeighted(CHEST_ROLL), dead: false });
  for (let i = 0; i < RED_ORB.eliteDrop; i++) {
    const a = rand() * TAU;
    dropRedOrb(e.x + Math.cos(a) * 34, e.y + Math.sin(a) * 34);
  }
}

function slow(e, by, seconds) {
  e.slowBy = e.def.elite ? by / 2 : by;
  e.slowLeft = Math.max(e.slowLeft, seconds);
}

// Elites stand their ground.
function knockBack(e, a, distance, seconds) {
  if (e.def.elite) return;
  e.pushLeft = seconds;
  e.pushX = Math.cos(a) * distance / seconds;
  e.pushY = Math.sin(a) * distance / seconds;
}

function explode(x, y, r, w, base) {
  eachEnemyNear(x, y, r, e => hit(e, w, base));
  addFx({ type: 'ring', x, y, r, life: 0.3, pen: KINDS[w.def.kind].pen });
}

function strikeChain(first, w) {
  const d = w.def;
  const struck = new Set([first]);
  const points = [{ x: hero.x, y: hero.y }, { x: first.x, y: first.y }];
  let from = first;
  let amount = d.damage;
  hit(first, w, amount);
  for (let i = 0; i < d.jumps; i++) {
    const next = nearestEnemies(from.x, from.y, d.jumpRange, 1, struck)[0];
    if (!next) break;
    amount *= d.falloff;
    hit(next, w, amount);
    struck.add(next);
    points.push({ x: next.x, y: next.y });
    from = next;
  }
  addFx({ type: 'bolt', points: jagged(points), life: 0.16, pen: d.pen });
}

function jagged(points) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    out.push({
      x: (a.x + b.x) / 2 + (rand() - 0.5) * 22,
      y: (a.y + b.y) / 2 + (rand() - 0.5) * 22,
    }, b);
  }
  return out;
}

// ---- Weapons: attacks that fire on a cooldown ----

function launch(o) {
  shots.push(Object.assign({
    x: hero.x, y: hero.y, vx: Math.cos(o.a) * o.speed, vy: Math.sin(o.a) * o.speed,
    hits: new Set(), pierce: 1, dead: false,
  }, o));
}

function aimAt(target) { return Math.atan2(target.y - hero.y, target.x - hero.x); }

function moveBoomerang(s, dt) {
  s.spin += 14 * dt;
  if (!s.back) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.flown += s.speed * dt;
    if (s.flown >= s.range) {
      s.back = true;
      s.hits.clear(); // everything can be hit again on the way back
    }
    return;
  }
  const dx = hero.x - s.x;
  const dy = hero.y - s.y;
  const d = Math.hypot(dx, dy) || 1;
  if (d < 18) {
    s.dead = true;
    return;
  }
  const pace = s.speed * s.returnBoost;
  s.x += dx / d * pace * dt;
  s.y += dy / d * pace * dt;
}

function throwBoomerangs(w, onHit) {
  const d = w.def;
  const target = nearestEnemies(hero.x, hero.y, AIM_RANGE, 1)[0];
  if (!target) return false;
  const n = 1 + weaponStat(w, 'count');
  const aim = aimAt(target);
  for (let i = 0; i < n; i++) {
    launch({
      look: 'boomerang', pen: d.pen, a: aim + (i - (n - 1) / 2) * d.spread,
      speed: d.speed, r: d.r * weaponStat(w, 'size'), life: Infinity, pierce: Infinity,
      range: d.range, returnBoost: d.returnBoost, flown: 0, back: false, spin: 0, move: moveBoomerang, onHit,
    });
  }
  return true;
}

function swing(w, angle, reach) {
  const half = w.def.arc / 2;
  eachEnemyNear(hero.x, hero.y, reach, e => {
    if (angleGap(aimAt(e), angle) <= half) hit(e, w, w.def.damage);
  });
  addFx({ type: 'swing', a: angle, span: w.def.arc, r: reach, life: 0.16, pen: w.def.pen });
}

function fallMeteor(w, x, y) {
  const d = w.def;
  const radius = d.radius * weaponStat(w, 'size');
  addFx({ type: 'telegraph', x, y, r: radius, life: d.delay, pen: d.pen });
  later(d.delay, () => {
    explode(x, y, radius, w, d.damage);
    addZone({
      look: 'crater', x, y, r: radius * d.crater.share, life: d.crater.life,
      tick: d.crater.tick, timer: d.crater.tick,
      apply: e => hit(e, w, d.crater.damage),
    });
  });
}

const NO_TARGET = { dead: true }; // a rocket with nothing to chase just flies on

function moveRocket(s, dt) {
  s.life -= dt;
  if (!s.target.dead) s.a = turnToward(s.a, Math.atan2(s.target.y - s.y, s.target.x - s.x), s.turn * dt);
  s.speed += s.accel * dt;
  s.x += Math.cos(s.a) * s.speed * dt;
  s.y += Math.sin(s.a) * s.speed * dt;
}

// A rocket flies over the horde to its target. Only once that is gone can anything set it off.
function launchRocket(o, blast) {
  launch(Object.assign({
    look: 'rocket', pierce: Infinity, move: moveRocket, onEnd: blast,
    onHit: (s, e) => {
      if (e !== s.target && !s.target.dead) return;
      s.dead = true;
      blast(s);
    },
  }, o));
}

function fireRockets(w, blast) {
  const d = w.def;
  const n = 1 + weaponStat(w, 'count');
  const targets = toughestEnemies(hero.x, hero.y, d.range, n);
  if (!targets.length) return false;
  for (let i = 0; i < n; i++) {
    const target = targets[i % targets.length];
    launchRocket({
      pen: d.pen, r: 8, a: aimAt(target) + (i - (n - 1) / 2) * d.spread,
      speed: d.speed, accel: d.accel, turn: d.turn, life: d.life, target,
    }, blast);
  }
  return true;
}

// The small rockets leave a blast in all directions, each after an enemy of its own.
function burstRocket(w, x, y, size) {
  const d = w.def;
  const targets = nearestEnemies(x, y, d.miniRange, d.minis);
  const blast = s => explode(s.x, s.y, d.miniRadius * size, w, d.miniDamage);
  for (let i = 0; i < d.minis; i++) {
    launchRocket({
      x, y, pen: d.pen, r: 5, a: i / d.minis * TAU,
      speed: d.miniSpeed, accel: d.miniAccel, turn: d.miniTurn, life: d.miniLife,
      target: targets.length ? targets[i % targets.length] : NO_TARGET,
    }, blast);
  }
}

// Moves relative to the hero, so on screen it is a straight line right through the middle.
function moveDrone(s, dt) {
  s.offset += s.speed * dt;
  s.spin += 18 * dt;
  s.x = hero.x + Math.cos(s.a) * s.offset;
  s.y = hero.y + Math.sin(s.a) * s.offset;
  if (s.onDrop && s.offset >= s.nextDrop) {
    s.onDrop(s);
    s.nextDrop += s.span;
  }
  if (s.offset >= s.span) s.dead = true;
}

// Each pass takes the next of the four diagonals.
function launchDrone(w, damage, extra) {
  const d = w.def;
  if (!nearestEnemies(hero.x, hero.y, d.span, 1).length) return false;
  w.passes = (w.passes || 0) + 1;
  const a = TAU / 8 + w.passes * TAU / 4;
  launch(Object.assign({
    look: 'drone', pen: d.pen, a, speed: d.speed, r: d.r * weaponStat(w, 'size'), life: Infinity, pierce: Infinity,
    x: hero.x - Math.cos(a) * d.span, y: hero.y - Math.sin(a) * d.span,
    offset: -d.span, span: d.span, spin: 0, move: moveDrone,
    onHit: (s, e) => hit(e, w, damage),
  }, extra));
  return true;
}

// Each returns false when there is nothing to fire at, so the weapon stays ready.
const FIRE = {
  fireball(w) {
    const d = w.def;
    const n = 1 + weaponStat(w, 'count');
    const targets = nearestEnemies(hero.x, hero.y, AIM_RANGE, n);
    if (!targets.length) return false;
    const radius = d.radius * weaponStat(w, 'size');
    const blast = s => explode(s.x, s.y, radius, w, d.damage);
    for (let i = 0; i < n; i++) {
      const fan = i < targets.length ? 0 : (i - targets.length + 1) * 0.3;
      launch({
        look: 'ball', pen: d.pen, a: aimAt(targets[i % targets.length]) + fan,
        speed: d.speed, r: 7, life: d.life, onHit: blast, onEnd: blast,
      });
    }
    return true;
  },

  meteor(w) {
    const d = w.def;
    const inRange = nearestEnemies(hero.x, hero.y, d.range, MAX_ENEMIES);
    if (!inRange.length) return false;
    const { x, y } = pickOne(inRange);
    fallMeteor(w, x, y);
    return true;
  },

  rocket(w) {
    const d = w.def;
    const radius = d.radius * weaponStat(w, 'size');
    return fireRockets(w, s => explode(s.x, s.y, radius, w, d.damage));
  },

  clusterrocket(w) {
    const d = w.def;
    const size = weaponStat(w, 'size');
    return fireRockets(w, s => {
      explode(s.x, s.y, d.radius * size, w, d.damage);
      burstRocket(w, s.x, s.y, size);
    });
  },

  drone(w) {
    return launchDrone(w, w.def.damage);
  },

  meteordrone(w) {
    const d = w.def;
    return launchDrone(w, d.passDamage, { nextDrop: -d.span, onDrop: s => fallMeteor(w, s.x, s.y) });
  },

  chain(w) {
    const first = nearestEnemies(hero.x, hero.y, w.def.range, 1)[0];
    if (!first) return false;
    strikeChain(first, w);
    return true;
  },

  electrogun(w) {
    const first = nearestEnemies(hero.x, hero.y, w.def.range, 1)[0];
    if (!first) return false;
    strikeChain(first, w);
    return true;
  },

  icearrow(w) {
    const d = w.def;
    const target = nearestEnemies(hero.x, hero.y, AIM_RANGE, 1)[0];
    if (!target) return false;
    const size = weaponStat(w, 'size');
    launch({
      look: 'arrow', pen: d.pen, a: aimAt(target), speed: d.speed, r: d.width * (1 + (size - 1) * d.widthGrowth),
      life: d.life, pierce: Infinity, len: d.length * size,
      onHit: (s, e) => {
        hit(e, w, d.damage);
        slow(e, d.slow, d.slowTime);
      },
    });
    return true;
  },

  boomerang(w) {
    return throwBoomerangs(w, (s, e) => hit(e, w, w.def.damage));
  },

  iceboomerang(w) {
    const d = w.def;
    return throwBoomerangs(w, (s, e) => {
      hit(e, w, d.damage, s.back ? 'magic' : 'phys');
      slow(e, d.slow, d.slowTime);
    });
  },

  pistol(w) {
    const d = w.def;
    const target = nearestEnemies(hero.x, hero.y, d.range, 1)[0];
    if (!target) return false;
    addFx({ type: 'tracer', x: target.x, y: target.y, x0: hero.x, y0: hero.y, life: 0.08, pen: d.pen });
    hit(target, w, d.damage);
    return true;
  },

  sword(w) {
    const d = w.def;
    const reach = d.reach * weaponStat(w, 'size');
    const target = nearestEnemies(hero.x, hero.y, reach * 1.3, 1)[0];
    if (!target) return false;
    const aim = aimAt(target);
    const n = 1 + weaponStat(w, 'count');
    for (let i = 0; i < n; i++) later(i * d.swingGap, () => swing(w, aim + i * Math.PI, reach));
    return true;
  },
};

// ---- Weapons: always-on ones ----

function auraRadius(w) { return w.def.radius * weaponStat(w, 'size'); }

function pulseAura(w, dt, damage) {
  w.pulse -= dt;
  if (w.pulse > 0) return;
  w.pulse += w.def.tick;
  eachEnemyNear(hero.x, hero.y, auraRadius(w), e => hit(e, w, damage));
}

function rechargeShield(w, dt) {
  if (w.charges >= w.def.charges) return;
  w.timer -= dt;
  if (w.timer > 0) return;
  w.charges++;
  setCooldown(w, cooldownOf(w));
}

function startPhase(w, early) {
  hero.phaseLeft = w.def.duration;
  w.pulse = 0;
  setCooldown(w, cooldownOf(w) * (early ? 2 : 1));
  w.locked = early;
}

// A spear or a lance follows the way the hero walks and stays put when the hero stands still.
// `touching` finds what it reaches. Only the first touch knocks a target back.
function strikeLance(w, dt, touching) {
  const d = w.def;
  w.angle = turnToward(w.angle, Math.atan2(hero.faceY, hero.faceX), d.turn * dt);
  w.thrust = Math.max(0, w.thrust - dt * 7);
  w.pulse -= dt;
  if (w.pulse > 0) return;
  w.pulse += d.tick / weaponStat(w, 'speed');
  w.thrust = 1;
  touching(e => {
    hit(e, w, d.damage);
    if (e.speared) return;
    e.speared = true;
    knockBack(e, w.angle, d.push, d.pushTime);
  });
}

// The oval sits ahead of the hero, who stays inside it near the back end.
function lanceOval(w) {
  const d = w.def;
  const size = weaponStat(w, 'size');
  return {
    x: hero.x + Math.cos(w.angle) * d.shift * size,
    y: hero.y + Math.sin(w.angle) * d.shift * size,
    long: d.long * size,
    wide: d.wide * size,
  };
}

const TICK = {
  aura(w, dt) {
    pulseAura(w, dt, w.def.damage);
  },

  shield(w, dt) {
    rechargeShield(w, dt);
  },

  fireshield(w, dt) {
    rechargeShield(w, dt);
    pulseAura(w, dt, w.def.auraDamage);
  },

  spear(w, dt) {
    const size = weaponStat(w, 'size');
    strikeLance(w, dt, fn => eachEnemyOnLance(hero.x, hero.y, w.angle, w.def.length * size, w.def.width * size / 2, fn));
  },

  radiantlance(w, dt) {
    strikeLance(w, dt, fn => {
      const { x, y, long, wide } = lanceOval(w);
      eachEnemyInOval(x, y, w.angle, long, wide, fn);
    });
  },

  phase(w, dt) {
    if (hero.phaseLeft > 0) {
      hero.phaseLeft -= dt;
      w.pulse -= dt;
      if (w.pulse <= 0) {
        w.pulse += w.def.tick;
        eachEnemyNear(hero.x, hero.y, w.def.radius, e => hit(e, w, w.def.damage));
      }
      return;
    }
    w.timer -= dt;
    if (w.timer <= 0) startPhase(w, false);
  },
};

function updateWeapons(dt) {
  for (const w of hero.weapons) {
    const tick = TICK[w.def.id];
    if (tick) {
      tick(w, dt);
      continue;
    }
    w.timer -= dt;
    if (w.timer > 0) continue;
    if (FIRE[w.def.id](w)) setCooldown(w, cooldownOf(w));
    else w.timer = 0;
  }
}

// ---- Active skills ----

const CAST = {
  flash(def) {
    const x0 = hero.x;
    const y0 = hero.y;
    hero.x += hero.faceX * def.distance;
    hero.y += hero.faceY * def.distance;
    hero.iframes = Math.max(hero.iframes, 0.2);
    addFx({ type: 'tracer', x0, y0, x: hero.x, y: hero.y, life: 0.25, pen: 'highlighter' });
  },
  ghost(def) {
    hero.ghostLeft = def.duration;
  },
  berserk(def) {
    berserkLeft = def.duration;
  },
  ignite(def) {
    const perTick = def.share * def.tick / def.duration;
    addZone({
      look: 'fire', x: hero.x, y: hero.y, r: def.radius, life: def.duration, tick: def.tick, timer: 0,
      apply: e => hurtEnemy(e, e.maxHp * perTick, 'pure', false, null),
    });
  },
  stash(def) {
    const a = rand() * TAU;
    chests.push({ x: hero.x + Math.cos(a) * def.distance, y: hero.y + Math.sin(a) * def.distance, type: 'stash', dead: false });
    say('A chest appeared nearby');
  },
  inspiration(def) {
    gainXp(xpNext * def.share);
    say('Inspired!');
  },
};

function useActive() {
  if (phase !== 'playing' || activeCd > 0) return;
  CAST[activeDef.id](activeDef);
  activeCd = activeCooldown();
  dirty = true;
}

// ---- Levels, orbs and chests ----

function xpNeeded(lv) { return Math.round(XP_BASE + XP_PER_LEVEL * lv); }

function addLevel() {
  level++;
  xpNext = xpNeeded(level);
  queue.push(WEAPON_LEVELS.includes(level) ? 'weapon' : 'stat');
}

function gainXp(amount) {
  xp += amount;
  while (xp >= xpNext) {
    xp -= xpNext;
    addLevel();
  }
  if (phase === 'playing' && queue.length) nextChoice();
}

function dropOrb(x, y, value) {
  if (orbs.length >= MAX_ORBS) {
    pickOne(orbs).value += value;
    return;
  }
  orbs.push({ x, y, value, pulled: false, dead: false });
}

// When the map is full, the red orb furthest from the hero moves here.
function dropRedOrb(x, y) {
  if (redOrbs.length < RED_ORB.max) {
    redOrbs.push({ x, y, pulled: false, dead: false });
    return;
  }
  const away = o => Math.hypot(o.x - hero.x, o.y - hero.y);
  const far = redOrbs.reduce((a, b) => (away(b) > away(a) ? b : a));
  far.x = x;
  far.y = y;
  far.pulled = false;
}

// Walking turns up red orbs somewhere ahead, off the way the hero is heading.
function walkFor(distance) {
  walked += distance;
  if (walked < RED_ORB.every) return;
  walked -= RED_ORB.every;
  const a = Math.atan2(hero.faceY, hero.faceX) + (rand() - 0.5) * 1.6;
  const d = 240 + rand() * 200;
  dropRedOrb(hero.x + Math.cos(a) * d, hero.y + Math.sin(a) * d);
}

// Moves an orb toward the hero once it is in reach. True when it touches the hero.
function pullOrb(o, dt) {
  const dx = hero.x - o.x;
  const dy = hero.y - o.y;
  const d = Math.hypot(dx, dy) || 1;
  if (d < HERO.r + 6) return true;
  if (o.pulled || d < magnetRadius()) {
    o.pulled = true;
    o.x += dx / d * ORB_PULL_SPEED * dt;
    o.y += dy / d * ORB_PULL_SPEED * dt;
  }
  return false;
}

function updateOrbs(dt) {
  for (const o of orbs) {
    if (!pullOrb(o, dt)) continue;
    o.dead = true;
    gainXp(o.value * stat('xp'));
  }
  sweep(orbs);
}

function heal(amount) {
  const healed = Math.min(amount, hero.maxHp - hero.hp);
  hero.hp += healed;
  floatText(hero.x, hero.y - hero.r - 6, `+${Math.round(healed)}`, 'green-ink', 15);
}

// At full health red orbs stay on the map for later.
function updateRedOrbs(dt) {
  for (const o of redOrbs) {
    if (hero.hp >= hero.maxHp) break;
    if (!pullOrb(o, dt)) continue;
    o.dead = true;
    heal(hero.maxHp * RED_ORB.heal);
  }
  sweep(redOrbs);
}

function updateChests() {
  for (const c of chests) {
    if (Math.hypot(hero.x - c.x, hero.y - c.y) < HERO.r + 14) {
      c.dead = true;
      enqueueChoice(c.type);
    }
  }
  sweep(chests);
}

// ---- Choices: level-ups, new weapons, chests ----

// `kind` is 'stat', 'weapon', or one of the CHESTS.
function enqueueChoice(kind) {
  queue.push(kind);
  if (phase === 'playing') nextChoice();
}

function nextChoice() {
  while (queue.length) {
    const kind = queue.shift();
    const chest = CHESTS[kind];
    if (chest) {
      const found = rollItems(chest);
      if (found.length) {
        phase = 'choosing';
        showCards(chest.name, 'Pick one. Every item is one of a kind.', found.map(itemCard));
        return;
      }
      addLevel(); // nothing left to find
      say('Every item found: +1 level');
      continue;
    }
    let cards = kind === 'weapon' ? weaponCards() : [];
    const isWeapon = cards.length > 0;
    if (!isWeapon) cards = statCards();
    if (!cards.length) continue;
    phase = 'choosing';
    if (isWeapon) showCards(`Level ${level}: new weapon`, 'Pick one to add to your kit.', cards);
    else showCards(`Level ${level}`, 'Pick one upgrade.', cards);
    return;
  }
  phase = 'playing';
  hideOverlay();
  dirty = true;
}

function chooseCard(i) {
  const pick = cardActions[i];
  if (!pick || phase !== 'choosing') return;
  pick();
  nextChoice();
}

// One physical and one magic card when the kit has both, so the split is always a real
// choice. Stats that no owned weapon reads are never offered.
function statCards() {
  const groups = { phys: [], magic: [], hero: [] };
  const defs = hero.weapons.map(w => w.def);
  for (const key of Object.keys(STATS)) {
    const def = STATS[key];
    if (def.split) {
      for (const kind of ['phys', 'magic']) {
        const users = defs.filter(d => (d.kind === kind || d.kind === 'hybrid') && d.scales.includes(key)).map(d => d.name);
        if (users.length && stat(key, kind) < def.max) groups[kind].push({ kind, key, users });
      }
    } else if (stat(key, 'hero') < def.max) {
      const users = defs.filter(d => d.scales.includes(key)).map(d => d.name);
      groups.hero.push({ kind: 'hero', key, users: [def.note, ...users] });
    }
  }
  const chosen = [];
  const take = list => {
    const rest = list.filter(o => !chosen.includes(o));
    if (rest.length) chosen.push(pickOne(rest));
  };
  take(groups.phys);
  take(groups.magic);
  if (chosen.length === 1) take(groups.phys.length ? groups.phys : groups.magic);
  take(groups.hero);
  const all = [...groups.phys, ...groups.magic, ...groups.hero];
  while (chosen.length < 3 && chosen.length < all.length) take(all);
  return chosen.map(o => {
    const now = stat(o.key, o.kind);
    const next = Math.min(STATS[o.key].max, now + STATS[o.key].step);
    return {
      kind: o.kind,
      tag: KINDS[o.kind].name,
      name: STATS[o.key].name,
      value: stepText(o.key),
      note: `${formatStat(o.key, now)} to ${formatStat(o.key, next)} · ${o.users.join(', ')}`,
      pick: () => { upgrades[o.kind][o.key]++; },
    };
  });
}

function synergyPartner(id) {
  return SYNERGIES.find(s => s.needs.includes(id) && s.needs.some(n => n !== id && owned(n)));
}

// A weapon that went into a merge is gone from the pool too.
function weaponCards() {
  const merged = SYNERGIES.filter(s => owned(s.id)).flatMap(s => s.needs);
  const free = WEAPONS.filter(d => !owned(d.id) && !merged.includes(d.id));
  const chosen = [];
  const partners = free.filter(d => synergyPartner(d.id));
  if (partners.length) chosen.push(pickOne(partners));
  while (chosen.length < 4 && chosen.length < free.length) {
    const d = pickOne(free);
    if (!chosen.includes(d)) chosen.push(d);
  }
  return chosen.map(d => {
    const s = synergyPartner(d.id);
    const partner = s && WEAPONS.find(o => s.needs.includes(o.id) && o !== d);
    return {
      kind: d.kind,
      tag: KINDS[d.kind].name,
      name: d.name,
      value: '',
      note: `${d.blurb} Uses: ${d.scales.map(k => STATS[k].name).join(', ')}.`,
      synergy: s ? `Merges with ${partner.name} into ${s.name}: ${s.blurb}` : '',
      pick: () => addWeapon(d.id),
    };
  });
}

// Rarities that have run out don't count. Once nothing of what the chest can hold is left,
// any item will do.
function rollItems(chest) {
  const found = [];
  for (let slot = 0; slot < CHEST_SLOTS; slot++) {
    const left = ITEMS.filter(item => !items.includes(item) && !found.includes(item));
    if (!left.length) break;
    const odds = {};
    for (const item of left) if (chest.odds[item.rarity]) odds[item.rarity] = chest.odds[item.rarity];
    const rarity = Object.keys(odds).length ? pickWeighted(odds) : pickOne(left).rarity;
    found.push(pickOne(left.filter(item => item.rarity === rarity)));
  }
  return found;
}

function itemCard(item) {
  return {
    kind: item.rarity,
    tag: RARITIES[item.rarity].name,
    name: item.name,
    value: '',
    note: item.text,
    pick: () => takeItem(item),
  };
}

// ---- Simulation ----

function later(seconds, fn) { timers.push({ left: seconds, fn, dead: false }); }

function healthGrowth() {
  const minutes = elapsed / 60;
  const wall = Math.max(0, minutes - HP_WALL.from) / HP_WALL.doubling;
  return (1 + HP_PER_MINUTE * minutes + HP_ACCEL * minutes * minutes) * 2 ** wall;
}

function ringEntry(i) {
  if (i < RINGS.length) return RINGS[i];
  const loop = i - RINGS.length;
  const at = RINGS[RINGS.length - 1].at + (loop + 1) * RING_LOOP.every;
  return Object.assign({ at }, RING_LOOP.rings[loop % RING_LOOP.rings.length]);
}

function addEnemy(type, a = rand() * TAU) {
  // At the cap the oldest ordinary enemy gives way: a crowd the hero simply walked away
  // from must not stop newer, faster enemies from arriving.
  if (enemies.length >= MAX_ENEMIES) {
    const oldest = enemies.findIndex(e => !e.def.elite);
    if (oldest >= 0) enemies.splice(oldest, 1);
  }
  const def = ENEMIES[type];
  const ring = Math.hypot(view.w, view.h) / 2 + def.r + 20;
  const hp = def.hp * healthGrowth();
  enemies.push({
    def, x: hero.x + Math.cos(a) * ring, y: hero.y + Math.sin(a) * ring, r: def.r,
    hp, maxHp: hp, slowLeft: 0, slowBy: 0, flash: 0, pushLeft: 0, pushX: 0, pushY: 0, speared: false, dead: false,
  });
}

function spawnEnemies(dt) {
  let wave = WAVES[0];
  for (const w of WAVES) if (elapsed >= w.at) wave = w;
  spawnBudget += wave.rate * dt;
  while (spawnBudget >= 1) {
    spawnBudget -= 1;
    addEnemy(pickWeighted(wave.mix));
  }
  while (elapsed >= (nextElite + 1) * ELITES.every) {
    const types = ELITES.waves[Math.min(nextElite, ELITES.waves.length - 1)];
    nextElite++;
    for (const type of types) addEnemy(type);
    say(types.length > 1 ? 'Elites have arrived' : `${ENEMIES[types[0]].name} has arrived`);
  }
  while (elapsed >= ringEntry(nextRing).at) {
    const ring = ringEntry(nextRing++);
    for (let i = 0; i < ring.count; i++) addEnemy(ring.type, i / ring.count * TAU);
    say('They are closing in');
  }
  wildOrbTimer -= dt;
  if (wildOrbTimer <= 0) {
    wildOrbTimer += WILD_ORB_EVERY;
    const a = rand() * TAU;
    const d = 140 + rand() * 360;
    dropOrb(hero.x + Math.cos(a) * d, hero.y + Math.sin(a) * d, 1);
  }
}

function separate(e) {
  const cx = Math.floor(e.x / GRID_CELL);
  const cy = Math.floor(e.y / GRID_CELL);
  let pushes = 0;
  for (let yy = cy - 1; yy <= cy + 1; yy++) {
    for (let xx = cx - 1; xx <= cx + 1; xx++) {
      const cell = grid[gridIndex(xx, yy)];
      for (let i = 0; i < cell.length; i++) {
        const o = cell[i];
        if (o === e) continue;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const min = e.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * SEPARATION / d;
        e.x += dx * push;
        e.y += dy * push;
        if (++pushes >= MAX_PUSHES) return;
      }
    }
  }
}

function moveEnemies(dt) {
  const far = Math.hypot(view.w, view.h) / 2 + RECYCLE_MARGIN;
  const hurry = 1 + SPEED_PER_MINUTE * elapsed / 60;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const dx = hero.x - e.x;
    const dy = hero.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > far) {
      e.x = hero.x + dx * 0.8; // the opposite side: where the hero is heading
      e.y = hero.y + dy * 0.8;
      continue;
    }
    if (e.flash > 0) e.flash -= dt;
    if (e.slowLeft > 0) e.slowLeft -= dt;
    if (e.pushLeft > 0) {
      e.pushLeft -= dt;
      e.x += e.pushX * dt;
      e.y += e.pushY * dt;
    } else {
      const pace = e.def.speed * hurry * (e.slowLeft > 0 ? 1 - e.slowBy : 1);
      e.x += dx / d * pace * dt;
      e.y += dy / d * pace * dt;
    }
    if ((i + frame) % 2 === 0 && !e.def.elite) separate(e);
  }
}

function hurtHero(amount) {
  if (hero.ghostLeft > 0 || hero.phaseLeft > 0 || hero.iframes > 0) return;
  const shield = chargedWeapon();
  if (shield && shield.charges > 0) {
    if (shield.charges === shield.def.charges) setCooldown(shield, cooldownOf(shield));
    shield.charges--;
    hero.iframes = HERO.iframes;
    explode(hero.x, hero.y, auraRadius(shield), shield, shield.def.damage);
    return;
  }
  const dash = owned('phase');
  if (dash && !dash.locked) {
    startPhase(dash, true);
    return;
  }
  hero.hp -= amount;
  hero.iframes = HERO.iframes;
}

// A spare life: full health and a blast that wipes everything close.
function revive() {
  hero.lives--;
  hero.hp = hero.maxHp;
  hero.iframes = REVIVE.iframes;
  eachEnemyNear(hero.x, hero.y, REVIVE.radius, e => hurtEnemy(e, e.maxHp * REVIVE.share, 'pure', false, null));
  addFx({ type: 'ring', x: hero.x, y: hero.y, r: REVIVE.radius, life: 0.7, pen: KINDS.pure.pen });
  say('Back from the dead!');
}

// Bodies are solid. The hero shoves small enemies aside but can be walled in by a crowd,
// which is what Flash and Ghost are for.
function collideHero() {
  if (hero.ghostLeft > 0 || hero.phaseLeft > 0) return;
  const fury = 1 + DAMAGE_PER_MINUTE * elapsed / 60;
  eachEnemyNear(hero.x, hero.y, hero.r, e => {
    const dx = e.x - hero.x;
    const dy = e.y - hero.y;
    const d = Math.hypot(dx, dy) || 1;
    const overlap = hero.r + e.r - d;
    const share = e.def.elite ? ELITE_SHOVE : BODY_SHOVE;
    hero.x -= dx / d * overlap * share;
    hero.y -= dy / d * overlap * share;
    e.x += dx / d * overlap * (1 - share);
    e.y += dy / d * overlap * (1 - share);
    hurtHero(e.def.damage * fury);
  });
}

function moveHero(dt) {
  let mx = 0;
  let my = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
  if (stick.active) {
    mx = stick.x;
    my = stick.y;
  }
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  if (len > 0.05) {
    hero.faceX = mx / Math.hypot(mx, my);
    hero.faceY = my / Math.hypot(mx, my);
  }
  let pace = HERO.speed * stat('speed');
  if (hero.phaseLeft > 0) {
    const dash = owned('phase');
    pace *= 1 + (dash.def.moveBoost - 1) * weaponStat(dash, 'speed');
  }
  if (hero.ghostLeft > 0) pace *= activeDef.speedBoost;
  hero.x += mx * pace * dt;
  hero.y += my * pace * dt;
  walkFor(Math.hypot(mx, my) * pace * dt);
  hero.iframes = Math.max(0, hero.iframes - dt);
  hero.ghostLeft = Math.max(0, hero.ghostLeft - dt);
  hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp * gearValue('regen') * dt);
}

function updateTimers(dt) {
  for (const t of timers) {
    t.left -= dt;
    if (t.left <= 0) {
      t.dead = true;
      t.fn();
    }
  }
  sweep(timers);
}

function updateShots(dt) {
  for (const s of shots) {
    if (s.move) {
      s.move(s, dt);
    } else {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    if (s.dead) continue;
    eachEnemyNear(s.x, s.y, s.r, e => {
      if (s.dead || s.hits.has(e)) return;
      s.hits.add(e);
      s.onHit(s, e);
      if (--s.pierce <= 0) s.dead = true;
    });
    if (!s.dead && s.life <= 0) {
      s.dead = true;
      if (s.onEnd) s.onEnd(s);
    }
  }
  sweep(shots);
}

// A zone gets exactly life / tick ticks, so its total damage is what the table promises.
function addZone(o) {
  zones.push(Object.assign({ ticksLeft: Math.round(o.life / o.tick), dead: false }, o));
}

function updateZones(dt) {
  for (const z of zones) {
    z.life -= dt;
    z.timer -= dt;
    if (z.timer <= 0 && z.ticksLeft > 0) {
      z.timer += z.tick;
      z.ticksLeft--;
      eachEnemyNear(z.x, z.y, z.r, z.apply);
    }
    if (z.life <= 0) z.dead = true;
  }
  sweep(zones);
}

function update(dt) {
  elapsed += dt;
  frame++;
  moveHero(dt);
  spawnEnemies(dt);
  moveEnemies(dt);
  rebuildGrid();
  collideHero();
  updateWeapons(dt);
  updateTimers(dt);
  updateShots(dt);
  updateZones(dt);
  updateOrbs(dt);
  updateRedOrbs(dt);
  updateChests();
  if (hero.hp <= 0 && hero.lives > 0) revive();
  sweep(enemies);
  if (activeCd > 0) activeCd = Math.max(0, activeCd - dt);
  if (berserkLeft > 0) berserkLeft = Math.max(0, berserkLeft - dt);
  if (toastLeft > 0) toastLeft -= dt;
  updateFx(dt);
  dirty = true;
  if (hero.hp <= 0) endRun();
}

// ---- Effects ----

function addFx(o) {
  if (fx.length >= MAX_FX) return;
  o.max = o.life;
  o.dead = false;
  fx.push(o);
}

function floatText(x, y, text, pen, size) {
  if (numbers.length >= MAX_NUMBERS) return;
  numbers.push({ x, y, text, pen, size, life: 0.55, dead: false });
}

function addNumber(e, dealt, kind, crit, factor) {
  floatText(e.x + (rand() - 0.5) * 10, e.y - e.r, String(Math.max(1, Math.round(dealt))),
    factor < 0.7 ? 'ink-muted' : KINDS[kind].pen, crit ? 17 : 12);
}

function updateFx(dt) {
  for (const f of fx) {
    f.life -= dt;
    if (f.life <= 0) f.dead = true;
  }
  sweep(fx);
  for (const n of numbers) {
    n.life -= dt;
    n.y -= 34 * dt;
    if (n.life <= 0) n.dead = true;
  }
  sweep(numbers);
}

// ---- Rendering: the world ----

function onScreen(x, y, pad) {
  return x > cam.x - pad && x < cam.x + view.w + pad && y > cam.y - pad && y < cam.y + view.h + pad;
}

function gridLines(step, pen) {
  ctx.beginPath();
  for (let x = Math.floor(cam.x / step) * step; x < cam.x + view.w; x += step) {
    ctx.moveTo(x, cam.y);
    ctx.lineTo(x, cam.y + view.h);
  }
  for (let y = Math.floor(cam.y / step) * step; y < cam.y + view.h; y += step) {
    ctx.moveTo(cam.x, y);
    ctx.lineTo(cam.x + view.w, y);
  }
  ctx.strokeStyle = pen;
  ctx.lineWidth = 1 / view.scale;
  ctx.stroke();
}

function drawGround() {
  ctx.fillStyle = pal.paper;
  ctx.fillRect(cam.x, cam.y, view.w, view.h);
  gridLines(20, pal['grid-minor']);
  gridLines(100, pal['grid-major']);
}

function drawZones() {
  for (const z of zones) {
    if (!onScreen(z.x, z.y, z.r)) continue;
    const fade = Math.min(1, z.life / 0.5);
    const fire = z.look === 'fire';
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, TAU);
    ctx.globalAlpha = (fire ? 0.14 + 0.05 * Math.sin(z.life * 11) : 0.16) * fade;
    ctx.fillStyle = pal[fire ? 'red-pencil' : 'ink-muted'];
    ctx.fill();
    ctx.globalAlpha = 0.8 * fade;
    ctx.strokeStyle = pal[fire ? 'red-pencil' : 'orange-pen'];
    ctx.lineWidth = fire ? 2 : 1.5;
    ctx.setLineDash(fire ? [10, 7] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

function drawOrbs() {
  ctx.beginPath();
  for (const o of orbs) {
    if (!onScreen(o.x, o.y, 10)) continue;
    const r = o.value >= 5 ? 7 : 4.5;
    ctx.moveTo(o.x, o.y - r);
    ctx.lineTo(o.x + r, o.y);
    ctx.lineTo(o.x, o.y + r);
    ctx.lineTo(o.x - r, o.y);
    ctx.closePath();
  }
  ctx.fillStyle = pal['green-ink'];
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 0.75;
  ctx.stroke();
}

function drawRedOrbs() {
  const r = 7.5;
  for (const o of redOrbs) {
    if (!onScreen(o.x, o.y, 12)) continue;
    ctx.beginPath();
    ctx.arc(o.x, o.y, r, 0, TAU);
    ctx.fillStyle = pal['red-pencil'];
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(o.x - 4, o.y);
    ctx.lineTo(o.x + 4, o.y);
    ctx.moveTo(o.x, o.y - 4);
    ctx.lineTo(o.x, o.y + 4);
    ctx.strokeStyle = pal.paper;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawChests() {
  for (const c of chests) {
    if (!onScreen(c.x, c.y, 20)) continue;
    ctx.fillStyle = pal[CHESTS[c.type].pen];
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1.5;
    ctx.fillRect(c.x - 12, c.y - 9, 24, 18);
    ctx.strokeRect(c.x - 12, c.y - 9, 24, 18);
    ctx.beginPath();
    ctx.moveTo(c.x - 12, c.y - 2);
    ctx.lineTo(c.x + 12, c.y - 2);
    ctx.stroke();
  }
}

function traceBody(e) {
  const { x, y, r } = e;
  switch (e.def.shape) {
    case 'square':
      ctx.rect(x - r * 0.88, y - r * 0.88, r * 1.76, r * 1.76);
      break;
    case 'diamond':
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x + r * 1.15, y);
      ctx.lineTo(x, y + r * 1.15);
      ctx.lineTo(x - r * 1.15, y);
      ctx.closePath();
      break;
    case 'triangle': {
      const a = Math.atan2(hero.y - y, hero.x - x);
      ctx.moveTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3);
      ctx.lineTo(x + Math.cos(a + 2.4) * r, y + Math.sin(a + 2.4) * r);
      ctx.lineTo(x + Math.cos(a - 2.4) * r, y + Math.sin(a - 2.4) * r);
      ctx.closePath();
      break;
    }
    default:
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
  }
}

// The outline tells the armor: orange blunts physical damage, violet blunts magic.
function drawEnemies() {
  for (const def of ENEMY_LIST) {
    ctx.beginPath();
    for (const e of enemies) if (e.def === def && onScreen(e.x, e.y, 30)) traceBody(e);
    ctx.fillStyle = pal[def.pen];
    ctx.fill();
    const armored = def.armor >= 0.3;
    const warded = def.ward >= 0.3;
    ctx.strokeStyle = armored ? pal[KINDS.phys.pen] : warded ? pal[KINDS.magic.pen] : pal.ink;
    ctx.lineWidth = armored || warded ? 3 : 1;
    ctx.stroke();
  }
  ctx.fillStyle = pal.paper;
  for (const e of enemies) {
    if (!onScreen(e.x, e.y, 30)) continue;
    if (e.flash > 0) {
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      traceBody(e);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (e.slowLeft > 0) {
      ctx.strokeStyle = pal['blue-pen'];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 3, 0, TAU);
      ctx.stroke();
    }
    if (e.def.elite) {
      const w = e.r * 2.4;
      ctx.fillStyle = pal.desk;
      ctx.fillRect(e.x - w / 2, e.y - e.r - 13, w, 5);
      ctx.fillStyle = pal['red-pencil'];
      ctx.fillRect(e.x - w / 2, e.y - e.r - 13, w * Math.max(0, e.hp / e.maxHp), 5);
      ctx.fillStyle = pal.paper;
    }
  }
}

function drawShots() {
  ctx.lineCap = 'round';
  for (const s of shots) {
    if (!onScreen(s.x, s.y, 40)) continue;
    const pen = pal[s.pen];
    if (s.look === 'ball') {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fillStyle = pen;
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (s.look === 'arrow') {
      // As wide as what it really hits, so growing in Size shows.
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      ctx.beginPath();
      ctx.moveTo(s.r * 0.5 + 6, 0);
      ctx.lineTo(-s.r * 0.9 - 4, -s.r);
      ctx.lineTo(-s.r * 0.35, 0);
      ctx.lineTo(-s.r * 0.9 - 4, s.r);
      ctx.closePath();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = pen;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = pen;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s.r * 0.35, 0);
      ctx.lineTo(-s.r * 0.35 - s.len, 0);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    } else if (s.look === 'boomerang') {
      const r = s.r;
      ctx.beginPath();
      ctx.moveTo(s.x + Math.cos(s.spin) * r, s.y + Math.sin(s.spin) * r);
      ctx.lineTo(s.x, s.y);
      ctx.lineTo(s.x + Math.cos(s.spin + 1.9) * r, s.y + Math.sin(s.spin + 1.9) * r);
      ctx.strokeStyle = pen;
      ctx.lineWidth = 4;
      ctx.stroke();
    } else if (s.look === 'rocket') {
      const k = s.r / 8;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      ctx.scale(k, k);
      ctx.beginPath();
      ctx.moveTo(-10, -3);
      ctx.lineTo(-18 - s.speed / 60, 0);
      ctx.lineTo(-10, 3);
      ctx.closePath();
      ctx.fillStyle = pal.highlighter;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(4, -5);
      ctx.lineTo(-10, -5);
      ctx.lineTo(-10, 5);
      ctx.lineTo(4, 5);
      ctx.closePath();
      ctx.fillStyle = pen;
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    } else if (s.look === 'drone') {
      // The disc is what it really hits, so growing in Size shows.
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = pen;
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = pen;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = pal.ink;
      for (let i = 0; i < 4; i++) {
        const a = s.a + TAU / 8 + i * TAU / 4;
        const ax = s.x + Math.cos(a) * 11;
        const ay = s.y + Math.sin(a) * 11;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(ax, ay);
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax - Math.cos(s.spin + i) * 6, ay - Math.sin(s.spin + i) * 6);
        ctx.lineTo(ax + Math.cos(s.spin + i) * 6, ay + Math.sin(s.spin + i) * 6);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.rect(s.x - 5, s.y - 5, 10, 10);
      ctx.fillStyle = pen;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
}

// A shaft out to `reach` from the hero, drawn in the rotated frame of the weapon.
function drawSpearhead(w, reach, size) {
  const tip = reach + w.thrust * 8 * size;
  ctx.beginPath();
  ctx.moveTo(hero.r, 0);
  ctx.lineTo(tip - 22 * size, 0);
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 2 + size;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tip, 0);
  ctx.lineTo(tip - 24 * size, -8 * size);
  ctx.lineTo(tip - 18 * size, 0);
  ctx.lineTo(tip - 24 * size, 8 * size);
  ctx.closePath();
  ctx.fillStyle = pal[w.def.pen];
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.stroke();
}

// The zone it hurts is drawn like the Aura, with the spear itself on top.
function drawSpear(w) {
  const size = weaponStat(w, 'size');
  const length = w.def.length * size;
  const width = w.def.width * size;
  ctx.save();
  ctx.translate(hero.x, hero.y);
  ctx.rotate(w.angle);
  ctx.beginPath();
  ctx.rect(0, -width / 2, length, width);
  ctx.globalAlpha = 0.1 + 0.16 * w.thrust;
  ctx.fillStyle = pal[w.def.pen];
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = pal[w.def.pen];
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawSpearhead(w, length, size);
  ctx.restore();
}

function drawRadiantLance(w) {
  const size = weaponStat(w, 'size');
  const { x, y, long, wide } = lanceOval(w);
  ctx.beginPath();
  ctx.ellipse(x, y, long, wide, w.angle, 0, TAU);
  ctx.globalAlpha = 0.1 + 0.14 * w.thrust;
  ctx.fillStyle = pal[w.def.pen];
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = pal[w.def.pen];
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(hero.x, hero.y);
  ctx.rotate(w.angle);
  drawSpearhead(w, w.def.length * size, size);
  ctx.restore();
}

function drawHeroEffects() {
  const { x, y, r } = hero;
  const spear = owned('spear');
  if (spear) drawSpear(spear);
  const lance = owned('radiantlance');
  if (lance) drawRadiantLance(lance);
  const aura = owned('aura') || owned('fireshield');
  if (aura) {
    ctx.beginPath();
    ctx.arc(x, y, auraRadius(aura), 0, TAU);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = pal[aura.def.pen];
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = pal[aura.def.pen];
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const dash = owned('phase');
  if (dash && hero.phaseLeft > 0) {
    ctx.beginPath();
    ctx.arc(x, y, dash.def.radius, 0, TAU);
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = pal[dash.def.pen];
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const shield = chargedWeapon();
  if (shield) {
    ctx.strokeStyle = pal[shield.def.pen];
    ctx.lineWidth = 2;
    for (let i = 0; i < shield.charges; i++) {
      ctx.beginPath();
      ctx.arc(x, y, r + 5 + i * 4, 0, TAU);
      ctx.stroke();
    }
  }
  if (berserkLeft > 0) {
    ctx.strokeStyle = pal['red-pencil'];
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(x, y, r + 15, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawHero() {
  const { x, y, r } = hero;
  const phased = hero.ghostLeft > 0 || hero.phaseLeft > 0;
  const blink = hero.iframes > 0 && Math.floor(elapsed * 20) % 2 === 0;
  ctx.globalAlpha = phased ? 0.45 : blink ? 0.6 : 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = pal['red-pencil'];
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + hero.faceX * r * 0.3, y + hero.faceY * r * 0.3);
  ctx.lineTo(x + hero.faceX * (r + 6), y + hero.faceY * (r + 6));
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const w = 34;
  ctx.fillStyle = pal.desk;
  ctx.fillRect(x - w / 2, y + r + 6, w, 4);
  ctx.fillStyle = pal[hero.hp / hero.maxHp > 0.35 ? 'green-ink' : 'red-pencil'];
  ctx.fillRect(x - w / 2, y + r + 6, w * Math.max(0, hero.hp / hero.maxHp), 4);
}

function drawFx() {
  ctx.lineCap = 'round';
  for (const f of fx) {
    const k = f.life / f.max; // runs from 1 down to 0
    const pen = pal[f.pen];
    ctx.strokeStyle = pen;
    switch (f.type) {
      case 'ring':
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1 - k * 0.4), 0, TAU);
        ctx.globalAlpha = k * 0.25;
        ctx.fillStyle = pen;
        ctx.fill();
        ctx.globalAlpha = k;
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      case 'bolt':
        ctx.beginPath();
        f.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.globalAlpha = k;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        break;
      case 'tracer':
        ctx.beginPath();
        ctx.moveTo(f.x0, f.y0);
        ctx.lineTo(f.x, f.y);
        ctx.globalAlpha = k;
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      case 'swing':
        ctx.beginPath();
        ctx.moveTo(hero.x, hero.y);
        ctx.arc(hero.x, hero.y, f.r, f.a - f.span / 2, f.a + f.span / 2);
        ctx.closePath();
        ctx.globalAlpha = k * 0.3;
        ctx.fillStyle = pen;
        ctx.fill();
        ctx.globalAlpha = k;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      case 'telegraph':
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1 - k), 0, TAU);
        ctx.stroke();
        break;
    }
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

function drawNumbers() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const n of numbers) {
    ctx.globalAlpha = Math.min(1, n.life * 3);
    ctx.font = `600 ${n.size}px ${FONT}`;
    ctx.fillStyle = pal[n.pen];
    ctx.fillText(n.text, n.x, n.y);
  }
  ctx.globalAlpha = 1;
}

// ---- Rendering: the HUD, in screen pixels ----

function hudText(text, x, y, size, pen, align = 'left') {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = pal.paper;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = pal[pen];
  ctx.fillText(text, x, y);
}

function drawWeaponTiles(H) {
  const size = 40;
  let x = 10;
  const y = H - size - 10;
  for (const w of hero.weapons) {
    ctx.fillStyle = pal.paper;
    ctx.fillRect(x, y, size, size);
    const fullyCharged = w.charges !== undefined && w.charges >= w.def.charges;
    if (w.def.cooldown && w.timer > 0 && !fullyCharged) {
      const share = Math.min(1, w.timer / w.full);
      ctx.fillStyle = pal.rule;
      ctx.fillRect(x, y + size * (1 - share), size, size * share);
    }
    ctx.strokeStyle = pal[KINDS[w.def.kind].pen];
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);
    hudText(w.def.tag, x + size / 2, y + size / 2, 15, 'ink', 'center');
    if (w.charges !== undefined) hudText(String(w.charges), x + size - 7, y + size - 8, 12, 'red-pencil', 'center');
    if (w.locked) hudText('x2', x + size - 9, y + 9, 12, 'red-pencil', 'center');
    x += size + 6;
  }
  // Items as small chips in their rarity's color; the pause screen has the names.
  // A long row wraps upward before it reaches the active skill's button.
  const chip = 11;
  x = 10;
  let chipY = y - chip - 7;
  for (const item of items) {
    if (x + chip > view.cssW - 104) {
      x = 10;
      chipY -= chip + 4;
    }
    ctx.fillStyle = pal[RARITIES[item.rarity].pen];
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1;
    ctx.fillRect(x, chipY, chip, chip);
    ctx.strokeRect(x, chipY, chip, chip);
    x += chip + 4;
  }
}

function drawHud() {
  const W = view.cssW;
  const H = view.cssH;
  ctx.fillStyle = pal.desk;
  ctx.fillRect(0, 0, W, 9);
  ctx.fillStyle = pal['green-ink'];
  ctx.fillRect(0, 0, W * Math.min(1, xp / xpNext), 9);

  hudText(`Level ${level}`, 10, 25, 17, 'ink');
  hudText(`Health ${Math.ceil(Math.max(0, hero.hp))} / ${hero.maxHp}`, 10, 44, 13, 'ink-muted');
  let line = 61;
  if (hero.lives > 0) {
    hudText(`Spare lives ${hero.lives}`, 10, line, 13, 'green-ink');
    line += 16;
  }
  if (berserkLeft > 0) {
    hudText(`Berserk ${Math.ceil(berserkLeft)}s`, 10, line, 13, 'red-pencil');
    line += 16;
  }
  if (hero.ghostLeft > 0) hudText(`Ghost ${Math.ceil(hero.ghostLeft)}s`, 10, line, 13, 'violet');

  hudText(formatTime(elapsed), W / 2, 28, 22, 'ink', 'center');
  hudText(`Kills ${kills}`, W - 74, 30, 13, 'ink-muted', 'right');
  if (toastLeft > 0) hudText(toast, W / 2, 54, 17, 'red-pencil', 'center');

  drawWeaponTiles(H);

  if (stick.active) {
    ctx.strokeStyle = pal['ink-muted'];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(stick.ax, stick.ay, STICK_RADIUS, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(stick.ax + stick.x * STICK_RADIUS, stick.ay + stick.y * STICK_RADIUS, 14, 0, TAU);
    ctx.fillStyle = pal['ink-muted'];
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function updateActiveButton() {
  const ready = activeCd <= 0;
  setText(activeTimeEl, ready ? 'Ready' : `${Math.ceil(activeCd)}s`);
  const share = ready ? 0 : Math.round(activeCd / activeCooldown() * 100) / 100;
  if (share === lastCdShare) return;
  lastCdShare = share;
  activeBtn.style.setProperty('--cd', share);
  activeBtn.classList.toggle('ready', ready);
}

function draw() {
  dirty = false;
  cam.x = hero.x - view.w / 2;
  cam.y = hero.y - view.h / 2;
  const s = view.scale * DPR;
  ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s);
  ctx.lineJoin = 'round';
  drawGround();
  drawZones();
  drawChests();
  drawOrbs();
  drawRedOrbs();
  drawEnemies();
  drawShots();
  drawHeroEffects();
  drawHero();
  drawFx();
  drawNumbers();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (phase !== 'start') {
    drawHud();
    updateActiveButton();
  }
}

function resize() {
  const box = stageEl.getBoundingClientRect();
  view.cssW = Math.max(1, Math.round(box.width));
  view.cssH = Math.max(1, Math.round(box.height));
  view.scale = Math.max(MIN_SCALE, Math.min(view.cssW, view.cssH) / VIEW_SHORT);
  view.w = view.cssW / view.scale;
  view.h = view.cssH / view.scale;
  canvas.width = Math.round(view.cssW * DPR);
  canvas.height = Math.round(view.cssH * DPR);
  dirty = true;
}

function readTheme() {
  pal = Theme.palette();
  dirty = true;
}

// ---- Screens ----

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showPanel(build) {
  panelEl.textContent = '';
  build(panelEl);
  overlayEl.hidden = false;
  overlayEl.scrollTop = 0;
  dirty = true;
}

function hideOverlay() {
  overlayEl.hidden = true;
  cardActions = [];
}

function showCards(title, note, cards) {
  cardActions = cards.map(c => c.pick);
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', title));
    p.appendChild(el('p', 'panel-note', note));
    const grid = el('div', cards.length === 1 ? 'cards single' : 'cards');
    cards.forEach((c, i) => {
      const b = el('button', `card ${c.kind}`);
      b.appendChild(el('span', `stamp ${c.kind}`, c.tag));
      b.appendChild(el('span', 'card-name', c.name));
      if (c.value) b.appendChild(el('span', 'card-value', c.value));
      b.appendChild(el('span', 'card-note', c.note));
      if (c.synergy) b.appendChild(el('span', 'card-synergy', c.synergy));
      b.appendChild(el('kbd', '', String(i + 1)));
      b.addEventListener('click', () => chooseCard(i));
      grid.appendChild(b);
    });
    p.appendChild(grid);
  });
}

function addPickRows(parent, rows, current, describe, onPick) {
  const detail = el('p', 'pick-detail', describe(current));
  const buttons = [];
  for (const row of rows) {
    const line = el('div', 'pick-row');
    line.appendChild(el('span', 'pick-label', row.label));
    const box = el('div', 'pick-items');
    for (const item of row.items) {
      const b = el('button', 'pick');
      b.appendChild(el('span', '', item.name));
      if (row.note) b.appendChild(el('small', '', row.note(item)));
      b.setAttribute('aria-pressed', String(item === current));
      b.addEventListener('click', () => {
        buttons.forEach(o => o.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        detail.textContent = describe(item);
        onPick(item);
      });
      buttons.push(b);
      box.appendChild(b);
    }
    line.appendChild(box);
    parent.appendChild(line);
  }
  parent.appendChild(detail);
}

function showStart() {
  phase = 'start';
  activeBtn.hidden = true;
  pauseBtn.hidden = true;
  const last = loadJson(LAST_KEY) || {};
  loadout.active = ACTIVES.find(a => a.id === last.active) || ACTIVES[0];
  loadout.weapon = WEAPONS.find(d => d.id === last.weapon && !d.defense) || WEAPONS[0];
  const starters = WEAPONS.filter(d => !d.defense);
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', 'Choose your loadout'));
    p.appendChild(el('p', 'panel-note',
      `The horde never stops growing: last as long as you can. New weapons at levels ${WEAPON_LEVELS.join(', ')}, and some pairs merge into a stronger one.`));

    p.appendChild(el('h3', 'section-title', 'Active skill'));
    addPickRows(p, ACTIVE_GROUPS.map(group => ({
      label: group,
      items: ACTIVES.filter(a => a.group === group),
      note: a => `${a.cooldown} s`,
    })), loadout.active, a => a.blurb, a => { loadout.active = a; });

    p.appendChild(el('h3', 'section-title', 'First weapon'));
    addPickRows(p, ['magic', 'phys'].map(kind => ({
      label: KINDS[kind].name,
      items: starters.filter(d => d.kind === kind),
    })), loadout.weapon, d => `${d.blurb} Uses: ${d.scales.map(k => STATS[k].name).join(', ')}.`, d => { loadout.weapon = d; });

    const actions = el('div', 'panel-actions');
    const go = el('button', 'primary', 'Start run');
    go.addEventListener('click', beginFromMenu);
    actions.appendChild(go);
    p.appendChild(actions);

    const hints = el('p', 'hints');
    hints.innerHTML =
      '<kbd>WASD</kbd> or arrows, or drag on the field, to walk &middot; <kbd>Space</kbd> active skill &middot; ' +
      '<kbd>1</kbd>&ndash;<kbd>4</kbd> pick a card &middot; <kbd>P</kbd> pause<br>' +
      'An orange outline is armor that blunts physical damage, a violet outline is a ward that blunts magic. Pure damage ignores both.<br>' +
      'Red orbs heal. Walking turns them up, and elites drop them along with a chest: pick 1 item of 3. A blue chest is better than a grey one, a yellow one better still.' +
      (DEV ? '<br>Dev keys: <kbd>L</kbd> level up &middot; <kbd>G</kbd> weapon pick &middot; <kbd>I</kbd> open a chest &middot; <kbd>K</kbd> die and revive &middot; <kbd>R</kbd> reset active &middot; <kbd>T</kbd> skip a minute' : '');
    p.appendChild(hints);
  });
}

function beginFromMenu() {
  startRun(loadout.active.id, loadout.weapon.id);
}

function addFigure(parent, label, value) {
  const box = el('div');
  box.appendChild(el('span', 'label', label));
  box.appendChild(el('span', 'figure', value));
  parent.appendChild(box);
}

function addRow(parent, label, value) {
  const row = el('div', 'row');
  row.appendChild(el('span', '', label));
  row.appendChild(el('span', '', value));
  parent.appendChild(row);
}

function addKitReport(p) {
  p.appendChild(el('h3', 'section-title', 'Damage dealt'));
  const box = el('div', 'report');
  [...hero.weapons].sort((a, b) => b.dealt - a.dealt).forEach(w => {
    addRow(box, `${w.def.name} (${KINDS[w.def.kind].name})`, Math.round(w.dealt).toLocaleString('en-US'));
  });
  p.appendChild(box);
}

function addItemReport(p) {
  if (!items.length) return;
  p.appendChild(el('h3', 'section-title', 'Items'));
  const box = el('div', 'item-list');
  for (const item of items) {
    const row = el('div', 'item-row');
    row.appendChild(el('span', `item-name ${item.rarity}`, item.name));
    row.appendChild(el('span', 'item-text', item.text));
    box.appendChild(row);
  }
  p.appendChild(box);
}

function addStatReport(p) {
  p.appendChild(el('h3', 'section-title', 'Stats'));
  const box = el('div', 'report');
  const trees = ['phys', 'magic'];
  if (hero.weapons.some(w => w.def.kind === 'hybrid')) trees.push('hybrid');
  for (const kind of trees) {
    const column = el('div');
    column.appendChild(el('span', `stamp ${kind}`, KINDS[kind].name));
    for (const key of Object.keys(STATS)) {
      if (STATS[key].split) addRow(column, STATS[key].name, formatStat(key, stat(key, kind)));
    }
    box.appendChild(column);
  }
  const column = el('div');
  column.appendChild(el('span', 'stamp hero', KINDS.hero.name));
  addRow(column, 'Health', String(hero.maxHp));
  if (gearValue('regen')) addRow(column, 'Health regen', `${Math.round(gearValue('regen') * 100)}% per s`);
  addRow(column, 'Base attack', String(Math.round(hero.baseAttack)));
  for (const key of Object.keys(STATS)) {
    if (!STATS[key].split) addRow(column, STATS[key].name, formatStat(key, key === 'attack' ? attackValue() : stat(key, 'hero')));
  }
  addRow(column, 'Pickup radius', String(Math.round(magnetRadius())));
  if (gearValue('physDamage')) addRow(column, 'All physical damage', `+${Math.round(gearValue('physDamage') * 100)}%`);
  if (gearValue('magicDamage')) addRow(column, 'All magic damage', `+${Math.round(gearValue('magicDamage') * 100)}%`);
  if (gearValue('pureShare')) addRow(column, 'Damage made pure', `${Math.round(gearValue('pureShare') * 100)}%`);
  if (gearValue('activeCooldown')) addRow(column, 'Active cooldown', `-${Math.round(gearValue('activeCooldown') * 100)}%`);
  if (hero.lives) addRow(column, 'Spare lives', String(hero.lives));
  box.appendChild(column);
  p.appendChild(box);
}

function showPause() {
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', 'Paused'));
    addStatReport(p);
    addItemReport(p);
    addKitReport(p);
    const actions = el('div', 'panel-actions');
    const resume = el('button', 'primary', 'Resume');
    resume.addEventListener('click', togglePause);
    const quit = el('button', '', 'End run');
    quit.addEventListener('click', endRun);
    actions.append(resume, quit);
    p.appendChild(actions);
  });
}

function togglePause() {
  if (phase === 'playing') {
    phase = 'paused';
    showPause();
  } else if (phase === 'paused') {
    phase = 'playing';
    hideOverlay();
    dirty = true;
  }
}

function showEnd(isBest) {
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', hero.hp > 0 ? 'Run ended' : 'The horde got you'));
    if (isBest) p.appendChild(el('p', 'panel-note', 'A new best time.'));
    const figures = el('div', 'figures');
    addFigure(figures, 'Time', formatTime(elapsed));
    addFigure(figures, 'Level', String(level));
    addFigure(figures, 'Kills', kills.toLocaleString('en-US'));
    p.appendChild(figures);
    addKitReport(p);
    addItemReport(p);
    addStatReport(p);
    const actions = el('div', 'panel-actions');
    const again = el('button', 'primary', 'New run');
    again.addEventListener('click', showStart);
    actions.appendChild(again);
    p.appendChild(actions);
  });
}

function showBest() {
  const best = loadJson(BEST_KEY);
  setText(statusEl, best ? `Best run: ${formatTime(best.time)}, level ${best.level}` : '');
}

// ---- Game loop ----

function loop(time = 0) {
  const dt = Math.min(0.05, (time - lastTime) / 1000);
  lastTime = time;
  if (phase === 'playing') update(dt);
  if (dirty) draw();
  requestAnimationFrame(loop);
}

// ---- Input ----

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function devKey(code) {
  if (code === 'KeyL') gainXp(xpNext - xp);
  else if (code === 'KeyG') enqueueChoice('weapon');
  else if (code === 'KeyI') enqueueChoice(pickWeighted(CHEST_ROLL));
  else if (code === 'KeyR') activeCd = 0;
  else if (code === 'KeyT') elapsed += 60;
  else if (code === 'KeyK') {
    hero.lives = Math.max(1, hero.lives);
    hero.hp = 0;
  }
}

document.addEventListener('keydown', e => {
  // Keyboard users pressing a focused button get the button, not the shortcut.
  if (e.target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (MOVE_KEYS.has(e.code)) {
    keys.add(e.code);
    e.preventDefault();
    return;
  }
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit) {
    if (!e.repeat) chooseCard(Number(digit[1]) - 1);
    return;
  }
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      useActive();
      break;
    case 'Enter':
      if (phase === 'start') beginFromMenu();
      else if (phase === 'over') showStart();
      break;
    case 'KeyP':
    case 'Escape':
      togglePause();
      break;
    default:
      if (DEV && phase === 'playing') devKey(e.code);
  }
});
document.addEventListener('keyup', e => keys.delete(e.code));

// Dragging anywhere on the field is a floating joystick, for touch screens and the mouse.
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  stick.active = true;
  stick.id = e.pointerId;
  stick.ax = e.offsetX;
  stick.ay = e.offsetY;
  stick.x = 0;
  stick.y = 0;
});
canvas.addEventListener('pointermove', e => {
  if (!stick.active || e.pointerId !== stick.id) return;
  const dx = e.offsetX - stick.ax;
  const dy = e.offsetY - stick.ay;
  const d = Math.hypot(dx, dy);
  const amount = d < 6 ? 0 : Math.min(1, d / STICK_RADIUS);
  stick.x = d ? dx / d * amount : 0;
  stick.y = d ? dy / d * amount : 0;
});
function releaseStick(e) {
  if (e.pointerId !== stick.id) return;
  stick.active = false;
  dirty = true;
}
canvas.addEventListener('pointerup', releaseStick);
canvas.addEventListener('pointercancel', releaseStick);
canvas.addEventListener('contextmenu', e => e.preventDefault());

activeBtn.addEventListener('click', () => {
  useActive();
  activeBtn.blur();
});
pauseBtn.addEventListener('click', () => {
  togglePause();
  pauseBtn.blur();
});

// A game that keeps running behind another window is a lost run.
function pauseIfPlaying() {
  keys.clear();
  stick.active = false;
  if (phase === 'playing') togglePause();
}
window.addEventListener('blur', pauseIfPlaying);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseIfPlaying(); });

window.addEventListener('resize', resize);
document.addEventListener('themechange', readTheme);

readTheme();
resize();
resetWorld();
showBest();
showStart();
requestAnimationFrame(loop);
