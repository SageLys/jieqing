// 各屏渲染。每个函数接收 (step, ctx)，返回一个 .screen 元素。
// ctx.app 是 App；ctx.review 表示回看（只读）；ctx.after / ctx.wait 是会随屏幕销毁而作废的定时器。
import { h, fmt, typewriter, relTime, REDUCED } from './util.js';
import { buildTransition } from './transitions.js';
import { createPlaybar } from './audio.js';

/* ---------------- 公共组件 ---------------- */
const tailSvg = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 36 36');
  s.setAttribute('class', 'tail');
  s.innerHTML = '<path d="M34 2 L6 20 L16 22 L20 34 Z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>';
  return s;
};

function topbar(ctx, { title = '', age = null } = {}) {
  const app = ctx.app;
  const back = h('button.btn-back', { type: 'button', 'aria-label': app.ui.back || '返回', onclick: () => app.back() });
  if (!app.canGoBack()) back.disabled = true;
  return h('.topbar', back,
    h('.topbar-title', title),
    h('.topbar-age', age != null ? `${age} ${app.ui.ageUnit || '岁'}` : ''));
}

function dots(app, ci) {
  const n = (app.c.chapters || []).length;
  const el = h('.dots');
  for (let i = 0; i < n; i++) {
    const cls = i < ci ? 'dot done' : i === ci ? 'dot cur' : 'dot';
    el.append(h('span', { class: cls }));
    if (i < n - 1) el.append(h('span', { class: i < ci ? 'dot-neck done' : i === ci ? 'dot-neck cur' : 'dot-neck' }));
  }
  return el;
}

