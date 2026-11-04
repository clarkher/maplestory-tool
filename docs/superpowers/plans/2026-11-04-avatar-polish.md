# 紙娃娃 12 項優化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把紙娃娃第一版（v1.40）玩起來最卡的地方補齊：上一套、鎖定、兩欄小卡、跨類別搜尋、商城價、超大武器不被切、下載 4 倍、開場隨機、換裝中回饋與預載、一般裝備也能穿上看看、首頁入口、分享預覽。

**Architecture:** 能測的邏輯都拆成 `src/lib/avatar/` 的純函式（隨機加鎖、上一套、舞台擺放、清單搜尋、分享連結），`src/app/plan/avatar/` 只接線。分享預覽是一支新的 route handler（Vercel 直接跑、Cloudflare 由 `cf/worker.ts` import），不讀資料檔、不連資料庫。

**Tech Stack:** Next.js 16（App Router）、React、TypeScript、vitest、node:test（pipeline）、無頭 Chrome（`scripts/verify/`）。

**Spec:** `docs/superpowers/specs/2026-11-04-avatar-polish-design.md`

## Global Constraints

- 註解、測試名、文案全繁體中文，零簡體；UI 禁 emoji，圖示一律 `src/components/Icons.tsx` 的 inline SVG。
- 使用者看得到的字照 spec 逐字，不自己潤；顏色用 CSS 變數，實心按鈕字用 `--on-accent`，不寫死白字。
- 375 寬頁面不橫捲；按鈕用 `tap-safe`（高 44px）。
- 跟旁邊程式一樣的註解密度與寫法；不加新套件。
- commit 訊息 `v1.41: ` 開頭，最後一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不准 `git stash`；暫存檔放 session scratchpad；不動線上資料庫。
- `next dev` 會在 worktree 自動產生 `AGENTS.md`、`CLAUDE.md`：刪掉、不要 commit。
- 跑 `npm run data:gear`（沒有 `data/raw/artale.json` 時）會把 `public/data/gear.json` 弄差：跑完一定 `git checkout -- public/data/gear.json`，確認只有 `avatar.json` 變。
- 單支測試：`npx vitest run <檔案>`；pipeline：`node --test pipeline/lib/avatar.test.mjs`。

## Review Focus

1. maplestory.io 回的圖快取裡沒有 CORS 標頭（帶 crossOrigin 載失敗）：舞台要退回不帶 crossOrigin 照畫，不能顯示「載不出來」（Task 8 第 11 項）。
2. 鎖住的東西跟隨機穿搭的互斥規則撞在一起：隨機再多次，鎖住的 id 都不能變、也不能出現互斥的組合（Task 2 測試）。
3. 開場隨機跟「重置」：重置後同一頁不會自己再隨機；帶任何參數都不隨機；換網址途中不閃白 T（Task 4、Task 8 第 1 項）。
4. 分享連結被亂改：`w=<script>`、超長、缺 `h`，不能注入 HTML、不能 500、不能組出外部圖片網址（Task 7 測試）。
5. 重新整理後上一套、鎖定的字串壞掉或舊版格式：當作沒有，不能讓頁面掛掉（Task 2 測試）。

---

### Task 1: avatar.json 加商城價

**Files:**
- Modify: `pipeline/lib/avatar.mjs`、`pipeline/lib/avatar.test.mjs`、`pipeline/verify.mjs`（紙娃娃那段，約 276–295 行）
- Modify: `src/lib/avatar/types.ts`、`src/lib/avatar/__tests__/data.test.ts`
- Regenerate: `public/data/avatar.json`

**Interfaces:**
- Consumes: `items.json` 每筆的 `sp`：`{ p, n?, m?, pr, k?, c?, u?, e? }`；`p === "商城" && c === 1` 是商城樂豆點，`k` 是一組幾個。
- Produces: `AvatarItem.pr?: number`（商城單件的樂豆點）；`export const MIN_SHOP_PRICED = 300`（`pipeline/lib/avatar.mjs`）。

- [ ] **Step 1: 寫失敗測試**（`avatar.test.mjs`）

