// 首頁跳動（CLS）：存過角色、第一次來 × 1280、375 各量幾次（CPU 慢 4 倍），任一種中位數 >= 0.1 就 exit 1。
// 用法：node scripts/verify/home-cls.mjs [輸出資料夾] [網址，預設 http://localhost:3000] [每種幾次，預設 5] [DevTools 埠，預設 9392]
//   --cold    每次都不用瀏覽器快取（真的第一次來的人：字型、資料都要重抓）
//   --mobile  375 用手機模式量（viewport meta、dvh 跟真手機一樣）；不加是把桌機視窗縮到 375，跟之前的紀錄比得起來
//   --slow    網路模擬慢 4G（150ms、1.6Mbps）：伺服器畫的版本一定先畫出來、程式後到，最接近真手機。
//             只開 --mobile 在本機量到 0 不算過：程式到得太快，第一格還沒畫就接手了
//
// 一定要量正式 build（next build + next start，或測試機）：dev server 沒有壓縮，時間差太多。
// 記三件事：
//   CLS  加總（比較保守，跟之前紀錄同一個算法）、最大的一段（Google 實際採用：間隔 1 秒內、最長 5 秒）
//   來源 每次位移是誰動了、從哪到哪（來源的 y 變 0 高度 0 ＝ 被推出畫面）
//   第一格 每一格畫了什麼：大標、表單、讀取中、入口卡看不看得到、頁尾在哪；
//          server-<寬>-<人>.png 是擋掉程式後的畫面，就是伺服器畫的版本（第一格）、final-* 是畫好之後
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const flags = process.argv.slice(2).filter(a => a.startsWith("--"));
const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const OUT = outDir(args[0], "home-cls");
const BASE = (args[1] ?? "http://localhost:3000").replace(/\/$/, "");
const REPS = Number(args[2] ?? 5);
const PORT = chromePort(Number(args[3] ?? 9392));
const COLD = flags.includes("--cold");
const MOBILE = flags.includes("--mobile");
const SLOW = flags.includes("--slow");
const PROFILE = JSON.stringify({ level: 35, job: 100 });
const LINE = 0.1;

