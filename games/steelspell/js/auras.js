// Weapons that are always on: auras, the shield, the phase, spears.

// The reach of everything that is a circle around the hero: auras, shield blasts, the phase.
function auraRadius(w) { return w.cfg.radius * weaponSize(w); }

function pulseAura(w, dt, damage) {
  const d = w.cfg;
  if (d.ward) eraseEnemyShots(hero.x, hero.y, auraRadius(w));
  w.pulse -= dt;
  if (w.pulse > 0) return;
  w.pulse += d.tick;
  eachEnemyNear(hero.x, hero.y, auraRadius(w), e => {
    hit(e, w, damage, undefined, true);
    if (d.chill) slow(e, d.chill, d.tick * 1.5);
    if (d.emp) empTouch(e, d.emp, d.tick);
  });
}

function rechargeShield(w, dt) {
  if (w.charges >= maxCharges(w)) return;
  w.timer -= dt;
  if (w.timer > 0) return;
  w.charges++;
  setCooldown(w, cooldownOf(w));
}

function startPhase(w, early) {
  hero.phaseLeft = w.cfg.duration * weaponDuration(w);
  w.pulse = 0;
  setCooldown(w, cooldownOf(w) * (early ? w.cfg.earlyCost : 1));
  w.locked = early;
}

// A spear or a lance follows the way the hero walks and stays put when the hero stands still.
// `touching` finds what it reaches. Only the first touch knocks a target back.
function strikeLance(w, dt, touching) {
  const d = w.cfg;
  w.angle = turnToward(w.angle, Math.atan2(hero.faceY, hero.faceX), d.turn * dt);
  w.thrust = Math.max(0, w.thrust - dt * 7);
  w.pulse -= dt;
  if (w.pulse > 0) return;
  w.pulse += d.tick / weaponStat(w, 'speed');
  w.thrust = 1;
  const struck = new Set();
  touching((e, a = w.angle) => {
    if (struck.has(e)) return;
    struck.add(e);
    hit(e, w, d.damage);
    if (d.chill) slow(e, d.chill, d.tick * 1.5);
    if (d.emp) empTouch(e, d.emp, d.tick / weaponStat(w, 'speed')); // Radiant Lance, from EMP Aura
    if (e.speared) return;
    e.speared = true;
    knockBack(e, a, d.push, d.pushTime);
  });
  w.strikes = (w.strikes || 0) + 1;
  if (d.javelin && w.strikes % d.javelin === 0) throwJavelin(w);
}

function throwJavelin(w) {
  const d = w.cfg;
  launch({
    look: 'arrow', pen: d.pen, a: w.angle, speed: d.javelinSpeed, r: d.width * weaponSize(w) / 2,
    life: d.javelinLife, pierce: Infinity, len: 40,
    onHit: (s, e) => hit(e, w, d.damage * d.javelinDamage),
  });
}

// The oval sits ahead of the hero, who stays inside it near the back end. `angle` turns it
// the other way for a lance that also reaches behind (from Pike Wall).
function lanceOval(w, angle = w.angle) {
  const d = w.cfg;
  const size = weaponSize(w);
  return {
    x: hero.x + Math.cos(angle) * d.shift * size,
    y: hero.y + Math.sin(angle) * d.shift * size,
    a: angle,
    long: d.long * size,
    wide: d.wide * size,
  };
}

// The ovals a lance has: one ahead, and one behind with Pike Wall.
function lanceOvals(w) {
  return w.cfg.back ? [lanceOval(w), lanceOval(w, w.angle + Math.PI)] : [lanceOval(w)];
}

// Bastion: a shield that recharges, and sword swings on a timer of their own that hit harder
// with Armor and bring the next charge closer.
function tickBastion(w, dt) {
  const d = w.cfg;
  rechargeShield(w, dt);
  w.swingTimer = (w.swingTimer === undefined ? 0.3 : w.swingTimer) - dt;
  if (w.swingTimer > 0) return;
  const reach = d.reach * weaponSize(w);
  const target = nearestEnemies(hero.x, hero.y, reach * 1.3, 1)[0];
  if (!target) {
    w.swingTimer = 0;
    return;
  }
  w.swingTimer = d.swingCooldown / (1 + weaponStat(w, 'haste') + w.bonus.haste);
  const aim = aimAt(target);
  const damage = d.swingDamage * (1 + heroArmor() * d.armorScale);
  const closer = () => { if (w.charges < maxCharges(w)) w.timer -= d.recharge; };
  for (let i = 0; i < shotCount(w); i++) later(i * d.swingGap, () => swing(w, aim + i * Math.PI, reach, damage, closer));
}

const TICK = {
  bastion: tickBastion,

  // Frost Halo: the Aura, and a flash of cold over all of it on a timer.
  frosthalo(w, dt) {
    pulseAura(w, dt, w.cfg.damage);
    w.timer -= dt;
    if (w.timer > 0) return;
    iceFlash(w, auraRadius(w), w.cfg.flashDamage, w.cfg.slow);
    setCooldown(w, cooldownOf(w));
  },

  aura(w, dt) {
    pulseAura(w, dt, w.cfg.damage);
  },

  shield(w, dt) {
    rechargeShield(w, dt);
  },

  fireshield(w, dt) {
    rechargeShield(w, dt);
    pulseAura(w, dt, w.cfg.auraDamage);
  },

  // Pike Wall: a second spear points the other way.
  spear(w, dt) {
    const d = w.cfg;
    const size = weaponSize(w);
    strikeLance(w, dt, fn => {
      eachEnemyOnLance(hero.x, hero.y, w.angle, d.length * size, d.width * size / 2, e => fn(e));
      if (!d.back) return;
      const behind = w.angle + Math.PI;
      eachEnemyOnLance(hero.x, hero.y, behind, d.length * size, d.width * size / 2, e => fn(e, behind));
    });
  },

  // From Sanctum the ovals fade enemy shots.
  radiantlance(w, dt) {
    if (w.cfg.ward) lanceOvals(w).forEach(eraseShotsInOval);
    strikeLance(w, dt, fn => {
      for (const o of lanceOvals(w)) eachEnemyInOval(o.x, o.y, o.a, o.long, o.wide, e => fn(e, o.a));
    });
  },

  // Blink Strike ends the phase with a blast; Shroud fades enemy shots around the hero.
  phase(w, dt) {
    const d = w.cfg;
    if (hero.phaseLeft > 0) {
      hero.phaseLeft -= dt;
      if (d.ward) eraseEnemyShots(hero.x, hero.y, auraRadius(w) * 1.3);
      w.pulse -= dt;
      if (w.pulse <= 0) {
        w.pulse += d.tick;
        eachEnemyNear(hero.x, hero.y, auraRadius(w), e => hit(e, w, d.damage, undefined, true));
      }
      if (hero.phaseLeft <= 0 && d.burst) explode(hero.x, hero.y, auraRadius(w) * 1.6, w, d.burst);
      return;
    }
    w.timer -= dt;
    if (w.timer <= 0) startPhase(w, false);
  },
};
