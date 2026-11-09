# 畫面驗收腳本（無頭 Chrome）

換頁第一格、按返回的位置、捲動、邊框顏色、卡片截圖，這些單元測試量不到，要開瀏覽器實際看。
這裡的腳本開無頭 Chrome、走 DevTools 協定，在真的畫面上逐格量、截圖存證。
各支是平行開發時不同 session 寫的，2026-10-07 從 `%TEMP%\maplebook-verify\` 收進來。

查資料四頁的正式驗收不在這裡，是 `npm run verify:db`（`scripts/verify-db.mjs`，見 repo 根目錄 README「查資料頁驗收」）。

## 怎麼跑

```bash
node scripts/verify/<腳本>.mjs <輸出資料夾> <網址> …
```

- 要 Node 22 以上（用到內建的 WebSocket）跟 Chrome。目前只在 Windows 上用過，有幾支收尾用 `taskkill`。
- 網址可以是本機 dev server（先 `npm run dev`），也可以是測試機 https://maplestory-tool-git-dev-clarkhers-projects.vercel.app 。
- 輸出資料夾給 repo 外面的路徑。不給的話自動寫到系統暫存資料夾的 `maplebook-verify-out/<腳本>-<時間>`。
  資料夾裡的 `chrome-profile/` 是無頭 Chrome 的瀏覽器資料，量完可以刪。
- 環境變數（都在 `config.mjs`）：
  - `CHROME_PATH`：Chrome（或 Edge、Chromium）在哪，預設 `C:/Program Files/Google/Chrome/Application/chrome.exe`。
  - `CHROME_PORT`：DevTools 的埠。命令列有給埠就用命令列的，都沒給就用各支的預設值。
- **埠不能撞，別的 session 正在跑的也算**：scroll-proof 是 9333，reload-open 是 9363，gear-source-shot 是 9365，build-variants-shot 是 9371，contrast-audit 是 9375，article-calc-link 是 9395，hash-back 是 9373，page-cls 是 9392，back-all 和 card-shot 都是 9347，reload-all 是 9367，damage-shot 是 9383，speed-shot 是 9391，scroll-shot 是 9302（本機 dev 用 9301），atlas-shot 是 9304（本機 dev 用 9303），pq-shot 是 9432（本機 dev 用 9431），avatar-shot 是 9382（本機 dev 用 9381），shop-shot 是 9389，fx-shot 是 9481，cf-shot 是 9493（v1.33 Cloudflare 搬家，本機 wrangler dev 用 8791），cf-segments 是 9497，article-layout 是 9499，article-page 是 9503，job-road-shot 是 9507，future-shot 是 9511，nav-fit 是 9513，guild-shot 是 9621（本機 dev 用 9620），
  border-* 和 home-first-frame 在 9400–9799 隨機挑。埠被佔走時，腳本會連進別人的 Chrome、操作別人的分頁。
  不確定就用埠參數或 `CHROME_PORT` 指定沒人用的埠（先 `netstat -ano | findstr :<埠>` 看一下有沒有人在用）。
- **在 Git Bash 裡跑**：`/plan/farm` 這種斜線開頭的參數會被自動改成 Windows 路徑。例如 back-all 的「只跑某頁」
  會一頁都對不到，`results.json` 是空的。指令前面加 `MSYS_NO_PATHCONV=1`，或改用 PowerShell。
- 大多數腳本不判 PASS／FAIL，只把逐格紀錄、截圖、`results.json` 留下來讓人看。
  check-first-frame 會判、沒過就 exit 1（GitHub Actions「測試 / 第一格」跑的就是它）。
  speed-shot、scroll-shot、avatar-shot、guild-shot 也會判、沒過 exit 1（不在 CI 裡跑，要手動）。
- 測試機實測時間（2026-10-07）：scroll-proof 45 秒、crossdoc（plain）75 秒、
  after-back 35 秒、m13-select 20 秒、navtop2 20 秒、chart 15 秒、back-all 只跑一頁 12 秒、card-shot 一個網址 5 秒、
  gear-source-shot 三個角色 13 秒。
  border-compare 全部跑約 20 分鐘。
- 不會被 `npm test` 跑到：vitest 只抓 `src/**/*.test.ts`，`node --test` 只抓 `pipeline/**/*.test.mjs`。
- `.gitignore` 擋掉這個資料夾裡除了 `.mjs` 跟本檔以外的東西，也擋掉任何 `chrome-profile*/`。
- 新寫的驗收腳本直接放這裡，別只放 `%TEMP%`。寫法：`import { CHROME, chromePort, outDir } from "./config.mjs"`，
  再到本檔補一段。

## 每支在做什麼

### 換頁第一格

#### `check-first-frame.mjs`：自動檢查換頁第一格，沒過 exit 1（v0.68，GitHub Actions「測試 / 第一格」）

```bash
node scripts/verify/check-first-frame.mjs [輸出] [網址，預設 http://localhost:3000]
```

- 十項，只看結構、不看時間（GitHub 的機器快慢不穩，時間門檻會偶發紅燈）：
  1 首頁 → 查資料 → 我的路線，DOM 只有一個狀態、就是完整路線；2 硬重新整理、存過角色，不出現「你現在幾等、什麼職業？」；
  3 硬重新整理、沒存過角色，第一格就看得到那句問題跟選職業的表單、沒有讀取中（v1.56）；4 首頁「帶我去」→ /go 第一格就是路線；5 查資料 → 練功地圖排行第一格就是結果；
  7 刺客 35 選了全幸（`ms-build` `{"400":"全幸"}`）：硬重新整理、站內換頁（查資料 → 我的路線）進首頁，「能力值與裝備」卡
  第一次畫出來就是全幸——逐格紀錄裡卡片在的每一格（rAF 跟 DOM 變動都看）選中的都是「全幸」、都有「要湊的敏捷裝備」，
  不會先畫一般點法再跳過去（v0.76）；跑完把角色還原成狂戰士 45、拿掉 `ms-build`；
  8 硬重新整理首頁不跳：存過角色、第一次來 × 1280、375（手機模式），CPU 慢 4 倍＋慢 4G＋不用快取，位移加總都 < 0.1（v1.56）；
  9 第一次來、不等載入完就打等級 35、按劍士（慢 4G＋CPU 慢 4 倍），接手後角色要是劍士 35（v1.57）；
  10 硬重新整理其他頁不跳：手機的傷害計算機（存過角色）、組隊指揮（第一次來）位移都 < 0.1（v1.63）；
  6 沒有 hydration 警告、沒接住的錯誤（排在最後跑，涵蓋 1～5、7～10）。
- 逐格紀錄最少記固定的時間（換頁 4 秒、硬重新整理 3～5 秒），畫面還沒出來就一路記到出來後 1.5 秒、最多 60 秒（v0.76）：
  GitHub 上（`next start`）跟以前一樣，本機 `next dev` 第一次編譯、別的 session 正在改檔重編、CPU 被吃滿時，不會畫面還沒換過去就停、誤報紅。
- 本機跑：先 `next build` 再 `next start`（或直接給測試機網址），約 25 秒。`CI` 環境變數有設時 Chrome 會加 `--no-sandbox`。
  對 `next dev` 也跑得過，但慢很多（2026-10-08 CPU 被別的程式吃滿時實測約 4 分鐘，硬重新整理後卡片 15～23 秒才出來）。
  Windows 上收尾改用 `taskkill` 關 Chrome（v0.76 之前用 `chrome.kill()`，Chrome 常還活著佔著埠，下一次同一個埠會連進舊的那支）。
- 驗過抓得到：故意把首頁、/go、練功排行改回「先畫載入中」、大標改成都看不見，1／3／4／5 紅；對還沒有 v0.54 的正式機跑，2 紅；
  第 7 項把期待的標籤改成「一般點法」，硬重新整理、站內換頁兩段都紅（2026-10-08）；
  對 v1.56 之前的版本跑，3、8 紅，8 量到 0.1165、0.069、0.1638、0.1465（2026-11-05）；
  對 v1.63 之前的版本跑，10 紅，傷害計算機 0.332、組隊指揮 0.2656（2026-11-05）。
- 輸出：`results.json`（每項的細節、console；第 7 項的 `reload` 有卡片畫出來幾格、第一格長怎樣、不對的格）、`1-home.png`、
  `7-home-luck.png`（第 7 項跑完捲到卡片）；CI 沒過時整個資料夾上傳成 artifact「first-frame」。

#### `page-cls.mjs`：硬重新整理的跳動（CLS）、誰動了、第一格長怎樣（v1.56 量首頁，v1.63 起任何一頁）

```bash
node scripts/verify/page-cls.mjs [輸出] [網址，預設 http://localhost:3000] [每種幾次，預設 5] [DevTools 埠，預設 9392] [--page=/plan/damage] [--all] [--css=...] [--cold] [--mobile] [--slow]
```

- 量存過角色、第一次來 × 1280、375，CPU 慢 4 倍，印每種的中位數、範圍、Google 實際採用的「最大一段」跟每次位移的來源（來源的 y 變 0、高度 0 ＝ 被推出畫面）。
  任一種中位數 >= 0.1 就 exit 1。
- `--page=` 指定哪一頁，可以給很多個；不給就是首頁。`--all` 全站每種頁面各量一頁，新頁要加進檔案開頭的清單（`--slow` 每次至少 10 秒，35 頁 × 4 種約 35 分鐘）。
- `--css=` 先塞一段 CSS 再量，不用 build 就能試修法有沒有用（例：`"--css=main{min-height:100dvh}"`）。
- 用 Git Bash 給 `--page=/...` 要加 `MSYS_NO_PATHCONV=1`，不然路徑會被轉成 Windows 路徑。
- **一定要量正式 build**（`next build` + `next start`，或測試機）。
- **`--mobile` 要跟 `--slow --cold` 一起用**：本機程式到得太快，手機模式第一格還沒畫就接手了，壞掉的版本也量到 0（2026-11-05 踩到）。
  `--slow`＝慢 4G，`--cold`＝不用快取。第一次來的真手機就是 `--mobile --slow --cold`。
- 輸出：`results.json`（每次的位移、逐格狀態）、`server-<頁>-<寬>-<saved|first>.png`（擋掉程式後截的，就是伺服器畫的第一格）、`final-*.png`（畫好之後）。
- 一次約 1～2 分鐘（5 次）；`--slow --cold` 要 4～6 分鐘（3 次）。

#### `home-first-frame.mjs`：站內換頁進首頁的第一個畫面（v0.34）

```bash
node scripts/verify/home-first-frame.mjs <輸出> <網址>
```

- 情境：A 首頁 → 查資料 → 我的路線（A4／A6 是 CPU 慢 4／6 倍）、B 從查資料進站、C 等級加一、D 硬重新整理、
  D2 沒存過角色的人硬重新整理、E 沒選職業、F 不可能的組合（狂戰士 25 等）、G 道具頁的「狂戰士能用」標籤、H 首頁換職業。
- D 的 `questionFrames`／`domQuestion`：存過角色的人硬重新整理時，畫出來的格數／DOM 裡出現「你現在幾等、什麼職業？」
  的次數，v0.54 起都要是 0（大標看不見，位置照留）。D2 是沒存過角色的人，第一格就要看到那句問題跟選職業（v1.56 起不先放讀取中）。
- G 找 `main button[aria-pressed]` 裡文字以「能用」結尾的那顆（v0.55 起道具頁的「誰能用」下拉換成標籤按鈕，之前找 `select[aria-label="誰能用"]`），
  印出它的文字（`text`，預期「狂戰士能用」）跟 `aria-pressed`（`pressed`，一打開預期 `"false"`）；`textOk`、`pressedOk` 是跟預期值比的結果。
- `ONLY=A6,H` 只跑名稱開頭符合的情境。
- 每一格（rAF，畫出來之前）記高度跟有哪些區塊，另外用 screencast 存真的畫出來的畫面。
- 輸出：`<情境>-cast-<序號>-<毫秒>ms.jpg`（換頁後每一張 screencast）、`<情境>-settled-*.png`、`results.json`
  （含 console 跟 hydration 警告）。console 印整份 JSON，自己判讀。

#### `pages-first-frame.mjs`：站內換頁進 /go、/plan 四頁的第一個畫面，打開「換其他職業」先載攻略（v0.45）

```bash
node scripts/verify/pages-first-frame.mjs <輸出> <網址>
```

- 情境：P1 首頁「帶我去」→ /go、P2 查資料 → 練功地圖排行、P3 查資料 → 現在能接的任務、P4 任務打包（第二次進）、
  P5 道具頁「這個去哪打」→ 打寶、P6 /go 城鎮目的地＋上次自己選的起點、P7 打開「換其他職業」→ 點法師
  （記打開後在背景載了哪些攻略、主推卡有沒有出骨架）、P8／PQ4／PQ6／PF6 CPU 慢 4／6 倍、P9 從捲到底的長頁換頁要回到頂端。
- `ONLY=P7,PQ6` 只跑名稱開頭符合的情境。站內換頁用頁面裡的 `window.next.router.push`（跟點連結一樣不整頁重載）。
- 每一格記兩份：rAF（畫出來之前）跟 MutationObserver（DOM 每次變動）。`painted`／`dom` 只留跟上一格不一樣的狀態，
  只有一個狀態＝第一格就是結果。
- 輸出：`P*-*.png` 截圖、`results.json`（含 console 跟 hydration 警告）。console 印整份 JSON，自己判讀。

#### `cf-segments.mjs`：靜態輸出的預先載入檔有沒有壞、換頁有沒有整頁重載（v1.47）

```bash
node scripts/verify/cf-segments.mjs <輸出> <網址> [埠]
```

- 每頁整頁打開、捲到底觸發預先載入，記所有 `.txt` 請求的狀態碼；再站內換到下一頁（有連結就點，沒有就 `router.push`），留記號判斷有沒有整頁重載。
- `REPEAT=3` 每組量幾次、`CPU=4` CPU 慢 4 倍、`PAGES=/a,/b` 換頁順序（Git Bash 要加 `MSYS_NO_PATHCONV=1`）。
- 有 `.txt` 回 4xx／5xx 或整頁重載就 exit 1。Vercel 不走 `.txt`，請求數是 0，只比換頁時間。輸出 `results.json`。

### 捲動、按返回、重新整理

#### `scroll-proof.mjs`：換頁捲回頂端、頁內平滑捲動（v0.29）

```bash
node scripts/verify/scroll-proof.mjs <輸出> [網址]
```

- 道具清單捲到底點頁首、道具清單點一筆、首頁「看打法」跳懶人包錨點，手機跟桌機各跑。
- 每個情境跑兩次：現況，跟執行中拿掉 `<html data-scroll-behavior>`（等於修正前）。
- 輸出：`<mobile|desktop>-<after|before>-*.png`（after＝現況、before＝拿掉屬性）、`results.json`（逐格 scrollY、Next 呼叫了哪些捲動）。

#### `back-all.mjs`：全站按返回的位置（v0.40）

```bash
node scripts/verify/back-all.mjs <輸出> <網址> [埠=9347] [只跑某頁，例如 /plan/farm]
```

- 11 種頁面各自捲到底 → 點頁首換頁 → 按返回 → 再按下一頁，逐格記 scrollY。全部跑時最後加一段跨文件返回
  （懶人包 → 別的網址 → 返回）。
- 網址是 localhost 時，會先把每頁整頁開一次等 dev server 編譯。
- 輸出：`<序號>-back-mid.png`（按返回後 0.12 秒）、`<序號>-back-end.png`、`results.json`。
  console 每頁一行：離開的位置、還原前 → 停在哪（位置對不對）、中間滑了幾格。

#### `crossdoc.mjs`：離站再返回、重新整理（v0.40）

```bash
node scripts/verify/crossdoc.mjs <輸出> <網址> [埠=9348] [plain|early] [nobf]
```

- 懶人包、關於、首頁、任務四頁，各量「離站再返回」跟「重新整理」：位置有沒有還原、是不是一路滑過去。
- 第 5 個參數：`plain` 只跑現況，`early` 只跑「一開頭先關平滑」的實驗，不給就兩種都跑。
- 第 6 個參數 `nobf`：關掉返回快取（`--disable-features=BackForwardCache`），離站返回一定整頁重載。
- 輸出：`results.json`，console 每個情境一行。

#### `reload-open.mjs`：展開過的卡片，重新整理、返回之後還在不在、停在不在同一段（v0.59）

```bash
node scripts/verify/reload-open.mjs <輸出> <網址> [埠=9363] [情境，逗號分隔：home,quest,train,bundle,go,guide,guide-pq]
```

- 每個情境跑四種：
  - 重新整理。
  - 離站再返回：關返回快取，一定整頁重載。
  - 站內按返回：點頁尾「資料從哪來」再按返回。
  - 站內重新點進來：點頁首「查資料」，再從查資料頁點回這一頁；這是新的一筆紀錄。帶我去、懶人包 #pq-moon 查資料頁沒有連結，不跑這種。
- 每一種都先從別頁點進來（新的一筆瀏覽紀錄），先記「剛進來時開著幾個」，要等於預設：首頁 1（你在的那段）、懶人包 1（第一步）、
  懶人包 #pq-moon 2（第一步＋月妙自動展開），其他 0。不等於預設就算沒過。
- 再像使用者一樣點開幾張卡：
  - 首頁：還有 N 個任務；長任務線看細節、還有 N 段、第 3 段；為什麼要解；第二列看細節；技能條；裝備看全部；主推理由展開；你在那段的「為什麼」；升級路線第一段。
  - 解任務：連卡住的一起看、三張看細節。
  - 懶人包：收起第一步、點開第二三步。
  - 懶人包 #pq-moon：收起自動展開的月妙（重新整理後網址的 # 還在，要保持收起）。
- 捲到可捲高度 70% 的地方，記下畫面兩個固定點是哪一塊：頁首下方 y=90、畫面中間 y=420。
  回來後同一塊、差 2px 內、開著的數量一樣，才印「同一段」。站內重新點進來要回到預設，才印「照預設」。
- 手機 375×812，角色 Lv.45（job 110）。環境變數 `WAIT`：回來後等幾毫秒再量，預設 5000。
- 輸出：`<情境>-<種類>-1-before.png`／`-2-after.png`、`results.json`。console 每種一行：離開／停的位置、頁高、開著幾個、兩個點對不對得上。
  對不上時多印兩行，是兩邊各看到哪一塊。最後一行印總共幾種、通過幾種。一律 exit 0。
- 懶人包 #pq-moon 的站內按返回：v0.77 以前會停在月妙那步的錨點（離開 1425 → 停 1281），v0.77 修好。詳細量法見下面的 `hash-back.mjs`。
- 測試機實測時間（2026-10-07）：全跑約 9 分鐘。

#### `hash-back.mjs`：帶 # 的網址按返回，回到離開時的位置、不在錨點停一格（v0.77）

```bash
node scripts/verify/hash-back.mjs <輸出> <網址> [埠=9373]
```

- 為什麼要量：Chrome 站內按返回回到網址帶 # 的那一筆（懶人包 `/guide#pq-moon`）時，不還原位置，改捲到錨點。
  不帶 # 的就正常。純 HTML 頁也一樣，不是 Next 捲的。v0.77 起由 `src/lib/reload-scroll.ts` 在畫面出來前跳回記下的位置。
- 角色 15 等劍士，從首頁「看打法」點進來（站內連結），量停的位置要等於錨點（元素頂端扣掉 scroll-margin-top）：第一次點進來照舊捲到錨點。
- 再捲到 70%、點頁尾「關於」、按返回；接著按下一頁到關於、再按返回；再返回首頁、按下一頁回來（用下一頁進到帶 # 的那一筆）。
  回到懶人包的那一下用 screencast 收真的畫出來的每一格（`metadata.scrollOffsetY`），要停在離開時的位置，而且沒有任何一格畫在錨點上。
  對照組：不帶 # 的 `/guide` 按返回、下一頁再返回（它前一筆是 about:blank，換文件，不跑返回首頁）。
- 手機 375×812、關返回快取。輸出：每一步的畫面（`<情境>-<步驟>/<第幾格>-y<位置>.jpg`，只存位置有變的那幾格）、`results.json`。
  console 每項一行，最後一行印總共幾項、對幾項。一律 exit 0。
- 實測（2026-10-08，手機 375）：改前 6 項對 3（#pq-moon 三種回來的方式都是 2029 → 1281，畫出 1 格在錨點）；
  改後 6 項全對（2029 → 2029，錨點 0 格）。分支預覽跑一次約 45 秒。

#### `reload-all.mjs`：全站重新整理、離站再返回回不回得到原位（v0.44；v0.62 收進來）

```bash
node scripts/verify/reload-all.mjs <輸出> <網址> [埠=9367] [頁面,頁面…]
```

- 預設 10 頁：懶人包、關於、首頁、規劃四頁、怪物清單、道具清單、開著卡片的 `/db/monsters?id=100100`。
  每頁捲到 60% 高度，各量「重新整理」跟「離站再返回」（一律關返回快取，返回一定整頁重載）。
- v0.62 起開著卡片的網址也要回到離開時的位置（之前會跳回卡片頂端：離開 4001 → 停 357）。
- 手機 375 寬。重新整理、返回後等 4 秒再看（環境變數 `WAIT` 改毫秒數）。
- 輸出：每格一張截圖、`results.json`；console 每格一行（離開 → 停在哪、對不對、一載入的逐格位置），最後一行是幾格對。
- 幾支 Chrome 同時跑會互相拖慢，資料還沒到就量，數字會歪：最後一輪一支一支跑。

#### `after-back.mjs`：按完返回後，頁內平滑捲動還在不在（v0.40）

```bash
node scripts/verify/after-back.mjs <輸出> <網址> [埠=9354]
```

- 道具清單按完返回，再用滑鼠點一筆，捲到細節要是平滑的。任務頁按完返回，再用鍵盤 Tab 到「跳到主要內容」按 Enter。
- 兩個都跟「沒按返回」對照。
- 輸出：`item-tap-*.png`、`results.json`。

#### `m13-select.mjs`：道具清單「誰能用」篩選＋按返回（只適用 v0.35～v0.54）

```bash
node scripts/verify/m13-select.mjs <輸出> <網址> [埠=9361]
```

- **v0.55 起不能用**：「誰能用」下拉換成「〇〇能用」「現在就能穿」標籤按鈕，這支找不到下拉選單、會卡在等選項再出錯。
  同一件事（按「〇〇能用」標籤 → 離開再返回 → 篩選還在、清單一樣、捲回原位）改跑 `npm run verify:db` 的 M13（`VERIFY_ONLY=M13`）。
- 選「狂戰士能用的」→ 捲到中間 → 頁首「查資料」→ 返回：篩選還在、清單一樣、捲回原位、直接跳。
- 這是舊查資料頁驗收的 M13 改成下拉選單的版本。
- 輸出：`m13-after-back.png`、`results.json`。
- v0.39 加了捲到底自動載入以後，捲到中間就會多載，`sameList` 會是 false（返回後 180 筆、選完時 60 筆）。
  看 `filterKept`、`positionOk`、`distinctOnItems` 就好。

#### `navtop2.mjs`：從長頁點「我的路線」，首頁有沒有回到頂端（v0.34，PR #45）

```bash
node scripts/verify/navtop2.mjs <輸出> <埠> <網址>
```

- 三個參數都要給，埠在網址前面。
- 任務頁捲到底 → 頁首「我的路線」。A 照常、B 關掉捲動錨定（`overflow-anchor: none`）、C 首頁資料先載過。
- 輸出：`results.json`，console 每個情境一行。

#### `chart.mjs`：按返回的改前／改後對照圖（v0.40）

```bash
node scripts/verify/chart.mjs <輸出> <改前網址> <改後網址> [埠=9370]
```

- 任務頁捲到底 → 頁首「我的路線」→ 按返回，逐格記 scrollY 加上按下去 0.12 秒的截圖，畫成一張圖。
- 輸出：`compare.png`、`compare.html`、`series.json`、`before-0.12s.png`、`after-0.12s.png`。
- 圖的標題跟圖例寫死 v0.40 那次（「改前（v0.42）」「改後（v0.40）」），拿來比別的要先改字。

#### `harness.mjs`：上面幾支共用的無頭 Chrome 工具

crossdoc、after-back、chart、m13-select、navtop2 用它：開 Chrome、`navigate`、`traverse(-1)`（等於按瀏覽器的返回）、
`loadOnce`（返回快取還原的頁面沒有 load 事件，最多等 8 秒）、`shot`、頁面裡的 `__waitFor`／`__settle`／`__sampleFrames`。

### 邊框顏色（v0.41）

#### `border-probe.mjs`：改之前先模擬

```bash
node scripts/verify/border-probe.mjs <輸出> [網址] [--only=狀態,…] [--variants=m-light,d-dark] [--nocrop]
```

- 同一次載入裡用 CSSOM 模擬「`*` 的 border-color 移進 `@layer base`」，跟現況逐元素比對邊框、外框、圓角。
- 34 種頁面狀態 × `m-light`／`m-dark`／`d-light`／`d-dark`（手機／桌機 × 白天／夜晚）。
- 模式 `B` 只改邊框，`BF` 連 `:focus-visible` 一起改。
- 輸出：`report.json`、`crops/<狀態>__<變體>__<模式>__<編號>__before|after.png`。

#### `border-gallery.mjs`：對照頁的截圖（模擬）

```bash
node scripts/verify/border-gallery.mjs <輸出> [網址] [--only=項目,…] [--variants=…]
```

- 每個項目截「現在」「只改邊框」「改後」三張。
- 輸出：`img/<項目>__<變體>__<before|B|BF>.webp`、`manifest.json`。用 `--only` 重截時會保留其他項。

#### `border-compare.mjs`：兩個真站逐元素比對（驗收用）

```bash
node scripts/verify/border-compare.mjs <輸出> <改前網址> <改後網址> [--only=狀態,…] [--variants=…]
```

- 不靠模擬，改前站、改後站各載一次，逐元素比對。
- 全部跑約 20 分鐘，可以用 `--only` 拆三支平行跑（輸出資料夾要分開）。
- 輸出：`report.json`，接著用 `analyze.mjs` 分類。

#### `border-gallery-real.mjs`：兩個真站同一塊各截一張（驗收用）

```bash
node scripts/verify/border-gallery-real.mjs <輸出> <改前網址> <改後網址> [--only=項目,…] [--variants=…]
```

- 輸出：`img/<項目>__<變體>__before|after.webp`、`manifest.json`。

#### `analyze.mjs`：把 report.json 分類

```bash
node scripts/verify/analyze.mjs <report.json> [模式，預設 B]
```

- 吃 border-probe 或 border-compare 的 `report.json`，列出每一類變了幾個元素、出現在哪些頁、改前改後的顏色。
  分不進去的列成「其他」。結果只印在 console。

### 查資料頁卡片

#### `card-shot.mjs`：截怪物卡的屬性抗性（v0.43）

```bash
node scripts/verify/card-shot.mjs <輸出> <檔名前綴> <網址> [<網址> …]
```

- 網址要帶 `?id=`，例如 `/db/monsters?id=130100`。手機 390 寬、桌機 1280 寬各開一次。
- 等「屬性抗性」區塊出現，抓 chip 的文字跟顏色，把卡片捲到固定頁首下面再截。
- 輸出：`<前綴>-<id>-mobile.png`、`<前綴>-<id>-desktop.png`，console 印 JSON。
- v0.39 起長卡片頂端有一條黏著的「收起」列，截圖頂端的怪名會被它蓋住一點。chip 的文字跟顏色不受影響。

#### `shop-shot.mjs`：截道具卡的「哪裡買得到」，可以把瀏覽器時間調到活動結束後（v1.15）

```bash
node scripts/verify/shop-shot.mjs <輸出> <檔名前綴> <網址> [<網址> …]
AT=2026-11-12T00:00:00+08:00 node scripts/verify/shop-shot.mjs <輸出> <檔名前綴> <網址> …
```

- 網址要帶 `?id=`，例如 `/db/items?id=2022000`（礦泉水：常駐店＋萬聖節行商人）。手機 390／桌機 1280 × 白天／夜晚各一張。
- 等道具名出來再找「哪裡買得到」，先捲過去讓頁首、黏著的「收起」列黏上，量完往回捲到它們下面再截（標題不會被蓋住）。
- `AT` 調瀏覽器時鐘（跟 gear-source-shot 同一套）：活動店過了結束時間要自己不列；只有活動店的道具（超級藥水）整塊不見，JSON 的 `found` 是 `false`。
- 輸出：`<前綴>-<id>-<mobile|desktop>-<light|dark>.png`，console 印 JSON（每格那一塊的文字）。實測三個網址 × 4 格約 40 秒。
- 連續跑兩次同一個埠，前一支 Chrome 有時還沒關乾淨，會報「DevTools 沒起來」→ 換 `CHROME_PORT` 重跑。

### 首頁裝備卡

#### `future-shot.mjs`：未來視手機、電腦截圖，職業帶入、切職業、過期提示（v1.68）

```bash
node scripts/verify/future-shot.mjs <輸出資料夾> <網址>
```

時間用蓋掉 `Date.now` 假裝到 2027/2/15，那段伺服器跟瀏覽器的字本來就不同，hydration 警告不算錯。上一次跑完 Chrome 沒收乾淨，就換輸出資料夾跟 `CHROME_PORT`。

#### `job-road-shot.mjs`：初心者選職業，首頁先解的「有關轉職的指導」跟「5 選 1」（v1.65）

```bash
node scripts/verify/job-road-shot.mjs <輸出資料夾> <網址> 8,9,10,12
```

- 每個等級存 `Lv<等級>.png`（先解整塊）、`Lv<等級>-detail.png`（展開 5 選 1），手機 375 寬。console 跟 `results.json` 印每一行的字、細節列出的選項、有沒有橫向捲動。
- 量 360、375、390、430 寬時 5 選 1 的路名有沒有被拆成兩行（`broken`，v1.66），有就結束碼 1。
- 新環境驗不到「來過的人」，改資料要另外用留著舊快取的瀏覽器看（這輪只改程式）。

#### `gear-source-shot.mjs`：武器、卷軸「去哪拿」截圖，可以把瀏覽器時間調到 10/15 之後（v0.66）

```bash
AT=2026-10-16T10:00:00+08:00 node scripts/verify/gear-source-shot.mjs <輸出> <網址> 400:25,100:35,210:45
```

- 第三個參數是要看的角色，`職業代碼:等級`，逗號分隔（400 一轉盜賊、100 劍士、210 火毒巫師）。
  手機 390 寬，每個角色另外開一次首頁（先清 localStorage、sessionStorage，再放 `ms-profile`）。
- `AT`：瀏覽器時鐘調到這個時間（ISO）；不給就用真的時間。調到 10/15 開機之後，看的就是開放後的推薦。
  v0.61 起開放後也先推舊地區的來源：一轉盜賊 25 等狼牙「墮落城市的後街吉姆合成」、劍士 35 等綠蛇刀「小幽靈會掉」、
  火毒巫師 45 等黃色雨傘「青螃蟹會掉」（v0.61 以前，開放後會變成冰原雪域斯考特的店、雲彩公園的月光精靈）。
- 輸出：`<職業>-<等級>.png`（裝備卡從頂端截到武器那塊）、`<職業>-<等級>-route.png`（升級路線「你在這」那一段的「裝備」，
  沒展開會自己點開）、`results.json`；console 印主推武器、去哪拿、路線每一列的字。
- 改前／改後：同一個 `AT` 各跑一次改前、改後的網址（例如正式機 vs 測試機），兩邊的字直接比。

#### `build-variants-shot.mjs`：第二套點法（全幸、裝備法）各角色截圖＋實際點切換、鍵盤、對比（v0.75，v0.76 擴充）

```bash
node scripts/verify/build-variants-shot.mjs <輸出> <網址> [職業:等級:點法,…]
```

- 第三個參數不給就跑預設 11 個：
  `410:35:,410:35:全幸,410:25:全幸,411:80:全幸,420:35:全幸,421:80:全幸,210:50:,210:50:全智+,210:50:裝備法+,200:10:裝備法,110:35:`
  （刺客 35 一般／全幸、刺客 25 全幸、暗殺者 80 全幸、俠盜 35 全幸、神偷 80 全幸、火毒 50 沒選／全智／裝備法、法師 10 裝備法、狂戰士 35）。
  `點法` 空白＝沒選（主推）；後面加 `+`（例：`210:50:裝備法+`）會先點「看全部」再截，看得到點法說明跟玩家提醒。
  每個角色先開同網域的 `/brand-emblem.png` 清 localStorage，再放 `ms-profile` 跟 `ms-build`（`{"400":"全幸"}`，鍵是一轉職業代碼；
  寫主推的名字＝跟沒選一樣），然後開首頁（v0.76 以前先開整頁 `/about`，本機 dev 在 CPU 吃滿時會拖到載入逾時）。
- 點法按鈕 v0.76 起是 `[role="radiogroup"][aria-label="點法"]` 裡的 `[role="radio"]`，選中看 `aria-checked`（之前是 `aria-pressed`）。
  每張卡記 `tabs`（文字、`checked`、`tabIndex`）、`tabText`（按鈕下那行「全幸：…」）、四格、每一區的字。
  展開的法師卡會比 2400 高：暫時把視窗拉到放得下再截（`grown` 記拉到多高，console 會講）。
  截圖前先等卡片、路線那塊裡的圖載完（next/image 預設 lazy，CPU 吃滿時會截到空格），15 秒還沒出來的張數記在 `missingImages`。
- 有點法標籤的角色另外截升級路線「你在這」那一段的「裝備」（沒展開會自己點開），字記在 `route`（段落、每一列）：
  要跟著選的點法換，例如刺客 35 那段（Lv.30–40）全幸是青銅指虎、多一列套服敏捷卷軸，一般點法是鋰礦鬥拳、35 等換銀守護拳套。
- 「click」：刺客 35 沒選 → 點「全幸」→ 重新整理 → 點回「一般點法」，印每一步的標籤、四格、`ms-build`。
  對的結果：全幸亮、`{"400":"全幸"}` → 重新整理還是全幸 → `{}`。
- 「keyboard」：刺客 35 沒選，焦點放在選中那顆，用 DevTools `Input.dispatchKeyEvent` 送右方向鍵兩次。
  對的結果：第一次選中「全幸」、焦點跟過去、Tab 只停「全幸」、`ms-build` 的 400 是全幸；第二次繞回「一般點法」、400 拿掉。console 印 OK／不對。
- 「contrast」：刺客 25 全幸「要湊的敏捷裝備」那一塊，每個有直接文字的元素算字色跟實際背景的對比（WCAG 相對亮度）。
  背景從 `<html>` 一路往下疊（不透明的蓋掉、半透明的跟下層混、`opacity` 照群組合成算），顏色畫在 canvas 上讀回來，oklch 也認得；
  沒算背景圖跟 backdrop-filter。記最低 5 個（字、字色、背景、比值、字級），最低值低於 4.5 印 WARN。只量白天主題。
  2026-10-08 實測 WARN：出處標籤「玩家攻略・台服實測」2.31、小標「要湊的敏捷裝備」2.68、橘色「敏捷 +5」「敏捷 +3」3.33；
  「Lv.30 起」那幾列（深咖啡色）5.34 以上。前兩個是各卡共用的樣式，橘色粗體跟衝卷的「100%」同一個色。
- 輸出：`<職業>-<等級>-<點法>.png`（整張卡，視窗開 2400 高、截圖不含固定頁首）、`route-<職業>-<等級>-<點法>.png`、
  `click-after-reload.png`、`results.json`（上面這些，加 `keyboard`、`contrast`、console 錯誤／警告）。`WIDTH=360` 看安卓換行；`AT` 同 gear-source-shot。
- 預設埠 9371。本機 dev server（已編譯過）跑 11 個角色＋三段實測 2026-10-08 約 5 分鐘（284 秒，那時 CPU 被別的程式吃滿；
  兩個角色加三段約 2 分鐘）。測試機還沒量（v0.75 那版 8 個角色約 40 秒）。

### 文字對比

#### `contrast-audit.mjs`：全站小字對比（WCAG AA），沒過 exit 1（v0.81）

```bash
MSYS_NO_PATHCONV=1 node scripts/verify/contrast-audit.mjs <輸出> <網址> [頁面,頁面…]
```

- 每一頁、白天跟夜晚各載一次，畫面上每個有直接文字的元素都算字色跟實際背景的對比。
  算法跟 build-variants-shot 的 contrast 一樣（顏色畫在 canvas 讀回來、背景一路往下疊、opacity 照群組合成），那支只量一塊，這支量整頁。
- 門檻：一般字 4.5；大字（24px 以上，或 18.66px 以上且粗體）3。停用的按鈕不算。有任何一段沒過就 exit 1。
- 頁面不給就跑 13 頁：首頁、`/db/items?id=1472004`（青銅指虎）、查資料怪物／任務／技能、`/plan` 五頁（`/plan/farm`、`/plan/quest`、`/plan/train`、`/plan/bundle`、`/plan/damage`）、`/go`、`/guide`、`/about`。
  首頁先存刺客 35 全幸（`ms-profile`、`ms-build`），卡片才畫得出來。只看預設展開的樣子，收起來的卡片裡面量不到；
  傷害計算機（`/plan/damage`）例外：量之前會把頁面上所有 `<details>`（看細節、技能等級、怎麼算的）全部展開。
- **在 Git Bash 裡一定要加 `MSYS_NO_PATHCONV=1`**，不然首頁的 `/` 會被換成 `C:/Program Files/Git/`，那一頁只量到錯誤頁的 7 段字。
- 沒算 body 的暈光、圖片背景、backdrop-filter（毛玻璃當成疊在下層的半透明色）；字壓在圖上的地方要自己看。
- 環境變數：`THEMES=light` 只跑白天；`WIDTH` 視窗寬（預設 390）。預設埠 9375。
- 2026-10-08 量改前的測試機（v0.76）：白天 12 頁 5,317 段字有 2,777 段沒過（灰字 2.7、金 2.3、楓葉橘 3.3、天藍 3.8、綠 3.6），
  夜晚 837 段（亮橘按鈕上的白字 2.47、灰字在毛玻璃上 3.9）。改法跟數字見 `src/app/globals.css` 的註解、`global-css.test.ts`。
- 輸出：`results.json`（每頁每個主題：段數、沒過的字、字色、背景、比值、字級、class）。測試機兩個主題 12 頁約 3 分鐘。

### 傷害計算機

#### `damage-shot.mjs`（傷害計算機，v0.79）

`node scripts/verify/damage-shot.mjs <輸出> <網址> [職業:等級,…]`（預設刺客 50、火毒巫師 40、狂戰士 50、槍手 60；埠 9383）。
每個角色存整頁、看細節展開、點「一下打死」第一隻的底部小卡，另外刺客 50 存夜晚與 360 寬；`results.json` 有結果卡、名單數（一下、兩下、差一點的一下／兩下，v0.82 起標題是 h2／h3）、細節表的字，`overflow360` 是 360 寬有沒有橫向捲動。
角色用 localStorage `ms-profile` 帶入，sessionStorage 每次清掉（計算機的設定記在瀏覽紀錄，不清會沿用上一個角色的）。
「看細節」是受控的 `<details>`（展開狀態記在瀏覽紀錄），所以腳本用點 `<summary>` 的方式展開（直接改 `open` 屬性 React 不一定認），`detailsOpen` 記有沒有真的展開；
`consoleProblems` 是整趟 console 的錯誤、警告（hydration 警告、沒接住的例外）。

### 衝卷模擬

#### `scroll-shot.mjs`：跑一次衝卷模擬頁（v1.23，埠 9302）

```bash
node scripts/verify/scroll-shot.mjs [網址，預設 http://localhost:9301] [輸出] [DevTools 埠，預設 9302]
```

- 網址用 `localhost`，不要用 `127.0.0.1`。本機 dev 第一次開頁要編譯，最多等 1 分鐘。測的是工地手套（1082002，可衝 5 次）＋手套攻擊卷軸 60%（2040804）。
- 檢查（22 項，任何一項沒過 exit 1）：表格 5 行、第 5 行 7.8%、64 張・29 件；第一欄主行只寫張數、數值在第二行；沒填單價沒有「平均花費」欄；
  **只填卷軸單價也沒有**（卷軸＋裝備都填才有，開白衣要連白衣單價一起）；開白衣第 5 行一件衝成 100%；390 寬不橫向捲動、第一欄不超過 3 行高；
  帽子挑得到卷；裝備清單的部位小按鈕點了只剩那個部位；查資料卷軸卡／裝備卡的連結；壞網址不壞頁（寫明「這件裝備／這張卷軸還算不了」）、眼飾不收、查資料不收的卷軸沒有連結；console 沒有錯誤。
- 輸出：`scroll-1280-light／dark.png`、`scroll-390-light／dark.png`（390 寬是開白衣、三個單價都填的樣子）、`scroll-picker.png`、`results.json`。
- 單價欄要走真的輸入（`Input.insertText`），直接改 `value` React 收不到。

### 地圖＋NPC 圖鑑

#### `atlas-shot.mjs`：跑一次地圖頁、NPC 頁（v1.24，埠 9304）

```bash
node scripts/verify/atlas-shot.mjs [網址，預設 http://localhost:9303] [輸出] [DevTools 埠，預設 9304]
```

- 網址用 `localhost`，不要用 `127.0.0.1`；本機要用 `next dev --webpack -p 9303`。要驗測試機就把網址換成測試機（`https://maplestory-tool-git-dev-clarkhers-projects.vercel.app`），其他不用改。
- 樣本：楓葉村東郊平原 1020000（4 種怪共 21 隻、NPC 麥加、4 個門）、城鎮 100000000（NPC 超過 6 個）、山姆 1011001（店 90 樣）、麥加 12100（8 個任務）、木妖 130100、任務 1016。
- 檢查（34 項，任何一項沒過 exit 1）：怪物 4 列、木妖「7 隻」、圖上怪物點 21、門標籤 4 個、NPC 麥加、「門通往」4 個連結；
  圖上所有點跟標籤都在圖框內（電腦、手機各量一次）；深色主題圖例文字對比 ≥ 4.5；手機 390 與電腦 1280 都不橫向捲出；
  城鎮 NPC 超過 6 個時圖上只畫小點、不寫名字；山姆先列 8 樣、展開 90 樣、看得到「參考舊版資料」；麥加 8 個任務；
  怪物頁（`/db/monsters/130100`、`?id=` 兩種）點第一個出沒地圖會到 `/db/maps/`；任務卡的 NPC 連到 `/db/npcs/`；
  `/go?from=1010000&to=1020000` 有「看這張圖」；地圖清單搜「紅寶」看得到楓葉村東郊平原；
  四頁內容沒有 emoji、沒有英文縮寫（NPC、GM 除外；頁尾每頁都有的「GMS Classic」不算，只看 `main`）；console 沒有錯誤。
- 輸出：`atlas-map-390-light.png`、`atlas-map-1280-dark.png`、`atlas-npc-390-light.png`、`atlas-npc-1280-dark.png`（整頁）、`results.json`。
- 「看這張圖」只在有起點的路線出現（到了那一步），所以測的是 `from=…&to=…`，只有 `to` 不會有。

### 組隊指揮

#### `pq-shot.mjs`：跑一次組隊指揮頁（v1.31，埠 9432）

```bash
node scripts/verify/pq-shot.mjs [網址，預設 http://localhost:9431] [輸出] [DevTools 埠，預設 9432]
```

- 網址用 `localhost`；本機要用 `next dev --webpack -p 9431`。要驗測試機就把網址換成測試機。
- 檢查（32 項，任何一項沒過 exit 1）：`?pq=kerning` 選到超綠；跳木桶沒填名字／填了名字的喊話；「不對，下一組」只叫要換的人（123→124、126→134）；
  複製真的進剪貼簿、按鈕變「已複製」再變回來，複製完馬上換下一組新喊話不會寫「已複製」；重新整理還在同一組、名字還在；勾選；「過了」跳下一關、回去寫答案；重來只清進度不清名字；
  20 組都不對寫「全部試過了」；女神標舊版、8 關、拉桿喊話；壞存檔＋亂填網址照樣開月妙；手機 390 三個任務都不橫捲；
  攻略頁 `#pq-moon`、`#pq-kerning` 有連結；首頁 58 等狂戰士的女神組隊卡有連結、點了進女神；console 沒有錯誤。
- 輸出：`pq-390-light／dark.png`、`pq-1280-light／dark.png`、`pq-goddess-390.png`（整頁）、`results.json`。
- 攻略頁的組隊段落平常收著，要帶 `#pq-moon` 進來才展開；同一頁只換 `#` 不會重新展開，中間要先開 `about:blank`。
- 同一個輸出資料夾連跑兩次可能卡在上一次的 Chrome 設定檔（「DevTools 沒起來」），換資料夾或換埠。

### 練功測速

#### `speed-shot.mjs`：用測試截圖當假的分享畫面，跑一次練功測速頁（v0.95；v1.10、v1.29 改，埠 9391）

```bash
node scripts/verify/speed-shot.mjs [輸出] [網址，預設 http://localhost:3095] [DevTools 埠，預設 9391]
```

- 網址用 `localhost`，不要用 `127.0.0.1`（`next dev` 對 127.0.0.1 的互動不理）。視窗 1440×900，桌機寬度。
- **換一張畫面**（v1.05）：基準截圖的經驗 406947 剛好沒有 1、2、5、8，測不出數字認錯。先產一張經驗換掉的假畫面，再用環境變數指定：
  ```bash
  SPEED_EXP=46:251836 npx vitest run -c vitest.gen.config.ts painted
  ```
  ```bash
  SPEED_FIXTURE="$TEMP/speed-painted-46-251836.png" SPEED_READING="Lv.46 · 經驗 251,836（49.34%）" node scripts/verify/speed-shot.mjs
  ```
  等級用 46：組隊那幾項照 46 等寫（隊友 44 要在 5 級內才吸得到），換別的等級那幾項會照公式變「吸不到」。
  2026-10-17 量：改之前的測試機 21/28（整段「讀不到經驗」）、改之後 28/28。「重新整理再分享：直接認成這張圖」時好時壞（改之前的測試機也會沒過），是小地圖記憶那段，跟數字無關。
- 頁面在非正式機時認 `window.__speedTestStream`（`src/lib/speed/capture.ts`）：腳本把 `src/lib/speed/__fixtures__/window-1364.png` 畫到 canvas、`captureStream` 塞進去，
  不用真的開遊戲、也不會跳出選視窗的對話框。按「分享遊戲畫面」、滑鼠點擊、打字都走 DevTools 的 `Input`，不是直接呼叫 `click()`。
- 檢查（任何一項沒過 exit 1，每項的結果寫在 `results.json` 的 `checks`，量到的字在 `detail`）：
  1. 頁面載入、重新整理後載好；沒有「你的角色」那張卡（v1.10 拿掉），控制卡寫「這次沒填角色 ID，排行寫匿名玩家。」；導覽列的「練功測速」在電腦寬度看得到、而且是亮著的那顆。
     **v1.29**：按「分享遊戲畫面」不再先問角色 ID；讀到之後跳「讀到你的角色了，要開始計算嗎？」（職業冰雷巫師、Lv.46、406,947（79.73%），截 `speed-start.png`），
     按對話框裡的「開始計算」（卡片上也有一顆，對話框開著時點不到，腳本一定要點對話框裡的）→ 狀態列「量中（按「結束」才停）」、有「結束」、沒有自動／手動切換。
  2. 讀到「Lv.46 · 經驗 406,947（79.73%）」（% 是經驗 ÷ 46 級升級要的經驗算的）、職業「冰雷巫師」、沒勾組隊時寫「單練」。
  3. 地圖：自動認成「森林迷宮III」，或問「你在哪張圖？」（`results.json` 的 `mapState` 記是哪一種、候選是哪些）——問的話候選裡有就點、沒有就用「找不到就搜尋」打字選。
     **v1.10 起基準截圖要直接認出來**（多一項檢查；用 `SPEED_FIXTURE` 換畫面時不判）。以前一定認不出：地圖名的範圍從按鈕往左只看 35px、樣板是一般字重的實心字，見 `read-map.ts` 的 `locateTitle`。
  4. 地圖面板：風獨眼獸、猴子、黑曜石巨人在，每隻有等級、HP、經驗、刷怪點；有掉寶標籤；沒勾組隊時沒有「組隊每隻」；
     「這張圖的實測排行」出現，寫「排行還沒開」（本機沒有 `DATABASE_URL`；有資料庫時是名單或「還沒有人練滿 10 分鐘」），卡在「載入中」或「連不上」都算沒過
     （dev 第一次呼叫排行 API 要先編譯，最多等 1 分鐘）。地圖面板一出現，頁面就向 `/api/speed/board?map=<地圖 id>` 要排行，所以這一步會把那張圖的 id 送到被測的伺服器。
  5. 組隊（玩家自己填）：勾「組隊」→ 出現隊友等級欄 → 填 44 按 Enter → 「打怪的人」留在「你」→ 每張怪物卡都出現
     「組隊每隻：你 +N（打）、Lv.44 +M」，而且打怪的人（你）拿的比隊友多；面板最下面寫「照玩家整理的公式算」「台服沒驗證」；
     `ms-speed` 的 `party` 存了 `{ on: true, others: [44], hitter: 0 }`；頁面寫「組隊 2 人」。
  6. **不動 60 秒**：地圖點好之後同一張畫面再放 60 秒，地圖面板一直是「森林迷宮III」、不能再問「你在哪張圖？」（頁面裡掛 MutationObserver 逐次看，不是只在最後看一眼）。
     同一段時間每一次取樣（頁面裡的觀察器加上每 10 秒一次的取樣）都要看狀態列還是「量中」「讀到了」那類還在讀的字、「停止分享」那顆還在，
     不能出現「分享停了」「認不到遊戲畫面」——畫面上的「Lv.46 · 經驗 …」那行在分享停了之後還會留著，光看它抓不到停了。最後等級經驗也還讀得到。守的是小地圖標題的長相不隨時間飄、讀畫面沒有中途停掉。
  7. 整頁截圖 `speed.png`。
  7b. v1.22 新卡片（整頁截圖之後、存一段之前）：「楓幣收益」卡有撿到／藥水／淨賺跟「開始時楓幣」「現在楓幣」欄；
     「讀不到快捷鍵」那行沒出現（頁面不把讀到的數字露出來，快捷鍵數字本身靠 `quickslot.test.ts`、`read-extras.test.ts` 驗，這裡只看基準截圖讀得到）；
     非正式機的楓幣收益卡掛 `data-slots-read`（最近一次讀快捷鍵有數字的格數），基準截圖要 ≥ 5（702、279、141、0、2；用 `SPEED_FIXTURE` 換畫面時不判）；
     有「跟我之前比」卡；控制卡有「HP 低於 30% 響一聲」開關、預設關。分享中的左欄白天、深色各截一張（`speed-left-light.png`、`speed-left-dark.png`）。
     靜止的假畫面不會列出藥水（用量看數量往下掉），所以藥水那幾行這裡量不到（「—」跟說明那行的規則靠 `live-view.test.ts` 的 `mesoCells`、`potions.test.ts` 的 `potionsOnRead`）。
  8. 按「結束」：靜止畫面這段沒拿到經驗、不存；狀態列回到「讀到了…」、留著「開始計算」，不會再自己跳「要開始計算嗎？」。
     存一段＋補地圖／ID（v1.29）＋加倍券（v1.10）：頁面在非正式機掛 `window.__speedTestSave`，腳本丟一段 12 分鐘、拿到 120,000、**認不出地圖**的進去存。
     本機沒有 `DATABASE_URL`：「上一段」寫「排行還沒開」，補資料、加倍券那段記成略過（另丟一段有地圖的給分享圖用）。有資料庫（分支預覽、測試機，資料寫在 preview 環境）：
     先跳「這段在哪張圖、哪個角色？」（選項有看過的森林迷宮III、有「略過」「記下來」，截 `speed-fill.png`），選地圖、填「驗收用」、勾「下次不要再問我 ID」按記下來 →
     「上一段」不再寫認不出地圖、控制卡寫「這次的角色：驗收用」、`ms-speed` 的 `askId` 是 false；接著跳「上一段有開加倍券嗎？」，
     勾「有開加倍券」預設倍率 1.5、分鐘 12（截 `speed-coupon.png`），改成 1.6、10 分鐘按「記下來」，「上一段」補上「實際 10 分鐘 66,667 經驗」（120,000 ÷（2 + 10 × 1.6）× 10）。
  8b. 分享圖（存一段之後才有停了的上一段可以做圖）：「產生分享圖」按得下去，按了跳出「分享圖」對話框、裡面一張 1200×630 的圖、有「關掉」「下載」（截 `speed-share.png`），按「關掉」收起來。
     再切到深色主題產一次：圖本身還是白天紙張（左上角接近 `#fbf5ea`），圖存成 `speed-share-dark.png`。
  9. 重新整理：角色 ID 沒被記住（控制卡寫「這次沒填角色 ID」）；玩家點過地圖的話 `ms-speed-maps` 有存。再分享，又跳「要開始計算嗎？」，按「先不要」關掉、留著「開始計算」，
     直接認成這張圖；3 秒後同一次分享不會再自己跳出來。
  10. 整趟沒有沒接住的例外、`console.error`（警告只記在 `results.json` 的 `problems.warnings`，不判）。
- 輸出：`speed.png`（整頁）、`speed-start.png`（問要不要開始計算）、`speed-fill.png`（結束後補地圖、ID，有資料庫才有）、`speed-choices.png`（問「你在哪張圖？」那一刻）、`speed-left-light.png`／`speed-left-dark.png`（左欄）、`speed-share.png`、`speed-share-dark.png`（深色主題下產的分享圖）、`speed-coupon.png`（問加倍券，有資料庫才有）、`results.json`（`summary`、`checks`、`failedChecks`、`mapState`、`stationary`、`problems`）；出錯時另存 `crash.png`。
- 耗時：本機 dev server 約 80 秒（60 秒是不動檢查）；dev 第一次編譯 `/plan/speed` 跟排行 API 另加（頁面最多等 2 分半）。
  `--webpack` 的 dev server：`npx next dev --webpack -p 3095`；也可以 `npm run build && npx next start -p 3095`。
- 量不到的：經驗會不會跟著動、升級接不接得上——畫面是靜止的，靠 `tracker.test.ts` 跟真人玩一段。存進資料庫、補填加倍券在有 Neon 的分支預覽／測試機上跑這支就量得到（第 8 項）。
- 假畫面用的是 `window-1364.png`（repo 公開，截圖裡隊友的名字已打馬賽克）；字形樣板、名單換了，這支的「讀到 Lv.46」那幾項要一起看。

### 楓幣匯率

#### `fx-shot.mjs`：楓幣匯率頁 `/price/fx` 截圖（v0.98，埠 9481）

```bash
node scripts/verify/fx-shot.mjs <輸出> [網址，預設 http://localhost:3000] [DevTools 埠，預設 9481]
```

- 四張整頁截圖：手機 390、桌機 1280、手機深色、`?broken=1`（讀不到資料的畫面）。手機是 2 倍解析度，視窗拉到整頁高度再截，一張圖看到底。
- 頁面網址帶 `?pin=<日期>`，十字線停在那天。日期是腳本先讀 `daily.json` 挑出來的（資料裡倒數第 4 天，讀不到資料才用 2026-10-12）。圖只畫最近 N 天（N ＝ 圖寬 ÷ 10 無條件捨去、最少 7 天，手機約 30 天、桌機更多），太舊的日子會被擠出圖外，所以不能寫死日期。`?pin`、`?broken` 只給驗收用，頁面上不提；頁面是靜態的，這兩個參數是載入後在瀏覽器裡讀的。
- 頁面讀的是 raw.githubusercontent.com 上 `fx-data` 分支的真資料，要連得到網路；沒有假資料可塞，所以報價、K 棒會隨資料更新而變，不是逐像素比對用的。
- 每張印一行 PASS／FAIL：頁面載好（`data-fx-ready="1"`）、沒有橫向捲動、`<html data-theme>` 跟要截的主題一樣（深色那張一定要是 `dark`）、讀數（`data-fx-readout`）開頭是 pin 那天（例如 `10/12`）；`?broken=1` 那張要看到「讀不到匯率資料」。但一律 exit 0，截圖要自己打開看。
- 輸出：`fx-390.png`、`fx-1280.png`、`fx-390-dark.png`、`fx-broken-390.png`、`results.json`（每張的寬、高、`scrollWidth`／`innerWidth`、`data-theme`、讀數開頭、頁面開頭的字）。
- 耗時：本機 dev server（已編譯過）約 27～36 秒（2026-10-15 量到兩次：36 秒、27 秒）。
- 網址用 `localhost`，不要用 `127.0.0.1`。

### 紙娃娃

#### `article-layout.mjs`：攻略文版面，沒過 exit 1（v1.49，埠 9499）

```
MSYS_NO_PATHCONV=1 node scripts/verify/article-layout.mjs [網址，預設 http://localhost:9485] [輸出] [文章路徑，逗號隔開] [DevTools 埠]
```

手機 390 寬跟筆電 1280×720 第一屏都看得到結論框開頭、頁面不橫捲、主圖 16:9 不 lazy、路線卡圖手機在右側約 42%、電腦版約 28%；存第一屏、路線卡、電腦版截圖。Git Bash 要加 `MSYS_NO_PATHCONV=1`，不然 `/guides/...` 會被改成 Windows 路徑，輸出路徑要寫 `C:/...`。`images.gen.json` 有的圖頁面一定要有，頁面沒圖算沒過（拿舊的 `out/` 跑會紅，不會默默略過）；清單沒有的篇只量署名跟結論框。**像素圖清不清楚腳本量不出來，要看截圖。**

#### `article-page.mjs`：攻略文的 meta、JSON-LD、圖，沒過 exit 1（埠 9503）

```
MSYS_NO_PATHCONV=1 node scripts/verify/article-page.mjs [網址，預設 http://localhost:9485] [輸出] [文章路徑，逗號隔開] [DevTools 埠]
```

5 篇逐一查：canonical、`og:url`、robots 大圖預覽、`og:type`、`og:image`（是這篇 `hero.jpg`、寬高對清單）、og 日期帶 `+08:00`、`twitter` 大圖；JSON-LD 都解析得開、都在 body，Article 的作者發布者是站、日期帶時區、麵包屑四層、WebPage；`hero.jpg` 真的 200、`image/jpeg`、至少 1200 寬、16:9；主圖真實尺寸對清單、不 lazy；路線卡圖跟清單同一組（同地圖連寫兩步只放一張）；390、360、1280 寬一路捲到底圖全部載入、頁面不橫捲。

**一定要跑新建的輸出**：`out/` 比 `images.gen.json` 舊時圖會缺，這支會紅（故意的）。`og:image`、canonical 都寫死正式網域，測試機也一樣，所以這支只比路徑、圖本身用當前網址抓；**上正式機後還要 `curl -I https://maplehelper.tw/assets/guides/<slug>/hero.jpg` 看一次 200，用 Search Console 查一次**，進 dev 前這張網址本來就是 404。

#### `article-calc-link.mjs`：攻略文表下的連結真的點一次，沒過 exit 1（v1.44，埠 9395）

```bash
node scripts/verify/article-calc-link.mjs [網址，預設 http://localhost:9485] [輸出] [DevTools 埠，預設 9395]
```

存刺客 Lv.35 跟沒存角色各跑 5 篇：點「開計算機改成自己的數值」要開對職業、武器、招式，重新整理一樣；帶參數的頁按導覽列「算傷害」回玩家自己的角色。
這條路只有站內點才抓得到（之前 `useMemo` 讀 `window.location`，直接開網址對、點連結沒作用）。文章的表換武器要改腳本上面的 `CASES`。

#### `avatar-roll-shot.mjs`：隨機穿搭的換裝畫面（v1.76，埠 9399）

`node scripts/verify/avatar-roll-shot.mjs [網址，預設 http://localhost:9385] [輸出資料夾] [DevTools 埠]`：抽獎跳格一按就開始、一路換人、舊角色藏起來；圖好了才定格、閃一下彈一下；圖早就備好也演約 0.4 秒；連按接著跳；換動作不跳；載不出來跳格停掉照實說；首頁「抽一套」進來先跳再定格；討厭動畫的人只寫換裝中。截圖含深色、電腦版。逐格記舞台裡的 `[data-rolling]`。

#### `showcase-shot.mjs`：首頁紙娃娃輪播（v1.71，埠 9386）

`node scripts/verify/showcase-shot.mjs [網址，預設 http://localhost:9385] [輸出資料夾] [DevTools 埠]`：第一次來在大標上面、存過角色在角色列下面（只有一個）、真的在動、討厭動畫的人不動、不橫捲、輪播裡的角色不預先載入、點角色穿那套、抽一套 6 次都抽新的且男女都有、重新整理還是那一套。截圖含深色、電腦版。首頁跳動另外跑 `page-cls.mjs`。

#### `avatar-shot.mjs`：跑一次紙娃娃頁 `/plan/avatar`（v1.40、v1.41，埠 9382）

```bash
node scripts/verify/avatar-shot.mjs [網址，預設 http://localhost:9381] [輸出] [DevTools 埠，預設 9382]
```

- 網址用 `localhost`；本機要用 `npx next dev --webpack -p 9381`（或 `npx next build` 後 `npx next start -p 9381`，開場隨機、預載要在正式 build 也驗一次）。要驗測試機就把網址換成測試機（例 `https://maplehelper-dev.pipicards.workers.dev`），其他不用改。第一次開頁 dev 要編譯，最多等 1 分鐘。
- 角色圖是瀏覽器向 maplestory.io 即時要的，**要連得到網路**；maplestory.io 掛了大多數項目會沒過（那是真的畫不出來，不是程式壞）。
- 期望值從**被測的那個站**的 `/data/avatar.json` 算（不讀本機的 `public/data/avatar.json`，驗測試機時才對得上那邊的資料），道具 id 也從那裡挑、資料更新消失了就換同類的：男生髮型清單、女生第 1 款髮型、第一頂男生能穿的點裝帽子、第一頂畫不出來的點裝帽子、超大武器、槍、一般裝備、搜尋結果件數、有商城價的帽子件數。挑了什麼寫在 `results.json` 的 `expect`。
- 頁面上的東西用挑衣服卡掛的 `data-tab`（分頁）、`data-colour`（色塊）、`data-cell`／`data-name`／`data-missing`（格子）、`data-group`（搜尋區頭）跟角色卡的 `data-lock`（鎖頭）找，不認 Tailwind class；改版面時這幾個屬性要留著。**只有一個例外**：第 30、31 項的 `watchChange` 認大轉圈的 `.motion-safe:animate-spin` 跟它外層的 `inset-0`（大轉圈沒有別的東西可認），改大轉圈的寫法這兩項要跟著改。鎖頭的 `aria-label` 固定是「鎖住{類別}」，狀態看 `aria-pressed`。
- 每一項各自判：點不到東西（`click()` 找不到元素）、等不到東西，那一項直接 FAIL、`detail` 寫「點不到：…」「等不到：…」，接著跑下一項。讀畫面之前都用 `until` 等條件，不用固定秒數。v1.41 的項目用 `fresh()` 開頭：先開同網域的 `/brand-emblem.png` 清 `sessionStorage`（上一套、鎖都存在那裡），每一項從乾淨的狀態開始。
- 檢查（43 項：下面 1～42 加 14 之二，任何一項沒過 exit 1）：
  1. 375 寬一打開（帶 `?g=0`，不帶會開場隨機）：舞台圖載好（`naturalWidth > 0`）、頁面不橫捲。
  2. 點髮型第 N 格（從第 3 格起第一款有兩種以上顏色的，照資料算）：網址 `h=` 換成那一款（保留目前顏色，這款沒有就用最小的；目前顏色讀選中的色塊），舞台圖的網址有那個 id 而且載好、那格框起來；
     再點一個這款有、跟現在不同的顏色：`h` 尾數跟著變、那個色塊 `aria-pressed`。不寫死第 3 款、紅色、黑色。
  3. 捲到挑衣服卡底：小窗看得到（小窗一直掛著，收起來時 `visibility: hidden`＋`inert`，所以看的是 `visibility` 不是有沒有這個元素）、有「下載」「分享」「回到上面」、小窗裡的角色圖載好、**最後一排格子在小窗下面**（沒被蓋住）、不橫捲；
     點「回到上面」回到頂端、小窗收起來而且是 `inert`。
  4. 按「隨機穿搭」3 次：每次網址都變、舞台第 0 格換成新的而且載好。
  5. 切「女」：網址有 `g=1`、髮型第一格是女生第一款髮型、40 格全是女生（或不分男女）的髮型名字。
  6. `?try=<畫不出來的點裝帽子>`：頁面正常、網址回到預設（`?try` 被換掉）、穿了什麼沒有它；帽子頁第一格是第一頂點裝（點裝排前面）；搜它的名字，格子有 `data-missing`、寫「暫時看不到樣子」；點了跳「這件暫時看不到樣子，先挑別件」、網址不變。
  7. `/db/items?id=1042029` 有「穿上看看」、連結是 `/plan/avatar?try=1042029`，點下去穿了什麼裡有「三眼章魚T恤」、舞台圖有它（資料裡沒有就換一件男女都能穿的點裝上衣）。
  8. 用 DevTools `Fetch.enable` 把 `maplestory.io` 的請求全回 503（同時關掉快取、開沒載過的「坐下」動作），角色卡上看到「角色圖載不出來，等一下再過來」跟「再試一次」。
  9. 快取沒有 CORS 標頭（`?p=jump&s=2003`）：帶 `Origin` 的請求全失敗、其他放行（怎麼模擬見下面），舞台自己退回（沒靠按「再試一次」）不帶 `crossOrigin` 照畫、沒有「載不出來」、`<img>` 沒有 `crossorigin`、地面線還是 40。
  10. 開場隨機（這個分頁第一次來，`fresh` 清掉了 `avatar:last`）：沒帶參數打開，網址馬上有 `h=`、`w=`；前一筆瀏覽紀錄還是上一頁（不多一筆）；從文件一開始記舞台畫過的每一格、向 maplestory.io 要過的每一張，**沒畫過也沒要過白 T**（白 T 的第 0 格按「重置」才學到，整趟比對）。按「重置」網址變空、回白 T，停 2 秒還是空。
  11. `?g=1`、`?p=sit` 打開等 1.5 秒，網址沒變（沒被開場隨機換掉）。
  12. `?try=` 進來：網址換成正式寫法、前一筆瀏覽紀錄還是上一個紙娃娃網址（不多一筆）；剛剛穿的白 T 記進 `avatar:history`（`[""]`），按「上一套」回到白 T、又按不了。
  13. 上一套：一開始按不了；按隨機再按，網址回到按之前（動作、表情不變）、又按不了；重新整理後還按得了；再隨機、換動作「跳」（不算一步，疊的還是 1 步），上一套回到髮型、動作留著「跳」。
  14. 連按隨機 5 下（間隔 70ms）：`avatar:history` 只有舞台真的畫過的（少於 5 步、每一步的髮型都畫過），按一次上一套回到畫過的最後一套。
  14 之二. 圖全部扣住（`Fetch` 不放行、關快取）連按隨機 3 下：`avatar:history` 只有按之前畫好的那一套、舞台一直 `aria-busy`；放行後按一次上一套回到那套、又按不了。換穿搭不打伺服器之後，以前「扣住網址」的做法沒有請求可以扣，改扣圖驗一樣的事。
  15. 鎖髮型：鎖不進網址，隨機 3 次 `h` 都不變，按「重置」鎖解開、存的清掉；鎖頭寬 ≥ 36、高 ≥ 44、不是按鈕包按鈕；不橫捲。
  16. 鎖男生限定的上衣、褲裙跟男女都能穿的帽子再切「女」：上衣、褲裙解開，帽子留著，存的剩 `cap`。
  17. 鎖帽子：重新整理還在；脫掉解開、存的清掉。
  18. 存著鎖、這個分頁沒穿過東西（沒有 `avatar:last`）開乾淨的 `/plan/avatar`：從文件一開始逐格看，鎖沒亮過，存的清掉。
  19. 超大武器（`?w=1702861`，3 格，資料沒有就換一件 1702 開頭的）：讀每一格圖的不透明像素、換算到舞台，上下左右都不超出。
  20. 拿槍趴下（`?w=<第一支 144>&p=prone`，1 格）：同上。
  21. 搜「楓葉」：目前分頁（用資料算出的最後一類，才看得出會跳第一）的區頭排第一、其他照分頁順序、每個區頭的件數跟資料一樣（只列得到的區頭）、分頁都不亮、色塊藏起來、「找到 N 件」、格子 `min(40, 總數)`、不橫捲；清掉搜尋回原分頁。
  22. 「再看 40 個」：40 → `min(80, 總數)`，「找到 N 件」不變。
  23. 髮型分頁搜尋時點穿了什麼的髮型小卡：搜尋清掉、髮型分頁亮、色塊回來。
  24. 帽子分頁開「只看商城有賣」：每格都有「N 樂豆點」、格子 `min(40, 件數)`、旁邊寫「N 件」、不橫捲；髮型分頁沒有這顆鈕。
  25. 下載：攔 `URL.createObjectURL`、`HTMLAnchorElement.prototype.click`（**不真的存檔**），檔名 `紙娃娃.png`、PNG、四角透明、要的是 `resize=4&renderMode=0`，寬高**正好是同一套同一格 1 倍的 4 倍**（Node 直接要 `resize=1` 讀 PNG 檔頭比）。不用固定寬度驗：`renderMode=0` 裁到剛好包住角色，寬度看穿什麼（預設角色 1 倍 43×68、4 倍 172×272；舞台的 `renderMode=4` 是 51×128，2026-11-04 量），拿到 1 倍或舞台那張都過不了。
  26. 分享：攔 `navigator.clipboard.writeText`，連結是 `/api/avatar/share`、有 `s,h,f,w`；用 Node `fetch` 拿連結的文字，200、有 `og:image`、`maplestory.io`、`x-robots-tag` 有 `noindex`；HEAD 200 沒內容；缺 `h` 302 到 `/plan/avatar`；`w=<script>` 整頁只有自己那段 `<script`；`robots.txt` 有 `Allow: /api/avatar/share`；瀏覽器打開落在 `/plan/avatar`、穿了什麼跟第 0 格都跟分享前一樣、沒有 `j=`。`og:image` 是 `resize=6&renderMode=0`、寬高正好是同一套 1 倍的 6 倍、寬 ≥ 200（Facebook 不收 200px 以下）、按分享時順手要的就是這張網址。**不驗 `cache-control`**（Vercel、Cloudflare 對外不一定一樣），其他 Vercel、Cloudflare 都驗得過。
  27. `/db/items?id=1040002`（一般裝備，資料沒有就換一件）有「穿上看看」。
  28. 首頁有連到紙娃娃的輪播（`/plan/avatar?draw=1`「抽一套」）、不橫捲。
  29. 預載：一開始不預載（1 秒內沒要過第 0 格）；按過一次之後等 Resource Timing 出現下一套的第 0 格才按（不等固定秒數；`responseStatus` 不是 200 表示這次預載失敗：等了 14 秒以上才算 maplestory.io 慢，再按一次換下一套、不算一輪，最多換 3 次，超過沒過；不到 14 秒就失敗直接沒過），3 輪都要：新圖在按之前就開始要、也要好了，網址換好到圖換上 ≤ 250ms；按下去到圖換上也要 ≤ 250ms（換網址不打伺服器，本機跟測試機一樣）。
  30. 換裝中，快取裡的圖：來回切「坐下」「跳」4 次，最低 opacity 1、沒寫過 opacity、沒有大轉圈、字不變。
  31. 換裝中，慢的圖：`Fetch` 把請求拖 1.2 秒，真的開始要圖之後 130～300ms 內 opacity 變 0.45、大轉圈 ±30ms 內出現（32px、舞台中間）、字變「換裝中…」還按得下去；好了全收掉。舞台寫了載不出來：開始要圖 14 秒以後才寫的才重量一次（開新的一頁，第一次量到的先存進 `results.json` 的 `slowDimFirstAttempt`），比這早直接沒過。
  32. 1280 寬：角色卡、挑衣服卡左右排、上緣對齊；往下捲 200px 角色卡黏在 80px、下緣 ≤ 視窗高（`scrollY` 0 時下緣超出視窗是設計如此，捲一點就黏住）；捲到底都沒有小窗。
  33. 1280×800 穿滿一身（10 件，資料湊不滿沒過）：角色卡黏在 80px、下緣 ≤ 視窗高、`overflow-y: auto`、裡面**真的要捲**（`scrollHeight > clientHeight`，放得下就沒過、`detail` 寫出來，2026-11-04 量到 1017 比 702）、捲到底最後一張小卡在視窗裡、頁面沒動。
  34. 同一分頁回來：搭好一套（`?h=…&p=walk` 再隨機一次）、鎖髮型，點頁首回首頁再站內換到 `/plan/avatar`（乾淨網址；v1.71 起首頁按鈕是 `?draw=1` 抽新的，這項用 `next.router.push`）：網址、第 0 格都是那一套、鎖還在、`avatar:history` 沒變；回來之後舞台只畫過、只要過這一套（沒有白 T、沒有別套）。
  35. 白 T：按「重置」之後重新整理、再開乾淨網址，兩次都網址乾淨、舞台只畫過白 T、`avatar:last` 是空字串、上一套步數沒變。
  36. 從查資料進來、返回、前進：`?h=…` 畫好後從 `/db/items` 點「穿上看看」，`avatar:history` 是那一套、按上一套回得去；再隨機兩套、捲到 400，瀏覽器返回回到查資料（捲動位置跟點之前一樣）、前進回到剛剛那套（網址、第 0 格、捲動位置都一樣）。
  37. 上一套不空按：點帽子、30ms 後再點一次脫掉（現在穿 A、最上面也是 A），按鈕變淡；穿上手套（真的畫好）再點帽子兩下，按一次就回到 A。
  38. 鎖髮型後開 `?try=`：從文件一開始逐格看，鎖沒亮過、存的清掉。
  39. 慢 4G＋CPU 4 倍，搜尋結果裡間隔 30ms 連點兩件不同格的衣服（在頁面裡排計時器，不走 DevTools：它要等上一下處理完才送下一下，量不到真的連點）：網址、穿了什麼都有兩件，沒有 `_rsc` 請求。舊版 `router.replace` 第一件會掉。
  40. 換衣服、隨機、上一套、換動作、換性別、重置：一個 `_rsc` 請求都沒有；挑衣服卡框著新的那件（`useSearchParams` 跟得上）。第 39、40 項只算紙娃娃頁自己的 `_rsc`（`/plan/avatar.txt?…`、`/plan/avatar?…`）：導覽列連結的預先載入一開頁就有 16 個，機器慢時會拖到這段才發，v1.53 前會誤判紅燈；沒過時 `results.json` 有網址。
  41. 320 寬帽子分頁開「只看商城有賣」：每格的字都在格子裡、「樂豆點」三個字在同一行、整頁不橫捲。
  42. 整趟沒有沒接住的例外、`console.error`。
- 輸出：`avatar-375.png`、`avatar-hair.png`、`avatar-mini.png`／`avatar-mini-dark.png`、`avatar-missing.png`、`avatar-from-db.png`、`avatar-error.png`、`avatar-opening.png`、`avatar-locked.png`／`avatar-locked-dark.png`、`avatar-weapon.png`、`avatar-spear.png`、`avatar-search.png`、`avatar-shop.png`、`avatar-busy.png`、`avatar-shared.png`、`avatar-1280.png`／`avatar-1280-dark.png`、`avatar-1280-full.png`、`avatar-back-again.png`、`avatar-double.png`、`avatar-shop-320.png`、`results.json`（`expect` 是從站上資料算出的期望值）；整支跑不下去另存 `crash.png`。
- 小窗只在手機寬度（`lg` 以下）、角色卡整張捲到頁首底下時出現（頁首被手指收起來時是整張捲出螢幕才出現）。腳本的 `click()` 會先把目標捲到畫面中間，點小窗以外的東西可能把角色卡捲回畫面、小窗就收掉了：要點小窗的按鈕就先點，再點別的。
- **第 9 項怎麼模擬**：真實情況是快取裡有一份沒帶 `Origin` 要到的版本（maplestory.io 沒寫 `Vary: Origin`），帶 `crossOrigin` 會被擋。用 `Fetch.requestPaused` 看請求標頭（看得到 `Origin`）：有就 `failRequest`，沒有就放行，快取關著才一定走到這裡；舞台要自己退回不帶 `crossOrigin` 再要一次。**這會真的汙染快取**：`Network.setCacheDisabled` 只是不讀、照樣寫，那張網址之後帶 `crossOrigin` 要都會先失敗再繞一圈，所以這項用別的項目碰不到的膚色（`s=2003`）；2026-11-04 共用 `?p=jump` 時，第 30 項的「跳」偶爾多等 300～650ms、變淡。同一個原因，第 19、20 項讀像素的 `fetch` 要帶 `cache: "reload"`，不然拿到快取裡沒標頭的版本會被擋。
- **`img.src` 會輪播**：站著、走路、警戒的 `src` 在幾格之間換，要比穿搭有沒有換一律比第 0 格（`frame0()`、`STAGE_FRAME0`），等畫好用 `SETTLED`（第 0 格載好、`aria-busy` 是 false、網址寫的 `s,h,f,w` 都在圖裡）。「隨機穿搭」字會變「換裝中…」，用 `RANDOM` 認兩種字。
- **第 29、31 項的時間是在頁面裡量的**（`requestAnimationFrame`＋`MutationObserver`＋Resource Timing），不能用 CDP 來回量：來回本身就要幾十毫秒。每一頁一開始都先 `performance.setResourceTimingBufferSize(5000)`（`Page.addScriptToEvaluateOnNewDocument`），預設 250 筆一下就滿，後面的圖量不到。第 31 項的 150ms 是從「真的開始要圖」算（中間有 250ms 等待），不是從按下去。
- **maplestory.io 偶爾一張圖要 20 秒以上**（Node 直接問也量到 23.5 秒，隔一下同一張不到 1 秒；11/04 40 下隨機碰到 1 次），舞台等 15 秒就寫「載不出來」，這是照設計，不是這些項目要驗的，所以可以重來，**但只有真的等滿才算**：用 Resource Timing 量從真的開始要圖到放棄多久（放棄的請求也有一筆；帶 `crossOrigin` 失敗馬上退回不帶，兩次共用 15 秒，算同一趟），**≥ 14 秒**才算 maplestory.io 慢；比這早放棄（被擋、回錯、程式壞了）或查不到紀錄，那一項直接沒過，記在 `results.json` 的 `earlyErrors`、印出等了多久。真的慢的時候：`drawn()`／`settled()` 幫忙按「再試一次」（整趟最多 6 次，超過不按、那一項沒過）、第 29 項換下一套（這項最多 3 次，超過沒過，跟前者分開數）、第 31 項開新的一頁重量一次。每一次都記在 `upstreamRetries`（`check` 哪一項、`kind` 哪一種、`waitMs` 等多久、`url` 哪張圖）並印出來。第 8、9 項不靠這個。
- 第 12 項看前一筆瀏覽紀錄用 `Page.getNavigationHistory` 的 `entries[currentIndex - 1]`，不比 `length`：瀏覽紀錄滿 50 筆就不會再長。
- 測試機要等 v1.41 進 `dev` 才過得了第 10 項之後的項目（沒進之前是真的沒有這些功能）。
- 耗時：本機正式 build（`next start`）約 1 分 15 秒～1 分 35 秒，dev server（已編譯過）約 2 分 20 秒（2026-11-04 量）；碰到 maplestory.io 慢會多等一輪舞台逾時（量到 2 分 15 秒）。

#### `guild-shot.mjs`：公會徽章 `/plan/guild`（v1.81，埠 9621）

```bash
node scripts/verify/guild-shot.mjs [網址，預設 http://localhost:9620] [輸出] [DevTools 埠，預設 9621]
```

- 本機先 `npx next dev --webpack -p 9620`，網址用 `localhost`。期望值讀**本機**的 `src/lib/guild-mark/marks.json`（圖集網址、列、顏色），驗測試機時本機要是同一版。
- 13 項，任何一項沒過 exit 1：預設畫 1005／10＋2000／2；底圖頁換顏色 3 每一格都換第 3 欄；圖案頁選色 7 → 其他 → 9026 色票只剩 1、再點動物第 2 個回到 7；隨機 10 次網址合法且畫的是網址那個；
  下載（換掉 `HTMLAnchorElement.prototype.click` 攔 blob）68×68、每 4×4 同色、跟圖集兩格疊起來逐像素一樣；`?b=1012&bc=3&m=5004&mc=7` 照畫、`?m=99999&bc=0` 退回預設；375 兩個分頁不橫捲；
  CLS（CPU 慢 4 倍，375、1280）是 0；深色截圖；電腦按分享跳「已複製連結」；首頁輪播下「做公會徽章」、紙娃娃頁「也可以做公會徽章」點了到 /plan/guild（高 ≥ 32、字 13px）；整趟沒有 console 錯誤。
- 比對位置用 `data-stage`、`data-actual`、`data-layer`、`data-tab`、`data-cat`、`data-swatch`、`data-cell`、`data-on`，改版面時這幾個屬性要留著。
- 驗過抓得到：把 `cellStyle` 的 x 改成 `-(colour)`、下載改成抹糊，13 項紅 6 項（2026-11-08）。本機 dev 已編譯過約 35 秒。
- 輸出：`guild-375.png`、`guild-mark-tab.png`、`guild-dark.png`、`guild-home.png`、`results.json`。

#### `nav-fit.mjs`：導覽列放不放得下（v1.72 手機、v1.74 平板，埠 9513）

```bash
node scripts/verify/nav-fit.mjs <輸出資料夾> <網址> [--css=試改法的樣式檔]
```

量 360～1100 的每一個寬度（查資料亮、攻略亮、都不亮三種頁面，約 1 分鐘；v1.86 起量 /db、/guides、/price/fx）：導覽列要不要橫向捲、每一顆是不是全看得到、整頁有沒有被撐寬。手機要剛好四顆（我的路線、攻略、地圖導航、查資料），768 寬起至少八顆。900 寬起按鈕左右要維持 12px。有一個寬度不行就 exit 1。
存 360～1024 十二個寬度的頁首截圖（`<寬度>.png`）跟 `results.json`。`--css` 把樣式塞進頁面再量，不用部署就能比改法。Tailwind 的 `min-[900px]`（px）跟 `md`（rem）單位不同，順序不保證，要蓋過 `md:` 就用 rem 寫（`min-[56.25rem]`）。
中文字的寬度等於字級，換手機字型量到的也差不多。

### 沒收進來的

- `db-verify.mjs`：已被 `scripts/verify-db.mjs`（`npm run verify:db`）取代。M1–M19、D1–D3 都在，還多了 N1–N13、D4。
- `back-frames.mjs`：用頁面裡的 `history.back()` 量，量法不對。它量的東西 `back-all.mjs` 跟 `verify-db.mjs` 的 M8 都有。

## 已知的坑

- **Claude 的瀏覽器窗格常是隱藏的**：rAF 完全不跑、平滑捲動不播、按返回不還原位置、`setTimeout` 被節流。
  在那裡看到的不算數，要量就用這裡的無頭腳本（無頭頁面算看得見，動畫照跑）。
- **站內換頁要在頁面裡點連結**（`a.click()`）。`Page.navigate` 是整頁重載，這次瀏覽載過的資料全沒了。
- **按返回／下一頁用 `Page.navigateToHistoryEntry`**（`harness.mjs` 的 `traverse`），等於按瀏覽器的返回鍵。
  不要用頁面裡的 `history.back()`。
- **「第一格」看 rAF 逐格紀錄**（畫出來前那一格）加 MutationObserver（DOM 每次變動，沒畫出來也記），兩個都要看。
  screencast 的時間戳跟頁面的 `Date.now` 差約 100 毫秒，只能當畫面順序看。
- **取樣要在畫完之後**（rAF 之後再排 `setTimeout`），不然會記到沒畫出來的那一格。
- **調瀏覽器時鐘**：用 `Page.addScriptToEvaluateOnNewDocument` 把頁面的 `Date` 換成位移版
  （`class extends Date`，只改 `now()` 跟無參數建構），計時器照真實時間跑。見 `gear-source-shot.mjs` 的 `clockAt`。
  dev 模式整頁載入加載資料要 10 秒上下，時間要留足。
- **注入腳本跑的時候 `<html>` 還沒建好**（`document.documentElement` 是 null），直接設樣式會靜靜失敗。
  要用 MutationObserver 等它出現再設，見 `crossdoc.mjs` 的 `EARLY_AUTO`。
- **等畫面出現用 MutationObserver**，不要用 `setTimeout` 輪詢。
- **收尾的 `Browser.close` 要設等待上限**：Chrome 有時不回應就把連線斷掉，`await` 永遠等不到，
  node 會以 exit 13 提早結束，後面的結果就沒寫出來。這裡的腳本都改成最多等 2 秒（`Promise.race`），新寫的照抄。
  Windows 上 `chrome.kill()` 之後 Chrome 有時還活著，所以腳本最後要 `process.exit(0)`。
- **有些載入沒有 load 事件**：返回快取還原的頁面沒有，等待要設逾時（`harness.mjs` 的 `loadOnce`）。
  同一頁只換 `#` 的 `Page.navigate` 也沒有，要先跳 `about:blank`（border-* 的 `load`）。
- **桌機無頭量不到慢手機的閃**：用 `Emulation.setCPUThrottlingRate` 調慢 4～6 倍（home-first-frame 的 A4／A6）。
- **頁首按鈕有 0.15 秒變色動畫**，截圖裡舊的那顆還是橘色不是 bug。
- **`captureBeyondViewport: true` 會把固定頁首畫進截圖範圍**，蓋住卡片頂端。
  改用 `false`，先把目標捲到頁首下面再截（card-shot）。
- **`Page.captureScreenshot` 的 `clip` 是整頁座標**：`getBoundingClientRect()` 量到的視窗座標要加上 `scrollX`／`scrollY`，
  不然截到的是頁面最上面那一段（全空白）。**高度是負的 clip 會讓它一直不回**，整支腳本卡死不報錯——
  捲動還沒到位就量（全站 `html` 是平滑捲動）最容易算出負的。量位置前先把 `html` 設 `scroll-behavior: auto !important`
  再跳過去，DevTools 呼叫也要設等待上限（gear-source-shot 的 `send` 每個最多 60 秒）。
- **剛開的 Chrome 停在 `about:blank`，再 `Page.navigate` 到 `about:blank` 不會有 load 事件**，沒設逾時會一直等下去。
  第一頁直接導到要量的網址。
- **手機觸控點長頁面底部的輸入框可能點不到**：點完檢查 `activeElement`，沒點中就 `el.focus()`（border-* 的 `tap`）。
- **改前／改後要用每個 commit 固定的部署網址**，不要拿 dev 測試機當改前（它一小時會被合好幾次）。
  `gh api "repos/clarkher/maplestory-tool/deployments?sha=<完整 sha>"` 拿 id，
  再看 `deployments/<id>/statuses` 的 `environment_url`。
  舊部署大約一小時就會被收掉（410），改前要趁剛合併時量。分支名太長、分支預覽網址被截斷時也用這招。
- **寫死的資料會過期**：角色（狂戰士 45 是 `{ level: 45, job: 110 }`）、搜尋字、10/15 日期、頁面上的字
  （「我的路線」「查資料」）。產品或遊戲資料改了對不上，就要跟著改。
