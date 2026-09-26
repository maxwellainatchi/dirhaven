// ───────────────────────── world.js ─────────────────────────
// Survey a folder lazily, decide its scale, theme and tone, then lay out a
// deterministic tile map for it.
//
//  Region / Town  → a large outdoor map you walk around.
//  District       → a neighbourhood *inside* its parent's map (a cluster of
//                   buildings around a plaza), not a separate screen.
//  Building       → an indoor floor plan: its subfolders are rooms off a
//                   corridor, split over floors joined by stairs.
//  Room           → one room of a building; its own subfolders are doors.

const W = {};
W.T = { GROUND: 0, GROUND2: 1, ROAD: 2, PLAZA: 3, BORDER: 5, FLOOR: 7, WALLCAP: 8, WALLHI: 9, WALLLO: 10, WALLSIDE: 11, RUG: 12, MAT: 13, VOID: 14, PARTITION: 15 };
const T = W.T;

W.DIR_GROUP = 40;        // >48 subfolders fold into alphabetical wings of 40
W.FILE_GROUP = 200;      // >240 files fold into storage wings of 200
W.SAMPLE_FILES = 18;     // text files read in the folder itself
W.SAMPLE_SUB = 4;        // … and in each district / room shown on the same map
W.SAMPLE_BYTES = 12288;
W.DEEP_BUDGET = 160;     // max grandchild folders listed for embedded districts

W.listCache = new Map();
W.fileInfo = new Map();
W.areaCache = new Map();
W.visited = new Set();
W.inspected = new Set();
W.parentOf = new Map();   // child id → { parent, parentLevel, via, embedded }
W.childrenOf = new Map(); // parent id → child nodes, for the atlas

// Hidden and OS-junk entries never enter the world.
W.isHidden = (name) => name.startsWith('.') || name.startsWith('~$') ||
  /^(thumbs\.db|desktop\.ini|\$recycle\.bin|system volume information|lost\+found|__macosx|icon\r?)$/i.test(name);

// Subfolders are what make a place big: a district needs at least three
// buildings to cluster, a town six, a region twelve (or lots of files).
W.levelFromCounts = function (S, F) {
  if (S === 0) return F >= 6 ? 3 : 4;          // only files: a building or a room
  if (S < 3) return 3;                          // a building whose subfolders are rooms
  const score = S * 4 + F;
  if (S >= 12 || score >= 72) return 0;
  if (S >= 6 || score >= 40) return 1;
  return 2;
};

