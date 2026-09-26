// ───────────────────────── describe.js ─────────────────────────
// A plain-language line about a file, built from its type, its tags and its
// tone. No model involved — just tables and a seeded choice of phrasing.

const DESC = {};

const EXT_NOUN = {
  png: 'an image', jpg: 'a photograph', jpeg: 'a photograph', gif: 'an animated image', webp: 'an image', heic: 'a photograph', bmp: 'an image', tif: 'a scan', tiff: 'a scan', svg: 'a vector drawing', ico: 'an icon',
  psd: 'a layered design file', ai: 'a vector artwork file', xcf: 'a layered image', kra: 'a painting file', fig: 'a design file', sketch: 'a design file',
  mp3: 'a music track', wav: 'an audio recording', flac: 'a lossless audio track', m4a: 'an audio track', aac: 'an audio track', ogg: 'an audio track', opus: 'an audio track', aiff: 'an audio recording', mid: 'a MIDI sequence',
  mp4: 'a video', mov: 'a video', mkv: 'a video', webm: 'a video', avi: 'a video',
  pdf: 'a PDF document', doc: 'a Word document', docx: 'a Word document', odt: 'a text document', rtf: 'a rich-text document', pages: 'a Pages document', epub: 'an e-book', md: 'a markdown note', txt: 'a plain-text note', rst: 'a text document', log: 'a log file',
  xls: 'a spreadsheet', xlsx: 'a spreadsheet', xlsm: 'a spreadsheet', ods: 'a spreadsheet', csv: 'a table of rows', tsv: 'a table of rows', numbers: 'a spreadsheet',
  ppt: 'a slide deck', pptx: 'a slide deck', key: 'a keynote deck', odp: 'a slide deck',
  zip: 'a zip archive', tar: 'an archive', gz: 'a compressed archive', tgz: 'a compressed archive', rar: 'an archive', '7z': 'an archive', xz: 'a compressed archive', bz2: 'a compressed archive',
  exe: 'a Windows program', dmg: 'a Mac disk image', app: 'an application', deb: 'a package', rpm: 'a package', apk: 'an Android package', iso: 'a disc image', bin: 'a binary blob', img: 'a disk image', dll: 'a library', so: 'a shared library', wasm: 'a WebAssembly module',
  sqlite: 'a database', db: 'a database', sql: 'a database script', parquet: 'a columnar dataset', pkl: 'a pickled dataset',
  js: 'a JavaScript file', mjs: 'a JavaScript module', ts: 'a TypeScript file', tsx: 'a React component', jsx: 'a React component', py: 'a Python script', rb: 'a Ruby script', go: 'a Go source file', rs: 'a Rust source file', java: 'a Java source file', c: 'a C source file', h: 'a C header', cpp: 'a C++ source file', cs: 'a C# source file', php: 'a PHP file', swift: 'a Swift source file', kt: 'a Kotlin source file', sh: 'a shell script', ps1: 'a PowerShell script', ipynb: 'a notebook',
  html: 'a web page', css: 'a stylesheet', json: 'a JSON file', yaml: 'a config file', yml: 'a config file', toml: 'a config file', xml: 'an XML file', ini: 'a config file', conf: 'a config file', env: 'an environment file',
  ttf: 'a typeface', otf: 'a typeface', woff: 'a web font', woff2: 'a web font',
  obj: 'a 3D model', fbx: 'a 3D model', stl: 'a 3D model', glb: 'a 3D model', blend: 'a Blender scene',
  pem: 'a key file', crt: 'a certificate', cer: 'a certificate', gpg: 'an encrypted file', kdbx: 'a password vault',
  ics: 'a calendar file', vcf: 'a contact card', eml: 'an email', mbox: 'a mailbox archive',
  sav: 'a saved game', nes: 'a game cartridge image', gba: 'a game cartridge image',
};
const KIND_NOUN = {
  artwork: 'a picture', easel: 'a design file', jukebox: 'an audio track', tv: 'a video', terminal: 'a source file', console: 'a config file',
  server: 'a binary', chest: 'an archive', desk: 'a written file', lectern: 'a document', ledger: 'a table of numbers', sign: 'a typeface',
  statue: 'a model file', safe: 'a key file', mailbox: 'a message', arcade: 'a game file', pedestal: 'a file',
};
const TAG_PHRASE = {
  technology: 'technical work', work: 'work matters', nature: 'the outdoors', art: 'art and design', music: 'music', finance: 'money matters',
  travel: 'travel', food: 'food and cooking', home: 'home life', games: 'games', science: 'research', education: 'study', health: 'health and fitness',
  social: 'people and correspondence', archive: 'old business', media: 'photos and film', security: 'keys and secrets', plain: 'nothing in particular',
};
const TONE_PHRASE = {
  grim: ['reads grimly', 'is heavy going'], gloomy: ['has a gloomy streak', 'reads rather downbeat'], wistful: ['reads a little wistfully', 'is quietly downbeat'],
  neutral: ['reads matter-of-factly', 'keeps an even tone'], pleasant: ['reads pleasantly', 'is in good spirits'], cheerful: ['reads cheerfully', 'is in a good mood'], radiant: ['positively glows', 'reads radiantly'],
};

DESC.noun = function (node, info) {
  const e = U.ext(node.name);
  return EXT_NOUN[e] || KIND_NOUN[(info || W.info(node)).kind] || 'a file';
};

// One or two sentences: what it is, what it's about, how it reads, how big.
DESC.of = function (node, info) {
  info = info || W.info(node);
  const rng = U.rng('desc:' + node.id);
  const noun = DESC.noun(node, info);
  const tags = AN.topTags(info.scores, 2).map(t => TAG_PHRASE[t.tag] || t.tag);
  const read = !!(info.content && info.content.sent.hits);
  const tone = AN.toneLabel(info.tone);
  const parts = [];

  let first = noun.charAt(0).toUpperCase() + noun.slice(1);
  if (tags.length === 1) first += ` about ${tags[0]}`;
  else if (tags.length > 1) first += rng() < 0.5 ? ` about ${tags[0]}, with a bit of ${tags[1]}` : ` sitting between ${tags[0]} and ${tags[1]}`;
  parts.push(first + '.');

  if (read) {
    const opts = TONE_PHRASE[tone] || TONE_PHRASE.neutral;
    const words = info.content.sent;
    const lift = words.pos[0], drag = words.neg[0];
    let second = `It ${opts[Math.floor(rng() * opts.length)]}`;
    if (tone !== 'neutral' && (lift || drag)) second += ` — the words that tip it are ${[lift, drag].filter(Boolean).slice(0, 2).join(' and ')}`;
    parts.push(second + '.');
  } else if (info.restricted) {
    parts.push('Nobody here can read it, so the tone is anyone\'s guess.');
  } else if (LEX.IMAGE_EXT.has(U.ext(node.name)) || LEX.AUDIO_EXT.has(U.ext(node.name))) {
    parts.push('Nothing to read in it — the name is all we have to go on.');
  } else {
    parts.push('Not opened yet, so its tone is read from the name alone.');
  }

  const bits = [];
  if (node.size != null) bits.push(U.fmtSize(node.size));
  if (node.mtime) bits.push(`last touched ${U.fmtDate(node.mtime)}`);
  if (bits.length) parts.push(bits.join(', ') + '.');
  return parts.join(' ');
};

// A line for the shelf popup and the backpack.
DESC.line = function (node, info) {
  info = info || W.info(node);
  const t = AN.topTags(info.scores, 1)[0];
  return `${DESC.noun(node, info)}${t ? ' · ' + (TAG_PHRASE[t.tag] || t.tag) : ''}`;
};
