"use client";

/**
 * 紙娃娃（/plan/avatar）：穿什麼全寫在網址（outfit.ts 的 outfitQuery／parseOutfit），
 * 這裡只負責讀網址 → 畫角色卡＋挑衣服卡（Picker.tsx），按什麼都是算出下一套再 commit 換網址。
 * 手機：角色卡在上、挑衣服卡在下；角色卡整張捲到頁首底下時，頁首下面跟著一條小窗（小角色＋下載、分享、回到上面）。
 * 電腦版（lg）：左右排，左邊角色卡黏著不動，沒有小窗。
 * 標題、副標在 page.tsx（靜態 HTML 就有，資料載好時不跳）。
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, CloseIcon } from "@/components/Icons";
import { LoadingBlock } from "@/components/PlanShell";
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

const PATH = "/plan/avatar";
/** 頁首高度：角色卡下緣捲過這條線就出小窗 */
const HEADER_H = 65;

const GENDERS: { g: Gender; label: string }[] = [
  { g: 0, label: "男" },
  { g: 1, label: "女" },
];

/**
 * 身上穿了什麼的一張小卡；slot 有值＝裝備，點了脫掉；tab 有值＝髮型、臉型、膚色，點了跳到挑衣服卡那一頁；
 * fallback＝這個顏色沒有小圖時改用的那張
 */
