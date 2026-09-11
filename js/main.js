// 入口：加载内容 → 校验 → 状态机（00 第 4 节的线性流程）
import { h, DEMO, DEBUG, mulberry32, shuffle, wait, loadKont, mountKont } from './util.js';
import { loadContent, validateContent, checkAudio } from './content.js';
import { createStore } from './store.js';
import { Ruler } from './ruler.js';
import { stopAll, unlockAudio } from './audio.js';
import * as S from './screens.js';

// 设计意见 V1-009：章扉页要能返回，所以目录也可回看（封面、加载页、开场不回）
const REVIEWABLE = new Set(['toc', 'chapter', 'transition', 'prompt', 'revealing', 'ranking', 'closing', 'f1']);
const WITH_RULER = new Set(['transition', 'prompt', 'answering', 'revealing', 'ranking', 'closing']);

/** 把 content 展开成线性的屏幕序列 */
function buildSteps(c) {
  const steps = [{ t: 'cover' }, { t: 'loading' }, { t: 'intro' }, { t: 'toc' }];
  const qById = Object.fromEntries((c.questions || []).map((q) => [q.id, q]));
  const last = c.questions[c.questions.length - 1];
  (c.chapters || []).forEach((ch, ci) => {
    const q = qById[ch.questionId];
    steps.push({ t: 'chapter', ch, ci });
    if (!q) return;
    steps.push({ t: 'transition', ch, ci, q });
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
  steps.push({ t: 'f1' }, { t: 'f2' }, { t: 'f3' }, { t: 'f4' }, { t: 'ending' });
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
    this.myPool = [];  // 本机刚提交的公共池条目
    this.screenEl = document.getElementById('screen');
    this.rulerEl = document.getElementById('ruler');
    this.ruler = new Ruler(this.rulerEl, content);
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
    console.info(`[step] #${this.idx} ${step.t} ${step.q?.id || step.ch?.id || ''}${this.reviewing ? ' (review)' : ''}`);
    ctx.review = this.reviewing;
    // 刻度尺显隐（00 第 4 节）
    if (WITH_RULER.has(step.t)) this.ruler.show(step.q?.personaAge); else this.ruler.hide();
    const el = S.render(step, ctx);
    el.classList.add(`s-${step.t}`);
    if (WITH_RULER.has(step.t)) el.classList.add('with-ruler');
    if (ctx.review && !this.demo) {
      el.append(h('button.btn-action.small.back-to-current', { type: 'button', onclick: () => this.go(this.maxIdx) }, this.ui.backToCurrent || '回到当前'));
    }
    mountKont(el);
    el.id = 'screen';
    this.screenEl.replaceWith(el);
    this.screenEl = el;
    if (DEBUG) this.renderDebug();
  }

  /** 前进：正常推进时把 maxIdx 往前推；回看时只走到下一个可回看的屏 */
  next() {
    if (!this.reviewing) { this.maxIdx = this.idx + 1; this.go(this.maxIdx); return; }
    let i = this.idx + 1;
    while (i < this.maxIdx && !REVIEWABLE.has(this.steps[i].t)) i++;
    this.go(i);
  }
  /** 回看：以屏为单位后退（00 第 6 节第 11 条） */
  prevReviewable() {
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
      h('div', `#${this.idx}/${this.steps.length - 1} ${step.t} ${step.q?.id || step.ch?.id || ''} ${this.reviewing ? '(review)' : ''} ${this.demo ? 'DEMO' : ''} data=${this.c.__file}`),
      ...this.issues.map((it) => h('div', { class: it.level === 'error' ? 'err' : 'warn' }, `${it.level === 'error' ? '✗' : '△'} ${it.msg}`)),
    );
  }

  start() {
    if (this.demo) {
      // 演示模式：先点一下解锁音频（00 第 6 节第 14 条）
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
  await loadKont();
  const app = new App(content, issues);
  window.__app = app;
  checkAudio(content, (it) => { issues.push(it); log(it); if (DEBUG) app.renderDebug(); });
  app.start();
})();
