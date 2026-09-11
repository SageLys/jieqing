// 第二章过场：T2a 气球（ui-15）、T2b 记挂的是什么（ui-16）。03 第 7 节。
import { h, photo } from '../util.js';

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
  // 上半部的字：家 48 / 工作 40 / 其余 24（宋体），位置照 ui-15
  // 位置 = ui-15 的坐标换算成 balloon-box 的百分比（box 对应画板 x 0–221、y 36–251）
  const wordPos = [[35, 3, 48, 5], [34, 19, 40, 38], [45, 18, 24, -30], [32, 20, 24, 0], [47, 25, 24, 0]];
  const words = (sc.words || []).map((w, i) => {
    const [l, t, fs, rot] = wordPos[i % wordPos.length];
    return h('span.bw.a-jump', { style: { left: `${l}%`, top: `${t}%`, fontSize: `${fs}px`, '--rot': `${rot}deg` } }, w);
  });
  // 薄荷标签沿气球下半部
  const tagPos = [[33, 61, 26], [34, 72, -82], [44, 46, -63], [34, 40, 39], [32, 47, 0], [37, 53, 0]];
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
  const yb = sc.yellowBox || [];
  const scatter = h('.yb-scatter');
  (yb[0] || '').split('').forEach((ch, i) => {
    const l = 8 + ((i * 37) % 70), t = 10 + ((i * 53) % 50), rot = ((i * 29) % 40) - 20;
    scatter.append(h('span.a-pop', { style: { left: `${l}%`, top: `${t}%`, '--rot': `${rot}deg`, fontSize: `${12 + (i % 3) * 4}px` } }, ch));
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
    for (const c of chars) { rt.on(c); await rt.wait(rt.finished ? 0 : 60); }
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
  const ph = photo(sc.image);
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
    frame.querySelector('.kenburns').classList.add('play');
    await rt.wait(800);
    for (const b of boxes) { rt.on(b); await rt.wait(150); }
    frame.classList.add('drift');
    return false; // 点一下进入 Q2
  }
  return { el, play: run };
}
