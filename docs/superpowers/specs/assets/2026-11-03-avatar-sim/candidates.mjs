// 紙娃娃 3 種版面候選：開測試機真實頁面（保留頁首、底色、字型），把 main 換成候選畫面，手機 375 截圖
import fs from "node:fs";
import path from "node:path";
import { start, sleep } from "file:///C:/Users/user1/MapleBook/.claude/worktrees/exciting-cartwright-6e2c7a/scripts/verify/harness.mjs";
const OUT = process.argv[2];
const BASE = "https://maplehelper-dev.pipicards.workers.dev";

const tw = id => ({ itemId: id, region: "TWMS", version: "256" });
const jp = id => ({ itemId: id, region: "JMS", version: "444" });
const render = (items, resize = 2, stance = "stand1") =>
  `https://maplestory.io/api/character/${encodeURIComponent(JSON.stringify(items).slice(1, -1))}/${stance}/0?resize=${resize}&renderMode=0&padX=0&padY=0`;
const OUTFIT = [tw(2000), tw(12000), jp(42540), jp(22035), jp(1054555), jp(1074234), jp(1703722), jp(1032360)];
const OUTFIT_CAP = [tw(2000), tw(12000), jp(42540), jp(22035), jp(1054555), jp(1074234), jp(1703722), jp(1032360), tw(1001061)];
const icon = id => `/assets/items/${id}.png`;

const WORN = [
  [42540, "髮型", "芙莉蓮髮型"], [22035, "臉型", "芙莉蓮臉型"], [12000, "膚色", "奶油皮膚"],
  [1054555, "套服", "芙莉蓮的服裝"], [1074234, "鞋子", "芙莉蓮的鞋子"], [1703722, "武器", "芙莉蓮的法杖"], [1032360, "耳環", "芙莉蓮的耳環"],
];
const HAIRS = [
  [42540, "芙莉蓮髮型"], [42560, "芙莉蓮豎捲髮髮型"], [42550, "芙莉蓮髮型(睡衣)"], [42580, "修塔爾克髮型"],
  [42590, "欣梅爾髮型"], [38340, "包柏頭"], [31470, "中國女孩造型"], [31840, "不良少女造型"],
  [31400, "中性短髮造型"], [30330, "中長柔順造型"], [30830, "亞里斯造型"], [47430, "鬆軟甜蜜雲朵髮型"],
];
const CAPS = [
  [1001061, "伊莉莎白帽子"], [1002397, "一朵向日葵"], [1002520, "一束玫瑰"], [1002413, "三眼章魚帽子"], [1001033, "侍女帽"],
  [1002219, "俠盜帽"], [1002707, "假面紳士的帽子"], [1002239, "傳說中的黃金便便帽"], [1002480, "一頭白髮"],
];
const OVERALLS = [
  [1054555, "芙莉蓮的服裝"], [1054556, "芙莉蓮的冬衣"], [1054557, "芙莉蓮的睡衣"], [1054558, "費倫的服裝"], [1054559, "費倫的冬衣"],
  [1054560, "修塔爾克的服裝"], [1054595, "修塔爾克的冬衣"], [1051211, "伊莉莎白禮服"], [1051127, "侍女服"], [1051070, "兔子服"],
];
const TABS = ["髮型", "臉型", "膚色", "帽子", "套服", "上衣", "褲/裙", "鞋子", "手套", "披風", "武器", "盾牌", "眼飾", "臉飾", "耳環"];
const HAIR_COLORS = [["黑色", "#2b2420"], ["紅色", "#c0392b"], ["橘色", "#e67e22"], ["黃色", "#e2c044"], ["綠色", "#4f8a3a"], ["藍色", "#2f6fb0"], ["紫色", "#7a4fb0"], ["褐色", "#7a5230"]];

