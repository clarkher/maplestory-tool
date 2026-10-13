/**
 * 楓幣匯率收集要不要開／關 issue（fx-collect.yml 的 notify job）。
 * 開：兩個來源都失敗（collect 紅）、推不上 fx-data、8591 連續 3 次抓不到（12 小時，正在靠參考站撐）。
 * 關：8591 正常而且推上去了。不寫入的測試跑法不通知。
 */
export const LABEL = "匯率收集失敗";
export const FAIL_LIMIT = 3;

export function decide({ write, collectResult, publishResult, ok8591, fail8591 }) {
  if (write !== "true") return { action: "none", reason: "測試跑法（沒有寫入），不通知" };
  if (collectResult === "failure") return { action: "open", reason: "8591 跟參考站兩個來源都失敗（或程式出錯），這一輪沒有資料" };
  if (publishResult === "failure") return { action: "open", reason: "資料算好了但推不上 fx-data 分支" };
  if (ok8591 === "false" && Number(fail8591) >= FAIL_LIMIT) return { action: "open", reason: `8591 連續 ${fail8591} 次抓不到（可能被擋或改版），現在靠參考站的數字` };
  if (ok8591 === "true" && publishResult === "success") return { action: "close", reason: "8591 恢復正常" };
  return { action: "none", reason: "沒有要通知的" };
}
