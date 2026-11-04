"use client";

/**
 * 紙娃娃（/plan/avatar）：穿什麼全寫在網址（outfit.ts 的 outfitQuery／parseOutfit），
 * 這裡只負責讀網址 → 畫角色卡＋挑衣服卡（Picker.tsx），按什麼都是算出下一套再 commit 換網址。
 * 上一套、鎖不進網址：存 sessionStorage（useSessionText，純函式在 looks.ts）。換衣服、髮型、臉型、膚色、性別、隨機、重置都算一步，動作、表情、翻面不算；
 * 圖還沒畫出來就被換掉的那套也不算（連按隨機，上一套回到真的看過的）。
 * 鎖只看格子不看哪一件，那一格變空才解開；換性別時那件被換掉也解開；「重置」、開場隨機全部解開。
 * 開場隨機：這次打開時網址完全沒參數才隨機一套（opening），先畫它、網址再換過去（不記上一套），不會先閃白 T；之後按「重置」把網址弄空不會再隨機。
 * 隨機穿搭的下一套先備好（useRandomDeck），舞台畫好現在這套才預載。
 * 手機：角色卡在上、挑衣服卡在下；角色卡整張捲到頁首底下時，頁首下面跟著一條小窗（小角色＋下載、分享、回到上面）。
 * 電腦版（lg）：左右排，左邊角色卡黏著不動（比螢幕高時裡面自己捲），沒有小窗。
 * 標題、副標在 page.tsx（靜態 HTML 就有，資料載好時不跳）。
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LockIcon } from "@/components/Icons";
import { LoadingBlock } from "@/components/PlanShell";
import { liveLocks, locksAfterGender, locksText, parseLocks, peekLook, popLook, pushLook, restoreLook, shouldRemember } from "@/lib/avatar/looks";
import type { LockKey } from "@/lib/avatar/looks";
import {
  EMOS, EYE_COLORS, HAIR_COLORS, POSES, defaultOutfit, eyeColour, faceStyle, hairColour, hairStyle, itemIndex, outfitQuery, parseOutfit, setGender, takeOff,
} from "@/lib/avatar/outfit";
import type { Outfit } from "@/lib/avatar/outfit";
import { randomOutfit } from "@/lib/avatar/random";
import type { AvatarData, Gender, SlotKey } from "@/lib/avatar/types";
import { itemImage, loadAvatar, peekAvatar } from "@/lib/data";
import { CARD, SLOTS } from "./parts";
import { Picker, type TabKey } from "./Picker";
import { Stage } from "./Stage";
import { useAvatarActions } from "./useAvatarActions";
import { useRandomDeck } from "./useRandomDeck";
import { useSessionText } from "./useSessionText";

const PATH = "/plan/avatar";

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
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<AvatarData | null>(peekAvatar);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (data) return;
    loadAvatar().then(setData, () => setError(true));
  }, [data]);

  /**
   * 開場隨機："wait"＝這次打開時網址就是空的、資料還沒到；Outfit＝算好了、網址還沒換過去；null＝不隨機或已經換好。
   * 初值只看第一次畫：之後按「重置」把網址弄空不會回到 "wait"，同一頁不會自己再隨機。
   * 都在畫面當下改 state（不等 effect）：React 馬上重畫這一輪，舞台第一眼就是隨機那套，不會先畫白 T。
   */
  const clean = params.toString() === "";
  const [opening, setOpening] = useState<Outfit | "wait" | null>(clean ? "wait" : null);
  if (opening !== null && !clean) setOpening(null);
  else if (opening === "wait" && data) setOpening(randomOutfit(data, defaultOutfit(0)));

  const outfit = useMemo(() => {
    if (opening && opening !== "wait") return opening;
    return data ? parseOutfit(params, data) : null;
  }, [opening, data, params]);
  const worn = useMemo(() => (outfit && data ? wornList(outfit, data) : []), [outfit, data]);
  const { download, share, downloading, toast, showToast } = useAvatarActions(outfit, data);

  const [history, setHistory] = useSessionText("avatar:history");
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

  /** 只換網址，不記上一套（開場隨機、上一套走這條）。換回全預設時網址是空的：開場那套要馬上放掉，不然畫面還是它 */
  const go = useCallback(
    (next: Outfit) => {
      const qs = outfitQuery(next);
      if (!qs) setOpening(null);
      router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
    },
    [router],
  );

  /** 換一套：穿的不一樣、舞台也畫過現在這套才記上一套（動作、表情、翻面不算一步） */
  const commit = useCallback(
    (next: Outfit) => {
      if (outfit && shouldRemember(outfit, next, drawn.current)) {
        const pushed = pushLook(history, outfit);
        // 網址還沒換過去又按一次：outfit 還是舞台上那套（shouldRemember 擋不到），這一套剛記過，不重複記（不然上一套要多按一下才有反應）
        if (peekLook(pushed) !== peekLook(history)) setHistory(pushed);
      }
      go(next);
    },
    [outfit, history, setHistory, go],
  );

  // 開場隨機：存著的鎖清掉（這套是新抽的，不是你鎖的）；那套算好了就把網址換過去，換好之後（clean 變 false）畫面回到照網址畫。
  // "wait" 那一輪就清：跟 useSessionText 掛上去的讀取同一批更新（先讀後清，結果是空字串），第一次畫小卡就沒有鎖、不會亮一下；
  // 存的也清掉了，useSessionText 只在掛上去讀那一次，讀不回舊的。opening 收成 null 之後不再清，開場途中按的鎖留著
  useEffect(() => {
    if (opening === null) return;
    setLockText("");
    if (opening !== "wait") go(opening);
  }, [opening, go, setLockText]);

  // 查資料「穿上看看」帶 try= 進來：穿好之後網址換成正式寫法，try 不留著（不然之後改什麼都會被它蓋回去）。
  // 用 go 不用 commit：commit 跟著上一套變，這裡會重跑，網址換到一半可能把使用者剛按的隨機蓋回去
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
    if (next) commit(next);
  };

  /** 回到上一套：動作、表情、翻面用現在的；這一步不再記（沒有下一套） */
  const back = () => {
    const query = peekLook(history);
    if (query === null) return;
    setHistory(popLook(history));
    go(restoreLook(query, outfit, data));
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
          <Stage outfit={outfit} data={data} onBusy={setChanging} onReady={stageReady} />

          <div className="mt-3 flex items-center justify-between gap-2">
            <div role="group" aria-label="性別" className="grid grid-cols-2 gap-1 rounded-full bg-[color:var(--paper-deep)] p-1">
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

          <div role="group" aria-label="動作" className="mt-2 grid grid-cols-6 gap-1 rounded-full bg-[color:var(--paper-deep)] p-1">
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
              <Action off={peekLook(history) === null} onClick={back}>
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

        <Picker ref={picker} data={data} outfit={outfit} tab={tab} onTab={setTab} onChange={commit} toast={showToast} />
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
            <Stage outfit={outfit} data={data} compact />
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
          <div className="flex min-h-11 items-center rounded-full bg-[color:var(--ink)] px-4 text-[14px] font-bold text-[color:var(--paper)] shadow-lg">
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
      className={`min-h-[34px] whitespace-nowrap rounded-full text-[14px] ${wide ? "px-4" : "px-1"} ${
        on ? "bg-[color:var(--maple)] font-black text-[color:var(--on-accent)]" : "font-bold ink-soft"
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
      className={`inline-flex min-h-[34px] shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-[14px] font-bold ${
        on ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]" : "border border-[color:var(--paper-edge)] bg-[color:var(--paper)]"
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
        primary
          ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]"
          : "border border-[color:var(--paper-edge)] bg-[color:var(--paper)]"
      }`}
    >
      {children}
    </button>
  );
}
