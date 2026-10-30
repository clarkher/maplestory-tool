# 衝卷模擬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新頁 `/plan/scroll`：選裝備跟卷軸，一張表列出「要成功 1～N 張」各自的一件衝成機率、平均要幾件幾張、九成機率要準備幾張幾件。

**Architecture:** 建置時（`pipeline/build-gear.mjs` 順便）把 items.json 的卷軸說明解析成 `public/data/scroll-sim.json`（卷軸、白衣、可衝裝備）；前端 `src/lib/scroll-sim/calc.ts` 用動態規劃精確計算；頁面 `src/app/plan/scroll/` 讀小檔、網址帶 `?eq=&sc=`。

**Tech Stack:** Next 16 App Router、React、Tailwind v4、vitest（src）、node --test（pipeline）。

**Spec:** `docs/superpowers/specs/2026-10-30-scroll-sim-design.md`（含「工程師讀完補問」那一節，那一節優先）。候選版面 `docs/superpowers/specs/assets/2026-10-30-scroll-sim/C-light.png`、`candidates.mjs` 的 `C`；演算法樣本 `calc.mjs`。

## Global Constraints

- 全部使用者看得到的字用繁體中文（台灣用字），零簡體；不出現英文縮寫（STR／DEX／INT／LUK／MaxHP 要轉中文：力量／敏捷／智力／幸運／最大 HP…）、不出現「期望值」「機率分布」「模擬」以外的術語（頁名「衝卷模擬」照用）。
- 禁 emoji、禁 icon set；圖示只用 `/assets/items/<id>.png`，狀態用文字或 inline SVG。寫完 .ts/.tsx/.mjs 掃 emoji（含 U+2300–23FF、U+25A0–25FF）。
- 顏色只用站上 CSS 變數（`--ink`、`--ink-soft`、`--maple`、`--leaf`、`--gold`、`--paper`、`--paper-edge`、`--glass-strong`…）；楓葉橘底的按鈕字用 `--on-accent`，不准寫死白字。
- 不編造：解析不到成功率／部位／爆裝率數字（「#c失敗時道具毀損。」算 100% 除外）的卷不收；混沌、祝福、保護、寵物、包包、「一級…」「單手武器」「雙手武器」「飾品」「裝飾品」這類對不出單一裝備種類的不收。
- 導覽列（`src/lib/nav.ts`）不加這頁。
- commit 訊息：`v1.23 (N/4): <中文說明>`，結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 測試指令：pipeline `node --test pipeline/lib/scroll-sim.test.mjs`；src `node node_modules/vitest/vitest.mjs run <path>`；型別 `node node_modules/typescript/bin/tsc --noEmit -p .`。Bash 先 `export PATH="/usr/bin:/mingw64/bin:$PATH"`。

## Review Focus

1. 成功率很低的組合（10% 衝 7/7、15% 衝 10/10）：不能卡死、不能印 NaN／-1／上千萬，要寫「不到 0.1%」「幾乎衝不到」。
2. 帽子（items.json `s:"帽子"`）要挑得到「頭盔…卷軸」；戒指、腰帶、全身盔甲（→套服）、「褲、裙」「褲/裙」（→褲裙）對得上。
3. 網址帶的 id 不存在、不是卷軸、卷軸跟裝備對不上：不壞頁，當作沒帶。
4. 手機 390 寬：表格不能把頁面撐出橫向捲動。
5. 單價欄打非數字、0、負數：當作沒填，不出現 NaN。

---

### Task 1: 卷軸解析＋建置小檔

**Files:**
- Create: `pipeline/lib/scroll-sim.mjs`、`pipeline/lib/scroll-sim.test.mjs`
- Modify: `pipeline/build-gear.mjs`（多寫 `public/data/scroll-sim.json`，檔頭 usage 註解補一行）、`pipeline/verify.mjs`（多檢查這個檔）
- Generate+commit: `public/data/scroll-sim.json`

