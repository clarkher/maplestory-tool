# YouTube API 稽核表單草稿（楓谷幫手自動上傳）

表單：https://support.google.com/youtube/contact/yt_api_form
用 clark042007@gmail.com 登入再填。表單是英文，下面「填」的部分直接複製貼上。
標【你填】的只有你知道，我沒有亂填。

為什麼要送：Google 文件說沒過稽核的雲端專案用程式傳上去的片會被鎖私人。11/13 實測沒被鎖（工作室改公開成功、v2.27 起直接公開上傳），所以先不送；哪天上傳的片被鎖成私人，再照這份送。我們不用加額度，選預設額度就好。

隱私權政策要求的 YouTube 段落 v2.26 已經加了。

---

## 第 1 段 Request Type

- Select the reason for your request → **Complete a compliance audit to request for additional quota**
  （只有兩個選項，另一個是「被要求重新稽核」。額度下面選「不變」。）

## 第 2 段 Organization and Contact Information

- Are you applying → **As an individual user**
- Your Full Legal Name → 【你填：護照英文名】
- Your Organization's Legal Name → **self**
- Parent Company Name → 留空
- Primary Website → **https://maplehelper.tw**
- Legal Address → 【你填：Country 選 Other、地址用英文】
- Category → **Gaming and Esports**
- Organization Size / Type → **Independent Developer/Sole Proprietor**
- Primary Contact → 【你的名字】／**clark042007@gmail.com**
- Technical / Business Contact → 勾 Same as Primary Contact

## 第 3 段 Business Model

**Describe your organization's work as it relates to YouTube**（填）：

> I run MapleHelper (https://maplehelper.tw), a free fan-made guide website for the MapleStory Classic (Taiwan) game: leveling routes, quest guides, maps, monster data and calculators. I also run the YouTube channel "楓谷幫手" (@maplehelpertw, channel ID UCwFwBnNGxuOtSBoNoxOg4Sw) that publishes short news videos summarizing the game's official announcements, with links back to the guide pages.
>
> The API client is an internal tool used only by me. When the game publishes a new official announcement, a GitHub Actions job builds a narrated summary video (16:9 and a 9:16 Shorts version) and uploads both to my own channel as PRIVATE via videos.insert, and sets a custom thumbnail via thumbnails.set. I then review each video in YouTube Studio and publish it manually. The tool only accesses my own channel, authorized once by me through OAuth. It does not access any other user's YouTube data, has no end users, and stores no YouTube data other than the uploaded video IDs, which are posted to a private review note for me.

- Target audience → **Internal Users**
- How does your API Client monetize → **Free service (we do not charge users)** ＋ **Other**：
  > The API client is not sold and has no users. The related website shows Google AdSense ads on some guide pages (not on pages containing YouTube content) and accepts voluntary donations.
- Advertising 那兩題如果有跳出來 → **Not applicable**
- Partner Manager → **No, I do not have a Google representative**
- How did you first learn → **Google Developer Documentation**
- Content Owner ID / Google Ads Customer ID → 留空

## 第 4 段 API Client Overview

- API Client Name → **MapleHelper Announcement Uploader**
- Contains "YouTube"? → **No**
- Primary Access URL → **https://github.com/clarkher/maplestory-tool/tree/main/pipeline/video**
- Privacy Policy URL → **https://maplehelper.tw/privacy**
- Terms of Service URL → **https://maplehelper.tw/terms**
- Publicly accessible? → **No**
- Demo Account 那四格 → 留空（我們沒有登入畫面）。Special Instructions 填：
  > There is no user interface or login. The client is a script run by GitHub Actions for my own channel only. Full source code of the upload script is public at https://github.com/clarkher/maplestory-tool/blob/main/pipeline/video/lib/youtube.mjs and the workflow at https://github.com/clarkher/maplestory-tool/blob/main/.github/workflows/announce-video.yml
- 確認勾選框 → 勾

## 第 5 段 Use Cases and Quota

- How many project numbers → **1**
- Google Cloud Project Number → **25117298514**（專案 maplehelper-youtube）
- Use Case Category → **Video Uploading & Account Management**、**Internal Company Tool**
- Requires users to sign in with Google (OAuth)? → **Yes**（只有我自己授權過一次）
- Derived metrics 那段 → 不勾（我們不存 YouTube 數據）
- Expected API Usage Volume → **Fewer than 1,000 requests per day**

**要上傳的證明**（我來準備，見最下面）：
1. 隱私權政策截圖（maplehelper.tw/privacy）
2. 首頁截圖，看得到頁尾「隱私權政策」連結
3. 服務條款截圖（maplehelper.tw/terms）
4. OAuth 授權畫面截圖（同意畫面「楓谷幫手自動上傳」）
5. 上傳流程：表單說靜態截圖不夠，要「完整可執行的上傳程式」或「從上傳到片出現在 YouTube 的錄影」。我們給程式網址（公開 repo，完整不是片段）：
   > Complete working upload script: https://github.com/clarkher/maplestory-tool/blob/main/pipeline/video/lib/youtube.mjs (called from pipeline/video/run.mjs, run by .github/workflows/announce-video.yml). Example of a video uploaded by it: https://studio.youtube.com/video/t3HaqEpW0YA/edit

- Quota endpoints → **youtube.videos.insert**、**youtube.thumbnails.set**
- Total quota → **No change / Default quota (10k quota points)**
- 如果 videos.insert 還是要填 Detailed Justification：
  > About 2 uploads per new official game announcement (main video + Shorts), typically 0–3 announcements per day, so at most about 6 videos.insert calls per day. The default quota is enough; we only need the audit so uploaded videos can be made public after manual review.

---

## 送出前要先補的一件事（等你拍板）

YouTube 的條款要求：用到 YouTube API 的服務，隱私權政策要寫明有用 YouTube API 服務，並附 YouTube 服務條款跟 Google 隱私權政策的連結。我們現在的 /privacy 沒有這段，審查員很可能退件。

建議在 /privacy 加一小段（草稿）：

> **YouTube 頻道**
> 楓谷幫手的 YouTube 頻道用 YouTube API 服務上傳我們自己做的影片。這個上傳工具只碰我們自己的頻道，不會讀取或保存你的 YouTube 資料。使用 YouTube 時適用 [YouTube 服務條款](https://www.youtube.com/t/terms) 與 [Google 隱私權政策](https://policies.google.com/privacy)。
