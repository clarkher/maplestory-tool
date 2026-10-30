// 衝卷模擬（/plan/scroll，v1.23）驗收：開頁、填單價、開白衣、挑部位、窄螢幕不橫捲、查資料入口，任何一項沒過 exit 1
// 用法：node scripts/verify/scroll-shot.mjs [網址，預設 http://localhost:9401] [輸出資料夾] [DevTools 埠，預設 9402]
//   例：node scripts/verify/scroll-shot.mjs http://localhost:9401 "$TEMP/scroll-shot"
// 網址用 localhost，不要用 127.0.0.1（next dev 對 127.0.0.1 的互動不理）。第一次開頁 dev 要編譯，最多等 1 分鐘。
// 輸出：scroll-1280-light／dark.png、scroll-390-light／dark.png（390 寬是開白衣、三個單價都填的樣子，欄位最多）、
//       scroll-picker.png（裝備挑選清單點了部位）、results.json（每一項檢查的結果＋量到的字）
// 測的裝備是工地手套 1082002（可衝 5 次）、卷軸是手套攻擊卷軸 60%（2040804）；帽子從 public/data/scroll-sim.json 挑第一件。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const BASE = (process.argv[2] ?? "http://localhost:9401").replace(/\/$/, "");
const OUT = outDir(process.argv[3], "scroll-shot");
const PORT = chromePort(9402, process.argv[4]);

const data = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public/data/scroll-sim.json"), "utf8"));
const HAT = data.equips.find(e => e.s === "帽子" && data.scrolls.some(s => s.slot === "帽子"));

const EQ = 1082002;
const SC = 2040804;
const results = { base: BASE, port: PORT, hat: HAT?.id, checks: [] };
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

/** 單價欄：用標籤找，點進去、清掉、打字（走真的輸入，React 才收得到） */
async function typePrice(label, text) {
  const finder = `[...document.querySelectorAll("label")].find(l => l.textContent.includes(${JSON.stringify(label)}))?.querySelector("input")`;
  if (!(await click(finder))) return false;
  await evaluate(`(${finder}).select()`);
  await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  if (text) await page.send("Input.insertText", { text });
  await sleep(150);
  return true;
}

const SWITCH = `document.querySelector('button[role="switch"]')`;
const switchOn = () => evaluate(`${SWITCH}?.getAttribute("aria-checked") === "true"`);
async function setWhite(on) {
  if ((await switchOn()) !== on) await click(SWITCH);
  await sleep(200);
}

/** 結果表：欄標題、每一行的字 */
const table = () => evaluate(`(() => {
  const t = document.querySelector("section[aria-label='結果'] table");
  if (!t) return null;
  const flat = s => s.replace(/\\s+/g, " ").trim();
  return {
    heads: [...t.querySelectorAll("thead th")].map(h => flat(h.textContent)),
    rows: [...t.querySelectorAll("tbody tr")].map(r => flat(r.innerText)),
    cells: [...t.querySelectorAll("tbody tr")].map(r => [...r.children].map(c => flat(c.innerText))),
    labelHeights: [...t.querySelectorAll("tbody th")].map(h => Math.round(h.getBoundingClientRect().height)),
  };
})()`);

const open = query => navigate(`${BASE}/plan/scroll${query}`);
/** 有東西可看了：表格、空狀態、或載入失敗 */
const ready = () => until(`document.querySelector("section[aria-label='結果'] table") || document.body.innerText.includes("先挑一件裝備") || document.body.innerText.includes("讀不到")`);

