'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const LS = 'bcl_v1';
const MAXR = 20000;

/* ---------- State ---------- */
const DEF = {
  rounds: [], ts: [], sr: [], gaps: [], total: 0, cap: { auto: 0, manual: 0, gaps: 0, lastAt: 0 },
  set: { win: 0, order: 'auto', det: null, selector: '', capture: false, autoFill: true },
  adv: { cfg: { start: 1000, target: 2, riskPct: 1, loseN: 4, cool: 5, minRounds: 100, slPct: 10, tpPct: 10, ddPct: 20, lowThr: 2, useFilter: false, z: 3, kelly: 0.25, gate: 'off', gateV: 2, exit: 'trend', rec: false, recMax: 2, recCap: 2, recGoal: 0.3, recBudget: 1.5, recPause: 4 }, st: null, log: [], armed: false }
};
let S = load();
(function fix() {
  S.ts = S.ts || []; S.sr = S.sr || [];
  while (S.ts.length < S.rounds.length) S.ts.unshift(0);
  while (S.sr.length < S.rounds.length) S.sr.unshift(1);
  S.gaps = S.gaps || []; S.total = Math.max(S.total || 0, S.rounds.length);
  S.cap = Object.assign({ auto: 0, manual: 0, gaps: 0, lastAt: 0 }, S.cap || {});
  S.set.win = S.set.win || 0; S.set.autoFill = S.set.autoFill !== false;
  S.adv = S.adv || {}; S.adv.cfg = Object.assign({}, DEF.adv.cfg, S.adv.cfg || {}); S.adv.log = S.adv.log || [];
  if (S.adv.cfg.gateV !== 2) { S.adv.cfg.gate = 'off'; S.adv.cfg.gateV = 2; }
})();
const capInfo = { lastPoll: 0, verified: null };
/* অটো-বেট (আসল টাকা): ডিফল্টে বন্ধ, সংরক্ষিত হয় না — অ্যাপ খুললে সবসময় বন্ধ */
const AB = { on: false, bets: 0, net: 0, maxBets: 30, maxLoss: 0, clickedFor: -1, pending: null };
const view = () => S.set.win > 0 ? S.rounds.slice(-S.set.win) : S.rounds;
function load() {
  try { const j = JSON.parse(localStorage.getItem(LS)); return Object.assign(JSON.parse(JSON.stringify(DEF)), j || {}); }
  catch { return JSON.parse(JSON.stringify(DEF)); }
}
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(() => localStorage.setItem(LS, JSON.stringify(S)), 300); }

/* ---------- Browser ---------- */
const wv = $('#wv'); let wvReady = false;
wv.addEventListener('dom-ready', () => {
  wvReady = true;
  // পেজ প্রস্তুত হলে বর্তমান সিগন্যালের Stake/Cash Out ইনপুট পূরণ
  setTimeout(() => { try { runAutoFill(true); } catch (_) {} }, 700);
  // BC Game পেজের vertical scroll কমাতে compact CSS inject
  wv.insertCSS(`
    /* গেম চার্ট এরিয়া ছোট করো */
    [class*="GameArea"], [class*="game-area"], [class*="crash-game"],
    [class*="chart-wrap"], [class*="chartWrap"], [class*="gameWrap"] {
      min-height: unset !important;
    }
    /* bet ফর্মের padding কমাও */
    [class*="BetPanel"], [class*="bet-panel"], [class*="betPanel"],
    [class*="BetForm"], [class*="bet-form"], [class*="betForm"],
    [class*="PlaceBet"], [class*="place-bet"] {
      padding-top: 4px !important;
      padding-bottom: 4px !important;
    }
    /* input field margin কমাও */
    [class*="bet"] input, [class*="Bet"] input,
    [class*="amount"] input, [class*="Amount"] input {
      margin-top: 2px !important;
      margin-bottom: 2px !important;
    }
    /* tab গুলো compact করো */
    [class*="TabBar"], [class*="tab-bar"], [class*="tabBar"],
    [role="tablist"] {
      min-height: unset !important;
      height: auto !important;
    }
    /* মূল wrapper height auto করো */
    [class*="Wrapper"], [class*="Container"], [class*="Layout"] {
      min-height: unset !important;
    }
  `).catch(() => {});
});
wv.addEventListener('did-start-loading', () => wvReady = false);
/* SPA-তে did-start-loading এর পর dom-ready নাও আসতে পারে — লোড শেষ হলেই আবার প্রস্তুত ধরি */
['did-stop-loading', 'did-finish-load', 'did-navigate-in-page'].forEach(ev => wv.addEventListener(ev, () => { wvReady = true; }));
/* ফুল ভিউ ফিট + ব্যবহারকারীর ম্যানুয়াল ব্রাউজার জুম */
let userZoom = 1;
const clampZoom = z => Math.max(0.25, Math.min(3, Math.round(z * 100) / 100));
function applyWvZoom() {
  if (!wvReady) return;
  const full = document.body.clientWidth, w = wv.clientWidth, on = S.set.fullView !== false;
  const fitZoom = window.ANDROID ? (on ? 0.4 : 1) : (on && w > 0 && full > 0 ? Math.max(0.4, Math.min(1, w / full)) : 1);
  const finalZoom = clampZoom(fitZoom * userZoom);
  try { wv.setZoomFactor(finalZoom); } catch (e) { /* webview প্রস্তুত নয় */ }
  const b = $('#fullv'); if (b) b.textContent = on ? '🖥 ফুল ভিউ: চালু' : '🖥 ফুল ভিউ: বন্ধ';
  const z = $('#zoomLevel'); if (z) z.textContent = Math.round(userZoom * 100) + '%';
}
function fitWv() { applyWvZoom(); }
function changeZoom(delta) {
  userZoom = clampZoom(userZoom + delta);
  applyWvZoom();
}
function resetZoom() {
  userZoom = 1;
  applyWvZoom();
}
$('#zoomIn').onclick = () => changeZoom(0.1);
$('#zoomOut').onclick = () => changeZoom(-0.1);
$('#zoomReset').onclick = resetZoom;

/* বেট-ফিট: বেট বাটন + Amount + Auto cash out ফর্মটা সাইটের নিচে পিন করে রাখে — স্ক্রোল লাগে না।
   (webview-এর ভেতরে চলে; ক্লাস-নাম নয়, বাটন/ইনপুটের অবস্থান দেখে ফর্ম চেনে) */
function betFitScan(on) {
  var D = document, ST = window.__bcFit || (window.__bcFit = {});
  var STY = D.getElementById('__bcfit_css');
  if (!STY) {
    STY = D.createElement('style'); STY.id = '__bcfit_css';
    STY.textContent = '[data-bcfit="form"]{position:sticky !important;bottom:0 !important;z-index:60 !important;box-shadow:0 -8px 14px rgba(0,0,0,.45) !important;}' +
      '[data-bcfit="anc"]{overflow:visible !important;}';
    (D.head || D.documentElement).appendChild(STY);
  }
  function clear() {
    var o = D.querySelectorAll('[data-bcfit]');
    for (var i = 0; i < o.length; i++) {
      if (o[i].hasAttribute('data-bcfit-bg')) { o[i].style.removeProperty('background-color'); o[i].removeAttribute('data-bcfit-bg'); }
      o[i].removeAttribute('data-bcfit');
    }
    ST.form = null;
  }
  if (!on) { clear(); return 'বন্ধ'; }

  // ১) বেট / ক্যাশআউট বাটন + তার নিচের ইনপুট (Amount, Auto cash out)
  var btns = D.querySelectorAll('button'), bet = null, lowIn = null, i, j;
  var ins = D.querySelectorAll('input');
  for (i = 0; i < btns.length && !bet; i++) {
    var t = (btns[i].innerText || '').replace(/\s+/g, ' ').trim();
    if (!/^(bet|cash ?out)\b/i.test(t)) continue;
    var br = btns[i].getBoundingClientRect();
    if (br.width < 100 || br.height < 20) continue;
    var lo = 0, found = null;
    for (j = 0; j < ins.length; j++) {
      var x = ins[j];
      if (x.type === 'hidden' || x.type === 'checkbox' || x.type === 'radio') continue;
      var q = x.getBoundingClientRect();
      if (q.width < 10 || q.height < 10 || q.top < br.top - 2 || q.top - br.bottom > 350) continue;
      var cx = q.left + q.width / 2;
      if (cx < br.left - 20 || cx > br.right + 20) continue;
      if (q.bottom > lo) { lo = q.bottom; found = x; }
    }
    if (found) { bet = btns[i]; lowIn = found; }
  }
  if (!bet) { if (ST.form) clear(); return 'বেট ফর্ম পাওয়া যায়নি (গেম পেজ খুলুন)'; }

  // ২) ফর্ম-ব্লক: বেট বাটন ও সবচেয়ে নিচের ইনপুট যে ছোটতম বাক্সে আছে
  var F = bet;
  while (F.parentElement && F.parentElement !== D.body && !F.contains(lowIn)) F = F.parentElement;
  if (!F.contains(lowIn)) return 'ফর্ম-ব্লক মেলেনি';
  var g = 0;
  while (F.parentElement && F.parentElement !== D.body && g++ < 6) {
    var pr = F.parentElement.getBoundingClientRect(), fr = F.getBoundingClientRect();
    if (pr.height > fr.height * 1.25 + 20) break;   // মোড়ক হলে আরেক ধাপ উঠি
    F = F.parentElement;
  }
  if (F.getBoundingClientRect().height > window.innerHeight * 0.7) return 'ফর্ম-ব্লক খুব বড় — পিন বাদ';

  if (ST.form && ST.form !== F) clear();
  ST.form = F;
  F.setAttribute('data-bcfit', 'form');

  // ৩) পেছনের চার্ট যেন ফর্মের ভেতর দিয়ে না দেখা যায় — অস্বচ্ছ ব্যাকগ্রাউন্ড
  if (!F.hasAttribute('data-bcfit-bg')) {
    var bg = '', p = F;
    while (p && p !== D.documentElement) {
      var c = getComputedStyle(p).backgroundColor;
      if (c && !/rgba\([^)]*,\s*0\)|transparent/.test(c)) { bg = c; break; }
      p = p.parentElement;
    }
    if (p === F && bg) { /* নিজেরই রং আছে */ }
    else { F.style.setProperty('background-color', bg || '#1b1e23', 'important'); F.setAttribute('data-bcfit-bg', '1'); }
  }

  // ৪) sticky ভাঙে এমন overflow:hidden অভিভাবক খুলে দিই (স্ক্রোল-কন্টেইনার ছাড়া)
  for (var a = F.parentElement, n = 0; a && a !== D.body && n < 12; a = a.parentElement, n++) {
    var o = getComputedStyle(a);
    if (/hidden|clip/.test(o.overflowY + o.overflowX) && !/auto|scroll/.test(o.overflowY)) a.setAttribute('data-bcfit', 'anc');
  }
  return 'চালু — ফর্ম নিচে পিন করা আছে';
}
let fitBusy = false;
async function runBetFit() {
  if (!wvReady || fitBusy) return;
  fitBusy = true;
  try {
    const on = S.set.betFit !== false;
    const st = await wv.executeJavaScript(`(${betFitScan.toString()})(${on})`);
    const b = $('#scrollFit');
    if (b) { b.textContent = on ? '📐 বেট-ফিট: চালু' : '📐 বেট-ফিট: বন্ধ'; b.title = 'বেট/Amount/ক্যাশআউট স্ক্রোল ছাড়াই দেখান — ' + st; }
  } catch (e) { /* webview প্রস্তুত নয় */ } finally { fitBusy = false; }
}
$('#scrollFit').onclick = () => { S.set.betFit = S.set.betFit === false; save(); runBetFit(); };
setInterval(runBetFit, 800);
window.addEventListener('keydown', e => {
  if (!e.ctrlKey) return;
  if (e.key === '+' || e.key === '=') { e.preventDefault(); changeZoom(0.1); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); changeZoom(-0.1); }
  else if (e.key === '0') { e.preventDefault(); resetZoom(); }
});
['dom-ready', 'did-finish-load', 'did-navigate', 'did-navigate-in-page'].forEach(ev => wv.addEventListener(ev, () => setTimeout(fitWv, 50)));
window.addEventListener('resize', fitWv);
if (window.ResizeObserver) new ResizeObserver(fitWv).observe(wv);
$('#fullv').onclick = () => { S.set.fullView = S.set.fullView === false; save(); fitWv(); };
const setUrl = e => { if (e.url) $('#url').value = e.url; };
wv.addEventListener('did-navigate', setUrl);
wv.addEventListener('did-navigate-in-page', setUrl);
function go(u) {
  u = u.trim(); if (!u) return;
  if (!/^https?:\/\//i.test(u)) u = (u.includes('.') && !u.includes(' ')) ? 'https://' + u : 'https://www.google.com/search?q=' + encodeURIComponent(u);
  wv.loadURL(u);
}
$('#back').onclick = () => wv.canGoBack() && wv.goBack();
$('#fwd').onclick = () => wv.canGoForward() && wv.goForward();
$('#reload').onclick = () => wv.reload();
$('#go').onclick = () => go($('#url').value);
$('#url').onkeydown = e => { if (e.key === 'Enter') go(e.target.value); };
$('#home').onclick = () => go('https://bc.game');
$('#toggle').onclick = () => { const p = $('#panel'); p.style.display = p.style.display === 'none' ? 'flex' : 'none'; setTimeout(fitWv, 30); };
$$('#tabs button').forEach(b => b.onclick = () => {
  $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  $$('.pane').forEach(p => p.classList.toggle('on', p.id === 'p-' + b.dataset.t));
  render();
});

/* ---------- Page scan (runs inside the webview) ---------- */
function pageScan(sel, diag) {
  const re = /^\s*(\d+(?:\.\d+)?)\s*[xX×]\s*$/;
  const visible = el => {
    const q = el.getBoundingClientRect();
    if (q.width < 2 || q.height < 2) return null;
    const cx = q.left + q.width / 2, cy = q.top + q.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return null;
    const t = document.elementFromPoint(cx, cy);
    if (!t || !(t === el || el.contains(t) || t.contains(el))) return null;
    return { cx, cy, h: q.height };
  };
  let items = [];
  if (sel) {
    document.querySelectorAll(sel).forEach(el => {
      const m = /(\d+(?:\.\d+)?)/.exec(el.textContent || ''); const p = visible(el);
      if (m && p) items.push({ v: parseFloat(m[1]), x: p.cx, y: p.cy, el });
    });
  } else {
    const cand = [];
    document.querySelectorAll('body *').forEach(el => {
      if (el.childElementCount > 3) return;
      const t = el.textContent || ''; if (t.length > 12) return;
      const m = re.exec(t); if (m) cand.push([el, parseFloat(m[1])]);
    });
    const set = new Set(cand.map(c => c[0]));
    cand.forEach(([el, v]) => {
      for (const ch of el.querySelectorAll('*')) if (set.has(ch)) return;   // সবচেয়ে গভীরটি রাখি
      const p = visible(el); if (p) items.push({ v, x: p.cx, y: p.cy, el });
    });
  }
  // একই সারিতে (y কাছাকাছি) থাকা আইটেম একত্র করি
  items.sort((a, b) => a.y - b.y);
  const rows = []; 
  for (const it of items) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(it.y - last.y) <= 6) { last.list.push(it); last.y = (last.y * (last.list.length - 1) + it.y) / last.list.length; }
    else rows.push({ y: it.y, list: [it] });
  }
  let best = rows.reduce((m, r) => r.list.length > (m ? m.list.length : 0) ? r : m, null);
  const need = sel ? 1 : 3;
  const out = best && best.list.length >= need ? best.list.slice().sort((a, b) => a.x - b.x) : [];
  if (diag) return { rows: rows.map(r => `y≈${Math.round(r.y)}: ` + r.list.sort((a, b) => a.x - b.x).map(i => i.v).join(' ')), picked: out.map(i => i.v) };
  return out.map(i => i.v);
}

