// What each weapon does.

function owned(id) { return hero.weapons.find(w => w.def.id === id); }
function chargedWeapon() { return hero.weapons.find(w => w.def.charges); }

function newWeapon(id) {
  const def = WEAPON_DEFS.find(d => d.id === id);
  const w = { def, timer: 0.3, full: 1, dealt: 0, pulse: 0.3 };
  if (def.charges) {
    w.charges = 1;
    setCooldown(w, cooldownOf(w));
  }
  if (id === 'phase') {
    w.locked = false;
    setCooldown(w, cooldownOf(w));
  }
  if (id === 'spear' || id === 'radiantlance') {
    w.angle = Math.atan2(hero.faceY, hero.faceX);
    w.thrust = 0;
  }
  return w;
}

function addWeapon(id) {
  hero.weapons.push(newWeapon(id));
  const merge = SYNERGIES.find(s => s.needs.every(owned));
  if (!merge) return;
  const parts = merge.needs.map(owned);
  const w = newWeapon(merge.id);
  for (const part of parts) {
    w.dealt += part.dealt;
    if (part.charges !== undefined) w.charges = part.charges;
  }
  hero.weapons = hero.weapons.filter(o => !parts.includes(o));
  hero.weapons.push(w);
  say(`Synergy: ${merge.name}!`);
}

// ---- Weapons: attacks that fire on a cooldown ----

function launch(o) {
  shots.push(Object.assign({
    x: hero.x, y: hero.y, vx: Math.cos(o.a) * o.speed, vy: Math.sin(o.a) * o.speed,
    hits: new Set(), pierce: 1, dead: false,
  }, o));
}

function aimAt(target) { return Math.atan2(target.y - hero.y, target.x - hero.x); }

function moveBoomerang(s, dt) {
  s.spin += 14 * dt;
  if (!s.back) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.flown += s.speed * dt;
    if (s.flown >= s.range) {
      s.back = true;
      s.hits.clear(); // everything can be hit again on the way back
    }
    return;
  }
  const dx = hero.x - s.x;
  const dy = hero.y - s.y;
  const d = Math.hypot(dx, dy) || 1;
  if (d < 18) {
    s.dead = true;
    return;
  }
  const pace = s.speed * s.returnBoost;
  s.x += dx / d * pace * dt;
  s.y += dy / d * pace * dt;
}

function throwBoomerangs(w, onHit) {
  const d = w.def;
  const target = nearestEnemies(hero.x, hero.y, AIM_RANGE, 1)[0];
  if (!target) return false;
  const n = shotCount(w);
  const aim = aimAt(target);
  for (let i = 0; i < n; i++) {
    launch({
      look: 'boomerang', pen: d.pen, a: aim + (i - (n - 1) / 2) * d.spread,
      speed: d.speed, r: d.r * weaponStat(w, 'size'), life: Infinity, pierce: Infinity,
      range: d.range, returnBoost: d.returnBoost, flown: 0, back: false, spin: 0, move: moveBoomerang, onHit,
    });
  }
  return true;
}

function swing(w, angle, reach) {
  const half = w.def.arc / 2;
  eachEnemyNear(hero.x, hero.y, reach, e => {
    if (angleGap(aimAt(e), angle) <= half) hit(e, w, w.def.damage);
  });
  addFx({ type: 'swing', a: angle, span: w.def.arc, r: reach, life: 0.16, pen: w.def.pen });
}

function fallMeteor(w, x, y) {
  const d = w.def;
  const radius = d.radius * weaponStat(w, 'size');
  addFx({ type: 'telegraph', x, y, r: radius, life: d.delay, pen: d.pen });
  later(d.delay, () => {
    explode(x, y, radius, w, d.damage);
    addZone({
      look: 'crater', x, y, r: radius * d.crater.share, life: d.crater.life,
      tick: d.crater.tick, timer: d.crater.tick,
      apply: e => hit(e, w, d.crater.damage),
    });
  });
}

const NO_TARGET = { dead: true }; // a rocket with nothing to chase just flies on

function moveRocket(s, dt) {
  s.life -= dt;
  if (!s.target.dead) s.a = turnToward(s.a, Math.atan2(s.target.y - s.y, s.target.x - s.x), s.turn * dt);
  s.speed += s.accel * dt;
  s.x += Math.cos(s.a) * s.speed * dt;
  s.y += Math.sin(s.a) * s.speed * dt;
}

// A rocket flies over the horde to its target. Only once that is gone can anything set it off.
function launchRocket(o, blast) {
  launch(Object.assign({
    look: 'rocket', pierce: Infinity, move: moveRocket, onEnd: blast,
    onHit: (s, e) => {
      if (e !== s.target && !s.target.dead) return;
      s.dead = true;
      blast(s);
    },
  }, o));
}

