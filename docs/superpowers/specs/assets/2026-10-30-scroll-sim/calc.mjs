// 一件全新裝備：N 次、要成功 K 張、成功率 p、失敗爆裝率 b。不可能達標就停（不浪費卷）。
// 回傳 一件成功率 P、每件平均用幾張、以及「累積用 t 張卷時已經衝成」的機率表。
export function calc({ N, K, p, b = 0, maxT = 2000 }) {
  // per-attempt distribution: win[t], end[t] (lose)
  let states = new Map([["0,0", 1]]); // s,used
  const win = [], lose = [];
  for (let step = 0; step <= N; step++) {
    const next = new Map();
    for (const [key, pr] of states) {
      const [s, u] = key.split(",").map(Number);
      const left = N - u;
      if (s >= K) { win[u] = (win[u] || 0) + pr; continue; }
      if (left < K - s) { lose[u] = (lose[u] || 0) + pr; continue; }
      const add = (k, v) => next.set(k, (next.get(k) || 0) + v);
      add(`${s + 1},${u + 1}`, pr * p);
      lose[u + 1] = (lose[u + 1] || 0) + pr * (1 - p) * b; // 爆
      add(`${s},${u + 1}`, pr * (1 - p) * (1 - b));
    }
    states = next;
  }
  const P = win.reduce((a, v) => a + (v || 0), 0);
  const per = [...win.map((v, t) => (v || 0) * t), ...lose.map((v, t) => (v || 0) * t)].reduce((a, v) => a + (v || 0), 0);
  // 累積：F[t] = P(第一件成功前總共用 ≤ t 張)
  const g = new Float64Array(maxT + 1); g[0] = 1; // 剛開始新的一件、已用 t 張的機率
  const F = new Float64Array(maxT + 1);
  for (let t = 0; t <= maxT; t++) {
    if (!g[t]) continue;
    win.forEach((v, d) => { if (v && t + d <= maxT) F[t + d] += g[t] * v; });
    lose.forEach((v, d) => { if (v && d > 0 && t + d <= maxT) g[t + d] += g[t] * v; });
  }
  for (let t = 1; t <= maxT; t++) F[t] += F[t - 1];
  const at = (q) => F.findIndex((x) => x >= q);
  return { P, items90: Math.ceil(Math.log(0.1) / Math.log(1 - P)), avgItems: 1 / P, avgScrolls: per / P, t50: at(0.5), t90: at(0.9), F };
}
const show = (lbl, o) => { const r = calc(o); console.log(lbl, JSON.stringify({ P: +(r.P * 100).toFixed(2), avgItems: +r.avgItems.toFixed(2), items90: r.items90, avgScrolls: +r.avgScrolls.toFixed(1), t50: r.t50, t90: r.t90 })); };
show("手套60% 5/5", { N: 5, K: 5, p: 0.6 });
show("手套60% 4/5", { N: 5, K: 4, p: 0.6 });
show("手套60% 3/5", { N: 5, K: 3, p: 0.6 });
show("手套詛咒70% 5/5 b.5", { N: 5, K: 5, p: 0.7, b: 0.5 });
show("手套10% 1/5", { N: 5, K: 1, p: 0.1 });
show("短劍60% 7/7", { N: 7, K: 7, p: 0.6 });
show("短劍60% 5/7", { N: 7, K: 5, p: 0.6 });
for (const t of [10,20,30,40,50,64,80]) { const r = calc({N:5,K:5,p:0.6}); console.log("t", t, (r.F[t]*100).toFixed(1)); }
for (const K of [1,2,3,4,5]) show("60% K"+K, {N:5,K,p:0.6});
for (const K of [1,2,3,4,5]) show("詛咒70% K"+K, {N:5,K,p:0.7,b:0.5});
