// The HUD and the screens: start, cards, pause, end.

// ---- Rendering: the HUD, in screen pixels ----

function hudText(text, x, y, size, pen, align = 'left') {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = pal.paper;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = pal[pen];
  ctx.fillText(text, x, y);
}

function drawWeaponTiles(H) {
  // Tiles shrink when the kit would run into the active skill's button.
  const size = Math.max(20, Math.min(40, Math.floor((view.cssW - 114) / Math.max(1, hero.weapons.length)) - 6));
  let x = 10;
  const y = H - size - 10;
  for (const w of hero.weapons) {
    ctx.fillStyle = pal.paper;
    ctx.fillRect(x, y, size, size);
    const fullyCharged = w.charges !== undefined && w.charges >= maxCharges(w);
    if (w.cfg.cooldown && w.timer > 0 && !fullyCharged) {
      const share = Math.min(1, w.timer / w.full);
      ctx.fillStyle = pal.rule;
      ctx.fillRect(x, y + size * (1 - share), size, size * share);
    }
    ctx.strokeStyle = pal[KINDS[w.def.kind].pen];
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);
    hudText(tagOf(w.def), x + size / 2, y + size / 2 - (w.level && size >= 32 ? 4 : 0), Math.max(9, Math.round(size * 0.38)), 'ink', 'center');
    if (w.level && size >= 32) {
      const mark = w.evo ? t('hud.tileEvo') : w.level >= MAX_WEAPON_LEVEL ? t('hud.tileMax') : t('hud.tileLevel', { level: w.level });
      hudText(mark, x + size / 2, y + size - 8, 10, w.evo ? 'red-pencil' : 'ink-muted', 'center');
    }
    if (w.charges !== undefined) hudText(String(w.charges), x + size - 6, y + 8, 12, 'red-pencil', 'center');
    if (w.locked && w.cfg.earlyCost > 1) hudText(t('hud.earlyCost', { cost: w.cfg.earlyCost }), x + 9, y + 9, 12, 'red-pencil', 'center');
    x += size + 6;
  }
  // Items as small chips in their rarity's color; the pause screen has the names.
  // A long row wraps upward before it reaches the active skill's button.
  const chip = 11;
  x = 10;
  let chipY = y - chip - 7;
  for (const item of items) {
    if (x + chip > view.cssW - 104) {
      x = 10;
      chipY -= chip + 4;
    }
    ctx.fillStyle = pal[RARITIES[item.rarity].pen];
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1;
    ctx.fillRect(x, chipY, chip, chip);
    ctx.strokeRect(x, chipY, chip, chip);
    x += chip + 4;
  }
}

