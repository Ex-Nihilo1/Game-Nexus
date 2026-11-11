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

let hero, enemies, shots, enemyShots, warnings, zones, orbs, redOrbs, magnets, chests, fx, numbers, timers, queue;
let upgrades, gear, items, activeDef, activeCd, berserkLeft, rerolls, choice, merges, elitesKilled;
let startWeapon = '';
let level, xp, xpNext, elapsed, kills, spawnBudget, nextElite, nextRing, wildOrbTimer, magnetTimer, walked, toast, toastLeft;

function zeroPicks() {
  const picks = {};
  for (const key of Object.keys(STATS)) picks[key] = 0;
  return picks;
}

function resetWorld() {
  hero = {
    x: 0, y: 0, r: HERO.r, hp: HERO.hp, maxHp: HERO.hp, baseAttack: HERO.attack, lives: HERO.lives + (metaBonus.lives || 0),
    faceX: 1, faceY: 0, vx: 0, vy: 0, iframes: 0, ghostLeft: 0, phaseLeft: 0, hurtFlash: 0, windAt: 0, hurtBy: { touch: 0, shot: 0, strike: 0 }, weapons: [],
  };
  enemies = [];
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
  refreshHero();
  hero.hp = hero.maxHp;
  activeDef = ACTIVES.find(a => a.id === activeId);
  addWeapon(weaponId);
  saveJson(LAST_KEY, { active: activeId, weapon: weaponId });
  setText(activeNameEl, activeDef.name);
  activeBtn.title = activeDef.blurb;
  lastCdShare = -1;
  activeBtn.hidden = false;
  pauseBtn.hidden = false;
  phase = 'playing';
  hideOverlay();
  dirty = true;
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
  dirty = true;
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
