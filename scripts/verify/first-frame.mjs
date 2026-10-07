// 「10/15 開放」要在第一個畫面就出現（v0.33）——無頭 Chrome 驗收
// 用法：node first-frame.mjs <輸出資料夾> [base] [段落，逗號分隔：nav,load,dawn,midnight,stale]
//   nav      站內換頁進查資料四頁、首頁：記下每一次畫面更新（React commit），清單／首頁第一次出現時標示就要在
//   load     直接打開首頁：靜態 HTML 就有 10/15 橫幅
//   dawn     瀏覽器時鐘調到 10/14 23:59:40，頁面開著跨過 10/15 00:00：標示還在（v0.48 起開機才收，凌晨還是舊版）
//   midnight 瀏覽器時鐘調到開放前 30 秒（10/15 13:59:30），頁面開著跨過開放時刻，標示自己消失（不重新整理）
//   stale    瀏覽器時鐘調到開放後 20 小時（10/16 10:00，舊建置的頁面在開放後被打開）：hydration 不報錯、橫幅收掉、清單沒標示
// 開放時刻用環境變數 OPEN_AT 改（預設 2026-10-15T14:00:00+08:00，跟 src/lib/release.ts 的官方開機時刻一樣）；
// 檢查名稱裡的「開機」「10/16」指的就是這兩個時間點。
// 每一段都另存 screencast 第一格（使用者真的看到的那一格）跟結束時的截圖；console 的 hydration 警告整份記下來。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const OUT = outDir(process.argv[2], "first-frame");
const BASE = process.argv[3] ?? "http://localhost:3033";
const ONLY = new Set((process.argv[4] ?? "nav,load,dawn,midnight,stale").split(","));
const PORT = chromePort(9343);
const OPEN_AT = Date.parse(process.env.OPEN_AT || "2026-10-15T14:00:00+08:00");
if (Number.isNaN(OPEN_AT)) throw new Error(`OPEN_AT 看不懂：${process.env.OPEN_AT}（例如 2026-10-15T14:00:00+08:00）`);
/** 10/15 00:00（台灣時間）：v0.48 以前標示在這一刻收，現在要撐到開機 */
const DAWN = Date.parse("2026-10-15T00:00:00+08:00");
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
}
/** 一邊做事一邊錄 screencast：每一格附瀏覽器產生它的時間（毫秒） */
async function filming(action, settleMs) {
  const frames = [];
  const onFrame = m => {
    if (m.method !== "Page.screencastFrame") return;
    frames.push({ at: Math.round(m.params.metadata.timestamp * 1000), data: m.params.data });
    page.send("Page.screencastFrameAck", { sessionId: m.params.sessionId }).catch(() => {});
  };
  page.listeners.add(onFrame);
  await page.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  await sleep(300);
  const result = await action();
  await sleep(settleMs);
  await page.send("Page.stopScreencast");
  page.listeners.delete(onFrame);
  return { frames, result };
}
/** 存「某個時間點之後的第一格」 */
function dumpFrames(frames, prefix, zeroAt) {
  if (!process.env.DUMP_FRAMES) return;
  const dir = path.join(OUT, prefix + "-frames");
  fs.mkdirSync(dir, { recursive: true });
  for (const f of frames) fs.writeFileSync(path.join(dir, `${String(f.at - zeroAt).padStart(6, "0")}.png`), Buffer.from(f.data, "base64"));
}
function saveFrameAfter(frames, at, file) {
  const frame = frames.find(f => f.at >= at) ?? frames.at(-1);
  if (!frame) return null;
  fs.writeFileSync(path.join(OUT, file), Buffer.from(frame.data, "base64"));
  return { file, frameAt: frame.at, delayMs: frame.at - at };
}

