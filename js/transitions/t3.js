// 第三章过场：T3a 走（ui-18）、T3b 杂线与锁（ui-19）。03 第 7 节。
import { h, photo } from '../util.js';

/** T3a · 走：绿方块散落 → 点一下：三张手的照片从上到下 → 大"走"最后出现 → 竖排"有点力不从心" */
export function walk(sc, rt) {
  // 绿方块（走 ×5 + 远）位置与旋转照 ui-18
  const chipPos = [[66, 3, 12], [58, 11, -15], [88, 20, 20], [8, 40, 0], [30, 70, -10], [80, 62, 8]];
  const chips = (sc.chips || []).map((c, i) => {
    const [l, t, rot] = chipPos[i % chipPos.length];
    const big = i === 3;
    return h('span.gchip.a-pop', { class: `gchip a-pop${big ? ' big' : ''}${c === '远' ? ' far' : ''}`, style: { left: `${l}%`, top: `${t}%`, '--rot': `${rot}deg` } }, c);
  });
  const imgs = sc.images || [];
  const photoPos = [[8, 16, 48, 10], [42, 27, 36, 8], [68, 37, 32, 8]];
  const photos = imgs.slice(0, 3).map((src, i) => {
    const [l, t, w, hgt] = photoPos[i];
    return h('.walk-photo.a-pop', { style: { left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${hgt}%` } }, photo(src));
  });
  const last = imgs[3] ? h('.walk-photo.tall.a-pop', { style: { left: '64%', top: '72%', width: '26%', height: '24%' } }, photo(imgs[3]), h('i.gbar')) : null;
  const big = h('.walk-big.a-pop', h('i.frame'), h('span', sc.bigChar || '走'));
  const caption = h('p.walk-cap.a-pop', sc.caption || '');
  const el = h('.t3a', ...chips, ...photos, last, big, caption);
  async function run() {
    for (const c of chips) { rt.on(c); await rt.wait(180); }
    await rt.tap(900);
    for (const p of photos) { rt.on(p); await rt.wait(300); }
    if (last) { rt.on(last); await rt.wait(300); }
    rt.on(big);
    await rt.wait(500);
    rt.on(caption);
    return false; // 点一下进入 T3b
  }
  return { el, play: run };
}

/** T3b · 杂线与锁：杂线画出 → 左右小字成对出现 → 点一下：薄荷框 + 竖排字 + 标签 → 对话框（问号 + 锁）→ 点问号：开锁进 Q3 */
export function scribble(sc, rt) {
  const scr = h('.scribble');
  fetch('assets/img/scribble.svg').then((r) => (r.ok ? r.text() : '')).then((txt) => { if (txt && rt.alive()) scr.innerHTML = txt; }).catch(() => {});
  const L = sc.left || [], R = sc.right || [];
  const n = Math.max(L.length, R.length);
  const leftPos = [[10, 8], [14, 16], [4, 24], [12, 32]], rightPos = [[72, 14], [76, 22], [80, 30], [70, 38]];
  const pairs = [];
  for (let i = 0; i < n; i++) {
    const [ll, lt] = leftPos[i % leftPos.length], [rl, rtp] = rightPos[i % rightPos.length];
    pairs.push([
      L[i] != null ? h('span.sc-word.a-pop', { style: { left: `${ll}%`, top: `${lt}%` } }, L[i]) : null,
      R[i] != null ? h('span.sc-word.a-pop', { style: { left: `${rl}%`, top: `${rtp}%` } }, R[i]) : null,
    ]);
  }
  const box = h('.sc-box.a-pop',
    h('.sc-vert', (sc.box || []).map((t) => h('span', t))),
    h('.sc-chips', (sc.chips || []).map((t) => h('span.sc-chip', t, h('i.cb')))));
  const q = h('button.sc-q', { type: 'button', 'aria-label': sc.question || '?' }, sc.question || '?');
  const lock = h('span.lock', h('i.shackle'), h('i.body'));
  const dialog = h('.sc-dialog.a-pop', q, lock);
  const el = h('.t3b', h('.sc-top', scr, ...pairs.flat().filter(Boolean)), box, dialog);
  async function run() {
    scr.classList.add('draw');
    await rt.wait(1200);
    for (const [a, b] of pairs) { if (a) rt.on(a); await rt.wait(250); if (b) rt.on(b); await rt.wait(250); }
    await rt.tap(900);
    rt.on(box);
    await rt.wait(600);
    rt.on(dialog);
    await rt.wait(300);
    // 点问号：锁打开（锁扣上移 + 旋转），进入 Q3
    await rt.tapOn(q, 1200);
    lock.classList.add('open');
    await rt.wait(500);
    return true;
  }
  return { el, play: run };
}
