// 練功測速左欄的三種候選（只畫左欄；右欄地圖、怪物、排行照舊）＋分享圖兩種。數字是排版樣本。
const card = (inner, extra = "") => `<section style="border-radius:1.125rem;padding:18px;background:var(--glass-strong);border:1px solid var(--paper-edge);box-shadow:var(--glass-shadow);margin-top:14px;${extra}">${inner}</section>`;
const big = (label, value, note = "", color = "var(--ink)") => `<div><div style="font-size:13px;font-weight:800;color:var(--ink-soft)">${label}</div><div style="font-size:26px;font-weight:900;color:${color};font-variant-numeric:tabular-nums;line-height:1.25">${value}</div>${note ? `<div style="font-size:12px;color:var(--ink-soft)">${note}</div>` : ""}</div>`;
const btn = (t, solid) => `<span style="display:inline-flex;align-items:center;min-height:34px;padding:0 14px;border-radius:999px;font-weight:800;font-size:14px;${solid ? "background:var(--maple);color:var(--on-accent)" : "border:1px solid var(--paper-edge);color:var(--ink)"}">${t}</span>`;
const toggle = (label, on) => `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px"><span style="font-size:14px;font-weight:700;color:var(--ink)">${label}</span><span style="width:44px;height:26px;border-radius:999px;background:${on ? "var(--maple)" : "var(--paper-edge)"};position:relative"><span style="position:absolute;top:3px;${on ? "left:21px" : "left:3px"};width:20px;height:20px;border-radius:999px;background:var(--paper)"></span></span></div>`;

const control = card(`
  <div style="display:flex;gap:8px;flex-wrap:wrap">${btn("停止分享")}${btn("自動", true)}${btn("手動")}${btn("小浮窗")}</div>
  <p style="margin:8px 0 0;font-size:14px;color:var(--ink-soft)">讀得到經驗、楓幣、藥水（自動：經驗 1 分鐘沒動就停）</p>
  ${toggle("HP 低於 30% 響一聲", true)}`);

// 每分鐘經驗（23 分鐘）
const bars = [5.1, 5.4, 5.2, 5.6, 5.0, 4.8, 5.5, 5.9, 5.7, 5.3, 2.1, 0.4, 4.9, 5.8, 6.0, 5.6, 5.4, 5.7, 5.5, 5.9, 5.2, 5.6, 5.3];
const chart = (h = 96) => {
  const max = 6.2;
  const w = 100 / bars.length;
  const rects = bars.map((v, i) => `<rect x="${i * w + w * 0.15}%" y="${100 - (v / max) * 100}%" width="${w * 0.7}%" height="${(v / max) * 100}%" rx="2" fill="${v < 3 ? "var(--gold)" : "var(--leaf)"}"/>`).join("");
  return `<svg width="100%" height="${h}" style="display:block;margin-top:8px" preserveAspectRatio="none">${rects}</svg>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink-soft);margin-top:2px"><span>23 分鐘前</span><span>每分鐘經驗</span><span>現在</span></div>
    <p style="margin:6px 0 0;font-size:12px;color:var(--gold);font-weight:700">第 11～12 分鐘掉很多（可能死了或在補藥）</p>`;
};

const records = (rows = 3) => {
  const data = [
    ["森林迷宮Ⅲ", "52,800", "+35,800", "10/29"],
    ["猴子森林Ⅱ", "41,000", "+22,100", "10/28"],
    ["黑森林狩獵場Ⅰ", "38,600", "+41,900", "10/27"],
  ].slice(0, rows);
  return `<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:13px;color:var(--ink)">
    <tr style="color:var(--ink-soft);font-size:12px;text-align:left"><th style="padding:4px 0">地圖</th><th>10 分鐘經驗</th><th>10 分鐘淨賺</th><th>日期</th></tr>
    ${data.map((r, i) => `<tr style="border-top:1px solid var(--paper-edge);${i === 0 ? "font-weight:800" : ""}"><td style="padding:7px 0">${r[0]}</td><td style="font-variant-numeric:tabular-nums">${r[1]}</td><td style="font-variant-numeric:tabular-nums;color:var(--leaf)">${r[2]}</td><td style="color:var(--ink-soft)">${r[3]}</td></tr>`).join("")}
  </table>`;
};

const potions = `<div style="margin-top:10px;font-size:13px;color:var(--ink)">
  <div style="display:flex;align-items:center;gap:8px"><img src="/assets/items/2000003.png" style="width:24px;height:24px;image-rendering:pixelated" alt=""> 藍色藥水：每 10 分鐘 12 瓶（約 2,400 楓幣）</div>
  <div style="display:flex;align-items:center;gap:8px;margin-top:4px"><img src="/assets/items/2000002.png" style="width:24px;height:24px;image-rendering:pixelated" alt=""> 白色藥水：每 10 分鐘 3 瓶（約 960 楓幣）</div>
</div>`;

// A：同一張數字卡加一排楓幣，下面依序：曲線、藥水、紀錄
const A = `<div style="width:440px">
  ${control}
  ${card(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    ${big("10 分鐘經驗", "52,800", "這一級的 4.8%")}${big("升級還要", "1 小時 12 分")}
    ${big("10 分鐘楓幣", "+38,200")}${big("扣掉藥水淨賺", "+34,840", "", "var(--leaf)")}
    ${big("這段練了", "23 分")}${big("這段拿到", "121,440")}
  </div>${potions}
  <div style="margin-top:12px">${btn("產生分享圖", true)}</div>`)}
  ${card(`<b style="font-size:15px;color:var(--ink)">這段的經驗曲線</b>${chart()}`)}
  ${card(`<b style="font-size:15px;color:var(--ink)">我的練功紀錄</b><span style="font-size:12px;color:var(--ink-soft)">（存在這台電腦）</span>${records()}`)}
