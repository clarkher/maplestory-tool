// 傷害計算機（/plan/damage，v0.79）截圖＋抓字：各角色整頁、點一隻怪的底部小卡、看細節展開、夜晚、360 寬
// 用法：node scripts/verify/damage-shot.mjs <輸出資料夾> <網址> [職業:等級,…]
//   例：node scripts/verify/damage-shot.mjs out http://localhost:3217
//   預設 4 個：刺客 50、火毒巫師 40、狂戰士 50、槍手 60
// 輸出：<職業>-<等級>.png（手機 390 整頁）、<職業>-<等級>-sheet.png（點一下打死第一隻的小卡）、
//       <職業>-<等級>-details.png（看細節展開）、410-50-dark.png、410-50-360.png、results.json（結果卡、名單數、細節表的字）
// 環境變數 WIDTH 改寬度（預設 390）。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const OUT = outDir(process.argv[2], "damage-shot");
const BASE = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const ROLES = (process.argv[4] ?? "410:50,210:40,110:50,520:60").split(",").map(entry => entry.split(":").map(Number));
const WIDTH = Number(process.env.WIDTH ?? 390);
const PORT = chromePort(9383);
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, "chrome-profile")}`, "--no-first-run", "--hide-scrollbars", `--window-size=${WIDTH},900`, "about:blank"], { stdio: "ignore" });

async function getJSON(url) {
  for (let i = 0; i < 100; i++) {
    try { return await (await fetch(url)).json(); } catch { await sleep(200); }
  }
  throw new Error(`DevTools 沒起來：${url}`);
}

const page = (await getJSON(`http://127.0.0.1:${PORT}/json`)).find(entry => entry.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const events = [];
const problems = []; // 整趟 console 的錯誤、警告（hydration 警告、沒接住的錯誤會在這）；events 每次換頁會清掉，所以另外存
ws.addEventListener("message", ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else if (msg.method) {
    events.push(msg);
    if (msg.method === "Runtime.exceptionThrown") problems.push(String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text).slice(0, 300));
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) problems.push(`${msg.params.type}: ${msg.params.args.map(arg => arg.value ?? arg.description).join(" ")}`.slice(0, 300));
  }
});
await new Promise(resolve => ws.addEventListener("open", resolve));
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`DevTools 逾時：${method}`)); }, 120000);
  pending.set(id, msg => { clearTimeout(timer); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
// 沒有 Page.enable 就收不到 Page.loadEventFired，每次換頁都會一路等到逾時
await send("Page.enable");
await send("Runtime.enable");

/** 等 Page.loadEventFired（本機 dev 第一次編譯可能很久，最多等 2 分鐘） */
async function loaded() {
  for (let i = 0; i < 1200 && !events.some(e => e.method === "Page.loadEventFired"); i++) await sleep(100);
}

/** 條件成立才往下走，最多等 ms（預設 90 秒） */
async function until(expression, ms = 90000) {
  for (let t = 0; t < ms; t += 100) {
    if (await evaluate(expression)) return true;
    await sleep(100);
  }
  return false;
}

async function open(url, profile, dark = false, width = WIDTH) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 2, mobile: width < 768 });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
  // 先開同網域的圖片（不用編譯整頁）清掉上一個角色，放進這個角色
  events.length = 0;
  await send("Page.navigate", { url: `${BASE}/brand-emblem.png` });
  await loaded();
  await evaluate(`localStorage.setItem("ms-profile", ${JSON.stringify(JSON.stringify(profile))}); sessionStorage.clear(); true`);
  events.length = 0;
  await send("Page.navigate", { url });
  await loaded();
  // 等結果卡出現（資料載完）
  await until(`Boolean(document.querySelector('section[aria-label="結果"]'))`);
  await evaluate(`document.documentElement.style.scrollBehavior = "auto"; true`);
  await sleep(800);
}

async function shot(file, width = WIDTH) {
  const height = await evaluate(`Math.ceil(document.documentElement.scrollHeight)`);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: width < 768 });
  await sleep(500);
  const image = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height, scale: 1 } });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(image.data, "base64"));
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 2, mobile: width < 768 });
}

const results = {};
try {
  for (const [job, level] of ROLES) {
    const key = `${job}-${level}`;
    await open(`${BASE}/plan/damage`, { level, job });
    await shot(`${key}.png`);
    results[key] = await evaluate(`({
      result: document.querySelector('section[aria-label="結果"]')?.innerText,
      kills: [...document.querySelectorAll('section[aria-label="一下、兩下打死的怪"] h3')].map(h => h.innerText),
      shared: [...document.querySelectorAll('section[aria-label="共用設定"] select')].map(s => s.selectedOptions[0]?.text),
    })`);
    // 點細節：看細節是受控的 <details>（記在瀏覽紀錄上），要真的點 summary 讓 React 知道，不能直接改 open
    await evaluate(`(() => { const d = document.querySelector('section[aria-label="結果"] details'); if (d && !d.open) d.querySelector("summary").click(); return true; })()`);
    results[key].detailsOpen = await until(`Boolean(document.querySelector('section[aria-label="結果"] details[open] table'))`, 10000);
    await sleep(300);
    results[key].details = await evaluate(`document.querySelector('section[aria-label="結果"] table')?.innerText`);
    await shot(`${key}-details.png`);
    // 點一下打死的第一隻
    const clicked = await evaluate(`(() => { const b = document.querySelector('section[aria-label="一下、兩下打死的怪"] button[aria-label]'); if (!b) return null; b.click(); return b.getAttribute("aria-label"); })()`);
    await sleep(400);
    results[key].sheet = clicked ? await evaluate(`document.querySelector('[role="dialog"]')?.innerText`) : null;
    if (clicked) await shot(`${key}-sheet.png`);
  }
  await open(`${BASE}/plan/damage`, { level: 50, job: 410 }, true);
  await shot("410-50-dark.png");
  await open(`${BASE}/plan/damage`, { level: 50, job: 410 }, false, 360);
  await shot("410-50-360.png", 360);
  results.overflow360 = await evaluate(`document.documentElement.scrollWidth > window.innerWidth`);
  results.consoleProblems = problems;
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  // Browser.close 設等待上限，Windows 上 chrome.kill() 之後 Chrome 常還活著，再用 taskkill 收乾淨
  try { await Promise.race([send("Browser.close"), sleep(2000)]); } catch {}
  ws.close();
  chrome.kill();
  try { spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
}
console.log(`輸出：${OUT}`);
process.exit(0);
