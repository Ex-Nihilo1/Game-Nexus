// The horde: spawning, movement, and the attacks of those that fight from a distance.

function healthGrowth() {
  const minutes = elapsed / 60;
  const wall = Math.max(0, minutes - HP_WALL.from) / HP_WALL.doubling;
  return (1 + GROWTH.hp * minutes + GROWTH.hpAccel * minutes * minutes) * 2 ** wall;
}

// What contact and shot damage are multiplied by: the horde hits harder every minute.
function fury() { return 1 + GROWTH.damage * elapsed / 60; }

function recycleDistance() { return Math.hypot(view.w, view.h) / 2 + RECYCLE_MARGIN; }

function ringEntry(i) {
  if (i < RINGS.length) return RINGS[i];
  const loop = i - RINGS.length;
  const at = RINGS[RINGS.length - 1].at + (loop + 1) * RING_LOOP.every;
  return Object.assign({ at }, RING_LOOP.rings[loop % RING_LOOP.rings.length]);
}

function addEnemy(type, a = rand() * TAU) {
  // At the cap the oldest ordinary enemy gives way: a crowd the hero simply walked away
  // from must not stop newer, faster enemies from arriving.
  if (enemies.length >= MAX_ENEMIES) {
    const oldest = enemies.findIndex(e => !e.def.elite);
    if (oldest >= 0) enemies.splice(oldest, 1);
  }
  const def = ENEMIES[type];
  const ring = Math.hypot(view.w, view.h) / 2 + def.r + 20;
  const hp = def.hp * healthGrowth() * (1 + gearValue('enemyHp'));
  enemies.push({
    def, x: hero.x + Math.cos(a) * ring, y: hero.y + Math.sin(a) * ring, r: def.r,
    hp, maxHp: hp, slowLeft: 0, slowBy: 0, flash: 0, pushLeft: 0, pushX: 0, pushY: 0, speared: false, dead: false,
    freezeLeft: 0, rootLeft: 0, dash: null, side: enemies.length % 2 ? 1 : -1,
    // Each attack waits its own time; a random head start keeps a pack from firing as one.
    cool: def.attacks ? def.attacks.map(at => at.every * (0.4 + 0.6 * rand())) : null,
  });
}

function spawnEnemies(dt) {
  let wave = WAVES[0];
  for (const w of WAVES) if (elapsed >= w.at) wave = w;
  spawnBudget += wave.rate * dt;
  while (spawnBudget >= 1) {
    spawnBudget -= 1;
    addEnemy(pickWeighted(wave.mix));
  }
  while (elapsed >= (nextElite + 1) * ELITES.every) {
    const types = ELITES.waves[Math.min(nextElite, ELITES.waves.length - 1)];
    nextElite++;
    for (const type of types) addEnemy(type);
    say(types.length > 1 ? 'Elites have arrived' : `${ENEMIES[types[0]].name} has arrived`);
  }
  while (elapsed >= ringEntry(nextRing).at) {
    const ring = ringEntry(nextRing++);
    for (let i = 0; i < ring.count; i++) addEnemy(ring.type, i / ring.count * TAU);
    say('They are closing in');
  }
  wildOrbTimer -= dt;
  if (wildOrbTimer <= 0) {
    wildOrbTimer += WILD_ORB.every;
    dropWildOrb();
  }
}

function separate(e) {
  const cx = Math.floor(e.x / GRID_CELL);
  const cy = Math.floor(e.y / GRID_CELL);
  let pushes = 0;
  for (let yy = cy - 1; yy <= cy + 1; yy++) {
    for (let xx = cx - 1; xx <= cx + 1; xx++) {
      const cell = grid[gridIndex(xx, yy)];
      for (let i = 0; i < cell.length; i++) {
        const o = cell[i];
        if (o === e) continue;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const min = e.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * SEPARATION / d;
        e.x += dx * push;
        e.y += dy * push;
        if (++pushes >= MAX_PUSHES) return;
      }
    }
  }
}

// Straight at the hero, unless the enemy keeps its distance: then up to the far edge of its
// band, back out of the near one, and sideways in between.
function walk(e, dx, dy, d, pace, dt) {
  const keep = e.def.keep;
  if (!keep || d > keep[1]) {
    e.x += dx / d * pace * dt;
    e.y += dy / d * pace * dt;
  } else if (d < keep[0]) {
    e.x -= dx / d * pace * 0.7 * dt;
    e.y -= dy / d * pace * 0.7 * dt;
  } else {
    e.x += -dy / d * pace * 0.35 * e.side * dt;
    e.y += dx / d * pace * 0.35 * e.side * dt;
  }
}

function moveEnemies(dt) {
  const far = recycleDistance();
  const hurry = 1 + GROWTH.speed * elapsed / 60;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const dx = hero.x - e.x;
    const dy = hero.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > far) {
      e.x = hero.x + dx * 0.8; // the opposite side: where the hero is heading
      e.y = hero.y + dy * 0.8;
      continue;
    }
    if (e.flash > 0) e.flash -= dt;
    if (e.slowLeft > 0) e.slowLeft -= dt;
    if (e.pushLeft > 0) {
      e.pushLeft -= dt;
      e.x += e.pushX * dt;
      e.y += e.pushY * dt;
    } else if (e.freezeLeft > 0) {
      e.freezeLeft -= dt;
    } else if (e.dash) {
      e.x += Math.cos(e.dash.a) * e.dash.speed * dt;
      e.y += Math.sin(e.dash.a) * e.dash.speed * dt;
      e.dash.left -= e.dash.speed * dt;
      if (e.dash.left <= 0) e.dash = null;
    } else if (e.rootLeft > 0) {
      e.rootLeft -= dt;
    } else {
      walk(e, dx, dy, d, e.def.speed * hurry * (e.slowLeft > 0 ? 1 - e.slowBy : 1), dt);
    }
    if (e.cool && e.freezeLeft <= 0) enemyAttacks(e, d, dt);
    if ((i + frame) % 2 === 0 && !e.def.elite) separate(e);
  }
}

