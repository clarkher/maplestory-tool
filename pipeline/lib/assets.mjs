/**
 * 上游圖檔怎麼鏡像進 public/assets：只收前端用得到的副檔名、只收一般檔案。
 *
 * 上游是第三方 repo，資料更新會把同步下來的檔案 commit 進來、自動合進 main，從正式機的網域提供出去。
 * 它要是放進 .svg、.html 這類網頁檔，有人點開就會用我們網站的身分跑對方寫的腳本（stored XSS）；
 * 放捷徑（symlink）則可能指到 runner 上別的檔案（例如帶著 token 的 .git/config），一起被 commit 出去。
 *
 * 用法（pipeline/fetch-artale.mjs）：
 *   syncAssets("data/cache/upstream/assets", "public/assets", ASSET_DIRS);
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * 前端實際會載的圖檔目錄（src/lib/data.ts 的 monsterImage／itemImage／npcImage，以及技能圖）。
 * 上游的 assets 已經長到 500MB 以上（光整張地圖的渲染圖 map_renders 就 342MB），
 * 整包鏡像會把這個 repo 跟部署一起撐爆，所以只同步用得到的。
 */
export const ASSET_DIRS = ["items", "monster_frames", "npcs", "skills"];

/**
 * 副檔名白名單。前端只載 /assets/<目錄>/<id>.png；json 是上游每個目錄附的 summary.json，
 * 前端沒用到，留著讓鏡像跟上游一致。兩種瀏覽器都不會當網頁執行。
 * 前端要載新的圖檔格式再加；svg、html、htm、xhtml、xml、js 這類不要加。
 */
export const ASSET_EXTENSIONS = ["png", "json"];

/**
 * 把上游一個圖檔目錄（from）鏡像到 to 的 rsync 參數：
 *  - --no-links：捷徑一律跳過，不順著它去搬別處的檔案（-a 含 -l，要放在 -a 後面才關得掉）
 *  - 規則照順序比對、先中先贏：先擋掉所有子資料夾（前端只用最上層的 <id>.png；
 *    不擋的話 x.png/ 這種資料夾也會被白名單放進去），再收白名單副檔名，剩下的全部排除
 *  - --delete-excluded：網站裡原本就有、不在白名單的檔也清掉，跑完只剩白名單裡的副檔名
 */
export function assetRsyncArgs(from, to) {
  return [
    "-a",
    "--no-links",
    "--delete",
    "--delete-excluded",
    "--exclude=*/",
    ...ASSET_EXTENSIONS.map(ext => `--include=*.${ext}`),
    "--exclude=*",
    `${from}/`,
    `${to}/`,
  ];
}

/**
 * 把上游 assets（source）底下的 dirs 逐一鏡像到 dest。上游沒有的目錄保留網站現有的圖。
 * assets 或其中一個目錄本身是捷徑（或檔案）就直接失敗：rsync 的來源寫成「目錄/」會順著捷徑
 * 把它指到的整個地方搬進來，--no-links 管不到這一層。全部檢查完才開始搬，失敗時網站的圖一張都不動。
 */
export function syncAssets(source, dest, dirs, { log = console.log } = {}) {
  const sourceKind = kindOf(source);
  if (sourceKind === "missing") {
    log("[artale] 上游沒有 assets 目錄，跳過圖檔同步");
    return;
  }
  if (sourceKind !== "dir") throw new Error(notADirectory("assets"));

  const present = [];
  for (const name of dirs) {
    const kind = kindOf(path.join(source, name));
    if (kind === "missing") {
      log(`[artale] 上游沒有 assets/${name}，保留現有圖檔`);
      continue;
    }
    if (kind !== "dir") throw new Error(notADirectory(`assets/${name}`));
    present.push(name);
  }

  for (const name of present) {
    const to = path.join(dest, name);
    fs.mkdirSync(to, { recursive: true });
    execFileSync("rsync", assetRsyncArgs(path.join(source, name), to), { stdio: "inherit" });
    log(`[artale] 鏡像 assets/${name}：${countFiles(to)} 個檔案`);
  }
}

/** 看它本身（lstat，不順著捷徑）：沒有、一般資料夾、其他（捷徑、檔案）。 */
function kindOf(p) {
  try {
    return fs.lstatSync(p).isDirectory() ? "dir" : "other";
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
}

function notADirectory(where) {
  return `上游的 ${where} 不是一般資料夾（是捷徑或檔案）：照搬可能把別處的檔案帶進網站，這次不同步圖檔、不開 PR。`
    + `請到上游 repo 看 ${where} 為什麼變了`;
}

function countFiles(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  }
  return total;
}
