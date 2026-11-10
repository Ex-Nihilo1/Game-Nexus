// Levels, orbs, chests and the cards to pick from.

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

function furthestFromHero(list) {
  const away = o => Math.hypot(o.x - hero.x, o.y - hero.y);
  return list.reduce((a, b) => (away(b) > away(a) ? b : a));
}

// Ahead of the hero, where nothing stands yet, so there is XP to reach even when nothing dies.
// When the map is full, the orb furthest from the hero moves here with all it holds.
function dropWildOrb() {
  const a = Math.atan2(hero.faceY, hero.faceX) + (rand() - 0.5) * 2.4;
  const d = 160 + rand() * 240;
  const x = hero.x + Math.cos(a) * d;
  const y = hero.y + Math.sin(a) * d;
  const value = Math.max(1, xpNext * WILD_ORB.share);
  if (orbs.length < MAX_ORBS) {
    dropOrb(x, y, value);
    return;
  }
  const far = furthestFromHero(orbs);
  far.x = x;
  far.y = y;
  far.value += value;
  far.pulled = false;
}

// When the map is full, the red orb furthest from the hero moves here.
function dropRedOrb(x, y) {
  if (redOrbs.length < RED_ORB.max) {
    redOrbs.push({ x, y, pulled: false, dead: false });
    return;
  }
  const far = furthestFromHero(redOrbs);
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

// An orb left far behind comes back ahead of the hero: walking always turns up XP, and none
// is lost for good.
function updateOrbs(dt) {
  const far = recycleDistance();
  for (const o of orbs) {
    const dx = hero.x - o.x;
    const dy = hero.y - o.y;
    if (dx * dx + dy * dy > far * far) {
      o.x = hero.x + dx * 0.8;
      o.y = hero.y + dy * 0.8;
      continue;
    }
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
      type: 'stat',
      key: o.key,
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
      type: 'weapon',
      id: d.id,
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
    type: 'item',
    id: item.id,
    kind: item.rarity,
    tag: RARITIES[item.rarity].name,
    name: item.name,
    value: '',
    note: item.text,
    pick: () => takeItem(item),
  };
}
