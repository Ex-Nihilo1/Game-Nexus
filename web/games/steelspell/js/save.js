// Saving a run to finish it later. There is one slot. The build and the clock are kept; the
// horde, its shots and the orbs on the map are not, and the hero gets a few seconds of safety
// when the run goes on. Loading takes the save out of the slot and dying ends the run, so a
// run cannot be replayed from the same spot.

const SAVE_KEY = 'games.steelspell.save';
const SAVE_SAFETY = 3; // seconds the hero cannot be hurt after loading

let runVersionNow = BALANCE_VERSION; // the balance version the current run began in

// Only a run in progress can be saved.
function canSave() { return !simulating && (phase === 'playing' || phase === 'paused' || phase === 'choosing'); }

function snapshot() {
  const pending = phase === 'choosing' && choice ? [choice.kind, ...queue] : [...queue];
  return {
    version: runVersionNow, saved: new Date().toISOString().slice(0, 10),
    seed, startWeapon, active: activeDef.id, activeCd, rerolls, merges, elitesKilled, runId: Nexus.runId(),
    level, xp, xpNext, elapsed, kills, spawnBudget, nextElite, nextRing, wildOrbTimer, magnetTimer, walked,
    upgrades, gear, items: items.map(item => item.id), metaBonus, queue: pending,
    hero: { hp: hero.hp, lives: hero.lives, windAt: hero.windAt, hurtBy: hero.hurtBy },
    weapons: hero.weapons.map(w => ({
      id: w.def.id, level: w.level, evo: w.evo, parts: w.parts, charges: w.charges, dealt: w.dealt,
    })),
  };
}

function saveRun() {
  if (!canSave()) return;
  saveJson(SAVE_KEY, snapshot());
}

function loadSave() {
  const save = loadJson(SAVE_KEY);
  return save && save.weapons && save.weapons.length ? save : null;
}

function clearSave() {
  if (simulating) return;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* private mode etc. */ }
}

// Pause → Save & quit: back to the start screen, the run waits in the slot.
function saveAndQuit() {
  saveRun();
  phase = 'start';
  showStart();
}

// Weapons and items that are no longer in the tables are left out.
function continueRun() {
  const save = loadSave();
  if (!save) return;
  clearSave();
  metaBonus = save.metaBonus || {};
  resetWorld();
  seed = save.seed; startWeapon = save.startWeapon; activeCd = save.activeCd; rerolls = save.rerolls;
  merges = save.merges; elitesKilled = save.elitesKilled; level = save.level; xp = save.xp; xpNext = save.xpNext;
  elapsed = save.elapsed; kills = save.kills; spawnBudget = save.spawnBudget; nextElite = save.nextElite;
  nextRing = save.nextRing; wildOrbTimer = save.wildOrbTimer; magnetTimer = save.magnetTimer; walked = save.walked;
  runVersionNow = save.version || BALANCE_VERSION;
  Nexus.resumeRun('steelspell', save.runId); // the leaderboards count it under the token it began with
  activeDef = ACTIVES.find(a => a.id === save.active) || ACTIVES[0];
  for (const key of Object.keys(upgrades)) upgrades[key] = (save.upgrades || {})[key] || 0;
  gear = Object.assign({}, save.gear);
  items = (save.items || []).map(id => ITEMS.find(item => item.id === id)).filter(Boolean);
  for (const saved of save.weapons) {
    if (!WEAPON_DEFS.some(d => d.id === saved.id)) continue;
    const w = newWeapon(saved.id);
    if (!w.def.needs) w.level = Math.min(MAX_WEAPON_LEVEL, saved.level || 1);
    w.evo = (EVOLUTIONS[saved.id] || []).some(evo => evo.id === saved.evo) ? saved.evo : '';
    w.parts = saved.parts || [];
    rebuildWeapon(w);
    if (saved.charges !== undefined) w.charges = Math.min(saved.charges, maxCharges(w));
    w.dealt = saved.dealt || 0;
    hero.weapons.push(w);
  }
  refreshHero();
  hero.hp = Math.min(hero.maxHp, save.hero.hp);
  hero.lives = save.hero.lives;
  hero.windAt = save.hero.windAt || 0;
  hero.hurtBy = Object.assign(hero.hurtBy, save.hero.hurtBy);
  hero.iframes = SAVE_SAFETY;
  queue = (save.queue || []).filter(kind => typeof kind === 'string');
  setText(activeNameEl, activeDef.name);
  activeBtn.title = activeDef.blurb;
  lastCdShare = -1;
  activeBtn.hidden = false;
  pauseBtn.hidden = false;
  phase = 'playing';
  hideOverlay();
  say('Run continued');
  dirty = true;
  if (queue.length) nextChoice();
}
