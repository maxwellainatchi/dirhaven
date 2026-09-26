// ───────────────────────── sprites.js ─────────────────────────
// All pixel art is drawn procedurally at 16px/tile — no image assets.

const SP = {};
SP.cache = new Map();

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function pen(c) {
  const g = c.getContext('2d');
  return {
    g,
    r(x, y, w, h, col) { if (!col) return; g.fillStyle = col; g.fillRect(x | 0, y | 0, w | 0, h | 0); },
    p(x, y, col) { g.fillStyle = col; g.fillRect(x | 0, y | 0, 1, 1); },
    circ(cx, cy, rad, col) { g.fillStyle = col; for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad + rad * 0.8) g.fillRect(cx + x, cy + y, 1, 1); },
    glyph(rows, x, y, col, scale = 1) { g.fillStyle = col; rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') g.fillRect(x + i * scale, y + j * scale, scale, scale); })); },
  };
}
// 1px dark outline around opaque pixels — gives the chunky pixel-art edge.
function outline(c, col = '#1a1c24') {
  const g = c.getContext('2d'), w = c.width, h = c.height;
  const d = g.getImageData(0, 0, w, h), a = d.data;
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 40;
  const [R, G, B] = U.hexToRgb(col);
  const out = new Uint8ClampedArray(a);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (op(x, y)) continue;
    if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) { const k = (y * w + x) * 4; out[k] = R; out[k + 1] = G; out[k + 2] = B; out[k + 3] = 255; }
  }
  g.putImageData(new ImageData(out, w, h), 0, 0);
  return c;
}
const shade = (c, d) => U.adj(c, 0, 0, d);

// ── Ground tiles, painted straight into a map's ground canvas ──────────────
SP.paintTile = function (g, t, tx, ty, pal, rnd, m) {
  const X = tx * 16, Y = ty * 16, P = pen(g.canvas);
  const S = pal.style, TT = W.T;
  const R = (x, y, w, h, c) => P.r(X + x, Y + y, w, h, c);
  const speck = (n, c) => { for (let i = 0; i < n; i++) R(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 1, 1, c); };
  const kind = t === TT.GROUND || t === TT.GROUND2 ? S.ground : null;
  const base = t === TT.GROUND2 ? pal.ground2 : pal.ground;

  if (kind) {
    R(0, 0, 16, 16, base);
    if (kind === 'grass') { for (let i = 0; i < 5; i++) { const x = Math.floor(rnd() * 15), y = Math.floor(rnd() * 14); R(x, y, 1, 2, pal.grassDark); } speck(3, pal.ground3); }
    else if (kind === 'paved') { R(0, 0, 16, 1, shade(base, -0.05)); R(0, 0, 1, 16, shade(base, -0.05)); speck(3, shade(base, 0.04)); }
    else if (kind === 'cobble') { R(0, 0, 16, 16, shade(base, -0.1)); const off = (ty % 2) * 4; for (let j = 0; j < 2; j++) for (let i = -1; i < 3; i++) { const x = i * 8 + off + (j % 2) * 4, y = j * 8; R(x + 1, y + 1, 6, 6, j === 0 ? base : pal.ground3); } }
    else if (kind === 'marble') { R(0, 15, 16, 1, shade(base, -0.08)); R(15, 0, 1, 16, shade(base, -0.08)); if (rnd() < 0.4) { let x = Math.floor(rnd() * 16); for (let y = 0; y < 16; y += 2) { R(x, y, 1, 2, shade(base, -0.05)); x += rnd() < 0.5 ? 1 : -1; } } }
    else if (kind === 'sand') { speck(6, shade(base, -0.07)); speck(3, shade(base, 0.06)); }
    else if (kind === 'stone') { R(0, 0, 16, 16, shade(base, -0.1)); R(1, 1, 7, 6, base); R(9, 1, 6, 6, pal.ground3); R(1, 8, 5, 7, pal.ground3); R(7, 8, 8, 7, base); }
    return;
  }
  if (t === TT.ROAD || t === TT.PATH) {
    const rb = t === TT.PATH ? pal.road3 : pal.road;
    R(0, 0, 16, 16, rb);
    if (S.road === 'dirt') { speck(4, pal.road2); speck(2, shade(rb, 0.08)); }
    else if (S.road === 'asphalt') { speck(5, shade(rb, 0.05)); if (t === TT.PATH) { R(0, 0, 16, 1, shade(rb, -0.06)); } }
    else if (S.road === 'cobble') { R(0, 0, 16, 16, pal.road2); for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) R(i * 4 + (j % 2) * 2, j * 4, 3, 3, (i + j) % 3 ? rb : pal.road3); }
    else { R(0, 15, 16, 1, pal.road2); R(8 * (ty % 2), 0, 1, 16, pal.road2); speck(2, pal.road3); }
    return;
  }
  if (t === TT.PLAZA) {
    const a = U.mix(pal.road3, pal.accent, 0.18), b = U.mix(pal.road3, '#ffffff', 0.2);
    R(0, 0, 16, 16, a); R(0, 0, 8, 8, b); R(8, 8, 8, 8, b); R(0, 15, 16, 1, shade(a, -0.08));
    return;
  }
  if (t === TT.BORDER) {
    const bd = S.border;
    if (bd === 'forest') { R(0, 0, 16, 16, pal.leafDark); for (let i = 0; i < 3; i++) P.circ(X + 3 + Math.floor(rnd() * 10), Y + 3 + Math.floor(rnd() * 10), 4, i % 2 ? pal.leaf : pal.leafDark); speck(4, pal.leafLight); }
    else if (bd === 'hedge') { R(0, 0, 16, 16, pal.leafDark); R(1, 1, 14, 12, pal.leaf); speck(6, pal.leafLight); speck(4, pal.leafDark); }
    else if (bd === 'water') { R(0, 0, 16, 16, pal.water); for (let i = 0; i < 2; i++) { const x = Math.floor(rnd() * 11), y = Math.floor(rnd() * 14); R(x, y, 5, 1, pal.waterLight); } }
    else { R(0, 0, 16, 16, pal.stoneDark); const off = (ty % 2) * 8; R(0, 0, 16, 1, pal.stoneLight); for (let j = 0; j < 2; j++) { R(0, j * 8 + 1, 16, 6, pal.stone); R((off + j * 8) % 16, j * 8, 1, 8, pal.stoneDark); } }
    return;
  }
  if (t === TT.FLOOR || t === TT.RUG || t === TT.MAT) {
    const f = pal.floor, fd = shade(f, -0.07), fl = shade(f, 0.05);
    const fk = S.floor;
    R(0, 0, 16, 16, f);
    if (fk === 'wood') { for (let j = 0; j < 4; j++) { R(0, j * 4 + 3, 16, 1, fd); R(((j * 7 + tx * 5) % 16), j * 4, 1, 3, fd); } }
    else if (fk === 'metal') { R(0, 0, 16, 1, fl); R(0, 0, 1, 16, fl); R(15, 0, 1, 16, fd); R(0, 15, 16, 1, fd); R(2, 2, 1, 1, fd); R(13, 2, 1, 1, fd); R(2, 13, 1, 1, fd); R(13, 13, 1, 1, fd); }
    else if (fk === 'carpet') { for (let j = 0; j < 16; j += 4) for (let i = (j / 4) % 2 * 2; i < 16; i += 4) R(i, j, 1, 1, fl); }
    else if (fk === 'checker') { const alt = pal.primary === 'food' ? '#c9453a' : shade(f, -0.55); if ((tx + ty) % 2) R(0, 0, 16, 16, alt); }
    else if (fk === 'parquet') { for (let j = 0; j < 4; j++) for (let i = 0; i < 2; i++) R(i * 8, j * 4, 8, 1, fd), R(i * 8 + ((j % 2) ? 4 : 0), j * 4, 1, 4, fd); }
    else if (fk === 'tile') { R(0, 0, 16, 1, fd); R(0, 0, 1, 16, fd); R(1, 1, 3, 1, fl); }
    else if (fk === 'stars') { speck(3, pal.accent); speck(2, '#ff4fa0'); speck(2, '#6fe0ef'); }
    else if (fk === 'stone') { R(0, 0, 16, 16, fd); R(1, 1, 7, 6, f); R(9, 1, 6, 6, fl); R(1, 8, 5, 7, fl); R(7, 8, 8, 7, f); }
    if (t === TT.RUG) {
      const rc = U.mix(pal.accent, '#7a2e2e', 0.35), rl = shade(rc, 0.1);
      R(0, 0, 16, 16, rc);
      const w = m.w, i = ty * w + tx, isR = (dx, dy) => m.tiles[i + dy * w + dx] === TT.RUG;
      if (!isR(0, -1)) R(0, 1, 16, 1, pal.accent2); if (!isR(0, 1)) R(0, 14, 16, 1, pal.accent2);
      if (!isR(-1, 0)) R(1, 0, 1, 16, pal.accent2); if (!isR(1, 0)) R(14, 0, 1, 16, pal.accent2);
      if ((tx + ty) % 2) { R(7, 5, 2, 6, rl); R(5, 7, 6, 2, rl); }
    }
    if (t === TT.MAT) { R(3, 0, 10, 16, '#1e1f26'); R(4, 6, 8, 8, shade(pal.accent, -0.25)); R(5, 7, 6, 1, pal.accent); }
    return;
  }
  if (t === TT.VOID) { R(0, 0, 16, 16, '#0b0c11'); return; }
  if (t === TT.WALLCAP || t === TT.WALLSIDE) {
    R(0, 0, 16, 16, shade(pal.wall, -0.42));
    const up = ty > 0 ? m.tiles[(ty - 1) * m.w + tx] : TT.VOID;
    if (up === TT.VOID || up === TT.FLOOR || up === TT.RUG) R(0, 0, 16, 2, shade(pal.wall, -0.3));
    return;
  }
  if (t === TT.WALLHI || t === TT.WALLLO) {
    const pc = pal.paper;
    R(0, 0, 16, 16, pc);
    if (t === TT.WALLHI) { for (let i = 2; i < 16; i += 6) R(i, 0, 2, 16, shade(pc, -0.04)); R(0, 0, 16, 2, shade(pc, -0.12)); }
    else { for (let i = 2; i < 16; i += 6) R(i, 0, 2, 11, shade(pc, -0.04)); R(0, 11, 16, 1, shade(pc, 0.08)); R(0, 12, 16, 4, shade(pal.wall, -0.2)); }
    return;
  }
  if (t === TT.PARTITION) {
    const f = pal.floor; R(0, 0, 16, 16, f);
    R(0, 1, 16, 4, shade(pal.wall, -0.35)); R(0, 5, 16, 9, pal.paper); R(0, 12, 16, 3, shade(pal.wall, -0.2)); R(0, 15, 16, 1, 'rgba(0,0,0,0.25)');
    return;
  }
};

