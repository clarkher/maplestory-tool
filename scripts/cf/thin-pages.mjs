/**
 * 字太少的資料單獨頁不給搜尋引擎收（v2.43，11/19 AdSense 退件「缺乏價值的內容」，使用者拍板 A 先藏薄頁）。
 *
 * build:cf 建完 out/ 之後跑：量 out/db/<類別>/<編號>.html 的 <main> 有幾個看得到的字（不算 script、空白），
 * 不到 THIN_MIN_CHARS 的頁把 robots meta 改成 noindex、從 out/sitemap.xml 拿掉。頁面照常能看、站內照常連得到。
 * 量的是建好的頁，所以資料更新後哪頁變厚（例如多了掉落、任務）下次建置就自動放回去，不用維護清單。
 * 11/19 抽樣：道具平均 191 字、地圖 234、NPC 263、技能 295；任務 783、怪物 554，約 2,600 頁會被藏。
 *
 * 單獨跑（量 build:cf 產出、不改檔）：node scripts/cf/thin-pages.mjs --dry-run
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const THIN_MIN_CHARS = 300;
const ROBOTS_META = /<meta name="robots" content="[^"]*"\s*\/?>/;
const NOINDEX_META = '<meta name="robots" content="noindex, follow"/>';
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

/** <main> 裡看得到的字數（不算空白）；沒有 <main> 就量整頁 body */
export function mainTextLength(html) {
  const main = html.match(/<main[\s>][\s\S]*<\/main>/)?.[0] ?? html;
  const text = main
    .replace(/<(script|style|template)[\s>][\s\S]*?<\/\1>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name) => ENTITIES[name])
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
  return text.replace(/\s/g, "").length;
}

/** 資料單獨頁：out/db/<類別>/<編號>.html（清單頁 out/db/<類別>.html 不算） */
function detailPages(outDir) {
  const db = join(outDir, "db");
  if (!existsSync(db)) return [];
  const pages = [];
  for (const kind of readdirSync(db, { withFileTypes: true })) {
    if (!kind.isDirectory()) continue;
    for (const file of readdirSync(join(db, kind.name))) {
      if (file.endsWith(".html")) pages.push({ file: join(db, kind.name, file), path: `/db/${kind.name}/${file.slice(0, -5)}` });
    }
  }
  return pages;
}

/** 回傳 { checked: 量了幾頁, hidden: 藏起來的網址路徑（排序過） } */
export function hideThinPages(outDir, { dryRun = false } = {}) {
  const pages = detailPages(outDir);
  const hidden = [];
  for (const { file, path } of pages) {
    const html = readFileSync(file, "utf8");
    if (mainTextLength(html) >= THIN_MIN_CHARS) continue;
    if (!ROBOTS_META.test(html)) throw new Error(`${path} 找不到 robots meta，藏不起來（全站 robots 設定改了？）`);
    hidden.push(path);
    if (!dryRun) writeFileSync(file, html.replace(ROBOTS_META, NOINDEX_META));
  }
  hidden.sort();
  const sitemap = join(outDir, "sitemap.xml");
  if (!dryRun && hidden.length && existsSync(sitemap)) {
    const drop = new Set(hidden.map(path => decodeURIComponent(path)));
    const xml = readFileSync(sitemap, "utf8").replace(/<url>[\s\S]*?<\/url>\n?/g, block => {
      const loc = block.match(/<loc>https?:\/\/[^/<]+([^<]*)<\/loc>/)?.[1];
      return loc && drop.has(decodeURIComponent(loc)) ? "" : block;
    });
    writeFileSync(sitemap, xml);
  }
  return { checked: pages.length, hidden };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "out");
  const { checked, hidden } = hideThinPages(out, { dryRun: process.argv.includes("--dry-run") });
  const byKind = {};
  for (const path of hidden) byKind[path.split("/")[2]] = (byKind[path.split("/")[2]] ?? 0) + 1;
  console.log(`[thin-pages] 量 ${checked} 頁，不到 ${THIN_MIN_CHARS} 字 ${hidden.length} 頁`, byKind);
}
