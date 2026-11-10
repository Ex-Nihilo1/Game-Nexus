// Stats: what the hero and each weapon really get from upgrades and items.

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

function shotCount(w) { return 1 + Math.floor(weaponStat(w, 'count')); }

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
