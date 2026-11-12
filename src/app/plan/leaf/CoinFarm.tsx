"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyBlock, GoButton, LoadingBlock } from "@/components/PlanShell";
import { loadMaps, loadMonsters, loadTraining, mapName, monsterImage, peekMaps, peekMonsters, peekTraining } from "@/lib/data";
import { COIN_MIN_LEVEL, coinRange, planCoinFarm } from "@/lib/leaf-planner/farm";
import { LEVEL_CAP, useStoredProfile } from "@/lib/profile";
import type { MapRecord, Monster, TrainingRow } from "@/lib/types";

/**
 * 去哪打幣（v2.18 使用者：「新增輸入等級，推薦打幣的地圖跟怪物」）：
 * 填等級 → 列會掉商會硬幣、打得快的地圖跟上面的怪。等級先帶站上存的角色，可以改（只在這頁用，不改存的角色）。
 * 地圖、怪的資料比較大，捲到這張卡附近才載。
 */
export function CoinFarm() {
  const { profile } = useStoredProfile();
  const [typed, setTyped] = useState<string | null>(null);
  const [maps, setMaps] = useState<Record<string, MapRecord> | null>(peekMaps);
  const [monsters, setMonsters] = useState<Monster[] | null>(peekMonsters);
  const [training, setTraining] = useState<TrainingRow[] | null>(peekTraining);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (maps && monsters && training) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      Promise.all([loadMaps(), loadMonsters(), loadTraining()])
        .then(([mapData, monsterData, trainingData]) => {
          setMaps(mapData);
          setMonsters(monsterData);
          setTraining(trainingData);
        })
        .catch(loadError => setError(String(loadError.message ?? loadError)));
    }, { rootMargin: "600px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const text = typed ?? (profile.level > 0 ? String(profile.level) : "");
  const level = Math.min(LEVEL_CAP, Number(text) || 0);
  const monsterIndex = useMemo(() => new Map((monsters ?? []).map(monster => [monster.id, monster])), [monsters]);
  const picks = useMemo(
    () => (maps && training && monsterIndex.size ? planCoinFarm(level, training, monsterIndex, maps) : []),
    [level, maps, training, monsterIndex],
  );
  const range = coinRange(level);

  return (
    <section ref={ref} className="rounded-[var(--radius-card)] glass-solid p-4 sm:p-[18px]" aria-label="去哪打幣">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[16px] font-black">去哪打幣</h2>
        <label className="inline-flex items-center gap-1.5 text-[14px] font-bold">
          你的等級
          <input
            type="text"
            inputMode="numeric"
            aria-label="你的等級"
            value={text}
            placeholder="例如 35"
            onChange={event => setTyped(event.target.value.replace(/\D/g, "").slice(0, 3))}
            className="w-20 rounded-[6px] border border-[color:var(--paper-edge)] bg-[color:var(--glass-strong)] px-2.5 py-1.5 text-[15px] font-bold tabular-nums"
          />
        </label>
        {range ? (
          <span className="text-[13px] ink-soft">
            打 <b className="text-[color:var(--ink)]">Lv{range[0]}{range[1] === null ? " 以上" : `～${range[1]}`}</b> 的怪會掉幣，一天最多 100 枚
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed ink-soft">
        一天上限固定 100 枚，所以挑會掉幣的怪多、回得快、打得動的地圖，早點打滿收工。
      </p>

      <div className="mt-3">
        {!level ? (
          <p className="text-[14px] ink-soft">填等級就列出去哪打最快。</p>
        ) : level < COIN_MIN_LEVEL ? (
          <p className="text-[14px] ink-soft">要 {COIN_MIN_LEVEL} 等以上打怪才會掉幣，先升到 {COIN_MIN_LEVEL} 等再來。</p>
        ) : error ? (
          <EmptyBlock title="地圖資料載入失敗" hint={error} />
        ) : !maps || !training || !monsterIndex.size ? (
          <LoadingBlock label="找地圖中…" />
        ) : !picks.length ? (
          <p className="text-[14px] ink-soft">Lv.{level} 找不到大半都是掉幣怪的地圖，換個等級看看。</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {picks.map(pick => {
              const record = maps[String(pick.row.m)];
              const others = pick.row.mobs.filter(([id]) => monsterIndex.has(id) && !pick.coinMobs.some(([coinId]) => coinId === id)).length;
              return (
                <li key={pick.row.m} className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[color:var(--paper-edge)] bg-[color:var(--glass-strong)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-black leading-tight">{mapName(maps, pick.row.m)}</h3>
                      {record?.st ? <p className="text-[12px] ink-faint">{record.st}</p> : null}
                    </div>
                    <GoButton to={pick.row.m} place={mapName(maps, pick.row.m)} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pick.coinMobs.slice(0, 3).map(([id, count]) => {
                      const monster = monsterIndex.get(id)!;
                      return (
                        <span key={id} className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--paper-deep)] py-1 pl-1 pr-2.5">
                          <Image src={monsterImage(id)} alt="" width={22} height={22} className="size-[22px] object-contain" unoptimized />
                          <span className="text-[13px] font-bold">{monster.n}</span>
                          <span className="text-[11px] tabular-nums ink-faint">Lv{monster.lv} ×{count}</span>
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-[12px] ink-soft">
                    會掉幣的怪 {pick.coinSp} 隻・{pick.row.resp} 秒回一次{others ? `・另有 ${others} 種怪不掉幣` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
