# 10/22 攻略追蹤＋上游資料刷新（v1.11）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 10/22 報告使用者拍板的項目做完：資料自動更新改比上游內容雜湊（第 2 項）、本機刷新上游 10/16～10/21 的修正進 dev（第 1 項）、三轉完成多 5 點能力值（第 11 項）、研究檔文字更新（第 4～10、12～15 項）。第 3 項延後、第 16 項不做。

**Architecture:** 上游讀檔 `pipeline/lib/upstream.mjs` 算每個檔的 sha256 跟整份的 `contentHash`，`build.mjs` 寫進 `public/data/meta.json` 的 `dataHash`；`.github/workflows/data-refresh.yml` 改成兩邊都有雜湊時比雜湊、沒有時照舊比 `generatedAt`。資料刷新照記憶的本機做法（稀疏 clone 上游＋跑管線＋全套測試），只進 dev。能力值總點數 `src/lib/gear.ts` 的 `totalStats` 帶職業。文字改在 `data/guides/*.json`。

**Tech Stack:** Node（pipeline、node:test）、Next.js + TypeScript（vitest）、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-10-22-guides-followup-design.md`（最後兩節「使用者拍板」「實作時的調整」為準）

## Global Constraints

- 全部 user-facing 文字繁體中文、零簡體、不用 emoji；研究檔會上畫面的文字要過 `pipeline/lib/guides.mjs` 的 LINT_RULES（不准 7 位以上數字、站內用語、玩家 ID、網址；網址只放 `sources`）。
- 不編造：每句要對得上規格的出處或 `public/data/*.json`。
- 研究檔 `warrior-pirate.json`、`archer-thief.json`、`magician.json`、`quests-exp.json`、`pq.json` 是 `JSON.stringify(x, null, 2) + "\n"`，用 node 改、每個目標斷言剛好一次；`gear.json` 不是這個格式，只准字串替換、保留 CRLF。改檔腳本放 scratchpad `C:/Users/user1/AppData/Local/Temp/claude/C--Users-user1-MapleBook--claude-worktrees-exp-calculator-fixes-4a7347/772c49c9-bdfe-4e6c-b87b-1a9624d1e8ea/scratchpad/`，不進 repo。
- 分支 `feat/v1.11-data-refresh-guides`（從 origin/dev 開好了）；commit message `v1.11 (N/5): …` 開頭，結尾空一行加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`；只 commit 不 push。
- 刷新上游資料前後都要跑全套 `npm test`（10/15 上游大改版漏抽欄位曾經讓計算機算錯上正式機）；真資料測試紅了要分清楚「資料變完整（改測試期望、旁邊寫原因）」或「真的壞了（修管線）」，不准放寬斷言。
- Windows＋Git Bash；從 worktree 根目錄跑。已知偶發：`read-frame.test.ts` 150ms 計時在全套跑時偶爾紅，單跑會過。

---

### Task 1: 資料自動更新改比上游內容雜湊（第 2 項）

**Files:**
- Modify: `pipeline/lib/upstream.mjs`（`assembleUpstream`／`readUpstream`）；Test: 測 upstream 的既有測試檔（`pipeline/lib/upstream.test.mjs` 或同目錄找）
- Modify: `pipeline/build.mjs`（`meta` 加 `dataHash`）
- Modify: `.github/workflows/data-refresh.yml`（記下更新前、比對版本、開 PR 那幾步）；Test: `pipeline/lib/data-refresh-workflow.test.mjs`
- Modify: `README.md`「自動更新」那段

**Interfaces:**
- Produces: `data/raw/artale.json` 的 `metadata.contentHash`（64 位小寫 hex：上游各檔原文依 `UPSTREAM_PARTS` 順序各自 sha256，串起來再 sha256）、`metadata.parts[檔名].sha256`；`public/data/meta.json` 的 `dataHash`（同一個值；本機抽檔 `artale.local.json` 沒有就是 null）。

- [ ] **Step 1: 寫失敗的測試**：(a) 兩份只差一個字的上游檔 → `contentHash` 不同、`generatedAt` 一樣；同一份內容雜湊兩次一樣；`parts[檔].sha256` 有值。(b) workflow 測試：比對步驟讀 `meta.json` 的 `dataHash` 跟 `artale.json` 的 `contentHash`；兩邊都有就比雜湊（雜湊不同、時間一樣 → `changed=true`；雜湊一樣、時間不同 → 也算 changed 或照舊判斷，二擇一並寫清楚）；任一邊沒有就照舊比時間；雜湊用到分支名／標題前要先用 `^[0-9a-f]{64}$` 擋；所有 `${{ }}` 照檔案現有的防注入規則只經 `env` 傳。
- [ ] **Step 2: 跑測試確認失敗**：`node --test pipeline/lib/<upstream 測試檔> pipeline/lib/data-refresh-workflow.test.mjs`
- [ ] **Step 3: 實作**：`readUpstream` 讀檔時用原文算 sha256（`node:crypto`）；`assembleUpstream` 產生 `contentHash`（保持純函式好測：雜湊由呼叫端傳入或在函式內算，選一種跟現有寫法一致）。`build.mjs` 的 `meta` 加 `dataHash: artale.metadata?.contentHash ?? null`。workflow：「記下更新前的版本」多輸出 `hash`；「比對版本」多讀 `contentHash`，判斷照 Step 1，log 寫清楚是時間變還是內容變，輸出 `hash`；開 PR 那步的分支名、commit／PR 標題加雜湊前 8 碼（時間沒變、內容變了時不會跟上一次撞名）。檔頭註解跟 README「自動更新」補：上游作者手動修資料不會改 generatedAt（2026-10-16～10-21 三次都是），所以改比內容。
- [ ] **Step 4: 測試通過**＋全套 `npm test` 一次。
- [ ] **Step 5: Commit**：`v1.11 (1/5): 資料自動更新改比上游檔案內容——上游 10/16～10/21 改了三次資料卻沒改產生時間，排程一次都沒抓到`

### Task 2: 本機刷新上游資料進 dev（第 1 項）

**Files:** `public/data/*.json`、`public/data/guides/*.json`、`public/assets/**`（新增的圖）、`data/raw/artale.json`（若有進版控）、必要時測試期望

- [ ] **Step 1: 刷新前基準**：全套 `npm test` 全綠；把現在的 `public/data/skills.json`、`monsters.json`、`quests.json`、`meta.json` 複製到 scratchpad 當「刷新前」。
- [ ] **Step 2: 抓上游**：先讀 `pipeline/lib/assets.mjs` 的 `ASSET_DIRS`。`git clone --depth 1 --filter=blob:none --sparse https://github.com/morrisrrrrrrr-svg/morrisrrrrrrr-svg.github.io.git data/cache/upstream`，`git -C data/cache/upstream sparse-checkout set --no-cone '/*.js'` 加上每個 ASSET_DIRS 目錄（`'/assets/<目錄>/'`），再跑 `node pipeline/fetch-artale.mjs`。跑完看 `git status --short public/assets`：**刪除超過 20 個檔就停下來回報 BLOCKED**（記憶：稀疏 clone 少了目錄會讓 syncAssets 整批刪圖）。確認 `data/cache` 不進版控。
- [ ] **Step 3: 重建**：`node pipeline/build.mjs`、`npm run data:guides`、`npm run data:gear`、`npm run data:verify`。記下 build 印的 `[skills] 上游漏抽的欄位用前一版補：N 個`、`只照說明讀：N 個`（2.0.0 那次是 30／3）。
- [ ] **Step 4: 比對**（read-only node，結果寫進報告）：`meta.json` 的 `dataHash` 有值；新增／刪除的怪（應有變形雪吉拉，用名字找 id）、它的出怪地圖跟掉落；任務 1203（女神的痕跡）、3098 有沒有新的關卡經驗、管線有沒有抽到；技能：列出每一級 `M`、`damage`、`mad`、`mobCount`、`req` 跟刷新前不同的技能（名字、級、前→後），特別標出 2.0.0 當初靠補值的那些。
- [ ] **Step 5: 全套 `npm test`**。紅了逐項判斷：資料變完整 → 改期望並在旁邊寫原因；真的壞了 → 停下來回報 BLOCKED，不准放寬。
- [ ] **Step 6: Commit**：`v1.11 (2/5) (data): 上游 10/16～10/21 的修正補進來——技能熟練度與前置、女神組隊關卡經驗、變形雪吉拉（本機重建，先進測試機）`

### Task 3: 三轉完成多 5 點能力值（第 11 項）

**Files:** `src/lib/gear.ts`（`totalStats` 約 195 行）跟所有呼叫端、對應測試、`README.md`

- [ ] **Step 1: 寫失敗的測試**：三轉職業（例 411、231）70 等 `totalStats`＝375、80 等＝425；二轉職業（例 410）70 等仍＝370；等級低於 70 或不是三轉不變。呼叫端要帶職業的話，補一支：同一條規則，三轉 70 等的主屬性比二轉 70 等多 5。
- [ ] **Step 2: 跑測試確認失敗**
- [ ] **Step 3: 實作**：`totalStats(level, job?)`：`job` 是三轉（`src/lib/jobs.ts` 的 `jobTier(job) === 3`）且 `level >= THIRD_JOB_LEVEL` 時多 5。`grep -rn "totalStats\|statTargets\|5 \* level" src` 找出所有呼叫端，把職業帶進去（傷害計算機若自己算總點數也要一致）。註解寫出處：台服玩家 10/19、10/21 回報三轉完成多給 5 點，上游 10/21 也補計（巴哈 snA=732）。README 能力值那段補一句。
- [ ] **Step 4: 測試＋全套 `npm test`＋`npx tsc --noEmit -p tsconfig.json`**
- [ ] **Step 5: Commit**：`v1.11 (3/5): 三轉完成多 5 點能力值——能力值卡、升級路線、計算機的總點數 70 等起多 5`

### Task 4: 研究檔文字更新（第 4～10、12～15 項）

**Files:** `data/guides/magician.json`、`archer-thief.json`、`warrior-pirate.json`、`pq.json`、`quests-exp.json`、`gear.json`；Regenerate `public/data/guides/*.json`、`public/data/gear.json`

逐項（舊字先 grep 確認；差一兩個字照原文改並回報）：

- [ ] **第 4 項（祭司 231 第 3 套 `skillBuilds[2]`）**：在 `神聖祈禱→30`（steps[2]）後面插 `{ "skillId": 2311002, "skillName": "時空門", "to": 1, "note": "82 等點 1 點，幫隊友開門回亡者之林" }`；原本最後一步 `聖光→30` 的 note 從「再回頭點滿；聖龍召喚可以晚點，時空門、淨化看自己需要」改成「再回頭點滿；聖龍召喚可以晚點，淨化看自己需要」。`sources` 加 `https://forum.gamer.com.tw/C.php?bsn=85994&snA=2294`。
- [ ] **第 5 項（祭司兩套舊版的神聖祈禱）**：231 `skillBuilds[0].steps[2]` 跟 `skillBuilds[1].steps[4]`（都是神聖祈禱→30）的 note 後面接「；台服玩家 10/19 實測：三人以上組隊約 1.5 倍，兩人只剩約 1.3 倍（遊戲說明寫兩人就滿）」；兩套 `sources` 加 `https://forum.gamer.com.tw/C.php?bsn=85994&snA=2278`、`https://forum.gamer.com.tw/C.php?bsn=85994&snA=2295`。
- [ ] **第 6 項（祭司第 3 套聖光 30）**：那步 note（第 4 項改完的）後面接「；台服 103 等祭司聖光一下 3,700～5,000，殭屍 4,500 血，常常要兩下，很多人打殭屍還是用群體治癒」；`sources` 加 `https://forum.gamer.com.tw/C.php?bsn=85994&snA=2296`。
- [ ] **第 7 項（遊俠 311 第 1 套 `skillBuilds[0]`）**：`箭雨→30`（steps[3]）note 後面接「；板上說 70 等先點箭雨比較通用，專打冰雪峽谷的人先點烈火箭（雪吉拉怕火）」；`疾風步→5`（steps[4]）note 後面接「；板上說移速靠裝備跟寵物就補得到，可以晚點」；`sources` 加 `https://forum.gamer.com.tw/C.php?bsn=85994&snA=2291`。
- [ ] **第 8 項（騎士 121 `skillBuilds[0].steps[3]` 屬性攻擊）**：note 後面接「；台服玩家說寵物會自動重新附屬性，這個缺點小很多」；`sources` 加 `https://forum.gamer.com.tw/C.php?bsn=85994&snA=2195`（已有不重複）。
- [ ] **第 9 項 B（龍騎士 131）**：`notes` 第一條（點數陷阱）後面插：`{ "text": "10/19～10/20 板上：台服龍騎士多在王冠之地（企鵝王）、<紅光庭園Ⅱ 的遊戲名>（紅獨角獅）用龍咆哮清怪，常跟祭司組隊；沒人寫點法跟經驗，下面兩套是舊版排法。", "sources": ["https://forum.gamer.com.tw/C.php?bsn=85994&snA=2275", "https://forum.gamer.com.tw/C.php?bsn=85994&snA=2285", "https://forum.gamer.com.tw/C.php?bsn=85994&snA=2269"] }`。紅光庭園Ⅱ照 `public/data/maps.json` 的 `zh` 寫（藍光庭園那張遊戲寫成「藍光庭園 II」，先查）；確認王冠之地有企鵝王、那張紅光庭園有紅獨角獅。
- [ ] **第 10 項（gear.json `"jobs": [411]`「三轉：敏捷只點到拳套需求，其餘全幸」）**：`text` 後面接「台服攻略作者 10/21：現在量產最高是 70 等閃電甲，含裝備敏捷 110 就夠，別提早往 80 等的 120 點。」，`sources` 加 `https://forum.gamer.com.tw/C.php?bsn=85994&snA=2076`。先確認 `public/data/items.json` 閃電甲是 70 等拳套、敏捷需求 110。
- [ ] **第 12 項 A（殭屍）**：231 `training` 亡者之林那段 `levelTo` 85→100；why 的「打到幾等板上沒講，85 是推估。」換成「10/20 板上說全職業 60～100 等都在這，幾乎都是 3 人團，亡者之林Ⅳ最熱。」；230 亡者之林那段 why 最後接「板上幾乎都是 3 人團，亡者之林Ⅳ最熱。」；兩段 `sources` 加 `https://forum.gamer.com.tw/C.php?bsn=85994&snA=2294`。
- [ ] **第 13 項 A（獵人 310 猴子森林Ⅱ）**：`levelTo` 60→80；why 最後接「10/19 板上：雙人分上下層組隊 10 分鐘上層 6.7 萬、下層 5 萬多（等級、加成沒寫）；也有人建議獵人在這待到 80 等，70 等出去三轉完再回來。」；`sources` 加 `https://forum.gamer.com.tw/C.php?bsn=85994&snA=2279`。
- [ ] **第 14 項 A（女神組隊 7 處）**：`pq.json` goddess 的 `why` 裡「熟手一場約 22 分鐘，58 等一場大約 8～9% 經驗，比打野圖慢一點；」換成「一場固定 84,000 經驗（不含打怪，含打怪約 9～10 萬）：51 等約一級的 11%、60 等 7%、70 等只剩 4%，越早去越划算；熟手一場約 22 分鐘，比打野圖慢一點。」（標點接順）；110、120、130、410、420、230 的女神段落 why 裡「58 等一場大約 8～9% 經驗、熟手約 22 分鐘一場，比打野圖慢一點」換成「一場固定 84,000 經驗（不含打怪，含打怪約 9～10 萬），51 等約一級的 11%、60 等 7%、70 等只剩 4%，越早去越划算；熟手約 22 分鐘一場，比打野圖慢一點」；`verified` 不動。百分比用 `data/guides/quests-exp.json` `expTable.toNext` 驗算（51、60、70），對不上照算出來的寫並回報。
- [ ] **第 15 項（必解）**：3113 的 why「10/19 查還沒有台服玩家回報解過。」換成「10/21 有實況主影片標題寫 384,000 經驗＋20 名聲，難度、要幾人還沒人寫。」，`sources` 加 `https://www.youtube.com/watch?v=2alwwpQ6ACw`；3109 的「10/19 查還沒有台服玩家回報解過。」換成「10/22 查還沒有台服玩家回報解過。」。`verified` 都維持 `data`。
- [ ] **重編＋測試**：`npm run data:guides`、`npm run data:gear`、全套 `npm test`。231 延到 100、310 延到 80 若讓真資料測試的主推接縫紅燈，照規則判斷，不准放寬。
- [ ] **Commit**：`v1.11 (4/5): 10/22 攻略追蹤——女神組隊寫明一場 84,000 經驗、祭司殭屍延到 100、獵人猴森Ⅱ延到 80、祭司加時空門與祈禱兩人 1.3 倍、遊俠騎士龍騎士暗殺者補板上說法、艾利傑有影片`

### Task 5: 文件＋整體驗收

- [ ] `README.md`：玩家攻略那節補「2026-10-22 依改版後第二次查核更新（報告 `docs/superpowers/specs/2026-10-22-guides-followup-design.md`）」；確認 Task 1、3 的 README 句子在。
- [ ] 全套 `npm test`、`npm run data:verify`、`npm run build`（不行就 `npx next build --webpack`）。
- [ ] Commit：`v1.11 (5/5): README 補 10/22 查核與資料刷新`
