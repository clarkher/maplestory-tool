# fx-data：楓幣匯率資料（自動產生，不要手改）

這條分支只放資料，由 `.github/workflows/fx-collect.yml` 每 2 小時寫一次（程式在 main／dev 的 `pipeline/fx/`）。
`vercel.json` 關掉這條分支的部署：資料更新不吃 Vercel 每天的部署額度。

資料來源：[maple-classic-wiki.pages.dev/price](https://maple-classic-wiki.pages.dev/price) 整理的 8591《新楓之谷：經典版》公開掛單市價。
數字是賣家開的價（掛單），不是成交價。

| 檔案 | 內容 |
|---|---|
| `fx/scania/daily.json` | 雪吉拉每天一筆：開高低收（元／1 億楓幣）、`closeMesoPerNtd`（1 元換幾萬楓幣）、掛單數 |
| `fx/scania/latest.json` | 最新一筆：市價、掛單數、價位分布 |
| `fx/scania/ref-samples.jsonl` | 每 2 小時一筆的市價紀錄（參考站只留最近 60 筆，這裡存全部） |

欄位說明見 main 分支的 `docs/superpowers/specs/2026-10-13-meso-fx-design.md`「10/14 改版」。