$('#diag').onclick = async () => {
  const o = $('#diagOut'); o.textContent = 'চলছে…';
  try {
    const d = await wv.executeJavaScript(`(${pageScan.toString()})(${JSON.stringify(S.set.selector || '')}, true)`);
    o.textContent = `দৃশ্যমান "x" সংখ্যার সারি:\n` + (d.rows.join('\n') || 'কিছু পাওয়া যায়নি') + `\n\nবাছাই হয়েছে (বাম→ডান): ${d.picked.join(', ') || '—'}`;
  } catch (e) { o.textContent = 'ত্রুটি: ' + (e.message || e); }
};
let prevObs = '', lastStable = null;
function detectOrder(arr) {
  if (!lastStable || lastStable.join() === arr.join()) return null;
  const L = lastStable;
  for (let s = 1; s <= Math.min(5, arr.length - 1); s++) {
    if (arr.slice(0, arr.length - s).join() === L.slice(s).join()) return 'last';
    if (arr.slice(s).join() === L.slice(0, L.length - s).join()) return 'first';
  }
  return null;
}
async function capTick() {
  const st = $('#capst');
  if (!S.set.capture) { st.textContent = 'স্ট্যাটাস: বন্ধ'; capInfo.verified = null; return; }
  try {
    const arr = await wv.executeJavaScript(`(${pageScan.toString()})(${JSON.stringify(S.set.selector || '')})`);
    capInfo.lastPoll = Date.now();
    if (!Array.isArray(arr) || arr.length < 3) { st.textContent = 'স্ট্যাটাস: হিস্ট্রি পাওয়া যায়নি (Crash গেম পেজ খুলুন, অথবা নিচের 🔍 ডায়াগনস্টিক চাপুন)'; prevObs = ''; capInfo.verified = null; return; }
    const key = arr.join(',');
    if (key !== prevObs) { prevObs = key; st.textContent = `স্ট্যাটাস: পড়া হচ্ছে: ${arr.join(', ')} (স্থির হওয়ার অপেক্ষা)`; return; }
    let ord = S.set.order || 'auto';
    if (ord === 'auto') {
      ord = S.set.det || null;
      const was = ord, d = detectOrder(arr);
      if (d) {
        S.set.det = d; ord = d; save();
        if (!was && lastStable) mergeObserved(d === 'first' ? lastStable.slice().reverse() : lastStable.slice());
      }
    }
    lastStable = arr;
    if (!ord) { st.textContent = `স্ট্যাটাস: ${arr.length}টি রেজাল্ট দেখা যাচ্ছে — ক্রম শনাক্ত করতে পরের রাউন্ডের অপেক্ষা…`; return; }
    const chron = ord === 'first' ? arr.slice().reverse() : arr.slice();
    const n = mergeObserved(chron);
    const tail = S.rounds.slice(-chron.length);
    capInfo.verified = tail.length === chron.length && tail.every((v, i) => v === chron[i]);
    st.textContent = `স্ট্যাটাস: 🟢 চলছে — পেজ থেকে পড়া (বাম→ডান): ${arr.join(', ')} | ক্রম: ${ord === 'first' ? 'নতুন বামে' : 'নতুন ডানে'}` + (n > 0 ? ` — নতুন ${n}টি যোগ` : '') + (S.cap.rej ? ` | বাদ: ${S.cap.rej}` : '');
  } catch (e) { const m = String(e.message || e); st.textContent = /dom-ready|attached/i.test(m) ? 'স্ট্যাটাস: পেজ লোড হচ্ছে…' : 'স্ট্যাটাস: স্ক্যান ব্যর্থ — ' + m.slice(0, 120); }
}
setInterval(capTick, 1000);
setInterval(renderHdr, 1000);

function mergeObserved(obs) {          // obs: পুরনো→নতুন
  const st = S.rounds;
  let nNew = obs.length, linked = false;
  for (let n = 0; n <= obs.length; n++) {
    const L = obs.length - n;
    if (L > st.length) continue;
    let ok = true;
    for (let i = 0; i < L; i++) if (st[st.length - L + i] !== obs[i]) { ok = false; break; }
    if (ok && (L > 0 || st.length === 0)) { nNew = n; linked = true; break; }
  }
  if (linked && nNew > 0 && st.length > 0 && Date.now() - S.cap.lastAt < 2500) {   // রাউন্ড ≥ ২.৫ সে. পরপর আসে না — সন্দেহজনক, পরে আবার দেখব
    S.cap.rej = (S.cap.rej || 0) + 1; return 0;
  }
  if (!linked && st.length > 0) {      // আগের ডেটার সাথে জোড়া লাগেনি → মাঝের রাউন্ড মিস হয়ে থাকতে পারে
    S.gaps.push(S.total); S.cap.gaps++;
  }
  if (nNew > 0) addRounds(obs.slice(obs.length - nNew), 0);
  return nNew;
}

/* ---------- Data ---------- */
function addRounds(arr, src = 1) {
  const now = Date.now();
  for (const x of arr) {
    if (!(x >= 1) || !isFinite(x)) continue;
    if (S.adv.armed && S.adv.st) { try { advLive(x); } catch (e) { console.error('advLive', e); } }
    S.rounds.push(x); S.ts.push(now); S.sr.push(src); S.total++;
    if (src === 0) { S.cap.auto++; S.cap.lastAt = now; } else S.cap.manual++;
  }
  const ex = S.rounds.length - MAXR;
  if (ex > 0) { S.rounds.splice(0, ex); S.ts.splice(0, ex); S.sr.splice(0, ex); }
  const minIdx = S.total - S.rounds.length; S.gaps = S.gaps.filter(g => g >= minIdx);
  if (src === 0) { const h = $('#hdr'); h.classList.add('fl'); setTimeout(() => h.classList.remove('fl'), 500); }
  save(); try { render(); } catch (e) { console.error('render', e); }
}
const parseNums = t => (t.match(/\d+(?:\.\d+)?/g) || []).map(parseFloat).filter(v => v >= 1);
$('#addp').onclick = () => { const a = parseNums($('#paste').value); addRounds(a); $('#paste').value = ''; };
$('#rev').onclick = () => { const a = parseNums($('#paste').value).reverse(); addRounds(a); $('#paste').value = ''; };
$('#one').onkeydown = e => { if (e.key === 'Enter') { addRounds(parseNums(e.target.value)); e.target.value = ''; } };
$('#clr').onclick = () => { if (confirm('সব রাউন্ড ডেটা মুছে যাবে। নিশ্চিত?')) { S.rounds = []; S.ts = []; S.sr = []; S.gaps = []; S.total = 0; S.cap = { auto: 0, manual: 0, gaps: 0, lastAt: 0 }; save(); render(); } };
$('#exp').onclick = () => window.api.saveFile('crash_rounds.csv', 'index,multiplier,time,source\n' + S.rounds.map((v, i) => `${S.total - S.rounds.length + i + 1},${v},${S.ts[i] ? new Date(S.ts[i]).toISOString() : ''},${S.sr[i] ? 'manual' : 'auto'}`).join('\n'));
$('#imp').onclick = async () => {
  const t = await window.api.openFile(); if (!t) return;
  const lines = t.split(/\r?\n/).filter(l => l.trim());
  const head = lines[0].split(',').map(s => s.trim().toLowerCase());
  const mi = head.indexOf('multiplier'), ti = head.findIndex(x => /time|settled|date/.test(x));
  let a;
  if (mi >= 0) {   // হেডারসহ CSV: multiplier কলাম নিন, সময় থাকলে পুরনো→নতুন সাজান
    let rows = lines.slice(1).map(l => { const p = l.split(','); return { v: parseFloat(p[mi]), t: ti >= 0 ? Date.parse(p[ti]) : 0 }; }).filter(o => o.v >= 1);
    if (ti >= 0 && rows.every(o => isFinite(o.t))) rows.sort((x, y) => x.t - y.t);
    a = rows.map(o => o.v);
  } else {
    a = lines.map(l => { const p = l.split(','); return parseFloat(p.length > 1 ? p[1] : p[0]); }).filter(v => v >= 1);
  }
  addRounds(a);
};
$('#cap').onchange = e => { S.set.capture = e.target.checked; prevObs = ''; save(); };
$('#ord').onchange = e => { S.set.order = e.target.value; prevObs = ''; lastStable = null; save(); };
$('#sel').onchange = e => { S.set.selector = e.target.value.trim(); prevObs = ''; save(); };

