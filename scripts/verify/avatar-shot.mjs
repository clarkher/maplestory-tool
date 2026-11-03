// 紙娃娃（/plan/avatar，v1.40）驗收：挑髮型換顏色、小窗、隨機穿搭、換性別、畫不出來的點裝、查資料「穿上看看」、角色圖載不出來、電腦版左右排；任何一項沒過 exit 1
// 用法：node scripts/verify/avatar-shot.mjs [網址，預設 http://localhost:9381] [輸出資料夾] [DevTools 埠，預設 9382]
//   例：node scripts/verify/avatar-shot.mjs http://localhost:9381 "$TEMP/avatar-shot"
// 網址用 localhost，不要用 127.0.0.1（next dev 對 127.0.0.1 的互動不理）。第一次開頁 dev 要編譯，最多等 1 分鐘。
// 角色圖是瀏覽器向 maplestory.io 即時要的，要連得到網路（第 8 項會用 DevTools 把它擋掉，只在那一項）。
// 輸出：avatar-375.png（一打開）、avatar-hair.png（挑第 3 款髮型、換紅色）、avatar-mini.png／avatar-mini-dark.png（捲到挑衣服卡底、小窗）、
//       avatar-missing.png（畫不出來的點裝）、avatar-from-db.png（從查資料進來）、avatar-error.png（角色圖載不出來）、
//       avatar-1280.png／avatar-1280-dark.png（電腦版左右排）、results.json（每一項檢查的結果＋量到的東西）
// 期望值從 public/data/avatar.json 算：男生第 3 款髮型、女生第 1 款髮型、第一件男生能穿的點裝帽子、一件畫不出來的點裝帽子。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const BASE = (process.argv[2] ?? "http://localhost:9381").replace(/\/$/, "");
const OUT = outDir(process.argv[3], "avatar-shot");
const PORT = chromePort(9382, process.argv[4]);

const data = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public/data/avatar.json"), "utf8"));
const fits = (x, g) => x.g === g || x.g === 2;
const drawable = s => s.t.length + s.j.length > 0;
const MALE_HAIR = data.hair.filter(s => fits(s, 0) && drawable(s));
const FEMALE_HAIR = data.hair.filter(s => fits(s, 1) && drawable(s));
const FIRST_CAP = data.items.find(i => i.k === "cap" && fits(i, 0) && i.cash && i.r);
const MISSING_CAP = data.items.find(i => i.k === "cap" && fits(i, 0) && i.cash && !i.r);
const TRY = 1042029;
const TRY_NAME = data.items.find(i => i.id === TRY)?.n; // 三眼章魚T恤

const results = { base: BASE, port: PORT, expect: { hair3: MALE_HAIR[2]?.id, female1: FEMALE_HAIR[0]?.n, firstCap: FIRST_CAP?.n, missing: MISSING_CAP?.id }, checks: [] };
const record = (name, ok, detail) => {
  results.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  return Boolean(ok);
};

let page, evaluate, navigate, shot, close;
const problems = { exceptions: [], errors: [] };

const viewport = (width, height) => page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
const setTheme = theme => evaluate(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(theme)}; return true; })()`);
const bodyText = () => evaluate("document.body.innerText");

async function until(expression, ms = 60000) {
  for (let t = 0; t < ms; t += 250) {
    try { if (await evaluate(`Boolean(${expression})`)) return true; } catch { /* 換頁中 */ }
    await sleep(250);
  }
  return false;
}

/** 真的用滑鼠點；finder 是一段會回傳元素的程式。instant 才不會邊滑邊量 */
async function click(finder) {
  const at = await evaluate(`(() => { const el = (${finder}); if (!el) return null; el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!at) return false;
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 });
  return true;
}

