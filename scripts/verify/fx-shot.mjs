// 楓幣匯率頁（/price/fx，v0.98）截圖：手機 390、桌機 1280、手機深色、讀不到資料（?broken=1）
// 用法：node scripts/verify/fx-shot.mjs <輸出資料夾> <網址，預設 http://localhost:3000> [DevTools 埠，預設 9481]
//   例：node scripts/verify/fx-shot.mjs "$TEMP/fx-shot" http://localhost:3471
// 網址用 localhost，不要用 127.0.0.1（next dev 對 127.0.0.1 的互動不理）。
// 頁面讀的是 raw.githubusercontent.com 的真資料，所以要連得到網路；?pin=<日期> 讓十字線停在固定那天（取資料裡倒數第 4 天，圖只畫最近幾天，太舊的日子會被擠出去）。
// 輸出：fx-390.png、fx-1280.png、fx-390-dark.png、fx-broken-390.png（整頁高度）、results.json
// 每張印一行 PASS／FAIL（頁面有載好、沒有橫向捲動、主題對（深色那張 data-theme 要是 dark）、讀數開頭是 pin 那天，
// 讀不到那張要看到「讀不到匯率資料」），但一律 exit 0；截圖要自己打開看。
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const OUT = outDir(process.argv[2], "fx-shot");
const BASE = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const PORT = chromePort(9481, process.argv[4]);

// 十字線停在資料裡倒數第 4 天：讀得到資料就照資料挑，讀不到才用寫死的日期（那天可能已經被擠出圖外，讀數就會對不上，腳本會印 FAIL）
async function pickPin() {
  try {
    const res = await fetch("https://raw.githubusercontent.com/clarkher/maplestory-tool/fx-data/fx/scania/daily.json");
    const days = (await res.json()).days;
    return days[Math.max(0, days.length - 4)].date;
  } catch { return "2026-10-12"; }
}
const PIN = await pickPin();
const pinLabel = `${Number(PIN.slice(5, 7))}/${PIN.slice(8, 10)}`; // 讀數開頭的「10/12」，跟頁面的 dayLabel 同格式

const SHOTS = [
  { file: "fx-390.png", width: 390, theme: "light", query: "" },
  { file: "fx-1280.png", width: 1280, theme: "light", query: "" },
  { file: "fx-390-dark.png", width: 390, theme: "dark", query: "" },
  { file: "fx-broken-390.png", width: 390, theme: "light", query: "&broken=1", broken: true },
];

fs.mkdirSync(OUT, { recursive: true });
const s = await start(OUT, PORT);
const report = [];

async function shoot({ file, width, theme, query, broken }) {
  const mobile = width < 600;
  const scale = mobile ? 2 : 1;
  await s.page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
  await s.page.send("Emulation.setDeviceMetricsOverride", { width, height: mobile ? 844 : 900, deviceScaleFactor: scale, mobile });
  await s.navigate(`${BASE}/price/fx?pin=${PIN}${query}`);
  const info = await s.ev(`
    document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
    const ready = await __waitFor(() => document.querySelector('[data-fx-ready="1"]'), 60000);
    await __sleep(600);
    const h = await __settle(6000);
    window.scrollTo(0, 0);
    const root = document.querySelector('[data-fx-ready]');
    return { ready, h, sw: document.documentElement.scrollWidth, iw: innerWidth,
      theme: document.documentElement.dataset.theme ?? null, text: root ? root.innerText.slice(0, 120) : null,
      readout: (document.querySelector('[data-fx-readout]')?.innerText ?? "").trim().slice(0, 40) };
  `);
  // 把視窗拉到整頁那麼高再截，一張圖看到底
  await s.page.send("Emulation.setDeviceMetricsOverride", { width, height: Math.ceil(info.h), deviceScaleFactor: scale, mobile });
  await s.evaluate(`document.querySelectorAll("nextjs-portal").forEach(el => el.style.display = "none")`);
  await sleep(700);
  await s.shot(file);
  const overflowX = info.sw > info.iw;
  const pageOk = broken ? Boolean(info.text && info.text.includes("讀不到匯率資料")) : Boolean(info.ready && info.text && !info.text.includes("讀不到匯率資料"));
  const themeOk = info.theme === theme; // 深色那張 <html data-theme> 一定要是 dark，不然截到的是淺色
  const pinOk = broken || info.readout.startsWith(pinLabel); // 讀不到資料那張沒有讀數；其他張讀數要停在 pin 那天
  const ok = pageOk && !overflowX && themeOk && pinOk;
  report.push({ file, width, theme, broken: Boolean(broken), ok, pageOk, overflowX, themeOk, pinOk, pageTheme: info.theme, readout: info.readout, scrollWidth: info.sw, innerWidth: info.iw, height: info.h, text: info.text });
  console.log(`${ok ? "PASS" : "FAIL"}  ${file}  ${width}px ${theme}${broken ? " broken" : ""}  橫向捲動:${overflowX ? "有" : "沒有"}  頁面:${pageOk ? "正常" : "不對"}  主題:${themeOk ? "對" : `不對（data-theme=${info.theme}）`}  ${broken ? "" : `讀數:${pinOk ? "停在" + pinLabel : `不對（${info.readout}）`}  `}高:${info.h}`);
}

try {
  for (const shot of SHOTS) {
    try { await shoot(shot); }
    catch (err) {
      report.push({ file: shot.file, ok: false, error: String(err.message ?? err).slice(0, 300) });
      console.log(`FAIL  ${shot.file}  ${String(err.message ?? err).slice(0, 200)}`);
    }
  }
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ base: BASE, port: PORT, pin: PIN, shots: report }, null, 1));
  console.log(`輸出：${OUT}`);
  await s.close();
  process.exit(0);
}
