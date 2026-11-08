// 公會徽章 3 種版面候選：開測試機真實頁面（保留頁首、底色、字型），把 main 換成候選畫面，手機 375 截圖
// 用法：node candidates.mjs <輸出資料夾> <assets.json（台服客戶端切出來的徽章小圖 data URI）>
import fs from "node:fs";
import { start, sleep } from "../../../../../scripts/verify/harness.mjs";
const [OUT, ASSETS] = process.argv.slice(2);
const A = JSON.parse(fs.readFileSync(ASSETS, "utf8"));
const BASE = "https://maplehelper-dev.pipicards.workers.dev";

const CATS = [["Animal", "動物"], ["Plant", "植物"], ["Pattern", "花紋"], ["Letter", "文字"], ["Etc", "其他"]];
const card = (inner, extra = "") => `<section class="glass-solid" style="border-radius:var(--radius-card);padding:14px;min-width:0;${extra}">${inner}</section>`;
const title = `<header><h1 style="font-size:26px;font-weight:900;letter-spacing:-.01em">公會徽章</h1><p class="ink-soft" style="margin-top:6px;font-size:15px;line-height:1.6">挑底圖、圖案和顏色，先看看公會徽章做出來長怎樣。</p></header>`;
const pill = (t, on = false, extra = "") => `<span style="display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid ${on ? "var(--maple)" : "var(--paper-edge)"};background:${on ? "var(--maple)" : "var(--paper)"};color:${on ? "var(--on-accent)" : "var(--ink)"};font-size:14px;font-weight:700;white-space:nowrap;${extra}">${t}</span>`;
const seg = (items, active) => `<div style="display:grid;grid-template-columns:repeat(${items.length},1fr);padding:4px;border-radius:14px;background:var(--paper-deep);gap:4px">${items.map(t => `<span style="display:flex;align-items:center;justify-content:center;min-height:40px;border-radius:10px;font-size:15px;font-weight:800;${t === active ? "background:var(--paper);color:var(--maple);box-shadow:0 1px 3px rgb(0 0 0 / .12)" : "color:var(--ink-soft)"}">${t}</span>`).join("")}</div>`;
const btn = (t, primary = false) => `<span style="display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:14px;border:1px solid ${primary ? "var(--maple)" : "var(--paper-edge)"};background:${primary ? "var(--maple)" : "var(--paper)"};color:${primary ? "var(--on-accent)" : "var(--ink)"};font-size:14px;font-weight:800">${t}</span>`;
const px = (src, k, extra = "") => `<img src="${src}" style="width:${17 * k}px;height:${17 * k}px;image-rendering:pixelated;${extra}" alt="">`;
const stage = (h, k, extra = "") => `<div style="position:relative;height:${h}px;border-radius:14px;border:1px solid var(--paper-edge);background-color:var(--paper);background-image:linear-gradient(45deg,var(--paper-deep) 25%,transparent 25%,transparent 75%,var(--paper-deep) 75%),linear-gradient(45deg,var(--paper-deep) 25%,transparent 25%,transparent 75%,var(--paper-deep) 75%);background-size:16px 16px;background-position:0 0,8px 8px;display:flex;align-items:center;justify-content:center;${extra}">${px(A.big[0], k)}</div>`;
// 遊戲裡實際大小：名牌旁邊那顆 17×17
const actual = `<div style="display:flex;align-items:center;gap:8px;font-size:13px" class="ink-soft">遊戲裡實際大小 <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px 3px 4px;border-radius:6px;background:rgb(0 0 0 / .62);color:#fff;font-size:12px;font-weight:700">${px(A.big[0], 1)}楓葉小隊</span></div>`;
const tile = (src, on, size = 2) => `<div style="display:flex;align-items:center;justify-content:center;aspect-ratio:1;border-radius:12px;border:${on ? "2px solid var(--maple)" : "1px solid var(--paper-edge)"};background:${on ? "var(--maple-wash)" : "var(--paper)"}">${px(src, size)}</div>`;
const grid = (srcs, sel, cols = 6) => `<div style="margin-top:12px;display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px">${srcs.map((s, i) => tile(s, i === sel)).join("")}</div>`;
const sw = (colors, sel, label) => `<div style="margin-top:12px"><div style="font-size:13px;font-weight:800;margin-bottom:6px">${label}</div><div style="display:grid;grid-template-columns:repeat(8,1fr);gap:8px">${colors.map((c, i) => `<span style="aspect-ratio:1;border-radius:999px;background:${c};border:${i === sel ? "3px solid var(--maple)" : "2px solid var(--paper)"};box-shadow:0 0 0 1px var(--paper-edge)"></span>`).join("")}</div></div>`;
const catPills = active => `<div class="scroll-x" style="margin-top:12px;display:flex;gap:8px;overflow-x:auto">${CATS.map(([k, n]) => pill(`${n} ${A.counts[k]}`, k === active)).join("")}</div>`;
const actions = `<div style="margin-top:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${btn("隨機一個")}${btn("下載")}${btn("分享", true)}</div>`;
const wrap = (inner, pad = "12px 0") => `<div style="max-width:42rem;margin:0 auto;padding:${pad};display:grid;grid-template-columns:minmax(0,1fr);gap:14px">${inner}</div>`;

