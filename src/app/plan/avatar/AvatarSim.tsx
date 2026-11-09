"use client";

/**
 * 紙娃娃（/plan/avatar）：穿什麼全寫在網址（outfit.ts 的 outfitQuery／parseOutfit），
 * 這裡只負責讀網址 → 畫角色卡＋挑衣服卡（Picker.tsx），按什麼都是算出下一套再 commit 換網址。
 * 上一套、鎖不進網址：存 sessionStorage（useSessionText，純函式在 looks.ts）。換衣服、髮型、臉型、膚色、性別、隨機、重置都算一步，動作、表情、翻面不算；
 * 圖還沒畫出來就被換掉的那套也不算（連按隨機，上一套回到真的看過的）。
 * 鎖只看格子不看哪一件，那一格變空才解開；換性別時那件被換掉也解開；「重置」、開場隨機、帶 try= 進來全部解開。
 * 同一分頁回來穿的是離開時那套：舞台畫好就把這套存進 avatar:last。打開時網址完全沒參數：存過就穿回那套（白 T 也算存過、鎖留著）；
 * 沒存過（這個分頁第一次來）才隨機一套。都是先畫它、網址再換過去（不記上一套），不會先閃白 T；之後按「重置」把網址弄空不會再隨機。
 * 打開時網址帶穿搭（?try=、分享連結）又跟存的那套不一樣：存的那套記進上一套，按上一套回得去。
 * 首頁輪播的「抽一套」帶 ?draw=1：不管存過什麼都抽新的（存的那套一樣記進上一套），換好之後網址不留 draw。
 * 換穿搭不跟伺服器要東西：畫面先換（shown）、網址用 history.replaceState 換，useSearchParams 會跟上（這一頁沒有伺服器資料依賴網址參數）。
 * 隨機穿搭的下一套先備好（useRandomDeck），舞台畫好現在這套才預載。
 * 手機：角色卡在上、挑衣服卡在下；角色卡整張捲到頁首底下時，頁首下面跟著一條小窗（小角色＋下載、分享、回到上面）。
 * 電腦版（lg）：左右排，左邊角色卡黏著不動（比螢幕高時裡面自己捲），沒有小窗。
 * 標題、副標在 page.tsx（靜態 HTML 就有，資料載好時不跳）。
 */
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LockIcon } from "@/components/Icons";
import { LoadingBlock } from "@/components/PlanShell";
import { backLook, liveLocks, locksAfterGender, locksText, parseLocks, peekLook, pushLook, rememberLast, restoreLook, shouldRemember } from "@/lib/avatar/looks";
import type { LockKey } from "@/lib/avatar/looks";
import {
  EMOS, EYE_COLORS, HAIR_COLORS, POSES, defaultOutfit, eyeColour, faceStyle, hairColour, hairStyle, itemIndex, outfitQuery, parseOutfit, setGender, takeOff,
} from "@/lib/avatar/outfit";
import type { Outfit } from "@/lib/avatar/outfit";
import { randomOutfit } from "@/lib/avatar/random";
import { stageUrl } from "@/lib/avatar/render";
import type { AvatarData, Gender, SlotKey } from "@/lib/avatar/types";
import { itemImage, loadAvatar, peekAvatar } from "@/lib/data";
import { CARD, SLOTS } from "./parts";
import { Picker, type TabKey } from "./Picker";
import { Stage } from "./Stage";
import { useAvatarActions } from "./useAvatarActions";
import { useRandomDeck } from "./useRandomDeck";
import { readSessionText, useSessionText, writeSessionText } from "./useSessionText";
import { OPTION_OFF, OPTION_ON } from "@/components/option-style";

const PATH = "/plan/avatar";
/** 這個分頁最後畫好的那一套（outfitQuery，含動作、表情、翻面；白 T 是空字串，沒存過是沒有這個 key） */
const LAST_KEY = "avatar:last";
const HISTORY_KEY = "avatar:history";

/**
 * 只換網址，不換瀏覽紀錄、不跟伺服器要東西。state 要傳 null：Next 改過的 replaceState 看到帶 __NA 的 state（window.history.state 就是）
 * 會當成自己人直接放行，useSearchParams 不會跟著變；傳 null 它會自己補回 __NA 跟路由樹（查資料 DbBrowser 也這樣用）。
 */
function writeUrl(o: Outfit) {
  const qs = outfitQuery(o);
  window.history.replaceState(null, "", qs ? `${PATH}?${qs}` : PATH);
}

