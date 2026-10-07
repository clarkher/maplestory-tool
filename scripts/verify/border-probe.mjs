// 全站邊框顏色：現況 vs「* 的 border-color 移進 @layer base」逐元素比對＋裁圖
// 改後是在同一次載入裡用 CSSOM 模擬（刪掉沒進 layer 的 * 規則、補一條 @layer base），所以元素一一對得上。
// 用法：node border-probe.mjs <輸出資料夾> [base] [--only=id,id] [--variants=m-light,d-dark]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const args = process.argv.slice(2);
const OUT = outDir(args[0], "border-probe");
const BASE = args[1] && !args[1].startsWith("--") ? args[1] : "http://localhost:3047";
const ONLY = args.find(a => a.startsWith("--only="))?.slice(7).split(",");
const NOCROP = args.includes("--nocrop");
const VARIANTS = args.find(a => a.startsWith("--variants="))?.slice(11).split(",") ?? ["m-light", "m-dark", "d-light", "d-dark"];
const PORT = chromePort(9400 + Math.floor(Math.random() * 90));
fs.mkdirSync(path.join(OUT, "crops"), { recursive: true });
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
  // 畫面靜下來：連續 quiet 毫秒沒有 DOM 變動
  window.__settle = (quiet = 700, max = 15000) => new Promise(resolve => {
    let timer; const t0 = Date.now();
    const done = () => { mo.disconnect(); resolve(Date.now() - t0); };
    const mo = new MutationObserver(() => { clearTimeout(timer); if (Date.now() - t0 > max) return done(); timer = setTimeout(done, quiet); });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    timer = setTimeout(done, quiet);
  });
  window.__byText = (text, root = document) => [...root.querySelectorAll("button, a")].find(b => b.textContent.trim().startsWith(text));
  window.__pathOf = el => { const parts = []; while (el && el !== document.body) { const p = el.parentElement; parts.unshift(el.tagName.toLowerCase() + ":" + [...p.children].indexOf(el)); el = p; } return parts.join("/"); };
  window.__byPath = p => { let el = document.body; for (const part of p.split("/")) { const i = Number(part.split(":")[1]); el = el?.children[i]; } return el; };
  window.__borders = () => {
    const res = {};
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden") continue;
      const sides = {};
      for (const s of ["Top", "Right", "Bottom", "Left"]) {
        const w = parseFloat(cs["border" + s + "Width"]);
        const st = cs["border" + s + "Style"];
        if (w > 0 && st !== "none" && st !== "hidden") sides[s[0]] = cs["border" + s + "Color"] + " " + w + " " + st;
      }
      const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? cs.outlineColor + " " + cs.outlineWidth + " off " + cs.outlineOffset : null;
      if (!Object.keys(sides).length && !outline) continue;
      res[window.__pathOf(el)] = {
        sides, outline, radius: cs.borderTopLeftRadius,
        cls: el.getAttribute("class") || "", tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().replace(/\\s+/g, " ").slice(0, 28),
        rect: [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)],
      };
    }
    return res;
  };
  // 模擬改後：刪掉最外層（沒進 layer）的 * { border-color } 〔withFocus 時連 :focus-visible 一起〕，改放進 @layer base
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
    return removed.map(x => x.text.slice(0, 60));
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
  // 資料還在載（轉圈或 aria-busy）就繼續等；讀取中那一格例外
  await ev(`await document.fonts.ready; ${waitData ? "await __waitFor(() => !document.querySelector('main [aria-busy=true], main .animate-spin'), 30000);" : ""} await __settle(900, 20000); return 1;`);
}
async function crop(file, rect, pad = 14) {
  // rect 是文件座標 [x, y, w, h]；先捲到看得見再截，避免 fixed 背景／毛玻璃在畫面外算錯
  const [x, y, w, h] = rect;
  const vp = await ev(`window.scrollTo({ top: Math.max(0, ${y} - (innerHeight - ${h}) / 2), behavior: "instant" }); await __sleep(250); return { sx: scrollX, sy: scrollY, vw: innerWidth, vh: innerHeight };`);
  const cx = Math.max(0, x - pad), cy = Math.max(0, y - pad);
  const cw = Math.min(vp.vw - cx, w + pad * 2), ch = Math.min(h + pad * 2, 1600);
  const r = await page.send("Page.captureScreenshot", { format: "png", clip: { x: cx, y: cy, width: cw, height: ch, scale: 1 }, captureBeyondViewport: ch > vp.vh });
  fs.writeFileSync(path.join(OUT, "crops", file), Buffer.from(r.data, "base64"));
}
async function mouseTo(rect) {
  const p = await ev(`const el = __byPath(${JSON.stringify(rect.path)}); el.scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(200); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
  await sleep(400);
}
async function tap(selectorExpr) {
  // 真的點一下（手機用觸控、桌機用滑鼠），讓 :focus-visible／onFocus 跟使用者一樣觸發
  const p = await ev(`const el = ${selectorExpr}; if (!el) return null; el.scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(250); const r = el.getBoundingClientRect(); return { x: r.x + Math.min(r.width / 2, 60), y: r.y + r.height / 2 };`);
  if (!p) return false;
  const touch = (await ev(`return navigator.maxTouchPoints > 1;`));
  if (touch) {
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
  return true;
}
async function keyboardFocus(selectorExpr) {
  // 先按一下鍵盤（Shift），再 focus：瀏覽器會當成鍵盤操作，:focus-visible 成立
  await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 });
  return ev(`const el = ${selectorExpr}; if (!el) return false; el.scrollIntoView({ block: "center", behavior: "instant" }); el.focus(); await __sleep(300); return el.matches(":focus-visible");`);
}

const PROFILE = JSON.stringify({ level: 25, job: 400 });
const clickText = t => async () => ev(`const b = __byText(${JSON.stringify(t)}, document.querySelector("main")); if (b) { b.click(); await __settle(600, 8000); } return !!b;`);
const expandFirst = (n = 1) => async () => ev(`let k = 0; for (const b of [...document.querySelectorAll("main li button[aria-expanded=false]")].slice(0, ${n})) { b.click(); k++; await __settle(600, 8000); } return k;`);
const tapRow = i => async () => ev(`await __waitFor(() => document.querySelectorAll("li[id^=db-row-]").length > ${i}); const li = document.querySelectorAll("li[id^=db-row-]")[${i}]; li?.querySelector(":scope > button")?.click(); await __settle(900, 10000); return !!li;`);

// focus：要比對「只改邊框」跟「邊框＋:focus-visible 一起改」兩種
const SCENARIOS = [
  { id: "home", path: "/", storage: { "ms-profile": PROFILE } },
  { id: "home-edit", path: "/", storage: { "ms-profile": PROFILE }, steps: [clickText("換其他職業")] },
  { id: "home-more", path: "/", storage: { "ms-profile": PROFILE }, steps: [clickText("看全部"), clickText("還有 ")] },
  { id: "home-new", path: "/", storage: {} },
  { id: "db", path: "/db", storage: {} },
  { id: "db-items", path: "/db/items", storage: {}, steps: [tapRow(1)] },
  { id: "db-monsters", path: "/db/monsters", storage: {}, steps: [tapRow(1)] },
  { id: "db-quests", path: "/db/quests", storage: {}, steps: [tapRow(1)] },
  { id: "db-skills", path: "/db/skills", storage: {}, steps: [tapRow(1)] },
  { id: "go", path: "/go", storage: {} },
  { id: "go-route", path: "/go?to=105040300", storage: { "ms-go-start": "104000000" }, steps: [expandFirst(1)] },
  { id: "guide", path: "/guide", storage: { "ms-profile": PROFILE } },
  { id: "guide-pq", path: "/guide#pq-kerning", storage: { "ms-profile": PROFILE } },
  { id: "plan-train", path: "/plan/train", storage: { "ms-profile": PROFILE }, steps: [expandFirst(1)] },
  { id: "plan-train-new", path: "/plan/train", storage: {} },
  { id: "plan-quest", path: "/plan/quest", storage: { "ms-profile": PROFILE }, steps: [expandFirst(1)] },
  { id: "plan-bundle", path: "/plan/bundle", storage: { "ms-profile": PROFILE }, steps: [expandFirst(1)] },
  { id: "plan-farm", path: "/plan/farm", storage: { "ms-profile": PROFILE } },
  { id: "about", path: "/about", storage: {} },
  { id: "contact", path: "/contact", storage: {} },
  { id: "privacy", path: "/privacy", storage: {} },
  { id: "terms", path: "/terms", storage: {} },
  { id: "loading", path: "/plan/train", storage: { "ms-profile": PROFILE }, blockData: true },
  // 只有毛玻璃的區塊：技能區展開、目前這段路線收合、地圖下拉選單
  { id: "home-skill", path: "/", storage: { "ms-profile": PROFILE }, steps: [async () => ev(`document.querySelector("main section[aria-label=技能怎麼點] > button").click(); await __settle(600, 8000); return 1;`)] },
  { id: "home-tl-collapsed", path: "/", storage: { "ms-profile": PROFILE }, steps: [async () => ev(`const b = [...document.querySelectorAll("main li.relative button[aria-expanded=true]")][0]; b.click(); await __settle(600, 8000); return 1;`)] },
  { id: "go-dropdown", path: "/go", storage: {}, steps: [async () => { await tap(`document.querySelector("main input")`); await page.send("Input.insertText", { text: "弓箭手" }); await ev(`await __settle(600, 8000); return 1;`); }] },
  // 互動狀態
  { id: "focus-db-search", path: "/db/items", storage: {}, focus: `document.querySelector("main input[aria-label^=搜尋]")`, focusCrop: "parent" },
  { id: "focus-go-picker", path: "/go", storage: {}, focus: `document.querySelector("main input")`, focusCrop: "grandparent" },
  { id: "focus-farm-search", path: "/plan/farm", storage: { "ms-profile": PROFILE }, focus: `document.querySelector("main input[aria-label=搜尋道具]")`, focusCrop: "parent" },
  { id: "focus-profile-level", path: "/plan/train", storage: {}, focus: `document.querySelector("main input[aria-label=你的等級]")`, focusCrop: "self" },
  { id: "focus-home-level", path: "/", storage: { "ms-profile": PROFILE }, steps: [clickText("換其他職業")], focus: `document.querySelector("main input")`, focusCrop: "self" },
  { id: "kbd-home-pill", path: "/", storage: { "ms-profile": PROFILE }, kbd: `__byText("看打法")`, focusCrop: "self" },
  { id: "hover-home-change", path: "/", storage: { "ms-profile": PROFILE }, hover: `__byText("換其他職業")`, desktopOnly: true },
  { id: "hover-go-picker", path: "/go?to=105040300", storage: { "ms-go-start": "104000000" }, hover: `[...document.querySelectorAll("main button")].find(b => b.textContent.includes("更改"))`, desktopOnly: true },
];

const report = { base: BASE, at: new Date().toISOString(), scenarios: {} };
const errors = [];
for (const sc of SCENARIOS) {
  if (ONLY && !ONLY.includes(sc.id)) continue;
  for (const v of VARIANTS) {
    if (sc.desktopOnly && v.startsWith("m")) continue;
    const key = `${sc.id}__${v}`;
    try {
      await setVariant(v);
      const theme = v.split("-")[1];
      if (sc.blockData) await page.send("Fetch.enable", { patterns: [{ urlPattern: "*/data/*" }] });
      await load(BASE + sc.path, { ...sc.storage, "ms-theme": theme }, !sc.blockData);
      for (const step of sc.steps ?? []) await step();
      let target = null;
      if (sc.focus) {
        const ok = await tap(sc.focus);
        const st = await ev(`const el = document.activeElement; return { tag: el?.tagName, fv: el?.matches(":focus-visible"), path: __pathOf(el) };`);
        target = { ok, ...st };
      }
      if (sc.kbd) {
        const fv = await keyboardFocus(sc.kbd);
        target = { ok: true, fv, path: await ev(`return __pathOf(document.activeElement);`) };
      }
      if (sc.hover) {
        const p = await ev(`const el = ${sc.hover}; return el ? __pathOf(el) : null;`);
        if (p) await mouseTo({ path: p });
        target = { ok: !!p, path: p };
      }
      const before = await ev(`return __borders();`);
      const modes = sc.focus || sc.kbd ? ["B", "BF"] : ["B"];
      const result = { target, modes: {} };
      for (const mode of modes) {
        const removed = await ev(`return __applyAfter(${mode === "BF"});`);
        await sleep(450); // transition-colors 跑完
        const after = await ev(`return __borders();`);
        const changed = [];
        for (const [p, b] of Object.entries(before)) {
          const a = after[p];
          if (!a) { changed.push({ path: p, kind: "gone", before: b }); continue; }
          const sig = x => JSON.stringify([x.sides, x.outline, x.radius]);
          if (sig(a) !== sig(b)) changed.push({ path: p, cls: b.cls, tag: b.tag, text: b.text, rect: b.rect, before: { sides: b.sides, outline: b.outline, radius: b.radius }, after: { sides: a.sides, outline: a.outline, radius: a.radius } });
        }
        for (const p of Object.keys(after)) if (!before[p]) changed.push({ path: p, kind: "new", after: after[p] });
        // 裁圖：互動狀態截目標，其他截每個變了的元素（同一個 class 只截第一個）
        const shots = [];
        if (target?.path) {
          const rect = await ev(`let el = __byPath(${JSON.stringify(target.path)}); const how = ${JSON.stringify(sc.focusCrop ?? "self")}; if (how === "parent") el = el.parentElement; if (how === "grandparent") el = el.parentElement.parentElement; const r = el.getBoundingClientRect(); const extra = how === "grandparent" ? Math.min(320, document.querySelector("main ul.absolute")?.getBoundingClientRect().height ?? 0) : 0; return [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height + extra)];`);
          shots.push({ name: "target", rect });
        } else {
          const seen = new Set();
          for (const c of changed) {
            if (!c.rect || seen.has(c.cls)) continue;
            seen.add(c.cls);
            shots.push({ name: String(shots.length + 1).padStart(2, "0"), rect: c.rect, cls: c.cls, text: c.text });
          }
        }
        if (NOCROP) shots.length = 0;
        for (const s of shots) await crop(`${key}__${mode}__${s.name}__after.png`, s.rect);
        await ev(`__restore(); return 1;`);
        if (shots.length) await sleep(450);
        for (const s of shots) await crop(`${key}__${mode}__${s.name}__before.png`, s.rect);
        result.modes[mode] = { removed, changed, shots };
      }
      // 全頁截一張現況，之後跟正式改版對照用
      result.total = Object.keys(before).length;
      report.scenarios[key] = result;
      fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
      console.log(key, "bordered:", result.total, Object.entries(result.modes).map(([m, r]) => `${m}:${r.changed.length}`).join(" "), target ? JSON.stringify(target) : "");
    } catch (e) {
      errors.push({ key, error: String(e).slice(0, 400) });
      console.log(key, "ERROR", String(e).slice(0, 300));
    } finally {
      if (sc.blockData) await page.send("Fetch.disable").catch(() => {});
    }
  }
}
report.errors = errors;
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
chrome.kill();
process.exit(0);
