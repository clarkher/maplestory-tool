"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import {
  itemImage, loadGraph, loadGuide, loadGuideCommon, loadMaps, loadMeta, loadMonsters, loadNearestTown, loadQuests, loadTraining, monsterImage,
} from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { isSecondJob, isThirdJob, jobOption, jobTier, normalizeJob, previousJob, stageJob } from "@/lib/jobs";
import { effectiveLevels, longRunNow, mainPick, nowQuests, pqJustClosed, townRoute } from "@/lib/now-plan";
import { jobLineage } from "@/lib/planner";
import { useProfile } from "@/lib/profile";
import { useBeforeV002 } from "@/lib/release";
import { bandOf, bandsFor, isIslandMap } from "@/lib/route-planner";
import type { GuideCommon, GuideJob, MapRecord, Meta, Monster, PortalEdge, Quest, TrainingRow } from "@/lib/types";
import { CharacterBar } from "./CharacterBar";
import { NowCard, NowCardSkeleton } from "./NowCard";
import { Panel, SourceTag, Sprite } from "./bits";
import { RouteTimeline } from "./RouteTimeline";
import { SkillStrip } from "./SkillStrip";
import { TodoList } from "./TodoList";

type GameData = {
  maps: Record<string, MapRecord>;
  monsters: Monster[];
  quests: Quest[];
  training: TrainingRow[];
  common: GuideCommon;
  meta: Meta;
  /** 傳送門資料走得到的地圖；組隊任務內部的圖不在裡面，不給「帶我去」 */
  routable: Set<number>;
  graph: Record<string, PortalEdge[]>;
  nearestTown: Record<string, [number, number]>;
};

export type GuideStatus = "loading" | "ready" | "failed";

