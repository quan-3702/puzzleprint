const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FREE_WS = 12, FREE_CW = 8, FREE_CARDS = 4, FREE_SIZE = 15, MAX_WORDS = 40;
const STORE_BILLING = 'https://store.microsoft.com/billing';
const PRO_SKU = 'puzzleprint_pro';
const PRO_IDS = [PRO_SKU];
let STORE_URL = 'https://apps.microsoft.com/search?query=PuzzlePrint';
let proAvailable = false; // Pro limits apply only when the Store actually sells the add-on
let proSku = PRO_SKU;
let isPro = false;
try { isPro = localStorage.getItem('puzzleprint-pro') === '1'; } catch (_) {}
const unlocked = () => isPro || !proAvailable;

async function billing() {
  if (!('getDigitalGoodsService' in window)) return null;
  try { return await window.getDigitalGoodsService(STORE_BILLING); } catch (_) { return null; }
}
function setPro(v) {
  isPro = v;
  try { localStorage.setItem('puzzleprint-pro', v ? '1' : '0'); } catch (_) {}
  const b = $('proBtn');
  b.textContent = v ? '★ Pro' : '★ Get Pro';
  b.classList.toggle('is-pro', v);
  b.hidden = !proAvailable && !v;
  document.body.classList.toggle('unlocked', unlocked());
  if (typeof renderAll === 'function') renderAll();
}
async function checkPro() {
  const svc = await billing();
  if (!svc) return false;
  try {
    const details = await svc.getDetails(PRO_IDS).catch(() => []);
    proAvailable = details.length > 0;
    if (details[0]) { proSku = details[0].itemId; if (!PRO_IDS.includes(proSku)) PRO_IDS.push(proSku); }
    const list = await svc.listPurchases();
    const owned = list.some((p) => PRO_IDS.includes(p.itemId));
    setPro(owned);
    return owned;
  } catch (_) { return isPro; }
}
function proMessage(text) { const m = $('proMsg'); m.hidden = !text; m.textContent = text || ''; }
async function openPro(reason) {
  proMessage(reason || '');
  const svc = await billing();
  if (!svc) {
    $('buyBtn').textContent = 'Get PuzzlePrint on Microsoft Store';
    $('restoreBtn').hidden = true;
  } else {
    $('restoreBtn').hidden = false;
    try {
      const [d] = await svc.getDetails([proSku]);
      const price = d && d.price ? new Intl.NumberFormat(undefined, { style: 'currency', currency: d.price.currency }).format(Number(d.price.value)) : '';
      $('buyBtn').textContent = price ? `Unlock Pro – ${price}` : 'Unlock Pro';
    } catch (_) { $('buyBtn').textContent = 'Unlock Pro'; }
  }
  if (!$('proDialog').open) $('proDialog').showModal();
}
async function buyPro() {
  const svc = await billing();
  if (!svc) { window.open(STORE_URL, '_blank'); return; }
  const methods = [{ supportedMethods: STORE_BILLING, data: { sku: proSku } }];
  try {
    let req;
    try { req = new PaymentRequest(methods); }
    catch (_) { req = new PaymentRequest(methods, { total: { label: 'Total', amount: { currency: 'USD', value: '0' } } }); }
    const res = await req.show();
    await res.complete('success');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    proMessage('Purchase could not be completed: ' + (e.message || e));
    return;
  }
  if (await checkPro()) { proMessage('Thank you! Pro is unlocked. ★'); setTimeout(() => $('proDialog').close(), 1500); }
}
function needsPro(reason) {
  if (unlocked()) return false;
  openPro(reason);
  return true;
}