**Interfaces:**
- Produces（`public/data/scroll-sim.json`，前端型別在 Task 2 定義成一樣）：
  ```ts
  { scrolls: Array<{ id: number; ids: number[]; n: string; slot: string | null; only?: number[]; rate: number; boom: number; effect: string; stats: Array<{ k: string; v: number }>; src: boolean }>;
    white: Array<{ id: number; n: string; rate: number }>;
    equips: Array<{ id: number; n: string; s: string; tuc: number; lv: number; src: boolean }> }
  ```
  - `n` 卷軸顯示名（含成功率，照 items.json 原名）；`ids` 同名同成功率的所有 id（`id` 取最小）；`slot` 對應 items.json 裝備的 `s`（專用卷為 null、改用 `only` 裝備 id 清單）；`rate` 0～100 整數；`boom` 0～1（不會爆 0、「失敗時道具毀損」沒數字 1）；`stats` 成功一張加多少（中文名、數字）；`src` 查得到掉落／任務／商店來源。
  - `equips`：`eq.tuc > 0`、`s` 不是「寵物裝備」「掉落道具」「裝備」的裝備；`lv` 取 `eq.reqLevel ?? 0`。
- `export function parseSimScroll(item, equipsByName): {n,slot,only,rate,boom,effect,stats}|null`、`export function buildScrollSim(items, ctx): {scrolls,white,equips}`。

- [ ] **Step 1: 寫失敗測試** `pipeline/lib/scroll-sim.test.mjs`，至少：
  - `{id:2043305,n:"短劍攻擊詛咒卷軸30%",d:"短劍附加攻擊力提升屬性。 成功率：30%，物理攻擊力+5，LUK+3，物理防禦力+1 失敗時有50%機率道具被破壞"}` → `slot:"短刀"`, `rate:30`, `boom:0.5`, `stats` 含 `{k:"物理攻擊力",v:5}`、`{k:"幸運",v:3}`、`{k:"物理防禦力",v:1}`。
  - 爆裝六種寫法：「失敗時有50%機率道具被破壞」→0.5、「若失敗時以80%機率物品會破壞」→0.8、「道具會以50%的機率消失」→0.5、「以10%機率毀損」→0.1、「若失敗有50%機率會破壞道具」→0.5、「#c失敗時道具毀損。」→1。
  - 部位：「頭盔防禦卷軸60%」→`slot:"帽子"`；「全身盔甲…」→`"套服"`；「褲、裙…」「褲/裙…」「褲子…」→`"褲裙"`；「戒子…」→`"戒指"`；「腰帶…」→`"腰帶"`；「頭盔生命卷軸60%」也要解析（生命不是部位的一部分）。
  - 不收：「驚訝的混沌卷軸60%」、「寵物…」、「單手武器攻擊卷軸…」、「飾品…」、成功率抓不到的、寫會爆但抓不到數字也不是「#c失敗時道具毀損」的。
  - 專用卷：說明含「可使用的裝備：楓葉之杖、楓葉法杖」→ `slot:null`、`only` 是這兩件裝備的 id（用 `equipsByName` 查）；名字都對不到 → null。
  - `buildScrollSim`：白衣卷軸 10%（2049004）、20%（2049005）進 `white` 不進 `scrolls`；同名同成功率的兩個 id 併成一筆 `ids` 兩個；沒來源的卷 `src:false` 仍收（使用者拍板 B）。
