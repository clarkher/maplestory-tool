// 紙娃娃（/plan/avatar，v1.40）驗收：挑髮型換顏色、小窗、隨機穿搭、換性別、畫不出來的點裝、查資料「穿上看看」、角色圖載不出來、電腦版左右排；任何一項沒過 exit 1
// 用法：node scripts/verify/avatar-shot.mjs [網址，預設 http://localhost:9381] [輸出資料夾] [DevTools 埠，預設 9382]
//   例：node scripts/verify/avatar-shot.mjs http://localhost:9381 "$TEMP/avatar-shot"
//       node scripts/verify/avatar-shot.mjs https://maplehelper-dev.pipicards.workers.dev "$TEMP/avatar-shot-dev"
// 網址用 localhost，不要用 127.0.0.1（next dev 對 127.0.0.1 的互動不理）。第一次開頁 dev 要編譯，最多等 1 分鐘。
// 角色圖是瀏覽器向 maplestory.io 即時要的，要連得到網路（第 8 項會用 DevTools 把它擋掉，只在那一項）。
// 輸出：avatar-375.png（一打開）、avatar-hair.png（挑髮型、換顏色）、avatar-mini.png／avatar-mini-dark.png（捲到挑衣服卡底、小窗）、
//       avatar-missing.png（畫不出來的點裝）、avatar-from-db.png（從查資料進來）、avatar-error.png（角色圖載不出來）、
//       avatar-1280.png／avatar-1280-dark.png（電腦版左右排）、results.json（每一項檢查的結果＋量到的東西）
// 期望值從「被測的那個站」的 /data/avatar.json 算（不讀本機檔，驗測試機時才對得上那邊的資料）：
//   男生髮型清單、女生第 1 款髮型、第一頂男生能穿的點裝帽子、一頂畫不出來的點裝帽子。
// 頁面上的東西用 Picker 掛的 data-tab、data-colour、data-cell、data-name、data-missing 找，不認樣式 class。
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const BASE = (process.argv[2] ?? "http://localhost:9381").replace(/\/$/, "");
const OUT = outDir(process.argv[3], "avatar-shot");
const PORT = chromePort(9382, process.argv[4]);
const TRY = 1042029;

const results = { base: BASE, port: PORT, checks: [] };
const record = (name, ok, detail) => {
  results.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  return Boolean(ok);
};
/** 一項檢查：fn 回 [ok, detail]；中途丟錯（例如點不到）就記這一項沒過、寫原因，接著跑下一項 */
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
/** 等畫面真的畫過兩格（換主題、捲動之後截圖用） */
const painted = () => evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))");
async function setTheme(theme) {
  await evaluate(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(theme)}; return true; })()`);
  await painted();
}

async function until(expression, ms = 60000) {
  for (let t = 0; t < ms; t += 250) {
    try { if (await evaluate(`Boolean(${expression})`)) return true; } catch { /* 換頁中 */ }
    await sleep(250);
  }
  return false;
}

/** 真的用滑鼠點；finder 是一段會回傳元素的程式。instant 才不會邊滑邊量。找不到就丟錯（那一項直接沒過） */
async function click(what, finder) {
  const at = await evaluate(`(() => { const el = (${finder}); if (!el) return null; el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!at) throw new Error(`點不到：${what}`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 });
}
/** until 沒等到就丟錯 */
async function wait(what, expression, ms) {
  if (!(await until(expression, ms))) throw new Error(`等不到：${what}`);
}

