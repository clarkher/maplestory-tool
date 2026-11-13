// 楓葉武器衝卷規劃器候選版面（只是示意圖，不是產品程式）
// 用法：node candidates.mjs → 產生 A～D.html，再用無頭 Chrome 截圖（見 shot.sh）
// 數字是懶人包（劍士、楓葉戰斧）精確列舉的結果：平均 +11.64、+12 以上 52.6%、最好 +17
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const items = resolve(here, "../../../../../public/assets/items").replace(/\\/g, "/");
const icon = (id, s = 28) => `<img src="file:///${items}/${id}.png" alt="" style="width:${s}px;height:${s}px;image-rendering:pixelated;object-fit:contain;flex:none">`;
const AXE = 1412011, S100 = 2046414, S70 = 2046415, S15 = 2046416;

const css = `
:root{--paper:#f5f6f8;--paper-deep:#eceef2;--paper-edge:#dcdfe6;--glass:#fff;--ink:#14171d;--ink-soft:#4f5765;--maple:#a8360a;--maple-wash:rgb(194 65 12 / .1);--leaf:#146c34;--leaf-wash:rgb(23 128 61 / .1);--gold:#8a5300;--gold-wash:rgb(138 83 0 / .1);--on-accent:#fff;--red:#b42318;--red-wash:rgb(180 35 24 / .08)}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,"Microsoft JhengHei","PingFang TC",sans-serif;font-size:15px}
.card{background:var(--glass);border:1px solid var(--paper-edge);border-radius:8px;padding:14px;margin-top:12px}
.h{font-size:15px;font-weight:800}.soft{color:var(--ink-soft);font-size:12px}.num{font-variant-numeric:tabular-nums}
.btn{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border-radius:6px;border:1px solid var(--paper-edge);background:var(--glass);font-weight:700;font-size:14px;color:var(--ink)}
.btn.on{border-color:var(--maple);background:var(--maple-wash);color:var(--maple)}
.btn.main{border-color:var(--maple);color:var(--maple)}
.tag{display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:800}
.t70{background:var(--leaf-wash);color:var(--leaf)}.t15{background:var(--gold-wash);color:var(--gold)}.t100{background:var(--paper-deep);color:var(--ink-soft)}.tw{background:var(--maple-wash);color:var(--maple)}
.if{border-style:dashed!important}
`;

const head = `<div style="font-size:12px;color:var(--ink-soft);font-weight:700">工具・楓葉商會 11/19～12/9</div>
<h1 style="font-size:24px;font-weight:900;margin:4px 0 2px">楓葉武器衝卷規劃器</h1>
<p style="margin:0;color:var(--ink-soft);font-size:14px">排好 21 天每天換什麼，馬上看最後攻擊多少、機率多高。</p>
<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
  <span class="btn on">劍士</span><span class="btn">法師</span><span class="btn">弓箭手</span><span class="btn">盜賊</span><span class="btn">海盜</span></div>
<div style="display:flex;gap:8px;margin-top:8px"><span class="btn main">套用懶人包</span><span class="btn">全部清空</span></div>`;

// ---- 結果區（四張共用）----
const dist = [[17, 3.96, 4.0], [15, 15.0, 19.0], [14, 3.11, 22.1], [13, 21.22, 43.3], [12, 9.32, 52.6], [11, 15.07, 67.7], [10, 11.98, 79.6], [9, 5.79, 85.4], [8, 8.56, 94.0], [7, 1.15, 95.2], [6, 3.67, 98.8], ["0～5", 1.17, 100]];
const stat = (label, val, note, color = "var(--ink)") => `<div style="border:1px solid var(--paper-edge);border-radius:8px;padding:10px"><div class="soft" style="font-weight:700">${label}</div><div class="num" style="font-size:22px;font-weight:900;color:${color};line-height:1.3">${val}</div>${note ? `<div class="soft">${note}</div>` : ""}</div>`;
const result = (compact = false) => `<div class="card">
<div class="h">最後拿到的楓葉戰斧</div><div class="soft">原本攻擊 68・失敗只扣次數、不會爆</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
${stat("平均攻擊", "79.6", "+11.6")}${stat("+12 以上", "52.6%", "攻擊 80 以上", "var(--maple)")}
${stat("最好／最糟", "85／68", "+17／+0")}${stat("要準備楓幣", "390 萬", "平均 307 萬")}
</div>
<div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:var(--leaf-wash);color:var(--leaf);font-size:13px;font-weight:700">硬幣夠：最多用到 2,100 枚，DAY 21 剛好用完</div>
${compact ? "" : `<div class="h" style="margin-top:14px">機率表</div>
<table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:14px">
<tr class="soft" style="text-align:left"><th style="padding:4px 0;font-weight:700">攻擊</th><th style="font-weight:700">剛好</th><th style="font-weight:700">至少這麼多</th></tr>
${dist.map(([k, p, ge]) => `<tr style="border-top:1px solid var(--paper-edge);${k === 12 ? "background:var(--maple-wash)" : ""}"><td class="num" style="padding:6px 4px;font-weight:800">${typeof k === "number" ? 68 + k : "68～73"} <span class="soft">${typeof k === "number" ? "+" + k : "+0～5"}</span></td><td class="num" style="width:38%"><div style="display:flex;align-items:center;gap:6px"><span style="display:block;height:8px;width:${p * 3}px;background:var(--maple);border-radius:2px"></span>${p.toFixed(1)}%</div></td><td class="num">${ge.toFixed(1)}%</td></tr>`).join("")}
</table>`}
<div class="soft" style="margin-top:8px">精確算出來的，不是模擬。只算攻擊力，卷軸順帶加的屬性不算。</div>
</div>`;