// ---------- state ----------
const SAMPLES = {
  ws: { title: 'In the Garden', words: 'TULIP\nDAISY\nROSE\nSUNFLOWER\nBUTTERFLY\nSPADE\nWATERING CAN\nSEEDS\nROBIN\nLADYBUG\nTOMATO\nFENCE' },
  cw: { title: 'Around the House', words: 'KITCHEN: Where meals are cooked\nGARDEN: Flowers grow here\nWINDOW: You look through it\nSTAIRS: They take you up and down\nCHIMNEY: Smoke leaves through it\nCARPET: It covers the floor\nMIRROR: It shows your face\nGARAGE: Home for the car' },
  bingo: { title: 'Family Bingo Night', words: 'Apple\nBanana\nCherry\nGrapes\nLemon\nOrange\nPeach\nPear\nPlum\nMelon\nKiwi\nMango\nCarrot\nPotato\nTomato\nOnion\nPepper\nCorn\nBeans\nPeas\nBread\nCheese\nMilk\nEggs\nHoney\nRice' },
};
const blank = () => ({ type: 'ws', paper: 'letter', size: 12, cards: 4, per: 1, diag: true, back: false, freeSq: true, key: true, nameLine: false, seed: 1,
  lists: { ws: { ...SAMPLES.ws }, cw: { ...SAMPLES.cw }, bingo: { ...SAMPLES.bingo } } });
