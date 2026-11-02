// Cloudflare 搬家（v1.33）驗收：整站靜態輸出＋API Worker 跑起來之後，從使用者看得到的地方點一輪，任何一項沒過 exit 1
// 用法：node scripts/verify/cf-shot.mjs [輸出資料夾] [網址，預設 http://localhost:8791] [DevTools 埠，預設 9493]
//   本機：先 npm run build:cf，再 npx wrangler dev -c wrangler.jsonc -c cf/items.wrangler.jsonc --env dev --port 8791
//   測試機：node scripts/verify/cf-shot.mjs "$TEMP/cf-shot" https://maplehelper-dev.<帳號>.workers.dev
// 量的：首頁、查資料（站內點進單筆頁＝靜態輸出的換頁資料檔有沒有對上）、道具圖（另一個 Worker）、野王計時開房間（API＋資料庫）、
//      練功測速排行 API、404 頁、快取標頭。本機沒有 DATABASE_URL：開房間會寫「還沒開」，這兩項記成略過（不算失敗）
// 輸出：home.png、db.png、db-detail.png、boss.png、results.json。練功測速上傳另跑 speed-shot.mjs（同一個網址）
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const OUT = outDir(process.argv[2], "cf-shot");
const BASE = (process.argv[3] ?? "http://localhost:8791").replace(/\/$/, "");
const PORT = chromePort(9493, process.argv[4]);
const results = { base: BASE, checks: [] };
const record = (name, ok, detail) => {
  results.checks.push({ name, ok, ...(detail === undefined ? {} : { detail }) });
  console.log(`${ok === "skip" ? "SKIP" : ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
};

let browser;
try {
  browser = await start(OUT, PORT);
  const { page, evaluate, ev, navigate, shot } = browser;
  const problems = [];
  page.listeners.add(msg => {
    if (msg.method === "Runtime.exceptionThrown") problems.push(String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text).slice(0, 300));
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") problems.push(msg.params.args.map(a => a.value ?? a.description).join(" ").slice(0, 300));
  });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const until = async (expr, ms = 20000) => {
    for (let t = 0; t < ms; t += 250) { try { if (await evaluate(`Boolean(${expr})`)) return true; } catch {} await sleep(250); }
    return false;
  };
  const imagesOk = () => ev(`await __waitFor(() => [...document.images].every(i => i.complete), 8000); return [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute("src")).slice(0, 5);`);

  // 首頁
  await navigate(`${BASE}/`);
  record("首頁有標題", await until(`document.querySelector("h1")`), await evaluate(`document.querySelector("h1")?.innerText ?? null`));
  record("首頁圖都載到", (await imagesOk()).length === 0, await imagesOk());
  await shot("home.png");

  // 查資料：首頁站內點「查資料」→ 點「道具」（client 換頁，吃靜態輸出的換頁資料檔）→ 點清單第一筆看卡片
  await evaluate(`window.__sameDoc = true`);
  await evaluate(`document.querySelector('header a[href="/db"]').click()`);
  const toHub = await until(`location.pathname === "/db" && document.querySelector('a[href="/db/items"]')`);
  await evaluate(`document.querySelector('a[href="/db/items"]').click()`);
  const toItems = await until(`location.pathname === "/db/items" && document.querySelector("main li button, main ul button")`);
  record("查資料站內換頁（首頁 → 查資料 → 道具，不整頁重載）", toHub && toItems && (await evaluate(`window.__sameDoc === true`)), { toHub, toItems });
  await ev(`await __settle(6000);`);
  record("道具清單圖都載到（道具圖在另一個 Worker）", (await imagesOk()).length === 0, await imagesOk());
  await evaluate(`document.querySelector("main li button, main ul button").click()`);
  const card = await until(`new URL(location.href).searchParams.get("id")`);
  record("點清單開卡片（?id=）", card, await evaluate(`location.search`));
  await ev(`await __settle(4000);`);
  await shot("db.png");
  await navigate(`${BASE}/db/monsters/100100`);
  record("單筆靜態頁（/db/monsters/100100）", await until(`document.querySelector("h1")?.innerText.includes("嫩寶")`), await evaluate(`document.querySelector("h1")?.innerText ?? null`));
  await shot("db-detail.png");

  // 道具圖、快取標頭、404
  const head = await evaluate(`Promise.all(["/assets/items/1302020.png", "/data/meta.json", "/data/monsters.json", "/this-page-does-not-exist"].map(async u => { const r = await fetch(u); return [u, r.status, r.headers.get("cache-control")]; }))`);
  const [item, meta, data, missing] = head;
  record("道具圖 200＋長快取", item[1] === 200 && /immutable/.test(item[2] ?? ""), item);
  record("meta.json 每次確認", meta[1] === 200 && meta[2] === "public, max-age=0, must-revalidate", meta);
  record("資料檔長快取", data[1] === 200 && /immutable/.test(data[2] ?? ""), data);
  record("找不到的頁 404", missing[1] === 404, missing);

  // 練功測速排行 API
  const board = await evaluate(`fetch("/api/speed/board").then(async r => [r.status, (await r.text()).slice(0, 120)])`);
  record("練功測速排行 API 有回 JSON", [200, 400, 503].includes(board[0]) && board[1].startsWith("{"), board);

  // 野王計時：開房間（API → Neon）
  await navigate(`${BASE}/plan/boss`);
  const canOpen = await until(`[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "開房間" && !b.disabled)`, 30000);
  if (!canOpen) throw new Error(`野王計時沒有可按的「開房間」：${(await evaluate("document.body.innerText")).slice(0, 300)}`);
  await evaluate(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "開房間").click()`);
  await until(`/隊友房間 \S|還沒開/.test(document.body.innerText)`, 15000);
  const bossText = await evaluate("document.body.innerText");
  const noDb = /還沒開/.test(bossText);
  const room = bossText.match(/隊友房間 (\S+)/)?.[1] ?? null;
  record("野王計時開房間", noDb ? "skip" : Boolean(room), noDb ? "沒有資料庫（本機），略過" : { room });
  await shot("boss.png");

  record("整趟沒有 console 錯誤", problems.length === 0, problems.slice(0, 5));
} catch (error) {
  record("腳本跑完", false, String(error).slice(0, 400));
} finally {
  await browser?.close();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(`輸出：${OUT}`);
  process.exit(results.checks.some(c => c.ok === false) ? 1 : 0);
}