- [ ] **Step 2:** 跑 `node --test pipeline/lib/scroll-sim.test.mjs` 確認失敗。
- [ ] **Step 3: 實作。** 部位對照沿用 `pipeline/lib/gear.mjs` 的 `SLOT_TOKENS` 思路但另寫一份（加：頭盔→帽子、全身盔甲→套服、褲、裙／褲/裙→褲裙、戒子→戒指、腰帶→腰帶），**不要改 `parseScroll` 的行為**（gear.json 照舊）。屬性名正規化：STR→力量、DEX→敏捷、INT→智力、LUK→幸運、MaxHP／最大HP→最大 HP、MaxMP→最大 MP，其餘照原字。來源判斷用 `gear.mjs` 現有的 `buildSource`／`hasAnySource`（需要的話 export）。
- [ ] **Step 4:** 測試全過；`node pipeline/build-gear.mjs` 產出 `public/data/scroll-sim.json`，印出卷數、白衣數、裝備數；把每個 `s` 有幾張卷對得到寫進 console（給 reviewer 看帽子 > 0）。
- [ ] **Step 5:** `pipeline/verify.mjs` 加檢查：檔案存在、`scrolls.length >= 300`、每張 `rate` 1～100、`boom` 0～1、名字結尾有 % 的跟 `rate` 一致、`帽子` 對得到的卷 > 0、`white.length === 2`、`equips.length >= 1500`。跑 `node pipeline/verify.mjs` 過。
- [ ] **Step 6:** 跑 `node --test "pipeline/**/*.test.mjs"` 全過（確認 gear.json 沒被影響），commit。

### Task 2: 計算

**Files:**
- Create: `src/lib/scroll-sim/calc.ts`、`src/lib/scroll-sim/types.ts`、`src/lib/scroll-sim/__tests__/calc.test.ts`

**Interfaces:**
- Consumes: Task 1 的 JSON 形狀（`types.ts` 定義 `SimScroll`、`SimWhite`、`SimEquip`、`ScrollSimData`）。
- Produces:
  ```ts
  export type SimInput = { tuc: number; k: number; rate: number; boom: number; whiteRate?: number }; // rate、whiteRate 0～100，boom 0～1
  export type SimRow = {
    k: number;
    p: number;            // 一件衝成 0～1
    tiny: boolean;        // p < 0.001
    avgItems: number;     // 1/p（tiny 時仍給數字，畫面不顯示）
    avgScrolls: number;
    avgWhite: number;     // 沒開白衣 0
    items90: number | null; // tiny → null
    scrolls90: number | null;
  };
  export function simulate(input: SimInput): SimRow;
  export function simTable(tuc: number, rate: number, boom: number, whiteRate?: number): SimRow[]; // k = 1..tuc
  ```

- [ ] **Step 1: 失敗測試**（數字跟 spec 驗收一致，小數用 `toBeCloseTo`）：
  - `simulate({tuc:5,k:5,rate:60,boom:0})` → p≈0.0778、items90=29、scrolls90=64、avgItems≈12.86、avgScrolls≈29.7。
  - `{tuc:5,k:4,rate:60,boom:0}` → p≈0.337、items90=6、scrolls90=22。
  - `{tuc:5,k:5,rate:70,boom:0.5}` → p≈0.168、items90=13、scrolls90=33。
  - `{tuc:5,k:3,rate:100,boom:0}` → p=1、avgScrolls=3、items90=1、scrolls90=3。
  - `{tuc:7,k:7,rate:10,boom:0}` → tiny=true、items90=null、scrolls90=null，而且 50ms 內算完。
  - `{tuc:10,k:10,rate:15,boom:0}` → tiny=true、不丟例外。
  - 白衣：`{tuc:5,k:5,rate:60,boom:0,whiteRate:10}` → p=1、avgScrolls≈5/0.6、avgWhite≈(5/0.6−5)×10、items90=1。
  - 白衣＋詛咒：`{tuc:5,k:5,rate:70,boom:0.5,whiteRate:20}` → 0<p<1、avgWhite>0。
  - `simTable(5,60,0)` 長度 5、`p` 隨 k 遞減。
- [ ] **Step 2:** 跑測試確認失敗。
- [ ] **Step 3: 實作。** 一件的過程用 DP（狀態：成功數、剩幾次），得到「這件衝成／放棄或爆掉」各在第幾張結束的機率。停手規則：成功數到 k 停；剩下次數 < 還差張數就停（放棄）。`scrolls90`：用「到第 t 張為止已衝成」的累積機率找最小 t ≥ 0.9；t 的上限取 `items90 × tuc`（tiny 不算）。白衣：沒爆的失敗不扣次數，所以一件不爆就一定衝成；每次補回平均 `100/whiteRate` 張白衣；`scrolls90` 照一般卷張數算、白衣只給平均。
- [ ] **Step 4:** 測試全過、`tsc` 過，commit。

