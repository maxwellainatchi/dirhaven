// ───────────────────────── lexicon.js ─────────────────────────
// Everything here is static data. No models, no network: the same
// input always produces the same tone and the same tags.

const LEX = {};

// ── 1. Sentiment lexicon (AFINN-style, scores -5..+5) ──────────────
// Grouped by score to keep it compact. Lookups also try simple stems.
LEX.SENTIMENT_RAW = {
  5: 'breathtaking outstanding superb thrilled ecstatic euphoric magnificent masterpiece triumphant',
  4: 'amazing awesome brilliant delighted excellent fantastic fabulous marvelous wonderful joyful love loved loving beloved blissful stunning perfect overjoyed celebrate celebration congratulations congrats hooray yay treasure',
  3: 'beautiful great happy glad excited exciting enjoy enjoyed fun funny lovely gorgeous win winner won success successful proud best adore awesome cheerful charming sweet thank thanks grateful gratitude kind generous hope hopeful inspire inspired inspiring laugh laughing smile smiling vacation holiday party birthday wedding victory hero heroic brave peace peaceful paradise favorite favourite',
  2: 'good nice cool like liked pleasant calm comfortable cozy cosy fresh free friendly friend friends helpful interesting improve improved improvement growth gain gains progress productive creative clever safe secure solved fixed resolved relax relaxing relaxed warm bright sunny together welcome ready recommend recommended support supported healthy strong clean easy yes promotion bonus reward rewards gift gifts fortune lucky bless blessed',
  1: 'ok okay fine fair decent sure agree agreed accept accepted allow allowed stable steady useful valid works working done complete completed approve approved patch update updated plan plans new',
  '-1': 'no not wait waiting delay delayed unclear confused confusing doubt doubts deprecated legacy todo fixme hack workaround slow tired boring bored meh messy mess busy late overdue pending missing old',
  '-2': 'bad sad sorry worry worried worrying problem problems issue issues bug bugs error errors fail failed failing failure broken wrong difficult hard stress stressed stressful lonely alone tough loss lost lose losing debt debts expense expensive cost costs pain painful sick ill hurt hurts angry annoyed annoying upset reject rejected rejection warning warn risk risky weak ugly cold rain rainy dark gloomy crash crashed deadline complaint penalty fee fees overdue unpaid',
  '-3': 'terrible awful horrible hate hated hating miserable depressed depressing crisis disaster panic afraid scared fear fearful cry crying tears grief grieving mourn funeral cruel nasty toxic furious rage fired layoff layoffs bankrupt broke scam fraud stolen theft corrupt corrupted danger dangerous emergency',
  '-4': 'catastrophe catastrophic devastated devastating tragic tragedy nightmare horrific hopeless worthless despair agony',
  '-5': 'apocalypse hellish unbearable'
};

LEX.NEGATORS = new Set(['not', 'no', 'never', 'none', 'nobody', 'nothing', 'neither', 'nor', 'without', 'hardly', 'barely', 'cannot', 'cant', 'dont', 'doesnt', 'isnt', 'wasnt', 'wont', 'aint']);
LEX.BOOSTERS = { very: 1.5, really: 1.4, extremely: 1.8, super: 1.5, so: 1.3, totally: 1.5, absolutely: 1.6, incredibly: 1.7, most: 1.3, quite: 1.2, slightly: 0.6, somewhat: 0.7, kinda: 0.7, barely: 0.5 };

LEX.SENTIMENT = new Map();
for (const [score, words] of Object.entries(LEX.SENTIMENT_RAW))
  for (const w of words.split(/\s+/)) if (w) LEX.SENTIMENT.set(w, Number(score));

// ── 2. Tag dictionary ─────────────────────────────────────────────
// Each line: "words sharing tags" -> "tag,tag". A word may appear in
// several lines; its tag sets are merged.
LEX.TAGS = ['technology', 'work', 'nature', 'art', 'music', 'finance', 'travel', 'food', 'home', 'games', 'science', 'education', 'health', 'social', 'archive', 'media', 'security'];

