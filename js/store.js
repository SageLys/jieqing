// 存储适配层（00 第 7 节）。接口：getDistribution / addVote / getPool / submitToPool
// 只实现 LocalStore；RemoteStore 不做（00 第 2 节第 10 条：路演只放视频 + 本机演示），接口形状留着。

const KEY_POOL = 'pool';
const distKey = (beatId) => `dist:${beatId}`;

function safeGet(k, def) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
}
function safeSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式等：静默 */ }
}

export class LocalStore {
  constructor(content, { readOnly = false } = {}) {
    this.content = content;
    this.readOnly = readOnly; // 演示模式：不读写 localStorage
  }
  /**
   * P0：只返回 fallbackDistribution，并标注 fallback=true（00 第 6 节第 7 条）。
   * 本机投票另存，不叠加到显示结果。
   */
  async getDistribution(beatId) {
    const fb = this.content.fallbackDistribution?.[beatId];
    return { sampleSize: fb?.sampleSize ?? 0, counts: fb?.counts ?? {}, fallback: true };
  }
  async addVote(beatId, optionId) {
    if (this.readOnly) return;
    const d = safeGet(distKey(beatId), {});
    d[optionId] = (d[optionId] || 0) + 1;
    safeSet(distKey(beatId), d);
  }
  async getPool() {
    const seed = (this.content.finale?.poolSeed || []).map((e) => ({ ...e, seed: true }));
    const local = this.readOnly ? [] : safeGet(KEY_POOL, []);
    return [...local.map((e) => ({ ...e, local: true })), ...seed]
      .filter((e) => e && typeof e.text === 'string')
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  }
  async submitToPool(entry) {
    // 07 2.5：{ knotId, colors, text, createdAt }
    const e = {
      knotId: entry.knotId || null,
      colors: entry.colors && typeof entry.colors === 'object' ? { ...entry.colors } : {},
      text: String(entry.text).slice(0, this.content.finale?.maxLength || 200),
      createdAt: entry.createdAt || new Date().toISOString(),
    };
    if (!this.readOnly) {
      const pool = safeGet(KEY_POOL, []);
      pool.unshift(e);
      safeSet(KEY_POOL, pool.slice(0, 500));
    }
    return e;
  }
}

/** P1：远程存储。后端选型未定，这里只留接口形状。 */
export class RemoteStore extends LocalStore {
  constructor(content, opts) { super(content, opts); this.endpoint = opts?.endpoint; }
  // async getDistribution(beatId) { ... fetch(`${this.endpoint}/dist/${beatId}`) ... }
  // async addVote(beatId, optionId) { ... }
  // async getPool() { ... }
  // async submitToPool(entry) { ... }
}

export function createStore(content, { demo = false } = {}) {
  return new LocalStore(content, { readOnly: demo });
}
