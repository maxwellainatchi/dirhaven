// ───────────────────────── fs.js ─────────────────────────
// Filesystem providers. All share one lazy interface:
//   root()            → node
//   list(node)        → Promise<node[]>   (throws {restricted:true} if unreadable)
//   readText(node, n) → Promise<string|null>  (first n bytes, null for binary)
//   imageURL(node)    → Promise<string|null>
// A node is { id, name, kind:'dir'|'file'|'group', size, mtime, restricted }.
// Nothing is read until the player walks somewhere that needs it.

const FS = {};

const byName = (a, b) => {
  if (a.kind !== b.kind) return a.kind === 'file' ? 1 : -1;
  const x = a.name.toLowerCase(), y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
};
FS.sortNodes = (arr) => arr.sort(byName);
FS.RESTRICTED = { restricted: true };
const looksBinary = (s) => /\u0000/.test(s.slice(0, 2048));

// ─────────────── Demo provider: a deterministic sample home folder ───────────────
FS.Demo = function () {
  const R = U.rng('dirhaven-demo');
  const TAG_LINES = {
    technology: ['Deployed the server update and checked the database logs.', 'Refactored the API module and bumped the package versions.', 'The docker container restarts cleanly now.', 'Kernel update applied to the cluster.'],
    work: ['Met with the client to review the project roadmap.', 'Action items: finish the quarterly report and send the proposal.', 'The team agreed on the sprint plan in the meeting.', 'Manager wants the deck before Friday.'],
    finance: ['Reconciled the bank statement against the ledger.', 'Budget line for repairs is over by a little.', 'Rent payments posted for all rooms this month.', 'Filed the invoice and saved the receipt.'],
    food: ['Knead the bread dough for ten minutes and let it rest.', 'Simmer the soup with garlic, tomato and basil.', 'Dinner party menu: pasta, salad and a chocolate cake.', 'Coffee first, then breakfast.'],
    travel: ['Flight lands in Sydney at 6am; hotel check-in at noon.', 'Train to the coast, then a ferry to the island.', 'Passport, charger, sunscreen, luggage tags.', 'Itinerary: beach, museum, harbour walk.'],
    home: ['Fix the kitchen tap and repaint the bedroom.', 'Family dinner on Sunday at mom and dad\'s house.', 'Garden needs weeding before the party.', 'Laundry, groceries, call the landlord.'],
    music: ['New playlist for the drive: jazz, synth and a little rock.', 'Recorded the guitar track; the bass needs another pass.', 'Concert tickets saved in the album folder.'],
    games: ['Beat level eight with a new high score.', 'Save file backed up before the boss quest.', 'Speedrun route notes for the arcade stage.'],
    science: ['Experiment three confirms the hypothesis within error bars.', 'Simulation ran overnight; plotting the statistics now.', 'Reading two papers on neural models.'],
    education: ['Lecture notes: chapter four, homework due Tuesday.', 'Study group meets at the library after class.', 'Exam review covers essays one through three.'],
    security: ['Rotate the keys and update the password vault.', 'Firewall rules restricted to the admin subnet.'],
    archive: ['Old backup from years ago, kept just in case.', 'Legacy notes, mostly obsolete now.'],
    art: ['Sketched the harbour at sunset; the colour palette is warm.', 'Painting study in ink and gouache.', 'Poster design draft three with new typography.'],
    social: ['Invited friends to the party on Saturday.', 'Newsletter for the club members goes out Monday.', 'Chat with the group about the reunion.'],
    health: ['Morning run, then yoga and a long stretch.', 'Workout plan: three gym days and one rest day.'],
    media: ['Photo shoot at the park; best shots in the raw folder.', 'Edited the video clip down to two minutes.'],
  };
  const TONE = {
    pos: ['This went really well and everyone was happy.', 'Great progress — proud of how it turned out.', 'What a lovely day, I enjoyed every minute.', 'Excited about what comes next!', 'Everything is fixed and working. Success!', 'Thanks to everyone for the wonderful support.', 'Best week in a long time, feeling grateful.', 'Beautiful weather and a perfect plan.'],
    neg: ['Another delay; the problem keeps coming back.', 'Feeling tired and stressed about the deadline.', 'The build failed again with the same error.', 'Sad news today. It was a tough, lonely week.', 'We lost the file and the backup was broken.', 'Worried the costs are getting too expensive.', 'Terrible night, nothing works and I hate this bug.', 'Missed the payment and the fees are piling up.'],
    neu: ['Notes for later.', 'See the list below.', 'Updated the numbers on Tuesday.', 'Draft version, subject to change.', 'Moved these from the other folder.', 'Checked on the third.'],
  };

  // Tree helpers --------------------------------------------------------------
  let idc = 0;
  const D = (name, children, o = {}) => ({ name, kind: 'dir', children: children || [], ...o });
  const F = (name, o = {}) => ({ name, kind: 'file', ...o });
  const many = (prefix, ext, n, o = {}) => Array.from({ length: n }, (_, i) => F(`${prefix}${String(i + 1).padStart(n > 99 ? 3 : 2, '0')}.${ext}`, o));

  const pkgNames = 'react react-dom lodash express chalk commander debug ms semver uuid axios moment dayjs zod yup esbuild rollup vite webpack babel-core typescript eslint prettier jest mocha chai sinon ws socket-io redis pg mysql2 sqlite3 dotenv cors helmet morgan body-parser cookie-parser jsonwebtoken bcrypt passport multer sharp jimp canvas three pixi phaser howler tone gsap anime d3 chart-js leaflet mapbox-gl marked highlight-js katex mathjs date-fns rxjs immer zustand redux mobx vue svelte solid-js preact lit alpinejs htmx tailwindcss postcss autoprefixer sass less stylus nodemon concurrently cross-env rimraf glob minimatch fast-glob chokidar execa inquirer ora boxen yargs meow got node-fetch undici cheerio puppeteer playwright jsdom supertest nock faker msw'.split(' ');
  const nodeModules = D('node_modules', pkgNames.map(p => D(p, [F('package.json'), F('index.js'), F('README.md', { tag: 'technology' }), F('LICENSE')])));

  const jEntries = [
    ['2026-01-04.md', 'neg'], ['2026-01-19.md', 'neg'], ['2026-02-02.md', 'neu'], ['2026-02-14.md', 'pos'], ['2026-03-08.md', 'pos'],
    ['2026-04-21.md', 'pos'], ['2026-05-30.md', 'neg'], ['2026-06-12.md', 'pos'], ['2026-07-04.md', 'pos'], ['2026-08-12.md', 'pos'],
  ].map(([n, t]) => F(n, { tone: t, tag: 'home' }));

  const tree = D('home', [
    D('Documents', [
      D('Work', [
        F('Q3_report.md', { tone: 'pos', tag: 'work' }), F('project_roadmap.md', { tone: 'neu', tag: 'work' }),
        F('meeting_notes_sept.md', { tone: 'neu', tag: 'work' }), F('postmortem_outage.md', { tone: 'neg', tag: 'technology' }),
        F('budget_2027.xlsx'), F('client_proposal.docx'), F('team_offsite.pptx'),
        F('payroll_confidential.xlsx', { restricted: true }),
        D('Contracts', [F('vendor_agreement.pdf'), F('nda_signed.pdf'), F('lease_renewal.pdf')]),
        D('Presentations', [F('kickoff_deck.pptx'), F('quarterly_review.key'), F('speaker_notes.md', { tone: 'pos', tag: 'work' })]),
      ]),
      D('Finances', [
        F('budget.xlsx'), F('rent_roll.csv', { tag: 'finance', tone: 'neu' }), F('reconciliation_notes.md', { tone: 'neg', tag: 'finance' }),
        D('Bank Statements', many('statement_2026_', 'pdf', 9)),
        D('Receipts', many('receipt_', 'jpg', 24)),
        D('Taxes', [F('tax_return_2025.pdf'), F('w2.pdf'), F('deductions.md', { tone: 'neu', tag: 'finance' }), F('irs_letter.pdf', { restricted: true })]),
      ]),
      D('Journal', jEntries),
      D('School', [D('Courses', [D('Fall 2025', ['CS101', 'MATH201', 'HIST110', 'ART150', 'BIO120', 'ECON101'].map(c => D(c, [F('syllabus.pdf'), F('notes_week1.md', { tag: 'education', tone: 'neu' }), F('assignment_1.docx'), F('slides.pptx'), F('diagram.png')])))]), D('Notes', many('lecture_', 'md', 12, { tag: 'education', tone: 'neu' })), F('thesis_draft.docx'), F('essay_final.pdf'), F('syllabus.pdf')]),
      F('Resume.docx'), F('cover_letter.docx'), F('todo.txt', { tone: 'neg', tag: 'work' }),
    ]),
    D('Pictures', [
      D('Vacation 2025', [D('Sydney', many('IMG_', 'jpg', 18)), D('Cairns', many('DSC_', 'jpg', 10)), D('Auckland', many('IMG_A', 'jpg', 8)), F('trip_itinerary.md', { tone: 'pos', tag: 'travel' })]),
      D('Screenshots', many('Screenshot ', 'png', 16)),
      D('Artwork', [...many('sketch_', 'png', 8), F('poster_final.psd'), F('logo.svg'), F('palette.ase'), F('portrait_study.kra')]),
      F('profile.jpg'), F('wallpaper.png'),
    ]),
    D('Music', [
      D('Albums', [D('Night Drive', many('track_', 'mp3', 11)), D('Harbour Sessions', many('take_', 'wav', 7))]),
      D('Playlists', [F('road_trip.m3u'), F('focus.m3u'), F('party.m3u')]),
      F('guitar_chords.md', { tone: 'pos', tag: 'music' }),
    ]),
    D('Projects', [
      D('dirhaven', [
        D('src', [F('main.js'), F('world.js'), F('render.js'), F('sprites.js'), F('input.js'), F('analysis.js'), F('fs.js'), F('util.js')]),
        D('assets', [D('sprites', many('tile_', 'png', 14)), D('sfx', many('blip_', 'wav', 6)), F('font.ttf')]),
        nodeModules,
        F('README.md', { tone: 'pos', tag: 'technology' }), F('package.json'), F('package-lock.json'), F('.gitignore'), F('CHANGELOG.md', { tone: 'neu', tag: 'technology' }),
      ]),
      D('homelab', [D('server-images', [F('nas.img'), F('router_fw.bin'), F('pihole.iso'), F('backup_node.img'), F('media_server.bin'), F('k3s.bin')]), D('dashboards', [F('grafana.json'), F('uptime.png'), F('network_map.png'), F('rack_photo.jpg')]), F('docker-compose.yml'), F('Caddyfile'), F('backup.sh'), F('network_notes.md', { tone: 'neg', tag: 'technology' }), D('configs', [F('pihole.toml'), F('wireguard.conf', { restricted: true }), F('grafana.ini')])]),
      D('data-notebooks', [F('analysis.ipynb'), F('results.csv'), F('experiment_log.md', { tone: 'pos', tag: 'science' }), F('model.pkl')]),
      D('website', [D('posts', ['hello-world', 'moving-to-nyc', 'why-i-self-host', 'burnout-notes', 'best-coffee'].map((n, i) => F(n + '.md', { tone: i === 3 ? 'neg' : 'pos', tag: 'social' }))), D('images', many('hero_', 'jpg', 6)), F('index.html'), F('style.css'), F('deploy.sh')]),
      D('game-jam-2025', [D('levels', many('level_', 'json', 6)), D('sprites', many('hero_walk_', 'png', 8)), D('music', many('theme_', 'ogg', 3)), F('build.exe'), F('postmortem.md', { tone: 'pos', tag: 'games' })]),
      D('ml-experiments', [F('train.py'), F('eval.py'), F('dataset.parquet'), F('weights.bin'), F('notes.md', { tone: 'neg', tag: 'science' }), D('runs', many('run_', 'log', 9, { tag: 'science', tone: 'neg' }))]),
      D('scripts', [F('backup.sh'), F('rename_photos.py'), F('sync.sh'), F('cleanup.sh')]),
      D('recipe-app', [D('src', [F('App.tsx'), F('api.ts'), F('db.sql')]), F('README.md', { tone: 'pos', tag: 'food' }), F('package.json')]),
    ]),
    D('Recipes', ['sourdough_bread', 'tomato_basil_soup', 'chocolate_cake', 'pad_thai', 'pancakes', 'lemon_pasta', 'chili', 'banana_bread', 'coffee_notes'].map(n => F(n + '.md', { tone: 'pos', tag: 'food' }))),
    D('Games', [D('saves', many('slot', 'sav', 5)), D('roms', [F('adventure.nes'), F('puzzle.gba')]), F('high_scores.txt', { tone: 'pos', tag: 'games' })]),
    D('Downloads', [F('installer.dmg'), F('photos_backup.zip'), F('manual.pdf'), F('invoice_8841.pdf'), F('unknown_file'), F('song.mp3'), F('trailer.mp4'), F('font_pack.zip'), F('map_sydney.pdf'), F('setup.exe'), F('notes.txt', { tone: 'neu', tag: 'home' })]),
    D('Archive', [
      D('Old Photos 2015', many('scan_', 'jpg', 12)),
      D('Backups', [F('laptop_2019.tar.gz'), F('phone_2021.zip'), F('email_export.mbox')]),
      F('farewell_letter.txt', { tone: 'neg', tag: 'social' }), F('old_blog_posts.md', { tone: 'neg', tag: 'archive' }),
    ]),
    D('.ssh', [F('id_ed25519'), F('id_ed25519.pub'), F('known_hosts'), F('config')], { restricted: true }),
    D('Private', [F('secret.txt')], { restricted: true }),
    D('System Logs', [F('kernel.log', { tone: 'neg', tag: 'technology' }), F('auth.log', { restricted: true }), F('crash_report.txt', { tone: 'neg', tag: 'technology' }), F('shadow', { restricted: true })]),
    F('notes.md', { tone: 'pos', tag: 'home' }), F('.bashrc'), F('.zshrc'),
  ]);

  // Assign ids, sizes, mtimes deterministically.
  const base = Date.UTC(2026, 8, 1);
  (function walk(n, path) {
    n.id = path;
    const r = U.rng(path);
    n.mtime = base - r.int(0, 900) * 86400000 - r.int(0, 86400) * 1000;
    if (n.kind === 'file') {
      const e = U.ext(n.name);
      const big = { mp4: 8e8, mov: 8e8, dmg: 5e8, zip: 2e8, gz: 3e8, wav: 4e7, mp3: 8e6, jpg: 4e6, png: 2e6, psd: 9e7, kra: 3e7, pdf: 2e6, exe: 6e7, mbox: 5e8 }[e] || 4e4;
      n.size = Math.round(big * (0.1 + r() * 0.9));
    } else n.children.forEach(c => walk(c, path + '/' + c.name));
  })(tree, 'home');

  const genText = (n) => {
    const r = U.rng('text:' + n.id);
    const info = AN.nameInfo(n.name, 'file');
    const tag = n.tag || (AN.topTags(info.scores, 1)[0] || { tag: 'home' }).tag;
    const tone = n.tone || (info.sent.compound > 0.1 ? 'pos' : info.sent.compound < -0.1 ? 'neg' : 'neu');
    const e = U.ext(n.name);
    if (e === 'json') return JSON.stringify({ name: n.name.replace(/\W/g, ''), version: '1.' + r.int(0, 9) + '.' + r.int(0, 20), main: 'index.js', license: 'MIT' }, null, 2);
    if (e === 'csv') return 'room,tenant,rent,paid\n' + Array.from({ length: 8 }, (_, i) => `${i + 1},Tenant ${String.fromCharCode(65 + i)},${800 + r.int(0, 6) * 50},${r.chance(0.8) ? 'yes' : 'no'}`).join('\n');
    if (['js', 'sh', 'yml', 'toml', 'ini', 'conf', 'bashrc', 'zshrc'].includes(e) || n.name.startsWith('.')) {
      return `# ${n.name}\n# generated demo file\nexport PATH="$HOME/bin:$PATH"\nalias ll='ls -la'\n// TODO: tidy this up\nfunction main() { return build(config); }\n`;
    }
    const lines = [`# ${n.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ')}`, ''];
    const pool = TAG_LINES[tag] || TAG_LINES.home;
    const count = r.int(4, 8);
    for (let i = 0; i < count; i++) {
      const roll = r();
      if (roll < 0.45) lines.push(r.pick(pool));
      else if (roll < 0.85) lines.push(r.pick(TONE[tone]));
      else lines.push(r.pick(TONE.neu));
    }
    return lines.join('\n');
  };

  const paintCache = new Map();
  const paint = (n) => { // seeded abstract pixel painting as a data URL
    if (paintCache.has(n.id)) return paintCache.get(n.id);
    const r = U.rng('paint:' + n.id), W = 48, H = 36;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const hue = r(), sky = U.rgbToHex(...U.hslToRgb(hue, 0.55, 0.7)), land = U.rgbToHex(...U.hslToRgb((hue + 0.3) % 1, 0.45, 0.4));
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, sky); grd.addColorStop(1, U.adj(sky, 0.05, 0, 0.12));
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = U.adj(sky, 0.5, 0.3, 0.15); g.beginPath(); g.arc(r.int(8, 40), r.int(5, 14), r.int(3, 6), 0, 7); g.fill();
    for (let k = 0; k < 3; k++) {
      g.fillStyle = U.adj(land, k * 0.03, 0, -k * 0.08);
      g.beginPath(); g.moveTo(0, H);
      let y = H * (0.45 + k * 0.15) + r.int(-4, 4);
      for (let x = 0; x <= W; x += 4) { y += r.int(-3, 3); g.lineTo(x, y); }
      g.lineTo(W, H); g.fill();
    }
    const url = c.toDataURL();
    paintCache.set(n.id, url);
    return url;
  };

  const strip = (n) => ({ id: n.id, name: n.name, kind: n.kind, size: n.size, mtime: n.mtime, restricted: !!n.restricted, _d: n });
  return {
    label: 'Demo home folder',
    root: () => strip(tree),
    async list(node) {
      const d = node._d;
      if (d.restricted) throw FS.RESTRICTED;
      await U.sleep(60 + (U.hash(d.id) % 90)); // simulate disk latency so lazy loading is visible
      return FS.sortNodes(d.children.map(strip));
    },
    async readText(node) {
      if (node._d.restricted) throw FS.RESTRICTED;
      const e = U.ext(node.name);
      if (!LEX.TEXT_EXT.has(e) && !LEX.DOC_EXT.has(e) && e !== '') return null;
      return genText(node._d);
    },
    async bytes() { return null; },              // the sample world has no real bytes
    async fileURL(node) { return this.imageURL(node); },
    async imageURL(node) {
      if (node._d.restricted) return null;
      return LEX.IMAGE_EXT.has(U.ext(node.name)) ? paint(node._d) : null;
    },
  };
};

