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
 *   public/data/gear.json  武器、卷軸（含來源）、法師防具、能力值規則、轉職前配點、攻略筆記
 *                          rules 的 tab（切換標籤字）照研究檔帶；kit（要湊的裝備）由 buildKit 從遊戲資料換算
 *                          armor（法師防具）：職業限制含法師、現在拿得到的帽子／套服／上衣／褲裙／鞋子／手套／盾牌，
 *                          給法師「裝備法」列每個部位穿得上的防具；排序見 lib/gear.mjs 的 sortArmor（前端同等級取第一件）
 *                          ammo（彈藥）：飛鏢、箭矢、弩箭、子彈的攻擊力（道具說明抽）、等級限制、拿法，傷害計算機算總攻擊用
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
  ARMOR_SLOTS,
  WEAPON_TYPES,
  buildAmmo,
  buildArmor,
  buildKit,
  buildScrolls,
  buildWeapon,
  convertBefore,
  convertNotes,
  convertStatRules,
  openMapFrom,
  sortArmor,
} from "./lib/gear.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "public", "data");
const RESEARCH_FILE = path.join(ROOT, "data", "guides", "gear.json");
/** 上游原始資料（每日更新流程會先抓下來；本機沒有就不收合成來源，不能失敗） */
const RAW_FILE = path.join(ROOT, "data", "raw", "artale.json");
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

  // 合成配方只在原始資料裡（items.json 沒收）：道具 id → 上游 item.sources.crafts
  const raw = readJson(RAW_FILE, null);
  const craftsById = new Map();
  for (const entry of raw?.items ?? []) {
    const crafts = entry?.sources?.crafts;
    if (crafts?.length) craftsById.set(Number(entry.id ?? entry.itemId), crafts);
  }
  if (!raw) warn("沒有 data/raw/artale.json：這次不收合成來源（先跑 npm run data:artale）");

  const ctx = { monstersById, questsById, maps, openMap, v002Date, craftsById, warn };

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
    // 要湊的裝備（kit）在這裡用遊戲資料換算：點數、等級、需求、拿法都不照抄研究檔
    const itemsById = new Map(items.map(item => [item.id, item]));
    rules = convertStatRules(research.statRules).map((rule, index) => {
      const kit = research.statRules[index].kit;
      return kit ? { ...rule, kit: buildKit(kit, rule.secondary?.stat ?? rule.main, itemsById, ctx, warn) } : rule;
    });
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

  // 法師防具：buildArmor 自己濾部位／職業／不收錄／拿不到，這裡只要先挑裝備類省掉不必要的來源計算
  const armor = sortArmor(
    items
      .filter(item => item.c === "裝備" && ARMOR_SLOTS.includes(item.s))
      .map(item => buildArmor(item, ctx))
      .filter(Boolean),
  );

  // 彈藥（傷害計算機算總攻擊用）：飛鏢、箭矢、弩箭、子彈，只收拿得到的
  const ammo = items
    .map(item => buildAmmo(item, ctx))
    .filter(Boolean)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.atk - b.atk || a.id - b.id);

  const gear = {
    builtAt: new Date().toISOString(),
    weapons,
    scrolls,
    armor,
    ammo,
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
  const bySlot = new Map();
  for (const piece of armor) bySlot.set(piece.slot, (bySlot.get(piece.slot) ?? 0) + 1);
  console.log(`[gear] 法師防具 ${armor.length} 件：${ARMOR_SLOTS.map(slot => `${slot} ${bySlot.get(slot) ?? 0}`).join("、")}`);
  console.log(`[gear] 彈藥 ${ammo.length} 種：${["飛鏢", "箭矢", "弩箭", "子彈"].map(kind => `${kind} ${ammo.filter(entry => entry.kind === kind).length}`).join("、")}`);
  console.log(`[gear] 卷軸 ${scrolls.length} 種、能力值規則 ${rules.length} 條、攻略筆記 ${notes.length} 條${before ? "、有轉職前配點說明" : ""}`);
  if (warnings.length) {
    console.log(`[gear] ${warnings.length} 筆警告：`);
    for (const line of warnings) console.log(`  - ${line}`);
  }
}

main();
