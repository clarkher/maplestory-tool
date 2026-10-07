// 按完返回之後，頁內的平滑捲動還在不在：
// 1) 道具清單：捲到底 → 頁首「查資料」→ 返回（直接跳回）→ 用滑鼠真的點一筆 → 捲到細節應該是平滑的
// 2) 鍵盤：任務頁捲到底 → 換頁 → 返回 → Tab 到「跳到主要內容」→ Enter → 跟沒按返回的同一套動作比，捲動要一樣
// 用法：node after-back.mjs <輸出資料夾> <base> [port]
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const OUT = outDir(process.argv[2], "after-back");
const BASE = (process.argv[3] ?? "http://localhost:3061").replace(/\/$/, "");
const PORT = chromePort(9354, process.argv[4]);
const b = await start(OUT, PORT);
const distinct = ys => ys.filter((y, i) => i === 0 || y !== ys[i - 1]);

async function click(x, y) {
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await b.page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: type === "mouseMoved" ? 0 : 1 });
  }
}
async function key(k, code, keyCode) {
  await b.page.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: keyCode });
  await b.page.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: keyCode });
}
const style = () => b.evaluate(`document.documentElement.style.scrollBehavior`);

const results = [];
try {
  await b.page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await b.navigate(BASE + "/db");
  await b.evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: 45, job: 110 })); localStorage.setItem("ms-theme", "light"); "ok"`);

  // 1) 道具清單：返回後點一筆
  for (const afterBack of [false, true]) {
    await b.navigate(BASE + "/db/items");
    await b.ev(`await __waitFor(() => document.querySelectorAll("li[id^=db-row-]").length > 20); await __settle(); return 1;`);
    let styleAfterBack = null;
    if (afterBack) {
      await b.ev(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); await __sleep(400);
        [...document.querySelectorAll("header nav a")].find(a => a.textContent.trim() === "查資料").click();
        await __waitFor(() => location.pathname === "/db"); await __settle(4000); return 1;`);
      await b.traverse(-1);
      await b.ev(`await __waitFor(() => location.pathname === "/db/items"); await __sleep(800); return 1;`);
      styleAfterBack = await style();
    }
    // 把第 4 筆捲到畫面中間，用滑鼠點它
    const at = await b.ev(`const li = document.querySelectorAll("li[id^=db-row-]")[3]; li.scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(300);
      const r = li.querySelector("button").getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2), y0: Math.round(scrollY), id: li.id };`);
    await b.evaluate(`window.__fp = window.__sampleFrames(1500); 1`);
    await click(at.x, at.y);
    const frames = await b.evaluate(`window.__fp`);
    const ys = distinct(frames.map(f => f[1]));
    const end = await b.evaluate(`({ y: Math.round(scrollY), style: document.documentElement.style.scrollBehavior, id: new URLSearchParams(location.search).get("id"),
      rowTop: Math.round(document.getElementById(${JSON.stringify(at.id)}).getBoundingClientRect().top) })`);
    const shot = await b.shot(`item-tap-${afterBack ? "after-back" : "fresh"}.png`);
    results.push({ case: `道具清單點一筆（${afterBack ? "按完返回之後" : "剛打開"}）`, styleAfterBack, styleAfterTap: end.style, startY: at.y0, endY: end.y,
      frames: ys.length, path: ys.slice(0, 10), rowTop: end.rowTop, opened: end.id, shot });
  }

  // 2) 鍵盤：Tab 到「跳到主要內容」→ Enter
  for (const afterBack of [false, true]) {
    await b.navigate(BASE + "/plan/quest");
    await b.ev(`await __settle(); window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); await __sleep(400); return 1;`);
    let styleAfterBack = null;
    if (afterBack) {
      await b.ev(`[...document.querySelectorAll("header nav a")].find(a => a.textContent.trim() === "我的路線").click();
        await __waitFor(() => location.pathname === "/"); await __settle(4000); return 1;`);
      await b.traverse(-1);
      await b.ev(`await __waitFor(() => location.pathname === "/plan/quest"); await __sleep(800); return 1;`);
      styleAfterBack = await style();
    }
    const y0 = await b.evaluate(`document.activeElement?.blur(); Math.round(scrollY)`);
    await b.evaluate(`window.__fp = window.__sampleFrames(2200); 1`);
    await key("Tab", "Tab", 9);
    await sleep(250);
    const focused = await b.evaluate(`document.activeElement?.textContent?.trim().slice(0, 12) ?? null`);
    await key("Enter", "Enter", 13);
    const frames = await b.evaluate(`window.__fp`);
    const ys = distinct(frames.map(f => f[1]));
    const end = await b.evaluate(`({ y: Math.round(scrollY), hash: location.hash, style: document.documentElement.style.scrollBehavior,
      mainTop: Math.round(document.getElementById("main").getBoundingClientRect().top) })`);
    results.push({ case: `任務頁鍵盤跳到主要內容（${afterBack ? "按完返回之後" : "剛打開"}）`, styleAfterBack, focused, styleAfterKeys: end.style,
      startY: y0, endY: end.y, hash: end.hash, frames: ys.length, path: ys.slice(0, 10), mainTop: end.mainTop });
  }
} catch (error) {
  results.push({ error: String(error?.stack ?? error).slice(0, 800) });
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  await b.close();
}
for (const r of results) console.log(JSON.stringify(r));
process.exit(0);
