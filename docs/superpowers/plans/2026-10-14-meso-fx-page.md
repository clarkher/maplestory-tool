# 楓幣匯率頁（v0.98 第二段）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/price/fx`「楓幣匯率」頁：用 fx-data 的真資料，照候選 A（看盤 App）版面、K 棒全部實心，查資料頁新開「行情」區連過去。

**Architecture:** 候選程式已在 worktree（未追蹤）的 `src/app/price/fx-candidates/`：`data.ts`（讀資料＋純函式）、`chart.tsx`（SVG 圖）、`Candidates.tsx`（讀資料、狀態、共用區塊）、`VersionA.tsx`（A 版面）。這份計畫把它們搬成正式檔：純函式進 `src/lib/fx/fx.ts`（先寫 vitest 測試）、畫面進 `src/app/price/fx/`，刪掉候選資料夾。

**Tech Stack:** Next.js 16 App Router、React 19、Tailwind 4、TypeScript、vitest 5。

**Spec:** `docs/superpowers/specs/2026-10-13-meso-fx-design.md`（「10/14 改版」「10/14 頁面拍板」兩節為準）

## Global Constraints

- 全繁體中文；**UI 禁用 emoji 與 icon 套件**，圖只用遊戲原圖（`/assets/meso/*.png`）或 inline SVG；寫完掃 U+2300–23FF、U+25A0–25FF、emoji，必須 0。
- 不准假資料：資料一律執行時讀 `https://raw.githubusercontent.com/clarkher/maplestory-tool/fx-data/fx/scania/{daily,latest}.json`；讀不到就顯示「讀不到匯率資料，等一下再過來」，不放任何數字。
- **K 棒全部實心**（漲、跌都實心，一整天沒變＝灰色短橫線）；色盲第二種區分靠文字：讀數、漲跌寫「漲／跌／持平」＋三角形 SVG，K 線下一行圖例「紅＝漲、綠＝跌、灰色短橫＝一整天沒變」。
- 漲跌色寫進 `src/app/globals.css` 變數（淺色線 `#e22a19`／`#25855b`、字 `#c41f10`／`#1f7550`；深色線 `#f53f2d`／`#389469`、字 `#ff7a68`／`#5cbf8f`），不拿 `--maple`／`--leaf` 當漲跌色。
- 兩種單位一樣大；文案講使用者拿得到什麼，不出現 fx-data、raw、JSON 等內部字。
- 不加 npm 套件；不准雙 Y 軸（K 線與掛單數分兩張圖）。
- commit 訊息 `v0.98 (n/4): …` 開頭、結尾空一行加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 測試：`node ../../../node_modules/vitest/vitest.mjs run <檔>`（PowerShell）；型別 `node ../../../node_modules/typescript/bin/tsc --noEmit -p .`（既有的 `@napi-rs/canvas`、`@neondatabase/serverless` 找不到不算）。
- Dev server 已在 http://localhost:3471（worktree，熱更新）。

---

### Task 1：純函式搬進 `src/lib/fx/fx.ts`（先寫測試）

**Files:**
- Create: `src/lib/fx/fx.ts`（從 `src/app/price/fx-candidates/data.ts` 搬：型別 Day/Daily/Latest/FxData、`loadFx`、`perYi`、`wanPerNtd`、格式化函式、`dayLabel`、`taipeiDate`、`movingAverage`、`daysUntil`、`Direction`、`Quote`、`quoteOf`、`candleDir`、`dayChange`、`Freshness`、`freshnessOf`、`BUCKET`、`LadderRow`、`ladderRows`、`ladderTotal`、`niceTicks`、`priceDomain`、`pinIndex`、`listingDays`、`REF_SITE`、`REF_NAME`、`sourceText`、`fmtInt`、`ladderHead`、`dirWord`；只搬 A 版會用到的，`headline`、`prevWord` 若 A 沒用就不搬）
- Test: `src/lib/fx/fx.test.ts`

- [ ] **Step 1：先寫 `src/lib/fx/fx.test.ts`**（用小的手做資料，值要手算過），至少涵蓋：
  - `perYi(300)` → 3333.3、`wanPerNtd(3333.3)` → 3（兩位小數）。
  - `movingAverage`：7 天、span 5 → 前 4 天 null、第 5 天起是前 5 天 close 平均；`daysUntil(7 天, 20)` → 13。
  - `candleDir`：close>open 漲、<跌、＝持平；`dayChange`：跟前一天 close 比的差、百分比、方向，第一天回 null。
  - `freshnessOf`：latest.t 距現在 30 分鐘、5 小時、13 小時 → 文字合理、13 小時 `stale: true`（門檻 12 小時）。
  - `ladderRows`：市價那一桶（ask100 所在的 10 萬寬桶）標 market；100 元換不到 200 萬的併成一列「更貴的」，筆數加總正確。
  - `niceTicks`、`priceDomain`：邊界包得住所有高低點與均線。
  - `quoteOf`：取最後一天 close 當報價、跟前一天比；只有一天時沒有漲跌。
