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
    hudText(w.def.tag, x + size / 2, y + size / 2 - (w.level && size >= 32 ? 4 : 0), Math.max(9, Math.round(size * 0.38)), 'ink', 'center');
    if (w.level && size >= 32) hudText(w.evo ? 'EVO' : w.level >= MAX_WEAPON_LEVEL ? 'MAX' : `Lv ${w.level}`, x + size / 2, y + size - 8, 10, w.evo ? 'red-pencil' : 'ink-muted', 'center');
    if (w.charges !== undefined) hudText(String(w.charges), x + size - 6, y + 8, 12, 'red-pencil', 'center');
    if (w.locked && w.cfg.earlyCost > 1) hudText('x2', x + 9, y + 9, 12, 'red-pencil', 'center');
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

  hudText(`Level ${level}`, 10, 25, 17, 'ink');
  hudText(`Health ${Math.ceil(Math.max(0, hero.hp))} / ${hero.maxHp}`, 10, 44, 13, 'ink-muted');
  hudText(`Rerolls ${rerolls}`, 10, 60, 13, 'ink-muted');
  let line = 77;
  if (hero.lives > 0) {
    hudText(`Spare lives ${hero.lives}`, 10, line, 13, 'green-ink');
    line += 16;
  }
  if (berserkLeft > 0) {
    hudText(`Berserk ${Math.ceil(berserkLeft)}s`, 10, line, 13, 'red-pencil');
    line += 16;
  }
  if (hero.ghostLeft > 0) hudText(`Ghost ${Math.ceil(hero.ghostLeft)}s`, 10, line, 13, 'violet');

  hudText(formatTime(elapsed), W / 2, 28, 22, 'ink', 'center');
  hudText(`Kills ${kills}`, W - 74, 30, 13, 'ink-muted', 'right');
  if (toastLeft > 0) hudText(toast, W / 2, 54, 17, 'red-pencil', 'center');

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
  setText(activeTimeEl, ready ? 'Ready' : `${Math.ceil(activeCd)}s`);
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
    const grid = el('div', cards.length === 1 ? 'cards single' : 'cards');
    cards.forEach((c, i) => {
      const b = el('button', `card ${c.kind}`);
      b.appendChild(el('span', `stamp ${c.kind}`, c.tag));
      b.appendChild(el('span', 'card-name', c.name));
      if (c.value) b.appendChild(el('span', 'card-value', c.value));
      b.appendChild(el('span', 'card-note', c.note));
      if (c.synergy) b.appendChild(el('span', 'card-synergy', c.synergy));
      b.appendChild(el('kbd', '', String(i + 1)));
      b.addEventListener('click', () => chooseCard(i));
      grid.appendChild(b);
    });
    p.appendChild(grid);
    if (!choice || !(choice.reroll || choice.skip)) return;
    const actions = el('div', 'panel-actions');
    if (choice.reroll) {
      const again = el('button', '', `Reroll (${rerolls})`);
      again.disabled = rerolls <= 0;
      again.appendChild(el('kbd', '', 'R'));
      again.addEventListener('click', rerollChoice);
      actions.appendChild(again);
    }
    if (choice.skip) {
      const pass = el('button', '', `Skip: heal ${Math.round(SKIP_HEAL * 100)}%`);
      pass.appendChild(el('kbd', '', 'X'));
      pass.addEventListener('click', skipChoice);
      actions.appendChild(pass);
    }
    p.appendChild(actions);
  });
}