// ── Flat things painted onto the ground layer ──────────────────────────
SP.paintFlat = function (g, f, pal) {
  const X = f.x * 16, Y = f.y * 16, P = pen(g.canvas);
  const R = (x, y, w, h, c) => P.r(X + x, Y + y, w, h, c);
  const k = f.spr[0];
  if (k === 'door') {
    const bs = f.spr[1], group = f.spr[2];
    R(1, 2, 14, 30, shade(pal.wall, -0.35)); R(3, 4, 10, 28, bs.door); R(3, 4, 10, 2, shade(bs.door, 0.12));
    R(4, 8, 8, 9, shade(bs.door, -0.08)); R(4, 19, 8, 11, shade(bs.door, -0.08)); R(11, 19, 1, 2, '#e8c860');
    if (group) { R(5, 10, 6, 1, pal.white); R(5, 12, 6, 1, pal.white); R(5, 14, 6, 1, pal.white); }
    else { const gl = TH.GLYPH[bs.tag] || TH.GLYPH.plain; R(4, 9, 8, 7, bs.accent); P.glyph(gl, X + 4.5, Y + 9, shade(bs.accent, -0.5)); }
  } else if (k === 'securedoor') {
    R(0, 2, 16, 30, '#2a2c31'); R(2, 4, 12, 28, '#6f747e'); R(2, 4, 12, 2, '#8a909b');
    for (let i = 0; i < 12; i += 4) R(2 + i, 28, 2, 4, '#f2c14e'), R(4 + i, 28, 2, 4, '#1a1c24');
    R(7, 10, 2, 16, '#50545c'); R(11, 14, 3, 5, '#1a1c24'); R(12, 15, 1, 1, '#ff3b3b'); R(12, 17, 1, 1, '#555');
  } else if (k === 'wallwin') {
    const v = f.spr[1];
    if (v === 0 || v === 2) { R(3, 4, 10, 10, shade(pal.wall, -0.3)); R(4, 5, 8, 8, U.mix('#9fd0ef', pal.accent, 0.1)); R(4, 5, 3, 3, '#d8eefb'); R(7, 5, 1, 8, shade(pal.wall, -0.3)); R(4, 9, 8, 1, shade(pal.wall, -0.3)); R(2, 14, 12, 2, shade(pal.wall, -0.1)); }
    else { P.circ(X + 8, Y + 9, 5, '#f4f1ea'); P.circ(X + 8, Y + 9, 4, pal.white); R(8, 6, 1, 4, '#1a1c24'); R(8, 9, 3, 1, '#1a1c24'); }
  } else if (k === 'dust') {
    for (let i = 0; i < 9; i++) R((i * 7) % 40, (i * 5) % 12, 1, 1, shade(pal.floor, 0.15));
  } else if (k === 'puddle') {
    R(3, 9, 10, 4, U.mix(pal.water, pal.ground, 0.3)); R(5, 8, 6, 1, U.mix(pal.water, pal.ground, 0.3)); R(5, 10, 4, 1, pal.waterLight);
  } else if (k === 'reader') {
    // keycard reader bolted beside a locked door
    R(1, 3, 14, 12, '#2a2c31'); R(2, 4, 12, 10, '#50545c');
    R(4, 6, 8, 3, '#1a1c24'); R(5, 7, 2, 1, '#ff3b3b');
    R(4, 10, 8, 2, '#1a1c24'); R(5, 10, 6, 1, '#8a909b');
    for (let i = 0; i < 16; i += 4) { R(i, 0, 2, 3, '#f2c14e'); R(i + 2, 0, 2, 3, '#1a1c24'); }
  } else if (k === 'doorway') {
    // open doorway through a wall: dark jambs, a lintel, a threshold
    R(0, 0, 16, 32, pal.floor); R(0, 0, 2, 32, shade(pal.wall, -0.45)); R(14, 0, 2, 32, shade(pal.wall, -0.45));
    R(0, 0, 16, 3, shade(pal.wall, -0.5)); R(2, 28, 12, 2, shade(pal.floor, -0.15));
  } else if (k === 'stairs') {
    const up = f.spr[1] === 'up';
    for (let i = 0; i < 5; i++) { const y = up ? i * 3 : 13 - i * 3; R(1, y, 14, 3, shade(pal.wall, up ? -0.1 - i * 0.07 : -0.4 + i * 0.07)); R(1, y, 14, 1, shade(pal.wall, 0.08)); }
    P.glyph(up ? ['..#..', '.###.', '#####'] : ['#####', '.###.', '..#..'], X + 5.5, Y + 6, '#f4f1ea');
  } else if (k === 'signpost_flat') {
    R(7, 4, 2, 12, pal.trunk); R(2, 3, 12, 6, '#c8a46a'); R(2, 3, 12, 1, '#e0c48e'); R(4, 5, 8, 1, '#6b4a2e'); R(4, 7, 5, 1, '#6b4a2e');
  }
};