// 頁面裡的小工具：__rec 記下每一次畫面更新（MutationObserver 在 React 每次 commit 之後、畫出來之前觸發）
const H = `
  window.__sleep = ms => new Promise(r => setTimeout(r, ms));
  window.__waitFor = (cond, ms = 20000) => Promise.race([
    new Promise(resolve => {
      if (cond()) return resolve(true);
      const mo = new MutationObserver(() => { if (cond()) { mo.disconnect(); resolve(true); } });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    }),
    new Promise(resolve => setTimeout(() => resolve(false), ms)),
  ]);
  window.__rows = () => document.querySelectorAll("li[id^=db-row-]").length;
  window.__chips = () => {
    let n = 0;
    const walker = document.createTreeWalker(document.querySelector("main") ?? document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) if (walker.currentNode.nodeValue.trim() === "10/15 開放") n++;
    return n;
  };
  window.__text = () => document.querySelector("main")?.textContent ?? "";
  window.__banner = () => __text().includes("已經照 10/15 改版排好");
  window.__bar = () => __text().includes("可以三轉（10/15 開放）") ? "10/15 開放" : __text().includes("可以三轉了（照舊版）") ? "照舊版" : null;
  window.__home = () => /你現在幾等|我的升級路線|讀取你的角色/.test(__text());
  window.__snap = () => ({
    at: Math.round(performance.timeOrigin + performance.now()),
    rows: __rows(), chips: __chips(), banner: __banner(), bar: __bar(), home: __home(),
  });
  window.__startRec = () => {
    window.__rec = [__snap()];
    window.__mo?.disconnect();
    window.__mo = new MutationObserver(() => window.__rec.push(__snap()));
    window.__mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  };
  window.__stopRec = () => { window.__mo?.disconnect(); window.__framesOn = false; return { commits: window.__rec, frames: window.__frameRec }; };
  window.__startFrames = () => {
    window.__frameRec = []; window.__framesOn = true;
    const tick = () => { if (!window.__framesOn) return; window.__frameRec.push(__snap()); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  window.__setSearch = v => {
    const el = document.querySelector("main input[aria-label^=搜尋]");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  window.__setJob = v => {
    const el = document.querySelector('main select[aria-label="職業分類"]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  window.__click = selector => { const el = document.querySelector(selector); if (!el) throw new Error("找不到 " + selector); el.click(); };
`;
const ev = body => evaluate(`(async () => { ${H} ${body} })()`);

/** 瀏覽器時鐘調到指定時間（每次整頁載入都從那個時間開始走）；計時器照真實時間跑 */
const clockAt = target => `(() => {
  const RealDate = Date;
  const offset = ${target} - RealDate.now();
  class ShiftedDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(RealDate.now() + offset); else super(...args); }
    static now() { return RealDate.now() + offset; }
  }
  globalThis.Date = ShiftedDate;
})();`;
async function withClock(target, run) {
  const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: clockAt(target) });
  try { return await run(); } finally { await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }); }
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
// console 的錯誤、警告、沒接住的例外全部記下來；hydration 相關的另外標出來
const consoleProblems = [];
page.listeners.add(m => {
  if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) {
    consoleProblems.push(`${m.params.type}: ${m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300)}`);
  }
  if (m.method === "Runtime.exceptionThrown") consoleProblems.push(`exception: ${(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300)}`);
});
const HYDRATION = /hydrat|did not match|didn't match|server rendered|#418|#423|#425/i;

const DB_PAGES = [
  { key: "monsters", path: "/db/monsters", title: "怪物", search: "幼紅獨角獅" },
  { key: "items", path: "/db/items", title: "道具", search: "佛羅利刃" },
  { key: "quests", path: "/db/quests", title: "任務", search: "泰勒斯的介紹函" },
  { key: "skills", path: "/db/skills", title: "技能", job: "111" },
];
const PROFILE = JSON.stringify({ level: 75, job: 110 }); // 二轉 75 等：角色列會寫「70 等可以三轉（10/15 開放）」

