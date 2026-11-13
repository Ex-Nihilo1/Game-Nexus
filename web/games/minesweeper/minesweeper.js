// Minesweeper: vanilla JS, a CSS grid of cells.
// Light on low-end devices: the grid is built once per game, one listener
// handles every click, and only cells that change are touched.

// Board size comes from the width and height sliders; their limits are on
// the inputs in index.html.
const SIZE_KEY = 'games.minesweeper.size';
// Before the sliders, a saved level picked the size.
const OLD_LEVEL_KEY = 'games.minesweeper.level';
const OLD_LEVEL_SIZES = { beginner: [9, 9], intermediate: [16, 16], expert: [30, 16] };

// The share of cells that are mines, from the mines slider.
const MINE_PCT_KEY = 'games.minesweeper.minePct';
// Before the slider, a saved density tab set it.
const OLD_DENSITY_KEY = 'games.minesweeper.density';
const OLD_DENSITY_PCTS = { low: 12, normal: 16, high: 20 };

const MODES = [
  { id: 'classic', name: 'Classic',
    note: 'Mines are placed at random. Only your first click is guaranteed safe, so some boards end in a forced guess.' },
  { id: 'noguess', name: 'No guess',
    note: 'Every board can be cleared by logic from your first click. You never have to guess.' },
  { id: 'forgiving', name: 'Forgiving',
    note: 'Random boards, but if you are truly stuck and guess wrong, the mine moves and you play on. Careless clicks still lose.' },
];
const MODE_KEY = 'games.minesweeper.mode';

// No-guess search time: this much per board up to NO_GUESS_BUDGET_CELLS,
// growing with bigger boards up to the cap.
const NO_GUESS_BUDGET_MS = 1500;
const NO_GUESS_BUDGET_CELLS = 480;
const NO_GUESS_BUDGET_MAX_MS = 3000;
const NUDGES_PER_BOARD = 1500;
const NUDGE_PICKS = 2; // random targets tried per nudge; the least crowded wins
const NUDGE_MAX_CROWDING = 0.625; // never move a mine where over 5 of 8 neighbours are mines
const RELOCATE_MAX_STEPS = 200000;
const SETTLE_MAX_STEPS = 20000;

// The board is zoomed to the largest size that is still fully visible.
const CELL_PX = 28; // .field --cell in index.html
const MAX_ZOOM = 2;
const MIN_ZOOM = 0.5; // below this the board scrolls sideways instead
const FIT_MARGIN = 8 + 40; // .field-wrap bottom padding + .page bottom padding (theme.css)

const fieldEl = document.getElementById('field');
const fieldWrapEl = fieldEl.parentElement;
const hintEl = document.querySelector('.hint');
const widthEl = document.getElementById('width');
const heightEl = document.getElementById('height');
const widthValueEl = document.getElementById('width-value');
const heightValueEl = document.getElementById('height-value');
const minePctEl = document.getElementById('mine-pct');
const minePctValueEl = document.getElementById('mine-pct-value');
const modesEl = document.getElementById('modes');
const modeNoteEl = document.getElementById('mode-note');
const minesLeftEl = document.getElementById('mines-left');
const timeEl = document.getElementById('time');
const resultEl = document.getElementById('result');
const statusEl = document.getElementById('status');
const flagModeBtn = document.getElementById('flag-mode');

let size = { cols: 9, rows: 9 };
let minePct = 16; // about the classic intermediate board's share
let mode = MODES[0];
let cols, rows, total;
let mineTotal; // this game's mines: minePct of its cells
let mine, count, open, flag; // one Uint8Array entry per cell
let nbrAt, nbrs; // cell i's neighbours are nbrs[nbrAt[i]] up to nbrs[nbrAt[i + 1]]
let cells = [];
let state = 'ready'; // 'ready' (no mines yet) | 'playing' | 'won' | 'lost'
let opened = 0;
let flags = 0;
let flagMode = false;
let startTime = 0;
let timer = null;
let fitDPR = window.devicePixelRatio || 1; // pixel ratio when the board was last fitted

