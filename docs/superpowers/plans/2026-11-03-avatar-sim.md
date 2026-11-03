# 紙娃娃 /plan/avatar 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/plan/avatar`「紙娃娃」：選性別、髮型髮色、臉型瞳色、膚色、12 類裝備點裝，即時看角色（maplestory.io 畫），可隨機穿搭、下載透明 PNG、分享連結；查資料點裝／髮型／臉型卡加「穿上看看」。

**Architecture:** 建置時由 `pipeline/build-gear.mjs` 從 `public/data/items.json`＋凍結檔 `data/raw/msio-avatar.json`（哪些 id 在 maplestory.io 台服／日服畫得出來）產生 `public/data/avatar.json`。前端純邏輯放 `src/lib/avatar/`（穿搭狀態、網址、隨機、maplestory.io 網址），畫面放 `src/app/plan/avatar/`。角色圖由瀏覽器直接向 maplestory.io 要，不經我們的伺服器。

**Tech Stack:** Next.js 16 靜態輸出（Cloudflare Workers）、React 19、TypeScript、Tailwind、vitest（`src/**/*.test.ts`）、node:test（`pipeline/**/*.test.mjs`）、無頭 Chrome 驗收腳本（`scripts/verify/harness.mjs`）。

**Spec:** `docs/superpowers/specs/2026-11-03-avatar-sim-design.md`（拍板：1A 2A 3A 4A、版面 A、男女 A、隨機穿搭；候選圖 `docs/superpowers/specs/assets/2026-11-03-avatar-sim/A1.png`、`A2.png`，樣式參考同資料夾 `candidates.mjs`）

## Global Constraints

