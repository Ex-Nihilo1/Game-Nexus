// Weapons that fire on a cooldown. Evolutions switch on extra behavior through fields that
// only they set (`burn`, `scatter`, `bounces`, ...): see EVOLUTIONS in data/weapons.js.

function launch(o) {
  shots.push(Object.assign({
    x: hero.x, y: hero.y, vx: Math.cos(o.a) * o.speed, vy: Math.sin(o.a) * o.speed,
    hits: new Set(), pierce: 1, dead: false,
  }, o));
}

function aimAt(target) { return Math.atan2(target.y - hero.y, target.x - hero.x); }

const NO_TARGET = { dead: true }; // for a shot with nothing to chase

// Ground that keeps burning after a blast. `burn` is { life, tick, damage }.
function burnGround(w, x, y, r, burn) {
  addZone({
    look: 'fire', x, y, r, life: burn.life * weaponDuration(w), tick: burn.tick, timer: burn.tick,
    apply: e => hit(e, w, burn.damage, undefined, true),
  });
}

// ---- Fireball ----

// `scale` is 1 for a real fireball, less for the small ones a Scatter Flame bursts into.
function throwFireball(w, x, y, a, scale, skip) {
  const d = w.cfg;
  const small = scale < 1;
  const radius = d.radius * weaponSize(w) * (small ? d.scatterSize : 1);
  const blast = (s, e) => {
    explode(s.x, s.y, radius, w, d.damage * scale);
    if (d.burn) burnGround(w, s.x, s.y, radius * 0.8, d.burn);
    if (!d.scatter || small) return;
    for (let i = 0; i < d.scatter; i++) throwFireball(w, s.x, s.y, s.a + (i + 0.5) / d.scatter * TAU, d.scatterDamage, e);
  };
  launch({
    look: 'ball', pen: d.pen, x, y, a, speed: d.speed, r: small ? 5 : 7, life: small ? d.scatterLife : d.life,
    hits: new Set(skip ? [skip] : []), onHit: blast, onEnd: blast,
  });
}

// ---- Boomerang ----

function returnToHero(s, dt) {
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

function flyOut(s, dt) {
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.flown += s.speed * dt;
}

function moveBoomerang(s, dt) {
  s.spin += 14 * dt;
  if (s.back) return returnToHero(s, dt);
  flyOut(s, dt);
  if (s.flown >= s.range) {
    s.back = true;
    s.hits.clear(); // everything can be hit again on the way back
  }
}

// Glaive: from enemy to enemy, never the same one twice, and never back.
function moveGlaive(s, dt) {
  s.spin += 14 * dt;
  if (s.target.dead) s.target = nearestEnemies(s.x, s.y, s.bounceRange, 1, s.hits)[0] || NO_TARGET;
  if (s.target.dead) {
    s.dead = true;
    return;
  }
  const a = Math.atan2(s.target.y - s.y, s.target.x - s.x);
  s.x += Math.cos(a) * s.speed * dt;
  s.y += Math.sin(a) * s.speed * dt;
}

// Orbit Blades: out to the ring, around the hero for a while, then home.
function moveOrbit(s, dt) {
  s.spin += 14 * dt;
  if (s.back) return returnToHero(s, dt);
  if (s.flown < s.orbitRadius) {
    flyOut(s, dt);
    s.turn = Math.atan2(s.y - hero.y, s.x - hero.x);
    return;
  }
  s.turn += s.orbitTurn * dt;
  s.x = hero.x + Math.cos(s.turn) * s.orbitRadius;
  s.y = hero.y + Math.sin(s.turn) * s.orbitRadius;
  s.again -= dt;
  if (s.again <= 0) {
    s.again = 0.4;
    s.hits.clear(); // the same enemy can be cut on every lap
  }
  s.orbitLeft -= dt;
  if (s.orbitLeft <= 0) {
    s.back = true;
    s.hits.clear();
  }
}

function throwBoomerangs(w, onHit) {
  const d = w.cfg;
  const target = nearestEnemies(hero.x, hero.y, AIM_RANGE, 1)[0];
  if (!target) return false;
  const n = shotCount(w);
  const aim = aimAt(target);
  for (let i = 0; i < n; i++) {
    const shot = {
      look: 'boomerang', pen: d.pen, a: aim + (i - (n - 1) / 2) * d.spread,
      speed: d.speed, r: d.r * weaponSize(w), life: Infinity, pierce: Infinity,
      range: d.range, returnBoost: d.returnBoost, flown: 0, back: false, spin: 0, move: moveBoomerang, onHit,
    };
    if (d.bounces) {
      Object.assign(shot, {
        move: moveGlaive, target, left: d.bounces, bounceRange: d.bounceRange,
        onHit: (s, e) => {
          onHit(s, e);
          if (--s.left <= 0) s.dead = true;
          else s.target = nearestEnemies(e.x, e.y, s.bounceRange, 1, s.hits)[0] || NO_TARGET;
        },
      });
    } else if (d.orbit) {
      Object.assign(shot, {
        move: moveOrbit, orbitRadius: d.orbitRadius * weaponSize(w), orbitTurn: d.orbitTurn,
        orbitLeft: d.orbit * weaponDuration(w), again: 0.4, turn: 0,
      });
    }
    launch(shot);
  }
  return true;
}

// ---- Sword ----

function swing(w, angle, reach) {
  const d = w.cfg;
  const half = d.arc / 2;
  eachEnemyNear(hero.x, hero.y, reach, e => {
    if (angleGap(aimAt(e), angle) > half) return;
    hit(e, w, d.damage);
    if (d.knock && (e.knockAt || 0) <= elapsed) {
      e.knockAt = elapsed + d.knockEvery; // not every swing, or nothing would ever reach the hero
      knockBack(e, aimAt(e), d.knock, 0.15);
    }
  });
  if (d.parry) parryEnemyShots(w, angle, half, reach);
  addFx({ type: 'swing', a: angle, span: d.arc, r: reach, life: 0.16, pen: d.pen });
}

// ---- Meteor ----

function fallMeteor(w, x, y) {
  const d = w.cfg;
  const radius = d.radius * weaponSize(w);
  addFx({ type: 'telegraph', x, y, r: radius, life: d.delay, pen: d.pen });
  later(d.delay, () => {
    explode(x, y, radius, w, d.damage);
    addZone({
      look: 'crater', x, y, r: radius * d.crater.share, life: d.crater.life * weaponDuration(w),
      tick: d.crater.tick, timer: d.crater.tick,
      apply: e => {
        hit(e, w, d.crater.damage, undefined, true);
        if (d.crater.slow) slow(e, d.crater.slow, d.crater.tick * 2);
      },
    });
  });
}

// ---- Rocket ----

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
  const d = w.cfg;
  const n = shotCount(w);
  const targets = toughestEnemies(hero.x, hero.y, d.range, n);
  if (!targets.length) return false;
  for (let i = 0; i < n; i++) {
    const target = targets[i % targets.length];
    launchRocket({
      pen: d.pen, r: d.single ? 11 : 8, a: aimAt(target) + (i - (n - 1) / 2) * d.spread,
      speed: d.speed, accel: d.accel, turn: d.turn, life: d.life, target,
    }, blast);
  }
  return true;
}

