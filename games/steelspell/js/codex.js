// The Codex: every weapon, merge, item and stat, open from the start. All of it is read from
// the tables in js/data, so whatever is added there shows up here by itself.

const CODEX_TABS = [
  { id: 'weapons', name: 'Weapons' },
  { id: 'merges', name: 'Merges' },
  { id: 'items', name: 'Items' },
  { id: 'stats', name: 'Stats' },
];

let codexBack = null; // where Back (and Escape) goes: the start screen or the pause

function codexEntry(parent, title, stampClass, stampText, lines) {
  const box = el('div', 'codex-entry');
  const head = el('div', 'codex-head');
  head.appendChild(el('span', 'codex-name', title));
  if (stampText) head.appendChild(el('span', `stamp ${stampClass}`, stampText));
  box.appendChild(head);
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
  parent.appendChild(box);
}

function statNames(keys) { return keys.map(k => STATS[k].name).join(', '); }

function mergeOf(id) { return SYNERGIES.find(s => s.needs.includes(id)); }

function codexWeapons(p, mine) {
  // From the pause, the weapons in the kit come first.
  const kit = mine ? hero.weapons.map(w => w.def.id) : [];
  const list = [...WEAPONS].sort((a, b) => (kit.includes(b.id) ? 1 : 0) - (kit.includes(a.id) ? 1 : 0));
  for (const d of list) {
    const merge = mergeOf(d.id);
    const partner = merge && WEAPONS.find(o => merge.needs.includes(o.id) && o !== d);
    const levels = [];
    for (let lv = 2; lv <= MAX_WEAPON_LEVEL; lv++) levels.push(`Lv ${lv}: ${stepText(levelStep(d, lv))}`);
    const evos = (EVOLUTIONS[d.id] || []).map(evo => `Evolution ${evo.name}: ${evo.blurb}`);
    codexEntry(p, d.name + (kit.includes(d.id) ? ' · in your kit' : ''), d.kind,
      KINDS[d.kind].name + (d.defense ? ', defensive' : ''), [
        d.blurb,
        `Uses: ${statNames(d.scales)}.`,
        levels,
        evos,
        merge ? `Merges with ${partner.name} into ${merge.name} once both are at Lv ${MAX_WEAPON_LEVEL} and evolved.` : 'Merges with nothing.',
      ]);
  }
}

function codexMerges(p) {
  for (const m of SYNERGIES) {
    const kept = m.needs.flatMap(id => (EVOLUTIONS[id] || [])
      .filter(evo => evo.inherit && evo.inherit[m.id])
      .map(evo => `From ${evo.name}: ${evo.inherit[m.id].text}.`));
    codexEntry(p, m.name, 'hybrid', m.needs.map(id => WEAPON_DEFS.find(d => d.id === id).name).join(' + '), [
      m.blurb,
      `Uses: ${statNames(m.scales)}.`,
      'It keeps what the evolutions of both weapons did:',
      kept,
    ]);
  }
}

function codexItems(p) {
  for (const rarity of Object.keys(RARITIES)) {
    p.appendChild(el('h3', 'section-title', RARITIES[rarity].name));
    for (const item of ITEMS.filter(i => i.rarity === rarity)) {
      const row = el('div', 'item-row');
      row.appendChild(el('span', `item-name ${item.rarity}`, item.name));
      row.appendChild(el('span', 'item-text', item.text));
      p.appendChild(row);
    }
  }
}

function codexStats(p) {
  p.appendChild(el('p', 'panel-note',
    `The first ${STRONG_PICKS} picks of a stat are strong, every pick after them is weaker. Items and Camp upgrades always add their full value on top. A weapon gets a stat only if it uses it.`));
  for (const key of Object.keys(STATS)) {
    const def = STATS[key];
    const lines = [def.note || 'For the weapons that use it.'];
    if (key === 'count') {
      lines.push(`+1 shot per pick. The card stops coming at +${COUNT.cap}; items, the Camp and weapon levels add more shots with no limit. A weapon that fires a single shot gets +${Math.round(COUNT.overflow * 100)}% damage per Count instead.`);
    } else {
      lines.push(`Strong pick: ${bonusText(key, def.step)}. Weak pick: ${bonusText(key, def.weak)}. Starts at ${formatStat(key, def.base)}.`);
    }
    if (key === 'critChance') lines.push('Every weapon can crit. Past 100% a crit can land twice.');
    if (key === 'armor') lines.push('A hit does 100 / (100 + Armor) of its damage.');
    if (key === 'haste') lines.push('A weapon attacks 1 + Haste times as often.');
    codexEntry(p, def.name, 'hero', def.note ? KINDS.hero.name : 'Weapons', lines);
  }
}

// `from` is 'start' or 'pause'.
function showCodex(tab = 'weapons', from = 'start') {
  if (from === 'start') phase = 'menu';
  codexBack = from === 'pause' ? () => { codexBack = null; showPause(); } : () => { codexBack = null; showStart(); };
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', 'Codex'));
    const tabs = el('div', 'codex-tabs');
    for (const t of CODEX_TABS) {
      const b = el('button', t.id === tab ? 'primary' : '', t.name);
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
