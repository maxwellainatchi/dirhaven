// ───────────────────────── audio.js ─────────────────────────
// Everything you hear is synthesised from the place you're standing in —
// the scale comes from the tone, the timbre from the tags, the chords from
// a seed made of the folder's path. Jukebox objects play the real file.

const AU = {};
AU.ready = false;
AU.on = true;
AU.ctx = null;

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};
const TIMBRE = {
  technology: 'square', games: 'square', media: 'sawtooth', music: 'triangle', art: 'triangle',
  nature: 'sine', home: 'triangle', health: 'sine', science: 'sine', education: 'triangle',
  finance: 'square', work: 'square', travel: 'triangle', food: 'triangle', social: 'triangle',
  archive: 'sine', security: 'sawtooth', plain: 'triangle',
};
const note = (semi) => 440 * Math.pow(2, (semi - 9) / 12);

try { AU.on = localStorage.getItem('dirhaven.sound') !== 'off'; } catch (e) { /* private mode */ }

AU.init = function () {
  if (AU.ctx) return AU.ctx;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  AU.ctx = new C();
  AU.master = AU.ctx.createGain(); AU.master.gain.value = AU.on ? 0.9 : 0; AU.master.connect(AU.ctx.destination);
  AU.musicBus = AU.ctx.createGain(); AU.musicBus.gain.value = 0.22; AU.musicBus.connect(AU.master);
  AU.sfxBus = AU.ctx.createGain(); AU.sfxBus.gain.value = 0.5; AU.sfxBus.connect(AU.master);
  AU.jukeBus = AU.ctx.createGain(); AU.jukeBus.gain.value = 0.0; AU.jukeBus.connect(AU.master);
  // a little room on everything
  AU.delay = AU.ctx.createDelay(0.5); AU.delay.delayTime.value = 0.22;
  AU.fb = AU.ctx.createGain(); AU.fb.gain.value = 0.22;
  AU.wet = AU.ctx.createGain(); AU.wet.gain.value = 0.18;
  AU.delay.connect(AU.fb); AU.fb.connect(AU.delay); AU.delay.connect(AU.wet); AU.wet.connect(AU.master);
  AU.musicBus.connect(AU.delay);
  AU.ready = true;
  return AU.ctx;
};
AU.resume = function () { if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume(); };
AU.setOn = function (on) {
  AU.on = on;
  try { localStorage.setItem('dirhaven.sound', on ? 'on' : 'off'); } catch (e) {}
  if (AU.master) AU.master.gain.setTargetAtTime(on ? 0.9 : 0, AU.ctx.currentTime, 0.05);
  if (on) AU.resume();
};

