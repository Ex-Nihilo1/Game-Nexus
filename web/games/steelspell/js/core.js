// The run's state, small helpers, timers and visual effects.

// ---- State ----

const stageEl = document.getElementById('stage');
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const overlayEl = document.getElementById('overlay');
const panelEl = document.getElementById('panel');
const statusEl = document.getElementById('status');
const pauseBtn = document.getElementById('pause-btn');
const activeBtn = document.getElementById('active-btn');
const activeNameEl = document.getElementById('active-name');
const activeTimeEl = document.getElementById('active-time');

const FONT = '"Bahnschrift SemiCondensed", "Bahnschrift", "Arial Narrow", sans-serif';
const view = { w: 0, h: 0, cssW: 0, cssH: 0, scale: 1 };
const cam = { x: 0, y: 0 };
const keys = new Set();
const stick = { active: false, id: 0, ax: 0, ay: 0, x: 0, y: 0 };
const loadout = { active: ACTIVES[0], weapon: WEAPONS[0] };

let pal = {};
let dirty = true;
let phase = 'start'; // start | menu (records, camp) | playing | choosing | paused | over
let seed = 1;
let frame = 0;
let lastTime = 0;
let lastCdShare = -1;
let cardActions = [];
let shownCards = [];
let metaBonus = {}; // what Camp upgrades add to stats this run (js/meta.js)
let simulating = false; // true while js/sim.js plays a run: nothing is drawn or saved

let hero, enemies, allies, shots, enemyShots, warnings, zones, orbs, redOrbs, magnets, chests, fx, numbers, timers, queue;
let upgrades, gear, items, activeDef, activeCd, berserkLeft, rerolls, choice, merges, elitesKilled;
let startWeapon = '';
let level, xp, xpNext, elapsed, kills, spawnBudget, nextElite, nextRing, wildOrbTimer, magnetTimer, pocketLeft, walked, toast, toastLeft;

function zeroPicks() {
  const picks = {};
  for (const key of Object.keys(STATS)) picks[key] = 0;
  return picks;
}

function resetWorld() {
  hero = {
    x: 0, y: 0, r: HERO.r, hp: HERO.hp, maxHp: HERO.hp, baseAttack: HERO.attack, lives: HERO.lives + (metaBonus.lives || 0),
    faceX: 1, faceY: 0, vx: 0, vy: 0, iframes: 0, ghostLeft: 0, phaseLeft: 0, critBoostLeft: 0, hurtFlash: 0, windAt: 0, hurtBy: { touch: 0, shot: 0, strike: 0 }, weapons: [],
  };
  enemies = [];
  allies = [];
  shots = [];
  enemyShots = [];
  warnings = [];
  zones = [];
  orbs = [];
  redOrbs = [];
  magnets = [];
  chests = [];
  fx = [];
  numbers = [];
  timers = [];
  queue = [];
  upgrades = zeroPicks();
  gear = {};
  items = [];
  activeDef = ACTIVES[0];
  activeCd = 0;
  berserkLeft = 0;
  rerolls = REROLLS.start + (metaBonus.rerolls || 0);
  choice = null;
  merges = 0;
  elitesKilled = 0;
  level = 1;
  xp = 0;
  xpNext = xpNeeded(1);
  elapsed = 0;
  kills = 0;
  spawnBudget = 0;
  nextElite = 0;
  nextRing = 0;
  wildOrbTimer = WILD_ORB.every;
  magnetTimer = MAGNET.every;
  pocketLeft = 0;
  walked = 0;
  toast = '';
  toastLeft = 0;
  frame = 0;
  rebuildGrid();
}

function startRun(activeId, weaponId, runSeed = Date.now()) {
  seed = runSeed | 0;
  metaBonus = campBonus();
  startWeapon = weaponId;
  runVersionNow = BALANCE_VERSION;
  resetWorld();
  activeDef = ACTIVES.find(a => a.id === activeId);
  // The active skill's passive: what it gives, a free weapon, levels at the start.
  for (const [key, value] of Object.entries(activeDef.gives || {})) gear[key] = gearValue(key) + value;
  refreshHero();
  hero.hp = hero.maxHp;
  addWeapon(weaponId);
  if (activeDef.freeWeapon && weaponId !== activeDef.freeWeapon) addWeapon(activeDef.freeWeapon);
  for (let i = 0; i < (activeDef.startLevels || 0); i++) addLevel();
  saveJson(LAST_KEY, { active: activeId, weapon: weaponId });
  if (!simulating) Nexus.startRun('steelspell');
  setText(activeNameEl, activeDef.name);
  activeBtn.title = activeDef.blurb;
  lastCdShare = -1;
  activeBtn.hidden = false;
  pauseBtn.hidden = false;
  phase = 'playing';
  hideOverlay();
  dirty = true;
  if (queue.length) nextChoice();
}