let st = blank();
try { const s = JSON.parse(localStorage.getItem('puzzleprint') || 'null'); if (s && s.lists) st = Object.assign(blank(), s); } catch (_) {}
let saveTimer;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem('puzzleprint', JSON.stringify(st)); } catch (_) {} }, 300); }
const cur = () => st.lists[st.type];

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffled(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const letters = (s) => Array.from(String(s).toLocaleUpperCase().replace(/[^\p{L}]/gu, ''));

// entries: [{label, word:[letters], clue}]
function entries() {
  const seen = new Set(); const out = [];
  for (const raw of cur().words.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    let label = line, clue = '';
    if (st.type === 'cw') { const i = line.search(/[:=\t]/); if (i > 0) { label = line.slice(0, i).trim(); clue = line.slice(i + 1).trim(); } }
    if (st.type === 'bingo') { const k = label.toLocaleLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push({ label }); continue; }
    const word = letters(label); if (word.length < 2) continue;
    const k = word.join(''); if (seen.has(k)) continue; seen.add(k);
    out.push({ label: label.toLocaleUpperCase(), word, clue: clue || label });
    if (out.length >= MAX_WORDS) break;
  }
  return out;
}

// ---------- word search ----------
function makeWordSearch(list, n, r) {
  const g = Array.from({ length: n }, () => Array(n).fill(''));
  let dirs = [[0, 1], [1, 0]];
  if (st.diag) dirs.push([1, 1], [-1, 1]);
  if (st.back) dirs = dirs.concat(dirs.map(([a, b]) => [-a, -b]));
  const placed = [], skipped = [];
  for (const e of list.slice().sort((a, b) => b.word.length - a.word.length)) {
    const L = e.word.length; let ok = false;
    for (let t = 0; t < 400 && !ok && L <= n; t++) {
      const [dr, dc] = dirs[Math.floor(r() * dirs.length)];
      const r0 = Math.floor(r() * n), c0 = Math.floor(r() * n);
      const r1 = r0 + dr * (L - 1), c1 = c0 + dc * (L - 1);
      if (r1 < 0 || r1 >= n || c1 < 0 || c1 >= n) continue;
      let fit = true;
      for (let i = 0; i < L && fit; i++) { const ch = g[r0 + dr * i][c0 + dc * i]; if (ch && ch !== e.word[i]) fit = false; }
      if (!fit) continue;
      for (let i = 0; i < L; i++) g[r0 + dr * i][c0 + dc * i] = e.word[i];
      placed.push({ e, r0, c0, r1, c1 }); ok = true;
    }
    if (!ok) skipped.push(e.label);
  }
  const used = new Set(list.flatMap((e) => e.word));
  const plain = [...used].every((ch) => /[A-Z]/.test(ch));
  const alpha = plain ? Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ') : [...used];
  const fill = g.map((row) => row.map((ch) => ch || alpha[Math.floor(r() * alpha.length)]));
  return { n, grid: fill, placed, skipped };
}

// ---------- crossword ----------
function tryCrossword(list, r) {
  const N = 44, g = Array.from({ length: N }, () => Array(N).fill('')), d = Array.from({ length: N }, () => Array(N).fill(''));
  const placed = [];
  const at = (y, x) => (y < 0 || x < 0 || y >= N || x >= N ? '' : g[y][x]);
  const can = (w, y, x, dir) => {
    const dy = dir === 'd' ? 1 : 0, dx = dir === 'a' ? 1 : 0, L = w.length;
    if (y < 1 || x < 1 || y + dy * L >= N - 1 || x + dx * L >= N - 1) return -1;
    if (at(y - dy, x - dx) || at(y + dy * L, x + dx * L)) return -1;
    let cross = 0;
    for (let i = 0; i < L; i++) {
      const yy = y + dy * i, xx = x + dx * i, ch = g[yy][xx];
      if (ch) { if (ch !== w[i] || d[yy][xx].includes(dir)) return -1; cross++; }
      else if (at(yy + dx, xx + dy) || at(yy - dx, xx - dy)) return -1;
    }
    return cross;
  };
  const put = (e, y, x, dir) => {
    const dy = dir === 'd' ? 1 : 0, dx = dir === 'a' ? 1 : 0;
    e.word.forEach((ch, i) => { g[y + dy * i][x + dx * i] = ch; d[y + dy * i][x + dx * i] += dir; });
    placed.push({ e, y, x, dir });
  };
  const order = list.slice().sort((a, b) => b.word.length - a.word.length || r() - 0.5);
  let rest = order.slice(1);
  put(order[0], N >> 1, (N - order[0].word.length) >> 1, 'a');
  for (let pass = 0; pass < 3 && rest.length; pass++) {
    const left = [];
    for (const e of rest) {
      let best = null;
      for (const p of placed) {
        const dir = p.dir === 'a' ? 'd' : 'a';
        for (let i = 0; i < p.e.word.length; i++) for (let j = 0; j < e.word.length; j++) {
          if (p.e.word[i] !== e.word[j]) continue;
          const y = p.dir === 'a' ? p.y - j : p.y + i, x = p.dir === 'a' ? p.x + i : p.x - j;
          const c = can(e.word, y, x, dir);
          if (c < 1) continue;
          const score = c + r() * 0.5;
          if (!best || score > best.score) best = { y, x, dir, score };
        }
      }
      if (best) put(e, best.y, best.x, best.dir); else left.push(e);
    }
    rest = left;
  }
  return { placed, skipped: rest.map((e) => e.label) };
}
function makeCrossword(list, r) {
  let best = null;
  for (let t = 0; t < 30; t++) {
    const c = tryCrossword(list, r);
    if (!best || c.placed.length > best.placed.length) best = c;
    if (!best.skipped.length) break;
  }
  const ys = [], xs = [];
  best.placed.forEach((p) => { ys.push(p.y, p.y + (p.dir === 'd' ? p.e.word.length - 1 : 0)); xs.push(p.x, p.x + (p.dir === 'a' ? p.e.word.length - 1 : 0)); });
  const y0 = Math.min(...ys), x0 = Math.min(...xs), rows = Math.max(...ys) - y0 + 1, cols = Math.max(...xs) - x0 + 1;
  const cells = {};
  best.placed.forEach((p) => { p.y -= y0; p.x -= x0; p.e.word.forEach((ch, i) => { cells[(p.y + (p.dir === 'd' ? i : 0)) + ',' + (p.x + (p.dir === 'a' ? i : 0))] = ch; }); });
  let num = 0; const nums = {};
  best.placed.slice().sort((a, b) => a.y - b.y || a.x - b.x).forEach((p) => { const k = p.y + ',' + p.x; if (!nums[k]) nums[k] = ++num; p.num = nums[k]; });
  return { rows, cols, cells, nums, placed: best.placed, skipped: best.skipped };
}

// ---------- pages (SVG, in points) ----------
const pageSize = () => (st.paper === 'a4' ? { w: 595, h: 842 } : { w: 612, h: 792 });
const FONT = 'Segoe UI, Arial, sans-serif';
function head(w, title, sub) {
  let s = '', y = 62;
  if (st.nameLine) { s += `<text x="48" y="44" font-size="12" fill="#333">Name: ______________________________</text><text x="${w - 48}" y="44" font-size="12" fill="#333" text-anchor="end">Date: ________________</text>`; y = 84; }
  s += `<text x="${w / 2}" y="${y}" font-size="26" font-weight="700" text-anchor="middle" fill="#111">${esc(title)}</text>`;
  if (sub) s += `<text x="${w / 2}" y="${y + 20}" font-size="12" text-anchor="middle" fill="#555">${esc(sub)}</text>`;
  return { s, y: y + (sub ? 34 : 18) };
}
const wrapSvg = (w, h, body) => ({ w, h, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${FONT}"><rect width="${w}" height="${h}" fill="#fff"/>${body}</svg>` });
function wrapText(text, max) { const out = []; let line = ''; for (const wd of String(text).split(/\s+/)) { if (line && (line + ' ' + wd).length > max) { out.push(line); line = wd; } else line = line ? line + ' ' + wd : wd; } if (line) out.push(line); return out; }

function wsPages(ws, title) {
  const { w, h } = pageSize(), n = ws.n, pages = [];
  const draw = (answers) => {
    const hd = head(w, answers ? title + ' – Answer key' : title, answers ? '' : 'Find the hidden words. They can go ' + ['across', 'down'].concat(st.diag ? ['diagonally'] : [], st.back ? ['backward'] : []).join(', ').replace(/, ([^,]*)$/, ' and $1') + '.');
    const words = ws.placed.map((p) => p.e.label).sort((a, b) => a.localeCompare(b));
    const colsW = words.some((x) => x.length > 14) ? 3 : 4, fs = words.length > 24 ? 11 : 13, lh = fs * 1.55;
    const listH = Math.ceil(words.length / colsW) * lh + 18;
    const gs = Math.min(w - 96, h - hd.y - listH - 40), cell = gs / n, gx = (w - gs) / 2, gy = hd.y + 4;
    let s = hd.s + `<rect x="${gx}" y="${gy}" width="${gs}" height="${gs}" fill="none" stroke="#111" stroke-width="1.5" rx="6"/>`;
    if (answers) for (const p of ws.placed) s += `<line x1="${gx + (p.c0 + .5) * cell}" y1="${gy + (p.r0 + .5) * cell}" x2="${gx + (p.c1 + .5) * cell}" y2="${gy + (p.r1 + .5) * cell}" stroke="#4f46e5" stroke-opacity=".3" stroke-width="${cell * .72}" stroke-linecap="round"/>`;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) s += `<text x="${(gx + (c + .5) * cell).toFixed(1)}" y="${(gy + (r + .5) * cell + cell * .22).toFixed(1)}" font-size="${(cell * .6).toFixed(1)}" text-anchor="middle" fill="#111">${esc(ws.grid[r][c])}</text>`;
    const ly = gy + gs + 30, cw = (w - 96) / colsW;
    words.forEach((wd, i) => { s += `<text x="${48 + (i % colsW) * cw + 4}" y="${ly + Math.floor(i / colsW) * lh}" font-size="${fs}" font-weight="600" fill="#111">${esc(wd)}</text>`; });
    return wrapSvg(w, h, s);
  };
  pages.push(draw(false)); if (st.key) pages.push(draw(true));
  return pages;
}
function cwPages(cw, title) {
  const { w, h } = pageSize(), pages = [];
  const draw = (answers) => {
    const hd = head(w, answers ? title + ' – Answer key' : title, '');
    const cell = Math.min((w - 96) / cw.cols, (h * (answers ? .7 : .46)) / cw.rows, 34), gx = (w - cell * cw.cols) / 2, gy = hd.y + 4;
    let s = hd.s;
    for (const k of Object.keys(cw.cells)) {
      const [r, c] = k.split(',').map(Number), x = gx + c * cell, y = gy + r * cell;
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="#fff" stroke="#111" stroke-width="1"/>`;
      if (cw.nums[k]) s += `<text x="${(x + 2).toFixed(1)}" y="${(y + cell * .3).toFixed(1)}" font-size="${(cell * .27).toFixed(1)}" fill="#111">${cw.nums[k]}</text>`;
      if (answers) s += `<text x="${(x + cell / 2).toFixed(1)}" y="${(y + cell * .78).toFixed(1)}" font-size="${(cell * .55).toFixed(1)}" text-anchor="middle" font-weight="600" fill="#3730a3">${esc(cw.cells[k])}</text>`;
    }
    if (!answers) {
      const top = gy + cell * cw.rows + 30, colW = (w - 96 - 20) / 2, total = cw.placed.length, fs = total > 26 ? 9.5 : total > 16 ? 11 : 12.5, lh = fs * 1.4, max = Math.floor(colW / (fs * .52));
      ['a', 'd'].forEach((dir, ci) => {
        let y = top; const x = 48 + ci * (colW + 20);
        s += `<text x="${x}" y="${y}" font-size="${fs + 3}" font-weight="700" fill="#111">${dir === 'a' ? 'Across' : 'Down'}</text>`; y += lh * 1.5;
        cw.placed.filter((p) => p.dir === dir).sort((a, b) => a.num - b.num).forEach((p) => {
          wrapText(p.num + '. ' + p.e.clue + ' (' + p.e.word.length + ')', max).forEach((ln, i) => { s += `<text x="${x + (i ? 14 : 0)}" y="${y.toFixed(1)}" font-size="${fs}" fill="#111">${esc(ln)}</text>`; y += lh; });
          y += lh * .25;
        });
      });
    }
    return wrapSvg(w, h, s);
  };
  pages.push(draw(false)); if (st.key) pages.push(draw(true));
  return pages;
}
function bingoPages(list, title, r) {
  const { w, h } = pageSize(), pages = [], per = st.per, count = st.cards;
  const labels = list.map((e) => e.label);
  const n = labels.length >= 24 ? 5 : labels.length >= 16 ? 4 : 3;
  const free = st.freeSq && n % 2 === 1, need = n * n - (free ? 1 : 0);
  if (labels.length < need) return { pages: [wrapSvg(w, h, head(w, title, 'Add at least 8 different words to make bingo cards.').s)], n };
  const cols = per === 4 ? 2 : 1, rows = per === 1 ? 1 : 2, bw = (w - 60) / cols, bh = (h - 60) / rows;
  const card = (bx, by) => {
    const pick = shuffled(labels, r).slice(0, need); if (free) pick.splice((n * n) >> 1, 0, null);
    const th = per === 1 ? 70 : 44, gs = Math.min(bw - 36, bh - th - 30), cell = gs / n, gx = bx + (bw - gs) / 2, gy = by + th;
    let s = `<text x="${bx + bw / 2}" y="${by + th - (per === 1 ? 26 : 16)}" font-size="${per === 1 ? 30 : per === 2 ? 22 : 17}" font-weight="700" text-anchor="middle" fill="#111">${esc(title)}</text>`;
    pick.forEach((lb, i) => {
      const x = gx + (i % n) * cell, y = gy + Math.floor(i / n) * cell;
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="${lb === null ? '#e6e8fd' : '#fff'}" stroke="#111" stroke-width="1.5"/>`;
      let lines = lb === null ? ['FREE'] : wrapText(lb, Math.max(8, Math.ceil(lb.length / 2))).slice(0, 3);
      const longest = Math.max(...lines.map((l) => l.length)), fs = Math.min(cell * .26, (cell * .88) / (longest * .58)), lh = fs * 1.15;
      lines.forEach((ln, k) => { s += `<text x="${(x + cell / 2).toFixed(1)}" y="${(y + cell / 2 + fs * .35 + (k - (lines.length - 1) / 2) * lh).toFixed(1)}" font-size="${fs.toFixed(1)}" font-weight="${lb === null ? 700 : 600}" text-anchor="middle" fill="${lb === null ? '#3730a3' : '#111'}">${esc(ln)}</text>`; });
    });
    return s;
  };
  for (let i = 0; i < count; i += per) {
    let s = '';
    for (let k = 0; k < per && i + k < count; k++) s += card(30 + (k % cols) * bw, 30 + Math.floor(k / cols) * bh);
    pages.push(wrapSvg(w, h, s));
  }
  if (st.key) { // call sheet
    const hd = head(w, title + ' – Call sheet', 'Cut these out or tick them off as you call them.');
    const c = 3, cwid = (w - 96) / c, sorted = labels.slice().sort((a, b) => a.localeCompare(b)), lh = Math.min(24, (h - hd.y - 60) / Math.ceil(sorted.length / c));
    let s = hd.s;
    sorted.forEach((lb, i) => { const x = 48 + (i % c) * cwid, y = hd.y + 20 + Math.floor(i / c) * lh; s += `<rect x="${x}" y="${y - 11}" width="12" height="12" fill="none" stroke="#111"/><text x="${x + 18}" y="${y}" font-size="${Math.min(13, lh * .6)}" fill="#111">${esc(lb.slice(0, 26))}</text>`; });
    pages.push(wrapSvg(w, h, s));
  }
  return { pages, n };
}

// ---------- build + render ----------
let pages = [], pageNo = 0, info = { count: 0, skipped: [] };
function build() {
  const list = entries(), r = rng(st.seed * 7919 + 13), title = cur().title.trim() || { ws: 'Word Search', cw: 'Crossword', bingo: 'Bingo' }[st.type];
  const { w, h } = pageSize();
  info = { count: list.length, skipped: [] };
  if (st.type !== 'bingo' && !list.length) pages = [wrapSvg(w, h, head(w, title, 'Type some words on the left to begin.').s)];
  else if (st.type === 'ws') { const ws = makeWordSearch(list, st.size, r); info.skipped = ws.skipped; pages = wsPages(ws, title); }
  else if (st.type === 'cw') { const cw = makeCrossword(list, r); info.skipped = cw.skipped; pages = cwPages(cw, title); }
  else pages = bingoPages(list, title, r).pages;
  pageNo = Math.min(pageNo, pages.length - 1);
}
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4000); }
function limitReason() { // why the current puzzle needs Pro, or ''
  if (st.type === 'ws' && info.count > FREE_WS) return `The free version prints word searches with up to ${FREE_WS} words. You have ${info.count}.`;
  if (st.type === 'ws' && st.size > FREE_SIZE) return `Grids larger than ${FREE_SIZE} letters are part of Pro.`;
  if (st.type === 'cw' && info.count > FREE_CW) return `The free version prints crosswords with up to ${FREE_CW} words. You have ${info.count}.`;
  if (st.type === 'bingo' && st.cards > FREE_CARDS) return `The free version prints up to ${FREE_CARDS} bingo cards at once.`;
  return '';
}
function renderPage() {
  $('page').innerHTML = pages[pageNo].svg;
  $('pager').textContent = pages.length > 1 ? `Page ${pageNo + 1} of ${pages.length}` : 'Preview';
  $('prev').disabled = pageNo === 0; $('next').disabled = pageNo >= pages.length - 1;
}
function renderAll() {
  const t = st.type;
  document.querySelectorAll('#types button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  $('title').value = cur().title; if ($('words').value !== cur().words) $('words').value = cur().words;
  ['paper', 'size', 'cards', 'per'].forEach((k) => { $(k).value = String(st[k]); });
  ['diag', 'back', 'freeSq', 'key', 'nameLine'].forEach((k) => { $(k).checked = !!st[k]; });
  $('sizeF').hidden = t !== 'ws'; $('wsOpts').hidden = t !== 'ws';
  $('cardsF').hidden = $('perF').hidden = $('freeF').hidden = t !== 'bingo';
  $('keyF').lastChild.textContent = t === 'bingo' ? ' Also print the call sheet' : ' Also print the answer key';
  $('wordsHead').textContent = t === 'cw' ? 'Words and clues' : 'Words';
  $('words').placeholder = t === 'cw' ? 'One per line, like this:\nKITCHEN: Where meals are cooked' : 'One word or phrase per line';
  build();
  const unit = t === 'bingo' ? 'different words' : 'words';
  $('hint').textContent = (t === 'cw' ? 'One per line – the word, a colon, then the clue. ' : 'One per line. ') + `${info.count} ${unit}.` + (t === 'bingo' ? ' 24 or more gives 5×5 cards.' : '');
  const warn = [];
  if (info.skipped.length) warn.push(`Could not fit: ${info.skipped.join(', ')}.` + (t === 'ws' ? ' Try a bigger grid.' : ' These share no letters with the others.'));
  const lim = unlocked() ? '' : limitReason(); if (lim) warn.push(lim + ' Pro removes this limit.');
  $('warn').hidden = !warn.length; $('warn').textContent = warn.join(' ');
  renderPage();
}

function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); toast(`Saved ${name} to your Downloads folder`); }
function printAll() {
  { const why = limitReason(); if (why && needsPro(why)) return; }
  $('pageRule').textContent = `@page { size: ${st.paper === 'a4' ? 'A4' : 'letter'} portrait; margin: 0; }`;
  $('printArea').innerHTML = pages.map((p) => p.svg.replace(/ width="[\d.]+" height="[\d.]+"/, ' preserveAspectRatio="xMidYMid meet"')).join('');
  window.print();
}
async function savePicture() {
  { const why = limitReason(); if (why && needsPro(why)) return; }
  const p = pages[pageNo], img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(p.svg);
  try { await img.decode(); } catch (_) { toast('Could not make the picture'); return; }
  const c = document.createElement('canvas'); c.width = p.w * 3; c.height = p.h * 3;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  c.toBlob((b) => download(b, (cur().title.trim() || 'puzzle').replace(/[^\p{L}\d]+/gu, '-') + (pages.length > 1 ? '-page' + (pageNo + 1) : '') + '.png'), 'image/png');
}


