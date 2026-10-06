/**
 * 把「能力值＋裝備＋衝卷」研究檔編成前端用的檔案。
 *
 * 用法：npm run data:gear
 *
 * 輸入：
 *   data/guides/gear.json                         主流點法、轉職前配點、裝備／衝卷攻略筆記（研究檔，每條附出處與 verified）
 *   public/data/{items,monsters,maps,quests}.json  站內遊戲資料，算武器／卷軸的數值與拿法
 *
 * 輸出：
 *   public/data/gear.json  武器、卷軸（含來源）、能力值規則、轉職前配點、攻略筆記
 *
 * 研究檔是另一個 Task 平行在做的，這支腳本不能假設它存在：缺檔或缺欄位時 rules／notes 給空陣列、
 * before 不給，照樣把武器／卷軸（遊戲資料算得出來的部分）建出來，不能失敗。
 *
 * 「已開放地圖」跟 build.mjs／build-guides.mjs 同一個判準：maps.json 裡有中文名（zh）就算；
 * V002 地圖另外帶 o（開放日期），只有 V002 地圖／任務拿得到的武器與卷軸會帶這個 o。
 * 任務是不是 V002 的判斷鏡射 src/lib/v002.ts 的 isV002Quest（pipeline 不能 import TypeScript，lib/gear.mjs 手動保持邏輯一致）。
 *
 * 只收「現在拿得到」的東西：商店有賣、或掉落怪出現在已開放地圖（含 V002）、或已開放任務會給；
 * 三個來源都沒有（常見於週年慶等活動贈品，資料庫裡還留著但現在沒有管道拿）的武器／卷軸整筆不收，不編造。
 */
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson, humanBytes } from "./lib/http.mjs";
import { lintResearch } from "./lib/guides.mjs";
import {
  WEAPON_TYPES,
  buildScrolls,
  buildWeapon,
  convertBefore,
  convertNotes,
  convertStatRules,
  openMapFrom,
} from "./lib/gear.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "public", "data");
const RESEARCH_FILE = path.join(ROOT, "data", "guides", "gear.json");
const OUT_FILE = path.join(DATA, "gear.json");

function main() {
  const items = readJson(path.join(DATA, "items.json"));
  const monsters = readJson(path.join(DATA, "monsters.json"));
  const maps = readJson(path.join(DATA, "maps.json"));
  const quests = readJson(path.join(DATA, "quests.json"));
  if (!items || !monsters || !maps || !quests) throw new Error("缺 public/data 的遊戲資料，先跑 npm run data:build");

  const monstersById = new Map(monsters.map(monster => [monster.id, monster]));
  const questsById = new Map(quests.map(quest => [quest.id, quest]));
  const openMap = openMapFrom(maps);
  // V002 開放日期直接從 maps.json 的 o 欄位取（build.mjs 的 V002_OPEN_DATE），不在這裡另外硬編一份日期
  const v002Date = Object.values(maps).find(map => map.o)?.o;

  const warnings = [];
  const warn = message => warnings.push(message);
  const ctx = { monstersById, questsById, maps, openMap, v002Date, warn };

  // 研究檔不存在（另一個 Task 平行在做）或缺欄位都不能讓這支腳本失敗
  const research = readJson(RESEARCH_FILE, null);
  let rules = [];
  let notes = [];
  let before;
  if (research) {
    const lintIssues = lintResearch(research);
    if (lintIssues.length) {
      const lines = lintIssues.map(issue => `  - ${issue.where}：${issue.label}「${issue.match}」`);
      throw new Error(`gear.json 研究檔有 ${lintIssues.length} 處內部筆記會上畫面，先改掉：\n${lines.join("\n")}`);
    }
    rules = convertStatRules(research.statRules);
    notes = convertNotes(research.gearNotes);
    before = convertBefore(research.beforeAdvancement);
  } else {
    warnings.push("data/guides/gear.json 還沒有（研究檔尚未產出），rules／notes 先留空、不給 before");
  }

  const weapons = items
    .filter(item => !item.un && item.c === "裝備" && WEAPON_TYPES.includes(item.s))
    .map(item => buildWeapon(item, ctx))
    .filter(Boolean)
    .sort((a, b) => a.s.localeCompare(b.s) || a.lv - b.lv || a.id - b.id);

  const scrolls = buildScrolls(
    items.filter(item => !item.un && item.s === "卷軸"),
    ctx,
  ).sort((a, b) => a.slot.localeCompare(b.slot) || a.stat.localeCompare(b.stat) || a.rate - b.rate);

  const gear = {
    builtAt: new Date().toISOString(),
    weapons,
    scrolls,
    rules,
    ...(before ? { before } : {}),
    notes,
  };

  fs.mkdirSync(DATA, { recursive: true });
  const size = writeJson(OUT_FILE, gear);

  console.log(`[gear] gear.json ${humanBytes(size)}`);
  console.log(`[gear] 武器 ${weapons.length} 把：`);
  const byType = new Map();
  for (const weapon of weapons) byType.set(weapon.s, (byType.get(weapon.s) ?? 0) + 1);
  for (const type of WEAPON_TYPES) console.log(`  ${type.padEnd(4, "　")} ${byType.get(type) ?? 0} 把`);
  console.log(`[gear] 卷軸 ${scrolls.length} 種、能力值規則 ${rules.length} 條、攻略筆記 ${notes.length} 條${before ? "、有轉職前配點說明" : ""}`);
  if (warnings.length) {
    console.log(`[gear] ${warnings.length} 筆警告：`);
    for (const line of warnings) console.log(`  - ${line}`);
  }
}

main();
