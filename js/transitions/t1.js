// 第一章过场：T1a 键盘（ui-02）、T1b 宝贝（ui-05）。03 第 7 节。
import { h, photo, media, REDUCED } from '../util.js';

const KB_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['⇧', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
  ['符', '123', '。,', '␣', '英', '↵'],
];

/** T1a · 键盘：气泡 → 红块 → 空格 → 键盘升起 → 依次输入 B O R N */
export function keyboard(sc, rt) {
  const word = String(sc.word || 'BORN').toUpperCase().split('');
  const bubbles = (sc.bubbles || []).map((t, i) => h('.t-bubble', { class: `t-bubble ${i % 2 ? 'b2' : 'b1'}` }, h('span.txt'), h('span.plane')));
  // 红方块：右上一小块、左中一横条、左下一块、右下一竖条（ui-02）
  const blocks = [
    h('.red-blk.a-pop', { style: { left: '340px', top: '8px', width: '34px', height: '34px' } }),
    h('.red-blk.a-pop', { style: { left: '4px', top: '140px', width: '36px', height: '10px' } }),
    h('.red-blk.a-pop', { style: { left: '10px', top: '316px', width: '36px', height: '36px' } }),
    h('.red-blk.a-pop', { style: { left: '298px', top: '312px', width: '36px', height: '110px' } }),
  ];
  const blanks = h('.kb-blanks.a-pop', word.map(() => h('span.blank', h('b'), h('i.cursor'))));
  const kb = h('.kb');
  const keyEls = {};
  KB_ROWS.forEach((row) => {
    const r = h('.kb-row');
    row.forEach((k) => {
      const idx = word.indexOf(k);
      const key = h('button.key', { type: 'button', class: `key${idx >= 0 ? ' hot' : ''}${k === '␣' ? ' wide' : ''}${k.length > 1 && k !== '␣' ? ' fn' : ''}`, dataset: { k } }, k === '␣' ? '' : k);
      if (idx >= 0) keyEls[k] = key;
      r.append(key);
    });
    kb.append(r);
  });
  const el = h('.t1a', h('.t-bubbles', bubbles), ...blocks, h('.t1a-hint.pixel-16', rt.ui.typeHint || ''), blanks, kb);

  async function play() {
    // 1. 两个气泡逐字打出
    for (let i = 0; i < bubbles.length; i++) {
      rt.on(bubbles[i]);
      await rt.type(bubbles[i].querySelector('.txt'), sc.bubbles[i]);
      if (!rt.alive()) return false;
      await rt.wait(300);
    }
    // 2. 红块逐个出现
    for (const b of blocks) { rt.on(b); await rt.wait(200); }
    // 3. 空格 + 光标
    rt.on(blanks);
    blanks.querySelectorAll('.blank')[0]?.classList.add('cur');
    await rt.wait(300);
    // 4. 键盘升起
    kb.classList.add('on');
    el.querySelector('.t1a-hint')?.classList.add('on');
    await rt.wait(rt.finished ? 0 : 450);
    // 5. 依次输入（顺序必须对；错键抖动两次不生效；物理键盘也接受）
    let pos = 0;
    const fill = (k) => {
      const slots = blanks.querySelectorAll('.blank');
      slots[pos].querySelector('b').textContent = k;
      slots[pos].classList.remove('cur');
      keyEls[k]?.classList.remove('hot');
      pos++;
      if (pos < word.length) slots[pos].classList.add('cur');
    };
    if (rt.finished) { word.forEach(fill); return true; }
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; window.removeEventListener('keydown', onKey); clearInterval(watch); resolve(); };
      const tryKey = (k) => {
        if (done || pos >= word.length) return;
        if (k === word[pos]) { fill(k); if (pos >= word.length) finish(); }
        else {
          const key = kb.querySelector(`.key[data-k="${CSS.escape(k)}"]`) || blanks;
          key.classList.remove('shake'); void key.offsetWidth; key.classList.add('shake');
        }
      };
      const onKey = (e) => { if (e.key && e.key.length === 1) tryKey(e.key.toUpperCase()); };
      kb.addEventListener('click', (e) => { const key = e.target.closest('.key'); if (key) { e.stopPropagation(); tryKey(key.dataset.k); } });
      window.addEventListener('keydown', onKey);
      const watch = setInterval(() => { if (!rt.alive()) finish(); }, 500); // 屏幕销毁时收尾
      if (rt.demo) word.forEach((k, i) => rt.after(400 * (i + 1), () => tryKey(k)));
    });
    if (!rt.alive()) return false;
    await rt.wait(500);
    return true; // 四个填满 → 直接进 T1b
  }
  return { el, play };
}

