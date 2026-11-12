// 練功測速 v2.09 驗收（v2.11 改：兩列一起填不帶分鐘）：首屏「自己填等級、經驗」（防呆、拉 %、算 10 分鐘經驗、記進跟我之前比）＋手機沒有分享畫面的區塊，任何一項沒過 exit 1
// 用法：node scripts/verify/speed-manual.mjs [輸出資料夾] [網址，預設 http://localhost:3095] [DevTools 埠，預設 9535]
// 網址用 localhost，不要用 127.0.0.1（next dev 對 127.0.0.1 的互動不理）。
// 欄位用原生 setter＋input 事件填（React 收得到），拉 % 也是；輸出 manual-desktop.png、manual-mobile.png、manual-mobile-compare.png、results.json
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const OUT = outDir(process.argv[2], "speed-manual");
const BASE = (process.argv[3] ?? "http://localhost:3095").replace(/\/$/, "");
const PORT = chromePort(9535, process.argv[4]);

const results = { base: BASE, port: PORT, checks: [] };
const record = (name, ok, detail) => {
  results.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  return Boolean(ok);
};

let page, evaluate, navigate, shot, close;

async function until(expression, ms = 30000) {
  for (let t = 0; t < ms; t += 250) {
    try {
      if (await evaluate(`Boolean(${expression})`)) return true;
    } catch {
      // 換頁中
    }
    await sleep(250);
  }
  return false;
}

/** 卡片裡的欄位：row＝開始／現在，name＝等級／目前經驗；練了幾分鐘 row 給 null */
const FIELD = (row, name) =>
  row
    ? `[...document.querySelectorAll("fieldset")].find(f => f.querySelector("legend")?.textContent.startsWith(${JSON.stringify(row)}))?.querySelectorAll("label") && [...[...document.querySelectorAll("fieldset")].find(f => f.querySelector("legend")?.textContent.startsWith(${JSON.stringify(row)})).querySelectorAll("label")].find(l => l.textContent.trim().startsWith(${JSON.stringify(name)}))?.querySelector("input")`
    : `[...document.querySelectorAll("label")].find(l => l.textContent.trim().startsWith(${JSON.stringify(name)}))?.querySelector("input")`;
const SLIDER = row => `[...document.querySelectorAll("input[type=range]")].find(i => i.getAttribute("aria-label") === ${JSON.stringify(`${row}的經驗百分比`)})`;