// ─────────────── File System Access API (Chromium desktop) ───────────────
FS.Handle = function (rootHandle) {
  const urls = new Map();
  const mk = (h, path, extra = {}) => ({ id: path, name: h.name, kind: h.kind === 'directory' ? 'dir' : 'file', _h: h, restricted: false, ...extra });
  return {
    label: rootHandle.name,
    root: () => mk(rootHandle, rootHandle.name),
    async list(node) {
      const out = [];
      try {
        for await (const h of node._h.values()) {
          const child = mk(h, node.id + '/' + h.name);
          if (h.kind === 'file') {
            try { const f = await h.getFile(); child.size = f.size; child.mtime = f.lastModified; }
            catch (e) { child.restricted = true; }
          }
          out.push(child);
        }
      } catch (e) { throw FS.RESTRICTED; }
      return FS.sortNodes(out);
    },
    async readText(node, max = 16384) {
      const f = await node._h.getFile().catch(() => { throw FS.RESTRICTED; });
      const t = await f.slice(0, max).text();
      return looksBinary(t) ? null : t;
    },
    async imageURL(node) { return LEX.IMAGE_EXT.has(U.ext(node.name)) ? this.fileURL(node) : null; },
    async fileURL(node) {
      if (urls.has(node.id)) return urls.get(node.id);
      try { const f = await node._h.getFile(); if (f.size > 60e6) return null; const u = URL.createObjectURL(f); urls.set(node.id, u); return u; } catch (e) { return null; }
    },
    async bytes(node, max = 12e6) {
      try { const f = await node._h.getFile(); return await f.slice(0, max).arrayBuffer(); } catch (e) { return null; }
    },
  };
};

