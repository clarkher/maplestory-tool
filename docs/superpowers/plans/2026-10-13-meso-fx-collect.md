# 楓幣匯率（v0.96）第一段：資料收集 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每 4 小時抓一次 8591 雪吉拉楓幣掛單、算出市價／掛單數／成交／價位分布，連同參考站的數字一起寫進孤兒分支 `fx-data`（不觸發 Vercel），並產出給頁面與拍賣查價工具讀的 `daily.json`。

**Architecture:** 純函式放 `pipeline/fx/lib/`（解析 8591 頁面、算匯率、市價、成交、參考站、每日 K 棒），`run.mjs` 把它們串起來（抓取函式用參數注入，測試不連網）；`collect.mjs` 是排程進入點。GitHub Actions `fx-collect.yml` 分三個 job：collect（唯讀，產 artifact）→ publish（唯一寫入，檢查 artifact 後推 `fx-data`）→ notify（開／關 issue）。

**Tech Stack:** Node 22（只用內建 `fetch`、`node:test`，不加套件）、GitHub Actions、Vercel `vercel.json`。

**Spec:** `docs/superpowers/specs/2026-10-13-meso-fx-design.md`

## Global Constraints

- 全程繁體中文（程式碼識別字英文）；註解寫「為什麼」，密度跟 `pipeline/lib/*.mjs` 一樣。
- 不加任何 npm 套件；`pipeline/fx/**` 只能 import Node 內建與彼此。
- 抓 8591：每 4 小時一次、頁與頁之間停 3 秒、最多 40 頁；User-Agent 固定 `MapleBook-fx/1.0 (+https://github.com/clarkher/maplestory-tool; meso rate, every 4h)`（不假裝瀏覽器）；收到 403／429 不重試。
- `fx-data` 與 artifact **不存掛單標題、賣家、圖片**，只存 id 與數字。
- 內部單位一律 `ask100`＝每 100 元台幣換幾萬楓幣；換算：1 億楓幣＝`1,000,000 ÷ ask100` 元、1 元＝`ask100 ÷ 100` 萬。
- 市價算法跟參考站相同：排除「代練／代肝」與匯率 < 10；中位數 ± 3.5×MAD 去離群（剩不到 3 筆整批還原）；匯率由高到低前四分之一（無條件進位）的中位數；樣本 < 4 不給值。8591 有效掛單 < 20 筆＝這次不算。
- workflow 的 `run:` 裡不准出現 `${{ }}`（一律用 `env:` 傳）。
- `samples.jsonl`、`ref-samples.jsonl` 只能變長，不准改舊行。
- commit 訊息 `v0.96 (n/11): …` 開頭、結尾空一行加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`；docs 跟程式分開 commit（第一段之後要只把程式 cherry-pick 進 main）。
- (1/11)～(11/11) 中間不准插 docs commit（Task 13 要用一段 range cherry-pick 進 main）；計畫或 spec 要改就等 (11/11) 之後。
- 跑測試用 PowerShell（Bash 工具的 PATH 沒有 node）：`node --test pipeline/fx/lib/<檔>.test.mjs`；全部：`node --test "pipeline/**/*.test.mjs"`。
- Edit／Write 工具會把「反斜線 u 加四碼」轉成真字元：程式裡不要寫這種跳脫。
- push 用 token helper（記憶 maplebook-repo-deploy）：`GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git -c credential.helper= -c "credential.helper=!f() { test \"\$1\" = get && echo username=clarkher && echo password=$(gh auth token --user clarkher); }; f" push …`；`gh` 一律帶 `GH_TOKEN=$(gh auth token --user clarkher)`，不准 `gh auth switch`。

---

### Task 1：`fx-data` 分支擋得住 Vercel 嗎（先驗再寫程式）

**Files:**
- Create: `pipeline/fx/branch-files/vercel.json`
- Create: `pipeline/fx/branch-files/README.md`
- Create: `vercel.json`（repo 根目錄）

**Interfaces:**
- Produces：`pipeline/fx/branch-files/` 兩個檔，publish 每次都會照抄進 `fx-data` 根目錄（Task 9）。

- [ ] **Step 1：寫兩個 branch-files**

`pipeline/fx/branch-files/vercel.json`：

```json
{ "git": { "deploymentEnabled": false } }
```

`pipeline/fx/branch-files/README.md`：

```markdown
# fx-data：楓幣匯率資料（自動產生，不要手改）

這條分支只放資料，由 `.github/workflows/fx-collect.yml` 每 4 小時寫一次（程式在 main／dev 的 `pipeline/fx/`）。
`vercel.json` 關掉這條分支的部署：資料更新不吃 Vercel 每天的部署額度。

| 檔案 | 內容 |
|---|---|
| `fx/scania/daily.json` | 雪吉拉每天一筆：開高低收（元／1 億楓幣）、`closeMesoPerNtd`（1 元換幾萬楓幣）、掛單數、成交額、來源 |
| `fx/scania/latest.json` | 最新一次：市價、掛單數、價位分布 |
| `fx/scania/samples.jsonl` | 每次抓 8591 的結果（一行一次） |
| `fx/scania/ref-samples.jsonl` | 參考站（maple-classic-wiki.pages.dev）的市價紀錄，8591 抓不到的空檔用它補 |
| `fx/scania/state.json` | 算成交用：上一次每筆掛單的累計賣出件數 |

數字是 8591 賣家開的價（掛單），不是成交價。欄位說明見 main 分支的 `docs/superpowers/specs/2026-10-13-meso-fx-design.md`。
```

根目錄 `vercel.json`（dev／main 的部署設定，連拍賣查價的 `price-data` 一起擋，10/13 跟那支 session 講好由這版寫）：

```json
{ "git": { "deploymentEnabled": { "fx-data": false, "price-data": false } } }
```

- [ ] **Step 2：手動推一個只有這兩個檔的孤兒 `fx-data` 分支**

（Git Bash，在 scratchpad 開一個臨時 repo，不動 worktree）

```bash
export PATH="/usr/bin:/mingw64/bin:$PATH"
W="$SCRATCH/fx-branch-probe"; rm -rf "$W"; mkdir -p "$W"; cd "$W"
git init -q && git checkout -q --orphan fx-data
cp "$WT/pipeline/fx/branch-files/vercel.json" "$WT/pipeline/fx/branch-files/README.md" .
git add -A && git -c user.name="$(git -C "$WT" config user.name)" -c user.email="$(git -C "$WT" config user.email)" commit -q -m "fx-data: 建立資料分支（只有說明與 vercel.json，測部署有沒有被擋）"
git remote add origin https://github.com/clarkher/maplestory-tool.git
# 用 Global Constraints 的 token helper 推
… push -u origin fx-data
git rev-parse HEAD
```

（`$SCRATCH`＝session scratchpad、`$WT`＝worktree 路徑）

- [ ] **Step 3：等 2 分鐘，確認 Vercel 沒建置**

```bash
SHA=<上一步的 sha>
GH_TOKEN=$(gh auth token --user clarkher) gh api "repos/clarkher/maplestory-tool/commits/$SHA/status" --jq '.statuses[] | .context + " " + .state + " " + .description'
GH_TOKEN=$(gh auth token --user clarkher) gh api "repos/clarkher/maplestory-tool/deployments?sha=$SHA" --jq 'length'
```

Expected：status 沒有 Vercel 那一行、deployments 是 `0`。
**如果 Vercel 建置了**：停下來，回報使用者，改走 spec 的備案（資料放另一個沒接 Vercel 的 repo），重寫本計畫 Task 9、11 的推送目的地；不要繼續往下做。

- [ ] **Step 4：把結果寫進共用筆記、通知拍賣查價 session**

在 `C:\Users\user1\AppData\Roaming\Claude\side-session-notes\local_fa74dcc6-500a-45a4-9a7a-ae1aba4cbb27\fx-8591-findings.md` 加一節「擋部署實測」（sha、時間、status／deployments 結果），然後 `SendMessage` 給 `local_fa74dcc6-500a-45a4-9a7a-ae1aba4cbb27` 一行結論。

- [ ] **Step 5：Commit**

```bash
git add vercel.json pipeline/fx/branch-files
git commit -m "v0.96 (1/11): fx-data 資料分支的說明與 vercel.json，dev／main 也擋 fx-data、price-data 兩條資料分支的部署"
```

---

### Task 2：解析 8591 清單頁＋每筆匯率

**Files:**
- Create: `pipeline/fx/lib/nuxt.mjs`
- Create: `pipeline/fx/lib/rate.mjs`
- Test: `pipeline/fx/lib/nuxt.test.mjs`、`pipeline/fx/lib/rate.test.mjs`

**Interfaces:**
- Produces：
  - `listingsFromHtml(html: string) → Listing[]`，`Listing = { id: string, title: string, priceNtd: number, stock: number|null, sold: number|null }`；頁面沒有 `__NUXT_DATA__` 就 throw（訊息含 `__NUXT_DATA__`）。
  - `parseRate(title: string) → number|null`（萬楓幣／100 元，兩位小數）。

- [ ] **Step 1：寫失敗的測試 `pipeline/fx/lib/nuxt.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { listingsFromHtml } from "./nuxt.mjs";

/** 照 8591 真的頁面組 devalue 陣列：外層包兩層 ShallowReactive，每筆掛單是一個物件、值放在後面的格子裡 */
function page(items) {
  const data = [["ShallowReactive", 1], { data: 2 }, ["ShallowReactive", 3], { list: 4 }, []];
  for (const item of items) {
    const at = data.length;
    const obj = {};
    data.push(obj);
    for (const [key, value] of Object.entries(item)) {
      obj[key] = data.length;
      data.push(value);
    }
    data[4].push(at);
  }
  return `<html><head></head><body><script type="application/json" data-nuxt-data="nuxt-app" data-ssr="true" id="__NUXT_DATA__">${JSON.stringify(data)}</script></body></html>`;
}

test("還原每筆掛單的 id、標題、台幣價（去逗號）、庫存、累計賣出", () => {
  const html = page([
    { id: "2419239866", ware_title: "【100元=300萬楓幣】3000萬楓幣=1000元", ware_price: "1,000", ware_number: 937, sell_count: 2310, page_view: "9697" },
    { id: "2419241104", ware_title: "【100元=300萬楓幣】300萬楓幣=100元", ware_price: "100", ware_number: 1000, sell_count: 2927 },
  ]);
  assert.deepEqual(listingsFromHtml(html), [
    { id: "2419239866", title: "【100元=300萬楓幣】3000萬楓幣=1000元", priceNtd: 1000, stock: 937, sold: 2310 },
    { id: "2419241104", title: "【100元=300萬楓幣】300萬楓幣=100元", priceNtd: 100, stock: 1000, sold: 2927 },
  ]);
});

