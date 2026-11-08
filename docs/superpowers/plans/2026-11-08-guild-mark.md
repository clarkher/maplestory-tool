# 公會徽章模擬器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新頁 `/plan/guild`：挑底圖、圖案、兩套 16 色，即時看 8 倍大徽章與 1 倍實際大小，可隨機、下載 68×68 PNG、分享網址。

**Architecture:** 一支 Python 腳本從台服客戶端切出全部徽章格子，產一張帶內容雜湊的圖集 PNG＋一份 JSON 索引進 repo；頁面全在瀏覽器畫（CSS background-position 取圖集的格子、canvas 合成下載），狀態全寫在網址參數。

**Tech Stack:** Python 3.11＋UnityPy＋numpy＋Pillow（只在產資料時）；Next 16 App Router、React 19、Tailwind、vitest；驗收用 `scripts/verify/harness.mjs` 無頭 Chrome。

**Spec:** `docs/superpowers/specs/2026-11-08-guild-mark-design.md`

## Global Constraints

- 分支 `feat/v1.80-guild-mark`，commit 開頭 `v1.80:`；只進 dev（PR → dev），不上正式機。
- UI 不放 emoji；格子不寫名字，`aria-label` 寫「底圖 第 N 個」「動物 第 N 個」。
- 網頁標題「公會徽章」，副標「挑底圖、圖案和顏色，先看看公會徽章做出來長怎樣。」。
- 預設徽章 `b=1005&bc=10&m=2000&mc=2`。
- 不寫假公會名、不寫楓幣價格、不即時向 maplestory.io 要圖。
- 換網址用 `window.history.replaceState(null, "", …)`。
- 選中框用 `--maple`；按鈕字用 `--on-accent`；文字連結底線 `--ink-faint`。
- 數量：底圖 31、動物 21、植物 7、花紋 22、文字 36、其他 27；`00009026` 只有 1 色；其餘 16 色。

## Review Focus

1. 網址帶不合法值（`m=99999`、`bc=0`、`mc=17`、`b=abc`、圖案有、顏色沒有：`m=9026&mc=5`）→ 那一項退回預設或唯一顏色，頁面照畫，不報錯。（Task 2 測試）
2. 選了只有 1 色的 `9026` 再換回別的圖案 → 圖案顏色不卡在 1，維持使用者原本選的顏色。（Task 2 `pickMark` 測試）
3. 下載的 PNG 跟大徽章像素不一致（canvas 抗鋸齒、半格位移）→ 下載圖每 4×4 一塊同色、對得上圖集。（Task 5 驗收）
4. 手機 375 寬分類膠囊、色票、6 欄格子撐出橫向捲動 → 頁面 `scrollWidth <= 375`。（Task 5 驗收）
5. 圖集還沒載到時徽章卡高度跳 → 舞台固定高、格子固定方形，CLS 量到 0。（Task 5 驗收用 `page-cls.mjs` 的方法量一次）

---

### Task 1: 切圖腳本＋圖集＋索引

**Files:**
- Create: `scripts/client/guild-mark.py`
- Create（產出）：`public/assets/guild-mark/marks-<sha256 前 10 碼>.png`、`src/lib/guild-mark/marks.json`
- Test: `src/lib/guild-mark/__tests__/marks.test.ts`

**Interfaces:**
- Produces `src/lib/guild-mark/marks.json`：
  ```ts
  type MarkEntry = { id: number; row: number; colours: number[] }; // id 去掉前導 0（1005）；colours 1～16 有哪些
  type MarksJson = {
    atlas: string;            // "/assets/guild-mark/marks-xxxxxxxxxx.png"
    cell: 17;
    backgrounds: MarkEntry[]; // 31 個，row 0～30
    marks: Record<"Animal" | "Plant" | "Pattern" | "Letter" | "Etc", MarkEntry[]>; // row 接續 31 起
    bgSwatches: string[];     // 16 個 "#rrggbb"
    markSwatches: string[];   // 16 個 "#rrggbb"
  };
  ```
  圖集寬 16×17、高 (31+113)×17；第 row 列第 (顏色−1) 欄，每格已擺在 17×17 正確位置，沒有的顏色那格全透明。