try {
  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await navigate(BASE + "/db");
  await evaluate(`localStorage.setItem("ms-profile", ${JSON.stringify(PROFILE)}); localStorage.setItem("ms-theme", "light"); "ok"`);

  if (ONLY.has("nav")) {
    for (const db of DB_PAGES) {
      // 先整頁打開一次（資料載進來、這次瀏覽記住），篩到 V002 的那幾筆，再從「查資料」首頁站內換頁回來
      await navigate(BASE + db.path);
      await ev(`await __waitFor(() => __rows() > 0); return 1;`);
      await ev(db.search ? `__setSearch(${JSON.stringify(db.search)}); return 1;` : `__setJob(${JSON.stringify(db.job)}); return 1;`);
      const ready = await ev(`await __waitFor(() => __chips() > 0, 8000); return { rows: __rows(), chips: __chips() };`);
      check(`${db.title}：篩完的清單有 V002 那幾筆（前提）`, ready.chips > 0, ready);
      await ev(`__click('header a[href="/db"]'); await __waitFor(() => __rows() === 0 && !!document.querySelector('main a[href="${db.path}"]')); await __sleep(600); return 1;`);
      const { frames, result: rec } = await filming(
        () => ev(`__startRec(); __startFrames(); __click('main a[href="${db.path}"]'); await __waitFor(() => __rows() > 0, 10000); await __sleep(1500); return __stopRec();`),
        200,
      );
      const painted = rec.frames.filter(r => r.rows > 0);
      const commits = rec.commits.filter(r => r.rows > 0);
      check(
        `${db.title}：站內換頁進來，清單畫出來的第一格就有「10/15 開放」`,
        painted[0]?.chips > 0,
        { 第一格: painted[0], 前五格的標示數: painted.slice(0, 5).map(r => r.chips) },
      );
      check(`${db.title}：清單第一次 commit 就帶著標示（不是下一次才補上）`, commits[0]?.chips > 0, commits.map(r => r.chips));
      dumpFrames(frames, `nav-${db.key}`, painted[0]?.at ?? 0);
      const frame = painted[0] ? saveFrameAfter(frames, painted[0].at, `nav-${db.key}-first-frame.png`) : null;
      check(`${db.title}：存下清單出現後的第一格畫面`, frame, frame);
      await shot(`nav-${db.key}-final.png`);
    }

    // 首頁：從「查資料」站內換頁回首頁
    await ev(`__click('header a[href="/db"]'); await __waitFor(() => !__home() && !!document.querySelector('main a[href="/db/skills"]')); await __sleep(600); return 1;`);
    const { frames, result: rec } = await filming(
      () => ev(`__startRec(); __startFrames(); __click('header a[href="/"]'); await __waitFor(() => __home(), 10000); await __waitFor(() => __bar() !== null, 10000); await __sleep(2000); return __stopRec();`),
      200,
    );
    const homeFrames = rec.frames.filter(r => r.home);
    check("首頁：站內換頁進來，畫出來的第一格就有 10/15 橫幅", homeFrames[0]?.banner, { 第一格: homeFrames[0], 前五格有沒有橫幅: homeFrames.slice(0, 5).map(r => r.banner) });
    check("首頁：第一次 commit 就帶著橫幅", rec.commits.find(r => r.home)?.banner, rec.commits.filter(r => r.home).map(r => r.banner));
    const barFrames = rec.frames.map(r => r.bar).filter(Boolean);
    const barCommits = rec.commits.map(r => r.bar).filter(Boolean);
    check(
      "首頁角色列：一出現就寫「可以三轉（10/15 開放）」，沒有任何一格、任何一次 commit 是「可以三轉了（照舊版）」",
      barFrames[0] === "10/15 開放" && !barFrames.includes("照舊版") && !barCommits.includes("照舊版"),
      { 每一格: [...new Set(barFrames)], 每次commit: [...new Set(barCommits)] },
    );
    dumpFrames(frames, "nav-home", homeFrames[0]?.at ?? 0);
    const frame = homeFrames[0] ? saveFrameAfter(frames, homeFrames[0].at, "nav-home-first-frame.png") : null;
    check("首頁：存下第一格畫面", frame, frame);
    await shot("nav-home-final.png");
  }

  if (ONLY.has("load")) {
    const html = await (await fetch(BASE + "/")).text();
    check("直接打開首頁：伺服器給的 HTML 就有 10/15 橫幅（不用等程式載完）", html.includes("已經照 10/15 改版排好"), { html長度: html.length });
    const before = consoleProblems.length;
    const t0 = Date.now();
    const { frames } = await filming(() => navigate(BASE + "/"), 1500);
    const firstPainted = frames.find(f => f.at >= t0);
    if (firstPainted) fs.writeFileSync(path.join(OUT, "load-home-first-frame.png"), Buffer.from(firstPainted.data, "base64"));
    const after = await ev(`await __waitFor(() => __bar() !== null, 10000); return { banner: __banner(), bar: __bar() };`);
    check("直接打開首頁：程式載完橫幅還在、角色列寫 10/15 開放", after.banner && after.bar === "10/15 開放", after);
    const hydration = consoleProblems.slice(before).filter(p => HYDRATION.test(p));
    check("直接打開首頁：console 沒有 hydration 警告", hydration.length === 0, hydration);
    await shot("load-home-final.png");
  }

  // OPEN_AT 設成 00:00 以前（舊行為）時這段跟自己矛盾，跳過
  if (ONLY.has("dawn") && OPEN_AT > DAWN + 60 * 1000) {
    await withClock(DAWN - 20 * 1000, async () => {
      await navigate(BASE + "/");
      const start = await ev(`await __waitFor(() => __bar() !== null, 10000); return { now: Date.now(), banner: __banner(), bar: __bar(), origin: performance.timeOrigin };`);
      check("10/15 00:00 之前（10/14 23:59:4x）：首頁有橫幅、角色列寫 10/15 開放", start.banner && start.bar === "10/15 開放" && start.now < DAWN, start);
      // 等到 00:00 過 3 秒（__waitFor 只在畫面變動時重看條件，等時間要用 sleep）
      const end = await ev(`await __sleep(Math.max(0, ${DAWN} + 3000 - Date.now())); return { now: Date.now(), banner: __banner(), bar: __bar(), origin: performance.timeOrigin };`);
      check(
        "頁面開著跨過 10/15 00:00：橫幅跟「10/15 開放」都還在（凌晨還是舊版，開機才收），同一份頁面",
        end.banner && end.bar === "10/15 開放" && end.origin === start.origin && end.now >= DAWN,
        { ...end, 過了午夜幾毫秒: end.now - DAWN },
      );
      await shot("dawn-home-after-midnight.png");
    });
  }

  if (ONLY.has("midnight")) {
    const MIDNIGHT = OPEN_AT;
    const target = MIDNIGHT - 30 * 1000; // dev 模式整頁載入＋載資料要 10 秒上下，留足時間
    await withClock(target, async () => {
      // 首頁：橫幅、角色列
      await navigate(BASE + "/");
      const start = await ev(`await __waitFor(() => __bar() !== null, 10000); return { now: Date.now(), banner: __banner(), bar: __bar(), origin: performance.timeOrigin };`);
      check("開機之前（10/15 13:59:3x）：首頁有橫幅、角色列寫 10/15 開放", start.banner && start.bar === "10/15 開放" && start.now < MIDNIGHT, start);
      await shot("midnight-home-before.png");
      const end = await ev(`await __waitFor(() => !__banner() && __bar() === "照舊版", 60000); return { now: Date.now(), banner: __banner(), bar: __bar(), origin: performance.timeOrigin };`);
      check(
        "頁面開著跨過開機時刻（10/15 14:00）：橫幅收掉、角色列改寫，不用重新整理（同一份頁面）",
        !end.banner && end.bar === "照舊版" && end.origin === start.origin,
        { ...end, 過了開機幾毫秒: end.now - MIDNIGHT },
      );
      check("收掉的時間就在開機那一刻（晚不到 1.5 秒）", end.now >= MIDNIGHT && end.now - MIDNIGHT < 1500, end.now - MIDNIGHT);
      await shot("midnight-home-after.png");

      // 技能頁：十字軍之路整排都是三轉，每一筆都有標示
      await evaluate(`sessionStorage.setItem("ms-db:db:技能:jobFilter", JSON.stringify("111")); "ok"`);
      await navigate(BASE + "/db/skills");
      const s0 = await ev(`await __waitFor(() => __chips() > 0, 10000); return { now: Date.now(), chips: __chips(), origin: performance.timeOrigin };`);
      check("開機之前：技能頁三轉那幾筆有標示", s0.chips > 0 && s0.now < MIDNIGHT, s0);
      await shot("midnight-skills-before.png");
      const s1 = await ev(`await __waitFor(() => __chips() === 0, 60000); return { now: Date.now(), chips: __chips(), rows: __rows(), origin: performance.timeOrigin };`);
      check(
        "頁面開著跨過開機時刻：技能頁標示全部收掉、清單還在，不用重新整理",
        s1.chips === 0 && s1.rows > 0 && s1.origin === s0.origin && s1.now >= MIDNIGHT && s1.now - MIDNIGHT < 1500,
        { ...s1, 過了開機幾毫秒: s1.now - MIDNIGHT },
      );
      await shot("midnight-skills-after.png");
      await evaluate(`sessionStorage.removeItem("ms-db:db:技能:jobFilter"); "ok"`);
    });
  }

  if (ONLY.has("stale")) {
    await withClock(OPEN_AT + 20 * 3600 * 1000, async () => {
      const before = consoleProblems.length;
      await navigate(BASE + "/");
      const r = await ev(`await __waitFor(() => __bar() !== null, 10000); await __sleep(800); return { now: new Date().toISOString(), banner: __banner(), bar: __bar() };`);
      check("10/16 打開開機前建置的首頁：程式載完橫幅收掉、角色列照舊版", !r.banner && r.bar === "照舊版", r);
      const hydration = consoleProblems.slice(before).filter(p => HYDRATION.test(p));
      check("10/16 打開舊建置：console 沒有 hydration 警告", hydration.length === 0, hydration);
      await shot("stale-home.png");

      await evaluate(`sessionStorage.setItem("ms-db:db:技能:jobFilter", JSON.stringify("111")); "ok"`);
      await ev(`__click('header a[href="/db"]'); await __waitFor(() => !!document.querySelector('main a[href="/db/skills"]')); await __sleep(600); return 1;`);
      // 技能資料這份頁面還沒載過：第一次會先轉圈，等資料回來那一次才是清單第一次出現
      const rec = await ev(`__startRec(); __startFrames(); __click('main a[href="/db/skills"]'); await __waitFor(() => __rows() > 0, 10000); await __sleep(1200); return __stopRec();`);
      const withRows = rec.commits.filter(x => x.rows > 0);
      check("10/16：站內換頁進技能頁，清單從頭到尾都沒有「10/15 開放」", withRows.length > 0 && withRows.every(x => x.chips === 0), withRows.map(x => x.chips));
      await shot("stale-skills.png");
      await evaluate(`sessionStorage.removeItem("ms-db:db:技能:jobFilter"); "ok"`);
    });
  }
} catch (error) {
  results.push({ name: "ERROR", ok: false, detail: String(error?.stack ?? error).slice(0, 800) });
} finally {
  // Chrome 有時不回應 Browser.close 就斷線：最多等 2 秒，不然 node 會以 exit 13 提早結束、後面的結果沒寫出來
  try { await Promise.race([browser.send("Browser.close"), sleep(2000)]); } catch {}
  await sleep(800);
  try { spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
  await sleep(800);
}
const hydrationAll = consoleProblems.filter(p => HYDRATION.test(p));
check("整輪 console 沒有 hydration 警告", hydrationAll.length === 0, hydrationAll.slice(0, 5));
const others = [...new Set(consoleProblems.filter(p => !HYDRATION.test(p)))];
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ results, consoleOthers: others }, null, 2));
for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.ok ? "" : "  " + JSON.stringify(x.detail).slice(0, 500)}`);
if (others.length) console.log(`（其他 console 訊息 ${others.length} 種，見 results.json）\n  ` + others.slice(0, 6).join("\n  "));
process.exit(0);