const GENDERS: { g: Gender; label: string }[] = [
  { g: 0, label: "男" },
  { g: 1, label: "女" },
];

/**
 * 身上穿了什麼的一張小卡；key 也是鎖的那一格；slot 有值＝裝備，點了脫掉；tab 有值＝髮型、臉型、膚色，點了跳到挑衣服卡那一頁；
 * fallback＝這個顏色沒有小圖時改用的那張
 */
type Worn = { key: LockKey; label: string; name: string; icon: number; fallback?: number; slot?: SlotKey; tab?: TabKey };

function wornList(o: Outfit, data: AvatarData): Worn[] {
  const out: Worn[] = [];
  const hair = hairStyle(data, o.hair);
  if (hair) {
    const colour = HAIR_COLORS[hairColour(o.hair)]?.n;
    out.push({ key: "hair", label: "髮型", name: colour ? `${hair.n}・${colour}` : hair.n, icon: o.hair, fallback: hair.ic, tab: "hair" });
  }
  const face = faceStyle(data, o.face);
  if (face) {
    const colour = EYE_COLORS[eyeColour(o.face)]?.n;
    out.push({ key: "face", label: "臉型", name: colour ? `${face.n}・${colour}` : face.n, icon: o.face, fallback: face.ic, tab: "face" });
  }
  const skin = data.skin.find((s) => s.id === o.skin);
  if (skin) out.push({ key: "skin", label: "膚色", name: skin.n, icon: skin.id + 10000, tab: "skin" });
  const items = itemIndex(data);
  for (const { k, label } of SLOTS) {
    const id = o.wear[k];
    const item = id === undefined ? undefined : items.get(id);
    if (item) out.push({ key: k, label, name: item.n, icon: item.id, slot: k });
  }
  return out;
}

