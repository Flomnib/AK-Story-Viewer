/* Arknights Offline Story Reader
   Story scripts: Kengxxiao/ArknightsGameData_YoStar (EN)
   Images: fexli/ArknightsResource (fallback: Aceship/Arknight-Images)
   Music + SFX: ThiagoVsky/arknights-sound
   Everything downloaded is kept in Cache Storage so it plays with no connection. */
'use strict';

const DATA = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/';
const OLD_DATA = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData_YoStar/main/en_US/gamedata/';   // v1 downloads
const AA = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/en/assets/dyn/avg/';   // EN art, kept current
const IMG = 'https://raw.githubusercontent.com/fexli/ArknightsResource/main/';
const ACE = 'https://raw.githubusercontent.com/Aceship/Arknight-Images/main/';
const SND = 'https://raw.githubusercontent.com/ThiagoVsky/arknights-sound/main/';
const REVIEW_URL = DATA + 'excel/story_review_table.json';
const VARS_URL = DATA + 'story/story_variables.json';
const CACHE = 'ak-data-v1';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const bool = (v, d = false) => v == null ? d : /^(true|1)$/i.test(String(v).trim());

/* ---------- small persistent store (localStorage, never trusted to exist) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('ak.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ak.' + k, JSON.stringify(v)); } catch {} },
};
const settings = Object.assign({ nickname: 'Doctor', textSpeed: 30, autoDelay: 1.4, music: 0.8, sfx: 0.9 }, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);

/* ---------- cache helpers ---------- */
let cacheP = null;
const cache = () => cacheP || (cacheP = caches.open(CACHE));
async function cachedFetch(url, { save = true } = {}) {
  const c = await cache();
  const hit = await c.match(url);
  if (hit) return hit;
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(res.status + ' ' + url);
  if (save) await c.put(url, res.clone());
  return res;
}
async function cachedJSON(url) { return (await cachedFetch(url)).json(); }
async function cachedText(url) { return (await cachedFetch(url)).text(); }

/* ---------- asset index + resolution ---------- */
let IDX = null, VARS = {}, NPC = new Map(), ACESET = new Map(), SNDSET = new Map();
let RES = store.get('res', {});          // "kind:name" -> resolved URL (or "" if nothing was found)
let resDirty = false;
const flushRes = () => { if (resDirty) { store.set('res', RES); resDirty = false; } };

async function loadIndex() {
  IDX = await (await fetch('asset-index.json')).json();
  IDX.npc.forEach(n => NPC.set(n.toLowerCase(), n));
  IDX.ace.forEach(n => ACESET.set(n.toLowerCase(), n));
  IDX.snd.forEach(n => SNDSET.set(n.toLowerCase(), n));
}
async function loadVars() { try { VARS = await cachedJSON(VARS_URL); } catch { VARS = {}; } }
const sv = v => { if (v == null) return ''; v = String(v).trim(); if (v.startsWith('$') && VARS[v.slice(1)] != null) return String(VARS[v.slice(1)]).trim(); return v; };

const aaUrl = rest => AA + rest.split('/').map(encodeURIComponent).join('/');
function imgCandidates(name) {
  name = sv(name); if (!name) return [];
  const k = name.toLowerCase(), out = [];
  if (IDX.aa) for (const m of [IDX.aa.bg, IDX.aa.img, IDX.aa.item]) if (m[k]) out.push(aaUrl(m[k]));
  for (const m of [IDX.bg, IDX.img, IDX.item]) if (m[k]) out.push(IMG + m[k]);
  if (!out.length) out.push(IMG + 'avgs/bg/' + name + '.png', IMG + 'avgs/' + name + '.png', IMG + 'avgs/items/' + name + '.png');
  return out;
}
function charCandidates(raw) {
  let n = sv(raw); if (!n || /^char_empty/i.test(n)) return [];
  let [base, rest = ''] = n.split('#'); base = base.trim();
  let [face = '', variant = ''] = rest.split('$'); face = face.trim(); variant = variant.trim();
  const last = base.split('_').pop();
  const fx = [];
  if (face && variant) fx.push(`${base}_${face}_${variant}`);
  if (face) fx.push(`${base}_${face}`);
  fx.push(`${base}_1`, `${base}_${last}`, base);
  if (face) fx.push(`${base}_1_${face}`);
  const out = [];
  if (IDX.aa) {
    const ax2 = [n, face ? `${base}#${face}` : null, variant ? null : `${base}#${face || 1}$1`, base, `${base}#1`];
    for (const x of ax2) { const hit = x && IDX.aa.chr[x.toLowerCase()]; if (hit) out.push(aaUrl(hit)); }
  }
  for (const x of fx) { const hit = NPC.get(x.toLowerCase()); if (hit) out.push(IMG + 'avgs/npcs/' + hit + '.png'); }
  const m = base.match(/^(.*)_(\d+)$/), ax = [];
  if (face) ax.push(`${base}#${face}`, `${base}_${face}`);
  if (m && face) ax.push(`${m[1]}_${face}`);
  ax.push(base);
  for (const x of ax) { const hit = ACESET.get(x.toLowerCase()); if (hit) out.push(ACE + 'avg/characters/' + encodeURIComponent(hit) + '.png'); }
  if (!out.length) out.push(IMG + 'avgs/npcs/' + fx[0] + '.png');   // newer than the index: guess
  return [...new Set(out)];
}
function audioCandidates(raw) {
  let p = sv(raw); if (!p) return [];
  p = p.replace(/\\/g, '/').replace(/^audio\//i, '').replace(/^sound_beta_2\//i, '');
  const hit = SNDSET.get(p.toLowerCase());
  return [SND + (hit || p.toLowerCase()) + '.mp3'];
}
const CAND = { img: imgCandidates, char: charCandidates, audio: audioCandidates };
function resolved(kind, name) {
  const key = kind + ':' + sv(name);
  if (key in RES) return RES[key] || null;
  return CAND[kind](name)[0] || null;
}

/* ---------- script parser ---------- */
function parseArgs(s) {
  const a = {}, re = /([A-Za-z_]\w*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,\s)]+))/g;
  let m; while ((m = re.exec(s))) a[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
  return a;
}
function parseLine(line) {
  const t = line.replace(/^﻿/, '').trim();
  if (!t || t.startsWith('//')) return null;
  if (t[0] !== '[') return { cmd: 'text', name: '', text: t };
  let i = 1, q = false;
  for (; i < t.length; i++) { const c = t[i]; if (c === '"') q = !q; else if (c === ']' && !q) break; }
  const inner = t.slice(1, i).trim(), rest = t.slice(i + 1).trim();
  const m = inner.match(/^([A-Za-z_]+)\s*(?:\(([\s\S]*)\))?\s*$/);
  if (!m) {
    const a = parseArgs(inner);
    if ('name' in a) return { cmd: 'name', name: a.name, text: rest };
    return null;
  }
  return { cmd: m[1].toLowerCase(), args: m[2] != null ? parseArgs(m[2]) : {}, text: rest };
}
const parseScript = txt => txt.split(/\r?\n/).map(parseLine).filter(Boolean);

function collectAssets(cmds) {
  const set = new Map();
  const add = (kind, name) => { name = sv(name); if (name && !/^char_empty/i.test(name)) set.set(kind + ':' + name, { kind, name }); };
  for (const c of cmds) {
    const a = c.args || {};
    switch (c.cmd) {
      case 'character': add('char', a.name); add('char', a.name2); break;
      case 'charslot': case 'charactercutin': add('char', a.name); break;
      case 'background': case 'image': case 'imagetween': case 'showitem': case 'cgitem': case 'largebg': add('img', a.image); break;
      case 'gridbg': case 'verticalbg': (a.imagegroup || '').split('/').forEach(x => add('img', x)); break;
      case 'playmusic': add('audio', a.intro); add('audio', a.key); break;
      case 'playsound': add('audio', a.key); break;
    }
  }
  return [...set.values()];
}

/* ---------- library data ---------- */
let REVIEW = null;
const CATS = [
  { id: 'ORDER', label: 'Reading Order' },
  { id: 'MAINLINE', label: 'Main Theme' },
  { id: 'ACTIVITY', label: 'Side Stories' },
  { id: 'MINI_ACTIVITY', label: 'Vignettes' },
  { id: 'NONE', label: 'Operator Records' },
];
const storyUrl = s => DATA + 'story/' + s.storyTxt + '.txt';
const oldStoryUrl = s => OLD_DATA + 'story/' + s.storyTxt + '.txt';
/* Script text: this source first, then a copy saved by the first version of the app, then the network. */
async function storyText(s) {
  const c = await cache();
  const hit = (await c.match(storyUrl(s))) || (await c.match(oldStoryUrl(s)));
  if (hit) return hit.text();
  return cachedText(storyUrl(s));
}
async function storySaved(s) { const c = await cache(); return !!((await c.match(storyUrl(s))) || (await c.match(oldStoryUrl(s)))); }

