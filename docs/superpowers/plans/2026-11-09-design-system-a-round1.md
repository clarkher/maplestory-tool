# A 設計系統 第 1 輪：全站換底色、換框、換圓角、換字、換共用按鈕 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一個 PR 讓全站從「羊皮紙＋毛玻璃＋木框＋膠囊」換成 A「攻略工具」的底色、框、圓角、字型和共用按鈕，進測試機（dev）。

**Architecture:** 全站 120 多個 .tsx 都透過 `var(--maple)`、`var(--paper)` 這些變數和 `glass`／`wood-frame` 這些 utility 上色。
這一輪**不改名字、只改值**（`src/app/globals.css`），再加 Inter 字型、改導覽列和三個共用按鈕元件，最後掃一遍全站的膠囊（`rounded-full`）。
第 2 輪起（攻略文、首頁、查資料、工具頁）各自另寫計畫。

**Tech Stack:** Next.js（`next/font/google`）、Tailwind v4（`@theme`、`@utility`）、vitest、repo 的 `scripts/verify/*.mjs`（無頭 Chrome）。

**Spec:** `docs/superpowers/specs/2026-11-09-design-system-a-design.md`；對照圖 `docs/design-candidates/候選-A.png`、`A-home.png`、`A-db.png`、`A-mob.png`、`A-mob-light.png`

## Global Constraints

- 版號 **v1.89**（v1.87、v1.88 已被別支 session 用掉；開工前再查一次 `git log origin/dev origin/main --oneline -5`，被佔就往下跳）。commit 訊息以 `v1.89:` 開頭。
- 分支從 **`origin/dev`** 開：`feat/v1.89-design-system-a`。PR 進 `dev`，**不上正式機**。
- token 名稱一個都不改名、不刪；顏色值只能寫 `#rrggbb` 或 `rgb(r g b / a)`（`global-css.test.ts` 的 `rgba()` 只看得懂這兩種，`#rrggbbaa` 會讓測試丟錯）。
- 小字對比 WCAG AA 4.5（v0.81 使用者拍板），`global-css.test.ts` 既有的對比測試**一條都不准放寬**。
- **夜晚的 `--paper-edge` 跟頁底對比至少 2**（既有測試，使用者選過 B：輸入框、按鈕的框要看得出來）。所以夜晚框線不能用候選圖的 `#242934`（約 1.3），改成剛好過 2 的中性灰（起點 `#464d5a`，以測試為準）。
- 不改文案、功能、網址、資料；不加區塊、按鈕。
- 不准 emoji、圖示庫。寫 .tsx 前掃 U+2300–23FF、U+25A0–25FF。
- 按鈕上的字一律 `var(--on-accent)`，不寫死白色（既有測試會擋）。

## Review Focus

1. **深色模式的輸入框、下拉選單、勾選框**：底色換了之後，原生 `<select>`、`<input>` 的框和字要看得到（`color-scheme: dark` 還在）。→ Task 6 的截圖清單含 `/plan/damage` 選職業下拉、`/db/monsters` 搜尋框。
2. **換字型造成換頁跳動**：Inter 是新載的字，晚到會讓英數字寬度改變、整行重排。→ Task 3 要跑 `page-cls.mjs --all`，CLS 不能比改前大。
3. **原本靠毛玻璃半透明「透出底下」的地方**：導覽列收起／黏住時、查資料黏著的那一列、地圖下拉選單、讀取框，變實心後不能蓋住不該蓋的東西或出現兩層框。→ Task 2 的截圖含 `/db/monsters` 往下捲到黏著列。
4. **楓幣匯率頁的圖表底色**：`--fx-panel`／`--fx-surface` 要跟著新底色，K 棒紅綠在新底上還分得出來。→ Task 1 一起改，Task 6 截 `/price/fx`。
5. **淺色模式**：使用者現在照系統預設，白天打開的人會先看到淺色版。淺色版也要像 `A-mob-light.png`，不是只做深色。→ 每個截圖步驟都是淺、深各一張。

---

### Task 0: 開分支、搬設計文件

**Files:** 無程式改動

