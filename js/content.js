// 内容加载与校验（00 第 7 节）
import { DATA } from './util.js';

export async function loadContent() {
  const file = DATA === 'dev' ? 'content/content.dev.json' : 'content/content.json';
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
  chapters.forEach((ch) => {
    if (!qById[ch.questionId]) err(`章 ${ch.id} 引用的 questionId=${ch.questionId} 不存在`);
    if (!ch.transition) warn(`章 ${ch.id} 没有 transition`);
  });

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
        if (isPlaceholder(o.text)) warn(`${o.id} text 待填`);
        if (s.kind === 'ai') {
          if ('age' in s) err(`${o.id} 是 ai，不应有 age 字段`);
          if (isPlaceholder(s.model) || isPlaceholder(s.queriedAt)) warn(`${o.id} ai 的 model/queriedAt 待填`);
        } else if (s.kind === 'human') {
          if (!Number.isInteger(s.age)) err(`${o.id} human 的 age 不是整数（不会点亮刻度尺）`);
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
  if (!Array.isArray(c.finale?.revealText)) err('finale.revealText 应为字符串数组');
  if (!Array.isArray(c.host?.intro)) err('host.intro 应为字符串数组');
  return out;
}

/** 异步检查音频是否缺失，结果追加进 issues 并回调 */
export async function checkAudio(c, onIssue) {
  const tasks = [];
  for (const q of c.questions || []) for (const b of q.beats || []) for (const o of b.options || []) {
    const a = o.source?.audio;
    if (o.source?.kind !== 'human' || !a) continue;
    tasks.push(fetch(a, { method: 'HEAD', cache: 'no-cache' }).then((r) => {
      if (!r.ok) onIssue({ level: 'warn', msg: `音频缺失：${a}（${o.id}，将只显示字幕）` });
    }).catch(() => onIssue({ level: 'warn', msg: `音频不可达：${a}（${o.id}）` })));
  }
  await Promise.all(tasks);
}