// ── one-shot voices ─────────────────────────────────────────────────────
function blip(freq, dur, type, vol, when, bus, slideTo) {
  if (!AU.ready || !AU.on) return;
  const t = when || AU.ctx.currentTime;
  const o = AU.ctx.createOscillator(), g = AU.ctx.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus || AU.sfxBus);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, filterHz) {
  if (!AU.ready || !AU.on) return;
  const t = AU.ctx.currentTime, n = Math.floor(AU.ctx.sampleRate * dur);
  const buf = AU.ctx.createBuffer(1, n, AU.ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = AU.ctx.createBufferSource(); src.buffer = buf;
  const f = AU.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterHz || 1200;
  const g = AU.ctx.createGain(); g.gain.value = vol || 0.15;
  src.connect(f); f.connect(g); g.connect(AU.sfxBus);
  src.start(t);
}

AU.sfx = function (name, arg) {
  if (!AU.ready || !AU.on) return;
  const t = AU.ctx.currentTime;
  switch (name) {
    case 'step': noise(0.05, 0.05, 700); break;
    case 'bump': blip(90, 0.08, 'square', 0.12); break;
    case 'select': blip(660, 0.07, 'square', 0.14); break;
    case 'open': blip(440, 0.12, 'triangle', 0.16, t, null, 880); break;
    case 'close': blip(660, 0.1, 'triangle', 0.12, t, null, 330); break;
    case 'door': noise(0.18, 0.1, 500); blip(160, 0.2, 'sine', 0.1, t, null, 110); break;
    case 'stairs': [440, 523, 659].forEach((f, i) => blip(f, 0.09, 'triangle', 0.1, t + i * 0.05)); break;
    case 'deny': blip(150, 0.18, 'sawtooth', 0.16, t, null, 90); break;
    case 'pickup': blip(523, 0.08, 'square', 0.14, t); blip(784, 0.12, 'square', 0.12, t + 0.07); break;
    case 'drop': blip(392, 0.08, 'square', 0.1, t); blip(262, 0.12, 'square', 0.1, t + 0.07); break;
    case 'quest': [523, 659, 784].forEach((f, i) => blip(f, 0.16, 'triangle', 0.14, t + i * 0.09)); break;
    case 'done': [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.22, 'triangle', 0.16, t + i * 0.1)); break;
    case 'unlock': [784, 1047, 1319].forEach((f, i) => blip(f, 0.5, 'sine', 0.13, t + i * 0.06)); noise(0.1, 0.08, 2500); break;
    case 'text': blip(520 + ((arg || 0) % 7) * 24, 0.03, 'square', 0.05); break;
    case 'hint': blip(880, 0.08, 'sine', 0.12, t); blip(1175, 0.1, 'sine', 0.1, t + 0.06); break;
    case 'chop': noise(0.12, 0.18, 900); blip(220, 0.1, 'square', 0.1, t, null, 140); break;
    case 'timber': noise(0.5, 0.16, 500); blip(120, 0.5, 'sine', 0.1, t, null, 60); break;
    case 'trophy': [659, 784, 988, 1319].forEach((f, i) => blip(f, 0.3, 'triangle', 0.15, t + i * 0.11)); break;
  }
};

// ── generative score ────────────────────────────────────────────────────
AU.music = { timer: null, key: null, voices: [] };
AU.setPlace = function (seed, reading, indoor) {
  if (!AU.ready) { AU.pending = [seed, reading, indoor]; return; }
  if (AU.music.key === seed) return;
  AU.music.key = seed;
  AU.stopMusic();
  const rng = U.rng('music:' + seed);
  const mood = reading.mood || 0;
  const scale = SCALES[mood > 0.35 ? 'lydian' : mood > 0.1 ? 'major' : mood > -0.15 ? 'dorian' : mood > -0.5 ? 'minor' : 'phrygian'];
  const root = -12 + rng.int(0, 4) + (indoor ? 0 : -2);
  const type = TIMBRE[reading.primary] || 'triangle';
  const bpm = (indoor ? 64 : 76) + Math.round(mood * 10) + rng.int(-4, 6);
  const beat = 60 / bpm;
  const prog = [0, rng.pick([3, 4, 5]), rng.pick([5, 6, 3]), rng.pick([4, 2, 1])];
  const dense = indoor ? 0.35 : 0.5;
  let step = 0, next = AU.ctx.currentTime + 0.1;
  AU.music.stop = false;
  const tick = () => {
    if (AU.music.stop || !AU.ready) return;
    const now = AU.ctx.currentTime;
    while (next < now + 0.4) {
      const bar = Math.floor(step / 8) % prog.length, deg = prog[bar];
      const chordRoot = root + scale[deg % 7] + 12 * Math.floor(deg / 7);
      if (step % 8 === 0) { // pad
        [0, 2, 4].forEach((i, k) => {
          const f = note(chordRoot + scale[(deg + i) % 7] + (k === 2 ? 12 : 0));
          const o = AU.ctx.createOscillator(), g = AU.ctx.createGain();
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, next);
          g.gain.exponentialRampToValueAtTime(0.07, next + 0.4);
          g.gain.exponentialRampToValueAtTime(0.0001, next + beat * 7.5);
          o.connect(g); g.connect(AU.musicBus); o.start(next); o.stop(next + beat * 8);
        });
      }
      if (step % 4 === 0) blip(note(chordRoot - 12), beat * 1.6, 'sine', 0.12, next, AU.musicBus);  // bass
      if (rng() < dense) {                                                                          // melody
        const s = scale[rng.int(0, 6)] + (rng() < 0.3 ? 12 : 0);
        blip(note(root + 12 + s), beat * (rng() < 0.2 ? 1.2 : 0.55), type, 0.075, next, AU.musicBus);
      }
      next += beat / 2; step++;
    }
    AU.music.timer = setTimeout(tick, 120);
  };
  tick();
};
AU.stopMusic = function () {
  AU.music.stop = true;
  if (AU.music.timer) clearTimeout(AU.music.timer);
  AU.music.timer = null;
};
AU.duck = function (on) { if (AU.ready) AU.musicBus.gain.setTargetAtTime(on ? 0.02 : 0.22, AU.ctx.currentTime, 0.2); };

