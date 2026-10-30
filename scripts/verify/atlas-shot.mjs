// 地圖＋NPC 圖鑑（/db/maps、/db/npcs，v1.24）驗收：怪物／NPC／門的數量、點位在圖內、窄螢幕不橫捲、深色對比、串連、文案，任何一項沒過 exit 1
// 用法：node scripts/verify/atlas-shot.mjs [網址，預設 http://localhost:9303] [輸出資料夾] [DevTools 埠，預設 9304]
//   例：node scripts/verify/atlas-shot.mjs https://maplestory-tool-git-dev-clarkhers-projects.vercel.app "$TEMP/atlas-shot"
// 網址用 localhost，不要用 127.0.0.1（next dev 對 127.0.0.1 的互動不理）。第一次開頁 dev 要編譯，最多等 1 分鐘。
// 輸出：atlas-map-390-light.png、atlas-map-1280-dark.png、atlas-npc-390-light.png、atlas-npc-1280-dark.png（整頁）、results.json
// 測的樣本：楓葉村東郊平原 1020000（4 種怪共 21 隻、NPC 麥加、4 個門）、城鎮 100000000（NPC 超過 6 個，不寫名字）、
//           山姆 1011001（店 90 樣）、麥加 12100（8 個任務）、木妖 130100、任務 1016。
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const BASE = (process.argv[2] ?? "http://localhost:9303").replace(/\/$/, "");
const OUT = outDir(process.argv[3], "atlas-shot");
const PORT = chromePort(9304, process.argv[4]);

const MAP = 1020000;
const TOWN = 100000000;
const SAM = 1011001;
const MEGA = 12100;
const MOB = 130100;
const QUEST = 1016;

const results = { base: BASE, port: PORT, checks: [] };
const record = (name, ok, detail) => {
  results.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  return Boolean(ok);
};

let page, evaluate, navigate, shot, close;
const problems = { exceptions: [], errors: [] };

const viewport = (width, height = 900) => page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
const setTheme = theme => evaluate(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(theme)}; return true; })()`);
const bodyText = () => evaluate("document.body.innerText");
/** 文案檢查只看主要內容（頁尾每頁都有「GMS Classic」，不是這幾頁的字） */
const mainText = () => evaluate("(document.querySelector(\"main\") ?? document.body).innerText");

async function until(expression, ms = 60000) {
  for (let t = 0; t < ms; t += 250) {
    try { if (await evaluate(`Boolean(${expression})`)) return true; } catch { /* 換頁中 */ }
    await sleep(250);
  }
  return false;
}

/** 真的用滑鼠點；finder 是一段會回傳元素的程式 */
async function click(finder) {
  const at = await evaluate(`(() => { const el = (${finder}); if (!el) return null; el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!at) return false;
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 });
  return true;
}

/** 開頁：等到有標題（h1），再多等一下讓互動接手 */
async function open(pathname) {
  await navigate(`${BASE}${pathname}`);
  const ok = await until(`document.querySelector("h1")`);
  await sleep(600);
  return ok;
}

/** 某張卡（h2 標題開頭是 title）的元素；程式碼片段，放進 evaluate 用 */
const card = title => `[...document.querySelectorAll("section")].find(s => s.querySelector(":scope > h2")?.textContent.trim().startsWith(${JSON.stringify(title)}))`;

/** 整頁的橫向捲動：documentElement 與 body 都要沒超出 */
const overflow = () => evaluate(`({ scrollWidth: document.documentElement.scrollWidth, bodyScroll: document.body.scrollWidth, innerWidth })`);

/** 整頁截圖：視窗拉到跟頁面一樣高（最高 5000）再截 */
async function fullShot(file, width) {
  await viewport(width, 900);
  await sleep(300);
  const h = await evaluate("Math.min(5000, document.documentElement.scrollHeight)");
  await viewport(width, Math.max(900, h));
  await sleep(500);
  await shot(file);
  await viewport(width, 900);
}

/** 顏色字串 → [r,g,b,a] */
const COLOR_FN = `
  const parse = c => { const m = c.match(/[\\d.]+/g)?.map(Number) ?? [0, 0, 0, 1]; return [m[0], m[1], m[2], m[3] ?? 1]; };
  const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const bgOf = el => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c[3] > 0) { stack.push(c); if (c[3] === 1) break; } }
    let acc = [255, 255, 255, 1];
    if (!stack.length || stack.at(-1)[3] < 1) acc = parse(getComputedStyle(document.body).backgroundColor);
    if (acc[3] < 1) acc = [255, 255, 255, 1];
    for (const c of stack.reverse()) acc = over(c, acc);
    return acc;
  };
`;

