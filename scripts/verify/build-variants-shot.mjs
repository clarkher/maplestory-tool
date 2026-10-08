// 首頁「能力值與裝備」卡的第二套點法（全幸、裝備法，v0.75）：各角色截圖＋抓字，再實際點一次切換、重新整理看有沒有記住
// 用法：node build-variants-shot.mjs <輸出資料夾> <網址> [職業:等級:點法,…]
//   例：node scripts/verify/build-variants-shot.mjs out http://localhost:3071
//   點法空白＝沒選（主推）；預設跑：刺客 35 一般／全幸、刺客 25 全幸、暗殺者 80 全幸、火毒 50 全智／裝備法（展開看全部）、俠盜 35、狂戰士 35
// 每個角色存 <職業>-<等級>-<點法>.png（整張卡，手機 390 寬），字寫進 results.json；最後一段「click」實際點標籤、重新整理。
// 環境變數 AT：瀏覽器時鐘調到這個時間（ISO）；WIDTH：視窗寬（預設 390，可改 360 看安卓換行）。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const OUT = outDir(process.argv[2], "build-variants-shot");
const BASE = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const ROLES = (process.argv[4] ?? "410:35:,410:35:全幸,410:25:全幸,411:80:全幸,210:50:,210:50:裝備法+,420:35:,110:35:").split(",").map(entry => {
  const [job, level, tab = ""] = entry.split(":");
  return { job: Number(job), level: Number(level), tab: tab.replace(/\+$/, ""), open: tab.endsWith("+") };
});
const WIDTH = Number(process.env.WIDTH ?? 390);
const AT = process.env.AT ? Date.parse(process.env.AT) : null;
const PORT = chromePort(9371);
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, "chrome-profile")}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", `--window-size=${WIDTH},2400`, "about:blank",
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
  // 每個呼叫最多等 60 秒（截圖範圍算錯時 captureScreenshot 會一直不回）
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
// 視窗開很高，整張卡（含「要湊的裝備」）放得進一個畫面：截圖用 captureBeyondViewport: false，固定頁首才不會被畫進卡片中間
await page.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 2400, deviceScaleFactor: 2, mobile: true });
const consoleErrors = [];
page.listeners.add(m => {
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
    consoleErrors.push(m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  }
});

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
  const ok = await Promise.race([loaded, sleep(60000).then(() => false)]);
  page.listeners.delete(listener);
  if (!ok) throw new Error(`載入逾時：${url}`);
}
const clockAt = target => `(() => {
  const RealDate = Date;
  const offset = ${target} - RealDate.now();
  class ShiftedDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(RealDate.now() + offset); else super(...args); }
    static now() { return RealDate.now() + offset; }
  }
  globalThis.Date = ShiftedDate;
})();`;

