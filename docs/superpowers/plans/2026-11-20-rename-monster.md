# 名字變怪物 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/plan/rename`：像接任務一樣讓 NPC 叫你手寫 ID，留下的筆畫拼成一隻已開放的怪（或一坨），可分享連結、影片、圖。

**Architecture:** 建置時把每隻開放怪的圖描成輪廓點（JSON，前端動態 import）；瀏覽器把手寫筆畫切段、正規化，用貪婪法挑筆畫去貼輪廓，算分後換算成顯示像度。演出全部畫在一張 canvas（同一支 renderer 給畫面跟錄影用）。分享連結＝每隻怪一頁靜態頁 `/plan/rename/m/<id>`（og 預覽圖走既有 build-og），筆畫放在 `#` 後面（不送伺服器）。

**Tech Stack:** Next 16 App Router（靜態輸出到 Cloudflare）、React 19、TypeScript、vitest、@napi-rs/canvas（建置腳本）、MediaRecorder、Web Share API。

**Spec:** `docs/superpowers/specs/2026-11-20-rename-monster-design.md`

## Global Constraints

- 全部文字繁體中文；UI 不准 emoji、不准廉價 icon（狀態用文字或 inline SVG）
- 一坨文案照抄：「拉完了，測出來是一坨。建議換個暱稱。」
- 按鈕只用客戶端原圖（BtClose 停止對話、BtQNo 拒絕、BtQYes 接受、BtNext 下頁），整數倍放大、`image-rendering: pixelated`；其他按鈕照設計系統 A（選中＝橘框淡底，不准膠囊）
- NPC＝紙娃娃 cast `pipeline/video/cast/08.png`，朝右（水平翻轉），名牌「公會櫃台 米菈」
- 怪物只用 `staticMonsters()`（`!un`）且 `public/assets/monster_frames/<id>.png` 存在的
- 顯示像度 < 50 → 一坨；換算曲線讓約 10–20% 手寫變一坨
- 不打任何線上 API；手寫內容只在分享時放進網址 `#` 後面
- 新頁不進導覽列；要登記 `src/lib/site-pages.ts`
- GA 事件 `rename_start`、`rename_result`、`rename_share`，README「GA 事件」表同步
- `DamageCalculator` 那類規則不相干；commit 開頭 `v2.44:`

## Review Focus

1. 只點一下（零長度筆畫）或空白就按「簽好了」→ 不當機，NPC 說「還沒簽喔」，不進結果
2. 筆畫超多（亂塗 200 筆以上）→ 仍在 1 秒內出結果（筆畫段數上限 120，超過的取最長的 120 段）
3. 竄改或壞掉的 `#` 分享資料 → 只顯示該怪的靜態結果卡＋「換我寫」，不丟錯
4. 不支援 MediaRecorder（舊 iOS）→ 「存影片」按鈕不出現，其他照常
5. 橫向手機／電腦寬螢幕 → 簽名格維持 3:2，滑鼠也能寫（pointer events，`touch-action: none` 防捲動）

---

### Task 1: 怪物輪廓資料

**Files:**
- Create: `scripts/rename/build-shapes.mjs`
- Create: `src/lib/rename/shapes.json`（產出物，commit）
- Test: `src/lib/rename/__tests__/shapes.test.ts`

**Interfaces:**
- Produces: `shapes.json` = `{ v: 1, grid: 64, shapes: Shape[] }`，`Shape = { id: number; n: string; pts: [number, number][] /* 輪廓點，0–63 格座標，間隔約 1.5 格 */; area: number /* 填滿格數 */ }`

- [ ] **Step 1: 測試**：`shapes.json` 每筆 id 都在 `staticMonsters()` 且 monster_frames 圖存在；`shapes.length >= 100`；每筆 `pts.length` 在 40–400；沒有兩筆 id 重複；外形太像（輪廓點集合 Chamfer 距離 < 1.0 格）的只留一隻。
- [ ] **Step 2: 跑測試確認失敗**：`npx vitest run src/lib/rename/__tests__/shapes.test.ts` → FAIL（檔案不存在）
- [ ] **Step 3: 寫腳本**：讀 `public/data/monsters.json`（濾 `un`）→ `@napi-rs/canvas` loadImage → alpha>64 當實心 → 裁邊、等比縮進 56×56 置中於 64 格 → 取外輪廓（實心格旁邊有空格的）→ 沿輪廓等距取點 → 去重近似外形 → 寫 JSON。檔頭寫用法：`node scripts/rename/build-shapes.mjs`。
- [ ] **Step 4: 跑腳本＋測試 PASS**
- [ ] **Step 5: Commit** `v2.44: 名字變怪物 — 怪物輪廓資料`