/* ---------- reading progress (finished chapters) ---------- */
let doneSet = new Set(store.get('done', []));
const storyKey = s => s.storyId;
function markDone(s, on = true) { on ? doneSet.add(storyKey(s)) : doneSet.delete(storyKey(s)); store.set('done', [...doneSet]); }
function groupLabel(g) {
  if (g.entryType === 'MAINLINE') { const n = g.id.match(/main_(\d+)/); return n ? 'Episode ' + n[1].padStart(2, '0') : 'Main'; }
  return g.entryType === 'NONE' ? 'Record' : g.entryType === 'MINI_ACTIVITY' ? 'Vignette' : 'Event';
}
function sortedGroups(cat) {
  const gs = Object.values(REVIEW).filter(g => g.entryType === cat && g.infoUnlockDatas?.length);
  if (cat === 'MAINLINE') gs.sort((a, b) => parseInt(a.id.split('_')[1]) - parseInt(b.id.split('_')[1]));
  else if (cat === 'NONE') gs.sort((a, b) => a.name.localeCompare(b.name));
  else gs.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  return gs;
}
const stories = g => [...g.infoUnlockDatas].sort((a, b) => a.storySort - b.storySort);
let groupsMeta = store.get('groups', {});    // id -> {urls, bytes, missing, date, complete}
const saveGroups = () => store.set('groups', groupsMeta);

/* ---------- downloader ---------- */
const dl = { active: null, queue: [] };
/* Wait until the app is in the foreground and online again (iOS freezes pages when the screen locks). */
async function untilActive() {
  while (document.hidden || !navigator.onLine) await sleep(800);
}
/* Returns {url, bytes} when saved, {missing:true} when no source has the file (404s),
   or {failed:true} when the network kept dropping, so a later Resume retries it. */
async function fetchFirst(cands) {
  const c = await cache();
  for (const u of cands) { const hit = await c.match(u); if (hit) return { url: u, bytes: 0, cached: true }; }
  let netErr = false;
  for (const u of cands) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await untilActive();
      try {
        const r = await fetch(u, { mode: 'cors', cache: 'no-store' });
        if (r.status === 404) break;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const blob = await r.blob();
        await c.put(u, new Response(blob, { headers: { 'Content-Type': r.headers.get('Content-Type') || '' } }));
        return { url: u, bytes: blob.size };
      } catch (e) {
        if (e && e.name === 'QuotaExceededError') throw new Error('Your phone is out of space for downloads. Free up storage or remove another story.');
        netErr = true; await sleep(700 * (attempt + 1));
      }
    }
  }
  return netErr ? { failed: true } : { missing: true };
}
let wakeLock = null;
async function holdAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener?.('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
}
async function downloadGroup(g, onProgress) {
  if (!navigator.onLine) throw new Error('You are offline. Connect to wifi to download.');
  await cachedFetch(VARS_URL); await loadVars();
  const list = stories(g), prev = groupsMeta[g.id] || {};
  const urls = new Set(prev.urls || []), assets = new Map();
  let done = 0, bytes = 0, missing = 0, failed = 0, sinceSave = 0;
  const persist = (complete) => {
    groupsMeta[g.id] = { urls: [...urls], bytes: Math.max(prev.bytes || 0, (prev.bytes || 0) + bytes), missing, failed, date: Date.now(), complete };
    saveGroups(); flushRes();
  };
  onProgress({ phase: 'Scripts', done: 0, total: list.length, bytes });
  for (const s of list) {
    const u = storyUrl(s);
    let txt = null;
    for (let attempt = 0; attempt < 4 && txt == null; attempt++) {
      await untilActive();
      try { txt = await storyText(s); } catch { await sleep(700 * (attempt + 1)); }
    }
    if (txt != null) { urls.add(u); collectAssets(parseScript(txt)).forEach(x => assets.set(x.kind + ':' + x.name, x)); }
    else failed++;
    onProgress({ phase: 'Scripts', done: ++done, total: list.length, bytes });
  }
  persist(false);
  const items = [...assets.values()]; done = 0;
  onProgress({ phase: 'Art & music', done, total: items.length, bytes });
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      if (dl.cancel) return;
      const it = items[i++], key = it.kind + ':' + it.name;
      const r = await fetchFirst(CAND[it.kind](it.name));
      if (r.url) { RES[key] = r.url; urls.add(r.url); bytes += r.bytes; }
      else if (r.missing) { RES[key] = ''; missing++; }
      else failed++;
      resDirty = true;
      if (++sinceSave >= 15) { sinceSave = 0; persist(false); }
      onProgress({ phase: 'Art & music', done: ++done, total: items.length, bytes });
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  persist(!dl.cancel && failed === 0);
  if (!groupsMeta[g.id].bytes) { groupsMeta[g.id].bytes = await sizeOf([...urls]); saveGroups(); }
  return groupsMeta[g.id];
}
async function sizeOf(urls) {
  const c = await cache(); let n = 0;
  for (const u of urls) { const r = await c.match(u); if (r) n += (await r.clone().blob()).size; }
  return n;
}
async function deleteGroup(id) {
  const keep = new Set();
  for (const [gid, m] of Object.entries(groupsMeta)) if (gid !== id) m.urls.forEach(u => keep.add(u));
  const c = await cache();
  for (const u of groupsMeta[id]?.urls || []) if (!keep.has(u)) await c.delete(u);
  delete groupsMeta[id]; saveGroups();
}
const fmtBytes = b => b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(0) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
async function isCached(url) { return !!(await (await cache()).match(url)); }

/* ---------- audio (Web Audio, gapless intro -> loop) ---------- */
const audio = {
  ctx: null, master: null, music: null, musicGain: null, chans: new Map(), buffers: new Map(), blobs: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}   // play even with the silent switch on
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.ctx.resume();
  },
  async buffer(url) {
    if (!url || !this.ctx) return null;
    if (this.buffers.has(url)) return this.buffers.get(url);
    const p = (async () => {
      let blob = this.blobs?.get(url);
      if (!blob) { const r = await cachedFetch(url, { save: false }).catch(() => null); if (!r) return null; blob = await r.blob(); }
      const ab = await blob.arrayBuffer();
      return await new Promise(res => this.ctx.decodeAudioData(ab, res, () => res(null)));
    })();
    this.buffers.set(url, p);
    if (this.buffers.size > 24) this.buffers.delete(this.buffers.keys().next().value);
    return p;
  },
  ramp(g, v, t) { const now = this.ctx.currentTime; g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(v, now + Math.max(0.01, t)); },
  async playMusic(introUrl, loopUrl, vol = 1, crossfade = 0.5, delay = 0) {
    if (!this.ctx) return;
    const [ib, lb] = await Promise.all([this.buffer(introUrl), this.buffer(loopUrl)]);
    this.stopMusic(crossfade);
    if (!ib && !lb) return;
    const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.master);
    const t0 = this.ctx.currentTime + delay + 0.05, srcs = [];
    if (ib) { const s = this.ctx.createBufferSource(); s.buffer = ib; s.connect(g); s.start(t0); srcs.push(s); }
    if (lb) { const s = this.ctx.createBufferSource(); s.buffer = lb; s.loop = true; s.connect(g); s.start(ib ? t0 + ib.duration : t0); srcs.push(s); }
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol * settings.music, t0 + Math.max(0.05, crossfade));
    this.music = { srcs, g, vol };
  },
  stopMusic(fade = 0.5) {
    const m = this.music; if (!m) return; this.music = null;
    this.ramp(m.g, 0, fade); setTimeout(() => m.srcs.forEach(s => { try { s.stop(); } catch {} }), fade * 1000 + 100);
  },
  musicVolume(v, fade) { if (this.music) { this.music.vol = v; this.ramp(this.music.g, v * settings.music, fade); } },
  async playSound(url, vol = 1, channel = '', loop = false, delay = 0) {
    if (!this.ctx) return;
    const b = await this.buffer(url); if (!b) return;
    if (channel) this.stopSound(channel, 0.05);
    const g = this.ctx.createGain(); g.gain.value = vol * settings.sfx; g.connect(this.master);
    const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = loop; s.connect(g); s.start(this.ctx.currentTime + delay);
    if (channel) this.chans.set(channel, { s, g, vol });
  },
  stopSound(channel, fade = 0.3) {
    const stop = (k, c) => { this.ramp(c.g, 0, fade); setTimeout(() => { try { c.s.stop(); } catch {} }, fade * 1000 + 60); this.chans.delete(k); };
    if (channel) { const c = this.chans.get(channel); if (c) stop(channel, c); }
    else [...this.chans].forEach(([k, c]) => stop(k, c));
  },
  soundVolume(channel, v, fade) { const c = this.chans.get(channel); if (c) this.ramp(c.g, v * settings.sfx, fade); },
  stopAll() { this.stopMusic(0.3); this.stopSound(null, 0.2); },
};

