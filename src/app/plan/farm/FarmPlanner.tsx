"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CloseIcon, SearchIcon } from "@/components/Icons";
import { EmptyBlock, GoButton, LoadingBlock, PlanShell } from "@/components/PlanShell";
import {
  itemImage, loadFarming, loadItems, loadMaps, loadMonsters, mapName, monsterImage,
} from "@/lib/data";
import { planFarming, searchItems } from "@/lib/planner";
import { useProfile } from "@/lib/profile";
import type { FarmingRow, Item, MapRecord, Monster } from "@/lib/types";

export function FarmPlanner() {
  const params = useSearchParams();
  const { profile, setProfile } = useProfile();

  const [items, setItems] = useState<Item[] | null>(null);
  const [farming, setFarming] = useState<Record<string, FarmingRow[]> | null>(null);
  const [maps, setMaps] = useState<Record<string, MapRecord> | null>(null);
  const [monsters, setMonsters] = useState<Monster[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<number[]>([]);

  useEffect(() => {
    Promise.all([loadItems(), loadFarming(), loadMaps(), loadMonsters()])
      .then(([itemData, farmData, mapData, monsterData]) => {
        setItems(itemData);
        setFarming(farmData);
        setMaps(mapData);
        setMonsters(monsterData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  // 從任務頁點「這個道具去哪打」進來時，先幫他勾好
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
    if (!items) return [];
    return searchItems(items, query, 12);
  }, [items, query]);

  const picks = useMemo(() => {
    if (!farming || targets.length === 0) return [];
    return planFarming(targets, farming);
  }, [farming, targets]);

  const ready = Boolean(items && farming && maps && monsters);

  function toggle(itemId: number) {
    setTargets(previous =>
      previous.includes(itemId) ? previous.filter(id => id !== itemId) : [...previous, itemId]);
  }

  return (
    <PlanShell
      title="刷寶物"
      lead="勾幾樣你想要的，排出哪一張圖一趟能收最多。"
      profile={profile}
      onProfileChange={setProfile}
      needsProfile={false}
    >
      {error ? (
        <EmptyBlock title="資料載入失敗" hint={error} />
      ) : !ready ? (
        <LoadingBlock label="載入道具資料…" />
      ) : (
        <>
          <div className="rounded-[var(--radius-card)] glass wood-frame p-3.5 sm:p-4">
            <label className="mb-1.5 block text-sm font-bold">你想要什麼？</label>
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

            {suggestions.length ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {suggestions.map(item => {
                  const picked = targets.includes(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => toggle(item.id)}
                        className={[
                          "tap-safe inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[13px] font-bold transition-colors",
                          picked
                            ? "bg-[color:var(--leaf)] text-white"
                            : "bg-[color:var(--paper-deep)] hover:bg-[color:var(--maple-wash)]",
                        ].join(" ")}
                      >
                        <Image
                          src={itemImage(item.id)}
                          alt=""
                          width={20}
                          height={20}
                          className="size-5 object-contain"
                          unoptimized
                        />
                        {item.n}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : query.trim() ? (
              <p className="mt-2 text-sm ink-faint">找不到打得到的道具。商店買得到的東西不會出現在這裡。</p>
            ) : null}

            {targets.length ? (
              <div className="mt-3 border-t border-[color:var(--paper-edge)] pt-3">
                <p className="mb-1.5 text-sm font-bold">目標清單（{targets.length}）</p>
                <ul className="flex flex-wrap gap-1.5">
                  {targets.map(itemId => {
                    const item = itemIndex.get(itemId);
                    return (
                      <li key={itemId}>
                        <button
                          type="button"
                          onClick={() => toggle(itemId)}
                          className="tap-safe inline-flex items-center gap-1.5 rounded-full bg-[color:var(--leaf-wash)] py-1 pl-1 pr-2 text-[13px] font-bold text-[color:var(--leaf)]"
                          aria-label={`移除 ${item?.n ?? itemId}`}
                        >
                          <Image
                            src={itemImage(itemId)}
                            alt=""
                            width={20}
                            height={20}
                            className="size-5 object-contain"
                            unoptimized
                          />
                          {item?.n ?? itemId}
                          <CloseIcon size={13} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>

          {targets.length === 0 ? (
            <EmptyBlock title="先勾幾樣想要的東西" hint="可以一次勾多樣，會幫你找同時掉最多的地圖。" />
          ) : picks.length === 0 ? (
            <EmptyBlock
              title="這些東西沒有已知的怪會掉"
              hint="可能來自任務獎勵、商店或合成。"
            />
          ) : (
            <>
              <p className="rounded-xl bg-[color:var(--sky-wash)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
                官方沒有公開掉落機率，所以這裡
                <strong className="font-bold">不給百分比</strong>
                。排序看的是可以查證的事實：這張圖同時掉你幾樣目標、會掉的怪有多少刷怪點。
              </p>

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
                        <li
                          key={itemId}
                          className="inline-flex items-center gap-1 rounded-full bg-[color:var(--paper-deep)] py-0.5 pl-0.5 pr-2"
                        >
                          <Image
                            src={itemImage(itemId)}
                            alt=""
                            width={20}
                            height={20}
                            className="size-5 object-contain"
                            unoptimized
                          />
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
                            <Image
                              src={monsterImage(monsterId)}
                              alt=""
                              width={22}
                              height={22}
                              className="size-[22px] object-contain"
                              unoptimized
                            />
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
            </>
          )}
        </>
      )}
    </PlanShell>
  );
}