// ── Characters ─────────────────────────────────────────────────────────
const LOOKS = [
  { shirt: '#3f7fd0', pants: '#2d3542', hair: '#3a2718', skin: '#f0c8a0' },
  { shirt: '#d9573f', pants: '#3a3d44', hair: '#1a1c24', skin: '#c68a5a' },
  { shirt: '#4caf6a', pants: '#5a4a3a', hair: '#a86a2e', skin: '#f3d2b0' },
  { shirt: '#9b7fe0', pants: '#2d3542', hair: '#e8c860', skin: '#e8b890' },
  { shirt: '#e0a33f', pants: '#34495e', hair: '#5a3a28', skin: '#8d5a3a' },
  { shirt: '#e8577a', pants: '#2c2f3a', hair: '#2c1c14', skin: '#f0c8a0' },
];
SP.PLAYER = { shirt: '#d9a441', pants: '#2b3a55', hair: '#2b1d14', skin: '#f0c8a0', scarf: '#e0533d' };

SP.person = function (look, dir, frame, extra) {
  const key = 'p:' + JSON.stringify(look) + dir + frame + (extra || '');
  if (SP.cache.has(key)) return SP.cache.get(key);
  const c = cv(16, 22), P = pen(c), R = P.r;
  const step = frame % 2 ? 1 : 0;
  // legs
  if (dir === 'left' || dir === 'right') { R(6, 16, 2, 4 + (step ? -1 : 0), look.pants); R(8, 16, 2, 4 - (step ? 0 : 1) + step, look.pants); R(6, 20, 4, 1, '#1a1c24'); }
  else { R(5, 16, 2, step ? 3 : 4, look.pants); R(9, 16, 2, step ? 4 : 3, look.pants); R(5, 19 + (step ? -1 : 0), 2, 1, '#1a1c24'); R(9, 19 + (step ? 0 : -1), 2, 1, '#1a1c24'); }
  // body
  R(4, 10, 8, 7, look.shirt); R(4, 10, 8, 1, shade(look.shirt, 0.12));
  if (dir !== 'up') R(7, 10, 2, 1, look.skin);
  if (look.scarf) R(4, 10, 8, 2, look.scarf);
  if (extra === 'guard') { R(4, 16, 8, 1, '#1a1c24'); R(9, 12, 2, 2, '#e8c860'); }
  // arms
  if (dir === 'left') R(6, 11, 2, 5, shade(look.shirt, -0.1)); else if (dir === 'right') R(8, 11, 2, 5, shade(look.shirt, -0.1));
  else { R(3, 11, 1, 5, shade(look.shirt, -0.1)); R(12, 11, 1, 5, shade(look.shirt, -0.1)); R(3, 15 + step, 1, 1, look.skin); R(12, 16 - step, 1, 1, look.skin); }
  // head
  R(4, 2, 8, 8, look.skin);
  R(4, 1, 8, 3, look.hair);
  if (dir === 'up') R(4, 1, 8, 7, look.hair);
  else if (dir === 'down') { R(4, 1, 8, 2, look.hair); R(4, 3, 1, 3, look.hair); R(11, 3, 1, 3, look.hair); R(6, 6, 1, 2, '#1a1c24'); R(9, 6, 1, 2, '#1a1c24'); R(5, 8, 1, 1, '#e89a8a'); R(10, 8, 1, 1, '#e89a8a'); }
  else if (dir === 'left') { R(8, 1, 4, 6, look.hair); R(5, 6, 1, 2, '#1a1c24'); }
  else { R(4, 1, 4, 6, look.hair); R(10, 6, 1, 2, '#1a1c24'); }
  if (extra === 'guard') { R(3, 0, 10, 3, '#1f2a44'); R(3, 3, 11, 1, '#141b2e'); R(7, 1, 2, 1, '#e8c860'); }
  outline(c);
  SP.cache.set(key, c);
  return c;
};
SP.npcLook = (i) => LOOKS[i % LOOKS.length];
SP.GUARD = { shirt: '#2a3a5e', pants: '#1f2a44', hair: '#2b1d14', skin: '#c68a5a' };

// ── Object sprites (y-sorted) ─────────────────────────────────────────
SP.get = function (spr, pal, extra) {
  const key = JSON.stringify(spr) + '|' + pal.primary + '|' + pal.mood.toFixed(2) + (extra || '');
  if (SP.cache.has(key)) return SP.cache.get(key);
  let c;
  const [k] = spr;
  if (k === 'decor') c = decor(spr[1], pal);
  else if (k === 'item') c = item(spr[1], pal, spr[2], extra);
  else if (k === 'building') c = building(spr[1], spr[2], spr[3], spr[4], spr[5], spr[6]);
  else if (k === 'wallart') c = wallArt(pal, null);
  else if (k === 'bookcase') c = bookcase(pal, spr[1]);
  else if (k === 'gate') c = gate(spr[1], spr[2], spr[3], pal);
  else if (k === 'vault') c = vault(spr[1]);
  else if (k === 'guard') c = SP.person(SP.GUARD, 'down', 0, 'guard');
  else c = cv(16, 16);
  SP.cache.set(key, c);
  return c;
};

