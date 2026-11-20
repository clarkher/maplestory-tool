// 名字變怪物（/plan/rename，v2.44）驗收：手機 390×844，NPC 問要不要登錄 → 接受 → 把手寫樣本畫進登記書 → 簽好了 → 等演出播完 → 截圖；
// 三組會出怪的＋一組一坨（8591：像度在亂數之前決定，一定是一坨），最後打開分享選單截圖。任何一項沒過 exit 1
// 用法：node scripts/verify/rename-shot.mjs [網址，預設 http://localhost:3473] [輸出資料夾] [DevTools 埠，預設 9631]
//   例：npx next dev --webpack -p 3473   （另一個視窗先開本機 dev）
//       node scripts/verify/rename-shot.mjs http://localhost:3473 "$TEMP/rename-shot"
// 網址用 localhost，不要用 127.0.0.1（next dev 對 127.0.0.1 的互動不理）。第一次開頁 dev 要編譯，最多等 90 秒。
// 筆畫讀本機 src/lib/rename/__fixtures__/hand.json（scripts/rename/build-hand-fixtures.mjs 產的原始筆畫），
// 每組等比縮進簽名格（寬 88%、高 60%，放在簽名線上面），用滑鼠事件（Input.dispatchMouseEvent）一點一點畫，跟真人拖曳一樣走 pointer events。
// 出怪還是一坨看演出畫布 data-stage 的 aria-label（「筆畫變成某隻怪」／「筆畫掉下來堆成一坨」），像度看對話框那行「像度 N%」。
// 頁面上的東西用 data-bt="yes"（接受）、data-pad（簽名格）、data-act="submit"／"again"／"share"、data-share="link" 找，改版面時這幾個屬性要留著。
// 輸出：rename-intro.png（接任務）、rename-sign.png（簽好還沒送）、rename-<ID>.png（每組結果，整頁）、rename-share.png（分享選單）、results.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const BASE = (process.argv[2] ?? "http://localhost:3473").replace(/\/$/, "");
const OUT = outDir(process.argv[3], "rename-shot");
const PORT = chromePort(9631, process.argv[4]);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HAND = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/rename/__fixtures__/hand.json"), "utf8"));
/** 三組出怪＋一組一坨（最後一組） */
const PICK = ["小樹", "黑騎士", "喵喵", "8591"];
const POOP_ID = "8591";

const results = { base: BASE, port: PORT, rounds: [], checks: [] };
const record = (name, ok, detail) => {
  results.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  return Boolean(ok);
};

let page, evaluate, navigate, close;
const problems = { exceptions: [], errors: [] };

async function until(expression, ms = 15000) {
  for (let t = 0; t < ms; t += 250) {
    try { if (await evaluate(`Boolean(${expression})`)) return true; } catch { /* 換頁中 */ }
    await sleep(250);
  }
  return false;
}
async function wait(what, expression, ms) {
  if (!(await until(expression, ms))) throw new Error(`等不到：${what}`);
}
const mouse = (type, x, y, extra = {}) => page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
/** 真的用滑鼠點；selector 找不到就丟錯 */
async function click(what, selector) {
  const at = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!at) throw new Error(`點不到：${what}`);
  await mouse("mouseMoved", at.x, at.y, { buttons: 0 });
  await mouse("mousePressed", at.x, at.y, { clickCount: 1, buttons: 1 });
  await mouse("mouseReleased", at.x, at.y, { clickCount: 1, buttons: 0 });
}
/** 整頁截圖（結果卡在一個畫面放不下） */
async function fullShot(file) {
  // 先捲回頁首：整頁截圖時固定在畫面上的導覽列會畫在當下捲到的位置，蓋住中間
  await evaluate(`window.scrollTo({ top: 0, behavior: "instant" })`);
  await sleep(300);
  const m = await page.send("Page.getLayoutMetrics");
  const { width, height } = m.cssContentSize ?? m.contentSize;
  const r = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
  return file;
}

