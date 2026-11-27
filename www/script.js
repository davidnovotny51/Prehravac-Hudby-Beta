(() => {
'use strict';
const $ = id => document.getElementById(id);
addEventListener('error', e => { const s = document.getElementById('sub'); if (s) s.textContent = 'Chyba: ' + e.message; }); // zobrazí případnou chybu

/* ===== Stav ===== */
let tracks = [], view = [], cur = -1, shuffle = false, repeat = 0; // repeat: 0 vypnuto, 1 vše, 2 jedna
const audio = new Audio();
const touch = matchMedia('(hover: none)').matches;   // telefon nebo tablet
/* Android aplikace: služba na popředí drží přehrávání při vypnuté obrazovce */
const PS = (() => {
  const C = window.Capacitor;
  if (!C || !(C.isNativePlatform && C.isNativePlatform())) return null;
  try { return (C.Plugins && C.Plugins.PlayerService) || (typeof C.registerPlugin === 'function' ? C.registerPlugin('PlayerService') : null); }
  catch (e) { return null; }
})();
const psCall = (m, o) => { try { return Promise.resolve(PS[m](o)); } catch (e) { return Promise.reject(e); } };
let psOn = false, stopT = 0;
let actx, analyser, data;
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

/* ===== Nastavení (localStorage) ===== */
const defaults = {op:55, bl:12, accent:'#1ed760', style:'circle', fx:'on', perf:'balanced'};
let cfg = {...defaults};
try { cfg = {...defaults, ...JSON.parse(localStorage.getItem('player-cfg') || '{}')}; } catch (e) {}
const save = () => { try { localStorage.setItem('player-cfg', JSON.stringify(cfg)); } catch (e) { alert('Obrázek je příliš velký pro uložení, zkuste menší.'); } };
const palette = {'Spotify zelená':'#1ed760','Neonově fialová':'#b44bff','Modrá':'#3b9cff','Růžová':'#ff4fa3','Oranžová':'#ff8a2b'};

function applyCfg() {
  const r = document.documentElement.style;
  r.setProperty('--accent', cfg.accent);
  r.setProperty('--bg-op', cfg.op / 100);
  const bg = $('bg').style;
  bg.filter = `blur(${cfg.bl}px)`; bg.transform = cfg.bl ? 'scale(1.1)' : '';
  $('op').value = cfg.op; $('bl').value = cfg.bl; $('vizStyle').value = cfg.style; $('fxMode').value = cfg.fx;
  document.documentElement.dataset.perf = cfg.perf; $('perf').value = cfg.perf; idleDrawn = false;
  $('opV').textContent = cfg.op + ' %'; $('blV').textContent = cfg.bl + ' px';
  document.querySelectorAll('.sw').forEach(s => s.classList.toggle('on', s.dataset.c === cfg.accent));
  if (cfg.style === 'off') vctx.clearRect(0, 0, W, H);
  if (cfg.fx === 'off' || cfg.perf === 'eco') fctx.clearRect(0, 0, fx.width, fx.height);
}
Object.entries(palette).forEach(([n, c]) => {
  const b = document.createElement('button');
  b.className = 'sw'; b.style.background = c; b.dataset.c = c; b.title = n; b.setAttribute('aria-label', n);
  b.onclick = () => { cfg.accent = c; applyCfg(); save(); };
  $('colors').appendChild(b);
});
$('op').oninput = e => { cfg.op = +e.target.value; applyCfg(); save(); };
$('bl').oninput = e => { cfg.bl = +e.target.value; applyCfg(); save(); };
$('vizStyle').onchange = e => { cfg.style = e.target.value; applyCfg(); save(); };
$('fxMode').onchange = e => { cfg.fx = e.target.value; applyCfg(); save(); };
$('perf').onchange = e => { cfg.perf = e.target.value; applyCfg(); resize(); save(); };
$('bgPick').onclick = () => $('bgFile').click();

/* ===== Vlastní pozadí (ukládá se do IndexedDB, bez limitu localStorage) ===== */
let bgUrl = '', artUrl = '';
function setBg(blob) {
  if (bgUrl) URL.revokeObjectURL(bgUrl);
  bgUrl = blob ? URL.createObjectURL(blob) : '';
  $('bg').style.backgroundImage = bgUrl ? `url(${bgUrl})` : '';
  updateCover();
}
$('bgClear').onclick = () => { kvDel('bg'); setBg(null); };
$('bgFile').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const u = URL.createObjectURL(f), img = new Image();
  img.onload = () => { // zmenšení, ať zabírá méně místa
    const k = Math.min(1, 1920 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
    c.toBlob(bl => { kvSet('bg', bl); setBg(bl); }, 'image/jpeg', .85);
  };
  img.src = u;
};

/* Obal skladby: z tagu ID3 (MP3), jinak nahraná fotka pozadí, jinak barevný kruh */
function updateCover() {
  const u = artUrl || bgUrl, c = $('cover');
  c.style.backgroundImage = u ? `url(${u})` : ''; c.classList.toggle('img', !!u);
  mediaMeta();
}
async function readCover(file) {
  try {
    const hd = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (String.fromCharCode(hd[0], hd[1], hd[2]) !== 'ID3') return null;
    const ver = hd[3], size = (hd[6] << 21) | (hd[7] << 14) | (hd[8] << 7) | hd[9];
    const buf = new Uint8Array(await file.slice(10, 10 + Math.min(size, 6e6)).arrayBuffer());
    const idL = ver === 2 ? 3 : 4, hL = ver === 2 ? 6 : 10;
    for (let p = 0; p + hL < buf.length;) {
      const id = String.fromCharCode(...buf.subarray(p, p + idL));
      if (!/^[A-Z0-9]+$/.test(id)) break;
      const len = ver === 2 ? (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5]
        : ver === 4 ? (buf[p + 4] << 21) | (buf[p + 5] << 14) | (buf[p + 6] << 7) | buf[p + 7]
        : ((buf[p + 4] << 24) | (buf[p + 5] << 16) | (buf[p + 6] << 8) | buf[p + 7]) >>> 0;
      const st = p + hL, end = st + len;
      if (id === 'APIC' || id === 'PIC') {
        const enc = buf[st]; let q = st + 1;
        if (ver === 2) q += 3; else { while (q < end && buf[q] !== 0) q++; q++; } // MIME
        q++;                                                                      // typ obrázku
        if (enc === 1 || enc === 2) { while (q < end && !(buf[q] === 0 && buf[q + 1] === 0)) q += 2; q += 2; }
        else { while (q < end && buf[q] !== 0) q++; q++; }                        // popis
        return new Blob([buf.slice(q, end)], {type: buf[q] === 0x89 ? 'image/png' : 'image/jpeg'});
      }
      p = end;
    }
  } catch (e) {}
  return null;
}
function mediaMeta() { // ovládání na zamčené obrazovce Androidu
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined' || cur < 0) return;
  const u = artUrl || bgUrl;
  try { navigator.mediaSession.metadata = new MediaMetadata({title: tracks[cur].name, artist: 'Lokální přehrávač', artwork: u ? [{src: u}] : []}); } catch (e) {}
}
$('setBtn').onclick = () => $('modal').classList.add('open');
$('close').onclick = () => $('modal').classList.remove('open');
$('modal').onclick = e => { if (e.target.id === 'modal') $('modal').classList.remove('open'); };

/* ===== Úložiště (IndexedDB): fotka, složka (desktop) nebo kopie souborů (Android) ===== */
const dbp = new Promise((ok, no) => {
  const r = indexedDB.open('player', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('files'); };
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
});
const tx = async (store, mode, fn) => {
  const d = await dbp;
  return new Promise((ok, no) => {
    const t = d.transaction(store, mode), res = fn(t.objectStore(store));
    t.oncomplete = () => ok(res && res.result); t.onerror = t.onabort = () => no(t.error);
  });
};
const kvGet = k => tx('kv', 'readonly', s => s.get(k)).catch(() => undefined);
const kvSet = (k, v) => tx('kv', 'readwrite', s => s.put(v, k)).catch(() => {});
const kvDel = k => tx('kv', 'readwrite', s => s.delete(k)).catch(() => {});
const saveFiles = list => tx('files', 'readwrite', s => { s.clear(); list.forEach((f, i) => s.put(f, i)); }).catch(() => alert('Soubory se nepodařilo uložit (málo místa v prohlížeči).'));

/* ===== Načítání hudby ===== */
function addFiles(files) {
  const a = [...files].filter(f => f.type.startsWith('audio/') || /\.(mp3|m4a|flac|wav|ogg|opus|aac)$/i.test(f.name));
  a.sort((x, y) => x.name.localeCompare(y.name, 'cs', {numeric: true}));
  tracks.forEach(t => URL.revokeObjectURL(t.url));
  tracks = a.map(f => ({name: f.name.replace(/\.[^.]+$/, ''), file: f, url: URL.createObjectURL(f)}));
  cur = -1; renderList(); return a;
}
async function walk(dir, out) {
  for await (const h of dir.values()) {
    if (h.kind === 'file') out.push(await h.getFile()); else await walk(h, out);
  }
}
const openDir = async h => { const out = []; await walk(h, out); addFiles(out); };
let savedDir = null;
$('openBtn').onclick = async e => {
  if (PS || !window.showDirectoryPicker || (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform())) return;    // Android a ostatní: label sám otevře výběr souborů
  e.preventDefault();                               // počítač: výběr složky, zapamatuje se
  try {
    const d = await showDirectoryPicker({mode: 'read'}); await openDir(d);
    await kvSet('dir', d); await saveFiles([]); $('restoreBtn').hidden = true;
  } catch (err) { if (err.name !== 'AbortError') $('files').click(); }
};
$('files').onchange = async e => {
  const a = addFiles(e.target.files);
  $('sub').textContent = a.length ? `Načteno skladeb: ${a.length}` : 'Nebyla vybrána žádná podporovaná hudba';
  await kvDel('dir'); await saveFiles(a);
};
$('restoreBtn').onclick = async () => {
  try { if (await savedDir.requestPermission({mode: 'read'}) === 'granted') { await openDir(savedDir); $('restoreBtn').hidden = true; } } catch (e) {}
};
$('forget').onclick = async () => {
  await kvDel('dir'); await saveFiles([]); addFiles([]); $('restoreBtn').hidden = true; $('sub').textContent = 'Uložená knihovna smazána';
};
async function restore() { // po spuštění obnoví poslední knihovnu a pozadí
  const bg = await kvGet('bg'); if (bg) setBg(bg);
  const d = await kvGet('dir');
  if (d) {
    try { if (await d.queryPermission({mode: 'read'}) === 'granted') { await openDir(d); return; } } catch (e) {}
    savedDir = d; $('restoreBtn').hidden = false; return;
  }
  const f = await tx('files', 'readonly', s => s.getAll()).catch(() => []);
  if (f && f.length) addFiles(f);
}

/* ===== Seznam a hledání ===== */
const fmt = s => isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00';
function renderList() {
  const q = $('search').value.trim().toLowerCase();
  view = tracks.map((t, i) => i).filter(i => tracks[i].name.toLowerCase().includes(q));
  const ul = $('list'); ul.innerHTML = '';
  if (!view.length) {
    ul.innerHTML = `<li class="empty">${tracks.length ? 'Nic nenalezeno.' : 'Zatím žádná hudba. Vyberte složku nebo soubory. Nic se nenahrává, vše běží lokálně.'}</li>`;
    return;
  }
  const frag = document.createDocumentFragment();
  view.forEach(i => {
    const li = document.createElement('li'); li.dataset.i = i; li.textContent = tracks[i].name;
    if (i === cur) li.className = 'on';
    frag.appendChild(li);
  });
  ul.appendChild(frag);
}
$('list').onclick = e => { const li = e.target.closest('li[data-i]'); if (li) load(+li.dataset.i, true); };
$('search').oninput = renderList;

/* ===== Přehrávání ===== */
function initAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = actx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = .8;
  data = new Uint8Array(analyser.frequencyBinCount);
  actx.createMediaElementSource(audio).connect(analyser);
  analyser.connect(actx.destination);
}
function load(i, autoplay) {
  if (i < 0 || i >= tracks.length) return;
  initAudio(); if (actx.state === 'suspended') actx.resume();
  cur = i; audio.src = tracks[i].url;
  $('title').textContent = $('nowT').textContent = document.title = tracks[i].name;
  $('sub').textContent = `Skladba ${i + 1} z ${tracks.length}`;
  document.querySelectorAll('#list li').forEach(li => li.classList.toggle('on', +li.dataset.i === i));
  const on = document.querySelector('#list li.on'); if (on) on.scrollIntoView({block: 'nearest'});
  if (artUrl) { URL.revokeObjectURL(artUrl); artUrl = ''; }
  updateCover();
  readCover(tracks[i].file).then(b => { if (b && cur === i) { artUrl = URL.createObjectURL(b); updateCover(); } });
  if (autoplay) audio.play().catch(() => {});
}
function step(d) {
  if (!tracks.length) return;
  const pool = view.length ? view : tracks.map((t, i) => i);
  if (shuffle) return load(pool[Math.floor(Math.random() * pool.length)], true);
  load(pool[(pool.indexOf(cur) + d + pool.length) % pool.length], true);
}
$('play').onclick = () => {
  if (cur < 0) { if (tracks.length) load(view[0] ?? 0, true); return; }
  initAudio(); actx.resume(); audio.paused ? audio.play() : audio.pause();
};
$('next').onclick = () => step(1);
$('prev').onclick = () => { if (audio.currentTime > 3) audio.currentTime = 0; else step(-1); };
$('shuf').onclick = e => { shuffle = !shuffle; e.currentTarget.classList.toggle('act', shuffle); };
$('rep').onclick = e => { repeat = (repeat + 1) % 3; e.currentTarget.classList.toggle('act', repeat > 0); e.currentTarget.dataset.m = repeat; };
/* Upozornění na Androidu: název skladby, stav a tlačítka (Přehrát/Pauza, Další) */
function psSync() {
  if (!PS) return;
  const o = {title: cur >= 0 ? tracks[cur].name : '', playing: !audio.paused};
  if (!psOn) { if (o.playing) { psOn = true; psCall('start', o).catch(() => { psOn = false; }); } }
  else psCall('update', o).catch(() => {});
}
audio.onplay = () => { $('play').innerHTML = ICON_PAUSE; clearTimeout(stopT); psSync(); };
audio.onplaying = psSync;                           // změna skladby za hraní
audio.onpause = () => {
  $('play').innerHTML = ICON_PLAY; psSync(); clearTimeout(stopT);
  // po 10 minutách pauzy se služba i upozornění ukončí (šetří baterii)
  if (PS) stopT = setTimeout(() => { if (audio.paused && psOn) { psOn = false; psCall('stop').catch(() => {}); } }, 600000);
};
try { // tlačítka v upozornění posílají události z nativní části
  if (PS) {
    const h = e => { if (e.action === 'playpause') $('play').click(); else if (e.action === 'next') step(1); };
    const r = typeof PS.addListener === 'function' ? PS.addListener('action', h) : Capacitor.addListener('PlayerService', 'action', h);
    if (r && r.catch) r.catch(() => {});
  }
} catch (e) {}
audio.onended = () => {
  if (repeat === 2) { audio.currentTime = 0; audio.play(); return; }
  const pool = view.length ? view : tracks.map((t, i) => i);
  if (repeat === 0 && !shuffle && pool.indexOf(cur) === pool.length - 1) return;
  step(1);
};
audio.onerror = () => { if (cur >= 0) $('sub').textContent = 'Tento formát prohlížeč nepřehraje.'; };

const paint = el => el.style.setProperty('--p', (el.value - el.min) / (el.max - el.min) * 100 + '%');
let seeking = false;
audio.ontimeupdate = () => {
  if (seeking || !audio.duration) return;
  $('seek').value = audio.currentTime / audio.duration * 1000; paint($('seek'));
  $('cur').textContent = fmt(audio.currentTime);
};
audio.onloadedmetadata = () => $('dur').textContent = fmt(audio.duration);
$('seek').oninput = e => { seeking = true; paint(e.target); $('cur').textContent = fmt(e.target.value / 1000 * audio.duration); };
$('seek').onchange = e => { audio.currentTime = e.target.value / 1000 * audio.duration; seeking = false; };
$('vol').oninput = e => { audio.volume = e.target.value / 100; paint(e.target); };
audio.volume = .8; paint($('vol')); paint($('seek'));

addEventListener('keydown', e => {
  if (/INPUT|SELECT/.test(e.target.tagName) && e.target.type !== 'range') return;
  if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
  if (e.code === 'ArrowRight') audio.currentTime += 5;
  if (e.code === 'ArrowLeft') audio.currentTime -= 5;
});

/* ===== Plátna ===== */
const cv = $('viz'), vctx = cv.getContext('2d');
const fx = $('fx'), fctx = fx.getContext('2d');
let W = 0, H = 0;
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, cfg.perf === 'full' ? 2 : 1.5);
  const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
  cv.width = W * dpr; cv.height = H * dpr; vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Pozadí se kreslí v poloviční velikosti (rozmazané kruhy, ušetří výkon)
  const d = cfg.perf === 'full' ? 2 : touch ? 6 : 4; fx.width = innerWidth / d; fx.height = innerHeight / d;
  idleDrawn = false;                                // plátna se vymazala, v klidu je nutné je překreslit
}
new ResizeObserver(resize).observe(cv);
addEventListener('resize', resize);

