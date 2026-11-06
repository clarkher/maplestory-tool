// 紙娃娃（/plan/avatar，v1.40、v1.41）驗收：挑髮型換顏色、小窗、隨機穿搭、換性別、畫不出來的點裝、查資料「穿上看看」、角色圖載不出來、電腦版左右排，
// 加上 v1.41 的開場隨機、上一套、鎖定、超大武器、跨類別搜尋、只看商城有賣、下載 4 倍、分享預覽、一般裝備、首頁入口、快取沒 CORS、預載、換裝中、
// 同一分頁回來穿離開時那套、連點兩件、換穿搭不打伺服器；任何一項沒過 exit 1
// 用法：node scripts/verify/avatar-shot.mjs [網址，預設 http://localhost:9381] [輸出資料夾] [DevTools 埠，預設 9382]
//   例：node scripts/verify/avatar-shot.mjs http://localhost:9381 "$TEMP/avatar-shot"
//       node scripts/verify/avatar-shot.mjs https://maplehelper-dev.pipicards.workers.dev "$TEMP/avatar-shot-dev"
// 網址用 localhost，不要用 127.0.0.1（next dev 對 127.0.0.1 的互動不理）。第一次開頁 dev 要編譯，最多等 1 分鐘。
// 角色圖是瀏覽器向 maplestory.io 即時要的，要連得到網路（有幾項會用 DevTools 把它擋掉或拖慢，只在那幾項）。
// 輸出：avatar-375.png（一打開）、avatar-hair.png（挑髮型、換顏色）、avatar-mini.png／avatar-mini-dark.png（捲到挑衣服卡底、小窗）、
//       avatar-missing.png（畫不出來的點裝）、avatar-from-db.png（從查資料進來）、avatar-error.png（角色圖載不出來）、
//       avatar-opening.png（開場隨機）、avatar-locked.png／avatar-locked-dark.png（鎖住的小卡）、avatar-weapon.png／avatar-spear.png（超大武器）、
//       avatar-search.png（跨類別搜尋）、avatar-shop.png（只看商城有賣）、avatar-busy.png（換裝中）、avatar-shared.png（分享連結開起來）、
//       avatar-1280.png／avatar-1280-dark.png（電腦版左右排）、avatar-1280-full.png（穿滿一身、角色卡裡面自己捲）、
//       avatar-back-again.png（離開再回來同一套）、avatar-double.png（連點兩件）、avatar-shop-320.png（320 寬商城價）、results.json（每一項檢查的結果＋量到的東西）
// 期望值從「被測的那個站」的 /data/avatar.json 算（不讀本機檔，驗測試機時才對得上那邊的資料），道具 id 也從那裡挑（每日資料更新可能讓某件消失）。
// 頁面上的東西用 Picker 掛的 data-tab、data-colour、data-cell、data-name、data-missing、data-group 跟角色卡的 data-lock 找，不認樣式 class。
// 只有一個例外：watchChange（第 30、31 項）認大轉圈的 .motion-safe:animate-spin 跟它外層的 inset-0（大轉圈沒有別的東西可認），改大轉圈的寫法這兩項要跟著改。
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const BASE = (process.argv[2] ?? "http://localhost:9381").replace(/\/$/, "");
const OUT = outDir(process.argv[3], "avatar-shot");
const PORT = chromePort(9382, process.argv[4]);

/** 舞台一趟等 15 秒才放棄（Stage.tsx 的 LOAD_TIMEOUT_MS）。等到這個數字以上才算 maplestory.io 真的慢；比這早就放棄是請求被擋、回錯或程式壞了，那一項沒過 */
const SLOW_MS = 14000;
/** 整趟幫忙按「再試一次」幾次（超過就當 maplestory.io 真的掛了）、第 29 項換幾次預載。分開數：第 29 項用不到前者的額度 */
const DRAWN_BUDGET = 6;
const PRELOAD_BUDGET = 3;

// upstreamRetries：真的慢、幫忙重來的每一次（哪一項、等多久、哪張圖）。earlyErrors：太早放棄、讓那一項沒過的每一次
const results = { base: BASE, port: PORT, upstreamRetries: [], earlyErrors: [], checks: [] };
const saveResults = () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
};
const record = (name, ok, detail) => {
  results.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  return Boolean(ok);
};
/** 正在跑哪一項（記 upstreamRetries、earlyErrors 用） */
let currentCheck = null;
/** 一項檢查：fn 回 [ok, detail]；中途丟錯（例如點不到）就記這一項沒過、寫原因，接著跑下一項 */
async function check(name, fn) {
  currentCheck = name;
  try {
    const [ok, detail] = await fn();
    return record(name, ok, detail);
  } catch (error) {
    return record(name, false, `中途出錯：${String(error?.message ?? error).slice(0, 300)}`);
  }
}

let page, evaluate, navigate, loadOnce, shot, traverse, close;
const problems = { exceptions: [], errors: [] };
/** 整趟向 maplestory.io 要過的角色圖（換裝、開場要看有沒有要過白 T） */
const characterRequests = [];
/**
 * 整趟跟伺服器要過的紙娃娃頁資料（Next 的 _rsc 請求）：換穿搭時不該有。
 * 只算這一頁自己的（/plan/avatar.txt?…、/plan/avatar?…）：導覽列連結的預先載入一開頁就有 16 個（/db/__next…），
 * 機器慢時會拖到換穿搭那一段才發，那不是換穿搭打的
 */
const isAvatarPage = url => /^\/plan\/avatar([/.]|$)/.test(new URL(url).pathname);
const rscRequests = [];

const viewport = (width, height) => page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
/** 等畫面真的畫過兩格（換主題、捲動之後截圖用） */
const painted = () => evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))");
async function setTheme(theme) {
  await evaluate(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(theme)}; return true; })()`);
  await painted();
}

async function until(expression, ms = 60000) {
  for (let t = 0; t < ms; t += 250) {
    try { if (await evaluate(`Boolean(${expression})`)) return true; } catch { /* 換頁中 */ }
    await sleep(250);
  }
  return false;
}

/** 真的用滑鼠點；finder 是一段會回傳元素的程式。instant 才不會邊滑邊量。找不到就丟錯（那一項直接沒過） */
async function click(what, finder) {
  const at = await evaluate(`(() => { const el = (${finder}); if (!el) return null; el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!at) throw new Error(`點不到：${what}`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 });
}
/** until 沒等到就丟錯 */
async function wait(what, expression, ms) {
  if (!(await until(expression, ms))) throw new Error(`等不到：${what}`);
}

