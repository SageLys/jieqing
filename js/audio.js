// 题级真人录音播放器：清单驱动、方言优先、可取消，不与选项绑定。
import { h } from './util.js';

const MEMORY_COUNTS = {};
const STORAGE_KEY = 'jieqing:voice-rotation:v1';
let fallbackRandomState = ((Date.now() ^ Math.floor((typeof performance !== 'undefined' ? performance.now() : 0) * 1000)) >>> 0) || 0x6d2b79f5;

function random01() {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
  } catch {
    // 与 App 的 Math.random / 演示种子完全分离，不能改变选项顺序或结绳结果。
    fallbackRandomState ^= fallbackRandomState << 13;
    fallbackRandomState ^= fallbackRandomState >>> 17;
    fallbackRandomState ^= fallbackRandomState << 5;
    return (fallbackRandomState >>> 0) / 4294967296;
  }
}

function familyOf(clip, byId) {
  let cur = clip, guard = 0;
  while (cur?.variantOf && byId.has(cur.variantOf) && guard++ < 20) cur = byId.get(cur.variantOf);
  return cur?.clipId || clip.clipId;
}

function cancellableDelay(ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(false); return; }
    const timer = setTimeout(() => done(true), ms);
    const onAbort = () => done(false);
    const done = (ok) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(ok);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export class VoicePlayer {
  constructor(config = {}, { demo = false } = {}) {
    this.config = config;
    this.demo = demo;
    this.manifest = null;
    this.byId = new Map();
    this.groups = new Map();
    this.preloads = new Map();
    this.current = null;
    this.controller = null;
    this.autoPlayed = new Set();
    this.listeners = new Set();
    this.muted = false;
    this.primed = false;
    this.actualPlayback = false;
    this.state = 'loading';
    this.currentQuestionId = null;
    this.counts = this.readCounts();
  }

  readCounts() {
    if (this.demo) return {};
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch { return MEMORY_COUNTS; }
  }

  writeCounts() {
    if (this.demo) return;
    Object.assign(MEMORY_COUNTS, this.counts);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.counts)); } catch { /* memory fallback */ }
  }

  setState(state) {
    this.state = state;
    this.listeners.forEach((fn) => fn(this.snapshot()));
  }

  snapshot() {
    return {
      state: this.state,
      muted: this.muted,
      ready: !!this.manifest,
      actualPlayback: this.actualPlayback,
      questionId: this.currentQuestionId,
    };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  setManifest(manifest) {
    this.manifest = manifest;
    this.byId = new Map(manifest.clips.map((clip) => [clip.clipId, clip]));
    this.setState(this.muted ? 'muted' : 'ready');
  }

  /** 必须由真实用户手势调用；真正可播仍以 audio.play() 结果为准。 */
  primeFromGesture() {
    this.primed = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.audioContext) this.audioContext = new AC();
      this.audioContext.resume().catch(() => {});
    } catch { /* actual playback will decide */ }
  }

  getGroup(questionId) {
    if (!this.manifest) return [];
    if (!this.groups.has(questionId)) this.groups.set(questionId, this.pickGroup(questionId));
    return this.groups.get(questionId) || [];
  }

  pickGroup(questionId) {
    if (this.demo) {
      const ids = this.config.demoQueues?.[questionId] || [];
      return ids.map((id) => this.byId.get(id)).filter((clip) => clip?.questionId === questionId);
    }
    const clips = this.manifest.clips.filter((clip) => clip.questionId === questionId);
    if (!clips.length) return [];
    const target = Math.max(1, this.config.clipsPerGroup ?? 3);
    const gap = ((this.config.gapMinMs ?? 400) + (this.config.gapMaxMs ?? 700)) / 2000;
    const maxSeconds = this.config.targetMaxSeconds ?? 15;
    const jitter = new Map(clips.map((clip) => [clip.clipId, random01()]));
    const ranked = (list) => list.slice().sort((a, b) => {
      const countDiff = (this.counts[a.clipId] || 0) - (this.counts[b.clipId] || 0);
      return countDiff || jitter.get(a.clipId) - jitter.get(b.clipId);
    });
    const dialect = ranked(clips.filter((c) => c.languageType === 'dialect'));
    const mandarin = ranked(clips.filter((c) => c.languageType === 'mandarin'));
    const other = ranked(clips.filter((c) => !['dialect', 'mandarin'].includes(c.languageType)));
    const chosen = [];
    const speakers = new Set(), families = new Set();
    const secondsWith = (clip) => chosen.reduce((sum, c) => sum + Number(c.duration || 0), 0)
      + Number(clip.duration || 0) + gap * chosen.length + (this.config.startDelayMs ?? 600) / 1000;
    const canUse = (clip) => !speakers.has(clip.speakerId) && !families.has(familyOf(clip, this.byId));
    const add = (clip, allowOver = false) => {
      if (!clip || !canUse(clip) || (!allowOver && chosen.length && secondsWith(clip) > maxSeconds)) return false;
      chosen.push(clip); speakers.add(clip.speakerId); families.add(familyOf(clip, this.byId));
      return true;
    };
    // 方言先播；q2 优先让“带礼”和“递礼”两种措辞都能进入同一组。
    if (questionId === 'q2') {
      add(dialect.find((c) => c.beatIds?.includes('q2b1')));
      add(dialect.find((c) => c.beatIds?.includes('q2b2')));
    } else {
      add(dialect[0]);
      add(dialect.find((c) => canUse(c)));
    }
    // 普通话保留稳定席位；若三段会明显超时，自然缩成“一段方言 + 一段普通话”。
    const mandarinClip = mandarin.find((c) => canUse(c));
    if (mandarinClip && chosen.length > 1 && secondsWith(mandarinClip) > maxSeconds) {
      chosen.pop();
      speakers.clear(); families.clear();
      chosen.forEach((clip) => { speakers.add(clip.speakerId); families.add(familyOf(clip, this.byId)); });
    }
    add(mandarinClip, true);
    for (const pool of [dialect, other, mandarin]) {
      for (const clip of pool) {
        if (chosen.length >= target) break;
        add(clip);
      }
    }
    return chosen.slice(0, target);
  }

  prepareQuestion(questionId, nextQuestionId = null) {
    if (!this.manifest) return;
    const clips = [...this.getGroup(questionId)];
    if (nextQuestionId) clips.push(...this.getGroup(nextQuestionId).slice(0, 1));
    this.setPreloads(clips);
  }

  setPreloads(clips) {
    const keep = new Set(clips.map((clip) => clip.src));
    for (const [src, audio] of this.preloads) {
      if (keep.has(src)) continue;
      try { audio.removeAttribute('src'); audio.load(); } catch { /* ignore */ }
      this.preloads.delete(src);
    }
    clips.forEach((clip) => {
      if (this.preloads.has(clip.src)) return;
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.src = clip.src;
      this.preloads.set(clip.src, audio);
    });
  }

  stop(reason = 'stopped') {
    if (this.controller) this.controller.abort(reason);
    this.controller = null;
    if (this.current) {
      try { this.current.pause(); this.current.removeAttribute('src'); this.current.load(); } catch { /* ignore */ }
      this.current = null;
    }
    if (this.muted) this.setState('muted');
    else if (reason === 'hidden') this.setState('interrupted');
    else if (this.manifest) this.setState('ready');
  }

  setMuted(value) {
    this.muted = !!value;
    if (this.muted) this.stop('muted');
    else this.setState(this.manifest ? 'ready' : 'loading');
  }

  async toggleOrEnable(questionId) {
    this.primeFromGesture();
    if (this.muted) { this.setMuted(false); return; }
    if (this.state === 'blocked') await this.playQuestion(questionId, { manual: true });
    else this.setMuted(true);
  }

  async playQuestion(questionId, { manual = false } = {}) {
    if (!this.manifest || this.muted) return false;
    if (!manual && this.autoPlayed.has(questionId)) return false;
    if (!manual) this.autoPlayed.add(questionId);
    const clips = this.getGroup(questionId);
    if (!clips.length) { this.setState('unavailable'); return false; }
    this.stop('replaced');
    const controller = new AbortController();
    this.controller = controller;
    this.currentQuestionId = questionId;
    this.setState('starting');
    let successCount = 0;
    for (let i = 0; i < clips.length; i++) {
      if (controller.signal.aborted || this.muted) break;
      const outcome = await this.playClip(clips[i], controller.signal);
      if (outcome === 'played') {
        successCount++;
        if (!manual && !this.demo) {
          this.counts[clips[i].clipId] = (this.counts[clips[i].clipId] || 0) + 1;
          this.writeCounts();
        }
      }
      if (outcome === 'blocked') { this.setState('blocked'); break; }
      if (i < clips.length - 1 && !controller.signal.aborted) {
        const min = this.config.gapMinMs ?? 400, max = this.config.gapMaxMs ?? 700;
        if (!await cancellableDelay(Math.round(min + random01() * Math.max(0, max - min)), controller.signal)) break;
      }
    }
    if (this.controller === controller) this.controller = null;
    if (!controller.signal.aborted && this.state !== 'blocked') this.setState(successCount ? 'complete' : 'failed');
    return successCount > 0;
  }

  playClip(clip, signal) {
    return new Promise((resolve) => {
      if (signal.aborted) { resolve('cancelled'); return; }
      const audio = new Audio(clip.src);
      audio.preload = 'auto';
      this.current = audio;
      let settled = false, started = false;
      const timeoutMs = Math.min(this.config.clipTimeoutMs ?? 20000, Math.max(8000, Number(clip.duration || 0) * 1000 + 6000));
      const timer = setTimeout(() => finish('failed'), timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        audio.removeEventListener('playing', onPlaying);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
      };
      const finish = (result) => {
        if (settled) return;
        settled = true; cleanup();
        try { audio.pause(); } catch { /* ignore */ }
        if (this.current === audio) this.current = null;
        resolve(result);
      };
      const onAbort = () => finish('cancelled');
      const onPlaying = () => {
        if (signal.aborted) { finish('cancelled'); return; }
        started = true; this.actualPlayback = true; this.setState('playing');
      };
      const onEnded = () => finish(started ? 'played' : 'failed');
      const onError = () => finish('failed');
      signal.addEventListener('abort', onAbort, { once: true });
      audio.addEventListener('playing', onPlaying);
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      let promise;
      try { promise = audio.play(); } catch { finish('blocked'); return; }
      Promise.resolve(promise).catch((error) => {
        if (signal.aborted) finish('cancelled');
        else if (error?.name === 'NotAllowedError') finish('blocked');
        else finish('failed');
      });
    });
  }

  createControls(questionId, ctx) {
    const cfg = this.config.labels || {};
    const toggle = h('button.voice-btn.voice-toggle', { type: 'button' });
    const replay = h('button.voice-btn.voice-replay', { type: 'button' }, cfg.replay || '重听人声');
    const status = h('span.voice-status', { role: 'status', 'aria-live': 'polite' });
    const el = h('.voice-controls', toggle, replay, status);
    const render = (snap) => {
      toggle.textContent = snap.muted ? (cfg.unmute || '开启声音') : snap.state === 'blocked' ? (cfg.enable || '开启声音') : (cfg.mute || '静音');
      replay.disabled = !snap.ready || snap.state === 'starting' || snap.state === 'playing';
      const map = {
        loading: cfg.loading || '声音准备中', starting: cfg.starting || '即将播放', playing: cfg.playing || '人声播放中',
        complete: cfg.complete || '播放完毕', blocked: cfg.blocked || '声音被浏览器拦截', failed: cfg.failed || '本组声音暂不可用',
        unavailable: cfg.unavailable || '本题暂无声音', interrupted: cfg.interrupted || '播放已停止', muted: cfg.muted || '已静音', ready: '',
      };
      status.textContent = map[snap.state] ?? '';
      el.classList.toggle('is-playing', snap.state === 'playing');
    };
    const unsubscribe = this.subscribe(render);
    ctx?.onCleanup?.(unsubscribe);
    toggle.addEventListener('click', (event) => { event.stopPropagation(); this.toggleOrEnable(questionId); });
    replay.addEventListener('click', (event) => {
      event.stopPropagation();
      this.primeFromGesture();
      if (this.muted) this.setMuted(false);
      this.playQuestion(questionId, { manual: true });
    });
    return el;
  }
}

export function createVoicePlayer(config, opts) { return new VoicePlayer(config, opts); }