/* ===== Barevné kruhy v pozadí (styl Siri) ===== */
const NB = touch ? 5 : 7;                                              // na telefonu méně kruhů
const blobs = Array.from({length: NB}, (_, i) => ({
  x: Math.random(), y: Math.random(),
  vx: (Math.random() - .5) * .00006, vy: (Math.random() - .5) * .00006, // pomalý drift
  r: .22 + Math.random() * .16, off: i * 38,                            // posun odstínu
  band: 2 + Math.round(i * 84 / (NB - 1)), e: 0                         // frekvenční pásmo
}));
let hueBase = 200, kick = 0, avg = .2, lastBeat = 0;

/* Měkký kruh dané barvy se vytvoří jen jednou a pak se jen kreslí (levnější než gradient při každém snímku) */
const sprites = {};
function sprite(hue) {
  const h = Math.round(hue / 5) * 5 % 360;
  if (!sprites[h]) {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d'), gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    gr.addColorStop(0, `hsla(${h},95%,60%,1)`); gr.addColorStop(1, `hsla(${h},95%,55%,0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 96, 96); sprites[h] = c;
  }
  return sprites[h];
}

function drawFx(t, dt, playing) {
  const w = fx.width, h = fx.height, m = Math.max(w, h);
  fctx.globalCompositeOperation = 'source-over';
  fctx.clearRect(0, 0, w, h);
  fctx.globalCompositeOperation = 'lighter';
  let sum = 0, wsum = 0;
  if (playing) for (let i = 0; i < 128; i++) { sum += i * data[i]; wsum += data[i]; }
  const centroid = wsum ? sum / wsum / 128 : 0;   // "jas" hudby, basy = nízké, výšky = vysoké
  hueBase += dt * (.006 + bass * .05);             // barva plyne rychleji při silném rytmu
  const shift = centroid * 140;                    // styl hudby posouvá paletu
  for (const b of blobs) {
    b.x += b.vx * dt * (1 + bass * 6); b.y += b.vy * dt * (1 + bass * 6);
    if (b.x < -.1 || b.x > 1.1) b.vx *= -1;
    if (b.y < -.1 || b.y > 1.1) b.vy *= -1;
    let e = 0; if (playing) { for (let k = 0; k < 6; k++) e += data[b.band + k]; e /= 1530; }
    b.e += (e - b.e) * .25;
    const rad = b.r * m * (1 + b.e * .9 + kick * .35);
    fctx.globalAlpha = Math.min(1, playing ? .28 + b.e * .5 : .12);
    fctx.drawImage(sprite((hueBase + shift + b.off) % 360), b.x * w - rad, b.y * h - rad, rad * 2, rad * 2);
  }
  fctx.globalAlpha = 1;
}