function drawHud() {
  const W = view.cssW;
  const H = view.cssH;
  ctx.fillStyle = pal.desk;
  ctx.fillRect(0, 0, W, 9);
  ctx.fillStyle = pal['green-ink'];
  ctx.fillRect(0, 0, W * Math.min(1, xp / xpNext), 9);

  hudText(t('hud.level', { level }), 10, 25, 17, 'ink');
  hudText(t('hud.health', { hp: Math.ceil(Math.max(0, hero.hp)), max: hero.maxHp }), 10, 44, 13, 'ink-muted');
  hudText(t('hud.rerolls', { rerolls }), 10, 60, 13, 'ink-muted');
  let line = 77;
  const timer = (name, seconds, pen) => {
    hudText(t('hud.timer', { name, seconds: Math.ceil(seconds) }), 10, line, 13, pen);
    line += 16;
  };
  if (hero.lives > 0) {
    hudText(t('hud.lives', { lives: hero.lives }), 10, line, 13, 'green-ink');
    line += 16;
  }
  if (berserkLeft > 0) timer(activeName(BERSERK), berserkLeft, 'red-pencil');
  if (hero.ghostLeft > 0) timer(activeName(activeDef), hero.ghostLeft, 'violet');
  if (gearValue('pocketMagnet')) timer(t('items.pocket.name'), pocketLeft, 'blue-pen');

  hudText(formatTime(elapsed), W / 2, 28, 22, 'ink', 'center');
  hudText(t('hud.kills', { kills }), W - 74, 30, 13, 'ink-muted', 'right');
  if (cheated) hudText(t('hud.dev'), W - 74, 48, 13, 'red-pencil', 'right');
  drawStageHud(W, H);
  if (toastLeft > 0) hudText(toast, W / 2, fight ? 100 : 70, 17, 'red-pencil', 'center');

  drawWeaponTiles(H);

  if (hero.hurtFlash > 0) {
    // Just hit: the edge of the screen goes red for a moment.
    ctx.globalAlpha = 0.4 * hero.hurtFlash / HURT_FLASH;
    ctx.strokeStyle = pal['red-pencil'];
    ctx.lineWidth = 26;
    ctx.strokeRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  if (stick.active) {
    ctx.strokeStyle = pal['ink-muted'];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(stick.ax, stick.ay, STICK_RADIUS, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(stick.ax + stick.x * STICK_RADIUS, stick.ay + stick.y * STICK_RADIUS, 14, 0, TAU);
    ctx.fillStyle = pal['ink-muted'];
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function updateActiveButton() {
  const ready = activeCd <= 0;
  setText(activeTimeEl, ready ? t('hud.ready') : t('hud.seconds', { seconds: Math.ceil(activeCd) }));
  const share = ready ? 0 : Math.round(activeCd / activeCooldown() * 100) / 100;
  if (share === lastCdShare) return;
  lastCdShare = share;
  activeBtn.style.setProperty('--cd', share);
  activeBtn.classList.toggle('ready', ready);
}

// ---- Screens ----

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showPanel(build) {
  panelEl.textContent = '';
  build(panelEl);
  overlayEl.hidden = false;
  overlayEl.scrollTop = 0;
  dirty = true;
}

function hideOverlay() {
  overlayEl.hidden = true;
  cardActions = [];
}

function showCards(title, note, cards) {
  cardActions = cards.map(c => c.pick);
  shownCards = cards;
  if (simulating) return;
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', title));
    p.appendChild(el('p', 'panel-note', note));
    const grid = el('div', cards.length === 1 ? 'cards single' : choice && choice.kind === 'arsenal' ? 'cards arsenal' : 'cards');
    cards.forEach((c, i) => {
      const b = el('button', `card ${c.kind}`);
      b.appendChild(el('span', `stamp ${c.kind}`, c.tag));
      b.appendChild(el('span', 'card-name', c.name));
      if (c.value) b.appendChild(el('span', 'card-value', c.value));
      b.appendChild(el('span', 'card-note', c.note));
      if (c.synergy) b.appendChild(el('span', 'card-synergy', c.synergy));
      if (c.own) b.appendChild(el('span', 'card-own', c.own));
      b.appendChild(el('kbd', '', String(i + 1)));
      b.addEventListener('click', () => chooseCard(i));
      grid.appendChild(b);
    });
    p.appendChild(grid);
    if (!choice || !(choice.reroll || choice.skip)) return;
    const actions = el('div', 'panel-actions');
    if (choice.reroll) {
      const again = el('button', '', t('cards.reroll', { rerolls }));
      again.disabled = rerolls <= 0;
      again.appendChild(el('kbd', '', 'R'));
      again.addEventListener('click', rerollChoice);
      actions.appendChild(again);
    }
    if (choice.skip) {
      const pass = el('button', '', t('cards.skip', { pct: Math.round(SKIP_HEAL * 100) }));
      pass.appendChild(el('kbd', '', 'X'));
      pass.addEventListener('click', skipChoice);
      actions.appendChild(pass);
    }
    p.appendChild(actions);
  });
}

// `name(item)` is what a button says.
function addPickRows(parent, rows, current, name, describe, onPick) {
  const detail = el('p', 'pick-detail', describe(current));
  const buttons = [];
  for (const row of rows) {
    const line = el('div', 'pick-row');
    line.appendChild(el('span', 'pick-label', row.label));
    const box = el('div', 'pick-items');
    for (const item of row.items) {
      const b = el('button', 'pick');
      b.appendChild(el('span', '', name(item)));
      if (row.note) b.appendChild(el('small', '', row.note(item)));
      b.setAttribute('aria-pressed', String(item === current));
      b.addEventListener('click', () => {
        buttons.forEach(o => o.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        detail.textContent = describe(item);
        onPick(item);
      });
      buttons.push(b);
      box.appendChild(b);
    }
    line.appendChild(box);
    parent.appendChild(line);
  }
  parent.appendChild(detail);
}

// The weapons a run can start with: all but the defensive ones.
function startersFor() { return WEAPONS.filter(d => !d.defense); }

// `keep` keeps the loadout picked on this screen instead of the last run's.
function showStart(keep = false) {
  phase = 'start';
  activeBtn.hidden = true;
  pauseBtn.hidden = true;
  if (!keep) {
    const last = loadJson(LAST_KEY) || {};
    loadout.active = ACTIVES.find(a => a.id === last.active) || ACTIVES[0];
    loadout.weapon = WEAPONS.find(d => d.id === last.weapon && !d.defense) || WEAPONS[0];
  }
  const starters = startersFor();
  if (!starters.includes(loadout.weapon)) loadout.weapon = starters[0];
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', t('start.title')));
    p.appendChild(el('p', 'panel-note', t('start.note', {
      levels: WEAPON_LEVELS.join(', '), max: MAX_WEAPON_LEVEL, altar: STAGE.altarAt / 60, length: STAGE.length / 60,
    })));

    p.appendChild(el('h3', 'section-title', t('start.active')));
    addPickRows(p, ACTIVE_GROUPS.map(group => ({
      label: t(`activeGroups.${group}`),
      items: ACTIVES.filter(a => a.group === group),
      note: activeNote,
    })), loadout.active, activeName, activeDescription, a => {
      const before = loadout.active;
      loadout.active = a;
      if (before.ownWeapon !== a.ownWeapon) showStart(true); // another weapon is marked
    });

    p.appendChild(el('h3', 'section-title', t('start.weapon')));
    addPickRows(p, ['magic', 'phys'].map(kind => ({
      label: kindName(kind),
      items: starters.filter(d => d.kind === kind),
      note: d => (d.id === loadout.active.ownWeapon ? t('start.ownWeapon', { active: activeName(loadout.active) }) : ''),
    })), loadout.weapon, nameOf, d => `${blurbOf(d)} ${usesText(d)}`, d => { loadout.weapon = d; });

    const actions = el('div', 'panel-actions');
    const save = loadSave();
    if (save) {
      const resume = el('button', 'primary', t('start.continue', { time: formatTime(save.elapsed), level: save.level }));
      resume.addEventListener('click', continueRun);
      actions.appendChild(resume);
    }
    const go = el('button', save ? '' : 'primary', t('start.go'));
    go.addEventListener('click', beginFromMenu);
    const camp = el('button', '', t('start.camp', { glory: loadMeta().glory }));
    camp.addEventListener('click', showCamp);
    const records = el('button', '', t('start.records'));
    records.addEventListener('click', () => showRecords());
    const codex = el('button', '', t('ui.codex'));
    codex.addEventListener('click', () => showCodex('weapons', 'start'));
    const setup = el('button', '', t('ui.settings'));
    setup.addEventListener('click', () => showSettings('start'));
    actions.append(go, camp, records, codex, setup);
    p.appendChild(actions);
    if (save) p.appendChild(el('p', 'panel-note', t('start.saved')));

    const hints = el('p', 'hints');
    const lines = textList('start.hints', { chestSlots: CHEST_SLOTS });
    if (devMode()) lines.push(t('dev.keys'));
    lines.forEach((line, i) => {
      if (i) hints.appendChild(el('br'));
      addHint(hints, line);
    });
    p.appendChild(hints);
  });
}

function activeDescription(a) {
  const passive = activePassive(a);
  return activeBlurb(a) + (passive ? ` ${t('start.passive', { text: passive })}` : '');
}

// A line of the hints, where [Space] is a key on the keyboard.
function addHint(box, line) {
  line.split(/\[([^\]]+)\]/).forEach((part, i) => {
    if (i % 2) box.appendChild(el('kbd', '', part));
    else if (part) box.appendChild(el('span', '', part));
  });
}