/** 把一組原始筆畫等比縮進簽名格（簽名線上面那塊），用滑鼠一筆一筆畫 */
async function drawInto(strokes) {
  const pad = await evaluate(`(() => { const el = document.querySelector("[data-pad]"); el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const [x, y] of s) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const k = Math.min((pad.w * 0.88) / (x1 - x0), (pad.h * 0.6) / (y1 - y0));
  const ox = pad.x + (pad.w - (x1 - x0) * k) / 2, oy = pad.y + pad.h * 0.72 - (y1 - y0) * k;
  const at = ([x, y]) => [ox + (x - x0) * k, oy + (y - y0) * k];
  for (const s of strokes) {
    const [sx, sy] = at(s[0]);
    await mouse("mouseMoved", sx, sy, { buttons: 0 });
    await mouse("mousePressed", sx, sy, { clickCount: 1, buttons: 1 });
    for (const p of s.slice(1)) {
      const [x, y] = at(p);
      await mouse("mouseMoved", x, y, { buttons: 1 });
    }
    const [ex, ey] = at(s[s.length - 1]);
    await mouse("mouseReleased", ex, ey, { clickCount: 1, buttons: 0 });
  }
  return { pad, scale: k };
}

async function round(id, first) {
  const fx = HAND.ids.find(x => x.id === id);
  if (!fx) throw new Error(`hand.json 沒有 ${id}`);
  await navigate(`${BASE}/plan/rename`);
  await wait("NPC 的［接受］", `document.querySelector("[data-bt='yes']")`, 90000);
  if (first) await fullShot("rename-intro.png");
  await click("接受", "[data-bt='yes']");
  await wait("登記書", `document.querySelector("[data-pad]")`);
  const drawn = await drawInto(fx.strokes);
  if (first) await fullShot("rename-sign.png");
  const t0 = Date.now();
  await click("簽好了", "[data-act='submit']");
  // 比對＋演出（寫字、收筆畫、變形、標題）播完才出［再寫一次］；Worker 卡住時頁面 8 秒後改主執行緒算
  await wait("結果", `document.querySelector("[data-act='again']")`, 40000);
  const ms = Date.now() - t0;
  await sleep(1500); // 標題動畫播完、怪圖淡入
  const info = await evaluate(`(() => ({
    stage: document.querySelector("[data-stage]")?.getAttribute("aria-label") ?? null,
    dialog: document.querySelector("[data-bt]")?.closest("section,div")?.parentElement?.innerText?.slice(0, 300) ?? null,
    stats: (document.body.innerText.match(/筆畫 \\d+→\\d+　像度 \\d+%/) ?? [null])[0],
    where: document.querySelector("[data-act='where']")?.textContent ?? null,
    scrollW: document.documentElement.scrollWidth,
  }))()`);
  const file = await fullShot(`rename-${id}.png`);
  const poop = info.stage === "筆畫掉下來堆成一坨";
  const r = { id, strokes: fx.strokes.length, padScale: Number(drawn.scale.toFixed(3)), ms, poop, ...info, file };
  results.rounds.push(r);
  console.log(`  ${id}：${info.stage ?? "沒有演出畫布"}${info.stats ? `（${info.stats}）` : ""}，${ms} ms`);
  return r;
}

let failed = false;
try {
  ({ page, evaluate, navigate, close } = await start(OUT, PORT));
  page.listeners.add(m => {
    if (m.method === "Runtime.exceptionThrown") problems.exceptions.push(String(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text).slice(0, 300));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") problems.errors.push(m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: false });

  for (const [i, id] of PICK.entries()) {
    let r = null;
    try {
      r = await round(id, i === 0);
    } catch (error) {
      record(`${id}：跑完一輪`, false, String(error?.message ?? error).slice(0, 300));
      continue;
    }
    if (id === POOP_ID) record(`${id}：一坨`, r.poop, r.stage);
    else record(`${id}：出怪、有像度、有「在哪打」連結`, !r.poop && /^筆畫變成/.test(r.stage ?? "") && Boolean(r.stats) && Boolean(r.where), { stage: r.stage, stats: r.stats, where: r.where });
    record(`${id}：390 寬不橫捲`, r.scrollW <= 390, r.scrollW);
  }

  // 分享選單（停在最後一輪的結果上）
  try {
    await click("分享", "[data-act='share']");
    await wait("分享選單", `document.querySelector("[data-share='link']")`, 5000);
    await sleep(300);
    await fullShot("rename-share.png");
    const opts = await evaluate(`[...document.querySelectorAll("[data-share]")].map(b => b.getAttribute("data-share"))`);
    record("分享選單：有複製連結、存圖", opts.includes("link") && opts.includes("image"), opts);
  } catch (error) {
    record("分享選單", false, String(error?.message ?? error).slice(0, 300));
  }

  const monsters = results.rounds.filter(r => !r.poop).length;
  record("三組出怪", monsters === PICK.length - 1, monsters);
  record("整趟沒有沒接住的例外、console.error", problems.exceptions.length === 0 && problems.errors.length === 0, problems);
} catch (error) {
  record("整支跑完", false, String(error?.message ?? error).slice(0, 300));
  try { await fullShot("crash.png"); } catch { /* 頁面已經不在 */ }
} finally {
  failed = results.checks.some(c => !c.ok);
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(`${failed ? "沒過" : "全部通過"}；輸出在 ${OUT}`);
  if (close) await close();
}
process.exit(failed ? 1 : 0);
