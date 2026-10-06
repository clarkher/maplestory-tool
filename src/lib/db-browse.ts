/**
 * 查資料四頁（DbBrowser）的幾條規則，抽出來單獨測：
 * 細節卡放哪裡、清單有沒有換、收起怎麼收、這次換頁是不是按上一頁。
 */

export type DetailSpot = "side" | "inline" | "top";

/**
 * 桌機（64rem 以上）細節在右邊那一欄；手機、平板展開在被點的那一筆下面，
 * 那一筆不在目前的清單上（還沒載到、被搜尋篩掉）就放在清單最上面。
 */
export function detailSpot({
  wide,
  selected,
  hasDetail,
  shown,
}: {
  wide: boolean;
  selected: string | null;
  hasDetail: boolean;
  /** 選的那一筆有沒有在目前顯示的清單上 */
  shown: boolean;
}): DetailSpot | null {
  if (wide) return "side";
  if (!selected || !hasDetail) return null;
  return shown ? "inline" : "top";
}

/** 清單內容的簽名：內容一樣只是重算時不變，篩選、換順序後才會變 */
export function listSignature(entries: ReadonlyArray<{ id: string }>): string {
  return entries.map(entry => entry.id).join(",");
}

/** 在沒開著別筆時從清單點開，會在那一筆的歷史紀錄留下這個記號 */
export const FROM_LIST = "dbFromList";

/**
 * 收起時要不要用「返回」：只有沒開著別筆時從清單點開的那一筆才用——上一頁就是點之前的清單，
 * 返回不會多留一筆紀錄，瀏覽器也會把清單捲回點之前的位置。其他情況返回會離開這頁或跳回上一筆。
 */
export function collapseByBack(historyState: unknown, selected: string): boolean {
  if (typeof historyState !== "object" || historyState === null) return false;
  return (historyState as Record<string, unknown>)[FROM_LIST] === selected;
}

/**
 * 這次換頁是不是按上一頁／下一頁來的：是的話交給瀏覽器還原位置，自己不要再捲。
 * 之後只要使用者自己點了東西或按了鍵，接下來的換頁就是新的。
 * onTraverse／onFresh：按上一頁時、之後第一次自己操作時各通知一次。
 */
export function createHistoryTracker(
  target: Pick<EventTarget, "addEventListener">,
  { onTraverse, onFresh }: { onTraverse?: () => void; onFresh?: () => void } = {},
) {
  let traversing = false;
  const fresh = () => {
    if (!traversing) return;
    traversing = false;
    onFresh?.();
  };
  target.addEventListener("popstate", () => {
    traversing = true;
    onTraverse?.();
  });
  target.addEventListener("pointerdown", fresh, { capture: true });
  target.addEventListener("keydown", fresh, { capture: true });
  return { cameFromHistory: () => traversing };
}
