// 照 leaf-dp 的最佳策略走，印出決策樹（深度有限）
const SC = { 100: [1, 1], 70: [0.7, 2], 15: [0.15, 5] };
const LIVE = +(process.env.LIVE || 2);
const memo = new Map(), acts = new Map();
function norm(b, w, m) {
  const live = [];
  for (const [s, a] of w) { if (s === 0) m = Math.max(m, a); else live.push([s, a]); }
  live.sort((x, y) => (y[1] + 5 * y[0]) - (x[1] + 5 * x[0]) || y[1] - x[1]);
  while (live.length > LIVE) { const [, a] = live.pop(); m = Math.max(m, a); }
  return [b, live, m];
}
function V(b, w, m) {
  [b, w, m] = norm(b, w, m);
  const key = b + "|" + JSON.stringify(w) + "|" + m;
  if (memo.has(key)) return memo.get(key);
  let best = Math.max(m, ...w.map(x => x[1]), 0), act = ["stop"];
  if (b >= 2) { const v = V(b - 2, [...w, [7, 0]], m); if (v > best + 1e-12) { best = v; act = ["buy"]; } }
  if (b >= 1) w.forEach(([s, a], i) => {
    for (const k of [100, 70, 15]) { const [p, g] = SC[k];
      const v = p * V(b - 1, w.map((x, j) => j === i ? [s - 1, a + g] : x), m) + (1 - p) * V(b - 1, w.map((x, j) => j === i ? [s - 1, a] : x), m);
      if (v > best + 1e-12) { best = v; act = ["scroll", i, k]; } }
  });
  memo.set(key, best); acts.set(key, act); return best;
}
console.log("LIVE", LIVE, "EV", V(21, [], 0).toFixed(3));
function walk(b, w, m, depth, pre) {
  [b, w, m] = norm(b, w, m);
  const act = acts.get(b + "|" + JSON.stringify(w) + "|" + m);
  const st = `剩${b * 100} 武器${JSON.stringify(w)} 舊最高${m}`;
  if (!act || act[0] === "stop" || depth === 0) { console.log(pre + st + " → " + (act ? act.join(" ") : "end")); return; }
  if (act[0] === "buy") { console.log(pre + st + " → 換新武器"); return walk(b - 2, [...w, [7, 0]], m, depth - 1, pre); }
  const [, i, k] = act; const [s, a] = w[i]; const g = SC[k][1];
  console.log(pre + st + ` → 第${i + 1}把衝 ${k}%`);
  if (k === 100) return walk(b - 1, w.map((x, j) => j === i ? [s - 1, a + 1] : x), m, depth - 1, pre);
  walk(b - 1, w.map((x, j) => j === i ? [s - 1, a + g] : x), m, depth - 1, pre + "  中| ");
  walk(b - 1, w.map((x, j) => j === i ? [s - 1, a] : x), m, depth - 1, pre + "沒中| ");
}
walk(21, [], 0, +(process.env.DEPTH || 6), "");
