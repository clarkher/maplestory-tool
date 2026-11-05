/**
 * 攻略研究檔的練功列（data/guides/*.json）跟出怪對得上嗎。
 *
 * 研究檔比的是快照 data/guides/spawn-audit.json，不是最新出怪：資料自動更新不動研究檔也不動快照，所以不會因為改版誤紅。
 * 新資料造成的落差由 build-guides 處理（丟掉對不上的怪、寫進 Actions 摘要），第二個測試確認它有做到。
 *
 * 這裡紅了：研究檔改錯 → 改研究檔；真的是遊戲改了 → 對過之後 npm run data:spawn-audit 更新快照。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { mobsNotOnRow, pqKeyOf, rowTextIssues, spawnTable } from "./lib/guides.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const readJson = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const pqList = readJson("data/guides/pq.json").pq;

test("研究檔的練功列：寫的怪跟文字都對得上出怪快照", () => {
  const audit = readJson("data/guides/spawn-audit.json");
  const issues = [];
  for (const file of ["warrior-pirate", "magician", "archer-thief"]) {
    for (const job of readJson(`data/guides/${file}.json`).jobs) {
      for (const segment of job.training) {
        const row = {
          name: segment.mapName,
          why: segment.why,
          map: segment.mapId,
          mobs: (segment.mobs ?? []).map(mob => mob.id),
          pq: pqKeyOf(pqList, { kind: segment.kind, name: segment.mapName }),
        };
        for (const id of mobsNotOnRow(row, audit)) issues.push(`${job.jobId} ${segment.mapName}：${audit.mobs[id] ?? id} 不在這列寫到的圖`);
        for (const issue of rowTextIssues(row, audit)) issues.push(`${job.jobId} ${issue}`);
      }
    }
  }
  assert.deepEqual(issues, []);
});

test("編出來的攻略：每列的怪都在最新出怪裡（build-guides 會丟掉對不上的，資料更新也一樣）", () => {
  const table = spawnTable(readJson("public/data/maps.json"), readJson("public/data/monsters.json"));
  const dir = path.join(ROOT, "public", "data", "guides");
  const issues = [];
  for (const file of fs.readdirSync(dir).filter(name => name !== "common.json")) {
    const guide = readJson(`public/data/guides/${file}`);
    for (const row of guide.train) {
      for (const id of mobsNotOnRow(row, table)) issues.push(`${guide.job} ${row.name}：${table.mobs[id] ?? id}`);
    }
  }
  assert.deepEqual(issues, []);
});