function addPickRows(parent, rows, current, describe, onPick) {
  const detail = el('p', 'pick-detail', describe(current));
  const buttons = [];
  for (const row of rows) {
    const line = el('div', 'pick-row');
    line.appendChild(el('span', 'pick-label', row.label));
    const box = el('div', 'pick-items');
    for (const item of row.items) {
      const b = el('button', 'pick');
      b.appendChild(el('span', '', item.name));
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

function showStart() {
  phase = 'start';
  activeBtn.hidden = true;
  pauseBtn.hidden = true;
  const last = loadJson(LAST_KEY) || {};
  loadout.active = ACTIVES.find(a => a.id === last.active) || ACTIVES[0];
  loadout.weapon = WEAPONS.find(d => d.id === last.weapon && !d.defense) || WEAPONS[0];
  const starters = WEAPONS.filter(d => !d.defense);
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', 'Choose your loadout'));
    p.appendChild(el('p', 'panel-note',
      `The horde never stops growing: last as long as you can. New weapons come at levels ${WEAPON_LEVELS.join(', ')}. A weapon grows to level ${MAX_WEAPON_LEVEL} through level-up cards, then evolves one of two ways, and two evolved weapons of a pair can merge into a stronger one.`));

    p.appendChild(el('h3', 'section-title', 'Active skill'));
    addPickRows(p, ACTIVE_GROUPS.map(group => ({
      label: group,
      items: ACTIVES.filter(a => a.group === group),
      note: a => `${a.cooldown} s`,
    })), loadout.active, a => a.blurb, a => { loadout.active = a; });

    p.appendChild(el('h3', 'section-title', 'First weapon'));
    addPickRows(p, ['magic', 'phys'].map(kind => ({
      label: KINDS[kind].name,
      items: starters.filter(d => d.kind === kind),
    })), loadout.weapon, d => `${d.blurb} Uses: ${d.scales.map(k => STATS[k].name).join(', ')}.`, d => { loadout.weapon = d; });

    const actions = el('div', 'panel-actions');
    const go = el('button', 'primary', 'Start run');
    go.addEventListener('click', beginFromMenu);
    const camp = el('button', '', `Camp · ${loadMeta().glory} Glory`);
    camp.addEventListener('click', showCamp);
    const records = el('button', '', 'Records');
    records.addEventListener('click', showRecords);
    actions.append(go, camp, records);
    p.appendChild(actions);

    const hints = el('p', 'hints');
    hints.innerHTML =
      '<kbd>WASD</kbd> or arrows, or drag on the field, to walk &middot; <kbd>Space</kbd> active skill &middot; ' +
      '<kbd>1</kbd>&ndash;<kbd>4</kbd> pick a card &middot; <kbd>R</kbd> reroll the cards &middot; <kbd>X</kbd> skip a level-up &middot; <kbd>P</kbd> pause<br>' +
      'An orange outline is armor that blunts physical damage, a violet outline is a ward that blunts magic. Pure damage ignores both.<br>' +
      'Enemies with a dot in the middle fight from a distance. A red dashed outline on the ground is a strike about to land: step out of it.<br>' +
      'Red orbs heal. Walking turns them up, and elites drop them along with a chest: pick 1 item of 3. A blue chest is better than a grey one, a yellow one better still.<br>' +
      'A blue horseshoe is a magnet: it pulls in every XP orb on the map.' +
      (DEV ? '<br>Dev keys: <kbd>L</kbd> level up &middot; <kbd>G</kbd> weapon pick &middot; <kbd>I</kbd> open a chest &middot; <kbd>K</kbd> die and revive &middot; <kbd>R</kbd> reset active &middot; <kbd>T</kbd> skip a minute &middot; <kbd>E</kbd> elite &middot; <kbd>F</kbd> shooters &middot; <kbd>O</kbd> fill the horde &middot; <kbd>H</kbd> immortal &middot; <kbd>M</kbd> max a weapon' : '');
    p.appendChild(hints);
  });
}

function beginFromMenu() {
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
  if (w.evo) return `${weaponName(w)}, was ${w.def.name}`;
  return w.def.name + (w.level ? ` Lv ${w.level}` : '');
}

function addKitReport(p) {
  p.appendChild(el('h3', 'section-title', 'Damage dealt'));
  const box = el('div', 'report');
  [...hero.weapons].sort((a, b) => b.dealt - a.dealt).forEach(w => {
    addRow(box, `${weaponTitle(w)} (${KINDS[w.def.kind].name})`, Math.round(w.dealt).toLocaleString('en-US'));
  });
  p.appendChild(box);
}

// What hurt the hero over the run, by the way it came.
function addHurtReport(p) {
  const by = hero.hurtBy;
  if (by.touch + by.shot + by.strike < 1) return;
  p.appendChild(el('h3', 'section-title', 'Damage taken'));
  const box = el('div', 'report');
  addRow(box, 'Touches', Math.round(by.touch).toLocaleString('en-US'));
  addRow(box, 'Shots', Math.round(by.shot).toLocaleString('en-US'));
  addRow(box, 'Strikes on the ground', Math.round(by.strike).toLocaleString('en-US'));
  p.appendChild(box);
}

function addItemReport(p) {
  if (!items.length) return;
  p.appendChild(el('h3', 'section-title', 'Items'));
  const box = el('div', 'item-list');
  for (const item of items) {
    const row = el('div', 'item-row');
    row.appendChild(el('span', `item-name ${item.rarity}`, item.name));
    row.appendChild(el('span', 'item-text', item.text));
    box.appendChild(row);
  }
  p.appendChild(box);
}

// Each stat shows its strong and weak picks, and what items and the Camp add on top.
function addStatReport(p) {
  p.appendChild(el('h3', 'section-title', 'Stats'));
  const box = el('div', 'report');
  const arms = el('div');
  arms.appendChild(el('span', 'stamp hero', 'Weapons'));
  const self = el('div');
  self.appendChild(el('span', 'stamp hero', KINDS.hero.name));
  addRow(self, 'Health', String(hero.maxHp));
  if (levelHealth()) addRow(self, 'From levels', `+${levelHealth()} HP`);
  if (gearValue('regen')) addRow(self, 'Health regen', `${Math.round(gearValue('regen') * 100)}% per s`);
  addRow(arms, 'Base attack', String(Math.round(hero.baseAttack)));
  for (const key of Object.keys(STATS)) {
    const def = STATS[key];
    const picks = upgrades[key];
    const parts = [];
    if (picks) {
      const strong = Math.min(picks, STRONG_PICKS);
      parts.push(key === 'count' ? `${picks} picked` : `${strong}/${STRONG_PICKS} strong${picks > strong ? ` + ${picks - strong} weak` : ''}`);
    }
    if (extraBonus(key)) parts.push(`${bonusText(key, extraBonus(key))} from items and Camp`);
    const text = formatStat(key, stat(key)) + (parts.length ? ` (${parts.join(', ')})` : '');
    addRow(def.note ? self : arms, def.name, text);
  }
  if (heroArmor()) addRow(self, 'Hits hurt', `${Math.round(armorCut() * 100)}% less`);
  addRow(self, 'Pickup radius', String(Math.round(magnetRadius())));
  if (gearValue('attackPerLevel')) addRow(arms, 'From levels', `+${Math.round(gearValue('attackPerLevel') * level * 100)}% damage`);
  if (gearValue('physDamage')) addRow(arms, 'All physical damage', `+${Math.round(gearValue('physDamage') * 100)}%`);
  if (gearValue('magicDamage')) addRow(arms, 'All magic damage', `+${Math.round(gearValue('magicDamage') * 100)}%`);
  if (gearValue('pureShare')) addRow(arms, 'Damage made pure', `${Math.round(gearValue('pureShare') * 100)}%`);
  if (gearValue('activeCooldown')) addRow(self, 'Active cooldown', `-${Math.round(gearValue('activeCooldown') * 100)}%`);
  if (hero.lives) addRow(self, 'Spare lives', String(hero.lives));
  box.append(arms, self);
  p.appendChild(box);
}

function showPause() {
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', 'Paused'));
    addStatReport(p);
    addItemReport(p);
    addKitReport(p);
    const actions = el('div', 'panel-actions');
    const resume = el('button', 'primary', 'Resume');
    resume.addEventListener('click', togglePause);
    const quit = el('button', '', 'End run');
    quit.addEventListener('click', endRun);
    actions.append(resume, quit);
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
  }
}

// `result` is what recordRun() made of the run: its place among the records and its Glory.
function showEnd(result) {
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', hero.hp > 0 ? 'Run ended' : 'The horde got you'));
    const notes = [];
    if (result.place === 1) notes.push('A new best time.');
    else if (result.place) notes.push(`#${result.place} of your runs.`);
    if (result.bestWith && result.place !== 1) notes.push(`Your best with ${WEAPONS.find(d => d.id === startWeapon).name}.`);
    notes.push(`+${result.glory} Glory for the Camp.`);
    p.appendChild(el('p', 'panel-note', notes.join(' ')));
    const figures = el('div', 'figures');
    addFigure(figures, 'Time', formatTime(elapsed));
    addFigure(figures, 'Level', String(level));
    addFigure(figures, 'Kills', kills.toLocaleString('en-US'));
    p.appendChild(figures);
    addKitReport(p);
    addHurtReport(p);
    addItemReport(p);
    addStatReport(p);
    const actions = el('div', 'panel-actions');
    const again = el('button', 'primary', 'New run');
    again.addEventListener('click', showStart);
    const camp = el('button', '', 'Camp');
    camp.addEventListener('click', showCamp);
    actions.append(again, camp);
    p.appendChild(actions);
  });
}