const H = `
  window.__waitFor = (cond, ms = 40000) => Promise.race([
    new Promise(resolve => {
      if (cond()) return resolve(true);
      const mo = new MutationObserver(() => { if (cond()) { mo.disconnect(); resolve(true); } });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    }),
    new Promise(resolve => setTimeout(() => resolve(false), ms)),
  ]);
  window.__card = () => document.querySelector('section[aria-label="能力值與裝備"]');
  window.__ready = () => { const c = __card(); return Boolean(c && c.querySelector('a[href^="/db/items?id="]') && c.querySelector("dd")); };
  window.__read = () => {
    const card = __card();
    const text = el => el ? el.innerText.replace(/\\s+/g, " ").trim() : null;
    const blocks = [...card.querySelectorAll(":scope > div > div")].map(el => ({ label: text(el.querySelector("h3")), text: text(el) }));
    return {
      tabs: [...card.querySelectorAll('[role="group"][aria-label="點法"] button')].map(b => ({ text: b.textContent.trim(), pressed: b.getAttribute("aria-pressed") })),
      stats: [...card.querySelectorAll("dd")].map(dd => dd.textContent.trim()),
      blocks,
      stored: localStorage.getItem("ms-build"),
    };
  };
  window.__shot = async () => {
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    const card = __card();
    window.scrollTo({ top: card.getBoundingClientRect().top + scrollY - 80, behavior: "instant" });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = card.getBoundingClientRect();
    return { x: 0, y: r.top + scrollY - 8, width: innerWidth, height: Math.min(r.height + 16, innerHeight - r.top) };
  };
`;
const ev = body => evaluate(`(async () => { ${H} ${body} })()`);
async function shot(clip, file) {
  if (!(clip.height > 0)) throw new Error(`截圖範圍不對：${JSON.stringify(clip)}`);
  const r = await page.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
}
async function openRole({ job, level, tab }) {
  await navigate(BASE + "/about");
  await evaluate(`localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("ms-profile", ${JSON.stringify(JSON.stringify({ level, job }))});
    localStorage.setItem("ms-theme", "light");
    ${tab ? `localStorage.setItem("ms-build", ${JSON.stringify(JSON.stringify({ [String(Math.floor(job / 100) * 100)]: tab }))});` : ""} "ok"`);
  await navigate(BASE + "/");
  if (!(await ev(`return await __waitFor(__ready);`))) throw new Error(`${job}:${level} 卡片沒出來`);
  await sleep(1200);
}

const results = [];
try {
  if (AT !== null) await page.send("Page.addScriptToEvaluateOnNewDocument", { source: clockAt(AT) });
  for (const role of ROLES) {
    const name = `${role.job}-${role.level}-${role.tab || "主推"}`;
    await openRole(role);
    if (role.open) {
      await ev(`const b = [...__card().querySelectorAll("button")].find(x => x.textContent.includes("看全部")); b?.click(); await __waitFor(() => __card().innerText.includes("收起"), 5000);`);
      await sleep(600);
    }
    const data = await ev(`return __read();`);
    await shot(await ev(`return await __shot();`), `${name}.png`);
    results.push({ name, ...data });
    console.log(`${name}\t標籤 ${data.tabs.map(t => `${t.text}${t.pressed === "true" ? "●" : ""}`).join("／") || "（沒有）"}\t四格 ${data.stats.join(" ")}`);
    for (const block of data.blocks) console.log(`  [${block.label}] ${block.text?.slice(0, 160)}`);
  }

  // 實際點：刺客 35 沒選 → 點「全幸」→ 卡片換、記住 → 重新整理還是全幸 → 點回「一般點法」→ 清掉
  await openRole({ job: 410, level: 35, tab: "" });
  const steps = [];
  const click = label => ev(`const b = [...__card().querySelectorAll('[role="group"] button')].find(x => x.textContent.trim() === ${JSON.stringify(label)}); b.click(); await new Promise(r => setTimeout(r, 400)); return __read();`);
  steps.push({ step: "點全幸", ...(await click("全幸")) });
  await navigate(BASE + "/");
  await ev(`return await __waitFor(__ready);`);
  await sleep(1200);
  steps.push({ step: "重新整理", ...(await ev(`return __read();`)) });
  await shot(await ev(`return await __shot();`), `click-after-reload.png`);
  steps.push({ step: "點回一般點法", ...(await click("一般點法")) });
  for (const s of steps) console.log(`click ${s.step}\t${s.tabs.map(t => `${t.text}${t.pressed === "true" ? "●" : ""}`).join("／")}\t四格 ${s.stats.join(" ")}\tms-build=${s.stored}`);
  results.push({ name: "click", steps });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  results.push({ consoleErrors });
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(`console 錯誤／警告 ${consoleErrors.length} 筆${consoleErrors.length ? "：\n  " + consoleErrors.slice(0, 8).join("\n  ") : ""}`);
  console.log(`輸出：${OUT}`);
  try { await Promise.race([browser.send("Browser.close"), sleep(2000)]); } catch {}
  await sleep(800);
  try { spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
  await sleep(800);
  process.exit(process.exitCode ?? 0);
}
