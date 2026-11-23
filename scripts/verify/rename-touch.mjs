// 名字變怪物（/plan/rename）簽名格的手指驗收（v2.61）：手機觸控，在簽名格裡上下左右拖，頁面不准捲、筆畫不准被切斷，
// 而且 touchstart／touchmove 要被頁面收下（defaultPrevented）。任何一項沒過 exit 1
// 為什麼要看 defaultPrevented：touch-action 只管得到瀏覽器自己的捲動；社群 App 內建瀏覽器外面那層（下拉關閉、下拉重新整理）
// 看的是頁面有沒有收下觸控，沒收下就會被它拿去滑走（2026-11-23 巴哈回報「不太好簽 會一直滑掉」）。
// 對照組：在格子外面往上滑，頁面真的會捲（不會捲的話上面那幾項等於沒驗）。
// 用法：node scripts/verify/rename-touch.mjs [網址，預設 http://localhost:3473] [輸出資料夾] [DevTools 埠，預設 9633]
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const BASE = (process.argv[2] ?? "http://localhost:3473").replace(/\/$/, "");
const OUT = outDir(process.argv[3], "rename-touch");
const PORT = chromePort(9633, process.argv[4]);

let failed = false;
const record = (name, ok, detail) => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${JSON.stringify(detail)}`);
};

const { page, evaluate, navigate, close } = await start(OUT, PORT);
const touch = (type, x, y) => page.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
async function swipe([x0, y0], [x1, y1], steps = 16) {
  await touch("touchStart", x0, y0);
  for (let i = 1; i <= steps; i++) {
    await touch("touchMove", x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await sleep(16);
  }
  await touch("touchEnd");
  await sleep(600); // 慣性捲動
}
async function until(expression, ms) {
  for (let t = 0; t < ms; t += 250) {
    try { if (await evaluate(`Boolean(${expression})`)) return; } catch { /* 換頁中 */ }
    await sleep(250);
  }
  throw new Error(`等不到：${expression}`);
}

try {
  // 高度壓矮，格子上面一定捲得動
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 600, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await navigate(`${BASE}/plan/rename`);
  await until(`document.querySelector("[data-bt='yes']")`, 90000);
  await sleep(1500);
  await evaluate(`document.querySelector("[data-bt='yes']").click()`);
  await until(`document.querySelector("[data-pad]")`, 15000);
  await sleep(500);
  const pad = await evaluate(`(() => {
    const el = document.querySelector("[data-pad]");
    el.scrollIntoView({ block: "center", behavior: "instant" });
    window.__log = [];
    for (const t of ["pointerdown", "pointerup", "pointercancel"]) el.addEventListener(t, e => window.__log.push([t, null]));
    // 冒泡到 window 才看，canvas 自己的監聽已經跑完
    for (const t of ["touchstart", "touchmove"]) window.addEventListener(t, e => { if (e.target === el) window.__log.push([t, e.defaultPrevented, e.cancelable]); }, { passive: true });
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, scrollY, max: document.documentElement.scrollHeight - innerHeight };
  })()`);
  console.log("  簽名格", JSON.stringify(pad));
  const P = (fx, fy) => [pad.x + pad.w * fx, pad.y + pad.h * fy];

  // 對照組：格子外（標題那行）往上滑，頁面要會捲
  await swipe([pad.x + pad.w * 0.5, pad.y - 30], [pad.x + pad.w * 0.5, pad.y - 110]);
  const moved = await evaluate(`scrollY - ${pad.scrollY}`);
  record("對照組：格子外滑頁面會捲", Math.abs(moved) > 20, { moved });
  await evaluate(`window.scrollTo({ top: ${pad.scrollY}, behavior: "instant" })`);
  await sleep(300);

  for (const [name, a, b] of [
    ["往上", P(0.5, 0.85), P(0.5, 0.15)],
    ["往下", P(0.3, 0.15), P(0.3, 0.85)],
    ["往右", P(0.1, 0.5), P(0.9, 0.5)],
    ["往左", P(0.9, 0.6), P(0.1, 0.6)],
    ["寫出格子外面（往下）", P(0.7, 0.5), [pad.x + pad.w * 0.7, Math.min(590, pad.y + pad.h + 80)]],
  ]) {
    await evaluate(`window.__log = []`);
    await swipe(a, b);
    const r = await evaluate(`({ dy: scrollY - ${pad.scrollY}, log: window.__log })`);
    const n = t => r.log.filter(e => e[0] === t).length;
    const taken = t => r.log.filter(e => e[0] === t && e[1]).length;
    record(`${name}：頁面沒捲、筆畫沒被切斷`, r.dy === 0 && n("pointercancel") === 0 && n("pointerup") === 1, { dy: r.dy, down: n("pointerdown"), up: n("pointerup"), cancel: n("pointercancel") });
    record(`${name}：觸控被頁面收下`, n("touchstart") > 0 && taken("touchstart") === n("touchstart") && n("touchmove") > 0 && taken("touchmove") === n("touchmove"), { start: `${taken("touchstart")}/${n("touchstart")}`, move: `${taken("touchmove")}/${n("touchmove")}` });
  }
  const shot = await page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, "rename-touch.png"), Buffer.from(shot.data, "base64"));
  // 收下觸控不准把格子外的按鈕弄壞：手指點「擦掉重寫」要會清掉
  const btn = await evaluate(`(() => { const el = document.querySelector("[data-act='clear']"); const before = el.disabled; el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { before, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await touch("touchStart", btn.x, btn.y);
  await touch("touchEnd");
  await sleep(400);
  const after = await evaluate(`document.querySelector("[data-act='clear']").disabled`);
  record("手指點［擦掉重寫］會清掉", btn.before === false && after === true, { before: btn.before, after });
} catch (error) {
  record("跑完", false, String(error?.message ?? error));
} finally {
  await close?.();
}
process.exit(failed ? 1 : 0);
