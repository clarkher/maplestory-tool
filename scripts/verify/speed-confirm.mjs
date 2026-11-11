// 練功測速 v2.06 驗收：用新客戶端（2.0.4）的真截圖跑「開始帶入 ID → 結束存檔前確認 → 跟我之前比拆加倍券」，任何一項沒過 exit 1
// 用法：node scripts/verify/speed-confirm.mjs [輸出資料夾] [網址，預設 http://localhost:3095] [DevTools 埠，預設 9533]
// 網址用 localhost，不要用 127.0.0.1（next dev 對 127.0.0.1 的互動不理）。
// 假的分享畫面：跟 speed-shot 一樣塞 window.__speedTestStream，畫面是 src/lib/speed/__fixtures__/barracks-1366.png
// （2026-11-11 使用者開著遊戲時截的：第2軍營、Lv.53 刺客「沙士K」、經驗 133182[15.99%]）。
// 「按結束」用頁面掛的 window.__speedTestEnd 丟一段 12 分鐘的進去（假畫面靜止、等不到經驗變動）。
// 輸出：confirm-start.png（開始對話框：ID 自動帶入）、confirm-end.png（存檔前確認）、confirm-compare.png（跟我之前比的堆疊長條）、results.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const OUT = outDir(process.argv[2], "speed-confirm");
const BASE = (process.argv[3] ?? "http://localhost:3095").replace(/\/$/, "");
const PORT = chromePort(9533, process.argv[4]);
const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/lib/speed/__fixtures__/barracks-1366.png");
const NAME = "沙士K";
const MAP = "第2軍營";
const READING = "Lv.53 · 經驗 133,182（15.99%）";

const results = { base: BASE, port: PORT, checks: [] };
const record = (name, ok, detail) => {
  results.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  return Boolean(ok);
};

let page, evaluate, ev, navigate, shot, close;

async function until(expression, ms = 30000) {
  for (let t = 0; t < ms; t += 250) {
    try {
      if (await evaluate(`Boolean(${expression})`)) return true;
    } catch {
      // 換頁中：下一輪再試
    }
    await sleep(250);
  }
  return false;
}

