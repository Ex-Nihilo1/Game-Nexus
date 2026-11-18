// The Codex: every weapon, merge, item and stat, open from the start. Weapons and merges are
// tiles; a tile opens a window with everything about it. All of it is read from the tables in
// js/data and the texts in lang/en.json, so whatever is added there shows up here by itself.

const CODEX_TABS = ['weapons', 'merges', 'items', 'stats'];

let codexBack = null; // where Back (and Escape) goes: the start screen or the pause
let codexWindow = null; // the open window, if any

// ---- Windows ----

function closeCodexWindow() {
  if (!codexWindow) return false;
  const back = codexWindow.opener;
  codexWindow.remove();
  codexWindow = null;
  if (back && document.body.contains(back)) back.focus();
  return true;
}

// `build(box)` fills the window. Escape, the Close button and a click beside it close it.
function openCodexWindow(title, build) {
  const opener = document.activeElement;
  closeCodexWindow();
  const shade = el('div', 'codex-modal');
  const box = el('div', 'codex-dialog');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', title);
  const head = el('div', 'codex-dialog-head');
  head.appendChild(el('h3', 'codex-dialog-title', title));
  const close = el('button', '', t('ui.close'));
  close.addEventListener('click', closeCodexWindow);
  head.appendChild(close);
  box.appendChild(head);
  build(box);
  shade.appendChild(box);
  shade.addEventListener('click', e => { if (e.target === shade) closeCodexWindow(); });
  document.body.appendChild(shade);
  codexWindow = shade;
  codexWindow.opener = opener;
  close.focus();
}

function windowLines(box, lines) {
  for (const line of lines) {
    if (!line) continue;
    if (Array.isArray(line)) {
      const list = el('ul', 'codex-list');
      line.forEach(text => list.appendChild(el('li', '', text)));
      box.appendChild(list);
    } else {
      box.appendChild(el('p', 'codex-text', line));
    }
  }
}

function defOf(id) { return WEAPON_DEFS.find(d => d.id === id); }

function mergesOf(id) { return SYNERGIES.filter(s => s.needs.includes(id)); }

// A weapon or a merge as a tile. Pressing it opens its window. `evo` is the evolution a merge
// asks of this weapon, if it asks for one.
function codexTile(def, owned, evo = '') {
  const tile = el('button', `codex-tile ${def.kind}`);
  tile.appendChild(el('span', 'codex-tag', tagOf(def)));
  tile.appendChild(el('span', 'codex-tile-name', nameOf(def)));
  if (evo) tile.appendChild(el('span', 'codex-evo', evo));
  if (owned) tile.appendChild(el('span', 'codex-mine', t('codex.yours')));
  tile.setAttribute('aria-label', t(owned ? 'codex.tileMine' : 'codex.tile', { name: nameOf(def), kind: kindName(def.kind) }));
  tile.addEventListener('click', () => (def.needs ? showMergeWindow(def) : showWeaponWindow(def)));
  return tile;
}

function mergeButtons(box, list) {
  const row = el('div', 'codex-recipes');
  for (const m of list) row.appendChild(recipeRow(m));
  box.appendChild(row);
}

function showWeaponWindow(d) {
  openCodexWindow(nameOf(d), box => {
    box.appendChild(el('span', `stamp ${d.kind}`, d.defense ? t('codex.defensive', { kind: kindName(d.kind) }) : kindName(d.kind)));
    const levels = [];
    for (let lv = 2; lv <= MAX_WEAPON_LEVEL; lv++) levels.push(t('codex.levelLine', { level: lv, text: levelText(d, lv) }));
    const bringer = ACTIVES.find(a => a.freeWeapon === d.id);
    windowLines(box, [blurbOf(d), usesText(d), bringer ? t('codex.freeWith', { active: activeName(bringer) }) : '']);
    box.appendChild(el('h4', 'codex-sub', t('codex.levels')));
    windowLines(box, [levels]);
    box.appendChild(el('h4', 'codex-sub', t('codex.evolutions', { max: MAX_WEAPON_LEVEL })));
    windowLines(box, [(EVOLUTIONS[d.id] || []).map(evo => t('codex.evoLine', { name: evoName(evo), text: evoBlurb(d, evo) }))]);
    const merges = mergesOf(d.id);
    box.appendChild(el('h4', 'codex-sub', t('codex.merges')));
    if (!merges.length) windowLines(box, [t('codex.noMerges')]);
    else {
      windowLines(box, [t('codex.mergeRule', { max: MAX_WEAPON_LEVEL })]);
      mergeButtons(box, merges);
    }
  });
}