test("沒有累計賣出、庫存的掛單照收，欄位是 null（不當成 0，免得之後算成交時誤算）", () => {
  const [listing] = listingsFromHtml(page([{ id: "1", ware_title: "【100元=300萬楓幣】", ware_price: "100" }]));
  assert.equal(listing.sold, null);
  assert.equal(listing.stock, null);
});

test("價格讀不出數字的不收", () => {
  assert.deepEqual(listingsFromHtml(page([{ id: "1", ware_title: "【100元=300萬楓幣】", ware_price: "面議", sell_count: 1 }])), []);
});

test("頁面沒有 __NUXT_DATA__（被擋、驗證頁、改版）就丟錯，不要當成 0 筆", () => {
  assert.throws(() => listingsFromHtml("<html><body>請完成驗證</body></html>"), /__NUXT_DATA__/);
});
```

- [ ] **Step 2：寫失敗的測試 `pipeline/fx/lib/rate.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseRate } from "./rate.mjs";

test("賣家寫的報價比括號精確，差不到 1 就用賣家的", () => {
  assert.equal(parseRate("【100元=300萬楓幣】3000萬楓幣=1000元⚡️極速"), 300);
  assert.equal(parseRate("【100元=350萬楓幣】35萬楓幣=10元🍁"), 350);
  assert.equal(parseRate("【100元=357萬楓幣】1000萬楓幣=280元雪吉拉"), 357.14);
  assert.equal(parseRate("【100元=61萬楓幣】65萬楓幣=106元本尊交易"), 61.32);
  assert.equal(parseRate("【100元=3萬楓幣】2.5萬楓幣=100元純手工"), 2.5);
  assert.equal(parseRate("【100元=2萬楓幣】1萬楓幣=55元"), 1.82);
});

test("億也算、台幣有逗號也算", () => {
  assert.equal(parseRate("【100元=300萬楓幣】1億楓幣=3,333元"), 300.03);
});

test("賣家報價跟括號差 1 以上（讀錯或寫錯）就用括號", () => {
  assert.equal(parseRate("【100元=270萬楓幣】300萬楓幣=100元 下單前詢問"), 270);
});

test("沒寫報價就用括號；沒有括號就不是幣價掛單", () => {
  assert.equal(parseRate("【100元=250萬楓幣】楓之谷雪吉拉現貨"), 250);
  assert.equal(parseRate("雪吉拉代練 長期單 1小時90"), null);
});
```

- [ ] **Step 3：跑測試確認失敗**

Run（PowerShell）：`node --test pipeline/fx/lib/nuxt.test.mjs pipeline/fx/lib/rate.test.mjs`
Expected：FAIL，`Cannot find module` …`nuxt.mjs`／`rate.mjs`

- [ ] **Step 4：寫 `pipeline/fx/lib/nuxt.mjs`**

```js
/**
 * 8591 商品清單頁是 Nuxt 伺服器端渲染：資料在 <script id="__NUXT_DATA__"> 裡，格式是 devalue 陣列——
 * 物件的每個值都是「指到陣列第幾格」的索引。這裡只還原算匯率要用的欄位（id、標題、台幣價、庫存、累計賣出），
 * 標題只在記憶體裡用來讀匯率，不會寫進任何檔案。
 */
const SCRIPT = /<script[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

/** @typedef {{ id: string, title: string, priceNtd: number, stock: number|null, sold: number|null }} Listing */

/** @returns {Listing[]} */
export function listingsFromHtml(html) {
  const match = html.match(SCRIPT);
  if (!match) throw new Error("頁面裡沒有 __NUXT_DATA__（可能被擋、跳驗證頁或改版）");
  const data = JSON.parse(match[1]);
  if (!Array.isArray(data)) throw new Error("__NUXT_DATA__ 不是陣列（可能改版）");
  const at = index => (Number.isInteger(index) && index >= 0 && index < data.length ? data[index] : undefined);

  const listings = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || !("ware_title" in entry)) continue;
    const id = at(entry.id);
    const title = at(entry.ware_title);
    const priceNtd = toNumber(at(entry.ware_price));
    if ((typeof id !== "string" && typeof id !== "number") || typeof title !== "string" || priceNtd === null) continue;
    listings.push({ id: String(id), title, priceNtd, stock: toNumber(at(entry.ware_number)), sold: toNumber(at(entry.sell_count)) });
  }
  return listings;
}

/** 數字或「1,000」這種字串 → 數字；讀不出來是 null */
function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : null;
}
```

- [ ] **Step 5：寫 `pipeline/fx/lib/rate.mjs`**

```js
/**
 * 一筆楓幣掛單的匯率，單位「每 100 元台幣換幾萬楓幣」（跟 8591 標題、參考站同單位）。
 * 8591 幫標題加的【100元=X萬楓幣】是四捨五入到整數的粗值；賣家在後面寫的「A萬楓幣=B元」才精確。
 * 精確值跟 X 差不到 1 才用（防止讀到標題裡別的數字），不然用 X。沒有括號＝不是幣價掛單，回 null。
 */
const BRACKET = /【\s*100\s*元\s*[=＝]\s*([\d.,]+)\s*萬\s*楓幣\s*】/;
const QUOTE = /([\d.,]+)\s*(億|萬)\s*楓?幣?\s*[=＝]\s*([\d.,]+)\s*元/;

export function parseRate(title) {
  const bracket = title.match(BRACKET);
  if (!bracket) return null;
  const rough = toNumber(bracket[1]);
  if (!(rough > 0)) return null;
  const quote = title.slice(bracket.index + bracket[0].length).match(QUOTE);
  if (quote) {
    const meso = toNumber(quote[1]) * (quote[2] === "億" ? 10000 : 1);
    const ntd = toNumber(quote[3]);
    if (meso > 0 && ntd > 0) {
      const precise = (meso / ntd) * 100;
      if (Math.abs(precise - rough) < 1) return Math.round(precise * 100) / 100;
    }
  }
  return rough;
}

const toNumber = text => Number(String(text).replace(/,/g, ""));
```

- [ ] **Step 6：跑測試確認通過**

Run：`node --test pipeline/fx/lib/nuxt.test.mjs pipeline/fx/lib/rate.test.mjs`
Expected：PASS（8 個 test）

- [ ] **Step 7：Commit**

```bash
git add pipeline/fx/lib/nuxt.mjs pipeline/fx/lib/nuxt.test.mjs pipeline/fx/lib/rate.mjs pipeline/fx/lib/rate.test.mjs
git commit -m "v0.96 (2/11): 楓幣匯率——讀 8591 清單頁的 Nuxt 資料、每筆掛單的匯率（賣家報價優先、括號粗值備用）"
```

---

### Task 3：市價、去離群、價位分布

**Files:**
- Create: `pipeline/fx/lib/market.mjs`
- Test: `pipeline/fx/lib/market.test.mjs`

**Interfaces:**
- Consumes：`parseRate`（Task 2）、`Listing`
- Produces：
  - `median(values: number[]) → number`
  - `trimOutliers(rated: RatedListing[]) → RatedListing[]`，`RatedListing = Listing & { rate: number }`
  - `marketAsk(rates: number[]) → number|null`
  - `ladder(rates: number[], width = 10) → [number, number][]`（[桶下界, 筆數]，由低到高）
  - `summarize(listings: Listing[]) → { ask100: number|null, kept: RatedListing[], ladder: [number, number][], band: [number, number]|null }`

- [ ] **Step 1：寫失敗的測試 `pipeline/fx/lib/market.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { ladder, marketAsk, median, summarize, trimOutliers } from "./market.mjs";

const listing = (id, title, priceNtd = 100) => ({ id: String(id), title, priceNtd, stock: 999, sold: 0 });
const rated = rates => rates.map((rate, i) => ({ ...listing(i, ""), rate }));

test("中位數：奇數取中間、偶數取中間兩個平均", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test("跟參考站同一套：10/13 14:40 雪吉拉 82 筆的分布算出來是 300（參考站寫 300）、一筆都不剔", () => {
  // 參考站 price.json 的 servers.雪吉拉.dist：[匯率, 筆數]
  const dist = [[10,3],[20,1],[22,1],[23,1],[24,1],[26.5,2],[35,2],[40,1],[50,1],[60,1],[61.5,1],[65,1],[67,1],[70,1],[74,1],[77,1],[78,1],[94,1],[95,1],[100,5],[102.5,1],[104,1],[110,1],[115,2],[120,3],[140,1],[150.5,1],[160,1],[170,1],[177,2],[190,1],[200,2],[235,1],[244,1],[250,6],[260,2],[270,5],[280,1],[290,3],[300,10],[300.5,1],[320,2],[350,3],[351,1],[357,1]];
  const rates = dist.flatMap(([rate, count]) => Array(count).fill(rate));
  assert.equal(rates.length, 82);
  assert.equal(trimOutliers(rated(rates)).length, 82);
  assert.equal(marketAsk(rates), 300);
});

test("離譜的報價（100元=280萬萬）被 MAD 剔掉", () => {
  const kept = trimOutliers(rated([250, 260, 270, 280, 300, 300, 320, 2800000]));
  assert.deepEqual(kept.map(r => r.rate), [250, 260, 270, 280, 300, 300, 320]);
});

test("剔完剩不到 3 筆就整批還原", () => {
  assert.equal(trimOutliers(rated([1, 1000, 100000])).length, 3);
});

test("市價＝匯率由高到低前四分之一（無條件進位）的中位數；不到 4 筆不給值", () => {
  assert.equal(marketAsk([357, 350, 300, 300, 270, 270, 270, 250, 250, 250, 200, 100]), 350);
  assert.equal(marketAsk([300, 300, 300]), null);
});

test("價位分布：每 10 萬一桶，由低到高", () => {
  assert.deepEqual(ladder([250, 255, 300, 300.5, 357.14, 10]), [[10, 1], [250, 2], [300, 2], [350, 1]]);
});

test("summarize：排除代練、代肝、讀不到匯率、低於 10 的；算市價、市價區上下界", () => {
  const listings = [
    listing(1, "【100元=300萬楓幣】300萬楓幣=100元"),
    listing(2, "【100元=300萬楓幣】300萬楓幣=100元"),
    listing(3, "【100元=350萬楓幣】35萬楓幣=10元", 10),
    listing(4, "【100元=270萬楓幣】270萬楓幣=100元"),
    listing(5, "【100元=250萬楓幣】250萬楓幣=100元"),
    listing(6, "【100元=1萬楓幣】1萬楓幣=100元"),
    listing(7, "【100元=300萬楓幣】雪吉拉代練 1小時90"),
    listing(8, "【100元=300萬楓幣】代肝"),
    listing(9, "雪吉拉楓幣 私訊"),
  ];
  const result = summarize(listings);
  assert.deepEqual(result.kept.map(l => l.id), ["1", "2", "3", "4", "5"]);
  assert.equal(result.ask100, 325); // 5 筆取前 2 筆（350、300）的中位數
  assert.deepEqual(result.band, [300, 350]);
  assert.deepEqual(result.ladder, [[250, 1], [270, 1], [300, 2], [350, 1]]);
});

test("summarize：一筆都沒有時不爆、市價 null", () => {
  assert.deepEqual(summarize([]), { ask100: null, kept: [], ladder: [], band: null });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node --test pipeline/fx/lib/market.test.mjs`
Expected：FAIL，`Cannot find module` …`market.mjs`

- [ ] **Step 3：寫 `pipeline/fx/lib/market.mjs`**

```js
/**
 * 一次抓取的市價（跟參考站 maple-classic-wiki.pages.dev/price 同一套算法，備援時兩邊的數字才接得起來）：
 *  1. 排除標題有「代練」「代肝」的（掛在楓幣分類的代練服務，價格是佔位數字）、匯率低於 10 的（「1 萬楓幣 = 100 元」這種引流單）
 *  2. 中位數 ± 3.5×MAD 以外的丟掉；剔完剩不到 3 筆就整批還原
 *  3. 市價＝匯率由高到低（楓幣由便宜到貴）前四分之一的中位數——就是打開清單真的會下單的那一區；不到 4 筆不給值
 * 單位都是「每 100 元台幣換幾萬楓幣」。
 */
import { parseRate } from "./rate.mjs";

const EXCLUDE = /代練|代肝/;
const MIN_RATE = 10;
const MAD_LIMIT = 3.5;
export const LADDER_WIDTH = 10;

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function trimOutliers(rated) {
  const rates = rated.map(item => item.rate);
  const center = median(rates);
  const mad = median(rates.map(rate => Math.abs(rate - center)));
  const kept = rated.filter(item => Math.abs(item.rate - center) <= MAD_LIMIT * mad);
  return kept.length < 3 ? rated : kept;
}

/** 由高到低前四分之一（無條件進位、至少 1 筆） */
function topQuarter(rates) {
  const sorted = [...rates].sort((a, b) => b - a);
  return sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 4)));
}

