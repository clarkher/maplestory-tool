// 改版整理頁 4 種版面候選：開測試機真實頁面（保留導覽列、底色、字型），把 main 換成候選畫面，手機 375 深色截圖
// 數字全是 repo 歷史 public/data 三個版本（1.13.1 1fd6dc25、1.15.2 fa4bd7b3、2.0.0 5b5b5e2d）比出來的
// 用法：node candidates.mjs <輸出資料夾>
import { start, sleep } from "../../../../../scripts/verify/harness.mjs";
const [OUT] = process.argv.slice(2);
const BASE = "https://maplehelper-dev.pipicards.workers.dev";

const ic = (id, s = 32) => `<img src="/assets/items/${id}.png" style="width:${s}px;height:${s}px;object-fit:contain;image-rendering:pixelated;flex:none" alt="">`;
const card = (inner, extra = "") => `<section class="glass-solid" style="border-radius:var(--radius-card);padding:14px;min-width:0;${extra}">${inner}</section>`;
const tag = (t, color = "var(--ink-soft)", bg = "var(--paper-deep)") => `<span style="display:inline-flex;align-items:center;height:22px;padding:0 7px;border-radius:4px;background:${bg};color:${color};font-size:12px;font-weight:700;white-space:nowrap">${t}</span>`;
const src = tag("客戶端資料", "var(--sky)", "var(--sky-wash)");
const h2 = t => `<h2 style="font-size:17px;font-weight:800;letter-spacing:-.01em">${t}</h2>`;
const soft = (t, extra = "") => `<p class="ink-soft" style="font-size:14px;line-height:1.6;${extra}">${t}</p>`;
const tab = (items, active) => `<div style="display:flex;gap:18px;border-bottom:1px solid var(--paper-edge);overflow-x:auto">${items.map(t => `<span style="padding:10px 0;font-size:15px;font-weight:700;white-space:nowrap;${t === active ? "color:var(--ink);box-shadow:inset 0 -2px 0 var(--maple)" : "color:var(--ink-soft)"}">${t}</span>`).join("")}</div>`;
const chip = (t, on = false) => `<span style="display:inline-flex;align-items:center;min-height:34px;padding:0 12px;border-radius:6px;border:1px solid ${on ? "var(--maple)" : "var(--paper-edge)"};background:${on ? "var(--maple-wash)" : "transparent"};color:${on ? "var(--maple)" : "var(--ink)"};font-size:14px;font-weight:700;white-space:nowrap">${t}</span>`;
const chips = (a, on) => `<div style="display:flex;gap:8px;overflow-x:auto">${a.map(t => chip(t, t === on)).join("")}</div>`;
const select = t => `<div style="display:flex;align-items:center;justify-content:space-between;min-height:44px;padding:0 12px;border-radius:6px;border:1px solid var(--paper-edge);background:var(--paper-deep);font-size:15px;font-weight:700">${t}<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="2" fill="none"/></svg></div>`;
const stat = (n, l) => `<div style="padding:10px;border-radius:6px;background:var(--paper-deep)"><div style="font-family:var(--font-sans);font-size:22px;font-weight:800">${n}</div><div class="ink-soft" style="font-size:12px;margin-top:2px">${l}</div></div>`;
const stats = `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${stat("432", "新道具（不含髮型臉型）")}${stat("172", "新任務")}${stat("4", "新怪物")}${stat("648", "道具說明或數值有改")}</div>`;
const row = (id, name, sub, right = "") => `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--paper-edge)">${ic(id)}<div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</div><div class="ink-soft" style="font-size:13px;margin-top:2px">${sub}</div></div>${right}</div>`;
const more = t => `<div style="margin-top:8px;font-size:14px;font-weight:700;color:var(--maple)">${t} ›</div>`;
const iconWall = ids => `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">${ids.map(id => `<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:6px;background:var(--paper-deep)">${ic(id, 30)}</div>`).join("")}</div>`;
const head = (title, lead) => `<header><div class="ink-soft" style="font-size:13px;font-weight:700">攻略 › 改版整理</div><h1 style="margin-top:6px;font-size:25px;font-weight:800;letter-spacing:-.02em;line-height:1.3">${title}</h1>${lead ? soft(lead, "margin-top:6px") : ""}</header>`;
const caveat = soft("比的是更新前後的遊戲資料，不是官方公告；什麼時候開放、怎麼拿到，以遊戲內為準。", "font-size:13px");
const wrap = inner => `<div style="max-width:42rem;margin:0 auto;padding:12px 0 28px;display:grid;grid-template-columns:minmax(0,1fr);gap:14px">${inner}</div>`;

const HIGHLIGHTS = [
  [4310522, "萬聖節「雪原的面具祭典」", "83 個活動任務、萬聖節硬幣換道具"],
  [2450248, "經驗值加倍券 7 種", "1.5 倍、2 倍，30 分鐘，分 30／50／70 等以下"],
  [2046420, "楓葉武器專用卷軸 21 張", "各職業 100%、70%、15% 三種"],
  [3010049, "冰原雪域、天空之城任務 85 個", "Lv.30～90，例如「下落不明的赫拉」"],
];

