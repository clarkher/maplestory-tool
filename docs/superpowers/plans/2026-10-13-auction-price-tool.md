# 拍賣查價工具（雪吉拉，自用版）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本機工具：查價清單一鍵複製品名 → 玩家自己 Win+PrtSc 截拍賣「市價」分頁 → Windows 內建文字辨識讀出成交價 → 存進 `price-data` 資料分支，並在本機網頁看中間價、漲跌、台幣換算、走勢。

**Architecture:** 全部在 `tools/price/`，Node 內建模組，不加套件、不進 Next.js 網站。純邏輯（清單、品名比對、解析、檢查、統計、匯率、資料檔）各一個檔、各自 node:test；有副作用的（PowerShell 文字辨識、資料夾監看、git、http）包薄薄一層。資料存在 `price-data` 孤兒分支的 worktree（主 checkout 底下的 `.price-data/`），按「收工」才 commit＋push。

**Tech Stack:** Node 22（`node:test`、`http`、`fs.watch`、`child_process`）、Windows PowerShell 5.1＋`Windows.Media.Ocr`（zh-Hant-TW）、git 2.42+（`worktree add --orphan`）、原生 HTML/CSS/JS 頁面。

**Spec:** `docs/superpowers/specs/2026-10-13-auction-price-tool-design.md`

## Global Constraints

- 版號：這一輪全部 commit 用 `v0.97:` 開頭（v0.95 練功測速、v0.96 匯率頁已佔）；每個 commit 結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不加任何 npm 套件；不改 `src/`、`next.config.mjs`、`vercel.json`（dev/main 那份歸 maple-fx 管）。
- 伺服器：只做「雪吉拉」。清單固定 9 件（每天 5、週一加 4），照 spec 原文。
- **工具不切視窗、不碰遊戲程式、不代按任何鍵。**
- 文案全繁體中文、不准 emoji、不准用 U+2300–23FF、U+25A0–25FF 的符號（漲跌用字「漲／跌」，不用三角形）。
- 不編資料：讀不到就照實寫原因；匯率沒有就寫「匯率資料累積中」。
- 去重鍵＝品名＋價格（總價）＋交易日期＋屬性（spec 原文）。
- 本機頁面只綁 `127.0.0.1`，埠 `9380`（`PRICE_PORT` 可改）。
- `ocr.ps1` 只能有 ASCII 字元（Windows PowerShell 5.1 讀沒 BOM 的檔會用 ANSI，中文會壞）。
- 測試放在模組旁邊 `tools/price/*.test.mjs`；只能在 Windows 跑的測試用 `{ skip: process.platform !== "win32" && "..." }`，CI（ubuntu）照樣全綠。
- 匯率檔：`https://raw.githubusercontent.com/clarkher/maplestory-tool/fx-data/fx/scania/daily.json`，`days[]` 一天一筆、`close` 單位「元／1 億楓幣」，台幣＝楓幣 × close ÷ 1 億；缺日往前最多 3 天並標日期。

---

### Task 1: 查價清單＋把 tools 測試掛上 npm test

**Files:**
- Create: `tools/price/list.mjs`
- Test: `tools/price/list.test.mjs`
- Modify: `package.json`（`scripts.test`、加 `scripts.price`）
- Modify: `.gitignore`（加 `.price-data/`）

**Interfaces:**
- Produces: `SERVER: "雪吉拉"`、`DAILY: string[]`、`WEEKLY: string[]`、`ALL_ITEMS: string[]`、`WEEKLY_DAY: 1`、`EQUIPS: Set<string>`、`todayList(date: Date): {name: string, freq: "daily"|"weekly"}[]`、`localDate(date: Date): "YYYY-MM-DD"`、`localIso(date: Date): "YYYY-MM-DDTHH:mm:ss+08:00"`

- [ ] **Step 1: Write the failing test** — `tools/price/list.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { todayList, localDate, localIso, DAILY, WEEKLY, ALL_ITEMS, EQUIPS } from "./list.mjs";

test("週二只查每天那 5 件", () => {
  const list = todayList(new Date(2026, 9, 13)); // 2026-10-13 是週二
  assert.deepEqual(list.map(x => x.name), DAILY);
  assert.ok(list.every(x => x.freq === "daily"));
});

test("週一多每週那 4 件，排在每天的後面", () => {
  const list = todayList(new Date(2026, 9, 12)); // 2026-10-12 是週一
  assert.deepEqual(list.map(x => x.name), [...DAILY, ...WEEKLY]);
  assert.equal(list.at(-1).freq, "weekly");
});

test("清單照 spec：9 件、只有黃色雨傘照屬性分組", () => {
  assert.deepEqual(DAILY, ["手套攻擊卷軸10%", "手套攻擊卷軸60%", "日之鏢", "雷之鏢", "寵物速度卷軸100%"]);
  assert.deepEqual(WEEKLY, ["黃色雨傘", "雪花鏢", "玻璃鞋", "轉蛋券"]);
  assert.equal(ALL_ITEMS.length, 9);
  assert.deepEqual([...EQUIPS], ["黃色雨傘"]);
});

test("localDate 補零、localIso 帶時區", () => {
  const d = new Date(2026, 0, 5, 9, 3, 7);
  assert.equal(localDate(d), "2026-01-05");
  assert.match(localIso(d), /^2026-01-05T09:03:07[+-]\d{2}:\d{2}$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/price/list.test.mjs`
Expected: FAIL（`Cannot find module ... list.mjs`）

- [ ] **Step 3: Write minimal implementation** — `tools/price/list.mjs`

```js
// 拍賣查價清單（v0.97）。設計：docs/superpowers/specs/2026-10-13-auction-price-tool-design.md
// 清單是使用者 10/13 拍板的 A（9 件），改動要使用者拍板（記憶 maplebook-price-tracking.md）

export const SERVER = "雪吉拉";
export const DAILY = ["手套攻擊卷軸10%", "手套攻擊卷軸60%", "日之鏢", "雷之鏢", "寵物速度卷軸100%"];
export const WEEKLY = ["黃色雨傘", "雪花鏢", "玻璃鞋", "轉蛋券"];
export const ALL_ITEMS = [...DAILY, ...WEEKLY];
/** 每週那幾件排在星期幾（0＝日、1＝一） */
export const WEEKLY_DAY = 1;
/** 價格照屬性分組的裝備（同一把屬性不同價差很大，混在一起的中間價沒意義） */
export const EQUIPS = new Set(["黃色雨傘"]);

/** 今天要查哪幾件：每天的全部，週一再加每週的。用電腦當地時間（使用者在台灣）。 */
export function todayList(date) {
  const daily = DAILY.map(name => ({ name, freq: "daily" }));
  if (date.getDay() !== WEEKLY_DAY) return daily;
  return [...daily, ...WEEKLY.map(name => ({ name, freq: "weekly" }))];
}

const p2 = n => String(n).padStart(2, "0");

/** 當地日期 YYYY-MM-DD */
export function localDate(date) {
  return `${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}`;
}

/** 當地時間 ISO（帶時區），存「哪天記的」用；前 10 個字就是 localDate */
export function localIso(date) {
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const hh = p2(Math.floor(Math.abs(off) / 60)), mm = p2(Math.abs(off) % 60);
  return `${localDate(date)}T${p2(date.getHours())}:${p2(date.getMinutes())}:${p2(date.getSeconds())}${sign}${hh}:${mm}`;
}
```

- [ ] **Step 4: 掛上 npm test、加 price 指令、擋資料資料夾**

`package.json` 的 `scripts`：

```json
    "test": "node --test \"pipeline/**/*.test.mjs\" \"tools/**/*.test.mjs\" && vitest run",
    "price": "node tools/price/server.mjs",
```

`.gitignore` 檔尾加：

```
# 拍賣查價工具的資料：price-data 孤兒分支的 worktree（tools/price/git-data.mjs 建的），不進主分支
.price-data/
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tools/price/list.test.mjs` → Expected: 4 pass
Run: `npm test` → Expected: 全部 pass（pipeline＋tools＋vitest）

- [ ] **Step 6: Commit**

```bash
git add tools/price/list.mjs tools/price/list.test.mjs package.json .gitignore
git commit -m "v0.97: 拍賣查價——查價清單（每天 5 件、週一加 4 件），tools 測試掛上 npm test" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 品名比對（容許錯一兩個字，數字一定要對）

**Files:**
- Create: `tools/price/match.mjs`
- Test: `tools/price/match.test.mjs`

**Interfaces:**
- Produces: `squash(s: string): string`、`lcs(a: string, b: string): number`、`NAME_THRESHOLD = 0.7`、`nameScore(expected: string, text: string): number`（0 或 ≥0.7）、`bestNameScore(expected: string, texts: string[]): number`

- [ ] **Step 1: Write the failing test** — `tools/price/match.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { squash, lcs, nameScore, bestNameScore } from "./match.mjs";

test("squash 去掉 Windows 辨識塞在中文字之間的空白", () => {
  assert.equal(squash("手 套 攻 擊 卷 軸 10 %"), "手套攻擊卷軸10%");
});

test("lcs 是最長共同子序列長度", () => {
  assert.equal(lcs("手套攻擊卷軸", "手套攻鑿卷軸"), 5);
  assert.equal(lcs("", "abc"), 0);
});

test("錯一個字（攻擊→攻鑿）還是同一件", () => {
  assert.ok(nameScore("手套攻擊卷軸10%", "手 套 攻 鑿 卷 軸 10 % 1 , 320 , 000") >= 0.7);
});

test("10% 跟 60% 是不同東西：數字一定要一樣", () => {
  assert.equal(nameScore("手套攻擊卷軸10%", "手套攻擊卷軸60% 2,000,000"), 0);
});

test("日之鏢 跟 雷之鏢 不能混", () => {
  assert.equal(nameScore("雷之鏢", "日之鏢 350,000"), 0);
  assert.ok(nameScore("雷之鏢", "雷 之 鏢 350,000") > 0);
});

