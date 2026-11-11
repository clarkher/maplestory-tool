// 地圖導航每一段的圖：放大出口附近、圈出要走的門（v2.10，版面 B）
// 用法：node scripts/verify/go-door-shot.mjs <輸出資料夾> <網址>
//   例：node scripts/verify/go-door-shot.mjs out https://maplehelper-dev.pipicards.workers.dev
// 每條路線、手機（375）跟電腦（1280）各量一次：
//   每一段（最後一段除外）都有「走…的傳送門，往 X」或「跟…說話」那句、舊的「從上一張圖」不見了；
//   有圖的段落：圈、標籤都在圖框裡，標籤跟圈不被角落小圖蓋到，圖真的載到；頁面不會橫向捲；路線畫出來之後版面不再跳（CLS）。
//   傑夫那段（NPC 傳送）只有文字、不畫圈。
// 存：<路線>-<寬度>.png（整頁）、results.json。有一項沒過結束碼 1。
import fs from "node:fs";
import path from "node:path";
import { outDir, chromePort } from "./config.mjs";
import { start, sleep } from "./harness.mjs";

const OUT = outDir(process.argv[2], "go-door-shot");
const BASE = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const b = await start(OUT, chromePort(9541));

/** minFigures：這條路線至少要有幾段畫得出圖 */
const ROUTES = [
  { id: "port-henesys", from: 104000000, to: 100000000, minFigures: 9 },
  { id: "henesys-ellinia", from: 100000000, to: 101000000, minFigures: 4 },
  { id: "perion-kerning", from: 102000000, to: 103000000, minFigures: 4 },
  { id: "maple-island", from: 1010000, to: 1020000, minFigures: 1 },
  // 冰雪峽谷Ⅱ → 尖銳的絕壁Ⅰ：找傑夫說話那段不畫圈
  { id: "jeff", from: 211040200, to: 211040300, minFigures: 0, npc: "傑夫" },
];
const WIDTHS = [375, 1280];

const MEASURE = `(()=>{
  const hit = (a, r) => r && !(a.right <= r.left || a.left >= r.right || a.bottom <= r.top || a.top >= r.bottom);
  const inside = (a, f) => a.left >= f.left - 1 && a.right <= f.right + 1 && a.top >= f.top - 1 && a.bottom <= f.bottom + 1;
  const cards = [...document.querySelectorAll('section[aria-label="路線"] li')];
  return {
    page: document.documentElement.scrollWidth - innerWidth,
    old: document.body.innerText.includes("從上一張圖"),
    cards: cards.map(li => {
      const say = li.querySelector("[data-go-say]")?.textContent ?? null;
      const frame = li.querySelector("figure > div");
      if (!frame) return { say, figure: false };
      const f = frame.getBoundingClientRect();
      const ring = frame.querySelector("[data-go-door]").getBoundingClientRect();
      const label = [...frame.children].find(c => c.textContent.startsWith("往 ")).getBoundingClientRect();
      const over = frame.querySelector("[data-go-overview]")?.getBoundingClientRect() ?? null;
      const img = frame.querySelector("img");
      return {
        say, figure: true, width: Math.round(f.width),
        ringIn: inside(ring, f),
        labelIn: inside(label, f), labelHitOverview: hit(label, over), ringHitOverview: hit(ring, over),
        overviewIn: over ? inside(over, f) : true, loaded: img.complete && img.naturalWidth > 0,
      };
    }),
  };
})()`;

const rows = [];
const fails = [];
const check = (name, ok, detail = "") => { if (!ok) fails.push(`${name}${detail ? `：${detail}` : ""}`); };
try {
  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      const name = `${route.id}-${width}`;
      await b.page.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 2, mobile: width < 768 });
      await b.navigate(`${BASE}/go?from=${route.from}&to=${route.to}`);
      for (let i = 0; i < 80 && !(await b.evaluate(`!!document.querySelector('section[aria-label="路線"] li')`)); i++) await sleep(500);
      // 路線畫出來之後才開始記版面位移：圖是跟路線一起畫的，之後不該再長高
      await b.evaluate(`(()=>{window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:"layout-shift"});"ok"})()`);
      // 圖是 lazy 的：整頁捲一遍讓每張都載
      await b.evaluate(`(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=500){scrollTo(0,y);await new Promise(r=>setTimeout(r,250))}scrollTo(0,0);return "ok"})()`);
      await sleep(1500);
      const m = await b.evaluate(MEASURE);
      const cls = await b.evaluate(`window.__cls`);
      rows.push({ name, cls, ...m });
      if (!m.cards.length) { check(`${name} 路線有畫出來`, false, "一張圖卡都沒有"); continue; }
      const steps = m.cards.slice(0, -1);
      const figures = m.cards.filter(c => c.figure);
      check(`${name} 頁面不橫向捲`, m.page <= 0, `多 ${m.page}px`);
      check(`${name} 沒有舊的「從上一張圖」`, !m.old);
      check(`${name} 每一段都有走哪個門那句`, steps.length > 0 && steps.every(c => c.say && /^(走|跟)/.test(c.say) && /(往|送你到) \S/.test(c.say)), JSON.stringify(steps.map(c => c.say)));
      check(`${name} 最後一段不放圖也不放那句`, !m.cards.at(-1).figure && !m.cards.at(-1).say);
      check(`${name} 有圖的段落至少 ${route.minFigures} 段`, figures.length >= route.minFigures, `只有 ${figures.length}`);
      check(`${name} 整個圈在圖框裡`, figures.every(c => c.ringIn));
      check(`${name} 標籤在圖框裡`, figures.every(c => c.labelIn));
      check(`${name} 標籤、圈不被小圖蓋到`, figures.every(c => !c.labelHitOverview && !c.ringHitOverview));
      check(`${name} 小圖在圖框裡`, figures.every(c => c.overviewIn));
      check(`${name} 圖都載到`, figures.every(c => c.loaded));
      check(`${name} 路線畫出來後版面不跳`, cls < 0.01, `CLS ${cls.toFixed(4)}`);
      if (route.npc) check(`${name} ${route.npc}那段只有文字`, steps.some(c => c.say?.includes(route.npc) && !c.figure), JSON.stringify(steps));
      const { result } = await b.page.send("Runtime.evaluate", { expression: "document.documentElement.scrollHeight", returnByValue: true });
      const { data } = await b.page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(result.value, 6000), scale: 1 } });
      fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, "base64"));
      console.log(`${name.padEnd(22)} ${m.cards.length} 張圖卡、${figures.length} 段有圖、CLS ${cls.toFixed(4)}`);
    }
  }
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows, null, 1));
  await b.close();
}
const total = ROUTES.length * WIDTHS.length;
if (fails.length) {
  console.log(`\n沒過 ${fails.length} 項：`);
  for (const f of fails) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`\n${total} 個畫面全過，截圖在 ${OUT}`);