// The Settings screen, from the start screen or the pause menu (`from`).
function showSettings(from) {
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', t('settings.title')));
    const row = el('label', 'setting');
    row.appendChild(el('span', 'setting-name', t('settings.attackAlpha')));
    const slider = el('input', 'setting-range');
    slider.type = 'range';
    slider.min = '10';
    slider.max = '100';
    slider.step = '10';
    slider.value = String(Math.round(settings.attackAlpha * 100));
    const shown = el('span', 'setting-value', `${slider.value}%`);
    slider.addEventListener('input', () => {
      settings.attackAlpha = Number(slider.value) / 100;
      shown.textContent = `${slider.value}%`;
      saveSettings();
      dirty = true;
    });
    row.append(slider, shown);
    p.appendChild(row);
    p.appendChild(el('p', 'panel-note', t('settings.attackAlphaNote')));
    addDevSettings(p, from);
    if (LANGUAGES.length > 1) {
      const lang = el('label', 'setting');
      lang.append(el('span', 'setting-name', t('settings.language')), languagePicker(() => showSettings(from)));
      p.appendChild(lang);
    }
    const actions = el('div', 'panel-actions');
    const back = el('button', 'primary', t('ui.back'));
    back.addEventListener('click', () => (from === 'pause' ? showPause() : showStart(true)));
    actions.appendChild(back);
    p.appendChild(actions);
  });
}