const CARD = `document.querySelector("section[aria-label='角色']")`;
const PICKER = `document.querySelector("section[aria-label='挑衣服']")`;
const MINI = `document.querySelector("[aria-label='角色小窗']")`;
/** 小窗看得到（一直掛著，收起來時是 visibility: hidden；電腦版是 display: none） */
const MINI_SHOWN = `(() => { const m = ${MINI}; return Boolean(m && m.getClientRects().length && getComputedStyle(m).visibility === "visible"); })()`;
const STAGE = `${CARD}?.querySelector("[aria-busy]")`;
const STAGE_IMG = `${CARD}?.querySelector("img[alt='穿好的角色']")`;
const CELLS = `[...(${PICKER}?.querySelectorAll("[data-cell]") ?? [])]`;
const NAMES = `${CELLS}.map(b => b.querySelector("[data-name]")?.textContent.trim() ?? "")`;
const TAB = key => `${PICKER}?.querySelector("[data-tab='${key}']")`;
const SWATCH = (group, c) => `document.querySelector("[role='group'][aria-label='${group}'] [data-colour='${c}']")`;
const PRESSED_COLOUR = group => `document.querySelector("[role='group'][aria-label='${group}'] [aria-pressed='true']")?.dataset.colour`;
const SEGMENT = (group, text) => `[...document.querySelectorAll("[role='group'][aria-label='${group}'] button")].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
const button = (scope, text) => `[...(${scope}?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
/** 「隨機穿搭」換裝中時字會變「換裝中…」（還是按得下去），兩種都要認 */
const RANDOM = `[...(${CARD}?.querySelectorAll("button") ?? [])].find(b => ["隨機穿搭", "換裝中…"].includes(b.textContent.trim()))`;
const BACK = button(CARD, "上一套");
const LOCK = k => `${CARD}?.querySelector("[data-lock='${k}']")`;
const LOCKED = k => `${LOCK(k)}?.getAttribute("aria-pressed") === "true"`;
const TOGGLE = button(PICKER, "只看商城有賣");
const MORE = button(PICKER, "再看 40 個");
const INPUT = `${PICKER}?.querySelector("input[type='search']")`;
const CLEAR = `${PICKER}?.querySelector("button[aria-label='清除搜尋']")`;

/** 第 0 格的網址：站著、走路、警戒輪播時 img.src 在幾格之間換，要比穿搭有沒有換就比這個 */
const frame0 = src => src.replace(/\/\d+\?resize=/, "/0?resize=");
const FRAME0_JS = `(s => s.replace(/\\/\\d+\\?resize=/, "/0?resize="))`;
const STAGE_FRAME0 = `(() => { const img = ${STAGE_IMG}; return img ? ${FRAME0_JS}(img.src) : null; })()`;
const stageFrame0 = () => evaluate(STAGE_FRAME0);
/** 舞台的圖載好了（有寬度）；給 id 就要圖的網址裡有這個道具 */
const stageReady = id => `(() => { const img = ${STAGE_IMG}; return !!img && img.complete && img.naturalWidth > 0${id === undefined ? "" : ` && decodeURIComponent(img.src).includes('"itemId":${id}')`}; })()`;
/** 舞台畫好網址上這一套：第 0 格載好、沒在等新圖、網址寫的 s、h、f、w 都在圖裡（沒寫的是預設）。圖還沒換過來時網址就換了，要看這個才不會量到上一套 */
const SETTLED = `(() => {
  const img = ${STAGE_IMG};
  if (!img || !img.complete || !img.naturalWidth || ${STAGE}?.getAttribute("aria-busy") !== "false") return false;
  const src = decodeURIComponent(img.src), q = new URLSearchParams(location.search);
  return [q.get("s"), q.get("h"), q.get("f"), ...(q.get("w") ?? "").split(".")].filter(Boolean).every(id => src.includes('"itemId":' + id));
})()`;
const RETRY = button(CARD, "再試一次");
/** 舞台要第 0 格的紀錄（都是 1 倍；下載是 4 倍，不在裡面） */
const FRAME0_ENTRIES = `performance.getEntriesByType("resource").filter(e => e.name.includes("/api/character/") && e.name.includes("/0?resize=1&"))`;
/**
 * 舞台這張圖等了多久，從真的開始要算（Resource Timing，放棄的請求也有一筆，結束時間是放棄的時候）。
 * 網址上這一套最後結束的那筆；帶 crossOrigin 失敗馬上退回不帶，兩次共用一個 15 秒，網址一樣又接得上的算同一趟。「再試一次」網址多 &_r=，是另一趟。
 */
const STAGE_WAIT = `(() => {
  const q = new URLSearchParams(location.search);
  const ids = [q.get("s"), q.get("h"), q.get("f"), ...(q.get("w") ?? "").split(".")].filter(Boolean);
  const mine = ${FRAME0_ENTRIES}.filter(e => { const s = decodeURIComponent(e.name); return ids.every(id => s.includes('"itemId":' + id)); }).sort((a, b) => a.responseEnd - b.responseEnd);
  const last = mine.at(-1);
  if (!last) return null;
  let start = last.startTime;
  for (const e of mine.filter(x => x !== last && x.name === last.name).reverse()) {
    if (start - e.responseEnd > 500) break;
    start = e.startTime;
  }
  return { ms: Math.round(last.responseEnd - start), status: last.responseStatus, url: last.name };
})()`;
/** 舞台剛放棄：等放棄的那筆紀錄進 Resource Timing 再讀（比畫面晚一點） */
async function stageWait() {
  await sleep(300);
  for (let i = 0; i < 4; i++) {
    const wait = await evaluate(STAGE_WAIT);
    if (wait) return wait;
    await sleep(250);
  }
  return null;
}
/** 真的慢：記一筆（哪一項、哪一種、等多久、哪張圖）。wait 是 { ms, url } */
const logRetry = (kind, wait) => results.upstreamRetries.push({ check: currentCheck, kind, waitMs: wait.ms, url: decodeURIComponent(wait.url) });
/** 不到 SLOW_MS 就放棄，或查不到等了多久：記一筆，回傳要丟的錯（那一項沒過） */
function earlyError(what, wait) {
  results.earlyErrors.push({ check: currentCheck, what, waitMs: wait?.ms ?? null, status: wait?.status ?? null, url: wait ? decodeURIComponent(wait.url) : null });
  return new Error(wait
    ? `${what}：只等了 ${wait.ms}ms、狀態 ${wait.status}（舞台一趟 15 秒才放棄，這不是 maplestory.io 慢）`
    : `${what}：Resource Timing 查不到這張圖，證明不了是 maplestory.io 慢`);
}
/**
 * 等舞台畫好。maplestory.io 偶爾一張圖要 20 秒以上（直接問它也一樣，隔一下同一張不到 1 秒）：舞台等 15 秒就寫「載不出來」。
 * 那是照設計的樣子，不是這些項目要驗的：真的等滿了（≥ SLOW_MS）才幫忙按「再試一次」、記在 results.upstreamRetries；按超過 DRAWN_BUDGET 次（maplestory.io 真的掛了）就不按，那一項沒過。
 * 比 SLOW_MS 早就寫「載不出來」不是它慢（請求被擋、回錯、程式壞了）：記在 results.earlyErrors、丟錯，那一項沒過。
 * 第 8、9 項要驗載不出來、退回不帶 crossOrigin，不靠這個（第 9 項有看 upstreamRetries 沒增加）。
 */
async function drawn(expression, ms = 60000) {
  for (let t = 0; t < ms; t += 250) {
    if (await evaluate(`Boolean(${expression})`)) return true;
    if (await evaluate(`Boolean(${RETRY})`)) {
      const wait = await stageWait();
      if (!wait || wait.ms < SLOW_MS) throw earlyError("舞台太早寫「載不出來」", wait);
      if (results.upstreamRetries.filter(r => r.kind === "再試一次").length >= DRAWN_BUDGET) return false;
      logRetry("再試一次", wait);
      await evaluate(`(${RETRY}).click(), true`);
    }
    await sleep(250);
  }
  return false;
}
async function settled(ms = 60000) {
  if (!(await drawn(SETTLED, ms))) throw new Error("等不到：舞台畫好這一套");
}
const hScroll = () => evaluate(`({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })`);
const worn = () => evaluate(`[...document.querySelectorAll("ul[aria-label='穿了什麼'] li")].map(li => li.innerText.replace(/\\s+/g, " ").trim())`);
const search = () => evaluate("location.search");
const param = k => evaluate(`new URLSearchParams(location.search).get(${JSON.stringify(k)})`);
const stored = k => evaluate(`sessionStorage.getItem(${JSON.stringify(k)})`);
const storedLooks = async () => JSON.parse((await stored("avatar:history")) ?? "[]");
const open = query => navigate(`${BASE}/plan/avatar${query}`);
/** 上一套、鎖都存在 sessionStorage：先開同網域的小圖清掉（不用等紙娃娃頁載好、也不會跑開場隨機），每一項從乾淨的狀態開始 */
async function fresh(query) {
  await navigate(`${BASE}/brand-emblem.png`);
  await evaluate("sessionStorage.clear()");
  await open(query);
}
async function reload() {
  const loaded = loadOnce();
  await page.send("Page.reload");
  await loaded;
}
/** 頁面載好：舞台圖、挑衣服卡格子都出來了 */
async function ready(minCells = 1) {
  const img = await drawn(stageReady());
  const cells = await until(`${CELLS}.length >= ${minCells}`, 15000);
  return img && cells;
}
/** 按一下「隨機穿搭」，等網址換好、舞台畫好（回傳新網址） */
async function pressRandom() {
  const before = await search();
  await click("隨機穿搭", RANDOM);
  await wait("按隨機後網址換了", `location.search !== ${JSON.stringify(before)}`, 15000);
  await settled();
  return search();
}
async function lock(k) {
  await click(`鎖頭 ${k}`, LOCK(k));
  await wait(`${k} 鎖住`, LOCKED(k), 3000);
}

/** 慢 4G（DevTools 的 Slow 4G）＋CPU 4 倍：fn 跑完一定解除 */
const SLOW_4G = { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024 / 8) * 0.9, uploadThroughput: (750 * 1024 / 8) * 0.9 };
async function throttled(fn) {
  await page.send("Network.emulateNetworkConditions", SLOW_4G);
  await page.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  try { return await fn(); } finally {
    await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
}
const CELL = id => `${PICKER}?.querySelector('[data-cell="${id}"]')`;
/** 頁面裡排好時間點格子（不走 DevTools：它要等上一下處理完才送下一下，量不到真的連點）；a、b 是道具 id，一樣就是點兩次同一格 */
const clickTwice = (a, b, gap = 30) => evaluate(`new Promise(res => { (${CELL(a)}).click(); setTimeout(() => { (${CELL(b)}).click(); res(true); }, ${gap}); })`);

/** 逐格記舞台畫過哪些圖、鎖有沒有亮過（頁面裡跑；整頁重載會消失，要從頭記用 fromDocumentStart） */
const RECORDER = `(() => { window.__drawn = []; window.__lit = 0; const tick = () => {
  const i = document.querySelector("section[aria-label='角色'] img[alt='穿好的角色']");
  if (i && i.complete && i.naturalWidth > 0 && window.__drawn.at(-1) !== i.src) window.__drawn.push(i.src);
  if (document.querySelector("[data-lock][aria-pressed='true']")) window.__lit++;
  requestAnimationFrame(tick); }; tick(); })()`;
async function fromDocumentStart(fn) {
  const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: RECORDER });
  try { return await fn(); } finally { await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }); }
}

/** 用 DevTools 攔 maplestory.io 的請求：onPaused 自己決定放行或擋掉；fn 跑完一定解除 */
async function intercepting(onPaused, fn) {
  const listener = msg => { if (msg.method === "Fetch.requestPaused") onPaused(msg.params); };
  page.listeners.add(listener);
  await page.send("Fetch.enable", { patterns: [{ urlPattern: "*maplestory.io*" }] });
  try { return await fn(); } finally {
    await page.send("Fetch.disable");
    page.listeners.delete(listener);
  }
}
const pass = params => page.send("Fetch.continueRequest", { requestId: params.requestId }).catch(() => {});

/** 打字進搜尋框（走真的輸入，React 才收得到）；等到格子只剩含這個字的 */
async function typeSearch(text) {
  await click("搜尋框", INPUT);
  await evaluate(`(${INPUT}).select()`);
  await page.send("Input.insertText", { text });
  await wait(`搜尋「${text}」生效`, `(${INPUT}).value === ${JSON.stringify(text)} && ${NAMES}.every(n => n.includes(${JSON.stringify(text)}))`, 5000);
}
/** 挑衣服卡現在的樣子 */
const pickerState = () => evaluate(`(() => {
  const p = ${PICKER};
  const cells = [...p.querySelectorAll("[data-cell]")];
  const toggle = ${TOGGLE};
  const texts = [...p.querySelectorAll("p, span")].map(x => x.textContent.trim());
  return {
    cells: cells.length,
    priced: cells.filter(c => /\\d 樂豆點$/.test(c.textContent.trim())).length,
    heads: [...p.querySelectorAll("[data-group]")].map(h => h.dataset.group + ":" + (h.textContent.match(/（(\\d+)）/)?.[1] ?? "?")),
    pressedTabs: [...p.querySelectorAll("[data-tab][aria-pressed='true']")].map(b => b.dataset.tab),
    toggle: toggle ? toggle.getAttribute("aria-pressed") : null,
    text: p.querySelector("input[type='search']").value,
    found: texts.find(t => /^找到 \\d+ 件$/.test(t)) ?? null,
    count: texts.find(t => /^\\d+ 件$/.test(t)) ?? null,
    more: Boolean(${MORE}),
    swatches: p.querySelectorAll("[data-colour]").length,
  };
})()`);

/** 這套每一格實際不透明的範圍，放到舞台上離邊界多遠（負的＝被切）。要帶 cache: "reload"：快取裡可能是沒帶 Origin 的版本，fetch 會被擋 */
const stageClip = frames => evaluate(`(async () => {
  const stage = ${STAGE}, img = stage.querySelector("img[alt='穿好的角色']");
  const scale = parseFloat(img.style.width) / img.naturalWidth;
  const ground = parseFloat(img.style.bottom) + img.naturalHeight * scale / 2;
  const cw = stage.clientWidth, ch = stage.clientHeight;
  const out = [];
  for (let n = 0; n < ${frames}; n++) {
    const url = img.src.replace(/\\/\\d+\\?resize=/, "/" + n + "?resize=");
    const bmp = await createImageBitmap(await (await fetch(url, { cache: "reload" })).blob());
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    const x = c.getContext("2d");
    x.drawImage(bmp, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let l = 1e9, r = -1, t = 1e9, b = -1;
    for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) if (d[(yy * c.width + xx) * 4 + 3] > 0) { l = Math.min(l, xx); r = Math.max(r, xx); t = Math.min(t, yy); b = Math.max(b, yy); }
    // 圖的中心＝腳：左右對舞台中線、上下對地面線
    const footX = cw / 2, footY = ch - ground;
    out.push({
      L: +(footX + (l - c.width / 2) * scale).toFixed(2), R: +(cw - (footX + (r + 1 - c.width / 2) * scale)).toFixed(2),
      T: +(footY + (t - c.height / 2) * scale).toFixed(2), B: +(ch - (footY + (b + 1 - c.height / 2) * scale)).toFixed(2),
    });
  }
  return { scale, ground, box: [cw, ch], frames: out };
})()`);

/**
 * 做一個動作、頁面裡記到換好為止（不靠截圖，也不會漏掉兩格之間的變化）：
 * MutationObserver：<img> 的 opacity 每一次改動、大轉圈每一次出現、aria-busy 每一次變化；requestAnimationFrame：每一格算出來的 opacity。
 * requestStart：Resource Timing 記的「真的開始要第 0 格」（跟 performance.now 同一個時鐘）；舞台放棄了（img 不見了）就看按下去之後第一筆第 0 格
 */
const watchChange = action => evaluate(`new Promise(res => {
  const stage = ${STAGE};
  const SPIN = ".motion-safe\\\\:animate-spin";
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);
  const ev = { opacityWrites: [], spinnerAdds: [], ariaTrue: null, ariaFalse: null, frames: 0, minOpacity: 1, busyLabel: false };
  let last = stage.querySelector("img")?.style.opacity ?? "";
  const mo = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === "attributes" && m.attributeName === "aria-busy") {
        const v = stage.getAttribute("aria-busy");
        if (v === "true" && ev.ariaTrue === null) ev.ariaTrue = at();
        if (v === "false" && ev.ariaTrue !== null && ev.ariaFalse === null) ev.ariaFalse = at();
      }
      if (m.type === "attributes" && m.attributeName === "style" && m.target.tagName === "IMG") {
        const o = m.target.style.opacity;
        if (o !== last) { ev.opacityWrites.push([at(), o]); last = o; }
      }
      if (m.type === "childList") for (const n of m.addedNodes) {
        const s = n.nodeType === 1 ? (n.matches(SPIN) ? n : n.querySelector(SPIN)) : null;
        if (s) ev.spinnerAdds.push([at(), s.offsetWidth, s.parentElement.className.includes("inset-0")]);
      }
    }
  });
  mo.observe(stage, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "aria-busy"] });
  (${action}).click();
  const tick = () => {
    const img = stage.querySelector("img");
    const o = img ? Number(getComputedStyle(img).opacity) : 1;
    ev.frames++;
    if (o < ev.minOpacity) ev.minOpacity = o;
    const label = ${button(CARD, "換裝中…")};
    if (label && !label.disabled) ev.busyLabel = true;
    if ((ev.ariaFalse !== null && at() - ev.ariaFalse > 300) || at() > 30000) {
      mo.disconnect();
      const entry = img ? performance.getEntriesByName(${FRAME0_JS}(img.src)).at(-1) : ${FRAME0_ENTRIES}.find(e => e.startTime >= t0);
      ev.requestStart = entry ? Math.round(entry.startTime - t0) : null;
      ev.requestUrl = entry?.name ?? null;
      ev.endOpacity = img?.style.opacity ?? null;
      ev.endSpin = Boolean(stage.querySelector(SPIN));
      res(ev);
    } else requestAnimationFrame(tick);
  };
  tick();
})`);

