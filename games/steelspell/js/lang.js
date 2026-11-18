// Texts. Every word the player sees comes from lang/<language>.json through t(); the tables
// in js/data hold only numbers. A text names the numbers it shows, "{radius}", and they are
// filled in from the tables, so a text never goes stale when the balance changes and a
// translator never touches a number.
//
// Placeholders follow ICU MessageFormat, a small part of it:
//   {name}                                          a parameter; numbers are written the local way
//   {n, plural, one {# meteor} other {# meteors}}   the form the language needs for n; # is n
//   {n, plural, =2 {Two copies} other {# copies}}   an exact value goes before the categories
//   {n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}   1st, 2nd, 3rd, 4th
// The categories are those of Intl.PluralRules: Russian has one, few and many (1 метеор,
// 2 метеора, 5 метеоров). There is no quoting: an apostrophe is just an apostrophe. In the
// start screen's hints, [Space] is a key on the keyboard. Whatever a translation lacks is
// taken from English.
//
// The texts are fetched before the game starts, so the page needs a web server (GitHub Pages
// or a local one): a page opened straight from a file cannot read them. The simulator's
// workers load no texts at all, and t() there gives back the key.

// To add a language, add lang/<id>.json and a line here. Each name is in its own language.
const LANGUAGES = [
  { id: 'en', name: 'English' },
];
const LANG_KEY = 'games.steelspell.lang';
const TEXTS_IN_WORKER = typeof importScripts === 'function';

let langId = 'en';
let texts = {}; // the language in use
let englishTexts = {};
const textParts = new Map(); // every text split into its parts once
let pluralRules = {};
let numberFormat = null;

// ---- Loading ----

function savedLanguage() {
  try { return localStorage.getItem(LANG_KEY); } catch (e) { return null; }
}

// The language picked in the menu, else the first of the browser's that the game has.
function pickLanguage() {
  const known = id => LANGUAGES.some(l => l.id === id);
  const saved = savedLanguage();
  if (known(saved)) return saved;
  for (const tag of navigator.languages || [navigator.language || 'en']) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (known(base)) return base;
  }
  return 'en';
}

function fetchTexts(id) {
  return fetch(`lang/${id}.json`, { cache: 'no-cache' })
    .then(response => (response.ok ? response.json() : null))
    .catch(() => null);
}

// Resolves to true once English is in, and the language asked for if it is another one.
async function loadTexts(id = pickLanguage()) {
  const english = await fetchTexts('en');
  englishTexts = english || {};
  texts = id === 'en' ? englishTexts : (await fetchTexts(id)) || {};
  langId = id;
  textParts.clear();
  pluralRules = {};
  numberFormat = null;
  document.documentElement.lang = id;
  return !!english;
}

// The menu's choice is remembered for the next visit.
function setLanguage(id) {
  try { localStorage.setItem(LANG_KEY, id); } catch (e) { /* private mode etc. */ }
  return loadTexts(id);
}

const textsReady = TEXTS_IN_WORKER ? Promise.resolve(false) : loadTexts();

// ---- Looking up and filling in ----

