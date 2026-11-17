// 每日影片（v2.35）：開正式站那一頁，讀頁面上的字當事實、截要放進片裡的那幾塊。
// 只用 Node 內建＋本機 Chrome（DevTools 協定），Windows 跟 GitHub Actions（ubuntu）都能跑。
// Chrome 路徑：CHROME_PATH，沒設就猜 Windows／Linux 預設位置。
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const SITE = "https://maplehelper.tw";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const guess = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
  ];
  const hit = guess.find((p) => existsSync(p));
  if (!hit) throw new Error("找不到 Chrome，設 CHROME_PATH");
  return hit;
}

async function getJSON(url) {
  for (let i = 0; i < 100; i++) {
    try { return await (await fetch(url)).json(); } catch { await sleep(200); }
  }
  throw new Error(`Chrome 沒起來：${url}`);
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  const opened = new Promise((r) => ws.addEventListener("open", r));
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { opened, send };
}

/** 開一個無頭 Chrome（手機寬 520、2 倍），回傳 open／text／clip／close */
export async function browser({ port = 9631, width = 520 } = {}) {
  const prof = join(tmpdir(), `maplehelper-shoot-${port}`);
  mkdirSync(prof, { recursive: true });
  const proc = spawn(chromePath(), [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--no-first-run",
    "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--no-sandbox", "about:blank",
  ], { stdio: "ignore" });
  const page = await (async () => {
    await getJSON(`http://127.0.0.1:${port}/json/version`);
    const t = (await getJSON(`http://127.0.0.1:${port}/json/list`)).find((x) => x.type === "page");
    const c = connect(t.webSocketDebuggerUrl);
    await c.opened;
    return c;
  })();
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: 1100, deviceScaleFactor: 2, mobile: false });

  async function evaluate(expression) {
    const r = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  }
  /** 開頁、等到 ready() 成立（最多 20 秒），藏掉導覽列 */
  async function open(path, ready = "true") {
    await page.send("Page.navigate", { url: SITE + path });
    for (let i = 0; i < 100; i++) {
      await sleep(200);
      if (await evaluate(`document.readyState==="complete" && !!(${ready})`).catch(() => false)) break;
      if (i === 99) throw new Error(`等不到內容：${path}`);
    }
    await sleep(1200);
    await evaluate(`document.querySelectorAll("header").forEach(h=>h.style.display="none");1`);
  }
  const text = () => evaluate(`document.querySelector("main").innerText`);
  /** 截 sel 選到的元素（最高 maxH px，預設 1600），存 file；找不到回 false */
  async function clip(file, sel, { pad = 8, maxH = 1600 } = {}) {
    const r = await evaluate(`(()=>{const e=${sel};if(!e)return null;e.scrollIntoView({block:"start",behavior:"instant"});const r=e.getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height}})()`);
    if (!r) return false;
    await sleep(700);
    const s = await page.send("Page.captureScreenshot", {
      format: "png", captureBeyondViewport: true,
      clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + pad * 2, height: Math.min(r.h + pad * 2, maxH), scale: 1 },
    });
    writeFileSync(file, Buffer.from(s.data, "base64"));
    return true;
  }
  async function close() {
    try { await Promise.race([page.send("Browser.close"), sleep(1500)]); } catch {}
    try { proc.kill(); } catch {}
  }
  return { evaluate, open, text, clip, close };
}

/** 選 main 裡同時含有 needles 的元素；smallest＝最小那個（一張卡），否則最大那個（整個區塊）；without 裡的字不能出現 */
export function pickSel(needles, { without = [], smallest = true } = {}) {
  const has = needles.map((n) => `e.innerText.includes(${JSON.stringify(n)})`).join("&&");
  const not = without.map((n) => `!e.innerText.includes(${JSON.stringify(n)})`).join("&&") || "true";
  const order = smallest ? "a.offsetHeight-b.offsetHeight" : "b.offsetHeight-a.offsetHeight";
  return `[...document.querySelectorAll("main *")].filter(e=>e.offsetHeight>40&&${has}&&${not}).sort((a,b)=>${order})[0]`;
}
