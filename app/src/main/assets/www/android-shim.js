/* Electron <webview> ও window.api-এর বদলে Android নেটিভ ব্রিজ (Android = JavascriptInterface) */
(function () {
  window.ANDROID = true;
  const el = document.getElementById('wv');
  const A = window.Android;
  const pending = {}; let seq = 0;
  const nid = () => 'x' + Date.now().toString(36) + (seq++);

  window.__wvEvent = (name, url) => { const e = new Event(name); e.url = url; el.dispatchEvent(e); };
  window.__wvRes = (id, json) => {
    const p = pending[id]; if (!p) return; delete pending[id];
    let r; try { r = JSON.parse(json); } catch (e) { return p.rej(new Error('bad result')); }
    if (r.e) return p.rej(new Error(r.e));
    try { p.res(r.v == null ? null : JSON.parse(r.v)); } catch (e) { p.res(null); }
  };

  if (!A) { console.warn('Android bridge নেই'); return; }

  el.executeJavaScript = code => new Promise((res, rej) => {
    const id = nid(); pending[id] = { res, rej };
    setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error('dom-ready timeout')); } }, 12000);
    A.exec(id, String(code));
  });
  el.insertCSS = css => { A.insertCSS(String(css)); return Promise.resolve(); };
  el.loadURL = u => A.loadUrl(String(u));
  el.goBack = () => A.goBack();
  el.goForward = () => A.goForward();
  el.reload = () => A.reload();
  el.canGoBack = () => true;
  el.canGoForward = () => true;
  el.setZoomFactor = z => A.setZoom(z);

  /* গেম WebView নেটিভ স্তরে #wv ঘরের ঠিক ওপরে বসে — মাপ/অবস্থান সিঙ্ক */
  let last = '';
  function sync() {
    const r = el.getBoundingClientRect();
    const vis = r.width > 10 && r.height > 10 && getComputedStyle(el).display !== 'none';
    const k = [r.left, r.top, r.width, r.height, vis].map(v => typeof v === 'number' ? Math.round(v) : v).join('|');
    if (k === last) return; last = k;
    A.setRect(r.left, r.top, r.width, r.height, vis);
  }
  if (window.ResizeObserver) new ResizeObserver(sync).observe(el);
  window.addEventListener('resize', sync);
  setInterval(sync, 400);
  setTimeout(sync, 50);

  window.api = {
    saveFile: (name, content) => new Promise(r => { window.__fileDone = r; A.saveFile(String(name), String(content)); }),
    openFile: () => new Promise(r => { window.__fileOpened = r; A.openFile(); })
  };
})();