function decor(name, pal) {
  let c, P;
  const mk = (w, h) => { c = cv(w, h); P = pen(c); return P.r; };
  let R;
  switch (name) {
    case 'tree_round': R = mk(16, 28); R(6, 18, 4, 9, pal.trunk); R(6, 18, 1, 9, pal.trunkDark); P.circ(8, 11, 7, pal.leafDark); P.circ(7, 9, 6, pal.leaf); P.circ(5, 7, 2, pal.leafLight); break;
    case 'tree_pine': R = mk(16, 30); R(7, 23, 2, 6, pal.trunk); for (let i = 0; i < 4; i++) { const w = 4 + i * 3; R(8 - w / 2, 4 + i * 5, w, 6, i % 2 ? pal.leafDark : shade(pal.leafDark, 0.05)); } R(7, 1, 2, 4, pal.leafDark); R(6, 8, 1, 1, pal.leafLight); R(5, 14, 1, 1, pal.leafLight); break;
    case 'palm': R = mk(16, 30); for (let i = 0; i < 18; i++) R(7 + Math.round(Math.sin(i / 5) * 1.5), 11 + i, 3, 1, i % 3 ? pal.trunk : pal.trunkDark); R(1, 8, 7, 2, pal.leaf); R(9, 8, 7, 2, pal.leaf); R(0, 10, 3, 2, pal.leafDark); R(13, 10, 3, 2, pal.leafDark); R(4, 5, 8, 3, pal.leaf); R(6, 3, 4, 2, pal.leafLight); R(7, 10, 2, 2, '#6b4a2e'); break;
    case 'tree_dead': R = mk(16, 26); R(7, 8, 2, 17, '#5a4a3a'); R(3, 6, 1, 6, '#5a4a3a'); R(3, 11, 4, 1, '#5a4a3a'); R(11, 4, 1, 7, '#5a4a3a'); R(9, 10, 3, 1, '#5a4a3a'); R(5, 3, 1, 4, '#5a4a3a'); break;
    case 'bush': R = mk(16, 16); P.circ(5, 10, 4, pal.leafDark); P.circ(11, 10, 4, pal.leafDark); P.circ(8, 8, 5, pal.leaf); R(5, 6, 2, 1, pal.leafLight); break;
    case 'hedge': R = mk(16, 18); R(1, 4, 14, 13, pal.leafDark); R(2, 3, 12, 11, pal.leaf); R(3, 4, 2, 1, pal.leafLight); R(9, 7, 2, 1, pal.leafLight); break;
    case 'flowers': R = mk(16, 16); for (let i = 0; i < 5; i++) { const x = 2 + (i * 5) % 12, y = 5 + (i * 3) % 8; R(x, y + 2, 1, 3, pal.leafDark); R(x - 1, y, 3, 2, i % 2 ? pal.flowerA : pal.flowerB); R(x, y, 1, 1, '#fff6c0'); } break;
    case 'mushroom': R = mk(16, 16); R(6, 9, 4, 5, '#f0e6d0'); R(3, 5, 10, 5, '#d9453a'); R(5, 6, 2, 2, '#fff'); R(9, 7, 2, 1, '#fff'); break;
    case 'weeds': R = mk(16, 16); for (let i = 0; i < 6; i++) R(2 + i * 2, 8 + (i % 3), 1, 7 - (i % 3), i % 2 ? '#7a7a4a' : '#5f6b3a'); break;
    case 'rubble': R = mk(16, 10); P.circ(5, 7, 2, pal.stoneDark); P.circ(11, 8, 2, pal.stone); R(7, 6, 3, 2, pal.stoneLight); R(2, 9, 12, 1, pal.stoneDark); break;
    case 'stump': R = mk(16, 12); P.circ(8, 8, 5, pal.trunkDark); P.circ(8, 7, 4, pal.trunk); R(6, 6, 4, 1, shade(pal.trunk, 0.12)); R(3, 10, 10, 1, pal.trunkDark); break;
    case 'rock': R = mk(16, 16); P.circ(8, 10, 5, pal.stoneDark); P.circ(7, 9, 4, pal.stone); R(5, 7, 2, 1, pal.stoneLight); break;
    case 'lamp': case 'lamp_gold': case 'lamp_neon': {
      R = mk(16, 30); const pole = name === 'lamp_gold' ? '#b8922e' : name === 'lamp_neon' ? '#2a2c31' : '#3a3d44';
      const glow = name === 'lamp_neon' ? pal.accent : '#ffe9a0';
      R(7, 8, 2, 21, pole); R(5, 27, 6, 2, pole); R(4, 3, 8, 6, pole); R(5, 4, 6, 4, glow); R(6, 4, 2, 1, '#fff'); break;
    }
    case 'bench': R = mk(16, 16); R(1, 6, 14, 2, '#8a5a33'); R(1, 9, 14, 2, '#a8703f'); R(2, 11, 1, 4, '#3a3d44'); R(13, 11, 1, 4, '#3a3d44'); break;
    case 'planter': R = mk(16, 20); R(3, 13, 10, 6, '#8d8a84'); R(3, 13, 10, 1, '#b4b0a8'); P.circ(8, 9, 5, pal.leaf); R(6, 6, 2, 1, pal.leafLight); break;
    case 'plant': R = mk(16, 22); P.circ(5, 10, 3, pal.leafDark); P.circ(11, 10, 3, pal.leafDark); P.circ(8, 7, 4, pal.leaf); P.circ(8, 12, 3, pal.leaf); R(6, 5, 2, 1, pal.leafLight); R(4, 15, 8, 6, '#b5654a'); R(4, 15, 8, 1, '#d08a6a'); R(5, 20, 6, 1, '#8a4a36'); break;
    case 'shelf': R = mk(16, 28); R(1, 2, 14, 25, '#6b4a2e'); for (let j = 0; j < 3; j++) { R(2, 4 + j * 8, 12, 6, '#3a2718'); for (let i = 0; i < 5; i++) R(2 + i * 2 + (j % 2), 5 + j * 8, 2, 5, ['#d9573f', '#3f7fd0', '#e8c860', '#4caf6a', '#9b7fe0'][(i + j) % 5]); } break;
    case 'signpost': R = mk(16, 22); R(7, 6, 2, 15, pal.trunk); R(1, 4, 14, 5, '#c8a46a'); R(3, 6, 9, 1, '#6b4a2e'); R(14, 5, 2, 3, '#c8a46a'); break;
    case 'antenna': R = mk(16, 30); R(7, 4, 2, 25, '#6f747e'); R(3, 8, 10, 1, '#6f747e'); R(5, 14, 6, 1, '#6f747e'); R(7, 1, 2, 3, '#ff3b3b'); R(4, 27, 8, 2, '#3a3d44'); break;
    case 'vending': R = mk(16, 26); R(1, 3, 14, 22, pal.accent); R(3, 5, 8, 14, '#1a1c24'); for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) R(4 + i * 2 + i, 6 + j * 4, 2, 3, ['#e8577a', '#f2c14e', '#6fe0ef'][(i + j) % 3]); R(12, 8, 2, 4, '#1a1c24'); R(3, 21, 8, 2, '#1a1c24'); break;
    case 'cablebox': R = mk(16, 18); R(2, 5, 12, 12, '#6f747e'); R(2, 5, 12, 1, '#8a909b'); R(4, 8, 8, 1, '#50545c'); R(4, 11, 8, 1, '#50545c'); R(11, 14, 2, 1, pal.accent); break;
    case 'statue': R = mk(16, 30); R(3, 22, 10, 7, pal.stone); R(3, 22, 10, 1, pal.stoneLight); R(6, 6, 4, 16, pal.stoneLight); P.circ(8, 5, 3, pal.stoneLight); R(4, 10, 2, 6, pal.stone); R(10, 9, 2, 5, pal.stone); break;
    case 'banner': R = mk(16, 30); R(3, 2, 1, 27, '#3a3d44'); R(4, 3, 9, 14, pal.accent); R(4, 17, 4, 3, pal.accent); R(9, 17, 4, 3, pal.accent); R(6, 7, 5, 5, pal.accent2); break;
    case 'speaker': R = mk(16, 22); R(2, 3, 12, 18, '#2a2c31'); P.circ(8, 14, 4, '#50545c'); P.circ(8, 14, 2, '#1a1c24'); P.circ(8, 7, 2, '#50545c'); break;
    case 'poster': R = mk(16, 26); R(2, 2, 12, 16, '#3a3d44'); R(3, 3, 10, 14, pal.accent); R(4, 5, 8, 4, pal.accent2); R(4, 11, 8, 1, '#1a1c24'); R(4, 13, 6, 1, '#1a1c24'); R(7, 18, 2, 7, '#3a3d44'); break;
    case 'column': R = mk(16, 30); R(3, 2, 10, 3, '#ece6d6'); R(4, 5, 8, 20, '#ece6d6'); for (let i = 0; i < 3; i++) R(5 + i * 3, 5, 1, 20, '#cfc7b3'); R(2, 25, 12, 4, '#d3cdc0'); break;
    case 'fountain': R = mk(32, 32); P.circ(16, 22, 13, pal.stone); P.circ(16, 22, 11, pal.water); P.circ(14, 20, 3, pal.waterLight); R(14, 6, 4, 16, pal.stoneLight); R(10, 6, 12, 2, pal.stoneLight); R(15, 2, 2, 4, pal.waterLight); break;
    case 'stall': R = mk(32, 34); R(2, 18, 28, 14, '#8a5a33'); R(2, 18, 28, 2, '#a8703f'); for (let i = 0; i < 7; i++) R(1 + i * 4, 4, 4, 8, i % 2 ? '#f4f1ea' : pal.accent); R(1, 12, 30, 2, shade(pal.accent, -0.2)); R(3, 12, 1, 8, '#6b4a2e'); R(28, 12, 1, 8, '#6b4a2e'); for (let i = 0; i < 5; i++) P.circ(7 + i * 5, 17, 2, ['#e2683c', '#f2c14e', '#4caf6a', '#d9453a', '#9b7fe0'][i]); break;
    case 'barrel': R = mk(16, 20); R(3, 5, 10, 14, '#8a5a33'); R(3, 7, 10, 1, '#4a4f5a'); R(3, 15, 10, 1, '#4a4f5a'); R(4, 5, 8, 2, '#a8703f'); break;
    case 'crate': R = mk(16, 18); R(2, 4, 12, 13, '#b58a4a'); R(2, 4, 12, 1, '#d0a868'); R(2, 4, 1, 13, '#8a6a3a'); R(13, 4, 1, 13, '#8a6a3a'); for (let i = 0; i < 12; i++) R(2 + i, 4 + i, 1, 1, '#8a6a3a'); break;
    case 'mailbox': R = mk(16, 22); R(7, 10, 2, 11, pal.trunk); R(3, 4, 10, 7, '#3f7fd0'); R(3, 4, 10, 2, '#6aa0e8'); R(12, 2, 1, 5, '#d9453a'); R(12, 2, 3, 2, '#d9453a'); break;
    case 'dish': R = mk(16, 24); R(7, 14, 2, 9, '#8d8a84'); R(4, 21, 8, 2, '#66635e'); P.circ(8, 9, 6, '#e9eef0'); P.circ(9, 8, 4, '#c9d2d6'); R(8, 7, 1, 1, '#ff3b3b'); break;
    case 'tank': R = mk(16, 26); R(3, 4, 10, 20, '#cfd8dc'); R(4, 8, 8, 14, U.mix(pal.accent, '#ffffff', 0.3)); R(5, 10, 2, 2, '#fff'); R(8, 15, 1, 1, '#fff'); R(3, 3, 10, 2, '#8d8a84'); break;
    case 'flag': R = mk(16, 30); R(3, 1, 1, 28, '#8d8a84'); R(4, 2, 10, 7, pal.accent); R(4, 5, 10, 1, pal.accent2); break;
    case 'floodlight': R = mk(16, 30); R(7, 8, 2, 21, '#3a3d44'); R(3, 3, 10, 6, '#50545c'); R(4, 4, 8, 3, '#fff6c0'); break;
    case 'cone': R = mk(16, 16); R(6, 4, 4, 2, '#f08a2e'); R(5, 6, 6, 2, '#f4f1ea'); R(4, 8, 8, 4, '#f08a2e'); R(2, 12, 12, 2, '#d06a1e'); break;
    case 'suitcase': R = mk(16, 16); R(3, 6, 10, 9, '#c45f3a'); R(6, 4, 4, 2, '#4a321f'); R(3, 9, 10, 1, '#8a3f2a'); R(5, 7, 2, 2, '#f2c14e'); break;
    case 'arcade_out': c = item('arcade', pal, true); return c;
    default: R = mk(16, 16); R(4, 4, 8, 8, '#f0f');
  }
  return outline(c);
}

