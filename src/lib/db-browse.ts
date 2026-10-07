/**
 * 查資料四頁（DbBrowser）的幾條規則，抽出來單獨測：
 * 細節卡放哪裡、清單有沒有換、收起怎麼收、這次換頁是不是按上一頁、捲動要不要平滑、按返回後要不要補救。
 */

export type DetailSpot = "side" | "inline" | "top";

/** 平滑捲動要看系統設定：開了「減少動態效果」就直接跳 */
export function scrollMotion(matchMedia: (query: string) => { matches: boolean }): ScrollBehavior {
  return matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
}

/**
 * 桌機（64rem 以上）細節在右邊那一欄；手機、平板展開在被點的那一筆下面，
 * 那一筆不在目前的清單上（還沒載到、被搜尋篩掉）就放在清單最上面。
 * kept 是同一筆上一次放的位置：同一筆開著時留在原位，清單多載、把那一筆載進來，卡片也不從最上面搬到清單中間；
 * 只有原本展開在那一列下面、那一列卻不在清單上了（原本的位置畫不出來），才改放最上面。
 */
export function detailSpot({
  wide,
  selected,
  hasDetail,
  shown,
  kept,
}: {
  wide: boolean;
  selected: string | null;
  hasDetail: boolean;
  /** 選的那一筆有沒有在目前顯示的清單上 */
  shown: boolean;
  kept?: { id: string; spot: DetailSpot } | null;
}): DetailSpot | null {
  if (wide) return "side";
  if (!selected || !hasDetail) return null;
  if (kept?.id === selected && (kept.spot === "top" || (kept.spot === "inline" && shown))) return kept.spot;
  return shown ? "inline" : "top";
}

/**
 * 點了開著的那一筆：桌機細節在右邊，那一欄捲回卡片頂端；手機卡片放在清單最上面（那一筆後來才載進清單）時，
 * 卡片搬到那一列下面；展開在那一列下面（或根本沒有卡片）就收起。
 */
export function sameRowAction({ wide, spot }: { wide: boolean; spot: DetailSpot | null }): "scroll" | "move" | "collapse" {
  if (wide) return "scroll";
  return spot === "top" ? "move" : "collapse";
}

/** 清單內容的簽名：內容一樣只是重算時不變，篩選、換順序後才會變 */
export function listSignature(entries: ReadonlyArray<{ id: string }>): string {
  return entries.map(entry => entry.id).join(",");
}

/** 清單一次多載幾筆 */
export const MORE_STEP = 120;
/** 捲到底自動接到這麼多筆就停：道具清單有好幾千筆，一直自動接下去，頁尾永遠滑不到 */
export const AUTO_MORE_MAX = 600;

/**
 * 清單下面怎麼多載：還沒到 600 筆，捲到底自動接（接到剛好 600 就停）；到了就換成看得到的「再載」按鈕，一次 120 筆。
 * count 是這次會多幾筆（按鈕上寫的數字）；全部列完回 null。
 */
