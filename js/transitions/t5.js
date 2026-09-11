// 第五章过场：T5a 泪海（ui-24）、T5b 我是谁（ui-25）。03 第 7 节。
import { h, photo } from '../util.js';

/** T5a · 泪海：老人眼睛 + 眨眼 → "海"字从眼睛落下 → 灰色方块承接、形变 → 右上竖排框 */
export function tears(sc, rt) {
  const rnd = rt.rnd || Math.random;
  const eyes = h('.tear-eyes.a-pop', photo(sc.image), h('i.blink'));
  const block = h('.tear-block.a-pop', h('i.col.l'), h('i.col.r'));
  const sea = h('.tear-sea');
  const n = Math.max(1, Math.min(300, sc.count || 120));
  const ch = sc.char || '海';
  const chars = [];
  for (let i = 0; i < n; i++) {
    const size = 12 + Math.floor(rnd() * 20);
    const x = 4 + rnd() * 90;              // 落点横向
    const y = 56 + Math.sqrt(rnd()) * 40;  // 落进灰块（越往下越密）
    const sx = (0.6 + rnd() * 1.0).toFixed(2), sy = (0.6 + rnd() * 1.0).toFixed(2);
    const dx = ((rnd() - 0.5) * 12).toFixed(1), dy = ((rnd() - 0.5) * 12).toFixed(1);
    const sway = ((rnd() - 0.5) * 30).toFixed(1);
    chars.push(h('span.tear', {
      class: `tear ${rnd() < 0.5 ? 'mint' : 'grey'}`,
      style: { left: `${x}%`, '--y': `${y}%`, fontSize: `${size}px`, '--sx': sx, '--sy': sy, '--dx': `${dx}px`, '--dy': `${dy}px`, '--sway': `${sway}px`, animationDelay: rt.finished ? '0ms' : `${i * 80}ms, ${i * 80 + 1600}ms` },
    }, ch));
  }
  sea.append(...chars);
  const verse = h('.tear-verse.a-pop', (sc.verse || []).map((t) => h('span', t)));
  const el = h('.t5a', eyes, block, sea, verse);
  async function run() {
    rt.on(eyes);
    await rt.wait(600);
    rt.on(block);
    sea.classList.add('on');
    await rt.wait(Math.min(4000, n * 80 * 0.6));
    rt.on(verse);
    await rt.wait(1000);
    return false; // 点一下进入 T5b
  }
  return { el, play: run };
}

/** T5b · 我是谁："我"在灰底块上 + "是谁" → 丝线画出 → 右下四行竖排渐模糊 → 点一下：放大模糊转场 */
export function whoami(sc, rt) {
  const big = h('.who-big.a-pop', h('i.bg'), h('span', sc.big || '我'));
  const small = h('.who-small.a-pop', sc.small || '是谁');
  const thread = h('.thread');
  fetch('assets/img/thread.svg').then((r) => (r.ok ? r.text() : '')).then((txt) => {
    if (!txt || !rt.alive()) return;
    thread.innerHTML = txt;
    thread.querySelectorAll('path').forEach((p) => { const len = p.getTotalLength ? p.getTotalLength() : 1200; p.style.setProperty('--len', String(len)); });
  }).catch(() => {});
  const blurLines = h('.who-blur', (sc.blurLines || []).map((t, i) => h('span.a-pop', { style: { '--blur': `${1 + i * 1.2}px`, '--d': `${i * 200}ms` } }, t)));
  const el = h('.t5b', thread, big, small, blurLines);
  async function run() {
    rt.on(big); await rt.wait(400);
    rt.on(small); await rt.wait(400);
    thread.classList.add('draw');
    await rt.wait(2000);
    for (const s of blurLines.children) { rt.on(s); await rt.wait(200); }
    blurLines.classList.add('blur');
    await rt.wait(2000);
    await rt.tap(1200);
    if (!rt.finished) { el.classList.add('zoom-out'); await rt.wait(600); }
    return true; // 转场直接进 Q5
  }
  return { el, play: run };
}
