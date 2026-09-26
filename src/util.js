// ───────────────────────── util.js ─────────────────────────
// Deterministic helpers: hashing, seeded PRNG, tokenizing, colour math.

const U = {};

// cyrb53 string hash → 53-bit integer. Stable across runs and browsers.
U.hash = function (str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

// mulberry32 PRNG seeded from a string.
U.rng = function (seedStr) {
  let a = U.hash(String(seedStr)) >>> 0;
  const r = function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.weighted = (pairs) => { // [[item, weight], ...]
    let tot = 0; for (const p of pairs) tot += p[1];
    let x = r() * tot;
    for (const p of pairs) { if ((x -= p[1]) <= 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  };
  return r;
};

// Split names/content into lowercase word tokens.
// Handles camelCase, snake_case, kebab-case, dotted.names and digits.
U.tokenize = function (text, limit = 200000) {
  if (!text) return [];
  if (text.length > limit) text = text.slice(0, limit);
  const spaced = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/n't\b/gi, ' not');
  const m = spaced.toLowerCase().match(/[a-z]+/g);
  return m ? m.filter(w => w.length > 1 && w.length < 24) : [];
};

// Tiny suffix-stripping stemmer used only for dictionary lookup fallbacks.
U.stems = function (w) {
  const out = [w];
  if (w.endsWith('ies') && w.length > 4) out.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es') && w.length > 4) out.push(w.slice(0, -2));
  if (w.endsWith('s') && w.length > 3) out.push(w.slice(0, -1));
  if (w.endsWith('ing') && w.length > 5) { out.push(w.slice(0, -3)); out.push(w.slice(0, -3) + 'e'); }
  if (w.endsWith('ed') && w.length > 4) { out.push(w.slice(0, -2)); out.push(w.slice(0, -1)); }
  if (w.endsWith('er') && w.length > 4) out.push(w.slice(0, -2));
  if (w.endsWith('ly') && w.length > 4) out.push(w.slice(0, -2));
  return out;
};

U.ext = function (name) {
  const i = name.lastIndexOf('.');
  if (i <= 0 || i === name.length - 1) return '';
  return name.slice(i + 1).toLowerCase();
};

U.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

U.fmtSize = function (n) {
  if (n == null) return '—';
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
};

U.fmtDate = function (ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

U.esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── colour helpers (hex <-> hsl) so moods can shift palettes deterministically
U.hexToRgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
U.rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
U.rgbToHsl = function (r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h, s; const l = (mx + mn) / 2;
  if (mx === mn) { h = s = 0; } else {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
};
U.hslToRgb = function (h, s, l) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
};
// Adjust a colour: dh (turns), ds, dl in absolute units.
U.adj = function (hex, dh = 0, ds = 0, dl = 0) {
  const [h, s, l] = U.rgbToHsl(...U.hexToRgb(hex));
  return U.rgbToHex(...U.hslToRgb((h + dh + 1) % 1, U.clamp(s + ds, 0, 1), U.clamp(l + dl, 0, 1)));
};
U.mix = function (a, b, t) {
  const A = U.hexToRgb(a), B = U.hexToRgb(b);
  return U.rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
};

// Run async jobs with bounded concurrency.
U.pool = async function (items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: e }; } }
  });
  await Promise.all(workers);
  return out;
};

U.sleep = (ms) => new Promise(r => setTimeout(r, ms));
