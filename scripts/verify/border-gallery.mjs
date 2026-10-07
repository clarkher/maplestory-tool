// 邊框顏色對照頁的截圖：每個編號項目 × 手機/桌機 × 亮/暗，截「現在」「只改邊框」「改後」
// 改後 = 同一次載入裡用 CSSOM 把 * { border-color } 與 :focus-visible 移進 @layer base（跟正式改法同義）
// 用法：node border-gallery.mjs <輸出資料夾> [base] [--only=id,id] [--variants=m-light]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const args = process.argv.slice(2);
const OUT = outDir(args[0], "border-gallery");
const BASE = args[1] && !args[1].startsWith("--") ? args[1] : "http://localhost:3047";
const ONLY = args.find(a => a.startsWith("--only="))?.slice(7).split(",");
const VARIANTS = args.find(a => a.startsWith("--variants="))?.slice(11).split(",") ?? ["m-light", "m-dark", "d-light", "d-dark"];
const PORT = chromePort(9500 + Math.floor(Math.random() * 90));
fs.mkdirSync(path.join(OUT, "img"), { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, "chrome-profile")}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--window-size=1280,900", "about:blank",
], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill(); } catch {} });

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

await getJSON(`http://127.0.0.1:${PORT}/json/version`);
const pageTarget = (await getJSON(`http://127.0.0.1:${PORT}/json/list`)).find(t => t.type === "page");
const page = connect(pageTarget.webSocketDebuggerUrl);
await page.opened;
await page.send("Page.enable");
await page.send("Runtime.enable");

async function evaluate(expression) {
  const r = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
  return r.result.value;
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
  window.__settle = (quiet = 700, max = 15000) => new Promise(resolve => {
    let timer; const t0 = Date.now();
    const done = () => { mo.disconnect(); resolve(Date.now() - t0); };
    const mo = new MutationObserver(() => { clearTimeout(timer); if (Date.now() - t0 > max) return done(); timer = setTimeout(done, quiet); });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    timer = setTimeout(done, quiet);
  });
  window.__byText = (text, root = document) => [...root.querySelectorAll("button, a")].find(b => b.textContent.trim().startsWith(text));
  window.__union = els => {
    const rs = els.filter(Boolean).map(el => el.getBoundingClientRect()).filter(r => r.width || r.height);
    if (!rs.length) return null;
    const x = Math.min(...rs.map(r => r.left)), y = Math.min(...rs.map(r => r.top));
    const x2 = Math.max(...rs.map(r => r.right)), y2 = Math.max(...rs.map(r => r.bottom));
    return [x, y + scrollY, x2 - x, y2 - y];
  };
  window.__applyAfter = withFocus => {
    window.__restore();
    const removed = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (let i = rules.length - 1; i >= 0; i--) {
        const r = rules[i];
        if (!(r instanceof CSSStyleRule)) continue;
        const isBorder = r.selectorText === "*" && /border-color/.test(r.cssText);
        const isFocus = withFocus && r.selectorText === ":focus-visible";
        if (isBorder || isFocus) { removed.push({ sheet, i, text: r.cssText }); sheet.deleteRule(i); }
      }
    }
    const st = document.createElement("style");
    st.id = "__after";
    st.textContent = "@layer base { * { border-color: var(--paper-edge); } }" +
      (withFocus ? " @layer base { :focus-visible { outline: 2px solid var(--maple); outline-offset: 2px; border-radius: 6px; } }" : "");
    document.head.appendChild(st);
    window.__removed = removed;
    return removed.length;
  };
  window.__restore = () => {
    document.getElementById("__after")?.remove();
    for (const { sheet, i, text } of (window.__removed || []).slice().reverse()) sheet.insertRule(text, i);
    window.__removed = [];
  };
