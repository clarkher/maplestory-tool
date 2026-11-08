// 公會徽章（/plan/guild，v1.81）驗收：預設、換底圖顏色、單色圖案、隨機、下載的圖逐像素、網址參數、不橫捲、不跳（CLS）、首頁跟紙娃娃頁的入口、電腦按分享；
// 任何一項沒過 exit 1
// 用法：node scripts/verify/guild-shot.mjs [網址，預設 http://localhost:9620] [輸出資料夾] [DevTools 埠，預設 9621]
//   例：npx next dev --webpack -p 9620   （另一個視窗先開本機 dev）
//       node scripts/verify/guild-shot.mjs http://localhost:9620 "$TEMP/guild-shot"
//       node scripts/verify/guild-shot.mjs https://maplehelper-dev.pipicards.workers.dev "$TEMP/guild-shot-dev"
// 網址用 localhost，不要用 127.0.0.1（next dev 對 127.0.0.1 的互動不理）。第一次開頁 dev 要編譯，最多等 90 秒。
// 期望值讀「本機」的 src/lib/guild-mark/marks.json（圖集網址、每個底圖／圖案在第幾列、有哪些顏色），不跟被測的站要：
//   驗測試機時，本機的 json 要跟那邊部署的是同一版（圖集檔名帶雜湊，不同版第 5 項會載不到圖集而沒過）。
// 期望的 background-position 照 badge.ts 的 cellStyle 算：x＝-(顏色-1)×17×倍數、y＝-列×17×倍數（大徽章 8 倍、實際大小 1 倍、挑選格子 2 倍）。
// 頁面上的東西用 data-stage（大徽章）、data-actual（1 倍）、data-layer="bg"/"mark"（兩層）、data-tab、data-cat、data-swatch、data-cell、data-on 找，不認樣式 class。
// 下載：把 HTMLAnchorElement.prototype.click 換掉（不真的存檔），攔到 blob 網址＋檔名，在頁面裡用 createImageBitmap 解開，
//       跟「17×17 畫布上先畫底圖那格、再畫圖案那格」逐像素比（每 4×4 一塊要等於小圖那一點）。
// CLS：跟 page-cls.mjs 一樣，CPU 慢 4 倍、PerformanceObserver 記 layout-shift（不算有輸入的），375、1280 各開一次，要是 0。
// 輸出：guild-375.png（一打開）、guild-mark-tab.png（圖案頁）、guild-dark.png（深色）、guild-home.png（首頁入口）、results.json（每一項的結果＋量到的東西）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const BASE = (process.argv[2] ?? "http://localhost:9620").replace(/\/$/, "");
const OUT = outDir(process.argv[3], "guild-shot");
const PORT = chromePort(9621, process.argv[4]);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/guild-mark/marks.json"), "utf8"));
const CELL = DATA.cell;
const PAGE = "/plan/guild";
const DEFAULT = { b: 1005, bc: 10, m: 2000, mc: 2 }; // 跟 badge.ts DEFAULT_BADGE 一樣
const CATS = ["Animal", "Plant", "Pattern", "Letter", "Etc"];

const bgById = new Map(DATA.backgrounds.map(e => [e.id, e]));
const markById = new Map(CATS.flatMap(c => DATA.marks[c].map(e => [e.id, e])));
const SINGLE = CATS.flatMap(c => DATA.marks[c].map(e => ({ ...e, cat: c }))).find(e => e.colours.length === 1); // 9026

/** 期望的 background-position（數字，[x, y]） */
const pos = (row, colour, scale) => [-(colour - 1) * CELL * scale, -row * CELL * scale];
/** 「12px -34px」→ [12, -34] */
const parsePos = s => (s ?? "").split(/\s+/).filter(Boolean).map(v => parseFloat(v));
const same = (a, b) => a.length === 2 && b.length === 2 && Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;

const results = { base: BASE, port: PORT, data: "本機 src/lib/guild-mark/marks.json", atlas: DATA.atlas, checks: [] };
const record = (name, ok, detail) => {
  results.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  return Boolean(ok);
};
async function check(name, fn) {
  try {
    const [ok, detail] = await fn();
    return record(name, ok, detail);
  } catch (error) {
    return record(name, false, `中途出錯：${String(error?.message ?? error).slice(0, 300)}`);
  }
}

