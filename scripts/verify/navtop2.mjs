// 進首頁沒捲回頂端的原因實驗：任務頁捲到底 → 頁首「我的路線」
// A：照常（首頁資料這次瀏覽沒載過）
// B：同 A，但先關掉捲動錨定（overflow-anchor: none）——如果停在頂端附近，就是錨定把位置往下推
// C：先整頁打開首頁（資料載過）→ 站內換到任務頁 → 捲到底 → 我的路線
// 用法：node navtop2.mjs <輸出資料夾> <port> <網址>
import fs from "node:fs";
import path from "node:path";
import { start } from "./harness.mjs";

const OUT = path.resolve(process.argv[2]);
const b = await start(OUT, Number(process.argv[3]));
const BASE = process.argv[4].replace(/\/$/, "");
const rows = [];
const goHome = (noAnchor) => `
  ${noAnchor ? `const st = document.createElement("style"); st.textContent = "html, body, main, main * { overflow-anchor: none !important; }"; document.head.appendChild(st);` : ""}
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); await __sleep(500);
  const leftY = Math.round(scrollY);
  const heights = []; let firstHeight = null;
  const fp = new Promise(res => { const out = []; const t0 = performance.now();
    const tick = () => { out.push([Math.round(performance.now() - t0), Math.round(scrollY), location.pathname, document.documentElement.scrollHeight]);
      if (performance.now() - t0 < 2500) requestAnimationFrame(tick); else res(out); }; requestAnimationFrame(tick); });
  [...document.querySelectorAll("header nav a")].find(a => a.textContent.trim() === "我的路線").click();
  const frames = await fp;
  const on = frames.filter(f => f[2] === "/");
  const ys = on.map(f => f[1]).filter((y, i, a) => i === 0 || y !== a[i - 1]);
  return { leftY, endY: Math.round(scrollY), path: ys.slice(0, 8), firstHeight: on[0]?.[3] ?? null, viewport: innerHeight, finalHeight: document.documentElement.scrollHeight };`;
try {
  await b.page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await b.navigate(BASE + "/db");
  await b.evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: 45, job: 110 })); localStorage.setItem("ms-theme", "light"); "ok"`);
  for (const [name, noAnchor] of [["A 照常", false], ["B 關掉捲動錨定", true]]) {
    await b.navigate(BASE + "/plan/quest");
    const r = await b.ev(`await __settle(); ${goHome(noAnchor)}`);
    rows.push({ name, ...r });
  }
  // C：首頁資料先載過
  await b.navigate(BASE + "/");
  const reached = await b.ev(`await __settle();
    [...document.querySelectorAll("header nav a")].find(a => a.textContent.trim() === "查資料").click();
    await __waitFor(() => location.pathname === "/db"); await __settle(4000);
    const link = document.querySelector('a[href="/plan/quest"]'); if (!link) return "沒有連到任務頁的連結";
    link.click(); await __waitFor(() => location.pathname === "/plan/quest"); await __settle(); return "ok";`);
  if (reached === "ok") rows.push({ name: "C 首頁資料載過", ...(await b.ev(goHome(false))) });
  else rows.push({ name: "C 首頁資料載過", error: reached });
} catch (error) {
  rows.push({ error: String(error?.stack ?? error).slice(0, 600) });
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(rows, null, 2));
  await b.close();
}
for (const r of rows) console.log(JSON.stringify(r));
process.exit(0);
