// 各屏渲染（v2）。每个函数接收 (step, ctx)，返回一个 .screen 元素。
// ctx.app 是 App；ctx.review 表示回看（只读）；ctx.after / ctx.wait 是会随屏幕销毁而作废的定时器。
import { h, fmt, typewriter, relTime, REDUCED, setPatrol, fitOnResize, media, playOnFirstTap } from './util.js';
import { buildTransition, makeRuntime } from './transitions.js';
import { renderKnot, paintKnot, miniKnot, tendencyOf, rectsOf } from './knots.js';

/* ---------------- 公共组件 ---------------- */
const tailSvg = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 36 36');
  s.setAttribute('class', 'tail');
  s.innerHTML = '<path d="M34 2 L6 20 L16 22 L20 34 Z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>';
  return s;
};

function backBtn(app) {
  const back = h('button.btn-back', { type: 'button', 'aria-label': app.ui.back || '返回', onclick: (e) => { e.stopPropagation(); app.back(); } });
  if (!app.canGoBack()) back.disabled = true;
  return back;
}
/** 过场 / 章扉页的简顶栏：只有返回键 */
function topbar(ctx) {
  return h('.topbar', backBtn(ctx.app));
}

/** 聊天框架的顶栏（03 第 4 节，ui-04）：历史档案 / what；右侧是空占位（v3 F12 删掉了"相关社区"，ui.community 保留不再引用） */
function chatTop(ctx) {
  const app = ctx.app, ui = app.ui;
  const archive = h('button.chat-icon', { type: 'button', onclick: () => { if (app.canGoBack()) app.back(); } },
    h('img', { src: 'assets/img/icon_archive.svg', alt: '' }), h('span', ui.archive || ''));
  return h('.chat-top',
    h('.chat-top-left', backBtn(app), archive),
    h('.chat-what', ui.what || 'what'),
    h('.chat-top-right', { 'aria-hidden': 'true' }));
}
/** 输入栏：问答期间是"输入中…"状态提示条（v3 F15，点它抖一下不响应）；F4 时 enabled 才是真输入框 */
function inputBar(app, { enabled = false, placeholder = null, onSubmit = null, maxLength = 200, submitLabel = '' } = {}) {
  if (!enabled) {
    const label = String(placeholder ?? (app.ui.inputPlaceholder || '')).replace(/[….]+$/, '');
    const typing = h('.typing', label, h('i', '.'), h('i', '.'), h('i', '.'));
    const send = h('span.send.deco', { 'aria-hidden': 'true' });
    const bar = h('.inputbar.deco', { role: 'status', 'aria-label': app.ui.inputPlaceholder || '' }, typing, send);
    bar.addEventListener('click', (e) => { e.stopPropagation(); bar.classList.remove('shake'); void bar.offsetWidth; bar.classList.add('shake'); });
    return { bar, ta: null, send };
  }
  const ta = h('textarea', { placeholder: placeholder ?? (app.ui.inputPlaceholder || ''), maxlength: maxLength, rows: 1, 'aria-label': placeholder || '' });
  const send = h('button.send', { type: 'button', disabled: true, 'aria-label': submitLabel || 'send' });
  const bar = h('.inputbar', ta, send);
  if (onSubmit) {
    ta.addEventListener('input', () => { send.disabled = ta.value.trim().length === 0; });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!send.disabled) onSubmit(); } });
    send.addEventListener('click', onSubmit);
  }
  return { bar, ta, send };
}
/** 聊天框架整屏：返回 { el, body, bar } */
function chatFrame(ctx, opts = {}) {
  const app = ctx.app;
  const body = h('.chat-body');
  const input = inputBar(app, opts.input || {});
  const frame = h('.chat-frame', body, input.bar);
  const el = h('.screen.chat', chatTop(ctx), frame, h('.kont.corner-left'));
  return { el, body, ...input };
}

function dots(app, ci) {
  const chs = app.c.chapters || [];
  const el = h('.dots');
  chs.forEach((ch, i) => {
    const col = `var(--c-${ch.color || 'black'})`;
    const cls = i < ci ? 'dot done' : i === ci ? 'dot cur' : 'dot';
    el.append(h('span', { class: cls, style: i <= ci ? { background: col } : {} }));
    if (i < chs.length - 1) {
      const nextCol = `var(--c-${chs[i + 1].color || 'black'})`;
      const on = i < ci;
      el.append(h('span', { class: on ? 'dot-neck on' : 'dot-neck', style: on ? { background: `linear-gradient(90deg, ${col}, ${nextCol})` } : {} }));
    }
  });
  return el;
}

function actionBtn(app, text, onclick, extra = '') {
  return h('button.btn-action' + (extra ? '.' + extra : ''), { type: 'button', onclick: (e) => { e.stopPropagation(); onclick(e); } }, text);
}
const nextBtn = (ctx, extra) => actionBtn(ctx.app, ctx.app.ui.next || '继续', () => ctx.app.next(), extra);

/** 小KONT 气泡 + 逐字。immediate=true 直接打完 */
function bubble(text, side, immediate) {
  const b = h('.bubble', { class: `bubble ${side}` });
  const p = typewriter(b, text, { immediate });
  b.append(tailSvg());
  b.addEventListener('click', () => p.finish());
  return { el: b, done: p };
}
/** 依次出现多条气泡；返回全部结束的 promise */
async function bubbleSeq(ctx, container, lines, { gapMs = 500, immediate = false } = {}) {
  for (let i = 0; i < lines.length; i++) {
    if (!ctx.alive) return;
    const { el, done } = bubble(lines[i], i % 2 === 0 ? 'right' : 'left', immediate);
    container.append(el);
    el.scrollIntoView({ block: 'nearest' });
    await done;
    if (!immediate) await ctx.wait(gapMs);
  }
}
const askBubble = (text) => {
  const b = h('.bubble.ask.done', text);
  b.append(tailSvg());
  return b;
};