// 懶人包最糟那條路（兩張 15% 都沒中才往下走）
const plan = [
  [1, "12/1", []], [2, "", [["w", "楓葉戰斧 ①", "200"]]], [3, "", [["15", "15% 卷 → ①"]]], [4, "", [["15", "15% 卷 → ①", "", "第 1 張沒中才換"]]],
  [5, "", []], [6, "", [["w", "楓葉戰斧 ②", "200", "①兩張都沒中才換"]]], [7, "", [["15", "15% 卷 → ②", "", "沒中才換"]]], [8, "", [["15", "15% 卷 → ②", "", "沒中才換"]]],
  [9, "", []], [10, "", [["w", "楓葉戰斧 ③", "200", "②也沒中才換"]]], [11, "", [["15", "15% 卷 → ③", "", "沒中才換"]]], [12, "", [["15", "15% 卷 → ③", "", "沒中才換"]]],
  [13, "", []], [14, "", [["w", "楓葉戰斧 ④", "200", "都沒中才換"]]], [15, "", [["70", "70% 卷 → ④"]]], [16, "", [["70", "70% 卷 → ④"]]], [17, "", [["70", "70% 卷 → ④"]]], [18, "", [["70", "70% 卷 → ④"]]], [19, "", [["70", "70% 卷 → ④"]]], [20, "", [["70", "70% 卷 → ④"]]], [21, "", [["70", "70% 卷 → ④"]]],
];
const idOf = (k) => (k === "w" ? AXE : k === "70" ? S70 : k === "15" ? S15 : S100);
const left = (() => { let c = 0; return plan.map(([d, , xs]) => { c += 100; for (const x of xs) c -= x[0] === "w" ? 200 : 100; return c; }); })();
const date = (d) => { const t = new Date(2026, 10, 18 + d); return `${t.getMonth() + 1}/${t.getDate()}`; };

// ---- A：日曆格 ----
const A = `${head}<div class="card"><div style="display:flex;justify-content:space-between"><span class="h">每天換什麼</span><span class="soft">點一天加東西</span></div>
<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:8px">
${plan.map(([d, , xs], i) => { const sel = d === 3; const cond = xs.some((x) => x[3]); return `<div class="${cond ? "if" : ""}" style="border:1px solid ${sel ? "var(--maple)" : "var(--paper-edge)"};background:${sel ? "var(--maple-wash)" : "var(--glass)"};border-radius:6px;min-height:62px;padding:3px;display:flex;flex-direction:column;align-items:center;gap:2px"><span class="soft num" style="font-size:10px;font-weight:800">${d}</span>${xs.map((x) => icon(idOf(x[0]), 22)).join("")}<span class="num" style="margin-top:auto;font-size:10px;color:var(--ink-soft)">剩 ${left[i]}</span></div>`; }).join("")}
</div>
<div style="margin-top:10px;border:1px solid var(--maple);border-radius:8px;padding:10px">
<div class="h">DAY 3（11/21）・身上 100 枚</div>
<div style="display:flex;align-items:center;gap:8px;margin-top:8px">${icon(S15)}<div style="flex:1"><div style="font-weight:800">劍士的楓葉武器攻擊力卷軸 15%</div><div class="soft">衝 ①楓葉戰斧・100 枚＋30 萬楓幣</div></div><span class="btn">拿掉</span></div>
<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><span class="btn">＋武器</span><span class="btn">＋100%</span><span class="btn">＋70%</span><span class="btn">＋15%</span></div>
</div></div>${result()}`;

