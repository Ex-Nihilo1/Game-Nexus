// Tower defense: vanilla JS + canvas, no dependencies.
// Light on low-end devices: the map is pre-rendered once (and again when the
// theme changes), and the board is only redrawn while something is moving.
// Distances in the data tables are in cells, speeds in cells per second.

const CELL = 36;
const COLS = 20;
const ROWS = 13;
const W = COLS * CELL;
const H = ROWS * CELL;
const DPR = Math.min(2, window.devicePixelRatio || 1);

const INCOME_EVERY = 10; // seconds of wave time between a Mint's payouts
const SELL_BACK = 0.7;
const TOWER_LIMIT = 3; // of each type, so spare gold goes into upgrades
const HP_PER_WAVE = 0.13; // enemy health grows this much per wave
const BOSS_SLOW_RESIST = 0.5;
const MAX_FX = 150;

// Roads are lists of corners in cell coordinates; a corner just off the board
// makes enemies walk in from the edge. All segments are horizontal or vertical.
const MAPS = [
  {
    id: 'switchback', name: 'Switchback', level: 'Easy', waves: 10, gold: 240, lives: 20, hp: 0.9,
    note: 'One long road that doubles back on itself.',
    roads: [[[-1, 2], [16, 2], [16, 6], [3, 6], [3, 10], [20, 10]]],
    rocks: [[9, 4], [10, 4], [9, 8], [10, 8], [18, 5]],
  },
  {
    id: 'fork', name: 'Fork', level: 'Normal', waves: 12, gold: 240, lives: 20, hp: 1.3, midBoss: 7,
    note: 'Two entrances join into one road, so the junction is worth holding.',
    roads: [
      [[-1, 2], [6, 2], [6, 6], [13, 6], [13, 10], [17, 10], [17, 2], [20, 2]],
      [[-1, 10], [6, 10], [6, 6], [13, 6], [13, 10], [17, 10], [17, 2], [20, 2]],
    ],
    rocks: [[10, 2], [11, 2], [10, 10], [11, 10], [2, 6], [15, 4]],
  },
  {
    id: 'spiral', name: 'Spiral', level: 'Hard', waves: 12, gold: 200, lives: 15, hp: 1.8, midBoss: 7,
    note: 'A long walk to the center. Great coverage, but raiders reach everything.',
    roads: [[[-1, 1], [18, 1], [18, 11], [2, 11], [2, 4], [15, 4], [15, 8], [6, 8]]],
    rocks: [[0, 6], [0, 7], [10, 6], [11, 6], [16, 9], [17, 9]],
  },
  {
    id: 'crossfire', name: 'Crossfire', level: 'Very hard', waves: 15, gold: 300, lives: 15, hp: 1.4, midBoss: 8,
    note: 'Two separate roads with two exits and rocky ground. They cross once.',
    roads: [
      [[-1, 3], [9, 3], [9, 9], [20, 9]],
      [[15, -1], [15, 6], [4, 6], [4, 13]],
    ],
    rocks: [[12, 2], [12, 3], [2, 9], [2, 10], [17, 3], [18, 3], [12, 11], [13, 11], [7, 11], [18, 11], [7, 1]],
  },
];

// Each tower has three levels. A level's cost is what it takes to build or reach it.
const TOWERS = [
  {
    id: 'gunner', name: 'Gunner', pen: 'blue-pen', aim: 'first', shotSpeed: 10, shotSize: 2,
    blurb: 'Cheap and quick. Armor blunts its small bullets.',
    levels: [
      { cost: 50, hp: 80, damage: 8, rate: 2.2, range: 2.6 },
      { cost: 40, hp: 105, damage: 13, rate: 2.5, range: 2.8 },
      { cost: 90, hp: 140, damage: 20, rate: 3, range: 3 },
    ],
  },
  {
    id: 'cannon', name: 'Cannon', pen: 'orange-pen', aim: 'first', shotSpeed: 6, shotSize: 4,
    blurb: 'Slow shells that blast everything around the target.',
    levels: [
      { cost: 90, hp: 120, damage: 30, rate: 0.65, range: 2.6, splash: 1.1 },
      { cost: 75, hp: 160, damage: 52, rate: 0.7, range: 2.8, splash: 1.3 },
      { cost: 150, hp: 210, damage: 90, rate: 0.75, range: 3, splash: 1.6 },
    ],
  },
  {
    id: 'frost', name: 'Frost', pen: 'violet', aim: 'unslowed', shotSpeed: 7, shotSize: 3,
    blurb: 'Slows enemies so other towers get more time to fire.',
    levels: [
      { cost: 70, hp: 80, damage: 4, rate: 1.1, range: 2.4, slow: 0.35, slowFor: 1.5 },
      { cost: 60, hp: 105, damage: 7, rate: 1.2, range: 2.6, slow: 0.5, slowFor: 1.8 },
      { cost: 110, hp: 130, damage: 10, rate: 1.3, range: 2.8, slow: 0.6, slowFor: 2, splash: 0.9 },
    ],
  },
  {
    id: 'sniper', name: 'Sniper', pen: 'ink', aim: 'strongest', beam: true,
    blurb: 'Huge range, picks the toughest target and ignores armor.',
    levels: [
      { cost: 120, hp: 70, damage: 60, rate: 0.45, range: 5.2 },
      { cost: 100, hp: 90, damage: 110, rate: 0.5, range: 6 },
      { cost: 190, hp: 115, damage: 200, rate: 0.55, range: 6.8 },
    ],
  },
  {
    id: 'mender', name: 'Mender', pen: 'green-ink',
    blurb: 'Repairs every tower in range, itself included.',
    levels: [
      { cost: 80, hp: 90, heal: 5, range: 2.4 },
      { cost: 70, hp: 120, heal: 9, range: 2.8 },
      { cost: 130, hp: 160, heal: 15, range: 3.2 },
    ],
  },
  {
    id: 'mint', name: 'Mint', pen: 'highlighter',
    blurb: 'Earns gold while a wave is on. Keep it away from the road.',
    levels: [
      { cost: 100, hp: 70, income: 8 },
      { cost: 70, hp: 95, income: 14 },
      { cost: 120, hp: 120, income: 22 },
    ],
  },
];

