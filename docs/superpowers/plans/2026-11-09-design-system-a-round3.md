# 設計系統 A 第 3 輪 Implementation Plan（首頁）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans（使用者第 1 輪選「我自己做到底」，沿用）.

**Goal:** 首頁（第一次來、存過角色）跟紙娃娃輪播照候選圖 `docs/design-candidates/A-home.png` 收尾。

**Spec:** `docs/superpowers/specs/2026-11-09-design-system-a-design.md`（範圍第 3 項、「元件長相」）

## Global Constraints

- 版號 v1.97（origin/dev 最新 v1.96（別支 session 佔走）、開著的 PR 沒有 v1.97）；只進 `dev`。
- 不改內容、功能、網址、資料；只改長相。唯一新字：清單入口「做公會徽章」底下一行說明（照候選圖）。
- 重點色只有橘；主要按鈕實心，次要按鈕透明底＋框。
- 存過角色硬重新整理不能跳（`[[data-profile=saved]_&]:invisible` 那套照留）。

## Review Focus

1. 存過角色的人硬重新整理：入口清單卡在 React 接手前要藏著（invisible），不然會被推。
2. 萬聖節 11/11 過後清單只剩兩列，不能留一條空的分隔線。
3. `GoButton` 全站 15 處一起變框線，工具頁上的「帶我去」要還看得出是按鈕、對比過。
4. 能力值格：主屬性跟副屬性改框線後還分得出誰是主的。
5. 技能條頁首不再實心橘，字色要跟著卡片（深色、淺色都要過對比）。

### Task 1: 輪播、入口清單
- 測試：輪播沒有 `--gold-wash` 底、圖跟下面那列之間有 1px 線、不再有公會連結；首頁有一張 `divide-y` 的入口清單卡，裡面是萬聖節、未來視、做公會徽章
- 實作：`AvatarShowcase` 改卡片底；`RouteHome` 新增 `HomeLinks`；`scripts/verify/guild-shot.mjs` 改找清單那列
- commit `v1.97: 首頁輪播改卡片底、入口收成一張清單`

### Task 2: 橘色收斂
- 測試：`GoButton` 沒有實心橘、有橘框；技能條頁首不是實心橘、左邊 3px 橘線；能力值主屬性是橘框淡底；`CharacterBar` 初心者鈕不是虛線
- commit `v1.97: 首頁去哪練按鈕、技能條、能力值格改橘框`

### Task 3: 驗收、交付
- `npm test`、contrast-audit、page-cls `--all`、home-first-frame、nav-fit；截圖淺深 × 電腦手機 × 第一次來／存過角色
- fresh reviewer → PR 進 dev → 三條綠 → 合併 → Workers Builds → 貼網址
