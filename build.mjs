// Concatenate sources into one self-contained page (artifact fragment + standalone file).
import fs from 'node:fs';
const order = ['util', 'lexicon', 'analysis', 'themes', 'locks', 'describe', 'people', 'quests', 'achievements', 'audio', 'docs', 'fs', 'world', 'sprites', 'game'];
const js = order.map(n => fs.readFileSync(`src/${n}.js`, 'utf8')).join('\n');
const tpl = fs.readFileSync('src/index.html', 'utf8');
const frag = tpl.replace('/*__SCRIPTS__*/', () => js);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/artifact.html', frag);
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${frag.replace(/<div id="stage">/, '</head>\n<body>\n<div id="stage">')}\n</body>\n</html>\n`;
fs.writeFileSync('dist/index.html', full);
console.log('built', (frag.length / 1024).toFixed(1) + ' KB');