- 全部使用者看得到的字用繁體中文；**不准 emoji**（寫 .ts/.tsx 前掃 U+2300–23FF、U+25A0–25FF、U+1F000 以上），圖示用 `src/components/Icons.tsx` 既有的 inline SVG 或純文字。
- 不放假圖、假資料：maplestory.io 載不出來就寫「角色圖載不出來，等一下再過來」＋「再試一次」。
- 遊戲名詞用遊戲裡的字：膚色 8 種（奶油皮膚、日光浴皮膚、健康皮膚、乳白皮膚、淒涼皮膚、蒼白皮膚、貴族皮膚、華麗皮膚）、髮色 0～7（黑色、紅色、橘色、黃色、綠色、藍色、紫色、棕色）、瞳色 0～7（黑色、藍色、紅色、綠色、褐色、藍綠色、紫色、亮紫色）。
- 類別分頁順序與名稱：髮型、臉型、膚色、帽子、套服、上衣、褲裙、鞋子、手套、披風、武器、眼飾、臉飾、耳環、盾牌。
- 按鈕字照抄：「隨機穿搭」「重置」「下載」「分享」「穿上看看」「再看 40 個」「回到上面」「再試一次」；提示「已複製連結」「暫時看不到樣子」「這件暫時看不到樣子，先挑別件」。
- maplestory.io 來源固定：台服 `TWMS`／`256`、日服 `JMS`／`444`。
- 顏色只用站上 CSS 變數（`--paper`、`--ink`、`--maple`、`--on-accent`…；按鈕字用 `--on-accent`，不准寫死白字）；手機 375 寬不准橫向捲動。
- 新頁不進導覽列；要加進 `src/lib/site-pages.ts`。
- commit 訊息 `v1.40: …` 開頭，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`；分支 `feat/v1.40-avatar-sim`（已建、已推，設計文件已在上面）。

## Review Focus

1. **網址被亂改或舊連結**（id 不存在、性別不符、畫不出來、數字以外的字）：頁面照開，壞的那項換回預設，不能白屏（Task 4 `parseOutfit` 測試）。
2. **換性別時身上有對方性別的衣服**：那幾件脫掉、髮型臉型換成新性別預設，網址同步（Task 4 `setGender` 測試）。
3. **套服跟上衣褲裙、雙手武器跟盾牌互斥**：穿套服脫上衣褲裙，反之亦然；穿雙手武器脫盾牌，穿盾牌脫雙手武器（Task 4 `wearItem` 測試）。隨機穿搭也不能生出衝突組合（Task 5 測試跑 200 次）。
4. **maplestory.io 慢或掛掉、使用者連點**：舊圖留著不閃白、停 250ms 才送新請求、載失敗顯示錯誤不放假圖（Task 8 驗收腳本攔截 maplestory.io 請求回 503 測錯誤畫面）。
5. **上游資料加了新點裝但凍結檔沒比對過**：資料自動更新不能因此失敗，新道具一律「暫時看不到樣子」，`verify.mjs` 只印件數不擋（Task 3）。

---

## File Structure

| 檔案 | 負責 |
|---|---|
| `pipeline/lib/avatar.mjs`（新） | 純函式：分類、性別、髮色瞳色拆款、濾名字、候選 id、`buildAvatar` |
| `pipeline/lib/avatar.test.mjs`（新） | 上面的測試 |
| `pipeline/fetch-msio-avatar.mjs`（新） | 手動跑：抓 maplestory.io 兩份清單 → `data/raw/msio-avatar.json` |
| `data/raw/msio-avatar.json`（新，進版控） | 凍結檔 |
| `pipeline/build-gear.mjs`、`pipeline/verify.mjs`、`cache-headers.mjs` | 接上 avatar.json |
| `public/data/avatar.json`（新，進版控） | 前端資料 |
| `src/lib/avatar/types.ts`（新） | 型別 |
| `src/lib/avatar/outfit.ts`（新） | 穿搭狀態、預設、網址、穿脫、換性別 |
| `src/lib/avatar/random.ts`（新） | 隨機穿搭 |
| `src/lib/avatar/render.ts`（新） | maplestory.io 網址、動作對照、格數 |
| `src/lib/avatar/linkable.ts`（新） | 查資料「穿上看看」規則 |
| `src/lib/avatar/__tests__/*.test.ts`（新） | 上面四支的測試 |
| `src/lib/data.ts` | `loadAvatar`／`peekAvatar` |
| `src/app/plan/avatar/page.tsx`、`AvatarSim.tsx`、`Stage.tsx`、`Picker.tsx`（新） | 畫面 |
| `src/app/db/items/ItemDb.tsx` | 「穿上看看」按鈕 |
| `src/lib/site-pages.ts`、`src/lib/analytics.ts`、`README.md` | 頁面清單、事件、事件表 |
| `scripts/verify/avatar-shot.mjs`（新）、`scripts/verify/README.md` | 驗收腳本 |

---

### Task 1: 建置用純函式 `pipeline/lib/avatar.mjs`

**Files:**
- Create: `pipeline/lib/avatar.mjs`
- Test: `pipeline/lib/avatar.test.mjs`

**Interfaces:**
- Produces（全部 named export）：
  - `SLOT_KEYS`：`["cap","overall","coat","pants","shoes","glove","cape","weapon","eyeAcc","faceAcc","earrings","shield"]`
  - `avatarSlot(id: number): SlotKey | null`
  - `avatarGender(id: number): 0 | 1 | 2`（0 男、1 女、2 不分）
  - `hairStyleOf(id) → number`（`Math.floor(id/10)*10`）、`hairColorOf(id) → 0..9`（`id % 10`）
  - `faceStyleOf(id) → number`（百位數歸零）、`faceColorOf(id) → 0..9`（`Math.floor(id/100) % 10`）
  - `stripHairColor(name: string): string`
  - `keepName(name: string): boolean`
  - `isTwoHanded(item): boolean`
  - `SKINS`：`[{ id: 2000, n: "奶油皮膚" }, { id: 2001, n: "日光浴皮膚" }, { id: 2002, n: "健康皮膚" }, { id: 2003, n: "乳白皮膚" }, { id: 2004, n: "淒涼皮膚" }, { id: 2009, n: "蒼白皮膚" }, { id: 2010, n: "貴族皮膚" }, { id: 2011, n: "華麗皮膚" }]`（id 是身體；頭是 id+10000）
  - `avatarCandidates(items): number[]`：要拿去 maplestory.io 比對的 id（排序、不重複）
  - `buildAvatar(items, msio): AvatarData`（格式見 Task 3 的 `src/lib/avatar/types.ts`）

- [ ] **Step 1: 寫失敗測試**（`node:test`＋`node:assert/strict`，照 `pipeline/lib/scroll-sim.test.mjs` 的寫法）

```js
test("分類照 id 前三碼", () => {
  assert.equal(avatarSlot(1002140), "cap"); assert.equal(avatarSlot(1012000), "faceAcc");
  assert.equal(avatarSlot(1022073), "eyeAcc"); assert.equal(avatarSlot(1032000), "earrings");
  assert.equal(avatarSlot(1040002), "coat"); assert.equal(avatarSlot(1050000), "overall");
  assert.equal(avatarSlot(1060002), "pants"); assert.equal(avatarSlot(1072001), "shoes");
  assert.equal(avatarSlot(1082002), "glove"); assert.equal(avatarSlot(1092000), "shield");
  assert.equal(avatarSlot(1102000), "cape");
  for (const id of [1302000, 1312000, 1322000, 1332000, 1372000, 1382000, 1402000, 1412000, 1422000, 1432000, 1442000, 1452002, 1462000, 1472000, 1482000, 1492000, 1702310])
    assert.equal(avatarSlot(id), "weapon", String(id));
  for (const id of [1112957, 1122000, 1132000, 1142000, 1342004, 1602000, 30030, 20000]) assert.equal(avatarSlot(id), null, String(id));
});
test("性別：裝備千位數 0 男 1 女；髮型臉型千位數 0356 男、1478 女、29 不分", () => {
  assert.equal(avatarGender(1050000), 0); assert.equal(avatarGender(1051000), 1); assert.equal(avatarGender(1052000), 2);
  assert.equal(avatarGender(1702310), 2);
  for (const id of [30030, 33000, 35000, 36000, 40000, 43000, 20000, 23018, 25000]) assert.equal(avatarGender(id), 0, String(id));
  for (const id of [31470, 34000, 37000, 38000, 41000, 44910, 21009, 24025]) assert.equal(avatarGender(id), 1, String(id));
  for (const id of [32000, 39000, 42000, 22035]) assert.equal(avatarGender(id), 2, String(id));
});
test("髮型臉型拆款", () => {
  assert.equal(hairStyleOf(35767), 35760); assert.equal(hairColorOf(35767), 7);
  assert.equal(faceStyleOf(20723), 20023); assert.equal(faceColorOf(20723), 7);
});
test("髮色前綴拿掉", () => {
  assert.equal(stripHairColor("咖啡色可愛年下男髮型"), "可愛年下男髮型");
  assert.equal(stripHairColor("棕色中國女孩造型"), "中國女孩造型");
  assert.equal(stripHairColor("黑色嬉皮公主髮型 (女)"), "嬉皮公主髮型 (女)");
  assert.equal(stripHairColor("加加頭"), "加加頭");
});
test("名字要有中文、不能有韓文、不能是券", () => {
  assert.equal(keepName("Amdusias Hat"), false); assert.equal(keepName("[TW]7주년 기념 모자"), false);
  assert.equal(keepName("費倫髮型券"), false); assert.equal(keepName("6週年慶星光棒"), true);
});
test("雙手武器：islot WpSi，或沒寫 islot 時 140～146 開頭", () => {
  assert.equal(isTwoHanded({ id: 1402000, eq: { islot: "WpSi" } }), true);
  assert.equal(isTwoHanded({ id: 1702059, eq: { islot: "WpSi" } }), true);
  assert.equal(isTwoHanded({ id: 1302000, eq: { islot: "Wp" } }), false);
  assert.equal(isTwoHanded({ id: 1442000 }), true); assert.equal(isTwoHanded({ id: 1472103 }), false);
});
test("buildAvatar：髮型併款、瞳色看凍結檔、畫不出來排最後、點裝排前面、性別、膚色", () => {
  const items = [
    { id: 30030, n: "黑色活力冒險造型", c: "時裝", s: "外觀/角色" },
    { id: 30037, n: "棕色活力冒險造型", c: "時裝", s: "外觀/角色" },
    { id: 20000, n: "挑戰的臉型", c: "時裝", s: "外觀/角色" },
    { id: 1040002, n: "白棉T恤", c: "裝備", s: "上衣", eq: { islot: "Ma" } },
    { id: 1042311, n: "糖果T恤", c: "時裝", s: "上衣", eq: { islot: "Ma" } },
    { id: 1042999, n: "畫不出來的衣服", c: "時裝", s: "上衣" },
    { id: 1003995, n: "Amdusias Hat", c: "時裝", s: "帽子" },
    { id: 1402000, n: "木製大劍", c: "裝備", s: "雙手劍", eq: { islot: "WpSi" } },
  ];
  const msio = { twms: [12000, 12001, 12002, 12003, 12004, 12009, 12010, 12011, 20000, 20100, 20200, 30030, 30031, 1040002, 1042311, 1402000], jms: [30037], checked: [] }; // buildAvatar 不看 checked（build-gear 用它算「沒比對過」件數）
  const a = buildAvatar(items, msio);
  assert.deepEqual(a.hair, [{ id: 30030, n: "活力冒險造型", g: 0, ic: 30030, t: [0, 1], j: [7] }]);
  assert.deepEqual(a.face, [{ id: 20000, n: "挑戰的臉型", g: 0, ic: 20000, t: [0, 1, 2], j: [] }]);
  assert.deepEqual(a.items.filter(i => i.k === "coat").map(i => i.id), [1042311, 1040002, 1042999]);
  assert.equal(a.items.find(i => i.id === 1042311).cash, 1);
  assert.equal(a.items.find(i => i.id === 1042999).r, undefined);
  assert.equal(a.items.find(i => i.id === 1402000).h, 1);
  assert.equal(a.items.some(i => i.id === 1003995), false);
  assert.equal(a.skin.length, 8); assert.deepEqual(a.skin[0], { id: 2000, n: "奶油皮膚" });
});
test("候選 id：髮型每款 0～7 色、臉型每款 0～7 瞳色、12 類道具、膚色頭部", () => {
  const ids = avatarCandidates([{ id: 30037, n: "棕色活力冒險造型", c: "時裝", s: "外觀/角色" }, { id: 20000, n: "挑戰的臉型", c: "時裝", s: "外觀/角色" }, { id: 1040002, n: "白棉T恤", c: "裝備", s: "上衣" }]);
  for (const id of [30030, 30031, 30037, 20000, 20100, 20700, 1040002, 12000, 12011]) assert.ok(ids.includes(id), String(id));
  assert.equal(ids.includes(20800), false); assert.equal(ids.includes(30038), false);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test pipeline/lib/avatar.test.mjs`
Expected: FAIL（`Cannot find module './avatar.mjs'`）

- [ ] **Step 3: 實作 `pipeline/lib/avatar.mjs`**

規則（測試沒寫死、但要照做的）：
- 收哪些道具：`c` 是「裝備」或「時裝」、`avatarSlot(id)` 不是 null、`keepName(n)`。髮型臉型：`c:"時裝"`、`s:"外觀/角色"`、id 20000～29999（臉）／30000～69999（髮）、`keepName`。
- 武器 id 前三碼收 130～133、137、138、140～149、170；134（刀，副武器）、160（技能效果）不收。
- 性別：裝備 `Math.floor(id/1000) % 10` 0 男、1 女、其他不分；髮型臉型同一個千位數 0、3、5、6 男，1、4、7、8 女，2、9 不分（11/03 對過 maplestory.io `requiredGender` 跟名字帶男女的 17 筆）。
- `stripHairColor` 拿掉開頭 `黑色|紅色|橘色|黃色|綠色|藍色|紫色|棕色|咖啡色|褐色`。髮型一款的名字＝這款在 items.json 裡 id 最小那筆去掉前綴；`ic`＝那筆的 id（站上有它的小圖 `/assets/items/<ic>.png`）。臉型同理（臉型名字沒有顏色前綴）。
- `t`＝台服畫得出來的顏色碼（0～7）、`j`＝台服沒有但日服有的；兩個都空＝畫不出來。道具 `r: "t" | "j"`，畫不出來不給 `r`。`msio.twms`／`msio.jms` 是 id 陣列；先轉 Set。
- 膚色：頭部 id（12000+）在 twms 才收，全收的話是 8 種，順序照 `SKINS`。
- 排序：每一類（`k` 相同）畫得出來的在前、畫不出來的在後；畫得出來的裡面點裝（`c:"時裝"`，給 `cash: 1`）在前，一般裝備在後；同組 id 大的在前（新的在前）。髮型、臉型：畫得出來在前，id 大的在前。
- 輸出 `{ src: { t: "TWMS/256", j: "JMS/444" }, skin, hair, face, items }`，道具欄位只放 `id, n, k, g`，有才放 `cash: 1`、`r`、`h: 1`。

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test pipeline/lib/avatar.test.mjs`
Expected: PASS（7 tests）

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/avatar.mjs pipeline/lib/avatar.test.mjs
git commit -m "v1.40: 紙娃娃資料的純函式（分類、性別、髮色瞳色拆款）"
```

---

### Task 2: 凍結檔 `data/raw/msio-avatar.json`

**Files:**
- Create: `pipeline/fetch-msio-avatar.mjs`
- Create（產出、進版控）: `data/raw/msio-avatar.json`

**Interfaces:**
- Consumes: `avatarCandidates(items)`（Task 1）、`fetchJson`／`writeJson`／`readJson`／`humanBytes`（`pipeline/lib/http.mjs`）
- Produces: `data/raw/msio-avatar.json` ＝ `{ fetchedAt: string(ISO), twms: number[], jms: number[], checked: number[] }`；`twms` 是候選裡台服清單有的、`jms` 是候選裡台服沒有但日服有的、`checked` 是全部候選（都排序）。

- [ ] **Step 1: 寫腳本**

檔頭寫用法跟為什麼（照 `pipeline/fetch-msio.mjs` 的檔頭）：「maplestory.io 遇到它沒有的道具會默默不畫、照回 200（11/03 實測），所以畫不畫得出來要事先比對它的道具清單；台服 256、日服 444 是固定版本，抓過就不變，排程不打 maplestory.io。上游加了新點裝要手動重跑：`node pipeline/fetch-msio-avatar.mjs`」。
讀 `public/data/items.json` → `avatarCandidates` → 抓 `https://maplestory.io/api/TWMS/256/item/list`、`https://maplestory.io/api/JMS/444/item/list`（各幾十 MB，`fetchJson(url, { timeoutMs: 240000 })`）→ 寫檔 → 印候選數、台服數、日服補數、兩邊都沒有數。

- [ ] **Step 2: 跑一次**

Run: `node pipeline/fetch-msio-avatar.mjs`
Expected: 印出候選約 1 萬筆、台服 9 成以上、兩邊都沒有不到 5%；`data/raw/msio-avatar.json` 存在且 < 300 KB。

- [ ] **Step 3: Commit**

```bash
git add pipeline/fetch-msio-avatar.mjs data/raw/msio-avatar.json
git commit -m "v1.40: 抓 maplestory.io 台服日服清單存成紙娃娃凍結檔"
```

---

### Task 3: 產生 `public/data/avatar.json`、前端載入

**Files:**
- Create: `src/lib/avatar/types.ts`
- Modify: `pipeline/build-gear.mjs`（檔頭輸出清單加一行；`main()` 結尾 scroll-sim 那段後面）
- Modify: `pipeline/verify.mjs`（scroll-sim 檢查後面）
- Modify: `cache-headers.mjs`（scroll-sim 那條後面）
- Modify: `src/lib/data.ts`（`loadScrollSim` 後面）
- Create（產出、進版控）: `public/data/avatar.json`
- Test: `src/lib/avatar/__tests__/data.test.ts`

**Interfaces:**
- Consumes: `buildAvatar`（Task 1）、`data/raw/msio-avatar.json`（Task 2）
- Produces（`src/lib/avatar/types.ts`）：

```ts
export type SlotKey = "cap" | "overall" | "coat" | "pants" | "shoes" | "glove" | "cape" | "weapon" | "eyeAcc" | "faceAcc" | "earrings" | "shield";
export type Gender = 0 | 1;
export type Region = "t" | "j";
/** 一款髮型／臉型：id 是黑色（0 號）那個；t 台服畫得出的顏色碼、j 只有日服有的；ic 有小圖的 id */
export type AvatarStyle = { id: number; n: string; g: 0 | 1 | 2; ic: number; t: number[]; j: number[] };
/** k 類別、g 性別（2 不分）、cash 點裝、r 從哪畫（沒有＝畫不出來）、h 雙手武器 */
export type AvatarItem = { id: number; n: string; k: SlotKey; g: 0 | 1 | 2; cash?: 1; r?: Region; h?: 1 };
export type AvatarSkin = { id: number; n: string };
export type AvatarData = { src: { t: string; j: string }; skin: AvatarSkin[]; hair: AvatarStyle[]; face: AvatarStyle[]; items: AvatarItem[] };
```
- `loadAvatar(): Promise<AvatarData>`、`peekAvatar(): AvatarData | undefined`（`src/lib/data.ts`，寫法照 `loadScrollSim`：`fetch("/data/avatar.json", { cache: "no-cache" })`、失敗不記住）

- [ ] **Step 1: 寫失敗測試** `src/lib/avatar/__tests__/data.test.ts`：讀 `public/data/avatar.json`（照 `src/lib/scroll-sim/__tests__/linkable.test.ts` 的讀法）

```ts
it("件數合理", () => {
  expect(data.hair.length).toBeGreaterThan(400); expect(data.face.length).toBeGreaterThan(200);
  expect(data.skin.map((s) => s.n)).toEqual(["奶油皮膚", "日光浴皮膚", "健康皮膚", "乳白皮膚", "淒涼皮膚", "蒼白皮膚", "貴族皮膚", "華麗皮膚"]);
  for (const k of SLOT_KEYS) expect(data.items.filter((i) => i.k === k).length, k).toBeGreaterThan(20);
});
it("畫得出來的超過九成", () => {
  const drawable = data.items.filter((i) => i.r).length + data.hair.filter((h) => h.t.length + h.j.length).length;
  expect(drawable / (data.items.length + data.hair.length)).toBeGreaterThan(0.9);
});
it("男女都有得挑", () => {
  for (const g of [0, 1]) expect(data.hair.filter((h) => h.g === g || h.g === 2).length).toBeGreaterThan(150);
});
```
（`SLOT_KEYS` 在測試裡自己列一次 12 個字串。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/avatar/__tests__/data.test.ts`
Expected: FAIL（`ENOENT … avatar.json`）