// A 重點先看：一篇文章，先講 4 個重點，再給數字和道具圖
const A = wrap(`${head("10/15 改版整理（2.0.0）", "這次最值得看的 4 件事，下面再列全部新東西。")}
${select("2026/10/15 · 2.0.0 大型改版")}
${card(`${h2("這次重點")}<div style="margin-top:4px">${HIGHLIGHTS.map(([i, n, s]) => row(i, n, s, src)).join("")}</div>`)}
${card(`${h2("改了多少")}<div style="margin-top:10px">${stats}</div>`)}
${card(`${h2("說明改了的道具")}<div style="margin-top:4px">${row(2022356, "月亮花糕點", "恢復 HP、MP 各 1500 → 1200")}${row(3010049, "冰窖椅", "每 10 秒 HP 20 → HP 40、MP 30")}</div>${more("看全部 648 項")}`)}
${caveat}`);

// B 跟我有關：用「我的角色」篩，只先給這個等級職業用得到的
const B = wrap(`${head("10/15 改版跟你有關的", "")}
${card(`<div style="display:flex;align-items:center;gap:10px"><div style="width:40px;height:40px;border-radius:6px;background:var(--paper-deep);display:flex;align-items:center;justify-content:center">${ic(1452016, 30)}</div><div style="flex:1"><div style="font-size:15px;font-weight:800">Lv.35 獵人</div><div class="ink-soft" style="font-size:13px">照你存的角色篩</div></div><span style="font-size:14px;font-weight:700;color:var(--maple)">換角色</span></div>`, "padding:10px 14px")}
${card(`${h2("你用得到")}<div style="margin-top:4px">
${row(2450248, "經驗值2倍券（50 等以下）", "30 分鐘；1.5 倍的也有", src)}
${row(2046420, "弓箭手的楓葉武器攻擊力卷軸", "100%、70%、15% 三種", src)}
${row(4310522, "萬聖節活動任務", "83 個任務，接取等級照各章", src)}
${row(3010049, "冰原雪域新任務 71 個", "等級範圍包含 35 等的", src)}
</div>${more("看這 4 項細節")}`)}
${card(`<div style="display:flex;align-items:center;justify-content:space-between"><div>${h2("其他新東西")}<div class="ink-soft" style="font-size:13px;margin-top:2px">時裝、寵物、椅子、其他等級的任務</div></div><span style="font-size:22px;font-weight:800">1,130</span></div>${more("全部展開")}`)}
${caveat}`);

// C 差異清單：資料庫式，分新增／改了／拿掉，可篩分類
const C = wrap(`${head("改版差異 2.0.0", "")}
${select("2026/10/15 · 1.15.2 → 2.0.0")}
${tab(["新增 1,313", "改了 648", "不再列出 82"], "改了 648")}
${chips(["全部", "說明", "商店", "掉落", "能力"], "全部")}
${card(`<div>
${row(2022356, "月亮花糕點", "說明　恢復 1500 → <b style=\"color:var(--ink)\">1200</b>")}
${row(3010049, "冰窖椅", "說明　HP 20 → <b style=\"color:var(--ink)\">HP 40、MP 30</b>")}
${row(1092001, "三角赤盾", "商店　冰原雪域 → <b style=\"color:var(--ink)\">冰原雪域武器店</b>")}
${row(5021009, "企鵝王飛鏢", "商店　沒賣 → <b style=\"color:var(--ink)\">商城 100</b>")}
${row(2070011, "楓葉飛鏢", "掉落　掉落的怪有變")}
</div>`, "padding-top:4px")}
${caveat}`);

// D 時間軸：每次更新一張卡，看得到歷次改版，點進去才是細節
const ver = (date, v, label, n, ids, on = false) => card(`<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px"><div><div style="font-size:13px;font-weight:700;color:${on ? "var(--maple)" : "var(--ink-soft)"}">${date}</div><div style="margin-top:2px;font-size:18px;font-weight:800">${label}</div></div>${tag(v)}</div>${soft(n, "margin-top:6px")}<div style="margin-top:10px">${iconWall(ids)}</div>${more("看這次改了什麼")}`, on ? "border-color:var(--maple)" : "");
const D = wrap(`${head("改版紀錄", "每次遊戲更新多了什麼，照時間排。")}
${ver("2026/10/15", "2.0.0", "萬聖節祭典、冰原雪域任務", "新道具 432、新任務 172、新怪物 4（食人花、黑食人花、爸爸精靈、地獄巴洛古）", [4310522, 2450248, 2046420, 3019896, 5000087, 4004000], true)}
${ver("2026/10/03 收錄", "1.15.2", "冰原雪域、天空之城地圖", "新道具 570、新任務 92、新怪物 54（雪吉拉、狼人、企鵝王…）", [1302378, 1452289, 1113372, 1143475, 1382291, 1472292])}
${caveat}`);

const b = await start(OUT, 9631);
try {
  await b.page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 1180, deviceScaleFactor: 2, mobile: true });
  await b.page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  for (const [name, html, h] of [["A", A, 1180], ["B", B, 760], ["C", C, 730], ["D", D, 700]]) {
    await b.page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: h, deviceScaleFactor: 2, mobile: true });
    await b.navigate(`${BASE}/guides`);
    await b.ev(`await __settle(6000);`);
    await b.evaluate(`(() => { document.documentElement.style.scrollBehavior = "auto"; document.querySelector("main").innerHTML = ${JSON.stringify(html)}; document.querySelectorAll("footer").forEach(f => f.style.display = "none"); scrollTo(0, 0); })()`);
    await b.ev(`await __waitFor(() => [...document.images].every(i => i.complete), 30000); await __sleep(600);`);
    const broken = await b.evaluate(`[...document.images].filter(i => i.naturalWidth === 0).map(i => i.src)`);
    if (broken.length) console.log(name, "broken images", broken);
    await sleep(400);
    await b.shot(`${name}.png`);
    console.log("shot", name);
  }
} finally { await b.close(); }
