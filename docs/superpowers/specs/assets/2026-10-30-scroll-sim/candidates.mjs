// 衝卷模擬候選（工地手套 5 次＋手套攻擊卷軸60%，目標 5 張全成功；數字是 calc.mjs 真算的）
const card = (inner, extra = "") => `<section style="border-radius:1.125rem;padding:18px;background:var(--glass-strong);border:1px solid var(--paper-edge);box-shadow:var(--glass-shadow);margin-top:14px;${extra}">${inner}</section>`;
const big = (label, value, note = "", color = "var(--ink)") => `<div><div style="font-size:13px;font-weight:800;color:var(--ink-soft)">${label}</div><div style="font-size:28px;font-weight:900;color:${color};font-variant-numeric:tabular-nums;line-height:1.25">${value}</div>${note ? `<div style="font-size:12px;color:var(--ink-soft)">${note}</div>` : ""}</div>`;
const pill = (t, on) => `<span style="display:inline-flex;align-items:center;min-height:34px;padding:0 14px;border-radius:999px;font-weight:800;font-size:14px;${on ? "background:var(--maple);color:var(--on-accent)" : "border:1px solid var(--paper-edge);color:var(--ink)"}">${t}</span>`;
const icon = (id, s = 32) => `<img src="/assets/items/${id}.png" alt="" style="width:${s}px;height:${s}px;image-rendering:pixelated;object-fit:contain">`;
const pick = (id, label, name, note) => `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--paper-edge);border-radius:14px;background:var(--paper)">${icon(id)}<div style="flex:1"><div style="font-size:12px;font-weight:800;color:var(--ink-soft)">${label}</div><div style="font-size:15px;font-weight:800;color:var(--ink)">${name}</div>${note ? `<div style="font-size:12px;color:var(--ink-soft)">${note}</div>` : ""}</div><span style="font-size:13px;color:var(--maple);font-weight:800">換</span></div>`;
const toggle = (label, on) => `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px"><span style="font-size:14px;font-weight:700;color:var(--ink)">${label}</span><span style="width:44px;height:26px;border-radius:999px;background:${on ? "var(--maple)" : "var(--paper-edge)"};position:relative"><span style="position:absolute;top:3px;${on ? "left:21px" : "left:3px"};width:20px;height:20px;border-radius:999px;background:var(--paper)"></span></span></div>`;
const field = (label, ph) => `<label style="flex:1;display:block"><span style="font-size:12px;font-weight:800;color:var(--ink-soft)">${label}</span><span style="display:block;margin-top:4px;min-height:38px;border:1px solid var(--paper-edge);border-radius:10px;padding:8px 10px;font-size:14px;color:var(--ink-soft);background:var(--paper)">${ph}</span></label>`;
const head = `<h1 style="font-size:28px;font-weight:900;color:var(--ink);margin:8px 0 4px">衝卷模擬</h1><p style="margin:0;color:var(--ink-soft);font-size:15px">選裝備跟卷軸，算衝到想要的張數要準備多少。</p>`;
const picks = `<div style="display:grid;gap:10px">${pick(1082002, "裝備", "工地手套", "可以衝 5 次")}${pick(2040804, "卷軸", "手套攻擊卷軸60%", "成功率 60%・物理攻擊力 +2・失敗不會爆")}</div>`;
const extras = `${toggle("失敗就用白衣卷軸補回次數", false)}<div style="display:flex;gap:10px;margin-top:12px">${field("卷軸單價（楓幣）", "自己填")}${field("裝備單價（楓幣）", "自己填")}</div>`;
const inputs = (k = 5) => card(`${picks}
  <div style="margin-top:14px;font-size:13px;font-weight:800;color:var(--ink-soft)">要成功幾張</div>
  <div style="display:flex;gap:6px;margin-top:6px">${[1, 2, 3, 4, 5].map((n) => pill(`${n} 張`, n === k)).join("")}</div>${extras}`);
const costHint = `<p style="margin:10px 0 0;font-size:12px;color:var(--ink-soft)">填了單價就算得出總共要花多少</p>`;
const note = `<p style="margin:6px 0 0;font-size:12px;color:var(--ink-soft)">從全新裝備算；剩下的次數不夠衝到就換一件，不浪費卷軸。成功率照遊戲裡卷軸說明。</p>`;

// A：三個大數字
const A = `${head}${inputs()}${card(`<b style="font-size:15px;color:var(--ink)">衝到 5 張全成功（物理攻擊力 +10）</b>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:10px">
  ${big("一件衝成", "7.8%")}${big("平均要", "12.9 件", "約 30 張卷")}${big("九成機率要準備", "64 張", "裝備 29 件", "var(--maple)")}</div>${costHint}${note}`)}`;

