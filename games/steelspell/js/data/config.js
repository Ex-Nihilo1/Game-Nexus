// Tuning: constants, the hero, damage kinds, stats and active skills.

const TAU = Math.PI * 2;
const DPR = Math.min(2, window.devicePixelRatio || 1);
const DEV = new URLSearchParams(location.search).has('dev');

const VIEW_SHORT = 560; // world units along the screen's short side...
const MIN_SCALE = 0.8; // ...unless that would make everything too small on a phone
const WEAPON_LEVELS = [10, 20, 40, 60]; // new weapons at these levels; the first comes before the run
const MAX_WEAPON_LEVEL = 8; // a weapon grows through level-up cards up to here
// A level-up: how many cards, how much likelier a weapon level comes up than a passive, and
// whether one of each is always there while there is one to offer.
const LEVEL_CARDS = { slots: 3, weaponWeight: 2, sureWeapon: true, sureStat: true };
const REROLLS = { start: 2, everyLevels: 12 }; // rerolls a run begins with, and how often a level adds one
const SKIP_HEAL = 0.1; // share of max health for skipping a level-up
const XP_BASE = 5;
const XP_PER_LEVEL = 2.7;
const XP_CURVE = 0.03; // ...and this much per level squared: late levels cost more and more
const HP_PER_LEVEL = 1; // max health for every level gained
const HP_PER_MINUTE = 0.12; // enemy health grows this much per minute of the run...
const HP_ACCEL = 0.03; // ...and this much per minute squared, to keep up with five weapons...
const HP_WALL = { from: 13, doubling: 2.3 }; // ...and from this minute on also doubles every so many minutes, so every run ends
const DAMAGE_PER_MINUTE = 0.12;
const SPEED_PER_MINUTE = 0.03;
const AIM_RANGE = 460;
const ORB_PULL_SPEED = 340;
const WILD_ORB = { every: 2, share: 0.03 }; // orbs also appear on the map, each worth this share of the level, so a hero who cannot kill still grows
// A magnet on the map pulls in every XP orb at once. Each elite drops one, an ordinary enemy
// once in a long while, and one turns up by itself every `every` seconds. Only one lies on
// the map at a time. `pull` is how much faster than usual the orbs fly in.
const MAGNET = { every: 120, dropChance: 1 / 700, pull: 2.4 };
const RED_ORB = { heal: 0.15, every: 1200, eliteDrop: 3, max: 10 }; // `heal` is a share of max health, `every` a distance walked
const COUNT = { cap: 3, overflow: 0.15 }; // Count adds shots up to `cap`; each one past it adds this much damage instead
const BODY_SHOVE = 0.25; // share of an overlap the hero gives way on: small enemies
const ELITE_SHOVE = 0.8; // and elites, who mostly push the hero around
const SEPARATION = 0.5;
const MAX_PUSHES = 5;
const RECYCLE_MARGIN = 260; // enemies and orbs this far off screen come back ahead of the hero
const MAX_ENEMIES = 320;
const MAX_ORBS = 160;
const MAX_FX = 120;
const MAX_ENEMY_SHOTS = 150;
const MAX_WARNINGS = 40; // strikes announced on the ground at once
const MAX_ZONES = 140; // burning ground, beams and whirlwinds together
const MAX_TRAIL = 60; // patches of one Fire Trail; past that the oldest gives way
const BURN_TICK = 0.5; // an enemy on fire is hurt this often
const MAX_NUMBERS = 40;
const DOT_NUMBER_EVERY = 0.3; // damage over time shows one summed number per enemy this often
const MAX_ENEMY_R = 30;
const STICK_RADIUS = 46;
const HURT_FLASH = 0.3; // seconds the screen's edge stays red after a hit

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

// Passive stats. A pick on a level-up adds one `step`; items and Camp upgrades add to the
// same sum. Nothing has a hard cap: `soft` lists [bonus up to, rate] tiers, so past the first
// tier a pick still helps, only less. A weapon gets a stat only if it lists it in `scales`
// (`off` is what it gets otherwise, the base value unless given). Stats with a `note` belong
// to the hero and are always on offer. `weight` is how often the card comes up, 1 unless given.
const STATS = {
  damage: { name: 'Damage', base: 1, step: 0.08, soft: [[1, 1], [2, 0.5], [Infinity, 0.25]] },
  haste: { name: 'Haste', base: 0, step: 0.06, soft: [[1, 1], [Infinity, 0.5]] }, // attacks this much more often
  size: { name: 'Size', base: 1, step: 0.05, soft: [[0.6, 1], [1.4, 0.5], [Infinity, 0.25]] },
  count: { name: 'Count', base: 0, step: 1, weight: 0.4 }, // see COUNT
  critChance: { name: 'Crit chance', base: 0.05, step: 0.03, off: 0 }, // past 100% a crit can land twice
  critDamage: { name: 'Crit damage', base: 1.5, step: 0.12, soft: [[1.5, 1], [Infinity, 0.5]] },
  duration: { name: 'Duration', base: 1, step: 0.08, soft: [[0.8, 1], [Infinity, 0.5]] },
  speed: { name: 'Speed', base: 1, step: 0.04, soft: [[0.5, 1], [Infinity, 0.5]], note: 'Move speed' },
  xp: { name: 'XP', base: 1, step: 0.05, soft: [[0.3, 1], [0.6, 0.5], [Infinity, 0.25]], note: 'Value of every orb' },
  magnet: { name: 'Magnet', base: 1, step: 0.15, soft: [[1.5, 1], [Infinity, 0.5]], note: 'Pickup radius' },
  armor: { name: 'Armor', base: 0, step: 6, note: 'Softens every hit you take' }, // a hit does 100 / (100 + armor) of its damage
  vitality: { name: 'Vitality', base: 1, step: 0.08, soft: [[1, 1], [Infinity, 0.5]], note: 'Max health' },
  recovery: { name: 'Recovery', base: 0, step: 0.4, note: 'Health per second' },
};

// Active skills: one is picked before the run and sits on the Space key.
const ACTIVES = [
  { id: 'flash', name: 'Flash', group: 'Mobility', cooldown: 40, distance: 190,
    blurb: 'Blink a short way in the direction you are walking.' },
  { id: 'ghost', name: 'Ghost', group: 'Mobility', cooldown: 120, duration: 5, speedBoost: 2,
    blurb: 'For 5 s nothing can hurt you, you walk straight through enemies and move twice as fast.' },
  { id: 'berserk', name: 'Berserk', group: 'Damage', cooldown: 60, duration: 30,
    buff: { damage: 1.3, size: 1.25, haste: 0.25, count: 1 },
    blurb: 'For 30 s: damage +30%, size +25%, haste +25%, count +1, on every weapon that uses them.' },
  { id: 'ignite', name: 'Ignite', group: 'Damage', cooldown: 120, duration: 8, radius: 270, tick: 0.5, share: 0.7,
    blurb: 'Sets the ground around you on fire for 8 s. Whatever burns the whole time loses 70% of its max health, as pure damage.' },
  { id: 'stash', name: 'Stash', group: 'Economy', cooldown: 240, distance: 110,
    blurb: 'Drops a chest nearby: pick 1 of 3 items, any rarity.' },
  { id: 'inspiration', name: 'Inspiration', group: 'Economy', cooldown: 100, share: 0.6,
    blurb: 'Instantly gain 60% of the XP this level needs.' },
];
const ACTIVE_GROUPS = ['Mobility', 'Damage', 'Economy'];
const BERSERK = ACTIVES.find(a => a.id === 'berserk');
