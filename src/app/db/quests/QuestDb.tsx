"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Chip } from "@/components/route/bits";
import { DbBrowser, DetailCard, Section, type DbEntry } from "@/components/DbBrowser";
import { FilterTag } from "@/components/FilterTag";
import { GoButton } from "@/components/PlanShell";
import { QuestDetailBody } from "@/components/QuestDetailBody";
import {
  loadGuideCommon, loadMaps, loadMonsters, loadQuests, mapName, npcImage, peekGuideCommon, peekMaps, peekMonsters, peekQuests,
} from "@/lib/data";
import { setQuestDone, useDoneQuests } from "@/lib/done-quests";
import { rewardSummary } from "@/lib/format";
import { effectiveLevels } from "@/lib/now-plan";
import { isDevQuest, QUEST_BUCKET_LABEL } from "@/lib/planner";
import { useStoredProfile } from "@/lib/profile";
import { boardNote, compareListLevel, levelNote, listLevel, questBoard, type ListLevel } from "@/lib/quest-view";
import { useBeforeV002 } from "@/lib/release";
import { useRemembered } from "@/lib/remember";
import type { GuideCommon, MapRecord, Monster, Quest } from "@/lib/types";
import { isV002Map, isV002Quest } from "@/lib/v002";

export function QuestDb() {
  // 這次瀏覽載過就直接用，再進來第一個畫面就是完整清單
  const [quests, setQuests] = useState<Quest[] | null>(peekQuests);
  const [maps, setMaps] = useState<Record<string, MapRecord> | null>(peekMaps);
  // 沒寫需求等級的任務，要看怪物跟玩家攻略才推得出建議等級（跟首頁同一套 effectiveLevels）
  const [monsters, setMonsters] = useState<Monster[] | null>(peekMonsters);
  const [common, setCommon] = useState<GuideCommon | null>(peekGuideCommon);
  // 這兩樣載不到：清單照列，只是沒有建議等級（沒寫需求等級的小字寫分類、排最後）；任務、地圖載不到才整頁寫「資料載入失敗」
  const [suggestFailed, setSuggestFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useRemembered("db:任務:category", "");
  const [onlyEligible, setOnlyEligible] = useRemembered("db:任務:onlyEligible", false);
  const notOpenYet = useBeforeV002();
  // 角色列填了職業和等級才出現「只看我現在接得到的」：跟首頁同一套判斷（等級、等級上限、職業、楓之島）
  const { profile, isComplete } = useStoredProfile();
  const eligibleOn = onlyEligible && isComplete;
  // 做完的任務記在這台裝置的瀏覽器（任務卡的「我做完了」）。「接得到的」不再列做完的，卡片開著的那一筆例外，免得一按就跳走
  const done = useDoneQuests();
  const openId = useSearchParams().get("id");
  const keepId = eligibleOn ? openId : null;

  useEffect(() => {
    Promise.all([loadQuests(), loadMaps()])
      .then(([questData, mapData]) => {
        setQuests(questData);
        setMaps(mapData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
    Promise.all([loadMonsters(), loadGuideCommon()])
      .then(([monsterData, commonData]) => {
        setMonsters(monsterData);
        setCommon(commonData);
      })
      .catch(() => setSuggestFailed(true));
  }, []);

  // 建議等級用的資料載完（或載不到、放棄）才畫清單：第一個畫出來的清單就是最後的樣子，返回、重新整理回到原位時位置才對得上
  const loaded = Boolean(quests && maps) && (Boolean(monsters && common) || suggestFailed);

  const questIndex = useMemo(() => new Map((quests ?? []).map(quest => [quest.id, quest])), [quests]);
  const questNames = useMemo(() => new Map((quests ?? []).map(quest => [quest.id, quest.n])), [quests]);

  const effective = useMemo(
    () => (quests && monsters && common ? effectiveLevels(quests, monsters, common) : new Map<string, number>()),
    [quests, monsters, common],
  );
  /** 每個任務排序、寫小字用的等級（有需求等級用需求等級，沒寫的用建議等級）：載完算一次，排序時不用再算 */
  const levels = useMemo(
    () => new Map((quests ?? []).map((quest): [string, ListLevel] => [quest.id, listLevel(quest, effective)])),
    [quests, effective],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const quest of quests ?? []) if (quest.cat) set.add(quest.cat);
    return [...set].sort();
  }, [quests]);

  const entries = useMemo<DbEntry[]>(() => {
    if (!quests || !maps) return [];
    const levelOf = (quest: Quest) => levels.get(quest.id) ?? null;
    const inCategory = (quest: Quest) => !category || quest.cat === category;
    const entryOf = (quest: Quest, note: string, group?: string): DbEntry => {
      const opensLater = isV002Quest(quest, maps) && notOpenYet;
      const finished = done.has(quest.id);
      return {
        id: quest.id,
        name: quest.n,
        note,
        image: quest.sNpc ? npcImage(quest.sNpc.id) : undefined,
        keywords: `${quest.parent ?? ""} ${quest.sNpc?.n ?? ""}`,
        badge: opensLater || finished ? (
          <>
            {opensLater ? <Chip tone="gold">10/15 開放</Chip> : null}
            {finished ? <Chip tone="leaf">做完了</Chip> : null}
          </>
        ) : undefined,
        group,
      };
    };

    // 開發測試用的任務（9999）玩家接不到，哪個清單都不列
    const listed = quests.filter(quest => !isDevQuest(quest));
    if (eligibleOn) {
      // 前置任務在別的分類也算：整份清單交給 questBoard，分類只篩最後要列的那幾列
      return questBoard(listed, profile, done, keepId)
        .filter(row => inCategory(row.quest))
        .map(row =>
          entryOf(
            row.quest,
            // 做完的（卡片開著、先留著的那一筆）已經不是「要先做」「快接不到」，小字寫等級
            (done.has(row.quest.id) ? null : boardNote(row)) ?? levelNote(row.quest, levelOf(row.quest)),
            QUEST_BUCKET_LABEL[row.bucket].title,
          ),
        );
    }
    return listed
      .filter(inCategory)
      .sort((a, b) => compareListLevel(levelOf(a), levelOf(b)))
      .map(quest => entryOf(quest, levelNote(quest, levelOf(quest))));
  }, [quests, maps, levels, category, eligibleOn, profile, done, keepId, notOpenYet]);

  return (
    <DbBrowser
      title="任務"
      lead="每個任務的等級與職業條件、去找誰、要交什麼、完成拿多少。"
      entries={entries}
      loading={!loaded}
      // 每一種會改變列出哪些任務的篩選都要放進 resetKey（一般清單不看角色，所以等級、職業只在「接得到的」開著時才算）
      resetKey={`${loaded ? "loaded" : "loading"}|${category}|${eligibleOn ? `${profile.level}|${profile.job}` : "all"}`}
      error={error}
      filters={
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={event => setCategory(event.target.value)}
              className="tap-safe rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-[color:var(--maple)]"
              aria-label="任務分類"
            >
              <option value="">全部分類</option>
              {categories.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            {isComplete ? (
              <FilterTag on={onlyEligible} onClick={() => setOnlyEligible(!onlyEligible)}>只看我現在接得到的</FilterTag>
            ) : null}
          </div>
          {/* 前置任務做了沒，網站只知道在任務卡按過「我做完了」的；「我做完了」不拆行（手機上會斷成「我做完」「了」兩行） */}
          {eligibleOn ? (
            <p className="text-xs ink-faint">
              看等級、職業跟前置任務；做完的在任務卡按<span className="whitespace-nowrap">「我做完了」</span>，這裡就不再列
            </p>
          ) : null}
        </div>
      }
      renderDetail={id => {
        const quest = questIndex.get(id);
        if (!quest || !maps) return null;
        return <QuestDetail quest={quest} maps={maps} questNames={questNames} />;
      }}
    />
  );
}

function QuestDetail({
  quest,
  maps,
  questNames,
}: {
  quest: Quest;
  maps: Record<string, MapRecord>;
  questNames: Map<string, string>;
}) {
  const notOpenYet = useBeforeV002();
  const reward = rewardSummary(quest.exp, quest.money, quest.pop);

  return (
    <DetailCard>
      <header>
        <h2 className="text-2xl font-black leading-tight">
          {quest.n}
          {isV002Quest(quest, maps) && notOpenYet ? <span className="ml-1.5 align-middle"><Chip tone="gold">10/15 開放</Chip></span> : null}
        </h2>
        <p className="mt-1 text-sm ink-soft">
          {quest.cat}
          {quest.parent ? ` · ${quest.parent}` : ""}
          {quest.minLv ? ` · Lv.${quest.minLv}${quest.maxLv ? `–${quest.maxLv}` : "+"}` : ""}
          <span className="ml-2 text-xs ink-faint">#{quest.id}</span>
        </p>
        {reward ? <p className="mt-1 font-bold text-[color:var(--gold)]">{reward}</p> : null}
        <div className="mt-2">
          <DoneButton id={quest.id} />
        </div>
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        {quest.sNpc ? <NpcBlock title="接任務" npc={quest.sNpc} maps={maps} /> : null}
        {quest.eNpc ? <NpcBlock title="回報" npc={quest.eNpc} maps={maps} /> : null}
      </div>

      <QuestDetailBody quest={quest} maps={maps} questNames={questNames} />
    </DetailCard>
  );
}

/**
 * 「我做完了」：點一下記成做完了（記在這台裝置的瀏覽器），按鈕變楓葉綠底白字「做完了」，再點一下取消。
 * 大小跟篩選標籤（FilterTag）一樣，高 36px 的膠囊；只放在這一頁的任務卡，首頁用的 QuestDetailBody 不放。
 */
function DoneButton({ id }: { id: string }) {
  const done = useDoneQuests().has(id);
  return (
    <button
      type="button"
      aria-pressed={done}
      onClick={() => setQuestDone(id, !done)}
      className={[
        "inline-flex min-h-9 shrink-0 touch-manipulation items-center whitespace-nowrap rounded-full border px-[11px] text-[13px] font-bold transition-colors",
        done
          ? "border-[color:var(--leaf)] bg-[color:var(--leaf)] text-white"
          : "border-[color:var(--paper-edge)] bg-[color:var(--paper)] hover:bg-[color:var(--maple-wash)]",
      ].join(" ")}
    >
      {done ? "做完了" : "我做完了"}
    </button>
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
  const notOpenYet = useBeforeV002();
  return (
    <div className="rounded-xl bg-[color:var(--paper-deep)] p-3">
      <p className="text-[11px] ink-faint">{title}</p>
      <div className="mt-1 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={npcImage(npc.id)} alt="" width={32} height={32} className="size-8 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{npc.n}</p>
          {npc.map ? (
            <p className="flex min-w-0 items-center gap-1.5 text-[12px] ink-faint">
              <span className="min-w-0 truncate">{mapName(maps, npc.map)}</span>
              {isV002Map(maps[String(npc.map)]) && notOpenYet ? <Chip tone="gold">10/15 開放</Chip> : null}
            </p>
          ) : null}
        </div>
        {npc.map ? <GoButton to={npc.map} label="路線" /> : null}
      </div>
    </div>
  );
}