export function moreRows(visible: number, total: number): { mode: "auto" | "button"; next: number; count: number } | null {
  if (visible >= total) return null;
  const auto = visible < AUTO_MORE_MAX;
  const next = auto ? Math.min(visible + MORE_STEP, AUTO_MORE_MAX) : visible + MORE_STEP;
  return { mode: auto ? "auto" : "button", next, count: Math.min(next, total) - visible };
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

/** 這筆紀錄離開時開著的卡片：哪一頁、哪一筆、在頁面上的位置（離頁面頂端幾 px）、放在哪裡 */
export const CARD = "dbCard";
export type CardRecord = { id: string; at: number; spot: "inline" | "top"; page: string };

/**
 * 把卡片記進這筆紀錄：Next 的紀錄、從清單點開的記號都留著。跟記的一樣就回 null，不用再寫一次。
 * 不是 Next 管的紀錄（例如按過「跳到主要內容」）不寫：寫了之後按返回、下一頁到這筆，Next 會整頁重載。
 */
export function withCard(historyState: unknown, card: CardRecord): Record<string, unknown> | null {
  const state = asRecord(historyState);
  if (state?.__NA !== true) return null;
  const old = cardOf(state);
  if (old?.id === card.id && old.at === card.at && old.spot === card.spot && old.page === card.page) return null;
  return { ...state, [CARD]: { ...card } };
}

export function cardOf(historyState: unknown): CardRecord | undefined {
  const card = asRecord(asRecord(historyState)?.[CARD]);
  if (!card) return undefined;
  const { id, at, spot, page } = card;
  return typeof id === "string" && typeof at === "number" && (spot === "inline" || spot === "top") && typeof page === "string"
    ? { id, at, spot, page }
    : undefined;
}

/** 桌機右邊那一欄捲到哪裡（卡片比畫面長時在那一欄裡自己捲）：哪一頁、哪一筆、捲了幾 px */
export const SIDE = "dbSide";
export type SideRecord = { id: string; page: string; top: number };

/** 把右邊那一欄捲到哪裡記進這筆紀錄：其他記號都留著，跟記的一樣就回 null。不是 Next 管的紀錄不寫（理由同 withCard） */
export function withSide(historyState: unknown, side: SideRecord): Record<string, unknown> | null {
  const state = asRecord(historyState);
  if (state?.__NA !== true) return null;
  const old = sideOf(state);
  if (old?.id === side.id && old.page === side.page && old.top === side.top) return null;
  return { ...state, [SIDE]: { ...side } };
}

function sideOf(historyState: unknown): SideRecord | undefined {
  const side = asRecord(asRecord(historyState)?.[SIDE]);
  if (!side) return undefined;
  const { id, page, top } = side;
  return typeof id === "string" && typeof page === "string" && typeof top === "number" && top >= 0 ? { id, page, top } : undefined;
}

/**
 * 右邊那一欄從哪裡開始看：這筆紀錄記的就是這一頁的這一筆（重新整理、按返回、下一頁回來），捲回原本讀到的地方；
 * 其他（新點的一筆、從連結來的）從卡片頂端開始
 */
export function sideTopFor(historyState: unknown, selected: string | null, page: string): number {
  const side = sideOf(historyState);
  return selected !== null && side?.id === selected && side.page === page ? side.top : 0;
}

/**
 * 按返回、下一頁、重新整理回到開著卡片的那一筆：卡片照這筆紀錄記的地方放——放在最上面的就還是最上面，不會搬到清單中間。
 * 一定要同一頁：從怪物卡連到道具頁、換頁那一下還讀到上一頁的紀錄，編號剛好一樣也不能照著放。
 */
export function keptFromHistory(historyState: unknown, selected: string | null, page: string): { id: string; spot: DetailSpot } | null {
  const card = cardOf(historyState);
  return selected !== null && card?.id === selected && card.page === page ? { id: selected, spot: card.spot } : null;
}

/**
 * 這次換的網址是不是按上一頁／下一頁來的。同一頁裡按返回時，Next 收到 popstate 就在緊接著的 microtask 重畫、跑完 effect，
 * 比晚一步註冊的 popstate 監聽（tracker）還早；這時候看正在發的事件（window.event）才認得出來。
 */
export function isTraversal(tracker: { cameFromHistory(): boolean } | null, event: Event | undefined): boolean {
  return Boolean(tracker?.cameFromHistory()) || event?.type === "popstate";
}

/** 卡片位置差這麼多以內（字型載入之類）不算清單變了 */
const MOVED = 8;

/**
 * 按返回回到開著卡片的清單，瀏覽器已經照離開時的位置還原：
 * 卡片在頁面上的位置跟離開時一樣（清單沒變）就不動——離開前自己捲去看清單別處的，回來也照舊；
 * 位置變了（記憶是整頁共用，中途在別處改過搜尋、篩選），而且那一筆和卡片都不在畫面上，才跳過去。
 * leftAt／nowAt：離開時／現在卡片離頁面頂端幾 px；top／bottom：那一筆加卡片現在在畫面上的上下緣；
 * viewTop：導覽列下緣（被導覽列蓋住的不算看得到）；viewBottom：畫面高度。
 */
export function needsRescue({
  leftAt,
  nowAt,
  top,
  bottom,
  viewTop,
  viewBottom,
}: {
  leftAt: number | undefined;
  nowAt: number;
  top: number;
  bottom: number;
  viewTop: number;
  viewBottom: number;
}): boolean {
  if (leftAt === undefined || Math.abs(nowAt - leftAt) <= MOVED) return false;
  return bottom <= viewTop || top >= viewBottom;
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
