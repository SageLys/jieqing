// 第二章过场：T2a 气球（ui-15）、T2b 记挂的是什么（ui-16）。03 第 7 节。
import { h, media } from '../util.js';

/** 把一句话切成 3–5 段：先按中文标点 / 空格切，再把超过 8 字的段对半切，最多 5 段 */
export function splitPhrases(text) {
  let parts = String(text).split(/[，,。；;、\s]+/).map((t) => t.trim()).filter(Boolean);
  const MAX = 8;
  for (let guard = 0; guard < 6 && parts.length < 5 && parts.some((p) => p.length > MAX); guard++) {
    parts = parts.flatMap((p) => (p.length > MAX && parts.length < 5 ? [p.slice(0, Math.ceil(p.length / 2)), p.slice(Math.ceil(p.length / 2))] : [p]));
  }
  if (parts.length > 5) parts = [...parts.slice(0, 4), parts.slice(4).join('')];
  return parts;
}

const playBtn = (cls) => h('button.play-tri', { type: 'button', class: `play-tri ${cls || ''}`.trim(), 'aria-label': 'play' });

/** T2a · 气球：轮廓画出 → 薄荷标签 → 上半部的字跳跃出现 → 下方两句 → 黄色矩形弹出 → 点播放浮出字 */
export function balloon(sc, rt) {
  // 气球轮廓（assets/img/balloon.svg：两个椭圆 + 两条线，stroke 用 currentColor）
  const outline = h('.balloon-outline');
  fetch('assets/img/balloon.svg').then((r) => (r.ok ? r.text() : '')).then((txt) => {
    if (!txt || !rt.alive()) return;
    outline.innerHTML = txt;
    outline.querySelectorAll('path').forEach((p) => {
      const len = p.getTotalLength ? p.getTotalLength() : 600;
      p.style.setProperty('--len', String(len));
    });
  }).catch(() => {});
  // v3（08 3.8）：五个词按 F13-2 设计稿重排（balloon-box 百分比 / 字号 / 旋转），两两不相交
  // 按 content 里 words 的顺序：家 / 工作 / 孩子 / 交际 / 晋升
  // 08 3.8 给的是 (40,4) (30,30) (60,14) (24,18) (56,26)；气球轮廓只占 box 的 32%–58%，按设计稿把五个词收进气球内、两两不相交
  const wordPos = { '家': [40, 4, 48, 0], '工作': [30, 33, 40, -12], '孩子': [55, 17, 24, -30], '交际': [33, 18, 24, 0], '晋升': [52, 27, 24, 0] };
  const wordFallback = [[40, 4, 48, 0], [30, 33, 40, -12], [55, 17, 24, -30], [33, 18, 24, 0], [52, 27, 24, 0]];
  const words = (sc.words || []).map((w, i) => {
    const [l, t, fs, rot] = wordPos[w] || wordFallback[i % wordFallback.length];
    return h('span.bw.a-jump', { style: { left: `${l}%`, top: `${t}%`, fontSize: `${fs}px`, '--rot': `${rot}deg` } }, w);
  });
  // 薄荷标签沿气球下半部左右交错，间距拉大到不重叠
  const tagPos = [[24, 49, 30], [44, 53, 0], [26, 60, 0], [44, 66, -63], [28, 74, 20], [44, 81, -82]];
  const tags = (sc.tags || []).map((t, i) => {
    const [l, tp, rot] = tagPos[i % tagPos.length];
    return h('span.tag.a-pop', { style: { left: `${l}%`, top: `${tp}%`, '--rot': `${rot}deg` } }, t);
  });
  const balloonBox = h('.balloon-box', outline, ...words, ...tags);
  const cap = sc.caption || [];
  const capEls = [
    h('p.cap1.a-pop', cap[0] || ''),
    h('p.cap2.a-pop', ...(cap[1] || '').split('').map((ch) => (ch === '头' ? h('b.big', ch) : ch === '大' ? h('span.sm', ch) : ch))),
  ];
  // 黄框：第一句切成 3–5 段竖排短语（按标点 / 空格切，过长的段再对半切），横向排一行、各段小角度错落；不再逐字散落
  const yb = sc.yellowBox || [];
  const phrases = splitPhrases(yb[0] || '');
  const scatter = h('.yb-phrases');
  phrases.forEach((txt, i) => {
    const rot = [-6, 4, -3, 6, -5][i % 5], dy = [0, 14, 6, 20, 10][i % 5];
    scatter.append(h('span.a-pop', { style: { '--rot': `${rot}deg`, marginTop: `${dy}px`, fontSize: `${[16, 14, 18, 15, 16][i % 5]}px` } }, txt));
  });
  const play = playBtn('pink');
  const yellow = h('.yellow-box.a-rise', scatter, h('p.yb-last.a-pop', yb[1] || ''), play);
  const el = h('.t2a', balloonBox, ...capEls, yellow);

  async function run() {
    outline.classList.add('draw');
    await rt.wait(1200);
    for (const t of tags) { rt.on(t); await rt.wait(220); }
    for (const w of words) { rt.on(w); await rt.wait(260); }
    for (const c of capEls) { rt.on(c); await rt.wait(500); }
    rt.on(yellow);
    await rt.wait(400);
    // 观众点播放：黄框里的字散乱浮出，最后一行
    await rt.tapOn(play, 1200);
    play.classList.add('done');
    const chars = scatter.querySelectorAll('span');
    for (const c of chars) { rt.on(c); await rt.wait(rt.finished ? 0 : 160); }
    await rt.wait(300);
    rt.on(yellow.querySelector('.yb-last'));
    return false; // 点一下进入 T2b
  }
  return { el, play: run };
}

/** T2b · 记挂的是什么：播放键 + 标题 → 点播放：地铁照片"视频化"（Ken Burns + 抖动）→ 小方块漂移 */
export function videoFace(sc, rt) {
  const play = playBtn('yellow');
  const title = h('h2.t2b-title', sc.title || '');
  // v3 F14：sc.video 有值 → 点播放直接播视频（静音）；没有 → Ken Burns + 抖动 + 漂移方块
  const ph = media(sc.image, sc.video, '', { autoplay: false });
  const boxes = (sc.boxes || []).map((b, i) => h('i.face-box.a-pop', {
    class: `face-box a-pop ${b.color === 'mint' ? 'mint' : 'yellow'}`,
    style: { left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`, '--i': String(i % 4) },
  }));
  const frame = h('.t2b-frame.a-pop', h('.kenburns.shaky', ph), ...boxes);
  const el = h('.t2b', h('.t2b-head', play, title), frame);
  async function run() {
    rt.on(title);
    await rt.tapOn(play, 1000);
    play.classList.add('done');
    rt.on(frame);
    await rt.wait(400);
    if (ph.video) ph.video.play().catch(() => {}); else frame.querySelector('.kenburns').classList.add('play');
    ph.addEventListener('mediafallback', () => frame.querySelector('.kenburns').classList.add('play'));
    await rt.wait(800);
    for (const b of boxes) { rt.on(b); await rt.wait(150); }
    if (!ph.video) frame.classList.add('drift');
    return false; // 点一下进入 Q2
  }
  return { el, play: run };
}