```js
test("商城價：只收商城單件的樂豆點，多個價錢取最低；整組、楓幣店、活動店不算", () => {
  const item = (id, sp) => ({ id, n: "測試帽子", c: "時裝", s: "帽子", eq: {}, sp });
  const msio = { twms: [1000001, 1000002, 1000003, 1000004], jms: [], checked: [] };
  const out = buildAvatar([
    item(1000001, [{ p: "商城", pr: 80, c: 1 }, { p: "商城", pr: 60, c: 1 }]),
    item(1000002, [{ p: "商城", pr: 1980, k: 10, c: 1 }]),
    item(1000003, [{ p: "弓箭手村", pr: 500 }, { p: "活動", pr: 3, u: "萬聖節硬幣", e: "2026-11-11T23:59+08:00" }]),
    item(1000004, undefined),
  ], msio).items;
  const pr = id => out.find(i => i.id === id).pr;
  assert.equal(pr(1000001), 60);
  assert.equal(pr(1000002), undefined);
  assert.equal(pr(1000003), undefined);
  assert.equal(pr(1000004), undefined);
});
```

`data.test.ts` 加：`avatar.items.filter(i => i.pr)` 件數 `>= MIN_SHOP_PRICED`、每件都是 `cash` 而且 `pr > 0`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test pipeline/lib/avatar.test.mjs`
Expected: FAIL（`pr(1000001)` 是 undefined）

- [ ] **Step 3: 實作**：`buildAvatar` 的 `out` 迴圈算 `pr`，有才寫；`types.ts` 的註解跟型別加 `pr`；`verify.mjs` 加一條 `check("紙娃娃有商城價的件數合理", n >= MIN_SHOP_PRICED, ...)`（防上游改版漏抽 `sp`）。

- [ ] **Step 4: 重建資料**

Run: `npm run data:gear && git checkout -- public/data/gear.json && git status --short`
Expected: 只有 `public/data/avatar.json` 跟本任務改的檔；`avatar.json` 有 `pr` 的 587 件（±每日資料更新）。

- [ ] **Step 5: 跑測試確認通過**

Run: `node --test pipeline/lib/avatar.test.mjs && npx vitest run src/lib/avatar/__tests__/data.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**：`v1.41: 紙娃娃資料加商城價（點裝 587 件），verify 擋上游漏抽`

---

### Task 2: 隨機加鎖、上一套（純函式）

**Files:**
- Modify: `src/lib/avatar/random.ts`、`src/lib/avatar/__tests__/random.test.ts`
- Create: `src/lib/avatar/looks.ts`、`src/lib/avatar/__tests__/looks.test.ts`

**Interfaces:**
- Consumes: `outfit.ts` 的 `Outfit`、`outfitQuery`、`parseOutfit`、`wearItem`。
- Produces（`looks.ts`）：

```ts
export type LockKey = "hair" | "face" | "skin" | SlotKey;
export function parseLocks(text: string): Set<LockKey>;            // 「hair,cap」；認不得的丟掉、空字串＝空集合
export function locksText(locks: ReadonlySet<LockKey>): string;    // 固定順序：hair,face,skin,再照 SLOT_ORDER（outfit.ts 要 export）
export function liveLocks(locks: ReadonlySet<LockKey>, o: Outfit): Set<LockKey>; // 裝備格沒穿東西的鎖丟掉；hair、face、skin 永遠留著
export function sameLook(a: Outfit, b: Outfit): boolean;           // g、skin、hair、face、wear 都一樣（不看 pose、emo、flip）
export function pushLook(history: string, o: Outfit): string;      // history 是 JSON 字串陣列；存 outfitQuery（pose、emo、flip 歸預設）；最多 30，丟最舊
export function peekLook(history: string): string | null;          // 最後一筆（可能是 ""＝全預設），沒有回 null
export function popLook(history: string): string;                  // 拿掉最後一筆，回新字串
export function restoreLook(query: string, current: Outfit, data: AvatarData): Outfit; // parseOutfit 後 pose、emo、flip 用 current 的
```
- Produces（`random.ts`）：`randomOutfit(data, base, rng = Math.random, locks: ReadonlySet<LockKey> = new Set())`。沒傳 locks 時 rng 的消耗順序跟現在一模一樣（既有種子測試不能改）。

- [ ] **Step 1: 寫失敗測試**（用真的 `public/data/avatar.json`，寫法照現有 `random.test.ts`）

