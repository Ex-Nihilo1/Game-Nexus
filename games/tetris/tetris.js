// Simple Tetris: vanilla JS + canvas, no dependencies.
// Kept lightweight for low-end devices: the board is only redrawn when
// something changes, and the graph-paper background is pre-rendered once
// (and again when the theme changes).

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const PREVIEW_BLOCK = 24;

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[2, 2], [2, 2]],
  T: [[0, 3, 0], [3, 3, 3], [0, 0, 0]],
  S: [[0, 4, 4], [4, 4, 0], [0, 0, 0]],
  Z: [[5, 5, 0], [0, 5, 5], [0, 0, 0]],
  J: [[6, 0, 0], [6, 6, 6], [0, 0, 0]],
  L: [[0, 0, 7], [7, 7, 7], [0, 0, 0]],
};

// Pen used for each piece value (index 0 = empty).
const PIECE_PENS = [null, 'blue-pen', 'highlighter', 'violet', 'green-ink', 'red-pencil', 'ink', 'orange-pen'];

const LINE_POINTS = [0, 100, 300, 500, 800];
const KICKS = [0, -1, 1, -2, 2];
const CLEAR_FLASH_MS = 100; // full rows flash in highlighter...
const CLEAR_MS = 350;       // ...then wipe out from the center until this point

const FONT = 'Bahnschrift, "Segoe UI", sans-serif';
const FONT_CONDENSED = '"Bahnschrift SemiCondensed", Bahnschrift, sans-serif';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const statusEl = document.getElementById('status');

const gridCanvas = document.createElement('canvas');
gridCanvas.width = canvas.width;
gridCanvas.height = canvas.height;

let pal = {};
let colors = [];

let board = createBoard();
let bag = [];
let piece = null;
let nextPiece = null;
let score = 0;
let lines = 0;
let level = 1;
let dropInterval = 1000;
let dropCounter = 0;
let lastTime = 0;
let clearRows = []; // full rows currently being animated away
let clearElapsed = 0;
let state = 'start'; // 'start' | 'playing' | 'clearing' | 'paused' | 'over'
let dirty = true; // true when the screen needs a redraw
let lastStatus = '';

// ---- Theme ----

// Graph paper: minor lines every 10px, major lines on the cell borders.
function drawGraph(c, width, height, cell) {
  c.fillStyle = pal.paper;
  c.fillRect(0, 0, width, height);
  c.lineWidth = 1;
  c.strokeStyle = pal['grid-minor'];
  c.beginPath();
  const minor = cell / 3;
  for (let x = minor; x < width; x += minor) { c.moveTo(Math.round(x) + 0.5, 0); c.lineTo(Math.round(x) + 0.5, height); }
  for (let y = minor; y < height; y += minor) { c.moveTo(0, Math.round(y) + 0.5); c.lineTo(width, Math.round(y) + 0.5); }
  c.stroke();
  c.strokeStyle = pal['grid-major'];
  c.beginPath();
  for (let x = cell; x < width; x += cell) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, height); }
  for (let y = cell; y < height; y += cell) { c.moveTo(0, y + 0.5); c.lineTo(width, y + 0.5); }
  c.stroke();
}

function readTheme() {
  pal = Theme.palette();
  colors = PIECE_PENS.map(name => name && pal[name]);
  drawGraph(gridCanvas.getContext('2d'), gridCanvas.width, gridCanvas.height, BLOCK);
  dirty = true;
}

// ---- Game logic ----

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

// 7-bag randomizer: every piece appears once per 7 spawns.
function nextFromBag() {
  if (bag.length === 0) {
    bag = Object.keys(SHAPES);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  const matrix = SHAPES[bag.pop()].map(row => row.slice());
  return { matrix, x: Math.floor((COLS - matrix[0].length) / 2), y: 0 };
}

function collides(matrix, x, y) {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const bx = x + c;
      const by = y + r;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
  }
  return false;
}

// dir = 1 for clockwise, -1 for counter-clockwise.
function rotate(matrix, dir) {
  const n = matrix.length;
  return matrix.map((row, r) =>
    row.map((_, c) => (dir > 0 ? matrix[n - 1 - c][r] : matrix[c][n - 1 - r]))
  );
}

function tryRotate(dir) {
  const rotated = rotate(piece.matrix, dir);
  for (const offset of KICKS) {
    if (!collides(rotated, piece.x + offset, piece.y)) {
      piece.matrix = rotated;
      piece.x += offset;
      dirty = true;
      return;
    }
  }
}

