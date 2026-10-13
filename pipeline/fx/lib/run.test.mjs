import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DIR, FILES, runCollect } from "./run.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "fx-run-"));
const read = (dir, name) => fs.readFileSync(path.join(dir, DIR, name), "utf8");
const readJson = (dir, name) => JSON.parse(read(dir, name));
const lines = (dir, name) => read(dir, name).split("\n").filter(Boolean).map(line => JSON.parse(line));

/** 25 筆正常掛單（300 萬／100 元），sold 可以指定 */
const listings = (sold = 10) => Array.from({ length: 25 }, (_, i) => ({ id: String(i + 1), title: "【100元=300萬楓幣】300萬楓幣=100元", priceNtd: 100, stock: 999, sold }));
const refJson = {
  t: "2026-10-13T14:40:59+08:00",
  servers: { 雪吉拉: { ask: 320, n: 82, dist: [[320, 5]] } },
  history: [{ t: "2026-10-12T20:40:00+08:00", m: 3, 雪吉拉_ask: 330 }, { t: "2026-10-13T14:40:59+08:00", m: 3, 雪吉拉_ask: 320 }],
};
const quiet = () => {};

test("第一次跑（空資料夾）：寫出五個檔，8591 一筆樣本、參考站歷史全收、每日兩天", async () => {
  const data = tmp();
  const out = tmp();
  const result = await runCollect({ dataDir: data, outDir: out, now: new Date("2026-10-13T08:17:00Z"), get8591: async () => listings(), getRef: async () => refJson, log: quiet });
  assert.deepEqual(fs.readdirSync(path.join(out, DIR)).sort(), [...FILES].sort());
  assert.equal(result.ok8591, true);
  assert.equal(result.src, "8591");
  assert.deepEqual(lines(out, "samples.jsonl"), [{ t: "2026-10-13T16:17:00+08:00", src: "8591", ask100: 300, listings: 25, volNtd: 0, volMeso: 0 }]);
  assert.equal(lines(out, "ref-samples.jsonl").length, 2);
  assert.deepEqual(readJson(out, "state.json"), { at: "2026-10-13T16:17:00+08:00", listings: Object.fromEntries(listings().map(l => [l.id, [10, 100, 300]])), fail8591: 0 });
  const latest = readJson(out, "latest.json");
  assert.deepEqual([latest.src, latest.ask100, latest.listings, latest.band], ["8591", 300, 25, [300, 300]]);
  const daily = readJson(out, "daily.json");
  assert.equal(daily.server, "雪吉拉");
  assert.equal(daily.unit, "元／1 億楓幣");
  assert.deepEqual(daily.days.map(d => [d.date, d.source, d.close]), [["2026-10-12", "ref", 3030.3], ["2026-10-13", "8591", 3333.3]]);
});

test("第二次跑：接在舊檔後面（只會變長）、算出成交、參考站只接新的", async () => {
  const first = tmp();
  await runCollect({ dataDir: tmp(), outDir: first, now: new Date("2026-10-13T08:17:00Z"), get8591: async () => listings(10), getRef: async () => refJson, log: quiet });
  const second = tmp();
  const newerRef = { ...refJson, t: "2026-10-13T16:40:00+08:00", history: [...refJson.history, { t: "2026-10-13T16:40:00+08:00", m: 3, 雪吉拉_ask: 310 }] };
  await runCollect({ dataDir: first, outDir: second, now: new Date("2026-10-13T12:17:00Z"), get8591: async () => listings(12), getRef: async () => newerRef, log: quiet });
  assert.ok(read(second, "samples.jsonl").startsWith(read(first, "samples.jsonl")));
  assert.ok(read(second, "ref-samples.jsonl").startsWith(read(first, "ref-samples.jsonl")));
  assert.equal(lines(second, "ref-samples.jsonl").length, 3);
  const [, latest] = lines(second, "samples.jsonl");
  assert.equal(latest.volNtd, 25 * 2 * 100);
  assert.equal(latest.volMeso, 25 * 2 * 100 * 3);
});

test("8591 失敗：不寫 8591 樣本、狀態保留、連續失敗次數 +1、最新一筆改用參考站", async () => {
  const first = tmp();
  await runCollect({ dataDir: tmp(), outDir: first, now: new Date("2026-10-13T08:17:00Z"), get8591: async () => listings(), getRef: async () => refJson, log: quiet });
  const second = tmp();
  const result = await runCollect({ dataDir: first, outDir: second, now: new Date("2026-10-13T12:17:00Z"), get8591: async () => { throw new Error("HTTP 403（被擋，不重試）"); }, getRef: async () => refJson, log: quiet });
  assert.deepEqual([result.ok8591, result.okRef, result.fail8591, result.src], [false, true, 1, "ref"]);
  assert.match(result.error8591, /403/);
  assert.equal(read(second, "samples.jsonl"), read(first, "samples.jsonl"));
  assert.deepEqual(readJson(second, "state.json").listings, readJson(first, "state.json").listings);
  const latest = readJson(second, "latest.json");
  assert.deepEqual([latest.src, latest.ask100, latest.listings, latest.band], ["ref", 320, 82, null]);
});

test("8591 有效掛單不到 20 筆也當失敗（多半是被擋或改版）", async () => {
  const result = await runCollect({ dataDir: tmp(), outDir: tmp(), get8591: async () => listings().slice(0, 19), getRef: async () => refJson, log: quiet });
  assert.equal(result.ok8591, false);
  assert.match(result.error8591, /19/);
});

test("參考站掛了但 8591 正常：照常寫，參考站檔案維持原樣", async () => {
  const result = await runCollect({ dataDir: tmp(), outDir: tmp(), get8591: async () => listings(), getRef: async () => { throw new Error("timeout"); }, log: quiet });
  assert.deepEqual([result.ok8591, result.okRef], [true, false]);
});

test("兩個都失敗就丟錯（workflow 那步會紅、notify 開 issue），不寫任何檔", async () => {
  const out = tmp();
  await assert.rejects(
    runCollect({ dataDir: tmp(), outDir: out, get8591: async () => { throw new Error("HTTP 403"); }, getRef: async () => { throw new Error("timeout"); }, log: quiet }),
    /兩個來源都失敗/,
  );
  assert.equal(fs.existsSync(path.join(out, DIR)), false);
});