```ts
const seeded = (n: number) => { let s = n; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const base = (wear: Outfit["wear"]): Outfit => ({ ...defaultOutfit(0), wear, hair: 30030, face: 20000 });
const ONE_HAND = data.items.find(i => i.k === "weapon" && i.r && !i.h && i.g !== 1)!.id;
const TWO_HAND = data.items.find(i => i.k === "weapon" && i.r && i.h && i.g !== 1)!.id;
const SHIELD = data.items.find(i => i.k === "shield" && i.r && i.g !== 1)!.id;
const OVERALL = data.items.find(i => i.k === "overall" && i.r && i.g !== 1)!.id;
const COAT = data.items.find(i => i.k === "coat" && i.r && i.g !== 1)!.id;

it("鎖住的 200 次都不變：髮型含顏色、臉型、膚色、裝備", ...);
it("鎖套服：200 次都沒有上衣、褲裙", ...);
it("鎖上衣：200 次都沒有套服、褲裙照挑（200 次裡至少一次有褲裙）", ...);
it("鎖盾牌：200 次武器都是單手、盾牌還在", ...);
it("鎖雙手武器：200 次都沒有盾牌", ...);
it("鎖單手武器：200 次裡有配盾牌也有沒配的", ...);
it("鎖了空的格子當沒鎖：照常挑，不會丟錯", ...);
it("沒傳 locks：同一個種子結果跟不傳第四個參數一樣", ...);

// looks.test.ts
it("pushLook 第 31 筆丟最舊的；peek 拿最新；pop 之後 peek 拿前一筆", ...);
it("全預設的穿搭存成空字串，peek 回 \"\" 不是 null", ...);
it("history 字串壞掉（\"{\"、\"123\"、\"[1,2]\"、\"\"）當成沒有：peek 回 null、push 從頭開始", ...);
it("parseLocks 認不得的丟掉：\"hair,xxx,cap,\" → {hair, cap}；locksText 順序固定", ...);
it("liveLocks：cap 沒穿就丟掉、hair 留著", ...);
it("sameLook 不看動作、表情、翻面；restoreLook 用現在的動作、表情、翻面", ...);
```

（`...` 由實作者依斷言寫完，種子跟 200 次要真的跑；每條都要先紅。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/avatar/__tests__/random.test.ts src/lib/avatar/__tests__/looks.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**：`randomOutfit` 先用 `liveLocks` 過濾，wear 從鎖住的那幾件開始。

```
衣服：鎖 overall → 都不挑；鎖 coat 或 pants → 沒鎖的那件照挑、不挑 overall；都沒鎖 → 照舊 50% 二選一
鞋子、手套、帽子、披風：沒鎖才挑
武器：沒鎖才挑；鎖了 shield 就只從單手（!h）裡挑
眼飾、臉飾、耳環：沒鎖才 50%
盾牌：沒鎖、而且武器存在且單手才 50%
```

- [ ] **Step 4: 跑測試確認通過**（同 Step 2 指令）

- [ ] **Step 5: Commit**：`v1.41: 紙娃娃隨機穿搭可以鎖部位、上一套的純函式`

---

### Task 3: 舞台照實際範圍擺、換裝中、下載 4 倍

**Files:**
- Create: `src/lib/avatar/stage-fit.ts`、`src/lib/avatar/__tests__/stage-fit.test.ts`
- Modify: `src/app/plan/avatar/Stage.tsx`、`src/app/plan/avatar/useAvatarActions.ts:54-67`

**Interfaces:**
- Produces（`stage-fit.ts`）：

```ts
/** 這張圖從腳（圖正中間）往上、往下、往左右最遠畫到幾像素（1 倍） */
export type Reach = { up: number; down: number; half: number };
export function alphaReach(pixels: Uint8ClampedArray, w: number, h: number): Reach | null; // 全透明回 null
export const unmeasured = (w: number, h: number): Reach => ({ up: h / 2, down: 0, half: w / 2 }); // 沒量到：照 v1.40 算法
export function fitStage(reaches: Reach[], box: { w: number; h: number } | null, base: number, minGround: number, dpr: number): { scale: number; ground: number };
```

`fitStage` 算法：`fit = min(base, (box.w-16)/(2*half), (box.h-minGround-8)/up, (box.h-12)/(up+down))`（up、down、half 取所有格最大）；`fit < base` 時 `scale = floor(fit*dpr)/dpr`（≤0 就用 fit）；`ground = max(minGround, down*scale+4)`。
- Produces（`Stage.tsx`）：`export function preloadFrame(url: string): void`（清掉舊的預載、記住這張的 Promise）；Stage 多一個 prop `onBusy?: (busy: boolean) => void`。`LOAD_ERROR`、`LOAD_TIMEOUT_MS` 不變。