- [ ] **Step 1:** `git fetch origin && git log origin/dev origin/main --oneline -5`，確認 v1.89 沒被佔。
- [ ] **Step 2:** 從 `origin/dev` 開 `feat/v1.89-design-system-a`，把舊分支 `feat/v1.88-design-system-a` 上那顆文件 commit cherry-pick 過來，commit 訊息改成 `v1.89:` 開頭；這份計畫也一起 commit。
- [ ] **Step 3:** push 新分支；確認遠端收到後刪掉遠端舊分支 `feat/v1.88-design-system-a`（那是這支 session 自己開的，沒有 PR）。
- [ ] **Step 4:** `npm ci`（worktree 第一次跑）。在改任何東西之前，用 `scripts/verify/page-cls.mjs --all` 對**測試機目前的 dev** 量一次，存成改前的基準（輸出放 scratchpad）。

### Task 1: 換顏色（token 值）

**Files:**
- Modify: `src/app/globals.css`（`:root, :root[data-theme="light"]` 和 `:root[data-theme="dark"]` 兩塊、檔頭的設計方向註解）
- Test: `src/lib/__tests__/global-css.test.ts`

**Interfaces:**
- Produces: 同一組變數名稱，新的值。後面所有 Task 都只用既有變數名。

- [ ] **Step 1: 先寫會失敗的測試**（加在 `global-css.test.ts`）

```ts
describe("A 攻略工具配色（v1.89）", () => {
  it("頁底是中性灰黑／淺灰，不再是羊皮紙咖啡", () => {
    expect(themeValue("dark", "paper")).toBe("#0c0e12");
    expect(themeValue("light", "paper")).toBe("#f5f6f8");
  });
  it("卡片底不透明（glass、glass-strong 不帶透明度）", () => {
    for (const theme of themes) for (const name of ["glass", "glass-strong"])
      expect(rgba(themeValue(theme, name))[3]).toBe(1);
  });
  it("卡片不加陰影", () => {
    for (const theme of themes) expect(themeValue(theme, "glass-shadow")).toBe("none");
  });
  it("格紋線不再畫", () => {
    for (const theme of themes) expect(themeValue(theme, "grid-line")).toBe("transparent");
  });
});
```

注意：`rgba()` 看不懂 `none`、`transparent`，那兩條直接比字串。

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/global-css.test.ts`，確認新加的 4 條失敗、舊的都還過。
- [ ] **Step 3: 改值。** 照 spec「色彩」那張表，加上這幾條調整：
  - 夜晚 `--paper-edge` 用過得了「對頁底至少 2」的灰（起點 `#464d5a`）。
  - `--glass`／`--glass-strong`：夜晚 `#14171d`，白天 `#ffffff`。
  - 淡底（`*-wash`）一律寫成 `rgb(r g b / a)`：夜晚的橘是 `rgb(255 122 61 / 0.12)`，白天是 `rgb(194 65 12 / 0.08)`。藍、金、綠比照，透明度從 0.12／0.08 起調，調到既有的「小標籤在淡底上 4.5」測試過。
  - `--fx-panel`／`--fx-surface` 跟著換成新的 `--paper-deep`／`--paper` 值，`--fx-grid` 改成中性灰。紅漲綠跌的 `--fx-up*`／`--fx-down*` 不動。
  - 檔頭註解改成新方向（「A 攻略工具：中性深灰底、細框、小圓角、只有橘色當重點色」），並寫一句「變數名沿用舊的，paper＝頁底、glass＝卡片底、wood＝中性框色」。
- [ ] **Step 4:** 跑整份 `global-css.test.ts`，新的 4 條＋既有的對比測試全部要過。對比沒過就調顏色，**不准改測試門檻**。
- [ ] **Step 5:** commit：`v1.89: 換成 A 攻略工具配色（只改變數值）`

### Task 2: 底、卡片、框、圓角

**Files:**
- Modify: `src/app/globals.css`（`body`、`@utility glass-fill`／`glass`／`glass-solid`／`wood-frame`、`@theme`、捲軸色）
- Test: `src/lib/__tests__/global-css.test.ts`

**Interfaces:**
- Consumes: Task 1 的變數
- Produces: `glass`、`glass-solid`、`glass-fill`、`wood-frame` 四個 utility 名稱不變，都變成實心卡片；`rounded-xl`＝8px、`rounded-2xl`＝10px

