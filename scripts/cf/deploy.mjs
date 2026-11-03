/**
 * Cloudflare 部署：先道具圖 Worker，再網頁＋API Worker（npm run deploy:cf／deploy:cf:dev）。
 *
 * 用法：node scripts/cf/deploy.mjs [--env dev]（先跑 npm run build:cf）
 *   Workers Builds 自動部署時會設 WRANGLER_CI_* 環境變數，把建置裡每一次 wrangler deploy 的名字都強制改成接 GitHub 的那個 Worker
 *   （maplehelper-dev）。道具圖那次如果照樣帶著，會被當成整個測試機部署上去——
 *   只有圖、沒有程式跟秘密，下一次部署網頁又沿用那版的空秘密，資料庫就斷了（11/03 v1.36 第一次自動部署踩到）。
 *   所以道具圖那次把 WRANGLER_CI_* 拿掉，用 cf/items.wrangler.jsonc 自己的名字；網頁那次照原樣。
 */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 拿掉 Workers Builds 強制改名的環境變數 */
export function withoutCiOverride(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("WRANGLER_CI_")));
}

function wrangler(args, env) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const { status } = spawnSync(npx, ["wrangler", ...args], { cwd: ROOT, env, stdio: "inherit", shell: process.platform === "win32" });
  if (status !== 0) process.exit(status ?? 1);
}

function main() {
  const envArgs = process.argv.slice(2);
  wrangler(["deploy", "-c", "cf/items.wrangler.jsonc", ...envArgs], withoutCiOverride(process.env));
  wrangler(["deploy", ...envArgs], process.env);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