- [ ] **Step 3: 接上建置**
- `build-gear.mjs`：讀 `data/raw/msio-avatar.json`（`readJson(…, null)`；沒有就**丟錯**「缺 data/raw/msio-avatar.json，先跑 node pipeline/fetch-msio-avatar.mjs」——它進版控，CI 一定有）→ `buildAvatar(items, msio)` → `writeJson(public/data/avatar.json)` → 印大小、各類件數、畫不出來件數、**候選裡不在 `checked` 的件數**（新道具，提示重跑抓取）。
- `verify.mjs`：`check` 檔案存在、髮型 ≥ 400、臉型 ≥ 200、膚色 8、每類 ≥ 20、畫得出來比例 ≥ 0.9。沒比對過的件數**只 `console.log`、不用 `check`**（資料自動更新不能因為上游加新點裝失敗）。
- `cache-headers.mjs`：`/data/avatar.json` 加 `public, max-age=0, must-revalidate`，註解照 scroll-sim 那條。
- `data.ts`：`loadAvatar`／`peekAvatar`，`ready.set("avatar", …)`。

- [ ] **Step 4: 產生資料、跑測試**

Run: `node pipeline/build-gear.mjs && node pipeline/verify.mjs && npx vitest run src/lib/avatar/__tests__/data.test.ts`
Expected: build-gear 印 `avatar.json` 大小（< 400 KB）；verify 全 PASS；vitest PASS。`git diff --stat public/data` 只有 `avatar.json` 新增（其他 json 沒變）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/avatar/types.ts src/lib/avatar/__tests__/data.test.ts pipeline/build-gear.mjs pipeline/verify.mjs cache-headers.mjs src/lib/data.ts public/data/avatar.json
git commit -m "v1.40: 產生紙娃娃資料 avatar.json，前端載入"
```

---

### Task 4: 穿搭狀態與網址 `src/lib/avatar/outfit.ts`

**Files:**
- Create: `src/lib/avatar/outfit.ts`
- Test: `src/lib/avatar/__tests__/outfit.test.ts`

**Interfaces:**
- Consumes: 型別（Task 3）
- Produces:

```ts
export type PoseKey = "stand" | "walk" | "alert" | "jump" | "prone" | "sit";
export type EmoKey = "default" | "smile" | "wink" | "angry" | "cry" | "troubled" | "bewildered" | "love";
export const POSES: { key: PoseKey; label: string }[];   // 站著、走路、警戒、跳、趴下、坐下
export const EMOS: { key: EmoKey; label: string }[];     // 一般、微笑、眨眼、生氣、哭、困擾、驚訝、愛心
export const HAIR_COLORS: { n: string; css: string }[];  // 0～7：黑色 #2b2b2b、紅色 #b8322a、橘色 #d9822b、黃色 #e3c34a、綠色 #4f8a3c、藍色 #3a6fb5、紫色 #7a4fa8、棕色 #7a5233
export const EYE_COLORS: { n: string; css: string }[];   // 0～7：黑色 #2b2b2b、藍色 #3a6fb5、紅色 #b8322a、綠色 #4f8a3c、褐色 #8a6a3a、藍綠色 #2f9a9a、紫色 #7a4fa8、亮紫色 #b77ad6
/** hair、face 是完整 id（含顏色）；skin 是身體 id（2000 起） */
export type Outfit = { g: Gender; skin: number; hair: number; face: number; wear: Partial<Record<SlotKey, number>>; pose: PoseKey; emo: EmoKey; flip: boolean };
export function defaultOutfit(g: Gender): Outfit;
export function parseOutfit(params: URLSearchParams, data: AvatarData): Outfit;
export function outfitQuery(o: Outfit): string;          // 不含「?」；全是預設時回 ""
export function wearItem(o: Outfit, item: AvatarItem): Outfit;
export function takeOff(o: Outfit, k: SlotKey): Outfit;
export function setGender(o: Outfit, g: Gender, data: AvatarData): Outfit;
export function itemIndex(data: AvatarData): Map<number, AvatarItem>;      // 給各處用 id 找道具
export function hairDrawable(data: AvatarData, id: number): boolean;      // 這款這個顏色畫得出來
export function faceDrawable(data: AvatarData, id: number): boolean;
```

預設（`defaultOutfit`）：男 `{ skin: 2000, hair: 30030, face: 20000, wear: { coat: 1040002, pants: 1060002 } }`、女 `{ skin: 2000, hair: 31470, face: 21058, wear: { coat: 1041002, pants: 1061002 } }`，`pose: "stand"`、`emo: "default"`、`flip: false`。測試要證明這幾個 id 都在 avatar.json、畫得出來、性別對（不對就換一個同性別畫得出來的，連測試一起改）。

網址參數：`g`（1＝女，男不寫）、`s` 膚色、`h` 髮型、`f` 臉型、`w` 道具 id 用「.」接、`p` 動作、`e` 表情、`x=1` 翻面；`try=<id>`（查資料進來）＝在該性別預設角色身上穿上那件：髮型→`h`、臉型→`f`、道具→`wear`，那件是女生的就用女生預設。輸出只寫跟預設不一樣的欄位，順序 `g,s,h,f,w,p,e,x`。

- [ ] **Step 1: 寫失敗測試**（讀真的 `public/data/avatar.json`）

```ts
it("全預設時網址是空的，來回一致", () => {
  expect(outfitQuery(defaultOutfit(0))).toBe("");
  const o = { ...defaultOutfit(1), wear: { ...defaultOutfit(1).wear, cap: CAP_F }, pose: "walk" as const, flip: true };
  expect(parseOutfit(new URLSearchParams(outfitQuery(o)), data)).toEqual(o);
});
it("壞網址不壞頁：亂字、不存在、畫不出來、性別不符都換回預設；w 有寫就只穿認得的", () => {
  const o = parseOutfit(new URLSearchParams("g=9&s=abc&h=99999&f=-1&w=1.2.x." + UNDRAWABLE + "." + FEMALE_OVERALL + "&p=fly&e=lol&x=2"), data);
  expect(o).toEqual({ ...defaultOutfit(0), wear: {} });
  expect(parseOutfit(new URLSearchParams("w="), data).wear).toEqual({});
  expect(outfitQuery({ ...defaultOutfit(0), wear: {} })).toBe("w=");
});
it("try：髮型換髮型、女生的點裝換女生預設", () => {
  expect(parseOutfit(new URLSearchParams("try=" + RED_HAIR_M), data).hair).toBe(RED_HAIR_M);
  const f = parseOutfit(new URLSearchParams("try=" + FEMALE_OVERALL), data);
  expect(f.g).toBe(1); expect(f.wear.overall).toBe(FEMALE_OVERALL); expect(f.wear.coat).toBeUndefined();
});
it("套服跟上衣褲裙互斥、雙手武器跟盾牌互斥", () => {
  const withOverall = wearItem(defaultOutfit(0), byId(MALE_OVERALL));
  expect(withOverall.wear).toEqual({ overall: MALE_OVERALL });
  expect(wearItem(withOverall, byId(1040002)).wear).toEqual({ coat: 1040002 });
  const shield = wearItem(defaultOutfit(0), byId(1092000));
  expect(wearItem(shield, byId(TWO_HANDED)).wear.shield).toBeUndefined();
  expect(wearItem(wearItem(defaultOutfit(0), byId(TWO_HANDED)), byId(1092000)).wear.weapon).toBeUndefined();
});
it("換性別：穿不了的換掉、男女都能穿的留著、身上沒衣服就穿新性別預設上衣褲裙", () => {
  const o = setGender({ ...defaultOutfit(0), wear: { overall: MALE_OVERALL, cap: UNISEX_CAP } }, 1, data);
  expect(o.wear).toEqual({ cap: UNISEX_CAP, coat: 1041002, pants: 1061002 }); expect(o.hair).toBe(31470); expect(o.face).toBe(21058);
  expect(setGender(defaultOutfit(0), 1, data)).toEqual(defaultOutfit(1));
});
```
`w` 規則：沒寫 `w`＝預設衣服；有寫（含空的 `w=`）＝只穿認得的那幾件（可以全空）。`outfitQuery` 在 wear 跟預設不同時就寫 `w`，全脫光寫 `w=`。
換性別規則：穿不了的脫掉；髮型、臉型不合新性別就換新性別預設；脫完身上沒有套服也沒有上衣、褲裙，就穿新性別預設的上衣、褲裙。

常數（`CAP_F`、`UNDRAWABLE`、`FEMALE_OVERALL`、`MALE_OVERALL`、`UNISEX_CAP`、`TWO_HANDED`、`RED_HAIR_M`）在測試檔開頭從 avatar.json 挑（例：`data.items.find(i => i.k === "overall" && i.g === 1 && i.r)!.id`；`RED_HAIR_M`＝第一款男生、`t` 含 1 的髮型 id + 1）。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/avatar/__tests__/outfit.test.ts`
Expected: FAIL（找不到 `@/lib/avatar/outfit`）

