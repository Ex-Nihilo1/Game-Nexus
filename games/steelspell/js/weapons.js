// Weapons: levels, evolutions, merges, and the loop that fires them. What each weapon does
// is in attacks.js (the ones on a cooldown) and auras.js (the ones that are always on).

function owned(id) { return hero.weapons.find(w => w.def.id === id); }
function chargedWeapon() { return hero.weapons.find(w => w.def.charges); }

// ---- Levels and evolutions ----

// Changes one number of a weapon. `path` may reach into a nested table ('crater.life').
function patchCfg(cfg, path, change) {
  const keys = path.split('.');
  let node = cfg;
  for (const key of keys.slice(0, -1)) node = node[key] = Object.assign({}, node[key]);
  const last = keys[keys.length - 1];
  node[last] = change(node[last]);
}

function applyStep(w, step) {
  for (const key of Object.keys(w.bonus)) w.bonus[key] += step[key] || 0;
  for (const [path, value] of Object.entries(step.add || {})) patchCfg(w.cfg, path, old => (old || 0) + value);
  for (const [path, value] of Object.entries(step.mul || {})) patchCfg(w.cfg, path, old => old * value);
  for (const [path, value] of Object.entries(step.set || {})) patchCfg(w.cfg, path, () => value);
  if (step.reads) w.cfg.scales = [...new Set([...w.cfg.scales, ...step.reads])];
}

// The step that takes a weapon to level `lv`.
function levelStep(def, lv) {
  const slot = LEVEL_PLAN[lv - 2];
  if (slot === 'a') return def.ups[0];
  if (slot === 'b') return def.ups[1];
  return def[`lv${lv}`] || slot;
}

function evolutionOf(w) {
  return (EVOLUTIONS[w.def.id] || []).find(evo => evo.id === w.evo);
}

// What a merged weapon keeps from the evolutions of the weapons it was made of: `parts` is
// [{ id, evo }], and each evolution's `inherit` for this merge is a step.
function inheritedSteps(mergeId, parts = []) {
  return parts.map(part => {
    const evo = (EVOLUTIONS[part.id] || []).find(e => e.id === part.evo);
    const step = evo && evo.inherit && evo.inherit[mergeId];
    return step ? { evo, step } : null;
  }).filter(Boolean);
}

// `cfg` is the weapon's own numbers and `bonus` what it adds to the stats it reads: both are
// built again from the tables whenever the level or the evolution changes.
function rebuildWeapon(w) {
  w.cfg = Object.assign({}, w.def);
  for (const key of Object.keys(w.bonus)) w.bonus[key] = 0;
  for (let lv = 2; lv <= w.level; lv++) applyStep(w, levelStep(w.def, lv));
  if (w.def.bonus) applyStep(w, w.def.bonus); // a merged weapon has no levels: it comes with what they would add
  for (const { step } of inheritedSteps(w.def.id, w.parts)) applyStep(w, step);
  const evo = evolutionOf(w);
  if (evo) applyStep(w, evo);
}

function canLevel(w) { return !w.def.needs && w.level < MAX_WEAPON_LEVEL; }

function setWeaponLevel(w, lv) {
  w.level = Math.min(MAX_WEAPON_LEVEL, lv);
  rebuildWeapon(w);
}

// At the last level the very next choice is the evolution.
function levelUpWeapon(w) {
  setWeaponLevel(w, w.level + 1);
  if (w.level === MAX_WEAPON_LEVEL && EVOLUTIONS[w.def.id]) queue.unshift(`evolve:${w.def.id}`);
}

function evolveWeapon(w, branch) {
  w.evo = EVOLUTIONS[w.def.id][branch].id;
  rebuildWeapon(w);
}

function signedShare(share) { return `${share > 0 ? '+' : ''}${Math.round(share * 100)}%`; }

// What a step does, as the card says it.
function stepText(step) {
  const parts = step.text ? [step.text] : [];
  for (const key of ['damage', 'size', 'haste', 'duration']) {
    if (step[key]) parts.push(`${STATS[key].name} ${signedShare(step[key])}`);
  }
  if (step.count && !step.text) parts.push(`+${step.count} count`);
  return parts.join(', ');
}

// The name a weapon goes by: its evolution's, once it has one. A merged one names what it kept.
function weaponName(w) {
  const evo = evolutionOf(w);
  if (evo) return evo.name;
  const kept = inheritedSteps(w.def.id, w.parts).map(x => x.evo.name);
  return kept.length ? `${w.def.name} (${kept.join(', ')})` : w.def.name;
}

function newWeapon(id) {
  const def = WEAPON_DEFS.find(d => d.id === id);
  const w = {
    def, cfg: def, level: def.needs ? 0 : 1, evo: '', parts: [], bonus: { damage: 0, size: 0, haste: 0, duration: 0, count: 0 },
    timer: 0.3, full: 1, dealt: 0, pulse: 0.3,
  };
  rebuildWeapon(w);
  if (def.charges) {
    w.charges = 1;
    setCooldown(w, cooldownOf(w));
  }
  if (id === 'phase') {
    w.locked = false;
    setCooldown(w, cooldownOf(w));
  }
  if (def.push) {
    w.angle = Math.atan2(hero.faceY, hero.faceX);
    w.thrust = 0;
  }
  return w;
}

function addWeapon(id) {
  hero.weapons.push(newWeapon(id));
}

// ---- Merges ----

function fullyGrown(w) {
  return !!w && w.level >= MAX_WEAPON_LEVEL && (!!w.evo || !EVOLUTIONS[w.def.id]);
}

// Two weapons can merge once both are at the last level and evolved.
function readyMerges() {
  return SYNERGIES.filter(s => s.needs.every(id => fullyGrown(owned(id))));
}

// The merge a weapon would take part in with something the hero already has.
function synergyPartner(id) {
  return SYNERGIES.find(s => s.needs.includes(id) && s.needs.some(n => n !== id && owned(n)));
}

// The two weapons leave, the merged one arrives at full strength, and the freed slot is
// filled right away: the next choice is a new weapon.
function mergeWeapons(merge) {
  const parts = merge.needs.map(owned);
  const w = newWeapon(merge.id);
  w.parts = parts.map(part => ({ id: part.def.id, evo: part.evo }));
  rebuildWeapon(w);
  for (const part of parts) {
    w.dealt += part.dealt;
    if (part.charges !== undefined) w.charges = Math.min(part.charges, maxCharges(w));
  }
  hero.weapons = hero.weapons.filter(o => !parts.includes(o));
  hero.weapons.push(w);
  merges++;
  queue.unshift('weapon');
  say(`Merged: ${merge.name}!`);
}

// ---- The loop ----

function updateWeapons(dt) {
  for (const w of hero.weapons) {
    const tick = TICK[w.def.id];
    if (tick) {
      tick(w, dt);
      continue;
    }
    w.timer -= dt;
    if (w.timer > 0) continue;
    if (!FIRE[w.def.id](w)) {
      w.timer = 0;
      continue;
    }
    setCooldown(w, cooldownOf(w));
    // Echo Stone: a lasting attack may come again half a second later.
    if (w.def.lasting && gearValue('echo') && rand() < gearValue('echo')) later(0.5, () => FIRE[w.def.id](w));
  }
}