// File items. `thumb` (optional canvas) paints the real image into artworks.
function item(kind, pal, outdoor, thumb) {
  const c = cv(16, 26), P = pen(c), R = P.r;
  const base = () => { if (outdoor) { R(1, 21, 14, 4, pal.stone); R(1, 21, 14, 1, pal.stoneLight); } };
  switch (kind) {
    case 'artwork': {
      base(); R(7, 16, 2, 6, '#6b4a2e'); R(4, 21, 8, 1, '#6b4a2e');
      R(0, 2, 16, 14, '#c8962e'); R(1, 3, 14, 12, '#e8c060');
      R(2, 4, 12, 10, '#2a2c31');
      if (thumb) P.g.drawImage(thumb, 2, 4, 12, 10);
      else { R(2, 4, 12, 10, '#9fd0ef'); R(2, 10, 12, 4, '#6aa84f'); P.circ(10, 7, 1, '#f2c14e'); }
      break;
    }
    case 'easel': base(); R(4, 4, 2, 20, '#8a5a33'); R(10, 4, 2, 20, '#8a5a33'); R(7, 2, 2, 22, '#6b4a2e'); R(2, 4, 12, 11, '#f4f1ea'); R(3, 6, 4, 3, pal.accent); R(7, 9, 5, 3, pal.accent2); R(5, 11, 3, 2, '#3f7fd0'); R(1, 15, 14, 2, '#6b4a2e'); break;
    case 'jukebox': base(); R(2, 6, 12, 16, '#8a2e5a'); P.circ(8, 7, 6, '#8a2e5a'); R(4, 6, 8, 6, '#ffcc66'); for (let i = 0; i < 4; i++) R(3 + i * 3, 14, 2, 2, ['#ff4fa0', '#6fe0ef', '#f2c14e', '#7cfc6a'][i]); R(4, 17, 8, 4, '#3a1a2e'); R(4, 18, 8, 1, '#a8703f'); break;
    case 'tv': base(); R(1, 5, 14, 11, '#2a2c31'); R(2, 6, 12, 8, '#6fb8e6'); R(3, 7, 4, 2, '#d8eefb'); R(3, 16, 10, 6, '#6b4a2e'); R(4, 18, 8, 1, '#4a321f'); R(5, 2, 1, 3, '#50545c'); R(10, 2, 1, 3, '#50545c'); break;
    case 'terminal': base(); R(1, 14, 14, 3, '#8a5a33'); R(2, 17, 2, 5, '#6b4a2e'); R(12, 17, 2, 5, '#6b4a2e'); R(3, 3, 10, 9, '#2a2c31'); R(4, 4, 8, 7, '#0f2a1e'); R(5, 5, 4, 1, '#7cfc9a'); R(5, 7, 6, 1, '#7cfc9a'); R(5, 9, 3, 1, '#7cfc9a'); R(7, 12, 2, 2, '#2a2c31'); R(4, 13, 8, 1, '#50545c'); break;
    case 'console': base(); R(1, 8, 14, 14, '#50545c'); R(1, 8, 14, 2, '#6f747e'); R(3, 11, 10, 4, '#1a1c24'); R(4, 12, 3, 1, pal.accent); R(8, 13, 4, 1, '#7cfc9a'); for (let i = 0; i < 4; i++) R(3 + i * 3, 17, 2, 2, ['#ff3b3b', '#f2c14e', '#7cfc6a', '#6fe0ef'][i]); break;
    case 'server': { R(2, 0, 12, 24, '#2a2c31'); R(2, 0, 12, 1, '#50545c'); for (let j = 0; j < 5; j++) { R(3, 2 + j * 4, 10, 3, '#3a3d44'); R(4, 3 + j * 4, 1, 1, j % 2 ? '#7cfc6a' : '#6fe0ef'); R(6, 3 + j * 4, 1, 1, '#f2c14e'); R(8, 3 + j * 4, 4, 1, '#1a1c24'); } R(2, 22, 12, 2, '#1a1c24'); break; }
    case 'chest': base(); R(2, 10, 12, 11, '#8a5a33'); R(2, 8, 12, 4, '#a8703f'); R(2, 12, 12, 1, '#4a321f'); R(2, 8, 1, 13, '#c8962e'); R(13, 8, 1, 13, '#c8962e'); R(7, 11, 2, 3, '#e8c060'); break;
    case 'desk': base(); R(1, 12, 14, 3, '#8a5a33'); R(2, 15, 2, 7, '#6b4a2e'); R(12, 15, 2, 7, '#6b4a2e'); R(3, 9, 6, 3, '#f4f1ea'); R(4, 10, 4, 1, '#8d8a84'); R(11, 6, 1, 6, '#3a3d44'); R(9, 4, 5, 3, pal.accent); R(9, 11, 1, 1, '#3f7fd0'); break;
    case 'lectern': base(); R(6, 12, 4, 10, '#6b4a2e'); R(4, 21, 8, 1, '#4a321f'); R(1, 7, 14, 6, '#8a5a33'); R(2, 5, 6, 5, '#f4f1ea'); R(8, 5, 6, 5, '#e8e0cc'); R(3, 6, 4, 1, '#8d8a84'); R(9, 7, 4, 1, '#8d8a84'); R(7, 5, 2, 5, '#c8962e'); break;
    case 'ledger': base(); R(1, 12, 14, 3, '#6b4a2e'); R(2, 15, 2, 7, '#4a321f'); R(12, 15, 2, 7, '#4a321f'); R(2, 8, 9, 5, '#2e5a3a'); R(3, 9, 7, 3, '#f4f1ea'); R(4, 10, 5, 1, '#2e5a3a'); P.circ(13, 10, 1, '#e8c060'); R(12, 11, 3, 1, '#c8962e'); break;
    case 'sign': base(); R(7, 13, 2, 9, '#3a3d44'); R(1, 1, 14, 13, '#f4f1ea'); R(2, 2, 12, 11, pal.accent); P.glyph(['..#..', '.#.#.', '#...#', '#####', '#...#'], 5.5, 4, '#1a1c24', 1); break;
    case 'statue': R(2, 17, 12, 7, pal.stone); R(2, 17, 12, 1, pal.stoneLight); R(5, 4, 6, 13, U.mix(pal.accent, '#ffffff', 0.35)); P.circ(8, 4, 3, U.mix(pal.accent, '#ffffff', 0.35)); R(6, 8, 2, 6, U.mix(pal.accent, '#000000', 0.1)); break;
    case 'safe': base(); R(2, 6, 12, 15, '#6f747e'); R(2, 6, 12, 1, '#8a909b'); R(3, 7, 10, 13, '#5d6069'); P.circ(8, 13, 3, '#2a2c31'); P.circ(8, 13, 1, '#e8c060'); R(12, 11, 1, 4, '#2a2c31'); break;
    case 'mailbox': R(7, 10, 2, 12, '#6b4a2e'); R(3, 4, 10, 7, '#3f7fd0'); R(3, 4, 10, 2, '#6aa0e8'); R(12, 2, 1, 5, '#d9453a'); R(12, 2, 3, 2, '#d9453a'); R(5, 7, 5, 2, '#f4f1ea'); break;
    case 'arcade': base(); R(2, 2, 12, 20, '#43336a'); R(2, 2, 12, 3, pal.accent); R(3, 6, 10, 7, '#1a1c24'); R(4, 7, 3, 2, '#ff4fa0'); R(8, 9, 3, 2, '#6fe0ef'); R(2, 14, 12, 3, '#2a2046'); R(5, 14, 1, 2, '#ff3b3b'); R(9, 15, 2, 1, '#f2c14e'); break;
    default: base(); R(4, 14, 8, 8, pal.stone); R(3, 13, 10, 2, pal.stoneLight); P.circ(8, 9, 3, U.mix(pal.accent, '#ffffff', 0.4)); R(7, 7, 1, 1, '#fff'); break;
  }
  return outline(c);
}