const { page, evaluate, navigate, shot, close } = await start(OUT, PORT);
await page.send("Network.enable");
if (COLD) await page.send("Network.setCacheDisabled", { cacheDisabled: true });
if (SLOW) await page.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
await page.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await page.send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    window.__ls = [];
    const name = n => !n ? "（已移除）" : n.getAttribute
      ? [n.tagName, n.getAttribute("aria-label") || n.getAttribute("href") || (n.className && String(n.className).split(" ")[0]) || ""].filter(Boolean).join(":")
      : n.nodeName;
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) window.__ls.push({
        t: Math.round(e.startTime), v: e.value, input: e.hadRecentInput,
        src: (e.sources || []).map(s => name(s.node) + " y" + Math.round(s.previousRect.y) + "(h" + Math.round(s.previousRect.height) + ")->y" + Math.round(s.currentRect.y) + "(h" + Math.round(s.currentRect.height) + ")"),
      });
    }).observe({ type: "layout-shift", buffered: true });
    window.__frames = [];
    const seen = el => !!el && el.checkVisibility({ visibilityProperty: true });
    (function tick() {
      const heading = [...document.querySelectorAll("h1")].find(h => h.textContent.includes("幾等"));
      const footer = document.querySelector("footer");
      const state = [
        "大標" + (seen(heading) ? "看得到" : heading ? "藏著" : "沒有"),
        "表單" + (seen(document.querySelector('input[aria-label="你的等級"]')) ? "看得到" : "沒有"),
        "角色列" + (seen(document.querySelector('section[aria-label="你的角色"]')) ? "看得到" : "沒有"),
        "讀取中" + (seen(document.querySelector('[role="status"]')) ? "有" : "沒有"),
        "入口卡" + (seen(document.querySelector('a[href="/plan/avatar"]')) ? "看得到" : "藏著"),
        "頁尾" + (footer ? (footer.getBoundingClientRect().top < innerHeight ? "在畫面裡" : "在畫面外") : "沒有"),
      ].join(" ");
      if (window.__frames.at(-1)?.state !== state) window.__frames.push({ t: Math.round(performance.now()), state });
      requestAnimationFrame(tick);
    })();`,
});

/** 頁面高度 2 秒沒變才算量完（最多 30 秒）；資料、裝備卡都是載入後才長出來的 */
async function settled() {
  const t0 = Date.now();
  let height = -1, since = Date.now();
  while (Date.now() - t0 < 30000) {
    const now = await evaluate("document.documentElement.scrollHeight");
    if (now !== height) { height = now; since = Date.now(); }
    else if (Date.now() - since > 2000 && Date.now() - t0 > (SLOW ? 10000 : 5000)) return;
    await sleep(250);
  }
}

/** Google 實際採用的算法：間隔不到 1 秒的位移算同一段、一段最長 5 秒，取最大的一段 */
function largestWindow(entries) {
  let best = 0, sum = 0, first = 0, last = 0;
  for (const e of entries) {
    if (sum && e.t - last < 1000 && e.t - first < 5000) sum += e.v;
    else { sum = e.v; first = e.t; }
    last = e.t;
    best = Math.max(best, sum);
  }
  return best;
}

const round = v => +v.toFixed(4);
const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];

/** 擋掉程式再開一次：停在伺服器畫的版本（inline script 照跑），截圖就是第一格 */
async function serverFrame(file) {
  await page.send("Network.setBlockedURLs", { urls: ["*/_next/static/chunks/*.js*"] });
  await navigate(`${BASE}/`);
  await shot(file);
  await page.send("Network.setBlockedURLs", { urls: [] });
}

async function measure(width, saved) {
  const height = width === 375 ? 812 : 900;
  const mobile = MOBILE && width === 375;
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await navigate(`${BASE}/robots.txt`);
  await evaluate(saved ? `(localStorage.setItem("ms-profile", ${JSON.stringify(PROFILE)}), true)` : `(localStorage.removeItem("ms-profile"), true)`);
  const runs = [];
  for (let i = 0; i < REPS; i++) {
    await navigate(`${BASE}/`);
    await settled();
    const entries = (await evaluate(`window.__ls`)).filter(e => !e.input);
    runs.push({
      sum: round(entries.reduce((a, e) => a + e.v, 0)),
      window: round(largestWindow(entries)),
      entries: entries.map(e => ({ ...e, v: round(e.v) })),
      frames: await evaluate(`window.__frames`),
    });
  }
  const label = `${width}-${saved ? "saved" : "first"}`;
  await shot(`final-${label}.png`);
  await serverFrame(`server-${label}.png`);
  await navigate(`${BASE}/robots.txt`);
  await evaluate(`(localStorage.removeItem("ms-profile"), true)`);
  const sums = runs.map(r => r.sum);
  const result = {
    width, saved, median: median(sums), min: Math.min(...sums), max: Math.max(...sums),
    medianWindow: median(runs.map(r => r.window)), runs,
  };
  console.log(`${width}\t${saved ? "存過角色" : "第一次來"}\tn=${REPS}\t中位數 ${result.median}\t範圍 ${result.min}～${result.max}\t最大一段 ${result.medianWindow}\t每次 ${sums.join(" ")}`);
  for (const e of runs[0].entries) console.log(`    ${e.t}ms +${e.v}  ${e.src.join("、")}`);
  console.log(`    第一格 ${runs[0].frames.find(f => !f.state.includes("頁尾沒有"))?.state ?? "（沒有紀錄）"}`);
  return result;
}

const results = [];
for (const width of [1280, 375]) for (const saved of [true, false]) results.push(await measure(width, saved));
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ base: BASE, cold: COLD, mobile: MOBILE, slow: SLOW, results }, null, 1));
await close();

const over = results.filter(r => r.median >= LINE);
console.log(over.length ? `沒過：${over.map(r => `${r.width} ${r.saved ? "存過角色" : "第一次來"} ${r.median}`).join("、")}` : `全部低於 ${LINE}`);
process.exit(over.length ? 1 : 0);