### Task 2: 筆畫處理與分享編碼

**Files:**
- Create: `src/lib/rename/strokes.ts`
- Test: `src/lib/rename/__tests__/strokes.test.ts`

**Interfaces:**
- Produces:
  - `type Pt = [number, number]; type Stroke = Pt[]`
  - `splitAtCorners(strokes: Stroke[], angleDeg = 60): Stroke[]` — 轉角 > 60° 切開；長度 < 2px 的段丟掉；最多 120 段（超過留最長的）
  - `normalize(strokes: Stroke[], grid = 64, box = 56): Stroke[]` — 等比縮放置中到 grid
  - `encodeShare(r: { id: number | "poop"; score: number; all: Stroke[]; kept: number[] }): string` / `decodeShare(s: string): typeof r | null` — 座標量化 0–63、Base64URL；壞資料回 null

- [ ] **Step 1: 測試**：一筆「L」形（直角）切成 2 段；一條直線不切；空陣列回空；130 段輸入只留 120；normalize 後 bbox 長邊 = 56 且置中；`decodeShare(encodeShare(x))` 等於量化後的 x；`decodeShare("壞")`、`decodeShare("")` 回 null。
- [ ] **Step 2: 確認失敗** `npx vitest run src/lib/rename/__tests__/strokes.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: PASS**
- [ ] **Step 5: Commit** `v2.44: 名字變怪物 — 筆畫切段與分享編碼`

### Task 3: 比對與像度

**Files:**
- Create: `src/lib/rename/match.ts`
- Test: `src/lib/rename/__tests__/match.test.ts`

**Interfaces:**
- Consumes: Task 1 `Shape`、Task 2 `Stroke`、`normalize`
- Produces:
  - `fitShape(segs: Stroke[], shape: Shape): { raw: number; kept: number[] }` — 對 3 種縮放（0.9/1/1.1）×5 種平移（中心、上下左右 4 格）各跑一次貪婪，取最高
  - `displayScore(raw: number): number` — 0–99 整數，單調遞增
  - `pickResult(segs: Stroke[], shapes: Shape[], rand: () => number): Result`，`Result = { kind: "monster"; id: number; n: string; kept: number[]; score: number } | { kind: "poop"; score: number } | { kind: "empty" }`

貪婪（決定不了的部分寫死在這）：
```
覆蓋：輪廓點 p 被蓋到 ⇔ 某段離 p ≤ 2 格
每次在剩下的段裡挑 gain = 新蓋到的點數/總點數 − 0.5 × 該段落在輪廓 3 格外的長度比例 最大的；gain ≤ 0.01 停
raw = 覆蓋率 − 0.5 × 留下段的平均外漏比例；kept 至少 1 段才算
pickResult：全部怪算 raw → 前 3 名中 raw 跟第 1 名差 < 0.03 的隨機挑 → displayScore(raw) < 50 回 poop
```

- [ ] **Step 1: 測試**：用某隻怪自己的 `pts` 切 8 段當筆畫 → 這隻排第 1、`displayScore ≥ 80`；完全在輪廓外的一條短線 → poop；空筆畫 → `empty`；`displayScore` 單調（0→1 取 20 點）；固定 rand 時同輸入同輸出；120 段×全部怪在 node 上 < 1500ms（手機用 Worker，再要求 Task 7 實測）。
- [ ] **Step 2: 確認失敗**
- [ ] **Step 3: 實作**（`displayScore` 先用 `round(99 × clamp((raw − 0.15)/0.55, 0, 1)^0.7)`，Task 8 用實際手寫校正）
- [ ] **Step 4: PASS**
- [ ] **Step 5: Commit** `v2.44: 名字變怪物 — 比對與像度`

### Task 4: NPC 台詞與鬼打牆

**Files:**
- Create: `src/lib/rename/lines.ts`
- Test: `src/lib/rename/__tests__/lines.test.ts`

**Interfaces:**
- Produces: `type Seg = { t: string; c?: "blue" | "red" }`；`introLines(declines: number): Seg[][]`（0＝開場；1、2、3…＝換句話繼續問，第 4 次起在最後 2 句輪播）；`resultLines(r: Result): Seg[][]`；`EMPTY_LINES: Seg[][]`（「還沒簽喔」）

固定台詞：
- 開場：「新來的冒險者？」／「要登錄[冒險者名冊:blue]的話，」「先在登記書上簽你的 [ID:blue]。」／「簽完多出來的筆畫……」「我會[幫你收著:red]的。」
- 拒絕 1「……你剛剛是不是手滑了？要登錄冒險者名冊嗎？」、2「冒險者名冊只差你一個了。」、3「我會一直問喔。」、4「真的不簽？」（3、4 輪播）
- 怪物：「簽好了。多的筆畫我收下囉。」／「從今天起，你的名字是」「「{n}」:blue」
- 一坨：「拉完了，測出來是一坨。建議換個暱稱。」（照抄，不加字）

- [ ] **Step 1: 測試**：上述字串逐字比對；`introLines(10)` 等於 3 或 4 那句；一坨那行 join 後完全等於規定文案
- [ ] **Step 2–4: 失敗 → 實作 → PASS**
- [ ] **Step 5: Commit** `v2.44: 名字變怪物 — NPC 台詞`

### Task 5: 演出 renderer（畫面與錄影共用）

**Files:**
- Create: `src/lib/rename/stage.ts`
- Test: `src/lib/rename/__tests__/stage.test.ts`

**Interfaces:**
- Consumes: Task 2/3
- Produces:
  - `TIMELINE = { write: 1200, collect: 1500, morph: 1500, title: 1300 }`（ms，共 5.5 秒）
  - `phaseAt(ms: number): { phase: "write" | "collect" | "morph" | "title" | "done"; p: number }`
  - `drawStage(ctx: CanvasRenderingContext2D, s: { w: number; h: number; segs: Stroke[]; kept: number[]; result: Result; mob?: CanvasImageSource; ms: number; caption: boolean }): void` — write：筆畫依序畫出；collect：沒留的段往左上飛走淡出；morph：留下的段平移縮放到怪輪廓對應位置，怪圖淡入；title：「今天起是「XX」」＋像度；poop：collect 階段改成全部段掉到底部堆起來（簡單重力＋地面碰撞，固定亂數種子）；`caption` true 時（錄影、存圖）最下面寫 `maplehelper.tw`

- [ ] **Step 1: 測試**：`phaseAt` 邊界（0、1199、1200、5499、5500）；`drawStage` 用 @napi-rs/canvas 在 4 個時間點各畫一次不丟錯、poop 結尾時所有段的 y 都在下半部（mock ctx 記錄 lineTo 座標）
- [ ] **Step 2–4: 失敗 → 實作 → PASS**
- [ ] **Step 5: Commit** `v2.44: 名字變怪物 — 演出 renderer`

### Task 6: 頁面與互動

**Files:**
- Create: `src/app/plan/rename/page.tsx`、`src/app/plan/rename/RenameGame.tsx`、`src/app/plan/rename/NpcDialog.tsx`、`src/app/plan/rename/SignPad.tsx`、`src/app/plan/rename/match.worker.ts`
- Create: `public/rename/`：`npc.png`（cast 08 原圖）、`bt-close.png`、`bt-no.png`、`bt-yes.png`、`bt-next.png`（含 mouseOver、pressed 各一張，來源：客戶端 `spriteset_34723d2991abcb4eaf4361c175a47e52.bundle` 的 `UI/UIWindow/UtilDlgEx/Bt*`；抽取腳本 `scripts/client/dlg-buttons.py`，檔頭寫用法）
- Modify: `src/lib/site-pages.ts`（登記 `/plan/rename`）
- Test: `src/app/plan/rename/__tests__/flow.test.ts`

**Interfaces:**
- Consumes: Task 2–5
- Produces: `RenameGame({ replay?: { id: number | "poop" } })`（Task 7 的分享頁用）；狀態機 `type Step = "intro" | "sign" | "running" | "result"`，純函式 `next(step, action, ctx)` 放 `src/lib/rename/flow.ts`

版面照 `Q_compare.png`：標題「名字變怪物」→ NPC 對話框（深藍灰外框、白底、NPC 左朝右、名牌、底下按鈕列）→ 下方區塊（sign：登記書＋簽名格＋［簽好了］［擦掉重寫］；running／result：stage canvas）→ result：［分享］［再寫一次］＋「{n}在哪打／怎麼去 →」連 `/db/monsters/<id>`。對話框按［停止對話］回首頁。簽名格下方小字：「你寫的字只在這支手機上算；按分享才會放進連結。」

- [ ] **Step 1: 測試 flow.ts**：intro+accept→sign；intro+decline→intro 且 declines+1；sign+submit 空筆畫→留在 sign 且顯示 EMPTY_LINES；sign+submit→running；running+done→result；result+again→sign
- [ ] **Step 2–4: 失敗 → 實作 flow.ts＋元件 → PASS**；比對在 `match.worker.ts` 跑（`new Worker(new URL(..., import.meta.url))`），shapes 用 `import("@/lib/rename/shapes.json")`
- [ ] **Step 5: 本機 next dev（另開埠＋--webpack）開 `/plan/rename` 手指／滑鼠各寫一次，截圖**
- [ ] **Step 6: Commit** `v2.44: 名字變怪物 — 頁面與 NPC 對話`

### Task 7: 分享（連結、影片、圖）＋GA

**Files:**
- Create: `src/app/plan/rename/m/[id]/page.tsx`（`generateStaticParams` = shapes 的 id ＋ `"poop"`；`robots: noindex`；og:title「我從今天起是「{n}」｜名字變怪物」、poop 用「測出來是一坨｜名字變怪物」；頁面＝`RenameGame replay`，讀 `location.hash` 解碼重播，解不開就只顯示該怪結果卡＋「換我寫」）
- Create: `src/lib/rename/share.ts`：`shareUrl(r): string`、`recordVideo(canvas, draw): Promise<Blob | null>`（MediaRecorder，`video/mp4` 支援就用，否則 `video/webm`；不支援回 null）、`stageImage(...)`（1080×1350 png）
- Modify: `scripts/og/build-og.mjs` `spriteFor`：`/plan/rename/m/<id>` → 怪圖；`/plan/rename/m/poop` → 只有字
- Modify: `src/lib/analytics.ts` EventName 加 `rename_start | rename_result | rename_share`；README「GA 事件」表加三列（參數：result `monster_id`、`poop`、`score`；share `via: link|video|image`）
- Test: `src/lib/rename/__tests__/share.test.ts`、`scripts/og` 既有測試加一案

分享按鈕點開三選一：複製連結／存影片／存圖（設計系統按鈕）。影片 720×1280、30fps、用 Task 5 `drawStage(caption: true)` 逐格畫；手機 `navigator.canShare({files})` 就分享檔案，不然下載。

- [ ] **Step 1: 測試**：shareUrl 形如 `/plan/rename/m/210100#r=...`；poop 走 `/plan/rename/m/poop#r=...`；spriteFor 新路徑；recordVideo 在無 MediaRecorder 時回 null
- [ ] **Step 2–4: 失敗 → 實作 → PASS**
- [ ] **Step 5: Commit** `v2.44: 名字變怪物 — 分享連結、影片、圖`

