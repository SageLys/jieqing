// 五个章节过场·简版（03 第 6 节）。文字全部取自 chapters[n].transition。
// 每个函数：build(t, ctx) → { el, total }  total = 最后一个元素出现的时刻（ms）
// ctx.rnd 随机源（演示模式固定种子）；ctx.finished=true 时所有动画立即到最后一帧（回看用）。
import { h } from './util.js';

const delayStyle = (ms, finished) => ({ animationDelay: finished ? '0ms' : `${ms}ms`, animationDuration: finished ? '1ms' : undefined });

// 完整版（03 第 6 节 T1；设计意见 V2-006）：键盘从底部升起，B O R N 依次亮成薄荷绿并填进空格，键盘落下后"宝贝"页淡入
const KB_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
function keyboardStage(word, ctx) {
  const blanks = h('.kb-blanks', word.map((ch, i) => h('span', { style: delayStyle(900 + i * 250, ctx.finished) }, ch)));
  const kb = h('.kb', { style: ctx.finished ? { display: 'none' } : {} }, blanks);
  KB_ROWS.forEach((row) => {
    const r = h('.kb-row');
    row.split('').forEach((k) => {
      const idx = word.indexOf(k);
      r.append(h('span.key', { class: idx >= 0 ? 'key lit' : 'key', style: idx >= 0 ? delayStyle(900 + idx * 250, ctx.finished) : {} }, k));
    });
    kb.append(r);
  });
  kb.append(h('.kb-row', h('span.key.wide', '　'), h('span.key', '↵')));
  return kb;
}

function keyboard(t, ctx) {
  const word = (t.typeWord || '').toUpperCase().split('');
  const KB_MS = ctx.finished ? 0 : 900 + word.length * 250 + 900; // 键盘阶段总时长
  const el = h('.t1', { style: { animationDelay: `${KB_MS}ms` } },
    h('.word', word.map((ch, i) => h('b.t-line', { style: delayStyle(KB_MS + 200 + i * 120, ctx.finished) }, ch))),
    h('.photo',
      h('img', { src: t.image, alt: '' }),
    ),
  );
  const lines = t.lines || [];
  let at = KB_MS + 1200;
  if (lines[0]) el.append(h('p.l1.t-line', { style: delayStyle(at, ctx.finished) }, lines[0]));
  at += 1000;
  if (lines[1]) el.append(h('p.l2.t-line', { style: delayStyle(at, ctx.finished) }, lines[1]));
  at += 1000;
  const row = h('.row',
    t.handwriting ? h('img.hand.t-line', { src: t.handwriting, alt: '', style: delayStyle(at, ctx.finished) }) : null,
    lines[2] ? h('p.l3.t-line', { style: delayStyle(at + 400, ctx.finished) }, lines[2]) : null,
    (t.babble || [])[0] ? h('span.babble.t-line', { style: delayStyle(at + 1400, ctx.finished) }, t.babble[0]) : null,
  );
  el.append(row);
  at += 1000;
  el.append(h('.l4',
    lines[3] ? h('span.t-line', { style: delayStyle(at, ctx.finished) }, lines[3]) : null,
    (t.babble || [])[1] ? h('span.babble.t-line', { style: delayStyle(at + 800, ctx.finished) }, t.babble[1]) : null,
  ));
  const wrap = h('.t1-wrap', el, keyboardStage(word, ctx));
  if (!ctx.finished) wrap.style.setProperty('--kb-ms', `${KB_MS}ms`);
  return { el: wrap, total: at + 1400 };
}

function table(t, ctx) {
  const photo = h('.photo', h('img', { src: t.image, alt: '' }));
  [[8, 30], [30, 55], [55, 40], [75, 60]].forEach(([l, tp], i) => {
    photo.append(h('span.sq', { style: { left: `${l}%`, top: `${tp}%`, width: '14%', height: '22%', ...delayStyle(900 + i * 300, ctx.finished) } }));
  });
  const chars = h('.chars');
  const pos = [[8, 10, 40, -8], [40, 40, 56, 6], [66, 5, 32, 14], [78, 60, 28, -20]];
  (t.fallingChars || []).forEach((ch, i) => {
    const [l, tp, sz, rot] = pos[i % pos.length];
    chars.append(h('span', { style: { left: `${l}%`, top: `${tp}%`, fontSize: `${sz}px`, '--rot': `${rot}deg`, ...delayStyle(2300 + i * 400, ctx.finished) } }, ch));
  });
  chars.append(h('.bowl'));
  const el = h('.t2', photo, chars);
  let at = 2300 + (t.fallingChars || []).length * 400 + 400;
  (t.lines || []).forEach((l, i) => { el.append(h('p.line.t-line', { style: delayStyle(at + i * 800, ctx.finished) }, l)); });
  return { el, total: at + (t.lines || []).length * 800 + 600 };
}

