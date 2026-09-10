// 音频播放与降级（02 第十节）
import { h } from './util.js';

let current = null;
let unlocked = false;

/** 演示模式开头点一下解锁自动播放（00 第 6 节第 14 条） */
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  try {
    const a = new Audio();
    a.muted = true;
    a.play().catch(() => {});
  } catch { /* ignore */ }
}

export function stopAll() {
  if (current) { try { current.pause(); } catch { /* ignore */ } current = null; }
  document.querySelectorAll('.playbar.playing').forEach((p) => p.classList.remove('playing'));
}

/**
 * 迷你播放条。返回 { el, play(): Promise<void> }
 * 加载失败 → 播放条变淡（failed），不弹错误；播放被拦截 → 保留按钮等手动点击。
 */
export function createPlaybar(src) {
  const knob = h('span.knob');
  const el = h('button.playbar', { type: 'button', 'aria-label': 'play' }, h('span.tri'), h('span.track', knob));
  let audio = null, failed = false;

  const ensure = () => {
    if (audio) return audio;
    audio = new Audio(src);
    audio.preload = 'auto';
    audio.addEventListener('error', () => { failed = true; el.classList.add('failed'); el.classList.remove('playing'); });
    audio.addEventListener('timeupdate', () => {
      if (audio.duration) knob.style.left = `${Math.min(100, (audio.currentTime / audio.duration) * 100)}%`;
    });
    audio.addEventListener('ended', () => { el.classList.remove('playing'); knob.style.left = '0'; if (current === audio) current = null; });
    return audio;
  };

  const play = () => new Promise((resolve) => {
    if (failed) return resolve();
    const a = ensure();
    stopAll();
    current = a;
    a.currentTime = 0;
    const done = () => { a.removeEventListener('ended', done); a.removeEventListener('error', done); resolve(); };
    a.addEventListener('ended', done);
    a.addEventListener('error', done);
    a.play().then(() => el.classList.add('playing')).catch(() => { el.classList.remove('playing'); resolve(); });
  });

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (el.classList.contains('playing')) { stopAll(); return; }
    play();
  });
  return { el, play, get failed() { return failed; } };
}
