# 官方公告 → 水影片 全自動（設計）

2026-11-13。使用者拍板：頻道「楓谷幫手」、配音用使用者複製聲音、不露臉（1A 2A 3A）；出片方式 A 全自動；片頭風格 2「快報」。

## 為什麼

使用者要經營 YouTube 頻道導流到 maplehelper.tw。兩種片：公告水影片（量產、搶第一）＋實機正片（使用者錄）。這份只管第一種。
成功＝官網一出新公告，幾小時內就有一支能直接發的片在等使用者審，使用者只看片、按發布。

## 目標／不做／算失敗

- 目標：新公告 → 自動寫稿、配音、動畫 → 16:9 正片（60～120 秒）＋ 9:16 Shorts（30～50 秒）＋ YouTube 標題／說明欄 → 通知使用者審。
- 不做：自動發布到 YouTube 公開（一律人審）；維護、開機、制裁公告；實機正片的剪輯。
- 算失敗（就算片做得出來）：
  - 講了公告跟網站資料裡都沒有的東西（編日期、編機率、編「玩家都說」）
  - 片裡出現 emoji、廉價圖示
  - 配音念錯字沒被擋下來
  - 每次排程都重做同一則（重複出片）

## 現況

- `pipeline/announce/watch.mjs`＋`.github/workflows/announce-watch.yml`：每天 08:10、20:10（Cloudflare 叫）抓官網列表，新公告留言到 issue #313「官網公告追蹤」，看過的 id 記在 issue 內文最後。
- 公告內文 API：`POST https://maplestoryclassic.beanfun.com/api/Bulletin/BulletinDetail?pbid=<id>`（body `{"pbid":<id>}`），回 `data.myDataSet.table.content`（HTML，多半是官方大圖＋注意事項文字）。有的公告 content 是 null（例：84192【楓葉商會】只有標題）。
- 複製聲音：Inworld `default-bwzn5blyrrl-d_slygqzww__clark_20260630`，語速 1.2；單次生成不穩，要 QC（`~/.claude/skills/ai-pitch-video/pipeline/qc_tts.py` 的做法：轉文字比對）。
- HyperFrames CLI 0.9.40 本機可跑（`npx hyperframes render`）。
- repo 是公開的。

## 做法（比過的）

1. **GitHub Actions 裡產片（選這個）**：接在 announce-watch 後面，同一台雲端機器寫稿、配音、render，產物當 Actions artifact，issue 留言附封面圖跟下載連結。不吃使用者電腦 CPU（11/02 才因為本機殘留程式把電腦吃滿），電腦關機也照跑。
2. 本機 Windows 排程產片：能直接寫進 Google Drive，但電腦要開著、會跟其他排程搶 CPU。不選。
3. 只產稿、使用者叫才 render：不是全自動。不選。

## 流程（一則公告）

1. **挑**：announce-watch 找到新公告後，分類是 活動／商城外觀／改版 才做片；維護、開機、關機、制裁、其他不做。
2. **抓**：內文 API 拿 HTML → 抽文字、抽官方圖片（下載到工作目錄）。
   - content 是 null 或抽不到字也沒有圖 → 不做片，在追蹤 issue 留言「只有標題，沒做片」。
3. **補站內資料**：依標題關鍵字對到站內已有的頁（`src/lib/site-pages.ts` 的清單＋攻略文標題），把那頁的重點文字一起給寫稿；同時決定說明欄要放哪個站內連結（對不到就放首頁）。
4. **寫稿**（Azure `gpt-5.4`，Responses API，`store:false`）：輸出 JSON——片頭標題（≤10 字）、副標、3～5 張重點卡（每張：大字 ≤8 字＋一句說明＋這句出自哪裡：公告／站內頁）、旁白逐句、Shorts 版旁白、YouTube 標題、說明欄、要用哪幾張官方圖。
   - 硬規則寫進 prompt＋程式檢查：每張卡的數字、日期都要在來源文字裡找得到（程式逐一比對，對不到就丟掉那張卡；剩不到 2 張就不做片、留言說原因）。
   - 用字：繁體台灣用字、白話、不寫內部術語、不出現真實品牌名以外的商標（遊戲名、官方活動名照公告）。
