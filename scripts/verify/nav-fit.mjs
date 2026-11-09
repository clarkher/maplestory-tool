// 導覽列放不放得下：每個寬度量導覽列要不要橫向捲、每一顆是不是全看得到（v1.72 手機、v1.74 平板）
// 用法：node scripts/verify/nav-fit.mjs <輸出資料夾> <網址> [--css=試改法的樣式檔]
//   例：node scripts/verify/nav-fit.mjs out https://maplehelper-dev.pipicards.workers.dev
// 量 360～1100 每一個寬度（3 種頁面：查資料亮、攻略亮、都不亮；v1.86 野王計時收進查資料、萬聖節收進攻略專區）；有一個寬度放不下結束碼 1。
// 900 寬起按鈕左右要維持 12px（放得下就不該縮，v1.74 樣式順序錯過一次，放得下但電腦版變小）。
// 手機四顆（我的路線、攻略、地圖導航、查資料）；768 寬起電腦版的按鈕全出來（8 顆）。
// 存：<寬度>.png（SHOTS 那幾個寬度的頁首，查資料那顆亮著）、results.json。
// --css 是把樣式塞進頁面再量，不用先部署就能試改法（放不放得下一樣準，第一格不準）。
import fs from "node:fs";
import path from "node:path";
import { outDir, chromePort } from "./config.mjs";
import { start, sleep } from "./harness.mjs";

const OUT = outDir(process.argv[2], "nav-fit");
const BASE = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const cssArg = process.argv.find(a => a.startsWith("--css="));
const CSS = cssArg ? fs.readFileSync(cssArg.slice(6), "utf8") : "";
const b = await start(OUT, chromePort(9513));

const PAGES = ["/db", "/guides", "/price/fx"];
const SHOTS = [360, 375, 390, 412, 430, 480, 767, 768, 820, 899, 900, 1024];
const LAST = 1100;
const MEASURE = `(()=>{
  const nav = document.querySelector('nav[aria-label="主選單"]');
  const box = nav.getBoundingClientRect();
  const links = [...nav.querySelectorAll("a")].filter(a => a.offsetWidth);
  const cut = links.filter(a => { const r = a.getBoundingClientRect(); return r.right > box.right + 0.5 || r.left < box.left - 0.5; }).map(a => a.textContent);
  return { over: nav.scrollWidth - nav.clientWidth, spare: Math.round(box.right - links.at(-1).getBoundingClientRect().right), cut, labels: links.map(a => a.textContent), page: document.documentElement.scrollWidth - innerWidth, h: document.querySelector("header").offsetHeight, pad: parseFloat(getComputedStyle(links[0]).paddingLeft) };
})()`;

const rows = [];
try {
  for (const pathname of PAGES) {
    await b.navigate(BASE + pathname);
    // 本機 dev 第一次載入要編譯，load 事件等不到時導覽列還沒出來
    for (let i = 0; i < 60 && !(await b.evaluate(`!!document.querySelector('nav[aria-label="主選單"]')`)); i++) await sleep(500);
    await sleep(1500);
    if (CSS) await b.evaluate(`(()=>{const s=document.createElement("style");s.textContent=${JSON.stringify(CSS)};document.head.appendChild(s);"ok"})()`);
    for (let width = 360; width <= LAST; width++) {
      await b.page.send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 2, mobile: true });
      const m = await b.evaluate(MEASURE);
      rows.push({ pathname, width, ...m });
      if (pathname === "/db" && SHOTS.includes(width)) {
        await sleep(200);
        const { data } = await b.page.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height: 130, scale: 2 } });
        fs.writeFileSync(path.join(OUT, `${width}.png`), Buffer.from(data, "base64"));
      }
    }
  }
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows, null, 1));
  await b.close();
}

const bad = rows.filter(r => r.over > 0 || r.cut.length || r.page > 0 || (r.width < 768 ? r.labels.length !== 4 : r.labels.length < 8) || (r.width >= 900 && r.pad !== 12));
for (const width of SHOTS) {
  const r = rows.find(x => x.pathname === "/db" && x.width === width);
  console.log(`${String(width).padEnd(4)} 多 ${r.over}px、右邊還空 ${r.spare}px、頁首高 ${r.h}px${r.cut.length ? `、被切：${r.cut.join("、")}` : ""}`);
}
if (bad.length) {
  const widths = [...new Set(bad.map(r => r.width))].sort((x, y) => x - y);
  console.log(`放不下的寬度（${widths.length} 個）：${widths[0]}～${widths.at(-1)}`);
  process.exit(1);
}
console.log(`360～${LAST} 每個寬度、${PAGES.length} 種頁面都放得下`);