// ─────────────── <input webkitdirectory> fallback (Firefox/Safari, iframes) ───────────────
// The browser hands over a flat file list; we fold it into a tree once
// (names only) and still read contents lazily.
FS.Input = function (fileList) {
  const files = Array.from(fileList);
  const rootName = (files[0] && files[0].webkitRelativePath.split('/')[0]) || 'folder';
  const root = { id: rootName, name: rootName, kind: 'dir', kids: new Map() };
  for (const f of files) {
    const parts = f.webkitRelativePath.split('/');
    let cur = root;
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i], path = cur.id + '/' + p;
      if (i === parts.length - 1) cur.kids.set(p, { id: path, name: p, kind: 'file', size: f.size, mtime: f.lastModified, _f: f });
      else { if (!cur.kids.has(p)) cur.kids.set(p, { id: path, name: p, kind: 'dir', kids: new Map() }); cur = cur.kids.get(p); }
    }
  }
  const urls = new Map();
  const strip = (n) => ({ id: n.id, name: n.name, kind: n.kind, size: n.size, mtime: n.mtime, restricted: false, _n: n });
  return {
    label: rootName,
    root: () => strip(root),
    async list(node) { return FS.sortNodes([...node._n.kids.values()].map(strip)); },
    async readText(node, max = 16384) { const t = await node._n._f.slice(0, max).text(); return looksBinary(t) ? null : t; },
    async imageURL(node) { return LEX.IMAGE_EXT.has(U.ext(node.name)) ? this.fileURL(node) : null; },
    async fileURL(node) {
      if (node.size > 60e6) return null;
      if (!urls.has(node.id)) urls.set(node.id, URL.createObjectURL(node._n._f));
      return urls.get(node.id);
    },
    async bytes(node, max = 12e6) { try { return await node._n._f.slice(0, max).arrayBuffer(); } catch (e) { return null; } },
  };
};

