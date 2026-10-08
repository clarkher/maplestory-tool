"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  cardOf, cardShift, collapseByBack, createHistoryTracker, detailSpot, fromListMark, groupHeads, groupLabeler, isTraversal, keptFromHistory,
  listSignature, moreRows, needsRescue, samePageTarget, sameRowAction, scrollMotion, searchEntries, sideTopFor, withCard, withSide, type DetailSpot, type Prefer,
} from "@/lib/db-browse";
import { useHydrated } from "@/lib/hydrated";
import { reloadRestore } from "@/lib/reload-scroll";
import { useRemembered } from "@/lib/remember";
import { ChevronDown, ChevronRight, SearchIcon } from "./Icons";
import { EmptyBlock, LoadingBlock } from "./PlanShell";
import { SearchClear, searchKeys } from "./SearchClear";
import Link from "next/link";
import { statSpans, type StatSpan } from "@/lib/stat-layout";

export type DbEntry = {
  id: string;
  name: string;
  /** 列表右側的小字 */
  note?: string;
  /** 列表左側的縮圖 */
  image?: string;
  /** 搜尋時額外比對的字串 */
  keywords?: string;
  /** 名字後面的小標籤，例如「10/15 開放」的 Chip */
  badge?: React.ReactNode;
  /** 清單中間的小標：跟上一筆不同時，在這一筆上面放一行（沒有搜尋字時才用；任務頁「接得到的」分快過期、剛解鎖、隨時可以補） */
  group?: string;
};

const PAGE_SIZE = 60;

/** 跟 Tailwind 的 lg 同一個斷點，瀏覽器字級調大時兩欄／單欄的判斷才會一致 */
const WIDE = "(min-width: 64rem)";
const isWide = () => window.matchMedia(WIDE).matches;
const narrowOnServer = () => false;
function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * 按上一頁／下一頁換的網址交給瀏覽器還原位置，這裡不再捲。
 * （還原時直接跳、不從頂端一路滑過去，是全站的 HistoryScrollJump 在管）
 */
const navHistory = typeof window === "undefined" ? null : createHistoryTracker(window);

/**
 * 這次換的網址是不是按上一頁／下一頁來的。同一頁裡按返回時，Next 收到 popstate 就在緊接著的 microtask 重畫、跑完 effect，
 * 比 navHistory 自己的 popstate 監聽還早（DbBrowser 比 Next 晚載入，監聽排在後面）；這時候看正在發的事件才認得出來。
 */
const cameFromHistory = () => isTraversal(navHistory, window.event);

/** 清單每一列的 DOM id：展開、收起、從連結跳過來時用來找那一列 */
const rowOf = (id: string) => document.getElementById(`db-row-${id}`);

/** 清單裡緊接在這一列前面、後面的那一列的 id（中間的小標不算）；沒有就是 null */
const neighborRowId = (row: Element | null, side: "previousElementSibling" | "nextElementSibling") => {
  for (let li = row?.[side] ?? null; li; li = li[side]) if (li.id.startsWith("db-row-")) return li.id.slice("db-row-".length);
  return null;
};

/** 網址上現在開著哪一筆。pushState 之後畫面要等一下才更新，連點時要看網址，不能看畫面上的 selected */
const openIdNow = () => new URLSearchParams(window.location.search).get("id");

function urlWith(id: string | null) {
  const next = new URLSearchParams(window.location.search);
  if (id === null) next.delete("id");
  else next.set("id", id);
  const search = next.toString();
  return search ? `?${search}` : window.location.pathname;
}

/** 捲過去要不要平滑：照系統設定，開了「減少動態效果」就直接跳 */
const glide = () => scrollMotion(query => window.matchMedia(query));

/** 頁首的導覽列（固定在畫面頂端；手指往下滑時收起來，收起來時下緣在畫面頂端） */
const siteHeader = () => document.querySelector("body > header");

/**
 * 黏在導覽列下面的那一列、那顆「收起」：底下的卡片會從後面捲過去，底色不能透明。
 * 導覽列收起來時 --header-offset 變 0，跟著導覽列一起移到最上面（同樣 0.2 秒）
 */
const STUCK =
  "sticky top-[var(--header-offset)] z-10 transition-[top] duration-200 ease-out bg-[color:color-mix(in_srgb,var(--maple)_12%,var(--paper))] ring-1 ring-[color:var(--maple)] shadow-[0_8px_14px_-10px_rgb(60_30_10/0.45)]";

