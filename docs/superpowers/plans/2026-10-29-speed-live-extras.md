# 練功測速補齊 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 練功測速補上經驗曲線、低血提醒、快捷鍵藥水用量、楓幣收益（手填）、跟我之前比、分享圖，左欄照候選 C、分享圖照 S1。

**Architecture:** 認畫面與計算全在 `src/lib/speed/` 新增純函式模組（每個一檔、各自測試）；UI 在 `src/app/plan/speed/` 新增三張卡元件，`PracticeSpeed.tsx` 只接線。快捷鍵數字字形從本機客戶端抽成 TS 常數檔（同 `status-font.ts`）。

**Tech Stack:** Next 16、React、Tailwind v4、vitest、Canvas 2D、Web Audio。

**Spec:** `docs/superpowers/specs/2026-10-29-speed-live-extras-design.md`（候選圖在 `docs/superpowers/specs/assets/2026-10-29-speed-live-extras/`）

## Global Constraints

- 使用者可見文字繁體中文、無 emoji、無 icon set；講使用者拿得到什麼，不寫內部機制。
- 數字一律「每 10 分鐘」，不寫每小時、每秒。
- 字色只用站上 CSS 變數；按鈕字 `--on-accent`；白天／夜晚都要過 AA（`scripts/verify/contrast-audit.mjs`）。
- 讀不到可以，讀錯不行：認不出的格子、數字那一秒跳過，不猜。
- 個人紀錄只存 `localStorage`（鍵 `ms-speed:records`，最多 50 筆），不上傳；讀寫包 try/catch。
- 低血：30% 以下響一次、回到 50% 以上才重置；聲音用 `src/lib/boss/sound.ts` 的 `playBeep()`。
- 經驗曲線最多 60 根（每分鐘一根），低於這段平均一半的那根金色。
- 楓幣手填：每 10 分鐘淨賺＝（現在－開始）÷ 兩次填寫的時間差（分鐘）× 10，時間差 < 1 分鐘不算；撿到＝淨賺＋藥水錢（每 10 分鐘）。
- 測試：`node node_modules/vitest/vitest.mjs run src/lib/speed`；型別 `node node_modules/typescript/bin/tsc --noEmit -p .`（worktree 已 `npm ci`）。
- 不改現有認經驗、認地圖、排行、組隊、加倍券的行為；`scripts/verify/speed-shot.mjs` 要照舊全過。

## Review Focus

1. 回城補藥（某格數量往上跳）→ 不算用掉、標「這段中途補過藥，楓幣只供參考」。→ Task 4 `restock is not usage`。
2. 快捷鍵格子換了別的藥水（同一格圖示變了）→ 新藥水從零起算，不把兩種混算。→ Task 4 `slot item change resets`。
3. 遊戲視窗放大 1.5 倍、1920×1080 置中 → 快捷鍵照樣找得到（用狀態列 scale）。→ Task 3 `finds quickslot when scaled`。
4. 經驗曲線跨級（升級時經驗歸零）→ 那一分鐘不出現負的長條（用 seg.gained 差值）。→ Task 1 `level up keeps positive`。
5. 低血在 29%～31% 來回抖 → 只響一次。→ Task 2 `hysteresis`。

---

### Task 1: 每分鐘經驗曲線

**Files:** Create `src/lib/speed/curve.ts`；Test `src/lib/speed/__tests__/curve.test.ts`

**Interfaces:**
- Consumes: `Segment`（`tracker.ts`：startedAt、gained）
- Produces:
  - `type Curve = { startedAt: number; lastGained: number; minutes: number[] }`
  - `nextCurve(prev: Curve | null, seg: Segment | null, now: number): Curve | null`——seg 為 null 回 null；seg.startedAt 跟 prev 不同就重開；`delta = seg.gained - prev.lastGained`（≤0 不加）加到 `minutes[floor((now - startedAt) / 60000)]`，中間沒資料的分鐘補 0
  - `curveBars(c: Curve): { value: number; low: boolean }[]`——最後 60 根；`low`＝低於全部分鐘平均的一半（平均只算 >0 的分鐘）
  - `lowRunText(bars, totalMinutes): string | null`——最近一段連續 low 的分鐘，回「第 N～M 分鐘掉很多（可能死了或在補藥）」，只一分鐘就「第 N 分鐘…」；分鐘從 1 起算、以整段為基準（不是最後 60 根的索引）
