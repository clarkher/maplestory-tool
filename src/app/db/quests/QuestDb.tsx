"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chip } from "@/components/route/bits";
import { DbBrowser, DetailCard, Section, type DbEntry } from "@/components/DbBrowser";
import { GoButton } from "@/components/PlanShell";
import { QuestDetailBody } from "@/components/QuestDetailBody";
import { loadMaps, loadQuests, mapName, npcImage, peekMaps, peekQuests } from "@/lib/data";
import { rewardSummary } from "@/lib/format";
import { questEligible } from "@/lib/planner";
import { useStoredProfile } from "@/lib/profile";
import { useBeforeV002 } from "@/lib/release";
import { useRemembered } from "@/lib/remember";
import type { MapRecord, Quest } from "@/lib/types";
import { isV002Map, isV002Quest } from "@/lib/v002";

export function QuestDb() {
  // 這次瀏覽載過就直接用，再進來第一個畫面就是完整清單
  const [quests, setQuests] = useState<Quest[] | null>(peekQuests);
  const [maps, setMaps] = useState<Record<string, MapRecord> | null>(peekMaps);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useRemembered("db:任務:category", "");
  const [onlyEligible, setOnlyEligible] = useRemembered("db:任務:onlyEligible", false);
  const notOpenYet = useBeforeV002();
  // 角色列填了職業和等級才出現「只看我現在接得到的」：跟首頁同一套判斷（等級、等級上限、職業、楓之島）
  const { profile, isComplete } = useStoredProfile();
  const eligibleOn = onlyEligible && isComplete;

  useEffect(() => {
    Promise.all([loadQuests(), loadMaps()])
      .then(([questData, mapData]) => {
        setQuests(questData);
        setMaps(mapData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  const questIndex = useMemo(() => new Map((quests ?? []).map(quest => [quest.id, quest])), [quests]);
  const questNames = useMemo(() => new Map((quests ?? []).map(quest => [quest.id, quest.n])), [quests]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const quest of quests ?? []) if (quest.cat) set.add(quest.cat);
    return [...set].sort();
  }, [quests]);

  const entries = useMemo<DbEntry[]>(() => {
    if (!quests || !maps) return [];
    return quests
      .filter(quest => !category || quest.cat === category)
      .filter(quest => !eligibleOn || questEligible(quest, profile))
      .sort((a, b) => (a.minLv ?? 0) - (b.minLv ?? 0))
      .map(quest => ({
        id: quest.id,
        name: quest.n,
        note: quest.minLv ? `Lv.${quest.minLv}` : quest.cat,
        image: quest.sNpc ? npcImage(quest.sNpc.id) : undefined,
        keywords: `${quest.parent ?? ""} ${quest.sNpc?.n ?? ""}`,
        badge: isV002Quest(quest, maps) && notOpenYet ? <Chip tone="gold">10/15 開放</Chip> : undefined,
      }));
  }, [quests, maps, category, eligibleOn, profile, notOpenYet]);

  return (
    <DbBrowser
      title="任務"
      lead="每個任務的等級與職業條件、去找誰、要交什麼、完成拿多少。"
      entries={entries}
      loading={!quests || !maps}
      error={error}
      filters={
        <div className="space-y-2">
          <select
            value={category}
            onChange={event => setCategory(event.target.value)}
            className="tap-safe rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-2.5 py-1.5 text-sm"
            aria-label="任務分類"
          >
            <option value="">全部分類</option>
            {categories.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {isComplete ? (
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-[13px] ink-soft">
                <input
                  type="checkbox"
                  checked={onlyEligible}
                  onChange={event => setOnlyEligible(event.target.checked)}
                  className="size-4 accent-[color:var(--maple)]"
                />
                只看我現在接得到的
              </label>
              {/* 前置任務做了沒網站不知道，照實說 */}
              {onlyEligible ? <p className="pl-6 text-xs ink-faint">看等級跟職業；前置任務做了沒網站不知道，要自己確認</p> : null}
            </div>
          ) : null}
        </div>
      }
      renderDetail={id => {
        const quest = questIndex.get(id);
        if (!quest || !maps) return null;
        return <QuestDetail quest={quest} maps={maps} questNames={questNames} />;
      }}
    />
  );
}

function QuestDetail({
  quest,
  maps,
  questNames,
}: {
  quest: Quest;
  maps: Record<string, MapRecord>;
  questNames: Map<string, string>;
}) {
  const notOpenYet = useBeforeV002();
  const reward = rewardSummary(quest.exp, quest.money, quest.pop);

  return (
    <DetailCard>
      <header>
        <h2 className="text-2xl font-black leading-tight">
          {quest.n}
          {isV002Quest(quest, maps) && notOpenYet ? <span className="ml-1.5 align-middle"><Chip tone="gold">10/15 開放</Chip></span> : null}
        </h2>
        <p className="mt-1 text-sm ink-soft">
          {quest.cat}
          {quest.parent ? ` · ${quest.parent}` : ""}
          {quest.minLv ? ` · Lv.${quest.minLv}${quest.maxLv ? `–${quest.maxLv}` : "+"}` : ""}
          <span className="ml-2 text-xs ink-faint">#{quest.id}</span>
        </p>
        {reward ? <p className="mt-1 font-bold text-[color:var(--gold)]">{reward}</p> : null}
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        {quest.sNpc ? <NpcBlock title="接任務" npc={quest.sNpc} maps={maps} /> : null}
        {quest.eNpc ? <NpcBlock title="回報" npc={quest.eNpc} maps={maps} /> : null}
      </div>

      <QuestDetailBody quest={quest} maps={maps} questNames={questNames} />
    </DetailCard>
  );
}

function NpcBlock({
  title,
  npc,
  maps,
}: {
  title: string;
  npc: NonNullable<Quest["sNpc"]>;
  maps: Record<string, MapRecord>;
}) {
  const notOpenYet = useBeforeV002();
  return (
    <div className="rounded-xl bg-[color:var(--paper-deep)] p-3">
      <p className="text-[11px] ink-faint">{title}</p>
      <div className="mt-1 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={npcImage(npc.id)} alt="" width={32} height={32} className="size-8 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{npc.n}</p>
          {npc.map ? (
            <p className="flex min-w-0 items-center gap-1.5 text-[12px] ink-faint">
              <span className="min-w-0 truncate">{mapName(maps, npc.map)}</span>
              {isV002Map(maps[String(npc.map)]) && notOpenYet ? <Chip tone="gold">10/15 開放</Chip> : null}
            </p>
          ) : null}
        </div>
        {npc.map ? <GoButton to={npc.map} label="路線" /> : null}
      </div>
    </div>
  );
}
