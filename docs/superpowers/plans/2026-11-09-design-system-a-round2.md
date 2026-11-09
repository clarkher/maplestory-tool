# 設計系統 A 第 2 輪 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans（使用者第 1 輪選「我自己做到底」，沿用）. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 A 套到攻略文（深色頁首、先講結論框、來源三色、電腦版目錄）、共用的頁尾／浮層／選項滑過，並把工具頁的實心橘選中改掉。

**Architecture:** 延續第 1 輪：token 名不動、只加少量新 token（`--float-shadow`、頁首固定深色那組）。選中樣式抽成一個共用常數，工具頁改用它；測試用掃檔擋回歸，跟 `no-pill.test.ts` 同一招。

**Tech Stack:** Next.js、Tailwind v4、vitest。

**Spec:** `docs/superpowers/specs/2026-11-09-design-system-a-design.md`（「元件長相」「審稿後補的決定」1、2、4、6）

## Global Constraints

- 版號 v1.95（v1.94 被 patch-notes 佔走）；只進 `dev`，不上正式機。
- 不改內容、文案、功能、網址、資料；只改長相。
- 小字對比 AA 4.5；夜晚 `--paper-edge` 對頁底 ≥2；按鈕字用 `--on-accent`；顏色寫 `#rrggbb` 或 `rgb(r g b / a)`。
- 攻略文：筆電 1280×720 第一屏看得到「先講結論」（`article-layout.mjs` 會量）。
- 頁首固定深色，淺色模式也一樣（拍板 4）。
- 來源標籤三色（拍板 6）：站上計算、遊戲資料＝藍；台服回報、社群整理＝金；舊版路線、官方公告＝灰。
- 不用 emoji、圖示庫。

## Review Focus

1. 淺色模式頁首：深色區塊裡的字、麵包屑、署名、寫手頭像，字色要跟著深色走，不能是深字疊深底。
2. 沒有主圖的攻略文（`images.hero` 不存在）：頁首要退回原本的標題樣式，不能出現一塊空的深色框。
3. 目錄錨點：每個連結要真的跳得到（區塊要有 id、`scroll-mt-header`），收合的段落也要算。
4. 工具頁選中改橘框後，原本靠「實心橘」區分的地方（例如分頁、開關）還分得出選中，開關照留實心。
5. 浮層陰影在深色模式要看得出來，淺色不能太髒。

---

### Task 1: 共用小修（浮層陰影、滑過、淡底、頁尾、殘留色）

**Files:** `src/app/globals.css`、`src/components/ChoiceGroup.tsx`、`src/components/FilterTag.tsx`、`src/components/MapPicker.tsx`、`src/app/plan/speed/Dialogs.tsx`、`src/app/plan/scroll/parts.tsx`、`src/components/DbBrowser.tsx`、`src/components/PqVisuals.tsx`、`src/components/SiteFooter.tsx`；測試 `src/lib/__tests__/global-css.test.ts`、`src/components/__tests__/choice-style.test.ts`

**Produces:** token `--float-shadow`（淺色、深色各一）；`src/components/option-style.ts` 匯出 `OPTION_ON`、`OPTION_OFF`（字串）

- [ ] 測試先寫：`--float-shadow` 兩個主題都有、不是 none；MapPicker／Dialogs／scroll 浮層用 `--float-shadow`；ChoiceGroup／FilterTag 沒選中的 hover 不出現 `hover:border-[color:var(--maple)]`；`--maple-wash` 淺色透明度 ≥0.1；全站 tsx 沒有 `rgb(60 30 10`
- [ ] 跑，紅
- [ ] 實作；抽 `option-style.ts`，ChoiceGroup、FilterTag 改用
- [ ] 頁尾照 A：上框線、小灰字、連結 hover 變深
- [ ] 跑 `npm test`，綠；commit `v1.95: 浮層陰影、選項滑過、淡底加深、頁尾`

### Task 2: 工具頁選中改橘框淡底