// ---------- events ----------
const change = () => { save(); renderAll(); };
document.querySelectorAll('#types button').forEach((b) => { b.onclick = () => { st.type = b.dataset.t; pageNo = 0; change(); }; });
$('title').oninput = () => { cur().title = $('title').value; change(); };
$('words').oninput = () => { cur().words = $('words').value; change(); };
['size', 'cards', 'per'].forEach((k) => { $(k).onchange = () => { st[k] = Number($(k).value); pageNo = 0; change(); }; });
$('paper').onchange = () => { st.paper = $('paper').value; change(); };
['diag', 'back', 'freeSq', 'key', 'nameLine'].forEach((k) => { $(k).onchange = () => { st[k] = $(k).checked; change(); }; });
$('shuffle').onclick = () => { st.seed = (st.seed % 100000) + 1; change(); };
$('prev').onclick = () => { if (pageNo > 0) { pageNo--; renderPage(); } };
$('next').onclick = () => { if (pageNo < pages.length - 1) { pageNo++; renderPage(); } };
$('printBtn').onclick = printAll;
$('imgBtn').onclick = savePicture;
$('moreBtn').onclick = (e) => { e.stopPropagation(); $('menu').hidden = !$('menu').hidden; };
document.addEventListener('click', () => { $('menu').hidden = true; });
$('sampleBtn').onclick = () => { st.lists[st.type] = { ...SAMPLES[st.type] }; change(); };
$('clearBtn').onclick = () => { if (confirm('Clear the title and all the words?')) { st.lists[st.type] = { title: '', words: '' }; change(); } };
$('openBtn').onclick = () => { const i = $('fileIn'); i.value = ''; i.onchange = async () => { if (i.files[0]) { cur().words = (await i.files[0].text()).slice(0, 20000); change(); toast('Word list loaded'); } }; i.click(); };
$('proBtn').onclick = () => { if (!isPro) openPro(''); };
$('buyBtn').onclick = buyPro;
$('restoreBtn').onclick = async () => { proMessage((await checkPro()) ? 'Pro is unlocked. ★' : 'No purchase was found on this Microsoft account.'); };
$('closePro').onclick = () => $('proDialog').close();

setPro(isPro);
checkPro();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