try {
  ({ page, evaluate, navigate, shot, close } = await start(OUT, PORT));
  page.listeners.add(msg => {
    if (msg.method === "Runtime.exceptionThrown") problems.exceptions.push(String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text).slice(0, 300));
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") problems.errors.push(msg.params.args.map(a => a.value ?? a.description).join(" ").slice(0, 300));
  });
  await viewport(1280);

  // 1. 工地手套＋手套攻擊卷軸 60%：5 行，最後一行 7.8%、64 張・29 件
  await open(`?eq=${EQ}&sc=${SC}`);
  record("頁面載入", await ready());
  await sleep(500);
  let t = await table();
  const last = t?.rows.at(-1) ?? "";
  record("表格 5 行，第 5 行含 7.8% 跟「64 張・29 件」", t && t.rows.length === 5 && last.includes("7.8%") && last.includes("64 張・29 件"), last);
  record("第一欄主行只寫「5 張」，數值在第二行（物理攻擊力 +10）", t && /^5 張 /.test(last) && last.includes("物理攻擊力 +10"), t?.cells.at(-1)?.[0]);
  record("沒填單價：沒有「平均花費」欄，提示「單價都填了就算得出總共要花多少」", t && !t.heads.includes("平均花費") && (await bodyText()).includes("單價都填了就算得出總共要花多少"));

  // 2. 單價：只填卷軸沒有花費欄；填齊才有
  await typePrice("卷軸單價", "10000");
  t = await table();
  const textOnlyScroll = await bodyText();
  record("只填卷軸單價：沒有「平均花費」欄、沒有九成花費那行、沒有「當 0 算」", t && !t.heads.includes("平均花費") && !textOnlyScroll.includes("九成機率要準備的錢") && !textOnlyScroll.includes("當 0 算"));
  await typePrice("裝備單價", "5000");
  t = await table();
  const textBoth = await bodyText();
  record("卷軸＋裝備單價都填：多出「平均花費」欄，最後一行有金額，九成花費那行出現", t && t.heads.includes("平均花費") && /楓幣/.test(t.rows.at(-1)) && textBoth.includes("九成機率要準備的錢"), t?.rows.at(-1));

  // 3. 白衣：開了之後沒填白衣單價，花費欄收起來；一件衝成 100%；填了又出現
  await setWhite(true);
  t = await table();
  const lastWhite = t?.cells.at(-1) ?? [];
  record("開白衣：第 5 行一件衝成 100%", /^100(\.0)?%$/.test(lastWhite[1] ?? ""), lastWhite);
  record("開白衣但白衣單價沒填：沒有「平均花費」欄，有「白衣平均」欄", t && !t.heads.includes("平均花費") && t.heads.includes("白衣平均"), t?.heads);
  await typePrice("白衣卷軸單價", "300");
  t = await table();
  record("白衣單價也填了：「平均花費」欄回來", t && t.heads.includes("平均花費"), t?.heads);

  // 4. 白天／夜晚截圖：1280 與 390（開白衣、三個單價都填，欄位最多）
  await setTheme("light");
  await sleep(200);
  await shot("scroll-1280-light.png");
  await setTheme("dark");
  await sleep(200);
  await shot("scroll-1280-dark.png");
  await viewport(390, 900);
  await sleep(500);
  const narrow = await evaluate(`({ scrollWidth: document.documentElement.scrollWidth, innerWidth, hint: document.body.innerText.includes("表格可以左右滑") })`);
  t = await table();
  const maxLabel = Math.max(...(t?.labelHeights ?? [999]));
  record("390 寬（開白衣、三個單價都填）：頁面沒有橫向捲動", narrow.scrollWidth <= 390, narrow);
  record("390 寬：第一欄每行不超過 3 行高（約 90px 以內）", maxLabel <= 90, { labelHeights: t?.labelHeights, tableHint: narrow.hint });
  await shot("scroll-390-dark.png");
  await setTheme("light");
  await sleep(200);
  await shot("scroll-390-light.png");

  // 5. 帽子挑得到卷
  await viewport(1280);
  await open(`?eq=${HAT.id}`);
  await ready();
  await sleep(500);
  t = await table();
  const bodyHat = await bodyText();
  record(`帽子（${HAT.n} ${HAT.id}）：卷軸挑到一張、有表格，不是空狀態`, t && t.rows.length === HAT.tuc && !bodyHat.includes("先挑一張卷軸"), { rows: t?.rows.length, tuc: HAT.tuc });

  // 6. 裝備挑選清單：部位小按鈕
  await open("");
  await ready();
  await click(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("先挑一件裝備"))`);
  await until(`document.querySelector('[role="dialog"]')`);
  const pills = await evaluate(`[...document.querySelectorAll('[role="group"][aria-label="挑部位"] button')].map(b => b.textContent.trim())`);
  record("裝備清單沒打字時有部位小按鈕（不只一個）", pills.length > 1, pills.slice(0, 6));
  const pick = pills.find(p => p !== "帽子") ?? pills[0];
  await click(`[...document.querySelectorAll('[role="group"][aria-label="挑部位"] button')].find(b => b.textContent.trim() === ${JSON.stringify(pick)})`);
  await sleep(300);
  const filtered = await evaluate(`(() => {
    const d = document.querySelector('[role="dialog"]');
    const heads = [...d.querySelectorAll("ul")].map(u => u.previousElementSibling?.textContent.trim());
    return { pressed: [...d.querySelectorAll('[aria-pressed="true"]')].map(b => b.textContent.trim()), heads: [...new Set(heads)], rows: d.querySelectorAll("li").length };
  })()`);
  record(`點「${pick}」：清單只剩這個部位的裝備`, filtered.pressed.length === 1 && filtered.pressed[0] === pick && filtered.heads.length === 1 && filtered.heads[0] === pick && filtered.rows > 0, filtered);
  await shot("scroll-picker.png");

  // 7. 查資料卷軸卡的連結帶 sc=、裝備卡帶 eq=
  await navigate(`${BASE}/db/items?id=${SC}`);
  const linked = await until(`document.querySelector('a[href*="/plan/scroll?sc="]')`);
  const href = linked ? await evaluate(`document.querySelector('a[href*="/plan/scroll?sc="]').getAttribute("href")`) : null;
  await click(`document.querySelector('a[href*="/plan/scroll?sc="]')`);
  await until(`location.pathname === "/plan/scroll"`);
  const landed = await evaluate("location.search");
  record("查資料卷軸卡有「算衝卷要準備多少」，點進來網址帶 sc=", linked && href?.includes(`sc=${SC}`) && landed.includes(`sc=${SC}`), { href, landed });
  await navigate(`${BASE}/db/items?id=${EQ}`);
  record("查資料可衝裝備卡有連結帶 eq=", await until(`document.querySelector('a[href="/plan/scroll?eq=${EQ}"]')`));

  // 8. 壞網址不壞頁
  await open("?eq=999999999&sc=abc");
  await ready();
  const bad = await bodyText();
  record("?eq=999999999&sc=abc：不壞頁，顯示空狀態", bad.includes("先挑一件裝備跟一張卷軸") && !(await table()), bad.slice(-60));

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