let page, evaluate, navigate, shot, close;
const problems = { exceptions: [], errors: [] };

const viewport = (width, height) => page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
const painted = () => evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))");
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
/** 真的用滑鼠點；finder 是一段會回傳元素的程式。找不到就丟錯 */
async function click(what, finder) {
  const at = await evaluate(`(() => { const el = (${finder}); if (!el) return null; el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!at) throw new Error(`點不到：${what}`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 });
}

const READY = `document.querySelector("[data-stage] [data-layer='mark']")`;
const query = () => evaluate("Object.fromEntries(new URLSearchParams(location.search))");
/** 大徽章、1 倍那顆兩層的 background-position */
const layers = () => evaluate(`(() => {
  const read = sel => { const el = document.querySelector(sel); return el ? { bg: el.querySelector("[data-layer='bg']")?.style.backgroundPosition ?? null, mark: el.querySelector("[data-layer='mark']")?.style.backgroundPosition ?? null } : null; };
  return { stage: read("[data-stage]"), actual: read("[data-actual]") };
})()`);
/** 畫的是不是 badge 這一個（大徽章 8 倍、1 倍那顆） */
async function drawsBadge(badge) {
  const got = await layers();
  const bg = bgById.get(badge.b), mark = markById.get(badge.m);
  const want = {
    stage: { bg: pos(bg.row, badge.bc, 8), mark: pos(mark.row, badge.mc, 8) },
    actual: { bg: pos(bg.row, badge.bc, 1), mark: pos(mark.row, badge.mc, 1) },
  };
  const ok = ["stage", "actual"].every(k => got[k] && same(parsePos(got[k].bg), want[k].bg) && same(parsePos(got[k].mark), want[k].mark));
  return { ok, got, want: { stage: { bg: want.stage.bg.join(" "), mark: want.stage.mark.join(" ") }, actual: { bg: want.actual.bg.join(" "), mark: want.actual.mark.join(" ") } } };
}
/** 跟 badge.ts parseBadge 同一套規則（只認合法值）：網址上的四個數字都要是這個站真的有的組合 */
function validQuery(q) {
  const n = v => (/^\d+$/.test(v ?? "") ? Number(v) : NaN);
  const bg = bgById.get(n(q.b)), mark = markById.get(n(q.m));
  return Boolean(bg && mark && bg.colours.includes(n(q.bc)) && mark.colours.includes(n(q.mc)));
}
const asBadge = q => ({ b: Number(q.b), bc: Number(q.bc), m: Number(q.m), mc: Number(q.mc) });
const BUTTON = text => `[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
async function open(search = "") {
  await navigate(`${BASE}${PAGE}${search}`);
  await wait("大徽章", READY, 90000);
  await painted();
}

try {
  ({ page, evaluate, navigate, shot, close } = await start(OUT, PORT));
  page.listeners.add(m => {
    if (m.method === "Runtime.exceptionThrown") problems.exceptions.push(String(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text).slice(0, 300));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") problems.errors.push(m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  });
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__ls = [];
      try { new PerformanceObserver(list => { for (const e of list.getEntries()) window.__ls.push({ t: Math.round(e.startTime), v: e.value, input: e.hadRecentInput }); }).observe({ type: "layout-shift", buffered: true }); } catch {}`,
  });
  await viewport(375, 812);

  // 1. 一打開畫預設
  await check("375 一打開：大徽章、1 倍那顆都在，沒帶參數畫預設（底圖 1005 色 10、圖案 2000 色 2）", async () => {
    await open();
    const d = await drawsBadge(DEFAULT);
    const search = await evaluate("location.search");
    await shot("guild-375.png");
    return [d.ok && search === "", { search, ...d }];
  });

  // 2. 換底圖顏色
  await check("底圖頁點顏色 3：網址 bc=3、每一格底圖都換成第 3 欄、大徽章跟著換", async () => {
    await open();
    await click("底圖顏色 3", `document.querySelector("[data-swatch='3']")`);
    await wait("網址 bc=3", `new URLSearchParams(location.search).get("bc") === "3"`, 5000);
    await painted();
    const cells = await evaluate(`[...document.querySelectorAll("[data-cell]")].map(b => ({ id: Number(b.dataset.cell), p: b.querySelector("span")?.style.backgroundPosition }))`);
    const bad = cells.filter(c => !bgById.has(c.id) || !same(parsePos(c.p), pos(bgById.get(c.id).row, 3, 2)));
    const q = await query();
    const d = await drawsBadge(asBadge(q));
    const swatchOn = await evaluate(`document.querySelector("[data-swatch][data-on]")?.dataset.swatch`);
    return [cells.length === DATA.backgrounds.length && bad.length === 0 && q.b === String(DEFAULT.b) && d.ok && swatchOn === "3",
      { cells: cells.length, bad: bad.slice(0, 3), query: q, swatchOn, stage: d.got.stage }];
  });

  // 3. 單色圖案
  await check(`圖案頁選顏色 7 →「其他」→ ${SINGLE.id}（只有 1 色、格子寫「不放圖案」）：色票只剩 1 能按、畫第 1 色；再點動物第 2 個 → 顏色回到 7`, async () => {
    await open();
    await click("圖案分頁", `document.querySelector("[data-tab='mark']")`);
    await wait("圖案頁", `document.querySelector("[data-tab='mark'][data-on]") && document.querySelector("[data-cat]")`, 5000);
    await click("圖案顏色 7", `document.querySelector("[data-swatch='7']")`);
    await wait("網址 mc=7", `new URLSearchParams(location.search).get("mc") === "7"`, 5000);
    await click("其他", `document.querySelector("[data-cat='${SINGLE.cat}']")`);
    await wait(`${SINGLE.id} 那格`, `document.querySelector("[data-cell='${SINGLE.id}']")`, 5000);
    // v1.82：這格寫「不放圖案」（客戶端是整片幾乎透明的圖），讀屏也念「不放圖案」
    const label = await evaluate(`(() => { const b = document.querySelector("[data-cell='${SINGLE.id}']"); return [b.textContent.trim(), b.getAttribute("aria-label")]; })()`);
    await click(String(SINGLE.id), `document.querySelector("[data-cell='${SINGLE.id}']")`);
    await wait(`網址 m=${SINGLE.id}`, `new URLSearchParams(location.search).get("m") === "${SINGLE.id}"`, 5000);
    await painted();
    const enabled = await evaluate(`[...document.querySelectorAll("[data-swatch]")].filter(b => !b.disabled).map(b => b.dataset.swatch)`);
    const q1 = await query();
    const d1 = await drawsBadge(asBadge(q1));
    const animal2 = DATA.marks.Animal[1];
    await click("動物", `document.querySelector("[data-cat='Animal']")`);
    await wait("動物第 2 個", `document.querySelector("[data-cell='${animal2.id}']")`, 5000);
    await click("動物第 2 個", `document.querySelector("[data-cell='${animal2.id}']")`);
    await wait(`網址 m=${animal2.id}`, `new URLSearchParams(location.search).get("m") === "${animal2.id}"`, 5000);
    await painted();
    const q2 = await query();
    const d2 = await drawsBadge(asBadge(q2));
    await evaluate(`document.querySelector("[data-tab='mark']").closest("section").scrollIntoView({ block: "start", behavior: "instant" })`);
    await painted();
    await shot("guild-mark-tab.png");
    return [label[0] === "不放圖案" && label[1] === "不放圖案" && enabled.join() === "1" && q1.mc === "1" && d1.ok && q2.mc === "7" && d2.ok,
      { label, enabled, single: q1, back: q2, singleStage: d1.got.stage, backStage: d2.got.stage }];
  });

  // 4. 隨機 10 次
  await check("按「隨機一個」10 次：每次網址都合法、大徽章跟 1 倍那顆畫的是網址那一個", async () => {
    await open();
    const rounds = [];
    for (let i = 0; i < 10; i++) {
      const before = await evaluate("location.search");
      await click("隨機一個", BUTTON("隨機一個"));
      // 偶爾會抽到一模一樣的：等不到網址變就照現在的驗
      await until(`location.search !== ${JSON.stringify(before)}`, 3000);
      await painted();
      const q = await query();
      const valid = validQuery(q);
      const d = valid ? await drawsBadge(asBadge(q)) : { ok: false };
      rounds.push({ q: `b=${q.b}&bc=${q.bc}&m=${q.m}&mc=${q.mc}`, valid, drawn: d.ok });
    }
    const distinct = new Set(rounds.map(r => r.q)).size;
    return [rounds.every(r => r.valid && r.drawn) && distinct >= 8, { distinct, rounds }];
  });

  // 5. 下載
  await check("按「下載」：公會徽章.png、68×68、每 4×4 一塊同色、跟圖集兩格疊起來逐像素一樣", async () => {
    await open("?b=1012&bc=3&m=5004&mc=7");
    await evaluate(`(() => {
      window.__dl = null;
      const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) { window.__dl = { href: this.href, name: this.download, blob: fetch(this.href).then(r => r.blob()) }; return; }
        return orig.call(this);
      };
      return true;
    })()`);
    // 圖集在背景載：等它在 performance 裡出現再按，不然會跳「圖還沒載好」
    await until(`performance.getEntriesByType("resource").some(e => e.name.includes(${JSON.stringify(DATA.atlas)}))`, 10000);
    await sleep(300);
    await click("下載", BUTTON("下載"));
    await wait("攔到下載", "window.__dl", 5000);
    const q = await query();
    const bg = bgById.get(Number(q.b)), mark = markById.get(Number(q.m));
    const m = await evaluate(`(async () => {
      const dl = window.__dl;
      const blob = await dl.blob;
      const bmp = await createImageBitmap(blob);
      const big = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d");
      big.drawImage(bmp, 0, 0);
      const B = big.getImageData(0, 0, bmp.width, bmp.height).data;
      const img = new Image();
      img.src = ${JSON.stringify(DATA.atlas)};
      await img.decode();
      const small = new OffscreenCanvas(${CELL}, ${CELL}).getContext("2d");
      small.imageSmoothingEnabled = false;
      for (const [row, c] of [[${bg.row}, ${Number(q.bc)}], [${mark.row}, ${Number(q.mc)}]]) small.drawImage(img, (c - 1) * ${CELL}, row * ${CELL}, ${CELL}, ${CELL}, 0, 0, ${CELL}, ${CELL});
      const S = small.getImageData(0, 0, ${CELL}, ${CELL}).data;
      let blockBad = 0, diff = 0, opaque = 0, firstDiff = null;
      if (bmp.width === 68 && bmp.height === 68) {
        for (let y = 0; y < 68; y++) for (let x = 0; x < 68; x++) {
          const i = (y * 68 + x) * 4, k = ((y >> 2) * ${CELL} + (x >> 2)) * 4, j = (((y >> 2) * 4) * 68 + (x >> 2) * 4) * 4;
          if (B[i] !== B[j] || B[i + 1] !== B[j + 1] || B[i + 2] !== B[j + 2] || B[i + 3] !== B[j + 3]) blockBad++;
          if (B[i] !== S[k] || B[i + 1] !== S[k + 1] || B[i + 2] !== S[k + 2] || B[i + 3] !== S[k + 3]) { diff++; firstDiff ??= { x, y, got: [...B.slice(i, i + 4)], want: [...S.slice(k, k + 4)] }; }
          if (B[i + 3] > 0) opaque++;
        }
      }
      return { name: dl.name, type: blob.type, bytes: blob.size, width: bmp.width, height: bmp.height, blockBad, diff, opaque, firstDiff };
    })()`);
    return [m.name === "公會徽章.png" && m.width === 68 && m.height === 68 && m.blockBad === 0 && m.diff === 0 && m.opaque > 0, { query: q, ...m }];
  });

  // 6. 網址參數
  await check("帶 ?b=1012&bc=3&m=5004&mc=7 打開畫那一個；帶 ?m=99999&bc=0 退回預設", async () => {
    await open("?b=1012&bc=3&m=5004&mc=7");
    const a = await drawsBadge({ b: 1012, bc: 3, m: 5004, mc: 7 });
    const onA = await evaluate(`[...document.querySelectorAll("[data-cell][data-on]")].map(b => b.dataset.cell)`);
    await open("?m=99999&bc=0");
    const b = await drawsBadge(DEFAULT);
    return [a.ok && b.ok && onA.includes("1012"), { given: a.got.stage, picked: onA, fallback: b.got.stage }];
  });

  // 6b. 置中（v1.82）：遊戲裡每格位置不一，畫面上看得到的部分要在正中間（量畫出來的位置＋資料的 box）
  const OFF = CATS.flatMap(c => DATA.marks[c]).find(e => e.box[0] + e.box[2] / 2 < 7.5 || e.box[1] + e.box[3] / 2 < 7.5);
  await check(`大徽章、圖案格子看得到的部分置中（大徽章差 ≤ 4px、格子差 ≤ 1px；含偏一邊的 ${OFF.id}）`, async () => {
    const stage = [];
    for (const q of ["", `?b=1012&bc=3&m=${OFF.id}&mc=${OFF.colours[0]}`]) {
      await open(q);
      const qq = await query();
      const boxes = [bgById.get(Number(qq.b) || DEFAULT.b).box, markById.get(Number(qq.m) || DEFAULT.m).box];
      stage.push(await evaluate(`(() => {
        const s = document.querySelector("[data-stage]").getBoundingClientRect();
        const r = [...document.querySelectorAll("[data-stage] [data-layer]")].map(l => l.getBoundingClientRect());
        const boxes = ${JSON.stringify(boxes)};
        const x0 = Math.min(...boxes.map((b, i) => r[i].left + b[0] * 8)), x1 = Math.max(...boxes.map((b, i) => r[i].left + (b[0] + b[2]) * 8));
        const y0 = Math.min(...boxes.map((b, i) => r[i].top + b[1] * 8)), y1 = Math.max(...boxes.map((b, i) => r[i].top + (b[1] + b[3]) * 8));
        return { dx: (x0 + x1) / 2 - (s.left + s.width / 2), dy: (y0 + y1) / 2 - (s.top + s.height / 2) };
      })()`));
    }
    await click("圖案分頁", `document.querySelector("[data-tab='mark']")`);
    const cat = CATS.find(c => DATA.marks[c].some(e => e.id === OFF.id));
    await click(cat, `document.querySelector("[data-cat='${cat}']")`);
    await wait(`${OFF.id} 那格`, `document.querySelector("[data-cell='${OFF.id}']")`, 5000);
    const boxById = Object.fromEntries(DATA.marks[cat].map(e => [e.id, e.box]));
    const tiles = await evaluate(`(() => {
      const boxById = ${JSON.stringify(boxById)};
      return [...document.querySelectorAll("[data-cell]")].filter(b => b.querySelector("span[style]")).map(b => {
        const c = b.getBoundingClientRect(), s = b.querySelector("span[style]").getBoundingClientRect(), x = boxById[b.dataset.cell];
        return { id: b.dataset.cell, dx: s.left + (x[0] + x[2] / 2) * 2 - (c.left + c.width / 2), dy: s.top + (x[1] + x[3] / 2) * 2 - (c.top + c.height / 2) };
      });
    })()`);
    const badTiles = tiles.filter(t => Math.abs(t.dx) > 1 || Math.abs(t.dy) > 1);
    const okStage = stage.every(d => Math.abs(d.dx) <= 4 && Math.abs(d.dy) <= 4);
    return [okStage && tiles.length > 0 && badTiles.length === 0, { stage, tiles: tiles.length, badTiles }];
  });

  // 7. 不橫捲、不跳
  await check("375 寬兩個分頁都不橫捲（scrollWidth <= 375）", async () => {
    await open();
    const w1 = await evaluate("document.documentElement.scrollWidth");
    await click("圖案分頁", `document.querySelector("[data-tab='mark']")`);
    await wait("圖案頁", `document.querySelector("[data-cat]")`, 5000);
    const w2 = await evaluate("document.documentElement.scrollWidth");
    return [w1 <= 375 && w2 <= 375, { bg: w1, mark: w2 }];
  });
  await check("CLS：CPU 慢 4 倍打開，375、1280 都是 0", async () => {
    const out = {};
    await page.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    try {
      for (const [w, h] of [[375, 812], [1280, 900]]) {
        await viewport(w, h);
        await open();
        await sleep(3000);
        const list = (await evaluate("window.__ls")).filter(e => !e.input);
        out[w] = { sum: +list.reduce((s, e) => s + e.v, 0).toFixed(4), entries: list };
      }
    } finally {
      await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await viewport(375, 812);
    }
    return [out[375].sum === 0 && out[1280].sum === 0, out];
  });

  // 深色
  await check("深色一打開：截 guild-dark.png", async () => {
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
    await open();
    await evaluate(`(() => { document.documentElement.dataset.theme = "dark"; return true; })()`);
    await painted();
    await sleep(300);
    const bodyBg = await evaluate("getComputedStyle(document.body).backgroundColor");
    await shot("guild-dark.png");
    await page.send("Emulation.setEmulatedMedia", { features: [] });
    await evaluate(`(() => { delete document.documentElement.dataset.theme; return true; })()`);
    return [true, { bodyBg }];
  });

  // 電腦按分享
  await check("電腦（1280）按「分享」：跳「已複製連結」", async () => {
    await page.send("Browser.grantPermissions", { origin: new URL(BASE).origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }).catch(() => {});
    await viewport(1280, 900);
    await open("?b=1012&bc=3&m=5004&mc=7");
    await click("分享", BUTTON("分享"));
    const ok = await until(`document.querySelector("[aria-live='polite']")?.textContent.includes("已複製連結")`, 5000);
    const toast = await evaluate(`document.querySelector("[aria-live='polite']")?.textContent ?? ""`);
    await viewport(375, 812);
    return [ok, { toast }];
  });

  // 8. 首頁、紙娃娃頁入口
  await check("首頁（第一次來）輪播下有「做公會徽章」，點了到 /plan/guild", async () => {
    await navigate(`${BASE}/robots.txt`);
    await evaluate(`(localStorage.removeItem("ms-profile"), true)`);
    await navigate(`${BASE}/`);
    const LINK = `[...document.querySelectorAll("a[href='/plan/guild']")].find(a => a.textContent.trim() === "做公會徽章" && a.checkVisibility())`;
    await wait("做公會徽章", LINK, 90000);
    const m = await evaluate(`(() => {
      const a = ${LINK}; const r = a.getBoundingClientRect();
      const showcase = document.querySelector("section[aria-label='紙娃娃']")?.getBoundingClientRect();
      return { height: Math.round(r.height), width: Math.round(r.width), belowShowcase: !!showcase && r.top >= showcase.bottom - 1, fontSize: getComputedStyle(a).fontSize };
    })()`);
    await evaluate(`(${LINK}).closest("div").scrollIntoView({ block: "center", behavior: "instant" })`);
    await painted();
    await shot("guild-home.png");
    await click("做公會徽章", LINK);
    const went = await until(`location.pathname === "${PAGE}" && ${READY}`, 60000);
    return [went && m.belowShowcase && m.height >= 32 && m.fontSize === "13px", { went, ...m }];
  });
  await check("紙娃娃頁標題下有「也可以做公會徽章」，點了到 /plan/guild", async () => {
    await navigate(`${BASE}/plan/avatar?g=0`);
    const LINK = `[...document.querySelectorAll("a[href='/plan/guild']")].find(a => a.textContent.trim() === "也可以做公會徽章")`;
    await wait("也可以做公會徽章", LINK, 90000);
    const m = await evaluate(`(() => { const a = ${LINK}; const r = a.getBoundingClientRect(); return { height: Math.round(r.height), fontSize: getComputedStyle(a).fontSize }; })()`);
    await click("也可以做公會徽章", LINK);
    const went = await until(`location.pathname === "${PAGE}" && ${READY}`, 60000);
    return [went && m.height >= 32 && m.fontSize === "13px", { went, ...m }];
  });

  record("整趟 console 沒有例外或錯誤", problems.exceptions.length === 0 && problems.errors.length === 0, problems);
} catch (error) {
  record("腳本中途出錯", false, String(error?.message ?? error).slice(0, 400));
  try { await shot("crash.png"); } catch { /* 頁面已經不在 */ }
} finally {
  const passed = results.checks.filter(c => c.ok).length;
  results.summary = `${passed}/${results.checks.length}`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\n${results.summary} 項通過，輸出在 ${OUT}`);
  if (close) await close();
  process.exit(passed === results.checks.length && results.checks.length > 0 ? 0 : 1);
}