function showMergeWindow(m) {
  openCodexWindow(nameOf(m), box => {
    box.appendChild(el('span', `stamp ${m.kind}`, kindName(m.kind)));
    box.appendChild(recipeRow(m, true));
    const needs = m.needs.filter(id => evoAsked(m, id))
      .map(id => t('codex.evoOf', { evo: evoNameOf(id, evoAsked(m, id)), weapon: nameOf(defOf(id)) }));
    windowLines(box, [blurbOf(m), usesText(m), needs.length ? t('codex.needsEvos', { list: needs.join(', ') }) : '']);
    const kept = m.needs.flatMap(id => (EVOLUTIONS[id] || [])
      .filter(evo => evo.inherit && evo.inherit[m.id])
      .map(evo => t('cards.fromEvo', { evo: evoName(evo), text: inheritText(evo, m) })));
    if (!kept.length) return;
    box.appendChild(el('h4', 'codex-sub', t('codex.keeps')));
    windowLines(box, [kept]);
  });
}

function showItemWindow(item) {
  openCodexWindow(itemName(item), box => {
    box.appendChild(el('span', `stamp ${item.rarity}`, t(`rarities.${item.rarity}`)));
    const stats = Object.keys(item.gives).filter(key => STATS[key]);
    windowLines(box, [
      itemText(item),
      stats.length ? t('codex.itemAdds', { stats: statNames(stats) }) : '',
      t('codex.itemUnique'),
    ]);
  });
}

// ---- Tabs ----

// "[A] + [B] → [C]": every tile opens its own window.
function recipeRow(m, inWindow = false) {
  const row = el('div', 'codex-recipe');
  const kit = phase === 'paused' ? hero.weapons.map(w => w.def.id) : []; // marked only during a run
  m.needs.forEach((id, i) => {
    if (i) row.appendChild(el('span', 'codex-op', '+'));
    row.appendChild(codexTile(defOf(id), kit.includes(id), evoAsked(m, id) ? evoNameOf(id, evoAsked(m, id)) : ''));
  });
  row.appendChild(el('span', 'codex-op', '→'));
  const result = codexTile(m, kit.includes(m.id));
  if (inWindow) result.disabled = true;
  row.appendChild(result);
  return row;
}

function codexWeapons(p, mine) {
  const kit = mine ? hero.weapons.map(w => w.def.id) : [];
  p.appendChild(el('p', 'panel-note', t('codex.weaponsNote')));
  for (const kind of ['phys', 'magic']) {
    p.appendChild(el('h3', 'section-title', kindName(kind)));
    const grid = el('div', 'codex-grid');
    WEAPONS.filter(d => d.kind === kind).forEach(d => grid.appendChild(codexTile(d, kit.includes(d.id))));
    p.appendChild(grid);
  }
}

function codexMerges(p) {
  p.appendChild(el('p', 'panel-note', t('codex.mergesNote')));
  const groups = [
    ['codex.groupPhys', m => m.needs.every(id => defOf(id).kind === 'phys')],
    ['codex.groupMagic', m => m.needs.every(id => defOf(id).kind === 'magic')],
    ['codex.groupMixed', m => new Set(m.needs.map(id => defOf(id).kind)).size > 1],
  ];
  for (const [title, test] of groups) {
    const list = SYNERGIES.filter(test);
    if (!list.length) continue;
    p.appendChild(el('h3', 'section-title', t(title)));
    mergeButtons(p, list);
  }
}