function building(bw, bh, bs0, small, seed, hall) {
  const bs = hall ? { ...bs0, roofType: 'temple', window: 'arched' } : bs0;
  const W_ = bw * 16, roofExtra = bs.roofType === 'dome' ? 10 : bs.roofType === 'temple' ? 6 : 4;
  const H_ = bh * 16 + roofExtra;
  const c = cv(W_, H_), P = pen(c), R = P.r;
  const r = U.rng('b:' + seed);
  const wallTop = Math.round(H_ * (bs.roofType === 'flat' || bs.roofType === 'awning' ? 0.28 : 0.42));
  const wallH = H_ - wallTop;
  // walls
  R(1, wallTop, W_ - 2, wallH - 1, bs.wall);
  R(1, H_ - 4, W_ - 2, 3, bs.wallDark);
  if (bs.tag === 'work' || bs.tag === 'education') for (let y = wallTop + 2; y < H_ - 4; y += 3) for (let x = 1 + ((y / 3) % 2) * 3; x < W_ - 2; x += 6) R(x, y, 5, 1, shade(bs.wall, -0.08));
  if (bs.tag === 'nature') for (let y = wallTop + 2; y < H_ - 4; y += 4) R(1, y, W_ - 2, 1, bs.wallDark);
  // roof
  const rt = bs.roofType;
  if (rt === 'pitched' || small) {
    for (let y = 0; y < wallTop + 2; y++) {
      const inset = Math.max(0, Math.round((wallTop - y) * 0.35)) - 1;
      R(inset, y + 2, W_ - inset * 2, 1, y % 4 === 3 ? bs.roofDark : bs.roof);
    }
    R(0, wallTop, W_, 2, bs.roofDark);
    if (!small) { R(W_ - 14, 0, 5, 9, shade(bs.wallDark, -0.1)); R(W_ - 15, 0, 7, 2, bs.roofDark); }
  } else if (rt === 'flat' || rt === 'awning') {
    R(0, 2, W_, wallTop - 2, bs.roof); R(0, 2, W_, 2, bs.roofLight); R(0, wallTop - 2, W_, 2, bs.roofDark);
    R(4, 5, 8, 5, '#8d8a84'); R(5, 6, 6, 1, '#66635e');
  } else if (rt === 'temple') {
    for (let y = 0; y < wallTop; y++) { const inset = Math.max(0, Math.round((wallTop - y) * (W_ / 2) / wallTop)); R(inset, y, W_ - inset * 2, 1, y % 5 === 4 ? bs.roofDark : bs.roof); }
    R(0, wallTop - 3, W_, 3, bs.wallDark);
    for (let x = 3; x < W_ - 4; x += 8) R(x, wallTop, 4, wallH - 4, shade(bs.wall, 0.06)), R(x + 3, wallTop, 1, wallH - 4, shade(bs.wall, -0.1));
  } else if (rt === 'dome') {
    const rad = Math.min(W_ / 2 - 2, wallTop + 6);
    for (let y = -rad; y <= 0; y++) { const half = Math.round(Math.sqrt(rad * rad - y * y)); R(W_ / 2 - half, wallTop + y, half * 2, 1, (y % 4 === 0) ? bs.roofDark : bs.roof); }
    R(W_ / 2 - 3, wallTop - rad + 4, 2, rad - 6, bs.roofLight);
  }
  // windows
  const doorW = 10, doorX = Math.floor(W_ / 2 - doorW / 2);
  const winY = wallTop + 5;
  const rowsW = Math.max(1, Math.floor((H_ - 18 - winY) / 12));
  for (let x = 4; x < W_ - 10; x += 12) {
    if (x + 8 > doorX - 1 && x < doorX + doorW + 1) continue;
    for (let j = 0; j < rowsW; j++) {
      const y = winY + j * 12, lit = r() < 0.5;
      if (bs.window === 'glass') { R(x, y, 9, 9, shade(bs.glass, -0.25)); R(x + 1, y + 1, 7, 7, lit ? bs.glass : shade(bs.glass, -0.15)); R(x + 1, y + 1, 2, 7, shade(bs.glass, 0.2)); }
      else if (bs.window === 'arched') { R(x, y + 2, 8, 8, bs.wallDark); R(x + 1, y + 1, 6, 1, bs.wallDark); R(x + 1, y + 3, 6, 6, lit ? '#ffe9a0' : '#6a8fb0'); R(x + 4, y + 3, 1, 6, bs.wallDark); }
      else if (bs.window === 'slit') { R(x + 3, y, 3, 9, '#1a1c24'); R(x + 4, y + 1, 1, 7, '#ff3b3b'); }
      else { R(x, y, 8, 8, bs.wallDark); R(x + 1, y + 1, 6, 6, lit ? '#ffe9a0' : '#6a8fb0'); R(x + 4, y + 1, 1, 6, bs.wallDark); R(x + 1, y + 4, 6, 1, bs.wallDark); }
    }
  }
  if (rt === 'awning') for (let x = 0; x < W_; x += 4) R(x, wallTop + 1, 4, 5, (x / 4) % 2 ? '#f4f1ea' : bs.roof);
  // door + sign
  R(doorX - 1, H_ - 17, doorW + 2, 16, bs.wallDark);
  R(doorX, H_ - 16, doorW, 15, bs.door); R(doorX, H_ - 16, doorW, 2, shade(bs.door, 0.12));
  R(doorX + doorW - 3, H_ - 9, 1, 2, '#e8c860');
  if (!small) {
    const sy = H_ - 28;
    R(doorX - 1, sy, doorW + 2, 9, shade(bs.accent, -0.3)); R(doorX, sy + 1, doorW, 7, bs.accent);
    P.glyph(TH.GLYPH[bs.tag] || TH.GLYPH.plain, doorX + 1.5, sy + 1, shade(bs.accent, -0.55));
  }
  return outline(c);
}