// ── readable names ──────────────────────────────────────────────────────
// Folder names are rarely written for reading: snake_case, dots, version numbers.
// We clean them up and give a place a word for what it is.
const SMALL_WORDS = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'at', 'by', 'with', 'vs']);
const ABBR = { src: 'Source', img: 'Images', imgs: 'Images', pics: 'Pictures', docs: 'Documents', doc: 'Document', pkg: 'Package', pkgs: 'Packages', lib: 'Library', libs: 'Libraries', bin: 'Binaries', dist: 'Build', tmp: 'Temp', cfg: 'Config', config: 'Config', env: 'Environment', repo: 'Repository', repos: 'Repositories', util: 'Utilities', utils: 'Utilities', misc: 'Odds & Ends', prev: 'Previous', proj: 'Project', ml: 'ML', ai: 'AI', db: 'DB', api: 'API', ui: 'UI', ux: 'UX', css: 'CSS', js: 'JS', ts: 'TS', sql: 'SQL', pdf: 'PDF', www: 'Web', app: 'App', apps: 'Apps', fw: 'Firmware', vm: 'VM', vms: 'VMs', os: 'OS', hr: 'HR', qa: 'QA', wip: 'Work in Progress' };
const SUFFIX = { technology: 'Works', work: 'Offices', nature: 'Lodge', art: 'Gallery', music: 'Hall', finance: 'Bank', travel: 'Station', food: 'Market', home: 'House', games: 'Arcade', science: 'Laboratory', education: 'Library', health: 'Clinic', social: 'Meeting House', archive: 'Depot', media: 'Studio', security: 'Keep', plain: 'House' };
W.pretty = function (name) {
  let t = String(name || '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  t = t.replace(/[_\-.]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  if (!t) t = String(name || '');
  t = t.split(' ').map((w, i) => {
    const ab = ABBR[w.toLowerCase()];
    if (ab) return ab;
    if (/^[0-9]+$/.test(w)) return w;
    if (w.length <= 4 && w === w.toUpperCase()) return w;
    if (i > 0 && SMALL_WORDS.has(w.toLowerCase())) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
  return t.length > 30 ? t.slice(0, 29) + '…' : t;
};
W.title = function (node, level, tag) {
  if (node.hall) return `${W.pretty(node.groupOf)} Hall`;
  if (node.kind === 'group') return `${W.pretty(node.groupOf)} Wing`;
  const base = W.pretty(node.name);
  const suf = level === 2 ? 'Quarter' : level === 3 ? (SUFFIX[tag] || 'House') : null;
  if (!suf) return base;
  const low = ' ' + base.toLowerCase() + ' ';
  if (low.includes(' ' + suf.toLowerCase() + ' ') || low.includes(suf.toLowerCase())) return base;
  return `${base} ${suf}`;
};
W.disp = (node) => (node && (node.display || W.pretty(node.name))) || '';
W.embeddedLabel = function (node) {
  const rec = W.parentOf.get(node.id);
  return rec && rec.embedded ? 'District' : 'Unexplored';
};

// Ground cover you can walk over, and growth an axe can clear.
W.SOFT_DECOR = new Set(['flowers', 'mushroom', 'weeds', 'cone', 'suitcase']);
W.TREES = new Set(['tree_round', 'tree_pine', 'palm', 'tree_dead', 'bush', 'hedge']);

const short = (s) => s.length > 11 ? s.slice(0, 10) + '…' : s;
W.fold = function (parent, nodes) {
  const mk = (list, size, tag) => {
    const out = [];
    for (let i = 0; i < list.length; i += size) {
      const members = list.slice(i, i + size);
      out.push({ id: parent.id + '#' + tag + i, name: `${short(members[0].name)} – ${short(members[members.length - 1].name)}`, kind: 'group', members, restricted: false, groupOf: parent.groupOf || parent.name });
    }
    return out;
  };
  let dirs = nodes.filter(n => n.kind !== 'file');
  const files = nodes.filter(n => n.kind === 'file');
  while (dirs.length > 48) dirs = mk(dirs, W.DIR_GROUP, 'd' + dirs.length + '_');
  return dirs.concat(files.length > 240 ? mk(files, W.FILE_GROUP, 'f') : files);
};

W.list = async function (fs, node) {
  if (node.kind === 'group') return node.members;
  if (W.listCache.has(node.id)) { const c = W.listCache.get(node.id); if (c === 'restricted') throw FS.RESTRICTED; return c; }
  try {
    const raw = (await fs.list(node)).filter(n => !W.isHidden(n.name));
    const folded = W.fold(node, raw);
    W.listCache.set(node.id, folded);
    return folded;
  } catch (e) {
    if (e && e.restricted) { W.listCache.set(node.id, 'restricted'); node.restricted = true; }
    throw e;
  }
};

const countOf = (nodes) => {
  let S = 0, F = 0;
  for (const n of nodes) { if (n.kind === 'file') F++; else S += n.kind === 'group' ? Math.max(1, Math.ceil(n.members.length / 3)) : 1; }
  return { S, F };
};

// ── file details ────────────────────────────────────────────────────────
W.nameOnly = function (f) {
  const ni = AN.nameInfo(f.name, 'file');
  const info = { name: ni, content: null, text: null, restricted: f.restricted, tone: ni.sent.compound, scores: { ...ni.scores }, kind: AN.itemKind(f.name, ni.scores), partial: true };
  W.fileInfo.set(f.id, info);
  return info;
};
W.info = (f) => W.fileInfo.get(f.id) || W.nameOnly(f);
W.fileDetails = async function (fs, node) {
  const cached = W.fileInfo.get(node.id);
  if (cached && !cached.partial) return cached;
  const nameI = AN.nameInfo(node.name, 'file');
  const info = { name: nameI, content: null, text: null, restricted: node.restricted };
  if (!node.restricted) {
    try {
      let t = await fs.readText(node, W.SAMPLE_BYTES);
      if (t && /^%PDF-/.test(t.slice(0, 8))) t = null;   // PDF innards aren't words
      if (t) { info.text = t; info.content = AN.contentInfo(t); }
    } catch (e) { if (e && e.restricted) { info.restricted = true; node.restricted = true; } }
  }
  const s = info.content && info.content.sent.hits ? info.content.sent : nameI.sent;
  info.tone = s.compound;
  info.scores = { ...nameI.scores };
  if (info.content) for (const [k, v] of Object.entries(info.content.scores)) info.scores[k] = (info.scores[k] || 0) + v;
  // Keep the object kind stable once shown (it was chosen from the name).
  info.kind = cached ? cached.kind : AN.itemKind(node.name, info.scores);
  W.fileInfo.set(node.id, info);
  return info;
};
const textish = (files) => files.filter(f => !f.restricted && (f.size == null || f.size < 2e6) && (LEX.TEXT_EXT.has(U.ext(f.name)) || U.ext(f.name) === ''));

// ── readings: approach 2 (tag dictionary) + approach 1 (sentiment) ──────
const addS = (o, k, v) => { o[k] = (o[k] || 0) + v; };
W.reading = function (node, kids, infos) {
  const scores = {};
  const selfName = node.kind === 'group' ? (node.groupOf || '') : node.name;
  const self = AN.nameInfo(selfName, 'dir');
  AN.tagScores(self.tokens, 5, scores);
  let tw = 0, ts = 0;
  if (self.sent.hits) { ts += self.sent.compound * 2; tw += 2; }
  for (const k of kids || []) {
    if (k.kind !== 'file') { AN.tagScores(AN.nameInfo(k.name, 'dir').tokens, 2, scores); if (k.restricted) addS(scores, 'security', 1); continue; }
    const fi = W.info(k);
    for (const [t, v] of Object.entries(fi.name.scores)) addS(scores, t, v * 1.2);
    if (fi.content) {
      for (const [t, v] of Object.entries(fi.content.scores)) addS(scores, t, Math.min(v, 3));
      if (fi.content.sent.hits) { const w = Math.min(4, 1 + fi.content.sent.hits / 3); ts += fi.content.sent.compound * w; tw += w; }
    } else if (fi.name.sent.hits) { ts += fi.name.sent.compound * 0.5; tw += 0.5; }
    if (k.restricted) addS(scores, 'security', 0.8);
  }
  if (infos) for (const c of infos) if (c.kids) for (const g of c.kids.slice(0, 40)) AN.tagScores(AN.nameInfo(g.name, g.kind).tokens, 0.12, scores);
  const top = AN.topTags(scores, 3);
  const primary = top[0] && top[0].score >= 1 ? top[0].tag : 'plain';
  const secondary = top[1] && top[1].score >= top[0].score * 0.4 ? top[1].tag : null;
  return { primary, secondary, tags: top, mood: tw ? U.clamp(ts / tw, -1, 1) : 0 };
};

W.peek = async function (fs, d, parentLevel) {
  if (d.restricted) return { node: d, kids: null, S: 0, F: 0, n: 0, level: 3, restricted: true };
  try {
    const kids = await W.list(fs, d);
    const { S, F } = countOf(kids);
    return { node: d, kids, S, F, n: kids.length, level: Math.max(parentLevel, W.levelFromCounts(S, F)), restricted: false };
  } catch (e) { return { node: d, kids: null, S: 0, F: 0, n: 0, level: 3, restricted: true }; }
};

// ── Survey: everything needed to generate one map ───────────────────────
W.survey = async function (fs, node, parentLevel, progress) {
  if (W.areaCache.has(node.id)) return W.areaCache.get(node.id);
  const say = progress || (() => {});
  say(`Listing ${node.name}…`);
  const kids = await W.list(fs, node);
  const dirs = kids.filter(k => k.kind !== 'file'), files = kids.filter(k => k.kind === 'file');
  const { S, F } = countOf(kids);
  const level = Math.max(parentLevel, W.levelFromCounts(S, F));
  const outdoor = level <= 2;

  say(`Peeking into ${dirs.length} folder${dirs.length === 1 ? '' : 's'}…`);
  const childInfo = await U.pool(dirs, 6, d => W.peek(fs, d, level));

  // Districts are drawn inside this map, so we need their buildings too.
  if (outdoor) {
    let budget = W.DEEP_BUDGET;
    for (const c of childInfo) {
      if (c.restricted || c.level !== 2 || !c.kids) continue;
      const gd = c.kids.filter(k => k.kind !== 'file');
      const take = gd.slice(0, Math.max(0, budget)); budget -= take.length;
      if (take.length) say(`Mapping the ${c.node.name} district…`);
      c.grand = await U.pool(take, 6, g => W.peek(fs, g, 2));
      for (const g of gd.slice(take.length)) c.grand.push({ node: g, kids: null, S: 0, F: 0, n: 0, level: 3, restricted: false });
      c.embedded = true;
    }
  }

  // Sample file contents: this folder, plus each district/room on this map.
  const toRead = textish(files).slice(0, W.SAMPLE_FILES);
  for (const c of childInfo) if (c.kids && (!outdoor || c.embedded)) toRead.push(...textish(c.kids.filter(k => k.kind === 'file')).slice(0, W.SAMPLE_SUB));
  say(`Reading ${toRead.length} file${toRead.length === 1 ? '' : 's'} for tone…`);
  await U.pool(toRead.slice(0, 80), 4, f => W.fileDetails(fs, f));

  for (const c of childInfo) {
    c.reading = W.reading(c.node, c.kids || [], c.grand);
    if (c.grand) for (const g of c.grand) g.reading = W.reading(g.node, g.kids || []);
  }
  const rd = W.reading(node, kids, childInfo);
  node.display = W.title(node, level, rd.primary);
  for (const c of childInfo) {
    c.node.display = W.title(c.node, c.level, c.reading.primary);
    for (const g of c.grand || []) g.node.display = W.title(g.node, g.level, (g.reading || c.reading).primary);
  }
  const area = { node, kids, dirs, files, childInfo, level, outdoor, S, F, ...rd };
  W.areaCache.set(node.id, area);
  return area;
};

// Virtual node for a place's loose files (the town hall / district hall).
// Remember how places hang together so the atlas can route you back.
W.link = function (parent, child, parentLevel, via, embedded) {
  if (!child || W.parentOf.has(child.id)) return;
  W.parentOf.set(child.id, { parent, parentLevel, via: via || null, embedded: !!embedded });
  const list = W.childrenOf.get(parent.id) || [];
  if (!list.some(n => n.id === child.id)) list.push(child);
  W.childrenOf.set(parent.id, list);
};

W.hallNode = function (owner, files) {
  return { id: owner.id + '#hall', name: `${owner.kind === 'group' ? owner.groupOf : owner.name} Hall`, kind: 'group', members: files, restricted: false, groupOf: owner.kind === 'group' ? owner.groupOf : owner.name, hall: true };
};

// ── Map scaffolding ─────────────────────────────────────────────────────
function newMap(w, h, kind, area) {
  const pal0 = TH.palette(area.primary, area.secondary, area.mood);
  return {
    w, h, kind, area, pals: [pal0], pal: pal0,
    tiles: new Uint8Array(w * h), solid: new Uint8Array(w * h), pidx: new Uint8Array(w * h),
    flat: [], objs: [], labels: [], npcs: [], zones: [], floors: null,
    trig: new Map(), act: new Map(), doors: new Map(), spawn: { x: 1, y: 1, dir: 'up' },
  };
}
function addPal(m, reading) {
  const p = TH.palette(reading.primary, reading.secondary, reading.mood);
  const key = reading.primary + '|' + reading.secondary + '|' + reading.mood.toFixed(2);
  const i = m.pals.findIndex(q => q.key === key);
  if (i >= 0) return i;
  p.key = key; m.pals.push(p); return m.pals.length - 1;
}
const idx = (m, x, y) => y * m.w + x;
const inb = (m, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h;
function setT(m, x, y, t, solid, pi) { if (!inb(m, x, y)) return; const k = idx(m, x, y); m.tiles[k] = t; if (solid !== undefined) m.solid[k] = solid ? 1 : 0; if (pi !== undefined) m.pidx[k] = pi; }
function fillT(m, x, y, w, h, t, solid, pi) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setT(m, x + i, y + j, t, solid, pi); }
function block(m, x, y) { if (inb(m, x, y)) m.solid[idx(m, x, y)] = 1; }
function wallTile(m, x, y, pi) { if (!inb(m, x, y)) return; const k = idx(m, x, y); if (m.tiles[k] === T.BORDER) return; m.tiles[k] = T.BORDER; m.solid[k] = 1; m.pidx[k] = pi; }

// ── locks ───────────────────────────────────────────────────────────────
// A locked place gets a keycard reader and a guard; a locked quarter gets a
// wall around it with one gate. Everything needed to open it later is kept
// on the map so we can just re-paint when the card turns up.
function lockEntry(m, nodeId, card, kind) {
  K.note(nodeId, card);
  const L = { nodeId, card, kind, acts: [], open: [], objs: [], trig: null, doorIdx: -1, name: '' };
  (m.locks = m.locks || []).push(L);
  return L;
}
function lockDoor(m, L, door, pal, pi, label) {
  const k = idx(m, door.x, door.y);
  m.solid[k] = 1;
  m.act.set(k, { type: 'lock', lock: L }); L.acts.push(k);
  L.doorIdx = k; L.open.push({ k, tile: m.tiles[k] });
  m.flat.push({ x: door.x, y: door.y, spr: ['reader'], pi });
  const gx = door.x + 1, gy = door.y + 1;
  if (inb(m, gx, gy) && !m.solid[idx(m, gx, gy)]) {
    block(m, gx, gy);
    const obj = { x: gx, y: gy, w: 1, spr: ['guard'], pi, guard: true };
    m.objs.push(obj); L.objs.push(obj);
    const gk = idx(m, gx, gy);
    m.act.set(gk, { type: 'lock', lock: L }); L.acts.push(gk);
    L.guard = { x: gx, y: gy };
  }
  L.name = label;
}

W.pickStart = function (rootArea) {
  if (!rootArea.outdoor) return null;
  const bySize = (a, b) => (a.n || 0) - (b.n || 0) || (a.node.name < b.node.name ? -1 : 1);
  const districts = rootArea.childInfo.filter(c => c.embedded && !c.restricted && (c.grand || []).some(g => !g.restricted && g.level >= 3));
  let district = districts.sort(bySize)[0] || null;
  let building = null;
  if (district) building = (district.grand || []).filter(g => !g.restricted && g.level >= 3).sort(bySize)[0];
  if (!building) {
    district = null;
    building = rootArea.childInfo.filter(c => !c.restricted && c.level >= 3).sort(bySize)[0];
  }
  if (!building) return null;
  K.starterMap = rootArea.node.id;
  K.starterDistrict = district ? district.node.id : null;
  K.starterBuilding = building.node.id;
  return { node: building.node, via: district ? district.node : null, parentLevel: district ? 2 : rootArea.level, districtName: district ? district.node.name : rootArea.node.name };
};

// Residents keep a stable identity across map regenerations, so the errand
// a given person offers never changes under you.
W.makeNpc = function (area, i, x, y, line, rng, where) {
  const id = area.node.id + '#npc' + i;
  return { id, name: Q.name(id), where, x, y, px: x * 16, py: y * 16, dir: 'down', look: U.hash(id + 'look') % 6, line, moving: 0, wait: rng.int(20, 120), seed: rng() };
};

W.generate = function (area, isRoot) {
  return area.outdoor ? genOutdoor(area, isRoot) : genIndoor(area, isRoot);
};

// Split this folder's files into readable ones and restricted ones.
function splitFiles(files) {
  const locked = files.filter(f => f.restricted || W.info(f).restricted);
  return { open: files.filter(f => !locked.includes(f)), locked };
}

// ═══════════════════════════ OUTDOOR ═══════════════════════════════════
// A neighbourhood is a stack of terraced streets: buildings stand shoulder
// to shoulder along the north side of each street, alleys cut between
// them, and the lowest street opens into a plaza.

function buildingSize(info, rng) {
  const n = info ? (info.n || 0) : 0;
  const big = Math.min(1, n / 28);
  let w = 5 + 2 * Math.round(big * 2 + (rng() < 0.3 ? 1 : 0));
  if (w > 9) w = 9;
  const h = 5 + Math.round(big * 2) + (rng() < 0.35 ? 1 : 0);
  return { w, h };
}

function neighbourhoodItems(owner, dirInfos, files, reading, rng, embeddedLevel) {
  const items = [];
  const { open, locked } = splitFiles(files);
  if (open.length) items.push({ type: 'hall', node: W.hallNode(owner, open), w: 7, h: 6, n: open.length, reading });
  locked.slice(0, 4).forEach(f => items.push({ type: 'vault', files: [f], title: f.name, w: 5, h: 4 }));
  if (locked.length > 4) items.push({ type: 'vault', files: locked.slice(4), title: `${locked.length - 4} restricted files`, w: 5, h: 4 });
  for (const c of dirInfos) {
    if (c.restricted) { items.push({ type: 'vault', dir: c.node, title: c.node.name, w: 5, h: 4 }); continue; }
    if (c.kids && !c.kids.length) continue;                 // nothing inside: no building
    if (!c.kids && (c.n || 0) === 0) continue;
    if (c.level <= embeddedLevel) { items.push({ type: 'arch', ci: c, w: 5, h: 4 }); continue; }
    const small = c.level === 4;
    const sz = small ? { w: 3, h: 4 } : buildingSize(c, rng);
    items.push({ type: small ? 'hut' : 'building', ci: c, w: sz.w, h: sz.h });
  }
  return items;
}

// Lay out one neighbourhood in local coordinates.
function buildPatch(items, rng, opts) {
  const P = { cells: new Map(), objs: [], acts: [], trigs: [], labels: [], doors: [], lamps: [] };
  const put = (x, y, t, solid) => P.cells.set(x + ',' + y, { t, solid });
  const n = items.length;
  const totalW = items.reduce((s, it) => s + it.w, 0) + n * 0.6;
  const k = Math.max(1, Math.round(Math.sqrt(totalW / 12)));
  const target = totalW / k;
  const rows = []; let cur = [], curW = 0;
  for (const it of items) {
    if (cur.length && curW + it.w > target * 1.15 && rows.length < k - 1) { rows.push(cur); cur = []; curW = 0; }
    cur.push(it); curW += it.w + 0.6;
  }
  if (cur.length || !rows.length) rows.push(cur);

  // x placement per row (touching, with the occasional alley)
  const R = rows.map((row) => {
    let x = rng.int(0, 4); const minX = x; const alleys = [];
    row.forEach((it, i) => {
      it.x = x; x += it.w;
      if (i < row.length - 1 && rng() < 0.3) { alleys.push(x); x += 2; }
    });
    const maxX = row.length ? x - 1 : minX + 6;
    return { row, minX, maxX, alleys, h: row.length ? Math.max(...row.map(it => it.h)) : 0 };
  });
  // y placement
  let y = 1;
  R.forEach((r, i) => {
    r.base = y + r.h - 1;
    const last = i === R.length - 1;
    r.street = [r.base + 1, r.base + (last ? 4 : 2)];
    const nxt = R[i + 1];
    r.sx0 = Math.min(r.minX, nxt ? nxt.minX : r.minX) - 2;
    r.sx1 = Math.max(r.maxX, nxt ? nxt.maxX : r.maxX) + 2;
    y = r.street[1] + 1;
  });
  const lastR = R[R.length - 1];
  // Plaza: the last street widens.
  const plazaW = Math.max(9, Math.min(15, lastR.sx1 - lastR.sx0 + 1));
  const pcx = Math.round((lastR.sx0 + lastR.sx1) / 2);
  lastR.sx0 = Math.min(lastR.sx0, pcx - Math.floor(plazaW / 2) - 1);
  lastR.sx1 = Math.max(lastR.sx1, pcx + Math.floor(plazaW / 2) + 1);

  // Streets, connectors and alleys.
  R.forEach((r, i) => {
    for (let yy = r.street[0]; yy <= r.street[1]; yy++) for (let xx = r.sx0; xx <= r.sx1; xx++) put(xx, yy, T.ROAD, false);
    const nxt = R[i + 1];
    if (nxt) {
      const top = r.street[1] + 1, bot = nxt.base;
      for (let yy = top; yy <= bot; yy++) {
        put(nxt.minX - 2, yy, T.ROAD, false); put(nxt.minX - 1, yy, T.ROAD, false);
        put(nxt.maxX + 1, yy, T.ROAD, false); put(nxt.maxX + 2, yy, T.ROAD, false);
        for (const ax of nxt.alleys) { put(ax, yy, T.ROAD, false); put(ax + 1, yy, T.ROAD, false); }
      }
    }
  });
  for (let yy = lastR.street[0]; yy <= lastR.street[1]; yy++) for (let xx = pcx - Math.floor(plazaW / 2); xx <= pcx + Math.floor(plazaW / 2); xx++) put(xx, yy, T.PLAZA, false);

  // Buildings.
  const doorCols = new Set();
  R.forEach((r) => r.row.forEach((it) => {
    const bx = it.x, by = r.base - it.h + 1;
    for (let j = 0; j < it.h; j++) for (let i = 0; i < it.w; i++) put(bx + i, by + j, 255, true);
    const door = { x: bx + Math.floor(it.w / 2), y: r.base };
    doorCols.add(door.x + ',' + (r.base + 1));
    it.door = door; it.bx = bx; it.by = by;
    P.objs.push({ it, x: bx, y: r.base, w: it.w });
  }));

  // Centerpiece and lamps.
  const cy = lastR.street[0] + 2;
  P.center = { x: pcx - 1, y: cy + 1 };
  P.entry = { x: pcx + Math.floor(plazaW / 2) - 2, y: lastR.street[1] };
  R.forEach((r, i) => {
    const lampY = r.street[0] + 1;
    const connectorCols = new Set();
    const nxt = R[i + 1];
    if (nxt) { [nxt.minX - 2, nxt.minX - 1, nxt.maxX + 1, nxt.maxX + 2, ...nxt.alleys.flatMap(a => [a, a + 1])].forEach(c => connectorCols.add(c)); }
    const step = rng.int(5, 7);
    for (let xx = r.sx0 + 2; xx < r.sx1 - 1; xx += step) {
      if (connectorCols.has(xx) || (i === R.length - 1 && Math.abs(xx - pcx) < plazaW / 2 + 1)) continue;
      P.lamps.push({ x: xx, y: i === R.length - 1 ? lastR.street[1] : lampY });
    }
  });
  // bounds
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const key of P.cells.keys()) { const [a, b] = key.split(',').map(Number); x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); }
  P.x0 = x0 - 2; P.y0 = y0 - 2; P.w = x1 - x0 + 5; P.h = y1 - y0 + 4;
  return P;
}

// Dijkstra over the tile grid with a 2×2 brush — gives winding roads.
W._carveRoad = carveRoad;
function carveRoad(m, from, to, pi, noise) {
  const W_ = m.w, H_ = m.h, N = W_ * H_;
  const okCell = (x, y) => {
    if (x < 1 || y < 1 || x >= W_ - 2 || y >= H_ - 2) return false;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const k = idx(m, x + i, y + j); if (m.solid[k] && m.tiles[k] !== T.BORDER) return false; if (m.tiles[k] === T.BORDER && !(to.edge)) return false; }
    return true;
  };
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const heap = [];
  const push = (k, d) => { heap.push([d, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
  const s = idx(m, from.x, from.y), tk = idx(m, to.x, to.y);
  dist[s] = 0; push(s, 0);
  while (heap.length) {
    const [d, k] = pop();
    if (d > dist[k]) continue;
    if (k === tk) break;
    const x = k % W_, y = (k / W_) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!okCell(nx, ny) && !(nx === to.x && ny === to.y)) continue;
      const nk = idx(m, nx, ny), t = m.tiles[nk];
      const c = (t === T.ROAD || t === T.PLAZA) ? 0.35 : 1 + noise(nx, ny);
      if (d + c < dist[nk]) { dist[nk] = d + c; prev[nk] = k; push(nk, d + c); }
    }
  }
  if (!isFinite(dist[tk])) return false;
  for (let k = tk; k !== -1; k = prev[k]) {
    const x = k % W_, y = (k / W_) | 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const kk = idx(m, x + i, y + j);
      if (!inb(m, x + i, y + j)) continue;
      const t = m.tiles[kk];
      if (t === T.GROUND || t === T.GROUND2 || (t === T.BORDER && to.edge)) { m.tiles[kk] = T.ROAD; m.solid[kk] = 0; m.pidx[kk] = pi; }
    }
  }
  return true;
}

