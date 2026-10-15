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
  assert.deepEqual(readJson(out, "latest.json"), { t: "2026-10-13T14:40:59+08:00", fetchedAt: "2026-10-13T16:17:00+08:00", ask100: 300, listings: 82, ladder: [[250, 2], [300, 5]], src: "ref" });
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

test("參考站還在更新但歷史口徑改了（m=4）：一筆都接不上，ageHours 照我們最後一筆算、會一直變大", async () => {
  const first = tmp();
  await runCollect({ dataDir: tmp(), outDir: first, now: new Date("2026-10-13T08:17:00Z"), getRef: async () => FIRST });
  const second = tmp();
  // 參考站的 t 是新的，但歷史列的口徑標記 m 變成 4，我們只收 m=3，所以一筆都接不上
  const changed = refJson("2026-10-14T10:40:00+08:00", [{ t: "2026-10-14T08:40:00+08:00", m: 4, 雪吉拉_ask: 300 }, { t: "2026-10-14T10:40:00+08:00", m: 4, 雪吉拉_ask: 310 }]);
  const result = await runCollect({ dataDir: first, outDir: second, now: new Date("2026-10-14T02:41:00Z"), getRef: async () => changed });
  assert.equal(result.added, 0);
  assert.equal(result.ageHours, 20);
});

test("ref-samples 最後一筆時間壞掉就丟錯，不要默默接不上", async () => {
  const data = tmp();
  fs.mkdirSync(path.join(data, DIR), { recursive: true });
  fs.writeFileSync(path.join(data, DIR, "ref-samples.jsonl"), '{"t":"2026-10-12T20:40:00+08:00","ask100":330}\n{"t":"壞掉","ask100":300}\n');
  const out = tmp();
  await assert.rejects(runCollect({ dataDir: data, outDir: out, now: new Date("2026-10-13T08:17:00Z"), getRef: async () => FIRST }), /時間讀不懂/);
  assert.equal(fs.existsSync(path.join(out, DIR)), false);
});

test("第一次跑、參考站的歷史一筆都收不進來：丟錯、不寫檔（不要留一個空的 ref-samples.jsonl）", async () => {
  const out = tmp();
  const changed = refJson("2026-10-14T10:40:00+08:00", [{ t: "2026-10-14T10:40:00+08:00", m: 4, 雪吉拉_ask: 310 }]);
  await assert.rejects(runCollect({ dataDir: tmp(), outDir: out, now: new Date("2026-10-14T02:41:00Z"), getRef: async () => changed }), /沒有任何可用的市價/);
  assert.equal(fs.existsSync(path.join(out, DIR)), false);
});

// ---------- 手動補一筆（v0.99） ----------

const NOW = new Date("2026-10-13T08:17:00Z"); // 台灣 2026-10-13 16:17:00
const MANUAL_T = "2026-10-13T16:17:00+08:00";

test("手動補一筆（參考站正常）：接在參考站新資料後面，latest 是手動的（沒有掛單數與價位分布），當天 source 是 mixed", async () => {
  const out = tmp();
  const result = await runCollect({ dataDir: tmp(), outDir: out, now: NOW, getRef: async () => FIRST, manualAsk100: 280 });
  assert.deepEqual(lines(out, "ref-samples.jsonl"), [
    { t: "2026-10-12T20:40:00+08:00", ask100: 330 },
    { t: "2026-10-13T14:40:59+08:00", ask100: 300, listings: 82 },
    { t: MANUAL_T, ask100: 280, src: "manual" },
  ]);
  assert.deepEqual(readJson(out, "latest.json"), { t: MANUAL_T, fetchedAt: MANUAL_T, ask100: 280, listings: null, ladder: [], src: "manual" });
  const days = readJson(out, "daily.json").days;
  assert.deepEqual(days.map(d => [d.date, d.samples, d.source]), [["2026-10-12", 1, "ref"], ["2026-10-13", 2, "mixed"]]);
  assert.equal(days[1].close, 3571.4);
  assert.deepEqual(result, { t: MANUAL_T, ask100: 280, added: 2, ageHours: 0, manualAdded: true });
});

