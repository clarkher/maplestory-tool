// 首頁「能力值與裝備」卡的第二套點法（全幸、裝備法；v0.75，v0.76 改單選按鈕）：各角色截卡片＋升級路線的「裝備」、抓字，
// 再實際點一次切換、重新整理看有沒有記住，用鍵盤方向鍵換一次，量「要湊的敏捷裝備」的字夠不夠清楚
// 用法：node build-variants-shot.mjs <輸出資料夾> <網址> [職業:等級:點法,…]
//   例：node scripts/verify/build-variants-shot.mjs out http://localhost:3071
//   點法空白＝沒選（主推）；後面加 +＝先點「看全部」再截。預設跑 11 個：刺客 35 一般／全幸、刺客 25 全幸、暗殺者 80 全幸、
//   俠盜 35 全幸、神偷 80 全幸、火毒 50 沒選／全智（展開）／裝備法（展開）、法師 10 裝備法、狂戰士 35
// 輸出：
//   <職業>-<等級>-<點法>.png        整張卡（手機 390 寬；卡片比 2400 高時暫時把視窗拉高再截），截前等卡片裡的圖載完，
//                                   字寫進 results.json（標籤、標籤下那行說明、四格、每一區的字、grown、missingImages）
//   route-<職業>-<等級>-<點法>.png  有點法標籤的角色，升級路線「你在這」那一段的「裝備」（字在 results.json 的 route）
//   click-after-reload.png          「click」：刺客 35 點「全幸」→ 重新整理 → 點回「一般點法」
//   results.json 另有 keyboard（方向鍵換選）、contrast（刺客 25 全幸「要湊的敏捷裝備」對比最低的 5 個字）
// 環境變數 AT：瀏覽器時鐘調到這個時間（ISO）；WIDTH：視窗寬（預設 390，可改 360 看安卓換行）。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const OUT = outDir(process.argv[2], "build-variants-shot");
const BASE = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const DEFAULT_ROLES = "410:35:,410:35:全幸,410:25:全幸,411:80:全幸,420:35:全幸,421:80:全幸,210:50:,210:50:全智+,210:50:裝備法+,200:10:裝備法,110:35:";
const ROLES = (process.argv[4] ?? DEFAULT_ROLES).split(",").map(entry => {
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
  // 每個呼叫最多等 150 秒（截圖範圍算錯時 captureScreenshot 會一直不回）；比頁面裡等卡片的 90 秒長，慢機器等得完
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    const timer = setTimeout(() => { pending.delete(i); reject(new Error(`DevTools 逾時：${method}`)); }, 150000);
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
// 無頭分頁預設不算「有焦點」：鍵盤測試要 focus() 跟方向鍵照真的瀏覽器那樣走
await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
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
  // 上限放寬到 2 分鐘：本機 next dev 在 CPU 被吃滿時整頁載入會超過 1 分鐘（2026-10-08）；機器快時不影響
  const ok = await Promise.race([loaded, sleep(120000).then(() => false)]);
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

// 頁面裡的小工具。量位置前先關掉 html 的平滑捲動；captureScreenshot 的 clip 是整頁座標（視窗座標加 scrollY）
const H = `
  window.__waitFor = (cond, ms = 90000) => Promise.race([
    new Promise(resolve => {
      if (cond()) return resolve(true);
      const mo = new MutationObserver(() => { if (cond()) { mo.disconnect(); resolve(true); } });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    }),
    new Promise(resolve => setTimeout(() => resolve(false), ms)),
  ]);
  window.__card = () => document.querySelector('section[aria-label="能力值與裝備"]');
  window.__ready = () => { const c = __card(); return Boolean(c && c.querySelector('a[href^="/db/items?id="]') && c.querySelector("dd")); };
  window.__group = () => __card()?.querySelector('[role="radiogroup"][aria-label="點法"]') ?? null;
  window.__radios = () => [...(__group()?.querySelectorAll('[role="radio"]') ?? [])];
  window.__text = el => el ? el.innerText.replace(/\\s+/g, " ").trim() : null;
  window.__read = () => {
    const card = __card();
    const group = __group();
    // 標籤下面那行說明（「全幸：前期打得比較痛…」）：radiogroup 後面那個 <p>
    const after = group?.nextElementSibling;
    const blocks = [...card.querySelectorAll(":scope > div > div")].map(el => ({
      label: __text(el.querySelector("h3")) ?? (el.querySelector('[role="radiogroup"]') ? "點法" : null),
      text: __text(el),
    }));
    return {
      tabs: __radios().map(b => ({ text: b.textContent.trim(), checked: b.getAttribute("aria-checked"), tabIndex: b.tabIndex })),
      tabText: after?.tagName === "P" ? __text(after) : null,
      stats: [...card.querySelectorAll("dd")].map(dd => dd.textContent.trim()),
      blocks,
      stored: localStorage.getItem("ms-build"),
    };
  };
  window.__jumpTo = async (el, gap) => {
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - gap, behavior: "instant" });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  };
  // 等一塊裡的圖都載完（next/image 預設 lazy，CPU 吃滿時截圖會截到還沒出來的空格）；回傳載不到的張數
  window.__images = (el, ms = 15000) => Promise.race([
    Promise.all([...el.querySelectorAll("img")].map(img => {
      img.loading = "eager";
      return img.complete ? null : new Promise(r => { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); });
    })),
    new Promise(r => setTimeout(r, ms)),
  ]).then(() => [...el.querySelectorAll("img")].filter(img => !img.complete || img.naturalWidth === 0).length);
  window.__shot = async () => {
    const card = __card();
    await __jumpTo(card, 80);
    const missing = await __images(card);
    const r = card.getBoundingClientRect();
    // cut：卡片比視窗剩下的高度還長，這樣截會少掉底部（cardShot 會把視窗拉高再截）
    return { x: 0, y: r.top + scrollY - 8, width: innerWidth, height: Math.min(r.height + 16, innerHeight - r.top + 8), cut: r.bottom + 8 > innerHeight, missing };
  };
`;
const ev = body => evaluate(`(async () => { ${H} ${body} })()`);
async function shot({ x, y, width, height }, file) {
  if (!(height > 0)) throw new Error(`截圖範圍不對：${JSON.stringify({ x, y, width, height })}`);
  const r = await page.send("Page.captureScreenshot", { format: "png", clip: { x, y, width, height, scale: 1 }, captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
}
/** 截整張卡；卡片比視窗剩下的高度還長（展開的法師卡會超過 2400）就暫時把視窗拉高到放得下，截完改回來 */
async function cardShot(file) {
  const clip = await ev(`return await __shot();`);
  if (!clip.cut) {
    await shot(clip, file);
    return { grown: null, missing: clip.missing };
  }
  const need = await ev(`return Math.ceil(__card().getBoundingClientRect().height + 200);`);
  await page.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: need, deviceScaleFactor: 2, mobile: true });
  await sleep(600);
  const tall = await ev(`return await __shot();`);
  await shot(tall, file);
  await page.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 2400, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  return { grown: need, cut: tall.cut, missing: tall.missing };
}
async function openRole({ job, level, tab }) {
  // 先到同網域的一張靜態圖寫 localStorage（不用多編譯、多載一整頁 /about；本機 dev 在 CPU 吃滿時那一頁會拖到逾時）
  await navigate(BASE + "/brand-emblem.png");
  await evaluate(`localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("ms-profile", ${JSON.stringify(JSON.stringify({ level, job }))});
    localStorage.setItem("ms-theme", "light");
    ${tab ? `localStorage.setItem("ms-build", ${JSON.stringify(JSON.stringify({ [String(Math.floor(job / 100) * 100)]: tab }))});` : ""} "ok"`);
  await navigate(BASE + "/");
  if (!(await ev(`return await __waitFor(__ready);`))) throw new Error(`${job}:${level} 卡片沒出來`);
  await sleep(1200);
}
const tabLine = tabs => tabs.map(t => `${t.text}${t.checked === "true" ? "●" : ""}`).join("／") || "（沒有）";

// 升級路線「你在這」那一段的「裝備」：沒展開就點開，等武器出來，捲到頁首下面截
const ROUTE = `
  const li = [...document.querySelectorAll('section[aria-label="升級路線"] li')].find(el => el.querySelector("button[aria-expanded]")?.textContent.includes("你在這"));
  if (!li) return { error: "找不到「你在這」那一段" };
  const button = li.querySelector("button[aria-expanded]");
  if (button.getAttribute("aria-expanded") !== "true") button.click();
  // 小標是 <p>「裝備」＋出處標籤，它的上一層就是整塊
  const gearBlock = () => [...li.querySelectorAll("p")].find(p => p.firstChild?.nodeType === 3 && p.firstChild.textContent.trim() === "裝備")?.parentElement;
  if (!(await __waitFor(() => Boolean(gearBlock()?.querySelector('a[href^="/db/items?id="]')), 60000))) return { error: "「裝備」那塊 60 秒沒出來" };
  await new Promise(r => setTimeout(r, 600));
  const block = gearBlock();
  await __jumpTo(block, 80);
  const missing = await __images(block);
  const r = block.getBoundingClientRect();
  return {
    range: __text(button),
    rows: [...block.querySelectorAll("li")].map(row => __text(row)),
    missing,
    clip: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: Math.min(r.bottom, innerHeight) - r.top },
  };
`;

// 對比：一塊裡每個有直接文字的元素，字色疊在實際背景上。顏色一律畫在 canvas 上讀回來（oklch、color-mix 都認得）；
// 背景從 <html> 一路疊到那個元素（不透明的直接蓋掉、半透明的跟下層混），opacity 照群組合成算（o×裡面＋(1−o)×下層）。
// 沒算 background-image（漸層、圖）跟 backdrop-filter：卡片裡的區塊都是純色底，夠用。
const CONTRAST = `
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const pixel = (base, css) => { ctx.globalAlpha = 1; ctx.fillStyle = base; ctx.fillRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  // 一個 CSS 顏色 → 預乘的 rgb（0–255）跟 alpha：畫在黑底、白底各一次反推
  const rgba = css => {
    const black = pixel("#000", css), white = pixel("#fff", css);
    const alpha = 1 - (white[0] - black[0] + white[1] - black[1] + white[2] - black[2]) / (3 * 255);
    return { pre: black, alpha: Math.max(0, Math.min(1, alpha)) };
  };
  const over = (css, below) => { const { pre, alpha } = rgba(css); return below.map((c, i) => pre[i] + (1 - alpha) * c); };
  const mix = (o, top, below) => top.map((c, i) => o * c + (1 - o) * below[i]);
  const lum = rgb => {
    const [r, g, b] = rgb.map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hex = rgb => "#" + rgb.map(c => Math.round(c).toString(16).padStart(2, "0")).join("");
  const measure = el => {
    const chain = [];
    for (let node = el; node; node = node.parentElement) chain.unshift(node);
    let bg = [255, 255, 255];
    const groups = [];
    for (const node of chain) {
      const style = getComputedStyle(node);
      const o = Number(style.opacity);
      if (o < 1) groups.push({ o, base: bg });
      bg = over(style.backgroundColor, bg);
    }
    let fg = over(getComputedStyle(el).color, bg);
    for (const { o, base } of groups.reverse()) { bg = mix(o, bg, base); fg = mix(o, fg, base); }
    return { bg, fg };
  };
  const scope = __block();
  if (!scope) return { error: "找不到那一塊" };
  const rows = [];
  for (const el of [scope, ...scope.querySelectorAll("*")]) {
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").replace(/\\s+/g, " ").trim();
    if (!own) continue;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (rect.width <= 1 || rect.height <= 1 || style.visibility === "hidden") continue;
    const { bg, fg } = measure(el);
    rows.push({ text: own.slice(0, 40), color: hex(fg), cssColor: style.color, bg: hex(bg), ratio: Math.round(ratio(fg, bg) * 100) / 100, size: style.fontSize, weight: style.fontWeight });
  }
  rows.sort((a, b) => a.ratio - b.ratio);
  return { count: rows.length, min: rows[0]?.ratio ?? null, lowest: rows.slice(0, 5) };
`;

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
    const card = await cardShot(`${name}.png`);
    // 有點法標籤的職業：升級路線「你在這」那段的裝備也要跟著選的點法換
    const route = data.tabs.length ? await ev(ROUTE) : null;
    if (route && !route.error) await shot(route.clip, `route-${name}.png`);
    results.push({ name, ...data, grown: card.grown, missingImages: card.missing, route: route && { range: route.range, rows: route.rows, missingImages: route.missing, error: route.error } });
    const note = card.cut ? "\t（拉高視窗還是放不下，截圖少了底部）" : card.grown ? `\t（卡片比視窗長，暫時把視窗拉到 ${card.grown} 高截）` : "";
    const broken = (card.missing || 0) + (route?.missing || 0);
    console.log(`${name}\t標籤 ${tabLine(data.tabs)}\t四格 ${data.stats.join(" ")}${note}${broken ? `\t（${broken} 張圖 15 秒沒載出來）` : ""}`);
    if (data.tabText) console.log(`  說明 ${data.tabText}`);
    for (const block of data.blocks) console.log(`  [${block.label}] ${block.text?.slice(0, 160)}`);
    if (route) console.log(route.error ? `  路線：${route.error}` : `  路線 ${route.range}\n    ${route.rows.join("\n    ")}`);
  }

  // 實際點：刺客 35 沒選 → 點「全幸」→ 卡片換、記住 → 重新整理還是全幸 → 點回「一般點法」→ 清掉
  await openRole({ job: 410, level: 35, tab: "" });
  const steps = [];
  const click = label => ev(`const b = __radios().find(x => x.textContent.trim() === ${JSON.stringify(label)}); b.click(); await new Promise(r => setTimeout(r, 400)); return __read();`);
  steps.push({ step: "點全幸", ...(await click("全幸")) });
  await navigate(BASE + "/");
  await ev(`return await __waitFor(__ready);`);
  await sleep(1200);
  steps.push({ step: "重新整理", ...(await ev(`return __read();`)) });
  await cardShot(`click-after-reload.png`);
  steps.push({ step: "點回一般點法", ...(await click("一般點法")) });
  for (const s of steps) console.log(`click ${s.step}\t${tabLine(s.tabs)}\t四格 ${s.stats.join(" ")}\tms-build=${s.stored}`);
  results.push({ name: "click", steps });

  // 鍵盤：刺客 35 沒選，焦點放在選中那顆，送右方向鍵 → 換成「全幸」、焦點跟過去、記住；再一次 → 繞回「一般點法」、清掉
  await openRole({ job: 410, level: 35, tab: "" });
  await ev(`__radios().find(b => b.getAttribute("aria-checked") === "true").focus(); return true;`);
  const arrowRight = async () => {
    const key = { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 };
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", ...key });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
    await sleep(400);
    return ev(`
      const active = document.activeElement;
      const stored = localStorage.getItem("ms-build");
      let parsed = {};
      try { parsed = JSON.parse(stored ?? "{}") ?? {}; } catch {}
      return {
        checked: __radios().find(b => b.getAttribute("aria-checked") === "true")?.textContent.trim() ?? null,
        active: active?.getAttribute("role") === "radio" ? active.textContent.trim() : (active?.tagName ?? null),
        tabStops: __radios().filter(b => b.tabIndex === 0).map(b => b.textContent.trim()),
        tabText: __group()?.nextElementSibling?.tagName === "P" ? __text(__group().nextElementSibling) : null,
        stored,
        line400: parsed["400"] ?? null,
      };
    `);
  };
  const first = await arrowRight();
  const second = await arrowRight();
  const keyboard = {
    first: { ...first, ok: first.checked === "全幸" && first.active === "全幸" && first.line400 === "全幸" && first.tabStops.join() === "全幸" },
    second: { ...second, ok: second.checked === "一般點法" && second.active === "一般點法" && second.line400 === null && second.tabStops.join() === "一般點法" },
  };
  results.push({ name: "keyboard", ...keyboard });
  for (const [step, k] of Object.entries(keyboard)) {
    console.log(`keyboard 右鍵第${step === "first" ? "一" : "二"}次\t${k.ok ? "OK" : "不對"}\t選中 ${k.checked}・焦點 ${k.active}・Tab 停 ${k.tabStops.join("、")}・ms-build=${k.stored}`);
  }

  // 對比：刺客 25 全幸「要湊的敏捷裝備」那一塊
  await openRole({ job: 410, level: 25, tab: "全幸" });
  const contrast = await ev(`window.__block = () => [...__card().querySelectorAll("h3")].find(h => h.textContent.trim() === "要湊的敏捷裝備")?.closest("div.rounded-xl") ?? null; ${CONTRAST}`);
  results.push({ name: "contrast", role: "410-25-全幸", ...contrast });
  if (contrast.error) console.log(`contrast\t${contrast.error}`);
  else {
    console.log(`contrast 410-25-全幸「要湊的敏捷裝備」\t${contrast.count} 個字，最低 ${contrast.min}${contrast.min < 4.5 ? "\tWARN 低於 4.5:1" : ""}`);
    for (const row of contrast.lowest) console.log(`  ${row.ratio}\t${row.color} 疊在 ${row.bg}\t${row.size} ${row.weight}\t${row.text}`);
  }
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
