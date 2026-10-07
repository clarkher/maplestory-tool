// 無頭 Chrome＋DevTools 協定的共用工具（無頭頁面算看得見，平滑捲動動畫、rAF 都照跑）
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME } from "./config.mjs";

export const sleep = ms => new Promise(r => setTimeout(r, ms));

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

/** 頁面裡的小工具：等條件、等高度穩定、逐格記 scrollY */
export const H = `
  window.__sleep = ms => new Promise(r => setTimeout(r, ms));
  window.__waitFor = (cond, ms = 15000) => Promise.race([
    new Promise(resolve => {
      if (cond()) return resolve(true);
      const mo = new MutationObserver(() => { if (cond()) { mo.disconnect(); resolve(true); } });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    }),
    new Promise(resolve => setTimeout(() => resolve(false), ms)),
  ]);
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

export async function start(OUT, PORT, extraArgs = []) {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, "chrome-profile")}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--window-size=1280,900",
    ...extraArgs, "about:blank",
  ], { stdio: "ignore" });
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
  // 從返回快取還原的頁面沒有 load 事件，最多等 8 秒
  const loadOnce = () => new Promise(res => {
    const l = m => { if (m.method === "Page.loadEventFired") { page.listeners.delete(l); res("load"); } };
    page.listeners.add(l);
    setTimeout(() => { page.listeners.delete(l); res("timeout"); }, 8000);
  });
  async function navigate(url) {
    const loaded = loadOnce();
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
  const ev = body => evaluate(`(async () => { ${H} ${body} })()`);
  async function close() {
    // Chrome 有時不回應 Browser.close 就斷線：最多等 2 秒，不然 node 會以 exit 13 提早結束、後面的結果沒寫出來
    try { await Promise.race([browser.send("Browser.close"), sleep(2000)]); } catch {}
    await sleep(800);
    try { spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
    await sleep(500);
  }
  return { page, browser, evaluate, navigate, loadOnce, shot, traverse, ev, close };
}