test("手動補一筆、參考站抓不到：不丟錯，照樣寫進去；舊資料原封不動", async () => {
  const first = tmp();
  await runCollect({ dataDir: tmp(), outDir: first, now: new Date("2026-10-13T07:00:00Z"), getRef: async () => FIRST });
  const out = tmp();
  const result = await runCollect({ dataDir: first, outDir: out, now: NOW, getRef: async () => { throw new Error("HTTP 503"); }, manualAsk100: 290 });
  assert.ok(read(out, "ref-samples.jsonl").startsWith(read(first, "ref-samples.jsonl")));
  assert.deepEqual(lines(out, "ref-samples.jsonl").slice(2), [{ t: MANUAL_T, ask100: 290, src: "manual" }]);
  assert.deepEqual(readJson(out, "latest.json"), { t: MANUAL_T, fetchedAt: MANUAL_T, ask100: 290, listings: null, ladder: [], src: "manual" });
  assert.equal(result.added, 0);
  assert.equal(result.manualAdded, true);
  assert.equal(result.ageHours, 0);
});

test("手動補一筆、參考站格式壞了：一樣不丟錯", async () => {
  const out = tmp();
  const result = await runCollect({ dataDir: tmp(), outDir: out, now: NOW, getRef: async () => ({ servers: {} }), manualAsk100: 290 });
  assert.deepEqual(lines(out, "ref-samples.jsonl"), [{ t: MANUAL_T, ask100: 290, src: "manual" }]);
  assert.equal(readJson(out, "daily.json").days[0].source, "manual");
  assert.equal(result.manualAdded, true);
});

test("手動補一筆、值不合法：先丟錯、不連參考站、不寫檔", async () => {
  const out = tmp();
  let called = 0;
  const getRef = async () => { called += 1; return FIRST; };
  await assert.rejects(runCollect({ dataDir: tmp(), outDir: out, now: NOW, getRef, manualAsk100: "abc" }), /手動補一筆/);
  await assert.rejects(runCollect({ dataDir: tmp(), outDir: out, now: NOW, getRef, manualAsk100: 5000 }), /10～2000/);
  assert.equal(called, 0);
  assert.equal(fs.existsSync(path.join(out, DIR)), false);
});

test("手動補一筆沒填（空字串、null）：跟平常一樣，latest 標 src ref，結果沒有 manualAdded", async () => {
  const out = tmp();
  const result = await runCollect({ dataDir: tmp(), outDir: out, now: NOW, getRef: async () => FIRST, manualAsk100: "" });
  assert.equal(readJson(out, "latest.json").src, "ref");
  assert.equal("manualAdded" in result, false);
  assert.equal(lines(out, "ref-samples.jsonl").some(row => "src" in row), false, "參考站的列不加 src");
});

test("手動這一筆的時間不比最後一筆新：不寫進去、manualAdded false（latest 照參考站）", async () => {
  const data = tmp();
  fs.mkdirSync(path.join(data, DIR), { recursive: true });
  fs.writeFileSync(path.join(data, DIR, "ref-samples.jsonl"), `{"t":"${MANUAL_T}","ask100":330}\n`);
  const out = tmp();
  const result = await runCollect({ dataDir: data, outDir: out, now: NOW, getRef: async () => FIRST, manualAsk100: 280 });
  assert.equal(result.manualAdded, false);
  assert.equal(lines(out, "ref-samples.jsonl").some(row => row.src === "manual"), false);
  assert.equal(readJson(out, "latest.json").src, "ref");
});

test("手動這一筆不比最後一筆新、參考站又抓不到：丟錯（不要默默沒寫）", async () => {
  const data = tmp();
  fs.mkdirSync(path.join(data, DIR), { recursive: true });
  fs.writeFileSync(path.join(data, DIR, "ref-samples.jsonl"), `{"t":"${MANUAL_T}","ask100":330}\n`);
  const out = tmp();
  await assert.rejects(runCollect({ dataDir: data, outDir: out, now: NOW, getRef: async () => { throw new Error("HTTP 503"); }, manualAsk100: 280 }), /不比最後一筆新/);
  assert.equal(fs.existsSync(path.join(out, DIR)), false);
});

test("手動寫過之後，下一輪平常的收集接得上：參考站新的列接在手動那筆後面，latest 回到參考站", async () => {
  const first = tmp();
  await runCollect({ dataDir: tmp(), outDir: first, now: NOW, getRef: async () => FIRST, manualAsk100: 280 });
  const next = refJson("2026-10-13T18:40:00+08:00", [h("2026-10-13T14:40:59+08:00", 300), h("2026-10-13T18:40:00+08:00", 305)], 305, 79);
  const out = tmp();
  await runCollect({ dataDir: first, outDir: out, now: new Date("2026-10-13T11:00:00Z"), getRef: async () => next });
  assert.deepEqual(lines(out, "ref-samples.jsonl").slice(3), [{ t: "2026-10-13T18:40:00+08:00", ask100: 305, listings: 79 }]);
  assert.deepEqual(readJson(out, "latest.json"), { t: "2026-10-13T18:40:00+08:00", fetchedAt: "2026-10-13T19:00:00+08:00", ask100: 305, listings: 79, ladder: [[250, 2], [300, 5]], src: "ref" });
});