/* ---------------- S0 封面（ui-03） ---------------- */
// v3（08 3.1）：所有位置是相对 .cover-stage 的百分比，照 ui-03 落位。照片位置来自 content.cover.photos[].{x,y,w}（不再按年龄算）；
// "?" 永远最上层（z-index 4），照片都不进 "?" 区（x<34% 且 y<34%）和标题区。入场顺序沿用 v1：? 逐块 → 刻度尺 → 标题 → 照片掉落 → 雨。
function cover(step, ctx) {
  const app = ctx.app, c = app.c, cv = c.cover || {};
  const rnd = app.rnd;
  const ticks = (cls) => {
    const list = h('.cover-ruler-list');
    for (let v = 0; v <= 100; v += 5) list.append(h('span', v === 0 ? '零' : v === 100 ? '百' : String(v)));
    return h('.cover-ruler', { class: `cover-ruler ${cls}` }, list, list.cloneNode(true));
  };
  const blocks = h('.cover-blocks');
  [[28, 0], [0, 28], [56, 42], [56, 70], [28, 98], [28, 154]].forEach(([l, t], i) => {
    blocks.append(h('.blk', { style: { left: `${l}px`, top: `${t}px`, animationDelay: `${i * 120}ms` } }));
  });
  // 五条色条（宽 4–6px、长 40–70px）与三块黑方块（8–12px）：相对分布照 ui-03，避开照片
  const bars = [
    ['red', 90, 14, 5, 60, true], ['yellow', 26, 46, 5, 60, true], ['green', 36, 84, 6, 50, true],
    ['cyan', 34, 41, 60, 5, false], ['red', 40, 93, 50, 4, false],
  ].map(([col, l, t, a, b, vert], i) => h('.cover-bar', { class: `cover-bar ${col}`, style: { left: `${l}%`, top: `${t}%`, width: `${a}px`, height: `${b}px`, animationDelay: `${1400 + i * 160}ms` } }));
  const blacks = [[24, 40, 12], [52, 60, 8], [70, 60, 10]].map(([l, t, s], i) => h('.cover-black', { style: { left: `${l}%`, top: `${t}%`, width: `${s}px`, height: `${s}px`, animationDelay: `${2000 + i * 200}ms` } }));
  const stage = h('.cover-stage', ticks('l'), ticks('r'),
    h('.cover-title', h('.zh', cv.title || c.meta?.title || ''), (cv.titleEn || c.meta?.titleEn) ? h('.en', cv.titleEn || c.meta?.titleEn) : null),
    ...bars, ...blacks);
  // 雨线：1.5px 宽、5–9% 高，七条
  const drops = [[30, 44, 9], [60, 58, 6], [62, 80, 9], [80, 86, 6], [22, 70, 5], [48, 20, 5], [86, 30, 7]];
  drops.forEach(([l, t, hgt], i) => {
    stage.append(h('.cover-line', { style: { left: `${l}%`, top: `${t}%`, height: `${hgt}%`, animationDuration: `${4 + (i % 3) * 1.3}s`, animationDelay: `${-(i * 0.9)}s` } }));
  });
  // RAIN（F02）：六个 44×12 的小容器，字母在容器内横向循环跑（第四处竖排纵向跑），容器裁切不越界
  const rainWord = String(cv.rain || 'RAIN');
  const period = `${rainWord} ${rainWord} `;
  [[14, 15, false], [25, 34, false], [76, 63, false], [82, 73, true], [52, 80, false], [60, 90, false]].forEach(([l, t, vert], i) => {
    stage.append(h('.cover-rain', { class: `cover-rain${vert ? ' vert' : ''}`, style: { left: `${l}%`, top: `${t}%`, animationDelay: `${-i * 0.15}s` } },
      h('span.run', { style: { animationDuration: `${5 + (i % 3)}s`, animationDelay: `${-i * 1.1}s` } }, period + period)));
  });
  (cv.photos || []).forEach((p) => {
    const delay = 2000 + Math.floor(rnd() * 1200);
    const x = Number(p.x) || 0, y = Number(p.y) || 0, w = Number(p.w) || 0;
    stage.append(h('.cover-photo', { style: { left: `${x}%`, top: `${y}%`, width: `${w}%`, animationDelay: `${delay}ms` } }, h('img', { src: p.src, alt: '', draggable: 'false' })));
  });
  stage.append(blocks); // 最后追加 + z-index 4：任何照片不得盖住 "?"
  const cta = h('button.cover-cta', { type: 'button', onclick: () => { app.activateAudio(); app.next(); } },
    h('img', { src: 'assets/img/folder_open.svg', alt: '' }), h('span.txt', cv.cta || app.ui.start || '开启'));
  stage.append(cta);
  if (app.demo) ctx.after(app.timing('coverMs', 5000), () => app.next());
  return h('.screen.full', stage);
}

