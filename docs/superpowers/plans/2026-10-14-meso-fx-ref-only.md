# 楓幣匯率（v0.96）第一段補充：改成只用參考站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收集程式不再連 8591，只抓參考站 `price.json`：把新的雪吉拉市價接進 `fx-data` 的 `ref-samples.jsonl`，重算 `latest.json`、`daily.json`；每 2 小時一次；參考站抓不到、推不上、超過 12 小時沒更新就開 issue。

**Architecture:** 延續第一段（`docs/superpowers/plans/2026-10-13-meso-fx-collect.md`，Task 1–11 已完成）的結構：純函式在 `pipeline/fx/lib/`、`collect.mjs`／`publish.mjs`／`notify.mjs` 是 workflow 的進入點、`fx-collect.yml` 三個 job。拿掉 8591 專用的五個模組，`ref.mjs`／`daily.mjs`／`run.mjs` 改成只吃參考站的資料。

**Tech Stack:** Node 22（內建 `fetch`、`node:test`，不加套件）、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-10-13-meso-fx-design.md`——「10/14 改版」那節蓋過其他段落。

## Global Constraints

- 全程繁體中文（程式碼識別字英文）；註解寫「為什麼」。不加任何 npm 套件。
- **不連 8591**：`pipeline/fx/**` 裡不准再出現 `8591.com.tw` 的網址或抓 8591 的程式。
- 參考站 User-Agent 固定 `MapleBook-fx/1.0 (+https://github.com/clarkher/maplestory-tool; meso rate)`。
- 內部單位 `ask100`＝每 100 元台幣換幾萬楓幣；1 億楓幣＝`1,000,000 ÷ ask100` 元、1 元＝`ask100 ÷ 100` 萬。
- `fx-data` 只放三個資料檔（`ref-samples.jsonl`、`latest.json`、`daily.json`）＋`README.md`、`vercel.json`；`ref-samples.jsonl` 只能變長。
- workflow 的 `run:` 裡不准出現 `${{ }}`。
- commit 訊息 `v0.96 (n/13): …` 開頭、結尾空一行加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 跑測試用 PowerShell：`node --test pipeline/fx/lib/<檔>.test.mjs`；全部：`node --test "pipeline/**/*.test.mjs"`。
- Edit／Write 工具會把「反斜線 u 加四碼」轉成真字元：不要寫這種跳脫。

---

### Task 12：資料程式改成只吃參考站

**Files:**
- Delete: `pipeline/fx/lib/nuxt.mjs`、`nuxt.test.mjs`、`rate.mjs`、`rate.test.mjs`、`market.mjs`、`market.test.mjs`、`volume.mjs`、`volume.test.mjs`、`fetch8591.mjs`、`fetch8591.test.mjs`
- Modify（整檔換掉）：`pipeline/fx/lib/ref.mjs`、`ref.test.mjs`、`daily.mjs`、`daily.test.mjs`、`run.mjs`、`run.test.mjs`、`pipeline/fx/collect.mjs`
- Modify：`pipeline/fx/lib/artifact.mjs`（拿掉 state.json 那行、ask100 要有限數；檔頭「五個」改「三個」、「兩個 .jsonl」改「.jsonl」）、`artifact.test.mjs`（整檔換掉）

**Interfaces:**
- Produces：
  - `ref.mjs`：`REF_URL`、`REF_PAGE = "https://maple-classic-wiki.pages.dev/price"`、`SERVER = "雪吉拉"`、`LADDER_WIDTH = 10`、`USER_AGENT`、`refSnapshot(json)`（同第一段）、`refHistory(json)`（同第一段）、`newRows(json, lastT: number) → { t, ask100, listings? }[]`
  - `daily.mjs`：`taipeiIso(date)`、`taipeiDate(iso)`、`perYi(ask100)`、`dailyBars(rows) → { date, open, high, low, close, closeMesoPerNtd, listings, samples, source: "ref" }[]`
  - `run.mjs`：`DIR = "fx/scania"`、`FILES = ["ref-samples.jsonl", "latest.json", "daily.json"]`、`runCollect({ dataDir, outDir, now?, getRef }) → Promise<{ t, ask100, added, ageHours }>`（參考站抓不到或格式不對就 throw，不寫檔）
  - `collect.mjs`：CLI 同第一段；`GITHUB_OUTPUT` 只寫 `ageHours=<數字>`

- [ ] **Step 1：刪掉 8591 專用的五個模組與測試**

```bash
git rm -q pipeline/fx/lib/nuxt.mjs pipeline/fx/lib/nuxt.test.mjs pipeline/fx/lib/rate.mjs pipeline/fx/lib/rate.test.mjs pipeline/fx/lib/market.mjs pipeline/fx/lib/market.test.mjs pipeline/fx/lib/volume.mjs pipeline/fx/lib/volume.test.mjs pipeline/fx/lib/fetch8591.mjs pipeline/fx/lib/fetch8591.test.mjs
```

- [ ] **Step 2：寫失敗的測試——`pipeline/fx/lib/ref.test.mjs` 整檔換成**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { USER_AGENT, newRows, refHistory, refSnapshot } from "./ref.mjs";