const CARD = `document.querySelector("section[aria-label='角色']")`;
const PICKER = `document.querySelector("section[aria-label='挑衣服']")`;
const MINI = `document.querySelector("[aria-label='角色小窗']")`;
/** 小窗看得到（一直掛著，收起來時是 visibility: hidden；電腦版是 display: none） */
const MINI_SHOWN = `(() => { const m = ${MINI}; return Boolean(m && m.getClientRects().length && getComputedStyle(m).visibility === "visible"); })()`;
const STAGE_IMG = `${CARD}?.querySelector("img[alt='穿好的角色']")`;
const CELLS = `[...(${PICKER}?.querySelectorAll("[data-cell]") ?? [])]`;
const NAMES = `${CELLS}.map(b => b.querySelector("[data-name]")?.textContent.trim() ?? "")`;
const TAB = key => `${PICKER}?.querySelector("[data-tab='${key}']")`;
const SWATCH = (group, c) => `document.querySelector("[role='group'][aria-label='${group}'] [data-colour='${c}']")`;
const PRESSED_COLOUR = group => `document.querySelector("[role='group'][aria-label='${group}'] [aria-pressed='true']")?.dataset.colour`;
const button = (scope, text) => `[...(${scope}?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
/** 舞台的圖載好了（有寬度）；給 id 就要圖的網址裡有這個道具 */
const stageReady = id => `(() => { const img = ${STAGE_IMG}; return !!img && img.complete && img.naturalWidth > 0${id === undefined ? "" : ` && decodeURIComponent(img.src).includes('"itemId":${id}')`}; })()`;
const stageSrc = () => evaluate(`${STAGE_IMG}?.src ?? null`);
const hScroll = () => evaluate(`({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })`);
const worn = () => evaluate(`[...document.querySelectorAll("ul[aria-label='穿了什麼'] li")].map(li => li.innerText.replace(/\\s+/g, " ").trim())`);
const search = () => evaluate("location.search");
const param = k => evaluate(`new URLSearchParams(location.search).get(${JSON.stringify(k)})`);
const open = query => navigate(`${BASE}/plan/avatar${query}`);
/** 頁面載好：舞台圖、挑衣服卡格子都出來了 */
async function ready(minCells = 1) {
  const img = await until(stageReady());
  const cells = await until(`${CELLS}.length >= ${minCells}`, 15000);
  return img && cells;
}

/** 打字進搜尋框（走真的輸入，React 才收得到）；等到格子只剩含這個字的 */
async function typeSearch(text) {
  const finder = `${PICKER}?.querySelector("input[type='search']")`;
  await click("搜尋框", finder);
  await evaluate(`(${finder}).select()`);
  await page.send("Input.insertText", { text });
  await wait(`搜尋「${text}」生效`, `(${finder}).value === ${JSON.stringify(text)} && ${NAMES}.every(n => n.includes(${JSON.stringify(text)}))`, 5000);
}

try {
  // 期望值：被測的站上的資料
  const res = await fetch(`${BASE}/data/avatar.json`);
  if (!res.ok) throw new Error(`${BASE}/data/avatar.json 回 ${res.status}`);
  const data = await res.json();
  const fits = (x, g) => x.g === g || x.g === 2;
  const coloursOf = s => [...new Set([...s.t, ...s.j])].sort((a, b) => a - b);
  const MALE_HAIR = data.hair.filter(s => fits(s, 0) && coloursOf(s).length);
  const FEMALE_HAIR = data.hair.filter(s => fits(s, 1) && coloursOf(s).length);
  const FIRST_CAP = data.items.find(i => i.k === "cap" && fits(i, 0) && i.cash && i.r);
  const MISSING_CAP = data.items.find(i => i.k === "cap" && fits(i, 0) && i.cash && !i.r);
  const TRY_NAME = data.items.find(i => i.id === TRY)?.n;
  // 第 2 項挑的髮型：從第 3 格起，第一款有兩種以上顏色的（才換得了色）
  const HAIR_AT = MALE_HAIR.findIndex((s, i) => i >= 2 && i < 40 && coloursOf(s).length >= 2);
  results.expect = { hairAt: HAIR_AT, hair: MALE_HAIR[HAIR_AT]?.id, female1: FEMALE_HAIR[0]?.n, firstCap: FIRST_CAP?.n, missing: MISSING_CAP?.id, tryName: TRY_NAME };

  ({ page, evaluate, navigate, shot, close } = await start(OUT, PORT));
  page.listeners.add(msg => {
    if (msg.method === "Runtime.exceptionThrown") problems.exceptions.push(String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text).slice(0, 300));
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") problems.errors.push(msg.params.args.map(a => a.value ?? a.description).join(" ").slice(0, 300));
  });
  await viewport(375, 812);

  // 1. 一打開：舞台圖載好、不橫捲
  await check("375 寬一打開：舞台圖載好、頁面不橫捲", async () => {
    await open("");
    const loaded = await ready(40);
    const w = await hScroll();
    await shot("avatar-375.png");
    return [loaded && w.scrollWidth <= w.clientWidth, { loaded, ...w }];
  });

  // 2. 髮型第 N 格 → h 換成那一款（保留目前顏色，沒有就最小的）；點一個這款有、跟現在不同的顏色 → h 尾數變那個顏色
  const style = MALE_HAIR[HAIR_AT];
  await check(`點髮型第 ${HAIR_AT + 1} 格（${style?.n} ${style?.id}）：網址 h 變了、舞台圖換了、那格框起來；點另一個顏色：h 尾數跟著變`, async () => {
    if (!style) throw new Error("前 40 款男生髮型裡找不到有兩種以上顏色的");
    await wait("髮色色塊", PRESSED_COLOUR("髮色"), 5000);
    const cur = Number(await evaluate(PRESSED_COLOUR("髮色")));
    const colours = coloursOf(style);
    const keep = colours.includes(cur) ? cur : colours[0];
    const before = { search: await search(), src: await stageSrc() };
    await click(`髮型第 ${HAIR_AT + 1} 格`, `${CELLS}[${HAIR_AT}]`);
    const changed = await until(`new URLSearchParams(location.search).get("h") === "${style.id + keep}"`, 10000);
    const drawn = await until(stageReady(style.id + keep), 30000);
    const pressed = await evaluate(`${CELLS}.findIndex(b => b.getAttribute("aria-pressed") === "true")`);
    const src = await stageSrc();
    const other = colours.find(c => c !== keep);
    const colourName = await evaluate(`${SWATCH("髮色", other)}?.getAttribute("aria-label") ?? null`);
    await click(`髮色色塊 ${other}`, SWATCH("髮色", other));
    const recoloured = await until(`new URLSearchParams(location.search).get("h") === "${style.id + other}"`, 10000);
    const redrawn = await until(stageReady(style.id + other), 30000);
    const swatchPressed = await evaluate(`${SWATCH("髮色", other)}?.getAttribute("aria-pressed")`);
    await evaluate(`${CARD}.scrollIntoView({ block: "start", behavior: "instant" })`);
    await painted();
    await shot("avatar-hair.png");
    return [
      changed && drawn && src !== before.src && pressed === HAIR_AT && recoloured && redrawn && swatchPressed === "true",
      { from: before.search, keepColour: keep, after: `h=${style.id + keep}`, pressedCell: pressed, colour: `${other} ${colourName}`, final: await search(), swatchPressed },
    ];
  });

  // 3. 捲到挑衣服卡底：小窗出現、三顆按鈕、沒蓋住最後一排；回到上面
  await check("捲到挑衣服卡底：小窗出現、有「下載」「分享」「回到上面」、沒蓋住最後一排；點「回到上面」回到頂端、小窗收起來", async () => {
    await evaluate(`(() => { const p = ${PICKER}; window.scrollTo({ top: p.getBoundingClientRect().bottom + scrollY - innerHeight + 16, behavior: "instant" }); return true; })()`);
    const shown = await until(MINI_SHOWN, 5000);
    const miniImg = await until(`(() => { const img = ${MINI}?.querySelector("img[alt='穿好的角色']"); return img && img.complete && img.naturalWidth > 0; })()`, 15000);
    const m = await evaluate(`(() => {
      const m = ${MINI};
      const last = ${CELLS}.at(-1)?.getBoundingClientRect();
      return {
        buttons: [...m.querySelectorAll("button")].map(b => b.textContent.trim()),
        inert: m.closest("[inert]") !== null,
        bottom: Math.round(m.getBoundingClientRect().bottom),
        lastCellTop: last ? Math.round(last.top) : null,
        scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
      };
    })()`);
    await painted();
    await shot("avatar-mini.png");
    await setTheme("dark");
    await shot("avatar-mini-dark.png");
    await setTheme("light");
    await click("小窗的「回到上面」", button(MINI, "回到上面"));
    const top = await until(`scrollY === 0 && !${MINI_SHOWN}`, 5000);
    const hiddenInert = await evaluate(`${MINI}.closest("[inert]") !== null`);
    const ok = shown && miniImg && !m.inert && ["下載", "分享", "回到上面"].every(t => m.buttons.includes(t))
      && m.lastCellTop !== null && m.lastCellTop >= m.bottom && m.scrollWidth <= m.clientWidth && top && hiddenInert;
    return [ok, { shown, miniImg, ...m, top, hiddenInert }];
  });

  // 4. 隨機穿搭 3 次：每次網址都變、舞台圖載好
  await check("按「隨機穿搭」3 次：每次網址都變、舞台圖載好", async () => {
    const rounds = [];
    for (let i = 0; i < 3; i++) {
      const prev = { search: await search(), src: await stageSrc() };
      await click("隨機穿搭", button(CARD, "隨機穿搭"));
      const changed = await until(`location.search !== ${JSON.stringify(prev.search)}`, 10000);
      const drawn = await until(`(() => { const img = ${STAGE_IMG}; return img && img.complete && img.naturalWidth > 0 && img.src !== ${JSON.stringify(prev.src)}; })()`, 30000);
      rounds.push({ changed, drawn, search: (await search()).slice(0, 90) });
    }
    return [rounds.every(r => r.changed && r.drawn), rounds];
  });

  // 5. 換女生：g=1、髮型第一格是女生髮型
  await check(`切「女」：網址有 g=1、髮型第一格是女生髮型（${FEMALE_HAIR[0]?.n}）、40 格都是女生穿得到的`, async () => {
    await click("性別「女」", `[...document.querySelectorAll("[role='group'][aria-label='性別'] button")].find(b => b.textContent.trim() === "女")`);
    const female = await until(`new URLSearchParams(location.search).get("g") === "1"`, 10000);
    const first = await until(`${NAMES}[0] === ${JSON.stringify(FEMALE_HAIR[0]?.n)}`, 5000);
    const names = await evaluate(NAMES);
    const femaleNames = new Set(data.hair.filter(s => fits(s, 1)).map(s => s.n));
    const allFemale = names.length > 0 && names.every(n => femaleNames.has(n));
    return [female && first && allFemale, { search: await search(), first: names[0], cells: names.length, allFemale }];
  });

  // 6. 帶一件畫不出來的點裝進來：頁面正常、穿預設；帽子頁看得到「暫時看不到樣子」，點了跳提示、不穿
  await check(`?try=${MISSING_CAP?.id}（${MISSING_CAP?.n}，畫不出來）：頁面正常、穿預設；帽子頁第一格是點裝、搜得到它且寫「暫時看不到樣子」，點了跳提示、不穿`, async () => {
    if (!MISSING_CAP) throw new Error("資料裡沒有畫不出來的男生點裝帽子");
    await open(`?try=${MISSING_CAP.id}`);
    const loaded = await ready();
    const toDefault = await until(`location.search === ""`, 10000);
    const wornNow = await worn();
    await click("帽子分頁", TAB("cap"));
    const firstCap = await until(`${NAMES}[0] === ${JSON.stringify(FIRST_CAP.n)}`, 5000);
    const firstCapName = (await evaluate(NAMES))[0];
    await typeSearch(MISSING_CAP.n);
    const cellFinder = `${CELLS}.find(b => b.querySelector("[data-name]")?.textContent.trim() === ${JSON.stringify(MISSING_CAP.n)})`;
    const faded = await until(`(${cellFinder})?.hasAttribute("data-missing") && (${cellFinder}).innerText.includes("暫時看不到樣子")`, 5000);
    await click(MISSING_CAP.n, cellFinder);
    const toast = await until(`document.body.innerText.includes("這件暫時看不到樣子，先挑別件")`, 3000);
    const stillDefault = (await search()) === "";
    await shot("avatar-missing.png");
    const ok = loaded && toDefault && !wornNow.some(t => t.includes(MISSING_CAP.n)) && firstCap && faded && toast && stillDefault;
    return [ok, { loaded, toDefault, worn: wornNow, firstCap: firstCapName, expectFirstCap: FIRST_CAP.n, faded, toast, stillDefault }];
  });

  // 7. 查資料「穿上看看」
  await check(`/db/items?id=${TRY} 有「穿上看看」，點下去到 /plan/avatar?try=${TRY}，穿了什麼裡有「${TRY_NAME}」`, async () => {
    await navigate(`${BASE}/db/items?id=${TRY}`);
    const linkFinder = `[...document.querySelectorAll("a")].find(a => a.textContent.trim() === "穿上看看")`;
    const linked = await until(linkFinder);
    const href = linked ? await evaluate(`(${linkFinder}).getAttribute("href")`) : null;
    await click("穿上看看", linkFinder);
    const landed = await until(`location.pathname === "/plan/avatar"`, 30000);
    const tried = await until(`[...document.querySelectorAll("ul[aria-label='穿了什麼'] li")].some(li => li.innerText.includes(${JSON.stringify(TRY_NAME)}))`, 30000);
    const drawn = await until(stageReady(TRY), 30000);
    await evaluate(`window.scrollTo({ top: 0, behavior: "instant" })`);
    await painted();
    await shot("avatar-from-db.png");
    return [linked && href === `/plan/avatar?try=${TRY}` && landed && tried && drawn, { href, landed, tried, drawn, worn: await worn() }];
  });

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
  await check("maplestory.io 全回 503：看到「角色圖載不出來，等一下再過來」跟「再試一次」", async () => {
    await open("?p=sit");
    const shown = await until(`${CARD}?.innerText.includes("角色圖載不出來，等一下再過來") && ${button(CARD, "再試一次")}`, 30000);
    await shot("avatar-error.png");
    return [shown, { blocked, stageImg: await evaluate(`Boolean(${STAGE_IMG})`) }];
  });
  await page.send("Fetch.disable");
  page.listeners.delete(block);
  await page.send("Network.setCacheDisabled", { cacheDisabled: false });

  // 9. 1280 寬：左右排、沒有小窗（左邊角色卡黏著）
  await check("1280 寬：角色卡、挑衣服卡左右排；往下捲角色卡黏在上面（80px）、捲到底都沒有小窗", async () => {
    await viewport(1280, 900);
    await open("");
    const loaded = await ready(40);
    const layout = await evaluate(`(() => {
      const c = ${CARD}.getBoundingClientRect(), p = ${PICKER}.getBoundingClientRect();
      return { cardRight: Math.round(c.right), pickerLeft: Math.round(p.left), cardTop: Math.round(c.top), pickerTop: Math.round(p.top) };
    })()`);
    await shot("avatar-1280.png");
    await setTheme("dark");
    await shot("avatar-1280-dark.png");
    await setTheme("light");
    const at = async top => {
      await evaluate(`window.scrollTo({ top: ${top}, behavior: "instant" })`);
      await painted();
      return evaluate(`({ mini: ${MINI_SHOWN}, cardTop: Math.round(${CARD}.getBoundingClientRect().top), scrollY: Math.round(scrollY) })`);
    };
    const sticky = await at(200);
    const bottom = await at(99999);
    const sideBySide = layout.cardRight <= layout.pickerLeft && Math.abs(layout.cardTop - layout.pickerTop) <= 4;
    return [loaded && sideBySide && Math.abs(sticky.cardTop - 80) <= 1 && !sticky.mini && !bottom.mini, { layout, sticky, bottom }];
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
