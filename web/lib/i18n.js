// The language of every page: English or Russian. Load it first in <head>, then the
// dictionaries (i18n-ru.js, a game's own ru.js), then theme.js.
//
// Text is written in the code in its own language and doubles as the key: tr('Sign in')
// gives 'Войти' in Russian and 'Sign in' in English. Chronomancer is written in Russian
// and has an English dictionary; the lookup is the same both ways. Whatever a dictionary
// lacks shows as written. {name} in a text is filled from `vars`; an entry may also be a
// function of `vars`, for plurals and word order.
//
// Static HTML is marked:
//   data-i18n             the element's text
//   data-i18n-html        its HTML (hints with <kbd>)
//   data-i18n-title, data-i18n-aria-label, data-i18n-placeholder   that attribute
//   data-i18n-all         every text node and title/aria-label/placeholder/alt under it
// The originals are kept, so a page that switches in place can switch back.
//
// The switch, EN and RU, goes into .theme-controls (theme.js asks for it) or into an
// element marked .lang-controls. Pages that can redraw themselves register
// I18n.onChange(fn); the others reload on a switch.

const I18n = (function () {
  const KEY = 'games.lang';
  const OLD_KEY = 'games.steelspell.lang'; // Steel & Spell's own choice, before the site had one
  const LANGS = [
    { id: 'en', name: 'English', short: 'EN', locale: 'en-US' },
    { id: 'ru', name: 'Русский', short: 'RU', locale: 'ru-RU' },
  ];
  const known = id => LANGS.some(l => l.id === id);
  const dicts = { en: {}, ru: {} };
  const listeners = [];
  const missing = new Set();
  const CYRILLIC = /[а-яё]/i;

  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function pick() {
    const saved = load(KEY) || load(OLD_KEY);
    if (known(saved)) return saved;
    for (const tag of navigator.languages || [navigator.language || 'en']) {
      if (String(tag).toLowerCase().startsWith('ru')) return 'ru';
    }
    return 'en';
  }

  let lang = pick();
  const info = () => LANGS.find(l => l.id === lang);
  document.documentElement.lang = lang;

  function add(id, entries) {
    Object.assign(dicts[id], entries);
    lowerIndex[id] = null;
    prefixes[id] = null;
  }

  function fill(text, vars) {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (all, name) => (name in vars ? String(vars[name]) : all));
  }

  // `key` in the language in use, `vars` filled in.
  function tr(key, vars) {
    if (key === null || key === undefined || key === '') return key;
    key = String(key);
    let entry = dicts[lang][key];
    if (entry === undefined) {
      // Numbers and signs need no translation; words written in the other language do.
      const source = CYRILLIC.test(key) ? 'ru' : /[a-z]/i.test(key) ? 'en' : lang;
      if (source !== lang) missing.add(key);
      entry = key;
    }
    return typeof entry === 'function' ? entry(vars || {}) : fill(entry, vars);
  }

  // A key the dictionary may not have: the translation if there is one, else null.
  function has(key) { return dicts[lang][String(key)] !== undefined; }

  // ---- Text as a page shows it ----
  // Chronomancer builds its sentences from pieces and numbers. Its dictionary is keyed by
  // whole sentences with every number as {0}, {1}... and every «quoted» name as «{q0}»,
  // and a line made of several sentences or ' · ' parts is translated part by part.

  const NUMBER = /\d+(?:[\u00a0\u202f ]\d{3})*(?:[.,]\d+)?/g;
  // Tried in turn: sentences, then ' · ' parts, then 'label: value', then lists.
  const SPLITS = [/((?<=[.!?]) )/, /( · | — | – | \/ )/, /(: )/, /(, |; )/];
  const otherScript = () => (lang === 'en' ? CYRILLIC : /[a-z]/i);
  const lowerIndex = { en: null, ru: null }; // lower-case key -> key, for labels in capitals
  const prefixes = { en: null, ru: null }; // keys ending in {s}: a phrase, then a name

  // A number as written in the source, in the language in use.
  function localNumber(text) {
    if (lang !== 'en') return text;
    return text.replace(/[\u00a0\u202f ](?=\d{3})/g, ',').replace(/,(?=\d{1,2}$)/, '.');
  }

  function lookupText(text) {
    const found = lookupExact(text);
    if (found !== null) return found;
    // A label in capitals: the same words in the dictionary, put in capitals.
    if (text === text.toUpperCase() && text !== text.toLowerCase()) {
      if (!lowerIndex[lang]) {
        lowerIndex[lang] = new Map(Object.keys(dicts[lang]).map(k => [k.toLowerCase(), k]));
      }
      const key = lowerIndex[lang].get(text.toLowerCase());
      if (key !== undefined && key !== text) {
        const upper = lookupExact(key);
        if (upper !== null) return upper.toUpperCase();
      }
    }
    // A phrase followed by a name: "Увеличить {s}".
    if (!prefixes[lang]) {
      prefixes[lang] = Object.keys(dicts[lang]).filter(k => k.endsWith('{s}')).map(k => k.slice(0, -3));
    }
    for (const prefix of prefixes[lang]) {
      if (!text.startsWith(prefix) || text.length === prefix.length) continue;
      const rest = text.slice(prefix.length);
      const name = translateText(rest);
      if (name !== null) return fill(String(dicts[lang][prefix + '{s}']), { s: name });
    }
    return null;
  }

  function lookupExact(text) {
    const exact = dicts[lang][text];
    if (exact !== undefined) return typeof exact === 'function' ? exact({}) : exact;
    const quotes = [];
    const nums = [];
    const key = text
      .replace(/«([^»]*)»/g, (all, inner) => `«{q${quotes.push(inner) - 1}}»`)
      .replace(NUMBER, n => `{${nums.push(n) - 1}}`);
    if (key === text) return null;
    const entry = dicts[lang][key];
    if (entry === undefined) return null;
    const vars = {};
    nums.forEach((n, i) => { vars[i] = localNumber(n); });
    quotes.forEach((q, i) => { vars['q' + i] = translateText(q) || q; });
    return typeof entry === 'function' ? entry(vars) : fill(entry, vars);
  }

  // The translation of a whole line, or null when some part of it is not known. The
  // line is tried whole, then without the punctuation around it, then split.
  function translateText(raw, level = 0) {
    const text = raw.trim().replace(/\s+/g, ' ');
    if (!text || !otherScript().test(text)) return text;
    const whole = lookupText(text);
    if (whole !== null) return whole;
    const m = /^([—–·:,.\s]*)(.*?)([.!?:,;\s]*)$/.exec(text);
    if (m[1]) {
      const rest = lookupText(m[2] + m[3]);
      if (rest !== null) return m[1] + rest;
    }
    if (m[1] || m[3]) {
      const core = lookupText(m[2]);
      if (core !== null) return m[1] + core + m[3];
    }
    for (let l = level; l < SPLITS.length; l++) {
      const parts = text.split(SPLITS[l]);
      if (parts.length < 2) continue;
      let known = true;
      const out = parts.map((part, i) => {
        if (i % 2 || !otherScript().test(part)) return part;
        const found = translateText(part, l + 1);
        if (found === null) known = false;
        return found;
      });
      if (known) return out.join('');
    }
    return null;
  }

  // A text node or attribute value as the page shows it, translated where possible.
  function translateShown(value) {
    if (!otherScript().test(value)) return value;
    const found = translateText(value);
    if (found === null) {
      missing.add(value.trim().replace(/\s+/g, ' ').replace(NUMBER, n => '{#}'));
      return value;
    }
    const m = /^(\s*)[\s\S]*?(\s*)$/.exec(value);
    return m[1] + found + m[2];
  }

  // The form a number takes: Russian has one, few and many (1 очко, 2 очка, 5 очков);
  // English one and other (`few` is then the plural, `many` unused).
  function plural(n, one, few, many) {
    const abs = Math.abs(Math.trunc(n));
    if (lang !== 'ru') return abs === 1 ? one : few;
    const ten = abs % 10;
    const hundred = abs % 100;
    if (ten === 1 && hundred !== 11) return one;
    if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return few;
    return many;
  }

  function num(n, options) { return Number(n).toLocaleString(info().locale, options); }
  function date(d, options) { return new Date(d).toLocaleDateString(info().locale, options); }

  // ---- Static HTML ----

  const originals = new WeakMap(); // element or text node -> what it said as written
  const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];

  function original(node, field, now) {
    let o = originals.get(node);
    if (!o) originals.set(node, (o = {}));
    if (!(field in o)) o[field] = now;
    return o[field];
  }

  // A text as written, in the language in use: back to the original when that is the
  // language, else its translation.
  function trPadded(text) {
    return otherScript().test(text) ? translateShown(text) : text;
  }

  function applyAll(rootEl) {
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.parentElement && /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentElement.tagName)
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const text = original(n, 'text', n.nodeValue);
      const next = trPadded(text);
      if (n.nodeValue !== next) n.nodeValue = next;
    }
    for (const el of [rootEl, ...rootEl.querySelectorAll('*')]) {
      for (const attr of ATTRS) {
        if (!el.hasAttribute || !el.hasAttribute(attr)) continue;
        el.setAttribute(attr, trPadded(original(el, attr, el.getAttribute(attr))));
      }
    }
  }

  // data-i18n-live: whatever the page's script writes under the element later is
  // translated as it appears (Chronomancer). Such a page reloads on a switch.
  function watch(rootEl) {
    const fixText = n => {
      const next = translateShown(n.nodeValue);
      if (next !== n.nodeValue) n.nodeValue = next;
    };
    const fixAttrs = el => {
      for (const attr of ATTRS) {
        if (!el.hasAttribute(attr)) continue;
        const value = el.getAttribute(attr);
        const next = translateShown(value);
        if (next !== value) el.setAttribute(attr, next);
      }
    };
    const fixTree = node => {
      if (node.nodeType === Node.TEXT_NODE) return fixText(node);
      if (node.nodeType !== Node.ELEMENT_NODE || /^(SCRIPT|STYLE)$/.test(node.tagName)) return;
      fixAttrs(node);
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) fixText(n);
        else fixAttrs(n);
      }
    };
    new MutationObserver(records => {
      for (const r of records) {
        if (r.type === 'characterData') fixText(r.target);
        else if (r.type === 'attributes') fixAttrs(r.target);
        else r.addedNodes.forEach(fixTree);
      }
    }).observe(rootEl, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    fixTree(rootEl);
  }

  function apply(rootEl = document) {
    rootEl.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = tr(original(el, 'text', el.getAttribute('data-i18n') || el.textContent.trim().replace(/\s+/g, ' ')));
    });
    rootEl.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = tr(original(el, 'html', el.innerHTML.trim().replace(/\s+/g, ' ')));
    });
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      rootEl.querySelectorAll(`[data-i18n-${attr}]`).forEach(el => {
        el.setAttribute(attr, tr(original(el, attr, el.getAttribute(attr) || '')));
      });
    }
    rootEl.querySelectorAll('[data-i18n-all]').forEach(applyAll);
    if (rootEl === document) {
      document.title = tr(original(document.documentElement, 'title', document.title));
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.content = tr(original(meta, 'content', meta.content));
    }
  }

  // ---- The switch ----

  function switchControl() {
    const box = document.createElement('span');
    box.className = 'lang-switch';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', tr('Language'));
    for (const l of LANGS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lang-btn';
      b.dataset.lang = l.id;
      b.textContent = l.short;
      b.title = l.name;
      b.lang = l.id;
      b.setAttribute('aria-label', l.name);
      b.setAttribute('aria-pressed', String(l.id === lang));
      b.addEventListener('click', () => set(l.id));
      box.appendChild(b);
    }
    return box;
  }

  function updateSwitches() {
    document.querySelectorAll('.lang-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    document.querySelectorAll('.lang-switch').forEach(b => b.setAttribute('aria-label', tr('Language')));
  }

  // Switches the language. `remember` is false when the account brought the choice.
  function set(id, remember = true) {
    if (!known(id) || id === lang) return;
    if (remember) {
      try { localStorage.setItem(KEY, id); } catch (e) { /* private mode etc. */ }
    }
    if (!listeners.length) {
      location.reload();
      return;
    }
    lang = id;
    missing.clear();
    document.documentElement.lang = lang;
    apply();
    updateSwitches();
    // The shared parts (the header, the account menu) redraw on this event.
    document.dispatchEvent(new Event('langchange'));
    for (const fn of listeners) fn(lang);
  }

  function onChange(fn) { listeners.push(fn); }

  function setup() {
    document.querySelectorAll('.lang-controls').forEach(box => {
      if (!box.querySelector('.lang-switch')) box.appendChild(switchControl());
    });
    apply();
    document.querySelectorAll('[data-i18n-live]').forEach(watch);
    // Steel & Spell kept its own choice before; it becomes the site's. Done here, once
    // sync.js is loaded, so the account hears of it.
    const old = load(OLD_KEY);
    if (old !== null) {
      try {
        if (!load(KEY) && known(old)) localStorage.setItem(KEY, old);
        localStorage.removeItem(OLD_KEY);
      } catch (e) { /* private mode etc. */ }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();

  // The account brought another device's choice.
  document.addEventListener('nexussync', e => {
    if ((e.detail || []).includes(KEY)) set(load(KEY), false);
  });

  return {
    get lang() { return lang; },
    get locale() { return info().locale; },
    LANGS, add, tr, has, plural, num, date, apply, set, onChange, switchControl,
    missing,
  };
})();

const tr = I18n.tr;

// Each language's name is written in that language everywhere.
I18n.add('en', { 'Русский': 'Русский' });
I18n.add('ru', { 'English': 'English' });
