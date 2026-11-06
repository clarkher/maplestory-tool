// 首頁紙娃娃輪播（v1.71）驗收：位置（第一次來在最上面、存過角色在角色列下面）、真的在動、不橫捲、不預先載入、點角色穿那套、抽一套抽新的、討厭動畫的人不動；任何一項沒過 exit 1
// 用法：node scripts/verify/showcase-shot.mjs [網址，預設 http://localhost:9385] [輸出資料夾] [DevTools 埠，預設 9386]
// 輸出：showcase-375.png（第一次來）、showcase-375-dark.png、showcase-saved.png（存過角色）、showcase-1280.png、showcase-draw.png（抽一套之後）、results.json
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const BASE = (process.argv[2] ?? "http://localhost:9385").replace(/\/$/, "");
const OUT = outDir(process.argv[3], "showcase-shot");
const PORT = chromePort(9386, process.argv[4]);

const results = { base: BASE, checks: [] };
const record = (name, ok, detail) => {
  results.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail === undefined ? "" : JSON.stringify(detail)}`);
};

const { page, evaluate, navigate, shot, close } = await start(OUT, PORT);
const SHOWCASE = `[...document.querySelectorAll("section[aria-label='紙娃娃']")].find(el => el.offsetHeight > 0)`;
const DRAW = `${SHOWCASE}?.querySelector("a[href='/plan/avatar?draw=1']")`;
const STAGE = `document.querySelector("img[alt='穿好的角色']")`;
const until = async (expr, ms = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await evaluate(`Boolean(${expr})`).catch(() => false)) return true;
    await sleep(100);
  }
  return false;
};
const viewport = (width, height) => page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: width < 768 });
const setProfile = async saved => {
  await navigate(`${BASE}/`);
  await evaluate(saved ? `localStorage.setItem("ms-profile", JSON.stringify({ level: 45, job: 210 }))` : `localStorage.removeItem("ms-profile")`);
  await navigate(`${BASE}/`);
  await until(SHOWCASE);
};
const x = () => evaluate(`Math.round(${SHOWCASE}.querySelector("ul").getBoundingClientRect().left * 10) / 10`);

try {
  await page.send("Network.enable");
  const rsc = [];
  page.listeners.add(m => {
    if (m.method === "Network.requestWillBeSent" && /\/plan\/avatar.*_rsc=/.test(m.params.request.url)) rsc.push(m.params.request.url);
  });
  await viewport(375, 812);

  // 第一次來
  await setProfile(false);
  const first = await evaluate(`(() => {
    const box = ${SHOWCASE}; const h1 = document.querySelector("h1");
    return { top: Math.round(box.getBoundingClientRect().top), h: box.offsetHeight, aboveTitle: box.getBoundingClientRect().bottom <= h1.getBoundingClientRect().top,
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
  })()`);
  record("第一次來：輪播在大標上面、在第一個畫面裡、不橫捲", first.aboveTitle && first.top + first.h <= 812 && first.sw <= first.cw, first);

  const x0 = await x();
  await sleep(1000);
  const x1 = await x();
  record("會動：一秒往左走 15～60px", x0 - x1 >= 15 && x0 - x1 <= 60, { x0, x1 });
  const rows = await evaluate(`(() => { const ul = ${SHOWCASE}.querySelectorAll("ul"); return { n: ul.length, same: ul[0].children.length === ul[1].children.length, count: ul[0].children.length, copyHidden: ul[1].getAttribute("aria-hidden"), copyTab: ul[1].querySelector("a").tabIndex, width: ul[0].offsetWidth }; })()`);
  record("兩排接起來：第二排報讀、鍵盤跳過，一排比手機畫面寬", rows.n === 2 && rows.same && rows.copyHidden === "true" && rows.copyTab === -1 && rows.width > 375, rows);
  await sleep(1500);
  const pixel = await evaluate(`[...${SHOWCASE}.querySelector("ul").querySelectorAll("img")].filter(img => img.complete && img.naturalWidth > 0).map(img => getComputedStyle(img).imageRendering)`);
  record("畫面裡的圖載到、像素清楚", pixel.length >= 3 && pixel.every(v => v === "pixelated"), { loaded: pixel.length });
  await sleep(1500);
  // 「抽一套」那顆可以預先載入（Next 拿掉參數要 /plan/avatar，跟以前的入口一樣），輪播裡帶穿搭的角色不行：一開頁就 30 個請求
  const looksRsc = rsc.filter(u => /[?&](g|s|h|f|w)=/.test(u));
  record("沒有幫輪播裡的角色預先載入", looksRsc.length === 0, { rsc: looksRsc.slice(0, 3) });
  await shot("showcase-375.png");

  await evaluate(`localStorage.setItem("ms-theme", "dark")`);
  await navigate(`${BASE}/`);
  await until(SHOWCASE);
  await sleep(1500);
  await shot("showcase-375-dark.png");
  await evaluate(`localStorage.removeItem("ms-theme")`);

  // 討厭動畫
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await navigate(`${BASE}/`);
  await until(SHOWCASE);
  const r0 = await x();
  await sleep(800);
  record("討厭動畫的人：不動", r0 === (await x()), { r0 });
  await page.send("Emulation.setEmulatedMedia", { features: [] });

  // 存過角色
  await setProfile(true);
  await until(`document.querySelector("section[aria-label='升級路線']")`);
  const saved = await evaluate(`(() => {
    const box = ${SHOWCASE}.getBoundingClientRect(); const route = document.querySelector("section[aria-label='升級路線']")?.getBoundingClientRect();
    const job = [...document.querySelectorAll("button")].find(b => b.textContent.includes("換其他職業"))?.getBoundingClientRect();
    return { count: [...document.querySelectorAll("section[aria-label='紙娃娃']")].filter(el => el.offsetHeight > 0).length, belowBar: job && box.top >= job.bottom, aboveRoute: route && box.bottom <= route.top };
  })()`);
  record("存過角色：只有一個輪播，在角色列下面、升級路線上面", saved.count === 1 && saved.belowBar && saved.aboveRoute, saved);
  await shot("showcase-saved.png");

  // 電腦版
  await viewport(1280, 900);
  await sleep(500);
  await shot("showcase-1280.png");
  await viewport(375, 812);

  // 點角色
  await setProfile(false);
  const href = await evaluate(`${SHOWCASE}.querySelector("ul a").getAttribute("href")`);
  await evaluate(`${SHOWCASE}.querySelector("ul a").click()`);
  await until(`location.pathname === "/plan/avatar" && ${STAGE}`);
  await sleep(1000);
  const landed = await evaluate("location.pathname + location.search");
  record("點角色：穿上那一套", landed === href, { href, landed });

  // 抽一套：這個分頁已經有存的一套，以前回來會穿回去
  const seen = new Set([await evaluate("location.search")]);
  let noDraw = true;
  for (let i = 0; i < 6; i++) {
    await navigate(`${BASE}/`);
    await until(DRAW);
    await evaluate(`${DRAW}.click()`);
    await until(`location.pathname === "/plan/avatar" && location.search && !location.search.includes("draw") && ${STAGE}`);
    await sleep(300);
    const s = await evaluate("location.search");
    if (s.includes("draw")) noDraw = false;
    seen.add(s);
  }
  record("抽一套：6 次都抽新的（不穿回上一套）、網址不留 draw", seen.size === 7 && noDraw, { kinds: seen.size });
  const girls = [...seen].filter(s => s.includes("g=1")).length;
  record("抽一套：7 套裡男女都有", girls > 0 && girls < seen.size, { girls });
  await sleep(2000);
  await shot("showcase-draw.png");
  const stay = await evaluate("location.search");
  await navigate(`${BASE}/plan/avatar${stay}`);
  await until(STAGE);
  await sleep(500);
  record("抽到之後重新整理：還是那一套", (await evaluate("location.search")) === stay);
} catch (error) {
  record("腳本中途出錯", false, String(error?.message ?? error).slice(0, 400));
} finally {
  const passed = results.checks.filter(c => c.ok).length;
  results.summary = `${passed}/${results.checks.length}`;
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\n${results.summary}  輸出在 ${OUT}`);
  await close();
  process.exit(passed === results.checks.length ? 0 : 1);
}