const setValue = (finder, value) =>
  evaluate(`(() => {
    const el = (${finder});
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(String(value))});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
const value = finder => evaluate(`(${finder})?.value ?? null`);
const card = () =>
  evaluate(`(() => {
    const h = [...document.querySelectorAll("h2")].find(x => x.textContent.trim() === "自己填等級、經驗");
    return h ? h.closest("section").innerText.replace(/\\s+/g, " ") : null;
  })()`);

async function fillBasics() {
  await setValue(FIELD("開始", "等級"), "53");
  await setValue(FIELD("開始", "目前經驗"), "133,182");
  await setValue(FIELD("現在", "等級"), "53");
}

let crashed = null;
try {
  ({ page, evaluate, navigate, shot, close } = await start(OUT, PORT));

  // 一、電腦版
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(`${BASE}/plan/speed`);
  await evaluate(`(() => { localStorage.removeItem("ms-speed-manual"); localStorage.removeItem("ms-speed:records"); return true; })()`);
  await navigate(`${BASE}/plan/speed`);
  record("電腦版：首屏有「自己填等級、經驗」", await until(`[...document.querySelectorAll("h2")].some(h => h.textContent.trim() === "自己填等級、經驗")`, 150000));
  const order = await evaluate(`(() => {
    const top = el => el ? el.getBoundingClientRect().top + scrollY : null;
    const manual = top([...document.querySelectorAll("h2")].find(h => h.textContent.trim() === "自己填等級、經驗"));
    const share = top([...document.querySelectorAll("button")].find(b => b.textContent.trim() === "分享遊戲畫面"));
    return { manual, share };
  })()`);
  record("電腦版：分享遊戲畫面在手動卡下面", order.manual !== null && order.share !== null && order.manual < order.share, order);

  await fillBasics();
  await sleep(300);
  const startPercent = await card();
  record("開始填 Lv.53、133,182（打逗號也收）：顯示 15.99%", /15\.99%/.test(startPercent ?? ""), startPercent);
  const sliderOff = await evaluate(`${SLIDER("現在")}?.disabled ?? null`);
  await setValue(FIELD("現在", "目前經驗"), "999999999");
  await sleep(200);
  const tooBig = await card();
  const need = Number((tooBig ?? "").match(/Lv\.53 經驗最多 (\d+)/)?.[1] ?? NaN) + 1;
  record("防呆：經驗超過這一級要的，紅字寫「Lv.53 經驗最多 N」", Number.isFinite(need) && need > 133182, { need, sliderOff });
  await setValue(FIELD("現在", "等級"), "999");
  await sleep(200);
  record("防呆：等級亂填，紅字寫「等級要填 1～N」、% 拉桿不能拉", /等級要填 1～\d+/.test((await card()) ?? "") && (await evaluate(`${SLIDER("現在")}.disabled`)), await card());
  await setValue(FIELD("現在", "等級"), "53");
  await setValue(SLIDER("現在"), "50");
  await sleep(200);
  const halfExp = await value(FIELD("現在", "目前經驗"));
  record("拉 % 到 50：經驗欄變成這一級的一半（無條件捨去）", Number(halfExp) === Math.floor(need / 2), { halfExp, expected: Math.floor(need / 2) });
  await setValue(SLIDER("現在"), "100");
  await sleep(200);
  const fullExp = await value(FIELD("現在", "目前經驗"));
  record("拉到 100%：經驗是這一級要的減 1（不會變成升級）", Number(fullExp) === need - 1, { fullExp });

  await setValue(FIELD("現在", "目前經驗"), "100000");
  await sleep(200);
  record("防呆：現在比開始還少，寫「是不是填反了」", /填反了/.test((await card()) ?? ""), await card());

  await setValue(FIELD("現在", "目前經驗"), "253182");
  await sleep(200);
  const autoMinutes = await value(FIELD(null, "練了幾分鐘"));
  // v2.11：兩列差不到 3 分鐘＝一起填的，看不出練多久，不帶（以前帶 1 分，10 分鐘經驗灌水十倍）
  record("兩列一起填：練了幾分鐘不自己帶、請玩家填（沒有結果）", autoMinutes === "" && /看不出練了多久：請填練了幾分鐘/.test((await card()) ?? "") && /填好練了幾分鐘就會算出來/.test((await card()) ?? "") && !/兩列都填好就會算出來/.test((await card()) ?? "") && !/10 分鐘經驗 \d/.test((await card()) ?? ""), { autoMinutes });
  await setValue(FIELD(null, "練了幾分鐘"), "0");
  await sleep(200);
  record("防呆：分鐘填 0，寫「分鐘要填 1～1440」", /分鐘要填 1～1440/.test((await card()) ?? ""));
  await setValue(FIELD(null, "練了幾分鐘"), "12");
  await sleep(300);
  const result = await card();
  record("12 分鐘拿 120,000：10 分鐘經驗 100,000、有升級還要", /10 分鐘經驗 100,000/.test(result ?? "") && /升級還要 約/.test(result ?? "") && /12 分鐘拿到 120,000/.test(result ?? ""), result);
  await evaluate(`(() => { const h = [...document.querySelectorAll("h2")].find(x => x.textContent.trim() === "自己填等級、經驗"); h.scrollIntoView({ block: "start", behavior: "instant" }); window.scrollBy(0, -80); return true; })()`);
  await shot("manual-desktop.png");

  await navigate(`${BASE}/plan/speed`);
  await until(`[...document.querySelectorAll("h2")].some(h => h.textContent.trim() === "自己填等級、經驗")`, 60000);
  await sleep(500);
  const kept = { start: await value(FIELD("開始", "目前經驗")), now: await value(FIELD("現在", "目前經驗")), minutes: await value(FIELD(null, "練了幾分鐘")) };
  record("重新整理：填的還在（存在這台電腦）", kept.start === "133,182" && kept.now === "253182" && kept.minutes === "12", kept);

  // 二、手機：觸控、375 寬
  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await page.send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
  await navigate(`${BASE}/plan/speed`);
  const mobileReady = await until(`[...document.querySelectorAll("h2")].some(h => h.textContent.trim() === "自己填等級、經驗")`, 60000);
  const mobile = await evaluate(`({
    coarse: matchMedia("(pointer: coarse)").matches,
    share: [...document.querySelectorAll("button")].some(b => /分享遊戲畫面/.test(b.textContent)),
    shareHeading: [...document.querySelectorAll("h2")].some(h => /分享遊戲畫面/.test(h.textContent)),
    overflow: document.documentElement.scrollWidth - innerWidth,
  })`);
  record("手機：有手動卡、沒有分享畫面的按鈕跟區塊、沒有橫向捲動", mobileReady && mobile.coarse && !mobile.share && !mobile.shareHeading && mobile.overflow <= 0, mobile);
  record("手機：重新整理前填的也在、結果算得出來", /10 分鐘經驗 100,000/.test((await card()) ?? ""), await card());
  await evaluate(`window.scrollTo(0, 0)`);
  await shot("manual-mobile.png");

  // 記進跟我之前比：先放一筆別張圖的
  await evaluate(`(() => {
    const at = Date.now() - 86400000;
    // 選過職業（我的路線）才比得了：沒職業也沒 ID 不跟別人比（records 的規則）
    localStorage.setItem("ms-profile", JSON.stringify({ level: 53, job: 410 }));
    localStorage.setItem("ms-speed:records", JSON.stringify([{ at, mapId: 101030112, mapName: "第3軍營", level: 53, job: 410, charId: null, exp10: 120000, net10: null, segAt: at, sec: 600 }]));
    return true;
  })()`);
  await navigate(`${BASE}/plan/speed`);
  await until(`document.querySelector('input[aria-label="在哪張圖"]')`, 60000);
  await setValue(`document.querySelector('input[aria-label="在哪張圖"]')`, "第2軍營");
  const listed = await until(`[...document.querySelectorAll("li button")].some(b => b.textContent.includes("第2軍營"))`, 10000);
  await evaluate(`[...document.querySelectorAll("li button")].find(b => b.textContent.includes("第2軍營")).click()`);
  await sleep(300);
  await evaluate(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "記進跟我之前比").click()`);
  const compared = await until(`[...document.querySelectorAll("h2")].some(h => h.textContent.trim() === "跟我之前比")`, 10000);
  const rows = await evaluate(`(() => {
    const h = [...document.querySelectorAll("h2")].find(x => x.textContent.trim() === "跟我之前比");
    if (!h) return [];
    h.closest("section").scrollIntoView({ block: "center", behavior: "instant" });
    return [...h.closest("section").querySelectorAll("li")].map(li => li.innerText.replace(/\\s+/g, " "));
  })()`);
  record("手機：選第2軍營、按「記進跟我之前比」→ 寫「記好了」、比較卡出現（這段 100,000、第3軍營 120,000）", listed && compared && rows.length === 2 && rows[0].includes("第2軍營") && rows[0].includes("100,000") && rows[1].includes("第3軍營"), rows);
  await shot("manual-mobile-compare.png");
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
