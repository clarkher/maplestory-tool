# 改版整理 /updates 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做 `/updates`（改版紀錄，每版一張卡）跟 `/updates/<版本>`（單版重點頁），差異從上游 git 歷史各版用現在的 `build.mjs` 重建後比對，重點由人審過的 md 檔提供。

**Architecture:** 管線端：`build.mjs` 可以改輸入輸出位置 → `build-patch-base.mjs` 把任一上游 commit 重建到暫存資料夾 → `lib/patch-diff.mjs` 純函式比兩份資料 → `build-patch.mjs` 寫 `public/data/patches/<版本>.json` 和 `index.json`；資料自動更新每次重算目前版本。網站端：`src/lib/patches.ts` 建置時讀差異檔＋`src/content/patches/<版本>.md` 重點檔，沒重點檔的版本不出現；兩個靜態頁＋攻略專區一張卡。

**Tech Stack:** Node 22 ESM（`node --test`）、Next.js App Router 靜態產生、vitest、設計系統 A 的 CSS token。

**Spec:** `docs/superpowers/specs/2026-11-09-patch-notes-design.md`（候選圖 `docs/superpowers/specs/assets/2026-11-09-patch-notes/A.png`、`D.png`）

## Global Constraints

- 版號 **v1.94**（11/09 dev 到 v1.92、開著的 PR 佔 v1.93）。每個 commit 訊息 `v1.94: …`；開 PR 前再 `git fetch` 看一次 main、dev、開著的 PR 有沒有人佔走，被佔就整串改下一號。
- 分支 `feat/v1.94-patch-notes`（已建，base 是 `origin/dev`）→ PR 到 `dev`。**不合 main、不上正式機**。
- 比對基準：每個 gameVersion 取「上游 `data.js` 最後一個是那個版本的 commit」；兩邊都用現在的 `build.mjs` 重建。不准直接比 `public/data` 的 git 歷史。
- 字串照抄：
  - 免責：「比的是更新前後的遊戲資料，不是官方公告；什麼時候開放、怎麼拿到，以遊戲內為準。」
  - 不見的一律叫「站上不再列出」，說明那行：「這些在新資料裡找不到，多半是還沒開放的地區；不代表遊戲裡刪掉了。」
  - 來源標籤「客戶端資料」用 `--sky`／`--sky-wash`。
- 「改了」只收道具，只收五類欄位：`d`→說明、`sp`／`price`→商店、`dm`→掉落、`eq`→能力、`n`→名稱。`qr`、`qq`、`un`、`c`、`sh` 不收也不計數。
- 新增道具：子分類 `外觀/角色`（髮型臉型）只計數不列。
- 日期：版本第一個上游 commit 的日期，畫面寫「M/D 收錄」；重點檔有 `date` 就用它、不寫「收錄」。
- 頁面標題、說明、攻略卡都要有「楓之谷經典版」。
- 設計系統 A：實心卡＋1px `--paper-edge` 框、卡片 `var(--radius-card)`、標籤 4px、選中＝橘框＋`--maple-wash`。**不准 `rounded-full` 膠囊**（`no-pill.test.ts` 擋）、不准實心橘選中、不准 emoji／圖示庫。
- 改了 `public/data` 要一起改 `public/data/meta.json` 的 `builtAt`（`scripts/check-data-version.mjs` 在 PR 擋）。
- 差異檔只讓 `/updates` 相關頁讀，不進首頁、不進 `static-data.ts` 的全站共用載入。
- 不從客戶端另抽、不手補資料裡沒有的東西；重點檔每條都要在差異檔找得到依據。

## Review Focus