/* ---------------- L 加载页（ui-07） ---------------- */
function loading(step, ctx) {
  const app = ctx.app;
  const blk = (l, t, w = 60) => h('.lb', { style: { left: `${l}%`, top: `${t}%`, width: `${w}px`, height: `${w}px` } });
  // 文件夹上的色条：红（竖）、黄（横）、绿（竖）、青（方块）
  const bars = [
    h('.lc.red', { style: { left: '60%', top: '2%', width: '10px', height: '120px' } }),
    h('.lc.yellow', { style: { left: '46%', top: '40%', width: '150px', height: '28px' } }),
    h('.lc.green', { style: { left: '14%', top: '52%', width: '8px', height: '90px' } }),
    h('.lc.cyan', { style: { left: '70%', top: '70%', width: '44px', height: '44px' } }),
  ];
  // v3（08 3.2）："?" 方块组包成 .load-q 上下摆；文件夹与色条不动；进度条填满后按相位波动；三只小KONT 底部上跳回落
  const main = h('.load-main',
    h('.load-fig',
      h('.load-q', blk(44, 8), blk(20, 22), blk(62, 22), h('.lw'), blk(62, 36), blk(44, 46), blk(44, 72)),
      h('img.load-folder', { src: 'assets/img/folder_open.svg', alt: '' }),
      ...bars));
  const thumb = h('.load-thumb', h('.load-fig', h('.load-q', blk(46, 6, 18), blk(28, 20, 18), blk(60, 30, 18), blk(46, 62, 18)), h('img.load-folder', { src: 'assets/img/folder_open.svg', alt: '' })));
  const bar = h('.load-bar');
  for (let i = 0; i < 24; i++) bar.append(h('i', { style: { '--d': `${300 + i * 110}ms` } }));
  const stage = h('.load-stage',
    thumb, h('img.load-avatar', { src: 'assets/img/icon_account.svg', alt: '' }),
    main, bar, h('.load-text', app.ui.loading || ''),
    h('.kont.load-pose.p1'), h('.kont.load-pose.p2'), h('.kont.load-pose.p3'));
  const el = h('.screen.full', stage);
  ctx.after(app.timing('loadingMs', 3600), () => app.next());
  if (!app.demo) stage.addEventListener('click', () => app.next());
  return el;
}

/* ---------------- S1 小KONT 开场（ui-04） ---------------- */
function intro(step, ctx) {
  const app = ctx.app, host = app.c.host || {};
  const stack = h('.bubble-stack');
  const body = h('.chat-body', stack);
  const ctaRow = h('.cta-row', { hidden: true });
  const { bar } = inputBar(app);
  const frame = h('.chat-frame', body, ctaRow, bar);
  const el = h('.screen.chat', chatTop(ctx), frame, h('.kont.corner-left'));
  const lines = host.intro || [];
  (async () => {
    await bubbleSeq(ctx, stack, lines, { gapMs: app.demo ? Math.max(200, app.timing('introLineMs', 2000) - 40 * 20) : 500 });
    if (!ctx.alive) return;
    ctaRow.hidden = false;
    ctaRow.append(actionBtn(app, host.introCta || app.ui.next, () => app.next()));
    ctaRow.scrollIntoView({ block: 'nearest' });
    if (app.demo) ctx.after(1200, () => app.next());
  })();
  return el;
}

