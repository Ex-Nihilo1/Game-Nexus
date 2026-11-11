// Damage, shots and zones.

// ---- Damage ----

function armorFactor(e, kind) {
  if (kind === 'phys') return 1 - e.def.armor;
  if (kind === 'magic') return 1 - e.def.ward;
  if (kind === 'hybrid') return 1 - (e.def.armor + e.def.ward) / 2;
  return 1; // pure damage ignores both
}

// One hit from a weapon: base damage, then stats, crit, and the enemy's armor. `kind` only
// says which armor it meets: the upgrades it uses are always those of the weapon itself.
// `dot` marks damage over time: its numbers are shown summed up, a few times a second.
function hit(e, w, base, kind = w.def.kind, dot = false) {
  if (e.dead) return;
  const crits = critTiers(w);
  let amount = base * weaponDamage(w) * attackMult() * kindBonus(kind) * fireBonus(w);
  if (crits) amount *= 1 + (weaponStat(w, 'critDamage') - 1) * crits;
  hurtEnemy(e, amount, kind, crits > 0, w, dot);
}

function hurtEnemy(e, amount, kind, crit, w, dot = false) {
  const armor = armorFactor(e, kind);
  const factor = armor + (1 - armor) * gearValue('pureShare');
  const dealt = amount * factor;
  e.hp -= dealt;
  e.flash = 0.08;
  if (w) w.dealt += dealt;
  if (dot) {
    e.dotSum = (e.dotSum || 0) + dealt;
    if (elapsed >= (e.dotAt || 0)) {
      addNumber(e, e.dotSum, kind, false, factor);
      e.dotSum = 0;
      e.dotAt = elapsed + DOT_NUMBER_EVERY;
    }
  } else {
    addNumber(e, dealt, kind, crit, factor);
  }
  if (e.hp <= 0 && !e.dead) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  kills++;
  dropOrb(e.x, e.y, e.def.xp);
  if (gearValue('killsPerHeal') && kills % gearValue('killsPerHeal') === 0) hero.hp = Math.min(hero.maxHp, hero.hp + 1);
  if (!e.def.elite) {
    if (rand() < MAGNET.dropChance) dropMagnet(e.x, e.y);
    return;
  }
  elitesKilled++;
  dropMagnet(e.x + 30, e.y);
  chests.push({ x: e.x, y: e.y, type: luckyChest(pickWeighted(CHEST_ROLL)), dead: false });
  for (let i = 0; i < RED_ORB.eliteDrop; i++) {
    const a = rand() * TAU;
    dropRedOrb(e.x + Math.cos(a) * 34, e.y + Math.sin(a) * 34);
  }
}

// Four-leaf Clover: now and then a chest comes one step better.
function luckyChest(type) {
  if (!gearValue('chestLuck') || rand() >= gearValue('chestLuck')) return type;
  return type === 'common' ? 'rare' : 'legendary';
}

function slow(e, by, seconds) {
  e.slowBy = e.def.elite ? by / 2 : by;
  e.slowLeft = Math.max(e.slowLeft, seconds);
}