/* ---------- text formatting ---------- */
function richText(s) {
  s = String(s || '').replace(/\{@nickname\}/gi, settings.nickname).replace(/\\n/g, '\n');
  let h = esc(s);
  h = h.replace(/&lt;(\/?)(i|b)&gt;/gi, '<$1$2>')
       .replace(/&lt;color=(#?[0-9a-z]+)&gt;/gi, (_, c) => `<span style="color:${/^#?[0-9a-f]{3,8}$/i.test(c) ? (c[0] === '#' ? c : '#' + c) : c}">`)
       .replace(/&lt;\/color&gt;/gi, '</span>')
       .replace(/&lt;\/?(size|p|u|s|material|quad|font)[^&]*?&gt;/gi, '');
  return h.replace(/\n/g, '<br>');
}
/* Typewriter: wraps every character in a span and reveals them in order. */
function typewriter(node, html, speedMs, from = 0) {
  node.innerHTML = html;
  const chars = [];
  const walk = n => {
    for (const c of [...n.childNodes]) {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const ch of c.textContent) { const sp = document.createElement('span'); sp.textContent = ch; sp.className = 'tw'; frag.appendChild(sp); chars.push(sp); }
        c.replaceWith(frag);
      } else walk(c);
    }
  };
  walk(node);
  let i = 0, timer = null, resolve;
  for (; i < Math.min(from, chars.length); i++) chars[i].className = '';
  const p = new Promise(r => (resolve = r));
  const finish = () => { clearTimeout(timer); for (; i < chars.length; i++) chars[i].className = ''; resolve(); };
  const step = () => { if (i >= chars.length) return resolve(); chars[i++].className = ''; timer = setTimeout(step, speedMs); };
  if (speedMs <= 0) finish(); else step();
  return { done: p, finish };
}

/* ---------- the stage player ---------- */
const SLOT_X = { l: -300, m: 0, r: 300 };
const SLOT_ALIAS = { left: 'l', middle: 'm', right: 'r', l: 'l', m: 'm', r: 'r', center: 'm' };

