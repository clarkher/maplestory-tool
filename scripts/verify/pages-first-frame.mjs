// 量 /go、/plan 四頁「站內換頁」的第一個畫面，跟打開「換其他職業」後點職業會不會出骨架（v0.45）。
// 無頭 Chrome（頁面算看得見，rAF 會跑）＋DevTools 協定。
// 用法：node scripts/verify/pages-first-frame.mjs <輸出資料夾> <網址>    （ONLY=P1,P7 只跑某幾個情境）
//
// 情境（角色狂戰士 45、375×812）：
//   P1 首頁主推卡「帶我去」→ /go：第一格就有路線，不先畫「載入地圖資料…」
//   P2 查資料 → 練功地圖排行：第一格就有排行
//   P3 查資料 → 現在能接的任務：第一格就有任務
//   P4 任務打包（第二次進，打寶資料這次瀏覽載過）：第一格就有結果
//   P5 道具頁「這個去哪打」→ /plan/farm?want=…（道具、打寶資料載過）：第一格就勾好、排好地圖
//   P6 /go 目的地是城鎮、上次自己選過起點：第一格就從那個起點排路線，不先問「從哪裡出發」
//   P7 首頁打開「換其他職業」→ 等一下 → 點法師：主推卡不出骨架；記錄打開後在背景載了哪些攻略
//   P8 同 P2，CPU 慢 6 倍；PQ4／PQ6 任務頁 CPU 慢 4／6 倍；PF6 打寶頁 CPU 慢 6 倍
//   P9 從捲到底的長頁換到練功排行、/go：要回到頂端
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const OUT = outDir(process.argv[2], "pages-first-frame");
const BASE = (process.argv[3] ?? "http://localhost:3134").replace(/\/$/, "");
const PORT = chromePort(9400 + Math.floor(Math.random() * 400));
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, `chrome-profile-${Date.now()}`)}`,
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
await page.send("Log.enable");
await page.send("Network.enable");
// 攻略檔什麼時候被請求（P7：打開「換其他職業」後在背景先載了哪些）
const guideRequests = [];
page.listeners.add(m => {
  if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/data/guides/")) {
    guideRequests.push({ at: Date.now(), file: m.params.request.url.split("/data/guides/")[1].split("?")[0] });
  }
});

const consoleLog = [];
let scenarioName = "setup";
page.listeners.add(m => {
  if (m.method === "Runtime.consoleAPICalled") {
    consoleLog.push({ scenario: scenarioName, type: m.params.type, text: m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 600) });
  } else if (m.method === "Runtime.exceptionThrown") {
    consoleLog.push({ scenario: scenarioName, type: "exception", text: (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 600) });
  } else if (m.method === "Log.entryAdded") {
    consoleLog.push({ scenario: scenarioName, type: `log:${m.params.entry.level}`, text: m.params.entry.text.slice(0, 600) });
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
  return file;
}

// 頁面裡的工具：等條件、每一格量一次（rAF＝畫出來前；MutationObserver＝DOM 每次變動）
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
    const q = s => document.querySelector(s);
    return {
      path: location.pathname + location.search,
      y: Math.round(scrollY),
      h: document.documentElement ? document.documentElement.scrollHeight : 0,
      loading: /整理資料中|載入道具資料|載入地圖資料|讀取你的角色|幫你排路線/.test(text),
      level: q('main input[aria-label="你的等級"]')?.value ?? null,
      items: main ? main.querySelectorAll("li").length : 0,
      route: !!q('section[aria-label="路線"] ol li'),
      ask: /先選一個起點|從哪裡出發？/.test(text) && !q('section[aria-label="路線"]'),
      start: q('input[aria-label="從哪裡出發"]')?.value ?? null,
      picked: (text.match(/已選 (\\d+) 樣/) ?? [])[1] ?? null,
      nowSkeleton: !!q('main article[aria-busy="true"]'),
      nowTitle: q('main article[aria-label="現在去這裡"]:not([aria-busy]) h2')?.textContent.trim() ?? null,
      who: q('section[aria-label="你的角色"] .text-xl')?.textContent.trim() ?? null,
    };
  };
  window.__record = ms => new Promise(resolve => {
    const frames = []; const dom = []; const t0 = performance.now(); let last = "";
    const mo = new MutationObserver(() => {
      const p = __probe(); const s = JSON.stringify({ ...p, y: 0 });
      if (s !== last) { last = s; dom.push({ t: Math.round(performance.now() - t0), ...p }); }
    });
    mo.observe(document, { childList: true, subtree: true, characterData: true, attributes: true });
    const tick = () => {
      const t = performance.now() - t0;
      frames.push({ t: Math.round(t), ...__probe() });
      if (t < ms) requestAnimationFrame(tick); else { mo.disconnect(); resolve({ frames, dom }); }
    };
    requestAnimationFrame(tick);
  });
  // Next 的站內換頁（跟點 <Link> 一樣不整頁重載）
  window.__push = href => {
    if (window.next?.router?.push) { window.next.router.push(href); return "router"; }
    return "no-router";
  };
`;