/* ===== Hlavní smyčka ===== */
let bass = 0, hidden = false, prev = performance.now();
document.addEventListener('visibilitychange', () => { hidden = document.hidden; idleDrawn = false; });

const FPS = touch ? {full: [60, 30], balanced: [60, 30], eco: [30, 0]}   // telefon: plynulé vlny, pozadí 30 fps
                   : {full: [60, 30], balanced: [30, 20], eco: [24, 0]};  // [vizuál, pozadí] snímků za sekundu
let lastViz = 0, lastFx = 0, lastSc = 1, idleDrawn = false;
let cost = 0, lite = false;                        // průměrná doba kreslení a automatický úsporný režim
const coverEl = $('cover'), sm = new Float32Array(64); // sm = vyhlazené výšky sloupců

function draw(t) {
  requestAnimationFrame(draw);
  if (hidden) return;                               // skrytá karta nebo minimalizované okno
  const [vf, ff0] = FPS[cfg.perf] || FPS.balanced;
  if (t - lastViz < 1000 / vf - 2) return;          // omezení snímků = méně CPU i GPU
  lastViz = t;
  const playing = !!analyser && !audio.paused;
  // Klid: hudba stojí a vše doznělo, vykreslí se poslední snímek a pak nic
  if (!playing && bass < .004 && kick < .01) { if (idleDrawn) return; idleDrawn = true; } else idleDrawn = false;
  const t0 = performance.now();
  render(t, playing, lite ? ff0 / 2 : ff0);
  cost += (performance.now() - t0 - cost) * .08;
  lite = lite ? cost > 2.5 : cost > 8;              // když je kreslení pomalé, ubere se detailů
}