class Player {
  constructor(group, storyIdx, stopAt) {
    this.group = group; this.list = stories(group); this.idx = storyIdx;
    this.stopAt = Math.min(stopAt ?? this.list.length, this.list.length);   // a reading-order entry can cover part of a group
    this.root = $('#player'); this.stage = $('#stage'); this.scene = $('#scene');
    this.urls = new Map(); this.auto = false; this.skip = false; this.closed = false;
    this.log = [];
    this.bindUI();
  }
  bindUI() {
    this.onTap = e => {
      if (e.target.closest('.p-ui, .choices, .p-log')) return;
      if (this.tw) { this.tw.finish(); return; }
      if (this.tapResolve) { const r = this.tapResolve; this.tapResolve = null; r(); }
    };
    this.onKey = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.onTap({ target: this.stage }); } if (e.key === 'Escape') this.close(); };
    this.root.addEventListener('click', this.onTap);
    document.addEventListener('keydown', this.onKey);
    $('#pAuto').onclick = () => { this.auto = !this.auto; this.skip = false; this.syncButtons(); if (this.auto) this.onTap({ target: this.stage }); };
    $('#pSkip').onclick = () => { this.skip = !this.skip; this.auto = false; this.syncButtons(); if (this.skip) this.onTap({ target: this.stage }); };
    $('#pLog').onclick = () => this.showLog();
    $('#pClose').onclick = () => this.close();
    this.onResize = () => layoutStage(); window.addEventListener('resize', this.onResize);
  }
  syncButtons() { $('#pAuto').classList.toggle('on', this.auto); $('#pSkip').classList.toggle('on', this.skip); }
  close() {
    this.closed = true; this.tapResolve?.(); this.tw?.finish();
    audio.stopAll();
    this.root.removeEventListener('click', this.onTap); document.removeEventListener('keydown', this.onKey); window.removeEventListener('resize', this.onResize);
    this.urls.forEach(u => URL.revokeObjectURL(u));
    this.root.hidden = true; document.body.classList.remove('reading');
    try { screen.orientation?.unlock?.(); } catch {}
    renderGroup(this.group.id, this.orderCtx ? { view: this.orderCtx.view, index: this.orderCtx.index } : undefined);
  }
  closeQuiet() {
    this.closed = true; this.tapResolve?.(); this.tw?.finish(); audio.stopAll();
    this.root.removeEventListener('click', this.onTap); document.removeEventListener('keydown', this.onKey); window.removeEventListener('resize', this.onResize);
    this.urls.forEach(u => URL.revokeObjectURL(u));
  }
  /* time helpers */
  t(sec) { return this.instant ? 0 : this.skip ? Math.min(sec, 0.05) : sec; }
  async wait(sec) { const s = this.t(sec); if (s > 0) await sleep(s * 1000); }
  waitTap(textLen = 40) {
    if (this.instant) return Promise.resolve();
    if (this.skip) return sleep(40);
    return new Promise(r => {
      this.tapResolve = r;
      if (this.auto) { const ms = settings.autoDelay * 1000 + textLen * 25; this.autoTimer = setTimeout(() => { if (this.tapResolve === r) { this.tapResolve = null; r(); } }, ms); }
    });
  }
  src(kind, name) { const u = resolved(kind, name); return u ? (this.urls.get(u) || u) : null; }

  /* load a story: script + every asset into memory (from cache when offline) */
  async load() {
    const s = this.list[this.idx];
    this.reset();
    $('#pTitle').textContent = [s.storyCode, s.storyName].filter(Boolean).join(' · ') + (s.avgTag ? ' — ' + s.avgTag : '');
    const veil = $('#pLoading'); veil.hidden = false; veil.querySelector('b').textContent = s.storyName;
    const bar = veil.querySelector('i');
    let txt;
    try { txt = await storyText(s); }
    catch { veil.querySelector('p').textContent = 'This chapter is not downloaded and you are offline.'; return false; }
    this.cmds = parseScript(txt);
    const items = collectAssets(this.cmds); let n = 0;
    const blobs = new Map(); audio.blobs = blobs;
    const c = await cache();
    await Promise.all(items.map(async it => {
      const u = resolved(it.kind, it.name);
      if (u && !this.urls.has(u)) {
        let r = await c.match(u);
        if (!r && navigator.onLine) { for (const cand of CAND[it.kind](it.name)) { try { const x = await fetch(cand, { mode: 'cors' }); if (x.ok) { r = x; RES[it.kind + ':' + it.name] = cand; resDirty = true; break; } } catch {} } }
        if (r) {
          const b = await r.blob(); const key = resolved(it.kind, it.name);
          if (it.kind === 'audio') blobs.set(key, b);
          else { const ou = URL.createObjectURL(b); this.urls.set(key, ou); const im = new Image(); im.src = ou; await im.decode().catch(() => {}); }
        }
      }
      bar.style.width = (++n / items.length * 100) + '%';
    }));
    flushRes();
    veil.hidden = true;
    return true;
  }
  reset() {
    this.scene.style.filter = ''; this.scene.style.transform = '';
    $('#bgLayer').innerHTML = ''; $('#cgLayer').innerHTML = ''; $('#subLayer').innerHTML = '';
    $('#blocker').style.cssText = 'background:rgba(0,0,0,0);transition:none';
    for (const k of 'lmr') { const s = $('#slot-' + k); s.innerHTML = ''; s.style.cssText = ''; s.dataset.name = ''; }
    this.focus = 'all'; this.applyFocus();
    this.hideDialog(); this.stickers = new Map(); this.choice = null; this.branchOn = true; this.ml = null;
    this.effects = { gray: 0, invert: 0 };
  }
  async start() {
    layoutStage();
    const pos = store.get('pos', {});
    while (!this.closed) {
      if (!(await this.load())) return;
      const saved = pos.group === this.group.id && pos.idx === this.idx ? pos.line : 0;
      await this.run(saved);
      if (this.closed) return;
      store.set('pos', { group: this.group.id, idx: this.idx + 1, line: 0 });
      markDone(this.list[this.idx]);
      if (this.idx + 1 >= this.stopAt) { await this.endCard(null); return; }
      if (!(await this.endCard(this.list[this.idx + 1]))) return;
      this.idx++;
    }
  }
  endCard(next) {
    return new Promise(res => {
      audio.stopAll();
      const box = $('#choices'); box.innerHTML = ''; box.hidden = false;
      const t = el('div', 'end-title', next ? 'Chapter complete' : 'End of ' + esc(this.orderCtx?.entry.title || this.group.name)); box.append(t);
      const after = !next && this.orderCtx ? nextEntryAfter(this.orderCtx.view, this.orderCtx.index) : null;
      if (after) { const b = el('button', 'choice', 'Next in reading order: ' + esc(after.entry.title)); b.onclick = e => { e.stopPropagation(); box.hidden = true; res(false); this.closeQuiet(); openEntry(this.orderCtx.view, after.index); }; box.append(b); }
      if (next) { const b = el('button', 'choice', 'Next: ' + esc([next.storyCode, next.storyName].filter(Boolean).join(' ') + (next.avgTag ? ' (' + next.avgTag + ')' : ''))); b.onclick = e => { e.stopPropagation(); box.hidden = true; res(true); }; box.append(b); }
      const q = el('button', 'choice ghost', 'Back to chapter list'); q.onclick = e => { e.stopPropagation(); box.hidden = true; res(false); this.close(); }; box.append(q);
    });
  }
  async run(resumeAt = 0) {
    this.instant = resumeAt > 0; this.pendingMusic = null;
    const decisionValues = [];
    for (let i = 0; i < this.cmds.length && !this.closed; i++) {
      if (this.instant && i >= resumeAt) {
        this.instant = false;
        if (this.pendingMusic) { const m = this.pendingMusic; audio.playMusic(this.src('audio', m.intro), this.src('audio', m.key), m.vol, 0.8); }
      }
      const c = this.cmds[i];
      if (c.cmd === 'predicate') {
        const refs = String(c.args.references || '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
        if (this.choice == null) this.branchOn = true;
        else if (decisionValues.length && decisionValues.every(v => refs.includes(v))) { this.branchOn = true; this.choice = null; }
        else this.branchOn = refs.includes(this.choice);
        continue;
      }
      if (!this.branchOn) continue;
      if (c.cmd === 'decision') {
        const vals = String(c.args.values || '').split(';').map(s => s.trim());
        decisionValues.length = 0; decisionValues.push(...vals);
      }
      try { await this.exec(c, i); } catch (e) { console.warn('cmd failed', c, e); }
    }
  }
  savePos(line) { store.set('pos', { group: this.group.id, idx: this.idx, line }); }

  /* ---------- command implementations ---------- */
  async exec(c, i) {
    const a = c.args || {};
    switch (c.cmd) {
      case 'name': case 'text': case 'narration': return this.say(c.cmd === 'name' ? c.name : '', c.text, i);
      case 'multiline': return this.say(a.name || '', c.text, i, { multi: true, end: bool(a.end) });
      case 'dialog': this.hideDialog(); return;
      case 'subtitle': return this.subtitle(a, i);
      case 'sticker': return this.sticker(a, i);
      case 'stickerclear': this.stickers.forEach(s => s.remove()); this.stickers.clear(); return;
      case 'decision': return this.decide(a);
      case 'delay': return this.wait(num(a.time, 1));
      case 'background': return this.background(a);
      case 'gridbg': case 'verticalbg': return this.background({ image: (a.imagegroup || '').split('/')[0], fadetime: a.fadetime });
      case 'backgroundtween': case 'largebgtween': return this.tween($('#bgLayer').lastChild, a);
      case 'image': return this.image(a);
      case 'imagetween': return this.tween($('#cgLayer').lastChild, a);
      case 'imagerotate': { const im = $('#cgLayer').lastChild; if (im) { im.style.transition = `transform ${this.t(num(a.fadetime, 0))}s`; im.style.rotate = num(a.angle, 0) + 'deg'; } return; }
      case 'blocker': return this.blocker(a);
      case 'curtain': return;
      case 'character': return this.character(a);
      case 'charslot': return this.charslot(a);
      case 'characteraction': return this.charAction(a);
      case 'camerashake': return this.shake(a);
      case 'cameraeffect': return this.cameraEffect(a);
      case 'playmusic': {
        const m = { intro: a.intro, key: a.key, vol: num(a.volume, 1) };
        if (this.instant) { this.pendingMusic = m; return; }
        if (this.skip) await audio.buffer(this.src('audio', a.key));
        return void audio.playMusic(this.src('audio', a.intro), this.src('audio', a.key), m.vol, num(a.crossfade, 0.5), num(a.delay, 0));
      }
      case 'stopmusic': this.pendingMusic = null; if (!this.instant) audio.stopMusic(num(a.fadetime, 1)); return;
      case 'musicvolume': if (this.pendingMusic) this.pendingMusic.vol = num(a.volume, 1); if (!this.instant) audio.musicVolume(num(a.volume, 1), num(a.fadetime, 0.5)); return;
      case 'playsound': if (this.instant || this.skip) return; return void audio.playSound(this.src('audio', a.key), num(a.volume, 1), a.channel || '', bool(a.loop), num(a.delay, 0));
      case 'stopsound': if (!this.instant) audio.stopSound(a.channel || null, num(a.fadetime, 0.3)); return;
      case 'soundvolume': if (!this.instant) audio.soundVolume(a.channel, num(a.volume, 1), num(a.fadetime, 0.3)); return;
      case 'video': return this.say('', '[A video plays here in the game.]', i);
      default: return;
    }
  }
  hideDialog() { const d = $('#dialog'); d.classList.remove('show'); this.ml = null; }
  async say(name, text, line, { multi = false, end = false } = {}) {
    if (!text) return;
    if (!this.instant) this.savePos(line);
    const d = $('#dialog'), nm = $('#dName'), tx = $('#dText');
    let prior = '';
    if (multi && this.ml && this.ml.name === name && !this.ml.ended) prior = this.ml.text;
    const full = prior ? prior + ' ' + text : text;
    this.log.push({ name, text: multi && prior ? text : text, cont: !!prior });
    if (this.instant) { this.ml = multi ? { name, text: full, ended: end } : null; return; }
    d.classList.add('show');
    nm.textContent = sv(name); nm.hidden = !name;
    d.classList.toggle('narr', !name);
    const priorLen = prior ? (prior.replace(/<[^>]+>/g, '').length + 1) : 0;
    this.tw = typewriter(tx, richText(full), this.skip ? 0 : settings.textSpeed, priorLen);
    await this.tw.done; this.tw = null;
    d.classList.add('ready');
    await this.waitTap(text.length);
    d.classList.remove('ready');
    clearTimeout(this.autoTimer);
    this.ml = multi ? { name, text: full, ended: end } : null;
  }
  async subtitle(a, line) {
    const layer = $('#subLayer');
    layer.querySelectorAll('.subtitle').forEach(e => e.remove());
    if (!a.text) return;
    this.log.push({ name: '', text: a.text });
    if (this.instant) return;
    this.savePos(line);
    const e = this.placeText(el('div', 'subtitle'), a); layer.append(e);
    this.tw = typewriter(e, richText(a.text), this.skip ? 0 : Math.max(10, num(a.delay, 0.04) * 1000));
    await this.tw.done; this.tw = null;
    await this.waitTap(a.text.length);
  }
  placeText(e, a) {
    e.style.left = num(a.x, 240) + 'px'; e.style.top = num(a.y, 300) + 'px';
    e.style.width = num(a.width, 800) + 'px'; e.style.fontSize = num(a.size, 24) + 'px';
    e.style.textAlign = ({ left: 'left', right: 'right' })[a.alignment] || (a.alignment ? 'center' : 'left');
    if (a.color) e.style.color = a.color;
    return e;
  }
  async sticker(a, line) {
    const id = a.id || 'st';
    let e = this.stickers.get(id);
    if (!a.text) { if (e) { e.remove(); this.stickers.delete(id); } return; }
    this.log.push({ name: '', text: a.text });
    if (this.instant) return;
    let prior = '';
    if (e && bool(a.multi)) prior = e.dataset.text || '';
    else { e?.remove(); e = this.placeText(el('div', 'sticker'), a); $('#subLayer').append(e); this.stickers.set(id, e); }
    const full = prior + a.text; e.dataset.text = full;
    this.tw = typewriter(e, richText(full), this.skip ? 0 : Math.max(10, num(a.delay, 0.04) * 1000), prior.replace(/\\n/g, '\n').length);
    await this.tw.done; this.tw = null;
    if (bool(a.block)) { this.savePos(line); await this.waitTap(a.text.length); }
  }
  decide(a) {
    let opts = a.options != null ? String(a.options).split(';') : [];
    let vals = a.values != null ? String(a.values).split(';') : [];
    if (!opts.length) for (let k = 1; a['option' + k] != null; k++) { opts.push(a['option' + k]); vals.push(a['value' + k] ?? String(k)); }
    opts = opts.map(s => s.trim()); vals = vals.map(s => s.trim());
    if (this.instant) { this.choice = vals[0]; return; }
    this.skip = false; this.syncButtons(); clearTimeout(this.autoTimer);
    return new Promise(res => {
      const box = $('#choices'); box.innerHTML = ''; box.hidden = false;
      opts.forEach((o, k) => {
        const b = el('button', 'choice', richText(o));
        b.onclick = e => { e.stopPropagation(); box.hidden = true; this.choice = vals[k] ?? String(k + 1); this.log.push({ name: '▸', text: o }); res(); };
        box.append(b);
      });
    });
  }
  async background(a) {
    const layer = $('#bgLayer'), url = this.src('img', a.image);
    const fade = this.t(num(a.fadetime, 0));
    const im = el('img', 'bg'); im.alt = ''; im.onerror = () => { im.style.visibility = 'hidden'; };
    if (url) im.src = url;
    const xs = num(a.xscale, 1), ys = num(a.yscale, 1);
    im.style.transform = `translate(${num(a.x, 0)}px, ${-num(a.y, 0)}px) scale(${xs}, ${ys})`;
    im.style.opacity = fade ? 0 : 1; layer.append(im);
    if (fade) { im.getBoundingClientRect(); im.style.transition = `opacity ${fade}s`; im.style.opacity = 1; }
    const old = [...layer.children].slice(0, -1);
    setTimeout(() => old.forEach(o => o.remove()), fade * 1000 + 50);
    if (bool(a.block) && fade) await sleep(fade * 1000);
  }
  async image(a) {
    const layer = $('#cgLayer'), fade = this.t(num(a.fadetime, 0));
    const old = [...layer.children];
    if (!a.image) {
      old.forEach(o => { o.style.transition = `opacity ${fade}s`; o.style.opacity = 0; setTimeout(() => o.remove(), fade * 1000 + 50); });
      if (bool(a.block) && fade) await sleep(fade * 1000);
      return;
    }
    const im = el('img', 'cg'); im.alt = ''; im.onerror = () => { im.style.visibility = 'hidden'; }; const url = this.src('img', a.image); if (url) im.src = url;
    im.dataset.x = num(a.x, 0); im.dataset.y = num(a.y, 0); im.dataset.xs = num(a.xscale, 1); im.dataset.ys = num(a.yscale, 1);
    setXform(im);
    im.style.opacity = fade ? 0 : 1; layer.append(im);
    if (fade) { im.getBoundingClientRect(); im.style.transition = `opacity ${fade}s`; im.style.opacity = 1; }
    setTimeout(() => old.forEach(o => o.remove()), fade * 1000 + 50);
    if (bool(a.block) && fade) await sleep(fade * 1000);
  }
  async tween(im, a) {
    if (!im) return;
    const d = this.t(num(a.duration, 1));
    const pick = (from, to, key, def) => ({ from: a[from] != null ? num(a[from]) : null, to: a[to] != null ? num(a[to]) : null, key });
    const props = [pick('xfrom', 'xto', 'x'), pick('yfrom', 'yto', 'y'), pick('xscalefrom', 'xscaleto', 'xs'), pick('yscalefrom', 'yscaleto', 'ys')];
    if (a.xscale != null && a.xscaleto == null) props.push({ from: null, to: num(a.xscale), key: 'xs' });
    if (a.yscale != null && a.yscaleto == null) props.push({ from: null, to: num(a.yscale), key: 'ys' });
    im.style.transition = 'opacity .3s';
    props.forEach(p => { if (p.from != null) im.dataset[p.key] = p.from; });
    setXform(im); im.getBoundingClientRect();
    im.style.transition = `transform ${d}s ${a.ease ? 'ease-in-out' : 'linear'}, opacity .3s`;
    props.forEach(p => { if (p.to != null) im.dataset[p.key] = p.to; });
    setXform(im);
    if (bool(a.block) && d) await sleep(d * 1000);
  }
  async blocker(a) {
    const b = $('#blocker'), fade = this.t(num(a.fadetime, 0));
    const col = (k, d) => Math.round(num(a[k], d) * 255);
    const cur = getComputedStyle(b).backgroundColor.match(/[\d.]+/g) || [0, 0, 0, 0];
    const target = `rgba(${col('r', +cur[0] / 255)},${col('g', +cur[1] / 255)},${col('b', +cur[2] / 255)},${num(a.a, 0)})`;
    if (a.afrom != null || a.rfrom != null) {
      b.style.transition = 'none';
      b.style.backgroundColor = `rgba(${col('rfrom', 0)},${col('gfrom', 0)},${col('bfrom', 0)},${num(a.afrom, 0)})`;
      b.getBoundingClientRect();
    }
    b.style.transition = `background-color ${fade}s linear`;
    b.style.backgroundColor = target;
    if (bool(a.block) && fade) await sleep(fade * 1000);
  }
  setSlot(k, name, fade = 0.15) {
    const s = $('#slot-' + k), url = name ? this.src('char', name) : null;
    const key = name ? sv(name) : '';
    if (s.dataset.name === key) return;
    s.dataset.name = key;
    const old = [...s.children];
    old.forEach(o => { o.style.transition = `opacity ${fade}s`; o.style.opacity = 0; setTimeout(() => o.remove(), fade * 1000 + 50); });
    if (!url) return;
    const im = el('img', 'spr'); im.alt = ''; im.onerror = () => { im.style.visibility = 'hidden'; }; im.src = url; im.style.opacity = 0; s.append(im);
    im.getBoundingClientRect(); im.style.transition = `opacity ${fade}s`; im.style.opacity = 1;
  }
  applyFocus() {
    for (const k of 'lmr') {
      const f = this.focus;
      const lit = f === 'all' || f.includes(k);
      $('#slot-' + k).classList.toggle('dim', !lit);
    }
  }
  async character(a) {
    const fade = this.t(num(a.fadetime, 0.15));
    const names = [a.name, a.name2].filter(n => n != null && n !== '');
    for (const k of 'lmr') { $('#slot-' + k).style.transform = ''; $('#slot-' + k).style.opacity = ''; }
    if (names.length <= 1) { this.setSlot('l', null, fade); this.setSlot('r', null, fade); this.setSlot('m', names[0], fade); }
    else { this.setSlot('m', null, fade); this.setSlot('l', names[0], fade); this.setSlot('r', names[1], fade); }
    const f = num(a.focus, -1);
    this.focus = names.length <= 1 ? 'all' : f === 1 ? 'l' : f === 2 ? 'r' : 'all';
    this.applyFocus();
    if (bool(a.block) && fade) await sleep(fade * 1000);
  }
  async charslot(a) {
    const dur = this.t(num(a.duration, 0.15));
    if (a.slot == null && a.name == null) {
      if (a.focus != null) { this.setFocus(a.focus); return; }
      for (const k of 'lmr') { this.setSlot(k, null, dur); $('#slot-' + k).style.transform = ''; }
      this.focus = 'all'; this.applyFocus();
      if (dur > 0.2) await sleep(dur * 1000);
      return;
    }
    const k = SLOT_ALIAS[String(a.slot || 'm').toLowerCase()] || 'm';
    const s = $('#slot-' + k);
    if (a.name != null) this.setSlot(k, a.name, dur);
    if (a.posfrom != null || a.posto != null) {
      const p = v => String(v).split(',').map(Number);
      if (a.posfrom != null) { const [x, y] = p(a.posfrom); s.style.transition = 'none'; s.style.transform = `translate(${x}px, ${-y}px)`; s.getBoundingClientRect(); }
      if (a.posto != null) { const [x, y] = p(a.posto); s.style.transition = `transform ${dur}s ease-out, filter .25s, opacity ${dur}s`; s.style.transform = `translate(${x}px, ${-y}px)`; }
    }
    if (a.afrom != null || a.ato != null) {
      if (a.afrom != null) { s.style.transition = 'none'; s.style.opacity = num(a.afrom, 1); s.getBoundingClientRect(); }
      s.style.transition = `opacity ${dur}s, transform ${dur}s ease-out, filter .25s`; s.style.opacity = num(a.ato, 1);
    } else if (a.name != null) s.style.opacity = '';
    if (a.action) await this.slotAction(s, String(a.action).toLowerCase(), a);
    if (a.focus != null) this.setFocus(a.focus);
    if (bool(a.isblock) && dur) await sleep(dur * 1000);
  }
  setFocus(f) {
    f = String(f).toLowerCase().trim();
    if (f === 'all') this.focus = 'all';
    else if (f === 'n' || f === 'none' || f === '') this.focus = '';
    else this.focus = f.split(',').map(x => SLOT_ALIAS[x.trim()] || '').join('');
    this.applyFocus();
  }
  async slotAction(s, type, a) {
    if (this.instant) return;
    const d = num(a.duration, 0.5) * 1000, times = num(a.times, 1), power = num(a.power, 10);
    const base = s.style.transform || '';
    if (type === 'shake' || type === 'jump') {
      const frames = [];
      for (let n = 0; n < times; n++) frames.push(type === 'jump'
        ? [{ transform: base + ' translateY(0)' }, { transform: base + ` translateY(${-power * 2}px)` }, { transform: base + ' translateY(0)' }]
        : [{ transform: base + ` translateX(${-power}px)` }, { transform: base + ` translateX(${power}px)` }]);
      await s.animate(frames.flat().concat([{ transform: base }]), { duration: this.skip ? 10 : d }).finished.catch(() => {});
    } else if (type === 'zoom') {
      s.style.transition = `transform ${this.t(d / 1000)}s`; s.style.transform = base + ` scale(${num(a.scale, 1.2)})`;
    }
  }
  async charAction(a) {
    const k = SLOT_ALIAS[String(a.name || 'middle').toLowerCase()] || 'm', s = $('#slot-' + k);
    const type = String(a.type || '').toLowerCase(), fade = this.t(num(a.fadetime, 0.3));
    if (type === 'move') { s.style.transition = `transform ${fade}s ease-out, filter .25s`; s.style.transform = `translate(${num(a.xpos, 0)}px, ${-num(a.ypos, 0)}px)`; }
    else if (type === 'exit') { this.setSlot(k, null, fade); }
    else await this.slotAction(s, type === 'jump' ? 'jump' : 'shake', { duration: num(a.fadetime, 0.3), times: a.times, power: a.power });
    if (bool(a.block) && fade) await sleep(fade * 1000);
  }
  async shake(a) {
    if (this.instant || this.skip || bool(a.stop)) { this.scene.style.translate = ''; return; }
    const dur = num(a.duration, 0.5) * 1000, xs = num(a.xstrength, 20) * 0.5, ys = num(a.ystrength, 20) * 0.5, fadeout = bool(a.fadeout, true);
    const t0 = performance.now();
    const run = new Promise(res => {
      const frame = now => {
        const p = (now - t0) / dur; if (p >= 1 || this.closed) { this.scene.style.translate = ''; return res(); }
        const k = fadeout ? 1 - p : 1;
        this.scene.style.translate = `${(Math.random() * 2 - 1) * xs * k}px ${(Math.random() * 2 - 1) * ys * k}px`;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    if (bool(a.block)) await run;
  }
  async cameraEffect(a) {
    const eff = String(a.effect || '').toLowerCase(), amt = num(a.amount, 0), fade = this.t(num(a.fadetime, 0));
    if (eff === 'grayscale') this.effects.gray = amt; else if (eff === 'colorinverse') this.effects.invert = amt; else return;
    this.scene.style.transition = `filter ${fade}s`;
    this.scene.style.filter = `grayscale(${this.effects.gray}) invert(${this.effects.invert})`;
    if (bool(a.block) && fade) await sleep(fade * 1000);
  }
  showLog() {
    const p = $('#pLogPanel'), list = p.querySelector('.log-list');
    list.innerHTML = this.log.slice(-300).map(l => `<div class="log-row${l.name ? '' : ' narr'}">${l.name ? `<b>${esc(sv(l.name))}</b>` : ''}<p>${richText(l.text)}</p></div>`).join('');
    p.hidden = false; list.scrollTop = list.scrollHeight;
    p.querySelector('button').onclick = e => { e.stopPropagation(); p.hidden = true; };
  }
}
function setXform(im) {
  const d = im.dataset;
  im.style.transform = `translate(${+d.x || 0}px, ${-(+d.y || 0)}px) scale(${d.xs ?? 1}, ${d.ys ?? 1})`;
}
function layoutStage() {
  const wrap = $('#stageWrap'), st = $('#stage');
  const W = wrap.clientWidth, H = wrap.clientHeight;
  const s = Math.min(W / 1280, H / 720);
  st.style.transform = `translate(${(W - 1280 * s) / 2}px, ${(H - 720 * s) / 2}px) scale(${s})`;
}

/* ---------- library UI ---------- */
let currentCat = store.get('cat', 'ORDER'), query = '';
function setStatus() {
  const on = navigator.onLine;
  $('#net').textContent = on ? 'Online' : 'Offline';
  $('#net').className = 'net ' + (on ? 'on' : 'off');
}
async function storageLine() {
  const total = Object.values(groupsMeta).reduce((n, m) => n + (m.bytes || 0), 0);
  let q = '';
  try { const e = await navigator.storage.estimate(); if (e.quota) q = ` · ${fmtBytes(e.quota - e.usage)} free for this app`; } catch {}
  $('#storage').textContent = `${Object.keys(groupsMeta).length} downloaded · ${fmtBytes(total)}${q}`;
}
function renderTabs() {
  const t = $('#tabs'); t.innerHTML = '';
  CATS.forEach(c => {
    const b = el('button', 'tab' + (c.id === currentCat ? ' on' : ''), esc(c.label));
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', c.id === currentCat);
    b.onclick = () => { currentCat = c.id; store.set('cat', c.id); renderTabs(); renderList(); };
    t.append(b);
  });
}
function renderList() {
  if (currentCat === 'ORDER') return renderOrder();
  const box = $('#list'); box.innerHTML = '';
  const q = query.trim().toLowerCase();
  const onlyDl = $('#onlyDl').checked;
  let gs = sortedGroups(currentCat);
  if (q) gs = gs.filter(g => g.name.toLowerCase().includes(q) || stories(g).some(s => (s.storyName || '').toLowerCase().includes(q)));
  if (onlyDl) gs = gs.filter(g => groupsMeta[g.id]);
  if (!gs.length) { box.append(el('p', 'empty', onlyDl ? 'Nothing downloaded in this section yet.' : 'No matches.')); return; }
  for (const g of gs) {
    const m = groupsMeta[g.id];
    const row = el('button', 'grow');
    row.innerHTML = `<span class="g-kicker">${esc(groupLabel(g))}</span><span class="g-name">${esc(g.name)}</span>
      <span class="g-meta">${stories(g).length} parts${m ? ` · <span class="${m.complete ? 'ok' : 'warn'}">${m.complete ? 'Offline' : 'Incomplete'} · ${fmtBytes(m.bytes)}</span>` : ''}</span>`;
    row.onclick = () => renderGroup(g.id);
    box.append(row);
  }
}
async function renderGroup(id, ctx) {
  const g = REVIEW[id]; if (!g) return;
  $('#libView').hidden = true; const v = $('#groupView'); v.hidden = false; window.scrollTo(0, 0);
  if (ctx === undefined && renderGroup.last?.id === id) ctx = renderGroup.last.ctx;   // returning from the reader
  renderGroup.last = { id, ctx };
  const m = groupsMeta[g.id];
  const entry = ctx ? ORDER[ctx.view][ctx.index] : null;
  const range = entry ? entryRange(entry) : null;
  const all = stories(g), a = range ? range.a : 0, b = range ? range.b : all.length;
  const readN = all.slice(a, b).filter(s => doneSet.has(storyKey(s))).length;
  v.innerHTML = `
    <button class="back" id="back">‹ ${ctx ? 'Reading order' : 'All stories'}</button>
    <header class="gh"><span class="g-kicker">${ctx ? `#${ctx.index + 1} in ${ORDER_VIEWS[ctx.view].toLowerCase()} order · ` : ''}${esc(groupLabel(g))}</span><h2>${esc(entry ? entry.title : g.name)}</h2>
      <p class="gh-meta">${readN} of ${b - a} read${m ? ` · downloaded ${new Date(m.date).toLocaleDateString()} · ${fmtBytes(m.bytes)}${m.failed ? ` · <span class="warn">${m.failed} files still to download</span>` : ''}` : ''}</p></header>
    ${entry?.note ? `<p class="entry-note">${esc(entry.note)}</p>` : ''}
    <div class="dlbox">
      <button class="btn primary" id="dlBtn">${m ? (m.complete ? 'Check for missing files' : 'Resume download') : 'Download for offline'}</button>
      ${m ? '<button class="btn" id="delBtn">Remove download</button>' : ''}
      <div class="prog" id="prog" hidden><div class="hazard"><i></i></div><span></span></div>
      <div class="confirm" id="confirmDel" hidden><span>Delete this story's files from your phone?</span><button class="btn danger" id="delYes">Delete</button><button class="btn" id="delNo">Keep</button></div>
    </div>
    ${range && (a > 0 || b < all.length) ? `<p class="entry-note">This entry covers chapters ${esc(all[a].storyCode)} to ${esc(all[b - 1].storyCode)}. The rest of the episode is listed elsewhere in the order.</p>` : ''}
    <ol class="stories" id="stories"></ol>`;
  $('#back').onclick = () => { renderGroup.last = null; if (ctx) renderOrderBack(); else { v.hidden = true; $('#libView').hidden = false; renderList(); storageLine(); } };
  $('#dlBtn').onclick = () => startDownload(g);
  if (m) {
    $('#delBtn').onclick = () => { $('#confirmDel').hidden = false; };
    $('#delNo').onclick = () => { $('#confirmDel').hidden = true; };
    $('#delYes').onclick = async () => { await deleteGroup(g.id); renderGroup(g.id, ctx); };
  }
  const ol = $('#stories');
  const pos = store.get('pos', {});
  for (let k = a; k < b; k++) {
    const s = all[k], li = el('li');
    const here = pos.group === g.id && pos.idx === k && pos.line > 0, read = doneSet.has(storyKey(s));
    li.innerHTML = `<button class="srow${read ? ' read' : ''}"><span class="s-code">${esc(s.storyCode || String(k + 1).padStart(2, '0'))}</span>
      <span class="s-name">${esc(s.storyName)}${s.avgTag ? `<em>${esc(s.avgTag)}</em>` : ''}</span>
      <span class="s-state">${here ? '<b class="warn">Resume</b>' : read ? '<b class="ok">✓ Read</b>' : ''}<small data-k="${k}"></small></span></button>`;
    li.querySelector('button').onclick = () => openReader(g, k, ctx ? b : undefined, ctx ? { view: ctx.view, index: ctx.index, entry } : undefined);
    ol.append(li);
  }
  for (const sm of ol.querySelectorAll('small[data-k]')) {
    if (await storySaved(all[+sm.dataset.k])) sm.textContent = 'Saved'; else if (m) { sm.textContent = 'Not saved'; sm.classList.add('warn'); }
  }
  if (dl.active === g.id) attachProgress();
}
function attachProgress() {
  const p = $('#prog'); if (!p) return;
  p.hidden = false; $('#dlBtn').disabled = true; $('#dlBtn').textContent = 'Downloading…';
  const ds = dl.state || { phase: 'Starting', done: 0, total: 1, bytes: 0 };
  p.querySelector('i').style.width = (ds.total ? ds.done / ds.total * 100 : 0) + '%';
  const paused = document.hidden || !navigator.onLine;
  p.querySelector('span').textContent = paused ? 'Paused: reconnect to wifi and keep this screen open'
    : `${ds.phase}: ${ds.done} / ${ds.total} · ${fmtBytes(ds.bytes)} · keep the app open until it finishes`;
}
async function startDownload(g) {
  if (dl.active) return;
  dl.active = g.id; dl.cancel = false;
  try { await navigator.storage?.persist?.(); } catch {}
  attachProgress();
  holdAwake(true);
  const onVis = () => { if (!document.hidden) holdAwake(true); };
  document.addEventListener('visibilitychange', onVis);
  try {
    const r = await downloadGroup(g, st => { dl.state = st; if (!$('#groupView').hidden && $('#prog')) attachProgress(); });
    dl.active = null; dl.state = null;
    if (r.failed) toast(`${r.failed} files didn't finish downloading. Tap Resume download on wifi before going offline.`);
    else toast(`Saved ${g.name} for offline · ${fmtBytes(r.bytes)}`);
  } catch (e) {
    dl.active = null; dl.state = null; toast(e.message || 'Download stopped. Tap Resume download on wifi.');
  }
  document.removeEventListener('visibilitychange', onVis);
  holdAwake(false);
  if (!$('#groupView').hidden) renderGroup(g.id);
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 4200); }

async function openReader(g, idx, stopAt, orderCtx) {
  audio.init();                         // must happen inside the tap for iOS
  document.body.classList.add('reading');
  $('#player').hidden = false;
  try { await screen.orientation?.lock?.('landscape'); } catch {}
  $('#choices').hidden = true; $('#pLogPanel').hidden = true;
  await loadVars();
  const p = new Player(g, idx, stopAt);
  p.orderCtx = orderCtx || null;
  p.syncButtons();
  p.start();
}


/* ---------- reading order (MajorArcana01's guide) ---------- */
let ORDER = null, orderView = store.get('orderView', 'timeline');
let manualDone = new Set(store.get('manualDone', []));    // entries ticked by hand (in-game modes, or anything)
const ORDER_VIEWS = { timeline: 'Chronological', release: 'Release' };
async function loadOrder() { try { ORDER = await (await fetch('reading-order.json')).json(); } catch { ORDER = null; } }
/* The chapters an entry covers; Episode 15 is split around 15-3 in the timeline. */
function entryRange(e) {
  const g = REVIEW[e.group]; if (!g) return null;
  const list = stories(g); let a = 0, b = list.length;
  if (e.until) { const k = list.findIndex(s => s.storyCode === e.until); if (k > 0) b = k; }
  if (e.from) { const k = list.findIndex(s => s.storyCode === e.from); if (k >= 0) a = k; }
  return { g, list, a, b };
}
const entryKey = (view, i) => view + ':' + i + ':' + (ORDER[view][i].group || ORDER[view][i].title);
function entryProgress(view, i) {
  const e = ORDER[view][i];
  if (e.mode || !REVIEW[e.group]) return { total: 0, read: 0, done: manualDone.has(e.title) };
  const r = entryRange(e), part = r.list.slice(r.a, r.b);
  const read = part.filter(s => doneSet.has(storyKey(s))).length;
  return { total: part.length, read, done: manualDone.has(e.title) || (part.length > 0 && read === part.length), r };
}
function nextEntryAfter(view, i) {
  for (let k = i + 1; k < ORDER[view].length; k++) if (!entryProgress(view, k).done) return { entry: ORDER[view][k], index: k };
  return null;
}
function firstUnfinished(view) {
  for (let k = 0; k < ORDER[view].length; k++) if (!entryProgress(view, k).done) return k;
  return -1;
}
function openEntry(view, i) {
  const e = ORDER[view][i], p = entryProgress(view, i);
  if (!p.r) { renderEntrySheet(view, i); return; }
  const { g, list, a, b } = p.r;
  let k = a; while (k < b - 1 && doneSet.has(storyKey(list[k]))) k++;
  openReader(g, k, b, { view, index: i, entry: e });
}
function renderOrderBack() { $('#groupView').hidden = true; $('#libView').hidden = false; currentCat = 'ORDER'; renderTabs(); renderList(); storageLine(); }
function renderOrder() {
  const box = $('#list'); box.innerHTML = '';
  if (!ORDER) { box.append(el('p', 'empty', 'Reading order unavailable. Reload once while online.')); return; }
  const list = ORDER[orderView], q = query.trim().toLowerCase(), onlyDl = $('#onlyDl').checked;
  const doneN = list.filter((_, i) => entryProgress(orderView, i).done).length;
  const head = el('div', 'order-head');
  head.innerHTML = `<div class="seg" role="radiogroup" aria-label="Order">${Object.entries(ORDER_VIEWS).map(([k, v]) =>
      `<button role="radio" aria-checked="${k === orderView}" class="${k === orderView ? 'on' : ''}" data-v="${k}">${v}</button>`).join('')}</div>
    <div class="order-prog"><div class="bar"><i style="width:${(doneN / list.length * 100).toFixed(1)}%"></i></div><span>${doneN} of ${list.length} read</span></div>
    <p class="order-src">Order from ${esc(ORDER.source)}.${orderView === 'release' ? ' English server release order; crossover events are left out.' : ''}</p>`;
  head.querySelectorAll('.seg button').forEach(b => b.onclick = () => { orderView = b.dataset.v; store.set('orderView', orderView); renderOrder(); });
  box.append(head);
  const nx = firstUnfinished(orderView);
  if (nx >= 0 && !q) {
    const e = list[nx], p = entryProgress(orderView, nx);
    const c = el('button', 'continue');
    c.innerHTML = `<span class="g-kicker">Continue · #${nx + 1}</span><span class="g-name">${esc(e.title)}</span>
      <span class="g-meta">${e.mode ? 'Played in-game (' + esc(e.mode) + ')' : p.read ? `${p.read} of ${p.total} chapters read` : 'Start here'}</span>`;
    c.onclick = () => openEntry(orderView, nx);
    box.append(c);
  }
  const ol = el('ol', 'order');
  list.forEach((e, i) => {
    if (q && !e.title.toLowerCase().includes(q)) return;
    if (onlyDl && !(e.group && groupsMeta[e.group])) return;
    const p = entryProgress(orderView, i), m = e.group && groupsMeta[e.group];
    const li = el('li', 'oe' + (p.done ? ' done' : '') + (i === nx ? ' next' : ''));
    const g = REVIEW[e.group];
    const kind = e.mode ? e.mode : g ? groupLabel(g) : 'Not in the English data yet';
    const state = p.done ? '<span class="ok">Read</span>' : p.read ? `<span class="warn">${p.read}/${p.total}</span>` : '';
    li.innerHTML = `<button class="oe-main"><span class="oe-n">${i + 1}</span>
        <span class="oe-body"><span class="g-kicker">${esc(kind)}</span><span class="oe-title">${esc(e.title)}</span>
        ${e.note ? `<span class="oe-note">${esc(e.note)}</span>` : ''}</span>
        <span class="oe-state">${state}${m ? `<span class="${m.complete ? 'ok' : 'warn'} oe-dl">${m.complete ? 'Offline' : 'Partial'}</span>` : ''}</span></button>
      <button class="oe-check" aria-label="${p.done ? 'Mark unread' : 'Mark read'}" aria-pressed="${p.done}">${p.done ? '✓' : ''}</button>`;
    li.querySelector('.oe-main').onclick = () => renderEntrySheet(orderView, i);
    li.querySelector('.oe-check').onclick = () => toggleEntryDone(orderView, i);
    ol.append(li);
  });
  box.append(ol);
  if (orderView === 'timeline' && !q) {
    const tl = new Set(ORDER.timeline.map(e => e.group || e.title));
    const undated = ORDER.release.filter(e => !tl.has(e.group || e.title) && e.group !== 'main_15');
    const f = el('section', 'undated');
    f.innerHTML = `<h3>Not placed on the timeline</h3><p>The guide gives no date for these. Its suggestions: ${ORDER.undated.map(esc).join(' ')}</p>
      <ul>${undated.map(e => `<li><button data-g="${esc(e.group || '')}">${esc(e.title)}</button></li>`).join('')}</ul>`;
    f.querySelectorAll('button[data-g]').forEach(b => { if (b.dataset.g) b.onclick = () => renderGroup(b.dataset.g); });
    box.append(f);
  }
}
function toggleEntryDone(view, i) {
  const e = ORDER[view][i], p = entryProgress(view, i);
  if (p.done) {
    manualDone.delete(e.title);
    if (p.r) p.r.list.slice(p.r.a, p.r.b).forEach(s => markDone(s, false));
  } else {
    if (p.r) p.r.list.slice(p.r.a, p.r.b).forEach(s => markDone(s, true)); else manualDone.add(e.title);
  }
  store.set('manualDone', [...manualDone]);
  renderOrder();
}
/* Entry sheet: reuse the chapter view for real stories; in-game modes get a short card. */
function renderEntrySheet(view, i) {
  const e = ORDER[view][i];
  if (e.group && REVIEW[e.group]) { renderGroup(e.group, { view, index: i }); return; }
  $('#libView').hidden = true; const v = $('#groupView'); v.hidden = false; window.scrollTo(0, 0);
  const done = manualDone.has(e.title);
  v.innerHTML = `<button class="back" id="back">‹ Reading order</button>
    <header class="gh"><span class="g-kicker">#${i + 1} · ${esc(e.mode || 'Story')}</span><h2>${esc(e.title)}</h2>
    <p class="gh-meta">${e.mode ? `This story is told inside the ${esc(e.mode)} game mode, so it's played in Arknights itself rather than read here.` : 'This story isn\'t in the English story data yet.'}</p></header>
    ${e.note ? `<p class="entry-note">${esc(e.note)}</p>` : ''}
    <div class="dlbox"><button class="btn ${done ? '' : 'primary'}" id="tick">${done ? 'Mark as unread' : 'Mark as read'}</button></div>`;
  $('#back').onclick = renderOrderBack;
  $('#tick').onclick = () => { done ? manualDone.delete(e.title) : manualDone.add(e.title); store.set('manualDone', [...manualDone]); renderOrderBack(); };
}

/* ---------- settings sheet ---------- */
function bindSettings() {
  const sh = $('#settingsSheet');
  $('#openSettings').onclick = () => { sh.hidden = false; };
  sh.querySelector('.close').onclick = () => { sh.hidden = true; };
  const bindRange = (id, key, fmt) => {
    const i = $(id), out = i.nextElementSibling;
    i.value = settings[key]; out.textContent = fmt(settings[key]);
    i.oninput = () => { settings[key] = +i.value; out.textContent = fmt(+i.value); saveSettings(); };
  };
  bindRange('#sSpeed', 'textSpeed', v => v === 0 ? 'Instant' : v + ' ms/char');
  bindRange('#sAuto', 'autoDelay', v => v.toFixed(1) + ' s');
  bindRange('#sMusic', 'music', v => Math.round(v * 100) + '%');
  bindRange('#sSfx', 'sfx', v => Math.round(v * 100) + '%');
  const nn = $('#sNick'); nn.value = settings.nickname; nn.oninput = () => { settings.nickname = nn.value || 'Doctor'; saveSettings(); };
  $('#idxDate').textContent = IDX?.built || '';
}

/* ---------- boot ---------- */
async function boot() {
  setStatus(); addEventListener('online', setStatus); addEventListener('offline', setStatus);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!standalone && /iPhone|iPad/.test(navigator.userAgent)) $('#installHint').hidden = false;
  $('#installHint .x').onclick = () => { $('#installHint').hidden = true; };
  try { await loadIndex(); } catch { $('#list').innerHTML = '<p class="empty">Could not load the asset index. Reload once while online.</p>'; return; }
  bindSettings();
  $('#search').oninput = e => { query = e.target.value; renderList(); };
  $('#onlyDl').onchange = renderList;
  $('#onlyDl').checked = !navigator.onLine;
  try { REVIEW = await cachedJSON(REVIEW_URL); }
  catch { $('#list').innerHTML = '<p class="empty">Open the app once while online to load the story list.</p>'; return; }
  loadVars();
  await loadOrder();
  if (!navigator.onLine) {   // offline: open on a section that actually has downloads
    const has = id => id === 'ORDER' || Object.keys(groupsMeta).some(g => REVIEW[g]?.entryType === id);
    if (!has(currentCat)) currentCat = (CATS.find(c => has(c.id)) || CATS[0]).id;
  }
  renderTabs(); renderList(); storageLine();
  $('#refreshList').onclick = async () => {
    if (!navigator.onLine) return toast('Connect to the internet to check for new stories.');
    await (await cache()).delete(REVIEW_URL); await (await cache()).delete(VARS_URL);
    REVIEW = await cachedJSON(REVIEW_URL); await loadVars(); renderList(); toast('Story list updated.');
  };
}
if (typeof document !== 'undefined') boot();
if (typeof module !== 'undefined') module.exports = { parseScript, collectAssets, CAND, sv, setIdx: i => { IDX = i; IDX.npc.forEach(n => NPC.set(n.toLowerCase(), n)); IDX.ace.forEach(n => ACESET.set(n.toLowerCase(), n)); IDX.snd.forEach(n => SNDSET.set(n.toLowerCase(), n)); }, setVars: v => { VARS = v; } };
