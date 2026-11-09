// 未來視 /future：手機、電腦截圖，並驗職業帶入、切職業、過期提示、導覽列（v1.68）
// 用法：node scripts/verify/future-shot.mjs <輸出資料夾> <網址>
//   例：node scripts/verify/future-shot.mjs out https://maplehelper-dev.pipicards.workers.dev
// 存：phone.png、phone-mage.png（火毒）、desktop.png、late.png（假裝 2027/2/15）。有一項不對結束碼 1。
// 時間用 Date 蓋掉，不是真的等；未來視只看 Date.now，所以夠用。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const OUT = outDir(process.argv[2], "future-shot");
const BASE = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const PORT = chromePort(9511);
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, "chrome-profile")}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--window-size=375,1400", "about:blank",
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
    const timer = setTimeout(() => { pending.delete(i); reject(new Error(`DevTools 逾時：${method}`)); }, 60000);
    pending.set(i, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { opened, send, listeners };
}

const pageTarget = (await getJSON(`http://127.0.0.1:${PORT}/json/list`)).find(t => t.type === "page");
const page = connect(pageTarget.webSocketDebuggerUrl);
await page.opened;
await page.send("Page.enable");
await page.send("Runtime.enable");

const crashes = [];
page.listeners.add(m => {
  if (m.method === "Runtime.exceptionThrown") crashes.push(m.params.exceptionDetails.exception?.description?.slice(0, 200) ?? "例外");
});

const metrics = (width, mobile) => page.send("Emulation.setDeviceMetricsOverride", { width, height: mobile ? 812 : 900, deviceScaleFactor: mobile ? 2 : 1, mobile });
async function evaluate(expression) {
  const r = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result.value;
}
async function open(url) {
  let listener;
  const loaded = new Promise(res => {
    listener = m => { if (m.method === "Page.loadEventFired") res(true); };
    page.listeners.add(listener);
  });
  await page.send("Page.navigate", { url });
  const ok = await Promise.race([loaded, sleep(60000).then(() => false)]);
  page.listeners.delete(listener);
  if (!ok) throw new Error(`載入逾時：${url}`);
  await sleep(1500);
}
async function shot(name) {
  // 長截圖不會捲動，懶載入的道具圖要先叫它載
  await evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i=>{i.loading='eager'});new Promise(r=>setTimeout(r,1500))");
  const { result } = await page.send("Runtime.evaluate", { expression: "document.documentElement.scrollHeight", returnByValue: true });
  const { data } = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: await evaluate("innerWidth"), height: result.value, scale: 1 } });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(data, "base64"));
}

const fails = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? `：${detail}` : ""}`);
  if (!ok) fails.push(name);
};
const text = () => evaluate("document.querySelector('main').innerText");

try {
  // 沒存職業：選單要提示，頁面不橫向捲
  await metrics(375, true);
  await open(`${BASE}/future`);
  const first = await text();
  check("四站都在", ["官方改版發佈會", "玩具城前半", "殘暴炎魔", "四轉、神木村"].every(s => first.includes(s)));
  check("玩具城材料最常用的排最前", first.indexOf("螺絲釘") > 0 && first.indexOf("螺絲釘") < first.indexOf("鋼鐵"));
  check("沒選職業要提示", first.includes("選一個四轉職業"));
  check("沒有 11/21 過期提示", !first.includes("發佈會已經開始"));
  await shot("phone.png");
  check("圖都載得到", (await evaluate("[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src).join()")) === "");

  // 導覽列：手機沒有未來視（放五顆會擠掉查資料）；頁面不能橫向捲
  for (const width of [360, 375, 390, 430]) {
    await metrics(width, true);
    await sleep(300);
    const m = await evaluate(`(()=>{const n=document.querySelector('nav[aria-label="主選單"]');return {page:document.documentElement.scrollWidth-innerWidth,nav:n.scrollWidth-n.clientWidth,labels:[...n.querySelectorAll('a')].filter(a=>a.offsetWidth).map(a=>a.textContent).join()}})()`);
    check(`${width} 寬不橫向捲`, m.page <= 0, `多 ${m.page}`);
    check(`${width} 寬手機導覽列沒有未來視`, m.labels.includes("查資料") && !m.labels.includes("未來視"), m.labels);
    // v1.72 起一定放得下（每個寬度的細部量法：nav-fit.mjs）
    check(`${width} 寬導覽列不用橫向捲`, m.nav <= 0, `多 ${m.nav}`);
  }

  // 存了火毒二轉：自動帶火毒；再切夜使者
  await metrics(375, true);
  await evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ ...JSON.parse(localStorage.getItem("ms-profile") || "{}"), job: 210, level: 40 }))`);
  await open(`${BASE}/future`);
  check("二轉法師帶火毒", (await evaluate("document.querySelector('select').value")) === "212");
  const mage = await text();
  check("火毒看得到寒冰背部骨 × 30", mage.includes("寒冰背部骨") && mage.includes("× 30"));
  await shot("phone-mage.png");
  await evaluate(`(()=>{const s=document.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'412');s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await sleep(300);
  const thief = await text();
  check("切夜使者就換清單", (await evaluate("document.querySelector('select').value")) === "412" && !thief.includes("寒冰背部骨"));

  // 電腦版：導覽列有未來視
  await metrics(1280, false);
  await open(`${BASE}/future`);
  check("電腦版導覽列有未來視", (await evaluate(`[...document.querySelectorAll('nav[aria-label="主選單"] a')].some(a=>a.offsetWidth&&a.textContent==="未來視")`)));
  await shot("desktop.png");

  check("到這裡都沒有當掉", crashes.length === 0, crashes[0] ?? "");

  // 時間過了：發佈會過期、下一版比預估晚（蓋掉時間後別的地方畫的字會跟伺服器不同，這段不看 hydration）
  crashes.length = 0;
  await metrics(375, true);
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `{const t=Date.parse("2027-02-15T12:00:00+08:00");Date.now=()=>t;}` });
  await open(`${BASE}/future`);
  const late = await text();
  check("發佈會過了要講", late.includes("發佈會已經開始"));
  check("下一版比預估晚要講", late.includes("已經過了預估時間"));
  await shot("late.png");

  check("蓋掉時間也沒有當掉", !crashes.some(c => !/Hydration|React error #(418|423|425)/.test(c)), crashes[0] ?? "");
} finally {
  page.listeners.clear();
  spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
}
console.log(`\n截圖在 ${OUT}`);
process.exit(fails.length ? 1 : 0);