`;
const ev = body => evaluate(`(async () => { ${H} ${body} })()`);

const VIEW = {
  m: { width: 375, height: 812, deviceScaleFactor: 2, mobile: true },
  d: { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false },
};
async function setVariant(v) {
  const [vp] = v.split("-");
  await page.send("Emulation.setDeviceMetricsOverride", VIEW[vp]);
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: vp === "m", maxTouchPoints: vp === "m" ? 5 : 1 });
}
let initScript = null;
async function load(url, storage, waitData = true) {
  if (initScript) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: initScript });
  const src = `try { localStorage.clear(); sessionStorage.clear(); ${Object.entries(storage).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(" ")} } catch (e) {}`;
  initScript = (await page.send("Page.addScriptToEvaluateOnNewDocument", { source: src })).identifier;
  // 先跳空白頁：同一頁只換 # 不會觸發載入完成事件，會一直等下去
  const blank = new Promise(res => {
    const l = m => { if (m.method === "Page.frameStoppedLoading") { page.listeners.delete(l); res(); } };
    page.listeners.add(l);
  });
  await page.send("Page.navigate", { url: "about:blank" });
  await Promise.race([blank, sleep(3000)]);
  const loaded = new Promise((res, rej) => {
    const l = m => { if (m.method === "Page.loadEventFired") { page.listeners.delete(l); clearTimeout(t); res(); } };
    const t = setTimeout(() => { page.listeners.delete(l); rej(new Error(`載入逾時：${url}`)); }, 90000);
    page.listeners.add(l);
  });
  await page.send("Page.navigate", { url });
  await loaded;
  await ev(`await document.fonts.ready; ${waitData ? "await __waitFor(() => !document.querySelector('main [aria-busy=true], main .animate-spin'), 30000);" : ""} await __settle(900, 20000); return 1;`);
}
async function tap(selectorExpr) {
  const p = await ev(`const el = ${selectorExpr}; if (!el) return null; el.scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(250); const r = el.getBoundingClientRect(); return { x: r.x + Math.min(r.width / 2, 60), y: r.y + r.height / 2, touch: navigator.maxTouchPoints > 1 };`);
  if (!p) throw new Error(`找不到要點的元素：${selectorExpr}`);
  if (p.touch) {
    await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
  }
  await ev(`await __settle(600, 8000); return 1;`);
  // 觸控沒點到（版面還在動）就直接 focus：文字輸入框兩種方式的 :focus-visible 一樣成立
  const fixed = await ev(`const el = ${selectorExpr}; if (el.tagName === "INPUT" && document.activeElement !== el) { el.focus(); await __sleep(300); return true; } return false;`);
  if (fixed) console.log("  (tap 沒聚焦，改用 focus())", selectorExpr.slice(0, 60));
}
async function hover(selectorExpr) {
  const p = await ev(`const el = ${selectorExpr}; if (!el) return null; el.scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(250); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
  if (!p) throw new Error(`找不到要移過去的元素：${selectorExpr}`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
  await sleep(400);
}
async function keyboardFocus(selectorExpr) {
  await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 });
  const ok = await ev(`const el = ${selectorExpr}; if (!el) return false; el.scrollIntoView({ block: "center", behavior: "instant" }); el.focus(); await __sleep(300); return el.matches(":focus-visible");`);
  if (!ok) throw new Error(`鍵盤焦點沒成立：${selectorExpr}`);
}
async function crop(file, rect, pad, maxH) {
  const [x, y, w, h0] = rect;
  const h = Math.min(h0, maxH);
  const vp = await ev(`window.scrollTo({ top: Math.max(0, ${y} - ${pad} - Math.max(0, (innerHeight - ${h + pad * 2}) / 2)), behavior: "instant" }); await __sleep(300); return { vw: innerWidth, vh: innerHeight, sy: scrollY };`);
  const cx = Math.max(0, Math.floor(x - pad)), cy = Math.max(0, Math.floor(y - pad));
  const cw = Math.min(vp.vw - cx, Math.ceil(w + pad * 2)), ch = Math.ceil(h + pad * 2);
  const r = await page.send("Page.captureScreenshot", { format: "webp", quality: 90, clip: { x: cx, y: cy, width: cw, height: ch, scale: 1 }, captureBeyondViewport: ch > vp.vh });
  fs.writeFileSync(path.join(OUT, "img", file), Buffer.from(r.data, "base64"));
  return { w: cw, h: ch };
}