/** T1b · 宝贝：四句交错渐显 → 照片 Ken Burns → 红色半透明块 → 手写"宝贝"画出 → mma / bba */
export function baby(sc, rt) {
  const lines = sc.lines || [];
  const lineEls = lines.map((t, i) => h('p.line', { class: `line l${i + 1} ${i % 2 ? 'from-r' : 'from-l'}` }, t));
  // v3 F14：sc.video 有值 → 静音循环播（封面 = 照片），Ken Burns 不再缩放；出错退回照片 + Ken Burns
  const ph = media(sc.image, sc.video, 'a-pop');
  const kb = h('.kenburns', ph);
  let playTri = null;
  if (ph.video) {
    kb.classList.add('has-video');
    playTri = h('button.play-tri.pink.video-toggle', { type: 'button', 'aria-label': 'play' });
    playTri.addEventListener('click', (e) => { e.stopPropagation(); const v = ph.video; if (!v) return; if (v.paused) v.play().catch(() => {}); else v.pause(); });
    ph.video.addEventListener('play', () => playTri.classList.add('playing'));
    ph.video.addEventListener('pause', () => playTri.classList.remove('playing'));
    kb.append(playTri);
    ph.addEventListener('mediafallback', () => { kb.classList.remove('has-video'); playTri.remove(); if (kb.classList.contains('armed')) kb.classList.add('play'); });
  }
  const redBig = [
    h('.red-blk.soft.a-pop', { style: { left: '6%', top: '-4%', width: '40%', height: '30%' } }),
    h('.red-blk.soft.a-pop', { style: { right: '-14%', bottom: '18%', width: '40%', height: '30%' } }),
  ];
  const redSmall = [[-6, 78, 12], [-14, 96, 16], [6, 100, 12]].map(([l, t, s]) => h('.red-blk.a-drop', { style: { left: `${l}%`, top: `${t}%`, width: `${s}px`, height: `${s}px` } }));
  const photoBox = h('.t1b-photo', kb, ...redBig, ...redSmall);
  const hand = sc.handwriting ? h('.hand-wrap', h('img.hand', { src: sc.handwriting, alt: '宝贝' })) : h('.hand-wrap.missing');
  const babble = (sc.babble || []).map((t, i) => h('span.babble', { class: `babble bb${i + 1} a-pop` }, t));
  const el = h('.t1b',
    lineEls[0], photoBox, lineEls[1],
    h('.t1b-row', hand, lineEls[2], babble[0]),
    h('.t1b-foot', lineEls[3], babble[1]));

  async function play() {
    // 1. 交错渐显：奇数句从左、偶数句从右，各 400ms，间隔 300ms
    for (const l of lineEls) { rt.on(l); await rt.wait(300); }
    // 2. 照片出现，停 800ms 后 Ken Burns（6 秒 1.0→1.06 + 上移 6px）
    rt.on(ph);
    await rt.wait(800);
    kb.classList.add('armed');
    if (ph.video) ph.video.play().catch(() => {}); else kb.classList.add('play');
    // 3. 3 秒后红色半透明方块
    await rt.wait(3000);
    for (const b of redBig) { rt.on(b); await rt.wait(250); }
    for (const b of redSmall) { rt.on(b); await rt.wait(120); }
    // 4. 手写"宝贝"画出（800ms），mma / bba 最后出现
    rt.on(hand);
    await rt.wait(REDUCED ? 200 : 800);
    for (const b of babble) { rt.on(b); await rt.wait(400); }
    return false; // 点一下进入 Q1
  }
  return { el, play };
}
