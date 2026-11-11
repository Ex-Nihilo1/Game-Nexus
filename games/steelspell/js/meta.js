// What stays between runs: records, Glory, and the Camp where Glory buys upgrades.

const RECORDS_KEY = 'games.steelspell.records';
const META_KEY = 'games.steelspell.meta';

let metaOverride = null; // the simulator's say: 'max', 'none', or null for what is saved

// ---- Storage ----

function loadRecords() {
  const saved = loadJson(RECORDS_KEY);
  if (saved && saved.version === 1) return saved;
  const records = {
    version: 1, runs: [], totals: { runs: 0, kills: 0, seconds: 0, elites: 0, merges: 0 }, bestByWeapon: {},
  };
  // The one best run kept before there were records becomes the first entry.
  const old = loadJson(BEST_KEY);
  if (old && old.time) {
    records.runs.push({ time: old.time, level: old.level, kills: 0, active: '', start: '', weapons: [], items: [], date: '' });
  }
  return records;
}

function loadMeta() {
  const saved = loadJson(META_KEY);
  return saved && saved.version === 1 ? saved : { version: 1, glory: 0, ranks: {} };
}

function setMetaForRun(mode) { metaOverride = mode; }

function metaRanks() {
  if (metaOverride === 'none') return {};
  if (metaOverride === 'max') return Object.fromEntries(META_UPGRADES.map(up => [up.id, up.ranks]));
  return loadMeta().ranks;
}

// What the Camp adds to a run. Stat keys join the stats' own sums, before the soft caps.
function campBonus() {
  const ranks = metaRanks();
  const bonus = {};
  for (const up of META_UPGRADES) {
    const rank = Math.min(up.ranks, ranks[up.id] || 0);
    if (rank) bonus[up.gives] = (bonus[up.gives] || 0) + up.amount * rank;
  }
  return bonus;
}

// ---- Glory and upgrades ----

function gloryEarned() {
  const earned = elapsed / 60 * GLORY.perMinute + elitesKilled * GLORY.perElite + level * GLORY.perLevel + merges * GLORY.perMerge;
  return Math.floor(earned * (1 + (metaBonus.glory || 0)));
}

function upgradeCost(up, rank) { return up.cost * (rank + 1); }

function buyUpgrade(up) {
  const meta = loadMeta();
  const rank = meta.ranks[up.id] || 0;
  if (rank >= up.ranks || meta.glory < upgradeCost(up, rank)) return;
  meta.glory -= upgradeCost(up, rank);
  meta.ranks[up.id] = rank + 1;
  saveJson(META_KEY, meta);
}

function refundCamp() {
  const meta = loadMeta();
  for (const up of META_UPGRADES) {
    for (let rank = 0; rank < (meta.ranks[up.id] || 0); rank++) meta.glory += upgradeCost(up, rank);
  }
  meta.ranks = {};
  saveJson(META_KEY, meta);
}

// Saves the run that has just ended, and returns what the end screen says about it.
function recordRun() {
  const records = loadRecords();
  const run = {
    time: elapsed, level, kills, active: activeDef.id, start: startWeapon,
    weapons: hero.weapons.map(w => (w.evo ? `${w.def.id}:${w.evo}` : w.def.id)),
    items: items.map(item => item.id), date: new Date().toISOString().slice(0, 10),
  };
  records.runs.push(run);
  records.runs.sort((a, b) => b.time - a.time);
  const place = records.runs.indexOf(run) + 1;
  records.runs.length = Math.min(records.runs.length, RECORD_RUNS);
  const totals = records.totals;
  totals.runs++;
  totals.kills += kills;
  totals.seconds += Math.round(elapsed);
  totals.elites += elitesKilled;
  totals.merges += merges;
  const bestWith = !(records.bestByWeapon[startWeapon] >= elapsed);
  if (bestWith) records.bestByWeapon[startWeapon] = elapsed;
  saveJson(RECORDS_KEY, records);

  const meta = loadMeta();
  const glory = gloryEarned();
  meta.glory += glory;
  saveJson(META_KEY, meta);
  return { place: place <= RECORD_RUNS ? place : 0, bestWith, glory };
}

// ---- Screens ----

