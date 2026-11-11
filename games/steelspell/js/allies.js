// Summoned copies of the hero (Summon, Pyre Twins, Phantom Lancer). A copy walks to the nearest
// enemy and fights with a spear; with Gunslinger it shoots as well. It has the hero's max
// health (times `hpShare`), all its damage is magic, and it hits harder the more health the
// hero has. Enemies that touch a copy hurt it; they still chase the hero.

// What the hero's max health adds to a copy's damage: 300 health hits as listed.
function hpScale() { return hero.maxHp / HERO.hp; }

function summonCopies(w) {
  const d = w.cfg;
  for (let i = 0; i < d.clones; i++) {
    const a = rand() * TAU;
    const hp = hero.maxHp * d.hpShare;
    allies.push({
      w, x: hero.x + Math.cos(a) * 30, y: hero.y + Math.sin(a) * 30, r: HERO.r * d.big, hp, maxHp: hp,
      life: d.life * weaponDuration(w), angle: a, pulse: 0.2, thrust: 0, gunTimer: 0.3, iframes: 0, dead: false,
    });
  }
  addFx({ type: 'ring', x: hero.x, y: hero.y, r: 40, life: 0.3, pen: d.pen });
}

FIRE.summon = function (w) {
  if (!nearestEnemies(hero.x, hero.y, w.cfg.copy.seek + 100, 1).length) return false;
  summonCopies(w);
  return true;
};

// A merge with a summon keeps its other half every frame and calls copies on its own timer.
function tickSummon(w, dt) {
  w.timer -= dt;
  if (w.timer > 0) return;
  if (FIRE.summon(w)) setCooldown(w, cooldownOf(w));
  else w.timer = 0;
}

TICK.pyretwins = function (w, dt) {
  walkTrail(w, dt, w.cfg.trail, hero, w);
  tickSummon(w, dt);
};

TICK.phantomlancer = function (w, dt) {
  TICK.spear(w, dt);
  tickSummon(w, dt);
};

function moveCopy(a, dt, target, reach) {
  const c = a.w.cfg.copy;
  let gx = hero.x;
  let gy = hero.y;
  let stop = 60;
  if (target) {
    gx = target.x;
    gy = target.y;
    stop = reach * 0.6 + target.r;
    a.angle = Math.atan2(gy - a.y, gx - a.x);
  }
  const dx = gx - a.x;
  const dy = gy - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist <= stop) return;
  const step = Math.min(dist - stop, c.speed * dt);
  a.x += dx / dist * step;
  a.y += dy / dist * step;
}

function updateAllies(dt) {
  for (const a of allies) {
    const w = a.w;
    const d = w.cfg;
    const c = d.copy;
    const size = weaponSize(w);
    const reach = c.reach * size;
    a.life -= dt;
    a.iframes = Math.max(0, a.iframes - dt);
    a.thrust = Math.max(0, a.thrust - dt * 7);
    const target = nearestEnemies(a.x, a.y, c.seek, 1)[0];
    moveCopy(a, dt, target, reach);
    if (d.trail) walkTrail(w, dt, d.trail, a, a); // Pyre Twins
    a.pulse -= dt;
    if (a.pulse <= 0) {
      if (target) {
        a.pulse += c.tick;
        a.thrust = 1;
        eachEnemyOnLance(a.x, a.y, a.angle, reach, c.width * size / 2, e => hit(e, w, c.damage * hpScale(), 'magic'));
      } else {
        a.pulse = 0;
      }
    }
    if (d.gun) { // Gunslinger
      a.gunTimer -= dt;
      const shot = a.gunTimer <= 0 && nearestEnemies(a.x, a.y, d.gun.range, 1)[0];
      if (shot) {
        a.gunTimer = d.gun.cooldown;
        hit(shot, w, d.gun.damage * hpScale(), 'magic');
        ricochet(w, shot, d.gun.damage * hpScale(), 'magic');
        addFx({ type: 'tracer', x0: a.x, y0: a.y, x: shot.x, y: shot.y, life: 0.08, pen: d.pen });
      }
    }
    if (a.iframes <= 0) {
      eachEnemyNear(a.x, a.y, a.r, e => {
        if (a.iframes > 0) return;
        a.hp -= e.def.damage * fury();
        a.iframes = HERO.iframes;
      });
    }
    if (a.hp <= 0 || a.life <= 0) {
      a.dead = true;
      addFx({ type: 'ring', x: a.x, y: a.y, r: 26, life: 0.3, pen: d.pen });
    }
  }
  sweep(allies);
}
