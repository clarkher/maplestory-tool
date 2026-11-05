// 初心者選職業：首頁「先解」的「有關轉職的指導」跟五條路「5 選 1」截圖＋抓字（v1.65）
// 用法：node job-road-shot.mjs <輸出資料夾> <網址> <等級,等級…>
//   例：node scripts/verify/job-road-shot.mjs out https://maplehelper-dev.pipicards.workers.dev 8,9,10,12
// 每個等級存兩張：Lv<等級>.png（先解整塊）、Lv<等級>-detail.png（展開 5 選 1 的細節）。
// 字（每一行的標題跟經驗那行、細節列出的選項）印在 console、也寫進 results.json。手機 375 寬。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const OUT = outDir(process.argv[2], "job-road-shot");
const BASE = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const LEVELS = (process.argv[4] ?? "8,9,10,12").split(",").map(Number);
const PORT = chromePort(9507);
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, "chrome-profile")}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--window-size=375,1400", "about:blank",
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
    const timer = setTimeout(() => { pending.delete(i); reject(new Error(`DevTools 逾時：${method}`)); }, 60000);
    pending.set(i, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { opened, send, listeners };
}

const pageTarget = (await getJSON(`http://127.0.0.1:${PORT}/json/list`)).find(t => t.type === "page");
const page = connect(pageTarget.webSocketDebuggerUrl);
await page.opened;
await page.send("Page.enable");
await page.send("Runtime.enable");
await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 1400, deviceScaleFactor: 2, mobile: true });

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

// 頁面裡的小工具。量位置前先關掉 html 的平滑捲動；captureScreenshot 的 clip 是整頁座標
const H = `
  window.__waitFor = (cond, ms = 30000) => Promise.race([
    new Promise(resolve => {
      if (cond()) return resolve(true);
      const mo = new MutationObserver(() => { if (cond()) { mo.disconnect(); resolve(true); } });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    }),
    new Promise(resolve => setTimeout(() => resolve(false), ms)),
  ]);
  window.__todo = () => document.querySelector('section[aria-label="先解"]');
  window.__pick = () => [...(__todo()?.querySelectorAll("li") ?? [])].find(li => li.textContent.includes("選 1"));
  window.__clip = el => {
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 8, behavior: "instant" });
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
  };
`;
const ev = body => evaluate(`(async () => { ${H} ${body} })()`);
async function shot(clip, file) {
  if (!(clip?.height > 0)) throw new Error(`截圖範圍不對：${JSON.stringify(clip)}`);
  await sleep(150);
  const r = await page.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: true });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
}

const results = [];
try {
  for (const level of LEVELS) {
    await navigate(BASE + "/about");
    await evaluate(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem("ms-profile", ${JSON.stringify(JSON.stringify({ level, job: 0 }))}); localStorage.setItem("ms-theme", "light"); "ok"`);
    await navigate(BASE + "/");
    const ready = await ev(`return await __waitFor(() => Boolean(__pick()));`);
    if (!ready) throw new Error(`Lv.${level} 等不到「選 1」那一行：${(await ev(`return __todo()?.textContent ?? "沒有先解"`)).slice(0, 300)}`);
    const rows = await ev(`return [...__todo().querySelectorAll("ul > li")].map(li => li.innerText.split("\\n").slice(0, 2).join(" | "));`);
    await shot(await ev(`return __clip(__todo());`), `Lv${level}.png`);
    const choices = await ev(`
      const pick = __pick();
      [...pick.querySelectorAll("button")].find(button => button.textContent.includes("看細節")).click();
      await __waitFor(() => pick.querySelectorAll("ol > li").length > 0, 5000);
      return [...pick.querySelectorAll("ol > li")].map(li => li.innerText.split("\\n")[0]);
    `);
    await shot(await ev(`return __clip(__pick());`), `Lv${level}-detail.png`);
    const overflow = await ev(`return document.documentElement.scrollWidth > innerWidth;`);
    results.push({ level, rows, choices, overflow });
    console.log(`Lv.${level}`, JSON.stringify({ rows, choices, overflow }));
  }
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(`輸出：${OUT}`);
} finally {
  chrome.kill();
}