- **上游舊 commit 的格式吃不下**（早期沒有拆檔、欄位不同）：`build-patch-base` 要丟出寫明 commit 的錯誤，回填腳本跳過那一版並列在輸出裡，不能整個停掉或產出半份資料。→ Task 4 測試。
- **同一道具一次改好幾類**（說明＋商店都改）：要拆成好幾列、各算一次類別篩選，總數「改了 N」算道具數不是列數。→ Task 2 測試。
- **重點檔寫了差異檔裡沒有的道具 id**、或版本號對不到差異檔：建置要紅，不能默默畫出壞圖。→ Task 6 測試。
- **只有一個版本有重點檔**時，版本選單、`/updates` 的「最新那張橘框」、上一版連結都不能壞。→ Task 6、7 測試。
- **資料自動更新跑在 gameVersion 沒變的修正上**：要重算同一版、不能把「前一版」誤認成自己（基準＝自己 → 差異全空）。→ Task 4 測試。

---

### Task 1: `build.mjs` 可以改輸入、輸出位置

**Files:**
- Create: `pipeline/lib/build-paths.mjs`
- Test: `pipeline/lib/build-paths.test.mjs`
- Modify: `pipeline/build.mjs:38-40`（`ROOT`／`RAW`／`OUT`）、`:98`（讀 artale.json）、`:124-127`（`copyMissingFrames`）

**Interfaces:**
- Produces: `buildPaths(env: Record<string,string|undefined>, root: string) -> { artaleFile: string, rawDir: string, outDir: string, writeAssets: boolean }`。
  環境變數 `MAPLE_ARTALE_FILE`（artale.json 路徑）、`MAPLE_DATA_OUT`（輸出資料夾）。有設 `MAPLE_DATA_OUT` 時 `writeAssets === false`。
  `v83-maps.json`、`msio-maps.json`、`data/client/*`、`data/upstream-fallback/*` 照舊從 repo 讀。

- [ ] **Step 1: 寫失敗測試** `build-paths.test.mjs`：
  - 沒設變數 → `artaleFile === path.join(root,"data","raw","artale.json")`、`outDir === path.join(root,"public","data")`、`writeAssets === true`
  - 設 `MAPLE_DATA_OUT=/tmp/x` → `outDir === path.resolve("/tmp/x")`、`writeAssets === false`
  - 設 `MAPLE_ARTALE_FILE=/tmp/a.json` → `artaleFile === path.resolve("/tmp/a.json")`，`rawDir` 不變
- [ ] **Step 2:** `node --test pipeline/lib/build-paths.test.mjs` → FAIL（模組不存在）
- [ ] **Step 3:** 實作 `buildPaths`，`build.mjs` 改用它；`writeAssets` 為 false 時跳過 `copyMissingFrames`（`imageIds` 讀 `public/assets` 照舊，只讀不寫）。
- [ ] **Step 4:** 測試 PASS；再跑一次 `node pipeline/build.mjs`（要有 `data/raw/artale.json`，沒有就照記憶「上游資料改版會漏抽欄位」的稀疏 clone 法產），`git status public/data` 應該沒有差異（有差的話只能是建置時間這類每次都會變的欄位）。
- [ ] **Step 5:** commit `v1.94: build.mjs 可以指定資料來源跟輸出資料夾（改版比對要重建舊版本）`

### Task 2: 比對純函式 `patch-diff.mjs`

**Files:**
- Create: `pipeline/lib/patch-diff.mjs`
- Test: `pipeline/lib/patch-diff.test.mjs`（小型假資料就地寫在測試裡）

**Interfaces:**
- Consumes: 兩份 `build.mjs` 輸出的物件 `{ items: Item[], quests: Quest[], monsters: Monster[], maps: Record<string,MapRec> }`
- Produces:
  ```ts
  type PatchDiff = {
    counts: { items: number; looks: number; quests: number; monsters: number; maps: number; changed: number; goneItems: number; goneQuests: number };
    added: { items: {id,n,c,s,lv?}[]; quests: {id,n,cat,minLv?,area?}[]; monsters: {id,n,lv}[]; maps: {id,zh,st}[] };
    changed: { id: number; n: string; kind: "說明"|"商店"|"掉落"|"能力"|"名稱"; before: string; after: string }[];
    gone: { items: {id,n}[]; quests: {id,n}[] };
  }
  diffPatch(oldData, newData) -> PatchDiff
  ```
  `area` 用任務的 `cat`（站上任務分類，例「冰原雪域」），`minLv` 照 `quests.json` 的 `minLv`。

