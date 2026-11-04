/**
 * 攻略文的頁面（Discover）：5 篇的 meta、JSON-LD、主圖尺寸、圖全部載入、沒橫捲。沒過 exit 1。
 * 只看畫面跟 HTML，不看文字內容；版面（第一屏、路線卡位置）在 article-layout.mjs。
 *
 * 用法：node scripts/verify/article-page.mjs [網址，預設 http://localhost:9485] [輸出] [文章路徑，逗號隔開] [DevTools 埠，預設 9503]
 * Git Bash 要加 MSYS_NO_PATHCONV=1，不然 /guides/... 會被改成 Windows 路徑。
 *
 * 清單對真頁面：src/data/job-articles/images.gen.json 有的圖頁面一定要有，頁面沒圖不准算過（拿舊的 out/ 跑會在這裡紅，不會默默略過）。
 * 同一張地圖連寫兩步只放一張，所以比的是「清單的地圖 = 頁面的地圖」，不是步驟數。
 * 網址寫死正式網域（og:image、canonical、JSON-LD）是對的：測試機也指正式機，這裡只查路徑，圖本身用當前網址抓。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromePort, outDir } from "./config.mjs";
import { start } from "./harness.mjs";

const BASE = process.argv[2] ?? "http://localhost:9485";
const OUT = outDir(process.argv[3], "article-page");
const PAGES = (process.argv[4] ?? "/guides/priest-31-50,/guides/berserker-31-50,/guides/hunter-31-50,/guides/assassin-31-50,/guides/bandit-31-50").split(",");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/job-articles/images.gen.json"), "utf8"));
const SITE = "https://maplehelper.tw";
/** 查圖有沒有破版用的寬度：手機、窄手機、電腦 */
const WIDTHS = [[390, 844, 3, true], [360, 640, 3, true], [1280, 720, 1, false]];
const DATE = /^\d{4}-\d{2}-\d{2}T00:00:00\+08:00$/;

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? "過" : "沒過"}  ${name}${!ok && detail ? `  ${detail}` : ""}`);
};

const { page, navigate, ev, close } = await start(OUT, chromePort(9503, process.argv[5]));
const viewport = (width, height, deviceScaleFactor, mobile) => page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile });

/** head 裡的 meta：同名的只取第一個 */
const READ_HEAD = `
  await __settle();
  const meta = key => document.head.querySelector('meta[property="' + key + '"], meta[name="' + key + '"]')?.getAttribute("content") ?? null;
  const keys = ["description", "robots", "og:type", "og:url", "og:title", "og:description", "og:image", "og:image:width", "og:image:height", "og:image:alt", "article:published_time", "article:modified_time", "twitter:card", "twitter:title", "twitter:image"];
  const parse = el => { try { return JSON.parse(el.textContent); } catch { return null; } };
  const html = document.documentElement.outerHTML;
  return {
    title: document.title,
    h1: document.querySelector("h1")?.textContent ?? "",
    canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
    meta: Object.fromEntries(keys.map(key => [key, meta(key)])),
    ldInHead: document.head.querySelectorAll('script[type="application/ld+json"]').length,
    ld: [...document.body.querySelectorAll('script[type="application/ld+json"]')].map(parse),
    leftoverToken: html.includes("{{"),
  };`;

/** 主圖 og 用的 jpg 真的開得起來，尺寸多少 */
const READ_JPG = src => `
  const res = await fetch(${JSON.stringify(src)});
  const type = res.headers.get("content-type");
  const bitmap = res.ok ? await createImageBitmap(await res.blob()) : null;
  return { status: res.status, type, w: bitmap?.width ?? 0, h: bitmap?.height ?? 0 };`;

/** 一路捲到底，lazy 的圖才會載；每張都等到載完或破圖 */
const READ_IMAGES = `
  await __settle();
  const step = Math.max(200, Math.floor(innerHeight * 0.7));
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo({ top: y, behavior: "instant" }); await __sleep(120); }
  scrollTo({ top: 0, behavior: "instant" });
  const images = [...document.images];
  await Promise.all(images.map(img => img.complete ? null : Promise.race([new Promise(done => { img.addEventListener("load", done); img.addEventListener("error", done); }), __sleep(8000)])));
  const src = img => new URL(img.currentSrc || img.src).pathname;
  return {
    total: images.length,
    broken: images.filter(img => !img.complete || img.naturalWidth === 0).map(src),
    hero: images.filter(img => /\\/hero\\.webp$/.test(src(img))).map(img => ({ w: img.naturalWidth, h: img.naturalHeight, attrW: img.getAttribute("width"), attrH: img.getAttribute("height"), loading: img.getAttribute("loading"), alt: img.getAttribute("alt"), fetchpriority: img.getAttribute("fetchpriority") })),
    author: images.filter(img => /\\/author\\.webp$/.test(src(img))).length,
    steps: images.filter(img => /\\/assets\\/guides\\/.*\\/\\d+\\.webp$/.test(src(img))).map(img => ({ map: src(img).split("/").pop().replace(".webp", ""), w: img.naturalWidth, h: img.naturalHeight, alt: img.getAttribute("alt") })),
    pageWidth: document.documentElement.scrollWidth,
    innerWidth,
  };`;

const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

try {
  for (const pathname of PAGES) {
    const slug = pathname.split("/").pop();
    const entry = MANIFEST[slug];
    const heroUrl = `${SITE}/assets/guides/${slug}/hero.jpg`;
    await viewport(...WIDTHS[0]);
    await navigate(`${BASE}${pathname}`);
    const head = await ev(READ_HEAD);
    const { meta, ld } = head;

    check(`${slug} 清單有這篇、有主圖`, Boolean(entry?.hero));
    check(`${slug} 標題、描述、代號換完`, head.title.includes(head.h1) && head.h1.length > 0 && Boolean(meta.description) && !head.leftoverToken, `title=${head.title}`);
    check(`${slug} canonical、og:url 是這一頁`, head.canonical === `${SITE}${pathname}` && meta["og:url"] === `${SITE}${pathname}`, `${head.canonical}、${meta["og:url"]}`);
    check(`${slug} robots 開大圖預覽`, /index/.test(meta.robots ?? "") && /max-image-preview:large/.test(meta.robots ?? ""), meta.robots);
    check(`${slug} og:type article`, meta["og:type"] === "article", meta["og:type"]);
    check(`${slug} og:image 是這篇主圖、寬高對清單`, meta["og:image"] === heroUrl && Number(meta["og:image:width"]) === entry?.hero?.w && Number(meta["og:image:height"]) === entry?.hero?.h && Boolean(meta["og:image:alt"]), `${meta["og:image"]} ${meta["og:image:width"]}×${meta["og:image:height"]}`);
    check(`${slug} og 日期帶台灣時區`, DATE.test(meta["article:published_time"] ?? "") && DATE.test(meta["article:modified_time"] ?? ""), `${meta["article:published_time"]}、${meta["article:modified_time"]}`);
    check(`${slug} twitter 大圖、同一張主圖`, meta["twitter:card"] === "summary_large_image" && meta["twitter:image"] === heroUrl, `${meta["twitter:card"]} ${meta["twitter:image"]}`);

    check(`${slug} JSON-LD 都解析得開、都在 body`, head.ldInHead === 0 && ld.length > 0 && ld.every(Boolean), `head ${head.ldInHead} 段、body ${ld.length} 段`);
    const article = ld.find(block => block?.["@type"] === "Article");
    const crumbs = ld.find(block => block?.["@type"] === "BreadcrumbList");
    const web = ld.find(block => block?.["@type"] === "WebPage");
    const org = block => block?.["@type"] === "Organization" && block?.name === "楓谷幫手";
    check(`${slug} Article：標題、描述、圖、網址`, article?.headline === head.h1 && article?.description === meta.description && article?.image?.[0] === heroUrl && article?.mainEntityOfPage?.["@id"] === `${SITE}${pathname}`, JSON.stringify(article)?.slice(0, 200));
    check(`${slug} Article：作者、發布者是站，不是虛構寫手`, org(article?.author) && org(article?.publisher), JSON.stringify(article?.author));
    check(`${slug} Article：日期帶台灣時區`, DATE.test(article?.datePublished ?? "") && DATE.test(article?.dateModified ?? ""), `${article?.datePublished}、${article?.dateModified}`);
    check(`${slug} 麵包屑四層到這一頁`, crumbs?.itemListElement?.length === 4 && crumbs.itemListElement.at(-1).item === `${SITE}${pathname}`, JSON.stringify(crumbs?.itemListElement?.map(item => item.name)));
    check(`${slug} WebPage 有網址跟更新日`, web?.url === `${SITE}${pathname}` && DATE.test(web?.dateModified ?? ""), `${web?.url} ${web?.dateModified}`);

    const jpg = await ev(READ_JPG(`${BASE}/assets/guides/${slug}/hero.jpg`));
    check(`${slug} hero.jpg 開得起來、尺寸對清單、寬至少 1200、16:9`, jpg.status === 200 && /image\/jpeg/.test(jpg.type ?? "") && jpg.w === entry?.hero?.w && jpg.h === entry?.hero?.h && jpg.w >= 1200 && Math.abs(jpg.w / jpg.h - 16 / 9) < 0.01, JSON.stringify(jpg));

    for (const [index, size] of WIDTHS.entries()) {
      if (index > 0) {
        await viewport(...size);
        await navigate(`${BASE}${pathname}`);
      }
      const images = await ev(READ_IMAGES);
      const label = `${slug} ${size[0]} 寬`;
      check(`${label} 圖全部載入`, images.total > 0 && images.broken.length === 0, `破 ${images.broken.join("、")}`);
      check(`${label} 頁面不橫捲`, images.pageWidth <= images.innerWidth, `頁寬 ${images.pageWidth}、視窗 ${images.innerWidth}`);
      if (index === 0) {
        const hero = images.hero[0];
        check(`${slug} 主圖只有一張、真實尺寸對清單、不 lazy、high priority、有替代文字`, images.hero.length === 1 && hero.w === entry?.hero?.w && hero.h === entry?.hero?.h && Number(hero.attrW) === hero.w && Number(hero.attrH) === hero.h && hero.loading !== "lazy" && hero.fetchpriority === "high" && Boolean(hero.alt), JSON.stringify(images.hero));
        check(`${slug} 有寫手小頭像`, images.author === 1, `${images.author} 張`);
        const wanted = Object.keys(entry?.steps ?? {});
        const got = images.steps.map(step => step.map);
        check(`${slug} 路線卡圖跟清單一樣，沒有重複`, sameSet(wanted, got), `清單 ${wanted.join("、")}；頁面 ${got.join("、")}`);
        check(`${slug} 路線卡圖尺寸對清單、有替代文字`, images.steps.every(step => step.w === entry?.steps?.[step.map]?.w && step.h === entry?.steps?.[step.map]?.h && Boolean(step.alt)), JSON.stringify(images.steps));
      }
    }
  }
} finally {
  await close();
}
const failed = results.filter(result => !result.ok);
console.log(`${results.length - failed.length}/${results.length} 過`);
if (failed.length) process.exit(1);