### Task 8: 入口、校正、驗收

**Files:**
- Modify: 首頁工具清單（`src/components/route/RouteHome.tsx` 現有工具清單加一項「名字變怪物：簽個名看你是哪隻怪」）、`src/app/db/monsters/[id]/page.tsx` 底部加一行連 `/plan/rename`
- Create: `scripts/verify/rename-shot.mjs`（無頭 Chrome：接受→用 10 組手寫樣本畫進簽名格→記結果→截圖，含一坨；README 驗收腳本清單加一行）
- Create: `src/lib/rename/__fixtures__/hand.json`（10 組實際手寫：在 in-app 瀏覽器用滑鼠拖曳寫中文 ID 4、英文 4、數字 2，從頁面 `?debug=1` 的「匯出筆畫」拿）
- Test: `src/lib/rename/__tests__/calibrate.test.ts`

- [ ] **Step 1: 收 10 組手寫進 fixtures**
- [ ] **Step 2: 測試**：10 組結果裡同一隻怪 ≤ 3 次、poop 1–2 組
- [ ] **Step 3: 調 `displayScore` 係數到 PASS**
- [ ] **Step 4: `npm test`、`npx next build` 全綠**
- [ ] **Step 5: rename-shot.mjs 手機尺寸截圖（接任務、簽名、結果、一坨、分享選單）**
- [ ] **Step 6: Commit** `v2.44: 名字變怪物 — 入口與校正`
