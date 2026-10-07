"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "@/components/Icons";
import { GoButton } from "@/components/PlanShell";
import { itemImage, loadGear, mapName, monsterImage, skillImage } from "@/lib/data";
import { formatNumber, levelRange } from "@/lib/format";
import { isMagicJob, type GearData } from "@/lib/gear";
import { bandGear, offenseText, sourceOpensLater, sourceText } from "@/lib/gear-view";
import { LEVEL_CAP } from "@/lib/profile";
import { COMMON_ROUTE } from "@/lib/guide-data";
import { SECOND_JOB_LEVEL, THIRD_JOB_LEVEL, jobTier } from "@/lib/jobs";
import { bandQuests, ceilingText, laterMaterials, nowQuests, partsText, type BandQuest, type MainPick } from "@/lib/now-plan";
import { useBeforeV002 } from "@/lib/release";
import { type Band, isIslandBand, onIsland, spawnIndex } from "@/lib/route-planner";
import { mainBuild, spAtLevel, stepText, stepsBetween } from "@/lib/skill-plan";
import { timelinePlans, type BandPlan, type TrainRow } from "@/lib/timeline";
import type { GuideCommon, GuideJob, MapRecord, Monster, Quest, TrainingRow } from "@/lib/types";
import type { GuideStatus } from "./RouteHome";
import { Chip, SourceLinks, SourceTag, Sprite, levelText } from "./bits";
import { QuestLine } from "./QuestLine";

type Context = {
  job: number;
  level: number;
  /** 選了二轉職業時的名稱，一轉攻略有好幾條主流時挑提到它的那條 */
  prefer?: string;
  guideStatus: GuideStatus;
  bands: Band[];
  guides: Map<number, GuideJob>;
  quests: Quest[];
  monsters: Monster[];
  monsterIndex: Map<number, Monster>;
  maps: Record<string, MapRecord>;
  training: TrainingRow[];
  common: GuideCommon;
  /** 任務實際幾等做得動（now-plan effectiveLevels），必解跟先解用同一份 */
  effective: Map<string, number>;
  /** 主推卡：你在的這一段照它寫標籤、排第一列（攻略還在載入時不給，免得標籤先寫一張又換掉） */
  pick?: MainPick;
  /** 城鎮走得到（跟主推卡的「帶我去」同一個條件），不然「去」點進去只會找不到起點 */
  canGo: (map: number) => boolean;
};

