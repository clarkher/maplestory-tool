"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FilterTag } from "@/components/FilterTag";
import { EmptyBlock, GoButton, LoadingBlock, PlanShell } from "@/components/PlanShell";
import { ItemChips } from "@/components/QuestDetailBody";
import { buyQuestRows, shopLine, type BuyQuestRow } from "@/lib/buy-quests";
import { loadBuyQuests, loadQuests, npcImage, peekBuyQuests, peekQuests } from "@/lib/data";
import { useDoneQuests } from "@/lib/done-quests";
import { formatNumber, rewardSummary } from "@/lib/format";
import { npcPlace } from "@/lib/go-label";
import { useProfile } from "@/lib/profile";
import { useRemembered } from "@/lib/remember";
import type { BuyQuestData, Quest } from "@/lib/types";

export function BuyQuestPlanner() {
  const { profile, setProfile, isComplete } = useProfile();
  // 這次瀏覽載過的資料直接拿：站內換頁進來第一個畫面就是清單
  const [quests, setQuests] = useState<Quest[] | null>(peekQuests);
  const [data, setData] = useState<BuyQuestData | null>(peekBuyQuests);
  const [error, setError] = useState<string | null>(null);
  // 跟任務圖鑑同一套：角色填完整才出現「只看我接得到的」；做完的（任務卡按過「我做完了」）不列
  const [onlyEligible, setOnlyEligible] = useRemembered("plan:buy:onlyEligible", false);
  const eligibleOn = onlyEligible && isComplete;
  const done = useDoneQuests();

  useEffect(() => {
    if (quests && data) return;
    Promise.all([loadQuests(), loadBuyQuests()])
      .then(([questData, buyData]) => {
        setQuests(questData);
        setData(buyData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  const rows = useMemo(
    () => (quests && data ? buyQuestRows(data, quests, eligibleOn ? { profile, done } : undefined) : []),
    [quests, data, eligibleOn, profile, done],
  );

  return (
    <PlanShell
      title="拍賣買齊就能交的任務"
      lead="要交的東西全都能在拍賣買到、不用打怪。買齊直接交，先看拿多少經驗、什麼獎勵。"
      profile={profile}
      onProfileChange={setProfile}
      needsProfile={false}
    >
      {error ? (
        <EmptyBlock title="資料載入失敗" hint={error} />
      ) : !quests || !data ? (
        <LoadingBlock />
      ) : (
        <>
          <p className="rounded-xl bg-[color:var(--sky-wash)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
            只列要交的東西<strong className="font-bold">全都能交易</strong>、不用打怪的任務；任務道具不能交易，所以那些任務不列。
            拍賣沒有公開成交價，這裡不寫要花多少。
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-xs ink-faint">共 {rows.length} 個任務 · 經驗高的在前</p>
            {isComplete ? (
              <FilterTag on={onlyEligible} onClick={() => setOnlyEligible(!onlyEligible)}>只看我接得到的</FilterTag>
            ) : null}
          </div>

          {rows.length ? (
            <ul className="space-y-3">
              {rows.map(row => <BuyCard key={row.quest.id} row={row} />)}
            </ul>
          ) : (
            eligibleOn ? (
              <EmptyBlock
                title={`Lv.${profile.level} 現在接得到的任務裡，沒有買齊就能交的`}
                hint="關掉「只看我接得到的」可以看全部。"
              />
            ) : (
              <EmptyBlock title="目前沒有買齊就能交的任務" />
            )
          )}
        </>
      )}
    </PlanShell>
  );
}

function BuyCard({ row }: { row: BuyQuestRow }) {
  const { quest, pre, shops, skills } = row;
  // 楓幣是負的＝交任務要付錢，不是獎勵：獎勵那行只放正的，要付的寫在「要交的東西」底下
  const reward = rewardSummary(quest.exp, quest.money && quest.money > 0 ? quest.money : undefined);
  const pay = quest.money && quest.money < 0 ? -quest.money : 0;
  const sold = (quest.needItems ?? []).filter(item => shops.has(item.id));
  const oldData = sold.some(item => shops.get(item.id)?.o);
  const npc = quest.sNpc;

  return (
    <li className="space-y-3 rounded-[var(--radius-card)] glass wood-frame p-4">
      <header>
        <h2 className="text-[17px] font-black leading-snug">
          <Link href={`/db/quests?id=${quest.id}`} className="hover:text-[color:var(--maple)]">{quest.n}</Link>
        </h2>
        <p className="mt-0.5 text-[12px] ink-faint">
          {quest.cat}
          {quest.minLv ? ` · Lv.${quest.minLv}${quest.maxLv ? `–${quest.maxLv}` : "+"}` : ""}
        </p>
        {reward ? (
          <p className="mt-1 font-bold text-[color:var(--gold)]">{reward}</p>
        ) : (
          <p className="mt-1 text-[13px] ink-soft">不給經驗</p>
        )}
      </header>

      <section>
        <h3 className="mb-1.5 text-[13px] font-black">要交的東西</h3>
        <ItemChips rows={quest.needItems ?? []} />
        {pay ? <p className="mt-1.5 text-[13px] font-bold">另外要付 {formatNumber(pay)} 楓幣</p> : null}
        {sold.length ? (
          <div className="mt-1.5 text-[12px] leading-relaxed ink-soft">
            <p>NPC 商店也買得到{oldData ? "（參考舊版資料，可能有出入）" : ""}</p>
            <ul className="space-y-0.5">
              {sold.map(item => (
                <li key={item.id}>
                  <span className="font-bold">{item.n}</span>：{shopLine(shops.get(item.id)!)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {quest.rewardItems?.length || skills.length ? (
        <section>
          <h3 className="mb-1.5 text-[13px] font-black">完成後拿到</h3>
          {quest.rewardItems?.length ? <ItemChips rows={quest.rewardItems} /> : null}
          {quest.rewardItems?.some(item => item.rand) ? (
            <p className="mt-1 text-[11px] ink-faint">標「隨機」的是從裡面隨機給一樣，不是全拿</p>
          ) : null}
          {skills.length ? (
            <p className="mt-1 text-[13px]">學會技能：<strong className="font-bold">{skills.join("、")}</strong></p>
          ) : null}
        </section>
      ) : null}

      {pre.length ? (
        <p className="text-[13px]">
          <span className="ink-faint">要先做：</span>
          {pre.map((item, index) => (
            <span key={item.id}>
              {index > 0 ? "、" : ""}
              <Link href={`/db/quests?id=${item.id}`} className="font-bold hover:text-[color:var(--maple)]">{item.n}</Link>
            </span>
          ))}
        </p>
      ) : null}

      {npc ? (
        <div className="flex items-center gap-2 rounded-xl bg-[color:var(--paper-deep)] p-2.5">
          <Image src={npcImage(npc.id)} alt="" width={32} height={32} className="size-8 object-contain" unoptimized />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] ink-faint">接任務</p>
            <p className="truncate font-bold">{npc.n}</p>
            {npc.mapName ? <p className="truncate text-[12px] ink-faint">{npc.mapName}</p> : null}
          </div>
          {npc.map ? <GoButton to={npc.map} label="路線" place={npcPlace(npc.n, npc.mapName, npc.mapName ?? "")} /> : null}
        </div>
      ) : null}
    </li>
  );
}