function codexItems(p) {
  p.appendChild(el('p', 'panel-note', t('codex.itemsNote', { chestSlots: CHEST_SLOTS })));
  for (const rarity of Object.keys(RARITIES)) {
    p.appendChild(el('h3', 'section-title', t(`rarities.${rarity}`)));
    const grid = el('div', 'codex-items');
    for (const item of ITEMS.filter(i => i.rarity === rarity)) {
      const row = el('button', 'codex-item');
      row.appendChild(el('span', `item-name ${item.rarity}`, itemName(item)));
      row.appendChild(el('span', 'item-text', itemText(item)));
      row.addEventListener('click', () => showItemWindow(item));
      grid.appendChild(row);
    }
    p.appendChild(grid);
  }
}

function codexStats(p) {
  p.appendChild(el('p', 'panel-note', t('codex.statsNote', { strong: STRONG_PICKS })));
  for (const key of Object.keys(STATS)) {
    const def = STATS[key];
    const box = el('div', 'codex-entry');
    const head = el('div', 'codex-head');
    head.appendChild(el('span', 'codex-name', statName(key)));
    head.appendChild(el('span', 'stamp hero', def.hero ? kindName('hero') : t('cards.forWeapons')));
    box.appendChild(head);
    const lines = [def.hero ? t(`stats.${key}.note`) : t('codex.statForWeapons')];
    if (key === 'count') {
      lines.push(t('codex.countLine', { cap: COUNT.cap, overflow: Math.round(COUNT.overflow * 100) }));
    } else {
      lines.push(t('codex.statLine', { strong: bonusText(key, def.step), weak: bonusText(key, def.weak), base: formatStat(key, def.base) }));
    }
    if (hasText(`codex.statExtra.${key}`)) lines.push(t(`codex.statExtra.${key}`));
    windowLines(box, lines);
    p.appendChild(box);
  }
  p.appendChild(el('h3', 'section-title', t('codex.armorTitle')));
  const firstTanks = WAVES.find(w => Object.keys(w.mix).some(id => ENEMIES[id].tank));
  windowLines(p, textList('codex.armorLines', { burn: percent(BURN_SHARE), tanksFrom: firstTanks ? firstTanks.at / 60 : 0 }));
  p.appendChild(el('h3', 'section-title', t('codex.actives')));
  windowLines(p, [t('codex.activesNote'), t('codex.abilityHaste')]);
  for (const a of ACTIVES) {
    const box = el('div', 'codex-entry');
    const head = el('div', 'codex-head');
    head.appendChild(el('span', 'codex-name', activeName(a)));
    head.appendChild(el('span', 'stamp hero', activeNote(a)));
    box.appendChild(head);
    const passive = activePassive(a);
    windowLines(box, [activeBlurb(a), passive ? t('start.passive', { text: passive }) : '']);
    p.appendChild(box);
  }
}

// `from` is 'start' or 'pause'.
function showCodex(tab = 'weapons', from = 'start') {
  closeCodexWindow();
  if (from === 'start') phase = 'menu';
  codexBack = from === 'pause' ? () => { codexBack = null; showPause(); } : () => { codexBack = null; showStart(); };
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', t('codex.title')));
    const tabs = el('div', 'codex-tabs');
    for (const id of CODEX_TABS) {
      const b = el('button', '', t(`codex.tabs.${id}`));
      b.setAttribute('aria-pressed', String(id === tab));
      b.addEventListener('click', () => showCodex(id, from));
      tabs.appendChild(b);
    }
    p.appendChild(tabs);
    const body = el('div', 'codex-body');
    if (tab === 'weapons') codexWeapons(body, from === 'pause');
    else if (tab === 'merges') codexMerges(body);
    else if (tab === 'items') codexItems(body);
    else codexStats(body);
    p.appendChild(body);
    const actions = el('div', 'panel-actions');
    const back = el('button', 'primary', t('ui.back'));
    back.addEventListener('click', () => codexBack());
    actions.appendChild(back);
    p.appendChild(actions);
  });
}