function actionBtn(app, text, onclick, extra = '') {
  return h('button.btn-action' + (extra ? '.' + extra : ''), { type: 'button', onclick }, text);
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

/* ---------------- S0 封面 ---------------- */
// 设计意见 V2-001 / V2-002 / V1-001：问号先出现 → 两侧刻度尺上下无限循环 → 标题出现 → 照片随机掉落；青色元素做成雨
function cover(step, ctx) {
  const app = ctx.app, c = app.c, cv = c.cover || {};
  const rnd = app.rnd;
  const ticks = (cls) => {
    const list = h('.cover-ruler-list');
    for (let v = 0; v <= 100; v += 5) list.append(h('span', v === 0 ? '零' : v === 100 ? '百' : String(v)));
    const r = h('.cover-ruler', { class: `cover-ruler ${cls}` }, list, list.cloneNode(true));
    return r;
  };
  // "问号"：黑色像素方块按顺序出现
  const blocks = h('.cover-blocks',
    h('.blur', { style: { left: '30px', top: '70px' } }), h('.blur', { style: { left: '70px', top: '150px' } }));
  [[32, 0], [0, 32], [64, 48], [64, 80], [32, 112], [32, 176]].forEach(([l, t], i) => {
    blocks.append(h('.blk', { style: { left: `${l}px`, top: `${t}px`, animationDelay: `${i * 120}ms` } }));
  });
  const stage = h('.cover-stage', ticks('l'), ticks('r'),
    h('.cover-title', h('.zh', cv.title || c.meta?.title || ''), cv.titleEn ? h('.en', cv.titleEn) : null),
    blocks);
  // 雨：薄荷色长条 + RAIN 字样，各自以不同周期落下
  const drops = [[30, 44, 9], [60, 58, 6], [62, 80, 9], [80, 86, 6], [22, 70, 5], [48, 20, 4], [86, 30, 7]];
  drops.forEach(([l, t, hgt], i) => {
    stage.append(h('.cover-line', { style: { left: `${l}%`, top: `${t}%`, height: `${hgt}%`, animationDuration: `${4 + (i % 3) * 1.3}s`, animationDelay: `${-(i * 0.9)}s` } }));
  });
  [[12, 15], [70, 60], [40, 92]].forEach(([l, t], i) => {
    stage.append(h('.cover-rain', { style: { left: `${l}%`, top: `${t}%`, animationDuration: `${9 + i * 2}s`, animationDelay: `${-i * 3}s` } }, 'RAIN'));
  });
  (cv.photos || []).forEach((p, i) => {
    const delay = 2000 + Math.floor(rnd() * 1200);
    stage.append(h('div', { class: `cover-photo ${p.side === 'left' ? 'left' : 'right'}`, style: { top: `${p.age}%`, animationDelay: `${delay}ms` } }, h('img', { src: p.src, alt: '' })));
  });
  const cta = h('button.cover-cta', { type: 'button', onclick: () => app.next() },
    h('img', { src: 'assets/img/folder_open.svg', alt: '' }), h('span.txt', cv.cta || app.ui.start || '开启'));
  stage.append(cta);
  if (app.demo) ctx.after(app.timing('coverMs', 5000), () => app.next());
  return h('.screen.full', stage);
}

/* ---------------- L 加载页（参考 ui-07；设计意见 V1-002 / V2-003 / V2-004） ---------------- */
function loading(step, ctx) {
  const app = ctx.app;
  const blk = (l, t, w = 60) => h('.lb', { style: { left: `${l}%`, top: `${t}%`, width: `${w}px`, height: `${w}px` } });
  const main = h('.load-main',
    h('.load-zoom',
      blk(44, 8), blk(20, 22), blk(62, 22), h('.lw'), blk(62, 36),
      h('img.load-folder', { src: 'assets/img/folder_open.svg', alt: '' }),
      blk(44, 46), blk(44, 72)));
  const thumb = h('.load-thumb', h('.load-zoom', blk(46, 6, 18), blk(28, 20, 18), blk(60, 30, 18), h('img.load-folder', { src: 'assets/img/folder_open.svg', alt: '' }), blk(46, 62, 18)));
  const bar = h('.load-bar');
  for (let i = 0; i < 24; i++) bar.append(h('i', { style: { animationDelay: `${300 + i * 110}ms` } }));
  const stage = h('.load-stage',
    thumb, h('img.load-avatar', { src: 'assets/img/icon_account.svg', alt: '' }),
    main, bar, h('.load-text', app.ui.loading || ''),
    h('.kont.load-pose.p1'), h('.kont.load-pose.p2'), h('.kont.load-pose.p3'),
    h('.kont.load-runner'));
  const el = h('.screen.full', stage);
  const ms = app.timing('loadingMs', 3600);
  ctx.after(ms, () => app.next());
  if (!app.demo) stage.addEventListener('click', () => app.next());
  return el;
}

/* ---------------- S1 小KONT 开场 ---------------- */
function intro(step, ctx) {
  const app = ctx.app, host = app.c.host || {};
  const stack = h('.bubble-stack');
  const scroll = h('.intro-scroll', stack);
  const ctaRow = h('.cta-row', { hidden: true });
  const frame = h('.intro-frame', scroll, ctaRow, h('.kont.intro-kont'));
  const el = h('.screen.full',
    h('.intro-top',
      h('.icon', h('img', { src: 'assets/img/icon_archive.svg', alt: '' }), app.ui.archiveLabel ? h('span', app.ui.archiveLabel) : null),
      h('.intro-what', 'what'),
      h('.icon', { style: { justifySelf: 'end' } }, h('img', { src: 'assets/img/icon_community.png', alt: '' }), app.ui.communityLabel ? h('span', app.ui.communityLabel) : null)),
    frame);
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

/* ---------------- S2 目录 ---------------- */
// 设计意见 V1-004 / V2-005：小KONT 先弹出提示，页面向下滑动到底进入第一章；点第一章或点轨道仍可进入
function toc(step, ctx) {
  const app = ctx.app, c = app.c;
  const list = h('.toc-list');
  const indents = [24, 88, 152, 88, 40];
  (c.chapters || []).forEach((ch, i) => {
    list.append(h('button.toc-item', { type: 'button', disabled: i !== 0, style: { marginLeft: `${indents[i % indents.length]}px` }, onclick: () => app.next() },
      h('span.zh', ch.stage), h('span.en', ch.en)));
  });
  const body = h('.toc-body', list, h('.toc-spacer'));
  const knob = h('span.knob');
  const track = h('button.toc-track', { type: 'button', onclick: () => app.next() }, knob, h('span.hint', c.toc?.hint || ''));
  const tip = h('.toc-tip', { hidden: true }, c.host?.tocTooltip || '');
  const el = h('.screen.full',
    h('.toc-top', h('.toc-brand', h('img', { src: 'assets/img/icon_memory_factory.svg', alt: '' }), c.toc?.title || ''), h('img.toc-avatar', { src: 'assets/img/icon_account.svg', alt: '' })),
    body, track,
    h('.toc-kont', tip, h('.kont')));
  ctx.after(700, () => { tip.hidden = false; });
  let fired = false;
  const onScroll = () => {
    const max = body.scrollHeight - body.clientHeight;
    const p = max > 0 ? Math.min(1, body.scrollTop / max) : 0;
    knob.style.transform = `translateY(${p * Math.max(0, track.clientHeight - knob.offsetHeight - 8)}px)`;
    if (p >= 0.98 && !fired && !ctx.review) { fired = true; ctx.after(250, () => app.next()); }
  };
  body.addEventListener('scroll', onScroll, { passive: true });
  if (app.demo) {
    const total = app.timing('tocMs', 4000);
    ctx.after(Math.max(600, total - 1600), () => body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' }));
    ctx.after(total, () => { if (!fired) app.next(); });
  }
  return el;
}

/* ---------------- C 章扉页 ---------------- */
function chapter(step, ctx) {
  const app = ctx.app, ch = step.ch;
  const letters = (ch.en || '').split('');
  const en = h('.chapter-en');
  const n = letters.length, spread = 30; // 字母散开的角度范围
  letters.forEach((L, i) => {
    const t = n === 1 ? 0 : (i / (n - 1) - 0.5);
    const ang = t * spread;                       // -30° … 30°
    const R = 340;                                // 弧半径
    const x = Math.sin((ang * Math.PI) / 180) * R;
    const y = (1 - Math.cos((ang * Math.PI) / 180)) * R;
    en.append(h('span', { style: { transform: `translate(calc(${x}px - 50%), ${y}px) rotate(${ang}deg)` } }, L));
  });
  const stage = h('.chapter-stage',
    h('.chapter-title', ch.stage),
    en,
    h('.chapter-range', `${ch.ageRange?.[0]} – ${ch.ageRange?.[1]}`),
    h('.chapter-action', h('.kont.lg'), actionBtn(app, app.ui.action || 'action', () => app.next())));
  const el = h('.screen', topbar(ctx), stage, dots(app, step.ci));
  if (app.demo) ctx.after(app.timing('chapterMs', 4000), () => app.next());
  return el;
}

/* ---------------- T 过场 ---------------- */
function transition(step, ctx) {
  const app = ctx.app, ch = step.ch;
  const finished = !!ctx.review;
  const { el: inner, total } = buildTransition(ch, { rnd: app.rnd, finished });
  const stage = h('.trans-stage', inner);
  const el = h('.screen', topbar(ctx, { title: ch.stage, age: step.q?.personaAge }), stage, dots(app, step.ci));
  const dur = ch.transition?.durationMs || 7000;
  if (!ctx.review) {
    if (!app.demo) {
      el.append(h('.hint-tap', app.ui.skip || '跳过'));
      stage.addEventListener('click', () => app.next());
      ctx.after(Math.max(dur, total + 400), () => app.next());
    } else {
      ctx.after(dur, () => app.next());
    }
  }
  return el;
}

/* ---------------- Q 题面 ---------------- */
function qTitle(app, step) { return `${step.q.stage} · ${fmt(app.ui.qCounter || '{n} / {total}', { n: step.ci + 1, total: app.c.chapters.length })}`; }

function prompt(step, ctx) {
  const app = ctx.app, q = step.q;
  const body = h('.screen-body', h('p.prompt-text.fade-in', q.prompt));
  const el = h('.screen', topbar(ctx, { title: qTitle(app, step), age: q.personaAge }), body, h('.kont.corner'), dots(app, step.ci));
  if (!ctx.review) {
    body.addEventListener('click', () => app.next());
    ctx.after(app.demo ? app.timing('promptMs', 4000) : 3500, () => app.next());
  }
  return el;
}

/* ---------------- Q 作答 ---------------- */
function optionCard(letter, o) {
  // 作答前：DOM 里不出现任何来源信息
  return h('button.opt', { type: 'button', dataset: { id: o.id } }, h('span.opt-letter', letter), h('span.opt-text', o.text));
}
const LETTERS = 'ABCDEFGH';

function answering(step, ctx) {
  const app = ctx.app, q = step.q, beat = step.beat;
  const opts = app.optionsOf(beat);
  const list = h('.options');
  const cards = opts.map((o, i) => optionCard(LETTERS[i], o));
  cards.forEach((c) => list.append(c));
  const body = h('.screen-body', h('p.prompt-text', q.prompt), askBubble(beat.ask), list);
  const el = h('.screen', topbar(ctx, { title: qTitle(app, step), age: q.personaAge }), body, h('.kont.corner'), dots(app, step.ci));

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
      const card = cards.find((c) => c.dataset.id === pick.id) || cards[0];
      choose(card);
    });
  }
  return el;
}

