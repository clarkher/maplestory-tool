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
 *
 * 上游 2026-08-05（commit 7c7f77c）起不再把 drops.json 放進 repo（改列 .gitignore），
 * 資料拆成 GitHub Pages 直接載入的幾支 JS（`window.MS_DROP_DB = {...};`）。
 * 內容還是同一套結構，只是分檔，所以這裡把它們組回原本的單一 payload。
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

/** 上游分檔：哪支檔、裡面的全域變數名、要搬到 payload 的哪個欄位。 */
const UPSTREAM_PARTS = [
  { file: "data.js", global: "MS_DROP_DB", fields: { monsters: "monsters" } },
  { file: "items-data.js", global: "MS_ITEM_DB", fields: { items: "items" } },
  { file: "quests-data.js", global: "MS_QUEST_DB", fields: { quests: "quests" } },
  { file: "skills-data.js", global: "MS_SKILL_DB", fields: { skills: "skills", skillStatLabels: "statLabels" } },
];

/**
 * 只鏡像這幾個圖檔目錄（就是 2026-08 時鏡像過來的那一批）。
 * 上游的 assets/ 後來長到 500MB 以上，光 map_renders 就 342MB，
 * 整包搬會把 repo 跟 Vercel 部署一起撐爆。
 */
const ASSET_DIRS = [
  "items", "map_marks", "map_regions", "maps", "meso",
  "monster_frames", "monsters", "npcs", "skills", "world_maps",
];
const ASSET_FILES = ["msw_icon_manifest.json"];

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

  const payload = assembleUpstream();
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
 * 把上游分檔組回單一 payload。
 * 各檔的抽檔時間不一定一樣（對方會只重抽其中幾支），metadata 取最新的那支，
 * 這樣任何一支更新都會讓 CI 的版本比對看到變化；每支各自的版本另外記在 parts。
 */
function assembleUpstream() {
  const payload = { parts: {} };
  let newest = null;
  for (const part of UPSTREAM_PARTS) {
    const db = readPagesData(path.join(CACHE_DIR, part.file), part.global);
    for (const [target, sourceKey] of Object.entries(part.fields)) {
      const value = db[sourceKey];
      if (value === undefined) throw new Error(`上游 ${part.file} 沒有 ${sourceKey} 欄位，格式可能改了`);
      payload[target] = value;
    }
    payload.parts[part.file] = db.metadata ?? null;
    const at = Date.parse(db.metadata?.generatedAt ?? "");
    if (Number.isFinite(at) && (!newest || at > newest.at)) newest = { at, metadata: db.metadata };
  }
  if (!newest) throw new Error("上游各檔都沒有 metadata.generatedAt，無法比對版本");
  payload.metadata = newest.metadata;
  return payload;
}

/**
 * 讀 `window.NAME = {...};` 形式的資料檔。
 * 只剝掉賦值外殼再 JSON.parse，不執行對方的 JS —— 這是別人 repo 的檔案。
 */
function readPagesData(file, expectedGlobal) {
  if (!fs.existsSync(file)) throw new Error(`上游 repo 沒有 ${path.basename(file)}，格式可能改了`);
  const source = fs.readFileSync(file, "utf8");
  const match = /^\s*window\.(\w+)\s*=\s*/.exec(source);
  if (!match || match[1] !== expectedGlobal) {
    throw new Error(`上游 ${path.basename(file)} 開頭不是 window.${expectedGlobal} =，格式可能改了`);
  }
  try {
    return JSON.parse(source.slice(match[0].length).replace(/;\s*$/, ""));
  } catch (error) {
    throw new Error(`上游 ${path.basename(file)} 不是純 JSON 資料：${error.message}`);
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
  for (const dir of ASSET_DIRS) {
    if (!fs.existsSync(path.join(source, dir))) {
      console.log(`[artale] 上游沒有 assets/${dir}，保留現有圖檔`);
      continue;
    }
    execFileSync("rsync", ["-a", "--delete", `${source}/${dir}/`, `${ASSET_DEST}/${dir}/`], { stdio: "inherit" });
  }
  for (const file of ASSET_FILES) {
    if (fs.existsSync(path.join(source, file))) fs.copyFileSync(path.join(source, file), path.join(ASSET_DEST, file));
  }
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
