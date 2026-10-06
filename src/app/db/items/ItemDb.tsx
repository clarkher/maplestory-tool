"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chip } from "@/components/route/bits";
import { DbBrowser, DetailCard, Section, StatGrid, type DbEntry } from "@/components/DbBrowser";
import { itemImage, loadItems, loadMaps, loadMonsters, loadQuests, monsterImage } from "@/lib/data";
import { equipGroups, jobFit } from "@/lib/item-view";
import { useProfile } from "@/lib/profile";
import { useBeforeV002 } from "@/lib/release";
import type { Item, MapRecord, Monster, Quest } from "@/lib/types";
import { isV002Item, v002MonsterIds, v002QuestIds } from "@/lib/v002";

export function ItemDb() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [monsters, setMonsters] = useState<Monster[] | null>(null);
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [maps, setMaps] = useState<Record<string, MapRecord> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [onlyDroppable, setOnlyDroppable] = useState(false);
  const notOpenYet = useBeforeV002();

  useEffect(() => {
    Promise.all([loadItems(), loadMonsters(), loadQuests(), loadMaps()])
      .then(([itemData, monsterData, questData, mapData]) => {
        setItems(itemData);
        setMonsters(monsterData);
        setQuests(questData);
        setMaps(mapData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  const itemIndex = useMemo(() => new Map((items ?? []).map(item => [String(item.id), item])), [items]);
  const monsterIndex = useMemo(
    () => new Map((monsters ?? []).map(monster => [monster.id, monster])),
    [monsters],
  );
  const questIndex = useMemo(() => new Map((quests ?? []).map(quest => [quest.id, quest])), [quests]);

  /** 道具的 V002 判斷要知道「哪些怪、哪些任務是 V002」，整批算一次給下面兩處用（列表 badge、細節頁 chip）。 */
  const v002Monsters = useMemo(
    () => (maps ? v002MonsterIds(monsters ?? [], maps) : new Set<number>()),
    [monsters, maps],
  );
  const v002Quests = useMemo(
    () => (maps ? v002QuestIds(quests ?? [], maps) : new Set<string>()),
    [quests, maps],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of items ?? []) if (item.c) set.add(item.c);
    return [...set].sort();
  }, [items]);

  const entries = useMemo<DbEntry[]>(() => {
    if (!items) return [];
    return items
      .filter(item => !item.un)
      .filter(item => !category || item.c === category)
      .filter(item => !onlyDroppable || item.dm?.length)
      .map(item => ({
        id: String(item.id),
        name: item.n,
        note: item.s || item.c,
        image: itemImage(item.id),
        keywords: item.d,
        badge: isV002Item(item, v002Monsters, v002Quests) && notOpenYet ? <Chip tone="gold">10/15 開放</Chip> : undefined,
      }));
  }, [items, category, onlyDroppable, v002Monsters, v002Quests, notOpenYet]);

  return (
    <DbBrowser
      title="道具"
      lead="裝備數值、道具說明，以及最重要的：這東西誰會掉、哪個任務給。"
      entries={entries}
      loading={!items || !monsters || !quests || !maps}
      error={error}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={category}
            onChange={event => setCategory(event.target.value)}
            className="tap-safe rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-2.5 py-1.5 text-sm"
            aria-label="道具分類"
          >
            <option value="">全部分類</option>
            {categories.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[13px] ink-soft">
            <input
              type="checkbox"
              checked={onlyDroppable}
              onChange={event => setOnlyDroppable(event.target.checked)}
              className="size-4 accent-[color:var(--maple)]"
            />
            只看打得到的
          </label>
        </div>
      }
      renderDetail={id => {
        const item = itemIndex.get(id);
        if (!item) return null;
        return (
          <ItemDetail
            item={item}
            monsterIndex={monsterIndex}
            questIndex={questIndex}
            isV002={isV002Item(item, v002Monsters, v002Quests)}
          />
        );
      }}
    />
  );
}

function ItemDetail({
  item,
  monsterIndex,
  questIndex,
  isV002,
}: {
  item: Item;
  monsterIndex: Map<number, Monster>;
  questIndex: Map<string, Quest>;
  isV002: boolean;
}) {
  const notOpenYet = useBeforeV002();
  const { profile, isComplete } = useProfile();
  const { requirements, stats } = equipGroups(item);
  const fit = isComplete ? jobFit(item, profile) : null;

  return (
    <DetailCard>
      <header className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={itemImage(item.id)} alt="" width={48} height={48} className="size-12 object-contain" />
        <div className="min-w-0">
          <h2 className="text-2xl font-black leading-tight">
            {item.n}
            {isV002 && notOpenYet ? <span className="ml-1.5 align-middle"><Chip tone="gold">10/15 開放</Chip></span> : null}
          </h2>
          <p className="mt-0.5 text-sm ink-soft">
            {item.c}
            {item.s ? ` · ${item.s}` : ""}
            <span className="ml-2 text-xs ink-faint">#{item.id}</span>
          </p>
        </div>
      </header>

      {item.d ? <p className="whitespace-pre-wrap text-sm leading-relaxed ink-soft">{item.d}</p> : null}

      {requirements.length ? (
        <Section title="穿戴條件" extra={fit ? <Chip tone={fit.tone}>{fit.text}</Chip> : undefined}>
          <StatGrid rows={requirements} />
        </Section>
      ) : null}

      {stats.length ? (
        <Section title="裝備數值">
          <StatGrid rows={stats} />
        </Section>
      ) : null}

      {item.dm?.length ? (
        <Section title="哪些怪會掉" extra="官方未公開機率">
          <ul className="flex flex-wrap gap-1.5">
            {item.dm.map(monsterId => {
              const monster = monsterIndex.get(monsterId);
              return (
                <li key={monsterId}>
                  <Link
                    href={`/db/monsters?id=${monsterId}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--paper-deep)] py-1 pl-1 pr-2.5 transition-colors hover:bg-[color:var(--maple-wash)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={monsterImage(monsterId)} alt="" width={22} height={22} loading="lazy" className="size-[22px] object-contain" />
                    <span className="text-[13px] font-bold">{monster?.n ?? `#${monsterId}`}</span>
                    {monster?.lv ? <span className="text-[11px] tabular-nums ink-faint">Lv{monster.lv}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href={`/plan/farm?want=${item.id}`}
            className="tap-safe mt-1 inline-flex rounded-full bg-[color:var(--leaf)] px-3.5 py-2 text-sm font-bold text-white"
          >
            排出哪張圖收最快
          </Link>
        </Section>
      ) : null}

      {item.qr?.length ? (
        <Section title="哪些任務會給">
          <ul className="space-y-1">
            {item.qr.map(questId => (
              <li key={questId}>
                <Link
                  href={`/db/quests?id=${questId}`}
                  className="block rounded-lg bg-[color:var(--paper-deep)] px-3 py-1.5 text-sm font-bold hover:text-[color:var(--maple)]"
                >
                  {questIndex.get(questId)?.n ?? `任務 ${questId}`}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {item.qq?.length ? (
        <Section title="哪些任務要用到">
          <ul className="space-y-1">
            {item.qq.map(questId => (
              <li key={questId}>
                <Link
                  href={`/db/quests?id=${questId}`}
                  className="block rounded-lg bg-[color:var(--paper-deep)] px-3 py-1.5 text-sm font-bold hover:text-[color:var(--maple)]"
                >
                  {questIndex.get(questId)?.n ?? `任務 ${questId}`}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {!item.dm?.length && !item.qr?.length && !item.qq?.length ? (
        <p className="rounded-xl bg-[color:var(--paper-deep)] px-3 py-2.5 text-sm ink-soft">
          客戶端資料裡沒有記錄這個道具的來源。
          {item.sh ? `商店有販售（${item.sh} 個販賣點）。` : ""}
        </p>
      ) : null}
    </DetailCard>
  );
}
