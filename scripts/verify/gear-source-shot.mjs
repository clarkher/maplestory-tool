// 首頁「能力值與裝備」卡跟升級路線「你在這」那一段的裝備：武器、卷軸「去哪拿」截圖＋抓字（v0.66）
// 用法：node gear-source-shot.mjs <輸出資料夾> <網址> <職業:等級,職業:等級…>
//   例：AT=2026-10-16T10:00:00+08:00 node scripts/verify/gear-source-shot.mjs out https://maplestory-tool-git-dev-clarkhers-projects.vercel.app 400:25,100:35,210:45
// 環境變數 AT：瀏覽器時鐘調到這個時間（ISO；不給就用真的時間）。拿來看 10/15 開放後的推薦（v0.61 開放後也先推舊地區）。
// 每個角色存兩張：<職業>-<等級>.png（裝備卡到武器那塊）、<職業>-<等級>-route.png（升級路線「你在這」那段的「裝備」），
// 字（主推武器、去哪拿、路線每一列）印在 console、也寫進 results.json。手機 390 寬。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const OUT = outDir(process.argv[2], "gear-source-shot");
const BASE = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const ROLES = (process.argv[4] ?? "400:25,100:35,210:45").split(",").map(pair => {
  const [job, level] = pair.split(":").map(Number);
  return { job, level };
});
const AT = process.env.AT ? Date.parse(process.env.AT) : null;
if (AT !== null && Number.isNaN(AT)) throw new Error(`AT 看不懂：${process.env.AT}（例如 2026-10-16T10:00:00+08:00）`);
const PORT = chromePort(9365);
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, "chrome-profile")}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--window-size=390,1100", "about:blank",
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
  // 每個呼叫最多等 60 秒：截圖範圍算錯（高度是負的）時 captureScreenshot 會一直不回，不設上限整支會卡死
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    const timer = setTimeout(() => { pending.delete(i); reject(new Error(`DevTools 逾時：${method}`)); }, 60000);
    pending.set(i, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { opened, send, listeners };
}

const version = await getJSON(`http://127.0.0.1:${PORT}/json/version`);
const pageTarget = (await getJSON(`http://127.0.0.1:${PORT}/json/list`)).find(t => t.type === "page");
const browser = connect(version.webSocketDebuggerUrl);
const page = connect(pageTarget.webSocketDebuggerUrl);
await Promise.all([browser.opened, page.opened]);
await page.send("Page.enable");
await page.send("Runtime.enable");
await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 1100, deviceScaleFactor: 2, mobile: true });

async function evaluate(expression) {
  const r = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result.value;
}
/** 等 load 事件，30 秒等不到就丟錯（剛開的 Chrome 停在 about:blank，再導到 about:blank 不會有 load 事件） */
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
/** 瀏覽器時鐘調到指定時間（整頁載入時從那個時間開始走）；計時器照真實時間跑（同 first-frame.mjs 的 clockAt） */
const clockAt = target => `(() => {
  const RealDate = Date;
  const offset = ${target} - RealDate.now();
  class ShiftedDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(RealDate.now() + offset); else super(...args); }
    static now() { return RealDate.now() + offset; }
  }
  globalThis.Date = ShiftedDate;
})();`;

// 頁面裡的小工具。量位置前先關掉 html 的平滑捲動，不然捲動還在播、量到的是捲到一半的位置；
// captureScreenshot 的 clip 是整頁座標，視窗座標要加上 scrollX／scrollY。
const H = `
  window.__waitFor = (cond, ms = 30000) => Promise.race([
    new Promise(resolve => {
      if (cond()) return resolve(true);
      const mo = new MutationObserver(() => { if (cond()) { mo.disconnect(); resolve(true); } });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    }),
    new Promise(resolve => setTimeout(() => resolve(false), ms)),
  ]);
  window.__card = () => document.querySelector('section[aria-label="能力值與裝備"]');
  window.__weapon = () => __card()?.querySelector('a[href^="/db/items?id="]');
  window.__jumpTo = async (el, gap) => {
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - gap, behavior: "instant" });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  };
  window.__clip = (top, bottom) => {
    const r = top.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: Math.min(bottom, innerHeight) - r.top };
  };
`;
const ev = body => evaluate(`(async () => { ${H} ${body} })()`);
async function shot(clip, file) {
  if (!(clip.height > 0)) throw new Error(`截圖範圍不對：${JSON.stringify(clip)}`);
  const r = await page.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
}