try {
  const saved = JSON.parse(localStorage.getItem(SIZE_KEY));
  const old = OLD_LEVEL_SIZES[localStorage.getItem(OLD_LEVEL_KEY)];
  if (saved) size = { cols: clampTo(widthEl, saved.cols), rows: clampTo(heightEl, saved.rows) };
  else if (old) size = { cols: old[0], rows: old[1] };
  const savedPct = localStorage.getItem(MINE_PCT_KEY);
  const oldPct = OLD_DENSITY_PCTS[localStorage.getItem(OLD_DENSITY_KEY)];
  if (savedPct !== null) minePct = clampTo(minePctEl, savedPct);
  else if (oldPct) minePct = oldPct;
  const savedMode = MODES.find(m => m.id === localStorage.getItem(MODE_KEY));
  if (savedMode) mode = savedMode;
} catch (e) { /* storage unavailable */ }

// ---- Setup ----

// A whole number within a slider's limits (its minimum if n isn't a number).
function clampTo(slider, n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(+slider.max, Math.max(+slider.min, v)) : +slider.min;
}

// One tab per option; picking one saves it and starts a new game.
function buildTabs(el, options, key, pick) {
  for (const o of options) {
    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.setAttribute('role', 'tab');
    tab.dataset.id = o.id;
    tab.textContent = o.name;
    tab.addEventListener('click', () => {
      if (state === 'playing') return;
      pick(o);
      try { localStorage.setItem(key, o.id); } catch (e) { /* ignore */ }
      newGame();
    });
    el.appendChild(tab);
  }
}

function markTabs(el, id) {
  el.querySelectorAll('.tab').forEach(t => {
    t.setAttribute('aria-selected', String(t.dataset.id === id));
  });
}

// A setting slider redraws the empty board as it moves and is saved once let
// go. read gives the setting's value, write sets it; while a game is under
// way the slider snaps back instead.
function bindSlider(el, read, write, save) {
  el.addEventListener('input', () => {
    if (state === 'playing') { el.value = read(); return; }
    write(clampTo(el, el.value));
    newGame();
  });
  el.addEventListener('change', () => {
    try { save(); } catch (e) { /* ignore */ }
  });
}

// Size, mines and mode stay put while a game is under way.
function lockSettings(locked) {
  widthEl.disabled = locked;
  heightEl.disabled = locked;
  minePctEl.disabled = locked;
  for (const t of modesEl.querySelectorAll('.tab')) t.disabled = locked;
}

function newGame() {
  cols = size.cols;
  rows = size.rows;
  total = cols * rows;
  buildNeighbors();
  // Leave room for the first click's clear 3×3.
  mineTotal = Math.min(total - 9, Math.round(total * minePct / 100));
  mine = new Uint8Array(total);
  count = new Uint8Array(total);
  open = new Uint8Array(total);
  flag = new Uint8Array(total);
  state = 'ready';
  opened = 0;
  flags = 0;
  stopTimer();
  timeEl.textContent = '0';
  resultEl.textContent = '';
  resultEl.className = 'stamp';

  fieldEl.classList.remove('done');
  fieldEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
  const frag = document.createDocumentFragment();
  cells = new Array(total);
  for (let i = 0; i < total; i++) {
    const el = document.createElement('div');
    el.className = 'cell closed';
    el.dataset.i = i;
    cells[i] = el;
    frag.appendChild(el);
  }
  fieldEl.textContent = '';
  fieldEl.appendChild(frag);

  widthEl.value = widthValueEl.textContent = cols;
  heightEl.value = heightValueEl.textContent = rows;
  minePctEl.value = minePct;
  minePctValueEl.textContent = `${minePct}% · ${mineTotal}`;
  markTabs(modesEl, mode.id);
  lockSettings(false);
  modeNoteEl.textContent = mode.note;
  updateHud();
  setStatus(''); // the status line only carries crucial notes, like a forced guess
  fitField();
}

// CSS zoom re-renders the cells at the new size, so they stay sharp.
function fitField() {
  fitDPR = window.devicePixelRatio || 1;
  const boardW = cols * CELL_PX + 2, boardH = rows * CELL_PX + 2; // + 1px border each side
  const top = fieldEl.getBoundingClientRect().top + window.scrollY;
  const hint = hintEl.offsetHeight + parseFloat(getComputedStyle(hintEl).marginTop);
  const widthFit = (fieldWrapEl.clientWidth - 1) / boardW; // 1px slack for rounding
  const room = window.innerHeight - hint - FIT_MARGIN;
  // On phones the settings above fill over half the screen: then fit the board
  // to the screen on its own, once scrolled to, instead of to the strip below them.
  const heightFit = (top > window.innerHeight / 2 ? room - 16 : room - top) / boardH;
  fieldEl.style.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, widthFit, heightFit));
}

