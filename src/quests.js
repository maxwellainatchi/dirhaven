// ───────────────────────── quests.js ─────────────────────────
// Errands. A resident asks you to fetch something from a part of the tree
// they know about but you haven't walked yet; hints narrow it down; you
// pick the file up and carry it back. Everything here is deterministic —
// the same folder, the same resident, the same errand.

const Q = {};
Q.active = [];
Q.done = [];
Q.pack = [];             // the backpack: files you're carrying
Q.PACK_MAX = 8;
Q.byGiver = new Map();   // giver id → quest
Q.doneByGiver = new Map();

Q.NAMES = ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme', 'Finn', 'Greta', 'Hugo', 'Ines', 'Jonas', 'Kira', 'Lev', 'Mira', 'Nils', 'Odile', 'Pax', 'Quill', 'Rosa', 'Sten', 'Tova', 'Ulla', 'Viggo', 'Wren', 'Yara', 'Zeb', 'Marek', 'Petra', 'Sofia', 'Otto', 'Juno'];
Q.name = (seed) => Q.NAMES[U.hash(seed) % Q.NAMES.length];

const KIND_WORD = {
  artwork: 'a framed picture', easel: 'something from an easel', jukebox: 'a jukebox record', tv: 'a reel from a screening set',
  terminal: 'something off a terminal', console: 'a control-panel file', server: 'a drive from a server rack', chest: 'a packed chest',
  desk: 'a page off a writing desk', lectern: 'a book from a lectern', ledger: 'a ledger sheet', sign: 'a letterform sign',
  statue: 'a display piece', safe: 'something from a safe', mailbox: 'a letter', arcade: 'an arcade cartridge', pedestal: 'a curio',
};
const KIND_PLURAL = {
  artwork: 'pictures', easel: 'design pieces', jukebox: 'records', tv: 'reels', terminal: 'code files', console: 'config files',
  server: 'drives', chest: 'archives', desk: 'written pages', lectern: 'books', ledger: 'ledger sheets', sign: 'typefaces',
  statue: 'display pieces', safe: 'sealed files', mailbox: 'letters', arcade: 'cartridges', pedestal: 'curios',
};
const lastSeg = (id) => { const i = id.lastIndexOf('/'); const s = i < 0 ? id : id.slice(i + 1); return s.split('#')[0] || s; };
Q.place = (id) => W.pretty(lastSeg(id));

// Every file we know about under a folder, from what has already been listed.
// Memoised: this is asked for on every frame while markers are on screen.
Q._cand = { key: null, n: -1, list: null };
Q.candidates = function (scopeId) {
  if (Q._cand.key === scopeId && Q._cand.n === W.listCache.size) return Q._cand.list;
  const out = [];
  const pushList = (pid, list) => {
    for (const n of list) {
      if (n.kind === 'file') { if (!n.restricted) out.push({ node: n, parentId: pid }); }
      else if (n.kind === 'group') pushList(pid, n.members);
    }
  };
  for (const [pid, list] of W.listCache) {
    if (list === 'restricted') continue;
    if (!(pid === scopeId || pid.startsWith(scopeId + '/'))) continue;
    pushList(pid, list);
  }
  Q._cand = { key: scopeId, n: W.listCache.size, list: out };
  return out;
};

