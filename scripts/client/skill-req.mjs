// 台服經典版客戶端（Unity）資料抽取，用法見 README「客戶端技能數值」；2026-10-08 v0.80 抽每個技能的所需技能（req）用
// 客戶端每個技能底下有 req：{ 所需技能 id: 等級 }。遊戲說明裡的所需技能有 20 個名字寫錯（「劍技專精」其實是精準之劍），
// 照名字找接不上，buildSkills 的 linkPrereqs 改照這份的 id 接（pipeline/lib/skill-text.mjs）。
// 用法：node skill-req.mjs <raw.bin（decomp.mjs 解出來的）> [輸出，預設 data/client/skill-req.json]
//   只收經典版有的職業（pipeline/lib/classic-jobs.mjs），物件名是職業代碼補零成 3 碼（初心者 000）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listObjects } from "./listobj.mjs";
import { decodeBody } from "./wzjs.mjs";
import { CLASSIC_JOB_IDS } from "../../pipeline/lib/classic-jobs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [, , raw, out = path.join(ROOT, "data", "client", "skill-req.json")] = process.argv;
const data = fs.readFileSync(raw);
const objs = listObjects(data).objs;

const req = {};
const missing = [];
for (const job of [...CLASSIC_JOB_IDS].sort((a, b) => a - b)) {
  const name = String(job).padStart(3, "0");
  const obj = objs.find(o => o.name === name && o.body !== undefined);
  if (!obj) {
    missing.push(name);
    continue;
  }
  const skills = decodeBody(data.subarray(obj.body, obj.off + obj.size)).root[1].skill ?? {};
  for (const id of Object.keys(skills).sort()) {
    if (skills[id].req) req[Number(id)] = Object.fromEntries(Object.entries(skills[id].req).map(([reqId, level]) => [Number(reqId), level]));
  }
}
if (missing.length) throw new Error(`bundle 裡找不到職業物件 ${missing.join("、")}：檔名可能改了，找 aa/w/json_*.bundle 裡有 WZJS 物件「500」的那一包`);

fs.writeFileSync(
  out,
  JSON.stringify(
    {
      _source:
        "台服《新楓之谷：經典版》客戶端 1.15.x（使用者本機 D:/屁哥/maplestory_classic）StreamingAssets/aa/w/json_ea789eaaa37ed8ffb144c59e8ca8d456.bundle 各職業物件的 skill/<id>/req（所需技能 id → 等級），" +
        "2026-10-08 用 scripts/client/skill-req.mjs 抽出（README「客戶端技能數值」）。只收經典版有的職業（pipeline/lib/classic-jobs.mjs）。" +
        "buildSkills 的 linkPrereqs 照這份接所需技能的連結：遊戲說明有 20 個名字寫錯（劍技專精＝精準之劍、劍士的恢復術＝生命恢復），照名字接不上。",
      req,
    },
    null,
    2,
  ) + "\n",
);
console.log(`所需技能：${Object.keys(req).length} 個技能 → ${out}`);
