// ───────────────────────── achievements.js ─────────────────────────
// Small milestones, checked against counters the game keeps anyway.

const A = {};
A.count = { chops: 0, crushes: 0, plays: 0, pdfs: 0, vaults: 0, unlocks: 0, floors: 0, hints: 0, regions: 0, carried: 0, shelves: 0, books: 0 };
A.unlocked = new Set();

A.LIST = [
  { id: 'outside', name: 'Out the Front Door', desc: 'Leave the building you woke up in.', test: () => W.visited.size >= 2 },
  { id: 'errand1', name: 'Obliging', desc: 'Deliver your first errand.', test: () => Q.done.length >= 1, grants: 'axe', grantLine: 'Someone leaves an old axe by your door — good for clearing trees.' },
  { id: 'errand5', name: 'Known Around Here', desc: 'Deliver five errands.', test: () => Q.done.length >= 5 },
  { id: 'errand12', name: 'The Whole Town Owes You', desc: 'Deliver twelve errands.', test: () => Q.done.length >= 12 },
  { id: 'keycard', name: 'Cleared for Entry', desc: 'Earn your first keycard.', test: () => K.held.size >= 1 },
  { id: 'unlock3', name: 'Gatecrasher', desc: 'Open three locked places.', test: () => A.count.unlocks >= 3 },
  { id: 'chop10', name: 'Clear the Path', desc: 'Fell ten trees.', test: () => A.count.chops >= 10, grants: 'jackhammer', grantLine: 'The road crew hands over a jackhammer — heavy enough for rocks.' },
  { id: 'crush5', name: 'Rock Breaker', desc: 'Break five rocks with the jackhammer.', test: () => A.count.crushes >= 5 },
  { id: 'people10', name: 'On First-Name Terms', desc: 'Meet ten residents.', test: () => P.met.size >= 10 },
  { id: 'shelf', name: 'Browsing', desc: 'Open a bookcase.', test: () => A.count.shelves >= 1 },
  { id: 'book', name: 'Bookworm', desc: 'Read something in the book reader.', test: () => A.count.books >= 1 },
  { id: 'files10', name: 'Curious', desc: 'Inspect ten files.', test: () => W.inspected.size >= 10 },
  { id: 'files50', name: 'Archivist', desc: 'Inspect fifty files.', test: () => W.inspected.size >= 50 },
  { id: 'places15', name: 'Surveyor', desc: 'Discover fifteen places.', test: () => W.visited.size >= 15 },
  { id: 'places40', name: 'Cartographer', desc: 'Discover forty places.', test: () => W.visited.size >= 40 },
  { id: 'jukebox', name: 'Disc Jockey', desc: 'Put something on a jukebox.', test: () => A.count.plays >= 1 },
  { id: 'reader', name: 'Close Reader', desc: 'Read a PDF right through the panel.', test: () => A.count.pdfs >= 1 },
  { id: 'vault', name: 'No Entry', desc: 'Get turned away from a guarded vault.', test: () => A.count.vaults >= 1 },
  { id: 'stairs', name: 'Upstairs', desc: 'Climb to another floor.', test: () => A.count.floors >= 1 },
  { id: 'asker', name: 'Ask a Local', desc: 'Get five hints out of residents.', test: () => A.count.hints >= 5 },
  { id: 'porter', name: 'Porter', desc: 'Carry ten different files.', test: () => A.count.carried >= 10 },
];

A.bump = function (key, n = 1) { A.count[key] = (A.count[key] || 0) + n; };
// Returns whatever has just been earned, so the game can announce it.
A.sync = function () {
  const fresh = [];
  for (const a of A.LIST) {
    if (A.unlocked.has(a.id)) continue;
    let ok = false;
    try { ok = a.test(); } catch (e) { ok = false; }
    if (ok) { A.unlocked.add(a.id); if (a.grants) K.giveTool(a.grants); fresh.push(a); }
  }
  return fresh;
};
A.reset = function () { A.unlocked.clear(); for (const k of Object.keys(A.count)) A.count[k] = 0; };
