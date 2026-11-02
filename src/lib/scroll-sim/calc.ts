// 衝卷模擬的計算：精確算（動態規劃），不用亂數，每次數字一樣。
// 一件全新裝備可衝 tuc 次、要成功 k 張。成功率 rate、失敗爆裝率 boom。
// 停手規則：成功數到 k 就停（衝成）；剩下次數 < 還差張數就停（放棄，不再浪費卷）。
// 衝不成就換一件全新的重來，直到有一件衝成。
// 白衣：沒爆的失敗用白衣補回那一次（白衣失敗不扣次數、不會爆），所以一件不爆就一定衝得成。

export type SimInput = { tuc: number; k: number; rate: number; boom: number; whiteRate?: number }; // rate、whiteRate 0～100，boom 0～1

export type SimRow = {
  k: number;
  /** 一件衝成 0～1 */
  p: number;
  /** p < 0.001：畫面寫「不到 0.1%」「幾乎衝不到」 */
  tiny: boolean;
  avgItems: number;
  avgScrolls: number;
  /** 沒開白衣為 0 */
  avgWhite: number;
  items90: number | null;
  scrolls90: number | null;
};

const TINY = 0.001;
/** 九成張數往後數的上限（保險，p ≥ 0.1% 實際上遠不會碰到） */
const MAX_STEPS = 400000;

/** 九成機率最少要幾件：最小 m 使 1-(1-p)^m ≥ 0.9 */
function items90Of(p: number): number {
  if (p >= 1) return 1;
  return Math.max(1, Math.ceil(Math.log(0.1) / Math.log(1 - p) - 1e-9));
}

/**
 * 九成機率最少要幾張一般卷（到第一件衝成為止，換件也算）。
 * 把「一件結束（衝成／爆掉／放棄）就回到全新一件」當成一條循環的鏈，一張一張往下推，
 * 累積「已經衝成」的機率到 ≥ 0.9 就停。狀態只有 (成功數, 已用次數)，最多 k×tuc 個，很小。
 */
function scrolls90Of(N: number, K: number, p: number, b: number, white: boolean): number | null {
  // 活著的狀態：成功數 s < K，而且（沒白衣時）剩下次數還夠
  const idx = new Map<number, number>();
  const states: Array<[number, number]> = [];
  const key = (s: number, u: number) => s * (N + 1) + u;
  const live = (s: number, u: number) => s < K && N - u >= K - s;
  const queue: Array<[number, number]> = [[0, 0]];
  idx.set(key(0, 0), 0);
  states.push([0, 0]);
  const toIndex = (s: number, u: number): number => {
    // 衝成由呼叫端先處理；放棄／不夠 → 回到全新一件（0）
    if (!live(s, u)) return 0;
    const kk = key(s, u);
    let i = idx.get(kk);
    if (i === undefined) {
      i = states.length;
      idx.set(kk, i);
      states.push([s, u]);
      queue.push([s, u]);
    }
    return i;
  };
  const WIN = -1;
  const succ: number[] = [];
  const fail: number[] = [];
  for (let q = 0; q < queue.length; q++) {
    const [s, u] = queue[q];
    succ[q] = s + 1 >= K ? WIN : toIndex(s + 1, u + 1);
    fail[q] = white ? q : toIndex(s, u + 1);
  }
  const n = states.length;
  let cur = new Float64Array(n);
  let nxt = new Float64Array(n);
  cur[0] = 1;
  let done = 0;
  const fp = (1 - p) * (1 - b); // 失敗沒爆
  const boomP = (1 - p) * b; // 失敗爆掉 → 換新的一件
  for (let t = 1; t <= MAX_STEPS; t++) {
    nxt.fill(0);
    for (let i = 0; i < n; i++) {
      const m = cur[i];
      if (m === 0) continue;
      if (succ[i] === WIN) done += m * p;
      else nxt[succ[i]] += m * p;
      nxt[fail[i]] += m * fp;
      nxt[0] += m * boomP;
    }
    if (done >= 0.9 - 1e-12) return t;
    [cur, nxt] = [nxt, cur];
  }
  return null;
}

export function simulate(input: SimInput): SimRow {
  const N = Math.max(1, Math.floor(input.tuc));
  const K = Math.min(Math.max(1, Math.floor(input.k)), N);
  const p = Math.min(1, Math.max(0, input.rate / 100));
  const b = Math.min(1, Math.max(0, input.boom));
  const white = input.whiteRate !== undefined && input.whiteRate > 0;
  const q = white ? (input.whiteRate as number) / 100 : 0;
  const base = { k: K, avgWhite: 0 };

  let P = 0; // 一件衝成
  let perScrolls = 0; // 一件平均用掉幾張（不管成不成）
  let perFail = 0; // 一件平均「沒爆的失敗」幾次（白衣用）

  if (white) {
    const r = p + (1 - p) * b; // 一張卷有結果（成功或爆）的機率
    if (r > 0) {
      const a = p / r;
      let eRes = 0; // 一件平均有幾次結果
      let pw = 1;
      for (let j = 0; j < K; j++) {
        eRes += pw;
        pw *= a;
      }
      P = pw; // a^K
      perScrolls = eRes / r;
      perFail = perScrolls - eRes;
    }
  } else {
    // 依已用次數往後推：mass[s] 是目前有多少機率停在「成功 s 張」
    let mass = new Float64Array(K + 1);
    mass[0] = 1;
    for (let u = 0; u < N; u++) {
      const next = new Float64Array(K + 1);
      for (let s = 0; s < K; s++) {
        const m = mass[s];
        if (m === 0 || N - u < K - s) continue; // 放棄的不再用卷
        perScrolls += m;
        if (s + 1 >= K) P += m * p;
        else if (N - (u + 1) >= K - (s + 1)) next[s + 1] += m * p;
        if (N - (u + 1) >= K - s) next[s] += m * (1 - p) * (1 - b);
      }
      mass = next;
    }
  }

  if (P <= 0) {
    return { ...base, p: 0, tiny: true, avgItems: Infinity, avgScrolls: Infinity, items90: null, scrolls90: null };
  }
  const avgItems = 1 / P;
  const avgScrolls = perScrolls / P;
  const tiny = P < TINY;
  return {
    ...base,
    p: P,
    tiny,
    avgItems,
    avgScrolls,
    avgWhite: white ? (perFail / P) / q : 0,
    items90: tiny ? null : items90Of(P),
    scrolls90: tiny ? null : scrolls90Of(N, K, p, b, white),
  };
}

/** 要成功 1～tuc 張，各一列 */
export function simTable(tuc: number, rate: number, boom: number, whiteRate?: number): SimRow[] {
  const rows: SimRow[] = [];
  for (let k = 1; k <= tuc; k++) rows.push(simulate({ tuc, k, rate, boom, whiteRate }));
  return rows;
}
