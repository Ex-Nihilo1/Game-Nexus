// The pages' link to the server: who is signed in, and reporting finished games.
// Load it after theme.js. It does nothing for guests or when the page is opened
// from a file, so the games work exactly as before without an account.

const Nexus = (function () {
  const root = new URL('../', document.currentScript.src).href;
  const online = location.protocol === 'http:' || location.protocol === 'https:';
  const PENDING_KEY = 'nexus.pending';

  async function call(method, path, body) {
    if (!online) return { ok: false, status: 0, data: { error: 'Open Game Nexus from its server to use accounts.' } };
    try {
      const res = await fetch(root + 'api/' + path, {
        method,
        headers: body === undefined ? { 'X-Nexus': '1' } : { 'Content-Type': 'application/json', 'X-Nexus': '1' },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
      });
      let data = null;
      try { data = await res.json(); } catch (e) { /* empty or not JSON */ }
      return { ok: res.ok, status: res.status, data: data || {} };
    } catch (e) {
      return { ok: false, status: 0, data: { error: 'The server cannot be reached.' } };
    }
  }

  // ---- The signed-in user ----

  let user = null;
  const userReady = call('GET', 'me').then(r => {
    user = r.ok ? r.data.user : null;
    return user;
  });

  // Pages that sign in or out tell the others on this page through this event.
  function setUser(next) {
    user = next;
    document.dispatchEvent(new CustomEvent('nexususer', { detail: user }));
  }

  // ---- Runs ----

  let run = null; // { game, id: a promise of the run token or null }
  let currentId = null; // the same token once it has arrived

  function startRun(game) {
    currentId = null;
    const id = userReady.then(u => (u ? call('POST', 'runs', { game }) : null))
      .then(r => (r && r.ok ? r.data.id : null));
    run = { game, id };
    id.then(value => { if (run && run.id === id) currentId = value; });
    return id;
  }

  // A run continued from a save keeps the token it began with.
  function resumeRun(game, id) {
    currentId = id || null;
    run = { game, id: Promise.resolve(currentId) };
  }

  function runId() { return currentId; }

  async function finishRun(stats) {
    const current = run;
    run = null;
    currentId = null;
    if (!current) return null;
    const id = await current.id;
    if (!id) return null;
    const r = await call('POST', `runs/${id}/finish`, { stats });
    if (r.ok) return r.data;
    // Out of reach for now: try again on a later page.
    if (r.status === 0 || r.status >= 500) queue({ id, stats });
    return null;
  }

  function loadPending() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch (e) { return []; }
  }
  function savePending(list) {
    try {
      if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-20)));
      else localStorage.removeItem(PENDING_KEY);
    } catch (e) { /* private mode etc. */ }
  }
  function queue(item) { savePending([...loadPending(), item]); }

  async function sendPending() {
    const list = loadPending();
    if (!list.length) return;
    const left = [];
    for (const item of list) {
      const r = await call('POST', `runs/${item.id}/finish`, { stats: item.stats });
      if (r.status === 0 || r.status >= 500) left.push(item);
    }
    savePending(left);
  }
  userReady.then(u => { if (u) sendPending(); });

  // ---- End screens ----

  function formatValue(value, unit) {
    if (unit === 'speed') return `${value.toFixed(2)} clicks/s`;
    if (unit === 'seconds') {
      if (value < 60) return `${value.toFixed(1)} s`;
      const s = Math.floor(value);
      const h = Math.floor(s / 3600);
      const mm = String(Math.floor(s / 60) % 60).padStart(h ? 2 : 1, '0');
      return `${h ? h + ':' : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
    }
    return Math.round(value).toLocaleString('en-US');
  }

  // What an end screen says about the server's answer: one line per board, or a
  // reminder to confirm the email. Empty for guests.
  function rankLines(answer) {
    if (!answer) return [];
    if (!answer.named) return ['Choose a display name to appear on the leaderboards.'];
    return (answer.ranks || []).map(r =>
      `${r.isNew ? 'New best: ' : ''}#${r.rank} on ${r.title} (${formatValue(r.value, r.unit)})`);
  }

  return {
    root, online, call, user: () => user, userReady, setUser,
    startRun, resumeRun, finishRun,
    runId,
    rankLines, formatValue,
  };
})();

