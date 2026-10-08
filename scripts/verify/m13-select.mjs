// 只適用 v0.35～v0.54（那段時間道具頁有「誰能用」下拉）。v0.55 起下拉換成「〇〇能用」標籤按鈕，這支找不到下拉會直接出錯；
// 同一件事改看 scripts/verify-db.mjs 的 M13（點「〇〇能用」標籤，VERIFY_ONLY=M13）。
// 舊腳本 M13 的下拉版（v0.35 把「只看〇〇能用的裝備」勾選改成「誰能用」下拉）：
// 道具清單選「狂戰士能用的」→ 捲到中間 → 頁首「查資料」→ 返回：篩選還在、清單一樣、捲回原位、直接跳
// 用法：node m13-select.mjs <輸出資料夾> <base> [port]
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { start } from "./harness.mjs";

const OUT = outDir(process.argv[2], "m13-select");
const BASE = (process.argv[3] ?? "http://localhost:3061").replace(/\/$/, "");
const PORT = chromePort(9361, process.argv[4]);
const b = await start(OUT, PORT);
let result;
try {
  await b.page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await b.navigate(BASE + "/db");
  await b.evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: 45, job: 110 })); localStorage.setItem("ms-theme", "light"); "ok"`);
  await b.navigate(BASE + "/db/items");
  const before = await b.ev(`
    await __waitFor(() => document.querySelector('main select option[value="usable"]'));
    const select = document.querySelector('main select option[value="usable"]').parentElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, "usable");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await __sleep(800); await __settle();
    const ids = [...document.querySelectorAll("li[id^=db-row-]")].map(li => li.id).join(",");
    window.scrollTo({ top: Math.round(document.documentElement.scrollHeight * 0.5), behavior: "instant" }); await __sleep(500);
    return { value: select.value, label: select.selectedOptions[0].textContent.trim(), rows: ids.split(",").length, ids, leftY: Math.round(scrollY) };`);
  await b.ev(`[...document.querySelectorAll("header nav a")].find(a => a.textContent.trim() === "查資料").click();
    await __waitFor(() => location.pathname === "/db"); await __settle(4000); return 1;`);
  await b.evaluate(`window.__fp = window.__sampleFrames(1500); 1`);
  await b.traverse(-1);
  const frames = await b.evaluate(`window.__fp`);
  const after = await b.ev(`await __sleep(300);
    const select = document.querySelector('main select option[value="usable"]')?.parentElement;
    const ids = [...document.querySelectorAll("li[id^=db-row-]")].map(li => li.id).join(",");
    return { value: select?.value ?? null, rows: ids.split(",").length, ids, y: Math.round(scrollY) };`);
  const on = frames.filter(f => f[2] === "/db/items").map(f => f[1]);
  const distinct = on.filter((y, i) => i === 0 || y !== on[i - 1]);
  const firstFrameOnItems = frames.find(f => f[2] === "/db/items");
  result = {
    filter: `${before.label}（${before.value}）`, rowsBefore: before.rows, leftY: before.leftY,
    filterKept: after.value === before.value, sameList: after.ids === before.ids, rowsAfter: after.rows,
    backY: after.y, positionOk: Math.abs(after.y - before.leftY) <= 2,
    firstFrameY: firstFrameOnItems?.[1] ?? null, distinctOnItems: distinct.length, path: distinct.slice(0, 8),
    shot: await b.shot("m13-after-back.png"),
  };
} catch (error) {
  result = { error: String(error?.stack ?? error).slice(0, 600) };
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(result, null, 2));
  await b.close();
}
console.log(JSON.stringify(result));
process.exit(0);