// How a level's numbers are shown in the side panel.
const STATS = [
  { key: 'damage', name: 'Damage', show: v => v },
  { key: 'rate', name: 'Shots / s', show: v => v },
  { key: 'range', name: 'Range', show: v => v + ' cells' },
  { key: 'splash', name: 'Blast', show: v => v + ' cells' },
  { key: 'slow', name: 'Slows by', show: v => Math.round(v * 100) + '%' },
  { key: 'heal', name: 'Repairs', show: v => v + ' hp / s' },
  { key: 'income', name: 'Pays', show: v => `${v} / ${INCOME_EVERY} s` },
];

// An enemy with `attack` fights towers on the way; a melee one stops to do it.
const ENEMIES = {
  scout: { name: 'Scout', pen: 'highlighter', shape: 'triangle', r: 8, hp: 28, speed: 2.2, gold: 3, lives: 1,
    note: 'Fast and frail.' },
  grunt: { name: 'Grunt', pen: 'green-ink', shape: 'circle', r: 9, hp: 55, speed: 1.3, gold: 5, lives: 1,
    note: 'Plain walker. Comes in numbers.' },
  brute: { name: 'Brute', pen: 'ink-muted', shape: 'square', r: 12, hp: 220, armor: 4, speed: 0.85, gold: 15, lives: 2,
    note: 'Slow, armored, costs 2 lives if it gets through.' },
  raider: { name: 'Raider', pen: 'red-pencil', shape: 'diamond', r: 10, hp: 70, speed: 1.2, gold: 9, lives: 1,
    attack: { range: 2.6, damage: 5, rate: 0.8 },
    note: 'Shoots the nearest tower as it walks.' },
  sapper: { name: 'Sapper', pen: 'orange-pen', shape: 'hex', r: 10, hp: 110, armor: 1, speed: 1.2, gold: 11, lives: 1,
    attack: { range: 1.3, damage: 9, rate: 1.2, melee: true },
    note: 'Stops to tear down towers right next to the road.' },
  walker: { name: 'Walker', pen: 'violet', shape: 'octagon', r: 16, hp: 1400, armor: 6, speed: 0.7, gold: 60, lives: 5,
    boss: true, attack: { range: 3.2, damage: 22, rate: 0.6 },
    note: 'Boss. Heavy guns, heavy armor, half effect from Frost, costs 5 lives.' },
};

const SHAPES = {
  triangle: { sides: 3, turn: 0, facing: true },
  square: { sides: 4, turn: Math.PI / 4 },
  diamond: { sides: 4, turn: 0 },
  hex: { sides: 6, turn: 0 },
  octagon: { sides: 8, turn: Math.PI / 8 },
};

const MAP_KEY = 'games.towerdefense.map';
const BEST_KEY = 'games.towerdefense.best';

const FONT = 'Bahnschrift, "Segoe UI", sans-serif';
const FONT_CONDENSED = '"Bahnschrift SemiCondensed", Bahnschrift, sans-serif';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const mapsEl = document.getElementById('maps');
const mapNoteEl = document.getElementById('map-note');
const goldEl = document.getElementById('gold');
const livesEl = document.getElementById('lives');
const waveEl = document.getElementById('wave');
const resultEl = document.getElementById('result');
const statusEl = document.getElementById('status');
const nextWaveBtn = document.getElementById('next-wave');
const pauseBtn = document.getElementById('pause');
const speedBtn = document.getElementById('speed');
const waveNoteEl = document.getElementById('wave-note');
const towerGridEl = document.getElementById('tower-grid');
const inspectNameEl = document.getElementById('inspect-name');
const inspectLevelEl = document.getElementById('inspect-level');
const inspectBlurbEl = document.getElementById('inspect-blurb');
const inspectStatsEl = document.getElementById('inspect-stats');
const inspectActionsEl = document.getElementById('inspect-actions');
const upgradeBtn = document.getElementById('upgrade');
const sellBtn = document.getElementById('sell');
const guideEl = document.getElementById('guide');

canvas.width = W * DPR;
canvas.height = H * DPR;
const mapCanvas = document.createElement('canvas');
mapCanvas.width = W * DPR;
mapCanvas.height = H * DPR;

let pal = {};
let map = MAPS[0];
let best = {}; // map id -> most lives left on a win
let phase = 'build'; // 'build' | 'wave' | 'won' | 'lost'
let paused = false;
let speed = 1;
let gold = 0;
let lives = 0;
let wave = 0;
let towers = [];
let enemies = [];
let shots = [];
let enemyShots = [];
let fx = [];
let grid = []; // tower on each cell, or null
let spawnQueue = [];
let waveTime = 0;
let armed = null; // tower type about to be built
let selected = null; // built tower shown in the side panel
let hover = null; // { c, r } under the mouse
let notice = '';
let noticeTime = 0;
let lastTime = 0;
let dirty = true; // true when the screen needs a redraw
let statsKey = '';

try {
  const saved = MAPS.find(m => m.id === localStorage.getItem(MAP_KEY));
  if (saved) map = saved;
  best = JSON.parse(localStorage.getItem(BEST_KEY)) || {};
} catch (e) { /* storage unavailable */ }

// ---- Maps ----