function genOutdoor(area, isRoot) {
  const rng = U.rng('map:' + area.node.id);
  const L = area.level;
  // What goes where.
  const coreDirs = [], districts = [], roads = [];
  for (const c of area.childInfo) {
    if (!c.restricted && c.embedded) districts.push(c);
    else if (!c.restricted && c.level < 2) roads.push(c);
    else coreDirs.push(c);
  }
  const reading0 = { primary: area.primary, secondary: area.secondary, mood: area.mood };
  const patches = [];
  const coreItems = neighbourhoodItems(area.node, coreDirs, area.files, reading0, rng, -1);
  patches.push({ core: true, node: area.node, reading: reading0, P: buildPatch(coreItems, U.rng('patch:' + area.node.id), {}) });
  for (const d of districts) {
    const dFiles = d.kids.filter(k => k.kind === 'file');
    const items = neighbourhoodItems(d.node, d.grand || [], dFiles, d.reading, rng, 2);
    patches.push({ node: d.node, info: d, reading: d.reading, P: buildPatch(items, U.rng('patch:' + d.node.id), {}) });
  }

  // Place patches around the core (spiral search, never straight below it).
  const core = patches[0];
  core.x = 0; core.y = 0;
  const placed = [core];
  const overlaps = (a) => placed.some(b => a.x < b.x + b.P.w + 5 && a.x + a.P.w + 5 > b.x && a.y < b.y + b.P.h + 5 && a.y + a.P.h + 5 > b.y);
  const baseAng = rng() * Math.PI * 2;
  patches.slice(1).sort((a, b) => b.P.w * b.P.h - a.P.w * a.P.h || (a.node.name < b.node.name ? -1 : 1)).forEach((p, i) => {
    for (let t = 0; t < 4000; t++) {
      const ang = baseAng + i * 2.39996 + t * 0.37;
      const s = Math.sin(ang);
      if (s > 0.75) continue; // keep the approach from the south clear
      const rad = 8 + t * 0.9;
      p.x = Math.round(core.P.w / 2 + Math.cos(ang) * rad * 1.35 - p.P.w / 2);
      p.y = Math.round(core.P.h / 2 + s * rad - p.P.h / 2);
      if (!overlaps(p)) break;
    }
    placed.push(p);
  });

  // Map bounds.
  const B = 3, gateBand = roads.length ? 7 : 0;
  const minX = Math.min(...placed.map(p => p.x)), minY = Math.min(...placed.map(p => p.y));
  const maxX = Math.max(...placed.map(p => p.x + p.P.w)), maxY = Math.max(...placed.map(p => p.y + p.P.h));
  const padX = L === 0 ? 10 : 7, padTop = (L === 0 ? 8 : 6) + gateBand, padBot = L === 0 ? 12 : 9;
  let w = maxX - minX + padX * 2 + B * 2, h = maxY - minY + padTop + padBot + B * 2;
  w = Math.max(w, roads.length * 10 + 12);
  const ox = B + padX - minX + Math.floor((w - (maxX - minX + padX * 2 + B * 2)) / 2), oy = B + padTop - minY;
  const m = newMap(w, h, 'outdoor', area);

  // Between neighbourhoods the land runs wild: paved themes keep their
  // streets, but the open country is grass and forest.
  let wildPi = 0;
  if (!['grass', 'sand'].includes(m.pal.style.ground)) {
    const wild = TH.palette('plain', null, area.mood);
    wild.style = { ...wild.style, road: m.pal.style.road };
    ['road', 'road2', 'road3'].forEach(k => { wild[k] = m.pal[k]; });
    wild.key = 'wild'; m.pals.push(wild); wildPi = m.pals.length - 1;
  }
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const border = xx < B || yy < B || xx >= w - B || yy >= h - B;
    setT(m, xx, yy, border ? T.BORDER : (rng() < 0.18 ? T.GROUND2 : T.GROUND), border, wildPi);
  }

  const reserved = new Uint8Array(w * h);
  // Stamp patches.
  for (const p of placed) {
    const pi = p.core ? 0 : addPal(m, p.reading);
    const px = p.x + ox - p.P.x0, py = p.y + oy - p.P.y0;
    p.abs = { x: p.x + ox, y: p.y + oy, w: p.P.w, h: p.P.h };
    for (let j = 0; j < p.P.h; j++) for (let i = 0; i < p.P.w; i++) if (inb(m, p.abs.x + i, p.abs.y + j)) m.pidx[idx(m, p.abs.x + i, p.abs.y + j)] = pi;
    for (const [key, c] of p.P.cells) {
      const [a, b] = key.split(',').map(Number);
      const X = a + px, Y = b + py;
      if (c.t === 255) { block(m, X, Y); reserved[idx(m, X, Y)] = 1; }
      else setT(m, X, Y, c.t, c.solid, pi);
    }
    const pal = m.pals[pi];
    // Buildings / halls / vaults / arches
    for (const o of p.P.objs) {
      const it = o.it, X = it.bx + px, Y = it.by + py, dx = it.door.x + px, dy = it.door.y + py;
      const bottom = Y + it.h - 1;
      const via = p.core ? null : p.node;
      const parentLevel = p.core ? area.level : 2;
      if (it.type === 'vault') {
        m.objs.push({ x: X, y: bottom, w: it.w, spr: ['vault', it.dir ? 'dir' : 'file'], pi, vault: true });
        const target = it.dir ? { dir: it.dir } : { files: it.files };
        m.act.set(idx(m, dx, dy), { type: 'vault', title: it.title, target });
        const gx = dx + 1, gy = dy + 1; block(m, gx, gy);
        m.objs.push({ x: gx, y: gy, w: 1, spr: ['guard'], pi, guard: true });
        m.act.set(idx(m, gx, gy), { type: 'guard', title: it.title, target });
        m.labels.push({ x: dx + 0.5, y: Y - 0.2, text: it.title, sub: 'Restricted', restricted: true });
        continue;
      }
      const node = it.type === 'hall' ? it.node : it.ci.node;
      m.solid[idx(m, dx, dy)] = 0;
      const lvl = it.type === 'hall' ? 3 : it.ci.level;
      const trig = { type: 'enter', node, level: lvl, parentLevel: it.type === 'hall' ? 3 : parentLevel, via, viaKind: 'District' };
      const card = it.type === 'hall' ? null : K.locks(area, it.ci);
      if (card) {
        const L = lockEntry(m, node.id, card, it.type === 'arch' ? 'gate' : 'building');
        L.trig = trig;
        lockDoor(m, L, { x: dx, y: dy }, pal, pi, W.disp(node));
      } else m.trig.set(idx(m, dx, dy), trig);
      m.doors.set(node.id, { x: dx, y: dy + 1 });
      const tag = it.type === 'hall' ? (it.reading.primary) : it.ci.reading.primary;
      const bs = TH.buildingStyle(tag, (it.type === 'hall' ? it.reading : it.ci.reading).mood, node.id);
      if (it.type === 'arch') m.objs.push({ x: X, y: bottom, w: it.w, spr: ['gate', 2, tag, pal.mood], pi, node, doorAt: { x: dx, y: dy } });
      else m.objs.push({ x: X, y: bottom, w: it.w, spr: ['building', it.w, it.h, bs, it.type === 'hut', node.id, it.type === 'hall'], pi, node, doorAt: { x: dx, y: dy } });
      m.labels.push({ x: dx + 0.5, y: Y - 0.2, text: node.name, sub: it.type === 'hall' ? `Hall · ${it.n} file${it.n === 1 ? '' : 's'}` : TH.LEVELS[lvl], id: node.id, door: { x: dx, y: dy } });
      reserved[idx(m, dx, dy + 1)] = 1;
    }
    for (const l of p.P.lamps) { const X = l.x + px, Y = l.y + py; if (!m.solid[idx(m, X, Y)] && !reserved[idx(m, X, Y)]) { block(m, X, Y); m.objs.push({ x: X, y: Y, w: 1, spr: ['decor', pal.style.decor.some(d => d[0] === 'lamp_neon') ? 'lamp_neon' : pal.primary === 'finance' ? 'lamp_gold' : 'lamp'], pi }); } }
    // Centerpiece: a fountain in the core square, a district signpost elsewhere.
    const cx = p.P.center.x + px, cy = p.P.center.y + py;
    if (p.core) { for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) block(m, cx + i, cy - j); m.objs.push({ x: cx, y: cy, w: 2, spr: ['decor', 'fountain'], pi }); }
    else {
      block(m, cx + 1, cy); m.objs.push({ x: cx + 1, y: cy, w: 1, spr: ['decor', 'banner'], pi });
      m.labels.push({ x: cx + 1.5, y: cy - 1.4, text: W.disp(p.node), sub: 'District', id: p.node.id, district: true });
      m.zones.push({ ...p.abs, node: p.node, reading: p.reading, kind: 'District', pi });
      m.doors.set(p.node.id, { x: p.P.entry.x + px, y: p.P.entry.y + py - 1 });
    }
    p.entryAbs = { x: p.P.entry.x + px, y: p.P.entry.y + py };
    // A locked quarter is walled, with one gate on its southern side.
    const dcard = p.core ? null : K.locks(area, p.info);
    if (dcard) {
      const R = p.abs, gateX = U.clamp(p.entryAbs.x, R.x + 1, R.x + R.w - 2), gateY = R.y + R.h - 1;
      const L = lockEntry(m, p.node.id, dcard, 'district');
      L.name = W.disp(p.node);
      for (let xx = R.x; xx < R.x + R.w; xx++) for (const yy of [R.y, R.y + R.h - 1]) wallTile(m, xx, yy, pi);
      for (let yy = R.y; yy < R.y + R.h; yy++) for (const xx of [R.x, R.x + R.w - 1]) wallTile(m, xx, yy, pi);
      for (let yy = p.entryAbs.y; yy <= gateY; yy++) setT(m, gateX, yy, T.ROAD, false, pi);
      wallTile(m, gateX, gateY, pi);
      lockDoor(m, L, { x: gateX, y: gateY }, m.pals[pi], pi, p.node.name);
      L.open.push({ k: idx(m, gateX, gateY), tile: T.ROAD });
      p.roadTarget = { x: gateX, y: gateY + 1 };
      m.labels.push({ x: gateX + 0.5, y: gateY + 2.6, text: dcard.name, sub: 'Locked quarter', restricted: true });
    }
  }

  const noise = (x, y) => ((U.hash(x + ':' + y + area.node.id) % 1000) / 1000) * 2.2;
  // Winding roads from each district to the core square.
  const coreEntry = core.entryAbs;
  m.roadLog = [];
  for (const p of placed.slice(1)) { const from = p.roadTarget || p.entryAbs; m.roadLog.push([p.node.name, from, coreEntry, carveRoad(m, from, coreEntry, 0, noise)]); }

  // The road out (to the parent folder) runs south off the map.
  const ex = Math.max(B + 1, Math.min(w - B - 3, coreEntry.x));
  if (!isRoot) {
    carveRoad(m, coreEntry, { x: ex, y: h - 2, edge: true }, 0, noise);
    fillT(m, ex, h - B, 2, B, T.ROAD, false, 0);
    for (let xx = ex; xx < ex + 2; xx++) m.trig.set(idx(m, xx, h - 1), { type: 'exit' });
    m.exitAt = { x: ex, y: h - 1 };
    m.spawn = { x: ex, y: h - 3, dir: 'up' };
    m.flat.push({ x: ex + 2, y: h - 4, spr: ['signpost_flat'] });
  } else {
    m.spawn = { x: coreEntry.x, y: coreEntry.y - 1, dir: 'up' };
  }

  // Roads to other towns / regions: great gates along the northern edge.
  roads.forEach((c, i) => {
    const gw = c.level === 0 ? 7 : 5, gh = c.level === 0 ? 4 : 3;
    const slot = (w - 2 * B) / roads.length;
    const gx = Math.round(B + slot * i + slot / 2 - gw / 2), gy = B;
    for (let j = 0; j < gh; j++) for (let k = 0; k < gw; k++) { block(m, gx + k, gy + j); m.tiles[idx(m, gx + k, gy + j)] = T.GROUND; reserved[idx(m, gx + k, gy + j)] = 1; }
    const door = { x: gx + Math.floor(gw / 2), y: gy + gh - 1 };
    m.solid[idx(m, door.x, door.y)] = 0;
    const gtrig = { type: 'enter', node: c.node, level: c.level, parentLevel: area.level };
    const gcard = K.locks(area, c);
    if (gcard) { const L = lockEntry(m, c.node.id, gcard, 'gate'); L.trig = gtrig; lockDoor(m, L, door, m.pal, 0, W.disp(c.node)); }
    else m.trig.set(idx(m, door.x, door.y), gtrig);
    m.doors.set(c.node.id, { x: door.x, y: door.y + 1 });
    m.objs.push({ x: gx, y: gy + gh - 1, w: gw, spr: ['gate', c.level, c.reading.primary, m.pal.mood], pi: 0, node: c.node, doorAt: door });
    m.labels.push({ x: door.x + 0.5, y: gy + gh + 2.4, text: W.disp(c.node), sub: 'Road to ' + TH.LEVELS[c.level], id: c.node.id, door });
    fillT(m, door.x - 1, door.y + 1, 3, 1, T.ROAD, false, 0);
    carveRoad(m, { x: door.x - 1, y: door.y + 1 }, coreEntry, 0, noise);
  });

  // Wild growth everywhere that isn't street — denser outside the neighbourhoods.
  const inZone = (x, y) => placed.some(p => x >= p.abs.x && y >= p.abs.y && x < p.abs.x + p.abs.w && y < p.abs.y + p.abs.h);
  for (let yy = B; yy < h - B; yy++) for (let xx = B; xx < w - B; xx++) {
    const k = idx(m, xx, yy);
    if (reserved[k] || m.solid[k] || (m.tiles[k] !== T.GROUND && m.tiles[k] !== T.GROUND2)) continue;
    let near = false;
    for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1; i++) { const t = m.tiles[idx(m, xx + i, yy + j)]; if (t === T.ROAD || t === T.PLAZA) { near = true; break; } }
    if (near) continue;
    const dens = inZone(xx, yy) ? 0.14 : [0.36, 0.28, 0.2][L];
    if (rng() > dens) continue;
    const pal = m.pals[m.pidx[k]];
    const wild = !inZone(xx, yy);
    // The wilds between neighbourhoods are mostly growth; props stay in town.
    const decor = wild
      ? [['tree_round', 5], ['tree_pine', 3], ['bush', 3], ['rock', 1], ['flowers', 1], ...pal.style.decor.filter(d => /tree|palm|bush|rock|flowers|mushroom|weeds|hedge/.test(d[0]))]
      : pal.style.decor.slice();
    if (pal.mood < -0.3) decor.push(['tree_dead', 3], ['weeds', 2], ['puddle', 2]);
    if (pal.mood > 0.3) decor.push(['flowers', 3]);
    const d = rng.weighted(decor);
    if (d === 'puddle') { m.flat.push({ x: xx, y: yy, spr: ['puddle'], pi: m.pidx[k] }); continue; }
    if (d === 'fountain' || d === 'stall') {
      let ok = true;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const kk = idx(m, xx + i, yy - j); if (reserved[kk] || m.solid[kk] || (m.tiles[kk] !== T.GROUND && m.tiles[kk] !== T.GROUND2)) ok = false; }
      if (!ok) continue;
      block(m, xx, yy); block(m, xx + 1, yy); block(m, xx, yy - 1); block(m, xx + 1, yy - 1);
      m.objs.push({ x: xx, y: yy, w: 2, spr: ['decor', d], pi: m.pidx[k] });
      continue;
    }
    const soft = W.SOFT_DECOR.has(d);
    if (!soft) block(m, xx, yy);
    m.objs.push({ x: xx, y: yy, w: 1, spr: ['decor', d], pi: m.pidx[k], soft, tree: W.TREES.has(d), rock: d === 'rock' });
  }

  // Townsfolk.
  const walk = [];
  for (let yy = B; yy < h - B; yy++) for (let xx = B; xx < w - B; xx++) { const k = idx(m, xx, yy); if ((m.tiles[k] === T.ROAD || m.tiles[k] === T.PLAZA) && !m.solid[k] && !m.trig.has(k)) walk.push([xx, yy]); }
  const nNpc = Math.min(14, 2 + placed.length * 2);
  for (let i = 0; i < nNpc && walk.length; i++) {
    const [x, y] = walk[Math.floor(rng() * walk.length)];
    const pal = m.pals[m.pidx[idx(m, x, y)]];
    const lines = LEX.CHATTER[pal.primary] || LEX.CHATTER.plain;
    const zone = m.zones.find(z => x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h);
    m.npcs.push(W.makeNpc(area, i, x, y, lines[(i + U.hash(area.node.id)) % lines.length], rng, zone ? zone.node.name : area.node.name));
  }
  return m;
}