/** 真的用滑鼠點（DevTools Input）；捲動一定要 instant，不然邊滑邊量點空（speed-shot 的坑） */
async function click(finder) {
  const at = await evaluate(`(() => { const el = (${finder}); if (!el) return null; el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!at) return false;
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 });
  return true;
}

const BUTTON = text => `[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
const DIALOG_BUTTON = text => `[...document.querySelectorAll("dialog[open] button")].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
const dialog = () =>
  evaluate(`(() => {
    const d = document.querySelector("dialog[open]");
    if (!d) return null;
    return { title: d.querySelector("h2")?.textContent.trim(), text: d.innerText.replace(/\\s+/g, " "), inputs: [...d.querySelectorAll("input:not([type=checkbox])")].map(i => i.value) };
  })()`);

async function installFakeStream() {
  const base64 = fs.readFileSync(FIXTURE).toString("base64");
  await evaluate(`new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      const draw = () => context.drawImage(image, 0, 0);
      draw();
      setInterval(draw, 200);
      window.__speedTestStream = canvas.captureStream(5);
      resolve(true);
    };
    image.onerror = () => reject(new Error("測試截圖載不進來"));
    image.src = "data:image/png;base64,${base64}";
  })`);
}

let crashed = null;
try {
  ({ page, evaluate, ev, navigate, shot, close } = await start(OUT, PORT));
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(`${BASE}/plan/speed`);
  // 乾淨的這台電腦：沒有記過的地圖、沒有以前的紀錄
  await evaluate(`(() => { localStorage.removeItem("ms-speed-maps"); localStorage.removeItem("ms-speed:records"); return true; })()`);
  await navigate(`${BASE}/plan/speed`);
  record("頁面載入、看得到「分享遊戲畫面」", await until(BUTTON("分享遊戲畫面"), 150000));
  await installFakeStream();

  // 1. 分享 → 開始對話框：讀到經驗、職業刺客、地圖第2軍營（應該是）、ID 欄自動帶入狀態列的名字
  await click(BUTTON("分享遊戲畫面"));
  const read = await ev(`return await __waitFor(() => document.body.innerText.includes(${JSON.stringify(READING)}), 30000)`);
  record(`讀到「${READING}」（新客戶端以前讀不到經驗）`, read);
  await until(`document.querySelector("dialog[open] h2")?.textContent.includes("要開始計算嗎")`, 15000);
  // 字樣板載好、每 3 秒讀一次名字：最多等 20 秒
  const filled = await until(`document.querySelector("dialog[open] input")?.value === ${JSON.stringify(NAME)}`, 20000);
  const startInfo = await dialog();
  await shot("confirm-start.png");
  record(`開始對話框：角色 ID 自動帶入「${NAME}」`, filled, startInfo?.inputs);
  record("開始對話框：職業「刺客」、Lv.53", /刺客/.test(startInfo?.text ?? "") && /Lv\.53/.test(startInfo?.text ?? ""), startInfo?.text);
  record(`開始對話框：地圖寫「${MAP}」`, (startInfo?.text ?? "").includes(MAP), startInfo?.text);
  await click(DIALOG_BUTTON("開始計算"));
  await sleep(800);
  const idLine = await evaluate(`document.body.innerText.match(/這次的角色：.*/)?.[0] ?? null`);
  record(`按「開始計算」：這次的角色是「${NAME}」`, (idLine ?? "").includes(NAME), idLine);
  const mapPanel = await evaluate(`[...document.querySelectorAll("h2")].some(h => h.textContent.trim() === ${JSON.stringify(MAP)})`);
  record(`右欄直接顯示「${MAP}」的地圖卡（認不準時先用最像的）`, mapPanel);

  // 2. 按結束（丟一段 12 分鐘的）→ 存檔前確認：地圖、ID 都先填好
  await evaluate(`(() => {
    const end = Date.now();
    window.__speedTestEnd({
      mode: "manual", startedAt: end - 12 * 60_000, endedAt: end, lastChangeAt: end, startLevel: 53, level: 53, exp: 133182, job: 410, party: 1,
      mapKey: null, gained: 180000, levelUps: 0, deaths: 0, byMap: {},
    });
    return true;
  })()`);
  const asked = await until(`document.querySelector("dialog[open] h2")?.textContent.trim() === "存檔前確認一下"`, 10000);
  const endInfo = await dialog();
  await shot("confirm-end.png");
  record("按結束：先跳「存檔前確認一下」", asked, endInfo?.title);
  record(`存檔前確認：地圖先填「${MAP}」、ID 先填「${NAME}」`, (endInfo?.text ?? "").includes(MAP) && endInfo?.inputs[0] === NAME, endInfo);
  await click(DIALOG_BUTTON("存檔"));
  const saved = await ev(`return await __waitFor(() => /上一段：12 分/.test(document.body.innerText), 20000)`);
  const records = await evaluate(`JSON.parse(localStorage.getItem("ms-speed:records") ?? "[]")`);
  record("按存檔：「上一段」寫出來、這台電腦記了一筆（地圖、ID 照確認的）", saved && records[0]?.mapName === MAP && records[0]?.charId === NAME, records[0]);
  const memory = await evaluate(`localStorage.getItem("ms-speed-maps")`);
  record("確認過的地圖記住了（下次同一張直接認得）", memory !== null && Object.values(JSON.parse(memory)).length > 0, memory);
  const after = await dialog();
  record("存檔前確認過：不再跳「補地圖／ID」", !/在哪張圖|哪個角色/.test(after?.title ?? ""), after?.title ?? null);

  // 3. 跟我之前比：放兩筆以前的紀錄（一筆開了 1.5 倍加倍券），堆疊長條、照還原值排
  await evaluate(`(() => {
    const list = JSON.parse(localStorage.getItem("ms-speed:records") ?? "[]");
    const at = Date.now() - 86400000;
    list.push(
      { at, mapId: 101030110, mapName: "第1軍營", level: 53, job: 410, charId: ${JSON.stringify(NAME)}, exp10: 150000, net10: null, segAt: at, sec: 600, coupon: { mult: 1.5, minutes: 10 } },
      { at: at - 1, mapId: 101030112, mapName: "第3軍營", level: 53, job: 410, charId: ${JSON.stringify(NAME)}, exp10: 120000, net10: null, segAt: at - 1, sec: 600, coupon: null },
    );
    localStorage.setItem("ms-speed:records", JSON.stringify(list));
    return true;
  })()`);
  await navigate(`${BASE}/plan/speed`);
  await until(BUTTON("分享遊戲畫面"), 60000);
  await installFakeStream();
  // 重新整理後這次的「上一段」不在了：再丟一段、按存檔，比較卡才有「這段」
  await click(BUTTON("分享遊戲畫面"));
  await until(`document.querySelector("dialog[open] h2")?.textContent.includes("要開始計算嗎")`, 30000);
  const direct = await until(`[...document.querySelectorAll("h2")].some(h => h.textContent.trim() === ${JSON.stringify(MAP)})`, 30000);
  const askAgain = await evaluate(`document.body.innerText.includes("對嗎？")`);
  record(`重新整理再分享：直接認成「${MAP}」，不再問「對嗎？」（存檔前確認過就記住了）`, direct && !askAgain, { direct, askAgain });
  // 這次不按開始：還在量的段會蓋過「上一段」，比較卡就只看得到正在量的
  await click(DIALOG_BUTTON("先不要"));
  await sleep(500);
  await evaluate(`(() => {
    const end = Date.now();
    window.__speedTestEnd({
      mode: "manual", startedAt: end - 10 * 60_000, endedAt: end, lastChangeAt: end, startLevel: 53, level: 53, exp: 133182, job: 410, party: 1,
      mapKey: null, gained: 110000, levelUps: 0, deaths: 0, byMap: {},
    });
    return true;
  })()`);
  const asked2 = await until(`document.querySelector("dialog[open] h2")?.textContent.trim() === "存檔前確認一下"`, 10000);
  await click(DIALOG_BUTTON("存檔"));
  const saved2 = await ev(`return await __waitFor(() => /上一段：10 分/.test(document.body.innerText), 20000)`);
  record("重新整理後再練一段（地圖記住了）：一樣先確認再存", asked2 && saved2, { asked2, saved2, status: await evaluate(`document.body.innerText.match(/上一段.*/)?.[0] ?? null`) });
  const compare = await evaluate(`(() => {
    const h = [...document.querySelectorAll("h2")].find(x => x.textContent.trim() === "跟我之前比");
    const card = h?.closest("section");
    if (!card) return null;
    card.scrollIntoView({ block: "center", behavior: "instant" });
    const r = card.getBoundingClientRect();
    return { rows: [...card.querySelectorAll("li")].map(li => li.innerText.replace(/\\s+/g, " ")), box: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } };
  })()`);
  if (compare) {
    const r = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...compare.box, scale: 2 } });
    fs.writeFileSync(path.join(OUT, "confirm-compare.png"), Buffer.from(r.data, "base64"));
  }
  const rows = compare?.rows ?? [];
  record(
    "跟我之前比：第3軍營（沒開，120,000）排在第1軍營（開 1.5 倍拿 150,000、還原 100,000）前面，第1軍營寫「＋加倍 50,000」",
    rows.length === 3 && rows[1].includes("第3軍營") && rows[1].includes("120,000") && rows[2].includes("第1軍營") && rows[2].includes("100,000") && rows[2].includes("＋加倍 50,000"),
    rows,
  );
} catch (error) {
  crashed = error;
  record("腳本跑到一半出錯", false, String(error?.stack ?? error).slice(0, 600));
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  await close?.();
}
const failed = results.checks.filter(check => !check.ok).length;
console.log(`${results.checks.length - failed}/${results.checks.length} 過，輸出在 ${OUT}`);
process.exit(failed || crashed ? 1 : 0);
