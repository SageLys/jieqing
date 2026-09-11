// 内容加载与校验（00 第 7 节）
import { DATA } from './util.js';

export async function loadContent() {
  // 2026-09-11 起只有一份 content.json（占位数据已并入正式版）；?data=dev 仍可用，指向同一份
  const file = 'content/content.json';
  const res = await fetch(file, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`加载 ${file} 失败：${res.status}`);
  const c = await res.json();
  c.__file = file;
  return c;
}

/** 返回 [{level:'error'|'warn', msg}] */
export function validateContent(c) {
  const out = [];
  const err = (m) => out.push({ level: 'error', msg: m });
  const warn = (m) => out.push({ level: 'warn', msg: m });
  const isPlaceholder = (s) => typeof s === 'string' && /\[待填|\[受访编号|\[成长地|\[方言|\[音频|\[模型|\[界面显示|XX/.test(s);

  if (!c.meta?.title) err('meta.title 缺失');
  if (c.meta?.contentStatus === 'skeleton') warn('contentStatus = skeleton：这是骨架数据，选项待填（用 ?data=dev 联调）');

  const chapters = c.chapters || [];
  const questions = c.questions || [];
  if (chapters.length !== 5) err(`chapters 应为 5 章，现在 ${chapters.length}`);
  if (questions.length !== 5) err(`questions 应为 5 问，现在 ${questions.length}`);
  const qById = Object.fromEntries(questions.map((q) => [q.id, q]));
  const COLORS = new Set(['red', 'yellow', 'green', 'cyan', 'black']);
  const SCREEN_TYPES = new Set(['keyboard', 'baby', 'balloon', 'video-face', 'walk', 'scribble', 'typewriter', 'forget', 'tears', 'whoami']);
  const imageRefs = [];
  const videoRefs = [];
  // v3 4.2 / 4.3：video 可为 { mp4, webm, poster } 或字符串；只 warn 不 error
  const checkVideo = (v, where) => {
    if (v == null) return;
    if (typeof v === 'string') { videoRefs.push({ src: v, where }); return; }
    if (typeof v !== 'object') { warn(`${where} 的 video 应为字符串或 { mp4, webm, poster }`); return; }
    if (!v.mp4 && !v.webm) warn(`${where} 的 video 既没有 mp4 也没有 webm（将退回照片）`);
    ['mp4', 'webm', 'poster'].forEach((k) => { if (v[k]) videoRefs.push({ src: v[k], where }); });
  };
  // v3 4.1：cover.photos[] 需要 src / x / y / w（缺 x/y/w 只 warn，按 0 处理）
  (c.cover?.photos || []).forEach((p, i) => {
    if (!p?.src) err(`cover.photos[${i}] 缺 src`);
    else imageRefs.push({ src: p.src, where: `cover.photos[${i}]` });
    ['x', 'y', 'w'].forEach((k) => { if (!Number.isFinite(p?.[k])) warn(`cover.photos[${i}] 缺 ${k}（按 0 处理）`); });
    if ('age' in (p || {}) || 'side' in (p || {})) warn(`cover.photos[${i}] 的 age/side 字段 v3 起不再使用`);
  });
  chapters.forEach((ch) => {
    if (!qById[ch.questionId]) err(`章 ${ch.id} 引用的 questionId=${ch.questionId} 不存在`);
    if (!COLORS.has(ch.color)) err(`章 ${ch.id} 的 color=${ch.color} 不合法（red / yellow / green / cyan / black）`);
    const screens = ch.transition?.screens;
    if (!Array.isArray(screens) || screens.length !== 2) err(`章 ${ch.id} 的 transition.screens 应为两屏，现在 ${screens?.length ?? 0}`);
    (screens || []).forEach((sc, k) => {
      if (!SCREEN_TYPES.has(sc.type)) err(`章 ${ch.id} 过场第 ${k + 1} 屏 type=${sc.type} 未知`);
      [sc.image, sc.handwriting, ...(sc.images || [])].filter(Boolean).forEach((src) => imageRefs.push({ src, where: `${ch.id} 过场 ${k + 1}` }));
      if ('video' in sc && !['baby', 'video-face'].includes(sc.type)) warn(`${ch.id} 过场第 ${k + 1} 屏（${sc.type}）的 video 字段不会被使用（只有 baby / video-face 支持）`);
      if (['baby', 'video-face'].includes(sc.type)) checkVideo(sc.video, `${ch.id} 过场 ${k + 1}`);
      if (sc.type === 'walk' && 'floatImages' in sc && typeof sc.floatImages !== 'boolean') warn(`${ch.id} 过场第 ${k + 1} 屏 floatImages 应为布尔值`);
    });
    (ch.bookImages || []).forEach((src) => imageRefs.push({ src, where: `${ch.id} bookImages` }));
  });
  questions.forEach((q) => checkVideo(q.video, `${q.id} 题面`));
  c.__imageRefs = imageRefs;
  c.__videoRefs = videoRefs;

  const allBeatIds = new Set();
  const optById = {};
  questions.forEach((q, qi) => {
    if (!q.prompt) err(`${q.id} 缺 prompt`);
    if (!Number.isInteger(q.personaAge)) err(`${q.id} personaAge 不是整数`);
    if (qi < 4 && !q.closing) warn(`${q.id} 缺 closing`);
    if (qi === 4 && q.closing) warn('q5 不应有 closing（00 第 6 节第 5 条），将被忽略');
    (q.beats || []).forEach((b) => {
      allBeatIds.add(b.id);
      if (b.type === 'ai_ranking') {
        const firstBeat = q.beats[0];
        const ids = new Set((firstBeat?.options || []).map((o) => o.id));
        const seen = new Set();
        (b.ranking?.order || []).forEach((id) => {
          if (!ids.has(id)) err(`${b.id} ranking.order 里的 ${id} 不属于 ${firstBeat?.id}`);
          if (seen.has(id)) err(`${b.id} ranking.order 里 ${id} 重复`);
          seen.add(id);
        });
        if (!b.ranking?.order?.length) warn(`${b.id} ranking.order 为空：将不重排，只显示 rationale`);
        if (isPlaceholder(b.ranking?.rationale)) warn(`${b.id} rationale 待填`);
        return;
      }
      const opts = b.options || [];
      if (opts.length < 3 || opts.length > 6) err(`${b.id} 选项数 ${opts.length}，应为 3–6`);
      const ai = opts.filter((o) => o.source?.kind === 'ai');
      if (ai.length !== 1) err(`${b.id} 应恰有一条 ai，现在 ${ai.length}`);
      opts.forEach((o) => {
        optById[o.id] = o;
        const s = o.source || {};
        if (![1, 0, -1].includes(o.score)) err(`${o.id} 的 score=${o.score} 不合法（应为 1 / 0 / -1）`);
        if (isPlaceholder(o.text)) warn(`${o.id} text 待填`);
        if (s.kind === 'ai') {
          if ('age' in s) err(`${o.id} 是 ai，不应有 age 字段`);
          if (isPlaceholder(s.model) || isPlaceholder(s.queriedAt)) warn(`${o.id} ai 的 model/queriedAt 待填`);
        } else if (s.kind === 'human') {
          if (!Number.isInteger(s.age)) err(`${o.id} human 的 age 不是整数`);
          if (!s.respondentId || isPlaceholder(s.respondentId)) err(`${o.id} human 缺 respondentId`);
          if (s.audio && s.audio !== null && !/\.m4a$|\.mp3$|\.aac$|\.wav$/.test(s.audio)) warn(`${o.id} audio 扩展名可疑：${s.audio}`);
        } else err(`${o.id} source.kind=${s.kind} 非法`);
      });
    });
  });

  Object.entries(c.demoPath || {}).forEach(([beatId, optId]) => {
    if (!allBeatIds.has(beatId)) err(`demoPath 的拍 ${beatId} 不存在`);
    if (!optId) warn(`demoPath.${beatId} 为空（演示模式将选打乱后的第一条）`);
    else if (!optById[optId]) err(`demoPath.${beatId}=${optId} 不存在`);
  });
  Object.keys(c.fallbackDistribution || {}).forEach((beatId) => {
    if (!allBeatIds.has(beatId)) err(`fallbackDistribution 的拍 ${beatId} 不存在`);
  });
  if (!Array.isArray(c.host?.intro)) err('host.intro 应为字符串数组');
  if (!Array.isArray(c.host?.kontLines) || !c.host.kontLines.length) warn('host.kontLines 缺失：小KONT 点击将没有台词');

  // 结绳系统（07 第 2、6 节）
  const knots = c.knots || [];
  const knotIds = new Set(knots.map((k) => k.id));
  if (!knots.length) err('knots 缺失');
  const dead = knots.filter((k) => k.dead === true);
  if (dead.length !== 1) err(`knots 里应恰有一个 dead: true，现在 ${dead.length}`);
  knots.forEach((k) => { ['id', 'name', 'short', 'detail', 'glyph'].forEach((f) => { if (!k[f]) err(`knots.${k.id || '?'} 缺 ${f}`); }); });
  const rules = c.knotRules || {};
  const bands = rules.bands || [];
  if (!bands.length) err('knotRules.bands 缺失');
  else {
    const sorted = bands.slice().sort((a, b) => a.maxSum - b.maxSum);
    if (sorted[sorted.length - 1].maxSum < 6) err(`knotRules.bands 最高档 maxSum=${sorted[sorted.length - 1].maxSum}，没覆盖到 6`);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].maxSum <= sorted[i - 1].maxSum) err('knotRules.bands 的 maxSum 有重复');
    sorted.forEach((b) => {
      if (!Array.isArray(b.knots) || !b.knots.length) err(`knotRules 档 maxSum=${b.maxSum} 没有结`);
      (b.knots || []).forEach((id) => { if (!knotIds.has(id)) err(`knotRules 引用的结 ${id} 不存在`); });
    });
  }
  (rules.scoredBeats || []).forEach((id) => { if (!allBeatIds.has(id)) err(`knotRules.scoredBeats 的拍 ${id} 不存在`); });
  if (!Array.isArray(rules.scoredBeats) || rules.scoredBeats.length !== 6) warn(`knotRules.scoredBeats 应为 6 拍，现在 ${rules.scoredBeats?.length ?? 0}`);
  const fin = c.finale || {};
  ['knotIntro', 'knotIntroDead', 'explain', 'explainDead'].forEach((k) => { if (!Array.isArray(fin[k])) err(`finale.${k} 应为字符串数组`); });
  const paletteIds = new Set((fin.palette || []).map((p) => p.id));
  if (!paletteIds.size) err('finale.palette 缺失');
  (fin.poolSeed || []).forEach((e, i) => {
    if (!knotIds.has(e.knotId)) err(`finale.poolSeed[${i}] 的 knotId=${e.knotId} 不存在`);
    Object.values(e.colors || {}).forEach((cid) => { if (!paletteIds.has(cid)) err(`finale.poolSeed[${i}] 的颜色 ${cid} 不在 palette 里`); });
  });
  (c.demoColors || []).forEach((cid) => { if (!paletteIds.has(cid)) err(`demoColors 的 ${cid} 不在 palette 里`); });
  return out;
}

/** 异步检查音频、图片是否缺失（缺失只警告），结果追加进 issues 并回调 */
export async function checkAudio(c, onIssue) {
  const tasks = [];
  for (const { src, where } of c.__imageRefs || []) {
    tasks.push(fetch(src, { method: 'HEAD', cache: 'no-cache' }).then((r) => {
      if (!r.ok) onIssue({ level: 'warn', msg: `图片缺失：${src}（${where}，将显示灰色占位块）` });
    }).catch(() => onIssue({ level: 'warn', msg: `图片不可达：${src}（${where}）` })));
  }
  for (const { src, where } of c.__videoRefs || []) {
    tasks.push(fetch(src, { method: 'HEAD', cache: 'no-cache' }).then((r) => {
      if (!r.ok) onIssue({ level: 'warn', msg: `视频素材缺失：${src}（${where}，将退回照片）` });
    }).catch(() => onIssue({ level: 'warn', msg: `视频素材不可达：${src}（${where}）` })));
  }
  for (const k of c.knots || []) {
    const src = `assets/img/knots/${k.glyph}.svg`;
    tasks.push(fetch(src, { method: 'HEAD', cache: 'no-cache' }).then((r) => { if (!r.ok) onIssue({ level: 'warn', msg: `结的图形缺失：${src}（${k.id}）` }); }).catch(() => {}));
  }
  for (const q of c.questions || []) for (const b of q.beats || []) for (const o of b.options || []) {
    const a = o.source?.audio;
    if (o.source?.kind !== 'human' || !a) continue;
    tasks.push(fetch(a, { method: 'HEAD', cache: 'no-cache' }).then((r) => {
      if (!r.ok) onIssue({ level: 'warn', msg: `音频缺失：${a}（${o.id}，将只显示字幕）` });
    }).catch(() => onIssue({ level: 'warn', msg: `音频不可达：${a}（${o.id}）` })));
  }
  await Promise.all(tasks);
}