const results = [];
try {
  if (AT !== null) await page.send("Page.addScriptToEvaluateOnNewDocument", { source: clockAt(AT) });
  for (const { job, level } of ROLES) {
    const name = `${job}-${level}`;
    await navigate(BASE + "/about");
    await evaluate(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem("ms-profile", ${JSON.stringify(JSON.stringify({ level, job }))}); localStorage.setItem("ms-theme", "light"); "ok"`);
    await navigate(BASE + "/");
    const ready = await ev(`return await __waitFor(() => Boolean(__weapon()) && /會掉|合成|賣|任務/.test(__weapon().closest("div.min-w-0")?.textContent ?? ""));`);
    if (!ready) {
      results.push({ job, level, error: "裝備卡 30 秒沒出來（或沒有主推武器）" });
      console.log(`${name}\t裝備卡 30 秒沒出來（或沒有主推武器）`);
      continue;
    }
    await sleep(1500); // hydration 之後換成瀏覽器時間、卡片重算
    const card = await ev(`
      const card = __card();
      const box = __weapon().closest("div.min-w-0");
      await __jumpTo(card, 76);
      const weaponBlock = box.closest("div.flex")?.parentElement ?? box;
      return {
        weapon: __weapon().textContent.trim(),
        source: box.querySelector("span.mt-1")?.innerText.replace(/\\s+/g, " ").trim() ?? null,
        now: new Date().toISOString(),
        clip: __clip(card, weaponBlock.getBoundingClientRect().bottom + 12),
      };
    `);
    await shot(card.clip, `${name}.png`);

    // 升級路線「你在這」那一段：沒展開就點開，截「裝備」那塊
    const route = await ev(`
      const li = [...document.querySelectorAll("li")].find(el => el.querySelector("button[aria-expanded]")?.textContent.includes("你在這"));
      if (!li) return { error: "找不到「你在這」那一段" };
      const button = li.querySelector("button[aria-expanded]");
      if (button.getAttribute("aria-expanded") !== "true") button.click();
      const gearBlock = () => [...li.querySelectorAll("p")].find(p => p.textContent.startsWith("裝備"))?.parentElement;
      if (!(await __waitFor(() => Boolean(gearBlock()?.querySelector('a[href^="/db/items?id="]')), 20000))) return { error: "「裝備」那塊沒出來" };
      await new Promise(r => setTimeout(r, 800));
      const block = gearBlock();
      await __jumpTo(block, 80);
      return {
        range: button.textContent.replace(/\\s+/g, " ").trim(),
        rows: [...block.querySelectorAll("li")].map(row => row.innerText.replace(/\\s+/g, " ").trim()),
        clip: __clip(block, block.getBoundingClientRect().bottom),
      };
    `);
    if (!route.error) await shot(route.clip, `${name}-route.png`);
    results.push({ job, level, ...card, route });
    console.log(`${name}\t${card.weapon}\t${card.source}\t瀏覽器時間 ${card.now}`);
    console.log(route.error ? `  路線：${route.error}` : `  路線 ${route.range}\n    ${route.rows.join("\n    ")}`);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(`輸出：${OUT}`);
  // 同 first-frame.mjs：Chrome 有時不回應 Browser.close 就斷線，最多等 2 秒；再 taskkill 確定關掉、埠放出來，
  // 不然馬上再跑一次（同一個埠）新的 Chrome 會開不起 DevTools
  try { await Promise.race([browser.send("Browser.close"), sleep(2000)]); } catch {}
  await sleep(800);
  try { spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
  await sleep(800);
  process.exit(process.exitCode ?? 0);
}