// ---- B：時間軸清單 ----
const rowB = ([d, , xs], i) => `<div style="display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--paper-edge);align-items:flex-start">
<div style="width:52px;flex:none"><div class="num" style="font-weight:900">DAY ${d}</div><div class="soft num">${date(d)}</div></div>
<div style="flex:1;display:grid;gap:4px">${xs.length ? xs.map((x) => `<div class="${x[3] ? "if" : ""}" style="display:flex;align-items:center;gap:8px;border:1px solid var(--paper-edge);border-radius:6px;padding:4px 8px">${icon(idOf(x[0]), 24)}<div style="flex:1;font-size:14px;font-weight:700">${x[1]}${x[3] ? `<div class="soft">${x[3]}</div>` : ""}</div><span class="tag ${x[0] === "w" ? "tw" : "t" + x[0]}">${x[0] === "w" ? "200 枚" : x[0] + "%"}</span></div>`).join("") : `<span class="soft" style="line-height:32px">存著</span>`}</div>
<div class="num soft" style="width:56px;text-align:right;line-height:32px">剩 ${left[i]}</div></div>`;
const B = `${head}<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><span class="h">每天換什麼</span><span class="btn">＋加一樣</span></div>
<div class="soft" style="margin-top:2px">虛線＝前面沒中才換。按住拖到別天，或點一下改。</div>
<div style="margin-top:6px">${plan.slice(0, 9).map(rowB).join("")}</div>
<div class="soft" style="text-align:center;padding:8px;border-top:1px solid var(--paper-edge)">DAY 10～21 展開</div></div>${result()}`;

// ---- C：武器卡（7 格點選、天數自動排）----
const slot = (k, cond) => `<div class="${cond ? "if" : ""}" style="border:1px solid ${k ? "var(--paper-edge)" : "var(--paper-edge)"};border-radius:6px;height:46px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${k === "15" ? "var(--gold-wash)" : k === "70" ? "var(--leaf-wash)" : "var(--glass)"}">${k ? `<span class="num" style="font-weight:900;font-size:13px;color:${k === "15" ? "var(--gold)" : "var(--leaf)"}">${k}%</span>` : `<span class="soft">＋</span>`}</div>`;
const weaponC = (n, rule, slots, note) => `<div style="border:1px solid var(--paper-edge);border-radius:8px;padding:10px;margin-top:8px">
<div style="display:flex;align-items:center;gap:8px">${icon(AXE)}<div style="flex:1"><div style="font-weight:800">楓葉戰斧 ${n}</div><div class="soft">${note}</div></div><span class="soft">換一把</span></div>
<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:8px">${slots.map(([k, c]) => slot(k, c)).join("")}</div>
${rule ? `<div style="margin-top:8px;font-size:13px;display:flex;gap:6px;align-items:center"><svg width="18" height="18" viewBox="0 0 18 18" style="flex:none"><rect x="0.5" y="0.5" width="17" height="17" rx="4" fill="var(--maple)"/><path d="M4.5 9.5l3 3 6-7" stroke="#fff" stroke-width="2" fill="none"/></svg>前 2 張 15% 都沒中 → 這把放著，換下一把</div>` : ""}</div>`;
const gamble = [["15"], ["15", 1], ["70", 1], ["70", 1], ["70", 1], ["70", 1], ["70", 1]];
const C = `${head}<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><span class="h">要換的武器跟卷軸</span><span class="btn">＋加一把</span></div>
<div class="soft" style="margin-top:2px">格子點一下換 100%／70%／15%。天數自動幫你排。</div>
${weaponC("①", true, gamble, "DAY 2 換得到")}${weaponC("②", true, gamble, "① 沒中才換・最快 DAY 6")}${weaponC("③", true, gamble, "② 沒中才換・最快 DAY 10")}${weaponC("④", false, Array(7).fill(["70"]), "都沒中才換・DAY 14")}
<div class="h" style="margin-top:14px">自動排的日程</div>
<div style="display:grid;grid-template-columns:repeat(21,1fr);gap:2px;margin-top:6px">${plan.map(([, , xs]) => `<div style="height:22px;border-radius:2px;background:${xs.length ? (xs[0][0] === "w" ? "var(--maple)" : xs[0][0] === "15" ? "var(--gold)" : "var(--leaf)") : "var(--paper-deep)"}"></div>`).join("")}</div>
<div style="display:flex;justify-content:space-between" class="soft num"><span>DAY 1</span><span>DAY 21</span></div>
<div class="soft" style="margin-top:4px">橘＝武器、金＝15%、綠＝70%、灰＝存硬幣</div></div>${result()}`;

// ---- D：電腦版兩欄（左時間軸、右結果固定）----
const D = `<div style="display:grid;grid-template-columns:1fr 360px;gap:16px;align-items:start">
<div>${head}<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><span class="h">每天換什麼</span><span class="btn">＋加一樣</span></div>
<div class="soft" style="margin-top:2px">虛線＝前面沒中才換。</div>${plan.slice(0, 14).map(rowB).join("")}</div></div>
<div style="position:sticky;top:0">${result()}</div></div>`;

const page = (body, w) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${css}</style><div style="width:${w}px;margin:0;padding:12px 16px 24px">${body}</div>`;
const out = { A: page(A, 390), B: page(B, 390), C: page(C, 390), D: page(D, 1100) };
for (const [k, html] of Object.entries(out)) writeFileSync(resolve(here, `${k}.html`), html);
console.log("ok");
