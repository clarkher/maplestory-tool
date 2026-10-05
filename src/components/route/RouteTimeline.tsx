"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown } from "@/components/Icons";
import { GoButton } from "@/components/PlanShell";
import { itemImage, mapName, monsterImage, skillImage } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { COMMON_ROUTE } from "@/lib/guide-data";
import { jobFit } from "@/lib/job-rules";
import { isSecondJob, stageJob } from "@/lib/jobs";
import { planTraining } from "@/lib/planner";
import {
  type Band, bandLabels, fitLevel, isIslandBand, isIslandMap, mustDoForBand, prepMaterials, segmentsToShow, shortName, spawnIndex, trainingForBand,
} from "@/lib/route-planner";
import { mainBuild, spAtLevel, stepsBetween } from "@/lib/skill-plan";
import type { GuideCommon, GuideJob, MapRecord, Monster, Quest, TrainingRow } from "@/lib/types";
import type { GuideStatus } from "./RouteHome";
import { SourceLinks, SourceTag, Sprite, levelText } from "./bits";
import { QuestLine } from "./QuestLine";

type Context = {
  job: number;
  level: number;
  /** 選了二轉職業時的名稱，一轉攻略有好幾條主流時挑提到它的那條 */
  prefer?: string;
  guideStatus: GuideStatus;
  routable: Set<number>;
  bands: Band[];
  guides: Map<number, GuideJob>;
  quests: Quest[];
  monsters: Monster[];
  monsterIndex: Map<number, Monster>;
  maps: Record<string, MapRecord>;
  training: TrainingRow[];
  common: GuideCommon;
};

/** 升級路線：1→100 一條路，你在哪一段就展開哪一段，其他段點開看。 */
export function RouteTimeline(context: Context) {
  const { bands, level } = context;
  const currentIndex = bands.findIndex(band => level >= band.from && level < band.to);
  const activeIndex = currentIndex < 0 ? bands.length - 1 : currentIndex;
  const [open, setOpen] = useState<Set<number>>(() => new Set([activeIndex]));
  const spawns = useMemo(() => spawnIndex(context.monsters), [context.monsters]);
  const labels = useMemo(
    () => bandLabels(bands, (band, index) => {
      const { stage, guide } = guideFor(context, band);
      // 職業規則擋掉的攻略圖（例：火毒的火焰之地）不拿來當段落標籤；你在的這段用你現在的等級判斷
      return (guide?.train ?? []).filter(segment =>
        !segment.map || jobFit(stage, fitLevel(band, segment, index === activeIndex ? level : undefined), spawns.get(segment.map) ?? [], context.monsterIndex).ok);
    }),
    // context 每次 render 都是新物件；標籤只跟職業、攻略、等級段、現在等級、怪物資料有關（bands 由 RouteHome 固定成同一個陣列）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bands, level, activeIndex, context.job, context.guides, spawns, context.monsterIndex],
  );

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
            band={band}
            next={bands[index + 1]}
            state={index < activeIndex ? "done" : index === activeIndex ? "current" : "future"}
            open={open.has(index)}
            onToggle={() => toggle(index)}
            context={context}
            label={labels[index]}
            spawns={spawns}
          />
        ))}
      </ol>
    </div>
  );
}

function guideFor(context: Context, band: Band): { stage: number; guide?: GuideJob } {
  if (isIslandBand(band)) return { stage: 0 };
  const stage = stageJob(context.job, band.from);
  return { stage, guide: context.guides.get(stage) };
}