function fireRockets(w, blast) {
  const d = w.def;
  const n = shotCount(w);
  const targets = toughestEnemies(hero.x, hero.y, d.range, n);
  if (!targets.length) return false;
  for (let i = 0; i < n; i++) {
    const target = targets[i % targets.length];
    launchRocket({
      pen: d.pen, r: 8, a: aimAt(target) + (i - (n - 1) / 2) * d.spread,
      speed: d.speed, accel: d.accel, turn: d.turn, life: d.life, target,
    }, blast);
  }
  return true;
}

// The small rockets leave a blast in all directions, each after an enemy of its own.
function burstRocket(w, x, y, size) {
  const d = w.def;
  const targets = nearestEnemies(x, y, d.miniRange, d.minis);
  const blast = s => explode(s.x, s.y, d.miniRadius * size, w, d.miniDamage);
  for (let i = 0; i < d.minis; i++) {
    launchRocket({
      x, y, pen: d.pen, r: 5, a: i / d.minis * TAU,
      speed: d.miniSpeed, accel: d.miniAccel, turn: d.miniTurn, life: d.miniLife,
      target: targets.length ? targets[i % targets.length] : NO_TARGET,
    }, blast);
  }
}

// Moves relative to the hero, so on screen it is a straight line right through the middle.
function moveDrone(s, dt) {
  s.offset += s.speed * dt;
  s.spin += 18 * dt;
  s.x = hero.x + Math.cos(s.a) * s.offset;
  s.y = hero.y + Math.sin(s.a) * s.offset;
  if (s.onDrop && s.offset >= s.nextDrop) {
    s.onDrop(s);
    s.nextDrop += s.span;
  }
  if (s.offset >= s.span) s.dead = true;
}

// Each pass takes the next of the four diagonals.
function launchDrone(w, damage, extra) {
  const d = w.def;
  if (!nearestEnemies(hero.x, hero.y, d.span, 1).length) return false;
  w.passes = (w.passes || 0) + 1;
  const a = TAU / 8 + w.passes * TAU / 4;
  launch(Object.assign({
    look: 'drone', pen: d.pen, a, speed: d.speed, r: d.r * weaponStat(w, 'size'), life: Infinity, pierce: Infinity,
    x: hero.x - Math.cos(a) * d.span, y: hero.y - Math.sin(a) * d.span,
    offset: -d.span, span: d.span, spin: 0, move: moveDrone,
    onHit: (s, e) => hit(e, w, damage),
  }, extra));
  return true;
}

// Each returns false when there is nothing to fire at, so the weapon stays ready.
const FIRE = {
  fireball(w) {
    const d = w.def;
    const n = shotCount(w);
    const targets = nearestEnemies(hero.x, hero.y, AIM_RANGE, n);
    if (!targets.length) return false;
    const radius = d.radius * weaponStat(w, 'size');
    const blast = s => explode(s.x, s.y, radius, w, d.damage);
    for (let i = 0; i < n; i++) {
      const fan = i < targets.length ? 0 : (i - targets.length + 1) * 0.3;
      launch({
        look: 'ball', pen: d.pen, a: aimAt(targets[i % targets.length]) + fan,
        speed: d.speed, r: 7, life: d.life, onHit: blast, onEnd: blast,
      });
    }
    return true;
  },

  meteor(w) {
    const d = w.def;
    const inRange = nearestEnemies(hero.x, hero.y, d.range, MAX_ENEMIES);
    if (!inRange.length) return false;
    const { x, y } = pickOne(inRange);
    fallMeteor(w, x, y);
    return true;
  },

  rocket(w) {
    const d = w.def;
    const radius = d.radius * weaponStat(w, 'size');
    return fireRockets(w, s => explode(s.x, s.y, radius, w, d.damage));
  },

  clusterrocket(w) {
    const d = w.def;
    const size = weaponStat(w, 'size');
    return fireRockets(w, s => {
      explode(s.x, s.y, d.radius * size, w, d.damage);
      burstRocket(w, s.x, s.y, size);
    });
  },

  drone(w) {
    return launchDrone(w, w.def.damage);
  },

  meteordrone(w) {
    const d = w.def;
    return launchDrone(w, d.passDamage, { nextDrop: -d.span, onDrop: s => fallMeteor(w, s.x, s.y) });
  },

  chain(w) {
    const first = nearestEnemies(hero.x, hero.y, w.def.range, 1)[0];
    if (!first) return false;
    strikeChain(first, w);
    return true;
  },

  electrogun(w) {
    const first = nearestEnemies(hero.x, hero.y, w.def.range, 1)[0];
    if (!first) return false;
    strikeChain(first, w);
    return true;
  },

  icearrow(w) {
    const d = w.def;
    const target = nearestEnemies(hero.x, hero.y, AIM_RANGE, 1)[0];
    if (!target) return false;
    const size = weaponStat(w, 'size');
    launch({
      look: 'arrow', pen: d.pen, a: aimAt(target), speed: d.speed, r: d.width * (1 + (size - 1) * d.widthGrowth),
      life: d.life, pierce: Infinity, len: d.length * size,
      onHit: (s, e) => {
        hit(e, w, d.damage);
        slow(e, d.slow, d.slowTime);
      },
    });
    return true;
  },

  boomerang(w) {
    return throwBoomerangs(w, (s, e) => hit(e, w, w.def.damage));
  },

  iceboomerang(w) {
    const d = w.def;
    return throwBoomerangs(w, (s, e) => {
      hit(e, w, d.damage, s.back ? 'magic' : 'phys');
      slow(e, d.slow, d.slowTime);
    });
  },

  pistol(w) {
    const d = w.def;
    const target = nearestEnemies(hero.x, hero.y, d.range, 1)[0];
    if (!target) return false;
    addFx({ type: 'tracer', x: target.x, y: target.y, x0: hero.x, y0: hero.y, life: 0.08, pen: d.pen });
    hit(target, w, d.damage);
    return true;
  },

  sword(w) {
    const d = w.def;
    const reach = d.reach * weaponStat(w, 'size');
    const target = nearestEnemies(hero.x, hero.y, reach * 1.3, 1)[0];
    if (!target) return false;
    const aim = aimAt(target);
    const n = shotCount(w);
    for (let i = 0; i < n; i++) later(i * d.swingGap, () => swing(w, aim + i * Math.PI, reach));
    return true;
  },
};