// ═══════════════════════════ INDOOR ════════════════════════════════════
// Objects go where their function says: art hangs on walls, racks line up
// against a wall, desks form clusters, showpieces stand in the open.

W.FUNC = { artwork: 'wallart', server: 'rack', console: 'rack', arcade: 'rack', jukebox: 'rack', tv: 'rack', chest: 'storage', safe: 'storage', terminal: 'desk', desk: 'desk', ledger: 'desk', lectern: 'desk', easel: 'display', statue: 'display', pedestal: 'display', sign: 'display', mailbox: 'entry' };
const RACK_ORDER = ['server', 'console', 'arcade', 'tv', 'jukebox'];
const ROOM_TYPES = [
  { key: 'gallery', title: 'Gallery', kinds: ['artwork', 'easel'] },
  { key: 'machine', title: 'Machine room', kinds: ['server', 'console'] },
  { key: 'office', title: 'Office', kinds: ['terminal', 'desk', 'ledger', 'lectern', 'mailbox'] },
  { key: 'lounge', title: 'Lounge', kinds: ['tv', 'jukebox', 'arcade'] },
  { key: 'storage', title: 'Storage', kinds: ['chest', 'safe'] },
  { key: 'showroom', title: 'Showroom', kinds: ['statue', 'pedestal', 'sign'] },
];

