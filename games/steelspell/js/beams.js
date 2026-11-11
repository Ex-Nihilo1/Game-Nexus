// Weapons that last: beams, cones of fire, whirlwinds and burning trails. Each of them is a
// zone (see combat.js) with a shape and a way of moving of its own, and all of them live
// longer with the Duration stat.

// Of a few enemies in range, the one standing in the thickest crowd. `taken` are spots
// already used, so that several whirlwinds do not land on one place.
function densestSpot(x, y, range, taken = []) {
  const inRange = nearestEnemies(x, y, range, MAX_ENEMIES)
    .filter(e => taken.every(t => Math.hypot(t.x - e.x, t.y - e.y) > 90));
  const stride = Math.max(1, Math.floor(inRange.length / 10));
  let best = null;
  let most = -1;
  for (let i = 0; i < inRange.length; i += stride) {
    const e = inRange[i];
    let crowd = 0;
    eachEnemyNear(e.x, e.y, 80, () => { crowd++; });
    if (crowd > most) {
      most = crowd;
      best = e;
    }
  }
  return best && { x: best.x, y: best.y };
}

function moveToward(z, goal, step) {
  const dx = goal.x - z.x;
  const dy = goal.y - z.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return;
  z.x += dx / d * Math.min(d, step);
  z.y += dy / d * Math.min(d, step);
}

// ---- Laser ----

function moveLaser(z, dt) {
  const d = z.w.cfg;
  z.x = hero.x;
  z.y = hero.y;
  if (d.sweep) {
    z.a += d.sweep / z.span * dt; // Sweeper: across its arc once in a lifetime
    return;
  }
  if (z.target.dead) z.target = nearestEnemies(hero.x, hero.y, z.length, 1)[0] || NO_TARGET;
  if (!z.target.dead) z.a = turnToward(z.a, aimAt(z.target), d.turn * dt);
}

function eachOnLaser(z, fn) {
  const d = z.w.cfg;
  if (!d.prism) {
    eachEnemyOnLance(z.x, z.y, z.a, z.length, z.half, fn);
    return;
  }
  // Prism: the beam stops at its first target and goes on from there as three.
  let first = null;
  let at = Infinity;
  eachEnemyOnLance(z.x, z.y, z.a, z.length, z.half, e => {
    const along = (e.x - z.x) * Math.cos(z.a) + (e.y - z.y) * Math.sin(z.a);
    if (along < at) {
      at = along;
      first = e;
    }
  });
  z.split = first && { x: first.x, y: first.y };
  if (!first) return;
  const lit = new Set([first]);
  fn(first);
  for (let i = 0; i < d.prism; i++) {
    const a = z.a + (i - (d.prism - 1) / 2) * d.prismFan;
    eachEnemyOnLance(z.split.x, z.split.y, a, d.prismLength, z.half, e => {
      if (lit.has(e)) return;
      lit.add(e);
      fn(e);
    });
  }
}

FIRE.laser = function (w) {
  const d = w.cfg;
  const n = shotCount(w);
  const targets = nearestEnemies(hero.x, hero.y, d.length, n);
  if (!targets.length) return false;
  const life = d.life * weaponDuration(w);
  for (let i = 0; i < n; i++) {
    const target = targets[i % targets.length];
    const aim = aimAt(target) + (i < targets.length ? 0 : (i - targets.length + 1) * 0.5);
    addZone({
      look: 'laser', pen: d.pen, x: hero.x, y: hero.y, r: d.length, a: d.sweep ? aim - d.sweep / 2 : aim, target,
      length: d.length, half: d.width * weaponSize(w) / 2, life, span: life, tick: d.tick, timer: 0, w,
      move: moveLaser, each: eachOnLaser, apply: e => hit(e, w, d.damage, undefined, true),
    });
  }
  return true;
};

// ---- Flamethrower ----

function moveFlame(z, dt) {
  z.x = hero.x;
  z.y = hero.y;
  const target = nearestEnemies(hero.x, hero.y, z.length * 1.3, 1)[0];
  if (target) z.a = turnToward(z.a, aimAt(target), z.w.cfg.turn * dt);
}

FIRE.flamethrower = function (w) {
  const d = w.cfg;
  const size = weaponSize(w);
  const length = d.length * size;
  const target = nearestEnemies(hero.x, hero.y, length * 1.2, 1)[0];
  if (!target) return false;
  addZone({
    look: 'flame', pen: d.pen, x: hero.x, y: hero.y, r: length, a: aimAt(target), length,
    half: Math.min(1.4, d.cone * (1 + (size - 1) * 0.5) / 2), // Size widens the cone at half the rate
    life: d.life * weaponDuration(w), tick: d.tick, timer: 0, w, move: moveFlame,
    each: (z, fn) => eachEnemyInCone(z.x, z.y, z.a, z.length, z.half, fn),
    apply: e => {
      hit(e, w, d.damage, undefined, true);
      if (d.afterburn) ignite(e, w, d.damage * 2, d.afterburn, d.burnStacks);
    },
    // Dragon's Breath: where the cone was, the ground keeps burning.
    end: d.scorch && (z => {
      for (const share of [0.35, 0.65, 0.95]) {
        burnGround(w, z.x + Math.cos(z.a) * z.length * share, z.y + Math.sin(z.a) * z.length * share, z.length * 0.22, d.scorch);
      }
    }),
  });
  return true;
};

// ---- Hurricane ----

