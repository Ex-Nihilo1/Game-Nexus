// The Codex: every weapon, merge, item and stat, open from the start. Weapons and merges are
// tiles; a tile opens a window with everything about it. All of it is read from the tables in
// js/data, so whatever is added there shows up here by itself.

const CODEX_TABS = [
  { id: 'weapons', name: 'Weapons' },
  { id: 'merges', name: 'Merges' },
  { id: 'items', name: 'Items' },
  { id: 'stats', name: 'Stats' },
];

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
  const close = el('button', '', 'Close');
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

function statNames(keys) { return keys.map(k => STATS[k].name).join(', '); }

function defOf(id) { return WEAPON_DEFS.find(d => d.id === id); }

function mergesOf(id) { return SYNERGIES.filter(s => s.needs.includes(id)); }

// A weapon or a merge as a tile. Pressing it opens its window.
function codexTile(def, owned) {
  const tile = el('button', `codex-tile ${def.kind}`);
  tile.appendChild(el('span', 'codex-tag', def.tag));
  tile.appendChild(el('span', 'codex-tile-name', def.name));
  if (owned) tile.appendChild(el('span', 'codex-mine', 'yours'));
  tile.setAttribute('aria-label', `${def.name}, ${KINDS[def.kind].name}${owned ? ', in your kit' : ''}`);
  tile.addEventListener('click', () => (def.needs ? showMergeWindow(def) : showWeaponWindow(def)));
  return tile;
}

function mergeButtons(box, list) {
  const row = el('div', 'codex-recipes');
  for (const m of list) row.appendChild(recipeRow(m));
  box.appendChild(row);
}

function showWeaponWindow(d) {
  openCodexWindow(d.name, box => {
    box.appendChild(el('span', `stamp ${d.kind}`, KINDS[d.kind].name + (d.defense ? ', defensive' : '')));
    const levels = [];
    for (let lv = 2; lv <= MAX_WEAPON_LEVEL; lv++) levels.push(`Lv ${lv}: ${stepText(levelStep(d, lv))}`);
    windowLines(box, [d.blurb, `Uses: ${statNames(d.scales)}.`]);
    box.appendChild(el('h4', 'codex-sub', 'Levels'));
    windowLines(box, [levels]);
    box.appendChild(el('h4', 'codex-sub', `Evolutions at Lv ${MAX_WEAPON_LEVEL}`));
    windowLines(box, [(EVOLUTIONS[d.id] || []).map(evo => `${evo.name}: ${evo.blurb}`)]);
    const merges = mergesOf(d.id);
    box.appendChild(el('h4', 'codex-sub', 'Merges'));
    if (!merges.length) windowLines(box, ['Merges with nothing.']);
    else {
      windowLines(box, [`Once both weapons are at Lv ${MAX_WEAPON_LEVEL} and evolved, a card offers the merge. A weapon goes into one merge only.`]);
      mergeButtons(box, merges);
    }
  });
}

function showMergeWindow(m) {
  openCodexWindow(m.name, box => {
    box.appendChild(el('span', `stamp ${m.kind}`, KINDS[m.kind].name));
    box.appendChild(recipeRow(m, true));
    windowLines(box, [m.blurb, `Uses: ${statNames(m.scales)}.`]);
    box.appendChild(el('h4', 'codex-sub', 'It keeps what the evolutions did'));
    windowLines(box, [m.needs.flatMap(id => (EVOLUTIONS[id] || [])
      .filter(evo => evo.inherit && evo.inherit[m.id])
      .map(evo => `From ${evo.name}: ${evo.inherit[m.id].text}.`))]);
  });
}