- [ ] **Step 2：跑測試確認失敗**（`fx.ts` 不存在）。
- [ ] **Step 3：搬程式到 `src/lib/fx/fx.ts`**（照原樣搬，修測試抓到的錯；`loadFx` 的 `broken` 參數保留，給驗收腳本看讀不到的畫面）。
- [ ] **Step 4：跑測試確認通過**，再跑 tsc。
- [ ] **Step 5：Commit** `v0.98 (1/4): 楓幣匯率頁——資料與換算的純函式（讀匯率、均線、漲跌、更新時間、掛單檔位）加測試`

### Task 2：正式頁 `/price/fx`

**Files:**
- Create: `src/app/price/fx/page.tsx`（server：metadata、讀 `?pin=`、`?broken=1` 傳給 client）、`src/app/price/fx/FxPage.tsx`（client：讀資料、載入中／讀不到、A 版面）、`src/app/price/fx/chart.tsx`（從候選 chart.tsx 只搬 A 用到的：`Tri`、`Change`、`useWidth`、`xFrame`、`KChart`、`ListingsChart`、`DayReadout`、`MaLegend`、`toneText`；`Spark` 不搬）
- Modify: `src/app/globals.css`（漲跌色變數，淺色／深色兩組，取代候選 `FxStyle` 注入的 style）
- Delete: `src/app/price/fx-candidates/`（整個資料夾）

- [ ] **Step 1**：版面照 `VersionA.tsx`＋`Candidates.tsx` 的共用區塊（更新時間那行、怎麼算的），import 改成 `@/lib/fx/fx`。
- [ ] **Step 2**：**K 棒全部實心**：`KChart` 裡漲的空心矩形改成實心（跟跌同一種畫法，顏色不同）；K 線下面加一行圖例「紅＝漲、綠＝跌、灰色短橫＝一整天沒變」；拿掉候選裡所有「空心／實心」說明文字。
- [ ] **Step 3**：顏色變數搬進 `globals.css`（變數名沿用候選 `--fx-up`、`--fx-down`、`--fx-up-text`、`--fx-down-text` 等，深色兩種寫法都要跟站上既有深色區塊一致），刪掉 `FxStyle`。
- [ ] **Step 4**：metadata：title `楓幣匯率｜雪吉拉 1 億楓幣多少台幣、每天走勢`，description 寫白話（每 2 小時更新、8591 賣家開價由 maple-classic-wiki.pages.dev 整理、不是成交價），`alternates.canonical: "/price/fx"`。`?pin`／`?broken` 只給驗收用，頁面不顯示它們的存在。
- [ ] **Step 5**：刪 `src/app/price/fx-candidates/`；掃 emoji／U+2300–23FF／U+25A0–25FF＝0；tsc 無新錯。
- [ ] **Step 6**：瀏覽器打開 http://localhost:3471/price/fx 看手機 390、桌機 1280、深色都正常（十字線會動、讀不到資料 `?broken=1` 的畫面）。
- [ ] **Step 7：Commit** `v0.98 (2/4): 楓幣匯率頁 /price/fx——看盤 App 版面：報價、日 K（實心）＋5／20 日線、收盤掛單數、委賣檔位、怎麼算的；漲跌色進 globals.css`

### Task 3：入口（查資料「行情」區、導覽列亮哪顆、sitemap）

**Files:**
- Modify: `src/app/db/page.tsx`（「排行與規劃」之後新開 `<section aria-label="行情">`，標題「行情」，一張卡：`/price/fx`、標題「楓幣匯率」、說明「雪吉拉 1 億楓幣現在值多少台幣、每天怎麼變」、圖 `/assets/meso/bag.png`，卡片樣式照同頁 TOOLS 那種）
- Modify: `src/lib/nav.ts`（查資料的 `match` 加 `"/price"`；檔頭註解補一句）
- Modify: `src/app/sitemap.ts`（加 `{ path: "/price/fx", priority: 0.7 }`）
- Test: 若 `src/lib/nav` 有既有測試（搜 `activeNav`），加一條 `/price/fx` → 「查資料」；沒有就新增 `src/lib/__tests__/nav.test.ts` 一條。

- [ ] 先寫導覽列測試 → 失敗 → 改 nav.ts → 通過；改 db page、sitemap；tsc；瀏覽器看 /db 有「行情」區、點進去導覽列亮「查資料」。
- [ ] Commit `v0.98 (3/4): 楓幣匯率頁入口——查資料新開「行情」區、/price 開頭亮「查資料」、加進 sitemap`

### Task 4：驗收腳本與說明

**Files:**
- Create: `scripts/verify/fx-shot.mjs`（從 scratchpad 的 `fx-shot.mjs` 改成只截正式頁：手機 390、桌機 1280、手機深色、`?broken=1`；埠預設 9481；用 `./config.mjs`、`./harness.mjs`）
- Modify: `scripts/verify/README.md`（加一段：用法、輸出、埠 9481）、`README.md`「## 楓幣匯率收集」那節加一行頁面網址 `/price/fx`

- [ ] 跑一次腳本，截圖打開看過；Commit `v0.98 (4/4): 楓幣匯率頁驗收腳本 fx-shot.mjs（手機、桌機、深色、讀不到資料）與說明`