- [ ] **Step 1: 先寫會失敗的測試**

```ts
it("頁底純色：body 沒有斜格紋、暈光", () => {
  const body = rules.find(r => r.selector === "body")!.body;
  expect(body).not.toMatch(/repeating-linear-gradient|radial-gradient/);
});
it("卡片不模糊（glass、glass-solid、glass-fill 都沒有 backdrop-filter）", () => {
  for (const name of ["glass-fill", "glass", "glass-solid"]) expect(utilityBody(css, name)).not.toMatch(/backdrop-filter/);
});
it("木框只剩一條細線，不再是內外雙線", () => {
  expect(utilityBody(css, "wood-frame")).toMatch(/border:\s*1px solid var\(--paper-edge\)/);
  expect(utilityBody(css, "wood-frame")).not.toMatch(/inset/);
});
it("圓角收小：rounded-xl 8px、rounded-2xl 10px", () => {
  const theme = rules.find(r => r.layer?.startsWith("@theme"))?.body ?? "";
  expect(theme).toMatch(/--radius-xl:\s*0\.5rem/);
  expect(theme).toMatch(/--radius-2xl:\s*0\.625rem/);
});
```

既有測試「導覽列用的毛玻璃底（glass-fill）……」裡的 `expect(fill).toMatch(/backdrop-filter/)` 要改成「`glass-fill` 不畫框、不模糊」，另一半「`not.toMatch(/border/)`」照留。測試標題一起改。注意 `rulesOf` 對 `@theme` 的 `layer` 會回傳整行 `@theme`，所以用 `startsWith("@theme")` 找。

- [ ] **Step 2:** 跑測試，確認新的這幾條失敗。
- [ ] **Step 3: 改。**
  - `body`：只留 `background-color: var(--paper)`，刪掉 `background-image` 和 `background-attachment`。
  - `glass-fill`：`background-color: var(--glass)`，不加陰影、不模糊。
  - `glass`、`glass-solid`：卡片底＋`border: 1px solid var(--paper-edge)`。
  - `wood-frame`：`border: 1px solid var(--paper-edge)`，不加陰影。
  - `@theme` 加上 `--radius-xl: 0.5rem; --radius-2xl: 0.625rem;`。`--radius-card` 改成 `0.5rem`，`--radius-pill` 不動。
  - 捲軸色改成 `var(--wood)`（`--wood` 在 Task 1 已經是中性灰）。
  - 每個 utility 上面的註解改成新的說法。
- [ ] **Step 4:** 跑整份 `global-css.test.ts` 和 `npx vitest run`，全部要過。
- [ ] **Step 5:** 起本機 dev server（worktree 另開埠＋`--webpack`，見記憶），截下面 5 頁的手機版（390 寬）跟電腦版（1280 寬），淺色深色各一張：`/`、`/guides/priest-31-50`、`/db/monsters`（往下捲到黏著列）、`/db/monsters/5130100`、`/plan/damage`。自己看有沒有兩層框、透明穿幫、看不到的框。
- [ ] **Step 6:** commit：`v1.89: 純色頁底、實心卡片、細框、小圓角`

### Task 3: 英數字改 Inter、數字等寬

**Files:**
- Modify: `src/app/layout.tsx`（字型宣告、`<html>` 的 className）
- Modify: `src/app/globals.css`（`@theme --font-sans`、新增 `@utility num`）
- Test: `src/lib/__tests__/global-css.test.ts`

**Interfaces:**
- Produces: 字型變數 `--font-inter`；utility `num`（`font-variant-numeric: tabular-nums`），第 2 輪起的表格、數值格會用到

- [ ] **Step 1: 先寫會失敗的測試**

```ts
it("英數字先用 Inter，中文再用 Noto Sans TC", () => {
  const theme = rules.find(r => r.layer?.startsWith("@theme"))?.body ?? "";
  expect(theme).toMatch(/--font-sans:\s*var\(--font-inter\),\s*var\(--font-noto-tc\)/);
});
it("有 num 這個 utility：數字等寬", () => {
  expect(utilityBody(css, "num")).toMatch(/font-variant-numeric:\s*tabular-nums/);
});
```

