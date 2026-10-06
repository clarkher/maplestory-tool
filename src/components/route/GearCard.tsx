"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, RouteIcon } from "@/components/Icons";
import { itemImage, loadGear, mapName } from "@/lib/data";
import type { GearData, GearWeapon, StatKey } from "@/lib/gear";
import {
  STAT_ORDER,
  STAT_SHORT,
  STAT_WORD,
  dropLead,
  effectParts,
  gearPlan,
  inheritNote,
  offenseText,
  shortText,
  sourceOpensLater,
  sourceText,
  weaponStatParts,
  type GearFamily,
  type GearPlan,
  type SourcePick,
} from "@/lib/gear-view";
import { jobOption } from "@/lib/jobs";
import { useBeforeV002 } from "@/lib/release";
import type { MapRecord, Verified } from "@/lib/types";
import { Chip, SourceLinks, SourceTag, Sprite } from "./bits";

/** 收合時衝卷列幾組，其餘按「看全部」 */
const FIRST_FAMILIES = 3;

type Where = {
  maps: Record<string, MapRecord>;
  /** 傳送門資料走得到的地圖（跟主推卡、先解同一份），有才給「帶我去」 */
  routable: Set<number>;
  /** 10/15 前（useBeforeV002）：只有 V002 才拿得到的標「10/15 開放」 */
  beforeOpen: boolean;
};

/**
 * 首頁「能力值與裝備」卡：照你的職業跟等級，給能力值該點到多少、現在拿哪把武器去哪拿、衝什麼卷。
 * 自己載 gear.json（載不到只影響這張卡）；算法都在 lib/gear.ts，組裝跟用字在 lib/gear-view.ts。
 */
