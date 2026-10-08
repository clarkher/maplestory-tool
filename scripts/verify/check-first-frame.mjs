// 自動檢查「換頁第一格」（GitHub Actions「測試 / 第一格」會跑；壞了 exit 1）。v0.68
// 用法：node scripts/verify/check-first-frame.mjs [輸出資料夾] [網址，預設 http://localhost:3000]
//
// 只看結構、不看時間（GitHub 的機器快慢不穩，時間門檻會偶發紅燈）：
//   1 首頁站內換頁：首頁 → 查資料 → 我的路線，DOM 從頭到尾只有一個狀態，而且就是完整路線（角色、主推卡、升級路線、裝備卡）
//   2 硬重新整理、存過角色：那句「你現在幾等、什麼職業？」一格都不出現（v0.54）
//   3 硬重新整理、沒存過角色：第一格就看得到那句問題
//   4 首頁主推卡「帶我去」→ /go：只有一個狀態，就是路線
//   5 查資料 → 練功地圖排行：只有一個狀態，就是排行
//   6 沒有 hydration 警告、沒有沒接住的錯誤
// 細的逐格紀錄、截圖用 home-first-frame.mjs、pages-first-frame.mjs 看。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const OUT = outDir(process.argv[2], "check-first-frame");
const BASE = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const PORT = chromePort(9400 + Math.floor(Math.random() * 400));
const BERSERKER_45 = JSON.stringify({ level: 45, job: 110 });
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// GitHub 的機器（Linux、非桌面）要關沙盒才開得起來
const extra = process.env.CI ? ["--no-sandbox", "--disable-dev-shm-usage"] : [];
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, `chrome-profile-${Date.now()}`)}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--window-size=1280,900", ...extra, "about:blank",
], { stdio: "ignore" });

async function getJSON(url) {
  for (let i = 0; i < 150; i++) {
    try { return await (await fetch(url)).json(); } catch { await sleep(200); }
  }
  throw new Error(`DevTools 沒起來：${url}（CHROME_PATH=${CHROME}）`);
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
await page.send("Log.enable");

const consoleLog = [];
page.listeners.add(m => {
  if (m.method === "Runtime.consoleAPICalled") {
    consoleLog.push({ type: m.params.type, text: m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 600) });
  } else if (m.method === "Runtime.exceptionThrown") {
    consoleLog.push({ type: "exception", text: (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 600) });
  } else if (m.method === "Log.entryAdded") {
    consoleLog.push({ type: `log:${m.params.entry.level}`, text: m.params.entry.text.slice(0, 600) });
  }
});

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
}

// 頁面裡的工具：等條件（MutationObserver）、量一次畫面、逐格記（rAF＋DOM 每次變動）
const TOOLS = `
  window.__waitFor = (cond, ms) => Promise.race([
    new Promise(resolve => {
      if (cond()) return resolve("ok");
      const mo = new MutationObserver(() => { if (cond()) { mo.disconnect(); resolve("ok"); } });
      mo.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
    }),
    new Promise(resolve => setTimeout(() => resolve("timeout"), ms)),
  ]);
  window.__probe = () => {
    const main = document.querySelector("main");
    const text = main ? main.innerText : "";
    const q = s => !!document.querySelector(s);
    return {
      path: location.pathname,
      loading: /讀取你的角色|幫你排路線|整理資料中|載入地圖資料|載入道具資料/.test(text),
      question: text.includes("你現在幾等、什麼職業"),
      character: q('section[aria-label="你的角色"]'),
      now: q('main article[aria-label="現在去這裡"]:not([aria-busy])'),
      nowSkeleton: q('main article[aria-busy="true"]'),
      route: q('section[aria-label="升級路線"]'),
      gear: q('section[aria-label="能力值與裝備"]:not([aria-busy])'),
      gearSkeleton: q('section[aria-label="能力值與裝備"][aria-busy]'),
      goRoute: q('section[aria-label="路線"] ol li'),
      items: main ? main.querySelectorAll("li").length : 0,
    };
  };
  window.__record = ms => new Promise(resolve => {
    const frames = []; const dom = []; let last = ""; const t0 = performance.now();
    const keep = list => { const p = __probe(); const s = JSON.stringify({ ...p, items: Math.min(p.items, 1) }); if (s !== last) { last = s; list.push({ t: Math.round(performance.now() - t0), ...p }); } };
    const mo = new MutationObserver(() => keep(dom));
    mo.observe(document, { childList: true, subtree: true, characterData: true, attributes: true });
    const tick = () => { frames.push({ t: Math.round(performance.now() - t0), ...__probe() }); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else { mo.disconnect(); resolve({ frames, dom }); } };
    requestAnimationFrame(tick);
  });
`;
const waitFor = (cond, ms = 30000) => evaluate(`(async () => { ${TOOLS} return await __waitFor(${cond}, ${ms}); })()`);
const homeReady = `() => document.querySelector('section[aria-label="升級路線"]') && document.querySelector('section[aria-label="能力值與裝備"]:not([aria-busy])') && !document.querySelector('main article[aria-busy="true"]')`;
const clickNav = label => `[...document.querySelectorAll("header nav a")].find(a => a.textContent.trim() === ${JSON.stringify(label)}).click()`;