function forNeighbors(i, fn) {
  for (let k = nbrAt[i]; k < nbrAt[i + 1]; k++) fn(nbrs[k]);
}

// Neighbour lists for every cell, built each new game: the solver walks
// them constantly.
function buildNeighbors() {
  nbrAt = new Int32Array(total + 1);
  nbrs = new Int32Array(total * 8);
  let k = 0;
  for (let i = 0; i < total; i++) {
    nbrAt[i] = k;
    const r = Math.floor(i / cols);
    const c = i % cols;
    for (let dr = -1; dr <= 1; dr++) {
      const nr = r + dr;
      if (nr < 0 || nr >= rows) continue;
      for (let dc = -1; dc <= 1; dc++) {
        const nc = c + dc;
        if ((dr || dc) && nc >= 0 && nc < cols) nbrs[k++] = nr * cols + nc;
      }
    }
  }
  nbrAt[total] = k;
}

// Mines go in after the first click, never on it or next to it,
// so the first click always opens an area.
function placeMines(safe) {
  mine.fill(0);
  const blocked = new Uint8Array(total);
  blocked[safe] = 1;
  forNeighbors(safe, n => { blocked[n] = 1; });
  const spots = [];
  for (let i = 0; i < total; i++) if (!blocked[i]) spots.push(i);
  scatterMines(spots, mineTotal);
  computeCounts();
}

// Puts k mines on random cells of spots (partial Fisher–Yates, reorders spots).
function scatterMines(spots, k) {
  for (let m = 0; m < k; m++) {
    const j = m + Math.floor(Math.random() * (spots.length - m));
    [spots[m], spots[j]] = [spots[j], spots[m]];
    mine[spots[m]] = 1;
  }
}

function computeCounts() {
  for (let i = 0; i < total; i++) {
    let n = 0;
    forNeighbors(i, x => { n += mine[x]; });
    count[i] = n;
  }
}

// No-guess mode. Random boards rarely clear by logic alone when dense, so
// while the solver gets stuck, a mine on the edge where it stopped moves to
// an uncrowded empty cell; the move stays only if a fresh solve gets at least as
// far. Rerolls a board that stalls, and gives up after a time budget.
function placeSolvable(start) {
  const goal = total - mineTotal;
  const budget = NO_GUESS_BUDGET_MS * Math.max(1, total / NO_GUESS_BUDGET_CELLS);
  const deadline = performance.now() + Math.min(NO_GUESS_BUDGET_MAX_MS, budget);
  do {
    placeMines(start);
    let isOpen = new Uint8Array(total);
    let best = solveFrom(start, isOpen);
    for (let n = 0; best < goal && n < NUDGES_PER_BOARD; n++) {
      const move = pickNudge(isOpen, start);
      if (!move || performance.now() > deadline) break;
      const [from, to] = move;
      moveMine(from, to);
      const tryOpen = new Uint8Array(total);
      const got = solveFrom(start, tryOpen);
      if (got >= best) {
        best = got;
        isOpen = tryOpen;
      } else {
        moveMine(to, from);
      }
    }
    if (best === goal) return true;
  } while (performance.now() < deadline);
  setStatus(`No guess-free board found in time · this one may need a guess`);
  return false;
}

// Moves a mine and fixes the counts around both cells.
function moveMine(from, to) {
  mine[from] = 0;
  mine[to] = 1;
  forNeighbors(from, n => { count[n]--; });
  forNeighbors(to, n => { count[n]++; });
}

// A mine next to the solved area, and an empty cell to move it to: usually a
// closed one away from that area, so the edge gets new numbers. Mines must
// not pile up, though: unchecked they drain into the unsolved area and pack
// solid (a sealed block of mines counts as solved). So the target is the
// least crowded of a few picks, never a crowded one, and when every closed
// pick is crowded it goes into the solved area instead. The first click's
// 3×3 is always open, so it never gets a mine.
function pickNudge(isOpen, start) {
  const edge = [];
  const far = [];
  const closed = [];
  for (let i = 0; i < total; i++) {
    if (isOpen[i]) continue;
    let onEdge = false;
    forNeighbors(i, n => { if (isOpen[n]) onEdge = true; });
    if (onEdge && mine[i]) edge.push(i);
    else if (!mine[i]) {
      closed.push(i);
      if (!onEdge) far.push(i);
    }
  }
  if (!edge.length) return null;
  const from = edge[Math.floor(Math.random() * edge.length)];
  let to = leastCrowded(far.length && Math.random() < 0.7 ? far : closed, from);
  if (to < 0) {
    const solved = [];
    const sr = Math.floor(start / cols);
    const sc = start % cols;
    for (let i = 0; i < total; i++) {
      if (isOpen[i] && (Math.abs(Math.floor(i / cols) - sr) > 1 || Math.abs(i % cols - sc) > 1)) solved.push(i);
    }
    to = leastCrowded(solved, from);
  }
  return to < 0 ? null : [from, to];
}

