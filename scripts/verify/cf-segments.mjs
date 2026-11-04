// 量 Cloudflare 靜態輸出的站內換頁：預先載入的 __next.*.txt 有沒有 404、換頁有沒有變成整頁重載、換頁花多久（v1.46）。
// 無頭 Chrome（375×812）＋DevTools 協定。
// 用法：node scripts/verify/cf-segments.mjs <輸出資料夾> <網址> [埠]    （REPEAT=3 每組換頁量幾次，預設 3；CPU=4 CPU 慢 4 倍；PAGES=/a,/b 換頁順序）
//
// 情境：每一頁先整頁打開、捲到底（讓連結進畫面、觸發預先載入），記這段時間所有 .txt 請求的狀態碼；
//       再按順序站內換到下一頁（有連結就真的點，沒有就 window.next.router.push），
//       頁面上留記號 window.__stay，換完記號還在＝沒有整頁重載。換頁時間＝動手到網址變、而且主內容換掉後第一格。
// 輸出：results.json（requests＝每個 .txt 請求、navs＝每次換頁）；console 印摘要。有 .txt 回 4xx／5xx 或整頁重載就 exit 1。
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const OUT = outDir(process.argv[2], "cf-segments");
const BASE = (process.argv[3] ?? "https://maplehelper-dev.pipicards.workers.dev").replace(/\/$/, "");
const PORT = chromePort(9497, process.argv[4]);
const REPEAT = Number(process.env.REPEAT ?? 3);
const CPU = Number(process.env.CPU ?? 1);
const PAGES = (process.env.PAGES ?? "/,/guide,/go,/db,/plan/boss,/jobs/110,/db/monsters/100100").split(",");
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, `chrome-profile-${Date.now()}`)}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--window-size=375,812", "about:blank",
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
    } else for (const fn of listeners) fn(msg);
  });
  return new Promise(resolve => ws.addEventListener("open", () => resolve({
    send: (method, params = {}) => new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { resolve: res, reject: rej });
      ws.send(JSON.stringify({ id: n, method, params }));
      setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(`逾時：${method}`)); } }, 60000);
    }),
    on: fn => listeners.add(fn),
    close: () => ws.close(),
  })));
}

const results = { base: BASE, cpu: CPU, requests: [], navs: [] };

