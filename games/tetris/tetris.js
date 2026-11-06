// Simple Tetris: vanilla JS + canvas, no dependencies.
// Kept lightweight for low-end devices: the board is only redrawn when
// something changes, and the graph-paper background is pre-rendered once
// (and again when the theme changes).

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const PREVIEW_BLOCK = 24;
const BOARD_W = COLS * BLOCK;
const BOARD_H = ROWS * BLOCK;
const NEXT_SIZE = 120;
const MAX_DPR = 4; // more canvas pixels than this costs too much on low-end devices
const MAX_SCALE = 2; // the board is shown up to twice its 300×600 size
const SIDE_PANEL = 200 + 32; // .side width + layout gap (index.html)
const FIT_MARGIN = 40 + 2; // .page bottom padding (theme.css) + the board's 1px border top and bottom

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

const gridCanvas = document.createElement('canvas');
const gridCtx = gridCanvas.getContext('2d');

// The board is shown about BOARD_SCALE times its 300×600 size, and canvases get
// one pixel per screen pixel (browser zoom and high-DPI screens raise
// devicePixelRatio), while all drawing stays in board coordinates.
let DPR = 1;
let BOARD_SCALE = 1;
const currentDPR = () => Math.min(MAX_DPR, window.devicePixelRatio || 1);

// Draws at `res` device pixels per board unit. The canvas gets exactly that many
// pixels and is shown at exactly that size, so the browser never resamples it.
function sizeCanvas(c, context, width, height, res) {
  c.width = Math.round(width * res);
  c.height = Math.round(height * res);
  c.style.width = c.width / DPR + 'px';
  c.style.height = c.height / DPR + 'px';
  context.res = res;
  context.setTransform(res, 0, 0, res, 0, 0);
}

// Device pixels per board unit for cells of `cell` units: rounded down so every
// cell is a whole number of screen pixels and its edges stay crisp.
const cellRes = (cell, scale) => Math.max(1, Math.floor(cell * scale * DPR)) / cell;

// Board coordinates rounded to a context's pixel grid, and a line width of whole
// device pixels, for crisp lines and edges at any scale.
const snap = (c, v) => Math.round(v * c.res) / c.res;
const hairline = (c, width = 1) => Math.max(1, Math.round(width * c.res)) / c.res;

// Largest board that is still fully visible without scrolling. The side panel
// stays beside it when there's room; on narrow screens it wraps below anyway.
function fitBoardScale() {
  const content = canvas.parentElement.clientWidth;
  const top = canvas.getBoundingClientRect().top + window.scrollY;
  const heightFit = (window.innerHeight - top - FIT_MARGIN) / BOARD_H;
  const sideFit = (content - SIDE_PANEL - 2) / BOARD_W;
  const widthFit = sideFit >= 1 ? sideFit : (content - 2) / BOARD_W;
  return Math.max(0.5, Math.min(MAX_SCALE, heightFit, widthFit));
}

function fitCanvases(rescale = true) {
  DPR = currentDPR();
  if (rescale) BOARD_SCALE = fitBoardScale();
  const res = cellRes(BLOCK, BOARD_SCALE);
  sizeCanvas(canvas, ctx, BOARD_W, BOARD_H, res);
  sizeCanvas(gridCanvas, gridCtx, BOARD_W, BOARD_H, res);
  sizeCanvas(nextCanvas, nextCtx, NEXT_SIZE, NEXT_SIZE, cellRes(PREVIEW_BLOCK, 1));
  readTheme(); // resizing clears the canvases, so redraw the graph paper
}

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

// ---- Theme ----

// Graph paper: minor lines every 10px, major lines on the cell borders.
function drawGraph(c, width, height, cell) {
  c.fillStyle = pal.paper;
  c.fillRect(0, 0, width, height);
  // Lines are thin rectangles snapped to the pixel grid, so they stay crisp.
  const line = hairline(c);
  const minor = cell / 3;
  c.fillStyle = pal['grid-minor'];
  for (let x = minor; x < width; x += minor) c.fillRect(snap(c, x), 0, line, height);
  for (let y = minor; y < height; y += minor) c.fillRect(0, snap(c, y), width, line);
  c.fillStyle = pal['grid-major'];
  for (let x = cell; x < width; x += cell) c.fillRect(snap(c, x), 0, line, height);
  for (let y = cell; y < height; y += cell) c.fillRect(0, snap(c, y), width, line);
}

