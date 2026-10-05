"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import {
  itemImage, loadGraph, loadGuide, loadGuideCommon, loadMaps, loadMeta, loadMonsters, loadNearestTown, loadQuests, loadTraining, monsterImage,
} from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { baseJob, isSecondJob, jobOption, normalizeJob, stageJob } from "@/lib/jobs";
import { effectiveLevels, longRunNow, mainPick, nowQuests } from "@/lib/now-plan";
import { useProfile } from "@/lib/profile";
import { bandOf, bandsFor, isIslandMap } from "@/lib/route-planner";
import type { GuideCommon, GuideJob, MapRecord, Meta, Monster, PortalEdge, Quest, TrainingRow } from "@/lib/types";
import { CharacterBar } from "./CharacterBar";
import { NowCard } from "./NowCard";
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

  // 二轉職業要同時載一轉的攻略：路線 10–30 那幾段用的是一轉內容。
  // 快速切換職業時，晚回來的舊請求不能蓋掉新的；攻略載不到也不擋遊戲資料那部分。
  useEffect(() => {
    if (profile.job <= 0) return;
    let cancelled = false;
    const wanted = [baseJob(profile.job), ...(isSecondJob(profile.job) ? [profile.job] : [])];
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
  // 一轉攻略常同時有好幾條主流（海盜分打手線、槍手線），選了二轉職業就挑那條
  const branchName = isSecondJob(profile.job) ? jobOption(profile.job)?.name : undefined;

  const effective = useMemo(() => (data ? effectiveLevels(data.quests, data.monsters, data.common) : null), [data]);

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
    return { monsterIndex, pick, todo, longRun };
  }, [data, ready, effective, profile, stageGuide]);

  if (error) {
    return <p className="py-10 text-center text-sm ink-soft">資料讀取失敗：{error}。重新整理一次試試。</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3.5 py-3 sm:py-6">
      {!ready ? (
        <header className="px-1 pt-2 text-center">
          <h1 className="text-[26px] font-black leading-tight sm:text-[34px]">你現在幾等、什麼職業？</h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed ink-soft">
            選好之後，直接告訴你今天去哪練、技能點哪個、哪些任務順便解、材料先存什麼。
          </p>
        </header>
      ) : (
        <h1 className="sr-only">我的升級路線</h1>
      )}

      {loaded ? <CharacterBar profile={profile} onChange={setProfile} /> : <LoadingBlock label="讀取你的角色…" />}

      {ready && !data ? <LoadingBlock label="排今天的路線…" /> : null}

      {ready && data && plan ? (
        <>
          {plan.pick ? (
            <NowCard
              pick={plan.pick}
              level={profile.level}
              jobName={jobOption(profile.job)?.name ?? "初心者"}
              maps={data.maps}
              monsters={plan.monsterIndex}
              routable={data.routable}
            />
          ) : (
            <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px]">這個等級目前找不到適合的練功圖。</p>
          )}

          <TodoList items={plan.todo} routable={data.routable} maps={data.maps} />

          {stageGuide ? (
            <SkillStrip guide={stageGuide} job={stage} level={profile.level} prefer={branchName} leftover={data.common.spLeftover} />
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
              key={`${profile.job}:${bandOf(bandsFor(profile.job), profile.level).from}`}
              job={profile.job}
              prefer={branchName}
              guideStatus={guideStatus}
              routable={data.routable}
              level={profile.level}
              bands={bandsFor(profile.job)}
              guides={guides}
              quests={data.quests}
              monsters={data.monsters}
              monsterIndex={plan.monsterIndex}
              maps={data.maps}
              training={data.training.filter(row => !isIslandMap(row.m))}
              common={data.common}
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
