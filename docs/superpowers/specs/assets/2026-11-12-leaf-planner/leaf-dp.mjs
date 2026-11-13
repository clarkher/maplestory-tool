// 楓葉商會最佳策略：動態規劃（單位 100 枚，總共 21）
// 狀態：剩幾單位 b、手上兩把武器 (s1,a1)(s2,a2)（剩幾次、目前攻擊），其餘舊武器只記最高攻擊 m
// 動作：換新 43 級武器（2 單位）、對任一把衝 100/70/15（1 單位）、收工
// 目標：最後最高那把的攻擊期望值最大
const SC = [[1, 1], [0.7, 2], [0.15, 5]];
const memo = new Map();
function norm(b, w, m) { // w: [[s,a],...] 最多 2 把；沒次數的併進 m
  const live = [];
  for (const [s, a] of w) { if (s === 0) m = Math.max(m, a); else live.push([s, a]); }
  // 只留最有希望的兩把：攻擊上限高的
  live.sort((x, y) => (y[1] + 5 * y[0]) - (x[1] + 5 * x[0]) || y[1] - x[1]);
  while (live.length > 2) { const [s, a] = live.pop(); m = Math.max(m, a); }
  return [b, live, m];
}
function V(b, w, m) {
  [b, w, m] = norm(b, w, m);
  const key = b + "|" + JSON.stringify(w) + "|" + m;
  if (memo.has(key)) return memo.get(key);
  let best = Math.max(m, ...w.map(x => x[1]), 0), act = "stop";
  if (b >= 2) { const v = V(b - 2, [...w, [7, 0]], m); if (v > best + 1e-12) { best = v; act = "buy"; } }
  if (b >= 1) w.forEach(([s, a], i) => {
    for (const [p, g] of SC) {
      const hit = w.map((x, j) => j === i ? [s - 1, a + g] : x);
      const miss = w.map((x, j) => j === i ? [s - 1, a] : x);
      const v = p * V(b - 1, hit, m) + (1 - p) * V(b - 1, miss, m);
      if (v > best + 1e-12) { best = v; act = `w${i}:${g === 1 ? 100 : g === 2 ? 70 : 15}`; }
    }
  });
  memo.set(key, best);
  if (process.env.TRACE) memo.set("A" + key, act);
  return best;
}
const B = +(process.argv[2] || 21);
console.log("budget", B * 100, "optimal EV", V(B, [], 0).toFixed(3));
// 印出最佳策略開頭幾步的決策
process.env.TRACE = 1; memo.clear(); V(B, [], 0);
const act = (b, w, m) => { [b, w, m] = norm(b, w, m); return memo.get("A" + b + "|" + JSON.stringify(w) + "|" + m); };
console.log("start:", act(B, [], 0));
console.log("after buy:", act(B - 2, [[7, 0]], 0));
console.log("after 15 miss:", act(B - 3, [[6, 0]], 0));
console.log("after 2x15 miss:", act(B - 4, [[5, 0]], 0));
console.log("after 15 hit:", act(B - 3, [[6, 5]], 0));
for (const b of [9, 8, 7]) console.log(`b=${b} fresh weapon after misses`, act(b, [[5, 0]], 0), "| new weapon state", act(b - 2, [[7, 0], [5, 0]], 0));