- [ ] **Step 1: 寫失敗測試**，至少這幾個：
  - 新 id 進 `added.items`；`s === "外觀/角色"` 的不進清單、只加 `counts.looks`
  - 舊有新沒有 → `gone.items`；任務同理 → `gone.quests`
  - 只有 `qr`、`qq`、`un`、`c`、`sh` 變 → 不進 `changed`、`counts.changed` 不加
  - `d` 從「…各 1500 。」變「…各 1200 。」→ 一列 `kind:"說明"`，`before`／`after` 是全文
  - 同一件 `d` 和 `sp` 都變 → 兩列，`counts.changed === 1`
  - `sp` 前後 → `before`／`after` 是可讀字串：每家店「店名 價錢」用「、」接，沒有寫「沒賣」（例：沒賣 → 商城 100）
  - `dm` → 怪名用「、」接（怪名從同一份資料的 `monsters` 查，查不到寫怪 id）
  - `eq` → 用 `src/lib/item-view.ts` 的同一套欄位名（例「物攻 48」），沒變的欄位不列
  - `maps` 是物件，以 key 當 id
- [ ] **Step 2:** `node --test pipeline/lib/patch-diff.test.mjs` → FAIL
- [ ] **Step 3:** 實作。`eq` 欄位名：把 `item-view.ts` 的對照表搬成 `pipeline/lib` 也能 import 的 `.mjs`（或在 `.mjs` 裡另放一份並加一條測試比對兩邊 key 一致），擇一，不要兩份各自漂。
- [ ] **Step 4:** PASS
- [ ] **Step 5:** commit `v1.94: 改版比對——新增、改了、站上不再列出（只收看得懂的欄位）`

### Task 3: `build-patch.mjs` 寫差異檔與索引

**Files:**
- Create: `pipeline/build-patch.mjs`、`pipeline/lib/patch-index.mjs`
- Test: `pipeline/lib/patch-index.test.mjs`、`pipeline/build-patch.test.mjs`（用 `os.tmpdir()` 下兩個小資料夾）

**Interfaces:**
- Consumes: `diffPatch`（Task 2）
- Produces:
  - CLI：`node pipeline/build-patch.mjs --old <資料夾> --new <資料夾> --out <資料夾> --version <新版> --prev <舊版> --base <上游 commit> --head <上游 commit> --date <YYYY-MM-DD>`
  - 寫 `<out>/<版本>.json` ＝ `{ version, prev, base, head, date, ...PatchDiff }`
  - `upsertIndex(index, entry) -> Index`：`index.json` ＝ `{ versions: { version, prev, base, head, date, counts }[] }`，依 `date` 新到舊；同版本號整筆換掉
  - 版本號只收 `^[0-9A-Za-z.+-]{1,32}$`（跟 data-refresh 同一個規則），不符就丟錯、不寫檔

- [ ] **Step 1: 失敗測試**：`upsertIndex` 新增、取代同版本、排序；CLI 跑完兩個檔都在、`counts` 等於 `diffPatch` 的；版本號 `"../x"` 丟錯且沒寫檔。
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 實作（讀 `items.json`、`quests.json`、`monsters.json`、`maps.json` 四個檔；`writeJson` 用 `pipeline/lib/http.mjs` 那支，緊湊格式）
- [ ] **Step 4:** PASS
- [ ] **Step 5:** commit `v1.94: 改版差異檔與索引（public/data/patches）`

### Task 4: 上游版本邊界＋重建任一版（`build-patch-base.mjs`）

**Files:**
- Create: `pipeline/lib/upstream-history.mjs`、`pipeline/build-patch-base.mjs`
- Test: `pipeline/lib/upstream-history.test.mjs`（在 `os.tmpdir()` 用 `git init` 做一個假上游：幾個 commit，`data.js` 帶不同 `gameVersion`）

