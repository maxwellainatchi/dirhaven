#!/usr/bin/env node
// Dirhaven local server — zero dependencies.
// Usage: node dirhaven-server.mjs [folder] [port]
// Serves index.html (next to this script) and a read-only, lazy JSON API
// over [folder]. Binds to 127.0.0.1 only. Real permission bits are
// reported, so unreadable files/folders show up as guarded vaults.
import http from 'node:http';
import fs from 'node:fs/promises';
import { constants as C, createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] ? process.argv[2].replace(/^~(?=$|\/)/, os.homedir()) : os.homedir());
const PORT = Number(process.argv[3] || process.env.PORT || 4777);
const MAX_READ = 64 * 1024, MAX_RAW = 60 * 1024 * 1024;
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/opus',
  aiff: 'audio/aiff', aif: 'audio/aiff', wma: 'audio/x-ms-wma', amr: 'audio/amr', caf: 'audio/x-caf', au: 'audio/basic', mka: 'audio/x-matroska', m4b: 'audio/mp4', weba: 'audio/webm',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4', mkv: 'video/x-matroska',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12', dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
  odt: 'application/vnd.oasis.opendocument.text', odp: 'application/vnd.oasis.opendocument.presentation', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  epub: 'application/epub+zip', txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8',
};

// Resolve a client path safely inside ROOT (no escaping via .. or symlink tricks in the path string).
function resolve(rel) {
  const p = path.resolve(ROOT, '.' + path.sep + (rel || ''));
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) return null;
  return p;
}
async function canRead(p, dir) {
  try { await fs.access(p, dir ? C.R_OK | C.X_OK : C.R_OK); return true; } catch { return false; }
}
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return send(res, 200, await fs.readFile(path.join(here, 'index.html')), 'text/html; charset=utf-8');
    }
    if (url.pathname === '/api/root') return send(res, 200, { dirhaven: 1, name: path.basename(ROOT) || ROOT });
    const p = resolve(url.searchParams.get('path'));
    if (!p) return send(res, 400, { error: 'bad path' });

    if (url.pathname === '/api/list') {
      if (!(await canRead(p, true))) return send(res, 403, { error: 'restricted' });
      let dirents;
      try { dirents = await fs.readdir(p, { withFileTypes: true }); } catch { return send(res, 403, { error: 'restricted' }); }
      const entries = [];
      for (const d of dirents) {
        const full = path.join(p, d.name);
        let st; try { st = await fs.stat(full); } catch { entries.push({ name: d.name, kind: 'file', restricted: true }); continue; }
        if (!st.isDirectory() && !st.isFile()) continue; // skip sockets, fifos, devices
        const dir = st.isDirectory();
        entries.push({ name: d.name, kind: dir ? 'dir' : 'file', size: dir ? null : st.size, mtime: st.mtimeMs, restricted: !(await canRead(full, dir)) });
      }
      return send(res, 200, { entries });
    }
    if (url.pathname === '/api/read') {
      if (!(await canRead(p, false))) return send(res, 403, { error: 'restricted' });
      const max = Math.min(MAX_READ, Number(url.searchParams.get('max')) || 16384);
      const fh = await fs.open(p, 'r');
      try {
        const buf = Buffer.alloc(max);
        const { bytesRead } = await fh.read(buf, 0, max, 0);
        const chunk = buf.subarray(0, bytesRead);
        if (chunk.subarray(0, 2048).includes(0)) return send(res, 415, { error: 'binary' });
        return send(res, 200, chunk.toString('utf8'), 'text/plain; charset=utf-8');
      } finally { await fh.close(); }
    }
    if (url.pathname === '/api/raw') {
      const ext = path.extname(p).slice(1).toLowerCase();
      if (!MIME[ext]) return send(res, 415, { error: 'unsupported media type' });
      if (!(await canRead(p, false))) return send(res, 403, { error: 'restricted' });
      const st = await fs.stat(p);
      if (st.size > MAX_RAW) return send(res, 413, { error: 'too large' });
      res.writeHead(200, { 'content-type': MIME[ext], 'content-length': st.size, 'cache-control': 'max-age=300', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" });
      return createReadStream(p).pipe(res);
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Dirhaven is surveying ${ROOT}`);
  console.log(`Open http://127.0.0.1:${PORT}/  (Ctrl+C to stop)`);
});
