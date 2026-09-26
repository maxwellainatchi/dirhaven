// ───────────────────────── themes.js ─────────────────────────
// Each tag maps to a visual district style. Mood then shifts the palette.

const TH = {};

TH.LEVELS = ['Region', 'Town', 'District', 'Building', 'Room'];

// ground: base outdoor ground · road: street surface · border: map edge
// floor: indoor floor pattern · decor: weighted outdoor props · roof: roof shape
TH.STYLES = {
  plain:      { ground: 'grass',  road: 'dirt',    border: 'forest', floor: 'wood',    roof: 'pitched', window: 'small',  c: { g: '#5f9c4c', a: '#d9a441', wall: '#dccaa4', roof: '#a4553a', floor: '#a8764a', paper: '#c9b48a' }, decor: [['tree_round', 4], ['bush', 3], ['flowers', 2], ['rock', 1], ['lamp', 1]] },
  technology: { ground: 'paved',  road: 'asphalt', border: 'wall',   floor: 'metal',   roof: 'flat',    window: 'glass',  c: { g: '#465062', a: '#4fd1e0', wall: '#94a8bd', roof: '#2d3542', floor: '#6b7788', paper: '#3a4454' }, decor: [['lamp_neon', 3], ['antenna', 1], ['vending', 2], ['cablebox', 2], ['bench', 1], ['planter', 1]] },
  work:       { ground: 'paved',  road: 'asphalt', border: 'wall',   floor: 'carpet',  roof: 'flat',    window: 'grid',   c: { g: '#9ba1a9', a: '#3f7fd0', wall: '#b5654a', roof: '#4a4f5a', floor: '#56708f', paper: '#d8d3c8' }, decor: [['bench', 2], ['planter', 3], ['lamp', 2], ['signpost', 1], ['tree_round', 1]] },
  nature:     { ground: 'grass',  road: 'dirt',    border: 'forest', floor: 'wood',    roof: 'pitched', window: 'small',  c: { g: '#4f9a3f', a: '#f2c14e', wall: '#8a5a33', roof: '#5c7a2e', floor: '#9c6b3f', paper: '#b58a5a' }, decor: [['tree_round', 5], ['tree_pine', 5], ['bush', 4], ['flowers', 4], ['rock', 3], ['mushroom', 2]] },
  art:        { ground: 'cobble', road: 'cobble',  border: 'hedge',  floor: 'checker', roof: 'pitched', window: 'arched', c: { g: '#c7b9d6', a: '#e0567a', wall: '#f0ede6', roof: '#e0567a', floor: '#e8e4dc', paper: '#f4efe6' }, decor: [['statue', 2], ['flowers', 2], ['banner', 2], ['lamp', 1], ['tree_round', 1]] },
  music:      { ground: 'cobble', road: 'cobble',  border: 'wall',   floor: 'parquet', roof: 'flat',    window: 'arched', c: { g: '#5f4f78', a: '#f08fc0', wall: '#7a4467', roof: '#2e2240', floor: '#7a4a2e', paper: '#4a2f48' }, decor: [['speaker', 2], ['lamp', 2], ['poster', 2], ['bench', 1]] },
  finance:    { ground: 'marble', road: 'stone',   border: 'hedge',  floor: 'carpet',  roof: 'temple',  window: 'arched', c: { g: '#d3cdc0', a: '#d4af37', wall: '#ece6d6', roof: '#3c5a44', floor: '#8c2f39', paper: '#e6dcc4' }, decor: [['column', 2], ['hedge', 3], ['lamp_gold', 2], ['fountain', 1]] },
  travel:     { ground: 'sand',   road: 'stone',   border: 'water',  floor: 'tile',    roof: 'pitched', window: 'small',  c: { g: '#dcc48e', a: '#2b9bb0', wall: '#eadab4', roof: '#c45f3a', floor: '#d9cdb0', paper: '#e9dcc0' }, decor: [['palm', 4], ['signpost', 2], ['suitcase', 1], ['bench', 1]] },
  food:       { ground: 'cobble', road: 'cobble',  border: 'wall',   floor: 'checker', roof: 'awning',  window: 'small',  c: { g: '#ae9072', a: '#e2683c', wall: '#f1dcc0', roof: '#c0392b', floor: '#f0e8dc', paper: '#f3e4cc' }, decor: [['stall', 2], ['barrel', 3], ['crate', 3], ['lamp', 1], ['flowers', 1]] },
  home:       { ground: 'grass',  road: 'dirt',    border: 'hedge',  floor: 'wood',    roof: 'pitched', window: 'small',  c: { g: '#6aa84f', a: '#e57f9a', wall: '#efe2c8', roof: '#b34a3a', floor: '#c49a6c', paper: '#e8d6b4' }, decor: [['tree_round', 3], ['flowers', 4], ['bush', 3], ['bench', 1]] },
  games:      { ground: 'paved',  road: 'asphalt', border: 'wall',   floor: 'stars',   roof: 'flat',    window: 'glass',  c: { g: '#2f2446', a: '#ffcc33', wall: '#43336a', roof: '#1d1530', floor: '#2a1f4a', paper: '#2f2452' }, decor: [['lamp_neon', 3], ['vending', 2], ['poster', 2], ['speaker', 2]] },
  science:    { ground: 'paved',  road: 'stone',   border: 'wall',   floor: 'tile',    roof: 'dome',    window: 'glass',  c: { g: '#d4dbde', a: '#3aa57f', wall: '#e9eef0', roof: '#7aa0b0', floor: '#e4e9ec', paper: '#dfe7ea' }, decor: [['dish', 2], ['tank', 2], ['lamp', 2], ['planter', 1]] },
  education:  { ground: 'grass',  road: 'stone',   border: 'hedge',  floor: 'wood',    roof: 'pitched', window: 'grid',   c: { g: '#5f9955', a: '#8e3b3b', wall: '#a8553f', roof: '#3e4b5c', floor: '#8a5a3a', paper: '#d6c9a8' }, decor: [['tree_round', 3], ['bench', 2], ['statue', 1], ['lamp', 2], ['flowers', 1]] },
  health:     { ground: 'grass',  road: 'stone',   border: 'hedge',  floor: 'tile',    roof: 'flat',    window: 'grid',   c: { g: '#7fb86a', a: '#e05a5a', wall: '#f2f5f4', roof: '#5aa0a0', floor: '#dfeceb', paper: '#eef4f2' }, decor: [['tree_round', 2], ['bench', 3], ['flowers', 3], ['fountain', 1]] },
  social:     { ground: 'cobble', road: 'cobble',  border: 'hedge',  floor: 'carpet',  roof: 'pitched', window: 'grid',   c: { g: '#b39c88', a: '#3fa0c8', wall: '#e9c9a0', roof: '#5d7fa6', floor: '#7a5a8a', paper: '#eadbc4' }, decor: [['bench', 3], ['lamp', 3], ['fountain', 1], ['flag', 2], ['flowers', 1]] },
  archive:    { ground: 'stone',  road: 'dirt',    border: 'forest', floor: 'stone',   roof: 'pitched', window: 'small',  c: { g: '#7f7b72', a: '#b58a4a', wall: '#8f8a7c', roof: '#4d4a44', floor: '#6e6a62', paper: '#8a8474' }, decor: [['tree_dead', 3], ['rock', 3], ['crate', 2], ['statue', 1], ['weeds', 3]] },
  media:      { ground: 'paved',  road: 'asphalt', border: 'wall',   floor: 'carpet',  roof: 'flat',    window: 'glass',  c: { g: '#4c505b', a: '#f5b400', wall: '#363b4a', roof: '#d23b3b', floor: '#33363f', paper: '#2c2f3a' }, decor: [['lamp', 2], ['poster', 3], ['bench', 1], ['lamp_neon', 1]] },
  security:   { ground: 'stone',  road: 'asphalt', border: 'wall',   floor: 'metal',   roof: 'flat',    window: 'slit',   c: { g: '#44464d', a: '#d23b3b', wall: '#5d6069', roof: '#2a2c31', floor: '#50545c', paper: '#3d4047' }, decor: [['floodlight', 2], ['cone', 2], ['crate', 2], ['barrel', 1]] },
};

