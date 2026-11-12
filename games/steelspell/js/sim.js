// Balance simulator and dev keys. Nothing here is needed to play.
//
// index.html?sim=kite&cards=balanced&runs=10&seed=1 plays whole runs without drawing them
// and shows a table. Parameters:
//   sim      afk (stands still) | orbit (walks a circle) | kite (keeps away from the horde,
//            collects orbs) | brawl (kite, but walks at the enemy: for melee weapons) | dummy
//   cards    random | balanced (weapons and damage first) | xp (XP first)
//   runs     how many runs, each with the next seed      seed     the first seed
//   minutes  where to stop a run (default 45)            weapon, active   fix the loadout
//   after    with sim=afk: play as kite for this many minutes, then stand still
//   god=1    a death does not end the run: deaths are counted, three in a minute end it
//   meta     0 (default) | max: Camp upgrades for the run
//   patch    a line of code run before each run, to try other numbers: patch=XP.curve=0.1
// index.html?sim=dummy&weapon=<id>&level=<n>&evo=<0|1> measures one weapon's damage per second
// against rings of dummies that neither move nor die. For a merged weapon, parts=<0|1>,<0|1>
// picks the evolutions of its two parts that it keeps.

const SIM_PARAMS = new URLSearchParams(location.search);
const SIM_IN_WORKER = typeof importScripts === 'function';
const SIM_VIEW = { w: 960, h: 560 }; // world units: a fixed screen keeps runs repeatable
const SIM_DT = 1 / 60;
const SIM_BOTS = ['afk', 'orbit', 'kite', 'brawl'];
const SIM_DUMMY = { name: 'Dummy', shape: 'circle', pen: 'ink-muted', r: 11, hp: 1e12, speed: 0, damage: 0, armor: 0, ward: 0, xp: 0 };
const SIM_DUMMY_RINGS = [[70, 10], [140, 18], [220, 26]]; // radius, how many
const SIM_DUMMY_SECONDS = 30;

// What the `balanced` policy thinks a card is worth.
const SIM_STAT_SCORE = {
  damage: 50, attack: 46, count: 42, cooldown: 38, haste: 38, critChance: 26, critDamage: 24, size: 22,
  duration: 20, vitality: 14, armor: 14, recovery: 8, speed: 8, magnet: 6, xp: 5,
};
const SIM_RARITY_SCORE = { grey: 10, blue: 20, purple: 30, legendary: 40 };

let simResults = [];
let simSeed = 1;
let simThink = 0;
let simDir = 0;
let simAngle = 0;
let simWorkersOk = !SIM_IN_WORKER && typeof Worker === 'function' && location.protocol !== 'file:';