// ---- Weapons: always-on ones ----

function auraRadius(w) { return w.def.radius * weaponStat(w, 'size'); }

function pulseAura(w, dt, damage) {
  w.pulse -= dt;
  if (w.pulse > 0) return;
  w.pulse += w.def.tick;
  eachEnemyNear(hero.x, hero.y, auraRadius(w), e => hit(e, w, damage));
}

function rechargeShield(w, dt) {
  if (w.charges >= w.def.charges) return;
  w.timer -= dt;
  if (w.timer > 0) return;
  w.charges++;
  setCooldown(w, cooldownOf(w));
}

function startPhase(w, early) {
  hero.phaseLeft = w.def.duration;
  w.pulse = 0;
  setCooldown(w, cooldownOf(w) * (early ? 2 : 1));
  w.locked = early;
}

// A spear or a lance follows the way the hero walks and stays put when the hero stands still.
// `touching` finds what it reaches. Only the first touch knocks a target back.
function strikeLance(w, dt, touching) {
  const d = w.def;
  w.angle = turnToward(w.angle, Math.atan2(hero.faceY, hero.faceX), d.turn * dt);
  w.thrust = Math.max(0, w.thrust - dt * 7);
  w.pulse -= dt;
  if (w.pulse > 0) return;
  w.pulse += d.tick / weaponStat(w, 'speed');
  w.thrust = 1;
  touching(e => {
    hit(e, w, d.damage);
    if (e.speared) return;
    e.speared = true;
    knockBack(e, w.angle, d.push, d.pushTime);
  });
}

// The oval sits ahead of the hero, who stays inside it near the back end.
function lanceOval(w) {
  const d = w.def;
  const size = weaponStat(w, 'size');
  return {
    x: hero.x + Math.cos(w.angle) * d.shift * size,
    y: hero.y + Math.sin(w.angle) * d.shift * size,
    long: d.long * size,
    wide: d.wide * size,
  };
}

const TICK = {
  aura(w, dt) {
    pulseAura(w, dt, w.def.damage);
  },

  shield(w, dt) {
    rechargeShield(w, dt);
  },

  fireshield(w, dt) {
    rechargeShield(w, dt);
    pulseAura(w, dt, w.def.auraDamage);
  },

  spear(w, dt) {
    const size = weaponStat(w, 'size');
    strikeLance(w, dt, fn => eachEnemyOnLance(hero.x, hero.y, w.angle, w.def.length * size, w.def.width * size / 2, fn));
  },

  radiantlance(w, dt) {
    strikeLance(w, dt, fn => {
      const { x, y, long, wide } = lanceOval(w);
      eachEnemyInOval(x, y, w.angle, long, wide, fn);
    });
  },

  phase(w, dt) {
    if (hero.phaseLeft > 0) {
      hero.phaseLeft -= dt;
      w.pulse -= dt;
      if (w.pulse <= 0) {
        w.pulse += w.def.tick;
        eachEnemyNear(hero.x, hero.y, w.def.radius, e => hit(e, w, w.def.damage));
      }
      return;
    }
    w.timer -= dt;
    if (w.timer <= 0) startPhase(w, false);
  },
};

function updateWeapons(dt) {
  for (const w of hero.weapons) {
    const tick = TICK[w.def.id];
    if (tick) {
      tick(w, dt);
      continue;
    }
    w.timer -= dt;
    if (w.timer > 0) continue;
    if (FIRE[w.def.id](w)) setCooldown(w, cooldownOf(w));
    else w.timer = 0;
  }
}