try {
  const version = await getJSON(`http://127.0.0.1:${PORT}/json/version`);
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const cdp = await connect(tab.webSocketDebuggerUrl);
  console.log(version.Browser);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });

  const inflight = new Map();
  let phase = "";
  let docs = 0;
  cdp.on(msg => {
    if (msg.method === "Network.requestWillBeSent") {
      const { requestId, request, type, redirectResponse } = msg.params;
      if (type === "Document") docs++;
      const u = new URL(request.url);
      if (u.origin !== new URL(BASE).origin || !/\.txt$/.test(u.pathname)) return;
      if (redirectResponse) results.requests.push({ phase, path: inflight.get(requestId)?.path ?? u.pathname, status: redirectResponse.status, redirect: u.pathname });
      inflight.set(requestId, { phase, path: u.pathname, t: msg.params.timestamp });
    }
    if (msg.method === "Network.responseReceived") {
      const r = inflight.get(msg.params.requestId);
      if (!r) return;
      r.status = msg.params.response.status;
      r.cache = msg.params.response.headers["cf-cache-status"] ?? msg.params.response.headers["CF-Cache-Status"];
      r.fromDisk = msg.params.response.fromDiskCache;
    }
    if (msg.method === "Network.loadingFinished" || msg.method === "Network.loadingFailed") {
      const r = inflight.get(msg.params.requestId);
      if (!r) return;
      inflight.delete(msg.params.requestId);
      r.ms = Math.round((msg.params.timestamp - r.t) * 1000);
      if (msg.method === "Network.loadingFailed") r.failed = msg.params.errorText;
      delete r.t;
      results.requests.push(r);
    }
  });

  const evaluate = async expression => {
    const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails));
    return result.value;
  };

  // 打開、等水合，捲到底再回頂端，讓畫面裡的連結都觸發預先載入
  const open = async p => {
    phase = `open ${p}`;
    await cdp.send("Page.navigate", { url: BASE + p });
    for (let i = 0; i < 100; i++) {
      await sleep(200);
      if (await evaluate("document.readyState === 'complete' && !!window.next?.router").catch(() => false)) break;
    }
    await evaluate(`(async () => {
      const h = document.documentElement.scrollHeight;
      for (let y = 0; y < h; y += 600) { window.scrollTo({ top: y, behavior: "instant" }); await new Promise(r => setTimeout(r, 120)); }
      window.scrollTo({ top: 0, behavior: "instant" });
    })()`);
    await sleep(2500);
  };

  // 換頁：動手 → 網址變、main 內容跟動手前不同之後的第一格
  const go = async (from, to) => {
    phase = `nav ${from} -> ${to}`;
    const before = docs;
    const m = await evaluate(`new Promise(resolve => {
      window.__stay = 1;
      const main = () => (document.querySelector("main") ?? document.body).innerText.slice(0, 400);
      const was = main();
      const target = ${JSON.stringify(to)};
      const a = [...document.querySelectorAll("a[href]")].find(x => new URL(x.href).pathname.replace(/\\/$/, "") === target.replace(/\\/$/, "") && x.offsetParent);
      const t0 = performance.now();
      a ? a.click() : window.next.router.push(target);
      let urlAt = null;
      const tick = () => {
        const now = performance.now();
        if (urlAt === null && location.pathname.replace(/\\/$/, "") === target.replace(/\\/$/, "")) urlAt = now - t0;
        if (urlAt !== null && main() !== was) return resolve({ how: a ? "click" : "push", urlMs: Math.round(urlAt), paintMs: Math.round(now - t0) });
        if (now - t0 > 20000) return resolve({ how: a ? "click" : "push", timeout: true, urlMs: urlAt && Math.round(urlAt) });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })`).catch(e => ({ destroyed: String(e.message).slice(0, 80) }));
    await sleep(800);
    const stayed = await evaluate("window.__stay === 1").catch(() => false);
    results.navs.push({ from, to, ...m, stayed, documentRequests: docs - before });
  };

  for (let i = 0; i < REPEAT; i++) {
    for (let k = 0; k < PAGES.length; k++) {
      const from = PAGES[k], to = PAGES[(k + 1) % PAGES.length];
      await open(from);
      await go(from, to);
    }
  }
  await cdp.send("Page.captureScreenshot", { format: "png" }).then(s => fs.writeFileSync(path.join(OUT, "last.png"), Buffer.from(s.data, "base64")));
  cdp.close();
} finally {
  // Windows 上 chrome.kill() 常關不掉，下一次同一個埠會連進舊的那支
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
  else chrome.kill();
}

fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
const counts = {};
for (const r of results.requests) {
  const k = String(r.status ?? r.failed ?? "?");
  counts[k] = (counts[k] ?? 0) + 1;
}
const bad = results.requests.filter(r => r.status >= 400 || (r.failed && r.failed !== "net::ERR_ABORTED"));
const redirects = results.requests.filter(r => r.status >= 300 && r.status < 400);
const sorted = results.navs.map(n => n.paintMs).filter(n => n != null).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const reloaded = results.navs.filter(n => !n.stayed || n.documentRequests > 0);
console.log(`${BASE}：.txt 請求 ${results.requests.length} 個，狀態 ${JSON.stringify(counts)}；換頁 ${results.navs.length} 次，中位數 ${median} ms、最慢 ${sorted.at(-1)} ms，整頁重載 ${reloaded.length} 次`);
for (const r of [...new Map(bad.map(b => [b.path, b])).values()].slice(0, 30)) console.log("  壞掉", r.status ?? r.failed, r.path);
for (const r of [...new Map(redirects.map(b => [b.path, b])).values()].slice(0, 30)) console.log("  轉址", r.status, r.path, "->", r.redirect);
for (const n of results.navs) console.log(`  ${n.from} -> ${n.to} ${n.how ?? ""} 網址 ${n.urlMs}ms 畫面 ${n.paintMs}ms ${n.stayed ? "" : "整頁重載"}${n.timeout ? " 逾時" : ""}`);
process.exit(bad.length || reloaded.length ? 1 : 0);