// Lay out one room. Returns null if it does not fit in iw×ih.
function tryRoom(room, iw, ih) {
  const occ = new Uint8Array(iw * ih), res = new Uint8Array(iw * ih);
  const at = (x, y) => y * iw + x;
  const out = { iw, ih, doors: [], guards: [], art: [], cells: [], partitions: [], topFree: [] };
  const dx = Math.floor(iw / 2);
  res[at(dx, ih - 1)] = 1; res[at(dx, ih - 2)] = 1;
  // Walkway ring must stay free (so every wall-side object can be reached).
  for (let x = 1; x < iw - 1; x++) { res[at(x, 1)] = 1; res[at(x, ih - 2)] = 1; }
  for (let y = 1; y < ih - 1; y++) { res[at(1, y)] = 1; res[at(iw - 2, y)] = 1; }
  // Corners stay for plants — an object there could be boxed in.
  for (const [cx, cy] of [[0, 0], [iw - 1, 0], [0, ih - 1], [iw - 1, ih - 1]]) res[at(cx, cy)] = 1;
  // Back wall: doors first, then art.
  const faceUsed = new Uint8Array(iw);
  // Wall columns 1..iw-2 only: the corner floor tiles can get boxed in.
  let fx = 1;
  const nextFace = (need2) => { while (fx < iw - 1 && (faceUsed[fx] || (need2 && (fx + 1 >= iw - 1 || faceUsed[fx + 1])))) fx++; return fx < iw - 1 ? fx : -1; };
  for (const d of room.doors) {
    const x = nextFace(d.secure);
    if (x < 0) return null;
    faceUsed[x] = 1; res[at(x, 0)] = 1;
    out.doors.push({ ...d, x });
    if (d.secure) { faceUsed[x + 1] = 1; occ[at(x + 1, 0)] = 1; out.guards.push({ x: x + 1, y: 0, d }); }
    fx = x + 2;
  }
  const art = room.byFunc.wallart.slice();
  fx = 1;
  const overflow = [];
  for (const it of art) {
    const x = nextFace(false);
    if (x < 0 || occ[at(x, 0)]) { overflow.push(it); continue; }
    faceUsed[x] = 1; res[at(x, 0)] = 1; out.art.push({ x, it });
    fx = x + 1;
  }
  // Perimeter slots for racks, storage, entry pieces.
  const peri = [];
  for (let x = 0; x < iw; x++) peri.push([x, 0]);
  for (let y = 1; y < ih - 1; y++) peri.push([iw - 1, y]);
  for (let x = iw - 1; x >= 0; x--) peri.push([x, ih - 1]);
  for (let y = ih - 2; y >= 1; y--) peri.push([0, y]);
  const freeP = (x, y) => !occ[at(x, y)] && !res[at(x, y)] && !(y === ih - 1 && Math.abs(x - dx) <= 1);
  let pi = 0;
  const placeRun = (list) => {
    for (const it of list) {
      while (pi < peri.length && !freeP(...peri[pi])) pi++;
      if (pi >= peri.length) return false;
      const [x, y] = peri[pi++]; occ[at(x, y)] = 1; out.cells.push({ x, y, it });
    }
    pi++; // small gap between clusters
    return true;
  };
  for (const bc of room.byFunc.bookcase) {
    while (pi < peri.length && !freeP(...peri[pi])) pi++;
    if (pi >= peri.length) return null;
    const [x, y] = peri[pi++]; occ[at(x, y)] = 1; out.cells.push({ x, y, bookcase: bc });
  }
  const racks = room.byFunc.rack.slice().sort((a, b) => RACK_ORDER.indexOf(a.kind) - RACK_ORDER.indexOf(b.kind) || (a.f.name < b.f.name ? -1 : 1));
  const groupsR = []; let g = [];
  racks.forEach((it, i) => { if (g.length && g[0].kind !== it.kind) { groupsR.push(g); g = []; } g.push(it); });
  if (g.length) groupsR.push(g);
  for (const grp of groupsR) if (!placeRun(grp)) return null;
  if (!placeRun(room.byFunc.storage)) return null;
  const display = room.byFunc.display.slice();
  for (const it of room.byFunc.entry) {
    const spots = [[dx - 2, ih - 1], [dx + 2, ih - 1], [dx - 3, ih - 1], [dx + 3, ih - 1]];
    const s = spots.find(([x, y]) => x >= 0 && x < iw && freeP(x, y));
    if (!s) { display.push(it); continue; }
    occ[at(s[0], s[1])] = 1; out.cells.push({ x: s[0], y: s[1], it });
  }
  // Interior rows: desk clusters, partition walls for extra art, showpieces.
  const cols = iw - 4, rowsY = [];
  for (let y = 2; y <= ih - 3; y += 2) rowsY.push(y);
  const jobs = [];
  const desks = room.byFunc.desk.slice();
  while (desks.length) jobs.push({ type: 'desk', list: desks.splice(0, Math.max(1, cols - Math.floor(cols / 4))) });
  const ov = overflow.slice();
  while (ov.length) jobs.push({ type: 'part', list: ov.splice(0, Math.max(1, cols)) });
  const disp = display;
  while (disp.length) jobs.push({ type: 'disp', list: disp.splice(0, Math.max(1, Math.ceil(cols / 2))) });
  if (jobs.length && (jobs.length > rowsY.length || cols < 1)) return null;
  jobs.forEach((job, r) => {
    const y = rowsY[r];
    if (job.type === 'desk') {
      // clusters of three with a one-tile aisle
      const n = job.list.length, width = n + Math.floor((n - 1) / 3);
      let x = 2 + Math.floor((cols - width) / 2);
      job.list.forEach((it, i) => { if (i && i % 3 === 0) x++; out.cells.push({ x, y, it }); x++; });
    } else if (job.type === 'part') {
      const n = job.list.length; const x0 = 2 + Math.floor((cols - n) / 2);
      out.partitions.push({ x: x0, y, len: n, arts: job.list.map((it, i) => ({ x: x0 + i, it })) });
    } else {
      const n = job.list.length, width = n * 2 - 1; const x0 = 2 + Math.floor((cols - width) / 2);
      job.list.forEach((it, i) => out.cells.push({ x: x0 + i * 2, y, it, display: true }));
    }
  });
  out.displayRows = jobs.map((j, r) => j.type === 'disp' ? rowsY[r] : -1).filter(v => v >= 0);
  for (let x = 0; x < iw; x++) if (!faceUsed[x]) out.topFree.push(x);
  out.occ = occ; out.res = res;
  return out;
}
function layoutRoom(room) {
  const nTop = room.doors.reduce((s, d) => s + (d.secure ? 2 : 1), 0) + room.doors.length;
  let iw = Math.max(5, Math.min(room.hallway ? 29 : 21, nTop + Math.min(room.byFunc.wallart.length, room.hallway ? 22 : 14) + 2));
  let ih = room.hallway ? 4 : 5;
  if (iw % 2 === 0) iw++;
  for (let a = 0; a < 60; a++) {
    const r = tryRoom(room, iw, ih);
    if (r) return r;
    if (a % 2 === 0 && ih < (room.hallway ? 6 : 21)) ih += 2; else iw += 2;
  }
  return tryRoom({ ...room, byFunc: { wallart: [], rack: [], storage: [], desk: [], display: [], entry: [] } }, iw, ih);
}
function roomFrom(title, sub, node, files, dirs, reading, secureFiles, hallway) {
  const byFunc = { wallart: [], rack: [], storage: [], desk: [], display: [], entry: [], bookcase: [] };
  for (const f of files) { const kind = W.info(f).kind; byFunc[W.FUNC[kind] || 'display'].push({ f, kind }); }
  for (const k of Object.keys(byFunc)) byFunc[k].sort((a, b) => (a.f.name < b.f.name ? -1 : 1));
  // A wall of paperwork becomes bookcases rather than a field of desks.
  if (byFunc.desk.length >= 6) {
    const shelved = byFunc.desk.splice(0, byFunc.desk.length);
    for (let i = 0; i < shelved.length; i += 8) byFunc.bookcase.push({ items: shelved.slice(i, i + 8) });
  }
  const doors = dirs.map(d => ({ node: d, secure: !!d.restricted }));
  if (secureFiles && secureFiles.length) doors.push({ secure: true, files: secureFiles, title: secureFiles.length === 1 ? secureFiles[0].name : `${secureFiles.length} restricted files` });
  return { title, sub, node, files, byFunc, doors, reading, hallway: !!hallway };
}

