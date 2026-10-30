# 地圖＋NPC 圖鑑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每張已開放的地圖、每個 NPC 各一個靜態頁。地圖頁在整張地圖畫面上標出怪、NPC、門；NPC 頁寫在哪、賣什麼、任務。查資料多兩個圖鑑，怪物、任務、帶我去串過來。

**Architecture:**
- `pipeline/lib/atlas.mjs` 是純函式，從上游 `artale.maps`（maps-data.js）加上站內已建好的資料，算出 `atlas-maps.json`、`npcs.json`、`atlas-index.json`。build.mjs 在 main 尾端呼叫它。
- 地圖畫面圖另外寫一支 async 腳本 `pipeline/build-map-renders.mjs`，用 sharp 轉 webp。
- 前端：
  - 單筆頁用 server component 加 `static-data.ts`。
  - 清單頁由伺服器先畫完整清單，瀏覽器只做過濾。
  - 串連用的元件讀小檔 `atlas-index.json`，知道哪些圖、NPC 有頁。

**Tech Stack:** Next 16 App Router、React、Tailwind v4、node --test（pipeline）、vitest（src）、sharp（next 已帶，要另外寫進 devDependencies）。

**Spec:** `docs/superpowers/specs/2026-10-30-map-npc-atlas-design.md`（候選圖與樣式來源在 `docs/superpowers/specs/assets/2026-10-30-map-npc/`，看 `candidates.mjs` 的 `A`、`N`）

## Global Constraints

- **文案**：
  - 全繁體中文，禁 emoji，禁英文縮寫。
  - 禁「上游、渲染、資料庫、spawn」這類內部用語進畫面。
  - 狀態用 inline SVG 或文字。
- **商店**：一律標「參考舊版資料，價格以遊戲裡為準」。活動店照 `src` 現有寫法：沒過期標「活動限定・到 M/D」，過期不列。要沿用現有的判斷函式，不要另寫。
- **收圖規則**：
  - 只在 atlas 用，**不准改 `maps.json` 的 `zh`** 或其他既有輸出檔的內容。
  - atlas 只能新增檔案，而且只准在 build.mjs 尾端呼叫。
- **地圖畫面圖**：永遠不刪既有的 `public/assets/map_renders/*.webp`。
- **顏色**：只用站上 CSS 變數，深淺色主題都要看得清楚。按鈕字用 `--on-accent`。
- **怪物顏色**：怪物圓點固定用 6 色，依序給。超過 6 種就循環，圖例照樣列。6 色寫在一個常數：`#3f8f4f`、`#d4553a`、`#2f9fb0`、`#c9a23a`、`#8a5cc7`、`#d0679d`。
- **版號**：v1.24，分支 `feat/v1.24-map-npc`。commit 訊息以 `v1.24 (N/7):` 開頭。
- **埠號**：本機 dev 用 9303，驗收 Chrome 用 9304。

## Review Focus

1. 城鎮 NPC 很多（18 張圖超過 6 個）：圖上 NPC 只畫菱形不寫名字，標籤不能把畫面蓋滿。
2. 一張圖可能只有門、沒有怪也沒有 NPC：空的段落整段不出現，標題標籤「怪物 X～Y 等」不出現。
3. 門座標對不到（0,0）：只進清單、不畫在圖上。同一個目的地多個門：清單只列一次。
4. 手機 390 寬：地圖畫面不能撐出橫向捲軸。門標籤靠邊時不能超出圖框，要用 `overflow:hidden` 或往內推。
5. 沒有畫面圖的地圖（抓圖失敗）：只放清單，不能出現破圖。

---

### Task 1: atlas 資料（pipeline/lib/atlas.mjs）

**Files:**
- Create: `pipeline/lib/atlas.mjs`, `pipeline/lib/atlas.test.mjs`, `pipeline/lib/__fixtures__/atlas-upstream.json`（從上游 maps-data 切出來的小樣本）
- Modify: `pipeline/build.mjs`（main 尾端呼叫、寫三個檔、檔頭註解補輸出說明）、`pipeline/verify.mjs`