LEX.TAG_LINES = [
  ['computer laptop desktop pc mac server servers cloud network wifi router cpu gpu ram chip hardware software firmware device devices kernel linux unix windows macos ubuntu debian docker kubernetes container containers cluster vm virtual terminal shell bash zsh', 'technology'],
  ['code src source lib libs library dist build bin app apps api apis sdk cli framework module modules package packages node npm yarn pnpm pip cargo git github gitlab repo repos commit branch merge deploy deployment pipeline ci cd devops backend frontend fullstack web website webapp html css javascript typescript python rust golang java kotlin swift ruby php sql database db schema query json yaml xml config configs dotfiles plugin plugins extension extensions component components test tests spec specs debug compile compiler runtime algorithm data dataset', 'technology'],
  ['computer laptop email emails inbox calendar slack zoom teams jira confluence notion trello asana', 'technology,work'],
  ['work job jobs office career resume cv cover interview interviews client clients customer customers project projects meeting meetings agenda minutes memo memos report reports proposal proposals contract contracts deadline deadlines task tasks todo todos roadmap sprint strategy business company corp corporate employee employees team manager management hr onboarding okr kpi presentation deck slides quarterly review reviews plan planning ops operations admin vendor vendors', 'work'],
  ['nature forest forests tree trees wood woods leaf leaves flower flowers garden gardens plant plants mountain mountains river rivers lake lakes ocean sea beach island islands sky sun sunset sunrise rain snow weather wild wildlife animal animals bird birds dog dogs cat cats pet pets hike hiking trail trails camp camping park parks outdoor outdoors green spring summer autumn fall winter moss fern stone rocks earth', 'nature'],
  ['art artwork artworks artist artists paint painting paintings draw drawing drawings sketch sketches illustration illustrations design designs designer poster posters canvas gallery galleries museum sculpture craft crafts color colors colour palette brush ink comic comics anime manga figma photoshop illustrator procreate blender render renders logo logos icon icons font fonts typography mockup mockups ui ux wallpaper wallpapers', 'art'],
  ['music song songs album albums track tracks playlist playlists band bands concert concerts guitar piano drum drums bass synth beat beats melody lyrics lyric chord chords audio sound sounds podcast podcasts mix mixes remix dj vinyl spotify record recordings sheet sheets orchestra choir jazz rock pop hiphop rap classical ableton logic garageband mp3 wav', 'music'],
  ['finance money bank banking budget budgets tax taxes irs invoice invoices receipt receipts payment payments payroll salary expense expenses income revenue profit loss account accounts accounting ledger statement statements balance investment investments invest stock stocks crypto bitcoin wallet loan loans mortgage rent rental lease insurance bill bills billing price prices pricing cost costs quote quotes dues fund funds treasury audit reconciliation cash credit debit fiscal', 'finance'],
  ['rent rental lease mortgage house housing apartment', 'finance,home'],
  ['travel trip trips flight flights airport airline hotel hotels hostel booking bookings itinerary passport visa vacation holiday holidays tour tours tourism map maps city cities country countries europe asia africa america australia japan paris london tokyo sydney nyc road roadtrip train trains station journey luggage beach cruise camping destination', 'travel'],
  ['food recipe recipes cook cooking cookbook kitchen meal meals dinner lunch breakfast brunch bake baking bread cake cakes cookie cookies pizza pasta sushi coffee tea wine beer cocktail cocktails restaurant restaurants menu menus grocery groceries diet snack snacks dessert soup salad vegan vegetarian bbq grill chef', 'food'],
  ['home house household family families kids children baby parent parents mom dad sister brother wedding moving move furniture decor room rooms bedroom kitchen garage garden chores cleaning laundry repair repairs diy renovation apartment neighbor neighbours neighborhood pet pets personal private journal diary', 'home'],
  ['game games gaming gamer play player players save saves savegame level levels quest quests steam nintendo switch playstation xbox minecraft zelda mario pokemon rpg mmo fps arcade puzzle puzzles chess board boardgame dice cards mod mods speedrun unity godot unreal sprite sprites tileset tilesets', 'games'],
  ['science research experiment experiments lab labs physics chemistry biology math maths mathematics equation equations theory hypothesis analysis analyses statistics stats model models simulation simulations astronomy space planet planets star stars telescope genome dna molecule neuron neural notebook notebooks jupyter matlab latex paper papers thesis dissertation citation citations journal journals arxiv', 'science'],
  ['school schools class classes course courses lesson lessons lecture lectures homework assignment assignments exam exams quiz quizzes study studies student students teacher teachers university college campus syllabus notes textbook textbooks tutorial tutorials learn learning education book books reading library thesis essay essays grade grades semester', 'education'],
  ['health fitness workout workouts gym run running yoga meditation sleep doctor doctors dentist clinic hospital medical medicine pharmacy prescription wellness nutrition steps heart weight exercise training therapy vaccine', 'health'],
  ['social friend friends family chat chats message messages contact contacts people party parties invite invites invitation event events community club clubs group groups forum twitter instagram facebook tiktok reddit discord whatsapp telegram newsletter blog blogs post posts letter letters email wedding birthday fraternity sorority chapter alumni members member', 'social'],
  ['archive archives archived old older backup backups bak history historical legacy vintage retro deprecated obsolete snapshot snapshots dump dumps export exports import imports old_files misc temp tmp cache caches trash recycle attic storage stored cold', 'archive'],
  ['photo photos photograph photography picture pictures pic pics image images img imgs camera cameras screenshot screenshots video videos movie movies film films clip clips footage stream streaming youtube vlog tv show shows episode episodes media gif gifs selfie selfies thumbnail thumbnails raw dcim', 'media'],
  ['security secure secret secrets private password passwords passwd key keys keychain ssh gpg pgp cert certs certificate certificates token tokens auth credential credentials vault encrypted encryption crypt login admin root sudo firewall vpn shadow permission permissions confidential restricted classified', 'security'],
];