function showItemWindow(item) {
  openCodexWindow(item.name, box => {
    box.appendChild(el('span', `stamp ${item.rarity}`, RARITIES[item.rarity].name));
    const stats = Object.keys(item.gives).filter(key => STATS[key]);
    windowLines(box, [
      item.text,
      stats.length ? `Adds to ${statNames(stats)} at full value, on top of the cards.` : '',
      'Every item is one of a kind: a chest never offers one you have.',
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
    row.appendChild(codexTile(defOf(id), kit.includes(id)));
  });
  row.appendChild(el('span', 'codex-op', '→'));
  const result = codexTile(m, kit.includes(m.id));
  if (inWindow) result.disabled = true;
  row.appendChild(result);
  return row;
}

function codexWeapons(p, mine) {
  const kit = mine ? hero.weapons.map(w => w.def.id) : [];
  p.appendChild(el('p', 'panel-note', 'Press a weapon to see its levels, evolutions and merges.'));
  for (const kind of ['phys', 'magic']) {
    p.appendChild(el('h3', 'section-title', KINDS[kind].name));
    const grid = el('div', 'codex-grid');
    WEAPONS.filter(d => d.kind === kind).forEach(d => grid.appendChild(codexTile(d, kit.includes(d.id))));
    p.appendChild(grid);
  }
}

function codexMerges(p) {
  p.appendChild(el('p', 'panel-note', 'Two weapons at their last level, both evolved, merge into one. A merge of two weapons of one kind keeps that kind.'));
  const groups = [
    ['Physical + physical', m => m.needs.every(id => defOf(id).kind === 'phys')],
    ['Magic + magic', m => m.needs.every(id => defOf(id).kind === 'magic')],
    ['Physical + magic', m => new Set(m.needs.map(id => defOf(id).kind)).size > 1],
  ];
  for (const [title, test] of groups) {
    const list = SYNERGIES.filter(test);
    if (!list.length) continue;
    p.appendChild(el('h3', 'section-title', title));
    mergeButtons(p, list);
  }
}

function codexItems(p) {
  p.appendChild(el('p', 'panel-note', 'Items come from chests: elites drop one, pick 1 item of 3. Press an item for more.'));
  for (const rarity of Object.keys(RARITIES)) {
    p.appendChild(el('h3', 'section-title', RARITIES[rarity].name));
    const grid = el('div', 'codex-items');
    for (const item of ITEMS.filter(i => i.rarity === rarity)) {
      const row = el('button', 'codex-item');
      row.appendChild(el('span', `item-name ${item.rarity}`, item.name));
      row.appendChild(el('span', 'item-text', item.text));
      row.addEventListener('click', () => showItemWindow(item));
      grid.appendChild(row);
    }
    p.appendChild(grid);
  }
}

function codexStats(p) {
  p.appendChild(el('p', 'panel-note',
    `The first ${STRONG_PICKS} picks of a stat are strong, every pick after them is weaker. Items and Camp upgrades always add their full value on top. A weapon gets a stat only if it uses it.`));
  for (const key of Object.keys(STATS)) {
    const def = STATS[key];
    const box = el('div', 'codex-entry');
    const head = el('div', 'codex-head');
    head.appendChild(el('span', 'codex-name', def.name));
    head.appendChild(el('span', 'stamp hero', def.note ? KINDS.hero.name : 'Weapons'));
    box.appendChild(head);
    const lines = [def.note || 'For the weapons that use it.'];
    if (key === 'count') {
      lines.push(`+1 shot per pick. The card stops coming at +${COUNT.cap}; items, the Camp and weapon levels add more shots with no limit. A weapon that fires a single shot gets +${Math.round(COUNT.overflow * 100)}% damage per Count instead.`);
    } else {
      lines.push(`Strong pick: ${bonusText(key, def.step)}. Weak pick: ${bonusText(key, def.weak)}. Starts at ${formatStat(key, def.base)}.`);
    }
    if (key === 'critChance') lines.push('Every weapon can crit. Past 100% a crit can land twice.');
    if (key === 'armor') lines.push('A hit does 100 / (100 + Armor) of its damage. Bastion hits harder with it.');
    if (key === 'vitality') lines.push('Summoned copies get your max health, and hit harder the more you have.');
    if (key === 'haste') lines.push('A weapon attacks 1 + Haste times as often.');
    windowLines(box, lines);
    p.appendChild(box);
  }
}

// `from` is 'start' or 'pause'.
function showCodex(tab = 'weapons', from = 'start') {
  closeCodexWindow();
  if (from === 'start') phase = 'menu';
  codexBack = from === 'pause' ? () => { codexBack = null; showPause(); } : () => { codexBack = null; showStart(); };
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', 'Codex'));
    const tabs = el('div', 'codex-tabs');
    for (const t of CODEX_TABS) {
      const b = el('button', '', t.name);
      b.setAttribute('aria-pressed', String(t.id === tab));
      b.addEventListener('click', () => showCodex(t.id, from));
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
    const back = el('button', 'primary', 'Back');
    back.addEventListener('click', () => codexBack());
    actions.appendChild(back);
    p.appendChild(actions);
  });
}
