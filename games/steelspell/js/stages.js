// Stages and bosses. A run is three stages, each a farm that ends in a boss, then endless
// survival with a boss every few minutes. The numbers are STAGE and BOSS in data/enemies.js.
//
// Clocks: `elapsed` is the run's own time, boss fights included: records and the HUD show it.
// `worldTime` drives the horde's growth and stands still while a boss fight lasts.
// `stageTime` counts from the start of the run or from the last story boss's death (the rest
// after it included); `endlessTime` is world time since the third boss fell, for the walls.

const STORY_STAGES = 3;

let stage, stageTime, worldTime, endlessTime, restLeft, bossesKilled, clearTime, nextEndlessBoss, stageElites;
let altar = null; // { x, y, r } once it has risen this stage
let fight = null; // the boss fight going on: see startFight()
let victoryBoss = null; // the third boss, while the victory screen waits

function resetStages() {
  stage = 1;
  stageTime = 0;
  worldTime = 0;
  endlessTime = 0;
  restLeft = 0;
  bossesKilled = 0;
  clearTime = 0;
  nextEndlessBoss = BOSS.endless.every;
  stageElites = 0;
  altar = null;
  fight = null;
  victoryBoss = null;
}

function inEndless() { return stage > STORY_STAGES; }

// Where WAVES and RINGS are read: a stage always brings its own stretch of them, whatever the
// world clock says, and endless survival goes on from the end of the third.
function waveClock() {
  if (inEndless()) return STORY_STAGES * STAGE.length + endlessTime;
  return (stage - 1) * STAGE.length + Math.min(stageTime, STAGE.length);
}

// How much stronger the story boss comes for having been put off (from STAGE.growFrom on).
function bossBoost() {
  return Math.max(0, stageTime - STAGE.growFrom) / 60 * STAGE.growPerMinute;
}

// A new stage starts its rings from its own stretch of RINGS, skipping those it jumped past.
function skipRings() {
  while (ringEntry(nextRing).at < waveClock()) nextRing++;
}

// After the hero has moved, before anything else.
function updateStage(dt) {
  if (fight) {
    updateFight(dt);
    return;
  }
  worldTime += dt;
  stageTime += dt;
  if (restLeft > 0) restLeft = Math.max(0, restLeft - dt);
  if (inEndless()) {
    endlessTime += dt;
    if (endlessTime >= nextEndlessBoss) {
      nextEndlessBoss += BOSS.endless.every;
      startFight(false);
    }
    return;
  }
  if (!altar && stageTime >= STAGE.altarAt) placeAltar();
  const touched = altar && Math.hypot(hero.x - altar.x, hero.y - altar.y) < altar.r + hero.r;
  // The simulator's bot calls the boss at a set minute of the stage instead of walking there.
  const botCalls = simulating && simAltarAt > 0 && stageTime >= simAltarAt;
  if (touched || botCalls || stageTime >= STAGE.length) startFight(true);
}

function placeAltar() {
  const a = rand() * TAU;
  altar = { x: hero.x + Math.cos(a) * STAGE.altarDistance, y: hero.y + Math.sin(a) * STAGE.altarDistance, r: STAGE.altarR };
  say(t('toasts.altar'));
}

// ---- The boss ----

function byStage(value, level) { return Array.isArray(value) ? value[level - 1] : value; }

// The boss of stage `level` in `variant`, `boost` times as strong (health and damage). Its
// attacks are rows like the horde's, read for that stage.
function bossDef(level, variant, boost) {
  const v = BOSS.variants[variant];
  const read = row => {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === 'orb') out.orb = read(value);
      else if (key === 'damage') out.damage = byStage(value, level) * boost;
      else out[key] = byStage(value, level);
    }
    return out;
  };
  return {
    boss: true, elite: true, variant, level, shape: v.shape, pen: 'ink-muted', r: BOSS.r, speed: BOSS.speed,
    hp: BOSS.hp[level - 1] * v.hp * boost, damage: BOSS.damage[level - 1] * boost,
    armor: byStage(v.armor, level), ward: byStage(v.ward, level), xp: 0,
    attacks: BOSS.attacks.filter(row => row.from <= level).map(read),
  };
}

// The boss's own damage does not grow with the world clock: only its enrage doubles it.
function bossRage() { return fight && fight.time >= BOSS.enrageAfter ? BOSS.enrage : 1; }