// The bots' own dice, so that a policy never shifts the game's.
function simRand() {
  simSeed = (simSeed + 0x6D2B79F5) | 0;
  let t = Math.imul(simSeed ^ (simSeed >>> 15), 1 | simSeed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function simMedian(list) {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

// ---- Card policies ----

function simScore(card, job) {
  const item = card.type === 'item' && ITEMS.find(i => i.id === card.id);
  if (job.cards === 'xp' && (card.key === 'xp' || (item && item.gives.xp))) return 500;
  if (card.type === 'merge') return 400;
  if (card.type === 'evolve') return 100 + simRand();
  if (card.type === 'weapon') {
    const def = WEAPON_DEFS.find(d => d.id === card.id);
    return 60 + (card.synergy ? 20 : 0) - (def.defense ? 15 : 0) + simRand() * 10;
  }
  if (card.type === 'upgrade') return 55 + simRand() * 5;
  if (item) return SIM_RARITY_SCORE[item.rarity] + simRand() * 5;
  return (SIM_STAT_SCORE[card.key] || 1) + simRand();
}

function simPickCard(job) {
  if (job.cards === 'random') return Math.floor(simRand() * shownCards.length);
  let best = 0;
  let top = -Infinity;
  shownCards.forEach((card, i) => {
    const score = simScore(card, job);
    if (score > top) {
      top = score;
      best = i;
    }
  });
  return best;
}

// ---- Bots ----

function simCount(radius) {
  let n = 0;
  for (const e of enemies) if (Math.hypot(e.x - hero.x, e.y - hero.y) < radius) n++;
  return n;
}

// Mobility when cornered, Ignite on a crowd, the rest as soon as it is ready.
function simUseActive() {
  if (activeCd > 0) return;
  const id = activeDef.id;
  if (id === 'flash' || id === 'ghost') {
    if (simCount(70) >= 3) useActive();
  } else if (id === 'ignite') {
    if (simCount(200) >= 6) useActive();
  } else {
    useActive();
  }
}

function simWalk(a) {
  simDir = a;
  stick.x = Math.cos(a);
  stick.y = Math.sin(a);
}

// Tries 16 directions and standing still, and takes the one that costs least: enemies that
// can reach the spot cost most, then the distance to something worth picking up.
function simKite(job) {
  if (--simThink > 0) return;
  simThink = 5;
  const hx = hero.x;
  const hy = hero.y;
  const look = 0.6; // seconds ahead
  const safe = 55;
  const pace = HERO.speed * stat('speed') * (hero.ghostLeft > 0 ? activeDef.speedBoost : 1);
  const hurry = 1 + GROWTH.speed * elapsed / 60;
  const close = enemies.filter(e => Math.hypot(e.x - hx, e.y - hy) < 340);

  let goal = null;
  let pull = 300;
  let best = 900;
  for (const o of orbs) {
    const d = Math.hypot(o.x - hx, o.y - hy) / Math.sqrt(o.value);
    if (d < best) {
      best = d;
      goal = o;
    }
  }
  const orbNear = best < 260;
  const grab = (list, range, strength) => {
    let nearest = range;
    for (const o of list) {
      const d = Math.hypot(o.x - hx, o.y - hy);
      if (d < nearest) {
        nearest = d;
        goal = o;
        pull = strength;
      }
    }
  };
  if (hero.hp < hero.maxHp * 0.7) grab(redOrbs, 800, 150);
  grab(chests, 1600, 110);
  if (typeof magnets !== 'undefined') grab(magnets, 900, 130);

  if (job.bot === 'brawl' && close.length && hero.hp > hero.maxHp * 0.35 && simCount(70) < 3) {
    const target = close.reduce((a, b) => (Math.hypot(b.x - hx, b.y - hy) < Math.hypot(a.x - hx, a.y - hy) ? b : a));
    simWalk(Math.atan2(target.y - hy, target.x - hx));
    return;
  }
  // A player who wants chests stays in weapon range of an elite instead of leaving it behind.
  const elite = hero.hp > hero.maxHp * 0.4 && !chests.length && !orbNear ? enemies.find(e => e.def.elite) : null;
  const threats = typeof simThreats === 'function' ? simThreats() : [];

  let pick = null;
  let low = Infinity;
  for (let i = 0; i <= 16; i++) {
    const still = i === 16;
    const a = i / 16 * TAU;
    const px = hx + (still ? 0 : Math.cos(a) * pace * look);
    const py = hy + (still ? 0 : Math.sin(a) * pace * look);
    let cost = still ? 0.05 : 0;
    if (hero.ghostLeft <= 0) {
      for (const e of close) {
        const d = Math.hypot(px - e.x, py - e.y) || 1;
        const gap = d - e.def.speed * hurry * look - e.r - hero.r;
        if (gap < safe) cost += ((safe - gap) / safe) ** 2 * (e.def.elite ? 3 : 1);
        cost += 2 / (d + 60);
      }
      for (const t of threats) {
        const d = Math.hypot(px - t.x, py - t.y);
        if (d < t.r + hero.r + 10) cost += t.weight;
      }
    }
    if (goal) cost += Math.hypot(px - goal.x, py - goal.y) / pull;
    if (elite) cost += Math.abs(Math.hypot(px - elite.x, py - elite.y) - 150) / 200;
    if (!still && angleGap(a, simDir) < 0.5) cost -= 0.05;
    if (cost < low) {
      low = cost;
      pick = still ? null : a;
    }
  }
  if (pick === null) {
    stick.x = 0;
    stick.y = 0;
  } else {
    simWalk(pick);
  }
}

// Where the bot should not be in a moment: strikes about to land and shots on their way.
function simThreats() {
  const list = [];
  for (const w of warnings) {
    if (w.shape === 'circle') {
      if (w.damage) list.push({ x: w.x, y: w.y, r: w.r, weight: 4 });
    } else {
      for (const share of [0.2, 0.5, 0.8]) {
        list.push({ x: w.x + Math.cos(w.a) * w.length * share, y: w.y + Math.sin(w.a) * w.length * share, r: w.half + 30, weight: 4 });
      }
    }
  }
  for (const s of enemyShots) {
    if (Math.hypot(s.x - hero.x, s.y - hero.y) > 260) continue;
    for (const t of [0.3, 0.6]) list.push({ x: s.x + s.vx * t, y: s.y + s.vy * t, r: s.r + 12, weight: 1.5 });
  }
  return list;
}

function simSteer(job) {
  const standing = job.bot === 'afk' && elapsed >= (job.after || 0) * 60;
  stick.active = !standing;
  if (standing) return;
  if (job.bot === 'orbit') {
    simAngle += HERO.speed * stat('speed') * SIM_DT / 200;
    simWalk(simAngle);
  } else {
    simKite(job);
  }
}

// ---- One run ----

// Notes when a weapon arrives, gains a level, evolves or comes out of a merge.
function simTrack(seen, events) {
  const t = Math.round(elapsed);
  const max = typeof MAX_WEAPON_LEVEL === 'number' ? MAX_WEAPON_LEVEL : Infinity;
  for (const w of hero.weapons) {
    const id = w.def.id;
    const was = seen.get(id);
    const now = { level: w.level || 1, evo: w.evo || '' };
    if (!was) {
      events.push({ t, id, what: w.def.needs ? 'merged' : 'got' });
    } else {
      if (now.level !== was.level) events.push({ t, id, what: now.level >= max ? 'max' : `lv${now.level}` });
      if (now.evo !== was.evo) events.push({ t, id, what: `evo:${now.evo}` });
    }
    seen.set(id, now);
  }
}

function simPrepare(job) {
  if (job.patch) (0, eval)(job.patch); // tuning: try other numbers without touching the tables
  simulating = true;
  view.w = SIM_VIEW.w;
  view.h = SIM_VIEW.h;
  simSeed = (job.seed ^ 0x5bd1e995) | 0;
  simThink = 0;
  simDir = 0;
  simAngle = 0;
  setMetaForRun(job.meta === 'max' ? 'max' : 'none');
}

function simRun(job) {
  simPrepare(job);
  if (job.bot === 'dummy') return simDummy(job);
  const realEnd = window.endRun;
  const deaths = [];
  if (job.god) {
    window.endRun = () => {
      if (hero.hp > 0) return realEnd();
      deaths.push(elapsed);
      hero.hp = hero.maxHp;
      hero.iframes = 1.5;
    };
  }
  startRun(job.active, job.weapon, job.seed);
  const cap = job.minutes * 60;
  const perMinute = [];
  const events = [];
  const seen = new Map();
  let taken = 0;
  let hurt = 0;
  let steps = 0;
  let ms = 0;
  let wall = 0;
  while (phase !== 'over' && elapsed < cap) {
    if (phase === 'choosing') {
      chooseCard(simPickCard(job));
      continue;
    }
    simSteer(job);
    simUseActive();
    const hp = hero.hp;
    const t0 = performance.now();
    update(SIM_DT);
    ms += performance.now() - t0;
    if (hero.hp < hp) {
      taken += hp - hero.hp;
      hurt += hp - hero.hp;
    }
    if (++steps % 60 === 0) simTrack(seen, events);
    if (elapsed >= (perMinute.length + 1) * 60) {
      perMinute.push({ level, kills, taken: Math.round(taken) });
      taken = 0;
    }
    if (deaths.length >= 3 && elapsed - deaths[deaths.length - 3] <= 60) {
      wall = elapsed;
      break;
    }
  }
  window.endRun = realEnd;
  const capped = phase !== 'over' && !wall;
  phase = 'over';
  stick.active = false;
  simulating = false;
  setMetaForRun(null);
  const dealt = {};
  for (const w of hero.weapons) dealt[w.def.name] = Math.round(w.dealt);
  return {
    bot: job.bot, cards: job.cards, seed: job.seed, weapon: job.weapon, active: job.active, god: !!job.god,
    death: Math.round(deaths.length ? deaths[0] : elapsed), wall: Math.round(wall), deaths: deaths.length, capped,
    level, kills, perMinute, dealt, events, items: items.length, maxHp: hero.maxHp,
    hurtPerMinute: Math.round(hurt / Math.max(1 / 60, elapsed / 60)),
    hurtBy: Object.fromEntries(Object.entries(hero.hurtBy).map(([k, v]) => [k, Math.round(v)])),
    kit: hero.weapons.map(w => w.def.tag + (w.level ? w.level : '')),
    updateMs: +(ms / Math.max(1, steps)).toFixed(3),
  };
}

function simDummyAt(x, y, r) {
  enemies.push({
    def: SIM_DUMMY, x, y, r, hp: SIM_DUMMY.hp, maxHp: SIM_DUMMY.hp, slowLeft: 0, slowBy: 0, flash: 0,
    pushLeft: 0, pushX: 0, pushY: 0, speared: false, dead: false, freezeLeft: 0, rootLeft: 0, dash: null, side: 1, cool: null,
  });
  return enemies[enemies.length - 1];
}

function simDummy(job) {
  const real = { spawnEnemies, moveEnemies, collideHero };
  window.spawnEnemies = () => {};
  window.moveEnemies = () => {};
  window.collideHero = () => {};
  startRun('flash', WEAPONS[0].id, job.seed);
  hero.weapons = [newWeapon(job.weapon)];
  const w = hero.weapons[0];
  if (job.level > 1 && typeof setWeaponLevel === 'function') setWeaponLevel(w, job.level);
  if (job.evo !== undefined && typeof evolveWeapon === 'function') evolveWeapon(w, job.evo);
  if (job.parts && w.def.needs) {
    w.parts = w.def.needs.map((id, i) => ({ id, evo: EVOLUTIONS[id][job.parts[i]].id }));
    rebuildWeapon(w);
  }
  queue.length = 0;
  for (const [radius, count] of SIM_DUMMY_RINGS) {
    for (let i = 0; i < count; i++) {
      const a = (i + 0.5) / count * TAU;
      simDummyAt(Math.cos(a) * radius, Math.sin(a) * radius, SIM_DUMMY.r);
    }
  }
  const boss = simDummyAt(60, 0, 28); // right ahead: what a single big target takes
  rebuildGrid();
  for (let i = 0; i < SIM_DUMMY_SECONDS / SIM_DT; i++) {
    hero.hp = hero.maxHp;
    // A weapon that works only on the move (Fire Trail) gets a walk to and fro through the rings.
    stick.active = !!(w.def.every || w.def.trail);
    simWalk(Math.floor(i * SIM_DT / 2) % 2 ? Math.PI : 0);
    update(SIM_DT);
    while (phase === 'choosing') chooseCard(0);
  }
  Object.assign(window, real);
  phase = 'over';
  stick.active = false;
  simulating = false;
  setMetaForRun(null);
  return {
    bot: 'dummy', weapon: job.weapon, level: w.level || 1, evo: w.evo || (w.parts || []).map(p => p.evo).join('+'),
    crowd: Math.round(w.dealt / SIM_DUMMY_SECONDS), single: Math.round((boss.maxHp - boss.hp) / SIM_DUMMY_SECONDS),
  };
}

// ---- Many runs ----

function simJobs(params) {
  const bot = params.get('sim') || 'kite';
  const seed = Number(params.get('seed')) || 1;
  const runs = Number(params.get('runs')) || (bot === 'dummy' ? 1 : 10);
  if (bot === 'dummy') {
    const ids = params.get('weapon') ? params.get('weapon').split(',') : WEAPON_DEFS.map(d => d.id);
    return ids.map(weapon => ({
      bot, weapon, seed, level: Number(params.get('level')) || 1,
      evo: params.has('evo') ? Number(params.get('evo')) : undefined, patch: params.get('patch') || '',
      parts: params.has('parts') ? params.get('parts').split(',').map(Number) : undefined,
    }));
  }
  const starters = WEAPONS.filter(d => !d.defense).map(d => d.id);
  const jobs = [];
  for (let i = 0; i < runs; i++) {
    jobs.push({
      bot, cards: params.get('cards') || 'balanced', seed: seed + i,
      minutes: Number(params.get('minutes')) || 45,
      weapon: params.get('weapon') || starters[i % starters.length],
      active: params.get('active') || ACTIVES[i % ACTIVES.length].id,
      god: params.get('god') === '1', meta: params.get('meta') || '0', after: Number(params.get('after')) || 0,
      patch: params.get('patch') || '',
    });
  }
  return jobs;
}

function simTry(job) {
  try {
    return simRun(job);
  } catch (err) {
    simulating = false;
    return { error: String(err && err.stack || err), job };
  }
}

// In workers when the page is served over http, a few at once; otherwise here, one by one.
function simRunAll(jobs, onProgress = () => {}) {
  const results = new Array(jobs.length);
  const scripts = [...document.scripts].map(s => s.src).filter(src => src.includes('/steelspell/'));
  let next = 0;
  let done = 0;
  return new Promise(resolve => {
    const finish = (i, result) => {
      results[i] = result;
      onProgress(++done, jobs.length);
      if (done === jobs.length) resolve(results);
      else startOne();
    };
    const here = i => setTimeout(() => finish(i, simTry(jobs[i])), 0);
    function startOne() {
      if (next >= jobs.length) return;
      const i = next++;
      if (!simWorkersOk) return here(i);
      let worker;
      try {
        worker = new Worker('js/sim-worker.js');
      } catch (err) {
        simWorkersOk = false;
        return here(i);
      }
      worker.onmessage = e => {
        worker.terminate();
        finish(i, e.data.result || { error: e.data.error, job: jobs[i] });
      };
      worker.onerror = () => {
        worker.terminate();
        simWorkersOk = false;
        here(i);
      };
      worker.postMessage({ scripts, job: jobs[i] });
    }
    const lanes = simWorkersOk ? Math.max(1, (navigator.hardwareConcurrency || 4) - 1) : 1;
    for (let k = 0; k < Math.min(lanes, jobs.length); k++) startOne();
    if (!jobs.length) resolve(results);
  });
}

// ---- Reports ----

function simRow(r) {
  if (r.error) return { error: r.error.split('\n').slice(0, 2).join(' ') };
  if (r.bot === 'dummy') return { weapon: r.weapon, level: r.level, evo: r.evo, crowd: r.crowd, single: r.single };
  const at = m => (r.perMinute[m - 1] ? r.perMinute[m - 1].level : '');
  const total = Object.values(r.dealt).reduce((a, b) => a + b, 0) || 1;
  const top = Object.entries(r.dealt).sort((a, b) => b[1] - a[1])[0];
  const row = {
    seed: r.seed, start: r.weapon, active: r.active, death: formatTime(r.death) + (r.capped ? '+' : ''),
  };
  if (r.god) row.wall = r.wall ? formatTime(r.wall) : '';
  return Object.assign(row, {
    level: r.level, kills: r.kills, 'L@5': at(5), 'L@10': at(10), 'L@15': at(15),
    'hurt/min': r.hurtPerMinute,
    top: top ? `${top[0]} ${Math.round(top[1] / total * 100)}%` : '', kit: r.kit.join(' '), items: r.items, ms: r.updateMs,
  });
}

function simSummary(results) {
  const runs = results.filter(r => !r.error && r.bot !== 'dummy');
  if (!runs.length) return null;
  const deaths = runs.map(r => r.death);
  const walls = runs.filter(r => r.god).map(r => r.wall || r.death);
  const at10 = runs.filter(r => r.perMinute[9]).map(r => r.perMinute[9].level);
  // The first minute in which the median run takes no damage at all, after 2:00.
  const quiet = [];
  for (let m = 2; m < 60; m++) {
    const alive = runs.filter(r => r.perMinute[m]);
    if (alive.length < runs.length / 2) break;
    if (simMedian(alive.map(r => r.perMinute[m].taken)) === 0) quiet.push(m + 1);
  }
  const firstWhat = what => simMedian(runs.map(r => (r.events.find(e => e.what === what) || { t: Infinity }).t));
  return {
    runs: runs.length, errors: results.length - runs.length - results.filter(r => r.bot === 'dummy').length,
    death: formatTime(simMedian(deaths)), min: formatTime(Math.min(...deaths)), max: formatTime(Math.max(...deaths)),
    wall: walls.length ? formatTime(simMedian(walls)) : '', capped: runs.filter(r => r.capped).length,
    level10: at10.length ? simMedian(at10) : '', quietMinutes: quiet.length,
    firstMax: firstWhat('max'), firstMerge: firstWhat('merged'),
    ms: +(runs.reduce((sum, r) => sum + r.updateMs, 0) / runs.length).toFixed(3),
  };
}

function simShow(results) {
  const rows = results.map(simRow);
  const summary = simSummary(results);
  console.table(rows);
  if (summary) console.table([summary]);
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', 'Simulation'));
    if (summary) {
      const stamp = t => (Number.isFinite(t) ? formatTime(t) : 'never');
      p.appendChild(el('p', 'panel-note',
        `${summary.runs} runs · median death ${summary.death} (${summary.min} to ${summary.max})` +
        (summary.wall ? ` · overrun at ${summary.wall}` : '') +
        ` · level at 10:00: ${summary.level10} · minutes without a scratch: ${summary.quietMinutes}` +
        ` · first weapon maxed ${stamp(summary.firstMax)}, first merge ${stamp(summary.firstMerge)}` +
        ` · update ${summary.ms} ms` + (summary.errors ? ` · ${summary.errors} errors` : '')));
    }
    const scroll = el('div', 'table-scroll');
    const table = el('table', 'data-table');
    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const head = el('tr');
    keys.forEach(k => head.appendChild(el('th', '', k)));
    table.appendChild(head);
    for (const row of rows) {
      const tr = el('tr');
      keys.forEach(k => tr.appendChild(el('td', '', row[k] === undefined ? '' : String(row[k]))));
      table.appendChild(tr);
    }
    scroll.appendChild(table);
    p.appendChild(scroll);
  });
}

function simBoot() {
  const jobs = simJobs(SIM_PARAMS);
  let note;
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', 'Simulating'));
    note = el('p', 'panel-note', `0 / ${jobs.length}`);
    p.appendChild(note);
  });
  simRunAll(jobs, (done, all) => setText(note, `${done} / ${all}`)).then(results => {
    simResults = results;
    simShow(results);
  });
}