/* ---------------- S2 目录（ui-09） ---------------- */
function toc(step, ctx) {
  const app = ctx.app, c = app.c;
  const list = h('.toc-list');
  const indents = [24, 88, 152, 88, 40];
  (c.chapters || []).forEach((ch, i) => {
    list.append(h('button.toc-item', { type: 'button', disabled: i !== 0, style: { marginLeft: `${indents[i % indents.length]}px`, '--dot': `var(--c-${ch.color || 'black'})` }, onclick: () => app.next() },
      h('span.zh', ch.stage), h('span.en', ch.en)));
  });
  const body = h('.toc-body', list, h('.toc-spacer'));
  const knob = h('span.knob');
  const track = h('.toc-track', knob, h('span.hint', c.toc?.hint || ''));
  const tip = h('.toc-tip', { hidden: true }, c.host?.tocTooltip || '');
  const el = h('.screen.full',
    h('.toc-top', h('.toc-brand', h('img', { src: 'assets/img/icon_memory_factory.svg', alt: '' }), c.toc?.title || ''), h('img.toc-avatar', { src: 'assets/img/icon_account.svg', alt: '' })),
    body, track,
    h('.toc-kont', tip, h('.kont', { dataset: { firstLine: c.host?.tocTooltip || '' } })));
  ctx.after(700, () => { tip.hidden = false; });
  // 点小KONT 出台词后，"我是你的助手～"的提示收起（台词由 main.js 统一挂的 kontTalk 负责）
  el.querySelector('.toc-kont .kont').addEventListener('click', () => { tip.hidden = true; });
  let fired = false;
  const onScroll = () => {
    const max = body.scrollHeight - body.clientHeight;
    const p = max > 0 ? Math.min(1, body.scrollTop / max) : 0;
    knob.style.transform = `translateY(${p * Math.max(0, track.clientHeight - knob.offsetHeight - 8)}px)`;
    if (p >= 0.98 && !fired && !ctx.review) { fired = true; ctx.after(250, () => app.next()); }
  };
  body.addEventListener('scroll', onScroll, { passive: true });
  // 轨道可拖：按住圆钮往下拖，页面跟着滚，拖到底进入第一章（点轨道空白处也算滑到底）
  let dragging = false;
  const dragTo = (clientY) => {
    const r = track.getBoundingClientRect();
    const span = Math.max(1, track.clientHeight - knob.offsetHeight - 8);
    const p = Math.min(1, Math.max(0, (clientY - r.top - knob.offsetHeight / 2 - 4) / span));
    body.scrollTop = p * (body.scrollHeight - body.clientHeight);
    onScroll();
  };
  track.addEventListener('pointerdown', (e) => {
    if (ctx.review) return;
    dragging = true; track.setPointerCapture(e.pointerId); track.classList.add('dragging');
    dragTo(e.clientY); e.preventDefault();
  });
  track.addEventListener('pointermove', (e) => { if (dragging) dragTo(e.clientY); });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false; track.classList.remove('dragging');
    const max = body.scrollHeight - body.clientHeight;
    if (max > 0 && body.scrollTop / max < 0.98) body.scrollTo({ top: 0, behavior: 'smooth' }); // 没拖到底：弹回去
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  // v3（08 3.3 / F06）：整屏纵向滑动手势——位移 ≥ 60px（上滑下滑都算）→ 圆钮平滑滑到底 → 250ms 后进第一章；滚轮累计 ≥ 120 同样触发
  const SWIPE = 60, WHEEL = 120;
  let y0 = null, wheelAcc = 0, swiped = false;
  const trigger = () => {
    if (swiped || fired || ctx.review) return;
    swiped = true; fired = true;
    body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
    ctx.after(250, () => app.next());
  };
  el.addEventListener('pointerdown', (e) => { if (e.target.closest('.toc-track, .toc-kont, .btn-action')) { y0 = null; return; } y0 = e.clientY; });
  el.addEventListener('pointermove', (e) => { if (y0 == null) return; if (Math.abs(e.clientY - y0) >= SWIPE) { y0 = null; trigger(); } });
  el.addEventListener('pointerup', () => { y0 = null; });
  el.addEventListener('pointercancel', () => { y0 = null; });
  // 触摸：原生滚动一开始浏览器就会 pointercancel，所以另听 touch 事件（passive，不拦滚动）
  let ty0 = null;
  el.addEventListener('touchstart', (e) => { ty0 = e.target.closest('.toc-track, .toc-kont, .btn-action') ? null : e.touches[0]?.clientY ?? null; }, { passive: true });
  el.addEventListener('touchmove', (e) => { if (ty0 == null) return; const y = e.touches[0]?.clientY; if (y != null && Math.abs(y - ty0) >= SWIPE) { ty0 = null; trigger(); } }, { passive: true });
  el.addEventListener('touchend', () => { ty0 = null; }, { passive: true });
  el.addEventListener('wheel', (e) => { wheelAcc += Math.abs(e.deltaY); if (wheelAcc >= WHEEL) trigger(); }, { passive: true });
  if (app.demo) {
    const total = app.timing('tocMs', 4000);
    ctx.after(Math.max(600, total - 1600), () => body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' }));
    ctx.after(total, () => { if (!fired) app.next(); });
  }
  return el;
}

/* ---------------- C 章扉页（ui-01 / 08 / 17 / 20 / 23） ---------------- */
function chapter(step, ctx) {
  const app = ctx.app, ch = step.ch;
  const letters = (ch.en || '').split('');
  const en = h('.chapter-en');
  const n = letters.length, spread = 30;
  letters.forEach((L, i) => {
    const t = n === 1 ? 0 : (i / (n - 1) - 0.5);
    const ang = t * spread, R = 340;
    const x = Math.sin((ang * Math.PI) / 180) * R;
    const y = (1 - Math.cos((ang * Math.PI) / 180)) * R;
    // v3：弧线定位在外层 span，上下摆动在内层 b（错相位）
    en.append(h('span', { style: { transform: `translate(calc(${x}px - 50%), ${y}px) rotate(${ang}deg)` } }, h('b', { style: { animationDelay: `${-i * 0.25}s` } }, L)));
  });
  const kont = h('.kont.lg.chapter-kont');
  let going = false;
  const go = () => {
    if (going) return; going = true;
    // v3（08 3.4）：小KONT 原地加速跳 600ms 再进过场 a（不再跑出画面）
    kont.classList.add('go');
    ctx.after(REDUCED ? 200 : app.timing('kontRunMs', 600), () => app.next());
  };
  const stage = h('.chapter-stage',
    h('.chapter-title', ch.stage),
    en,
    h('.chapter-range', `${ch.ageRange?.[0]} – ${ch.ageRange?.[1]}`),
    h('.chapter-action', kont, actionBtn(app, app.ui.action || 'action', go)));
  const el = h('.screen.chapter-page', topbar(ctx), stage, dots(app, step.ci));
  if (app.demo && !ctx.review) ctx.after(app.timing('chapterMs', 3000), go);
  return el;
}

/* ---------------- T 过场（每章两屏） ---------------- */
// v3（08 2.2）：十屏统一"黑线外框 + 390×700 画布缩放 + 框下小KONT 横向来回"。
export const CANVAS_W = 390, CANVAS_H = 700;
function transition(step, ctx) {
  const app = ctx.app;
  const stage = h('.trans-stage');
  const canvas = h('.trans-canvas', stage);
  const frame = h('.trans-frame', canvas);
  const rt = makeRuntime(ctx, stage, frame);
  const { el: inner, play } = buildTransition(step.screen, rt);
  stage.append(inner);
  if (rt.finished) stage.classList.add('finished');
  const kont = h('.kont.patrol');
  if (step.si === 0 && !ctx.review) kont.classList.add('enter'); // 章扉页 → 过场 a：从框下左侧跑入
  const foot = h('.trans-foot', kont);
  const el = h('.screen.trans', topbar(ctx), frame, foot);
  // 画布按框的尺寸等比缩放并居中；框下的巡逻距离按 foot 宽度算（永远在框宽内）
  const fit = () => {
    const w = frame.clientWidth, hgt = frame.clientHeight;
    if (!w || !hgt) return;
    const sc = Math.min(w / CANVAS_W, hgt / CANVAS_H);
    canvas.style.transform = `translate(${Math.round((w - CANVAS_W * sc) / 2)}px, ${Math.round((hgt - CANVAS_H * sc) / 2)}px) scale(${sc})`;
    setPatrol(kont);
  };
  fitOnResize(frame, fit);
  if (ctx.review) { play().catch(() => {}); return el; }
  const t0 = Date.now();
  (async () => {
    const auto = await play();
    if (!ctx.alive) return;
    if (auto) { app.next(); return; }
    if (app.demo) {
      const left = app.timing('transitionScreenMs', 6000) - (Date.now() - t0);
      ctx.after(Math.max(400, left), () => app.next());
    } else {
      await rt.tap();
      if (ctx.alive) app.next();
    }
  })().catch((e) => console.error('[transition]', e));
  return el;
}

/* ---------------- Q 题面 ---------------- */
function prompt(step, ctx) {
  const app = ctx.app, q = step.q;
  const { el, body } = chatFrame(ctx);
  // v3 F14：questions[n].video 有值 → 题面上方 16:9 静音循环短片（黑线框）；无值不插
  if (q.video) {
    const ph = media(q.image || null, q.video, 'video-16x9');
    body.append(h('.prompt-video.fade-in', ph));
    playOnFirstTap(el, ph); // autoplay 被拒（iOS 低电量）时，第一次按下补播
  }
  body.append(h('p.prompt-text.fade-in', q.prompt));
  if (!ctx.review) {
    body.addEventListener('click', () => app.next());
    ctx.after(app.demo ? app.timing('promptMs', 4000) : 3500, () => app.next());
  }
  return el;
}

/* ---------------- Q 作答 ---------------- */
function optionCard(letter, o) {
  // 作答前：DOM 里不出现任何来源信息与 score
  return h('button.opt', { type: 'button', dataset: { id: o.id } }, h('span.opt-letter', letter), h('span.opt-text', o.text));
}
const LETTERS = 'ABCDEFGH';

function answering(step, ctx) {
  const app = ctx.app, q = step.q, beat = step.beat;
  const opts = app.optionsOf(beat);
  const list = h('.options');
  const cards = opts.map((o, i) => optionCard(LETTERS[i], o));
  cards.forEach((c) => list.append(c));
  const { el, body } = chatFrame(ctx);
  body.append(h('p.prompt-text', q.prompt), askBubble(beat.ask), list);
  let locked = false;
  const choose = (card) => {
    if (locked) return;
    locked = true;
    card.classList.add('selected');
    list.classList.add('locked');
    cards.forEach((c) => { c.disabled = true; });
    app.picks[beat.id] = card.dataset.id;
    if (!app.demo) app.store.addVote(beat.id, card.dataset.id);
    ctx.after(600, () => app.next());
  };
  cards.forEach((c) => c.addEventListener('click', () => choose(c)));
  if (app.demo) {
    ctx.after(app.timing('answeringMs', 6000), () => {
      const pick = app.demoPick(beat);
      choose(cards.find((c) => c.dataset.id === pick.id) || cards[0]);
    });
  }
  return el;
}

/* ---------------- Q 揭晓 ---------------- */
function humanTag(app, s) {
  const ageText = s.ageLabel || (Number.isInteger(s.age) ? `${s.age} ${app.ui.ageUnit || '岁'}` : '');
  return h('.reveal-tag', `${s.origin || ''} · ${ageText}`, s.dialect ? h('span.dialect', s.dialect) : null);
}

/** 把一张已作答的卡片变成揭晓态（真人卡与 AI 卡同款，03 5.7）。录音不再与卡片或选项绑定。 */
function revealCard(app, card, o, { selected, immediateAi = false }) {
  const s = o.source || {};
  card.disabled = true;
  card.classList.toggle('selected', !!selected);
  if (s.kind === 'human') {
    const block = h('.reveal-human', humanTag(app, s));
    card.append(block);
  } else if (s.kind === 'ai') {
    const label = h('span.reveal-ai');
    card.append(label);
    typewriter(label, fmt(app.ui.aiLabel || 'AI · {model} · {date}', { model: s.model || 'AI', date: s.queriedAt || '' }), { immediate: immediateAi });
  }
}

async function addDistribution(app, ctx, beat, cards, container) {
  const d = await app.store.getDistribution(beat.id);
  if (!ctx.alive) return;
  const total = Math.max(1, Object.values(d.counts || {}).reduce((a, b) => a + b, 0), d.sampleSize || 0);
  cards.forEach((card) => {
    const n = d.counts?.[card.dataset.id] || 0;
    const pct = Math.round((n / total) * 100);
    const fill = h('.fill');
    card.append(h('.dist', h('.bar', fill), h('span.dist-pct', `${pct}%`)));
    requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
  });
  container.textContent = d.fallback ? fmt(app.ui.distributionFallback || '预跑数据 · {n} 人', { n: d.sampleSize || total })
    : fmt(app.ui.distributionTotal || '共 {n} 人作答', { n: d.sampleSize || total });
}

/** 揭晓后的倾向提示：小KONT 气泡 + 16px 小结（00 第 5 节第 17 条） */
function tendencyBubble(app, beat, immediate) {
  const opt = (beat.options || []).find((o) => o.id === app.picks[beat.id]);
  const t = tendencyOf(opt?.score ?? 0);
  const text = app.ui[`${t}Line`] || '';
  const b = h('.bubble.tend', { class: `bubble tend ${t}` });
  const p = typewriter(b, text, { immediate });
  b.append(tailSvg(), miniKnot(t));
  b.addEventListener('click', () => p.finish());
  return { el: b, done: p };
}

function revealing(step, ctx) {
  const app = ctx.app, q = step.q, beats = step.beats;
  const { el, body } = chatFrame(ctx);
  body.append(h('p.prompt-text', q.prompt));
  // 控件放在揭晓内容顶部并吸顶，手机上无需滚过全部选项才能发现。
  body.append(app.voice.createControls(q.id, ctx));
  const multi = beats.length > 1;
  const groups = [];
  beats.forEach((beat) => {
    const opts = app.optionsOf(beat);
    const pick = app.picks[beat.id];
    if (multi) body.append(h('.beat-head', beat.ask)); else body.append(askBubble(beat.ask));
    const list = h('.options.revealed');
    const cards = opts.map((o, i) => {
      const card = optionCard(LETTERS[i], o);
      revealCard(app, card, o, { selected: o.id === pick, immediateAi: ctx.review });
      return card;
    });
    cards.forEach((c) => list.append(c));
    body.append(list);
    groups.push({ beat, cards, list });
    if (multi && beat === beats[0]) {
      const [sa, sb] = beats.slice(0, 2).map((bt) => (bt.options || []).find((o) => o.id === app.picks[bt.id])?.source);
      let text = app.ui.differentSource;
      if (sa && sb) {
        if (sa.kind === 'human' && sb.kind === 'human' && sa.respondentId && sa.respondentId === sb.respondentId) text = app.ui.sameSourceHuman;
        else if (sa.kind === 'ai' && sb.kind === 'ai') text = app.ui.sameSourceAi;
      }
      body.append(h('.same-source', text));
    }
  });
  let hasDist = false;
  groups.forEach((g) => {
    if (g.beat.showDistribution) {
      hasDist = true;
      const note = h('.dist-note');
      body.append(note);
      addDistribution(app, ctx, g.beat, g.cards, note);
    }
  });
  // 每拍揭晓后追加倾向提示（只陈述不评价）
  const tendWrap = h('.tend-wrap');
  body.append(tendWrap);
  const cta = h('.cta-row', { hidden: !ctx.review }, nextBtn(ctx));
  body.append(cta);
  (async () => {
    for (const beat of beats) {
      if (!ctx.alive) return;
      const { el: b, done } = tendencyBubble(app, beat, ctx.review);
      tendWrap.append(b);
      if (!ctx.review) { b.scrollIntoView({ block: 'nearest' }); await done; await ctx.wait(300); }
    }
    if (ctx.alive) cta.hidden = false;
  })();
  if (!ctx.review) {
    ctx.after(app.c.voicePlayback?.startDelayMs ?? 600, () => app.voice.playQuestion(q.id));
    if (app.demo) {
      const ms = app.timing('revealMs', 14000) + (beats.length - 1) * app.timing('revealExtraPerBeatMs', 4000) + (hasDist ? app.timing('distributionExtraMs', 3000) : 0);
      ctx.after(ms, () => app.next());
    }
  }
  return el;
}

/* ---------------- Q4 第二拍 AI 的一票 ---------------- */
function ranking(step, ctx) {
  const app = ctx.app, q = step.q, beat = step.beat, first = q.beats[0];
  const rk = beat.ranking || {};
  const opts = app.optionsOf(first);
  const pick = app.picks[first.id];
  const { el, body } = chatFrame(ctx);
  const intro = h('.bubble.ask');
  const typed = typewriter(intro, beat.intro || '', { immediate: ctx.review });
  intro.append(tailSvg());
  intro.addEventListener('click', () => typed.finish());
  body.append(intro);
  const list = h('.options.revealed');
  const cards = opts.map((o, i) => {
    const card = optionCard(LETTERS[i], o);
    revealCard(app, card, o, { selected: o.id === pick, immediateAi: true });
    return card;
  });
  cards.forEach((c) => list.append(c));
  body.append(list);
  const panel = h('.ranking-panel', { hidden: true },
    h('h3', app.ui.rankingTitle || ''),
    h('p', rk.rationale || ''),
    h('.ranking-meta', fmt(app.ui.aiLabel || 'AI · {model} · {date}', { model: rk.model || 'AI', date: rk.queriedAt || '' })));
  const cta = h('.cta-row', { hidden: true }, nextBtn(ctx));
  body.append(panel, cta);
  const order = (rk.order || []).filter((id) => cards.some((c) => c.dataset.id === id));
  const reorder = (animate) => {
    if (!order.length) return;
    const firstTop = new Map(cards.map((c) => [c, c.getBoundingClientRect().top]));
    const ranked = order.map((id) => cards.find((c) => c.dataset.id === id));
    const rest = cards.filter((c) => !ranked.includes(c));
    ranked.forEach((c, i) => { c.classList.add('ranked'); c.prepend(h('span.rank', String(i + 1))); });
    [...ranked, ...rest].forEach((c) => list.append(c));
    if (!animate || REDUCED) return;
    cards.forEach((c) => {
      const dy = firstTop.get(c) - c.getBoundingClientRect().top;
      if (!dy) return;
      c.style.transition = 'none'; c.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => { c.style.transition = 'transform 600ms cubic-bezier(.2,.7,.2,1)'; c.style.transform = ''; });
    });
  };
  (async () => {
    await typed;
    if (!ctx.alive) return;
    await ctx.wait(ctx.review ? 0 : 500);
    if (!ctx.alive) return;
    reorder(!ctx.review);
    await ctx.wait(ctx.review ? 0 : 700);
    if (!ctx.alive) return;
    panel.hidden = false; cta.hidden = false;
    if (app.demo && !ctx.review) ctx.after(app.timing('rankingMs', 20000), () => app.next());
  })();
  return el;
}

