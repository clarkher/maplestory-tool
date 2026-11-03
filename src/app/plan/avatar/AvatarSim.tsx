"use client";

/**
 * 紙娃娃（/plan/avatar）：穿什麼全寫在網址（outfit.ts 的 outfitQuery／parseOutfit），
 * 這裡只負責讀網址 → 畫角色卡，按什麼都是算出下一套再 commit 換網址。
 * 標題、副標在 page.tsx（靜態 HTML 就有，資料載好時不跳）。
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CloseIcon } from "@/components/Icons";
import { LoadingBlock } from "@/components/PlanShell";
import {
  EMOS, EYE_COLORS, HAIR_COLORS, POSES, defaultOutfit, eyeColour, faceStyle, hairColour, hairStyle, itemIndex, outfitQuery, parseOutfit, setGender, takeOff,
} from "@/lib/avatar/outfit";
import type { Outfit } from "@/lib/avatar/outfit";
import { randomOutfit } from "@/lib/avatar/random";
import type { AvatarData, Gender, SlotKey } from "@/lib/avatar/types";
import { itemImage, loadAvatar, peekAvatar } from "@/lib/data";
import { Stage } from "./Stage";
import { useAvatarActions } from "./useAvatarActions";

const CARD = "rounded-[var(--radius-card)] glass-solid p-4 sm:p-[18px]";
const PATH = "/plan/avatar";

/** 12 類的名字，順序同挑衣服卡的分頁 */
const SLOTS: { k: SlotKey; label: string }[] = [
  { k: "cap", label: "帽子" },
  { k: "overall", label: "套服" },
  { k: "coat", label: "上衣" },
  { k: "pants", label: "褲裙" },
  { k: "shoes", label: "鞋子" },
  { k: "glove", label: "手套" },
  { k: "cape", label: "披風" },
  { k: "weapon", label: "武器" },
  { k: "eyeAcc", label: "眼飾" },
  { k: "faceAcc", label: "臉飾" },
  { k: "earrings", label: "耳環" },
  { k: "shield", label: "盾牌" },
];

const GENDERS: { g: Gender; label: string }[] = [
  { g: 0, label: "男" },
  { g: 1, label: "女" },
];

/** 身上穿了什麼的一張小卡；slot 有值＝裝備，點了脫掉；fallback＝這個顏色沒有小圖時改用的那張 */
type Worn = { key: string; label: string; name: string; icon: number; fallback?: number; slot?: SlotKey };

function wornList(o: Outfit, data: AvatarData): Worn[] {
  const out: Worn[] = [];
  const hair = hairStyle(data, o.hair);
  if (hair) {
    const colour = HAIR_COLORS[hairColour(o.hair)]?.n;
    out.push({ key: "hair", label: "髮型", name: colour ? `${hair.n}・${colour}` : hair.n, icon: o.hair, fallback: hair.ic });
  }
  const face = faceStyle(data, o.face);
  if (face) {
    const colour = EYE_COLORS[eyeColour(o.face)]?.n;
    out.push({ key: "face", label: "臉型", name: colour ? `${face.n}・${colour}` : face.n, icon: o.face, fallback: face.ic });
  }
  const skin = data.skin.find((s) => s.id === o.skin);
  if (skin) out.push({ key: "skin", label: "膚色", name: skin.n, icon: skin.id + 10000 });
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
  const { download, share, downloading, toast } = useAvatarActions(outfit, data);

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

  return (
    <>
      <section className={CARD} aria-label="角色">
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
            <WornChip key={w.key} worn={w} onTakeOff={w.slot ? () => commit(takeOff(outfit, w.slot!)) : undefined} />
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

      {/* 挑衣服卡接在角色卡下面 */}

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

function WornChip({ worn, onTakeOff }: { worn: Worn; onTakeOff?: () => void }) {
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
      {onTakeOff ? (
        <button type="button" onClick={onTakeOff} aria-label={`脫掉${worn.label}：${worn.name}`} className={`${chip} pr-2.5`}>
          {body}
          <CloseIcon size={14} className="ink-faint" />
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