function planRooms(area) {
  const rooms = [];
  const { open, locked } = splitFiles(area.files);
  const main = { primary: area.primary, secondary: area.secondary, mood: area.mood };
  if (open.length > 12) {
    // A big pile of files is sorted into rooms by what the files are for.
    const byType = new Map();
    for (const f of open) { const kind = W.info(f).kind; const rt = ROOM_TYPES.find(t => t.kinds.includes(kind)) || ROOM_TYPES[5]; if (!byType.has(rt.key)) byType.set(rt.key, { rt, list: [] }); byType.get(rt.key).list.push(f); }
    const merged = [];
    let misc = [];
    for (const rt of ROOM_TYPES) { const e = byType.get(rt.key); if (!e) continue; if (e.list.length < 4) misc = misc.concat(e.list); else merged.push(e); }
    if (misc.length) merged.push({ rt: { title: 'Main hall' }, list: misc });
    merged.forEach((e, i) => {
      const CHUNK = 10;   // a room holds about this much before it needs a second one
      // Pictures and showpieces line a long hallway rather than filling a room.
      const isHall = e.rt.key === 'gallery' || e.rt.key === 'showroom';
      const size = isHall ? 14 : CHUNK;
      for (let j = 0; j < e.list.length; j += size) {
        const n = e.list.length > size ? ' ' + (j / size + 1) : '';
        rooms.push(roomFrom((isHall ? (e.rt.key === 'gallery' ? 'Hallway' : 'Long gallery') : e.rt.title) + n, 'Room', null, e.list.slice(j, j + size), [], main, i === 0 && j === 0 ? locked : null, isHall));
      }
    });
  } else if (open.length || locked.length || !area.childInfo.length) {
    const arty = open.length >= 6 && open.every(f => ['artwork', 'easel', 'statue', 'pedestal', 'sign'].includes(W.info(f).kind));
    rooms.push(roomFrom(arty ? 'Hallway' : (area.node.kind === 'group' && area.node.hall ? 'Hall' : 'Main hall'), 'Room', null, open, [], main, locked, arty));
  }
  for (const c of area.childInfo) {
    if (c.restricted) { rooms.push({ secureOnly: true, node: c.node }); continue; }
    const kids = c.kids || [];
    if (!kids.length) continue;                              // an empty folder gets no room
    const sp = splitFiles(kids.filter(k => k.kind === 'file'));
    rooms.push(roomFrom(c.node.name, TH.LEVELS[4], c.node, sp.open, kids.filter(k => k.kind !== 'file'), c.reading, sp.locked));
  }
  return rooms;
}

