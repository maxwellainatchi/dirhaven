# Dirhaven

Your filesystem as a pixel-art town. Deterministic, no LLMs, no dependencies.

## Run
- **Sample world / any browser:** open `dist/index.html`.
- **Real folder, real permissions:** `node dist/dirhaven-server.mjs ~/some/folder` then open http://127.0.0.1:4777
  (read-only, binds to localhost only; unreadable files/folders become guarded vaults).
- **Folder picker:** "Open a folder on this device…" uses the File System Access API (Chrome/Edge) or a folder upload fallback.

## Build
`node build.mjs` concatenates `src/*.js` into `dist/index.html` (standalone) and `dist/artifact.html`.

## Getting around
`M` opens the atlas: a tree of everywhere discovered plus a map of the selected place (quarters are
cropped out of their town map), click a label to look inside, Travel to go there. `N` toggles the minimap.
Place names are prettified and given a building word; the survey card shows the raw folder name.
Achievements track milestones; `J` lists them with your kit.

## Sound
Every place gets a generative score (scale from its tone, timbre from its top tag, chords seeded
by its path). Jukebox objects play the real audio file through WebAudio, fading with distance and
stopping when you leave the building; with no decodable audio it improvises on the file name.

## Locked quarters & keycards
Districts and big buildings can be walled with a guarded keycard reader. Each map has one pass,
handed over by any local whose errand you complete. You start inside a small building in a quiet
quarter; the first time you step outside, Odile teaches the errand loop and her pass opens the
rest of the town.

## Opening files
The details card shows a generated plain-English description (type + tags + tone, table-driven, no model);
the raw tag/tone analysis is folded into a `<details>`. Contents open on demand: a paged book reader
(text, extracted office documents, real PDF pages), an audio player tied to the building, a picture frame,
a video player. Document-heavy rooms use bookcases — one spine per file, click to open.

## Backpack, kit, people
The backpack holds eight files at once (`B`); tools (axe, jackhammer) are achievement rewards and live in
the kit. The phonebook (`P`) lists everyone you've spoken to, and their names float over them in the world.

## Errands
Residents marked `!` hand out fetch quests drawn from folders you haven't walked into yet
(named file / any object of a kind / something cheerful or grim). Hints narrow it down, the
errand log is `J`. Hints come from residents standing near the target — the closer they live to it,
the more precise they are. Delivering pays out a true fact about that folder, and often a keycard.
PDFs are rendered with pdf.js and their text feeds the tone/tag reading. All deterministic.

## Source map
- `src/util.js` hashing, seeded PRNG, tokenizer, colour math
- `src/lexicon.js` sentiment lexicon, word→tag dictionary, extension→object table
- `src/analysis.js` sentiment scoring (negation/boosters), tag scoring, object choice
- `src/themes.js` per-tag visual styles and mood-shifted palettes
- `src/fs.js` lazy providers: Demo, File System Access, folder input, local server
- `src/world.js` folder survey, scale rules, map generation (outdoor/indoor)
- `src/sprites.js` procedural pixel art
- `src/locks.js` keycards, walled quarters, reachability of errand targets
- `src/audio.js` generative score, sound effects, jukebox playback
- `src/docs.js` zip reader for docx/pptx/xlsx/odt/epub text
- `src/achievements.js` milestones, and the tools they grant
- `src/describe.js` plain-language file descriptions
- `src/people.js` the phonebook
- `src/quests.js` errand generation, hints (asked of locals), matching, rewards
- `src/game.js` loop, input, camera, HUD