- [ ] **Step 1: 寫測試 `marks.test.ts`**（讀 json 跟 png，PNG 寬高用 IHDR 讀，不加套件）
  - `backgrounds.length === 31`，id 從 1000 連到 1030；各分類長度 21／7／22／36／27，Animal 首個 2000、Etc 末個 9026。
  - 除了 9026 的 `colours` 是 `[1]`，其餘都是 1～16。
  - row 不重複、0～143 全用到。
  - `atlas` 檔案存在，IHDR 寬 272、高 2448；檔名雜湊等於檔案 sha256 前 10 碼。
  - 兩套色票各 16 個且符合 `/^#[0-9a-f]{6}$/`、兩套不完全一樣。
- [ ] **Step 2: 跑 `npx vitest run src/lib/guild-mark`**，預期 FAIL（檔案不存在）。
- [ ] **Step 3: 寫 `scripts/client/guild-mark.py`**（檔頭寫用法，照 `quickslot-font.py`）
  - 用法：`python -E -P scripts/client/guild-mark.py [客戶端資料夾，預設 D:/屁哥/maplestory_classic]`，寫出上面兩個檔並刪掉 `public/assets/guild-mark/` 裡舊的 `marks-*.png`。
  - 樹：呼叫 `node scripts/client/wzjs.mjs` 的 `decodeBody`（body 從原始資料 44 起）列出 `BackGround/*/*`、`Mark/*/*/*` 的 canvas 路徑（可另寫小 `.mjs` 輔助，放 `scripts/client/`）。
  - 切圖：從 0xe4 讀 2273 筆 `x,y,w,h`，`top = 1024 - y - h`。
  - 對照：maplestory.io `api/wz/GMS/83/UI/GuildMark.img/<路徑>` 答案卷快取在 `%TEMP%/guild-mark-gms/`；舊版圖裁透明邊後找台服差 0 那格，裁掉的左上角就是放進 17×17 的位置。
  - 檢查（不過就 `sys.exit`、不寫任何檔）：數量同 Global Constraints；每格都有差 0；2273 格全用到。
  - 色票：底圖取 `00001000` 每色 17×17 正中那點；圖案取文字分類第一個圖案每色出現最多的不透明顏色。
- [ ] **Step 4: 跑腳本，再跑 `npx vitest run src/lib/guild-mark`**，預期 PASS。打開圖集用眼睛看一次（每列一種、每欄一色）。
- [ ] **Step 5: Commit** `v1.80: 公會徽章圖集——台服客戶端切圖，對舊版答案卷 2,289 格全中`

### Task 2: 徽章狀態（網址、預設、顏色規則、隨機）

**Files:**
- Create: `src/lib/guild-mark/badge.ts`
- Test: `src/lib/guild-mark/__tests__/badge.test.ts`

**Interfaces:**
- Consumes: `marks.json`（Task 1）
- Produces:
  ```ts
  export type Category = "Animal" | "Plant" | "Pattern" | "Letter" | "Etc";
  export const CATEGORIES: { key: Category; label: string }[]; // 動物 植物 花紋 文字 其他
  export type Badge = { b: number; bc: number; m: number; mc: number };
  export const DEFAULT_BADGE: Badge;                        // {b:1005, bc:10, m:2000, mc:2}
  export function parseBadge(q: URLSearchParams): Badge;
  export function badgeQuery(x: Badge): string;             // "b=1005&bc=10&m=2000&mc=2"
  export function markEntry(id: number): { entry: MarkEntry; category: Category } | null;
  export function bgEntry(id: number): MarkEntry | null;
  export function pickMark(x: Badge, m: number, wanted: number): Badge; // wanted＝使用者目前選的圖案顏色
  export function shownColour(entry: MarkEntry, colour: number): number; // 沒這色就用它第一個色
  export function randomBadge(rand?: () => number): Badge;
  export function cellStyle(row: number, colour: number, scale: number): { backgroundImage: string; backgroundSize: string; backgroundPosition: string; width: number; height: number };
  ```
