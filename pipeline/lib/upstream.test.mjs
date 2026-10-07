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

test("assembleUpstream 的 generatedAt 不是 ISO 時間格式就擋下來，並說是哪個檔：排程會拿它當版本比對、寫進 PR 標題", () => {
  // Date.parse 把括號裡當註解（沒關的括號一路算到字串尾），這些都算合法日期；原字串照存，指令或換行就跟著進了 CI
  const rejected = [
    ["items-data.js", 'Oct 5 2026 10:00 ("; echo INJECTED; echo ")'], // 最新的那個檔：會變成整份資料的版本
    ["items-data.js", "Oct 5 2026 10:00 (\nchanged=false)"], // 換行：多寫一行 $GITHUB_OUTPUT
    ["data.js", 'Sep 1 2026 ("; echo INJECTED; echo ")'], // 不是最新的檔也擋：各檔版本會留進 meta.json、印進執行紀錄
    ["quests-data.js", "2026-13-45T99:99:99+08:00"], // 長得像 ISO 但月份、時間超出範圍
    // 結尾或某一行是合法 ISO 也不行：格式檢查要從整個字串開頭比到結尾
    ["items-data.js", 'Oct 5 2026 ("; echo INJECTED; echo "2026-09-24T11:25:10+08:00'],
    ["items-data.js", "Oct 5 2026 (\nchanged=false\n2026-09-24T11:25:10+08:00"],
    ["items-data.js", "2026-09-24T11:25:10+08:00\nchanged=false"],
    // 小數秒不限長度，幾萬字也算合法：PR 標題超過 256 字開不出來（分支已經推上去了），通知 issue 也會超過長度上限
    ["items-data.js", `2026-09-24T11:25:10.${"1".repeat(1000)}+08:00`],
  ];
  for (const [file, generatedAt] of rejected) {
    const parts = fixtureParts();
    parts[file].metadata.generatedAt = generatedAt;
    assert.throws(
      () => assembleUpstream(parts),
      error => {
        assert.match(error.message, new RegExp(`上游 ${file.replace(".", "\\.")} .*generatedAt`));
        // 錯誤訊息會印進執行紀錄、貼進通知 issue：原字串的換行不能帶出去（新的一行開頭寫 ::指令:: 會被 Actions 當成指令），也不能整串照貼
        assert.ok(!error.message.includes("\n"), "錯誤訊息裡有換行");
        assert.ok(error.message.length < 200, `錯誤訊息 ${error.message.length} 字`);
        return true;
      },
      JSON.stringify(generatedAt).slice(0, 80),
    );
  }
});

test("assembleUpstream 某個檔沒寫 generatedAt（undefined、null、空字串）照舊略過，版本取其他檔最新的", () => {
  for (const missing of [undefined, null, ""]) {
    const parts = fixtureParts();
    parts["items-data.js"].metadata.generatedAt = missing;
    const { metadata } = assembleUpstream(parts);
    assert.equal(metadata.parts["items-data.js"].generatedAt, null);
    assert.equal(metadata.generatedAt, "2026-09-21T11:41:01+08:00");
  }
});

test("assembleUpstream 的 generatedAt 是 ISO 8601 就照收、原字串不動（Z、小數秒都算）", () => {
  const parts = fixtureParts();
  parts["maps-data.js"].metadata.generatedAt = "2026-09-25T01:00:00.000Z";
  const { metadata } = assembleUpstream(parts);
  assert.equal(metadata.generatedAt, "2026-09-25T01:00:00.000Z");
  assert.equal(metadata.parts["items-data.js"].generatedAt, "2026-09-24T11:25:10+08:00");
});