// The first folder under the scope on the way to this file — the "somewhere in X" hint.
function branchOf(scopeId, parentId) {
  if (!parentId.startsWith(scopeId)) return null;
  const rest = parentId.slice(scopeId.length).replace(/^\//, '');
  if (!rest) return null;
  return W.pretty(rest.split('/')[0].split('#')[0]);
}

// ── offering ───────────────────────────────────────────────────────────
// The errand a resident has in mind (null if they have none). Cached on the
// resident, and stable for a given person and folder.
Q.offerFor = function (npc, area) {
  if (Q.byGiver.has(npc.id)) return null;
  if (npc._offer !== undefined) return npc._offer;
  const q = buildOffer(npc, area);
  npc._offer = q;
  return q;
};
function buildOffer(npc, area) {
  const doneN = Q.doneByGiver.get(npc.id) || 0;
  if (doneN >= 2) return null;                         // two errands per resident
  const rng = U.rng('quest:' + npc.id + ':' + doneN);
  if (rng() > 0.6) return null;                        // not everyone has an errand

  const scopeId = area.node.id, scopeName = area.node.name;
  let cands = Q.candidates(scopeId).filter(c => !K.blocked(c.node.id)).filter(c => c.parentId !== scopeId || area.level > 2);
  if (!cands.length) cands = Q.candidates(scopeId).filter(c => !K.blocked(c.node.id));
  if (!cands.length) return null;
  // Prefer places you haven't walked into yet — that's the point of an errand.
  const fresh = cands.filter(c => !W.visited.has(c.parentId) && branchOf(scopeId, c.parentId));
  const pool = fresh.length ? fresh : cands;
  const pick = pool[Math.floor(rng() * pool.length)];
  const info = W.info(pick.node);
  const branch = branchOf(scopeId, pick.parentId);
  const roll = rng();
  const q = {
    id: 'q' + U.hash(npc.id + doneN).toString(36),
    giver: { id: npc.id, name: npc.name, look: npc.look, mapId: scopeId, mapName: scopeName, where: npc.where || scopeName },
    scope: { id: scopeId, name: W.disp({ name: scopeName, display: area.node.display }) },
    target: { id: pick.node.id, name: pick.node.name, parentId: pick.parentId, parentName: Q.place(pick.parentId), kind: info.kind },
    branch, revealed: 1, hints: [],
  };
  // Three flavours of errand.
  if (roll < 0.5 || !branch) {
    q.type = 'file';
    q.pitch = `I've mislaid a file called “${pick.node.name}”. Fetch it back to me and I'll tell you something about this place.`;
    q.short = `Find “${pick.node.name}”`;
    q.want = `“${pick.node.name}”`;
  } else if (roll < 0.78) {
    q.type = 'kind';
    q.kindWant = info.kind;
    q.scopeBranch = branch;
    q.pitch = `Bring me ${KIND_WORD[info.kind] || 'something interesting'} from ${branch} — any one will do.`;
    q.short = `Bring ${KIND_PLURAL[info.kind] || 'anything'} from ${branch}`;
    q.want = `${KIND_WORD[info.kind] || 'something'} from ${branch}`;
  } else {
    const tone = info.tone >= 0 ? 'cheerful' : 'gloomy';
    q.type = 'tone';
    q.toneWant = tone;
    q.scopeBranch = branch;
    q.pitch = `I need something to read — something ${tone}, from ${branch}. You'll know it when the words land.`;
    q.short = `Bring something ${tone} from ${branch}`;
    q.want = `something ${tone} from ${branch}`;
  }
  q.hints = buildHints(q, pick, info);
  if (K.mapHasLocks(area) && !K.has(K.cardId(area.node.id))) {
    q.card = K.card(area.node.id, area.node.name);
    q.pitch += ` Do it and the ${q.card.name} is yours — it opens the locked quarters around here.`;
  }
  return q;
}

// The one errand that teaches the game, handed out when you first step
// outside your own front door.
Q.mentorOffer = function (area, starter) {
  const scopeId = starter.via ? starter.via.id : area.node.id;
  const rng = U.rng('mentor:' + scopeId);
  const cands = Q.candidates(scopeId).filter(c => !c.parentId.startsWith(starter.node.id) && !K.blocked(c.node.id));
  const pool = cands.length ? cands : Q.candidates(area.node.id).filter(c => !K.blocked(c.node.id));
  if (!pool.length) return null;
  const pick = pool[Math.floor(rng() * pool.length)];
  const info = W.info(pick.node);
  const branch = branchOf(scopeId, pick.parentId) || `the ${Q.place(pick.parentId)} Hall`;
  const q = {
    id: 'mentor', mentor: true,
    giver: { id: 'mentor', name: 'Odile', look: 4, mapId: area.node.id, mapName: area.node.name, where: starter.districtName || area.node.name },
    scope: { id: scopeId, name: starter.districtName || area.node.name },
    target: { id: pick.node.id, name: pick.node.name, parentId: pick.parentId, parentName: Q.place(pick.parentId), kind: info.kind },
    branch, revealed: 1, type: 'file',
    short: `Find “${pick.node.name}”`, want: `“${pick.node.name}”`,
    card: K.card(area.node.id, area.node.name),
  };
  q.pitch = `You're new. Here's how this works: I've lost “${pick.node.name}” somewhere in ${q.scope.name}. Find it, open it, press Pick it up, and walk it back to me. Ask anyone standing nearby if you get lost — locals know their own streets. Bring it and the ${q.card.name} is yours, which opens the locked quarters of ${area.node.name}.`;
  q.hints = [
    `It's in ${branch}, not far from here.`,
    `It shows up as ${KIND_WORD[info.kind] || 'an odd thing'}. Walk in, open it, and press Pick it up.`,
    `Precisely: it's in ${Q.place(pick.parentId)}.`,
  ];
  return q;
};

function buildHints(q, pick, info) {
  const h = [];
  const kindWord = KIND_WORD[info.kind] || 'an odd thing';
  if (q.type === 'file') {
    h.push(q.branch ? `Start in ${q.branch} — that's where it wandered off to.` : `It's somewhere here in ${q.scope.name}.`);
    h.push(`It shows up as ${kindWord}${info.tone > 0.25 ? ', and it reads cheerfully' : info.tone < -0.25 ? ', and it reads rather grimly' : ''}.`);
    h.push(`Precisely: it's in ${q.target.parentName}.`);
  } else if (q.type === 'kind') {
    h.push(`Any of the ${KIND_PLURAL[q.kindWant] || 'things'} in ${q.scopeBranch} will do.`);
    h.push(`I've seen some in ${q.target.parentName}.`);
    h.push(`If you're stuck, “${q.target.name}” is one of them.`);
  } else {
    h.push(`Text is what carries a tone — look for something written, in ${q.scopeBranch}.`);
    h.push(`${q.target.parentName} has a few worth reading.`);
    h.push(`“${q.target.name}” struck me as ${q.toneWant} when I last read it.`);
  }
  return h;
}

Q.accept = function (q, npc) {
  if (npc) npc._offer = undefined;
  q.accepted = Date.now();
  Q.active.push(q);
  Q.byGiver.set(q.giver.id, q);
  return q;
};
Q.abandon = function (q) {
  Q.active = Q.active.filter(x => x !== q);
  Q.byGiver.delete(q.giver.id);
};
Q.hint = function (q) {
  if (q.revealed >= q.hints.length) return null;
  q.revealed++;
  return q.hints[q.revealed - 1];
};
Q.forGiver = (id) => Q.byGiver.get(id) || null;

// ── asking a local ──────────────────────────────────────────────────────
// Hints come from people standing near the place, not from a menu.
Q.depthFor = function (q, area, zoneNode) {
  const tp = q.target.parentId;
  let d = 0;
  const here = area.node.id;
  if (tp === here) d = 3;
  else if (tp.startsWith(here + '/')) d = here === q.scope.id ? 1 : 2;
  if (zoneNode) {
    if (tp === zoneNode.id) d = Math.max(d, 3);
    else if (tp.startsWith(zoneNode.id + '/')) d = Math.max(d, 2);
  }
  if (q.scopeBranch && here.endsWith('/' + q.scopeBranch)) d = Math.max(d, 2);
  return d;
};
Q.ask = function (area, zoneNode) {
  if (!Q.active.length) return null;
  let best = null;
  for (const q of Q.active) {
    const d = Q.depthFor(q, area, zoneNode);
    if (!best || d > best.d) best = { q, d };
  }
  if (!best) return null;
  const { q, d } = best;
  if (d === 0) {
    return { q, fresh: false, line: `Looking for ${q.want || lower(q.short)}? Nothing like that around here — try ${q.scopeBranch || q.branch || q.scope.name}.` };
  }
  if (q.revealed < d) {
    q.revealed = d;
    return { q, fresh: true, line: `After ${q.want || lower(q.short)}? ${q.hints[d - 1]}` };
  }
  const warm = d >= 3 ? `${(q.want || 'it').charAt(0).toUpperCase() + (q.want || 'it').slice(1)} is right here — have a look around.` : `You're close. ${q.hints[Math.min(q.revealed, q.hints.length) - 1]}`;
  return { q, fresh: false, line: warm };
};
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// ── matching ───────────────────────────────────────────────────────────
const inBranch = (q, node) => !q.scopeBranch || node.id.startsWith(q.scope.id + '/' + q.scopeBranch);
Q.matches = function (q, node) {
  const info = W.info(node);
  if (q.type === 'file') return node.id === q.target.id;
  if (q.type === 'kind') return info.kind === q.kindWant && inBranch(q, node);
  if (q.type === 'tone') {
    if (!inBranch(q, node)) return false;
    if (!info.content) return false;              // it has to be something readable
    return q.toneWant === 'cheerful' ? info.tone >= 0.25 : info.tone <= -0.25;
  }
  return false;
};
Q.why = function (q, node) {
  const info = W.info(node);
  if (q.type === 'file') return `I asked for “${q.target.name}”.`;
  if (q.type === 'kind' && info.kind !== q.kindWant) return `That's not ${KIND_WORD[q.kindWant] || 'what I wanted'}.`;
  if (q.type === 'tone' && !info.content) return `There's nothing to read in that one.`;
  if (q.type === 'tone') return `That reads ${AN.toneLabel(info.tone)} — I asked for something ${q.toneWant}.`;
  return `That came from the wrong part of town.`;
};

// ── reward: a true fact about the place, dug out of what we've surveyed ──
Q.reward = function (q) {
  const cands = Q.candidates(q.scope.id);
  const known = cands.map(c => ({ ...c, info: W.info(c.node) }));
  const rng = U.rng('reward:' + q.id);
  const options = [];
  const withDate = known.filter(k => k.node.mtime);
  if (withDate.length > 2) {
    const oldest = withDate.reduce((a, b) => (a.node.mtime <= b.node.mtime ? a : b));
    options.push(`Here's your thanks: the oldest thing I know of in ${q.scope.name} is “${oldest.node.name}”, last touched ${U.fmtDate(oldest.node.mtime)}.`);
  }
  const withSize = known.filter(k => k.node.size != null);
  if (withSize.length > 2) {
    const big = withSize.reduce((a, b) => (a.node.size >= b.node.size ? a : b));
    options.push(`Thanks. For what it's worth, the heaviest thing around here is “${big.node.name}” at ${U.fmtSize(big.node.size)}.`);
  }
  const tags = {};
  for (const k of known) for (const [t, v] of Object.entries(k.info.scores || {})) tags[t] = (tags[t] || 0) + v;
  const top = AN.topTags(tags, 1)[0];
  if (top) options.push(`Much obliged. If you ask me, ${q.scope.name} is really all about ${top.tag} — the walls give it away.`);
  const readable = known.filter(k => k.info.content && k.info.content.sent.hits);
  if (readable.length > 2) {
    const happiest = readable.reduce((a, b) => (a.info.tone >= b.info.tone ? a : b));
    const saddest = readable.reduce((a, b) => (a.info.tone <= b.info.tone ? a : b));
    options.push(`Thank you. The sunniest thing I've read in ${q.scope.name} is “${happiest.node.name}”; the bleakest is “${saddest.node.name}”.`);
  }
  options.push(`Thank you kindly. ${known.length} things catalogued in ${q.scope.name} and counting.`);
  return options[Math.floor(rng() * options.length)];
};

Q.complete = function (q, delivered) {
  const line = Q.reward(q);
  q.deliveredName = delivered ? delivered.name : q.target.name;
  q.grantedCard = null;
  if (q.card && !K.has(q.card.id)) { K.grant(q.card, q.giver.name); q.grantedCard = q.card; }

  Q.active = Q.active.filter(x => x !== q);
  Q.byGiver.delete(q.giver.id);
  Q.doneByGiver.set(q.giver.id, (Q.doneByGiver.get(q.giver.id) || 0) + 1);
  q.completed = Date.now();
  Q.done.push(q);
  if (delivered) Q.packRemove(delivered.id);
  let out = line;
  if (q.grantedCard) out += ` And here — the ${q.grantedCard.name}. Show it at any locked gate around ${W.pretty(lastSeg(q.grantedCard.mapId))}.`;
  return out;
};

// ── backpack ───────────────────────────────────────────────────────────
Q.packHas = (id) => Q.pack.some(n => n.id === id);
Q.packAdd = function (node) {
  if (Q.packHas(node.id)) return 'already';
  if (Q.pack.length >= Q.PACK_MAX) return 'full';
  Q.pack.push(node);
  return 'ok';
};
Q.packRemove = function (id) { Q.pack = Q.pack.filter(n => n.id !== id); };
// The item in your pack that satisfies this errand, if any.
Q.packMatch = function (q) { return Q.pack.find(n => Q.matches(q, n)) || null; };

Q.reset = function () { Q.active = []; Q.done = []; Q.pack = []; Q.mentorDone = false; Q.mentorSpawned = false; Q.byGiver.clear(); Q.doneByGiver.clear(); Q._cand = { key: null, n: -1, list: null }; };

// Marker shown above a resident: ! = errand on offer, ? = still owed,
// ✓ = you're carrying exactly what they asked for.
Q.mark = function (npc, area) {
  const q = Q.byGiver.get(npc.id);
  if (q) return Q.packMatch(q) ? 'done' : 'wait';
  return Q.offerFor(npc, area) ? 'offer' : null;
};