function move(dx) {
  if (!collides(piece.matrix, piece.x + dx, piece.y)) {
    piece.x += dx;
    dirty = true;
  }
}

// Moves the piece down one row, or locks it if it can't move. Returns true if it moved.
function stepDown() {
  dirty = true;
  if (!collides(piece.matrix, piece.x, piece.y + 1)) {
    piece.y++;
    return true;
  }
  lockPiece();
  return false;
}

function softDrop() {
  if (stepDown()) {
    score += 1;
    updateHud();
  }
  dropCounter = 0;
}

function hardDrop() {
  let distance = 0;
  while (!collides(piece.matrix, piece.x, piece.y + 1)) {
    piece.y++;
    distance++;
  }
  score += distance * 2;
  lockPiece();
  dropCounter = 0;
  dirty = true;
}

function lockPiece() {
  piece.matrix.forEach((row, r) => {
    row.forEach((value, c) => {
      if (value && piece.y + r >= 0) board[piece.y + r][piece.x + c] = value;
    });
  });
  clearRows = findFullRows();
  if (clearRows.length) {
    // Animate the rows away first; the next piece spawns when it finishes.
    state = 'clearing';
    clearElapsed = 0;
    piece = null;
    dirty = true;
  } else {
    spawn();
  }
  updateHud();
}

function findFullRows() {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every(v => v)) rows.push(r);
  }
  return rows;
}

function removeRows(rows) {
  // Remove from the top down so the indices below stay valid.
  for (const r of rows) {
    board.splice(r, 1);
    board.unshift(new Array(COLS).fill(0));
  }
  score += LINE_POINTS[rows.length] * level;
  lines += rows.length;
  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 80);
}

function finishClear() {
  removeRows(clearRows);
  clearRows = [];
  state = 'playing';
  spawn();
  updateHud();
}

function spawn() {
  piece = nextPiece;
  nextPiece = nextFromBag();
  if (collides(piece.matrix, piece.x, piece.y)) state = 'over';
  dirty = true;
}

function ghostY() {
  let y = piece.y;
  while (!collides(piece.matrix, piece.x, y + 1)) y++;
  return y;
}

function updateHud() {
  scoreEl.textContent = score;
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function reset() {
  board = createBoard();
  bag = [];
  score = 0;
  lines = 0;
  level = 1;
  dropInterval = 1000;
  dropCounter = 0;
  clearRows = [];
  nextPiece = nextFromBag();
  state = 'playing';
  spawn();
  updateHud();
}

// ---- Rendering ----

function drawCell(c, x, y, color, size) {
  const px = x * size;
  const py = y * size;
  c.fillStyle = color;
  c.fillRect(px + 1, py + 1, size - 2, size - 2);
  c.strokeStyle = pal.ink;
  c.lineWidth = 1;
  c.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
}

function drawMatrix(c, matrix, ox, oy, size) {
  for (let r = 0; r < matrix.length; r++) {
    for (let col = 0; col < matrix[r].length; col++) {
      const v = matrix[r][col];
      if (v) drawCell(c, ox + col, oy + r, colors[v], size);
    }
  }
}

// Dashed outline where the piece will land.
function drawGhost(matrix, ox, oy) {
  ctx.strokeStyle = pal['ink-muted'];
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) ctx.strokeRect((ox + c) * BLOCK + 3.5, (oy + r) * BLOCK + 3.5, BLOCK - 7, BLOCK - 7);
    }
  }
  ctx.setLineDash([]);
}

function drawNext() {
  drawGraph(nextCtx, nextCanvas.width, nextCanvas.height, PREVIEW_BLOCK);
  if (!nextPiece) return;

  // Center the piece by its filled cells, ignoring empty rows/columns.
  const m = nextPiece.matrix;
  let minR = m.length, maxR = -1, minC = m.length, maxC = -1;
  m.forEach((row, r) => row.forEach((v, c) => {
    if (!v) return;
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }));
  const w = (maxC - minC + 1) * PREVIEW_BLOCK;
  const h = (maxR - minR + 1) * PREVIEW_BLOCK;
  const ox = (nextCanvas.width - w) / 2 / PREVIEW_BLOCK - minC;
  const oy = (nextCanvas.height - h) / 2 / PREVIEW_BLOCK - minR;
  drawMatrix(nextCtx, m, ox, oy, PREVIEW_BLOCK);
}