/* ---------- Stats ---------- */
const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const median = a => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const fmt = (v, d = 2) => isFinite(v) ? v.toFixed(d) : '—';
const pct = v => isFinite(v) ? (v * 100).toFixed(1) + '%' : '—';
function trailLow(r, end, thr) { let k = 0; for (let i = end; i >= 0 && r[i] < thr; i--) k++; return k; }

/* ---------- Charts ---------- */
function drawLine(cv, data, opt = {}) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, W, H);
  if (data.length < 2) { c.fillStyle = '#8b98a8'; c.fillText('ডেটা নেই', 10, 20); return; }
  const f = opt.log ? v => Math.log10(Math.max(1, v)) : v => v;
  const vals = data.map(f); let lo = Math.min(...vals), hi = Math.max(...vals); if (opt.log) lo = 0;
  if (hi === lo) hi = lo + 1;
  const X = i => 6 + i * (W - 12) / (data.length - 1), Y = v => H - 8 - (v - lo) * (H - 16) / (hi - lo);
  if (opt.refs) for (const r of opt.refs) { const y = Y(f(r)); c.strokeStyle = '#273241'; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); c.fillStyle = '#8b98a8'; c.fillText(r + 'x', 2, y - 2); }
  if (opt.base !== undefined) { const y = Y(opt.base); c.strokeStyle = '#8b98a8'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); c.setLineDash([]); }
  c.strokeStyle = opt.color || '#58a6ff'; c.lineWidth = 1.5; c.beginPath();
  vals.forEach((v, i) => i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))); c.stroke();
}

/* ---------- Render ---------- */
function activeTab() { return ($('#tabs .on') || {}).dataset?.t; }
function render() {
  const t = activeTab(), r = S.rounds;
  $('#cnt').textContent = `মোট সংরক্ষিত রাউন্ড: ${r.length}`;
  $('#recent').innerHTML = r.slice(-40).reverse().map(v => `<span class="chip ${v < 2 ? 'lo' : 'hi'}">${v.toFixed(2)}x</span>`).join('');
  renderHdr(); if (t === 'adv') renderAdv(); if (t === 'hist') renderHist();
}
const kv = (l, v, cls = '') => `<div class="kv"><span>${l}</span><b class="${cls}">${v}</b></div>`;


/* ---------- Advisor engine ---------- */
/* Adaptive paper-trading engine: online logistic learner + regime + calibration + audit */
/*ADV-ENGINE-START*/
const ADAPT_VER = 6;
/* Smart adaptive paper engine: ensemble learners + regime + calibration + adaptive exit.
   Paper-only: no real-money wagering or cash-out API is used. */
function buildFS(rounds,c){
  const f={tar:c.target,thr:c.lowThr,run:0,n:new Array(16).fill(0),h:new Array(16).fill(0),update(x){
    for(let k=1;k<=Math.min(this.run,15);k++){this.n[k]++;if(x>=this.tar)this.h[k]++;}
    this.run=x<this.thr?this.run+1:0;
  }};for(const x of rounds)f.update(x);return f;
}
const TARGETS=[1.20,1.35,1.50,1.80,2.00,2.50,3.00];
const baseP=t=>Math.min(.99,.99/t), logit=p=>Math.log(p/(1-p));
function advFeatures(rounds,c){
  const r=rounds.slice(-160),w=n=>r.slice(-n),avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
  const med=a=>{if(!a.length)return 0;const q=a.slice().sort((x,y)=>x-y),m=Math.floor(q.length/2);return q.length%2?q[m]:(q[m-1]+q[m])/2};
  const hit=r.filter(x=>x>=c.target).length/(r.length||1),low=r.filter(x=>x<c.lowThr).length/(r.length||1);
  const short=avg(w(8)),mid=avg(w(24)),long=avg(w(60)),ultra=avg(w(120));let run=0;for(let i=r.length-1;i>=0&&r[i]<c.lowThr;i--)run++;
  const mu=avg(r),vol=r.length>1?Math.sqrt(avg(r.map(x=>(x-mu)**2))):0,s=w(20),slope=s.length>=5?(s[s.length-1]-s[0])/s.length:0;
  const m30=med(w(30)),p10=avg(w(10)),p50=avg(w(50)),p120=avg(w(120));
  const q=(a,p)=>{if(!a.length)return 0;const z=a.slice().sort((x,y)=>x-y),i=Math.max(0,Math.min(z.length-1,Math.floor((z.length-1)*p)));return z[i]};
  const q25=q(r,.25),q75=q(r,.75),tail=r.filter(x=>x>=3).length/(r.length||1);
  return {short,mid,long,ultra,low,hit,run,vol,slope,med:m30,p10,p50,p120,ratio:p50?p10/p50:1,q25,q75,iqr:q75-q25,tail,n:r.length,last:r.length?r[r.length-1]:0};
}
function regimeOf(f){const vr=f.med?f.vol/f.med:0;if(vr>1.25)return 'HIGH-VOL';if(vr<.5)return 'LOW-VOL';if(f.short>f.mid*1.06&&f.mid>f.long*1.03)return 'UPTREND';if(f.short<f.mid*.94&&f.mid<f.long*.97)return 'DOWNTREND';return 'NORMAL';}
function adaptiveVector(f,c){const scale=x=>Math.max(-1,Math.min(1,x));return [1,scale(f.run/6),scale((f.short-f.long)/(f.med||1)),scale((f.hit-(.99/c.target))/.20),scale(f.slope/.20),scale(f.vol/(f.med||1)-.8),scale(f.p10/(f.p50||1)-1),scale((f.q75-f.q25)/(f.med||1)-.8),scale(f.tail/.12)];}
function sigmoid(z){return 1/(1+Math.exp(-Math.max(-30,Math.min(30,z))));}
function learnerProb(m,f,c){const x=adaptiveVector(f,c),w=m.w;let z=0;for(let i=0;i<w.length;i++)z+=w[i]*x[i];return sigmoid(z);}
function calibratedProb(m,raw){const bins=m.bins||[];const i=Math.max(0,Math.min(9,Math.floor(raw*10))),b=bins[i];if(!b||b.n<20)return raw;return .55*raw+.45*(b.h/b.n);}
function targetProbabilityFloorFor(t){return Math.min(.49,.99/t);}
function multiProb(st,f,c,t){const m=st.model.targets[t.toFixed(2)];if(!m)return targetProbabilityFloorFor(t);return calibratedProb(m,learnerProb(m,f,Object.assign({},c,{target:t})));}
function updateTarget(st,t,p,y,f,c){const m=st.model.targets[t.toFixed(2)];if(m)updateLearner(m,p,y,f,Object.assign({},c,{target:t}));}
function targetStats(st,t){const m=st.model.targets[t.toFixed(2)];return m?{n:m.updates,acc:m.updates?m.correct/m.updates:0,brier:m.updates?m.brier/m.updates:0}: {n:0,acc:0,brier:0};}
function advHumanScore(rounds,c){const f=advFeatures(rounds,c),parts=[];let score=50;if(f.n<Math.max(30,c.minRounds))return {score:0,confidence:0,reasons:['ডেটা কম — সীমিত আস্থা'],f};
  if(f.run>=2){score+=5;parts.push('লো-রান '+f.run);}if(f.run>=6){score+=3;parts.push('দীর্ঘ লো-রান');}
  if(f.short>f.mid&&f.mid>f.long){score+=5;parts.push('স্বল্প-মেয়াদি গতি ঊর্ধ্বমুখী');}if(f.short<f.mid&&f.mid<f.long){score-=5;parts.push('গতি নিম্নমুখী');}
  const base=Math.min(.49,.99/c.target);if(f.hit<base){score-=7;parts.push('হিট-রেট দুর্বল');}if(f.hit>base*1.15){score+=4;parts.push('হিট-রেট তুলনামূলক ভালো');}
  if(f.vol>Math.max(.8,f.med*1.2)){score-=5;parts.push('ভোলাটিলিটি বেশি');}if(f.slope>.08){score+=2;parts.push('শেষ দিকের গতি ঊর্ধ্বমুখী');}if(f.slope<-.08){score-=2;parts.push('শেষ দিকের গতি দুর্বল');}
  if(f.iqr>Math.max(.7,f.med*.9)){score-=3;parts.push('IQR বেশি');}score=Math.max(0,Math.min(100,score));return {score,confidence:Math.round(50+Math.abs(score-50)*1.2),reasons:parts.length?parts:['মিশ্র সংকেত'],f};}
function advApply(st,c,dec,x){if(st.cooldown>0)st.cooldown--;if(dec.act==='STOP'){st.active=false;st.reason=dec.reasons[0];return null;}if(dec.act==='SKIP'){st.skips++;if(dec.recSkip&&st.rec)st.rec.skipN=(st.rec.skipN||0)+1;st.eq.push(st.balance);return null;}const target=dec.cashout||c.target;st.lastT=target;const y=x>=target?1:0,pl=y?dec.stake*(target-1):-dec.stake;st.balance+=pl;st.bets++;if(c.rec){const R=st.rec=st.rec||{loss:0,step:0,cycles:0,ok:0,gaveUp:0};R.skipN=0;const locked=R.lock>0;if(locked)R.lock--;
if(dec.recReset){R.loss=0;R.step=0;R.gaveUp=(R.gaveUp||0)+1;R.lock=3;}
else if(!locked){if(y){if(R.loss>0){R.loss=Math.max(0,R.loss-pl);if(R.loss<=0.005){R.loss=0;R.step=0;R.ok=(R.ok||0)+1;}else R.step=Math.max(R.step,dec.recStep||1);}}
else{if(!(R.loss>0))R.cycles=(R.cycles||0)+1;R.loss+=dec.stake;R.step=(dec.recStep||0)+1;}}}if(y){st.wins++;st.loseRun=0;st.lastWin=(st.lastWin||0)+1;}else{st.lastWin=0;st.loseRun++;if(c.loseN>0&&st.loseRun>=c.loseN){st.cooldown=c.cool;st.loseRun=0;}}st.peak=Math.max(st.peak,st.balance);st.maxDD=Math.max(st.maxDD,st.peak-st.balance);st.eq.push(st.balance);return {win:!!y,pl,stake:dec.stake,y,cashout:target};}
/* v8: বেসলাইন-প্রায়র মডেল (শুরুতে হাউস-এজ সম্ভাবনা), প্রতি রাউন্ডে সব target শেখে (বেট না করলেও),
   এবং "ভার্চুয়াল-বেট লেজার" গেট: মডেল আগে থেকে যা বলেছে তার বাস্তব ফল দেখে এজ প্রমাণিত না হলে SKIP। */
