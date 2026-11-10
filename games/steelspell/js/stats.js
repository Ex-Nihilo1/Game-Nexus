// Stats: what the hero and each weapon really get from upgrades, items and levels.

function gearValue(key) { return gear[key] || 0; }

// A bonus counted through soft-cap tiers [[up to, rate], ...]: the part of it inside each
// tier counts at that tier's rate.
function soft(bonus, tiers) {
  if (!tiers) return bonus;
  let out = 0;
  let from = 0;
  for (const [upTo, rate] of tiers) {
    if (bonus <= from) break;
    out += (Math.min(bonus, upTo) - from) * rate;
    from = upTo;
  }
  return out;
}

// What picks, items and Camp upgrades add up to, before the soft cap.
function rawBonus(key) {
  return upgrades[key] * STATS[key].step + gearValue(key) + (metaBonus[key] || 0);
}

function stat(key) {
  const def = STATS[key];
  return def.base + soft(rawBonus(key), def.soft);
}

// What one more pick would really add.
function statGain(key) {
  const def = STATS[key];
  return soft(rawBonus(key) + def.step, def.soft) - soft(rawBonus(key), def.soft);
}

// The rate the next pick counts at, and where that tier began.
function softTier(key) {
  let from = 0;
  for (const [upTo, rate] of STATS[key].soft || []) {
    if (rawBonus(key) < upTo - 1e-9) return { from, rate };
    from = upTo;
  }
  return { from: 0, rate: 1 };
}

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

// Count adds shots only up to COUNT.cap. Past it, every one makes the weapon hit harder.
function shotCount(w) { return 1 + Math.min(COUNT.cap, weaponCount(w)); }

function weaponDamage(w) {
  const spare = Math.max(0, weaponCount(w) - COUNT.cap);
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

// The share of a hit that armor takes off.
function armorCut() { return 1 - 100 / (100 + stat('armor')); }

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
  hero.lives += item.gives.lives || 0;
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
  if (key === 'armor') return `+${Math.round(gain)}`;
  if (key === 'recovery') return `+${gain.toFixed(1)}/s`;
  return `+${+(gain * 100).toFixed(1)}%`;
}

// A line for the card when the stat is past a soft cap, or works in a way worth a word.
function statRemark(key) {
  if (key === 'count') {
    return stat('count') >= COUNT.cap
      ? `Past +${COUNT.cap}: +${Math.round(COUNT.overflow * 100)}% damage instead of a shot`
      : '';
  }
  if (key === 'armor') return `Hits will hurt ${Math.round((1 - 100 / (100 + stat('armor') + STATS.armor.step)) * 100)}% less`;
  if (key === 'critChance' && stat(key) >= 1) return 'Past 100% a crit can land twice';
  const { from, rate } = softTier(key);
  if (rate >= 1) return '';
  return `Past +${Math.round(from * 100)}% a pick gives ${rate === 0.5 ? 'half' : 'a quarter'}`;
}
