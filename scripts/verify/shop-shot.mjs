// 道具卡「哪裡買得到」實測：無頭 Chrome 開道具卡、抓那一塊的文字、截圖（手機 390／桌機 1280 × 白天／夜晚）。v1.15 用過
// 用法：node shop-shot.mjs <輸出資料夾> <檔名前綴> <網址> [<網址> ...]
//   網址要帶 ?id=，例如 http://localhost:3417/db/items?id=2022000
//   AT=2026-11-12T00:00:00+08:00 把瀏覽器時鐘調到那個時間（看活動店過期後自己不列）
//   CHROME_PORT 換埠（預設 9389）
// 輸出：<前綴>-<id>-<mobile|desktop>-<light|dark>.png；console 印 JSON（每格的文字、有沒有這一塊）
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort } from "./config.mjs";

const [, , outArg, prefix, ...urls] = process.argv;
const OUT = path.resolve(outArg);
const PORT = chromePort(9389);
const AT = process.env.AT ? Date.parse(process.env.AT) : null;
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, "chrome-profile")}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--window-size=1280,900", "about:blank",
], { stdio: "ignore" });

async function getJSON(url) {
  for (let i = 0; i < 100; i++) {
    try { return await (await fetch(url)).json(); } catch { await sleep(200); }
  }
  throw new Error(`DevTools 沒起來：${url}`);
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) for (const l of listeners) l(msg);
  });
  const opened = new Promise(r => ws.addEventListener("open", r));
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { opened, send, listeners };
}

const pageTarget = (await getJSON(`http://127.0.0.1:${PORT}/json/list`)).find(t => t.type === "page");
const page = connect(pageTarget.webSocketDebuggerUrl);
await page.opened;
await page.send("Page.enable");
await page.send("Runtime.enable");

async function evaluate(expression) {
  const r = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result.value;
}
async function navigate(url) {
  let listener;
  const loaded = new Promise(res => {
    listener = m => { if (m.method === "Page.loadEventFired") res(true); };
    page.listeners.add(listener);
  });
  await page.send("Page.navigate", { url });
  const ok = await Promise.race([loaded, sleep(30000).then(() => false)]);
  page.listeners.delete(listener);
  if (!ok) throw new Error(`載入逾時：${url}`);
}
/** 瀏覽器時鐘調到指定時間（整頁載入時從那個時間開始走）；計時器照真實時間跑。跟 gear-source-shot 同一套 */
const clockAt = target => `(() => {
  const RealDate = Date;
  const offset = ${target} - RealDate.now();
  class ShiftedDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(RealDate.now() + offset); else super(...args); }
    static now() { return RealDate.now() + offset; }
  }
  globalThis.Date = ShiftedDate;
})();`;

// 等道具名出來（資料載完），再找「哪裡買得到」：有就回文字跟截圖範圍，沒有就回 found: false（活動過期、只有活動店的道具）
const READ_SHOPS = `(async () => {
  document.documentElement.style.scrollBehavior = "auto";
  const name = () => document.querySelector("h2");
  await new Promise(resolve => {
    if (name()) return resolve();
    const mo = new MutationObserver(() => { if (name()) { mo.disconnect(); resolve(); } });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { mo.disconnect(); resolve(); }, 25000);
  });
  await new Promise(r => setTimeout(r, 500));
  const item = name()?.textContent.trim();
  const heading = [...document.querySelectorAll("h3")].find(h => h.firstChild?.textContent?.trim() === "哪裡買得到");
  if (!heading) return { item, found: false };
  const section = heading.closest("section");
  // 固定的頁首、長卡片頂端黏著的「收起」列會蓋住這一塊：先捲過去讓它們黏上，再量它們的底、往回捲到它們下面
  section.scrollIntoView({ block: "start", behavior: "instant" });
  await new Promise(r => setTimeout(r, 200));
  const stickyBottom = Math.max(0, ...[...document.querySelectorAll("body *")]
    .filter(el => ["sticky", "fixed"].includes(getComputedStyle(el).position))
    .map(el => el.getBoundingClientRect())
    .filter(box => box.top < 200 && box.height > 0 && box.height < 200)
    .map(box => box.bottom));
  window.scrollBy(0, -(stickyBottom + 24));
  await new Promise(r => setTimeout(r, 400));
  const rect = section.getBoundingClientRect();
  return {
    item,
    found: true,
    text: section.innerText.split("\\n").map(line => line.trim()).filter(Boolean),
    clip: { x: Math.max(0, rect.left - 12), y: rect.top + window.scrollY - 12, width: Math.min(rect.width + 24, innerWidth), height: rect.height + 24 },
  };
})()`;

const VIEWPORTS = [
  { label: "mobile", width: 390, height: 844, mobile: true },
  { label: "desktop", width: 1280, height: 900, mobile: false },
];
const THEMES = ["light", "dark"];

const results = [];
try {
  if (AT !== null) await page.send("Page.addScriptToEvaluateOnNewDocument", { source: clockAt(AT) });
  for (const theme of THEMES) {
    const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem("ms-theme", ${JSON.stringify(theme)}); } catch {}`,
    });
    for (const url of urls) {
      for (const vp of VIEWPORTS) {
        await page.send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: 2, mobile: vp.mobile });
        await navigate(url);
        const shops = await evaluate(READ_SHOPS);
        const id = new URL(url).searchParams.get("id");
        const file = `${prefix}-${id}-${vp.label}-${theme}.png`;
        if (shops.clip) {
          const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, clip: { ...shops.clip, scale: 1 } });
          fs.writeFileSync(path.join(OUT, file), Buffer.from(shot.data, "base64"));
        }
        results.push({ url, viewport: vp.label, theme, item: shops.item, found: shops.found, text: shops.text, file: shops.clip ? file : null });
      }
    }
    await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  }
} finally {
  chrome.kill();
}
console.log(JSON.stringify({ at: AT === null ? null : new Date(AT).toISOString(), results }, null, 2));
// Windows 上 chrome.kill() 之後 Chrome 有時還活著，DevTools 連線沒斷，不明講結束會多掛兩分鐘
process.exit(0);
