// Stats: what the hero and each weapon really get from upgrades, items and levels.

function gearValue(key) { return gear[key] || 0; }

// What `picks` picks of a stat add: the first STRONG_PICKS a full step each, the rest `weak`.
function pickBonus(key, picks = upgrades[key]) {
  const def = STATS[key];
  const strong = Math.min(picks, STRONG_PICKS);
  return strong * def.step + (picks - strong) * (def.weak !== undefined ? def.weak : def.step);
}

// What items and Camp upgrades add, on top of the picks.
function extraBonus(key) { return gearValue(key) + (metaBonus[key] || 0); }

function stat(key) {
  return STATS[key].base + pickBonus(key) + extraBonus(key);
}

// What one more pick would add.
function statGain(key) { return pickBonus(key, upgrades[key] + 1) - pickBonus(key); }

// The Count card stops coming once the picks reach the cap.
function canPick(key) { return key !== 'count' || upgrades.count < COUNT.cap; }

// What a weapon really gets: stats it does not list stay neutral, whatever the hero has.
function weaponStat(w, key) {
  const def = STATS[key];
  if (!w.cfg.scales.includes(key)) return def.off !== undefined ? def.off : def.base;
  const value = stat(key);
  const buff = berserkLeft > 0 ? BERSERK.buff[key] : undefined;
  if (buff === undefined) return value;
  return key === 'haste' || key === 'count' ? value + buff : value * buff;
}

// ---- A weapon's own numbers: the stats it reads, and what its levels add on top ----

function weaponCount(w) { return Math.floor(weaponStat(w, 'count') + w.bonus.count); }

// Every Count is one more shot, with no limit. A weapon marked `single` (Nuke) never fires
// more than one: its Count makes it hit harder instead.
function shotCount(w) { return w.cfg.single ? 1 : 1 + weaponCount(w); }

function weaponDamage(w) {
  const spare = w.cfg.single ? weaponCount(w) : 0;
  return weaponStat(w, 'damage') * (1 + w.bonus.damage) * (1 + spare * COUNT.overflow);
}

function weaponSize(w) { return weaponStat(w, 'size') * (1 + w.bonus.size); }

function weaponDuration(w) { return weaponStat(w, 'duration') * (1 + w.bonus.duration); }

// Haste makes a weapon fire that much more often, so a cooldown never reaches zero.
function cooldownOf(w) { return w.cfg.cooldown / (1 + weaponStat(w, 'haste') + w.bonus.haste); }

function setCooldown(w, seconds) {
  w.timer = seconds;
  w.full = seconds;
}

// How many times over a hit crits. Past 100% one crit is certain and the rest of the chance
// rolls for a second one, and so on: each adds the crit bonus once more.
function critTiers(w) {
  const chance = weaponStat(w, 'critChance');
  return Math.floor(chance) + (rand() < chance % 1 ? 1 : 0);
}

// What every weapon's listed damage is multiplied by, whatever its type: the base attack
// against the standard 100, and what the hero's level adds (Veteran's Medal).
function attackMult() {
  return hero.baseAttack / HERO.attack * (1 + gearValue('attackPerLevel') * level);
}

// Items that favor one damage type, on top of everything else.
function kindBonus(kind) {
  if (kind === 'phys') return 1 + gearValue('physDamage');
  if (kind === 'magic') return 1 + gearValue('magicDamage');
  if (kind === 'hybrid') return 1 + (gearValue('physDamage') + gearValue('magicDamage')) / 2;
  return 1;
}

// ---- The hero ----

function magnetRadius() { return HERO.magnet * stat('magnet'); }

function activeCooldown() { return activeDef.cooldown * (1 - gearValue('activeCooldown')); }

// Bulwark Plate is armor only for a hero who carries no shield.
function heroArmor() { return stat('armor') + (chargedWeapon() ? 0 : gearValue('plateArmor')); }

// The share of a hit that armor takes off.
function armorCut() { return 1 - 100 / (100 + heroArmor()); }

function maxCharges(w) { return w.cfg.charges + gearValue('charges'); }

// Items that favor weapons of fire.
function fireBonus(w) { return w.def.fire ? 1 + gearValue('fireDamage') : 1; }

function levelHealth() { return HP_PER_LEVEL * (level - 1); }

// Max health and base attack both depend on items, as Blood Pact moves one into the other.
// Health gained comes filled in; health lost only cuts what no longer fits.
function refreshHero() {
  const total = (HERO.hp + gearValue('baseHp') + levelHealth()) * stat('vitality');
  const moved = total * gearValue('hpToAttack');
  const before = hero.maxHp;
  hero.maxHp = Math.round(total - moved);
  hero.baseAttack = HERO.attack + gearValue('baseAttack') + moved;
  hero.hp = Math.min(hero.maxHp, hero.hp + Math.max(0, hero.maxHp - before));
}

function takeItem(item) {
  items.push(item);
  for (const key of Object.keys(item.gives)) gear[key] = gearValue(key) + item.gives[key];
  if (item.gives.pocketMagnet) pocketLeft = item.gives.pocketMagnet;
  hero.lives += item.gives.lives || 0;
  rerolls += item.gives.rerolls || 0;
  for (let i = 0; i < (item.gives.levels || 0); i++) addLevel();
  for (let i = 0; i < (item.gives.weapons || 0); i++) queue.push('weapon');
  activeCd = Math.min(activeCd, activeCooldown());
  refreshHero();
}

// ---- Stats as text ----

function formatStat(key, value) {
  if (key === 'count') return `+${value}`;
  if (key === 'haste') return `+${Math.round(value * 100)}%`;
  if (key === 'armor') return String(Math.round(value));
  if (key === 'recovery') return `${value.toFixed(1)}/s`;
  return `${Math.round(value * 100)}%`;
}

// What the next pick adds, as the card shows it.
function gainText(key) {
  const gain = statGain(key);
  if (key === 'count') return '+1';
  if (key === 'armor') return `+${+gain.toFixed(1)}`;
  if (key === 'recovery') return `+${+gain.toFixed(2)}/s`;
  return `+${+(gain * 100).toFixed(1)}%`;
}

// A line for the card: which pick this is, and what is worth a word.
function statRemark(key) {
  const picks = upgrades[key];
  if (key === 'count') return `Shot ${picks + 1} of ${COUNT.cap} from cards. Items and weapon levels add more`;
  const parts = [picks < STRONG_PICKS ? `Strong pick ${picks + 1} of ${STRONG_PICKS}` : `Weak pick: the ${STRONG_PICKS} strong ones are taken`];
  if (key === 'armor') parts.push(`Hits will hurt ${Math.round((1 - 100 / (100 + heroArmor() + statGain('armor'))) * 100)}% less`);
  if (key === 'critChance' && stat(key) >= 1) parts.push('Past 100% a crit can land twice');
  return parts.join(' · ');
}

// A bonus as the stats window shows it.
function bonusText(key, value) {
  if (key === 'count') return `+${value}`;
  if (key === 'armor') return `+${+value.toFixed(1)}`;
  if (key === 'recovery') return `+${+value.toFixed(2)}/s`;
  return `+${+(value * 100).toFixed(1)}%`;
}