- [ ] **Step 1: 寫失敗測試**

```ts
const BOX = { w: 309, h: 248 };
it("一般角色：2 倍、地面線 40（跟 v1.40 一樣，腳不跳）", () => {
  expect(fitStage([{ up: 60, down: 5, half: 40 }], BOX, 2, 40, 1)).toEqual({ scale: 2, ground: 40 });
});
it("超大武器（1702861 量到的）：下面不切、上面不切", () => {
  const r = { up: 87, down: 46, half: 77 };
  for (const dpr of [1, 2, 3]) {
    const { scale, ground } = fitStage([r], BOX, 2, 40, dpr);
    expect(r.down * scale).toBeLessThanOrEqual(ground);
    expect(r.up * scale + ground).toBeLessThanOrEqual(BOX.h);
    expect(r.half * 2 * scale).toBeLessThanOrEqual(BOX.w);
  }
});
it("電腦版舞台 300 高放得下：2 倍不縮、地面線抬到 96", () => {
  expect(fitStage([{ up: 87, down: 46, half: 77 }], { w: 417, h: 300 }, 2, 40, 1)).toEqual({ scale: 2, ground: 96 });
});
it("多格取最大；box 還沒量到回 base 跟 minGround", ...);
it("unmeasured 的結果跟 v1.40 的 fitScale 一樣（h/2 放得進地面線以上）", ...);
it("alphaReach：只有腳底下一點點不透明時 up 0、down 對；全透明回 null", ...);
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/avatar/__tests__/stage-fit.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作 `stage-fit.ts`，改 `Stage.tsx`**
  - `Frame` 多 `reach: Reach`、`cors: boolean`。`loadFrame`：先 `crossOrigin="anonymous"` 載，用 canvas 量 `alphaReach`（量失敗或全透明就 `unmeasured`）；帶 crossOrigin 載失敗就不帶再要一次（`cors: false`、`unmeasured`）；兩次都失敗才 reject；`LOAD_TIMEOUT_MS` 算整趟。
  - `<img>` 的 `crossOrigin` 跟 `frame.cors` 一致；`bottom` 用 `fitStage` 的 `ground`；拿掉舊的 `fitScale`。
  - `preloadFrame`：模組層一個 `Map<string, Promise<Frame>>`，新預載先 `clear()`；Stage 要第 0 格時先看 Map，有就直接用、也不等 `WAIT_MS`。Promise 要接 catch 免得未處理的 rejection。
  - 換裝中：`status === "loading"` 從真的去要圖算起（不含 `WAIT_MS` 的等待）持續超過 150ms 才算（內部一個延遲旗標）：沒有舊圖時照舊中間大轉圈；舊圖 `opacity: 0.45`、舞台中間大轉圈（取代角落小轉圈）；同一個旗標變化時呼叫 `onBusy`。快的不閃。
  - `useAvatarActions`：下載 `resize: 4`，註解同步（「存第 0 格、4 倍、裁剛好」）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/avatar/__tests__/stage-fit.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**：`v1.41: 紙娃娃舞台照實際畫到的範圍擺（超大武器不被切）、換裝中、下載 4 倍`

---

### Task 4: 角色卡：上一套、鎖、兩欄小卡、開場隨機、預載

**Files:**
- Create: `src/app/plan/avatar/useRandomDeck.ts`、`src/app/plan/avatar/useSessionText.ts`
- Modify: `src/app/plan/avatar/AvatarSim.tsx`、`src/components/Icons.tsx`

**Interfaces:**
- Consumes: Task 2 的 `looks.ts`、`randomOutfit(data, base, rng, locks)`；Task 3 的 `preloadFrame`、`Stage` 的 `onBusy`。
- Produces: `useSessionText(key: string): [string, (next: string) => void]`（sessionStorage 固定 key、初值空字串、讀寫都 try/catch，第一次畫跟伺服器一樣是空字串，掛上去再讀）；`LockIcon({ open, size, className })`（`Icons.tsx`，同 `base()` 寫法）；`useRandomDeck(data, outfit, locks, idle): { draw: () => Outfit }`；鎖頭按鈕掛 `data-lock={key}`（Task 8 認它）。

- [ ] **Step 1: 接線**（這個任務是接線，邏輯都在 Task 2、3 測過；驗收在 Task 8）
  - `useSessionText("avatar:history")`、`useSessionText("avatar:locks")`（不能用 `useVisitState`：沒有 Navigation API 的瀏覽器它照網址記，這頁每換一件網址就變）。
  - `commit(next)`：`sameLook` 不一樣才 `pushLook(history, 現在)`；鎖用 `liveLocks` 修剪；換網址。查資料 `try=` 換正式網址、開場隨機走不記上一套的路（直接 `router.replace`）。
  - 「上一套」：`peekLook` 拿到才 `restoreLook`、`popLook`、換網址（不再 push）；沒有就 `disabled`（樣式同 `Action` 的 disabled 變淡，但游標不是 wait）。
  - 「重置」：`commit(defaultOutfit(g))`，鎖清空。
  - 「隨機穿搭」：`deck.draw()`，第一次按之後 `idle` 才開始預載；字在 `onBusy` 為真時變「換裝中…」，還是按得下去。
  - 按鈕移到小卡上面：第一排 `grid-cols-[2fr_1fr]`「隨機穿搭」「上一套」，第二排三等分「重置」「下載」「分享」。
  - 小卡：標題「穿了什麼」＋小字「點鎖頭鎖住，點小卡脫掉」；`ul[aria-label='穿了什麼']` 留著，`grid-cols-2 gap-1.5`；`li` 裡兩顆並排的按鈕（不能巢狀）：本體（`aria-label` 照舊）、鎖頭（`aria-label` 是 `鎖住{類別}`／`解開{類別}`、`aria-pressed`、`data-lock`，至少 36px 寬、跟小卡同高）。鎖住：`border-[color:var(--maple)] bg-[color:var(--maple-wash)]`、鎖頭實心 `--maple`；沒鎖：開著的鎖 `ink-faint`。名字 `line-clamp-2`、12px。
  - 開場隨機：畫面狀態 `opening: Outfit | null`。資料到了、網址 `toString()` 是空的、而且是這次打開就空的（不是按重置變空的）→ 算一套放進 `opening`，`outfit` 先用它（不先畫白 T），同時 `router.replace`；網址有參數之後把 `opening` 清掉。
  - 電腦版角色卡：`lg:max-h-[calc(100dvh-96px)] lg:overflow-y-auto`（比螢幕高時裡面自己捲）。
  - `useRandomDeck`：`deckKey = g|pose|emo|flip|locksText|鎖住那些東西的 id`；`idle` 為真、已經按過一次、`navigator.connection?.saveData` 不是 true 才預載；`randomOutfit` 算一套、`preloadFrame(characterUrl(next, data, { frame: 0, resize: 1, mode: 4 }))`；`draw()` 回那一套（key 對不上或沒有就現算）並清掉；動作、表情、翻面、性別、鎖一變 key 就重算。

- [ ] **Step 2: 自己看一輪**

Run: `npx tsc --noEmit && npx eslint src/app/plan/avatar`，再開本機（`next dev -p 9381 --webpack`）用瀏覽器看 375 寬跟 1280 寬：小卡兩欄不橫捲、鎖頭點得到、上一套變淡。
Expected: 沒有型別、lint 錯；畫面跟 spec 的候選 B 一致。

- [ ] **Step 3: Commit**：`v1.41: 紙娃娃加上一套、鎖定、兩欄小卡、開場隨機、預載下一套`

---

### Task 5: 挑衣服卡：跨類別搜尋、只看商城有賣、價錢

**Files:**
- Create: `src/lib/avatar/list.ts`、`src/lib/avatar/__tests__/list.test.ts`
- Modify: `src/app/plan/avatar/Picker.tsx`

**Interfaces:**
- Consumes: Task 1 的 `AvatarItem.pr`。
- Produces（`list.ts`，從 `Picker.tsx` 搬 `candidates`、`Entry`、`coloursOf` 過來）：

```ts
export type TabKey = "hair" | "face" | "skin" | SlotKey;  // Picker.tsx 改 re-export
export type Entry = { kind: "hair" | "face"; style: AvatarStyle } | { kind: "skin"; skin: AvatarSkin } | { kind: "item"; item: AvatarItem };
export function candidates(data: AvatarData, g: Gender, tab: TabKey, text: string, shopOnly?: boolean): Entry[];
export function searchGroups(data: AvatarData, g: Gender, text: string, order: TabKey[], current: TabKey, shopOnly?: boolean): { tab: TabKey; entries: Entry[] }[];
```

- [ ] **Step 1: 寫失敗測試**（真資料）

```ts
const ORDER: TabKey[] = ["hair", "face", "skin", "cap", "overall", "coat", "pants", "shoes", "glove", "cape", "weapon", "eyeAcc", "faceAcc", "earrings", "shield"];
it("搜尋跨類別：目前分頁那類排第一，其他照分頁順序；空的類別不列", () => {
  const groups = searchGroups(data, 0, "楓葉", ORDER, "weapon");
  expect(groups[0].tab).toBe("weapon");
  expect(groups.map(g => g.tab)).toEqual(["weapon", ...ORDER.filter(t => t !== "weapon" && groups.some(g => g.tab === t))]);
  expect(groups.every(g => g.entries.length > 0)).toBe(true);
});
it("女生搜尋不出現只有男生能穿的", ...);
it("膚色也搜得到：搜「奶油」有 skin 這一組", ...);
it("只看商城有賣：沒有髮型、臉型、膚色、一般裝備，每件都有 pr", ...);
it("分頁清單只看商城有賣：帽子全有 pr，順序跟沒開時的相對順序一樣", ...);
it("沒開時既有順序不變：點裝在前、畫得出來的在前", ...);
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/avatar/__tests__/list.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作 `list.ts`，改 `Picker.tsx`**
  - placeholder、aria-label 固定「搜尋髮型、臉型、裝備名稱」。
  - 有字時：分頁都 `aria-pressed=false`、藏色塊，上面一行「找到 N 件」，一組一組畫（`<h3>` 區頭「帽子（12）」，下面一樣的四欄格子）；`limit` 算所有組加起來的格子數，「再看 40 個」照舊。沒字時跟現在一樣。
  - 「只看商城有賣」：`useState(false)`，膠囊樣式；只在裝備分頁或有字時顯示；開著時旁邊小字「N 件」。切分頁不重設它，但 `limit` 回 40；髮型、臉型、膚色分頁不顯示也不套用。
  - 格子：`Cell` 多 `price?: number`，有就在名字下面一行 `{toLocaleString("en-US")} 樂豆點`（12px、`ink-soft`、不換行）。
  - 驗收認的 `data-tab`、`data-colour`、`data-cell`、`data-name`、`data-missing` 不動；檔頭註解同步。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/avatar/__tests__/list.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**：`v1.41: 紙娃娃搜尋不分類別、只看商城有賣、格子寫價錢`

