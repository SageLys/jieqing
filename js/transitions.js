// 五章过场（03 第 7 节）：这里只做分发和公共运行时；每章一个文件在 js/transitions/t1.js … t5.js。
// 每个屏的 builder：build(screen, rt) → { el, play: async () => boolean }
//   play() 按"步"推进；返回 true 表示屏幕自己已经决定进入下一屏（如 BORN 打完、点了问号），
//   返回 false 表示还要再"点一下继续"（由 screens.js 的 transition 屏处理）。
// rt（runtime）：
//   rt.finished  回看：全部动画立即到最后一帧（stage 加 .finished，CSS 把动画时长压到 1ms）
//   rt.demo      演示模式：输入类交互由程序代做
//   rt.wait(ms)  可作废的等待（finished 时立即返回）
//   rt.tap(demoMs)  等观众点一下（demo：demoMs 后自动；finished：立即）
//   rt.alive()   屏幕是否还在
import { h, typewriter } from './util.js';
import * as T1 from './transitions/t1.js';
import * as T2 from './transitions/t2.js';
import * as T3 from './transitions/t3.js';
import * as T4 from './transitions/t4.js';
import * as T5 from './transitions/t5.js';

const BUILDERS = {
  keyboard: T1.keyboard, baby: T1.baby,
  balloon: T2.balloon, 'video-face': T2.videoFace,
  walk: T3.walk, scribble: T3.scribble,
  typewriter: T4.typewriterScreen, forget: T4.forget,
  tears: T5.tears, whoami: T5.whoami,
};

/** 建运行时（screens.js 调用） */
export function makeRuntime(ctx, stage, host = null) {
  const app = ctx.app;
  const finished = !!ctx.review;
  // host：接收"点一下继续"的容器（v3 是 .trans-frame，提示放框内底部、不参与画布缩放）；没给就用 stage
  const tapHost = () => host || stage;
  const rt = {
    app, ui: app.ui, finished, demo: app.demo, rnd: app.rnd, stage,
    alive: () => ctx.alive,
    wait: (ms) => (finished ? Promise.resolve('done') : ctx.wait(ms)),
    after: ctx.after,
    /** 观众点一下（stage 上任意位置）。demo 模式 demoMs 后自动过；回看立即过 */
    tap: (demoMs = 900) => new Promise((resolve) => {
      if (finished) return resolve();
      if (app.demo) { ctx.after(demoMs, resolve); return; }
      const hint = h('.hint-tap', app.ui.tapToContinue || '');
      const hostEl = tapHost();
      hostEl.append(hint);
      const f = () => { hostEl.removeEventListener('click', f); hint.remove(); resolve(); };
      hostEl.addEventListener('click', f);
      ctx.waits.push({ cancel: () => hostEl.removeEventListener('click', f) });
    }),
    /** 观众点某个元素。demo 模式 demoMs 后自动；回看立即 */
    tapOn: (el, demoMs = 900) => new Promise((resolve) => {
      if (finished) return resolve();
      if (app.demo) { ctx.after(demoMs, resolve); return; }
      const f = (e) => { e.stopPropagation(); el.removeEventListener('click', f); resolve(); };
      el.addEventListener('click', f);
      ctx.waits.push({ cancel: () => el.removeEventListener('click', f) });
    }),
    /** 逐字打出（回看立即打完） */
    type: (el, text, opts = {}) => typewriter(el, text, { ...opts, immediate: finished || opts.immediate }),
    /** 让一个元素"出现"：加 .on 触发它的 CSS 动画 */
    on: (el) => { el.classList.add('on'); return el; },
  };
  return rt;
}

/**
 * @returns {{el: HTMLElement, play: () => Promise<boolean>}}
 */
export function buildTransition(screen, rt) {
  const b = BUILDERS[screen?.type];
  if (!b) {
    const el = h('.t-fallback', { style: { padding: '40px' } }, h('p.serif', `未知过场 ${screen?.type}`));
    return { el, play: async () => false };
  }
  return b(screen, rt);
}