/* ---------------- Q 落点 ---------------- */
function closing(step, ctx) {
  const app = ctx.app, q = step.q;
  const { el, body } = chatFrame(ctx);
  body.classList.add('centered');
  body.append(h('.closing-wrap', h('p.closing-text.fade-in', q.closing), miniKnot('chapter'), nextBtn(ctx)));
  if (app.demo && !ctx.review) ctx.after(app.timing('closingMs', 5000), () => app.next());
  return el;
}

/* ---------------- F1 结的落成（03 第 8 节） ---------------- */
function f1(step, ctx) {
  const app = ctx.app, fin = app.c.finale || {};
  const { stats, knot, dead } = app.ensureResult();
  const stack = h('.bubble-stack.f1-bubbles');
  const drop = h('.knot-drop');
  const name = h('.knot-name.pixel-24', { hidden: true }, knot?.name || '');
  const ctaRow = h('.cta-row', { hidden: true }, nextBtn(ctx));
  const stage = h('.f1-stage', stack, drop, name, ctaRow);
  const el = h('.screen', topbar(ctx), stage, h('.kont.patrol'));
  const others = (app.c.knots || []).filter((k) => k !== knot);
  const lines = dead ? (fin.knotIntroDead || []) : (fin.knotIntro || []);
  (async () => {
    await bubbleSeq(ctx, stack, lines, { gapMs: app.demo ? 600 : 500, immediate: ctx.review });
    if (!ctx.alive) return;
    if (!ctx.review && !REDUCED) {
      // 其余的结依次掉落划过（300ms 一个，steps(6)），最后属于观众的那个落下停在中央
      for (let i = 0; i < others.length; i++) {
        const k = renderKnot(app.c, others[i], {}, 160, { cls: 'passing' });
        drop.append(k);
        ctx.after(700, () => k.remove());
        await ctx.wait(300);
        if (!ctx.alive) return;
      }
    }
    const mine = renderKnot(app.c, knot, app.colors, 240, { cls: ctx.review ? 'landed' : 'landing' });
    drop.append(mine);
    await ctx.wait(ctx.review ? 0 : 700);
    if (!ctx.alive) return;
    name.hidden = false;
    ctaRow.hidden = false;
    if (app.demo && !ctx.review) ctx.after(Math.max(1000, app.timing('knotDropMs', 5000) - 700 - others.length * 300), () => app.next());
  })();
  console.info(`[knot] stats`, stats);
  return el;
}

