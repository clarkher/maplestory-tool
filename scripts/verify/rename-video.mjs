// 名字變怪物（/plan/rename）發影片到社群的驗收（v2.74）：手機觸控寫「小樹」，演出時背後錄影，按一下就帶著影片叫系統分享。任何一項沒過 exit 1
// 無頭 Chrome 沒有真的系統分享面板：navigator.share／canShare 換成假的，記下帶了什麼、當下的點擊還有沒有效（userActivation）。
// 影片本身是真的錄的：放進 <video> 讀長寬跟長度、抓最後一格存圖，用眼睛看片尾字卡跟網址。
// 情境：手機收得了檔案／App 內建瀏覽器（沒有 canShare）／錄不了影片（沒有 MediaRecorder）／電腦／錄到一半按再寫一次；
// 另外 CPU 降 4 倍量有錄跟沒錄的演出格數（錄影不准把演出拖慢）。
// 用法：node scripts/verify/rename-video.mjs [網址，預設 http://localhost:3473] [輸出資料夾] [DevTools 埠，預設 9635]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const BASE = (process.argv[2] ?? "http://localhost:3473").replace(/\/$/, "");
const OUT = outDir(process.argv[3], "rename-video");
const PORT = chromePort(9635, process.argv[4]);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HAND = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/rename/__fixtures__/hand.json"), "utf8"));
const FX = HAND.ids.find(x => x.id === "小樹").strokes;

