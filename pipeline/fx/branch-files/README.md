# fx-data：楓幣匯率資料（自動產生，不要手改）

這條分支只放資料，由 `.github/workflows/fx-collect.yml` 每 4 小時寫一次（程式在 main／dev 的 `pipeline/fx/`）。
`vercel.json` 關掉這條分支的部署：資料更新不吃 Vercel 每天的部署額度。

| 檔案 | 內容 |
|---|---|
| `fx/scania/daily.json` | 雪吉拉每天一筆：開高低收（元／1 億楓幣）、`closeMesoPerNtd`（1 元換幾萬楓幣）、掛單數、成交額、來源 |
| `fx/scania/latest.json` | 最新一次：市價、掛單數、價位分布 |
| `fx/scania/samples.jsonl` | 每次抓 8591 的結果（一行一次） |
| `fx/scania/ref-samples.jsonl` | 參考站（maple-classic-wiki.pages.dev）的市價紀錄，8591 抓不到的空檔用它補 |
| `fx/scania/state.json` | 算成交用：上一次每筆掛單的累計賣出件數 |

數字是 8591 賣家開的價（掛單），不是成交價。欄位說明見 main 分支的 `docs/superpowers/specs/2026-10-13-meso-fx-design.md`。