**Interfaces:**
- Produces:
  - `buildAtlas({ upstreamMaps, mapRecords, graphEdges, items, quests, monsterIds, npcImageIds, openRegions, heldBackMaps }) => { maps: AtlasMap[], npcs: AtlasNpc[], index: { maps: number[], npcs: number[] } }`
  - 參數：
    - `upstreamMaps`：`artale.maps`，物件或陣列都要吃，上游是以 id 為 key 的物件。
    - `mapRecords`：maps.json 的 records。
    - `graphEdges`：`{ [from]: [to, portalName, x, y, minLevel?][] }`，就是 graph.json 的內容。
    - `items`：items.json 的 list。
    - `quests`：quests.json 的 list。
    - `monsterIds`：`Set<number>`，有怪物頁的。
    - `npcImageIds`：`Set<number>`，`public/assets/npcs` 有圖的。
- 輸出欄位（短名）：
  - `AtlasMap`：`{ id, n 圖名, st 大陸, rg 區域 regionName, t?:1 城鎮, ret? 回城圖 id（有收進 atlas 或 maps.json 有 zh 才給）, b?:[left,top,width,height], mobs:[{ id, n, lv, k 數量, p:[[x,y]...], pg?:1 有怪物頁 }], npcs:[{ id, n, x, y }], doors:[{ to, n 目的地名, p:[[x,y]...] 對得到的座標，可空 }] }`
  - `AtlasNpc`：`{ id, n, img?:1, maps:number[], shop?:[{ id 道具, pr, u?, e?, s 分類 }], quests?:[{ id, n, r:"接"|"交"|"接・交"|"相關" }] }`
  - `index`：收進來的圖 id、NPC id，都排好序。

- [ ] **Step 1：切樣本。**
  - 從 `data/raw/artale.json`（`maps`）切出下面這些圖，存成 fixture：
    - 1020000、100000101、1010000（楓葉村）、105090000（有沒名字的 NPC「NPC 1063013」）。
    - 一張 `regionName` 不在開放清單的圖：天空之城以外、例如「日本」的任一張。
    - 一張 `regionName` 空白、`maps.json` 也沒 zh 的圖。
  - 同時切這些圖在 graph.json 的邊、相關的 items（山姆的 90 樣，含 `sp`）、相關的 quests（麥加 12100 的 8 個），一起放進 fixture。
  - fixture 要小於 300KB：拿掉 `terrain`。
- [ ] **Step 2：寫失敗的測試** `pipeline/lib/atlas.test.mjs`：
  - `1020000 怪物分組`：mobs 照數量排，依序是木妖 7、紅寶 7、綠水靈 4、肥肥 3，`p` 長度等於 k。
  - `1020000 門`：`doors.map(d => d.n)` 包含 楓葉村、番茄園、草叢狩獵場Ⅰ、草叢狩獵場Ⅱ，沒有 `to === 2000000`。楓葉村的 `p[0]` 是 `[-216, 93]`。
  - `1020000 NPC`：npcs 只有麥加 12100，座標 `-21, 87`。
  - `麥加任務`：npcs.json 的 12100 有 `quests.length === 8`。「桑姆的考驗」的 `r === "交"`。
  - `山姆店`：1011001 的 `maps` 含 100000101、`shop.length === 90`。100000101 也在 `index.maps` 裡，證明有收店面圖。
  - `沒名字的 NPC 不收`：npcs 裡沒有名字符合 `/^NPC \d+$/` 的。
  - `沒開放的圖不收`：日本那張、regionName 空白又沒 zh 的那張都不在 `index.maps`。
  - `maps.json 沒被改`：呼叫前後 `JSON.stringify(mapRecords)` 一樣。
- [ ] **Step 3：跑** `node --test pipeline/lib/atlas.test.mjs`，預期 FAIL（模組不存在）。
- [ ] **Step 4：實作 atlas.mjs。** 收圖、門、怪、NPC、店、任務規則照 spec「資料」一節。
  - 門目的地名：取目的圖收進 atlas 的名字，沒有就用 `mapRecords[to].zh`，都沒有就不列。
  - 門座標：用門名對上游 `portals[].name`（pt 為 2 或 1 的），對不到用 graph 的 x,y，兩個都是 0 就給空 `p`。
  - `npc:` 開頭的邊跳過。
- [ ] **Step 5：跑測試**，預期 PASS。
- [ ] **Step 6：接上 build.mjs。**
  - main 尾端（所有既有 write 之後）呼叫 buildAtlas，寫出 `atlas-maps.json`、`npcs.json`、`atlas-index.json`，印出圖數、NPC 數、檔案大小。
  - `npcImageIds` 讀 `public/assets/npcs` 檔名。