- [ ] Step 1: 測試：`accumulates per minute`（3 分鐘各加 100/200/300）、`new segment resets`、`level up keeps positive`（gained 不會變小；delta ≤ 0 不加）、`gap minutes are zero`、`last 60 only`、`low bar and text`（[500,500,100,500] → 第 3 根 low、「第 3 分鐘掉很多（可能死了或在補藥）」；[500,100,100,500] → 「第 2～3 分鐘…」）
- [ ] Step 2: 跑 → FAIL；Step 3: 實作；Step 4: 跑 → PASS
- [ ] Step 5: commit `v1.22 (1/8): 練功測速每分鐘經驗曲線`

### Task 2: HP 比例＋低血遲滯

**Files:** Create `src/lib/speed/hp.ts`；Test `src/lib/speed/__tests__/hp.test.ts`

**Interfaces:**
- Consumes: `findStatusBar(frame): StatusBar | null`（`status-bar.ts`，`hp: [x0, x1]`、`top`、`bottom`）、`Frame`、`rgbAt`
- Produces:
  - `hpRatio(frame: Frame, bar: StatusBar): number | null`——在 HP 條中線那列，從左到右算「紅色填滿」（r 明顯大於 g、b）的長度 ÷ 條長；條上的數字文字是白／淺色，跳過不算斷；讀不出回 null
  - `type LowHp = { armed: boolean }`；`LOW_HP = 0.3`、`RESET_HP = 0.5`
  - `nextLowHp(s: LowHp, ratio: number | null): { s: LowHp; beep: boolean }`——armed 且 ratio < 0.3 → beep、armed=false；ratio ≥ 0.5 → armed=true；null 不變
- [ ] Step 1: 測試：`window-1364.png` 的 HP（1146/1296 ≈ 0.884，容許 ±0.03）；用 `fixture.ts` 的工具把 HP 條紅色改成 25% 長 → ≈0.25；`hysteresis`：0.9→0.29 響→0.31→0.29 不響→0.55→0.28 響；null 不變
- [ ] Step 2～4: FAIL → 實作 → PASS
- [ ] Step 5: commit `v1.22 (2/8): 讀 HP 比例、低血提醒的響聲規則`

### Task 3: 快捷鍵格子與數字

**Files:** Create `scripts/client/quickslot-font.py`（或 `.mjs`，照 `scripts/client/` 既有做法抽字形）、`src/lib/speed/quickslot-font.ts`（抽出的 0～9 點陣，像 `status-font.ts`）、`src/lib/speed/quickslot.ts`；Test `src/lib/speed/__tests__/quickslot.test.ts`

**Interfaces:**
- Consumes: `findStatusBar`、`Frame`、`fixture.ts`（`onScene` 等）、`status-font.ts` 的寫法
- Produces:
  - `type SlotRead = { index: number; rect: Rect; count: number | null; icon: Uint8ClampedArray | null }`（index 0～7，左上到右下；icon＝該格圖示區縮成 16×16 RGBA）
  - `findQuickslot(frame: Frame, bar: StatusBar): Rect[] | null`——回 8 個格子的位置；找不到回 null
  - `readQuickslot(frame: Frame, bar: StatusBar): SlotRead[] | null`
  - `paintSlotCount(frame, rect, count)`（測試用，拿字形畫數字到格子上）放在 `__tests__/fixture.ts` 或 `gen/`