// Turns a road's corners into pixels, with the distance walked at each corner.
function prepareRoad(corners) {
  const pts = corners.map(([c, r]) => ({ x: (c + 0.5) * CELL, y: (r + 0.5) * CELL }));
  const dist = [0];
  for (let i = 1; i < pts.length; i++) {
    dist.push(dist[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return { pts, dist, length: dist[dist.length - 1] };
}

function prepareMap(m) {
  m.paths = m.roads.map(prepareRoad);
  m.blocked = new Uint8Array(COLS * ROWS);
  const block = (c, r) => {
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) m.blocked[r * COLS + c] = 1;
  };
  for (const corners of m.roads) {
    for (let i = 1; i < corners.length; i++) {
      let [c, r] = corners[i - 1];
      const [ec, er] = corners[i];
      block(c, r);
      while (c !== ec || r !== er) {
        c += Math.sign(ec - c);
        r += Math.sign(er - r);
        block(c, r);
      }
    }
  }
  for (const [c, r] of m.rocks) block(c, r);
}

MAPS.forEach(prepareMap);

// Groups of enemies overlap a little; on maps with several roads they take turns.
function buildWave(n, m) {
  const groups = [['grunt', 4 + n, 0.9]];
  if (n % 2 === 0) groups.push(['scout', 2 + n, 0.5]);
  if (n >= 3) groups.push(['raider', Math.floor((n - 1) / 2), 1.5]);
  if (n >= 4) groups.push(['sapper', Math.floor(n / 3), 1.7]);
  if (n >= 5) groups.push(['brute', Math.floor((n - 3) / 2), 2.2]);
  if (n === m.waves) groups.push(['walker', m.paths.length, 6]);
  else if (n === m.midBoss) groups.push(['walker', 1, 1]);

  const queue = [];
  let start = 0;
  groups.forEach(([type, count, gap], g) => {
    for (let i = 0; i < count; i++) {
      queue.push({ at: start + i * gap, type, path: (i + g) % m.paths.length });
    }
    start += count * gap * 0.5 + 1.5;
  });
  return queue.sort((a, b) => a.at - b.at);
}

function describeWave(n, m) {
  const counts = {};
  for (const s of buildWave(n, m)) counts[s.type] = (counts[s.type] || 0) + 1;
  return Object.keys(counts).map(t => `${counts[t]} ${ENEMIES[t].name}`).join(' · ');
}

// ---- Game setup ----

function newGame() {
  towers = [];
  enemies = [];
  shots = [];
  enemyShots = [];
  fx = [];
  spawnQueue = [];
  grid = new Array(COLS * ROWS).fill(null);
  gold = map.gold;
  lives = map.lives;
  wave = 0;
  waveTime = 0;
  phase = 'build';
  paused = false;
  armed = null;
  selected = null;
  notice = '';
  resultEl.textContent = '';
  resultEl.className = 'stamp';
  drawMap();
  markMapTabs();
  dirty = true;
}

function pickMap(m) {
  map = m;
  try { localStorage.setItem(MAP_KEY, m.id); } catch (e) { /* ignore */ }
  newGame();
}

function saveBest() {
  if ((best[map.id] || 0) >= lives) return;
  best[map.id] = lives;
  try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) { /* ignore */ }
}

function say(text) {
  notice = text;
  noticeTime = 4;
  dirty = true;
}

// ---- Towers: building and upgrading ----

function canBuild(c, r) {
  return !map.blocked[r * COLS + c] && !grid[r * COLS + c];
}

function towerCount(def) {
  return towers.filter(t => t.def === def).length;
}

function build(def, c, r) {
  if (!canBuild(c, r) || towerCount(def) >= TOWER_LIMIT) return;
  const s = def.levels[0];
  if (gold < s.cost) {
    say(`Not enough gold for a ${def.name}`);
    return;
  }
  gold -= s.cost;
  const t = {
    def, c, r,
    x: (c + 0.5) * CELL,
    y: (r + 0.5) * CELL,
    level: 0,
    stats: s,
    hp: s.hp,
    spent: s.cost,
    cd: s.income ? INCOME_EVERY : 0,
    angle: -Math.PI / 2,
    hit: 0,
    dead: false,
  };
  towers.push(t);
  grid[r * COLS + c] = t;
  if (towerCount(def) >= TOWER_LIMIT) {
    armed = null;
    say(`All ${TOWER_LIMIT} ${def.name}s built · upgrade them for more power`);
  }
  dirty = true;
}

function upgradeCost(t) {
  const next = t.def.levels[t.level + 1];
  return next ? next.cost : null;
}

// Upgrading also repairs the tower completely.
function upgrade(t) {
  const cost = upgradeCost(t);
  if (cost === null) return;
  if (gold < cost) {
    say(`Not enough gold to upgrade the ${t.def.name}`);
    return;
  }
  gold -= cost;
  t.spent += cost;
  t.level++;
  t.stats = t.def.levels[t.level];
  t.hp = t.stats.hp;
  addRing(t.x, t.y, CELL * 0.7, t.def.pen);
  dirty = true;
}

function sellValue(t) {
  return Math.floor(t.spent * SELL_BACK);
}

function sell(t) {
  gold += sellValue(t);
  removeTower(t);
  dirty = true;
}

function removeTower(t) {
  t.dead = true;
  grid[t.r * COLS + t.c] = null;
  towers = towers.filter(x => x !== t);
  if (selected === t) selected = null;
}

function damageTower(t, amount) {
  if (t.dead) return;
  t.hp -= amount;
  t.hit = 0.15;
  if (t.hp <= 0) {
    addRing(t.x, t.y, CELL, 'red-pencil');
    say(`${t.def.name} destroyed`);
    removeTower(t);
  }
}

// ---- Waves ----

function startWave() {
  if (phase !== 'build' || paused) return;
  wave++;
  spawnQueue = buildWave(wave, map);
  waveTime = 0;
  phase = 'wave';
  markMapTabs();
  dirty = true;
}

function spawn(s) {
  const def = ENEMIES[s.type];
  const path = map.paths[s.path];
  const hp = def.hp * map.hp * (1 + HP_PER_WAVE * (wave - 1));
  enemies.push({
    def, path,
    x: path.pts[0].x,
    y: path.pts[0].y,
    angle: 0,
    seg: 0,
    dist: 0,
    hp,
    maxHp: hp,
    slow: 0,
    slowLeft: 0,
    cd: 0.3,
    scan: 0,
    target: null,
    dead: false,
  });
}

function finishWave() {
  const bonus = 20 + wave * 4;
  gold += bonus;
  if (wave >= map.waves) {
    phase = 'won';
    clearEffects();
    resultEl.textContent = 'CLEARED';
    resultEl.className = 'stamp good';
    saveBest();
    markMapTabs();
  } else {
    phase = 'build';
    say(`Wave ${wave} cleared · +${bonus} gold`);
  }
  dirty = true;
}

function lose() {
  phase = 'lost';
  lives = 0;
  clearEffects();
  resultEl.textContent = 'OVERRUN';
  resultEl.className = 'stamp bad';
  markMapTabs();
  dirty = true;
}

// The simulation stops when a game ends, so nothing in flight would ever finish.
function clearEffects() {
  shots = [];
  enemyShots = [];
  fx = [];
}

// ---- Simulation ----

function advance(e, step) {
  const { pts, dist, length } = e.path;
  e.dist += step;
  if (e.dist >= length) {
    e.dead = true;
    lives -= e.def.lives;
    const end = pts[pts.length - 1];
    addText(Math.min(W - 14, Math.max(14, end.x)), Math.min(H - 14, Math.max(14, end.y)),
      `-${e.def.lives}`, 'red-pencil');
    return;
  }
  while (e.dist >= dist[e.seg + 1]) e.seg++;
  const a = pts[e.seg];
  const b = pts[e.seg + 1];
  const k = (e.dist - dist[e.seg]) / (dist[e.seg + 1] - dist[e.seg]);
  e.x = a.x + (b.x - a.x) * k;
  e.y = a.y + (b.y - a.y) * k;
  e.angle = Math.atan2(b.y - a.y, b.x - a.x);
}

function nearestTower(e, range) {
  let found = null;
  let bestD = range;
  for (const t of towers) {
    const d = Math.hypot(t.x - e.x, t.y - e.y);
    if (d <= bestD) {
      bestD = d;
      found = t;
    }
  }
  return found;
}

function updateEnemy(e, dt) {
  if (e.slowLeft > 0) {
    e.slowLeft -= dt;
    if (e.slowLeft <= 0) e.slow = 0;
  }
  const a = e.def.attack;
  let walking = true;
  if (a) {
    e.cd -= dt;
    e.scan -= dt;
    if (e.scan <= 0 || (e.target && e.target.dead)) {
      e.target = nearestTower(e, a.range * CELL);
      e.scan = 0.25;
    }
    if (e.target) {
      if (a.melee) walking = false;
      if (e.cd <= 0) {
        e.cd = 1 / a.rate;
        if (a.melee) {
          damageTower(e.target, a.damage);
          addRing(e.target.x, e.target.y, CELL * 0.4, 'orange-pen');
        } else {
          enemyShots.push({ x: e.x, y: e.y, target: e.target, tx: e.target.x, ty: e.target.y,
            speed: 7, size: e.def.boss ? 4 : 2.5, damage: a.damage });
        }
      }
    }
  }
  if (walking) advance(e, e.def.speed * (1 - e.slow) * CELL * dt);
}

function pickTarget(t) {
  const range = t.stats.range * CELL;
  let found = null;
  let top = -Infinity;
  for (const e of enemies) {
    if (e.dead || Math.hypot(e.x - t.x, e.y - t.y) > range) continue;
    let score = t.def.aim === 'strongest' ? e.hp : e.dist - e.path.length;
    if (t.def.aim === 'unslowed' && e.slow > 0) score -= 100000;
    if (score > top) {
      top = score;
      found = e;
    }
  }
  return found;
}

function hurtEnemy(e, amount, pierce) {
  if (e.dead) return;
  e.hp -= pierce ? amount : Math.max(1, amount - (e.def.armor || 0));
  if (e.hp <= 0) {
    e.dead = true;
    gold += e.def.gold;
    addText(e.x, e.y - 8, `+${e.def.gold}`, 'ink');
  }
}

function chill(e, s) {
  const slow = e.def.boss ? s.slow * BOSS_SLOW_RESIST : s.slow;
  e.slow = Math.max(e.slow, slow);
  e.slowLeft = s.slowFor;
}

function updateTower(t, dt) {
  const s = t.stats;
  if (t.hit > 0) t.hit -= dt;

  if (s.income) {
    if (phase !== 'wave') return;
    t.cd -= dt;
    if (t.cd <= 0) {
      t.cd = INCOME_EVERY;
      gold += s.income;
      addText(t.x, t.y - 12, `+${s.income}`, 'ink');
    }
    return;
  }

  t.cd -= dt;
  if (s.heal) {
    if (t.cd > 0) return;
    t.cd = 1;
    let healed = false;
    for (const o of towers) {
      if (o.hp < o.stats.hp && Math.hypot(o.x - t.x, o.y - t.y) <= s.range * CELL) {
        o.hp = Math.min(o.stats.hp, o.hp + s.heal);
        healed = true;
      }
    }
    if (healed) {
      addRing(t.x, t.y, s.range * CELL, 'green-ink');
      dirty = true;
    }
    return;
  }

  const target = pickTarget(t);
  if (!target) return;
  t.angle = Math.atan2(target.y - t.y, target.x - t.x);
  if (t.cd > 0) return;
  t.cd = 1 / s.rate;
  if (t.def.beam) {
    hurtEnemy(target, s.damage, true);
    addBeam(t.x, t.y, target.x, target.y, t.def.pen);
  } else {
    shots.push({ x: t.x, y: t.y, target, tx: target.x, ty: target.y, tower: t.def, stats: s,
      speed: t.def.shotSpeed, size: t.def.shotSize });
  }
}

// Moves a shot towards its target (or where the target last was). True on arrival.
function moveShot(s, dt) {
  if (!s.target.dead) {
    s.tx = s.target.x;
    s.ty = s.target.y;
  }
  const dx = s.tx - s.x;
  const dy = s.ty - s.y;
  const d = Math.hypot(dx, dy);
  const step = s.speed * CELL * dt;
  if (d <= step) return true;
  s.x += dx / d * step;
  s.y += dy / d * step;
  return false;
}

function shotLands(s) {
  const st = s.stats;
  if (st.splash) {
    const radius = st.splash * CELL;
    for (const e of enemies) {
      if (Math.hypot(e.x - s.tx, e.y - s.ty) > radius) continue;
      hurtEnemy(e, st.damage);
      if (st.slow) chill(e, st);
    }
    addRing(s.tx, s.ty, radius, s.tower.pen);
  } else if (!s.target.dead) {
    hurtEnemy(s.target, st.damage);
    if (st.slow) chill(s.target, st);
  }
}

function update(dt) {
  waveTime += dt;
  while (spawnQueue.length && spawnQueue[0].at <= waveTime) spawn(spawnQueue.shift());

  for (const e of enemies) updateEnemy(e, dt);
  for (const t of towers.slice()) updateTower(t, dt);

  shots = shots.filter(s => {
    if (!moveShot(s, dt)) return true;
    shotLands(s);
    return false;
  });
  enemyShots = enemyShots.filter(s => {
    if (!moveShot(s, dt)) return true;
    damageTower(s.target, s.damage);
    return false;
  });
  enemies = enemies.filter(e => !e.dead);

  for (const f of fx) f.age += dt;
  fx = fx.filter(f => f.age < f.life);
  if (noticeTime > 0) {
    noticeTime -= dt;
    if (noticeTime <= 0) dirty = true;
  }

  if (lives <= 0) lose();
  else if (phase === 'wave' && !spawnQueue.length && !enemies.length) finishWave();

  if (enemies.length || shots.length || enemyShots.length || fx.length) dirty = true;
}

// ---- Effects ----

function addFx(f) {
  if (fx.length < MAX_FX) fx.push(f);
}
function addText(x, y, text, pen) {
  addFx({ kind: 'text', x, y, text, pen, age: 0, life: 0.8 });
}
function addRing(x, y, r, pen) {
  addFx({ kind: 'ring', x, y, r, pen, age: 0, life: 0.3 });
}
function addBeam(x, y, x2, y2, pen) {
  addFx({ kind: 'beam', x, y, x2, y2, pen, age: 0, life: 0.15 });
}

function drawFx() {
  ctx.lineWidth = 1.5;
  for (const f of fx) {
    const p = f.age / f.life;
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = pal[f.pen];
    if (f.kind === 'ring') {
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * p), 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === 'beam') {
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x2, f.y2);
      ctx.stroke();
    } else {
      ctx.font = '600 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = pal.paper;
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y - p * 14);
      ctx.fillStyle = pal[f.pen];
      ctx.fillText(f.text, f.x, f.y - p * 14);
      ctx.lineWidth = 1.5;
    }
  }
  ctx.globalAlpha = 1;
}