**Interfaces:**
- Consumes: `UPSTREAM_PARTS`、`readUpstream`、`parseUpstreamScript`（`pipeline/lib/upstream.mjs`）；`buildPaths` 環境變數（Task 1）
- Produces:
  - `versionAt(gitDir, commit) -> string | null`：讀那個 commit 的 `data.js` metadata `gameVersion`（只讀 `data.js`，不讀其他五個檔）
  - `versionTimeline(gitDir, { since?: string }) -> { version, first: {commit,date}, last: {commit,date} }[]`：沿 `git log --format=%H %cs -- data.js`（新到舊）分段，舊到新回傳
  - `previousVersion(timeline, version) -> entry | null`：基準永遠是**不同版號**的前一段；傳入的版本就是最舊那段時回 `null`
  - `buildAt(gitDir, commit, outDir)`：把 `UPSTREAM_PARTS` 那幾個檔 `git show <commit>:<file>` 到暫存資料夾 → `readUpstream` → 寫暫存 `artale.json` → `spawnSync(node, ["pipeline/build.mjs"], { env: { MAPLE_ARTALE_FILE, MAPLE_DATA_OUT: outDir } })`；必要檔缺或 build 失敗就丟 `Error("上游 <commit 前 8 碼> 重建失敗：<原因>")`
  - CLI：`node pipeline/build-patch-base.mjs --upstream <git 資料夾> --commit <sha> --out <資料夾>`

- [ ] **Step 1: 失敗測試**：假上游 5 個 commit 版本 `1.0 1.0 1.1 1.1 1.1` → timeline 兩段、`last` 對；`previousVersion(t,"1.1").version === "1.0"`；`previousVersion(t,"1.0") === null`；同版修正（最新 commit 仍 1.1）時前一版仍是 1.0；`buildAt` 遇到缺 `items-data.js` 的 commit 丟出含 commit 前 8 碼的錯。
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 實作。`git` 一律 `execFileSync` 帶陣列參數，commit 只收 `^[0-9a-f]{7,40}$`。
- [ ] **Step 4:** PASS
- [ ] **Step 5:** commit `v1.94: 找上游每一版的頭尾 commit、把任一版重建到暫存資料夾`

### Task 5: 回填歷史版本（產真資料）

**Files:**
- Create: `pipeline/backfill-patches.mjs`（開頭寫用法）
- Create（產出）: `public/data/patches/<版本>.json` 多份、`public/data/patches/index.json`
- Modify: `public/data/meta.json`（`builtAt`）、`README.md`（資料管線段落加一行「改版差異檔」用法）

**Interfaces:**
- Consumes: Task 3、4 全部
- Produces: 上游每個可重建版本的差異檔（第一個版本沒得比，不產）

- [ ] **Step 1:** 上游完整 clone 到 `data/cache/upstream-history`（`git clone --filter=blob:none`，不要動 `data/cache/upstream`）。
- [ ] **Step 2:** 實作 `backfill-patches.mjs --upstream <資料夾>`：`versionTimeline` → 每段 `last.commit` 用 `buildAt` 建到 `data/cache/patch-base/<版本>` → 相鄰兩段跑 `build-patch`（`date` 用新那段的 `first.date`）。重建失敗的版本印「跳過 <版本>：<原因>」繼續。結束印每版 `counts`。
- [ ] **Step 3:** 跑（`timeout 3000`，或 `run_in_background`），把輸出貼進 commit 訊息。
- [ ] **Step 4:** 抽查 2.0.0：`月亮花糕點`（2022356）在 `changed` 有一列說明 1500→1200；`冰窖椅`（3010049）說明 HP 20 → HP 40、MP 30；`gone.quests` 有任務 6931（記憶「verify:db 期望值過時」那批）。對不上要查原因，不准改測試迎合。
- [ ] **Step 5:** 改 `meta.json` 的 `builtAt`；`node scripts/check-data-version.mjs` 過；`npm test` 全綠。
- [ ] **Step 6:** commit `v1.94 (data): 回填 X 個版本的改版差異（上游各版用現在的程式重建後比對）`，訊息列每版數字與跳過的版本。

### Task 6: 網站讀差異檔＋重點檔（`src/lib/patches.ts`）

**Files:**
- Create: `src/lib/patches.ts`、`src/lib/__tests__/patches.test.ts`
- Create: `src/content/patches/`（Task 10 才放檔；這裡測試用 `os.tmpdir()`）

