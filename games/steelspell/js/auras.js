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

// The oval sits ahead of the hero, who stays inside it near the back end.
function lanceOval(w) {
  const d = w.cfg;
  const size = weaponSize(w);
  return {
    x: hero.x + Math.cos(w.angle) * d.shift * size,
    y: hero.y + Math.sin(w.angle) * d.shift * size,
    long: d.long * size,
    wide: d.wide * size,
  };
}

const TICK = {
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

  radiantlance(w, dt) {
    strikeLance(w, dt, fn => {
      const { x, y, long, wide } = lanceOval(w);
      eachEnemyInOval(x, y, w.angle, long, wide, e => fn(e));
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