// 7×7 sign glyphs (one per tag) — '#' = ink.
TH.GLYPH = {
  technology: ['.......', '.#...#.', '#.....#', '#..#..#', '#.....#', '.#...#.', '.......'],
  work:       ['.......', '..###..', '#######', '#..#..#', '#######', '#######', '.......'],
  nature:     ['....##.', '...###.', '..####.', '.####..', '.###...', '#......', '.......'],
  art:        ['..###..', '.#####.', '##.####', '#######', '###.##.', '.####..', '.......'],
  music:      ['...####', '...#..#', '...#..#', '...#..#', '.###.##', '####.##', '.##....'],
  finance:    ['...#...', '.#####.', '#..#...', '.#####.', '...#..#', '.#####.', '...#...'],
  travel:     ['...#...', '...#...', '.#####.', '#######', '...#...', '..###..', '.......'],
  food:       ['.......', '#####..', '#####.#', '#####.#', '#####..', '.###...', '#######'],
  home:       ['...#...', '..###..', '.#####.', '#######', '.##.##.', '.##.##.', '.......'],
  games:      ['.......', '.#####.', '#.#####', '...##.#', '#.#####', '.##.##.', '.......'],
  science:    ['..###..', '...#...', '...#...', '..#.#..', '.#...#.', '#######', '.......'],
  education:  ['.......', '###.###', '#.#.#.#', '#.#.#.#', '###.###', '.......', '.......'],
  health:     ['..###..', '..###..', '#######', '#######', '#######', '..###..', '..###..'],
  social:     ['.#####.', '#######', '#.#.#.#', '#######', '.#####.', '.#.....', '.......'],
  archive:    ['#######', '#.....#', '#######', '#..#..#', '#.....#', '#######', '.......'],
  media:      ['.......', '.##....', '#######', '##...##', '##.#.##', '#######', '.......'],
  security:   ['..###..', '.#...#.', '.#...#.', '#######', '###.###', '###.###', '#######'],
  plain:      ['.......', '..###..', '.#...#.', '.#...#.', '.#...#.', '..###..', '.......'],
};