**Interfaces:**
- Consumes: `public/data/patches/*.json`（Task 3 格式）；重點檔 front matter 用 `guide-markdown.ts` 的 `---` 區塊寫法（`key: value`，`highlights` 另用下面格式）
- 重點檔格式（`src/content/patches/<版本>.md`）：
  ```
  ---
  title: 萬聖節祭典、冰原雪域任務
  date: 2026-10-15            （可省略）
  ---
  - 4310522 | 萬聖節「雪原的面具祭典」 | 83 個活動任務、萬聖節硬幣換道具
  ```
  本文每行一條重點：`道具 id | 標題 | 小字`，剛好 4 行。
- Produces:
  ```ts
  type Highlight = { icon: number; title: string; sub: string };
  type PatchPage = PatchFile & { title: string; highlights: Highlight[]; dateText: string /* "10/15" 或 "10/15 收錄" */; officialDate: boolean };
  listPatchPages(opts?: { dataDir?: string; contentDir?: string }) -> PatchPage[]   // 只回有重點檔的，新到舊
  getPatchPage(version: string, opts?) -> PatchPage | null
  patchProblems(page: PatchPage) -> string[]   // 空陣列＝沒問題
  cardIcons(page: PatchPage, has: (id:number)=>boolean) -> number[]  // 6 個：先 highlights 的 icon，再補 added.items（有圖、去重）
  ```
- `patchProblems` 要抓：重點不是 4 條；`icon` 不在 `added.items` 也不在 `changed`；`title` 沒填。

- [ ] **Step 1: 失敗測試**：沒重點檔的版本不在 `listPatchPages`；`getPatchPage("不存在") === null`；`dateText` 兩種；`patchProblems` 三種錯各一個案例；`cardIcons` 補滿 6 個、重點 icon 排前面、不重複、`has` 為 false 的跳過；只有一個版本時 `listPatchPages().length === 1`。外加一條真資料測試：`listPatchPages()` 每一頁 `patchProblems` 都是空（Task 10 之前回空陣列也算過）。
- [ ] **Step 2:** `npx vitest run src/lib/__tests__/patches.test.ts` → FAIL
- [ ] **Step 3:** 實作（`fs` 只在伺服器端讀；檔頭註解寫格式）
- [ ] **Step 4:** PASS
- [ ] **Step 5:** commit `v1.94: 網站讀改版差異與重點檔（沒寫重點的版本不出現）`

### Task 7: `/updates` 改版紀錄頁（候選 D）

**Files:**
- Create: `src/app/updates/page.tsx`、`src/app/updates/PatchCard.tsx`
- Modify: `src/lib/nav.ts`（`/updates` 開頭也亮「攻略」）、對應的 nav 測試

**Interfaces:**
- Consumes: `listPatchPages`、`cardIcons`（Task 6）；`itemIcon` 路徑 `/assets/items/<id>.png`（`src/lib/asset-paths.ts`）

- [ ] **Step 1: 失敗測試**（nav 測試加一條）：`/updates`、`/updates/2.0.0` 亮「攻略」。
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 實作頁面，照 `D.png`：麵包屑「攻略 › 改版整理」（「攻略」連 `/guides`）、h1「改版紀錄」、說明「每次遊戲更新多了什麼，照時間排。」；每版一張卡（第一張日期橘色＋卡片橘框）：日期、版本號標籤、重點檔 `title`、一行「新道具 N、新任務 N、新怪物 N（怪名，最多 4 個）」、6 格圖、「看這次改了什麼 ›」連 `/updates/<版本>`；最下面免責。`metadata` 標題「楓之谷經典版改版紀錄：每次更新多了什麼」。
- [ ] **Step 4:** 測試 PASS；`npm run dev`（worktree 要另開埠＋`--webpack`，見記憶）看一眼。
- [ ] **Step 5:** commit `v1.94: /updates 改版紀錄（每版一張卡）`

### Task 8: `/updates/[version]` 單版頁（候選 A）