type Worn = { key: string; label: string; name: string; icon: number; fallback?: number; slot?: SlotKey; tab?: TabKey };

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

  const outfit = useMemo(() => (data ? parseOutfit(params, data) : null), [data, params]);
  const worn = useMemo(() => (outfit && data ? wornList(outfit, data) : []), [outfit, data]);
  const { download, share, downloading, toast, showToast } = useAvatarActions(outfit, data);
  // 挑衣服卡在哪一頁：不進網址，重新整理回到髮型
  const [tab, setTab] = useState<TabKey>("hair");
  const picker = useRef<HTMLElement>(null);
  // 角色卡用 state 接（資料載好才掛上去，掛上去才開始看它有沒有捲出去）
  const [card, setCard] = useState<HTMLElement | null>(null);
  const mini = useScrolledPast(card);

  const commit = useCallback(
    (next: Outfit) => {
      const qs = outfitQuery(next);
      router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
    },
    [router],
  );

  // 查資料「穿上看看」帶 try= 進來：穿好之後網址換成正式寫法，try 不留著（不然之後改什麼都會被它蓋回去）
  const hasTry = params.has("try");
  useEffect(() => {
    if (outfit && hasTry) commit(outfit);
  }, [outfit, hasTry, commit]);

  if (error) return <p className={`${CARD} text-center text-[15px] ink-soft`}>紙娃娃資料讀不到，等一下再過來重新整理。</p>;
  if (!data || !outfit) return <LoadingBlock label="載入紙娃娃…" />;

  /** 穿了什麼的髮型、臉型、膚色小卡：切到那一頁，捲到挑衣服卡（不用動畫，馬上到） */
  const jump = (t: TabKey) => {
    setTab(t);
    picker.current?.scrollIntoView({ block: "start", behavior: "instant" });
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-5">
        <section ref={setCard} className={`${CARD} lg:sticky lg:top-[80px]`} aria-label="角色">
          <Stage outfit={outfit} data={data} />

          <div className="mt-3 flex items-center justify-between gap-2">
            <div role="group" aria-label="性別" className="grid grid-cols-2 gap-1 rounded-full bg-[color:var(--paper-deep)] p-1">
              {GENDERS.map(({ g, label }) => (
                <Segment key={g} on={outfit.g === g} onClick={() => commit(setGender(outfit, g, data))} wide>
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

          <ul aria-label="穿了什麼" className="scroll-x mt-3 flex gap-2 pb-1">
            {worn.map((w) => (
              <WornChip
                key={w.key}
                worn={w}
                onClick={w.slot ? () => commit(takeOff(outfit, w.slot!)) : w.tab ? () => jump(w.tab!) : undefined}
              />
            ))}
          </ul>

          <div className="mt-3 grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2">
            <Action onClick={() => commit(randomOutfit(data, outfit))}>隨機穿搭</Action>
            <Action onClick={() => commit(defaultOutfit(outfit.g))}>重置</Action>
            <Action onClick={download} busy={downloading}>
              下載
            </Action>
            <Action primary onClick={share}>
              分享
            </Action>
          </div>
        </section>

        <Picker ref={picker} data={data} outfit={outfit} tab={tab} onTab={setTab} onChange={commit} toast={showToast} />
      </div>

      {/* 小窗：角色卡整張捲到頁首底下才出來；頁首收起來時跟著貼到最上面。電腦版角色卡黏著，不出小窗 */}
      {mini ? (
        <div className="fixed inset-x-0 top-[var(--header-offset)] z-30 px-4 pt-2 transition-[top] duration-200 ease-out sm:px-6 lg:hidden">
          <div role="region" aria-label="角色小窗" className="mx-auto flex max-w-2xl gap-2 rounded-[var(--radius-card)] glass-solid p-2">
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
      ) : null}

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

/**
 * 角色卡整張捲到頁首底下了沒（往下捲過去才算；還沒捲到的不算）。
 * 看的範圍上緣扣掉頁首高度：角色卡被頁首蓋住就當看不到了。
 */
function useScrolledPast(el: HTMLElement | null) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setPast(!entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? HEADER_H)),
      { rootMargin: `-${HEADER_H}px 0px 0px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el]);
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

/** 裝備小卡點了脫掉（右邊叉叉）；髮型、臉型、膚色小卡點了跳到那一頁（右邊箭頭） */
function WornChip({ worn, onClick }: { worn: Worn; onClick?: () => void }) {
  const body = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[color:var(--paper-deep)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- 像素小圖，用原圖不經過最佳化 */}
        <img
          // 換一件就重新掛一張，「已經換過備用圖」的記號不會帶到下一件
          key={worn.icon}
          src={itemImage(worn.icon)}
          alt=""
          width={30}
          height={30}
          loading="lazy"
          style={{ width: 30, height: 30, imageRendering: "pixelated", objectFit: "contain" }}
          onError={(e) => {
            // 這個顏色沒有小圖：換成那一款的小圖，只換一次（備用圖也壞就算了，不會一直重試）
            const img = e.currentTarget;
            if (worn.fallback === undefined || img.dataset.fallback) return;
            img.dataset.fallback = "1";
            img.src = itemImage(worn.fallback);
          }}
        />
      </span>
      <span className="grid text-left leading-tight">
        <span className="text-[12px] font-black">{worn.label}</span>
        <span className="whitespace-nowrap text-[13px] ink-soft">{worn.name}</span>
      </span>
    </>
  );
  const chip = "inline-flex items-center gap-2 rounded-full border border-[color:var(--paper-edge)] bg-[color:var(--paper)] py-1 pl-1";
  return (
    <li className="shrink-0">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={worn.slot ? `脫掉${worn.label}：${worn.name}` : `換${worn.label}：${worn.name}`}
          className={`${chip} pr-2.5`}
        >
          {body}
          {worn.slot ? <CloseIcon size={14} className="ink-faint" /> : <ChevronRight size={14} className="ink-faint" />}
        </button>
      ) : (
        <div className={`${chip} pr-3.5`}>{body}</div>
      )}
    </li>
  );
}

function Action({ primary, busy, onClick, children }: { primary?: boolean; busy?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
      className={`tap-safe whitespace-nowrap rounded-2xl px-1 text-[14px] font-black disabled:cursor-wait disabled:opacity-50 ${
        primary
          ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]"
          : "border border-[color:var(--paper-edge)] bg-[color:var(--paper)]"
      }`}
    >
      {children}
    </button>
  );
}
