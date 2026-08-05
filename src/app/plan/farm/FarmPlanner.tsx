"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CloseIcon, SearchIcon } from "@/components/Icons";
import { EmptyBlock, GoButton, LoadingBlock, PlanShell } from "@/components/PlanShell";
import {
  itemImage, loadFarming, loadItems, loadMaps, loadMonsters, loadQuests, mapName, monsterImage,
} from "@/lib/data";
import { MARKET_NOTES, MARKET_SOURCES, MARKET_UPDATED_AT } from "@/lib/market-data";
import { planFarming, searchItems, suggestFarming } from "@/lib/planner";
import { useProfile } from "@/lib/profile";
import type { FarmingRow, Item, MapRecord, Monster, Quest } from "@/lib/types";

export function FarmPlanner() {
  const params = useSearchParams();
  const { profile, setProfile, loaded } = useProfile();

  const [items, setItems] = useState<Item[] | null>(null);
  const [farming, setFarming] = useState<Record<string, FarmingRow[]> | null>(null);
  const [maps, setMaps] = useState<Record<string, MapRecord> | null>(null);
  const [monsters, setMonsters] = useState<Monster[] | null>(null);
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<number[]>([]);

  useEffect(() => {
    Promise.all([loadItems(), loadFarming(), loadMaps(), loadMonsters(), loadQuests()])
      .then(([itemData, farmData, mapData, monsterData, questData]) => {
        setItems(itemData);
        setFarming(farmData);
        setMaps(mapData);
        setMonsters(monsterData);
        setQuests(questData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  // 從任務或道具頁點「這個去哪打」進來時，先幫他勾好
  useEffect(() => {
    const want = params.get("want");
    if (!want) return;
    const wanted = want.split(",").map(Number).filter(Number.isFinite);
    if (wanted.length) setTargets(previous => [...new Set([...previous, ...wanted])]);
  }, [params]);

  const itemIndex = useMemo(() => new Map((items ?? []).map(item => [item.id, item])), [items]);
  const monsterIndex = useMemo(
    () => new Map((monsters ?? []).map(monster => [monster.id, monster])),
    [monsters],
  );

  const suggestions = useMemo(() => {
    if (!items || !quests || !farming || !monsters || profile.level <= 0) return [];
    return suggestFarming(profile, items, quests, farming, monsters);
  }, [items, quests, farming, monsters, profile]);

  const searchResults = useMemo(() => (items ? searchItems(items, query, 12) : []), [items, query]);

  const picks = useMemo(() => {
    if (!farming || targets.length === 0) return [];
    return planFarming(targets, farming);
  }, [farming, targets]);

  const ready = Boolean(items && farming && maps && monsters && quests);

  function toggle(itemId: number) {
    setTargets(previous =>
      previous.includes(itemId) ? previous.filter(id => id !== itemId) : [...previous, itemId]);
  }

  return (
    <PlanShell
      title="刷寶物"
      lead="不用自己想要刷什麼——下面直接列你這等級該收的東西，勾起來就排地圖。"
      profile={profile}
      onProfileChange={setProfile}
      needsProfile={loaded && profile.level <= 0}
    >
      {error ? (
        <EmptyBlock title="資料載入失敗" hint={error} />
      ) : !ready ? (
        <LoadingBlock label="載入道具資料…" />
      ) : (
        <>
          {targets.length ? (
            <section className="rounded-[var(--radius-card)] glass wood-frame p-3.5">
              <p className="mb-2 text-sm font-bold">已選 {targets.length} 樣</p>
              <ul className="flex flex-wrap gap-1.5">
                {targets.map(itemId => (
                  <li key={itemId}>
                    <button
                      type="button"
                      onClick={() => toggle(itemId)}
                      className="tap-safe inline-flex items-center gap-1.5 rounded-full bg-[color:var(--leaf-wash)] py-1 pl-1 pr-2 text-[13px] font-bold text-[color:var(--leaf)]"
                      aria-label={`移除 ${itemIndex.get(itemId)?.n ?? itemId}`}
                    >
                      <Image src={itemImage(itemId)} alt="" width={20} height={20} className="size-5 object-contain" unoptimized />
                      {itemIndex.get(itemId)?.n ?? itemId}
                      <CloseIcon size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {picks.length ? (
            <section className="space-y-3">
              <div className="rounded-xl bg-[color:var(--sky-wash)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
                官方沒有公開掉落機率，所以這裡
                <strong className="font-bold">不給百分比</strong>
                。排序看的是可以查證的事實：這張圖同時掉你幾樣目標、會掉的怪有多少刷怪點。
              </div>
              <ul className="space-y-3">
                {picks.map(pick => (
                  <li key={pick.map} className="rounded-[var(--radius-card)] glass wood-frame p-3.5 sm:p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-[17px] font-black leading-tight">{mapName(maps!, pick.map)}</h3>
                        <p className="mt-0.5 text-xs ink-faint">{maps![String(pick.map)]?.st}</p>
                      </div>
                      <span className="shrink-0 rounded-xl bg-[color:var(--leaf-wash)] px-2.5 py-1 text-center">
                        <span className="block text-lg font-black tabular-nums text-[color:var(--leaf)]">
                          {pick.items.length}
                        </span>
                        <span className="block text-[10px] ink-faint">樣目標</span>
                      </span>
                    </div>

                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {pick.items.map(itemId => (
                        <li key={itemId} className="inline-flex items-center gap-1 rounded-full bg-[color:var(--paper-deep)] py-0.5 pl-0.5 pr-2">
                          <Image src={itemImage(itemId)} alt="" width={20} height={20} className="size-5 object-contain" unoptimized />
                          <span className="text-[12px] font-bold">{itemIndex.get(itemId)?.n ?? itemId}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[12px] ink-faint">會掉的怪</span>
                      {pick.monsters.slice(0, 5).map(monsterId => {
                        const monster = monsterIndex.get(monsterId);
                        if (!monster) return null;
                        return (
                          <span key={monsterId} className="inline-flex items-center gap-1">
                            <Image src={monsterImage(monsterId)} alt="" width={22} height={22} className="size-[22px] object-contain" unoptimized />
                            <span className="text-[12px] font-bold">{monster.n}</span>
                            <span className="text-[11px] tabular-nums ink-faint">Lv{monster.lv}</span>
                          </span>
                        );
                      })}
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[color:var(--paper-edge)] pt-2.5">
                      <span className="text-[13px] ink-soft">
                        {pick.spawn > 0 ? `刷怪點 ${pick.spawn} 個` : "這張圖沒有刷怪點資料"}
                      </span>
                      <GoButton to={pick.map} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {suggestions.length ? (
            <section className="space-y-4">
              {suggestions.map(group => (
                <div key={group.key} className="space-y-2">
                  <h2 className="px-1">
                    <span className="text-[15px] font-black">{group.title}</span>
                    <span className="ml-2 text-xs ink-faint">{group.lead}</span>
                  </h2>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {group.items.map(suggestion => {
                      const picked = targets.includes(suggestion.item.id);
                      return (
                        <li key={suggestion.item.id}>
                          <button
                            type="button"
                            onClick={() => toggle(suggestion.item.id)}
                            className={[
                              "tap-safe flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                              picked
                                ? "bg-[color:var(--leaf-wash)] ring-1 ring-[color:var(--leaf)]"
                                : "glass wood-frame hover:bg-[color:var(--maple-wash)]",
                            ].join(" ")}
                          >
                            <Image
                              src={itemImage(suggestion.item.id)}
                              alt=""
                              width={30}
                              height={30}
                              className="size-[30px] shrink-0 object-contain"
                              unoptimized
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-bold">{suggestion.item.n}</span>
                              <span className="block truncate text-[11px] ink-faint">{suggestion.reason}</span>
                            </span>
                            <span
                              className="shrink-0 text-[11px] font-bold"
                              style={{ color: picked ? "var(--leaf)" : "var(--ink-faint)" }}
                            >
                              {picked ? "已選" : "＋"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {group.key === "money" ? (
                    <div className="space-y-1 rounded-xl bg-[color:var(--paper-deep)] px-3 py-2.5 text-[12px] leading-relaxed ink-soft">
                      {MARKET_NOTES.map(note => (
                        <p key={note}>{note}</p>
                      ))}
                      <p className="pt-1 ink-faint">
                        行情整理自
                        {MARKET_SOURCES.map((source, index) => (
                          <span key={source.url}>
                            {index > 0 ? "、" : ""}
                            <a href={source.url} target="_blank" rel="noopener noreferrer" className="mx-0.5 font-bold text-[color:var(--sky)] hover:underline">
                              {source.name}
                            </a>
                          </span>
                        ))}
                        · 更新於 {MARKET_UPDATED_AT}
                      </p>
                    </div>
                  ) : null}
                </div>
              ))}
            </section>
          ) : profile.level > 0 && !targets.length ? (
            <EmptyBlock
              title={`Lv.${profile.level} 目前沒有推薦`}
              hint="可以用下面的搜尋自己找。"
            />
          ) : null}

          <section className="rounded-[var(--radius-card)] glass wood-frame p-3.5">
            <label className="mb-1.5 block text-sm font-bold">
              自己找
              <span className="ml-1.5 text-xs font-normal ink-faint">知道要什麼就直接搜</span>
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 focus-within:border-[color:var(--maple)]">
              <SearchIcon size={17} className="shrink-0 text-[color:var(--ink-faint)]" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="輸入道具名稱，例如 楓葉、藥水、弓"
                className="tap-safe w-full bg-transparent py-2.5 outline-none"
                aria-label="搜尋道具"
              />
            </div>
            {searchResults.length ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {searchResults.map(item => {
                  const picked = targets.includes(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => toggle(item.id)}
                        className={[
                          "tap-safe inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[13px] font-bold transition-colors",
                          picked ? "bg-[color:var(--leaf)] text-white" : "bg-[color:var(--paper-deep)] hover:bg-[color:var(--maple-wash)]",
                        ].join(" ")}
                      >
                        <Image src={itemImage(item.id)} alt="" width={20} height={20} className="size-5 object-contain" unoptimized />
                        {item.n}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : query.trim() ? (
              <p className="mt-2 text-sm ink-faint">找不到打得到的道具。商店買得到的東西不會出現在這裡。</p>
            ) : null}
          </section>
        </>
      )}
    </PlanShell>
  );
}
