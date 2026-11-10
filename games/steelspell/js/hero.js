// The hero: movement, getting hurt, and the active skills.

// ---- Active skills ----

const CAST = {
  flash(def) {
    const x0 = hero.x;
    const y0 = hero.y;
    hero.x += hero.faceX * def.distance;
    hero.y += hero.faceY * def.distance;
    hero.iframes = Math.max(hero.iframes, 0.2);
    addFx({ type: 'tracer', x0, y0, x: hero.x, y: hero.y, life: 0.25, pen: 'highlighter' });
  },
  ghost(def) {
    hero.ghostLeft = def.duration;
  },
  berserk(def) {
    berserkLeft = def.duration;
  },
  ignite(def) {
    const perTick = def.share * def.tick / def.duration;
    addZone({
      look: 'fire', x: hero.x, y: hero.y, r: def.radius, life: def.duration, tick: def.tick, timer: 0,
      apply: e => hurtEnemy(e, e.maxHp * perTick, 'pure', false, null),
    });
  },
  stash(def) {
    const a = rand() * TAU;
    chests.push({ x: hero.x + Math.cos(a) * def.distance, y: hero.y + Math.sin(a) * def.distance, type: 'stash', dead: false });
    say('A chest appeared nearby');
  },
  inspiration(def) {
    gainXp(xpNext * def.share);
    say('Inspired!');
  },
};

function useActive() {
  if (phase !== 'playing' || activeCd > 0) return;
  CAST[activeDef.id](activeDef);
  activeCd = activeCooldown();
  dirty = true;
}

// `kind` is 'phys' or 'magic': it only tells what hit, armor cuts both alike.
function hurtHero(amount, kind = 'phys') {
  if (hero.immortal) return;
  if (hero.ghostLeft > 0 || hero.phaseLeft > 0 || hero.iframes > 0) return;
  const shield = chargedWeapon();
  if (shield && shield.charges > 0) {
    if (shield.charges === maxCharges(shield)) setCooldown(shield, cooldownOf(shield));
    shield.charges--;
    hero.iframes = HERO.iframes;
    explode(hero.x, hero.y, auraRadius(shield), shield, shield.cfg.damage);
    eraseEnemyShots(hero.x, hero.y, auraRadius(shield)); // the blast clears the air too
    return;
  }
  const dash = owned('phase');
  if (dash && !dash.locked) {
    startPhase(dash, true);
    return;
  }
  const taken = amount * (1 - armorCut());
  // Second Wind: the hit that would have left the hero nearly dead does not land.
  if (gearValue('secondWind') && elapsed >= hero.windAt && hero.hp - taken < hero.maxHp * 0.2) {
    hero.windAt = elapsed + gearValue('secondWind');
    hero.iframes = 2;
    say('Second Wind!');
    return;
  }
  hero.hp -= taken;
  hero.iframes = HERO.iframes;
  hero.hurtFlash = HURT_FLASH;
  floatText(hero.x, hero.y - hero.r - 8, `-${Math.round(taken)}`, 'red-pencil', 14);
}

// A spare life: full health and a blast that wipes everything close.
function revive() {
  hero.lives--;
  hero.hp = hero.maxHp;
  hero.iframes = REVIVE.iframes;
  eachEnemyNear(hero.x, hero.y, REVIVE.radius, e => hurtEnemy(e, e.maxHp * REVIVE.share, 'pure', false, null));
  addFx({ type: 'ring', x: hero.x, y: hero.y, r: REVIVE.radius, life: 0.7, pen: KINDS.pure.pen });
  say('Back from the dead!');
}

// Bodies are solid. The hero shoves small enemies aside but can be walled in by a crowd,
// which is what Flash and Ghost are for.
function collideHero() {
  if (hero.ghostLeft > 0 || hero.phaseLeft > 0) return;
  const rage = fury();
  eachEnemyNear(hero.x, hero.y, hero.r, e => {
    const dx = e.x - hero.x;
    const dy = e.y - hero.y;
    const d = Math.hypot(dx, dy) || 1;
    const overlap = hero.r + e.r - d;
    const share = e.def.elite ? ELITE_SHOVE : BODY_SHOVE;
    hero.x -= dx / d * overlap * share;
    hero.y -= dy / d * overlap * share;
    e.x += dx / d * overlap * (1 - share);
    e.y += dy / d * overlap * (1 - share);
    hurtHero(e.def.damage * rage);
    prick(e, e.def.damage * rage);
  });
}

// Spiked Shield and Thorned Mail: whatever touches the hero gets hurt, at most twice a second.
function prick(e, contact) {
  const shield = chargedWeapon();
  const thorns = shield && shield.cfg.thorns;
  if ((!thorns && !gearValue('thorns')) || (e.prickAt || 0) > elapsed) return;
  e.prickAt = elapsed + 0.5;
  if (thorns) hit(e, shield, thorns);
  if (gearValue('thorns') && !e.dead) hurtEnemy(e, contact * gearValue('thorns'), 'pure', false, null);
}

function moveHero(dt) {
  let mx = 0;
  let my = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
  if (stick.active) {
    mx = stick.x;
    my = stick.y;
  }
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  if (len > 0.05) {
    hero.faceX = mx / Math.hypot(mx, my);
    hero.faceY = my / Math.hypot(mx, my);
  }
  let pace = HERO.speed * stat('speed');
  if (hero.phaseLeft > 0) {
    const dash = owned('phase');
    pace *= 1 + (dash.cfg.moveBoost - 1) * weaponStat(dash, 'speed');
  }
  if (hero.ghostLeft > 0) pace *= activeDef.speedBoost;
  hero.vx = mx * pace; // mortars aim where this takes the hero
  hero.vy = my * pace;
  hero.x += mx * pace * dt;
  hero.y += my * pace * dt;
  walkFor(Math.hypot(mx, my) * pace * dt);
  hero.iframes = Math.max(0, hero.iframes - dt);
  hero.ghostLeft = Math.max(0, hero.ghostLeft - dt);
  hero.hurtFlash = Math.max(0, hero.hurtFlash - dt);
  hero.hp = Math.min(hero.maxHp, hero.hp + (stat('recovery') + hero.maxHp * gearValue('regen')) * dt);
}