// 參考站 price.json 的格式（10/13 實測），只留用得到的欄位
const json = {
  t: "2026-10-13T14:40:59+08:00",
  servers: {
    雪吉拉: { ask: 300, median: 177, n: 82, dist: [[10, 3], [250, 6], [257.5, 1], [300, 10], [357, 1]] },
    菇菇寶貝: { ask: 310, n: 54, dist: [] },
  },
  history: [
    { t: "2026-10-13T12:40:00+08:00", m: 3, 雪吉拉_ask: 300, 菇菇寶貝_ask: 320 },
    { t: "2026-10-08T12:41:16+08:00", m: 3, 雪吉拉_ask: 330 },
    { t: "2026-08-20T10:00:00+08:00", m: 2, 雪吉拉: 150 },
    { t: "2026-10-09T08:00:00+08:00", m: 3, 雪吉拉_ask: null },
    { t: "壞掉的時間", m: 3, 雪吉拉_ask: 300 },
  ],
};

test("User-Agent 老實寫是誰、附 repo 網址，全是 ASCII（header 不能放中文）", () => {
  assert.equal(USER_AGENT, "MapleBook-fx/1.0 (+https://github.com/clarkher/maplestory-tool; meso rate)");
  assert.match(USER_AGENT, /^[\x20-\x7e]+$/);
});

test("當下市價、筆數、價位分布（每 10 萬一桶）", () => {
  assert.deepEqual(refSnapshot(json), {
    t: "2026-10-13T14:40:59+08:00",
    ask100: 300,
    listings: 82,
    ladder: [[10, 3], [250, 7], [300, 10], [350, 1]],
  });
});

test("格式不對（沒有這個伺服器、市價不是正數、沒有時間）回 null", () => {
  assert.equal(refSnapshot({ ...json, servers: {} }), null);
  assert.equal(refSnapshot({ ...json, servers: { 雪吉拉: { ask: 0 } } }), null);
  assert.equal(refSnapshot({ ...json, t: undefined }), null);
  assert.equal(refSnapshot(null), null);
});

test("歷史：只收市價口徑（m=3）、數字正常、時間正常的，由舊到新", () => {
  assert.deepEqual(refHistory(json), [
    { t: "2026-10-08T12:41:16+08:00", ask100: 330 },
    { t: "2026-10-13T12:40:00+08:00", ask100: 300 },
  ]);
  assert.deepEqual(refHistory({}), []);
});

// 10/14 實測：當下的 t 跟 history 最後一筆的 t 是同一個字串
const live = {
  t: "2026-10-14T06:41:16+08:00",
  servers: { 雪吉拉: { ask: 300, n: 90, dist: [] } },
  history: [
    { t: "2026-10-14T02:41:00+08:00", m: 3, 雪吉拉_ask: 310 },
    { t: "2026-10-14T04:41:00+08:00", m: 3, 雪吉拉_ask: 305 },
    { t: "2026-10-14T06:41:16+08:00", m: 3, 雪吉拉_ask: 300 },
  ],
};

test("newRows：只接比檔案最後一筆新的；跟當下市價同一刻的那筆補上掛單數", () => {
  assert.deepEqual(newRows(live, Date.parse("2026-10-14T02:41:00+08:00")), [
    { t: "2026-10-14T04:41:00+08:00", ask100: 305 },
    { t: "2026-10-14T06:41:16+08:00", ask100: 300, listings: 90 },
  ]);
  assert.equal(newRows(live, -Infinity).length, 3);
  assert.deepEqual(newRows(live, Date.parse("2026-10-14T06:41:16+08:00")), []);
  assert.deepEqual(newRows({}, -Infinity), []);
});
```

- [ ] **Step 3：寫失敗的測試——`pipeline/fx/lib/daily.test.mjs` 整檔換成**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { dailyBars, perYi, taipeiDate, taipeiIso } from "./daily.mjs";

const row = (t, ask100, listings) => (listings === undefined ? { t, ask100 } : { t, ask100, listings });

test("台灣時間：ISO 字串帶 +08:00；跨午夜算隔天", () => {
  assert.equal(taipeiIso(new Date("2026-10-13T08:17:05.123Z")), "2026-10-13T16:17:05+08:00");
  assert.equal(taipeiDate("2026-10-13T16:30:00Z"), "2026-10-14");
  assert.equal(taipeiDate("2026-10-13T23:59:00+08:00"), "2026-10-13");
});

test("1 億楓幣幾元＝1,000,000 ÷ 每 100 元換幾萬", () => {
  assert.equal(perYi(300), 3333.3);
  assert.equal(perYi(357.14), 2800);
});

test("每日：單位換成元／億後才取開高低收（匯率越高楓幣越便宜，最高最低要倒過來）", () => {
  const [day] = dailyBars([row("2026-10-13T08:00:00+08:00", 300), row("2026-10-13T12:00:00+08:00", 250), row("2026-10-13T20:00:00+08:00", 320)]);
  assert.deepEqual(day, { date: "2026-10-13", open: 3333.3, high: 4000, low: 3125, close: 3125, closeMesoPerNtd: 3.2, listings: null, samples: 3, source: "ref" });
});

test("每日：輸入沒照時間排也行；跨午夜分兩天；掛單數取當天最後一筆有記的", () => {
  const days = dailyBars([
    row("2026-10-14T00:41:00+08:00", 300, 88),
    row("2026-10-13T22:41:00+08:00", 310, 90),
    row("2026-10-13T20:41:00+08:00", 320, 95),
    row("2026-10-14T02:41:00+08:00", 300),
  ]);
  assert.deepEqual(days.map(d => [d.date, d.open, d.close, d.listings, d.samples]), [
    ["2026-10-13", 3125, 3225.8, 90, 2],
    ["2026-10-14", 3333.3, 3333.3, 88, 2],
  ]);
});

test("每日：市價壞掉（0、字串）或時間壞掉的列跳過，不讓整天變成 NaN", () => {
  const [day] = dailyBars([row("2026-10-13T08:00:00+08:00", 0), row("2026-10-13T10:00:00+08:00", "300"), row("壞掉", 300), row("2026-10-13T12:00:00+08:00", 300)]);
  assert.equal(day.samples, 1);
  assert.equal(day.close, 3333.3);
});

test("每日：沒有資料就是空陣列", () => {
  assert.deepEqual(dailyBars([]), []);
});
```