/** 站內換頁：在頁面裡點，逐格記，回傳換到 to 之後 DOM 的每個不同狀態（items 只看有沒有） */
async function navStates(click, to, ms = 4000) {
  const rec = await evaluate(`(async () => { ${TOOLS} const p = __record(${ms}); ${click}; return await p; })()`);
  return rec.dom.filter(d => d.path === to);
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      ${JSON.stringify(detail)}`}`);
}
async function guard(name, fn) {
  try { await fn(); } catch (error) { check(name, false, { error: String(error?.message ?? error).slice(0, 400) }); }
}

try {
  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await navigate(BASE + "/db");
  await evaluate(`localStorage.setItem("ms-theme", "light"); localStorage.setItem("ms-profile", ${JSON.stringify(BERSERKER_45)}); "ok"`);

  await guard("1 首頁站內換頁第一格就是完整路線", async () => {
    await navigate(BASE + "/");
    if ((await waitFor(homeReady)) !== "ok") throw new Error("首頁 30 秒內沒排好路線");
    await evaluate(clickNav("查資料"));
    await waitFor(`() => location.pathname === "/db" && document.querySelector('main a[href="/plan/train"]')`);
    await sleep(600);
    const states = await navStates(clickNav("我的路線"), "/");
    const first = states[0];
    const complete = first && first.character && first.now && !first.nowSkeleton && first.route && first.gear && !first.gearSkeleton && !first.loading;
    check("1 首頁站內換頁第一格就是完整路線", states.length === 1 && complete, { states });
    await shot("1-home.png");
  });

  await guard("4 首頁「帶我去」→ /go 第一格就是路線", async () => {
    await waitFor(homeReady);
    const states = await navStates(`document.querySelector('main article[aria-label="現在去這裡"] a[href^="/go?to="]').click()`, "/go");
    check("4 首頁「帶我去」→ /go 第一格就是路線", states.length === 1 && states[0].goRoute && !states[0].loading, { states });
  });

  await guard("5 查資料 → 練功地圖排行第一格就是結果", async () => {
    await evaluate(clickNav("查資料"));
    await waitFor(`() => location.pathname === "/db" && document.querySelector('main a[href="/plan/train"]')`);
    await sleep(600);
    const states = await navStates(`document.querySelector('main a[href="/plan/train"]').click()`, "/plan/train");
    check("5 查資料 → 練功地圖排行第一格就是結果", states.length === 1 && states[0].items > 0 && !states[0].loading, { states });
  });

  await guard("2 硬重新整理、存過角色：不問「你現在幾等、什麼職業？」", async () => {
    const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `${TOOLS}; window.__rec = __record(5000);` });
    await navigate(BASE + "/");
    const rec = await evaluate("window.__rec");
    await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    const asked = rec.frames.filter(f => f.path === "/" && f.question).length + rec.dom.filter(d => d.path === "/" && d.question).length;
    const showed = rec.frames.some(f => f.character);
    check("2 硬重新整理、存過角色：不問「你現在幾等、什麼職業？」", asked === 0 && showed, { asked, showedCharacter: showed });
  });

  await guard("3 硬重新整理、沒存過角色：第一格就看得到那句問題", async () => {
    await evaluate(`localStorage.removeItem("ms-profile"); "ok"`);
    const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `${TOOLS}; window.__rec = __record(3000);` });
    await navigate(BASE + "/");
    const rec = await evaluate("window.__rec");
    await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    await evaluate(`localStorage.setItem("ms-profile", ${JSON.stringify(BERSERKER_45)}); "ok"`);
    const first = rec.frames.find(f => f.path === "/" && (f.question || f.loading || f.character));
    check("3 硬重新整理、沒存過角色：第一格就看得到那句問題", Boolean(first?.question), { firstFrame: first ?? null });
  });

  const hydration = consoleLog.filter(c => /hydrat|#418|#423|#425|did not match|server rendered/i.test(c.text));
  const exceptions = consoleLog.filter(c => c.type === "exception");
  check("6 沒有 hydration 警告、沒有沒接住的錯誤", hydration.length === 0 && exceptions.length === 0, { hydration, exceptions });
} catch (error) {
  check("（整支跑不完）", false, { error: String(error?.stack ?? error).slice(0, 600) });
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ base: BASE, checks, console: consoleLog }, null, 2));
  // Chrome 有時不回應 Browser.close 就斷線：最多等 2 秒，不然 node 會以 exit 13 提早結束、後面的結果沒寫出來
  try { await Promise.race([browser.send("Browser.close"), sleep(2000)]); } catch {}
  await sleep(500);
  try { chrome.kill(); } catch {}
}
const failed = checks.filter(c => !c.ok);
console.log(failed.length ? `\n${failed.length} 項沒過（細節：${path.join(OUT, "results.json")}）` : `\n全部 ${checks.length} 項都過`);
process.exit(failed.length ? 1 : 0);
