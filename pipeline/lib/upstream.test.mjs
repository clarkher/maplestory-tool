import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseUpstreamScript, assembleUpstream, readUpstream } from "./upstream.mjs";

const meta = (gameVersion, generatedAt) => ({
  gameVersion,
  generatedAt,
  generatedAtText: generatedAt.replace("T", " ").replace("+08:00", " GMT+8"),
  timeZone: "Asia/Taipei",
});

function fixtureParts() {
  return {
    "data.js": {
      generatedFrom: "maplestory_classic.zip",
      source: "MonsterBook.wzjson",
      metadata: meta("1.15.1", "2026-09-16T10:34:10+08:00"),
      summary: { monsters: 1 },
      filters: { continents: ["維多利亞島"] },
      monsters: [{ id: 100100, name: "嫩寶" }],
      mapClassificationReview: { unclassifiedMonsterMaps: [] },
    },
    "items-data.js": {
      metadata: meta("1.15.2", "2026-09-24T11:25:10+08:00"),
      filters: { itemCategories: ["裝備"] },
      items: [{ id: 2000000, name: "紅色藥水" }],
    },
    "quests-data.js": {
      metadata: meta("1.15.2", "2026-09-21T11:41:01+08:00"),
      filters: { questCategories: ["楓之島"] },
      quests: [{ id: 1000, name: "借來的鏡子" }],
    },
    "skills-data.js": {
      metadata: meta("1.15.1", "2026-09-16T10:34:10+08:00"),
      filters: { skillJobs: [100] },
      skills: [{ id: 1000, name: "嫩寶丟擲術", jobId: 0 }],
      statLabels: { damage: "傷害" },
    },
    "maps-data.js": {
      metadata: meta("1.15.2", "2026-09-21T11:41:01+08:00"),
      filters: { mapRegions: ["維多利亞島"] },
      maps: [{ id: 100000000, name: "弓箭手村" }],
    },
    "worldmaps-data.js": {
      metadata: meta("1.15.1", "2026-09-16T10:34:10+08:00"),
      filters: { worldMapRegions: ["WorldMap010"] },
      worldMaps: { regions: [] },
    },
  };
}

test("parseUpstreamScript 解出 window 指派後面的 JSON", () => {
  const parsed = parseUpstreamScript('window.MS_DROP_DB = {"monsters":[{"id":1}]};\n', "MS_DROP_DB", "data.js");
  assert.deepEqual(parsed, { monsters: [{ id: 1 }] });
});

test("parseUpstreamScript 開頭對不上就報出是哪個檔", () => {
  assert.throws(
    () => parseUpstreamScript('window.SOMETHING_ELSE = {"a":1};', "MS_DROP_DB", "data.js"),
    /data\.js.*MS_DROP_DB/,
  );
});

test("parseUpstreamScript 不執行檔案內容", () => {
  // 上游檔案是別人 repo 裡的東西，只能當資料讀；裡面真的有程式碼就該解析失敗
  assert.throws(
    () => parseUpstreamScript("window.MS_DROP_DB = (() => { globalThis.__pwned = true; return {}; })();", "MS_DROP_DB", "data.js"),
    /data\.js/,
  );
  assert.equal(globalThis.__pwned, undefined);
});

test("assembleUpstream 併回舊 drops.json 的結構", () => {
  const payload = assembleUpstream(fixtureParts());
  assert.deepEqual(payload.monsters, [{ id: 100100, name: "嫩寶" }]);
  assert.deepEqual(payload.items, [{ id: 2000000, name: "紅色藥水" }]);
  assert.deepEqual(payload.quests, [{ id: 1000, name: "借來的鏡子" }]);
  assert.deepEqual(payload.skills, [{ id: 1000, name: "嫩寶丟擲術", jobId: 0 }]);
  assert.deepEqual(payload.skillStatLabels, { damage: "傷害" });
  assert.deepEqual(payload.maps, [{ id: 100000000, name: "弓箭手村" }]);
  assert.deepEqual(payload.worldMaps, { regions: [] });
  assert.deepEqual(payload.mapClassificationReview, { unclassifiedMonsterMaps: [] });
  assert.equal(payload.generatedFrom, "maplestory_classic.zip");
  assert.deepEqual(payload.summary, { monsters: 1 });
  assert.deepEqual(payload.filters, {
    continents: ["維多利亞島"],
    itemCategories: ["裝備"],
    questCategories: ["楓之島"],
    skillJobs: [100],
    mapRegions: ["維多利亞島"],
    worldMapRegions: ["WorldMap010"],
  });
});

test("assembleUpstream 的版本取最新產生的那個檔，各檔版本另外留底", () => {
  const { metadata } = assembleUpstream(fixtureParts());
  assert.equal(metadata.gameVersion, "1.15.2");
  assert.equal(metadata.generatedAt, "2026-09-24T11:25:10+08:00");
  assert.equal(metadata.generatedAtText, "2026-09-24 11:25:10 GMT+8");
  assert.deepEqual(metadata.parts["data.js"], { gameVersion: "1.15.1", generatedAt: "2026-09-16T10:34:10+08:00" });
  assert.deepEqual(metadata.parts["items-data.js"], { gameVersion: "1.15.2", generatedAt: "2026-09-24T11:25:10+08:00" });
});

test("assembleUpstream 缺了管線用得到的資料就擋下來，並說是哪個檔的哪個欄位", () => {
  const parts = fixtureParts();
  delete parts["items-data.js"];
  assert.throws(() => assembleUpstream(parts), /items-data\.js/);

  const empty = fixtureParts();
  empty["quests-data.js"].quests = [];
  assert.throws(() => assembleUpstream(empty), /quests-data\.js.*quests/);
});

test("assembleUpstream 少了世界地圖檔不擋（管線沒用到）", () => {
  const parts = fixtureParts();
  delete parts["worldmaps-data.js"];
  const payload = assembleUpstream(parts);
  assert.equal(payload.worldMaps, undefined);
  assert.equal(payload.monsters.length, 1);
});

test("assembleUpstream 少了地圖檔或地圖是空的就擋：出怪的刷怪點從這份來", () => {
  const missing = fixtureParts();
  delete missing["maps-data.js"];
  assert.throws(() => assembleUpstream(missing), /maps-data\.js/);

  const empty = fixtureParts();
  empty["maps-data.js"].maps = [];
  assert.throws(() => assembleUpstream(empty), /maps-data\.js.*maps/);
});

test("readUpstream 從資料夾讀六個檔併成一份", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "upstream-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const globals = {
    "data.js": "MS_DROP_DB",
    "items-data.js": "MS_ITEM_DB",
    "quests-data.js": "MS_QUEST_DB",
    "skills-data.js": "MS_SKILL_DB",
    "maps-data.js": "MS_MAP_DB",
    "worldmaps-data.js": "MS_WORLD_MAP_DB",
  };
  for (const [file, part] of Object.entries(fixtureParts())) {
    fs.writeFileSync(path.join(dir, file), `window.${globals[file]} = ${JSON.stringify(part)};\n`);
  }
  const payload = readUpstream(dir);
  assert.equal(payload.metadata.gameVersion, "1.15.2");
  assert.equal(payload.items[0].name, "紅色藥水");
});

test("readUpstream 缺必要檔案時報出檔名", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "upstream-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.throws(() => readUpstream(dir), /data\.js/);
});
