// 台服經典版客戶端（Unity）資料抽取，用法見 README「客戶端技能數值」；2026-10-24 v1.15 抽任務接取條件裡「身上不能有」的道具用
// 客戶端任務的接取條件（Check 物件 <任務 id>/0/item）每一筆有 id、count：count 沒寫或寫 0＝身上要有 0 個＝不能有這件道具才接得到
// （完成條件 <任務 id>/1/item 每筆都有寫 count）。上游把沒寫的補成 1，站上就寫成「身上要有」——瑪亞愛情象徵要「身上要有」自己的獎勵、
// 尋找皺摺的紙片要「身上要有」劇情說弄丟的紙片，都是反的。buildQuests 照這份把那幾件搬到 startNone（pipeline/lib/quest-client.mjs）。
// 用法：node quest-start-none.mjs <raw.bin（decomp.mjs 解出來的）> [輸出，預設 data/client/quest-start-none.json]
//   bundle 是 aa/w/json_*.bundle 裡有 WZJS 物件「Check」的那一包（1.15.3 是 json_d0204d274fe26485ef82614de81bd4d4.bundle）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listObjects } from "./listobj.mjs";
import { decodeBody } from "./wzjs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [, , raw, out = path.join(ROOT, "data", "client", "quest-start-none.json")] = process.argv;
const data = fs.readFileSync(raw);
const obj = listObjects(data).objs.find(o => o.name === "Check" && o.body !== undefined);
if (!obj) throw new Error("bundle 裡找不到 WZJS 物件「Check」：檔名可能改了，找 aa/w/json_*.bundle 裡有 Check 的那一包（listobj.mjs <解好的檔> Check）");
const check = decodeBody(data.subarray(obj.body, obj.off + obj.size)).root[1];

const none = {};
const known = [];
for (const id of Object.keys(check).sort((a, b) => Number(a) - Number(b))) {
  const items = Object.values(check[id]?.["0"]?.item ?? {});
  if (!items.length) continue;
  known.push(Number(id));
  const ids = items.filter(item => !item.count).map(item => item.id);
  if (ids.length) none[id] = ids;
}
// 一筆都沒有＝客戶端改版、欄位名變了：別寫出空檔（站上又會變回「身上要有」），先停下來看
if (!known.length) throw new Error("Check 裡一個任務的接取道具都沒找到：先用 wzjs.mjs <解好的檔> Check 1115 看欄位名是不是改了");

fs.writeFileSync(
  out,
  JSON.stringify(
    {
      _source:
        "台服《新楓之谷：經典版》客戶端 1.15.3（使用者本機 D:/屁哥/maplestory_classic）StreamingAssets/aa/w/json_d0204d274fe26485ef82614de81bd4d4.bundle 的 WZJS 物件 Check，" +
        "<任務 id>/0/item 裡 count 沒寫或寫 0 的道具（身上要有 0 個＝不能有），2026-10-24 用 scripts/client/quest-start-none.mjs 抽出（README「客戶端技能數值」）。" +
        "known 是客戶端有寫接取道具的任務：站上要道具才接得到、卻不在 known 裡的任務（客戶端比上游舊），建置照上游寫「身上要有」並印出來。",
      none,
      known,
    },
    null,
    2,
  ) + "\n",
);
console.log(`身上不能有：${Object.keys(none).length} 個任務（客戶端有接取道具的 ${known.length} 個）→ ${out}`);