// ─────────────── Local companion server (dirhaven-server.mjs) ───────────────
// Gives real permission bits, so unreadable files become guarded vaults.
FS.Server = function (info) {
  const q = (p) => encodeURIComponent(p);
  return {
    label: info.name,
    root: () => ({ id: info.name, name: info.name, kind: 'dir', rel: '', restricted: false }),
    async list(node) {
      const r = await fetch('/api/list?path=' + q(node.rel));
      if (r.status === 403) throw FS.RESTRICTED;
      if (!r.ok) throw new Error('list failed');
      const j = await r.json();
      return FS.sortNodes(j.entries.map(e => ({ id: node.id + '/' + e.name, rel: (node.rel ? node.rel + '/' : '') + e.name, name: e.name, kind: e.kind, size: e.size, mtime: e.mtime, restricted: e.restricted })));
    },
    async readText(node, max = 16384) {
      const r = await fetch('/api/read?path=' + q(node.rel) + '&max=' + max);
      if (r.status === 403) throw FS.RESTRICTED;
      if (r.status === 415 || !r.ok) return null;
      return r.text();
    },
    async imageURL(node) { return LEX.IMAGE_EXT.has(U.ext(node.name)) ? this.fileURL(node) : null; },
    async fileURL(node) { return node.restricted ? null : '/api/raw?path=' + q(node.rel); },
    async bytes(node, max = 12e6) {
      if (node.restricted) return null;
      const r = await fetch('/api/raw?path=' + q(node.rel));
      if (!r.ok) return null;
      const b = await r.arrayBuffer();
      return b.byteLength > max ? b.slice(0, max) : b;
    },
  };
};
FS.detectServer = async function () {
  if (!/^https?:/.test(location.protocol)) return null;
  try {
    const r = await fetch('/api/root', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.dirhaven ? j : null;
  } catch (e) { return null; }
};
