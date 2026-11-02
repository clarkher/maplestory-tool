# 組隊指揮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (使用者先前流程：小功能 Native 執行＋最後一次全分支審查).

**Goal:** 新頁 `/plan/pq`：三個組隊任務一關一張卡，可切關、試組合、複製喊話，進度存在這台電腦。

**Architecture:** 內容是靜態 TS（`src/lib/pq-command/data.ts`），組合邏輯純函式（`combo.ts`），存檔解析純函式＋hook（`store.ts`），頁面 client component（`src/app/plan/pq/PqCommand.tsx`），圖解重用 `src/app/guide/PqVisuals.tsx`。

**Tech Stack:** Next 16 App Router、Tailwind v4、vitest。

**Spec:** `docs/superpowers/specs/2026-11-02-pq-command-design.md`

## Global Constraints
- 繁中、禁 emoji、狀態用文字或 inline SVG；按鈕字用 `--on-accent`；文字連結底線 `--ink-faint`。
- 女神整個任務標「參考舊版攻略，經典版可能不一樣，以遊戲裡為準」。
- 新頁加 `src/lib/site-pages.ts`；不進導覽列。
- commit 以 `v1.31:` 開頭。

## Review Focus
- localStorage 壞資料／舊版本格式 → 回預設不壞頁。
- 試組合走到最後一組再按「不對」→ 顯示「全部試過了」不當掉。
- 名字欄空白、只填部分 → 喊話用「站 N 號的人」。
- 剪貼簿被擋（http、iframe）→ 反白那行。
- `?pq=` 亂填 → 用上次的或月妙。

### Task 1: combo.ts（TDD）
- `combos(n: number, k: number): number[][]`（1-based、字典序）
- `moves(prev: number[], next: number[]): Array<[from: number, to: number]>`（離開位置與新位置各自小到大配對）
- `comboSay(spec, prev|null, next, names: string[], assign: number[]): string`
- 測試：6 挑 3 共 20、首 [1,2,3]、尾 [4,5,6]；moves([1,2,3],[1,2,4]) = [[3,4]]；moves([1,2,6],[1,3,4]) = [[2,3],[6,4]]；名字帶入；沒名字寫「站 3 號的人」；拉桿喊話。

### Task 2: store.ts（TDD）
- `parsePqState(raw: string | null): PqState`、`resetPq(state, key)`；hook `usePqState()`。
- 測試：null、壞 JSON、未知任務、關卡超出範圍、名字超過 6 個、組合 index 超出 → 各自回預設。

### Task 3: data.ts＋內容測試
- 三個任務、每關 todo≥1、lines≥1、combo 關的 n/k 對、喊話無 emoji、每行 ≤ 60 字。

### Task 4: 頁面＋入口
- `/plan/pq` page.tsx（metadata、canonical）、PqCommand.tsx。
- `/guide` 月妙、超綠段落加「隊長指揮」連結；首頁 `NowCard` PqCard 加連結；site-pages 加一列。

### Task 5: 驗收
- `npm test`、`npx tsc --noEmit`、`next build`；無頭 Chrome 手機／電腦、深淺截圖，操作流程截圖。