export function RouteHome() {
  const showV002Banner = useBeforeV002();
  const { profile: stored, setProfile, loaded } = useProfile();
  const profile = useMemo(() => ({ level: stored.level, job: normalizeJob(stored.job) }), [stored]);
  const [data, setData] = useState<GameData | null>(null);
  const [guides, setGuides] = useState<Map<number, GuideJob>>(new Map());
  const [guideStatus, setGuideStatus] = useState<GuideStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadMaps(), loadMonsters(), loadQuests(), loadTraining(), loadGuideCommon(), loadMeta(), loadGraph(), loadNearestTown()])
      .then(([maps, monsters, quests, training, common, meta, graph, nearestTown]) => {
        const routable = new Set<number>(Object.keys(graph).map(Number));
        for (const edges of Object.values(graph)) for (const [target] of edges) routable.add(target);
        setData({ maps, monsters, quests, training, common, meta, routable, graph, nearestTown });
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  // 要同時載整條職業線的攻略：路線前面幾段用的是上一轉的內容（三轉 111 → 111、110、100）
  // 快速切換職業時，晚回來的舊請求不能蓋掉新的；攻略載不到也不擋遊戲資料那部分。
  useEffect(() => {
    if (profile.job <= 0) return;
    let cancelled = false;
    const wanted = jobLineage(profile.job).filter(code => code > 0);
    setGuideStatus("loading");
    Promise.all(wanted.map(job => loadGuide(job).then(guide => [job, guide] as const)))
      .then(entries => {
        if (cancelled) return;
        setGuides(previous => new Map([...previous, ...entries]));
        setGuideStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setGuideStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [profile.job]);

  const ready = loaded && profile.level > 0 && profile.job >= 0;
  const stage = stageJob(profile.job, profile.level);
  const stageGuide = stage ? guides.get(stage) : undefined;
  // 一轉攻略常同時有好幾條主流（海盜分打手線、槍手線），選了二轉或三轉就挑那條二轉的
  const secondJob = isThirdJob(profile.job) ? previousJob(profile.job) : isSecondJob(profile.job) ? profile.job : 0;
  const branchName = secondJob ? jobOption(secondJob)?.name : undefined;
  // 等級段只跟職業有關；固定同一個陣列，升級路線的標籤 memo 才不會每次重算
  const bands = useMemo(() => bandsFor(profile.job), [profile.job]);

  const effective = useMemo(() => (data ? effectiveLevels(data.quests, data.monsters, data.common) : null), [data]);

  // 城鎮走得到才給「去」（跟主推卡的「帶我去」同一個條件）；同一張圖只算一次
  const canGo = useMemo(() => {
    const cache = new Map<number, boolean>();
    return (map: number) => {
      if (!data) return false;
      if (!cache.has(map)) cache.set(map, townRoute(map, data.graph, data.maps, data.nearestTown).hops !== undefined);
      return cache.get(map) as boolean;
    };
  }, [data]);
  // 這一轉的攻略還在載入（主推卡放骨架）；升級路線也先不照主推寫標籤，免得先寫一張遊戲資料的圖又換掉
  const guideLoading = stage > 0 && !stageGuide && guideStatus === "loading";

  const plan = useMemo(() => {
    if (!data || !ready || !effective) return null;
    const monsterIndex = new Map(data.monsters.map(monster => [monster.id, monster]));
    const pick = mainPick({
      level: profile.level,
      job: profile.job,
      guide: stageGuide,
      common: data.common,
      training: data.training,
      monsters: data.monsters,
      maps: data.maps,
      graph: data.graph,
      nearestTown: data.nearestTown,
    });
    const todo = nowQuests({
      level: profile.level,
      job: profile.job,
      quests: data.quests,
      monsters: data.monsters,
      common: data.common,
      maps: data.maps,
      effective,
    });
    // 長線跟先解同一批候選（實際等級、過期都套），規則在 now-plan 的 longRunNow
    const longRun = longRunNow({
      level: profile.level,
      job: profile.job,
      quests: data.quests,
      monsters: data.monsters,
      common: data.common,
      maps: data.maps,
      effective,
    }).slice(0, 3);
    // 組隊任務剛過遊戲上限（超綠 30 等）時，主推卡說一聲
    const pqClosed = pqJustClosed(data.common, profile.job, profile.level, data.quests);
    return { monsterIndex, pick, todo, longRun, pqClosed };
  }, [data, ready, effective, profile, stageGuide]);

  if (error) {
    return <p className="py-10 text-center text-sm ink-soft">資料讀取失敗：{error}。重新整理一次試試。</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3.5 py-3 sm:py-6">
      {/* V002 內容現在就上線，但要等官方 2026/10/15 開機才能玩；10/15 一到自動不再標，不用重新部署 */}
      {showV002Banner ? (
        <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px] leading-relaxed">
          已經照 10/15 改版排好：三轉、Lv.120、天空之城／冰原雪域／廢礦區，要 2026/10/15 開機後才能去。
        </p>
      ) : null}

      {!ready ? (
        <header className="px-1 pt-2 text-center">
          <h1 className="text-[26px] font-black leading-tight sm:text-[34px]">你現在幾等、什麼職業？</h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed ink-soft">
            選好之後，直接告訴你現在去哪練、先解哪些任務、技能點哪個。
          </p>
        </header>
      ) : (
        <h1 className="sr-only">我的升級路線</h1>
      )}

      {loaded ? <CharacterBar profile={profile} onChange={setProfile} /> : <LoadingBlock label="讀取你的角色…" />}

      {ready && !data ? <LoadingBlock label="幫你排路線…" /> : null}

      {ready && data && plan ? (
        <>
          {/* 這一轉的攻略還在載入：先放骨架，不先推一張遊戲資料的圖、攻略到了又換掉 */}
          {guideLoading ? (
            <NowCardSkeleton label={`Lv.${profile.level} ${jobOption(profile.job)?.name ?? "初心者"}・現在去這裡`} />
          ) : plan.pick ? (
            <NowCard
              pick={plan.pick}
              level={profile.level}
              jobName={jobOption(profile.job)?.name ?? "初心者"}
              maps={data.maps}
              monsters={plan.monsterIndex}
              routable={data.routable}
              pqClosed={plan.pqClosed}
            />
          ) : (
            <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px]">這個等級目前找不到適合的練功圖。</p>
          )}

          {/* 換職業或等級時重新掛載，「還有 N 個任務」的展開狀態不帶到別的角色 */}
          <TodoList key={`${profile.job}:${profile.level}`} items={plan.todo} routable={data.routable} maps={data.maps} />

          {stageGuide ? (
            <SkillStrip guide={stageGuide} job={stage} level={profile.level} prefer={branchName} leftover={jobTier(stage) === 3 ? null : data.common.spLeftover} />
          ) : null}
          {stage && !stageGuide && guideStatus === "failed" ? (
            <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px]">技能點法讀取失敗，重新整理一次試試。上面的練功圖跟任務不受影響。</p>
          ) : null}

          {plan.longRun.length ? (
            <Panel title="長線，有空再刷" aside={<SourceTag kind="data" />}>
              <ul className="space-y-2">
                {plan.longRun.map(entry => {
                  const dropper = entry.droppers.map(id => plan.monsterIndex.get(id)).find(Boolean);
                  return (
                    <li key={`${entry.kind}:${entry.id}`} className="flex items-center gap-2.5 text-[13px]">
                      {dropper ? <Sprite src={monsterImage(dropper.id)} size={34} /> : <Sprite src={itemImage(entry.id)} size={28} />}
                      <span className="min-w-0 flex-1 leading-snug">
                        <b>{entry.kind === "kill" ? `打${entry.n}` : entry.n}</b> 累計 {formatNumber(entry.c)} {entry.kind === "kill" ? "隻" : "個"}
                        <span className="block text-[12px] ink-soft">
                          {entry.quests.length} 個任務共 {formatNumber(entry.exp)} 經驗
                          {entry.kind === "item" && dropper ? ` · ${dropper.n} 會掉` : ""}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}

          <section aria-label="升級路線" className="space-y-2.5 pt-2">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-[16px] font-black">升級路線</h2>
              <span className="text-[12px] ink-faint">點開每一段看練功、技能、必解、先存</span>
            </div>
            <RouteTimeline
              key={`${profile.job}:${bandOf(bands, profile.level).from}`}
              job={profile.job}
              prefer={branchName}
              guideStatus={guideStatus}
              level={profile.level}
              bands={bands}
              guides={guides}
              quests={data.quests}
              monsters={data.monsters}
              monsterIndex={plan.monsterIndex}
              maps={data.maps}
              training={data.training.filter(row => !isIslandMap(row.m))}
              common={data.common}
              effective={effective!}
              pick={guideLoading ? undefined : plan.pick}
              canGo={canGo}
            />
          </section>

          <p className="px-1 pt-2 text-[12px] leading-relaxed ink-faint">
            遊戲資料：版本 {data.meta.gameVersion ?? "—"}（{data.meta.dataGeneratedAtText?.slice(0, 10) ?? "—"}）；
            點法、練功點與必解任務整理自巴哈姆特、波波攻略島、楓錄等玩家攻略（{data.common.researchedAt}），每一條都附出處。
            想看全部地圖或任務，去
            <Link href="/db" className="mx-1 font-bold text-[color:var(--sky)]">查資料</Link>。
          </p>
        </>
      ) : null}
    </div>
  );
}