**Files:**
- Create: `src/app/updates/[version]/page.tsx`、`src/app/updates/[version]/ChangedList.tsx`（client：類別篩選＋展開）、`src/app/updates/[version]/AddedGroups.tsx`
- Create: `src/lib/patch-view.ts`、`src/lib/__tests__/patch-view.test.ts`

**Interfaces:**
- Consumes: `getPatchPage`、`listPatchPages`（Task 6）；`itemPagePath`（`src/lib/item-page.ts`，道具有單獨頁才連）
- Produces（`patch-view.ts`，純函式）：
  - `textDiff(before: string, after: string) -> { t: "same"|"del"|"ins"; v: string }[]`：逐字比對（共同前後綴切掉，中間一段刪、一段加即可，不用 LCS）
  - `changedKinds(rows) -> { kind, count }[]`：依「說明、商店、掉落、能力、名稱」順序，0 筆的不列
  - `addedGroups(patch) -> { label: string; count: number; rows }[]`：道具照子分類（數量多到少）、任務照 `area`、怪物一組、地圖一組

- [ ] **Step 1: 失敗測試**：`textDiff("各 1500 。","各 1200 。")` → `same "各 1"`、`del "5"`、`ins "2"`、`same "00 。"`；完全相同回一段 `same`；`changedKinds` 順序與略過 0；`addedGroups` 排序、髮型臉型不在裡面。
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 實作 `patch-view.ts`，再做頁面，照 `A.png` 由上到下：麵包屑；h1「M/D 改版整理（版本）」；說明「這次最值得看的 4 件事，下面再列全部新東西。」；版本選單（`<select>` 或連結清單，只列有重點檔的版本）；「這次重點」4 列＋「客戶端資料」標籤；「改了多少」四格（新道具（不含髮型臉型）、新任務、新怪物、道具說明或數值有改）；「說明改了的道具」先 3 列＋「看全部 N 項 ›」展開、展開後類別篩選（橘框淡底選中）、說明類用 `textDiff` 標出不同；「全部新東西」各組收合；「站上不再列出」收合＋說明那行；免責。`generateStaticParams` 只回有重點檔的版本、`dynamicParams = false`。JSON-LD 照 `src/app/guides/[slug]/page.tsx` 的放法（不放 head）。`metadata` 標題「楓之谷經典版 M/D 改版整理（版本）：<重點檔 title>」。
- [ ] **Step 4:** 測試 PASS；手機 375 第一屏看得到 h1 和「這次重點」前兩條。
- [ ] **Step 5:** commit `v1.94: /updates/<版本> 單版重點頁`

### Task 9: 攻略專區卡片、sitemap、llms.txt

**Files:**
- Modify: `src/lib/guide-catalog.ts`（`GUIDE_CATEGORIES` 加 `"改版整理"`）、`src/lib/guide-pages.ts`（加一張卡）、`src/lib/site-pages.ts`（加 `/updates`）、`src/app/sitemap.ts`（每個 `listPatchPages()` 一筆）、`src/app/llms.txt/route.ts`（若沒有自動吃 `SITE_PAGES` 就手加）
- Create: `public/assets/guides/updates/hero.webp`（`scripts/guide-card-heroes.mjs` 產，照它現有用法）
- Modify: `src/lib/__tests__/guides-hub.test.ts`

**Interfaces:**
- Consumes: `listPatchPages`（Task 6）

- [ ] **Step 1: 失敗測試**（guides-hub）：有一張 `href === "/updates"`、`category === "改版整理"` 的卡，標題含「楓之谷經典版」；sitemap 含 `/updates` 和每個有重點檔的版本頁。
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 實作。卡片：標題「楓之谷經典版改版紀錄：每次更新多了什麼」、摘要「新道具、新任務、改了數字的東西，照版本整理好，附道具圖。」、`date` 用最新一版的日期、`tags: ["改版"]`。
- [ ] **Step 4:** PASS
- [ ] **Step 5:** commit `v1.94: 攻略專區多「改版整理」、sitemap 與 llms.txt 收改版頁`

### Task 10: 每一版的重點檔（草稿，等使用者審）

