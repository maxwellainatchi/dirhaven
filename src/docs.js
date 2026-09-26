// ───────────────────────── docs.js ─────────────────────────
// Office files are zips full of XML. This is a small zip reader (central
// directory + DecompressionStream) and just enough XML stripping to get the
// words out of .docx, .pptx, .xlsx, .odt and .epub.

const DOCS = {};
DOCS.ZIP_EXT = new Set(['docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'epub', 'dotx', 'potx', 'xlsm']);
DOCS.can = (ext) => DOCS.ZIP_EXT.has(ext) && typeof DecompressionStream !== 'undefined';

function u16(v, o) { return v.getUint16(o, true); }
function u32(v, o) { return v.getUint32(o, true); }

// → Map<name, {offset, size, method}>
function zipIndex(buf) {
  const v = new DataView(buf), n = buf.byteLength;
  let eocd = -1;
  for (let i = n - 22; i >= Math.max(0, n - 66000); i--) if (u32(v, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  let count = u16(v, eocd + 10), off = u32(v, eocd + 16);
  const out = new Map();
  for (let i = 0; i < count && off + 46 <= n; i++) {
    if (u32(v, off) !== 0x02014b50) break;
    const method = u16(v, off + 10), csize = u32(v, off + 20);
    const nameLen = u16(v, off + 28), extraLen = u16(v, off + 30), cmtLen = u16(v, off + 32);
    const local = u32(v, off + 42);
    const name = new TextDecoder().decode(new Uint8Array(buf, off + 46, nameLen));
    out.set(name, { local, csize, method });
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}
async function zipRead(buf, entry) {
  const v = new DataView(buf);
  if (u32(v, entry.local) !== 0x04034b50) return null;
  const nameLen = u16(v, entry.local + 26), extraLen = u16(v, entry.local + 28);
  const start = entry.local + 30 + nameLen + extraLen;
  const slice = buf.slice(start, start + entry.csize);
  if (entry.method === 0) return new TextDecoder().decode(new Uint8Array(slice));
  if (entry.method !== 8) return null;
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([slice]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}
const strip = (xml, breakOn) => xml
  .replace(new RegExp(breakOn, 'g'), '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, ' ')
  .replace(/\n\s*\n+/g, '\n')
  .trim();

DOCS.extract = async function (buf, ext) {
  if (!buf || !DOCS.can(ext)) return null;
  const idx = zipIndex(buf);
  if (!idx) return null;
  const pick = (re, limit = 12) => [...idx.keys()].filter(k => re.test(k)).sort().slice(0, limit);
  let files = [], breakOn = '</w:p>';
  if (ext === 'docx' || ext === 'dotx') files = ['word/document.xml'];
  else if (ext === 'pptx' || ext === 'potx') { files = pick(/^ppt\/slides\/slide\d+\.xml$/); breakOn = '</a:p>'; }
  else if (ext === 'xlsx' || ext === 'xlsm') { files = ['xl/sharedStrings.xml', ...pick(/^xl\/worksheets\/sheet1\.xml$/, 1)]; breakOn = '</si>'; }
  else if (ext === 'odt' || ext === 'odp' || ext === 'ods') { files = ['content.xml']; breakOn = '</text:p>'; }
  else if (ext === 'epub') { files = pick(/\.x?html?$/i, 6); breakOn = '</p>'; }
  let text = '';
  for (const f of files) {
    const e = idx.get(f);
    if (!e) continue;
    const raw = await zipRead(buf, e).catch(() => null);
    if (raw) text += strip(raw, breakOn) + '\n';
    if (text.length > 40000) break;
  }
  return text.trim() || null;
};

DOCS.label = (ext) => ({ docx: 'Word document', dotx: 'Word template', pptx: 'Slide deck', potx: 'Slide template', xlsx: 'Spreadsheet', xlsm: 'Spreadsheet', odt: 'Text document', odp: 'Presentation', ods: 'Spreadsheet', epub: 'E-book' }[ext] || 'Document');
