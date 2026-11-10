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

// To add an item, add a row. In `gives`, the keys of STATS add to that stat's sum, soft caps
// and all. The other keys:
//   baseHp, baseAttack   flat, before everything else
//   regen                share of max health per second
//   pureShare            share of all damage that turns pure
//   hpToAttack           share of health that turns into base attack
//   lives, levels, weapons, rerolls   handed over right away
//   physDamage, magicDamage   on top of everything else; a hybrid hit gets half of each
//   fireDamage           the same for weapons marked `fire`
//   activeCooldown       share cut from the active skill's cooldown
//   attackPerLevel       damage for each level the hero has
//   thorns               share of an enemy's contact damage it takes itself, as pure damage
//   chestLuck            chance that an elite's chest is one step better
//   secondWind           seconds between saves: a hit that would leave under 20% health is
//                        turned into 2 s of invulnerability
//   killsPerHeal         kills for 1 health back
//   charges, plateArmor  a charge for a shield, or armor for a hero without one
//   cardSlots            more cards on a level-up
//   enemyHp              share of health added to every enemy that arrives from now on
//   echo                 chance that a lasting attack (beam, cone, whirlwind, patch) repeats
const ITEMS = [
  { id: 'vest', name: 'Leather Vest', rarity: 'grey', gives: { vitality: 0.15 }, text: '+15% Vitality' },
  { id: 'boots', name: 'Light Boots', rarity: 'grey', gives: { speed: 0.2 }, text: '+20% Speed' },
  { id: 'quiver', name: 'Spare Quiver', rarity: 'grey', gives: { count: 1 }, text: '+1 Count' },
  { id: 'coin', name: 'Lucky Coin', rarity: 'grey', gives: { critChance: 0.1 }, text: '+10% Crit chance' },
  { id: 'whetstone', name: 'Whetstone', rarity: 'grey', gives: { critDamage: 0.3 }, text: '+30% Crit damage' },
  { id: 'knuckles', name: 'Iron Knuckles', rarity: 'grey', gives: { damage: 0.3 }, text: '+30% Damage' },
  { id: 'filings', name: 'Iron Filings', rarity: 'grey', gives: { magnet: 0.3 }, text: '+30% Magnet' },
  { id: 'mail', name: 'Plated Mail', rarity: 'grey', gives: { armor: 15 }, text: '+15 Armor' },
  { id: 'dice', name: 'Loaded Dice', rarity: 'grey', gives: { rerolls: 2 }, text: '+2 rerolls' },

  { id: 'hide', name: 'Troll Hide', rarity: 'blue', gives: { vitality: 0.15, regen: 0.02 }, text: '+15% Vitality, +2% Health regen per second' },
  { id: 'lens', name: 'Wide Lens', rarity: 'blue', gives: { size: 0.2, haste: 0.1 }, text: '+20% Size, +10% Haste' },
  { id: 'mark', name: "Hunter's Mark", rarity: 'blue', gives: { critChance: 0.1, critDamage: 0.3 }, text: '+10% Crit chance, +30% Crit damage' },
  { id: 'banner', name: 'War Banner', rarity: 'blue', gives: { damage: 0.3, count: 1 }, text: '+30% Damage, +1 Count' },
  { id: 'sand', name: 'Slow Sand', rarity: 'blue', gives: { duration: 0.25 }, text: '+25% Duration' },
  { id: 'oil', name: 'Lamp Oil', rarity: 'blue', gives: { duration: 0.15, size: 0.1 }, text: '+15% Duration, +10% Size' },
  { id: 'thorned', name: 'Thorned Mail', rarity: 'blue', gives: { thorns: 1 }, text: 'An enemy that touches you takes its own contact damage, as pure damage' },
  { id: 'clover', name: 'Four-leaf Clover', rarity: 'blue', gives: { chestLuck: 0.25 }, text: '25% chance that an elite drops a chest one step better' },

  { id: 'bracers', name: "Giant's Bracers", rarity: 'purple', gives: { baseAttack: 50 }, text: '+50 Base attack' },
  { id: 'tome', name: "Scholar's Tome", rarity: 'purple', gives: { xp: 0.25 }, text: '+25% XP' },
  { id: 'heart', name: 'Stone Heart', rarity: 'purple', gives: { baseHp: 300 }, text: '+300 Base health' },
  { id: 'lodestone', name: 'Lodestone', rarity: 'purple', gives: { magnet: 0.5 }, text: '+50% Magnet' },
  { id: 'lesson', name: "Mentor's Lesson", rarity: 'purple', gives: { levels: 3 }, text: '+3 levels right away' },
  { id: 'steel', name: 'Tempered Steel', rarity: 'purple', gives: { physDamage: 0.5 }, text: '+50% to all physical damage' },
  { id: 'focus', name: 'Arcane Focus', rarity: 'purple', gives: { magicDamage: 0.5 }, text: '+50% to all magic damage' },
  { id: 'kindling', name: 'Kindling', rarity: 'purple', gives: { fireDamage: 0.4 }, text: '+40% damage from weapons of fire: fireballs, meteors, flames, trails, tornadoes' },
  { id: 'wind', name: 'Second Wind', rarity: 'purple', gives: { secondWind: 60 }, text: 'Once a minute, a hit that would leave you under 20% Health is cancelled and you cannot be hurt for 2 s' },
  { id: 'fang', name: 'Vampire Fang', rarity: 'purple', gives: { killsPerHeal: 8 }, text: 'Every 8 kills give 1 Health back' },
  { id: 'plate', name: 'Bulwark Plate', rarity: 'purple', gives: { charges: 1, plateArmor: 25 }, text: '+1 charge for a Shield. Without a Shield: +25 Armor' },

  { id: 'edge', name: 'Void Edge', rarity: 'legendary', gives: { pureShare: 0.3 }, text: '30% of all damage becomes pure' },
  { id: 'pact', name: 'Blood Pact', rarity: 'legendary', gives: { hpToAttack: 0.5 }, text: '50% of your Health turns into Base attack' },
  { id: 'feather', name: 'Phoenix Feather', rarity: 'legendary', gives: { lives: 1 }, text: '+1 life. Dying brings you back at full health with a blast of pure damage' },
  { id: 'hourglass', name: 'Hourglass', rarity: 'legendary', gives: { activeCooldown: 0.5 }, text: '-50% Active skill cooldown' },
  { id: 'armory', name: 'Armory Key', rarity: 'legendary', gives: { weapons: 1 }, text: 'An extra weapon right away' },
  { id: 'compass', name: 'Compass', rarity: 'legendary', gives: { cardSlots: 1 }, text: '4 cards on every level-up instead of 3' },
  { id: 'crown', name: 'Cursed Crown', rarity: 'legendary', gives: { xp: 0.4, enemyHp: 0.25 }, text: '+40% XP, but every enemy that arrives from now on has 25% more Health' },
  { id: 'echo', name: 'Echo Stone', rarity: 'legendary', gives: { echo: 0.25 }, text: 'Beams, cones, whirlwinds and burning patches have a 25% chance to repeat half a second later' },
  { id: 'medal', name: "Veteran's Medal", rarity: 'legendary', gives: { attackPerLevel: 0.02 }, text: '+2% damage for each level you have' },
];
