// Tuning: chests and the items in them.

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