let failed = false;
const record = (name, ok, detail) => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${JSON.stringify(detail)}`);
};

const { page, evaluate, navigate, close } = await start(OUT, PORT);
const problems = [];
page.listeners.add(m => {
  if (m.method === "Runtime.exceptionThrown") problems.push(String(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text).slice(0, 300));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") problems.push(m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300));
});

/** 每次開頁前塞：假的系統分享、記複製了什麼、記下載了什麼、逐格記演出 */
const fake = o => `(() => {
  window.__log = { share: [], copy: [], download: [], gaps: [] };
  if (${!o.recorder}) delete window.MediaRecorder;
  if (${Boolean(o.noMob)}) Object.defineProperty(HTMLImageElement.prototype, "src", { set(v) { this.setAttribute("src", String(v).includes("monster_frames") ? "/no-such-image.png" : v); }, get() { return this.getAttribute("src"); } });
  const def = (k, v) => Object.defineProperty(navigator, k, { value: v, configurable: true });
  if (${o.files === null}) def("canShare", undefined);
  else def("canShare", d => Boolean(d.files) && ${o.files});
  def("share", async d => {
    window.__log.share.push({ keys: Object.keys(d), active: navigator.userActivation.isActive, text: d.text ?? null, url: d.url ?? null, files: (d.files ?? []).map(f => ({ name: f.name, type: f.type, size: f.size })) });
    if (d.files) window.__file = d.files[0];
  });
  def("clipboard", { writeText: async t => { window.__log.copy.push(t); } });
  HTMLAnchorElement.prototype.click = function () { if (this.download) window.__log.download.push(this.download); };
  let last = 0;
  const f = t => { if (last && document.querySelector("[data-stage]")) window.__log.gaps.push(Math.round(t - last)); last = t; requestAnimationFrame(f); };
  requestAnimationFrame(f);
})()`;

let script = null;
async function open(o) {
  if (script) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: script });
  script = (await page.send("Page.addScriptToEvaluateOnNewDocument", { source: fake(o) })).identifier;
  await page.send("Emulation.setDeviceMetricsOverride", { width: o.width ?? 390, height: 664, deviceScaleFactor: 2, mobile: o.touch });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: o.touch, maxTouchPoints: o.touch ? 5 : 1 });
  await navigate(`${BASE}/plan/rename`);
  await until("NPC 的［接受］", `document.querySelector("[data-bt='yes']")`, 90000);
  await sleep(1200);
}
async function until(what, expression, ms) {
  for (let t = 0; t < ms; t += 50) {
    try { if (await evaluate(`Boolean(${expression})`)) return; } catch { /* 換頁中 */ }
    await sleep(50);
  }
  throw new Error(`等不到：${what}`);
}
let touching = true;
const point = async (type, x, y) =>
  touching
    ? page.send("Input.dispatchTouchEvent", { type: { down: "touchStart", move: "touchMove", up: "touchEnd" }[type], touchPoints: type === "up" ? [] : [{ x, y }] })
    : page.send("Input.dispatchMouseEvent", { type: { down: "mousePressed", move: "mouseMoved", up: "mouseReleased" }[type], x, y, button: "left", clickCount: type === "move" ? 0 : 1, buttons: type === "up" ? 0 : 1 });
async function tap(selector) {
  const at = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!at) throw new Error(`點不到：${selector}`);
  await point("down", at.x, at.y);
  await point("up", at.x, at.y);
}
async function sign() {
  await until("登記書", `document.querySelector("[data-pad]")`, 15000);
  const pad = await evaluate(`(() => { const el = document.querySelector("[data-pad]"); el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const all = FX.flat();
  const [x0, x1] = [Math.min(...all.map(p => p[0])), Math.max(...all.map(p => p[0]))];
  const [y0, y1] = [Math.min(...all.map(p => p[1])), Math.max(...all.map(p => p[1]))];
  const k = Math.min((pad.w * 0.88) / (x1 - x0), (pad.h * 0.6) / (y1 - y0));
  const at = ([x, y]) => [pad.x + (pad.w - (x1 - x0) * k) / 2 + (x - x0) * k, pad.y + pad.h * 0.72 - (y1 - y0) * k + (y - y0) * k];
  for (const s of FX) {
    await point("down", ...at(s[0]));
    for (const p of s.slice(1)) await point("move", ...at(p));
    await point("up", ...at(s.at(-1)));
  }
  await tap("[data-act='submit']");
}
/** 接受 → 寫 → 等結果；回結果出來那一刻的按鈕 */
async function play(o) {
  touching = o.touch;
  await open(o);
  await tap("[data-bt='yes']");
  await sign();
  await until("結果", `document.querySelector("[data-act='share']")`, 40000);
  return main();
}
const main = () => evaluate(`(() => { const b = document.querySelector("[data-act='share']"); return { text: b.textContent.trim(), off: b.disabled, via: b.dataset.share, row: [...document.querySelectorAll("[data-share]")].map(x => x.textContent.trim()) }; })()`);
const log = () => evaluate(`window.__log`);
const msg = () => evaluate(`document.querySelector("[data-share-msg]")?.textContent ?? null`);
async function shot(file) {
  const r = await page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
}
async function step(name, run) {
  try { await run(); } catch (error) { record(name, false, String(error?.message ?? error).slice(0, 300)); }
}
const READY = `!document.querySelector("[data-act='share']").disabled`;

try {
  await step("手機", async () => {
    const at = await play({ touch: true, files: true, recorder: true });
    const t0 = Date.now();
    record("手機：結果一出來寫「影片準備中…」、不能按", at.text === "影片準備中…" && at.off, at);
    await shot("preparing.png");
    await until("影片好了", READY, 15000);
    const waited = Date.now() - t0;
    record("手機：結果出來 4 秒內影片好了", waited < 4000, { waited });
    const b = await main();
    record("手機：主按鈕、第二排", b.text === "發影片到社群" && b.row.join("、") === "發影片到社群、傳連結給朋友、複製連結、存圖", b.row);
    const box = await evaluate(`(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { stage: [r("[data-stage]").top, r("[data-stage]").bottom], main: r("[data-act='share']").bottom, row: r("[data-share='link']").bottom, h: innerHeight, w: document.documentElement.scrollWidth }; })()`);
    record("手機：不用捲就看得到整張演出跟兩排按鈕、不橫捲", box.row <= box.h && box.w <= 390, box);
    await shot("ready.png");
    await tap("[data-act='share']");
    await sleep(600);
    const l = await log();
    const s = l.share[0];
    record("手機：按一下就叫系統分享，點擊還有效，只帶一個影片檔", l.share.length === 1 && s.active && s.keys.join() === "files" && s.files.length === 1 && /^video\//.test(s.files[0].type) && s.files[0].size > 50_000, l.share);
    record("手機：同一下複製好一句話跟這一輪的連結", l.copy.length === 1 && /^我的 ID 簽一簽變成「.+」，換你簽 https?:\/\/\S+\/plan\/rename\/m\/\d+#r=\S+$/.test(l.copy[0]), l.copy);
    record("手機：沒有亂下載、寫文案複製好了", l.download.length === 0 && (await msg()) === "文案和連結複製好了，貼上就能發", await msg());
    await shot("shared.png");
    const v = await evaluate(`(async () => {
      const el = document.createElement("video");
      el.muted = true;
      el.src = URL.createObjectURL(window.__file);
      await new Promise((ok, no) => { el.onloadeddata = ok; el.onerror = () => no(new Error("放不出來")); });
      if (!Number.isFinite(el.duration)) { el.currentTime = 1e6; await new Promise(r => (el.onseeked = r)); }
      const d = el.duration, shots = [];
      for (const t of [0.6, 2.2, 3.6, Math.max(0, el.duration - 0.2)]) {
        el.currentTime = t;
        await new Promise(r => (el.onseeked = r));
        const c = document.createElement("canvas");
        c.width = el.videoWidth; c.height = el.videoHeight;
        c.getContext("2d").drawImage(el, 0, 0);
        shots.push(c.toDataURL("image/jpeg", 0.8).split(",")[1]);
      }
      return { w: el.videoWidth, h: el.videoHeight, d, shots };
    })()`);
    v.shots.forEach((b64, i) => fs.writeFileSync(path.join(OUT, `video-${i}.jpg`), Buffer.from(b64, "base64")));
    record("影片：720×1280、整段演出（6.4 秒左右）", v.w === 720 && v.h === 1280 && v.d > 6 && v.d < 7.5, { w: v.w, h: v.h, d: v.d, type: s.files[0].type, kb: Math.round(s.files[0].size / 1024) });
    // 再寫一次：新的一輪要重新準備，不准拿上一輪的影片
    await tap("[data-act='again']");
    await sign();
    await until("第二輪結果", `document.querySelector("[data-act='share']")`, 40000);
    const two = await main();
    record("再寫一次：重新準備", two.off && two.text === "影片準備中…", two.text);
    await tap("[data-act='again']"); // 錄到一半就丟掉
    await sleep(800);
    record("錄到一半按再寫一次：回登記書", await evaluate(`Boolean(document.querySelector("[data-pad]"))`), null);
  });

  await step("App 內建瀏覽器", async () => {
    await play({ touch: true, files: null, recorder: true });
    await until("影片好了", READY, 15000);
    const b = await main();
    await tap("[data-act='share']");
    await sleep(600);
    const l = await log();
    const m = await msg();
    record("App 內建瀏覽器：寫「下載影片」，按了下載＋複製，提示換瀏覽器", b.text === "下載影片" && l.share.length === 0 && l.download.length === 1 && /\.(mp4|webm)$/.test(l.download[0]) && l.copy.length === 1 && /Safari 或 Chrome/.test(m ?? ""), { text: b.text, download: l.download, m });
    await shot("in-app.png");
  });

  await step("錄不了影片", async () => {
    const at = await play({ touch: true, files: true, recorder: false });
    await tap("[data-act='share']");
    await sleep(500);
    const l = await log();
    record("錄不了影片：主按鈕維持「傳給朋友」、分享連結", at.text === "傳給朋友" && !at.off && at.row.join("、") === "傳給朋友、複製連結、存圖" && l.share.length === 1 && l.share[0].keys.join() === "text,url", { at, share: l.share });
    await shot("no-recorder.png");
  });

  await step("怪圖載不到", async () => {
    await play({ touch: true, files: true, recorder: true, noMob: true });
    await until("改回傳給朋友", `document.querySelector("[data-act='share']").dataset.share === "send"`, 10000);
    record("怪圖載不到：不給沒有怪的影片，主按鈕是「傳給朋友」", (await main()).text === "傳給朋友", await main());
    problems.length = 0; // 故意弄壞圖片的 404
  });

  await step("電腦", async () => {
    await play({ touch: false, files: true, recorder: true, width: 1280 });
    await until("影片好了", READY, 15000);
    const b = await main();
    await tap("[data-act='share']");
    await sleep(600);
    const l = await log();
    const m = await msg();
    record("電腦：寫「下載影片」，按了下載＋複製", b.text === "下載影片" && l.share.length === 0 && l.download.length === 1 && l.copy.length === 1 && m === "影片存到下載資料夾了。文案和連結複製好了，貼上就能發", { text: b.text, download: l.download, m });
    await shot("pc.png");
  });

  await step("320 寬", async () => {
    await play({ touch: true, files: true, recorder: true, width: 320 });
    await until("影片好了", READY, 15000);
    const r = await evaluate(`({ w: document.documentElement.scrollWidth, tall: [...document.querySelectorAll("[data-share]")].map(b => [b.textContent.trim(), b.offsetHeight, b.scrollWidth > b.clientWidth]) })`);
    record("320 寬：不橫捲、按鈕字都一行放得下", r.w <= 320 && r.tall.every(([, h, over]) => h <= 46 && !over), r);
    await shot("w320.png");
  });

  await step("慢手機", async () => {
    await page.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const run = async recorder => {
      await play({ touch: true, files: true, recorder });
      const gaps = (await log()).gaps;
      const sorted = [...gaps].sort((a, b) => a - b);
      return { frames: gaps.length, p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1) };
    };
    const off = await run(false);
    const on = await run(true);
    const t0 = Date.now();
    await until("影片好了", READY, 20000);
    await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    record("慢手機（CPU 降 4 倍）：邊播邊錄，演出格數不少於沒錄的八成", on.frames >= off.frames * 0.8, { 沒錄: off, 有錄: on, 結果後再等: Date.now() - t0 });
  });
  record("整趟沒有沒接住的例外、console.error", problems.length === 0, problems);
} catch (error) {
  record("跑完", false, String(error?.message ?? error));
} finally {
  console.log(`輸出在 ${OUT}`);
  await close?.();
}
process.exit(failed ? 1 : 0);
