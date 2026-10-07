// 全站每種頁面：捲到底 → 換頁 → 按返回（瀏覽器本身的返回，走 DevTools 的 navigateToHistoryEntry）→ 逐格記 scrollY；再按下一頁也記。
// 另外量跨文件的返回（離開到別的網址再回來）。
// 用法：node back-all.mjs <輸出資料夾> <base> [port]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const OUT = outDir(process.argv[2], "back-all");
const BASE = (process.argv[3] ?? "http://localhost:3047").replace(/\/$/, "");
const PORT = chromePort(9347, process.argv[4]);
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
/** 跟按瀏覽器的返回／下一頁一樣（不是頁面自己呼叫 history.back） */
async function traverse(delta) {
  const h = await page.send("Page.getNavigationHistory");
  const entry = h.entries[h.currentIndex + delta];
  if (!entry) throw new Error(`沒有第 ${h.currentIndex + delta} 筆歷史紀錄`);
  await page.send("Page.navigateToHistoryEntry", { entryId: entry.id });
}

const H = `
  window.__sleep = ms => new Promise(r => setTimeout(r, ms));
  window.__waitFor = (cond, ms = 15000) => Promise.race([
    new Promise(resolve => {
      if (cond()) return resolve(true);
      const mo = new MutationObserver(() => { if (cond()) { mo.disconnect(); resolve(true); } });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    }),
    new Promise(resolve => setTimeout(() => resolve(false), ms)),
  ]);
  /** 等頁面高度 800ms 不再變 */
  window.__settle = async (max = 12000) => {
    const t0 = performance.now(); let last = -1, since = performance.now();
    while (performance.now() - t0 < max) {
      const h = document.documentElement.scrollHeight;
      if (h !== last) { last = h; since = performance.now(); }
      else if (performance.now() - since > 800) return h;
      await window.__sleep(100);
    }
    return last;
  };
  window.__sampleFrames = ms => new Promise(res => {
    const out = []; const t0 = performance.now();
    const tick = () => { const t = performance.now() - t0; out.push([Math.round(t), Math.round(scrollY), location.pathname]); if (t < ms) requestAnimationFrame(tick); else res(out); };
    tick();
  });
`;
const ev = body => evaluate(`(async () => { ${H} ${body} })()`);

/** 從 frames 算：還原前的位置、中間經過幾格、最後停在哪 */
function summarize(frames, path) {
  const on = frames.filter(f => f[2] === path);
  const ys = on.map(f => f[1]);
  const distinct = ys.filter((y, i) => i === 0 || y !== ys[i - 1]);
  const before = frames.filter(f => f[2] !== path).at(-1)?.[1] ?? null;
  const finalY = ys.at(-1) ?? null;
  // 中間格：不是還原前、也不是最後停的位置
  const middle = distinct.filter(y => y !== before && y !== finalY);
  const firstOn = on[0] ? `${on[0][0]}ms:${on[0][1]}` : null;
  const reachedAt = on.find(f => f[1] === finalY)?.[0] ?? null;
  return { beforeY: before, finalY, slideFrames: middle.length, firstFrameOnPage: firstOn, reachedFinalAtMs: reachedAt, path: distinct.slice(0, 14) };
}

const CASES = [
  { name: "首頁（長路線）", from: "/", header: "查資料", to: "/db" },
  { name: "1–30 懶人包", from: "/guide", header: "查資料", to: "/db" },
  { name: "帶我去", from: "/go", header: "查資料", to: "/db" },
  { name: "練功地圖", from: "/plan/train", header: "我的路線", to: "/" },
  { name: "任務", from: "/plan/quest", header: "我的路線", to: "/" },
  { name: "打寶", from: "/plan/farm", header: "我的路線", to: "/" },
  { name: "套餐", from: "/plan/bundle", header: "我的路線", to: "/" },
  { name: "查資料首頁", from: "/db", selector: 'main a[href="/db/items"]', to: "/db/items" },
  { name: "道具清單", from: "/db/items", header: "查資料", to: "/db" },
  { name: "怪物清單", from: "/db/monsters", header: "查資料", to: "/db" },
  { name: "關於", from: "/about", header: "查資料", to: "/db" },
];

