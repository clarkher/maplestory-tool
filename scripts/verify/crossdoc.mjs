// 跨文件的返回、重新整理：位置會不會還原？是不是平滑捲動害的？
// 用法：node crossdoc.mjs <輸出資料夾> <base> [port]
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const OUT = outDir(process.argv[2], "crossdoc");
const BASE = (process.argv[3] ?? "http://localhost:3047").replace(/\/$/, "");
const PORT = chromePort(9348, process.argv[4]);
// 第 6 個參數 nobf：關掉瀏覽器的返回快取，離站再返回一定整頁重載
const NO_BFCACHE = process.argv[6] === "nobf";
const b = await start(OUT, PORT, NO_BFCACHE ? ["--disable-features=BackForwardCache"] : []);

const SAMPLER = `(() => {
  const rec = key => { const out = []; const t0 = performance.now(); window[key] = out;
    const tick = () => { out.push([Math.round(performance.now() - t0), Math.round(scrollY)]); if (performance.now() - t0 < 2500) requestAnimationFrame(tick); };
    requestAnimationFrame(tick); };
  rec("__bootFrames");
  addEventListener("pageshow", e => { window.__persisted = e.persisted; if (e.persisted) rec("__bfFrames"); });
})();`;
// 實驗：按返回／重新整理進來的頁面，一開頭先關掉平滑捲動
// （DevTools 注入的腳本跑的時候 <html> 還沒建好，要等它出現再設，跟 <head> 裡的 inline script 同時機）
const EARLY_AUTO = `(() => {
  const t = performance.getEntriesByType("navigation")[0]?.type;
  window.__earlyType = t ?? null;
  window.__styleLog = [];
  if (t !== "back_forward" && t !== "reload") return;
  const apply = () => {
    const html = document.documentElement;
    html.style.scrollBehavior = "auto";
    window.__styleLog.push([Math.round(performance.now()), "set", html.getAttribute("style")]);
    new MutationObserver(() => window.__styleLog.push([Math.round(performance.now()), "changed", html.getAttribute("style")]))
      .observe(html, { attributes: true, attributeFilter: ["style"] });
  };
  if (document.documentElement) apply();
  else new MutationObserver((_, mo) => { if (document.documentElement) { mo.disconnect(); apply(); } }).observe(document, { childList: true });
})();`;
const ONLY_EARLY = process.argv[5] === "early";

const results = [];
try {
  await b.page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await b.navigate(BASE + "/db");
  await b.evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: 45, job: 110 })); localStorage.setItem("ms-theme", "light"); "ok"`);
  await b.page.send("Page.addScriptToEvaluateOnNewDocument", { source: SAMPLER });

  console.log("start");
  for (const early of ONLY_EARLY ? [true] : process.argv[5] === "plain" ? [false] : [false, true]) {
    const added = early ? await b.page.send("Page.addScriptToEvaluateOnNewDocument", { source: EARLY_AUTO }) : null;
    for (const from of ["/guide", "/about", "/", "/plan/quest"]) {
      for (const kind of ["back", "reload"]) {
        await b.navigate(BASE + from);
        const leftY = await b.ev(`await __settle(); window.scrollTo({ top: Math.round(document.documentElement.scrollHeight * 0.6), behavior: "instant" }); await __sleep(600); return Math.round(scrollY);`);
        if (kind === "back") {
          await b.navigate("about:blank");
          await sleep(400);
          const loaded = b.loadOnce();
          await b.traverse(-1);
          await loaded;
        } else {
          const loaded = b.loadOnce();
          await b.page.send("Page.reload");
          await loaded;
        }
        await sleep(2800);
        const r = await b.evaluate(`({ persisted: window.__persisted ?? null, navType: performance.getEntriesByType("navigation")[0]?.type,
          y: Math.round(scrollY), inline: document.documentElement.style.scrollBehavior,
          reasons: JSON.stringify(performance.getEntriesByType("navigation")[0]?.notRestoredReasons ?? null).slice(0, 300),
          earlyType: window.__earlyType ?? null, styleLog: JSON.stringify(window.__styleLog ?? null).slice(0, 300),
          frames: (window.__persisted ? window.__bfFrames : window.__bootFrames)?.map(f => f[1]) ?? null })`);
        const ys = r.frames ?? [];
        const distinct = ys.filter((y, i) => i === 0 || y !== ys[i - 1]);
        const row = { early, from, kind, leftY, finalY: r.y, ok: Math.abs(r.y - leftY) <= 2, persisted: r.persisted, navType: r.navType, inline: r.inline,
          distinctFrames: distinct.length, path: distinct.slice(0, 12), reasons: r.reasons, earlyType: r.earlyType, styleLog: r.styleLog };
        results.push(row);
        console.log(`${early ? "一開頭關平滑" : "現況"}｜${from}｜${kind === "back" ? "離站再返回" : "重新整理"}｜離開 ${leftY} → 停 ${r.y}（${row.ok ? "對" : "不對"}）｜${r.navType} persisted=${r.persisted}｜逐格 ${JSON.stringify(row.path)}｜inline='${r.inline}' log=${r.styleLog}`);
      }
    }
    if (added) await b.page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: added.identifier });
  }
} catch (error) {
  results.push({ error: String(error?.stack ?? error).slice(0, 800) });
  console.log(String(error?.stack ?? error).slice(0, 800));
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  await b.close();
}
process.exit(0);