/** 升級路線：1→120 一條路，你在哪一段就展開哪一段，其他段點開看。 */
export function RouteTimeline(context: Context) {
  const { bands, level, job, guides, monsterIndex, maps, training, common, pick, canGo } = context;
  const spawns = useMemo(() => spawnIndex(context.monsters), [context.monsters]);
  // 每一段的練功清單與標籤（純函式 lib/timeline.ts；真資料檢查跑同一套）
  const timeline = useMemo(
    () => timelinePlans({ job, level, bands, guides, monsterIndex, spawns, maps, training, pqs: common.pq ?? [], pick, canGo }),
    [job, level, bands, guides, monsterIndex, spawns, maps, training, common.pq, pick, canGo],
  );
  const { activeIndex } = timeline;
  const [open, setOpen] = useState<Set<number>>(() => new Set([activeIndex]));

  function toggle(index: number) {
    setOpen(previous => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="relative">
      <span aria-hidden className="absolute bottom-4 left-[12px] top-4 w-[3px] rounded-full bg-[color:var(--paper-edge)]" />
      <ol className="space-y-2 pl-8">
        {bands.map((band, index) => (
          <BandItem
            key={band.from}
            plan={timeline.plans[index]}
            next={bands[index + 1]}
            state={index < activeIndex ? "done" : index === activeIndex ? "current" : "future"}
            open={open.has(index)}
            onToggle={() => toggle(index)}
            context={context}
            label={timeline.labels[index]}
          />
        ))}
      </ol>
    </div>
  );
}

function BandItem({
  plan,
  next,
  state,
  open,
  onToggle,
  context,
  label,
}: {
  plan: BandPlan;
  next?: Band;
  state: "done" | "current" | "future";
  open: boolean;
  onToggle: () => void;
  context: Context;
  label?: string;
}) {
  const { band } = plan;
  // 之前最後一段固定到 100，這裡硬寫死「–100」；100～120 那段的 to 是 120，照 band 本身的值顯示才對
  const range = `Lv.${band.from}–${band.to}`;

  return (
    <li className="relative">
      <span
        aria-hidden
        className={`absolute -left-8 top-3 grid size-[27px] place-items-center rounded-full border-[3px] ${
          state === "current"
            ? "border-[color:var(--maple)] bg-[color:var(--maple)]"
            : state === "done"
              ? "border-[color:var(--leaf)] bg-[color:var(--leaf)]"
              : "border-[color:var(--paper-edge)] bg-[color:var(--paper)]"
        }`}
      >
        {state === "done" ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m5 12 5 5 9-10" />
          </svg>
        ) : null}
      </span>

      <div className={`overflow-hidden rounded-[var(--radius-card)] ${open ? "glass wood-frame" : state === "current" ? "glass" : ""}`}>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
          {/* 等級範圍跟「你在這」不斷行（375 寬不會變成「Lv.10– / 21」）；標籤最多兩行 */}
          <span className={`shrink-0 whitespace-nowrap text-[16px] font-black tabular-nums ${state === "done" && !open ? "ink-faint" : ""}`}>{range}</span>
          {state === "current" ? <span className="shrink-0 whitespace-nowrap text-[13px] font-bold text-[color:var(--maple)]">你在這</span> : null}
          <span className="ml-auto line-clamp-2 min-w-0 flex-1 text-right text-[13px] leading-snug ink-soft">{label ?? "還沒有玩家攻略"}</span>
          <ChevronDown size={16} className={`shrink-0 ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open ? <BandDetail plan={plan} next={next} context={context} active={state === "current"} /> : null}
      </div>
    </li>
  );
}

function BandDetail({ plan, next, context, active }: { plan: BandPlan; next?: Band; context: Context; active: boolean }) {
  const { band, stage, guide } = plan;
  const { job, level, quests, monsters, monsterIndex, maps, common, prefer, guideStatus, effective } = context;
  const beforeOpen = useBeforeV002();

  const detail = useMemo(() => {
    const build = guide ? mainBuild(guide.builds, prefer) : undefined;
    // 這段開始前（上一級結束時）到這段最後一級的點數；轉職那一段從 0 起算，才不會漏掉只花 1 點的第一步
    const steps = build && stage ? stepsBetween(build, spAtLevel(stage, band.from - 1), spAtLevel(stage, band.to - 1)) : [];
    // 必解跟先解同一套規則（任務線、標題、長線、值不值得、不跳段）；約幾級用接得到那條線的等級算：
    // 這段跟之前的段取現在等級與那條線的等級較高的，之後的段取段落起點與它較高的；你在的這段不再列先解已經列的段（now-plan bandQuests）
    const shared = { level, job, quests, monsters, common, maps, effective };
    const mustDo = bandQuests({ ...shared, band, active });
    const nextMustDo = next ? bandQuests({ ...shared, band: next }) : [];
    // 先存著：下一段必解要交的材料，這頁已經列的任務（先解、這段的必解）不算（now-plan laterMaterials）
    const prep = laterMaterials({ next: nextMustDo, listed: [...nowQuests(shared), ...mustDo], monsters });
    return { build, steps, mustDo, prep };
  }, [band, next, guide, stage, job, level, quests, monsters, maps, common, prefer, effective, active]);

  const stuckInFirstJob = band.from >= SECOND_JOB_LEVEL && jobTier(job) === 1;
  const stuckInSecondJob = band.from >= THIRD_JOB_LEVEL && jobTier(job) === 2;
  const gap = guide?.gaps?.find(entry => entry.from < band.to && entry.to >= band.from);
  const island = isIslandBand(band);
  // 沒有能用的玩家攻略：說明（還在讀攻略、讀取失敗、或「以下是遊戲資料推算」）＋研究時查到的狀況
  const noGuide = !island && plan.usable === 0;
  const ready = Boolean(guide) || guideStatus === "ready";
  const status = !guide && guideStatus === "loading" ? (
    <p className="text-[13px] ink-faint">讀取玩家攻略中…</p>
  ) : !guide && guideStatus === "failed" ? (
    <p className="text-[13px] ink-soft">玩家攻略讀取失敗，重新整理一次試試。</p>
  ) : (
    <div className="space-y-2">
      <p className="text-[13px] leading-relaxed ink-soft">
        {plan.blocked
          ? "這段的玩家攻略圖不適合你的職業（見上），以下是遊戲資料推算，沒有人實測過。"
          : "這段還沒有玩家攻略，以下是遊戲資料推算，沒有人實測過。"}
      </p>
      {gap ? (
        <div className="space-y-1 rounded-lg bg-[color:var(--paper)] p-2">
          <p className="text-[12px] leading-relaxed ink-soft">查攻略時看到的狀況：{gap.t}</p>
          <SourceLinks urls={gap.s} />
        </div>
      ) : null}
    </div>
  );

  if (job === 0 && !island) {
    return (
      <p className="mx-3 mb-3 rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px] leading-relaxed">
        還沒轉職。轉職後按上面「換其他職業」選你的職業，這段就會排出練功點、技能點法跟值得解的任務。
      </p>
    );
  }

  return (
    <div className="space-y-2.5 px-3 pb-3">
      {stuckInFirstJob ? (
        <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px] leading-relaxed">
          還沒二轉：二轉後按上面「換其他職業」選你的二轉職業，這段會換成那個職業的攻略。
        </p>
      ) : null}

      {stuckInSecondJob ? (
        <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px] leading-relaxed">
          {beforeOpen
            ? "還沒三轉：三轉 10/15 開放，轉完按上面「換其他職業」選你的三轉職業，這段會換成那個職業的攻略。"
            : "還沒三轉：三轉後按上面「換其他職業」選你的三轉職業，這段會換成那個職業的攻略。"}
        </p>
      ) : null}

      <Block label="練功">
        {/* 這段完全沒有玩家攻略時，說明放最上面（下面第一列就是主推卡那張遊戲資料的圖）；
            攻略圖被職業規則擋掉時，說明放在被擋的那幾列下面（「見上」） */}
        {noGuide && !plan.blocked ? status : null}
        {plan.rows.length ? (
          <ul className="space-y-2.5">
            {plan.rows.map(row => (
              <TrainRowItem key={row.key} row={row} monsterIndex={monsterIndex} maps={maps} tagData={!noGuide || plan.blocked} />
            ))}
          </ul>
        ) : null}
        {island ? <IslandStep onIsland={onIsland(job, level)} /> : null}
        {noGuide && plan.blocked ? status : null}
        {noGuide && ready ? (
          <>
            {plan.fallback.length ? (
              <ul className="space-y-2.5">
                {plan.fallback.map(row => (
                  <TrainRowItem key={row.key} row={row} monsterIndex={monsterIndex} maps={maps} />
                ))}
              </ul>
            ) : null}
            {/* 段落比所有開放的練功圖高 10 級以上（100–120 段）：照主推卡的寫法說目前最高到幾等 */}
            {plan.ceiling ? <p className="rounded-lg bg-[color:var(--gold-wash)] px-2.5 py-1.5 text-[12px]">{ceilingText(plan.ceiling)}</p> : null}
            <div className="flex justify-end">
              <SourceTag kind="data" />
            </div>
          </>
        ) : null}
        {band.from === 10 || band.from === 8 ? <PqLink pqKey="moon" common={common} text="月妙組隊任務怎麼打" /> : null}
        {band.from === 21 ? <PqLink pqKey="kerning" common={common} text="超綠組隊任務怎麼打" /> : null}
      </Block>

      {detail.steps.length && detail.build ? (
        <Block label="技能" tag={<SourceTag kind="guide" verified={detail.build.v} />}>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[14px] font-bold">
            {detail.steps.map((step, index) => (
              <span key={index} className="flex items-center gap-1 whitespace-nowrap">
                {index > 0 ? <span className="ink-faint">→</span> : null}
                <span className="flex items-center gap-1 rounded-lg bg-[color:var(--paper)] px-1.5 py-1">
                  {step.id ? <Sprite src={skillImage(step.id)} size={20} /> : null}
                  {stepText(step)}
                </span>
              </span>
            ))}
          </div>
        </Block>
      ) : null}

      {!island && job > 0 ? <BandGearBlock job={job} band={band} maps={maps} /> : null}

      {detail.mustDo.length ? (
        <Block label="必解任務" tag={<SourceTag kind="data" />}>
          <ul className="space-y-2">
            {detail.mustDo.map(item => (
              <MustDoRow key={item.key} item={item} />
            ))}
          </ul>
        </Block>
      ) : null}

      {detail.prep.length && next ? (
        <Block label={`先存著，Lv.${next.from} 以後要交`}>
          <div className="flex flex-wrap gap-1.5">
            {detail.prep.map(material => (
              <span key={material.id} className="inline-flex items-center gap-1 rounded-full bg-[color:var(--paper)] py-0.5 pl-0.5 pr-2.5 text-[13px] font-bold">
                <Sprite src={itemImage(material.id)} size={22} />
                {material.n} ×{formatNumber(material.c)}
                <span className="font-normal ink-faint">{monsterIndex.get(material.droppers[0])?.n}</span>
              </span>
            ))}
          </div>
        </Block>
      ) : null}
    </div>
  );
}

function Block({ label, tag, children }: { label: string; tag?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[color:var(--paper-deep)] p-2.5">
      <p className="mb-2 flex items-center justify-between gap-2 text-[12px] font-black ink-faint">
        {label}
        {tag}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/**
 * 練功清單的一列：攻略圖（同一張圖好幾段已經併成一列）、組隊任務（寫組隊任務的名字，去帶到入口）、遊戲資料的圖。
 * tagData：列在攻略清單裡的遊戲資料圖（主推卡那張）旁邊標「遊戲資料」。
 */
function TrainRowItem({
  row,
  monsterIndex,
  maps,
  tagData = false,
}: {
  row: TrainRow;
  monsterIndex: Map<number, Monster>;
  maps: Record<string, MapRecord>;
  tagData?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const lead = row.mobs.find(id => monsterIndex.has(id));
  const leadMonster = lead !== undefined ? monsterIndex.get(lead) : undefined;
  const names = row.mobs.map(id => monsterIndex.get(id)?.n).filter(Boolean).slice(0, 3).join("、");
  // V002 才放行的圖（冰原雪域、廢礦）要 10/15 開機後才能去，過了那天自動不再標
  const beforeOpen = useBeforeV002();
  const notOpenYet = row.map !== null && Boolean(maps[String(row.map)]?.o) && beforeOpen;
  return (
    <li className="space-y-1.5">
      <div className="flex items-center gap-2.5">
        {lead !== undefined ? <Sprite src={monsterImage(lead)} size={34} /> : <span className="size-[34px] shrink-0" />}
        {row.source === "data" ? (
          <span className="min-w-0 flex-1 text-[14px] leading-snug">
            <b>{row.title}</b>
            {notOpenYet ? <span className="ml-1.5 align-middle"><Chip tone="gold">10/15 開放</Chip></span> : null}
            {/* 每一塊（怪幾等、清一輪幾經驗）各自不斷行，375 寬不會把「經驗」或數字拆到下一行（跟 TodoList 同一招）；
                分隔的「 · 」放在前一塊的結尾、後面可以換行 */}
            <span className="block text-[12px] ink-soft">
              {leadMonster ? (
                <span className="whitespace-nowrap">
                  {leadMonster.n} Lv{leadMonster.lv ?? "?"}
                  {row.exp1 !== undefined ? " · " : null}
                </span>
              ) : null}
              <wbr />
              {row.exp1 !== undefined ? <span className="whitespace-nowrap">清一輪 {formatNumber(row.exp1)} 經驗</span> : null}
              {tagData ? <span className="ml-1.5 inline-block align-middle"><SourceTag kind="data" /></span> : null}
            </span>
          </span>
        ) : (
          <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="min-w-0 flex-1 text-left text-[14px] leading-snug">
            <b>{row.title}</b>
            {notOpenYet ? <span className="ml-1.5 align-middle"><Chip tone="gold">10/15 開放</Chip></span> : null}
            <span className="block text-[12px] ink-soft">
              {[
                row.from !== undefined && row.to !== undefined ? levelRange(row.from, row.to) : null,
                row.party ? "組隊" : null,
                names || null,
              ].filter(Boolean).join(" · ")}
              {row.why ? <span className="ml-1 whitespace-nowrap text-[color:var(--sky)]">{open ? "收起" : "為什麼"}</span> : null}
            </span>
          </button>
        )}
        {row.go !== undefined ? (
          <GoButton to={row.go} label="去" />
        ) : row.pq ? (
          <Link href={row.pq.guide} className="tap-safe inline-flex shrink-0 items-center rounded-full bg-[color:var(--sky)] px-3 text-[13px] font-bold text-white">
            圖解
          </Link>
        ) : null}
      </div>
      {row.warn ? <p className="rounded-lg bg-[color:var(--gold-wash)] px-2 py-1 text-[12px]">照遊戲資料不推：{row.warn}</p> : null}
      {open && row.why ? (
        <div className="space-y-1 rounded-lg bg-[color:var(--paper)] p-2">
          <p className="text-[13px] leading-relaxed ink-soft">{row.why}</p>
          <div className="flex flex-wrap items-center justify-between gap-1">
            <SourceLinks urls={row.s ?? []} />
            <SourceTag kind="guide" verified={row.v} />
          </div>
        </div>
      ) : null}
    </li>
  );
}

function MustDoRow({ item }: { item: BandQuest }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="space-y-1">
      <QuestLine as="div" showPrerequisite={false} title={item.title} quests={item.quests} exp={item.exp} extra={levelText(item.fraction)} parts={partsText(item)} />
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] ink-faint">
        Lv.{item.level} 起
        {item.rec ? (
          <button type="button" onClick={() => setOpen(value => !value)} className="rounded-full bg-[color:var(--gold-wash)] px-2 py-0.5 font-bold text-[color:var(--gold)]">
            玩家推薦{open ? "" : "・為什麼"}
          </button>
        ) : null}
      </p>
      {open && item.rec ? (
        <div className="space-y-1 rounded-lg bg-[color:var(--paper)] p-2">
          <p className="text-[13px] leading-relaxed ink-soft">{item.rec.why}</p>
          <SourceLinks urls={item.rec.s} />
        </div>
      ) : null}
    </li>
  );
}

/** 楓之島那一段：照懶人包的第一步寫；離開楓之島之後回不去，不給「去」 */
function IslandStep({ onIsland: island }: { onIsland: boolean }) {
  const step = COMMON_ROUTE[0];
  return (
    <div className="space-y-1.5">
      <p className="text-[14px] font-bold">{step.title}</p>
      <p className="text-[13px] leading-relaxed ink-soft">
        {step.what}
        {step.detail ? ` ${step.detail}` : ""}
      </p>
      {step.mapId ? (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[13px]">
            {step.mobs?.slice(0, 2).map(mob => <Sprite key={mob.id} src={monsterImage(mob.id)} size={26} />)}
            {step.mapName}
          </span>
          {island ? <GoButton to={step.mapId} label="去" /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** 組隊任務的打法：直接跳到懶人包裡那個組隊任務的段落 */
function PqLink({ pqKey, common, text }: { pqKey: string; common: GuideCommon; text: string }) {
  const href = common.pq?.find(pq => pq.key === pqKey)?.guide ?? "/guide";
  return (
    <Link href={href} className="block rounded-lg bg-[color:var(--sky-wash)] px-2.5 py-1.5 text-[13px] font-bold text-[color:var(--sky)]">
      {text}（圖解）→
    </Link>
  );
}

/**
 * 這一段該拿的武器（幾等換哪把、去哪拿）跟武器卷、手套攻擊卷（2026-10-07 使用者：「升級路線每一段也列裝備跟卷」）。
 * 算法在 lib/gear-view.ts 的 bandGear；裝備資料跟首頁「能力值與裝備」卡共用（loadGear 只載一次）。載不到就不顯示這塊。
 */
function BandGearBlock({ job, band, maps }: { job: number; band: Band; maps: Record<string, MapRecord> }) {
  const [gear, setGear] = useState<GearData | null>(null);
  const beforeOpen = useBeforeV002();
  useEffect(() => {
    let cancelled = false;
    loadGear()
      .then(data => {
        if (!cancelled) setGear(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  // 一段是 from 到 to 前一級（下一段從 to 開始）；最後一段（100–120）含上限那一級
  const last = band.to >= LEVEL_CAP ? band.to : band.to - 1;
  const plan = useMemo(() => (gear ? bandGear(gear, job, band.from, last, beforeOpen) : null), [gear, job, band.from, last, beforeOpen]);
  if (!plan || (!plan.weapons.length && !plan.families.length)) return null;
  const magic = isMagicJob(job);
  const label = (id: number) => mapName(maps, id);
  const chip = (later: string | undefined) =>
    later && beforeOpen ? (
      <span className="ml-1 inline-block align-middle">
        <Chip tone="gold">10/15 開放</Chip>
      </span>
    ) : null;

  return (
    <Block label="裝備" tag={<SourceTag kind="data" />}>
      <ul className="space-y-2">
        {plan.weapons.map((entry, index) => (
          <li key={entry.weapon.id} className="flex gap-2">
            <Sprite src={itemImage(entry.weapon.id)} size={28} />
            <span className="min-w-0 text-[13px] leading-snug">
              <span className="whitespace-nowrap font-bold">
                Lv.{entry.level}
                {index > 0 ? " 換" : ""}
              </span>{" "}
              <Link href={`/db/items?id=${entry.weapon.id}`} className="font-bold text-[color:var(--sky)]">
                {entry.weapon.n}
              </Link>
              <span className="whitespace-nowrap ink-soft">（{offenseText(entry.weapon, magic)}）</span>
              {entry.source ? (
                <span className="block text-[12px] ink-soft">
                  {sourceText(entry.source, label)}
                  {chip(sourceOpensLater(entry.source))}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {plan.families.length ? (
        <ul className="space-y-1.5 border-t border-[color:var(--paper-edge)] pt-2">
          {plan.families.map(family => (
            <li key={`${family.slot}:${family.stat}`} className="text-[13px] leading-snug">
              <span className="font-bold">{family.options[0].n}</span>{" "}
              <span className="whitespace-nowrap tabular-nums ink-soft">{family.options.map(option => `${option.rate}%`).join("／")}</span>
              {family.source ? (
                <span className="block text-[12px] ink-soft">
                  {sourceText(family.source, label)}
                  {chip(sourceOpensLater(family.source))}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Block>
  );
}

