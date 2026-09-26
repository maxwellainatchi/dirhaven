// ───────────────────────── analysis.js ─────────────────────────
// Approach 1: lexicon sentiment → tone.  Approach 2: word→tag dictionary → theme.

const AN = {};

function lookupSentiment(w) {
  for (const s of U.stems(w)) { const v = LEX.SENTIMENT.get(s); if (v !== undefined) return v; }
  return 0;
}
function lookupTags(w) {
  for (const s of U.stems(w)) { const v = LEX.TAG_WORDS.get(s); if (v) return v; }
  return null;
}

// VADER-style compound score in [-1, 1] with negation + booster handling.
AN.sentiment = function (tokens) {
  let sum = 0, hits = 0;
  const pos = [], neg = [];
  for (let i = 0; i < tokens.length; i++) {
    let v = lookupSentiment(tokens[i]);
    if (!v) continue;
    let mult = 1;
    for (let k = 1; k <= 3 && i - k >= 0; k++) {
      const p = tokens[i - k];
      if (LEX.NEGATORS.has(p)) { mult *= -0.6; break; }
      if (k === 1 && LEX.BOOSTERS[p]) mult *= LEX.BOOSTERS[p];
    }
    v *= mult; sum += v; hits++;
    (v > 0 ? pos : neg).push(tokens[i]);
  }
  const compound = sum / Math.sqrt(sum * sum + 15);
  return { compound: Math.round(compound * 1000) / 1000, hits, words: tokens.length, pos: [...new Set(pos)].slice(0, 6), neg: [...new Set(neg)].slice(0, 6) };
};

// Tag scores for a token list (each token counted with a per-token weight).
AN.tagScores = function (tokens, weight = 1, into = {}, perWordCap = 4) {
  const seen = {};
  for (const w of tokens) {
    const tags = lookupTags(w);
    if (!tags) continue;
    seen[w] = (seen[w] || 0) + 1;
    if (seen[w] > perWordCap) continue; // stop one repeated word dominating
    for (const t of tags) into[t] = (into[t] || 0) + weight;
  }
  return into;
};

AN.topTags = function (scores, n = 3) {
  return Object.entries(scores).filter(e => e[1] > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, n).map(([tag, score]) => ({ tag, score: Math.round(score * 10) / 10 }));
};

// Name-only analysis for a file/folder (cheap — no I/O).
AN.nameInfo = function (name, kind) {
  const tokens = U.tokenize(name.replace(/\.[^.]+$/, ''));
  const scores = AN.tagScores(tokens, 1);
  if (kind === 'file') {
    const e = LEX.EXT[U.ext(name)];
    if (e) for (const t of e.tags) scores[t] = (scores[t] || 0) + 0.8;
  }
  if (name.startsWith('.')) scores.security = (scores.security || 0) + 0.3, scores.technology = (scores.technology || 0) + 0.3;
  return { tokens, scores, sent: AN.sentiment(tokens) };
};

// Full content analysis for a text sample.
AN.contentInfo = function (text) {
  const tokens = U.tokenize(text, 32768);
  return { tokens: tokens.length, scores: AN.tagScores(tokens, 0.15, {}, 6), sent: AN.sentiment(tokens) };
};

// Choose the interactable object for a file. Extension first; fall back
// to the file's dominant tag so extension-less files still look right.
AN.itemKind = function (name, scores) {
  const e = LEX.EXT[U.ext(name)];
  if (e) return e.kind;
  const low = name.toLowerCase();
  if (/^(readme|license|licence|changelog|authors|notice)/.test(low)) return 'lectern';
  if (/^(makefile|dockerfile|procfile|gemfile|rakefile)$/.test(low)) return 'console';
  if (name.startsWith('.')) return 'console';
  const top = AN.topTags(scores || {}, 1)[0];
  const byTag = { music: 'jukebox', media: 'tv', art: 'artwork', finance: 'ledger', technology: 'server', games: 'arcade', security: 'safe', archive: 'chest', food: 'desk', science: 'terminal' };
  return (top && byTag[top.tag]) || 'pedestal';
};

AN.KIND_LABEL = {
  artwork: 'Framed artwork', easel: 'Easel', jukebox: 'Jukebox', tv: 'Screening set', terminal: 'Terminal',
  console: 'Control panel', server: 'Server rack', chest: 'Storage chest', desk: 'Writing desk', lectern: 'Lectern',
  ledger: 'Ledger desk', sign: 'Letterform sign', statue: 'Display statue', safe: 'Safe', mailbox: 'Mailbox',
  arcade: 'Arcade cabinet', pedestal: 'Curio pedestal'
};

AN.toneLabel = function (c) {
  if (c <= -0.5) return 'grim';
  if (c <= -0.2) return 'gloomy';
  if (c < -0.05) return 'wistful';
  if (c <= 0.1) return 'neutral';
  if (c < 0.35) return 'pleasant';
  if (c < 0.6) return 'cheerful';
  return 'radiant';
};