---

### Task 6: 一般裝備也能穿上看看、首頁入口

**Files:**
- Modify: `src/lib/avatar/linkable.ts`、`src/lib/avatar/__tests__/linkable.test.ts`、`src/app/db/items/ItemDb.tsx:230-246`、`src/components/route/RouteHome.tsx:184-196`

**Interfaces:**
- Produces: `avatarLink(item, data)` 規則改成 `c` 是「時裝」或「裝備」、而且畫得出來。

- [ ] **Step 1: 改測試**（`linkable.test.ts`）

```ts
it("一般裝備畫得出來也有；不是時裝、裝備的沒有", () => {
  const eq = data.items.find((i) => !i.cash && i.r)!;
  expect(avatarLink({ id: eq.id, c: "裝備" }, data)).toBe(`/plan/avatar?try=${eq.id}`);
  expect(avatarLink({ id: 2000000, c: "消耗" }, data)).toBeNull();
  const bad = data.items.find((i) => !i.cash && !i.r);
  if (bad) expect(avatarLink({ id: bad.id, c: "裝備" }, data)).toBeNull();
});
```

把舊的「`1040002` 是裝備所以 null」那條換掉（1040002 現在要有）。「每個有按鈕的 id 真的穿得上」那條留著，範圍自動變大。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/avatar/__tests__/linkable.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**
  - `linkable.ts` 改規則與檔頭註解。
  - `ItemDb.tsx`：`isFashion` 改 `canWear = item.c === "時裝" || item.c === "裝備"`（連帶改註解）。
  - `RouteHome.tsx`：萬聖節那段後面（不受日期影響）放同樣式的 `<Link href="/plan/avatar">`：「紙娃娃」＋ `block text-[13px] font-medium ink-soft` 的「換髮型、穿點裝，看角色穿起來的樣子」＋ `ChevronRight`。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/avatar/__tests__/linkable.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**：`v1.41: 一般裝備也能穿上看看、首頁加紙娃娃入口`