// Drags enemies toward the middle (elites half as hard) and swallows enemy shots.
function drag(z, pull, dt) {
  eachEnemyNear(z.x, z.y, z.r * 1.5, e => {
    const dx = z.x - e.x;
    const dy = z.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const step = Math.min(d, pull * dt * (e.def.elite ? 0.5 : 1));
    e.x += dx / d * step;
    e.y += dy / d * step;
  });
  eraseEnemyShots(z.x, z.y, z.r);
}

// Once a second it looks for the thickest crowd nearby and heads there.
function wander(z, dt) {
  z.think -= dt;
  if (z.think <= 0) {
    z.think = 1;
    z.goal = densestSpot(z.x, z.y, 260) || z.goal;
  }
  if (z.goal) moveToward(z, z.goal, z.w.cfg.drift * dt);
}

function moveWhirlwind(z, dt) {
  wander(z, dt);
  drag(z, z.w.cfg.pull, dt);
}

// Eye of the Storm: on a ring around the hero.
function moveEye(z, dt) {
  const d = z.w.cfg;
  z.turn += d.eyeTurn * dt;
  z.x = hero.x + Math.cos(z.turn) * d.eyeRadius;
  z.y = hero.y + Math.sin(z.turn) * d.eyeRadius;
  drag(z, d.pull, dt);
}

// One whirlwind per shot, each on a crowd of its own while there are crowds enough.
function castWhirlwinds(w, make) {
  const n = shotCount(w);
  const spots = [];
  for (let i = 0; i < n; i++) {
    const spot = densestSpot(hero.x, hero.y, w.cfg.range, spots);
    if (!spot) break;
    spots.push(spot);
  }
  if (!spots.length) return false;
  for (let i = 0; i < n; i++) make(w, spots[i % spots.length], i / n * TAU);
  return true;
}

FIRE.hurricane = function (w) {
  const d = w.cfg;
  return castWhirlwinds(w, (weapon, spot, turn) => addZone({
    look: 'gale', pen: d.pen, x: spot.x, y: spot.y, r: d.radius * weaponSize(w), life: d.life * weaponDuration(w),
    tick: d.tick, timer: 0, w, think: 0, turn, move: d.eye ? moveEye : moveWhirlwind,
    apply: e => hit(e, w, d.damage, undefined, true),
  }));
};

// ---- Fire Tornado ----

// It grows with age: fast up to `slowAt`, half as fast after, never past `max`.
function tornadoRadius(d, age, size) {
  const g = d.grow;
  const fast = (g.slowAt - g.from) / g.perSecond;
  const r = age <= fast ? g.from + g.perSecond * age : g.slowAt + g.perSecond / 2 * (age - fast);
  return Math.min(g.max, r) * size;
}

function moveTornado(z, dt) {
  const d = z.w.cfg;
  z.r = tornadoRadius(d, z.age, z.size);
  wander(z, dt);
  drag(z, d.pull, dt);
  z.scorchIn -= dt;
  if (z.scorchIn <= 0) {
    z.scorchIn += d.scorch.every;
    burnGround(z.w, z.x, z.y, z.r * 0.5, d.scorch);
  }
  // Two tornadoes that touch become one: their ages add up, so it is bigger than either.
  for (const o of zones) {
    if (o === z || o.dead || o.look !== 'tornado' || Math.hypot(o.x - z.x, o.y - z.y) > z.r + o.r) continue;
    o.dead = true;
    z.age += o.age;
    z.life = Math.max(z.life, o.life);
    z.ticksLeft = Math.max(z.ticksLeft, o.ticksLeft);
  }
}

FIRE.firetornado = function (w) {
  const d = w.cfg;
  return castWhirlwinds(w, (weapon, spot) => {
    const size = weaponSize(w);
    const z = addZone({
      look: 'tornado', pen: d.pen, x: spot.x, y: spot.y, r: tornadoRadius(d, 0, size), size,
      life: d.life * weaponDuration(w), tick: d.tick, timer: 0, w, think: 0, scorchIn: d.scorch.every, move: moveTornado,
    });
    z.apply = e => hit(e, w, d.damage * (1 + d.ramp * Math.min(d.rampMax, z.age)), undefined, true); // hotter every second
  });
};

// ---- Fire Trail ----

// A patch of burning ground for every `every` units walked. Standing still leaves nothing.
TICK.firetrail = function (w, dt) {
  const d = w.cfg;
  if (w.lastX === undefined) {
    w.lastX = hero.x;
    w.lastY = hero.y;
    w.walked = 0;
  }
  const step = Math.hypot(hero.x - w.lastX, hero.y - w.lastY);
  w.lastX = hero.x;
  w.lastY = hero.y;
  if (step > 60) return; // a Flash is not a walk
  w.walked += step;
  if (w.walked < d.every) return;
  w.walked %= d.every;
  const mine = zones.filter(z => z.look === 'trail' && z.w === w && !z.dead);
  if (mine.length >= MAX_TRAIL) mine[0].dead = true; // the oldest patch gives way
  // Comet Tail: the faster the hero moves, the hotter the patch.
  const heat = d.cometGain ? 1 + Math.max(0, step / dt / HERO.speed - 1) * d.cometGain : 1;
  const patch = {
    look: 'trail', pen: d.pen, x: hero.x, y: hero.y, r: d.radius * weaponSize(w), life: d.life * weaponDuration(w),
    tick: d.tick, timer: d.tick, w,
    apply: e => {
      hit(e, w, d.damage * heat, undefined, true);
      if (d.afterburn) ignite(e, w, d.damage, d.afterburn, 1, d.spread);
    },
  };
  addZone(Object.assign({}, patch));
  // Echo Stone: the same patch once more, on the same spot.
  if (gearValue('echo') && rand() < gearValue('echo')) later(0.5, () => addZone(Object.assign({}, patch)));
};
