# 第二批攻略文（系列任務、地區懶人包、職業配點）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用程式從遊戲資料產表格、人寫前後文字，出約 40 篇攻略文；第一輪先出 4 篇樣本給使用者看。

**Architecture:** 文章都是 `src/content/guides/<slug>.md`（沿用 v1.88 一般攻略文，自動進攻略專區）。表格由 `src/lib/guide-gen/` 的純函式從 public/data 算成 Markdown 字串，寫進 md 的 `<!-- gen:<key> -->`～`<!-- /gen -->` 之間（解析時註解會拿掉、中間的表格照畫）；本機用 `npm run guide:gen` 改寫檔案，CI 測試重算一次跟檔案比對，不一致就紅。

**Tech Stack:** Next.js、TypeScript、vitest（產生器沿用 `vitest.gen.config.ts` 跑 `*.gen.ts` 的做法）。

**Spec:** `docs/superpowers/specs/2026-11-13-article-batch-quests-builds-design.md`

## Global Constraints

- 標題、內文都要有「楓之谷經典版」（`guideProblems` 已擋）。
- 網址：系列 `/guides/quest-line-<第一個任務 id>`、懶人包 `/guides/quests-<maple-island|victoria|el-nath>`、配點 `/guides/skill-build-<JOB_SLUGS[二轉]>`。
- 分類：系列、懶人包 `category: 任務`；配點 `category: 職業攻略`，tags 帶職業線＋一轉、二轉、三轉。
- 不收：萬聖節／活動、組隊、稱號、轉職（推薦職業、X之路）、冒險家的戒指、cat「其他任務」（9250～9254）。
- 來源三色：遊戲資料／站上計算／參考舊版資料；舊版點法（6 條三轉）一律標「參考舊版資料」。
- 不編造：文字只寫資料查得到的；沒有就不寫。UI 不准 emoji。不准真實品牌名。
- 每篇在 `RELATED_RULES` 登記；每篇主圖用 `scripts/guide-card-heroes.mjs`（不准有字，自己用眼睛看）。
- 改了 `public/data` 才要動 `meta.json` builtAt；這批只加 md 跟圖，不動 public/data。
- 只進 dev；commit 以 `v2.23:` 開頭（開分支前 `git fetch` 看 origin/dev、origin/main 有沒有被佔走，被佔就往上跳）。
- 每輪 PR 合併前 `gh pr checks` 三條（單元測試、建置、第一格）都出現且綠。

## Review Focus

1. **資料更新後表格過期**：上游改任務經驗或點法 → `guide-gen.test.ts` 的「產生區塊跟資料一致」要紅，訊息寫哪篇哪塊、叫你跑 `npm run guide:gen`。（Task 2）
2. **系列裡有任務在沒開放的地圖或連到不存在的單獨頁** → 連結要麼連得到、要麼不連；404 測試擴到 NPC、地圖、技能。（Task 1）
3. **系列分叉（古代之書是一棵樹）**：主線照前置順序、分支各自成段，任務不重複不漏。（Task 2）
4. **沒寫接取等級的任務**：不寫「0 等」，顯示「不限等級」；楓之島整篇照接的順序。（Task 3）
5. **配點表點數加總超過該轉拿得到的技能點**：表格每段累計點數不得超過 `availableSp(job, 該段最高等級)`。（Task 4）

---

### Task 1: Markdown 來源標籤＋連結測試擴充

**Files:**
- Modify: `src/lib/guide-markdown.ts`（`Inline` 加一種、`parseInline` 認新寫法）
- Modify: `src/components/GuideDocView.tsx`（畫來源標籤，樣式抄 `JobArticleView.tsx:38` 的 `SourceTag`）
- Modify: `src/lib/__tests__/guide-markdown.test.ts`