export function AvatarSim() {
  const params = useSearchParams();
  const [data, setData] = useState<AvatarData | null>(peekAvatar);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (data) return;
    loadAvatar().then(setData, () => setError(true));
  }, [data]);

  const query = params.toString();
  /**
   * 打開時存的那一套（只讀這一次，舞台之後再存不影響；null＝這個分頁第一次來）。伺服器上讀不到也是 null：
   * 要等 data 到了才用得到，data 只會在瀏覽器上有，不會有 hydration 差異。
   */
  const [lastAtOpen] = useState(() => readSessionText(LAST_KEY));
  /** 這次打開存著的鎖要不要清：開場隨機、帶 try= 進來穿的不是你鎖的那套（沒鎖過的預設髮型亮著鎖、按隨機不換，看起來像鎖失效）；穿回存的那套、分享連結落地留著 */
  /** 首頁輪播按「抽一套」進來（?draw=1）：不管存過什麼都抽新的，男女各半，換過去之後網址不留 draw */
  const [drawAtOpen] = useState(() => params.has("draw"));
  const [dropLocks] = useState(() => drawAtOpen || params.has("try") || (query === "" && lastAtOpen === null));
  /** 隨機穿搭抽了幾次（舞台看這個跳格）：開場那套是抽的就從 1 開始 */
  const [rollKey, setRollKey] = useState(() => (drawAtOpen || (query === "" && lastAtOpen === null) ? 1 : 0));

  /**
   * 畫面先照這一套畫，不等網址：
   * "wait"＝這次打開時網址就是空的、資料還沒到；Outfit＝開場那套，或剛換的這套 useSearchParams 還沒跟上（它走 transition，手機慢的時候要一下子）；null＝照網址畫。
   * 不等網址才接得住連點：第二下是接著第一下算的，不然第一件會掉。
   * 初值只看第一次畫：之後按「重置」把網址弄空不會回到 "wait"，同一頁不會自己再隨機。
   * 都在畫面當下改 state（不等 effect）：React 馬上重畫這一輪，舞台第一眼就是那套，不會先畫白 T。
   */
  const [shown, setShown] = useState<Outfit | "wait" | null>(query === "" || drawAtOpen ? "wait" : null);
  if (shown === "wait") {
    if (drawAtOpen) {
      if (data) setShown(randomOutfit(data, defaultOutfit(Math.random() < 0.5 ? 0 : 1)));
    } else if (query !== "") setShown(null);
    else if (data) setShown(lastAtOpen === null ? randomOutfit(data, defaultOutfit(0)) : parseOutfit(new URLSearchParams(lastAtOpen), data));
  } else if (shown && outfitQuery(shown) === query) setShown(null);

  const outfit = useMemo(() => {
    if (shown && shown !== "wait") return shown;
    return data ? parseOutfit(params, data) : null;
  }, [shown, data, params]);
  const worn = useMemo(() => (outfit && data ? wornList(outfit, data) : []), [outfit, data]);
  const { download, share, downloading, toast, showToast } = useAvatarActions(outfit, data);

  const [history, setHistory] = useSessionText(HISTORY_KEY);
  const [lockText, setLockText] = useSessionText("avatar:locks");
  const locks = useMemo(() => (outfit ? liveLocks(parseLocks(lockText), outfit) : new Set<LockKey>()), [lockText, outfit]);
  // 那一格變空（手動脫掉、互斥規則、換性別脫掉、網址本來就沒穿）鎖就解開：存的字串也改掉，之後再穿上那一格不會自己鎖回去。
  // 看結果不看動作，每條路都蓋得到；剛掛上去還沒讀到存的字串時是空字串，不會把存的蓋掉
  useEffect(() => {
    if (!outfit) return;
    const kept = locksText(locks);
    if (kept !== lockText) setLockText(kept);
  }, [outfit, locks, lockText, setLockText]);

  const deck = useRandomDeck(data, outfit, locks);
  /** 舞台最後畫好的那一套（還沒畫過是 null）：只有真的畫出來的才記上一套 */
  const drawn = useRef<Outfit | null>(null);
  /** 舞台最後畫好的第 0 格網址 */
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  // 舞台上就是這一套才存進 avatar:last。比網址不比穿搭：全身男女都能穿時換性別，圖一模一樣、舞台不會再通知，但這一套也算畫過
  useEffect(() => {
    if (outfit && data && readyUrl === stageUrl(outfit, data, 0)) writeSessionText(LAST_KEY, outfitQuery(outfit));
  }, [outfit, data, readyUrl]);
  /** 換裝中（舞台通知）：「隨機穿搭」的字跟著變，還是按得下去 */
  const [changing, setChanging] = useState(false);
  // 挑衣服卡在哪一頁：不進網址，重新整理回到髮型
  const [tab, setTab] = useState<TabKey>("hair");
  const picker = useRef<HTMLElement>(null);
  // 角色卡用 state 接（資料載好才掛上去，掛上去才開始看它有沒有捲出去）
  const [card, setCard] = useState<HTMLElement | null>(null);
  const mini = useScrolledPast(card);
  // 穿了什麼小卡要跳去哪一頁（n 每按一次加 1：已經在那一頁再按也會捲）
  const [jumpTo, setJumpTo] = useState<{ tab: TabKey; n: number } | null>(null);
  // 新分頁畫好之後才捲過去，焦點放到那顆分頁上（用 data-tab 找，見 Picker）
  useEffect(() => {
    const el = picker.current;
    if (!jumpTo || !el) return;
    el.scrollIntoView({ block: "start", behavior: "instant" });
    el.querySelector<HTMLElement>(`[data-tab="${jumpTo.tab}"]`)?.focus({ preventScroll: true });
  }, [jumpTo]);

  /** 換一套，不記上一套（上一套、try= 走這條）：畫面馬上換，網址同一下換好（等 effect 來不及：換回網址上那套時 shown 這一輪就收掉了） */
  const go = useCallback((next: Outfit) => {
    setShown(next);
    writeUrl(next);
  }, []);

  /** 換一套：穿的不一樣、舞台也畫過現在這套才記上一套（動作、表情、翻面不算一步） */
  const commit = useCallback(
    (next: Outfit) => {
      if (outfit && shouldRemember(outfit, next, drawn.current)) {
        const pushed = pushLook(history, outfit);
        // 換到一半又換回舞台上那套再換別套：這一套剛記過，不重複記
        if (peekLook(pushed) !== peekLook(history)) setHistory(pushed);
      }
      go(next);
    },
    [outfit, history, setHistory, go],
  );

  // 清鎖（dropLocks）：掛上去那一輪就清，跟 useSessionText 掛上去的讀取同一批更新（先讀後清，結果是空字串），第一次畫小卡就沒有鎖、不會亮一下；
  // 存的也清掉了，useSessionText 只在掛上去讀那一次，讀不回舊的。只有這一輪，開場途中按的鎖留著
  useEffect(() => {
    if (dropLocks) setLockText("");
  }, [dropLocks, setLockText]);

  // 開場那套（畫面算到一半決定的）還不在網址上：換過去，換好之後（useSearchParams 跟上）畫面回到照網址畫。go 已經換好的這裡不會再換一次
  useEffect(() => {
    if (shown && shown !== "wait" && outfitQuery(shown) !== location.search.slice(1)) writeUrl(shown);
  }, [shown]);

  // 帶穿搭的網址打開（畫得出來才算）：存的那套記進上一套。history 這時可能還是掛上去之前的空字串，直接讀存的，才不會把存的歷史蓋掉
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current || !outfit || !data) return;
    arrived.current = true;
    const saved = readSessionText(HISTORY_KEY) ?? "";
    const next = rememberLast(saved, lastAtOpen, outfit, data);
    if (next !== saved) setHistory(next);
  }, [outfit, data, lastAtOpen, setHistory]);

  // 查資料「穿上看看」帶 try= 進來：穿好之後網址換成正式寫法，try 不留著（不然之後改什麼都會被它蓋回去）
  const hasTry = params.has("try");
  useEffect(() => {
    if (outfit && hasTry) go(outfit);
  }, [outfit, hasTry, go]);

  if (error) return <p className={`${CARD} text-center text-[15px] ink-soft`}>紙娃娃資料讀不到，等一下再過來重新整理。</p>;
  if (!data || !outfit) return <LoadingBlock label="載入紙娃娃…" />;

  /** 穿了什麼的髮型、臉型、膚色小卡：切到那一頁，畫好後捲到挑衣服卡（不用動畫，馬上到） */
  const jump = (t: TabKey) => {
    setTab(t);
    setJumpTo((j) => ({ tab: t, n: (j?.n ?? 0) + 1 }));
  };

  /** 舞台畫好這一套的第 0 格：記下來（上一套要看），隨機穿搭也可以開始預載下一套 */
  const stageReady = () => {
    drawn.current = outfit;
    setReadyUrl(stageUrl(outfit, data, 0));
    deck.stageReady();
  };

  /** 換性別：鎖住的那件被脫掉或換成預設就解開，留得下來的繼續鎖 */
  const changeGender = (g: Gender) => {
    const next = setGender(outfit, g, data);
    setLockText(locksText(locksAfterGender(locks, outfit, next)));
    commit(next);
  };

  const random = () => {
    const next = deck.draw();
    if (!next) return;
    setRollKey((n) => n + 1);
    commit(next);
  };

  /** 回到上一套：動作、表情、翻面用現在的；這一步不再記（沒有下一套） */
  const back = () => {
    const prev = backLook(history, outfit);
    if (!prev) return;
    setHistory(prev.rest);
    go(restoreLook(prev.query, outfit, data));
  };

  const reset = () => {
    setLockText("");
    commit(defaultOutfit(outfit.g));
  };

  const toggleLock = (k: LockKey) => {
    const next = new Set(locks);
    if (!next.delete(k)) next.add(k);
    setLockText(locksText(next));
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-5">
        <section ref={setCard} className={`${CARD} lg:sticky lg:top-[80px] lg:max-h-[calc(100dvh-96px)] lg:overflow-y-auto`} aria-label="角色">
          <Stage outfit={outfit} data={data} rollKey={rollKey} onBusy={setChanging} onReady={stageReady} />

          <div className="mt-3 flex items-center justify-between gap-2">
            <div role="group" aria-label="性別" className="grid grid-cols-2 gap-1 rounded-md bg-[color:var(--paper-deep)] p-1">
              {GENDERS.map(({ g, label }) => (
                <Segment key={g} on={outfit.g === g} onClick={() => changeGender(g)} wide>
                  {label}
                </Segment>
              ))}
            </div>
            <Pill on={outfit.flip} onClick={() => commit({ ...outfit, flip: !outfit.flip })}>
              翻面
            </Pill>
          </div>

          <div role="group" aria-label="動作" className="mt-2 grid grid-cols-6 gap-1 rounded-md bg-[color:var(--paper-deep)] p-1">
            {POSES.map((p) => (
              <Segment key={p.key} on={outfit.pose === p.key} onClick={() => commit({ ...outfit, pose: p.key })}>
                {p.label}
              </Segment>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span id="avatar-emo" className="shrink-0 text-[13px] font-bold ink-soft">
              表情
            </span>
            <div role="group" aria-labelledby="avatar-emo" className="scroll-x flex min-w-0 gap-1.5 pb-0.5">
              {EMOS.map((e) => (
                <Pill key={e.key} on={outfit.emo === e.key} onClick={() => commit({ ...outfit, emo: e.key })}>
                  {e.label}
                </Pill>
              ))}
            </div>
          </div>

          <div className="mt-3 grid gap-2">
            <div className="grid grid-cols-[2fr_1fr] gap-2">
              <Action onClick={random}>{changing ? "換裝中…" : "隨機穿搭"}</Action>
              <Action off={backLook(history, outfit) === null} onClick={back}>
                上一套
              </Action>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Action onClick={reset}>重置</Action>
              <Action onClick={download} busy={downloading}>
                下載
              </Action>
              <Action primary onClick={share}>
                分享
              </Action>
            </div>
          </div>

          <div className="mt-3.5 flex items-baseline gap-2">
            <h2 className="text-[14px] font-black">穿了什麼</h2>
            <span className="text-[12px] ink-faint">點鎖頭鎖住，點小卡脫掉</span>
          </div>
          <ul aria-label="穿了什麼" className="mt-1.5 grid grid-cols-2 gap-1.5">
            {worn.map((w) => (
              <WornCard
                key={w.key}
                worn={w}
                locked={locks.has(w.key)}
                onClick={() => (w.slot ? commit(takeOff(outfit, w.slot)) : w.tab && jump(w.tab))}
                onLock={() => toggleLock(w.key)}
              />
            ))}
          </ul>
        </section>

        <Picker ref={picker} data={data} outfit={outfit} tab={tab} onTab={setTab} onChange={commit} toast={showToast} resetSearch={jumpTo?.n} />
      </div>

      {/*
        小窗：角色卡整張捲到頁首底下才出來；頁首收起來時跟著貼到最上面。電腦版角色卡黏著，不出小窗。
        一直掛著、只切看得到看不到：小舞台不用每次出來都重新要圖、重算 15 秒逾時。收著時 inert（按不到、Tab 跳不到、讀屏不唸）。
        外層透明的那圈不吃點擊（點得到底下的格子），只有那條小窗本身接點擊
      */}
      <div
        inert={!mini}
        className={`pointer-events-none fixed inset-x-0 top-[var(--header-offset)] z-30 px-4 pt-2 transition-[top] duration-200 ease-out sm:px-6 lg:hidden ${
          mini ? "visible" : "invisible"
        }`}
      >
        <div role="region" aria-label="角色小窗" className="pointer-events-auto mx-auto flex max-w-2xl gap-2 rounded-[var(--radius-card)] glass-solid p-2">
          <div className="min-w-0 flex-1">
            <Stage outfit={outfit} data={data} rollKey={rollKey} compact />
          </div>
          <div className="grid w-[136px] shrink-0 grid-cols-2 grid-rows-2 gap-1.5">
            <Action onClick={download} busy={downloading}>
              下載
            </Action>
            <Action primary onClick={share}>
              分享
            </Action>
            <div className="col-span-2 grid">
              <Action onClick={() => window.scrollTo({ top: 0, behavior: "instant" })}>回到上面</Action>
            </div>
          </div>
        </div>
      </div>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {toast ? (
          <div className="flex min-h-11 items-center rounded-md bg-[color:var(--ink)] px-4 text-[14px] font-bold text-[color:var(--paper)] shadow-lg">
            {toast}
          </div>
        ) : null}
      </div>
    </>
  );
}

/** 頁首下緣在哪：globals.css 的 --header-offset（頁首在＝它量到的高度，手機手指往下滑收起來＝0） */
const readHeaderOffset = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-offset")) || 0;
/** SiteHeader 改 <html> 的 style（--header-h）、data-header-hidden 時重讀 */
function subscribeHeader(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-header-hidden"] });
  return () => mo.disconnect();
}
/** 伺服器上沒有畫面可量，先當 0；掛上去馬上換成真的值，看捲動的 observer 也是那時才建 */
const useHeaderOffset = () => useSyncExternalStore(subscribeHeader, readHeaderOffset, () => 0);

/**
 * 角色卡整張捲到頁首底下了沒（往下捲過去才算；還沒捲到的不算）。
 * 看的範圍上緣扣掉頁首（當下的 --header-offset）：角色卡被頁首蓋住就當看不到了；
 * 頁首收起來時上緣是 0，角色卡還露在螢幕上就不出小窗。頁首位置一變就重新看。
 */
function useScrolledPast(el: HTMLElement | null) {
  const [past, setPast] = useState(false);
  const offset = useHeaderOffset();
  useEffect(() => {
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setPast(!entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? offset)),
      { rootMargin: `-${offset}px 0px 0px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, offset]);
  return past;
}

/** 一條底槽裡的一顆（性別、動作），選中的那顆實心 */
function Segment({ on, onClick, wide, children }: { on: boolean; onClick: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-[34px] whitespace-nowrap rounded-md border text-[14px] ${wide ? "px-4" : "px-1"} ${
        on ? `${OPTION_ON} font-black` : "border-transparent font-bold ink-soft hover:text-[color:var(--ink)]"
      }`}
    >
      {children}
    </button>
  );
}

/** 膠囊（表情、翻面），選中／開著是實心 */
function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-[34px] shrink-0 items-center whitespace-nowrap rounded-md border px-3.5 text-[14px] font-bold ${
        on ? OPTION_ON : OPTION_OFF
      }`}
    >
      {children}
    </button>
  );
}

/**
 * 穿了什麼的一張小卡：左邊小圖、中間類別＋名字（最多兩行）、右邊鎖頭。本體跟鎖頭是並排的兩顆按鈕（不能巢狀）。
 * 本體：裝備點了脫掉，髮型、臉型、膚色點了跳到那一頁。鎖住的那張楓葉色框＋淡底、鎖頭實心
 */
function WornCard({ worn, locked, onClick, onLock }: { worn: Worn; locked: boolean; onClick: () => void; onLock: () => void }) {
  return (
    <li
      className={`flex min-w-0 rounded-[14px] border ${
        locked ? "border-[color:var(--maple)] bg-[color:var(--maple-wash)]" : "border-[color:var(--paper-edge)] bg-[color:var(--paper)]"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={worn.slot ? `脫掉${worn.label}：${worn.name}` : `換${worn.label}：${worn.name}`}
        className="tap-safe flex min-w-0 flex-1 items-center gap-1.5 rounded-l-[13px] py-1 pl-1.5 text-left"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 像素小圖，用原圖不經過最佳化 */}
        <img
          // 換一件就重新掛一張，「已經換過備用圖」的記號不會帶到下一件
          key={worn.icon}
          src={itemImage(worn.icon)}
          alt=""
          width={28}
          height={28}
          loading="lazy"
          className="shrink-0"
          style={{ width: 28, height: 28, imageRendering: "pixelated", objectFit: "contain" }}
          onError={(e) => {
            // 這個顏色沒有小圖：換成那一款的小圖，只換一次（備用圖也壞就算了，不會一直重試）
            const img = e.currentTarget;
            if (worn.fallback === undefined || img.dataset.fallback) return;
            img.dataset.fallback = "1";
            img.src = itemImage(worn.fallback);
          }}
        />
        <span className="grid min-w-0 leading-tight">
          <span className="text-[12px] font-black">{worn.label}</span>
          <span className="line-clamp-2 text-[12px] ink-soft">{worn.name}</span>
        </span>
      </button>
      <button
        type="button"
        data-lock={worn.key}
        aria-pressed={locked}
        aria-label={`鎖住${worn.label}`}
        onClick={onLock}
        className={`tap-safe grid w-9 shrink-0 place-items-center rounded-r-[13px] ${locked ? "text-[color:var(--maple)]" : "ink-faint"}`}
      >
        <LockIcon open={!locked} size={16} />
      </button>
    </li>
  );
}

/** busy：正在做（下載中），游標轉圈；off：現在沒東西可按（上一套），一樣變淡但游標不轉圈 */
function Action({
  primary,
  busy,
  off,
  onClick,
  children,
}: {
  primary?: boolean;
  busy?: boolean;
  off?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || off}
      aria-busy={busy || undefined}
      className={`tap-safe whitespace-nowrap rounded-2xl px-1 text-[14px] font-black disabled:opacity-50 ${busy ? "disabled:cursor-wait" : "disabled:cursor-default"} ${
        // 實心：主要按鈕（抽一套），不是選中
        primary
          ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]"
          : "border border-[color:var(--paper-edge)] bg-[color:var(--paper)]"
      }`}
    >
      {children}
    </button>
  );
}
