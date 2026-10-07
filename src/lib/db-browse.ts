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

/**
 * 搜尋：名字開頭符合（或編號完全一樣）的排前面，再來是名字或關鍵字含這個字的；各組照清單原本的順序。
 * preferred：這次搜尋要排最前面的 id（例如道具頁搜「劍士」時劍士能用的裝備），一樣要符合搜尋字才算，照清單順序。
 */
export function searchEntries<T extends { id: string; name: string; keywords?: string }>(
  entries: readonly T[],
  query: string,
  preferred?: ReadonlySet<string> | null,
): readonly T[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return entries;
  const first: T[] = [];
  const starts: T[] = [];
  const contains: T[] = [];
  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    const startsWith = name.startsWith(keyword) || entry.id === keyword;
    if (!startsWith && !name.includes(keyword) && !entry.keywords?.toLowerCase().includes(keyword)) continue;
    if (preferred?.has(entry.id)) first.push(entry);
    else if (startsWith) starts.push(entry);
    else contains.push(entry);
  }
  return [...first, ...starts, ...contains];
}

/** 在沒開著別筆時從清單點開，會在那一筆的歷史紀錄留下這個記號 */
export const FROM_LIST = "dbFromList";
/** 記號是哪一份頁面留的：重新整理之後，上一筆紀錄屬於舊的頁面，返回會整頁重載 */
export const FROM_DOC = "dbFromDoc";

const asRecord = (value: unknown) =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

/**
 * 從清單點開一筆時要不要留記號：網址上沒開著別筆（看網址，不看還沒更新的畫面），
 * 而且現在這筆紀錄是 Next 管的——不是的話（例如按過「跳到主要內容」），返回時 Next 不會換畫面。
 * doc 是這份頁面的識別（performance.timeOrigin）。
 */
export function fromListMark(openId: string | null, historyState: unknown, id: string, doc: number) {
  if (openId !== null || asRecord(historyState)?.__NA !== true) return null;
  return { [FROM_LIST]: id, [FROM_DOC]: doc };
}

/**
 * 收起時要不要用「返回」：只有同一份頁面裡、沒開著別筆時從清單點開的那一筆才用——上一頁就是點之前的清單，
 * 返回不會多留一筆紀錄。其他情況返回會離開這頁、跳回上一筆，或整頁重載。
 */
export function collapseByBack(historyState: unknown, selected: string, doc: number): boolean {
  const state = asRecord(historyState);
  return state?.[FROM_LIST] === selected && state?.[FROM_DOC] === doc;
}

/**
 * 這次換頁是不是按上一頁／下一頁來的：是的話交給瀏覽器還原位置，自己不要再捲。
 * 之後只要使用者自己點了東西或按了鍵，接下來的換頁就是新的。
 * onTraverse／onFresh：按上一頁時、之後第一次自己操作時各通知一次。
 * traversing：一開始就算剛按過上一頁（例如重新整理，瀏覽器一載入就在還原位置）。
 */
export function createHistoryTracker(
  target: Pick<EventTarget, "addEventListener">,
  {
    onTraverse,
    onFresh,
    traversing: initial = false,
  }: { onTraverse?: () => void; onFresh?: () => void; traversing?: boolean } = {},
) {
  let traversing = initial;
  const fresh = () => {
    if (!traversing) return;
    traversing = false;
    onFresh?.();
  };
  target.addEventListener("popstate", () => {
    traversing = true;
    onTraverse?.();
  });
  // 讀螢幕軟體按連結時只送 click，也要算
  for (const type of ["pointerdown", "keydown", "click"]) target.addEventListener(type, fresh, { capture: true });
  return { cameFromHistory: () => traversing };
}