</div>`;

// B：一張卡三個分頁：這段／曲線／我的紀錄
const tabs = (on) => `<div style="display:flex;gap:6px;margin-bottom:12px">${["這段", "曲線", "我的紀錄"].map((t) => `<span style="min-height:32px;display:inline-flex;align-items:center;padding:0 14px;border-radius:999px;font-weight:800;font-size:14px;${t === on ? "background:var(--maple);color:var(--on-accent)" : "border:1px solid var(--paper-edge);color:var(--ink-soft)"}">${t}</span>`).join("")}</div>`;
const B = `<div style="width:440px">
  ${control}
  ${card(`${tabs("這段")}<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    ${big("10 分鐘經驗", "52,800", "這一級的 4.8%")}${big("升級還要", "1 小時 12 分")}
    ${big("10 分鐘楓幣", "+38,200", "藥水 −3,360")}${big("淨賺", "+34,840", "", "var(--leaf)")}
  </div><p style="margin:10px 0 0;font-size:13px;color:var(--ink-soft)">這段練了 23 分、拿到 121,440</p>
  <div style="margin-top:12px">${btn("產生分享圖", true)}</div>`)}
  <div style="font-size:12px;color:var(--ink-soft);margin:10px 4px 0">↓ 點「曲線」「我的紀錄」換成：</div>
  ${card(`${tabs("曲線")}${chart(80)}${potions}`, "opacity:.92")}
  ${card(`${tabs("我的紀錄")}${records()}`, "opacity:.92")}
</div>`;

// C：經驗卡、收益卡分開；曲線塞進經驗卡；紀錄做成比較長條
const compare = `<div style="margin-top:8px">${[["森林迷宮Ⅲ（這段）", 52800], ["猴子森林Ⅱ", 41000], ["黑森林狩獵場Ⅰ", 38600]].map(([n, v], i) => `<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:13px;color:var(--ink);${i === 0 ? "font-weight:800" : ""}"><span>${n}</span><span style="font-variant-numeric:tabular-nums">${v.toLocaleString()}</span></div><div style="height:10px;border-radius:6px;background:var(--paper-deep);margin-top:3px"><div style="height:10px;border-radius:6px;width:${(v / 52800) * 100}%;background:${i === 0 ? "var(--maple)" : "var(--leaf)"}"></div></div></div>`).join("")}<p style="margin:6px 0 0;font-size:12px;color:var(--ink-soft)">10 分鐘經驗，同一隻角色在不同地圖（存在這台電腦）</p></div>`;
const C = `<div style="width:440px">
  ${control}
  ${card(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${big("10 分鐘經驗", "52,800", "這一級的 4.8%")}${big("升級還要", "1 小時 12 分")}</div>${chart(70)}`)}
  ${card(`<b style="font-size:15px;color:var(--ink)">楓幣收益</b><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:8px">${big("撿到", "+38,200")}${big("藥水", "−3,360", "", "var(--maple)")}${big("淨賺", "+34,840", "", "var(--leaf)")}</div><p style="margin:4px 0 0;font-size:12px;color:var(--ink-soft)">都是每 10 分鐘</p>${potions}`)}
  ${card(`<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px;color:var(--ink)">跟我之前比</b>${btn("產生分享圖", true)}</div>${compare}`)}
</div>`;

// 分享圖兩種（1200×630 縮小顯示）
const shareBase = (dark) => `<div style="width:600px;height:315px;border-radius:16px;padding:26px 30px;box-sizing:border-box;position:relative;overflow:hidden;
  background:${dark ? "linear-gradient(135deg,#2a1f14,#16110c)" : "linear-gradient(135deg,#fbf5ea,#f1e5d1)"};color:${dark ? "#f6ead9" : "#2c2015"};border:1px solid ${dark ? "#5b442e" : "#e2d2b6"}">
  <div style="font-size:14px;font-weight:700;opacity:.75">冰雷巫師 Lv.46・森林迷宮Ⅲ・2026/10/29</div>
  <div style="font-size:15px;font-weight:800;margin-top:18px;opacity:.8">10 分鐘經驗</div>
  <div style="font-size:64px;font-weight:900;line-height:1;color:${dark ? "#f0784a" : "#b32a00"}">52,800</div>
  <div style="display:flex;gap:36px;margin-top:18px;font-size:15px;font-weight:800"><div>淨賺楓幣<br><span style="font-size:28px">+34,840</span></div><div>升級還要<br><span style="font-size:28px">1 小時 12 分</span></div></div>
  <img src="/assets/monster_frames/3230100.png" style="position:absolute;right:28px;top:70px;height:120px;image-rendering:pixelated;opacity:.95" alt="">
  <div style="position:absolute;right:30px;bottom:20px;font-size:13px;font-weight:800;opacity:.7">楓谷幫手・練功測速</div>
</div>`;
const SHARE = `<div style="display:flex;flex-direction:column;gap:18px">
  <div style="font:800 18px inherit;color:var(--ink)">分享圖 S1 白天紙張</div>${shareBase(false)}
  <div style="font:800 18px inherit;color:var(--ink)">分享圖 S2 夜楓</div>${shareBase(true)}
</div>`;

export const candidates = [
  { key: "A", title: "一張大數字卡＋往下排", html: A },
  { key: "B", title: "一張卡三個分頁", html: B },
  { key: "C", title: "經驗、楓幣分兩張＋跟之前比", html: C },
  { key: "S", title: "分享圖兩種", html: SHARE },
];
