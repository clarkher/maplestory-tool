/**
 * 讀上游資料庫（morrisrrrrrrr-svg.github.io）發佈的資料檔。
 *
 * 上游把資料拆成六個給網頁直接載入的檔案，每個檔都是一行 `window.名稱 = {JSON};`。
 * 2026-08-05 以前 repo 裡還有一份合併好的 drops.json，之後上游把它當成建置中間產物
 * 移出版控（.gitignore），排程因此連續失敗了兩個月。這裡把六個檔併回同一個結構，
 * 下游 build.mjs 不用跟著改。
 *
 * 用法：
 *   import { readUpstream } from "./lib/upstream.mjs";
 *   const payload = readUpstream("data/cache/upstream"); // { metadata, monsters, items, quests, skills, ... }
 */
import fs from "node:fs";
import path from "node:path";

/**
 * 每個檔案要拿哪些欄位、放到合併結構的哪個名字底下。
 * required 是 build.mjs 真的會讀的；地圖那兩份目前沒用到，缺了不該讓整條管線停擺。
 */
export const UPSTREAM_PARTS = [
  { file: "data.js", global: "MS_DROP_DB", required: true, take: { monsters: "monsters", mapClassificationReview: "mapClassificationReview" }, mustHave: ["monsters"] },
  { file: "items-data.js", global: "MS_ITEM_DB", required: true, take: { items: "items" }, mustHave: ["items"] },
  { file: "quests-data.js", global: "MS_QUEST_DB", required: true, take: { quests: "quests" }, mustHave: ["quests"] },
  { file: "skills-data.js", global: "MS_SKILL_DB", required: true, take: { skills: "skills", statLabels: "skillStatLabels" }, mustHave: ["skills"] },
  { file: "maps-data.js", global: "MS_MAP_DB", required: false, take: { maps: "maps" }, mustHave: [] },
  { file: "worldmaps-data.js", global: "MS_WORLD_MAP_DB", required: false, take: { worldMaps: "worldMaps" }, mustHave: [] },
];

/**
 * 把 `window.名稱 = {JSON};` 解成物件。
 * 內容是純 JSON，直接解析就好——不要用 eval／vm 去執行別人 repo 裡的東西，
 * 這支會在帶著寫入權限的 CI 裡跑。
 */
export function parseUpstreamScript(text, globalName, file) {
  const prefix = new RegExp(`^\\s*window\\.${globalName}\\s*=\\s*`);
  const match = text.match(prefix);
  if (!match) throw new Error(`上游 ${file} 開頭不是「window.${globalName} = 」，格式可能改了`);
  const body = text.slice(match[0].length).replace(/;\s*$/, "");
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`上游 ${file} 的內容不是純 JSON，格式可能改了（${error.message}）`);
  }
}

/**
 * 六份併成一份，結構與舊的 drops.json 相同。
 *
 * 各檔的版本與產生時間不一定相同（2026-09-24 實測：data.js 是 1.15.1，items-data.js 是 1.15.2）。
 * 整份資料的版本取最新產生的那個檔——排程就是拿這個時間戳判斷要不要重建，
 * 取最新的才不會漏掉「只有道具檔更新」這種情況。各檔自己的版本留在 metadata.parts。
 */
export function assembleUpstream(parts) {
  const payload = {};
  const filters = {};
  const partVersions = {};
  let newest = null;

  for (const spec of UPSTREAM_PARTS) {
    const part = parts[spec.file];
    if (!part) {
      if (spec.required) throw new Error(`上游少了 ${spec.file}，格式可能改了`);
      continue;
    }
    for (const key of spec.mustHave) {
      if (!Array.isArray(part[key]) || !part[key].length) {
        throw new Error(`上游 ${spec.file} 的 ${key} 是空的或不見了，格式可能改了`);
      }
    }
    for (const [from, to] of Object.entries(spec.take)) {
      if (part[from] !== undefined) payload[to] = part[from];
    }
    Object.assign(filters, part.filters);

    const metadata = part.metadata || {};
    partVersions[spec.file] = { gameVersion: metadata.gameVersion ?? null, generatedAt: metadata.generatedAt ?? null };
    const stamp = Date.parse(metadata.generatedAt ?? "");
    if (Number.isFinite(stamp) && (!newest || stamp > newest.stamp)) newest = { stamp, metadata };
  }
  if (!newest) throw new Error("上游每個檔都沒有 metadata.generatedAt，沒辦法判斷資料版本");

  // 這三個欄位舊的 drops.json 是跟著怪物檔走的
  const base = parts["data.js"];
  return {
    generatedFrom: base.generatedFrom,
    source: base.source,
    metadata: { ...newest.metadata, parts: partVersions },
    summary: base.summary,
    filters,
    ...payload,
  };
}

/** 從上游 repo 的資料夾讀出合併後的資料。 */
export function readUpstream(dir) {
  const parts = {};
  for (const spec of UPSTREAM_PARTS) {
    const filePath = path.join(dir, spec.file);
    if (!fs.existsSync(filePath)) {
      if (spec.required) throw new Error(`上游 repo 沒有 ${spec.file}，格式可能改了`);
      continue;
    }
    parts[spec.file] = parseUpstreamScript(fs.readFileSync(filePath, "utf8"), spec.global, spec.file);
  }
  return assembleUpstream(parts);
}