### Task 3: 頁面 `/plan/scroll`

**Files:**
- Create: `src/app/plan/scroll/page.tsx`、`src/app/plan/scroll/ScrollSim.tsx`、`src/app/plan/scroll/parts.tsx`（挑選清單、結果表）、`src/lib/scroll-sim/pick.ts`＋`src/lib/scroll-sim/__tests__/pick.test.ts`
- Modify: `src/lib/site-pages.ts`（加 `{ path: "/plan/scroll", name: "衝卷模擬", what: "選裝備跟卷軸，算衝到想要的張數要準備多少", priority: 0.7 }`）、`src/app/sitemap.ts`（若它不是從 site-pages 自動帶）

**Interfaces:**
- Consumes: `simTable`（Task 2）、`ScrollSimData`（Task 2 types）、`public/data/scroll-sim.json`（用 fetch 讀，跟站上其他 `/data/*.json` 頁面同一套讀法）。
- Produces（`pick.ts`）：
  ```ts
  export function scrollsFor(data: ScrollSimData, equip: SimEquip): SimScroll[];     // slot === equip.s 或 only 含 equip.id；成功率高到低
  export function defaultScroll(list: SimScroll[]): SimScroll | null;               // 攻擊 > 魔力 > 其他（看 stats 第一個 k 含「攻擊」「魔力」），同類挑 rate 60，沒有就最高
  export function findScroll(data: ScrollSimData, id: number): SimScroll | null;    // 認 ids 裡任何一個
  export function rowLabel(k: number, s: SimScroll): string;                        // "3 張（物理攻擊力 +6、幸運 +3）"
  ```

- [ ] **Step 1:** `pick.test.ts` 失敗測試：帽子挑得到頭盔卷；`only` 專用卷只對那件出現；`defaultScroll` 手套挑「手套攻擊卷軸60%」；`findScroll` 用 2040826 跟 2040804 都找到同一筆；`rowLabel(3, 短劍攻擊卷軸60%)` = `"3 張（物理攻擊力 +6、幸運 +3）"`；網址 id 不存在回 null。
- [ ] **Step 2:** 實作 `pick.ts`，測試過。
- [ ] **Step 3:** 頁面照 spec「頁面」一節＋候選 C 版面（`candidates.mjs` 的 `C`）：
  - 上卡：裝備列、卷軸列（說明行：「成功率 60%・物理攻擊力 +2・失敗不會爆」／「失敗 50% 機率爆掉」／「失敗一定爆掉」；`src:false` 再加「・目前查不到哪裡拿」）。按「換」打開挑選清單（有搜尋框；裝備依 `s` 分組、可打字找名字；卷軸清單只列 `scrollsFor`）。白衣開關，開了出現 10%／20% 二選一＋「白衣卷軸單價」。單價欄 `inputMode="numeric"`。
  - 下卡：表格欄位「要成功」「一件衝成」「平均要」「九成機率要準備」；有單價多「平均花費」；白衣開多「白衣平均」。最後一行底色 `color-mix(in srgb, var(--maple) 10%, transparent)`。數字格式：機率一位小數＋%（tiny 寫「不到 0.1%」），平均「12.9 件・30 張」，九成「64 張・29 件」，tiny 兩欄寫「幾乎衝不到」，錢用 `toLocaleString("zh-TW")`＋「楓幣」。
  - 表下：沒填單價寫「填了單價就算得出總共要花多少」；填了寫「九成機率要準備的錢：約 X 楓幣（卷軸 64 張＋裝備 29 件）」，白衣開著加「（白衣照平均張數算）」，這行只對最後一行（全成功）算。說明「從全新裝備算；剩下的次數不夠衝到就換一件，不浪費卷軸。成功率照遊戲裡卷軸說明。」；詛咒卷多一行「失敗有 50% 機率爆掉，爆掉那件就沒了」（100% 寫「失敗一定爆掉，爆掉那件就沒了」）。
  - 空狀態：沒挑裝備「先挑一件裝備跟一張卷軸」；只帶 sc 裝備欄寫「先挑一件裝備」，挑裝備清單只列這張卷能用的。
  - 網址：`?eq=&sc=` 跟著選擇用 `router.replace` 更新（不新增瀏覽紀錄）；讀網址時 id 不合法當沒帶。
  - 手機 390：表格外層 `overflow-x:auto` 只在表格內捲，頁面本身不能橫向捲；表格字 13～14px。
  - `page.tsx` metadata：title「衝卷模擬｜衝到幾張要準備多少卷軸」、description 一句白話、canonical `/plan/scroll`。