function makeLearner(t){const b=baseP(t);return {w:[logit(b),0,0,0,0,0,0,0,0],b0:logit(b),lr:.02,updates:0,correct:0,logloss:0,brier:0,baseBrier:0,bins:Array.from({length:10},()=>({n:0,h:0})),recent:[],vb:{n:0,s:0,q:0}};}
function newAdaptive(c){const models={};TARGETS.forEach(t=>models[t.toFixed(2)]=makeLearner(t));return {version:ADAPT_VER,start:c.start,balance:c.start,peak:c.start,maxDD:0,bets:0,wins:0,skips:0,loseRun:0,cooldown:0,active:true,reason:'',eq:[c.start],model:{targets:models,last:null},journal:[],regime:'UNKNOWN'};}
function updateLearner(m,p,y,f,c){
  const t=c.target,x=adaptiveVector(f,c),err=y-p,lr=Math.max(.004,.02/(1+m.updates/400));
  for(let i=0;i<m.w.length;i++)m.w[i]+=lr*err*x[i]-(i?.002:.0005)*(m.w[i]-(i?0:m.b0));
  m.updates++;m.correct+=((p>=.5)===(y===1)?1:0);
  m.logloss+=-(y*Math.log(Math.max(1e-6,p))+(1-y)*Math.log(Math.max(1e-6,1-p)));
  m.brier+=(p-y)**2;m.baseBrier+=(baseP(t)-y)**2;
  const b=m.bins[Math.max(0,Math.min(9,Math.floor(p*10)))];b.n++;b.h+=y;
  if(p*t-1>0){const r=y?t-1:-1;m.vb.n++;m.vb.s+=r;m.vb.q+=r*r;}   // মডেল এজ দেখলে ভার্চুয়াল বেট
  m.recent.push({p,y});if(m.recent.length>300)m.recent.shift();
}
function gateOf(m,mode){
  const v=m.vb,n=v.n,mean=n?v.s/n:0,sd=n?Math.sqrt(Math.max(0,v.q/n-mean*mean)):0,low=n?mean-1.645*sd/Math.sqrt(n):0;
  const pass=mode==='off'||(mode==='soft'?(n>=30&&mean>0):(n>=60&&low>0));
  return {n,mean,low,pass};
}
const runB=r=>r>=5?3:r>=3?2:r>=1?1:0, RUNL=['রান ০','রান ১-২','রান ৩-৪','রান ৫+'];
function learnAll(st,hist,c,x){   // প্রতি রাউন্ডে: (১) সম্ভাবনা-মডেল শেখে (২) প্রসঙ্গ-সেলে "ফ্ল্যাট বেট হলে কী ফল হতো" লেখে
  if(hist.length<30)return;
  const ctx=st.model.ctx=st.model.ctx||{},rb=runB(advFeatures(hist,c).run);
  TARGETS.forEach(t=>{const cc=Object.assign({},c,{target:t}),f=advFeatures(hist,cc),y=x>=t?1:0;
    updateTarget(st,t,multiProb(st,f,c,t),y,f,c);
    const k=rb+'|'+t.toFixed(2),z=ctx[k]=ctx[k]||{n:0,s:0,q:0},r=y?t-1:-1;z.n++;z.s+=r;z.q+=r*r;});
}
function ctxGate(st,f,t,mode){   // ২৮ সেল যাচাই হচ্ছে → একাধিক-পরীক্ষার সংশোধনে কড়া z≈২.৯
  const z=((st.model.ctx||{})[runB(f.run)+'|'+t.toFixed(2)])||{n:0,s:0,q:0},n=z.n,mean=n?z.s/n:0,sd=n?Math.sqrt(Math.max(0,z.q/n-mean*mean)):0,low=n?mean-2.9*sd/Math.sqrt(n):0;
  return {n,mean,low,pass:mode==='off'||(mode==='soft'?(n>=50&&mean>0):(n>=100&&low>0))};
}
function warmStart(st,rounds,c){const r=rounds.slice(-3000);for(let i=30;i<r.length;i++)learnAll(st,r.slice(Math.max(0,i-160),i),c,r[i]);return st;}
function adaptiveStats(st){let n=0,correct=0,logloss=0,brier=0,bb=0;Object.values(st.model.targets||{}).forEach(m=>{n+=m.updates;correct+=m.correct;logloss+=m.logloss;brier+=m.brier;bb+=m.baseBrier||0});return {n,acc:n?correct/n:0,logloss:n?logloss/n:0,brier:n?brier/n:0,skill:bb>0?1-brier/bb:0};}
function chooseTarget(st,f,c){
  const reg=regimeOf(f),mode=c.gate||'strict';
  const all=TARGETS.map(t=>{const stats=targetStats(st,t),pr=multiProb(st,f,c,t),wgt=stats.n/(stats.n+200),p=wgt*pr+(1-wgt)*baseP(t),g=gateOf(st.model.targets[t.toFixed(2)],mode),g2=ctxGate(st,f,t,mode),edge=p*t-1,unc=stats.n<40?.04:Math.sqrt(Math.max(0,p*(1-p))/(stats.n+1));let util=edge-1.25*unc-.02*t*Math.sqrt(Math.max(0,p*(1-p)));
    if(reg==='HIGH-VOL')util-=.03*(t-1);if(reg==='DOWNTREND')util-=.015*(t-1);if(reg==='LOW-VOL')util+=.008*(t-1);return {t,p,edge,unc,util,stats,g,g2};});
  const ok=(mode==='off'?all.slice():all.filter(q=>q.g.pass&&q.g2.pass&&q.edge>0)).sort((a,b)=>b.util-a.util),any=all.slice().sort((a,b)=>b.util-a.util)[0];
  return {best:ok[0]||null,any,all};
}
function trendTarget(rounds,f,reg,st){
  /* সাম্প্রতিক ৮০ রাউন্ডের বাস্তব বণ্টন থেকে ক্যাশআউট: "R% রাউন্ড যেখানে পৌঁছেছে" সেই মান।
     ট্রেন্ড/ভোলাটিলিটি অনুযায়ী R বদলায়; প্রতি রাউন্ডে সর্বোচ্চ ±০.২x নড়ে (ধাপে ধাপে ওঠানামা) */
  const r=rounds.slice(-80);if(r.length<20)return null;
  let R=.62;const P=[];
  if(reg==='HIGH-VOL'){R+=.08;P.push('উচ্চ ভোলাটিলিটি → নিরাপদ');}
  if(reg==='DOWNTREND'){R+=.05;P.push('নিম্নমুখী → নিরাপদ');}
  if(reg==='UPTREND'){R-=.06;P.push('ঊর্ধ্বমুখী → উঁচু');}
  if(reg==='LOW-VOL'){R-=.02;}
  if(f.run>=3){R-=.04;P.push('লো-রান '+f.run+' → উঁচু');}
  if(f.run>=6)R-=.03;
  if(f.short<f.mid*.9){R+=.03;P.push('সাম্প্রতিক দুর্বল → নিরাপদ');}
  if(f.short>f.mid*1.1){R-=.03;P.push('সাম্প্রতিক শক্তিশালী → উঁচু');}
  R=Math.max(.40,Math.min(.85,R));
  const z=r.slice().sort((a,b)=>a-b),raw=Math.max(1.1,Math.min(3,z[Math.floor((1-R)*(z.length-1))]));
  const last=st.lastT||raw,t=Math.round((last+Math.max(-.2,Math.min(.2,raw-last)))*100)/100;
  const emp=r.filter(x=>x>=t).length/r.length,p=Math.max(.05,Math.min(.95,.5*baseP(t)+.5*emp));
  return {t,p,R,raw,parts:P};
}
function sizeStake(c,st,b,reg,dd,n,gap,e,off,sig){
  /* ঝুঁকি-সমতা: প্রতি বেটের ওঠানামা (sd) প্রায় সমান রাখতে বড় target-এ ছোট স্টেক */
  const sd=b.t*Math.sqrt(Math.max(.01,b.p*(1-b.p))),ref=2*Math.sqrt(.495*.505),parts=[];
  let pct=c.riskPct,m=Math.max(.35,Math.min(1.6,ref/sd));pct*=m;parts.push('ঝুঁকি-সমতা ×'+m.toFixed(2));
  if(!off&&c.kelly>0){const k=Math.max(.05,c.kelly*100*Math.max(0,e)/(b.t-1));pct=Math.min(pct,k);parts.push('কেলি সীমা '+k.toFixed(2)+'%');}
  else if(e<=0&&!off){pct*=.7;parts.push('এজ অপ্রমাণিত ×0.70');}
  if(sig>0){m=Math.max(.7,Math.min(1.3,1+(sig-50)/100));if(Math.abs(m-1)>.01){pct*=m;parts.push('সিগন্যাল-স্কোর '+sig+' ×'+m.toFixed(2));}}
  if(c.ddPct>0){m=Math.max(.2,1-.8*dd/c.ddPct);if(m<.99){pct*=m;parts.push('ড্রডাউন ×'+m.toFixed(2));}}      // ধারাবাহিক ড্রডাউন-সিঁড়ি
  if(c.tpPct>0&&st.balance>st.start*(1+c.tpPct/200)){pct*=.7;parts.push('লাভ-সুরক্ষা ×0.70');}
  if(st.loseRun>=2){m=Math.max(.4,Math.pow(.8,st.loseRun-1));pct*=m;parts.push('হার-রান ×'+m.toFixed(2));}
  else if(st.wins>=3&&st.loseRun===0&&st.lastWin>=2){pct*=1.1;parts.push('জয়-রান ×1.10');}
  if(reg==='HIGH-VOL'){pct*=.35;parts.push('উচ্চ ভোলাটিলিটি ×0.35');}else if(reg==='DOWNTREND'){pct*=.8;parts.push('ডাউনট্রেন্ড ×0.80');}
  if(n<c.minRounds){pct*=.3;parts.push('ওয়ার্ম-আপ ×0.30');}
  if(gap){pct*=.5;parts.push('ডেটা-গ্যাপ ×0.50');}
  if(st.cooldown>0){pct*=.5;parts.push('বিরতি ×0.50');}
  pct=Math.min(pct,c.riskPct*1.25,5);return {pct:Math.max(.02,pct),parts};
}
function advDecide(n,c,st,fs,gap,rounds=S.rounds){
  const stop=r=>({act:'STOP',reasons:[r],score:0,confidence:0});
  if(!st.active)return stop(st.reason||'সেশন শেষ');
  if(c.slPct>0&&st.balance<=st.start*(1-c.slPct/100))return stop('স্টপ-লস সীমা');
  if(c.tpPct>0&&st.balance>=st.start*(1+c.tpPct/100))return stop('টেক-প্রফিট সীমা');
  const dd=st.peak>0?(st.peak-st.balance)/st.peak*100:0;if(c.ddPct>0&&dd>=c.ddPct)return stop('ড্রডাউন সীমা');
  const hf=advHumanScore(rounds,c),f=hf.f,reg=regimeOf(f),ch=chooseTarget(st,f,c),a=ch.any,cand=ch.all.map(q=>({t:q.t,p:q.p,util:q.util,n:q.stats.n,acc:q.stats.acc,g:q.g,g2:q.g2}));
  const forced={t:a.t,p:a.p,stake:Math.max(.01,Math.round(st.balance*c.riskPct*.5)/100),ev:a.p*a.t-1,proven:false};
  const sk=(why,extra)=>Object.assign({act:'SKIP',forced,reasons:[why],score:Math.round(a.p*100),confidence:0,prob:a.p,regime:reg,targetCandidates:cand},extra||{});
  const off=(c.gate||'strict')==='off';
  if(!off){
  if(n<c.minRounds)return sk('ওয়ার্ম-আপ — সীমিত ডেটা ('+n+'/'+c.minRounds+')');
  if(gap)return sk('সম্প্রতি রাউন্ড মিস হয়েছে — ডেটা অবিশ্বস্ত');
  if(st.cooldown>0)return sk('পরপর হারের পর বিরতি ('+st.cooldown+' রাউন্ড বাকি)');
  }
  let b=ch.best,tinfo=null;
  if(off&&(c.exit||'trend')!=='model'){tinfo=trendTarget(rounds,f,reg,st);if(tinfo)b=Object.assign({},b||a,{t:tinfo.t,p:tinfo.p,edge:tinfo.p*tinfo.t-1,g:{n:0,mean:0,low:0,pass:true},g2:{n:0,mean:0,low:0,pass:true}});}
  if(!b)return sk('প্রমাণিত এজ নেই — সেরা '+a.t.toFixed(2)+'x: ভার্চুয়াল-বেট n='+a.g.n+', গড়='+a.g.mean.toFixed(3)+', নিম্নসীমা='+a.g.low.toFixed(3)+' · '+RUNL[runB(f.run)]+'-সেল n='+a.g2.n+', গড়='+a.g2.mean.toFixed(3));
  const e=(c.gate||'strict')==='strict'?b.g.low:b.g.mean,sz=sizeStake(c,st,b,reg,dd,n,gap,e,off,hf.score);
  let stake=Math.max(.01,Math.round(st.balance*sz.pct)/100),rp=null;
  if(c.rec){/* স্মার্ট রিকভারি v2 (পেপার): আংশিক লক্ষ্য · রিস্ক-বাজেট · ডেটা-ভিত্তিক target · ক্লাস্টার-অপেক্ষা · গিভ-আপ লক */
    const R=st.rec||{loss:0,step:0},lowT=c.lowThr||2,L=rounds.slice(-2),cluster=L.length===2&&L[0]<lowT&&L[1]<lowT,maxS=c.recMax||3,cap=c.recCap||3,base=stake,budget=st.balance*(c.recBudget||3)/100;
    let lowRun=0;for(let i=rounds.length-1;i>=0&&rounds[i]<lowT;i--)lowRun++;
    if(R.lock>0){rp={txt:'রিকভারি লক ('+R.lock+' বেট বাকি) — বেস স্টেকে'};}
    else if(R.loss>0&&(R.step>maxS||R.loss>budget*1.5)){rp={reset:true,txt:'গিভ-আপ: '+(R.step>maxS?'ধাপ '+maxS+' পেরিয়েছে':'ক্ষতি বাজেটের ১.৫× ছাড়িয়েছে')+' → ক্ষতি মেনে রিসেট, ৩ বেট লক'};}
    else if(cluster){
      if(R.loss>0&&c.recPause>0&&lowRun>=c.recPause&&(R.skipN||0)<3)return sk('রিকভারি অপেক্ষা: টানা '+lowRun+' লো — ক্লাস্টার ভাঙার অপেক্ষা ('+((R.skipN||0)+1)+'/3)',{recSkip:true});
      const tr=Math.round(Math.max(1.35,Math.min(1.9,b.t*.85))*100)/100,safe=Math.min(b.t,tr);
      stake=Math.max(.01,Math.round(base*60)/100);rp={t:safe,txt:'লো-ক্লাস্টার (শেষ ২ < '+lowT+'x) → নিরাপদ '+safe.toFixed(2)+'x, স্টেক ×0.60, বাড়ানো স্থগিত'};
    }
    else if(R.loss>0){
      const goal=R.loss*(c.recGoal||.5)+base*.25,emp=rounds.slice(-200),lim=Math.min(base*cap,st.balance*.05,Math.max(base,budget));let bt=null;
      for(let t=1.3;t<=2.0001;t+=.05){const tt=Math.round(t*100)/100,e=emp.length>=30?emp.filter(x=>x>=tt).length/emp.length:.99/tt,p=Math.min(.95,.5*(.99/tt)+.5*e),s=Math.max(base,Math.min(goal/(tt-1),lim)),cover=Math.min(1,s*(tt-1)/goal),score=p*cover-.5*(1-p)*s/goal;if(!bt||score>bt.score)bt={t:tt,p,s,cover,score};}
      stake=Math.round(bt.s*100)/100;rp={t:bt.t,p:bt.p,step:R.step+1,txt:'রিকভারি ধাপ '+(R.step+1)+'/'+maxS+' · ক্ষতি '+R.loss.toFixed(2)+', লক্ষ্য '+goal.toFixed(2)+' ('+Math.round((c.recGoal||.5)*100)+'%+) → '+bt.t.toFixed(2)+'x (হিট ≈'+(bt.p*100).toFixed(0)+'%), স্টেক '+stake.toFixed(2)+' · বাজেট '+budget.toFixed(2)};
    }
    if(rp&&rp.t){b=Object.assign({},b,{t:rp.t,p:rp.p||Math.min(.95,b.p*b.t/rp.t)});}
  }
  if(stake>st.balance)return stop('ব্যালেন্স অপর্যাপ্ত');
  const conf=Math.round(Math.max(0,Math.min(100,50+e*400)));
  return {act:'BET',recStep:rp&&rp.step||0,recReset:!!(rp&&rp.reset),forced:{t:b.t,p:b.p,stake,ev:b.p*b.t-1,proven:true},stake,cashout:b.t,reasons:[(rp?rp.txt:'রিকভারি: নিষ্ক্রিয়'),tinfo?('ট্রেন্ড-ক্যাশআউট '+b.t.toFixed(2)+'x (R='+(tinfo.R*100).toFixed(0)+'%, কাঁচা '+tinfo.raw.toFixed(2)+'x'+(tinfo.parts.length?' · '+tinfo.parts.join(', '):'')+')'):'সেরা target '+b.t.toFixed(2)+'x · P='+(b.p*100).toFixed(1)+'%','এজ-প্রমাণ: n='+b.g.n+', গড়='+b.g.mean.toFixed(3)+', নিম্নসীমা='+b.g.low.toFixed(3),'Regime: '+reg,'স্টেক-গঠন: '+sz.parts.join(' · ')+' → '+sz.pct.toFixed(2)+'%'],score:Math.round(b.p*100),confidence:conf,prob:b.p,rawProb:b.p,regime:reg,targetCandidates:cand,ctxCell:RUNL[runB(f.run)]+' · সেল n='+b.g2.n+', গড়='+b.g2.mean.toFixed(3)+', নিম্ন='+b.g2.low.toFixed(3)};
}
function advSim(rounds,c,warm){const st=newAdaptive(c),fs=buildFS([],c);for(let i=0;i<rounds.length;i++){const hist=rounds.slice(Math.max(0,i-160),i),d=advDecide(i+(warm||0),c,st,fs,false,hist);advApply(st,c,d,rounds[i]);learnAll(st,hist,c,rounds[i]);fs.update(rounds[i]);if(!st.active)break;}return st;}
function baseSim(rounds,c){const stake=Math.max(.01,Math.round(c.start*c.riskPct)/100),st={balance:c.start,peak:c.start,maxDD:0,bets:0,wins:0,eq:[c.start]};for(const x of rounds){if(stake>st.balance)break;const win=x>=c.target;st.balance+=win?stake*(c.target-1):-stake;st.bets++;if(win)st.wins++;st.peak=Math.max(st.peak,st.balance);st.maxDD=Math.max(st.maxDD,st.peak-st.balance);st.eq.push(st.balance);}return st;}
/*ADV-ENGINE-END*/
let advFS = null;
function advLive(x) {
  try { abSettle(x); } catch (e) { console.error('abSettle', e); }
  const a=S.adv,c=a.cfg;if(badSt(a.st))a.st=warmStart(newAdaptive(c),S.rounds,c);
  if(!advFS)advFS=buildFS(S.rounds,c);const gap=S.gaps.some(g=>g>=S.total-20),hist=S.rounds.slice(-160),nAll=S.rounds.length;
  const dec=advDecide(nAll,c,a.st,advFS,gap,hist),rr=advApply(a.st,c,dec,x);
  learnAll(a.st,hist,c,x);
  a.log.push({idx:S.total,x,act:dec.act,stake:dec.stake||0,win:rr?rr.win:null,pl:rr?rr.pl:0,cashout:rr?rr.cashout:(dec.cashout||null),score:dec.score||0,confidence:dec.confidence||0,prob:dec.prob||0,regime:dec.regime||'—',why:dec.reasons.join('; '),balance:a.st.balance});
  a.journal=a.journal||[];a.journal.push({idx:S.total,round:x,action:dec.act,score:dec.score||0,prob:dec.prob||0,regime:dec.regime||'—',result:rr?rr.win:null,pl:rr?rr.pl:0,target:dec.cashout||null,reason:dec.reasons.join('; ')});if(a.journal.length>1000)a.journal.shift();if(a.log.length>300)a.log.shift();if(a.st.eq.length>5000)a.st.eq.shift();advFS.update(x);if(!a.st.active)a.armed=false;
  try{thShow(dec,rr,x);}catch(e){console.error('thrill',e);}
}
const ADV_IDS = { '#aStart': 'start', '#aTar': 'target', '#aRisk': 'riskPct', '#aLoseN': 'loseN', '#aCool': 'cool', '#aMin': 'minRounds', '#aSL': 'slPct', '#aTP': 'tpPct', '#aDD': 'ddPct', '#aLow': 'lowThr', '#aKelly': 'kelly', '#aRecMax': 'recMax', '#aRecCap': 'recCap', '#aRecGoal': 'recGoal', '#aRecBud': 'recBudget', '#aRecPause': 'recPause' };
function readAdvCfg() {
  const c = {};
  for (const k in ADV_IDS) c[ADV_IDS[k]] = parseFloat($(k).value) || 0;
  c.start = c.start || 1000; c.target = Math.max(1.01, c.target || 2); c.riskPct = Math.min(100, Math.max(0.01, c.riskPct || 1)); c.lowThr = c.lowThr || 2;
  c.rec = $('#aRec').checked; c.recMax = Math.max(1, Math.min(6, Math.round(c.recMax || 3))); c.recCap = Math.max(1, Math.min(6, c.recCap || 3)); c.recGoal = Math.min(1, Math.max(0.1, c.recGoal || 0.5)); c.recBudget = Math.min(10, Math.max(0.5, c.recBudget || 3)); c.recPause = Math.max(0, Math.min(8, Math.round(c.recPause))); c.useFilter = false; c.z = 3; c.gate = $('#aGate').value || 'off'; c.gateV = 2; c.exit = ($('#aExit') || {}).value || 'trend'; return c;
}
function writeAdvCfg(c) { const DF = { recMax: 2, recCap: 2, recGoal: 0.3, recBudget: 1.5, recPause: 4 }; for (const k in ADV_IDS) { const key = ADV_IDS[k]; $(k).value = (c[key] != null ? c[key] : DF[key]); } $('#aRec').checked = !!c.rec; $('#aGate').value = c.gate || 'strict'; if ($('#aExit')) $('#aExit').value = c.exit || 'trend'; }
[...Object.keys(ADV_IDS), '#aGate', '#aExit', '#aRec'].forEach(k => { const el = $(k); if (el) el.onchange = () => { S.adv.cfg = Object.assign({}, S.adv.cfg, readAdvCfg(), { start: S.adv.cfg.start }); save(); render(); }; });
$('#aGo').onclick = () => { S.adv.cfg = readAdvCfg(); if (badSt(S.adv.st) || !S.adv.st.active) S.adv.st = warmStart(newAdaptive(S.adv.cfg), S.rounds, S.adv.cfg); advFS = null; S.adv.armed = true; save(); render(); };
$('#aStop').onclick = () => { S.adv.armed = false; save(); render(); };
$('#aReset').onclick = () => { S.adv.cfg = readAdvCfg(); S.adv.st = warmStart(newAdaptive(S.adv.cfg), S.rounds, S.adv.cfg); S.adv.log = []; S.adv.armed = false; advFS = null; save(); render(); };
$('#aBt').onclick = () => {
  const c = readAdvCfg(), r = S.rounds;
  if (r.length < c.minRounds + 50) { $('#aBtRes').innerHTML = '<div class="m">অন্তত ' + (c.minRounds + 50) + 'টি রাউন্ড দরকার।</div>'; return; }
  const a = advSim(r, c, 0), b = baseSim(r, c);
  $('#aBtRes').innerHTML = cmpTable(a, b, c);
  drawLine($('#ch5'), a.eq, { base: c.start, color: '#58a6ff' });
};
function cmpTable(a, b, c) {
  const row = (l, x, y, cl) => `<tr><td>${l}</td><td class="${cl ? cl(x) : ''}">${x}</td><td class="${cl ? cl(y) : ''}">${y}</td></tr>`;
  const net = s => fmt(s.balance - c.start);
  return '<table><tr><th></th><th>অ্যাডভাইজার</th><th>সবসময়-বেট</th></tr>'
    + row('শেষ ব্যালেন্স', fmt(a.balance), fmt(b.balance))
    + row('নেট', net(a), net(b), v => parseFloat(v) >= 0 ? 'g' : 'r')
    + row('বেট', a.bets, b.bets) + row('স্কিপ', a.skips, '০')
    + row('জয়%', pct(a.wins / (a.bets || 1)), pct(b.wins / (b.bets || 1)))
    + row('সর্বোচ্চ ড্রডাউন', fmt(a.maxDD), fmt(b.maxDD))
    + row('শেষ কারণ', a.active ? 'ডেটা শেষ' : a.reason, '—') + '</table>';
}
function Phi(z){const t=1/(1+.2316419*Math.abs(z)),d=.3989423*Math.exp(-z*z/2),p=d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return z>0?1-p:p;}
function riskLine(f){   // তাত্ত্বিক (হাউস-এজ ধরে) ১০০ বেটের ফল — মডেলের আশাবাদ বাদ দিয়ে
  const p=baseP(f.t),n=100,mu=-(1-.99)*f.stake*n,sd=f.stake*f.t*Math.sqrt(p*(1-p))*Math.sqrt(n),pr=Phi(mu/sd),lo=mu-1.645*sd;
  return `<div class="m" style="margin-top:4px">📉 ঝুঁকি-হিসাব (হাউস-এজ ধরে, ১০০ বেট একই সাইজে): গড় নেট <b class="r">${fmt(mu)}</b> · খারাপ ৫% ক্ষেত্রে <b class="r">${fmt(lo)}</b> বা তার চেয়ে খারাপ · লাভে থাকার সম্ভাবনা ≈ <b>${(pr*100).toFixed(0)}%</b></div>`;
}
function scoreCard(log){const L=log.slice(-50),b=L.filter(l=>l.act==='BET'),net=b.reduce((s,l)=>s+l.pl,0),w=b.filter(l=>l.win).length;return `<br>শেষ ${L.length} সিদ্ধান্ত: বেট <b>${b.length}</b> (জয় ${w}) · স্কিপ ${L.filter(l=>l.act==='SKIP').length} · নেট <b class="${net>=0?'g':'r'}">${net>=0?'+':''}${fmt(net)}</b>`;}
const badSt=st=>!st||!st.model||st.version!==ADAPT_VER||Object.values(st.model.targets||{}).some(m=>!m||!m.vb||!m.bins||!m.w);
function renderAdv() {
  try { renderAdv0(); } catch (e) { console.error(e); const n = $('#advNow'); if (n) n.innerHTML = '<div class="sig"><b class="r">⚠ অ্যাডভাইজার রেন্ডার ত্রুটি: ' + String(e.message || e).replace(/</g, '&lt;') + '</b><br><span class="m">"রিসেট" চাপুন; না হলে এই বার্তাটি পাঠান।</span></div>'; }
}
function renderAdv0() {
  const a = S.adv, c = a.cfg, r = S.rounds;
  const st = badSt(a.st) ? newAdaptive(c) : a.st, fs = (a.armed && advFS) ? advFS : buildFS(r, c);
  const gap = S.gaps.some(g => g >= S.total - 20), dec = advDecide(r.length, c, st, fs, gap, r);
  const cls = dec.act === 'BET' ? 'g' : dec.act === 'STOP' ? 'r' : 'y', lab = dec.act === 'BET' ? '🟢 বেট ধরা যায় (পেপার)' : dec.act === 'STOP' ? '⛔ সেশন থামান' : '🟡 এই রাউন্ডে বেট নয়';
  const pT = Math.min(1, 0.99 / c.target), ev = pT * c.target - 1;
  const ast = adaptiveStats(st), ap = dec.prob == null ? 0 : dec.prob;
  $('#advNow').innerHTML = `<div class="sig"><b class="${cls}">${lab}</b>`
    + `<br>AI সিদ্ধান্ত-স্কোর: <b>${dec.score || 0}/100</b> · Adaptive probability: <b>${(ap*100).toFixed(1)}%</b> · Confidence: <b>${dec.confidence || 0}%</b>`
    + `<br>Regime: <b>${dec.regime || regimeOf(advFeatures(r,c))}</b>` + `<br><span class="m">AI v9.2 · ক্যাশআউট: <b>${c.exit === 'model' ? 'মডেল' : 'ট্রেন্ড-ডাইনামিক'}</b> · এজ-গেট: <b>${({off:'বন্ধ (সবসময় বেট)',soft:'নরম',strict:'কঠোর'})[c.gate || 'strict']}</b> · ন্যূনতম রাউন্ড: ${c.minRounds} · ${a.armed ? 'পেপার চালু' : '⏸ পেপার বন্ধ — শুরু চাপুন'}</span>` + scoreCard(a.log)
    + (dec.act === 'BET' ? `<br>পেপার স্টেক: <b>${fmt(dec.stake)}</b> · ডায়নামিক ক্যাশআউট: <b>${dec.cashout||'—'}x</b>` : '')
    + (dec.reasons.length ? `<br><span class="m">${dec.reasons.join(' · ')}</span>` : '') + (dec.forced ? `<div class="card" style="margin-top:8px;border-left:3px solid ${dec.forced.proven ? '#3fb950' : '#d29922'}"><h3>🎯 পরের রাউন্ডের পরামর্শ (পেপার)</h3>
      <div style="font-size:15px">ক্যাশআউট: <b>${dec.forced.t.toFixed(2)}x</b> · স্টেক: <b>${fmt(dec.forced.stake)}</b> (${fmt(dec.forced.stake / (st.balance || 1) * 100, 2)}% ব্যালেন্স) · জয়ের সম্ভাবনা: <b>${(dec.forced.p * 100).toFixed(1)}%</b></div>
      <div class="${dec.forced.ev > 0 ? 'g' : 'r'}">প্রত্যাশিত ফল প্রতি ১ স্টেকে: ${fmt(dec.forced.ev, 3)}</div>
      <div class="m">${dec.forced.proven ? '✓ এজ-গেট পাস — এই সাইজ প্রমাণিত-এজ অনুযায়ী' : '⚠ এজ প্রমাণিত নয় — সিদ্ধান্ত: বেট নয়। এটি শুধু "যদি তবুও ধরেন" তথ্য; গড়ে ক্ষতির দিকে।'}</div>${riskLine(dec.forced)}</div>` : '') + '</div>'
    + `<div class="card"><div class="grid">${kv('প্রতি ১ স্টেকে প্রত্যাশিত', fmt(ev, 3), 'r')}${kv('মডেল আপডেট', ast.n)}${kv('মডেল accuracy', ast.n ? pct(ast.acc) : '—')}${kv('Brier score', ast.n ? fmt(ast.brier,3) : '—')}${kv('স্কিল বনাম বেসলাইন', ast.n ? pct(ast.skill) : '—', ast.skill>0?'g':'r')}${kv('বর্তমান লো-স্ট্রিক', Math.min(fs.run,99))}</div></div>`
  + (dec.targetCandidates ? `<div class="card"><h3>Multi-target probability</h3><table><tr><th>Target</th><th>Probability</th><th>Accuracy</th><th>Updates</th><th>Utility</th><th>এজ-প্রমাণ (n · গড় · নিম্ন)</th></tr>${dec.targetCandidates.map(q=>`<tr class="${q.t===dec.cashout?'g':''}"><td>${q.t.toFixed(2)}x</td><td>${(q.p*100).toFixed(1)}%</td><td>${q.n?pct(q.acc):'—'}</td><td>${q.n}</td><td>${fmt(q.util,3)}</td><td class="${q.g&&q.g.pass?'g':'m'}">${q.g?q.g.n+' · '+fmt(q.g.mean,3)+' · '+fmt(q.g.low,3)+(q.g.pass?' ✓':' ✗')+' | সেল '+q.g2.n+' · '+fmt(q.g2.mean,3)+(q.g2.pass?' ✓':' ✗'):''}</td></tr>`).join('')}</table></div>` : '');
  const pl = st.balance - c.start;
  $('#aRes').innerHTML = kv('স্ট্যাটাস', st.active ? (a.armed ? '🟢 চলছে' : '⏸ থামানো') : '⛔ ' + st.reason)
    + kv('ব্যালেন্স', fmt(st.balance), pl >= 0 ? 'g' : 'r') + kv('নেট', (pl >= 0 ? '+' : '') + fmt(pl), pl >= 0 ? 'g' : 'r')
    + kv('বেট / জয়', `${st.bets} / ${st.wins} (${pct(st.wins / (st.bets || 1))})`) + kv('স্কিপ', st.skips) + kv('সর্বোচ্চ ড্রডাউন', fmt(st.maxDD), 'r');
  drawLine($('#ch4'), st.eq.slice(-500), { base: c.start, color: pl >= 0 ? '#3fb950' : '#f85149' });
  $('#aLog').innerHTML = '<tr><th>ফল</th><th>সিদ্ধান্ত</th><th>স্কোর</th><th>Prob.</th><th>Regime</th><th>স্টেক</th><th>ক্যাশআউট</th><th>P/L</th><th>ব্যালেন্স</th></tr>' + a.log.slice(-30).reverse().map(l =>
    `<tr title="${l.why}"><td class="${l.act === 'BET' ? (l.win ? 'g' : 'r') : 'm'}">${l.x.toFixed(2)}x</td><td>${l.act === 'BET' ? 'পেপার বেট' : l.act === 'SKIP' ? 'স্কিপ' : 'থামা'}</td><td>${l.score || 0}</td><td>${l.prob ? (l.prob*100).toFixed(1)+'%' : '—'}</td><td>${l.regime || '—'}</td><td>${l.stake ? fmt(l.stake) : '—'}</td><td>${l.cashout ? l.cashout + 'x' : '—'}</td><td class="${l.pl >= 0 ? 'g' : 'r'}">${l.act === 'BET' ? fmt(l.pl) : '—'}</td><td>${fmt(l.balance)}</td></tr>`).join('');
}