// `story`: one of the three stage bosses, else an endless one (the third stage's body, each
// stronger than the last). The arena rises around the hero and the active skill is ready.
function startFight(story) {
  const level = story ? stage : STORY_STAGES;
  const variant = pickOne(Object.keys(BOSS.variants));
  const boost = story ? 1 + bossBoost() : (1 + BOSS.endless.grow) ** (bossesKilled - STORY_STAGES + 1);
  altar = null;
  fight = { story, stage: level, variant, boost, time: 0, phase: 0, x: hero.x, y: hero.y, r: BOSS.arena, horde: false, boss: null };
  const def = bossDef(level, variant, boost);
  const a = rand() * TAU;
  const e = makeEnemy(def, hero.x + Math.cos(a) * BOSS.spawnDistance, hero.y + Math.sin(a) * BOSS.spawnDistance,
    def.hp * (1 + gearValue('enemyHp')));
  e.cool = def.attacks.map(row => row.every * (0.5 + 0.5 * rand()));
  enemies.push(e);
  fight.boss = e;
  activeCd = 0;
  say(t('toasts.boss', { name: bossName(def) }));
}

function bossName(def) { return t(`boss.${def.variant}`); }

function updateFight(dt) {
  fight.time += dt;
  // The hero cannot leave the arena.
  const dx = hero.x - fight.x;
  const dy = hero.y - fight.y;
  const d = Math.hypot(dx, dy);
  const room = fight.r - hero.r;
  if (d > room) {
    hero.x = fight.x + dx / d * room;
    hero.y = fight.y + dy / d * room;
  }
  if (!fight.horde && fight.time >= BOSS.hordeAfter) {
    fight.horde = true;
    say(t('toasts.hordeBack'));
  }
  // At shares of its health the boss calls a ring of its own kind.
  const b = fight.boss;
  const marks = BOSS.phases[fight.stage - 1];
  while (fight.phase < marks.length && b.hp <= b.maxHp * marks[fight.phase]) {
    fight.phase++;
    const type = BOSS.variants[fight.variant].calls;
    for (let i = 0; i < BOSS.callCount; i++) addEnemy(type, i / BOSS.callCount * TAU);
    say(t('toasts.bossCalls'));
  }
}

// The new horde holds back for the first part of a fight, and for the rest after one.
function hordeHeldBack() {
  return restLeft > 0 || (fight && !fight.horde);
}

// The boss is down: the horde goes, every orb flies in, and a short rest follows.
function bossDown(e) {
  const story = fight.story;
  fight = null;
  bossesKilled++;
  addFx({ type: 'ring', x: e.x, y: e.y, r: e.r * 4, life: 0.8, pen: 'highlighter' });
  for (const o of enemies) if (o !== e) o.dead = true;
  enemyShots.length = 0;
  warnings.length = 0;
  pullEveryOrb();
  restLeft = STAGE.rest;
  say(t('toasts.bossDown'));
  if (!story) {
    chests.push({ x: e.x, y: e.y, type: BOSS.endless.chest, dead: false });
    return;
  }
  if (stage === STORY_STAGES) {
    clearTime = elapsed;
    if (simulating) {
      keepGoing(e);
      return;
    }
    victoryBoss = e;
    phase = 'victory';
    showVictory();
    return;
  }
  storyReward(e);
  stage++;
  stageTime = 0;
  stageElites = 0;
  skipRings();
}

// A story boss leaves a legendary chest, and the hero picks a weapon from the whole arsenal.
function storyReward(e) {
  chests.push({ x: e.x, y: e.y, type: 'legendary', dead: false });
  enqueueChoice('arsenal');
}

// From the victory screen on into endless survival.
function keepGoing(e) {
  stage = STORY_STAGES + 1;
  stageTime = 0;
  stageElites = 0;
  endlessTime = 0;
  nextEndlessBoss = BOSS.endless.every;
  skipRings();
  phase = 'playing';
  hideOverlay();
  storyReward(e);
}

// ---- Drawing ----

