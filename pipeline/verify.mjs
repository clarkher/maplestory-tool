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
  check("怪物數量合理（僅已開放）", monsters?.length >= 50 && monsters?.length <= 150, `${monsters?.length} 隻`);
  check("道具數量合理", items?.length >= 10000, `${items?.length} 個`);
  check("任務數量合理（僅已開放）", quests?.length >= 250 && quests?.length <= 450, `${quests?.length} 個`);
  check("技能數量合理（僅到二轉）", skills?.length >= 250 && skills?.length <= 450, `${skills?.length} 個`);
  check("地圖數量合理", Object.keys(maps ?? {}).length >= 5000, `${Object.keys(maps ?? {}).length} 張`);

  const edges = Object.values(graph ?? {}).reduce((sum, list) => sum + list.length, 0);
  check("傳送門邊數合理", edges >= 3000, `${edges} 條`);

  check("練功索引非空", training?.length >= 120, `${training?.length} 張圖`);
  check("打寶索引非空", Object.keys(farming ?? {}).length >= 500, `${Object.keys(farming ?? {}).length} 個道具`);
  check("搜尋索引非空", search?.length >= 8000, `${search?.length} 筆`);

  // 每筆練功資料的地圖都要在地圖表裡，不然前端會顯示「地圖 12345」
  const orphanTraining = (training ?? []).filter(row => !maps[String(row.m)]).length;
  check("練功索引的地圖都查得到", orphanTraining === 0, `${orphanTraining} 筆孤兒`);

  // 已開放內容判準：練功地圖必須全部有中文名，沒有中文名代表那張圖還沒開放
  const named = (training ?? []).filter(row => maps[String(row.m)]?.zh).length;
  check("練功地圖全部有中文名", named === (training?.length ?? 0), `${named}/${training?.length}`);

  // 站上不該出現任何英文地圖名
  const english = Object.values(maps ?? {}).filter(map => map.en).length;
  check("地圖資料不含英文名", english === 0, `${english} 筆`);

  // 開放範圍：不該有超過等級上限或三轉以上的內容
  const cap = meta?.release?.levelCap ?? 100;
  const overCap = (quests ?? []).filter(quest => (quest.minLv ?? 0) > cap).length;
  check(`任務都在 Lv.${cap} 以內`, overCap === 0, `${overCap} 個超出`);
  const overLevelMob = (monsters ?? []).filter(monster => (monster.lv ?? 0) > cap).length;
  check(`怪物都在 Lv.${cap} 以內`, overLevelMob === 0, `${overLevelMob} 隻超出`);

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
  check("有打怪需求的任務", withMobs >= 30, `${withMobs} 個`);
  const beginnerOnly = (quests ?? []).filter(quest => quest.jobs?.length === 1 && quest.jobs[0] === 0).length;
  check("初心者專屬任務有被標記", beginnerOnly >= 40, `${beginnerOnly} 個`);
  const advJobs = (readJson(path.join(OUT, "jobs.json")) ?? []).filter(job => job.advOrder > 2).length;
  check("職業選單只到二轉", advJobs === 0, `${advJobs} 個三轉以上`);
  const island = (quests ?? []).filter(quest => quest.island).length;
  check("楓之島任務有被標記", island >= 40, `${island} 個`);
  // 獎勵清單裡混著 action=remove（完成時收走的道具），曾經被當成獎勵列出來
  const rewardRows = (quests ?? []).reduce((sum, quest) => sum + (quest.rewardItems?.length ?? 0), 0);
  check("獎勵道具沒把收走的算進去", rewardRows > 150 && rewardRows < 600, `${rewardRows} 列`);
  const randomRows = (quests ?? []).reduce(
    (sum, quest) => sum + (quest.rewardItems?.filter(item => item.rand).length ?? 0), 0);
  check("隨機獎勵有被標記", randomRows >= 50, `${randomRows} 列`);

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
