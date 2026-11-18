// Developer mode: the test keys (js/sim.js) and the developer panel. It is on with ?dev in the
// address (the team, the simulator) or from Settings, behind a password that is there for form
// only: the page checks it, so anyone who reads the code can get in. A run where a cheat was
// used goes to no records and earns no Glory, and the screen says so.

const DEV_PASSWORD_HASH = '62b59997'; // FNV-1a of the password, so that it is not here as text
const DEV_SPEEDS = [0.25, 0.5, 1, 2, 4];
const DEV_GLORY = 100;
const devShow = { hitboxes: false, armor: false };
let devSpeed = 1;
let devHold = false; // no new enemies arrive

function devMode() { return DEV || !!settings.dev; }

function fnv1a(text) {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function devPasswordOk(text) { return fnv1a(text) === DEV_PASSWORD_HASH; }

// Back to normal at the start of every run.
function resetDev() {
  devSpeed = 1;
  devHold = false;
}

// [F1]: the panel, over a paused run.
function openDevPanel() {
  if (!devMode()) return;
  if (phase === 'playing') phase = 'paused';
  if (phase === 'paused') showDevPanel();
}

function showDevPanel() {
  showPanel(p => {
    p.appendChild(el('h2', 'panel-title', t('dev.title')));
    p.appendChild(el('p', 'panel-note', t('dev.note', { seed })));
    const row = (label, ...nodes) => {
      const line = el('div', 'dev-row');
      line.appendChild(el('span', 'pick-label', label));
      const box = el('div', 'dev-items');
      box.append(...nodes);
      line.appendChild(box);
      p.appendChild(line);
    };
    // `marks`: the button is a cheat. The panel stays open unless the run moved on (a card).
    const button = (text, fn, { pressed, marks = true } = {}) => {
      const b = el('button', 'dev-btn', text);
      if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
      b.addEventListener('click', () => {
        if (marks) cheated = true;
        fn();
        dirty = true;
        if (phase === 'paused') showDevPanel();
      });
      return b;
    };
    const select = options => {
      const s = el('select', 'lang-pick');
      for (const [value, text] of options) {
        const o = el('option', '', text);
        o.value = value;
        s.appendChild(o);
      }
      return s;
    };

    row(t('dev.time'),
      ...DEV_SPEEDS.map(x => button(`×${formatNumber(x)}`, () => { devSpeed = x; }, { pressed: devSpeed === x, marks: x !== 1 })),
      button(t('dev.step'), () => update(1 / 60)),
      button(t('dev.minute'), () => { elapsed += 60; }));

    row(t('dev.hero'),
      button(t('dev.immortal'), () => { hero.immortal = !hero.immortal; }, { pressed: !!hero.immortal }),
      button(t('dev.heal'), () => { hero.hp = hero.maxHp; }),
      button(t('dev.resetActive'), () => { activeCd = 0; }),
      button(t('dev.levels', { n: 1 }), () => gainXp(xpNext - xp)),
      button(t('dev.levels', { n: 5 }), () => { for (let i = 0; i < 5; i++) gainXp(xpNext - xp); }));

    const gone = SYNERGIES.filter(s => owned(s.id)).flatMap(s => s.needs);
    const free = WEAPON_DEFS.filter(d => !owned(d.id) && !gone.includes(d.id));
    if (free.length) {
      const pick = select(free.map(d => [d.id, nameOf(d)]));
      row(t('dev.weapons'), pick, button(t('dev.add'), () => addWeapon(pick.value)));
    }
    const growing = hero.weapons.filter(canLevel);
    if (growing.length) {
      const pick = select(growing.map(w => [w.def.id, nameOf(w.def)]));
      row('', pick, button(t('dev.maxLevel'), () => {
        const w = owned(pick.value);
        while (canLevel(w)) levelUpWeapon(w);
      }));
    }

    const unowned = ITEMS.filter(item => !items.includes(item));
    if (unowned.length) {
      const pick = select(unowned.map(item => [item.id, itemName(item)]));
      row(t('dev.items'), pick, button(t('dev.give'), () => takeItem(ITEMS.find(item => item.id === pick.value))));
    }

    const kinds = select(Object.keys(ENEMIES).filter(id => !ENEMIES[id].dummy).map(id => [id, t(`enemies.${id}`)]));
    row(t('dev.enemies'), kinds,
      button(t('dev.call'), () => addEnemy(kinds.value)),
      button(t('dev.fill'), () => { while (enemies.length < MAX_ENEMIES) addEnemy(pickOne(['mite', 'runner', 'ironclad', 'warded'])); }),
      button(t('dev.killAll'), () => {
        for (const e of enemies) if (!e.dead && onScreen(e.x, e.y, 0)) killEnemy(e);
      }),
      button(t('dev.hold'), () => { devHold = !devHold; }, { pressed: devHold }));

    row(t('dev.show'),
      button(t('dev.hitboxes'), () => { devShow.hitboxes = !devShow.hitboxes; }, { pressed: devShow.hitboxes, marks: false }),
      button(t('dev.armor'), () => { devShow.armor = !devShow.armor; }, { pressed: devShow.armor, marks: false }));

    row(t('ui.camp'), button(t('dev.glory', { glory: DEV_GLORY }), () => {
      const meta = loadMeta();
      meta.glory += DEV_GLORY;
      saveJson(META_KEY, meta);
    }));

    const actions = el('div', 'panel-actions');
    const back = el('button', 'primary', t('ui.back'));
    back.addEventListener('click', showPause);
    actions.appendChild(back);
    p.appendChild(actions);
  });
}

// Hitboxes, and every enemy's armor / ward as a hit meets it now (after shred and penetration).
function drawDevOverlay() {
  if (!devShow.hitboxes && !devShow.armor) return;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal['red-pencil'];
  ctx.fillStyle = pal.ink;
  ctx.font = `11px ${FONT}`;
  ctx.textAlign = 'center';
  for (const e of enemies) {
    if (e.dead || !onScreen(e.x, e.y, 40)) continue;
    if (devShow.hitboxes) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, TAU);
      ctx.stroke();
    }
    if (devShow.armor) {
      ctx.fillText(`${Math.round(effectiveResist(e, 'armor'))} / ${Math.round(effectiveResist(e, 'ward'))}`, e.x, e.y - e.r - 4);
    }
  }
  if (devShow.hitboxes) {
    ctx.beginPath();
    ctx.arc(hero.x, hero.y, hero.r, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}