const card = (inner, extra = "") => `<section class="glass-solid" style="border-radius:var(--radius-card);padding:14px;min-width:0;${extra}">${inner}</section>`;
const title = `<header><h1 style="font-size:26px;font-weight:900;letter-spacing:-.01em">紙娃娃</h1><p class="ink-soft" style="margin-top:6px;font-size:15px;line-height:1.6">選髮型、臉型、點裝，馬上看穿上去的樣子。</p></header>`;
const pill = (t, on = false, extra = "") => `<span style="display:inline-flex;align-items:center;gap:4px;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid ${on ? "var(--maple)" : "var(--paper-edge)"};background:${on ? "var(--maple)" : "var(--paper)"};color:${on ? "var(--on-accent)" : "var(--ink)"};font-size:14px;font-weight:700;white-space:nowrap;${extra}">${t}</span>`;
const caret = `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
const btn = (t, primary = false) => `<span style="display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:14px;border:1px solid ${primary ? "var(--maple)" : "var(--paper-edge)"};background:${primary ? "var(--maple)" : "var(--paper)"};color:${primary ? "var(--on-accent)" : "var(--ink)"};font-size:14px;font-weight:800">${t}</span>`;
const stage = (h, src, extra = "") => `<div style="position:relative;height:${h}px;border-radius:14px;border:1px solid var(--paper-edge);background-color:var(--paper);background-image:linear-gradient(45deg,var(--paper-deep) 25%,transparent 25%,transparent 75%,var(--paper-deep) 75%),linear-gradient(45deg,var(--paper-deep) 25%,transparent 25%,transparent 75%,var(--paper-deep) 75%);background-size:16px 16px;background-position:0 0,8px 8px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:18px;overflow:hidden;${extra}"><img src="${src}" style="image-rendering:pixelated;max-width:100%" alt=""></div>`;
const tile = (id, name, on = false, size = 44) => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px 6px;border-radius:12px;border:${on ? "2px solid var(--maple)" : "1px solid var(--paper-edge)"};background:${on ? "var(--maple-wash)" : "var(--paper)"};min-width:0">
  <div style="height:${size}px;display:flex;align-items:center;justify-content:center"><img src="${icon(id)}" style="image-rendering:pixelated;max-height:${size}px;max-width:${size + 8}px" alt=""></div>
  <div style="font-size:12px;line-height:1.3;text-align:center;font-weight:${on ? 800 : 500};color:${on ? "var(--maple)" : "var(--ink)"};display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${name}</div></div>`;
const tabs = (active, extra = "") => `<div class="scroll-x" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;${extra}">${TABS.map(t => pill(t, t === active)).join("")}</div>`;
const search = ph => `<div style="margin-top:10px;display:flex;align-items:center;min-height:44px;padding:0 14px;border-radius:14px;border:1px solid var(--paper-edge);background:var(--paper);color:var(--ink-faint);font-size:15px">${ph}</div>`;
const swatches = `<div style="margin-top:10px;display:flex;align-items:center;gap:8px"><span style="font-size:13px;font-weight:800">髮色</span>${HAIR_COLORS.map(([n, c], i) => `<span title="${n}" style="width:26px;height:26px;border-radius:999px;background:${c};border:${i === 0 ? "3px solid var(--maple)" : "2px solid var(--paper)"};box-shadow:0 0 0 1px var(--paper-edge)"></span>`).join("")}</div>`;
const wornStrip = `<div class="scroll-x" style="display:flex;gap:6px;overflow-x:auto">${WORN.map(([id, slot, n]) => `<span style="flex:none;display:flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border-radius:999px;border:1px solid var(--paper-edge);background:var(--paper)"><img src="${icon(id)}" style="width:26px;height:26px;object-fit:contain;image-rendering:pixelated" alt=""><span style="font-size:12px;line-height:1.2"><b>${slot}</b><br><span class="ink-soft">${n}</span></span></span>`).join("")}</div>`;