/* ---------------- Q 揭晓 ---------------- */
function humanTag(app, s) {
  const ageText = s.ageLabel || (Number.isInteger(s.age) ? `${s.age} ${app.ui.ageUnit || '岁'}` : '');
  return h('.reveal-tag', `${s.origin || ''} · ${ageText}`, s.dialect ? h('span.dialect', s.dialect) : null);
}

/** 把一张已作答的卡片变成揭晓态。返回 {playbar} */
function revealCard(app, card, o, { selected, immediateAi = false }) {
  const s = o.source || {};
  card.disabled = true;
  card.classList.toggle('selected', !!selected);
  let playbar = null;
  if (s.kind === 'human') {
    const block = h('.reveal-human', humanTag(app, s));
    if (s.audio) { playbar = createPlaybar(s.audio); block.append(playbar.el); }
    if (s.subtitle) block.append(h('.reveal-sub', `「${s.subtitle}」`));
    card.append(block);
  } else if (s.kind === 'ai') {
    card.classList.add('ai');
    const label = h('span.reveal-ai');
    card.append(label);
    typewriter(label, fmt(app.ui.aiLabel || 'AI · {model} · {date}', { model: s.model || 'AI', date: s.queriedAt || '' }), { immediate: immediateAi });
  }
  return { playbar };
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
  const note = d.fallback ? fmt(app.ui.distributionFallback || '预跑数据 · {n} 人', { n: d.sampleSize || total })
    : fmt(app.ui.distributionTotal || '共 {n} 人作答', { n: d.sampleSize || total });
  container.textContent = note;
}