export function marketAsk(rates) {
  if (rates.length < 4) return null;
  return Math.round(median(topQuarter(rates)) * 100) / 100;
}

export function ladder(rates, width = LADDER_WIDTH) {
  const counts = new Map();
  for (const rate of rates) {
    const floor = Math.floor(rate / width) * width;
    counts.set(floor, (counts.get(floor) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => a[0] - b[0]);
}

export function summarize(listings) {
  const rated = [];
  for (const listing of listings) {
    if (EXCLUDE.test(listing.title)) continue;
    const rate = parseRate(listing.title);
    if (rate === null || rate < MIN_RATE) continue;
    rated.push({ ...listing, rate });
  }
  const kept = rated.length ? trimOutliers(rated) : [];
  const rates = kept.map(item => item.rate);
  const top = rates.length ? topQuarter(rates) : [];
  return {
    ask100: marketAsk(rates),
    kept,
    ladder: ladder(rates),
    band: top.length ? [Math.min(...top), Math.max(...top)] : null,
  };
}
```

- [ ] **Step 4：跑測試確認通過**

Run：`node --test pipeline/fx/lib/market.test.mjs`
Expected：PASS（8 個 test）

- [ ] **Step 5：Commit**

```bash
git add pipeline/fx/lib/market.mjs pipeline/fx/lib/market.test.mjs
git commit -m "v0.96 (3/11): 楓幣匯率——市價（跟參考站同一套：排除代練與引流單、MAD 去離群、最便宜四分之一的中位數）與價位分布"
```

---

### Task 4：成交（累計賣出件數相減）

**Files:**
- Create: `pipeline/fx/lib/volume.mjs`
- Test: `pipeline/fx/lib/volume.test.mjs`

**Interfaces:**
- Consumes：`RatedListing`（Task 3）
- Produces：
  - `stateMap(kept: RatedListing[]) → Record<string, [sold: number, priceNtd: number, rate: number]>`（`sold` 是 null 的不收）
  - `soldSince(prev: Record<string, [number, number, number]>|undefined, kept: RatedListing[]) → { volNtd: number, volMeso: number, units: number }`（`volMeso` 單位萬楓幣、兩位小數）
  - `MAX_UNITS_PER_RUN = 1000`

- [ ] **Step 1：寫失敗的測試 `pipeline/fx/lib/volume.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { soldSince, stateMap } from "./volume.mjs";

const item = (id, sold, priceNtd, rate) => ({ id, title: "", priceNtd, stock: 999, sold, rate });

test("stateMap 只記 id 與數字；沒有累計賣出的不記", () => {
  assert.deepEqual(stateMap([item("a", 10, 100, 300), item("b", null, 100, 300)]), { a: [10, 100, 300] });
});

test("同一筆累計賣出變多：賣出件數 × 台幣價＝成交額，再乘匯率換成楓幣（萬）", () => {
  const prev = { a: [10, 100, 300], b: [5, 1000, 270] };
  const result = soldSince(prev, [item("a", 13, 100, 300), item("b", 6, 1000, 270)]);
  assert.deepEqual(result, { volNtd: 1300, volMeso: 3600, units: 4 });
});

test("第一次看到的、沒變、變少（重新上架）、一次跳超過 1000 件的都不算", () => {
  const prev = { a: [10, 100, 300], b: [10, 100, 300], c: [10, 100, 300] };
  const result = soldSince(prev, [item("a", 10, 100, 300), item("b", 3, 100, 300), item("c", 2000, 100, 300), item("new", 50, 100, 300)]);
  assert.deepEqual(result, { volNtd: 0, volMeso: 0, units: 0 });
});

test("沒有上一次狀態（第一次跑）就全部是 0", () => {
  assert.deepEqual(soldSince(undefined, [item("a", 10, 100, 300)]), { volNtd: 0, volMeso: 0, units: 0 });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node --test pipeline/fx/lib/volume.test.mjs`
Expected：FAIL，`Cannot find module` …`volume.mjs`

- [ ] **Step 3：寫 `pipeline/fx/lib/volume.mjs`**

```js
/**
 * 成交：8591 每筆掛單有「累計賣出件數」，跟上一次抓的相減就是這段時間真的賣掉幾件。
 * 只算同一筆掛單（同 id）、件數變多、一次不超過 1000 件的；第一次看到的只記基準。
 * ⚠️ 很多賣家要求「談好後開專屬賣場」，那種交易可能不算在公開掛單裡——數字是「看得到的成交」，不是全部（spec「成交量還沒驗證」）。
 */
export const MAX_UNITS_PER_RUN = 1000;

export function stateMap(kept) {
  return Object.fromEntries(kept.filter(item => item.sold !== null).map(item => [item.id, [item.sold, item.priceNtd, item.rate]]));
}

export function soldSince(prev, kept) {
  let volNtd = 0;
  let volMeso = 0;
  let units = 0;
  for (const item of kept) {
    const before = prev?.[item.id];
    if (!before || item.sold === null) continue;
    const delta = item.sold - before[0];
    if (!(delta > 0) || delta > MAX_UNITS_PER_RUN) continue;
    volNtd += delta * item.priceNtd;
    volMeso += (delta * item.priceNtd * item.rate) / 100;
    units += delta;
  }
  return { volNtd, volMeso: Math.round(volMeso * 100) / 100, units };
}
```

- [ ] **Step 4：跑測試確認通過**

Run：`node --test pipeline/fx/lib/volume.test.mjs`
Expected：PASS（4 個 test）

- [ ] **Step 5：Commit**

```bash
git add pipeline/fx/lib/volume.mjs pipeline/fx/lib/volume.test.mjs
git commit -m "v0.96 (4/11): 楓幣匯率——成交：同一筆掛單累計賣出件數相減，算成交額（台幣）與成交楓幣"
```

---

### Task 5：參考站資料

**Files:**
- Create: `pipeline/fx/lib/ref.mjs`
- Test: `pipeline/fx/lib/ref.test.mjs`

**Interfaces:**
- Produces：
  - `REF_URL = "https://maple-classic-wiki.pages.dev/data/price.json"`、`SERVER = "雪吉拉"`
  - `refSnapshot(json, server = SERVER) → { t: string, ask100: number, listings: number|null, ladder: [number, number][] } | null`
  - `refHistory(json, server = SERVER) → { t: string, ask100: number }[]`（由舊到新，只收 `m === 3` 的市價）

- [ ] **Step 1：寫失敗的測試 `pipeline/fx/lib/ref.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { refHistory, refSnapshot } from "./ref.mjs";

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
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node --test pipeline/fx/lib/ref.test.mjs`
Expected：FAIL，`Cannot find module` …`ref.mjs`

- [ ] **Step 3：寫 `pipeline/fx/lib/ref.mjs`**

```js
/**
 * 參考站（maple-classic-wiki.pages.dev/price）的 price.json：8591 抓不到時的備援，也拿來補我們開始收集之前的幾天。
 * 它每 2 小時抓一次 8591、市價算法跟我們相同（market.mjs）；history 只留最近 60 筆。
 * m=3 起是「市價」口徑，之前是全部掛單中位數——口徑不同，不收。
 */
import { LADDER_WIDTH } from "./market.mjs";

export const REF_URL = "https://maple-classic-wiki.pages.dev/data/price.json";
export const SERVER = "雪吉拉";

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
```

- [ ] **Step 4：跑測試確認通過**

Run：`node --test pipeline/fx/lib/ref.test.mjs`
Expected：PASS（3 個 test）

- [ ] **Step 5：Commit**

```bash
git add pipeline/fx/lib/ref.mjs pipeline/fx/lib/ref.test.mjs
git commit -m "v0.96 (5/11): 楓幣匯率——讀參考站 price.json 的當下市價、價位分布與歷史（只收市價口徑）"
```

---

### Task 6：每日 K 棒

**Files:**
- Create: `pipeline/fx/lib/daily.mjs`
- Test: `pipeline/fx/lib/daily.test.mjs`

**Interfaces:**
- Produces：
  - `taipeiIso(date: Date) → string`（`2026-10-13T16:17:05+08:00`）、`taipeiDate(iso: string) → "YYYY-MM-DD"`
  - `perYi(ask100: number) → number`（1 億楓幣幾元，一位小數）
  - `mergeStreams(own: OwnSample[], ref: RefSample[], gapMs = 3h) → MergedSample[]`
    - `OwnSample = { t, src: "8591", ask100, listings, volNtd, volMeso }`、`RefSample = { t, ask100 }`、`MergedSample = OwnSample | (RefSample & { src: "ref" })`
  - `dailyBars(merged: MergedSample[]) → Day[]`，`Day = { date, open, high, low, close, closeMesoPerNtd, listings, volNtd, volMeso, vwap, samples, source }`（欄位意思見 spec「給拍賣查價 session 的介面」）

- [ ] **Step 1：寫失敗的測試 `pipeline/fx/lib/daily.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { dailyBars, mergeStreams, perYi, taipeiDate, taipeiIso } from "./daily.mjs";

const own = (t, ask100, extra = {}) => ({ t, src: "8591", ask100, listings: 100, volNtd: 0, volMeso: 0, ...extra });

test("台灣時間：ISO 字串帶 +08:00；跨午夜算隔天", () => {
  assert.equal(taipeiIso(new Date("2026-10-13T08:17:05.123Z")), "2026-10-13T16:17:05+08:00");
  assert.equal(taipeiDate("2026-10-13T16:30:00Z"), "2026-10-14");
  assert.equal(taipeiDate("2026-10-13T23:59:00+08:00"), "2026-10-13");
});

test("1 億楓幣幾元＝1,000,000 ÷ 每 100 元換幾萬", () => {
  assert.equal(perYi(300), 3333.3);
  assert.equal(perYi(357.14), 2800);
});

test("合併：自己抓的全收；參考站只補前後 3 小時內沒有自己資料的空檔", () => {
  const merged = mergeStreams(
    [own("2026-10-13T08:17:00+08:00", 300), own("2026-10-13T12:17:00+08:00", 310)],
    [
      { t: "2026-10-13T02:40:00+08:00", ask100: 290 },
      { t: "2026-10-13T10:40:00+08:00", ask100: 305 },
      { t: "2026-10-13T16:40:00+08:00", ask100: 320 },
    ],
  );
  assert.deepEqual(merged.map(s => [s.t.slice(11, 16), s.src]), [["02:40", "ref"], ["08:17", "8591"], ["12:17", "8591"], ["16:40", "ref"]]);
});

test("每日：單位換成元／億後才取開高低收（匯率越高楓幣越便宜，最高最低要倒過來）", () => {
  const [day] = dailyBars(mergeStreams([own("2026-10-13T08:00:00+08:00", 300), own("2026-10-13T12:00:00+08:00", 250), own("2026-10-13T20:00:00+08:00", 320)], []));
  assert.equal(day.date, "2026-10-13");
  assert.equal(day.open, 3333.3);
  assert.equal(day.high, 4000);
  assert.equal(day.low, 3125);
  assert.equal(day.close, 3125);
  assert.equal(day.closeMesoPerNtd, 3.2);
  assert.equal(day.samples, 3);
  assert.equal(day.source, "8591");
});

test("每日：掛單數取當天最後一次自己抓的；成交加總、成交均價＝成交額 ÷ 成交楓幣（億）", () => {
  const [day] = dailyBars(mergeStreams([
    own("2026-10-13T08:00:00+08:00", 300, { listings: 110, volNtd: 0, volMeso: 0 }),
    own("2026-10-13T12:00:00+08:00", 300, { listings: 105, volNtd: 1000, volMeso: 3000 }),
    own("2026-10-13T16:00:00+08:00", 300, { listings: 98, volNtd: 500, volMeso: 1500 }),
  ], []));
  assert.equal(day.listings, 98);
  assert.equal(day.volNtd, 1500);
  assert.equal(day.volMeso, 4500);
  assert.equal(day.vwap, 3333.3);
});

test("每日：整天都是參考站 → 沒有掛單數、成交（null，不是 0），來源 ref；混著是 mixed；沒成交時成交均價 null", () => {
  const days = dailyBars(mergeStreams(
    [own("2026-10-13T20:00:00+08:00", 300)],
    [{ t: "2026-10-12T20:40:00+08:00", ask100: 330 }, { t: "2026-10-13T08:40:00+08:00", ask100: 320 }],
  ));
  assert.deepEqual(days.map(d => [d.date, d.source, d.listings, d.volNtd, d.vwap]), [
    ["2026-10-12", "ref", null, null, null],
    ["2026-10-13", "mixed", 100, 0, null],
  ]);
});
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node --test pipeline/fx/lib/daily.test.mjs`
Expected：FAIL，`Cannot find module` …`daily.mjs`

- [ ] **Step 3：寫 `pipeline/fx/lib/daily.mjs`**

```js
/**
 * 每天一根 K 棒（台灣時間 00:00–24:00）。
 * 自己抓的 8591 樣本全收；參考站的只補「前後 3 小時內沒有自己資料」的空檔（8591 被擋、還沒開始收集之前）。
 * 價格先換成「1 億楓幣幾元」才取開高低收：存的 ask100 越大楓幣越便宜，直接取最高最低會倒過來。
 */
const HOUR = 3600 * 1000;
export const GAP_MS = 3 * HOUR;

export function taipeiIso(date) {
  return `${new Date(date.getTime() + 8 * HOUR).toISOString().slice(0, 19)}+08:00`;
}

export function taipeiDate(iso) {
  return new Date(Date.parse(iso) + 8 * HOUR).toISOString().slice(0, 10);
}

const round1 = value => Math.round(value * 10) / 10;
const round2 = value => Math.round(value * 100) / 100;
const sum = values => values.reduce((total, value) => total + value, 0);

export const perYi = ask100 => round1(1_000_000 / ask100);

export function mergeStreams(own, ref, gapMs = GAP_MS) {
  const ownTimes = own.map(sample => Date.parse(sample.t));
  const fill = ref
    .filter(sample => !ownTimes.some(time => Math.abs(time - Date.parse(sample.t)) < gapMs))
    .map(sample => ({ ...sample, src: "ref" }));
  return [...own, ...fill].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

export function dailyBars(merged) {
  const byDate = new Map();
  for (const sample of merged) {
    const date = taipeiDate(sample.t);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(sample);
  }
  return [...byDate]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, samples]) => {
      const values = samples.map(sample => perYi(sample.ask100));
      const own = samples.filter(sample => sample.src === "8591");
      const volNtd = own.length ? sum(own.map(sample => sample.volNtd ?? 0)) : null;
      const volMeso = own.length ? round2(sum(own.map(sample => sample.volMeso ?? 0))) : null;
      return {
        date,
        open: values[0],
        high: Math.max(...values),
        low: Math.min(...values),
        close: values.at(-1),
        closeMesoPerNtd: round2(samples.at(-1).ask100 / 100),
        listings: own.at(-1)?.listings ?? null,
        volNtd,
        volMeso,
        // 成交楓幣單位是萬，÷ 10000 換成億
        vwap: volMeso ? round1(volNtd / (volMeso / 10000)) : null,
        samples: samples.length,
        source: own.length === samples.length ? "8591" : own.length === 0 ? "ref" : "mixed",
      };
    });
}
```

- [ ] **Step 4：跑測試確認通過**

Run：`node --test pipeline/fx/lib/daily.test.mjs`
Expected：PASS（6 個 test）

- [ ] **Step 5：Commit**

```bash
git add pipeline/fx/lib/daily.mjs pipeline/fx/lib/daily.test.mjs
git commit -m "v0.96 (6/11): 楓幣匯率——每日 K 棒：自己抓的為主、參考站補空檔，換成元／億再取開高低收，掛單數與成交加總"
```

---

### Task 7：抓 8591 全部頁

**Files:**
- Create: `pipeline/fx/lib/fetch8591.mjs`
- Test: `pipeline/fx/lib/fetch8591.test.mjs`

**Interfaces:**
- Consumes：`listingsFromHtml`（Task 2）
- Produces：
  - `USER_AGENT`、`SERVERS = { 雪吉拉: "70854", 菇菇寶貝: "70855" }`、`pageUrl(serverId, firstRow) → string`
  - `fetchAllListings({ serverId?, fetchText?, pauseMs?, sleep? }) → Promise<Listing[]>`（依 id 去重）
  - `fetchText(url) → Promise<string>`（真的連網；403／429 不重試、其他錯重試 2 次）

- [ ] **Step 1：寫失敗的測試 `pipeline/fx/lib/fetch8591.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { USER_AGENT, fetchAllListings, pageUrl } from "./fetch8591.mjs";

/** 假的 8591：每頁 10 筆，給 id 清單組出跟真的一樣格式的頁面 */
function fakePage(ids) {
  const data = [[]];
  for (const id of ids) {
    const at = data.length;
    data.push({ id: at + 1, ware_title: at + 2, ware_price: at + 3, ware_number: at + 4, sell_count: at + 5 });
    data.push(String(id), "【100元=300萬楓幣】300萬楓幣=100元", "100", 999, 1);
    data[0].push(at);
  }
  return `<script type="application/json" id="__NUXT_DATA__">${JSON.stringify(data)}</script>`;
}

test("網址：雪吉拉、楓幣分頁、firstRow 每頁加 10", () => {
  assert.equal(pageUrl("70854", 20), "https://www.8591.com.tw/v3/mall/list/70657?searchGame=70657&searchServer=70854&searchType=0&firstRow=20");
});

test("User-Agent 老實寫是誰、附 repo 網址，而且全是 ASCII（header 不能放中文）", () => {
  assert.match(USER_AGENT, /^MapleBook-fx\/1\.0 \(\+https:\/\/github\.com\/clarkher\/maplestory-tool; /);
  assert.match(USER_AGENT, /^[\x20-\x7e]+$/);
});

test("一頁一頁抓到空頁為止、頁與頁之間停一下、依 id 去重", async () => {
  const pages = { 0: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10: [10, 11, 12], 20: [] };
  const asked = [];
  const pauses = [];
  const listings = await fetchAllListings({
    fetchText: async url => {
      const firstRow = Number(new URL(url).searchParams.get("firstRow"));
      asked.push(firstRow);
      return fakePage(pages[firstRow]);
    },
    pauseMs: 3000,
    sleep: async ms => pauses.push(ms),
  });
  assert.deepEqual(asked, [0, 10, 20]);
  assert.deepEqual(pauses, [3000, 3000]);
  assert.deepEqual(listings.map(l => l.id), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
});

test("翻到後面一直回同一頁（沒有新 id）就停，不會抓滿 40 頁", async () => {
  let calls = 0;
  await fetchAllListings({ fetchText: async () => { calls += 1; return fakePage([1, 2, 3]); }, sleep: async () => {} });
  assert.equal(calls, 2);
});

test("其中一頁被擋（沒有 __NUXT_DATA__）整次失敗，不拿半套資料算", async () => {
  await assert.rejects(
    fetchAllListings({ fetchText: async url => (url.endsWith("firstRow=0") ? fakePage([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) : "請完成驗證"), sleep: async () => {} }),
    /__NUXT_DATA__/,
  );
});
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node --test pipeline/fx/lib/fetch8591.test.mjs`
Expected：FAIL，`Cannot find module` …`fetch8591.mjs`

- [ ] **Step 3：寫 `pipeline/fx/lib/fetch8591.mjs`**

```js
/**
 * 抓 8591《新楓之谷：經典版》某個伺服器的楓幣掛單（全部頁）。
 * ⚠️ 8591 服務條款禁止未經授權的自動抓取，使用者 10/13 知情後拍板照做（spec「條款風險」）。所以：
 *   每 4 小時才跑一次、頁與頁之間停 3 秒、最多 40 頁；User-Agent 老實寫身分；被擋（403／429）就不重試，交給備援。
 */
import { listingsFromHtml } from "./nuxt.mjs";

export const USER_AGENT = "MapleBook-fx/1.0 (+https://github.com/clarkher/maplestory-tool; meso rate, every 4h)";
export const SERVERS = { 雪吉拉: "70854", 菇菇寶貝: "70855" };
const LIST_URL = "https://www.8591.com.tw/v3/mall/list/70657";
const PAGE_SIZE = 10;
const MAX_PAGES = 40;

export const pageUrl = (serverId, firstRow) => `${LIST_URL}?searchGame=70657&searchServer=${serverId}&searchType=0&firstRow=${firstRow}`;

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchAllListings({ serverId = SERVERS.雪吉拉, fetchText: get = fetchText, pauseMs = 3000, sleep = defaultSleep } = {}) {
  const byId = new Map();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (page > 0) await sleep(pauseMs);
    const listings = listingsFromHtml(await get(pageUrl(serverId, page * PAGE_SIZE)));
    const before = byId.size;
    for (const listing of listings) byId.set(listing.id, listing);
    // 空頁＝翻完了；整頁都是看過的 id＝翻過頭被送回最後一頁
    if (listings.length === 0 || byId.size === before) break;
  }
  return [...byId.values()];
}

export async function fetchText(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await defaultSleep(5000 * attempt);
    try {
      const response = await fetch(url, { headers: { "user-agent": USER_AGENT, "accept-language": "zh-TW" }, signal: AbortSignal.timeout(30000) });
      if (response.status === 403 || response.status === 429) throw Object.assign(new Error(`HTTP ${response.status}（被擋，不重試）`), { blocked: true });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (error.blocked) break;
    }
  }
  throw new Error(`8591 抓不到 ${url}：${lastError?.message ?? "不明原因"}`);
}
```

- [ ] **Step 4：跑測試確認通過**

Run：`node --test pipeline/fx/lib/fetch8591.test.mjs`
Expected：PASS（5 個 test）

- [ ] **Step 5：Commit**

```bash
git add pipeline/fx/lib/fetch8591.mjs pipeline/fx/lib/fetch8591.test.mjs
git commit -m "v0.96 (7/11): 楓幣匯率——抓 8591 雪吉拉楓幣掛單全部頁（停 3 秒、老實的 User-Agent、被擋不重試、一頁失敗整次不算）"
```

---

### Task 8：串起來（`run.mjs`＋`collect.mjs`）

**Files:**
- Create: `pipeline/fx/lib/run.mjs`
- Create: `pipeline/fx/collect.mjs`
- Test: `pipeline/fx/lib/run.test.mjs`

**Interfaces:**
- Consumes：Task 3–7 全部
- Produces：
  - `DIR = "fx/scania"`、`FILES = ["samples.jsonl", "ref-samples.jsonl", "state.json", "latest.json", "daily.json"]`、`MIN_LISTINGS = 20`
  - `runCollect({ dataDir, outDir, now?, get8591, getRef, log? }) → Promise<{ ok8591: boolean, okRef: boolean, fail8591: number, error8591: string|null, errorRef: string|null, src: "8591"|"ref", ask100: number }>`；兩個來源都失敗就 throw。
  - `outDir/fx/scania/` 寫出 `FILES` 五個檔（`dataDir` 是 `fx-data` 的 checkout，可以是空資料夾）。
  - CLI：`node pipeline/fx/collect.mjs <fx-data 資料夾> <輸出資料夾>`，有 `GITHUB_OUTPUT` 時寫 `ok8591`、`okRef`、`fail8591`。

- [ ] **Step 1：寫失敗的測試 `pipeline/fx/lib/run.test.mjs`**

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
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node --test pipeline/fx/lib/run.test.mjs`
Expected：FAIL，`Cannot find module` …`run.mjs`

- [ ] **Step 3：寫 `pipeline/fx/lib/run.mjs`**

```js
/**
 * 一次收集：讀 fx-data 上一次的狀態 → 抓 8591（失敗就靠參考站）→ 算好新的五個檔寫到輸出資料夾。
 * 抓取函式用參數傳進來，測試不用連網。兩個 .jsonl 只接在舊內容後面（publish 會檢查只變長）。
 * 參考站每次都抓：存它的歷史（8591 抓不到的空檔用它補），8591 失敗時最新一筆也用它。
 */
import fs from "node:fs";
import path from "node:path";
import { dailyBars, mergeStreams, taipeiIso } from "./daily.mjs";
import { summarize } from "./market.mjs";
import { refHistory, refSnapshot } from "./ref.mjs";
import { soldSince, stateMap } from "./volume.mjs";

export const DIR = "fx/scania";
export const FILES = ["samples.jsonl", "ref-samples.jsonl", "state.json", "latest.json", "daily.json"];
export const MIN_LISTINGS = 20;

const parseLines = text => text.split("\n").filter(line => line.trim()).map(line => JSON.parse(line));
const withNewline = text => (text && !text.endsWith("\n") ? `${text}\n` : text);

export async function runCollect({ dataDir, outDir, now = new Date(), get8591, getRef, log = console.log }) {
  const readText = name => {
    const file = path.join(dataDir, DIR, name);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  };
  const state = readText("state.json") ? JSON.parse(readText("state.json")) : { at: null, listings: {}, fail8591: 0 };
  let samplesText = withNewline(readText("samples.jsonl"));
  let refText = withNewline(readText("ref-samples.jsonl"));
  const t = taipeiIso(now);

  let own = null;
  let error8591 = null;
  try {
    const summary = summarize(await get8591());
    if (summary.kept.length < MIN_LISTINGS || summary.ask100 === null) throw new Error(`有效掛單只有 ${summary.kept.length} 筆（少於 ${MIN_LISTINGS}）`);
    own = summary;
  } catch (error) {
    error8591 = error.message;
    log(`8591 這次不算：${error8591}`);
  }

  let refJson = null;
  let errorRef = null;
  try {
    refJson = await getRef();
  } catch (error) {
    errorRef = error.message;
    log(`參考站抓不到：${errorRef}`);
  }
  const refNow = refJson ? refSnapshot(refJson) : null;
  if (refJson && !refNow) errorRef = "參考站 price.json 格式不對";

  if (!own && !refNow) throw new Error(`兩個來源都失敗：8591（${error8591}）、參考站（${errorRef}）`);

  let nextState;
  let latest;
  if (own) {
    const sold = soldSince(state.listings, own.kept);
    samplesText += `${JSON.stringify({ t, src: "8591", ask100: own.ask100, listings: own.kept.length, volNtd: sold.volNtd, volMeso: sold.volMeso })}\n`;
    nextState = { at: t, listings: stateMap(own.kept), fail8591: 0 };
    latest = { t, src: "8591", ask100: own.ask100, listings: own.kept.length, ladder: own.ladder, band: own.band };
  } else {
    // 狀態留著：下次 8591 恢復時跟最後一次看到的比，成交算在那一次
    nextState = { ...state, fail8591: (state.fail8591 ?? 0) + 1 };
    latest = { t: refNow.t, src: "ref", ask100: refNow.ask100, listings: refNow.listings, ladder: refNow.ladder, band: null };
  }

  const refRows = parseLines(refText);
  const lastRef = refRows.length ? Date.parse(refRows.at(-1).t) : -Infinity;
  for (const row of refJson ? refHistory(refJson) : []) {
    if (Date.parse(row.t) > lastRef) refText += `${JSON.stringify(row)}\n`;
  }

  const daily = { server: "雪吉拉", unit: "元／1 億楓幣", updatedAt: t, days: dailyBars(mergeStreams(parseLines(samplesText), parseLines(refText))) };

  const dir = path.join(outDir, DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "samples.jsonl"), samplesText);
  fs.writeFileSync(path.join(dir, "ref-samples.jsonl"), refText);
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(nextState));
  fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(latest));
  fs.writeFileSync(path.join(dir, "daily.json"), JSON.stringify(daily));

  return { ok8591: Boolean(own), okRef: Boolean(refNow), fail8591: nextState.fail8591, error8591, errorRef, src: latest.src, ask100: latest.ask100 };
}
```

- [ ] **Step 4：寫 `pipeline/fx/collect.mjs`**

```js
/**
 * 楓幣匯率收集的排程進入點（.github/workflows/fx-collect.yml 的 collect job 跑它）。
 *
 *   node pipeline/fx/collect.mjs <fx-data 分支的 checkout（第一次可以是空資料夾）> <輸出資料夾>
 *
 * 抓 8591 雪吉拉楓幣掛單＋參考站 price.json，把 fx/scania/ 的五個檔寫到輸出資料夾（不動 fx-data 那份）。
 * 兩個來源都失敗就 exit 1。有 GITHUB_OUTPUT 時寫 ok8591、okRef、fail8591 給 notify。
 * 本機試跑（會真的連 8591 一次，約 12 頁、40 秒）：輸出資料夾給 scratchpad，跑完看 fx/scania/latest.json。
 */
import fs from "node:fs";
import { USER_AGENT, fetchAllListings } from "./lib/fetch8591.mjs";
import { REF_URL } from "./lib/ref.mjs";
import { runCollect } from "./lib/run.mjs";

const [dataDir, outDir] = process.argv.slice(2);
if (!dataDir || !outDir) {
  console.error("用法：node pipeline/fx/collect.mjs <fx-data 資料夾> <輸出資料夾>");
  process.exit(2);
}

async function getRef() {
  const response = await fetch(REF_URL, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  // 當文字讀、自己 JSON.parse：外站的內容只當資料
  return JSON.parse(await response.text());
}

const result = await runCollect({ dataDir, outDir, get8591: () => fetchAllListings(), getRef });
console.log(JSON.stringify(result));
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `ok8591=${result.ok8591}\nokRef=${result.okRef}\nfail8591=${result.fail8591}\n`);
}
```

- [ ] **Step 5：跑測試確認通過**

Run：`node --test pipeline/fx/lib/run.test.mjs`
Expected：PASS（6 個 test）

- [ ] **Step 6：Commit**

```bash
git add pipeline/fx/lib/run.mjs pipeline/fx/lib/run.test.mjs pipeline/fx/collect.mjs
git commit -m "v0.96 (8/11): 楓幣匯率——一次收集串起來：8591 為主、參考站備援並存歷史，寫出樣本、狀態、最新、每日五個檔"
```

---

### Task 9：publish 前檢查 artifact

**Files:**
- Create: `pipeline/fx/publish.mjs`
- Create: `pipeline/fx/lib/artifact.mjs`
- Test: `pipeline/fx/lib/artifact.test.mjs`

**Interfaces:**
- Consumes：`DIR`、`FILES`（Task 8）
- Produces：
  - `checkArtifact(outDir, branchDir) → void`（不對就 throw，訊息寫哪個檔哪裡不對）
  - `installArtifact(outDir, branchDir, staticDir) → void`（五個檔＋`README.md`、`vercel.json` 複製進 branchDir）
  - CLI：`node pipeline/fx/publish.mjs <artifact 資料夾> <fx-data 工作目錄> <branch-files 資料夾>`

- [ ] **Step 1：寫失敗的測試 `pipeline/fx/lib/artifact.test.mjs`**

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
const good = () => ({
  "fx/scania/samples.jsonl": '{"t":"2026-10-13T16:17:00+08:00","src":"8591","ask100":300}\n',
  "fx/scania/ref-samples.jsonl": '{"t":"2026-10-13T14:40:59+08:00","ask100":300}\n',
  "fx/scania/state.json": '{"at":null,"listings":{},"fail8591":0}',
  "fx/scania/latest.json": '{"t":"2026-10-13T16:17:00+08:00","src":"8591","ask100":300}',
  "fx/scania/daily.json": '{"server":"雪吉拉","days":[]}',
});

test("五個檔都在、都讀得懂、舊的 jsonl 是新的開頭：通過", () => {
  const branch = write(tmp(), { "fx/scania/samples.jsonl": '{"t":"2026-10-13T16:17:00+08:00","src":"8591","ask100":300}\n' });
  assert.doesNotThrow(() => checkArtifact(write(tmp(), good()), branch));
});

test("多一個檔、少一個檔都不行", () => {
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/x.html": "<script>" }), tmp()), /檔案不對/);
  const missing = good();
  delete missing["fx/scania/daily.json"];
  assert.throws(() => checkArtifact(write(tmp(), missing), tmp()), /檔案不對/);
});

test("JSON 壞掉不行", () => {
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/latest.json": "{oops" }), tmp()), /latest\.json/);
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/samples.jsonl": "{oops}\n" }), tmp()), /samples\.jsonl/);
});

test("最新一筆市價不是正數、每日沒有 days 陣列不行", () => {
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/latest.json": '{"ask100":0}' }), tmp()), /latest\.json/);
  assert.throws(() => checkArtifact(write(tmp(), { ...good(), "fx/scania/daily.json": '{"days":null}' }), tmp()), /daily\.json/);
});

test("jsonl 改了舊行（不是只接在後面）不行", () => {
  const branch = write(tmp(), { "fx/scania/samples.jsonl": '{"t":"2026-10-12T16:17:00+08:00","src":"8591","ask100":280}\n' });
  assert.throws(() => checkArtifact(write(tmp(), good()), branch), /只能接在後面/);
});

test("installArtifact：五個檔＋分支說明、vercel.json 放進工作目錄", () => {
  const out = write(tmp(), good());
  const branch = tmp();
  const statics = write(tmp(), { "README.md": "# fx-data", "vercel.json": '{"git":{"deploymentEnabled":false}}' });
  installArtifact(out, branch, statics);
  assert.equal(fs.readFileSync(path.join(branch, "vercel.json"), "utf8"), '{"git":{"deploymentEnabled":false}}');
  assert.equal(fs.readFileSync(path.join(branch, "fx/scania/daily.json"), "utf8"), good()["fx/scania/daily.json"]);
});
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node --test pipeline/fx/lib/artifact.test.mjs`
Expected：FAIL，`Cannot find module` …`artifact.mjs`

- [ ] **Step 3：寫 `pipeline/fx/lib/artifact.mjs`**

```js
/**
 * publish job 推上 fx-data 之前檢查 collect 產的 artifact：collect 跑過外站的內容，publish 只當資料收。
 * 只准 fx/scania/ 底下那五個一般檔案（不能有連結、隱藏檔、多的檔），每個都讀得懂，
 * 兩個 .jsonl 必須是舊內容原封不動接上新的（歷史只會變長）。全部用 readFileSync＋JSON.parse，不 require、不 import。
 */
import fs from "node:fs";
import path from "node:path";
import { DIR, FILES } from "./run.mjs";

const EXPECTED = FILES.map(name => `${DIR}/${name}`).sort();
const STATIC_FILES = ["README.md", "vercel.json"];

function listAll(root, dir = "") {
  const entries = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) entries.push(...listAll(root, rel));
    else entries.push(entry.isFile() ? rel : `${rel}（不是一般檔案）`);
  }
  return entries;
}

function parse(name, text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${name} 讀不懂：${error.message}`);
  }
}

export function checkArtifact(outDir, branchDir) {
  const actual = listAll(outDir).sort();
  if (actual.join("\n") !== EXPECTED.join("\n")) throw new Error(`artifact 檔案不對：${actual.join("、")}（應該只有 ${EXPECTED.join("、")}）`);

  const read = name => fs.readFileSync(path.join(outDir, DIR, name), "utf8");
  for (const name of FILES.filter(file => file.endsWith(".jsonl"))) {
    const text = read(name);
    text.split("\n").filter(line => line.trim()).forEach((line, index) => parse(`${name} 第 ${index + 1} 行`, line));
    const oldFile = path.join(branchDir, DIR, name);
    if (fs.existsSync(oldFile) && !text.startsWith(fs.readFileSync(oldFile, "utf8"))) throw new Error(`${name} 只能接在後面，舊的內容被改了`);
  }
  parse("state.json", read("state.json"));
  const latest = parse("latest.json", read("latest.json"));
  if (!(typeof latest?.ask100 === "number" && latest.ask100 > 0)) throw new Error("latest.json 的 ask100 不是正數");
  const daily = parse("daily.json", read("daily.json"));
  if (!Array.isArray(daily?.days)) throw new Error("daily.json 沒有 days 陣列");
}

export function installArtifact(outDir, branchDir, staticDir) {
  fs.mkdirSync(path.join(branchDir, DIR), { recursive: true });
  for (const name of FILES) fs.copyFileSync(path.join(outDir, DIR, name), path.join(branchDir, DIR, name));
  for (const name of STATIC_FILES) fs.copyFileSync(path.join(staticDir, name), path.join(branchDir, name));
}
```

- [ ] **Step 4：寫 `pipeline/fx/publish.mjs`**

```js
/**
 * fx-collect.yml 的 publish job：檢查 collect 的 artifact，通過才放進 fx-data 的工作目錄（git commit／push 在 workflow 裡）。
 *
 *   node pipeline/fx/publish.mjs <artifact 資料夾> <fx-data 工作目錄> <pipeline/fx/branch-files>
 */
import { checkArtifact, installArtifact } from "./lib/artifact.mjs";

const [outDir, branchDir, staticDir] = process.argv.slice(2);
if (!outDir || !branchDir || !staticDir) {
  console.error("用法：node pipeline/fx/publish.mjs <artifact 資料夾> <fx-data 工作目錄> <branch-files 資料夾>");
  process.exit(2);
}
checkArtifact(outDir, branchDir);
installArtifact(outDir, branchDir, staticDir);
console.log("artifact 檢查通過，已放進 fx-data 工作目錄");
```

- [ ] **Step 5：跑測試確認通過**

Run：`node --test pipeline/fx/lib/artifact.test.mjs`
Expected：PASS（6 個 test）

- [ ] **Step 6：Commit**

```bash
git add pipeline/fx/publish.mjs pipeline/fx/lib/artifact.mjs pipeline/fx/lib/artifact.test.mjs
git commit -m "v0.96 (9/11): 楓幣匯率——推上 fx-data 前檢查：只准那五個檔、都讀得懂、歷史只能接在後面"
```

---

### Task 10：失敗通知

**Files:**
- Create: `pipeline/fx/notify.mjs`
- Create: `pipeline/fx/lib/notify-decide.mjs`
- Test: `pipeline/fx/lib/notify-decide.test.mjs`

**Interfaces:**
- Produces：
  - `LABEL = "匯率收集失敗"`、`FAIL_LIMIT = 3`
  - `decide({ write, collectResult, publishResult, ok8591, fail8591 }) → { action: "open"|"close"|"none", reason: string }`（`ok8591` 是字串 `"true"`／`"false"`／`""`、`fail8591` 是字串，都是 workflow outputs 原樣）
  - CLI：`node pipeline/fx/notify.mjs`（讀環境變數，見檔頭）

- [ ] **Step 1：寫失敗的測試 `pipeline/fx/lib/notify-decide.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { decide } from "./notify-decide.mjs";

const base = { write: "true", collectResult: "success", publishResult: "success", ok8591: "true", fail8591: "0" };

test("8591 正常、推上去了：關掉開著的 issue", () => {
  assert.equal(decide(base).action, "close");
});

test("兩個來源都失敗（collect 紅）：開 issue", () => {
  const result = decide({ ...base, collectResult: "failure", publishResult: "skipped", ok8591: "", fail8591: "" });
  assert.equal(result.action, "open");
  assert.match(result.reason, /兩個來源都失敗/);
});

test("推不上 fx-data：開 issue", () => {
  assert.match(decide({ ...base, publishResult: "failure" }).reason, /fx-data/);
});

test("8591 失敗但有參考站：連續 3 次才開，之前不吵", () => {
  assert.equal(decide({ ...base, ok8591: "false", fail8591: "2" }).action, "none");
  const result = decide({ ...base, ok8591: "false", fail8591: "3" });
  assert.equal(result.action, "open");
  assert.match(result.reason, /連續 3 次/);
});

test("不寫入的測試跑法（別的分支手動觸發沒勾 write）：什麼都不做", () => {
  assert.equal(decide({ ...base, write: "false", collectResult: "failure" }).action, "none");
});
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node --test pipeline/fx/lib/notify-decide.test.mjs`
Expected：FAIL，`Cannot find module` …`notify-decide.mjs`

- [ ] **Step 3：寫 `pipeline/fx/lib/notify-decide.mjs`**

```js
/**
 * 楓幣匯率收集要不要開／關 issue（fx-collect.yml 的 notify job）。
 * 開：兩個來源都失敗（collect 紅）、推不上 fx-data、8591 連續 3 次抓不到（12 小時，正在靠參考站撐）。
 * 關：8591 正常而且推上去了。不寫入的測試跑法不通知。
 */
export const LABEL = "匯率收集失敗";
export const FAIL_LIMIT = 3;

export function decide({ write, collectResult, publishResult, ok8591, fail8591 }) {
  if (write !== "true") return { action: "none", reason: "測試跑法（沒有寫入），不通知" };
  if (collectResult === "failure") return { action: "open", reason: "8591 跟參考站兩個來源都失敗（或程式出錯），這一輪沒有資料" };
  if (publishResult === "failure") return { action: "open", reason: "資料算好了但推不上 fx-data 分支" };
  if (ok8591 === "false" && Number(fail8591) >= FAIL_LIMIT) return { action: "open", reason: `8591 連續 ${fail8591} 次抓不到（可能被擋或改版），現在靠參考站的數字` };
  if (ok8591 === "true" && publishResult === "success") return { action: "close", reason: "8591 恢復正常" };
  return { action: "none", reason: "沒有要通知的" };
}
```

- [ ] **Step 4：寫 `pipeline/fx/notify.mjs`**

```js
/**
 * fx-collect.yml 的 notify job：照 lib/notify-decide.mjs 的決定開／更新／關 issue（label「匯率收集失敗」）。
 * 已經有開著的就只改內文「最後一次」那行，不留言洗版；恢復時留言並關掉。
 *
 * 環境變數：GH_TOKEN（issues: write）、WRITE、COLLECT_RESULT、PUBLISH_RESULT、OK_8591、FAIL_8591、ASSIGNEE，
 * 以及 Actions 內建的 GITHUB_REPOSITORY、GITHUB_RUN_ID、GITHUB_SERVER_URL、GITHUB_API_URL。
 */
import { LABEL, decide } from "./lib/notify-decide.mjs";

const env = process.env;
const { action, reason } = decide({
  write: env.WRITE,
  collectResult: env.COLLECT_RESULT,
  publishResult: env.PUBLISH_RESULT,
  ok8591: env.OK_8591 ?? "",
  fail8591: env.FAIL_8591 ?? "",
});
console.log(`${action}：${reason}`);
if (action === "none") process.exit(0);

const api = env.GITHUB_API_URL ?? "https://api.github.com";
const repo = env.GITHUB_REPOSITORY;
const runUrl = `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}/actions/runs/${env.GITHUB_RUN_ID}`;
const headers = { authorization: `Bearer ${env.GH_TOKEN}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "maplestory-tool fx-collect notify" };

async function call(method, url, body) {
  const response = await fetch(`${api}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`${method} ${url} → HTTP ${response.status}：${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

const open = await call("GET", `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(LABEL)}&per_page=1`);
const issue = open[0];
const stamp = new Date().toISOString();
const lastLine = `最後一次：${stamp}，${reason}（${runUrl}）`;

if (action === "open") {
  if (issue) {
    await call("PATCH", `/repos/${repo}/issues/${issue.number}`, { body: (issue.body ?? "").replace(/^最後一次：.*$/m, lastLine) });
  } else {
    await call("POST", `/repos/${repo}/labels`, { name: LABEL, color: "d73a4a", description: "楓幣匯率收集（fx-collect.yml）失敗時自動開的，8591 恢復會自動關" }).catch(() => {});
    await call("POST", `/repos/${repo}/issues`, {
      title: "楓幣匯率收集失敗",
      labels: [LABEL],
      assignees: env.ASSIGNEE ? [env.ASSIGNEE] : [],
      body: `${reason}\n\n${lastLine}\n\n資料分支：fx-data；排程：.github/workflows/fx-collect.yml。8591 恢復正常會自動關這張。`,
    });
  }
} else if (issue) {
  await call("POST", `/repos/${repo}/issues/${issue.number}/comments`, { body: `恢復了：${reason}（${runUrl}）` });
  await call("PATCH", `/repos/${repo}/issues/${issue.number}`, { state: "closed" });
}
```

- [ ] **Step 5：跑測試確認通過**

Run：`node --test pipeline/fx/lib/notify-decide.test.mjs`
Expected：PASS（5 個 test）

- [ ] **Step 6：Commit**

```bash
git add pipeline/fx/notify.mjs pipeline/fx/lib/notify-decide.mjs pipeline/fx/lib/notify-decide.test.mjs
git commit -m "v0.96 (10/11): 楓幣匯率——收集失敗開 issue（兩邊都失敗、推不上、8591 連續 3 次），恢復自動關"
```

---

### Task 11：排程 workflow＋鎖住它的測試＋README

**Files:**
- Create: `.github/workflows/fx-collect.yml`
- Create: `pipeline/lib/fx-collect-workflow.test.mjs`
- Modify: `README.md`（在「## 自動更新」那節後面加「## 楓幣匯率收集」）

**Interfaces:**
- Consumes：`pipeline/fx/collect.mjs`、`publish.mjs`、`notify.mjs`、`branch-files/`
- Produces：workflow 名稱「楓幣匯率收集」，job `collect`／`publish`／`notify`；collect outputs `ok8591`、`okRef`、`fail8591`

- [ ] **Step 1：寫失敗的測試 `pipeline/lib/fx-collect-workflow.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// 直接讀 workflow 原文：寫入權限只在 publish、run 裡不准 ${{ }}、別的分支手動跑預設不寫入、8591 不會被打太兇
const FILE = path.join(import.meta.dirname, "../../.github/workflows/fx-collect.yml");
const WORKFLOW = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n") : "";
const CODE = WORKFLOW.replace(/(^|[ \t])#.*$/gm, "").replace(/[ \t]+$/gm, "").replace(/^\n/gm, "");
const JOBS = CODE.slice(CODE.indexOf("\njobs:\n"));

function jobBlock(name) {
  const start = JOBS.indexOf(`\n  ${name}:\n`);
  if (start === -1) return "";
  const rest = JOBS.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[\w-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 2);
}

/** 每個 run: 區塊的內容（單行或 | 底下縮排較深的行） */
function runBlocks() {
  const lines = CODE.split("\n");
  const blocks = [];
  lines.forEach((line, index) => {
    const match = line.match(/^(\s*)(?:- )?run: ?(.*)$/);
    if (!match) return;
    const indent = match[1].length;
    const body = [match[2]];
    for (let next = index + 1; next < lines.length && (lines[next].search(/\S/) > indent || lines[next].trim() === ""); next += 1) body.push(lines[next]);
    blocks.push(body.join("\n"));
  });
  return blocks;
}

const WRITE_CONDITION = "github.ref == 'refs/heads/main' || github.ref == 'refs/heads/dev' || inputs.write";

test("每 4 小時跑一次（台灣 08:17 起），可以手動跑，合進 dev 時改到收集程式也跑一次", () => {
  assert.ok(WORKFLOW, ".github/workflows/fx-collect.yml 要存在");
  assert.match(CODE, /\n {2}schedule:\n {4}- cron: "17 \*\/4 \* \* \*"\n/);
  assert.match(CODE, /\n {2}workflow_dispatch:\n/);
  assert.match(CODE, /\n {2}push:\n {4}branches: \[dev\]\n {4}paths:\n/);
  assert.doesNotMatch(CODE, /pull_request/);
});

test("同時只跑一個，不取消排隊中的（兩個一起推 fx-data 會互撞）", () => {
  assert.match(CODE, /\nconcurrency:\n {2}group: fx-collect\n {2}cancel-in-progress: false\n/);
});

test("collect 只能讀、checkout 不留 token；寫入（contents: write）只在 publish", () => {
  const collect = jobBlock("collect");
  assert.match(collect, /permissions:\n {6}contents: read\n/);
  assert.doesNotMatch(collect, /write/);
  for (const checkout of CODE.match(/uses: actions\/checkout@.*(?:\n {8}.*)*/g) ?? []) assert.match(checkout, /persist-credentials: false/);
  assert.equal(CODE.match(/contents: write/g)?.length, 1);
  assert.match(jobBlock("publish"), /contents: write/);
});

test("publish 只在 collect 成功、而且是 main／dev 或手動勾了 write 才跑；推之前先過 publish.mjs 的檢查", () => {
  const publish = jobBlock("publish");
  assert.ok(publish.includes(`if: needs.collect.result == 'success' && (${WRITE_CONDITION})`));
  const pushStep = publish.slice(publish.indexOf("publish.mjs"));
  assert.ok(publish.includes("node repo/pipeline/fx/publish.mjs"), "要先跑 publish.mjs 檢查");
  assert.ok(pushStep.includes("git push"), "git push 要在 publish.mjs 之後");
});

test("notify 有 issues: write、沒有 contents: write，成功失敗都跑", () => {
  const notify = jobBlock("notify");
  assert.match(notify, /issues: write/);
  assert.doesNotMatch(notify, /contents: write/);
  assert.match(notify, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.match(notify, /node pipeline\/fx\/notify\.mjs/);
});

test("run 裡不准有 ${{ }}（上游、外站的字串會被當指令執行），一律用 env 傳", () => {
  const blocks = runBlocks();
  assert.ok(blocks.length >= 3);
  for (const block of blocks) assert.doesNotMatch(block, /\$\{\{/, block);
});

test("寫入條件只定義在 env.WRITE 與 publish 的 if，兩處一樣", () => {
  assert.ok(CODE.includes(`WRITE: \${{ (${WRITE_CONDITION}) && 'true' || 'false' }}`));
});
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node --test pipeline/lib/fx-collect-workflow.test.mjs`
Expected：FAIL，「.github/workflows/fx-collect.yml 要存在」

- [ ] **Step 3：寫 `.github/workflows/fx-collect.yml`**

```yaml
name: 楓幣匯率收集

# 每 4 小時抓一次 8591 雪吉拉楓幣掛單（參考站 maple-classic-wiki.pages.dev 備援），算好的數字推上孤兒分支 fx-data。
# 頁面跟拍賣查價工具直接讀 raw.githubusercontent.com 上的 fx-data，所以資料更新不用部署；
# fx-data 自己帶 vercel.json 關掉部署（根目錄的 vercel.json 也擋），不吃 Vercel 每天的部署額度。
# 設計：docs/superpowers/specs/2026-10-13-meso-fx-design.md
#
# 三個 job，寫入權限只在 publish：
#  - collect：唯讀。clone fx-data（公開 repo，不用 token）讀上一次狀態、抓 8591＋參考站、算好五個檔存 artifact
#  - publish：檢查 artifact（pipeline/fx/publish.mjs）後推上 fx-data。只在 main（排程）、dev（合進 dev 時）或手動勾 write 時跑
#  - notify：兩個來源都失敗、推不上、8591 連續 3 次抓不到 → 開 issue（label「匯率收集失敗」）；恢復自動關
#
# ⚠️ 8591 服務條款禁止未經授權的自動抓取，使用者 2026-10-13 知情後拍板照做：每 4 小時一次、頁間停 3 秒、User-Agent 寫明身分

on:
  schedule:
    # 台灣時間 08:17、12:17、16:17、20:17、00:17、04:17
    - cron: "17 */4 * * *"
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
    # 抓 8591 約 12 頁 × 3 秒，平常 1 分鐘內
    timeout-minutes: 15
    permissions:
      contents: read
    outputs:
      ok8591: ${{ steps.collect.outputs.ok8591 }}
      okRef: ${{ steps.collect.outputs.okRef }}
      fail8591: ${{ steps.collect.outputs.fail8591 }}
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

      - name: 抓 8591 與參考站、算好新檔
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
          OK_8591: ${{ needs.collect.outputs.ok8591 }}
          FAIL_8591: ${{ needs.collect.outputs.fail8591 }}
          ASSIGNEE: ${{ github.repository_owner }}
        run: node pipeline/fx/notify.mjs
```

- [ ] **Step 4：跑測試確認通過**

Run：`node --test pipeline/lib/fx-collect-workflow.test.mjs`
Expected：PASS（7 個 test）。沒過就改 workflow 或測試的比對字串，直到兩邊一致（測試的意圖不准放寬）。

- [ ] **Step 5：README 加一節（放在「## 自動更新」那一節結束、下一個 `## ` 之前）**

```markdown
## 楓幣匯率收集

`.github/workflows/fx-collect.yml`（workflow「楓幣匯率收集」）每 4 小時（台灣 08:17 起）抓一次 8591《新楓之谷：經典版》
雪吉拉的楓幣掛單，算出市價（跟參考站 maple-classic-wiki.pages.dev/price 同一套：排除代練與引流單、MAD 去離群、
最便宜四分之一的中位數）、有效掛單數、價位分布、成交（同一筆掛單累計賣出件數相減），推上孤兒分支 **`fx-data`**。
8591 抓不到時用參考站的數字補。設計：`docs/superpowers/specs/2026-10-13-meso-fx-design.md`。

- **不吃部署額度**：`fx-data` 自己帶 `vercel.json` 關掉部署，根目錄 `vercel.json` 也擋 `fx-data`、`price-data`（拍賣查價的資料分支）。
  頁面直接讀 raw.githubusercontent.com，資料更新不用部署。
- **每日匯率（給拍賣查價工具）**：https://raw.githubusercontent.com/clarkher/maplestory-tool/fx-data/fx/scania/daily.json
  ——`days[]` 每天一筆，`close`＝1 億楓幣幾元（當天最後一次），`closeMesoPerNtd`＝1 元換幾萬楓幣，`source` 是 `8591`／`ref`／`mixed`。
- **程式**：`pipeline/fx/collect.mjs`（進入點）、`pipeline/fx/lib/*.mjs`（純函式，`node --test "pipeline/fx/lib/*.test.mjs"`）。
  本機試跑：`node pipeline/fx/collect.mjs <空資料夾> <輸出資料夾>`（會真的連 8591 一次，約 12 頁、40 秒）。
- **手動跑**：`gh workflow run fx-collect.yml --ref <分支>`；main、dev 以外的分支要加 `-f write=true` 才會推上 `fx-data`。
- **失敗通知**：兩個來源都失敗、推不上 `fx-data`、或 8591 連續 3 次（12 小時）抓不到，開 issue（label「匯率收集失敗」）；8591 恢復自動關。
- ⚠️ 8591 服務條款禁止未經授權的自動抓取，使用者 2026-10-13 知情後拍板照做：每 4 小時一次、頁間停 3 秒、
  User-Agent 寫明身分、只存算好的數字（不存標題、賣家）。被 8591 要求停止就停。
```

- [ ] **Step 6：跑全部 pipeline 測試**

Run：`node --test "pipeline/**/*.test.mjs"`
Expected：全部 PASS（含原本的 data-refresh、test-workflow 測試）

- [ ] **Step 7：Commit**

```bash
git add .github/workflows/fx-collect.yml pipeline/lib/fx-collect-workflow.test.mjs README.md
git commit -m "v0.96 (11/11): 楓幣匯率收集排程——每 4 小時，collect 唯讀／publish 唯一寫入 fx-data／notify 開關 issue；README 加說明與給拍賣工具的每日匯率網址"
```

---

### Task 12：本機用真資料跑一次＋驗成交量

**Files:**
- 不改 repo（輸出放 scratchpad）

- [ ] **Step 1：本機跑一次真的收集**

Run（PowerShell，`$S`＝scratchpad）：

```powershell
$S="<scratchpad>"; Remove-Item -Recurse -Force "$S\fx-empty","$S\fx-out1" -ErrorAction SilentlyContinue; New-Item -ItemType Directory "$S\fx-empty" | Out-Null
node pipeline/fx/collect.mjs "$S\fx-empty" "$S\fx-out1"
Get-Content "$S\fx-out1\fx\scania\latest.json"
```

Expected：印出 `{"ok8591":true,"okRef":true,…}`；`latest.json` 的 `ask100` 跟參考站當下 `servers.雪吉拉.ask` 差在 ±10% 內、`listings` ≥ 20。差太多就停下來查（多半是解析或排除規則不一樣），不要往下。

- [ ] **Step 2：成交量驗證（spec「成交量還沒驗證」）**

```powershell
node "$S\baseline.mjs" "$S\base-2.json" "$S\base-1.json"
```

（`baseline.mjs`、`base-1.json` 是 10/13 16:27 brainstorming 時存的；跟現在比每筆 `sell_count`／庫存／價格）
Expected：印出有變動的掛單與 `{ changed, fresh, gone }`。把結果寫進共用筆記 `fx-8591-findings.md`「還沒確認」那節。
如果 `sell_count` 全部沒動：再等下一輪（≥ 4 小時）比一次；48 小時內都沒動就在第二段頁面的計畫裡把成交量改成「看不到成交」的寫法，並回報使用者。

- [ ] **Step 3：不 commit（沒有 repo 改動）**

---

### Task 13：交付——進 dev、證明排程跑過、收集那段單獨進 main

- [ ] **Step 1：確認版號還沒被搶、base 是最新 dev**

```bash
git fetch origin && git log --all --oneline | grep -E "v0.96"
git log origin/dev --oneline -3
```

Expected：列出來的 v0.96 全是楓幣匯率這支的 commit（spec、計畫、(1/11)～(11/11)）。被搶了就趁還沒合，全部 commit 改下一號（`git rebase -i` 不能用，用 `git filter-branch -f --msg-filter "sed s/^v0.96/v0.97/" origin/dev..HEAD`），並在共用筆記與給拍賣查價 session 的訊息更正版號。dev 有新東西就 `git rebase origin/dev`。

- [ ] **Step 2：push、開 PR 進 dev**

（token helper push；PR 用 `gh pr create --base dev --head feat/meso-fx`，`gh` 逾時就照記憶用 curl 打 REST）
PR 標題：`v0.96: 楓幣匯率收集——每 4 小時抓 8591 雪吉拉楓幣掛單（參考站備援）推上 fx-data，給匯率頁與拍賣查價用`
PR 內文寫：做了什麼、條款風險使用者已拍板、`fx-data` 擋部署實測結果、本機真資料跑一次的數字、成交量驗證到哪、第二段（頁面）另一個 PR。結尾加 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。

- [ ] **Step 3：等 CI 三條（單元測試、建置、第一格）都出現而且綠，再合併**

```bash
GH_TOKEN=$(gh auth token --user clarkher) gh pr checks <N>
```

三個名字都要出現且 SUCCESS（只看「沒有 pending」會被 Vercel 先好騙到）。合併用 rebase（每個 commit 保留，之後只挑程式的 cherry-pick 進 main）：`gh pr merge <N> --rebase --delete-branch`。
合完 `git fetch origin && git log origin/dev --oneline -15` 確認 11 個程式 commit 跟 docs commit 都在。

- [ ] **Step 4：證明排程在 dev 真的跑過**

合進 dev 會觸發 `push: branches: [dev]`：

```bash
GH_TOKEN=$(gh auth token --user clarkher) gh run list --workflow fx-collect.yml --limit 3
GH_TOKEN=$(gh auth token --user clarkher) gh run watch <run id> --exit-status
curl -s https://raw.githubusercontent.com/clarkher/maplestory-tool/fx-data/fx/scania/latest.json
curl -s https://raw.githubusercontent.com/clarkher/maplestory-tool/fx-data/fx/scania/daily.json | head -c 600
```

Expected：run 三個 job 綠；`latest.json` 是剛剛的時間、`src` 是 `8591`；`daily.json` 有 10/08 起的日子。
再查這次推上 `fx-data` 的 commit 沒觸發 Vercel（Task 1 Step 3 的兩個指令，換成新 sha）。

- [ ] **Step 5：收集那段單獨進 main（使用者 10/13 選 1）**

```bash
git fetch origin
git worktree add "$SCRATCH/release-fx" origin/main -b release/v0.96-fx
cd "$SCRATCH/release-fx"
# 只挑程式的 commit（v0.96 (1/11) ～ (11/11)，不含 docs），照 dev 上的順序
git cherry-pick <dev 上 (1/11) 的 sha>^..<dev 上 (11/11) 的 sha>
```

README 衝突就只插「## 楓幣匯率收集」那一段。然後：

```powershell
node --test "pipeline/**/*.test.mjs"
```

（main 上沒有「測試」workflow，本機跑；全綠才繼續）
`git diff origin/main --stat` 確認只動到：`vercel.json`、`.github/workflows/fx-collect.yml`、`pipeline/fx/**`、`pipeline/lib/fx-collect-workflow.test.mjs`、`README.md`。
push → 開 PR 進 main（標題 `release: 楓幣匯率收集排程（v0.96 第一段，不含頁面）`，內文寫明「正式站畫面不變、只多一個排程」）→
`git log --oneline origin/main..origin/release/v0.96-fx` 只有自己的 → `gh pr merge <N> --merge --match-head-commit <release 分支頭 sha> --delete-branch` → `git worktree remove --force "$SCRATCH/release-fx"`。

- [ ] **Step 6：證明 main 上的排程跑得起來**

```bash
GH_TOKEN=$(gh auth token --user clarkher) gh workflow run fx-collect.yml --ref main
GH_TOKEN=$(gh auth token --user clarkher) gh run list --workflow fx-collect.yml --limit 3
```

watch 到綠、`latest.json` 時間更新。下一個整點 17 分（4 小時一輪）的排程 run 也要查到一次 `event: schedule` 的成功紀錄，貼 run 連結。

- [ ] **Step 7：回報＋記憶**

- 共用筆記 `fx-8591-findings.md` 更新：`fx-data` 已上線、每日匯率網址可以用了；`SendMessage` 通知拍賣查價 session。
- 記憶 `maplebook-price-tracking.md` 補一行：匯率收集 v0.96 已上 main（日期、網址、資料分支）。
- 回使用者：run 連結、`daily.json` 網址、目前市價（兩種單位）、成交量驗證結果、下一步是第二段頁面（先出 3–4 版真資料畫面給挑）。

---

## 第二段（頁面 `/price/fx`）

不在這份計畫：等第一段的資料真的在 `fx-data` 累積後，先用真資料排 3–4 版做好的畫面截圖給使用者挑（spec「頁面」最後一點），
挑完再另寫 `docs/superpowers/plans/2026-10-1x-meso-fx-page.md`。
