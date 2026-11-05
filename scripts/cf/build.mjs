/**
 * Cloudflare 建置：整站靜態輸出到 out/（網頁＋public），道具圖另外放 .cf-items/（給 maplehelper-items Worker）。
 *
 * 用法：APP_ENV=preview|production node scripts/cf/build.mjs（npm run build:cf）
 *   - APP_ENV 寫進程式當環境名稱（練功測速驗收掛勾只在非 production 開），沒給就 preview
 *   - API（src/app/api）在 Cloudflare 由 cf/worker.ts 直接 import 跑，靜態輸出不收：建置時先搬到 .cf-stash/，建完一定搬回來；
 *     上次建到一半被砍、api 還在 .cf-stash/ 的話，開頭先搬回來
 *   - Cloudflare 免費方案一個 Worker 版本最多 20,000 個靜態檔：道具圖（約 1.7 萬張）拆去 .cf-items/，out/ 超過 19,500 檔就失敗
 *   - 快取規則（cache-headers.mjs）寫成 out/_headers；不是 production 的再加整站 X-Robots-Tag: noindex
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CACHE_HEADERS } from "../../cache-headers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const API = join(ROOT, "src", "app", "api");
const STASH = join(ROOT, ".cf-stash", "api");
const OUT = join(ROOT, "out");
const ITEMS_OUT = join(ROOT, ".cf-items");
export const MAX_FILES = 19_500;

/** next.config 的 headers 規則 → Cloudflare _headers。後面的規則要蓋掉前面的同名標頭：Cloudflare 會把多條命中的值串起來，所以先「! 名稱」拿掉 */
export function toHeadersFile(rules, { noindex = false } = {}) {
  const seen = new Set();
  return rules
    .map(rule => {
      const lines = [rule.source.replace(/:path\*$/, "*")];
      for (const { key, value } of rule.headers) {
        if (seen.has(key)) lines.push(`  ! ${key}`);
        lines.push(`  ${key}: ${value}`);
      }
      for (const { key } of rule.headers) seen.add(key);
      return lines.join("\n");
    })
    .join("\n\n") + "\n" + (noindex ? "\n/*\n  X-Robots-Tag: noindex\n" : "");
}

function countFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) n += entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1;
  return n;
}

/**
 * 道具單獨頁只留 html：一頁本來 5 個檔（txt、__next 分段），1,843 頁會吃掉快 1 萬個額度。
 * 連到這些頁的地方都用一般連結整頁載入，用不到分段。清單頁自己的 __next 檔不動。回傳處理了幾頁。
 */
export function trimItemPageFiles(outDir) {
  const dir = join(outDir, "db", "items");
  let pages = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && /^\d+$/.test(entry.name)) {
      rmSync(join(dir, entry.name), { recursive: true, force: true });
      pages += 1;
    } else if (/^\d+\.txt$/.test(entry.name)) {
      rmSync(join(dir, entry.name), { force: true });
    }
  }
  return pages;
}

function restoreApi() {
  if (existsSync(STASH) && !existsSync(API)) renameSync(STASH, API);
}

function main() {
  restoreApi();
  const env = { ...process.env, CF_STATIC: "1", APP_ENV: process.env.APP_ENV || "preview" };
  mkdirSync(dirname(STASH), { recursive: true });
  renameSync(API, STASH);
  let status;
  try {
    rmSync(OUT, { recursive: true, force: true });
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    status = spawnSync(npx, ["next", "build"], { cwd: ROOT, env, stdio: "inherit", shell: process.platform === "win32" }).status;
  } finally {
    restoreApi();
  }
  if (status !== 0) process.exit(status ?? 1);

  const trimmed = trimItemPageFiles(OUT);
  console.log(`[build:cf] 道具單獨頁 ${trimmed} 頁只留 html`);
  rmSync(ITEMS_OUT, { recursive: true, force: true });
  mkdirSync(join(ITEMS_OUT, "assets"), { recursive: true });
  renameSync(join(OUT, "assets", "items"), join(ITEMS_OUT, "assets", "items"));
  // 測試機（APP_ENV 不是 production）整站叫搜尋引擎別收，不然 workers.dev 的網址會跟正式網域搶收錄（Vercel 的預覽網址是它自己擋的）
  writeFileSync(join(OUT, "_headers"), toHeadersFile(CACHE_HEADERS, { noindex: env.APP_ENV !== "production" }));
  writeFileSync(join(ITEMS_OUT, "_headers"), toHeadersFile(CACHE_HEADERS.filter(rule => rule.source.startsWith("/assets/"))));

  const files = countFiles(OUT);
  const items = countFiles(ITEMS_OUT);
  console.log(`[build:cf] APP_ENV=${env.APP_ENV} out/ ${files} 檔、.cf-items/ ${items} 檔（上限各 ${MAX_FILES}）`);
  if (files > MAX_FILES || items > MAX_FILES) {
    console.error("[build:cf] 靜態檔超過 Cloudflare 免費方案上限（一版 20,000 檔），要再拆");
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
