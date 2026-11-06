// 紙娃娃隨機穿搭的換裝畫面（v1.76）驗收：抽獎跳格、等圖等到好才定格、預載好的也演一下、換單件不跳、討厭動畫的人不跳、載不出來不卡；任何一項沒過 exit 1
// 用法：node scripts/verify/avatar-roll-shot.mjs [網址，預設 http://localhost:9385] [輸出資料夾] [DevTools 埠，預設 9399]
// 輸出：roll-375.png（跳格中）、roll-375-dark.png、roll-1280.png、roll-done.png（定格後）、results.json
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const BASE = (process.argv[2] ?? "http://localhost:9385").replace(/\/$/, "");
const OUT = outDir(process.argv[3], "avatar-roll-shot");
const PORT = chromePort(9399, process.argv[4]);

const results = { base: BASE, checks: [] };
const record = (name, ok, detail) => {
  results.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail === undefined ? "" : JSON.stringify(detail)}`);
};

const { page, evaluate, navigate, shot, close } = await start(OUT, PORT);
const CARD = `document.querySelector("section[aria-label='角色']")`;
const STAGE = `${CARD}?.querySelector("[aria-busy]")`;
const IMG = `${CARD}?.querySelector("img[alt='穿好的角色']")`;
const ROLLER = `${STAGE}?.querySelector("[data-rolling]")`;
const RANDOM = `[...(${CARD}?.querySelectorAll("button") ?? [])].find(b => ["隨機穿搭", "換裝中…"].includes(b.textContent.trim()))`;
const SIT = `[...document.querySelectorAll("[role='group'][aria-label='動作'] button")].find(b => b.textContent.trim() === "坐下")`;
const SETTLED = `(${STAGE}?.getAttribute("aria-busy") === "false" && ${IMG}?.complete && ${IMG}?.naturalWidth > 0)`;
const until = async (expr, ms = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await evaluate(`Boolean(${expr})`).catch(() => false)) return true;
    await sleep(100);
  }
  return false;
};
const viewport = (width, height) => page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: width < 768 });
const open = async (query = "?g=0") => {
  await navigate(`${BASE}/plan/avatar${query}`);
  if (!(await until(SETTLED))) throw new Error(`等不到舞台畫好：${query}`);
  await sleep(300);
};
/** 攔 maplestory.io 的圖；fn 跑完一定解除 */
async function intercepting(onPaused, fn) {
  const listener = m => { if (m.method === "Fetch.requestPaused") onPaused(m.params); };
  page.listeners.add(listener);
  await page.send("Fetch.enable", { patterns: [{ urlPattern: "*maplestory.io*" }] });
  try { return await fn(); } finally {
    await page.send("Fetch.disable");
    page.listeners.delete(listener);
  }
}
const pass = p => page.send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {});
const fail = p => page.send("Fetch.failRequest", { requestId: p.requestId, errorReason: "Failed" }).catch(() => {});

/** 按下去、逐格記到舞台停下來 */
const watch = action => evaluate(`new Promise(res => {
  const stage = ${STAGE};
  const t0 = performance.now();
  const ev = { srcs: [], rollStart: null, rollEnd: null, shownWhileRolling: false, spinner: false, pop: false, flash: false, label: false, tag: false, overflow: false };
  (${action}).click();
  let doneAt = null;
  const tick = () => {
    const now = Math.round(performance.now() - t0);
    const r = stage.querySelector("[data-rolling]");
    const img = stage.querySelector("img[alt='穿好的角色']");
    if (r) {
      if (ev.rollStart === null) ev.rollStart = now;
      ev.rollEnd = null;
      const face = r.querySelector("img");
      if (face?.getAttribute("src") && ev.srcs.at(-1) !== face.getAttribute("src")) ev.srcs.push(face.getAttribute("src"));
      if (face) {
        const a = face.getBoundingClientRect(), b = stage.getBoundingClientRect();
        if (a.left < b.left || a.right > b.right || a.top < b.top || a.bottom > b.bottom) ev.overflow = true;
      }
      if (img && getComputedStyle(img).visibility === "visible") ev.shownWhileRolling = true;
      if (r.textContent.includes("換裝中")) ev.tag = true;
    } else if (ev.rollStart !== null && ev.rollEnd === null) ev.rollEnd = now;
    if (stage.querySelector(".motion-safe\\\\:animate-spin")) ev.spinner = true;
    if (img?.classList.contains("avatar-pop")) ev.pop = true;
    if (stage.querySelector(".avatar-flash")) ev.flash = true;
    if (${RANDOM}?.textContent.trim() === "換裝中…") ev.label = true;
    const idle = stage.getAttribute("aria-busy") === "false" && !r;
    if (idle && doneAt === null && now > 60) doneAt = now;
    if (!idle) doneAt = null;
    if ((doneAt !== null && now - doneAt > 500) || now > 30000) {
      ev.end = now;
      ev.error = stage.textContent.includes("載不出來");
      ev.visibleEnd = img ? getComputedStyle(img).visibility === "visible" && img.style.opacity === "" : false;
      ev.popEnd = Boolean(img?.classList.contains("avatar-pop"));
      return res(ev);
    }
    requestAnimationFrame(tick);
  };
  tick();
})`);

try {
  await viewport(375, 812);

  // 慢的圖：等到圖好才定格
  await open();
  const before = await evaluate(`${IMG}.src`);
  const slow = await intercepting(
    p => { setTimeout(() => pass(p), 1200); },
    async () => {
      const watching = watch(RANDOM);
      await sleep(700);
      await shot("roll-375.png");
      return watching;
    },
  );
  const after = await evaluate(`${IMG}.src`);
  record("慢的圖（拖 1.2 秒）：一按就跳格、一路換人、舊角色藏起來、沒有小圈圈、字變換裝中、不超出舞台",
    slow.rollStart !== null && slow.rollStart <= 100 && new Set(slow.srcs).size >= 5 && !slow.shownWhileRolling && !slow.spinner && slow.label && slow.tag && !slow.overflow,
    { rollStart: slow.rollStart, kinds: new Set(slow.srcs).size, shownWhileRolling: slow.shownWhileRolling, spinner: slow.spinner, label: slow.label, tag: slow.tag, overflow: slow.overflow });
  record("慢的圖：圖好了才定格、閃一下彈一下、最後是新角色完整顯示、動畫收乾淨",
    slow.rollEnd >= 1200 && slow.pop && slow.flash && after !== before && slow.visibleEnd && !slow.popEnd && !slow.error,
    { rollEnd: slow.rollEnd, pop: slow.pop, flash: slow.flash, changed: after !== before, visibleEnd: slow.visibleEnd, popEnd: slow.popEnd });
  await shot("roll-done.png");

  // 預載好的：圖瞬間就有，還是要看得到在換
  await open();
  await evaluate(`${RANDOM}.click()`);
  await until(SETTLED);
  await sleep(3000); // 等下一套預載
  const fast = await watch(RANDOM);
  record("圖已經備好：還是演約 0.4 秒才定格", fast.rollEnd >= 350 && fast.rollEnd <= 900 && new Set(fast.srcs).size >= 3 && fast.pop, { rollEnd: fast.rollEnd, kinds: new Set(fast.srcs).size, pop: fast.pop });

  // 連按：最後一套才定格
  await open();
  const q0 = await evaluate("location.search");
  await evaluate(`(() => { const b = ${RANDOM}; b.click(); setTimeout(() => b.click(), 120); setTimeout(() => b.click(), 240); })()`);
  await sleep(100);
  const rolled = await evaluate(`Boolean(${ROLLER})`);
  await sleep(300);
  await until(SETTLED);
  await sleep(600);
  const rapid = await evaluate(`({ roller: Boolean(${ROLLER}), q: location.search, frame: new URL(${IMG}.src).pathname, error: ${STAGE}.textContent.includes("載不出來") })`);
  record("連按三下：跳格接著跳，最後停在最新那套", rolled && !rapid.roller && rapid.q !== q0 && !rapid.error, { rolled, ...rapid });

  // 換單件不跳
  await open();
  await page.send("Network.setCacheDisabled", { cacheDisabled: true });
  const sit = await intercepting(p => { setTimeout(() => pass(p), 1000); }, () => watch(SIT));
  await page.send("Network.setCacheDisabled", { cacheDisabled: false });
  record("換動作、換單件：不跳格、不閃，照舊變淡加小圈圈", sit.rollStart === null && !sit.pop && !sit.flash && sit.spinner, { rollStart: sit.rollStart, pop: sit.pop, flash: sit.flash, spinner: sit.spinner });

  // 載不出來
  await open();
  const broken = await intercepting(fail, () => watch(RANDOM));
  const retry = await evaluate(`[...${STAGE}.querySelectorAll("button")].some(b => b.textContent.includes("再試一次"))`);
  record("載不出來：跳格停掉、照實說、不閃", broken.rollEnd !== null && broken.error && retry && !broken.pop && !broken.flash, { rollEnd: broken.rollEnd, error: broken.error, retry, pop: broken.pop, flash: broken.flash });

  // 從首頁「抽一套」進來：第一眼就在抽
  await navigate(`${BASE}/`);
  await until(`document.querySelector("a[href='/plan/avatar?draw=1']")`);
  await evaluate(`[...document.querySelectorAll("a[href='/plan/avatar?draw=1']")].find(a => a.offsetHeight > 0).click()`);
  const drawRoll = await until(`location.pathname === "/plan/avatar" && ${ROLLER}`, 15000);
  const drawDone = await until(`${SETTLED} && !${ROLLER}`, 30000);
  record("首頁按抽一套進來：先跳格再定格", drawRoll && drawDone, { drawRoll, drawDone });

  // 深色、電腦版
  await open();
  await evaluate(`localStorage.setItem("ms-theme", "dark")`);
  await open();
  await intercepting(p => { setTimeout(() => pass(p), 1200); }, async () => {
    await evaluate(`${RANDOM}.click()`);
    await sleep(600);
    await shot("roll-375-dark.png");
    await until(SETTLED);
  });
  await evaluate(`localStorage.removeItem("ms-theme")`);
  await viewport(1280, 900);
  await open();
  await intercepting(p => { setTimeout(() => pass(p), 1200); }, async () => {
    await evaluate(`${RANDOM}.click()`);
    await sleep(600);
    await shot("roll-1280.png");
    await until(SETTLED);
  });
  await viewport(375, 812);

  // 討厭動畫：不跳不閃，只有字
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await open();
  const calm = await intercepting(p => { setTimeout(() => pass(p), 1000); }, () => watch(RANDOM));
  await page.send("Emulation.setEmulatedMedia", { features: [] });
  record("討厭動畫的人：不跳格、不閃不彈，只寫換裝中，好了直接換", calm.srcs.length === 0 && calm.tag && !calm.pop && !calm.flash && !calm.spinner && calm.visibleEnd, { srcs: calm.srcs.length, tag: calm.tag, pop: calm.pop, flash: calm.flash, spinner: calm.spinner, visibleEnd: calm.visibleEnd });
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