function render(t, playing, ff) {
  if (playing) analyser.getByteFrequencyData(data); else if (data) data.fill(0);

  // Síla basů a detekce úderu (beat): náhlý skok nad průměr
  let b = 0; if (data) { for (let i = 0; i < 6; i++) b += data[i]; b /= 1530; }
  bass += (b - bass) * .35;
  avg += (b - avg) * .04;
  if (playing && b > avg * 1.3 + .06 && t - lastBeat > 280) { lastBeat = t; kick = 1; hueBase += 18 + Math.random() * 25; }
  kick *= .9;
  const sc = 1 + bass * .12;
  if (Math.abs(sc - lastSc) > .002) { lastSc = sc; coverEl.style.transform = `scale(${sc})`; }

  if (cfg.fx === 'on' && ff && t - lastFx >= 1000 / ff - 2) { drawFx(t, Math.min(100, t - lastFx), playing); lastFx = t; }
  if (cfg.style === 'off' || !data) return;

  vctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, N = lite ? 32 : touch ? 48 : 64, st = 58 / N;
  for (let k = 0; k < N; k++) sm[k] += (data[Math.floor(k * st) + 2] / 255 - sm[k]) * .5; // plynulé dorovnání výšky
  vctx.fillStyle = vctx.strokeStyle = cfg.accent; vctx.globalAlpha = .9;
  if (cfg.style === 'circle') {
    const r0 = W * .28 * (1 + bass * .12);
    vctx.lineWidth = Math.max(2, W / 150); vctx.lineCap = 'round';
    vctx.beginPath();
    for (let i = 0; i < N * 2; i++) {
      const k = i < N ? i : 2 * N - 1 - i;          // zrcadlení pro symetrický kruh
      const a = i / (N * 2) * Math.PI * 2 - Math.PI / 2, l = sm[k] * W * .17 + 2;
      const co = Math.cos(a), si = Math.sin(a);
      vctx.moveTo(cx + co * r0, cy + si * r0);
      vctx.lineTo(cx + co * (r0 + l), cy + si * (r0 + l));
    }
    vctx.stroke();
    vctx.globalAlpha = .25 + bass * .5; vctx.lineWidth = 2;
    vctx.beginPath(); vctx.arc(cx, cy, r0 - 6, 0, Math.PI * 2); vctx.stroke();
  } else {
    const bw = W / N;
    for (let i = 0; i < N; i++) {
      const h = Math.max(3, sm[i] * H * .7);
      if (vctx.roundRect) { vctx.beginPath(); vctx.roundRect(i * bw + bw * .15, H * .85 - h, bw * .7, h, 3); vctx.fill(); }
      else vctx.fillRect(i * bw + bw * .15, H * .85 - h, bw * .7, h);
    }
  }
  vctx.globalAlpha = 1;
}

/* ===== Okraje systémových lišt (Android): pozadí se kreslí i pod nimi, obsah se odsadí ===== */
async function applyInsets() {
  if (!PS) return;
  try {
    const r = await psCall('insets', {}), st = document.documentElement.style;
    st.setProperty('--sat', (r.top || 0) + 'px'); st.setProperty('--sar', (r.right || 0) + 'px');
    st.setProperty('--sab', (r.bottom || 0) + 'px'); st.setProperty('--sal', (r.left || 0) + 'px');
  } catch (e) {}
}
window.__applyInsets = applyInsets;                 // volá ji nativní část při změně okrajů

/* ===== Start ===== */
applyCfg(); resize(); renderList(); restore(); requestAnimationFrame(draw);
applyInsets(); setTimeout(applyInsets, 400); setTimeout(applyInsets, 1500);
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  for (const [n, f] of [['play', () => audio.play()], ['pause', () => audio.pause()], ['previoustrack', () => step(-1)], ['nexttrack', () => step(1)]]) {
    try { ms.setActionHandler(n, f); } catch (e) {}
  }
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.Capacitor) navigator.serviceWorker.register('sw.js'); // instalace jako aplikace
})();
