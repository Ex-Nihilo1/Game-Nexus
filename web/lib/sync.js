// Keeps the games' localStorage in step with the signed-in account. Load it after
// api.js. A game page names its game, so that it reloads once when the account
// brings newer progress than this device had:
//
//   <script src="../../lib/sync.js" data-game="tetris"></script>
//
// The games themselves know nothing of this: every write to a key listed below is
// noticed and sent to the server a moment later, and on each page load the server's
// newer copies are written back. When this device and the account both changed the
// same game, the player picks which copy to keep. Guests keep everything local; the
// first sign-in on a device links what is there to the account.

(function () {
  if (typeof Nexus === 'undefined' || !Nexus.online) return;

  // Every key that syncs, by what it belongs to. The server keeps the same list in
  // internal/games, and a Go test checks that the two match.
  const SYNCED = {
    settings: { name: 'Settings', keys: ['games.scheme', 'games.mode'] },
    tetris: { name: 'Tetris', keys: ['games.tetris.best'] },
    minesweeper: { name: 'Minesweeper', keys: ['games.minesweeper.size', 'games.minesweeper.minePct', 'games.minesweeper.mode'] },
    towerdefense: { name: 'Tower Defense', keys: ['games.towerdefense.best', 'games.towerdefense.map'] },
    chronomancer: { name: 'Chronomancer', keys: ['chronoguard-v2'] },
    steelspell: {
      name: 'Steel & Spell',
      keys: ['games.steelspell.save', 'games.steelspell.records', 'games.steelspell.meta', 'games.steelspell.last', 'games.steelspell.best'],
    },
  };
  const groupOf = {};
  for (const [id, group] of Object.entries(SYNCED)) for (const key of group.keys) groupOf[key] = id;

  const REV_PREFIX = 'nexus.sync.rev.'; // + key: the server revision this device has
  const DIRTY_KEY = 'nexus.sync.dirty'; // keys changed here and not yet sent
  const OWNER_KEY = 'nexus.sync.user'; // the account this device's progress is linked to
  const DEVICE_KEY = 'nexus.sync.device';
  const RELOAD_KEY = 'nexus.sync.reloaded';
  const PUSH_DELAY = 2000;

  const script = document.currentScript;
  const pageGame = script && script.dataset.game;

  let storage;
  try { storage = window.localStorage; } catch (e) { return; }
  if (!storage) return;

  const proto = Storage.prototype;
  const rawGet = proto.getItem;
  const rawSet = proto.setItem;
  const rawRemove = proto.removeItem;
  const get = key => rawGet.call(storage, key);
  const put = (key, value) => { try { rawSet.call(storage, key, value); } catch (e) { /* full or blocked */ } };
  const drop = key => rawRemove.call(storage, key);

  function dirtyKeys() {
    try { return new Set(JSON.parse(get(DIRTY_KEY)) || []); } catch (e) { return new Set(); }
  }
  function saveDirty(set) {
    if (set.size) put(DIRTY_KEY, JSON.stringify([...set]));
    else drop(DIRTY_KEY);
  }
  function markClean(key) {
    const set = dirtyKeys();
    if (set.delete(key)) saveDirty(set);
  }
  const revOf = key => Number(get(REV_PREFIX + key)) || 0;
  const setRev = (key, rev) => put(REV_PREFIX + key, String(rev));
  const linkedTo = user => user && get(OWNER_KEY) === String(user.id);

  // Which device this is. The server keeps the device of every write, so a change
  // this device made itself (say, sent as the page closed, with its answer lost) is
  // not taken for news from another device.
  let device = get(DEVICE_KEY);
  if (!device) {
    device = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    put(DEVICE_KEY, device);
  }
  // When the account's copy is this device's own last write, take its revision: any
  // later change here is still marked and goes out next.
  function ownWrite(key, info) {
    if (!info || info.device !== device) return false;
    setRev(key, info.rev);
    if (get(key) === info.value) markClean(key);
    return true;
  }

  // ---- Noticing writes ----

  let applying = false; // true while this script writes, so its own writes are not sent back

  function noticed(key, before) {
    if (applying || !groupOf[key] || get(key) === before) return;
    const set = dirtyKeys();
    set.add(key);
    saveDirty(set);
    schedulePush();
  }
  proto.setItem = function (key, value) {
    if (this !== storage) return rawSet.call(this, key, value);
    const before = get(key);
    rawSet.call(this, key, value);
    noticed(String(key), before);
  };
  proto.removeItem = function (key) {
    if (this !== storage) return rawRemove.call(this, key);
    const before = get(key);
    rawRemove.call(this, key);
    noticed(String(key), before);
  };

  // Write the account's copy here.
  function apply(key, value, rev) {
    applying = true;
    try {
      if (value === null) drop(key);
      else put(key, value);
    } finally {
      applying = false;
    }
    setRev(key, rev);
    markClean(key);
  }

  // ---- Talking to the server ----

  // A save upload. With keepalive it can outlive the page (small saves only).
  async function upload(key, value, baseRev, keepalive) {
    if (!keepalive) return Nexus.call('PUT', 'saves/' + encodeURIComponent(key), { value, baseRev, device });
    try {
      const res = await fetch(Nexus.root + 'api/saves/' + encodeURIComponent(key), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Nexus': '1' },
        body: JSON.stringify({ value, baseRev, device }),
        credentials: 'same-origin',
        keepalive: true,
      });
      return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : {} };
    } catch (e) {
      return { ok: false, status: 0, data: {} };
    }
  }

  async function download(key) {
    const r = await Nexus.call('GET', 'saves/' + encodeURIComponent(key));
    return r.ok ? r.data : null;
  }

  // ---- Sending changes ----

  let timer = null;
  let busy = false;
  let again = false;

  function schedulePush() {
    clearTimeout(timer);
    timer = setTimeout(() => push(false), PUSH_DELAY);
  }

  async function push(keepalive) {
    const user = Nexus.user();
    if (!linkedTo(user)) return; // a guest, or the sign-in that links this device is still to come
    if (busy) { again = true; return; }
    busy = true;
    const conflicts = [];
    try {
      for (const key of dirtyKeys()) {
        const value = get(key);
        const r = await upload(key, value, revOf(key), keepalive);
        if (r.ok) {
          setRev(key, r.data.rev);
          if (get(key) === value) markClean(key); // changed again meanwhile: send that too
        } else if (r.status === 409) {
          if (ownWrite(key, r.data)) again = true;
          else conflicts.push({ key, value: r.data.value, rev: r.data.rev });
        } else if (r.status === 400 || r.status === 413) {
          console.warn(`Game Nexus: ${key} cannot be saved to the account: ${r.data.error || r.status}`);
          markClean(key);
        } else {
          break; // offline, signed out or busy: try again later
        }
      }
    } finally {
      busy = false;
    }
    if (conflicts.length) await settle(conflicts);
    if (again) { again = false; schedulePush(); }
  }

  // ---- Fetching newer copies ----

  let syncing = null;

  function sync() {
    if (!syncing) syncing = run().finally(() => { syncing = null; });
    return syncing;
  }

  async function run() {
    const user = Nexus.user();
    if (!user) return;
    const r = await Nexus.call('GET', 'saves');
    if (!r.ok) return;
    const server = new Map((r.data.saves || []).map(s => [s.key, s]));
    const applied = [];
    const conflicts = [];

    const linking = !linkedTo(user);
    if (linking) {
      await link(server, applied, conflicts);
    } else {
      const dirty = dirtyKeys();
      for (const [key, info] of server) {
        if (!groupOf[key] || info.rev <= revOf(key)) continue;
        if (info.device === device) {
          setRev(key, info.rev); // this device's own write; anything newer here is still marked
          continue;
        }
        const copy = await download(key);
        if (!copy) continue;
        if (dirty.has(key) && get(key) !== copy.value) {
          conflicts.push({ key, value: copy.value, rev: copy.rev });
        } else {
          apply(key, copy.value, copy.rev);
          applied.push(key);
        }
      }
    }
    if (conflicts.length) applied.push(...await settle(conflicts));
    // Linked only once every conflict is settled: a page closed while the player is
    // still choosing links again next time, and asks again.
    if (linking) put(OWNER_KEY, String(user.id));
    reloadIfNeeded(applied);
    await push(false);
  }

  // The first sync of this device with this account: whatever only one side has is
  // copied to the other, and what both have and differs is a conflict.
  async function link(server, applied, conflicts) {
    for (const key of Object.keys(groupOf)) {
      const local = get(key);
      const info = server.get(key);
      if (!info || info.removed) {
        if (local === null) continue;
        const r = await upload(key, local, info ? info.rev : 0, false);
        if (r.ok) setRev(key, r.data.rev);
        else if (r.status === 409) conflicts.push({ key, value: r.data.value, rev: r.data.rev });
        continue;
      }
      const copy = await download(key);
      if (!copy) continue;
      if (local === null || local === copy.value) {
        if (local === null) applied.push(key);
        apply(key, copy.value, copy.rev);
      } else {
        conflicts.push({ key, value: copy.value, rev: copy.rev });
      }
    }
    // Everything here has now been sent or is a conflict about to be settled.
    const set = dirtyKeys();
    for (const key of Object.keys(groupOf)) set.delete(key);
    saveDirty(set);
  }

  // Conflicts are settled a game at a time: the player keeps this device's copy or
  // the account's. Settings simply follow the account. Returns the keys written here.
  async function settle(conflicts) {
    const byGroup = new Map();
    for (const c of conflicts) {
      const group = groupOf[c.key];
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group).push(c);
    }
    const applied = [];
    for (const [group, list] of byGroup) {
      const keep = group === 'settings' ? 'account' : await ask(SYNCED[group].name);
      for (const c of list) {
        if (keep === 'account') {
          apply(c.key, c.value, c.rev);
          applied.push(c.key);
        } else {
          const r = await upload(c.key, get(c.key), c.rev, false);
          if (r.ok) {
            setRev(c.key, r.data.rev);
            markClean(c.key);
          }
        }
      }
    }
    return applied;
  }

  // A game page shows what it read at load; when the account replaced some of it,
  // the page starts again with the new copy. Once, in case anything goes wrong.
  function reloadIfNeeded(applied) {
    if (!pageGame || !applied.some(key => groupOf[key] === pageGame)) return;
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
      if (Date.now() - last < 15000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch (e) {
      return;
    }
    location.reload();
  }

  // ---- Asking the player ----

  function ask(gameName) {
    return new Promise(resolve => {
      const show = () => {
        const box = document.createElement('div');
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-labelledby', 'nexus-sync-title');
        box.style.cssText = 'position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;' +
          'background:rgba(0,0,0,.45);font:14px "Bahnschrift","Segoe UI",system-ui,sans-serif';
        const panel = document.createElement('div');
        panel.style.cssText = 'max-width:420px;padding:20px 22px;border:1px solid var(--rule,#3A5580);border-radius:3px;' +
          'background:var(--paper,#1A3150);color:var(--ink,#E8EFF7)';
        const title = document.createElement('h2');
        title.id = 'nexus-sync-title';
        title.textContent = `${gameName}: two different copies`;
        title.style.cssText = 'margin:0 0 8px;font-size:16px;font-weight:600';
        const text = document.createElement('p');
        text.textContent = 'This device and your account both have progress in this game, and they differ. ' +
          'Keep one; the other is replaced.';
        text.style.cssText = 'margin:0 0 16px;line-height:1.45';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end';
        const button = (label, primary, answer) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = label;
          b.style.cssText = 'height:32px;padding:0 14px;border-radius:3px;cursor:pointer;font:inherit;' +
            'border:1px solid var(--ink,#E8EFF7);' +
            (primary ? 'background:var(--ink,#E8EFF7);color:var(--paper,#1A3150)' : 'background:transparent;color:inherit');
          b.addEventListener('click', () => { box.remove(); resolve(answer); });
          row.appendChild(b);
          return b;
        };
        button("Keep this device's", false, 'device');
        const first = button("Use the account's", true, 'account');
        panel.append(title, text, row);
        box.appendChild(panel);
        document.body.appendChild(box);
        first.focus();
      };
      if (document.body) show();
      else document.addEventListener('DOMContentLoaded', show);
    });
  }

  // ---- When to sync ----

  Nexus.userReady.then(user => { if (user) sync(); });
  document.addEventListener('nexususer', e => { if (e.detail) sync(); });
  const flush = () => { if (dirtyKeys().size) { clearTimeout(timer); push(true); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);

  Nexus.sync = {
    now: sync,
    keys: () => Object.keys(groupOf),
    // After the account is deleted this device is no longer linked to anything.
    forget() {
      drop(OWNER_KEY);
      drop(DIRTY_KEY);
      for (const key of Object.keys(groupOf)) drop(REV_PREFIX + key);
    },
  };
})();