/**
 * 四個資料頁共用的骨架：桌機左邊清單、右邊細節；手機、平板點了哪一筆，細節就展開在那一筆下面。
 *
 * 原站把整包資料當同步 script 一次載入（道具那頁 19MB），這裡改成先載清單、
 * 選中才渲染細節，而且列表分批補上，捲到快到底才多畫下一批。
 * 搜尋字、已經載入幾筆記到這次瀏覽結束：離開再回來、按返回，清單跟離開時一樣。
 */
export function DbBrowser({
  title,
  lead,
  entries,
  loading,
  error,
  filters,
  renderDetail,
  searchPlaceholder = "輸入名稱或 ID",
  preferFor,
  resetKey,
}: {
  title: string;
  lead: string;
  entries: DbEntry[];
  loading: boolean;
  error: string | null;
  filters?: React.ReactNode;
  renderDetail: (id: string) => React.ReactNode;
  searchPlaceholder?: string;
  /**
   * 這次搜尋要排最前面的那一組跟兩組的小標（例：道具頁搜「劍士」→ 劍士能用的裝備排最前面，
   * 清單中間分「劍士能用的裝備」「名字或說明提到劍士的」兩組）；回 null 照一般排法、不分組。要用 useCallback 包，不然每次重算
   */
  preferFor?: (keyword: string) => Prefer | null;
  /**
   * 換了清單才從頭顯示 60 筆的依據。沒給就看每一筆的 id 跟順序（listSignature）；給了就只看它：
   * 任務頁打勾後清單會少一列、重排，那不算換了清單，已經載出來的筆數不能被收回去
   */
  resetKey?: string;
}) {
  const params = useSearchParams();
  const selected = params.get("id");
  // 這是哪一頁：紀錄裡的卡片要是這一頁的才照著放（從怪物卡連到道具頁時，編號可能剛好一樣）
  const page = usePathname();
  const router = useRouter();
  const wide = useSyncExternalStore(subscribeWide, isWide, narrowOnServer);
  // 記住的搜尋字第一個畫面就讀得到，伺服器畫的頁面卻沒有：「×」等瀏覽器接手後才放，兩邊才對得上
  const hydrated = useHydrated();

  const [query, setQuery] = useRemembered(`db:${title}:query`, "");
  const [visible, setVisible] = useRemembered(`db:${title}:visible`, PAGE_SIZE);
  const detailRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  // 卡片上一次放在哪裡：同一筆開著時留在原位，清單多載、把那一筆載進來，卡片也不會從最上面搬到清單中間
  const [kept, setKept] = useState<{ id: string; spot: DetailSpot } | null>(null);

  const prefer = useMemo(() => preferFor?.(query.trim()) ?? null, [preferFor, query]);
  const matches = useMemo(() => searchEntries(entries, query, prefer?.ids), [entries, query, prefer]);

  // 篩選換了清單才從頭顯示 60 筆；內容一樣只是重算（角色讀好、標籤冒出來）不算，多載過的不會被收回去
  const signature = useMemo(() => resetKey ?? listSignature(entries), [resetKey, entries]);
  const shownSignature = useRef(signature);
  useEffect(() => {
    if (shownSignature.current === signature) return;
    shownSignature.current = signature;
    setVisible(PAGE_SIZE);
  }, [signature, setVisible]);

  // 這次網址的 id 是點清單換的：select 自己會捲，下面「從連結來的」effect 就不再跳一次
  const pickedFromList = useRef(false);
  // 手機點一筆時，那一列在畫面上的位置：展開後先放回原處，再捲到導覽列下方
  const tapped = useRef<{ id: string; top: number } | null>(null);
  // 收起的是哪一筆、是不是用返回收的、什麼時候按的、卡片原本放在哪裡（y）、那一列原本前後是哪兩列（收起後那一列可能不在清單上，清單也可能重排）
  const collapsed = useRef<{
    id: string;
    byBack: boolean;
    at: number;
    spot: DetailSpot | null;
    y: number | null;
    nextId: string | null;
    prevId: string | null;
  } | null>(null);
  // 最近一次從清單點開的是哪一筆、什麼時候點的：擋手指連點
  const lastPick = useRef<{ id: string; at: number } | null>(null);
  // 卡片現在放在哪裡：點、收起的時候要知道，不用等下一次畫面
  const spotNow = useRef<DetailSpot | null>(null);
  const pageNow = useRef(page);
  // 按返回回來、等瀏覽器還原完再比對的這段時間，先不要把這筆紀錄記的卡片位置蓋掉
  const rescuing = useRef(false);
  // 桌機從清單點了一筆：畫出來後看右邊那一欄有沒有被往上推走
  const sideRevealPending = useRef(false);
  // 桌機右邊那一欄現在畫的是哪一筆、捲動停下來才記（記進紀錄的計時器）
  const selectedNow = useRef(selected);
  const sideScrollTimer = useRef<number | undefined>(undefined);
  // 按了「再載」：從第幾筆開始是新載的（按鈕載完全部後不見了，焦點移到新載的第一筆）
  const loadedFrom = useRef<number | null>(null);

  /**
   * 桌機右邊那一欄平常黏著，頁面不用動；只有清單到底、頁尾出來了，那一欄被往上推走一截時，
   * 頁面往上捲一點讓卡片頂端出來
   */
  const revealSide = useCallback(() => {
    const side = detailRef.current;
    if (!side) return;
    const stuckAt = parseFloat(getComputedStyle(side).top);
    const top = side.getBoundingClientRect().top;
    if (Number.isFinite(stuckAt) && top < stuckAt - 1) window.scrollBy({ top: top - stuckAt, behavior: glide() });
  }, []);

  const collapse = useCallback(() => {
    const openId = openIdNow();
    if (!openId) return;
    // 剛按過收起、還在收（例如手機上連點兩下）：不再收第二次，不然用返回收的會連退兩頁、離開這一頁
    const pending = collapsed.current;
    if (pending?.id === openId && performance.now() - pending.at < 1000) return;
    const byBack = collapseByBack(window.history.state, openId, performance.timeOrigin);
    const openRow = rowOf(openId);
    collapsed.current = {
      id: openId,
      byBack,
      at: performance.now(),
      spot: spotNow.current,
      y: openRow ? Math.round(openRow.getBoundingClientRect().top + window.scrollY) : null,
      nextId: neighborRowId(openRow, "nextElementSibling"),
      prevId: neighborRowId(openRow, "previousElementSibling"),
    };
    // 從清單點開的那一筆用返回收起：上一頁就是點之前的清單，不會多留一筆紀錄
    if (byBack) window.history.back();
    else window.history.replaceState(null, "", urlWith(null));
  }, []);

  const select = useCallback(
    (id: string) => {
      const openId = openIdNow();
      if (openId === id) {
        // 剛點開不到半秒又點同一筆，多半是手指連點，當作同一下
        if (lastPick.current?.id === id && performance.now() - lastPick.current.at < 500) return;
        const action = sameRowAction({ wide: isWide(), spot: spotNow.current });
        // 桌機細節在右邊：那一欄捲回卡片頂端
        if (action === "scroll") {
          detailRef.current?.scrollTo({ top: 0, behavior: glide() });
          revealSide();
        }
        // 卡片放在清單最上面（那一筆後來才載進清單）：搬到這一列下面，跟點開一筆一樣捲過去
        else if (action === "move") {
          // 跟點開一筆一樣擋手指連點：第二下不要把剛搬下來的卡片收掉
          lastPick.current = { id, at: performance.now() };
          const row = rowOf(id);
          tapped.current = row ? { id, top: row.getBoundingClientRect().top } : null;
          setKept({ id, spot: "inline" });
        }
        // 手機再點一次開著的那一筆就收起
        else collapse();
        return;
      }
      lastPick.current = { id, at: performance.now() };
      pickedFromList.current = true;
      if (!isWide()) {
        const row = rowOf(id);
        tapped.current = row ? { id, top: row.getBoundingClientRect().top } : null;
      }
      // push 不用 replace：看完一筆按返回，要回到上一筆，不是直接離開這一頁。
      // 沒開著別筆時留記號，收起時才知道可以用返回回到點之前的清單
      window.history.pushState(fromListMark(openId, window.history.state, id, performance.timeOrigin), "", urlWith(id));
      // 桌機：右邊那一欄黏著，頁面不跳回上面；新的那一筆畫出來後再看那一欄有沒有被推走（下面的 effect）
      if (isWide()) sideRevealPending.current = true;
    },
    [collapse],
  );

  // 找不到這一筆時 renderDetail 回 null：細節是空的，下面就不捲過去（免得捲到一片空白）
  const detail = !loading && selected ? renderDetail(selected) : null;
  const hasDetail = detail !== null && detail !== undefined;
  const shown = matches.slice(0, visible);
  const heads = groupHeads(shown, groupLabeler(query, prefer));
  const spot = detailSpot({
    wide,
    selected,
    hasDetail,
    shown: selected !== null && shown.some(entry => entry.id === selected),
    // 按返回、下一頁、重新整理回到開著卡片的那一筆：照這筆紀錄記的地方放，放在最上面的不會搬到清單中間
    kept: kept?.id === selected ? kept : keptFromHistory(typeof window === "undefined" ? null : window.history.state, selected, page),
  });
  // 記下這次放的位置，下一次照著放（同一筆開著時卡片不搬家）
  const placed = selected !== null && spot !== null ? { id: selected, spot } : null;
  if (placed?.id !== kept?.id || placed?.spot !== kept?.spot) setKept(placed);
  useLayoutEffect(() => {
    spotNow.current = spot;
    pageNow.current = page;
    selectedNow.current = selected;
  });

  /** 卡片（加上它那一列）現在在畫面上的那一塊：展開在那一列下面就是那一列，放在最上面就是最上面那一塊 */
  const cardBlock = useCallback(
    (id: string | null) => (!id ? null : spotNow.current === "top" ? topRef.current : spotNow.current === "inline" ? rowOf(id) : null),
    [],
  );
  /**
   * 把卡片記進這一筆紀錄（哪一筆、在頁面上的位置、放在哪裡）：按返回回來時照著放，再跟位置比就知道清單有沒有變
   */
  const recordCardAt = useCallback(
    (id: string | null) => {
      // 網址已經換成別筆、畫面還沒跟上：這次不記，免得把舊卡片記進新的那一筆
      if (!id || openIdNow() !== id) return;
      const spot = spotNow.current;
      const block = cardBlock(id);
      if (!block || (spot !== "inline" && spot !== "top")) return;
      const at = Math.round(block.getBoundingClientRect().top + window.scrollY);
      const next = withCard(window.history.state, { id, at, spot, page: pageNow.current });
      if (!next) return;
      try {
        window.history.replaceState(next, "");
      } catch {
        // 瀏覽器限制短時間內改紀錄的次數（Safari 10 秒 100 次）：這次記不到，下次畫面更新再記
      }
    },
    [cardBlock],
  );

  // 這次載入時紀錄裡記的卡片（離開那一刻在頁面上的位置）。畫出來之後紀錄會一直改成現在的位置，所以一開始就先拿起來
  const [cardWhenLeft] = useState(() => (typeof window === "undefined" ? undefined : cardOf(window.history.state)));
  const followReload = useRef(true);
  // 上一次叫 reload-scroll 挪了多少：卡片沒再搬就不再叫，不去拉回使用者用捲軸、讀螢幕軟體捲到的地方
  const shiftedBy = useRef<number | null>(null);
  // 重新整理、離站再返回（整頁重載）回到開著卡片的那一筆：位置由 reload-scroll 放回離開時讀到的地方。
  // 卡片跟離開時不在同一個地方（重新整理後清單只剩前 60 筆，卡片從清單中間搬到最上面）：要放回去的位置跟著卡片挪，
  // 一樣停在卡片裡讀到的那一段。清單分兩次畫（先照記住的筆數、再縮回 60 筆），所以每次畫完都對一次；
  // 在畫面出來之前挪，不會先閃到舊的位置
  useLayoutEffect(() => {
    if (!followReload.current) return;
    const restore = reloadRestore();
    if (!restore?.restoring()) {
      followReload.current = false;
      return;
    }
    const block = cardWhenLeft?.id === selected && cardWhenLeft.page === page ? cardBlock(selected) : null;
    if (!cardWhenLeft || !block) return;
    const by = cardShift(cardWhenLeft.at, Math.round(block.getBoundingClientRect().top + window.scrollY));
    if (by === shiftedBy.current) return;
    shiftedBy.current = by;
    restore.shift(by);
  });

  // 手機點了一筆：上面開著的另一筆收起來、或最上面的卡片搬下來時，這一列會往上跳——先放回手指點的位置，再捲到導覽列下方
  useLayoutEffect(() => {
    const tap = tapped.current;
    if (!tap || tap.id !== selected || spot === "top") return;
    tapped.current = null;
    const row = rowOf(tap.id);
    if (!row) return;
    const drift = row.getBoundingClientRect().top - tap.top;
    if (Math.abs(drift) >= 1) window.scrollBy({ top: drift, behavior: "instant" });
    requestAnimationFrame(() => row.scrollIntoView({ behavior: glide(), block: "start" }));
  }, [selected, spot]);

  // 收起之後：把那一列放回導覽列下方，接著往下看（細節原本放在清單最上面的話，就回到清單開頭）。
  // 用返回收的，瀏覽器會在這之後還原點之前的位置，所以等到下一個畫面前再放，畫面不會先跳一下
  useLayoutEffect(() => {
    const done = collapsed.current;
    if (!done || selected === done.id) return;
    collapsed.current = null;
    const place = () => {
      // 卡片原本放在最上面：回到清單開頭——那一筆後來載進清單了也一樣，不跳到清單中間
      let row = done.spot === "top" ? null : rowOf(done.id);
      // 展開在那一列下面、收起後那一列不在清單上了（例如任務打了勾就不列）：接著看原本緊接在後面的那一列。
      // 清單這時才重排（例如原本要先做它的列跳到前面），原位置現在可能是別的列，所以先認那一列的 id，認不到才看原位置現在是哪一列；
      // 收起的是最後一列、後面沒有列了，就看前一列，不跳回清單開頭
      if (!row && done.spot === "inline") {
        row = done.nextId ? rowOf(done.nextId) : null;
        if (!row && done.y !== null) {
          const y = done.y;
          row = [...(listRef.current?.querySelectorAll<HTMLElement>(":scope > li[id^='db-row-']") ?? [])]
            .find(li => li.getBoundingClientRect().top + window.scrollY >= y - 1) ?? null;
        }
        if (!row && done.prevId) row = rowOf(done.prevId);
      }
      (row ?? listRef.current)?.scrollIntoView({ block: "start", behavior: "instant" });
      // 收起按鈕不見了，焦點放回那一列（回到清單開頭的話放第一列），用鍵盤、讀螢幕的人才不會迷路
      (row ?? listRef.current)?.querySelector("button")?.focus({ preventScroll: true });
    };
    if (done.byBack) requestAnimationFrame(place);
    else place();
  }, [selected]);

  // 桌機右邊換了一筆：新點的、從連結來的，那一欄從卡片頂端開始看；重新整理、按返回、下一頁回到這一筆，
  // 照這筆紀錄記的捲回原本讀到的地方。卡片畫出來（資料載好）才捲得到。
  // 從清單點的，那一欄被往上推走一截時（清單到底）再讓卡片頂端出來
  useLayoutEffect(() => {
    if (spot !== "side" || !hasDetail) return;
    detailRef.current?.scrollTo({ top: sideTopFor(window.history.state, selected, page), behavior: "instant" });
    if (!sideRevealPending.current) return;
    sideRevealPending.current = false;
    revealSide();
  }, [selected, spot, hasDetail, page, revealSide]);

  /** 右邊那一欄捲動停下來，把捲到哪裡記進這一筆紀錄 */
  const recordSideSoon = useCallback(() => {
    window.clearTimeout(sideScrollTimer.current);
    sideScrollTimer.current = window.setTimeout(() => {
      const side = detailRef.current;
      const id = openIdNow();
      // 網址已經換成別筆、那一欄還是舊的：不記，免得把舊卡片捲到哪裡記進新的那一筆
      if (!side || !id || id !== selectedNow.current) return;
      const next = withSide(window.history.state, { id, page: pageNow.current, top: Math.round(side.scrollTop) });
      if (!next) return;
      try {
        window.history.replaceState(next, "");
      } catch {
        // 瀏覽器限制短時間內改紀錄的次數：這次記不到，下次捲動停下來再記
      }
    }, 150);
  }, []);
  useEffect(() => () => window.clearTimeout(sideScrollTimer.current), []);

  /**
   * 卡片裡連到同一頁另一筆的連結（例如任務的「要先完成」）：換網址但頁面不捲回最上面——
   * 桌機右邊那一欄直接換成那一筆、從卡片頂端開始；手機照「從連結來的」跳到那一筆（上面的 effect）。
   * 在卡片外框先攔下來（Next 的 Link 看到已經攔下就不自己換頁）；開新分頁、連到別頁的照原本的做法
   */
  const stayOnPage = useCallback(
    (event: React.MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || event.defaultPrevented) return;
      const to = samePageTarget({ href: link.href, target: link.target, download: link.hasAttribute("download") }, event, window.location);
      if (!to) return;
      event.preventDefault();
      // 跟從清單點一筆一樣：右邊那一欄被頁尾往上推走時（清單到底），新的那一筆畫出來後頁面往上一點，讓卡片頂端出來
      if (isWide()) sideRevealPending.current = true;
      router.push(to, { scroll: false });
    },
    [router],
  );

  // 網址的 id 是從連結來的——直接打開網址、細節裡連到同一頁的另一筆（例如任務的「要先完成」）——
  // 手機、平板跳到那一筆；桌機左右兩欄，細節本來就在畫面上，不捲。
  useEffect(() => {
    if (loading || !selected) return;
    if (pickedFromList.current) {
      pickedFromList.current = false;
      return;
    }
    if (cameFromHistory()) {
      // 按上一頁／下一頁換的交給瀏覽器還原位置。記憶是整頁共用，中途在別處改過搜尋、篩選的話清單跟離開時不同，
      // 還原的位置會對不上：瀏覽器還原完的下一個畫面前比一次，清單變了、而且那一筆和卡片都不在畫面上，才直接跳過去
      const left = cardOf(window.history.state);
      if (!hasDetail || isWide() || left?.id !== selected || left.page !== page) return;
      rescuing.current = true;
      const frame = requestAnimationFrame(() => {
        rescuing.current = false;
        const block = cardBlock(selected);
        if (!block) return;
        const { top, bottom } = block.getBoundingClientRect();
        const viewTop = siteHeader()?.getBoundingClientRect().bottom ?? 0;
        if (needsRescue({ leftAt: left.at, nowAt: top + window.scrollY, top, bottom, viewTop, viewBottom: window.innerHeight })) {
          block.scrollIntoView({ block: "start", behavior: "instant" });
        }
        recordCardAt(selected);
      });
      return () => {
        rescuing.current = false;
        cancelAnimationFrame(frame);
      };
    }
    // 重新整理、離站再返回：位置由 reload-scroll 放回離開時讀到的地方（卡片搬家時上面已經跟著挪），不跳到卡片頂端
    if (reloadRestore()?.restoring()) return;
    if (!hasDetail || isWide()) return;
    // 卡片在哪就跳到哪（沒記到位置的重新整理也是：照紀錄放在最上面的，那一列就算也在清單上，也跳到卡片）。
    // instant：全站開了平滑捲動，不指定會從頂端一路滑三千多 px 下來
    (cardBlock(selected) ?? rowOf(selected) ?? topRef.current)?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [loading, selected, hasDetail, page, cardBlock, recordCardAt]);

  // 每次畫完都記一次卡片的位置（沒變就不寫）：離開這一筆時，紀錄裡就是離開那一刻的位置
  useEffect(() => {
    if (!rescuing.current) recordCardAt(selected);
  });

  // 捲到離清單底部約一個畫面，就自動接下一批（接到 600 筆就停，之後按「再載」）。
  // 多載完重新看一次：畫面很高、接上之後還在範圍內就再接
  const total = matches.length;
  useEffect(() => {
    const sentinel = moreRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        setVisible(value => {
          const batch = moreRows(value, total);
          return batch?.mode === "auto" ? batch.next : value;
        });
      },
      { rootMargin: "0px 0px 100% 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visible, total, loading, setVisible]);

  const more = moreRows(visible, total);
  const loadMore = () => {
    loadedFrom.current = visible;
    setVisible(value => moreRows(value, total)?.next ?? value);
  };
  // 按「再載」把剩下的全載完、按鈕不見了：焦點移到新載的第一筆，用鍵盤、讀螢幕的人才不會被丟回頁首
  useEffect(() => {
    const from = loadedFrom.current;
    if (from === null) return;
    loadedFrom.current = null;
    if (more) return;
    listRef.current?.querySelectorAll<HTMLButtonElement>(":scope > li > button")[from]?.focus({ preventScroll: true });
  });

  return (
    <div className="space-y-4 py-3 sm:py-6">
      <nav aria-label="麵包屑" className="flex items-center gap-1 text-sm ink-faint">
        <Link href="/" className="hover:text-[color:var(--maple)]">我的路線</Link>
        <ChevronRight size={13} />
        <span className="text-[color:var(--ink-soft)]">{title}</span>
      </nav>

      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">{title}</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">{lead}</p>
      </header>

      <div className="space-y-2.5 rounded-[var(--radius-card)] glass wood-frame p-3.5">
        <div className="flex items-center gap-2 rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 focus-within:border-[color:var(--maple)]">
          <SearchIcon size={17} className="shrink-0 text-[color:var(--ink-faint)]" />
          <input
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder={searchPlaceholder}
            className="tap-safe w-full bg-transparent py-2.5 outline-none"
            aria-label={`搜尋${title}`}
            {...searchKeys}
          />
          {query && hydrated ? (
            <SearchClear
              onClear={() => {
                setQuery("");
                setVisible(PAGE_SIZE);
              }}
            />
          ) : null}
        </div>
        {filters}
        <p className="text-[13px] ink-faint">
          {loading ? "載入中…" : `${matches.length.toLocaleString()} 筆`}
        </p>
      </div>

      {error ? (
        <EmptyBlock title="資料載入失敗" hint={error} />
      ) : loading ? (
        <LoadingBlock />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            {/* 從連結打開、但那一筆不在目前的清單上：細節放在清單最上面 */}
            {spot === "top" ? (
              <div ref={topRef} id="db-top" onClickCapture={stayOnPage} className="scroll-mt-header space-y-2 pb-2">
                {/* 上面沒有那一列可以黏：放一顆「收起」，往下看長卡片時黏在導覽列下面 */}
                <button
                  type="button"
                  onClick={collapse}
                  aria-expanded="true"
                  aria-controls="db-top-detail"
                  className={`tap-safe flex w-full items-center justify-center gap-0.5 rounded-xl text-sm font-bold text-[color:var(--maple)] ${STUCK}`}
                >
                  收起
                  <ChevronDown size={16} className="rotate-180" />
                </button>
                <DetailWithCollapse id="db-top-detail" detail={detail} onCollapse={collapse} />
              </div>
            ) : null}
            {matches.length === 0 ? (
              <EmptyBlock title="沒有符合的結果" />
            ) : (
              <>
                <ul ref={listRef} className="scroll-mt-header space-y-1">
                  {shown.map((entry, index) => {
                    const open = spot === "inline" && selected === entry.id;
                    return (
                      <Fragment key={entry.id}>
                        {heads[index] ? (
                          // 小標不是清單的一筆：沒有 db-row- 的 id，不算進筆數、不影響展開與還原位置。
                          // 字寫成 h2，讀螢幕軟體才能用標題一組一組跳；間距跟 first:pt-1 留在 li 上
                          // （first: 放在 h2 上，它永遠是 li 的第一個子元素，每個小標都會吃到，第二組上面就擠了）
                          <li className="px-2.5 pb-0.5 pt-3 first:pt-1">
                            <h2 className="text-[12px] font-bold ink-faint">{heads[index]}</h2>
                          </li>
                        ) : null}
                        {/* scroll-mt：捲過來時讓出頂端固定的導覽列，那一列和展開的細節不會被蓋住 */}
                        <li id={`db-row-${entry.id}`} className="scroll-mt-header">
                          <button
                            type="button"
                            onClick={() => select(entry.id)}
                            aria-current={selected === entry.id ? "true" : undefined}
                            // 細節開著就算展開——放在清單最上面的也算，讀螢幕軟體才不會念「已收合」
                            aria-expanded={wide ? undefined : selected === entry.id && spot !== null}
                            className={[
                              "tap-safe flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left",
                              // 展開著的那一列黏在導覽列下面：往下看長卡片時一直看得到是哪一筆，點它就收起
                              open
                                ? STUCK
                                : selected === entry.id
                                  ? "bg-[color:var(--maple-wash)] ring-1 ring-[color:var(--maple)] transition-colors"
                                  : "transition-colors hover:bg-[color:var(--paper-deep)]",
                            ].join(" ")}
                          >
                            {entry.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={entry.image}
                                alt=""
                                width={28}
                                height={28}
                                loading="lazy"
                                className="size-7 shrink-0 object-contain"
                              />
                            ) : (
                              <span className="size-7 shrink-0" />
                            )}
                            <span className="min-w-0 flex-1 truncate font-bold">{entry.name}</span>
                            {entry.badge}
                            {open ? (
                              // 讀螢幕軟體從 aria-expanded 就知道開著，不用再念一次
                              <span aria-hidden="true" className="flex shrink-0 items-center gap-0.5 text-sm font-bold text-[color:var(--maple)]">
                                收起
                                <ChevronDown size={16} className="rotate-180" />
                              </span>
                            ) : entry.note ? (
                              <span className="shrink-0 text-[11px] tabular-nums ink-faint">{entry.note}</span>
                            ) : null}
                          </button>
                          {open ? (
                            <div onClickCapture={stayOnPage} className="mt-2 pb-2">
                              <DetailWithCollapse detail={detail} onCollapse={collapse} />
                            </div>
                          ) : null}
                        </li>
                      </Fragment>
                    );
                  })}
                </ul>
                {more ? (
                  <>
                    {/* 捲到這附近就自動接下一批（上面的 effect 看著它）；接到 600 筆就拿掉，改按下面那顆 */}
                    {more.mode === "auto" ? <div ref={moreRef} aria-hidden="true" className="h-px" /> : null}
                    {/*
                      自動接的時候：讀螢幕軟體不會捲動，留一顆平常看不到的「再載」，用鍵盤移到這裡才出現。
                      接到 600 筆以後：看得到的「再載」，按了才多載，頁尾才滑得到。兩種是同一顆按鈕，換的時候焦點不會掉
                    */}
                    <button
                      type="button"
                      onClick={loadMore}
                      className={
                        more.mode === "auto"
                          ? "sr-only rounded-xl bg-[color:var(--paper-deep)] text-sm font-bold ink-soft focus-visible:not-sr-only focus-visible:tap-safe focus-visible:w-full focus-visible:py-2.5"
                          : "tap-safe w-full rounded-xl bg-[color:var(--paper-deep)] py-2.5 text-sm font-bold ink-soft hover:text-[color:var(--maple)]"
                      }
                    >
                      再載 {more.count} 筆
                    </button>
                  </>
                ) : null}
              </>
            )}
          </div>

          {spot === "side" ? (
            // 桌機右邊那一欄黏在導覽列下面；卡片比畫面長時在這一欄裡自己捲——清單捲到很下面再點一筆，頁面不用跳回上面。
            // -m-2 p-2：捲動的框往外多留一點，卡片的陰影不會被切掉；捲軸的位置先留著，卡片長短換來換去寬度不會跳
            <div
              ref={detailRef}
              id="db-side"
              onScroll={recordSideSoon}
              onClickCapture={stayOnPage}
              className="min-w-0 lg:sticky lg:top-[calc(var(--header-offset)+0.25rem)] lg:-m-2 lg:max-h-[calc(100dvh-var(--header-offset)-0.5rem)] lg:self-start lg:overflow-y-auto lg:p-2 lg:transition-[top] lg:duration-200 lg:ease-out lg:[scrollbar-gutter:stable] lg:[scrollbar-width:thin]"
            >
              {selected ? (
                detail
              ) : (
                <EmptyBlock title="左邊選一個看細節" hint="也可以直接搜尋名稱或 ID。" />
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** 手機、平板的細節：卡片下面一顆「收起」，看完長長的一張不用自己滑回去（收起後那一列放回導覽列下方，下一筆就在下面） */
function DetailWithCollapse({ id, detail, onCollapse }: { id?: string; detail: React.ReactNode; onCollapse: () => void }) {
  return (
    <div id={id} className="space-y-2">
      {detail}
      <button
        type="button"
        onClick={onCollapse}
        className="tap-safe w-full rounded-xl bg-[color:var(--paper-deep)] py-2.5 text-sm font-bold ink-soft hover:text-[color:var(--maple)]"
      >
        收起
      </button>
    </div>
  );
}

export function DetailCard({ children }: { children: React.ReactNode }) {
  return (
    <article className="space-y-4 rounded-[var(--radius-card)] glass wood-frame p-4 sm:p-5">{children}</article>
  );
}

/** 每一格佔幾欄對應的 class：fill 只在手機兩欄時拉滿整排，寬螢幕四欄照樣一欄 */
const SPAN_CLASS: Record<StatSpan, string> = { one: "", two: " col-span-2", fill: " col-span-2 sm:col-span-1" };

/**
 * 數值格子：手機兩欄、寬螢幕四欄。值太長就佔兩欄，不在格子裡斷行；
 * grid-flow-row-dense 讓後面短的格子回頭補空位，不會留一個洞；
 * 手機上格子加起來是奇數時，最後一個單格拉滿整排，不空一格（statSpans）。
 */
export function StatGrid({ rows }: { rows: Array<[string, string | number]> }) {
  const spans = statSpans(rows.map(([, value]) => value));
  return (
    <dl className="grid grid-flow-row-dense grid-cols-2 gap-2 sm:grid-cols-4">
      {rows.map(([label, value], index) => (
        <div
          key={label}
          className={`rounded-xl bg-[color:var(--paper-deep)] px-3 py-2${SPAN_CLASS[spans[index]]}`}
        >
          <dt className="text-[12px] ink-faint">{label}</dt>
          {/* break-keep：擠不下時只在「、」換行，「劍士、弓箭手、盜賊」不會把盜賊切成兩行 */}
          <dd className="break-keep text-[15px] font-black tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-baseline justify-between gap-2 text-[15px] font-black">
        {title}
        {extra ? <span className="text-xs font-normal ink-faint">{extra}</span> : null}
      </h3>
      {children}
    </section>
  );
}
