// 入口：加载内容 → 校验 → 状态机（00 第 4 节的线性流程，v2）
import { h, DEMO, DEBUG, mulberry32, shuffle, wait, loadKont, mountKont, setPatrol, kontTalk } from './util.js';
import { loadContent, validateContent, checkAudio } from './content.js';
import { createStore } from './store.js';
import { stopAll, unlockAudio } from './audio.js';
import { loadKnotSvgs, computeStats, pickKnot } from './knots.js';
import * as S from './screens.js';

// 可回看的屏（00 第 4 节）：目录、章扉、过场 a / b 的最后一帧、题面、揭晓、AI 的一票、落点、F1、F2
const REVIEWABLE = new Set(['toc', 'chapter', 'transition', 'prompt', 'revealing', 'ranking', 'closing', 'f1', 'f2']);
// 从这些屏起不能再回看（F3 调色之后）
const NO_BACK_FROM = new Set(['f3', 'f4', 'f5', 'ending']);

/** 把 content 展开成线性的屏幕序列（00 第 7 节 buildSteps） */
function buildSteps(c) {
  const steps = [{ t: 'cover' }, { t: 'loading' }, { t: 'intro' }, { t: 'toc' }];
  const qById = Object.fromEntries((c.questions || []).map((q) => [q.id, q]));
  const last = c.questions[c.questions.length - 1];
  (c.chapters || []).forEach((ch, ci) => {
    const q = qById[ch.questionId];
    steps.push({ t: 'chapter', ch, ci });
    if (!q) return;
    (ch.transition?.screens || []).forEach((screen, si) => steps.push({ t: 'transition', ch, ci, q, screen, si }));
    steps.push({ t: 'prompt', ch, ci, q });
    let group = [];
    const flush = () => { if (group.length) { steps.push({ t: 'revealing', ch, ci, q, beats: group }); group = []; } };
    for (const b of q.beats || []) {
      if (b.type === 'ai_ranking') { flush(); steps.push({ t: 'ranking', ch, ci, q, beat: b }); }
      else { steps.push({ t: 'answering', ch, ci, q, beat: b }); group.push(b); }
    }
    flush();
    if (q !== last && q.closing) steps.push({ t: 'closing', ch, ci, q });
  });
  steps.push({ t: 'f1' }, { t: 'f2' }, { t: 'f3' }, { t: 'f4' }, { t: 'f5' }, { t: 'ending' });
  return steps;
}

class App {
  constructor(content, issues) {
    this.c = content;
    this.ui = content.ui || {};
    this.issues = issues;
    this.demo = DEMO;
    this.steps = buildSteps(content);
    this.idx = 0;
    this.maxIdx = 0;
    this.store = createStore(content, { demo: this.demo });
    this.rnd = this.demo ? mulberry32(20260910) : Math.random;
    this.order = {};   // beatId → 打乱后的选项数组（会话内稳定）
    this.picks = {};   // beatId → optionId
    this.result = null; // { stats, knot, dead } 在 F1 落成时算一次
    this.colors = {};  // 观众给结上的色：{ all, "i" }
    this.myPool = [];  // 本机刚存档的公共池条目
    this.kontLineIdx = 0; // v3：小KONT 台词轮播到第几句（全站累计）
    this.screenEl = document.getElementById('screen');
    this.ctx = null;
    this.timings = content.demoTimings || {};
    document.title = content.meta?.title || document.title;
  }

  get step() { return this.steps[this.idx]; }
  get reviewing() { return this.idx < this.maxIdx; }

  /** 该拍的选项顺序（02 第七节通用规则 1） */
  optionsOf(beat) {
    if (!this.order[beat.id]) this.order[beat.id] = shuffle(beat.options || [], this.rnd);
    return this.order[beat.id];
  }
  demoPick(beat) {
    const want = this.c.demoPath?.[beat.id];
    const opts = this.optionsOf(beat);
    return opts.find((o) => o.id === want) || opts[0];
  }
  timing(key, def) { const v = this.timings[key]; return Number.isFinite(v) ? v : def; }

  /** 结的落成（只算一次；07 2.3） */
  ensureResult() {
    if (!this.result) {
      const stats = computeStats(this.c, this.picks);
      const { knot, dead } = pickKnot(this.c, stats, this.rnd);
      this.result = { stats, knot, dead };
      console.info(`[knot] tie=${stats.tie} even=${stats.even} loose=${stats.loose} sum=${stats.sum} aiPicks=${stats.aiPicks} → ${knot?.id}${dead ? ' (dead)' : ''}`);
    }
    return this.result;
  }

  /** 新建一个步骤上下文；上一个的定时器全部作废 */
  newCtx() {
    if (this.ctx) { this.ctx.alive = false; this.ctx.timers.forEach(clearTimeout); this.ctx.waits.forEach((w) => w.cancel()); }
    const ctx = {
      alive: true, timers: [], waits: [], app: this,
      after: (ms, fn) => { const t = setTimeout(() => { if (ctx.alive) fn(); }, ms); ctx.timers.push(t); return t; },
      wait: (ms) => { const w = wait(ms); ctx.waits.push(w); return w; },
    };
    this.ctx = ctx;
    return ctx;
  }

