// Steel & Spell: a horde-survival demo in vanilla JS + canvas, no dependencies.
// Walk, collect orbs, level up. Weapons fire on their own; the one button is the
// active skill picked before the run. Weapons are physical or magic, upgrades are
// split the same way, and armored enemies blunt one of the two damage types. Pure
// damage ignores armor altogether. Two matching weapons merge into a stronger one,
// and chests hold unique items. A run never ends by itself: the horde keeps growing
// until it wins, and the time you lasted is your score.
//
// All tuning lives in the tables below, so numbers can change (or move to another
// engine) without touching the logic. Times are in seconds, distances in world units.
//
// Open with ?dev in the URL for test keys: L level up, G weapon pick, I open a chest,
// K die (with a spare life, to see the revive), R reset the active skill, T skip a minute,
// E call an elite, O fill the horde, H immortality, M max out a weapon. js/sim.js has them and the simulator.

function update(dt) {
  elapsed += dt;
  frame++;
  moveHero(dt);
  spawnEnemies(dt);
  moveEnemies(dt);
  rebuildGrid();
  collideHero();
  updateWeapons(dt);
  updateTimers(dt);
  updateShots(dt);
  updateZones(dt);
  updateBurns(dt);
  updateOrbs(dt);
  updateRedOrbs(dt);
  updateChests();
  if (hero.hp <= 0 && hero.lives > 0) revive();
  sweep(enemies);
  if (activeCd > 0) activeCd = Math.max(0, activeCd - dt);
  if (berserkLeft > 0) berserkLeft = Math.max(0, berserkLeft - dt);
  if (toastLeft > 0) toastLeft -= dt;
  updateFx(dt);
  dirty = true;
  if (hero.hp <= 0) endRun();
}

// ---- Game loop ----

function loop(time = 0) {
  const dt = Math.min(0.05, (time - lastTime) / 1000);
  lastTime = time;
  if (phase === 'playing') update(dt);
  if (dirty) draw();
  requestAnimationFrame(loop);
}

// ---- Input ----

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

document.addEventListener('keydown', e => {
  // Keyboard users pressing a focused button get the button, not the shortcut.
  if (e.target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (MOVE_KEYS.has(e.code)) {
    keys.add(e.code);
    e.preventDefault();
    return;
  }
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit) {
    if (!e.repeat) chooseCard(Number(digit[1]) - 1);
    return;
  }
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      useActive();
      break;
    case 'Enter':
      if (phase === 'start') beginFromMenu();
      else if (phase === 'over') showStart();
      break;
    case 'KeyP':
    case 'Escape':
      togglePause();
      break;
    default:
      if (phase === 'choosing' && e.code === 'KeyR') rerollChoice();
      else if (phase === 'choosing' && e.code === 'KeyX') skipChoice();
      else if (DEV && phase === 'playing') devKey(e.code);
  }
});
document.addEventListener('keyup', e => keys.delete(e.code));

// Dragging anywhere on the field is a floating joystick, for touch screens and the mouse.
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  stick.active = true;
  stick.id = e.pointerId;
  stick.ax = e.offsetX;
  stick.ay = e.offsetY;
  stick.x = 0;
  stick.y = 0;
});
canvas.addEventListener('pointermove', e => {
  if (!stick.active || e.pointerId !== stick.id) return;
  const dx = e.offsetX - stick.ax;
  const dy = e.offsetY - stick.ay;
  const d = Math.hypot(dx, dy);
  const amount = d < 6 ? 0 : Math.min(1, d / STICK_RADIUS);
  stick.x = d ? dx / d * amount : 0;
  stick.y = d ? dy / d * amount : 0;
});
function releaseStick(e) {
  if (e.pointerId !== stick.id) return;
  stick.active = false;
  dirty = true;
}
canvas.addEventListener('pointerup', releaseStick);
canvas.addEventListener('pointercancel', releaseStick);
canvas.addEventListener('contextmenu', e => e.preventDefault());

activeBtn.addEventListener('click', () => {
  useActive();
  activeBtn.blur();
});
pauseBtn.addEventListener('click', () => {
  togglePause();
  pauseBtn.blur();
});

// A game that keeps running behind another window is a lost run.
function pauseIfPlaying() {
  keys.clear();
  stick.active = false;
  if (phase === 'playing') togglePause();
}
window.addEventListener('blur', pauseIfPlaying);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseIfPlaying(); });

window.addEventListener('resize', resize);
document.addEventListener('themechange', readTheme);

readTheme();
resize();
resetWorld();
showBest();
showStart();
requestAnimationFrame(loop);