---

### Task 7: 分享預覽

**Files:**
- Create: `src/lib/avatar/share.ts`、`src/lib/avatar/__tests__/share.test.ts`、`src/app/api/avatar/share/route.ts`
- Modify: `src/lib/avatar/render.ts`、`cf/worker.ts`、`cf/worker.test.ts`、`src/app/robots.ts`、`src/app/plan/avatar/useAvatarActions.ts:88-108`

**Interfaces:**
- Consumes: `render.ts`（改 export `MSIO`、`part`、`stanceFor` 接受 `{ id: number } | undefined`、新的 `msioUrl(parts, stance, frame, { resize, mode, flip })`；`characterUrl` 改用它，輸出網址一個字都不變）。route 手上沒有資料檔：`w` 裡前三碼 143、144 的那件當武器傳給 `stanceFor`（其他武器結果都是 stand1／walk1）。
- Produces（`share.ts`，不 import 任何資料檔，Worker 會打包它）：

```ts
export function shareQuery(o: Outfit, data: AvatarData): string;   // g（女才寫）、s、h、f、w 一定寫、p、e、x，加 j＝要用日服畫的 id
export function readShare(params: URLSearchParams): { page: string; image: string | null }; // page＝/plan/avatar?...（不含 j）；缺 s/h/f 時 image 是 null
export function shareHtml(page: string, image: string): string;
```
- Route（`export const dynamic = "force-dynamic"`，寫法照 `src/app/api/boss/intervals/route.ts`）：`GET` → `image` 是 null 就 `Response.redirect(new URL(page, request.url), 302)`；否則 200 `text/html; charset=utf-8`、`cache-control: public, max-age=86400`、`x-robots-tag: noindex`。