// The least crowded of a few random cells of pool, or -1 if all are crowded.
function leastCrowded(pool, moving) {
  let to = -1;
  let least = NUDGE_MAX_CROWDING;
  for (let k = 0; pool.length && k < NUDGE_PICKS; k++) {
    const i = pool[Math.floor(Math.random() * pool.length)];
    const c = crowding(i, moving);
    if (c <= least) { to = i; least = c; }
  }
  return to;
}

// Share of i's neighbours that are mines, not counting the one moving away.
function crowding(i, moving) {
  let m = 0;
  let k = 0;
  forNeighbors(i, n => { k++; if (mine[n] && n !== moving) m++; });
  return m / k;
}

// ---- Solver ----
// The deductions a player can make from open numbers alone. No-guess mode
// uses it to check a whole board; forgiving mode uses it to tell a forced
// guess from a mistake. isOpen and known (deduced mines) are cell masks;
// done marks open numbers with nothing left to tell, so repeat calls on a
// growing solve skip them.

function deduce(isOpen, known, done = new Uint8Array(total)) {
  const safe = new Set();
  const mines = new Set();
  const mark = (cells, set) => { for (const c of cells) set.add(c); };
  const result = () => ({ safe: [...safe], mines: [...mines] });

  // A number whose mines are all found clears the rest; one that needs
  // every unknown neighbour makes them all mines.
  const cons = [];
  const conAt = new Int32Array(total).fill(-1);
  let unknown = 0;
  let found = 0;
  for (let i = 0; i < total; i++) {
    if (known[i]) { found++; continue; }
    if (!isOpen[i]) { unknown++; continue; }
    if (done[i]) continue;
    const cells = [];
    let need = count[i];
    forNeighbors(i, n => {
      if (known[n]) need--;
      else if (!isOpen[n]) cells.push(n);
    });
    if (!cells.length) { done[i] = 1; continue; }
    if (need === 0) mark(cells, safe);
    else if (need === cells.length) mark(cells, mines);
    else { conAt[i] = cons.length; cons.push({ i, cells, need }); }
  }
  if (safe.size || mines.size) return result();

  // Pairs of nearby numbers. a's mines can only add to b inside their
  // overlap, so if b needs need_b - need_a more than its own cells hold,
  // those cells are all mines and a's own cells are clear.
  for (const a of cons) {
    const ar = Math.floor(a.i / cols);
    const ac = a.i % cols;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const r = ar + dr;
        const c = ac + dc;
        if ((!dr && !dc) || r < 0 || r >= rows || c < 0 || c >= cols) continue;
        const k = conAt[r * cols + c];
        if (k < 0) continue;
        const b = cons[k];
        const onlyA = a.cells.filter(x => !b.cells.includes(x));
        const onlyB = b.cells.filter(x => !a.cells.includes(x));
        if (onlyB.length === b.cells.length) continue; // no overlap
        if (!onlyA.length && b.need === a.need) mark(onlyB, safe);
        else if (onlyB.length && b.need - a.need === onlyB.length) {
          mark(onlyB, mines);
          mark(onlyA, safe);
        }
      }
    }
  }
  if (safe.size || mines.size) return result();

  // Mine total: none left clears every unknown cell; as many left as
  // unknown cells makes them all mines.
  const left = mineTotal - found;
  if (unknown && (left === 0 || left === unknown)) {
    for (let i = 0; i < total; i++) {
      if (!isOpen[i] && !known[i]) (left === 0 ? safe : mines).add(i);
    }
    return result();
  }

  // Whole groups: numbers that share closed cells are tried together, every
  // way their mines could lie. A cell clear in every way is safe; a mine in
  // every way is a mine. Groups too big to try in time are skipped.
  for (const group of groups(cons)) settle(group, safe, mines);
  return result();
}