/** 英文縮寫（連續 2 個以上大寫字母）；NPC 是站上通用的說法，GM 是遊戲裡 NPC 的原名（楓之谷GM，城鎮有），都不算 */
const ABBR_OK = new Set(["NPC", "GM"]);
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

/** 讀整頁文字，找 emoji 與英文縮寫（商店品名這種遊戲資料原樣顯示的不查：只查 main 裡不在商品列的字，這裡簡化成整頁） */
function textProblems(text) {
  const abbr = [...new Set((text.match(/\b[A-Z]{2,}\b/g) ?? []).filter(w => !ABBR_OK.has(w)))];
  const emoji = [...new Set([...text].filter(ch => EMOJI.test(ch)))];
  return { abbr, emoji };
}

try {
  ({ page, evaluate, navigate, shot, close } = await start(OUT, PORT));
  page.listeners.add(msg => {
    if (msg.method === "Runtime.exceptionThrown") problems.exceptions.push(String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text).slice(0, 300));
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") problems.errors.push(msg.params.args.map(a => a.value ?? a.description).join(" ").slice(0, 300));
  });
  await viewport(1280);
  const pageTexts = {};

  // 1. 楓葉村東郊平原
  record("地圖頁載入", await open(`/db/maps/${MAP}`));
  pageTexts.map = await mainText();
  const mapInfo = await evaluate(`(() => {
    const mobCard = ${card("怪物")};
    const rows = mobCard ? [...mobCard.children].filter(c => c.tagName === "DIV").flatMap(d => [...d.children]) : [];
    const mobRows = rows.map(r => r.innerText.replace(/\\s+/g, " ").trim());
    const dots = document.querySelectorAll("[data-mob]").length;
    const labels = [...document.querySelectorAll("span")].filter(s => /^往 /.test(s.textContent.trim()) && s.children.length === 0);
    const npcCard = ${card("NPC")};
    return { mobRows, dots, doorLabels: labels.map(l => l.textContent.trim()), npcText: npcCard?.innerText.replace(/\\s+/g, " ") ?? null };
  })()`);
  record("怪物 4 列", mapInfo.mobRows.length === 4, mapInfo.mobRows);
  record("木妖那列寫「7 隻」", mapInfo.mobRows.some(r => r.includes("木妖") && /7\s*隻/.test(r)), mapInfo.mobRows.find(r => r.includes("木妖")));
  record("圖上怪物點數 21", mapInfo.dots === 21, mapInfo.dots);
  record("圖上門標籤 4 個", mapInfo.doorLabels.length === 4, mapInfo.doorLabels);
  record("NPC 卡有麥加", mapInfo.npcText?.includes("麥加"), mapInfo.npcText);
  const doorRows = await evaluate(`(() => { const c = ${card("門通往")}; return c ? c.querySelectorAll("a").length : 0; })()`);
  record("「門通往」卡有 4 個「過去看」連結", doorRows === 4, doorRows);

  // 2. 點位都在圖框裡（怪物點、門／NPC 小點、標籤）
  const inside = await evaluate(`(() => {
    const img = document.querySelector('img[alt$="的地圖畫面"]');
    if (!img) return { error: "沒有地圖畫面圖" };
    const frame = img.parentElement.getBoundingClientRect();
    const items = [...img.parentElement.children].filter(e => e !== img);
    const out = items.filter(e => { const r = e.getBoundingClientRect(); return r.left < frame.left - 1 || r.right > frame.right + 1 || r.top < frame.top - 1 || r.bottom > frame.bottom + 1; });
    return { total: items.length, outside: out.map(e => ({ t: e.textContent.trim().slice(0, 12), cls: e.className.slice(0, 40) })), imgLoaded: img.complete && img.naturalWidth > 0 };
  })()`);
  record("地圖畫面圖有載入", inside.imgLoaded, inside);
  record("圖上的點跟標籤都在圖框內", inside.total > 0 && inside.outside?.length === 0, inside);

  // 3. 電腦深色：圖例文字對比 ≥ 4.5
  await setTheme("dark");
  await sleep(300);
  const contrast = await evaluate(`(() => { ${COLOR_FN}
    const img = document.querySelector('img[alt$="的地圖畫面"]');
    const legend = img.closest("section").querySelector("div.mt-2.flex-wrap");
    const texts = [...legend.querySelectorAll("span")].filter(s => [...s.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
    return [...(texts.length ? texts : [legend])].map(s => ({ t: s.textContent.trim().slice(0, 10), r: Math.round(ratio(parse(getComputedStyle(s).color), bgOf(s)) * 100) / 100 }));
  })()`);
  record("深色主題圖例文字對比 ≥ 4.5", contrast.length > 0 && contrast.every(c => c.r >= 4.5), contrast);
  const darkOverflow = await overflow();
  record("電腦 1280 深色：不橫向捲出", darkOverflow.scrollWidth <= darkOverflow.innerWidth && darkOverflow.bodyScroll <= darkOverflow.innerWidth, darkOverflow);
  await fullShot("atlas-map-1280-dark.png", 1280);
  await setTheme("light");

  // 4. 手機 390 淺色
  await viewport(390, 900);
  await sleep(500);
  const narrow = await overflow();
  record("手機 390：地圖頁不橫向捲出", narrow.scrollWidth <= 390 && narrow.bodyScroll <= 390, narrow);
  const phoneInside = await evaluate(`(() => {
    const img = document.querySelector('img[alt$="的地圖畫面"]');
    const frame = img.parentElement.getBoundingClientRect();
    return { total: img.parentElement.children.length - 1, outside: [...img.parentElement.children].filter(e => e !== img).filter(e => { const r = e.getBoundingClientRect(); return r.left < frame.left - 1 || r.right > frame.right + 1 || r.top < frame.top - 1 || r.bottom > frame.bottom + 1; }).length };
  })()`);
  record("手機 390：點位都在圖框內", phoneInside.total > 0 && phoneInside.outside === 0, phoneInside);
  await setTheme("light");
  await fullShot("atlas-map-390-light.png", 390);

  // 5. 城鎮：NPC 超過 6 個，不寫名字標籤
  await viewport(1280);
  record("城鎮地圖頁載入", await open(`/db/maps/${TOWN}`));
  pageTexts.town = await mainText();
  const town = await evaluate(`(() => {
    const img = document.querySelector('img[alt$="的地圖畫面"]');
    const frame = img?.parentElement;
    const npcCard = ${card("NPC")};
    const names = npcCard ? [...npcCard.querySelectorAll(".font-extrabold")].map(e => e.textContent.trim()).filter(Boolean) : [];
    const framed = frame?.innerText ?? "";
    const diamonds = frame ? frame.querySelectorAll("span[title]").length : 0;
    return { npcCount: names.length, diamonds, namesInFrame: names.filter(n => framed.includes(n)), whiteLabels: frame ? [...frame.querySelectorAll("span")].filter(s => s.className.includes("bg-white") && s.textContent.trim()).length : -1 };
  })()`);
  record("城鎮 NPC 超過 6 個、圖上只畫小點不寫名字", town.npcCount > 6 && town.diamonds > 0 && town.namesInFrame.length === 0 && town.whiteLabels === 0, town);

  // 6. 山姆
  record("NPC 頁（山姆）載入", await open(`/db/npcs/${SAM}`));
  pageTexts.sam = await mainText();
  const shop = await evaluate(`(() => {
    const c = ${card("賣什麼")};
    const rows = () => [...c.querySelectorAll('a[href^="/db/items?id="]')].filter(a => !a.closest("details")).length;
    const details = c.querySelector("details");
    return { before: rows(), open: details?.open, head: c.querySelector("h2").innerText.replace(/\\s+/g, " ") };
  })()`);
  record("山姆「賣什麼」先列 8 列", shop.before === 8, shop);
  await click(`${card("賣什麼")}.querySelector("summary")`);
  await sleep(300);
  const shopOpen = await evaluate(`(() => { const c = ${card("賣什麼")}; return { rows: c.querySelectorAll('a[href^="/db/items?id="]').length, open: c.querySelector("details").open }; })()`);
  record("展開後 90 列", shopOpen.open && shopOpen.rows === 90, shopOpen);
  record("看得到「參考舊版資料」", (await bodyText()).includes("參考舊版資料"));
  const samOverflow = await overflow();
  record("山姆頁電腦 1280 不橫向捲出", samOverflow.scrollWidth <= 1280, samOverflow);

  // 7. 麥加
  record("NPC 頁（麥加）載入", await open(`/db/npcs/${MEGA}`));
  pageTexts.mega = await mainText();
  const quests = await evaluate(`(() => { const c = ${card("任務")}; return c ? [...c.querySelectorAll("a")].filter(a => a.textContent.trim() === "看任務").length : -1; })()`);
  record("麥加有 8 個任務", quests === 8, quests);

  // 8. 串連：怪物頁 → 出沒地圖
  for (const url of [`/db/monsters/${MOB}`, `/db/monsters?id=${MOB}`]) {
    await open(url);
    const found = await until(`document.querySelector('a[href^="/db/maps/"]')`, 30000);
    const href = found ? await evaluate(`document.querySelector('a[href^="/db/maps/"]').getAttribute("href")`) : null;
    await click(`document.querySelector('a[href^="/db/maps/"]')`);
    const went = await until(`location.pathname.startsWith("/db/maps/") && document.querySelector("h1")`, 30000);
    record(`${url}：點第一個出沒地圖，網址變 /db/maps/`, found && went, { href, now: await evaluate("location.pathname") });
  }

  // 9. 任務卡 NPC → NPC 頁
  await open(`/db/quests?id=${QUEST}`);
  const questLink = await until(`document.querySelector('a[href^="/db/npcs/"]')`, 30000);
  const qHref = questLink ? await evaluate(`document.querySelector('a[href^="/db/npcs/"]').getAttribute("href")`) : null;
  await click(`document.querySelector('a[href^="/db/npcs/"]')`);
  const qWent = await until(`location.pathname.startsWith("/db/npcs/") && document.querySelector("h1")`, 30000);
  record("/db/quests 卡片的 NPC 連到 /db/npcs/", questLink && qWent, { href: qHref, now: await evaluate("location.pathname") });

  // 10. 帶我去頁有「看這張圖」
  await open(`/go?from=1010000&to=${MAP}`);
  const goLink = await until(`[...document.querySelectorAll("a")].find(a => a.textContent.includes("看這張圖"))`, 30000);
  const goHref = goLink ? await evaluate(`[...document.querySelectorAll("a")].find(a => a.textContent.includes("看這張圖")).getAttribute("href")`) : null;
  record(`/go?from=1010000&to=${MAP} 有「看這張圖」連到 /db/maps/${MAP}`, goLink && goHref === `/db/maps/${MAP}`, goHref);

  // 11. 清單搜尋
  await open("/db/maps");
  await evaluate(`sessionStorage.clear()`);
  await click(`document.querySelector('input[aria-label="搜尋地圖"]')`);
  await page.send("Input.insertText", { text: "紅寶" });
  await sleep(500);
  const searched = await evaluate(`({ hit: [...document.querySelectorAll('a[href^="/db/maps/"]')].map(a => a.textContent.trim()), count: document.body.innerText.match(/[\\d,]+ 筆/)?.[0] })`);
  record("/db/maps 搜「紅寶」看得到楓葉村東郊平原", searched.hit.some(t => t.includes("楓葉村東郊平原")), searched);
  const listOverflow = await overflow();
  record("地圖清單頁不橫向捲出", listOverflow.scrollWidth <= 1280, listOverflow);
  await evaluate(`sessionStorage.clear()`);
  await open("/db/npcs");
  const npcList = await evaluate(`document.querySelectorAll('a[href^="/db/npcs/"]').length`);
  record("/db/npcs 清單頁有 NPC 列", npcList > 50, npcList);

  // 12. NPC 頁截圖：手機淺色、電腦深色（山姆展開前的樣子）
  await open(`/db/npcs/${SAM}`);
  await setTheme("light");
  await fullShot("atlas-npc-390-light.png", 390);
  const npcPhone = await overflow();
  record("手機 390：山姆 NPC 頁不橫向捲出", npcPhone.scrollWidth <= 390 && npcPhone.bodyScroll <= 390, npcPhone);
  await viewport(1280);
  await setTheme("dark");
  await fullShot("atlas-npc-1280-dark.png", 1280);
  await setTheme("light");
  await open(`/db/npcs/${MEGA}`);
  await viewport(390, 900);
  await sleep(300);
  const megaPhone = await overflow();
  record("手機 390：麥加 NPC 頁不橫向捲出", megaPhone.scrollWidth <= 390 && megaPhone.bodyScroll <= 390, megaPhone);
  await viewport(1280);

  // 13. 文案：沒有 emoji、沒有英文縮寫（NPC 除外）；商店品名這類遊戲資料原樣顯示，山姆頁單獨看
  const found = {};
  for (const [key, text] of Object.entries(pageTexts)) found[key] = textProblems(text);
  const emojiAll = Object.entries(found).filter(([, v]) => v.emoji.length).map(([k, v]) => `${k}:${v.emoji.join("")}`);
  const abbrAll = Object.entries(found).filter(([, v]) => v.abbr.length).map(([k, v]) => `${k}:${v.abbr.join(",")}`);
  record("文案沒有 emoji（地圖、城鎮、山姆、麥加四頁）", emojiAll.length === 0, emojiAll);
  record("文案沒有英文縮寫（NPC 除外，四頁）", abbrAll.length === 0, abbrAll);

  record("整趟 console 沒有例外或錯誤", problems.exceptions.length === 0 && problems.errors.length === 0, problems);
} catch (error) {
  record("腳本中途出錯", false, String(error?.message ?? error).slice(0, 400));
} finally {
  const passed = results.checks.filter(c => c.ok).length;
  results.summary = `${passed}/${results.checks.length}`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\n${results.summary} 項通過，輸出在 ${OUT}`);
  if (close) await close();
  process.exit(passed === results.checks.length && results.checks.length > 0 ? 0 : 1);
}