**Interfaces:**
- Produces: Markdown 行內寫法 `{{src:game}}`／`{{src:calc}}`／`{{src:legacy}}` → `Inline` 新增 `{ t: "src"; tag: "game" | "calc" | "legacy" }`。GuideDocView 用自己的字樣 `{ game: "遊戲資料", calc: "站上計算", legacy: "參考舊版資料" }`（不用 `TAG_LABEL` 的「舊版路線」），顏色借 `JobArticleView` 的 tone。
- Produces: 404 測試 regex 擴成 `/db/(items|quests|monsters|npcs|maps|skills)/`。

- [ ] **Step 1: 寫失敗測試**
  - `it("行內來源標籤：{{src:legacy}} 變成標籤，不認的 {{src:xx}} 照原文")`：`parseInline("點法 {{src:legacy}}")` 等於 `[{t:"text",v:"點法 "},{t:"src",tag:"legacy"}]`；`parseInline("{{src:xx}}")` 等於 `[{t:"text",v:"{{src:xx}}"}]`。
  - 把既有 404 測試的 `pages` 加 `npcs`（`staticNpcs()` 有單獨頁的 id）、`maps`（地圖單獨頁清單，用 `site-pages.ts` 產 sitemap 的同一份）、`skills`，regex 跟著擴。
  - `renderToString(GuideDocView)` 含「參考舊版資料」。
- [ ] **Step 2:** `npx vitest run src/lib/__tests__/guide-markdown.test.ts` → 新測試 FAIL。
- [ ] **Step 3:** 實作（`parseInline` 的 pattern 加一支 `\{\{src:(game|calc|legacy)\}\}`）。
- [ ] **Step 4:** 同指令全 PASS；`npm test` 全綠（既有文章沒連 npcs/maps/skills 壞頁）。
- [ ] **Step 5: Commit** `v2.23: 一般攻略文可以標資料來源；文章連 NPC、地圖、技能單獨頁也擋 404`

---

### Task 2: 系列任務產生器

**Files:**
- Create: `src/lib/guide-gen/quest-lines.ts`
- Test: `src/lib/__tests__/guide-gen-quest-lines.test.ts`

**Interfaces:**
- Consumes: `Quest`（`public/data/quests.json`：`id, n, cat, minLv, pre, sNpc{id,n,map,mapName}, eNpc, needMobs[{id,n,c}], exp, rewardItems[{id,n,c}]`）、`questSteps(quest, ctx)`／`stepText(step)`（`src/lib/quest-steps.ts`）、`QuestStepContext`（`staticQuestStepContext()`）。
- Produces:
  ```ts
  export type QuestLine = { id: string /* 第一個任務 id */; name: string; quests: Quest[] /* 主線照前置順序 */; branches: { after: string; quests: Quest[] }[]; minLv: number | null; maxLv: number | null; totalExp: number };
  export function questLines(quests: Quest[]): QuestLine[];            // 照收錄規則挑
  export function questLineMarkdown(line: QuestLine, ctx: QuestStepContext): Record<"summary" | "steps", string>;
  export const QUEST_LINE_EXTRA: string[]; // 不到 5 個也收的第一個任務 id（珍的挑戰、阿勒斯、酋長蓋房子；實作時從資料查 id 填）
  ```

收錄規則（`questLines`）：用 `pre` 做 union-find 連通；排除 `cat` 為 活動／組隊任務／稱號／職業／其他任務、名字含「萬聖節」「冒險家的戒指」；留下大小 ≥5 或第一個任務 id 在 `QUEST_LINE_EXTRA`。主線＝從沒有前置（在本系列內）的任務往下，每步挑「後面還接最多任務」的那個；沒走到的任務歸到 `branches`，`after` 是它在本系列內的前置任務 id。系列名：Search Console 搜尋字對得到的那個任務名優先（`QUEST_LINE_NAME` 對照表手填，約 5 筆），沒有就用第一個任務名去掉「1」「(1)」這類尾巴。

