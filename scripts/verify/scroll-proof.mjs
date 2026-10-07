// 用無頭 Chrome（頁面算「看得見」，平滑捲動動畫會真的跑）量換頁與頁內捲動。
// 用法：node scroll-proof.mjs <輸出資料夾> [base=http://localhost:3029]
// 每個情境跑兩次：with＝現在的程式（<html data-scroll-behavior="smooth">），
// without＝執行中拿掉屬性（等於修正前，Next 每次換頁都是當下讀這個屬性）。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const OUT = outDir(process.argv[2], "scroll-proof");
const BASE = process.argv[3] ?? "http://localhost:3029";
const PORT = chromePort(9333);
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
  return { ws, opened, send, listeners };
}

const version = await getJSON(`http://127.0.0.1:${PORT}/json/version`);
const pageTarget = (await getJSON(`http://127.0.0.1:${PORT}/json/list`)).find(t => t.type === "page");
const browser = connect(version.webSocketDebuggerUrl);
const page = connect(pageTarget.webSocketDebuggerUrl);
await Promise.all([browser.opened, page.opened]);
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
async function shot(file) {
  const r = await page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
  return file;
}
async function viewport(kind) {
  await page.send("Emulation.setDeviceMetricsOverride", kind === "mobile"
    ? { width: 375, height: 812, deviceScaleFactor: 2, mobile: true }
    : { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
}

// 頁面裡的共用工具：等條件（MutationObserver）、逐格記 scrollY、記 Next 的捲動呼叫
const HELPERS = `
  window.__waitFor = (cond, ms) => Promise.race([
    new Promise(resolve => {
      if (cond()) return resolve("ok");
      const mo = new MutationObserver(() => { if (cond()) { mo.disconnect(); resolve("ok"); } });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    }),
    new Promise(resolve => setTimeout(() => resolve("timeout"), ms)),
  ]);
  window.__sampleFrames = ms => new Promise(res => {
    const out = []; const t0 = performance.now();
    const tick = () => { const t = performance.now() - t0; out.push([Math.round(t), Math.round(scrollY), location.pathname]); if (t < ms) requestAnimationFrame(tick); else res(out); };
    tick();
  });
  window.__calls = [];
  const html = document.documentElement;
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
  Object.defineProperty(html, "scrollTop", { configurable: true, get() { return desc.get.call(this); },
    set(v) { const before = Math.round(desc.get.call(this)); const behavior = getComputedStyle(this).scrollBehavior; desc.set.call(this, v);
      window.__calls.push({ call: "html.scrollTop = " + v, before, afterSync: Math.round(desc.get.call(this)), behavior }); } });
  const siv = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (arg) { const before = Math.round(scrollY); window.__sivTarget = this; const r = siv.call(this, arg);
    window.__calls.push({ call: "scrollIntoView(" + JSON.stringify(arg ?? null) + ")", before, afterSync: Math.round(scrollY), behavior: getComputedStyle(document.documentElement).scrollBehavior }); return r; };
`;

/** 從某頁捲到底，點頁首某一顆，逐格記換頁後 1.2 秒的 scrollY；換頁後約 0.1 秒截一張 */
async function headerNavFromBottom({ vp, withAttr, from, label, to, file }) {
  await navigate(BASE + from);
  const prep = await evaluate(`(async () => {
    ${HELPERS}
    ${withAttr ? "" : "delete document.documentElement.dataset.scrollBehavior;"}
    const ready = await __waitFor(() => document.querySelectorAll("main ul li button").length > 0, 30000);
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    await new Promise(r => setTimeout(r, 400));
    const startY = Math.round(scrollY);
    window.__frames = __sampleFrames(1600);
    [...document.querySelectorAll("header nav a")].find(a => a.textContent.trim() === ${JSON.stringify(label)}).click();
    await __waitFor(() => location.pathname === ${JSON.stringify(to)}, 15000);
    await new Promise(r => setTimeout(r, 100));
    return { ready, startY, attr: document.documentElement.dataset.scrollBehavior ?? null };
  })()`);
  const screenshot = await shot(file);
  const rest = await evaluate(`(async () => {
    const frames = await window.__frames;
    const afterNav = frames.filter(f => f[2] === ${JSON.stringify(to)});
    const h1 = document.querySelector("main h1");
    return { calls: window.__calls, firstFramesAfterNav: afterNav.slice(0, 12).map(f => f[0] + "ms:" + f[1]), endY: Math.round(scrollY),
      distinctYAfterNav: [...new Set(afterNav.map(f => f[1]))].length, computedAfter: getComputedStyle(document.documentElement).scrollBehavior,
      h1TopAtRest: h1 ? Math.round(h1.getBoundingClientRect().top) : null, headerBottom: Math.round(document.querySelector("header").getBoundingClientRect().bottom) };
  })()`);
  const endShot = await shot(file.replace(".png", "-end.png"));
  return { scenario: `${vp} ${from} 捲到底 → 頁首「${label}」`, withAttr, ...prep, ...rest, screenshot, endShot };
}

/** 道具清單點一筆，逐格記 1.5 秒的 scrollY，看是不是平滑捲到細節卡（卡片頂端應該停在導覽列下方約 80px） */
async function pickItem({ vp, withAttr, file }) {
  await navigate(BASE + "/db/items");
  const r = await evaluate(`(async () => {
    ${HELPERS}
    ${withAttr ? "" : "delete document.documentElement.dataset.scrollBehavior;"}
    await __waitFor(() => document.querySelectorAll("main ul li button").length > 0, 30000);
    window.scrollTo({ top: 0, behavior: "instant" });
    await new Promise(r => setTimeout(r, 300));
    const btn = document.querySelectorAll("main ul li button")[2];
    const name = btn.textContent.trim().slice(0, 20);
    const framesP = __sampleFrames(1800);
    btn.click();
    const frames = await framesP;
    const card = window.__sivTarget;
    const ys = frames.map(f => f[1]);
    return { picked: name, search: location.search, calls: window.__calls, startY: ys[0], endY: Math.round(scrollY),
      distinctY: [...new Set(ys)].length, midSamples: frames.filter((_, i) => i % 6 === 0).slice(0, 14).map(f => f[0] + "ms:" + f[1]),
      cardTopInViewport: card ? Math.round(card.getBoundingClientRect().top) : null,
      headerBottom: Math.round(document.querySelector("header").getBoundingClientRect().bottom),
      cardHeading: card ? card.querySelector("h2,h3")?.textContent.trim().slice(0, 20) ?? null : null,
      attr: document.documentElement.dataset.scrollBehavior ?? null };
  })()`);
  const screenshot = await shot(file);
  return { scenario: `${vp} 道具清單點第 3 筆`, withAttr, ...r, screenshot };
}

/** 首頁的「看打法」連到 /guide#pq-…（換頁＋錨點） */
async function guideAnchor({ vp, withAttr, file }) {
  await navigate(BASE + "/");
  const r = await evaluate(`(async () => {
    ${HELPERS}
    ${withAttr ? "" : "delete document.documentElement.dataset.scrollBehavior;"}
    await __waitFor(() => document.querySelector('a[href^="/guide#"]'), 30000);
    const link = document.querySelector('a[href^="/guide#"]');
    if (!link) return { skipped: "首頁沒有 /guide# 連結" };
    const href = link.getAttribute("href");
    link.scrollIntoView({ block: "center", behavior: "instant" });
    window.__calls.length = 0;
    await new Promise(r => setTimeout(r, 300));
    const startY = Math.round(scrollY);
    const framesP = __sampleFrames(1800);
    link.click();
    const frames = await framesP;
    const anchor = document.getElementById(decodeURIComponent(href.split("#")[1]));
    const after = frames.filter(f => f[2] === "/guide");
    return { href, startY, calls: window.__calls, firstFramesOnGuide: after.slice(0, 10).map(f => f[0] + "ms:" + f[1]),
      distinctYOnGuide: [...new Set(after.map(f => f[1]))].length, endY: Math.round(scrollY),
      anchorTopInViewport: anchor ? Math.round(anchor.getBoundingClientRect().top) : null,
      attr: document.documentElement.dataset.scrollBehavior ?? null };
  })()`);
  const screenshot = await shot(file);
  return { scenario: `${vp} 首頁「看打法」→ 懶人包錨點`, withAttr, ...r, screenshot };
}

const results = [];
try {
  // 先設一個合法角色：狂戰士 45（首頁會排出長長的路線）
  await viewport("mobile");
  await navigate(BASE + "/db");
  await evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: 45, job: 110 })); localStorage.setItem("ms-theme", "light"); "ok"`);
  // dev 伺服器第一次開某頁要先編譯；先每頁整頁開一次，換頁時才量得到真的動畫
  for (const route of ["/db/items", "/db", "/", "/guide"]) await navigate(BASE + route);

  for (const vp of ["mobile", "desktop"]) {
    await viewport(vp);
    for (const withAttr of [true, false]) {
      const tag = `${vp}-${withAttr ? "after" : "before"}`;
      results.push(await headerNavFromBottom({ vp, withAttr, from: "/db/items", label: "查資料", to: "/db", file: `${tag}-nav-db.png` }));
      results.push(await headerNavFromBottom({ vp, withAttr, from: "/db/items", label: "我的路線", to: "/", file: `${tag}-nav-home.png` }));
      results.push(await pickItem({ vp, withAttr, file: `${tag}-pick-item.png` }));
    }
  }
  // 「看打法」要首頁排到組隊任務：換成 21 等劍士（超綠 21–30）
  await viewport("mobile");
  await evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: 21, job: 100 })); "ok"`);
  for (const withAttr of [true, false]) {
    results.push(await guideAnchor({ vp: "mobile", withAttr, file: `mobile-${withAttr ? "after" : "before"}-guide-anchor.png` }));
  }
} catch (error) {
  results.push({ error: String(error?.stack ?? error) });
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  // Chrome 有時不回應 Browser.close 就斷線：最多等 2 秒，不然 node 會以 exit 13 提早結束、後面的結果沒寫出來
  try { await Promise.race([browser.send("Browser.close"), sleep(2000)]); } catch {}
  await sleep(500);
  try { chrome.kill(); } catch {}
}
console.log(JSON.stringify(results, null, 2));
process.exit(0);
