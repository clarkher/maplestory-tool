/**
 * 改版整理：比對兩份 build.mjs 的輸出，寫出這一版的差異檔，並更新索引。
 *
 * 用法：
 *   node pipeline/build-patch.mjs --old <舊資料夾> --new <新資料夾> --out <輸出資料夾> \
 *     --version <新版> --prev <舊版> --base <上游舊 commit> --head <上游新 commit> --date <YYYY-MM-DD>
 *
 * 資料夾裡要有 items.json、quests.json、monsters.json、maps.json（build.mjs 的輸出）。
 * 寫出 <out>/<version>.json 與 <out>/index.json（同版本重跑會整筆換掉）。
 * 版本號只收 [0-9A-Za-z.+-]、最長 32 字，不符就丟錯、不寫任何檔。
 */
import path from "node:path";
import { readJson, writeJson } from "./lib/http.mjs";
import { diffPatch } from "./lib/patch-diff.mjs";
import { upsertIndex, VERSION_RE } from "./lib/patch-index.mjs";

const REQUIRED = ["old", "new", "out", "version", "prev", "base", "head", "date"];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k?.startsWith("--") || argv[i + 1] === undefined) throw new Error(`參數錯誤：${k ?? ""}`);
    args[k.slice(2)] = argv[i + 1];
  }
  for (const k of REQUIRED) if (!args[k]) throw new Error(`缺少 --${k}`);
  return args;
}

function load(dir) {
  const get = name => {
    const v = readJson(path.join(dir, name));
    if (v === null) throw new Error(`找不到 ${path.join(dir, name)}`);
    return v;
  };
  return { items: get("items.json"), quests: get("quests.json"), monsters: get("monsters.json"), maps: get("maps.json") };
}

try {
  const a = parseArgs(process.argv.slice(2));
  for (const k of ["version", "prev"]) {
    if (!VERSION_RE.test(a[k])) throw new Error(`--${k} 格式不符：${a[k]}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) throw new Error(`--date 要是 YYYY-MM-DD：${a.date}`);
  const diff = diffPatch(load(a.old), load(a.new));
  const meta = { version: a.version, prev: a.prev, base: a.base, head: a.head, date: a.date };
  writeJson(path.join(a.out, `${a.version}.json`), { ...meta, ...diff });
  const indexPath = path.join(a.out, "index.json");
  writeJson(indexPath, upsertIndex(readJson(indexPath, { versions: [] }), { ...meta, counts: diff.counts }));
  console.log(`改版 ${a.version}：${JSON.stringify(diff.counts)}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