function gate(level, tag, mood, pal) {
  const gw = level === 0 ? 7 : 5, gh = level === 0 ? 4 : 3;
  const bs = TH.buildingStyle(tag, mood, 'gate' + tag);
  const W_ = gw * 16, H_ = gh * 16 + 8;
  const c = cv(W_, H_), P = pen(c), R = P.r;
  const stone = level === 2 ? '#6b4a2e' : pal.stone, stoneD = level === 2 ? '#4a321f' : pal.stoneDark, stoneL = level === 2 ? '#8a5a33' : pal.stoneLight;
  const cx = W_ / 2, open = 16;
  // pillars / walls
  R(0, 14, cx - open / 2, H_ - 14, stone); R(cx + open / 2, 14, W_ - cx - open / 2, H_ - 14, stone);
  for (let y = 16; y < H_; y += 6) for (let x = (y / 6 % 2) * 4; x < W_; x += 8) if (x < cx - open / 2 - 1 || x > cx + open / 2) R(x, y, 1, 5, stoneD), R(x, y, 7, 1, stoneD);
  // arch
  R(cx - open / 2 - 2, 8, open + 4, 8, stone);
  R(cx - open / 2, 14, open, H_ - 14, '#1a1c24');
  R(cx - open / 2 + 2, 16, open - 4, H_ - 16, U.mix('#1a1c24', bs.accent, 0.35));
  for (let i = 0; i < 4; i++) R(cx - 3 + i * 2, H_ - 6 - i * 3, 1, 1, U.mix('#ffffff', bs.accent, 0.4));
  // crenellations / towers
  if (level <= 1) { for (let x = 0; x < W_; x += 8) R(x, 8, 5, 6, stone), R(x, 8, 5, 1, stoneL); }
  if (level === 0) { R(0, 0, 14, H_, stone); R(W_ - 14, 0, 14, H_, stone); for (const x of [0, W_ - 14]) { for (let i = 0; i < 3; i++) R(x + i * 5, 0, 3, 3, stoneL); R(x + 5, 12, 4, 7, '#1a1c24'); } }
  if (level === 2) { R(2, 10, W_ - 4, 4, '#8a5a33'); R(2, 10, W_ - 4, 1, '#a8703f'); }
  // banner with the destination's tag glyph
  R(cx - 7, 1, 14, 12, bs.accent); R(cx - 7, 13, 5, 3, bs.accent); R(cx + 2, 13, 5, 3, bs.accent);
  P.glyph(TH.GLYPH[tag] || TH.GLYPH.plain, cx - 3.5, 3, shade(bs.accent, -0.55));
  return outline(c);
}

