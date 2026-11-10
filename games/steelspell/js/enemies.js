// The horde: spawning and movement.

function healthGrowth() {
  const minutes = elapsed / 60;
  const wall = Math.max(0, minutes - HP_WALL.from) / HP_WALL.doubling;
  return (1 + HP_PER_MINUTE * minutes + HP_ACCEL * minutes * minutes) * 2 ** wall;
}

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
  const hp = def.hp * healthGrowth();
  enemies.push({
    def, x: hero.x + Math.cos(a) * ring, y: hero.y + Math.sin(a) * ring, r: def.r,
    hp, maxHp: hp, slowLeft: 0, slowBy: 0, flash: 0, pushLeft: 0, pushX: 0, pushY: 0, speared: false, dead: false,
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

function moveEnemies(dt) {
  const far = recycleDistance();
  const hurry = 1 + SPEED_PER_MINUTE * elapsed / 60;
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
    } else {
      const pace = e.def.speed * hurry * (e.slowLeft > 0 ? 1 - e.slowBy : 1);
      e.x += dx / d * pace * dt;
      e.y += dy / d * pace * dt;
    }
    if ((i + frame) % 2 === 0 && !e.def.elite) separate(e);
  }
}