const P25 = JSON.stringify({ level: 25, job: 400 });
const P35 = JSON.stringify({ level: 35, job: 410 });
const clickText = t => ev(`const b = __byText(${JSON.stringify(t)}, document.querySelector("main")); if (!b) throw new Error("找不到按鈕 ${t}"); b.click(); await __settle(600, 8000); return 1;`);

// 每一項：去哪一頁、做什麼動作、截哪裡、要截哪幾種狀態
const ITEMS = [
  { id: "db-search", path: "/db/items", storage: {},
    prep: () => tap(`document.querySelector("main input[aria-label^=搜尋]")`),
    target: `[document.querySelector("main input[aria-label^=搜尋]").parentElement]`, pad: 14, states: ["before", "B", "BF"] },
  { id: "go-search", path: "/go", storage: {},
    prep: () => tap(`document.querySelector("main input")`),
    target: `[document.querySelector("main input").parentElement]`, pad: 14, states: ["before", "BF"] },
  { id: "farm-search", path: "/plan/farm", storage: { "ms-profile": P25 },
    prep: () => tap(`document.querySelector("main input[aria-label=搜尋道具]")`),
    target: `[document.querySelector("main input[aria-label=搜尋道具]").parentElement]`, pad: 14, states: ["before", "BF"] },
  { id: "level-input", path: "/", storage: { "ms-profile": P25 },
    prep: async () => { await clickText("換其他職業"); await tap(`document.querySelector("main input")`); },
    target: `[document.querySelector("main input").parentElement]`, pad: 14, states: ["before", "B", "BF"] },
  { id: "profile-input", path: "/plan/train", storage: {},
    prep: () => tap(`document.querySelector("main input[aria-label=你的等級]")`),
    target: `[document.querySelector("main input[aria-label=你的等級]")]`, pad: 14, states: ["before", "BF"] },
  { id: "go-pill", path: "/", storage: { "ms-profile": P25 },
    target: `[[...document.querySelectorAll("main a")].find(a => a.textContent.trim().startsWith("帶我去") && a.className.includes("border-[color:var(--maple)]"))?.closest("li")]`, pad: 10, maxH: 260, states: ["before", "BF"] },
  { id: "sky-pill", path: "/", storage: { "ms-profile": P25 },
    target: `[__byText("看打法")?.parentElement]`, pad: 12, states: ["before", "BF"] },
  { id: "job-chip", path: "/", storage: { "ms-profile": P35 },
    prep: () => clickText("換其他職業"),
    target: `[[...document.querySelectorAll("main button[aria-pressed=false]")].find(b => b.className.includes("border-[color:var(--maple)]"))?.parentElement]`, pad: 12, states: ["before", "BF"] },
  { id: "spinner", path: "/plan/train", storage: { "ms-profile": P25 }, blockData: true,
    target: `[document.querySelector("main .animate-spin")?.parentElement, document.querySelector("main .animate-spin")?.closest(".glass")?.querySelector("p")]`, pad: 16, states: ["before", "BF"] },
  { id: "timeline", path: "/", storage: { "ms-profile": P25 },
    target: `(() => { const dots = [...document.querySelectorAll("main li.relative > span[aria-hidden]")]; const cur = dots.findIndex(d => d.className.includes("bg-[color:var(--maple)]")); return dots.slice(Math.max(0, cur - 2), cur + 1).flatMap(d => [d, d.closest("li").querySelector(":scope > div > button")]); })()`, pad: 10, maxH: 420, states: ["before", "BF"] },
  { id: "hover-change", path: "/", storage: { "ms-profile": P25 }, desktopOnly: true,
    prep: () => hover(`__byText("換其他職業")`),
    target: `[__byText("換其他職業")]`, pad: 12, states: ["before", "BF"] },
  { id: "cards", path: "/", storage: { "ms-profile": P25 },
    target: `[document.querySelector("main section[aria-label='你的角色']"), document.querySelector("main article[aria-label='現在去這裡']")]`, pad: 12, maxH: 560, states: ["before", "BF"] },
  { id: "db-cards", path: "/db", storage: {},
    target: `[...document.querySelectorAll("main a.glass")].slice(0, 4)`, pad: 12, maxH: 420, states: ["before", "BF"] },
  { id: "header", path: "/db", storage: {},
    target: `[document.querySelector("header")]`, pad: 0, padBottom: 24, states: ["before", "BF"] },
  { id: "dropdown", path: "/go", storage: {},
    prep: async () => { await tap(`document.querySelector("main input")`); await page.send("Input.insertText", { text: "弓箭手" }); await ev(`await __settle(600, 8000); return 1;`); },
    target: `[document.querySelector("main ul.absolute")]`, pad: 12, maxH: 300, states: ["before", "BF"] },
  { id: "loading-box", path: "/plan/train", storage: { "ms-profile": P25 }, blockData: true,
    target: `[document.querySelector("main .animate-spin")?.closest(".glass")]`, pad: 12, states: ["before", "BF"] },
  { id: "skill-box", path: "/", storage: { "ms-profile": P25 },
    prep: () => ev(`document.querySelector("main section[aria-label=技能怎麼點] > button").click(); await __settle(600, 8000); return 1;`),
    target: `[document.querySelector("main section[aria-label=技能怎麼點]")]`, pad: 12, maxH: 360, states: ["before", "BF"] },
  { id: "kbd-pill", path: "/", storage: { "ms-profile": P25 },
    prep: () => keyboardFocus(`__byText("看打法")`),
    target: `[__byText("看打法")?.parentElement]`, pad: 12, states: ["before", "BF"] },
];