const CARD = `document.querySelector("section[aria-label='角色']")`;
const PICKER = `document.querySelector("section[aria-label='挑衣服']")`;
const MINI = `document.querySelector("[aria-label='角色小窗']")`;
const STAGE_IMG = `${CARD}?.querySelector("img[alt='穿好的角色']")`;
const CELLS = `[...(${PICKER}?.querySelectorAll("ul li button") ?? [])]`;
const button = (scope, text) => `[...(${scope}?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
/** 舞台的圖載好了（有寬度）；給 id 就要圖的網址裡有這個道具 */
const stageReady = id => `(() => { const img = ${STAGE_IMG}; return !!img && img.complete && img.naturalWidth > 0${id === undefined ? "" : ` && decodeURIComponent(img.src).includes('"itemId":${id}')`}; })()`;
const stageSrc = () => evaluate(`${STAGE_IMG}?.src ?? null`);
const noHScroll = () => evaluate(`({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })`);
const worn = () => evaluate(`[...document.querySelectorAll("ul[aria-label='穿了什麼'] li")].map(li => li.innerText.replace(/\\s+/g, " ").trim())`);
const open = query => navigate(`${BASE}/plan/avatar${query}`);

/** 打字進搜尋框（走真的輸入，React 才收得到） */
async function typeSearch(text) {
  const finder = `${PICKER}?.querySelector("input[type='search']")`;
  if (!(await click(finder))) return false;
  await evaluate(`(${finder}).select()`);
  await page.send("Input.insertText", { text });
  await sleep(200);
  return true;
}

try {
  ({ page, evaluate, navigate, shot, close } = await start(OUT, PORT));
  page.listeners.add(msg => {
    if (msg.method === "Runtime.exceptionThrown") problems.exceptions.push(String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text).slice(0, 300));
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") problems.errors.push(msg.params.args.map(a => a.value ?? a.description).join(" ").slice(0, 300));
  });
  await viewport(375, 812);

  // 1. 一打開：舞台圖載好、不橫捲
  await open("");
  const loaded = await until(stageReady());
  await until(`${CELLS}.length >= 40`, 15000);
  await sleep(500);
  const w1 = await noHScroll();
  record("375 寬一打開：舞台圖載好、頁面不橫捲", loaded && w1.scrollWidth <= w1.clientWidth, { loaded, ...w1 });
  await shot("avatar-375.png");

  // 2. 髮型第 3 格 → h 換成那一款（目前黑色）；紅色色塊 → h 尾數 1
  const before = { search: await evaluate("location.search"), src: await stageSrc() };
  const hair3 = MALE_HAIR[2];
  await click(`${CELLS}[2]`);
  const hairChanged = await until(`new URLSearchParams(location.search).get("h") === "${hair3.id}"`, 10000);
  const hairDrawn = await until(stageReady(hair3.id), 30000);
  const after3 = { search: await evaluate("location.search"), src: await stageSrc(), pressed: await evaluate(`${CELLS}.findIndex(b => b.getAttribute("aria-pressed") === "true")`) };
  await click(`document.querySelector("[role='group'][aria-label='髮色'] button[aria-label='紅色']")`);
  const red = await until(`new URLSearchParams(location.search).get("h") === "${hair3.id + 1}"`, 10000);
  const redDrawn = await until(stageReady(hair3.id + 1), 30000);
  const redPressed = await evaluate(`document.querySelector("[role='group'][aria-label='髮色'] button[aria-label='紅色']")?.getAttribute("aria-pressed")`);
  record(`點髮型第 3 格（${hair3.n} ${hair3.id}）：網址 h 變了、舞台圖換了；點紅色：h 尾數變 1`,
    hairChanged && hairDrawn && after3.src !== before.src && after3.pressed === 2 && red && redDrawn && redPressed === "true",
    { before: before.search, after: after3.search, pressedCell: after3.pressed, red: await evaluate("location.search"), redPressed });
  await evaluate(`${CARD}.scrollIntoView({ block: "start", behavior: "instant" })`);
  await sleep(300);
  await shot("avatar-hair.png");

  // 3. 捲到挑衣服卡底：小窗出現、三顆按鈕、沒蓋住最後一排；回到上面
  await evaluate(`(() => { const p = ${PICKER}; window.scrollTo({ top: p.getBoundingClientRect().bottom + scrollY - innerHeight + 16, behavior: "instant" }); return true; })()`);
  const miniShown = await until(`${MINI}`, 5000);
  await until(`(() => { const img = ${MINI}?.querySelector("img[alt='穿好的角色']"); return img && img.complete && img.naturalWidth > 0; })()`, 15000);
  await sleep(300);
  const mini = await evaluate(`(() => {
    const m = ${MINI};
    if (!m) return null;
    const cells = ${CELLS};
    const last = cells.at(-1)?.getBoundingClientRect();
    const more = ${button(PICKER, "再看 40 個")}?.getBoundingClientRect();
    return {
      buttons: [...m.querySelectorAll("button")].map(b => b.textContent.trim()),
      stage: m.querySelector("img[alt='穿好的角色']")?.naturalWidth ?? 0,
      bottom: Math.round(m.getBoundingClientRect().bottom),
      lastCellTop: last ? Math.round(last.top) : null,
      moreTop: more ? Math.round(more.top) : null,
      scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
    };
  })()`);
  const miniOk = miniShown && mini && ["下載", "分享", "回到上面"].every(t => mini.buttons.includes(t)) && mini.stage > 0
    && mini.lastCellTop !== null && mini.lastCellTop >= mini.bottom && mini.scrollWidth <= mini.clientWidth;
  await shot("avatar-mini.png");
  await setTheme("dark");
  await sleep(300);
  await shot("avatar-mini-dark.png");
  await setTheme("light");
  await click(button(MINI, "回到上面"));
  const top = await until(`scrollY === 0 && !${MINI}`, 5000);
  record("捲到挑衣服卡底：小窗出現、有「下載」「分享」「回到上面」、沒蓋住最後一排；點「回到上面」回到頂端", miniOk && top, { ...mini, top });

  // 4. 隨機穿搭 3 次：每次網址都變、舞台圖載好
  const rounds = [];
  for (let i = 0; i < 3; i++) {
    const prev = { search: await evaluate("location.search"), src: await stageSrc() };
    await click(button(CARD, "隨機穿搭"));
    const changed = await until(`location.search !== ${JSON.stringify(prev.search)}`, 10000);
    const drawn = await until(`(() => { const img = ${STAGE_IMG}; return img && img.complete && img.naturalWidth > 0 && img.src !== ${JSON.stringify(prev.src)}; })()`, 30000);
    rounds.push({ changed, drawn, search: (await evaluate("location.search")).slice(0, 90) });
  }
  record("按「隨機穿搭」3 次：每次網址都變、舞台圖載好", rounds.every(r => r.changed && r.drawn), rounds);

  // 5. 換女生：g=1、髮型第一格是女生髮型
  await click(`[...document.querySelectorAll("[role='group'][aria-label='性別'] button")].find(b => b.textContent.trim() === "女")`);
  const female = await until(`new URLSearchParams(location.search).get("g") === "1"`, 10000);
  await sleep(300);
  const cellNames = await evaluate(`${CELLS}.map(b => b.querySelector("span.line-clamp-2")?.textContent ?? "")`);
  const femaleNames = new Set(data.hair.filter(s => fits(s, 1)).map(s => s.n));
  const allFemale = cellNames.length > 0 && cellNames.every(n => femaleNames.has(n));
  record(`切「女」：網址有 g=1、髮型第一格是女生髮型（${FEMALE_HAIR[0].n}）`, female && cellNames[0] === FEMALE_HAIR[0].n && allFemale,
    { search: await evaluate("location.search"), first: cellNames[0], cells: cellNames.length, allFemale });

  // 6. 帶一件畫不出來的點裝進來：頁面正常、穿預設；帽子頁看得到「暫時看不到樣子」，點了跳提示、不穿
  await open(`?try=${MISSING_CAP.id}`);
  const missingLoaded = await until(stageReady());
  const toDefault = await until(`location.search === ""`, 10000);
  const wornMissing = await worn();
  await click(`[...document.querySelectorAll("[role='group'][aria-label='類別'] button")].find(b => b.textContent.trim() === "帽子")`);
  await sleep(300);
  const firstCap = await evaluate(`${CELLS}[0]?.querySelector("span.line-clamp-2")?.textContent ?? null`);
  await typeSearch(MISSING_CAP.n);
  const cellFinder = `${CELLS}.find(b => b.innerText.includes(${JSON.stringify(MISSING_CAP.n)}))`;
  const fadedShown = await until(`(${cellFinder})?.innerText.includes("暫時看不到樣子")`, 5000);
  await click(cellFinder);
  const toastShown = await until(`document.body.innerText.includes("這件暫時看不到樣子，先挑別件")`, 3000);
  await sleep(300);
  const stillDefault = (await evaluate("location.search")) === "";
  await shot("avatar-missing.png");
  record(`?try=${MISSING_CAP.id}（${MISSING_CAP.n}，畫不出來）：頁面正常、穿預設；帽子頁第一格是點裝、搜得到它且寫「暫時看不到樣子」，點了跳提示、不穿`,
    missingLoaded && toDefault && !wornMissing.some(t => t.includes(MISSING_CAP.n)) && firstCap === FIRST_CAP.n && fadedShown && toastShown && stillDefault,
    { missingLoaded, toDefault, worn: wornMissing, fadedShown, toastShown, stillDefault, firstCap, expectFirstCap: FIRST_CAP.n, firstCapIsCash: firstCap === FIRST_CAP.n });

  // 7. 查資料「穿上看看」
  await navigate(`${BASE}/db/items?id=${TRY}`);
  const linkFinder = `[...document.querySelectorAll("a")].find(a => a.textContent.trim() === "穿上看看")`;
  const linked = await until(linkFinder);
  const href = linked ? await evaluate(`(${linkFinder}).getAttribute("href")`) : null;
  await click(linkFinder);
  const landed = await until(`location.pathname === "/plan/avatar"`, 30000);
  const tried = await until(`[...document.querySelectorAll("ul[aria-label='穿了什麼'] li")].some(li => li.innerText.includes(${JSON.stringify(TRY_NAME)}))`, 30000);
  const triedDrawn = await until(stageReady(TRY), 30000);
  await evaluate(`window.scrollTo({ top: 0, behavior: "instant" })`);
  await sleep(300);
  await shot("avatar-from-db.png");
  record(`/db/items?id=${TRY} 有「穿上看看」，點下去到 /plan/avatar?try=${TRY}，穿了什麼裡有「${TRY_NAME}」`,
    linked && href === `/plan/avatar?try=${TRY}` && landed && tried && triedDrawn, { href, landed, tried, triedDrawn, worn: await worn() });

  // 8. maplestory.io 全回 503：照實寫載不出來＋再試一次（換一個沒載過的動作，快取也關掉）
  await page.send("Network.enable");
  await page.send("Network.setCacheDisabled", { cacheDisabled: true });
  let blocked = 0;
  const block = msg => {
    if (msg.method !== "Fetch.requestPaused") return;
    blocked++;
    page.send("Fetch.fulfillRequest", { requestId: msg.params.requestId, responseCode: 503, responseHeaders: [{ name: "Content-Type", value: "text/plain" }], body: "" }).catch(() => {});
  };
  page.listeners.add(block);
  await page.send("Fetch.enable", { patterns: [{ urlPattern: "*maplestory.io*" }] });
  await open("?p=sit");
  const errShown = await until(`document.body.innerText.includes("角色圖載不出來，等一下再過來") && ${button(CARD, "再試一次")}`, 30000);
  await sleep(300);
  await shot("avatar-error.png");
  record("maplestory.io 全回 503：看到「角色圖載不出來，等一下再過來」跟「再試一次」", errShown, { blocked, stageImg: await evaluate(`Boolean(${STAGE_IMG})`) });
  await page.send("Fetch.disable");
  page.listeners.delete(block);
  await page.send("Network.setCacheDisabled", { cacheDisabled: false });

  // 9. 1280 寬：左右排、沒有小窗（左邊角色卡黏著）
  await viewport(1280, 900);
  await open("");
  const wideLoaded = await until(stageReady());
  await until(`${CELLS}.length >= 40`, 15000);
  await sleep(500);
  const layout = await evaluate(`(() => {
    const c = ${CARD}.getBoundingClientRect(), p = ${PICKER}.getBoundingClientRect();
    return { cardRight: Math.round(c.right), pickerLeft: Math.round(p.left), cardTop: Math.round(c.top), pickerTop: Math.round(p.top) };
  })()`);
  await shot("avatar-1280.png");
  await setTheme("dark");
  await sleep(300);
  await shot("avatar-1280-dark.png");
  await setTheme("light");
  // 往下捲一點：角色卡黏在頁首下面（top 80px）；捲到底：也沒有小窗
  const miniAt = async top => {
    await evaluate(`window.scrollTo({ top: ${top}, behavior: "instant" })`);
    await sleep(800);
    return evaluate(`(() => { const m = ${MINI}; return { mini: Boolean(m && m.getClientRects().length), cardTop: Math.round(${CARD}.getBoundingClientRect().top), scrollY: Math.round(scrollY) }; })()`);
  };
  const sticky = await miniAt(200);
  const bottom = await miniAt(99999);
  const sideBySide = layout.cardRight <= layout.pickerLeft && Math.abs(layout.cardTop - layout.pickerTop) <= 4;
  record("1280 寬：角色卡、挑衣服卡左右排；往下捲角色卡黏在上面（80px）、捲到底都沒有小窗",
    wideLoaded && sideBySide && Math.abs(sticky.cardTop - 80) <= 1 && !sticky.mini && !bottom.mini, { layout, sticky, bottom });

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
