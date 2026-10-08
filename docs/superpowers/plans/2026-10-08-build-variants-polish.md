# 第二套點法上線後的 12 項優化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v0.75（首頁「能力值與裝備」卡第二套點法：盜賊全幸、法師裝備法）上線後列的 11 項優化，加使用者追加的第 12 項（俠盜全幸），全部上 dev。

**Architecture:** 算法放 `src/lib/gear.ts`（純函式）／`src/lib/gear-view.ts`（組卡片、升級路線一段）；資料由 `pipeline/build-gear.mjs` 從遊戲資料＋研究檔 `data/guides/gear.json` 產出 `public/data/gear.json`；畫面在 `GearCard.tsx`、`RouteTimeline.tsx`。選的點法照舊記在 localStorage `ms-build`（`useBuildChoice`，鍵是一轉代碼）。

**Tech Stack:** Next.js 16（全站靜態）、React 19、TypeScript、vitest、node:test、無頭 Chrome（DevTools 協定）驗收腳本。

**Spec:** `docs/superpowers/specs/2026-10-08-build-variants-design.md`（v0.75 的設計）＋本檔「使用者拍板」一節（12 項的做法，2026-10-08 使用者回「都照你建議」，第 8 項選 A）。

## 使用者拍板（2026-10-08）

1. 升級路線跟著卡片選的點法換：同一個 `useBuildChoice`；每段武器照那套點法算（全幸照「空身＋要湊的裝備」）；那段剛穿得上的要湊裝備，它的卷（套服／披風敏捷）也列進那段的卷軸。**只有現在職業的卡片有這個標籤才換**（選擇是盜賊系共用一份）。
2. 全幸「空身敏捷先點到 31 就能用 狼牙（攻擊 16），幸運少 6」——少幾點＝差的點數加總，扣在主屬性。
3. 要湊的裝備底下加一行運氣好的上限：有卷的那幾件改衝 60% 卷全部成功（點數照遊戲資料：可衝次數 × 60% 卷加的點數），敏捷最多多少、能用哪把；寫明「全部成功才有，不是保證」「10% 卷全過幾乎不可能，不算」。
4. 任務「隨機給」的要湊裝備（綠色斗笠〈第一次同行〉）名字旁加標籤「隨機，不一定拿到」。
5. 裝備法多一塊「穿得上的法師防具」：帽子、套服（或上衣＋褲裙）、鞋子、手套、盾牌，每部位現在拿得到、穿得上、等級最高的那件，去哪拿照 `closestSource`；底下寫主推（全智）穿不上。資料由 pipeline 從遊戲資料多輸出一份法師防具。
6. 兩條「全智轉裝備法」（洗點／不洗點）拿掉 tab，全智頁「看全部」也看得到。
7. 洗點捲軸查官方價：查到換官方價＋出處；查不到維持「巴哈玩家說洗 1 點約 20 台幣」，回報寫查了哪些。
8. 點法按鈕下面一行「選中那套：好處＋代價」（候選 A）。字放研究檔 `tabText`，取自研究檔已有的玩家說法：
   - 刺客／盜賊 一般點法「同等級的拳套都穿得上，不用另外湊裝備」；全幸「前期打得比較痛，但敏捷要靠裝備湊」
   - 俠盜 一般點法「同等級的短刀都穿得上，不用另外湊裝備」；全幸「幸運點得最多，但短刀要的敏捷要靠裝備湊」
   - 法師 全智「不用花錢湊幸運裝備」；裝備法「被打比較不痛，但要花錢買法杖跟法師裝」
9. 點法切換改 radiogroup＋`aria-checked`（新元件 `ChoiceGroup`，方向鍵切換），`FilterTag` 不動。
10. 要湊的裝備還沒到等級的列：拿掉 `opacity-60`，字回正常色，加「Lv.30 起」小標；文字對比 ≥ 4.5:1（WCAG AA）。
11. `scripts/verify/check-first-frame.mjs` 加第 7 項：刺客 35＋`ms-build {"400":"全幸"}`，硬重新整理跟站內換頁，第一次畫出來的卡就是全幸、沒有 hydration 警告。
12. 俠盜（420）、神偷（421）也有「一般點法／全幸」：全幸照刺客做（同一份 kit、短刀），標舊版經驗（`verified: "legacy"`）。

## Global Constraints

