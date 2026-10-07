// 把 border-probe 的 report.json 分類：每一類幾個元素、出現在哪些頁、改前改後的顏色；分不進去的列成「其他」
import fs from "node:fs";
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const MODE = process.argv[3] ?? "B";

const has = (cls, t) => cls.split(/\s+/).includes(t);
function category(c) {
  const cls = c.cls ?? "";
  if (c.kind === "gone" || c.kind === "new") return `${c.kind}`;
  if (cls.includes("focus-within:border-[color:var(--maple)]")) return "搜尋框聚焦（focus-within 橘框）";
  if (cls.includes("focus:border-[color:var(--maple)]")) return "輸入框聚焦（focus 橘框）";
  if (cls.includes("hover:border-[color:var(--maple)]")) return "滑鼠移上去（hover 橘框）";
  if (c.before?.outline !== c.after?.outline && Object.keys(c.before?.sides ?? {}).length === 0) return "聚焦外框（outline）";
  if (cls.includes("border-t-[color:var(--maple)]")) return "讀取中轉圈";
  if (cls.includes("border-[3px]")) return "時間軸圓點";
  if (cls.includes("border-[color:var(--sky)]")) return "藍色膠囊（看打法）";
  if (cls.includes("border-[color:var(--maple)]")) return "橘色框（帶我去膠囊／職業線）";
  if (has(cls, "wood-frame")) return "卡片木框（wood-frame）";
  if (has(cls, "glass-solid")) return "毛玻璃（glass-solid）";
  if (has(cls, "glass")) return cls.includes("sticky") ? "頂部導覽列（glass）" : "毛玻璃（glass）";
  return "其他";
}
const cats = new Map();
let totalChanged = 0;
for (const [key, sc] of Object.entries(report.scenarios)) {
  const mode = sc.modes[MODE] ?? sc.modes.B;
  const [id, variant] = key.split("__");
  for (const c of mode.changed) {
    totalChanged++;
    const cat = category(c);
    if (!cats.has(cat)) cats.set(cat, { n: 0, pages: new Set(), colors: new Map(), samples: new Set() });
    const e = cats.get(cat);
    e.n++;
    e.pages.add(id);
    const sideColor = s => s ? [...new Set(Object.values(s.sides ?? {}).map(v => v.replace(/ \d+(\.\d+)? (solid|dashed)$/, "")))].join(" / ") + (s.outline ? ` + outline ${s.outline}` : "") + ` r=${s.radius}` : "-";
    const k = `${variant}: ${sideColor(c.before ?? c.after)}  →  ${sideColor(c.after ?? c.before)}`;
    e.colors.set(k, (e.colors.get(k) ?? 0) + 1);
    if (e.samples.size < 6) e.samples.add(`${c.tag ?? c.before?.tag ?? c.after?.tag} 「${c.text ?? c.before?.text ?? c.after?.text ?? ""}」 ${(c.cls ?? c.before?.cls ?? c.after?.cls ?? "").slice(0, 110)}`);
  }
}
console.log(`模式 ${MODE}：${Object.keys(report.scenarios).length} 個狀態，變了 ${totalChanged} 個元素次`);
for (const [cat, e] of [...cats].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`\n■ ${cat}  ×${e.n}  頁：${[...e.pages].join(", ")}`);
  for (const [k, n] of e.colors) console.log(`   ${n}× ${k}`);
  for (const s of e.samples) console.log(`   例：${s}`);
}
if (report.errors?.length) console.log("\n錯誤：", report.errors);
// 每個狀態量到幾個有框元素（確認頁面真的載完）
console.log("\n各狀態量到的有框元素數：");
const rows = {};
for (const [key, sc] of Object.entries(report.scenarios)) {
  const [id, v] = key.split("__");
  (rows[id] ??= {})[v] = `${sc.total}/${(sc.modes[MODE] ?? sc.modes.B).changed.length}`;
}
for (const [id, r] of Object.entries(rows)) console.log(`  ${id.padEnd(22)} ${["m-light", "m-dark", "d-light", "d-dark"].map(v => (r[v] ?? "-").padEnd(8)).join(" ")}`);