- 字形：從 `D:/屁哥/maplestory_classic`（UnityFS bundle，UnityPy）找快捷鍵／道具數量用的數字圖（先找 UI 裡 `ItemNo`、`number` 之類名稱）；抽不到就從 `window-1364.png` 已有的 0、1、2、4、7、9 切，缺的 3、5、6、8 停下來回報（不准用別的字型代替）。
- [ ] Step 1: 測試：`window-1364.png` 讀到有數字的格子 702、279、141、0、2（照截圖由左到右、上到下的實際位置）；`all digits`：用 `paintSlotCount` 把 0～9 每個字（例 1234567890 拆成幾個數）畫進格子都讀對；`finds quickslot when scaled`（1.5 倍、貼到 1920×1080 `onScene`）；`unreadable is null`（數字被遮一半 → null，不是錯的數）
- [ ] Step 2～4: FAIL → 實作 → PASS
- [ ] Step 5: commit `v1.22 (3/8): 讀快捷鍵格子跟數量`

### Task 4: 藥水是哪一種、用量、楓幣算式

**Files:** Create `src/lib/speed/potions.ts`、`src/lib/speed/meso.ts`；（如需要）建置產物 `public/data/potion-prices.json` 與產它的 pipeline 改動；Test `src/lib/speed/__tests__/potions.test.ts`、`meso.test.ts`

**Interfaces:**
- Consumes: Task 3 `SlotRead`；道具資料（`items.json` 的消耗品、圖示 `/assets/items/<id>.png`）
- Produces:
  - `matchPotion(icon: Uint8ClampedArray, refs: { id: number; icon: Uint8ClampedArray }[]): number | null`——最像且距離低於門檻才回 id（門檻寫常數、測試定）
  - `type PotionTrack = { slots: Record<number, { itemId: number; startCount: number; lastCount: number; used: number; restocked: boolean }> }`
  - `nextPotions(t: PotionTrack, reads: { index: number; itemId: number | null; count: number | null }[]): PotionTrack`——同格同 id：數量下降加到 used、上升標 restocked 不算；id 變了那格重開；null 跳過
  - `potionSummary(t: PotionTrack, minutes: number, price: (id: number) => number | null): { itemId: number; per10: number; meso10: number | null }[]`（同 id 多格合併）＋ `restocked: boolean`
  - `mesoRates(input: { startMeso: number; startAt: number; nowMeso: number; nowAt: number } | null, potionMeso10: number): { net10: number | null; picked10: number | null }`
  - `potionPrice(id)`：NPC 常駐楓幣店最低價（排除活動店，跟 `/plan/buy` 同規則），沒有回 null
- [ ] Step 1: 測試：`matchPotion` 拿 `/assets/items/2000000～2000003.png` 自己比自己 → 對、互比不混、雜訊圖 → null；`restock is not usage`；`slot item change resets`；`two slots same potion merge`；`mesoRates`：開始 1,000,000、20 分鐘後 1,060,000、藥水 3,360 → net10 30,000、picked10 33,360；時間差 30 秒 → null；`potionPrice(2000003)` 是商店價（測試裡寫實際數字）
- [ ] Step 2～4: FAIL → 實作 → PASS
- [ ] Step 5: commit `v1.22 (4/8): 認藥水、算用量跟楓幣`

### Task 5: 我的練功紀錄

**Files:** Create `src/lib/speed/records.ts`；Test `src/lib/speed/__tests__/records.test.ts`

**Interfaces:**
- Produces:
  - `type SpeedRecord = { at: number; mapId: number | null; mapName: string; level: number; job: number | null; charId: string | null; exp10: number; net10: number | null }`
  - `loadRecords(storage: Storage): SpeedRecord[]`、`addRecord(storage: Storage, r: SpeedRecord): SpeedRecord[]`（新的在前、最多 50）
  - `compareRows(records: SpeedRecord[], current: { mapId: number | null; mapName: string; exp10: number; job: number | null; charId: string | null }): { label: string; exp10: number; current: boolean }[]`——第一列是這段（label「<地圖>（這段）」），其他是同 charId（有的話）否則同 job、不同地圖、每張圖取最好的一筆、最多 4 張圖，照 exp10 由大到小
- [ ] Step 1: 測試：存取、壞 JSON、上限 50、比較規則（有 ID 看 ID、沒 ID 看職業、同圖只取最好、排除跟這段同圖、最多 4）
- [ ] Step 2～4: FAIL → 實作 → PASS
- [ ] Step 5: commit `v1.22 (5/8): 練功紀錄存在這台電腦、跟之前比`