- [ ] **Step 4：寫失敗的測試——`pipeline/fx/lib/run.test.mjs` 整檔換成**

```js
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
```

- [ ] **Step 5：寫失敗的測試——`pipeline/fx/lib/artifact.test.mjs` 整檔換成**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkArtifact, installArtifact } from "./artifact.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "fx-artifact-"));
function write(dir, files) {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}
const OLD_LINE = '{"t":"2026-10-13T12:40:00+08:00","ask100":310}\n';
const good = () => ({
  "fx/scania/ref-samples.jsonl": `${OLD_LINE}{"t":"2026-10-13T14:40:59+08:00","ask100":300,"listings":82}\n`,
  "fx/scania/latest.json": '{"t":"2026-10-13T14:40:59+08:00","ask100":300}',
  "fx/scania/daily.json": '{"server":"雪吉拉","days":[]}',
});

test("三個檔都在、都讀得懂、舊的 jsonl 原封不動接上新的一行：通過", () => {
  const branch = write(tmp(), { "fx/scania/ref-samples.jsonl": OLD_LINE });
  assert.doesNotThrow(() => checkArtifact(write(tmp(), good()), branch));
});

test("第一次（fx-data 還沒有這個檔）也通過", () => {
  assert.doesNotThrow(() => checkArtifact(write(tmp(), good()), tmp()));
});

test("多一個檔、少一個檔都不行", () => {
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/x.html": "<script>" }), tmp()), /檔案不對/);
  const missing = good();
  delete missing["fx/scania/daily.json"];
  assert.throws(() => checkArtifact(write(tmp(), missing), tmp()), /檔案不對/);
});