// The altar (with how much stronger the boss has grown) and the arena's edge.
function drawStageWorld() {
  if (altar && onScreen(altar.x, altar.y, 60)) {
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4);
    ctx.lineWidth = 3;
    ctx.strokeStyle = pal.highlighter;
    ctx.fillStyle = pal.desk;
    ctx.beginPath();
    ctx.moveTo(altar.x, altar.y - altar.r * 1.3);
    ctx.lineTo(altar.x + altar.r, altar.y);
    ctx.lineTo(altar.x, altar.y + altar.r * 1.3);
    ctx.lineTo(altar.x - altar.r, altar.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.25 + 0.35 * pulse;
    ctx.beginPath();
    ctx.arc(altar.x, altar.y, altar.r * (1.6 + 0.3 * pulse), 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const boost = bossBoost();
    if (boost > 0) {
      ctx.font = `600 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = pal['red-pencil'];
      ctx.fillText(t('hud.altarBoost', { boost: Math.round(boost * 100) }), altar.x, altar.y - altar.r * 1.3 - 8);
    }
  }
  if (fight) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = pal['red-pencil'];
    ctx.setLineDash([18, 10]);
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(fight.x, fight.y, fight.r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

// The boss's body: its kind's outline, thick, and red while it rages.
function drawBoss(e) {
  if (!onScreen(e.x, e.y, e.r * 2)) return;
  ctx.beginPath();
  traceBody(e);
  ctx.fillStyle = pal[e.def.pen];
  ctx.fill();
  const v = e.def.variant;
  ctx.strokeStyle = v === 'armor' ? pal[KINDS.phys.pen] : v === 'ward' ? pal[KINDS.magic.pen] : pal.ink;
  ctx.lineWidth = 7;
  ctx.stroke();
  if (bossRage() > 1) {
    ctx.strokeStyle = pal['red-pencil'];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 1.35, 0, TAU);
    ctx.stroke();
  }
}

// The stage line under the clock, the boss's health in a fight, and an arrow to the altar.
function drawStageHud(W, H) {
  if (fight && fight.boss) {
    const b = fight.boss;
    const w = Math.min(420, W * 0.5);
    const x = (W - w) / 2;
    hudText(t('hud.bossBar', { name: bossName(b.def), stage: fight.stage, armor: Math.round(b.armor), ward: Math.round(b.ward) }), W / 2, 50, 13, 'ink', 'center');
    ctx.fillStyle = pal.desk;
    ctx.fillRect(x, 56, w, 8);
    ctx.fillStyle = pal['red-pencil'];
    ctx.fillRect(x, 56, w * Math.max(0, b.hp / b.maxHp), 8);
    const left = BOSS.enrageAfter - fight.time;
    hudText(left > 0 ? t('hud.enrageIn', { time: formatTime(left) }) : t('hud.enraged'), W / 2, 78, 12, left > 0 ? 'ink-muted' : 'red-pencil', 'center');
    return;
  }
  let text;
  if (restLeft > 0) text = t('hud.rest', { time: formatTime(restLeft) });
  else if (inEndless()) text = t('hud.endless', { time: formatTime(nextEndlessBoss - endlessTime) });
  else if (!altar) text = t('hud.stageAltar', { stage, time: formatTime(STAGE.altarAt - stageTime) });
  else text = t('hud.stageBoss', { stage, boost: Math.round(bossBoost() * 100), time: formatTime(STAGE.length - stageTime) });
  hudText(text, W / 2, 48, 13, 'ink-muted', 'center');
  if (altar) drawAltarArrow(W, H);
}

function drawAltarArrow(W, H) {
  const sx = (altar.x - cam.x) * view.scale;
  const sy = (altar.y - cam.y) * view.scale;
  const pad = 28;
  if (sx > pad && sx < W - pad && sy > pad && sy < H - pad) return;
  const cx = W / 2;
  const cy = H / 2;
  const a = Math.atan2(sy - cy, sx - cx);
  const k = Math.min((W / 2 - pad) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - pad) / Math.abs(Math.sin(a) || 1e-6));
  const x = cx + Math.cos(a) * k;
  const y = cy + Math.sin(a) * k;
  ctx.fillStyle = pal.highlighter;
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
  ctx.lineTo(x + Math.cos(a + 2.5) * 10, y + Math.sin(a + 2.5) * 10);
  ctx.lineTo(x + Math.cos(a - 2.5) * 10, y + Math.sin(a - 2.5) * 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// ---- The victory screen ----

function showVictory() {
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', t('victory.title')));
    const notes = [t('victory.note', { time: formatTime(clearTime) })];
    const best = fastestClear(loadRecords());
    if (!cheated && (!best || clearTime < best)) notes.push(t('victory.best'));
    p.appendChild(el('p', 'panel-note', notes.join(' ')));
    const actions = el('div', 'panel-actions');
    const go = el('button', 'primary', t('victory.continue'));
    go.addEventListener('click', () => {
      const e = victoryBoss;
      victoryBoss = null;
      keepGoing(e);
    });
    const end = el('button', '', t('victory.end'));
    end.addEventListener('click', () => {
      victoryBoss = null;
      endRun();
    });
    actions.append(go, end);
    p.appendChild(actions);
  });
}