- [ ] **Step 1: 寫測試**
  - `parseBadge(new URLSearchParams(""))` 等於 `DEFAULT_BADGE`；`badgeQuery(DEFAULT_BADGE) === "b=1005&bc=10&m=2000&mc=2"`；parse(query(x)) 來回相等。
  - 不合法：`b=abc`→b 1005；`m=99999`→m 2000；`bc=0`、`bc=17`→10；`mc=17`→2；`m=9026&mc=5`→mc 1；其他項不受影響。
  - `pickMark({...DEFAULT_BADGE, mc:5}, 9026, 5).mc === 1`；再 `pickMark(那個, 2001, 5).mc === 5`（顏色記使用者要的，不卡 1）。
  - `randomBadge` 用固定種子跑 500 次：每次 `parseBadge(new URLSearchParams(badgeQuery(r)))` 等於 r（全部合法），且抽到過至少 4 個分類。
  - `cellStyle(31, 3, 8)`：width 136、backgroundPosition `"-272px -4216px"`、backgroundSize `"2176px 19584px"`。
- [ ] **Step 2: 跑 `npx vitest run src/lib/guild-mark`**，預期 FAIL。
- [ ] **Step 3: 實作 `badge.ts`**（`pickMark` 用 `wanted` 決定，畫面另記「使用者要的顏色」：URL 只存實際畫的顏色，`GuildSim` 把 wanted 放 state）。
- [ ] **Step 4: 跑測試**，預期 PASS。
- [ ] **Step 5: Commit** `v1.80: 公會徽章網址參數、預設、顏色規則、隨機`

### Task 3: 頁面 `/plan/guild`

**Files:**
- Create: `src/app/plan/guild/page.tsx`（照 `src/app/plan/avatar/page.tsx`：標題副標在 Suspense 外、`max-w-2xl`）
- Create: `src/app/plan/guild/GuildSim.tsx`（讀 `useSearchParams` → `parseBadge`，換東西 `replaceState(null, "", "/plan/guild?" + badgeQuery(x))`）
- Create: `src/app/plan/guild/BadgeCard.tsx`、`src/app/plan/guild/Picker.tsx`
- Create: `src/app/plan/guild/useGuildActions.ts`（下載、分享、toast，照 `useAvatarActions.ts` 的 `touchDevice`、2 秒 toast）
- Modify: `src/lib/site-pages.ts`（在紙娃娃那行下面加 `{ path: "/plan/guild", name: "公會徽章", what: "挑底圖、圖案和顏色，先看看公會徽章做出來長怎樣", priority: 0.6 }`）
- Modify: `src/lib/analytics.ts`（`EventName` 加 `"guild_download" | "guild_random"`；分享用既有 `share`，`page: "guild"`）
- Test: `src/lib/__tests__/analytics.test.ts` 若有列舉事件就補；site-pages 若有測試就跑過

**Interfaces:**
- Consumes: Task 2 全部匯出。
- Produces: 頁面 DOM 掛 `data-stage`（大徽章）、`data-actual`（1 倍）、`data-tab="bg|mark"`、`data-cat="Animal…"`、`data-swatch="1..16"`、`data-cell="<id>"`、`data-on`（選中），給 Task 5 驗收認。

- [ ] **Step 1: 畫面規格（照候選圖 A1、A2）**
  - 徽章卡：舞台固定高 190px 棋盤格底，大徽章 136×136（兩層 `cellStyle` 疊，`image-rendering: pixelated`）；「遊戲裡實際大小」＋深底小塊裡 17×17 一顆（不寫字）；三顆按鈕「隨機一個」「下載」「分享」（分享 primary）。
  - 挑選卡：分頁「底圖／圖案」預設底圖；底圖頁＝「底圖顏色」8×2 色票＋底圖 6 欄格子；圖案頁＝分類膠囊（`動物 21`…，可橫捲）＋「圖案顏色」色票＋圖案 6 欄格子。格子畫 2 倍、顏色用 `shownColour`。圖案頁色票：目前圖案沒有的顏色變淡、`disabled`。
  - 隨機一個：`randomBadge()`，分頁不換、分類跳到抽到的那個分類；`track("guild_random")`。
  - 下載：canvas 68×68、`imageSmoothingEnabled=false`、`drawImage(atlas, (c-1)*17, row*17, 17, 17, 0, 0, 68, 68)` 底圖再圖案，`toBlob` → `公會徽章.png`；`track("guild_download")`；圖集沒載到就 toast「圖還沒載好，等一下再按」。
  - 分享：手機 `navigator.share({ title: "公會徽章", url: location.href })`，其他複製連結 toast「已複製連結」；`track("share", { page: "guild", method })`。
  - `metadata`：title `公會徽章｜挑底圖、圖案、顏色先看成品`、description 寫隨機、下載、分享，`alternates.canonical: "/plan/guild"`。