function network(t, ctx) {
  const W = 360, H = 640;
  const nodes = t.nodes || [];
  const cx = W / 2, cy = H / 2 - 40;
  const pts = nodes.map((_, i) => {
    const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    const r = 130 + (i % 2) * 40;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const ns = (tag, attrs, text) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text) e.textContent = text;
    return e;
  };
  const dl = (ms) => ctx.finished ? 'animation-delay:0ms;animation-duration:1ms' : `animation-delay:${ms}ms`;
  let at = 300;
  // 中心节点 + 连线 + 人形（几何代替剪影）
  svg.append(ns('circle', { class: 'node', cx, cy, r: 26, style: dl(at) }));
  pts.forEach(([x, y], i) => {
    at += 500;
    svg.append(ns('line', { class: 'edge', x1: cx, y1: cy, x2: x, y2: y, style: dl(at) }));
    if (i > 0) svg.append(ns('line', { class: 'edge', x1: pts[i - 1][0], y1: pts[i - 1][1], x2: x, y2: y, style: dl(at + 200) }));
    // 简单几何人形：头 + 身
    const g = ns('g', { class: 'person', style: dl(at + 200) });
    g.append(ns('circle', { cx: x, cy: y - 22, r: 9 }));
    g.append(ns('path', { d: `M${x - 14},${y + 14} Q${x},${y - 14} ${x + 14},${y + 14} Z` }));
    svg.append(g);
    svg.append(ns('circle', { class: 'node', cx: x, cy: y, r: 18, style: dl(at + 300) }));
    svg.append(ns('text', { class: 'lbl', x, y: y + 40, 'text-anchor': 'middle', style: dl(at + 500) }, nodes[i]));
  });
  // 设计意见 V1-010 / V1-011：几何图形太单薄，底下垫一张手的黑白照片
  const el = h('.t3', h('img.bg.t-line', { src: t.image || 'assets/img/photo_hands_link.jpg', alt: '', style: delayStyle(0, ctx.finished) }), svg);
  at += 900;
  (t.lines || []).forEach((l, i) => el.append(h('p.line.t-line', { style: delayStyle(at + i * 800, ctx.finished) }, l)));
  return { el, total: at + (t.lines || []).length * 800 + 600 };
}

function chart(t, ctx) {
  // 设计意见 V1-011：表格底下垫照片（参考 book-p26）
  const grid = h('.grid', h('img.bg.t-line', { src: t.image || 'assets/img/photo_elder_hand.jpg', alt: '', style: delayStyle(0, ctx.finished) }));
  const pos = [[6, 8], [52, 20], [18, 42], [58, 56], [10, 72], [46, 84]];
  (t.stamps || []).forEach((s, i) => {
    const [l, tp] = pos[i % pos.length];
    grid.append(h('span.stamp', { style: { left: `${l}%`, top: `${tp}%`, ...delayStyle(800 + i * 600, ctx.finished) } }, s));
  });
  let at = 800 + (t.stamps || []).length * 600 + 300;
  grid.append(h('.xs', { style: delayStyle(at, ctx.finished) }, '×'.repeat(24)));
  const el = h('.t4', grid);
  at += 1200;
  (t.lines || []).forEach((l, i) => el.append(h('p.line.t-line', { style: delayStyle(at + i * 800, ctx.finished) }, l)));
  return { el, total: at + (t.lines || []).length * 800 + 600 };
}

function sea(t, ctx) {
  const el = h('.t5');
  const n = t.countLite || 80;
  const spread = Math.max(1000, (t.durationMs || 8000) - 3500);
  const rnd = ctx.rnd || Math.random;
  for (let i = 0; i < n; i++) {
    const size = 12 + Math.floor(rnd() * 84);
    const alpha = 0.25 + rnd() * 0.75;
    const bottomFirst = 100 - Math.sqrt(rnd()) * 100; // 底部更密（从底部开始涌现）
    el.append(h('span.sea', {
      style: {
        left: `${rnd() * 92}%`, top: `${bottomFirst}%`, fontSize: `${size}px`,
        color: `rgba(150, 255, 208, ${alpha})`, ...delayStyle(Math.floor((i / n) * spread), ctx.finished),
      },
    }, t.char || '海'));
  }
  let at = spread + 300;
  if (t.verse) el.append(h('.verse', { style: delayStyle(at, ctx.finished) }, t.verse));
  return { el, total: at + 2000 };
}

const BUILDERS = { keyboard, table, network, chart, sea };

/**
 * @returns {{el: HTMLElement, total: number}} total：动画自然结束的时刻（ms）
 */
export function buildTransition(chapter, ctx = {}) {
  const t = chapter.transition || {};
  const b = BUILDERS[t.type];
  if (!b) {
    const el = h('.t-fallback', { style: { padding: '40px' } }, (t.lines || []).map((l) => h('p.serif', l)));
    return { el, total: 1500 };
  }
  return b(t, ctx);
}