const results = [];
try {
  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await navigate(BASE + "/db");
  // 狂戰士 45：首頁排出長路線
  await evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: 45, job: 110 })); localStorage.setItem("ms-theme", "light"); "ok"`);
  // 本機 dev server 第一次開某頁要先編譯：每頁先整頁開一次
  if (BASE.includes("localhost")) for (const c of CASES) { await navigate(BASE + c.from); await sleep(300); }

  // 第 5 個參數：只跑網址等於它的那一頁（例如 /plan/farm）
  const only = process.argv[5];
  for (const [i, c] of CASES.entries()) {
    if (only && c.from !== only) continue;
    const tag = String(i + 1).padStart(2, "0");
    try {
      await navigate(BASE + c.from);
      const prep = await ev(`
        // 等「載入中」的字不見再量高度（資料大的頁面會先停在很短的讀取畫面）
        await __waitFor(() => !/載入|讀取/.test(document.querySelector("main")?.innerText.slice(0, 400) ?? ""), 15000);
        const height = await __settle();
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
        await __sleep(500);
        const leftY = Math.round(scrollY);
        const link = ${c.selector ? `document.querySelector(${JSON.stringify(c.selector)})` : `[...document.querySelectorAll("header nav a")].find(a => a.textContent.trim() === ${JSON.stringify(c.header)})`};
        if (!link) return { error: "找不到要點的連結" };
        link.click();
        const arrived = await __waitFor(() => location.pathname === ${JSON.stringify(c.to)});
        await __settle(6000);
        return { height, leftY, arrived, yOnNext: Math.round(scrollY) };
      `);
      if (prep.error) { results.push({ case: c.name, ...prep }); continue; }
      // 按返回
      await evaluate(`window.__fp = window.__sampleFrames(1600); 1`);
      await traverse(-1);
      await sleep(120);
      const midShot = await shot(`${tag}-back-mid.png`);
      const backFrames = await evaluate(`window.__fp`);
      await sleep(200);
      const after = await evaluate(`({ y: Math.round(scrollY), inline: document.documentElement.style.scrollBehavior, computed: getComputedStyle(document.documentElement).scrollBehavior, pathname: location.pathname })`);
      const endShot = await shot(`${tag}-back-end.png`);
      const back = summarize(backFrames, c.from);
      // 再按下一頁
      await evaluate(`window.__fp = window.__sampleFrames(1600); 1`);
      await traverse(+1);
      const fwdFrames = await evaluate(`window.__fp`);
      const fwd = summarize(fwdFrames, c.to);
      results.push({
        case: c.name, from: c.from, to: c.to, pageHeight: prep.height, leftY: prep.leftY, yOnNext: prep.yOnNext,
        back: { ...back, ok: Math.abs((back.finalY ?? -999) - prep.leftY) <= 2, ...after, midShot, endShot },
        forward: { ...fwd, ok: Math.abs((fwd.finalY ?? -999) - prep.yOnNext) <= 2 },
      });
    } catch (error) {
      results.push({ case: c.name, error: String(error?.stack ?? error).slice(0, 500) });
    }
    console.error(`done ${c.name}`);
  }

  // 跨文件：懶人包捲到底 → 離開到別的網址 → 返回
  if (!process.argv[5]) try {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
      const rec = key => { const out = []; const t0 = performance.now(); window[key] = out;
        const tick = () => { out.push([Math.round(performance.now() - t0), Math.round(scrollY)]); if (performance.now() - t0 < 2500) requestAnimationFrame(tick); };
        requestAnimationFrame(tick); };
      rec("__bootFrames");
      addEventListener("pageshow", e => { window.__persisted = e.persisted; if (e.persisted) rec("__bfFrames"); });
    })();` });
    await navigate(BASE + "/guide");
    const leftY = await ev(`await __settle(); window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); await __sleep(500); return Math.round(scrollY);`);
    await navigate("about:blank");
    await sleep(500);
    await traverse(-1);
    await sleep(3000);
    const r = await evaluate(`({ persisted: window.__persisted ?? null, navType: performance.getEntriesByType("navigation")[0]?.type, y: Math.round(scrollY),
      frames: (window.__persisted ? window.__bfFrames : window.__bootFrames)?.map(f => f[1]) ?? null })`);
    const ys = r.frames ?? [];
    const distinct = ys.filter((y, i) => i === 0 || y !== ys[i - 1]);
    results.push({ case: "跨文件返回（懶人包 → 別的網址 → 返回）", leftY, persisted: r.persisted, navType: r.navType, finalY: r.y,
      ok: Math.abs(r.y - leftY) <= 2, distinctFrames: distinct.length, path: distinct.slice(0, 14), endShot: await shot("90-crossdoc-end.png") });
  } catch (error) {
    results.push({ case: "跨文件返回", error: String(error?.stack ?? error).slice(0, 500) });
  }
} catch (error) {
  results.push({ error: String(error?.stack ?? error).slice(0, 800) });
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  // Chrome 有時不回應 Browser.close 就斷線：最多等 2 秒，不然 node 會以 exit 13 提早結束、後面的結果沒寫出來
  try { await Promise.race([browser.send("Browser.close"), sleep(2000)]); } catch {}
  await sleep(800);
  try { spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
  await sleep(500);
}
// 一行一個情境的摘要
for (const r of results) {
  if (r.error) { console.log(`${r.case ?? ""} 錯誤：${r.error}`); continue; }
  if (r.back) console.log(`${r.case}｜離開 ${r.leftY}｜返回：還原前 ${r.back.beforeY} → 停 ${r.back.finalY}（${r.back.ok ? "位置對" : "位置不對"}），中間滑 ${r.back.slideFrames} 格｜下一頁：${r.forward.beforeY} → ${r.forward.finalY}（${r.forward.ok ? "對" : "不對"}），中間 ${r.forward.slideFrames} 格`);
  else console.log(`${r.case}｜離開 ${r.leftY}｜persisted=${r.persisted} type=${r.navType}｜停 ${r.finalY}（${r.ok ? "位置對" : "位置不對"}）｜逐格 ${JSON.stringify(r.path)}`);
}
process.exit(0);