function readTheme() {
  pal = Theme.palette();
  colors = PIECE_PENS.map(name => name && pal[name]);
  drawGraph(gridCtx, BOARD_W, BOARD_H, BLOCK);
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

// A rectangle outline whose edges and line width sit exactly on device pixels.
function crispStroke(c, x, y, w, h, width = 1) {
  const x0 = snap(c, x), y0 = snap(c, y);
  const line = hairline(c, width);
  c.lineWidth = line;
  c.strokeRect(x0 + line / 2, y0 + line / 2, snap(c, x + w) - x0 - line, snap(c, y + h) - y0 - line);
}

function drawCell(c, x, y, color, size) {
  const px = x * size + 1;
  const py = y * size + 1;
  const x0 = snap(c, px), y0 = snap(c, py);
  c.fillStyle = color;
  c.fillRect(x0, y0, snap(c, px + size - 2) - x0, snap(c, py + size - 2) - y0);
  c.strokeStyle = pal.ink;
  crispStroke(c, px, py, size - 2, size - 2);
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
  ctx.setLineDash([4, 3]);
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) crispStroke(ctx, (ox + c) * BLOCK + 3, (oy + r) * BLOCK + 3, BLOCK - 6, BLOCK - 6);
    }
  }
  ctx.setLineDash([]);
}

function drawNext() {
  drawGraph(nextCtx, NEXT_SIZE, NEXT_SIZE, PREVIEW_BLOCK);
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
  const ox = (NEXT_SIZE - w) / 2 / PREVIEW_BLOCK - minC;
  const oy = (NEXT_SIZE - h) / 2 / PREVIEW_BLOCK - minR;
  drawMatrix(nextCtx, m, ox, oy, PREVIEW_BLOCK);
}

// Flash the full rows in highlighter, then erase them from the center outward.
function drawClearing() {
  if (clearElapsed < CLEAR_FLASH_MS) {
    ctx.fillStyle = pal.highlighter;
    for (const r of clearRows) ctx.fillRect(0, r * BLOCK, BOARD_W, BLOCK);
    return;
  }
  const p = Math.min(1, (clearElapsed - CLEAR_FLASH_MS) / (CLEAR_MS - CLEAR_FLASH_MS));
  const radius = p * COLS / 2;
  for (const r of clearRows) {
    for (let c = 0; c < COLS; c++) {
      if (Math.abs(c + 0.5 - COLS / 2) < radius) {
        const x = c * BLOCK, y = r * BLOCK;
        const k = gridCtx.res; // grid canvas pixels per board unit
        ctx.drawImage(gridCanvas, x * k, y * k, BLOCK * k, BLOCK * k, x, y, BLOCK, BLOCK);
      }
    }
  }
}

// A paper slip with an ink outline in the middle of the board.
function drawOverlay(title, subtitle, titleColor, stamped) {
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = pal.desk;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  ctx.globalAlpha = 1;

  const w = 230, h = 110;
  const x = (BOARD_W - w) / 2, y = (BOARD_H - h) / 2;
  ctx.fillStyle = pal.paper;
  ctx.fillRect(snap(ctx, x), snap(ctx, y), snap(ctx, x + w) - snap(ctx, x), snap(ctx, y + h) - snap(ctx, y));
  ctx.strokeStyle = pal.ink;
  crispStroke(ctx, x, y, w, h);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 26px ' + FONT;
  ctx.fillStyle = titleColor;
  ctx.fillText(title, BOARD_W / 2, y + 44);
  if (stamped) {
    const tw = ctx.measureText(title).width + 20;
    ctx.strokeStyle = titleColor;
    crispStroke(ctx, BOARD_W / 2 - tw / 2, y + 26, tw, 36, 1.5);
  }
  ctx.font = '13px ' + FONT_CONDENSED;
  ctx.fillStyle = pal['ink-muted'];
  ctx.fillText(subtitle, BOARD_W / 2, y + 84);
}

function draw() {
  ctx.drawImage(gridCanvas, 0, 0, BOARD_W, BOARD_H);
  drawMatrix(ctx, board, 0, 0, BLOCK);
  if (clearRows.length) drawClearing();

  if (piece && state !== 'start') {
    drawGhost(piece.matrix, piece.x, ghostY());
    drawMatrix(ctx, piece.matrix, piece.x, piece.y, BLOCK);
  }

  drawNext();

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
// Browser zoom also fires resize: then keep the board's size so the zoom takes
// effect, and only match the new pixel ratio. A real window resize re-fits it.
window.addEventListener('resize', () => {
  if (currentDPR() !== DPR) fitCanvases(false);
  else if (fitBoardScale() !== BOARD_SCALE) fitCanvases(true);
});
fitCanvases();
updateHud();
requestAnimationFrame(loop);
