// 通用小工具

export const qs = new URLSearchParams(location.search);
export const DEMO = qs.get('demo') === '1';
export const DEBUG = qs.get('debug') === '1';
export const DATA = qs.get('data');
export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 建 DOM：h('div.cls#id', {attr}, ...children) */
export function h(tag, attrs, ...children) {
  if (attrs && (attrs instanceof Node || typeof attrs !== 'object' || Array.isArray(attrs))) {
    children.unshift(attrs); attrs = null;
  }
  const m = tag.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
    }
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) el.style.setProperty(sk, String(sv)); else el.style[sk] = sv; } }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 可取消的等待：resolve 于超时或 cancel() */
export function wait(ms) {
  let t, res;
  const p = new Promise((r) => { res = r; t = setTimeout(() => r('timeout'), ms); });
  p.cancel = () => { clearTimeout(t); res('cancel'); };
  return p;
}

/** 固定种子随机（演示模式） */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** {n} 占位符替换 */
export function fmt(tpl, vars) {
  return String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 相对时间（用于公共池） */
export function relTime(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = Math.max(0, Date.now() - t);
  const m = Math.floor(d / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const hh = Math.floor(m / 60);
  if (hh < 24) return `${hh} 小时前`;
  const dd = Math.floor(hh / 24);
  if (dd < 30) return `${dd} 天前`;
  return new Date(t).toLocaleDateString('zh-CN');
}

/**
 * 逐字打出（03 5.4：每字 40ms，点击可立刻打完）。
 * 返回 promise；调用 .finish() 立刻打完。
 */
export function typewriter(el, text, { perChar = 40, immediate = false } = {}) {
  const caret = h('span.caret');
  const txt = document.createTextNode('');
  el.append(txt, caret);
  let i = 0, done = false, timer = null, resolve;
  const p = new Promise((r) => { resolve = r; });
  const finish = () => {
    if (done) return; done = true; clearTimeout(timer);
    txt.data = text; el.classList.add('done'); resolve();
  };
  const step = () => {
    if (done) return;
    if (i >= text.length) return finish();
    txt.data = text.slice(0, ++i);
    timer = setTimeout(step, perChar);
  };
  if (immediate || REDUCED) finish(); else step();
  p.finish = finish;
  return p;
}

/** 点击/按键一次 */
export function onceTap(el) {
  return new Promise((r) => {
    const f = (e) => { el.removeEventListener('click', f); r(e); };
    el.addEventListener('click', f);
  });
}

export function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

/** 小KONT：把 assets/img/kont.svg 内联进页面，去掉元数据、id 改成 class，方便按部件做动画 */
let kontTemplate = null;
export async function loadKont(src = 'assets/img/kont.svg') {
  try {
    const txt = await (await fetch(src)).text();
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    const svg = doc.documentElement;
    if (svg.nodeName !== 'svg') return;
    svg.querySelectorAll('metadata, title, desc').forEach((n) => n.remove());
    svg.querySelectorAll('[id]').forEach((n) => { if (n.closest('defs')) return; n.setAttribute('class', `${n.getAttribute('class') || ''} part-${n.id}`.trim()); n.removeAttribute('id'); }); // defs 里的渐变 id 要保留
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.setAttribute('class', 'kont-svg');
    svg.setAttribute('aria-hidden', 'true');
    kontTemplate = svg;
  } catch { /* 没加载到就用 CSS 背景图兜底 */ }
}
export function mountKont(root) {
  if (!kontTemplate) return;
  root.querySelectorAll('.kont').forEach((el) => {
    if (el.firstElementChild) return;
    el.classList.add('inline');
    el.append(document.importNode(kontTemplate, true));
  });
}

/** 图片：加载失败时换成灰色占位块（03 第 7 节通用规则：缺图用灰色占位块，不阻塞） */
export function photo(src, cls = '') {
  const wrap = h('.ph', { class: `ph ${cls}`.trim() });
  if (!src) { wrap.classList.add('missing'); return wrap; }
  const img = h('img', { src, alt: '', draggable: 'false' });
  img.addEventListener('error', () => { img.remove(); wrap.classList.add('missing'); });
  wrap.append(img);
  return wrap;
}