  go(i) {
    stopAll();
    this.idx = Math.max(0, Math.min(this.steps.length - 1, i));
    const step = this.step;
    const ctx = this.newCtx();
    console.info(`[step] #${this.idx} ${step.t} ${step.q?.id || step.ch?.id || ''}${step.si != null ? ' s' + step.si : ''}${this.reviewing ? ' (review)' : ''}`);
    ctx.review = this.reviewing;
    // 章色：进章时写到 body（03 第 2 节）；问答之外的固定屏不带章色
    document.body.dataset.chapterColor = step.ch?.color || '';
    const el = S.render(step, ctx);
    el.classList.add(`s-${step.t}`);
    if (ctx.review && !this.demo) {
      el.append(h('button.btn-action.small.back-to-current', { type: 'button', onclick: () => this.go(this.maxIdx) }, this.ui.backToCurrent || '回到当前'));
    }
    mountKont(el);
    el.id = 'screen';
    this.screenEl.replaceWith(el);
    this.screenEl = el;
    el.querySelectorAll('.kont.patrol').forEach(setPatrol); // v3：巡逻距离按容器宽（过场屏自己还会随框重算）
    // v3 F07：全站装饰小KONT 可点出台词（加载页三只除外）；演示模式不自动点、不影响计时
    const lines = this.c.host?.kontLines || [];
    el.querySelectorAll('.kont:not(.load-pose)').forEach((k) => kontTalk(this, k, { lines }));
    if (DEBUG) this.renderDebug();
  }

  /** 前进：正常推进时把 maxIdx 往前推；回看时只走到下一个可回看的屏 */
  next() {
    if (!this.reviewing) { this.maxIdx = this.idx + 1; this.go(this.maxIdx); return; }
    let i = this.idx + 1;
    while (i < this.maxIdx && !REVIEWABLE.has(this.steps[i].t)) i++;
    this.go(i);
  }
  /** 回看：以屏为单位后退（00 第 4 节）；F3 起不可回 */
  prevReviewable() {
    if (NO_BACK_FROM.has(this.step.t)) return -1;
    for (let i = this.idx - 1; i >= 0; i--) if (REVIEWABLE.has(this.steps[i].t)) return i;
    return -1;
  }
  canGoBack() { return !this.demo && this.prevReviewable() >= 0; }
  back() { const i = this.prevReviewable(); if (i >= 0) this.go(i); }

  renderDebug() {
    const d = document.getElementById('debug');
    d.hidden = false;
    if (!d.dataset.bound) { d.dataset.bound = '1'; d.addEventListener('click', () => d.classList.toggle('collapsed')); }
    const step = this.step;
    d.replaceChildren(
      h('div', `#${this.idx}/${this.steps.length - 1} ${step.t} ${step.q?.id || step.ch?.id || ''}${step.si != null ? ' s' + step.si : ''} ${this.reviewing ? '(review)' : ''} ${this.demo ? 'DEMO' : ''} data=${this.c.__file}`),
      ...this.issues.map((it) => h('div', { class: it.level === 'error' ? 'err' : 'warn' }, `${it.level === 'error' ? '✗' : '△'} ${it.msg}`)),
    );
  }

  start() {
    if (this.demo) {
      // 演示模式：先点一下解锁音频（00 第 5 节第 14 条）
      const ov = document.getElementById('overlay');
      ov.hidden = false;
      ov.replaceChildren(h('div.kont.lg'), h('div', this.ui.start || '开启'));
      mountKont(ov);
      ov.addEventListener('click', () => { unlockAudio(); ov.hidden = true; this.go(0); }, { once: true });
    } else {
      this.go(0);
    }
  }
}

(async function boot() {
  let content;
  try {
    content = await loadContent();
  } catch (e) {
    document.getElementById('screen').append(h('p', { style: { padding: '24px' } }, String(e.message || e)));
    return;
  }
  const issues = validateContent(content);
  const log = (it) => (it.level === 'error' ? console.error : console.warn)(`[content] ${it.msg}`);
  issues.forEach(log);
  console.info(`[content] ${content.__file} 校验完成：${issues.filter((i) => i.level === 'error').length} 个错误，${issues.filter((i) => i.level === 'warn').length} 个提示`);
  await Promise.all([loadKont(), loadKnotSvgs(content)]);
  const app = new App(content, issues);
  window.__app = app;
  checkAudio(content, (it) => { issues.push(it); log(it); if (DEBUG) app.renderDebug(); });
  window.addEventListener('resize', () => document.querySelectorAll('.kont.patrol').forEach(setPatrol));
  app.start();
})();