// Developer mode, behind its password (see js/dev.js).
function addDevSettings(p, from) {
  p.appendChild(el('h3', 'section-title', t('settings.dev')));
  if (!settings.devUnlocked) {
    const line = el('div', 'setting');
    const field = el('input', 'dev-password');
    field.type = 'password';
    field.autocomplete = 'off';
    field.setAttribute('aria-label', t('settings.devPassword'));
    field.placeholder = t('settings.devPassword');
    const unlock = el('button', '', t('settings.devUnlock'));
    const said = el('span', 'setting-name', '');
    const tryIt = () => {
      if (!devPasswordOk(field.value)) {
        said.textContent = t('settings.devWrong');
        return;
      }
      settings.devUnlocked = true;
      saveSettings();
      showSettings(from);
    };
    unlock.addEventListener('click', tryIt);
    field.addEventListener('keydown', e => {
      e.stopPropagation(); // the letters are typed, not walked or pressed as shortcuts
      if (e.key === 'Enter') tryIt();
    });
    line.append(field, unlock, said);
    p.appendChild(line);
    return;
  }
  const line = el('label', 'setting');
  const box = el('input', '');
  box.type = 'checkbox';
  box.checked = !!settings.dev;
  box.addEventListener('change', () => {
    settings.dev = box.checked;
    saveSettings();
  });
  line.append(box, el('span', 'setting-name', t('settings.devMode')));
  p.appendChild(line);
  p.appendChild(el('p', 'panel-note', t('settings.devNote')));
}

// The language: the texts load again, and the screen with them (`after`).
function languagePicker(after) {
  const pick = el('select', 'lang-pick');
  pick.setAttribute('aria-label', t('settings.language'));
  for (const lang of LANGUAGES) {
    const option = el('option', '', lang.name);
    option.value = lang.id;
    option.selected = lang.id === langId;
    pick.appendChild(option);
  }
  pick.addEventListener('change', () => setLanguage(pick.value).then(() => {
    applyPageTexts();
    showBest();
    after();
  }));
  return pick;
}

// The few words of the page outside the canvas and the panels.
function applyPageTexts() {
  document.title = t('game.title');
  setText(document.getElementById('title'), t('game.title'));
  setText(pauseBtn, t('ui.pause'));
}

function beginFromMenu() {
  clearSave();
  startRun(loadout.active.id, loadout.weapon.id);
}

function addFigure(parent, label, value) {
  const box = el('div');
  box.appendChild(el('span', 'label', label));
  box.appendChild(el('span', 'figure', value));
  parent.appendChild(box);
}

function addRow(parent, label, value) {
  const row = el('div', 'row');
  row.appendChild(el('span', '', label));
  row.appendChild(el('span', '', value));
  parent.appendChild(row);
}

function weaponTitle(w) {
  if (w.evo) return t('report.evolved', { name: weaponName(w), base: nameOf(w.def) });
  return w.level ? t('report.level', { name: nameOf(w.def), level: w.level }) : nameOf(w.def);
}

