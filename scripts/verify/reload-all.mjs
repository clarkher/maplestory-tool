// 整頁重載（重新整理、離站再返回）位置回不回得去：全站各頁各量一次（v0.44；v0.57 起查資料開著卡片的網址也要回到原位）
// 用法：node scripts/verify/reload-all.mjs <輸出資料夾> <網址> [埠=9367] [頁面,頁面…]
// 跟 crossdoc.mjs 同一套量法（手機 375、關返回快取、捲到 60% 高度），多量幾頁、等久一點
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const OUT = outDir(process.argv[2], "reload-all");
const BASE = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const PORT = chromePort(9367, process.argv[4]);
const PAGES = (process.argv[5] ?? "/guide,/about,/,/plan/quest,/plan/train,/plan/farm,/plan/bundle,/db/monsters,/db/items,/db/monsters?id=100100").split(",");
// 重新整理、返回之後等多久再看停在哪（毫秒）
const WAIT = Number(process.env.WAIT ?? 4000);
// 關掉返回快取：離站再返回一定整頁重載（不然瀏覽器整頁留著，量不到這條路）
const b = await start(OUT, PORT, ["--disable-features=BackForwardCache"]);

// 每次載入一開始就逐格記位置跟頁高，看是不是直接跳回去、中間停過哪裡
const SAMPLER = `(() => {
  const out = []; const t0 = performance.now(); window.__bootFrames = out;
  const tick = () => { out.push([Math.round(performance.now() - t0), Math.round(scrollY), document.documentElement.scrollHeight]); if (performance.now() - t0 < ${WAIT}) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  addEventListener("pageshow", e => { window.__persisted = e.persisted; });
})();`;

const results = [];
try {
  await b.page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await b.navigate(BASE + "/db");
  await b.evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: 45, job: 110 })); localStorage.setItem("ms-theme", "light"); "ok"`);
  await b.page.send("Page.addScriptToEvaluateOnNewDocument", { source: SAMPLER });
  for (const from of PAGES) {
    for (const kind of ["reload", "back"]) {
      await b.navigate(BASE + from);
      const leftY = await b.ev(`await __settle(); window.scrollTo({ top: Math.round(document.documentElement.scrollHeight * 0.6), behavior: "instant" }); await __sleep(800); await __settle(4000); return Math.round(scrollY);`);
      const leftH = await b.evaluate(`document.documentElement.scrollHeight`);
      if (kind === "back") {
        await b.navigate("about:blank");
        await sleep(400);
        const loaded = b.loadOnce();
        await b.traverse(-1);
        await loaded;
      } else {
        const loaded = b.loadOnce();
        await b.page.send("Page.reload");
        await loaded;
      }
      await sleep(WAIT + 300);
      const r = await b.evaluate(`({ persisted: window.__persisted ?? null, navType: performance.getEntriesByType("navigation")[0]?.type,
        y: Math.round(scrollY), h: document.documentElement.scrollHeight,
        frames: window.__bootFrames?.map(f => f[1]) ?? null, heights: window.__bootFrames?.map(f => f[2]) ?? null, times: window.__bootFrames?.map(f => f[0]) ?? null })`);
      const ys = r.frames ?? [];
      const steps = [];
      ys.forEach((y, i) => { if (i === 0 || y !== ys[i - 1]) steps.push([r.times[i], y, r.heights[i]]); });
      const row = { from, kind, leftY, leftH, finalY: r.y, finalH: r.h, ok: Math.abs(r.y - leftY) <= 2, navType: r.navType, persisted: r.persisted, steps: steps.slice(0, 20) };
      results.push(row);
      console.log(`${from}｜${kind === "back" ? "離站再返回" : "重新整理"}｜離開 ${leftY}（頁高 ${leftH}）→ 停 ${r.y}（頁高 ${r.h}）${row.ok ? "對" : "不對"}｜${r.navType} persisted=${r.persisted}｜[毫秒,位置,頁高] ${JSON.stringify(row.steps.slice(0, 10))}`);
      await b.shot(`${from.replace(/[/?=]/g, "_") || "_home"}-${kind}.png`);
    }
  }
} catch (error) {
  results.push({ error: String(error?.stack ?? error).slice(0, 800) });
  console.log(String(error?.stack ?? error).slice(0, 800));
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  await b.close();
}
const measured = results.filter(row => "ok" in row);
console.log(`\n${measured.filter(row => row.ok).length}／${measured.length} 格回到離開時的位置；截圖和 results.json 在 ${OUT}`);
process.exit(0);
