// Games shown on the menu. To add a game: make games/<id>/index.html and add an entry here.
// `thumb` is a small SVG (80x80) drawn with the theme's pens via style="fill: var(--pen)".

// Game Nexus version, MAJOR.MINOR.PATCH: major = big overhaul or lost saves,
// minor = a new game or feature, patch = fixes and tweaks. Tag releases vX.Y.Z.
const NEXUS_VERSION = '1.0.1';

const GAMES = [
  {
    id: 'tetris',
    name: 'Tetris',
    blurb: 'Stack falling pieces and clear lines. Speeds up every 10 lines.',
    href: 'games/tetris/index.html',
    thumb:
      '<svg viewBox="0 0 80 80" aria-hidden="true">' +
      cells('var(--violet)', [[2, 1], [3, 1], [4, 1], [3, 2]]) +
      cells('var(--blue-pen)', [[0, 6], [1, 6], [2, 6], [3, 6]]) +
      cells('var(--orange-pen)', [[4, 4], [4, 5], [4, 6], [5, 6]]) +
      cells('var(--green-ink)', [[6, 3], [7, 3], [5, 4], [6, 4]]) +
      cells('var(--highlighter)', [[0, 4], [1, 4], [0, 5], [1, 5]]) +
      '</svg>',
  },
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    blurb: 'Open every safe square without touching a mine. Three board sizes.',
    href: 'games/minesweeper/index.html',
    thumb:
      '<svg viewBox="0 0 80 80" aria-hidden="true">' +
      '<g style="font: 600 16px Bahnschrift, sans-serif" text-anchor="middle">' +
      '<text x="20" y="26" style="fill: var(--blue-pen)">1</text>' +
      '<text x="40" y="26" style="fill: var(--green-ink)">2</text>' +
      '<text x="20" y="46" style="fill: var(--red-pencil)">3</text>' +
      '</g>' +
      '<rect x="51" y="11" width="18" height="18" style="fill: var(--desk); stroke: var(--rule)"/>' +
      '<rect x="31" y="31" width="18" height="18" style="fill: var(--desk); stroke: var(--rule)"/>' +
      '<rect x="51" y="31" width="18" height="18" style="fill: var(--desk); stroke: var(--rule)"/>' +
      '<rect x="11" y="51" width="58" height="18" style="fill: var(--desk); stroke: var(--rule)"/>' +
      '<line x1="57" y1="14" x2="57" y2="26" style="stroke: var(--ink); stroke-width: 1.5"/>' +
      '<path d="M57 14 L65 17.5 L57 21 Z" style="fill: var(--red-pencil)"/>' +
      '<circle cx="40" cy="40" r="4.5" style="fill: var(--ink)"/>' +
      '</svg>',
  },
  {
    id: 'towerdefense',
    name: 'Tower Defense',
    blurb: 'Hold the road on four maps. Build, upgrade, mint gold, and repair what raiders break.',
    href: 'games/towerdefense/index.html',
    thumb:
      '<svg viewBox="0 0 80 80" aria-hidden="true">' +
      '<path d="M0 20 H60 V60 H80" style="fill: none; stroke: var(--rule); stroke-width: 14"/>' +
      '<path d="M0 20 H60 V60 H80" style="fill: none; stroke: var(--desk); stroke-width: 12"/>' +
      '<rect x="14" y="36" width="20" height="20" style="fill: var(--paper); stroke: var(--ink)"/>' +
      '<line x1="24" y1="46" x2="24" y2="32" style="stroke: var(--ink); stroke-width: 2.5"/>' +
      '<circle cx="24" cy="46" r="6" style="fill: var(--blue-pen); stroke: var(--ink)"/>' +
      '<rect x="40" y="56" width="16" height="16" style="fill: var(--paper); stroke: var(--ink)"/>' +
      '<circle cx="48" cy="64" r="5" style="fill: var(--highlighter); stroke: var(--ink)"/>' +
      '<circle cx="46" cy="20" r="5.5" style="fill: var(--green-ink); stroke: var(--ink)"/>' +
      '<path d="M60 26 L66 34 L60 42 L54 34 Z" style="fill: var(--red-pencil); stroke: var(--ink)"/>' +
      '</svg>',
  },
  {
    id: 'chronomancer',
    name: 'Chronomancer',
    blurb: 'Build a town between waves, hold the wall, and carry blueprints across time loops.',
    href: 'games/chronomancer/index.html',
    thumb:
      '<svg viewBox="0 0 80 80" aria-hidden="true">' +
      '<path d="M8 72 V58 H16 V52 H24 V58 H36 V52 H44 V58 H56 V52 H64 V58 H72 V72 Z" style="fill: var(--desk); stroke: var(--ink)"/>' +
      '<path d="M29 9 H51 L42 27 L51 45 H29 L38 27 Z" style="fill: var(--paper); stroke: var(--violet); stroke-width: 1.5"/>' +
      '<path d="M33 12 H47 L40 25 Z" style="fill: var(--highlighter)"/>' +
      '<path d="M33 45 L40 37 L47 45 Z" style="fill: var(--highlighter)"/>' +
      '<line x1="40" y1="26" x2="40" y2="38" style="stroke: var(--orange-pen); stroke-width: 1.5"/>' +
      '<rect x="25" y="5" width="30" height="4" style="fill: var(--ink)"/>' +
      '<rect x="25" y="45" width="30" height="4" style="fill: var(--ink)"/>' +
      '</svg>',
  },
  {
    id: 'steelspell',
    name: 'Steel &amp; Spell',
    blurb: 'Survive the horde for as long as you can. Level your weapons, evolve them, merge them, and dodge what the horde throws back.',
    href: 'games/steelspell/index.html',
    thumb:
      '<svg viewBox="0 0 80 80" aria-hidden="true">' +
      '<line x1="60" y1="60" x2="22" y2="22" style="stroke: var(--violet); stroke-width: 3"/>' +
      '<circle cx="19" cy="19" r="7" style="fill: var(--highlighter); stroke: var(--ink)"/>' +
      '<line x1="20" y1="60" x2="58" y2="22" style="stroke: var(--orange-pen); stroke-width: 4"/>' +
      '<line x1="14" y1="52" x2="28" y2="66" style="stroke: var(--ink); stroke-width: 3"/>' +
      '<circle cx="40" cy="66" r="4" style="fill: var(--ink-muted); stroke: var(--ink)"/>' +
      '<circle cx="66" cy="42" r="4" style="fill: var(--ink-muted); stroke: var(--ink)"/>' +
      '<rect x="62" y="62" width="9" height="9" style="fill: var(--ink-muted); stroke: var(--orange-pen); stroke-width: 2"/>' +
      '</svg>',
  },
];

// 10px squares on the 80px thumbnail, outlined in ink.
function cells(fill, coords) {
  return coords.map(([x, y]) =>
    `<rect x="${x * 10 + 1}" y="${y * 10 + 1}" width="9" height="9" ` +
    `style="fill: ${fill}; stroke: var(--ink); stroke-width: .75"/>`
  ).join('');
}
