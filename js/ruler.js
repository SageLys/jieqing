// 刻度尺（02 第八节，03 5.7 / 5.18）
import { h } from './util.js';

export class Ruler {
  constructor(root, content) {
    this.root = root;
    this.range = content.meta?.scaleRange || [0, 100];
    this.marks = [];          // {age, respondentId, origin, ageLabel, optionId, beatId}
    this.personaAge = null;
    this.visible = false;
    this.litKeys = new Set(); // 已点亮的 optionId（同一条回答不重复点）
  }
  pct(age) {
    const [a, b] = this.range;
    return ((age - a) / (b - a)) * 100;
  }
  show(personaAge) {
    this.visible = true;
    this.personaAge = personaAge ?? this.personaAge;
    this.root.hidden = false;
    this.render();
  }
  hide() { this.visible = false; this.root.hidden = true; }

  /** 揭晓：该拍所有 human 点亮一格；ai 什么也不做。返回新增的标记。 */
  light(beat) {
    const added = [];
    for (const o of beat.options || []) {
      const s = o.source || {};
      if (s.kind !== 'human') continue;             // ai：不点亮（核心机制）
      if (!Number.isInteger(s.age)) continue;        // 校验失败：不点亮
      if (this.litKeys.has(o.id)) continue;
      this.litKeys.add(o.id);
      const m = { age: s.age, respondentId: s.respondentId, origin: s.origin, ageLabel: s.ageLabel, optionId: o.id, beatId: beat.id };
      this.marks.push(m); added.push(m);
    }
    if (this.visible) this.render(added);
    return added;
  }
  /** 按年龄分组：[{age, items:[...]}] */
  groups(marks = this.marks) {
    const map = new Map();
    for (const m of marks) { if (!map.has(m.age)) map.set(m.age, []); map.get(m.age).push(m); }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([age, items]) => ({ age, items }));
  }
  ticks() {
    const [a, b] = this.range;
    const out = [];
    for (let v = a; v <= b; v += 5) out.push({ v, label: v === a ? '零' : v === b ? '百' : String(v) });
    return out;
  }
  render(animateMarks = null) {
    const inner = h('.ruler-inner');
    for (const t of this.ticks()) {
      inner.append(h('span.tick', { class: t.v === this.personaAge ? 'tick persona' : 'tick', style: { top: `${this.pct(t.v)}%` } }, t.label));
    }
    if (Number.isInteger(this.personaAge)) inner.append(h('span.persona-line', { style: { top: `${this.pct(this.personaAge)}%` } }));
    let delay = 0;
    const newSet = new Set((animateMarks || []).map((m) => m.optionId));
    for (const g of this.groups()) {
      const top = `${this.pct(g.age)}%`;
      const n = g.items.length;
      const shown = Math.min(n, 3);
      for (let i = 0; i < shown; i++) {
        const m = g.items[i];
        const isNew = newSet.has(m.optionId);
        const k = h('span.knot', { class: isNew ? 'knot' : 'knot static', style: { left: `${16 + i * 7}px`, top, animationDelay: isNew ? `${delay}ms` : '0ms' } });
        if (isNew) delay += 80;
        inner.append(k);
      }
      if (n > 3) inner.append(h('span.knot-n', { style: { left: `${16 + shown * 7 + 2}px`, top } }, `×${n}`));
    }
    this.root.replaceChildren(inner);
  }
}