function vault(kind) {
  const W_ = 80, H_ = 68;
  const c = cv(W_, H_), P = pen(c), R = P.r;
  R(1, 10, W_ - 2, H_ - 11, '#8a8d94'); R(1, 10, W_ - 2, 3, '#a5a8ae');
  R(0, 4, W_, 8, '#5d6069'); R(0, 4, W_, 1, '#7a7d84');
  for (let x = 0; x < W_; x += 8) R(x, 14, 4, 4, '#f2c14e'), R(x + 4, 14, 4, 4, '#1a1c24');
  R(4, 22, 12, 6, '#1a1c24'); R(W_ - 16, 22, 12, 6, '#1a1c24');
  R(5, 23, 10, 1, '#ff3b3b');
  // steel door
  R(30, 34, 20, 33, '#50545c'); R(31, 35, 18, 32, '#6f747e'); R(39, 38, 2, 26, '#50545c');
  // keycard reader
  R(52, 42, 6, 9, '#1a1c24'); R(53, 43, 4, 3, '#ff3b3b'); R(53, 48, 4, 1, '#8a909b');
  // lock plate
  R(33, 22, 14, 10, '#d23b3b'); P.glyph(TH.GLYPH.security, 36.5, 23.5, '#1a1c24');
  if (kind === 'dir') { R(10, 40, 12, 12, '#6f747e'); R(58, 40, 12, 12, '#6f747e'); R(11, 41, 10, 10, '#2a2c31'); R(59, 41, 10, 10, '#2a2c31'); }
  else { R(12, 40, 8, 14, '#1a1c24'); R(60, 40, 8, 14, '#1a1c24'); }
  R(1, H_ - 3, W_ - 2, 2, '#5d6069');
  return outline(c);
}

// The little speech bubble over a resident's head.
SP.questMark = function (kind) {
  const key = 'qm:' + kind;
  if (SP.cache.has(key)) return SP.cache.get(key);
  const c = cv(10, 13), P = pen(c), R = P.r;
  const col = kind === 'offer' ? '#d9a441' : kind === 'done' ? '#6fcf8a' : '#e8e2d2';
  R(0, 0, 10, 10, col); R(3, 10, 4, 2, col); R(4, 12, 2, 1, col);
  const ink = '#1a1c24';
  if (kind === 'offer') { R(4, 2, 2, 5, ink); R(4, 8, 2, 1, ink); }
  else if (kind === 'wait') { R(3, 2, 4, 1, ink); R(6, 3, 1, 2, ink); R(4, 5, 2, 2, ink); R(4, 8, 2, 1, ink); }
  else { R(2, 5, 2, 2, ink); R(4, 7, 2, 2, ink); R(6, 3, 2, 4, ink); }
  outline(c);
  SP.cache.set(key, c);
  return c;
};

// A bookcase: one spine per file on the shelves.
function bookcase(pal, n) {
  const c = cv(16, 30), P = pen(c), R = P.r;
  const wood = '#6b4a2e', dark = '#3a2718';
  R(0, 0, 16, 29, wood); R(1, 1, 14, 27, dark);
  const spines = ['#d9573f', '#3f7fd0', '#e8c860', '#4caf6a', '#9b7fe0', '#e8577a', '#6fe0ef', '#f2c14e'];
  let left = Math.max(1, Math.min(8, n || 6));
  for (let row = 0; row < 3 && left > 0; row++) {
    const y = 3 + row * 9;
    R(1, y + 7, 14, 2, wood);
    for (let i = 0; i < 5 && left > 0; i++, left--) {
      const x = 2 + i * 3 + (i % 2);
      const h = 6 - (i % 2);
      R(x, y + 7 - h, 2, h, spines[(row * 5 + i) % spines.length]);
      R(x, y + 7 - h, 2, 1, '#f4f1ea');
    }
  }
  R(0, 29, 16, 1, dark);
  return outline(c);
}
SP.bookcase = bookcase;

// A framed picture hung on a wall (real thumbnail when available).
function wallArt(pal, thumb) {
  const c = cv(16, 14), P = pen(c), R = P.r;
  R(1, 0, 14, 13, '#b8862a'); R(2, 1, 12, 11, '#e8c060'); R(3, 2, 10, 9, '#2a2c31');
  if (thumb) P.g.drawImage(thumb, 3, 2, 10, 9);
  else { R(3, 2, 10, 9, '#9fd0ef'); R(3, 7, 10, 4, '#6aa84f'); R(9, 3, 2, 2, '#f2c14e'); }
  R(3, 13, 10, 1, 'rgba(0,0,0,0.25)');
  return outline(c);
}
SP.wallArt = wallArt;

// Turn an image URL into a tiny 12×10 pixelated thumbnail for artwork items.
SP.thumb = function (url) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = cv(12, 10), g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      const s = Math.max(12 / img.width, 10 / img.height), w = img.width * s, h = img.height * s;
      g.drawImage(img, (12 - w) / 2, (10 - h) / 2, w, h);
      res(c);
    };
    img.onerror = () => res(null);
    img.src = url;
  });
};
SP.itemWithThumb = function (pal, outdoor, thumb) { return item('artwork', pal, outdoor, thumb); };
