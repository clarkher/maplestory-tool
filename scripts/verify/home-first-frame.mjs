// 量「站內換頁進首頁」的第一個畫面（v0.34）。無頭 Chrome（頁面算看得見，rAF 會跑）＋DevTools 協定。
// 用法：node home-first-frame.mjs <輸出資料夾> <網址>
//
// 情境：
//   A 首頁 → 站內點「查資料」→ 點「我的路線」（這次瀏覽首頁資料已載過）：第一格就要有角色＋完整路線，高度之後不再變
//   B 直接從查資料進站 → 點「我的路線」：第一格要有角色（路線可以還在排，第一次一定要下載）
//   C 首頁按「等級加一」：角色列跟主推卡標題立刻換成新等級；站內換到練功頁，第一格的等級就是新的
//   D 硬重新整理首頁：記第一格（允許「讀取你的角色…」，v0.54 起不准出現「你現在幾等、什麼職業？」），收 hydration 警告
//   D2 沒存過角色的人硬重新整理：讀到之後才出現「你現在幾等、什麼職業？」跟選職業
//   E 沒選職業：首頁 → 查資料 → 點「我的路線」，第一格是選職業畫面，不是讀取中
//   F 存了不可能的組合（狂戰士 25 等）：首頁顯示劍士 25 等
//   G 道具頁「只看狂戰士能用的裝備」照常出現
//
// 每一格（requestAnimationFrame，畫出來之前）記高度跟有哪些區塊；另外用 screencast 存真的畫出來的畫面。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const OUT = outDir(process.argv[2], "home-first-frame");
const BASE = (process.argv[3] ?? "http://localhost:3134").replace(/\/$/, "");
const PORT = chromePort(9400 + Math.floor(Math.random() * 400));
const BERSERKER_45 = { level: 45, job: 110 };
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

// console：hydration 警告、錯誤都收起來
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

// screencast：真的畫出來的每一格
const cast = [];
let recording = false;
page.listeners.add(m => {
  if (m.method !== "Page.screencastFrame") return;
  page.send("Page.screencastFrameAck", { sessionId: m.params.sessionId }).catch(() => {});
  if (recording) cast.push({ ts: m.params.metadata.timestamp * 1000, data: m.params.data });
});
async function startCast() {
  cast.length = 0;
  recording = true;
  await page.send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 1 });
}
async function stopCast() {
  recording = false;
  await page.send("Page.stopScreencast");
  return cast.splice(0);
}

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
async function shot(file, full = false) {
  const params = { format: "png" };
  if (full) params.captureBeyondViewport = true;
  const r = await page.send("Page.captureScreenshot", params);
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
  return file;
}
async function mobile() {
  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
}

// 頁面裡的工具：等條件（MutationObserver，不靠 setTimeout 輪詢）、每一格量一次首頁
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
      path: location.pathname,
      h: document.documentElement ? document.documentElement.scrollHeight : 0,
      belowBar: (() => { const bar = q('section[aria-label="你的角色"]'); return bar ? Math.round(document.documentElement.scrollHeight - (bar.getBoundingClientRect().top + scrollY)) : null; })(),
      loadingRole: text.includes("讀取你的角色"),
      character: !!q('section[aria-label="你的角色"]'),
      picker: text.includes("你現在幾等、什麼職業"),
      planning: text.includes("幫你排路線"),
      now: !!q('main article[aria-label="現在去這裡"]:not([aria-busy])'),
      nowSkeleton: !!q('main article[aria-busy="true"]'),
      todo: !!q('section[aria-label="先解"]'),
      skill: !!q('section[aria-label="技能怎麼點"]'),
      gear: !!q('section[aria-label="能力值與裝備"]:not([aria-busy])'),
      gearSkeleton: !!q('section[aria-label="能力值與裝備"][aria-busy]'),
      route: !!q('section[aria-label="升級路線"]'),
      guideLoading: text.includes("讀取玩家攻略中"),
      banner: text.includes("已經照 10/15 改版排好"),
      expand: [...(main ? main.querySelectorAll("button") : [])].some(b => b.textContent.trim() === "展開"),
      who: q('section[aria-label="你的角色"] .text-xl')?.textContent.trim() ?? null,
      nav: q('header nav a[aria-current="page"]')?.textContent.trim() ?? null,
      nowLabel: q('main article[aria-label="現在去這裡"] span.absolute')?.textContent.trim() ?? null,
      nowTitle: q('main article[aria-label="現在去這裡"]:not([aria-busy]) h2')?.textContent.trim() ?? null,
    };
  };
  window.__record = ms => new Promise(resolve => {
    const frames = []; const dom = []; const t0 = performance.now(); let last = "";
    const mo = new MutationObserver(() => {
      const p = __probe(); const s = JSON.stringify(p);
      if (s !== last) { last = s; dom.push({ t: Math.round(performance.now() - t0), ...p }); }
    });
    mo.observe(document, { childList: true, subtree: true, characterData: true, attributes: true });
    const tick = () => {
      const t = performance.now() - t0;
      frames.push({ t: Math.round(t), wall: Date.now(), ...__probe() });
      if (t < ms) requestAnimationFrame(tick); else { mo.disconnect(); resolve({ frames, dom }); }
    };
    requestAnimationFrame(tick);
  });