// A：徽章卡在上、挑選卡在下，挑選卡分「底圖／圖案」兩個分頁，顏色跟著分頁走
const Abg = wrap(`${title}
${card(`${stage(190, 8)}<div style="margin-top:10px">${actual}</div>${actions}`)}
${card(`${seg(["底圖", "圖案"], "底圖")}${sw(A.bgSw, 9, "底圖顏色")}${grid(A.bgGrid, 5)}`)}`);
const Amk = wrap(`${title}
${card(`${stage(190, 8)}<div style="margin-top:10px">${actual}</div>${actions}`)}
${card(`${seg(["底圖", "圖案"], "圖案")}${catPills("Animal")}${sw(A.mkSw, 1, "圖案顏色")}${grid(A.markGrid.Animal, 0)}`)}`);

// B：全部攤開不分頁，往下捲依序是底圖區、圖案區
const B = wrap(`${title}
${card(`${stage(150, 6)}<div style="margin-top:10px">${actual}</div>${actions}`)}
${card(`<h2 style="font-size:17px;font-weight:900">① 底圖</h2>${sw(A.bgSw, 9, "顏色")}<div class="scroll-x" style="margin-top:12px;display:grid;grid-auto-flow:column;grid-template-rows:repeat(2,1fr);grid-auto-columns:52px;gap:8px;overflow-x:auto">${A.bgGrid.map((s, i) => tile(s, i === 5)).join("")}</div>`)}
${card(`<h2 style="font-size:17px;font-weight:900">② 圖案</h2>${catPills("Animal")}${sw(A.mkSw, 1, "顏色")}${grid(A.markGrid.Animal, 0)}`)}`);

// C：徽章縮成上方一條跟著走，下面一路挑
const sticky = card(`<div style="display:flex;align-items:center;gap:12px">${stage(96, 5, "width:96px;flex:none")}
  <div style="flex:1;min-width:0;display:grid;gap:8px">${actual}<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${btn("隨機")}${btn("下載")}${btn("分享", true)}</div></div></div>`, "position:sticky;top:73px;z-index:5;padding:10px");
const C = wrap(`${sticky}
${card(`${seg(["底圖", "圖案"], "圖案")}${catPills("Animal")}${grid(A.markGrid.Animal, 0, 5)}${sw(A.mkSw, 1, "圖案顏色")}`)}`, "0 0 12px");

const b = await start(OUT, 9618);
try {
  await b.page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  for (const [name, html] of [["A1", Abg], ["A2", Amk], ["B1", B], ["C1", C]]) {
    await b.navigate(`${BASE}/plan/scroll`);
    await b.ev(`await __settle(6000);`);
    await b.evaluate(`(() => { document.documentElement.style.scrollBehavior = "auto"; document.querySelector("main").innerHTML = ${JSON.stringify(html)}; document.querySelectorAll("footer").forEach(f => f.style.display = "none"); scrollTo(0, 0); })()`);
    await b.ev(`await __waitFor(() => [...document.images].every(i => i.complete), 30000); await __sleep(600);`);
    const broken = await b.evaluate(`[...document.images].filter(i => i.naturalWidth === 0).length`);
    if (broken) console.log(name, "broken images", broken);
    await sleep(400);
    await b.shot(`${name}.png`);
    console.log("shot", name);
  }
} finally { await b.close(); }