- [ ] **Step 7：verify.mjs 加檢查。**
  - 圖數 > 300、NPC 數 > 200。
  - 每張圖 mobs／npcs／doors 至少一樣不空。
  - 1020000 存在，木妖 k=7。
  - index 跟兩個檔的 id 一致。
- [ ] **Step 8：跑** `node pipeline/build.mjs && node pipeline/verify.mjs && git diff --stat public/data`。
  - 預期既有的 json 沒有內容變動。只容許 `meta.json` 時間戳類欄位變動，其他檔有 diff 就是改壞了，要查。
  - 新增三個檔。
- [ ] **Step 9：Commit** `v1.24 (1/7): 地圖、NPC 圖鑑資料（atlas-maps、npcs、atlas-index）`

### Task 2: 地圖畫面圖（pipeline/build-map-renders.mjs）

**Files:**
- Create: `pipeline/build-map-renders.mjs`, `pipeline/lib/map-renders.mjs`, `pipeline/lib/map-renders.test.mjs`
- Modify: `package.json`（devDependencies 加 `sharp`，版本跟 node_modules 裡現有的一致；scripts 加 `"data:renders": "node pipeline/build-map-renders.mjs"`，並放進 `data:all` 的 build 之後）、`.github/workflows/data-refresh.yml`（build 之後、verify 之前加一步）
- Output: `public/assets/map_renders/<id>.webp`, `public/data/map-renders.json`（`{ [id]: version }`）

**Interfaces:**
- Consumes：`public/data/atlas-maps.json`、`data/raw/artale.json`（`maps[id].renderedMap.image` 的 `?v=` 當版本）、`data/cache/upstream/assets/map_renders/<id>.png`。
- Produces：`renderPlan({ atlasIds, upstreamVersions, have, cacheHas }) => { convert: number[], keep: number[], missing: number[] }`。這是純函式，要測。

- [ ] **Step 1：寫失敗的測試**（renderPlan）：
  - 有快取、版本變了 → convert。
  - 版本一樣、檔在 → keep。
  - 沒快取、檔在 → keep（本機抽檔模式）。
  - 沒快取、檔不在 → missing。
  - 不在 atlas 的既有檔不出現在任何清單裡，也就是永遠不刪。
- [ ] **Step 2：跑測試** FAIL → 實作 → PASS。
- [ ] **Step 3：腳本本體。**
  - convert 用 sharp：`resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 75 })`。
  - 寫入 map-renders.json 的是 keep 加上 convert 成功的。
  - 最後印出張數、總大小、missing 清單。
- [ ] **Step 4：跑** `npm run data:renders`。
  - 預期總大小 < 80MB，missing 0；有 missing 就列出原因。
  - 看 1020000.webp 一眼，確認跟候選圖同一張。
- [ ] **Step 5：Commit** `v1.24 (2/7): 地圖畫面圖（webp）＋自動更新流程`。圖檔跟程式同一個 commit。

### Task 3: 地圖頁 /db/maps/[id]

**Files:**
- Create: `src/app/db/maps/[id]/page.tsx`, `src/components/atlas/MapView.tsx`（地圖畫面加標點，server component）, `src/components/atlas/rows.tsx`（怪、NPC、門的列）, `src/lib/atlas-view.ts`（純函式）, `src/lib/__tests__/atlas-view.test.ts`
- Modify: `src/lib/types.ts`（AtlasMap、AtlasNpc、AtlasIndex 型別）、`src/lib/static-data.ts`（`staticAtlasMaps()`、`staticNpcs()`、`staticMapRenders()`）、`src/lib/asset-paths.ts`（`mapRenderImage(id)` 回 `/assets/map_renders/${id}.webp`）

**Interfaces:**
- `atlas-view.ts`：
  - `pinPercent(b, [x, y]) => { left: number, top: number }`：0～100，超出就夾在範圍內。
  - `mobColor(i) => string`
  - `levelRange(mobs) => string | undefined`，例如「4～7 等」，同等級寫「12 等」，沒怪回 undefined。
  - `mapSummary(map, nameOf) => string`：spec 的 SEO 摘要句。
  - `doorList(doors)`：同目的地合併。
  - `showNpcLabels(npcs) => boolean`：6 個以下回 true。