**Files:** HalloweenGuide、GuideContent、AvatarSim（分頁、尺寸鈕）、avatar/Picker、damage/KillCard、guild/Picker、pq/PqCommand（任務選擇）、scroll/parts、scroll/ScrollSim、speed/parts；測試 `src/lib/__tests__/no-solid-selected.test.ts`

**Consumes:** `OPTION_ON`、`OPTION_OFF`

- [ ] 測試先寫：全站 tsx 裡 `? "…bg-[color:var(--maple)]…text-[color:var(--on-accent)]` 這種條件式實心橘，同一行或上一行沒標「實心：」就算錯（主要按鈕、組隊格亮燈要標）
- [ ] 跑，紅（列出 11 處）
- [ ] 改用 `OPTION_ON`／`OPTION_OFF`；主要按鈕（AvatarSim primary、boss solid）、組隊格亮燈標「實心：」；開關、時間軸點不動
- [ ] 綠；commit `v1.95: 工具頁選中改成橘框淡底`

### Task 3: 來源標籤三色、先講結論框

**Files:** `src/components/JobArticleView.tsx`；測試 `src/lib/__tests__/job-article.test.ts`

- [ ] 測試改寫：`TAG_TONE` calc、game 用 sky；tw、community 用 gold；legacy、official 用 paper-deep＋ink-soft；每種對 paper 跟 glass 都 ≥4.5。結論框：有 `border-l-[3px]`、`--maple` 左線、底是 glass、條目編號 `01`、`02`，不再有 `--maple-wash` 底
- [ ] 紅 → 實作（`Lines` 加 numbered 版：兩位數編號、列間 1px 線；拿掉 solid） → 綠
- [ ] commit `v1.95: 來源標籤分三色、先講結論改左邊橘線＋編號`

### Task 4: 攻略文深色頁首

**Files:** `src/components/SeoPage.tsx`（加 `cover?: React.ReactNode`：有給就用深色頁首取代標題列）、`src/components/JobArticleView.tsx`、`src/app/globals.css`（`@utility force-dark`：區塊內把 ink 那組 token 換成深色值）；測試 `job-article.test.ts`、`global-css.test.ts`

- [ ] 測試先寫：有主圖時 h1 在 `force-dark` 區塊裡、圖 `fetchPriority="high"` 還在、圖高電腦版不超過 280px；沒主圖時沒有 `force-dark`；`force-dark` 把 `--ink`、`--ink-soft`、`--ink-faint`、`--paper-edge` 設成深色主題的值（跟 `[data-theme="dark"]` 同值）
- [ ] 紅 → 實作：圖鋪滿卡片寬（卡片 padding 用負 margin 吃掉）、往下漸層到 `--hero-bg`，標題、引言、署名壓在圖下緣 → 綠
- [ ] `article-layout.mjs` 量 5 篇（1280×720 看得到結論框、390 也是）
- [ ] commit `v1.95: 攻略文頁首改深色大圖、標題壓在圖上`

### Task 5: 電腦版本篇目錄

**Files:** `src/components/JobArticleView.tsx`；測試 `job-article.test.ts`

- [ ] 測試先寫：目錄列出「先講結論」「每個等級去哪裡」「幾下打死、打不打得中」跟每個段落標題，每個 href 的 id 頁面上都找得到；目錄只在 `lg` 以上顯示（`hidden lg:block`）、`sticky`
- [ ] 紅 → 實作（區塊補 id＋`scroll-mt-header`；lg 以上兩欄：內文＋右邊 200px 目錄） → 綠
- [ ] commit `v1.95: 攻略文電腦版右邊黏著本篇目錄`

### Task 6: 驗收、審查、交付

- [ ] `npm test`、contrast-audit（淺深 15 頁＋攻略文）、page-cls `--all`、nav-fit、article-layout
- [ ] 截圖：攻略文、/guides、算傷害、紙娃娃、衝卷，淺深 × 電腦手機
- [ ] fresh reviewer 看整條分支 → 修 Important → PR 進 dev → 三條綠 → 合併 → Workers Builds 成功 → 貼網址＋截圖