function lookupText(table, key) {
  let node = table;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

function rawText(key) {
  const own = lookupText(texts, key);
  return own !== undefined ? own : lookupText(englishTexts, key);
}

function hasText(key) { return typeof rawText(key) === 'string'; }

// The text under `key` with `params` filled in. A text that is missing shows its key, and a
// missing parameter its placeholder, so that a gap is easy to spot.
function t(key, params = {}) {
  const raw = rawText(key);
  return typeof raw === 'string' ? fillText(raw, params) : key;
}

// A list of texts kept under one key, each filled in.
function textList(key, params = {}) {
  const raw = rawText(key);
  return Array.isArray(raw) ? raw.map(line => fillText(String(line), params)) : [];
}

function fillText(raw, params) {
  let parts = textParts.get(raw);
  if (!parts) textParts.set(raw, (parts = splitText(raw)));
  return joinParts(parts, params);
}

function formatNumber(n) {
  if (!numberFormat) numberFormat = new Intl.NumberFormat(langId, { maximumFractionDigits: 2 });
  return numberFormat.format(n);
}

// With exactly `digits` digits after the point: 0.0, 1.5.
function formatFixed(n, digits) {
  return new Intl.NumberFormat(langId, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

function pluralOf(n, ordinal) {
  const type = ordinal ? 'ordinal' : 'cardinal';
  if (!pluralRules[type]) pluralRules[type] = new Intl.PluralRules(langId, { type });
  return pluralRules[type].select(n);
}

// "A, B or C", the way the language says it.
function orList(list) {
  if (typeof Intl.ListFormat !== 'function') return list.join(', ');
  return new Intl.ListFormat(langId, { type: 'disjunction' }).format(list);
}

// Where the brace opened at `from` closes, or -1.
function closingBrace(src, from) {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

// A text as a list of parts: plain strings, placeholders, and # (the number of the plural
// it stands in; anywhere else it is just #).
function splitText(src) {
  const parts = [];
  let plain = '';
  const flush = () => {
    if (plain) parts.push(plain);
    plain = '';
  };
  for (let i = 0; i < src.length; i++) {
    const end = src[i] === '{' ? closingBrace(src, i) : -1;
    if (end > i) {
      flush();
      parts.push(placeholder(src.slice(i + 1, end)));
      i = end;
    } else if (src[i] === '#') {
      flush();
      parts.push({ hash: true });
    } else {
      plain += src[i];
    }
  }
  flush();
  return parts;
}

// "name", or "name, plural, one {...} other {...}" (or selectordinal).
function placeholder(body) {
  const first = body.indexOf(',');
  if (first < 0) return { name: body.trim() };
  const second = body.indexOf(',', first + 1);
  const name = body.slice(0, first).trim();
  const type = body.slice(first + 1, second < 0 ? body.length : second).trim();
  if (second < 0 || (type !== 'plural' && type !== 'selectordinal')) return { name };
  const options = {};
  const src = body.slice(second + 1);
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    const end = open < 0 ? -1 : closingBrace(src, open);
    if (end < 0) break;
    options[src.slice(i, open).trim()] = splitText(src.slice(open + 1, end));
    i = end + 1;
  }
  return { name, ordinal: type === 'selectordinal', options };
}

function joinParts(parts, params, hash) {
  let out = '';
  for (const p of parts) {
    if (typeof p === 'string') {
      out += p;
    } else if (p.hash) {
      out += hash === undefined ? '#' : hash;
    } else if (p.options) {
      const n = Number(params[p.name]);
      const branch = p.options[`=${n}`] || p.options[pluralOf(n, p.ordinal)] || p.options.other;
      if (branch) out += joinParts(branch, params, formatNumber(n));
    } else {
      const value = params[p.name];
      out += value === undefined ? `{${p.name}}` : typeof value === 'number' ? formatNumber(value) : String(value);
    }
  }
  return out;
}

// ---- What things are called ----

function defKey(def) { return `${def.needs ? 'merges' : 'weapons'}.${def.id}`; }
function nameOf(def) { return t(`${defKey(def)}.name`); }
function tagOf(def) { return t(`${defKey(def)}.tag`); }
function blurbOf(def) { return t(`${defKey(def)}.blurb`, flatNumbers(def)); }
function kindName(kind) { return t(`kinds.${kind}`); }
function statName(key) { return t(`stats.${key}.name`); }
function statNames(keys) { return keys.map(statName).join(', '); }
function usesText(def) { return t('ui.uses', { stats: statNames(def.scales) }); }
function evoName(evo) { return t(`evolutions.${evo.id}.name`); }
function evoNameOf(weaponId, evoId) { return evoName((EVOLUTIONS[weaponId] || []).find(e => e.id === evoId) || { id: evoId }); }
function evoBlurb(def, evo) { return t(`evolutions.${evo.id}.blurb`, stepParams(def, evo)); }
// What an evolution hands on to `merge`, the merged weapon it goes into.
function inheritText(evo, merge) {
  return t(`evolutions.${evo.id}.inherit.${merge.id}`, stepParams(merge, evo.inherit[merge.id]));
}
function itemName(item) { return t(`items.${item.id}.name`); }
function itemText(item) { return t(`items.${item.id}.text`, itemParams(item)); }
function activeName(a) { return t(`actives.${a.id}.name`); }
function activeBlurb(a) { return t(`actives.${a.id}.blurb`, activeParams(a)); }
// An active skill's cooldown and the weapon it brings, as its button on the start screen says.
function activeNote(a) {
  const weapon = WEAPON_DEFS.find(d => d.id === a.freeWeapon);
  return weapon ? t('start.activeNote', { seconds: a.cooldown, weapon: nameOf(weapon) }) : t('start.cooldown', { seconds: a.cooldown });
}

// The weapon an active skill brings, then its own passive.
function activePassive(a) {
  const params = activeParams(a);
  const parts = a.freeWeapon ? [t('actives.freeWeapon', params)] : [];
  if (hasText(`actives.${a.id}.passive`)) parts.push(t(`actives.${a.id}.passive`, params));
  return parts.join(' ');
}
function campText(up) {
  return t(`camp.upgrades.${up.id}.text`, { amount: SHARE_GIVES.has(up.gives) ? percent(up.amount) : up.amount });
}

// ---- The numbers a text shows ----

// Fields that hold a share (shown as a percent), an angle (shown in degrees), or the time
// between two things (a step that multiplies one makes them come that much more often).
const SHARE_FIELDS = new Set(['slow', 'fork', 'hpShare', 'chillGrow', 'chillMax', 'eliteSlow', 'armorScale', 'share', 'critBoost', 'rageRegen']);
const ANGLE_FIELDS = new Set(['cone', 'sweep']);
const PERIOD_FIELDS = new Set(['tick', 'dropEvery']);
// What items, the Camp and the active skills give: these are shares, the rest are amounts.
const SHARE_GIVES = new Set([
  ...Object.keys(STATS).filter(key => !['count', 'armor', 'recovery'].includes(key)),
  'regen', 'pureShare', 'hpToAttack', 'physDamage', 'magicDamage', 'fireDamage', 'attackPerLevel',
  'chestLuck', 'enemyHp', 'echo', 'ricochet', 'armorPenPct', 'magicPenPct', 'weakSpot', 'glory',
]);

function percent(share) { return Math.round(share * 1000) / 10; }

function fieldNumber(path, value) {
  const field = path.slice(path.lastIndexOf('.') + 1);
  if (SHARE_FIELDS.has(field)) return percent(value);
  if (ANGLE_FIELDS.has(field)) return Math.round(value * 180 / Math.PI);
  return value;
}

// Every number in a table, flat: { crater: { life: 5 } } gives 'crater.life'.
function flatNumbers(table, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(table || {})) {
    const path = prefix + key;
    if (typeof value === 'number') out[path] = fieldNumber(path, value);
    else if (value && typeof value === 'object' && !Array.isArray(value)) flatNumbers(value, `${path}.`, out);
  }
  return out;
}

// What a step of a weapon `def` (a level, an evolution, what it hands on) talks about: what it
// adds or sets, each multiplier as the share it adds (for a time between two things, how
// much more often), the stats it raises, and `was.<field>`, the weapon's number before.
// Shares are given without a sign: the text says which way they go.
function stepParams(def, step) {
  const out = flatNumbers(def, 'was.');
  Object.assign(out, flatNumbers(step.add), flatNumbers(step.set));
  for (const [path, value] of Object.entries(step.mul || {})) {
    const field = path.slice(path.lastIndexOf('.') + 1);
    out[path] = Math.round(PERIOD_FIELDS.has(field) ? (1 / value - 1) * 100 : Math.abs(value - 1) * 100);
  }
  for (const key of ['damage', 'size', 'haste', 'duration']) if (step[key]) out[key] = percent(Math.abs(step[key]));
  if (step.count) out.count = step.count;
  return out;
}

// Ability Haste also says how much shorter the cooldown gets: `abilityHaste.cut`.
function givesParams(gives, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(gives || {})) out[prefix + key] = SHARE_GIVES.has(key) ? percent(value) : value;
  if (gives && gives.abilityHaste) out[`${prefix}abilityHaste.cut`] = Math.round(abilityHasteCut(gives.abilityHaste) * 100);
  return out;
}

// Numbers that some texts take from the rules of the game rather than from their own row.
function ruleParams() {
  return {
    chestSlots: CHEST_SLOTS, levelCards: LEVEL_CARDS.slots,
    'weakSpot.every': WEAK_SPOT.every, 'weakSpot.time': WEAK_SPOT.time,
    'secondWind.below': percent(SECOND_WIND.below), 'secondWind.safe': SECOND_WIND.safe,
  };
}

function itemParams(item) {
  const out = Object.assign(ruleParams(), givesParams(item.gives));
  out.cardsWith = LEVEL_CARDS.slots + (item.gives.cardSlots || 0);
  return out;
}

// Berserk's buff multiplies most stats but adds to Haste and Count, as weaponStat() does.
function activeParams(a) {
  const out = Object.assign(ruleParams(), flatNumbers(a), givesParams(a.gives, 'gives.'));
  for (const [key, value] of Object.entries(a.buff || {})) {
    out[`buff.${key}`] = key === 'count' ? value : percent(key === 'haste' ? value : value - 1);
  }
  if (a.freeWeapon) out.weapon = nameOf(WEAPON_DEFS.find(d => d.id === a.freeWeapon));
  return out;
}
