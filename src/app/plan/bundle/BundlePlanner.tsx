"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "@/components/Icons";
import { EmptyBlock, GoButton, LoadingBlock, PlanShell } from "@/components/PlanShell";
import {
  itemImage, loadFarming, loadMaps, loadMonsters, loadQuests, mapName, monsterImage,
} from "@/lib/data";
import { formatCompact, formatNumber } from "@/lib/format";
import { planQuestBundles, type QuestBundle } from "@/lib/planner";
import { useProfile } from "@/lib/profile";
import type { FarmingRow, MapRecord, Monster, Quest } from "@/lib/types";

export function BundlePlanner() {
  const { profile, setProfile, loaded } = useProfile();
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [farming, setFarming] = useState<Record<string, FarmingRow[]> | null>(null);
  const [monsters, setMonsters] = useState<Monster[] | null>(null);
  const [maps, setMaps] = useState<Record<string, MapRecord> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadQuests(), loadFarming(), loadMonsters(), loadMaps()])
      .then(([questData, farmData, monsterData, mapData]) => {
        setQuests(questData);
        setFarming(farmData);
        setMonsters(monsterData);
        setMaps(mapData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  const monsterIndex = useMemo(
    () => new Map((monsters ?? []).map(monster => [monster.id, monster])),
    [monsters],
  );

  const bundles = useMemo(() => {
    if (!quests || !farming || !monsterIndex.size || profile.level <= 0) return [];
    return planQuestBundles(profile, quests, farming, monsterIndex);
  }, [quests, farming, monsterIndex, profile]);

  const ready = Boolean(quests && farming && monsters && maps);
  const multi = bundles.filter(bundle => bundle.quests.length > 1);
  const single = bundles.filter(bundle => bundle.quests.length === 1);

  return (
    <PlanShell
      title="任務打包"
      lead="把要跑同一張圖的任務併成一趟，先看哪一趟拿最多。出門前就知道要收滿多少個。"
      profile={profile}
      onProfileChange={setProfile}
      needsProfile={loaded && (profile.level <= 0 || profile.job < 0)}
    >
      {error ? (
        <EmptyBlock title="資料載入失敗" hint={error} />
      ) : !ready ? (
        <LoadingBlock />
      ) : bundles.length === 0 ? (
        <EmptyBlock
          title={`Lv.${profile.level} 沒有需要打怪或收集的任務`}
          hint="你現在能接的任務都是對話類的，直接去解任務那頁看。"
        />
      ) : (
        <>
          <p className="rounded-xl bg-[color:var(--sky-wash)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
            <strong className="font-bold">總獎勵</strong>是這張圖能推進的任務全部完成後加起來的量，依此排序。
            數量的算法：<strong className="font-bold">收集品相加</strong>（交出去就被收走，兩個任務各要 50 和 40 就得收滿 90）、
            <strong className="font-bold">討伐數取最大</strong>（擊殺數各任務同時累加，一個要 99 隻、一個要 999 隻，打滿 999 兩個一起完成）。
          </p>

          {multi.length ? (
            <section className="space-y-2.5">
              <h2 className="flex flex-wrap items-baseline gap-x-2 px-1">
                <span className="text-[15px] font-black">一趟推進多個任務</span>
                <span className="text-xs ink-faint">{multi.length} 個地點 · 依總經驗排序</span>
              </h2>
              <ul className="space-y-3">
                {multi.map(bundle => (
                  <BundleCard
                    key={bundle.map}
                    bundle={bundle}
                    maps={maps!}
                    monsterIndex={monsterIndex}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {single.length ? (
            <section className="space-y-2.5">
              <h2 className="flex flex-wrap items-baseline gap-x-2 px-1">
                <span className="text-[15px] font-black">只推進一個任務</span>
                <span className="text-xs ink-faint">併不起來，但還是得跑</span>
              </h2>
              <ul className="space-y-3">
                {single.slice(0, 10).map(bundle => (
                  <BundleCard
                    key={bundle.map}
                    bundle={bundle}
                    maps={maps!}
                    monsterIndex={monsterIndex}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </PlanShell>
  );
}

function BundleCard({
  bundle,
  maps,
  monsterIndex,
}: {
  bundle: QuestBundle;
  maps: Record<string, MapRecord>;
  monsterIndex: Map<number, Monster>;
}) {
  const [open, setOpen] = useState(false);
  const record = maps[String(bundle.map)];

  return (
    <li className="overflow-hidden rounded-[var(--radius-card)] glass wood-frame">
      <div className="p-3.5 sm:p-4">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="text-[17px] font-black leading-tight">{mapName(maps, bundle.map)}</h3>
          {record?.st ? <span className="text-xs ink-faint">{record.st}</span> : null}
        </div>

        {/* 玩家真正在比的是「這趟拿多少」，所以獎勵放最上面、字最大 */}
        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1 rounded-xl bg-[color:var(--gold-wash)] px-3 py-2.5">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-bold ink-faint">總經驗</span>
            <span className="text-2xl font-black tabular-nums leading-none text-[color:var(--gold)]">
              {formatCompact(bundle.reward.exp)}
            </span>
          </span>
          {bundle.reward.money ? (
            <span className="flex items-baseline gap-1">
              <span className="text-[11px] ink-faint">楓幣</span>
              <span className="font-black tabular-nums">{formatCompact(bundle.reward.money)}</span>
            </span>
          ) : null}
          {bundle.reward.pop ? (
            <span className="flex items-baseline gap-1">
              <span className="text-[11px] ink-faint">人氣</span>
              <span className="font-black tabular-nums">+{bundle.reward.pop}</span>
            </span>
          ) : null}
          {bundle.reward.items ? (
            <span className="flex items-baseline gap-1">
              <span className="text-[11px] ink-faint">道具</span>
              <span className="font-black tabular-nums">{bundle.reward.items} 樣</span>
            </span>
          ) : null}
          {bundle.reward.maybeItems ? (
            <span className="flex items-baseline gap-1">
              <span className="text-[11px] ink-faint">另有</span>
              <span className="font-bold tabular-nums">{bundle.reward.maybeItems} 樣隨機／職業限定</span>
            </span>
          ) : null}
          <span className="ml-auto rounded-full bg-[color:var(--leaf-wash)] px-2.5 py-1 text-[12px] font-bold text-[color:var(--leaf)]">
            {bundle.quests.length} 個任務
          </span>
        </div>

        <div className="min-w-0">

          <ul className="mt-2 space-y-1.5">
            {bundle.targets.map(target => (
              <li
                key={`${target.kind}-${target.id}`}
                className="flex items-center gap-2 rounded-xl bg-[color:var(--paper-deep)] px-2 py-1.5"
              >
                <Image
                  src={target.kind === "item" ? itemImage(target.id) : monsterImage(target.id)}
                  alt=""
                  width={24}
                  height={24}
                  className="size-6 shrink-0 object-contain"
                  unoptimized
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
                  {target.name}
                  <span className="ml-1 text-[11px] font-normal ink-faint">
                    {target.kind === "item" ? "收集" : "討伐"}
                  </span>
                </span>
                <span className="shrink-0 text-[15px] font-black tabular-nums text-[color:var(--maple)]">
                  {target.total}
                </span>
                {target.from.length > 1 ? (
                  <span className="shrink-0 text-[11px] tabular-nums ink-faint">
                    {target.kind === "item"
                      ? `= ${target.from.map(entry => entry.count).join(" + ")}`
                      : `涵蓋 ${target.from.length} 個任務`}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <p className="mt-2 text-[12px] ink-faint">
            {bundle.spawn > 0 ? `目標怪在這張圖有 ${bundle.spawn} 個刷怪點` : "這張圖沒有刷怪點資料"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[color:var(--paper-edge)] px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          className="tap-safe inline-flex items-center gap-1 text-sm font-bold ink-soft hover:text-[color:var(--maple)]"
          aria-expanded={open}
        >
          {open ? "收起" : `看是哪 ${bundle.quests.length} 個任務`}
          <ChevronDown size={15} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
        <GoButton to={bundle.map} />
      </div>

      {open ? (
        <div className="space-y-2 border-t border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)]/50 p-3.5">
          <ul className="space-y-1">
            {bundle.quests
              .slice()
              .sort((a, b) => (b.exp ?? 0) - (a.exp ?? 0))
              .map(quest => (
                <li key={quest.id}>
                  <Link
                    href={`/db/quests?id=${quest.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-[color:var(--paper)] px-3 py-2 text-sm hover:text-[color:var(--maple)]"
                  >
                    <span className="min-w-0 truncate font-bold">{quest.name}</span>
                    {quest.exp ? (
                      <span className="shrink-0 text-[12px] font-bold tabular-nums text-[color:var(--gold)]">
                        經驗 {formatNumber(quest.exp)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
          </ul>
          <div className="space-y-1.5 pt-1">
            {bundle.targets.map(target => (
              <p key={`${target.kind}-${target.id}`} className="text-[12px] leading-relaxed ink-soft">
                <strong className="text-[color:var(--ink)]">{target.name} {target.total}</strong>
                {target.kind === "item" ? " = " : "：打滿就同時完成 "}
                {target.from.map(entry => `${entry.questName} ${entry.count}`).join(target.kind === "item" ? " + " : "、")}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}
