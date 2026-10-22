# 頁尾資料日期＋三轉洗點卷那句（v1.12）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** 使用者 10/22 拍板 1A：頁尾「資料更新」改寫我們實際抓上游資料的時間（`meta.json` 的 `ingest.fetchedAt`），不再寫上游的產生時間（上游只改內容時它不會動）；2B：開機後查三轉洗點卷、改 12 個三轉頁那句，再跟 v0.46、v1.11 一起發版。

**Spec:** `docs/superpowers/specs/2026-10-22-guides-followup-design.md`（最後的「第二輪」節）

## Global Constraints
- 繁體中文、不用 emoji；commit `v1.12: …` 開頭，結尾空一行加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`；分支 `feat/v1.12-footer-fetch-date`（從 origin/dev 開好了）；只 commit 不 push。
- 研究檔是 `JSON.stringify(x, null, 2) + "\n"` 格式，node 改、斷言剛好出現次數。暫存放 scratchpad。

### Task 1: 頁尾跟首頁說明的資料日期改寫抓資料的時間

**Files:** `src/components/SiteFooter.tsx`（約 27–30 行「遊戲版本 … · 資料更新 …」）、`src/components/route/RouteHome.tsx`（約 268 行「遊戲資料：版本 X（日期）」）、共用的時間格式化（先找 `src/lib/` 有沒有現成把 ISO 轉台灣時間的函式，沒有就加一個純函式並測）、對應測試、README 若有寫頁尾日期的來源要跟著改。

- [ ] **Step 1: 失敗的測試**：純函式（例 `dataSyncedText(meta)`）：`ingest.fetchedAt` 是 `2026-10-22T04:08:50.511Z` → `2026-10-22 12:08`（台灣時間，24 小時制）；沒有 `ingest` 或格式不對 → 退回 `dataGeneratedAtText`（舊行為）；兩個都沒有 → 空。
- [ ] **Step 2–4**：實作、兩處畫面改用它（頁尾仍寫「資料更新 <時間>」；首頁那句括號裡寫日期 `YYYY-MM-DD`，照原本 slice(0,10) 的長度）；`npx tsc --noEmit -p tsconfig.json`、相關 vitest、全套 `npm test`。
- [ ] **Step 5: Commit**：`v1.12: 頁尾的資料日期改寫實際抓資料的時間——上游只改內容不改產生時間時，日期也會跟著動`

### Task 2: 三轉洗點卷那句（第 3 項）

依 10/22 開機後查到的結果改 12 個三轉頁（111、121、131、511、521、311、321、411、421、211、221、231）`notes[0]` 的「10/19 查：三轉技能重置卷只有菇菇通行證 S2 的新角色 70 等高級獎勵有，舊角色還買不到，點錯沒得洗。」（文字由 controller 依查證結果給定）。`npm run data:guides`、全套 `npm test`。Commit：`v1.12: 三轉洗點卷那句更新到 10/22 開機後`