// Splits numbers into groups that share closed cells.
function groups(cons) {
  const at = new Map(); // closed cell -> the numbers next to it
  cons.forEach((con, k) => {
    for (const x of con.cells) {
      if (!at.has(x)) at.set(x, []);
      at.get(x).push(k);
    }
  });
  const seen = new Uint8Array(cons.length);
  const out = [];
  for (let s = 0; s < cons.length; s++) {
    if (seen[s]) continue;
    seen[s] = 1;
    const group = [cons[s]];
    for (let g = 0; g < group.length; g++) {
      for (const x of group[g].cells) {
        for (const k of at.get(x)) if (!seen[k]) { seen[k] = 1; group.push(cons[k]); }
      }
    }
    out.push(group);
  }
  return out;
}

// Backtracks over one group's closed cells, noting which have been a mine
// and which clear in some valid layout. Stops early once every cell has been
// both, since then nothing is proven.
function settle(group, safe, mines) {
  const cells = [];
  const slot = new Map(); // closed cell -> its index in cells
  for (const con of group) {
    for (const x of con.cells) if (!slot.has(x)) { slot.set(x, cells.length); cells.push(x); }
  }
  const touch = cells.map(() => []);
  group.forEach((con, k) => { for (const x of con.cells) touch[slot.get(x)].push(k); });
  const placed = new Int32Array(group.length);
  const left = Int32Array.from(group, con => con.cells.length);
  const pick = new Uint8Array(cells.length);
  const asMine = new Uint8Array(cells.length);
  const asClear = new Uint8Array(cells.length);
  let undecided = cells.length;
  let steps = 0;

  const fits = j => touch[j].every(k =>
    placed[k] <= group[k].need && placed[k] + left[k] >= group[k].need);
  // Returns false to stop the search.
  const walk = j => {
    if (++steps > SETTLE_MAX_STEPS) return false;
    if (j === cells.length) {
      for (let x = 0; x < cells.length; x++) {
        const seen = pick[x] ? asMine : asClear;
        if (!seen[x]) {
          seen[x] = 1;
          if (asMine[x] && asClear[x]) undecided--;
        }
      }
      return undecided > 0;
    }
    for (let v = 0; v <= 1; v++) {
      pick[j] = v;
      for (const k of touch[j]) { left[k]--; placed[k] += v; }
      const go = !fits(j) || walk(j + 1);
      for (const k of touch[j]) { left[k]++; placed[k] -= v; }
      if (!go) return false;
    }
    return true;
  };

  walk(0);
  if (steps > SETTLE_MAX_STEPS || !undecided) return;
  for (let x = 0; x < cells.length; x++) {
    if (asClear[x] && !asMine[x]) safe.add(cells[x]);
    else if (asMine[x] && !asClear[x]) mines.add(cells[x]);
  }
}

// Opens start on a scratch mask, flooding out from zeros like reveal().
// onOpen, if given, hears about each cell opened.
function flood(isOpen, start, onOpen) {
  let n = 0;
  const stack = [start];
  while (stack.length) {
    const i = stack.pop();
    if (isOpen[i]) continue;
    isOpen[i] = 1;
    n++;
    if (onOpen) onOpen(i);
    if (count[i] === 0) forNeighbors(i, x => { if (!isOpen[x]) stack.push(x); });
  }
  return n;
}

// Plays the current board from start using deductions only. Returns how
// many cells it opened; isOpen is left showing which. The simple rule runs
// off a list of numbers whose surroundings just changed, so only those are
// rechecked; the full deduce runs only once that list is used up.
function solveFrom(start, isOpen) {
  const goal = total - mineTotal;
  const known = new Uint8Array(total);
  const done = new Uint8Array(total);
  const recheck = [];
  const queued = new Uint8Array(total);
  const queue = i => { if (!queued[i] && isOpen[i] && !done[i]) { queued[i] = 1; recheck.push(i); } };
  // Opening or finding a cell changes what it and the numbers around it say.
  const touched = i => { queue(i); forNeighbors(i, queue); };
  const openCell = s => flood(isOpen, s, touched);
  const markMine = m => { if (!known[m]) { known[m] = 1; touched(m); } };
  let opened = openCell(start);
  while (opened < goal) {
    while (recheck.length && opened < goal) {
      const i = recheck.pop();
      queued[i] = 0;
      if (done[i]) continue;
      const cells = [];
      let need = count[i];
      forNeighbors(i, n => {
        if (known[n]) need--;
        else if (!isOpen[n]) cells.push(n);
      });
      if (!cells.length) done[i] = 1;
      else if (need === 0) for (const c of cells) opened += openCell(c);
      else if (need === cells.length) for (const c of cells) markMine(c);
    }
    if (opened >= goal) break;
    const { safe, mines } = deduce(isOpen, known, done);
    if (!safe.length && !mines.length) break;
    for (const m of mines) markMine(m);
    for (const s of safe) opened += openCell(s);
  }
  return opened;
}

