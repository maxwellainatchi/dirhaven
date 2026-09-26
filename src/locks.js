// ───────────────────────── locks.js ─────────────────────────
// Some quarters are walled and some doors want a keycard. Each map has one
// pass; residents of that map hand it over when you run an errand for them.

const K = {};
K.held = new Map();       // card id → { id, name, mapId, from }
K.opened = new Set();     // node ids you've already unlocked
K.starterMap = null;      // the map the tutorial pass belongs to
K.starterDistrict = null; // never locked — you start in it
K.starterBuilding = null;
K.known = new Map();      // node id → card, filled in as maps get built
K.tools = new Set();      // 'axe', …

K.cardId = (mapId) => 'pass:' + mapId;
K.cardName = (mapName) => `${mapName} pass`;
K.card = (mapId, mapName) => ({ id: K.cardId(mapId), name: K.cardName(W.pretty(mapName)), mapId });
K.has = (id) => K.held.has(id);
K.grant = function (card, from) { if (!K.held.has(card.id)) K.held.set(card.id, { ...card, from }); return card; };
K.isOpen = (nodeId) => K.opened.has(nodeId);
K.open = function (nodeId) { K.opened.add(nodeId); };
K.reset = function () { K.held.clear(); K.opened.clear(); K.known.clear(); K.tools.clear(); };
K.hasTool = (t) => K.tools.has(t);
K.giveTool = (t) => K.tools.add(t);
K.note = function (nodeId, card) { K.known.set(nodeId, card); };

// Is this file sitting behind a door you can't open yet?
K.blocked = function (nodeId) {
  const parts = String(nodeId).split('/');
  for (let i = 1; i <= parts.length; i++) {
    const pre = parts.slice(0, i).join('/').split('#')[0];
    const card = K.known.get(pre);
    if (card && !K.isOpen(pre) && !K.has(card.id)) return true;
  }
  return false;
};

// Does this child of `area` sit behind a lock?  Deterministic.
K.locks = function (area, ci) {
  if (!area.outdoor || ci.restricted) return null;
  const id = ci.node.id;
  if (K.isOpen(id)) return null;
  if (id === K.starterDistrict || id === K.starterBuilding) return null;
  const big = ci.level <= 2 || (ci.n || 0) >= 16;
  if (!big) return null;
  // In the starting town every other quarter is shut until the tutorial pass.
  const starter = area.node.id === K.starterMap;
  if (!starter && U.hash('lock:' + id) % 100 >= 34) return null;
  return K.card(area.node.id, area.node.name);
};

// Anything on this map still locked? (used to decide errand rewards)
K.mapHasLocks = function (area) {
  if (!area.outdoor) return false;
  return area.childInfo.some(ci => !!K.locks(area, ci));
};

K.guardLine = function (card, opened) {
  if (opened) return `Go ahead. The ${card.name} is good here.`;
  return `This quarter's shut. You'll need the ${card.name} — run an errand for someone local and they'll hand you one.`;
};
