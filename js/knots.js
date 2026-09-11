// 结绳系统（07 第 2 节；03 5.10、第 8 节）：计分、落成、方格渲染、调色。
// 规则（knotRules）、九种结（knots）、色板（finale.palette）全部来自 content.json；方格数据来自 content/knots.json。
import { h } from './util.js';

let knotCells = null; // { grid, knots: { knot_01: { grid, cells: [[x,y],…] } } }

export async function loadKnotCells(src = 'content/knots.json') {
  try {
    const res = await fetch(src, { cache: 'no-cache' });
    if (res.ok) knotCells = await res.json();
  } catch { /* 缺文件：renderKnot 退到灰色占位块 */ }
  return knotCells;
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

export function cellsOf(knot) {
  const d = knotCells?.knots?.[knot?.glyph];
  return d ? { grid: d.grid || knotCells.grid || 24, cells: d.cells || [] } : null;
}

/** 色板 id → hex（来自 finale.palette） */
export function paletteHex(content, id) {
  const p = (content.finale?.palette || []).find((x) => x.id === id);
  return p?.hex || null;
}

/**
 * 渲染一个结：<div class="knot" style="--size"> 内 grid×grid 的格子（只渲染有格的），data-i 是格子索引。
 * colors：{ all: paletteId, "i": paletteId }；all 作底，单格覆盖。默认黑色。
 */
export function renderKnot(content, knot, colors = {}, size = 240, { onCell = null, cls = '' } = {}) {
  const data = cellsOf(knot);
  const el = h('.knot', { class: `knot ${cls}`.trim(), style: { '--size': `${size}px` }, dataset: { knot: knot?.id || '' } });
  if (!data) {
    el.classList.add('placeholder');
    el.append(h('.knot-missing', { title: knot?.name || '' }));
    return el;
  }
  el.style.setProperty('--grid', String(data.grid));
  const base = paletteHex(content, colors.all) || null;
  data.cells.forEach(([x, y], i) => {
    const c = h('i.cell', { dataset: { i: String(i) }, style: { gridColumn: x + 1, gridRow: y + 1 } });
    const hex = paletteHex(content, colors[String(i)]) || base;
    if (hex) c.style.background = hex;
    if (onCell) c.addEventListener('click', (e) => { e.stopPropagation(); onCell(i, c); });
    el.append(c);
  });
  return el;
}

/** 给已渲染的结更新颜色（调色时用，不重建 DOM） */
export function paintKnot(content, el, colors = {}) {
  const base = paletteHex(content, colors.all) || '';
  el.querySelectorAll('.cell').forEach((c) => {
    const hex = paletteHex(content, colors[c.dataset.i]) || base;
    c.style.background = hex;
  });
}

/** 16px 像素小结（03 5.7）：系 = 实心，平 = 空心，解 = 断开一角。先用 CSS 拼，设计之后替换 knot_mini.svg */
export function miniKnot(tendency) {
  return h('span.knot-mini', { class: `knot-mini ${tendency}`, 'aria-hidden': 'true' });
}