// Whether the open numbers prove some closed cell safe. Player flags are
// ignored: they may be wrong.
function hasSafeMove() {
  const known = new Uint8Array(total);
  const done = new Uint8Array(total);
  for (;;) {
    const { safe, mines } = deduce(open, known, done);
    if (safe.length) return true;
    if (!mines.length) return false;
    for (const m of mines) known[m] = 1;
  }
}

// Forgiving mode: finds a new mine layout that matches every open number,
// keeps the mine total and leaves hit clear. Cells next to open numbers are
// searched by backtracking; the leftover mines go anywhere else at random.
function relocateMine(hit) {
  const cons = [];
  const touches = [];
  for (let i = 0; i < total; i++) {
    if (!open[i]) continue;
    const cells = [];
    forNeighbors(i, n => { if (!open[n]) cells.push(n); });
    if (!cells.length) continue;
    for (const n of cells) {
      if (!touches[n]) touches[n] = [];
      touches[n].push(cons.length);
    }
    cons.push({ need: count[i], room: cells.length });
  }
  const front = [];
  const inner = [];
  for (let i = 0; i < total; i++) {
    if (open[i] || i === hit) continue;
    (touches[i] ? front : inner).push(i);
  }
  if (touches[hit]) for (const k of touches[hit]) cons[k].room--;

  const layout = new Uint8Array(total);
  let used = 0;
  let steps = 0;
  const place = idx => {
    if (++steps > RELOCATE_MAX_STEPS) return false;
    if (idx === front.length) {
      const rest = mineTotal - used;
      return rest <= inner.length && cons.every(c => c.need === 0);
    }
    const cell = front[idx];
    const ks = touches[cell];
    for (const m of Math.random() < 0.5 ? [1, 0] : [0, 1]) {
      if (used + m > mineTotal) continue;
      let ok = true;
      for (const k of ks) {
        const c = cons[k];
        c.room--;
        c.need -= m;
        if (c.need < 0 || c.need > c.room) ok = false;
      }
      if (ok) {
        layout[cell] = m;
        used += m;
        if (place(idx + 1)) return true;
        used -= m;
        layout[cell] = 0;
      }
      for (const k of ks) {
        cons[k].room++;
        cons[k].need += m;
      }
    }
    return false;
  };
  if (!place(0)) return false;

  mine.fill(0);
  for (const i of front) mine[i] = layout[i];
  scatterMines(inner, mineTotal - used);
  computeCounts();
  return true;
}

// ---- Moves ----

// Opens a cell; a 0 opens its neighbours too (iteratively, no deep recursion).
function reveal(start) {
  if (open[start] || flag[start]) return;
  if (state === 'ready') {
    if (mode.id === 'noguess') placeSolvable(start);
    else placeMines(start);
    state = 'playing';
    lockSettings(true);
    startTimer();
  }
  if (mine[start]) {
    // Forgiving mode spares a hit only when logic offered no safe cell.
    if (mode.id === 'forgiving' && !hasSafeMove() && relocateMine(start)) {
      setStatus(`Forced guess · mine moved, keep going`);
    } else {
      lose(start);
      return;
    }
  }
  const stack = [start];
  while (stack.length) {
    const i = stack.pop();
    if (open[i] || flag[i]) continue;
    open[i] = 1;
    opened++;
    renderCell(i);
    if (count[i] === 0) {
      forNeighbors(i, n => { if (!open[n] && !flag[n]) stack.push(n); });
    }
  }
  if (opened === total - mineTotal) win();
}