// B：準備多少張 → 衝成機率 曲線
const pts = [[0, 0], [10, 23.3], [20, 47.8], [30, 64.4], [40, 75.8], [50, 83.5], [64, 90.4], [80, 94.8]];
const X = (t) => 40 + (t / 80) * 560, Y = (v) => 190 - v * 1.7;
const curve = `<svg viewBox="0 0 620 220" width="100%" style="display:block;margin-top:8px">
  ${[0, 50, 90, 100].map((v) => `<line x1="40" x2="600" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--paper-edge)" stroke-dasharray="${v === 90 ? "4 4" : "0"}"/><text x="34" y="${Y(v) + 4}" text-anchor="end" font-size="12" fill="var(--ink-soft)">${v}%</text>`).join("")}
  <polyline fill="none" stroke="var(--leaf)" stroke-width="3" points="${pts.map(([t, v]) => `${X(t)},${Y(v)}`).join(" ")}"/>
  <circle cx="${X(22)}" cy="${Y(50)}" r="5" fill="var(--gold)"/><text x="${X(22) + 8}" y="${Y(50) + 18}" font-size="13" font-weight="800" fill="var(--ink)">22 張：一半機率</text>
  <circle cx="${X(64)}" cy="${Y(90.4)}" r="6" fill="var(--maple)"/><text x="${X(64) - 8}" y="${Y(90.4) - 10}" text-anchor="end" font-size="13" font-weight="800" fill="var(--maple)">64 張：九成機率</text>
  ${[0, 20, 40, 60, 80].map((t) => `<text x="${X(t)}" y="210" text-anchor="middle" font-size="12" fill="var(--ink-soft)">${t}</text>`).join("")}
</svg><div style="text-align:center;font-size:12px;color:var(--ink-soft)">準備幾張卷軸 → 衝成 5 張的機率</div>`;
const B = `${head}${inputs()}${card(`<b style="font-size:15px;color:var(--ink)">準備多少張，有多少機率衝成</b>${curve}
  <p style="margin:10px 0 0;font-size:14px;color:var(--ink)">一件衝成 <b>7.8%</b>，平均要 <b>12.9 件、約 30 張</b>；九成機率要 <b style="color:var(--maple)">64 張、29 件</b>。</p>${costHint}${note}`)}`;

// C：1～5 張一次比
const rows = [[1, "99.0%", "1 件", "3 張・1 件"], [2, "91.3%", "1.1 件", "5 張・1 件"], [3, "68.3%", "1.5 件", "10 張・3 件"], [4, "33.7%", "3.0 件", "22 張・6 件"], [5, "7.8%", "12.9 件", "64 張・29 件"]];
const table = `<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:14px;color:var(--ink)">
  <tr style="color:var(--ink-soft);font-size:12px;text-align:left"><th style="padding:6px 0">要成功</th><th>一件衝成</th><th>平均要</th><th>九成機率要準備</th></tr>
  ${rows.map(([k, a, b, c]) => `<tr style="border-top:1px solid var(--paper-edge);${k === 5 ? "font-weight:900;background:color-mix(in srgb, var(--maple) 10%, transparent)" : ""}"><td style="padding:9px 4px">${k} 張（攻擊 +${k * 2}）</td><td style="font-variant-numeric:tabular-nums">${a}</td><td>${b}</td><td style="${k === 5 ? "color:var(--maple)" : ""}">${c}</td></tr>`).join("")}
</table>`;
const C = `${head}${card(`${picks}${extras}`)}${card(`<b style="font-size:15px;color:var(--ink)">要成功幾張，各要準備多少</b>${table}${costHint}${note}`)}`;

// D：兩種卷並排比（同一件、同目標）
const col = (id, name, sub, a, b, c, boom) => `<div style="border:1px solid var(--paper-edge);border-radius:14px;padding:12px;background:var(--paper)"><div style="display:flex;gap:8px;align-items:center">${icon(id, 28)}<div><div style="font-size:14px;font-weight:800;color:var(--ink)">${name}</div><div style="font-size:12px;color:${boom ? "var(--maple)" : "var(--ink-soft)"}">${sub}</div></div></div>
  <div style="display:grid;gap:8px;margin-top:10px">${big("一件衝成", a)}${big("平均要", b)}${big("九成機率要準備", c, "", "var(--maple)")}</div></div>`;
const D = `${head}${inputs()}${card(`<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px;color:var(--ink)">衝到 5 張全成功：兩種卷比一比</b><span style="font-size:13px;color:var(--maple);font-weight:800">換另一張</span></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
  ${col(2040804, "手套攻擊卷軸60%", "失敗不會爆・攻擊 +10", "7.8%", "12.9 件・30 張", "64 張・29 件")}
  ${col(2040810, "手套攻擊詛咒卷軸70%", "失敗一半機率爆掉・攻擊 +10", "16.8%", "6.0 件・17 張", "33 張・13 件", true)}</div>${costHint}${note}`)}`;

const wrap = (h) => `<div style="max-width:620px;margin:0 auto;padding:12px 4px 24px">${h}</div>`;
export const candidates = [
  { key: "A", title: "三個大數字", html: wrap(A) },
  { key: "B", title: "準備幾張→機率曲線", html: wrap(B) },
  { key: "C", title: "1～5 張一張表比", html: wrap(C) },
  { key: "D", title: "兩種卷並排比", html: wrap(D) },
];
