// What stays between runs: records, Glory, and the Camp where Glory buys upgrades.

const RECORDS_KEY = 'games.steelspell.records';
const META_KEY = 'games.steelspell.meta';

let metaOverride = null; // the simulator's say: 'max', 'none', or null for what is saved

// ---- Storage ----

// The balance version of a run. Runs saved before versions were kept are 0.2, except the one
// best run carried over from 0.1 (it has no date).
function runVersion(run) { return run.version || (run.date ? '0.2' : '0.1'); }

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

// What the Camp adds to a run. Stat keys add on top of the picks, like items.
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
  if (cheated) return { place: 0, bestWith: false, glory: 0, cheated: true };
  const records = loadRecords();
  const run = {
    version: runVersionNow, time: elapsed, level, kills, active: activeDef.id, start: startWeapon,
    weapons: hero.weapons.map(w => (w.evo ? `${w.def.id}:${w.evo}` : w.def.id)),
    items: items.map(item => item.id), date: new Date().toISOString().slice(0, 10),
  };
  records.runs.push(run);
  records.runs.sort((a, b) => b.time - a.time);
  const place = records.runs.filter(r => runVersion(r) === BALANCE_VERSION).indexOf(run) + 1;
  // The longest RECORD_RUNS of every version stay.
  const kept = {};
  records.runs = records.runs.filter(r => (kept[runVersion(r)] = (kept[runVersion(r)] || 0) + 1) <= RECORD_RUNS);
  const totals = records.totals;
  totals.runs++;
  totals.kills += kills;
  totals.seconds += Math.round(elapsed);
  totals.elites += elitesKilled;
  totals.merges += merges;
  const best = bestByWeapon(records);
  const bestWith = !(best[startWeapon] >= elapsed);
  if (bestWith) best[startWeapon] = elapsed;
  saveJson(RECORDS_KEY, records);

  const meta = loadMeta();
  const glory = gloryEarned();
  meta.glory += glory;
  saveJson(META_KEY, meta);
  return { place: place <= RECORD_RUNS ? place : 0, bestWith, glory };
}

// The best run with each first weapon in this balance version. `bestByWeapon` from 0.2
// stays as it was, under its own version.
function bestByWeapon(records) {
  if (!records.bestByVersion) records.bestByVersion = { '0.2': records.bestByWeapon || {} };
  return records.bestByVersion[BALANCE_VERSION] || (records.bestByVersion[BALANCE_VERSION] = {});
}

// ---- Screens ----

function weaponLabel(entry) {
  const [id, evoId] = entry.split(':');
  const def = WEAPON_DEFS.find(d => d.id === id);
  if (!def) return hasText(`retired.${id}`) ? t(`retired.${id}`) : entry; // a weapon since taken out of the game
  const evo = (EVOLUTIONS[id] || []).find(e => e.id === evoId);
  return evo ? evoName(evo) : nameOf(def);
}

function backButton(p) {
  const actions = el('div', 'panel-actions');
  const back = el('button', 'primary', t('ui.back'));
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

// `earlier` lists the runs of past balance versions instead of this one.
function showRecords(earlier = false) {
  phase = 'menu';
  const records = loadRecords();
  const weaponOf = id => {
    const def = WEAPONS.find(d => d.id === id);
    return def ? nameOf(def) : '';
  };
  const activeOf = id => {
    const a = ACTIVES.find(o => o.id === id);
    return a ? activeName(a) : '';
  };
  const runs = records.runs.filter(run => (runVersion(run) === BALANCE_VERSION) !== earlier);
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', t('records.title')));
    const tabs = el('div', 'codex-tabs');
    [[false, t('records.thisVersion', { version: BALANCE_VERSION })], [true, t('records.earlier')]].forEach(([value, label]) => {
      const b = el('button', value === earlier ? 'primary' : '', label);
      b.setAttribute('aria-pressed', String(value === earlier));
      b.addEventListener('click', () => showRecords(value));
      tabs.appendChild(b);
    });
    p.appendChild(tabs);

    const totals = records.totals;
    if (totals.runs && !earlier) {
      const figures = el('div', 'figures');
      addFigure(figures, t('records.runs'), formatNumber(totals.runs));
      addFigure(figures, t('records.played'), formatTime(totals.seconds));
      addFigure(figures, t('records.kills'), formatNumber(totals.kills));
      addFigure(figures, t('records.elites'), formatNumber(totals.elites));
      addFigure(figures, t('records.merges'), formatNumber(totals.merges));
      p.appendChild(figures);
    }

    if (!runs.length) {
      p.appendChild(el('p', 'panel-note', earlier
        ? t('records.noEarlier')
        : t('records.none', { version: BALANCE_VERSION, count: RECORD_RUNS })));
      backButton(p);
      return;
    }
    p.appendChild(el('h3', 'section-title', t('records.longest')));
    const head = ['place', ...(earlier ? ['version'] : []), 'time', 'level', 'kills', 'start', 'active', 'weapons', 'items', 'date'];
    addTable(p, head.map(key => t(`records.head.${key}`)),
      runs.map((run, i) => [
        i + 1, ...(earlier ? [runVersion(run)] : []), formatTime(run.time), run.level, formatNumber(run.kills),
        weaponOf(run.start), activeOf(run.active), run.weapons.map(weaponLabel).join(', '), run.items.length, run.date,
      ]));

    if (!earlier) {
      const best = bestByWeapon(records);
      const starts = Object.keys(best).sort((a, b) => best[b] - best[a]);
      if (starts.length) {
        p.appendChild(el('h3', 'section-title', t('records.byWeapon')));
        const box = el('div', 'report');
        starts.forEach(id => addRow(box, weaponOf(id), formatTime(best[id])));
        p.appendChild(box);
      }
    }
    backButton(p);
  });
}

function showCamp() {
  phase = 'menu';
  const meta = loadMeta();
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', t('camp.title')));
    p.appendChild(el('p', 'panel-note', t('camp.note', { glory: meta.glory })));
    let spent = false;
    for (const up of META_UPGRADES) {
      const rank = meta.ranks[up.id] || 0;
      spent = spent || rank > 0;
      const row = el('div', 'camp-row');
      row.appendChild(el('span', 'camp-name', t(`camp.upgrades.${up.id}.name`)));
      row.appendChild(el('span', 'camp-text', t('camp.perRank', { text: campText(up) })));
      row.appendChild(el('span', 'camp-rank', `${rank} / ${up.ranks}`));
      const buy = el('button', '', rank >= up.ranks ? t('camp.full') : t('camp.buy', { cost: upgradeCost(up, rank) }));
      buy.disabled = rank >= up.ranks || meta.glory < upgradeCost(up, rank);
      buy.addEventListener('click', () => {
        buyUpgrade(up);
        showCamp();
      });
      row.appendChild(buy);
      p.appendChild(row);
    }
    const actions = backButton(p);
    const refund = el('button', '', t('camp.refund'));
    refund.disabled = !spent;
    refund.addEventListener('click', () => {
      refundCamp();
      showCamp();
    });
    actions.appendChild(refund);
  });
}

function showBest() {
  const best = loadRecords().runs.find(run => runVersion(run) === BALANCE_VERSION);
  setText(statusEl, best
    ? t('status.best', { version: BALANCE_VERSION, time: formatTime(best.time), level: best.level })
    : t('status.version', { version: BALANCE_VERSION }));
}
