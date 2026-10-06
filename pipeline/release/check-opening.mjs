/**
 * 找某一天的開機公告，給 .github/workflows/release-on-open.yml 用。
 * 用法：node pipeline/release/check-opening.mjs --date 2026/10/15 [--bulletin 83836]
 *   --bulletin：演練用，直接拿那一則公告（不看日期，只看是不是開機公告）
 * 輸出：一行 JSON {found, id, title}；有 GITHUB_OUTPUT 時另外寫 found／id／title。
 */
import fs from "node:fs";
import { fetchBulletin, fetchBulletins, findOpening, isOpeningTitle } from "./opening.mjs";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

const date = arg("date");
const bulletin = arg("bulletin");
if (!date && !bulletin) throw new Error("要給 --date YYYY/MM/DD 或 --bulletin 公告編號");

let hit = null;
if (bulletin) {
  const row = await fetchBulletin(bulletin);
  hit = row && isOpeningTitle(row.title) ? row : null;
} else {
  hit = findOpening(await fetchBulletins({ pageSize: 30 }), date);
}

const result = { found: Boolean(hit), id: hit?.bullentinId ?? "", title: hit?.title ?? "" };
console.log(JSON.stringify(result));
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `found=${result.found}\nid=${result.id}\ntitle=${result.title.replace(/\r?\n/g, " ")}\n`);
}
