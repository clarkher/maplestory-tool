# 設計系統 A 第 4 輪 Implementation Plan（查資料）

> 沿用 superpowers:executing-plans（使用者第 1 輪選「我自己做到底」）。

**Goal:** 查資料入口 `/db` 跟單筆頁（怪物、道具、任務、技能、地圖、NPC 共用 `SeoPage`）照候選圖 `A-db.png`、`A-mob.png` 收尾。

**Spec:** `docs/superpowers/specs/2026-11-09-design-system-a-design.md`（範圍第 4 項；「審稿後補的決定」2：刷怪點長條、電腦版出沒地圖／掉落物兩欄做，掉落物黃框跟怪物頁新按鈕不做）

## Global Constraints

- 版號 v1.99；只進 `dev`。不改內容、功能、網址、資料。
- 圖示只用遊戲真圖（候選圖的「怪、道」字方塊是佔位）。

## Review Focus

1. 數值格最後一排沒排滿時不能出現一塊灰底；道具頁兩三格不能在電腦版留一排空格。
2. 刷怪點沒有數字的地圖（spawns 是 null）不能畫 0 長條。
3. 長的值（「普通（6）」「劍士」）在手機兩欄放得下、不擠出格子。
4. `SeoLinks` 滑過不再出橘框（第 2 輪「滑過不出橘框」）。
5. 小標 12px ink-faint 對比要過 AA。

### Task 1：入口頁、SeoPage 共用元件、怪物頁
- 測試 `src/lib/__tests__/db-design-a.test.ts`：入口清單卡、不再上浮、小標字距；`SeoStats` 標籤在上數字在下、accent、1px 線、6 欄條件；`SeoBars` 比例；怪物頁用長條＋兩欄
- 實作：`src/app/db/page.tsx`（圖鑑橫卡、`EntryList`）、`src/components/SeoPage.tsx`（圖框、小標、`SeoStats`、`SeoBars`、`SeoLinks` 滑過）、`src/app/db/monsters/[id]/page.tsx`
- commit `v1.99: 查資料入口橫卡＋清單卡、單筆頁數值格、刷怪點長條、怪物頁兩欄`

### Task 2：驗收、交付
- `npm test`、contrast-audit（加單筆頁）、page-cls `--all`、nav-fit；截圖淺深 × 電腦手機
- fresh reviewer → PR 進 dev → 三條綠 → 合併 → Workers Builds → 貼網址