/** 改一個檔的 metadata 欄位，預期 assembleUpstream 失敗、錯誤訊息寫得出是哪個檔的哪個欄位，而且不帶原字串的換行、不整串照貼。 */
function assertRejected(file, field, value) {
  const parts = fixtureParts();
  parts[file].metadata[field] = value;
  assert.throws(
    () => assembleUpstream(parts),
    error => {
      assert.match(error.message, new RegExp(`上游 ${file.replace(".", "\\.")} 的 metadata\\.${field}[^A-Za-z]`));
      // 錯誤訊息會印進執行紀錄、貼進通知 issue：新的一行開頭寫 ::指令:: 會被 Actions 當成指令
      assert.ok(!/[\n\r]/.test(error.message), "錯誤訊息裡有換行");
      assert.ok(error.message.length < 200, `錯誤訊息 ${error.message.length} 字`);
      return true;
    },
    `${file} 的 ${field} = ${JSON.stringify(value)?.slice(0, 80)}`,
  );
}

test("assembleUpstream 的 gameVersion 不是「1.15.2」這種版本號就擋下來，並說是哪個檔：會寫進 PR 標題、commit 訊息，印進執行紀錄", () => {
  const rejected = [
    ["items-data.js", "1.15.2\n::warning::x"], // 換行：新的一行開頭的 ::指令:: 會被 Actions 當成指令
    ["items-data.js", '1.15.2"; echo INJECTED; echo "'],
    ["items-data.js", `1.15.2${"0".repeat(300)}`], // 太長：PR 標題超過 256 字開不出來，那時資料分支已經推上去了
    ["items-data.js", `${"1.".repeat(150)}2`],
    ["data.js", "1.15.1 (hotfix)"], // 不是最新的檔也擋：各檔版本會留進 meta.json、印進執行紀錄
    ["quests-data.js", "v1.15.2"],
    ["maps-data.js", "1.15.2."],
    ["maps-data.js", "1"],
    ["maps-data.js", "1.2.3.4.5"], // 超過 4 段
    ["maps-data.js", "12345.1"], // 一段超過 4 位
    ["skills-data.js", 1.15], // 數字不是字串：上游換了寫法
  ];
  for (const [file, value] of rejected) assertRejected(file, "gameVersion", value);
});

test("assembleUpstream 的 gameVersion 是 2～4 段數字就照收，原字串不動；沒寫的檔照舊略過", () => {
  for (const version of ["1.16", "1.15.2", "10.0.12", "1.15.2.1"]) {
    const parts = fixtureParts();
    parts["items-data.js"].metadata.gameVersion = version;
    const { metadata } = assembleUpstream(parts);
    assert.equal(metadata.gameVersion, version);
    assert.equal(metadata.parts["items-data.js"].gameVersion, version);
  }
  for (const missing of [undefined, null, ""]) {
    const parts = fixtureParts();
    parts["data.js"].metadata.gameVersion = missing;
    assert.equal(assembleUpstream(parts).metadata.parts["data.js"].gameVersion, null);
  }
});

test("assembleUpstream 的 generatedAtText 有換行、控制字元或超過 64 字就擋下來，並說是哪個檔：會印進執行紀錄、寫進網站的 meta.json", () => {
  const rejected = [
    ["items-data.js", "2026-09-24 11:25:10 GMT+8\n::warning::x"],
    ["items-data.js", "2026-09-24 11:25:10 GMT+8\r::warning::x"],
    ["items-data.js", `2026-09-24 11:25:10 GMT+8${String.fromCharCode(0x2028)}x`],
    ["items-data.js", `2026-09-24 11:25:10 GMT+8${String.fromCharCode(0x1b)}[2K`], // 終端機控制碼
    ["data.js", "x".repeat(65)], // 不是最新的檔也擋
    ["quests-data.js", 20260924],
  ];
  for (const [file, value] of rejected) assertRejected(file, "generatedAtText", value);
});

test("assembleUpstream 的 generatedAtText 64 字以內、沒有換行就照收（不限格式）；沒寫的檔照舊略過", () => {
  const parts = fixtureParts();
  parts["items-data.js"].metadata.generatedAtText = "2026年9月24日 上午11:25（台北）";
  parts["data.js"].metadata.generatedAtText = "x".repeat(64);
  parts["quests-data.js"].metadata.generatedAtText = undefined;
  assert.equal(assembleUpstream(parts).metadata.generatedAtText, "2026年9月24日 上午11:25（台北）");
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