test("bestNameScore 取最像的那行；空的回 0", () => {
  assert.ok(bestNameScore("黃色雨傘", ["市價", "黃 色 雨 傘 魔法攻擊力+48"]) > 0);
  assert.equal(bestNameScore("黃色雨傘", []), 0);
  assert.equal(nameScore("", "abc"), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/price/match.test.mjs`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write minimal implementation** — `tools/price/match.mjs`

```js
// 品名比對：Windows 文字辨識的中文會錯一兩個字（10/13 合成圖實測「攻擊」讀成「攻鑿」），數字幾乎不錯。
// 所以中文對上七成就算，數字（10%、60%、100%）一定要一模一樣。

/** 去掉所有空白（Windows 會在中文字之間塞空格） */
export const squash = s => String(s ?? "").replace(/\s+/g, "");

/** 最長共同子序列長度（照字，不照位元組） */
export function lcs(a, b) {
  const A = [...a], B = [...b];
  const dp = new Array(B.length + 1).fill(0);
  for (const ch of A) {
    let prev = 0;
    for (let j = 1; j <= B.length; j++) {
      const keep = dp[j];
      dp[j] = ch === B[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = keep;
    }
  }
  return dp[B.length];
}

export const NAME_THRESHOLD = 0.7;

/** text 是不是在講 expected 這件：數字整段都要出現、中文對上七成。回 0（不是）或 0.7～1 的分數。 */
export function nameScore(expected, text) {
  const e = squash(expected), t = squash(text);
  if (!e || !t) return 0;
  const tDigits = new Set(t.match(/\d+%?/g) ?? []);
  for (const d of e.match(/\d+%?/g) ?? []) if (!tDigits.has(d)) return 0;
  const score = lcs(e, t) / [...e].length;
  return score >= NAME_THRESHOLD ? score : 0;
}

/** 一張圖的所有行裡，最像 expected 的分數 */
export function bestNameScore(expected, texts) {
  return Math.max(0, ...texts.map(t => nameScore(expected, t)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/price/match.test.mjs`
Expected: 6 pass

- [ ] **Step 5: Commit**

```bash
git add tools/price/match.mjs tools/price/match.test.mjs
git commit -m "v0.97: 拍賣查價——品名比對（中文對上七成、10%/60% 這種數字一定要一樣）" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 截圖文字 → 成交紀錄（解析＋5 條檢查）

**Files:**
- Create: `tools/price/parse.mjs`、`tools/price/checks.mjs`
- Test: `tools/price/parse.test.mjs`、`tools/price/checks.test.mjs`

**Interfaces:**
- Consumes: `squash`、`lcs`、`bestNameScore`（Task 2）
- Produces:
  - OCR 結果型別（Task 7 會產生）：`Ocr = { width, height, meanLuma, stdLuma, lines: [{ text, words: [{ text, x, y, w, h }] }] }`
  - `OPEN_DATE = "2026-07-29"`、`ATTR_LABELS: string[]`
  - `normalizeText(text): string`
  - `rowsOf(ocr: Ocr): { text, x, y, w, h }[]`
  - `parseRow(text: string, today: "YYYY-MM-DD"): Trade | null`，`Trade = { tradedAt, price, unitPrice, qty, attrs: Record<string, number> | null, flags: string[] }`
  - `isBlack(ocr): boolean`
  - `parseShot(ocr, { item, today }): { kind: "ok"|"black"|"not-auction"|"wrong-item"|"empty", reason: string, trades: (Trade & { box: {x,y,w,h} })[] }`
  - `checkTrade(trade, { today, prevUnitMedian }): string[]`（回傳含原本 `trade.flags` 的完整清單）

- [ ] **Step 1: Write the failing test** — `tools/price/parse.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeText, rowsOf, parseRow, parseShot, isBlack } from "./parse.mjs";

const TODAY = "2026-10-13";

/** 假的辨識結果：每列一個字串陣列（每個字串是一個 word），y 照列往下排 */
function fakeOcr(rows, { meanLuma = 120, stdLuma = 40 } = {}) {
  return {
    width: 1366, height: 768, meanLuma, stdLuma,
    lines: rows.map((words, i) => ({
      text: words.join(" "),
      words: words.map((text, j) => ({ text, x: 100 + j * 40, y: 100 + i * 30, w: 30, h: 16 })),
    })),
  };
}

test("normalizeText：數字、日期、加號旁邊的空白拿掉，中文字之間的空白拿掉", () => {
  assert.equal(normalizeText("手 套 攻 鑿 卷 軸 10 % 1 , 320 , 000 2026 / 10 / 12"), "手套攻鑿卷軸 10%1,320,000 2026/10/12");
  assert.equal(normalizeText("魔 法 攻 力 + 48"), "魔法攻力+48");
});

test("一個價格：價格＝單價、數量 1", () => {
  assert.deepEqual(parseRow("手 套 攻 擊 卷 軸 10 % 1 , 320 , 000 2026 / 10 / 12", TODAY),
    { tradedAt: "2026-10-12", price: 1320000, unitPrice: 1320000, qty: 1, attrs: null, flags: [] });
});

test("兩個價格：大的是總價、小的是單價，數量用除的；漏了逗號也讀得到", () => {
  assert.deepEqual(parseRow("寵 物 速 度 卷 軸 100 % 15 , 000 , 000 3000 , 000 2026 / 10 / 11", TODAY),
    { tradedAt: "2026-10-11", price: 15000000, unitPrice: 3000000, qty: 5, attrs: null, flags: [] });
});

test("有 x5 就用寫的數量", () => {
  const t = parseRow("日 之 鏢 x5 1,500,000 300,000 2026/10/12", TODAY);
  assert.equal(t.qty, 5);
  assert.equal(t.unitPrice, 300000);
});

test("裝備屬性：辨識錯字（魔法攻力）也對到魔法攻擊力", () => {
  const t = parseRow("黃 色 雨 傘 魔 法 攻 力 + 48 3 , 850 , 000 2026 / 10 / 11", TODAY);
  assert.deepEqual(t.attrs, { "魔法攻擊力": 48 });
  assert.equal(t.price, 3850000);
});

test("只有月/日：今年；比今天晚就算去年", () => {
  assert.equal(parseRow("雷之鏢 350,000 10/12", TODAY).tradedAt, "2026-10-12");
  assert.equal(parseRow("雷之鏢 350,000 12/30", TODAY).tradedAt, "2025-12-30");
});

test("時間拿掉不當價格", () => {
  assert.equal(parseRow("雷之鏢 350,000 2026/10/12 14:35", TODAY).price, 350000);
});

test("沒有日期或沒有數字的行不是成交", () => {
  assert.equal(parseRow("市 價 搜 尋", TODAY), null);
  assert.equal(parseRow("2026/10/12", TODAY), null);
});

test("三個以上數字：分不出來，價格留空並標原因", () => {
  const t = parseRow("雷之鏢 100 200 300 2026/10/12", TODAY);
  assert.equal(t.price, null);
  assert.match(t.flags[0], /3 個數字/);
});

test("rowsOf 照高度把字排成列，同一列照左到右", () => {
  const ocr = { width: 10, height: 10, meanLuma: 100, stdLuma: 30, lines: [
    { text: "b", words: [{ text: "B", x: 50, y: 101, w: 10, h: 16 }] },
    { text: "a", words: [{ text: "A", x: 10, y: 100, w: 10, h: 16 }, { text: "C", x: 10, y: 140, w: 10, h: 16 }] },
  ] };
  assert.deepEqual(rowsOf(ocr).map(r => r.text), ["A B", "C"]);
});

test("isBlack：整張很暗又幾乎沒變化", () => {
  assert.equal(isBlack({ meanLuma: 5, stdLuma: 1 }), true);
  assert.equal(isBlack({ meanLuma: 120, stdLuma: 40 }), false);
});

test("parseShot：正常的市價頁讀出每一筆，帶位置", () => {
  const ocr = fakeOcr([
    ["楓", "之", "谷", "拍", "賣"], ["市", "價"],
    ["手", "套", "攻", "鑿", "卷", "軸", "10", "%", "1,320,000", "2026/10/12"],
    ["手", "套", "攻", "擊", "卷", "軸", "10", "%", "1,280,000", "2026/10/11"],
  ]);
  const r = parseShot(ocr, { item: "手套攻擊卷軸10%", today: TODAY });
  assert.equal(r.kind, "ok");
  assert.deepEqual(r.trades.map(t => t.unitPrice), [1320000, 1280000]);
  assert.equal(r.trades[0].box.y, 160);
});

test("parseShot：黑畫面、不是市價頁、品名對不上、沒讀到價格", () => {
  assert.equal(parseShot(fakeOcr([], { meanLuma: 3, stdLuma: 1 }), { item: "日之鏢", today: TODAY }).kind, "black");
  assert.equal(parseShot(fakeOcr([["背", "包"]]), { item: "日之鏢", today: TODAY }).kind, "not-auction");
  const wrong = parseShot(fakeOcr([["市", "價"], ["雷", "之", "鏢", "350,000", "2026/10/12"]]), { item: "日之鏢", today: TODAY });
  assert.equal(wrong.kind, "wrong-item");
  assert.equal(wrong.reason, "對不上，請重截");
  assert.equal(parseShot(fakeOcr([["市", "價"], ["日", "之", "鏢"]]), { item: "日之鏢", today: TODAY }).kind, "empty");
});
```

`tools/price/checks.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { checkTrade } from "./checks.mjs";

const TODAY = "2026-10-13";
const base = { tradedAt: "2026-10-12", price: 1000, unitPrice: 1000, qty: 1, attrs: null, flags: [] };

test("正常的一筆沒有旗子", () => {
  assert.deepEqual(checkTrade(base, { today: TODAY, prevUnitMedian: 900 }), []);
});

test("單價×數量對不上", () => {
  assert.deepEqual(checkTrade({ ...base, price: 5000, unitPrice: 1000, qty: 4 }, { today: TODAY }), ["單價×數量跟總價對不上"]);
});

test("總價不是單價的整數倍（數量算不出來）", () => {
  assert.deepEqual(checkTrade({ ...base, price: 2500, unitPrice: 1000, qty: null }, { today: TODAY }), ["總價不是單價的整數倍"]);
});

test("日期在未來、比開服早", () => {
  assert.deepEqual(checkTrade({ ...base, tradedAt: "2026-10-14" }, { today: TODAY }), ["交易日期在未來"]);
  assert.deepEqual(checkTrade({ ...base, tradedAt: "2026-07-28" }, { today: TODAY }), ["交易日期比開服還早"]);
});

test("跟上次中間價差 5 倍以上（高或低都算）", () => {
  assert.deepEqual(checkTrade({ ...base, unitPrice: 6000, price: 6000 }, { today: TODAY, prevUnitMedian: 1000 }), ["跟上次中間價差 5 倍以上"]);
  assert.deepEqual(checkTrade({ ...base, unitPrice: 150, price: 150 }, { today: TODAY, prevUnitMedian: 1000 }), ["跟上次中間價差 5 倍以上"]);
  assert.deepEqual(checkTrade(base, { today: TODAY, prevUnitMedian: null }), []);
});

test("保留解析時就有的旗子", () => {
  assert.deepEqual(checkTrade({ ...base, price: null, unitPrice: null, flags: ["這行讀到 3 個數字，分不出價格"] }, { today: TODAY }),
    ["這行讀到 3 個數字，分不出價格"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/price/parse.test.mjs tools/price/checks.test.mjs`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write implementation** — `tools/price/parse.mjs`

```js
// 截圖文字 → 成交紀錄。輸入是 ocr.mjs 的結果：{ width, height, meanLuma, stdLuma, lines:[{ text, words:[{ text, x, y, w, h }] }] }
// 市價分頁的欄位位置要照使用者的真截圖定（Task 10）；這裡先用不靠欄位位置的讀法：一列裡找日期、數量、屬性，剩下的數字是價格。
import { lcs, bestNameScore } from "./match.mjs";

/** 經典版開服日，比這早的交易日期一定是讀錯 */
export const OPEN_DATE = "2026-07-29";
/** 裝備屬性的正式寫法（辨識錯字時照最像的對） */
export const ATTR_LABELS = ["魔法攻擊力", "攻擊力", "物理防禦力", "魔法防禦力", "力量", "敏捷", "智力", "幸運", "命中率", "迴避率", "移動速度", "跳躍力", "HP", "MP"];
/** 認「這是拍賣市價頁」的字（客戶端字串表裡的介面字） */
const PAGE_WORDS = ["市價", "交易日期", "楓之谷拍賣"];

const pad = n => String(n).padStart(2, "0");

/** 全形標點轉半形、標點旁邊的空白拿掉、中文字之間的空白拿掉 */
export function normalizeText(text) {
  return String(text)
    .replace(/／/g, "/").replace(/，/g, ",").replace(/：/g, ":").replace(/＋/g, "+").replace(/．/g, ".")
    .replace(/\s*([,/.:%+])\s*/g, "$1")
    .replace(/(?<=[^\x00-\x7F])\s+(?=[^\x00-\x7F])/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 把辨識出來的字照高度重排成一列一列（Windows 的「行」可能把同一列拆開），同一列照左到右 */
export function rowsOf(ocr) {
  const words = ocr.lines.flatMap(l => l.words).filter(w => String(w.text ?? "").trim());
  if (!words.length) return [];
  const hs = words.map(w => w.h).sort((a, b) => a - b);
  const tol = hs[hs.length >> 1] * 0.6;
  const sorted = [...words].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  const rows = [];
  for (const w of sorted) {
    const cy = w.y + w.h / 2;
    const row = rows.at(-1);
    if (row && Math.abs(cy - row.cy) <= tol) {
      row.words.push(w);
      row.cy = (row.cy * (row.words.length - 1) + cy) / row.words.length;
    } else rows.push({ cy, words: [w] });
  }
  return rows.map(r => {
    const ws = r.words.sort((a, b) => a.x - b.x);
    const x = Math.min(...ws.map(w => w.x)), y = Math.min(...ws.map(w => w.y));
    const x2 = Math.max(...ws.map(w => w.x + w.w)), y2 = Math.max(...ws.map(w => w.y + w.h));
    return { text: ws.map(w => w.text).join(" "), x, y, w: x2 - x, h: y2 - y };
  });
}

function bestLabel(raw) {
  let best = null, bestScore = 0;
  for (const label of ATTR_LABELS) {
    const score = lcs(label, raw) / Math.max([...label].length, [...raw].length);
    if (score > bestScore) { best = label; bestScore = score; }
  }
  return bestScore >= 0.6 ? best : null;
}

const ATTR_RE = /([^\d\s+,]{1,6})\+(\d+)/g;

/** 一列文字 → 一筆成交；沒有日期或沒有價格回 null */
export function parseRow(text, today) {
  let s = normalizeText(text);
  let tradedAt = null;
  const full = s.match(/(20\d{2})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (full) {
    tradedAt = `${full[1]}-${pad(full[2])}-${pad(full[3])}`;
    s = s.replace(full[0], " ");
  } else {
    const short = s.match(/(?<![\d,])(\d{1,2})[/.-](\d{1,2})(?![\d,])/);
    if (short) {
      const year = Number(today.slice(0, 4));
      tradedAt = `${year}-${pad(short[1])}-${pad(short[2])}`;
      if (tradedAt > today) tradedAt = `${year - 1}-${pad(short[1])}-${pad(short[2])}`;
      s = s.replace(short[0], " ");
    }
  }
  if (!tradedAt) return null;
  s = s.replace(/\d{1,2}:\d{2}(?::\d{2})?/g, " ");

  let qty = null;
  const q = s.match(/[xX×]\s?(\d+)|(\d+)個/);
  if (q) { qty = Number(q[1] ?? q[2]); s = s.replace(q[0], " "); }

  const attrs = {};
  for (const m of s.matchAll(ATTR_RE)) {
    const label = bestLabel(m[1]);
    if (label) attrs[label] = Number(m[2]);
  }
  s = s.replace(ATTR_RE, " ").replace(/\d+%/g, " ");

  const nums = (s.match(/\d[\d,]*\d|\d/g) ?? []).map(x => Number(x.replace(/,/g, ""))).filter(n => n > 0);
  if (!nums.length) return null;

  const out = { tradedAt, price: null, unitPrice: null, qty, attrs: Object.keys(attrs).length ? attrs : null, flags: [] };
  if (nums.length === 1) {
    if (qty && qty > 1) { out.price = nums[0]; out.flags.push("有數量但只讀到一個價格"); }
    else { out.price = out.unitPrice = nums[0]; out.qty = 1; }
  } else if (nums.length === 2) {
    const [small, big] = [...nums].sort((a, b) => a - b);
    out.price = big;
    out.unitPrice = small;
    if (out.qty == null) out.qty = big % small === 0 ? big / small : null;
  } else {
    out.flags.push(`這行讀到 ${nums.length} 個數字，分不出價格`);
  }
  return out;
}

/** 整張很暗又幾乎沒變化＝全螢幕獨佔模式截到的黑畫面 */
export const isBlack = ocr => ocr.meanLuma < 30 && ocr.stdLuma < 6;

/** 一張截圖 → 這件的成交紀錄（或為什麼沒讀到） */
export function parseShot(ocr, { item, today }) {
  if (isBlack(ocr)) return { kind: "black", reason: "截到黑畫面，遊戲改成視窗或無邊框再截", trades: [] };
  const rows = rowsOf(ocr);
  const texts = rows.map(r => r.text);
  if (!PAGE_WORDS.some(w => bestNameScore(w, texts) > 0)) return { kind: "not-auction", reason: "這張不是拍賣的市價頁，略過", trades: [] };
  if (bestNameScore(item, texts) === 0) return { kind: "wrong-item", reason: "對不上，請重截", trades: [] };
  const trades = [];
  for (const r of rows) {
    const t = parseRow(r.text, today);
    if (t) trades.push({ ...t, box: { x: r.x, y: r.y, w: r.w, h: r.h } });
  }
  if (!trades.length) return { kind: "empty", reason: "這張沒讀到價格", trades: [] };
  return { kind: "ok", reason: "", trades };
}
```

`tools/price/checks.mjs`：

```js
// 存之前的 5 條檢查（spec「讀圖」）：有旗子的那筆變黃、等使用者看一眼，不進中間價
import { OPEN_DATE } from "./parse.mjs";

export function checkTrade(t, { today, prevUnitMedian = null }) {
  const flags = [...(t.flags ?? [])];
  if (t.price != null && t.unitPrice != null && t.qty != null && t.unitPrice * t.qty !== t.price) flags.push("單價×數量跟總價對不上");
  if (t.price != null && t.unitPrice != null && t.qty == null) flags.push("總價不是單價的整數倍");
  if (t.tradedAt > today) flags.push("交易日期在未來");
  if (t.tradedAt < OPEN_DATE) flags.push("交易日期比開服還早");
  if (prevUnitMedian && t.unitPrice && (t.unitPrice > prevUnitMedian * 5 || t.unitPrice * 5 < prevUnitMedian)) flags.push("跟上次中間價差 5 倍以上");
  return flags;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/price/parse.test.mjs tools/price/checks.test.mjs`
Expected: 全部 pass。若 normalizeText 那條的空白位置不同，照測試的期望值修實作（測試是規格）。

- [ ] **Step 5: Commit**

```bash
git add tools/price/parse.mjs tools/price/parse.test.mjs tools/price/checks.mjs tools/price/checks.test.mjs
git commit -m "v0.97: 拍賣查價——截圖文字解析成成交紀錄（日期、數量、屬性、價格）跟存前 5 條檢查" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 匯率換算＋統計（中間價、漲跌、屬性分組、走勢）

**Files:**
- Create: `tools/price/fx.mjs`、`tools/price/stats.mjs`
- Test: `tools/price/fx.test.mjs`、`tools/price/stats.test.mjs`

**Interfaces:**
- Consumes: `EQUIPS`（Task 1）
- Produces:
  - `FX_URL`、`FX_LOOKBACK_DAYS = 3`、`fetchFx(fetchImpl = fetch): Promise<{ updatedAt, days: FxDay[] } | null>`、`shiftDate(ymd, delta): ymd`、`fxFor(date: ymd, days: FxDay[] | null): { close, date, exact } | null`、`toNtd(meso, close): number`
  - 存檔裡的一筆（Task 5 定義，這裡先用）：`Record = { id, item, price, unitPrice, qty, tradedAt, attrs, flags, status: "ok"|"review", shot, box, recordedAt, edited? }`
  - `median(nums): number | null`、`attrKey(attrs): string`、`MIN_TREND_DAYS = 3`
  - `summarize(records, item, fxDays): { item, count, few?, median?, changePct?, lastTradedAt?, ntd?, fxDate?, fxExact?, groups? }`（沒資料時只有 `{ item, count: 0 }`）
  - `series(records, item, key = null): { date, median, count }[]`

- [ ] **Step 1: Write the failing tests**

`tools/price/fx.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { fxFor, shiftDate, toNtd, fetchFx, FX_URL } from "./fx.mjs";

const days = [{ date: "2026-10-10", close: 3300 }, { date: "2026-10-12", close: 3333 }];

test("shiftDate 跨月", () => {
  assert.equal(shiftDate("2026-10-01", -1), "2026-09-30");
});

test("那天有就用那天", () => {
  assert.deepEqual(fxFor("2026-10-12", days), { close: 3333, date: "2026-10-12", exact: true });
});

test("那天沒抓到就往前找，最多 3 天，標出用的是哪天", () => {
  assert.deepEqual(fxFor("2026-10-13", days), { close: 3333, date: "2026-10-12", exact: false });
  assert.deepEqual(fxFor("2026-10-11", days), { close: 3300, date: "2026-10-10", exact: false });
  assert.equal(fxFor("2026-10-16", days), null);
  assert.equal(fxFor("2026-10-12", null), null);
});

test("楓幣 × close ÷ 1 億＝台幣", () => {
  assert.equal(toNtd(300_000_000, 3333), 9999);
});

test("fetchFx：檔案還沒有（404）或網路壞掉回 null，正常回 JSON", async () => {
  assert.equal(await fetchFx(async () => ({ ok: false })), null);
  assert.equal(await fetchFx(async () => { throw new Error("offline"); }), null);
  const j = await fetchFx(async url => ({ ok: true, json: async () => ({ updatedAt: "x", days, url }) }));
  assert.equal(j.days.length, 2);
  assert.equal(j.url, FX_URL);
});
```

`tools/price/stats.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { median, attrKey, summarize, series } from "./stats.mjs";

const r = (o) => ({ item: "日之鏢", price: o.u * (o.qty ?? 1), unitPrice: o.u, qty: o.qty ?? 1, tradedAt: o.t, attrs: o.attrs ?? null,
  flags: [], status: o.status ?? "ok", recordedAt: `${o.rec}T21:00:00+08:00`, ...o.extra });

test("median 奇偶數", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

test("attrKey 照名稱排序", () => {
  assert.equal(attrKey({ "敏捷": 1, "魔法攻擊力": 48 }), "敏捷+1、魔法攻擊力+48");
  assert.equal(attrKey(null), "");
});

test("summarize：用最近一天記的算中間價，跟前一次記的比漲跌；黃色（review）不算", () => {
  const recs = [
    r({ u: 100, t: "2026-10-11", rec: "2026-10-12" }), r({ u: 120, t: "2026-10-11", rec: "2026-10-12" }),
    r({ u: 130, t: "2026-10-12", rec: "2026-10-13" }), r({ u: 140, t: "2026-10-13", rec: "2026-10-13" }),
    r({ u: 999999, t: "2026-10-13", rec: "2026-10-13", status: "review" }),
  ];
  const s = summarize(recs, "日之鏢", [{ date: "2026-10-13", close: 3333 }]);
  assert.equal(s.count, 2);
  assert.equal(s.median, 135);
  assert.equal(s.changePct, 22.7); // (135-110)/110
  assert.equal(s.lastTradedAt, "2026-10-13");
  assert.equal(s.few, true);
  assert.equal(s.fxDate, "2026-10-13");
  assert.equal(s.ntd, 0); // 135 楓幣 × 3333 ÷ 1 億 ≈ 0.0045 → 四捨五入到小數 1 位
});

test("summarize：沒資料、沒匯率", () => {
  assert.deepEqual(summarize([], "日之鏢", null), { item: "日之鏢", count: 0 });
  assert.equal(summarize([r({ u: 100, t: "2026-10-12", rec: "2026-10-13" })], "日之鏢", null).ntd, null);
});

test("summarize：黃色雨傘照屬性分組", () => {
  const umb = (u, m) => ({ ...r({ u, t: "2026-10-12", rec: "2026-10-13", attrs: { "魔法攻擊力": m } }), item: "黃色雨傘" });
  const s = summarize([umb(100, 48), umb(300, 50), umb(120, 48)], "黃色雨傘", null);
  assert.deepEqual(s.groups, [{ key: "魔法攻擊力+48", median: 110, count: 2 }, { key: "魔法攻擊力+50", median: 300, count: 1 }]);
});

test("series：照交易日期一天一點；可以只看某個屬性", () => {
  const recs = [r({ u: 100, t: "2026-10-10", rec: "2026-10-13" }), r({ u: 200, t: "2026-10-10", rec: "2026-10-13" }), r({ u: 300, t: "2026-10-12", rec: "2026-10-13" })];
  assert.deepEqual(series(recs, "日之鏢"), [{ date: "2026-10-10", median: 150, count: 2 }, { date: "2026-10-12", median: 300, count: 1 }]);
  assert.deepEqual(series(recs, "日之鏢", "魔法攻擊力+48"), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/price/fx.test.mjs tools/price/stats.test.mjs`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write implementation**

`tools/price/fx.mjs`：

```js
// 楓幣換台幣：讀 maple-fx（v0.96）收的雪吉拉每日匯率。格式見 docs/superpowers/specs/2026-10-13-meso-fx-design.md
// days[] 由舊到新、一天一筆、沒抓到的日子不出現；close 單位是「元／1 億楓幣」

export const FX_URL = "https://raw.githubusercontent.com/clarkher/maplestory-tool/fx-data/fx/scania/daily.json";
export const FX_LOOKBACK_DAYS = 3;

/** 抓每日匯率；檔案還沒有（404）、網路壞掉、格式不對都回 null（頁面寫「匯率資料累積中」） */
export async function fetchFx(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(FX_URL);
    if (!res.ok) return null;
    const j = await res.json();
    return Array.isArray(j?.days) ? j : null;
  } catch {
    return null;
  }
}

export function shiftDate(ymd, delta) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** 那天的匯率；那天沒有就往前最近一天，最多往前 3 天 */
export function fxFor(date, days) {
  if (!date || !days?.length) return null;
  const byDate = new Map(days.map(d => [d.date, d]));
  for (let back = 0; back <= FX_LOOKBACK_DAYS; back++) {
    const d = shiftDate(date, -back);
    const hit = byDate.get(d);
    if (hit && typeof hit.close === "number") return { close: hit.close, date: d, exact: back === 0 };
  }
  return null;
}

/** 楓幣 → 台幣 */
export const toNtd = (meso, close) => meso * close / 1e8;
```

`tools/price/stats.mjs`：

```js
// 價格表的數字：中間價用「單價」算（成堆賣的東西總價沒意義），只算確認過的（status ok）
import { EQUIPS } from "./list.mjs";
import { fxFor, toNtd } from "./fx.mjs";

/** 不到 3 天不畫走勢線 */
export const MIN_TREND_DAYS = 3;

export function median(nums) {
  const a = nums.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export const attrKey = attrs => attrs ? Object.keys(attrs).sort().map(k => `${k}+${attrs[k]}`).join("、") : "";

const usable = t => t.status === "ok" && Number.isFinite(t.unitPrice);
const dayOf = iso => iso.slice(0, 10);

function groupBy(records) {
  const map = new Map();
  for (const t of records) {
    const k = attrKey(t.attrs);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b, "zh-Hant"))
    .map(([key, ts]) => ({ key, median: median(ts.map(t => t.unitPrice)), count: ts.length }));
}

/** 一件的摘要：最近一天記的那批算中間價，跟前一次記的那批比漲跌 */
export function summarize(records, item, fxDays) {
  const mine = records.filter(t => t.item === item && usable(t));
  if (!mine.length) return { item, count: 0 };
  const days = [...new Set(mine.map(t => dayOf(t.recordedAt)))].sort();
  const latest = mine.filter(t => dayOf(t.recordedAt) === days.at(-1));
  const prev = days.length > 1 ? mine.filter(t => dayOf(t.recordedAt) === days.at(-2)) : [];
  const med = median(latest.map(t => t.unitPrice));
  const prevMed = prev.length ? median(prev.map(t => t.unitPrice)) : null;
  const lastTradedAt = latest.map(t => t.tradedAt).sort().at(-1);
  const fx = fxFor(lastTradedAt, fxDays);
  return {
    item,
    count: latest.length,
    few: latest.length <= 2,
    median: med,
    changePct: prevMed ? Math.round((med - prevMed) / prevMed * 1000) / 10 : null,
    lastTradedAt,
    ntd: fx ? Math.round(toNtd(med, fx.close) * 10) / 10 : null,
    fxDate: fx?.date ?? null,
    fxExact: fx?.exact ?? null,
    groups: EQUIPS.has(item) ? groupBy(latest) : null,
  };
}

/** 走勢：照交易日期一天一點（中間價）；key 給了就只看那個屬性 */
export function series(records, item, key = null) {
  const byDay = new Map();
  for (const t of records) {
    if (t.item !== item || !usable(t)) continue;
    if (key != null && attrKey(t.attrs) !== key) continue;
    if (!byDay.has(t.tradedAt)) byDay.set(t.tradedAt, []);
    byDay.get(t.tradedAt).push(t.unitPrice);
  }
  return [...byDay].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, us]) => ({ date, median: median(us), count: us.length }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/price/fx.test.mjs tools/price/stats.test.mjs`
Expected: 全部 pass

- [ ] **Step 5: Commit**

```bash
git add tools/price/fx.mjs tools/price/fx.test.mjs tools/price/stats.mjs tools/price/stats.test.mjs
git commit -m "v0.97: 拍賣查價——讀每日匯率換台幣（缺日往前最多 3 天）、中間價、漲跌、黃色雨傘照屬性分組、走勢" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 資料檔（存、去重、確認／改／刪黃色那筆）

**Files:**
- Create: `tools/price/store.mjs`
- Test: `tools/price/store.test.mjs`

**Interfaces:**
- Consumes: `attrKey`（Task 4）、`Trade`（Task 3，含 `box`、checks 後的 `flags`）
- Produces:
  - `DATA_REL = "auction/scania.json"`（資料分支裡的路徑）
  - `emptyData(): { server: "雪吉拉", updatedAt: null, trades: [] }`
  - `loadData(file): Data`、`saveData(file, data): void`（先寫 .tmp 再換名）
  - `tradeKey(t): string`
  - `addTrades(data, trades, { item, shot, recordedAt }): { added: string[], skipped: number }`
  - `confirmTrade(data, id): boolean`、`deleteTrade(data, id): boolean`、`editTrade(data, id, patch: { price?, unitPrice?, qty?, tradedAt? }): boolean`

- [ ] **Step 1: Write the failing test** — `tools/price/store.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emptyData, loadData, saveData, addTrades, confirmTrade, deleteTrade, editTrade, tradeKey } from "./store.mjs";

const t = (o = {}) => ({ tradedAt: "2026-10-12", price: 1000, unitPrice: 1000, qty: 1, attrs: null, flags: [], box: { x: 1, y: 2, w: 3, h: 4 }, ...o });
const meta = { item: "日之鏢", shot: "a.png", recordedAt: "2026-10-13T21:00:00+08:00" };

test("檔案不存在就是空的；存了讀得回來", t2 => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-store-"));
  t2.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "auction", "scania.json");
  assert.deepEqual(loadData(file), emptyData());
  const d = emptyData();
  addTrades(d, [t()], meta);
  saveData(file, d);
  assert.equal(loadData(file).trades.length, 1);
  assert.equal(fs.existsSync(file + ".tmp"), false);
});

test("同品名＋價格＋交易日期＋屬性只留一筆", () => {
  const d = emptyData();
  assert.equal(addTrades(d, [t(), t()], meta).added.length, 1);
  const again = addTrades(d, [t(), t({ price: 2000, unitPrice: 2000 })], meta);
  assert.equal(again.added.length, 1);
  assert.equal(again.skipped, 1);
  assert.equal(d.updatedAt, meta.recordedAt);
});

test("有旗子的存成 review（黃色），沒旗子的 ok；欄位齊全", () => {
  const d = emptyData();
  addTrades(d, [t(), t({ price: 5, unitPrice: 5, flags: ["跟上次中間價差 5 倍以上"] })], meta);
  assert.deepEqual(d.trades.map(x => x.status), ["ok", "review"]);
  const rec = d.trades[0];
  assert.equal(rec.item, "日之鏢");
  assert.equal(rec.shot, "a.png");
  assert.deepEqual(rec.box, { x: 1, y: 2, w: 3, h: 4 });
  assert.match(rec.id, /^[0-9a-f-]{36}$/);
});

test("確認、改、刪", () => {
  const d = emptyData();
  addTrades(d, [t({ flags: ["x"] }), t({ price: 7, unitPrice: 7, flags: ["y"] }), t({ price: 9, unitPrice: 9 })], meta);
  const [a, b, c] = d.trades.map(x => x.id);
  assert.equal(confirmTrade(d, a), true);
  assert.equal(d.trades[0].status, "ok");
  assert.deepEqual(d.trades[0].flags, []);
  assert.equal(editTrade(d, b, { price: 70, unitPrice: 70 }), true);
  assert.deepEqual([d.trades[1].price, d.trades[1].status, d.trades[1].edited], [70, "ok", true]);
  assert.equal(editTrade(d, b, { price: -1 }), false, "價格要正整數");
  assert.equal(editTrade(d, b, { tradedAt: "10/12" }), false, "日期要 YYYY-MM-DD");
  assert.equal(deleteTrade(d, c), true);
  assert.equal(d.trades.length, 2);
  assert.equal(confirmTrade(d, "nope"), false);
});

test("tradeKey 屬性順序不影響", () => {
  assert.equal(tradeKey({ item: "a", price: 1, tradedAt: "d", attrs: { b: 1, a: 2 } }), tradeKey({ item: "a", price: 1, tradedAt: "d", attrs: { a: 2, b: 1 } }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/price/store.test.mjs`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write implementation** — `tools/price/store.mjs`

```js
// 拍賣價資料檔：price-data 分支的 auction/scania.json（雪吉拉）。去重鍵＝品名＋價格（總價）＋交易日期＋屬性（spec 原文）
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { attrKey } from "./stats.mjs";

export const DATA_REL = "auction/scania.json";

export const emptyData = () => ({ server: "雪吉拉", updatedAt: null, trades: [] });

export function loadData(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return emptyData();
    throw e;
  }
}

export function saveData(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1) + "\n");
  fs.renameSync(tmp, file);
}

export const tradeKey = t => [t.item, t.price, t.tradedAt, attrKey(t.attrs)].join("|");

/** 加進資料；重複的跳過。有旗子的存成 review（黃色，等使用者看），沒旗子的 ok */
export function addTrades(data, trades, { item, shot, recordedAt }) {
  const keys = new Set(data.trades.map(tradeKey));
  const added = [];
  let skipped = 0;
  for (const t of trades) {
    const rec = {
      id: crypto.randomUUID(), item,
      price: t.price, unitPrice: t.unitPrice, qty: t.qty, tradedAt: t.tradedAt, attrs: t.attrs ?? null,
      flags: t.flags ?? [], status: t.flags?.length ? "review" : "ok",
      shot, box: t.box ?? null, recordedAt,
    };
    const k = tradeKey(rec);
    if (keys.has(k)) { skipped++; continue; }
    keys.add(k);
    data.trades.push(rec);
    added.push(rec.id);
  }
  data.updatedAt = recordedAt;
  return { added, skipped };
}

const byId = (data, id) => data.trades.find(t => t.id === id);

export function confirmTrade(data, id) {
  const t = byId(data, id);
  if (!t) return false;
  t.status = "ok";
  t.flags = [];
  return true;
}

export function deleteTrade(data, id) {
  const i = data.trades.findIndex(t => t.id === id);
  if (i < 0) return false;
  data.trades.splice(i, 1);
  return true;
}

const posInt = n => Number.isInteger(n) && n > 0;

/** 使用者看截圖改數字；改完算確認過 */
export function editTrade(data, id, patch) {
  const t = byId(data, id);
  if (!t) return false;
  for (const k of ["price", "unitPrice", "qty"]) if (k in patch && !posInt(patch[k])) return false;
  if ("tradedAt" in patch && !/^\d{4}-\d{2}-\d{2}$/.test(patch.tradedAt)) return false;
  for (const k of ["price", "unitPrice", "qty", "tradedAt"]) if (k in patch) t[k] = patch[k];
  t.status = "ok";
  t.flags = [];
  t.edited = true;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/price/store.test.mjs`
Expected: 5 pass

- [ ] **Step 5: Commit**

```bash
git add tools/price/store.mjs tools/price/store.test.mjs
git commit -m "v0.97: 拍賣查價——資料檔存取、去重（品名＋價格＋交易日期＋屬性）、黃色那筆確認／改／刪" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: price-data 資料分支（孤兒分支、擋 Vercel、收工 push）

**Files:**
- Create: `tools/price/git-data.mjs`
- Test: `tools/price/git-data.test.mjs`

**Interfaces:**
- Produces:
  - `DATA_BRANCH = "price-data"`、`VERCEL_JSON`（字串，`{"git":{"deploymentEnabled":false}}` 排版過）
  - `ensureDataWorktree(cwd: string, remote = "origin"): string` — 回傳資料夾（主 checkout 底下的 `.price-data`）。遠端有分支就接遠端；都沒有就開孤兒分支，第一個 commit 只有 `vercel.json`
  - `publishData(dir: string, message: string, remote = "origin"): { committed: boolean, pushed: boolean, sha: string }`

- [ ] **Step 1: Write the failing test** — `tools/price/git-data.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ensureDataWorktree, publishData, DATA_BRANCH } from "./git-data.mjs";

// 測試用的 git 身分（CI 沒設 user.name）
Object.assign(process.env, { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" });
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

function setup(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "price-git-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const remote = path.join(base, "remote.git");
  git(base, "init", "-q", "--bare", remote);
  const repo = path.join(base, "repo");
  const mk = dir => {
    fs.mkdirSync(dir);
    git(dir, "init", "-q", "-b", "main");
    fs.writeFileSync(path.join(dir, "README.md"), "x\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "init");
    git(dir, "remote", "add", "origin", remote);
    return dir;
  };
  mk(repo);
  return { base, remote, repo, mk };
}

test("遠端沒有分支：開孤兒分支，第一個 commit 只有擋部署的 vercel.json", t => {
  const { repo } = setup(t);
  const dir = ensureDataWorktree(repo);
  assert.equal(dir, path.join(repo, ".price-data"));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "vercel.json"), "utf8")), { git: { deploymentEnabled: false } });
  assert.equal(git(dir, "rev-list", "--count", "HEAD"), "1");
  assert.equal(fs.existsSync(path.join(dir, "README.md")), false, "孤兒分支不帶主分支的檔案");
  assert.equal(git(dir, "branch", "--show-current"), DATA_BRANCH);
});

test("收工：commit＋push，遠端收到；沒變動不 commit", t => {
  const { repo, remote } = setup(t);
  const dir = ensureDataWorktree(repo);
  fs.mkdirSync(path.join(dir, "auction"));
  fs.writeFileSync(path.join(dir, "auction", "scania.json"), "{}\n");
  const r = publishData(dir, "資料：測試");
  assert.equal(r.committed, true);
  assert.equal(r.pushed, true);
  assert.equal(git(remote, "rev-parse", `refs/heads/${DATA_BRANCH}`), r.sha);
  assert.equal(publishData(dir, "資料：測試").committed, false);
});

test("另一台電腦（遠端已有分支）：接遠端的資料；再開一次直接用", t => {
  const { base, repo, mk } = setup(t);
  const dir = ensureDataWorktree(repo);
  fs.writeFileSync(path.join(dir, "a.json"), "1\n");
  publishData(dir, "資料：第一台");
  const repo2 = mk(path.join(base, "repo2"));
  const dir2 = ensureDataWorktree(repo2);
  assert.equal(fs.readFileSync(path.join(dir2, "a.json"), "utf8"), "1\n");
  assert.equal(ensureDataWorktree(repo2), dir2);
});

test("從 repo 的另一個 worktree 跑也接到主 checkout 底下同一個資料夾", t => {
  const { base, repo } = setup(t);
  const wt = path.join(base, "wt");
  git(repo, "worktree", "add", "-q", wt, "-b", "feat");
  assert.equal(ensureDataWorktree(wt), path.join(repo, ".price-data"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/price/git-data.test.mjs`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write implementation** — `tools/price/git-data.mjs`

```js
// price-data 資料分支：孤兒分支（不帶網站程式），自己帶 vercel.json 擋部署——maple-fx 10/13 實測 fx-data 推上去零部署，同一招。
// 放在「主 checkout」底下的 .price-data（從哪個 worktree 跑都接到同一個），.gitignore 擋掉。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const DATA_BRANCH = "price-data";
export const VERCEL_JSON = JSON.stringify({ git: { deploymentEnabled: false } }, null, 2) + "\n";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function mainRoot(cwd) {
  return path.dirname(git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"));
}

export function ensureDataWorktree(cwd, remote = "origin") {
  const root = mainRoot(cwd);
  const dir = path.join(root, ".price-data");
  if (fs.existsSync(path.join(dir, ".git"))) {
    try { git(dir, "pull", "-q", "--ff-only", remote, DATA_BRANCH); } catch { /* 沒網路或遠端還沒有：用本機的 */ }
    return dir;
  }
  const localHas = (() => { try { git(root, "rev-parse", "--verify", "-q", `refs/heads/${DATA_BRANCH}`); return true; } catch { return false; } })();
  if (localHas) {
    git(root, "worktree", "add", "-q", dir, DATA_BRANCH);
    return dir;
  }
  // 連不上遠端就丟錯：不然會在本機開一條新的孤兒分支，之後跟遠端的推不上去
  const remoteHas = git(root, "ls-remote", "--heads", remote, DATA_BRANCH) !== "";
  if (remoteHas) {
    git(root, "fetch", "-q", remote, `${DATA_BRANCH}:refs/remotes/${remote}/${DATA_BRANCH}`);
    git(root, "worktree", "add", "-q", "--track", "-b", DATA_BRANCH, dir, `${remote}/${DATA_BRANCH}`);
    return dir;
  }
  git(root, "worktree", "add", "-q", "--orphan", "-b", DATA_BRANCH, dir);
  fs.writeFileSync(path.join(dir, "vercel.json"), VERCEL_JSON);
  git(dir, "add", "vercel.json");
  git(dir, "commit", "-q", "-m", "price-data：開資料分支（vercel.json 擋部署）");
  return dir;
}

/** 收工：有變動就 commit，然後 push；回傳遠端是不是真的收到 */
export function publishData(dir, message, remote = "origin") {
  git(dir, "add", "-A");
  const changed = git(dir, "status", "--porcelain") !== "";
  if (changed) git(dir, "commit", "-q", "-m", message);
  git(dir, "push", "-q", "-u", remote, DATA_BRANCH);
  const sha = git(dir, "rev-parse", "HEAD");
  const remoteSha = git(dir, "ls-remote", remote, `refs/heads/${DATA_BRANCH}`).split(/\s+/)[0];
  return { committed: changed, pushed: remoteSha === sha, sha };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/price/git-data.test.mjs`
Expected: 4 pass（Windows 跟 ubuntu 都要過；git 要 2.42 以上才有 `--orphan`，CI 的 ubuntu-latest 有）

- [ ] **Step 5: Commit**

```bash
git add tools/price/git-data.mjs tools/price/git-data.test.mjs
git commit -m "v0.97: 拍賣查價——price-data 孤兒資料分支（自帶 vercel.json 擋部署、主 checkout 底下共用一份、收工 commit＋push 並核對遠端）" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Windows 內建文字辨識（ocr.ps1＋ocr.mjs）

**Files:**
- Create: `tools/price/ocr.ps1`（**只能有 ASCII**）、`tools/price/ocr.mjs`
- Test: `tools/price/ocr.test.mjs`

**Interfaces:**
- Produces: `ocrImage(imagePath: string, { scale = 1 } = {}): Promise<Ocr>`（非 Windows 直接 reject）、`normalize(json): Ocr`（把 PowerShell 單元素陣列被攤平的情況補回陣列）

- [ ] **Step 1: Write the failing test** — `tools/price/ocr.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ocrImage, normalize } from "./ocr.mjs";
import { squash } from "./match.mjs";

test("normalize：PowerShell 把只有一個元素的陣列攤平時補回來", () => {
  const o = normalize({ width: 1, height: 2, meanLuma: 3, stdLuma: 4, lines: { text: "a", words: { text: "a", x: 0, y: 0, w: 1, h: 1 } } });
  assert.equal(o.lines.length, 1);
  assert.equal(o.lines[0].words.length, 1);
  assert.deepEqual(normalize({ width: 1, height: 1, meanLuma: 0, stdLuma: 0, lines: null }).lines, []);
});

const WIN = { skip: process.platform !== "win32" && "文字辨識只在 Windows 跑" };

/** 用系統字型畫一張假的價格圖（10/13 手動驗過的同一招）；腳本要有 BOM，PowerShell 5.1 才讀得對中文 */
function makeSynthetic(dir) {
  const png = path.join(dir, "synthetic.png");
  const ps1 = path.join(dir, "make.ps1");
  fs.writeFileSync(ps1, "﻿" + `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 520,120
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(40,44,60))
$f = New-Object System.Drawing.Font("Microsoft JhengHei",11)
$g.DrawString("市價",$f,[System.Drawing.Brushes]::White,8,8)
$g.DrawString("手套攻擊卷軸10%     1,320,000     2026/10/12",$f,[System.Drawing.Brushes]::White,8,45)
$bmp.Save("${png}"); $g.Dispose(); $bmp.Dispose()
`, "utf8");
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1]);
  return png;
}

test("Windows：讀得出數字跟日期、亮度統計正常", WIN, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-ocr-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const o = await ocrImage(makeSynthetic(dir));
  assert.equal(o.width, 520);
  const all = squash(o.lines.map(l => l.text).join(" "));
  assert.match(all, /1,?320,?000/);
  assert.match(all, /2026\/10\/12/);
  assert.ok(o.lines[0].words[0].w > 0);
  assert.ok(o.meanLuma > 30 && o.stdLuma > 1, "不是黑畫面");
});

test("Windows：放大兩倍讀，位置換回原圖座標", WIN, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-ocr-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const o = await ocrImage(makeSynthetic(dir), { scale: 2 });
  const xs = o.lines.flatMap(l => l.words).map(w => w.x + w.w);
  assert.ok(Math.max(...xs) <= 520, "座標不超出原圖寬");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/price/ocr.test.mjs`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write implementation**

`tools/price/ocr.ps1`（ASCII only）：

```powershell
# Windows built-in OCR (zh-Hant-TW) for the MapleBook auction price tool (tools/price/ocr.mjs).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File ocr.ps1 -In <png> -Out <json> [-Scale 2]
# Output JSON (UTF-8): { width, height, meanLuma, stdLuma, lines: [{ text, words: [{ text, x, y, w, h }] }] }
# Coordinates are in the ORIGINAL image pixels even when -Scale is used.
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less files as ANSI.
param([Parameter(Mandatory = $true)][string]$In, [Parameter(Mandatory = $true)][string]$Out, [double]$Scale = 1)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime] | Out-Null
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $task.Wait(); $task.Result }

# Brightness on a 64x64 grid: a black capture (exclusive fullscreen) is dark and flat.
$src = [System.Drawing.Bitmap]::FromFile($In)
$w0 = $src.Width; $h0 = $src.Height
$vals = New-Object 'System.Collections.Generic.List[double]'
for ($gy = 0; $gy -lt 64; $gy++) {
    for ($gx = 0; $gx -lt 64; $gx++) {
        $p = $src.GetPixel([int][Math]::Floor(($gx + 0.5) * $w0 / 64), [int][Math]::Floor(($gy + 0.5) * $h0 / 64))
        $vals.Add(0.299 * $p.R + 0.587 * $p.G + 0.114 * $p.B)
    }
}
$mean = ($vals | Measure-Object -Average).Average
$var = ($vals | ForEach-Object { ($_ - $mean) * ($_ - $mean) } | Measure-Object -Average).Average
$std = [Math]::Sqrt($var)

$path = $In
if ($Scale -ne 1) {
    $bw = [int]($w0 * $Scale); $bh = [int]($h0 * $Scale)
    $big = New-Object System.Drawing.Bitmap $bw, $bh
    $g = [System.Drawing.Graphics]::FromImage($big)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, 0, 0, $bw, $bh); $g.Dispose()
    $path = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.IO.Path]::GetRandomFileName() + '.png')
    $big.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $big.Dispose()
}
$src.Dispose()

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language 'zh-Hant-TW'))
if ($null -eq $eng) { throw 'zh-Hant-TW OCR language is not installed' }
$res = Await ($eng.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
$stream.Dispose()
if ($path -ne $In) { Remove-Item $path -ErrorAction SilentlyContinue }

$lines = @($res.Lines | ForEach-Object {
        $words = @($_.Words | ForEach-Object {
                $r = $_.BoundingRect
                [ordered]@{ text = $_.Text; x = $r.X / $Scale; y = $r.Y / $Scale; w = $r.Width / $Scale; h = $r.Height / $Scale }
            })
        [ordered]@{ text = $_.Text; words = $words }
    })
$json = [ordered]@{ width = $w0; height = $h0; meanLuma = $mean; stdLuma = $std; lines = $lines } | ConvertTo-Json -Depth 6 -Compress
[System.IO.File]::WriteAllText($Out, $json, (New-Object System.Text.UTF8Encoding $false))
```

`tools/price/ocr.mjs`：

```js
// 讀一張截圖：呼叫 ocr.ps1（Windows 內建繁中文字辨識，不花錢、不用網路、不用 AI）。
// 回傳 { width, height, meanLuma, stdLuma, lines:[{ text, words:[{ text, x, y, w, h }] }] }，座標是原圖像素。
// 10/13 用合成圖實測：數字、日期全對；中文會錯一兩個字（交給 match.mjs 的比對處理）。只能在 Windows 跑。
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PS1 = path.join(import.meta.dirname, "ocr.ps1");
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);

/** PowerShell 5.1 的 ConvertTo-Json 會把只有一個元素的陣列攤平成物件，這裡補回陣列 */
export function normalize(j) {
  return {
    width: j.width, height: j.height, meanLuma: j.meanLuma, stdLuma: j.stdLuma,
    lines: arr(j.lines).map(l => ({ text: l.text ?? "", words: arr(l.words) })),
  };
}

export function ocrImage(imagePath, { scale = 1 } = {}) {
  if (process.platform !== "win32") return Promise.reject(new Error("文字辨識只能在 Windows 跑"));
  const out = path.join(os.tmpdir(), `maplebook-ocr-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS1, "-In", imagePath, "-Out", out, "-Scale", String(scale)];
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", args, { windowsHide: true, timeout: 60_000 }, (err, _stdout, stderr) => {
      try {
        if (err) throw new Error(`文字辨識失敗：${String(stderr || err.message).trim()}`);
        resolve(normalize(JSON.parse(fs.readFileSync(out, "utf8").replace(/^﻿/, ""))));
      } catch (e) {
        reject(e);
      } finally {
        fs.rmSync(out, { force: true });
      }
    });
  });
}
```

- [ ] **Step 4: 確認 ocr.ps1 只有 ASCII**

Run: `node -e "const s=require('fs').readFileSync('tools/price/ocr.ps1','utf8');const bad=[...s].filter(c=>c.charCodeAt(0)>127);console.log(bad.length?'NOT ASCII: '+bad.join(''):'ascii ok')"`
Expected: `ascii ok`

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tools/price/ocr.test.mjs`
Expected: Windows 上 3 pass；別的系統 1 pass、2 skip

- [ ] **Step 6: Commit**

```bash
git add tools/price/ocr.ps1 tools/price/ocr.mjs tools/price/ocr.test.mjs
git commit -m "v0.97: 拍賣查價——Windows 內建繁中文字辨識（每個字的位置、可放大兩倍讀、亮度統計認黑畫面），不用 AI" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 截圖監看＋配對到「剛複製的那件」（watch.mjs＋session.mjs）

**Files:**
- Create: `tools/price/watch.mjs`、`tools/price/session.mjs`
- Test: `tools/price/watch.test.mjs`、`tools/price/session.test.mjs`

**Interfaces:**
- Consumes: `todayList`、`localDate`、`localIso`（Task 1）、`parseShot`（Task 3）、`checkTrade`（Task 3）、`loadData`、`saveData`、`addTrades`（Task 5）、`summarize`（Task 4）
- Produces:
  - `watchShots(dir, onShot: (file) => void, { stableMs = 500 } = {}): () => void`（回傳關掉的函式；開工前就在的圖不算、只看 .png、不看子資料夾）
  - `DONE_DIR = "已記價"`
  - `createSession({ date: Date, dataFile, ocr: (file) => Promise<Ocr>, now = () => new Date() })` → `{ today, state(), copyNext(): string | null, setCurrent(name), handleShot(file): Promise<void> }`
  - `state()` 回傳 `{ today, current, orphans: [{ file, reason }], items: [{ name, freq, status: "todo"|"current"|"done"|"retry", shots: [{ file, status: "reading"|"ok"|"black"|"not-auction"|"wrong-item"|"empty"|"error", reason, added, skipped, review }] }] }`

- [ ] **Step 1: Write the failing tests**

`tools/price/watch.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { watchShots } from "./watch.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));

test("新的 png 寫完才通知一次；開工前就在的、不是 png 的不算", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-watch-"));
  fs.writeFileSync(path.join(dir, "old.png"), "x");
  const got = [];
  const close = watchShots(dir, f => got.push(path.basename(f)), { stableMs: 150 });
  t.after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const file = path.join(dir, "new.png");
  fs.writeFileSync(file, "part1");
  await sleep(50);
  fs.appendFileSync(file, "part2");
  fs.writeFileSync(path.join(dir, "note.txt"), "x");
  fs.appendFileSync(path.join(dir, "old.png"), "y");
  await sleep(600);
  assert.deepEqual(got, ["new.png"]);
});
```

`tools/price/session.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSession, DONE_DIR } from "./session.mjs";
import { loadData } from "./store.mjs";

/** 假的辨識：檔名 → 這張圖的文字列 */
function fakeOcr(byName) {
  return async file => {
    const rows = byName[path.basename(file)];
    if (rows === "boom") throw new Error("engine missing");
    return {
      width: 1366, height: 768, meanLuma: rows === "black" ? 2 : 120, stdLuma: rows === "black" ? 1 : 40,
      lines: (rows === "black" ? [] : rows).map((words, i) => ({ text: words.join(" "), words: words.map((text, j) => ({ text, x: j * 40, y: i * 30, w: 30, h: 16 })) })),
    };
  };
}

function setup(t, byName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-session-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const shots = path.join(dir, "shots");
  fs.mkdirSync(shots);
  const shot = name => { const f = path.join(shots, name); fs.writeFileSync(f, "png"); return f; };
  const dataFile = path.join(dir, "data", "auction", "scania.json");
  const s = createSession({ date: new Date(2026, 9, 13), dataFile, ocr: fakeOcr(byName), now: () => new Date(2026, 9, 13, 21, 0, 0) });
  return { s, shot, shots, dataFile };
}

const page = [["市", "價"]];
const glove = p => ["手", "套", "攻", "擊", "卷", "軸", "10", "%", p, "2026/10/12"];

test("複製下一件照清單順序，查完的跳過，全部查完回 null", async t => {
  const { s, shot } = setup(t, { "a.png": [...page, glove("1,320,000")] });
  assert.equal(s.copyNext(), "手套攻擊卷軸10%");
  await s.handleShot(shot("a.png"));
  assert.equal(s.copyNext(), "手套攻擊卷軸60%");
  for (let i = 0; i < 3; i++) s.copyNext();
  assert.equal(s.state().current, "寵物速度卷軸100%");
  assert.equal(s.copyNext(), "手套攻擊卷軸60%", "繞回去還沒查的，查完的 10% 跳過");
});

test("截圖對到剛複製那件：存進資料、搬到已記價", async t => {
  const { s, shot, shots, dataFile } = setup(t, { "a.png": [...page, glove("1,320,000"), glove("1,280,000")] });
  s.copyNext();
  await s.handleShot(shot("a.png"));
  const item = s.state().items[0];
  assert.equal(item.status, "current");
  assert.deepEqual(item.shots.map(x => [x.status, x.added]), [["ok", 2]]);
  assert.equal(loadData(dataFile).trades.length, 2);
  assert.ok(fs.existsSync(path.join(shots, DONE_DIR, "a.png")));
  assert.equal(fs.existsSync(path.join(shots, "a.png")), false);
  s.copyNext();
  assert.equal(s.state().items[0].status, "done");
});

test("同一張再截一次：重複的略過", async t => {
  const { s, shot } = setup(t, { "a.png": [...page, glove("1,320,000")], "b.png": [...page, glove("1,320,000")] });
  s.copyNext();
  await s.handleShot(shot("a.png"));
  await s.handleShot(shot("b.png"));
  assert.deepEqual(s.state().items[0].shots.map(x => [x.added, x.skipped]), [[1, 0], [0, 1]]);
});

test("品名對不上、黑畫面、辨識壞掉：寫原因，不存", async t => {
  const { s, shot, dataFile, shots } = setup(t, {
    "w.png": [...page, ["日", "之", "鏢", "350,000", "2026/10/12"]], "k.png": "black", "e.png": "boom",
  });
  s.copyNext();
  await s.handleShot(shot("w.png"));
  await s.handleShot(shot("k.png"));
  await s.handleShot(shot("e.png"));
  const sh = s.state().items[0].shots;
  assert.deepEqual(sh.map(x => x.status), ["wrong-item", "black", "error"]);
  assert.equal(sh[0].reason, "對不上，請重截");
  assert.match(sh[2].reason, /engine missing/);
  assert.equal(loadData(dataFile).trades.length, 0);
  assert.ok(fs.existsSync(path.join(shots, "e.png")), "辨識壞掉的留在原地");
  s.copyNext();
  assert.equal(s.state().items[0].status, "retry");
});

test("還沒按複製下一件就截圖：記下來、不知道是哪件", async t => {
  const { s, shot } = setup(t, {});
  await s.handleShot(shot("x.png"));
  assert.match(s.state().orphans[0].reason, /複製下一件/);
});

test("跟上次中間價差 5 倍的那筆存成黃色", async t => {
  const { s, shot, dataFile } = setup(t, { "a.png": [...page, glove("1,000,000")], "b.png": [...page, glove("9,000,000")] });
  s.copyNext();
  await s.handleShot(shot("a.png"));
  await s.handleShot(shot("b.png"));
  const trades = loadData(dataFile).trades;
  assert.deepEqual(trades.map(x => x.status), ["ok", "review"]);
  assert.equal(s.state().items[0].shots[1].review, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/price/watch.test.mjs tools/price/session.test.mjs`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write implementation**

`tools/price/watch.mjs`：

```js
// 盯截圖資料夾（Win+PrtSc 存到 Pictures\Screenshots）：新的 .png 大小停住不變才算寫完，通知一次。
// 開工前就在的圖不算；子資料夾（已記價）不看。
import fs from "node:fs";
import path from "node:path";

export function watchShots(dir, onShot, { stableMs = 500 } = {}) {
  const seen = new Set(fs.readdirSync(dir));
  const timers = new Map();
  const settle = (name, lastSize) => {
    timers.set(name, setTimeout(() => {
      let size;
      try { size = fs.statSync(path.join(dir, name)).size; } catch { timers.delete(name); return; }
      if (size > 0 && size === lastSize) {
        timers.delete(name);
        seen.add(name);
        onShot(path.join(dir, name));
      } else settle(name, size);
    }, stableMs));
  };
  const watcher = fs.watch(dir, (_event, name) => {
    if (!name || !/\.png$/i.test(name) || name.includes(path.sep) || seen.has(name) || timers.has(name)) return;
    settle(name, -1);
  });
  return () => {
    watcher.close();
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  };
}
```

`tools/price/session.mjs`：

```js
// 一次查價：清單、目前複製的是哪件、每張截圖讀到什麼。截圖一出現就算「剛複製的那件」（照出現順序，不照讀完順序）。
// 讀圖一張一張排隊（PowerShell 一次開一個）。讀完搬到 已記價\；辨識本身壞掉的留在原地，修好可以重來。
import fs from "node:fs";
import path from "node:path";
import { todayList, localDate, localIso } from "./list.mjs";
import { parseShot } from "./parse.mjs";
import { checkTrade } from "./checks.mjs";
import { loadData, saveData, addTrades } from "./store.mjs";
import { summarize } from "./stats.mjs";

export const DONE_DIR = "已記價";

function moveToDone(file) {
  const doneDir = path.join(path.dirname(file), DONE_DIR);
  fs.mkdirSync(doneDir, { recursive: true });
  let target = path.join(doneDir, path.basename(file));
  if (fs.existsSync(target)) target = path.join(doneDir, `${Date.now()}-${path.basename(file)}`);
  fs.renameSync(file, target);
  return path.basename(target);
}

export function createSession({ date, dataFile, ocr, now = () => new Date() }) {
  const today = localDate(date);
  const items = todayList(date).map(x => ({ ...x, shots: [] }));
  const orphans = [];
  let current = null;
  let queue = Promise.resolve();

  const find = name => items.find(i => i.name === name);
  const statusOf = item => {
    if (item.name === current) return "current";
    if (item.shots.some(s => s.status === "ok")) return "done";
    if (item.shots.length) return "retry";
    return "todo";
  };

  async function process(item, shot, file) {
    try {
      const result = parseShot(await ocr(file), { item: item.name, today });
      if (result.kind === "ok") {
        const data = loadData(dataFile);
        const prevUnitMedian = summarize(data.trades, item.name, null).median ?? null;
        const trades = result.trades.map(t => ({ ...t, flags: checkTrade(t, { today, prevUnitMedian }) }));
        shot.file = moveToDone(file);
        const { added, skipped } = addTrades(data, trades, { item: item.name, shot: shot.file, recordedAt: localIso(now()) });
        saveData(dataFile, data);
        shot.added = added.length;
        shot.skipped = skipped;
        shot.review = data.trades.filter(t => added.includes(t.id) && t.status === "review").length;
      } else {
        shot.file = moveToDone(file);
      }
      shot.status = result.kind;
      shot.reason = result.reason;
    } catch (e) {
      shot.status = "error";
      shot.reason = `讀圖失敗：${e.message}`;
    }
  }

  return {
    today,
    state() {
      return {
        today, current,
        orphans: orphans.map(o => ({ ...o })),
        items: items.map(i => ({ name: i.name, freq: i.freq, status: statusOf(i), shots: i.shots.map(s => ({ ...s })) })),
      };
    },
    copyNext() {
      const start = current ? items.findIndex(i => i.name === current) + 1 : 0;
      const order = [...items.slice(start), ...items.slice(0, start)];
      const prev = current;
      const next = order.find(i => i.name !== prev && !i.shots.some(s => s.status === "ok")) ?? null;
      current = next?.name ?? null;
      return current;
    },
    setCurrent(name) {
      if (!find(name)) throw new Error(`今天的清單裡沒有「${name}」`);
      current = name;
    },
    handleShot(file) {
      const item = current ? find(current) : null;
      if (!item) {
        orphans.push({ file: path.basename(file), reason: "還沒按「複製下一件」，不知道這張是哪一件" });
        return Promise.resolve();
      }
      const shot = { file: path.basename(file), status: "reading", reason: "", added: 0, skipped: 0, review: 0 };
      item.shots.push(shot);
      queue = queue.then(() => process(item, shot, file));
      return queue;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/price/watch.test.mjs tools/price/session.test.mjs`
Expected: 全部 pass

- [ ] **Step 5: Commit**

```bash
git add tools/price/watch.mjs tools/price/watch.test.mjs tools/price/session.mjs tools/price/session.test.mjs
git commit -m "v0.97: 拍賣查價——盯截圖資料夾、截圖對到剛複製那件、讀完存檔搬到已記價、對不上／黑畫面寫原因" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 本機網頁（server.mjs＋page/）＋ README

**Files:**
- Create: `tools/price/server.mjs`、`tools/price/routes.mjs`、`tools/price/page/index.html`、`tools/price/page/app.js`、`tools/price/page/style.css`
- Test: `tools/price/routes.test.mjs`
- Modify: `README.md`（加「拍賣查價工具（本機）」一節）

**Interfaces:**
- Consumes: 前面全部。
- Produces: `createHandler({ session, dataFile, shotsDir, getFx, publish }) → (req, res) => void`（routes.mjs，可測）；`npm run price` 開 `http://localhost:9380`
- API：
  - `GET /api/state` → `{ server, today, current, orphans, items, fx: { available, updatedAt } }`
  - `POST /api/next` → `{ name }`；`POST /api/current` body `{ name }` → `{ ok }`
  - `GET /api/summary` → `{ rows: summarize(...)[] }`（9 件全列）
  - `GET /api/item?name=` → `{ summary, series: [{ key, points }], trades, minTrendDays }`
  - `GET /api/review` → `{ trades }`（status review 的，含 shot、box）
  - `POST /api/trade` body `{ id, action: "confirm"|"delete"|"edit", patch? }` → `{ ok }`
  - `POST /api/finish` → `{ committed, pushed, sha }` 或 `{ error }`
  - `GET /shot?file=` → 已記價資料夾裡的圖（只收檔名，擋 `..`、`/`、`\`）

- [ ] **Step 1: Write the failing test** — `tools/price/routes.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createHandler } from "./routes.mjs";
import { emptyData, addTrades, saveData } from "./store.mjs";

function serve(t, handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => {
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve(async (p, body) => {
      const res = await fetch(base + p, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
      const type = res.headers.get("content-type") ?? "";
      return { status: res.status, type, json: type.includes("json") ? await res.json() : null };
    });
  }));
}

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-routes-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, "scania.json");
  const d = emptyData();
  addTrades(d, [
    { tradedAt: "2026-10-12", price: 1000, unitPrice: 1000, qty: 1, attrs: null, flags: [], box: null },
    { tradedAt: "2026-10-12", price: 99, unitPrice: 99, qty: 1, attrs: null, flags: ["跟上次中間價差 5 倍以上"], box: { x: 1, y: 2, w: 3, h: 4 } },
  ], { item: "日之鏢", shot: "a.png", recordedAt: "2026-10-13T21:00:00+08:00" });
  saveData(dataFile, d);
  const shotsDir = path.join(dir, "shots");
  fs.mkdirSync(path.join(shotsDir, "已記價"), { recursive: true });
  fs.writeFileSync(path.join(shotsDir, "已記價", "a.png"), "png");
  let current = null;
  const session = {
    state: () => ({ today: "2026-10-13", current, orphans: [], items: [] }),
    copyNext: () => (current = "日之鏢"),
    setCurrent: n => { current = n; },
  };
  const handler = createHandler({ session, dataFile, shotsDir, getFx: () => null, publish: () => ({ committed: true, pushed: true, sha: "abc" }) });
  return { handler, dataFile };
}

test("state、next、current", async t => {
  const { handler } = setup(t);
  const get = await serve(t, handler);
  assert.equal((await get("/api/state")).json.server, "雪吉拉");
  assert.equal((await get("/api/next", {})).json.name, "日之鏢");
  assert.equal((await get("/api/current", { name: "雷之鏢" })).json.ok, true);
  assert.equal((await get("/api/state")).json.current, "雷之鏢");
  assert.equal((await get("/api/state")).json.fx.available, false);
});

test("summary 9 件全列；item 有走勢跟明細；review 只有黃色", async t => {
  const { handler } = setup(t);
  const get = await serve(t, handler);
  const rows = (await get("/api/summary")).json.rows;
  assert.equal(rows.length, 9);
  assert.equal(rows.find(r => r.item === "日之鏢").median, 1000);
  const item = (await get(`/api/item?name=${encodeURIComponent("日之鏢")}`)).json;
  assert.equal(item.trades.length, 2);
  assert.deepEqual(item.series[0].points, [{ date: "2026-10-12", median: 1000, count: 1 }]);
  assert.equal((await get("/api/review")).json.trades.length, 1);
});

test("trade 確認後 review 清空；finish 回 push 結果", async t => {
  const { handler } = setup(t);
  const get = await serve(t, handler);
  const id = (await get("/api/review")).json.trades[0].id;
  assert.equal((await get("/api/trade", { id, action: "confirm" })).json.ok, true);
  assert.equal((await get("/api/review")).json.trades.length, 0);
  assert.equal((await get("/api/finish", {})).json.pushed, true);
});

test("shot 只給已記價裡的檔名；擋路徑穿越", async t => {
  const { handler } = setup(t);
  const get = await serve(t, handler);
  assert.equal((await get("/shot?file=a.png")).status, 200);
  assert.equal((await get(`/shot?file=${encodeURIComponent("../scania.json")}`)).status, 400);
  assert.equal((await get("/shot?file=nope.png")).status, 404);
});

test("頁面跟靜態檔", async t => {
  const { handler } = setup(t);
  const get = await serve(t, handler);
  assert.match((await get("/")).type, /text\/html/);
  assert.match((await get("/app.js")).type, /javascript/);
  assert.equal((await get("/nope")).status, 404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/price/routes.test.mjs`
Expected: FAIL（模組不存在）

- [ ] **Step 3: Write `tools/price/routes.mjs`**

```js
// 本機查價頁的 API（server.mjs 只負責接線；這裡可以單獨測）
import fs from "node:fs";
import path from "node:path";
import { SERVER, ALL_ITEMS, EQUIPS } from "./list.mjs";
import { loadData, saveData, confirmTrade, deleteTrade, editTrade } from "./store.mjs";
import { summarize, series, attrKey, MIN_TREND_DAYS } from "./stats.mjs";
import { DONE_DIR } from "./session.mjs";

const PAGE_DIR = path.join(import.meta.dirname, "page");
const STATIC = { "/": ["index.html", "text/html; charset=utf-8"], "/app.js": ["app.js", "text/javascript; charset=utf-8"], "/style.css": ["style.css", "text/css; charset=utf-8"] };

const send = (res, status, body, type = "application/json; charset=utf-8") => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const readBody = req => new Promise((resolve, reject) => {
  let s = "";
  req.on("data", c => { s += c; });
  req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
  req.on("error", reject);
});

export function createHandler({ session, dataFile, shotsDir, getFx, publish }) {
  return async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    try {
      if (req.method === "GET" && STATIC[p]) {
        const [file, type] = STATIC[p];
        return send(res, 200, fs.readFileSync(path.join(PAGE_DIR, file)), type);
      }
      if (req.method === "GET" && p === "/api/state") {
        const fx = getFx();
        return send(res, 200, { server: SERVER, ...session.state(), fx: { available: !!fx?.days?.length, updatedAt: fx?.updatedAt ?? null } });
      }
      if (req.method === "POST" && p === "/api/next") return send(res, 200, { name: session.copyNext() });
      if (req.method === "POST" && p === "/api/current") {
        session.setCurrent((await readBody(req)).name);
        return send(res, 200, { ok: true });
      }
      if (req.method === "GET" && p === "/api/summary") {
        const trades = loadData(dataFile).trades;
        const days = getFx()?.days ?? null;
        return send(res, 200, { rows: ALL_ITEMS.map(item => summarize(trades, item, days)) });
      }
      if (req.method === "GET" && p === "/api/item") {
        const name = url.searchParams.get("name");
        const trades = loadData(dataFile).trades;
        const mine = trades.filter(t => t.item === name);
        const keys = EQUIPS.has(name) ? [...new Set(mine.filter(t => t.status === "ok").map(t => attrKey(t.attrs)))].sort() : [null];
        return send(res, 200, {
          summary: summarize(trades, name, getFx()?.days ?? null),
          series: keys.map(key => ({ key, points: series(trades, name, key) })),
          trades: mine.sort((a, b) => b.tradedAt.localeCompare(a.tradedAt)),
          minTrendDays: MIN_TREND_DAYS,
        });
      }
      if (req.method === "GET" && p === "/api/review") {
        return send(res, 200, { trades: loadData(dataFile).trades.filter(t => t.status === "review") });
      }
      if (req.method === "POST" && p === "/api/trade") {
        const { id, action, patch } = await readBody(req);
        const data = loadData(dataFile);
        const ok = action === "confirm" ? confirmTrade(data, id) : action === "delete" ? deleteTrade(data, id) : action === "edit" ? editTrade(data, id, patch ?? {}) : false;
        if (ok) saveData(dataFile, data);
        return send(res, ok ? 200 : 400, { ok });
      }
      if (req.method === "POST" && p === "/api/finish") {
        try { return send(res, 200, await publish()); } catch (e) { return send(res, 500, { error: e.message }); }
      }
      if (req.method === "GET" && p === "/shot") {
        const file = url.searchParams.get("file") ?? "";
        if (!file || file !== path.basename(file) || file.includes("..")) return send(res, 400, { error: "檔名不對" });
        const full = path.join(shotsDir, DONE_DIR, file);
        if (!fs.existsSync(full)) return send(res, 404, { error: "找不到這張截圖" });
        return send(res, 200, fs.readFileSync(full), "image/png");
      }
      return send(res, 404, { error: "沒有這個頁面" });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  };
}
```

- [ ] **Step 4: Write `tools/price/server.mjs`**

```js
// 拍賣查價工具（本機，v0.97）：npm run price → http://localhost:9380
// 設計：docs/superpowers/specs/2026-10-13-auction-price-tool-design.md；用法：README「拍賣查價工具（本機）」
// 只綁 127.0.0.1；不碰遊戲、不切視窗、不按鍵，只盯截圖資料夾。
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { createSession } from "./session.mjs";
import { createHandler } from "./routes.mjs";
import { watchShots } from "./watch.mjs";
import { ocrImage } from "./ocr.mjs";
import { fetchFx } from "./fx.mjs";
import { ensureDataWorktree, publishData } from "./git-data.mjs";
import { DATA_REL } from "./store.mjs";
import { localDate, SERVER } from "./list.mjs";

const PORT = Number(process.env.PRICE_PORT ?? 9380);
const SHOTS_DIR = process.env.PRICE_SHOTS_DIR ?? path.join(os.homedir(), "Pictures", "Screenshots");
const OCR_SCALE = Number(process.env.PRICE_OCR_SCALE ?? 1);

if (!fs.existsSync(SHOTS_DIR)) {
  console.error(`找不到截圖資料夾：${SHOTS_DIR}\n按一次 Win+PrtSc 讓 Windows 建出來，或用 PRICE_SHOTS_DIR 指定。`);
  process.exit(1);
}

let dataDir;
try {
  dataDir = ensureDataWorktree(process.cwd());
} catch (e) {
  console.error(`接不上 price-data 資料分支（要連得到 GitHub）：${e.message}`);
  process.exit(1);
}
const dataFile = path.join(dataDir, DATA_REL);

let fx = null;
const refreshFx = async () => { fx = (await fetchFx()) ?? fx; };
await refreshFx();
setInterval(refreshFx, 30 * 60 * 1000).unref();

const session = createSession({ date: new Date(), dataFile, ocr: file => ocrImage(file, { scale: OCR_SCALE }) });
const stopWatch = watchShots(SHOTS_DIR, file => { session.handleShot(file); });

const handler = createHandler({
  session, dataFile, shotsDir: SHOTS_DIR, getFx: () => fx,
  publish: () => {
    const n = session.state().items.reduce((sum, i) => sum + i.shots.reduce((a, s) => a + (s.added ?? 0), 0), 0);
    return publishData(dataDir, `資料：${SERVER}拍賣價 ${localDate(new Date())} 新增 ${n} 筆`);
  },
});

const server = http.createServer(handler);
server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`查價清單：${url}\n截圖資料夾：${SHOTS_DIR}\n資料：${dataFile}\n按 Ctrl+C 結束（記得先在頁面按「收工」）`);
  if (process.platform === "win32" && !process.env.PRICE_NO_OPEN) spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
});

process.on("SIGINT", () => { stopWatch(); server.close(); process.exit(0); });
```

- [ ] **Step 5: Write the page** — `tools/price/page/index.html`

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>查價清單</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header>
    <h1 id="title">查價清單</h1>
    <p id="sub" class="muted"></p>
  </header>

  <section>
    <div class="bar">
      <button id="next" class="primary">複製下一件</button>
      <span id="toast" class="muted" role="status"></span>
    </div>
    <p class="muted small">遊戲裡：拍賣 → 快速搜尋貼上 → 搜尋 → 切「市價」→ Win+PrtSc。一屏放不下就捲下去再截，都算同一件。</p>
    <ol id="list" class="list"></ol>
    <div id="orphans"></div>
  </section>

  <section id="review-sec" hidden>
    <h2>要你看一眼</h2>
    <p class="muted small">這幾筆沒過檢查，不算進中間價。對照截圖確認、改數字或刪掉。</p>
    <div id="review"></div>
  </section>

  <section>
    <h2>價格表</h2>
    <p id="fxnote" class="muted small"></p>
    <table id="table">
      <thead><tr><th>品名</th><th class="num">中間價（楓幣）</th><th class="num">台幣</th><th class="num">比上次</th><th class="num">筆數</th><th>最後成交</th></tr></thead>
      <tbody></tbody>
    </table>
    <div id="detail" hidden></div>
  </section>

  <section class="finish">
    <button id="finish">收工</button>
    <span id="finish-msg" class="muted" role="status"></span>
  </section>

  <script src="/app.js"></script>
</body>
</html>
```

`tools/price/page/style.css`：

```css
:root {
  --bg: #f6f5f1; --card: #ffffff; --ink: #1d1f24; --muted: #5d6270; --line: #dcdad3;
  --accent: #1f5fbf; --on-accent: #ffffff; --warn-bg: #fff4cc; --warn-ink: #6b4e00;
  --up: #b3261e; --down: #1b7a3d; --current: #e8f0fd;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #15171c; --card: #1e2128; --ink: #eceef2; --muted: #a3a9b6; --line: #333844;
    --accent: #7fb0ff; --on-accent: #0d1117; --warn-bg: #3a3112; --warn-ink: #ffe08a;
    --up: #ff8a80; --down: #7ee2a0; --current: #22324d;
  }
}
* { box-sizing: border-box; }
body { margin: 0 auto; max-width: 960px; padding: 16px; background: var(--bg); color: var(--ink);
  font: 16px/1.6 "Microsoft JhengHei", "Noto Sans TC", system-ui, sans-serif; }
h1 { font-size: 24px; margin: 0; } h2 { font-size: 18px; margin: 0 0 8px; }
section { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin: 16px 0; }
.muted { color: var(--muted); } .small { font-size: 14px; }
.bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--ink); cursor: pointer; }
button.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); font-size: 18px; padding: 10px 20px; }
.list { list-style: none; padding: 0; margin: 8px 0 0; }
.list li { display: flex; gap: 12px; align-items: center; padding: 8px 10px; border-radius: 8px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.list li.current { background: var(--current); }
.list .name { font-weight: 700; min-width: 11em; }
.tag { font-size: 13px; color: var(--muted); border: 1px solid var(--line); border-radius: 99px; padding: 0 8px; }
.warn { background: var(--warn-bg); color: var(--warn-ink); border-radius: 6px; padding: 2px 8px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tbody tr { cursor: pointer; } tbody tr:hover { background: var(--current); }
.up { color: var(--up); } .down { color: var(--down); }
.review-card { border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin: 8px 0; }
.review-card canvas { max-width: 100%; border: 1px solid var(--line); border-radius: 4px; display: block; margin: 8px 0; }
.review-card label { margin-right: 12px; } .review-card input { width: 9em; font: inherit; }
svg text { fill: var(--muted); font-size: 12px; }
@media (max-width: 600px) { .list .name { min-width: 0; } th:nth-child(5), td:nth-child(5) { display: none; } }
```

`tools/price/page/app.js`：

```js
// 本機查價頁：每秒拉一次狀態。按鈕只動剪貼簿跟本機 API，不碰遊戲。
const $ = s => document.querySelector(s);
const fmt = n => (n == null ? "—" : Number(n).toLocaleString("zh-TW"));
const md = ymd => (ymd ? `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}` : "—");
const WEEK = "日一二三四五六";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const api = async (path, body) => {
  const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  return res.json();
};

let openItem = null;
let unit = "meso";

async function copy(name) {
  try { await navigator.clipboard.writeText(name); toast(`已複製：${name}`); }
  catch { toast(`複製失敗，請手動選取：${name}`); }
}
function toast(s) { $("#toast").textContent = s; }

$("#next").onclick = async () => {
  const { name } = await api("/api/next", {});
  if (!name) return toast("今天的清單查完了");
  await copy(name);
  refresh();
};

$("#finish").onclick = async () => {
  $("#finish-msg").textContent = "推上去中…";
  const r = await api("/api/finish", {});
  $("#finish-msg").textContent = r.error ? `沒推上去：${r.error}`
    : r.pushed ? `已推上去 price-data（${r.sha.slice(0, 7)}）${r.committed ? "" : "，這次沒有新資料"}` : "commit 了但遠端沒收到，等一下再按一次";
};

function shotText(s) {
  if (s.status === "reading") return "讀圖中";
  if (s.status === "ok") return `讀到 ${s.added} 筆新的${s.skipped ? `（${s.skipped} 筆重複略過）` : ""}${s.review ? `，${s.review} 筆要你看一眼` : ""}`;
  return s.reason;
}

function renderList(st) {
  const d = new Date(`${st.today}T00:00:00`);
  $("#title").textContent = `${st.server} 查價清單`;
  $("#sub").textContent = `${md(st.today)}（週${WEEK[d.getDay()]}）每天 5 件${d.getDay() === 1 ? "，今天週一多 4 件" : ""}`;
  $("#list").innerHTML = st.items.map(i => {
    const last = i.shots.at(-1);
    const bad = last && !["ok", "reading"].includes(last.status);
    const status = last ? shotText(last) : i.status === "current" ? "等你截圖" : "還沒查";
    return `<li class="${i.status === "current" ? "current" : ""}">
      <span class="name">${esc(i.name)}</span><span class="tag">${i.freq === "daily" ? "每天" : "每週"}</span>
      <span class="${bad ? "warn" : "muted"}">${esc(status)}</span>
      <button data-copy="${esc(i.name)}">複製</button></li>`;
  }).join("");
  $("#list").querySelectorAll("[data-copy]").forEach(b => { b.onclick = async () => { await api("/api/current", { name: b.dataset.copy }); await copy(b.dataset.copy); refresh(); }; });
  $("#orphans").innerHTML = st.orphans.map(o => `<p class="warn small">${esc(o.file)}：${esc(o.reason)}</p>`).join("");
  $("#fxnote").textContent = st.fx.available ? "台幣用雪吉拉當天匯率換算（8591 賣家開價算的，不是成交價）" : "台幣：匯率資料累積中";
}

function changeCell(r) {
  if (r.changePct == null) return "—";
  if (r.changePct === 0) return "持平";
  return `<span class="${r.changePct > 0 ? "up" : "down"}">${r.changePct > 0 ? "漲" : "跌"} ${Math.abs(r.changePct)}%</span>`;
}

async function renderTable(fxAvailable) {
  const { rows } = await api("/api/summary");
  $("#table tbody").innerHTML = rows.map(r => {
    if (!r.count) return `<tr data-item="${esc(r.item)}"><td>${esc(r.item)}</td><td class="num muted" colspan="5">還沒有資料</td></tr>`;
    const ntd = r.ntd == null ? (fxAvailable ? "沒有那天的匯率" : "累積中") : `${fmt(r.ntd)} 元${r.fxExact ? "" : `（用 ${md(r.fxDate)} 匯率）`}`;
    const count = r.few ? `只有 ${r.count} 筆，參考就好` : `${r.count} 筆`;
    return `<tr data-item="${esc(r.item)}"><td>${esc(r.item)}</td><td class="num">${r.groups ? "照屬性分開" : fmt(r.median)}</td>
      <td class="num">${r.groups ? "—" : ntd}</td><td class="num">${changeCell(r)}</td><td class="num">${count}</td><td>${md(r.lastTradedAt)}</td></tr>`;
  }).join("");
  $("#table tbody").querySelectorAll("tr").forEach(tr => { tr.onclick = () => { openItem = tr.dataset.item; renderDetail(); }; });
}

function trendSvg(points, minDays, close) {
  if (points.length < minDays) return `<p class="muted small">累積中（走勢要 ${minDays} 天以上，現在 ${points.length} 天）</p>`;
  const W = 640, H = 200, P = 36;
  const vals = points.map(p => (unit === "ntd" && close ? p.median * close / 1e8 : p.median));
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const x = i => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = v => H - P - ((v - lo) * (H - 2 * P)) / span;
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="中間價走勢">
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    ${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="var(--accent)"/>`).join("")}
    <text x="${P}" y="${H - 8}">${md(points[0].date)}</text><text x="${W - P}" y="${H - 8}" text-anchor="end">${md(points.at(-1).date)}</text>
    <text x="4" y="${y(hi) + 4}">${fmt(Math.round(hi))}</text><text x="4" y="${y(lo) + 4}">${fmt(Math.round(lo))}</text></svg>`;
}

async function renderDetail() {
  if (!openItem) return;
  const d = await api(`/api/item?name=${encodeURIComponent(openItem)}`);
  const s = d.summary;
  const close = s.ntd != null && s.median ? (s.ntd * 1e8) / s.median : null;
  const groups = s.groups ? `<p>${s.groups.map(g => `${esc(g.key || "沒讀到屬性")}：${fmt(g.median)}（${g.count} 筆）`).join("　")}</p>` : "";
  $("#detail").hidden = false;
  $("#detail").innerHTML = `<h2>${esc(openItem)}</h2>${groups}
    <div class="bar"><button data-unit="meso">楓幣</button><button data-unit="ntd" ${close ? "" : "disabled"}>台幣</button></div>
    ${d.series.map(g => `${g.key ? `<p class="small">${esc(g.key)}</p>` : ""}${trendSvg(g.points, d.minTrendDays, close)}`).join("")}
    <table><thead><tr><th>交易日期</th><th class="num">價格</th><th class="num">單價</th><th class="num">數量</th><th>屬性</th><th>截圖</th></tr></thead><tbody>
    ${d.trades.map(t => `<tr><td>${md(t.tradedAt)}</td><td class="num">${fmt(t.price)}</td><td class="num">${fmt(t.unitPrice)}</td><td class="num">${fmt(t.qty)}</td>
      <td>${esc(t.attrs ? Object.entries(t.attrs).map(([k, v]) => `${k}+${v}`).join("、") : "")}</td>
      <td class="small ${t.status === "review" ? "warn" : "muted"}">${esc(t.shot)}${t.status === "review" ? "（待確認）" : ""}</td></tr>`).join("")}
    </tbody></table>`;
  $("#detail").querySelectorAll("[data-unit]").forEach(b => { b.onclick = () => { unit = b.dataset.unit; renderDetail(); }; });
}

async function renderReview() {
  const { trades } = await api("/api/review");
  $("#review-sec").hidden = !trades.length;
  const box = $("#review");
  const ids = trades.map(t => t.id).join();
  if (box.dataset.ids === ids) return; // 沒變就不重畫（不然正在打的字會被洗掉）
  box.dataset.ids = ids;
  box.innerHTML = trades.map(t => `<div class="review-card" data-id="${t.id}">
    <strong>${esc(t.item)}</strong> <span class="warn small">${esc(t.flags.join("、"))}</span>
    <canvas data-shot="${esc(t.shot)}" data-box="${esc(JSON.stringify(t.box))}"></canvas>
    <label>價格 <input data-k="price" inputmode="numeric" value="${t.price ?? ""}"></label>
    <label>單價 <input data-k="unitPrice" inputmode="numeric" value="${t.unitPrice ?? ""}"></label>
    <label>數量 <input data-k="qty" inputmode="numeric" value="${t.qty ?? ""}"></label>
    <label>交易日期 <input data-k="tradedAt" value="${t.tradedAt ?? ""}"></label>
    <div class="bar"><button data-act="confirm">數字是對的</button><button data-act="edit">照我改的存</button><button data-act="delete">刪掉這筆</button></div></div>`).join("");
  box.querySelectorAll("canvas").forEach(drawCrop);
  box.querySelectorAll(".review-card").forEach(card => {
    card.querySelectorAll("[data-act]").forEach(b => {
      b.onclick = async () => {
        const patch = {};
        card.querySelectorAll("[data-k]").forEach(i => { if (i.value !== "") patch[i.dataset.k] = i.dataset.k === "tradedAt" ? i.value : Number(i.value.replace(/,/g, "")); });
        const r = await api("/api/trade", { id: card.dataset.id, action: b.dataset.act, patch });
        if (!r.ok) return toast("沒存到：價格、單價、數量要正整數，日期要 2026-10-12 這種寫法");
        box.dataset.ids = "";
        refresh();
      };
    });
  });
}

function drawCrop(canvas) {
  const b = JSON.parse(canvas.dataset.box || "null");
  const img = new Image();
  img.onload = () => {
    const pad = 40;
    const sx = b ? Math.max(0, b.x - pad) : 0, sy = b ? Math.max(0, b.y - pad) : 0;
    const sw = b ? Math.min(img.width - sx, b.w + pad * 2) : img.width, sh = b ? Math.min(img.height - sy, b.h + pad * 2) : img.height;
    canvas.width = sw; canvas.height = sh;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    if (b) { ctx.strokeStyle = "#e0a800"; ctx.lineWidth = 2; ctx.strokeRect(b.x - sx, b.y - sy, b.w, b.h); }
  };
  img.src = `/shot?file=${encodeURIComponent(canvas.dataset.shot)}`;
}

async function refresh() {
  const st = await api("/api/state");
  renderList(st);
  await Promise.all([renderTable(st.fx.available), renderReview()]);
}

refresh();
setInterval(refresh, 1000);
```

- [ ] **Step 6: 掃 emoji／禁用符號**

Run: `node -e "for(const f of ['tools/price/page/app.js','tools/price/page/index.html','tools/price/page/style.css','tools/price/server.mjs','tools/price/routes.mjs']){const s=require('fs').readFileSync(f,'utf8');const bad=[...s].filter(c=>{const u=c.codePointAt(0);return (u>=0x2300&&u<=0x23FF)||(u>=0x25A0&&u<=0x25FF)||u>=0x1F000||(u>=0x2600&&u<=0x27BF)});console.log(f,bad.length?'BAD '+bad.join(''):'ok')}"`
Expected: 每個檔都 `ok`

- [ ] **Step 7: README 加一節**（放在既有「客戶端技能數值」那一節後面；找不到就放檔尾）

```markdown
## 拍賣查價工具（本機，v0.97）

自己用的半輔助工具：遊戲裡每一下都是你按，工具只複製品名、讀你的截圖、記價格。設計見 `docs/superpowers/specs/2026-10-13-auction-price-tool-design.md`。

1. 在主 checkout 跑 `npm run price`（第一次會在 `.price-data/` 建 `price-data` 資料分支的工作目錄），瀏覽器自己開 `http://localhost:9380`。
2. 按「複製下一件」→ 遊戲裡拍賣快速搜尋貼上 → 搜尋 → 切「市價」→ Win+PrtSc。
3. 黃色的那幾筆對照截圖確認或改；結束前按「收工」（commit＋push 到 `price-data`，那條分支自帶 `vercel.json` 不觸發部署）。

- 只做雪吉拉；清單 9 件寫在 `tools/price/list.mjs`（改清單要使用者拍板）。
- 讀圖用 Windows 內建繁中文字辨識（`tools/price/ocr.ps1`，這個檔只能有 ASCII），不用 AI、不用網路；遊戲全螢幕獨佔模式會截到黑畫面，改視窗或無邊框。
- 環境變數：`PRICE_PORT`（預設 9380）、`PRICE_SHOTS_DIR`（預設 `%USERPROFILE%\Pictures\Screenshots`）、`PRICE_OCR_SCALE`（放大幾倍讀，預設 1）、`PRICE_NO_OPEN`（不自動開瀏覽器）。
- 讀完的截圖搬到截圖資料夾底下的 `已記價\`，不進 repo。
- 台幣換算讀 maple-fx 的 `fx-data/fx/scania/daily.json`；還沒有就寫「匯率資料累積中」。
- 過了半夜要關掉重開（「今天」是開工那一刻定的）。
```

- [ ] **Step 8: Run tests**

Run: `node --test tools/price/routes.test.mjs` → Expected: 5 pass
Run: `npm test` → Expected: 全部 pass

- [ ] **Step 9: 手動開一次（不用遊戲）**

```bash
PRICE_SHOTS_DIR="$(mktemp -d)" PRICE_NO_OPEN=1 PRICE_PORT=9381 node tools/price/server.mjs
```
Expected: 印出網址、截圖資料夾、資料路徑，沒有錯誤；`curl -s http://127.0.0.1:9381/api/state` 回 JSON（items 5 或 9 件）。Ctrl+C 結束。

⚠️ 這一步會在主 checkout 底下建 `.price-data` 並在遠端開 `price-data` 分支（第一個 commit 只有 vercel.json）——之後 Task 11 要核對這次推上去 Vercel 沒有部署。

- [ ] **Step 10: Commit**

```bash
git add tools/price/server.mjs tools/price/routes.mjs tools/price/routes.test.mjs tools/price/page README.md
git commit -m "v0.97: 拍賣查價——本機查價頁（複製下一件、截圖狀態、要你看一眼、價格表、走勢、收工推上去）跟 README 用法" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 用使用者的真截圖校正（**等使用者兩張截圖**）

**前提：** 使用者截了「市價」分頁兩張：手套攻擊卷軸10%、黃色雨傘，放在 `Pictures\Screenshots`。沒有就先做 Task 11 的 1～3 步，這個 task 等圖到了再做——**不准用合成圖假裝校正過。**

**Files:**
- Create: `tools/price/__fixtures__/market-glove10.png`、`tools/price/__fixtures__/market-umbrella.png`（只裁拍賣視窗那一塊；角色名、別人的名字塗掉再進 repo）
- Create: `tools/price/real.test.mjs`
- Modify（照實際狀況）：`tools/price/parse.mjs`、`server.mjs` 的 `PRICE_OCR_SCALE` 預設

- [ ] **Step 1: 裁圖、看隱私** — 用 Read 工具打開兩張原圖看：拍賣視窗在哪、有沒有角色名／公會名／別人的名字。只裁拍賣視窗，名字塗黑（System.Drawing FillRectangle），存成上面兩個 fixture。裁完再用 Read 看一次確認沒有名字。

- [ ] **Step 2: 原樣讀一次、放大兩倍讀一次，印出來**

```bash
node -e "import('./tools/price/ocr.mjs').then(async m=>{for(const s of [1,2]){const o=await m.ocrImage('tools/price/__fixtures__/market-glove10.png',{scale:s});console.log('scale',s);for(const l of o.lines)console.log(l.text)}})"
node -e "import('./tools/price/ocr.mjs').then(async m=>{const p=await import('./tools/price/parse.mjs');for(const s of [1,2]){const o=await m.ocrImage('tools/price/__fixtures__/market-glove10.png',{scale:s});console.log('scale',s,JSON.stringify(p.parseShot(o,{item:'手套攻擊卷軸10%',today:'2026-10-13'}),null,1))}})"
```
黃色雨傘那張同樣跑（item 換 `黃色雨傘`）。

- [ ] **Step 3: 對答案** — 自己用 Read 看截圖，把每一筆（價格、單價、數量、交易日期、屬性）抄成表，跟 parseShot 的結果逐筆比。整理成「截圖上寫的／工具讀到的」兩欄貼給使用者確認（數字以使用者確認的為準）。

- [ ] **Step 4: 照 spec 的條件決定要不要加 AI** — 數字（價格、單價、數量、日期）**有任何一筆**讀錯（scale 1 跟 2 都錯）→ 停下來回報使用者：「Windows 讀錯 N 筆（列出來），照設計要加 AI 當第二讀法，一張約 X 元（算給你看）」，等拍板，這個 plan 不往下做 AI。只有中文錯、數字全對 → 繼續。

- [ ] **Step 5: 修 parse 讓真圖讀對** — 常見要修的：
  - 非成交的列（標題、持有楓幣、搜尋框）被當成交 → 在 `parseShot` 加條件（例如只收「品名比對有過」的那幾列，或只收位在市價表格範圍內的列），條件照真圖寫死在註解裡（寫「10/13 真圖：市價表格在視窗第幾欄到第幾欄」）。
  - 一列被拆成兩列 → 調 `rowsOf` 的高度容許值。
  - 屬性不在同一列（例如要點開才看得到）→ 回報使用者：黃色雨傘的屬性在市價頁看不到，要多截一張或照價格不分組，給編號選項。
  - 放大兩倍才讀對 → `server.mjs` 的 `OCR_SCALE` 預設改 2。
  每改一處先在 `real.test.mjs` 加一條會失敗的測試，再改到過。

- [ ] **Step 6: 寫真圖測試** — `tools/price/real.test.mjs`（期望值填 Step 3 使用者確認過的數字）：

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ocrImage } from "./ocr.mjs";
import { parseShot } from "./parse.mjs";

const WIN = { skip: process.platform !== "win32" && "文字辨識只在 Windows 跑" };
const FIX = path.join(import.meta.dirname, "__fixtures__");
const SCALE = Number(process.env.PRICE_OCR_SCALE ?? 1); // Step 5 若改成 2，這裡跟 server.mjs 一起改

test("真截圖：手套攻擊卷軸10% 每一筆都讀對（使用者 10/13 確認的數字）", WIN, async () => {
  const r = parseShot(await ocrImage(path.join(FIX, "market-glove10.png"), { scale: SCALE }), { item: "手套攻擊卷軸10%", today: "2026-10-13" });
  assert.equal(r.kind, "ok");
  assert.deepEqual(r.trades.map(t => [t.tradedAt, t.price, t.unitPrice, t.qty]), [
    // 照 Step 3 使用者確認的表逐筆填，例如 ["2026-10-12", 1320000, 1320000, 1],
  ]);
});

test("真截圖：黃色雨傘每一筆、屬性都讀對", WIN, async () => {
  const r = parseShot(await ocrImage(path.join(FIX, "market-umbrella.png"), { scale: SCALE }), { item: "黃色雨傘", today: "2026-10-13" });
  assert.equal(r.kind, "ok");
  assert.deepEqual(r.trades.map(t => [t.tradedAt, t.price, t.attrs]), [
    // 照 Step 3 使用者確認的表逐筆填
  ]);
});

test("真截圖：拿手套那張說是黃色雨傘 → 對不上", WIN, async () => {
  const r = parseShot(await ocrImage(path.join(FIX, "market-glove10.png"), { scale: SCALE }), { item: "黃色雨傘", today: "2026-10-13" });
  assert.equal(r.kind, "wrong-item");
});
```
（陣列一定要填滿真數字才能 commit；空陣列會讓測試失敗，這是故意的。）

- [ ] **Step 7: Run tests** — `node --test tools/price/real.test.mjs` 全過、`npm test` 全過。

- [ ] **Step 8: Commit**

```bash
git add tools/price/__fixtures__ tools/price/real.test.mjs tools/price/parse.mjs tools/price/server.mjs tools/price/parse.test.mjs
git commit -m "v0.97: 拍賣查價——照使用者兩張真截圖校正讀法（數字逐筆對過）" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 端到端實測、PR 進 dev

**Files:**
- Modify: 無（只驗收、開 PR）；`.claude/launch.json` 若要用預覽工具，加一筆 `price`（`npm run price`、port 9380、env `PRICE_NO_OPEN=1`）

- [ ] **Step 1: 全套測試、建置**

Run: `npm test` → 全過
Run: `npx next build` → 成功（`tools/` 不進網站）

- [ ] **Step 2: 端到端（真截圖到了以後）** — 開一個暫存截圖資料夾跑工具，照使用者的流程走一輪：

```bash
SHOTS=$(mktemp -d); PRICE_SHOTS_DIR="$SHOTS" PRICE_NO_OPEN=1 npm run price
```
用內建瀏覽器開 `http://localhost:9380` → 按「複製下一件」（手套攻擊卷軸10%）→ 把 `market-glove10.png` 複製進 `$SHOTS`（模擬 Win+PrtSc）→ 幾秒後那列顯示「讀到 N 筆新的」→ 再複製一次同一張 → 顯示「N 筆重複略過」→ 用 `setCurrent` 換到黃色雨傘（點那列的「複製」）→ 放 `market-umbrella.png` → 價格表兩件都有數字、黃色雨傘照屬性分開 → 點開明細 → 截圖給使用者。再放一張故意不對的（手套那張但目前是雷之鏢）→ 那列變黃「對不上，請重截」。

- [ ] **Step 3: 收工推資料、核對 Vercel 沒部署**

在頁面按「收工」→ 顯示「已推上去 price-data（sha）」→

```bash
git ls-remote origin refs/heads/price-data
gh api repos/clarkher/maplestory-tool/commits/$(git ls-remote origin refs/heads/price-data | cut -f1)/statuses --jq 'length'
gh api repos/clarkher/maplestory-tool/commits/$(git ls-remote origin refs/heads/price-data | cut -f1)/check-runs --jq '.total_count'
```
Expected: sha 一致；等 3 分鐘後 statuses 跟 check-runs 都是 0（Vercel 沒碰這條分支）。測試資料推上去之後，回本機頁面把測試那幾筆刪掉再收工一次（或在 PR 說明寫清楚第一批是測試資料）。

- [ ] **Step 4: 自己玩一輪、提優化意見** — 用台灣玩家第一次用的角度給 1～5 分（分數要有分佈），列 ≥10 點優化建議排序，寫進 PR 說明，不要自己加功能。

- [ ] **Step 5: PR → dev**

```bash
git fetch origin && git log origin/dev --oneline -5   # 確認 v0.97 沒被別人用走
git push -u origin HEAD
gh pr create --base dev --title "v0.97: 拍賣查價工具（本機、雪吉拉、自用版）" --body "<摘要、截圖、實測結果、評分與優化建議>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr view --json headRefOid --jq .headRefOid; git log -1 --pretty=%H   # 兩個要一樣
gh pr checks --watch   # 單元測試、建置、第一格三個名字都出現且綠
gh pr merge --merge --delete-branch
git fetch origin && git log origin/dev --oneline -5   # 自己的 commit 有進 dev
```

- [ ] **Step 6: 回報使用者** — 這是本機工具，沒有線上網址：寫清楚「主 checkout 跑 `npm run price` → `http://localhost:9380`」；附頁面截圖、讀出來的每一筆對照表、price-data 分支連結 `https://github.com/clarkher/maplestory-tool/tree/price-data`、PR 連結。

---

## Self-Review

**Spec coverage：**
- 使用流程 1～6（第 1 段）：Task 8（配對、重截、多張同一件）、Task 9（複製下一件、清單、週一加 4 件）、Task 1（清單）。
- 讀圖、5 條檢查、黑畫面、不是市價頁、AI 恢復條件（第 2 段）：Task 3、Task 7、Task 10 Step 4。
- 存資料欄位、去重、截圖搬家、收工推 price-data、擋部署、台幣換算與缺日（第 2 段）：Task 5、Task 8、Task 6、Task 4、Task 9。
- 價格表、明細、走勢、楓幣台幣切換、黃色雨傘分組、資料少照實寫（第 3 段）：Task 4、Task 9。
- 驗收（單元測試清單、真圖實測、npm test、next build）：各 task＋Task 10、Task 11。
- 不做清單：沒有任何 task 碰網站、菇菇寶貝、自動操作、通知。

**Placeholder scan：** Task 10 Step 6 的期望值陣列要等使用者確認的真數字——這是依賴不是佔位，並且空陣列會讓測試失敗擋住 commit。

**Type consistency：** `parseShot` 回 `{ kind, reason, trades }`（Task 3）＝ session 用的（Task 8）；`summarize(records, item, fxDays)` 第三個參數在 session 傳 `null`、routes 傳 `getFx()?.days ?? null`；`addTrades(data, trades, { item, shot, recordedAt })` 三處一致；`DONE_DIR` 由 session 匯出、routes 匯入。