try {
  // 期望值：被測的站上的資料
  const res = await fetch(`${BASE}/data/avatar.json`);
  if (!res.ok) throw new Error(`${BASE}/data/avatar.json 回 ${res.status}`);
  const data = await res.json();
  const fits = (x, g) => x.g === g || x.g === 2;
  const coloursOf = s => [...new Set([...s.t, ...s.j])].sort((a, b) => a - b);
  const MALE_HAIR = data.hair.filter(s => fits(s, 0) && coloursOf(s).length);
  const FEMALE_HAIR = data.hair.filter(s => fits(s, 1) && coloursOf(s).length);
  const FIRST_CAP = data.items.find(i => i.k === "cap" && fits(i, 0) && i.cash && i.r);
  const MISSING_CAP = data.items.find(i => i.k === "cap" && fits(i, 0) && i.cash && !i.r);
  const TRY_ITEM = data.items.find(i => i.id === 1042029) ?? data.items.find(i => i.k === "coat" && i.g === 2 && i.cash && i.r);
  const TRY = TRY_ITEM?.id;
  const TRY_NAME = TRY_ITEM?.n;
  // 第 2 項挑的髮型：從第 3 格起，第一款有兩種以上顏色的（才換得了色）
  const HAIR_AT = MALE_HAIR.findIndex((s, i) => i >= 2 && i < 40 && coloursOf(s).length >= 2);
  // v1.41 的幾項共用：一款不是預設的髮型（網址才寫得出 h=）、男生限定的上衣褲裙（換性別會被換掉）、男女都能穿的帽子（換性別留得住）
  const DEFAULT_HAIR = 30030;
  const hairA = MALE_HAIR.map(s => s.id + coloursOf(s)[0]).find(id => id !== DEFAULT_HAIR);
  const MALE_COAT = data.items.find(i => i.k === "coat" && i.g === 0 && i.r);
  const MALE_PANTS = data.items.find(i => i.k === "pants" && i.g === 0 && i.r);
  const BOTH_CAP = data.items.find(i => i.k === "cap" && i.g === 2 && i.r);
  const LOOK = `?w=${BOTH_CAP?.id}.${MALE_COAT?.id}.${MALE_PANTS?.id}`;
  const JP_CAP = data.items.find(i => i.k === "cap" && fits(i, 0) && i.r === "j");
  // 超大武器：id 開頭 1702 的 1702861（下緣被舞台切過 53px），資料沒有就換一件同類的；拿槍趴下（1 格、武器橫著）
  const BIG_WEAPON = data.items.find(i => i.id === 1702861) ?? data.items.find(i => String(i.id).startsWith("1702") && fits(i, 0) && i.r);
  const SPEAR = data.items.find(i => Math.floor(i.id / 10000) === 144 && fits(i, 0) && i.r);
  const PLAIN = data.items.find(i => i.id === 1040002 && i.r) ?? data.items.find(i => !i.cash && i.r);
  const SHOP_CAPS = data.items.filter(i => i.k === "cap" && fits(i, 0) && i.pr).length;
  // 搜尋：一組一組的件數（跟 list.ts 同規則）
  const WORD = "楓葉";
  const groupsOf = (word, tabs) => {
    const q = word.toLowerCase();
    const hit = x => x.n.toLowerCase().includes(q);
    return tabs.map(tab => {
      if (tab === "skin") return { tab, n: data.skin.filter(hit).length };
      if (tab === "hair" || tab === "face") return { tab, n: data[tab].filter(s => fits(s, 0) && hit(s)).length };
      return { tab, n: data.items.filter(i => i.k === tab && fits(i, 0) && hit(i)).length };
    }).filter(g => g.n > 0);
  };
  results.expect = { hairAt: HAIR_AT, hair: MALE_HAIR[HAIR_AT]?.id, female1: FEMALE_HAIR[0]?.n, firstCap: FIRST_CAP?.n, missing: MISSING_CAP?.id, tryName: TRY_NAME, hairA, bigWeapon: BIG_WEAPON?.id, spear: SPEAR?.id, plain: PLAIN?.id, shopCaps: SHOP_CAPS };

  ({ page, evaluate, navigate, loadOnce, shot, traverse, close } = await start(OUT, PORT));
  page.listeners.add(msg => {
    if (msg.method === "Runtime.exceptionThrown") problems.exceptions.push(String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text).slice(0, 300));
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") problems.errors.push(msg.params.args.map(a => a.value ?? a.description).join(" ").slice(0, 300));
    if (msg.method === "Network.requestWillBeSent" && msg.params.request.url.includes("/api/character/")) characterRequests.push(msg.params.request.url);
    if (msg.method === "Network.requestWillBeSent" && /[?&]_rsc=/.test(msg.params.request.url) && isAvatarPage(msg.params.request.url)) rscRequests.push(msg.params.request.url);
  });
  await page.send("Network.enable");
  // Resource Timing 預設 250 筆一下就滿，後面的圖量不到（第 29、31 項、舞台等了多久都靠它）：每一頁一開始就調大
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "performance.setResourceTimingBufferSize(5000)" });
  await viewport(375, 812);

  // 1. 一打開：舞台圖載好、不橫捲（帶參數開：不帶會開場隨機，第 2 項要從白 T 開始）
  await check("375 寬一打開：舞台圖載好、頁面不橫捲", async () => {
    await open("?g=0");
    const loaded = await ready(40);
    const w = await hScroll();
    await shot("avatar-375.png");
    return [loaded && w.scrollWidth <= w.clientWidth, { loaded, ...w }];
  });

  // 2. 髮型第 N 格 → h 換成那一款（保留目前顏色，沒有就最小的）；點一個這款有、跟現在不同的顏色 → h 尾數變那個顏色
  const style = MALE_HAIR[HAIR_AT];
  await check(`點髮型第 ${HAIR_AT + 1} 格（${style?.n} ${style?.id}）：網址 h 變了、舞台圖換了、那格框起來；點另一個顏色：h 尾數跟著變`, async () => {
    if (!style) throw new Error("前 40 款男生髮型裡找不到有兩種以上顏色的");
    await wait("髮色色塊", PRESSED_COLOUR("髮色"), 5000);
    const cur = Number(await evaluate(PRESSED_COLOUR("髮色")));
    const colours = coloursOf(style);
    const keep = colours.includes(cur) ? cur : colours[0];
    const before = { search: await search(), frame: await stageFrame0() };
    await click(`髮型第 ${HAIR_AT + 1} 格`, `${CELLS}[${HAIR_AT}]`);
    const changed = await until(`new URLSearchParams(location.search).get("h") === "${style.id + keep}"`, 10000);
    const shown = await drawn(stageReady(style.id + keep));
    const pressed = await evaluate(`${CELLS}.findIndex(b => b.getAttribute("aria-pressed") === "true")`);
    const frame = await stageFrame0();
    const other = colours.find(c => c !== keep);
    const colourName = await evaluate(`${SWATCH("髮色", other)}?.getAttribute("aria-label") ?? null`);
    await click(`髮色色塊 ${other}`, SWATCH("髮色", other));
    const recoloured = await until(`new URLSearchParams(location.search).get("h") === "${style.id + other}"`, 10000);
    const redrawn = await drawn(stageReady(style.id + other));
    const swatchPressed = await evaluate(`${SWATCH("髮色", other)}?.getAttribute("aria-pressed")`);
    await evaluate(`${CARD}.scrollIntoView({ block: "start", behavior: "instant" })`);
    await painted();
    await shot("avatar-hair.png");
    return [
      changed && shown && frame !== before.frame && pressed === HAIR_AT && recoloured && redrawn && swatchPressed === "true",
      { from: before.search, keepColour: keep, after: `h=${style.id + keep}`, pressedCell: pressed, colour: `${other} ${colourName}`, final: await search(), swatchPressed },
    ];
  });

  // 3. 捲到挑衣服卡底：小窗出現、三顆按鈕、沒蓋住最後一排；回到上面
  await check("捲到挑衣服卡底：小窗出現、有「下載」「分享」「回到上面」、沒蓋住最後一排；點「回到上面」回到頂端、小窗收起來", async () => {
    await evaluate(`(() => { const p = ${PICKER}; window.scrollTo({ top: p.getBoundingClientRect().bottom + scrollY - innerHeight + 16, behavior: "instant" }); return true; })()`);
    const shown = await until(MINI_SHOWN, 5000);
    const miniImg = await until(`(() => { const img = ${MINI}?.querySelector("img[alt='穿好的角色']"); return img && img.complete && img.naturalWidth > 0; })()`, 15000);
    const m = await evaluate(`(() => {
      const m = ${MINI};
      const last = ${CELLS}.at(-1)?.getBoundingClientRect();
      return {
        buttons: [...m.querySelectorAll("button")].map(b => b.textContent.trim()),
        inert: m.closest("[inert]") !== null,
        bottom: Math.round(m.getBoundingClientRect().bottom),
        lastCellTop: last ? Math.round(last.top) : null,
        scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
      };
    })()`);
    await painted();
    await shot("avatar-mini.png");
    await setTheme("dark");
    await shot("avatar-mini-dark.png");
    await setTheme("light");
    await click("小窗的「回到上面」", button(MINI, "回到上面"));
    const top = await until(`scrollY === 0 && !${MINI_SHOWN}`, 5000);
    const hiddenInert = await evaluate(`${MINI}.closest("[inert]") !== null`);
    const ok = shown && miniImg && !m.inert && ["下載", "分享", "回到上面"].every(t => m.buttons.includes(t))
      && m.lastCellTop !== null && m.lastCellTop >= m.bottom && m.scrollWidth <= m.clientWidth && top && hiddenInert;
    return [ok, { shown, miniImg, ...m, top, hiddenInert }];
  });

  // 4. 隨機穿搭 3 次：每次網址都變、舞台第 0 格換了（輪播中 src 一直變，不能比 src）
  await check("按「隨機穿搭」3 次：每次網址都變、舞台圖載好", async () => {
    const rounds = [];
    for (let i = 0; i < 3; i++) {
      const prev = { search: await search(), frame: await stageFrame0() };
      await click("隨機穿搭", RANDOM);
      const changed = await until(`location.search !== ${JSON.stringify(prev.search)}`, 10000);
      const swapped = await drawn(`${SETTLED} && ${STAGE_FRAME0} !== ${JSON.stringify(prev.frame)}`);
      rounds.push({ changed, swapped, search: (await search()).slice(0, 90) });
    }
    return [rounds.every(r => r.changed && r.swapped), rounds];
  });

  // 5. 換女生：g=1、髮型第一格是女生髮型
  await check(`切「女」：網址有 g=1、髮型第一格是女生髮型（${FEMALE_HAIR[0]?.n}）、40 格都是女生穿得到的`, async () => {
    await click("性別「女」", SEGMENT("性別", "女"));
    const female = await until(`new URLSearchParams(location.search).get("g") === "1"`, 10000);
    const first = await until(`${NAMES}[0] === ${JSON.stringify(FEMALE_HAIR[0]?.n)}`, 5000);
    const names = await evaluate(NAMES);
    const femaleNames = new Set(data.hair.filter(s => fits(s, 1)).map(s => s.n));
    const allFemale = names.length > 0 && names.every(n => femaleNames.has(n));
    return [female && first && allFemale, { search: await search(), first: names[0], cells: names.length, allFemale }];
  });

  // 6. 帶一件畫不出來的點裝進來：頁面正常、穿預設；帽子頁看得到「暫時看不到樣子」，點了跳提示、不穿
  await check(`?try=${MISSING_CAP?.id}（${MISSING_CAP?.n}，畫不出來）：頁面正常、穿預設；帽子頁第一格是點裝、搜得到它且寫「暫時看不到樣子」，點了跳提示、不穿`, async () => {
    if (!MISSING_CAP) throw new Error("資料裡沒有畫不出來的男生點裝帽子");
    await open(`?try=${MISSING_CAP.id}`);
    const loaded = await ready();
    const toDefault = await until(`location.search === ""`, 10000);
    const wornNow = await worn();
    await click("帽子分頁", TAB("cap"));
    const firstCap = await until(`${NAMES}[0] === ${JSON.stringify(FIRST_CAP.n)}`, 5000);
    const firstCapName = (await evaluate(NAMES))[0];
    await typeSearch(MISSING_CAP.n);
    const cellFinder = `${CELLS}.find(b => b.querySelector("[data-name]")?.textContent.trim() === ${JSON.stringify(MISSING_CAP.n)})`;
    const faded = await until(`(${cellFinder})?.hasAttribute("data-missing") && (${cellFinder}).innerText.includes("暫時看不到樣子")`, 5000);
    await click(MISSING_CAP.n, cellFinder);
    const toast = await until(`document.body.innerText.includes("這件暫時看不到樣子，先挑別件")`, 3000);
    const stillDefault = (await search()) === "";
    await shot("avatar-missing.png");
    const ok = loaded && toDefault && !wornNow.some(t => t.includes(MISSING_CAP.n)) && firstCap && faded && toast && stillDefault;
    return [ok, { loaded, toDefault, worn: wornNow, firstCap: firstCapName, expectFirstCap: FIRST_CAP.n, faded, toast, stillDefault }];
  });

  // 7. 查資料「穿上看看」
  await check(`/db/items?id=${TRY} 有「穿上看看」，點下去到 /plan/avatar?try=${TRY}，穿了什麼裡有「${TRY_NAME}」`, async () => {
    await navigate(`${BASE}/db/items?id=${TRY}`);
    const linkFinder = `[...document.querySelectorAll("a")].find(a => a.textContent.trim() === "穿上看看")`;
    const linked = await until(linkFinder);
    const href = linked ? await evaluate(`(${linkFinder}).getAttribute("href")`) : null;
    await click("穿上看看", linkFinder);
    const landed = await until(`location.pathname === "/plan/avatar"`, 30000);
    const tried = await until(`[...document.querySelectorAll("ul[aria-label='穿了什麼'] li")].some(li => li.innerText.includes(${JSON.stringify(TRY_NAME)}))`, 30000);
    const shown = await drawn(stageReady(TRY));
    await evaluate(`window.scrollTo({ top: 0, behavior: "instant" })`);
    await painted();
    await shot("avatar-from-db.png");
    return [linked && href === `/plan/avatar?try=${TRY}` && landed && tried && shown, { href, landed, tried, shown, worn: await worn() }];
  });

  // 8. maplestory.io 全回 503：照實寫載不出來＋再試一次（快取也關掉）
  await page.send("Network.setCacheDisabled", { cacheDisabled: true });
  let blocked = 0;
  await intercepting(
    params => {
      blocked++;
      page.send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 503, responseHeaders: [{ name: "Content-Type", value: "text/plain" }], body: "" }).catch(() => {});
    },
    () => check("maplestory.io 全回 503：看到「角色圖載不出來，等一下再過來」跟「再試一次」", async () => {
      await open("?p=sit");
      const shown = await until(`${CARD}?.innerText.includes("角色圖載不出來，等一下再過來") && ${button(CARD, "再試一次")}`, 30000);
      await shot("avatar-error.png");
      return [shown, { blocked, stageImg: await evaluate(`Boolean(${STAGE_IMG})`) }];
    }),
  );

  // 9. 快取裡是沒帶 Origin 要到的版本（maplestory.io 沒寫 Vary: Origin）：帶 crossOrigin 會被擋。模擬法：帶 Origin 的請求全部失敗、其他放行（快取繼續關著，一定走到這裡）
  let failedOrigin = 0, passedPlain = 0;
  await intercepting(
    params => {
      const hasOrigin = Object.keys(params.request.headers).some(k => k.toLowerCase() === "origin");
      if (hasOrigin) {
        failedOrigin++;
        page.send("Fetch.failRequest", { requestId: params.requestId, errorReason: "Failed" }).catch(() => {});
      } else {
        passedPlain++;
        pass(params);
      }
    },
    () => check("帶 Origin 要圖都失敗（快取裡沒有 CORS 標頭）：舞台退回不帶 crossOrigin 照畫、沒有「載不出來」", async () => {
      const retriesBefore = results.upstreamRetries.length;
      // 用別的項目不會碰到的膚色：這一項會真的在快取留下沒 CORS 標頭的版本（關掉快取只是不讀，照樣寫），後面的項目碰到同一張網址每次都要繞一圈，第 30 項就量不準
      await open(`?p=jump&s=2003`);
      await settled(30000);
      const retried = results.upstreamRetries.length - retriesBefore;
      const s = await evaluate(`(() => {
        const img = ${STAGE_IMG};
        const scale = parseFloat(img.style.width) / img.naturalWidth;
        return { crossorigin: img.getAttribute("crossorigin"), natural: img.naturalWidth, ground: parseFloat(img.style.bottom) + img.naturalHeight * scale / 2 };
      })()`);
      const errorShown = await evaluate(`${CARD}.innerText.includes("角色圖載不出來")`);
      return [failedOrigin > 0 && passedPlain > 0 && !errorShown && retried === 0 && s.crossorigin === null && s.natural > 0 && s.ground === 40, { failedOrigin, passedPlain, errorShown, retried, ...s }];
    }),
  );
  await page.send("Network.setCacheDisabled", { cacheDisabled: false });

  // 10. 開場隨機：網址完全沒參數才隨機；不先畫白 T；重置之後同一頁不再隨機；不多一筆瀏覽紀錄
  await check("沒帶參數打開：馬上隨機一套（網址有 h=、w=、舞台圖載好、不多一筆瀏覽紀錄，沒畫過也沒要過白 T）；按「重置」網址變空、回白 T，停 2 秒還是空", async () => fromDocumentStart(async () => {
    characterRequests.length = 0;
    await fresh("");
    const url = await until(`/[?&]h=/.test(location.search) && /[?&]w=/.test(location.search)`);
    await settled();
    const opening = { search: await search(), frame: await stageFrame0(), drawn: await evaluate("window.__drawn"), requests: [...characterRequests] };
    const { entries, currentIndex } = await page.send("Page.getNavigationHistory");
    const previous = entries[currentIndex - 1]?.url ?? "";
    await painted();
    await shot("avatar-opening.png");
    await click("重置", button(CARD, "重置"));
    const emptied = await until(`location.search === ""`, 15000);
    const white = await drawn(`${SETTLED} && ${STAGE_FRAME0} !== ${JSON.stringify(opening.frame)}`);
    const whiteFrame = await stageFrame0();
    await sleep(2000);
    const stillEmpty = (await search()) === "";
    const flashed = opening.drawn.map(frame0).includes(whiteFrame);
    const requested = opening.requests.map(frame0).includes(whiteFrame);
    const ok = url && previous.includes("brand-emblem") && emptied && white && stillEmpty && !flashed && !requested && (await stageFrame0()) === whiteFrame;
    return [ok, { url, opening: opening.search.slice(0, 60), previous: previous.split("/").pop(), emptied, white, stillEmpty, flashed, requested }];
  }));

  // 11. 帶參數不隨機
  await check("帶參數打開不隨機：?g=1、?p=sit 等 1.5 秒網址都沒變", async () => {
    const out = {};
    for (const q of ["?g=1", "?p=sit"]) {
      await fresh(q);
      await settled();
      await sleep(1500);
      out[q] = await search();
    }
    return [Object.entries(out).every(([q, now]) => q === now), out];
  });

  // 12. ?try 不多一筆紀錄；剛剛穿的那套（這裡是白 T）記進上一套
  await check(`?try=${TRY} 進來：網址換成正式寫法、不多一筆瀏覽紀錄、剛剛穿的白 T 記進上一套、按得回去`, async () => {
    await fresh("?g=0");
    await settled();
    await open(`?try=${TRY}`);
    const rewritten = await until(`!location.search.includes("try=") && new URLSearchParams(location.search).get("w")?.includes("${TRY}")`, 30000);
    await settled();
    await sleep(800);
    const { entries, currentIndex } = await page.send("Page.getNavigationHistory");
    const previous = entries[currentIndex - 1]?.url ?? "";
    const looks = await storedLooks();
    const enabled = await evaluate(`!${BACK}.disabled`);
    const now = await search();
    await click("上一套", BACK);
    const backToWhite = await until(`location.search === ""`, 15000);
    const off = await until(`${BACK}.disabled`, 3000);
    return [rewritten && previous.endsWith("/plan/avatar?g=0") && JSON.stringify(looks) === '[""]' && enabled && backToWhite && off, { rewritten, now, previous: previous.split("/").pop(), looks, enabled, backToWhite, off }];
  });

  // 13. 上一套
  await check("上一套：一開始按不了；按隨機再按上一套，網址回到按之前（動作、表情不變）；重新整理後還按得了；換動作不算一步、還原時動作留著", async () => {
    const start = `?h=${hairA}&p=walk&e=smile`;
    await fresh(start);
    await settled();
    const first = await evaluate(`${BACK}.disabled`);
    const afterRandom = await pressRandom();
    const enabled = await until(`!${BACK}.disabled`, 3000);
    await reload();
    await settled();
    const survived = await until(`!${BACK}.disabled`, 8000);
    await click("上一套", BACK);
    const restored = await until(`location.search === ${JSON.stringify(start)}`, 15000);
    const off = await until(`${BACK}.disabled`, 3000);
    await settled();
    // 再一輪：隨機之後換動作（不算一步），上一套回到髮型、動作留著新的
    await pressRandom();
    await click("動作「跳」", SEGMENT("動作", "跳"));
    await wait("動作換成跳", `new URLSearchParams(location.search).get("p") === "jump"`, 15000);
    const depth = (await storedLooks()).length;
    await click("上一套", BACK);
    const keptPose = await until(`location.search === ${JSON.stringify(`?h=${hairA}&p=jump&e=smile`)}`, 15000);
    return [first && enabled && survived && restored && off && depth === 1 && keptPose, { first, afterRandom: afterRandom.slice(0, 40), enabled, survived, restored, off, depth, keptPose, end: await search() }];
  });

  // 14. 連按隨機
  await check("連按隨機 5 下：上一套只記舞台真的畫過的，按一次回到畫過的最後一套", async () => {
    const start = `?h=${hairA}`;
    await fresh(start);
    await settled();
    await sleep(300);
    await evaluate(RECORDER);
    for (let i = 0; i < 5; i++) {
      await click(`隨機穿搭 ${i + 1}`, RANDOM);
      await sleep(70);
    }
    await wait("連按後網址換了", `location.search !== ${JSON.stringify(start)}`, 15000);
    await settled();
    const looks = await storedLooks();
    const drawnSrcs = (await evaluate("window.__drawn")).map(s => decodeURIComponent(s));
    const hairsOf = q => new URLSearchParams(q).get("h");
    const everyDrawn = looks.every(q => { const h = hairsOf(q); return h === null || drawnSrcs.some(s => s.includes(`"itemId":${h}`)); });
    const top = looks.at(-1);
    await click("上一套", BACK);
    const back = await until(`location.search === ${JSON.stringify(top === "" ? "" : `?${top}`)}`, 15000);
    return [looks.length >= 1 && looks.length < 5 && everyDrawn && back, { looks: looks.map(q => q.slice(0, 40)), everyDrawn, back, drawnFrames: drawnSrcs.length }];
  });

  // 14 之二. 圖全部扣住連按隨機：一張都沒畫出來，只記按下去之前畫好的那一套（換穿搭不打伺服器之後，舊的「扣住網址」沒有請求可以扣，改扣圖，驗一樣的事）
  await check("圖全部扣住時連按隨機 3 下：上一套只記按之前畫好的那一套；圖放行後按一次回得去", async () => {
    const start = `?h=${hairA}`;
    await fresh(start);
    await settled();
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    let held = [], holding = true;
    try {
      return await intercepting(
        params => { if (holding) held.push(params); else pass(params); },
        async () => {
          for (let i = 0; i < 3; i++) {
            await click(`隨機穿搭 ${i + 1}`, RANDOM);
            await sleep(70);
          }
          await wait("連按後網址換了", `location.search !== ${JSON.stringify(start)}`, 15000);
          await sleep(800);
          const looks = await storedLooks();
          const pending = held.length;
          const busy = await evaluate(`${STAGE}?.getAttribute("aria-busy")`);
          holding = false;
          for (const p of held) pass(p);
          await settled();
          await click("上一套", BACK);
          const back = await until(`location.search === ${JSON.stringify(start)}`, 15000);
          const off = await until(`${BACK}.disabled`, 3000);
          return [JSON.stringify(looks) === JSON.stringify([start.slice(1)]) && pending > 0 && busy === "true" && back && off, { looks, pending, busy, back, off }];
        },
      );
    } finally {
      await page.send("Network.setCacheDisabled", { cacheDisabled: false });
    }
  });

  // 15. 鎖髮型
  await check("鎖髮型：隨機 3 次 h 都不變、鎖不進網址；按「重置」鎖解開", async () => {
    const start = `?h=${hairA}`;
    await fresh(start);
    await settled();
    await lock("hair");
    const unchanged = (await search()) === start;
    const box = await evaluate(`(() => { const r = ${LOCK("hair")}.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), nested: Boolean(${LOCK("hair")}.closest("li").querySelector("button button")) }; })()`);
    await painted();
    await evaluate(`${LOCK("hair")}.scrollIntoView({ block: "center", behavior: "instant" })`);
    await shot("avatar-locked.png");
    await setTheme("dark");
    await shot("avatar-locked-dark.png");
    await setTheme("light");
    const w = await hScroll();
    const hs = [];
    for (let i = 0; i < 3; i++) {
      await pressRandom();
      hs.push(await param("h"));
    }
    await click("重置", button(CARD, "重置"));
    const released = await until(`${LOCK("hair")}?.getAttribute("aria-pressed") === "false"`, 5000);
    const after = await stored("avatar:locks");
    return [unchanged && hs.every(h => h === String(hairA)) && released && !after && box.w >= 36 && box.h >= 44 && !box.nested && w.scrollWidth <= w.clientWidth, { unchanged, hs, released, after, box, ...w }];
  });

  // 16. 鎖了再換性別
  await check("鎖上衣、褲裙、帽子再換性別：男生限定的那兩件被換掉、鎖解開；男女都能穿的帽子鎖留著", async () => {
    if (!MALE_COAT || !MALE_PANTS || !BOTH_CAP) throw new Error("資料裡沒有男生限定的上衣、褲裙或男女都能穿的帽子");
    await fresh(LOOK);
    await settled();
    for (const k of ["cap", "coat", "pants"]) await lock(k);
    await click("性別「女」", SEGMENT("性別", "女"));
    await wait("換成女生", `new URLSearchParams(location.search).get("g") === "1"`, 15000);
    const released = await until(`${LOCK("coat")}?.getAttribute("aria-pressed") === "false" && ${LOCK("pants")}?.getAttribute("aria-pressed") === "false"`, 5000);
    const capKept = await evaluate(LOCKED("cap"));
    const locks = await stored("avatar:locks");
    return [released && capKept && locks === "cap", { released, capKept, locks }];
  });

  // 17. 鎖帽子再脫掉
  await check("鎖帽子再脫掉：鎖解開、存的也清了；重新整理前鎖還在", async () => {
    if (!BOTH_CAP) throw new Error("資料裡沒有男女都能穿的帽子");
    await fresh(LOOK);
    await settled();
    await lock("cap");
    await reload();
    await settled();
    const survived = await until(LOCKED("cap"), 8000);
    await click("脫掉帽子", `${LOCK("cap")}.closest("li").querySelector("button")`);
    const gone = await until(`!${LOCK("cap")}`, 15000);
    await sleep(300);
    const locks = await stored("avatar:locks");
    return [survived && gone && !locks, { survived, gone, locks }];
  });

  // 18. 這個分頁第一次來（沒有 avatar:last）又存著鎖：開場隨機要清掉（鎖了再回來那條路是第 34 項）
  await check("存著鎖、這個分頁沒穿過東西，開乾淨的 /plan/avatar（開場隨機）：從頭到尾沒亮過鎖、存的也清了", async () => {
    await navigate(`${BASE}/brand-emblem.png`);
    await evaluate(`(sessionStorage.clear(), sessionStorage.setItem("avatar:locks", "hair"), true)`);
    const before = await stored("avatar:locks");
    return fromDocumentStart(async () => {
      await open("");
      await wait("開場隨機", `/[?&]h=/.test(location.search)`);
      await settled();
      await sleep(500);
      const lit = await evaluate("window.__lit");
      const pressed = await evaluate(`${LOCK("hair")}?.getAttribute("aria-pressed")`);
      const locks = await stored("avatar:locks");
      return [before === "hair" && lit === 0 && pressed === "false" && !locks, { before, lit, pressed, locks }];
    });
  });

  // 19、20. 超大武器、拿槍趴下：舞台圖的不透明範圍（讀圖的像素，換算到畫面）上下左右都不超出舞台
  for (const [what, query, frames, file] of [
    [`超大武器 ${BIG_WEAPON?.n}`, `?w=${BIG_WEAPON?.id}`, 3, "avatar-weapon.png"],
    [`拿槍趴下 ${SPEAR?.n}`, `?w=${SPEAR?.id}&p=prone`, 1, "avatar-spear.png"],
  ]) {
    await check(`${what}（${query}）：不透明範圍上下左右都不超出舞台`, async () => {
      await fresh(query);
      await settled();
      // 多格的要全部載好才輪播、倍數跟地面線才算到全部格
      if (frames > 1) await wait("開始輪播", `(() => { const img = ${STAGE_IMG}; return img && !/\\/0\\?resize=/.test(img.src); })()`, 30000);
      const c = await stageClip(frames);
      await evaluate(`${CARD}.scrollIntoView({ block: "start", behavior: "instant" })`);
      await painted();
      await shot(file);
      const inside = c.frames.every(f => f.L >= 0 && f.R >= 0 && f.T >= 0 && f.B >= 0);
      return [inside, c];
    });
  }

  // 21. 跨類別搜尋（要的是分頁，不等舞台的圖：這裡不在任何一項裡面，丟錯後面的項目就都跑不到）
  const TABS = await (async () => {
    await open("?g=0");
    await wait("挑衣服卡格子", `${CELLS}.length >= 40`, 30000);
    return evaluate(`[...${PICKER}.querySelectorAll("[data-tab]")].map(b => b.dataset.tab)`);
  })();
  const GROUPS = groupsOf(WORD, TABS);
  const TOTAL = GROUPS.reduce((n, g) => n + g.n, 0);
  // 用最後一組當目前分頁：它要跳到第一個才看得出「目前分頁那類排第一」
  const CURRENT = GROUPS.at(-1)?.tab;
  await check(`搜「${WORD}」（目前分頁 ${CURRENT}）：至少兩個區頭、目前分頁那類第一、分頁都不亮、色塊藏起來；一次 40 個是全部加起來；清掉搜尋回原分頁`, async () => {
    if (GROUPS.length < 2) throw new Error(`資料裡「${WORD}」不到兩類`);
    await click(`${CURRENT} 分頁`, TAB(CURRENT));
    await typeSearch(WORD);
    const s = await pickerState();
    const order = [CURRENT, ...GROUPS.map(g => g.tab).filter(t => t !== CURRENT)];
    const wantHeads = [];
    let left = 40;
    for (const t of order) {
      if (left <= 0) break;
      const g = GROUPS.find(x => x.tab === t);
      wantHeads.push(`${g.tab}:${g.n}`);
      left -= g.n;
    }
    const w = await hScroll();
    await evaluate(`${PICKER}.scrollIntoView({ block: "start", behavior: "instant" })`);
    await painted();
    await shot("avatar-search.png");
    await click("清除搜尋", CLEAR);
    const backOn = await until(`${TAB(CURRENT)}?.getAttribute("aria-pressed") === "true"`, 5000);
    const after = await pickerState();
    const ok = s.heads.length >= 2 && JSON.stringify(s.heads) === JSON.stringify(wantHeads) && s.pressedTabs.length === 0 && s.swatches === 0
      && s.found === `找到 ${TOTAL} 件` && s.cells === Math.min(40, TOTAL) && s.more === (TOTAL > 40) && w.scrollWidth <= w.clientWidth
      && backOn && after.text === "" && after.heads.length === 0 && after.found === null;
    return [ok, { heads: s.heads, wantHeads, found: s.found, cells: s.cells, more: s.more, pressed: s.pressedTabs, backOn, after: after.pressedTabs, ...w }];
  });

  // 22. 再看 40 個
  await check("搜尋結果一次 40 個（跨類別加起來）、「再看 40 個」接著列，總數不變", async () => {
    // 這個字有 40 件以上才切得到（楓葉 66 件；資料少了就換一個）
    const word = [WORD, "帽", "造型"].find(x => groupsOf(x, TABS).reduce((n, g) => n + g.n, 0) > 40);
    if (!word) throw new Error("資料裡找不到結果超過 40 件的字");
    const total = groupsOf(word, TABS).reduce((n, g) => n + g.n, 0);
    await typeSearch(word);
    const first = await pickerState();
    await click("再看 40 個", MORE);
    await wait("多列出來", `${CELLS}.length > 40`, 5000);
    const second = await pickerState();
    const ok = first.cells === 40 && first.more && second.cells === Math.min(80, total) && second.heads.length >= first.heads.length && second.found === `找到 ${total} 件` && first.found === second.found;
    return [ok, { word, total, first: first.cells, second: second.cells, heads: second.heads }];
  });

  // 23. 搜尋時點小卡
  await check("搜尋時點穿了什麼的髮型小卡：搜尋清掉、髮型分頁亮、色塊回來（分頁本來就是髮型也一樣）", async () => {
    await click("髮型分頁", TAB("hair"));
    await typeSearch(WORD);
    const before = await pickerState();
    await click("髮型小卡", `document.querySelector("ul[aria-label='穿了什麼'] button[aria-label^='換髮型']")`);
    await wait("搜尋清掉", `(${INPUT}).value === ""`, 5000);
    const s = await pickerState();
    return [before.text === WORD && before.pressedTabs.length === 0 && s.pressedTabs.join() === "hair" && s.swatches > 0 && s.heads.length === 0 && s.found === null, { before: before.pressedTabs, after: s.pressedTabs, swatches: s.swatches, heads: s.heads.length }];
  });

  // 24. 只看商城有賣
  await check(`帽子分頁開「只看商城有賣」（${SHOP_CAPS} 件）：每格都有「樂豆點」、旁邊寫件數；切髮型分頁鈕不見`, async () => {
    await fresh("?g=0");
    await ready(40);
    const onHair = await pickerState();
    await click("帽子分頁", TAB("cap"));
    await wait("鈕出現", `${TOGGLE}?.getAttribute("aria-pressed") === "false"`, 5000);
    const off = await pickerState();
    await click("只看商城有賣", TOGGLE);
    await wait("開了", `${TOGGLE}?.getAttribute("aria-pressed") === "true"`, 5000);
    const on = await pickerState();
    const w = await hScroll();
    await evaluate(`${PICKER}.scrollIntoView({ block: "start", behavior: "instant" })`);
    await painted();
    await shot("avatar-shop.png");
    await click("髮型分頁", TAB("hair"));
    await wait("回到髮型", `${TAB("hair")}?.getAttribute("aria-pressed") === "true"`, 5000);
    const back = await pickerState();
    const ok = onHair.toggle === null && off.priced < off.cells && on.cells === Math.min(40, SHOP_CAPS) && on.priced === on.cells && on.count === `${SHOP_CAPS} 件` && back.toggle === null && back.priced === 0 && w.scrollWidth <= w.clientWidth;
    return [ok, { onHair: onHair.toggle, off: [off.priced, off.cells], on: [on.priced, on.cells, on.count], back: back.toggle, ...w }];
  });

  // 25. 下載：攔 createObjectURL 跟 a.click（不真的存檔），量拿到的那張圖。
  // 4 倍不用固定寬度驗：renderMode=0 裁到剛好包住角色，寬度看穿什麼（預設角色 1 倍 43×68、4 倍 172×272，11/04 量；舞台用的 renderMode=4 是 51×128）。
  // 改跟同一套同一格的 1 倍比，要正好 4 倍：拿到 1 倍或舞台那張都過不了。
  await check("下載：檔名 紙娃娃.png、PNG、四角透明、寬高正好是同一套 1 倍的 4 倍", async () => {
    await fresh("?g=0");
    await settled();
    await evaluate(`(() => {
      window.__dl = {};
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => { window.__dl.blob = blob; return create(blob); };
      const original = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.name = this.download; return; } return original.call(this); };
      return true;
    })()`);
    characterRequests.length = 0;
    await click("下載", button(CARD, "下載"));
    await wait("下載好", `window.__dl.name`, 20000);
    const m = await evaluate(`(async () => {
      const { blob, name } = window.__dl;
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const x = c.getContext("2d");
      x.drawImage(bmp, 0, 0);
      const alpha = (px, py) => x.getImageData(px, py, 1, 1).data[3];
      return { name, type: blob.type, size: blob.size, w: bmp.width, h: bmp.height, corners: [alpha(0, 0), alpha(bmp.width - 1, 0), alpha(0, bmp.height - 1), alpha(bmp.width - 1, bmp.height - 1)] };
    })()`);
    const requestedUrl = characterRequests.find(u => u.includes("resize=4&renderMode=0"));
    if (!requestedUrl) throw new Error("沒有要過 resize=4&renderMode=0 的圖");
    // 讀 PNG 檔頭的寬高（Node 直接問，不會碰到瀏覽器快取）
    const one = await fetch(requestedUrl.replace("resize=4&", "resize=1&"), { signal: AbortSignal.timeout(40000) });
    if (!one.ok) throw new Error(`同一套的 1 倍要不到：${one.status}`);
    const png = Buffer.from(await one.arrayBuffer());
    const base = { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
    return [m.name === "紙娃娃.png" && m.type === "image/png" && m.corners.every(a => a === 0) && m.w === base.w * 4 && m.h === base.h * 4, { ...m, base }];
  });

  // 26. 分享：攔 clipboard；連結在 Vercel、Cloudflare 都走同一支 route（快取標頭兩邊可能不同，不驗）
  await check("分享：複製的是 /api/avatar/share?…；連結的文字有 og:image、maplestory.io、noindex；開起來落在 /plan/avatar、穿了什麼一樣；HEAD、缺 h、亂改、robots", async () => {
    const start = `?h=${hairA}&w=${[JP_CAP?.id, MALE_COAT?.id, MALE_PANTS?.id].filter(Boolean).join(".")}&p=walk&e=smile`;
    await fresh(start);
    await settled();
    await until(`document.querySelectorAll("ul[aria-label='穿了什麼'] li").length >= 4`, 15000);
    const wornBefore = await worn();
    const frameBefore = await stageFrame0();
    await evaluate(`(() => { window.__copied = null; Object.defineProperty(navigator, "clipboard", { value: { writeText: async t => { window.__copied = t; } }, configurable: true }); return true; })()`);
    characterRequests.length = 0;
    await click("分享", button(CARD, "分享"));
    await wait("複製好", "window.__copied", 5000);
    await sleep(200);
    const warmed = [...characterRequests];
    const link = await evaluate("window.__copied");
    const url = new URL(link);
    const keys = ["s", "h", "f", "w"].every(k => url.searchParams.has(k));
    const toast = await until(`document.body.innerText.includes("已複製連結")`, 3000);

    const got = await fetch(link, { redirect: "manual" });
    const html = await got.text();
    const og = got.status === 200 && html.includes("og:image") && html.includes("maplestory.io") && (got.headers.get("x-robots-tag") ?? "").includes("noindex");
    // 預覽圖 6 倍（Facebook 不收 200px 以下）：比同一套的 1 倍正好 6 倍、邊長夠大；按分享時順手要的就是這張（爬蟲來才不用等它第一次畫）
    const ogUrl = (html.match(/property="og:image" content="([^"]+)"/)?.[1] ?? "").replaceAll("&amp;", "&");
    const pngSize = async u => {
      const r = await fetch(u, { signal: AbortSignal.timeout(40000) });
      if (!r.ok) throw new Error(`預覽圖要不到：${r.status}`);
      const png = Buffer.from(await r.arrayBuffer());
      return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
    };
    const ogSize = await pngSize(ogUrl);
    const ogBase = await pngSize(ogUrl.replace("resize=6&", "resize=1&"));
    const big = ogUrl.includes("resize=6&renderMode=0") && ogSize.w === ogBase.w * 6 && ogSize.h === ogBase.h * 6 && ogSize.w >= 200 && warmed.includes(ogUrl);
    const head = await fetch(link, { method: "HEAD", redirect: "manual" });
    const headBody = await head.text();
    const noHair = await fetch(`${BASE}/api/avatar/share?s=2000&f=20000`, { redirect: "manual" });
    const noHairTo = new URL(noHair.headers.get("location") ?? "/", BASE);
    const attacked = await (await fetch(`${BASE}/api/avatar/share?s=2000&h=30030&f=20000&w=%3Cscript%3Ealert(1)%3C/script%3E`, { redirect: "manual" })).text();
    const robots = await (await fetch(`${BASE}/robots.txt`)).text();

    await navigate(link);
    const landed = await until(`location.pathname === "/plan/avatar"`, 20000);
    await settled();
    await until(`document.querySelectorAll("ul[aria-label='穿了什麼'] li").length >= 4`, 15000);
    const wornAfter = await worn();
    const frameAfter = await stageFrame0();
    const landedSearch = await search();
    await painted();
    await shot("avatar-shared.png");
    const ok = url.pathname === "/api/avatar/share" && keys && toast && og && big
      && head.status === 200 && headBody === ""
      && noHair.status === 302 && noHairTo.pathname === "/plan/avatar" && noHairTo.search === "?s=2000&f=20000"
      && (attacked.match(/<script/g)?.length ?? 0) === 1 && !attacked.includes("alert(1)")
      && robots.includes("Allow: /api/avatar/share")
      && landed && JSON.stringify(wornBefore) === JSON.stringify(wornAfter) && frameBefore === frameAfter && !landedSearch.includes("j=") && !landedSearch.includes("try=");
    return [ok, { link: link.slice(0, 120), keys, toast, status: got.status, og, big, ogSize, ogBase, warmed: warmed.includes(ogUrl), head: head.status, headBody: headBody.length, noHair: [noHair.status, noHairTo.pathname + noHairTo.search], robots: robots.includes("Allow: /api/avatar/share"), landed, landedSearch: landedSearch.slice(0, 80), sameWorn: JSON.stringify(wornBefore) === JSON.stringify(wornAfter), sameFrame: frameBefore === frameAfter }];
  });

  // 27. 一般裝備也能穿上看看
  await check(`/db/items?id=${PLAIN?.id}（一般裝備 ${PLAIN?.n}）有「穿上看看」`, async () => {
    await navigate(`${BASE}/db/items?id=${PLAIN.id}`);
    const linkFinder = `[...document.querySelectorAll("a")].find(a => a.textContent.trim() === "穿上看看")`;
    const linked = await until(linkFinder, 30000);
    const href = linked ? await evaluate(`(${linkFinder}).getAttribute("href")`) : null;
    return [linked && href === `/plan/avatar?try=${PLAIN.id}`, { href }];
  });

  // 28. 首頁入口
  await check("首頁有連到紙娃娃的輪播（抽一套）", async () => {
    await navigate(`${BASE}/`);
    const linkFinder = `[...document.querySelectorAll("a[href='/plan/avatar?draw=1']")].find(a => a.offsetHeight > 0 && a.textContent.includes("抽一套"))`;
    const linked = await until(linkFinder, 30000);
    const w = await hScroll();
    return [linked && w.scrollWidth <= w.clientWidth, { linked, ...w }];
  });

  // 29. 預載：按過一次之後，舞台閒下來就先要下一套的第 0 格，下一次按直接用（不等 250ms）。
  // 不用固定秒數等：要圖第一次畫要好幾秒，Resource Timing 有那張（預載結束才有）才按，不然量到的是「還在等圖」
  await check("預載：按過一次隨機之後下一套先要好；再按：新圖在按之前就開始要、預載好的 250ms 內換上（3 輪）", async () => {
    await fresh(`?h=${hairA}`);
    await settled();
    const before = characterRequests.length;
    await sleep(1000);
    const notYet = characterRequests.slice(before).filter(u => /\/0\?resize=/.test(u)).length;
    const armAt = await evaluate("performance.now()");
    await pressRandom();
    const rounds = [];
    let since = armAt;
    let replaced = 0;
    while (rounds.length < 3) {
      const current = await stageFrame0();
      const preloadEntries = `${FRAME0_ENTRIES}.filter(e => e.name !== ${JSON.stringify(current)} && e.startTime > ${since})`;
      await wait("下一套預載結束", `${preloadEntries}.length > 0`, 60000);
      const preload = await evaluate(`(e => ({ ms: Math.round(e.responseEnd - e.startTime), status: e.responseStatus, url: e.name }))(${preloadEntries}.at(-1))`);
      if (preload.status !== 200) {
        // 太早就失敗（被擋、回錯）是有問題，不是 maplestory.io 慢
        if (preload.ms < SLOW_MS) throw earlyError("預載太早失敗", preload);
        // 真的慢（預載等 15 秒放棄，也會留一筆紀錄，狀態是 0）：這一下沒東西可驗，舞台照常自己要。再按一次換下一套，不算一輪；換太多次就沒過
        if (replaced >= PRELOAD_BUDGET) throw new Error(`預載連續放棄超過 ${PRELOAD_BUDGET} 次，這次驗不到（maplestory.io 太慢）`);
        replaced++;
        logRetry("預載", preload);
        since = await evaluate("performance.now()");
        await pressRandom();
        continue;
      }
      const m = await evaluate(`new Promise(res => {
        const img = () => ${STAGE_IMG};
        const F0 = ${FRAME0_JS};
        const startFrame = F0(img().src), startQuery = location.search;
        const pressAt = performance.now();
        let urlAt = null, swapAt = null;
        const tick = () => {
          const now = performance.now(), i = img();
          if (urlAt === null && location.search !== startQuery) urlAt = now;
          if (i && F0(i.src) !== startFrame) {
            if (swapAt === null) swapAt = now;
            if (i.complete && i.naturalWidth > 0) {
              const name = F0(i.src), entry = performance.getEntriesByName(name).at(0);
              return res({ pressAt, urlMs: urlAt === null ? null : Math.round(urlAt - pressAt), swapMs: Math.round(swapAt - pressAt), upMs: Math.round(now - pressAt), sinceUrl: urlAt === null ? null : Math.round(now - urlAt), requestStart: entry ? Math.round(entry.startTime - pressAt) : null, requestEnd: entry ? Math.round(entry.responseEnd - pressAt) : null });
            }
          }
          if (now - pressAt > 15000) return res(null);
          requestAnimationFrame(tick);
        };
        (${RANDOM}).click();
        tick();
      })`);
      if (!m) throw new Error("按了 15 秒舞台還沒換圖");
      rounds.push(m);
      since = m.pressAt;
      await settled();
    }
    const ok = notYet === 0 && rounds.length === 3 && rounds.every(r => r.requestStart !== null && r.requestStart < 0 && r.requestEnd !== null && r.requestEnd <= 0 && r.sinceUrl !== null && r.sinceUrl <= 250 && r.upMs <= 250);
    return [ok, { notYet, replaced, rounds: rounds.map(({ pressAt, ...r }) => r) }];
  });

  // 30. 換裝中，快取裡的圖
  await check("換裝中：快取裡的圖（來回切動作 4 次）完全不變淡、沒有大轉圈、字不變", async () => {
    await fresh("?p=jump");
    await settled();
    // 兩個動作先都載過，之後來回切都在快取裡
    await click("動作「坐下」", SEGMENT("動作", "坐下"));
    if (!(await drawn(`${SETTLED} && ${STAGE_IMG}.src.includes("/sit/")`))) throw new Error("等不到：坐下畫好");
    await click("動作「跳」", SEGMENT("動作", "跳"));
    if (!(await drawn(`${SETTLED} && ${STAGE_IMG}.src.includes("/jump/")`))) throw new Error("等不到：跳畫好");
    await sleep(300);
    const rounds = [];
    for (let i = 0; i < 4; i++) {
      const ev = await watchChange(SEGMENT("動作", i % 2 === 0 ? "坐下" : "跳"));
      rounds.push({ opacityWrites: ev.opacityWrites.length, spinnerAdds: ev.spinnerAdds.length, minOpacity: ev.minOpacity, busyLabel: ev.busyLabel, ariaBusyMs: ev.ariaFalse === null ? null : ev.ariaFalse - ev.ariaTrue, frames: ev.frames });
      await sleep(200);
    }
    const ok = rounds.every(r => r.opacityWrites === 0 && r.spinnerAdds === 0 && r.minOpacity === 1 && !r.busyLabel && r.ariaBusyMs !== null);
    return [ok, rounds];
  });

  // 31. 換裝中，慢的圖
  await check("換裝中（換動作，隨機的跳格見 avatar-roll-shot）：慢的圖（拖 1.2 秒）開始要圖約 150ms 後舊圖 0.45＋中間大轉圈、字變「換裝中…」還按得下去；好了全收掉", async () => {
    const measure = async () => {
      await fresh("?g=0");
      await settled();
      await sleep(300);
      await page.send("Network.setCacheDisabled", { cacheDisabled: true });
      try {
        return await intercepting(
          params => { setTimeout(() => pass(params), 1200); },
          async () => {
            const watching = watchChange(SEGMENT("動作", "坐下"));
            await sleep(1000);
            await shot("avatar-busy.png");
            return watching;
          },
        );
      } finally {
        await page.send("Network.setCacheDisabled", { cacheDisabled: false });
      }
    };
    const first = await measure();
    let ev = first;
    // 舞台寫了載不出來（img 不見了）。拖 1.2 秒遠遠不到 SLOW_MS，不會自己絆到這裡
    if (ev.endOpacity === null) {
      // 重量之前先把第一次量到的存進 results.json，真的出事才查得到
      results.slowDimFirstAttempt = first;
      saveResults();
      const waited = ev.requestStart === null || ev.ariaFalse === null ? null : ev.ariaFalse - ev.requestStart;
      const wait = waited === null ? null : { ms: waited, status: 0, url: ev.requestUrl ?? "" };
      if (!wait || wait.ms < SLOW_MS) throw earlyError("舞台太早寫「載不出來」", wait);
      // 真的慢：maplestory.io 這次沒給，量不到「好了全收掉」，開新的一頁再量一次（只一次）
      logRetry("慢的圖", wait);
      ev = await measure();
    }
    const dimAt = ev.opacityWrites.find(w => w[1] === "0.45")?.[0] ?? null;
    const spin = ev.spinnerAdds[0] ?? null;
    const sinceRequest = dimAt === null || ev.requestStart === null ? null : dimAt - ev.requestStart;
    const label = await until(`${button(CARD, "隨機穿搭")}`, 5000);
    const ok = sinceRequest !== null && sinceRequest >= 130 && sinceRequest <= 300 && ev.minOpacity === 0.45 && spin && Math.abs(spin[0] - dimAt) <= 30 && spin[1] === 32 && spin[2] === true
      && ev.busyLabel && label && ev.endOpacity === "" && !ev.endSpin;
    return [ok, { requestStart: ev.requestStart, dimAt, sinceRequest, minOpacity: ev.minOpacity, spinner: spin, busyLabel: ev.busyLabel, label, ariaFalse: ev.ariaFalse, endOpacity: ev.endOpacity, endSpin: ev.endSpin, measured: ev === first ? 1 : 2 }];
  });

  // 32. 1280 寬：左右排、沒有小窗（左邊角色卡黏著）；角色卡黏住後下緣在視窗裡（頁面在最上面時會超出，捲不到 120px 就黏住，照設計）
  await check("1280 寬：角色卡、挑衣服卡左右排；往下捲角色卡黏在上面（80px）、下緣 ≤ 視窗高；捲到底都沒有小窗", async () => {
    await viewport(1280, 900);
    await open("?g=0");
    const loaded = await ready(40);
    const layout = await evaluate(`(() => {
      const c = ${CARD}.getBoundingClientRect(), p = ${PICKER}.getBoundingClientRect();
      return { cardRight: Math.round(c.right), pickerLeft: Math.round(p.left), cardTop: Math.round(c.top), pickerTop: Math.round(p.top) };
    })()`);
    await shot("avatar-1280.png");
    await setTheme("dark");
    await shot("avatar-1280-dark.png");
    await setTheme("light");
    const at = async top => {
      await evaluate(`window.scrollTo({ top: ${top}, behavior: "instant" })`);
      await painted();
      return evaluate(`({ mini: ${MINI_SHOWN}, cardTop: Math.round(${CARD}.getBoundingClientRect().top), cardBottom: Math.round(${CARD}.getBoundingClientRect().bottom), vh: innerHeight, scrollY: Math.round(scrollY) })`);
    };
    const sticky = await at(200);
    const bottom = await at(99999);
    const sideBySide = layout.cardRight <= layout.pickerLeft && Math.abs(layout.cardTop - layout.pickerTop) <= 4;
    return [loaded && sideBySide && Math.abs(sticky.cardTop - 80) <= 1 && sticky.cardBottom <= sticky.vh && !sticky.mini && !bottom.mini, { layout, sticky, bottom }];
  });

  // 33. 1280×800 穿滿一身
  await check("1280×800 穿滿一身（10 件）：角色卡黏住後下緣 ≤ 視窗高、裡面真的要捲、捲到底最後一張小卡看得到、頁面不動", async () => {
    await viewport(1280, 800);
    const slots = ["cap", "coat", "pants", "shoes", "glove", "cape", "weapon", "eyeAcc", "faceAcc", "earrings"];
    const full = slots.map(k => data.items.find(i => i.k === k && fits(i, 0) && i.r && !i.h)?.id).filter(Boolean);
    if (full.length !== slots.length) throw new Error(`資料裡湊不滿一身：${full.length}/${slots.length} 件`);
    await open(`?w=${full.join(".")}`);
    await settled();
    await wait("穿了什麼列出來", `document.querySelectorAll("ul[aria-label='穿了什麼'] li").length >= ${full.length}`, 15000);
    await evaluate(`window.scrollTo({ top: 300, behavior: "instant" })`);
    await painted();
    const m = await evaluate(`(() => {
      const c = ${CARD}, r = c.getBoundingClientRect();
      const before = { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, overflowY: getComputedStyle(c).overflowY, scrollH: c.scrollHeight, clientH: c.clientHeight, pageY: Math.round(scrollY) };
      c.scrollTo({ top: c.scrollHeight, behavior: "instant" });
      const last = [...c.querySelectorAll("ul[aria-label='穿了什麼'] li")].at(-1).getBoundingClientRect();
      return { ...before, innerTop: Math.round(c.scrollTop), lastBottom: Math.round(last.bottom), pageAfter: Math.round(scrollY) };
    })()`);
    await painted();
    await shot("avatar-1280-full.png");
    await evaluate(`${CARD}.scrollTo({ top: 0, behavior: "instant" })`);
    // 這一身放得下就驗不到「裡面自己捲」：寫出來、算沒過，不要默默過
    const scrolls = m.scrollH > m.clientH;
    const ok = scrolls && m.innerTop > 0 && m.top === 80 && m.bottom <= m.vh && m.overflowY === "auto" && m.lastBottom <= m.vh && m.pageAfter === m.pageY;
    return [ok, { ...m, scrolls, worn: full.length, ...(scrolls ? {} : { note: "這一身在 1280×800 放得下、不用捲，驗不到裡面自己捲" }) }];
  });

  // 34～. 同一分頁回來、上一套不空按、帶 try= 清鎖、連點、不打伺服器（回到手機寬度）
  await viewport(375, 812);
  // 男生能穿的兩件不同格點裝（搜尋結果裡第一件帽子、第一件別格）
  const shopCell = k => data.items.find(i => i.k === k && fits(i, 0) && i.r && i.cash)?.id;
  const CAP_A = shopCell("cap"), GLOVE_A = shopCell("glove");

  // 34. F1 離開再回來
  await check("搭好一套、鎖髮型，回首頁再站內換到紙娃娃（乾淨網址）：第一眼就是那套（網址、舞台一樣）、鎖還在、上一套步數沒變、沒畫過也沒要過別套", async () => {
    const start = `?h=${hairA}&p=walk`;
    await fresh(start);
    await settled();
    const rolled = await pressRandom();
    await lock("hair");
    const before = { frame: await stageFrame0(), looks: await storedLooks(), last: await stored("avatar:last") };
    await evaluate(RECORDER);
    await click("頁首回首頁", `document.querySelector("a[href='/']")`);
    await wait("到首頁", `location.pathname === "/"`, 30000);
    const entry = `[...document.querySelectorAll("a[href='/plan/avatar?draw=1']")].find(a => a.offsetHeight > 0)`;
    await wait("首頁入口", entry, 30000);
    characterRequests.length = 0;
    await evaluate("(window.__drawn = [], window.__lit = 0, true)");
    await evaluate(`window.next.router.push("/plan/avatar")`); // v1.71 起首頁按鈕是 ?draw=1（抽新的），這一項要驗乾淨網址，直接換頁
    await wait("回到紙娃娃", `location.pathname === "/plan/avatar" && ${STAGE_IMG}`, 30000);
    await settled();
    await wait("鎖讀回來", LOCKED("hair"), 8000);
    await sleep(500);
    const drawnFrames = [...new Set((await evaluate("window.__drawn")).map(frame0))];
    const requested = [...new Set(characterRequests.map(frame0))];
    const after = { search: await search(), frame: await stageFrame0(), looks: await storedLooks(), locks: await stored("avatar:locks") };
    await painted();
    await shot("avatar-back-again.png");
    const ok = after.search === rolled && after.frame === before.frame && after.locks === "hair" && JSON.stringify(after.looks) === JSON.stringify(before.looks)
      && drawnFrames.every(u => u === before.frame) && drawnFrames.length === 1 && requested.every(u => u === before.frame);
    return [ok, { rolled: rolled.slice(0, 50), same: after.search === rolled, sameFrame: after.frame === before.frame, locks: after.locks, looks: after.looks.length, before: before.looks.length, drawn: drawnFrames.length, requested: requested.length, last: before.last?.slice(0, 40) }];
  });

  // 35. F1 白 T 重新整理
  await check("重置成白 T 後重新整理、再開乾淨網址：都還是白 T（網址乾淨、沒畫過別套），上一套步數沒變", async () => {
    await fresh(`?h=${hairA}`);
    await settled();
    const look = await stageFrame0();
    await click("重置", button(CARD, "重置"));
    await wait("網址變空", `location.search === ""`, 15000);
    await settled();
    await until(`${STAGE_FRAME0} !== ${JSON.stringify(look)}`, 15000);
    const white = await stageFrame0();
    await sleep(300);
    const last = await stored("avatar:last");
    const looksBefore = await storedLooks();
    const rounds = await fromDocumentStart(async () => {
      const out = [];
      for (const how of ["重新整理", "開乾淨網址"]) {
        characterRequests.length = 0;
        if (how === "重新整理") await reload();
        else await open("");
        await settled();
        await sleep(1500);
        out.push({ how, search: await search(), frame: (await stageFrame0()) === white, drawn: [...new Set((await evaluate("window.__drawn")).map(frame0))].length, requested: [...new Set(characterRequests.map(frame0))].every(u => u === white), looks: (await storedLooks()).length });
      }
      return out;
    });
    const ok = last === "" && rounds.every(r => r.search === "" && r.frame && r.drawn === 1 && r.requested && r.looks === looksBefore.length);
    return [ok, { last, looks: looksBefore.length, rounds }];
  });

  // 36. F1 從查資料進來、瀏覽器返回、前進（換穿搭不打伺服器之後：返回回到查資料、前進回到剛剛那套、捲動位置都在）
  await check(`搭好一套 L，從查資料「穿上看看」進來：上一套回得去 L；換幾套之後瀏覽器返回回到查資料（位置還在）、前進回到剛剛那套（位置還在）`, async () => {
    const start = `?h=${hairA}`;
    await fresh(start);
    await settled();
    await navigate(`${BASE}/db/items?id=${TRY}`);
    const linkFinder = `[...document.querySelectorAll("a")].find(a => a.textContent.trim() === "穿上看看")`;
    await wait("穿上看看", linkFinder, 30000);
    await evaluate(`(${linkFinder}).scrollIntoView({ block: "center", behavior: "instant" })`);
    await sleep(300);
    const dbY = await evaluate("Math.round(scrollY)");
    await click("穿上看看", linkFinder);
    await wait("換成正式寫法", `location.pathname === "/plan/avatar" && new URLSearchParams(location.search).get("w")?.includes("${TRY}")`, 30000);
    await settled();
    const looks = await storedLooks();
    const enabled = await until(`!${BACK}.disabled`, 3000);
    await click("上一套", BACK);
    const backToL = await until(`location.search === ${JSON.stringify(start)}`, 15000);
    await settled();
    // 再換兩套、捲下去，然後返回、前進
    await pressRandom();
    await pressRandom();
    const here = await search();
    const hereFrame = await stageFrame0();
    await evaluate(`window.scrollTo({ top: 400, behavior: "instant" })`);
    await sleep(600);
    const y = await evaluate("Math.round(scrollY)");
    await traverse(-1);
    const onDb = await until(`location.pathname === "/db/items" && new URLSearchParams(location.search).get("id") === "${TRY}"`, 30000);
    await sleep(800);
    const dbScroll = await evaluate("Math.round(scrollY)");
    await traverse(1);
    const onAvatar = await until(`location.pathname === "/plan/avatar" && location.search === ${JSON.stringify(here)}`, 30000);
    await settled();
    await sleep(800);
    const yBack = await evaluate("Math.round(scrollY)");
    const frameBack = await stageFrame0();
    const ok = JSON.stringify(looks) === JSON.stringify([start.slice(1)]) && enabled && backToL && onDb && onAvatar && frameBack === hereFrame && y > 0 && Math.abs(yBack - y) <= 2 && Math.abs(dbScroll - dbY) <= 2;
    return [ok, { looks, enabled, backToL, onDb, dbScroll, dbY, onAvatar, sameFrame: frameBack === hereFrame, y, yBack }];
  });

  // 37. F2 上一套不空按
  await check("上一套不空按：點帽子、圖還沒好又點一次脫掉（現在穿 A、最上面也是 A）按鈕變淡；穿上手套再來一次，按一下就回到 A", async () => {
    if (!CAP_A || !GLOVE_A) throw new Error("資料裡沒有男生能穿的點裝帽子、手套");
    const start = `?h=${hairA}`;
    await fresh(start);
    await settled();
    await click("帽子分頁", TAB("cap"));
    await wait("帽子格子", CELL(CAP_A), 5000);
    await clickTwice(CAP_A, CAP_A);
    await sleep(800);
    const first = { search: await search(), looks: await storedLooks(), off: await evaluate(`${BACK}.disabled`) };
    // 換一件手套（真的畫好），現在穿 B、歷史 [A]；再點帽子兩下：現在穿 B、歷史 [A, B]
    await click("手套分頁", TAB("glove"));
    await wait("手套格子", CELL(GLOVE_A), 5000);
    await click("穿手套", CELL(GLOVE_A));
    await wait("網址有手套", `new URLSearchParams(location.search).get("w")?.includes("${GLOVE_A}")`, 8000);
    await settled();
    const withGlove = await search();
    await click("帽子分頁", TAB("cap"));
    await wait("帽子格子", CELL(CAP_A), 5000);
    await clickTwice(CAP_A, CAP_A);
    await sleep(800);
    const second = { search: await search(), looks: await storedLooks(), on: await evaluate(`!${BACK}.disabled`) };
    await click("上一套", BACK);
    const oneStep = await until(`location.search === ${JSON.stringify(start)}`, 8000);
    const off = await until(`${BACK}.disabled`, 3000);
    const ok = first.search === start && JSON.stringify(first.looks) === JSON.stringify([start.slice(1)]) && first.off
      && second.search === withGlove && second.looks.length === 2 && second.on && oneStep && off;
    return [ok, { first, second: { same: second.search === withGlove, n: second.looks.length, on: second.on }, oneStep, off, end: await search() }];
  });

  // 38. F3 帶 try= 進來清鎖
  await check(`鎖髮型後帶 ?try=${TRY} 進來：從頭到尾沒亮過鎖、存的也清了`, async () => {
    await fresh(`?h=${hairA}`);
    await settled();
    await lock("hair");
    const before = await stored("avatar:locks");
    return fromDocumentStart(async () => {
      await open(`?try=${TRY}`);
      await wait("穿好、網址換好", `new URLSearchParams(location.search).get("w")?.includes("${TRY}")`, 30000);
      await settled();
      await sleep(500);
      const lit = await evaluate("window.__lit");
      const pressed = await evaluate(`${LOCK("hair")}?.getAttribute("aria-pressed")`);
      const locks = await stored("avatar:locks");
      return [before === "hair" && lit === 0 && pressed === "false" && !locks, { before, lit, pressed, locks }];
    });
  });

  // 39. F6 連點兩件
  await check("慢 4G＋CPU 4 倍，間隔 30ms 連點兩件不同格的衣服：兩件都穿上；沒打伺服器", async () => {
    await fresh("?g=0");
    await settled();
    await typeSearch(WORD);
    const pick = await evaluate(`(() => {
      const groups = [...${PICKER}.querySelectorAll("[data-group]")].filter(h => !["hair", "face", "skin"].includes(h.dataset.group));
      return groups.slice(0, 2).map(h => h.parentElement.querySelector("[data-cell]:not([data-missing])")?.dataset.cell).filter(Boolean);
    })()`);
    if (pick.length < 2) throw new Error(`搜「${WORD}」湊不到兩格衣服：${pick.length}`);
    const out = await throttled(async () => {
      rscRequests.length = 0;
      await clickTwice(pick[0], pick[1]);
      await until(`new URLSearchParams(location.search).has("w")`, 15000);
      // 舊版的第二下要等換網址的請求（慢 4G 要 1 秒以上）才定案，等久一點才不會量到中間
      await sleep(4000);
      const w = ((await param("w")) ?? "").split(".");
      const shown = await drawn(stageReady(Number(pick[0])), 45000);
      return { w, rsc: rscRequests.length, sample: rscRequests.slice(0, 2).map(u => u.slice(0, 100)), shown };
    });
    const wornNow = await worn();
    const names = pick.map(id => data.items.find(i => i.id === Number(id))?.n);
    await evaluate(`${CARD}.scrollIntoView({ block: "start", behavior: "instant" })`);
    await painted();
    await shot("avatar-double.png");
    return [pick.every(id => out.w.includes(id)) && names.every(n => wornNow.some(t => t.includes(n))) && out.rsc === 0, { pick, names, ...out }];
  });

  // 40. F6 換穿搭不打伺服器
  await check("換衣服、隨機、上一套、換動作、換性別、重置：一個 _rsc 請求都沒有，useSearchParams 照樣跟上（挑衣服卡的格子框著新的那件）", async () => {
    if (!CAP_A) throw new Error("資料裡沒有男生能穿的點裝帽子");
    await fresh(`?h=${hairA}`);
    await settled();
    await click("帽子分頁", TAB("cap"));
    await wait("帽子格子", CELL(CAP_A), 5000);
    rscRequests.length = 0;
    await click("穿帽子", CELL(CAP_A));
    await wait("網址有帽子", `new URLSearchParams(location.search).get("w")?.includes("${CAP_A}")`, 8000);
    const pressed = await until(`${CELL(CAP_A)}?.getAttribute("aria-pressed") === "true"`, 3000);
    await settled();
    await pressRandom();
    await click("上一套", BACK);
    await wait("回到帽子", `new URLSearchParams(location.search).get("w")?.includes("${CAP_A}")`, 8000);
    await settled();
    await click("動作「跳」", SEGMENT("動作", "跳"));
    await wait("動作換成跳", `new URLSearchParams(location.search).get("p") === "jump"`, 8000);
    await settled();
    await click("性別「女」", SEGMENT("性別", "女"));
    await wait("換成女生", `new URLSearchParams(location.search).get("g") === "1"`, 8000);
    await settled();
    await click("重置", button(CARD, "重置"));
    await wait("重置", `!new URLSearchParams(location.search).has("w")`, 8000);
    await sleep(800);
    return [pressed && rscRequests.length === 0, { pressed, rsc: rscRequests.length, sample: rscRequests.slice(0, 2).map(u => u.slice(0, 100)) }];
  });

  // 41. F7 窄手機價錢不溢出
  await check("320 寬帽子分頁開「只看商城有賣」：每格的字都在格子裡、整頁不橫捲；「樂豆點」不被拆開", async () => {
    await viewport(320, 700);
    await fresh("?g=0");
    await wait("挑衣服卡", `${CELLS}.length >= 40`, 30000);
    await click("帽子分頁", TAB("cap"));
    await wait("鈕出現", TOGGLE, 5000);
    await click("只看商城有賣", TOGGLE);
    await wait("開了", `${TOGGLE}?.getAttribute("aria-pressed") === "true"`, 5000);
    const m = await evaluate(`(() => {
      let worst = 0, split = 0, priced = 0;
      for (const c of ${CELLS}) {
        const box = c.getBoundingClientRect();
        for (const s of c.querySelectorAll("span")) {
          if (s.querySelector("img")) continue;
          const r = document.createRange();
          r.selectNodeContents(s);
          const t = r.getBoundingClientRect();
          worst = Math.max(worst, t.right - box.right, box.left - t.left);
          if (/樂豆點$/.test(s.textContent)) {
            priced++;
            // 「樂豆點」三個字要在同一行：一個字一個字量高度
            const text = s.firstChild, at = text.textContent.indexOf("樂豆點"), tops = new Set();
            for (let i = at; i < at + 3; i++) { r.setStart(text, i); r.setEnd(text, i + 1); tops.add(Math.round(r.getBoundingClientRect().top)); }
            if (tops.size > 1) split++;
          }
        }
      }
      return { worst: +worst.toFixed(1), split, priced, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
    })()`);
    await evaluate(`${PICKER}.scrollIntoView({ block: "start", behavior: "instant" })`);
    await painted();
    await shot("avatar-shop-320.png");
    await viewport(375, 812);
    return [m.priced > 0 && m.worst <= 0.5 && m.split === 0 && m.scrollWidth <= m.clientWidth, m];
  });

  // 42. 整趟
  record("整趟 console 沒有例外或錯誤", problems.exceptions.length === 0 && problems.errors.length === 0, problems);
} catch (error) {
  record("腳本中途出錯", false, String(error?.message ?? error).slice(0, 400));
  try { await shot("crash.png"); } catch { /* 頁面已經不在 */ }
} finally {
  const passed = results.checks.filter(c => c.ok).length;
  results.summary = `${passed}/${results.checks.length}`;
  saveResults();
  if (results.upstreamRetries.length) {
    console.log(`\nmaplestory.io 真的慢（等滿才放棄）${results.upstreamRetries.length} 次，重來過、不算沒過：`);
    for (const r of results.upstreamRetries) console.log(`  ${r.kind}  等了 ${r.waitMs}ms  ${r.check.slice(0, 30)}`);
  }
  if (results.earlyErrors.length) {
    console.log(`\n太早放棄 ${results.earlyErrors.length} 次（不是 maplestory.io 慢，那一項沒過）：`);
    for (const r of results.earlyErrors) console.log(`  ${r.what}  等了 ${r.waitMs ?? "查不到"}ms  狀態 ${r.status ?? "查不到"}  ${r.check.slice(0, 30)}`);
  }
  console.log(`\n${results.summary} 項通過，輸出在 ${OUT}`);
  if (close) await close();
  process.exit(passed === results.checks.length && results.checks.length > 0 ? 0 : 1);
}
