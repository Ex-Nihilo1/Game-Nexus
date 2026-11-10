// Finding enemies fast: a spatial hash and the shapes weapons hit.

// A spatial hash that wraps around: enemies never stray far enough from the hero to collide.
const GRID_CELL = 48;
const grid = Array.from({ length: 4096 }, () => []);
const usedCells = [];

function gridIndex(cx, cy) { return ((cy & 63) << 6) | (cx & 63); }

function rebuildGrid() {
  for (const i of usedCells) grid[i].length = 0;
  usedCells.length = 0;
  for (const e of enemies) {
    const i = gridIndex(Math.floor(e.x / GRID_CELL), Math.floor(e.y / GRID_CELL));
    if (grid[i].length === 0) usedCells.push(i);
    grid[i].push(e);
  }
}

function eachEnemyNear(x, y, r, fn) {
  const reach = r + MAX_ENEMY_R;
  const x0 = Math.floor((x - reach) / GRID_CELL);
  const x1 = Math.floor((x + reach) / GRID_CELL);
  const y0 = Math.floor((y - reach) / GRID_CELL);
  const y1 = Math.floor((y + reach) / GRID_CELL);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const cell = grid[gridIndex(cx, cy)];
      for (let i = 0; i < cell.length; i++) {
        const e = cell[i];
        if (e.dead) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        const rr = r + e.r;
        if (dx * dx + dy * dy < rr * rr) fn(e);
      }
    }
  }
}

// Everything touching a straight lance that starts at (x, y) and points along `a`.
function eachEnemyOnLance(x, y, a, length, halfWidth, fn) {
  const cx = Math.cos(a);
  const cy = Math.sin(a);
  eachEnemyNear(x + cx * length / 2, y + cy * length / 2, length / 2 + halfWidth, e => {
    const dx = e.x - x;
    const dy = e.y - y;
    const along = dx * cx + dy * cy;
    const side = Math.abs(dy * cx - dx * cy);
    if (along > -e.r && along < length + e.r && side < halfWidth + e.r) fn(e);
  });
}

// Everything touching an oval centered on (x, y), `long` along the angle `a` and `wide` across.
function eachEnemyInOval(x, y, a, long, wide, fn) {
  const cx = Math.cos(a);
  const cy = Math.sin(a);
  eachEnemyNear(x, y, long, e => {
    const dx = e.x - x;
    const dy = e.y - y;
    const along = (dx * cx + dy * cy) / (long + e.r);
    const side = (dy * cx - dx * cy) / (wide + e.r);
    if (along * along + side * side < 1) fn(e);
  });
}

function nearestEnemies(x, y, range, n, skip) {
  const found = [];
  const limit = range * range;
  for (const e of enemies) {
    if (e.dead || (skip && skip.has(e))) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > limit) continue;
    found.push({ e, d2 });
  }
  found.sort((a, b) => a.d2 - b.d2);
  return found.slice(0, n).map(f => f.e);
}

// The toughest kind of enemy in range first, and of those the closest.
function toughestEnemies(x, y, range, n) {
  return nearestEnemies(x, y, range, MAX_ENEMIES).sort((a, b) => b.def.hp - a.def.hp).slice(0, n);
}