- [ ] **Step 3: 實作 `src/lib/avatar/outfit.ts`**（只認 `^\d+$` 的數字；道具要在 `itemIndex`、有 `r`、`g` 是這個性別或 2；髮型臉型同理用 `hairDrawable`／`faceDrawable` 和款式的 `g`）

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/avatar/__tests__/outfit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/avatar/outfit.ts src/lib/avatar/__tests__/outfit.test.ts
git commit -m "v1.40: 紙娃娃穿搭狀態、網址、穿脫規則、換性別"
```

---

### Task 5: 隨機穿搭＋maplestory.io 網址

**Files:**
- Create: `src/lib/avatar/random.ts`、`src/lib/avatar/render.ts`
- Test: `src/lib/avatar/__tests__/random.test.ts`、`src/lib/avatar/__tests__/render.test.ts`

**Interfaces:**
- Consumes: `Outfit`、`wearItem`、`itemIndex`、`hairDrawable`、`faceDrawable`（Task 4）
- Produces:

```ts
// random.ts
export function randomOutfit(data: AvatarData, base: Outfit, rng?: () => number): Outfit; // 性別、動作、表情、翻面沿用 base
// render.ts
export const MSIO = "https://maplestory.io/api/character";
export const FRAMES: Record<PoseKey, { n: number; ms: number }>; // stand 3/500、walk 4/180、alert 3/500、jump 1、prone 1、sit 1
export function stanceFor(pose: PoseKey, weapon: AvatarItem | undefined): string;
export function characterUrl(o: Outfit, data: AvatarData, opts: { frame: number; resize: number }): string;
```

隨機規則：髮型、臉型各從這個性別畫得出來的挑一款，顏色從 `t ∪ j` 挑；膚色 8 選 1；套服或上衣＋褲裙二選一（各半）；鞋子、手套、帽子、披風、武器各挑一件；眼飾、臉飾、耳環各 50% 機率穿一件；武器是單手時 50% 配一個盾牌，雙手不配。只挑 `r` 有值、性別合的。

網址規則（11/03 實測）：
- 道具陣列 `[{ itemId, region, version, animationName? }]`，`region`／`version` 台服 `TWMS`／`256`、日服 `JMS`／`444`；同一張圖可以混。陣列 `JSON.stringify` 後去掉頭尾中括號再 `encodeURIComponent`（同 `candidates.mjs` 的 `render`）。
- 膚色放身體 `skin` 跟頭 `skin + 10000` 兩件（台服）。表情放臉型那件的 `animationName`（`default` 不放）。
- 網址 `${MSIO}/${items}/${stanceFor(...)}/${frame}?resize=${resize}&renderMode=0&flipX=${flip}`。
- `stanceFor`：stand／walk 時，武器 id 前三碼 143、144（槍、矛）用 `stand2`／`walk2`，其他（含沒拿武器、點裝武器）用 `stand1`／`walk1`；alert、jump、prone、sit 照名字。（實測：雙手劍、弓、火槍、點裝武器在 stand1 才畫得出武器；槍在 stand2 才畫得出。）

- [ ] **Step 1: 寫失敗測試**

```ts
// random.test.ts（rng 用固定種子的 mulberry32，跑 200 次）
it("200 次都合法：性別對、畫得出來、不衝突", () => {
  for (let i = 0; i < 200; i++) for (const g of [0, 1] as const) {
    const o = randomOutfit(data, defaultOutfit(g), rng);
    expect(o.g).toBe(g);
    for (const id of Object.values(o.wear)) { const it = idx.get(id!)!; expect(it.r).toBeTruthy(); expect([g, 2]).toContain(it.g); }
    expect(o.wear.overall && (o.wear.coat || o.wear.pants)).toBeFalsy();
    if (o.wear.weapon && idx.get(o.wear.weapon)!.h) expect(o.wear.shield).toBeUndefined();
    expect(hairDrawable(data, o.hair)).toBe(true); expect(faceDrawable(data, o.face)).toBe(true);
  }
});
it("沿用動作、表情、翻面", () => {
  const o = randomOutfit(data, { ...defaultOutfit(0), pose: "sit", emo: "cry", flip: true }, rng);
  expect([o.pose, o.emo, o.flip]).toEqual(["sit", "cry", true]);
});
// render.test.ts
it("預設角色的網址", () => {
  const u = characterUrl(defaultOutfit(0), data, { frame: 0, resize: 2 });
  expect(u.startsWith(MSIO + "/")).toBe(true);
  const items = JSON.parse("[" + decodeURIComponent(u.split("/")[5]) + "]");
  expect(items.map((i: { itemId: number }) => i.itemId).sort()).toEqual([1040002, 1060002, 2000, 12000, 20000, 30030].sort());
  expect(u.endsWith("/stand1/0?resize=2&renderMode=0&flipX=false")).toBe(true);
});
it("表情放在臉型、日服道具帶 JMS/444", () => {
  const jms = data.items.find((i) => i.r === "j" && i.g !== 1)!;
  const u = characterUrl({ ...wearItem(defaultOutfit(0), jms), emo: "smile" }, data, { frame: 0, resize: 1 });
  const items = JSON.parse("[" + decodeURIComponent(u.split("/")[5]) + "]");
  expect(items.find((i: { itemId: number }) => i.itemId === 20000).animationName).toBe("smile");
  expect(items.find((i: { itemId: number }) => i.itemId === jms.id)).toMatchObject({ region: "JMS", version: "444" });
});
it("槍矛用 stand2／walk2，其他 stand1", () => {
  expect(stanceFor("stand", { id: 1432000 } as AvatarItem)).toBe("stand2");
  expect(stanceFor("walk", { id: 1442000 } as AvatarItem)).toBe("walk2");
  expect(stanceFor("stand", { id: 1402000 } as AvatarItem)).toBe("stand1");
  expect(stanceFor("stand", undefined)).toBe("stand1"); expect(stanceFor("prone", undefined)).toBe("prone");
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/avatar/__tests__/random.test.ts src/lib/avatar/__tests__/render.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 `random.ts`、`render.ts`**

- [ ] **Step 4: 跑測試確認通過＋實際打一次 maplestory.io**

Run: `npx vitest run src/lib/avatar/__tests__/random.test.ts src/lib/avatar/__tests__/render.test.ts`
Expected: PASS
另外用 node 拿 `characterUrl(defaultOutfit(0)…)` 跟 `stand` 第 0、1、2 格、`walk` 第 0～3 格各打一次，存 PNG 打開看：每格都有角色、各格姿勢不同（確認 `FRAMES` 格數對；不對就改 `FRAMES` 跟這段說明）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/avatar/random.ts src/lib/avatar/render.ts src/lib/avatar/__tests__/random.test.ts src/lib/avatar/__tests__/render.test.ts
git commit -m "v1.40: 紙娃娃隨機穿搭、maplestory.io 角色圖網址"
```

---

### Task 6: 查資料「穿上看看」

**Files:**
- Create: `src/lib/avatar/linkable.ts`
- Test: `src/lib/avatar/__tests__/linkable.test.ts`
- Modify: `src/app/db/items/ItemDb.tsx:207-226`（`ItemDetail`）、`:348-355`（按鈕那段）

**Interfaces:**
- Consumes: `AvatarData`、`itemIndex`、`hairDrawable`、`faceDrawable`、`loadAvatar`／`peekAvatar`
- Produces: `avatarLink(item: Pick<Item, "id" | "c">, data: AvatarData): string | null` → `/plan/avatar?try=<id>` 或 null

規則：只給 `c === "時裝"`，而且（髮型）`hairDrawable`、（臉型）`faceDrawable`、（其他）在 `itemIndex` 而且有 `r`。一般裝備不給。

- [ ] **Step 1: 寫失敗測試**：讀真的 items.json＋avatar.json

```ts
it("點裝畫得出來才有、一般裝備沒有", () => {
  expect(avatarLink({ id: 1042029, c: "時裝" }, data)).toBe("/plan/avatar?try=1042029"); // 三眼章魚T恤：台服畫得出來、男女都能穿
  expect(avatarLink({ id: 1040002, c: "裝備" }, data)).toBeNull();
  expect(avatarLink({ id: UNDRAWABLE_CASH, c: "時裝" }, data)).toBeNull(); // UNDRAWABLE_CASH = data.items.find((i) => i.cash && !i.r)!.id
  expect(avatarLink({ id: 30030, c: "時裝" }, data)).toBe("/plan/avatar?try=30030");
});
it("每個有按鈕的 id，紙娃娃打開真的穿得上（防漂移）", () => {
  for (const it of items.filter((i) => avatarLink(i, data))) {
    const o = parseOutfit(new URLSearchParams("try=" + it.id), data);
    const worn = [o.hair, o.face, ...Object.values(o.wear)];
    expect(worn, it.n).toContain(it.id);
  }
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/avatar/__tests__/linkable.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作 `linkable.ts`，改 `ItemDb.tsx`**
- `ItemDetail` 裡：`item.c === "時裝"` 時 `useEffect` 呼叫 `loadAvatar()`（先 `peekAvatar()`），拿到資料算 `avatarLink`。不是時裝不載（`/db/items` 第一格保持輕）。
- 按鈕放在「算衝卷要準備多少」同一排位置、同樣式（`tap-safe inline-flex self-start rounded-full bg-[color:var(--leaf)] px-3.5 py-2 text-sm font-bold text-[color:var(--on-accent)]`），字「穿上看看」。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/avatar/__tests__/linkable.test.ts src/lib/scroll-sim`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/avatar/linkable.ts src/lib/avatar/__tests__/linkable.test.ts src/app/db/items/ItemDb.tsx
git commit -m "v1.40: 查資料點裝、髮型、臉型卡加「穿上看看」"
```

---

### Task 7: 頁面殼＋角色卡

**Files:**
- Create: `src/app/plan/avatar/page.tsx`、`src/app/plan/avatar/AvatarSim.tsx`、`src/app/plan/avatar/Stage.tsx`
- Modify: `src/lib/site-pages.ts`（`/plan/scroll` 下一行）、`src/lib/analytics.ts`（`EventName` 加 `"avatar_download"`）、`README.md`（GA 事件表）

**Interfaces:**
- Consumes: Task 3～5 全部
- Produces:
  - `AvatarSim`（`"use client"`）：持有 `data`、從 `useSearchParams` 算 `outfit = parseOutfit(params, data)`；`commit(next: Outfit)` 用 `router.replace(qs ? "/plan/avatar?" + qs : "/plan/avatar", { scroll: false })`。
  - `Stage({ outfit, data, compact }: { outfit: Outfit; data: AvatarData; compact?: boolean })`：只管畫角色（compact＝小窗用的小尺寸），Task 8 的小窗重用它。

內容：
- `page.tsx`：照 `src/app/plan/scroll/page.tsx`。title「紙娃娃｜換髮型、臉型、點裝看穿起來的樣子」、description「選髮型、髮色、臉型、瞳色、膚色和 12 類裝備點裝，即時看角色穿起來長怎樣，可以隨機穿搭、下載透明背景圖、分享連結。」、canonical `/plan/avatar`；`<Suspense fallback={<LoadingBlock label="載入紙娃娃…" />}>`。
- `site-pages.ts`：`{ path: "/plan/avatar", name: "紙娃娃", what: "換髮型、臉型、點裝，看角色穿起來長怎樣，可以下載或分享", priority: 0.7 }`。
- 版面照候選圖 A1：h1「紙娃娃」＋副標「換髮型、臉型、點裝，看角色穿起來長怎樣，可以下載或分享。」；角色卡（`CARD` 樣式同 `src/app/plan/scroll/parts.tsx`）：舞台、性別「男／女」切換、動作膠囊（`POSES`）、表情膠囊（`EMOS`，可橫捲 `scroll-x`）、「翻面」膠囊、穿了什麼的小卡（小圖＋名字；點道具＝`takeOff`；點髮型臉型膚色＝切到那一頁分頁，Task 8 接）、四顆按鈕「隨機穿搭」「重置」「下載」「分享」。
- `Stage`：
  - `<img>` 放大顯示、`image-rendering: pixelated`、舞台背景 `--paper-deep`；圖用 `characterUrl(..., { frame, resize: 2 })`。
  - 換穿搭：停 250ms 才換網址；新圖用 `new Image()` 先載好再換上（舊圖留著不閃白），載的時候舞台角落一個小轉圈（CSS，不用 emoji）。
  - 多格動作：這套的每格都載好才開始輪播（`setInterval`，`FRAMES[pose].ms`）；`prefers-reduced-motion` 只放第 0 格。
  - 載失敗：舞台寫「角色圖載不出來，等一下再過來」＋「再試一次」（重新要同一張，網址加 `&_r=<次數>`）。
  - 舞台下一行小字（`ink-faint`）：「角色圖由 maplestory.io 提供，少數道具樣子可能跟遊戲裡不完全一樣」。
- 下載：`fetch(characterUrl(..., { frame: 0, resize: 2 }))` → blob → `<a download="紙娃娃.png">`；`track("avatar_download", { gender: outfit.g ? "女" : "男" })`。失敗跳「角色圖載不出來，等一下再過來」。
- 分享：有 `navigator.share` 用它（`{ title: "紙娃娃", url: location.href }`，使用者取消不算錯），沒有就 `navigator.clipboard.writeText` 後跳「已複製連結」（2 秒消失）；`track("share", { page: "avatar", method: "share" | "copy" })`。
- README「GA 事件」表加一列：`avatar_download`｜紙娃娃按「下載」｜`gender`（男／女）；`share` 那列「什麼時候送」補「紙娃娃分享」、`page` 多 avatar。

- [ ] **Step 1: 寫畫面**（照上面）
- [ ] **Step 2: 型別檢查、掃 emoji**

Run: `npx tsc --noEmit -p . && node -e "const fs=require('fs');for(const f of ['src/app/plan/avatar/AvatarSim.tsx','src/app/plan/avatar/Stage.tsx','src/app/plan/avatar/page.tsx']){const t=fs.readFileSync(f,'utf8');const m=t.match(/[⌀-⏿■-◿☀-➿]|[\u{1F000}-\u{1FFFF}]/u);if(m)throw new Error(f+' 有 emoji '+m[0])}console.log('ok')"`
Expected: 沒有錯誤、印 `ok`
- [ ] **Step 3: 本機開起來看**：worktree 起 dev server 要另開埠＋`--webpack`（例：`npx next dev --webpack -p 9381`，用 `run_in_background`），無頭 Chrome 開 `http://localhost:9381/plan/avatar` 截 375 寬圖：看得到角色、按「隨機穿搭」角色換掉、網址變了、重新整理還是同一套。看完把 dev server 關掉。
- [ ] **Step 4: Commit**

```bash
git add src/app/plan/avatar src/lib/site-pages.ts src/lib/analytics.ts README.md
git commit -m "v1.40: 紙娃娃頁面：角色卡、隨機穿搭、下載、分享"
```

---

### Task 8: 挑衣服卡＋上方小窗＋電腦版左右排＋驗收腳本

**Files:**
- Create: `src/app/plan/avatar/Picker.tsx`、`scripts/verify/avatar-shot.mjs`
- Modify: `src/app/plan/avatar/AvatarSim.tsx`、`scripts/verify/README.md`

**Interfaces:**
- Consumes: `Stage`（Task 7）、`wearItem`、`HAIR_COLORS`、`EYE_COLORS`、`itemIndex`
- Produces: `Picker({ data, outfit, tab, onTab, onChange }: { data: AvatarData; outfit: Outfit; tab: TabKey; onTab: (t: TabKey) => void; onChange: (next: Outfit) => void })`，`type TabKey = "hair" | "face" | "skin" | SlotKey`

內容（照候選圖 A1、A2）：
- 分頁照 Global Constraints 的順序，可橫捲。分頁狀態不進網址（重新整理回到髮型頁）。
- 搜尋框：只搜目前分頁的名字（含就算），換分頁清空。
- 髮型頁：上面一排髮色色塊（`HAIR_COLORS`，只畫這款 `t ∪ j` 有的顏色，正在穿的那色有框；`aria-label` 寫顏色名）；點色塊＝換成同款那個顏色。點格子換款：保留目前顏色碼，那款沒有就用那款最小的顏色碼。臉型頁同理用 `EYE_COLORS`。
- 只列這個性別穿得到的（`g` 是性別或 2）。
- 格子四欄，每格小圖（`/assets/items/<ic 或 id>.png`，膚色用頭部 `id + 10000` 的小圖）＋名字（兩行截斷），穿著的那格框楓葉橘；一次 40 個，「再看 40 個」再多 40。換分頁、搜尋重算回 40。
- 畫不出來的格子變淡、名字下寫「暫時看不到樣子」，點了跳「這件暫時看不到樣子，先挑別件」（2 秒），不穿。
- 點已經穿著的道具格子＝脫掉（髮型臉型膚色不能脫）。
- 上方小窗：`IntersectionObserver` 看角色卡；角色卡整張捲出畫面時，在頁首下面（`top: 65px`，頁首高度）固定一條：小角色（`<Stage compact />`）＋「下載」「分享」「回到上面」（回到上面＝捲回頂端，`behavior: "instant"`）。電腦版（`lg:` 以上）不出小窗。
- 電腦版 `lg:` 左右排：左邊角色卡 `sticky top-[80px]`，右邊挑衣服卡。
- 穿了什麼小卡點髮型／臉型／膚色＝切到那一頁並捲到挑衣服卡。

驗收腳本 `scripts/verify/avatar-shot.mjs`（照 `scripts/verify/scroll-shot.mjs`：`record` PASS／FAIL、`until`、真滑鼠 `click`、`results.json`，任一 FAIL exit 1；用法 `node scripts/verify/avatar-shot.mjs [網址，預設 http://localhost:9381] [輸出資料夾] [DevTools 埠，預設 9382]`）。檢查：
1. 375 寬開 `/plan/avatar`：舞台 `<img>` 載好（`naturalWidth > 0`）、頁面不橫捲（`scrollWidth <= clientWidth`）→ 截 `avatar-375.png`。
2. 點髮型格子第 3 格：網址 `h=` 變了、舞台圖換了；點紅色色塊：`h` 尾數變 1 → 截 `avatar-hair.png`。
3. 往下捲到挑衣服卡底：小窗出現、有「下載」「分享」「回到上面」→ 截 `avatar-mini.png`；點「回到上面」回到頂端。
4. 按「隨機穿搭」3 次：每次網址都變、舞台圖載好。
5. 切「女」：網址有 `g=1`、髮型分頁第一格是女生髮型（用 avatar.json 對）。
6. 開 `/plan/avatar?try=<一件畫不出來的點裝>`：頁面正常、穿的是預設；在那一類分頁看到「暫時看不到樣子」→ 截 `avatar-missing.png`。
7. 開 `/db/items?id=1042029`：看到「穿上看看」，點下去到 `/plan/avatar?try=1042029`，穿了什麼裡有「三眼章魚T恤」→ 截 `avatar-from-db.png`。
8. 用 `Fetch.enable` 把 `maplestory.io` 的請求全回 503，重開頁：看到「角色圖載不出來，等一下再過來」跟「再試一次」→ 截 `avatar-error.png`。
9. 1280 寬：左右排、沒有小窗 → 截 `avatar-1280.png`；深色主題（`data-theme="dark"`）再截一張。
10. 頁面沒有 console error、沒有例外。

- [ ] **Step 1: 寫 `Picker.tsx`、改 `AvatarSim.tsx`**
- [ ] **Step 2: 型別檢查＋全套測試**

Run: `npx tsc --noEmit -p . && npm test`
Expected: 全過
- [ ] **Step 3: 寫驗收腳本，本機跑**（dev server 同 Task 7 Step 3；跑完關掉）

Run: `node scripts/verify/avatar-shot.mjs http://localhost:9381 "$TEMP/avatar-shot"`
Expected: 10 項全 PASS；打開截圖用眼睛看一遍（角色真的有穿上、小窗沒蓋住格子、深色字看得清楚）。
- [ ] **Step 4: 對比度**

Run: `MSYS_NO_PATHCONV=1 node scripts/verify/contrast-audit.mjs http://localhost:9381 /plan/avatar`
Expected: 沒有不及格的字（照 `scripts/verify/README.md` 的用法）
- [ ] **Step 5: `scripts/verify/README.md` 加 avatar-shot 用法一段，Commit**

```bash
git add src/app/plan/avatar scripts/verify/avatar-shot.mjs scripts/verify/README.md
git commit -m "v1.40: 紙娃娃挑衣服卡、上方小窗、電腦版左右排、驗收腳本"
```

---

### Task 9: 交付

- [ ] **Step 1:** `git fetch origin && git rebase origin/dev`（有衝突就解），`npm test`、`npx next build` 全過，`git push --force-with-lease`。
- [ ] **Step 2:** 開 PR → `dev`（`gh pr create --base dev`，內文寫做了什麼、拍板、驗收截圖，結尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`），等 `gh pr checks` 三條（單元測試、建置、第一格）都出現且綠，`gh pr merge --merge --match-head-commit <頭>`，確認 `origin/dev` 有這些 commit，刪分支。
- [ ] **Step 3:** 等測試機 `https://maplehelper-dev.pipicards.workers.dev` 部署完（Workers Builds），跑 `node scripts/verify/avatar-shot.mjs https://maplehelper-dev.pipicards.workers.dev "$TEMP/avatar-dev"`，10 項 PASS；下載出來的 PNG 打開確認透明背景。
- [ ] **Step 4:** 回報使用者：測試機網址 `https://maplehelper-dev.pipicards.workers.dev/plan/avatar`、查資料入口範例網址、截圖。正式機等使用者講。