/* ---------------- F2 小KONT 解读 ---------------- */
function f2(step, ctx) {
  const app = ctx.app, fin = app.c.finale || {};
  const { stats, knot, dead } = app.ensureResult();
  const vars = { knotName: knot?.name || '', knotShort: knot?.short || '', knotDetail: knot?.detail || '', tie: stats.tie, even: stats.even, loose: stats.loose, aiPicks: stats.aiPicks };
  const lines = (dead ? fin.explainDead : fin.explain || []).map((t) => fmt(t, vars));
  const stack = h('.bubble-stack');
  const card = h('.knot-card', { hidden: true },
    h('.knot-card-name.pixel-24', knot?.name || ''), h('.knot-card-short.pixel-16', knot?.short || ''), h('p.knot-card-detail', knot?.detail || ''));
  const ctaRow = h('.cta-row', { hidden: true }, nextBtn(ctx));
  const body = h('.f2-body', h('.f2-head', renderKnot(app.c, knot, app.colors, 120), h('.f2-bubbles', stack)), card, ctaRow);
  const el = h('.screen', topbar(ctx), body, h('.kont.patrol'));
  (async () => {
    await bubbleSeq(ctx, stack, lines, { gapMs: app.demo ? Math.max(300, app.timing('explainLineMs', 2500) - 40 * 20) : 600, immediate: ctx.review });
    if (!ctx.alive) return;
    card.hidden = false; ctaRow.hidden = false;
    ctaRow.scrollIntoView({ block: 'nearest' });
    if (app.demo && !ctx.review) ctx.after(1500, () => app.next());
  })();
  return el;
}