- 全程繁體中文；UI 不用 emoji、不用 icon set（狀態用文字或 inline SVG）。
- 不編造：數字一律從遊戲資料算（`public/data/*.json`），文案取自研究檔已有、附出處的說法。
- 遊戲內用字照客戶端字串（「能力點數重配捲軸」是捲軸不是卷軸；部位名：帽子、套服、上衣、褲/裙、鞋子、手套、盾牌）。
- 重建 `public/data/gear.json` 前要有 `data/raw/artale.json`（`node pipeline/fetch-artale.mjs`）；重建後只准 `rules`、`notes`、`armor`、`builtAt` 變。
- 版號 `v0.76`，commit 前 `git log --all --oneline | grep -oE "v0\.[0-9]+"` 再查一次；docs 跟程式分開 commit，PR 進 dev 用 rebase 合併。
- worktree 指令：vitest `node ../../../node_modules/vitest/vitest.mjs run`、tsc `node ../../../node_modules/typescript/bin/tsc --noEmit -p .`、node:test `node --test "pipeline/**/*.test.mjs"`。

---

### Task 1: 研究檔（第 6、8、12 項）

**Files:**
- Modify: `data/guides/gear.json`（statRules、gearNotes）
- Modify: `pipeline/lib/gear.mjs`（`convertStatRules` 帶 `tabText`）、`pipeline/lib/gear.test.mjs`
- Modify: `src/lib/gear.ts`（`StatRule.tabText?: string`）

**Interfaces:** Produces `StatRule.tabText?: string`（點法按鈕下那行字）。

- [ ] 先寫 node:test：`convertStatRules([{ ..., tab: "全幸", tabText: "前期…" }])` 帶出 `tabText`；沒寫就沒有這個欄位。跑 `node --test pipeline/lib/gear.test.mjs` 看它紅。
- [ ] `convertStatRules` 加 `...(rule.tabText ? { tabText: rule.tabText } : {})`，跑綠。
- [ ] 研究檔：上面第 8 項六句寫進對應 rule 的 `tabText`（法師三轉那兩條也寫）；兩條「全智轉裝備法」拿掉 `"tab": "裝備法"`；[420] 主推加 `tab: "一般點法"`、`weapons: ["短刀"]`；新增 [420] 全幸（secondary DEX fixed 25、weapons 短刀、kit 同刺客、legacy、出處 ptt M.1213528198、巴哈 G2 7650/1476，text 寫「舊版刀賊攻略的全幸型；經典版查不到有人這樣玩」）；[421] 主推加 tab 一般點法＋weapons 短刀；既有 [421] 三轉全幸加 tab 全幸、weapons 短刀、同一份 kit。
- [ ] Commit `v0.76 (1/6): 研究檔——點法按鈕下的白話說明、全智頁也看得到轉裝備法、俠盜神偷加全幸`

### Task 2: pipeline 輸出法師防具（第 5 項資料）

**Files:**
- Modify: `pipeline/lib/gear.mjs`（`ARMOR_SLOTS`、`buildArmor`、`sortArmor`）、`pipeline/build-gear.mjs`、`pipeline/lib/gear.test.mjs`
- Modify: `public/data/gear.json`（重建）

**Interfaces:** Produces `gear.json` 的 `armor: GearArmor[]`：`{ id, n, slot, lv, req?, job, src, o? }`，只收職業限制含法師（reqJob & 2，>0）、部位在 `ARMOR_SLOTS`、拿得到的；排序：部位照 `ARMOR_SLOTS`、等級低到高、同等級裡加智力多的先、防禦（物防＋魔防）高的先、拿法多的先、id 小的先（前端同等級取第一件）。

- [ ] node:test：`buildArmor` 收法師帽子（帶 req LUK／INT、job 2）、不收全職業帽（reqJob 0）、不收劍士帽、不收沒來源的；`sortArmor` 同等級加智力的排前面。跑紅。
- [ ] 實作、跑綠；`build-gear.mjs` 加 `armor` 輸出跟件數統計。
- [ ] `npm run data:gear`（需要 `data/raw/artale.json`）；`git diff --stat public/data/gear.json` 只有預期段落變（用 node 比對 weapons、scrolls、before 完全相同）；記下檔案大小。
- [ ] Commit `v0.76 (2/6): 遊戲資料多一份法師防具（給裝備法挑每個部位穿得上的）`

### Task 3: 算法（第 1、2、3、5 項）

**Files:**
- Modify: `src/lib/gear.ts`（`GearArmor`、`GearData.armor?`、`canWear`／`statShortfall` 收任何有 `req` 的東西、`armorPicks`、`luckyKit`）
- Modify: `src/lib/gear-view.ts`（`gearPlan` 加 `strongerCost`、`kit.lucky`、`armor`；`bandGear(..., tab?)`）
- Test: `src/lib/__tests__/gear.test.ts`、`src/lib/__tests__/gear-view.test.ts`

