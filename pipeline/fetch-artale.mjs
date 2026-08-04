/**
 * 取得 Artale（新楓之谷經典版）客戶端匯出的遊戲資料。
 *
 * 雙軌設計：
 *  1. 本機抽檔（優先）— data/raw/artale.local.json。
 *     這是從你自己電腦上的 maplestory_classic.zip 抽出來的，資料最新也最可信。
 *  2. 上游 repo（備援）— morrisrrrrrrr-svg/morrisrrrrrrr-svg.github.io。
 *     對方會在遊戲改版後重跑他的抽檔工具，我們排程比對版本，有變才重建。
 *
 * 兩邊格式一樣（同一份 MonsterBook/Quest/Skill wzjson 結構），所以下游 build.mjs 不用分兩套。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { humanBytes } from "./lib/http.mjs";

const UPSTREAM = process.env.ARTALE_UPSTREAM
  || "https://github.com/morrisrrrrrrr-svg/morrisrrrrrrr-svg.github.io.git";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW_DIR = path.join(ROOT, "data", "raw");
const CACHE_DIR = path.join(ROOT, "data", "cache", "upstream");
const LOCAL_FILE = path.join(RAW_DIR, "artale.local.json");
const OUT_FILE = path.join(RAW_DIR, "artale.json");
const ASSET_DEST = path.join(ROOT, "public", "assets");

function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });

  if (fs.existsSync(LOCAL_FILE)) {
    const payload = JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
    stamp(payload, "local", LOCAL_FILE);
    console.log(`[artale] 使用本機抽檔：遊戲版本 ${payload.metadata?.gameVersion}，${payload.metadata?.generatedAtText}`);
    return;
  }

  console.log(`[artale] 本機無抽檔資料，改用上游：${UPSTREAM}`);
  syncUpstream();

  const dropsPath = path.join(CACHE_DIR, "drops.json");
  if (!fs.existsSync(dropsPath)) throw new Error("上游 repo 沒有 drops.json，格式可能改了");
  const payload = JSON.parse(fs.readFileSync(dropsPath, "utf8"));
  stamp(payload, "upstream", UPSTREAM);
  syncAssets();
  console.log(`[artale] 使用上游資料：遊戲版本 ${payload.metadata?.gameVersion}，${payload.metadata?.generatedAtText}`);
}

function syncUpstream() {
  if (fs.existsSync(path.join(CACHE_DIR, ".git"))) {
    execFileSync("git", ["-C", CACHE_DIR, "fetch", "--depth", "1", "origin", "main"], { stdio: "inherit" });
    execFileSync("git", ["-C", CACHE_DIR, "reset", "--hard", "origin/main"], { stdio: "inherit" });
  } else {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(CACHE_DIR), { recursive: true });
    execFileSync("git", ["clone", "--depth", "1", UPSTREAM, CACHE_DIR], { stdio: "inherit" });
  }
}

/**
 * 圖檔自己鏡像一份，不要熱連對方的 GitHub Pages —— 對方站掛掉我們不能跟著掛。
 */
function syncAssets() {
  const source = path.join(CACHE_DIR, "assets");
  if (!fs.existsSync(source)) {
    console.log("[artale] 上游沒有 assets 目錄，跳過圖檔同步");
    return;
  }
  fs.mkdirSync(ASSET_DEST, { recursive: true });
  execFileSync("rsync", ["-a", "--delete", `${source}/`, `${ASSET_DEST}/`], { stdio: "inherit" });
  const count = countFiles(ASSET_DEST);
  console.log(`[artale] 鏡像圖檔 ${count} 個檔案到 public/assets`);
}

function countFiles(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  }
  return total;
}

function stamp(payload, origin, ref) {
  payload.ingest = { origin, ref, fetchedAt: new Date().toISOString() };
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload));
  console.log(`[artale] 寫入 data/raw/artale.json（${humanBytes(fs.statSync(OUT_FILE).size)}）`);
}

main();
