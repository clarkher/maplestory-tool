/**
 * 攻略文的版面（v1.49，Discover）：手機跟筆電（1280×720）第一屏看得到結論框開頭、頁面不橫捲、主圖 16:9、路線卡圖手機在文字右側約 42% 寬、電腦版約 28%。沒過 exit 1。
 *
 * 用法：node scripts/verify/article-layout.mjs [網址，預設 http://localhost:9485] [輸出] [文章路徑，逗號隔開] [DevTools 埠，預設 9499]
 * 清單 images.gen.json 有的圖頁面一定要有，頁面沒圖算沒過（拿舊的 out/ 跑才不會默默略過）；清單沒有的篇只量署名跟結論框。截圖存輸出資料夾：<篇>-390.png（第一屏）、<篇>-390-step.png（路線卡）、<篇>-1280.png。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outDir } from "./config.mjs";
import { chromePort } from "./config.mjs";
import { start } from "./harness.mjs";

const BASE = process.argv[2] ?? "http://localhost:9485";
const OUT = outDir(process.argv[3], "article-layout");
const PAGES = (process.argv[4] ?? "/guides/priest-31-50,/guides/berserker-31-50,/guides/hunter-31-50,/guides/assassin-31-50,/guides/bandit-31-50").split(",");
/** 第一屏至少要露出的結論框高度：標題「先講結論」加第一條的第一行 */
const ANSWER_MIN_VISIBLE = 50;
const MANIFEST = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/data/job-articles/images.gen.json"), "utf8"));

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? "過" : "沒過"}  ${name}${detail ? `  ${detail}` : ""}`);
};

const { page, navigate, ev, shot, close } = await start(OUT, chromePort(9499, process.argv[5]));
const viewport = (width, height, deviceScaleFactor, mobile) => page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile });

const MEASURE = `
  await __settle();
  const answer = [...document.querySelectorAll("p")].find(el => el.textContent === "先講結論").parentElement.getBoundingClientRect();
  const hero = document.querySelector('img[src$="hero.webp"]');
  const steps = [...document.querySelectorAll('img[src*="/assets/guides/"]')].filter(img => /\\/\\d+\\.webp$/.test(img.getAttribute("src")));
  const stepInfo = steps.map(img => {
    const box = img.getBoundingClientRect();
    const cell = img.parentElement.getBoundingClientRect();
    return { src: img.getAttribute("src"), ratio: box.width / cell.width, rightGap: cell.right - box.right, float: getComputedStyle(img).float, rendering: getComputedStyle(img).imageRendering, naturalWidth: img.naturalWidth };
  });
  return {
    answerTop: answer.top,
    innerHeight,
    pageWidth: document.documentElement.scrollWidth,
    innerWidth,
    hero: hero ? { ratio: hero.getBoundingClientRect().width / hero.getBoundingClientRect().height, width: hero.getBoundingClientRect().width, loading: hero.getAttribute("loading"), natural: hero.naturalWidth } : null,
    steps: stepInfo,
  };`;

try {
  for (const path of PAGES) {
    const name = path.split("/").pop();
    await viewport(390, 844, 3, true);
    await navigate(`${BASE}${path}`);
    const phone = await ev(MEASURE);
    await shot(`${name}-390.png`);
    const visible = phone.innerHeight - phone.answerTop;
    check(`${name} 手機第一屏看得到結論框開頭`, visible >= ANSWER_MIN_VISIBLE, `結論框頂端 ${Math.round(phone.answerTop)}px，第一屏露出 ${Math.round(visible)}px`);
    check(`${name} 手機頁面不橫捲`, phone.pageWidth <= phone.innerWidth, `頁寬 ${phone.pageWidth}、視窗 ${phone.innerWidth}`);
    const entry = MANIFEST[name];
    if (entry?.hero) check(`${name} 頁面有清單列的主圖`, Boolean(phone.hero));
    if (entry?.steps) {
      const wanted = Object.keys(entry.steps).sort().join("、");
      const got = phone.steps.map(step => step.src.split("/").pop().replace(".webp", "")).sort().join("、");
      check(`${name} 路線卡圖跟清單一樣`, wanted === got, `清單 ${wanted}；頁面 ${got}`);
    }
    if (phone.hero) {
      check(`${name} 主圖 16:9、不 lazy、圖真的載到`, Math.abs(phone.hero.ratio - 16 / 9) < 0.02 && phone.hero.loading !== "lazy" && phone.hero.natural > 0, `比例 ${phone.hero.ratio.toFixed(3)}、顯示寬 ${Math.round(phone.hero.width)}`);
    }
    for (const step of phone.steps) {
      check(`${name} 路線卡圖 ${step.src.split("/").pop()} 在右側約 42%`, step.float === "right" && Math.abs(step.ratio - 0.42) < 0.01 && step.rightGap < 1, `佔 ${(step.ratio * 100).toFixed(1)}%、${step.rendering}`);
    }
    if (phone.steps.length) {
      await ev(`document.querySelector('img[src*="/assets/guides/"][loading="lazy"]').closest("li").scrollIntoView({ behavior: "instant", block: "start" }); await __sleep(600); return true;`);
      await shot(`${name}-390-step.png`);
    }
    await viewport(1280, 720, 1, false);
    await navigate(`${BASE}${path}`);
    const desktop = await ev(MEASURE);
    await shot(`${name}-1280.png`);
    check(`${name} 電腦版頁面不橫捲`, desktop.pageWidth <= desktop.innerWidth, `頁寬 ${desktop.pageWidth}、視窗 ${desktop.innerWidth}`);
    const desktopVisible = desktop.innerHeight - desktop.answerTop;
    check(`${name} 筆電 1280×720 第一屏看得到結論框開頭`, desktopVisible >= ANSWER_MIN_VISIBLE, `結論框頂端 ${Math.round(desktop.answerTop)}px，第一屏露出 ${Math.round(desktopVisible)}px`);
    if (desktop.hero) check(`${name} 電腦版主圖還是 16:9`, Math.abs(desktop.hero.ratio - 16 / 9) < 0.02, `比例 ${desktop.hero.ratio.toFixed(3)}`);
    for (const step of desktop.steps) check(`${name} 電腦版路線卡圖 ${step.src.split("/").pop()} 約 28%`, Math.abs(step.ratio - 0.28) < 0.01, `佔 ${(step.ratio * 100).toFixed(1)}%`);
  }
} finally {
  await close();
}
const failed = results.filter(result => !result.ok);
console.log(`${results.length - failed.length}/${results.length} 過；截圖在 ${OUT}`);
if (failed.length) process.exit(1);
