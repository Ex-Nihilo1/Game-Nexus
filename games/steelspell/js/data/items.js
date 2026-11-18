// Tuning: chests and the items in them.

const RARITIES = {
  grey: { pen: 'ink-muted' },
  blue: { pen: 'blue-pen' },
  purple: { pen: 'violet' },
  legendary: { pen: 'highlighter' },
};

// A chest first rolls its own rarity by CHEST_ROLL (a Stash chest skips that), then each of
// its slots rolls an item rarity by `odds` and takes an item the hero does not have yet.
const CHEST_SLOTS = 3;
const CHEST_ROLL = { common: 60, rare: 30, legendary: 10 };
const CHESTS = {
  common: { pen: 'ink-muted', odds: { grey: 65, blue: 25, purple: 10 } },
  rare: { pen: 'blue-pen', odds: { grey: 25, blue: 50, purple: 20, legendary: 5 } },
  legendary: { pen: 'highlighter', odds: { purple: 75, legendary: 25 } },
  stash: { pen: 'green-ink', odds: { grey: 50, blue: 30, purple: 15 } }, // never a legendary
};

// To add an item, add a row here and its name and text to lang/en.json (items.<id>); the text
// takes its numbers from `gives`. In `gives`, the keys of STATS add to that stat on top of the
// picks, at full value. The other keys:
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
//   secondWind           seconds between saves (see SECOND_WIND)
//   killsPerHeal         kills for 1 health back
//   charges, plateArmor  a charge for a shield, or armor for a hero without one
//   cardSlots            more cards on a level-up
//   enemyHp              share of health added to every enemy that arrives from now on
//   echo                 chance that a lasting attack (beam, cone, whirlwind, patch) repeats
//   ricochet             share of a gun's bullet damage that bounces on to one more enemy
//   armorPen, magicPen   flat penetration: armor (ward) taken off before a physical (magic) hit;
//                        past zero the hit does more
//   armorPenPct, magicPenPct   the same as a share of the target's armor (ward)
//   weakSpot             every WEAK_SPOT.every-th hit on one enemy makes it take this much more damage
//   pocketMagnet         seconds between pulls of every XP orb on the map
const ITEMS = [
  { id: 'vest', rarity: 'grey', gives: { vitality: 0.15 } },
  { id: 'boots', rarity: 'grey', gives: { speed: 0.2 } },
  { id: 'quiver', rarity: 'grey', gives: { count: 1 } },
  { id: 'coin', rarity: 'grey', gives: { critChance: 0.1 } },
  { id: 'whetstone', rarity: 'grey', gives: { critDamage: 0.3 } },
  { id: 'knuckles', rarity: 'grey', gives: { damage: 0.3 } },
  { id: 'filings', rarity: 'grey', gives: { magnet: 0.3 } },
  { id: 'mail', rarity: 'grey', gives: { armor: 15 } },
  { id: 'dice', rarity: 'grey', gives: { rerolls: 2 } },

  { id: 'hide', rarity: 'blue', gives: { vitality: 0.15, regen: 0.02 } },
  { id: 'lens', rarity: 'blue', gives: { size: 0.2, haste: 0.1 } },
  { id: 'mark', rarity: 'blue', gives: { critChance: 0.1, critDamage: 0.3 } },
  { id: 'banner', rarity: 'blue', gives: { damage: 0.3, count: 1 } },
  { id: 'sand', rarity: 'blue', gives: { duration: 0.25 } },
  { id: 'oil', rarity: 'blue', gives: { duration: 0.15, size: 0.1 } },
  { id: 'piercer', rarity: 'blue', gives: { armorPen: 30 } },
  { id: 'needle', rarity: 'blue', gives: { magicPen: 30 } },
  { id: 'thorned', rarity: 'blue', gives: { thorns: 1 } },
  { id: 'clover', rarity: 'blue', gives: { chestLuck: 0.25 } },

  { id: 'bracers', rarity: 'purple', gives: { baseAttack: 50 } },
  { id: 'tome', rarity: 'purple', gives: { xp: 0.25 } },
  { id: 'heart', rarity: 'purple', gives: { baseHp: 300 } },
  { id: 'lodestone', rarity: 'purple', gives: { magnet: 0.5 } },
  { id: 'lesson', rarity: 'purple', gives: { levels: 3 } },
  { id: 'steel', rarity: 'purple', gives: { physDamage: 0.5 } },
  { id: 'focus', rarity: 'purple', gives: { magicDamage: 0.5 } },
  { id: 'kindling', rarity: 'purple', gives: { fireDamage: 0.4 } },
  { id: 'wind', rarity: 'purple', gives: { secondWind: 60 } },
  { id: 'fang', rarity: 'purple', gives: { killsPerHeal: 8 } },
  { id: 'siege', rarity: 'purple', gives: { armorPenPct: 0.3 } },
  { id: 'hexlens', rarity: 'purple', gives: { magicPenPct: 0.3 } },
  { id: 'weakspot', rarity: 'purple', gives: { weakSpot: 0.25 } },
  { id: 'rubber', rarity: 'purple', gives: { ricochet: 0.6 } },
  { id: 'plate', rarity: 'purple', gives: { charges: 1, plateArmor: 25 } },

  { id: 'edge', rarity: 'legendary', gives: { pureShare: 0.3 } },
  { id: 'pact', rarity: 'legendary', gives: { hpToAttack: 0.5 } },
  { id: 'feather', rarity: 'legendary', gives: { lives: 1 } },
  { id: 'hourglass', rarity: 'legendary', gives: { activeCooldown: 0.5 } },
  { id: 'armory', rarity: 'legendary', gives: { weapons: 1 } },
  { id: 'compass', rarity: 'legendary', gives: { cardSlots: 1 } },
  { id: 'crown', rarity: 'legendary', gives: { xp: 0.4, enemyHp: 0.25 } },
  { id: 'echo', rarity: 'legendary', gives: { echo: 0.25 } },
  { id: 'pocket', rarity: 'legendary', gives: { pocketMagnet: 60 } },
  { id: 'medal', rarity: 'legendary', gives: { attackPerLevel: 0.02 } },
];

// The Camp: upgrades bought with Glory that stay between runs. Rank n costs `cost` times n.
// `gives` is a STATS key (added to that stat on top of the picks, like items), or rerolls, lives,
// or glory (a share on top of the Glory a run earns).
const META_UPGRADES = [
  { id: 'vitality', gives: 'vitality', amount: 0.04, ranks: 5, cost: 40 },
  { id: 'might', gives: 'damage', amount: 0.03, ranks: 5, cost: 50 },
  { id: 'haste', gives: 'haste', amount: 0.03, ranks: 3, cost: 60 },
  { id: 'swiftness', gives: 'speed', amount: 0.03, ranks: 3, cost: 40 },
  { id: 'reach', gives: 'magnet', amount: 0.15, ranks: 3, cost: 30 },
  { id: 'rerolls', gives: 'rerolls', amount: 1, ranks: 3, cost: 60 },
  { id: 'plating', gives: 'armor', amount: 4, ranks: 3, cost: 50 },
  { id: 'greed', gives: 'glory', amount: 0.1, ranks: 3, cost: 80 },
  { id: 'revival', gives: 'lives', amount: 1, ranks: 1, cost: 600 },
];