function BandItem({
  band,
  next,
  state,
  open,
  onToggle,
  context,
  label,
  spawns,
}: {
  band: Band;
  next?: Band;
  state: "done" | "current" | "future";
  open: boolean;
  onToggle: () => void;
  context: Context;
  label?: string;
  spawns: Map<number, Array<[number, number]>>;
}) {
  const shown = isIslandBand(band)
    ? "楓之島"
    : context.job === 0
      ? "轉職後排給你"
      : label ?? (band.from >= 30 && !isSecondJob(context.job) ? "二轉後排給你" : undefined);
  const range = band.to >= 100 ? `Lv.${band.from}–100` : `Lv.${band.from}–${band.to}`;

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
          <span className={`text-[16px] font-black tabular-nums ${state === "done" && !open ? "ink-faint" : ""}`}>{range}</span>
          {state === "current" ? <span className="text-[13px] font-bold text-[color:var(--maple)]">你在這</span> : null}
          <span className="ml-auto truncate text-[13px] ink-soft">{shown ?? "還沒有玩家攻略"}</span>
          <ChevronDown size={16} className={`shrink-0 ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open ? <BandDetail band={band} next={next} context={context} spawns={spawns} current={state === "current"} /> : null}
      </div>
    </li>
  );
}

function BandDetail({ band, next, context, spawns, current }: {
  band: Band; next?: Band; context: Context; spawns: Map<number, Array<[number, number]>>; current: boolean;
}) {
  const { stage, guide } = guideFor(context, band);
  const { job, quests, monsters, monsterIndex, maps, training, common, prefer, guideStatus, routable } = context;

  const detail = useMemo(() => {
    const all = guide ? trainingForBand(band, guide.train) : [];
    const island = isIslandBand(band);
    const middle = Math.min(99, Math.round((band.from + band.to - 1) / 2));
    // 先判斷職業規則、再挑要列的段落（segmentsToShow），你在的這段用現在等級判斷
    const warnings = new Map(all.flatMap(segment => {
      if (!segment.map) return [];
      const fit = jobFit(stage, fitLevel(band, segment, current ? context.level : undefined), spawns.get(segment.map) ?? [], monsterIndex);
      return fit.ok ? [] : [[segment, fit.note ?? "這個職業不適合"] as const];
    }));
    const segments = segmentsToShow(all, segment => warnings.has(segment));
    const usable = segments.filter(segment => !warnings.has(segment));
    const fallback = usable.length || island
      ? []
      : planTraining(
        { level: middle, job: stage },
        training.filter(row => !isIslandMap(row.m) && maps[String(row.m)]?.zh),
        monsterIndex,
        8,
      ).filter(pick => jobFit(stage, middle, spawns.get(pick.row.m) ?? [], monsterIndex).ok).slice(0, 2);
    const build = guide ? mainBuild(guide.builds, prefer) : undefined;
    // 這段開始前（上一級結束時）到這段最後一級的點數；轉職那一段從 0 起算，才不會漏掉只花 1 點的第一步
    const steps = build && stage ? stepsBetween(build, spAtLevel(stage, band.from - 1), spAtLevel(stage, band.to - 1)) : [];
    const mustDo = mustDoForBand(band, job, quests, common, maps, 4, current ? context.level : undefined);
    const nextMustDo = next ? mustDoForBand(next, job, quests, common, maps, 4) : [];
    const prep = prepMaterials(nextMustDo.flatMap(group => group.picks.map(pick => pick.quest)), monsters)
      .filter(material => material.droppers.length)
      .sort((a, b) => b.c - a.c)
      .slice(0, 5);
    return { segments, fallback, build, steps, mustDo, prep, warnings, usable };
  }, [band, next, guide, stage, job, quests, monsters, monsterIndex, maps, training, common, prefer, spawns, current, context.level]);

  const stuckInFirstJob = band.from >= 30 && !isSecondJob(job) && job !== 0;
  const gap = guide?.gaps?.find(entry => entry.from < band.to && entry.to >= band.from);

  if (job === 0 && !isIslandBand(band)) {
    return (
      <p className="mx-3 mb-3 rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px] leading-relaxed">
        還沒轉職。轉職後到上面「改」選你的職業，這段就會排出練功點、技能點法跟值得解的任務。
      </p>
    );
  }

  return (
    <div className="space-y-2.5 px-3 pb-3">
      {stuckInFirstJob ? (
        <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px] leading-relaxed">
          30 等可以二轉。到上面「改」選你的二轉職業，這段會換成二轉的點法跟練功點。
        </p>
      ) : null}

      <Block label="練功">
        {isIslandBand(band) ? (
          <IslandStep />
        ) : (
          <>
            {detail.segments.length ? (
              <ul className="space-y-2.5">
                {detail.segments.map((segment, index) => (
                  <TrainingSegment key={index} segment={segment} maps={maps} monsterIndex={monsterIndex} routable={routable} warn={detail.warnings.get(segment)} />
                ))}
              </ul>
            ) : null}
            {detail.usable.length === 0 ? (
              !guide && guideStatus === "loading" ? (
                <p className="text-[13px] ink-faint">讀取玩家攻略中…</p>
              ) : !guide && guideStatus === "failed" ? (
                <p className="text-[13px] ink-soft">玩家攻略讀取失敗，重新整理一次試試。</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-[13px] leading-relaxed ink-soft">
                    {detail.segments.length > 0
                      ? "這段的玩家攻略圖不適合你的職業（見上），以下是遊戲資料推算，沒有人實測過。"
                      : "這段還沒有玩家攻略，以下是遊戲資料推算，沒有人實測過。"}
                  </p>
                  {gap ? (
                    <div className="space-y-1 rounded-lg bg-[color:var(--paper)] p-2">
                      <p className="text-[12px] leading-relaxed ink-soft">查攻略時看到的狀況：{gap.t}</p>
                      <SourceLinks urls={gap.s} />
                    </div>
                  ) : null}
                  {detail.fallback.map(pick => (
                    <div key={pick.row.m} className="flex items-center gap-2.5">
                      {pick.lead ? <Sprite src={monsterImage(pick.lead.id)} size={34} /> : null}
                      <span className="min-w-0 flex-1 text-[14px] leading-snug">
                        <b>{mapName(maps, pick.row.m)}</b>
                        <span className="block text-[12px] ink-soft">
                          {pick.lead?.n} Lv{pick.lead?.lv} · 清一輪 {formatNumber(pick.row.exp1)} 經驗
                        </span>
                      </span>
                      <GoButton to={pick.row.m} label="去" />
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <SourceTag kind="data" />
                  </div>
                </div>
              )
            ) : null}
          </>
        )}
        {band.from === 10 || band.from === 8 ? <PqLink text="月妙組隊任務怎麼打" /> : null}
        {band.from === 21 ? <PqLink text="超綠組隊任務怎麼打" /> : null}
      </Block>

      {detail.steps.length && detail.build ? (
        <Block label="技能" tag={<SourceTag kind="guide" verified={detail.build.v} />}>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[14px] font-bold">
            {detail.steps.map((step, index) => (
              <span key={index} className="flex items-center gap-1 whitespace-nowrap">
                {index > 0 ? <span className="ink-faint">→</span> : null}
                <span className="flex items-center gap-1 rounded-lg bg-[color:var(--paper)] px-1.5 py-1">
                  {step.id ? <Sprite src={skillImage(step.id)} size={20} /> : null}
                  {step.name} {step.to}
                </span>
              </span>
            ))}
          </div>
        </Block>
      ) : null}

      {detail.mustDo.length ? (
        <Block label="必解任務" tag={<SourceTag kind="data" />}>
          <ul className="space-y-2">
            {detail.mustDo.map(group => (
              <MustDoRow key={group.key} group={group} />
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

function TrainingSegment({
  segment,
  maps,
  monsterIndex,
  routable,
  warn,
}: {
  segment: GuideJob["train"][number];
  maps: Record<string, MapRecord>;
  monsterIndex: Map<number, Monster>;
  routable: Set<number>;
  warn?: string;
}) {
  const [open, setOpen] = useState(false);
  const lead = segment.mobs.find(id => monsterIndex.has(id));
  return (
    <li className="space-y-1.5">
      <div className="flex items-center gap-2.5">
        {lead ? <Sprite src={monsterImage(lead)} size={34} /> : <span className="size-[34px] shrink-0" />}
        <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="min-w-0 flex-1 text-left text-[14px] leading-snug">
          <b>{segment.map ? mapName(maps, segment.map) : shortName(segment.name)}</b>
          <span className="block text-[12px] ink-soft">
            Lv.{segment.from}–{segment.to}
            {segment.kind === "party" ? " · 組隊" : ""}
            {segment.mobs.length ? ` · ${segment.mobs.map(id => monsterIndex.get(id)?.n).filter(Boolean).slice(0, 3).join("、")}` : ""}
            <span className="ml-1 text-[color:var(--sky)]">{open ? "收起" : "為什麼"}</span>
          </span>
        </button>
        {segment.map && routable.has(segment.map) ? (
          <GoButton to={segment.map} label="去" />
        ) : segment.kind === "party" ? (
          <Link href="/guide" className="tap-safe inline-flex shrink-0 items-center rounded-full bg-[color:var(--sky)] px-3 text-[13px] font-bold text-white">
            圖解
          </Link>
        ) : null}
      </div>
      {warn ? <p className="rounded-lg bg-[color:var(--gold-wash)] px-2 py-1 text-[12px]">照遊戲資料不推：{warn}</p> : null}
      {open ? (
        <div className="space-y-1 rounded-lg bg-[color:var(--paper)] p-2">
          <p className="text-[13px] leading-relaxed ink-soft">{segment.why}</p>
          <div className="flex flex-wrap items-center justify-between gap-1">
            <SourceLinks urls={segment.s} />
            <SourceTag kind="guide" verified={segment.v} />
          </div>
        </div>
      ) : null}
    </li>
  );
}

function MustDoRow({ group }: { group: ReturnType<typeof mustDoForBand>[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="space-y-1">
      <QuestLine as="div" showPrerequisite={false} title={group.title} quests={group.picks.map(pick => pick.quest)} exp={group.exp} extra={levelText(group.fraction)} />
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] ink-faint">
        Lv.{group.level} 起
        {group.rec ? (
          <button type="button" onClick={() => setOpen(value => !value)} className="rounded-full bg-[color:var(--gold-wash)] px-2 py-0.5 font-bold text-[color:var(--gold)]">
            玩家推薦{open ? "" : "・為什麼"}
          </button>
        ) : null}
      </p>
      {open && group.rec ? (
        <div className="space-y-1 rounded-lg bg-[color:var(--paper)] p-2">
          <p className="text-[13px] leading-relaxed ink-soft">{group.rec.why}</p>
          <SourceLinks urls={group.rec.s} />
        </div>
      ) : null}
    </li>
  );
}

function IslandStep() {
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
          <GoButton to={step.mapId} label="去" />
        </div>
      ) : null}
    </div>
  );
}

function PqLink({ text }: { text: string }) {
  return (
    <Link href="/guide" className="block rounded-lg bg-[color:var(--sky-wash)] px-2.5 py-1.5 text-[13px] font-bold text-[color:var(--sky)]">
      {text}（圖解）→
    </Link>
  );
}