/* ---------- Init ---------- */
function init() {
  $('#cap').checked = !!S.set.capture; $('#ord').value = S.set.order || 'auto'; $('#sel').value = S.set.selector || '';
  writeAdvCfg(S.adv.cfg);
  render();
}

const ago = t => { if (!t) return '—'; const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? s + ' সে.' : Math.floor(s / 60) + ' মি. ' + (s % 60) + ' সে.'; };
function renderHdr() {
  const on = S.set.capture, alive = Date.now() - capInfo.lastPoll < 3500;
  const last = S.rounds[S.rounds.length - 1], lastAt = S.ts[S.ts.length - 1];
  const ver = capInfo.verified === null ? '' : capInfo.verified ? '<span class="g"> ✔ পেজের হিস্ট্রির সাথে মিলছে</span>' : '<span class="r"> ✘ পেজের সাথে মিলছে না</span>';
  const stale = on && alive && S.cap.auto > 0 && Date.now() - S.cap.lastAt > 90000 ? '<span class="y"> ⚠ ৯০ সে.+ নতুন রাউন্ড আসেনি</span>' : '';
  $('#hs1').innerHTML = `${!on ? '⚫' : alive ? '🟢' : '🟠'} ক্যাপচার ${on ? 'চালু' : 'বন্ধ'} · অটো: <b>${S.cap.auto}</b> · হাতে: ${S.cap.manual} · মিস-সতর্কতা: <b class="${S.cap.gaps ? 'y' : ''}">${S.cap.gaps}</b>`;
  $('#hs2').innerHTML = `শেষ: <b class="${last < 2 ? 'r' : 'g'}">${last ? last.toFixed(2) + 'x' : '—'}</b> (${last ? ago(lastAt) + ' আগে' : '—'})${ver}${stale}`;
}
function renderHist() {
  const r = S.rounds, base = S.total - r.length, bets = new Map((S.adv.log || []).filter(l => l.act === 'BET').map(l => [l.idx, l])), gaps = new Set(S.gaps);
  const au = []; for (let i = r.length - 1; i > 0 && au.length < 25; i--) if (!S.sr[i] && !S.sr[i - 1] && S.ts[i] && S.ts[i - 1]) { const d = (S.ts[i] - S.ts[i - 1]) / 1000; if (d >= 3 && d <= 120) au.push(d); }
  $('#histInfo').innerHTML = `সংরক্ষিত ${r.length} · অটো ${S.cap.auto} · হাতে ${S.cap.manual} · গ্যাপ-সতর্কতা ${S.cap.gaps}` + (au.length ? ` · গড় ব্যবধান ≈ ${fmt(mean(au), 1)} সে.` : '');
  let html = '<tr><th>#</th><th>সময়</th><th>ফল</th><th>উৎস</th><th>পেপার বেট</th></tr>';
  for (let i = r.length - 1; i >= Math.max(0, r.length - 200); i--) {
    const ai = base + i, b = bets.get(ai), t = S.ts[i] ? new Date(S.ts[i]).toLocaleTimeString('en-GB') : '—';
    html += `<tr><td>${ai + 1}</td><td class="m">${t}</td><td class="${r[i] < 2 ? 'r' : 'g'}"><b>${r[i].toFixed(2)}x</b></td><td class="m">${S.sr[i] ? 'হাতে' : 'অটো'}</td><td>${b ? `<span class="${b.win ? 'g' : 'r'}">${b.win ? '+' : ''}${fmt(b.pl)}</span>` : ''}</td></tr>`;
    if (gaps.has(ai)) html += '<tr><td colspan="5" class="y" style="text-align:center">⚠ এর আগে কিছু রাউন্ড মিস হয়ে থাকতে পারে</td></tr>';
  }
  $('#histT').innerHTML = html;
}

