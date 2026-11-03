"use client";

/**
 * 紙娃娃（/plan/avatar）：穿什麼全寫在網址（outfit.ts 的 outfitQuery／parseOutfit），
 * 這裡只負責讀網址 → 畫角色卡，按什麼都是算出下一套再 commit 換網址。
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloseIcon } from "@/components/Icons";
import { LoadingBlock } from "@/components/PlanShell";
import { track } from "@/lib/analytics";
import { EMOS, EYE_COLORS, HAIR_COLORS, POSES, defaultOutfit, itemIndex, outfitQuery, parseOutfit, setGender, takeOff } from "@/lib/avatar/outfit";
import type { Outfit } from "@/lib/avatar/outfit";
import { randomOutfit } from "@/lib/avatar/random";
import { characterUrl } from "@/lib/avatar/render";
import type { AvatarData, AvatarStyle, Gender, SlotKey } from "@/lib/avatar/types";
import { itemImage, loadAvatar, peekAvatar } from "@/lib/data";
import { Stage } from "./Stage";

const CARD = "rounded-[var(--radius-card)] glass-solid p-4 sm:p-[18px]";
const PATH = "/plan/avatar";
const TOAST_MS = 2_000;
const LOAD_ERROR = "角色圖載不出來，等一下再過來";

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

type Styles = { hair: Map<number, AvatarStyle>; face: Map<number, AvatarStyle> };

/** 身上穿了什麼的一張小卡；slot 有值＝裝備，點了脫掉 */
type Worn = { key: string; label: string; name: string; icon: number; slot?: SlotKey };

function wornList(o: Outfit, data: AvatarData, styles: Styles): Worn[] {
  const out: Worn[] = [];
  // 髮型個位數是髮色、臉型百位數是瞳色；款式 id 是那一碼歸零
  const hairColour = o.hair % 10;
  const hair = styles.hair.get(o.hair - hairColour);
  if (hair) {
    const colour = HAIR_COLORS[hairColour]?.n;
    out.push({ key: "hair", label: "髮型", name: colour ? `${hair.n}・${colour}` : hair.n, icon: hair.ic });
  }
  const eyeColour = Math.floor(o.face / 100) % 10;
  const face = styles.face.get(o.face - eyeColour * 100);
  if (face) {
    const colour = EYE_COLORS[eyeColour]?.n;
    out.push({ key: "face", label: "臉型", name: colour ? `${face.n}・${colour}` : face.n, icon: face.ic });
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
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloading = useRef(false);

  useEffect(() => {
    if (data) return;
    loadAvatar().then(setData, () => setError(true));
  }, [data]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const outfit = useMemo(() => (data ? parseOutfit(params, data) : null), [data, params]);
  const styles = useMemo<Styles | null>(
    () => (data ? { hair: new Map(data.hair.map((s) => [s.id, s])), face: new Map(data.face.map((s) => [s.id, s])) } : null),
    [data],
  );
  const worn = useMemo(() => (outfit && data && styles ? wornList(outfit, data, styles) : []), [outfit, data, styles]);

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

  const download = async () => {
    if (!data || !outfit || downloading.current) return;
    downloading.current = true;
    try {
      // 不能拿快取：舞台的 <img> 先載過同一張，那份是沒帶 Origin 要的，maplestory.io 只在有 Origin 時才回
      // access-control-allow-origin（也沒寫 Vary: Origin），直接吃快取會被當跨網域擋掉（11/03 實測）
      const res = await fetch(characterUrl(outfit, data, { frame: 0, resize: 2 }), { cache: "reload" });
      if (!res.ok) throw new Error(LOAD_ERROR);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "紙娃娃.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 馬上收回網址，有些瀏覽器會來不及開始存
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      track("avatar_download", { gender: outfit.g ? "女" : "男" });
    } catch {
      showToast(LOAD_ERROR);
    } finally {
      downloading.current = false;
    }
  };

  const share = async () => {
    const url = location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "紙娃娃", url });
        track("share", { page: "avatar", method: "share" });
        return;
      } catch (e) {
        // 使用者自己關掉分享視窗不算錯；其他錯（瀏覽器不讓分享）改複製連結
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      track("share", { page: "avatar", method: "copy" });
      showToast("已複製連結");
    } catch {
      showToast("複製不了，請直接複製網址列的網址");
    }
  };

  if (error) {
    return (
      <Shell>
        <p className={`${CARD} text-center text-[15px] ink-soft`}>紙娃娃資料讀不到，等一下再過來重新整理。</p>
      </Shell>
    );
  }
  if (!data || !outfit) {
    return (
      <Shell>
        <LoadingBlock label="載入紙娃娃…" />
      </Shell>
    );
  }

  return (
    <Shell>
      <section className={CARD} aria-label="角色">
        <Stage outfit={outfit} data={data} />

        <div className="mt-3 flex items-center justify-between gap-2">
          <div role="radiogroup" aria-label="性別" className="grid grid-cols-2 gap-1 rounded-full bg-[color:var(--paper-deep)] p-1">
            {GENDERS.map(({ g, label }) => (
              <Segment key={g} on={outfit.g === g} onClick={() => commit(setGender(outfit, g, data))} wide>
                {label}
              </Segment>
            ))}
          </div>
          <Pill on={outfit.flip} pressed onClick={() => commit({ ...outfit, flip: !outfit.flip })}>
            翻面
          </Pill>
        </div>

        <div role="radiogroup" aria-label="動作" className="mt-2 grid grid-cols-6 gap-1 rounded-full bg-[color:var(--paper-deep)] p-1">
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
          <div role="radiogroup" aria-labelledby="avatar-emo" className="scroll-x flex min-w-0 gap-1.5 pb-0.5">
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
          <Action onClick={download}>下載</Action>
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
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-3.5 py-3 sm:py-6">
      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">紙娃娃</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">換髮型、臉型、點裝，看角色穿起來長怎樣，可以下載或分享。</p>
      </header>
      {children}
    </div>
  );
}

/** 一條底槽裡的單選（性別、動作） */
function Segment({ on, onClick, wide, children }: { on: boolean; onClick: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`min-h-[34px] whitespace-nowrap rounded-full text-[14px] ${wide ? "px-4" : "px-1"} ${
        on ? "bg-[color:var(--maple)] font-black text-[color:var(--on-accent)]" : "font-bold ink-soft"
      }`}
    >
      {children}
    </button>
  );
}

/** 膠囊：表情是單選（radio），翻面是開關（pressed） */
function Pill({ on, pressed, onClick, children }: { on: boolean; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      {...(pressed ? { "aria-pressed": on } : { role: "radio", "aria-checked": on })}
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
          src={itemImage(worn.icon)}
          alt=""
          width={30}
          height={30}
          loading="lazy"
          style={{ width: 30, height: 30, imageRendering: "pixelated", objectFit: "contain" }}
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

function Action({ primary, onClick, children }: { primary?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap-safe whitespace-nowrap rounded-2xl px-1 text-[14px] font-black ${
        primary
          ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]"
          : "border border-[color:var(--paper-edge)] bg-[color:var(--paper)]"
      }`}
    >
      {children}
    </button>
  );
}