`;

const homeReady = `() => document.querySelector('section[aria-label="升級路線"]') && document.querySelector('section[aria-label="能力值與裝備"]:not([aria-busy])') && !document.querySelector('main article[aria-busy="true"]')`;

async function waitFor(cond, ms = 30000) {
  return evaluate(`(async () => { ${TOOLS} return await __waitFor(${cond}, ${ms}); })()`);
}

/** 每一格的狀態去掉時間、只留不一樣的那幾格 */
function states(frames) {
  const out = [];
  for (const { t, wall, ...rest } of frames) {
    const sig = JSON.stringify(rest);
    if (!out.length || out.at(-1).sig !== sig) out.push({ t, sig, ...rest });
  }
  return out.map(({ sig, ...s }) => s);
}

/** 點頁首某一顆，逐格記換頁後 ms 毫秒；screencast 存換頁後畫出來的畫面 */
async function measureNav({ label, to, tag, ms = 2500 }) {
  await startCast();
  await sleep(200);
  const clickWall = await evaluate(`(() => {
    ${TOOLS}
    window.__rec = __record(${ms});
    [...document.querySelectorAll("header nav a")].find(a => a.textContent.trim() === ${JSON.stringify(label)}).click();
    return Date.now();
  })()`);
  const rec = await evaluate("window.__rec");
  await sleep(100);
  const frames = await stopCast();
  const onTarget = rec.frames.filter(f => f.path === to);
  const first = onTarget.find(f => f.character || f.loadingRole || f.picker) ?? null;
  const last = onTarget.at(-1) ?? null;
  // 第一個畫出來的首頁畫面：時間在第一格首頁 rAF 之後的第一張 screencast
  const saved = [];
  frames.forEach((f, i) => {
    const rel = Math.round(f.ts - clickWall);
    if (rel < -30 || rel > ms) return;
    const file = `${tag}-cast-${String(i).padStart(3, "0")}-${rel}ms.jpg`;
    fs.writeFileSync(path.join(OUT, file), Buffer.from(f.data, "base64"));
    saved.push({ rel, file });
  });
  const firstShot = first ? saved.find(s => s.rel >= first.wall - clickWall) ?? null : null;
  return {
    firstHomeFrame: first ? { ...first, t: first.t, wall: undefined } : null,
    lastFrame: last ? { ...last, wall: undefined } : null,
    heightsAfterNav: [...new Set(onTarget.map(f => f.h))],
    belowBarAfterNav: [...new Set(onTarget.map(f => f.belowBar))],
    domBelowBar: [...new Set(rec.dom.filter(d => d.path === to).map(d => d.belowBar))],
    paintedStates: states(onTarget),
    domStatesAfterNav: rec.dom.filter(d => d.path === to).map(d => ({ t: d.t, h: d.h, belowBar: d.belowBar, loadingRole: d.loadingRole, planning: d.planning, nowSkeleton: d.nowSkeleton, gearSkeleton: d.gearSkeleton, guideLoading: d.guideLoading, banner: d.banner })),
    firstPaintedHomeShot: firstShot,
    castFrames: saved.length,
  };
}

const results = {};
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
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
  await mobile();
  await navigate(BASE + "/db");
  await evaluate(`localStorage.setItem("ms-theme", "light"); localStorage.setItem("ms-profile", ${JSON.stringify(JSON.stringify(BERSERKER_45))}); "ok"`);

  /** 首頁（整頁開，資料載進這次瀏覽）→ 站內點「查資料」→ 點「我的路線」；throttle：CPU 慢幾倍（模擬慢手機） */
  async function homeRoundTrip(tag, throttle = 1) {
    await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await navigate(BASE + "/");
    const ready = await waitFor(homeReady);
    await sleep(1000);
    await evaluate(`[...document.querySelectorAll("header nav a")].find(a => a.textContent.trim() === "查資料").click(); "ok"`);
    await waitFor(`() => location.pathname === "/db" && document.querySelector("main h1")`);
    await sleep(600);
    await page.send("Emulation.setCPUThrottlingRate", { rate: throttle });
    const nav = await measureNav({ label: "我的路線", to: "/", tag, ms: 2500 * throttle });
    await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await sleep(300);
    const settled = await shot(`${tag}-settled-viewport.png`);
    const full = throttle === 1 ? await shot(`${tag}-settled-full.png`, true) : null;
    return { throttle, homeReadyBefore: ready, ...nav, settled, full };
  }

  await scenario("A4 首頁→查資料→我的路線（CPU 慢 4 倍）", () => homeRoundTrip("A4", 4));
  await scenario("A6 首頁→查資料→我的路線（CPU 慢 6 倍）", () => homeRoundTrip("A6", 6));
  await scenario("A 首頁→查資料→我的路線", () => homeRoundTrip("A", 1));

  await scenario("H 首頁換職業（沒載過的法師 → 換回狂戰士）", async () => {
    // 接在 A 後面：現在就在首頁、狂戰士 45
    await waitFor(homeReady);
    /** 依序點角色列裡的按鈕（每點一顆隔兩格），逐格記主推卡：有沒有先閃一張不對的、骨架、最後是哪一張 */
    const pick = async (label, buttons) => evaluate(`(async () => {
      ${TOOLS}
      const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const p = __record(3000);
      const bar = () => document.querySelector('section[aria-label="你的角色"]');
      const open = [...bar().querySelectorAll("button")].find(b => b.textContent.trim() === "換其他職業");
      if (open) { open.click(); await nextFrame(); }
      for (const text of ${JSON.stringify(buttons)}) {
        const target = [...bar().querySelectorAll("button")].find(b => b.textContent.trim() === text);
        if (!target) return { label: ${JSON.stringify(label)}, error: "找不到按鈕：" + text };
        target.click();
        await nextFrame();
      }
      const rec = await p;
      const squash = list => {
        const out = [];
        for (const f of list) {
          const s = { t: f.t, who: f.who, nowSkeleton: f.nowSkeleton, nowTitle: f.nowTitle };
          const sig = JSON.stringify({ ...s, t: 0 });
          if (!out.length || out.at(-1).sig !== sig) out.push({ ...s, sig });
        }
        return out.map(({ sig, ...x }) => x);
      };
      return { label: ${JSON.stringify(label)}, painted: squash(rec.frames), dom: squash(rec.dom) };
    })()`);
    const toMage = await pick("換到法師（攻略沒載過）", ["法師"]);
    const toMageShot = await shot("H-mage.png");
    const back = await pick("換回狂戰士（攻略載過）", ["劍士", "狂戰士"]);
    const backShot = await shot("H-back.png");
    return { toMage, toMageShot, back, backShot };
  });

  await scenario("C 首頁按等級加一", async () => {
    // 接在 A 後面：現在就在首頁
    await waitFor(homeReady);
    const before = await evaluate(`(() => { ${TOOLS} return __probe(); })()`);
    const rec = await evaluate(`(async () => {
      ${TOOLS}
      const p = __record(1200);
      document.querySelector('section[aria-label="你的角色"] button[aria-label="等級加一"]').click();
      return await p;
    })()`);
    const stored = await evaluate(`localStorage.getItem("ms-profile")`);
    const afterShot = await shot("C-after-plus.png");
    // 站內換到練功頁（查資料 → 練功地圖排行）：等級框第一格就是新的等級（共用同一份角色）
    await evaluate(`[...document.querySelectorAll("header nav a")].find(a => a.textContent.trim() === "查資料").click(); "ok"`);
    await waitFor(`() => location.pathname === "/db" && document.querySelector('main a[href="/plan/train"]')`);
    await sleep(400);
    const plan = await evaluate(`(async () => {
      const frames = [];
      const t0 = performance.now();
      await new Promise(resolve => {
        const tick = () => {
          const input = document.querySelector('main input[aria-label="你的等級"]');
          frames.push({ t: Math.round(performance.now() - t0), path: location.pathname, level: input ? input.value : null });
          const onPlan = frames.find(f => f.path === "/plan/train" && f.level !== null);
          if (performance.now() - t0 < 8000 && (!onPlan || performance.now() - t0 < onPlan.t + 1500)) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
        document.querySelector('main a[href="/plan/train"]').click();
      });
      const onPlan = frames.filter(f => f.path === "/plan/train" && f.level !== null);
      const seen = [];
      for (const f of onPlan) if (!seen.length || seen.at(-1).level !== f.level) seen.push(f);
      return { firstFrame: onPlan[0] ?? null, levelChanges: seen };
    })()`);
    const planShot = await shot("C-plan-train.png");
    return {
      before: { who: before.who, nowLabel: before.nowLabel },
      paintedStates: states(rec.frames).map(s => ({ t: s.t, who: s.who, nowLabel: s.nowLabel, h: s.h, nowSkeleton: s.nowSkeleton, planning: s.planning })),
      stored,
      afterShot,
      plan,
      planShot,
    };
  });

  await scenario("G 道具頁只看狂戰士能用", async () => {
    await evaluate(`localStorage.setItem("ms-profile", ${JSON.stringify(JSON.stringify(BERSERKER_45))}); "ok"`);
    await navigate(BASE + "/db/items");
    const ok = await waitFor(`() => document.querySelector('main select[aria-label="誰能用"]')`, 30000);
    const options = await evaluate(`[...(document.querySelector('main select[aria-label="誰能用"]')?.options ?? [])].map(o => o.textContent.trim())`);
    const file = await shot("G-items.png");
    return { select: ok, options, file };
  });

  await scenario("B 從查資料進站→我的路線", async () => {
    await navigate(BASE + "/db");
    await waitFor(`() => document.querySelector("main h1")`);
    await sleep(600);
    const nav = await measureNav({ label: "我的路線", to: "/", tag: "B", ms: 4000 });
    return nav;
  });

  await scenario("F 不可能的組合（狂戰士 25 等）", async () => {
    await evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: 25, job: 110 })); "ok"`);
    await navigate(BASE + "/");
    await waitFor(`() => document.querySelector('section[aria-label="你的角色"]')`);
    await sleep(500);
    const p = await evaluate(`(() => { ${TOOLS} return __probe(); })()`);
    const file = await shot("F-invalid-combo.png");
    return { who: p.who, file };
  });

  await scenario("E 沒選職業", async () => {
    await evaluate(`localStorage.removeItem("ms-profile"); "ok"`);
    await navigate(BASE + "/");
    await waitFor(`() => document.querySelector('section[aria-label="你的角色"]')`);
    await sleep(500);
    await evaluate(`[...document.querySelectorAll("header nav a")].find(a => a.textContent.trim() === "查資料").click(); "ok"`);
    await waitFor(`() => location.pathname === "/db" && document.querySelector("main h1")`);
    await sleep(500);
    const nav = await measureNav({ label: "我的路線", to: "/", tag: "E", ms: 1500 });
    return nav;
  });

  await scenario("D 硬重新整理首頁", async () => {
    await evaluate(`localStorage.setItem("ms-profile", ${JSON.stringify(JSON.stringify(BERSERKER_45))}); "ok"`);
    const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `${TOOLS}; window.__rec = __record(10000);` });
    await navigate(BASE + "/");
    const rec = await evaluate("window.__rec");
    await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    const onHome = rec.frames.filter(f => f.path === "/" && (f.character || f.loadingRole || f.picker));
    return {
      firstFrame: onHome[0] ? { ...onHome[0], wall: undefined } : null,
      paintedStates: states(rec.frames.filter(f => f.path === "/")).map(s => ({ t: s.t, h: s.h, loadingRole: s.loadingRole, character: s.character, picker: s.picker, planning: s.planning, now: s.now })),
      // v0.54 起：存過角色的人，讀到角色之前不問「你現在幾等、什麼職業？」——每一格都不該出現
      questionFrames: rec.frames.filter(f => f.path === "/" && f.picker).length,
      domQuestion: rec.dom.filter(d => d.path === "/" && d.picker).length,
    };
  });

  await scenario("D2 沒存過角色的人硬重新整理首頁", async () => {
    await evaluate(`localStorage.removeItem("ms-profile"); "ok"`);
    const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `${TOOLS}; window.__rec = __record(6000);` });
    await navigate(BASE + "/");
    const rec = await evaluate("window.__rec");
    await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    await evaluate(`localStorage.setItem("ms-profile", ${JSON.stringify(JSON.stringify(BERSERKER_45))}); "ok"`);
    // 讀到角色（沒存過）之後才出現「你現在幾等、什麼職業？」跟選職業
    return {
      paintedStates: states(rec.frames.filter(f => f.path === "/")).map(s => ({ t: s.t, h: s.h, loadingRole: s.loadingRole, character: s.character, picker: s.picker })),
      shot: await shot("D2-first-visit.png"),
    };
  });
} catch (error) {
  results.fatal = String(error?.stack ?? error);
} finally {
  results.console = consoleLog;
  results.hydrationWarnings = consoleLog.filter(c => /hydrat|#418|#423|#425|did not match|server rendered/i.test(c.text));
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  // Chrome 有時不回應 Browser.close 就斷線：最多等 2 秒，不然 node 會以 exit 13 提早結束、後面的結果沒寫出來
  try { await Promise.race([browser.send("Browser.close"), sleep(2000)]); } catch {}
  await sleep(500);
  try { chrome.kill(); } catch {}
}
console.log(JSON.stringify(results, null, 2));
process.exit(0);