async function waitFor(cond, ms = 30000) {
  return evaluate(`(async () => { ${TOOLS} return await __waitFor(${cond}, ${ms}); })()`);
}

/** 只留跟上一格不一樣的狀態（不看時間、捲動位置） */
function squash(list, keys) {
  const out = [];
  for (const f of list) {
    const s = Object.fromEntries(keys.map(k => [k, f[k]]));
    const sig = JSON.stringify(s);
    if (!out.length || out.at(-1).sig !== sig) out.push({ t: f.t, ...s, sig });
  }
  return out.map(({ sig, ...x }) => x);
}

/** 換頁（action 是在頁面裡執行、回傳任何值的一段程式），逐格記 ms 毫秒，只看路徑開頭是 to 的那幾格 */
async function measure({ action, to, ms = 2500, keys }) {
  const how = await evaluate(`(() => { ${TOOLS} window.__rec = __record(${ms}); return (${action})(); })()`);
  const rec = await evaluate("window.__rec");
  const on = list => list.filter(f => f.path.startsWith(to));
  return {
    how,
    painted: squash(on(rec.frames), keys),
    dom: squash(on(rec.dom), keys),
    heights: [...new Set(on(rec.frames).map(f => f.h))],
    endY: on(rec.frames).at(-1)?.y ?? null,
  };
}

const clickNav = label => `() => { [...document.querySelectorAll("header nav a")].find(a => a.textContent.trim() === ${JSON.stringify(label)}).click(); return "nav"; }`;
const clickSel = sel => `() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return "沒有 " + ${JSON.stringify(sel)}; el.click(); return "click"; }`;
const push = href => `() => __push(${JSON.stringify(href)})`;
const homeReady = `() => document.querySelector('section[aria-label="升級路線"]') && document.querySelector('section[aria-label="能力值與裝備"]:not([aria-busy])') && !document.querySelector('main article[aria-busy="true"]')`;
const PLAN_KEYS = ["loading", "level", "items", "h"];

async function gotoDbFromHome() {
  await navigate(BASE + "/");
  await waitFor(homeReady);
  await sleep(800);
  await evaluate(`(${clickNav("查資料")})()`);
  await waitFor(`() => location.pathname === "/db" && document.querySelector('main a[href="/plan/train"]')`);
  await sleep(500);
}

const results = {};
async function scenario(name, fn) {
  if (ONLY.length && !ONLY.some(prefix => name.startsWith(prefix))) return;
  scenarioName = name;
  try {
    results[name] = await fn();
  } catch (error) {
    results[name] = { error: String(error?.stack ?? error) };
  }
}

