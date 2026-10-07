import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ASSET_DIRS, ASSET_EXTENSIONS, assetRsyncArgs, syncAssets } from "./assets.mjs";

const ROOT = path.join(import.meta.dirname, "../..");
const quiet = { log() {} };

// 真的跑 rsync 的測試：CI（ubuntu）一定要跑，少了 rsync 就算失敗；本機沒有 rsync（Windows）才跳過
const HAS_RSYNC = spawnSync("rsync", ["--version"]).status === 0;
const NEEDS_RSYNC = { skip: !HAS_RSYNC && !process.env.CI && "這台沒有 rsync（CI 的 ubuntu 有，會在那裡跑）" };

/** 這個測試自己的暫存資料夾（跑完刪掉）；回傳在裡面開子資料夾的函式。 */
function scratch(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "maplebook-assets-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return name => {
    const dir = path.join(base, name);
    fs.mkdirSync(dir);
    return dir;
  };
}

function put(dir, name, body = name) {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

/** 目錄底下所有東西（檔案、資料夾、捷徑都算，不順著捷徑走）的相對路徑，排好序。 */
function listTree(dir) {
  return fs.readdirSync(dir, { recursive: true }).map(name => name.split(path.sep).join("/")).sort();
}

test("白名單只有 png 跟 json——svg、html 這類瀏覽器會當網頁跑的檔不能放進來", () => {
  assert.deepEqual(ASSET_EXTENSIONS, ["png", "json"]);
});

test("前端載的圖檔副檔名都在白名單裡", () => {
  // src 裡寫到 /assets/<同步的目錄>/… 的地方：data.ts 的 monsterImage 等、技能頁、查資料首頁的封面圖
  const dirs = ASSET_DIRS.join("|");
  const pattern = new RegExp(`/assets/(?:${dirs})/[^"'\`\\s]*?\\.([A-Za-z0-9]+)["'\`]`, "g");
  const used = new Set();
  for (const name of fs.readdirSync(path.join(ROOT, "src"), { recursive: true })) {
    if (!/\.tsx?$/.test(name)) continue;
    for (const match of fs.readFileSync(path.join(ROOT, "src", name), "utf8").matchAll(pattern)) used.add(match[1]);
  }
  assert.ok(used.size > 0, "src 裡應該找得到 /assets/… 的圖檔路徑");
  for (const ext of used) {
    assert.ok(ASSET_EXTENSIONS.includes(ext), `前端載 .${ext} 的圖，白名單沒有：下次資料更新會把它們全刪掉`);
  }
});

test("網站現有的圖檔都是白名單裡的一般檔案（改成白名單同步不會刪掉任何一張）", () => {
  for (const dir of ASSET_DIRS) {
    for (const entry of fs.readdirSync(path.join(ROOT, "public/assets", dir), { withFileTypes: true })) {
      const where = `public/assets/${dir}/${entry.name}`;
      assert.ok(entry.isFile(), `${where} 不是一般檔案`);
      assert.ok(ASSET_EXTENSIONS.includes(path.extname(entry.name).slice(1)), `${where} 不在白名單`);
    }
  }
});

test("rsync 參數：捷徑不收、子資料夾不進、白名單之外全排除，網站裡多出來的非白名單檔也清掉", () => {
  const args = assetRsyncArgs("/up/assets/items", "/site/assets/items");
  // -a 含 -l（照搬捷徑）；--no-links 要放在 -a 後面才關得掉
  assert.ok(args.indexOf("--no-links") > args.indexOf("-a"), "--no-links 要在 -a 後面");
  for (const follow of ["-l", "--links", "-L", "--copy-links", "--copy-unsafe-links", "-k", "--copy-dirlinks", "-K", "--keep-dirlinks"]) {
    assert.ok(!args.includes(follow), `不能有 ${follow}`);
  }
  // 規則照順序比對、先中先贏：先擋所有子資料夾（不然 x.png/ 這種資料夾會被白名單放進去），最後一條排除剩下的全部
  assert.deepEqual(args.filter(arg => /^--(?:in|ex)clude=/.test(arg)), [
    "--exclude=*/",
    "--include=*.png",
    "--include=*.json",
    "--exclude=*",
  ]);
  assert.ok(args.includes("--delete"), "上游刪掉的圖網站也要刪");
  assert.ok(args.includes("--delete-excluded"), "網站裡不在白名單的檔也要清掉");
  // 結尾斜線：搬的是資料夾裡面的東西
  assert.deepEqual(args.slice(-2), ["/up/assets/items/", "/site/assets/items/"]);
});

test("上游 assets 裡的目錄是捷徑：直接失敗，網站的圖一張都不動", t => {
  const dir = scratch(t);
  const up = dir("up");
  const site = dir("site");
  const elsewhere = dir("elsewhere"); // 捷徑指到的別處，例如 runner 上帶著 token 的 .git
  put(elsewhere, "token.json", "secret");
  put(up, "assets/items/100.png");
  fs.symlinkSync(elsewhere, path.join(up, "assets/npcs"), "junction");
  put(site, "items/1.png", "old");
  put(site, "npcs/2.png", "old");

  // items 排在前面也不能先搬：全部檢查完才開始動
  assert.throws(() => syncAssets(path.join(up, "assets"), site, ["items", "npcs"], quiet), /assets\/npcs.*捷徑/);
  assert.deepEqual(listTree(site), ["items", "items/1.png", "npcs", "npcs/2.png"]);
  assert.equal(fs.readFileSync(path.join(site, "items/1.png"), "utf8"), "old");
});

test("上游的 assets 本身是捷徑：直接失敗", t => {
  const dir = scratch(t);
  const up = dir("up");
  const site = dir("site");
  const elsewhere = dir("elsewhere");
  put(elsewhere, "items/100.png");
  fs.symlinkSync(elsewhere, path.join(up, "assets"), "junction");
  put(site, "items/1.png", "old");

  assert.throws(() => syncAssets(path.join(up, "assets"), site, ["items"], quiet), /assets.*捷徑/);
  assert.deepEqual(listTree(site), ["items", "items/1.png"]);
});

test("上游沒有某個目錄：網站現有的圖留著", t => {
  const dir = scratch(t);
  const up = dir("up");
  const site = dir("site");
  fs.mkdirSync(path.join(up, "assets"));
  put(site, "items/1.png", "old");
  const logs = [];

  syncAssets(path.join(up, "assets"), site, ["items"], { log: line => logs.push(line) });
  assert.deepEqual(listTree(site), ["items", "items/1.png"]);
  assert.match(logs.join("\n"), /上游沒有 assets\/items，保留現有圖檔/);
});

test("真的跑 rsync：只留最上層的 png、json，svg、html、捷徑、子資料夾都進不來，網站原本混進來的也清掉", NEEDS_RSYNC, t => {
  const dir = scratch(t);
  const up = dir("up");
  const site = dir("site");
  const outside = dir("outside");
  const items = path.join(up, "assets/items");
  put(items, "100.png", "png-bytes");
  put(items, "summary.json", "{}");
  put(items, "evil.svg", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
  put(items, "evil.html", "<script>alert(1)</script>");
  put(items, "evil.htm");
  put(items, "evil.xhtml");
  put(items, "evil.js");
  put(items, "README");
  put(items, "sub/200.png"); // 子資料夾
  put(items, "trap.png/300.png"); // 名字長得像圖的資料夾
  put(outside, "token.json", "secret"); // 捷徑指到的外面
  fs.symlinkSync(path.join(outside, "token.json"), path.join(items, "leak.json"));
  fs.symlinkSync(outside, path.join(items, "leakdir.png"));
  assert.ok(fs.lstatSync(path.join(items, "leak.json")).isSymbolicLink(), "測試資料要真的是捷徑");

  put(site, "items/100.png", "old"); // 上游有新的 → 更新
  put(site, "items/stale.png"); // 上游已經沒有 → 刪
  put(site, "items/old.svg"); // 以前混進來的非白名單檔 → 刪

  syncAssets(path.join(up, "assets"), site, ["items"], quiet);
  assert.deepEqual(listTree(path.join(site, "items")), ["100.png", "summary.json"]);
  assert.equal(fs.readFileSync(path.join(site, "items/100.png"), "utf8"), "png-bytes");
});