- [ ] **Step 1：寫失敗的測試**（vitest）：
  - pinPercent 對 1020000 的 bounds 跟麥加座標，算出 `left ≈ 17.9`、`top ≈ 64.2`（差 0.1 以內）。
  - levelRange 三種情況。
  - showNpcLabels 6／7 的邊界。
  - mapSummary 對 1020000 含「木妖 7 隻」與「麥加」。
- [ ] **Step 2：跑測試** FAIL → 實作 atlas-view.ts → PASS。
- [ ] **Step 3：頁面。** 照 spec「頁面」一節跟 candidates.mjs 的 `A`，改用 Tailwind class 和站上變數。
  - `generateStaticParams` 全部 atlas 圖，`dynamicParams = false`。
  - 用 SeoPage 外框，breadcrumb「查資料・地圖」→ `/db/maps`。
  - 怪名有怪物頁的連 `/db/monsters/<id>`。NPC 列「看 NPC」連 `/db/npcs/<id>`（NPC 一定有頁）。門的「過去看」連 `/db/maps/<to>`（to 有頁才連，沒頁就連 `/go?to=`）。
  - 沒有畫面圖（不在 map-renders.json）的整張卡不放。
  - 圖上的門標籤用 `max-width` 加 `translate`，靠左右邊時往內推，不能超出圖框。
- [ ] **Step 4：本機看。** `npx next dev --webpack -p 9303`，開 `/db/maps/1020000`、`/db/maps/100000000`（城鎮，NPC 多）、一張只有門的圖。手機 390 跟電腦版各看一次，跟候選圖比點的位置。
- [ ] **Step 5：Commit** `v1.24 (3/7): 地圖頁（地圖畫面標出怪、NPC、門）`

### Task 4: NPC 頁 /db/npcs/[id]

**Files:**
- Create: `src/app/db/npcs/[id]/page.tsx`
- Modify: `src/lib/atlas-view.ts`（`npcSummary`、`shopRows`）、`src/lib/__tests__/atlas-view.test.ts`

- [ ] **Step 1：寫失敗的測試。**
  - `shopRows`：活動店過期的拿掉；沒過期的帶「活動限定・到 M/D」字樣，要重用站上現有的活動店判斷，先 grep `活動限定` 找出來。
  - 排序照價格由低到高。
  - `npcSummary` 對山姆含「弓箭手村武器店」。
- [ ] **Step 2：** FAIL → 實作 → PASS。
- [ ] **Step 3：頁面。** 照 candidates.mjs 的 `N`。
  - 賣什麼先列 8 樣，其餘放 `<details><summary>看全部 N 樣</summary>`。
  - 道具名連 `/db/items?id=<id>`。
  - 任務列寫角色小字。
  - 「帶我去」去第一張所在圖。
- [ ] **Step 4：本機看** `/db/npcs/1011001`、`/db/npcs/12100`，手機跟電腦版。
- [ ] **Step 5：Commit** `v1.24 (4/7): NPC 頁（在哪、賣什麼、任務）`

### Task 5: 清單頁＋查資料入口

**Files:**
- Create: `src/app/db/maps/page.tsx`, `src/app/db/maps/MapList.tsx`（client，只做過濾）, `src/app/db/npcs/page.tsx`, `src/app/db/npcs/NpcList.tsx`
- Modify: `src/app/db/page.tsx`（LOOKUPS 加地圖、NPC；`grid-cols-2 sm:grid-cols-3`）、`src/lib/db-heads.ts`（加 maps、npcs）、`src/lib/site-pages.ts`、`src/app/sitemap.ts`、`src/app/llms.txt`（如果它從 SITE_PAGES 生，就不用改）

- [ ] **Step 1：寫失敗的測試**（vitest，`atlas-view.ts` 加 `mapSearchText(map)`、`npcMatches(npc, query, filters)`）：
  - 搜「紅寶」找得到 1020000。
  - 搜「麥加」找得到 1020000。
  - 篩「有賣東西」只剩有 shop 的。
