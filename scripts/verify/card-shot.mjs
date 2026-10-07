// 查資料頁的卡片實測：無頭 Chrome 開頁、等「屬性抗性」區塊、抓 chip 文字、截卡片（手機 390 寬＋桌機 1280 寬）。v0.43 用過
// 用法：node card-shot.mjs <輸出資料夾> <檔名前綴> <網址> [<網址> ...]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort } from "./config.mjs";

const [, , outArg, prefix, ...urls] = process.argv;
const OUT = path.resolve(outArg);
const PORT = chromePort(9347);
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
  const loaded = new Promise(res => {
    const l = m => { if (m.method === "Page.loadEventFired") { page.listeners.delete(l); res(); } };
    page.listeners.add(l);
  });
  await page.send("Page.navigate", { url });
  await loaded;
}

// 等「屬性抗性」區塊出來，回傳怪名、chip 文字、卡片（怪名到 chip 列）在頁面上的範圍
const READ_CARD = `(async () => {
  document.documentElement.style.scrollBehavior = "auto";
  const find = () => [...document.querySelectorAll("h2,h3")].find(h => h.textContent.trim() === "屬性抗性");
  await new Promise(resolve => {
    if (find()) return resolve();
    const mo = new MutationObserver(() => { if (find()) { mo.disconnect(); resolve(); } });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { mo.disconnect(); resolve(); }, 25000);
  });
  const heading = find();
  if (!heading) return { error: "找不到屬性抗性區塊", text: document.body.innerText.slice(0, 300) };
  let card = heading;
  while (card && !card.querySelector("h2")) card = card.parentElement;
  const name = card.querySelector("h2");
  const list = heading.parentElement.querySelector("ul") ?? heading.nextElementSibling;
  const chips = [...(list?.querySelectorAll("li") ?? [])].map(li => li.textContent.trim());
  // 固定在頂端的頁首會蓋住卡片，把卡片捲到頁首下面
  const stickyBottom = Math.max(0, ...[...document.querySelectorAll("body *")]
    .filter(el => ["sticky", "fixed"].includes(getComputedStyle(el).position) && el.getBoundingClientRect().top < 10)
    .map(el => el.getBoundingClientRect().bottom));
  name.scrollIntoView({ block: "start", behavior: "instant" });
  window.scrollBy(0, -(stickyBottom + 24));
  await new Promise(r => setTimeout(r, 400));
  const top = name.getBoundingClientRect().top + window.scrollY - 12;
  const bottom = list.getBoundingClientRect().bottom + window.scrollY + 12;
  const cardRect = card.getBoundingClientRect();
  return {
    monster: name.textContent.trim(),
    stickyBottom,
    chips,
    chipColors: [...(list?.querySelectorAll("li") ?? [])].map(li => getComputedStyle(li).color),
    clip: { x: Math.max(0, cardRect.left - 8), y: top, width: Math.min(cardRect.width + 16, innerWidth), height: bottom - top },
  };
})()`;

const VIEWPORTS = [
  { label: "mobile", width: 390, height: 844, mobile: true },
  { label: "desktop", width: 1280, height: 900, mobile: false },
];

const results = [];
try {
  for (const url of urls) {
    for (const vp of VIEWPORTS) {
      await page.send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: 2, mobile: vp.mobile });
      await navigate(url);
      const card = await evaluate(READ_CARD);
      const id = new URL(url).searchParams.get("id");
      const file = `${prefix}-${id}-${vp.label}.png`;
      if (card.clip) {
        const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, clip: { ...card.clip, scale: 1 } });
        fs.writeFileSync(path.join(OUT, file), Buffer.from(shot.data, "base64"));
      }
      results.push({ url, viewport: vp.label, stickyBottom: card.stickyBottom, monster: card.monster, chips: card.chips, chipColors: card.chipColors, error: card.error, file: card.clip ? file : null });
    }
  }
} finally {
  chrome.kill();
}
console.log(JSON.stringify(results, null, 2));
// Windows 上 chrome.kill() 之後 Chrome 有時還活著，DevTools 連線沒斷，不明講結束會多掛兩分鐘
process.exit(0);