// Elites cannot be frozen.
function freeze(e, seconds) {
  if (!e.def.elite) e.freezeLeft = Math.max(e.freezeLeft || 0, seconds);
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

// `boost` multiplies the whole chain; a boosted chain loses nothing from jump to jump.
function strikeChain(first, w, boost = 1) {
  const d = w.cfg;
  const struck = new Set([first]);
  const points = [{ x: hero.x, y: hero.y }, { x: first.x, y: first.y }];
  const falloff = boost > 1 ? 1 : d.falloff;
  let from = first;
  let amount = d.damage * boost;
  hit(first, w, amount);
  for (let i = 0; i < d.jumps; i++) {
    const next = nearestEnemies(from.x, from.y, d.jumpRange, 1, struck)[0];
    if (!next) break;
    amount *= falloff;
    hit(next, w, amount);
    struck.add(next);
    points.push({ x: next.x, y: next.y });
    // Overcharge: the bolt may fork to one more enemy nearby.
    const side = d.fork && rand() < d.fork ? nearestEnemies(next.x, next.y, d.jumpRange, 1, struck)[0] : null;
    if (side) {
      hit(side, w, amount);
      struck.add(side);
      addFx({ type: 'bolt', points: jagged([next, side]), life: 0.16, pen: d.pen });
    }
    from = next;
  }
  if (d.ward) {
    for (let i = 1; i < points.length; i++) eraseShotsOnLine(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, 12);
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

// A zone hurts what is inside it every `tick`, and gets exactly life / tick ticks, so its
// total damage is what the table promises. It is a circle that stays put unless it has
// `each(z, fn)` (its own shape), `move(z, dt)` or `end(z)`.
function addZone(o) {
  if (zones.length >= MAX_ZONES) {
    const oldest = zones.find(z => !z.dead && (z.look === 'trail' || z.look === 'fire')) || zones.find(z => !z.dead);
    if (oldest) oldest.dead = true;
  }
  const z = Object.assign({ ticksLeft: Math.round(o.life / o.tick), age: 0, dead: false }, o);
  zones.push(z);
  return z;
}

function updateZones(dt) {
  for (const z of zones) {
    if (z.dead) continue;
    z.life -= dt;
    z.age += dt;
    z.timer -= dt;
    if (z.move) z.move(z, dt);
    if (z.timer <= 0 && z.ticksLeft > 0) {
      z.timer += z.tick;
      z.ticksLeft--;
      if (z.each) z.each(z, z.apply);
      else eachEnemyNear(z.x, z.y, z.r, z.apply);
    }
    if (z.life <= 0) {
      z.dead = true;
      if (z.end) z.end(z);
    }
  }
  sweep(zones);
}

// ---- Burning enemies ----

// Sets an enemy on fire: `damage` every BURN_TICK for `seconds`. With `stacks` above 1,
// lighting it again adds a stack, up to that many. With `spread`, it lights up to two
// neighbors within that range on every tick; those do not spread it further.
function ignite(e, w, damage, seconds, stacks = 1, spread = 0) {
  if (!e.burn) e.burn = { left: 0, stacks: 0, timer: BURN_TICK };
  const b = e.burn;
  b.w = w;
  b.damage = damage;
  b.spread = spread;
  b.left = Math.max(b.left, seconds);
  b.stacks = Math.min(stacks, b.stacks + 1);
}

function updateBurns(dt) {
  for (const e of enemies) {
    const b = e.burn;
    if (!b || e.dead) continue;
    b.left -= dt;
    b.timer -= dt;
    if (b.timer <= 0) {
      b.timer += BURN_TICK;
      hit(e, b.w, b.damage * b.stacks, undefined, true);
      let lit = 0;
      if (b.spread) {
        eachEnemyNear(e.x, e.y, b.spread, o => {
          if (o !== e && !o.burn && lit++ < 2) ignite(o, b.w, b.damage, b.left + BURN_TICK);
        });
      }
    }
    if (b.left <= 0) e.burn = null;
  }
}

// ---- Enemy shots: the ways weapons take them out of the air ----

function eraseEnemyShots(x, y, r) {
  for (const s of enemyShots) {
    const reach = r + s.r;
    if ((s.x - x) ** 2 + (s.y - y) ** 2 < reach * reach) s.dead = true;
  }
}

function eraseShotsOnLine(x0, y0, x1, y1, halfWidth) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length2 = dx * dx + dy * dy || 1;
  for (const s of enemyShots) {
    const t = Math.max(0, Math.min(1, ((s.x - x0) * dx + (s.y - y0) * dy) / length2));
    const reach = halfWidth + s.r;
    if ((s.x - x0 - dx * t) ** 2 + (s.y - y0 - dy * t) ** 2 < reach * reach) s.dead = true;
  }
}

// Shots inside an oval, as `lanceOval` gives it.
function eraseShotsInOval(o) {
  const cos = Math.cos(o.a);
  const sin = Math.sin(o.a);
  for (const s of enemyShots) {
    const dx = s.x - o.x;
    const dy = s.y - o.y;
    const along = (dx * cos + dy * sin) / o.long;
    const across = (dy * cos - dx * sin) / o.wide;
    if (along * along + across * across < 1) s.dead = true;
  }
}

// Parry Blade: shots inside the swing fly back the way they came, as the hero's own.
function parryEnemyShots(w, angle, half, reach) {
  for (const s of enemyShots) {
    const dx = s.x - hero.x;
    const dy = s.y - hero.y;
    if (s.dead || dx * dx + dy * dy > (reach + s.r) ** 2 || angleGap(Math.atan2(dy, dx), angle) > half) continue;
    s.dead = true;
    launch({
      look: 'ball', pen: w.cfg.pen, x: s.x, y: s.y, a: Math.atan2(-s.vy, -s.vx), speed: Math.hypot(s.vx, s.vy) * 1.5,
      r: s.r, life: 1.2, onHit: (shot, e) => hit(e, w, w.cfg.damage),
    });
  }
}