init();

/* ===== থ্রিল স্টেজ (পেপার-ওনলি ভিজ্যুয়াল) ===== */
const TH={streak:0,best:0,near:0,snd:false,anim:null,ctx:null,ac:null};
function thBeep(f,d){if(!TH.snd)return;try{TH.ac=TH.ac||new (window.AudioContext||window.webkitAudioContext)();const o=TH.ac.createOscillator(),g=TH.ac.createGain();o.frequency.value=f;g.gain.value=.05;o.connect(g);g.connect(TH.ac.destination);o.start();o.stop(TH.ac.currentTime+d);}catch(e){}}
function thShow(dec,rr,x){
  const cv=document.getElementById('thCv');if(!cv)return;const g=cv.getContext('2d'),W=cv.width,H=cv.height;
  const target=(dec.act==='BET'&&(rr?rr.cashout:dec.cashout))||null,bet=dec.act==='BET'&&rr;
  if(bet){if(rr.win){TH.streak++;TH.best=Math.max(TH.best,TH.streak);}else{TH.streak=0;if(target&&x>=target*0.9)TH.near++;}}
  const top=Math.max(x,target||0,2)*1.15;cancelAnimationFrame(TH.anim);const t0=performance.now(),dur=Math.min(2200,600+x*260);
  const Y=v=>H-14-(H-30)*Math.log(Math.max(v,1))/Math.log(top);
  function frame(now){
    const p=Math.min(1,(now-t0)/dur),cur=Math.pow(x,p<1?p:1),done=p>=1;
    g.clearRect(0,0,W,H);g.fillStyle='#0b1015';g.fillRect(0,0,W,H);
    g.strokeStyle='#273241';g.lineWidth=1;[1.5,2,3,5,10].forEach(v=>{if(v<top){g.beginPath();g.moveTo(0,Y(v));g.lineTo(W,Y(v));g.stroke();g.fillStyle='#8b98a8';g.font='10px sans-serif';g.fillText(v+'x',4,Y(v)-2);}});
    if(target){g.setLineDash([6,4]);g.strokeStyle='#d29922';g.beginPath();g.moveTo(0,Y(target));g.lineTo(W,Y(target));g.stroke();g.setLineDash([]);g.fillStyle='#d29922';g.font='11px sans-serif';g.fillText('ক্যাশআউট '+target.toFixed(2)+'x',W-120,Y(target)-4);}
    const cashed=bet&&rr.win&&cur>=target,crashed=done&&x<(target||Infinity);
    g.strokeStyle=cashed?'#3fb950':(done&&bet&&!rr.win?'#f85149':'#58a6ff');g.lineWidth=3;g.beginPath();
    for(let i=0;i<=60;i++){const q=i/60*p,v=Math.pow(x,q),px=10+(W-20)*i/60;i?g.lineTo(px,Y(v)):g.moveTo(px,Y(v));}g.stroke();
    g.fillStyle='#e6edf3';g.font='bold 30px sans-serif';g.fillText(cur.toFixed(2)+'x',W/2-45,40);
    if(done){g.font='bold 15px sans-serif';if(!bet){g.fillStyle='#d29922';g.fillText('স্কিপ — রাউন্ড '+x.toFixed(2)+'x',W/2-80,66);}
      else if(rr.win){g.fillStyle='#3fb950';g.fillText('✅ ক্যাশআউট '+target.toFixed(2)+'x · +'+rr.pl.toFixed(2),W/2-105,66);}
      else{g.fillStyle='#f85149';g.fillText('💥 ক্রাশ '+x.toFixed(2)+'x · '+rr.pl.toFixed(2),W/2-90,66);}}
    if(!done)TH.anim=requestAnimationFrame(frame);else{
      if(bet)thBeep(rr.win?880:180,.18);
      const hd=document.getElementById('hdr');if(hd&&bet){hd.style.background=rr.win?'#12351f':'#3a1616';setTimeout(()=>hd.style.background='',500);}}
  }
  TH.anim=requestAnimationFrame(frame);
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  {const R=(S.adv.st&&S.adv.st.rec)||{};const e=document.getElementById('recStat');if(e)e.textContent='রিকভারি: চক্র '+(R.cycles||0)+' · উঠেছে '+(R.ok||0)+' · গিভ-আপ '+(R.gaveUp||0)+(R.loss>0?' · বাকি ক্ষতি '+R.loss.toFixed(2):'');}s('thStreak',TH.streak);s('thBest',TH.best);s('thLast',x.toFixed(2)+'x');s('thNear',TH.near);
}
document.getElementById('thSnd').onclick=e=>{TH.snd=!TH.snd;e.target.textContent='🔊 সাউন্ড: '+(TH.snd?'চালু':'বন্ধ');thBeep(660,.1);};
document.getElementById('thEvery').onclick=()=>{
  const gt=document.getElementById('aGate'),ex=document.getElementById('aExit');
  if(gt){gt.value='off';gt.dispatchEvent(new Event('change'));}
  if(ex){ex.value='trend';ex.dispatchEvent(new Event('change'));}
  const k=document.getElementById('aLoseN');if(k){k.value=0;k.dispatchEvent(new Event('change'));}
};