try {
  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await navigate(BASE + "/db");
  await evaluate(`localStorage.setItem("ms-theme", "light"); localStorage.setItem("ms-profile", JSON.stringify({ level: 45, job: 110 })); localStorage.removeItem("ms-go-start"); "ok"`);

  await scenario("P1 首頁「帶我去」→ /go", async () => {
    await navigate(BASE + "/");
    await waitFor(homeReady);
    await sleep(800);
    const r = await measure({ action: clickSel('main article[aria-label="現在去這裡"] a[href^="/go?to="]'), to: "/go", keys: ["loading", "route", "ask", "start", "h"] });
    return { ...r, shot: await shot("P1-go.png") };
  });

  await scenario("P2 查資料 → 練功地圖排行", async () => {
    await gotoDbFromHome();
    const r = await measure({ action: clickSel('main a[href="/plan/train"]'), to: "/plan/train", keys: PLAN_KEYS });
    return { ...r, shot: await shot("P2-train.png") };
  });

  await scenario("P3 查資料 → 現在能接的任務", async () => {
    await gotoDbFromHome();
    const r = await measure({ action: clickSel('main a[href="/plan/quest"]'), to: "/plan/quest", keys: PLAN_KEYS });
    return { ...r, shot: await shot("P3-quest.png") };
  });

  await scenario("P4 任務打包（第二次進）", async () => {
    await gotoDbFromHome();
    await evaluate(`(${clickSel('main a[href="/plan/bundle"]')})()`);
    await waitFor(`() => location.pathname === "/plan/bundle" && !/整理資料中/.test(document.querySelector("main").innerText)`);
    await sleep(500);
    await evaluate(`(${clickNav("查資料")})()`);
    await waitFor(`() => location.pathname === "/db" && document.querySelector('main a[href="/plan/bundle"]')`);
    await sleep(500);
    const r = await measure({ action: clickSel('main a[href="/plan/bundle"]'), to: "/plan/bundle", keys: PLAN_KEYS });
    return { ...r, shot: await shot("P4-bundle.png") };
  });

  await scenario("P5 道具頁「這個去哪打」→ 打寶", async () => {
    // 先整頁開道具頁（道具資料）→ 站內進打寶頁一次（打寶資料）→ 回道具頁 → 點一件道具的「這個去哪打」
    await navigate(BASE + "/db/items");
    await waitFor(`() => document.querySelectorAll("main ul li button").length > 0`);
    const how = await evaluate(`(() => { ${TOOLS} return __push("/plan/farm"); })()`);
    await waitFor(`() => location.pathname === "/plan/farm" && !/載入道具資料/.test(document.querySelector("main").innerText)`);
    await sleep(500);
    await evaluate(`(() => { ${TOOLS} return __push("/db/items"); })()`);
    await waitFor(`() => location.pathname === "/db/items" && document.querySelectorAll("main ul li button").length > 0`);
    await sleep(500);
    // 用道具頁第一件裝備的 id 直接換到打寶頁（跟點「這個去哪打」同一個網址）
    const r = await measure({ action: push("/plan/farm?want=4000000"), to: "/plan/farm", keys: ["loading", "picked", "items", "h"] });
    return { setupNav: how, ...r, shot: await shot("P5-farm.png") };
  });

  await scenario("P6 /go 城鎮目的地＋上次選過的起點", async () => {
    await navigate(BASE + "/");
    await waitFor(homeReady);
    await evaluate(`localStorage.setItem("ms-go-start", "102000000"); "ok"`);
    await sleep(500);
    const r = await measure({ action: push("/go?to=101000000"), to: "/go", keys: ["loading", "route", "ask", "start", "h"] });
    await evaluate(`localStorage.removeItem("ms-go-start"); "ok"`);
    return { ...r, shot: await shot("P6-go-remembered.png") };
  });

  await scenario("P7 打開換其他職業 → 點法師", async () => {
    await navigate(BASE + "/");
    await waitFor(homeReady);
    await sleep(800);
    const before = guideRequests.map(r => r.file);
    const openedAt = Date.now();
    await evaluate(`(() => { [...document.querySelector('section[aria-label="你的角色"]').querySelectorAll("button")].find(b => b.textContent.trim() === "換其他職業").click(); return "open"; })()`);
    await sleep(1500);
    const after = guideRequests.filter(r => r.at >= openedAt).map(r => r.file);
    const r = await measure({
      action: `() => { [...document.querySelector('section[aria-label="你的角色"]').querySelectorAll("button")].find(b => b.textContent.trim() === "法師").click(); return "法師"; }`,
      to: "/", ms: 1500, keys: ["who", "nowSkeleton", "nowTitle"],
    });
    return { guidesBeforeOpen: before, requestedAfterOpen: after, ...r, shot: await shot("P7-mage.png") };
  });

  await scenario("P8 查資料 → 練功地圖排行（CPU 慢 6 倍）", async () => {
    await gotoDbFromHome();
    await page.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    const r = await measure({ action: clickSel('main a[href="/plan/train"]'), to: "/plan/train", keys: PLAN_KEYS, ms: 6000 });
    await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    return r;
  });

  // 慢手機：CPU 慢 4／6 倍，任務頁（清單最長）、打寶頁
  for (const rate of [4, 6]) {
    await scenario(`PQ${rate} 查資料 → 現在能接的任務（CPU 慢 ${rate} 倍）`, async () => {
      await gotoDbFromHome();
      await page.send("Emulation.setCPUThrottlingRate", { rate });
      const r = await measure({ action: clickSel('main a[href="/plan/quest"]'), to: "/plan/quest", keys: PLAN_KEYS, ms: 8000 });
      await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      return r;
    });
  }
  await scenario("PF6 道具頁 → 打寶（CPU 慢 6 倍）", async () => {
    await navigate(BASE + "/db/items");
    await waitFor(`() => document.querySelectorAll("main ul li button").length > 0`);
    await evaluate(`(() => { ${TOOLS} return __push("/plan/farm"); })()`);
    await waitFor(`() => location.pathname === "/plan/farm" && !/載入道具資料/.test(document.querySelector("main").innerText)`);
    await sleep(500);
    await evaluate(`(() => { ${TOOLS} return __push("/db/items"); })()`);
    await waitFor(`() => location.pathname === "/db/items" && document.querySelectorAll("main ul li button").length > 0`);
    await sleep(500);
    await page.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    const r = await measure({ action: push("/plan/farm?want=4000000"), to: "/plan/farm", keys: ["loading", "picked", "items", "h"], ms: 8000 });
    await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    return r;
  });

  await scenario("P9 從捲到底的長頁換頁要回到頂端", async () => {
    const out = {};
    for (const [label, href] of [["練功排行", "/plan/train"], ["帶我去", "/go?to=101000000"]]) {
      await gotoDbFromHome();
      await evaluate(`(() => { ${TOOLS} return __push("/plan/quest"); })()`);
      await waitFor(`() => location.pathname === "/plan/quest" && document.querySelectorAll("main li").length > 5`);
      await sleep(600);
      const leftY = await evaluate(`(async () => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); await new Promise(r => setTimeout(r, 400)); return Math.round(scrollY); })()`);
      const r = await measure({ action: push(href), to: href.split("?")[0], keys: ["loading", "h"], ms: 2500 });
      out[label] = { leftY, endY: r.endY, ys: [...new Set((await evaluate("window.__rec")).frames.filter(f => f.path.startsWith(href.split("?")[0])).map(f => f.y))].slice(0, 8), heights: r.heights };
    }
    return out;
  });
} catch (error) {
  results.fatal = String(error?.stack ?? error);
} finally {
  results.console = consoleLog.filter(c => /error|exception|warn/.test(c.type));
  results.hydrationWarnings = consoleLog.filter(c => /hydrat|#418|#423|#425|did not match|server rendered/i.test(c.text));
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  // Chrome 有時不回應 Browser.close 就斷線：最多等 2 秒，不然 node 會以 exit 13 提早結束、後面的結果沒寫出來
  try { await Promise.race([browser.send("Browser.close"), sleep(2000)]); } catch {}
  await sleep(500);
  try { chrome.kill(); } catch {}
}
console.log(JSON.stringify(results, null, 2));
process.exit(0);
