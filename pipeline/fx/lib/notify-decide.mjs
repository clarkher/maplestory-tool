/**
 * 楓幣匯率收集要不要開／關 issue（fx-collect.yml 的 notify job）。
 * 開：參考站抓不到或格式變了（collect 紅）、推不上 fx-data、collect 或 publish 撞到時間上限被中止（cancelled）、
 *     fx-data 的最後一筆市價 12 小時以上沒更新（參考站每 2 小時更新一次；停了、或它的口徑改了接不上，頁面就一直是舊數字）。
 * 關：抓到了、推上去了、資料不舊。不寫入的測試跑法不通知。
 */
export const LABEL = "匯率收集失敗";
export const STALE_HOURS = 12;

export function decide({ write, collectResult, publishResult, ageHours }) {
  if (write !== "true") return { action: "none", reason: "測試跑法（沒有寫入），不通知" };
  if (collectResult === "failure") return { action: "open", reason: "參考站的 price.json 抓不到或格式變了，這一輪沒有資料" };
  if (publishResult === "failure") return { action: "open", reason: "資料算好了但推不上 fx-data 分支" };
  // notify 只在整個 workflow 沒被取消時跑（!cancelled()），所以這裡看到 cancelled 就是 job 撞到 timeout-minutes 被中止
  if (collectResult === "cancelled" || publishResult === "cancelled") return { action: "open", reason: "收集或推送超過時間上限被中止，這一輪沒有資料" };
  const age = Number(ageHours);
  if (ageHours === "" || ageHours === undefined || !Number.isFinite(age)) return { action: "none", reason: "不知道參考站多久沒更新（ageHours 讀不到），先不動 issue" };
  if (age >= STALE_HOURS) return { action: "open", reason: `fx-data 已經 ${ageHours} 小時沒有新的市價（參考站停了，或它的格式、口徑改了），頁面上的匯率會一直是舊的` };
  if (collectResult === "success" && publishResult === "success") return { action: "close", reason: "恢復正常" };
  return { action: "none", reason: "沒有要通知的" };
}