// ---- Attacks from a distance ----

function aimAtHero(e) { return Math.atan2(hero.y - e.y, hero.x - e.x); }

// `shot` is an attack row or an orb row: speed, damage, r, kind, and maybe life and turn.
function enemyShot(e, shot, a) {
  if (enemyShots.length >= MAX_ENEMY_SHOTS) return;
  enemyShots.push({
    x: e.x, y: e.y, vx: Math.cos(a) * shot.speed, vy: Math.sin(a) * shot.speed, r: shot.r,
    damage: shot.damage * fury(), kind: shot.kind, life: shot.life || 4, turn: shot.turn || 0, dead: false,
  });
}

// A strike that is announced first. `shape` is 'circle' (x, y, r) or 'line' (x, y, a, length,
// half). With `damage` it hurts the hero if still inside when the time is up; `then` runs
// at that moment either way.
function warn(o) {
  if (warnings.length >= MAX_WARNINGS) return;
  warnings.push(Object.assign({ max: o.life, dead: false }, o));
}

const ATTACK = {
  shot(e, at) {
    enemyShot(e, at, aimAtHero(e));
  },
  fan(e, at) {
    const a = aimAtHero(e);
    for (let i = 0; i < at.count; i++) enemyShot(e, at, a + (i - (at.count - 1) / 2) * at.spread);
  },
  lob(e, at) {
    warn({
      shape: 'circle', x: hero.x + hero.vx * at.lead, y: hero.y + hero.vy * at.lead, r: at.radius,
      life: at.delay, damage: at.damage * fury(), kind: at.kind,
    });
  },
  slam(e, at) {
    e.rootLeft = at.delay;
    warn({ shape: 'circle', x: e.x, y: e.y, r: at.radius, life: at.delay, damage: at.damage * fury(), kind: at.kind });
  },
  charge(e, at) {
    const a = aimAtHero(e);
    e.rootLeft = at.delay;
    warn({
      shape: 'line', x: e.x, y: e.y, a, length: at.distance, half: e.r, life: at.delay,
      then: () => { if (!e.dead) e.dash = { a, left: at.distance, speed: at.speed }; },
    });
  },
  nova(e, at) {
    const turn = rand() * TAU;
    for (let i = 0; i < at.count; i++) enemyShot(e, at, turn + i / at.count * TAU);
    e.novas = (e.novas || 0) + 1;
    if (e.novas % at.orbEvery === 0) enemyShot(e, at.orb, aimAtHero(e));
  },
  spiral(e, at) {
    const a = aimAtHero(e);
    for (let i = 0; i < at.count; i++) {
      later(i * at.gap, () => { if (!e.dead) enemyShot(e, at, a + i * at.twist); });
    }
  },
};

function enemyAttacks(e, d, dt) {
  const list = e.def.attacks;
  for (let i = 0; i < list.length; i++) {
    e.cool[i] -= dt;
    if (e.cool[i] > 0) continue;
    if (d > list[i].range || e.dash || e.rootLeft > 0) {
      e.cool[i] = 0.3; // not now: look again in a moment
      continue;
    }
    e.cool[i] = list[i].every;
    ATTACK[list[i].type](e, list[i]);
  }
}

// A shot passes through a ghost. Anything else it hits takes it, even behind a block.
function updateEnemyShots(dt) {
  for (const s of enemyShots) {
    if (s.dead) continue;
    if (s.turn) {
      const a = turnToward(Math.atan2(s.vy, s.vx), Math.atan2(hero.y - s.y, hero.x - s.x), s.turn * dt);
      const pace = Math.hypot(s.vx, s.vy);
      s.vx = Math.cos(a) * pace;
      s.vy = Math.sin(a) * pace;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.life <= 0) {
      s.dead = true;
      continue;
    }
    const reach = s.r + hero.r;
    if ((s.x - hero.x) ** 2 + (s.y - hero.y) ** 2 >= reach * reach) continue;
    if (hero.ghostLeft > 0 || hero.phaseLeft > 0) continue;
    s.dead = true;
    hurtHero(s.damage, s.kind, 'shot');
  }
  sweep(enemyShots);
}

function updateWarnings(dt) {
  for (const w of warnings) {
    w.life -= dt;
    if (w.life > 0) continue;
    w.dead = true;
    if (w.shape === 'circle') addFx({ type: 'ring', x: w.x, y: w.y, r: w.r, life: 0.3, pen: 'enemy-attack' });
    if (w.damage && Math.hypot(hero.x - w.x, hero.y - w.y) < w.r + hero.r) hurtHero(w.damage, w.kind, 'strike');
    if (w.then) w.then();
  }
  sweep(warnings);
}