- [ ] **Step 1: 寫失敗測試**（讀真資料 `staticQuests()`）
  - 「波達系列有 11 個任務，第一個是妖精的號角、含波達的請求（3059）」
  - 「萬聖節、冒險家的戒指不在任何系列」
  - 「每個系列的任務（主線＋分支）不重複、加起來等於連通的任務數」——Review Focus 3
  - 「古代之書那條：分支不為空、每個分支的 after 在本系列內」
  - 「珍的挑戰（4 個）有收」
  - 「questLineMarkdown：summary 有『N 個任務』『總經驗』；steps 每個任務一個 `###`；沒寫接取等級寫『不限等級』不寫 0」——Review Focus 4
  - 「steps 裡的 /db 連結都是 ctx.*Href 給的（沒單獨頁的不連）」——Review Focus 2
- [ ] **Step 2:** `npx vitest run src/lib/__tests__/guide-gen-quest-lines.test.ts` → FAIL。
- [ ] **Step 3:** 實作。`steps` 每個任務：`### <n>. <任務名>（<幾等>）`，下面用 `questSteps`＋`stepText` 組成清單（`StepSeg` 的連結轉 `[字](href)`），最後一行 `經驗 <exp>｜獎勵 …` 加 `{{src:game}}`。分支各一段 `### 做完「X」之後也可以接`。
- [ ] **Step 4:** 測試 PASS。
- [ ] **Step 5: Commit** `v2.23: 系列任務產生器（用前置任務串成系列、主線＋分支、每步照任務單獨頁的寫法）`

---

### Task 3: 地區懶人包產生器