// ---------- 審查修正：手動列不擋參考站舊資料補回來 ----------

test("參考站停更期間手動補一筆，之後參考站恢復、回補比手動那筆更早的列：照樣接上、進每日；ageHours 與 latest 看時間最大的那筆", async () => {
  const first = tmp();
  await runCollect({ dataDir: tmp(), outDir: first, now: new Date("2026-10-13T07:00:00Z"), getRef: async () => FIRST });
  const afterManual = tmp();
  await runCollect({ dataDir: first, outDir: afterManual, now: NOW, getRef: async () => { throw new Error("HTTP 503"); }, manualAsk100: 280 });
  // 參考站恢復：歷史裡有 15:40（比手動那筆 16:17 早、比最後一筆參考站列 14:40:59 新）
  const back = refJson("2026-10-13T15:40:00+08:00", [h("2026-10-13T14:40:59+08:00", 300), h("2026-10-13T15:40:00+08:00", 305)], 305, 79);
  const out = tmp();
  const result = await runCollect({ dataDir: afterManual, outDir: out, now: new Date("2026-10-13T08:30:00Z"), getRef: async () => back });
  assert.ok(read(out, "ref-samples.jsonl").startsWith(read(afterManual, "ref-samples.jsonl")), "檔案只變長");
  assert.deepEqual(lines(out, "ref-samples.jsonl").slice(3), [{ t: "2026-10-13T15:40:00+08:00", ask100: 305, listings: 79 }]);
  assert.equal(result.added, 1);
  const day = readJson(out, "daily.json").days.at(-1);
  assert.deepEqual([day.date, day.samples, day.source, day.close], ["2026-10-13", 3, "mixed", 3571.4]);
  assert.equal(result.ageHours, 0.2, "16:17 到 16:30，不是檔案最後一列（15:40）算的 0.8");
  assert.deepEqual(readJson(out, "latest.json"), { t: MANUAL_T, fetchedAt: "2026-10-13T16:30:00+08:00", ask100: 280, listings: null, ladder: [], src: "manual" });
});

test("手動那筆要比「任何一種列裡時間最大的」嚴格新，不是只比檔案最後一列", async () => {
  const data = tmp();
  fs.mkdirSync(path.join(data, DIR), { recursive: true });
  // 檔案最後一列是 15:00，但前面有一筆 16:00 的手動
  fs.writeFileSync(path.join(data, DIR, "ref-samples.jsonl"), '{"t":"2026-10-13T16:00:00+08:00","ask100":280,"src":"manual"}\n{"t":"2026-10-13T15:00:00+08:00","ask100":300}\n');
  const out = tmp();
  const result = await runCollect({ dataDir: data, outDir: out, now: new Date("2026-10-13T07:30:00Z"), getRef: async () => FIRST, manualAsk100: 290 });
  assert.equal(result.manualAdded, false);
  assert.equal(lines(out, "ref-samples.jsonl").length, 2);
  assert.equal(readJson(out, "latest.json").ask100, 280, "最新的是 16:00 那筆手動");
});

test("參考站列的比新舊只看參考站自己的列：手動列的時間比較晚也不擋", async () => {
  const data = tmp();
  fs.mkdirSync(path.join(data, DIR), { recursive: true });
  fs.writeFileSync(path.join(data, DIR, "ref-samples.jsonl"), '{"t":"2026-10-13T14:00:00+08:00","ask100":300}\n{"t":"2026-10-13T18:00:00+08:00","ask100":280,"src":"manual"}\n');
  const out = tmp();
  const ref = refJson("2026-10-13T16:00:00+08:00", [h("2026-10-13T16:00:00+08:00", 310)], 310, 70);
  const result = await runCollect({ dataDir: data, outDir: out, now: new Date("2026-10-13T11:00:00Z"), getRef: async () => ref });
  assert.equal(result.added, 1);
  assert.equal(result.t, "2026-10-13T18:00:00+08:00");
});