// 只重截幾項時（--only），保留之前截好的其他項
const manifestPath = path.join(OUT, "manifest.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { base: BASE, items: {} };
manifest.at = new Date().toISOString();
const errors = [];
for (const item of ITEMS) {
  if (ONLY && !ONLY.includes(item.id)) continue;
  for (const v of VARIANTS) {
    if (item.desktopOnly && v.startsWith("m")) continue;
    try {
      await setVariant(v);
      if (item.blockData) await page.send("Fetch.enable", { patterns: [{ urlPattern: "*/data/*" }] });
      await load(BASE + item.path, { ...item.storage, "ms-theme": v.split("-")[1] }, !item.blockData);
      if (item.prep) await item.prep();
      const rect = await ev(`return __union(${item.target});`);
      if (!rect) throw new Error("找不到要截的區塊");
      if (item.padBottom) rect[3] += item.padBottom;
      const out = {};
      for (const state of item.states) {
        if (state === "before") await ev(`__restore(); return 1;`);
        else await ev(`return __applyAfter(${state === "BF"});`);
        await sleep(500);
        const file = `${item.id}__${v}__${state}.webp`;
        out[state] = { file, ...(await crop(file, rect, item.pad, item.maxH ?? 900)) };
      }
      await ev(`__restore(); return 1;`);
      (manifest.items[item.id] ??= {})[v] = out;
      console.log(item.id, v, "ok", JSON.stringify(rect.map(Math.round)));
    } catch (e) {
      errors.push({ item: item.id, v, error: String(e).slice(0, 300) });
      console.log(item.id, v, "ERROR", String(e).slice(0, 300));
    } finally {
      if (item.blockData) await page.send("Fetch.disable").catch(() => {});
    }
  }
}
manifest.errors = errors;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
chrome.kill();
process.exit(0);