function revealing(step, ctx) {
  const app = ctx.app, q = step.q, beats = step.beats;
  const body = h('.screen-body', h('p.prompt-text', q.prompt));
  const el = h('.screen', topbar(ctx, { title: qTitle(app, step), age: q.personaAge }), body, h('.kont.corner'), dots(app, step.ci));
  const multi = beats.length > 1;
  const selectedPlaybars = [];
  const groups = [];
  const optById = {};

  beats.forEach((beat) => {
    const opts = app.optionsOf(beat);
    const pick = app.picks[beat.id];
    if (multi) body.append(h('.beat-head', beat.ask)); else body.append(askBubble(beat.ask));
    const list = h('.options.revealed');
    const cards = opts.map((o, i) => {
      optById[o.id] = o;
      const card = optionCard(LETTERS[i], o);
      const { playbar } = revealCard(app, card, o, { selected: o.id === pick, immediateAi: ctx.review });
      if (o.id === pick && playbar) selectedPlaybars.push(playbar);
      return card;
    });
    cards.forEach((c) => list.append(c));
    body.append(list);
    groups.push({ beat, cards, list });
    // 第二问：两组之间的同源提示（00 第 6 节第 9 条），只判断前两拍
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
  // 分布（第三问、第四问第一拍）
  let hasDist = false;
  groups.forEach((g) => {
    if (g.beat.showDistribution) {
      hasDist = true;
      const note = h('.dist-note');
      body.append(note);
      addDistribution(app, ctx, g.beat, g.cards, note);
    }
  });
  // 刻度尺点亮（所有 human；ai 不点）
  if (!ctx.review) beats.forEach((b) => app.ruler.light(b));

  const cta = h('.cta-row', nextBtn(ctx));
  body.append(cta);
  // 音频：先播第一拍所选，播完再播第二拍所选（回看不自动播）
  if (!ctx.review) {
    (async () => {
      for (const pb of selectedPlaybars) { if (!ctx.alive) return; await pb.play(); await ctx.wait(300); }
    })();
    if (app.demo) {
      const ms = app.timing('revealMs', 14000) + (beats.length - 1) * app.timing('revealExtraPerBeatMs', 4000) + (hasDist ? app.timing('distributionExtraMs', 3000) : 0);
      ctx.after(ms, () => app.next());
    }
  }
  return el;
}

/* ---------------- Q4 第二拍 AI 排序 ---------------- */
function ranking(step, ctx) {
  const app = ctx.app, q = step.q, beat = step.beat, first = q.beats[0];
  const rk = beat.ranking || {};
  const opts = app.optionsOf(first);
  const pick = app.picks[first.id];
  const body = h('.screen-body');
  const el = h('.screen', topbar(ctx, { title: qTitle(app, step), age: q.personaAge }), body, h('.kont.corner'), dots(app, step.ci));
  // 引导语放进气泡（03 5.11）
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
    h('h3', app.ui.rankingTitle || 'AI 的排序'),
    h('p', rk.rationale || ''),
    h('.ranking-meta', fmt(app.ui.aiLabel || 'AI · {model} · {date}', { model: rk.model || 'AI', date: rk.queriedAt || '' })));
  const cta = h('.cta-row', { hidden: true }, nextBtn(ctx));
  body.append(panel, cta);

  // 重排：order 允许不完整（00 第 6 节第 10 条）
  const order = (rk.order || []).filter((id) => cards.some((c) => c.dataset.id === id));
  const reorder = (animate) => {
    if (!order.length) return;
    const first = new Map(cards.map((c) => [c, c.getBoundingClientRect().top]));
    const ranked = order.map((id) => cards.find((c) => c.dataset.id === id));
    const rest = cards.filter((c) => !ranked.includes(c));
    ranked.forEach((c, i) => { c.classList.add('ranked'); c.prepend(h('span.rank', String(i + 1))); });
    [...ranked, ...rest].forEach((c) => list.append(c));
    if (!animate || REDUCED) return;
    cards.forEach((c) => {
      const dy = first.get(c) - c.getBoundingClientRect().top;
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
  const wrap = h('.closing-wrap', h('p.closing-text.fade-in', q.closing), h('.closing-knot'), nextBtn(ctx));
  const el = h('.screen', topbar(ctx, { title: qTitle(app, step), age: q.personaAge }), wrap, dots(app, step.ci));
  if (app.demo && !ctx.review) ctx.after(app.timing('closingMs', 5000), () => app.next());
  return el;
}

/* ---------------- F1 刻度尺点破 ---------------- */
function f1(step, ctx) {
  const app = ctx.app, r = app.ruler;
  const big = h('.f1-ruler', h('.axis'));
  for (const t of r.ticks()) big.append(h('span.tick', { style: { top: `${r.pct(t.v)}%` } }, t.label));
  let delay = 0;
  const labelled = new Set();
  r.groups().forEach((g) => {
    const top = `${r.pct(g.age)}%`;
    g.items.slice(0, 3).forEach((m, i) => {
      big.append(h('span.knot', { style: { top, left: `${62 + i * 9}px`, animationDelay: ctx.review ? '0ms' : `${delay}ms` } }));
      delay += 80;
    });
    if (g.items.length > 3) big.append(h('span.knot-n', { style: { top, left: '92px' } }, `×${g.items.length}`));
    // 左侧手写标签：同一位受访者只标一次
    const labels = [];
    g.items.forEach((m) => {
      if (labelled.has(m.respondentId)) return;
      labelled.add(m.respondentId);
      labels.push(`${m.origin || ''} · ${m.ageLabel || `${m.age} ${app.ui.ageUnit || '岁'}`}`);
    });
    if (labels.length) big.append(h('span.lbl', { style: { top, animationDelay: ctx.review ? '0ms' : `${delay}ms` } }, labels.join('、')));
  });
  const lines = h('.f1-lines');
  const ctaRow = h('.f1-cta', { hidden: true }, nextBtn(ctx));
  const stage = h('.f1-stage', big, lines, ctaRow);
  const el = h('.screen', topbar(ctx), stage);
  // 标签防重叠：按年龄顺序排，和上一条至少隔 15px（设计意见 V1-012 截图里标签叠在一起）
  requestAnimationFrame(() => {
    const H = big.clientHeight; if (!H) return;
    let last = -Infinity;
    [...big.querySelectorAll('.lbl')].forEach((lb) => {
      let y = (parseFloat(lb.style.top) / 100) * H;
      if (y < last + 15) y = last + 15;
      lb.style.top = `${y}px`; last = y;
    });
  });
  const texts = Array.isArray(app.c.finale?.revealText) ? app.c.finale.revealText : [String(app.c.finale?.revealText || '')];
  let i = 0, pending = null;
  const showLine = () => {
    if (i >= texts.length) { ctaRow.hidden = false; return true; }
    lines.append(h('p.fade-in', texts[i++]));
    return false;
  };
  if (ctx.review) { while (!showLine()); }
  else {
    const tick = async () => {
      if (showLine()) { if (app.demo) ctx.after(2000, () => app.next()); return; }
      pending = ctx.wait(app.demo ? app.timing('finaleLineMs', 3000) : 3000);
      const r2 = await pending; pending = null;
      if (ctx.alive) tick();
    };
    ctx.after(Math.min(1200, delay + 400), tick);
    if (!app.demo) stage.addEventListener('click', () => { if (pending) pending.cancel(); });
  }
  return el;
}

/* ---------------- F2 小KONT 反转 ---------------- */
function f2(step, ctx) {
  const app = ctx.app;
  const stack = h('.bubble-stack');
  const scroll = h('.intro-scroll', stack);
  const ctaRow = h('.cta-row', { hidden: true }, nextBtn(ctx));
  const frame = h('.intro-frame', scroll, ctaRow, h('.kont.intro-kont'));
  const el = h('.screen.full', h('div', { style: { height: '24px' } }), frame);
  (async () => {
    await bubbleSeq(ctx, stack, app.c.finale?.reversal || [], { gapMs: app.demo ? Math.max(300, app.timing('introLineMs', 2000) - 800) : 700 });
    if (!ctx.alive) return;
    ctaRow.hidden = false;
    if (app.demo) ctx.after(1500, () => app.next());
  })();
  return el;
}

/* ---------------- F3 收束作答 ---------------- */
function f3(step, ctx) {
  const app = ctx.app, fin = app.c.finale || {};
  const max = fin.maxLength || 200;
  const ta = h('textarea', { placeholder: fin.placeholder || '', maxlength: max, rows: 1, 'aria-label': fin.ask || '' });
  const send = h('button.send', { type: 'button', disabled: true, 'aria-label': fin.submitCta || '发送' });
  const count = h('.f3-count', `0 / ${max}`);
  const confirm = h('.f3-confirm', { hidden: true }, fin.confirm || '');
  const mine = h('.f3-mine');
  const ctaRow = h('.cta-row', { hidden: true }, nextBtn(ctx));
  const bar = h('.inputbar', ta, send);
  const body = h('.f3-body', askBubble(fin.ask || ''), h('.kont', { style: { margin: '8px 0 auto 8px' } }), confirm, mine, ctaRow, bar, count);
  const el = h('.screen.full', body);
  const update = () => { const n = ta.value.trim().length; send.disabled = n === 0; count.textContent = `${ta.value.length} / ${max}`; };
  ta.addEventListener('input', update);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!send.disabled) submit(); } });
  let submitted = false;
  const submit = async () => {
    if (submitted) return;
    const text = ta.value.trim().slice(0, max);
    if (!text) return;
    submitted = true;
    ta.disabled = true; send.disabled = true;
    const entry = await app.store.submitToPool({ text });
    app.myPool.unshift({ ...entry, mine: true });
    confirm.hidden = false;
    mine.append(h('.pool-item.mine', entry.text, h('span.time', relTime(entry.createdAt))));
    bar.hidden = true; count.hidden = true;
    ctaRow.hidden = false;
    if (app.demo) ctx.after(2500, () => app.next());
  };
  send.addEventListener('click', submit);
  if (app.demo) {
    // 演示：自动逐字打出 demoFinaleAnswer，然后提交（不写入公共池：store 为只读）
    const text = app.c.demoFinaleAnswer || '';
    const total = app.timing('inputMs', 8000);
    const per = Math.max(40, Math.min(120, Math.floor((total * 0.6) / Math.max(1, text.length))));
    let i = 0;
    const type = () => { if (!ctx.alive) return; ta.value = text.slice(0, ++i); update(); if (i < text.length) ctx.after(per, type); else ctx.after(800, submit); };
    ctx.after(1500, type);
  } else {
    ctx.after(300, () => ta.focus({ preventScroll: true }));
  }
  return el;
}