/* ===== সিগন্যাল বার + নিরাপদ বেট-ফর্ম অটোফিল =====
   শুধু Amount/Stake ও Auto Cash Out ইনপুট পূরণ করে।
   কোনো Bet/Cash Out বাটন খোঁজে না, ক্লিকও করে না। */
let SIG = { stake: null, t: null, key: '', fillKey: '' };
function setFillStatus(msg, bad=false) {
  const el = document.getElementById('fillStatus');
  if (el) { el.textContent = msg; el.style.color = bad ? '#f85149' : '#8b98a8'; }
}
function fillBetForm(stake, target, force, clickBet) {
  /* webview-এর ভেতরে চলে। "Amount" ও "Auto cash out" লেবেলের ঠিক নিচের ইনপুট খুঁজে শুধু ওই দুটি ঘর পূরণ করে।
     কোনো Bet/Cash Out বাটন ক্লিক করে না। */
  const D = document;
  const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const usable = el => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 8 && r.height > 8 && cs.display !== 'none' && cs.visibility !== 'hidden' &&
      !el.disabled && !el.readOnly && !/^(hidden|checkbox|radio|button|submit|file)$/.test(el.type);
  };
  const inputs = [...D.querySelectorAll('input')].filter(usable).map(el => ({ el, r: el.getBoundingClientRect() }));
  const ownText = el => norm([...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' '));
  const labelRects = re => {
    const out = [];
    D.querySelectorAll('label,div,span,p,small').forEach(el => {
      const t = ownText(el);
      if (!t || t.length > 30 || !re.test(t)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      out.push(r);
    });
    return out;
  };
  const AMT = /^(bet\s*)?(amount|stake)\b/, CASH = /^auto[\s-]*cash[\s-]*out\b/;
  // লেবেলের নিচে সবচেয়ে কাছের ইনপুট (বাম প্রান্তের দূরত্ব + উল্লম্ব দূরত্ব ন্যূনতম)
  const pick = (re, skipEl) => {
    let best = null;
    for (const L of labelRects(re)) for (const c of inputs) {
      if (c.el === skipEl) continue;
      const dy = c.r.top - L.bottom;
      if (dy < -8 || dy > 120) continue;
      const dx = L.left < c.r.left ? c.r.left - L.left : (L.left > c.r.right ? L.left - c.r.right : 0);
      if (dx > 220) continue;
      const sc = dx + Math.max(0, dy);
      if (!best || sc < best.sc) best = { el: c.el, r: c.r, sc };
    }
    return best;
  };
  // লেবেল না পেলে: একই সারিতে পাশের ইনপুট
  const sameRow = (base, dir) => {
    if (!base) return null;
    const b = base.r, cy = b.top + b.height / 2; let best = null;
    for (const c of inputs) {
      if (c.el === base.el) continue;
      if (Math.abs(c.r.top + c.r.height / 2 - cy) > 20) continue;
      const gap = dir > 0 ? c.r.left - b.right : b.left - c.r.right;
      if (gap < -2 || gap > 400) continue;
      if (!best || gap < best.gap) best = { el: c.el, r: c.r, gap };
    }
    return best;
  };
  let amount = pick(AMT, null), cash = pick(CASH, amount && amount.el);
  if (amount && !cash) cash = sameRow(amount, 1);
  if (cash && !amount) amount = sameRow(cash, -1);
  if (!amount || !cash || amount.el === cash.el) {
    return { ok: false, changed: 0, message: 'Amount / Auto cash out ঘর শনাক্ত হয়নি' + (amount ? ' (Amount পাওয়া গেছে)' : '') + (cash ? ' (Auto cash out পাওয়া গেছে)' : '') + ' — Crash গেম পেজ খুলুন' };
  }
  const setValue = (el, val) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, String(val)); else el.value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    el.dispatchEvent(new Event('blur'));
  };
  const same = (el, v) => Math.abs(parseFloat(String(el.value).replace(/,/g, '')) - Number(v)) < 1e-9;
  const want = [[amount.el, Number(stake).toFixed(2), 'Amount'], [cash.el, Number(target).toFixed(2), 'Auto Cash Out']];
  let changed = 0; const skipped = [];
  for (const [el, v, nm] of want) {
    if (!force && D.activeElement === el) { skipped.push(nm); continue; }   // ব্যবহারকারী টাইপ করছে — ছুঁই না
    if (same(el, v)) continue;
    setValue(el, v); changed++;
  }
  // সাইট মান বদলে ফেলল কি না যাচাই
  return new Promise(res => setTimeout(() => {
    const bad = want.filter(([el, v]) => !same(el, v) && D.activeElement !== el);
    if (bad.length) return res({ ok: false, changed, message: 'সাইট মান বদলে ফেলেছে — এখন Amount=' + amount.el.value + ', Cash Out=' + cash.el.value });
    const base = 'Amount ' + want[0][1] + ' · Auto Cash Out ' + want[1][1];
    let clicked = false, note = '';
    if (clickBet && !skipped.length) {
      // শুধু তখনই ক্লিক, যখন দুই ঘরের মান যাচাই হয়েছে এবং বাটনের লেখা হুবহু "Bet" (Cash Out/Cancel নয়)
      let btn = null;
      for (let p = amount.el.parentElement, g = 0; p && p !== D.body && g < 8 && !btn; p = p.parentElement, g++) {
        if (!p.contains(cash.el)) continue;
        btn = [...p.querySelectorAll('button')].find(b => /^bet$/.test(norm(b.innerText)) && !b.disabled && b.getBoundingClientRect().width > 100);
      }
      if (btn) {
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t =>
          btn.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, { bubbles: true, cancelable: true, view: window, button: 0 })));
        clicked = true;
      } else note = ' · Bet বাটন এখন প্রস্তুত নয়, আবার চেষ্টা হবে';
    }
    res({ ok: true, changed, clicked, message: (skipped.length ? base + ' (' + skipped.join(', ') + ' এ টাইপ করছেন — বাদ রাখা হয়েছে)' : base + ' পূরণ হয়েছে') + note });
  }, 150));
}
let fillBusy = false;
async function runAutoFill(force = false, sync = false) {
  if (S.set.autoFill === false) { if (!sync) setFillStatus('অটোফিল বন্ধ'); return; }
  if (SIG.stake == null || SIG.t == null) { if (!sync) setFillStatus('BET সিগন্যালের অপেক্ষায়'); return; }
  if (AB.on && AB.clickedFor === S.total) return;   // এই রাউন্ডে বেট হয়ে গেছে — সাইট ঘর লক রাখে, আর কিছু করি না
  const key = String(SIG.stake) + '|' + String(SIG.t);
  if (!force && !sync && SIG.fillKey === key) return;
  if (fillBusy) return;
  fillBusy = true;
  try {
    // wvReady-র উপর নির্ভর নয়: সরাসরি চেষ্টা, পেজ প্রস্তুত না হলে exception ধরা হয়
    const n0 = S.total, wantBet = false; /* Android সংস্করণে স্বয়ংক্রিয় আসল-টাকার Bet ক্লিক বন্ধ */
    const res = await wv.executeJavaScript(`(${fillBetForm.toString()})(${JSON.stringify(SIG.stake)},${JSON.stringify(SIG.t)},${!!force},${wantBet})`);
    if (res && res.clicked) {
      AB.clickedFor = n0; AB.pending = { n: n0, stake: SIG.stake, t: SIG.t }; AB.bets++; abStatus();
      setFillStatus('🎯 বেট দেওয়া হয়েছে — ' + res.message);
    } else if (res && res.ok) { SIG.fillKey = key; if (!sync || res.changed > 0) setFillStatus('✓ ' + res.message); }
    else { SIG.fillKey = ''; setFillStatus('⚠ ' + ((res && res.message) || 'ফর্ম পূরণ হয়নি'), true); }
  } catch (e) {
    SIG.fillKey = '';
    const m = String(e.message || e);
    setFillStatus(/dom-ready|attached/i.test(m) ? 'গেম পেজ লোড হচ্ছে — আবার চেষ্টা হবে' : '⚠ ফর্ম পূরণ ব্যর্থ: ' + m.slice(0, 90), true);
  } finally { fillBusy = false; }
}
/* প্রতি ২ সে.-এ যাচাই: সাইট ইনপুট রিসেট করলে (নতুন রাউন্ডে) আবার বসায়; ফোকাসে থাকা ঘর ছোঁয় না */
setInterval(() => { if (SIG.stake != null && S.set.autoFill !== false) runAutoFill(false, true); }, 2000);
function updSigBar() {
  const bar = document.getElementById('sigBar'); if (!bar) return;
  const a = S.adv, c = a.cfg, txt = document.getElementById('sigTxt'), num = document.getElementById('sigNum');
  const setBar = (cls, t, n) => { bar.className = cls; txt.textContent = t; num.textContent = n || ''; };
  if (!a.armed) { SIG.stake = SIG.t = null; return setBar('', 'সিগন্যাল: অ্যাডভাইজার ট্যাবে "চালু" চাপুন', ''); }
  const st = badSt(a.st) ? null : a.st; if (!st) return setBar('', 'সিগন্যাল: প্রস্তুত হচ্ছে…', '');
  if (!st.active) return setBar('stop', '⛔ থামা: ' + (st.reason || 'সীমা'), '');
  const r = S.rounds, fs = advFS || buildFS(r, c), gap = S.gaps.some(g => g >= S.total - 20);
  let d; try { d = advDecide(r.length, c, st, fs, gap, r); } catch (e) { return setBar('', 'সিগন্যাল: গণনা ব্যর্থ', ''); }
  if (d.act === 'BET') {
    const pct = st.balance > 0 ? d.stake / st.balance : 0, rb = parseFloat(document.getElementById('sigBal').value);
    const stake = rb > 0 ? Math.round(rb * pct * 100) / 100 : d.stake;
    SIG.stake = stake; SIG.t = d.cashout;
    setBar('bet', '🟢 বেট সিগন্যাল (পেপার) — পরের রাউন্ড', 'স্টেক ' + stake + (rb > 0 ? '' : ' (পেপার)') + ' · ব্যালেন্সের ' + (pct * 100).toFixed(1) + '% · ক্যাশআউট ' + d.cashout.toFixed(2) + 'x');
    const key = r.length + ':' + stake + ':' + d.cashout;
    if (SIG.key !== key) { SIG.key = key; thBeep(990, .12); }
    if (S.set.autoFill !== false && SIG.fillKey !== (String(stake)+'|'+String(d.cashout))) runAutoFill();
  } else if (d.act === 'SKIP') {
    SIG.stake = SIG.t = null; setBar('skip', '⏸ এই রাউন্ডে স্কিপ', (d.reasons && d.reasons[0]) || '');
    setFillStatus('এই রাউন্ডে অটোফিল করা হয়নি — SKIP');
  } else {
    SIG.stake = SIG.t = null; setBar('stop', '⛔ ' + ((d.reasons && d.reasons[0]) || 'থামা'), '');
    setFillStatus('STOP — অটোফিল করা হয়নি');
  }
}
const _render0 = render; render = function () { _render0.apply(this, arguments); try { updSigBar(); } catch (e) { console.error('sig', e); } };
document.getElementById('sigBal').value = S.set.realBal || '';
document.getElementById('sigBal').onchange = e => { S.set.realBal = e.target.value; save(); SIG.fillKey=''; updSigBar(); };
document.getElementById('sigCopyS').onclick = () => SIG.stake != null && navigator.clipboard.writeText(String(SIG.stake));
document.getElementById('sigCopyC').onclick = () => SIG.t != null && navigator.clipboard.writeText(String(SIG.t.toFixed(2)));
const af=$('#autoFill');
af.checked=S.set.autoFill!==false;
af.onchange=()=>{S.set.autoFill=af.checked;SIG.fillKey='';save();if(af.checked)runAutoFill(true);else setFillStatus('অটোফিল বন্ধ');};
$('#autoFillNow').onclick=()=>runAutoFill(true);
updSigBar();

