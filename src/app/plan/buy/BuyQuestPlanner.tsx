"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DoneButton } from "@/components/DoneButton";
import { FilterTag } from "@/components/FilterTag";
import { EmptyBlock, GoButton, LoadingBlock, PlanShell } from "@/components/PlanShell";
import { ItemChips } from "@/components/QuestDetailBody";
import { BIG_AMOUNT, buyQuestRegions, buyQuestRows, displayItemName, shopLine, type BuyQuestRow } from "@/lib/buy-quests";
import { loadBuyQuests, loadNearestTown, loadQuests, npcImage, peekBuyQuests, peekQuests } from "@/lib/data";
import { useDoneQuests } from "@/lib/done-quests";
import { formatNumber, rewardSummary } from "@/lib/format";
import { npcPlace } from "@/lib/go-label";
import { readGoStart } from "@/lib/go-start";
import { useProfile } from "@/lib/profile";
import { useRemembered } from "@/lib/remember";
import type { BuyQuestData, Quest, QuestNpc } from "@/lib/types";
import { useVisitState } from "@/lib/visit-state";

/** 先畫幾張，其餘按「還有 N 個任務」才展開 */
const FIRST_SHOWN = 20;

export function BuyQuestPlanner() {
  const { profile, setProfile, isComplete } = useProfile();
  // 這次瀏覽載過的資料直接拿：站內換頁進來第一個畫面就是清單
  const [quests, setQuests] = useState<Quest[] | null>(peekQuests);
  const [data, setData] = useState<BuyQuestData | null>(peekBuyQuests);
  const [error, setError] = useState<string | null>(null);
  // 跟任務圖鑑同一套：角色填完整才出現「只看我接得到的」；做完的（任務卡按過「我做完了」）不列
  const [onlyEligible, setOnlyEligible] = useRemembered("plan:buy:onlyEligible", false);
  const [noFightOnly, setNoFightOnly] = useRemembered("plan:buy:noFight", false);
  const [region, setRegion] = useRemembered("plan:buy:region", "");
  const eligibleOn = onlyEligible && isComplete;
  const done = useDoneQuests();
  // 在這一頁剛按「我做完了」的先留在畫面上（不然一按就跳走），下次進來才不列
  const [keep, setKeep] = useState<ReadonlySet<string>>(() => new Set());
  const [showAll, setShowAll] = useVisitState("plan:buy:all", false);
  // 「帶我去」選過起點城鎮：起點有賣的店優先（要地圖 → 城鎮的對照，選過起點才載）
  const [startTown, setStartTown] = useState<number | null>(null);
  const [townOf, setTownOf] = useState<((mapId: number) => number | undefined) | null>(null);

  useEffect(() => {
    if (quests && data) return;
    Promise.all([loadQuests(), loadBuyQuests()])
      .then(([questData, buyData]) => {
        setQuests(questData);
        setData(buyData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  useEffect(() => {
    const start = readGoStart();
    if (!start) return;
    loadNearestTown()
      .then(table => {
        setStartTown(start);
        setTownOf(() => (mapId: number) => table[String(mapId)]?.[0]);
      })
      // 載不到就照舊挑最便宜的
      .catch(() => {});
  }, []);

  const doneHere = useMemo(() => new Set([...done].filter(id => !keep.has(id))), [done, keep]);
  const regions = useMemo(() => (quests && data ? buyQuestRegions(data, quests) : []), [quests, data]);
  const rows = useMemo(
    () =>
      quests && data
        ? buyQuestRows(data, quests, {
            eligible: eligibleOn ? profile : undefined,
            done: doneHere,
            noFightChain: noFightOnly,
            region,
            job: profile.job >= 0 ? profile.job : undefined,
            startTown: startTown ?? undefined,
            townOf: townOf ?? undefined,
          })
        : [],
    [quests, data, eligibleOn, profile, doneHere, noFightOnly, region, startTown, townOf],
  );
  const shown = showAll ? rows : rows.slice(0, FIRST_SHOWN);
  const onToggleDone = (id: string) => setKeep(before => new Set(before).add(id));

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
            拍賣沒有公開成交價，只有全部 NPC 商店都買得到的任務才寫要花多少。
          </p>

          <div className="space-y-2 px-1">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={region}
                onChange={event => setRegion(event.target.value)}
                className="tap-safe rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-[color:var(--maple)]"
                aria-label="地區"
              >
                <option value="">全部地區</option>
                {regions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <FilterTag on={noFightOnly} onClick={() => setNoFightOnly(!noFightOnly)}>前面也不用打怪</FilterTag>
              {isComplete ? (
                <FilterTag on={onlyEligible} onClick={() => setOnlyEligible(!onlyEligible)}>只看我接得到的</FilterTag>
              ) : null}
            </div>
            {noFightOnly ? (
              <p className="text-xs ink-faint">前置任務也只要交拍賣買得到的東西、或找人對話；做完的在卡片按<span className="whitespace-nowrap">「我做完了」</span>就不算</p>
            ) : null}
            <p className="text-xs ink-faint">共 {rows.length} 個任務 · 經驗高的在前</p>
          </div>

          {rows.length ? (
            <>
              <ul className="space-y-3">
                {shown.map(row => <BuyCard key={row.quest.id} row={row} onToggleDone={onToggleDone} />)}
              </ul>
              {rows.length > FIRST_SHOWN ? (
                <button
                  type="button"
                  onClick={() => setShowAll(value => !value)}
                  aria-expanded={showAll}
                  className="tap-safe w-full rounded-full border border-[color:var(--paper-edge)] text-[14px] font-bold"
                >
                  {showAll ? "收起" : `還有 ${rows.length - FIRST_SHOWN} 個任務`}
                </button>
              ) : null}
            </>
          ) : eligibleOn ? (
            <EmptyBlock
              title={`Lv.${profile.level} 現在接得到的任務裡，沒有買齊就能交的`}
              hint="關掉「只看我接得到的」可以看全部。"
            />
          ) : (
            <EmptyBlock title="目前沒有買齊就能交的任務" hint={noFightOnly || region ? "換個地區、或關掉「前面也不用打怪」看看。" : undefined} />
          )}
        </>
      )}
    </PlanShell>
  );
}

function BuyCard({ row, onToggleDone }: { row: BuyQuestRow; onToggleDone: (id: string) => void }) {
  const { quest, pre, shops, shopNear, skills, rewards, chain, shopTotal, big } = row;
  // 楓幣是負的＝交任務要付錢，不是獎勵：獎勵那行只放正的，要付的寫在「要交的東西」底下
  const reward = rewardSummary(quest.exp, quest.money && quest.money > 0 ? quest.money : undefined, quest.pop);
  const pay = quest.money && quest.money < 0 ? -quest.money : 0;
  const needItems = (quest.needItems ?? []).map(item => ({ ...item, n: displayItemName(item) }));
  const sold = needItems.filter(item => shops.has(item.id));
  const oldData = sold.some(item => shops.get(item.id)?.o);
  // 量多的提醒：自己的道具有單項 200 個以上，或連前面一起做時合計有單項 200 個以上
  const bigAmount = big || Boolean(chain?.items.some(item => (item.c ?? 1) >= BIG_AMOUNT));
  const startNpc = quest.sNpc;
  // 回報的人跟接任務不同才多一格
  const endNpc = quest.eNpc && quest.eNpc.id !== startNpc?.id ? quest.eNpc : undefined;

  return (
    <li className="space-y-3 rounded-[var(--radius-card)] glass wood-frame p-4">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
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
        </div>
        <DoneButton id={quest.id} onToggle={onToggleDone} />
      </header>

      <section>
        <h3 className="mb-1.5 text-[13px] font-black">要交的東西</h3>
        <ItemChips rows={needItems} />
        {bigAmount ? <p className="mt-1.5 text-[12px] ink-soft">量多，拍賣可能要分幾次才買得齊</p> : null}
        {pay ? <p className="mt-1.5 text-[13px] font-bold">另外要付 {formatNumber(pay)} 楓幣</p> : null}
        {sold.length ? (
          <div className="mt-1.5 text-[12px] leading-relaxed ink-soft">
            <p>NPC 商店也買得到{oldData ? "（參考舊版資料，可能有出入）" : ""}</p>
            <ul className="space-y-0.5">
              {sold.map(item => (
                <li key={item.id}>
                  <span className="font-bold">{item.n}</span>：{shopLine(shops.get(item.id)!)}
                  {shopNear.has(item.id) ? <span className="whitespace-nowrap">，你的起點就有</span> : null}
                </li>
              ))}
            </ul>
            {shopTotal !== undefined ? (
              <p className="mt-0.5 font-bold text-[color:var(--ink)]">全部在 NPC 商店買：約 {formatNumber(shopTotal)} 楓幣</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {rewards.length || skills.length ? (
        <section>
          <h3 className="mb-1.5 text-[13px] font-black">完成後拿到</h3>
          {rewards.length ? <ItemChips rows={rewards} /> : null}
          {rewards.some(item => item.rand) ? (
            <p className="mt-1 text-[11px] ink-faint">標「隨機」的是從裡面隨機給一樣，不是全拿</p>
          ) : null}
          {skills.length ? (
            <p className="mt-1 text-[13px]">學會技能：<strong className="font-bold">{skills.join("、")}</strong></p>
          ) : null}
        </section>
      ) : null}

      {pre.length ? (
        <div className="space-y-1 text-[13px]">
          <p>
            <span className="ink-faint">要先做：</span>
            {pre.map((item, index) => (
              <span key={item.id}>
                {index > 0 ? "、" : ""}
                <Link href={`/db/quests?id=${item.id}`} className="font-bold hover:text-[color:var(--maple)]">{item.n}</Link>
              </span>
            ))}
          </p>
          {chain ? (
            <p className="text-[12px] leading-relaxed ink-soft">
              連前面一起做：共 {chain.steps} 段，合計經驗 <strong className="font-bold text-[color:var(--gold)]">{formatNumber(chain.exp)}</strong>
              <br />
              合計要交：{chain.items.map(item => `${item.n} ×${formatNumber(item.c ?? 1)}`).join("、")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={endNpc ? "grid gap-2 sm:grid-cols-2" : undefined}>
        {startNpc ? <NpcBox title="接任務" npc={startNpc} /> : null}
        {endNpc ? <NpcBox title="回報" npc={endNpc} /> : null}
      </div>
    </li>
  );
}

function NpcBox({ title, npc }: { title: string; npc: QuestNpc }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[color:var(--paper-deep)] p-2.5">
      <Image src={npcImage(npc.id)} alt="" width={32} height={32} className="size-8 object-contain" unoptimized />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] ink-faint">{title}</p>
        <p className="truncate font-bold">{npc.n}</p>
        {npc.mapName ? <p className="truncate text-[12px] ink-faint">{npc.mapName}</p> : null}
      </div>
      {npc.map ? <GoButton to={npc.map} label="路線" place={npcPlace(npc.n, npc.mapName, npc.mapName ?? "")} /> : null}
    </div>
  );
}