/* ---------------- F3 调色 ---------------- */
function f3(step, ctx) {
  const app = ctx.app, fin = app.c.finale || {};
  const { knot } = app.ensureResult();
  const palette = fin.palette || [];
  let cur = palette[0]?.id || null;
  const knotEl = renderKnot(app.c, knot, app.colors, 240, {
    cls: 'paintable',
    onCell: (i) => { if (!cur) return; app.colors[String(i)] = cur; paintKnot(app.c, knotEl, app.colors); },
  });
  const swatches = h('.palette', palette.map((p) => h('button.swatch', {
    type: 'button', class: `swatch${p.id === cur ? ' cur' : ''}`, style: { background: p.hex }, 'aria-label': p.name || p.id, dataset: { id: p.id },
    onclick: (e) => { cur = p.id; swatches.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('cur', s === e.currentTarget)); },
  })));
  const fillAll = actionBtn(app, fin.fillAllCta || '', () => {
    if (!cur) return;
    app.colors = { all: cur };
    paintKnot(app.c, knotEl, app.colors);
  }, 'small');
  const done = actionBtn(app, fin.colorDoneCta || app.ui.next, () => app.next());
  const body = h('.f3-body',
    h('h2.f3-title.pixel-24', fin.colorTitle || ''),
    h('.f3-knot', knotEl),
    swatches,
    h('p.f3-hint', fin.colorHint || ''),
    h('.f3-actions', fillAll, done));
  const el = h('.screen', topbar(ctx), body);
  if (app.demo) {
    // 演示：按 demoColors 上色（先整体填第一色，再把中心一格改第二色）
    const cols = app.c.demoColors || [];
    const total = app.timing('colorMs', 6000);
    if (cols[0]) ctx.after(Math.min(1500, total * 0.3), () => { cur = cols[0]; app.colors = { all: cols[0] }; paintKnot(app.c, knotEl, app.colors); });
    if (cols[1]) ctx.after(Math.min(3200, total * 0.6), () => {
      const data = rectsOf(knot);
      if (!data) return;
      const cx = data.viewBox.x + data.viewBox.w / 2, cy = data.viewBox.y + data.viewBox.h / 2;
      let best = 0, bd = Infinity;
      data.rects.forEach((r) => { const d = (r.cx - cx) ** 2 + (r.cy - cy) ** 2; if (d < bd) { bd = d; best = r.i; } });
      app.colors[String(best)] = cols[1];
      paintKnot(app.c, knotEl, app.colors);
    });
    ctx.after(total, () => app.next());
  }
  return el;
}