- [ ] **Step 2：** FAIL → 實作 → PASS。
- [ ] **Step 3：頁面。**
  - 伺服器把全部列表畫出來，傳給 client 元件。client 只控制顯示與隱藏，搜尋框沿用 `src/lib/search-input.ts` 的寫法。
  - 地圖清單依「大陸・區域」分組。
  - LOOKUPS 的圖示：地圖用 `/assets/map_marks/Henesys.png`（先確認檔案存在），NPC 用 `/assets/npcs/1012100.png`。
- [ ] **Step 4：sitemap 加單筆頁**（0.5）。site-pages 加兩條：
  - `/db/maps`「地圖資料」，what 寫「每張圖有哪些怪、各幾隻、NPC、門通去哪」。
  - `/db/npcs`「NPC 資料」，what 寫「在哪、賣什麼、有哪些任務」。
- [ ] **Step 5：Commit** `v1.24 (5/7): 地圖、NPC 清單頁與查資料入口`

### Task 6: 串連（5A）

**Files:**
- Modify:
  - `src/lib/data.ts`：`loadAtlasIndex()`，照現有 load* 的寫法，加快取。
  - `next.config.mjs`：atlas-index.json、atlas-maps.json、npcs.json 設成跟其他 data 檔一樣的快取規則。
  - `src/app/db/monsters/[id]/page.tsx`
  - `src/app/db/monsters/MonsterDb.tsx`
  - `src/lib/db-heads.ts`：monsters 的 lead 改成「點地圖看那張圖有什麼、怎麼去」。
  - `src/app/db/quests/QuestDb.tsx`：NpcBlock 的 NPC 名字有頁就變連結。
  - `src/app/db/quests/[id]/page.tsx`
  - `src/app/go/GoNavigator.tsx`：目的地名旁加「看這張圖」。
- Test：`scripts/verify-db.mjs` 有涵蓋的就跑；新連結的判斷寫成 `atlas-view.ts` 的 `mapHref(id, index)`、`npcHref(id, index)` 並加測試。

- [ ] **Step 1：寫失敗的測試。**
  - `mapHref(1020000, index)` 是 `/db/maps/1020000`。
  - 不在 index 回 `/go?to=<id>`。
  - `npcHref` 不在 index 回 undefined。
- [ ] **Step 2：** FAIL → 實作 → PASS。
- [ ] **Step 3：改五個地方。** client 元件在 index 還沒載到時照舊行為（連 `/go`），載到後換連結，畫面不能跳動，連結文字不變、只換 href。
- [ ] **Step 4：跑** `npm test` 跟 `npm run verify:db`（dev server 開在 9303）。verify:db 的 N10 偶發紅，單跑會過，見記憶。
- [ ] **Step 5：Commit** `v1.24 (6/7): 怪物出沒地圖、任務 NPC、帶我去連到新頁`

### Task 7: 驗收腳本與文件

**Files:**
- Create: `scripts/verify/atlas-shot.mjs`（參考 `scripts/verify/scroll-shot.mjs` 的寫法，Chrome 用 9304）
- Modify: `scripts/verify/README.md`、`README.md`（頁面清單）、`src/app/about` 若有列資料來源就補一句地圖畫面圖的來源

- [ ] **Step 1：** 腳本檢查項目（每項印 PASS／FAIL）：
  - `/db/maps/1020000` 有 4 列怪、木妖「7 隻」，圖上點數 21、門標籤 4 個、NPC 麥加。
  - 手機 390 寬 `scrollWidth <= clientWidth`。
  - 深色主題下圖例文字顏色對比 ≥ 4.5。
  - `/db/maps/100000000` 的 NPC 不寫名字標籤（超過 6 個）。
  - `/db/npcs/1011001` 有 8 列、`details` 打開後是 90 列、看得到「參考舊版資料」。
  - `/db/npcs/12100` 有 8 個任務。
  - 從 `/db/monsters/130100` 點第一個出沒地圖，網址變 `/db/maps/`。
  - `/db/quests` 卡片 NPC 連到 `/db/npcs/`。
  - `/db/maps` 搜「紅寶」看得到楓葉村東郊平原。
  - 截圖 4 張：地圖頁、NPC 頁 × 手機淺色、電腦深色，存到 `--out` 資料夾。
  - console 沒有錯誤。
- [ ] **Step 2：** 對本機 dev 跑一次，全過。
- [ ] **Step 3：** README 寫用法。
- [ ] **Step 4：Commit** `v1.24 (7/7): 地圖圖鑑驗收腳本 atlas-shot、文件`