// A：角色卡黏在上面、分頁格子在下面
const A = `<div style="max-width:42rem;margin:0 auto;padding:12px 0;display:grid;grid-template-columns:minmax(0,1fr);gap:14px">${title}
${card(`${stage(250, render(OUTFIT))}
  <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${pill(`站著 ${caret}`)}${pill(`表情：一般 ${caret}`)}${pill("翻面")}</div>
  <div style="margin-top:10px">${wornStrip}</div>
  <div style="margin-top:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${btn("隨機")}${btn("重置")}${btn("下載")}${btn("分享", true)}</div>`)}
${card(`${tabs("髮型")}${search("搜尋髮型名稱")}${swatches}
  <div style="margin-top:12px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${HAIRS.map(([id, n], i) => tile(id, n, i === 0)).join("")}</div>
  <div style="margin-top:12px">${btn("再看 40 個")}</div>`)}
</div>`;
// A 捲到格子時：角色縮成上方小窗跟著走
const A2 = `<div style="max-width:42rem;margin:0 auto;padding:0 0 12px;display:grid;grid-template-columns:minmax(0,1fr);gap:14px">
${card(`<div style="display:flex;gap:10px;align-items:stretch">${stage(170, render(OUTFIT), "flex:1;padding-bottom:8px")}
  <div style="display:grid;gap:8px;width:92px">${btn("下載")}${btn("分享", true)}${btn("回到上面")}</div></div>`, "position:sticky;top:73px;z-index:5;padding:10px")}
${card(`${tabs("髮型")}${search("搜尋髮型名稱")}${swatches}
  <div style="margin-top:12px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${HAIRS.map(([id, n], i) => tile(id, n, i === 0)).join("")}</div>
  <div style="margin-top:12px">${btn("再看 40 個")}</div>`)}
</div>`;

// B：遊戲裝備欄（角色在中間、兩側格子），點格子從下面拉出清單
const slot = (label, id = null, w = "58px") => `<div style="width:${w};height:58px;border-radius:12px;border:1px ${id ? "solid var(--wood)" : "dashed var(--paper-edge)"};background:${id ? "var(--paper)" : "transparent"};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px">${id ? `<img src="${icon(id)}" style="max-width:40px;max-height:34px;image-rendering:pixelated" alt="">` : ""}<span style="font-size:11px;font-weight:700;color:${id ? "var(--ink-soft)" : "var(--ink-faint)"}">${label}</span></div>`;
const B = (withCap = false) => `<div style="max-width:42rem;margin:0 auto;padding:12px 0;display:grid;grid-template-columns:minmax(0,1fr);gap:14px">${title}
${card(`<div style="display:grid;grid-template-columns:58px 1fr 58px;gap:8px;align-items:center">
    <div style="display:grid;gap:8px">${slot("帽子", withCap ? 1001061 : null)}${slot("臉飾")}${slot("眼飾")}${slot("耳環", 1032360)}${slot("披風")}</div>
    ${stage(322, render(withCap ? OUTFIT_CAP : OUTFIT), "padding-bottom:12px")}
    <div style="display:grid;gap:8px">${slot("上衣")}${slot("套服", 1054555)}${slot("褲/裙")}${slot("鞋子", 1074234)}${slot("手套")}</div>
  </div>
  <div style="margin-top:8px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px">${slot("髮型", 42540, "100%")}${slot("臉型", 22035, "100%")}${slot("膚色", 12000, "100%")}${slot("武器", 1703722, "100%")}${slot("盾牌", null, "100%")}</div>
  <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${pill(`站著 ${caret}`)}${pill(`表情：一般 ${caret}`)}${pill("翻面")}</div>
  <div style="margin-top:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${btn("隨機")}${btn("重置")}${btn("下載")}${btn("分享", true)}</div>`)}