LEX.TAG_WORDS = new Map();
for (const [words, tags] of LEX.TAG_LINES) {
  const ts = tags.split(',');
  for (const w of words.split(/\s+/)) {
    if (!w) continue;
    const cur = LEX.TAG_WORDS.get(w) || new Set();
    ts.forEach(t => cur.add(t));
    LEX.TAG_WORDS.set(w, cur);
  }
}

// ── 3. File extensions → item kind + tags ────────────────────────
// kind decides which interactable object represents the file.
LEX.EXT = {};
const extGroup = (exts, kind, tags) => exts.split(' ').forEach(e => LEX.EXT[e] = { kind, tags: tags ? tags.split(',') : [] });
extGroup('png jpg jpeg gif webp bmp tif tiff heic avif ico', 'artwork', 'media,art');
extGroup('svg psd ai xcf kra procreate sketch fig', 'easel', 'art');
extGroup('mp3 wav flac ogg m4a aac aiff mid midi', 'jukebox', 'music');
extGroup('mp4 mov mkv avi webm m4v wmv', 'tv', 'media');
extGroup('js mjs cjs ts tsx jsx py rb go rs java kt swift c h cpp hpp cc cs php lua sh bash zsh fish ps1 bat pl r scala dart vue svelte elm ex exs clj hs ml zig nim', 'terminal', 'technology');
extGroup('html htm css scss sass less', 'terminal', 'technology,art');
extGroup('json yaml yml toml ini cfg conf env xml lock plist properties editorconfig gitignore dockerfile makefile', 'console', 'technology');
extGroup('exe dll so dylib bin o a class jar wasm app msi deb rpm apk dmg iso img', 'server', 'technology');
extGroup('sqlite db sql parquet mdb', 'server', 'technology,science');
extGroup('zip tar gz tgz bz2 xz 7z rar zst', 'chest', 'archive');
extGroup('md markdown txt rst log nfo org adoc', 'desk', '');
extGroup('doc docx odt rtf pages', 'desk', 'work');
extGroup('pdf epub mobi djvu', 'lectern', 'education');
extGroup('xls xlsx xlsm ods csv tsv numbers', 'ledger', 'finance,work');
extGroup('ppt pptx key odp', 'easel', 'work');
extGroup('ttf otf woff woff2', 'sign', 'art');
extGroup('obj fbx stl gltf glb blend 3ds dae usdz', 'statue', 'art,games');
extGroup('ipynb', 'terminal', 'science,technology');
extGroup('pem key crt cer p12 pfx gpg asc kdbx', 'safe', 'security');
extGroup('ics vcf eml msg mbox', 'mailbox', 'social');
extGroup('sav save rom nes sfc gba nds', 'arcade', 'games');
extGroup('ttx gcode', 'server', 'technology');