// ---- Rendering: the map ----

function strokeRoads(c, width, color) {
  c.lineWidth = width;
  c.strokeStyle = color;
  c.lineJoin = 'miter';
  for (const path of map.paths) {
    c.beginPath();
    path.pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.stroke();
  }
}

// A small stamp where a road comes on or leaves the board.
function drawGate(c, p, text, color) {
  const x = Math.min(W - 18, Math.max(18, p.x));
  const y = Math.min(H - 12, Math.max(12, p.y));
  c.font = '600 11px ' + FONT_CONDENSED;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = pal.paper;
  c.fillRect(x - 15, y - 8, 30, 16);
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  c.strokeRect(x - 15, y - 8, 30, 16);
  c.fillStyle = color;
  c.fillText(text, x, y + 0.5);
}

function drawMap() {
  const c = mapCanvas.getContext('2d');
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.fillStyle = pal.paper;
  c.fillRect(0, 0, W, H);

  c.lineWidth = 1;
  c.strokeStyle = pal['grid-minor'];
  c.beginPath();
  const minor = CELL / 4;
  for (let x = minor; x < W; x += minor) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); }
  for (let y = minor; y < H; y += minor) { c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); }
  c.stroke();
  c.strokeStyle = pal['grid-major'];
  c.beginPath();
  for (let x = CELL; x < W; x += CELL) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); }
  for (let y = CELL; y < H; y += CELL) { c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); }
  c.stroke();

  // Rocks: hatched squares you can't build on.
  for (const [rc, rr] of map.rocks) {
    const x = rc * CELL;
    const y = rr * CELL;
    c.fillStyle = pal.rule;
    c.fillRect(x + 1, y + 1, CELL - 1, CELL - 1);
    c.save();
    c.beginPath();
    c.rect(x + 1, y + 1, CELL - 1, CELL - 1);
    c.clip();
    c.strokeStyle = pal['ink-muted'];
    c.lineWidth = 1;
    c.beginPath();
    for (let d = -CELL; d < CELL; d += 8) {
      c.moveTo(x + d, y + CELL);
      c.lineTo(x + d + CELL, y);
    }
    c.stroke();
    c.restore();
  }

  strokeRoads(c, CELL + 1, pal['ink-muted']);
  strokeRoads(c, CELL - 1, pal.desk);
  c.setLineDash([6, 6]);
  strokeRoads(c, 1, pal['ink-muted']);
  c.setLineDash([]);

  for (const path of map.paths) {
    drawGate(c, path.pts[0], 'IN', pal['blue-pen']);
    drawGate(c, path.pts[path.pts.length - 1], 'OUT', pal['red-pencil']);
  }
}

