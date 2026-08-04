/**
 * 產出檢查。
 *
 * 存在的理由很具體：這條管線出過一次「打寶索引整包是空的」的包，
 * build 照樣跑完、檔案照樣寫出來，是我後來手動看數字才發現。
 * 所以每次重建完都要跑這支，壞掉就讓 CI 紅燈，不要靜靜地把空資料推上線。
 */
import fs from "node:fs";
import path from "node:path";
import { readJson } from "./lib/http.mjs";

const OUT = path.resolve(import.meta.dirname, "..", "public", "data");

const failures = [];
const notes = [];

function check(label, condition, detail = "") {
  if (condition) notes.push(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
  else failures.push(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
}

function main() {
  const meta = readJson(path.join(OUT, "meta.json"));
  const maps = readJson(path.join(OUT, "maps.json"));
  const graph = readJson(path.join(OUT, "graph.json"));
  const monsters = readJson(path.join(OUT, "monsters.json"));
  const items = readJson(path.join(OUT, "items.json"));
  const quests = readJson(path.join(OUT, "quests.json"));
  const skills = readJson(path.join(OUT, "skills.json"));
  const training = readJson(path.join(OUT, "training.json"));
  const farming = readJson(path.join(OUT, "farming.json"));
  const search = readJson(path.join(OUT, "search.json"));

  check("meta 有遊戲版本", Boolean(meta?.gameVersion), String(meta?.gameVersion));
  check("怪物數量合理", monsters?.length >= 300, `${monsters?.length} 隻`);
  check("道具數量合理", items?.length >= 10000, `${items?.length} 個`);
  check("任務數量合理", quests?.length >= 400, `${quests?.length} 個`);
  check("技能數量合理", skills?.length >= 600, `${skills?.length} 個`);
  check("地圖數量合理", Object.keys(maps ?? {}).length >= 5000, `${Object.keys(maps ?? {}).length} 張`);

  const edges = Object.values(graph ?? {}).reduce((sum, list) => sum + list.length, 0);
  check("傳送門邊數合理", edges >= 3000, `${edges} 條`);

  check("練功索引非空", training?.length >= 400, `${training?.length} 張圖`);
  check("打寶索引非空", Object.keys(farming ?? {}).length >= 1000, `${Object.keys(farming ?? {}).length} 個道具`);
  check("搜尋索引非空", search?.length >= 10000, `${search?.length} 筆`);

  // 每筆練功資料的地圖都要在地圖表裡，不然前端會顯示「地圖 12345」
  const orphanTraining = (training ?? []).filter(row => !maps[String(row.m)]).length;
  check("練功索引的地圖都查得到", orphanTraining === 0, `${orphanTraining} 筆孤兒`);

  // 練功資料至少要有一半帶得出中文名，否則代表中文名對照壞了
  const named = (training ?? []).filter(row => maps[String(row.m)]?.zh).length;
  check("練功地圖有中文名的比例", named / Math.max(training?.length ?? 1, 1) >= 0.3,
    `${named}/${training?.length}`);

  // 走一條已知路線：弓箭手村 → 弓箭手訓練場Ⅰ 應該一步到位
  check("已知路線走得通", routeExists(graph, 100000000, 104040000, 3),
    "弓箭手村 → 弓箭手訓練場Ⅰ");
  // 多段路線：勇士之村 → 奇幻村
  check("多段路線走得通", routeExists(graph, 102000000, 105040300, 12),
    "勇士之村 → 奇幻村");

  const monsterIds = new Set((monsters ?? []).map(monster => monster.id));
  const badDrop = (items ?? []).filter(item => item.dm?.some(id => !monsterIds.has(id))).length;
  check("道具的掉落來源都指得到怪", badDrop === 0, `${badDrop} 個道具有壞掉的來源`);

  const withSpawn = (monsters ?? []).filter(monster => monster.sp?.length).length;
  check("怪物有刷怪點資料的比例", withSpawn / Math.max(monsters?.length ?? 1, 1) >= 0.7,
    `${withSpawn}/${monsters?.length}`);

  // 任務細節曾經整批漏掉（texts 被當成物件而不是陣列），加上檢查避免再犯
  const withTexts = (quests ?? []).filter(quest => Array.isArray(quest.texts) && quest.texts.length).length;
  check("任務有敘述的比例", withTexts / Math.max(quests?.length ?? 1, 1) >= 0.9, `${withTexts}/${quests?.length}`);
  const withMobs = (quests ?? []).filter(quest => quest.needMobs?.length).length;
  check("有打怪需求的任務", withMobs >= 50, `${withMobs} 個`);
  const beginnerOnly = (quests ?? []).filter(quest => quest.jobs?.length === 1 && quest.jobs[0] === 0).length;
  check("初心者專屬任務有被標記", beginnerOnly >= 40, `${beginnerOnly} 個`);
  const island = (quests ?? []).filter(quest => quest.island).length;
  check("楓之島任務有被標記", island >= 40, `${island} 個`);
  const priced = (items ?? []).filter(item => item.price).length;
  check("道具有商店價格的筆數", priced >= 300, `${priced} 個`);

  console.log("=== 資料檢查 ===");
  for (const line of notes) console.log(line);
  if (failures.length) {
    console.log("");
    for (const line of failures) console.log(line);
    console.error(`\n${failures.length} 項檢查未通過，資料不要上線。`);
    process.exit(1);
  }
  console.log("\n全部通過。");
}

function routeExists(graph, from, to, maxHops) {
  const visited = new Set([from]);
  let frontier = [from];
  for (let depth = 0; depth < maxHops; depth += 1) {
    const next = [];
    for (const current of frontier) {
      for (const [target] of graph[String(current)] || []) {
        if (target === to) return true;
        if (visited.has(target)) continue;
        visited.add(target);
        next.push(target);
      }
    }
    if (!next.length) return false;
    frontier = next;
  }
  return false;
}

main();