// How many shots a weapon fires, and where they come from.
function shotsText(w) {
  const reads = w.cfg.scales.includes('count');
  const parts = [];
  if (reads && upgrades.count) parts.push(t('report.fromCards', { n: upgrades.count }));
  if (reads && extraBonus('count')) parts.push(t('report.fromItems', { n: extraBonus('count') }));
  if (w.bonus.count) parts.push(t('report.fromWeapon', { n: w.bonus.count }));
  if (reads && berserkLeft > 0 && BERSERK.buff.count) parts.push(t('report.fromActive', { name: activeName(BERSERK), n: BERSERK.buff.count }));
  if (!parts.length) return '';
  if (w.cfg.single) return t('report.single', { pct: Math.round(weaponCount(w) * COUNT.overflow * 100), parts: parts.join(', ') });
  return t('report.shots', { shots: shotCount(w), parts: parts.join(', ') });
}

function addKitReport(p) {
  p.appendChild(el('h3', 'section-title', t('report.dealt')));
  const box = el('div', 'report');
  [...hero.weapons].sort((a, b) => b.dealt - a.dealt).forEach(w => {
    addRow(box, t('report.weaponRow', { weapon: weaponTitle(w), kind: kindName(w.def.kind), shots: shotsText(w) }), formatNumber(Math.round(w.dealt)));
  });
  p.appendChild(box);
}

// What hurt the hero over the run, by the way it came.
function addHurtReport(p) {
  const by = hero.hurtBy;
  if (by.touch + by.shot + by.strike < 1) return;
  p.appendChild(el('h3', 'section-title', t('report.taken')));
  const box = el('div', 'report');
  addRow(box, t('report.touches'), formatNumber(Math.round(by.touch)));
  addRow(box, t('report.shotsTaken'), formatNumber(Math.round(by.shot)));
  addRow(box, t('report.strikes'), formatNumber(Math.round(by.strike)));
  p.appendChild(box);
}

function addItemReport(p) {
  if (!items.length) return;
  p.appendChild(el('h3', 'section-title', t('report.items')));
  const box = el('div', 'item-list');
  for (const item of items) {
    const row = el('div', 'item-row');
    row.appendChild(el('span', `item-name ${item.rarity}`, itemName(item)));
    row.appendChild(el('span', 'item-text', itemText(item)));
    box.appendChild(row);
  }
  p.appendChild(box);
}

// Each stat shows its strong and weak picks, and what items and the Camp add on top.
function addStatReport(p) {
  p.appendChild(el('h3', 'section-title', t('report.stats')));
  const box = el('div', 'report');
  const arms = el('div');
  arms.appendChild(el('span', 'stamp hero', t('cards.forWeapons')));
  const self = el('div');
  self.appendChild(el('span', 'stamp hero', kindName('hero')));
  const share = value => `${formatNumber(Math.round(value * 100))}%`;
  addRow(self, t('report.health'), formatNumber(hero.maxHp));
  if (levelHealth()) addRow(self, t('report.fromLevels'), t('report.levelHp', { hp: levelHealth() }));
  if (gearValue('regen')) addRow(self, t('report.regen'), t('report.regenValue', { pct: Math.round(gearValue('regen') * 100) }));
  addRow(arms, t('report.baseAttack'), formatNumber(Math.round(hero.baseAttack)));
  const passive = activePassive(activeDef);
  if (passive) addRow(self, t('report.passive', { name: activeName(activeDef) }), passive);
  for (const [key, label] of [['armorPen', 'armorPierced'], ['magicPen', 'wardPierced'], ['armorPenPct', 'armorPierced'], ['magicPenPct', 'wardPierced']]) {
    if (gearValue(key)) addRow(arms, t(`report.${label}`), key.endsWith('Pct') ? share(gearValue(key)) : formatNumber(gearValue(key)));
  }
  for (const key of Object.keys(STATS)) {
    const picks = upgrades[key];
    const parts = [];
    if (picks) {
      const strong = Math.min(picks, STRONG_PICKS);
      if (key === 'count') parts.push(t('report.picked', { n: picks }));
      else if (picks > strong) parts.push(t('report.strongWeak', { strong, max: STRONG_PICKS, weak: picks - strong }));
      else parts.push(t('report.strong', { strong, max: STRONG_PICKS }));
    }
    if (extraBonus(key)) parts.push(t('report.fromGear', { bonus: bonusText(key, extraBonus(key)) }));
    const text = formatStat(key, stat(key)) + (parts.length ? ` (${parts.join(', ')})` : '');
    addRow(STATS[key].hero ? self : arms, statName(key), text);
  }
  if (heroArmor()) addRow(self, t('report.hitsHurt'), t('report.hitsHurtValue', { pct: Math.round(armorCut() * 100) }));
  addRow(self, t('report.pickup'), formatNumber(Math.round(magnetRadius())));
  if (gearValue('attackPerLevel')) addRow(arms, t('report.fromLevels'), t('report.levelDamage', { pct: Math.round(gearValue('attackPerLevel') * level * 100) }));
  if (gearValue('physDamage')) addRow(arms, t('report.physDamage'), `+${share(gearValue('physDamage'))}`);
  if (gearValue('magicDamage')) addRow(arms, t('report.magicDamage'), `+${share(gearValue('magicDamage'))}`);
  if (gearValue('pureShare')) addRow(arms, t('report.pure'), share(gearValue('pureShare')));
  if (gearValue('abilityHaste')) {
    addRow(self, t('report.abilityHaste'), t('report.abilityHasteValue', { haste: gearValue('abilityHaste'), cut: Math.round(abilityHasteCut() * 100) }));
  }
  if (hero.lives) addRow(self, t('report.lives'), formatNumber(hero.lives));
  box.append(arms, self);
  p.appendChild(box);
}