// Build a mood-adjusted palette. mood ∈ [-1, 1].
TH.palette = function (primary, secondary, mood) {
  const S = TH.STYLES[primary] || TH.STYLES.plain;
  const S2 = TH.STYLES[secondary] || null;
  const m = mood || 0;
  const tune = (hex) => {
    const ds = m * 0.18, dl = m * 0.04, dh = m < 0 ? m * 0.03 : 0;
    let c = U.adj(hex, dh, ds, dl);
    if (m < -0.3) c = U.mix(c, '#4a5568', U.clamp(-m - 0.3, 0, 0.5) * 0.6);
    return c;
  };
  const c = S.c;
  const p = {
    style: S, primary, secondary: S2 ? secondary : null, mood: m,
    ground: tune(c.g), ground2: tune(U.adj(c.g, 0.01, 0, -0.05)), ground3: tune(U.adj(c.g, -0.01, 0.02, 0.05)),
    accent: tune(c.a), accent2: tune(S2 ? S2.c.a : U.adj(c.a, 0.1, 0, 0)),
    wall: tune(c.wall), roof: tune(c.roof), floor: tune(c.floor), paper: tune(c.paper),
    grassDark: tune(U.adj(c.g, 0, 0, -0.12)),
    leaf: tune(m < -0.35 ? '#5f6b3a' : '#3f8a3a'), leafDark: tune(m < -0.35 ? '#48502c' : '#2c6a2c'), leafLight: tune('#6fb65a'),
    trunk: '#6b4a2e', trunkDark: '#4a321f',
    water: tune('#3f86c6'), waterLight: tune('#7fb8e6'),
    stone: tune('#8d8a84'), stoneDark: tune('#66635e'), stoneLight: tune('#b4b0a8'),
    road: tune({ dirt: '#a98a5e', asphalt: '#3a3d44', cobble: '#8f8478', stone: '#b9b2a6' }[S.road]),
    ink: '#1a1c24', white: '#f4f1ea', shadow: 'rgba(10,12,20,0.28)',
  };
  p.road2 = U.adj(p.road, 0, 0, -0.06);
  p.road3 = U.adj(p.road, 0, 0, 0.06);
  p.flowerA = tune(['#e8577a', '#f2c14e', '#ffffff', '#9b7fe0'][U.hash(primary) % 4]);
  p.flowerB = tune(['#f2c14e', '#e8577a', '#7fc4f0', '#ffffff'][U.hash(primary + 'b') % 4]);
  return p;
};

// Style for a building representing a child folder (quick theme, parent mood).
TH.buildingStyle = function (tag, mood, seed) {
  const S = TH.STYLES[tag] || TH.STYLES.plain;
  const r = U.rng('bstyle:' + seed);
  const tune = (h) => U.adj(h, m0(r), mood * 0.12, mood * 0.03);
  function m0(rr) { return (rr() - 0.5) * 0.03; }
  return {
    tag, roofType: S.roof, window: S.window,
    wall: tune(S.c.wall), wallDark: U.adj(tune(S.c.wall), 0, 0, -0.14),
    roof: tune(S.c.roof), roofDark: U.adj(tune(S.c.roof), 0, 0, -0.14), roofLight: U.adj(tune(S.c.roof), 0, 0, 0.1),
    accent: tune(S.c.a), door: U.adj(tune(S.c.roof), 0.02, -0.1, -0.18),
    glass: tag === 'games' ? '#ff4fa0' : tag === 'technology' ? '#6fe0ef' : '#9fd0ef',
  };
};