/* ---------------- F4 我想说的话（留言存档） ---------------- */
function f4(step, ctx) {
  const app = ctx.app, fin = app.c.finale || {};
  const { knot } = app.ensureResult();
  const max = fin.maxLength || 200;
  let submitted = false;
  const submit = async () => {
    if (submitted) return;
    const text = ta.value.trim().slice(0, max);
    if (!text) return;
    submitted = true;
    ta.disabled = true; send.disabled = true;
    const entry = await app.store.submitToPool({ text, knotId: knot?.id, colors: { ...app.colors } });
    if (!ctx.alive) return;
    app.myPool.unshift({ ...entry, mine: true });
    const { el: cb, done } = bubble(fin.confirm || '', 'right', false);
    body.append(cb);
    body.append(h('.pool-item.mine.fade-in', renderKnot(app.c, knot, entry.colors || app.colors, 120), h('.pool-text', entry.text)));
    bar.hidden = true;
    cb.scrollIntoView({ block: 'nearest' });
    await done;
    ctx.after(600, () => app.next());
  };
  const { el, body, bar, ta, send } = chatFrame(ctx, { input: { enabled: true, placeholder: fin.placeholder || app.ui.inputPlaceholder, onSubmit: submit, maxLength: max, submitLabel: fin.saveCta || '' } });
  send.classList.add('save');
  send.textContent = fin.saveCta || '';
  body.append(askBubble(fin.ask || ''), h('.f4-count', `0 / ${max}`));
  const count = body.querySelector('.f4-count');
  ta.addEventListener('input', () => { count.textContent = `${ta.value.length} / ${max}`; });
  if (app.demo) {
    const text = app.c.demoFinaleAnswer || '';
    const total = app.timing('inputMs', 8000);
    const per = Math.max(40, Math.min(120, Math.floor((total * 0.6) / Math.max(1, text.length))));
    let i = 0;
    const type = () => { if (!ctx.alive) return; ta.value = text.slice(0, ++i); ta.dispatchEvent(new Event('input')); if (i < text.length) ctx.after(per, type); else ctx.after(800, submit); };
    ctx.after(1500, type);
  } else {
    ctx.after(300, () => ta.focus({ preventScroll: true }));
  }
  return el;
}

/* ---------------- F5 公共池 ---------------- */
function f5(step, ctx) {
  const app = ctx.app, fin = app.c.finale || {};
  const byId = Object.fromEntries((app.c.knots || []).map((k) => [k.id, k]));
  const list = h('.pool-list');
  const body = h('.screen-body', list, h('.cta-row', nextBtn(ctx)));
  const el = h('.screen.full', h('.pool-head', h('img', { src: 'assets/img/icon_community.png', alt: '' }), fin.poolTitle || ''), body);
  (async () => {
    const pool = await app.store.getPool();
    if (!ctx.alive) return;
    const mineKeys = new Set(app.myPool.map((e) => e.createdAt));
    const entries = [...app.myPool, ...pool.filter((e) => !mineKeys.has(e.createdAt))];
    if (!entries.length) { list.append(h('.pool-empty', fin.poolEmpty || '')); return; }
    entries.forEach((e) => {
      // 文本一律经 textContent 渲染（转义），单条 ≤ maxLength
      const k = byId[e.knotId];
      list.append(h('.pool-item', { class: e.mine ? 'pool-item mine' : 'pool-item' },
        k ? renderKnot(app.c, k, e.colors || {}, 48) : h('.knot.placeholder', { style: { '--size': '48px' } }),
        h('.pool-text', String(e.text).slice(0, fin.maxLength || 200), h('span.time', relTime(e.createdAt)))));
    });
  })();
  if (app.demo) ctx.after(app.timing('poolMs', 6000), () => app.next());
  return el;
}

/* ---------------- E 结束页（03 第 8 节 E） ---------------- */
function ending(step, ctx) {
  const app = ctx.app, e = app.c.ending || {}, cr = e.credits || {};
  const { knot } = app.result || {};
  const lines = e.lines || [];
  const textBox = h('.ending-text');
  const hint = h('.ending-hint', '▼');
  const credits = h('.ending-credits', { hidden: true },
    ['interviewees', 'team', 'ai', 'source', 'boundary', 'fonts'].map((k) => cr[k] ? h('p', cr[k]) : null),
    h('button.ending-restart', { type: 'button', onclick: (ev) => { ev.stopPropagation(); location.reload(); } }, e.restartCta || ''));
  const title = h('.ending-title.pixel-24', h('span', app.c.meta?.title || ''), h('span', app.c.meta?.titleEn || ''));
  // v3（08 3.14）：纵向居中——结 160px → 横排居中正文 → ▼ → 致谢
  const main = h('.ending-main', knot ? h('.ending-knot', renderKnot(app.c, knot, app.colors, 160)) : null, textBox, hint);
  const body = h('.screen-body', title, main, credits);
  const el = h('.screen.full', body);
  let i = 0, typing = null;
  const advance = () => {
    if (typing) { typing.finish(); return; }
    if (i >= lines.length) { credits.hidden = false; hint.hidden = true; return; }
    const pEl = h('p');
    textBox.append(pEl);
    typing = typewriter(pEl, lines[i++], { perChar: 90, immediate: ctx.review });
    hint.hidden = true;
    typing.then(() => { typing = null; if (ctx.alive) hint.hidden = false; });
  };
  body.addEventListener('click', advance);
  ctx.after(600, advance);
  if (app.demo) {
    const per = Math.max(2500, (app.timing('endingMs', 8000) - 600) / (lines.length + 1));
    for (let k = 1; k <= lines.length; k++) ctx.after(600 + k * per, () => { if (typing) typing.finish(); ctx.after(300, advance); });
  }
  return el;
}

const RENDERERS = { cover, loading, intro, toc, chapter, transition, prompt, answering, revealing, ranking, closing, f1, f2, f3, f4, f5, ending };

export function render(step, ctx) {
  const fn = RENDERERS[step.t];
  return fn ? fn(step, ctx) : h('.screen', h('p', `未知屏幕 ${step.t}`));
}