/* ===== অটো-বেট (আসল টাকা): পূরণ যাচাই হলে প্রতি রাউন্ডে সর্বোচ্চ একবার "Bet" ক্লিক =====
   সুরক্ষা: ডিফল্ট বন্ধ · চালুর আগে নিশ্চিতকরণ · আসল ব্যালেন্স দেওয়া বাধ্যতামূলক · বেট-সংখ্যা ও ক্ষতির সীমা */
function abStatus() { const e = document.getElementById('abSt'); if (e) e.textContent = AB.on ? `বেট ${AB.bets}/${AB.maxBets} · নেট ${AB.net >= 0 ? '+' : ''}${AB.net.toFixed(2)} (সীমা −${AB.maxLoss})` : ''; }
function abOff(why) {
  AB.on = false; AB.pending = null;
  const c = document.getElementById('autoBet'); if (c) c.checked = false;
  abStatus(); setFillStatus('🛑 অটো-বেট বন্ধ: ' + why, true);
}
function abAllowed() {
  if (!AB.on) return false;
  if (!(parseFloat(document.getElementById('sigBal').value) > 0)) { abOff('আসল ব্যালেন্স ঘর ফাঁকা'); return false; }
  if (AB.bets >= AB.maxBets) { abOff('সর্বোচ্চ বেট সংখ্যা (' + AB.maxBets + ') পূর্ণ'); return false; }
  if (AB.net <= -AB.maxLoss) { abOff('ক্ষতির সীমা (' + AB.maxLoss + ') ছুঁয়েছে'); return false; }
  return true;
}
function abSettle(x) {   // advLive থেকে: যে বেট দিয়েছি তার অনুমানিক আসল ফল
  const p = AB.pending; if (!p) return;
  AB.pending = null;
  if (p.n !== S.total) return;   // রাউন্ড মিস হয়েছে — গণনায় ধরি না
  AB.net += x >= p.t ? p.stake * (p.t - 1) : -p.stake;
  abStatus();
  if (AB.on && AB.net <= -AB.maxLoss) abOff('ক্ষতির সীমা (' + AB.maxLoss + ') ছুঁয়েছে');
}
(function abUi() { if (window.ANDROID) return;
  const anchor = document.getElementById('autoFillNow'); if (!anchor) return;
  const w = document.createElement('span'); w.style.cssText = 'margin-left:10px;white-space:nowrap';
  w.innerHTML = '<label style="color:#f0883e"><input type="checkbox" id="autoBet"> 🎯 অটো-বেট (আসল টাকা)</label> '
    + '<input id="abMaxBets" type="number" min="1" value="30" style="width:54px" title="সর্বোচ্চ বেট সংখ্যা"> '
    + '<input id="abMaxLoss" type="number" min="0" step="0.01" placeholder="ক্ষতি-সীমা" style="width:84px" title="এই পরিমাণ ক্ষতি হলে অটো-বেট বন্ধ"> <span id="abSt" class="m"></span>';
  anchor.after(w);
  document.getElementById('autoBet').onchange = e => {
    if (!e.target.checked) { AB.on = false; AB.pending = null; abStatus(); setFillStatus('অটো-বেট বন্ধ'); return; }
    const rb = parseFloat(document.getElementById('sigBal').value);
    if (!(rb > 0)) { e.target.checked = false; setFillStatus('⚠ অটো-বেটের আগে "আপনার ব্যালেন্স" ঘরে সাইটের আসল ব্যালেন্স দিন', true); return; }
    if (S.set.autoFill === false) { e.target.checked = false; setFillStatus('⚠ আগে অটোফিল চালু করুন', true); return; }
    const mb = Math.max(1, parseInt(document.getElementById('abMaxBets').value) || 30);
    const ml = parseFloat(document.getElementById('abMaxLoss').value) || Math.round(rb * 10) / 100;   // ডিফল্ট: ব্যালেন্সের ১০%
    if (!confirm('অটো-বেট চালু হলে সিগন্যাল অনুযায়ী আসল টাকায় প্রতি রাউন্ডে নিজে থেকে Bet চাপা হবে।\n\nসর্বোচ্চ বেট: ' + mb + '\nক্ষতির সীমা: ' + ml + '\n\nনিশ্চিত?')) { e.target.checked = false; return; }
    AB.maxBets = mb; AB.maxLoss = ml; AB.bets = 0; AB.net = 0; AB.clickedFor = -1; AB.pending = null; AB.on = true;
    document.getElementById('abMaxLoss').value = ml; abStatus(); setFillStatus('🎯 অটো-বেট চালু — পরের বেট সিগন্যালে');
  };
})();