// Flash the full rows in highlighter, then erase them from the center outward.
function drawClearing() {
  if (clearElapsed < CLEAR_FLASH_MS) {
    ctx.fillStyle = pal.highlighter;
    for (const r of clearRows) ctx.fillRect(0, r * BLOCK, canvas.width, BLOCK);
    return;
  }
  const p = Math.min(1, (clearElapsed - CLEAR_FLASH_MS) / (CLEAR_MS - CLEAR_FLASH_MS));
  const radius = p * COLS / 2;
  for (const r of clearRows) {
    for (let c = 0; c < COLS; c++) {
      if (Math.abs(c + 0.5 - COLS / 2) < radius) {
        const x = c * BLOCK, y = r * BLOCK;
        ctx.drawImage(gridCanvas, x, y, BLOCK, BLOCK, x, y, BLOCK, BLOCK);
      }
    }
  }
}

// A paper slip with an ink outline in the middle of the board.
function drawOverlay(title, subtitle, titleColor, stamped) {
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = pal.desk;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;

  const w = 230, h = 110;
  const x = (canvas.width - w) / 2, y = (canvas.height - h) / 2;
  ctx.fillStyle = pal.paper;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 26px ' + FONT;
  ctx.fillStyle = titleColor;
  ctx.fillText(title, canvas.width / 2, y + 44);
  if (stamped) {
    const tw = ctx.measureText(title).width + 20;
    ctx.strokeStyle = titleColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(canvas.width / 2 - tw / 2, y + 26, tw, 36);
  }
  ctx.font = '13px ' + FONT_CONDENSED;
  ctx.fillStyle = pal['ink-muted'];
  ctx.fillText(subtitle, canvas.width / 2, y + 84);
}

function updateStatus() {
  let text;
  if (state === 'start') text = 'Press Enter to start';
  else if (state === 'paused') text = 'Paused';
  else if (state === 'over') text = `Game over · ${score} points`;
  else text = `Playing · level ${level}`;
  if (text !== lastStatus) {
    statusEl.textContent = text;
    lastStatus = text;
  }
}

function draw() {
  ctx.drawImage(gridCanvas, 0, 0);
  drawMatrix(ctx, board, 0, 0, BLOCK);
  if (clearRows.length) drawClearing();

  if (piece && state !== 'start') {
    drawGhost(piece.matrix, piece.x, ghostY());
    drawMatrix(ctx, piece.matrix, piece.x, piece.y, BLOCK);
  }

  drawNext();
  updateStatus();

  if (state === 'start') drawOverlay('Tetris', 'Press Enter to start', pal.ink, false);
  else if (state === 'paused') drawOverlay('Paused', 'Press P to resume', pal.ink, false);
  else if (state === 'over') drawOverlay('GAME OVER', 'Press Enter to restart', pal['red-pencil'], true);
}

// ---- Game loop ----

function loop(time = 0) {
  const delta = time - lastTime;
  lastTime = time;

  if (state === 'playing') {
    dropCounter += delta;
    if (dropCounter > dropInterval) {
      stepDown();
      dropCounter = 0;
    }
  } else if (state === 'clearing') {
    clearElapsed += delta;
    dirty = true;
    if (clearElapsed >= CLEAR_MS) finishClear();
  }

  if (dirty) {
    draw();
    dirty = false;
  }
  requestAnimationFrame(loop);
}

// ---- Input ----

const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];

document.addEventListener('keydown', e => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();

  if (e.code === 'Enter') {
    if (state === 'start' || state === 'over') reset();
    return;
  }
  if (e.code === 'KeyP') {
    if (state === 'playing') state = 'paused';
    else if (state === 'paused') state = 'playing';
    dirty = true;
    return;
  }
  if (state !== 'playing') return;

  switch (e.code) {
    case 'ArrowLeft': move(-1); break;
    case 'ArrowRight': move(1); break;
    case 'ArrowUp':
    case 'KeyX': tryRotate(1); break;
    case 'KeyZ': tryRotate(-1); break;
    case 'ArrowDown': softDrop(); break;
    case 'Space': hardDrop(); break;
  }
});

document.addEventListener('themechange', readTheme);
readTheme();
updateHud();
requestAnimationFrame(loop);
