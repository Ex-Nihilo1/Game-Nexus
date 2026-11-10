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
function hit(e, w, base, kind = w.def.kind) {
  if (e.dead) return;
  const crits = critTiers(w);
  let amount = base * weaponDamage(w) * attackMult() * kindBonus(kind);
  if (crits) amount *= 1 + (weaponStat(w, 'critDamage') - 1) * crits;
  hurtEnemy(e, amount, kind, crits > 0, w);
}

function hurtEnemy(e, amount, kind, crit, w) {
  const armor = armorFactor(e, kind);
  const factor = armor + (1 - armor) * gearValue('pureShare');
  const dealt = amount * factor;
  e.hp -= dealt;
  e.flash = 0.08;
  if (w) w.dealt += dealt;
  addNumber(e, dealt, kind, crit, factor);
  if (e.hp <= 0 && !e.dead) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  kills++;
  dropOrb(e.x, e.y, e.def.xp);
  if (!e.def.elite) return;
  chests.push({ x: e.x, y: e.y, type: pickWeighted(CHEST_ROLL), dead: false });
  for (let i = 0; i < RED_ORB.eliteDrop; i++) {
    const a = rand() * TAU;
    dropRedOrb(e.x + Math.cos(a) * 34, e.y + Math.sin(a) * 34);
  }
}

function slow(e, by, seconds) {
  e.slowBy = e.def.elite ? by / 2 : by;
  e.slowLeft = Math.max(e.slowLeft, seconds);
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

function strikeChain(first, w) {
  const d = w.cfg;
  const struck = new Set([first]);
  const points = [{ x: hero.x, y: hero.y }, { x: first.x, y: first.y }];
  let from = first;
  let amount = d.damage;
  hit(first, w, amount);
  for (let i = 0; i < d.jumps; i++) {
    const next = nearestEnemies(from.x, from.y, d.jumpRange, 1, struck)[0];
    if (!next) break;
    amount *= d.falloff;
    hit(next, w, amount);
    struck.add(next);
    points.push({ x: next.x, y: next.y });
    from = next;
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

// A zone gets exactly life / tick ticks, so its total damage is what the table promises.
function addZone(o) {
  zones.push(Object.assign({ ticksLeft: Math.round(o.life / o.tick), dead: false }, o));
}

function updateZones(dt) {
  for (const z of zones) {
    z.life -= dt;
    z.timer -= dt;
    if (z.timer <= 0 && z.ticksLeft > 0) {
      z.timer += z.tick;
      z.ticksLeft--;
      eachEnemyNear(z.x, z.y, z.r, z.apply);
    }
    if (z.life <= 0) z.dead = true;
  }
  sweep(zones);
}
