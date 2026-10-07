"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertIcon, CheckIcon, ChevronDown, PinIcon } from "@/components/Icons";
import { EmptyBlock, GoButton, LoadingBlock, PlanShell } from "@/components/PlanShell";
import { QuestDetailBody } from "@/components/QuestDetailBody";
import { itemImage, loadMaps, loadQuests, mapName, npcImage, peekMaps, peekQuests } from "@/lib/data";
import { rewardSummary } from "@/lib/format";
import { planQuests, QUEST_BUCKET_LABEL, type QuestPlan } from "@/lib/planner";
import { useProfile } from "@/lib/profile";
import type { MapRecord, Quest } from "@/lib/types";

export function QuestPlanner() {
  const { profile, setProfile, loaded } = useProfile();
  // 這次瀏覽載過的資料直接拿：站內換頁進來第一個畫面就是任務清單，不先畫「整理資料中…」
  const [quests, setQuests] = useState<Quest[] | null>(peekQuests);
  const [maps, setMaps] = useState<Record<string, MapRecord> | null>(peekMaps);
  const [error, setError] = useState<string | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);

  useEffect(() => {
    if (quests && maps) return;
    Promise.all([loadQuests(), loadMaps()])
      .then(([questData, mapData]) => {
        setQuests(questData);
        setMaps(mapData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  const plans = useMemo(() => {
    if (!quests || profile.level <= 0) return [];
    return planQuests(profile, quests);
  }, [quests, profile]);

  const ready = Boolean(quests && maps);
  const openNow = plans.filter(plan => plan.blockedBy.length === 0);
  const blocked = plans.filter(plan => plan.blockedBy.length > 0);
  const visible = showBlocked ? plans : openNow;

  return (
    <PlanShell
      title="解任務"
      lead="照你的等級跟職業，把現在接得到的任務挑出來，附上去找誰、要交什麼、拿多少。"
      profile={profile}
      onProfileChange={setProfile}
      needsProfile={loaded && (profile.level <= 0 || profile.job < 0)}
    >
      {error ? (
        <EmptyBlock title="資料載入失敗" hint={error} />
      ) : !ready ? (
        <LoadingBlock />
      ) : plans.length === 0 ? (
        <EmptyBlock
          title={`Lv.${profile.level} 沒有符合的任務`}
          hint="換個等級或職業看看；沒有指定職業時只會列出不限職業的任務。"
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm ink-soft">
              可接 <strong className="text-[color:var(--leaf)]">{openNow.length}</strong> 個
              {blocked.length ? <>，還有 {blocked.length} 個卡在前置任務</> : null}
            </p>
            {blocked.length ? (
              <button
                type="button"
                onClick={() => setShowBlocked(value => !value)}
                className="tap-safe rounded-full bg-[color:var(--paper-deep)] px-3 py-1 text-[13px] font-bold ink-soft hover:text-[color:var(--maple)]"
              >
                {showBlocked ? "只看現在接得到的" : "連卡住的一起看"}
              </button>
            ) : null}
          </div>

          {(["expiring", "fresh", "backlog"] as const).map(bucket => {
            const group = visible.filter(plan => plan.bucket === bucket);
            if (!group.length) return null;
            const label = QUEST_BUCKET_LABEL[bucket];
            return (
              <section key={bucket} className="space-y-2.5">
                <h2 className="flex flex-wrap items-baseline gap-x-2 px-1">
                  <span className="text-[15px] font-black">{label.title}</span>
                  <span className="text-xs ink-faint">{label.hint} · {group.length} 個</span>
                </h2>
                <ul className="space-y-3">
                  {group.slice(0, bucket === "backlog" ? 30 : 100).map(plan => (
                    <QuestCard key={plan.quest.id} plan={plan} maps={maps!} />
                  ))}
                </ul>
                {bucket === "backlog" && group.length > 30 ? (
                  <p className="px-1 text-xs ink-faint">
                    另有 {group.length - 30} 個沒有等級上限的任務沒列出來，先把上面的做完再說。
                  </p>
                ) : null}
              </section>
            );
          })}
        </>
      )}
    </PlanShell>
  );
}

function QuestCard({ plan, maps }: { plan: QuestPlan; maps: Record<string, MapRecord> }) {
  const [open, setOpen] = useState(false);
  const { quest } = plan;
  const blocked = plan.blockedBy.length > 0;
  const startMap = quest.sNpc?.map;
  const reward = rewardSummary(quest.exp, quest.money, quest.pop);

  return (
    <li className="overflow-hidden rounded-[var(--radius-card)] glass wood-frame">
      <div className="p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          {quest.sNpc ? (
            <Image
              src={npcImage(quest.sNpc.id)}
              alt=""
              width={40}
              height={40}
              className="size-10 shrink-0 object-contain"
              unoptimized
            />
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color:var(--gold-wash)] text-[color:var(--gold)]">
              <PinIcon size={19} />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-[17px] font-black leading-tight">{quest.n}</h3>
              <span className="rounded-full bg-[color:var(--paper-deep)] px-2 py-0.5 text-[11px] font-bold ink-soft">
                {quest.cat}
              </span>
              {quest.minLv ? (
                <span className="text-[11px] tabular-nums ink-faint">Lv.{quest.minLv}
                  {quest.maxLv ? `–${quest.maxLv}` : "+"}
                </span>
              ) : null}
              {plan.bucket === "expiring" && plan.levelsLeft !== undefined ? (
                <span className="rounded-full bg-[color:var(--maple)] px-2 py-0.5 text-[11px] font-bold text-white">
                  再 {plan.levelsLeft} 級就接不到
                </span>
              ) : null}
              {blocked ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--maple-wash)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--maple)]">
                  <AlertIcon size={11} />
                  需先完成前置
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--leaf-wash)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--leaf)]">
                  <CheckIcon size={11} />
                  現在可接
                </span>
              )}
            </div>

            {quest.sNpc ? (
              <p className="mt-1 text-sm ink-soft">
                找 <strong className="text-[color:var(--ink)]">{quest.sNpc.n}</strong>
                {startMap ? <>（在 {mapName(maps, startMap)}）</> : null}
              </p>
            ) : null}

            {reward ? (
              <p className="mt-1 text-sm font-bold text-[color:var(--gold)]">{reward}</p>
            ) : null}

            {quest.needItems?.length ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] ink-faint">要交</span>
                {quest.needItems.slice(0, 5).map(item => (
                  <Link
                    key={item.id}
                    href={`/plan/farm?want=${item.id}`}
                    className="inline-flex items-center gap-1 rounded-full bg-[color:var(--paper-deep)] py-0.5 pl-0.5 pr-2 transition-colors hover:bg-[color:var(--maple-wash)]"
                    title="去看這個道具在哪打"
                  >
                    <Image
                      src={itemImage(item.id)}
                      alt=""
                      width={20}
                      height={20}
                      className="size-5 object-contain"
                      unoptimized
                    />
                    <span className="text-[12px] font-bold">{item.n}</span>
                    {item.c ? <span className="text-[11px] tabular-nums ink-faint">×{item.c}</span> : null}
                  </Link>
                ))}
              </div>
            ) : null}

            {quest.needMobs?.length ? (
              <p className="mt-1.5 text-[13px] ink-soft">
                要打：
                {quest.needMobs.map(mob => `${mob.n}${mob.c ? ` ×${mob.c}` : ""}`).join("、")}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[color:var(--paper-edge)] px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          className="tap-safe inline-flex items-center gap-1 text-sm font-bold ink-soft hover:text-[color:var(--maple)]"
          aria-expanded={open}
        >
          {open ? "收起" : "看細節"}
          <ChevronDown size={15} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
        {startMap ? <GoButton to={startMap} label="帶我去接" /> : <span />}
      </div>

      {open ? (
        <div className="border-t border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)]/50 p-3.5">
          {blocked ? (
            <p className="mb-3 rounded-xl bg-[color:var(--maple-wash)] px-3 py-2 text-[13px] font-bold text-[color:var(--maple)]">
              前置任務還沒完成：{plan.blockedBy.join("、")}
            </p>
          ) : null}
          <QuestDetailBody quest={quest} maps={maps} />
        </div>
      ) : null}
    </li>
  );
}
