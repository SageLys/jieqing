// 第四章过场：T4a 打字机与病名（ui-21）、T4b 我开始忘事儿了（ui-22）。03 第 7 节。
import { h, photo, REDUCED } from '../util.js';

/** 个别字放大或错位（03 T4a 第 1 步）："上"上标、"大" 48px、"小" 12px */
function decorate(line, ch, i) {
  if (ch === '上' && line.includes('跟不上')) return h('sup', ch);
  if (ch === '大' && i === 0) return h('b.xl', ch);
  if (ch === '小') return h('small', ch);
  return document.createTextNode(ch);
}

/** T4a · 打字机：三行打字机（≤5 秒，每字 ≤0.3 秒）→ 点一下：青色表格 + 照片 → 病名逐个盖章 → 底部小字 + 进度条 */
export function typewriterScreen(sc, rt) {
  const lines = sc.lines || [];
  const total = lines.reduce((a, l) => a + l.length, 0) || 1;
  const perChar = Math.max(20, Math.min(300, Math.floor(4500 / total)));
  const lineEls = lines.map(() => h('p.tw-line'));
  const caret = h('i.tw-caret');
  const grid = h('.tw-grid.a-pop');
  const ph = photo(sc.image, 'tw-photo a-pop');
  const stampPos = [[6, 2, 24], [58, 8, 16], [10, 22, 18], [34, 22, 18], [30, 36, 24], [2, 56, 20], [34, 62, 14], [58, 74, 18], [8, 84, 20]];
  const stamps = (sc.stamps || []).map((s, i) => {
    const [l, t, fs] = stampPos[i % stampPos.length];
    return h('span.stamp.a-stamp', { style: { left: `${l}%`, top: `${t}%`, fontSize: `${fs}px` } }, s);
  });
  const footer = h('.tw-foot.a-pop', h('span.tri'), h('span.txt', sc.footer || ''), h('i.bar'));
  grid.append(ph, ...stamps, footer);
  const el = h('.t4a', h('.tw-text', ...lineEls), grid);
  async function run() {
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li], p = lineEls[li];
      p.append(caret);
      for (let i = 0; i < line.length; i++) {
        caret.before(decorate(line, line[i], i));
        if (!rt.finished && !REDUCED) await rt.wait(perChar);
        if (!rt.alive()) return false;
      }
    }
    await rt.wait(500);
    caret.remove();
    await rt.tap(900);
    rt.on(grid);
    await rt.wait(400);
    rt.on(ph);
    await rt.wait(400);
    for (const s of stamps) { rt.on(s); await rt.wait(180); }
    rt.on(footer);
    return false; // 点一下进入 T4b
  }
  return { el, play: run };
}

/** T4b · 我开始忘事儿了：标题 → 两行粉色 ×× 画出 → 空白粉框 → 图片最后出现（叠青色 70% 方块） */
export function forget(sc, rt) {
  const title = h('h2.fg-title.a-pop', sc.title || '');
  const xs = () => h('.fg-xs.a-wipe', '×'.repeat(40));
  const x1 = xs(), x2 = xs();
  const frame = sc.frame === false ? null : h('.fg-frame.a-pop');
  const img = h('.fg-photo.a-pop', photo(sc.image), h('i.cyan'));
  const el = h('.t4b', title, h('.fg-img-area', x1, img, x2), frame);
  async function run() {
    rt.on(title);
    await rt.wait(400);
    rt.on(x1); await rt.wait(500);
    rt.on(x2); await rt.wait(500);
    if (frame) { rt.on(frame); await rt.wait(500); }
    rt.on(img);
    return false; // 点一下进入 Q4
  }
  return { el, play: run };
}
