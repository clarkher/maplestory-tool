// 改前／改後對照圖：任務頁捲到底 → 頁首「我的路線」→ 按返回，逐格記 scrollY＋按下去 0.12 秒的畫面，畫成一張 PNG
// 用法：node chart.mjs <輸出資料夾> <改前網址> <改後網址> [port]
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const OUT = outDir(process.argv[2], "chart");
const BEFORE = process.argv[3].replace(/\/$/, "");
const AFTER = process.argv[4].replace(/\/$/, "");
const PORT = chromePort(9370, process.argv[5]);
const b = await start(OUT, PORT);

async function record(base, tag) {
  await b.page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await b.navigate(base + "/db");
  await b.evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: 45, job: 110 })); localStorage.setItem("ms-theme", "light"); "ok"`);
  await b.navigate(base + "/plan/quest");
  const leftY = await b.ev(`await __settle(); window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); await __sleep(500);
    const y = Math.round(scrollY);
    [...document.querySelectorAll("header nav a")].find(a => a.textContent.trim() === "我的路線").click();
    await __waitFor(() => location.pathname === "/"); await __settle(5000); return y;`);
  await b.evaluate(`window.__fp = window.__sampleFrames(1800); window.__t0 = performance.now(); 1`);
  await b.traverse(-1);
  await sleep(120);
  const r = await b.page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, `${tag}-0.12s.png`), Buffer.from(r.data, "base64"));
  const frames = await b.evaluate(`window.__fp`);
  // 從網址變成 /plan/quest 的那一格起算
  const i0 = frames.findIndex(f => f[2] === "/plan/quest");
  const t0 = frames[i0][0];
  const series = frames.slice(i0).map(f => [f[0] - t0, f[1]]);
  return { leftY, series, shot: r.data };
}

const before = await record(BEFORE, "before");
const after = await record(AFTER, "after");
fs.writeFileSync(path.join(OUT, "series.json"), JSON.stringify({ before: { leftY: before.leftY, series: before.series }, after: { leftY: after.leftY, series: after.series } }));

const W = 720, H = 300, PAD = { l: 64, r: 20, t: 20, b: 40 };
const maxT = 1600, maxY = Math.max(before.leftY, after.leftY);
const x = t => PAD.l + (Math.min(t, maxT) / maxT) * (W - PAD.l - PAD.r);
const y = v => PAD.t + (1 - v / maxY) * (H - PAD.t - PAD.b);
const line = s => s.filter(p => p[0] <= maxT).map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
const slideFrames = s => s.map(p => p[1]).filter((v, i, a) => i === 0 || v !== a[i - 1]).length - 1;
const reached = s => s.find(p => Math.abs(p[1] - s.at(-1)[1]) <= 2)?.[0] ?? null;
const ticksT = [0, 400, 800, 1200, 1600];
const ticksY = [0, 4000, 8000, 12000];

const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><style>
  body { margin: 0; font-family: "Noto Sans TC", "Microsoft JhengHei", sans-serif; background: #fbf5ea; color: #2b2118; }
  .wrap { width: 1240px; padding: 28px 32px; box-sizing: border-box; }
  h1 { font-size: 26px; margin: 0 0 6px; font-weight: 900; }
  .sub { font-size: 15px; color: #6b5a48; margin: 0 0 18px; }
  .row { display: flex; gap: 28px; align-items: flex-start; }
  .chart { background: #fffaf2; border: 1px solid #e4d6c0; border-radius: 14px; padding: 14px 14px 6px; }
  .legend { display: flex; gap: 18px; font-size: 14px; margin: 4px 0 8px 8px; }
  .legend span::before { content: ""; display: inline-block; width: 18px; height: 4px; border-radius: 2px; margin-right: 6px; vertical-align: middle; background: var(--c); }
  .facts { font-size: 15px; line-height: 1.7; margin: 10px 8px 6px; }
  .facts b { font-weight: 900; }
  .shots { display: flex; gap: 16px; }
  figure { margin: 0; text-align: center; }
  figure img { width: 188px; border-radius: 10px; border: 1px solid #e4d6c0; display: block; }
  figcaption { font-size: 14px; margin-top: 6px; font-weight: 700; }
  figcaption small { display: block; font-weight: 400; color: #6b5a48; }
</style></head><body><div class="wrap">
  <h1>按返回時的捲動位置：改前一路滑，改後直接跳</h1>
  <p class="sub">任務頁（狂戰士 45）捲到底 ${before.leftY}px → 頁首「我的路線」→ 按瀏覽器的返回。無頭 Chrome、手機 375 寬，每一格記一次位置。</p>
  <div class="row">
    <div class="chart">
      <div class="legend"><span style="--c:#b8a48c">改前（v0.42）</span><span style="--c:#d9531e">改後（v0.40）</span></div>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        ${ticksY.map(v => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" stroke="#eadfcd"/><text x="${PAD.l - 8}" y="${y(v) + 4}" font-size="12" text-anchor="end" fill="#8a7864">${v}</text>`).join("")}
        ${ticksT.map(t => `<text x="${x(t)}" y="${H - PAD.b + 18}" font-size="12" text-anchor="middle" fill="#8a7864">${t / 1000} 秒</text>`).join("")}
        <text x="${PAD.l - 48}" y="${PAD.t - 6}" font-size="12" fill="#8a7864">捲動位置 px</text>
        <line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(before.leftY)}" y2="${y(before.leftY)}" stroke="#2b2118" stroke-dasharray="4 4" opacity=".35"/>
        <text x="${W - PAD.r}" y="${y(before.leftY) - 6}" font-size="12" text-anchor="end" fill="#6b5a48">原本的位置</text>
        <path d="${line(before.series)}" fill="none" stroke="#b8a48c" stroke-width="3"/>
        <path d="${line(after.series)}" fill="none" stroke="#d9531e" stroke-width="3.5"/>
      </svg>
      <p class="facts">改前：中間滑了 <b>${slideFrames(before.series)} 格</b>，${reached(before.series) ?? "—"} 毫秒才到原位<br>改後：中間 <b>${slideFrames(after.series)} 格</b>，第一格就在原位</p>
    </div>
    <div class="shots">
      <figure><img src="data:image/png;base64,${before.shot}"><figcaption>改前<small>按返回 0.12 秒：還在半路</small></figcaption></figure>
      <figure><img src="data:image/png;base64,${after.shot}"><figcaption>改後<small>按返回 0.12 秒：已經在原位</small></figcaption></figure>
    </div>
  </div>
</div></body></html>`;
const file = path.join(OUT, "compare.html");
fs.writeFileSync(file, html);
await b.page.send("Emulation.setDeviceMetricsOverride", { width: 1240, height: 520, deviceScaleFactor: 2, mobile: false });
await b.navigate("file:///" + file.replace(/\\/g, "/"));
await sleep(500);
const h = await b.evaluate(`Math.ceil(document.querySelector(".wrap").getBoundingClientRect().height)`);
await b.page.send("Emulation.setDeviceMetricsOverride", { width: 1240, height: h, deviceScaleFactor: 2, mobile: false });
await sleep(300);
const png = await b.page.send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(path.join(OUT, "compare.png"), Buffer.from(png.data, "base64"));
console.log(JSON.stringify({ beforeSlide: slideFrames(before.series), beforeReachedMs: reached(before.series), afterSlide: slideFrames(after.series), afterReachedMs: reached(after.series), leftY: [before.leftY, after.leftY] }));
await b.close();
process.exit(0);