- [ ] **Step 2:** 跑測試，確認失敗。
- [ ] **Step 3:** `layout.tsx` 用 `next/font/google` 加 `Inter`：`subsets: ["latin"]`、`weight: ["400","600","800"]`、`variable: "--font-inter"`、`display: "swap"`，掛到 `<html>` 的 className，跟 `notoTC.variable` 並排。`globals.css` 的 `--font-sans` 把 `var(--font-inter)` 放在最前面。新增 `@utility num`。
- [ ] **Step 4:** 跑測試，全部要過。
- [ ] **Step 5:** 跑 `npm run build` 加 `scripts/verify/page-cls.mjs --all`，跟 Task 0 Step 4 存的基準比。每一頁的 CLS 都不能變大。變大了就先試 `adjustFontFallback`（next/font 預設是開的，確認沒被關掉），還是不行就把 `display` 改成 `"optional"` 再量一次。
- [ ] **Step 6:** commit：`v1.89: 英數字用 Inter、數字等寬`

### Task 4: 導覽列（選中的那頁改成底線，不再是橘色膠囊）

**Files:**
- Modify: `src/components/SiteHeader.tsx`（`<header>` 的 className、`NAV.map` 裡每個 `<Link>` 的 className）

**Interfaces:**
- Consumes: Task 2 的 `glass-fill`（現在是實心）

- [ ] **Step 1:** 先跑 `scripts/verify/nav-fit.mjs`，對現在的程式確認每個寬度都過，記下結果。
- [ ] **Step 2: 改 `<Link>` 的樣式。**
  - 選中的那頁：字用 `var(--ink)`、粗體，下緣一條 2px 橘線（用 `box-shadow: inset 0 -2px 0 var(--maple)`，或用貼齊導覽列底部的 `::after`）。拿掉 `bg-[color:var(--maple)]`、`shadow-sm`、`rounded-full`。
  - 沒選中的：字用 `var(--ink-soft)`；滑鼠移上去字變 `var(--ink)`，不加橘色底。
  - 左右的 padding、`flex-auto`、各寬度的斷點 class **一個都不准改**（v1.72、v1.74 每個寬度都量過）。
  - `<header>`：拿掉收起來時用的 `shadow-none!`（現在本來就沒有陰影）。下緣線照留。
- [ ] **Step 3:** 再跑一次 `nav-fit.mjs`，結果要跟 Step 1 一樣全部過。
- [ ] **Step 4:** 截圖：手機 360、390、500 寬，平板 800 寬，電腦 1280 寬，淺色深色各一張。跟 `候選-A.png` 的導覽列對照。
- [ ] **Step 5:** commit：`v1.89: 導覽列選中改成底線`

### Task 5: 共用選項按鈕（ChoiceGroup、FilterTag、首頁選職業）

**Files:**
- Modify: `src/components/ChoiceGroup.tsx`、`src/components/FilterTag.tsx`、`src/components/ProfileForm.tsx`（選職業、等級的按鈕）
- Test: `src/lib/__tests__/global-css.test.ts`（或新開 `src/components/__tests__/choice-style.test.ts`，讀這三個檔的原始碼）

**Interfaces:**
- Produces: 選項的樣子（後面幾輪新寫的選項照這個寫）
  - 沒選：`rounded-md border border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)]`
  - 選中：`border-[color:var(--maple)] bg-[color:var(--maple-wash)] text-[color:var(--maple)]`

- [ ] **Step 1: 先寫會失敗的測試**：讀這三個檔的原始碼，斷言：
  - 不含 `rounded-full`。
  - 選中的那組 class 不含 `bg-[color:var(--maple)]`（實心橘底），要含 `bg-[color:var(--maple-wash)]`。
- [ ] **Step 2:** 跑測試，確認失敗。
- [ ] **Step 3:** 照上面 Produces 改這三個檔。高度（`min-h-9`）、左右 padding、`aria-*`、鍵盤操作都不准動。ProfileForm 最下面那顆「選好職業、填好等級就能看」的主要按鈕改成 `rounded-md`，維持實心橘底。
- [ ] **Step 4:** 跑測試，要過。
- [ ] **Step 5:** commit：`v1.89: 選項按鈕改成小圓角、選中是橘框淡底`