function endRun() {
  phase = 'over';
  queue = [];
  if (simulating) return;
  clearSave(); // the slot only ever holds the run in progress
  activeBtn.hidden = true;
  pauseBtn.hidden = true;
  const result = recordRun();
  showBest();
  showEnd(result);
  reportRun();
  dirty = true;
}

// Sends the run to the account (nothing happens for guests) and adds where it
// landed on the leaderboards to the end screen.
// It carries most of the end screen, with the names of this version, so the
// leaderboard can show the build without the game's data.
function reportRun() {
  const picks = [];
  for (const key of Object.keys(STATS)) {
    const n = upgrades[key];
    if (n) picks.push({ name: STATS[key].name, strong: Math.min(n, STRONG_PICKS), weak: Math.max(0, n - STRONG_PICKS) });
  }
  Nexus.finishRun({
    version: runVersionNow, time: elapsed, level, kills, elites: elitesKilled, merges,
    active: activeDef.id, activeName: activeDef.name,
    start: startWeapon, startName: WEAPONS.find(d => d.id === startWeapon).name,
    health: Math.round(hero.maxHp),
    weapons: hero.weapons.map(w => ({
      id: w.def.id,
      name: w.evo ? w.def.name : weaponName(w),
      evo: w.evo || '',
      evoName: w.evo ? weaponName(w) : '',
      level: w.level || 0,
      kind: KINDS[w.def.kind].name,
      dealt: Math.round(w.dealt),
    })),
    items: items.map(item => ({ id: item.id, name: item.name, rarity: item.rarity })),
    hurt: {
      touch: Math.round(hero.hurtBy.touch), shot: Math.round(hero.hurtBy.shot), strike: Math.round(hero.hurtBy.strike),
    },
    picks,
  }).then(answer => {
    const lines = Nexus.rankLines(answer);
    const note = panelEl.querySelector('.panel-note');
    if (phase !== 'over' || !note || !lines.length) return;
    note.textContent += ' ' + lines.map(line => line.replace(/\.$/, '')).join('. ') + '.';
  });
}

// ---- Small helpers ----

// Seeded (mulberry32) so a run can be replayed while balancing.
function rand() {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pickOne(list) { return list[Math.floor(rand() * list.length)]; }
function pickWeighted(mix) {
  const names = Object.keys(mix);
  let roll = rand() * names.reduce((sum, n) => sum + mix[n], 0);
  for (const n of names) {
    roll -= mix[n];
    if (roll < 0) return n;
  }
  return names[0];
}
function sweep(list) {
  let n = 0;
  for (let i = 0; i < list.length; i++) if (!list[i].dead) list[n++] = list[i];
  list.length = n;
}
function angleDiff(a, b) {
  const d = (a - b) % TAU;
  return d > Math.PI ? d - TAU : d < -Math.PI ? d + TAU : d;
}
function angleGap(a, b) { return Math.abs(angleDiff(a, b)); }
function turnToward(a, target, step) {
  const d = angleDiff(target, a);
  return Math.abs(d) <= step ? target : a + Math.sign(d) * step;
}
function formatTime(s) {
  const whole = Math.floor(s);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}
function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
function loadJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
function saveJson(key, value) {
  if (simulating) return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode etc. */ }
}
function say(text) {
  toast = text;
  toastLeft = 3;
}

function later(seconds, fn) { timers.push({ left: seconds, fn, dead: false }); }

function updateTimers(dt) {
  for (const t of timers) {
    t.left -= dt;
    if (t.left <= 0) {
      t.dead = true;
      t.fn();
    }
  }
  sweep(timers);
}

// ---- Effects ----

function addFx(o) {
  if (fx.length >= MAX_FX) return;
  o.max = o.life;
  o.dead = false;
  fx.push(o);
}

function floatText(x, y, text, pen, size) {
  if (numbers.length >= MAX_NUMBERS) return;
  numbers.push({ x, y, text, pen, size, life: 0.55, dead: false });
}

function addNumber(e, dealt, kind, crit, factor) {
  floatText(e.x + (rand() - 0.5) * 10, e.y - e.r, String(Math.max(1, Math.round(dealt))),
    factor < 0.7 ? 'ink-muted' : KINDS[kind].pen, crit ? 17 : 12);
}

function updateFx(dt) {
  for (const f of fx) {
    f.life -= dt;
    if (f.life <= 0) f.dead = true;
  }
  sweep(fx);
  for (const n of numbers) {
    n.life -= dt;
    n.y -= 34 * dt;
    if (n.life <= 0) n.dead = true;
  }
  sweep(numbers);
}