</div>`;
const sheet = `<div id="mock-sheet" style="position:fixed;inset:0;z-index:60;background:rgb(30 20 10 / .45);display:flex;align-items:flex-end">
  <div class="glass-solid" style="width:100%;height:58%;border-radius:22px 22px 0 0;padding:10px 16px 16px;display:flex;flex-direction:column">
    <div style="width:40px;height:4px;border-radius:9px;background:var(--paper-edge);margin:0 auto 10px"></div>
    <div style="display:flex;align-items:center;justify-content:space-between"><b style="font-size:17px">選帽子</b><span style="font-size:14px;font-weight:800;color:var(--maple)">脫掉</span></div>
    ${search("搜尋帽子名稱")}
    <div style="margin-top:12px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;overflow:hidden">${CAPS.map(([id, n], i) => tile(id, n, i === 0, 40)).join("")}</div>
  </div></div>`;

// C：大舞台＋底部固定抽屜（橫滑兩排）
const over = (t) => `<span style="display:inline-flex;align-items:center;gap:4px;min-height:34px;padding:0 12px;border-radius:999px;background:var(--glass-strong);border:1px solid var(--paper-edge);font-size:13px;font-weight:800;white-space:nowrap">${t}</span>`;
const C = `<div style="max-width:42rem;margin:0 auto;padding:0 0 330px;display:grid;grid-template-columns:minmax(0,1fr);gap:10px">
  <div style="display:flex;align-items:baseline;justify-content:space-between"><h1 style="font-size:22px;font-weight:900">紙娃娃</h1><span class="ink-soft" style="font-size:13px">點下面換裝</span></div>
  <div style="position:relative">${stage(300, render(OUTFIT, 2), "padding-bottom:30px")}
    <div style="position:absolute;top:10px;right:10px;display:flex;gap:6px">${over("隨機")}${over("重置")}</div>
    <div style="position:absolute;left:10px;bottom:10px;display:flex;gap:6px">${over(`站著 ${caret}`)}${over(`表情 ${caret}`)}${over("翻面")}</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${btn("下載透明圖")}${btn("分享連結", true)}</div>
</div>
<div class="glass-solid" style="position:fixed;left:0;right:0;bottom:0;z-index:40;height:300px;border-radius:22px 22px 0 0;padding:10px 0 12px;box-shadow:0 -10px 30px -12px rgb(89 58 28 / .35)">
  <div style="width:40px;height:4px;border-radius:9px;background:var(--paper-edge);margin:0 auto 10px"></div>
  ${tabs("套服", "padding:0 16px")}
  <div class="scroll-x" style="margin-top:12px;padding:0 16px;display:grid;grid-auto-flow:column;grid-template-rows:repeat(2,1fr);grid-auto-columns:84px;gap:8px;overflow-x:auto">${OVERALLS.map(([id, n], i) => tile(id, n, i === 0, 44)).join("")}</div>
</div>`;

const b = await start(OUT, 9612);
try {
  await b.page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  const shots = [
    ["A1", A, 0], ["A2", A2, 0], ["B1", B(false), 0], ["B2", B(true) + sheet, 0], ["C1", C, 0],
  ];
  for (const [name, html, y] of shots) {
    await b.navigate(`${BASE}/plan/scroll`);
    await b.ev(`await __settle(6000);`);
    await b.evaluate(`(() => { document.documentElement.style.scrollBehavior = "auto"; document.querySelector("main").innerHTML = ${JSON.stringify(html)}; document.querySelectorAll("footer").forEach(f => f.style.display = "none"); })()`);
    await b.ev(`await __waitFor(() => [...document.images].every(i => i.complete), 30000); await __sleep(600);`);
    const broken = await b.evaluate(`[...document.images].filter(i => i.naturalWidth === 0).map(i => i.src.slice(0, 90))`);
    if (broken.length) console.log(name, "broken images", broken);
    await b.evaluate(`(() => { document.scrollingElement.scrollTop = ${y}; return scrollY; })()`).then(v => console.log(name, "scrollY", v));
    await sleep(500);
    await b.shot(`${name}.png`);
    console.log("shot", name);
  }
} finally { await b.close(); }