### Task 6: 全站掃一遍膠囊（rounded-full）

**Files:**
- Modify: 目前有 49 個檔用到 `rounded-full`，每一處逐一判斷
- Test: 新開 `src/lib/__tests__/no-pill.test.ts`

**Interfaces:**
- Consumes: Task 5 的選項樣式

- [ ] **Step 1: 先寫會失敗的測試** `no-pill.test.ts`
  - 掃 `src/` 底下所有 .tsx，找出 `rounded-full`。
  - 每一處要嘛在允許清單裡，要嘛同一行有 `// 圓形：<原因>` 的註解。允許的是頭像、圓點、圓形圖示按鈕（例如 ThemeToggle 的 `size-10`），這些才能留著圓形。
  - 其他的就失敗，並列出「檔名:行號」。
- [ ] **Step 2:** 跑測試，確認失敗。失敗列出的清單就是這一步的工作清單。
- [ ] **Step 3: 逐處改。**
  - 按鈕、標籤、選項、輸入框 → `rounded-md`（6px）。
  - 小標籤（站上計算、台服回報這類出處標籤、Chip）→ `rounded`（4px）。
  - 真的要圓的 → 留 `rounded-full`，加 `// 圓形：…` 註解。
  - 實心橘底的主要按鈕照留實心，只改圓角。
- [ ] **Step 4:** 跑 `no-pill.test.ts` 跟全部測試，都要過。
- [ ] **Step 5:** 跑 emoji 掃描，範圍是這一輪動過的檔：`git diff --name-only origin/dev -- '*.tsx' '*.ts' | xargs grep -nP '[\x{2300}-\x{23FF}\x{25A0}-\x{25FF}\x{1F300}-\x{1FAFF}]'`，要沒有輸出。
- [ ] **Step 6:** commit：`v1.89: 全站膠囊改小圓角（頭像、圓點照留）`

### Task 7: 全站驗收、開 PR 進 dev

**Files:** 無（只跑驗收）

- [ ] **Step 1:** `npm test`、`npm run build` 都要過；`npm run verify:db` 也要過（查資料頁的樣式有動到）。
- [ ] **Step 2:** 本機正式建置，跑下面幾支，結果都要過：
  - `MSYS_NO_PATHCONV=1 node scripts/verify/contrast-audit.mjs <scratchpad> http://localhost:<埠>`，淺色深色都跑，全部 0 筆。
  - `page-cls.mjs --all`，不比 Task 0 的基準差。
  - `nav-fit.mjs`。
  - `home-first-frame.mjs`。
  - `pages-first-frame.mjs`。
- [ ] **Step 3: 截圖清單。** 每一頁都要截：電腦 1280 寬、手機 390 寬，淺色、深色。
  - 頁面：`/`（第一次來＋已存角色各一次）、`/guides`、`/guides/priest-31-50`、`/db`、`/db/monsters`、`/db/monsters/5130100`、`/plan/damage`（選好職業）、`/plan/speed`、`/price/fx`、`/go`、`/future`。
  - 跟 `docs/design-candidates/` 的圖並排看。這一輪只換了底色、框、圓角、字、按鈕，**版面差異是第 2 輪以後的事**，不要在這一輪偷改版面。
- [ ] **Step 4:** 自己先用手機寬度玩一輪，主動列出至少 10 點還不像候選圖的地方，寫進 PR 內文的「第 2 輪起要處理」。
- [ ] **Step 5:** push，開 PR → `dev`。PR 內文寫：做了什麼、驗收結果（附數字）、改前改後截圖、**只進 dev 不上正式機**、第 2 輪清單。
- [ ] **Step 6:** `gh pr checks` 三條（單元測試、建置、第一格）都出現而且綠了，才合併。合併後確認 dev 的 Workers Builds 部署成功，**貼測試機網址**給使用者，附 5 頁淺色深色截圖。
- [ ] **Step 7:** 合併後刪掉 feat 分支。在 spec 的「交付方式」補一行：第 1 輪的 PR 編號、合併日期。