// ---- Rendering: towers and enemies ----

function line(c, x1, y1, x2, y2) {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

function barrel(c, x, y, angle, length, width) {
  c.strokeStyle = pal.ink;
  c.lineWidth = width;
  line(c, x, y, x + Math.cos(angle) * length, y + Math.sin(angle) * length);
}

// A tower is a paper square with a pen-colored turret. Higher levels get a
// heavier outline, level pips and, for some towers, a bigger gun.
function drawTower(c, def, level, x, y, angle, flash) {
  const half = 14;
  c.fillStyle = pal.paper;
  c.fillRect(x - half, y - half, half * 2, half * 2);
  c.strokeStyle = flash ? pal['red-pencil'] : pal.ink;
  c.lineWidth = flash ? 2.5 : 1 + level * 0.5;
  c.strokeRect(x - half + 0.5, y - half + 0.5, half * 2 - 1, half * 2 - 1);

  const pen = pal[def.pen];
  const disc = r => {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = pen;
    c.fill();
    c.strokeStyle = pal.ink;
    c.lineWidth = 1;
    c.stroke();
  };

  switch (def.id) {
    case 'gunner': {
      if (level === 2) {
        const nx = -Math.sin(angle) * 2.5;
        const ny = Math.cos(angle) * 2.5;
        barrel(c, x + nx, y + ny, angle, 11, 2);
        barrel(c, x - nx, y - ny, angle, 11, 2);
      } else {
        barrel(c, x, y, angle, 9 + level * 2, 2);
      }
      disc(6);
      break;
    }
    case 'cannon':
      barrel(c, x, y, angle, 10 + level, 5 + level);
      disc(8);
      break;
    case 'frost':
      disc(7 + level);
      c.strokeStyle = pal.paper;
      c.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 3 + Math.PI / 2;
        const dx = Math.cos(a) * (5 + level);
        const dy = Math.sin(a) * (5 + level);
        line(c, x - dx, y - dy, x + dx, y + dy);
      }
      break;
    case 'sniper':
      barrel(c, x, y, angle, 13 + level, 1.5 + level * 0.5);
      disc(4);
      c.fillStyle = pal.paper;
      c.beginPath();
      c.arc(x, y, 1.5, 0, Math.PI * 2);
      c.fill();
      break;
    case 'mender':
      c.fillStyle = pen;
      c.strokeStyle = pal.ink;
      c.lineWidth = 1;
      {
        const a = 8 + level;
        const b = 2.5 + level * 0.5;
        c.beginPath();
        c.moveTo(x - b, y - a);
        c.lineTo(x + b, y - a);
        c.lineTo(x + b, y - b);
        c.lineTo(x + a, y - b);
        c.lineTo(x + a, y + b);
        c.lineTo(x + b, y + b);
        c.lineTo(x + b, y + a);
        c.lineTo(x - b, y + a);
        c.lineTo(x - b, y + b);
        c.lineTo(x - a, y + b);
        c.lineTo(x - a, y - b);
        c.lineTo(x - b, y - b);
        c.closePath();
        c.fill();
        c.stroke();
      }
      break;
    case 'mint':
      disc(8 + level);
      c.fillStyle = pal.ink;
      c.font = `600 ${11 + level}px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('$', x, y + 0.5);
      break;
  }

  c.fillStyle = pal.ink;
  for (let i = 0; i < level; i++) c.fillRect(x + half - 5 - i * 5, y - half + 2, 3, 3);
}

function enemyOutline(c, def, x, y, angle) {
  c.beginPath();
  if (def.shape === 'circle') {
    c.arc(x, y, def.r, 0, Math.PI * 2);
    return;
  }
  const shape = SHAPES[def.shape];
  const start = shape.turn + (shape.facing ? angle : 0);
  for (let i = 0; i < shape.sides; i++) {
    const a = start + i * Math.PI * 2 / shape.sides;
    const px = x + Math.cos(a) * def.r;
    const py = y + Math.sin(a) * def.r;
    if (i) c.lineTo(px, py);
    else c.moveTo(px, py);
  }
  c.closePath();
}

// A dot in the middle marks the enemies that attack towers.
function drawEnemyBody(c, def, x, y, angle) {
  enemyOutline(c, def, x, y, angle);
  c.fillStyle = pal[def.pen];
  c.fill();
  c.strokeStyle = pal.ink;
  c.lineWidth = 1;
  c.stroke();
  if (def.attack) {
    c.fillStyle = pal.paper;
    c.beginPath();
    c.arc(x, y, def.boss ? 5 : 3, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = pal.ink;
    c.stroke();
  }
}

function drawBar(x, y, width, part) {
  ctx.fillStyle = pal.ink;
  ctx.fillRect(x - width / 2 - 1, y - 1, width + 2, 5);
  ctx.fillStyle = pal.paper;
  ctx.fillRect(x - width / 2, y, width, 3);
  ctx.fillStyle = part > 0.35 ? pal['green-ink'] : pal['red-pencil'];
  ctx.fillRect(x - width / 2, y, width * Math.max(0, part), 3);
}

function drawEnemy(e) {
  if (e.slow > 0) {
    ctx.strokeStyle = pal.violet;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.def.r + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawEnemyBody(ctx, e.def, e.x, e.y, e.angle);
  if (e.hp < e.maxHp) drawBar(e.x, e.y - e.def.r - 7, Math.max(16, e.def.r * 2), e.hp / e.maxHp);
}

function drawRange(x, y, radius, color) {
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGhost() {
  if (!armed || !hover || phase === 'won' || phase === 'lost') return;
  if (grid[hover.r * COLS + hover.c]) return;
  const x = (hover.c + 0.5) * CELL;
  const y = (hover.r + 0.5) * CELL;
  if (!canBuild(hover.c, hover.r)) {
    ctx.strokeStyle = pal['red-pencil'];
    ctx.lineWidth = 2;
    line(ctx, x - 9, y - 9, x + 9, y + 9);
    line(ctx, x - 9, y + 9, x + 9, y - 9);
    return;
  }
  const s = armed.levels[0];
  const color = gold >= s.cost ? pal[armed.pen] : pal['red-pencil'];
  if (s.range) drawRange(x, y, s.range * CELL, color);
  ctx.globalAlpha = 0.6;
  drawTower(ctx, armed, 0, x, y, -Math.PI / 2, false);
  ctx.globalAlpha = 1;
}

function drawShot(s, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// A paper slip with an ink outline in the middle of the board.
function drawOverlay(title, subtitle, titleColor, stamped) {
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = pal.desk;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  const w = 300;
  const h = 110;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  ctx.fillStyle = pal.paper;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 26px ' + FONT;
  ctx.fillStyle = titleColor;
  ctx.fillText(title, W / 2, y + 44);
  if (stamped) {
    const tw = ctx.measureText(title).width + 20;
    ctx.strokeStyle = titleColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(W / 2 - tw / 2, y + 26, tw, 36);
  }
  ctx.font = '13px ' + FONT_CONDENSED;
  ctx.fillStyle = pal['ink-muted'];
  ctx.fillText(subtitle, W / 2, y + 84);
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(mapCanvas, 0, 0, W, H);

  if (selected && selected.stats.range) {
    drawRange(selected.x, selected.y, selected.stats.range * CELL, pal[selected.def.pen]);
  }

  for (const t of towers) {
    drawTower(ctx, t.def, t.level, t.x, t.y, t.angle, t.hit > 0);
    if (t.hp < t.stats.hp) drawBar(t.x, t.y + 9, 22, t.hp / t.stats.hp);
  }
  if (selected) {
    ctx.strokeStyle = pal['red-pencil'];
    ctx.lineWidth = 1.5;
    ctx.strokeRect(selected.c * CELL + 1.5, selected.r * CELL + 1.5, CELL - 2, CELL - 2);
  }
  for (const e of enemies) drawEnemy(e);
  for (const s of shots) drawShot(s, pal[s.tower.pen]);
  for (const s of enemyShots) drawShot(s, pal['red-pencil']);
  drawFx();
  drawGhost();

  if (phase === 'won') {
    drawOverlay('CLEARED', `${lives} of ${map.lives} lives left · Enter to play again`, pal['green-ink'], true);
  } else if (phase === 'lost') {
    drawOverlay('OVERRUN', `Fell on wave ${wave} of ${map.waves} · Enter to try again`, pal['red-pencil'], true);
  } else if (paused) {
    drawOverlay('Paused', 'Press P to resume', pal.ink, false);
  }

  updateHud();
  dirty = false;
}

// ---- Side panel ----

// Writes to the page only when a value actually changed.
function setText(el, text) {
  const value = String(text);
  if (el.dataset.shown !== value) {
    el.dataset.shown = value;
    el.textContent = value;
  }
}

function markMapTabs() {
  const locked = phase === 'wave' || (phase === 'build' && wave > 0);
  mapsEl.querySelectorAll('.tab').forEach(tab => {
    tab.setAttribute('aria-selected', String(tab.dataset.id === map.id));
    tab.disabled = locked;
    tab.title = locked ? 'Press New game to change map' : '';
  });
  const record = best[map.id] ? ` Best: ${best[map.id]} of ${map.lives} lives left.` : '';
  mapNoteEl.textContent = `${map.level} · ${map.waves} waves · ${map.note}${record}`;
}

function statusText() {
  if (noticeTime > 0 && notice) return notice;
  if (phase === 'won') return `${map.name} cleared with ${lives} lives left`;
  if (phase === 'lost') return `${map.name} overrun on wave ${wave}`;
  if (paused) return 'Paused';
  if (phase === 'wave') return `${map.name} · wave ${wave} of ${map.waves}`;
  if (wave === 0) return `${map.name} · build some towers, then press Space`;
  return `${map.name} · wave ${wave} cleared · press Space for the next one`;
}

function updateHud() {
  setText(goldEl, gold);
  setText(livesEl, Math.max(0, lives));
  setText(waveEl, `${wave}/${map.waves}`);
  setText(statusEl, statusText());

  nextWaveBtn.disabled = phase !== 'build' || paused;
  pauseBtn.disabled = phase === 'won' || phase === 'lost';
  pauseBtn.setAttribute('aria-pressed', String(paused));
  speedBtn.setAttribute('aria-pressed', String(speed === 2));
  if (phase === 'wave') {
    const left = spawnQueue.length + enemies.length;
    setText(waveNoteEl, `${left} ${left === 1 ? 'enemy' : 'enemies'} left in this wave`);
  } else if (phase === 'build') {
    setText(waveNoteEl, `Wave ${wave + 1}: ${describeWave(wave + 1, map)}`);
  } else {
    setText(waveNoteEl, '');
  }

  towerGridEl.querySelectorAll('.tower-btn').forEach(b => {
    const def = TOWERS.find(d => d.id === b.dataset.id);
    const built = towerCount(def);
    const full = built >= TOWER_LIMIT;
    b.setAttribute('aria-pressed', String(armed === def));
    b.classList.toggle('poor', gold < def.levels[0].cost);
    b.disabled = full;
    b.title = full ? `Limit of ${TOWER_LIMIT} reached. Upgrade or sell one.` : def.blurb;
    setText(b.querySelector('.count'), `${built}/${TOWER_LIMIT}`);
  });
  canvas.classList.toggle('armed', !!armed);
  updateInspector();
}

function statsRow(name, value) {
  return `<div class="row"><span class="label">${name}</span><span>${value}</span></div>`;
}

function updateInspector() {
  const t = selected;
  const def = t ? t.def : armed;
  inspectActionsEl.hidden = !t;
  if (!def) {
    setText(inspectNameEl, 'Nothing selected');
    setText(inspectLevelEl, '');
    setText(inspectBlurbEl, `Pick a tower above, then click an empty square. Up to ${TOWER_LIMIT} of each type.`);
    if (statsKey) inspectStatsEl.textContent = '';
    statsKey = '';
    return;
  }

  setText(inspectNameEl, def.name);
  setText(inspectLevelEl, t ? `Level ${t.level + 1} of 3` : `Costs ${def.levels[0].cost}`);
  setText(inspectBlurbEl, def.blurb);

  const now = t ? t.stats : def.levels[0];
  const next = t ? def.levels[t.level + 1] : null;
  const hp = t ? Math.ceil(t.hp) : now.hp;
  const key = `${def.id}:${t ? t.level : 'new'}:${hp}`;
  if (key !== statsKey) {
    statsKey = key;
    const change = (v, nv, show) => (nv !== undefined && nv !== v ? `${show(v)} → ${show(nv)}` : show(v));
    let html = statsRow('Health', next ? `${hp}/${now.hp} → ${next.hp}` : `${hp}/${now.hp}`);
    for (const stat of STATS) {
      if (now[stat.key] !== undefined) {
        html += statsRow(stat.name, change(now[stat.key], next && next[stat.key], stat.show));
      } else if (next && next[stat.key] !== undefined) {
        html += statsRow(stat.name, `none → ${stat.show(next[stat.key])}`);
      }
    }
    inspectStatsEl.innerHTML = html;
  }

  if (t) {
    const cost = upgradeCost(t);
    setText(upgradeBtn, cost === null ? 'Max level' : `Upgrade · ${cost}`);
    upgradeBtn.disabled = cost === null || gold < cost;
    setText(sellBtn, `Sell · ${sellValue(t)}`);
  }
}

// ---- Icons and page setup ----

function iconCanvas() {
  const icon = document.createElement('canvas');
  icon.width = 30 * DPR;
  icon.height = 30 * DPR;
  return icon;
}

function buildMapTabs() {
  for (const m of MAPS) {
    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.setAttribute('role', 'tab');
    tab.dataset.id = m.id;
    tab.textContent = m.name;
    tab.addEventListener('click', () => pickMap(m));
    mapsEl.appendChild(tab);
  }
}

function buildTowerButtons() {
  TOWERS.forEach(def => {
    const b = document.createElement('button');
    b.className = 'tower-btn';
    b.dataset.id = def.id;
    b.appendChild(iconCanvas());
    const text = document.createElement('span');
    text.innerHTML = `<span>${def.name}</span><span class="cost">${def.levels[0].cost} gold</span>`;
    b.appendChild(text);
    const count = document.createElement('span');
    count.className = 'count';
    b.appendChild(count);
    b.addEventListener('click', () => arm(def));
    towerGridEl.appendChild(b);
  });
}

function buildGuide() {
  for (const id of Object.keys(ENEMIES)) {
    const def = ENEMIES[id];
    const li = document.createElement('li');
    const icon = iconCanvas();
    icon.dataset.enemy = id;
    li.appendChild(icon);
    const text = document.createElement('span');
    text.innerHTML = `<strong>${def.name}</strong><span class="label">${def.note}</span>`;
    li.appendChild(text);
    guideEl.appendChild(li);
  }
}

function drawIcons() {
  towerGridEl.querySelectorAll('.tower-btn').forEach(b => {
    const icon = b.querySelector('canvas');
    const c = icon.getContext('2d');
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, 30, 30);
    drawTower(c, TOWERS.find(d => d.id === b.dataset.id), 0, 15, 15, -Math.PI / 2, false);
  });
  guideEl.querySelectorAll('canvas').forEach(icon => {
    const def = ENEMIES[icon.dataset.enemy];
    const c = icon.getContext('2d');
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, 30, 30);
    const scale = Math.min(1, 13 / def.r);
    c.translate(15, 15);
    c.scale(scale, scale);
    drawEnemyBody(c, def, 0, 0, -Math.PI / 2);
  });
}

function readTheme() {
  pal = Theme.palette();
  drawMap();
  drawIcons();
  dirty = true;
}

// ---- Game loop ----

function running() {
  return !paused && (phase === 'build' || phase === 'wave');
}

function loop(time = 0) {
  const dt = Math.min(50, time - lastTime) / 1000;
  lastTime = time;
  for (let i = 0; i < speed && running(); i++) update(dt);
  if (dirty) draw();
  requestAnimationFrame(loop);
}

// ---- Input ----

function arm(def) {
  if (towerCount(def) >= TOWER_LIMIT) {
    say(`Limit is ${TOWER_LIMIT} ${def.name}s · upgrade or sell one`);
    return;
  }
  armed = armed === def ? null : def;
  selected = null;
  dirty = true;
}

function cancel() {
  armed = null;
  selected = null;
  dirty = true;
}

function togglePause() {
  if (phase === 'won' || phase === 'lost') return;
  paused = !paused;
  dirty = true;
}

function toggleSpeed() {
  speed = speed === 1 ? 2 : 1;
  dirty = true;
}

function cellAt(e) {
  const rect = canvas.getBoundingClientRect();
  const c = Math.floor((e.clientX - rect.left) / rect.width * COLS);
  const r = Math.floor((e.clientY - rect.top) / rect.height * ROWS);
  return c >= 0 && c < COLS && r >= 0 && r < ROWS ? { c, r } : null;
}

canvas.addEventListener('click', e => {
  const cell = cellAt(e);
  if (!cell || phase === 'won' || phase === 'lost') return;
  const t = grid[cell.r * COLS + cell.c];
  if (t) {
    selected = t;
    armed = null;
  } else if (armed) {
    build(armed, cell.c, cell.r);
  } else {
    selected = null;
  }
  dirty = true;
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  cancel();
});

canvas.addEventListener('mousemove', e => {
  const cell = cellAt(e);
  if (cell && hover && cell.c === hover.c && cell.r === hover.r) return;
  hover = cell;
  if (armed) dirty = true;
});

canvas.addEventListener('mouseleave', () => {
  hover = null;
  if (armed) dirty = true;
});

// A mouse click leaves focus on the button, where Space would press it again.
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b && e.detail > 0) b.blur();
});

nextWaveBtn.addEventListener('click', startWave);
pauseBtn.addEventListener('click', togglePause);
speedBtn.addEventListener('click', toggleSpeed);
upgradeBtn.addEventListener('click', () => { if (selected) upgrade(selected); });
sellBtn.addEventListener('click', () => { if (selected) sell(selected); });
document.getElementById('new-game').addEventListener('click', newGame);

document.addEventListener('keydown', e => {
  // Keyboard users pressing a focused button get the button, not the shortcut.
  if (e.target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const digit = /^Digit([1-6])$/.exec(e.code);
  if (digit) {
    if (phase === 'build' || phase === 'wave') arm(TOWERS[Number(digit[1]) - 1]);
    return;
  }
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      startWave();
      break;
    case 'Enter':
      if (phase === 'won' || phase === 'lost') newGame();
      break;
    case 'KeyP': togglePause(); break;
    case 'KeyF': toggleSpeed(); break;
    case 'KeyU': if (selected) upgrade(selected); break;
    case 'KeyS': if (selected) sell(selected); break;
    case 'Escape': cancel(); break;
  }
});

document.addEventListener('themechange', readTheme);

buildMapTabs();
buildTowerButtons();
buildGuide();
readTheme();
newGame();
requestAnimationFrame(loop);