// The small rockets leave a blast in all directions, each after an enemy of its own.
function burstRocket(w, x, y, size) {
  const d = w.cfg;
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

// ---- Drone ----

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

// Guardian: stays on a ring around the hero and takes enemy shots out of the air.
function moveGuardian(s, dt) {
  s.spin += 18 * dt;
  s.turn += s.guardTurn * dt;
  s.x = hero.x + Math.cos(s.turn) * s.guardRadius;
  s.y = hero.y + Math.sin(s.turn) * s.guardRadius;
  s.a = s.turn + Math.PI / 2;
  eraseEnemyShots(s.x, s.y, s.r + 10);
  s.again -= dt;
  if (s.again <= 0) {
    s.again = s.guardHit;
    s.hits.clear();
  }
  s.guardLeft -= dt;
  if (s.guardLeft <= 0) s.dead = true;
}

// Each pass takes the next of the four diagonals.
function launchDrone(w, damage, extra) {
  const d = w.cfg;
  const body = { look: 'drone', pen: d.pen, r: d.r * weaponSize(w), life: Infinity, pierce: Infinity, spin: 0 };
  const onHit = (s, e) => hit(e, w, damage);
  if (d.guard) {
    for (let i = 0; i < d.drones; i++) {
      launch(Object.assign({
        a: 0, speed: 0, move: moveGuardian, turn: i / d.drones * TAU, again: d.guardHit, guardHit: d.guardHit, onHit,
        guardRadius: d.guardRadius, guardTurn: d.guardTurn, guardLeft: d.guard * weaponDuration(w),
      }, body));
    }
    return true;
  }
  if (!nearestEnemies(hero.x, hero.y, d.span, 1).length) return false;
  for (let i = 0; i < d.drones; i++) {
    w.passes = (w.passes || 0) + 1;
    const a = TAU / 8 + w.passes * TAU / 4;
    launch(Object.assign({
      a, speed: d.speed, x: hero.x - Math.cos(a) * d.span, y: hero.y - Math.sin(a) * d.span,
      offset: -d.span, span: d.span, move: moveDrone, onHit,
    }, body, extra));
  }
  return true;
}

// ---- Pistol ----

// A bullet hits its target at once and, with `pierce`, the next enemies on the same line.
function shootLine(w, target, boost, pierce) {
  const d = w.cfg;
  const a = aimAt(target);
  let last = target;
  hit(target, w, d.damage * boost);
  if (pierce > 0) {
    const along = e => (e.x - hero.x) * Math.cos(a) + (e.y - hero.y) * Math.sin(a);
    const behind = [];
    eachEnemyOnLance(hero.x, hero.y, a, d.range, 8, e => {
      if (e !== target && along(e) > along(target)) behind.push(e);
    });
    behind.sort((p, q) => along(p) - along(q)).slice(0, pierce).forEach(e => {
      hit(e, w, d.damage * boost);
      last = e;
    });
  }
  if (d.ward) eraseShotsOnLine(hero.x, hero.y, last.x, last.y, 12);
  addFx({ type: 'tracer', x: last.x, y: last.y, x0: hero.x, y0: hero.y, life: boost > 1 ? 0.2 : 0.08, pen: d.pen });
}

// ---- Ice Arrow ----

// `scale` is 1 for a real arrow, less for the shards of a Shatter.
function shootArrow(w, x, y, a, scale) {
  const d = w.cfg;
  const size = weaponSize(w);
  const shard = scale < 1;
  launch({
    look: 'arrow', pen: d.pen, x, y, a, speed: d.speed, life: shard ? 0.35 : d.life, pierce: Infinity,
    r: shard ? 6 : d.width * (1 + (size - 1) * d.widthGrowth), len: shard ? 10 : d.length * size,
    onHit: (s, e) => {
      hit(e, w, d.damage * scale);
      slow(e, d.slow, d.slowTime);
      if (d.freeze) freeze(e, d.freeze);
      if (!d.shards || shard || !e.dead) return;
      for (let i = 0; i < d.shards; i++) shootArrow(w, e.x, e.y, s.a + (i - (d.shards - 1) / 2) * 0.7, d.shardDamage);
    },
  });
}

// ---- The table ----

// Each returns false when there is nothing to fire at, so the weapon stays ready.
const FIRE = {
  fireball(w) {
    const n = shotCount(w);
    const targets = nearestEnemies(hero.x, hero.y, AIM_RANGE, n);
    if (!targets.length) return false;
    for (let i = 0; i < n; i++) {
      const fan = i < targets.length ? 0 : (i - targets.length + 1) * 0.3;
      throwFireball(w, hero.x, hero.y, aimAt(targets[i % targets.length]) + fan, 1);
    }
    return true;
  },

  meteor(w) {
    const d = w.cfg;
    const inRange = nearestEnemies(hero.x, hero.y, d.range, MAX_ENEMIES);
    if (!inRange.length) return false;
    for (let i = 0; i < d.meteors; i++) {
      const { x, y } = pickOne(inRange);
      later(i * 0.15, () => fallMeteor(w, x, y));
    }
    return true;
  },

  rocket(w) {
    const d = w.cfg;
    return fireRockets(w, s => {
      const radius = d.radius * weaponSize(w);
      explode(s.x, s.y, radius, w, d.damage);
      if (d.fallout) burnGround(w, s.x, s.y, radius * 0.8, d.fallout);
    });
  },

  clusterrocket(w) {
    const d = w.cfg;
    const size = weaponSize(w);
    return fireRockets(w, s => {
      explode(s.x, s.y, d.radius * size, w, d.damage);
      burstRocket(w, s.x, s.y, size);
    });
  },

  drone(w) {
    return launchDrone(w, w.cfg.damage);
  },

  meteordrone(w) {
    const d = w.cfg;
    return launchDrone(w, d.passDamage, { nextDrop: -d.span, onDrop: s => fallMeteor(w, s.x, s.y) });
  },

  chain(w) {
    const first = nearestEnemies(hero.x, hero.y, w.cfg.range, 1)[0];
    if (!first) return false;
    strikeChain(first, w);
    return true;
  },

  electrogun(w) {
    const first = nearestEnemies(hero.x, hero.y, w.cfg.range, 1)[0];
    if (!first) return false;
    strikeChain(first, w);
    return true;
  },

  icearrow(w) {
    const d = w.cfg;
    const target = nearestEnemies(hero.x, hero.y, AIM_RANGE, 1)[0];
    if (!target) return false;
    for (let i = 0; i < d.arrows; i++) {
      shootArrow(w, hero.x, hero.y, aimAt(target) + (i - (d.arrows - 1) / 2) * d.fan, 1);
    }
    return true;
  },

  boomerang(w) {
    return throwBoomerangs(w, (s, e) => hit(e, w, w.cfg.damage));
  },

  iceboomerang(w) {
    const d = w.cfg;
    return throwBoomerangs(w, (s, e) => {
      hit(e, w, d.damage, s.back ? 'magic' : 'phys');
      slow(e, d.slow, d.slowTime);
    });
  },

  // Revolver: every 6th shot is a big one that goes through everything.
  pistol(w) {
    const d = w.cfg;
    const targets = nearestEnemies(hero.x, hero.y, d.range, d.targets);
    if (!targets.length) return false;
    w.fired = (w.fired || 0) + 1;
    const big = d.sixth && w.fired % 6 === 0;
    for (const target of targets) shootLine(w, target, big ? d.sixth : 1, big ? Infinity : d.pierce);
    return true;
  },

  sword(w) {
    const d = w.cfg;
    const reach = d.reach * weaponSize(w);
    const target = nearestEnemies(hero.x, hero.y, reach * 1.3, 1)[0];
    if (!target) return false;
    const aim = aimAt(target);
    const n = shotCount(w);
    for (let i = 0; i < n; i++) later(i * d.swingGap, () => swing(w, aim + i * Math.PI, reach));
    return true;
  },
};
