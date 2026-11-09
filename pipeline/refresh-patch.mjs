/**
 * 資料自動更新時重算「目前這一版」的改版差異（data-refresh.yml 在 build.mjs 之後、verify.mjs 之前跑）。
 *
 * 用法：
 *   node pipeline/refresh-patch.mjs --upstream <看得到歷史的上游 git 資料夾> [--head <sha>] \
 *     [--new public/data] [--out public/data/patches] [--raw data/raw/artale.json]
 *
 *  - 目前版本：--raw（fetch-artale.mjs 寫的 artale.json）的 metadata.gameVersion
 *  - --head：上游看到哪個 commit 為止，要跟產生 --raw 的那份上游一樣（CI 傳 data/cache/upstream 的 HEAD）；
 *    沒給就用 --upstream 的 HEAD
 *  - 前一版：上游歷史裡前一個不同版號的段落（lib/patch-run.mjs，區間由近到遠放大），把它最後一個 commit 重建到暫存資料夾，
 *    跟 --new（剛建好的網站資料）跑 build-patch.mjs。口徑跟 backfill-patches.mjs 一樣（base／head／date 同一套）
 *  - 找不到前一版、上游最新版號跟 artale.json 對不上、artale.json 是本機抽檔：印一行跳過、結束碼 0（不擋資料更新）
 *
 * 輸出只跟輸入有關（上游 commit、網站資料、程式）：同樣的輸入重跑，差異檔與 index.json 一個位元組都不變。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION_RE } from "./lib/patch-index.mjs";
import { findCurrentAndPrevious, runBuildPatch } from "./lib/patch-run.mjs";
import { buildAt } from "./lib/upstream-history.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA = /^[0-9a-f]{40}$/;
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const upstream = opt("upstream");
if (!upstream) {
  console.error("用法：node pipeline/refresh-patch.mjs --upstream <git 資料夾> [--head <sha>] [--new <資料夾>] [--out <資料夾>] [--raw <artale.json>]");
  process.exit(2);
}
const newDir = path.resolve(ROOT, opt("new", "public/data"));
const out = path.resolve(ROOT, opt("out", "public/data/patches"));
const rawFile = path.resolve(ROOT, opt("raw", "data/raw/artale.json"));

const skip = (why) => {
  console.log(`改版差異跳過：${why}`);
  process.exit(0);
};

// 只當文字讀、自己 JSON.parse（不用 require）
const raw = JSON.parse(fs.readFileSync(rawFile, "utf8"));
if (raw.ingest?.origin === "local") skip("這次用的是本機抽檔，不是上游的某一版");
const version = raw.metadata?.gameVersion;
if (typeof version !== "string" || !VERSION_RE.test(version)) {
  console.error(`artale.json 的遊戲版本格式不對：${JSON.stringify(version)}`);
  process.exit(1);
}

const head = opt("head") ?? execFileSync("git", ["-C", upstream, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!SHA.test(head)) {
  console.error(`--head 要是 40 碼 commit：${JSON.stringify(head)}`);
  process.exit(1);
}

const t0 = Date.now();
const { seg, prev, since, mismatch } = findCurrentAndPrevious(upstream, version, { ref: head });
const range = since ? `${since} 起` : "全部歷史";
if (mismatch) skip(`上游（${head.slice(0, 8)}）最新是 ${mismatch}，跟 artale.json 的 ${version} 對不上`);
if (!seg) skip(`上游歷史（${range}）找不到 ${version}`);
if (!prev) skip(`${version} 找不到前一版（上游歷史${range}只有這一版）`);
console.log(`目前 ${version}（${seg.first.date} 起，${seg.last.commit.slice(0, 8)}），前一版 ${prev.version}（${prev.last.commit.slice(0, 8)}），查歷史 ${range}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maple-patch-prev-"));
try {
  buildAt(upstream, prev.last.commit, tmp);
  console.log(runBuildPatch({ prev, seg, oldDir: tmp, newDir, out }));
  console.log(`改版差異完成，${Math.round((Date.now() - t0) / 1000)} 秒 → ${path.relative(ROOT, out)}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