**Interfaces:**
- `armorPicks(armor: GearArmor[], job: number, level: number, wear: Record<StatKey, number>, beforeOpen?: boolean): GearArmor[]`——帽子、套服（上衣跟褲裙都比套服高等才換成兩件）、鞋子、手套、盾牌，每部位一件。
- `gearPlan(...).strongerCost: { stat: StatKey; value: number } | null`——有 kit 且有 stronger 時，主屬性少幾點。
- `gearPlan(...).kit.lucky: { rate: number; slots: string[]; wear: number; weapon: GearWeapon | null } | null`——有卷的那幾件改衝 60% 全部成功；比現在多不到 1 點就 null。
- `gearPlan(...).armor: { pieces: Array<{ piece: GearArmor; source: SourcePick | null }>; mainCannot: { tab: string; stat: StatKey; have: number } | null } | null`
- `bandGear(gear, job, from, to, beforeOpen, tab?: string | null)`

- [ ] 測試（假資料）：`armorPicks` 每部位取等級最高、穿不上／等級不夠／10/15 前只有 V002 的不取、上衣褲裙 vs 套服；`bandGear` 帶 tab：刺客全幸 30–39 列青銅指虎、卷多套服敏捷；俠盜（卡片沒有那個標籤）選全幸不換。跑紅。
- [ ] 測試（真資料）：刺客 35 全幸 `strongerCost` = 幸運 6、`kit.lucky` = 60%／套服、披風／敏捷 59／狼牙；刺客 25 全幸 lucky 敏捷 38；火毒 50 裝備法 `armor` 有帽子、鞋子…且都穿得上、`mainCannot` 是全智幸運 4；全智 `armor` 是 null；全智也看得到兩條轉裝備法提醒；俠盜 35 全幸：飛影刃、下一把雙枝短刀空身 36、一般點法這級暗影刃；神偷 80 全幸；420、421 有「一般點法／全幸」。跑紅。
- [ ] 實作、全綠；`tsc` 過。
- [ ] Commit `v0.76 (3/6): …算法`

### Task 4: 畫面（第 1、2、3、4、5、8、9、10 項）

**Files:**
- Create: `src/components/ChoiceGroup.tsx`
- Modify: `src/components/route/GearCard.tsx`、`src/components/route/RouteTimeline.tsx`

- [ ] `ChoiceGroup`：`role="radiogroup"`＋`role="radio"`、`aria-checked`、只有選中那顆 `tabIndex=0`、方向鍵／Home／End 換選並移焦點；樣子同 FilterTag。
- [ ] `TabRow` 換 `ChoiceGroup`，下面一行「{tab}：{tabText}」。
- [ ] 武器區：全幸那句加「，幸運少 N」。
- [ ] KitBlock：隨機給的加「隨機，不一定拿到」（金色淡底、深色字）；later 列拿掉 opacity、加「Lv.N 起」；合計下面加運氣好的上限那行。
- [ ] ArmorBlock：「穿得上的法師防具」，每件圖、名、部位・Lv、去哪拿；底下「全智幸運只有 4，上面這些都穿不上」。
- [ ] `BandGearBlock` 用 `useBuildChoice(job)` 傳 tab 給 `bandGear`。
- [ ] `tsc`、vitest 全綠；本機 dev server 開 390 寬看一次。
- [ ] Commit `v0.76 (4/6): …畫面`

### Task 5: 驗收腳本（第 11 項＋全部截圖）

**Files:**
- Modify: `scripts/verify/check-first-frame.mjs`（第 7 項）
- Modify: `scripts/verify/build-variants-shot.mjs`（radiogroup 選擇器、俠盜／神偷、全智展開、升級路線那段、方向鍵、later 列對比）
- Modify: `scripts/verify/README.md`

- [ ] check-first-frame 第 7 項：刺客 35 全幸，硬重新整理逐格記，所有卡片已畫好的格選中的都是「全幸」、有「要湊的敏捷裝備」；站內換頁（查資料 → 我的路線）第一格就是全幸；跑完還原狂戰士 45、清掉 `ms-build`。本機 build＋start 跑一次全綠；故意把 `useBuildChoice` 的預設改成主推看它紅（改完還原）。
- [ ] build-variants-shot：上面幾項，輸出加 `route-<角色>.png`、`keyboard`、`contrast`。
- [ ] Commit `v0.76 (5/6): 驗收…`

### Task 6: 洗點價錢（第 7 項）、文件、PR

- [ ] 依查價結果改研究檔那條洗點提醒（查到官方價就換、附出處），重建 gear.json。
- [ ] README／記憶更新；PR 進 dev（rebase 合併）、`gh pr checks` 三條綠、查 Vercel 狀態、測試機截圖（手機 390）每一項。