- [ ] **Step 4:** `tsc` 過、vitest 全過；dev server（`node node_modules/next/dist/bin/next dev --webpack -p 9401`）打開 `/plan/scroll?eq=1082002&sc=2040804` 看表格第 5 行是 7.8%、「12.9 件・30 張」、「64 張・29 件」。刪掉 dev server 產生的 AGENTS.md／CLAUDE.md（不要 commit）。commit。

### Task 4: 入口、驗收腳本、文件

**Files:**
- Modify: `src/app/db/items/ItemDb.tsx`（卷軸卡、可衝裝備卡多一個連結）、`README.md`（頁面清單＋scroll-sim.json 說明＋驗收腳本用法）
- Create: `scripts/verify/scroll-shot.mjs`（照 `scripts/verify/speed-shot.mjs` 的寫法，無頭 Chrome、埠 9402）

**Interfaces:**
- Consumes: `findScroll`（Task 3）判斷這張卷有沒有收進模擬；裝備看 `eq.tuc > 0`。ItemDb 要用 scroll-sim.json 判斷的話用 fetch 晚載，不要讓查資料頁第一格變慢；或改用「卷軸 `s==="卷軸"` 且名字結尾有 %」這種便宜判斷，點進去對不到就顯示空狀態——**選便宜判斷**。

- [ ] **Step 1:** ItemDb 卷軸卡（`s === "卷軸"` 且名字結尾 `\d+%`、不是白衣、不含「混沌」）加 `<Link href={`/plan/scroll?sc=${item.id}`}>算衝卷要準備多少</Link>`；裝備卡（`eq?.tuc > 0`）加 `/plan/scroll?eq=${item.id}`。樣式照同卡片其他連結（例如 `/plan/farm?want=` 那顆）。
- [ ] **Step 2:** `scroll-shot.mjs`：開 `<base>/plan/scroll?eq=1082002&sc=2040804`，檢查（1）表格 5 行、第 5 行含「7.8%」「64 張・29 件」；（2）填卷軸單價 10000、裝備單價 5000 後多出「平均花費」欄；（3）開白衣後第 5 行一件衝成 100.0%；（4）`?eq=1002001` 之類帽子挑得到卷（卷軸列不是空狀態）；（5）390 寬 `document.documentElement.scrollWidth <= 390`；（6）查資料卷軸卡連結點進來網址帶 `sc=`；（7）`?eq=999999999&sc=abc` 不壞頁、顯示空狀態。白天／夜晚各截一張 390 跟 1280。印 PASS 數／總數。帽子 id 從 scroll-sim.json 實際挑一件 `s:"帽子"` 的。
- [ ] **Step 3:** 本機 dev server 跑 `node scripts/verify/scroll-shot.mjs http://localhost:9401 <輸出資料夾>` 全過；`scripts/verify/contrast-audit.mjs` 跑 `/plan/scroll`（`MSYS_NO_PATHCONV=1`）沒有新紅。
- [ ] **Step 4:** README 補：頁面清單一行、`public/data/scroll-sim.json` 由 build-gear 產（欄位一句話）、`scroll-shot.mjs` 用法。commit。