export function GearCard({ job, level, maps, routable }: { job: number; level: number; maps: Record<string, MapRecord>; routable: Set<number> }) {
  const [gear, setGear] = useState<GearData | null>(null);
  const [failed, setFailed] = useState(false);
  // 放在外層：卡片內容掛上去之前就已經換成瀏覽器當下的日期，不會先算一次 10/15 後的版本又換掉
  const beforeOpen = useBeforeV002();

  useEffect(() => {
    let cancelled = false;
    loadGear()
      .then(data => {
        if (!cancelled) setGear(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const title = `Lv.${level} ${(job > 0 && jobOption(job)?.name) || "初心者"}`;
  if (failed) {
    return <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px]">裝備資料讀取失敗，重新整理一次試試。</p>;
  }
  if (!gear) return <GearCardSkeleton title={title} />;
  if (job <= 0) return <BeginnerCard gear={gear} title={title} />;
  // 換職業或等級時重新掛載，「看全部」的展開狀態不帶到別的角色（跟先解同一招）
  return <GearContent key={`${job}:${level}`} gear={gear} job={job} level={level} title={title} where={{ maps, routable, beforeOpen }} />;
}

function Frame({ title, busy, children }: { title: string; busy?: boolean; children: ReactNode }) {
  return (
    <section aria-label="能力值與裝備" aria-busy={busy || undefined} className="rounded-[var(--radius-card)] glass wood-frame p-3.5 sm:p-4">
      <header className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-black">能力值與裝備</h2>
        <span className="shrink-0 text-[12px] font-bold tabular-nums ink-faint">{title}</span>
      </header>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function GearCardSkeleton({ title }: { title: string }) {
  return (
    <Frame title={title} busy>
      <div className="grid grid-cols-4 gap-1.5">
        {STAT_ORDER.map(key => (
          <div key={key} className="h-[52px] animate-pulse rounded-lg bg-[color:var(--paper-deep)]" />
        ))}
      </div>
      <div className="h-4 w-3/4 animate-pulse rounded-lg bg-[color:var(--paper-deep)]" />
      <div className="h-14 animate-pulse rounded-xl bg-[color:var(--paper-deep)]" />
      <p className="text-[12px] ink-faint">讀取武器跟卷軸中…</p>
    </Frame>
  );
}

/** 還沒轉職：能力點是系統自動配的，沒有數字可以給 */
function BeginnerCard({ gear, title }: { gear: GearData; title: string }) {
  return (
    <Frame title={title}>
      {gear.before ? (
        <Block label="能力值" tag={<SourceTag kind="guide" verified={gear.before.v} />}>
          <p className="text-pretty text-[13px] leading-relaxed">{gear.before.t}</p>
          <SourceLinks urls={gear.before.s} />
        </Block>
      ) : null}
      <p className="text-[13px] ink-soft">轉職後這裡會列能力值、武器跟衝卷</p>
    </Frame>
  );
}

/** 出處連結＋玩家攻略標籤一行；放不下時標籤換到下一行靠右，不會孤零零掛在左邊 */
function GuideSources({ urls, verified }: { urls: string[]; verified: Verified }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-1.5">
      <SourceLinks urls={urls} />
      <span className="ml-auto">
        <SourceTag kind="guide" verified={verified} />
      </span>
    </div>
  );
}

function GearContent({ gear, job, level, title, where }: { gear: GearData; job: number; level: number; title: string; where: Where }) {
  const plan = useMemo(() => gearPlan(gear, job, level, where.beforeOpen), [gear, job, level, where.beforeOpen]);
  const [open, setOpen] = useState(false);
  const families = open ? plan.families : plan.families.slice(0, FIRST_FAMILIES);
  // 「看全部」裡真的有東西才給按鈕
  const hasMore = Boolean(plan.rule) || plan.alternatives.length > 0 || plan.families.length > FIRST_FAMILIES || plan.notes.length > 0;

  return (
    <Frame title={title}>
      <StatBlock plan={plan} job={job} />
      <WeaponBlock plan={plan} where={where} />
      {families.length ? (
        <Block label="衝卷" tag={<SourceTag kind="data" />}>
          <ul className="divide-y divide-[color:var(--paper-edge)]">
            {families.map(family => (
              <FamilyItem key={`${family.slot}:${family.stat}`} family={family} where={where} />
            ))}
          </ul>
        </Block>
      ) : null}
      {open ? <MoreBlocks plan={plan} where={where} /> : null}
      {hasMore ? (
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          className="tap-safe flex w-full items-center justify-center gap-1 rounded-full border border-[color:var(--paper-edge)] text-[14px] font-bold"
        >
          {open ? "收起" : "看全部"}
          <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      ) : null}
    </Frame>
  );
}

/** 卡片裡的一區：小標＋右邊的出處標籤（跟升級路線展開後的區塊同一個樣子） */
function Block({ label, tag, children }: { label: string; tag?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-[color:var(--paper-deep)] p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-black ink-faint">{label}</h3>
        {tag}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ 能力值 */

const CELL_TONE = {
  main: "bg-[color:var(--maple)] text-white",
  second: "bg-[color:var(--maple-wash)] text-[color:var(--maple)]",
  rest: "bg-[color:var(--paper)] ink-faint",
} as const;

function StatBlock({ plan, job }: { plan: GearPlan; job: number }) {
  const { rule, targets } = plan;
  if (!rule || !targets) {
    return (
      <Block label="能力值">
        <p className="text-[13px] ink-soft">這個職業還沒有可靠的配點攻略</p>
      </Block>
    );
  }
  const inherited = plan.inherited ? inheritNote(job, rule) : null;
  return (
    <Block label="能力值" tag={<SourceTag kind="guide" verified={rule.v} />}>
      <dl className="grid grid-cols-4 gap-1.5">
        {STAT_ORDER.map(key => {
          const tone: keyof typeof CELL_TONE = key === rule.main ? "main" : key === rule.secondary?.stat ? "second" : "rest";
          return <StatCell key={key} stat={key} value={targets[key]} tone={tone} />;
        })}
      </dl>
      <p className="text-[13px] font-bold leading-snug">{rule.label}</p>
      {inherited ? <p className="rounded-lg bg-[color:var(--gold-wash)] px-2.5 py-1.5 text-[12px] leading-snug">{inherited}</p> : null}
    </Block>
  );
}

function StatCell({ stat, value, tone }: { stat: StatKey; value: number; tone: keyof typeof CELL_TONE }) {
  return (
    <div className={`rounded-lg px-1 py-1.5 text-center ${CELL_TONE[tone]}`}>
      <dt className="text-[11px] font-bold leading-none">
        <span aria-hidden>{STAT_SHORT[stat]}</span>
        <span className="sr-only">
          {STAT_WORD[stat]}
          {tone === "main" ? "（主屬性）" : ""}
        </span>
      </dt>
      <dd className="mt-1 text-[20px] font-black leading-none tabular-nums">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ 武器 */

function WeaponBlock({ plan, where }: { plan: GearPlan; where: Where }) {
  const { best, magic, stronger, next } = plan;
  return (
    <Block label="武器" tag={<SourceTag kind="data" />}>
      {best ? (
        <>
          <div className="flex gap-2.5">
            <ItemBox id={best.id} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <Link href={`/db/items?id=${best.id}`} className="text-[16px] font-black leading-snug">
                  {best.n}
                  <ChevronRight size={14} className="ml-0.5 inline-block align-[-2px] ink-faint" />
                </Link>
                <OpenChip later={best.o ?? (plan.bestSource ? sourceOpensLater(plan.bestSource) : undefined)} where={where} />
              </p>
              <Chunks parts={weaponStatParts(best, magic)} className="block text-[12px] tabular-nums ink-soft" />
              <SourceLine pick={plan.bestSource} where={where} chip={false} />
            </div>
          </div>
          {plan.bestShort.length ? (
            <p className="rounded-lg bg-[color:var(--gold-wash)] px-2.5 py-1.5 text-[12px]">照這套點法{shortText(plan.bestShort)}</p>
          ) : null}
          {stronger ? (
            <WeaponLine weapon={stronger}>
              想用更強的 <NameLink weapon={stronger} />
              <span className="whitespace-nowrap">（{offenseText(stronger, magic)}）</span>，
              <span className="whitespace-nowrap">{shortText(plan.strongerShort)}</span>
            </WeaponLine>
          ) : null}
          {next ? (
            <WeaponLine weapon={next}>
              <span className="whitespace-nowrap">Lv.{next.lv}</span> 可以換 <NameLink weapon={next} />
              <span className="whitespace-nowrap">（{offenseText(next, magic)}）</span>
              <OpenChip later={next.o} where={where} spaced />
            </WeaponLine>
          ) : null}
        </>
      ) : (
        <p className="text-[13px] ink-soft">這個等級還找不到拿得到、穿得上的武器</p>
      )}
    </Block>
  );
}

function ItemBox({ id, size = 44 }: { id: number; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-xl bg-[color:var(--paper)]" style={{ width: size, height: size }}>
      <Sprite src={itemImage(id)} size={Math.round(size * 0.72)} />
    </span>
  );
}

function NameLink({ weapon }: { weapon: GearWeapon }) {
  return (
    <Link href={`/db/items?id=${weapon.id}`} className="font-bold text-[color:var(--sky)]">
      {weapon.n}
    </Link>
  );
}

/** 更強但穿不上、下一把：一行字，前面放那把武器的小圖 */
function WeaponLine({ weapon, children }: { weapon: GearWeapon; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[13px] leading-snug">
      <Sprite src={itemImage(weapon.id)} size={22} className="-mt-0.5" />
      <p className="min-w-0 flex-1">{children}</p>
    </div>
  );
}

/** 一塊一塊各自不斷行、塊跟塊之間用「・」或「、」接（分隔放前一塊結尾，後面可以換行；跟先解同一招） */
function Chunks({ parts, separator = "・", className = "" }: { parts: string[]; separator?: string; className?: string }) {
  return (
    <span className={className}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          <span className="whitespace-nowrap">
            {part}
            {index < parts.length - 1 ? separator : null}
          </span>
          <wbr />
        </Fragment>
      ))}
    </span>
  );
}

function OpenChip({ later, where, spaced = false }: { later: string | undefined; where: Where; spaced?: boolean }) {
  if (!later || !where.beforeOpen) return null;
  return (
    <span className={`inline-block align-middle ${spaced ? "ml-1.5" : ""}`}>
      <Chip tone="gold">10/15 開放</Chip>
    </span>
  );
}

/** 怎麼拿：商店／哪隻怪會掉（走得到就給「帶我去」）／哪個任務給 */
function SourceLine({ pick, where, chip = true }: { pick: SourcePick | null; where: Where; chip?: boolean }) {
  if (!pick) return null;
  const go = pick.kind === "drop" && where.routable.has(pick.drop.map) ? pick.drop.map : null;
  const label = (id: number) => mapName(where.maps, id);
  // 地圖名、任務名整個一起換行（「海龜沙灘」不會切成「海龜沙／灘」）；真的長到一行放不下才在字中間斷，不凸出卡片
  return (
    <span className="mt-1 flex items-center justify-between gap-2">
      <span className="min-w-0 text-[12px] leading-snug ink-soft">
        {pick.kind === "drop" ? (
          <>
            <span className="whitespace-nowrap">{dropLead(pick.drop)}・</span>
            <wbr />
            <span className="break-keep wrap-anywhere">{label(pick.drop.map)}</span>
          </>
        ) : (
          <span className="break-keep wrap-anywhere">{sourceText(pick, label)}</span>
        )}
        {chip ? <OpenChip later={sourceOpensLater(pick)} where={where} spaced /> : null}
      </span>
      {go !== null ? (
        <Link
          href={`/go?to=${go}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--maple)] px-2.5 py-1 text-[12px] font-bold text-[color:var(--maple)]"
        >
          <RouteIcon size={13} />
          帶我去
        </Link>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ 衝卷 */

/** 一組卷軸：名稱、每種成功率的效果；「怎麼拿」寫在最好拿的那張底下 */
function FamilyItem({ family, where }: { family: GearFamily; where: Where }) {
  const { pick, source } = family;
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <Link href={`/db/items?id=${pick.id}`} className="flex items-center gap-1.5 text-[14px] font-bold leading-snug">
        <Sprite src={itemImage(pick.id)} size={24} />
        <span className="min-w-0">{family.options[0].n}</span>
      </Link>
      <ul className="mt-1 space-y-1">
        {family.options.map(option => (
          <li key={option.id}>
            <p className="flex gap-1.5 text-[12px] leading-snug">
              <span className="w-9 shrink-0 font-black tabular-nums text-[color:var(--maple)]">{option.rate}%</span>
              <span className="min-w-0">
                <Chunks parts={effectParts(option.effect)} separator="、" />
                {/* 這張只有 V002 才拿得到（披風力量卷軸100%）：10/15 前標出來，免得玩家去找 */}
                <OpenChip later={option.o} where={where} spaced />
              </span>
            </p>
            {option === pick && source ? (
              <div className="pl-[42px]">
                {/* 這張本身已經標了 10/15 開放（整組都只有 V002 拿得到）就不在來源再標一次 */}
                <SourceLine pick={source} where={where} chip={!pick.o} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </li>
  );
}

/* ------------------------------------------------------------------ 看全部 */

function MoreBlocks({ plan, where }: { plan: GearPlan; where: Where }) {
  const { rule, others, alternatives, notes, magic } = plan;
  return (
    <>
      {rule ? (
        <Block label="點法說明" tag={<SourceTag kind="guide" verified={rule.v} />}>
          <p className="text-pretty text-[13px] leading-relaxed">{rule.t}</p>
          <SourceLinks urls={rule.s} />
          {others.length ? (
            <div className="space-y-2 pt-1">
              <h4 className="text-[12px] font-black ink-faint">其他點法</h4>
              <ul className="space-y-2">
                {others.map(other => (
                  <li key={other.label} className="space-y-1 rounded-lg bg-[color:var(--paper)] p-2">
                    <p className="text-[13px] font-bold leading-snug">{other.label}</p>
                    <p className="text-pretty text-[13px] leading-relaxed ink-soft">{other.t}</p>
                    <GuideSources urls={other.s} verified={other.v} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Block>
      ) : null}

      {alternatives.length ? (
        <Block label="其他武器" tag={<SourceTag kind="data" />}>
          <ul className="space-y-2.5">
            {alternatives.map(({ weapon, source }) => (
              <li key={weapon.id} className="flex gap-2.5">
                <ItemBox id={weapon.id} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <Link href={`/db/items?id=${weapon.id}`} className="text-[14px] font-bold leading-snug">
                      {weapon.n}
                    </Link>
                    <OpenChip later={weapon.o ?? (source ? sourceOpensLater(source) : undefined)} where={where} />
                  </p>
                  <Chunks parts={weaponStatParts(weapon, magic)} className="block text-[12px] tabular-nums ink-soft" />
                  <SourceLine pick={source} where={where} chip={false} />
                </div>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {notes.length ? (
        <Block label="玩家提醒">
          {notes.map(group => (
            <div key={group.topic} className="space-y-1.5">
              <h4 className="text-[12px] font-black">{group.label}</h4>
              <ul className="space-y-1.5">
                {group.notes.map((note, index) => (
                  <li key={index} className="space-y-1 rounded-lg bg-[color:var(--paper)] p-2">
                    <p className="text-pretty text-[13px] leading-relaxed">{note.t}</p>
                    <GuideSources urls={note.s} verified={note.v} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Block>
      ) : null}
    </>
  );
}