// Clicking an open number whose flags are all placed opens the rest around it.
function chord(i) {
  if (!open[i] || count[i] === 0) return;
  let flagged = 0;
  forNeighbors(i, n => { flagged += flag[n]; });
  if (flagged !== count[i]) return;
  const targets = [];
  forNeighbors(i, n => { if (!open[n] && !flag[n]) targets.push(n); });
  for (const n of targets) {
    if (state !== 'playing') return;
    reveal(n);
  }
}

function toggleFlag(i) {
  if (open[i]) return;
  flag[i] ^= 1;
  flags += flag[i] ? 1 : -1;
  renderCell(i);
  updateHud();
}

function win() {
  state = 'won';
  stopTimer();
  lockSettings(false);
  for (let i = 0; i < total; i++) {
    if (mine[i] && !flag[i]) {
      flag[i] = 1;
      flags++;
      renderCell(i);
    }
  }
  fieldEl.classList.add('done');
  resultEl.textContent = 'CLEARED';
  resultEl.className = 'stamp good';
  updateHud();
  setStatus(''); // the stamp and timer already say it
  report(true);
}

function lose(hit) {
  state = 'lost';
  stopTimer();
  lockSettings(false);
  for (let i = 0; i < total; i++) {
    if (mine[i] && !flag[i]) {
      cells[i].className = 'cell mine' + (i === hit ? ' hit' : '');
    } else if (flag[i] && !mine[i]) {
      cells[i].className = 'cell closed flag wrong';
    }
  }
  fieldEl.classList.add('done');
  resultEl.textContent = 'BOOM';
  resultEl.className = 'stamp bad';
  setStatus('');
  report(false);
}

// Sends a finished game to the account (nothing happens for guests). Where a win
// lands on the leaderboards shows in the status line.
function report(won) {
  const seconds = (Date.now() - startTime) / 1000;
  const game = state;
  Nexus.finishRun({ won, seconds, cols, rows, minePct, mode: mode.id }).then(answer => {
    if (state === game && won) setStatus(Nexus.rankLines(answer).join(' · '));
  });
}

// ---- Rendering ----

function renderCell(i) {
  const el = cells[i];
  if (open[i]) {
    el.className = count[i] ? 'cell n' + count[i] : 'cell';
    el.textContent = count[i] || '';
  } else {
    el.className = flag[i] ? 'cell closed flag' : 'cell closed';
  }
}

function updateHud() {
  minesLeftEl.textContent = mineTotal - flags;
}

function setStatus(text) {
  statusEl.textContent = text;
}

// ---- Timer ----

function elapsed() {
  return Math.min(999, Math.floor((Date.now() - startTime) / 1000));
}

function startTimer() {
  startTime = Date.now();
  Nexus.startRun('minesweeper');
  timer = setInterval(() => { timeEl.textContent = elapsed(); }, 1000);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

// ---- Input ----

function cellIndex(e) {
  const el = e.target.closest('.cell');
  return el ? Number(el.dataset.i) : -1;
}

fieldEl.addEventListener('click', e => {
  const i = cellIndex(e);
  if (i < 0 || state === 'won' || state === 'lost') return;
  if (open[i]) chord(i);
  else if (flagMode) toggleFlag(i);
  else reveal(i);
});

fieldEl.addEventListener('contextmenu', e => {
  e.preventDefault();
  const i = cellIndex(e);
  if (i < 0 || state === 'won' || state === 'lost') return;
  toggleFlag(i);
});

flagModeBtn.addEventListener('click', () => {
  flagMode = !flagMode;
  flagModeBtn.setAttribute('aria-pressed', String(flagMode));
});

document.getElementById('new-game').addEventListener('click', newGame);

const saveSize = () => localStorage.setItem(SIZE_KEY, JSON.stringify(size));
bindSlider(widthEl, () => size.cols, v => { size.cols = v; }, saveSize);
bindSlider(heightEl, () => size.rows, v => { size.rows = v; }, saveSize);
bindSlider(minePctEl, () => minePct, v => { minePct = v; }, () => localStorage.setItem(MINE_PCT_KEY, minePct));
buildTabs(modesEl, MODES, MODE_KEY, o => { mode = o; });
// Browser zoom also fires resize: then keep the board's zoom so the browser's
// zoom takes effect. A real window resize re-fits the board.
window.addEventListener('resize', () => {
  if ((window.devicePixelRatio || 1) !== fitDPR) fitDPR = window.devicePixelRatio || 1;
  else fitField();
});
newGame();