function genIndoor(area, isRoot) {
  const rooms = planRooms(area);
  const secureDirs = rooms.filter(r => r.secureOnly).map(r => r.node);
  const real = rooms.filter(r => !r.secureOnly);
  real.forEach(r => { r.lay = layoutRoom(r); });

  // Distribute rooms over floors (max ~46 tiles wide or 5 rooms each).
  const floors = []; let cur = [], curW = 0;
  for (const r of real) {
    const rw = r.lay.iw + 1;
    if (cur.length && (curW + rw > 30 || cur.length >= 2)) { floors.push(cur); cur = []; curW = 0; }
    cur.push(r); curW += rw;
  }
  if (cur.length || !floors.length) floors.push(cur);
  const secureW = secureDirs.length ? secureDirs.length * 3 + 1 : 0;
  const multi = floors.length > 1;

  // Measure floors.
  const F = floors.map((fr, fi) => {
    let wIn = fr.reduce((s, r) => s + r.lay.iw + 1, 0) + 1;
    if (fi === 0) wIn += secureW;
    wIn = Math.max(wIn, 11 + (multi ? 4 : 0));
    const maxIh = fr.length ? Math.max(...fr.map(r => r.lay.ih)) : 4;
    return { rooms: fr, w: wIn, h: 3 + maxIh + 2 + 3 + 1, maxIh };
  });
  const GAP = 5;
  const w = Math.max(...F.map(f => f.w)) + 2;
  const h = F.reduce((s, f) => s + f.h, 0) + GAP * (F.length - 1) + 2;
  const m = newMap(w, h, 'indoor', area);
  fillT(m, 0, 0, w, h, T.VOID, true, 0);
  m.floors = [];

  let oy = 1;
  F.forEach((fl, fi) => {
    const ox = 1;
    const yb = oy + 3 + fl.maxIh - 1;          // last interior row of the rooms
    const cTop = yb + 3, cBot = yb + 5;         // corridor rows
    m.floors.push({ x: 0, y: oy - 1, w, h: fl.h + 2, label: F.length > 1 ? `Floor ${fi + 1}` : null });
    // corridor + its back wall and bottom wall
    fillT(m, ox, yb + 1, fl.w, 1, T.WALLSIDE, true, 0);
    fillT(m, ox + 1, yb + 2, fl.w - 2, 1, T.WALLLO, true, 0);
    fillT(m, ox + 1, cTop, fl.w - 2, 3, T.FLOOR, false, 0);
    fillT(m, ox, cTop - 1, 1, 5, T.WALLSIDE, true, 0);
    fillT(m, ox + fl.w - 1, cTop - 1, 1, 5, T.WALLSIDE, true, 0);
    fillT(m, ox, cBot + 1, fl.w, 1, T.WALLSIDE, true, 0);
    // rooms
    let x = ox + 1;
    fl.rooms.forEach((r) => {
      const L = r.lay, pi = r.node ? addPal(m, r.reading) : 0;
      const pal = m.pals[pi];
      const y0 = yb - L.ih + 1;                 // first interior row
      fillT(m, x - 1, y0 - 3, 1, L.ih + 4, T.WALLSIDE, true, pi);
      fillT(m, x + L.iw, y0 - 3, 1, L.ih + 4, T.WALLSIDE, true, pi);
      fillT(m, x, y0 - 3, L.iw, 1, T.WALLCAP, true, pi);
      fillT(m, x, y0 - 2, L.iw, 1, T.WALLHI, true, pi);
      fillT(m, x, y0 - 1, L.iw, 1, T.WALLLO, true, pi);
      fillT(m, x, y0, L.iw, L.ih, T.FLOOR, false, pi);
      // doorway into the corridor
      const dxa = x + Math.floor(L.iw / 2);
      setT(m, dxa, yb + 1, T.FLOOR, false, pi); setT(m, dxa, yb + 2, T.FLOOR, false, 0);
      m.flat.push({ x: dxa, y: yb + 1, spr: ['doorway'], pi });
      m.labels.push({ x: dxa + 0.5, y: yb + 1.2, text: r.node ? W.pretty(r.title) : r.title, sub: r.node ? 'Room' : r.sub, id: r.node ? r.node.id : null, small: true });
      if (r.node) { m.zones.push({ x, y: y0, w: L.iw, h: L.ih + 1, node: r.node, reading: r.reading, kind: 'Room', pi }); m.doors.set(r.node.id, { x: dxa, y: cTop, f: fi }); }
      // rug under showpieces
      for (const ry of (L.displayRows || [])) fillT(m, x + 1, y0 + ry - 1, L.iw - 2, 3, T.RUG, undefined, pi);
      // back-wall doors (subfolders) and guarded doors
      for (const d of L.doors) {
        const X = x + d.x;
        if (!d.secure) {
          m.solid[idx(m, X, y0 - 1)] = 0;
          m.trig.set(idx(m, X, y0 - 1), { type: 'enter', node: d.node, level: 3, parentLevel: Math.max(3, area.level), via: r.node || null, viaKind: 'Room' });
          m.doors.set(d.node.id, { x: X, y: y0, f: fi });
          const bs = TH.buildingStyle(pal.primary, pal.mood, d.node.id);
          m.flat.push({ x: X, y: y0 - 2, spr: ['door', bs, d.node.kind === 'group'], pi });
          m.labels.push({ x: X + 0.5, y: y0 - 2.2, text: W.disp(d.node), sub: 'Door', id: d.node.id, door: { x: X, y: y0 - 1 }, small: true });
        } else {
          const title = d.node ? d.node.name : d.title, target = d.node ? { dir: d.node } : { files: d.files };
          m.flat.push({ x: X, y: y0 - 2, spr: ['securedoor'], pi });
          m.act.set(idx(m, X, y0 - 1), { type: 'vault', title, target });
          m.labels.push({ x: X + 0.5, y: y0 - 2.2, text: title, sub: 'Restricted', restricted: true, small: true });
        }
      }
      for (const gd of L.guards) {
        const X = x + gd.x, Y = y0 + gd.y; block(m, X, Y);
        const title = gd.d.node ? gd.d.node.name : gd.d.title, target = gd.d.node ? { dir: gd.d.node } : { files: gd.d.files };
        m.objs.push({ x: X, y: Y, w: 1, spr: ['guard'], pi, guard: true });
        m.act.set(idx(m, X, Y), { type: 'guard', title, target });
      }
      // wall art
      for (const a of L.art) {
        const X = x + a.x, Y = y0 - 1;
        m.objs.push({ x: X, y: Y, w: 1, spr: ['wallart'], pi, item: a.it.f, wall: true, oy: -3 });
        m.act.set(idx(m, X, Y), { type: 'item', node: a.it.f });
      }
      for (const pt of L.partitions) {
        fillT(m, x + pt.x, y0 + pt.y, pt.len, 1, T.PARTITION, true, pi);
        for (const a of pt.arts) { const X = x + a.x, Y = y0 + pt.y; m.objs.push({ x: X, y: Y, w: 1, spr: ['wallart'], pi, item: a.it.f, wall: true, oy: -1 }); m.act.set(idx(m, X, Y), { type: 'item', node: a.it.f }); }
      }
      for (const c of L.cells) {
        const X = x + c.x, Y = y0 + c.y; block(m, X, Y);
        if (c.bookcase) {
          m.objs.push({ x: X, y: Y, w: 1, spr: ['bookcase', c.bookcase.items.length], pi, bookcase: c.bookcase.items.map(i => i.f) });
          m.act.set(idx(m, X, Y), { type: 'bookcase', files: c.bookcase.items.map(i => i.f), room: r.node ? W.disp(r.node) : r.title });
          continue;
        }
        m.objs.push({ x: X, y: Y, w: 1, spr: ['item', c.it.kind, false], pi, item: c.it.f });
        m.act.set(idx(m, X, Y), { type: 'item', node: c.it.f });
      }
      // windows on bare wall, plants in bare corners
      const rr = U.rng('room:' + (r.node ? r.node.id : area.node.id + r.title));
      for (const fx of L.topFree) if (rr() < 0.45) m.flat.push({ x: x + fx, y: y0 - 2, spr: ['wallwin', rr.int(0, 2)], pi });
      for (const [cx, cy] of [[0, 0], [L.iw - 1, 0], [0, L.ih - 1], [L.iw - 1, L.ih - 1]]) {
        const k = cy * L.iw + cx;
        if (L.occ && !L.occ[k] && !(cy === L.ih - 1 && Math.abs(cx - Math.floor(L.iw / 2)) <= 1) && rr() < 0.8) {
          const X = x + cx, Y = y0 + cy; block(m, X, Y); m.objs.push({ x: X, y: Y, w: 1, spr: ['decor', 'plant'], pi });
        }
      }
      if (!r.files.length && !r.doors.length) m.flat.push({ x: x + 1, y: y0 + 1, spr: ['dust'], pi });
      x += L.iw + 1;
    });
    // Guarded doors for restricted subfolders, on the corridor's back wall.
    if (fi === 0) secureDirs.forEach((d, i) => {
      const X = x + i * 3; if (X >= ox + fl.w - 2) return;
      setT(m, X, yb + 1, T.WALLCAP, true, 0);
      m.flat.push({ x: X, y: yb + 1, spr: ['securedoor'], pi: 0 });
      m.act.set(idx(m, X, yb + 2), { type: 'vault', title: d.name, target: { dir: d } });
      block(m, X + 1, cTop); m.objs.push({ x: X + 1, y: cTop, w: 1, spr: ['guard'], pi: 0, guard: true });
      m.act.set(idx(m, X + 1, cTop), { type: 'guard', title: d.name, target: { dir: d } });
      m.labels.push({ x: X + 0.5, y: yb + 1.2, text: d.name, sub: 'Restricted', restricted: true, small: true });
    });
    // any leftover width above the corridor is solid wall
    for (let xx = ox; xx < ox + fl.w; xx++) for (let yy = oy; yy <= yb; yy++) { const k = idx(m, xx, yy); if (m.tiles[k] === T.VOID && yy >= yb - 1) { m.tiles[k] = T.WALLCAP; } }
    // corridor dressing
    const cr = U.rng('corr:' + area.node.id + fi);
    for (let xx = ox + 2; xx < ox + fl.w - 2; xx += cr.int(6, 9)) if (!m.solid[idx(m, xx, cBot)] && m.tiles[idx(m, xx, cBot + 1)] !== T.MAT) { block(m, xx, cBot); m.objs.push({ x: xx, y: cBot, w: 1, spr: ['decor', 'plant'], pi: 0 }); }
    // stairs
    if (fi < F.length - 1) { const sx = ox + fl.w - 2; m.solid[idx(m, sx, cBot)] = 0; m.objs = m.objs.filter(o => !(o.x === sx && o.y === cBot)); m.flat.push({ x: sx, y: cBot, spr: ['stairs', 'up'], pi: 0 }); fl.up = { x: sx, y: cBot }; }
    if (fi > 0) { const sx = ox + 1; m.solid[idx(m, sx, cBot)] = 0; m.objs = m.objs.filter(o => !(o.x === sx && o.y === cBot)); m.flat.push({ x: sx, y: cBot, spr: ['stairs', 'down'], pi: 0 }); fl.down = { x: sx, y: cBot }; }
    fl.entry = { x: ox + Math.floor(fl.w / 2), y: cBot + 1 };
    fl.cBot = cBot;
    oy += fl.h + GAP;
  });
  // link stairs
  F.forEach((fl, fi) => {
    if (fl.up) m.trig.set(idx(m, fl.up.x, fl.up.y), { type: 'stairs', to: { x: F[fi + 1].down.x + 1, y: F[fi + 1].down.y, dir: 'right' }, label: `Floor ${fi + 2}` });
    if (fl.down) m.trig.set(idx(m, fl.down.x, fl.down.y), { type: 'stairs', to: { x: F[fi - 1].up.x - 1, y: F[fi - 1].up.y, dir: 'left' }, label: `Floor ${fi}` });
  });
  // entrance
  const e = F[0].entry;
  setT(m, e.x, e.y, T.MAT, false, 0);
  if (!isRoot) { m.trig.set(idx(m, e.x, e.y), { type: 'exit' }); m.exitAt = e; } else block(m, e.x, e.y);
  m.objs = m.objs.filter(o => !(o.x === e.x && o.y === e.y - 1));
  m.solid[idx(m, e.x, e.y - 1)] = 0;
  m.spawn = { x: e.x, y: e.y - 1, dir: 'up' };

  // A resident wanders the corridor.
  const rr = U.rng('res:' + area.node.id);
  const lines = LEX.CHATTER[area.primary] || LEX.CHATTER.plain;
  for (let i = 0; i < (F.length > 1 ? 2 : 1); i++) {
    if (rr() > 0.85) continue;
    const fl = F[Math.min(i, F.length - 1)];
    const x = 3 + rr.int(0, Math.max(0, fl.w - 6)), y = fl.cBot - 1;
    if (!m.solid[idx(m, x, y)] && !m.npcs.some(n => n.x === x && n.y === y)) m.npcs.push(W.makeNpc(area, i, x, y, lines[(U.hash(area.node.id) + i) % lines.length], rr, area.node.name));
  }
  return m;
}
