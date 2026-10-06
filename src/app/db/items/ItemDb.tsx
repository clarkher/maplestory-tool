"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chip } from "@/components/route/bits";
import { DbBrowser, DetailCard, Section, StatGrid, type DbEntry } from "@/components/DbBrowser";
import {
  itemImage, loadItems, loadMaps, loadMonsters, loadQuests, monsterImage, peekItems, peekMaps, peekMonsters, peekQuests,
} from "@/lib/data";
import {
  compareItems, equipGroups, itemKeywords, itemNote, jobLabel, sortCategories, subcategoryOptions, usableBy, wearFit, type WearFit,
} from "@/lib/item-view";
import { useStoredProfile } from "@/lib/profile";
import { useBeforeV002 } from "@/lib/release";
import { useRemembered } from "@/lib/remember";
import type { Item, MapRecord, Monster, Quest } from "@/lib/types";
import { isV002Item, v002MonsterIds, v002QuestIds } from "@/lib/v002";

export function ItemDb() {
  // 這次瀏覽載過就直接用，再進來第一個畫面就是完整清單
  const [items, setItems] = useState<Item[] | null>(peekItems);
  const [monsters, setMonsters] = useState<Monster[] | null>(peekMonsters);
  const [quests, setQuests] = useState<Quest[] | null>(peekQuests);
  const [maps, setMaps] = useState<Record<string, MapRecord> | null>(peekMaps);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useRemembered("db:道具:category", "");
  const [subcategory, setSubcategory] = useRemembered("db:道具:subcategory", "");
  const [onlyDroppable, setOnlyDroppable] = useRemembered("db:道具:onlyDroppable", false);
  const [onlyMine, setOnlyMine] = useRemembered("db:道具:onlyMine", false);
  const notOpenYet = useBeforeV002();
  // 同步讀角色：按返回時第一個畫面就套上「只看〇〇能用的」，清單才跟離開時一樣
  const { profile, loaded, isComplete } = useStoredProfile();
  /** 角色列選了職業就出現「只看〇〇能用的裝備」，不用填等級（這個篩選本來就不看等級） */
  const mineName = loaded && profile.job >= 0 ? jobLabel(profile.job) : null;

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
    return sortCategories([...set]);
  }, [items]);

  /** 清單預設順序：裝備在前、依需求等級由低到高（原本依名稱，一打開是一整排勳章） */
  const sortedItems = useMemo(() => (items ?? []).filter(item => !item.un).sort(compareItems), [items]);

  /** 搜尋關鍵字只跟道具本身有關，載完算一次，切篩選不用重算一萬多筆 */
  const keywordsById = useMemo(() => new Map(sortedItems.map(item => [item.id, itemKeywords(item)])), [sortedItems]);

  const mineOnly = onlyMine && mineName !== null;
  /** 種類下拉只列篩選後還有東西的種類：劍士勾了「只看能用的」不會看到拳套，勾了「只看打得到的」不會看到沒人掉的種類 */
  const subcategories = useMemo(() => {
    if (!category) return [];
    const pool = sortedItems.filter(item => (!onlyDroppable || item.dm?.length) && (!mineOnly || usableBy(item, profile.job)));
    return subcategoryOptions(pool, category);
  }, [sortedItems, category, onlyDroppable, mineOnly, profile.job]);

  /** 選的種類在新的篩選下沒東西了，畫面當場回到全部種類（不等 effect，不會先閃一次空清單） */
  const activeSubcategory = subcategories.includes(subcategory) ? subcategory : "";
  // 狀態也一起清掉，之後取消勾選才不會突然跳回先前選的種類
  useEffect(() => {
    if (subcategory !== activeSubcategory) setSubcategory(activeSubcategory);
  }, [subcategory, activeSubcategory]);

  const entries = useMemo<DbEntry[]>(() => {
    return sortedItems
      .filter(item => !category || item.c === category)
      .filter(item => !activeSubcategory || item.s === activeSubcategory)
      .filter(item => !onlyDroppable || item.dm?.length)
      .filter(item => !mineOnly || usableBy(item, profile.job))
      .map(item => ({
        id: String(item.id),
        name: item.n,
        note: itemNote(item),
        image: itemImage(item.id),
        keywords: keywordsById.get(item.id),
        badge: isV002Item(item, v002Monsters, v002Quests) && notOpenYet ? <Chip tone="gold">10/15 開放</Chip> : undefined,
      }));
  }, [sortedItems, keywordsById, category, activeSubcategory, onlyDroppable, mineOnly, profile.job, v002Monsters, v002Quests, notOpenYet]);

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
            onChange={event => {
              setCategory(event.target.value);
              setSubcategory("");
              // 「只看〇〇能用的裝備」只看裝備分類，換到別的分類就一起取消
              if (event.target.value !== "裝備") setOnlyMine(false);
            }}
            className="tap-safe rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-2.5 py-1.5 text-sm"
            aria-label="道具分類"
          >
            <option value="">全部分類</option>
            {categories.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {subcategories.length ? (
            <select
              value={activeSubcategory}
              onChange={event => setSubcategory(event.target.value)}
              className="tap-safe rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-2.5 py-1.5 text-sm"
              aria-label="道具種類"
            >
              <option value="">全部種類</option>
              {subcategories.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          ) : null}
          <label className="flex items-center gap-2 text-[13px] ink-soft">
            <input
              type="checkbox"
              checked={onlyDroppable}
              onChange={event => setOnlyDroppable(event.target.checked)}
              className="size-4 accent-[color:var(--maple)]"
            />
            只看打得到的
          </label>
          {mineName ? (
            <label className="flex items-center gap-2 text-[13px] ink-soft">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={event => {
                  setOnlyMine(event.target.checked);
                  if (event.target.checked && category !== "裝備") {
                    setCategory("裝備");
                    setSubcategory("");
                  }
                }}
                className="size-4 accent-[color:var(--maple)]"
              />
              只看{mineName}能用的裝備
            </label>
          ) : null}
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
            fit={isComplete ? wearFit(item, profile) : null}
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
  fit,
}: {
  item: Item;
  monsterIndex: Map<number, Monster>;
  questIndex: Map<string, Quest>;
  isV002: boolean;
  /** 穿戴條件旁的小標籤；角色列沒選職業或沒填等級時是 null */
  fit: WearFit | null;
}) {
  const notOpenYet = useBeforeV002();
  const { requirements, stats } = equipGroups(item);

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