// ── jukebox: play the actual file (or a tune made from its name) ────────
AU.juke = { node: null, el: null, src: null, gain: null, synth: null, tile: null };
AU.stopJuke = function () {
  const j = AU.juke;
  if (j.el) { j.el.pause(); j.el.src = ''; }
  if (j.synth) { j.synth.stop = true; if (j.synth.timer) clearTimeout(j.synth.timer); }
  AU.juke = { node: null, el: null, src: null, gain: null, synth: null, tile: null };
  AU.duck(false);
};
AU.playFile = async function (node, url, tile) {
  AU.init(); AU.resume();
  AU.stopJuke();
  AU.duck(true);
  const gain = AU.ctx.createGain(); gain.gain.value = 0.8; gain.connect(AU.jukeBus);
  AU.jukeBus.gain.setTargetAtTime(0.9, AU.ctx.currentTime, 0.1);
  AU.juke.gain = gain; AU.juke.node = node; AU.juke.tile = tile;
  if (url) {
    const el = new Audio();
    el.crossOrigin = 'anonymous'; el.src = url; el.loop = true;
    try {
      const src = AU.ctx.createMediaElementSource(el);
      src.connect(gain);
      AU.juke.el = el; AU.juke.src = src;
      await el.play();
      return 'file';
    } catch (e) { try { el.pause(); } catch (e2) {} }
  }
  // No playable audio (or the browser refused): improvise a tune from the name.
  AU.juke.synth = synthTrack(node, gain);
  return 'synth';
};
function synthTrack(node, out) {
  const rng = U.rng('track:' + node.id);
  const scale = SCALES[rng() < 0.55 ? 'major' : 'dorian'];
  const root = -10 + rng.int(0, 5);
  const beat = 60 / (86 + rng.int(0, 30));
  const pat = Array.from({ length: 16 }, () => (rng() < 0.75 ? scale[rng.int(0, 6)] : null));
  const bassPat = [0, 4, 2, 5];
  const state = { stop: false, timer: null };
  let step = 0, next = AU.ctx.currentTime + 0.05;
  const tick = () => {
    if (state.stop || !AU.ready) return;
    while (next < AU.ctx.currentTime + 0.35) {
      const s = pat[step % 16];
      if (s != null) blip(note(root + 12 + s), beat * 0.45, 'square', 0.16, next, out);
      if (step % 4 === 0) blip(note(root - 12 + scale[bassPat[(step / 4) % 4]]), beat * 0.9, 'triangle', 0.18, next, out);
      if (step % 8 === 4) noise(0.06, 0.1, 3000);
      next += beat / 2; step++;
    }
    state.timer = setTimeout(tick, 120);
  };
  tick();
  return state;
}
// Fade the jukebox with distance so it belongs to the room it's in.
AU.updateJuke = function (px, py) {
  const j = AU.juke;
  if (!j.gain || !j.tile) return;
  const d = Math.hypot(px - j.tile.x, py - j.tile.y);
  const v = U.clamp(1.15 - d / 22, 0.12, 1);
  j.gain.gain.setTargetAtTime(v * 0.8, AU.ctx.currentTime, 0.15);
};
