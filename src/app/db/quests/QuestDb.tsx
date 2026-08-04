"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DbBrowser, DetailCard, Section, type DbEntry } from "@/components/DbBrowser";
import { GoButton } from "@/components/PlanShell";
import { itemImage, loadMaps, loadQuests, mapName, npcImage } from "@/lib/data";
import { rewardSummary } from "@/lib/format";
import type { MapRecord, Quest } from "@/lib/types";

export function QuestDb() {
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [maps, setMaps] = useState<Record<string, MapRecord> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");

  useEffect(() => {
    Promise.all([loadQuests(), loadMaps()])
      .then(([questData, mapData]) => {
        setQuests(questData);
        setMaps(mapData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  const questIndex = useMemo(() => new Map((quests ?? []).map(quest => [quest.id, quest])), [quests]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const quest of quests ?? []) if (quest.cat) set.add(quest.cat);
    return [...set].sort();
  }, [quests]);

  const entries = useMemo<DbEntry[]>(() => {
    if (!quests) return [];
    return quests
      .filter(quest => !category || quest.cat === category)
      .sort((a, b) => (a.minLv ?? 0) - (b.minLv ?? 0))
      .map(quest => ({
        id: quest.id,
        name: quest.n,
        note: quest.minLv ? `Lv.${quest.minLv}` : quest.cat,
        image: quest.sNpc ? npcImage(quest.sNpc.id) : undefined,
        keywords: `${quest.parent ?? ""} ${quest.sNpc?.n ?? ""}`,
      }));
  }, [quests, category]);

  return (
    <DbBrowser
      title="任務"
      lead="每個任務的等級與職業條件、去找誰、要交什麼、完成拿多少。"
      entries={entries}
      loading={!quests || !maps}
      error={error}
      filters={
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
      }
      renderDetail={id => {
        const quest = questIndex.get(id);
        if (!quest || !maps) return null;
        return <QuestDetail quest={quest} maps={maps} questIndex={questIndex} />;
      }}
    />
  );
}

function QuestDetail({
  quest,
  maps,
  questIndex,
}: {
  quest: Quest;
  maps: Record<string, MapRecord>;
  questIndex: Map<string, Quest>;
}) {
  const reward = rewardSummary(quest.exp, quest.money, quest.pop);

  return (
    <DetailCard>
      <header>
        <h2 className="text-2xl font-black leading-tight">{quest.n}</h2>
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

      {quest.needItems?.length ? (
        <Section title="要交的東西">
          <ul className="flex flex-wrap gap-1.5">
            {quest.needItems.map(item => (
              <li key={item.id}>
                <Link
                  href={`/plan/farm?want=${item.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--paper-deep)] py-1 pl-1 pr-2.5 hover:bg-[color:var(--maple-wash)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={itemImage(item.id)} alt="" width={22} height={22} loading="lazy" className="size-[22px] object-contain" />
                  <span className="text-[13px] font-bold">{item.n}</span>
                  {item.c ? <span className="text-[11px] tabular-nums ink-faint">×{item.c}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {quest.needMobs?.length ? (
        <Section title="要打的怪">
          <ul className="flex flex-wrap gap-1.5">
            {quest.needMobs.map(mob => (
              <li key={mob.id}>
                <Link
                  href={`/db/monsters?id=${mob.id}`}
                  className="rounded-full bg-[color:var(--paper-deep)] px-3 py-1 text-[13px] font-bold hover:bg-[color:var(--maple-wash)]"
                >
                  {mob.n}{mob.c ? ` ×${mob.c}` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {quest.rewardItems?.length ? (
        <Section title="完成後拿到">
          <ul className="flex flex-wrap gap-1.5">
            {quest.rewardItems.map(item => (
              <li key={item.id}>
                <Link
                  href={`/db/items?id=${item.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--paper-deep)] py-1 pl-1 pr-2.5 hover:bg-[color:var(--maple-wash)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={itemImage(item.id)} alt="" width={22} height={22} loading="lazy" className="size-[22px] object-contain" />
                  <span className="text-[13px] font-bold">{item.n}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {quest.pre?.length ? (
        <Section title="前置任務">
          <ul className="space-y-1">
            {quest.pre.map(preId => (
              <li key={preId}>
                <Link
                  href={`/db/quests?id=${preId}`}
                  className="block rounded-lg bg-[color:var(--paper-deep)] px-3 py-1.5 text-sm font-bold hover:text-[color:var(--maple)]"
                >
                  {questIndex.get(preId)?.n ?? `任務 ${preId}`}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {quest.texts?.say ? (
        <Section title="任務內容">
          <p className="whitespace-pre-wrap rounded-xl bg-[color:var(--paper-deep)] p-3 text-sm leading-relaxed ink-soft">
            {quest.texts.say}
          </p>
        </Section>
      ) : null}
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
  return (
    <div className="rounded-xl bg-[color:var(--paper-deep)] p-3">
      <p className="text-[11px] ink-faint">{title}</p>
      <div className="mt-1 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={npcImage(npc.id)} alt="" width={32} height={32} className="size-8 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{npc.n}</p>
          {npc.map ? <p className="truncate text-[12px] ink-faint">{mapName(maps, npc.map)}</p> : null}
        </div>
        {npc.map ? <GoButton to={npc.map} label="路線" /> : null}
      </div>
    </div>
  );
}