### Task 6: 分享圖

**Files:** Create `src/lib/speed/share-image.ts`；Test `src/lib/speed/__tests__/share-image.test.ts`

**Interfaces:**
- Produces:
  - `type ShareCard = { title: string; exp10: number; second: { label: "淨賺楓幣" | "這段拿到"; value: string }; eta: string; monsterSrc: string | null; date: string }`
  - `shareLines(card: ShareCard): { heading: string; big: string; bottom: [string, string][] }`（純函式，數字加千分位、淨賺帶 +）
  - `drawShareImage(card: ShareCard, colors: { paper: string; paperDeep: string; ink: string; maple: string; edge: string }, font: string): Promise<HTMLCanvasElement>`——1200×630，照 S1（`S-light.png` 上面那張、`mock-candidates.mjs` 的 `shareBase(false)` 放大兩倍）
- [ ] Step 1: 測試只測 `shareLines`（標題「冰雷巫師 Lv.46・森林迷宮Ⅲ・2026/10/29」、千分位、沒淨賺換「這段拿到」）
- [ ] Step 2～4: FAIL → 實作（canvas 部分在 Task 7 用瀏覽器驗）→ PASS
- [ ] Step 5: commit `v1.22 (6/8): 分享圖內容與畫法`

### Task 7: 頁面接線（左欄 C、小浮窗、設定）

**Files:** Create `src/app/plan/speed/ExpCard.tsx`、`MesoCard.tsx`、`CompareCard.tsx`、`ShareDialog.tsx`；Modify `PracticeSpeed.tsx`（左欄換成 C 的順序、讀畫面迴圈多呼叫 hpRatio／readQuickslot、小浮窗多一行淨賺）、`src/lib/speed/settings.ts`（加 `lowHp: boolean`，預設 false，`parseSettings` 相容舊值）

版面與文案照 spec 與 `C-light.png`：控制卡多「HP 低於 30% 響一聲」開關；經驗卡＝10 分鐘經驗＋升級還要＋曲線（＋lowRunText）＋原本的「這段練了／拿到」改成曲線下一行小字；楓幣收益卡＝撿到／藥水／淨賺三格（每 10 分鐘）、兩個輸入「開始時楓幣」「現在楓幣」、每種藥水一行（道具圖＋「藍色藥水：每 10 分鐘 12 瓶（約 2,400 楓幣）」）、讀不到快捷鍵那句、補過藥那句；「跟我之前比」卡＝長條＋說明＋「產生分享圖」按鈕；分享對話框＝預覽＋「下載」＋（`ClipboardItem` 支援才有）「複製圖片」。紀錄在 `shouldSave` 存段時寫入。

- [ ] Step 1: 實作
- [ ] Step 2: tsc、`vitest run src/lib/speed` 全綠；emoji 掃描新檔無結果
- [ ] Step 3: 本機 dev（`next dev --webpack -p 3397`）跑 `node scripts/verify/speed-shot.mjs <輸出> http://localhost:3397 9398` 全過；另截左欄白天／夜晚、分享圖下載的 PNG
- [ ] Step 4: commit `v1.22 (7/8): 練功測速左欄換成經驗、楓幣、跟之前比三張卡`

### Task 8: 文件與驗收腳本

**Files:** Modify `README.md`（練功測速段：新功能、快捷鍵字形怎麼重抽、楓幣自動讀還沒開＋TODO 等使用者道具欄截圖）、`scripts/verify/speed-shot.mjs`（加檢查：楓幣收益卡、快捷鍵讀到 702 等、跟之前比卡、分享圖對話框出現）、`scripts/verify/README.md`
- [ ] Step 1: 改；Step 2: 跑 speed-shot 全過；全套 `vitest run` 與 tsc；contrast-audit `/plan/speed` 0 不合格
- [ ] Step 3: commit `v1.22 (8/8): README、驗收腳本加新卡片`