**Files:**
- Create: `src/content/patches/<版本>.md`，Task 5 產出的每一版各一份

- [ ] **Step 1:** 每版讀差異檔，挑 4 條玩家最有感的（新地區任務、活動、經驗券、職業專用東西優先；時裝、髮型不當重點）。每條小字的數字要能從差異檔數出來，在 PR 內文列「依據：`added.items` 裡 `n` 含『楓葉武器』且 `s === 卷軸` 共 21 筆」這類句子。
- [ ] **Step 2:** `npx vitest run src/lib/__tests__/patches.test.ts`：真資料那條（每頁 `patchProblems` 空）要綠。
- [ ] **Step 3:** commit `v1.94: 各版改版重點草稿（PR 內文附每條依據）`

### Task 11: 資料自動更新接上改版差異

**Files:**
- Modify: `.github/workflows/data-refresh.yml`（`build.mjs` 之後、`verify.mjs` 之前加一步；發布步驟之後加開 issue）
- Modify: `pipeline/lib/data-refresh-workflow.test.mjs`
- Create: `pipeline/refresh-patch.mjs`

**Interfaces:**
- Consumes: Task 3、4
- Produces: `node pipeline/refresh-patch.mjs --upstream <資料夾>`：從 `data/raw/artale.json` 讀目前 `gameVersion` 和上游 HEAD → `versionTimeline` → `previousVersion` → `buildAt(前一版 last.commit)` → `build-patch`（`--new public/data`）。前一版不存在就印一行跳過、exit 0。

- [ ] **Step 1: 失敗測試**（workflow 測試，照檔內既有寫法）：有一步跑 `node pipeline/refresh-patch.mjs`，位置在 `node pipeline/build.mjs` 之後、`node pipeline/verify.mjs` 之前；那一步的 `run` 裡沒有 `${{`（既有規則）。
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 實作：那一步先把上游 clone 補成看得到歷史（`git -C data/cache/upstream fetch --filter=blob:none --unshallow` 或另 clone 到 `data/cache/upstream-history`，擇一並在註解寫為什麼），再跑 `refresh-patch.mjs`。發布合併後：若 `public/data/patches/<版本>.json` 存在而 `src/content/patches/<版本>.md` 不存在，`gh issue create` 標題「新版本 <版本> 要寫改版重點」（已有同標題開著的就不再開）。
- [ ] **Step 4:** PASS；`gh workflow run data-refresh.yml -f dry_run=true --ref feat/v1.94-patch-notes`（記憶：測 data-refresh 用 dry_run 在自己分支跑）綠，log 看到 refresh-patch 那步印出版本與數字。
- [ ] **Step 5:** commit `v1.94: 資料自動更新時重算目前版本的改版差異，新版本開 issue 提醒寫重點`

### Task 12: 驗收、PR 到 dev

**Files:**
- Create: `scripts/verify/updates-shot.mjs`（照 `scripts/verify/guild-shot.mjs` 的寫法：手機 375、深淺各一，兩個頁）
- Modify: `scripts/verify/README.md`（加一行用法）

- [ ] **Step 1:** `npm test`、`npm run build` 全綠。
- [ ] **Step 2:** 再 `git fetch`，確認 v1.94 沒被佔；開 PR 到 `dev`，內文列：每版數字、跳過的版本、Task 10 每條重點的依據、「重點是草稿，請使用者審」。
- [ ] **Step 3:** `gh pr checks` 等「單元測試、建置、第一格」三條都出現且綠（記憶：只看沒 pending 會被騙）。
- [ ] **Step 4:** **先不合併**（重點是草稿，使用者審過才合）。對這條分支的預覽網址（記憶：分支名長會截斷，查部署固定網址）跑 `updates-shot.mjs`、`contrast-audit.mjs`（加 `MSYS_NO_PATHCONV=1`，路徑寫 `C:/…`）兩頁都過；截圖送使用者，附兩個頁的完整網址。
- [ ] **Step 5:** 自己用一輪，列 ≥10 點優化意見給使用者，等使用者審重點、說可以才合進 dev；不上正式機。