test("JSON 壞掉不行", () => {
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/latest.json": "{oops" }), tmp()), /latest\.json/);
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/ref-samples.jsonl": "{oops}\n" }), tmp()), /ref-samples\.jsonl/);
});

test("最新一筆市價不是有限正數、每日沒有 days 陣列不行", () => {
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/latest.json": '{"ask100":0}' }), tmp()), /latest\.json/);
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/latest.json": '{"ask100":1e999}' }), tmp()), /latest\.json/);
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/daily.json": '{"days":null}' }), tmp()), /daily\.json/);
});

test("jsonl 改了舊行、或整個變短，都不行", () => {
  const changed = write(tmp(), { "fx/scania/ref-samples.jsonl": '{"t":"2026-10-12T16:17:00+08:00","ask100":280}\n' });
  assert.throws(() => checkArtifact(write(tmp(), good()), changed), /只能接在後面/);
  const longer = write(tmp(), { "fx/scania/ref-samples.jsonl": `${good()["fx/scania/ref-samples.jsonl"]}{"t":"2026-10-13T16:40:00+08:00","ask100":310}\n` });
  assert.throws(() => checkArtifact(write(tmp(), good()), longer), /只能接在後面/);
});

test("installArtifact：三個檔＋分支說明、vercel.json 放進工作目錄", () => {
  const out = write(tmp(), good());
  const branch = tmp();
  const statics = write(tmp(), { "README.md": "# fx-data", "vercel.json": '{"git":{"deploymentEnabled":false}}' });
  installArtifact(out, branch, statics);
  assert.equal(fs.readFileSync(path.join(branch, "vercel.json"), "utf8"), '{"git":{"deploymentEnabled":false}}');
  assert.equal(fs.readFileSync(path.join(branch, "fx/scania/daily.json"), "utf8"), good()["fx/scania/daily.json"]);
});
```

- [ ] **Step 6：跑測試確認失敗**

Run：`node --test pipeline/fx/lib/ref.test.mjs pipeline/fx/lib/daily.test.mjs pipeline/fx/lib/run.test.mjs pipeline/fx/lib/artifact.test.mjs`
Expected：FAIL——`newRows`、`USER_AGENT` 不是 ref.mjs 的 export；daily 的 `source`、`listings` 不對；run 的檔案數、回傳值不對；artifact 還在找 state.json。

- [ ] **Step 7：`pipeline/fx/lib/ref.mjs` 整檔換成**

```js
/**
 * 楓幣匯率的資料來源：參考站（maple-classic-wiki.pages.dev/price）的 price.json。
 * 它每 2 小時整理一次 8591 公開掛單的市價（排除代練與引流單、MAD 去離群、最便宜四分之一的中位數）。
 * 我們不直接抓 8591：它的服務條款禁止爬蟲，10/13 實測也會擋老實寫身分的程式，使用者 10/14 拍板不繞過。
 * history 只留最近 60 筆（約 5 天），所以每次把新的接進 fx-data 存起來。
 * m=3 起是「市價」口徑，之前是全部掛單中位數——口徑不同，不收。
 */
export const REF_URL = "https://maple-classic-wiki.pages.dev/data/price.json";
export const REF_PAGE = "https://maple-classic-wiki.pages.dev/price";
export const SERVER = "雪吉拉";
export const LADDER_WIDTH = 10;
export const USER_AGENT = "MapleBook-fx/1.0 (+https://github.com/clarkher/maplestory-tool; meso rate)";

const isPositive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
const isTime = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export function refSnapshot(json, server = SERVER) {
  const current = json?.servers?.[server];
  if (!current || !isPositive(current.ask) || !isTime(json.t)) return null;
  const counts = new Map();
  for (const pair of Array.isArray(current.dist) ? current.dist : []) {
    const [rate, count] = Array.isArray(pair) ? pair : [];
    if (!isPositive(rate) || !Number.isInteger(count) || count <= 0) continue;
    const floor = Math.floor(rate / LADDER_WIDTH) * LADDER_WIDTH;
    counts.set(floor, (counts.get(floor) ?? 0) + count);
  }
  return {
    t: json.t,
    ask100: current.ask,
    listings: Number.isInteger(current.n) ? current.n : null,
    ladder: [...counts].sort((a, b) => a[0] - b[0]),
  };
}

export function refHistory(json, server = SERVER) {
  const rows = Array.isArray(json?.history) ? json.history : [];
  return rows
    .filter(row => row && row.m === 3 && isPositive(row[`${server}_ask`]) && isTime(row.t))
    .map(row => ({ t: row.t, ask100: row[`${server}_ask`] }))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

/**
 * 這次要接進 ref-samples.jsonl 的列：比檔案最後一筆（lastT，毫秒）新的歷史。
 * 掛單數只有當下那一刻有（歷史沒記），跟當下市價同一刻的那筆補上去。
 */
export function newRows(json, lastT, server = SERVER) {
  const now = refSnapshot(json, server);
  return refHistory(json, server)
    .filter(row => Date.parse(row.t) > lastT)
    .map(row => (now && row.t === now.t && now.listings !== null ? { ...row, listings: now.listings } : row));
}
```

- [ ] **Step 8：`pipeline/fx/lib/daily.mjs` 整檔換成**

```js
/**
 * 每天一根 K 棒（台灣時間 00:00–24:00），資料是參考站每 2 小時一筆的市價（ref-samples.jsonl 的列：{ t, ask100, listings? }）。
 * 價格先換成「1 億楓幣幾元」才取開高低收：ask100 越大楓幣越便宜，直接取最高最低會倒過來。
 * 掛單數只有我們抓到的那幾刻才有（參考站的歷史沒記），取當天最後一筆有記的。
 * 壞掉的列（市價不是有限正數、時間讀不懂）跳過，不讓一筆壞資料把整天變成 NaN。
 */
const HOUR = 3600 * 1000;

export function taipeiIso(date) {
  return `${new Date(date.getTime() + 8 * HOUR).toISOString().slice(0, 19)}+08:00`;
}

export function taipeiDate(iso) {
  return new Date(Date.parse(iso) + 8 * HOUR).toISOString().slice(0, 10);
}

const round1 = value => Math.round(value * 10) / 10;
const round2 = value => Math.round(value * 100) / 100;

export const perYi = ask100 => round1(1_000_000 / ask100);

const isValid = row => typeof row?.ask100 === "number" && Number.isFinite(row.ask100) && row.ask100 > 0 && Number.isFinite(Date.parse(row.t));

export function dailyBars(rows) {
  const byDate = new Map();
  for (const row of rows.filter(isValid).sort((a, b) => Date.parse(a.t) - Date.parse(b.t))) {
    const date = taipeiDate(row.t);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(row);
  }
  // 照時間排過才分組，Map 的順序就是日期由舊到新
  return [...byDate].map(([date, day]) => {
    const values = day.map(row => perYi(row.ask100));
    return {
      date,
      open: values[0],
      high: Math.max(...values),
      low: Math.min(...values),
      close: values.at(-1),
      closeMesoPerNtd: round2(day.at(-1).ask100 / 100),
      listings: day.filter(row => Number.isInteger(row.listings)).at(-1)?.listings ?? null,
      samples: day.length,
      source: "ref",
    };
  });
}
```

- [ ] **Step 9：`pipeline/fx/lib/run.mjs` 整檔換成**

```js
/**
 * 一次收集：抓參考站 price.json → 把比 fx-data 新的市價接進 ref-samples.jsonl → 重算 latest.json、daily.json，寫到輸出資料夾。
 * 抓取函式用參數傳進來，測試不用連網。ref-samples.jsonl 只接在舊內容後面（publish 會檢查只變長）。
 * 參考站抓不到或格式不對就丟錯、不寫檔：這一輪沒有資料，workflow 變紅、notify 開 issue。
 */
import fs from "node:fs";
import path from "node:path";
import { dailyBars, taipeiIso } from "./daily.mjs";
import { REF_PAGE, newRows, refSnapshot } from "./ref.mjs";

export const DIR = "fx/scania";
export const FILES = ["ref-samples.jsonl", "latest.json", "daily.json"];

const parseLines = text => text.split("\n").filter(line => line.trim()).map(line => JSON.parse(line));
const withNewline = text => (text && !text.endsWith("\n") ? `${text}\n` : text);

export async function runCollect({ dataDir, outDir, now = new Date(), getRef }) {
  const json = await getRef();
  const snapshot = refSnapshot(json);
  if (!snapshot) throw new Error("參考站 price.json 格式不對（找不到雪吉拉的市價）");

  const file = path.join(dataDir, DIR, "ref-samples.jsonl");
  let text = withNewline(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
  const old = parseLines(text);
  const added = newRows(json, old.length ? Date.parse(old.at(-1).t) : -Infinity);
  for (const row of added) text += `${JSON.stringify(row)}\n`;

  const t = taipeiIso(now);
  const latest = { t: snapshot.t, fetchedAt: t, ask100: snapshot.ask100, listings: snapshot.listings, ladder: snapshot.ladder };
  const daily = { server: "雪吉拉", unit: "元／1 億楓幣", source: REF_PAGE, updatedAt: t, days: dailyBars(parseLines(text)) };

  const dir = path.join(outDir, DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "ref-samples.jsonl"), text);
  fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(latest));
  fs.writeFileSync(path.join(dir, "daily.json"), JSON.stringify(daily));

  // 參考站上一次更新離現在幾小時：它每 2 小時更新，notify 在 12 小時以上時開 issue（可能停了）
  const ageHours = Math.round(((now.getTime() - Date.parse(snapshot.t)) / 3600000) * 10) / 10;
  return { t: snapshot.t, ask100: snapshot.ask100, added: added.length, ageHours };
}
```

- [ ] **Step 10：`pipeline/fx/collect.mjs` 整檔換成**

```js
/**
 * 楓幣匯率收集的排程進入點（.github/workflows/fx-collect.yml 的 collect job 跑它）。
 *
 *   node pipeline/fx/collect.mjs <fx-data 分支的 checkout（第一次可以是空資料夾）> <輸出資料夾>
 *
 * 抓參考站 price.json，把 fx/scania/ 的三個檔寫到輸出資料夾（不動 fx-data 那份）。抓不到或格式不對就 exit 1。
 * 有 GITHUB_OUTPUT 時寫 ageHours（參考站上一次更新離現在幾小時）給 notify。
 * 本機試跑：輸出資料夾給 scratchpad，跑完看 fx/scania/latest.json。
 */
import fs from "node:fs";
import { REF_URL, USER_AGENT } from "./lib/ref.mjs";
import { runCollect } from "./lib/run.mjs";

const [dataDir, outDir] = process.argv.slice(2);
if (!dataDir || !outDir) {
  console.error("用法：node pipeline/fx/collect.mjs <fx-data 資料夾> <輸出資料夾>");
  process.exit(2);
}

async function getRef() {
  const response = await fetch(REF_URL, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`參考站 HTTP ${response.status}`);
  // 當文字讀、自己 JSON.parse：外站的內容只當資料
  return JSON.parse(await response.text());
}

const result = await runCollect({ dataDir, outDir, getRef });
console.log(JSON.stringify(result));
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ageHours=${result.ageHours}\n`);
```

- [ ] **Step 11：改 `pipeline/fx/lib/artifact.mjs`**

三處：
1. 檔頭第 3、4 行改成：
   ```
    * 只准 fx/scania/ 底下那三個一般檔案（不能有連結、隱藏檔、多的檔），每個都讀得懂，
    * .jsonl 必須是舊內容原封不動接上新的（歷史只會變長）。全部用 readFileSync＋JSON.parse，不 require、不 import。
   ```
2. 刪掉 `parse("state.json", read("state.json"));` 這一行。
3. ask100 的檢查改成：
   ```js
     if (!(Number.isFinite(latest?.ask100) && latest.ask100 > 0)) throw new Error("latest.json 的 ask100 不是有限的正數");
   ```

- [ ] **Step 12：跑測試確認通過**

Run：`node --test pipeline/fx/lib/ref.test.mjs pipeline/fx/lib/daily.test.mjs pipeline/fx/lib/run.test.mjs pipeline/fx/lib/artifact.test.mjs`
Expected：PASS（ref 5、daily 6、run 5、artifact 7）。
再跑全部 `node --test "pipeline/**/*.test.mjs"`：notify-decide、fx-collect-workflow 的測試這一步還是舊的，應該照樣過（它們沒 import 被刪的模組）。
最後確認 `grep -rn "8591.com.tw" pipeline/fx` 沒有結果。

- [ ] **Step 13：Commit**

```bash
git add -A pipeline/fx
git commit -m "v0.96 (12/13): 楓幣匯率——不再抓 8591（它擋爬蟲，使用者 10/14 選不繞過），改成只接參考站的市價：fx-data 剩 ref-samples、latest、daily 三個檔"
```

---

### Task 13：通知、排程、說明改成參考站版

**Files:**
- Modify（整檔換掉）：`pipeline/fx/lib/notify-decide.mjs`、`pipeline/fx/lib/notify-decide.test.mjs`、`.github/workflows/fx-collect.yml`、`pipeline/fx/branch-files/README.md`
- Modify：`pipeline/fx/notify.mjs`（decide 的參數、檔頭環境變數）、`pipeline/fx/lib/notify-issue.mjs`（兩句寫到 8591 的字）、`pipeline/lib/fx-collect-workflow.test.mjs`（排程、notify 環境變數，加三個小檢查）、`README.md`（「## 楓幣匯率收集」整節換掉）

**Interfaces:**
- Consumes：collect.mjs 的 `GITHUB_OUTPUT` `ageHours`（Task 12）
- Produces：`decide({ write, collectResult, publishResult, ageHours })`、`STALE_HOURS = 12`；notify.mjs 讀 `AGE_HOURS`

- [ ] **Step 1：`pipeline/fx/lib/notify-decide.test.mjs` 整檔換成（先寫測試）**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { decide } from "./notify-decide.mjs";

const base = { write: "true", collectResult: "success", publishResult: "success", ageHours: "1.5" };

test("抓到了、推上去了、資料不舊：關掉開著的 issue", () => {
  assert.equal(decide(base).action, "close");
  assert.equal(decide({ ...base, ageHours: "11.9" }).action, "close");
});

test("參考站抓不到或格式變了（collect 紅）：開 issue", () => {
  const result = decide({ ...base, collectResult: "failure", publishResult: "skipped", ageHours: "" });
  assert.equal(result.action, "open");
  assert.match(result.reason, /參考站/);
});

test("推不上 fx-data：開 issue", () => {
  const result = decide({ ...base, publishResult: "failure" });
  assert.equal(result.action, "open");
  assert.match(result.reason, /fx-data/);
});

test("參考站 12 小時以上沒更新（可能停了）：開 issue", () => {
  const result = decide({ ...base, ageHours: "12" });
  assert.equal(result.action, "open");
  assert.match(result.reason, /12 小時/);
});

test("不寫入的測試跑法、被取消的：什麼都不做", () => {
  assert.equal(decide({ ...base, write: "false", collectResult: "failure" }).action, "none");
  assert.equal(decide({ ...base, collectResult: "cancelled", publishResult: "skipped" }).action, "none");
});
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node --test pipeline/fx/lib/notify-decide.test.mjs`
Expected：FAIL（舊的 decide 沒有 ageHours 規則，「12 小時」那條拿到 close）

- [ ] **Step 3：`pipeline/fx/lib/notify-decide.mjs` 整檔換成**

```js
/**
 * 楓幣匯率收集要不要開／關 issue（fx-collect.yml 的 notify job）。
 * 開：參考站抓不到或格式變了（collect 紅）、推不上 fx-data、參考站 12 小時以上沒更新
 *     （它每 2 小時更新一次，停了頁面就一直是舊數字）。
 * 關：抓到了、推上去了、資料不舊。不寫入的測試跑法不通知。
 */
export const LABEL = "匯率收集失敗";
export const STALE_HOURS = 12;

export function decide({ write, collectResult, publishResult, ageHours }) {
  if (write !== "true") return { action: "none", reason: "測試跑法（沒有寫入），不通知" };
  if (collectResult === "failure") return { action: "open", reason: "參考站的 price.json 抓不到或格式變了，這一輪沒有資料" };
  if (publishResult === "failure") return { action: "open", reason: "資料算好了但推不上 fx-data 分支" };
  if (Number(ageHours) >= STALE_HOURS) return { action: "open", reason: `參考站已經 ${ageHours} 小時沒更新（可能停了），頁面上的匯率會一直是舊的` };
  if (collectResult === "success" && publishResult === "success") return { action: "close", reason: "恢復正常" };
  return { action: "none", reason: "沒有要通知的" };
}
```

- [ ] **Step 4：改 `pipeline/fx/notify.mjs` 與 `pipeline/fx/lib/notify-issue.mjs`**

notify.mjs：
- 檔頭環境變數那行的 `OK_8591、FAIL_8591` 改成 `AGE_HOURS`。
- 呼叫 decide 的參數物件裡，`ok8591: …`、`fail8591: …` 兩行換成一行 `ageHours: env.AGE_HOURS ?? "",`。

notify-issue.mjs（兩句寫死 8591 的字，跟資料來源不符了）：
- label 說明 `…失敗時自動開的，8591 恢復會自動關` 改成 `…失敗時自動開的，恢復正常會自動關`。
- issue 內文結尾 `8591 恢復正常會自動關這張。` 改成 `恢復正常會自動關這張。`
- 如果 `notify-issue.test.mjs` 有斷言到這兩句原文，一起改成新字。

- [ ] **Step 5：`pipeline/lib/fx-collect-workflow.test.mjs` 改四處**

1. 第一個測試的標題改成 `每 2 小時跑一次（台灣 00:55 起），可以手動跑，合進 dev 時改到收集程式也跑一次`，cron 那行斷言改成：
   ```js
     assert.match(CODE, /\n {2}schedule:\n {4}- cron: "55 \*\/2 \* \* \*"\n/);
   ```
2. 「publish 只在 collect 成功…」那個測試最後加一行（推之前不准有 push）：
   ```js
     assert.doesNotMatch(publish.slice(0, publish.indexOf("publish.mjs")), /\bgit (?:-C \S+ )?push\b/, "publish.mjs 之前不准推");
   ```
3. 「notify 有 issues: write…」那個測試最後加：
   ```js
     assert.match(notify, /AGE_HOURS: \$\{\{ needs\.collect\.outputs\.ageHours \}\}/);
     assert.doesNotMatch(CODE, /OK_8591|FAIL_8591|8591\.com\.tw/);
   ```
4. 檔尾加一個測試：
   ```js
   test("手動跑的 write 預設 false；上傳、下載的 artifact 名稱一樣", () => {
     assert.match(CODE, /\n {6}write:\n(?: {8}.*\n)* {8}default: false\n/);
     const names = [...CODE.matchAll(/\n {10}name: (fx-[\w-]+)\n/g)].map(match => match[1]);
     assert.deepEqual(names, ["fx-out", "fx-out"]);
   });
   ```

- [ ] **Step 6：跑 workflow 測試確認失敗**

Run：`node --test pipeline/lib/fx-collect-workflow.test.mjs`
Expected：FAIL（cron 還是 `17 */4`、notify 還有 OK_8591）

- [ ] **Step 7：`.github/workflows/fx-collect.yml` 整檔換成**

```yaml
name: 楓幣匯率收集

# 每 2 小時抓一次參考站 maple-classic-wiki.pages.dev 的 price.json（它每 2 小時整理一次 8591 公開掛單的雪吉拉市價），
# 把新的市價接進孤兒分支 fx-data（參考站只留最近 60 筆，我們存全部），重算最新一筆與每日 K 棒。
# 頁面跟拍賣查價工具直接讀 raw.githubusercontent.com 上的 fx-data，所以資料更新不用部署；
# fx-data 自己帶 vercel.json 關掉部署（根目錄的 vercel.json 也擋），不吃 Vercel 每天的部署額度。
# 不直接抓 8591：它的服務條款禁止爬蟲，2026-10-13 實測也會擋老實寫身分的程式，使用者 10/14 拍板不繞過。
# 設計：docs/superpowers/specs/2026-10-13-meso-fx-design.md（「10/14 改版」那節）
#
# 三個 job，寫入權限只在 publish：
#  - collect：唯讀。clone fx-data（公開 repo，不用 token）讀舊的紀錄、抓參考站、算好三個檔存 artifact
#  - publish：檢查 artifact（pipeline/fx/publish.mjs）後推上 fx-data。只在 main（排程）、dev（合進 dev 時）或手動勾 write 時跑
#  - notify：參考站抓不到、推不上、參考站 12 小時以上沒更新 → 開 issue（label「匯率收集失敗」）；恢復自動關

on:
  schedule:
    # 台灣時間 00:55 起每 2 小時（參考站在偶數整點 :41 左右更新，晚一點再抓）
    - cron: "55 */2 * * *"
  workflow_dispatch:
    inputs:
      write:
        description: "從 main、dev 以外的分支手動跑時，要不要真的推上 fx-data（main、dev 一律推）"
        type: boolean
        default: false
  push:
    branches: [dev]
    paths:
      - ".github/workflows/fx-collect.yml"
      - "pipeline/fx/**"

env:
  WRITE: ${{ (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/dev' || inputs.write) && 'true' || 'false' }}

concurrency:
  group: fx-collect
  cancel-in-progress: false

jobs:
  collect:
    runs-on: ubuntu-latest
    # 只抓一個 JSON，平常幾秒
    timeout-minutes: 5
    permissions:
      contents: read
    outputs:
      ageHours: ${{ steps.collect.outputs.ageHours }}
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
          sparse-checkout: pipeline/fx

      - uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: 取出 fx-data（第一次還沒有這條分支就從空的開始）
        run: |
          mkdir -p "$RUNNER_TEMP/fx-data"
          if git ls-remote --exit-code --heads "https://github.com/$GITHUB_REPOSITORY.git" fx-data > /dev/null; then
            git clone -q --depth 1 --branch fx-data "https://github.com/$GITHUB_REPOSITORY.git" "$RUNNER_TEMP/fx-data"
          fi

      - name: 抓參考站、算好新檔
        id: collect
        run: node pipeline/fx/collect.mjs "$RUNNER_TEMP/fx-data" "$RUNNER_TEMP/fx-out"

      - name: 存下算好的檔
        uses: actions/upload-artifact@v4
        with:
          name: fx-out
          path: ${{ runner.temp }}/fx-out
          if-no-files-found: error
          retention-days: 1

  publish:
    needs: collect
    # job 的 if 讀不到 env，寫入條件照抄開頭 WRITE 那一個（測試會比對）
    if: needs.collect.result == 'success' && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/dev' || inputs.write)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: write # 推 fx-data
    steps:
      # 只拿 publish.mjs 跟分支說明，token 不留在 .git（推 fx-data 在另一個資料夾，自己帶 header）
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
          sparse-checkout: pipeline/fx
          path: repo

      - uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: 下載算好的檔
        uses: actions/download-artifact@v4
        with:
          name: fx-out
          path: ${{ runner.temp }}/fx-out

      - name: 檢查後推上 fx-data
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          WORK="$RUNNER_TEMP/fx-branch"
          git init -q "$WORK"
          git -C "$WORK" remote add origin "https://github.com/$GITHUB_REPOSITORY.git"
          AUTH=$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)
          echo "::add-mask::$AUTH"
          git -C "$WORK" config http.https://github.com/.extraheader "AUTHORIZATION: basic $AUTH"
          if git -C "$WORK" fetch -q --depth 1 origin fx-data; then
            git -C "$WORK" checkout -q -B fx-data FETCH_HEAD
          else
            git -C "$WORK" symbolic-ref HEAD refs/heads/fx-data
          fi
          node repo/pipeline/fx/publish.mjs "$RUNNER_TEMP/fx-out" "$WORK" repo/pipeline/fx/branch-files
          git -C "$WORK" config user.name "maplestory-tool bot"
          git -C "$WORK" config user.email "actions@github.com"
          git -C "$WORK" add -A
          if git -C "$WORK" diff --cached --quiet; then
            echo "內容沒變，不用推"
            exit 0
          fi
          git -C "$WORK" commit -q -m "fx: 雪吉拉 $(date -u +%Y-%m-%dT%H:%MZ)"
          git -C "$WORK" push -q origin fx-data

  notify:
    needs: [collect, publish]
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read # 拿 pipeline/fx/notify.mjs
      issues: write # 開、改、關 issue，建 label
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
          sparse-checkout: pipeline/fx

      - uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: 失敗開 issue、恢復關 issue
        env:
          GH_TOKEN: ${{ github.token }}
          COLLECT_RESULT: ${{ needs.collect.result }}
          PUBLISH_RESULT: ${{ needs.publish.result }}
          AGE_HOURS: ${{ needs.collect.outputs.ageHours }}
          ASSIGNEE: ${{ github.repository_owner }}
        run: node pipeline/fx/notify.mjs
```

- [ ] **Step 8：`pipeline/fx/branch-files/README.md` 整檔換成**

```markdown
# fx-data：楓幣匯率資料（自動產生，不要手改）

這條分支只放資料，由 `.github/workflows/fx-collect.yml` 每 2 小時寫一次（程式在 main／dev 的 `pipeline/fx/`）。
`vercel.json` 關掉這條分支的部署：資料更新不吃 Vercel 每天的部署額度。

資料來源：[maple-classic-wiki.pages.dev/price](https://maple-classic-wiki.pages.dev/price) 整理的 8591《新楓之谷：經典版》公開掛單市價。
數字是賣家開的價（掛單），不是成交價。

| 檔案 | 內容 |
|---|---|
| `fx/scania/daily.json` | 雪吉拉每天一筆：開高低收（元／1 億楓幣）、`closeMesoPerNtd`（1 元換幾萬楓幣）、掛單數 |
| `fx/scania/latest.json` | 最新一筆：市價、掛單數、價位分布 |
| `fx/scania/ref-samples.jsonl` | 每 2 小時一筆的市價紀錄（參考站只留最近 60 筆，這裡存全部） |

欄位說明見 main 分支的 `docs/superpowers/specs/2026-10-13-meso-fx-design.md`「10/14 改版」。
```

- [ ] **Step 9：`README.md` 的「## 楓幣匯率收集」整節（到下一個 `## ` 之前）換成**

```markdown
## 楓幣匯率收集

`.github/workflows/fx-collect.yml`（workflow「楓幣匯率收集」）每 2 小時（台灣 00:55 起）抓一次參考站
[maple-classic-wiki.pages.dev/price](https://maple-classic-wiki.pages.dev/price) 的 `data/price.json`——它每 2 小時整理一次
8591《新楓之谷：經典版》公開掛單的雪吉拉市價（排除代練與引流單、MAD 去離群、最便宜四分之一的中位數）。
比 `fx-data` 新的市價接進孤兒分支 **`fx-data`**（參考站只留最近 60 筆，這裡存全部），重算最新一筆與每日 K 棒。
設計：`docs/superpowers/specs/2026-10-13-meso-fx-design.md`（「10/14 改版」那節）。

- **不直接抓 8591**：它的服務條款禁止爬蟲，2026-10-13 實測也會擋老實寫身分的程式（403），使用者 10/14 拍板不繞過。
- **不吃部署額度**：`fx-data` 自己帶 `vercel.json` 關掉部署，根目錄 `vercel.json` 也擋 `fx-data`、`price-data`（拍賣查價的資料分支）。
  頁面直接讀 raw.githubusercontent.com，資料更新不用部署。
- **每日匯率（給拍賣查價工具）**：https://raw.githubusercontent.com/clarkher/maplestory-tool/fx-data/fx/scania/daily.json
  ——`days[]` 每天一筆，`close`＝1 億楓幣幾元（當天最後一筆），`closeMesoPerNtd`＝1 元換幾萬楓幣，
  `listings`＝當天最後一次記到的雪吉拉掛單數（沒記到是 null）。
- **程式**：`pipeline/fx/collect.mjs`（進入點）、`pipeline/fx/lib/*.mjs`（純函式，`node --test "pipeline/fx/lib/*.test.mjs"`）。
  本機試跑：`node pipeline/fx/collect.mjs <空資料夾> <輸出資料夾>`。
- **手動跑**：`gh workflow run fx-collect.yml --ref <分支>`（workflow 要先在 main 上才叫得動）；main、dev 以外的分支要加 `-f write=true` 才會推上 `fx-data`。
- **失敗通知**：參考站抓不到或格式變了、推不上 `fx-data`、或參考站 12 小時以上沒更新，開 issue（label「匯率收集失敗」）；恢復正常自動關。
```

- [ ] **Step 10：跑測試確認通過**

Run：`node --test pipeline/fx/lib/notify-decide.test.mjs pipeline/fx/lib/notify-issue.test.mjs pipeline/lib/fx-collect-workflow.test.mjs`，再跑全部 `node --test "pipeline/**/*.test.mjs"`。
Expected：全綠。再確認 `grep -rn "8591.com.tw\|OK_8591\|FAIL_8591" pipeline .github/workflows/fx-collect.yml` 沒有結果。

- [ ] **Step 11：Commit**

```bash
git add pipeline/fx .github/workflows/fx-collect.yml pipeline/lib/fx-collect-workflow.test.mjs README.md
git commit -m "v0.96 (13/13): 楓幣匯率——排程改每 2 小時抓參考站，通知改看參考站抓不到／推不上／12 小時沒更新；README 與 fx-data 說明同步"
```

---

### Task 14：本機真跑一次（controller）

- [ ] 用 Task 1 推上去的 `fx-data`（含 10/14 先存的 60 筆）當資料夾跑：`git clone -q --depth 1 --branch fx-data https://github.com/clarkher/maplestory-tool.git <scratch>/fx-data`，
  `node pipeline/fx/collect.mjs <scratch>/fx-data <scratch>/fx-out2`，然後 `node pipeline/fx/publish.mjs <scratch>/fx-out2 <scratch>/fx-data pipeline/fx/branch-files`（只檢查＋複製，不推）。
  Expected：`added` ≥ 1（接上 10/13 16:41 之後的）、`ageHours` < 3、publish 檢查通過；`daily.json` 從 2026-10-08 起每天一筆。

### Task 15：交付

照第一段計畫的 Task 13 做（推、PR 進 dev、等三條 CI、rebase 合併、證明 dev 觸發的那次 run 綠、查 `fx-data` 沒觸發 Vercel、收集單獨進 main、main 手動跑一次＋等一次 `event: schedule`），差別：
- 進 main 不用 cherry-pick 整串 commit（中間有加了又刪的 8591 模組），改成從 origin/main 開 release 分支後
  `git checkout origin/dev -- vercel.json .github/workflows/fx-collect.yml pipeline/fx pipeline/lib/fx-collect-workflow.test.mjs`，
  README 只貼「## 楓幣匯率收集」那節，一個 commit：`release: 楓幣匯率收集排程（v0.96 第一段，不含頁面）`。
- 通知拍賣查價 session：資料來源改成參考站、每 2 小時、`daily.json` 拿掉 `volNtd`／`volMeso`／`vwap`。
