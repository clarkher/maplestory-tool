"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "@/components/Icons";
import { LoadingBlock } from "@/components/PlanShell";
import { useBuildChoice } from "@/lib/build-choice";
import { loadGear, loadGuide, loadMaps, loadMonsters, loadSkills, loadTraining } from "@/lib/data";
import {
  clampState,
  computeGroup,
  defaultState,
  diffText,
  groupLabels,
  monsterChoices,
  parseState,
  type CalcData,
  type CalcState,
  type GroupConfig,
  type SharedConfig,
} from "@/lib/damage-view";
import type { GearData } from "@/lib/gear";
import { minLevelFor } from "@/lib/jobs";
import { jobLineage } from "@/lib/planner";
import { useStoredProfile } from "@/lib/profile";
import { useBeforeV002 } from "@/lib/release";
import type { GuideJob, MapRecord, Monster, Skill, TrainingRow } from "@/lib/types";
import { useVisitState } from "@/lib/visit-state";
import { KillCard } from "./KillCard";
import { GroupEditor, HowCard, ResultCard, SharedCard } from "./parts";

type BaseData = { gear: GearData; skills: Map<number, Skill>; monsters: Monster[]; maps: Record<string, MapRecord>; training: TrainingRow[] };

/** 這個職業一路上來的攻略（一轉→三轉）；載完才回物件，載不到的那轉是 undefined（畫面退回技能最高等級） */
function useGuides(job: number): Record<number, GuideJob | undefined> | null {
  const [loaded, setLoaded] = useState<{ job: number; guides: Record<number, GuideJob | undefined> } | null>(null);
  useEffect(() => {
    if (job <= 0) return;
    let cancelled = false;
    const codes = jobLineage(job).filter(code => code > 0);
    Promise.all(codes.map(code => loadGuide(code).then(guide => [code, guide] as const, () => [code, undefined] as const))).then(entries => {
      if (!cancelled) setLoaded({ job, guides: Object.fromEntries(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [job]);
  return loaded?.job === job ? loaded.guides : null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-3 sm:py-6">
      <nav aria-label="麵包屑" className="flex items-center gap-1 text-sm ink-faint">
        <Link href="/db" className="hover:text-[color:var(--maple)]">查資料</Link>
        <ChevronRight size={13} />
        <span className="text-[color:var(--ink-soft)]">傷害計算機</span>
      </nav>
      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">傷害計算機</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">選武器、能力值、技能，看打一下多痛；兩套並排，直接看差多少。</p>
      </header>
      {children}
    </div>
  );
}

export function DamageCalculator() {
  const { profile, loaded } = useStoredProfile();
  const beforeOpen = useBeforeV002();
  const [base, setBase] = useState<BaseData | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useVisitState<string | null>("damage:state", null);
  const [active, setActive] = useVisitState<number>("damage:tab", 0);
  // 換職業：先記下要換成誰，等那個職業的攻略載好再算預設
  const [pendingJob, setPendingJob] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadGear(), loadSkills(), loadMonsters(), loadMaps(), loadTraining()])
      .then(([gear, skills, monsters, maps, training]) => {
        if (!cancelled) setBase({ gear, skills: new Map(skills.map(skill => [skill.id, skill])), monsters, maps, training });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 記下的設定：型別對才用；等級另外夾回這個職業的範圍（parseState 只看型別，不看轉職等級）
  const savedState = useMemo(() => {
    const parsed = parseState(saved);
    return parsed ? clampState(parsed) : null;
  }, [saved]);
  const job = pendingJob ?? savedState?.shared.job ?? profile.job;
  const [buildTab] = useBuildChoice(Math.max(job, 0));
  const guides = useGuides(job);
  const data: CalcData | null = useMemo(
    () => (base && guides ? { ...base, guides, beforeOpen } : null),
    [base, guides, beforeOpen],
  );
  const startLevel = Math.max(profile.level || 0, job > 0 ? minLevelFor(job) : 1);

  useEffect(() => {
    if (pendingJob === null || !data) return;
    setSaved(JSON.stringify(defaultState(data, pendingJob, Math.max(savedState?.groups[0].level ?? startLevel, minLevelFor(pendingJob)), buildTab)));
    setPendingJob(null);
  }, [pendingJob, data, savedState, startLevel, buildTab, setSaved]);

  const state: CalcState | null = useMemo(() => {
    if (pendingJob !== null || !data || job <= 0) return null;
    return savedState ?? defaultState(data, job, startLevel, buildTab);
  }, [pendingJob, data, job, savedState, startLevel, buildTab]);

  // 怪物選單、打的怪、兩組的結果：每次按 −／＋ 都會重畫，不重算（選單要重排一百多隻怪，兩組要各算一遍）
  const choices = useMemo(() => (base ? monsterChoices(base.monsters, base.maps) : []), [base]);
  const target = useMemo(
    () => (data && state && state.shared.monsterId !== null ? data.monsters.find(monster => monster.id === state.shared.monsterId) ?? null : null),
    [data, state],
  );
  const calc = useMemo(() => {
    if (!data || !state) return null;
    const results = [computeGroup(data, state.shared, state.groups[0], target), computeGroup(data, state.shared, state.groups[1], target)] as const;
    const labels = groupLabels(state.groups);
    return { results, labels, diff: diffText(labels, results[0], results[1]) };
  }, [data, state, target]);

  if (failed) return <Shell><p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px]">資料讀取失敗，重新整理一次試試。</p></Shell>;
  if (!loaded) return <Shell><LoadingBlock /></Shell>;

  const update = (next: CalcState) => setSaved(JSON.stringify(next));
  const pickJob = (next: number) => setPendingJob(next);

  if (job <= 0) {
    return (
      <Shell>
        <SharedCard data={null} state={null} job={job} onJob={pickJob} onShared={() => {}} choices={choices} beforeOpen={beforeOpen} />
        <p className="rounded-[var(--radius-card)] border border-dashed border-[color:var(--paper-edge)] px-4 py-8 text-center text-[15px] ink-soft">
          {job === 0 ? "轉職後才有攻擊技能可以算，先選一個職業看看" : "先選職業，下面就會算出來"}
        </p>
      </Shell>
    );
  }
  // 換職業、資料還在載：共用設定卡照樣畫在原位（職業那格的焦點才不會掉），載入中的字放在它下面
  if (!data || !state || !calc) {
    return (
      <Shell>
        <SharedCard data={data} state={state} job={job} onJob={pickJob} onShared={() => {}} choices={choices} beforeOpen={beforeOpen} />
        <LoadingBlock label="整理武器、技能跟怪物中…" />
      </Shell>
    );
  }

  const setShared = (patch: Partial<SharedConfig>) => update({ ...state, shared: { ...state.shared, ...patch } });
  const setGroup = (index: 0 | 1, next: GroupConfig) =>
    update({ ...state, groups: (index === 0 ? [next, state.groups[1]] : [state.groups[0], next]) as [GroupConfig, GroupConfig] });
  const { results, labels, diff } = calc;
  const tab = (active === 1 ? 1 : 0) as 0 | 1;

  return (
    <Shell>
      <SharedCard data={data} state={state} job={job} onJob={pickJob} onShared={setShared} choices={choices} beforeOpen={beforeOpen} />
      <ResultCard data={data} state={state} labels={labels} results={results} target={target} diff={diff} />
      <KillCard data={data} state={state} active={tab} label={labels[tab]} onPick={monsterId => setShared({ monsterId })} beforeOpen={beforeOpen} choices={choices} />
      <GroupEditor data={data} state={state} labels={labels} result={results[tab]} active={tab} onActive={index => setActive(index)} onGroup={setGroup} />
      <HowCard data={data} job={job} level={state.groups[0].level} />
    </Shell>
  );
}