LEX.TEXT_EXT = new Set('jsx tsx vue svelte scss sass less styl graphql gql proto rst tex bib srt vtt ini gradle cmake properties lock diff patch csv tsv ndjson jsonl yml yaml m mm kt kts scala clj cljs erl ex exs hs elm nim zig d f90 pas asm s awk sed tcl vb cs fs ml lisp scm rkt jl groovy dart sh bash zsh fish ps1 bat cmd make mk cfg conf toml env dockerfile gitignore editorconfig npmrc babelrc eslintrc prettierrc md markdown txt rst log nfo org adoc csv tsv json yaml yml toml ini cfg conf env xml html htm css scss js mjs cjs ts tsx jsx py rb go rs java kt swift c h cpp hpp cs php lua sh bash zsh ps1 bat pl r sql ics vcf eml svg tex bib gitignore dockerfile makefile'.split(' '));
LEX.DOC_EXT = new Set('pdf docx doc odt rtf pages pptx ppt key xlsx xls ods numbers epub'.split(' '));
LEX.AUDIO_EXT = new Set('mp3 wav ogg m4a aac flac opus oga weba aiff aif wma amr caf au mka m4b ac3 alac'.split(' '));
LEX.IMAGE_EXT = new Set('png jpg jpeg gif webp bmp svg avif ico'.split(' '));

// Word lists for guard / townsfolk dialog, keyed by tag (deterministic picks).
LEX.CHATTER = {
  technology: ['The servers hum all night here.', 'Someone left a build running again.', 'Mind the cables on the sidewalk.'],
  work: ['Another meeting that could have been an email.', 'Deadlines keep this district busy.', 'The coffee cart is the real HR department.'],
  nature: ['Listen — you can hear the creek.', 'The trees here are older than the folder dates.', 'Watch your step, the moss is slippery.'],
  art: ['Every wall here wants a frame.', 'The gallery rotates its pieces by modified date.', 'I only paint in hex codes.'],
  music: ['You can hear the jukeboxes from the gate.', 'Track twelve is the good one.', 'This town never stops humming.'],
  finance: ['Every receipt ends up at the bank eventually.', 'The ledgers balance. Mostly.', 'Rent is due on the first, as always.'],
  travel: ['The next train leaves when you do.', 'Half these suitcases were never unpacked.', 'Postcards from everywhere end up here.'],
  food: ['The recipes here are passed down by copy-paste.', 'Smell that? Someone opened the bakery folder.', 'Try the soup file, it is excellent.'],
  home: ['It is quiet on this street.', 'Everybody knows everybody here.', 'Wipe your feet before you go in.'],
  games: ['High score is still unbeaten.', 'The arcade saves your progress. Probably.', 'One more level, then I sleep.'],
  science: ['The lab lights never go off.', 'Our hypothesis: more folders.', 'Careful, that notebook is still running.'],
  education: ['The library closes at midnight.', 'Notes, notes, and more notes.', 'Class is in session somewhere nearby.'],
  health: ['Stretch before exploring the deep folders.', 'The clinic keeps very tidy records.', 'Drink water. Explore responsibly.'],
  social: ['Everyone meets in the square eventually.', 'The mailbox is always full here.', 'Say hi to the neighbours.'],
  archive: ['Nobody has opened some of these in years.', 'Dust settles on the older files.', 'The archive remembers everything.'],
  media: ['Smile, you are on camera.', 'The screening room is showing old clips.', 'So many pictures, so few albums.'],
  security: ['Keep your keys close.', 'Guards change shift at midnight.', 'Some doors here stay shut.'],
  plain: ['Nice day for a walk through the tree.', 'Not much happens here, and we like it.', 'Welcome, traveller.'],
};
