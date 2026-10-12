// 全站小字對比（WCAG AA）：每一頁、白天跟夜晚各一次，把畫面上每段字的字色疊在實際背景上算對比，沒過的列出來（v0.81）
// 用法：node scripts/verify/contrast-audit.mjs <輸出資料夾> <網址> [頁面,頁面…]
//   例：node scripts/verify/contrast-audit.mjs out https://maplestory-tool-git-dev-clarkhers-projects.vercel.app
//   頁面不給就跑 13 頁（首頁、查資料四頁＋道具卡、/plan 五頁含傷害計算機、/go、/guide、/about）。首頁先存刺客 35 全幸，卡片才有東西。
// 門檻：一般字 4.5；大字（24px 以上，或 18.66px 以上且粗體）3。停用的按鈕（disabled、aria-disabled）不算。
// 有任何一段沒過就 exit 1。results.json 記每頁每個主題沒過的字（字、字色、背景、比值、字級、class）。
// 環境變數 THEMES：只跑某個主題（light 或 dark，預設兩個都跑）；WIDTH：視窗寬（預設 390）。
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { start, sleep } from "./harness.mjs";

const OUT = outDir(process.argv[2], "contrast-audit");
const BASE = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const PAGES = (process.argv[4] ?? "/,/db/items?id=1472004,/db/monsters,/db/quests,/db/skills,/plan/farm,/plan/quest,/plan/train,/plan/bundle,/plan/damage,/go,/guide,/about").split(",");
const THEMES = (process.env.THEMES ?? "light,dark").split(",");
const WIDTH = Number(process.env.WIDTH ?? 390);
const PORT = chromePort(9375);

// 顏色一律畫在 canvas 上讀回來（oklch、color-mix 都認得）。背景從 <html> 一路疊到那個元素（不透明的蓋掉、半透明的跟下層混），
// opacity 照群組合成算。沒算 background-image（body 的暈光、圖）跟 backdrop-filter——毛玻璃當成疊在下層的半透明色。
// 跟 build-variants-shot.mjs 的 contrast 同一套算法，那支只量一塊，這支量整頁。
const AUDIT = `(() => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const pixel = (base, css) => { ctx.globalAlpha = 1; ctx.fillStyle = base; ctx.fillRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  const cache = new Map();
  const rgba = css => {
    if (cache.has(css)) return cache.get(css);
    const black = pixel("#000", css), white = pixel("#fff", css);
    const alpha = 1 - (white[0] - black[0] + white[1] - black[1] + white[2] - black[2]) / (3 * 255);
    const value = { pre: black, alpha: Math.max(0, Math.min(1, alpha)) };
    cache.set(css, value);
    return value;
  };
  const over = (css, below) => { const { pre, alpha } = rgba(css); return below.map((c, i) => pre[i] + (1 - alpha) * c); };
  const mix = (o, top, below) => top.map((c, i) => o * c + (1 - o) * below[i]);
  const lum = rgb => {
    const [r, g, b] = rgb.map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hex = rgb => "#" + rgb.map(c => Math.round(c).toString(16).padStart(2, "0")).join("");
  const measure = el => {
    const chain = [];
    for (let node = el; node; node = node.parentElement) chain.unshift(node);
    let bg = [255, 255, 255];
    const groups = [];
    for (const node of chain) {
      const style = getComputedStyle(node);
      const o = Number(style.opacity);
      if (o < 1) groups.push({ o, base: bg });
      bg = over(style.backgroundColor, bg);
    }
    let fg = over(getComputedStyle(el).color, bg);
    for (const { o, base } of groups.reverse()) { bg = mix(o, bg, base); fg = mix(o, fg, base); }
    return { bg, fg };
  };
  const rows = [];
  for (const el of document.body.querySelectorAll("*")) {
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").replace(/\\s+/g, " ").trim();
    if (!own) continue;
    if (el.closest("script,style,noscript,[aria-hidden='true'],.sr-only")) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    const { bg, fg } = measure(el);
    const size = parseFloat(style.fontSize), weight = Number(style.fontWeight);
    const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
    rows.push({
      text: own.slice(0, 40), ratio: Math.round(ratio(fg, bg) * 100) / 100, need, color: hex(fg), bg: hex(bg), size, weight,
      disabled: Boolean(el.closest("button:disabled,input:disabled,select:disabled,[aria-disabled='true']")),
      cls: (el.getAttribute("class") ?? "").slice(0, 120),
    });
  }
  return rows;
})()`;

const { page, evaluate, navigate, close } = await start(OUT, PORT, [`--window-size=${WIDTH},900`]);
await page.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: true });
const waitFor = (cond, ms = 40000) => evaluate(`new Promise(res => { const t0 = Date.now(); const tick = () => { if (${cond}) return res(true); if (Date.now() - t0 > ${ms}) return res(false); setTimeout(tick, 150); }; tick(); })`);

const results = [];
let failed = 0;
try {
  for (const theme of THEMES) {
    // 先開同網域的小圖清 localStorage，再存角色（刺客 35 全幸）跟主題
    await navigate(BASE + "/brand-emblem.png");
    await evaluate(`localStorage.clear(); sessionStorage.clear();
      localStorage.setItem("ms-profile", JSON.stringify({ level: 35, job: 410 }));
      localStorage.setItem("ms-build", JSON.stringify({ "400": "全幸" }));
      localStorage.setItem("ms-theme", ${JSON.stringify(theme)}); "ok"`);
    for (const p of PAGES) {
      await navigate(BASE + p);
      const ready = await waitFor(`document.querySelector("main") && document.querySelector("main").innerText.length > 80`);
      await sleep(p === "/" ? 3500 : 2500);
      // 傷害計算機的「看細節」「技能等級」「怎麼算的」預設收起來、裡面量不到，先全部展開再量
      if (p.startsWith("/plan/damage")) {
        await evaluate(`document.querySelectorAll("details").forEach(d => { d.open = true; }); "ok"`);
        await sleep(600);
      }
      const rows = await evaluate(AUDIT);
      const low = rows.filter(r => !r.disabled && r.ratio < r.need).sort((a, b) => a.ratio - b.ratio);
      failed += low.length;
      results.push({ theme, page: p, ready, count: rows.length, low });
      console.log(`${low.length ? "FAIL" : "PASS"}\t${theme}\t${p}\t${rows.length} 段字，沒過 ${low.length}${low.length ? `，最低 ${low[0].ratio}` : ""}`);
      // 同樣字色、背景的歸成一組，各印一行
      const groups = new Map();
      for (const r of low) {
        const key = `${r.ratio}\t${r.color} 疊在 ${r.bg}\t${r.size}px ${r.weight}`;
        groups.set(key, [...(groups.get(key) ?? []), r.text]);
      }
      for (const [key, texts] of [...groups].slice(0, 8)) console.log(`  ${key}\t×${texts.length}\t${texts.slice(0, 3).join("／")}`);
    }
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(failed ? `沒過 ${failed} 段` : "全部過");
  console.log(`輸出：${OUT}`);
  await close();
  process.exit(process.exitCode ?? (failed ? 1 : 0));
}