// ---- Dev keys (with ?dev in the URL) ----

function devKey(code) {
  if (code === 'KeyL') gainXp(xpNext - xp);
  else if (code === 'KeyG') enqueueChoice('weapon');
  else if (code === 'KeyI') enqueueChoice(pickWeighted(CHEST_ROLL));
  else if (code === 'KeyR') activeCd = 0;
  else if (code === 'KeyT') elapsed += 60;
  else if (code === 'KeyE') addEnemy(pickOne(['hulk', 'warden', 'siege']));
  else if (code === 'KeyF') ['slinger', 'slinger', 'slinger', 'slinger', 'hexer', 'hexer', 'mortar', 'mortar'].forEach(type => addEnemy(type));
  else if (code === 'KeyO') {
    // Stress test: fill the horde up to its cap.
    while (enemies.length < MAX_ENEMIES) addEnemy(pickOne(['mite', 'runner', 'ironclad', 'warded']));
  } else if (code === 'KeyM') {
    const w = hero.weapons.find(canLevel);
    if (w) {
      while (canLevel(w)) levelUpWeapon(w);
      say(`${w.def.name} is at its last level`);
      if (queue.length) nextChoice();
    }
  } else if (code === 'KeyH') {
    hero.immortal = !hero.immortal;
    say(hero.immortal ? 'Immortal' : 'Mortal again');
  } else if (code === 'KeyK') {
    hero.lives = Math.max(1, hero.lives);
    hero.hp = 0;
  }
}

if (!SIM_IN_WORKER && SIM_PARAMS.has('sim')) window.addEventListener('load', simBoot);
