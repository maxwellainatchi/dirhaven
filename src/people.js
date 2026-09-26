// ───────────────────────── people.js ─────────────────────────
// Who you've met, where they were standing, and what you've done for them.

const P = {};
P.met = new Map();   // npc id → { id, name, where, place, look, mentor, met }

P.meet = function (npc, area, zone) {
  const rec = P.met.get(npc.id);
  if (rec) { rec.seen++; return rec; }
  const entry = {
    id: npc.id, name: npc.name, look: npc.look, mentor: !!npc.mentor,
    where: npc.where || (zone ? W.disp(zone.node) : W.disp(area.node)),
    place: W.disp(area.node), placeId: area.node.id, seen: 1,
  };
  P.met.set(npc.id, entry);
  return entry;
};
P.knows = (id) => P.met.has(id);
P.reset = function () { P.met.clear(); };

// What the phonebook says about someone right now.
P.status = function (entry) {
  const q = Q.forGiver(entry.id);
  const done = Q.doneByGiver.get(entry.id) || 0;
  if (q) return { text: `Waiting on: ${q.short}`, kind: 'open' };
  if (done) return { text: `${done} errand${done === 1 ? '' : 's'} run for them`, kind: 'done' };
  return { text: 'No errands between you', kind: 'idle' };
};
