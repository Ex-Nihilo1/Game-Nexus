// Theme switching shared by every page.
// Load it in <head> (not deferred) so the saved colors apply before first paint.
// Fills any .theme-controls element with the scheme swatches and the light/dark toggle,
// and fires a "themechange" event on document whenever the colors change.

const Theme = (function () {
  const SCHEMES = [
    { id: 'blueprint', name: 'Blueprint' },
    { id: 'graphite', name: 'Graphite' },
    { id: 'engineering', name: 'Engineering' },
    { id: 'sepia', name: 'Sepia' },
  ];
  const PEN_NAMES = ['desk', 'paper', 'rule', 'ink', 'ink-muted', 'red-pencil', 'highlighter',
    'violet', 'green-ink', 'blue-pen', 'orange-pen', 'hover', 'grid-minor', 'grid-major'];
  const SCHEME_KEY = 'games.scheme';
  const MODE_KEY = 'games.mode';

  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const root = document.documentElement;

  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode etc. */ }
  }

  let scheme = load(SCHEME_KEY);
  if (!SCHEMES.some(s => s.id === scheme)) scheme = 'blueprint';
  let mode = load(MODE_KEY) || 'auto'; // 'auto' follows the system

  function resolvedMode() {
    if (mode !== 'auto') return mode;
    return media && media.matches ? 'dark' : 'light';
  }

  function apply() {
    root.dataset.scheme = scheme;
    root.dataset.theme = resolvedMode();
    updateControls();
    document.dispatchEvent(new Event('themechange'));
  }

  function setScheme(id) {
    scheme = id;
    save(SCHEME_KEY, id);
    apply();
  }

  function toggleMode() {
    mode = resolvedMode() === 'dark' ? 'light' : 'dark';
    save(MODE_KEY, mode);
    apply();
  }

  // Current pen colors as hex strings, for drawing on canvases.
  function palette() {
    const style = getComputedStyle(root);
    const pens = {};
    for (const name of PEN_NAMES) pens[name] = style.getPropertyValue('--' + name).trim();
    return pens;
  }

  function buildControls() {
    document.querySelectorAll('.theme-controls').forEach(box => {
      box.textContent = '';
      for (const s of SCHEMES) {
        const b = document.createElement('button');
        b.className = 'swatch';
        b.dataset.scheme = s.id;
        b.title = s.name;
        b.setAttribute('aria-label', s.name + ' colors');
        b.addEventListener('click', () => setScheme(s.id));
        box.appendChild(b);
      }
      const toggle = document.createElement('button');
      toggle.className = 'mode-toggle';
      toggle.addEventListener('click', toggleMode);
      box.appendChild(toggle);
    });
    updateControls();
  }

  // Light/dark toggle icons, drawn in the button's ink color.
  const ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
    'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  const SUN_ICON = ICON + '<circle cx="8" cy="8" r="3"/>' +
    '<path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>';
  const MOON_ICON = ICON + '<path d="M13.5 9.6A5.5 5.5 0 1 1 6.4 2.5a4.5 4.5 0 0 0 7.1 7.1z"/></svg>';

  function updateControls() {
    document.querySelectorAll('.swatch').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.scheme === scheme));
    });
    const dark = resolvedMode() === 'dark';
    document.querySelectorAll('.mode-toggle').forEach(b => {
      b.innerHTML = dark ? SUN_ICON : MOON_ICON;
      b.title = dark ? 'Switch to light' : 'Switch to dark';
      b.setAttribute('aria-label', b.title);
    });
  }

  // Each swatch previews its scheme's paper and ink, whatever the current scheme is.
  const SWATCH_COLORS = {
    blueprint: ['#EEF2EF', '#1E2B45', '#1A3150', '#E8EFF7'],
    graphite: ['#F2F2F0', '#2A2A2E', '#26282C', '#E6E6E3'],
    engineering: ['#ECF3E8', '#1F3B2A', '#15291F', '#CFF5DC'],
    sepia: ['#F6EFE0', '#3B2A1A', '#2A2019', '#F2DFC0'],
  };
  const swatchStyle = document.createElement('style');
  swatchStyle.textContent = SCHEMES.map(s => {
    const [lp, li, dp, di] = SWATCH_COLORS[s.id];
    return `.swatch[data-scheme="${s.id}"] { background: linear-gradient(135deg, ${lp} 50%, ${li} 50%); }` +
      `[data-theme="dark"] .swatch[data-scheme="${s.id}"] { background: linear-gradient(135deg, ${dp} 50%, ${di} 50%); }`;
  }).join('\n');
  document.head.appendChild(swatchStyle);

  if (media) {
    const onSystemChange = () => { if (mode === 'auto') apply(); };
    if (media.addEventListener) media.addEventListener('change', onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);
  }

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildControls);
  else buildControls();

  return { palette, setScheme, toggleMode, SCHEMES };
})();