- [ ] **Step 1: 寫失敗測試**（`share.test.ts`，`data` 用真的 avatar.json）

```ts
it("來回：shareQuery 給 readShare，page 開起來穿搭一樣", () => {
  const o = { ...defaultOutfit(1), skin: 2001, pose: "walk", emo: "smile", flip: true } as Outfit;
  const { page } = readShare(new URLSearchParams(shareQuery(o, data)));
  const back = parseOutfit(new URL(page, "https://x").searchParams, data);
  expect(back).toEqual(o);
});
it("圖片：每件照 j 分台服日服、膚色兩件、resize=4、renderMode=0、flipX、stand2（拿槍）、表情放臉型", ...);
it("page 不含 j；日服髮型顏色、日服裝備都進 j", ...);
it("壞值丟掉：w=1.<script>.2 只留 1、2；h=abc 當缺 h → image null；j=1&j=<x> 不出現在任何輸出", ...);
it("w 超過 12 件只取前 12 件；p、e 不認得就不帶", ...);
it("image 一律 https://maplestory.io/api/character/ 開頭（不接受外部網址）", ...);
it("shareHtml：og:title、og:description 逐字、og:image、twitter:card=summary、refresh 跟 location.replace 指向 page；& < \" 都跳脫", ...);
```

`worker.test.ts`：「五支 API」改「六支」，名單加 `/api/avatar/share`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/avatar/__tests__/share.test.ts cf/worker.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**
  - 文案照 spec：`og:title`「看看我的紙娃娃」、`og:description`「楓谷幫手紙娃娃：換髮型、穿點裝，看角色穿起來的樣子」、`og:site_name`「楓谷幫手」。
  - `cf/worker.ts` 的 `ROUTES` 加一條，`src/app/robots.ts` 兩條規則的 `allow` 改 `["/", "/api/avatar/share"]`。
  - `useAvatarActions.share`：`url = ${location.origin}/api/avatar/share?${shareQuery(outfit, data)}`；同時 `new Image().src = readShare(...).image`（先叫 maplestory.io 畫好）。`navigator.share`、複製、提示字照舊。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/avatar/__tests__/share.test.ts src/lib/avatar/__tests__/render.test.ts cf && npx tsc --noEmit`
Expected: PASS（`characterUrl` 既有測試不用改）

- [ ] **Step 5: Commit**：`v1.41: 紙娃娃分享連結有預覽圖`

---

### Task 8: 驗收腳本、文件、全套檢查

**Files:**
- Modify: `scripts/verify/avatar-shot.mjs`、`scripts/verify/README.md`、`README.md`、`docs/superpowers/specs/2026-11-04-avatar-polish-design.md`（有變再改）

**Interfaces:**
- Consumes: `data-lock`（Task 4）、`/api/avatar/share`（Task 7）、`data-*`（Task 5）。

- [ ] **Step 1: 改 `avatar-shot.mjs`**：既有第 2、9 項的 `open("")` 改成帶參數開（`?g=0`，保持白 T）；期望值一樣從受測站的 `/data/avatar.json` 算。新增（`check` 寫法照舊）：
  1. 開場：`open("")` 後網址有 `h=`、`w=`，舞台圖載好；按「重置」網址變空、停 2 秒還是空。
  2. 上一套：一開始按不了；按隨機→再按上一套，網址回到按之前（動作、表情不變）；重新整理後上一套還按得了。
  3. 鎖定：點 `[data-lock='hair']` → 隨機 3 次 `h` 都不變；按「重置」→ 鎖解開（`aria-pressed=false`）。
  4. 超大武器：`?w=1702861`（資料沒有就換 `data.items` 裡 `id` 開頭 1702 的另一件）、槍趴下 `?w=<第一把 144>&p=prone`：舞台圖的不透明範圍（用 `fetch(src,{cache:"reload"})`＋canvas 量，換算到畫面）上下左右都不超出舞台。
  5. 搜尋：搜「楓葉」至少兩個區頭、分頁都不亮；清掉搜尋回原分頁。
  6. 只看商城有賣：帽子分頁開起來，每格都有「樂豆點」；切髮型分頁鈕不見。
  7. 下載：攔 `URL.createObjectURL` 跟 `a.click`，檔名 `紙娃娃.png`、四角透明、預設角色寬 ≥ 150px（4 倍）。
  8. 分享：攔 `navigator.clipboard.writeText`，內容是 `/api/avatar/share?`；`fetch` 那個網址的文字有 `og:image`、`maplestory.io`；`navigate` 過去會落在 `/plan/avatar`、穿了什麼一樣。
  9. 一般裝備：`/db/items?id=1040002` 有「穿上看看」。
  10. 首頁入口：`/` 有連到 `/plan/avatar` 的「紙娃娃」。
  11. 快取沒 CORS：用 `Fetch` 把帶 `Origin` 標頭的 maplestory.io 請求 `failRequest`、其他放行，舞台還是畫得出來、沒有「載不出來」。
  12. 預載：按過一次隨機、等舞台閒下來約 3 秒，再按一次；新圖的 `performance.getEntriesByName(src)` 開始時間早於這次按的時間。
  - 第 1 項的 375 橫捲檢查、第 9 項的 1280 檢查照舊；1280 那項多驗角色卡下緣 ≤ 視窗高（裡面自己捲）。

- [ ] **Step 2: 跑驗收**

Run: 本機 `next dev -p 9381 --webpack` 起來後 `node scripts/verify/avatar-shot.mjs http://localhost:9381 "<scratchpad>/avatar-local"`
Expected: 全部 PASS；自己看每張截圖。

- [ ] **Step 3: 文件**：`README.md` 紙娃娃段補上一套、鎖定、搜尋、商城價、分享預覽（連結格式、robots、Cloudflare 額度）；`scripts/verify/README.md` 的項目數跟坑（第 11 項怎麼模擬）。

- [ ] **Step 4: 全套檢查**

Run: `npm test && npx next build`，dev server 上 `npm run verify:db`（73 項；memory：N10 偶發紅，單跑會過），`MSYS_NO_PATHCONV=1 node scripts/verify/contrast-audit.mjs`（用法見 `scripts/verify/README.md`，只看 `/plan/avatar`、`/` 的新字）。
Expected: 全綠；`AGENTS.md`、`CLAUDE.md` 沒進 git。

- [ ] **Step 5: Commit**：`v1.41: 紙娃娃驗收腳本補 12 項、README`