5. **配音**：Inworld 複製聲逐句生成 → 轉文字（Azure `gpt-4o-mini-transcribe`，帶繁中提示）比對，差太多重生，最多 3 次；還是不過就整支不做、留言。
6. **render**：HyperFrames 專案模板（快報風，照 2026-11-13 拍板截圖 s2）：
   - 片頭：紅條「快報」＋黃條「官方公告 MM/DD」＋大標＋副標＋角色圖（站上 avatar-showcase）＋最下面日期跑馬燈
   - 重點卡：一張一句旁白，大字數字跳出
   - 官方圖：公告大圖慢慢推近
   - 片尾：「完整整理在 maplehelper.tw」＋網址（3 秒）
   - 字幕燒在下方，跟旁白逐句對時
   - 背景音樂：免版權、低音量；沒有就不放
   - Shorts：同一套元件改 1080×1920 版面
7. **交付**：
   - GitHub prerelease（見下方「片放哪」）：`main.mp4`、`shorts.mp4`、`cover.png`（片頭那格）、`youtube.txt`（標題＋說明欄，說明欄第一行站內連結帶 `?utm_source=youtube&utm_medium=video&utm_campaign=announce-<id>`）
   - 追蹤 issue 留言：封面圖＋標題＋下載連結＋「看完直接上傳到楓谷幫手頻道」
   - 已做過的公告 id 記在 issue 內文（跟看過的 id 同一套），重跑不重做

## 審稿後補定（我的判斷，標明給使用者核對）

- **讀圖**：官方大圖要讀。用 Azure `gpt-5.4`（看圖）把每張官方圖的字抄成文字，抄出來的字跟 HTML 文字一起算「來源」。只抄、不解讀。
- **版面依據**：拍板截圖跟原始 HTML 放在 `docs/superpowers/specs/2026-11-13-announce-video/`（`s2-chosen.png`、`s2.html`）。
- **哪些公告做片**：標題有「例行維護／臨時維護／開機／關機／制裁」一律不做（V002 例行維護開機公告不做）；其餘照 `classify()` 是 活動／商城外觀 做；標題有「改版／更新」但不是維護類的也做。`classify()` 原本給 issue 留言用的分類不動，另寫 `shouldMakeVideo(title)`。
- **失敗重試**：「看過」跟「做好」分開記（issue 內文第二個註解 `<!-- video:... -->`，記 id 跟次數）。做片失敗下一班排程再試，最多 3 次；第 3 次還失敗就留言說原因，不再試。公告超過 7 天也不再補做。
- **旁白也檢查**：卡片、旁白、Shorts 旁白、說明欄裡每個數字、日期都要在來源找得到；對不到的整句拿掉，拿完旁白少於 4 句就不做片。
- **片放哪（使用者 11/13 拍板 A）**：每支片開一個 GitHub prerelease（tag `video-<公告id>`，標題「待審｜<片頭標題>」），資產放 `main.mp4`、`shorts.mp4`、`cover.png`、`youtube.txt`。追蹤 issue 留言用 release 資產網址貼封面圖＋下載連結。repo 公開，審前別人翻得到，使用者接受。
  - ⚠️ 這個 repo 的 tag 不會觸發部署（部署看分支），但 tag 名一律 `video-` 開頭，不准碰 `v*`。

## 第二階段（不在這輪）

- 直接上傳到 YouTube 當「私人」影片，使用者在 YouTube Studio 一鍵改公開：要使用者用頻道帳號登入授權一次（OAuth），拿到後放 Actions secret。
- 放進 Google Drive「10 成片」：一樣要使用者帳號授權（服務帳號不能在個人雲端硬碟建檔）。

## 成本（每則公告，不是每個用戶）

一週約 3～6 則會做片的公告。每則：寫稿約 1 次 gpt-5.4 呼叫、配音約 30 句（含重生）、轉文字比對約 30 次、Actions 約 10 分鐘。全部是固定小錢，跟網站流量無關。

## 測試

- 單元測試（vitest，跟現有 `pipeline/announce/lib/*.test.mjs` 一樣）：分類要不要做片、內文 HTML 抽字抽圖、卡片數字對來源檢查、utm 連結、已做過不重做。
- 驗收：拿 84140【閃亮彗星】、84087【橘子週年慶】真的跑一次整條，產出兩支片，我自己看完、截圖給使用者；再用 84192（只有標題）驗證會跳過並留言。

## 留給實作的

- 秘密：`AZURE_OPENAI_KEY`（officialpmswedencentral）、`INWORLD_API_KEY` 要加進 repo 的 Actions secrets（從 `~/.ai-keys.env` 讀，用 `gh secret set`，不印出值）。
- 字型：Actions 機器裝 Noto Sans CJK TC，HyperFrames 用 `@font-face` 指到 `assets/fonts/`。
- 背景音樂來源、轉場細節、卡片動畫：實作時自己選，照快報風。