- [ ] **Step 2: 寫 code、`npx tsc --noEmit` 過、`npm test` 過**
- [ ] **Step 3: 起 dev server（worktree 另開埠＋`--webpack`，見記憶）用內建瀏覽器 375 寬看一次**：預設徽章是藍條紋底＋橘老鷹、換色票整排格子跟著換、網址跟著變。
- [ ] **Step 4: Commit** `v1.80: 公會徽章頁——徽章卡＋挑選卡、隨機、下載、分享`

### Task 4: 入口與文件

**Files:**
- Modify: `src/components/route/AvatarShowcase.tsx`（`</section>` 外面多包一層：輪播底下一行置中小字 `<Link href="/plan/guild">做公會徽章</Link>`，13px、`ink-soft`、底線 `--ink-faint`；三個呼叫處的 className 隱藏規則要連這行一起套到——把 className 移到外層包裝）
- Modify: `src/app/plan/avatar/page.tsx`（副標下方或頁尾一行小字連結「也可以做公會徽章」，同樣式）
- Modify: `README.md`（紙娃娃那段後面加公會徽章段：資料來源、`scripts/client/guild-mark.py` 用法、圖集換檔名規則、入口；GA 事件表加 `guild_download`、`guild_random`，`share` 的 page 加 guild；`public/assets` 新檔不用改 `meta.json` builtAt——檔名帶雜湊）
- [ ] **Step 1: 改完跑 `npm test`、`npx tsc --noEmit`**
- [ ] **Step 2: 首頁 375 寬看：第一次來、存過角色兩種狀態，連結都在輪播正下方、只出現一次**
- [ ] **Step 3: Commit** `v1.80: 公會徽章入口（首頁輪播下、紙娃娃頁）＋README`

### Task 5: 驗收腳本＋實測

**Files:**
- Create: `scripts/verify/guild-shot.mjs`（用法照 `avatar-shot.mjs` 檔頭；埠 9621；任何一項沒過 exit 1）
- Modify: `scripts/verify/README.md`（列一行）

- [ ] **Step 1: 腳本逐項檢查**
  1. 一打開：大徽章、1 倍那顆都在，網址沒參數時畫預設（比對 background-position）。
  2. 換底圖顏色 → 6 欄格子全部換成那欄的 position，網址 `bc` 跟著變。
  3. 圖案頁點「其他」→ 9026 → 色票只剩 1 能按；再點動物第 2 個 → 顏色回到原本選的。
  4. 隨機 10 次：每次網址都合法（`parseBadge` 規則，腳本內重寫一份簡單檢查）且大徽章 position 跟網址一致。
  5. 下載：攔 `a.download` 的 blob，解成 68×68、每 4×4 同色、跟圖集對應兩格疊起來逐像素相同。
  6. 帶 `?b=1012&bc=3&m=5004&mc=7` 打開 → 畫的是那個；帶 `?m=99999&bc=0` → 退回預設。
  7. 375 寬 `scrollWidth <= 375`；CLS 為 0（開 4 倍 CPU 節流）。
  8. 首頁輪播下有「做公會徽章」，點了到 `/plan/guild`。
  9. 截圖 `guild-375.png`、`guild-mark-tab.png`、`guild-dark.png`、`guild-home.png`。
- [ ] **Step 2: 對本機 dev 跑過**，用眼睛看四張截圖，自己玩一輪記 ≥10 點優化意見。
- [ ] **Step 3: Commit** `v1.80: 公會徽章驗收腳本`
- [ ] **Step 4: rebase origin/dev → push → 開 PR 到 dev → `gh pr checks` 三條綠 → 合併 → 等測試機部署 → 對測試機網址再跑一次 `guild-shot.mjs` → 回報可點網址＋截圖**