/* ---------------- F4 公共池 ---------------- */
function f4(step, ctx) {
  const app = ctx.app, fin = app.c.finale || {};
  const list = h('.pool-list');
  const body = h('.screen-body', list, h('.cta-row', nextBtn(ctx)));
  const el = h('.screen.full', h('.pool-head', h('img', { src: 'assets/img/icon_community.png', alt: '' }), fin.poolTitle || ''), body);
  (async () => {
    const pool = await app.store.getPool();
    if (!ctx.alive) return;
    const mineTexts = new Set(app.myPool.map((e) => e.createdAt));
    const entries = [...app.myPool, ...pool.filter((e) => !mineTexts.has(e.createdAt))];
    if (!entries.length) { list.append(h('.pool-empty', fin.poolEmpty || '')); return; }
    entries.forEach((e) => {
      // 文本一律经 textContent 渲染（转义），单条 ≤ maxLength
      list.append(h('.pool-item', { class: e.mine ? 'pool-item mine' : 'pool-item' }, String(e.text).slice(0, fin.maxLength || 200), h('span.time', relTime(e.createdAt))));
    });
  })();
  if (app.demo) ctx.after(app.timing('poolMs', 6000), () => app.next());
  return el;
}

/* ---------------- E 结束页 ---------------- */
// 设计意见 V1-014：文字点击后从上到下逐字打出，再点击出现下一段，像翻 PPT；全部出现后再显示致谢
function ending(step, ctx) {
  const app = ctx.app, e = app.c.ending || {}, cr = e.credits || {};
  const lines = e.lines || [];
  const textBox = h('.ending-text');
  const hint = h('.ending-hint', '▼');
  const credits = h('.ending-credits', { hidden: true },
    ['interviewees', 'team', 'ai', 'source', 'boundary', 'fonts'].map((k) => cr[k] ? h('p', cr[k]) : null),
    h('button.ending-restart', { type: 'button', onclick: (ev) => { ev.stopPropagation(); location.reload(); } }, e.restartCta || ''));
  const main = h('.ending-main', textBox, hint);
  const body = h('.screen-body', main, credits);
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

const RENDERERS = { cover, loading, intro, toc, chapter, transition, prompt, answering, revealing, ranking, closing, f1, f2, f3, f4, ending };

export function render(step, ctx) {
  const fn = RENDERERS[step.t];
  return fn ? fn(step, ctx) : h('.screen', h('p', `未知屏幕 ${step.t}`));
}