**Files:**
- Create: `src/lib/guide-gen/region-quests.ts`
- Test: `src/lib/__tests__/guide-gen-region.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `questLines`；`mustDoIndex(common)`（`src/lib/route-planner.ts:243`，`staticGuide("common")` 那份）判定「必解」。
- Produces:
  ```ts
  export const REGIONS = [{ slug: "maple-island", cat: "楓之島", order: "chain" }, { slug: "victoria", cat: "維多利亞島", order: "level" }, { slug: "el-nath", cat: "冰原雪域", order: "level" }] as const;
  export function regionMarkdown(region: (typeof REGIONS)[number], quests: Quest[], lines: QuestLine[], mustDo: Map<string, unknown>): Record<"summary" | "table", string>;
  ```
  表格欄：任務（連 /db/quests）、幾等、誰給（連 NPC）、經驗、獎勵、系列（有系列文就連 `/guides/quest-line-<id>`）。`order: "level"` 照 `minLv` 分段（1～10、11～20…），沒寫等級的另成「不限等級」段；`order: "chain"` 照前置順序。必解的任務名後加 **必解**。

- [ ] **Step 1: 寫失敗測試**：三區任務數等於資料裡同 cat 的一般任務數（扣排除規則）；楓之島表格第一列是沒有前置的任務；沒寫等級的不出現「0 等」；有系列的列連到系列文網址；必解只出現在 `mustDoIndex` 有的任務。
- [ ] **Step 2:** 跑測試 FAIL。
- [ ] **Step 3:** 實作。
- [ ] **Step 4:** PASS。
- [ ] **Step 5: Commit** `v2.23: 地區任務懶人包產生器（楓之島照接的順序、其他照等級、標必解跟系列文）`

---

### Task 4: 職業配點產生器

**Files:**
- Create: `src/lib/guide-gen/skill-build.ts`
- Test: `src/lib/__tests__/guide-gen-skill-build.test.ts`

**Interfaces:**
- Consumes: `staticGuide(job)`（`builds`：`{label, main, v: "tw"|"legacy"|…, s: string[], steps: {id,name,to,note?}[]}`）、`mainBuild(builds, prefer?)`、`buildProgress`、`stepsBetween`、`spAtLevel`、`availableSp`、`earlierJobLevels`（`src/lib/skill-plan.ts`）、`JOB_SLUGS`。
- Produces:
  ```ts
  export const BUILD_LINES: number[]; // 12 個二轉：110,120,130,210,220,230,310,320,410,420,510,520
  export function skillBuildMarkdown(job2: number): Record<"first" | "second" | "third" | "others", string>;
  ```
  每轉一張表：`等級｜點什麼｜點到幾級｜說明`，等級用 `stepsBetween` 照技能點累計換算成「第幾等點到」（一轉 1 轉職點＋每級 3 點，跟 `spAtLevel` 同算法）；`prefer` 傳二轉職業名（一轉的主流常分線）。三轉表的 build `v` 是 legacy 就在表上方加一行「這套點法是舊版玩家整理的 {{src:legacy}}」，否則 `{{src:calc}}`。`others`：同一轉其他 `main: true` 的點法各列一行標籤＋前 5 步。

- [ ] **Step 1: 寫失敗測試**
  - 「12 條線都產得出 first、second；三轉有資料的都產得出 third」
  - 「槍騎兵 second 第一列是精準之槍、跟 mainBuild(staticGuide(130).builds, '槍騎兵') 同一套」
  - 「每張表最後一列的累計點數 ≤ availableSp(那一轉職業, 該列等級)」——Review Focus 5
  - 「十字軍、騎士、魔導士（火毒）、狙擊手、神偷、格鬥家的 third 含 {{src:legacy}}」
  - 「技能名都在 staticSkills() 查得到」
- [ ] **Step 2:** FAIL。
- [ ] **Step 3:** 實作。
- [ ] **Step 4:** PASS。
- [ ] **Step 5: Commit** `v2.23: 職業配點產生器（照首頁升級路線那套主流點法，換算成第幾等點到幾級）`

---

### Task 5: 寫檔指令＋一致性測試

**Files:**
- Create: `src/lib/guide-gen/sections.ts`（共用：讀／換 md 裡的 `<!-- gen:<key> -->…<!-- /gen -->`）
- Create: `src/lib/guide-gen.gen.ts`（vitest.gen 跑，改寫 md）
- Create: `scripts/guide-gen.mjs`（包裝，開頭寫用法，照 `scripts/job-article-table.mjs` 的寫法）
- Modify: `package.json` 加 `"guide:gen": "node scripts/guide-gen.mjs"`
- Test: `src/lib/__tests__/guide-gen.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function replaceGenSections(md: string, sections: Record<string, string>): { md: string; missing: string[] }; // missing：md 裡有標記但 sections 沒給
  export function readGenSections(md: string): Record<string, string>;
  export function expectedSections(slug: string): Record<string, string> | null; // 依 slug 前綴分派到 Task 2/3/4；不是這三種回 null
  ```
- `npm run guide:gen`：所有 `quest-line-*`／`quests-*`／`skill-build-*` 的 md 換掉產生區塊；`npm run guide:gen -- new quest-line 3058` 建新檔骨架（frontmatter＋標記＋人寫段落的空白 TODO 註解，產完就填好表格）。

- [ ] **Step 1: 寫失敗測試**：`replaceGenSections` 只換標記內、標記外一字不動、CRLF 也行；`guide-gen.test.ts`「每篇產生的 md：檔案裡的區塊 === expectedSections(slug)」，不一致的錯誤訊息含 slug、key、「跑 npm run guide:gen」——Review Focus 1；「每篇在 RELATED_RULES 有登記」（guide-related.test.ts 原本就擋，確認涵蓋）。
- [ ] **Step 2:** FAIL。
- [ ] **Step 3:** 實作。
- [ ] **Step 4:** PASS；README「攻略文」段補 `guide:gen` 用法（同一個 commit）。
- [ ] **Step 5: Commit** `v2.23: npm run guide:gen 產系列任務、懶人包、配點的表格，測試擋資料變了沒重產`

---

### Task 6: 4 篇樣本文章＋主圖＋互導

**Files:**
- Create: `src/content/guides/quest-line-<波達系列第一個 id>.md`、`quest-line-<珍的第一個挑戰 id>.md`、`quests-victoria.md`、`skill-build-spearman.md`
- Modify: `src/lib/guide-related.ts` 的 `RELATED_RULES`（4 筆）
- Modify: `scripts/guide-card-heroes.mjs` 的 `SCENES`（4 張：波達＋天空之城、珍＋黑肥肥、維多利亞港、龍騎士）
- Create: `public/assets/guides/<slug>/hero.webp`、`hero.jpg`

- [ ] **Step 1:** `npm run guide:gen -- new …` 建 4 篇骨架。
- [ ] **Step 2:** 寫人寫段落：開頭一段（這篇幫你什麼、幾等來看）、「一分鐘看懂」引言框、結尾「做完接著做什麼」。只寫表格裡查得到的事；配點文的口吻用該職業線 31～50 那篇的 persona（`src/data/job-articles/130-31-50.json` 的 `persona`）。標題照設計文件格式。
- [ ] **Step 3:** 對照 `src/data/job-articles/130-*.json`、`131-71-90.json` 的「技能怎麼點」段落跟配點表；不一致改職業攻略的文字（不動 json），列在 PR 內文。
- [ ] **Step 4:** `node scripts/guide-card-heroes.mjs <4 個 slug> --ai`，每張自己看（不准有字、怪認得出來）。
- [ ] **Step 5:** `npm test` 全綠、`npx next build` 過。
- [ ] **Step 6: Commit** `v2.23: 4 篇樣本——波達系列、珍的挑戰、維多利亞島任務總整理、龍騎士配點`

---

### Task 7: 第一輪交付（PR 進 dev＋測試機驗收）

- [ ] **Step 1:** `git fetch origin`；看 origin/dev、origin/main 最新版號，v2.23 被佔就整批改號。開 PR 進 dev，內文寫：這輪 4 篇、跟哪篇職業攻略改了文字、沒做的（量產在下一輪）。
- [ ] **Step 2:** `gh pr checks <N>` 三條出現且綠 → `--match-head-commit` 合併；確認 Workers Builds 測試機部署成功。
- [ ] **Step 3:** 測試機實際打開 4 篇（電腦＋375 寬手機）截圖；/guides 攻略專區看得到 4 張卡；文末相關卡有 3 張。
- [ ] **Step 4:** 以台灣第一次玩的手機用戶角度派 agent 打分（1–5，要有分佈）＋自己挑 ≥10 點優化。
- [ ] **Step 5:** 把 4 篇網址、截圖、分數、優化清單交使用者，**等使用者看過再做 Task 8**。

---

### Task 8: 第二輪——其餘系列任務＋另兩篇懶人包（使用者看過樣本後）

- [ ] **Step 1:** 照樣本的修改意見先改 Task 2/3 產生器與 4 篇樣本。
- [ ] **Step 2:** `npm run guide:gen -- new quest-line <id>` 建其餘約 22 篇＋`quests-maple-island`、`quests-el-nath`；人寫段落照樣本格式。
- [ ] **Step 3:** `RELATED_RULES` 登記、`SCENES` 加圖、跑 `--ai` 每張看過。
- [ ] **Step 4:** `npm test`、`npx next build` 綠 → PR 進 dev → 三條綠 → 測試機抽 5 篇＋2 篇懶人包截圖驗收。
- [ ] **Step 5: Commit/PR** `v2.24: 系列任務 N 篇＋楓之島、冰原雪域任務總整理`（版號開工時再確認）。

---

### Task 9: 第三輪——其餘 11 篇配點

- [ ] **Step 1:** 照樣本意見改 Task 4。
- [ ] **Step 2:** 建 11 篇（`BUILD_LINES` 扣 130）；6 條三轉舊版的段落有「參考舊版資料」標籤（Task 4 測試已擋）。
- [ ] **Step 3:** 每篇對照職業攻略「技能怎麼點」，不一致改文字、列在 PR。
- [ ] **Step 4:** 圖、相關、測試、建置、PR、測試機驗收同 Task 8。
- [ ] **Step 5:** 回報：全部網址、哪幾篇標舊版、上正式機等使用者說。