function weaponLabel(entry) {
  const [id, evoId] = entry.split(':');
  const def = WEAPON_DEFS.find(d => d.id === id);
  if (!def) return entry;
  const evo = (EVOLUTIONS[id] || []).find(e => e.id === evoId);
  return evo ? evo.name : def.name;
}

function backButton(p) {
  const actions = el('div', 'panel-actions');
  const back = el('button', 'primary', 'Back');
  back.addEventListener('click', showStart);
  actions.appendChild(back);
  p.appendChild(actions);
  return actions;
}

function addTable(parent, head, rows) {
  const scroll = el('div', 'table-scroll');
  const table = el('table', 'data-table');
  const top = el('tr');
  head.forEach(text => top.appendChild(el('th', '', text)));
  table.appendChild(top);
  for (const row of rows) {
    const tr = el('tr');
    row.forEach(text => tr.appendChild(el('td', '', String(text))));
    table.appendChild(tr);
  }
  scroll.appendChild(table);
  parent.appendChild(scroll);
}

function showRecords() {
  phase = 'menu';
  const records = loadRecords();
  const name = (list, id) => (list.find(o => o.id === id) || { name: '' }).name;
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', 'Records'));
    if (!records.runs.length) {
      p.appendChild(el('p', 'panel-note', 'No runs yet. The 20 longest will be listed here.'));
      backButton(p);
      return;
    }
    const t = records.totals;
    const figures = el('div', 'figures');
    addFigure(figures, 'Runs', String(t.runs));
    addFigure(figures, 'Time played', formatTime(t.seconds));
    addFigure(figures, 'Kills', t.kills.toLocaleString('en-US'));
    addFigure(figures, 'Elites', String(t.elites));
    addFigure(figures, 'Merges', String(t.merges));
    p.appendChild(figures);

    p.appendChild(el('h3', 'section-title', 'Longest runs'));
    addTable(p, ['#', 'Time', 'Level', 'Kills', 'Start', 'Active', 'Weapons at the end', 'Items', 'Date'],
      records.runs.map((run, i) => [
        i + 1, formatTime(run.time), run.level, run.kills.toLocaleString('en-US'), name(WEAPONS, run.start),
        name(ACTIVES, run.active), run.weapons.map(weaponLabel).join(', '), run.items.length, run.date,
      ]));

    const starts = Object.keys(records.bestByWeapon).sort((a, b) => records.bestByWeapon[b] - records.bestByWeapon[a]);
    if (starts.length) {
      p.appendChild(el('h3', 'section-title', 'Best run by first weapon'));
      const box = el('div', 'report');
      starts.forEach(id => addRow(box, name(WEAPONS, id), formatTime(records.bestByWeapon[id])));
      p.appendChild(box);
    }
    backButton(p);
  });
}

function showCamp() {
  phase = 'menu';
  const meta = loadMeta();
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', 'Camp'));
    p.appendChild(el('p', 'panel-note',
      `Every run earns Glory: for the minutes you last, elites killed, levels and merges. Upgrades bought here stay for every run. You have ${meta.glory} Glory.`));
    let spent = false;
    for (const up of META_UPGRADES) {
      const rank = meta.ranks[up.id] || 0;
      spent = spent || rank > 0;
      const row = el('div', 'camp-row');
      row.appendChild(el('span', 'camp-name', up.name));
      row.appendChild(el('span', 'camp-text', `${up.text} per rank`));
      row.appendChild(el('span', 'camp-rank', `${rank} / ${up.ranks}`));
      const buy = el('button', '', rank >= up.ranks ? 'Full' : `Buy: ${upgradeCost(up, rank)}`);
      buy.disabled = rank >= up.ranks || meta.glory < upgradeCost(up, rank);
      buy.addEventListener('click', () => {
        buyUpgrade(up);
        showCamp();
      });
      row.appendChild(buy);
      p.appendChild(row);
    }
    const actions = backButton(p);
    const refund = el('button', '', 'Refund all');
    refund.disabled = !spent;
    refund.addEventListener('click', () => {
      refundCamp();
      showCamp();
    });
    actions.appendChild(refund);
  });
}

function showBest() {
  const best = loadRecords().runs[0];
  setText(statusEl, best ? `Best run: ${formatTime(best.time)}, level ${best.level}` : '');
}
