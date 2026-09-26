// ───────────────────────── game.js ─────────────────────────
// Loop, camera, input, UI. Grid-based movement, tap-to-walk on touch.

(function () {
  const $ = (s) => document.querySelector(s);
  const canvas = $('#game'), ctx = canvas.getContext('2d');
  const TS = 16;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const G = {
    fs: null, mode: 'title', map: null, area: null, stack: [], via: new Map(),
    player: { x: 0, y: 0, px: 0, py: 0, dir: 'up', moving: 0, frame: 0, path: null, then: null },
    keys: new Set(), cam: { x: 0, y: 0 }, scale: 3, dpr: 1, t: 0,
    fade: 0, busy: false, drops: [], motes: [], mapCache: new Map(), zone: null, floor: 0,
  };
  window.__dirhaven = G;

  function resize() {
    const r = canvas.getBoundingClientRect();
    G.dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * G.dpr); canvas.height = Math.round(r.height * G.dpr);
    const target = r.width < 640 ? 13 : r.width < 1100 ? 20 : 26;
    G.scale = Math.max(1, Math.round(canvas.width / (TS * target)));
  }
  addEventListener('resize', resize);

  const palAt = (m, x, y) => m.pals[m.pidx[U.clamp(y, 0, m.h - 1) * m.w + U.clamp(x, 0, m.w - 1)]] || m.pal;

  // ── ground pre-render ───────────────────────────────────
  // Doorsteps and thresholds: residents never loiter on these.
  function markNoStand(m) {
    const s = new Set();
    for (const d of m.doors.values()) s.add(d.y * m.w + d.x);
    if (m.exitAt) { s.add(m.exitAt.y * m.w + m.exitAt.x); s.add((m.exitAt.y - 1) * m.w + m.exitAt.x); }
    for (const k of m.trig.keys()) { const x = k % m.w, y = (k / m.w) | 0; s.add(k); s.add((y + 1) * m.w + x); }
    for (const k of m.act.keys()) { const x = k % m.w, y = (k / m.w) | 0; s.add((y + 1) * m.w + x); }
    m.noStand = s;
    m.treeAt = new Map();
    for (const o of m.objs) if (o.tree || o.rock) m.treeAt.set(o.y * m.w + o.x, o);
    for (const n of m.npcs) if (s.has(n.y * m.w + n.x)) {
      const spot = [[n.x + 1, n.y], [n.x - 1, n.y], [n.x, n.y + 1], [n.x, n.y - 1]]
        .find(([x, y]) => x > 0 && y > 0 && x < m.w && y < m.h && !m.solid[y * m.w + x] && !s.has(y * m.w + x));
      if (spot) { n.x = spot[0]; n.y = spot[1]; n.px = n.x * TS; n.py = n.y * TS; }
    }
  }

  function renderGround(m) {
    const c = document.createElement('canvas'); c.width = m.w * TS; c.height = m.h * TS;
    const g = c.getContext('2d');
    const r = U.rng('ground:' + m.area.node.id);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) SP.paintTile(g, m.tiles[y * m.w + x], x, y, m.pals[m.pidx[y * m.w + x]], r, m);
    for (const f of m.flat) SP.paintFlat(g, f, m.pals[f.pi || 0]);
    m.ground = c;
    const mm = document.createElement('canvas'); mm.width = m.w; mm.height = m.h;
    const mg = mm.getContext('2d'), TT = W.T;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const k = y * m.w + x, t = m.tiles[k], p = m.pals[m.pidx[k]];
      mg.fillStyle = t === TT.ROAD ? p.road3 : t === TT.PLAZA ? p.accent : t === TT.BORDER || t === TT.VOID || t === TT.WALLCAP || t === TT.WALLSIDE ? '#0b0c11'
        : t === TT.WALLHI || t === TT.WALLLO || t === TT.PARTITION ? p.paper : t === TT.FLOOR || t === TT.RUG ? p.floor : t === TT.MAT ? '#fff' : p.ground;
      mg.fillRect(x, y, 1, 1);
    }
    for (const o of m.objs) { if (!(o.node || o.guard || o.vault || o.item)) continue; mg.fillStyle = o.node ? '#f4f1ea' : o.guard || o.vault ? '#e0533d' : '#d9a441'; mg.fillRect(o.x, o.y, o.w || 1, 1); }
    m.mini = mm;
  }

  // ── loading an area ─────────────────────────────────────
  const loadEl = $('#loading'), loadMsg = $('#loading-msg');
  const progress = (msg) => { loadMsg.textContent = msg; };

  async function goTo(node, parentLevel, opts = {}) {
    if (G.busy) return false;
    G.busy = true;
    const fadeOut = fadeTo(1);
    const loadTimer = setTimeout(() => { loadEl.hidden = false; }, 180);
    let area;
    try {
      area = await W.survey(G.fs, node, parentLevel, progress);
    } catch (e) {
      clearTimeout(loadTimer); loadEl.hidden = true; G.busy = false; await fadeTo(0);
      if (e && e.restricted) say('Guard', `The door to “${node.name}” is locked. The system says: permission denied.`, 'guard');
      else { toast(`Could not open “${node.name}”.`); console.error(e); }
      return false;
    }
    await fadeOut;
    clearTimeout(loadTimer); loadEl.hidden = true;
    let m = G.mapCache.get(node.id);
    if (!m) {
      m = W.generate(area, !!opts.root);
      renderGround(m);
      markNoStand(m);
      for (const t of m.trig.values()) if (t.type === 'enter') W.link(node, t.node, t.parentLevel, t.via, false);
      for (const L of (m.locks || [])) if (L.trig) W.link(node, L.trig.node, L.trig.parentLevel, L.trig.via, false);
      for (const z of m.zones) W.link(node, z.node, 2, null, z.kind === 'District');
      G.mapCache.set(node.id, m);
      if (G.mapCache.size > 12) G.mapCache.delete(G.mapCache.keys().next().value);
      loadThumbs(m);
    }
    if (AU.juke.mapId && AU.juke.mapId !== node.id) AU.stopJuke();
    G.map = m; G.area = area; G.zone = null;
    const p = G.player;
    const at = opts.fromChild && m.doors.get(opts.fromChild);
    if (at) { p.x = at.x; p.y = at.y; p.dir = 'down'; } else { p.x = m.spawn.x; p.y = m.spawn.y; p.dir = m.spawn.dir; }
    p.px = p.x * TS; p.py = p.y * TS; p.moving = 0; p.path = null; p.then = null;
    G.drops.length = 0; G.motes.length = 0;
    const first = !W.visited.has(node.id);
    W.visited.add(node.id);
    checkZone(true);
    maybeMentor(m, node, opts);
    AU.setPlace(node.id, G.zone ? G.zone.reading : area, m.kind === 'indoor');
    updateHud(); banner(W.disp(area.node), TH.LEVELS[area.level] + (first ? ' · discovered' : ''), readingLine(area, area), m.pal.accent);
    G.busy = false;
    award();
    fadeTo(0);
    return true;
  }

  function fadeTo(v) {
    return new Promise(res => {
      if (reduceMotion) { G.fade = v; return res(); }
      const start = G.fade, t0 = performance.now(), dur = 200;
      const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); G.fade = start + (v - start) * k; if (k < 1) requestAnimationFrame(step); else res(); };
      step();
    });
  }

  async function loadThumbs(m) {
    const arts = m.objs.filter(o => o.item && (o.spr[0] === 'wallart' || o.spr[1] === 'artwork')).slice(0, 120);
    await U.pool(arts, 4, async (o) => {
      const url = await G.fs.imageURL(o.item).catch(() => null);
      if (!url) return;
      const th = await SP.thumb(url);
      if (!th) return;
      o.custom = o.spr[0] === 'wallart' ? SP.wallArt(m.pals[o.pi || 0], th) : SP.itemWithThumb(m.pals[o.pi || 0], o.spr[2], th);
    });
  }

  async function enterChild(t) {
    const node = t.node;
    G.stack.push(node);
    if (t.via) G.via.set(node.id, { node: t.via, kind: t.viaKind || 'District' });
    const pl = t.parentLevel != null ? t.parentLevel : G.area.level;
    const ok = await goTo(node, pl);
    if (!ok) G.stack.pop();
  }
  async function goUp(toIndex, spawnAt) {
    if (G.stack.length <= 1 && spawnAt == null) return;
    const target = toIndex == null ? G.stack.length - 2 : toIndex;
    if (target < 0) return;
    const fromChild = spawnAt || (G.stack[target + 1] && G.stack[target + 1].id);
    if (target === G.stack.length - 1) { // same map: just walk the camera to that spot
      const at = G.map.doors.get(fromChild);
      if (at) { const p = G.player; p.x = at.x; p.y = at.y; p.px = p.x * TS; p.py = p.y * TS; p.path = null; checkZone(); }
      return;
    }
    const parentLevel = target === 0 ? 0 : (W.areaCache.get(G.stack[target - 1].id) || { level: 0 }).level;
    const popped = G.stack.splice(target + 1);
    const ok = await goTo(G.stack[target], parentLevel, { fromChild, root: target === 0 });
    if (!ok) G.stack.push(...popped);
  }

  // ── zones (districts on outdoor maps, rooms indoors) and floors ──
  function checkZone(silent) {
    const m = G.map, p = G.player;
    if (m.floors) { const f = m.floors.findIndex(r => p.y >= r.y && p.y < r.y + r.h); if (f >= 0) G.floor = f; }
    const z = m.zones.find(z => p.x >= z.x && p.y >= z.y && p.x < z.x + z.w && p.y < z.y + z.h) || null;
    if (z === G.zone) return;
    G.zone = z;
    if (z) {
      const first = !W.visited.has(z.node.id);
      W.visited.add(z.node.id);
      if (!silent && z.kind === 'District') banner(W.disp(z.node), 'District' + (first ? ' · discovered' : ''), readingLine(z.reading, null), m.pals[z.pi].accent, true);
    }
    AU.setPlace(G.map.area.node.id + (z ? '/' + z.node.name : ''), z ? z.reading : G.area, G.map.kind === 'indoor');
    updateHud();
  }

  // ── HUD ─────────────────────────────────────────────────
  const tagLabel = (t) => t === 'plain' ? 'quiet' : t;
  function readingLine(rd, area) {
    const tags = rd.tags && rd.tags.length ? rd.tags.slice(0, 2).map(t => tagLabel(t.tag)).join(' & ') : tagLabel(rd.primary);
    let s = `${tags} · ${AN.toneLabel(rd.mood)}`;
    if (area) s += ` · ${area.dirs.length} ${area.dirs.length === 1 ? 'place' : 'places'}, ${area.files.length} ${area.files.length === 1 ? 'file' : 'files'}`;
    return s;
  }
  function crumbBtn(label, name, here, onclick) {
    const b = document.createElement('button');
    b.className = 'crumb' + (here ? ' here' : '');
    b.innerHTML = `<span class="lvl">${U.esc(label)}</span><span class="nm">${U.esc(name)}</span>`;
    b.disabled = here; b.onclick = onclick;
    return b;
  }
  function updateHud() {
    const crumbs = $('#crumbs'); crumbs.innerHTML = '';
    const items = [];
    G.stack.forEach((n, i) => {
      const via = G.via.get(n.id);
      if (i > 0 && via) items.push({ label: via.kind, name: W.disp(via.node), go: () => goUp(i - 1, via.node.id) });
      const a = W.areaCache.get(n.id);
      items.push({ label: a ? TH.LEVELS[a.level] : '', name: W.disp(n), go: () => goUp(i) });
    });
    if (G.zone) items.push({ label: G.zone.kind, name: W.disp(G.zone.node), go: null });
    if (G.map && G.map.floors && G.map.floors.length > 1) items.push({ label: 'Floor', name: `${G.floor + 1} of ${G.map.floors.length}`, go: null });
    items.forEach((it, i) => {
      const here = i === items.length - 1 || !it.go;
      crumbs.appendChild(crumbBtn(it.label, it.name, here, it.go));
      if (i < items.length - 1) { const s = document.createElement('span'); s.className = 'sep'; s.textContent = '›'; crumbs.appendChild(s); }
    });
    crumbs.scrollLeft = crumbs.scrollWidth;
    $('#stat-places').textContent = W.visited.size;
    $('#stat-files').textContent = W.inspected.size;
    $('#q-count').textContent = Q.active.length;
    $('#stat-errands').textContent = Q.done.length;
    const carry = $('#carry');
    carry.hidden = !Q.pack.length;
    $('#pack-count').textContent = Q.pack.length;
    if (Q.pack.length) $('#carry-name').textContent = Q.pack.length === 1 ? Q.pack[0].name : `${Q.pack.length} things`;
    const np = $('#nowplaying');
    np.hidden = !AU.juke.node;
    if (AU.juke.node) $('#np-name').textContent = AU.juke.node.name;
    $('#stat-cards').textContent = K.held.size;
    // survey card: the zone you're standing in, else the whole map
    const rd = G.zone ? G.zone.reading : G.area;
    if (!rd) return;
    $('#area-name').textContent = G.zone ? W.disp(G.zone.node) : W.disp(G.area.node);
    $('#area-raw').textContent = G.zone ? G.zone.node.name : G.area.node.name;
    $('#area-level').textContent = G.zone ? G.zone.kind : TH.LEVELS[G.area.level];
    const tl = $('#area-tags'); tl.innerHTML = '';
    (rd.tags && rd.tags.length ? rd.tags : [{ tag: 'plain' }]).forEach(t => { const s = document.createElement('span'); s.className = 'chip'; s.textContent = tagLabel(t.tag); tl.appendChild(s); });
    setMeter($('#area-tone'), rd.mood);
    $('#area-tone-label').textContent = `${AN.toneLabel(rd.mood)} (${rd.mood >= 0 ? '+' : ''}${rd.mood.toFixed(2)})`;
  }

  let bannerTimer;
  function banner(title, kicker, sub, accent, small) {
    if (G.mode !== 'play') return;
    const el = $('#banner');
    $('#banner-kicker').textContent = kicker;
    $('#banner-title').textContent = title;
    $('#banner-sub').textContent = sub;
    el.classList.toggle('small', !!small);
    el.style.setProperty('--accent-area', accent);
    el.hidden = false; el.classList.remove('out');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.hidden = true; }, 400); }, small ? 2000 : 2800);
  }
  function setMeter(el, v) { el.style.setProperty('--pos', ((v + 1) * 50) + '%'); }

  // Announce anything newly earned.
  function award() {
    const fresh = A.sync();
    for (const a of fresh) {
      AU.sfx('trophy');
      toast(`Achievement — ${a.name}`, true);
      if (a.grants) setTimeout(() => { say('Dirhaven', a.grantLine || `You've earned the ${a.grants}.`, 'quest'); AU.sfx('unlock'); }, 700);
      updateHud();
    }
    if (fresh.length) { renderQuests(); renderPack(); }
  }

  let toastTimer;
  function toast(msg, calm) { const t = $('#toast'); t.textContent = msg; t.classList.toggle('calm', !!calm); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2200); }

  // ── dialog ─────────────────────────────────────────────
  let dlgFull = '', dlgShown = 0, dlgOpen = false;
  function say(who, text, kind) {
    dlgOpen = true; dlgFull = text; dlgShown = reduceMotion ? text.length : 0;
    $('#dlg-who').textContent = who; $('#dlg').dataset.kind = kind || '';
    $('#dlg-text').textContent = reduceMotion ? text : '';
    $('#dlg').hidden = false;
  }
  function closeDialog() { dlgOpen = false; $('#dlg').hidden = true; }
  function advanceDialog() { if (dlgShown < dlgFull.length) { dlgShown = dlgFull.length; $('#dlg-text').textContent = dlgFull; } else closeDialog(); }
  function guardLine(title, target) {
    const lines = target.dir ? [
      `Halt. “${title}” is off-limits. Your keycard doesn't open this folder.`,
      `Nobody gets into “${title}” without clearance. The filesystem said no.`,
      `Restricted area. “${title}” can't be listed with your permissions.`,
    ] : [
      `This vault holds “${title}”. You don't have read access, so it stays sealed.`,
      `Keycard reader's flashing red for “${title}”. Permission denied.`,
      `I've got orders: nobody reads “${title}”. Not even you.`,
    ];
    return lines[U.hash(title) % lines.length];
  }

  // ── inspect panel ──────────────────────────────────────
  const panel = $('#panel');
  let lastInspected = null;

  // ── what you can do with a file ────────────────────────────────────────
  const isAudio = (n) => LEX.AUDIO_EXT.has(U.ext(n.name)) || W.info(n).kind === 'jukebox';
  const isImage = (n) => LEX.IMAGE_EXT.has(U.ext(n.name));
  const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv', 'avi']);
  const isVideo = (n) => VIDEO_EXT.has(U.ext(n.name));
  // Anything that isn't a picture, a tune or a film is worth trying to read.
  const isReadable = (n) => !isImage(n) && !isAudio(n) && !isVideo(n) && !W.info(n).restricted && (n.size == null || n.size < 40e6);

  function renderPickup(node) {
    const b = $('#p-take');
    if (!node) { b.hidden = true; return; }
    b.hidden = false;
    const holding = Q.packHas(node.id);
    b.textContent = holding ? 'Put it back  (E)' : 'Pick it up  (E)';
    b.classList.toggle('primary', !holding);
    b.onclick = () => { if (holding) dropItem(node.id); else pickUp(node); };
    const q = Q.active.find(q => Q.matches(q, node));
    $('#p-quest').hidden = !q;
    if (q) $('#p-quest').textContent = `${q.giver.name} of ${q.giver.where} is waiting for this.`;
  }

  function renderActions(node) {
    const box = $('#p-actions'); box.innerHTML = '';
    const add = (label, fn, on) => {
      const b = document.createElement('button');
      b.className = 'act-btn' + (on ? ' on' : ''); b.textContent = label; b.onclick = fn;
      box.appendChild(b); return b;
    };
    let any = false;
    if (isAudio(node)) {
      any = true;
      const playing = AU.juke.node && AU.juke.node.id === node.id;
      add(playing ? '◼ Stop the music' : '▶ Play it here', async () => {
        if (playing) { AU.stopJuke(); updateHud(); renderActions(node); }
        else { await startJuke(node); renderActions(node); }
      }, playing);
    }
    if (isImage(node)) { any = true; add('🖼 Look at it', () => openViewer(node)); }
    if (isVideo(node)) { any = true; add('▶ Watch it', () => openViewer(node, true)); }
    if (isReadable(node) && !isImage(node)) { any = true; add('📖 Read it', () => openReader(node)); }
    if (!any) {
      const p = document.createElement('p'); p.className = 'muted'; p.style.padding = '0';
      p.textContent = W.info(node).restricted ? 'Sealed — nobody here can open it.' : 'Nothing in it a person can open.';
      box.appendChild(p);
    }
  }

  let pdfLib = null;
  function ensurePdf() {
    if (pdfLib) return pdfLib;
    if (window.pdfjsLib) { pdfLib = Promise.resolve(window.pdfjsLib); return pdfLib; }
    pdfLib = new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      el.onload = () => {
        const lib = window.pdfjsLib;
        if (!lib) return rej(new Error('pdf.js missing'));
        try { lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; } catch (e) {}
        res(lib);
      };
      el.onerror = () => rej(new Error('pdf.js blocked'));
      document.head.appendChild(el);
    });
    return pdfLib;
  }

  // Text pulled out of a document counts as the file's own words.
  function applyText(node, text) {
    const fi = W.fileInfo.get(node.id);
    if (!fi || !text || !text.trim()) return fi;
    fi.text = text; fi.content = AN.contentInfo(text);
    const sent = fi.content.sent.hits ? fi.content.sent : fi.name.sent;
    fi.tone = sent.compound;
    fi.scores = { ...fi.name.scores };
    for (const [k, v] of Object.entries(fi.content.scores)) fi.scores[k] = (fi.scores[k] || 0) + v;
    return fi;
  }
  function showReading(node, fi) {
    const tags = AN.topTags(fi.scores, 4), tl = $('#p-tags'); tl.innerHTML = '';
    (tags.length ? tags : [{ tag: 'untagged' }]).forEach(t => { const sp = document.createElement('span'); sp.className = 'chip'; sp.textContent = t.tag; tl.appendChild(sp); });
    setMeter($('#p-tone'), fi.tone);
    const src = fi.content && fi.content.sent.hits ? fi.content.sent : fi.name.sent;
    $('#p-tone-label').textContent = `${AN.toneLabel(fi.tone)} (${fi.tone >= 0 ? '+' : ''}${fi.tone.toFixed(2)})`;
    const words = [];
    if (src.pos.length) words.push('lifted by ' + src.pos.slice(0, 4).join(', '));
    if (src.neg.length) words.push('weighed down by ' + src.neg.slice(0, 4).join(', '));
    $('#p-words').textContent = words.length ? words.join(' · ') : (fi.content ? 'No emotionally loaded words found.' : 'Tone read from the file name only.');
    $('#p-desc').textContent = DESC.of(node, fi);
  }

  async function startJuke(node) {
    AU.init(); AU.resume();
    const obj = G.map.objs.find(o => o.item && o.item.id === node.id);
    const audio = LEX.AUDIO_EXT.has(U.ext(node.name));
    const url = audio ? await G.fs.fileURL(node).catch(() => null) : null;
    const mode = await AU.playFile(node, url, obj ? { x: obj.x, y: obj.y } : { x: G.player.x, y: G.player.y });
    AU.juke.mapId = G.area.node.id;
    A.bump('plays'); award();
    toast(mode === 'file' ? `Playing “${node.name}”`
      : audio ? `This browser can't decode .${U.ext(node.name)} — improvising instead`
      : `Nothing to decode — improvising on “${node.name}”`, true);
    updateHud();
  }

  async function inspect(node) {
    lastInspected = node;
    W.inspected.add(node.id); updateHud(); award();
    panel.hidden = false;
    $('#p-kind').textContent = AN.KIND_LABEL[W.info(node).kind] || 'Curio';
    $('#p-name').textContent = node.name;
    $('#p-path').textContent = node.id;
    $('#p-size').textContent = U.fmtSize(node.size);
    $('#p-date').textContent = U.fmtDate(node.mtime);
    $('#p-desc').textContent = 'Looking it over…';
    $('#p-tags').innerHTML = ''; $('#p-words').textContent = '';
    renderPickup(node); renderActions(node);
    const fi = await W.fileDetails(G.fs, node);
    if (panel.hidden || $('#p-path').textContent !== node.id) return;
    showReading(node, fi);
    renderPickup(node); renderActions(node);
  }

  // ── the book reader ────────────────────────────────────────────────────
  const readerEl = $('#reader'), paperEl = $('#reader-text');
  let book = { mode: 'text', page: 0, pages: 1, pdf: null, node: null };
  function openReader(node) {
    book = { mode: 'text', page: 0, pages: 1, pdf: null, node };
    readerEl.hidden = false;
    AU.sfx('open');
    $('#reader-kicker').textContent = DESC.noun(node).replace(/^an? /, '').toUpperCase();
    $('#reader-title').textContent = node.name;
    paperEl.style.transform = 'translateX(0)';
    paperEl.innerHTML = '<p>Opening…</p>';
    loadReader(node);
  }
  function closeReader() { readerEl.hidden = true; paperEl.innerHTML = ''; book.pdf = null; AU.sfx('close'); if (!panel.hidden && lastInspected) { renderActions(lastInspected); showReading(lastInspected, W.info(lastInspected)); } }
  async function loadReader(node) {
    const ext = U.ext(node.name);
    try {
      if (ext === 'pdf' && G.fs.bytes) {
        const [lib, buf] = await Promise.all([ensurePdf(), G.fs.bytes(node, 12e6)]);
        if (!buf || !buf.byteLength) throw new Error('no bytes');
        const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
        book.mode = 'pdf'; book.pdf = pdf; book.pages = pdf.numPages; book.page = 0;
        await drawPdfPage();
        A.bump('books'); award();
        // the words of the first pages colour the file's reading
        let text = '';
        for (let i = 1; i <= Math.min(3, pdf.numPages); i++) text += (await (await pdf.getPage(i)).getTextContent()).items.map(t => t.str).join(' ') + '\n';
        const fi = applyText(node, text); if (fi && !panel.hidden) showReading(node, fi);
        A.bump('pdfs'); award();
        return;
      }
      let text = W.info(node).text;
      if (DOCS.can(ext) && G.fs.bytes) {
        const buf = await G.fs.bytes(node, 12e6);
        const t = await DOCS.extract(buf, ext);
        if (t) { text = t; const fi = applyText(node, t); if (fi && !panel.hidden) showReading(node, fi); A.bump('pdfs'); award(); }
      }
      if (!text) text = await G.fs.readText(node, 200000).catch(() => null);
      if (text && /^%PDF-/.test(text.slice(0, 8))) text = null;
      if (!text) throw new Error('nothing to read');
      paperEl.innerHTML = '';
      const pre = document.createElement('pre');
      pre.textContent = text.slice(0, 120000);
      paperEl.appendChild(pre);
      layoutBook();
      A.bump('books'); award();
    } catch (e) {
      const why = /nothing to read/.test(String(e.message)) ? 'No readable text in this one — it\'s stored as binary.'
        : /blocked|pdf/i.test(String(e.message)) ? 'The reader script couldn\'t load here, so this document stays shut.'
        : 'This one refused to open.';
      paperEl.innerHTML = `<p style="font-style:italic">${U.esc(why)}</p>`;
      book.pages = 1; paintBookFoot();
    }
  }
  async function drawPdfPage() {
    const pdf = book.pdf;
    const page = await pdf.getPage(book.page + 1);
    const base = page.getViewport({ scale: 1 });
    const box = $('#reader-pages');
    const scale = Math.min(2.4, Math.max(0.6, (box.clientWidth - 60) / base.width));
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    paperEl.innerHTML = ''; paperEl.style.columnWidth = ''; paperEl.style.transform = 'translateX(0)';
    paperEl.appendChild(c);
    paintBookFoot();
  }
  function layoutBook() {
    const box = $('#reader-pages');
    const wide = box.clientWidth > 720;
    const gap = 48;
    const colW = wide ? (box.clientWidth - 52 - gap) / 2 : box.clientWidth - 52;
    paperEl.style.columnWidth = colW + 'px';
    paperEl.style.columnGap = gap + 'px';
    paperEl.style.transform = 'translateX(0)';
    book.step = wide ? (colW + gap) * 2 : colW + gap;
    requestAnimationFrame(() => {
      const total = paperEl.scrollWidth;
      book.pages = Math.max(1, Math.ceil(total / book.step));
      book.page = 0;
      paintBookFoot();
    });
  }
  function paintBookFoot() {
    $('#reader-page').textContent = book.mode === 'pdf' ? `Page ${book.page + 1} of ${book.pages}` : `Leaf ${book.page + 1} of ${book.pages}`;
    $('#reader-prev').disabled = book.page <= 0;
    $('#reader-next').disabled = book.page >= book.pages - 1;
  }
  async function turnPage(d) {
    const next = U.clamp(book.page + d, 0, book.pages - 1);
    if (next === book.page) return;
    book.page = next;
    AU.sfx('close');
    if (book.mode === 'pdf') await drawPdfPage();
    else { paperEl.style.transform = `translateX(${-book.page * book.step}px)`; paintBookFoot(); }
  }
  $('#reader-close').onclick = closeReader;
  $('#reader-prev').onclick = () => turnPage(-1);
  $('#reader-next').onclick = () => turnPage(1);
  readerEl.addEventListener('click', (e) => { if (e.target === readerEl) closeReader(); });

  // ── picture viewer ─────────────────────────────────────────────────────
  const viewerEl = $('#viewer');
  async function openViewer(node, video) {
    const url = await (video ? G.fs.fileURL(node) : G.fs.imageURL(node)).catch(() => null);
    if (!url) { toast(video ? 'No video to play from here.' : 'That picture can\'t be opened here.'); return; }
    const img = $('#viewer-img'), frame = img.parentElement;
    const old = frame.querySelector('video'); if (old) old.remove();
    if (video) {
      img.hidden = true;
      const v = document.createElement('video');
      v.src = url; v.controls = true; v.autoplay = true; v.style.maxWidth = '100%'; v.style.maxHeight = 'calc(90vh - 52px)'; v.style.display = 'block';
      frame.insertBefore(v, frame.firstChild);
    } else { img.hidden = false; img.src = url; }
    $('#viewer-cap').textContent = node.name;
    viewerEl.hidden = false; AU.sfx('open');
  }
  function closeViewer() {
    const v = viewerEl.querySelector('video'); if (v) { v.pause(); v.remove(); }
    $('#viewer-img').src = ''; viewerEl.hidden = true;
  }
  $('#viewer-close').onclick = closeViewer;
  viewerEl.addEventListener('click', (e) => { if (e.target === viewerEl) closeViewer(); });

  // ── bookcase ───────────────────────────────────────────────────────────
  const shelfEl = $('#shelf');
  const SPINES = ['#d9573f', '#3f7fd0', '#e8c860', '#4caf6a', '#9b7fe0', '#e8577a', '#6fd0e0', '#f0a35a'];
  function openShelf(files, where) {
    shelfEl.hidden = false;
    AU.sfx('open'); A.bump('shelves'); award();
    $('#shelf-where').textContent = `${files.length} file${files.length === 1 ? '' : 's'}${where ? ' · ' + where : ''}`;
    const box = $('#shelf-books'); box.innerHTML = '';
    files.forEach((f, i) => {
      const b = document.createElement('button');
      b.className = 'spine-btn';
      b.style.background = SPINES[U.hash(f.id) % SPINES.length];
      b.title = DESC.line(f);
      b.innerHTML = `<span>${U.esc(f.name)}</span>`;
      b.onclick = () => { shelfEl.hidden = true; inspect(f); };
      box.appendChild(b);
    });
  }
  $('#shelf-close').onclick = () => { shelfEl.hidden = true; };
  shelfEl.addEventListener('click', (e) => { if (e.target === shelfEl) shelfEl.hidden = true; });

  // ── backpack ───────────────────────────────────────────────────────────
  const packEl = $('#pack');
  const TOOL_LINE = { axe: 'Axe — fell trees in your way', jackhammer: 'Jackhammer — break rocks apart' };
  function pickUp(node) {
    const r = Q.packAdd(node);
    if (r === 'full') { AU.sfx('deny'); toast('Your backpack is full — drop something first.'); return; }
    if (r === 'already') return;
    AU.sfx('pickup');
    A.bump('carried'); award();
    updateHud(); renderQuests(); renderPack(); if (lastInspected) renderPickup(lastInspected);
    toast(`Packed “${node.name}”`, true);
  }
  function dropItem(id) {
    Q.packRemove(id); AU.sfx('drop');
    updateHud(); renderQuests(); renderPack();
    if (lastInspected) renderPickup(lastInspected);
  }
  function renderPack() {
    const list = $('#pack-list'); list.innerHTML = '';
    $('#pack-empty').hidden = Q.pack.length > 0;
    for (const n of Q.pack) {
      const li = document.createElement('li');
      const wanted = Q.active.some(q => Q.matches(q, n));
      li.innerHTML = `<span><span class="nm">${U.esc(n.name)}</span><span class="sub">${U.esc(DESC.line(n))}${wanted ? ' · asked for' : ''}</span></span>`;
      const row = document.createElement('span');
      const look = document.createElement('button'); look.textContent = 'Open'; look.onclick = () => { packEl.hidden = true; inspect(n); };
      const drop = document.createElement('button'); drop.textContent = 'Drop'; drop.onclick = () => dropItem(n.id);
      row.appendChild(look); row.appendChild(drop);
      li.appendChild(row);
      list.appendChild(li);
    }
    const kit = $('#pack-kit'); kit.innerHTML = '';
    $('#pack-kit-wrap').hidden = !K.tools.size;
    for (const t of K.tools) { const li = document.createElement('li'); li.textContent = TOOL_LINE[t] || t; kit.appendChild(li); }
  }
  function togglePack(force) {
    const open = force != null ? force : packEl.hidden;
    packEl.hidden = !open;
    if (open) renderPack();
  }
  $('#pack-close').onclick = () => togglePack(false);
  $('#btn-pack').onclick = () => togglePack();
  $('#carry-drop').onclick = () => togglePack(true);


  function closePanel() { panel.hidden = true; }
  $('#p-close').onclick = closePanel;

  // ── interaction ────────────────────────────────────────
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const dirTo = (x, y) => { const p = G.player; return x > p.x ? 'right' : x < p.x ? 'left' : y > p.y ? 'down' : 'up'; };
  function facing() { const [dx, dy] = DIRS[G.player.dir]; return [G.player.x + dx, G.player.y + dy]; }
  function npcAt(x, y) { return G.map.npcs.find(n => n.x === x && n.y === y); }
  function targetAt(x, y) {
    const m = G.map; if (!m || x < 0 || y < 0 || x >= m.w || y >= m.h) return null;
    const k = y * m.w + x;
    const n = npcAt(x, y); if (n) return { type: 'npc', npc: n };
    if (m.act.has(k)) return m.act.get(k);
    if (m.trig.has(k)) return m.trig.get(k);
    if (m.treeAt && m.treeAt.has(k)) {
      const o = m.treeAt.get(k);
      if (o.tree && K.hasTool('axe')) return { type: 'tree', obj: o };
      if (o.rock && K.hasTool('jackhammer')) return { type: 'rock', obj: o };
    }
    return null;
  }
  // Facing target, or — if nothing is in front — the one neighbour that has something.
  function nearTarget() {
    const [fx, fy] = facing();
    const t = targetAt(fx, fy);
    if (t) return { t, x: fx, y: fy };
    const p = G.player, found = [];
    for (const d of ['up', 'left', 'right', 'down']) { const [dx, dy] = DIRS[d]; const tt = targetAt(p.x + dx, p.y + dy); if (tt && tt.type !== 'exit' && tt.type !== 'enter' && tt.type !== 'stairs') found.push({ t: tt, x: p.x + dx, y: p.y + dy }); }
    return found.length === 1 ? found[0] : null;
  }
  function describe(t) {
    if (!t) return null;
    if (t.type === 'item') return ['Inspect', t.node.name];
    if (t.type === 'npc') return ['Talk', 'Resident'];
    if (t.type === 'guard') return ['Talk', 'Guard'];
    if (t.type === 'vault') return ['Try the keycard', t.title];
    if (t.type === 'enter') return ['Enter', W.disp(t.node)];
    if (t.type === 'stairs') return ['Take the stairs', t.label];
    if (t.type === 'exit') return ['Leave', G.stack.length > 1 ? W.disp(G.stack[G.stack.length - 2]) : ''];
    if (t.type === 'tree') return ['Chop', t.obj.spr[1] === 'bush' ? 'the bush' : 'the tree'];
    if (t.type === 'rock') return ['Break', 'the rock'];
    if (t.type === 'bookcase') return ['Browse', `${t.files.length} files`];
    if (t.type === 'lock') return ['Show a keycard', t.lock.name];
    return null;
  }
  function interact() {
    if (!readerEl.hidden) return closeReader();
    if (!viewerEl.hidden) { closeViewer(); return; }
    if (!shelfEl.hidden) { shelfEl.hidden = true; return; }
    if (dlgOpen) return advanceDialog();
    if (!packEl.hidden) return togglePack(false);
    if (!atlasEl.hidden) return atlasOpen(false);
    if (!questsEl.hidden) return toggleQuests(false);
    if (!panel.hidden) { const b = $('#p-take'); if (!b.hidden) { b.click(); return; } return closePanel(); }
    if (G.mode !== 'play' || G.busy || G.player.moving) return;
    const n = nearTarget();
    if (!n) return;
    G.player.dir = dirTo(n.x, n.y);
    act(n.t);
  }
  function act(t) {
    if (!t) return;
    if (t.type === 'item') inspect(t.node);
    else if (t.type === 'npc') talkTo(t.npc);
    else if (t.type === 'guard') { AU.sfx('deny'); A.bump('vaults'); award(); say('Guard', guardLine(t.title, t.target), 'guard'); }
    else if (t.type === 'vault') { AU.sfx('deny'); say('Keycard reader', `ACCESS DENIED — “${t.title}”. ${t.target.dir ? 'This folder' : 'This file'} isn't readable with your permissions.`, 'guard'); }
    else if (t.type === 'enter') { AU.sfx('door'); enterChild(t); }
    else if (t.type === 'exit') { AU.sfx('door'); goUp(); }
    else if (t.type === 'stairs') { AU.sfx('stairs'); takeStairs(t); }
    else if (t.type === 'lock') tryUnlock(t.lock);
    else if (t.type === 'tree') chop(t.obj);
    else if (t.type === 'rock') crush(t.obj);
    else if (t.type === 'bookcase') openShelf(t.files, t.room);
  }
  function chop(o) {
    const m = G.map, k = o.y * m.w + o.x;
    m.objs = m.objs.filter(x => x !== o);
    m.treeAt.delete(k);
    m.solid[k] = 0;
    if (o.spr[1] !== 'bush') m.objs.push({ x: o.x, y: o.y, w: 1, spr: ['decor', 'stump'], pi: o.pi, soft: true });
    AU.sfx('chop'); setTimeout(() => AU.sfx('timber'), 160);
    A.bump('chops'); award();
  }

  function crush(o) {
    const m = G.map, k = o.y * m.w + o.x;
    m.objs = m.objs.filter(x => x !== o);
    m.treeAt.delete(k);
    m.solid[k] = 0;
    m.objs.push({ x: o.x, y: o.y, w: 1, spr: ['decor', 'rubble'], pi: o.pi, soft: true });
    AU.sfx('chop'); setTimeout(() => AU.sfx('timber'), 120);
    A.bump('crushes'); award();
  }

  function tryUnlock(L) {
    if (!K.has(L.card.id)) {
      AU.sfx('deny');
      say('Guard', K.guardLine(L.card, false), 'guard');
      return;
    }
    const m = G.map;
    K.open(L.nodeId);
    for (const k of L.acts) m.act.delete(k);
    for (const o of L.open) { m.tiles[o.k] = o.tile; m.solid[o.k] = 0; }
    if (L.trig) m.trig.set(L.doorIdx, L.trig);
    for (const o of L.objs) m.solid[o.y * m.w + o.x] = 0;
    m.objs = m.objs.filter(o => !L.objs.includes(o));
    m.flat = m.flat.filter(f => !(f.spr[0] === 'reader' && f.x === L.doorIdx % m.w && f.y === Math.floor(L.doorIdx / m.w)));
    m.labels = m.labels.filter(l => !(l.restricted && l.text === L.card.name));
    m.locks = m.locks.filter(x => x !== L);
    renderGround(m);
    A.bump('unlocks'); award();
    AU.sfx('unlock');
    say('Guard', `${L.card.name} checks out. ${L.name} is open — go on through.`, 'quest');
    toast(`Unlocked ${L.name}`, true);
  }

  async function takeStairs(t) {
    G.busy = true; await fadeTo(1);
    const p = G.player; p.x = t.to.x; p.y = t.to.y; p.px = p.x * TS; p.py = p.y * TS; p.dir = t.to.dir; p.path = null;
    checkZone(true); updateHud(); toast(t.label, true); A.bump('floors'); award();
    G.busy = false; fadeTo(0);
  }

  // ── talking, errands ──────────────────────────────────
  // Odile meets you the first time you step out of your own front door.
  function maybeMentor(m, node, opts) {
    if (!G.starter || node.id !== K.starterMap) return;
    const active = Q.forGiver('mentor');
    const firstExit = !active && !Q.mentorDone && !Q.mentorSpawned && opts.fromChild === G.starter.node.id;
    if (!active && !firstExit) return;
    if (m.npcs.some(n => n.id === 'mentor')) return;
    const p = G.player;
    const free = (x, y) => passable(x, y) && !(m.noStand && m.noStand.has(y * m.w + x));
    const spot = [[p.x - 1, p.y], [p.x + 1, p.y], [p.x - 1, p.y - 1], [p.x + 1, p.y - 1], [p.x, p.y - 2], [p.x, p.y + 1]].find(([x, y]) => free(x, y))
      || [[p.x - 1, p.y], [p.x + 1, p.y], [p.x, p.y - 1]].find(([x, y]) => passable(x, y));
    if (!spot) return;
    const npc = { id: 'mentor', name: 'Odile', look: 4, where: G.starter.districtName, mentor: true,
      line: active ? active.hints[active.revealed - 1] : 'Mind how you go out there.',
      x: spot[0], y: spot[1], px: spot[0] * TS, py: spot[1] * TS, dir: 'down', moving: 0, wait: 1e9, seed: 0.5 };
    m.npcs.push(npc);
    if (firstExit) {
      Q.mentorSpawned = true;
      setTimeout(() => {
        if (G.mode !== 'play' || G.busy) return;
        G.player.dir = npc.y < G.player.y ? 'up' : npc.y > G.player.y ? 'down' : npc.x < G.player.x ? 'left' : 'right';
        talkTo(npc);
      }, 700);
    }
  }

  function talkTo(npc) {
    npc.dir = { up: 'down', down: 'up', left: 'right', right: 'left' }[G.player.dir];
    P.meet(npc, G.area, G.zone);
    award();
    const q = Q.forGiver(npc.id);
    if (npc.mentor && !q) {
      if (Q.mentorDone) { say(npc.name, "You've got the hang of it. Ask anyone standing about — locals know their own streets."); return; }
      const mq = Q.mentorOffer(G.area, G.starter);
      if (!mq) { say(npc.name, 'Welcome out. Have a walk around.'); return; }
      Q.accept(mq); AU.sfx('quest');
      say(npc.name, mq.pitch, 'quest');
      toast('Errand added to your log', true); updateHud(); renderQuests();
      return;
    }
    if (q) {
      const delivered = Q.packMatch(q);
      if (delivered) {
        const line = Q.complete(q, delivered);
        AU.sfx('done');
        if (q.mentor) Q.mentorDone = true;
        award();
        say(npc.name, `That's the one — “${q.deliveredName}”. ${line}`, 'quest');
        updateHud(); renderQuests(); renderPack();
        toast('Errand complete', true);
        return;
      }
      if (Q.pack.length) { say(npc.name, `${Q.why(q, Q.pack[Q.pack.length - 1])} ${q.hints[q.revealed - 1]}`); return; }
      say(npc.name, `Still looking? ${q.hints[q.revealed - 1]}`);
      return;
    }
    const help = Q.ask(G.area, G.zone ? G.zone.node : null);
    const offer = Q.offerFor(npc, G.area);
    if (help && (help.fresh || !offer)) {
      if (help.fresh) { A.bump('hints'); award(); }
      AU.sfx(help.fresh ? 'hint' : 'select');
      say(npc.name, help.line, help.fresh ? 'quest' : '');
      renderQuests();
      return;
    }
    if (!offer) { say(npc.name, npc.line); return; }
    if (Q.active.length >= 5) { say(npc.name, `You've got your hands full already. Come back once you've delivered something.`); return; }
    Q.accept(offer, npc);
    AU.sfx('quest');
    say(npc.name, `${offer.pitch} ${offer.hints[0]}`, 'quest');
    toast('Errand added to your log', true);
    updateHud(); renderQuests();
  }


  const questsEl = $('#quests');
  function renderQuests() {
    const list = $('#q-list'); list.innerHTML = '';
    $('#q-count').textContent = Q.active.length;
    $('#stat-errands').textContent = Q.done.length;
    $('#q-empty').hidden = Q.active.length > 0;
    for (const q of Q.active) {
      const el = document.createElement('article'); el.className = 'quest';
      const hints = q.hints.slice(0, q.revealed).map(h => `<li>${U.esc(h)}</li>`).join('');
      const carrying = !!Q.packMatch(q);
      el.innerHTML = `<h3>${U.esc(q.short)}</h3>
        <p class="who">${U.esc(q.giver.name)} · ${U.esc(q.giver.where)}</p>
        <ul class="hints">${hints}</ul>
        ${carrying ? `<p class="ready">You're carrying it — take it back to ${U.esc(q.giver.name)}.</p>` : ''}`;
      const row = document.createElement('div'); row.className = 'qrow';
      if (q.revealed < q.hints.length) {
        const tip = document.createElement('span'); tip.className = 'asktip';
        tip.textContent = `Ask someone near ${q.scopeBranch || q.branch || q.scope.name} for more.`;
        row.appendChild(tip);
      }
      const d = document.createElement('button'); d.className = 'minibtn ghost'; d.textContent = 'Give up';
      d.onclick = () => { Q.abandon(q); renderQuests(); updateHud(); };
      row.appendChild(d);
      el.appendChild(row);
      list.appendChild(el);
    }
    renderPeople();
    const ach = $('#q-ach'); ach.innerHTML = '';
    $('#q-ach-count').textContent = `${A.unlocked.size}/${A.LIST.length}`;
    for (const a of A.LIST) {
      const li = document.createElement('li');
      li.className = A.unlocked.has(a.id) ? 'got' : '';
      li.innerHTML = `<b>${U.esc(a.name)}</b> ${U.esc(a.desc)}`;
      ach.appendChild(li);
    }
    const cards = $('#q-cards'); cards.innerHTML = '';
    $('#q-cards-wrap').hidden = !K.held.size;
    for (const c of K.held.values()) { const li = document.createElement('li'); li.textContent = `${c.name}${c.from ? ' — from ' + c.from : ''}`; cards.appendChild(li); }
    for (const t of K.tools) { const li = document.createElement('li'); li.textContent = t === 'axe' ? 'A woodcutter\'s axe — chop trees in your way' : t; cards.appendChild(li); }
    $('#q-cards-wrap').hidden = !(K.held.size || K.tools.size);
    const doneList = $('#q-done'); doneList.innerHTML = '';
    $('#q-done-wrap').hidden = !Q.done.length;
    for (const q of Q.done.slice(-8).reverse()) {
      const li = document.createElement('li'); li.textContent = `${q.short} — for ${q.giver.name} of ${q.giver.where}`;
      doneList.appendChild(li);
    }
  }
  function renderPeople() {
    const list = $('#people-list'); list.innerHTML = '';
    $('#people-empty').hidden = P.met.size > 0;
    const rows = [...P.met.values()].sort((a, b) => (a.mentor ? -1 : b.mentor ? 1 : 0) || (a.name < b.name ? -1 : 1));
    for (const e of rows) {
      const st = P.status(e);
      const li = document.createElement('li');
      li.className = st.kind === 'open' ? 'open' : '';
      li.innerHTML = `<div class="nm">${U.esc(e.name)}${e.mentor ? ' · your neighbour' : ''}</div>
        <div class="sub">${U.esc(e.where)}${e.place && e.place !== e.where ? ' · ' + U.esc(e.place) : ''}</div>
        <div class="st">${U.esc(st.text)}</div>`;
      list.appendChild(li);
    }
  }
  function showTab(name) {
    document.querySelectorAll('#quests .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    document.querySelectorAll('#quests [data-pane]').forEach(p => { p.hidden = p.dataset.pane !== name; });
    if (name === 'people') renderPeople();
  }
  document.querySelectorAll('#quests .tab').forEach(t => { t.onclick = () => { AU.sfx('select'); showTab(t.dataset.tab); }; });

  function toggleQuests(force, tab) {
    const open = force != null ? force : questsEl.hidden;
    questsEl.hidden = !open;
    if (open) { renderQuests(); renderPeople(); if (tab) showTab(tab); }
  }

  // ── movement ──────────────────────────────────────────
  function passable(x, y) {
    const m = G.map;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false;
    return !m.solid[y * m.w + x] && !npcAt(x, y);
  }
  function tryStep(dir) {
    const p = G.player; p.dir = dir;
    const [dx, dy] = DIRS[dir];
    if (passable(p.x + dx, p.y + dy)) { p.x += dx; p.y += dy; p.moving = TS; if ((G.steps = (G.steps || 0) + 1) % 2 === 0) AU.sfx('step'); return true; }
    AU.sfx('bump');
    return false;
  }
  function arrived() {
    const m = G.map, p = G.player;
    checkZone();
    const t = m.trig.get(p.y * m.w + p.x);
    if (t) { p.path = null; act(t); return true; }
    return false;
  }
  function bfs(tx, ty, adjacentOk) {
    const m = G.map, p = G.player, W_ = m.w;
    const goal = (x, y) => (x === tx && y === ty) || (adjacentOk && Math.abs(x - tx) + Math.abs(y - ty) === 1);
    const prev = new Map(); const q = [[p.x, p.y]]; prev.set(p.y * W_ + p.x, null);
    let found = null, head = 0;
    while (head < q.length && head < 60000) {
      const [x, y] = q[head++];
      if (goal(x, y)) { found = [x, y]; break; }
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, k = ny * W_ + nx;
        if (prev.has(k) || !passable(nx, ny)) continue;
        if (m.trig.has(k) && !(nx === tx && ny === ty)) continue;
        prev.set(k, [x, y]); q.push([nx, ny]);
      }
    }
    if (!found) return null;
    const path = []; let cur = found;
    while (cur && !(cur[0] === p.x && cur[1] === p.y)) { path.unshift(cur); cur = prev.get(cur[1] * W_ + cur[0]); }
    return path;
  }

  function bounds() {
    const m = G.map;
    if (m.floors && m.floors[G.floor]) { const f = m.floors[G.floor]; return { x: f.x * TS, y: f.y * TS, w: f.w * TS, h: f.h * TS }; }
    return { x: 0, y: 0, w: m.w * TS, h: m.h * TS };
  }

  function update() {
    G.t++;
    const m = G.map; if (!m) return;
    const p = G.player;
    const canMove = G.mode === 'play' && !G.busy && !dlgOpen && panel.hidden;
    const spd = G.keys.has('Shift') ? 4 : 2;
    if (p.moving > 0) {
      p.moving -= spd; if (p.moving < 0) p.moving = 0;
      const [dx, dy] = DIRS[p.dir];
      p.px = p.x * TS - dx * p.moving; p.py = p.y * TS - dy * p.moving;
      if ((G.t % 8) === 0) p.frame++;
      if (p.moving === 0 && arrived()) return;
    } else if (canMove) {
      const k = G.keys;
      let dir = null;
      if (k.has('ArrowUp') || k.has('w') || k.has('W')) dir = 'up';
      else if (k.has('ArrowDown') || k.has('s') || k.has('S')) dir = 'down';
      else if (k.has('ArrowLeft') || k.has('a') || k.has('A')) dir = 'left';
      else if (k.has('ArrowRight') || k.has('d') || k.has('D')) dir = 'right';
      if (dir) { p.path = null; p.then = null; if (!tryStep(dir)) p.frame = 0; }
      else if (p.path && p.path.length) {
        const [nx, ny] = p.path.shift();
        if (!tryStep(dirTo(nx, ny))) p.path = null;
      } else if (p.then) {
        const t = p.then; p.then = null;
        if (t.face) p.dir = t.face;
        act(t.target);
      }
    }
    for (const n of m.npcs) {
      if (n.moving > 0) { n.moving -= 1; const [dx, dy] = DIRS[n.dir]; n.px = n.x * TS - dx * n.moving; n.py = n.y * TS - dy * n.moving; if (G.t % 10 === 0) n.frame = (n.frame || 0) + 1; continue; }
      if (dlgOpen || --n.wait > 0) continue;
      n.seed = (n.seed * 9301 + 0.49297) % 1;
      const d = ['up', 'down', 'left', 'right'][Math.floor(n.seed * 4)];
      const [dx, dy] = DIRS[d]; const nx = n.x + dx, ny = n.y + dy, k = ny * m.w + nx;
      n.dir = d;
      const t = inb(nx, ny) ? m.tiles[k] : -1;
      const walkable = t === W.T.ROAD || t === W.T.PLAZA || t === W.T.FLOOR || t === W.T.RUG;
      if (inb(nx, ny) && walkable && !m.solid[k] && !(m.noStand && m.noStand.has(k)) && !(p.x === nx && p.y === ny) && !npcAt(nx, ny)) { n.x = nx; n.y = ny; n.moving = TS; }
      n.wait = 30 + Math.floor(n.seed * 140);
    }
    // camera
    const vw = canvas.width / G.scale, vh = canvas.height / G.scale, b = bounds();
    let cx, cy;
    if (G.mode === 'title') { cx = b.x + (b.w - vw) / 2 + Math.sin(G.t / 500) * Math.max(0, (b.w - vw) / 2); cy = b.y + (b.h - vh) / 2 + Math.cos(G.t / 650) * Math.max(0, (b.h - vh) / 2) * 0.7; }
    else { cx = p.px + 8 - vw / 2; cy = p.py + 8 - vh / 2; }
    cx = b.w <= vw ? b.x + (b.w - vw) / 2 : U.clamp(cx, b.x, b.x + b.w - vw);
    cy = b.h <= vh ? b.y + (b.h - vh) / 2 : U.clamp(cy, b.y, b.y + b.h - vh);
    G.cam.x = Math.round(cx); G.cam.y = Math.round(cy);
  }
  const inb = (x, y) => G.map && x >= 0 && y >= 0 && x < G.map.w && y < G.map.h;

  // ── draw ──────────────────────────────────────────────
  function draw() {
    const m = G.map, s = G.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0c11';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!m) return;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(s, 0, 0, s, -G.cam.x * s, -G.cam.y * s);
    const b = bounds();
    ctx.save();
    if (m.floors) { ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip(); }
    ctx.drawImage(m.ground, 0, 0);
    const vx0 = G.cam.x - 64, vy0 = G.cam.y - 16, vx1 = G.cam.x + canvas.width / s + 64, vy1 = G.cam.y + canvas.height / s + 140;
    const list = [], namePlates = [];
    for (const o of m.objs) {
      const px = o.x * TS, py = (o.y + 1) * TS;
      if (px > vx1 || px + (o.w || 1) * TS < vx0 || py < vy0 || py - 140 > vy1) continue;
      list.push({ y: o.y + (o.wall ? 0.1 : 0.5), o });
    }
    for (const n of m.npcs) list.push({ y: n.py / TS + 0.6, n });
    if (G.mode !== 'title') list.push({ y: G.player.py / TS + 0.6, player: true });
    list.sort((a, c) => a.y - c.y);
    for (const e of list) {
      if (e.o) {
        const o = e.o;
        const pal = m.pals[o.pi || 0];
        const spr = o.custom || SP.get(o.spr, pal);
        const dx = o.x * TS + Math.floor(((o.w || 1) * TS - spr.width) / 2), dy = (o.y + 1) * TS - spr.height + (o.oy || 0);
        if (!o.wall && (o.spr[0] === 'item' || o.spr[0] === 'decor' || o.guard)) { ctx.fillStyle = 'rgba(10,12,20,0.22)'; ctx.fillRect(dx + 3, (o.y + 1) * TS - 3, spr.width - 6, 2); }
        ctx.drawImage(spr, dx, dy);
        if (o.item && o.spr[1] === 'server' && ((G.t >> 4) + o.x) % 2) { ctx.fillStyle = '#7cfc6a'; ctx.fillRect(dx + 4, dy + 7, 1, 1); ctx.fillRect(dx + 4, dy + 15, 1, 1); }
        if (o.item && !W.inspected.has(o.item.id) && !reduceMotion && ((G.t + o.x * 13 + o.y * 7) % 150) < 10) { ctx.fillStyle = '#fff6c0'; ctx.fillRect(dx + 11, dy + 2, 1, 3); ctx.fillRect(dx + 10, dy + 3, 3, 1); }
      } else if (e.n) {
        const n = e.n; const spr = SP.person(SP.npcLook(n.look), n.dir, n.moving ? (n.frame || 0) : 0);
        ctx.fillStyle = 'rgba(10,12,20,0.25)'; ctx.fillRect(n.px + 3, n.py + 14, 10, 2);
        ctx.drawImage(spr, n.px, n.py - 6);
        const mk = G.mode === 'play' ? Q.mark(n, G.area) : null;
        if (mk) { const bob = reduceMotion ? 0 : Math.round(Math.sin((G.t + n.px) / 14) * 2); ctx.drawImage(SP.questMark(mk), n.px + 3, n.py - 19 + bob); }
        if (G.mode === 'play' && P.knows(n.id)) namePlates.push({ x: n.px + 8, y: n.py - (mk ? 22 : 8), text: n.name });
      } else if (e.player) {
        const p = G.player; const spr = SP.person(SP.PLAYER, p.dir, p.moving ? p.frame : 0);
        ctx.fillStyle = 'rgba(10,12,20,0.3)'; ctx.fillRect(p.px + 3, p.py + 14, 10, 2);
        ctx.drawImage(spr, p.px, p.py - 6);
      }
    }
    // marker over whatever you'd interact with
    if (G.mode === 'play' && !G.player.moving && !dlgOpen && panel.hidden) {
      const n = nearTarget();
      if (n && n.t.type !== 'exit') {
        const bob = reduceMotion ? 0 : Math.round(Math.sin(G.t / 8) * 1.5);
        const obj = m.objs.find(o => o.x <= n.x && n.x < o.x + (o.w || 1) && o.y === n.y);
        const top = obj && !obj.node && !obj.vault ? (obj.y + 1) * TS - (obj.custom || SP.get(obj.spr, m.pals[obj.pi || 0])).height + (obj.oy || 0) : n.y * TS - 2;
        const mx = n.x * TS + 5, my = top - 7 + bob;
        ctx.fillStyle = '#1a1c24'; ctx.fillRect(mx - 1, my - 1, 8, 5); ctx.fillRect(mx + 1, my + 4, 4, 2);
        ctx.fillStyle = '#d9a441'; ctx.fillRect(mx, my, 6, 3); ctx.fillRect(mx + 1, my + 3, 4, 1); ctx.fillRect(mx + 2, my + 4, 2, 1);
      }
    }
    drawWeather(m);
    ctx.restore();
    // names float above people you've been introduced to
    if (namePlates.length) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = G.dpr, fs = Math.round(9 * dpr);
      ctx.font = `600 ${fs}px "Pixelify Sans", ui-monospace, monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      for (const n of namePlates) {
        const sx = (n.x - G.cam.x) * s, sy = (n.y - G.cam.y) * s;
        if (sx < -80 || sy < -30 || sx > canvas.width + 80 || sy > canvas.height + 30) continue;
        const w2 = ctx.measureText(n.text).width + 8 * dpr;
        ctx.fillStyle = 'rgba(14,16,24,0.78)';
        ctx.fillRect(sx - w2 / 2, sy - fs - 4 * dpr, w2, fs + 5 * dpr);
        ctx.fillStyle = '#ece6d6';
        ctx.fillText(n.text, sx, sy);
      }
      ctx.setTransform(s, 0, 0, s, -G.cam.x * s, -G.cam.y * s);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const here = palAt(m, G.player.x, G.player.y), mood = G.mode === 'title' ? m.pal.mood : here.mood;
    if (mood < -0.15) { ctx.fillStyle = `rgba(28,36,70,${Math.min(0.32, -mood * 0.35)})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    else if (mood > 0.2) { ctx.fillStyle = `rgba(255,196,110,${Math.min(0.1, mood * 0.1)})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    drawLabels(m, b);
    if (G.fade > 0) { ctx.fillStyle = `rgba(11,12,17,${G.fade})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    drawMini(m, b);
  }

  function drawWeather(m) {
    if (reduceMotion) return;
    const s = G.scale, vw = canvas.width / s, vh = canvas.height / s;
    const here = palAt(m, G.player.x, G.player.y), mood = here.mood, outdoor = m.kind === 'outdoor';
    if (outdoor && mood < -0.3) {
      while (G.drops.length < 90) G.drops.push({ x: Math.random() * vw, y: Math.random() * vh, v: 3 + Math.random() * 2 });
      ctx.fillStyle = 'rgba(190,210,240,0.55)';
      for (const d of G.drops) { d.y += d.v; d.x -= 0.6; if (d.y > vh) { d.y = -6; d.x = Math.random() * (vw + 40); } ctx.fillRect(G.cam.x + Math.round(d.x), G.cam.y + Math.round(d.y), 1, 4); }
    } else G.drops.length = 0;
    if (mood > 0.3 || !outdoor) {
      while (G.motes.length < 24) G.motes.push({ x: Math.random() * vw, y: Math.random() * vh, p: Math.random() * 6.28 });
      ctx.fillStyle = outdoor ? 'rgba(255,236,150,0.8)' : 'rgba(255,240,210,0.35)';
      for (const d of G.motes) { d.p += 0.02; d.y -= 0.12; d.x += Math.sin(d.p) * 0.2; if (d.y < -4) { d.y = vh + 4; d.x = Math.random() * vw; } if (Math.sin(d.p * 3) > -0.2) ctx.fillRect(G.cam.x + Math.round(d.x), G.cam.y + Math.round(d.y), 1, 1); }
    } else G.motes.length = 0;
  }

  function drawLabels(m, b) {
    const s = G.scale, dpr = G.dpr, p = G.player;
    for (const l of m.labels) {
      if (l.y * TS < b.y - TS || l.y * TS > b.y + b.h + TS) continue;
      const sx = (l.x * TS - G.cam.x) * s, sy = (l.y * TS - G.cam.y) * s;
      if (sx < -220 || sx > canvas.width + 220 || sy < -60 || sy > canvas.height + 60) continue;
      const dist = G.mode === 'title' ? 0 : Math.hypot(l.x - p.x, l.y - p.y);
      const alpha = G.mode === 'title' ? 0.85 : U.clamp(1.3 - dist / (l.district ? 22 : 12), l.district ? 0.5 : 0.28, 1);
      const big = l.district ? 1.25 : l.small ? 0.85 : 1;
      const fs = Math.round(11 * dpr * big), fs2 = Math.round(8.5 * dpr * Math.min(1, big));
      ctx.globalAlpha = alpha;
      ctx.font = `600 ${fs}px "Pixelify Sans", ui-monospace, monospace`;
      const text = l.text.length > 24 ? l.text.slice(0, 23) + '…' : l.text;
      const tw = ctx.measureText(text).width;
      ctx.font = `700 ${fs2}px "Atkinson Hyperlegible", system-ui, sans-serif`;
      const sub = l.sub.toUpperCase(); const sw = ctx.measureText(sub).width;
      const w = Math.max(tw, sw) + 14 * dpr, h = fs + fs2 + 12 * dpr;
      const x = Math.round(sx - w / 2), y = Math.round(sy - h);
      const pal = palAt(m, Math.floor(l.x), Math.ceil(l.y));
      ctx.fillStyle = l.restricted ? 'rgba(80,18,14,0.9)' : 'rgba(14,16,24,0.84)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = l.restricted ? '#e0533d' : pal.accent;
      ctx.fillRect(x, y + h - 2 * dpr, w, 2 * dpr);
      ctx.fillStyle = l.restricted ? '#ffb4a8' : '#9aa0b8';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(sub, Math.round(sx), y + 4 * dpr);
      ctx.font = `600 ${fs}px "Pixelify Sans", ui-monospace, monospace`;
      ctx.fillStyle = '#f4f1ea';
      ctx.fillText(text, Math.round(sx), y + 5 * dpr + fs2);
      if (l.id && !W.visited.has(l.id)) {
        const bob = reduceMotion ? 0 : Math.round(Math.sin(G.t / 12) * 2 * dpr);
        const bx = x + w - 4 * dpr, by = y - 4 * dpr + bob;
        ctx.fillStyle = '#d9a441'; ctx.fillRect(bx - 3 * dpr, by - 3 * dpr, 7 * dpr, 7 * dpr);
        ctx.fillStyle = '#1a1c24'; ctx.fillRect(bx - 1 * dpr, by - 2 * dpr, 2 * dpr, 3 * dpr); ctx.fillRect(bx - 1 * dpr, by + 2 * dpr, 2 * dpr, 1 * dpr);
      }
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  }

  // ── atlas: the places you know, and a way back to them ──
  const atlasEl = $('#atlas'), atlasCanvas = $('#atlas-canvas');
  let atlasSel = null, atlasHot = [];
  function lockedCard(nodeId) {
    const card = K.known.get(nodeId);
    return card && !K.isOpen(nodeId) && !K.has(card.id) ? card : null;
  }
  function atlasOpen(force) {
    const open = force != null ? force : atlasEl.hidden;
    atlasEl.hidden = !open;
    if (!open) return;
    atlasSel = G.zone ? G.zone.node : G.area.node;
    AU.sfx('open');
    atlasTree(); atlasDraw();
  }
  function atlasTree() {
    const box = $('#atlas-tree'); box.innerHTML = '';
    const walk = (node, depth) => {
      const kids = (W.childrenOf.get(node.id) || []).slice().sort((a, b) => (a.name < b.name ? -1 : 1));
      const b = document.createElement('button');
      b.className = 'atlas-row' + (atlasSel && atlasSel.id === node.id ? ' sel' : '') + (W.visited.has(node.id) ? '' : ' unseen');
      const a = W.areaCache.get(node.id);
      const lock = lockedCard(node.id);
      b.style.paddingLeft = (8 + depth * 12) + 'px';
      b.innerHTML = `<span class="nm">${U.esc(W.disp(node))}</span><span class="lv">${lock ? '🔒 ' : ''}${a ? TH.LEVELS[a.level] : W.embeddedLabel(node)}</span>`;
      b.onclick = () => { atlasSel = node; atlasTree(); atlasDraw(); };
      box.appendChild(b);
      if (depth < 3) for (const k of kids) if (W.visited.has(k.id) || W.childrenOf.has(k.id) || depth < 2) walk(k, depth + 1);
    };
    if (G.rootNode) walk(G.rootNode, 0);
  }
  function atlasDraw() {
    const node = atlasSel; atlasHot = [];
    const wrap = $('#atlas-view');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = wrap.clientWidth, h = Math.max(220, wrap.clientHeight - 62);
    atlasCanvas.width = w * dpr; atlasCanvas.height = h * dpr;
    atlasCanvas.style.width = w + 'px'; atlasCanvas.style.height = h + 'px';
    const g = atlasCanvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b0c11'; g.fillRect(0, 0, w, h);
    const area = W.areaCache.get(node.id);
    let m = G.mapCache.get(node.id), crop = null;
    const rec = W.parentOf.get(node.id);
    if (!m && rec && rec.embedded) {            // a quarter lives inside its parent's map
      const host = G.mapCache.get(rec.parent.id);
      const z = host && host.zones.find(z => z.node.id === node.id);
      if (z) { m = host; crop = { x: z.x - 2, y: z.y - 2, w: z.w + 4, h: z.h + 4 }; }
    }
    $('#atlas-name').textContent = W.disp(node);
    const zoneRec = crop ? (m.zones.find(z => z.node.id === node.id) || {}) : null;
    $('#atlas-sub').textContent = area ? `${TH.LEVELS[area.level]} · ${readingLine(area, area)}`
      : zoneRec && zoneRec.reading ? `District · ${readingLine(zoneRec.reading, null)}`
      : (W.visited.has(node.id) ? 'Surveyed' : 'Not surveyed yet — walk there to map it');
    const travel = $('#atlas-travel');
    const lock = lockedCard(node.id);
    const here = (G.zone ? G.zone.node.id : G.area.node.id) === node.id;
    travel.disabled = here || !!lock;
    travel.textContent = here ? 'You are here' : lock ? `Locked — needs the ${lock.name}` : `Travel to ${W.disp(node)}`;
    travel.onclick = () => { atlasOpen(false); travelTo(node); };
    if (m && m.mini) {
      const cx0 = crop ? crop.x : 0, cy0 = crop ? crop.y : 0;
      const cw = crop ? crop.w : m.w, chh = crop ? crop.h : m.h;
      const s = Math.min((w - 24) / cw, (h - 24) / chh);
      const ox = (w - cw * s) / 2 - cx0 * s, oy = (h - chh * s) / 2 - cy0 * s;
      g.imageSmoothingEnabled = false;
      g.save(); g.beginPath(); g.rect(ox + cx0 * s, oy + cy0 * s, cw * s, chh * s); g.clip();
      g.drawImage(m.mini, ox, oy, m.w * s, m.h * s);
      g.font = `600 ${Math.max(9, Math.min(12, s * 1.6))}px "Pixelify Sans", monospace`;
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      for (const l of m.labels) {
        if (!l.id || l.small) continue;
        if (crop && (l.x < crop.x || l.y < crop.y || l.x > crop.x + crop.w || l.y > crop.y + crop.h)) continue;
        const x = ox + l.x * s, y = oy + l.y * s;
        const label = l.text.length > 18 ? l.text.slice(0, 17) + '…' : l.text;
        const tw = g.measureText(label).width + 8;
        g.fillStyle = l.restricted ? 'rgba(80,18,14,.9)' : 'rgba(15,17,24,.85)';
        g.fillRect(x - tw / 2, y - 14, tw, 14);
        g.fillStyle = l.district ? '#d9a441' : '#ece6d6';
        g.fillText(label, x, y - 3);
        const owner = crop ? rec.parent.id : node.id;
        const child = (W.childrenOf.get(owner) || []).find(n => n.id === l.id)
          || (m.zones.find(z => z.node.id === l.id) || {}).node;
        if (child && child.id !== node.id) atlasHot.push({ x: x - tw / 2, y: y - 14, w: tw, h: 14, node: child });
      }
      // you are here
      if (G.area && (G.area.node.id === node.id || (crop && G.area.node.id === rec.parent.id))) {
        g.fillStyle = '#fff';
        g.fillRect(ox + G.player.x * s - 2, oy + G.player.y * s - 2, Math.max(4, s + 2), Math.max(4, s + 2));
      }
      g.restore();
    } else if (area) {
      // not walked yet: a schematic of what we peeked
      const kids = area.childInfo.map(c => c.node);
      const cols = Math.max(1, Math.ceil(Math.sqrt(kids.length || 1)));
      const cw = (w - 24) / cols, ch = 46;
      g.font = '600 12px "Pixelify Sans", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      kids.forEach((k, i) => {
        const x = 12 + (i % cols) * cw, y = 16 + Math.floor(i / cols) * (ch + 8);
        if (y > h - 20) return;
        g.fillStyle = W.visited.has(k.id) ? '#212536' : '#181b27';
        g.fillRect(x + 3, y, cw - 8, ch);
        g.fillStyle = lockedCard(k.id) ? '#e0533d' : '#353b52';
        g.fillRect(x + 3, y, 3, ch);
        g.fillStyle = '#ece6d6';
        const label = W.disp(k);
        g.fillText(label.length > 16 ? label.slice(0, 15) + '…' : label, x + cw / 2, y + ch / 2);
        atlasHot.push({ x: x + 3, y, w: cw - 8, h: ch, node: k });
      });
      if (!kids.length) { g.fillStyle = '#9aa0b8'; g.textAlign = 'center'; g.fillText('Nothing inside.', w / 2, h / 2); }
    } else {
      g.fillStyle = '#9aa0b8'; g.font = '13px system-ui'; g.textAlign = 'center';
      g.fillText('No survey yet — travel there to map it.', w / 2, h / 2);
    }
  }
  atlasCanvas.addEventListener('click', (e) => {
    const r = atlasCanvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = atlasHot.find(h => x >= h.x && y >= h.y && x <= h.x + h.w && y <= h.y + h.h);
    if (hit) { atlasSel = hit.node; AU.sfx('select'); atlasTree(); atlasDraw(); }
  });
  $('#atlas-close').onclick = () => atlasOpen(false);

  async function travelTo(node) {
    if (G.busy) return;
    const chain = [];
    let cur = node, hops = 0;
    let spawnAt = null;
    const rec0 = W.parentOf.get(node.id);
    if (rec0 && rec0.embedded) { spawnAt = node.id; cur = rec0.parent; }   // districts live inside their parent's map
    while (cur && cur.id !== G.rootNode.id && hops++ < 24) {
      chain.unshift(cur);
      const rec = W.parentOf.get(cur.id);
      if (!rec) break;
      if (rec.via) G.via.set(cur.id, { node: rec.via, kind: 'District' });
      cur = rec.parent;
    }
    if (!cur || cur.id !== G.rootNode.id) { toast('No route there yet — walk part of the way.'); return; }
    const target = chain.length ? chain[chain.length - 1] : G.rootNode;
    const rec = W.parentOf.get(target.id) || {};
    G.stack = [G.rootNode, ...chain];
    const ok = await goTo(target, rec.parentLevel != null ? rec.parentLevel : 0, { root: !chain.length, fromChild: spawnAt || undefined });
    if (ok) toast(`Travelled to ${W.disp(node)}`, true);
  }

  let showMini = true;
  function drawMini(m, b) {
    if (!showMini || G.mode !== 'play' || !m.mini) return;
    const dpr = G.dpr, fx = b.x / TS, fy = b.y / TS, fw = b.w / TS, fh = b.h / TS;
    const k = Math.max(1, Math.floor(Math.min(130 * dpr / fw, 100 * dpr / fh)));
    const w = fw * k, h = fh * k;
    const x = canvas.width - w - 12 * dpr, y = canvas.height - h - 12 * dpr - (document.body.classList.contains('touch') ? 150 * dpr : 0);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#0b0c11'; ctx.fillRect(x - 3 * dpr, y - 3 * dpr, w + 6 * dpr, h + 6 * dpr);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(m.mini, fx, fy, fw, fh, x, y, w, h);
    ctx.fillStyle = '#ffffff';
    const p = G.player, d = Math.max(3 * dpr, k + 2 * dpr);
    ctx.fillRect(x + (p.x - fx) * k - dpr, y + (p.y - fy) * k - dpr, d, d);
    ctx.globalAlpha = 1;
  }

  let lastPrompt = '';
  function updatePrompt() {
    const el = $('#prompt');
    let txt = '';
    if (G.mode === 'play' && !dlgOpen && panel.hidden && !G.player.moving && !G.busy) {
      const n = nearTarget();
      const d = n && describe(n.t);
      if (d) txt = `${d[0]}|${d[1]}`;
    }
    if (txt !== lastPrompt) {
      lastPrompt = txt;
      if (!txt) el.hidden = true;
      else { const [a, b] = txt.split('|'); $('#prompt-verb').textContent = a; $('#prompt-obj').textContent = b; el.hidden = false; }
    }
  }

  function loop() {
    update(); draw(); updatePrompt();
    if (AU.juke.gain && (G.t & 7) === 0) AU.updateJuke(G.player.x, G.player.y);
    if (dlgOpen && dlgShown < dlgFull.length) { dlgShown += 2; $('#dlg-text').textContent = dlgFull.slice(0, dlgShown); if (dlgShown % 6 === 0) AU.sfx('text', dlgShown); }
    requestAnimationFrame(loop);
  }

  // ── input ─────────────────────────────────────────────
  addEventListener('keydown', (e) => {
    if (G.mode !== 'play') return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
    if (k === 'e' || k === 'E' || k === ' ' || k === 'Enter') { if (!e.repeat) interact(); return; }
    if (k === 'Escape') {
      if (!readerEl.hidden) closeReader();
      else if (!viewerEl.hidden) closeViewer();
      else if (!shelfEl.hidden) shelfEl.hidden = true;
      else if (dlgOpen) closeDialog();
      else if (!atlasEl.hidden) atlasOpen(false);
      else if (!packEl.hidden) togglePack(false);
      else if (!panel.hidden) closePanel();
      else if (!questsEl.hidden) toggleQuests(false);
      else if (!$('#help').hidden) $('#help').hidden = true;
      return;
    }
    if (!readerEl.hidden) { if (k === 'ArrowRight') turnPage(1); if (k === 'ArrowLeft') turnPage(-1); return; }
    if (k === 'Backspace' || k === 'q' || k === 'Q') { if (!dlgOpen && panel.hidden) goUp(); return; }
    if (k === 'm' || k === 'M') { atlasOpen(); return; }
    if (k === 'n' || k === 'N') { showMini = !showMini; return; }
    if (k === 'j' || k === 'J') { toggleQuests(); return; }
    if (k === 'b' || k === 'B') { togglePack(); return; }
    if (k === 'p' || k === 'P') { toggleQuests(true, 'people'); return; }
    if (k === '?' || k === 'h' || k === 'H') { $('#help').hidden = !$('#help').hidden; return; }
    G.keys.add(k);
  });
  addEventListener('keyup', (e) => G.keys.delete(e.key));
  addEventListener('blur', () => G.keys.clear());

  function worldTile(e) {
    const r = canvas.getBoundingClientRect();
    const wx = ((e.clientX - r.left) * G.dpr) / G.scale + G.cam.x, wy = ((e.clientY - r.top) * G.dpr) / G.scale + G.cam.y;
    return [Math.floor(wx / TS), Math.floor(wy / TS)];
  }
  function hitAt(tx, ty) {
    const m = G.map;
    // tall sprites (buildings, racks, framed art) should hit on their footprint
    const hit = m.objs.find(o => (o.item || o.node || o.guard || o.vault) && tx >= o.x && tx < o.x + (o.w || 1) && ty <= o.y && ty >= o.y - (o.node || o.vault ? 6 : 1));
    if (hit) { if (hit.doorAt) return [hit.doorAt.x, hit.doorAt.y]; if (hit.vault) return [hit.x + 2, hit.y]; return [hit.x, hit.y]; }
    return [tx, ty];
  }
  canvas.addEventListener('mousemove', (e) => {
    if (G.mode !== 'play' || !G.map) return;
    const [tx, ty] = hitAt(...worldTile(e));
    canvas.style.cursor = targetAt(tx, ty) ? 'pointer' : 'crosshair';
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (G.mode !== 'play' || G.busy) return;
    if (dlgOpen) { advanceDialog(); return; }
    if (!panel.hidden) { closePanel(); return; }
    const [tx, ty] = hitAt(...worldTile(e));
    const p = G.player, t = targetAt(tx, ty);
    if (t && (t.type === 'enter' || t.type === 'exit' || t.type === 'stairs')) {
      if (p.x === tx && p.y === ty) return act(t);
      const path = bfs(tx, ty, false); if (path) { p.path = path; p.then = null; }
      return;
    }
    if (t) {
      if (Math.abs(p.x - tx) + Math.abs(p.y - ty) === 1) { p.dir = dirTo(tx, ty); return act(t); }
      const path = bfs(tx, ty, true);
      if (path) {
        const last = path.length ? path[path.length - 1] : [p.x, p.y];
        const face = tx > last[0] ? 'right' : tx < last[0] ? 'left' : ty > last[1] ? 'down' : 'up';
        p.path = path; p.then = { target: t, face };
      }
      return;
    }
    if (passable(tx, ty)) { const path = bfs(tx, ty, false); if (path) { p.path = path; p.then = null; } }
  });

  document.querySelectorAll('[data-key]').forEach(b => {
    const k = b.dataset.key;
    const on = (e) => { e.preventDefault(); G.keys.add(k); b.classList.add('on'); };
    const off = (e) => { e.preventDefault(); G.keys.delete(k); b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  });
  $('#btn-a').addEventListener('pointerdown', (e) => { e.preventDefault(); interact(); });
  $('#btn-b').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!readerEl.hidden) closeReader();
    else if (!viewerEl.hidden) closeViewer();
    else if (!shelfEl.hidden) shelfEl.hidden = true;
    else if (dlgOpen) closeDialog();
    else if (!packEl.hidden) togglePack(false);
    else if (!panel.hidden) closePanel();
    else if (!questsEl.hidden) toggleQuests(false);
    else goUp();
  });
  $('#dlg').addEventListener('pointerdown', (e) => { e.preventDefault(); advanceDialog(); });
  $('#btn-help').onclick = () => { $('#help').hidden = !$('#help').hidden; };
  const soundBtn = $('#btn-sound');
  function paintSound() { soundBtn.textContent = AU.on ? '♪' : '♪̸'; soundBtn.classList.toggle('off', !AU.on); soundBtn.title = AU.on ? 'Sound on' : 'Sound off'; }
  soundBtn.onclick = () => { AU.init(); AU.setOn(!AU.on); paintSound(); if (AU.on && G.map) AU.setPlace(G.area.node.id + ':on', G.zone ? G.zone.reading : G.area, G.map.kind === 'indoor'); };
  paintSound();
  $('#np-stop').onclick = () => { AU.stopJuke(); updateHud(); if (lastInspected && !panel.hidden) renderActions(lastInspected); };
  const wake = () => { AU.init(); AU.resume(); if (G.map && AU.on) AU.setPlace(G.area.node.id, G.zone ? G.zone.reading : G.area, G.map.kind === 'indoor'); };
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, wake, { once: true, passive: true }));
  $('#btn-quests').onclick = () => toggleQuests();
  $('#btn-atlas').onclick = () => atlasOpen();
  $('#q-close').onclick = () => toggleQuests(false);

  $('#help-close').onclick = () => { $('#help').hidden = true; };
  $('#btn-up').onclick = () => goUp();
  $('#btn-title').onclick = () => showTitle();
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

  // ── title / sources ─────────────────────────────────────
  function resetWorld() {
    W.listCache.clear(); W.fileInfo.clear(); W.areaCache.clear(); W.visited.clear(); W.inspected.clear();
    W.parentOf.clear(); W.childrenOf.clear();
    G.mapCache.clear(); G.stack = []; G.via.clear(); G.started = false; G.starter = null; Q.reset(); K.reset(); A.reset(); P.reset(); AU.stopJuke(); renderQuests(); renderPack();
  }
  async function startWith(fs, label) {
    closeDialog(); closePanel();
    if (G.fs !== fs) { resetWorld(); G.fs = fs; }
    $('#title').hidden = true;
    G.mode = 'play';
    $('#hud').hidden = false;
    $('#source-name').textContent = label;
    if (!G.started) {
      G.started = true;
      G.rootNode = fs.root(); G.stack = [G.rootNode];
      if (!G.starter) {
        loadEl.hidden = false; progress(`Surveying ${G.rootNode.name}…`);
        let rootArea = null;
        try { rootArea = await W.survey(fs, G.rootNode, 0, progress); } catch (e) { /* handled below */ }
        loadEl.hidden = true;
        G.starter = rootArea ? W.pickStart(rootArea) : null;
      }
      // You wake up somewhere small: a modest building in a quiet quarter.
      const start = G.starter;
      if (start) {
        G.stack.push(start.node);
        if (start.via) G.via.set(start.node.id, { node: start.via, kind: 'District' });
        const ok = await goTo(start.node, start.parentLevel);
        if (!ok) { G.stack = [G.rootNode]; await goTo(G.rootNode, 0, { root: true }); }
      } else await goTo(G.rootNode, 0, { root: true });
    } else { updateHud(); banner(W.disp(G.area.node), TH.LEVELS[G.area.level], readingLine(G.area, G.area), G.map.pal.accent); }
    canvas.focus();
  }
  function showTitle() { G.mode = 'title'; $('#title').hidden = false; $('#hud').hidden = true; $('#banner').hidden = true; closeDialog(); closePanel(); }

  const demo = FS.Demo();
  $('#btn-demo').onclick = () => startWith(demo, 'Sample home folder');
  const dirInput = $('#dir-input');
  $('#btn-open').onclick = async () => {
    if (window.showDirectoryPicker) {
      try { const h = await window.showDirectoryPicker({ mode: 'read' }); return startWith(FS.Handle(h), h.name); }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    dirInput.click();
  };
  dirInput.addEventListener('change', () => {
    if (!dirInput.files || !dirInput.files.length) return;
    const fs = FS.Input(dirInput.files);
    startWith(fs, fs.label);
    dirInput.value = '';
  });

  resize();
  requestAnimationFrame(loop);
  (async () => {
    const server = await FS.detectServer();
    if (server) {
      const fs = FS.Server(server);
      $('#btn-server').hidden = false;
      $('#btn-server-name').textContent = server.name;
      $('#btn-server').onclick = () => startWith(fs, server.name + ' (local)');
      $('#btn-demo').classList.remove('primary');
    }
    G.fs = demo;
    G.rootNode = demo.root(); G.stack = [G.rootNode];
    try { G.starter = W.pickStart(await W.survey(demo, G.rootNode, 0, progress)); } catch (e) { G.starter = null; }
    await goTo(G.rootNode, 0, { root: true });
    const auto = new URLSearchParams(location.search).get('start');
    if (auto === 'demo') startWith(demo, 'Sample home folder');
  })();
})();
