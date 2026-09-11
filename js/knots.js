// 结绳系统（07 第 2 节；03 5.10、第 8 节）：计分、落成、渲染、调色。
// 规则（knotRules）、九种结（knots）、色板（finale.palette）全部来自 content.json。
// v3（08 3.13）：结的图形直接内联 assets/img/knots/knot_XX.svg 渲染，不再栅格化到方格；每个 <rect> 是一个可上色的"方块"。
import { h } from './util.js';

const svgTemplates = new Map(); // glyph → <svg> 模板（已去 width/height，保留 viewBox）

/** 进站时把十个结的 SVG 全部解析成模板缓存（做法同 util.loadKont） */
export async function loadKnotSvgs(content, dir = 'assets/img/knots') {
  const glyphs = [...new Set((content?.knots || []).map((k) => k.glyph).filter(Boolean))];
  await Promise.all(glyphs.map(async (g) => {
    try {
      const res = await fetch(`${dir}/${g}.svg`, { cache: 'no-cache' });
      if (!res.ok) return;
      const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
      const svg = doc.documentElement;
      if (svg.nodeName !== 'svg') return;
      svg.querySelectorAll('metadata, title, desc').forEach((n) => n.remove());
      svg.removeAttribute('width'); svg.removeAttribute('height');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      let i = 0;
      svg.querySelectorAll('rect').forEach((r) => { r.setAttribute('data-i', String(i++)); r.setAttribute('class', 'cell'); r.setAttribute('fill', 'currentColor'); });
      svgTemplates.set(g, svg);
    } catch { /* 缺文件：renderKnot 退到灰色占位块 */ }
  }));
  return svgTemplates;
}

/** 六次出手的统计（07 2.2）。scoredBeats 来自 knotRules；找不到选择的拍按 0 计。 */
export function computeStats(content, picks) {
  const beats = content.knotRules?.scoredBeats || [];
  const byBeat = {};
  for (const q of content.questions || []) for (const b of q.beats || []) byBeat[b.id] = b;
  let tie = 0, even = 0, loose = 0, sum = 0, aiPicks = 0;
  const detail = [];
  for (const beatId of beats) {
    const opt = (byBeat[beatId]?.options || []).find((o) => o.id === picks[beatId]);
    const score = [1, 0, -1].includes(opt?.score) ? opt.score : 0;
    if (score > 0) tie++; else if (score < 0) loose++; else even++;
    sum += score;
    if (opt?.source?.kind === 'ai') aiPicks++;
    detail.push({ beatId, optionId: opt?.id || null, score });
  }
  return { tie, even, loose, sum, aiPicks, detail, count: beats.length };
}

/** 单拍的倾向（揭晓后的提示用） */
export function tendencyOf(score) {
  return score > 0 ? 'tie' : score < 0 ? 'loose' : 'even';
}

/**
 * 落成（07 2.3）：deadWhen=noTie 且 tie==0 → dead 的那个结；否则按 sum 落进第一个 maxSum >= sum 的档，档内随机。
 * rnd：演示模式传固定种子的随机源。
 */
export function pickKnot(content, stats, rnd = Math.random) {
  const knots = content.knots || [];
  const byId = Object.fromEntries(knots.map((k) => [k.id, k]));
  const rules = content.knotRules || {};
  if (rules.deadWhen === 'noTie' && stats.tie === 0) {
    const dead = knots.find((k) => k.dead);
    if (dead) return { knot: dead, dead: true, band: null };
  }
  const bands = (rules.bands || []).slice().sort((a, b) => a.maxSum - b.maxSum);
  let band = bands.find((b) => stats.sum <= b.maxSum) || bands[bands.length - 1];
  const pool = (band?.knots || []).map((id) => byId[id]).filter(Boolean);
  if (!pool.length) return { knot: knots[0] || null, dead: false, band };
  const knot = pool[Math.floor(rnd() * pool.length) % pool.length];
  return { knot, dead: !!knot?.dead, band };
}

/** 结的每个方块（rect）的中心，含 transform（F3 演示模式"离中心最近的一格"用） */
export function rectsOf(knot) {
  const tpl = svgTemplates.get(knot?.glyph);
  if (!tpl) return null;
  const vb = (tpl.getAttribute('viewBox') || '0 0 100 100').split(/[\s,]+/).map(Number);
  const rects = [...tpl.querySelectorAll('rect')].map((r, i) => {
    const x = Number(r.getAttribute('x') || 0), y = Number(r.getAttribute('y') || 0);
    const w = Number(r.getAttribute('width') || 0), hh = Number(r.getAttribute('height') || 0);
    let cx = x + w / 2, cy = y + hh / 2;
    const tr = r.getAttribute('transform') || '';
    const t = tr.match(/translate\(\s*([-\d.]+)[\s,]+([-\d.]+)/), rot = tr.match(/rotate\(\s*([-\d.]+)/);
    if (rot) { const a = (Number(rot[1]) * Math.PI) / 180; const nx = cx * Math.cos(a) - cy * Math.sin(a), ny = cx * Math.sin(a) + cy * Math.cos(a); cx = nx; cy = ny; }
    if (t) { cx += Number(t[1]); cy += Number(t[2]); }
    return { i, cx, cy };
  });
  return { viewBox: { x: vb[0], y: vb[1], w: vb[2], h: vb[3] }, rects };
}

/** 色板 id → hex（来自 finale.palette） */
export function paletteHex(content, id) {
  const p = (content.finale?.palette || []).find((x) => x.id === id);
  return p?.hex || null;
}

/**
 * 渲染一个结：<div class="knot" style="--size"> 内直接是设计稿的 SVG（只缩放，不变形），每个 rect 带 data-i。
 * colors：{ all: paletteId, "i": paletteId }；all 作底，单块覆盖。默认 currentColor（黑；结束页白）。
 */
export function renderKnot(content, knot, colors = {}, size = 240, { onCell = null, cls = '' } = {}) {
  const tpl = svgTemplates.get(knot?.glyph);
  const el = h('.knot', { class: `knot ${cls}`.trim(), style: { '--size': `${size}px` }, dataset: { knot: knot?.id || '' } });
  if (!tpl) {
    el.classList.add('placeholder');
    el.append(h('.knot-missing', { title: knot?.name || '' }));
    return el;
  }
  const svg = document.importNode(tpl, true);
  el.append(svg);
  paintKnot(content, el, colors);
  if (onCell) {
    svg.querySelectorAll('rect.cell').forEach((c) => {
      c.addEventListener('click', (e) => { e.stopPropagation(); onCell(Number(c.dataset.i), c); });
    });
  }
  return el;
}

/** 给已渲染的结更新颜色（调色时用，不重建 DOM）：按 rect 序号生效 */
export function paintKnot(content, el, colors = {}) {
  const base = paletteHex(content, colors.all) || 'currentColor';
  el.querySelectorAll('rect.cell').forEach((c) => {
    c.setAttribute('fill', paletteHex(content, colors[c.dataset.i]) || base);
  });
}

/** 16px 像素小结（03 5.7）：系 = 实心，平 = 空心，解 = 断开一角。先用 CSS 拼，设计之后替换 knot_mini.svg */
export function miniKnot(tendency) {
  return h('span.knot-mini', { class: `knot-mini ${tendency}`, 'aria-hidden': 'true' });
}
