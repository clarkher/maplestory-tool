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

/** 參考站 price.json：當下市價＋歷史 */
const refJson = (t, history, ask = 300, n = 82) => ({ t, servers: { 雪吉拉: { ask, n, dist: [[300, 5], [250, 2]] } }, history });
const h = (t, ask) => ({ t, m: 3, 雪吉拉_ask: ask });
const FIRST = refJson("2026-10-13T14:40:59+08:00", [h("2026-10-12T20:40:00+08:00", 330), h("2026-10-13T14:40:59+08:00", 300)]);

test("第一次跑（空資料夾）：參考站歷史全收、當下那筆補掛單數，寫出三個檔", async () => {
  const out = tmp();
  const result = await runCollect({ dataDir: tmp(), outDir: out, now: new Date("2026-10-13T08:17:00Z"), getRef: async () => FIRST });
  assert.deepEqual(fs.readdirSync(path.join(out, DIR)).sort(), [...FILES].sort());
  assert.deepEqual(lines(out, "ref-samples.jsonl"), [
    { t: "2026-10-12T20:40:00+08:00", ask100: 330 },
    { t: "2026-10-13T14:40:59+08:00", ask100: 300, listings: 82 },
  ]);
  assert.deepEqual(readJson(out, "latest.json"), { t: "2026-10-13T14:40:59+08:00", fetchedAt: "2026-10-13T16:17:00+08:00", ask100: 300, listings: 82, ladder: [[250, 2], [300, 5]] });
  const daily = readJson(out, "daily.json");
  assert.deepEqual([daily.server, daily.unit, daily.source, daily.updatedAt], ["雪吉拉", "元／1 億楓幣", "https://maple-classic-wiki.pages.dev/price", "2026-10-13T16:17:00+08:00"]);
  assert.deepEqual(daily.days.map(d => [d.date, d.close, d.listings, d.source]), [["2026-10-12", 3030.3, null, "ref"], ["2026-10-13", 3333.3, 82, "ref"]]);
  assert.deepEqual(result, { t: "2026-10-13T14:40:59+08:00", ask100: 300, added: 2, ageHours: 1.6 });
});

test("第二次跑：只接比檔案最後一筆新的，舊內容原封不動（只會變長）", async () => {
  const first = tmp();
  await runCollect({ dataDir: tmp(), outDir: first, now: new Date("2026-10-13T08:17:00Z"), getRef: async () => FIRST });
  const second = tmp();
  const next = refJson("2026-10-13T16:40:00+08:00", [h("2026-10-13T14:40:59+08:00", 300), h("2026-10-13T16:40:00+08:00", 310)], 310, 80);
  const result = await runCollect({ dataDir: first, outDir: second, now: new Date("2026-10-13T10:00:00Z"), getRef: async () => next });
  assert.ok(read(second, "ref-samples.jsonl").startsWith(read(first, "ref-samples.jsonl")));
  assert.deepEqual(lines(second, "ref-samples.jsonl").slice(2), [{ t: "2026-10-13T16:40:00+08:00", ask100: 310, listings: 80 }]);
  assert.equal(result.added, 1);
});

test("舊檔最後沒換行也接得上（不會兩行黏在一起）", async () => {
  const data = tmp();
  fs.mkdirSync(path.join(data, DIR), { recursive: true });
  fs.writeFileSync(path.join(data, DIR, "ref-samples.jsonl"), '{"t":"2026-10-12T20:40:00+08:00","ask100":330}');
  const out = tmp();
  await runCollect({ dataDir: data, outDir: out, now: new Date("2026-10-13T08:17:00Z"), getRef: async () => FIRST });
  assert.equal(lines(out, "ref-samples.jsonl").length, 2);
});

test("參考站沒有新資料：檔案不變、added 0；ageHours 照實算（參考站停更時 notify 靠它開 issue）", async () => {
  const first = tmp();
  await runCollect({ dataDir: tmp(), outDir: first, now: new Date("2026-10-13T08:17:00Z"), getRef: async () => FIRST });
  const second = tmp();
  const result = await runCollect({ dataDir: first, outDir: second, now: new Date("2026-10-14T02:41:00Z"), getRef: async () => FIRST });
  assert.equal(read(second, "ref-samples.jsonl"), read(first, "ref-samples.jsonl"));
  assert.equal(result.added, 0);
  assert.equal(result.ageHours, 20);
});

test("參考站抓不到或格式不對就丟錯（workflow 紅、notify 開 issue），不寫任何檔", async () => {
  const out = tmp();
  await assert.rejects(runCollect({ dataDir: tmp(), outDir: out, getRef: async () => { throw new Error("HTTP 503"); } }), /503/);
  await assert.rejects(runCollect({ dataDir: tmp(), outDir: out, getRef: async () => ({ servers: {} }) }), /格式不對/);
  assert.equal(fs.existsSync(path.join(out, DIR)), false);
});