function showPause() {
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', t('pause.title')));
    addStatReport(p);
    addItemReport(p);
    addKitReport(p);
    const actions = el('div', 'panel-actions');
    const resume = el('button', 'primary', t('pause.resume'));
    resume.addEventListener('click', togglePause);
    const codex = el('button', '', t('ui.codex'));
    codex.addEventListener('click', () => showCodex('weapons', 'pause'));
    const setup = el('button', '', t('ui.settings'));
    setup.addEventListener('click', () => showSettings('pause'));
    const keep = el('button', '', t('pause.save'));
    keep.addEventListener('click', saveAndQuit);
    const quit = el('button', '', t('pause.end'));
    quit.addEventListener('click', endRun);
    actions.append(resume, codex, setup, keep, quit);
    if (devMode()) {
      const dev = el('button', '', t('pause.dev'));
      dev.addEventListener('click', showDevPanel);
      actions.appendChild(dev);
    }
    p.appendChild(actions);
  });
}

function togglePause() {
  if (phase === 'playing') {
    phase = 'paused';
    showPause();
  } else if (phase === 'paused') {
    phase = 'playing';
    hideOverlay();
    dirty = true;
    if (queue.length) nextChoice(); // levels the developer panel gave
  }
}

// `result` is what recordRun() made of the run: its place among the records and its Glory.
function showEnd(result) {
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', hero.hp > 0 ? t('end.title') : t('end.died')));
    const notes = [];
    if (result.place === 1) notes.push(t('end.best'));
    else if (result.place) notes.push(t('end.place', { place: result.place }));
    if (result.bestWith && result.place !== 1) notes.push(t('end.bestWith', { weapon: nameOf(WEAPONS.find(d => d.id === startWeapon)) }));
    if (clearTime) notes.push(t('end.clear', { time: formatTime(clearTime) }) + (result.bestClear ? ` ${t('end.bestClear')}` : ''));
    if (result.cheated) notes.push(t('end.cheated'));
    else notes.push(t('end.glory', { glory: result.glory }));
    p.appendChild(el('p', 'panel-note', notes.join(' ')));
    const figures = el('div', 'figures');
    addFigure(figures, t('end.time'), formatTime(elapsed));
    addFigure(figures, t('end.level'), formatNumber(level));
    addFigure(figures, t('end.kills'), formatNumber(kills));
    p.appendChild(figures);
    addKitReport(p);
    addHurtReport(p);
    addItemReport(p);
    addStatReport(p);
    const actions = el('div', 'panel-actions');
    const again = el('button', 'primary', t('end.again'));
    again.addEventListener('click', showStart);
    const camp = el('button', '', t('ui.camp'));
    camp.addEventListener('click', showCamp);
    actions.append(again, camp);
    p.appendChild(actions);
  });
}
